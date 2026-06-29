"""Graph API (stub).

Builds a trivial graph: one node per stored item, chained by insertion order.
Replace with real Cognee knowledge graph later.
"""

from fastapi import APIRouter

from backend.core.memory_store import store
from backend.core.models import GraphEdge, GraphNode, GraphResponse

router = APIRouter(prefix="/graph", tags=["graph"])


@router.get("", response_model=GraphResponse)
def get_graph() -> GraphResponse:
    items = store.all()
    nodes = [GraphNode(id=i.id, label=i.text[:40]) for i in items]
    edges = [
        GraphEdge(source=items[n].id, target=items[n + 1].id)
        for n in range(len(items) - 1)
    ]
    return GraphResponse(nodes=nodes, edges=edges)
