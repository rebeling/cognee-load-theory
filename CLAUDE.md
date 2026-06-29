# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- Install deps: `uv sync`
- Run dev server: `uv run fastapi dev` (serves at http://127.0.0.1:8000, auto-reload)
- Smoke test endpoints: use `fastapi.testclient.TestClient(app)` against `app.main:app` (no test suite yet).

Python 3.14, managed with `uv`. FastAPI Cloud entrypoint is `app.main:app` (declared under `[tool.fastapi]` in `pyproject.toml`).

## Architecture

Single FastAPI process serves both the JSON API and the static frontend. Three top-level packages with a strict role split:

- **`app/`** — wiring + deploy entrypoint only. `app/main.py` builds the `FastAPI` app, includes the API router, and mounts `frontend/` as static files. No business logic.
- **`backend/`** — source of truth. All logic lives here.
  - `backend/api/` — one router module per capability (ingest, memory, tasks, graph, load, actions). `backend/api/__init__.py` aggregates them under the `/api` prefix.
  - `backend/core/` — `memory_store.py` (storage) and `models.py` (Pydantic schemas).
- **`frontend/`** — thin viewer (plain HTML/JS/CSS, no build step). Contains zero business logic; only `fetch()` calls to `/api/*` and rendering.

### Two conventions that matter

1. **All API routes are under `/api`.** This is required, not stylistic: `frontend/` is mounted at `/` via `StaticFiles(html=True)`, which is a catch-all. The `/api` prefix prevents route/static-file collisions and gives the frontend a clear "data call" namespace. The router include order in `app/main.py` matters — API router first, static mount last.

2. **`MemoryStore` is the swap point.** `backend/core/memory_store.py` defines an abstract `MemoryStore` and a process-local `InMemoryStore` stub, exposed as a shared module-level `store` instance that every route imports. The real Cognee integration replaces this single instance behind the same interface — routes never change. When asked to "add Cognee", implement a new `MemoryStore` subclass and swap `store`; do not touch route modules.

### Current state (intentional stubs)

This is a skeleton. Logic is deliberately deferred behind thin endpoints:
- task extraction = one task per stored item
- graph = nodes chained by insertion order
- load score = item count

These are placeholders to be replaced with real Cognee/LLM logic later. Design spec: `docs/superpowers/specs/2026-06-29-backend-frontend-skeleton-design.md`.
