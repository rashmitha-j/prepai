"""Ollama provider (local development default)."""
from __future__ import annotations

from typing import Any

import httpx

from app.core.errors import ProviderResponseError, ProviderUnavailableError
from app.providers.base import AIProvider


class OllamaProvider(AIProvider):
    name = "ollama"

    def __init__(
        self,
        *,
        base_url: str,
        model: str,
        embedding_model: str,
        timeout: float = 120.0,
        temperature: float = 0.3,
        max_output_tokens: int = 1500,
        transport: httpx.AsyncBaseTransport | None = None,
    ):
        super().__init__(temperature=temperature, max_output_tokens=max_output_tokens)
        self.base_url = base_url.rstrip("/")
        self._model = model
        self.embedding_model = embedding_model
        self._timeout = timeout
        self._transport = transport

    @property
    def model(self) -> str:
        return self._model

    @property
    def embedding_id(self) -> str:
        return f"ollama:{self.embedding_model}"

    def _client(self, timeout: float | None = None) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=self.base_url, timeout=timeout or self._timeout, transport=self._transport
        )

    def _require_model(self) -> None:
        if not self._model:
            raise ProviderUnavailableError(
                "No Ollama model configured. Set OLLAMA_MODEL (e.g. llama3.1:8b) and pull it with `ollama pull <model>`."
            )

    async def _post(self, path: str, payload: dict[str, Any], model_for_errors: str) -> dict[str, Any]:
        try:
            async with self._client() as client:
                resp = await client.post(path, json=payload)
        except httpx.ConnectError as exc:
            raise ProviderUnavailableError(
                f"Cannot reach Ollama at {self.base_url}. Is `ollama serve` running?", detail=str(exc)
            ) from exc
        except httpx.TimeoutException as exc:
            raise ProviderUnavailableError("Ollama timed out while generating a response.", detail=str(exc)) from exc
        except httpx.HTTPError as exc:
            raise ProviderUnavailableError("Error communicating with Ollama.", detail=str(exc)) from exc

        if resp.status_code == 404:
            raise ProviderUnavailableError(
                f"Ollama model '{model_for_errors}' is not available. Run `ollama pull {model_for_errors}`.",
                detail=resp.text[:300],
            )
        if resp.status_code >= 400:
            raise ProviderResponseError(f"Ollama returned HTTP {resp.status_code}.", detail=resp.text[:300])
        try:
            return resp.json()
        except ValueError as exc:
            raise ProviderResponseError("Ollama returned a non-JSON response.") from exc

    async def _chat(self, messages, *, json_mode, temperature, max_tokens) -> str:
        self._require_model()
        payload: dict[str, Any] = {
            "model": self._model,
            "messages": messages,
            "stream": False,
            "options": {"temperature": temperature, "num_predict": max_tokens},
        }
        if json_mode:
            payload["format"] = "json"
        data = await self._post("/api/chat", payload, self._model)
        content = (data.get("message") or {}).get("content")
        if not isinstance(content, str):
            raise ProviderResponseError("Ollama response did not contain message content.")
        return content

    async def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        data = await self._post("/api/embed", {"model": self.embedding_model, "input": texts}, self.embedding_model)
        vectors = data.get("embeddings")
        if not isinstance(vectors, list) or len(vectors) != len(texts):
            raise ProviderResponseError("Ollama embedding response was malformed.")
        return vectors

    async def health_check(self) -> dict[str, Any]:
        info: dict[str, Any] = {
            "provider": self.name,
            "baseUrl": self.base_url,
            "model": self._model or None,
            "embeddingModel": self.embedding_model,
        }
        try:
            async with self._client(timeout=5.0) as client:
                resp = await client.get("/api/tags")
            resp.raise_for_status()
            names = {m.get("name", "") for m in resp.json().get("models", [])}
        except (httpx.HTTPError, ValueError) as exc:
            return {**info, "status": "unavailable", "detail": f"Ollama not reachable at {self.base_url}: {type(exc).__name__}"}

        def present(model: str) -> bool:
            return bool(model) and (model in names or f"{model}:latest" in names)

        model_ok = present(self._model)
        embed_ok = present(self.embedding_model)
        status = "ok" if model_ok else "degraded"
        detail = None
        if not self._model:
            detail = "OLLAMA_MODEL is not set."
        elif not model_ok:
            detail = f"Model '{self._model}' not pulled. Run `ollama pull {self._model}`."
        return {**info, "status": status, "modelAvailable": model_ok, "embeddingModelAvailable": embed_ok, "detail": detail}
