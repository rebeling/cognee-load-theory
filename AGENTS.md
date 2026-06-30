# Repository Guidelines

## Project Structure & Module Organization

This repo is split into a FastAPI backend, a separate frontend, and reference
data/docs. `app/` contains deployment wiring only; `app/main.py` builds the API
app. `backend/` is the source of truth for business logic: route modules live in
`backend/api/`, while settings, schemas, and memory-store implementations live in
`backend/core/`. `frontend/` contains the browser UI. `docs/` holds concepts and
implementation notes. `data/` contains demo-safe fixtures and ontology examples.

## Build and Development Commands

- `make install` installs backend dependencies with `uv` and frontend
  dependencies with `npm`.
- `make backend` runs FastAPI at `http://127.0.0.1:8000`.
- `make frontend` runs the frontend dev server from `frontend/`.
- `make dev` starts backend and frontend together.
- `make ruff` runs Ruff checks and formatting for Python code.

Use `uv run fastapi dev` directly when debugging backend startup behavior.

## Coding Style & Naming Conventions

Python targets 3.14 and uses Pydantic schemas for API contracts. Keep API routes
thin and put shared behavior in `backend/core/`. Use snake_case for Python names,
lowercase module names, and stable descriptive IDs in data files, for example
`source_google_calendar_001`. Prefer small functions with explicit inputs and
outputs. Add comments only when they clarify non-obvious behavior.

## MVP Testing Status

This MVP does not have a formal test suite or coverage requirement yet. Do not
invent broad test infrastructure unless the task explicitly asks for it. For
backend smoke checks, use `fastapi.testclient.TestClient(app)` against
`app.main:app` or manually verify the relevant endpoint.

## Commit & Pull Request Guidelines

Existing commits use short, imperative summaries such as `add readme as index`
or `specifiy cors in backend, add make task, backend frontend start`. Keep
commit messages concise and focused. Pull requests should describe the change,
note affected API or data files, mention any manual verification performed, and
include screenshots for frontend-visible changes.

## Security & Configuration Tips

Do not commit secrets. Runtime configuration belongs in `.env`; see
`.env.example` and `backend/core/settings.py`. `API_KEY` gates `/api/*` when set.
`DOCS_ENABLED` controls generated API docs. Cognee credentials must stay local.

## Architecture Notes for Agents

All API routes live under `/api`. `MemoryStore` is the storage boundary:
replace or extend the active store behind `backend/core/memory_store.py` instead
of rewriting route modules. Current task extraction, graph, and load scoring are
intentional stubs.
