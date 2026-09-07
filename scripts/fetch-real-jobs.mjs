#!/usr/bin/env node
/**
 * Real-data ingestion for DECODING JOBS.
 *
 * Pulls real companies + real job postings from legitimate, ToS-safe sources
 * and seeds them into the database via the existing core-api /seed endpoints:
 *
 *   - Adzuna Jobs API      (free tier, requires ADZUNA_APP_ID/ADZUNA_APP_KEY)
 *   - Greenhouse / Lever   (public job-board JSON, no auth required)
 *
 * Usage:
 *   node scripts/fetch-real-jobs.mjs --city=Bengaluru
 *   node scripts/fetch-real-jobs.mjs --city=all --source=adzuna
 *   node scripts/fetch-real-jobs.mjs --city=all --source=boards
 *   node scripts/fetch-real-jobs.mjs --city=all --source=all      (default)
 */

import "dotenv/config";
import { geocodeCompanies } from "./geocode.mjs";
import {
  classifySector,
  classifyWorkMode,
  classifyEmploymentType,
} from "./lib/classify.mjs";

const API_BASE = process.env.API_URL || "http://localhost:8000";
const ADZUNA_APP_ID = process.env.ADZUNA_APP_ID;
const ADZUNA_APP_KEY = process.env.ADZUNA_APP_KEY;

// /companies/seed, /jobs/seed, and /jobs/expire-stale all require this header
// now (see services/core-api/app/core/security.py) — must match that
// service's INGESTION_API_KEY exactly.
const INGESTION_API_KEY = process.env.INGESTION_API_KEY;
if (!INGESTION_API_KEY) {
  console.error("✖ INGESTION_API_KEY is not set (see scripts/.env.example) — seed/expire calls will be rejected.");
  process.exit(1);
}
const INGESTION_HEADERS = { "Content-Type": "application/json", "X-Ingestion-Key": INGESTION_API_KEY };

// ---------------------------------------------------------------------------
// City coverage — all major India tech hubs.
// ---------------------------------------------------------------------------

const CITY_CONFIG = {
  Bengaluru: { adzunaWhere: "Bengaluru", cityCenter: { lat: 12.9716, lng: 77.5946 } },
  Chennai: { adzunaWhere: "Chennai", cityCenter: { lat: 13.0827, lng: 80.2707 } },
  Hyderabad: { adzunaWhere: "Hyderabad", cityCenter: { lat: 17.385, lng: 78.4867 } },
  Kochi: { adzunaWhere: "Kochi", cityCenter: { lat: 9.9312, lng: 76.267 } },
  Mumbai: { adzunaWhere: "Mumbai", cityCenter: { lat: 19.076, lng: 72.8777 } },
  Pune: { adzunaWhere: "Pune", cityCenter: { lat: 18.5204, lng: 73.8567 } },
  "Delhi NCR": { adzunaWhere: "Gurgaon", cityCenter: { lat: 28.4595, lng: 77.0266 } },
  Kolkata: { adzunaWhere: "Kolkata", cityCenter: { lat: 22.5726, lng: 88.3639 } },
  Ahmedabad: { adzunaWhere: "Ahmedabad", cityCenter: { lat: 23.0225, lng: 72.5714 } },
};

// Broad coverage across tech disciplines — not just SDE roles — so the map
// reflects the real range of hiring (eng, data, design, QA, infra, PM, support).
const SEARCH_QUERIES = [
  // Software engineering
  "Software Engineer",
  "Backend Engineer",
  "Frontend Engineer",
  "Full Stack Developer",
  "Software Development Engineer",
  "Engineering Manager",
  "Software Architect",
  // Mobile
  "Android Developer",
  "iOS Developer",
  "Mobile Developer",
  // Data & AI
  "Data Scientist",
  "Data Engineer",
  "Data Analyst",
  "Machine Learning Engineer",
  "AI Engineer",
  "MLOps Engineer",
  "Business Intelligence Analyst",
  // Infra / platform / ops
  "DevOps Engineer",
  "Site Reliability Engineer",
  "Cloud Engineer",
  "Platform Engineer",
  "Network Engineer",
  "Database Administrator",
  // Security
  "Security Engineer",
  "Application Security Engineer",
  // Quality
  "QA Engineer",
  "SDET",
  "Automation Test Engineer",
  // Design
  "UI UX Designer",
  "Product Designer",
  // Product & program
  "Product Manager",
  "Technical Program Manager",
  "Business Analyst",
  // Specialized
  "Solutions Architect",
  "Blockchain Developer",
  "Embedded Systems Engineer",
  "Game Developer",
  "AR VR Engineer",
  // Support / customer-facing tech
  "Technical Support Engineer",
  "Sales Engineer",
  "Technical Writer",
  // Internship
  "Software Engineering Intern",
];

