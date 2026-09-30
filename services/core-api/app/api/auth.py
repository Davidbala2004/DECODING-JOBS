"""Magic-link sign-in: request a link, click it, get a real session.

This is the primary passwordless sign-in path (alongside Google Sign-In in
users.py, which shares the same session concept via create_session()). It
replaces the earlier /users/identify model, which trusted a bare email
string with no proof of ownership at all.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.session import get_db
from app.schemas import MagicLinkRequest, MagicLinkResponse, SessionResponse
from app.services.auth import (
    InvalidMagicLinkError,
    create_magic_link,
    create_session,
    send_magic_link_email,
    verify_magic_link,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/request-link",
    response_model=MagicLinkResponse,
    summary="Email a one-time sign-in link to this address",
)
async def request_link(
    payload: MagicLinkRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MagicLinkResponse:
    raw_token = await create_magic_link(db, payload.email)
    sent = await send_magic_link_email(payload.email, raw_token)

    settings = get_settings()
    dev_link = None
    if not settings.SENDGRID_API_KEY:
        # No way to deliver the email without a send key — hand back the raw
        # link directly so local dev/testing doesn't require real SendGrid.
        # This field never appears once SENDGRID_API_KEY is actually set.
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
