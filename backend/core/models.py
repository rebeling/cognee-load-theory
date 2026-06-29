"""Pydantic request/response schemas shared across the API."""

from __future__ import annotations

from pydantic import BaseModel


class IngestRequest(BaseModel):
    text: str


class MemoryItem(BaseModel):
    # int for the in-memory stub; str (uuid/name) for Cognee-backed items.
    id: int | str
    text: str


class RememberRequest(BaseModel):
    text: str


class RecallRequest(BaseModel):
    query: str


class RecallAnswer(BaseModel):
    query: str
    answer: str


class Task(BaseModel):
    id: int | str
    title: str
    source_id: int | str


class GraphNode(BaseModel):
    id: int | str
    label: str
    type: str = ""
    properties: dict = {}


class GraphEdge(BaseModel):
    source: int | str
    target: int | str
    label: str = ""


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
