"""Reusable Pydantic field types that sanitise untrusted (LLM or user) values.

LLMs drift: they return a string where a list is expected, numbers as strings,
scores out of range, duplicated items or very long text. These validators
normalise harmless drift and bound sizes; anything structurally wrong still fails
validation and triggers the repair/retry path.
"""
from __future__ import annotations

import re
from typing import Annotated, Any

from pydantic import BeforeValidator

_WS_RE = re.compile(r"\s+")


def _clean(value: Any, max_len: int) -> str:
    if value is None:
        return ""
    if isinstance(value, (int, float)):
        value = str(value)
    if not isinstance(value, str):
        raise ValueError("expected a string")
    value = _WS_RE.sub(" ", value).strip()
    return value[:max_len]


def short_text(max_len: int):
    return BeforeValidator(lambda v: _clean(v, max_len))


def _to_list(value: Any) -> list:
    if value is None:
        return []
    if isinstance(value, str):
        parts = re.split(r"[\n;,]|\s•\s", value) if value.strip() else []
        return [p.strip(" -•*") for p in parts]
    if isinstance(value, (list, tuple)):
        return list(value)
    raise ValueError("expected a list")


def string_list(max_items: int = 25, max_len: int = 200):
    def validate(value: Any) -> list[str]:
        out: list[str] = []
        seen: set[str] = set()
        for item in _to_list(value):
            if isinstance(item, dict):  # e.g. {"name": "React"} -> "React"
                item = item.get("name") or item.get("skill") or item.get("title") or ""
            try:
                text = _clean(item, max_len)
            except ValueError:
                continue
            key = text.lower()
            if text and key not in seen:
                seen.add(key)
                out.append(text)
            if len(out) >= max_items:
                break
        return out

    return BeforeValidator(validate)


def _score(value: Any) -> int:
    if isinstance(value, str):
        match = re.search(r"-?\d+(\.\d+)?", value)
        if not match:
            raise ValueError("score must be a number")
        value = float(match.group())
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("score must be a number")
    return int(round(min(10.0, max(0.0, float(value)))))


def _bool(value: Any) -> bool:
    if isinstance(value, str):
        return value.strip().lower() in {"true", "yes", "1", "y"}
    return bool(value)


Text80 = Annotated[str, short_text(80)]
Text200 = Annotated[str, short_text(200)]
Text500 = Annotated[str, short_text(500)]
Text1200 = Annotated[str, short_text(1200)]
Text2500 = Annotated[str, short_text(2500)]
Skills = Annotated[list[str], string_list(40, 60)]
Items = Annotated[list[str], string_list(12, 300)]
ShortItems = Annotated[list[str], string_list(8, 200)]
Score = Annotated[int, BeforeValidator(_score)]
Flag = Annotated[bool, BeforeValidator(_bool)]
