.PHONY: dev backend frontend install

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

ruff:
	uv run ruff check .
	uv run ruff format .
