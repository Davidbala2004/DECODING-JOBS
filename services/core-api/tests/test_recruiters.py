"""Recruiter identify/search/unlock previously trusted a bare, client-typed
email string against a company's domain — anyone could type hr@razorpay.com
and unlock real candidates. These tests prove identity now comes from a
real session instead."""

import secrets

import httpx
import pytest

from tests.conftest import unique_email


@pytest.mark.asyncio
async def test_candidates_requires_a_session(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/v1/recruiters/candidates")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_unlock_requires_a_session(client: httpx.AsyncClient) -> None:
    response = await client.post("/api/v1/recruiters/candidates/1/unlock")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_identify_rejects_a_session_with_no_matching_company(
    client: httpx.AsyncClient, signed_in_session: tuple[str, str, int], auth_headers
) -> None:
    _email, token, _user_id = signed_in_session

    response = await client.post("/api/v1/recruiters/identify", headers=auth_headers(token))

    # A freshly-signed-in @example.com address won't domain-match any
    # registered company.
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_identify_accepts_a_session_matching_a_registered_companys_domain(
    client: httpx.AsyncClient, cleanup_emails: list[str], auth_headers, db_conn
) -> None:
    domain = f"test-{secrets.token_hex(6)}.example"
    founder_email = f"founder@{domain}"
    cleanup_emails.append(founder_email)

    company_id = await db_conn.fetchval(
        "INSERT INTO companies (name, address, location, website_url, submitted_by_email, city) "
        "VALUES ($1, 'Test Address', ST_SetSRID(ST_MakePoint(77.5946, 12.9716), 4326), $2, $3, 'Bengaluru') "
        "RETURNING id",
        f"Test Co {secrets.token_hex(4)}",
        f"https://{domain}",
        founder_email,
    )

    try:
        req = await client.post("/api/v1/auth/request-link", json={"email": founder_email})
        token = req.json()["dev_magic_link"].split("token=")[1]
        verify = await client.get("/api/v1/auth/verify", params={"token": token})
        session_token = verify.json()["session_token"]

        response = await client.post("/api/v1/recruiters/identify", headers=auth_headers(session_token))

        assert response.status_code == 200
        assert response.json()["company_id"] == company_id
    finally:
        await db_conn.execute("DELETE FROM companies WHERE id = $1", company_id)
