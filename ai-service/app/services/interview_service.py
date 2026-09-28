"""Interview intelligence: RAG-grounded question generation, evaluation, follow-ups, reports.

The AI service is stateless: the Node backend owns the interview session and sends
the relevant history with each call. That keeps state in one database and lets
this service scale horizontally.
"""
from __future__ import annotations

import logging
from collections import defaultdict

from app.core.container import Container
from app.core.errors import AIOutputValidationError, ProviderResponseError, ProviderUnavailableError
from app.models.schemas import (
    CandidateContext,
    EvaluateRequest,
    EvaluationLLM,
    EvaluationResponse,
    FollowUpRequest,
    GeneratedQuestionLLM,
    QuestionRequest,
    QuestionResponse,
    ReportLLM,
    ReportRequest,
    ReportResponse,
    RoadmapStep,
    SourceRef,
    TopicScore,
)
from app.rag.pipeline import RetrievedChunk
from app.services import prompts
from app.services.skills import normalize_skill

logger = logging.getLogger("prepai.interview")

# Interview category -> knowledge-base topics used as a retrieval filter.
CATEGORY_TOPICS: dict[str, list[str]] = {
    "dsa": ["dsa"],
    "dbms": ["dbms", "mongodb"],
    "sql": ["sql", "dbms"],
    "os": ["os"],
    "cn": ["cn", "rest-api"],
    "oop": ["oop"],
    "javascript": ["javascript"],
    "react": ["react", "javascript"],
    "node": ["nodejs", "rest-api", "mongodb"],
    "system-design": ["system-design", "rest-api"],
    "resume": [],  # retrieval uses the candidate's own technologies, unfiltered
    "behavioral": ["behavioral"],
}

# Skill (canonical) -> interview category, used to plan "mixed" interviews around the job.
SKILL_CATEGORY = {
    "Data Structures": "dsa", "Algorithms": "dsa", "C++": "dsa", "Java": "oop",
    "DBMS": "dbms", "MongoDB": "dbms", "PostgreSQL": "sql", "MySQL": "sql", "SQL": "sql",
    "Operating Systems": "os", "Multithreading": "os", "Linux": "os",
    "Computer Networks": "cn", "OOP": "oop", "Design Patterns": "oop",
    "JavaScript": "javascript", "TypeScript": "javascript", "React": "react", "Next.js": "react",
    "Redux": "react", "Node.js": "node", "Express.js": "node", "REST APIs": "node",
    "System Design": "system-design", "Microservices": "system-design", "Redis": "system-design",
    "Kafka": "system-design", "Docker": "system-design", "Kubernetes": "system-design", "AWS": "system-design",
}

RUBRIC_WEIGHTS = {
    "correctness": 0.30,
    "technicalDepth": 0.20,
    "relevance": 0.15,
    "completeness": 0.15,
    "clarity": 0.10,
    "communication": 0.10,
}

LLM_ERRORS = (ProviderUnavailableError, ProviderResponseError, AIOutputValidationError)


def overall_score(scores: dict[str, float]) -> float:
    """Weighted rubric score computed in code — the LLM's arithmetic is never trusted."""
    total = sum(RUBRIC_WEIGHTS[k] * float(scores.get(k, 0)) for k in RUBRIC_WEIGHTS)
    return round(total, 1)


def plan_category(category: str, ctx: CandidateContext, question_number: int) -> str:
    """Resolve 'mixed' into a concrete category for this turn, driven by the job and gaps."""
    if category != "mixed":
        return category
    plan: list[str] = []
    for skill in ctx.missingSkills + ctx.jobSkills:
        cat = SKILL_CATEGORY.get(normalize_skill(skill))
        if cat and cat not in plan:
            plan.append(cat)
    if ctx.resumeProjects and "resume" not in plan:
        plan.insert(min(1, len(plan)), "resume")
    for default in ("dsa", "dbms", "os", "oop", "cn"):
        if len(plan) >= 5:
            break
        if default not in plan:
            plan.append(default)
    plan.append("behavioral")
    return plan[(question_number - 1) % len(plan)]


def _sources(chunks: list[RetrievedChunk]) -> list[SourceRef]:
    return [
        SourceRef(id=c.id, title=c.title, topic=c.topic, section=c.section, source=c.source, score=c.score)
        for c in chunks
    ]


