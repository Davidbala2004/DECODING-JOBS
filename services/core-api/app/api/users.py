"""User-related API routes: Phase 1's password-less, email-only identity,
plus Google Sign-In (which just supplies that same email more reliably —
every other feature keyed on email/user_id is unaffected) and job-seeker
preferences.
"""

import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.session import get_db
from app.models.domain import SavedSearch, User
from app.schemas import (
    GoogleAuthRequest,
    SavedSearchCreate,
    SavedSearchRead,
    UserIdentifyRequest,
    UserPreferencesRead,
    UserPreferencesUpdate,
    UserRead,
)
from app.services.link_verifier import verify_links

router = APIRouter(prefix="/users", tags=["users"])


async def get_or_create_user(db: AsyncSession, email: str) -> User:
    """Looks up a User by email, creating one if it doesn't exist yet.

    Phase 1 has no login/password — an email is the whole identity, shared
    by the Application Tracker board and the map's 1-Click Apply flow.
    """
    normalized = email.strip().lower()
    existing = await db.execute(select(User).where(User.email == normalized))
    user = existing.scalar_one_or_none()
    if user:
        return user

    user = User(
        email=normalized,
        full_name=normalized.split("@")[0],
        forwarding_token=secrets.token_hex(8),
    )
    db.add(user)
    await db.flush()
    return user


