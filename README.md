# Cognee Load Theory

For the _[Hangover Part AI: Where’s My Context?](https://www.wemakedevs.org/hackathons/cognee)_ hackathon, we asked what context means when family life is the system. It is not just reminders, appointments, or todos. It is the hidden web between them: who needs what, what depends on what, what is urgent, and how daily life stays coordinated.

In _The Hangover_, the Wolfpack loses Doug and has to reconstruct the night from scattered clues. In family life, context is also scattered: across calendars, school messages, shopping lists, bills, reminders, open decisions, unfinished todos, and people’s heads. But the real load is not the scattered information itself. The load is keeping all those pieces connected. Through routines, role models, assumptions, and unfair defaults, that invisible coordination can become unevenly distributed mental load.

Our project gives that hidden web a place. We use Cognee as shared AI memory and turn family context into a living graph, visualized as an interactive mind space. People, tasks, appointments, documents, responsibilities, and dependencies become connected, explorable, and actionable. You can walk through the load, see what belongs together, update it, archive it, and act on what needs attention.

This is our answer to **“Where’s My Context?”** Here it is: visible, connected, and ready to be shared.

### The Theory

Family mental load is cognitive overload. It happens when too many scattered pieces of context have to stay active in someone's working memory: appointments, school messages, todos, bills, decisions, responsibilities, deadlines, and dependencies. The pressure is not just the amount of information, but the need to constantly hold it together, update it, anticipate consequences, and remember what still needs action.

Our backend enriches context before it enters Cognee. People, tasks, dates, ownership, urgency, dependencies, and open loops become part of the memory itself. Cognee becomes the shared coordination memory where family context is connected, queryable, and ready for action.

The Mind Space is an experimental access layer on top of Cognee's knowledge graph. The graph shows how context is connected; the Mind Space asks how that connected context can become a place. A place gives memory continuity: it looks familiar when we return, things have positions, and changes stand out. This makes shared memory easier to enter, understand, anticipate, and act on. See [`docs/the-mind-space.md`](docs/the-mind-space.md).


---

## Quickstart

Requires Python 3.14 and [uv](https://docs.astral.sh/uv/).

**Backend** (FastAPI, http://127.0.0.1:8000):

```bash
uv sync              # install dependencies
uv run fastapi dev   # start dev server with auto-reload
```

**Frontend** (Next.js, http://localhost:3000):

```bash
cd frontend
npm install
npm run dev          # start Next.js dev server
```

The backend allows CORS from `http://localhost:3000` (dev) and
`https://cognee-load-theory.vercel.app` (prod).

See `CLAUDE.md` for architecture details.