// ---------------------------------------------------------------------------
// Known Indian / India-hiring tech companies with public Greenhouse or Lever
// job boards. Extend this list freely — any valid board token works.
//
// NOTE: board tokens drift (companies migrate ATS or rename boards). A wrong
// token just 404s and is skipped with a warning (see fetchGreenhouseBoard /
// fetchLeverBoard) — safe to over-list. Run with --source=boards and check
// the console output to see which ones actually resolved; prune the rest.
// ---------------------------------------------------------------------------

// `website` drives the map-pin logo (resolved via /api/logo → Google favicons,
// see apps/web/components/MapWorkspace.tsx CompanyPin) — without it a company
// falls back to a plain initials avatar instead of its real logo.
const KNOWN_BOARDS = [
  // Fintech
  { name: "Razorpay", ats: "lever", token: "razorpay", city: "Bengaluru", website: "https://razorpay.com" },
  { name: "Groww", ats: "lever", token: "groww", city: "Bengaluru", website: "https://groww.in" },
  { name: "CRED", ats: "lever", token: "cred", city: "Bengaluru", website: "https://cred.club" },
  { name: "Zeta", ats: "lever", token: "zeta", city: "Bengaluru", website: "https://zeta.tech" },
  { name: "Slice", ats: "lever", token: "slice", city: "Bengaluru", website: "https://sliceit.com" },
  { name: "Jupiter", ats: "lever", token: "jupiter", city: "Mumbai", website: "https://jupiter.money" },
  { name: "Fi Money", ats: "lever", token: "fi", city: "Bengaluru", website: "https://fi.money" },
  { name: "Open Financial", ats: "lever", token: "open", city: "Bengaluru", website: "https://open.money" },
  { name: "Smallcase", ats: "lever", token: "smallcase", city: "Bengaluru", website: "https://smallcase.com" },
  // SaaS / DevTools
  { name: "Postman", ats: "greenhouse", token: "postman", city: "Bengaluru", website: "https://postman.com" },
  { name: "Freshworks", ats: "greenhouse", token: "freshworks", city: "Chennai", website: "https://freshworks.com" },
  { name: "Chargebee", ats: "greenhouse", token: "chargebee", city: "Chennai", website: "https://chargebee.com" },
  { name: "Clevertap", ats: "greenhouse", token: "clevertap", city: "Mumbai", website: "https://clevertap.com" },
  { name: "Innovaccer", ats: "greenhouse", token: "innovaccer", city: "Bengaluru", website: "https://innovaccer.com" },
  { name: "Whatfix", ats: "lever", token: "whatfix", city: "Bengaluru", website: "https://whatfix.com" },
  { name: "Hasura", ats: "greenhouse", token: "hasura", city: "Bengaluru", website: "https://hasura.io" },
  { name: "BrowserStack", ats: "greenhouse", token: "browserstack", city: "Mumbai", website: "https://browserstack.com" },
  { name: "Darwinbox", ats: "lever", token: "darwinbox", city: "Hyderabad", website: "https://darwinbox.com" },
  { name: "MindTickle", ats: "greenhouse", token: "mindtickle", city: "Pune", website: "https://mindtickle.com" },
  { name: "Icertis", ats: "greenhouse", token: "icertis", city: "Pune", website: "https://icertis.com" },
  { name: "Druva", ats: "greenhouse", token: "druva", city: "Pune", website: "https://druva.com" },
  { name: "LeadSquared", ats: "lever", token: "leadsquared", city: "Bengaluru", website: "https://leadsquared.com" },
  { name: "Uniphore", ats: "greenhouse", token: "uniphore", city: "Chennai", website: "https://uniphore.com" },
  { name: "Yellow.ai", ats: "lever", token: "yellowai", city: "Bengaluru", website: "https://yellow.ai" },
  { name: "Rippling", ats: "greenhouse", token: "rippling", city: "Bengaluru", website: "https://rippling.com" },
  { name: "Apollo.io", ats: "greenhouse", token: "apollo", city: "Bengaluru", website: "https://apollo.io" },
  { name: "Highspot", ats: "greenhouse", token: "highspot", city: "Bengaluru", website: "https://highspot.com" },
  // Consumer / commerce / logistics
  { name: "Meesho", ats: "greenhouse", token: "meesho", city: "Bengaluru", website: "https://meesho.com" },
  { name: "Zepto", ats: "lever", token: "zepto", city: "Mumbai", website: "https://zeptonow.com" },
  { name: "Urban Company", ats: "lever", token: "urbancompany", city: "Delhi NCR", website: "https://urbancompany.com" },
  { name: "Delhivery", ats: "lever", token: "delhivery", city: "Delhi NCR", website: "https://delhivery.com" },
  { name: "Porter", ats: "lever", token: "porter", city: "Bengaluru", website: "https://porter.in" },
  { name: "Shiprocket", ats: "lever", token: "shiprocket", city: "Delhi NCR", website: "https://shiprocket.in" },
  { name: "Licious", ats: "lever", token: "licious", city: "Bengaluru", website: "https://licious.in" },
  { name: "Livspace", ats: "lever", token: "livspace", city: "Bengaluru", website: "https://livspace.com" },
  { name: "FirstCry", ats: "lever", token: "firstcry", city: "Pune", website: "https://firstcry.com" },
  { name: "Lenskart", ats: "lever", token: "lenskart", city: "Delhi NCR", website: "https://lenskart.com" },
  // Edtech
  { name: "Vedantu", ats: "lever", token: "vedantu", city: "Bengaluru", website: "https://vedantu.com" },
  { name: "Testbook", ats: "lever", token: "testbook", city: "Delhi NCR", website: "https://testbook.com" },
  // Gaming / entertainment
  { name: "Dream11", ats: "lever", token: "dream11", city: "Mumbai", website: "https://dream11.com" },
  { name: "Games24x7", ats: "lever", token: "games24x7", city: "Bengaluru", website: "https://games24x7.com" },
  { name: "MPL", ats: "lever", token: "mpl", city: "Bengaluru", website: "https://mpl.live" },
  // Healthtech
  { name: "Cure.fit", ats: "lever", token: "curefit", city: "Bengaluru", website: "https://cult.fit" },
  { name: "PharmEasy", ats: "lever", token: "pharmeasy", city: "Mumbai", website: "https://pharmeasy.in" },
  { name: "Practo", ats: "lever", token: "practo", city: "Bengaluru", website: "https://practo.com" },
  { name: "1mg", ats: "lever", token: "1mg", city: "Delhi NCR", website: "https://1mg.com" },

  // More fintech
  { name: "Cashfree Payments", ats: "greenhouse", token: "cashfree", city: "Bengaluru", website: "https://cashfree.com" },
  { name: "Pine Labs", ats: "lever", token: "pinelabs", city: "Delhi NCR", website: "https://pinelabs.com" },
  { name: "Juspay", ats: "lever", token: "juspay", city: "Bengaluru", website: "https://juspay.in" },
  { name: "Niyo", ats: "lever", token: "niyo", city: "Bengaluru", website: "https://goniyo.com" },
  { name: "KredX", ats: "lever", token: "kredx", city: "Bengaluru", website: "https://kredx.com" },
  { name: "Lendingkart", ats: "lever", token: "lendingkart", city: "Ahmedabad", website: "https://lendingkart.com" },
  { name: "CoinDCX", ats: "lever", token: "coindcx", city: "Mumbai", website: "https://coindcx.com" },
  { name: "CoinSwitch", ats: "lever", token: "coinswitch", city: "Bengaluru", website: "https://coinswitch.co" },

  // More SaaS / DevTools / enterprise
  { name: "Zluri", ats: "lever", token: "zluri", city: "Bengaluru", website: "https://zluri.com" },
  { name: "Airmeet", ats: "lever", token: "airmeet", city: "Bengaluru", website: "https://airmeet.com" },
  { name: "SuperOps", ats: "lever", token: "superops", city: "Chennai", website: "https://superops.com" },
  { name: "Plivo", ats: "lever", token: "plivo", city: "Bengaluru", website: "https://plivo.com" },
  { name: "Exotel", ats: "lever", token: "exotel", city: "Bengaluru", website: "https://exotel.com" },
  { name: "Springworks", ats: "lever", token: "springworks", city: "Delhi NCR", website: "https://springworks.in" },
  { name: "Peoplebox", ats: "lever", token: "peoplebox", city: "Bengaluru", website: "https://peoplebox.ai" },
  { name: "Wingify (VWO)", ats: "lever", token: "wingify", city: "Delhi NCR", website: "https://vwo.com" },
  { name: "LogiNext", ats: "lever", token: "loginext", city: "Mumbai", website: "https://loginextsolutions.com" },
  { name: "FarEye", ats: "lever", token: "fareye", city: "Delhi NCR", website: "https://fareye.com" },
  { name: "Haptik", ats: "lever", token: "haptik", city: "Mumbai", website: "https://haptik.ai" },
  { name: "Keka", ats: "lever", token: "keka", city: "Hyderabad", website: "https://keka.com" },
  { name: "greytHR", ats: "lever", token: "greythr", city: "Bengaluru", website: "https://greythr.com" },
  { name: "Zimyo", ats: "lever", token: "zimyo", city: "Delhi NCR", website: "https://zimyo.com" },

  // More consumer / commerce
  { name: "Nykaa", ats: "lever", token: "nykaa", city: "Mumbai", website: "https://nykaa.com" },
  { name: "Honasa Consumer (Mamaearth)", ats: "lever", token: "honasa", city: "Delhi NCR", website: "https://mamaearth.in" },
  { name: "CaratLane", ats: "lever", token: "caratlane", city: "Chennai", website: "https://caratlane.com" },
  { name: "Country Delight", ats: "lever", token: "countrydelight", city: "Delhi NCR", website: "https://countrydelight.in" },
  { name: "Cars24", ats: "lever", token: "cars24", city: "Delhi NCR", website: "https://cars24.com" },
  { name: "Spinny", ats: "lever", token: "spinny", city: "Delhi NCR", website: "https://spinny.com" },

  // More logistics
  { name: "Xpressbees", ats: "lever", token: "xpressbees", city: "Pune", website: "https://xpressbees.com" },
  { name: "BlackBuck", ats: "lever", token: "blackbuck", city: "Bengaluru", website: "https://blackbuck.com" },
  { name: "LetsTransport", ats: "lever", token: "letstransport", city: "Bengaluru", website: "https://letstransport.in" },

  // More edtech
  { name: "upGrad", ats: "lever", token: "upgrad", city: "Mumbai", website: "https://upgrad.com" },
  { name: "Physics Wallah", ats: "lever", token: "physicswallah", city: "Delhi NCR", website: "https://pw.live" },
  { name: "Classplus", ats: "lever", token: "classplus", city: "Delhi NCR", website: "https://classplus.co" },

  // More gaming
  { name: "Nazara Technologies", ats: "lever", token: "nazara", city: "Mumbai", website: "https://nazara.com" },
  { name: "WinZO", ats: "lever", token: "winzo", city: "Delhi NCR", website: "https://winzogames.com" },

  // Data / analytics
  { name: "Fractal Analytics", ats: "greenhouse", token: "fractal", city: "Mumbai", website: "https://fractal.ai" },
  { name: "LatentView Analytics", ats: "lever", token: "latentview", city: "Chennai", website: "https://latentview.com" },
  { name: "Tredence", ats: "lever", token: "tredence", city: "Bengaluru", website: "https://tredence.com" },

  // Verified live 2026-09-05 (see scripts/verify-boards*.mjs history) — each
  // confirmed by checking the actual job `location` fields, not just that the
  // board token resolves, since a resolving token can still belong to an
  // unrelated foreign company (caught two false positives this way: a "vogo"
  // and an "eternal" Lever board that turned out to be Dallas/NYC companies
  // with no relation to India).
  { name: "Paytm", ats: "lever", token: "paytm", city: "Delhi NCR", website: "https://paytm.com" }, // Noida HQ, 110+ jobs there
  { name: "HighRadius", ats: "greenhouse", token: "highradius", city: "Hyderabad", website: "https://highradius.com" }, // 64 Hyderabad jobs
  { name: "Zenoti", ats: "greenhouse", token: "zenoti", city: "Hyderabad", website: "https://zenoti.com" }, // 22 Hyderabad jobs
  { name: "Groww", ats: "greenhouse", token: "groww", city: "Bengaluru", website: "https://groww.in" },
  { name: "HackerRank", ats: "greenhouse", token: "hackerrank", city: "Bengaluru", website: "https://hackerrank.com" }, // 17 Bangalore jobs
];

