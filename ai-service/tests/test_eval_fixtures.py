"""AI evaluation fixtures.

Two layers:
  1. Offline (always runs): deterministic extraction on realistic fixtures, and schema
     normalisation of recorded messy LLM output shapes.
  2. Live (opt-in): set PREPAI_LIVE_AI=1 with a configured provider to run the real model
     against the same fixtures and check schema conformance plus basic quality signals.
     This measures a model; it never runs in CI by default and never fakes results.
"""
from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path

import pytest

from app.core.json_utils import extract_json_object
from app.models.schemas import EvaluationLLM, JobAnalysisLLM, MatchRequest, ReportLLM, ResumeAnalysisLLM
from app.services.analysis_service import heuristic_job_skills
from app.services.skills import extract_skills

FIX = Path(__file__).parent / "fixtures"
EXPECTED = json.loads((FIX / "expected_fields.json").read_text())
RESUME = (FIX / "sample_resume.txt").read_text()
JOB = (FIX / "sample_job.txt").read_text()
ANSWERS = json.loads((FIX / "sample_answers.json").read_text())
RECORDED = json.loads((FIX / "recorded_llm_outputs.json").read_text())


# ------------------------------------------------------------------ offline
def test_deterministic_resume_skill_recall():
    found = set(extract_skills(RESUME))
    expected = set(EXPECTED["resume"]["mustDetectSkills"])
    missing = expected - found
    assert not missing, f"extractor missed {missing}"
    assert not found & set(EXPECTED["resume"]["mustNotDetectSkills"])


def test_heuristic_job_sections():
    required, preferred = heuristic_job_skills(JOB)
    assert set(EXPECTED["job"]["requiredSkills"]) <= set(required)
    assert set(EXPECTED["job"]["preferredSkills"]) <= set(preferred)


def test_recorded_resume_output_is_normalised():
    r = ResumeAnalysisLLM.model_validate(extract_json_object(RECORDED["resume"]))
    assert r.skills == ["C++", "JavaScript", "React", "react.js"]  # canonicalisation happens in the service layer
    assert r.technologies == ["Docker", "Git"]
    assert [p.name for p in r.projects] == ["DevConnect"]  # bare string item dropped
    assert r.experience[0].organization == "Finlytics"  # single object wrapped into a list
    assert r.education[0].year == "2026"
    assert r.possibleGaps == []


def test_recorded_job_output_is_normalised():
    j = JobAnalysisLLM.model_validate(extract_json_object(RECORDED["job"]))
    assert j.requiredSkills == ["React", "Node.js", "SQL"]
    assert j.preferredSkills == ["Docker", "AWS"]
    assert j.experienceLevel == "entry"


def test_recorded_evaluation_output_is_normalised():
    e = EvaluationLLM.model_validate(extract_json_object(RECORDED["evaluation"]))
    assert e.scores.correctness == 9 and e.scores.communication == 10
    assert e.strengths == ["Covered all four conditions"]
    assert e.followUp.shouldAsk is False


def test_recorded_report_output_is_normalised():
    r = ReportLLM.model_validate(extract_json_object(RECORDED["report"]))
    assert [s.title for s in r.roadmap] == ["Revise OS", "SQL practice"]
    assert r.weakAreas == ["SQL"]


def test_match_fixture_offline(client):
    resume_skills = extract_skills(RESUME)
    required, preferred = heuristic_job_skills(JOB)
    body = MatchRequest.model_validate({
        "resume": {"skills": resume_skills, "projects": [{"name": n} for n in EXPECTED["resume"]["projects"]]},
        "job": {"requiredSkills": required, "preferredSkills": preferred},
    }).model_dump()
    result = client.post("/match/analyze", json=body).json()
    assert set(EXPECTED["match"]["expectedMissingRequired"]) <= set(result["missingSkills"])
    assert set(EXPECTED["match"]["expectedMissingPreferred"]) <= set(result["missingPreferredSkills"])
    assert 0 <= result["coverage"]["percent"] <= 100


# ------------------------------------------------------------------ live (opt-in)
live = pytest.mark.skipif(os.getenv("PREPAI_LIVE_AI") != "1", reason="set PREPAI_LIVE_AI=1 to evaluate the configured model")


@live
def test_live_model_resume_and_job_extraction():
    from app.core.config import get_settings
    from app.core.container import build_container
    from app.services import analysis_service

    c = build_container(get_settings())
    resume = asyncio.run(analysis_service.analyze_resume(c, RESUME))
    job = asyncio.run(analysis_service.analyze_job(c, JOB))
    assert resume.analysisMode == "ai", resume.warnings
    expected = set(EXPECTED["resume"]["mustDetectSkills"])
    recall = len(expected & set(resume.skills)) / len(expected)
    print(f"resume skill recall={recall:.2f}")
    assert recall >= 0.8
    assert {p.name for p in resume.projects} & set(EXPECTED["resume"]["projects"])
    assert job.analysisMode == "ai", job.warnings
    assert job.experienceLevel == EXPECTED["job"]["experienceLevel"]


@live
def test_live_model_scores_answers_in_sensible_order():
    from app.core.config import get_settings
    from app.core.container import build_container
    from app.models.schemas import EvaluateRequest
    from app.services import interview_service

    c = build_container(get_settings())
    scores = {}
    for label, answer in ANSWERS["answers"].items():
        req = EvaluateRequest(role="Software Engineer", difficulty="medium", category=ANSWERS["category"],
                              question=ANSWERS["question"], expectedPoints=ANSWERS["expectedPoints"], answer=answer)
        scores[label] = asyncio.run(interview_service.evaluate_answer(c, req)).overallScore
    print(f"live evaluation scores: {scores}")
    assert scores["strong"] > scores["partial"] > scores["weak"]
    assert scores["offTopic"] < 4
