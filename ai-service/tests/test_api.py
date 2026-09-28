"""End-to-end API tests against the FastAPI app with a scripted (non-AI) provider."""
import json

import pytest

from app.core.config import Settings
from app.core.container import build_container
from app.main import create_app
from app.providers.hashing_embedder import HashingEmbedder
from tests.conftest import make_settings
from tests.stub_provider import ScriptedProvider, unavailable

RESUME_TEXT = (
    "Jane Doe — Software Engineer. Skills: JavaScript, React, Node.js, MongoDB, Docker. "
    "Projects: DevConnect (React, Node.js, MongoDB) — a social network for developers. "
    "Experience: Web Development Intern at Acme."
)
JD_TEXT = (
    "Junior Full Stack Developer at Nimbus.\nRequirements:\n- React and Node.js\n- SQL and REST APIs\n"
    "Nice to have:\n- Docker, AWS\n0-2 years of experience."
)


def test_health_reports_provider_and_store(client):
    body = client.get("/health").json()
    assert body["status"] == "ok"
    assert body["provider"]["status"] == "ok"
    assert body["vectorStore"]["type"] == "local"


def test_health_degraded_when_provider_down(settings):
    c = build_container(settings, provider=ScriptedProvider(fail=unavailable()), embedder=HashingEmbedder(64))
    from fastapi.testclient import TestClient

    with TestClient(create_app(settings, c)) as tc:
        body = tc.get("/health").json()
    assert body["status"] == "degraded"
    assert body["provider"]["status"] == "unavailable"


# ------------------------------------------------------------ analysis
def test_resume_analyze_ai_mode_merges_and_normalises(client):
    body = client.post("/resume/analyze", json={"text": RESUME_TEXT}).json()
    assert body["analysisMode"] == "ai"
    assert "React" in body["skills"] and "reactjs" not in body["skills"]
    assert "Docker" in body["skills"]  # detected deterministically even though the model omitted it from skills
    assert body["projects"][0]["name"] == "DevConnect"


def test_resume_analyze_falls_back_to_heuristic(settings):
    c = build_container(settings, provider=ScriptedProvider(fail=unavailable()), embedder=HashingEmbedder(64))
    from fastapi.testclient import TestClient

    with TestClient(create_app(settings, c)) as tc:
        body = tc.post("/resume/analyze", json={"text": RESUME_TEXT}).json()
    assert body["analysisMode"] == "heuristic"
    assert "React" in body["skills"]
    assert body["projects"] == []
    assert "AI analysis unavailable" in body["warnings"][0]


def test_resume_analyze_falls_back_on_invalid_output(settings):
    provider = ScriptedProvider(router=lambda p: "I cannot produce JSON today")
    c = build_container(settings, provider=provider, embedder=HashingEmbedder(64))
    from fastapi.testclient import TestClient

    with TestClient(create_app(settings, c)) as tc:
        body = tc.post("/resume/analyze", json={"text": RESUME_TEXT}).json()
    assert body["analysisMode"] == "heuristic"
    assert len(provider.calls) == 2  # original + one repair attempt


def test_resume_analyze_validation(client):
    r = client.post("/resume/analyze", json={"text": "too short"})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "VALIDATION_ERROR"
    assert client.post("/resume/analyze", json={"text": RESUME_TEXT, "extra": 1}).status_code == 422


def test_job_analyze(client):
    body = client.post("/job/analyze", json={"text": JD_TEXT, "title": "", "company": ""}).json()
    assert body["analysisMode"] == "ai"
    assert body["experienceLevel"] == "entry"
    assert body["requiredSkills"] == ["React", "Node.js", "SQL", "REST APIs"]


def test_job_analyze_heuristic_splits_required_and_preferred(settings):
    c = build_container(settings, provider=ScriptedProvider(fail=unavailable()), embedder=HashingEmbedder(64))
    from fastapi.testclient import TestClient

    with TestClient(create_app(settings, c)) as tc:
        body = tc.post("/job/analyze", json={"text": JD_TEXT, "title": "Dev", "company": "Nimbus"}).json()
    assert body["analysisMode"] == "heuristic"
    assert {"React", "Node.js", "SQL", "REST APIs"} <= set(body["requiredSkills"])
    assert {"Docker", "AWS"} <= set(body["preferredSkills"])
    assert body["experienceLevel"] == "entry"