async def _retrieve(c: Container, query: str, category: str, *, top_k: int, exclude: set[str] | None = None) -> list[RetrievedChunk]:
    topics = CATEGORY_TOPICS.get(category) or None
    try:
        return await c.rag.retrieve(query, top_k=top_k, topics=topics, exclude_ids=exclude)
    except (ProviderUnavailableError, ProviderResponseError) as exc:
        # Embedding model down: continue without grounding rather than failing the interview turn.
        logger.warning("Retrieval skipped (embedding provider unavailable): %s", exc)
        return []


def _question_query(req: QuestionRequest, category: str) -> str:
    ctx = req.context
    parts = [prompts.CATEGORY_LABELS.get(category, category), req.role, req.difficulty]
    if category == "resume":
        parts += ctx.resumeSkills[:10] + ctx.resumeProjects[:3]
    else:
        relevant = [s for s in ctx.jobSkills + ctx.missingSkills if SKILL_CATEGORY.get(normalize_skill(s)) == category]
        parts += relevant[:6]
    if req.history and req.history[-1].missingPoints:
        parts += req.history[-1].missingPoints[:3]
    return " ".join(parts)


async def generate_question(c: Container, req: QuestionRequest) -> QuestionResponse:
    category = plan_category(req.category, req.context, req.questionNumber)
    chunks = await _retrieve(c, _question_query(req, category), category, top_k=c.settings.rag_top_k, exclude=set(req.excludeSourceIds))
    prompt = prompts.question_prompt(
        role=req.role,
        difficulty=req.difficulty,
        category=category,
        ctx=req.context.model_dump(),
        history=[h.model_dump() for h in req.history],
        knowledge=c.rag.build_context(chunks, c.settings.rag_context_chars),
        question_number=req.questionNumber,
        total=req.totalQuestions,
    )
    q = await c.provider.generate_json(prompt, GeneratedQuestionLLM, system=prompts.BASE_SYSTEM, temperature=0.7)
    previous = {h.question.strip().lower() for h in req.history}
    if q.question.strip().lower() in previous:
        raise AIOutputValidationError("The model repeated a previous question. Please try again.")
    return QuestionResponse(
        question=q.question,
        topic=q.topic or prompts.CATEGORY_LABELS.get(category, category),
        category=category,
        difficulty=req.difficulty,
        expectedPoints=q.expectedPoints,
        rationale=q.rationale,
        sources=_sources(chunks),
    )


async def evaluate_answer(c: Container, req: EvaluateRequest) -> EvaluationResponse:
    chunks = await _retrieve(c, f"{req.topic} {req.question}", req.category, top_k=3)
    prompt = prompts.evaluate_prompt(
        role=req.role,
        difficulty=req.difficulty,
        category=req.category,
        question=req.question,
        expected=req.expectedPoints,
        answer=req.answer,
        knowledge=c.rag.build_context(chunks, 2500),
    )
    ev = await c.provider.generate_json(prompt, EvaluationLLM, system=prompts.BASE_SYSTEM, temperature=0.1)
    data = ev.model_dump()
    if not ev.followUp.shouldAsk or len(ev.followUp.question) < 10:
        data["followUp"] = {"shouldAsk": False, "question": "", "reason": ev.followUp.reason}
    return EvaluationResponse(**data, overallScore=overall_score(ev.scores.model_dump()), sources=_sources(chunks))


async def generate_follow_up(c: Container, req: FollowUpRequest) -> QuestionResponse:
    prompt = prompts.follow_up_prompt(
        role=req.role,
        difficulty=req.difficulty,
        category=req.category,
        question=req.question,
        answer=req.answer,
        missing=req.missingPoints,
        suggested=req.suggestedQuestion,
    )
    q = await c.provider.generate_json(prompt, GeneratedQuestionLLM, system=prompts.BASE_SYSTEM, temperature=0.5)
    if q.question.strip().lower() == req.question.strip().lower():
        raise AIOutputValidationError("The model repeated the original question.")
    return QuestionResponse(
        question=q.question,
        topic=q.topic or req.topic,
        category=req.category,
        difficulty=req.difficulty,
        expectedPoints=q.expectedPoints,
        rationale=q.rationale or "Follow-up on your previous answer.",
        isFollowUp=True,
    )


