"""HTTP routes. Handlers are thin: validate (Pydantic) → call a service → return a schema."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.container import Container, get_container
from app.core.security import require_internal_token
from app.models.schemas import (
    CodeExplainRequest,
    CodeExplainResponse,
    EmbeddingsRequest,
    EmbeddingsResponse,
    EvaluateRequest,
    EvaluationResponse,
    FollowUpRequest,
    JobAnalysisResponse,
    JobAnalyzeRequest,
    MatchRequest,
    MatchResponse,
    QuestionRequest,
    QuestionResponse,
    RagIngestRequest,
    RagRetrieveRequest,
    RagRetrieveResponse,
    ReportRequest,
    ReportResponse,
    ResumeAnalysisResponse,
    ResumeAnalyzeRequest,
    RetrievedChunkOut,
)
from app.rag.pipeline import IngestDocument
from app.services import analysis_service, coding_service, interview_service

health_router = APIRouter(tags=["health"])
router = APIRouter(dependencies=[Depends(require_internal_token)])


@health_router.get("/health")
async def health(c: Container = Depends(get_container)):
    provider = await c.provider.health_check()
    embeddings = (
        {"status": provider.get("status"), "embedding": c.embedder.embedding_id}
        if c.embedder is c.provider
        else await c.embedder.health_check()
    )
    try:
        chunks = c.rag.store.count()
        store = {"status": "ok", "type": c.rag.store.kind, "chunks": chunks}
    except Exception:  # pragma: no cover - defensive
        store = {"status": "unavailable", "type": c.rag.store.kind}
    overall = "ok" if provider.get("status") == "ok" and store["status"] == "ok" else "degraded"
    return {
        "status": overall,
        "service": "prepai-ai-service",
        "environment": c.settings.environment,
        "provider": provider,
        "embeddings": embeddings,
        "vectorStore": store,
    }


# ------------------------------------------------------------ analysis
@router.post("/resume/analyze", response_model=ResumeAnalysisResponse, tags=["analysis"])
async def resume_analyze(body: ResumeAnalyzeRequest, c: Container = Depends(get_container)):
    return await analysis_service.analyze_resume(c, body.text)


@router.post("/job/analyze", response_model=JobAnalysisResponse, tags=["analysis"])
async def job_analyze(body: JobAnalyzeRequest, c: Container = Depends(get_container)):
    return await analysis_service.analyze_job(c, body.text, body.title, body.company)


@router.post("/match/analyze", response_model=MatchResponse, tags=["analysis"])
async def match_analyze(body: MatchRequest, c: Container = Depends(get_container)):
    return await analysis_service.analyze_match(c, body)


# ------------------------------------------------------------ interview
@router.post("/interview/question", response_model=QuestionResponse, tags=["interview"])
async def interview_question(body: QuestionRequest, c: Container = Depends(get_container)):
    return await interview_service.generate_question(c, body)


@router.post("/interview/evaluate", response_model=EvaluationResponse, tags=["interview"])
async def interview_evaluate(body: EvaluateRequest, c: Container = Depends(get_container)):
    return await interview_service.evaluate_answer(c, body)


@router.post("/interview/follow-up", response_model=QuestionResponse, tags=["interview"])
async def interview_follow_up(body: FollowUpRequest, c: Container = Depends(get_container)):
    return await interview_service.generate_follow_up(c, body)


@router.post("/interview/report", response_model=ReportResponse, tags=["interview"])
async def interview_report(body: ReportRequest, c: Container = Depends(get_container)):
    return await interview_service.generate_report(c, body)


# ------------------------------------------------------------ coding
@router.post("/coding/explain", response_model=CodeExplainResponse, tags=["coding"])
async def coding_explain(body: CodeExplainRequest, c: Container = Depends(get_container)):
    return await coding_service.explain_submission(c, body)


# ------------------------------------------------------------ rag
@router.post("/rag/ingest", tags=["rag"])
async def rag_ingest(body: RagIngestRequest, c: Container = Depends(get_container)):
    docs = [IngestDocument(id=d.id, title=d.title, topic=d.topic, source=d.source, content=d.content) for d in body.documents]
    return await c.rag.ingest(docs, replace=body.replace)


@router.post("/rag/retrieve", response_model=RagRetrieveResponse, tags=["rag"])
async def rag_retrieve(body: RagRetrieveRequest, c: Container = Depends(get_container)):
    chunks = await c.rag.retrieve(body.query, top_k=body.topK, topic=body.topic)
    return RagRetrieveResponse(
        query=body.query,
        embedding=c.embedder.embedding_id,
        chunks=[
            RetrievedChunkOut(
                id=ch.id, text=ch.text, score=ch.score, docId=ch.doc_id, title=ch.title,
                topic=ch.topic, section=ch.section, source=ch.source, chunkIndex=ch.chunk_index,
            )
            for ch in chunks
        ],
    )


@router.get("/rag/stats", tags=["rag"])
async def rag_stats(c: Container = Depends(get_container)):
    return c.rag.stats()


@router.delete("/rag/documents/{doc_id}", tags=["rag"])
async def rag_delete(doc_id: str, c: Container = Depends(get_container)):
    return {"docId": doc_id, "deletedChunks": c.rag.store.delete_document(doc_id)}


@router.post("/embeddings", response_model=EmbeddingsResponse, tags=["rag"])
async def embeddings(body: EmbeddingsRequest, c: Container = Depends(get_container)):
    vectors = await c.embedder.embed(body.texts)
    return EmbeddingsResponse(embeddings=vectors, embedding=c.embedder.embedding_id, dimensions=len(vectors[0]) if vectors else 0)
