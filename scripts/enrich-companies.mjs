#!/usr/bin/env node
/**
 * Company ENRICHMENT stage for DECODING JOBS.
 *
 * The ingestion stage (fetch-real-jobs.mjs) creates companies from Adzuna /
 * Greenhouse / Lever feeds that carry little more than a name + a city. Roughly
 * three of every four companies in the database therefore have NO website, and
 * because the frontend resolves every logo through `/api/logo?domain=<website
 * host>`, a missing website means a blank pin, a blank card, and a blank map.
 *
 * This stage drains that backlog: for each company without a website it asks
 * Clearbit's free Autocomplete endpoint (no API key) for the most likely
 * company name -> domain, verifies the returned name is actually the same
 * company (conservative matching — a wrong domain is worse than no domain),
 * and writes the resolved `website_url` back through core-api. The existing
 * favicon proxy then lights up the logo everywhere with no extra work.
 *
 * Usage:
 *   node scripts/enrich-companies.mjs                 # dry run, shows what it would set
 *   node scripts/enrich-companies.mjs --apply         # write results to the DB
 *   node scripts/enrich-companies.mjs --apply --limit=2000
 *   node scripts/enrich-companies.mjs --apply --linkedin   # also fill LinkedIn when website exists
 */

import "dotenv/config";

const API_BASE = process.env.API_URL || "http://localhost:8000";
const INGESTION_API_KEY = process.env.INGESTION_API_KEY;

if (!INGESTION_API_KEY) {
  console.error("✖ INGESTION_API_KEY is not set (see scripts/.env.example).");
  process.exit(1);
}
const HEADERS = { "Content-Type": "application/json", "X-Ingestion-Key": INGESTION_API_KEY };

const APPLY = process.argv.includes("--apply");
const INCLUDE_LINKEDIN = process.argv.includes("--linkedin");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) : 5000;

// Clearbit autocomplete — free, no key. Returns [{name, domain, logo}].
const CLEARBIT_URL = "https://autocomplete.clearbit.com/v1/companies/suggest";
const CONCURRENCY = 8; // polite parallelism against a free endpoint
const WRITE_BATCH = 500;

// ---------------------------------------------------------------- normalisation

// Corporate-form / noise words that must not affect a name match. Stripping
// them lets "Razorpay Software Private Limited" match "Razorpay".
const NOISE = new Set([
  "private", "limited", "ltd", "pvt", "inc", "incorporated", "corp",
  "corporation", "technologies", "technology", "tech", "solutions", "solution",
  "services", "service", "systems", "system", "software", "india", "group",
  "holdings", "global", "labs", "llp", "company", "co", "the", "and",
]);

function normalise(name) {
  return String(name)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w && !NOISE.has(w))
    .join(" ")
    .trim();
}

// Hosts that are never a company's own site — a "domain" from one of these is
// useless for a logo and would misrepresent the employer.
const NON_COMPANY_HOSTS = [
  "facebook.com", "linkedin.com", "twitter.com", "instagram.com", "youtube.com",
  "google.com", "wikipedia.org", "crunchbase.com", "glassdoor.com", "indeed.com",
  "naukri.com", "blogspot.com", "wordpress.com", "wixsite.com", "medium.com",
  "github.io", "notion.site", "sites.google.com", "amazonaws.com", "godaddysites.com",
];

function isCorporateDomain(domain) {
  if (!domain || !domain.includes(".")) return false;
  const d = domain.toLowerCase();
  // Require a plausible registrable name of length >= 2 and a real TLD.
  if (NON_COMPANY_HOSTS.some((h) => d === h || d.endsWith("." + h))) return false;
  const tld = d.split(".").pop();
  if (!/^[a-z]{2,}$/.test(tld)) return false;
  return true;
}

/**
 * Score a Clearbit candidate against the company we're enriching.
 *
 * The DOMAIN is the truth signal, not the name: Clearbit happily returns
 * name-exact but domain-wrong results for short queries (query "ABB" returns
 * {name:"ABB", domain:"abb-bank.az"} — a bank in Azerbaijan, not ABB). So the
 * bulk of the score comes from whether the domain's registrable label matches
 * the query; the name only nudges.
 */
function scoreMatch(query, item) {
  const nq = normalise(query);
  const nn = normalise(item.name || "");
  const domain = String(item.domain || "").toLowerCase().replace(/^www\./, "");
  const nlabel = normalise(domain.split(".")[0]);
  if (!nq || nq.length < 3 || !nlabel) return 0;

  let score = 0;
  if (nlabel === nq) score += 100;
  else if (nq.length >= 5 && (nlabel.startsWith(nq) || nq.startsWith(nlabel))) score += 70;
  else if (nq.length >= 5 && (nlabel.includes(nq) || nq.includes(nlabel))) score += 40;

  if (nn === nq) score += 20;
  else if (nq.length >= 5 && (nn.startsWith(nq + " ") || nn === nq)) score += 10;

  return score;
}