// ---------------------------------------------------------------------------
// Adzuna fetcher
// ---------------------------------------------------------------------------

// Adzuna free tier is rate-limited (per-second + daily call cap), and with
// 45 role queries × 9 cities a full run is hundreds of calls — pace requests
// and allow the page count to be tuned via env instead of hardcoding it.
const ADZUNA_PAGES = Number(process.env.ADZUNA_PAGES || 1);
const ADZUNA_REQUEST_DELAY_MS = Number(process.env.ADZUNA_REQUEST_DELAY_MS || 300);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchAdzunaForCity(cityName) {
  if (!ADZUNA_APP_ID || !ADZUNA_APP_KEY) {
    console.log("  ⚠ ADZUNA_APP_ID/ADZUNA_APP_KEY not set — skipping Adzuna source. See scripts/.env.example.");
    return [];
  }

  const config = CITY_CONFIG[cityName];
  const results = [];

  for (const query of SEARCH_QUERIES) {
    for (let page = 1; page <= ADZUNA_PAGES; page++) {
      const url = new URL(`https://api.adzuna.com/v1/api/jobs/in/search/${page}`);
      url.searchParams.set("app_id", ADZUNA_APP_ID);
      url.searchParams.set("app_key", ADZUNA_APP_KEY);
      url.searchParams.set("results_per_page", "20");
      url.searchParams.set("what", query);
      url.searchParams.set("where", config.adzunaWhere);
      url.searchParams.set("content-type", "application/json");

      try {
        const res = await fetch(url);
        if (!res.ok) {
          console.error(`  ⚠ Adzuna error for "${query}" (page ${page}) in ${cityName}: ${res.status}`);
          break; // don't keep paginating a failing query
        }
        const data = await res.json();
        const items = data.results || [];
        for (const item of items) {
          results.push({
            title: item.title?.replace(/<[^>]+>/g, "") || query,
            description: item.description || "",
            company: item.company?.display_name?.trim(),
            location: item.location?.display_name || cityName,
            latitude: item.latitude || null,
            longitude: item.longitude || null,
            applyUrl: item.redirect_url,
            salaryMin: item.salary_min || null,
            salaryMax: item.salary_max || null,
          });
        }
        if (items.length < 20) break; // last page reached
      } catch (err) {
        console.error(`  ⚠ Adzuna request failed for "${query}" (page ${page}) in ${cityName}: ${err.message}`);
        break;
      }

      await sleep(ADZUNA_REQUEST_DELAY_MS);
    }
  }

  return results.map((job) => ({ ...job, city: cityName, source: "adzuna" }));
}

