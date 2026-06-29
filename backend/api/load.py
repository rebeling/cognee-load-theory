"""Load score (simple example).

Score = number of extracted tasks (one per stored item). Stand-in for a real
load-theory metric.
"""

from fastapi import APIRouter

from backend.core.memory_store import store
from backend.core.models import LoadScore

router = APIRouter(prefix="/load", tags=["load"])


@router.get("", response_model=LoadScore)
def get_load() -> LoadScore:
    count = len(store.all())
    return LoadScore(score=count, detail=f"{count} item(s) in memory")
