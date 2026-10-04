#!/usr/bin/env bash
# ============================================================================
# DECODING JOBS — Phase 1 end-to-end stack verification.
#
# Spins up the backend (Docker Compose: PostGIS + core-api), confirms both
# init-db migrations applied, spins up the Next.js dev server, then exercises
# both API and browser-level checks. Exits non-zero on the first failure.
#
# Usage (from repo root):
#   bash scripts/verify-stack.sh
#
# Requires: docker, docker compose, node, npm. Run `npm install` in
# apps/web/ at least once before this script (it does not install deps).
# ============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INFRA_DIR="$REPO_ROOT/infra"
WEB_DIR="$REPO_ROOT/apps/web"
API_BASE="http://localhost:8000"
WEB_BASE="http://localhost:3333"
WEB_LOG="${TMPDIR:-/tmp}/decoding-jobs-web.log"

pass() { echo "✅ $1"; }
fail() { echo "❌ $1"; exit 1; }
section() { echo ""; echo "== $1 =="; }

run_sql() {
    docker exec decoding-jobs-postgis psql -U decoding_admin -d decoding_jobs -tAc "$1"
}

# ---------------------------------------------------------------------------
section "1/7 Starting backend (Docker Compose)"
# ---------------------------------------------------------------------------
(cd "$INFRA_DIR" && docker compose up -d --build)

# ---------------------------------------------------------------------------
section "2/7 Waiting for PostGIS healthcheck"
# ---------------------------------------------------------------------------
timeout 60 bash -c '
until [ "$(docker inspect -f "{{.State.Health.Status}}" decoding-jobs-postgis 2>/dev/null)" = "healthy" ]; do
    sleep 2
done
' || fail "PostGIS did not become healthy within 60s"
pass "PostGIS container is healthy"

# ---------------------------------------------------------------------------
section "3/7 Verifying init-db migrations applied"
# ---------------------------------------------------------------------------
[ "$(run_sql "SELECT postgis_version() IS NOT NULL;")" = "t" ] \
    || fail "PostGIS extension not enabled"
pass "PostGIS extension enabled ($(run_sql "SELECT postgis_version();"))"

[ "$(run_sql "SELECT to_regclass('public.companies') IS NOT NULL;")" = "t" ] \
    || fail "companies table missing — 01-init-postgis.sql did not run"
pass "companies table exists (01-init-postgis.sql applied)"

gist_index_count="$(run_sql "SELECT count(*) FROM pg_indexes WHERE tablename='companies' AND indexdef ILIKE '%gist%';")"
[ "$gist_index_count" -ge 1 ] \
    || fail "GiST spatial index on companies.location missing"
pass "GiST spatial index present on companies.location"

sentiment_col="$(run_sql "SELECT count(*) FROM information_schema.columns WHERE table_name='companies' AND column_name='sentiment_summary';")"
culture_col="$(run_sql "SELECT count(*) FROM information_schema.columns WHERE table_name='companies' AND column_name='culture_score';")"
workmode_col="$(run_sql "SELECT count(*) FROM information_schema.columns WHERE table_name='jobs' AND column_name='work_mode';")"
[ "$sentiment_col" = "1" ] && [ "$culture_col" = "1" ] && [ "$workmode_col" = "1" ] \
    || fail "sentiment_summary / culture_score / work_mode columns missing — 03-add-sentiment-and-work-mode.sql did not run"
pass "sentiment_summary, culture_score, work_mode columns exist (03-add-sentiment-and-work-mode.sql applied)"

seeded_count="$(run_sql "SELECT count(*) FROM companies WHERE sentiment_summary IS NOT NULL AND culture_score IS NOT NULL;")"
[ "$seeded_count" -ge 3 ] \
    || fail "Expected >=3 companies with seeded sentiment data, found $seeded_count"
pass "$seeded_count companies have seeded sentiment_summary + culture_score data"

# ---------------------------------------------------------------------------
section "4/7 Waiting for core-api readiness"
# ---------------------------------------------------------------------------
timeout 60 bash -c "until curl -sf '$API_BASE/health' >/dev/null 2>&1; do sleep 2; done" \
    || fail "core-api did not become reachable within 60s"
pass "core-api is reachable at $API_BASE"

# ---------------------------------------------------------------------------
section "5/7 Verifying API endpoints"
# ---------------------------------------------------------------------------
# NOTE: /health/db is mounted directly on the FastAPI app, not under the
# /api/v1 router — GET /api/v1/health/db 404s. This is the real route per
# services/core-api/app/main.py.
db_status="$(curl -s -o /dev/null -w '%{http_code}' "$API_BASE/health/db")"
[ "$db_status" = "200" ] \
    || fail "GET /health/db returned $db_status, expected 200"
pass "GET /health/db -> 200 (database readiness confirmed)"

search_url="$API_BASE/api/v1/companies/search?min_lat=12.8&min_lng=77.5&max_lat=13.1&max_lng=77.9"
search_response="$(curl -s -w '\nHTTP_STATUS:%{http_code}' "$search_url")"
search_status="$(echo "$search_response" | grep -o 'HTTP_STATUS:[0-9]*' | cut -d: -f2)"
search_body="$(echo "$search_response" | sed '$d')"
[ "$search_status" = "200" ] \
    || fail "GET /api/v1/companies/search returned $search_status, expected 200"
# Piped via stdin rather than a temp file: on Windows/git-bash, a path like
# /tmp/foo written by curl and read back by node.exe (not MSYS-aware) can
# resolve to two different real locations and silently miss.
search_count="$(echo "$search_body" | node -e "
let data = '';
process.stdin.on('data', (chunk) => (data += chunk));
process.stdin.on('end', () => console.log(JSON.parse(data).length));
")"
[ "$search_count" -ge 1 ] \
    || fail "GET /api/v1/companies/search returned 200 but zero companies"
pass "GET /api/v1/companies/search -> 200 with $search_count companies (spatial seed data confirmed)"

# ---------------------------------------------------------------------------
section "6/7 Starting frontend (Next.js dev server)"
# ---------------------------------------------------------------------------
if curl -sf "$WEB_BASE" >/dev/null 2>&1; then
    pass "Next.js dev server already running at $WEB_BASE — reusing it"
else
    (cd "$WEB_DIR" && nohup npm run dev > "$WEB_LOG" 2>&1 &)
    timeout 60 bash -c "until curl -sf '$WEB_BASE' >/dev/null 2>&1; do sleep 2; done" \
        || fail "Next.js dev server did not become reachable within 60s (see $WEB_LOG)"
    pass "Next.js dev server is reachable at $WEB_BASE"
fi

# ---------------------------------------------------------------------------
section "7/7 Browser-level verification (compile/hydration + Zustand selection)"
# ---------------------------------------------------------------------------
(cd "$WEB_DIR" && node scripts/verify-frontend.mjs) \
    || fail "Frontend browser verification failed — see output above"

echo ""
echo "✅ All Phase 1 stack checks passed."
echo "   Backend:  $API_BASE  (docker compose ps / down -v via infra/)"
echo "   Frontend: $WEB_BASE  (log: $WEB_LOG)"
