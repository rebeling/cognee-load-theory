.PHONY: dev backend frontend install seed ruff

# Run backend (FastAPI :8000) and frontend (Next.js :3000) together.
# Ctrl-C stops both.
dev:
	@trap 'kill 0' INT TERM EXIT; \
	uv run fastapi dev & \
	$(MAKE) frontend & \
	wait

backend:
	uv run fastapi dev

frontend:
	cd frontend && npm run dev

install:
	uv sync
	cd frontend && npm install

# Seed the demo fixtures (ontology + flattened Mertens family) into the active
# store, in-process (no running server needed). Honors COGNEE_MODE from .env:
# local needs LLM_API_KEY; cloud needs the COGNEE_* keys.
seed:
	uv run python -m backend.core.demo_seed

ruff:
	uv run ruff check .
	uv run ruff format .
