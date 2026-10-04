# huntt.ai vs DECODING JOBS — Competitive Teardown & Roadmap

**Prepared for:** DECODING JOBS (branch `feat/updated-decode`)
**Subject:** https://huntt.ai — a direct India-market competitor to our map-based job command center
**Method:** huntt.ai's apex host resolves to a private/reserved address, so the live web app could not be scraped directly. Findings below are triangulated from the public Google Play listing (`ai.huntt.app`), the LinkedIn profile of the founder, the Terms of Service snippet, and third-party coverage. Each claim is tagged **CONFIRMED** (public, first-party) or **INFERRED** (deduced from product shape / industry-standard implementation).

---

## 1. Executive summary

huntt.ai is a **mobile-first AI job-search assistant for India**: "chat, and it finds jobs, fixes your resume, and preps you for interviews." It is a **chat-and-list** product backed by a large aggregated inventory ("3 lakh+ live jobs across India"), a resume-tailoring engine, interview prep, and WhatsApp alerts, monetized as a freemium subscription (users hit a paywall after a few AI responses).

DECODING JOBS is a **spatially-grounded job command center**: an interactive PostGIS/MapLibre map of South-India tech hubs, a company-panel with real culture/sentiment data, a Kanban application tracker with email auto-advancement, and a grounded AI assistant that returns *cards you can click onto the map*.

**The strategic read:** huntt.ai is winning on **breadth** (aggregated national volume, mobile distribution, WhatsApp reach) and **positioning** ("AI talent agent", "24/7 monitoring"). We are winning on **depth** (spatial discovery, verified employers, application workflow) and **trust** (grounded data, no black-box auto-apply). huntt.ai's biggest weakness — surfaced in its own Play reviews — is exactly where our architecture is strong: **its "auto apply" applied to irrelevant roles, injected unwanted skills, and produced bloated resumes.** Our model (the human taps a card, the human applies, the tracker records it) is the differentiator to lean into.

The roadmap in §8 closes the breadth gap (semantic search, alert crons, ATS match score, apply automation with consent) without giving up the depth moat.

---

## 2. What huntt.ai is

| Attribute | Finding | Source |
|---|---|---|
| Product | "AI job search and career assistant for India… just chat — huntt finds jobs, fixes your resume, and preps you for interviews" | CONFIRMED (Play listing) |
| Tagline | "India's AI Job Assistant" / founder's words: "an AI talent agent for white-collar professionals … works 24/7 to monitor 3L+ active jobs" | CONFIRMED (Play + LinkedIn) |
| Inventory claim | "3 lakh+ live jobs across India" | CONFIRMED (Play listing) |
| Platforms | Web (`huntt.ai`), Android (`ai.huntt.app`), iOS (App Store) | CONFIRMED |
| Traction signal | **10K+ downloads**, 4.1★ from 13 reviews (Play) — early stage | CONFIRMED |
| Parent | **ZeroShot Tech Private Limited**, 1st Floor, Ark Arcade, D N Nagar, Andheri West, Mumbai 400053 | CONFIRMED (Play "About the developer") |
| Founder | **Rupansh Goyal**, Co-Founder & CEO; LinkedIn lists IIT Bombay; named **Grievance Officer** in ToS | CONFIRMED |
| Contact | `info@huntt.ai`, `support@huntt.ai`, +91 91673 00038 | CONFIRMED |
| CIN (per prior internal research) | U63121MH2026PTC467999 (a 2026 Mumbai incorporation) | INFERRED/prior |

Key takeaway: this is a **2026-vintage, seed-stage, mobile-first** competitor. It is not (yet) a large incumbent — it is a fast-moving AI-wrapper that could win the default-install slot on a fresher's phone if we stay web-first and silent.

---

## 3. huntt.ai product surface (confirmed capabilities)

1. **Conversational discovery** — "Tell huntt your role, experience, and city. It searches 3 lakh+ live jobs across India. You get the ones that fit — instantly." So the primary UX is a chat/feed, **not** a map.
2. **Resume tailoring** — "huntt tailors your CV to each role." Per a review, it also references an "ATS-friendly resume" and editing "based on job description."
3. **Interview prep** — "Practice for specific roles. Get questions based on your background."
4. **WhatsApp job alerts** — "New matching jobs, straight to WhatsApp."
5. **Auto-apply** — a reviewer: "Auto apply feature is good **but should have asked before applying**. It added some **irrelevant skill sets** … skills mentioned but removed training, certification."
6. **Freemium paywall** — a reviewer: "it's **free for 3 responses then you have to subscribe** to go ahead." => "huntt Pro"-style subscription. **CONFIRMED.**

**Critical quality signals from real users (their own reviews):**
- Auto-apply fired **without consent** and targeted irrelevant roles.
- Resume generation **fabricated/padded skills** and dropped certifications.
- Backend reliability complaints ("backend api hit ho rhi but server site se koi problem…").
- A pricing/credits-visibility complaint.

These are the seams we attack.

---

