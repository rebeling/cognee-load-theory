# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **NO TESTS IN MVP.** Do not write a test suite, test files, or test scaffolding.
> Verify changes by running the app / hitting endpoints, not by adding tests.

## Commands

- Install deps: `uv sync` (backend) / `cd frontend && npm install` (frontend); or `make install` for both.
- Run backend: `uv run fastapi dev` (serves at http://127.0.0.1:8000, auto-reload) or `make backend`.
- Run frontend: `cd frontend && npm run dev` (Next.js at http://localhost:3000) or `make frontend`.
- Run both: `make dev` (Ctrl-C stops both).
- Smoke test endpoints: use `fastapi.testclient.TestClient(app)` against `app.main:app` (no test suite yet).

Python 3.14, managed with `uv`. FastAPI Cloud entrypoint is `app.main:app` (declared under `[tool.fastapi]` in `pyproject.toml`).

## Architecture

FastAPI serves a JSON API only. The Next.js frontend runs separately (dev :3000, prod on Vercel) and calls the API over CORS. Three top-level packages with a strict role split:

- **`app/`** — wiring + deploy entrypoint only. `app/main.py` builds the `FastAPI` app, configures CORS, and includes the API router. No business logic, no static serving.
- **`backend/`** — source of truth. All logic lives here.
  - `backend/api/` — one router module per capability (ingest, memory, tasks, graph, load, actions). `backend/api/__init__.py` aggregates them under the `/api` prefix.
  - `backend/core/` — `memory_store.py` (storage) and `models.py` (Pydantic schemas).
- **`frontend/`** — Next.js app (served by Vercel, not FastAPI). Calls `/api/*` over CORS; contains zero business logic.

### Two conventions that matter

1. **All API routes are under `/api`.** Gives the frontend a clear "data call" namespace and keeps deploy paths stable. CORS allow-list (`ALLOWED_ORIGINS` in `app/main.py`) gates which frontend origins may call the API: `http://localhost:3000` (dev) and `https://cognee-load-theory.vercel.app` (prod). Add new frontend origins there.

2. **Auth + docs are env-gated, default off.** `API_KEY` (unset = open, so the public repo runs without secrets) gates every `/api/*` route via the `require_api_key` dependency in `backend/core/auth.py`, attached once to `api_router`. When set, requests must send a matching `X-API-Key` header. `DOCS_ENABLED` (default off) controls `/docs`, `/redoc`, `/openapi.json` — leave unset in prod, set `true` in dev. Both flags live in `backend/core/settings.py`.

3. **`MemoryStore` is the swap point.** `backend/core/memory_store.py` defines an abstract `MemoryStore` and a process-local `InMemoryStore` stub, exposed as a shared module-level `store` instance that every route imports. The real Cognee integration replaces this single instance behind the same interface — routes never change. When asked to "add Cognee", implement a new `MemoryStore` subclass and swap `store`; do not touch route modules.

### Current state (intentional stubs)

This is a skeleton. Logic is deliberately deferred behind thin endpoints:
- task extraction = one task per stored item
- graph = nodes chained by insertion order
- load score = item count

These are placeholders to be replaced with real Cognee/LLM logic later. Design spec: `docs/superpowers/specs/2026-06-29-backend-frontend-skeleton-design.md`.
