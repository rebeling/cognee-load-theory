"""Ingestion: accept raw text into the source of truth."""

from fastapi import APIRouter

from backend.core.memory_store import store
from backend.core.models import IngestRequest, MemoryItem

router = APIRouter(prefix="/ingest", tags=["ingest"])


@router.post("", response_model=MemoryItem)
def ingest(req: IngestRequest) -> MemoryItem:
    return store.remember(req.text)
