/**
 * Browser-level verification for the DECODING JOBS web app.
 *
 * Runs against a Next.js dev server already serving at http://localhost:3333
 * (this project's dev port — see FRONTEND_URL in services/core-api/.env).
 * It proves
 * the shell renders, the map data loads, and selecting a company on the client
 * propagates through state into the detail panel — over the real DOM.
 *
 * Usage: node scripts/verify-frontend.mjs
 * Requires: `npx playwright install chromium` (one-time, cached afterward).
 *
 * Selectors here are intentionally tied to the *current* UI (brand text, grid
 * cards). If the markup changes, update this file in the same change — a
 * verification script that asserts removed UI is worse than none.
 */

import { chromium } from "playwright";

const WEB_URL = process.env.WEB_URL ?? "http://localhost:3333";
const TIMEOUT_MS = 15_000;

let exitCode = 0;

function pass(message) {
  console.log(`✅ ${message}`);
}

function fail(message) {
  console.error(`❌ ${message}`);
  exitCode = 1;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push(String(err)));

try {
  await page.goto(WEB_URL, { waitUntil: "load", timeout: TIMEOUT_MS });
} catch (err) {
  fail(`Could not reach ${WEB_URL}: ${err.message}`);
  await browser.close();
  process.exit(1);
}

// 1. No Next.js dev-mode compile/runtime error overlay. (<nextjs-portal> alone
//    is Next's persistent dev indicator, so checking for specific error text
//    avoids a false positive.)
const errorOverlayCount = await page
  .getByText(/Failed to compile|Build Error|Unhandled Runtime Error/i)
  .count();
if (errorOverlayCount === 0) {
  pass("No Next.js compilation error overlay detected");
} else {
  fail("Next.js dev error overlay is present — a compile error is blocking the app");
}

// 2. App shell rendered (proves no silent white-screen failure).
try {
  await page.getByText("DECODING", { exact: false }).first().waitFor({ timeout: TIMEOUT_MS });
  pass("App shell rendered (brand visible)");
} catch {
  fail("App shell did not render — brand text never appeared");
}

// 3. Top navigation links are present.
for (const label of ["AI Assistant", "App Tracker", "Preferences"]) {
  try {
    await page.getByRole("link", { name: label }).first().waitFor({ timeout: TIMEOUT_MS });
    pass(`Top nav link "${label}" rendered`);
  } catch {
    fail(`Top nav link "${label}" is missing`);
  }
}

// 4. Map toolbar rendered (search box is the stablest anchor for it).
try {
  await page.getByPlaceholder(/Search job roles/i).waitFor({ timeout: TIMEOUT_MS });
  pass("Map toolbar rendered (search input visible)");
} catch {
  fail("Map toolbar did not render — search input never appeared");
}

// 5. Switch to Grid view and confirm company cards load from the backend.
let companyName = null;
try {
  await page.getByRole("button", { name: "Grid", exact: true }).click();
  const firstCard = page.locator("div.grid > button").first();
  await firstCard.waitFor({ timeout: TIMEOUT_MS });
  companyName = (await firstCard.locator("p").first().innerText()).trim();
  pass(`Company grid loaded from backend data (${companyName})`);
} catch {
  fail("No company cards rendered — map/backend data did not load (is core-api running and seeded?)");
}

// 6. Selecting a company propagates through state into the detail panel: the
//    side panel's <h1> should show the company we clicked. This is the clearest
//    proof the selection chain works end to end, not just that a variable changed.
if (companyName) {
  try {
    await page.locator("div.grid > button").first().click();
    await page.locator("h1", { hasText: companyName }).first().waitFor({ timeout: TIMEOUT_MS });
    pass(`Selection propagated: clicking "${companyName}" opened its detail panel`);
  } catch {
    fail(`Clicked "${companyName}" but the detail panel never showed it — selection did not propagate`);
  }
}

// 7. No console/hydration errors accumulated across the whole run.
if (consoleErrors.length === 0) {
  pass("Zero console errors (no hydration mismatches or runtime exceptions)");
} else {
  fail(`${consoleErrors.length} console error(s) detected:\n  ${consoleErrors.join("\n  ")}`);
}

await browser.close();

console.log("");
if (exitCode === 0) {
  console.log("✅ Frontend verification passed.");
} else {
  console.log("❌ Frontend verification FAILED — see above.");
}

process.exit(exitCode);
