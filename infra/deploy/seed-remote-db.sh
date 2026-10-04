#!/usr/bin/env bash
#
# Copy this project's local database onto a hosted Postgres — schema, seed data
# and all — so the deployed map is not empty.
#
#   bash infra/deploy/seed-remote-db.sh "postgresql://user:pass@ep-xxx.aws.neon.tech/decoding_jobs?sslmode=require"
#
# Invoke it through `bash` rather than `./` — on Git Bash for Windows a
# checked-out script can carry CRLF endings and fail with
# "bad interpreter: /usr/bin/env bash^M" before it ever runs.
#
# Why a dump instead of the SQL files in infra/init-db: those 29 migrations have
# already been applied to your local database, including the mojibake repair and
# the seed-company deactivation. A hosted database will not auto-run them, and
# replaying them by hand would still not reproduce the current state. A dump of
# the local database IS the current state.
#
# Local test accounts are removed after the copy by default, so dev users and
# their live session tokens never end up on a public host. Pass
# --keep-local-users to skip that.
#
# Requires the local PostGIS container to be running. Works from Git Bash on
# Windows as well as macOS/Linux.

set -euo pipefail

# Git Bash on Windows rewrites POSIX-looking arguments before Docker sees them,
# so a container path like /tmp/dj-remote.dump silently becomes
# C:/Users/.../tmp/dj-remote.dump and pg_dump fails to open it. Disable that
# conversion so paths inside the container stay literal. Harmless on macOS/Linux.
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL='*'

usage() {
  cat >&2 <<'EOF'
Usage: seed-remote-db.sh "postgresql://user:pass@host/dbname?sslmode=require" [--keep-local-users]

  The URL is the hosted database's *libpq* connection string — plain
  postgresql://, not postgresql+asyncpg:// (strip the "+asyncpg").

Options:
  --keep-local-users   Also copy local dev users, sessions and their data.
  -h, --help           Show this message.
EOF
}

REMOTE_URL=""
KEEP_LOCAL_USERS=0

for arg in "$@"; do
  case "$arg" in
    -h|--help) usage; exit 0 ;;
    --keep-local-users) KEEP_LOCAL_USERS=1 ;;
    -*) echo "Unknown option: $arg" >&2; usage; exit 64 ;;
    *) REMOTE_URL="$arg" ;;
  esac
done

LOCAL_CONTAINER="${LOCAL_CONTAINER:-decoding-jobs-postgis}"
LOCAL_USER="${LOCAL_USER:-decoding_admin}"
LOCAL_DB="${LOCAL_DB:-decoding_jobs}"
DUMP="${DUMP:-infra/deploy/dj-remote.dump}"

if [[ -z "$REMOTE_URL" ]]; then
  usage
  exit 64
fi

if [[ "$REMOTE_URL" == postgresql+asyncpg://* ]]; then
  cat >&2 <<'EOF'
That is the application's SQLAlchemy URL — pg_restore speaks plain libpq.

  the app wants:  postgresql+asyncpg://user:pass@host/db?ssl=require
  this script wants: postgresql://user:pass@host/db?sslmode=require

Drop the "+asyncpg" and swap ssl= for sslmode=. Keep the same password.
EOF
  exit 64
fi

if [[ "$REMOTE_URL" != postgresql://* && "$REMOTE_URL" != postgres://* ]]; then
  echo "Expected a postgresql:// connection string, got something else." >&2
  exit 64
fi

echo "==> Checking the local database is up"
if ! docker exec "$LOCAL_CONTAINER" pg_isready -U "$LOCAL_USER" -d "$LOCAL_DB" >/dev/null 2>&1; then
  cat >&2 <<EOF
Local container '$LOCAL_CONTAINER' is not reachable. Start it first:

  cd infra && docker compose up -d postgis
EOF
  exit 69
fi

echo "==> Checking the hosted database answers"
if ! docker exec "$LOCAL_CONTAINER" psql "$REMOTE_URL" -v ON_ERROR_STOP=1 -c "SELECT 1;" >/dev/null 2>&1; then
  cat >&2 <<'EOF'
Could not connect to the hosted database. Common causes:

  * sslmode is missing — managed Postgres requires it (?sslmode=require).
  * the password contains characters that need URL-encoding (@ : / ? #).
  * the local Docker network has no outbound access.
EOF
  exit 69
fi

echo "==> 1/6  Dumping the local database"
docker exec "$LOCAL_CONTAINER" pg_dump \
  --username "$LOCAL_USER" \
  --dbname "$LOCAL_DB" \
  --no-owner \
  --no-privileges \
  --format=custom \
  --file /tmp/dj-remote.dump

echo "==> 2/6  Archiving a copy at $DUMP"
mkdir -p "$(dirname "$DUMP")"
docker cp "${LOCAL_CONTAINER}:/tmp/dj-remote.dump" "$DUMP"

echo "==> 3/6  Enabling PostGIS on the host"
docker exec "$LOCAL_CONTAINER" psql "$REMOTE_URL" -v ON_ERROR_STOP=1 \
  -c "CREATE EXTENSION IF NOT EXISTS postgis;" \
  -c "SELECT postgis_version();"

echo "==> 4/6  Restoring schema and data"
# --clean --if-exists makes re-runs safe. On a fresh host pg_restore still
# prints "does not exist, skipping" notices and can exit non-zero on those
# alone, so the exit code is reported rather than fatal — step 6 is the real
# check. Genuine failures show up there as missing tables or zero rows.
set +e
docker exec "$LOCAL_CONTAINER" pg_restore \
  --dbname "$REMOTE_URL" \
  --no-owner \
  --no-privileges \
  --clean \
  --if-exists \
  /tmp/dj-remote.dump
RESTORE_STATUS=$?
set -e

if [[ $RESTORE_STATUS -ne 0 ]]; then
  echo "    pg_restore exited $RESTORE_STATUS. Usually just 'does not exist, skipping'"
  echo "    notices on a fresh database — verifying the result next."
fi

if [[ $KEEP_LOCAL_USERS -eq 0 ]]; then
  echo "==> 5/6  Removing local dev accounts and their data"
  # These are local sign-ins. Left in place they would be working accounts on a
  # public host, with valid session tokens.
  docker exec "$LOCAL_CONTAINER" psql "$REMOTE_URL" -v ON_ERROR_STOP=1 -c "
    TRUNCATE TABLE
      chat_messages,
      chat_conversations,
      applications,
      candidate_unlocks,
      email_events,
      feedback_submissions,
      magic_link_tokens,
      resumes,
      saved_searches,
      sessions,
      users
    RESTART IDENTITY CASCADE;" >/dev/null
  echo "    Done. Testers will start from a clean slate."
else
  echo "==> 5/6  Keeping local users (--keep-local-users)"
fi

echo "==> 6/6  Verifying"
echo "    local:"
docker exec "$LOCAL_CONTAINER" psql -U "$LOCAL_USER" -d "$LOCAL_DB" -c \
  "SELECT
     (SELECT count(*) FROM companies) AS companies,
     (SELECT count(*) FROM jobs)      AS jobs;" | sed 's/^/    /'
echo "    hosted:"
docker exec "$LOCAL_CONTAINER" psql "$REMOTE_URL" -c \
  "SELECT
     (SELECT count(*) FROM companies) AS companies,
     (SELECT count(*) FROM jobs)      AS jobs,
     (SELECT count(*) FROM users)     AS users;" | sed 's/^/    /'

cat <<'EOF'

The hosted company/job counts should match the local ones above. If companies
is 0, the restore failed — re-run and read step 4's output.
Next: set DATABASE_URL on the API host, then load the app and check the map.
EOF
