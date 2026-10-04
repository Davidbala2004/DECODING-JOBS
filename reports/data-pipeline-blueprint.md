# DECODING JOBS — Production Data Pipeline Blueprint

**Goal:** a self-running, observable, dedupe-correct ingestion pipeline that keeps
real jobs + enriched companies flowing into PostGIS, with logos and links for
every company a user can see. This is the "million-dollar product" bar: not a
script someone runs by hand, but a **scheduled, monitored, idempotent system**.

---

## 1. The four stages

```
  ┌─────────┐   ┌────────────┐   ┌──────────────┐   ┌──────────────┐
  │  FETCH  │ → │  NORMALIZE │ → │   ENRICH     │ → │   SERVE      │
  └─────────┘   └────────────┘   └──────────────┘   └──────────────┘
   Adzuna        mojibake fix      website/domain      PostGIS +
   Greenhouse    sector/workmode   logo (favicon)      core-api +
   Lever         classify          LinkedIn            map/assistant
   (Workday…)    geocode+decluster  funding/stage
```

### Stage 1 — FETCH (exists: `scripts/fetch-real-jobs.mjs`)
Sources today: **Adzuna** (6,937 jobs), **Greenhouse** (108), **Lever** (86), plus
`linkedin`/`careers`/`manual` seeds. All ToS-safe.
- **Add:** Workday + SmartRecruiters boards for ATS parity.
- **Add:** per-source run counters + fetch-error capture.

### Stage 2 — NORMALIZE (exists)
Mojibake repair, sector/work-mode/employment classification, geocoding +
`declusterSharedPoints` so pins don't stack, then upsert via core-api
`/companies/seed` + `/jobs/seed`. The seed endpoint **upserts by
(company_id, title)** and bumps `fetched_at`, and `/jobs/expire-stale` retires
postings not re-confirmed — so re-running is idempotent and self-maintaining.

### Stage 3 — ENRICH (**built this session**)
The gap: 3,241 of 3,445 companies had **no website**, and because the frontend
resolves every logo via `/api/logo?domain=<website host>`, no website = blank
pin/card. New pieces:

| Piece | What it does |
|---|---|
| `GET /companies/enrichment/queue` | Lists companies missing a website (ingestion-key protected), paginated by `offset`. |
| `POST /companies/enrich` | Batch-fills `website_url`/`linkedin_url`, **only where currently empty** (never clobbers verified data). |
| `scripts/enrich-companies.mjs` | Resolves name → domain via Clearbit Autocomplete (free, no key), scores on the **domain label** (not the name, which is noisy), writes back in batches. |

**Result this run:** website coverage **204 → 1,586 companies (5.9% → 46%)**, and
logos lit up automatically everywhere (map, grid, cards, panel, Kanban) with zero
frontend changes — because the whole app derives logos from the website host.

- **Next:** LinkedIn URL resolution; funding/stage/founded/team enrichment for
  the remaining companies; schedule this stage after every fetch.

### Stage 4 — SERVE (exists)
PostGIS spatial search, Postgres FTS, the assistant (Groq tool-calling),
saved-search **alerts**, Telegram/email. This is what users touch.

---

## 2. Orchestration (the part that makes it "live")

Today the `refresher` service in `infra/docker-compose.yml` already loops
`fetch-real-jobs.mjs --city=all --source=all` every **6h** — **but it is behind an
opt-in profile and is currently OFF** (data froze on Oct 2). To go live:

```bash
docker compose --profile refresh up -d          # turns the 6h refresh loop on
```

Then the full production loop becomes:
1. **every 6h** → FETCH + NORMALIZE + (new) ENRICH
2. **hourly/daily** → **alert sweep** (`POST /alerts/sweep`) so users actually
   receive "new job" alerts (currently a manual endpoint, never scheduled)
3. **daily** → `/jobs/expire-stale` + a re-enrichment pass over the queue

**Honest note:** Adzuna is batch/poll-based, not a true stream. "Live" = frequent
polling. A genuine stream needs employer ATS webhooks / RSS — a later, optional
upgrade.

---

## 3. Observability (what a million-dollar pipeline has that a script doesn't)

- **Run ledger:** persist per-run `{source, fetched, created, updated, expired,
  errors, duration}`; expose the last run per source.
- **Zero-fetch alarm:** if a source returns 0 new rows, alert — silent death is
  the #1 ingestion failure mode.
- **Backoff:** Adzuna rate-limit retry (mirroring the Groq client's 429 handling).
- **Data-quality checks:** % of companies with a website/logo, % of jobs with a
  real `apply_url`, orphan/duplicate detection — surfaced as a health endpoint.

---

## 4. Current numbers (baseline for monitoring)

| Metric | Value |
|---|---|
| Companies | 3,445 |
| With website (→ logo) | **1,586 (46%)** |
| Still unenriched | 1,859 (mostly acronyms/agencies Clearbit can't resolve confidently) |
| Jobs | 7,213 (4,770 active) |
| Sources | adzuna 6,937 · greenhouse 108 · lever 86 · linkedin 53 · careers 24 · manual 5 |
| Last fetch | 2026-10-02 (refresher OFF) |

---

## 5. Build order to finish this

1. **Turn the refresher on** + schedule the alert sweep (immediate, 1 command + 1 cron).
2. **Add ENRICH to the refresh loop** so every fetch re-enriches the incremental backlog.
3. **Run ledger + zero-fetch alarm** (the observability layer).
4. **LinkedIn + funding/stage enrichment** for the remaining fields.
5. Optional: **semantic search** (pgvector) so matching improves and prompts shrink.
