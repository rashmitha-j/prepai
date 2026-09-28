"""RAG pipeline tests: cleaning, chunking, embeddings, vector stores, retrieval quality."""
import asyncio
import importlib.util

import pytest

from app.providers.hashing_embedder import HashingEmbedder
from app.rag.chunking import chunk_text
from app.rag.cleaning import clean_text, truncate
from app.rag.loaders import parse_frontmatter
from app.rag.pipeline import IngestDocument, RAGPipeline
from app.rag.vector_store import ChromaVectorStore, LocalVectorStore, collection_name_for

HAS_CHROMA = importlib.util.find_spec("chromadb") is not None


def run(coro):
    return asyncio.run(coro)


def cosine(a, b):
    return sum(x * y for x, y in zip(a, b, strict=True))


# ---------------------------------------------------------------- cleaning / chunking
def test_clean_text_normalises_noise():
    raw = "Hello\x00  world\r\n\r\n\r\n\r\nsee [docs](http://x.y) and hyph-\nenated"
    assert clean_text(raw) == "Hello world\n\nsee docs and hyphenated"


def test_truncate_on_word_boundary():
    out = truncate("alpha beta gamma delta", 12)
    assert out.startswith("alpha beta") and out.endswith("[truncated]")
    assert truncate("short", 100) == "short"


def test_frontmatter():
    meta, body = parse_frontmatter("---\ntitle: OS\ntopic: os\n---\n# Body")
    assert meta == {"title": "OS", "topic": "os"}
    assert body == "# Body"


def test_chunking_keeps_heading_path_and_size():
    text = "# OS\n\n## Deadlocks\n\n" + ("Deadlock needs four conditions. " * 60) + "\n\n## Paging\n\nPages map to frames."
    chunks = chunk_text(text, chunk_size=400, overlap=80)
    assert len(chunks) >= 4
    assert all(len(c.text) <= 400 + 80 + 2 for c in chunks)
    assert chunks[0].section == "OS > Deadlocks"
    assert chunks[-1].section == "OS > Paging"
    assert [c.index for c in chunks] == list(range(len(chunks)))


def test_chunk_overlap_carries_context():
    text = "## A\n\n" + "\n\n".join(f"Paragraph {i} " + "word " * 40 for i in range(6))
    chunks = chunk_text(text, chunk_size=300, overlap=60)
    assert len(chunks) > 1
    tail_words = chunks[0].text.split()[-3:]
    assert " ".join(tail_words) in chunks[1].text


def test_headings_inside_code_blocks_are_not_sections():
    text = "## Real\n\n```\n# not a heading\n```\nbody"
    assert {c.section for c in chunk_text(text)} == {"Real"}


# ---------------------------------------------------------------- embeddings
def test_hashing_embedder_is_deterministic_and_normalised():
    e = HashingEmbedder(128)
    a1, a2 = e.embed_one("Deadlock prevention with lock ordering"), e.embed_one("Deadlock prevention with lock ordering")
    assert a1 == a2
    assert abs(sum(x * x for x in a1) - 1.0) < 1e-9


def test_hashing_embedder_similarity_ranks_related_text_higher():
    e = HashingEmbedder(512)
    q = e.embed_one("what causes a deadlock between threads")
    related = e.embed_one("A deadlock occurs when threads wait on each other's locks in a circular wait")
    unrelated = e.embed_one("React components re-render when props or state change")
    assert cosine(q, related) > cosine(q, unrelated)


# ---------------------------------------------------------------- vector stores
def _store_contract(store):
    store.upsert(["d1::0", "d1::1", "d2::0"], [[1, 0, 0], [0.9, 0.1, 0], [0, 1, 0]], ["a", "b", "c"],
                 [{"docId": "d1", "topic": "os"}, {"docId": "d1", "topic": "os"}, {"docId": "d2", "topic": "dbms"}])
    assert store.count() == 3
    hits = store.query([1, 0, 0], 2)
    assert [h.id for h in hits] == ["d1::0", "d1::1"]
    assert hits[0].score == pytest.approx(1.0, abs=1e-3)
    assert [h.id for h in store.query([1, 0, 0], 5, where={"topic": "dbms"})] == ["d2::0"]
    assert len(store.query([1, 0, 0], 5, where={"topic": {"$in": ["os", "dbms"]}})) == 3
    store.upsert(["d1::0"], [[0, 0, 1]], ["a2"], [{"docId": "d1", "topic": "os"}])  # update in place
    assert store.count() == 3
    assert store.list_documents() == {"d1": 2, "d2": 1}
    assert store.delete_document("d1") == 2
    assert store.count() == 1


def test_local_store_contract():
    _store_contract(LocalVectorStore(None, "test"))


def test_local_store_persists(tmp_path):
    s = LocalVectorStore(str(tmp_path), "persist")
    s.upsert(["x::0"], [[1.0, 2.0]], ["t"], [{"docId": "x", "topic": "os"}])
    reloaded = LocalVectorStore(str(tmp_path), "persist")
    assert reloaded.count() == 1
    assert reloaded.query([1.0, 2.0], 1)[0].id == "x::0"


