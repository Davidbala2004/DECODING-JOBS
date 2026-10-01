# DECODING JOBS — Complete Audit & Review

**Scope:** full-stack product audit — engineering, architecture, security, data, UI/UX, user experience, and business/commercial viability.
**Artifact reviewed:** the `feat/real-data-ingestion-and-ui-polish` branch of the `DECODING-JOBS` repository.
**Date:** 1 October 2026
**Audience:** the founder/lead developer, to prioritise work that moves the product to the next level.

> This supersedes the earlier `DECODING-JOBS-Product-Verdict.html`. That verdict was written before the authentication, recruiter, and ingestion work landed — it says "there is no authentication at all", which is no longer true. Everything below reflects the current code.

---

## 0. The one-paragraph answer

This is a genuinely well-built, unusually thoughtful MVP. The engineering is above the bar for a solo/student project: real session-based auth, PostGIS spatial search, LLM tool-calling grounded in the app's own data, graceful degradation everywhere a third-party key is missing, and comments that explain *why* a decision was made. The UI is cohesive, animated, and clearly crafted with care. **The blockers to the "next level" are no longer engineering quality — they are (1) three concrete security/trust holes in the founder + email flows, (2) a data-licensing problem that makes the current inventory legally unmonetisable, (3) a missing compliance/legal layer, and (4) zero growth instrumentation or SEO surface.** Fix those four and this becomes a fundable, sellable product. Everything else is polish.

### Health scorecard

| Dimension | Score | Verdict |
|---|---|---|
| Architecture & code organisation | 8.5 / 10 | Clean layering, typed end-to-end, excellent rationale comments |
| Backend correctness | 7 / 10 | Solid, a few N+1s and an unauthenticated write path |
| Security & privacy | **4.5 / 10** | Real session model, but 3 exploitable holes + no rate limiting + dev-link footgun |
| Frontend craft & UX polish | 8 / 10 | Beautiful, consistent, delightful micro-interactions |
| Accessibility | **3.5 / 10** | Tiny text, low contrast, non-keyboard map/DnD, few ARIA labels |
| Data integrity & licensing | **4 / 10** | Adzuna free tier is non-commercial; DB has no migration framework |
| Testing & CI | **3 / 10** | ~15 live-server tests, no unit tests, no frontend tests, no CI; verify script is stale |
| Documentation | 9 / 10 | README is exceptional — clearer than most funded startups' |
| Business readiness | **3.5 / 10** | No payments, no ToS/privacy, no analytics, weak SEO, free unlocks |

---

## 1. What the product actually is

A **map-first job-search command center for Indian tech talent**. Instead of a list of postings, you browse companies as pins on a city map, filter by sector/stage/area/department, click a pin to see the company's roles, culture sentiment, and apply. Around that core sit four satellites:

- **AI Job Search Assistant** (`/assistant`) — a chat assistant whose tools query the real DB (never invents a company), plus a resume ATS scorer/rewriter that lives inside the chat.
- **Application Tracker** (`/tracker`) — a Saved → Applied → Interviewing → Offered Kanban board, with email-forwarding to auto-advance rounds.
- **Preferences** (`/profile`) — target roles, cities, work mode, notice period, credibility links; powers a "For You" map filter.
- **Recruiter candidate search** (`/recruiters`) — the reverse marketplace: verified recruiters search and unlock job-seeker profiles.

**Stack:** Next.js 15 / React 19 / TypeScript / Tailwind 4 / MapLibre GL + Supercluster / Zustand / TanStack Query on the front; FastAPI / SQLAlchemy 2 async / Pydantic v2 / PostgreSQL 16 + PostGIS on the back; Docker Compose; Groq (free tier) for LLM; SendGrid for email.

**Architecture map (verified against the code):**

```
apps/web (Next.js)
  app/            pages: / (map), /assistant, /tracker, /profile, /recruiters, /register, /auth/verify
  components/      MapWorkspace (1739 ln), CompanySidePanel (699), ChatAssistant (604),
                   KanbanBoard (505), RegisterCompanyForm (425), ProfileWorkspace (336) …
  lib/api.ts       typed client, attach bearer token, clear session on 401
services/core-api (FastAPI)
  api/             auth, users, companies, jobs, applications, resumes, chat, recruiters, alerts, emails, logos
  core/            config (Pydantic settings), security (require_session/optional_session/require_ingestion_key)
  services/        auth, groq_client, resume_analyzer/parser, email_parser, company_verification,
                   link_verifier, sendgrid_client, role_classifier, geo
  models/domain.py 15 ORM models;  schemas.py  request/response contracts
infra/init-db/     27 numbered SQL files (schema + seed) — run once on first container start
scripts/           fetch-real-jobs.mjs (Adzuna + Greenhouse/Lever), geocode.mjs, verify-stack.sh
```

