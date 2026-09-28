"""Service-to-service authentication for the AI service."""
from __future__ import annotations

import hmac

from fastapi import Header, HTTPException, Request, status


async def require_internal_token(request: Request, x_internal_token: str | None = Header(default=None)) -> None:
    """Only the Node backend should call the AI service.

    If AI_SERVICE_TOKEN is configured, every request (except /health) must carry it in
    the X-Internal-Token header. In production the token is mandatory (enforced in main.py).
    """
    expected = request.app.state.container.settings.ai_service_token
    if not expected:
        return
    if not x_internal_token or not hmac.compare_digest(x_internal_token.encode(), expected.encode()):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
