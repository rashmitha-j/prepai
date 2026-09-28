"""Text cleaning applied before chunking/embedding."""
from __future__ import annotations

import re
import unicodedata

_CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_MD_LINK_RE = re.compile(r"\[([^\]]+)\]\((?:[^)]+)\)")
_MULTI_SPACE_RE = re.compile(r"[ \t]+")
_MULTI_NEWLINE_RE = re.compile(r"\n{3,}")
_HYPHEN_BREAK_RE = re.compile(r"(\w)-\n(\w)")


def clean_text(text: str) -> str:
    """Normalise unicode/whitespace and strip noise while keeping markdown structure."""
    text = unicodedata.normalize("NFKC", text or "")
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = _CONTROL_RE.sub("", text)
    text = _HYPHEN_BREAK_RE.sub(r"\1\2", text)  # re-join words split across PDF lines
    text = _MD_LINK_RE.sub(r"\1", text)
    text = _MULTI_SPACE_RE.sub(" ", text)
    text = "\n".join(line.rstrip() for line in text.split("\n"))
    text = _MULTI_NEWLINE_RE.sub("\n\n", text)
    return text.strip()


def truncate(text: str, max_chars: int) -> str:
    """Truncate on a word boundary so prompts stay within the token budget."""
    if len(text) <= max_chars:
        return text
    cut = text[:max_chars]
    space = cut.rfind(" ")
    return (cut[:space] if space > max_chars * 0.8 else cut) + " …[truncated]"
