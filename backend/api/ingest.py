"""Ingestion: accept raw text into the source of truth."""

from fastapi import APIRouter, HTTPException

from backend.core.memory_store import CogneeStore, store
from backend.core.models import IngestRequest, MemoryItem

router = APIRouter(prefix="/ingest", tags=["ingest"])


@router.post("", response_model=MemoryItem)
def ingest(req: IngestRequest) -> MemoryItem:
    return store.remember(req.text)


@router.post("/demo")
def ingest_demo() -> dict:
    """Seed the demo fixtures (ontology + flattened family data) into Cognee.

    Runs against the active store — cloud or local — via the shared
    ``CogneeStore`` interface. ``seed_demo`` never branches on backend.
    """
    if not isinstance(store, CogneeStore):
        raise HTTPException(status_code=503, detail="Cognee not configured")
    from backend.core.demo_seed import seed_demo

    return seed_demo(store)
