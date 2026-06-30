"""Aggregate all capability routers under /api."""

from fastapi import APIRouter, Depends

from backend.api import actions, graph, ingest, load, memory, tasks
from backend.core.auth import require_api_key

api_router = APIRouter(prefix="/api", dependencies=[Depends(require_api_key)])
api_router.include_router(ingest.router)
api_router.include_router(memory.router)
api_router.include_router(tasks.router)
api_router.include_router(graph.router)
api_router.include_router(load.router)
api_router.include_router(actions.router)
