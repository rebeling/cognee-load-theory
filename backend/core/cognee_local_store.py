"""MemoryStore backed by the in-process ``cognee`` package (no HTTP server).

Same ``CogneeStore`` interface as the cloud backend — only the transport
differs: cloud makes REST calls, this calls the cognee library directly. All
cognee entry points are async, so each method wraps them in ``asyncio.run``
(routes are sync, matching how the cloud store is used).

Text is grouped under a single dataset (``settings.cognee_dataset``). Ontology
grounding mirrors cloud: an OWL file registered via ``upload_ontology`` is
loaded into an ``RDFLibOntologyResolver`` and passed to ``cognify`` so entity
extraction is validated against it.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import cognee
from cognee import SearchType
from cognee.infrastructure.databases.graph import get_graph_engine
from cognee.modules.ontology.rdf_xml.RDFLibOntologyResolver import (
    RDFLibOntologyResolver,
)

from backend.core.memory_store import CogneeStore
from backend.core.models import GraphEdge, GraphNode, GraphResponse, MemoryItem
from backend.core.settings import settings

# Persistent storage for local mode, under the project root (NOT inside .venv,
# where cognee defaults and which is wiped on `uv sync`). Holds cognee's data +
# system dirs and cached OWL ontologies.
_STORAGE_DIR = Path(__file__).resolve().parents[2] / ".cognee_data"
_ONTOLOGY_DIR = _STORAGE_DIR / "ontologies"


class CogneeLocalStore(CogneeStore):
    def __init__(self) -> None:
        self._dataset = settings.cognee_dataset
        _ONTOLOGY_DIR.mkdir(parents=True, exist_ok=True)
        # Pin cognee's sqlite/vector/graph storage to a stable, writable dir.
        # Must happen before any cognee.add/cognify/search call.
        cognee.config.data_root_directory(str(_STORAGE_DIR / "data"))
        cognee.config.system_root_directory(str(_STORAGE_DIR / "system"))

    @property
    def dataset(self) -> str:
        return self._dataset

    def _ontology_path(self, key: str) -> Path:
        return _ONTOLOGY_DIR / f"{key}.owl"

    async def _ingest(self, text: str, ontology_key: str | None = None) -> None:
        await cognee.add(text, dataset_name=self._dataset)
        config = None
        if ontology_key is not None:
            path = self._ontology_path(ontology_key)
            if path.exists():
                resolver = RDFLibOntologyResolver(ontology_file=str(path))
                config = {"ontology_config": {"ontology_resolver": resolver}}
        await cognee.cognify(datasets=[self._dataset], config=config)

    def remember(self, text: str) -> MemoryItem:
        asyncio.run(self._ingest(text))
        return MemoryItem(id=self._dataset, text=text)

    def upload_ontology(
        self, key: str, owl_bytes: bytes, description: str | None = None
    ) -> str:
        """Cache the OWL file under ``key`` (idempotent). Returns the key."""
        path = self._ontology_path(key)
        if not path.exists():
            path.write_bytes(owl_bytes)
        return key

    def remember_file(
        self, content: bytes, filename: str, ontology_key: str | None = None
    ) -> dict:
        """Ingest a file and build the graph, grounded on an ontology by key."""
        text = content.decode("utf-8")
        asyncio.run(self._ingest(text, ontology_key=ontology_key))
        return {"status": "ok", "dataset": self._dataset, "filename": filename}

    async def _dataset_id(self):
        for ds in await cognee.datasets.list_datasets():
            if ds.name == self._dataset:
                return ds.id
        return None

    async def _list_items(self) -> list[MemoryItem]:
        ds_id = await self._dataset_id()
        if ds_id is None:
            return []
        data = await cognee.datasets.list_data(ds_id) or []
        return [MemoryItem(id=str(d.id), text=d.name or "") for d in data]

    def _search(self, query: str, query_type: SearchType) -> list:
        return asyncio.run(
            cognee.search(
                query_text=query,
                query_type=query_type,
                datasets=[self._dataset],
            )
        ) or []

    @staticmethod
    def _result_text(result) -> str:
        return str(getattr(result, "search_result", result))

    def recall(self, query: str) -> list[MemoryItem]:
        results = self._search(query, SearchType.CHUNKS)
        return [
            MemoryItem(id=str(i), text=self._result_text(r))
            for i, r in enumerate(results)
        ]

    def recall_answer(self, query: str) -> str:
        results = self._search(query, SearchType.GRAPH_COMPLETION)
        return self._result_text(results[0]) if results else "No answer."

    def all(self) -> list[MemoryItem]:
        return asyncio.run(self._list_items())

    async def _graph(self) -> GraphResponse:
        engine = await get_graph_engine()
        raw_nodes, raw_edges = await engine.get_graph_data()
        nodes = [
            GraphNode(
                id=str(nid),
                label=str(props.get("name", props.get("id", nid))),
                type=str(props.get("type", "")),
                properties=props,
            )
            for nid, props in raw_nodes
        ]
        edges = [
            GraphEdge(source=str(src), target=str(tgt), label=str(rel))
            for src, tgt, rel, _props in raw_edges
        ]
        return GraphResponse(nodes=nodes, edges=edges)

    def graph(self) -> GraphResponse:
        return asyncio.run(self._graph())

    def graph_html(self) -> str:
        """Render cognee's built-in interactive graph visualization as HTML.

        Local-only — reads the in-process cognee graph DB. No cloud equivalent,
        so this lives on the local store, not the shared interface.
        """
        return asyncio.run(cognee.visualize_graph(dataset=self._dataset))
