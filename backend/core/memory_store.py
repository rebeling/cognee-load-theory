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


class CogneeStore(MemoryStore):
    """Interface for a Cognee-backed store (cloud REST or local in-process lib).

    Extends `MemoryStore` with the Cognee-specific capabilities that
    transport-agnostic prep logic (e.g. `demo_seed`) depends on. Both backends
    — `CogneeCloudStore` (httpx) and `CogneeLocalStore` (cognee lib) — implement
    this identically, so `seed_demo(store)` and routes never branch on backend.
    """

    @property
    @abstractmethod
    def dataset(self) -> str:
        """Name of the dataset all text is grouped under."""

    @abstractmethod
    def upload_ontology(
        self, key: str, owl_bytes: bytes, description: str | None = None
    ) -> str:
        """Register an OWL ontology under `key` (idempotent). Returns the key."""

    @abstractmethod
    def remember_file(
        self, content: bytes, filename: str, ontology_key: str | None = None
    ) -> dict:
        """Ingest a file and build the graph, grounded on an ontology by key."""


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
    # Backends imported lazily so the in-memory path pulls in neither httpx nor
    # the cognee library.
    if settings.cognee_mode == "local":
        from backend.core.cognee_local_store import CogneeLocalStore

        return CogneeLocalStore()
    if settings.cognee_enabled:
        from backend.core.cognee_store import CogneeCloudStore

        return CogneeCloudStore()
    return InMemoryStore()


def __getattr__(name: str) -> object:
    """Lazily build the active store on first access to ``store``.

    Deferring construction (rather than building at import time) avoids a
    circular import: the concrete backends import ``CogneeStore`` from this
    module, so eagerly constructing one here while this module is still
    initializing would re-enter a partially-defined module.
    """
    if name == "store":
        global store
        store = _build_store()
        return store
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


# Active store, selected on first access. COGNEE_MODE=local uses the in-process
# cognee lib; else cloud REST when configured; else the in-memory stub.
store: MemoryStore