@router.post(
    "/identify",
    response_model=UserRead,
    summary="Get-or-create a User by email (no password) — Phase 1 sign-in",
)
async def identify(
    payload: UserIdentifyRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    user = await get_or_create_user(db, payload.email)
    await db.commit()
    await db.refresh(user)

    settings = get_settings()
    user._forwarding_address = (
        f"u-{user.forwarding_token}@{settings.INBOUND_EMAIL_DOMAIN}"
        if settings.INBOUND_EMAIL_DOMAIN and user.forwarding_token
        else None
    )
    return user


@router.post(
    "/google-auth",
    response_model=UserRead,
    summary="Sign in with Google — verifies the ID token, then get-or-creates the same User row /identify would",
)
async def google_auth(
    payload: GoogleAuthRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    """Google Sign-In replaces *typing* an email, not the identity model
    itself — verifying the ID token just gives us a trustworthy email to
    hand to the exact same get_or_create_user every other flow already uses,
    so the tracker/chat/resumes of someone who previously typed their email
    keep working unchanged once they sign in with Google instead."""
    settings = get_settings()
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google Sign-In isn't configured yet.",
        )

    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token as google_id_token

    try:
        claims = google_id_token.verify_oauth2_token(
            payload.credential, google_requests.Request(), settings.GOOGLE_CLIENT_ID
        )
    except Exception as exc:
        # Google's verifier raises ValueError for most malformed/expired
        # tokens, but a garbled credential can also hit an unrelated
        # exception type deeper in JWT/cert parsing — either way, a bad
        # credential is a 401, never a 500.
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid Google credential: {exc}")

    if not claims.get("email_verified", False):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Google account email is not verified.")

    email = claims["email"]
    google_sub = claims["sub"]
    name = claims.get("name")

    user = await get_or_create_user(db, email)
    if not user.google_id:
        user.google_id = google_sub
    if name and (not user.full_name or user.full_name == user.email.split("@")[0]):
        user.full_name = name
    await db.commit()
    await db.refresh(user)

    user._forwarding_address = (
        f"u-{user.forwarding_token}@{settings.INBOUND_EMAIL_DOMAIN}"
        if settings.INBOUND_EMAIL_DOMAIN and user.forwarding_token
        else None
    )
    return user


@router.get(
    "/preferences",
    response_model=UserPreferencesRead,
    summary="Get a user's job-search preferences",
)
async def get_preferences(
    db: Annotated[AsyncSession, Depends(get_db)],
    email: str = Query(..., min_length=3, max_length=320),
) -> User:
    normalized = email.strip().lower()
    result = await db.execute(select(User).where(User.email == normalized))
    user = result.scalar_one_or_none()
    if user is None:
        # No account yet means no preferences yet — an empty set, not an error.
        return UserPreferencesRead()
    return user


@router.put(
    "/preferences",
    response_model=UserPreferencesRead,
    summary="Update a user's job-search preferences (personalizes search/chat)",
)
async def update_preferences(
    payload: UserPreferencesUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    user = await get_or_create_user(db, payload.email)
    if payload.target_roles is not None:
        user.target_roles = payload.target_roles
    if payload.preferred_cities is not None:
        user.preferred_cities = payload.preferred_cities
    if payload.preferred_work_mode is not None:
        user.preferred_work_mode = payload.preferred_work_mode or None
    if payload.min_salary is not None:
        user.min_salary = payload.min_salary
    if payload.skills is not None:
        user.skills = payload.skills
    if payload.experience_years is not None:
        user.experience_years = payload.experience_years
    if payload.notice_period is not None:
        user.notice_period = payload.notice_period or None
    if payload.profile_visible_to_recruiters is not None:
        user.profile_visible_to_recruiters = payload.profile_visible_to_recruiters

    links_changed = False
    if payload.github_url is not None and payload.github_url != (user.github_url or ""):
        user.github_url = payload.github_url or None
        links_changed = True
    if payload.linkedin_url is not None and payload.linkedin_url != (user.linkedin_url or ""):
        user.linkedin_url = payload.linkedin_url or None
        links_changed = True
    if payload.leetcode_url is not None and payload.leetcode_url != (user.leetcode_url or ""):
        user.leetcode_url = payload.leetcode_url or None
        links_changed = True

    if links_changed:
        # Best-effort — a verification failure never blocks saving the links.
        verified = await verify_links(user.github_url, user.linkedin_url, user.leetcode_url)
        user.github_verified = verified["github_verified"]
        user.linkedin_verified = verified["linkedin_verified"]
        user.leetcode_verified = verified["leetcode_verified"]

    await db.commit()
    await db.refresh(user)
    return user


@router.post(
    "/saved-searches",
    response_model=SavedSearchRead,
    summary="Save a map filter combo as a quick-access shortcut (optionally with email alerts)",
)
async def create_saved_search(
    payload: SavedSearchCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SavedSearch:
    user = await get_or_create_user(db, payload.email)
    saved_search = SavedSearch(
        user_id=user.id,
        label=payload.label,
        filters=payload.filters,
        email_alerts_enabled=payload.email_alerts_enabled,
    )
    db.add(saved_search)
    await db.commit()
    await db.refresh(saved_search)
    return saved_search


@router.get(
    "/saved-searches",
    response_model=list[SavedSearchRead],
    summary="List a user's saved searches, newest first",
)
async def list_saved_searches(
    db: Annotated[AsyncSession, Depends(get_db)],
    email: str = Query(..., min_length=3, max_length=320),
) -> list[SavedSearch]:
    normalized = email.strip().lower()
    result = await db.execute(select(User).where(User.email == normalized))
    user = result.scalar_one_or_none()
    if user is None:
        return []
    result = await db.execute(
        select(SavedSearch)
        .where(SavedSearch.user_id == user.id)
        .order_by(SavedSearch.created_at.desc())
    )
    return list(result.scalars().all())


@router.delete(
    "/saved-searches/{saved_search_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a saved search (only its owner can delete it)",
)
async def delete_saved_search(
    saved_search_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    email: str = Query(..., min_length=3, max_length=320),
) -> None:
    normalized = email.strip().lower()
    result = await db.execute(select(User).where(User.email == normalized))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Saved search not found.")
    result = await db.execute(
        select(SavedSearch).where(SavedSearch.id == saved_search_id, SavedSearch.user_id == user.id)
    )
    saved_search = result.scalar_one_or_none()
    if saved_search is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Saved search not found.")
    await db.delete(saved_search)
    await db.commit()
