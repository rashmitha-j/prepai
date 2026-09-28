"""Application settings loaded from environment variables (never hard-coded)."""
from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ProviderName = Literal["ollama", "openai", "gemini", "groq", "openai_compatible"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    environment: Literal["development", "test", "production"] = "development"
    port: int = 8000
    log_level: str = "INFO"

    # Shared secret the Node backend sends in X-Internal-Token. Required in production.
    ai_service_token: str | None = None

    # ----- LLM provider -----
    ai_provider: ProviderName = "ollama"
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = ""
    ollama_embedding_model: str = "nomic-embed-text"

    # OpenAI-compatible API providers (OpenAI, Gemini's OpenAI endpoint, Groq, OpenRouter...)
    api_base_url: str = ""
    api_key: str = Field(default="", repr=False)
    api_model: str = ""
    api_embedding_model: str = ""
    # Sent as `reasoning_effort` on chat calls (Gemini: thinking level). Empty = provider default.
    api_reasoning_effort: Literal["", "none", "minimal", "low", "medium", "high"] = ""

    llm_temperature: float = 0.3
    llm_timeout_seconds: float = 120.0
    llm_max_output_tokens: int = 1500
    max_input_chars: int = 14000

    # ----- Embeddings -----
    # auto   -> use the configured LLM provider's embedding endpoint
    # ollama -> Ollama embeddings even if an API provider is used for generation
    # api    -> API provider embeddings
    # hash   -> deterministic local feature-hashing embedder (no model, lexical only)
    embedding_provider: Literal["auto", "ollama", "api", "hash"] = "auto"
    # With EMBEDDING_PROVIDER=api, embeddings can use a different API vendor than chat
    # (e.g. Groq for chat, which has no embeddings endpoint, + Gemini for embeddings).
    # Empty = same vendor/key/base URL as the chat provider. The model is API_EMBEDDING_MODEL.
    embedding_api_provider: Literal["", "openai", "gemini", "groq", "openai_compatible"] = ""
    embedding_api_key: str = Field(default="", repr=False)
    embedding_api_base_url: str = ""
    hash_embedding_dim: int = 512

    # ----- RAG / vector store -----
    vector_store: Literal["chroma", "local"] = "chroma"
    vector_db_path: str = "./data/vector_db"
    rag_top_k: int = 4
    rag_min_score: float = 0.05
    chunk_size: int = 900
    chunk_overlap: int = 150
    rag_context_chars: int = 3500
    # Markdown knowledge base ingested at startup when the index is missing documents
    # (fresh deploy, wiped disk, new embedding model). Relative to the working directory; "" disables.
    rag_bootstrap_dir: str = "../backend/src/seed/knowledge"

    @field_validator("ollama_base_url", "api_base_url", "embedding_api_base_url")
    @classmethod
    def strip_trailing_slash(cls, v: str) -> str:
        return v.rstrip("/")

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