MATCH_BODY = {
    "resume": {
        "summary": "MERN developer",
        "skills": ["JavaScript", "reactjs", "Node"],
        "technologies": ["MongoDB", "Docker"],
        "projects": [{"name": "DevConnect", "description": "social network", "technologies": ["React", "Node.js"]}],
        "experience": ["Web Development Intern at Acme"],
    },
    "job": {
        "title": "Junior Full Stack Developer",
        "requiredSkills": ["React", "Node.js", "SQL", "REST APIs"],
        "preferredSkills": ["Docker", "AWS"],
        "technologies": ["React", "PostgreSQL"],
    },
}


def test_match_is_deterministic_and_guards_hallucinated_projects(client):
    body = client.post("/match/analyze", json=MATCH_BODY).json()
    assert body["title"] == "Interview Preparation Match Analysis"
    assert body["missingSkills"] == ["SQL", "REST APIs"]
    assert set(body["matchingSkills"]) == {"React", "Node.js", "Docker"}
    assert body["coverage"]["percent"] == 50
    assert "heuristic" in body["coverage"]["label"]
    assert [p["name"] for p in body["relevantProjects"]] == ["DevConnect"]  # imaginary project removed
    assert body["technologyAlignment"] == {"matched": ["React"], "missing": ["PostgreSQL"]}
    assert "not a hiring decision" in body["disclaimer"]


def test_match_heuristic_when_provider_down(settings):
    c = build_container(settings, provider=ScriptedProvider(fail=unavailable()), embedder=HashingEmbedder(64))
    from fastapi.testclient import TestClient

    with TestClient(create_app(settings, c)) as tc:
        body = tc.post("/match/analyze", json=MATCH_BODY).json()
    assert body["analysisMode"] == "heuristic"
    assert body["missingSkills"] == ["SQL", "REST APIs"]
    assert body["relevantProjects"][0]["name"] == "DevConnect"
    assert body["recommendations"]


# ------------------------------------------------------------ rag
KB = {
    "documents": [
        {"id": "kb-os", "title": "Operating Systems", "topic": "os", "source": "os.md",
         "content": "# OS\n\n## Deadlocks\n\nDeadlock requires mutual exclusion, hold and wait, no preemption and circular wait."},
        {"id": "kb-react", "title": "React", "topic": "react", "source": "react.md",
         "content": "# React\n\n## Hooks\n\nuseEffect runs after render; its cleanup runs before the next effect and on unmount."},
    ]
}


def test_rag_ingest_retrieve_stats_delete(client):
    ingest = client.post("/rag/ingest", json=KB).json()
    assert ingest["totalChunks"] == 2
    res = client.post("/rag/retrieve", json={"query": "deadlock circular wait", "topK": 1}).json()
    assert res["chunks"][0]["docId"] == "kb-os"
    assert res["chunks"][0]["section"] == "OS > Deadlocks"
    filtered = client.post("/rag/retrieve", json={"query": "deadlock", "topic": "react"}).json()
    assert all(ch["topic"] == "react" for ch in filtered["chunks"])
    assert client.get("/rag/stats").json()["documents"] == 2
    assert client.delete("/rag/documents/kb-os").json()["deletedChunks"] == 1


def test_rag_rejects_bad_ids_and_empty(client):
    bad = {"documents": [{"id": "../etc", "title": "x", "topic": "os", "content": "x" * 30}]}
    assert client.post("/rag/ingest", json=bad).status_code == 422
    assert client.post("/rag/ingest", json={"documents": []}).status_code == 422
    assert client.post("/rag/retrieve", json={"query": "x", "topK": 50}).status_code == 422


def test_embeddings_endpoint(client):
    body = client.post("/embeddings", json={"texts": ["hello world", "deadlock"]}).json()
    assert body["dimensions"] == 256
    assert len(body["embeddings"]) == 2
    assert client.post("/embeddings", json={"texts": [""]}).status_code == 422


