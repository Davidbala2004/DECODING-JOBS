"""PATCH /applications/{id}/status and /round previously took no identity
at all — anyone who guessed an application_id could move any user's card.
These tests prove the ownership check that closed that hole."""

import httpx
import pytest

from tests.conftest import unique_email


async def _real_job_id(client: httpx.AsyncClient) -> int:
    """Picks a real, currently-active job id to attach a test application to —
    hiring_only=true guarantees the company returned actually has one (most
    seeded companies don't)."""
    response = await client.get("/api/v1/companies/search", params={
        "min_lat": -90, "min_lng": -180, "max_lat": 90, "max_lng": 180, "hiring_only": "true",
    })
    companies = response.json()
    assert companies, "expected at least one currently-hiring company in the dev database"
    jobs_resp = await client.get("/api/v1/jobs", params={"company_id": companies[0]["id"]})
    jobs = jobs_resp.json()
    assert jobs, "expected the first hiring company to have at least one job"
    return jobs[0]["id"]


@pytest.mark.asyncio
async def test_status_update_requires_a_session(client: httpx.AsyncClient) -> None:
    response = await client.patch("/api/v1/applications/1/status", json={"status": "applied"})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_status_update_rejects_a_different_users_session(
    client: httpx.AsyncClient, cleanup_emails: list[str], auth_headers
) -> None:
    owner_email = unique_email()
    other_email = unique_email()
    cleanup_emails += [owner_email, other_email]

    async def sign_in(email: str) -> str:
        req = await client.post("/api/v1/auth/request-link", json={"email": email})
        token = req.json()["dev_magic_link"].split("token=")[1]
        verify = await client.get("/api/v1/auth/verify", params={"token": token})
        return verify.json()["session_token"]

    owner_token = await sign_in(owner_email)
    other_token = await sign_in(other_email)

    job_id = await _real_job_id(client)
    save_resp = await client.post(
        "/api/v1/applications/save", json={"job_id": job_id}, headers=auth_headers(owner_token)
    )
    assert save_resp.status_code == 201
    application_id = save_resp.json()["id"]

    forbidden = await client.patch(
        f"/api/v1/applications/{application_id}/status",
        json={"status": "applied"},
        headers=auth_headers(other_token),
    )
    assert forbidden.status_code == 403

    allowed = await client.patch(
        f"/api/v1/applications/{application_id}/status",
        json={"status": "applied"},
        headers=auth_headers(owner_token),
    )
    assert allowed.status_code == 200
    assert allowed.json()["status"] == "applied"