// ---------------------------------------------------------------------------
// Greenhouse / Lever fetcher
// ---------------------------------------------------------------------------

const HTML_ENTITIES = {
  "&lt;": "<", "&gt;": ">", "&amp;": "&", "&quot;": '"', "&#39;": "'",
  "&nbsp;": " ", "&rsquo;": "’", "&lsquo;": "‘", "&rdquo;": "”", "&ldquo;": "“",
};

// Greenhouse's `content` field comes back HTML-*entity-encoded* (literal
// "&lt;div&gt;" text, not real "<div>" tags) — a naive tag-stripping regex
// finds nothing to strip and the raw markup shows up verbatim in the UI.
// Decode entities first, then turn block-level tags into real line breaks
// (so paragraphs/lists stay readable instead of collapsing into one dense
// blob) before stripping whatever tags remain.
function cleanJobDescription(raw) {
  if (!raw) return "";
  let text = raw.replace(/&[a-z#0-9]+;/gi, (m) => HTML_ENTITIES[m.toLowerCase()] ?? m);
  text = text
    .replace(/<\/(p|div|h[1-6]|li)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "");
  text = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line, i, arr) => line || (i > 0 && arr[i - 1] !== ""))
    .join("\n")
    .trim();
  return text.slice(0, 2000);
}

