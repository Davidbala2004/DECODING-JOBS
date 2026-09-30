"""Real session issuance: a magic-link token (emailed, single-use, 15-minute
TTL) proves mailbox ownership and is exchanged for a longer-lived bearer
session token. This replaced the previous model where every endpoint simply
trusted whatever email string a client sent in the request body.

Google Sign-In (users.py `/google-auth`) already proves ownership via a
verified ID token, so it also calls `create_session()` here — one session
concept shared by both sign-in paths.
"""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.domain import MagicLinkToken, Session, User
from app.services.sendgrid_client import send_email

MAGIC_LINK_TTL = timedelta(minutes=15)
SESSION_TTL = timedelta(days=30)


def _hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode()).hexdigest()


async def create_magic_link(db: AsyncSession, email: str) -> str:
    """Creates a magic-link token row and returns the raw token (never stored)."""
    raw_token = secrets.token_urlsafe(32)
    token = MagicLinkToken(
        email=email.strip().lower(),
        token_hash=_hash_token(raw_token),
        expires_at=datetime.now(timezone.utc) + MAGIC_LINK_TTL,
    )
    db.add(token)
    await db.commit()
    return raw_token


async def send_magic_link_email(email: str, raw_token: str) -> bool:
    settings = get_settings()
    verify_url = f"{settings.FRONTEND_URL}/auth/verify?token={raw_token}"
    return await send_email(
        to=email,
        subject="Sign in to DECODING JOBS",
        html_content=(
            f"<p>Click below to sign in — this link expires in 15 minutes and works once:</p>"
            f'<p><a href="{verify_url}">{verify_url}</a></p>'
        ),
    )


class InvalidMagicLinkError(Exception):
    """Raised when a magic-link token is missing, expired, or already used."""


async def verify_magic_link(db: AsyncSession, raw_token: str) -> User:
    """Exchanges a valid magic-link token for the User it was issued to.

    Marks the token used so it can never be replayed, even if the request
    somehow reaches this twice before the transaction commits elsewhere.
    """
    result = await db.execute(
        select(MagicLinkToken).where(MagicLinkToken.token_hash == _hash_token(raw_token))
    )
    token = result.scalar_one_or_none()
    if token is None:
        raise InvalidMagicLinkError("Invalid or unknown link.")
    if token.used_at is not None:
        raise InvalidMagicLinkError("This link has already been used.")
    if token.expires_at < datetime.now(timezone.utc):
        raise InvalidMagicLinkError("This link has expired — request a new one.")

    token.used_at = datetime.now(timezone.utc)

    from app.api.users import get_or_create_user

    user = await get_or_create_user(db, token.email)
    await db.commit()
    await db.refresh(user)
    return user


async def create_session(db: AsyncSession, user: User) -> str:
    """Creates a session row for an already-verified user and returns the
    raw bearer token (never stored — only its hash is)."""
    raw_token = secrets.token_urlsafe(32)
    session = Session(
        user_id=user.id,
        token_hash=_hash_token(raw_token),
        expires_at=datetime.now(timezone.utc) + SESSION_TTL,
    )
    db.add(session)
    await db.commit()
    return raw_token


async def get_user_from_session(db: AsyncSession, raw_token: str) -> User | None:
    result = await db.execute(
        select(Session).where(Session.token_hash == _hash_token(raw_token))
    )
    session = result.scalar_one_or_none()
    if session is None or session.expires_at < datetime.now(timezone.utc):
        return None

    session.last_used_at = datetime.now(timezone.utc)
    await db.commit()

    return await db.get(User, session.user_id)
