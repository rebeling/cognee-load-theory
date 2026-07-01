@echo off
rem Windows companion to `make dev`: backend and frontend in their own
rem console windows so both logs stay visible. Close a window (or Ctrl-C
rem in it) to stop that server. Invoked by `make dev-win`.
start "backend :8000" cmd /k "cd /d %~dp0 && uv run fastapi dev"
start "frontend :3000" cmd /k "cd /d %~dp0frontend && npm run dev"
