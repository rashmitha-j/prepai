"""AI explanation of coding submissions (the judge verdict itself is computed by the sandbox)."""
from __future__ import annotations

from app.core.container import Container
from app.models.schemas import CodeExplainLLM, CodeExplainRequest, CodeExplainResponse
from app.services import prompts


async def explain_submission(c: Container, req: CodeExplainRequest) -> CodeExplainResponse:
    result = await c.provider.generate_json(
        prompts.code_explain_prompt(
            title=req.problemTitle,
            description=req.problemDescription,
            code=req.code,
            verdict=req.verdict,
            compile_error=req.compileError,
            failed=req.failedTests,
        ),
        CodeExplainLLM,
        system=prompts.BASE_SYSTEM,
        temperature=0.2,
    )
    return CodeExplainResponse(**result.model_dump())
