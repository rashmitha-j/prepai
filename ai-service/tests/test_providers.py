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
                  embedding_model="embed-test", retry_delays=(0.0, 0.0), transport=httpx.MockTransport(handler))
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


async def test_api_provider_sends_reasoning_effort_only_when_configured():
    bodies = []

    def handler(request: httpx.Request):
        bodies.append(json.loads(request.content))
        return httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]})

    await api(handler, reasoning_effort="low").generate("hi")
    await api(handler).generate("hi")
    assert bodies[0]["reasoning_effort"] == "low"
    assert "reasoning_effort" not in bodies[1]


def test_reasoning_effort_setting_reaches_the_provider():
    s = Settings(_env_file=None, ai_provider="gemini", api_key="k", api_model="m", api_reasoning_effort="low")
    assert build_provider(s).reasoning_effort == "low"
    with pytest.raises(ValueError):
        Settings(_env_file=None, api_reasoning_effort="bogus-level")


async def test_api_provider_upstream_overload_is_unavailable_not_bad_output():
    # Recorded from Gemini: HTTP 503 "This model is currently experiencing high demand."
    calls = []

    def handler(request):
        calls.append(1)
        return httpx.Response(503, json={"error": {"code": 503, "status": "UNAVAILABLE"}})

    with pytest.raises(ProviderUnavailableError, match="temporarily unavailable"):
        await api(handler).generate("hi")
    assert len(calls) == 3  # first try + 2 retries


async def test_api_provider_retries_transient_errors_then_succeeds():
    replies = [httpx.Response(503, json={}), httpx.Response(502, json={}),
               httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]})]
    assert await api(lambda r: replies.pop(0)).generate("hi") == "ok"
    assert replies == []


async def test_api_provider_does_not_retry_client_errors():
    calls = []

    def handler(request):
        calls.append(1)
        return httpx.Response(400, json={"error": "bad request"})

    with pytest.raises(ProviderResponseError):
        await api(handler).generate("hi")
    assert len(calls) == 1


async def test_api_provider_does_not_retry_quota_exhaustion():
    # Recorded from Gemini's free tier: 429 GenerateRequestsPerDayPerProjectPerModel-FreeTier (limit 20/day).
    calls = []

    def handler(request):
        calls.append(1)
        return httpx.Response(429, json={"error": {"code": 429, "status": "RESOURCE_EXHAUSTED"}})

    with pytest.raises(ProviderUnavailableError, match="quota"):
        await api(handler).generate("hi")
    assert len(calls) == 1


def test_retry_after_header_is_honoured_and_capped():
    from app.providers.api_provider import _retry_after

    assert _retry_after(httpx.Response(503, headers={"retry-after": "3"}), default=2.0) == 3.0
    assert _retry_after(httpx.Response(503, headers={"retry-after": "3600"}), default=2.0) == 20.0
    assert _retry_after(httpx.Response(503), default=2.0) == 2.0


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


def test_chat_and_embeddings_can_use_different_api_vendors():
    # Groq has no embeddings endpoint: chat on Groq, embeddings on Gemini, each with its own key.
    s = Settings(_env_file=None, ai_provider="groq", api_key="groq-key", api_model="openai/gpt-oss-120b",
                 embedding_provider="api", embedding_api_provider="gemini", embedding_api_key="gemini-key",
                 api_embedding_model="gemini-embedding-2")
    chat = build_provider(s)
    emb = build_embedder(s, chat)
    assert (chat.name, chat.model, chat.base_url) == ("groq", "openai/gpt-oss-120b", "https://api.groq.com/openai/v1")
    assert emb is not chat and emb.embedding_only
    assert emb.base_url == "https://generativelanguage.googleapis.com/v1beta/openai"
    assert emb.embedding_id == "gemini:gemini-embedding-2"
    assert emb._api_key == "gemini-key" and chat._api_key == "groq-key"
    assert "gemini-key" not in repr(emb) and "groq-key" not in repr(chat)


def test_embedding_api_key_falls_back_to_api_key_and_empty_settings_change_nothing():
    s = Settings(_env_file=None, ai_provider="groq", api_key="shared", api_model="m",
                 embedding_provider="api", embedding_api_provider="openai", api_embedding_model="e")
    assert build_embedder(s, build_provider(s))._api_key == "shared"
    s = Settings(_env_file=None, ai_provider="openai", api_key="k", api_model="m", embedding_provider="api", api_embedding_model="e")
    chat = build_provider(s)
    assert build_embedder(s, chat) is chat  # unchanged behaviour without EMBEDDING_API_PROVIDER


async def test_embedding_only_provider_embeds_and_reports_healthy_without_a_chat_model():
    seen = {}

    def handler(request: httpx.Request):
        seen.setdefault("paths", []).append(request.url.path)
        seen["auth"] = request.headers["authorization"]
        if request.url.path.endswith("/models"):
            return httpx.Response(200, json={"data": []})
        return httpx.Response(200, json={"data": [{"index": 0, "embedding": [0.1, 0.2]}]})

    emb = api(handler, name="gemini", model="", embedding_model="gemini-embedding-2", api_key="gemini-key")
    assert await emb.embed(["hello"]) == [[0.1, 0.2]]
    assert (await emb.health_check())["status"] == "ok"
    assert seen["paths"][0] == "/v1beta/openai/embeddings" and seen["auth"] == "Bearer gemini-key"
