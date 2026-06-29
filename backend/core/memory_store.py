"""Memory storage abstraction.

`MemoryStore` is the interface every backend route depends on. `InMemoryStore`
is a process-local stub. A Cognee-backed implementation is added later behind
the same interface, requiring no route changes.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from backend.core.models import MemoryItem


class MemoryStore(ABC):
    @abstractmethod
    def remember(self, text: str) -> MemoryItem:
        """Store text, return the created item."""

    @abstractmethod
    def recall(self, query: str) -> list[MemoryItem]:
        """Return items matching query."""

    @abstractmethod
    def all(self) -> list[MemoryItem]:
        """Return all stored items."""


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

    def all(self) -> list[MemoryItem]:
        return list(self._items)


# Single shared instance reused by all routes. Swap for Cognee impl later.
store: MemoryStore = InMemoryStore()
