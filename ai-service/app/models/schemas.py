"""Request/response schemas and the structured-output schemas the LLM must satisfy."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.fields import (
    Flag,
    Items,
    Score,
    ShortItems,
    Skills,
    Text80,
    Text200,
    Text500,
    Text1200,
    Text2500,
)

Difficulty = Literal["easy", "medium", "hard"]
Category = Literal[
    "dsa", "dbms", "sql", "os", "cn", "oop", "javascript", "react", "node",
    "system-design", "resume", "behavioral", "mixed",
]
AnalysisMode = Literal["ai", "heuristic"]


class Lenient(BaseModel):
    """Base for LLM output: ignore unknown keys instead of failing."""

    model_config = ConfigDict(extra="ignore")


class Strict(BaseModel):
    """Base for requests: reject unknown keys."""

    model_config = ConfigDict(extra="forbid")


# ---------------------------------------------------------------- sources
class SourceRef(BaseModel):
    id: str
    title: str
    topic: str
    section: str = ""
    source: str = ""
    score: float


# ---------------------------------------------------------------- resume
class ResumeProject(Lenient):
    name: Text200
    description: Text500 = ""
    technologies: Skills = []


class ResumeExperience(Lenient):
    title: Text200
    organization: Text200 = ""
    duration: Text80 = ""
    highlights: ShortItems = []


class ResumeEducation(Lenient):
    degree: Text200
    institution: Text200 = ""
    year: Text80 = ""


class ResumeAnalysisLLM(Lenient):
    summary: Text1200 = ""
    skills: Skills = []
    technologies: Skills = []
    projects: list[ResumeProject] = Field(default_factory=list, max_length=12)
    experience: list[ResumeExperience] = Field(default_factory=list, max_length=12)
    education: list[ResumeEducation] = Field(default_factory=list, max_length=6)
    strengths: Items = []
    possibleGaps: Items = []

    @field_validator("projects", "experience", "education", mode="before")
    @classmethod
    def _truncate_lists(cls, v):
        if v is None:
            return []
        if isinstance(v, dict):
            v = [v]
        return [item for item in v if isinstance(item, dict)][:12] if isinstance(v, list) else v


class ResumeAnalyzeRequest(Strict):
    text: str = Field(min_length=50, max_length=60000)


class ResumeAnalysisResponse(ResumeAnalysisLLM):
    detectedSkills: Skills = []
    analysisMode: AnalysisMode
    warnings: list[str] = []


# ---------------------------------------------------------------- job
ExperienceLevel = Literal["intern", "entry", "mid", "senior", "lead", "unspecified"]


class JobAnalysisLLM(Lenient):
    title: Text200 = ""
    company: Text200 = ""
    summary: Text1200 = ""
    requiredSkills: Skills = []
    preferredSkills: Skills = []
    responsibilities: Items = []
    technologies: Skills = []
    experienceLevel: ExperienceLevel = "unspecified"

    @field_validator("experienceLevel", mode="before")
    @classmethod
    def _level(cls, v):
        text = str(v or "").lower()
        for key, words in {
            "intern": ("intern",),
            "lead": ("lead", "principal", "staff", "architect"),
            "senior": ("senior", "sr", "5+", "6+", "7+", "8+"),
            "mid": ("mid", "intermediate", "3+", "4+", "2-5", "3-5"),
            "entry": ("entry", "junior", "jr", "graduate", "fresher", "new grad", "0-2", "1+", "0-1"),
        }.items():
            if any(w in text for w in words):
                return key
        return "unspecified"


class JobAnalyzeRequest(Strict):
    text: str = Field(min_length=50, max_length=30000)
    title: str = Field(default="", max_length=200)
    company: str = Field(default="", max_length=200)


class JobAnalysisResponse(JobAnalysisLLM):
    detectedSkills: Skills = []
    analysisMode: AnalysisMode
    warnings: list[str] = []


# ---------------------------------------------------------------- match
class ProjectRef(Strict):
    name: str = Field(max_length=200)
    description: str = Field(default="", max_length=1000)
    technologies: list[str] = Field(default_factory=list, max_length=40)


class ResumeProfile(Strict):
    summary: str = Field(default="", max_length=3000)
    skills: list[str] = Field(default_factory=list, max_length=150)
    technologies: list[str] = Field(default_factory=list, max_length=150)
    projects: list[ProjectRef] = Field(default_factory=list, max_length=20)
    experience: list[str] = Field(default_factory=list, max_length=20)


class JobProfile(Strict):
    title: str = Field(default="", max_length=200)
    summary: str = Field(default="", max_length=3000)
    requiredSkills: list[str] = Field(default_factory=list, max_length=100)
    preferredSkills: list[str] = Field(default_factory=list, max_length=100)
    technologies: list[str] = Field(default_factory=list, max_length=100)
    responsibilities: list[str] = Field(default_factory=list, max_length=30)
    experienceLevel: str = Field(default="unspecified", max_length=40)


class MatchRequest(Strict):
    resume: ResumeProfile
    job: JobProfile


class RelevantProject(Lenient):
    name: Text200
    reason: Text500 = ""


class MatchNarrativeLLM(Lenient):
    relevantProjects: list[RelevantProject] = Field(default_factory=list, max_length=6)
    experienceAlignment: Text1200 = ""
    interviewTopics: Items = []
    recommendations: Items = []

    @field_validator("relevantProjects", mode="before")
    @classmethod
    def _projects(cls, v):
        if not isinstance(v, list):
            return []
        out = []
        for item in v[:6]:
            if isinstance(item, str):
                out.append({"name": item})
            elif isinstance(item, dict):
                out.append(item)
        return out


class Coverage(BaseModel):
    requiredMatched: int
    requiredTotal: int
    preferredMatched: int
    preferredTotal: int
    percent: int | None
    label: str


class TechnologyAlignment(BaseModel):
    matched: list[str]
    missing: list[str]


class MatchResponse(BaseModel):
    title: str = "Interview Preparation Match Analysis"
    matchingSkills: list[str]
    missingSkills: list[str]
    missingPreferredSkills: list[str]
    coverage: Coverage
    technologyAlignment: TechnologyAlignment
    relevantProjects: list[RelevantProject]
    experienceAlignment: str
    interviewTopics: list[str]
    recommendations: list[str]
    analysisMode: AnalysisMode
    warnings: list[str] = []
    disclaimer: str


# ---------------------------------------------------------------- interview
class HistoryItem(Strict):
    question: str = Field(max_length=2000)
    topic: str = Field(default="", max_length=200)
    answerExcerpt: str = Field(default="", max_length=1500)
    score: float | None = Field(default=None, ge=0, le=10)
    missingPoints: list[str] = Field(default_factory=list, max_length=10)


class CandidateContext(Strict):
    """Compact, pre-summarised context. The backend never forwards raw PII-heavy documents."""

    resumeSummary: str = Field(default="", max_length=3000)
    resumeSkills: list[str] = Field(default_factory=list, max_length=80)
    resumeProjects: list[str] = Field(default_factory=list, max_length=12)
    jobTitle: str = Field(default="", max_length=200)
    jobSummary: str = Field(default="", max_length=3000)
    jobSkills: list[str] = Field(default_factory=list, max_length=80)
    missingSkills: list[str] = Field(default_factory=list, max_length=40)


class QuestionRequest(Strict):
    role: str = Field(min_length=2, max_length=120)
    difficulty: Difficulty
    category: Category
    context: CandidateContext = Field(default_factory=CandidateContext)
    history: list[HistoryItem] = Field(default_factory=list, max_length=30)
    questionNumber: int = Field(default=1, ge=1, le=50)
    totalQuestions: int = Field(default=5, ge=1, le=50)
    excludeSourceIds: list[str] = Field(default_factory=list, max_length=100)


class GeneratedQuestionLLM(Lenient):
    question: Text1200
    topic: Text200 = ""
    expectedPoints: ShortItems = []
    rationale: Text500 = ""

    @field_validator("question")
    @classmethod
    def _non_empty(cls, v: str) -> str:
        if len(v) < 10:
            raise ValueError("question is too short")
        return v


class QuestionResponse(BaseModel):
    question: str
    topic: str
    category: str
    difficulty: str
    expectedPoints: list[str]
    rationale: str
    isFollowUp: bool = False
    sources: list[SourceRef] = []


class RubricScores(Lenient):
    correctness: Score
    relevance: Score
    technicalDepth: Score
    clarity: Score
    completeness: Score
    communication: Score


class FollowUpSuggestion(Lenient):
    shouldAsk: Flag = False
    question: Text1200 = ""
    reason: Text500 = ""


class EvaluationLLM(Lenient):
    scores: RubricScores
    summary: Text1200
    strengths: ShortItems = []
    missingPoints: ShortItems = []
    suggestions: ShortItems = []
    modelAnswer: Text2500 = ""
    followUp: FollowUpSuggestion = Field(default_factory=FollowUpSuggestion)


class EvaluateRequest(Strict):
    role: str = Field(min_length=2, max_length=120)
    difficulty: Difficulty
    category: Category
    question: str = Field(min_length=5, max_length=2000)
    topic: str = Field(default="", max_length=200)
    expectedPoints: list[str] = Field(default_factory=list, max_length=10)
    answer: str = Field(min_length=1, max_length=8000)


class EvaluationResponse(EvaluationLLM):
    overallScore: float
    sources: list[SourceRef] = []


class FollowUpRequest(Strict):
    role: str = Field(min_length=2, max_length=120)
    difficulty: Difficulty
    category: Category
    question: str = Field(min_length=5, max_length=2000)
    topic: str = Field(default="", max_length=200)
    answer: str = Field(min_length=1, max_length=8000)
    missingPoints: list[str] = Field(default_factory=list, max_length=10)
    suggestedQuestion: str = Field(default="", max_length=1200)


# ---------------------------------------------------------------- report
class ReportTurn(Strict):
    question: str = Field(max_length=2000)
    topic: str = Field(default="", max_length=200)
    category: str = Field(default="", max_length=40)
    answerExcerpt: str = Field(default="", max_length=1500)
    overallScore: float | None = Field(default=None, ge=0, le=10)
    scores: dict[str, float] = Field(default_factory=dict)
    strengths: list[str] = Field(default_factory=list, max_length=10)
    missingPoints: list[str] = Field(default_factory=list, max_length=10)
    isFollowUp: bool = False


class ReportRequest(Strict):
    role: str = Field(min_length=2, max_length=120)
    difficulty: Difficulty
    category: Category
    context: CandidateContext = Field(default_factory=CandidateContext)
    turns: list[ReportTurn] = Field(min_length=1, max_length=40)


DEFAULT_ROADMAP_DURATION = "2-3 days"


class RoadmapStep(Lenient):
    title: Text200
    focus: Text500 = ""
    actions: ShortItems = []
    duration: Text80 = ""

    @model_validator(mode="after")
    def _default_duration(self):
        # Models sometimes omit the duration or send ""; every step shown to the user gets one.
        if not self.duration.strip():
            self.duration = DEFAULT_ROADMAP_DURATION
        return self


class ReportLLM(Lenient):
    summary: Text2500
    strengths: Items = []
    weakAreas: Items = []
    technicalGaps: Items = []
    communicationFeedback: Text1200 = ""
    recommendedTopics: Items = []
    roadmap: list[RoadmapStep] = Field(default_factory=list, max_length=8)

    @field_validator("roadmap", mode="before")
    @classmethod
    def _roadmap(cls, v):
        if not isinstance(v, list):
            return []
        return [({"title": i} if isinstance(i, str) else i) for i in v if isinstance(i, (str, dict, RoadmapStep))][:8]


class TopicScore(BaseModel):
    topic: str
    averageScore: float
    questions: int


class ReportResponse(ReportLLM):
    averageScore: float | None
    dimensionAverages: dict[str, float]
    topicScores: list[TopicScore]
    sources: list[SourceRef] = []
    analysisMode: AnalysisMode = "ai"
    warnings: list[str] = []


# ---------------------------------------------------------------- coding
class CodeExplainRequest(Strict):
    problemTitle: str = Field(max_length=200)
    problemDescription: str = Field(max_length=6000)
    language: Literal["cpp"] = "cpp"
    code: str = Field(min_length=1, max_length=20000)
    verdict: str = Field(max_length=40)
    compileError: str = Field(default="", max_length=4000)
    failedTests: list[dict] = Field(default_factory=list, max_length=5)


class CodeExplainLLM(Lenient):
    summary: Text1200
    likelyIssues: ShortItems = []
    timeComplexity: Text200 = ""
    spaceComplexity: Text200 = ""
    improvements: ShortItems = []


class CodeExplainResponse(CodeExplainLLM):
    disclaimer: str = "AI explanation — verify against the actual test results."


# ---------------------------------------------------------------- rag
class RagDocument(Strict):
    id: str = Field(min_length=1, max_length=120, pattern=r"^[A-Za-z0-9_.:-]+$")
    title: str = Field(min_length=1, max_length=200)
    topic: str = Field(min_length=1, max_length=60)
    source: str = Field(default="", max_length=300)
    content: str = Field(min_length=20, max_length=300000)


class RagIngestRequest(Strict):
    documents: list[RagDocument] = Field(min_length=1, max_length=50)
    replace: bool = True


class RagRetrieveRequest(Strict):
    query: str = Field(min_length=2, max_length=2000)
    topK: int = Field(default=4, ge=1, le=10)
    topic: str | None = Field(default=None, max_length=60)


class RetrievedChunkOut(BaseModel):
    id: str
    text: str
    score: float
    docId: str
    title: str
    topic: str
    section: str
    source: str
    chunkIndex: int


class RagRetrieveResponse(BaseModel):
    query: str
    chunks: list[RetrievedChunkOut]
    embedding: str


class EmbeddingsRequest(Strict):
    texts: list[str] = Field(min_length=1, max_length=64)

    @field_validator("texts")
    @classmethod
    def _limits(cls, v: list[str]) -> list[str]:
        if any(not t.strip() or len(t) > 8000 for t in v):
            raise ValueError("each text must be non-empty and at most 8000 characters")
        return v


class EmbeddingsResponse(BaseModel):
    embeddings: list[list[float]]
    embedding: str
    dimensions: int
