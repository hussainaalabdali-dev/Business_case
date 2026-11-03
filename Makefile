.PHONY: dev test test-engine test-api test-web fixtures-check migrate pdf-demo images lint

PY ?= python3
COMPOSE = docker compose -f docker-compose.yml -f docker-compose.dev.yml

dev:
	$(COMPOSE) up --build

fixtures-check:
	$(PY) reference/engine_reference.py

lint:
	ruff check engine api

test-engine:
	cd engine && $(PY) -m pytest -q
	cd engine && $(PY) -m mypy feasibility_engine

test-api:
	cd api && $(PY) -m pytest -q -s

test-web:
	@if [ -f web/package.json ]; then cd web && npm run typecheck && npm run lint; else echo "web: not scaffolded yet (Milestone 2)"; fi

test: fixtures-check lint test-engine test-api test-web

migrate:
	@if [ -f web/package.json ]; then cd web && npx prisma migrate deploy; else echo "migrate: Prisma arrives in Milestone 2"; fi

pdf-demo:
	cd api && $(PY) -m app.demo_cli out/demo.pdf

# Multi-arch images (needs docker buildx).
images:
	docker buildx build --platform linux/amd64,linux/arm64 -f api/Dockerfile -t feasibility-api .
	docker buildx build --platform linux/amd64,linux/arm64 -f web/Dockerfile -t feasibility-web .
	docker buildx build --platform linux/amd64,linux/arm64 -f ingest/Dockerfile -t feasibility-ingest .
