"""Builds the configured provider/embedder. The only place that knows concrete classes."""
from __future__ import annotations

from app.core.config import Settings
from app.providers.api_provider import APIProvider
from app.providers.base import AIProvider, Embedder
from app.providers.hashing_embedder import HashingEmbedder
from app.providers.ollama import OllamaProvider


def build_ollama(settings: Settings) -> OllamaProvider:
    return OllamaProvider(
        base_url=settings.ollama_base_url,
        model=settings.ollama_model,
        embedding_model=settings.ollama_embedding_model,
        timeout=settings.llm_timeout_seconds,
        temperature=settings.llm_temperature,
        max_output_tokens=settings.llm_max_output_tokens,
    )


def build_api(settings: Settings) -> APIProvider:
    return APIProvider(
        name=settings.ai_provider if settings.ai_provider != "ollama" else "openai_compatible",
        base_url=settings.api_base_url,
        api_key=settings.api_key,
        model=settings.api_model,
        embedding_model=settings.api_embedding_model,
        timeout=settings.llm_timeout_seconds,
        temperature=settings.llm_temperature,
        max_output_tokens=settings.llm_max_output_tokens,
        reasoning_effort=settings.api_reasoning_effort,
    )


def build_provider(settings: Settings) -> AIProvider:
    if settings.ai_provider == "ollama":
        return build_ollama(settings)
    return build_api(settings)


def build_embedder(settings: Settings, provider: AIProvider) -> Embedder:
    choice = settings.embedding_provider
    if choice == "hash":
        return HashingEmbedder(settings.hash_embedding_dim)
    if choice == "ollama":
        return provider if isinstance(provider, OllamaProvider) else build_ollama(settings)
    if choice == "api":
        if settings.embedding_api_provider:
            return build_api_embedder(settings)
        return provider if isinstance(provider, APIProvider) else build_api(settings)
    return provider  # auto


def build_api_embedder(settings: Settings) -> APIProvider:
    """Embedding-only API provider with its own vendor/key (EMBEDDING_API_*), falling back to API_*."""
    return APIProvider(
        name=settings.embedding_api_provider,
        base_url=settings.embedding_api_base_url,
        api_key=settings.embedding_api_key or settings.api_key,
        model="",
        embedding_model=settings.api_embedding_model,
        timeout=settings.llm_timeout_seconds,
    )
