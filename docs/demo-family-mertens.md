# Demo Family: Mertens

The Mertens fixture demonstrates how scattered family context becomes connected
coordination memory. The structured data lives in
[`data/demo-family-mertens.yaml`](../data/demo-family-mertens.yaml).
The matching reference ontology lives in
[`data/family-coordination.owl`](../data/family-coordination.owl) and is
explained in
[`docs/family-coordination-ontology.md`](family-coordination-ontology.md).

## Scenario

The fictional Mertens family lives in Bernau bei Berlin, Brandenburg. Lila
Mertens starts school in 2026 at Grundschule Biesenthal. For Brandenburg school
year 2026/27, the fixture records the official MBJS schedule context:

- usual Einschulungsveranstaltung: `2026-08-22`
- first school day: `2026-08-24`

The main event is `Einschulung Lila Mertens`, planned for `2026-08-22` from
`10:00` to `13:00`. The exact ceremony time remains an open confirmation task.

## What The Fixture Contains

The YAML file captures:

- family members, home location, and school context
- the main school-start calendar event
- hidden mental-load tasks created by that event
- input channels that can provide scattered context
- provider-specific channel source records
- an example enrichment result
- the target coordination graph
- the intended MemoryChangeSet flow after a user action

## Input Channels

The intended system accepts family context from several channels. Each channel
creates a `SourceRecord`; the backend then normalizes and enriches the record
before writing connected coordination memory into Cognee.

| Channel | Provider | Example | Likely Output |
|---|---|---|
| Calendar | Google Calendar | `Einschulung Lila, 22.08.2026, 10:00, Grundschule Biesenthal` | Event, date, place, person, high-priority milestone |
| Mail | Gmail | `Bitte bestaetigen Sie die Teilnahme bis 15.08.2026.` | Deadline, school task, confirmation task |
| Task List | Google Tasks | `Schulranzen kaufen - Christian - due 2026-08-10` | Task, due date, ownership |
| School Message | School portal | `Bitte bringen Sie Aufnahmebestaetigung und ein Passfoto mit.` | Document tasks, school dependency, possible deadline |
| Parent Chat | Family chat | `Christian kuemmert sich um den Schulranzen. Vera fragt morgen in der Schule wegen der Uhrzeit nach.` | Task ownership and reminders |
| Manual Note | Mind Space | `Lila needs a sports bag for school.` | New school-related task with missing owner |
| Voice Note | Phone transcription | `Ask whether Lara and Paul have school that day.` | Sibling schedule task with missing owner |
| Scanned Letter | Paper scan / OCR | `Zur Einschulung bitte mitbringen: Aufnahmebestaetigung, Passfoto, Federmappe.` | Checklist tasks and provenance |
| Mind Space Action | Mind Space | `Assign 'Buy school bag' to Christian` | Memory action that changes ownership |

## Channel Source Records

The fixture includes concrete `channel_source_records` for common family data
sources:

- `source_google_calendar_001`
- `source_gmail_school_001`
- `source_google_tasks_001`
- `source_school_portal_001`
- `source_parent_chat_001`
- `source_manual_note_001`
- `source_voice_note_001`
- `source_scanned_letter_001`
- `source_mind_space_action_001`

Each record keeps provider-specific raw data under `raw` and shared extracted
meaning under `normalized`. That lets the backend preserve source provenance
without forcing Gmail messages, Google Tasks, calendar events, OCR scans, and
Mind Space actions into the same raw shape.

The common normalized fields are:

- `entities`: people, places, schools, or other named things detected
- `creates`: event or task IDs that should be created if absent
- `updates`: existing memory IDs that should be changed or enriched
- `ownership`: person-task ownership edges
- `due_dates`: task deadlines inferred from the source
- `reminders`: reminder edges and times
- `inferences`: human-readable reasoning or warnings to show in reports

## Data Flow

1. Scattered context enters through Google Calendar, Gmail, Google Tasks, school
   portal messages, parent chat, manual notes, voice transcripts, paper scans,
   and Mind Space actions.
2. The backend creates `SourceRecord` entries such as
   `source_google_calendar_001`, `source_gmail_school_001`, and
   `source_parent_chat_001`.
