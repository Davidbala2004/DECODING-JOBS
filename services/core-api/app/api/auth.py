"""Magic-link sign-in: request a link, click it, get a real session.

This is the primary passwordless sign-in path (alongside Google Sign-In in
users.py, which shares the same session concept via create_session()). It
replaces the earlier /users/identify model, which trusted a bare email
string with no proof of ownership at all.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.ratelimit import RateLimit, enforce
from app.core.security import require_session, require_session_token
from app.db.session import get_db
from app.models.domain import User
from app.schemas import MagicLinkRequest, MagicLinkResponse, SessionResponse
from app.services.auth import (
    InvalidMagicLinkError,
    create_magic_link,
    create_session,
    revoke_all_sessions,
    revoke_session,
    send_magic_link_email,
    verify_magic_link,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/request-link",
    response_model=MagicLinkResponse,
    summary="Email a one-time sign-in link to this address",
    dependencies=[Depends(RateLimit(limit=10, window_seconds=3600, scope="request-link"))],
)
async def request_link(
    payload: MagicLinkRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MagicLinkResponse:
    normalized = payload.email.strip().lower()

    # Per-address cap on top of the per-IP dependency above — one mailbox can
    # only be asked for a link a handful of times an hour, so this can't be
    # used to inbox-bomb a specific person (or to spam a bulk address list).
    enforce(f"request-link:email:{normalized}", limit=5, window_seconds=3600)

    raw_token = await create_magic_link(db, normalized)
    sent = await send_magic_link_email(normalized, raw_token)

    settings = get_settings()
    dev_link = None
    # Hand the raw link back ONLY outside production. In production a missing
    # SendGrid key means "we can't deliver a link", never "here is a working
    # sign-in link for any address you type" — returning it there would make
    # the whole session model bypassable by an anonymous visitor.
    if not settings.SENDGRID_API_KEY and settings.ENVIRONMENT != "production":
        dev_link = f"{settings.FRONTEND_URL}/auth/verify?token={raw_token}"

    return MagicLinkResponse(sent=sent, dev_magic_link=dev_link)


@router.get(
    "/verify",
    response_model=SessionResponse,
    summary="Exchange a magic-link token for a session",
)
async def verify(
    db: Annotated[AsyncSession, Depends(get_db)],
    token: str = Query(..., min_length=10),
) -> SessionResponse:
    try:
        user = await verify_magic_link(db, token)
    except InvalidMagicLinkError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    session_token = await create_session(db, user)
    return SessionResponse(session_token=session_token, user=user)


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke the current session",
)
async def logout(
    db: Annotated[AsyncSession, Depends(get_db)],
    session_and_user: Annotated[tuple[User, str], Depends(require_session_token)],
) -> Response:
    """Signs the caller out by deleting the session row behind their token.

    Idempotent and always 204: a client that retries after a flaky network
    shouldn't see an error, and the endpoint deliberately never reveals
    whether the token existed. The browser must still clear its stored copy —
    this makes the token useless, it doesn't un-remember it.
    """
    _, raw_token = session_and_user
    await revoke_session(db, raw_token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/logout-all",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke every session for this account",
)
async def logout_all(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_session)],
) -> Response:
    """Kills every session on the account, including this one — the shared
    laptop / lost phone escape hatch.

    The revoked count rides back in a header rather than a body so the
    response can stay a bare 204, consistent with /auth/logout.
    """
    revoked = await revoke_all_sessions(db, current_user.id)
    return Response(
        status_code=status.HTTP_204_NO_CONTENT,
        headers={"X-Revoked-Sessions": str(revoked)},
    )
