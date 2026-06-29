"""Aggregate all capability routers under /api."""

from fastapi import APIRouter

from backend.api import actions, graph, ingest, load, memory, tasks

api_router = APIRouter(prefix="/api")
api_router.include_router(ingest.router)
api_router.include_router(memory.router)
api_router.include_router(tasks.router)
api_router.include_router(graph.router)
api_router.include_router(load.router)
api_router.include_router(actions.router)
