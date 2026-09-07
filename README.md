# DECODING JOBS

A map-based job search command center for tech students. Explore real companies across major India tech hubs on an interactive map or a grid view, filter by sector/stage/city, search roles, get AI-powered resume/interview coaching, apply with one click, and track applications on a Kanban board — all identified by email only, no login required.

![Next.js](https://img.shields.io/badge/Next.js-15-black)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL+PostGIS-16-336791)
![Docker](https://img.shields.io/badge/Docker-Compose-blue)

---

## Features

- **Interactive Map** — MapLibre GL with real street/park/water detail, colorful company pins with hiring pulse animations, and a fast-blinking "NEW" flash when a role was posted in the last 3 days
- **Grid View** — a Map/Grid toggle switches the same filtered company set into a scrollable card grid, for browsing a whole city's roster at a glance
- **Spatial Search** — Companies loaded by viewport bounding box via PostGIS
- **Smart Filters** — Sector, stage, area, city, and hiring status, closed by default so the map stays full-bleed
- **Job Search** — Full-text search with autocomplete suggestions
- **Company Panel** — Only appears when you click a pin/card (floats over the map, doesn't reserve permanent screen width); shows logo, about/description, salary, work mode, sentiment (pros/cons), culture score
- **1-Click Apply** — Submit applications with resume selection
- **List Your Startup** (`/register`) — founders self-register their company and post roles directly, verified instantly by matching their work-email domain to the company's website (see [below](#list-your-startup-register))
- **AI Job Search Assistant** (`/assistant`) — chat grounded in this app's real data, resume upload + ATS scoring + iterative AI rewriting, and company/role-specific interview prep (see [below](#ai-job-search-assistant-assistant))
- **Application Tracker** (`/tracker`) — a Kanban board with email-based auto-advancement from forwarded interview emails
- **Logo Proxy** — Server-side, Postgres-backed favicon caching for company logos

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS 4 |
| Map | MapLibre GL, react-map-gl, Supercluster |
| State | Zustand, TanStack React Query |
| UI | Radix UI, Lucide Icons, class-variance-authority |
| Backend | FastAPI, SQLAlchemy 2 (async), Pydantic v2 |
| Database | PostgreSQL 16 + PostGIS 3.4 |
| Infrastructure | Docker Compose |

---

## Project Structure

```
DECODING-JOBS/
├── apps/
│   └── web/                    # Next.js frontend
│       ├── app/                # App Router (pages + API routes)
│       │   ├── api/logo/       # Favicon proxy, backed by the core-api logo cache
│       │   ├── assistant/      # AI Assistant page
│       │   ├── register/       # Founder self-registration page
│       │   ├── tracker/        # Application Tracker (Kanban) page
│       │   ├── layout.tsx      # Root layout with providers
│       │   └── page.tsx        # Home page (map + grid + side panel)
│       ├── components/
│       │   ├── MapWorkspace.tsx       # Map + grid view, pins, filters, search
│       │   ├── ResponsiveShell.tsx    # Full-bleed map, floating side panel
│       │   ├── CompanySidePanel.tsx   # Company detail + apply flow
│       │   ├── ChatAssistant.tsx      # AI Assistant chat UI
│       │   ├── ChatHistorySidebar.tsx # Chat conversation list
│       │   ├── RegisterCompanyForm.tsx # Founder self-registration form
│       │   ├── KanbanBoard.tsx        # Application Tracker board
│       │   ├── EmailGate.tsx          # Shared email-only identity gate
│       │   ├── TopNav.tsx             # Navigation bar
│       │   └── ui/                    # Reusable UI primitives
│       └── lib/
│           ├── api.ts          # Typed API client for core-api
│           ├── store.ts        # Zustand store (selectedCompanyId)
│           └── utils.ts        # Utility functions (cn, etc.)
├── services/
│   └── core-api/               # FastAPI backend
│       ├── app/
│       │   ├── api/
│       │   │   ├── companies.py    # Spatial search + filters + self-registration
│       │   │   ├── jobs.py         # Job search + suggestions + founder posting
│       │   │   ├── applications.py # Application submission + Kanban board
│       │   │   ├── resumes.py      # Resume upload + ATS scoring
│       │   │   ├── chat.py         # AI Assistant chat + conversation history
│       │   │   └── emails.py       # SendGrid inbound email → interview tracking
│       │   ├── services/
│       │   │   ├── groq_client.py            # Shared Groq (LLM) HTTP client
│       │   │   ├── company_verification.py   # Work-email-domain verification
│       │   │   └── geo.py                    # City-center fallback coordinates
│       │   ├── core/config.py      # Pydantic settings
│       │   ├── db/session.py       # Async SQLAlchemy engine
│       │   ├── models/domain.py    # ORM models (Company, Job, Application, Resume, Chat...)
│       │   ├── schemas.py          # Pydantic request/response schemas
│       │   └── main.py             # FastAPI app + middleware
│       ├── Dockerfile          # Multi-stage (builder → dev → prod)
│       └── requirements.txt
├── infra/
│   ├── docker-compose.yml      # PostGIS + core-api services
│   └── init-db/                # SQL migrations + seed data (17 files)
├── scripts/                    # Scraper & utility scripts (fetch-real-jobs.mjs, geocode.mjs)
└── .gitignore
```

---

## Prerequisites

- **Docker** & **Docker Compose** (v2+) — [Install Docker](https://docs.docker.com/get-docker/)
- **Node.js** 18+ & **npm** — [Install Node](https://nodejs.org/)
- **Git**

---

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/Davidbala2004/DECODING-JOBS.git
cd DECODING-JOBS
```

### 2. Start the backend (Docker)

```bash
cd infra
docker compose up -d --build
```

This starts:
- **PostGIS** on `localhost:5432` — with schema migrations + seed data (auto-runs on first start)
- **core-api** on `localhost:8000` — FastAPI with hot reload

Wait ~30 seconds for the database to initialize. Verify:

```bash
curl http://localhost:8000/health
# → {"status":"ok","service":"DECODING JOBS Core API"}

curl http://localhost:8000/health/db
# → {"status":"ok","database":"reachable"}
```

### 3. Start the frontend

```bash
cd ../apps/web
npm install
npm run dev
```

Open **http://localhost:3000** in your browser.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Liveness probe |
| GET | `/health/db` | Database readiness probe |
| GET | `/api/v1/companies/search` | Spatial search by bounding box + filters |
| GET | `/api/v1/companies/{id}` | Single company detail |
| GET | `/api/v1/companies/sectors` | Distinct sectors |
| GET | `/api/v1/companies/stages` | Distinct stages |
| GET | `/api/v1/companies/areas` | Distinct areas |
| GET | `/api/v1/companies/types` | Company type categories |
| GET | `/api/v1/companies/cities` | Distinct cities |
| POST | `/api/v1/companies/seed` | Seed/upsert a company from the ingestion pipeline |
| POST | `/api/v1/companies/register` | Founder self-registers a company (verified by work-email domain) |
| GET | `/api/v1/jobs` | List active jobs |
| GET | `/api/v1/jobs/search` | Full-text job search |
| GET | `/api/v1/jobs/suggestions` | Autocomplete suggestions |
| GET | `/api/v1/jobs/{id}` | Single job detail |
| POST | `/api/v1/jobs/seed` | Seed/upsert a job from the ingestion pipeline |
| POST | `/api/v1/jobs/register` | Founder posts a role under their own (verified) company |
| POST | `/api/v1/jobs/expire-stale` | Mark pipeline-sourced jobs inactive if unrefreshed for N days |
| POST | `/api/v1/applications/submit` | Submit job application |
| POST | `/api/v1/applications/save` | Save a job to the tracker without applying |
| GET | `/api/v1/applications/board` | Kanban board state for an email |
| POST | `/api/v1/resumes/upload` | Upload a resume (PDF/DOCX) for ATS scoring |
| POST | `/api/v1/resumes/{id}/analyze` | Score/re-score a resume, optionally against a job |
| GET | `/api/v1/resumes` | List a user's uploaded resumes |
| POST | `/api/v1/chat` | Chat with the AI Assistant (tool-calling, grounded in real data) |
| GET | `/api/v1/chat/conversations` | List a user's chat conversations |
| GET | `/api/v1/chat/conversations/{id}/messages` | Full message history for a conversation |
| DELETE | `/api/v1/chat/conversations/{id}` | Delete a conversation |
| GET | `/api/v1/logos?domain=` | Cached company logo proxy (frontend calls it via `/api/logo`) |

---

## Environment Variables

### Backend (`services/core-api/.env`)

```env
PROJECT_NAME="DECODING JOBS Core API"
ENVIRONMENT=development
API_V1_PREFIX=/api/v1
DATABASE_URL=postgresql+asyncpg://decoding_admin:decoding_pass_dev@postgis:5432/decoding_jobs
CORS_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:3002,http://localhost:3333
```

### Frontend (`apps/web/.env.local`)

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

> `.env.local` is optional — defaults to `http://localhost:8000` if not set.

### Personal secrets (`services/core-api/.env.local`)

`services/core-api/.env` is committed (non-sensitive dev defaults only — DB password, CORS origins). Real secrets — `GROQ_API_KEY`, `SENDGRID_INBOUND_USERNAME`/`PASSWORD`, `INGESTION_API_KEY` — go in `services/core-api/.env.local` instead, which `infra/docker-compose.yml` loads as an optional overlay on top of `.env` and which `.gitignore` keeps out of version control.

**`INGESTION_API_KEY` matters even for local dev**, unlike the others: `POST /companies/seed`, `/jobs/seed`, and `/jobs/expire-stale` have write access to the live map and reject every request until this is set (closed by default, not "feature disabled" like the others). Generate one and put the same value in both places it's needed:

```bash
python -c "import secrets; print(secrets.token_hex(32))"
# → put the output in BOTH:
#   services/core-api/.env.local   INGESTION_API_KEY=<value>
#   scripts/.env                   INGESTION_API_KEY=<value>   (same value, scripts/fetch-real-jobs.mjs sends it as X-Ingestion-Key)
```

Restart the `core-api` container after changing `.env.local` — env vars are read once at container start (`docker restart` reuses the old environment; use `docker compose up -d core-api` from `infra/` to actually reload it).

**Never put a real API key directly in `.env`, in this README, or in any other committed file.** An API key is tied to your account's billing and rate limits — a key that ends up in a public repo gets scraped by bots within minutes and either runs your quota to zero or gets flagged and revoked by the provider's own key-scanning. Everyone who runs this project gets their **own** free key:

```bash
# services/core-api/.env.local (create this file yourself — it's gitignored)
GROQ_API_KEY=your-own-key-from-console.groq.com
```

Sign up free at [console.groq.com](https://console.groq.com) — no card required — to get a key for the AI Assistant chat, resume ATS scoring, and email-based interview extraction described below.

---

## Development

### Hot Reload

- **Backend**: Source is bind-mounted — edits to `services/core-api/app/` auto-reload
- **Frontend**: Next.js dev server auto-reloads on file changes

### Useful Commands

```bash
# Backend logs
cd infra && docker compose logs -f core-api

# Restart backend
cd infra && docker compose restart core-api

# Full rebuild
cd infra && docker compose up -d --build

# Frontend lint
cd apps/web && npm run lint

# Frontend build check
cd apps/web && npm run build

# Stop everything
cd infra && docker compose down

# Stop and wipe database
cd infra && docker compose down -v
```

---

## Database

### Schema

Tables are created via SQL scripts in `infra/init-db/` (run once on first container start):

| Script | Purpose |
|--------|---------|
| `01-init-postgis.sql` | Enable PostGIS extension + create `companies` table with geometry |
| `02-init-jobs-users.sql` | Create `jobs` and `users` tables |
| `03-add-sentiment-and-work-mode.sql` | Add sentiment_summary, culture_score, work_mode columns |
| `04-init-applications.sql` | Create `applications` table |
| `05-add-real-company-fields.sql` | Add sector, stage, area, city, funding, etc. |
| `06-09` | Seed data — companies across Bengaluru, Chennai, Hyderabad, Kochi |

### Reset Database

```bash
cd infra
docker compose down -v    # Remove volume
docker compose up -d --build   # Recreate from scratch
```

---

## Real Data Ingestion

Company/job data is populated via `scripts/fetch-real-jobs.mjs`, which pulls **real** postings from legitimate, ToS-safe sources (no LinkedIn/Naukri scraping):

- **Adzuna Jobs API** — free-tier, real India listings with real apply links. Adzuna's free/Developer tier is meant for evaluation and non-commercial use — check their current commercial terms directly before relying on it in a monetized product; it's a fine way to bootstrap a demo, not a long-term commercial data source.
- **Greenhouse / Lever public job-board JSON** — no auth needed, real, first-party postings straight from each company's own career page (not a reseller), so no commercial-licensing concern. Board tokens drift (companies migrate ATS or rename boards) and only work for companies that use one of these two ATS providers — see `KNOWN_BOARDS` in the script for the current curated, hand-verified list. Every entry was checked against the live API (not just "does the token resolve," since a resolving token can belong to an unrelated foreign company — verify the actual job `location` fields match before trusting a hit).

For cities the pipeline can't reach (most tier-2 hubs have very few companies on Greenhouse/Lever), the sustainable path is founder self-registration — see [List Your Startup](#list-your-startup-register) above.

**Description cleanup**: Greenhouse's API returns job descriptions HTML-*entity*-encoded (literal `&lt;div&gt;` text, not real `<div>` tags), which a plain tag-stripping regex can't catch — the raw markup used to leak straight into the UI. `cleanJobDescription()` in the script decodes entities first, turns block-level tags into real line breaks (so paragraph/list structure survives), then strips what's left.

```bash
cd scripts
npm install
cp .env.example .env
# Fill in ADZUNA_APP_ID / ADZUNA_APP_KEY — free signup at https://developer.adzuna.com/

npm run fetch:jobs            # both sources, all cities
npm run fetch:jobs:adzuna     # Adzuna only
npm run fetch:jobs:boards     # Greenhouse/Lever only

node fetch-real-jobs.mjs --city=Mumbai --source=all   # a single city
```

Covers all major India tech hubs: Bengaluru, Chennai, Hyderabad, Kochi, Mumbai, Pune, Delhi NCR, Kolkata, Ahmedabad. The script upserts companies by name and refreshes a job's `fetched_at` if it's seen it before, so it's safe to re-run.

Every run also sweeps for staleness: any pipeline-sourced job not re-confirmed by a run in the last `STALE_JOB_DAYS` (default 21) gets marked inactive, so listings that quietly disappeared from the source stop showing as "open." Statically-seeded demo jobs (no `fetched_at`) are never touched by this.

To keep listings fresh automatically, start the optional refresher container:

```bash
cd infra
docker compose --profile refresh up -d
```

This re-runs the fetcher on a 6-hour loop against the running core-api.

---

## Application Tracker & Email-Based Interview Tracking

The Application Tracker (`/tracker`) is a Kanban board (Saved → Applied → Interviewing → Offered) identified by email — no password, no login. Every user gets a personal forwarding address (`u-{token}@{INBOUND_EMAIL_DOMAIN}`); forwarding a company's interview email to it lets the backend auto-advance that card's round/status instead of clicking through manually.

**To enable email extraction** (free, no paid API key): set `GROQ_API_KEY` in `services/core-api/.env.local` (see [Personal secrets](#personal-secrets-services-core-api-envlocal) above) — sign up free at [console.groq.com](https://console.groq.com). Without it, the webhook still works but logs an unmatched, unextracted event instead of erroring.

**To enable real inbound email** (needs a domain you control):
1. Point that domain's MX record at SendGrid.
2. In SendGrid, create an Inbound Parse route for it targeting `POST https://{user}:{password}@<your-api-host>/api/v1/emails/inbound` — embedding HTTP Basic Auth credentials in the URL is SendGrid's own documented way to secure an Inbound Parse route (it has no request-signing like their separate Event Webhook does).
3. Set `INBOUND_EMAIL_DOMAIN` (the domain from step 1), `SENDGRID_INBOUND_USERNAME`, and `SENDGRID_INBOUND_PASSWORD` (matching what you put in the webhook URL) in `services/core-api/.env.local`.

Until `SENDGRID_INBOUND_USERNAME`/`SENDGRID_INBOUND_PASSWORD` are set, the webhook stays open (so it's testable locally, see below) — set both before pointing a real domain at it. `INBOUND_EMAIL_DOMAIN` staying empty makes the tracker show a "not set up yet" banner; the manual "Next round" button on each card keeps working regardless.

**Test the webhook locally without any of the above**, simulating SendGrid's POST:
```bash
curl -X POST http://localhost:8000/api/v1/emails/inbound \
  -F "to=u-<forwarding_token>@track.example.com" \
  -F "from=hr@razorpay.com" \
  -F "subject=Interview Invitation - Round 2" \
  -F "text=We'd like to invite you to a second round technical interview."
```
Get `<forwarding_token>` from `POST /api/v1/users/identify {"email": "you@example.com"}`'s response.

---

## AI Job Search Assistant (`/assistant`)

A third page alongside the map and the tracker: a Claude/ChatGPT-style chat assistant grounded in this app's own real company/job data (never invents a company or posting — every job/company it names comes from a tool call into the database), plus a resume ATS coach.

- **Chat** — ask about roles, cities, or companies ("Remote frontend roles in Bengaluru"); the assistant calls real search/filter tools and replies with actual result cards that link back into the map. Ask for interview prep ("prepare me for a Razorpay backend interview") and it pulls that company's real culture/sentiment data plus the real job description when one exists — general interview-format advice is clearly separated from that real data, never presented as a leaked/real question. Replies render as full Markdown (tables, headers, lists).
- **Resume Coach** — attach a PDF/DOCX resume in-chat (≤5MB, paperclip icon, no separate upload page); it's parsed to text (`pypdf`/`python-docx`) and scored for ATS-friendliness (0–100) with strengths/weaknesses/rewrite suggestions via the same Groq key used above. Ask it to rewrite the resume and it produces a full ATS-safe Markdown rewrite (single-column, standard section headers, plain bullets — no tables/graphics that break ATS parsers); ask for further edits and it revises that same rewritten version instead of restarting from the raw original, like any other iterative chat assistant. Re-analyzing against a specific job (via "Prep for this role" on any job card in the map's side panel, or by picking a resume while `?jobId=` is set) also surfaces missing keywords from that job's real description.
- **Chat History** — every conversation is persisted (`chat_conversations`/`chat_messages` tables) and listed in a sidebar, so you can pick up an old thread instead of losing it on refresh.
- **Identity** — same email-only gate as the tracker (`useIdentityStore`/`EmailGate`), no separate login.

Needs the same `GROQ_API_KEY` as the email pipeline above — unset, both chat and resume analysis reply with a friendly "not configured yet" instead of erroring.

---

## List Your Startup (`/register`)

A founder self-service flow — the primary way new companies and roles get onto the map without needing a scraper or an admin queue.

1. **Register the company** — name, website, sector/stage/city/area, optional exact office coordinates (falls back to a jittered city-center placement if omitted), and the founder's **work email**.
2. **Verification** — the founder's email domain must match the company's website domain (`you@acme.com` for `acme.com`). Personal providers (Gmail, Yahoo, Outlook, etc.) are rejected outright, and a domain mismatch gets a specific, actionable error — no admin review needed, but also no way to claim a company you don't control the domain for.
3. **Post roles** — once verified, the founder can add open roles directly; every posting re-verifies the founder's email against that specific company's domain, so only whoever controls the domain can add roles to it.

This is intentionally the long-term, sustainable data source for cities the scraper pipeline doesn't reach (see [Real Data Ingestion](#real-data-ingestion) below) — it's first-party (the company itself), has no third-party licensing concerns, and can't go stale the way an aggregated feed can.

---

## Deployment

### Backend (Production)

The Dockerfile has a `production` target:

```bash
docker build --target production -t decoding-jobs-api ./services/core-api
```

### Frontend (Vercel / Any Host)

```bash
cd apps/web
npm run build
npm start
```

Set `NEXT_PUBLIC_API_URL` to your production API URL.

---

## License

MIT

---

Built with care for tech students exploring the South Indian startup ecosystem.
