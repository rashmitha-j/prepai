"""Tolerant JSON extraction from LLM output.

LLMs sometimes wrap JSON in markdown fences, add prose before/after it, or leave
trailing commas. We extract the first balanced JSON object and apply only small,
safe repairs. Everything is then validated against a Pydantic schema — this module
never decides whether the *content* is trustworthy.
"""
from __future__ import annotations

import json
import re
from typing import Any

_FENCE_RE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL | re.IGNORECASE)
_TRAILING_COMMA_RE = re.compile(r",\s*([}\]])")


class JSONExtractionError(ValueError):
    pass


def _balanced_object(text: str) -> str | None:
    start = text.find("{")
    while start != -1:
        depth = 0
        in_string = False
        escape = False
        for i in range(start, len(text)):
            ch = text[i]
            if in_string:
                if escape:
                    escape = False
                elif ch == "\\":
                    escape = True
                elif ch == '"':
                    in_string = False
                continue
            if ch == '"':
                in_string = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    return text[start : i + 1]
        start = text.find("{", start + 1)
    return None


def extract_json_object(text: str) -> dict[str, Any]:
    if not text or not text.strip():
        raise JSONExtractionError("Empty model output")

    candidates: list[str] = []
    fence = _FENCE_RE.search(text)
    if fence:
        candidates.append(fence.group(1))
    candidates.append(text)

    for candidate in candidates:
        obj_text = _balanced_object(candidate)
        if obj_text is None:
            continue
        for attempt in (obj_text, _TRAILING_COMMA_RE.sub(r"\1", obj_text)):
            try:
                parsed = json.loads(attempt)
            except json.JSONDecodeError:
                continue
            if isinstance(parsed, dict):
                return parsed
    raise JSONExtractionError("No valid JSON object found in model output")