The layering is honest: routers stay thin, domain logic lives in `services/`, identity is centralised in one dependency, and the API client is the single place the browser talks to the backend.

---

## 2. Engineering audit — what's strong

1. **Identity was rebuilt correctly.** The old "trust the email string the client sends" model is gone. `require_session`/`optional_session` (`app/core/security.py`) resolve a real `User` from a SHA-256-hashed 30-day bearer token. Magic-links are single-use, 15-minute, and only the hash is stored (`app/services/auth.py`). Both sign-in paths funnel through one `create_session()`. This is genuinely good.
2. **Ownership checks are present and tested** where they matter most — application status/round, resume analysis, chat conversations, saved searches all verify the row belongs to the caller (`app/api/applications.py`, `app/api/resumes.py`, `app/api/chat.py`).
3. **Grounded AI.** The chat tool-calling design (`app/api/chat.py`) forces every company/job to come from a DB query, maps results to cards, and the system prompt explicitly separates real culture data from generic interview advice. This is the right way to build a trustworthy LLM feature.
4. **Graceful degradation discipline.** Missing `GROQ_API_KEY`, `SENDGRID_*`, `GOOGLE_CLIENT_ID`, `INGESTION_API_KEY` each degrade to a specific, non-erroring behaviour — documented in code and README. Rare and mature.
5. **N+1s were already hunted down** in the hot path — `companies/search` batches job-count stats into one grouped query instead of a loop per company.
6. **Config hygiene:** committed `.env` holds only dev defaults; real secrets live in gitignored `.env.local`; verified with `git check-ignore`. Ingestion endpoints are closed by default (503 when unset) rather than silently open.
7. **README** is the single best asset in the repo. Its "why" explanations (pin-stacking fix, mojibake repair, nullable experience field) are exactly what a future maintainer needs.

---

## 3. Engineering audit — findings, ranked

Severity: 🔴 critical · 🟠 high · 🟡 medium · 🔵 low.

### 3.1 Security & trust

**🔴 F1 — Anyone can post jobs under any listed company (unauthenticated impersonation).**
`app/api/jobs.py:293` `register_job` takes `founder_email` and `company_id` **straight from the request body** and only checks that the email's domain string matches the company's website domain:

```python
error = verify_founder_domain(payload.founder_email, company.website_url)  # jobs.py:304
```

There is **no session requirement and no mailbox proof**. A request with `founder_email: "jobs@razorpay.com"`, `company_id: <Razorpay's id>` passes, because Razorpay's `website_url` is `razorpay.com`. No one needs to control `razorpay.com` — they only have to *type* an address at that domain. The same hole exists for company registration (`app/api/companies.py:389`, `verify_founder_domain` at :399): anyone can list a not-yet-listed company by typing a matching email + website pair, with no verification that the domain or mailbox is theirs.
Notably, the **recruiter flow already fixed exactly this** by moving to session-based verification (`app/api/recruiters.py` — "typing hr@razorpay.com with no proof at all was enough"). The founder flow was never updated to match.
**Fix:** require a session (`Depends(require_session)`) on both endpoints and derive the email from `current_user.email` (which is verified) instead of the body. Then the domain match actually proves domain ownership, as intended. Optionally add an emailed one-time code for true mailbox proof.

**🔴 F2 — PII leak: `/api/v1/emails/unmatched` trusts a query-string email.**
`app/api/emails.py:198`:

```python
async def list_unmatched(db, email: str = Query(..., min_length=3)):
    user = await get_or_create_user(db, email)   # emails.py:202
```

No session. Any caller can pass any address and read that user's unmatched forwarded emails — **subjects, sender addresses, and raw email text** (real interview invites). It is a leftover of the pre-session identity model. It also *creates* a user row on a GET.
**Fix:** `Depends(require_session)`, drop the `email` query param, query by `current_user.id`.

**🟠 F3 — `dev_magic_link` bypasses auth entirely when SendGrid is unset.**
`app/api/auth.py` `request_link` returns the raw sign-in link to the *client* whenever `SENDGRID_API_KEY` is unset, and `EmailGate.tsx` renders it in an amber box. Deployed publicly without a send key, **any visitor can request a link for any email address and click it to obtain a valid session as that user.** The comment calls it a "local-dev convenience", but nothing enforces that it's local.
**Fix:** only emit `dev_magic_link` when `settings.ENVIRONMENT != "production"` (and refuse to start in production with no `SENDGRID_API_KEY`). Consider also refusing production start without `GOOGLE_CLIENT_ID`, so at least one real sign-in path exists.

