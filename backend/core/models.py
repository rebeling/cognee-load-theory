"""Pydantic request/response schemas shared across the API."""

from __future__ import annotations

from pydantic import BaseModel


class IngestRequest(BaseModel):
    text: str


class MemoryItem(BaseModel):
    id: int
    text: str


class RememberRequest(BaseModel):
    text: str


class RecallRequest(BaseModel):
    query: str


class Task(BaseModel):
    id: int
    title: str
    source_id: int


class GraphNode(BaseModel):
    id: int
    label: str


class GraphEdge(BaseModel):
    source: int
    target: int


class GraphResponse(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]


class LoadScore(BaseModel):
    score: int
    detail: str


class ActionRequest(BaseModel):
    action: str
    payload: dict | None = None


class ActionResult(BaseModel):
    action: str
    status: str
    result: dict
