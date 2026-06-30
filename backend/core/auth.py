"""API-key gate for /api/* routes.

When ``settings.api_key`` is set, every request must send a matching
``X-API-Key`` header. When unset, auth is open so the public repo runs
without secrets. Compared with ``compare_digest`` to avoid timing leaks.
"""

from __future__ import annotations

from secrets import compare_digest

from fastapi import Header, HTTPException, status

from backend.core.settings import settings


async def require_api_key(x_api_key: str | None = Header(default=None)) -> None:
    if not settings.auth_enabled:
        return
    if x_api_key is None or not compare_digest(x_api_key, settings.api_key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key.",
        )
