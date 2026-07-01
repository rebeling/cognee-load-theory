"""Graph API.

Returns the knowledge graph from the active store. Cognee returns the real
entity/relation graph; the in-memory stub returns a trivial item chain.
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse

from backend.core.memory_store import store
from backend.core.models import GraphResponse

router = APIRouter(prefix="/cognee-graph", tags=["cognee-graph"])


@router.get("", response_model=GraphResponse)
def get_graph() -> GraphResponse:
    return store.graph()


@router.get("/viz", response_class=HTMLResponse)
def graph_viz() -> str:
    """Cognee's built-in interactive graph UI as a self-contained HTML page.

    Local mode only — cloud/in-memory stores have no in-process graph to render.
    """
    render = getattr(store, "graph_html", None)
    if render is None:
        raise HTTPException(
            status_code=503, detail="Graph viz available in local Cognee mode only."
        )
    return render()
