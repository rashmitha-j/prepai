"""Document loaders: turn files into (metadata, text) pairs for ingestion."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

_FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)


@dataclass
class LoadedDocument:
    id: str
    title: str
    topic: str
    source: str
    content: str
    extra: dict = field(default_factory=dict)


def parse_frontmatter(text: str) -> tuple[dict[str, str], str]:
    match = _FRONTMATTER_RE.match(text)
    if not match:
        return {}, text
    meta: dict[str, str] = {}
    for line in match.group(1).splitlines():
        if ":" in line:
            key, value = line.split(":", 1)
            meta[key.strip().lower()] = value.strip().strip("'\"")
    return meta, text[match.end() :]


def load_pdf_text(path: Path) -> str:
    from pypdf import PdfReader

    reader = PdfReader(str(path))
    return "\n\n".join((page.extract_text() or "") for page in reader.pages)


def load_file(path: Path) -> LoadedDocument:
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        meta, body = {}, load_pdf_text(path)
    elif suffix in {".md", ".markdown", ".txt"}:
        meta, body = parse_frontmatter(path.read_text(encoding="utf-8"))
    else:
        raise ValueError(f"Unsupported document type: {suffix}")
    return LoadedDocument(
        id=meta.get("id") or path.stem,
        title=meta.get("title") or path.stem.replace("-", " ").title(),
        topic=meta.get("topic") or path.stem,
        source=meta.get("source") or path.name,
        content=body,
    )


def load_directory(directory: Path) -> list[LoadedDocument]:
    docs = []
    for path in sorted(directory.iterdir()):
        if path.is_file() and path.suffix.lower() in {".md", ".markdown", ".txt", ".pdf"}:
            docs.append(load_file(path))
    return docs
