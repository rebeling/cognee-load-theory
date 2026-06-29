"""Memory storage abstraction.

`MemoryStore` is the interface every backend route depends on. `InMemoryStore`
is a process-local stub. `CogneeStore` (see cognee_store.py) talks to a
self-hosted Cognee instance behind the same interface. The active `store` is
chosen at import time based on settings — routes never change.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from backend.core.models import GraphEdge, GraphNode, GraphResponse, MemoryItem
from backend.core.settings import settings


class MemoryStore(ABC):
    @abstractmethod
    def remember(self, text: str) -> MemoryItem:
        """Store text (and build graph), return the created item."""

    @abstractmethod
    def recall(self, query: str) -> list[MemoryItem]:
        """Return stored items matching query."""

    @abstractmethod
    def recall_answer(self, query: str) -> str:
        """Return a natural-language answer synthesised from memory."""

    @abstractmethod
    def all(self) -> list[MemoryItem]:
        """Return all stored items."""

    @abstractmethod
    def graph(self) -> GraphResponse:
        """Return the knowledge graph (nodes + edges)."""


class InMemoryStore(MemoryStore):
    def __init__(self) -> None:
        self._items: list[MemoryItem] = []
        self._next_id = 1

    def remember(self, text: str) -> MemoryItem:
        item = MemoryItem(id=self._next_id, text=text)
        self._items.append(item)
        self._next_id += 1
        return item

    def recall(self, query: str) -> list[MemoryItem]:
        q = query.lower()
        return [i for i in self._items if q in i.text.lower()]

    def recall_answer(self, query: str) -> str:
        hits = self.recall(query)
        if not hits:
            return "No matching memory."
        return " ".join(i.text for i in hits)

    def all(self) -> list[MemoryItem]:
        return list(self._items)

    def graph(self) -> GraphResponse:
        # Trivial stand-in: one node per item, chained by insertion order.
        nodes = [GraphNode(id=i.id, label=i.text[:40]) for i in self._items]
        edges = [
            GraphEdge(source=self._items[n].id, target=self._items[n + 1].id)
            for n in range(len(self._items) - 1)
        ]
        return GraphResponse(nodes=nodes, edges=edges)


def _build_store() -> MemoryStore:
    if settings.cognee_enabled:
        # Imported lazily so the in-memory path has no httpx/Cognee dependency.
        from backend.core.cognee_store import CogneeStore

        return CogneeStore()
    return InMemoryStore()


# Active store, selected once at import. Cognee when configured, else in-memory.
store: MemoryStore = _build_store()
