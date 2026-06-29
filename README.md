# cognee-load-theory

FastAPI backend (source of truth: ingestion, memory, task extraction, graph,
load score, agent actions) with frontend viewer served from the same
process.


## Quickstart

Requires Python 3.14 and [uv](https://docs.astral.sh/uv/).

```bash
uv sync          # install dependencies
uv run fastapi dev   # start dev server with auto-reload
```

Open http://127.0.0.1:8000 — the frontend viewer. The JSON API lives under
`/api` (e.g. `GET /api/load`, `POST /api/ingest`). Interactive docs at
http://127.0.0.1:8000/docs.

## Layout

- `app/` — FastAPI entrypoint (`app.main:app`); wires the API + serves the frontend
- `backend/` — all business logic (`api/` routes, `core/` store + models)
- `frontend/` — static HTML/JS/CSS viewer, no business logic ...yet

See `CLAUDE.md` for architecture details.