**🟠 F4 — No rate limiting anywhere.**
`/auth/request-link` will happily send mail to arbitrary addresses (email-bombing + SendGrid cost + address enumeration); `/chat` is callable anonymously (LLM cost abuse against your Groq quota); `/applications/submit` allows anonymous unbounded writes. There is no throttle, no CAPTCHA, no per-IP/per-identity cap in any router or in `main.py`.
**Fix:** add `slowapi` (or an nginx/Cloudflare layer) with per-IP limits on the public endpoints; cap magic-link requests per email per hour.

**🟡 F5 — Inbound email webhook is open until creds are set.**
`_verify_webhook_auth` returns early (allowing the request) when `SENDGRID_INBOUND_USERNAME/PASSWORD` are unset. Documented and testable, but once `INBOUND_EMAIL_DOMAIN` points a real domain here, a forgotten credential means anyone can forge interview emails. Make the "configured" state the only state that accepts traffic, and log a loud warning if `INBOUND_EMAIL_DOMAIN` is set without creds.

**🟡 F6 — Sessions never expire server-side on sign-out, and `last_used_at` writes on every request.**
Sign-out only clears the client store; the `sessions` row lives up to 30 days with no revocation, no rotation, and no "sign out everywhere". Also `get_user_from_session` commits a write on *every* authenticated request — a needless DB write per call at scale. Add a revocation path, lazy `last_used_at` updates, and shorter TTLs with refresh.

**🔵 F7 — Minor:** Google verification doesn't check `iss`; no security headers/CSP on the Next app; `next.config.ts` sets `reactStrictMode: false` (hides double-invoke bugs); anonymous applications create orphan `user_id = NULL` rows that can never be claimed.

### 3.2 Correctness & data

**🟡 F8 — Alert matching silently disagrees with saved-search filters.** `app/api/alerts.py` `_matches_filters` ignores `company_type` and `hiring_only`, and only matches `q` against job *title* (not description). A user who saves a map filter with a company-type or a description keyword can receive emails for jobs that don't match what they saved. Align the matcher with `MapWorkspace`'s `currentFilters` shape.

**🟡 F9 — Unbounded bounding-box queries.** `GET /companies/search` (`app/api/companies.py`) has no `LIMIT`. A world-spanning bbox returns every row, and every pin becomes a React DOM node client-side. Add a server-side cap (e.g. 500) with a "zoom in" response, independent of the client's Supercluster.

**🟡 F10 — No database migration framework.** Schema changes live in 27 numbered SQL files that **only run on first container start**. Changing a column later means a manual `ALTER` or `docker compose down -v` (data loss). This is the single biggest long-term maintainability risk in the repo.
**Fix:** adopt Alembic; keep the init scripts as the historical baseline.

**🔵 F11 — N+1 counts remain in two paths:** `jobs/search` issues a count query per distinct company, and `chat._tool_list_companies` issues one per company — both easy to batch (the pattern already exists in `companies/search`). **F12 — Recruiter search loads all candidates into Python** and filters/scores in-memory (`recruiters.py`); fine for hundreds, not for tens of thousands. **F13 — No pagination** on `/jobs` (unbounded list). **F14 — Missing facet indexes** on `jobs.department`, `jobs.created_at`, `companies.sector/city/stage/area`, which the filter facets group-by on every load.

**🔵 F15 — Broken fallback regex (twice).** `MapWorkspace.tsx:86` and `CompanySidePanel.tsx:356` do `website_url.split(/[/s?#]/)` — the character class contains a literal `s`, not `\s`, so it splits on the letter "s" ("https://example.com" → "http"). Only hit when `new URL()` throws, but it's wrong. Use `/[\/\s?#]/`.

### 3.3 Testing, CI & observability

**🟠 F16 — `scripts/verify-frontend.mjs` is stale and will fail.** It waits for `text=My Vault`, `text=Select a company on the map`, and `button[aria-label^="View "]` — none exist in the current UI (the nav is Assistant/App Tracker/Preferences/For Companies; the empty state says "Select a company"; map markers are `<div>`s with no `aria-label`). `npm run verify` and step 7 of `scripts/verify-stack.sh` therefore fail, which is worse than having no check — it erodes trust in the suite.

**🟠 F17 — Thin test surface.** Four files, ~15 tests, all requiring a **live dev server and the real Postgres** (`tests/conftest.py` hardcodes `postgis:5432`). No unit tests for `role_classifier`, `company_verification`, `email_parser`, `resume_analyzer`, `geo`, or `security`. No frontend tests. No `.github/workflows` — nothing runs automatically on a push.

**🟡 F18 — No observability.** No error tracker (Sentry), no structured request logging beyond uvicorn + one catch-all, no metrics, no tracing. You cannot see a production error or a slow endpoint today.

### 3.4 Frontend / UI correctness

**🟡 F19 — Invalid nested `<button>` in the chat composer.** `ChatAssistant.tsx:356–368` nests the resume-clear `<button>` inside the resume-pill `<button>` — invalid HTML, produces React hydration warnings, and confuses screen readers. Restructure to sibling buttons.

