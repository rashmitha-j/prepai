"""Rebuild the vector index at startup when it is missing knowledge-base documents.

The vector DB lives on local disk and is not committed, so a fresh deploy, a wiped disk
(e.g. a restarted Render instance) or a new embedding model starts with an empty index.
The backend re-syncs from MongoDB only when *it* starts; this covers the AI service
restarting on its own. Only documents missing from the index are embedded, and ingestion
is idempotent (deterministic chunk ids), so running alongside the backend's sync is safe.
"""
from __future__ import annotations

import asyncio
import logging
from pathlib import Path

from app.core.container import Container
from app.core.errors import AIServiceError
from app.rag.loaders import load_directory
from app.rag.pipeline import IngestDocument

logger = logging.getLogger("prepai.rag")


async def bootstrap_index(c: Container, directory: str, *, attempts: int = 5, delay_seconds: float = 15.0) -> dict | None:
    """Ingest documents from `directory` that are not in the index yet. Never raises."""
    if not directory:
        return None
    path = Path(directory)
    if not path.is_dir():
        logger.warning("RAG bootstrap skipped: knowledge directory %s not found (set RAG_BOOTSTRAP_DIR)", path.resolve())
        return None
    try:
        docs = load_directory(path)
    except (OSError, ValueError) as exc:
        logger.warning("RAG bootstrap skipped: could not read %s (%s)", path, exc)
        return None

    if not any(d.id not in c.rag.stats()["perDocument"] for d in docs):
        logger.info("RAG bootstrap: index up to date (%s documents)", len(docs))
        return {"ingested": 0, "totalChunks": 0}

    ingested = chunks = 0
    for attempt in range(1, attempts + 1):
        try:
            # One document at a time with skip_existing (checked under the ingest lock): documents the
            # backend's startup sync indexes in the meantime are skipped instead of being embedded twice.
            for d in docs:
                result = await c.rag.ingest(
                    [IngestDocument(id=d.id, title=d.title, topic=d.topic, source=d.source, content=d.content)],
                    skip_existing=True,
                )
                ingested += len(result["documents"])
                chunks += result["totalChunks"]
        except AIServiceError as exc:
            # Typically the embedding provider is still starting or rate limited; retry with backoff.
            if attempt == attempts:
                logger.warning("RAG bootstrap gave up after %s attempts: %s", attempts, exc.message)
                return None
            logger.info("RAG bootstrap attempt %s failed (%s); retrying", attempt, exc.message)
            await asyncio.sleep(delay_seconds * attempt)
            continue
        logger.info("RAG bootstrap: indexed %s document(s), %s chunks", ingested, chunks)
        return {"ingested": ingested, "totalChunks": chunks}
    return None
