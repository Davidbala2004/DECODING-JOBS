#!/usr/bin/env node
/**
 * Spread companies that collapsed onto one coordinate.
 *
 * Adzuna returns the *search centroid* as the latitude/longitude of every job
 * it serves, and our geocoder falls back to the city centre when Nominatim
 * can't place a name. Both leave a whole city stacked on a single point — the
 * map then draws one giant bubble ("455 companies here") instead of a city.
 *
 * fetch-real-jobs.mjs now de-clusters new data on the way in, but the rows
 * already in the database stay stacked until something rewrites them. This
 * script does exactly that, using the same deterministic sunflower spiral, so
 * it is safe to re-run and idempotent per point.
 *
 * Usage:
 *   node scripts/spread-stacked-companies.mjs               # dry run, prints plan
 *   node scripts/spread-stacked-companies.mjs --apply       # write the updates
 *   node scripts/spread-stacked-companies.mjs --min=2       # smallest pile to split
 *
 * Connection: DATABASE_URL env var, else the local dev default that matches
 * the decoding-jobs-postgis container (decoding_admin / decoding_pass_dev).
 */

import "dotenv/config";
import pg from "pg";
import { declusterSharedPoints } from "./geocode.mjs";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://decoding_admin:decoding_pass_dev@localhost:5432/decoding_jobs";

const APPLY = process.argv.includes("--apply");
const minArg = process.argv.find((a) => a.startsWith("--min="));
const MIN_GROUP = minArg ? Number(minArg.split("=")[1]) : 2;

const { Client } = pg;
const client = new Client({ connectionString: DATABASE_URL });

async function main() {
  await client.connect();

  const { rows } = await client.query(
    `SELECT id, city, ST_Y(location) AS lat, ST_X(location) AS lng
       FROM companies
      ORDER BY id`
  );

  const entries = rows.map((r) => ({
    key: String(r.id),
    city: r.city || "Unknown",
    lat: Number(r.lat),
    lng: Number(r.lng),
  }));

  // How bad is it, per city — count rows and distinct points.
  const perCity = new Map();
  for (const e of entries) {
    const p = perCity.get(e.city) || { n: 0, pts: new Set() };
    p.n++;
    p.pts.add(`${e.lat.toFixed(5)},${e.lng.toFixed(5)}`);
    perCity.set(e.city, p);
  }
  const worst = [...perCity.entries()]
    .map(([city, v]) => ({ city, n: v.n, pts: v.pts.size }))
    .sort((a, b) => b.n / b.pts - a.n / a.pts);

  console.log("\n  City                 companies   points   worst pile");
  console.log("  " + "-".repeat(56));
  for (const c of worst) {
    const pile = new Map();
    for (const e of entries.filter((x) => x.city === c.city)) {
      const k = `${e.lat.toFixed(5)},${e.lng.toFixed(5)}`;
      pile.set(k, (pile.get(k) || 0) + 1);
    }
    const biggest = Math.max(...pile.values());
    console.log(
      `  ${c.city.padEnd(20)} ${String(c.n).padStart(6)}   ${String(c.pts).padStart(6)}   ${String(biggest).padStart(6)}`
    );
  }

  const spread = declusterSharedPoints(entries, { minGroup: MIN_GROUP });

  const moves = [];
  for (const e of entries) {
    const next = spread.get(e.key);
    if (!next) continue;
    if (Math.abs(next.lat - e.lat) > 1e-7 || Math.abs(next.lng - e.lng) > 1e-7) {
      moves.push({ id: Number(e.key), city: e.city, from: e, to: next });
    }
  }

  console.log(
    `\n  ${moves.length} of ${entries.length} companies would move ` +
      `(piles of >= ${MIN_GROUP} split).`
  );
  for (const m of moves.slice(0, 5)) {
    console.log(
      `    · ${m.city} #${m.id}: ` +
        `(${m.from.lat.toFixed(4)}, ${m.from.lng.toFixed(4)}) → ` +
        `(${m.to.lat.toFixed(4)}, ${m.to.lng.toFixed(4)})`
    );
  }
  if (moves.length > 5) console.log(`    · … and ${moves.length - 5} more`);

  if (!APPLY) {
    console.log("\n  Dry run — nothing written. Re-run with --apply to commit.\n");
    return;
  }

  await client.query("BEGIN");
  try {
    for (const m of moves) {
      await client.query(
        `UPDATE companies SET location = ST_SetSRID(ST_MakePoint($1, $2), 4326) WHERE id = $3`,
        [m.to.lng, m.to.lat, m.id]
      );
    }
    await client.query("COMMIT");
    console.log(`\n  ✅ Spread ${moves.length} companies.\n`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

main()
  .catch((err) => {
    console.error("Fatal:", err.message);
    process.exitCode = 1;
  })
  .finally(() => client.end());
