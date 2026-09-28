"""Structured-output validation: the schemas must normalise harmless LLM drift and reject garbage."""
import pytest
from pydantic import ValidationError

from app.models.schemas import (
    EvaluationLLM,
    GeneratedQuestionLLM,
    JobAnalysisLLM,
    MatchNarrativeLLM,
    ReportLLM,
    ResumeAnalysisLLM,
)


def test_string_instead_of_list_is_split_and_deduped():
    r = ResumeAnalysisLLM.model_validate({"skills": "React, Node.js; react\nSQL", "strengths": None})
    assert r.skills == ["React", "Node.js", "SQL"]
    assert r.strengths == []


def test_list_items_as_objects_and_numbers():
    r = ResumeAnalysisLLM.model_validate({"skills": [{"name": "Python"}, 42, "", None, "  Go  "]})
    assert r.skills == ["Python", "42", "Go"]


def test_long_values_are_truncated_and_lists_capped():
    r = ResumeAnalysisLLM.model_validate({"summary": "x" * 5000, "skills": [f"s{i}" for i in range(100)]})
    assert len(r.summary) == 1200
    assert len(r.skills) == 40


def test_unknown_keys_ignored_and_bad_nested_items_dropped():
    r = ResumeAnalysisLLM.model_validate(
        {"hidden_reasoning": "...", "projects": [{"name": "A"}, "junk", {"name": "B", "technologies": "React, Node"}]}
    )
    assert [p.name for p in r.projects] == ["A", "B"]
    assert r.projects[1].technologies == ["React", "Node"]
    assert not hasattr(r, "hidden_reasoning")


@pytest.mark.parametrize(
    "raw,expected",
    [("0-2 years", "entry"), ("Senior Engineer", "senior"), ("3-5 years", "mid"), ("Internship", "intern"),
     ("Staff", "lead"), ("", "unspecified"), (None, "unspecified")],
)
def test_experience_level_normalisation(raw, expected):
    assert JobAnalysisLLM.model_validate({"experienceLevel": raw}).experienceLevel == expected


def test_scores_are_clamped_and_coerced():
    ev = EvaluationLLM.model_validate(
        {
            "scores": {"correctness": "8/10", "relevance": 12, "technicalDepth": -3, "clarity": 7.6,
                       "completeness": "6", "communication": 5},
            "summary": "ok",
            "followUp": {"shouldAsk": "yes", "question": "Why?"},
        }
    )
    assert ev.scores.correctness == 8
    assert ev.scores.relevance == 10
    assert ev.scores.technicalDepth == 0
    assert ev.scores.clarity == 8
    assert ev.followUp.shouldAsk is True


def test_evaluation_missing_scores_is_rejected():
    with pytest.raises(ValidationError):
        EvaluationLLM.model_validate({"summary": "no scores"})


def test_non_numeric_score_is_rejected():
    with pytest.raises(ValidationError):
        EvaluationLLM.model_validate(
            {"scores": {k: "great" for k in ["correctness", "relevance", "technicalDepth", "clarity", "completeness", "communication"]},
             "summary": "x"}
        )


def test_question_must_be_meaningful():
    with pytest.raises(ValidationError):
        GeneratedQuestionLLM.model_validate({"question": "Why?"})
    q = GeneratedQuestionLLM.model_validate({"question": "What is a closure in JavaScript?", "expectedPoints": "scope, functions"})
    assert q.expectedPoints == ["scope", "functions"]


def test_match_projects_accept_strings():
    m = MatchNarrativeLLM.model_validate({"relevantProjects": ["DevConnect", {"name": "X", "reason": "y"}, 5]})
    assert [p.name for p in m.relevantProjects] == ["DevConnect", "X"]


def test_report_roadmap_accepts_strings():
    r = ReportLLM.model_validate({"summary": "s", "roadmap": ["Learn SQL", {"title": "OS", "actions": "read, practice"}]})
    assert r.roadmap[0].title == "Learn SQL"
    assert r.roadmap[1].actions == ["read", "practice"]


def test_report_roadmap_steps_always_have_a_duration():
    # Recorded from llama3.1:8b: one step came back with "duration": "".
    r = ReportLLM.model_validate({"summary": "s", "roadmap": [
        {"title": "Type coercion", "actions": ["Read docs"], "duration": ""},
        {"title": "Isolation levels", "duration": "   "},
        {"title": "Node.js performance"},
        "Learn SQL",
        {"title": "Practice explaining", "duration": "2-3 days"},
        {"title": "System design", "duration": "1 week"},
    ]})
    assert all(step.duration.strip() for step in r.roadmap)
    assert [s.duration for s in r.roadmap[:4]] == ["2-3 days"] * 4
    assert r.roadmap[5].duration == "1 week"  # a duration the model did give is kept
