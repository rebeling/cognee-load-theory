"""FastAPI Cloud entrypoint.

Serves the API (backend logic) and the static frontend from one process.
Deploy / run target: ``app.main:app``.
"""

from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from backend.api import api_router

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"

app = FastAPI(title="cognee-load-theory")
app.include_router(api_router)

# Mount frontend last so /api routes take precedence. html=True serves
# index.html at /.
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