# ------------------------------------------------------------------ report
def compute_stats(req: ReportRequest) -> tuple[float | None, dict[str, float], list[TopicScore]]:
    scored = [t for t in req.turns if t.overallScore is not None]
    average = round(sum(t.overallScore for t in scored) / len(scored), 1) if scored else None
    dims: dict[str, list[float]] = defaultdict(list)
    topics: dict[str, list[float]] = defaultdict(list)
    for t in scored:
        for k, v in t.scores.items():
            if k in RUBRIC_WEIGHTS:
                dims[k].append(float(v))
        topics[(t.topic or t.category or "General").strip()].append(t.overallScore)
    dimension_averages = {k: round(sum(v) / len(v), 1) for k, v in dims.items()}
    topic_scores = sorted(
        (TopicScore(topic=k, averageScore=round(sum(v) / len(v), 1), questions=len(v)) for k, v in topics.items()),
        key=lambda ts: ts.averageScore,
    )
    return average, dimension_averages, topic_scores


def _heuristic_report(req: ReportRequest, average, dims, topic_scores, warning: str) -> ReportLLM:
    weak = [ts.topic for ts in topic_scores if ts.averageScore < 6]
    strong = [ts.topic for ts in topic_scores if ts.averageScore >= 7.5]
    missed: list[str] = []
    for t in req.turns:
        for m in t.missingPoints:
            if m not in missed:
                missed.append(m)
    weakest_dims = sorted(dims.items(), key=lambda kv: kv[1])[:2]
    summary = (
        f"Average score {average if average is not None else 'n/a'}/10 across {len(req.turns)} question(s). "
        "The written summary could not be generated because the AI provider was unavailable; "
        "the scores and topics below come from the per-question evaluations."
    )
    roadmap = [
        RoadmapStep(
            title=f"Revisit {topic}",
            focus=f"Scored below 6/10 on {topic}.",
            actions=["Review the fundamentals", "Practice explaining it aloud in 2 minutes"],
            duration="2-3 days",
        )
        for topic in weak[:4]
    ] or [
        RoadmapStep(
            title="Increase difficulty",
            focus="No weak topics detected.",
            actions=["Retake the interview at a harder level"],
            duration="1 week",
        )
    ]
    return ReportLLM(
        summary=summary,
        strengths=[f"Strong performance on {t}" for t in strong],
        weakAreas=weak,
        technicalGaps=missed[:10],
        communicationFeedback=(
            f"Lowest rubric dimensions: {', '.join(f'{k} ({v})' for k, v in weakest_dims)}." if weakest_dims else ""
        ),
        recommendedTopics=weak or [ts.topic for ts in topic_scores[:3]],
        roadmap=roadmap,
    )


async def generate_report(c: Container, req: ReportRequest) -> ReportResponse:
    average, dims, topic_scores = compute_stats(req)
    stats = {
        "averageScore": average,
        "dimensionAverages": dims,
        "topicScores": [ts.model_dump() for ts in topic_scores],
        "questions": len(req.turns),
    }
    # Ground the roadmap in the knowledge base: fetch reading material for the weakest topics.
    chunks: list[RetrievedChunk] = []
    seen: set[str] = set()
    # "mixed" interviews retrieve across the whole knowledge base (no topic filter).
    retrieval_category = "resume" if req.category == "mixed" else req.category
    for ts in topic_scores[:3]:
        for chunk in await _retrieve(c, ts.topic, retrieval_category, top_k=2):
            key = f"{chunk.doc_id}|{chunk.section}"
            if key not in seen:
                seen.add(key)
                chunks.append(chunk)

    warnings: list[str] = []
    mode = "ai"
    try:
        llm = await c.provider.generate_json(
            prompts.report_prompt(
                role=req.role,
                difficulty=req.difficulty,
                category=req.category,
                ctx=req.context.model_dump(),
                turns=[t.model_dump() for t in req.turns],
                stats=stats,
                knowledge_topics=sorted({ch.title for ch in chunks}) or ["DSA", "DBMS", "OS", "CN", "OOP", "System Design"],
            ),
            ReportLLM,
            system=prompts.BASE_SYSTEM,
            temperature=0.3,
            max_tokens=2000,
        )
    except LLM_ERRORS as exc:
        mode = "heuristic"
        message = getattr(exc, "message", str(exc))
        warnings.append(f"AI summary unavailable ({message}). Report built from per-question scores.")
        llm = _heuristic_report(req, average, dims, topic_scores, message)

    return ReportResponse(
        **llm.model_dump(),
        averageScore=average,
        dimensionAverages=dims,
        topicScores=topic_scores,
        sources=_sources(chunks[:6]),
        analysisMode=mode,
        warnings=warnings,
    )
