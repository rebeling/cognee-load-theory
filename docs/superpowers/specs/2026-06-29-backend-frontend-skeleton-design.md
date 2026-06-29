# Backend + Frontend Skeleton — Design

**Date:** 2026-06-29
**Status:** Approved (pending spec review)

## Goal

Small working full-stack skeleton for `cognee-load-theory`. Backend is the
source of truth and holds all business logic. Frontend is a thin viewer served
by the same FastAPI process. Cognee and real scoring logic are stubbed now and
swapped in later. Get a runnable, deployable app first.

## Scope

In scope:
- FastAPI backend with thin endpoints for all 7 capabilities.
- In-memory stub behind a `MemoryStore` interface (no Cognee install yet).
- Plain HTML/JS/CSS frontend, served by FastAPI (same origin, no CORS).
- `app/main.py` as FastAPI Cloud deploy entrypoint.

Out of scope (later iterations):
- Real Cognee integration (LLM + embedding providers, keys).
- Real task extraction, graph construction, agent actions.
- Persistent storage, auth.

## Architecture

```
app/                   FastAPI Cloud entrypoint (deploy target)
  __init__.py
  main.py              creates `app` FastAPI object; includes API router;
                       mounts frontend/ as static files at /

backend/               business logic (source of truth)
  __init__.py
  api/
    __init__.py        APIRouter aggregating all route modules under /api
    ingest.py          POST /api/ingest      ingestion
    memory.py          GET/POST /api/memory  Cognee memory integration
    tasks.py           GET /api/tasks        task extraction
    graph.py           GET /api/graph        graph API
    load.py            GET /api/load         load score (simple example)
    actions.py         POST /api/actions     agent actions
  core/
    __init__.py
    models.py          Pydantic request/response schemas
    memory_store.py    MemoryStore interface + InMemoryStore stub

frontend/              static files served by FastAPI
  index.html           single page
  app.js               fetch() calls to /api/*
  style.css

pyproject.toml         deps: fastapi, uvicorn[standard]
```

## Data flow

```
browser (frontend/)  --HTTP-->  app/main.py  -->  backend/api/* routes
                                                      |
                                                      v
                                            backend/core/memory_store
                                            (InMemoryStore stub)
```

Single process. Frontend loaded from `/`, calls same-origin `/api/*`. No CORS.
All business logic lives backend-side; frontend only renders responses and
sends user input.

## Components

**`app/main.py`**
- Builds `app = FastAPI()`.
- `app.include_router(api_router)` from `backend/api`.
- Mounts `frontend/` via `StaticFiles(directory="frontend", html=True)` at `/`.
- This is the FastAPI Cloud target: `app.main:app`.

**`backend/core/memory_store.py`**
- `MemoryStore` — abstract interface: `remember(text) -> id`, `recall(query) -> list`, `all() -> list`.
- `InMemoryStore` — dict/list-backed impl. Single module-level instance reused by routes.
- Cognee impl added later behind same interface; no route changes needed.

**`backend/core/models.py`**
- Pydantic schemas: `IngestRequest`, `MemoryItem`, `Task`, `GraphNode`, `GraphEdge`, `GraphResponse`, `LoadScore`, `ActionRequest`, `ActionResult`.

**`backend/api/*`** — one router module per capability:
- `ingest`: accept text, store via MemoryStore, return id.
- `memory`: POST remember, GET recall/all.
- `tasks`: stub — derive simple Task list from stored memory.
- `graph`: stub — return nodes/edges from stored memory.
- `load`: simple example — score = count of extracted tasks (or stored items).
- `actions`: stub — accept action, echo a result.

**`frontend/`**
- `index.html` + `app.js` + `style.css`. Vanilla `fetch()`. No build step.
- Lets user ingest text and view memory / tasks / graph / load / trigger action.

## Error handling

- Routes return appropriate HTTP status; Pydantic validates request bodies (422 on bad input).
- MemoryStore stub cannot fail meaningfully; later real impls raise, routes map to 5xx.

## Testing

- Smoke: `uvicorn app.main:app`, load `/`, exercise each `/api/*` endpoint.
- Unit later: MemoryStore interface, per-route handlers.

## Success criteria

1. `uvicorn app.main:app --reload` serves frontend at `/`.
2. Frontend can ingest text and display it back via `/api/memory`.
3. All 7 `/api/*` endpoints respond (stubbed where logic is deferred).
4. Deployable to FastAPI Cloud via `app.main:app` entrypoint.
5. Swapping InMemoryStore → Cognee requires no route changes.
