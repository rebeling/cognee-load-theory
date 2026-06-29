Cognee Load Theory

Cognee Load Theory turns invisible family coordination into a shared, visual memory space — so the whole Wolfpack can finally see the load, understand it, and reduce it together.

In The Hangover, the Wolfpack loses Doug and has to reconstruct the night from scattered clues. In family life, the problem is different: the context is usually not lost — someone is holding it. Appointments, school messages, groceries, bills, reminders, open decisions, emotional tasks, and unfinished todos are spread across chats, calendars, notes, documents, and people’s heads. Keeping all of that connected, prioritized, and up to date is mental load.

Our project makes this load visible. We use Cognee as a shared memory system for family context and turn its graph into an interactive mind space: a place where tasks, appointments, reminders, dependencies, and responsibilities can be explored, reorganized, updated, archived, and acted on. The goal is not just to remember more, but to make daily-life coordination visible enough that the family can improve it together.

The Theory

Mental load increases when daily-life context is hidden, fragmented, and carried internally by individuals. It decreases when that context is externalized into shared memory, visualized as a connected space, and transformed into actionable tasks that the whole family can understand and manage together.




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
