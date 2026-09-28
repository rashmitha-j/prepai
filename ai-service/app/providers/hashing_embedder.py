"""Deterministic local embedder based on feature hashing.

This is NOT a neural embedding model. It maps words, light stems and word bigrams
into a fixed-size signed hash space (the "hashing trick"), applies sublinear TF
weighting and L2-normalises the result. Cosine similarity then approximates
lexical overlap.

Why it exists:
  * tests and CI run without any model download,
  * RAG keeps working (lexically) when no embedding model is installed,
  * it demonstrates what embeddings are without hiding behind a library.

Semantic models (e.g. `nomic-embed-text` via Ollama) should be preferred when available.
"""
from __future__ import annotations

import hashlib
import math
import re

from app.providers.base import Embedder

_TOKEN_RE = re.compile(r"[a-z0-9][a-z0-9+#.]*")
_STOPWORDS = frozenset(
    "a an and are as at be by for from has have how i in is it its of on or that the this to was what when "
    "where which who why will with you your can do does not we they them their our us "
    # question words that carry little topical signal in interview queries
    "explain describe difference between example examples e.g such also use used using into more most "
    "should would could about than then there these those".split()
)
_SUFFIXES = ("ations", "ation", "ings", "ing", "ies", "es", "ed", "ly", "s")


def _stem(token: str) -> str:
    for suffix in _SUFFIXES:
        if len(token) > len(suffix) + 3 and token.endswith(suffix):
            return token[: -len(suffix)]
    return token


def tokenize(text: str) -> list[str]:
    tokens = [t.strip(".") for t in _TOKEN_RE.findall(text.lower())]
    return [_stem(t) for t in tokens if t and t not in _STOPWORDS]


class HashingEmbedder(Embedder):
    def __init__(self, dim: int = 512):
        if dim < 32:
            raise ValueError("dim must be >= 32")
        self.dim = dim

    @property
    def embedding_id(self) -> str:
        return f"hash:{self.dim}"

    def _index(self, feature: str) -> tuple[int, float]:
        digest = hashlib.blake2b(feature.encode("utf-8"), digest_size=8).digest()
        value = int.from_bytes(digest, "little")
        return value % self.dim, (1.0 if (value >> 63) & 1 else -1.0)

    def embed_one(self, text: str) -> list[float]:
        tokens = tokenize(text)
        counts: dict[str, int] = {}
        for tok in tokens:
            counts[tok] = counts.get(tok, 0) + 1
        for a, b in zip(tokens, tokens[1:], strict=False):
            key = f"{a}_{b}"
            counts[key] = counts.get(key, 0) + 1

        vec = [0.0] * self.dim
        for feature, count in counts.items():
            idx, sign = self._index(feature)
            weight = 1.0 + math.log(count)
            if "_" in feature:
                weight *= 0.5  # bigrams add context but should not dominate
            vec[idx] += sign * weight
        norm = math.sqrt(sum(v * v for v in vec))
        return [v / norm for v in vec] if norm else vec

    async def embed(self, texts: list[str]) -> list[list[float]]:
        return [self.embed_one(t) for t in texts]

    async def health_check(self):
        return {"status": "ok", "embedding": self.embedding_id, "detail": "Local lexical hashing embedder (no model)"}
