"""OpenAI-compatible API provider.

One implementation covers every vendor that exposes the OpenAI Chat Completions
and Embeddings wire format: OpenAI, Google Gemini (OpenAI-compatible endpoint),
Groq, OpenRouter, Together, vLLM, LM Studio... Presets only supply a default base
URL; everything else comes from environment variables. Keys are never logged.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

from app.core.errors import ProviderResponseError, ProviderUnavailableError
from app.providers.base import AIProvider

logger = logging.getLogger("prepai.providers")

# Hosted APIs shed load with 5xx (e.g. Gemini's 503 "high demand"); these are retried with backoff.
# 429 is not retried: it is often a daily quota (Gemini free tier), where retrying only burns requests.
RETRYABLE_STATUS = frozenset({500, 502, 503, 504})

PRESET_BASE_URLS = {
    "openai": "https://api.openai.com/v1",
    "gemini": "https://generativelanguage.googleapis.com/v1beta/openai",
    "groq": "https://api.groq.com/openai/v1",
}


class APIProvider(AIProvider):
    def __init__(
        self,
        *,
        name: str,
        base_url: str,
        api_key: str,
        model: str,
        embedding_model: str = "",
        timeout: float = 120.0,
        temperature: float = 0.3,
        max_output_tokens: int = 1500,
        reasoning_effort: str = "",
        retry_delays: tuple[float, ...] = (2.0, 6.0),
        transport: httpx.AsyncBaseTransport | None = None,
    ):
        super().__init__(temperature=temperature, max_output_tokens=max_output_tokens)
        self.name = name
        self.base_url = (base_url or PRESET_BASE_URLS.get(name, "")).rstrip("/")
        self._api_key = api_key
        self._model = model
        self.embedding_model = embedding_model
        self.reasoning_effort = reasoning_effort
        self._retry_delays = retry_delays
        self._timeout = timeout
        self._transport = transport

    def __repr__(self) -> str:  # never include the key
        return f"APIProvider(name={self.name!r}, model={self._model!r})"

    @property
    def model(self) -> str:
        return self._model

    @property
    def embedding_id(self) -> str:
        return f"{self.name}:{self.embedding_model}"

    @property
    def embedding_only(self) -> bool:
        """Built by build_api_embedder: serves embeddings for another chat provider."""
        return not self._model and bool(self.embedding_model)

    def _config_problem(self, *, require_model: bool = True) -> str | None:
        if not self.base_url:
            return "API_BASE_URL is not configured."
        if not self._api_key:
            return "API_KEY is not configured."
        if require_model and not self._model:
            return "API_MODEL is not configured."
        return None

    async def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        headers = {"Authorization": f"Bearer {self._api_key}", "Content-Type": "application/json"}
        try:
            async with httpx.AsyncClient(
                base_url=self.base_url, timeout=self._timeout, transport=self._transport
            ) as client:
                for attempt, delay in enumerate((*self._retry_delays, None), start=1):
                    resp = await client.post(path, json=payload, headers=headers)
                    if resp.status_code not in RETRYABLE_STATUS or delay is None:
                        break
                    wait = _retry_after(resp, default=delay)
                    logger.info("%s API returned HTTP %s (attempt %s); retrying in %.1fs", self.name, resp.status_code, attempt, wait)
                    await asyncio.sleep(wait)
        except httpx.TimeoutException as exc:
            raise ProviderUnavailableError(f"{self.name} API timed out.") from exc
        except httpx.HTTPError as exc:
            raise ProviderUnavailableError(f"Cannot reach the {self.name} API.", detail=type(exc).__name__) from exc

        if resp.status_code in (401, 403):
            raise ProviderUnavailableError(f"{self.name} API rejected the credentials. Check API_KEY.")
        if resp.status_code == 429:
            raise ProviderUnavailableError(f"{self.name} API rate limit or quota exceeded. Try again later.")
        if resp.status_code == 404:
            raise ProviderUnavailableError(f"{self.name} API: model or endpoint not found. Check API_MODEL / API_BASE_URL.")
        if resp.status_code in (500, 502, 503, 504):
            # e.g. Gemini's 503 "model is currently experiencing high demand": transient, not bad output.
            raise ProviderUnavailableError(
                f"{self.name} API is temporarily unavailable (HTTP {resp.status_code}). Try again in a minute.",
                detail=resp.text[:300],
            )
        if resp.status_code >= 400:
            raise ProviderResponseError(f"{self.name} API returned HTTP {resp.status_code}.", detail=resp.text[:300])
        try:
            return resp.json()
        except ValueError as exc:
            raise ProviderResponseError(f"{self.name} API returned a non-JSON response.") from exc

    async def _chat(self, messages, *, json_mode, temperature, max_tokens) -> str:
        problem = self._config_problem()
        if problem:
            raise ProviderUnavailableError(f"AI provider '{self.name}' is misconfigured: {problem}")
        payload: dict[str, Any] = {
            "model": self._model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}
        if self.reasoning_effort:
            payload["reasoning_effort"] = self.reasoning_effort
        data = await self._post("/chat/completions", payload)
        try:
            content = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise ProviderResponseError(f"{self.name} API response had an unexpected shape.") from exc
        if not isinstance(content, str):
            raise ProviderResponseError(f"{self.name} API returned empty content.")
        return content

    async def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        if not self.embedding_model:
            raise ProviderUnavailableError(
                "API_EMBEDDING_MODEL is not configured. Set it, or use EMBEDDING_PROVIDER=ollama or hash."
            )
        problem = self._config_problem(require_model=False)
        if problem:
            raise ProviderUnavailableError(f"AI provider '{self.name}' is misconfigured: {problem}")
        data = await self._post("/embeddings", {"model": self.embedding_model, "input": texts})
        try:
            items = sorted(data["data"], key=lambda d: d.get("index", 0))
            vectors = [item["embedding"] for item in items]
        except (KeyError, TypeError) as exc:
            raise ProviderResponseError(f"{self.name} embedding response was malformed.") from exc
        if len(vectors) != len(texts):
            raise ProviderResponseError(f"{self.name} returned the wrong number of embeddings.")
        return vectors

    async def health_check(self) -> dict[str, Any]:
        info = {"provider": self.name, "model": self._model or None, "embeddingModel": self.embedding_model or None}
        problem = self._config_problem(require_model=not self.embedding_only)
        if problem:
            return {**info, "status": "unavailable", "detail": problem}
        try:
            async with httpx.AsyncClient(base_url=self.base_url, timeout=8.0, transport=self._transport) as client:
                resp = await client.get("/models", headers={"Authorization": f"Bearer {self._api_key}"})
        except httpx.HTTPError as exc:
            return {**info, "status": "unavailable", "detail": f"Cannot reach API: {type(exc).__name__}"}
        if resp.status_code in (401, 403):
            return {**info, "status": "unavailable", "detail": "Credentials rejected"}
        if resp.status_code >= 400:
            return {**info, "status": "degraded", "detail": f"/models returned HTTP {resp.status_code}"}
        return {**info, "status": "ok", "detail": None}


def _retry_after(resp: httpx.Response, *, default: float, cap: float = 20.0) -> float:
    """Honour a numeric Retry-After header (capped), otherwise use the default backoff."""
    try:
        return min(float(resp.headers.get("retry-after", "")), cap)
    except ValueError:
        return default
