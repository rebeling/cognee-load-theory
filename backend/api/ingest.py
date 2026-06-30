"""Ingestion: accept raw text into the source of truth."""

from fastapi import APIRouter, HTTPException

from backend.core.memory_store import store
from backend.core.models import IngestRequest, MemoryItem
from backend.core.settings import settings

router = APIRouter(prefix="/ingest", tags=["ingest"])


@router.post("", response_model=MemoryItem)
def ingest(req: IngestRequest) -> MemoryItem:
    return store.remember(req.text)


@router.post("/demo")
def ingest_demo() -> dict:
    """Seed the demo fixtures (ontology + flattened family data) into Cognee."""
    if not settings.cognee_enabled:
        raise HTTPException(status_code=503, detail="Cognee not configured")
    from backend.core.cognee_store import CogneeStore
    from backend.core.demo_seed import seed_demo

    return seed_demo(CogneeStore())
