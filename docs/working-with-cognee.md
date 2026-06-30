# Working with Cognee

How this project talks to the Cognee cloud tenant. Source of truth for endpoints,
auth, datasets, and the `forget` operation.

## Connection

Config lives in `.env` (not committed). Read into `backend/core/settings.py`.

| Env var | Purpose |
|---|---|
| `COGNEE_API_KEY` | Tenant API key. Sent as `X-Api-Key` header. |
| `COGNEE_API_BASE_URL` | Tenant base URL (`https://tenant-<id>.aws.cognee.ai`). |
| `COGNEE_TENANT` | Tenant UUID. |
| `COGNEE_USER_ID` | Owner user UUID (matches `ownerId` on datasets). |
| `COGNEE_BRAIN` | Dataset all ingested text is grouped under (currently `family_mertens_dataset`). Exposed as `settings.cognee_dataset`. |

### Auth

Use the `X-Api-Key` header. **Not** `Authorization: Bearer` — that returns
`401 {"detail":"Invalid header"}`.

```bash
curl -sL -H "X-Api-Key: $COGNEE_API_KEY" "$COGNEE_API_BASE_URL/api/v1/datasets/"
```

### Trailing slash

Collection routes need the trailing slash. `/api/v1/datasets` → `307` redirect;
`/api/v1/datasets/` → `200`. Use `curl -L` to follow redirects.

## Datasets

`GET /api/v1/datasets/` lists datasets owned by `COGNEE_USER_ID`. Each entry has
`id` (UUID), `name`, `createdAt`, `ownerId`.

The project brain is `family_mertens_dataset` (from `COGNEE_BRAIN` /
`settings.cognee_dataset`). Datasets are created lazily — `/remember` creates the
named dataset, so the list is empty until something is ingested.

> Always target the dataset from `COGNEE_BRAIN` / `settings.cognee_dataset` —
> never hardcode another name, or you operate on the wrong brain. Note the brain
> moved off `ontology_dataset` after that dataset was corrupted (see the poisoned-
> dataset warning under *Ingesting demo data*).

## Ingesting demo data

`POST /api/ingest/demo` seeds the fixtures in `data/` into the brain. Requires
Cognee to be configured (`settings.cognee_enabled`); returns `503` otherwise.
Auth: send the app `X-API-Key` header when `API_KEY` is set in `.env`.

```bash
curl -X POST -H "X-API-Key: $API_KEY" http://127.0.0.1:8000/api/ingest/demo
# -> 200 {"ontology_key":"family_coordination","sentences":77,
#         "dataset":"family_mertens_dataset","status":"completed","items_processed":1}
```

What it does (see `backend/core/demo_seed.py`):

1. **Ontology** — uploads `data/family-coordination.owl` via
   `POST /api/v1/ontologies` under key `family_coordination`. Idempotent: skips the
   upload if the key already exists (re-uploading a key returns `400`).
2. **Ingest + ground** — flattens `data/demo-family-mertens.yaml` into ~77
   natural-language sentences (members, calendar event + hidden mental-load tasks,
   input channels, channel source records, detected tasks, coordination edges),
   joins them into one document, and uploads it via `POST /api/v1/remember`
   (multipart `data` file + `datasetName` + `ontology_key`). `/remember` ingests
   **and** builds the graph in one call, grounded on the ontology.

> ⚠️ **Ontology grounding lives on `/remember`'s `ontology_key` (singular string)
> form field — not on `cognify`'s `ontologyKey`.** `cognify` accepts `ontologyKey`
> (a list) and returns `200`, but does **not** actually ground extraction: every
> node comes back `ontology_valid: false`. Using `/remember` with `ontology_key`
> sets `ontology_valid: true` and canonicalizes matched entities to the OWL
> individual names (verified: 27/49 nodes matched on the demo data). This matches
> the working pattern in the sibling `cognee-test` project.

> ⚠️ **A poisoned dataset cannot be reused.** If a dataset hits an internal
> `ProgrammingError`, every `/remember` returns `409 Conflict` and
> `DELETE /datasets/{id}` returns `500` — it is stuck. Switch `COGNEE_BRAIN` to a
> fresh dataset name (this is why the brain is `family_mertens_dataset`, not the
> earlier corrupted `ontology_dataset`).

Re-running is safe: the ontology upload is skipped and `/remember` re-ingests.

