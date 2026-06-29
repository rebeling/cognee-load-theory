"""Task extraction (stub).

Derives a naive Task list from stored memory: one task per stored item.
Replace with real extraction (LLM / Cognee) later.
"""

from fastapi import APIRouter

from backend.core.memory_store import store
from backend.core.models import Task

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("", response_model=list[Task])
def list_tasks() -> list[Task]:
    tasks: list[Task] = []
    for item in store.all():
        title = item.text.strip().splitlines()[0][:80] if item.text.strip() else "(empty)"
        tasks.append(Task(id=item.id, title=title, source_id=item.id))
    return tasks
