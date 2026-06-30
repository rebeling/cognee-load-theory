# Concept: The Mind Space — Offloading Mental Load into a Walkable Memory

> The bird's-eye framing of Cognee Load Theory lives in the [README](../README.md). This doc is the detailed Mind Space concept.

## The problem

Mental load is the invisible work of *remembering*: the dentist appointment, the
insurance that lapses, the gift due Saturday, who owns what, what blocks what.
It lives in one head, never written down fully, and it costs attention even when
you're not doing it. Lists help a little, but a flat checklist can't hold the
*relationships* — that the boiler service, the insurance, and the field-trip
payment all land on the same person in the same week.

## The core idea

**Cognee is the memory that carries the load for you.** You hand it raw,
messy life-data and it does the structuring: it reads the todos, the people,
the deadlines, and builds a living knowledge graph — entities, owners,
deadlines, and the edges between them. That graph is the *truth*. It updates as
life changes.

But a graph is not a place a human wants to live. It's a hairball — 131 nodes,
1255 edges, accurate and unreadable. So we add one translation:

> **The graph is the memory. The 3D space is the interface.**

You don't deal with your mental load by staring at a node-link diagram. You
walk into a **space** — a museum, a library — where each worry has a physical
form, a location, a neighbor. You *deal with the data in the space*, and the
space stays in sync with cognee underneath.

## The flow

```
  raw life-data            cognee                 the Mind Space
  (todos, people,   →   absorbs + structures  →   walkable 3D
   deadlines)            into living graph         metaphor you act in
        ▲                                                │
        └────────────  acting in the space  ────────────┘
              (complete / add / reprioritize → re-ingest)
```

1. **Offload** — you write raw data (or speak it). Cognee `add` + `cognify`.
   The load leaves your head and enters memory. This alone is relief: *you no
   longer have to hold it.*
2. **Structure** — cognee extracts who-owns-what, what's-due-when, what-affects-
   whom. The graph updates. One source of truth.
3. **Translate** — the graph becomes a 3D space. Hierarchy maps to architecture.
4. **Act in the space** — you walk it, see what's heavy this week, mark things
   done, add new worries by placing a new object. Those actions feed back into
   cognee, which re-structures. The space and the memory stay one thing.

The point of step 1 is the emotional one: **cognee remembers so you don't have
to.** The space (steps 3–4) is what makes that memory *livable* instead of just
stored.

## What the space looks like

Cognee's graph already has a natural hierarchy — `Document → Chunk → Entity →
Type`. That maps cleanly onto built space. Two metaphors, both honest to the
same data; the user explores which gives easiest access:

### Library of Todos
- **The building = your mind.** Quiet, ordered, everything has a place.
- **Wings = sources** — one wing per document (the todos, the people, the
  deadlines).
- **Shelves = categories** (EntityType): finance, kids, repairs, events.
- **Books = individual tasks & people.** Spine label = the task name. A thick,
  worn, glowing spine = high mental load (high `importance`/`degree` in the
  graph). Pull a book → it opens to a card: full text, owner, deadline, and
  cross-references ("see also") to its graph neighbors you can click to walk to.
- *Feel:* calm custody. Your worries are filed, not lost.

### Museum of Mind
- **Halls = categories.** Each worry is an **exhibit on a pedestal**.
- **Wall plaque = the curator note** — cognee's own summary of that cluster.
- **Lighting = urgency** — what's due this week is lit; what's distant sits in
  shadow. Walk toward the light to see what needs you now.
- *Feel:* you visit your mind from the outside, with distance — load made
  observable instead of felt.

Both share: **orbit + click** navigation (orbit/zoom the building, click to fly
in and read), a selection card showing a node's neighbors as clickable
cross-refs, and a **scope toggle** (show only the meaningful content nodes, or
the full graph including cognee's internal scaffolding).

## Mapping, concretely

| Cognee graph | Library | Museum | Meaning |
|---|---|---|---|
| TextDocument | Wing | Building entrance | a source you dumped |
| EntityType | Shelf | Hall | a category of load |
| Entity (task/person) | Book | Exhibit | one worry, one duty |
| edge (owned_by / affects / has_deadline) | "see also" cross-ref | corridor between halls | the relationship |
| TextSummary | shelf card | wall plaque | cognee's read of the cluster |
| importance / degree | spine thickness & glow | pedestal height & light | how heavy it weighs |

## The two-way loop (what makes it an interface, not a poster)

Read-only would just be a prettier graph. The intent is to **deal with the data
in the space**:

- **Complete** — close a book / dim an exhibit → cognee marks it done, graph
  updates, the space lightens.
- **Add** — place a new book on a shelf / a new pedestal in a hall → that text
  goes back through `add` + `cognify`, and cognee re-derives its owner,
  deadline, and connections automatically. You drop a worry; the memory files
  it.
- **Reprioritize** — moving or re-lighting an object writes back weight, so next
  visit the space reflects what actually matters now.

The space never holds its own truth. Every action round-trips through cognee, so
the memory and the walkable view are always the same thing seen two ways.

## Why this matters

The graph proves cognee *understood* the data. The Mind Space makes that
understanding **usable by a tired human at the end of the day** — somewhere to
put the load down, and a place to walk through it that feels like custody, not a
diagram. First cognee carries the mental load. Then the space hands it back in a
form you can actually live with.

## Open question

Which metaphor (library, museum, or both behind a toggle) gives *easiest
access* is left to feel in-browser rather than decided up front — that's the one
thing a build should keep switchable.
