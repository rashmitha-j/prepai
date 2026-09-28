"""Startup rebuild of the vector index from the markdown knowledge base."""
from __future__ import annotations

import asyncio

import pytest
from fastapi.testclient import TestClient

from app.core.container import build_container
from app.main import create_app
from app.providers.hashing_embedder import HashingEmbedder
from app.rag.bootstrap import bootstrap_index
from app.rag.pipeline import IngestDocument
from tests.conftest import KNOWLEDGE_DIR, make_settings
from tests.stub_provider import ScriptedProvider, unavailable

pytestmark = pytest.mark.skipif(not KNOWLEDGE_DIR.exists(), reason="knowledge base directory not found")


class FlakyEmbedder(HashingEmbedder):
    """Fails the first `failures` calls, like an embedding model that is still loading."""

    def __init__(self, failures: int):
        super().__init__(64)
        self.failures = failures

    async def embed(self, texts):
        if self.failures:
            self.failures -= 1
            raise unavailable()
        return await super().embed(texts)


def container(embedder=None):
    return build_container(make_settings(), provider=ScriptedProvider(), embedder=embedder or HashingEmbedder(64))


def test_rebuilds_an_empty_index():
    c = container()
    result = asyncio.run(bootstrap_index(c, str(KNOWLEDGE_DIR)))
    stats = c.rag.stats()
    assert result["ingested"] == stats["documents"] == 13
    assert stats["chunks"] == result["totalChunks"] > 100
    assert "kb-os" in stats["perDocument"]


def test_only_missing_documents_are_ingested_and_rerun_is_a_no_op():
    c = container()
    asyncio.run(bootstrap_index(c, str(KNOWLEDGE_DIR)))
    chunks = c.rag.stats()["chunks"]
    c.rag.store.delete_document("kb-os")
    assert asyncio.run(bootstrap_index(c, str(KNOWLEDGE_DIR)))["ingested"] == 1
    assert c.rag.stats()["chunks"] == chunks  # restored, no duplicates
    assert asyncio.run(bootstrap_index(c, str(KNOWLEDGE_DIR)))["ingested"] == 0


def test_retries_while_the_embedding_provider_is_unavailable():
    c = container(FlakyEmbedder(failures=2))
    result = asyncio.run(bootstrap_index(c, str(KNOWLEDGE_DIR), attempts=3, delay_seconds=0))
    assert result["ingested"] == 13


def test_gives_up_without_raising_when_the_provider_stays_down():
    c = container(FlakyEmbedder(failures=99))
    assert asyncio.run(bootstrap_index(c, str(KNOWLEDGE_DIR), attempts=2, delay_seconds=0)) is None
    assert c.rag.stats()["chunks"] == 0


class NetworkEmbedder(HashingEmbedder):
    """Yields like a real API call and counts every text it embeds."""

    def __init__(self):
        super().__init__(64)
        self.texts = 0

    async def embed(self, texts):
        self.texts += len(texts)
        await asyncio.sleep(0.005)
        return await super().embed(texts)


def test_concurrent_backend_sync_does_not_embed_everything_twice():
    # Recorded with Gemini's free tier: both startup paths embedded all 13 documents at once -> HTTP 429.
    from app.rag.loaders import load_directory

    embedder = NetworkEmbedder()
    c = container(embedder)
    docs = [IngestDocument(id=d.id, title=d.title, topic=d.topic, source=d.source, content=d.content)
            for d in load_directory(KNOWLEDGE_DIR)]

    async def backend_sync():  # what the backend's syncKnowledgeBase does: stats, then ingest what is missing
        present = c.rag.stats()["perDocument"]
        await c.rag.ingest([d for d in docs if d.id not in present])

    async def startup():
        await asyncio.gather(bootstrap_index(c, str(KNOWLEDGE_DIR)), backend_sync())

    asyncio.run(startup())
    stats = c.rag.stats()
    assert stats["documents"] == 13
    largest_doc = max(stats["perDocument"].values())
    # At most one document is embedded by both paths (the one in flight when the backend arrives).
    assert embedder.texts <= stats["chunks"] + largest_doc


def test_missing_or_disabled_directory_is_skipped(tmp_path):
    c = container()
    assert asyncio.run(bootstrap_index(c, str(tmp_path / "nope"))) is None
    assert asyncio.run(bootstrap_index(c, "")) is None
    assert c.rag.stats()["chunks"] == 0


def test_runs_at_app_startup_without_blocking_health():
    settings = make_settings(rag_bootstrap_dir=str(KNOWLEDGE_DIR))
    c = build_container(settings, provider=ScriptedProvider(), embedder=HashingEmbedder(64))
    with TestClient(create_app(settings, c)) as tc:
        assert tc.get("/health").status_code == 200
        task = tc.app.state.bootstrap_task
        tc.portal.call(asyncio.wait_for, asyncio.shield(task), 30)
        assert tc.get("/rag/stats").json()["documents"] == 13
