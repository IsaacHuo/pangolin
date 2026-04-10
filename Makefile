.PHONY: install dev test lint fmt run attack dev-all

install:
	uv sync

dev:
	uv run uvicorn src.main:app --reload --host 0.0.0.0 --port 9090

dev-all:
	@echo "Starting backend + frontend..."
	@./scripts/start-all.sh

run:
	uv run uvicorn src.main:app --host 0.0.0.0 --port 9090 --workers 4

test:
	uv run pytest tests/ -v --tb=short

lint:
	uv run ruff check src/ tests/

fmt:
	uv run ruff format src/ tests/

attack:
	uv run python -m tests.red_team.attack_simulation
