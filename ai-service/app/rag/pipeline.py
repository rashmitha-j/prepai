"""RAG pipeline: ingest (clean → chunk → embed → store) and retrieve (embed → search → context)."""
from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass

from app.core.errors import RetrievalError
from app.providers.base import Embedder
from app.rag.chunking import chunk_text
from app.rag.cleaning import clean_text
from app.rag.vector_store import VectorStore

logger = logging.getLogger("prepai.rag")

EMBED_BATCH = 32


@dataclass
class IngestDocument:
    id: str
    title: str
    topic: str
    source: str
    content: str


@dataclass
class RetrievedChunk:
    id: str
    text: str
    score: float
    doc_id: str
    title: str
    topic: str
    source: str
    section: str
    chunk_index: int

    def citation(self) -> str:
        where = f"{self.title} › {self.section}" if self.section else self.title
        return where


def _strip_title(section: str, title: str) -> str:
    """'Operating Systems > Deadlocks' under a document titled 'Operating Systems' -> 'Deadlocks'."""
    if section == title:
        return ""
    prefix = f"{title} > "
    return section[len(prefix):] if section.startswith(prefix) else section


class RAGPipeline:
    def __init__(
        self,
        embedder: Embedder,
        store: VectorStore,
        *,
        chunk_size: int = 900,
        chunk_overlap: int = 150,
        default_top_k: int = 4,
        min_score: float = 0.05,
    ):
        self.embedder = embedder
        self.store = store
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.default_top_k = default_top_k
        self.min_score = min_score

    # ---------- ingestion ----------
    async def ingest(self, documents: list[IngestDocument], *, replace: bool = True) -> dict:
        results = []
        total_chunks = 0
        for doc in documents:
            text = clean_text(doc.content)
            chunks = chunk_text(text, chunk_size=self.chunk_size, overlap=self.chunk_overlap)
            if not chunks:
                results.append({"id": doc.id, "chunks": 0, "skipped": "empty document"})
                continue
            # Prefix the heading path so each chunk is self-describing for the embedder.
            embed_inputs = [f"{doc.title} — {c.section}\n{c.text}" if c.section else f"{doc.title}\n{c.text}" for c in chunks]
            vectors: list[list[float]] = []
            for i in range(0, len(embed_inputs), EMBED_BATCH):
                vectors.extend(await self.embedder.embed(embed_inputs[i : i + EMBED_BATCH]))

            if replace:
                self.store.delete_document(doc.id)
            content_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]
            sections = [_strip_title(c.section, doc.title) for c in chunks]
            ids = [f"{doc.id}::{c.index}" for c in chunks]
            metas = [
                {
                    "docId": doc.id,
                    "title": doc.title,
                    "topic": doc.topic,
                    "source": doc.source,
                    "section": sections[c.index],
                    "chunkIndex": c.index,
                    "contentHash": content_hash,
                    "embedding": self.embedder.embedding_id,
                }
                for c in chunks
            ]
            self.store.upsert(ids, vectors, [c.text for c in chunks], metas)
            total_chunks += len(chunks)
            results.append({"id": doc.id, "chunks": len(chunks), "contentHash": content_hash})
        logger.info("Ingested %s documents (%s chunks)", len(documents), total_chunks)
        return {"documents": results, "totalChunks": total_chunks, "embedding": self.embedder.embedding_id}

    # ---------- retrieval ----------
    async def retrieve(
        self,
        query: str,
        *,
        top_k: int | None = None,
        topic: str | None = None,
        topics: list[str] | None = None,
        exclude_ids: set[str] | None = None,
    ) -> list[RetrievedChunk]:
        """Top-k similarity search, optionally filtered by topic(s) and excluding already-used chunks."""
        query = clean_text(query)
        if not query:
            return []
        k = top_k or self.default_top_k
        wanted = [topic] if topic else (topics or [])
        where = None
        if len(wanted) == 1:
            where = {"topic": wanted[0]}
        elif len(wanted) > 1:
            where = {"topic": {"$in": wanted}}
        exclude_ids = exclude_ids or set()
        vector = (await self.embedder.embed([query]))[0]
        try:
            hits = self.store.query(vector, k + len(exclude_ids), where=where)
        except Exception as exc:  # vector-store failures should not leak internals
            raise RetrievalError("Knowledge retrieval failed", detail=str(exc)) from exc
        hits = [h for h in hits if h.id not in exclude_ids][:k]
        chunks = []
        for h in hits:
            if h.score < self.min_score:
                continue
            m = h.metadata
            chunks.append(
                RetrievedChunk(
                    id=h.id,
                    text=h.text,
                    score=round(h.score, 4),
                    doc_id=str(m.get("docId", "")),
                    title=str(m.get("title", "")),
                    topic=str(m.get("topic", "")),
                    source=str(m.get("source", "")),
                    section=str(m.get("section", "")),
                    chunk_index=int(m.get("chunkIndex", 0)),
                )
            )
        return chunks

    @staticmethod
    def build_context(chunks: list[RetrievedChunk], max_chars: int = 3500) -> str:
        """Numbered, source-labelled context block. Only top-k chunks — never the whole KB."""
        parts: list[str] = []
        used = 0
        for i, c in enumerate(chunks, start=1):
            block = f"[S{i}] ({c.citation()})\n{c.text}"
            if used + len(block) > max_chars:
                remaining = max_chars - used
                if remaining > 200:
                    parts.append(block[:remaining] + " …")
                break
            parts.append(block)
            used += len(block)
        return "\n\n".join(parts)

    def stats(self) -> dict:
        docs = self.store.list_documents()
        return {
            "store": self.store.kind,
            "embedding": self.embedder.embedding_id,
            "documents": len(docs),
            "chunks": self.store.count(),
            "perDocument": docs,
        }
