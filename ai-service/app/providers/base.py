"""Provider interface. Business logic depends only on this abstraction.

    AIProvider
      ├── generate()       free-form text
      ├── generate_json()  schema-validated structured output (with one repair retry)
      ├── embed()          vector embeddings for RAG
      └── health_check()   reachability + model availability

Concrete providers only implement the transport (`_chat`, `embed`, `health_check`).
Structured-output handling lives here so every provider gets identical validation.
"""
from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from typing import Any, TypeVar

from pydantic import BaseModel, ValidationError

from app.core.errors import AIOutputValidationError
from app.core.json_utils import JSONExtractionError, extract_json_object

logger = logging.getLogger("prepai.providers")

T = TypeVar("T", bound=BaseModel)

JSON_SYSTEM_SUFFIX = (
    "\n\nOutput rules: respond with a single JSON object only. No markdown, no code fences, "
    "no commentary, no hidden reasoning. Use exactly the keys requested."
)


class Embedder(ABC):
    """Anything that can turn texts into vectors."""

    @property
    @abstractmethod
    def embedding_id(self) -> str:
        """Stable identifier (provider + model). Vectors from different ids are incompatible."""

    @abstractmethod
    async def embed(self, texts: list[str]) -> list[list[float]]: ...

    async def health_check(self) -> dict[str, Any]:
        return {"status": "ok", "embedding": self.embedding_id}


class AIProvider(Embedder):
    name: str = "base"

    def __init__(self, *, temperature: float = 0.3, max_output_tokens: int = 1500):
        self.temperature = temperature
        self.max_output_tokens = max_output_tokens

    @property
    @abstractmethod
    def model(self) -> str: ...

    @abstractmethod
    async def _chat(
        self,
        messages: list[dict[str, str]],
        *,
        json_mode: bool,
        temperature: float,
        max_tokens: int,
    ) -> str:
        """Send chat messages to the model and return the raw text response."""

    @abstractmethod
    async def health_check(self) -> dict[str, Any]: ...

    async def generate(
        self,
        prompt: str,
        *,
        system: str | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> str:
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        return await self._chat(
            messages,
            json_mode=False,
            temperature=self.temperature if temperature is None else temperature,
            max_tokens=max_tokens or self.max_output_tokens,
        )

    async def generate_json(
        self,
        prompt: str,
        schema: type[T],
        *,
        system: str | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
        repair_attempts: int = 1,
    ) -> T:
        """Generate output and validate it against `schema`.

        Never trusts raw model JSON: it is extracted, parsed and validated with Pydantic.
        On failure the model gets one repair attempt that includes the validation errors.
        """
        system_prompt = (system or "You are a precise assistant.") + JSON_SYSTEM_SUFFIX
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt},
        ]
        temp = self.temperature if temperature is None else temperature
        tokens = max_tokens or self.max_output_tokens
        last_error = "unknown error"

        for attempt in range(repair_attempts + 1):
            raw = await self._chat(messages, json_mode=True, temperature=temp, max_tokens=tokens)
            try:
                data = extract_json_object(raw)
                return schema.model_validate(data)
            except (JSONExtractionError, ValidationError) as exc:
                last_error = _summarize_error(exc)
                logger.info("Structured output invalid (attempt %s): %s", attempt + 1, last_error)
                messages = messages + [
                    {"role": "assistant", "content": raw[:4000]},
                    {
                        "role": "user",
                        "content": (
                            "Your previous response was not valid for the required schema. "
                            f"Problems: {last_error}. Return ONLY the corrected JSON object."
                        ),
                    },
                ]
                temp = 0.0

        raise AIOutputValidationError(
            "The AI model returned output that did not match the expected format. Please try again.",
            detail=last_error,
        )


def _summarize_error(exc: Exception) -> str:
    if isinstance(exc, ValidationError):
        parts = []
        for err in exc.errors()[:6]:
            loc = ".".join(str(p) for p in err.get("loc", []))
            parts.append(f"{loc or 'root'}: {err.get('msg')}")
        return "; ".join(parts)
    return str(exc)
