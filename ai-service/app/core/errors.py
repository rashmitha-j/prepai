"""Domain errors and their translation into safe HTTP responses."""
from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

logger = logging.getLogger("prepai.errors")


class AIServiceError(Exception):
    status_code = 500
    code = "AI_SERVICE_ERROR"

    def __init__(self, message: str, *, detail: str | None = None):
        super().__init__(message)
        self.message = message
        self.detail = detail


class ProviderUnavailableError(AIServiceError):
    """The configured LLM/embedding provider cannot be reached or is misconfigured."""

    status_code = 503
    code = "AI_PROVIDER_UNAVAILABLE"


class ProviderResponseError(AIServiceError):
    """The provider answered, but with an error or an unusable payload."""

    status_code = 502
    code = "AI_PROVIDER_ERROR"


class AIOutputValidationError(AIServiceError):
    """The model output did not match the required schema even after a repair attempt."""

    status_code = 502
    code = "AI_OUTPUT_INVALID"


class RetrievalError(AIServiceError):
    status_code = 500
    code = "RETRIEVAL_ERROR"


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AIServiceError)
    async def _ai_error(_: Request, exc: AIServiceError):
        logger.warning("%s: %s (%s)", exc.code, exc.message, exc.detail or "-")
        return JSONResponse(status_code=exc.status_code, content={"error": {"code": exc.code, "message": exc.message}})

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError):
        issues = [
            {"field": ".".join(str(p) for p in err.get("loc", [])[1:]), "message": err.get("msg", "invalid")}
            for err in exc.errors()[:10]
        ]
        return JSONResponse(
            status_code=422,
            content={"error": {"code": "VALIDATION_ERROR", "message": "Invalid request", "issues": issues}},
        )

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception):
        logger.exception("Unhandled error: %s", exc)
        return JSONResponse(
            status_code=500,
            content={"error": {"code": "INTERNAL_ERROR", "message": "Internal AI service error"}},
        )