# ------------------------------------------------------------ interview
QUESTION_BODY = {
    "role": "Backend Developer",
    "difficulty": "medium",
    "category": "os",
    "context": {"jobSkills": ["Node.js", "Operating Systems"], "missingSkills": ["Multithreading"]},
    "history": [],
    "questionNumber": 1,
    "totalQuestions": 5,
}


def test_question_uses_rag_sources(client, provider):
    client.post("/rag/ingest", json=KB)
    body = client.post("/interview/question", json=QUESTION_BODY).json()
    assert body["question"].startswith("Explain the four conditions")
    assert body["category"] == "os"
    assert body["sources"] and body["sources"][0]["topic"] == "os"  # topic filter excluded React docs
    prompt = provider.calls[-1]["messages"][1]["content"]
    assert "[S1] (Operating Systems" in prompt  # retrieved context was injected
    assert "useEffect" not in prompt  # ...but not the whole knowledge base


def test_question_history_shapes_prompt(client, provider):
    body = dict(QUESTION_BODY, history=[{"question": "What is paging?", "topic": "Paging", "score": 3.0,
                                         "missingPoints": ["page tables"]}], questionNumber=2)
    assert client.post("/interview/question", json=body).status_code == 200
    prompt = provider.calls[-1]["messages"][1]["content"]
    assert "What is paging?" in prompt
    assert "The last answer was weak" in prompt


def test_repeated_question_is_rejected(client):
    body = dict(QUESTION_BODY, history=[{"question": "Explain the four conditions required for a deadlock and how to prevent one."}])
    r = client.post("/interview/question", json=body)
    assert r.status_code == 502
    assert r.json()["error"]["code"] == "AI_OUTPUT_INVALID"


def test_question_provider_unavailable_returns_503(settings):
    c = build_container(settings, provider=ScriptedProvider(fail=unavailable()), embedder=HashingEmbedder(64))
    from fastapi.testclient import TestClient

    with TestClient(create_app(settings, c)) as tc:
        r = tc.post("/interview/question", json=QUESTION_BODY)
    assert r.status_code == 503
    assert r.json()["error"]["code"] == "AI_PROVIDER_UNAVAILABLE"
    assert "ollama serve" in r.json()["error"]["message"]


def test_mixed_category_is_planned_from_job(client):
    body = dict(QUESTION_BODY, category="mixed", context={"jobSkills": ["React", "SQL"], "missingSkills": ["SQL"]})
    first = client.post("/interview/question", json=body).json()
    assert first["category"] == "sql"  # missing skill comes first


EVAL_BODY = {
    "role": "Backend Developer",
    "difficulty": "medium",
    "category": "os",
    "question": "Explain the four conditions required for a deadlock.",
    "topic": "Deadlocks",
    "expectedPoints": ["Mutual exclusion", "Hold and wait", "No preemption", "Circular wait"],
    "answer": "Mutual exclusion, hold and wait, no preemption and circular wait. Prevent with lock ordering.",
}


def test_evaluate_computes_weighted_overall_score(client):
    body = client.post("/interview/evaluate", json=EVAL_BODY).json()
    # 0.30*8 + 0.20*6 + 0.15*9 + 0.15*6 + 0.10*7 + 0.10*7 = 7.25 -> 7.2 (banker's rounding in round())
    assert body["overallScore"] == pytest.approx(7.2, abs=0.06)
    assert body["followUp"]["shouldAsk"] is True
    assert body["missingPoints"]
    assert "reasoning" not in body


def test_evaluate_rejects_empty_answer(client):
    assert client.post("/interview/evaluate", json=dict(EVAL_BODY, answer="")).status_code == 422


def test_follow_up(client):
    body = client.post("/interview/follow-up", json={
        "role": "Backend Developer", "difficulty": "medium", "category": "os",
        "question": EVAL_BODY["question"], "answer": EVAL_BODY["answer"], "missingPoints": ["Banker's algorithm"],
    }).json()
    assert body["isFollowUp"] is True
    assert "lock ordering" in body["question"]


