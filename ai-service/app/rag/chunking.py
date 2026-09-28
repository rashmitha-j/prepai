"""Structure-aware chunking.

Strategy:
  1. Split markdown into sections by headings, remembering the heading path
     (e.g. "Operating Systems > Deadlocks") so each chunk carries its context.
  2. Pack paragraphs of a section into chunks up to `chunk_size` characters.
  3. Paragraphs that are too long are split by sentences.
  4. Consecutive chunks of the same section overlap by ~`overlap` characters so
     facts at a boundary are not lost.

Character-based sizes keep the implementation model-agnostic; ~900 chars is
roughly 200-250 tokens, small enough for precise retrieval yet self-contained.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

_HEADING_RE = re.compile(r"^(#{1,6})\s+(.*)$")
_SENTENCE_RE = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9`(\"'])")


@dataclass
class Chunk:
    text: str
    index: int
    section: str


def _sections(text: str) -> list[tuple[str, str]]:
    stack: list[tuple[int, str]] = []
    sections: list[tuple[str, list[str]]] = [("", [])]
    in_code = False
    for line in text.split("\n"):
        if line.strip().startswith("```"):
            in_code = not in_code
        match = None if in_code else _HEADING_RE.match(line)
        if match:
            level, title = len(match.group(1)), match.group(2).strip()
            stack = [(lvl, t) for lvl, t in stack if lvl < level]
            stack.append((level, title))
            sections.append((" > ".join(t for _, t in stack), []))
        else:
            sections[-1][1].append(line)
    return [(path, "\n".join(lines).strip()) for path, lines in sections if "\n".join(lines).strip()]


def _paragraph_units(body: str, chunk_size: int) -> list[str]:
    units: list[str] = []
    for para in re.split(r"\n\s*\n", body):
        para = para.strip()
        if not para:
            continue
        if len(para) <= chunk_size:
            units.append(para)
            continue
        sentences = _SENTENCE_RE.split(para)
        buf = ""
        for sentence in sentences:
            while len(sentence) > chunk_size:  # pathological long sentence / code line
                units.append(sentence[:chunk_size])
                sentence = sentence[chunk_size:]
            if len(buf) + len(sentence) + 1 > chunk_size and buf:
                units.append(buf.strip())
                buf = ""
            buf += sentence + " "
        if buf.strip():
            units.append(buf.strip())
    return units


def _tail(text: str, overlap: int) -> str:
    if overlap <= 0 or len(text) <= overlap:
        return text if overlap > 0 else ""
    tail = text[-overlap:]
    space = tail.find(" ")
    return tail[space + 1 :] if space != -1 else tail


def chunk_text(text: str, *, chunk_size: int = 900, overlap: int = 150) -> list[Chunk]:
    if chunk_size < 100:
        raise ValueError("chunk_size must be >= 100")
    overlap = max(0, min(overlap, chunk_size // 3))
    chunks: list[Chunk] = []
    for section, body in _sections(text):
        buf = ""
        for unit in _paragraph_units(body, chunk_size):
            if buf and len(buf) + len(unit) + 2 > chunk_size:
                chunks.append(Chunk(text=buf.strip(), index=len(chunks), section=section))
                carry = _tail(buf, overlap)
                buf = (carry + "\n\n" if carry else "")
            buf += unit + "\n\n"
        if buf.strip():
            chunks.append(Chunk(text=buf.strip(), index=len(chunks), section=section))
    return chunks
