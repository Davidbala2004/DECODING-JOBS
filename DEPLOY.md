# Deploying Decoding Jobs for the tester round

A runbook for getting the app onto public URLs so ten testers can use it from
their own machines. Written for the **$0** path — Vercel + Render free + Neon
free — with sign-in via **Google only**, so no email provider is needed.

Total cost: **$0/month.** The only optional spend is a custom domain
(~$10–12/year), and everything here works fine on the free subdomains.

---

## What runs where

| Piece | Host | Plan | Why there |
| --- | --- | --- | --- |
| `apps/web` (Next.js) | **Vercel** | Hobby, free | Built for Next.js; zero config for the frontend |
| `services/core-api` (FastAPI) | **Render** | Free | The repo's Dockerfile just works; `render.yaml` is already committed |
| Database | **Neon** | Free | Needs PostGIS. Render's *free* Postgres **expires 30 days after creation**, which would kill the study mid-way; Neon's free tier doesn't expire |

The map's basemap is CARTO's public style, which needs no API key and costs
nothing. The AI assistant and resume scoring use Groq's free tier. Adzuna's job
feed is free. **There is no Mapbox or OpenAI bill waiting at the end of this.**

Your final URLs will look like:

```
https://decoding-jobs-api.onrender.com     ← API
https://decoding-jobs.vercel.app           ← app you send to testers
```

## Accounts you need (all free)

