"""Magic-link request/verify — the core of the session model that replaced
trusting a bare client-supplied email string everywhere."""

import httpx
import pytest

from tests.conftest import unique_email


@pytest.mark.asyncio
async def test_request_link_returns_dev_link_when_sendgrid_unconfigured(
    client: httpx.AsyncClient, cleanup_emails: list[str]
) -> None:
    email = unique_email()
    cleanup_emails.append(email)

    response = await client.post("/api/v1/auth/request-link", json={"email": email})

    assert response.status_code == 200
    body = response.json()
    assert body["dev_magic_link"] is not None
    assert "token=" in body["dev_magic_link"]


@pytest.mark.asyncio
async def test_verify_exchanges_a_valid_token_for_a_session(
    client: httpx.AsyncClient, cleanup_emails: list[str]
) -> None:
    email = unique_email()
    cleanup_emails.append(email)

    request_resp = await client.post("/api/v1/auth/request-link", json={"email": email})
    token = request_resp.json()["dev_magic_link"].split("token=")[1]

    response = await client.get("/api/v1/auth/verify", params={"token": token})

    assert response.status_code == 200
    body = response.json()
    assert body["session_token"]
    assert body["user"]["email"] == email


@pytest.mark.asyncio
async def test_verify_rejects_a_reused_token(client: httpx.AsyncClient, cleanup_emails: list[str]) -> None:
    email = unique_email()
    cleanup_emails.append(email)

    request_resp = await client.post("/api/v1/auth/request-link", json={"email": email})
    token = request_resp.json()["dev_magic_link"].split("token=")[1]

    first = await client.get("/api/v1/auth/verify", params={"token": token})
    assert first.status_code == 200

    second = await client.get("/api/v1/auth/verify", params={"token": token})
    assert second.status_code == 401


@pytest.mark.asyncio
async def test_verify_rejects_an_unknown_token(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/v1/auth/verify", params={"token": "a" * 32})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_preferences_requires_a_session(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/v1/users/preferences")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_preferences_accepts_a_valid_session(
    client: httpx.AsyncClient, signed_in_session: tuple[str, str, int], auth_headers
) -> None:
    _email, token, _user_id = signed_in_session

    response = await client.get("/api/v1/users/preferences", headers=auth_headers(token))

    assert response.status_code == 200