// A domain is only accepted at this score or above. 70 means "the company's
// domain label starts with (or is contained by) the query and the query is long
// enough to be unambiguous" — which rejects the ABB→abb-bank.az class of error.
const MATCH_THRESHOLD = 70;

// ---------------------------------------------------------------- clearbit

async function suggest(rawName, attempt = 0) {
  const url = `${CLEARBIT_URL}?query=${encodeURIComponent(rawName)}`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (res.status === 429 && attempt < 3) {
      await sleep(800 * (attempt + 1));
      return suggest(rawName, attempt + 1);
    }
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function pickDomain(rawName, results) {
  let best = null;
  for (const item of results) {
    if (!item?.domain || !item?.name) continue;
    if (!isCorporateDomain(item.domain)) continue;
    const score = scoreMatch(rawName, item);
    if (score >= MATCH_THRESHOLD && (!best || score > best.score)) {
      best = { domain: item.domain.toLowerCase(), matchedName: item.name, score };
    }
  }
  return best;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- queue + write

async function fetchQueue() {
  // Paginate with an explicit offset. Without it the endpoint returns the same
  // first page every call, so the queue silently filled with duplicates and
  // most resolved domains were thrown away as "already processed".
  const out = [];
  const seen = new Set();
  const pageSize = 1000;
  let offset = 0;
  while (out.length < LIMIT) {
    const url = `${API_BASE}/api/v1/companies/enrichment/queue?limit=${pageSize}&offset=${offset}` +
      (INCLUDE_LINKEDIN ? "&include_linkedin_missing=true" : "");
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new Error(`queue fetch failed: ${res.status} ${await res.text()}`);
    const page = await res.json();
    if (!page.length) break;
    for (const c of page) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      if (out.length < LIMIT) out.push(c);
    }
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return out;
}

async function writeUpdates(updates) {
  let totalUpdated = 0;
  for (let i = 0; i < updates.length; i += WRITE_BATCH) {
    const batch = updates.slice(i, i + WRITE_BATCH);
    const res = await fetch(`${API_BASE}/api/v1/companies/enrich`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ updates: batch }),
    });
    if (!res.ok) {
      console.error(`  ⚠ enrich write failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
      continue;
    }
    const { updated } = await res.json();
    totalUpdated += updated;
    process.stdout.write(`\r  …written ${Math.min(i + WRITE_BATCH, updates.length)}/${updates.length}`);
  }
  process.stdout.write("\n");
  return totalUpdated;
}

// ---------------------------------------------------------------- main

async function main() {
  console.log(`→ Company enrichment (${APPLY ? "APPLY" : "DRY RUN"}), limit ${LIMIT}`);

  const queue = await fetchQueue();
  console.log(`  ${queue.length} companies without a website`);
  if (!queue.length) return;

  const updates = [];
  let resolved = 0;
  let unmatched = 0;
  let processed = 0;

  const worker = async (queueCursor) => {
    while (true) {
      const idx = queueCursor.next();
      if (idx >= queue.length) return;
      const company = queue[idx];
      const results = await suggest(company.name);
      const match = pickDomain(company.name, results);
      processed += 1;
      if (match) {
        resolved += 1;
        updates.push({
          id: company.id,
          website_url: `https://${match.domain}`,
        });
        if (APPLY) {
          // progress tick only; keep stdout calm
        }
      } else {
        unmatched += 1;
      }
      if (processed % 100 === 0) {
        process.stdout.write(`\r  …resolved ${resolved}/${processed}`);
      }
    }
  };

  let cursor = 0;
  const gen = { next: () => cursor++ };
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(gen)));
  process.stdout.write(`\r  …resolved ${resolved}/${queue.length}            \n`);

  console.log(`  ✓ resolved ${resolved} domains, ${unmatched} unmatched (skipped)`);
  console.log(`  sample:`);
  for (const u of updates.slice(0, 8)) {
    const name = queue.find((c) => c.id === u.id)?.name ?? u.id;
    console.log(`    ${name} → ${u.website_url}`);
  }

  if (!APPLY) {
    console.log(`\n  Dry run — nothing written. Re-run with --apply to persist ${updates.length} updates.`);
    return;
  }

  const updated = await writeUpdates(updates);
  console.log(`  ✓ wrote ${updated} companies (website_url filled)`);
  console.log(`  → logos now resolve automatically via /api/logo?domain=<website host>`);
}

main().catch((err) => {
  console.error("✖ enrichment failed:", err);
  process.exit(1);
});
