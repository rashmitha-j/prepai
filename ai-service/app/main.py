"""FastAPI entrypoint for the PrepAI AI service."""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.routes import health_router, router
from app.core.config import Settings, get_settings
from app.core.container import Container, build_container
from app.core.errors import register_exception_handlers
from app.rag.bootstrap import bootstrap_index


def _log_task_failure(task: asyncio.Task) -> None:
    if not task.cancelled() and task.exception() is not None:
        logging.getLogger("prepai.rag").error("RAG bootstrap failed: %s", task.exception())


def create_app(settings: Settings | None = None, container: Container | None = None) -> FastAPI:
    settings = settings or get_settings()
    logging.basicConfig(level=settings.log_level.upper(), format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    log = logging.getLogger("prepai")

    if settings.is_production and not settings.ai_service_token:
        raise RuntimeError("AI_SERVICE_TOKEN must be set in production so only the backend can call this service.")

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.container = container or build_container(settings)
        c = app.state.container
        log.info(
            "AI service ready: provider=%s model=%s embeddings=%s store=%s",
            c.provider.name, c.provider.model or "(unset)", c.embedder.embedding_id, c.rag.store.kind,
        )
        # Rebuild a missing/empty vector index in the background so /health answers immediately.
        task = asyncio.create_task(bootstrap_index(c, settings.rag_bootstrap_dir))
        task.add_done_callback(_log_task_failure)
        app.state.bootstrap_task = task
        yield
        task.cancel()

    app = FastAPI(
        title="PrepAI AI Service",
        version="1.0.0",
        description="LLM provider abstraction, RAG and interview intelligence for PrepAI.",
        lifespan=lifespan,
        docs_url=None if settings.is_production else "/docs",
        redoc_url=None,
        openapi_url=None if settings.is_production else "/openapi.json",
    )
    register_exception_handlers(app)
    app.include_router(health_router)
    app.include_router(router)
    return app


app = create_app()
