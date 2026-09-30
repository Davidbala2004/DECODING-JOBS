"""Shared pytest fixtures.

Runs against the same live dev Postgres the app itself uses (there's no
throwaway PostGIS-enabled test database standing up here) — every test uses
a unique, randomly-suffixed email so runs never collide, and an autouse
fixture deletes whatever rows a test's email touched afterward. This keeps
the suite simple and debuggable at the size it's at; a transactional
(SAVEPOINT-rollback) fixture would be the next step if it grows much larger.
"""

import os
import secrets

import asyncpg
import httpx
import pytest
import pytest_asyncio

# Real HTTP against the already-running server, not an in-process ASGI
# transport — the app's DB engine is a module-level singleton bound to
# whichever event loop first uses it, which fights pytest-asyncio's
# per-test event loop across multiple test functions. Hitting the live
# server over the network sidesteps that (and is what every manual curl
# verification during development already exercised).
TEST_BASE_URL = os.environ.get("TEST_BASE_URL", "http://localhost:8000")

# A plain asyncpg DSN for the tests' own direct DB access (cleanup, seeding a
# test company) — a fresh connection per call, deliberately NOT the app's
# pooled SQLAlchemy engine, for the same per-test-event-loop reason above.
TEST_DATABASE_DSN = os.environ.get(
    "TEST_DATABASE_DSN", "postgresql://decoding_admin:decoding_pass_dev@postgis:5432/decoding_jobs"
)


def unique_email(prefix: str = "test") -> str:
    return f"{prefix}-{secrets.token_hex(6)}@example.com"


@pytest_asyncio.fixture
async def client():
    async with httpx.AsyncClient(base_url=TEST_BASE_URL) as ac:
        yield ac


@pytest_asyncio.fixture
async def db_conn():
    conn = await asyncpg.connect(TEST_DATABASE_DSN)
    try:
        yield conn
    finally:
        await conn.close()


@pytest_asyncio.fixture
async def cleanup_emails():
    """Yields a list to append test emails to; deletes every row those
    emails touched (users, sessions, magic links, applications, resumes,
    saved searches, candidate unlocks) once the test finishes."""
    emails: list[str] = []
    yield emails

    if not emails:
        return

    conn = await asyncpg.connect(TEST_DATABASE_DSN)
    try:
        await conn.execute(
            "DELETE FROM applications WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1::text[]))",
            emails,
        )
        await conn.execute(
            "DELETE FROM candidate_unlocks WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1::text[])) "
            "OR unlocked_by_email = ANY($1::text[])",
            emails,
        )
        await conn.execute(
            "DELETE FROM resumes WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1::text[]))", emails
        )
        await conn.execute(
            "DELETE FROM saved_searches WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1::text[]))",
            emails,
        )
        await conn.execute(
            "DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1::text[]))", emails
        )
        await conn.execute("DELETE FROM magic_link_tokens WHERE email = ANY($1::text[])", emails)
        await conn.execute("DELETE FROM users WHERE email = ANY($1::text[])", emails)
    finally:
        await conn.close()


@pytest_asyncio.fixture
async def signed_in_session(client: httpx.AsyncClient, cleanup_emails: list[str]):
    """Creates a fresh user via the real magic-link flow and returns
    (email, session_token, user_id) — the same path a real signed-in
    request would have gone through, not a shortcut."""
    email = unique_email()
    cleanup_emails.append(email)

    request_resp = await client.post("/api/v1/auth/request-link", json={"email": email})
    assert request_resp.status_code == 200
    dev_link = request_resp.json()["dev_magic_link"]
    assert dev_link, "SENDGRID_API_KEY must be unset in the test environment for dev_magic_link to be returned"
    token = dev_link.split("token=")[1]

    verify_resp = await client.get("/api/v1/auth/verify", params={"token": token})
    assert verify_resp.status_code == 200
    body = verify_resp.json()
    return email, body["session_token"], body["user"]["id"]


@pytest.fixture
def auth_headers():
    def _headers(session_token: str) -> dict[str, str]:
        return {"Authorization": f"Bearer {session_token}"}

    return _headers
