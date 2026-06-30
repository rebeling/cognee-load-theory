# Family Coordination Ontology

The ontology in
[`data/family-coordination.owl`](../data/family-coordination.owl) is a small
OWL/RDF starting point for Cognee Load Theory. It models family context as
coordination memory: people, events, tasks, ownership, dependencies, sources,
and load clusters.

## Purpose

This is not a profile-data model. The ontology is designed to represent the
work of keeping family life coordinated:

- who is affected by an event
- which tasks an event creates
- who owns a task
- which tasks still need owners
- what depends on what
- where a task came from
- which tasks belong to the same load cluster

## Main Classes

| Class | Role |
|---|---|
| `Family`, `Person`, `Adult`, `Child` | Family membership and relationships |
| `Place`, `School` | Home, school, and event locations |
| `Event`, `SchoolEvent`, `SchoolStartEvent` | Time-bound coordination anchors |
| `Task`, `Reminder`, `Topic` | Actionable work and organization |
| `SourceRecord`, `InputChannel` | Raw input and provenance |
| `MemoryChangeSet` | Applied memory updates |
| `OpenLoop`, `LoadCluster` | Mental-load concepts |

## Key Relationships

The ontology includes object properties for:

- `hasMember`, `memberOfFamily`, `parentOf`, `siblingOf`
- `livesIn`, `attendsSchool`, `takesPlaceAt`
- `hasEvent`, `affectsPerson`, `createsTask`
- `ownsTask`, `suggestedOwner`, `dependsOn`, `dueBefore`
- `hasReminder`, `hasTopic`, `belongsToLoadCluster`
- `derivedFromSource`, `sourceChannel`, `producedChangeSet`

Datatype properties cover names, dates of birth, age, event times, task status,
urgency, ownership gaps, confidence, raw source text, reminder time, and
notification channel.

## Demo Individuals

The file includes Mertens demo individuals matching
[`data/demo-family-mertens.yaml`](../data/demo-family-mertens.yaml):

- `Family_Mertens`
- `Vera_Mertens`, `Christian_Mertens`, `Lara_Mertens`, `Paul_Mertens`,
  `Lila_Mertens`
- `Bernau_bei_Berlin`, `Biesenthal`, `Grundschule_Biesenthal`
- `Event_Einschulung_Lila_2026`
- school-start tasks such as `Task_Confirm_Ceremony_Time`,
  `Task_Buy_School_Bag`, and `Task_Plan_Route`
- `Cluster_Lila_School_Start`

## Extension Points

The ontology is intentionally small. Good next extensions are:

- bills and subscriptions
- health appointments and medications
- clubs and extracurricular activities
- holidays and travel
- recurring routines
- fairness and load scoring
- notification preferences
- agent decisions and audit trails

## Current Status

This ontology is reference data only. The backend does not yet ingest or enforce
it. Future implementation should load it behind the existing memory-store
boundary, then map extracted `SourceRecord` and `MemoryChangeSet` objects onto
these classes and properties before writing to Cognee.

