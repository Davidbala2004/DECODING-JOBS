"""Auth guards used as FastAPI dependencies.

`require_ingestion_key` is a shared-secret guard for internal write endpoints
(the ingestion pipeline's /companies/seed and /jobs/seed) — these aren't
public-facing like the SendGrid webhook, just server-to-server, so a simple
header secret is enough.

`require_session` is the real identity guard used by every endpoint that
used to trust a bare client-supplied email string — it requires a valid
bearer session token (see app/services/auth.py) and returns the actual User.

`require_session_token` is the same guard for the handful of endpoints that
must act on the caller's *own* session rather than on the user (sign-out),
where the raw token — not just the resolved User — is what's needed.
"""

import secrets
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.session import get_db
from app.models.domain import User


def require_ingestion_key(x_ingestion_key: str | None = Header(default=None)) -> None:
    """Raises 401/403 unless the caller sent the correct `X-Ingestion-Key` header.

    Closed by default: if INGESTION_API_KEY isn't configured, every request is
    refused rather than the endpoint silently staying open.
    """
    settings = get_settings()
    if not settings.INGESTION_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Ingestion endpoint not configured — set INGESTION_API_KEY.",
        )
    if not x_ingestion_key or not secrets.compare_digest(x_ingestion_key, settings.INGESTION_API_KEY):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or missing X-Ingestion-Key.")


async def require_session(
    db: Annotated[AsyncSession, Depends(get_db)],
    authorization: str | None = Header(default=None),
) -> User:
    """Resolves the real, session-verified User behind a request.

    Expects `Authorization: Bearer <session_token>`, issued by either the
    magic-link flow (POST /auth/request-link -> GET /auth/verify) or Google
    Sign-In (POST /users/google-auth) — both funnel into the same
    app.services.auth.create_session().
    """
    # Imported here (not at module load) to avoid a security <-> auth-service
    # import cycle, since auth.py itself doesn't need this module.
    from app.services.auth import get_user_from_session

    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in required.")

    raw_token = authorization[len("bearer "):].strip()
    user = await get_user_from_session(db, raw_token)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired or invalid — sign in again.")
    return user


async def optional_session(
    db: Annotated[AsyncSession, Depends(get_db)],
    authorization: str | None = Header(default=None),
) -> User | None:
    """Same as require_session, but returns None instead of 401ing when no
    session is present — for the few flows (1-click apply) that intentionally
    work anonymously too. Still real verification when a token IS supplied:
    a garbled/expired token here is a 401, not silently treated as "anonymous."
    """
    if not authorization:
        return None
    return await require_session(db, authorization)


_BEARER_PREFIX = "bearer "


async def require_session_token(
    db: Annotated[AsyncSession, Depends(get_db)],
    authorization: Annotated[str | None, Header()] = None,
) -> tuple[User, str]:
    """`require_session`, but also hands back the raw bearer token so a caller
    can revoke exactly this session (see POST /auth/logout).

    Verified through `require_session` first, so the token returned here is
    always one that resolved to a live session.
    """
    user = await require_session(db, authorization)
    # require_session has already proven the scheme is ``Bearer``, so the
    # prefix strip is safe here.
    raw_token = (authorization or "")[len(_BEARER_PREFIX):].strip()
    return user, raw_token
