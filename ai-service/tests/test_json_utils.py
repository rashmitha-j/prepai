import pytest

from app.core.json_utils import JSONExtractionError, extract_json_object


def test_plain_json():
    assert extract_json_object('{"a": 1}') == {"a": 1}


def test_markdown_fence_and_prose():
    raw = 'Sure! Here is the result:\n```json\n{"question": "What is a mutex?", "topic": "OS"}\n```\nHope it helps.'
    assert extract_json_object(raw)["topic"] == "OS"


def test_braces_inside_strings_are_handled():
    raw = 'prefix {"code": "if (x) { return 1; }", "ok": true} suffix'
    assert extract_json_object(raw) == {"code": "if (x) { return 1; }", "ok": True}


def test_trailing_comma_repaired():
    assert extract_json_object('{"items": ["a", "b",], "n": 2,}') == {"items": ["a", "b"], "n": 2}


@pytest.mark.parametrize("raw", ["", "   ", "no json here", "[1, 2, 3]", '{"unterminated": '])
def test_invalid_output_raises(raw):
    with pytest.raises(JSONExtractionError):
        extract_json_object(raw)