**🟠 F20 — README contradicts the code on anonymous chat.** The README states chat "still works signed-out (anonymous, stateless)", and the backend supports it via `optional_session` — but `AssistantWorkspace.tsx` returns an `EmailGate` whenever there's no email, so anonymous chat is impossible in the UI. Decide which behaviour you want and make both sides agree.

**🔵 F21 — File-type check too strict.** `ChatAssistant` validates `file.type` against exactly two MIME strings; some OS/browser combos report an empty type for `.docx`, surfacing "Only PDF and DOCX are supported" for a valid file. Fall back to extension.

**🔵 F22 — TopNav polls the board every 15 s globally** (even on the map) just to render a badge; scope the poll to `/tracker`.

---

## 4. UI / UX design audit

### What's excellent
- **Cohesive visual system:** one green family end-to-end, consistent radii, shadows, and pill language. The map pins (gradient ring, hiring pulse, `NEW` flash, dimmed non-hiring, size-by-zoom) are a genuinely nice piece of product design — "worth a click?" is legible *before* the click.
- **Progressive disclosure** is applied where it counts: the founder form hides 10 optional fields behind one toggle; the apply panel reveals a role picker only when there's a choice.
- **Micro-interactions** (bounce-in pins, typing dots, gauge spin-in, card fade-in, kanban drop scaling) make it feel alive without being noisy.
- **State handling:** loading skeletons, empty states, and retry affordances exist on the map, tracker, chat, and recruiter search. Toasts via `sonner` are consistent.
- **Responsive intent:** the map stays full-bleed; the company panel is a floating desktop card and a mobile bottom-sheet; the assistant sidebar becomes a drawer; filters become a bottom sheet.

### What needs work

**A. Discoverability of the map's own semantics (🟠).** The pin language — size, glow, `NEW` flash, dimmed pins, city-cluster teardrops vs. street-level number clusters — is clever but **has no legend and no onboarding**. A first-time student cannot infer that a small dim pin means "not hiring". Add a one-line legend or a dismissible first-run hint.