def test_local_store_rejects_dimension_mismatch():
    s = LocalVectorStore(None, "dim")
    s.upsert(["a"], [[1.0, 0.0]], ["t"], [{"docId": "a"}])
    with pytest.raises(ValueError):
        s.upsert(["b"], [[1.0, 0.0, 0.0]], ["t"], [{"docId": "b"}])


@pytest.mark.skipif(not HAS_CHROMA, reason="chromadb not installed")
def test_chroma_store_contract(tmp_path):
    _store_contract(ChromaVectorStore(str(tmp_path), "prepai_kb_test"))


def test_collection_name_isolated_per_embedding_model():
    assert collection_name_for("ollama:nomic-embed-text") != collection_name_for("hash:512")
    assert collection_name_for("ollama:nomic-embed-text").startswith("prepai_kb_")


# ---------------------------------------------------------------- pipeline
def make_pipeline():
    return RAGPipeline(HashingEmbedder(512), LocalVectorStore(None, "p"), chunk_size=600, chunk_overlap=100, min_score=0.0)


def test_ingest_replace_and_metadata():
    p = make_pipeline()
    doc = IngestDocument(id="kb-os", title="Operating Systems", topic="os", source="os.md",
                         content="# OS\n\n## Deadlocks\n\nMutual exclusion, hold and wait, no preemption, circular wait.")
    first = run(p.ingest([doc]))
    assert first["totalChunks"] == 1
    run(p.ingest([doc]))  # re-ingesting replaces rather than duplicates
    assert p.store.count() == 1
    chunk = run(p.retrieve("circular wait", top_k=1))[0]
    assert chunk.doc_id == "kb-os" and chunk.topic == "os" and chunk.section == "OS > Deadlocks"
    assert chunk.citation() == "Operating Systems › OS > Deadlocks"


def test_retrieve_topic_filter_and_exclusion():
    p = make_pipeline()
    run(p.ingest([
        IngestDocument("a", "OS", "os", "", "## Locks\n\nMutex locks protect critical sections from race conditions."),
        IngestDocument("b", "DB", "dbms", "", "## Locks\n\nDatabase locks: shared and exclusive locks in two-phase locking."),
    ]))
    only_db = run(p.retrieve("locks", topic="dbms"))
    assert {c.topic for c in only_db} == {"dbms"}
    first = run(p.retrieve("locks", top_k=1))[0]
    second = run(p.retrieve("locks", top_k=1, exclude_ids={first.id}))[0]
    assert second.id != first.id


def test_context_is_bounded_and_labelled():
    p = make_pipeline()
    run(p.ingest([IngestDocument("a", "Doc", "os", "", "## S\n\n" + "text " * 400)]))
    chunks = run(p.retrieve("text", top_k=4))
    context = p.build_context(chunks, max_chars=700)
    assert context.startswith("[S1] (Doc › S)")
    assert len(context) <= 720


def test_empty_query_returns_nothing():
    assert run(make_pipeline().retrieve("   ")) == []


# ---------------------------------------------------------------- retrieval quality eval over the real KB
RETRIEVAL_CASES = [
    ("What are the four necessary conditions for a deadlock?", "os"),
    ("How does a B+ tree index speed up database lookups?", "dbms"),
    ("Explain the TCP three-way handshake SYN ACK", "cn"),
    ("When does useEffect cleanup run in React?", "react"),
    ("Difference between RANK and DENSE_RANK window functions", "sql"),
    ("Explain the microtask queue and the event loop order of promises and setTimeout", "javascript"),
    ("What is the leftmost prefix and ESR rule for compound indexes in MongoDB?", "mongodb"),
    ("Liskov substitution principle example", "oop"),
    ("How does consistent hashing help with sharding and cache stampede?", "system-design"),
    ("Which HTTP status code for authenticated but forbidden and idempotency of PUT", "rest-api"),
    ("Kadane's algorithm maximum subarray sliding window two pointers", "dsa"),
    ("libuv thread pool and blocking the event loop in Express", "nodejs"),
    ("How should I structure an answer using the STAR method?", "behavioral"),
]


def test_retrieval_quality_on_knowledge_base(kb_documents):
    """Lexical-embedder baseline: the correct topic must appear in the top-3 for every case,
    and be ranked first for most. A semantic embedding model should do at least as well."""
    p = RAGPipeline(HashingEmbedder(1024), LocalVectorStore(None, "kb"), chunk_size=900, chunk_overlap=150, min_score=0.0)
    run(p.ingest([IngestDocument(d.id, d.title, d.topic, d.source, d.content) for d in kb_documents]))
    assert p.stats()["documents"] == len(kb_documents) >= 13

    top1 = 0
    for query, topic in RETRIEVAL_CASES:
        results = run(p.retrieve(query, top_k=3))
        topics = [c.topic for c in results]
        assert topic in topics, f"{query!r} -> {topics}"
        top1 += topics[0] == topic
    assert top1 / len(RETRIEVAL_CASES) >= 0.75