- [Neon](https://neon.com) — database
- [Render](https://render.com) — API (GitHub sign-in is easiest)
- [Vercel](https://vercel.com) — frontend (GitHub sign-in)
- [Google Cloud Console](https://console.cloud.google.com) — OAuth client (free)

No credit card is required for any of the four.

---

## Step 1 — Create the Neon database

1. Sign in at [console.neon.tech](https://console.neon.tech) → **New Project**.
2. Name it `decoding-jobs`.
3. **Postgres version: choose 16.** Your local database is PostGIS 16, and
   matching the major version keeps `pg_restore` from complaining.
4. **Region: Singapore** (`ap-southeast-1`) if offered — closest to Bengaluru.
5. Create it, then open **Connection string** and copy the string. It looks like:

```
postgresql://decoding_admin:PASSWORD@ep-cool-name-123456.ap-southeast-1.aws.neon.tech/decoding_jobs?sslmode=require
```

Two things about this URL:

- **Strip `?sslmode=require` when you hand it to the app** and use `?ssl=require`
  instead (step 3). `psql` and the seeding script want `sslmode`; SQLAlchemy's
  asyncpg driver wants `ssl`.
- **Use the direct (non-pooled) endpoint.** Neon's pooler has `-pooler` in the
  hostname. Skip it: asyncpg + PgBouncer can fail with `prepared statement
  "..." already exists`, which is a confusing error to debug later. Your
  database is 32 MB and the API runs one worker, so you don't need pooling.

---

## Step 2 — Copy your data into it

The hosted database starts empty. A fresh PostGIS database gives you the schema
and **zero companies** — a hosted map with no pins. Your 3,851 companies live in
SQL seed files that no managed host will run for you, and those files have since
been modified by later migrations (mojibake repair, seed-company deactivation),
so replaying them by hand wouldn't reproduce what you have locally anyway.

Dumping the local database is both the simplest and the most accurate option.

With your local PostGIS container running (`cd infra && docker compose up -d postgis`), from the repository root:

```bash
bash infra/deploy/seed-remote-db.sh "postgresql://…@ep-xxx.ap-southeast-1.aws.neon.tech/decoding_jobs?sslmode=require"
```

Run it through `bash` rather than `./`. On Git Bash for Windows a checked-out
script can end up with CRLF endings and then fail with
`bad interpreter: /usr/bin/env bash^M` — invoking `bash <script>` skips the
shebang entirely, so line endings and the executable bit never matter.

The script dumps locally, enables PostGIS remotely, restores, and prints row
counts to verify. Expect **3851 companies, 7570 jobs**.

It also **truncates the local dev accounts** (users, sessions, resumes, chat,
applications) after the copy, so your dev sign-ins and their live session tokens
never become working accounts on a public host. Pass `--keep-local-users` if you
deliberately want them.

Useful variations:

```bash
bash infra/deploy/seed-remote-db.sh "postgresql://…" --keep-local-users   # keep dev users
LOCAL_CONTAINER=my-container bash infra/deploy/seed-remote-db.sh "postgresql://…"
```

---

## Step 3 — Deploy the API on Render

### Option A — Blueprint (uses the committed `render.yaml`)

1. Push this repo to GitHub with [`render.yaml`](render.yaml) at the root.
2. In the Render dashboard: **New → Blueprint** → pick the repo → **Apply**.
3. Render asks for the four `sync: false` variables. Fill them in:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | `postgresql+asyncpg://USER:PASSWORD@ep-xxx.ap-southeast-1.aws.neon.tech/decoding_jobs?ssl=require` |
| `CORS_ORIGINS` | your Vercel URL — you may not have it yet, see step 4 |
| `FRONTEND_URL` | same Vercel URL |
| `GOOGLE_CLIENT_ID` | same value as `NEXT_PUBLIC_GOOGLE_CLIENT_ID` in `apps/web/.env.local` |

`ENVIRONMENT=production` and `INGESTION_API_KEY` are set for you — the key is
generated, and you can read it from the dashboard if you later want to run the
job fetcher against production.

### Option B — Manual service

**New → Web Service** → connect the repo → set:

- **Language/Runtime:** Docker
- **Root Directory:** `services/core-api`
- **Dockerfile Path:** `Dockerfile`
- **Region:** Singapore
- **Instance Type:** Free
- **Health Check Path:** `/health`

Then add the same environment variables as the table above, plus
`ENVIRONMENT=production`.

> **Both options:** the free instance is 0.1 CPU / 512 MB. `render.yaml` already
> overrides the Dockerfile's `--workers 2` down to `--workers 1`. If you're
> setting the service up manually, either set the start command to
> `uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1` or accept that
> two workers may be tight on memory.

Once deployed, confirm both health endpoints answer:

```bash
curl -s https://decoding-jobs-api.onrender.com/health
curl -s https://decoding-jobs-api.onrender.com/health/db
```

The first request may take ~50 seconds — that's the free tier waking up. See
step 6 for how to stop that happening to your testers.

---

## Step 4 — Deploy the frontend on Vercel

> **Set the production branch BEFORE you deploy — this bites everyone once.**
>
> Vercel's import flow never asks which branch to use. It takes your repository's
> **default branch, which is `main`**, and this repo's `main` is badly stale: it
> lacks the design polish (`aa1e05f`) and the map fixes (`65f8286`), while
> carrying one merge commit the good branch doesn't have. Worse, that old code
> still contains four `react/no-unescaped-entities` errors, so the very first
> build **fails** with `Command "npm run build" exited with 1` — which looks like
> a broken project rather than a wrong branch.
>
> Fix it before importing, or immediately after:
> **Settings → Environments → Production → Branch Tracking** → enter
> **`feat/updated-decode`** → **Save**.
>
> That setting only governs *future* pushes, and it does not redeploy on its own.
> You need one push to that branch to get a production deployment out of it.

1. [vercel.com/new](https://vercel.com/new) → import the same GitHub repo. If no
   repositories are listed, Vercel's GitHub App isn't installed yet — click
   **Install**, pick the account that owns the repo, choose **Only select
   repositories** and select just this one.
2. **Root Directory: `apps/web`** ← the one setting people miss. This repo has no
   root `package.json`, so deploying from the repo root fails.
3. Framework preset auto-detects as Next.js. Leave the build settings alone.
4. Add environment variables (Production scope):

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `https://decoding-jobs-api.onrender.com` (no trailing slash) |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | your Google OAuth client ID |
| `NEXT_PUBLIC_SITE_URL` | `https://your-app.vercel.app` (used for metadata/social images) |

5. **Deploy**, then copy the resulting URL.

`NEXT_PUBLIC_*` values are baked in **at build time** — if you change one later
you must trigger a redeploy, not just edit the variable.

Now go back to Render and set `CORS_ORIGINS` and `FRONTEND_URL` to that Vercel
URL (comma-separate if you want more than one origin, e.g. to keep
`http://localhost:3333` working):

```
https://your-app.vercel.app,http://localhost:3333
```

CORS origins must be exact — scheme included, no trailing slash. Render redeploys
on save.

---

## Step 5 — Allow Google Sign-In from the new domain

Testers can't sign in until Google trusts the new origin.

1. [console.cloud.google.com](https://console.cloud.google.com) → **APIs &
   Services → Credentials** → your OAuth 2.0 Client ID.
2. Under **Authorized JavaScript origins**, add `https://your-app.vercel.app`
   (keep `http://localhost:3333` for local work).
3. Save. Changes can take a few minutes to propagate.

No redirect URI is needed — the app verifies Google's ID token server-side, so
only the JavaScript origin matters. And with sign-in covered by Google, you can
skip SendGrid entirely: that's why no email provider appears in this runbook.

---

## Step 6 — Stop the free API from sleeping

Render spins a free web service down after **15 minutes without traffic**; the
next request then takes ~50 seconds. Ten testers clicking a cold link will
reasonably decide your app is broken.

The fix is free. Render grants **750 instance hours per workspace per month**,
and a month is only ~730 hours — so **one** free service can stay up 24/7 inside
the allowance. Point a free uptime pinger at the health endpoint:

1. Sign up at [cron-job.org](https://cron-job.org) or
   [UptimeRobot](https://uptimerobot.com) (both free).
2. Create a monitor: URL `https://decoding-jobs-api.onrender.com/health`,
   every **10 minutes**.

Two caveats worth knowing:

- The allowance is per **workspace**, so don't run a second always-on free
  service, or you'll burn it.
- Check Render's dashboard near the end of the month. If usage approaches the
  cap, the service simply sleeps again — it doesn't start billing you.

---

## Step 7 — Point the feedback page at the app

Once the Vercel URL is live, open [feedback/index.html](feedback/index.html) and
set the app URL in the `CONFIG` block so testers get an "Open the app →" button:

```js
appUrl: "https://your-app.vercel.app",
```

Also finish the two settings from [feedback/README.md](feedback/README.md):
`endpoint` (your Formspree URL) and `fallbackEmail` (a real inbox — it's still a
placeholder). Then redeploy the feedback page.

---

## Step 8 — Smoke test before you send the links

Do this on your phone's mobile data, not your dev machine — it's the only way to
catch localhost assumptions.

- [ ] `https://…onrender.com/health` → `{"status":"ok"}`
- [ ] `https://…onrender.com/health/db` → healthy, proving the API reached Neon
- [ ] The app loads and the **map shows pins** (if it's empty, step 2 didn't land)
- [ ] City chips show counts, and clicking a city flies to its companies
- [ ] Search returns results and the company panel opens
- [ ] **Google sign-in completes** and the account menu shows your name
- [ ] The tracker and assistant pages load without console errors
- [ ] The feedback page loads and a real test submission arrives where you expect

---

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| Browser console: CORS policy error | `CORS_ORIGINS` doesn't match the Vercel origin exactly. Scheme included, no trailing slash. Comma-separate multiple origins. |
| Map renders but has no pins | The restore didn't land. Re-run step 2 and confirm the row counts it prints. |
| `asyncpg ... prepared statement already exists` | You're using Neon's pooler endpoint. Switch to the direct hostname (no `-pooler`). |
| `FATAL: password authentication failed` | The password has characters needing URL-encoding (`@`, `:`, `/`, `?`, `#`). Re-copy the connection string from Neon. |
| First request takes ~50s, then it's fast | Free tier cold start. Step 6. |
| Sign-in fails with a Google origin error | The Vercel origin isn't in **Authorized JavaScript origins** yet (step 5), or it hasn't propagated. |
| Env var change had no effect | `NEXT_PUBLIC_*` are build-time on Vercel — redeploy. Render needs a redeploy too. |
| API logs `PRODUCTION without SENDGRID_API_KEY` | Expected and harmless here — it only means email magic links (and job-alert emails) are off. Google sign-in is unaffected. |
| `docs` returns 404 | Intentional: `/docs` and `/redoc` are disabled when `ENVIRONMENT=production`. |
| Build fails with `react/no-unescaped-entities` then `npm run build exited with 1` | You're building `main`, not `feat/updated-decode`. Set Branch Tracking as in step 4, then push to that branch. `main` is 25 commits behind and cannot build. |
| Vercel shows "Install the GitHub application…" with no repos | Vercel's GitHub App isn't installed on the repo's account yet. Click Install → Only select repositories → pick this repo. |

---

## When you'd actually have to pay

Nothing above. You'd only open your wallet if:

- **You want a domain** — ~$10–12/year, optional.
- **Cold starts become unacceptable and you don't want the pinger** — Render
  Starter, ~$7/month.
- **The project becomes commercial** — Vercel's Hobby plan is licensed for
  non-commercial personal use only. A private beta is fine; Vercel Pro is $20/mo.
- **You outgrow 0.5 GB of database** — you're at 32 MB, so not soon.

All of it is cancellable at any time. None of it requires a card up front.