async function fetchGreenhouseBoard(board) {
  try {
    const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${board.token}/jobs?content=true`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.jobs || []).map((job) => ({
      title: job.title,
      description: cleanJobDescription(job.content),
      company: board.name,
      website: board.website,
      location: job.location?.name || board.city,
      applyUrl: job.absolute_url,
      city: board.city,
      source: "greenhouse",
    }));
  } catch (err) {
    console.error(`  ⚠ Greenhouse fetch failed for "${board.name}": ${err.message}`);
    return [];
  }
}

async function fetchLeverBoard(board) {
  try {
    const res = await fetch(`https://api.lever.co/v0/postings/${board.token}?mode=json`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data || []).map((job) => ({
      title: job.text,
      // descriptionPlain is already clean when present; the HTML fallback
      // (some Lever boards omit descriptionPlain) needs the same cleanup.
      description: job.descriptionPlain
        ? job.descriptionPlain.slice(0, 2000)
        : cleanJobDescription(job.description),
      company: board.name,
      website: board.website,
      location: job.categories?.location || board.city,
      applyUrl: job.hostedUrl,
      city: board.city,
      source: "lever",
    }));
  } catch (err) {
    console.error(`  ⚠ Lever fetch failed for "${board.name}": ${err.message}`);
    return [];
  }
}

