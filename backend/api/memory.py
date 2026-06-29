"""Cognee memory integration (stubbed via MemoryStore)."""

from fastapi import APIRouter

from backend.core.memory_store import store
from backend.core.models import MemoryItem, RecallRequest, RememberRequest

router = APIRouter(prefix="/memory", tags=["memory"])


@router.get("", response_model=list[MemoryItem])
def list_memory() -> list[MemoryItem]:
    return store.all()


@router.post("/remember", response_model=MemoryItem)
def remember(req: RememberRequest) -> MemoryItem:
    return store.remember(req.text)


@router.post("/recall", response_model=list[MemoryItem])
def recall(req: RecallRequest) -> list[MemoryItem]:
    return store.recall(req.query)