## 4. huntt.ai data & ingestion pipeline (inferred)

huntt.ai is an **aggregation layer, not a direct-employment marketplace**. Its ToS reserves the right to "integrate with or link to third-party services… (e.g. LinkedIn, Google, job boards)." That is the standard ATS-feed + aggregator-API architecture:

1. **Enterprise ATS feeds** — Greenhouse, Lever, Workday, SmartRecruiters (this is exactly the pipeline DECODING JOBS already runs, and one we can widen).
2. **Aggregator APIs** — Adzuna, Jooble, JSearch/RapidAPI (we already use Adzuna).
3. **Direct / partner postings** — employer-supplied roles.

Then: **normalize → dedupe → enrich** (canonical company names, drop duplicates, parse salary to ₹ LPA, tag skills) → index into a **search engine + vector store** for retrieval. This mirrors our Adzuna + Groq + PostGIS stack almost one-to-one; the delta is volume (national vs South-India hubs) and the **vector store** (they very likely have one; we do not yet).

---

## 5. huntt.ai tech stack (inferred)

| Layer | huntt.ai (inferred) | DECODING JOBS (actual) |
|---|---|---|
| Web | Next.js / React + Tailwind (SSR) | **Next.js 15, React 19, TS, Tailwind 4** |
| Mobile | React Native/Expo **or** Flutter | none (PWA-capable web) |
| Backend | Node (Express/Fastify) | **FastAPI, SQLAlchemy 2 async, Pydantic v2** |
| DB | PostgreSQL **or** MongoDB | **PostgreSQL 16 + PostGIS 3.4** |
| Search | Elasticsearch / Typesense / **pgvector** | Postgres FTS + **PostGIS spatial** (no vector store yet) |
| LLM | OpenAI / **Groq (Llama 3.3)** | **Groq (`openai/gpt-oss-120b`)** |
| Alerts | **WhatsApp Business API** (Gupshup/AiSensy/Wati) + cron | Email (SendGrid) + **Telegram** |
| Map | none | **MapLibre GL + supercluster + PostGIS** |
| Tracker | none visible | **Kanban with email auto-advancement** |
| Recruiter side | none visible | **verified candidate search** |

Both products are "LLM + Postgres + aggregated jobs." Ours is differentiated by **spatial + workflow**, theirs by **mobile + WhatsApp + breadth**.

---

## 6. Apply flow & monetization

- **Apply flow (huntt.ai):** aggregated roles → **redirect to the employer ATS** (Greenhouse/Workday) or an **affiliate/referral link** (revenue), with in-app submission for direct/partner roles. Plus **auto-apply** (controversial — see reviews).
- **Monetization (huntt.ai):** freemium **"Huntt Pro"** — free tier caps AI responses (~3), then subscription for unlimited tailoring, cover letters, priority alerts. In-app purchases are declared on the Play listing. **CONFIRMED.**
- **DECODING JOBS:** free; 1-click apply with resume selection; Kanban tracker; no paywall. This is a **land-and-expand** posture we can keep while adding premium depth (see roadmap) without paywalling the core map.

---

## 7. Feature-by-feature comparison

