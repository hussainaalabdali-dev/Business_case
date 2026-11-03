# DATA — Data model and sources (v1)

## 1. Sources

| Source | What | How | Legal status | v1 |
|---|---|---|---|---|
| MOJ open data (Ministry of Justice) via open.data.gov.sa | Individual sale transactions: price, area, city, district, classification, reference no. | Scheduled download (n8n → ingestion script) | KSA Open Data Licence: attribution required; keep the raw files unmodified, derived data separate | **Yes (Jeddah)** |
| REGA sales indicators | Aggregates by region (avg/min/max SAR/m², deed counts) | Scheduled download | Open data | Yes |
| REGA rental indicators (rentalrei.rega.gov.sa) / Ejar index | Rent by city; district detail via the Ejar index | Scheduled download where public; otherwise manual import | Open / verify per source | Yes (city level) |
| Platforms that require login (Suhail, Aqar, Bayut…) | Deals, listings | **User-side only**: manual paste or the Claude browser extension → `IMPORT_FORMAT` | Platform terms apply to the user; we never scrape them | Import only |
| Construction reference rates | Per-m² and BOQ default rates | Admin panel | Our data | Yes |
| Building regulations (FAR, floors, coverage) | Per plot | User input + uploaded licence | — | Manual |

**First task in Milestone 2:** download one MOJ sample for Jeddah and record the real field names, district spelling and whether coordinates exist in §4 below. Do not design district matching before this.

References:
- Community mirror and scripts: https://github.com/civillizard/Saudi-Real-Estate-Data. Use it only to locate the official endpoints; ingest from the official source.
- MOJ open data policy: https://www.moj.gov.sa/ar/OpenData/pages/opendatapolicy.aspx

## 2. Tables (PostgreSQL)

```
users(id, email unique, password_hash, name, created_at, last_login_at, is_admin bool)

projects(id, user_id → users, name, city, district, location_text, created_at, updated_at,
         template_of nullable, archived bool)

project_inputs(project_id → projects PK, inputs jsonb, version int, updated_at)
    -- inputs = the ENGINE_SPEC input object (scenario vars as {conservative,base,optimistic}, _boq list)

project_results(project_id PK, engine_version text, results jsonb, monthly jsonb, computed_at)
    -- cache only; always recomputable

project_text(project_id PK, diagnosis jsonb, scorecard jsonb, checklist jsonb, offers text, notes text)

market_rows(id, project_id → projects, platform, type, deal_or_offer, description, area_m2 numeric,
            total_price numeric, price_per_m2_direct numeric, price_per_m2 numeric generated,
            date_text, url, included bool, note, source enum('moj_open_data','rega','import','manual'),
            source_ref text null, created_at)

moj_transactions(id, ref_no unique, city, district, classification, property_type, area_m2, price,
                 price_per_m2, deal_date, raw jsonb, ingested_at, source_file)

rega_indicators(id, kind enum('sale','rent'), region, city, period, metric, value, raw jsonb, ingested_at)

reference_rates(id, key, value numeric, unit, source, updated_at)   -- RateAbove, RateBase, RateGP, BOQ rates

reports(id, project_id, file_path, created_at, engine_version)

ingestion_runs(id, source, started_at, finished_at, rows_in, rows_ok, rows_rejected, error text)
```

## 3. Rules
- Every number that the system fills into a project carries `source` and `source_ref` or a date. The UI shows them.
- Project data belongs to the user. Admins see counts only, never content.
- Raw government files are stored unmodified in object storage (`/data/raw/<source>/<date>/`). Parsed tables live separately.
- Attribution line for MOJ data appears on every page that shows MOJ rows and in the PDF.

## 4. MOJ field mapping (to be filled in Milestone 2)
| Raw field | Our column | Notes |
|---|---|---|
| _tbd_ | ref_no | |
| _tbd_ | district | spelling variants? |
| _tbd_ | property_type | values for apartment / land / villa? |
| _tbd_ | area_m2 | deed area |
| _tbd_ | price | |
| _tbd_ | deal_date | Hijri or Gregorian? |
| _tbd_ | coordinates? | exists? |
