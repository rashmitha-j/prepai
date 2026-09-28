"""Command-line ingestion, useful for building the index without the Node backend.

    python -m app.rag.cli ingest ../backend/src/seed/knowledge
    python -m app.rag.cli search "how does a deadlock happen" --topic os
    python -m app.rag.cli stats
"""
from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

from app.core.config import get_settings
from app.core.container import build_container
from app.rag.loaders import load_directory
from app.rag.pipeline import IngestDocument


async def _main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="prepai-rag")
    sub = parser.add_subparsers(dest="cmd", required=True)
    ing = sub.add_parser("ingest")
    ing.add_argument("directory", type=Path)
    srch = sub.add_parser("search")
    srch.add_argument("query")
    srch.add_argument("--topic")
    srch.add_argument("-k", type=int, default=4)
    sub.add_parser("stats")
    args = parser.parse_args(argv)

    c = build_container(get_settings())
    if args.cmd == "ingest":
        docs = [
            IngestDocument(id=d.id, title=d.title, topic=d.topic, source=d.source, content=d.content)
            for d in load_directory(args.directory)
        ]
        result = await c.rag.ingest(docs)
        print(f"Ingested {len(docs)} documents, {result['totalChunks']} chunks using {result['embedding']}")
    elif args.cmd == "search":
        for ch in await c.rag.retrieve(args.query, top_k=args.k, topic=args.topic):
            print(f"{ch.score:.3f}  {ch.citation()}\n    {ch.text[:160].replace(chr(10), ' ')}…")
    else:
        stats = c.rag.stats()
        print(f"store={stats['store']} embedding={stats['embedding']} documents={stats['documents']} chunks={stats['chunks']}")


if __name__ == "__main__":
    asyncio.run(_main())