async function fetchKnownBoards(cityFilter) {
  const boards = cityFilter === "all" ? KNOWN_BOARDS : KNOWN_BOARDS.filter((b) => b.city === cityFilter);
  const all = [];
  for (const board of boards) {
    const jobs = board.ats === "greenhouse" ? await fetchGreenhouseBoard(board) : await fetchLeverBoard(board);
    if (jobs.length) console.log(`  ✓ ${board.name} (${board.ats}): ${jobs.length} postings`);
    all.push(...jobs);
  }
  return all;
}

// ---------------------------------------------------------------------------
// Group raw jobs by company, geocode, and seed via the core-api.
// ---------------------------------------------------------------------------

async function groupByCompany(rawJobs) {
  const companyMap = new Map();
  for (const job of rawJobs) {
    const name = job.company?.trim();
    if (!name || !job.title) continue;

    if (!companyMap.has(name)) {
      companyMap.set(name, {
        name,
        city: job.city,
        area: null,
        // Placeholder — a global company's board lists jobs in arbitrary
        // order, so grabbing the *first* job's location can pick a foreign
        // office ("Houston, Texas") for a company we're placing in Hyderabad.
        // Resolved for real below, once every job for this company is in.
        address: null,
        lat: job.latitude || null,
        lng: job.longitude || null,
        website: job.website || null,
        jobs: [],
      });
    }
    companyMap.get(name).jobs.push(job);
  }

  // Now that all of each company's jobs are grouped, pick an address from a
  // job actually located in the target city/India — falling back to the
  // bare city name (never a random foreign office) if none match.
  for (const company of companyMap.values()) {
    const inCity = company.jobs.find((j) => j.location?.toLowerCase().includes(company.city.toLowerCase()));
    const inIndia = company.jobs.find((j) => /india/i.test(j.location || ""));
    company.address = inCity?.location || inIndia?.location || company.city;
  }

  return Array.from(companyMap.values());
}

