"""Vector store abstraction.

    VectorStore
      ├── ChromaVectorStore  (default; persistent, HNSW index, metadata filters)
      └── LocalVectorStore   (numpy brute-force cosine; persisted to disk or in-memory)

Both store vectors that WE computed (Chroma's built-in embedding function is
disabled) so the embedding model stays under the provider abstraction. Swapping in
Qdrant/Pinecone means implementing these five methods.

Each embedding model gets its own collection (see `collection_name_for`), because
vectors from different models live in different spaces and must never be mixed.
"""
from __future__ import annotations

import json
import logging
import re
import threading
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

logger = logging.getLogger("prepai.vector_store")


@dataclass
class StoredHit:
    id: str
    text: str
    score: float  # cosine similarity in [-1, 1]
    metadata: dict[str, Any]


def collection_name_for(embedding_id: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "_", embedding_id).strip("_").lower()
    return f"prepai_kb_{slug}"[:60]


def _meta_matches(actual: Any, condition: Any) -> bool:
    """Supports the subset of Chroma's filter syntax we use: equality and {"$in": [...]}."""
    if isinstance(condition, dict) and "$in" in condition:
        return actual in condition["$in"]
    return actual == condition


class VectorStore(ABC):
    kind: str = "abstract"

    @abstractmethod
    def upsert(self, ids: list[str], embeddings: list[list[float]], texts: list[str], metadatas: list[dict]) -> None: ...

    @abstractmethod
    def query(self, embedding: list[float], top_k: int, where: dict[str, Any] | None = None) -> list[StoredHit]: ...

    @abstractmethod
    def delete_document(self, doc_id: str) -> int: ...

    @abstractmethod
    def count(self) -> int: ...

    @abstractmethod
    def list_documents(self) -> dict[str, int]:
        """doc_id -> chunk count"""

    def reset(self) -> None:
        for doc_id in list(self.list_documents()):
            self.delete_document(doc_id)