**B. Accessibility (🔴 for a public/institutional product).**
- **Contrast:** body microcopy leans on `text-gray-400`/`text-gray-300` on white (≈2.5:1 / ≈1.7:1) — both fail WCAG AA (4.5:1 for normal text). This appears in hints, counts, timestamps, and empty states throughout.
- **Type size:** a large share of the UI is 10–12.5 px. Legible on a desktop, punishing on a phone in sunlight — exactly the student use case.
- **Keyboard:** map pins are non-focusable `<div onClick>`s, so a keyboard user cannot select a company at all. The Kanban uses `PointerSensor` only — no `KeyboardSensor`, so drag-and-drop is pointer-exclusive (dnd-kit supports keyboard; it just isn't wired).
- **Icon-only buttons** (zoom, compass, search-clear, close) mostly rely on `title` rather than `aria-label`; `role`/`aria-live` are largely absent.
**Fix:** a contrast pass on gray text, a minimum 12 px floor (ideally 13 px for body), `aria-label`s + a focusable pin wrapper, and `KeyboardSensor` on the board.

**C. Design-token drift (🟡).** `globals.css` defines a clean token set, but components hardcode hex (`#16a34a`, grays, gradients) and each component ships its own `<style jsx global>` keyframes. This already causes near-duplicate animations (`fadeSlideUp` redefined in several files). Consolidate into the theme + one animation sheet.

**D. Toolbar density (🔵).** The map toolbar stacks search, city, Map/Grid, Hiring, Filters, For You, Saved, and status. It `flex-wrap`s, but on a 360 px phone it becomes several rows of pills competing with the map. Consider collapsing city + view + hiring into one segmented control.

**E. Two searches, unclear division of labour (🔵).** The map search finds *companies by role text*; the Assistant searches conversationally. Users won't immediately know when to use which. A cross-link ("Ask the Assistant" next to the map search) would close the loop.

---

## 5. User-perspective audit

Three journeys, as they actually behave in the code today.

### Journey 1 — The job seeker / student
`/` → city pin → company pin → side panel → role → **APPLY** (external link) + **SUBMIT** (tracks it) → `/tracker`.

- **Strength:** zero-friction entry — browse without an account, and "For You" personalises once preferences exist. Fresher handling (`0` → "Fresher") is a nice touch.
- **Friction 1 — sign-in wall before value.** Saving a job, tracking, resumes, and the Assistant all require a magic-link round-trip. The tracker's Kanban is the retention hook, so this wall sits precisely where habit should form. Consider letting anonymous users build a local board that *migrates* on sign-in.
- **Friction 2 — the tracker's data is unreliable by construction.** Clicking **SUBMIT** creates an `applied` application whether or not the user completes the external application. The "Did you apply?" nudge is a band-aid on exactly this. Until apply-completion is verified, any "apply → interview rate" analytics built on this is fiction.
- **Friction 3 — the Assistant gates anonymous use** (F20), so the "try before you sign in" promise in the README isn't real.

### Journey 2 — The founder
`/register` → work email + name + website + city → instant verification → post first role → live.

- **Strength:** the best flow in the product. Three required fields, progressive disclosure, and immediate publication with no admin queue — a real answer to the cold-start data problem.
- **Blocker:** it is *not actually verifying ownership* (F1) — the security model is a domain-string comparison, so the "verified" badge on the map is not trustworthy. For a product whose pitch is "trusted, first-party companies", this undercuts the core claim.

### Journey 3 — The recruiter
`/recruiters` → sign in → domain match → filter candidates → unlock free → mailto.

- **Strength:** correct session-based verification, masked results, a simple in-Python relevance score (no LLM cost per search), and a real consent toggle enforced server-side.
- **Gap:** no outreach, no shortlist, no ATS export, no contact workflow beyond `mailto:`. Unlocks are free, so there's no reason to return and no revenue.

---

## 6. Business-perspective audit

### 6.1 The market is real but crowded
India tech/student hiring is a large, painful, growing market. The incumbents — LinkedIn, Naukri, Internshala, Instahyre, Wellfound, Cutshort — win on **supply and SEO**, not UX. This product's UX genuinely beats them for *discovery*. But UX is a feature, not a moat.

### 6.2 The three strategic problems

**P1 — The inventory is legally unmonetisable as it stands (🔴).** The README itself flags that Adzuna's free/Developer tier is for evaluation and non-commercial use. Adzuna is the majority of the data. **You cannot charge money for a product predominantly built on it.** Greenhouse/Lever public boards are commercially safe; founder self-registration is safest of all.
**Move:** make company-direct (founder + ATS boards) the **primary** inventory, demote Adzuna to internal demo data, and get commercial terms before any paid launch.

**P2 — The moat is supply-side, and it isn't built yet.** Map-first search is copyable in a sprint. What isn't: a verified, first-party base of companies and recruiters. That's why F1 (fake verification) matters commercially — it poisons the one asset that could be defensible.

**P3 — There is no distribution plan, and the current architecture fights SEO (🟠).** The product is a single-page map. There are **no server-rendered, indexable `/jobs/[id]` or `/companies/[slug]` pages**, so you cannot rank for "backend engineer jobs Bengaluru" — which is how every competitor acquires users. This is the highest-leverage growth gap in the whole product.

### 6.3 Monetisation paths (ranked by fit)

1. **Campus / placement-cell B2B (strongest wedge).** You already target students; colleges pay for placement tooling and outcome dashboards. This aligns with the existing "tracker + resume coach" and needs no consumer willingness-to-pay.
2. **Recruiter seats & credits.** `candidate_unlocks` already anticipates a credits system. Charge for unlocks/seats, add outreach + ATS export. Free unlocks today leave the obvious revenue on the table.
3. **Founder posting plans.** Free listing, paid Featured pin / promoted placement / verified-badge tiers. Low friction given the flow is already instant.
4. **Job-seeker premium.** More AI credits, unlimited tailored resumes, priority alerts. Weak alone (students don't pay) but a good upsell on top of campus deals.
5. **Bring-your-own-key.** Let power users supply their own Groq key so LLM cost isn't yours.

### 6.4 Unit economics
Every chat turn and every resume analysis is an LLM call on a **free** Groq tier that will not survive real volume. Every alert and magic link is a SendGrid send. There is no caching of chat replies, no per-user quota, and no rate limiting (F4) — cost is currently unbounded and unattributed. Model per-active-user LLM cost before pricing anything; add quotas and a paid tier or BYO-key.

### 6.5 Compliance — a hard blocker for launch (🔴)
The product stores **PII, resumes, email content, and forwarded interview emails**. There is **no Terms of Service, no Privacy Policy, no consent capture beyond the recruiter-visibility toggle, no account-deletion path, and no data-export path.** Under India's DPDP Act 2023 (and GDPR if any EU user appears) you need: purpose-limited consent, a deletion right, a retention policy, and a stated lawful basis. This is a legal workstream, not a code tweak — but it must precede any real user acquisition.

### 6.6 Metrics you cannot currently see
None of the following are instrumented (no analytics at all): signup→first-apply conversion, apply→interview rate, recruiter unlock→contact rate, saved-search alert CTR, W1/W4 retention, job freshness, time-to-first-result, map→panel click-through. You are flying blind on every decision that matters. Add an analytics layer (PostHog is a good fit) before the next growth push.

---

## 7. Prioritised roadmap

### Now — Trust, security, and legal (≈1–2 weeks)
1. **F1** Require a session on `POST /jobs/register` and `POST /companies/register`; derive the verifying email from `current_user.email`. *(Highest-impact single fix — it makes "verified" mean something.)*
2. **F2** Put `/emails/unmatched` behind `require_session`.
3. **F3** Emit `dev_magic_link` only in non-production; refuse to boot in production without a real send key.
4. **F4** Add rate limiting to `request-link`, `chat`, `applications/submit`.
5. **F19 / F20 / F21 / F22** Frontend correctness batch: nested button, assistant gating vs. README, docx MIME fallback, scoped board polling.
6. Publish **ToS + Privacy Policy**; add account deletion + data export endpoints.
7. Replace or delete the **stale verify script (F16)**; add a CI workflow running `pytest` (Dockerised), `tsc --noEmit`, and `next build`.

### Next — Depth, scale, and growth (≈1–2 months)
8. **SEO surface:** server-rendered `/jobs/[id]` and `/companies/[slug]` with metadata + `JobPosting` JSON-LD. *(Biggest growth lever.)*
9. **Payments:** recruiter credits (wire the existing `candidate_unlocks`), founder featured listing; Razorpay for India.
10. **Alembic migrations (F10)**, facet indexes (F14), bbox cap (F9), batch the N+1s (F11), paginate `/jobs` (F13), move recruiter search into SQL (F12).
11. **Observability:** Sentry + structured logs + basic metrics (F18); PostHog for product analytics.
12. **A11y + polish pass:** contrast, minimum type size, keyboard-navigable pins and Kanban, `aria-label`s, a map legend, and token/animation consolidation.
13. **Fix the tracker's integrity problem:** only mark "applied" once completion is confirmed (or make the nudge a first-class confirm step) so downstream analytics are trustworthy.

### Later — Moat and scale
14. Institution/placement-cell product (the strongest monetisation wedge).
15. Replace ILIKE search with embedding-based resume↔job matching and a real "match score".
16. Multi-tenant recruiter orgs (roles, seats, ATS export, outreach sequences).
17. Harden email auto-tracking (SPF/DKIM guidance, sender verification) and add PWA/offline.

---

## 8. Quick-win checklist

- [ ] `POST /jobs/register` + `POST /companies/register` → `require_session`, email from session (F1)
- [ ] `/emails/unmatched` → `require_session` (F2)
- [ ] `dev_magic_link` gated to non-production (F3)
- [ ] Rate limits on request-link / chat / submit (F4)
- [ ] Un-nest the chat composer button (F19)
- [ ] Decide anonymous chat; align UI + README (F20)
- [ ] Fix `split(/[/s?#]/)` → `/[\/\s?#]/` in two files (F15)
- [ ] Align `alerts._matches_filters` with saved-search filters (F8)
- [ ] Cap `/companies/search` results (F9)
- [ ] Delete/repair the stale frontend verify script; add CI (F16/F17)
- [ ] ToS + Privacy + account deletion + export (6.5)
- [ ] Add `/jobs/[id]` SSR pages with JSON-LD (6.2 P3)

---

## 9. Closing assessment

The hard part of a product like this is *building something real*, and that part is done — and done well. The remaining work is not "make the code better" in an abstract sense; it's four focused swings: **make the trust claims true (security), make the data legal to sell (licensing), make the product lawfully collectable (compliance), and make it findable and measurable (SEO + analytics).** Do those and the strong engineering underneath turns into a business instead of a portfolio piece. The single highest-return fix on the board is F1 — one authentication change that makes "verified company" actually mean verified.

---

## 10. Remediation status (implemented)

Applied and verified (`tsc --noEmit`, `eslint`, and `next build` all pass):

| Finding | Fix |
|---|---|
| **F1** unauthenticated job/company registration | Both endpoints now require a session and verify the **session** email; `founder_email` removed from the request bodies; frontend gates `/register` behind sign-in |
| **F2** `/emails/unmatched` PII leak | Now `require_session`, keyed off `current_user.id`; query-string email removed |
| **F3** `dev_magic_link` bypass | Returned only when `ENVIRONMENT != "production"`; production also logs a warning on missing send/Google/ingestion keys |
| **F4** no rate limiting | New in-process sliding-window limiter (`app/core/ratelimit.py`) applied to request-link (per-IP **and** per-email), chat, apply, and both register endpoints |
| **F8** alert filter mismatch | `_matches_filters` now honours `company_type`, `area`, and matches `q` against title **or** description |
| **F9** unbounded bbox query | `/companies/search` capped at 500 rows |
| **F11** N+1 counts | `jobs/search` and chat's `list_companies` now use one grouped count |
| **F12** in-Python recruiter search | Scalar filters pushed into SQL; only role-keyword matching stays in Python |
| **F13** no job pagination | `/jobs` gained `limit`/`offset` |
| **F14** missing indexes | `28-add-performance-indexes.sql` |
| **F15** broken fallback regex | Fixed in both files |
| **F16** stale verify script | Rewritten against the current UI (grid-card selection → detail panel) |
| **F17** thin tests / no CI | `tests/test_units.py` (60+ pure-function cases) + `.github/workflows/ci.yml` (backend stack + frontend typecheck/lint/build) |
| **F18** no observability | Per-request structured logging middleware |
| **F19** nested button | Restructured into sibling buttons |
| **F20** README/code conflict on anonymous chat | UI now allows anonymous chat (history + resume prompt sign-in) |
| **F21** strict file-type check | Backend infers type from extension when the browser sends none; frontend does the same |
| **F22** global board polling | Polls only on `/tracker` |
| **6.5** no compliance layer | `/privacy` + `/terms` pages; `GET /users/me/export` and `DELETE /users/me`; a "Your data" section on `/profile` |
| ESLint config | Now ignores `.next/**`/`node_modules/**` — lint went from 276 phantom errors to 0 |

**Deliberately deferred** (larger, needs a decision or an external account): Alembic migrations (F10), Sentry/APM (F18's heavier half), embedding-based matching, payments, SEO job/company pages, and the full accessibility pass. These remain the "Next" and "Later" roadmap items.

---

## 11. Real human-run findings (live walkthrough)

Run against the live local stack (`http://localhost:3333`, API `:8000`) signed in as a fresh magic-link user, plus a guest application — i.e. the exact path a curious stranger takes. Numbered `G*` to keep them distinct from the pre-implementation findings above.

### What held up under real use

| Journey | Result |
|---|---|
| Guest applies to a role | `POST /applications/submit` → **201**, button flips to **Applied ✓** |
| Magic-link sign-in | Works end-to-end; the dev link surfaces in a warning callout when SendGrid is unset (F3 fix confirmed) |
| Register a company | Session-verified — "VERIFYING AS you@…" is read-only (F1 fix confirmed); step 2 (first role) reachable |
| `/tracker` when signed out | Clean sign-in gate, no leaked board data |
| AI Assistant | Answers from real DB data, returns company cards with job counts; **no email gate** (F20 fix confirmed) |
| `/profile` | Full preference surface + "Your data" export/delete section renders |
| `/privacy`, `/terms` | Both render with real, specific content |
| `/recruiters` | Correctly refuses `example.com` and links to `/register` |
| All 9 routes | HTTP 200, no console errors |

### New gaps

**G1 — No way to sign out. (P0, ships as a blocker).** There is no sign-out control in the UI and no `/auth/logout` endpoint behind it (`grep` finds only a comment). Consequences beyond the obvious: `/register` instructs the user to *"Sign in with a different address if this isn't your work email"* — advice that is **impossible to act on**; and once a user has ever signed in on a shared machine they can no longer reach the guest path at all. Delete-account exists but sign-out does not, which is backwards. Fix: `POST /auth/logout` that clears the session cookie + device token, plus an account menu in `TopNav` showing the signed-in email.

**G2 — Two dropdowns render in the same place, with two different counts. (P1).** Measured in the DOM: the role-suggestion panel and the job-results panel both sit at `top:128 left:16 width:384` and paint on top of each other. Worse, their numbers disagree — the results header reads **"17 COMPANIES HIRING"** (`jobSearchResults.length`, `MapWorkspace.tsx:1252`) while the toolbar chip next to it reads **"12 companies | 12 hiring"** (`totalCount`, `MapWorkspace.tsx:1470`). Confirmed against the API: `/jobs/search?q=Frontend Engineer&city=Bengaluru` really returns **17** unique companies. The chip counts only pins inside the current viewport bbox; the dropdown counts the whole city. Same query, two populations, no labels. Fix: pick one anchor (suggestions above, results below), and label the chip "in current view".

**G3 — No map legend, so pin semantics are guesswork. (P1).** Nothing explains avatar pins vs. small dots, the hiring glow, the pulsing `NEW` flash (`recently_hiring`), or dimmed non-hiring pins — the "Not hiring right now" text only exists in a hover tooltip (`MapWorkspace.tsx:364`). A first-time user cannot answer "which of these is actually hiring?". Fix: a collapsible legend + a one-time first-visit hint.

**G4 — Map controls are unnamed to assistive tech. (P1).** The three icon buttons (zoom in / zoom out / reset view, `MapWorkspace.tsx:1490-1516`) carry no `aria-label` or `title`; the accessibility tree exposes three bare `button` nodes. Every city pin is likewise just `"Map marker"`. Fix: label the controls and give markers a descriptive name.

**G5 — The 500-company cap is invisible. (P1 — regression from the F9 fix).** The toolbar reads a flat **"500 companies | 370 hiring"** with no sign it has been truncated and no way to see the rest; Bengaluru alone holds 890. Honest per-view cost became a silent ceiling. Fix: when the cap is hit, render "500+ companies — zoom in for more".

**G6 — Guest applications are silently orphaned. (P2).** As a guest I applied successfully and was told nothing about durability; the application is tied to no account. The success state should say "Sign in to save and track this application", and the in-flight role should survive the sign-in round-trip.

**G7 — Test data leaks into the product. (P2).** "Partner Engineering Test Company — Tester for AC activation" appears in the real Bengaluru results list. Seeding/ingestion needs a guard (a `Test Company`/`Tester` name filter or an `is_test` flag) so dev rows never reach a user-facing list.

**G8 — `via linkedin` badges contradict the sourcing story. (P2).** Razorpay and Zerodha pins are badged `via linkedin`, while `README.md` states there is no LinkedIn scraping. It is most likely a board/ATS label, but as rendered it reads as scraped LinkedIn data — a claim with real legal weight. Fix: rename the source label to the actual provider.

**G9 — `/tracker`'s sign-in gate is semantically a paragraph, and Google is offered twice. (P3).** The gate's heading is a `<p>`, so the page has no `<h1>`; and a real "Sign in with Google" button is stacked with an empty GIS `<iframe>` ("Sign in with Google Button"). Fix: promote the heading, drop the orphan iframe.

**G10 — The basemap rendered blank once (P3, needs a real-browser confirmation).** After a client-side navigation the MapLibre canvas showed pins on an empty white field with no CARTO tiles. It did not recur on reload and is plausibly an artifact of scripted navigation rather than a product bug, but it is worth one careful click-through before launch.

> Tooling note: `preview_screenshot` returned stale frames twice mid-session (it showed `/register` while the DOM was already on `/`). Every visual claim above was therefore re-verified against the live DOM or the API, not against a screenshot alone.

### Remediation status (implemented)

| Gap | Fix | Verified by |
|---|---|---|
| **G1** no sign-out | `POST /auth/logout` + `POST /auth/logout-all` (`revoke_session` / `revoke_all_sessions` in `services/auth.py`, new `require_session_token` guard); account menu in `TopNav` with a signed-out "Sign in" state; sign-out calls `clearIdentity()` **and** `queryClient.clear()` | 200 → logout `204` → **same token `401`**; localStorage cleared; nav flips to "Sign in" |
| **G2** overlapping dropdowns, conflicting counts | Suggestion and results panels are now mutually exclusive via `searchIsBeingEdited` (suggestions only while editing, results once the query commits); results dismiss on pick and via a close button; headers name their scope — "17 companies hiring **in Bengaluru**" vs "N companies **in view**" | Typing now yields exactly **one** floating panel (was two at identical coordinates) |
| **G3** no map legend | Collapsible legend in `MapWorkspace`, collapsed by default, explaining hiring glow, faded non-hiring pins, `NEW` flash, clusters and city pins | Legend renders all five entries |
| **G4** unnamed map controls | New `AccessibleMarker` wrapper overrides MapLibre's default `aria-label="Map marker"` via `getElement()`; the three icon buttons got `aria-label`/`title` | Marker names now read "Bengaluru: 890 companies, 637 hiring…"; buttons read "Zoom in", "Zoom out", "Centre the map on Bengaluru" |
| **G5** invisible 500-cap | Server fetches `MAX+1` and flags truncation with `X-Result-Capped` (exposed via CORS); chip renders "500 of 500+ companies" plus a "zoom in for more" button | World bbox → header present; tiny bbox → absent; chip copy confirmed |
| **G6** orphaned guest application | Post-apply state now tells guests the application belongs to no account and links to sign-in | Rendered in `CompanySidePanel` |
| **G7** test data in results | Narrow `PLACEHOLDER_COMPANY_NAMES` denylist applied to `/companies/search` and rejected at `/companies/seed` | "Partner Engineering Test Company" gone; **TestVagrant and Moolya Software Testing still present** |
| **G8** `via linkedin` badge | New `lib/jobSources.ts` with one source-label map shared by the map badge and the panel pill; `linkedin` renders as "Company site" (its `apply_url` is the employer's own careers page) | Both surfaces import the same map |
| **G9** gate had no heading | `EmailGate` title is now an `<h1>` | — |
| **G9** "Google offered twice" | **Not a bug** — the button/iframe pair is Google GSI's own markup, not ours. Withdrawn. | Inspected `EmailGate` source |
| **G10** blank basemap | Not reproduced deterministically; still open, needs one manual click-through | — |

One bug was introduced by the G5 fix and caught in review: the chip first rendered `{filteredCount}+`, but the cap applies to the **raw viewport** fetch while the count is post-filter — it showed "11+" for exactly 11 results. Now "N of 500+", which is true in both branches.