async function seedCompanies(companies) {
  console.log(`\n  Geocoding ${companies.length} companies missing coordinates...`);
  const toGeocode = companies.filter((c) => !c.lat || !c.lng);
  const coords = await geocodeCompanies(
    toGeocode.map((c) => ({ name: c.name, area: c.area, city: c.city, address: c.address }))
  );

  let companiesSeeded = 0;
  let jobsSeeded = 0;

  for (const company of companies) {
    const resolvedCoords = company.lat && company.lng
      ? { lat: company.lat, lng: company.lng }
      : coords.get(company.name);

    if (!resolvedCoords) {
      console.error(`  ⚠ No coordinates for "${company.name}" — skipping.`);
      continue;
    }

    const allText = company.jobs.map((j) => `${j.title} ${j.description}`).join(" ");
    const companyPayload = {
      name: company.name,
      description: company.jobs[0]?.description?.slice(0, 500) || null,
      address: company.address,
      latitude: resolvedCoords.lat,
      longitude: resolvedCoords.lng,
      sector: classifySector(allText, ""),
      city: company.city,
      website_url: company.website,
      status: "active",
    };

    try {
      const res = await fetch(`${API_BASE}/api/v1/companies/seed`, {
        method: "POST",
        headers: INGESTION_HEADERS,
        body: JSON.stringify(companyPayload),
      });
      if (!res.ok) {
        console.error(`  ⚠ Failed to seed company "${company.name}": ${await res.text()}`);
        continue;
      }
      const created = await res.json();
      companiesSeeded++;

      for (const job of company.jobs.slice(0, 15)) {
        const jobRes = await fetch(`${API_BASE}/api/v1/jobs/seed`, {
          method: "POST",
          headers: INGESTION_HEADERS,
          body: JSON.stringify({
            company_id: created.id,
            title: job.title,
            description: job.description || "No description provided.",
            employment_type: classifyEmploymentType(job.title),
            work_mode: classifyWorkMode(job.description),
            apply_url: job.applyUrl,
            source: job.source,
            source_url: job.applyUrl,
          }),
        });
        // 409 = job already seeded, expected on re-runs.
        if (jobRes.ok) jobsSeeded++;
      }
    } catch (err) {
      console.error(`  ⚠ Error seeding "${company.name}": ${err.message}`);
    }
  }

  return { companiesSeeded, jobsSeeded };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArg(name, fallback) {
  const match = process.argv.find((a) => a.startsWith(`--${name}=`));
  return match ? match.split("=")[1] : fallback;
}

async function main() {
  const cityArg = parseArg("city", "all");
  const sourceArg = parseArg("source", "all");
  const cities = cityArg === "all" ? Object.keys(CITY_CONFIG) : [cityArg];

  console.log(`\n🚀 DECODING JOBS — Real Data Fetcher`);
  console.log(`   Cities: ${cities.join(", ")}`);
  console.log(`   Source: ${sourceArg}\n`);

  let allJobs = [];

  if (sourceArg === "adzuna" || sourceArg === "all") {
    for (const city of cities) {
      console.log(`\n${"=".repeat(60)}\n Adzuna: ${city}\n${"=".repeat(60)}`);
      const jobs = await fetchAdzunaForCity(city);
      console.log(`  Found ${jobs.length} postings`);
      allJobs.push(...jobs);
    }
  }

  if (sourceArg === "boards" || sourceArg === "all") {
    console.log(`\n${"=".repeat(60)}\n Greenhouse / Lever boards\n${"=".repeat(60)}`);
    const jobs = await fetchKnownBoards(cityArg === "all" ? "all" : cityArg);
    allJobs.push(...jobs);
  }

  if (allJobs.length > 0) {
    const companies = await groupByCompany(allJobs);
    console.log(`\n  Total raw postings: ${allJobs.length}`);
    console.log(`  Unique companies: ${companies.length}`);

    const { companiesSeeded, jobsSeeded } = await seedCompanies(companies);
    console.log(`\n✅ Done — seeded ${companiesSeeded} companies, ${jobsSeeded} jobs.`);
  } else {
    console.log("\nNo jobs fetched — check API keys / city name / network access.");
  }

  await expireStaleJobs();
}

async function expireStaleJobs() {
  const days = Number(process.env.STALE_JOB_DAYS || 21);
  try {
    const res = await fetch(`${API_BASE}/api/v1/jobs/expire-stale?days=${days}`, {
      method: "POST",
      headers: INGESTION_HEADERS,
    });
    if (!res.ok) {
      console.error(`  ⚠ Stale-job sweep failed: ${res.status}`);
      return;
    }
    const { expired_count } = await res.json();
    console.log(`  🧹 Stale-job sweep: marked ${expired_count} unrefreshed job(s) inactive (>${days}d).`);
  } catch (err) {
    console.error(`  ⚠ Stale-job sweep request failed: ${err.message}`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
