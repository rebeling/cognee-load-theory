"""FastAPI Cloud entrypoint.

JSON API only. The Next.js frontend is served separately (dev :3000, prod
on Vercel) and calls this API over CORS.
Deploy / run target: ``app.main:app``.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api import api_router
from backend.core.settings import settings
from app.utils import get_title, get_version


# Next.js frontend origins allowed to call /api: local dev + Vercel deploy.
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "https://cognee-load-theory.vercel.app",
]

# Hide interactive docs unless explicitly enabled (DOCS_ENABLED=true in dev).
_docs = dict(
    docs_url="/docs" if settings.docs_enabled else None,
    redoc_url="/redoc" if settings.docs_enabled else None,
    openapi_url="/openapi.json" if settings.docs_enabled else None,
)

app = FastAPI(title=get_title(), version=get_version(), **_docs)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(api_router)
