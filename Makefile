.PHONY: dev dev-win backend frontend install seed ruff

# Run backend (FastAPI :8000) and frontend (Next.js :3000) together.
# Ctrl-C stops both. (Unix shells / Git Bash — on Windows use dev-win.)
dev:
	@trap 'kill 0' INT TERM EXIT; \
	uv run fastapi dev & \
	$(MAKE) frontend & \
	wait

# Windows (PowerShell/cmd): backend and frontend each in their own console
# window, so both logs stay visible. Close a window (or Ctrl-C in it) to stop.
# The start/quoting logic lives in dev-win.cmd — GnuWin32 make mangles quotes.
dev-win:
	cmd /c "$(subst /,\,$(CURDIR))\dev-win.cmd"

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