3. Enrichment detects people, places, events, tasks, ownership, missing owners,
   and dependencies.
4. Cognee receives a connected coordination graph.
5. Mind Space visualizes the school-start load cluster.
6. User actions in Mind Space become memory updates.

## Target Graph

The core graph demonstrated by the fixture is:

```text
Lila -> has_event -> Einschulung
Einschulung -> takes_place_at -> Grundschule Biesenthal
Einschulung -> creates_task -> Confirm ceremony time
Einschulung -> creates_task -> Buy school bag
Einschulung -> creates_task -> Plan route
Vera -> owns -> Confirm ceremony time
Christian -> owns -> Buy school bag
Plan route -> needs_owner -> true
Organize family lunch -> needs_owner -> true
```

This graph makes the invisible coordination work explicit: which tasks exist,
who owns them, which tasks still need owners, and which people and places are
part of the same high-priority cluster.

## Mind Space View

In Mind Space, Lila is the center of the school-start cluster. Vera and
Christian connect through owned tasks. Unassigned tasks appear as open loops.
Travel-related nodes connect Bernau bei Berlin, Biesenthal, and Grundschule
Biesenthal.

## Change-Set Pipeline

When the user acts inside memory:

```text
Assign route planning to Christian and remind him one week before.
```

the backend should not blindly append another note. It should run a change-set
pipeline:

1. Extract the intended change.
2. Compare it with existing memory.
3. Create a `MemoryChangeSet`.
4. Apply the change set to Cognee.
5. Report what changed.

Expected memory update:

```text
Christian -> owns -> Plan route
Plan route -> has_reminder -> 2026-08-15T09:00:00+02:00
```

Expected change report:

- Christian now owns route planning.
- Missing-owner warning removed.
- Reminder scheduled.

## Example MemoryChangeSet

The fixture includes an applied ingestion change set,
`chg_school_start_lila_001`, for the initial school-start cluster. It is the
structured report the backend should produce after combining the scattered
calendar, school, chat, and manual-note inputs.

```json
{
  "change_set_id": "chg_school_start_lila_001",
  "family_id": "family_mertens",
  "source": "combined_ingestion",
  "status": "applied",
  "summary": "Created school-start coordination cluster for Lila Mertens.",
  "created": [
    {
      "type": "event",
      "id": "event_einschulung_lila_mertens_2026",
      "label": "Einschulung Lila Mertens"
    },
    {
      "type": "task",
      "id": "task_confirm_ceremony_time",
      "label": "Confirm ceremony time with school"
    },
    {
      "type": "task",
      "id": "task_buy_school_bag",
      "label": "Buy school bag"
    },
    {
      "type": "task",
      "id": "task_plan_route",
      "label": "Plan route Bernau to Biesenthal"
    }
  ],
  "relationships_added": [
    {
      "from": "Lila Mertens",
      "relation": "affected_by",
      "to": "Einschulung Lila Mertens"
    },
    {
      "from": "Vera Mertens",
      "relation": "owns",
      "to": "Confirm ceremony time with school"
    },
    {
      "from": "Christian Mertens",
      "relation": "owns",
      "to": "Buy school bag"
    },
    {
      "from": "Einschulung Lila Mertens",
      "relation": "creates_task",
      "to": "Plan route Bernau to Biesenthal"
    }
  ],
  "needs_confirmation": [
    {
      "type": "event_time_confirmation",
      "message": "The exact ceremony time is assumed as 10:00 but must be confirmed with the school."
    }
  ]
}
```

`needs_confirmation` is intentionally separate from `created` and
`relationships_added`: it records assumptions that were useful enough to build
the coordination cluster, but still require user or school confirmation.

## Current Implementation Status

This fixture documents the intended demo behavior. The current backend still
uses deliberately thin stubs:

- [ingest](../backend/api/ingest.py) accepts raw text and stores it through the
  active memory store.
- [actions](../backend/api/actions.py) echoes action payloads.
- [models](../backend/core/models.py) do not yet define `SourceRecord` or
  `MemoryChangeSet`.

Future implementation should add those schemas behind the existing
`MemoryStore` boundary so API routes remain thin and Cognee can become the
source of connected memory.
