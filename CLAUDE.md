# CLAUDE.md — instructions for building this project

## What we are building
An Arabic (RTL) web app for small and mid-size Saudi developers to run a land-development feasibility study: market data, financial model, stress test, decision and a PDF committee memo. Read these in order before writing code:

1. `docs/PRODUCT.md`: scope (what is in and out of v1)
2. `docs/ENGINE_SPEC.md`: the calculation engine (source of truth)
3. `docs/SCREENS.md`: pages and flows
4. `docs/DATA.md`: database and data sources
5. `docs/IMPORT_FORMAT.md`: market-data import format
6. `docs/ROADMAP.md`: milestones and acceptance criteria. **Work one milestone at a time.**

## Stack (fixed for v1; do not change without asking)
- **engine/**: Python 3.12 package, pure functions, no I/O. Port `reference/engine_reference.py` into a clean, typed module (pydantic models for inputs and outputs).
- **api/**: FastAPI. Exposes `POST /engine/run` (stateless), `POST /engine/stress`, `POST /engine/grid`, and PDF rendering. It does not own user data.
- **web/**: Next.js (App Router, TypeScript), Tailwind with RTL, Auth.js (email + password), Prisma → PostgreSQL. It owns users, projects and market rows, and calls `api/` for calculations.
- **db**: PostgreSQL 16.
- **PDF**: HTML report page rendered by Playwright (Chromium) to A4 PDF. Test Arabic shaping and RTL in Milestone 1. Fonts: IBM Plex Sans Arabic (UI and report), self-hosted.
- **Jobs**: data ingestion scripts in `ingest/` (Python), triggered by n8n on a schedule. n8n already runs on the server.
- **Deploy**: Docker Compose on the owner's Hostinger VPS behind Traefik and Cloudflare. One `docker-compose.yml` with services `web`, `api`, `db`, and an `ingest` one-shot image.

## Non-negotiable rules
1. **Engine parity.** `engine/` must pass every fixture in `fixtures/`. Add a pytest that loads each `fixtures/*.json`, runs the engine and compares `expected` (amounts: max(1 SAR, 0.01%); ratios: 1e-4), plus `base_monthly.json`. CI fails on any mismatch. Never change a fixture to make a test pass; fixtures change only when the reference model changes, and then in a dedicated commit.
2. **No invented numbers.** Never hard-code market prices, rents or rates in UI or engine. Defaults come from `reference_rates` (admin) or the Abhur example template, and are always labelled as defaults or assumptions.
3. **No scraping** of login-protected platforms (Suhail, Aqar, Bayut, etc.). Only official open-data ingestion and user imports.
4. **Arabic first.** All UI strings are in Arabic and live in one dictionary file (`web/src/i18n/ar.ts`). Pages use `dir="rtl"` and `lang="ar"`. Numbers use Western digits with thousands separators. Money is shown in millions with one decimal in summaries.
5. **Privacy.** Project data is only visible to its owner. No analytics payload contains project numbers. Log no request bodies.
6. **"Feasibility study", not "valuation".** Reports and pages must carry the disclaimer from `docs/SCREENS.md`.
7. **Recalculation** happens server-side through `api/`. The web app may debounce (300 ms) but must never re-implement formulas in TypeScript.

## Commands (create these in Milestone 1)
- `make dev`: docker compose up with hot reload
- `make test`: engine pytest (fixtures) + api tests + web typecheck and lint
- `make fixtures-check`: runs `python reference/engine_reference.py` (must print all OK)
- `make migrate`: Prisma migrations

## Working style
- Small PRs per milestone task. Each PR states which acceptance criteria it satisfies.
- When a spec is ambiguous, stop and ask; do not guess formulas.
- Keep `reference/` read-only.