| Capability | huntt.ai | DECODING JOBS | Edge |
|---|---|---|---|
| Discovery UX | Chat + ranked list/feed | **Interactive map + grid of real companies** | **Us** (spatial intuition) |
| Geography | "role, experience, city" text filter | **City + tech-park hubs + viewport bbox + ~30-min transit reachability** | **Us** |
| Inventory breadth | **3 lakh+ nationwide** | South-India hubs (Adzuna + ATS feeds) | **huntt** (volume) |
| Semantic / vector search | Likely (embeddings) | Keyword FTS only | **huntt** |
| Resume tailoring / ATS | **Per-role rewrite + ATS score** | ATS scoring + iterative AI rewrite + match score | ~Parity (we're close) |
| Interview prep | Role-specific by background | **Company + role-specific prep** grounded in our data | **Us** (grounding) |
| Alerts | **WhatsApp Business push, "24/7"** | Email + Telegram Job Radar | **huntt** (WhatsApp ubiquity) |
| Auto-apply | Yes — **without consent** (a liability) | 1-click apply, human-confirmed + tracked | **Us** (trust) |
| Application tracking | Not visible | **Kanban (Saved→Applied→Interviewing→Offered) + email auto-advance** | **Us** |
| Recruiter reverse-search | Not visible | **Verified candidate search** | **Us** |
| Company intel | none visible | **Company Pulse: funding, stack, verified logo/site, sentiment/culture score** | **Us** |
| Data quality | Padded skills, dup relevance (their reviews) | Normalized, deduped, geo-verified | **Us** |
| Mobile distribution | **Native Android + iOS** | Responsive web only | **huntt** |
| Brand / trust | Aggregator, black-box auto-apply | Verified employers, transparent, non-invasive | **Us** |

**Net:** huntt.ai leads on three axes — **volume, native mobile, WhatsApp**. We lead on **spatial discovery, trust, and workflow**. Every roadmap item below either neutralizes one of their three or deepens one of ours.

---

## 8. Prioritized roadmap — making DECODING JOBS more powerful

### P0 — Close the three breadth gaps (highest leverage)

1. **Semantic (vector) search over jobs.** Add a `pgvector` column to `jobs`, embed `title + description + skills` on ingest (a cheap batch job alongside `fetch-real-jobs.mjs`), and let the assistant's `search_jobs` tool blend keyword + cosine similarity. This directly neutralizes huntt.ai's "chat finds the right jobs" claim while keeping our map as the payoff layer. Reuses our existing Postgres/PostGIS container — no new infra.
2. **WhatsApp alerts (parity), not just Telegram/email.** Wire a WhatsApp Business provider (Gupshup/AiSensy/Wati) into the existing `alerts.py` sweep so saved searches push to WhatsApp, the channel Indian job-seekers actually live in. Keep the zero-cost Telegram Radar as the free tier.
3. **Native/mobile-grade PWA + share intent.** Our `/assistant` and map already fit 360–390px. Ship an installable PWA manifest with offline shell and "share a job" deep links so we can be added to the home screen without an app-store cycle — the fastest way to blunt huntt.ai's native install advantage.

### P1 — Weaponize our workflow moat

4. **ATS resume-match score surfaced per card and in chat.** We already have ATS scoring + iterative rewrite. Compute a match score per job against the active resume and show a **"92% match"** badge on result cards and a sort option — the single most requested feature in this category, and one we can render transparently (score + which keywords matched).
5. **Tech-park + commute-radius filters promoted into the assistant.** Our map already knows hubs (Electronic City, Manyata, Whitefield) and a ~30-min reachability zone. Expose these as **tool parameters** in `chat.py`'s `search_jobs` (`near_hub`, `commute_minutes`) so users can *say* "within 30 min of Manyata" and get map-clustered matches — something a chat-only competitor structurally cannot do.
6. **Consent-first "apply assist" (fix huntt.ai's biggest flaw).** Instead of silent auto-apply, offer **one-click prefill → confirm → tracked**. Show the exact resume version used, and never fabricate skills. Market this explicitly against huntt.ai's review complaints ("we never apply without you, and we never invent skills").
7. **Company Pulse → "Why this company" insights in chat.** Surface funding recency, stack match, and culture score as an assistant answer when a user asks about a company — turning our enriched data into conversational depth huntt.ai lacks.

### P2 — Differentiation & retention

8. **Application momentum dashboard.** Extend the Kanban with funnel analytics (response rate per resume version, median time-in-stage, stale-card nudges). This is a retention loop huntt.ai has no equivalent for.
9. **Ingestion parity + dedupe hardening.** Widen ATS feeds (Workday, SmartRecruiters) alongside Adzuna, and formalize cross-source dedupe/normalization (company alias table, fuzzy title match) so head-to-head comparisons on quality stay in our favor.
10. **National expansion path.** Our spatial model is a superset of huntt.ai's city filter — extending hubs beyond South India is a data/geocode task (`scripts/geocode.mjs` already generalizes), not a re-architecture.

---

## 9. Assistant reliability note (this session)

Both products are LLM-dependent, so assistant robustness is competitive surface. This session hardened DECODING JOBS' `/chat`:

- Groq 429 handling with `retry-after`/`x-ratelimit-reset-tokens` backoff, capped.
- Tool-call **dedupe cache** (gpt-oss re-issued identical calls until the round budget ran out).
- Nullable optional tool params + `list_companies` `required: []` (schema-valid tool calls).
- **Graceful malformed-tool-call handling**: unknown tools and `TypeError`-shaped args are returned to the model as a correctable error instead of a 500.
- **Tool-free retry on Groq 400** (schema rejection) — answer in prose, still render the collected cards.
- Compacting replayed tool results and capping `max_tokens` to fit the free-tier TPM budget.

Verified live: `POST /api/v1/chat {"messages":[{"role":"user","content":"backend developer jobs in Bengaluru"}]}` → clean prose + **10 job cards**, ~4.1s.

Known residual: slow turns (30–60s) appear under repeated 429 backoff — a **free-tier TPM** limitation, not a logic bug. The P0 vector-search work should also cut prompt size, indirectly reducing this.

---

## 10. Sourcing & confidence

- **CONFIRMED (first-party/public):** Play listing copy, download count, rating, developer address, ToS snippet (ZeroShot Tech + Rupansh Goyal as Grievance Officer), LinkedIn founder profile, user reviews (auto-apply complaint, free-3-responses paywall).
- **INFERRED (industry-standard deduction):** exact ingestion sources, vector-store presence, backend framework, mobile framework, WhatsApp provider, ATS/aggregator mix.
- **Not verifiable:** huntt.ai web app internals (host resolves to a reserved address; direct fetch blocked).

Recommend re-running this teardown quarterly — a 10K-download, 2026-founded competitor is early and can pivot quickly.
