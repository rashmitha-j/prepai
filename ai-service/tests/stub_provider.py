"""Deterministic scripted provider for tests.

This is NOT an AI model. It returns canned JSON chosen by inspecting the prompt,
so API/business logic can be tested without Ollama or network access. It lives
under tests/ and is never selectable through application configuration.
"""
from __future__ import annotations

import json
from collections.abc import Callable

from app.core.errors import ProviderUnavailableError
from app.providers.base import AIProvider
from app.providers.hashing_embedder import HashingEmbedder

RESUME_JSON = {
    "summary": "Final-year CS student building full-stack JavaScript applications.",
    "skills": ["JavaScript", "reactjs", "Node", "MongoDB", "Data Structures"],
    "technologies": ["Express", "Git", "Docker"],
    "projects": [
        {"name": "DevConnect", "description": "Social network for developers", "technologies": ["React", "Node.js", "MongoDB"]},
        {"name": "Pathfinder", "description": "Visualises BFS and Dijkstra", "technologies": ["JavaScript"]},
    ],
    "experience": [{"title": "Web Development Intern", "organization": "Acme", "duration": "3 months", "highlights": ["Built REST APIs"]}],
    "education": [{"degree": "B.Tech Computer Science", "institution": "State University", "year": "2025"}],
    "strengths": ["Hands-on MERN projects"],
    "possibleGaps": ["No production system design experience"],
}

JOB_JSON = {
    "title": "Junior Full Stack Developer",
    "company": "Nimbus",
    "summary": "Build React and Node.js features.",
    "requiredSkills": ["React", "Node.js", "SQL", "REST APIs"],
    "preferredSkills": ["Docker", "AWS"],
    "responsibilities": ["Build features", "Write tests"],
    "technologies": ["React", "Node.js", "PostgreSQL"],
    "experienceLevel": "0-2 years",
}

MATCH_JSON = {
    "relevantProjects": [
        {"name": "DevConnect", "reason": "Full-stack React/Node project"},
        {"name": "Imaginary Blockchain App", "reason": "hallucinated"},
    ],
    "experienceAlignment": "Internship experience aligns with a junior role.",
    "interviewTopics": ["React hooks", "SQL joins"],
    "recommendations": ["Practice SQL joins and indexing"],
}

QUESTION_JSON = {
    "question": "Explain the four conditions required for a deadlock and how to prevent one.",
    "topic": "Deadlocks",
    "expectedPoints": ["Mutual exclusion", "Hold and wait", "No preemption", "Circular wait"],
    "rationale": "OS fundamentals are listed in the job description.",
}

FOLLOW_UP_JSON = {
    "question": "How would lock ordering prevent circular wait in practice?",
    "topic": "Deadlock prevention",
    "expectedPoints": ["Global lock order", "Acquire in order"],
    "rationale": "Your answer mentioned lock ordering briefly.",
}

EVALUATION_JSON = {
    "scores": {"correctness": 8, "relevance": 9, "technicalDepth": 6, "clarity": 7, "completeness": 6, "communication": 7},
    "summary": "Correct conditions, but prevention strategies were thin.",
    "strengths": ["Named all four conditions"],
    "missingPoints": ["Banker's algorithm", "Lock ordering detail"],
    "suggestions": ["Give a concrete example"],
    "modelAnswer": "A deadlock needs mutual exclusion, hold and wait, no preemption and circular wait...",
    "followUp": {"shouldAsk": True, "question": "How does lock ordering break circular wait?", "reason": "Probe prevention"},
}

REPORT_JSON = {
    "summary": "Solid fundamentals with gaps in depth.",
    "strengths": ["Clear definitions"],
    "weakAreas": ["Deadlock prevention"],
    "technicalGaps": ["Banker's algorithm"],
    "communicationFeedback": "Structured answers; add examples.",
    "recommendedTopics": ["Operating Systems"],
    "roadmap": [{"title": "OS deep dive", "focus": "Deadlocks", "actions": ["Read OS notes"], "duration": "3 days"}],
}

CODE_JSON = {
    "summary": "Off-by-one error in the loop bound.",
    "likelyIssues": ["Loop skips last element"],
    "timeComplexity": "O(n)",
    "spaceComplexity": "O(1)",
    "improvements": ["Use i < n"],
}


def default_router(prompt: str) -> dict:
    if "<resume>" in prompt and "job_description" not in prompt:
        return RESUME_JSON
    if "Analyse the job description" in prompt:
        return JOB_JSON
    if "skill comparison has already been computed" in prompt:
        return MATCH_JSON
    if "Evaluate a candidate's answer" in prompt:
        return EVALUATION_JSON
    if "Ask ONE natural follow-up" in prompt:
        return FOLLOW_UP_JSON
    if "Ask exactly ONE new question" in prompt:
        return QUESTION_JSON
    if "Write the final report" in prompt:
        return REPORT_JSON
    if "submitted C++ code" in prompt:
        return CODE_JSON
    raise AssertionError(f"No scripted response for prompt: {prompt[:120]}")


class ScriptedProvider(AIProvider):
    name = "scripted-test"

    def __init__(self, router: Callable[[str], dict | str] | None = None, *, fail: Exception | None = None):
        super().__init__()
        self.router = router or default_router
        self.fail = fail
        self.calls: list[dict] = []
        self._embedder = HashingEmbedder(256)
        self.queue: list[str] = []  # raw responses consumed before the router (for repair tests)

    @property
    def model(self) -> str:
        return "scripted"

    @property
    def embedding_id(self) -> str:
        return self._embedder.embedding_id

    async def _chat(self, messages, *, json_mode, temperature, max_tokens) -> str:
        self.calls.append({"messages": messages, "json_mode": json_mode, "temperature": temperature})
        if self.fail:
            raise self.fail
        if self.queue:
            return self.queue.pop(0)
        result = self.router(messages[1]["content"] if len(messages) > 1 else messages[0]["content"])
        return result if isinstance(result, str) else json.dumps(result)

    async def embed(self, texts):
        return await self._embedder.embed(texts)

    async def health_check(self):
        if self.fail:
            return {"provider": self.name, "status": "unavailable", "detail": "scripted failure"}
        return {"provider": self.name, "status": "ok", "model": "scripted"}


def unavailable() -> ProviderUnavailableError:
    return ProviderUnavailableError("Cannot reach Ollama at http://localhost:11434. Is `ollama serve` running?")
