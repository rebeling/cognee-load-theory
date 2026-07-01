"""MemoryStore backed by a self-hosted Cognee instance (REST over HTTP).

Auth is the ``X-Api-Key`` header. All text is grouped under a single dataset
(``settings.cognee_dataset``). ``remember`` runs add_text then cognify so the
knowledge graph is current after each ingest.
"""

from __future__ import annotations

import httpx

from backend.core.memory_store import CogneeStore
from backend.core.models import GraphEdge, GraphNode, GraphResponse, MemoryItem
from backend.core.settings import settings


class CogneeError(RuntimeError):
    """Raised when the Cognee API returns an error."""


class CogneeCloudStore(CogneeStore):
    """Cognee backend over the cloud REST API (httpx)."""

    def __init__(self) -> None:
        if not settings.cognee_enabled:
            raise CogneeError("Cognee is not configured (missing API key / base URL).")
        self._base = settings.cognee_api_base_url.rstrip("/")
        self._dataset = settings.cognee_dataset
        self._client = httpx.Client(
            base_url=self._base,
            headers={"X-Api-Key": settings.cognee_api_key},
            timeout=60.0,
        )

    @property
    def dataset(self) -> str:
        return self._dataset

    def _post(self, path: str, json: dict) -> object:
        try:
            res = self._client.post(path, json=json)
            res.raise_for_status()
        except httpx.HTTPError as exc:
            raise CogneeError(f"Cognee POST {path} failed: {exc}") from exc
        return res.json()

    def _post_multipart(
        self, path: str, data: dict, files: dict, timeout: float | None = None
    ) -> object:
        try:
            res = self._client.post(path, data=data, files=files, timeout=timeout)
            res.raise_for_status()
        except httpx.HTTPError as exc:
            raise CogneeError(f"Cognee POST {path} failed: {exc}") from exc
        return res.json()

    def _get(self, path: str) -> object:
        try:
            res = self._client.get(path)
            res.raise_for_status()
        except httpx.HTTPError as exc:
            raise CogneeError(f"Cognee GET {path} failed: {exc}") from exc
        return res.json()

    def _dataset_id(self) -> str | None:
        for ds in self._get("/api/v1/datasets/") or []:
            if ds.get("name") == self._dataset:
                return ds.get("id")
        return None

    def remember(self, text: str) -> MemoryItem:
        self._post(
            "/api/v1/add_text",
            {"textData": [text], "datasetName": self._dataset},
        )
        self._post("/api/v1/cognify", {"datasets": [self._dataset]})
        return MemoryItem(id=self._dataset, text=text)

    def upload_ontology(
        self, key: str, owl_bytes: bytes, description: str | None = None
    ) -> str:
        """Upload an OWL ontology under ``key`` (idempotent). Returns the key."""
        existing = self._get("/api/v1/ontologies") or {}
        if isinstance(existing, dict) and key in existing:
            return key
        data = {"ontology_key": key}
        if description is not None:
            data["description"] = description
        files = {"ontology_file": (f"{key}.owl", owl_bytes, "application/rdf+xml")}
        self._post_multipart("/api/v1/ontologies", data, files)
        return key

    def remember_file(
        self, content: bytes, filename: str, ontology_key: str | None = None
    ) -> dict:
        """Ingest a file and build the graph in one call, grounded on an ontology.

        Uses ``/api/v1/remember`` (ingest + cognify). The ``ontology_key`` form
        field is what actually grounds entity extraction against the ontology —
        ``cognify``'s ``ontologyKey`` does not (it leaves ``ontology_valid`` false).
        """
        data = {"datasetName": self._dataset}
        if ontology_key is not None:
            data["ontology_key"] = ontology_key
        files = {"data": (filename, content, "text/plain")}
        result = self._post_multipart("/api/v1/remember", data, files, timeout=300.0)
        return result if isinstance(result, dict) else {"result": result}

    def recall(self, query: str) -> list[MemoryItem]:
        ds_id = self._dataset_id()
        if ds_id is None:
            return []
        data = self._get(f"/api/v1/datasets/{ds_id}/data") or []
        q = query.lower()
        return [
            MemoryItem(id=d["id"], text=d.get("name", ""))
            for d in data
            if q in d.get("name", "").lower()
        ]

    def recall_answer(self, query: str) -> str:
        results = self._post(
            "/api/v1/search",
            {
                "query": query,
                "searchType": "GRAPH_COMPLETION",
                "datasets": [self._dataset],
            },
        )
        if isinstance(results, list) and results:
            first = results[0]
            if isinstance(first, dict):
                return str(first.get("search_result", first))
            return str(first)
        return "No answer."

    def all(self) -> list[MemoryItem]:
        ds_id = self._dataset_id()
        if ds_id is None:
            return []
        data = self._get(f"/api/v1/datasets/{ds_id}/data") or []
        return [MemoryItem(id=d["id"], text=d.get("name", "")) for d in data]

    def graph(self) -> GraphResponse:
        ds_id = self._dataset_id()
        if ds_id is None:
            return GraphResponse(nodes=[], edges=[])
        g = self._get(f"/api/v1/datasets/{ds_id}/graph") or {}
        nodes = [
            GraphNode(
                id=n["id"],
                label=n.get("label", ""),
                type=n.get("type", ""),
                properties=n.get("properties", {}),
            )
            for n in g.get("nodes", [])
        ]
        edges = [
            GraphEdge(source=e["source"], target=e["target"], label=e.get("label", ""))
            for e in g.get("edges", [])
        ]
        return GraphResponse(nodes=nodes, edges=edges)