REPORT_BODY = {
    "role": "Backend Developer",
    "difficulty": "medium",
    "category": "os",
    "turns": [
        {"question": "Q1", "topic": "Deadlocks", "overallScore": 7.0,
         "scores": {"correctness": 8, "clarity": 6}, "missingPoints": ["Banker's algorithm"]},
        {"question": "Q2", "topic": "Paging", "overallScore": 4.0,
         "scores": {"correctness": 4, "clarity": 5}, "missingPoints": ["TLB"]},
    ],
}


def test_report_ai_mode_with_computed_stats(client):
    body = client.post("/interview/report", json=REPORT_BODY).json()
    assert body["analysisMode"] == "ai"
    assert body["averageScore"] == 5.5
    assert body["dimensionAverages"] == {"correctness": 6.0, "clarity": 5.5}
    assert body["topicScores"][0]["topic"] == "Paging"  # weakest first
    assert body["roadmap"][0]["title"] == "OS deep dive"


def test_report_roadmap_durations_are_never_empty(settings):
    # Shape recorded from llama3.1:8b: a roadmap step with "duration": "".
    provider = ScriptedProvider()
    provider.queue.append(json.dumps({
        "summary": "Solid basics, weak on Paging.",
        "roadmap": [
            {"title": "Review Paging", "focus": "TLB", "actions": ["Read OS notes"], "duration": "3-5 days"},
            {"title": "Improve understanding of deadlocks", "focus": "Banker's algorithm", "actions": ["Read docs"], "duration": ""},
        ],
    }))
    c = build_container(settings, provider=provider, embedder=HashingEmbedder(64))
    from fastapi.testclient import TestClient

    with TestClient(create_app(settings, c)) as tc:
        body = tc.post("/interview/report", json=REPORT_BODY).json()
    assert body["analysisMode"] == "ai"
    assert [s["duration"] for s in body["roadmap"]] == ["3-5 days", "2-3 days"]


def test_report_heuristic_when_provider_down(settings):
    c = build_container(settings, provider=ScriptedProvider(fail=unavailable()), embedder=HashingEmbedder(64))
    from fastapi.testclient import TestClient

    with TestClient(create_app(settings, c)) as tc:
        body = tc.post("/interview/report", json=REPORT_BODY).json()
    assert body["analysisMode"] == "heuristic"
    assert body["weakAreas"] == ["Paging"]
    assert "TLB" in body["technicalGaps"]
    assert body["roadmap"][0]["title"] == "Revisit Paging"


def test_report_requires_turns(client):
    assert client.post("/interview/report", json=dict(REPORT_BODY, turns=[])).status_code == 422


def test_code_explain(client):
    body = client.post("/coding/explain", json={
        "problemTitle": "Two Sum", "problemDescription": "Find two indices", "code": "int main(){}",
        "verdict": "wrong_answer", "failedTests": [{"input": "1 2", "expected": "0 1", "actual": ""}],
    }).json()
    assert body["timeComplexity"] == "O(n)"
    assert body["disclaimer"]


# ------------------------------------------------------------ security
def test_internal_token_required_when_configured(provider):
    from fastapi.testclient import TestClient

    settings = make_settings(ai_service_token="internal-secret")
    c = build_container(settings, provider=provider, embedder=HashingEmbedder(64))
    with TestClient(create_app(settings, c)) as tc:
        assert tc.get("/health").status_code == 200  # liveness stays open
        assert tc.post("/embeddings", json={"texts": ["a"]}).status_code == 401
        assert tc.post("/embeddings", json={"texts": ["a"]}, headers={"X-Internal-Token": "wrong"}).status_code == 401
        assert tc.post("/embeddings", json={"texts": ["a"]}, headers={"X-Internal-Token": "internal-secret"}).status_code == 200


def test_production_requires_token():
    with pytest.raises(RuntimeError):
        create_app(Settings(_env_file=None, environment="production", ai_service_token=None))


def test_unhandled_errors_are_generic(settings):
    def boom(prompt):
        raise ZeroDivisionError("secret internal detail")

    c = build_container(settings, provider=ScriptedProvider(router=boom), embedder=HashingEmbedder(64))
    from fastapi.testclient import TestClient

    with TestClient(create_app(settings, c), raise_server_exceptions=False) as tc:
        r = tc.post("/interview/evaluate", json=EVAL_BODY)
    assert r.status_code == 500
    assert "secret" not in r.text
