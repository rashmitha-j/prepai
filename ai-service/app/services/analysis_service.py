"""Resume, job-description and match analysis.

Pattern used throughout: deterministic extraction first (always available,
reproducible), LLM enrichment second (validated), explicit `analysisMode` so the
UI can tell users when they are seeing keyword-only results.
"""
from __future__ import annotations

import logging
import re

from app.core.container import Container
from app.core.errors import AIOutputValidationError, ProviderResponseError, ProviderUnavailableError
from app.models.schemas import (
    Coverage,
    JobAnalysisLLM,
    JobAnalysisResponse,
    MatchNarrativeLLM,
    MatchRequest,
    MatchResponse,
    RelevantProject,
    ResumeAnalysisLLM,
    ResumeAnalysisResponse,
    TechnologyAlignment,
)
from app.rag.cleaning import clean_text, truncate
from app.services import prompts
from app.services.skills import extract_skills, normalize_many, skill_overlap

logger = logging.getLogger("prepai.analysis")

FALLBACK_ERRORS = (ProviderUnavailableError, ProviderResponseError, AIOutputValidationError)

MATCH_DISCLAIMER = (
    "This is an interview-preparation aid, not a hiring decision. Skill coverage is an approximate "
    "keyword heuristic and cannot judge depth of experience."
)


def _fallback_warning(exc: Exception) -> str:
    message = getattr(exc, "message", str(exc))
    return f"AI analysis unavailable ({message}). Showing keyword-based extraction only."


# ------------------------------------------------------------------ resume
async def analyze_resume(c: Container, text: str) -> ResumeAnalysisResponse:
    cleaned = clean_text(text)
    detected = extract_skills(cleaned)
    try:
        llm = await c.provider.generate_json(
            prompts.resume_prompt(truncate(cleaned, c.settings.max_input_chars)),
            ResumeAnalysisLLM,
            system=prompts.BASE_SYSTEM,
            temperature=0.1,
        )
    except FALLBACK_ERRORS as exc:
        logger.info("Resume analysis falling back to heuristic: %s", exc)
        return ResumeAnalysisResponse(
            skills=detected,
            technologies=[],
            detectedSkills=detected,
            analysisMode="heuristic",
            warnings=[_fallback_warning(exc)],
        )

    # Merge: canonicalise LLM skills and add anything the taxonomy found that the model missed.
    skills = normalize_many(llm.skills + detected)
    data = llm.model_dump()
    data.update(skills=skills, technologies=normalize_many(llm.technologies), detectedSkills=detected)
    return ResumeAnalysisResponse(**data, analysisMode="ai")


# ------------------------------------------------------------------ job
_PREFERRED_RE = re.compile(r"(preferred|nice[- ]to[- ]have|bonus|good[- ]to[- ]have|\bplus\b|desirable)", re.I)
_REQUIRED_RE = re.compile(r"(requirement|required|must[- ]have|qualification|what you.?ll need|you have)", re.I)


def heuristic_job_skills(text: str) -> tuple[list[str], list[str]]:
    required: list[str] = []
    preferred: list[str] = []
    mode = "required"
    for line in text.split("\n"):
        if _PREFERRED_RE.search(line):
            mode = "preferred"
        elif _REQUIRED_RE.search(line):
            mode = "required"
        for skill in extract_skills(line):
            target = preferred if mode == "preferred" else required
            if skill not in required and skill not in preferred:
                target.append(skill)
    return required, preferred


async def analyze_job(c: Container, text: str, title: str = "", company: str = "") -> JobAnalysisResponse:
    cleaned = clean_text(text)
    detected = extract_skills(cleaned)
    try:
        llm = await c.provider.generate_json(
            prompts.job_prompt(truncate(cleaned, c.settings.max_input_chars), title, company),
            JobAnalysisLLM,
            system=prompts.BASE_SYSTEM,
            temperature=0.1,
        )
    except FALLBACK_ERRORS as exc:
        logger.info("Job analysis falling back to heuristic: %s", exc)
        required, preferred = heuristic_job_skills(cleaned)
        level = JobAnalysisLLM.model_validate({"experienceLevel": _level_hint(cleaned)}).experienceLevel
        first_line = next((ln.strip() for ln in cleaned.split("\n") if ln.strip()), "")
        return JobAnalysisResponse(
            title=title or (first_line[:100] if len(first_line) <= 100 else ""),
            company=company,
            requiredSkills=required,
            preferredSkills=preferred,
            technologies=[],
            experienceLevel=level,
            detectedSkills=detected,
            analysisMode="heuristic",
            warnings=[_fallback_warning(exc)],
        )

    data = llm.model_dump()
    data.update(
        title=title or llm.title,
        company=company or llm.company,
        requiredSkills=normalize_many(llm.requiredSkills),
        preferredSkills=normalize_many(llm.preferredSkills),
        technologies=normalize_many(llm.technologies),
        detectedSkills=detected,
    )
    return JobAnalysisResponse(**data, analysisMode="ai")


