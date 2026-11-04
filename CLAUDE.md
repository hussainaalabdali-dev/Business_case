# CLAUDE.md — instructions for building this project

## What we are building
An Arabic (RTL) web app for small and mid-size Saudi developers to run a land-development feasibility study: market data, financial model, stress test, decision and a PDF committee memo. Read these in order before writing code:

1. `docs/PRODUCT.md`: scope (what is in and out of v1)
2. `docs/ENGINE_SPEC.md`: the calculation engine (source of truth)
3. `docs/SCREENS.md`: pages and flows
4. `docs/DATA.md`: database and data sources
5. `docs/IMPORT_FORMAT.md`: market-data import format
6. `docs/ROADMAP.md`: milestones and acceptance criteria. **Work one milestone at a time.**

## Scope (MVP, revised 2026-11-04)
Users: the owner and the coach only (two emails). The MVP is a static Arabic site with a 4-step wizard
(تشخيص الفرصة → النموذج المالي → اختبار الضغط → القرار) and a live results panel. Calculations run in the browser.
Out of the MVP (do not build now): PDF, market data, FastAPI on a server, Docker deploy, Tunnel, Next.js, Auth.js, PostgreSQL.
`engine/`, `api/`, the Docker files and the PDF trial from Milestone 1 stay in the repo, unchanged, for later.

## Stack (MVP; do not change without asking)
- **engine/**: Python 3.12 package. It stays the **reference** engine and its tests keep running in CI. Never delete it.
- **engine-ts/**: TypeScript port of `ENGINE_SPEC.md`, pure functions, no I/O. This is what the browser runs.
- **web/**: static site built to files (Vite + TypeScript). RTL, Arabic only.
- **worker/**: Cloudflare Worker (project `business-case`). Serves the static assets and a small `/api/*` for saving and loading projects only. **No calculations in the Worker.**
- **db**: Cloudflare D1 (SQLite).
- **Auth**: Cloudflare Access with an allow-list of two emails. The Worker verifies the Access JWT (`Cf-Access-Jwt-Assertion`) and uses its email as the project owner. No sign-up system of our own.
- **Deploy**: Cloudflare Workers Builds from `main` (`npx wrangler deploy`), config in `wrangler.jsonc`.

## Non-negotiable rules
1. **Engine parity.** `engine/` (Python) and `engine-ts/` (TypeScript) must each pass every fixture in `fixtures/`. Each has a test (pytest / vitest) that loads each `fixtures/*.json`, runs the engine and compares `expected` (amounts: max(1 SAR, 0.01%); ratios: 1e-4), plus `base_monthly.json`. CI fails on any mismatch. Never change a fixture to make a test pass; fixtures change only when the reference model changes, and then in a dedicated commit.
2. **No invented numbers.** Never hard-code market prices, rents or rates in UI or engine. Defaults come from `reference_rates` (admin) or the Abhur example template, and are always labelled as defaults or assumptions.
3. **No scraping** of login-protected platforms (Suhail, Aqar, Bayut, etc.). Only official open-data ingestion and user imports.
4. **Arabic first.** All UI strings are in Arabic and live in one dictionary file (`web/src/i18n/ar.ts`). Pages use `dir="rtl"` and `lang="ar"`. Numbers use Western digits with thousands separators. Money is shown in millions with one decimal in summaries.
5. **Privacy.** Project data is only visible to its owner. No analytics payload contains project numbers. Log no request bodies.
6. **"Feasibility study", not "valuation".** Reports and pages must carry the disclaimer from `docs/SCREENS.md`.
7. **Recalculation** runs in the browser through `engine-ts/` only. Formulas live in `engine-ts/` and nowhere else in the web app or the Worker. `engine-ts/` is allowed only while its parity tests pass in CI against every fixture and `base_monthly.json` with the tolerance in rule 1; a mismatch blocks the merge. The Python engine stays the reference: if the two disagree, the Python engine and the fixtures win.

## Commands
- `make test`: reference check + Python engine and api tests + `engine-ts` parity tests + web typecheck and build
- `make fixtures-check`: runs `python reference/engine_reference.py` (must print all OK)
- `npm run dev` (in `web/`): local site with hot reload; `npx wrangler dev`: site + Worker + local D1
- `npx wrangler d1 migrations apply`: D1 migrations

## Working style
- Small PRs per milestone task. Each PR states which acceptance criteria it satisfies.
- When a spec is ambiguous, stop and ask; do not guess formulas.
- Keep `reference/` read-only.