class LocalVectorStore(VectorStore):
    kind = "local"

    def __init__(self, path: str | None, collection: str):
        self._lock = threading.Lock()
        self._file = Path(path) / f"{collection}.json" if path else None
        self._ids: list[str] = []
        self._texts: list[str] = []
        self._metas: list[dict] = []
        self._matrix = np.zeros((0, 0), dtype=np.float32)
        if self._file and self._file.exists():
            self._load()

    def _load(self) -> None:
        data = json.loads(self._file.read_text(encoding="utf-8"))
        self._ids, self._texts, self._metas = data["ids"], data["texts"], data["metadatas"]
        self._matrix = np.asarray(data["embeddings"], dtype=np.float32) if self._ids else np.zeros((0, 0), np.float32)

    def _persist(self) -> None:
        if not self._file:
            return
        self._file.parent.mkdir(parents=True, exist_ok=True)
        tmp = self._file.with_suffix(".tmp")
        payload = {
            "ids": self._ids,
            "texts": self._texts,
            "metadatas": self._metas,
            "embeddings": self._matrix.round(6).tolist(),
        }
        tmp.write_text(json.dumps(payload), encoding="utf-8")
        tmp.replace(self._file)

    @staticmethod
    def _normalize(m: np.ndarray) -> np.ndarray:
        norms = np.linalg.norm(m, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        return m / norms

    def upsert(self, ids, embeddings, texts, metadatas):
        if not ids:
            return
        new = self._normalize(np.asarray(embeddings, dtype=np.float32))
        with self._lock:
            if self._matrix.size and new.shape[1] != self._matrix.shape[1]:
                raise ValueError("Embedding dimension mismatch with existing collection")
            index = {id_: i for i, id_ in enumerate(self._ids)}
            rows = [] if not self._matrix.size else list(self._matrix)
            for id_, vec, text, meta in zip(ids, new, texts, metadatas, strict=True):
                if id_ in index:
                    i = index[id_]
                    rows[i], self._texts[i], self._metas[i] = vec, text, meta
                else:
                    index[id_] = len(self._ids)
                    self._ids.append(id_)
                    self._texts.append(text)
                    self._metas.append(meta)
                    rows.append(vec)
            self._matrix = np.vstack(rows).astype(np.float32)
            self._persist()

    def query(self, embedding, top_k, where=None):
        with self._lock:
            if not self._ids:
                return []
            q = np.asarray(embedding, dtype=np.float32)
            norm = np.linalg.norm(q)
            if norm == 0:
                return []
            scores = self._matrix @ (q / norm)
            candidates = [
                i for i in range(len(self._ids))
                if not where or all(_meta_matches(self._metas[i].get(k), v) for k, v in where.items())
            ]
            candidates.sort(key=lambda i: float(scores[i]), reverse=True)
            return [
                StoredHit(self._ids[i], self._texts[i], float(scores[i]), dict(self._metas[i]))
                for i in candidates[:top_k]
            ]

    def delete_document(self, doc_id):
        with self._lock:
            keep = [i for i, m in enumerate(self._metas) if m.get("docId") != doc_id]
            removed = len(self._ids) - len(keep)
            if removed:
                self._ids = [self._ids[i] for i in keep]
                self._texts = [self._texts[i] for i in keep]
                self._metas = [self._metas[i] for i in keep]
                self._matrix = self._matrix[keep] if keep else np.zeros((0, 0), np.float32)
                self._persist()
            return removed

    def count(self):
        return len(self._ids)

    def list_documents(self):
        counts: dict[str, int] = {}
        for m in self._metas:
            counts[m.get("docId", "?")] = counts.get(m.get("docId", "?"), 0) + 1
        return counts


class ChromaVectorStore(VectorStore):
    kind = "chroma"

    def __init__(self, path: str, collection: str):
        import chromadb
        from chromadb.config import Settings as ChromaSettings

        Path(path).mkdir(parents=True, exist_ok=True)
        self._client = chromadb.PersistentClient(path=path, settings=ChromaSettings(anonymized_telemetry=False))
        self._collection = self._client.get_or_create_collection(
            name=collection, metadata={"hnsw:space": "cosine"}, embedding_function=None
        )

    def upsert(self, ids, embeddings, texts, metadatas):
        if ids:
            self._collection.upsert(ids=ids, embeddings=embeddings, documents=texts, metadatas=metadatas)

    def query(self, embedding, top_k, where=None):
        total = self._collection.count()
        if total == 0:
            return []
        res = self._collection.query(
            query_embeddings=[embedding],
            n_results=min(top_k, total),
            where=where or None,
            include=["documents", "metadatas", "distances"],
        )
        hits = []
        for id_, doc, meta, dist in zip(
            res["ids"][0], res["documents"][0], res["metadatas"][0], res["distances"][0], strict=True
        ):
            hits.append(StoredHit(id_, doc, 1.0 - float(dist), dict(meta or {})))
        return hits

    def delete_document(self, doc_id):
        existing = self._collection.get(where={"docId": doc_id}, include=[])
        ids = existing.get("ids", [])
        if ids:
            self._collection.delete(ids=ids)
        return len(ids)

    def count(self):
        return self._collection.count()

    def list_documents(self):
        counts: dict[str, int] = {}
        data = self._collection.get(include=["metadatas"])
        for meta in data.get("metadatas") or []:
            doc_id = (meta or {}).get("docId", "?")
            counts[doc_id] = counts.get(doc_id, 0) + 1
        return counts


def build_vector_store(kind: str, path: str | None, embedding_id: str) -> VectorStore:
    collection = collection_name_for(embedding_id)
    if kind == "chroma":
        try:
            return ChromaVectorStore(path or "./data/vector_db", collection)
        except ImportError:
            logger.warning("chromadb is not installed; falling back to LocalVectorStore")
    return LocalVectorStore(path, collection)