def _level_hint(text: str) -> str:
    match = re.search(r"(\d+)\s*\+?\s*(?:-\s*\d+\s*)?years?", text, re.I)
    if match:
        years = int(match.group(1))
        return "entry" if years <= 1 else "mid" if years <= 4 else "senior"
    for word in ("intern", "senior", "lead", "junior", "entry", "graduate", "fresher"):
        if re.search(rf"\b{word}\b", text, re.I):
            return word
    return "unspecified"


# ------------------------------------------------------------------ match
async def analyze_match(c: Container, req: MatchRequest) -> MatchResponse:
    resume, job = req.resume, req.job
    candidate_skills = resume.skills + resume.technologies + [t for p in resume.projects for t in p.technologies]
    required = job.requiredSkills or job.technologies
    matched, missing = skill_overlap(candidate_skills, required)
    pref_matched, pref_missing = skill_overlap(candidate_skills, job.preferredSkills)
    tech_matched, tech_missing = skill_overlap(candidate_skills, job.technologies)

    total = len(matched) + len(missing)
    coverage = Coverage(
        requiredMatched=len(matched),
        requiredTotal=total,
        preferredMatched=len(pref_matched),
        preferredTotal=len(pref_matched) + len(pref_missing),
        percent=round(100 * len(matched) / total) if total else None,
        label="Approximate keyword coverage of required skills (heuristic, not a hiring decision)",
    )
    all_matching = normalize_many(matched + pref_matched)
    warnings: list[str] = []
    mode = "ai"

    try:
        narrative = await c.provider.generate_json(
            prompts.match_prompt(resume.model_dump(), job.model_dump(), all_matching, missing),
            MatchNarrativeLLM,
            system=prompts.BASE_SYSTEM,
            temperature=0.2,
        )
        # Hallucination guard: keep only projects that actually exist on the resume.
        known = {p.name.strip().lower(): p.name for p in resume.projects}
        relevant = [
            RelevantProject(name=known[p.name.strip().lower()], reason=p.reason)
            for p in narrative.relevantProjects
            if p.name.strip().lower() in known
        ]
        dropped = len(narrative.relevantProjects) - len(relevant)
        if dropped:
            logger.info("Dropped %s hallucinated project reference(s)", dropped)
        experience_alignment = narrative.experienceAlignment
        topics = narrative.interviewTopics
        recommendations = narrative.recommendations
    except FALLBACK_ERRORS as exc:
        mode = "heuristic"
        warnings.append(_fallback_warning(exc))
        relevant = _heuristic_projects(resume, required + job.preferredSkills + job.technologies)
        experience_alignment = ""
        topics = normalize_many(missing[:5] + matched[:5])
        recommendations = [f"Review {s} fundamentals and prepare one concrete example of using it." for s in missing[:5]]

    return MatchResponse(
        matchingSkills=all_matching,
        missingSkills=missing,
        missingPreferredSkills=pref_missing,
        coverage=coverage,
        technologyAlignment=TechnologyAlignment(matched=tech_matched, missing=tech_missing),
        relevantProjects=relevant,
        experienceAlignment=experience_alignment,
        interviewTopics=topics,
        recommendations=recommendations,
        analysisMode=mode,
        warnings=warnings,
        disclaimer=MATCH_DISCLAIMER,
    )


def _heuristic_projects(resume, job_skills: list[str]) -> list[RelevantProject]:
    wanted = set(normalize_many(job_skills))
    out = []
    for p in resume.projects:
        project_skills = set(normalize_many(p.technologies + extract_skills(p.description)))
        overlap = sorted(project_skills & wanted)
        if overlap:
            out.append(RelevantProject(name=p.name, reason=f"Uses {', '.join(overlap[:5])}"))
    return out[:6]
