"""Dependency container: one place that wires provider, embedder and RAG pipeline.

Routes receive it via FastAPI `Depends(get_container)`; tests override that
dependency with a container holding a scripted provider, so no model is needed.
"""
from __future__ import annotations

from dataclasses import dataclass

from fastapi import Request

from app.core.config import Settings
from app.providers.base import AIProvider, Embedder
from app.providers.factory import build_embedder, build_provider
from app.rag.pipeline import RAGPipeline
from app.rag.vector_store import build_vector_store


@dataclass
class Container:
    settings: Settings
    provider: AIProvider
    embedder: Embedder
    rag: RAGPipeline


def build_container(settings: Settings, provider: AIProvider | None = None, embedder: Embedder | None = None) -> Container:
    provider = provider or build_provider(settings)
    embedder = embedder or build_embedder(settings, provider)
    store = build_vector_store(settings.vector_store, settings.vector_db_path, embedder.embedding_id)
    rag = RAGPipeline(
        embedder,
        store,
        chunk_size=settings.chunk_size,
        chunk_overlap=settings.chunk_overlap,
        default_top_k=settings.rag_top_k,
        min_score=settings.rag_min_score,
    )
    return Container(settings=settings, provider=provider, embedder=embedder, rag=rag)


def get_container(request: Request) -> Container:
    return request.app.state.container