## Forget

`POST /api/v1/forget` — remove data from the knowledge graph. Field names accept
both camelCase (`datasetId`, `dataId`, `memoryOnly`) and snake_case (`dataset_id`,
`data_id`, `memory_only`).

| Body | Effect |
|---|---|
| `{"dataset": "<name>"}` | Delete entire dataset (graph + vector + raw files). |
| `{"datasetId": "<uuid>"}` | Same, by UUID. |
| `{"dataset": "<name>", "dataId": "<uuid>"}` | Delete one item. |
| `{"dataset": "<name>", "memoryOnly": true}` | Clear memory (graph + vector), **keep** raw files so the dataset can be re-cognified. |
| `{"dataset": "<name>", "dataId": "<uuid>", "memoryOnly": true}` | Clear memory for one file only. |
| `{"everything": true}` | Permanently delete ALL datasets + data the user owns. |

Rules: provide `dataset` **or** `datasetId`, never both. `dataId` requires a
dataset. `memoryOnly` requires a dataset.

### Verified behavior (2026-06-30)

Tested against the live tenant. **All forms returned `200`, not `500`:**

```bash
# memory-only clear, by name  -> 200 {"data_records_reset":1,"status":"success"}
curl -sL -X POST -H "X-Api-Key: $COGNEE_API_KEY" -H "Content-Type: application/json" \
  -d '{"dataset":"test","memoryOnly":true}' "$COGNEE_API_BASE_URL/api/v1/forget"

# memory-only clear, by UUID  -> 200
curl -sL -X POST ... -d '{"datasetId":"<uuid>","memoryOnly":true}' .../api/v1/forget

# full dataset delete         -> 200 {"status":"success"}
curl -sL -X POST ... -d '{"dataset":"test"}' .../api/v1/forget

# wipe entire brain           -> 200 {"datasets_removed":3,"status":"success"}
curl -sL -X POST ... -d '{"everything":true}' .../api/v1/forget
# datasets list afterward -> []
```

> An earlier note claimed `dataset`, `datasetId`, and `everything` all 500 on
> cloud. **All three are confirmed working** as of the tests above. If you hit a
> `500` ("Error during deletion" per the API docs), it is a runtime delete failure
> — capture the response body and the exact payload; it is not a "forget is broken
> on cloud" condition.

> ⚠️ `everything: true` is irreversible and ignores dataset scope — one call
> removed all 3 datasets and the list went to `[]`. Re-create and re-cognify from
> scratch after.

### Error codes

| Code | Meaning |
|---|---|
| `422` | Invalid parameter combination (both `dataset` and `datasetId`, `dataId` without dataset, `memoryOnly` without dataset). |
| `500` | Runtime error during deletion. |

## Other routes

From the tenant OpenAPI (`GET /openapi.json`):

- `POST /api/v1/remember` — ingest a file **and** build the graph in one call
  (multipart: `data`, `datasetName`, `ontology_key`). The grounding path — use this.
- `POST /api/v1/add_text` — add text(s) to a dataset (no cognify)
- `POST /api/v1/add` — add file(s) to a dataset (multipart, no cognify)
- `POST /api/v1/cognify` — build the graph (`datasets`, `ontologyKey` as **lists**;
  note `ontologyKey` here does **not** ground extraction — use `/remember`)
- `POST /api/v1/search` — query (`searchType: GRAPH_COMPLETION`, …)
- `PATCH /api/v1/update`
- `GET /api/v1/ontologies` — list uploaded ontologies (keyed by `ontology_key`)
- `POST /api/v1/ontologies` — upload ontology (multipart: `ontology_key`, `ontology_file`)
- `DELETE /api/v1/ontologies/{ontology_key}`
- `POST /api/v1/datasets/` — create
- `GET /api/v1/datasets/status` — dataset status
- `DELETE /api/v1/datasets/{dataset_id}` — delete dataset
- `GET /api/v1/datasets/{dataset_id}/data` — list dataset items
- `GET /api/v1/datasets/{dataset_id}/data/{data_id}/raw` — fetch raw file
- `DELETE /api/v1/datasets/{dataset_id}/data/{data_id}` — delete one item
- `GET /api/v1/datasets/{dataset_id}/graph` — graph nodes + edges
- `POST /api/v1/permissions/datasets/{principal_id}`
