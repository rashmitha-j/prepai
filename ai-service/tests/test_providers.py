"""Provider abstraction tests using httpx.MockTransport — no Ollama or network required."""
import json

import httpx
import pytest

from app.core.config import Settings
from app.core.errors import AIOutputValidationError, ProviderResponseError, ProviderUnavailableError
from app.models.schemas import GeneratedQuestionLLM
from app.providers.api_provider import APIProvider
from app.providers.factory import build_embedder, build_provider
from app.providers.hashing_embedder import HashingEmbedder
from app.providers.ollama import OllamaProvider
from tests.stub_provider import ScriptedProvider

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend():
    return "asyncio"


def ollama(handler, model="llama3.1:8b"):
    return OllamaProvider(base_url="http://ollama.test", model=model, embedding_model="nomic-embed-text",
                          transport=httpx.MockTransport(handler))


async def test_ollama_generate_json_sends_format_and_validates():
    seen = {}

    def handler(request: httpx.Request):
        body = json.loads(request.content)
        seen.update(body)
        content = json.dumps({"question": "What is a race condition?", "topic": "Concurrency", "expectedPoints": ["shared state"]})
        return httpx.Response(200, json={"message": {"role": "assistant", "content": content}})

    result = await ollama(handler).generate_json("ask", GeneratedQuestionLLM)
    assert result.topic == "Concurrency"
    assert seen["format"] == "json"
    assert seen["stream"] is False
    assert seen["messages"][0]["role"] == "system"


async def test_ollama_unreachable_raises_provider_unavailable():
    def handler(request):
        raise httpx.ConnectError("connection refused")

    with pytest.raises(ProviderUnavailableError) as exc:
        await ollama(handler).generate("hi")
    assert "ollama serve" in exc.value.message


async def test_ollama_missing_model_is_actionable():
    with pytest.raises(ProviderUnavailableError) as exc:
        await ollama(lambda r: httpx.Response(404, json={"error": "model not found"})).generate("hi")
    assert "ollama pull llama3.1:8b" in exc.value.message


async def test_ollama_no_model_configured():
    with pytest.raises(ProviderUnavailableError, match="OLLAMA_MODEL"):
        await ollama(lambda r: httpx.Response(200), model="").generate("hi")


async def test_ollama_server_error_is_provider_error():
    with pytest.raises(ProviderResponseError):
        await ollama(lambda r: httpx.Response(500, text="boom")).generate("hi")


async def test_ollama_embed():
    def handler(request):
        body = json.loads(request.content)
        assert request.url.path == "/api/embed"
        return httpx.Response(200, json={"embeddings": [[0.1, 0.2]] * len(body["input"])})

    vectors = await ollama(handler).embed(["a", "b"])
    assert vectors == [[0.1, 0.2], [0.1, 0.2]]


async def test_ollama_health_reports_missing_model():
    handler = lambda r: httpx.Response(200, json={"models": [{"name": "nomic-embed-text:latest"}]})  # noqa: E731
    health = await ollama(handler).health_check()
    assert health["status"] == "degraded"
    assert health["modelAvailable"] is False
    assert health["embeddingModelAvailable"] is True


async def test_ollama_health_unreachable():
    def handler(request):
        raise httpx.ConnectError("refused")

    assert (await ollama(handler).health_check())["status"] == "unavailable"


def api(handler, **kw):
    params = dict(name="openai", base_url="", api_key="dummy-test-key", model="gpt-test",
                  embedding_model="embed-test", transport=httpx.MockTransport(handler))
    params.update(kw)
    return APIProvider(**params)


async def test_api_provider_uses_preset_and_json_mode():
    seen = {}

    def handler(request: httpx.Request):
        seen["url"] = str(request.url)
        seen["auth"] = request.headers["authorization"]
        seen["body"] = json.loads(request.content)
        content = json.dumps({"question": "Explain REST idempotency.", "topic": "REST"})
        return httpx.Response(200, json={"choices": [{"message": {"content": content}}]})

    q = await api(handler).generate_json("ask", GeneratedQuestionLLM)
    assert q.topic == "REST"
    assert seen["url"] == "https://api.openai.com/v1/chat/completions"
    assert seen["body"]["response_format"] == {"type": "json_object"}
    assert seen["auth"].startswith("Bearer ")


async def test_api_provider_auth_error_does_not_leak_key():
    provider = api(lambda r: httpx.Response(401, json={"error": "bad key"}))
    with pytest.raises(ProviderUnavailableError) as exc:
        await provider.generate("hi")
    assert "dummy-test-key" not in exc.value.message
    assert "dummy-test-key" not in repr(provider)


async def test_api_provider_rate_limit():
    with pytest.raises(ProviderUnavailableError, match="rate limit"):
        await api(lambda r: httpx.Response(429)).generate("hi")


async def test_api_provider_misconfigured():
    with pytest.raises(ProviderUnavailableError, match="API_KEY"):
        await api(lambda r: httpx.Response(200), api_key="").generate("hi")
    health = await api(lambda r: httpx.Response(200), api_key="").health_check()
    assert health["status"] == "unavailable"


async def test_api_provider_embeddings_sorted_by_index():
    def handler(request):
        return httpx.Response(200, json={"data": [{"index": 1, "embedding": [2.0]}, {"index": 0, "embedding": [1.0]}]})

    assert await api(handler).embed(["a", "b"]) == [[1.0], [2.0]]


async def test_generate_json_repairs_once():
    provider = ScriptedProvider()
    provider.queue = ["Sorry, here you go: {not json", json.dumps({"question": "What is virtual memory?", "topic": "OS"})]
    q = await provider.generate_json("ask", GeneratedQuestionLLM)
    assert q.topic == "OS"
    assert len(provider.calls) == 2
    repair_msg = provider.calls[1]["messages"][-1]["content"]
    assert "not valid" in repair_msg
    assert provider.calls[1]["temperature"] == 0.0


async def test_generate_json_gives_up_after_repair():
    provider = ScriptedProvider()
    provider.queue = ['{"question": "short"}', '{"topic": "still no question"}']
    with pytest.raises(AIOutputValidationError):
        await provider.generate_json("ask", GeneratedQuestionLLM)


def test_factory_selects_provider_from_environment():
    s = Settings(_env_file=None, ai_provider="ollama", ollama_model="m")
    assert isinstance(build_provider(s), OllamaProvider)
    s = Settings(_env_file=None, ai_provider="gemini", api_key="k", api_model="gemini-2.0-flash")
    p = build_provider(s)
    assert isinstance(p, APIProvider)
    assert p.base_url.startswith("https://generativelanguage.googleapis.com")
    s = Settings(_env_file=None, ai_provider="openai_compatible", api_base_url="http://localhost:1234/v1/", api_key="k", api_model="m")
    assert build_provider(s).base_url == "http://localhost:1234/v1"


def test_factory_embedder_selection():
    s = Settings(_env_file=None, ai_provider="gemini", embedding_provider="hash")
    assert isinstance(build_embedder(s, build_provider(s)), HashingEmbedder)
    s = Settings(_env_file=None, ai_provider="gemini", embedding_provider="ollama")
    assert isinstance(build_embedder(s, build_provider(s)), OllamaProvider)
    s = Settings(_env_file=None, ai_provider="ollama")
    p = build_provider(s)
    assert build_embedder(s, p) is p
