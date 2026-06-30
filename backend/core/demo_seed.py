"""Load the demo fixtures in ``data/`` into Cognee.

Flattens ``demo-family-mertens.yaml`` into natural-language sentences (cognify
parses these into the graph) and uploads ``family-coordination.owl`` as the
ontology. Pure helpers here — no FastAPI imports — so this stays unit-testable
and reusable from a script.
"""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

import yaml

if TYPE_CHECKING:
    from backend.core.cognee_store import CogneeStore

DATA_DIR = Path(__file__).parents[2] / "data"
ONTOLOGY_FILE = DATA_DIR / "family-coordination.owl"
FAMILY_FILE = DATA_DIR / "demo-family-mertens.yaml"
ONTOLOGY_KEY = "family_coordination"


def load_ontology_bytes() -> bytes:
    return ONTOLOGY_FILE.read_bytes()


def _context_sentences(data: dict) -> list[str]:
    ctx = data.get("official_context") or {}
    if not ctx:
        return []
    return [
        f"Official school context for {ctx.get('state', '')} "
        f"({ctx.get('country', '')}), school year {ctx.get('school_year', '')}, "
        f"per {ctx.get('source_authority', '')}: the Einschulungsveranstaltung is "
        f"usually {ctx.get('usual_einschulungsveranstaltung', '')} and the first "
        f"school day is {ctx.get('first_school_day', '')}."
    ]


def _member_sentences(data: dict) -> list[str]:
    fam = data.get("family") or {}
    fam_name = fam.get("family_name", "")
    home = fam.get("home") or {}
    out: list[str] = []
    if home:
        out.append(
            f"The {fam_name} family lives in {home.get('city', '')}, "
            f"{home.get('state', '')}, {home.get('country', '')}."
        )
    for m in fam.get("members") or []:
        parts = [f"{m.get('name', '')} is the {m.get('role', '')} in the {fam_name} family"]
        if m.get("date_of_birth"):
            parts.append(f"born {m['date_of_birth']}")
        if m.get("age") is not None:
            parts.append(f"age {m['age']}")
        school = m.get("school") or {}
        if school.get("grade") is not None:
            parts.append(
                f"in grade {school['grade']} at a school in {school.get('location', '')}"
            )
        elif school.get("status"):
            parts.append(
                f"with school status {school['status']} at a school in "
                f"{school.get('location', '')}"
            )
        out.append(", ".join(parts) + ".")
    return out


def _calendar_sentences(data: dict) -> list[str]:
    out: list[str] = []
    for e in data.get("calendar_entries") or []:
        title = e.get("title", "")
        out.append(
            f"Calendar event '{title}' for {e.get('person', '')} is a "
            f"{e.get('type', '')} on {e.get('date', '')} from "
            f"{e.get('start_time', '')} to {e.get('end_time', '')} at "
            f"{e.get('location', '')} (priority {e.get('priority', '')}, "
            f"status {e.get('status', '')})."
        )
        if e.get("related_people"):
            out.append(
                f"People related to '{title}': {', '.join(e['related_people'])}."
            )
        for item in e.get("hidden_mental_load") or []:
            out.append(f"Hidden mental-load task for '{title}': {item}.")
    return out


def _channel_sentences(data: dict) -> list[str]:
    out: list[str] = []
    for c in data.get("input_channels") or []:
        out.append(
            f"Input channel '{c.get('label', '')}' is a {c.get('type', '')} channel "
            f"from {c.get('provider', '')}. Example input: "
            f"\"{c.get('example_input', '')}\"."
        )
    return out


def _source_record_sentences(data: dict) -> list[str]:
    out: list[str] = []
    for r in data.get("channel_source_records") or []:
        norm = r.get("normalized") or {}
        parts = [
            f"Source record from {r.get('provider', '')} ({r.get('source_ref', '')}) "
            f"received at {r.get('received_at', '')}"
        ]
        if norm.get("creates"):
            parts.append(f"creates {', '.join(norm['creates'])}")
        for own in norm.get("ownership") or []:
            parts.append(f"{own.get('owner', '')} owns {own.get('task', '')}")
        for due in norm.get("due_dates") or []:
            parts.append(f"{due.get('task', '')} is due {due.get('due', '')}")
        out.append("; ".join(parts) + ".")
        for inf in norm.get("inferences") or []:
            out.append(f"Inference from {r.get('source_ref', '')}: {inf}.")
    return out


def _task_sentences(data: dict) -> list[str]:
    enrich = ((data.get("data_flow_example") or {}).get("enrichment")) or {}
    out: list[str] = []
    for t in enrich.get("detected_tasks") or []:
        title = t.get("title", "")
        if t.get("owner"):
            s = f"Task '{title}' is owned by {t['owner']}"
        elif t.get("needs_owner"):
            s = f"Task '{title}' needs an owner"
        else:
            s = f"Task '{title}'"
        if t.get("due"):
            s += f" and is due {t['due']}"
        out.append(s + ".")
    return out


def _edge_sentences(data: dict) -> list[str]:
    graph = ((data.get("data_flow_example") or {}).get("coordination_graph")) or {}
    out: list[str] = []
    for e in graph.get("edges") or []:
        out.append(
            f"{e.get('source', '')} {e.get('relation', '')} {e.get('target', '')}."
        )
    return out


def flatten_family_yaml() -> list[str]:
    """Read the family YAML and return natural-language sentences for cognify."""
    data = yaml.safe_load(FAMILY_FILE.read_text())
    sentences: list[str] = []
    for builder in (
        _context_sentences,
        _member_sentences,
        _calendar_sentences,
        _channel_sentences,
        _source_record_sentences,
        _task_sentences,
        _edge_sentences,
    ):
        sentences.extend(builder(data))
    return sentences


def seed_demo(store: CogneeStore) -> dict:
    """Upload the ontology, then ingest the flattened family data grounded on it.

    Grounding happens via ``/remember``'s ``ontology_key`` (see
    ``CogneeStore.remember_file``) — the flattened sentences are sent as one
    document so Cognee extracts and validates entities against the ontology.
    """
    key = store.upload_ontology(
        ONTOLOGY_KEY,
        load_ontology_bytes(),
        description="Family coordination ontology for the Mertens demo.",
    )
    sentences = flatten_family_yaml()
    document = "\n".join(sentences)
    result = store.remember_file(
        document.encode("utf-8"),
        filename="demo-family-mertens.txt",
        ontology_key=key,
    )
    return {
        "ontology_key": key,
        "sentences": len(sentences),
        "dataset": store.dataset,
        "status": result.get("status"),
        "items_processed": result.get("items_processed"),
    }
