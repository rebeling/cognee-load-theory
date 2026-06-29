"""Graph API.

Returns the knowledge graph from the active store. Cognee returns the real
entity/relation graph; the in-memory stub returns a trivial item chain.
"""

from fastapi import APIRouter

from backend.core.memory_store import store
from backend.core.models import GraphResponse

router = APIRouter(prefix="/cognee-graph", tags=["cognee-graph"])


@router.get("", response_model=GraphResponse)
def get_graph() -> GraphResponse:
    return store.graph()
