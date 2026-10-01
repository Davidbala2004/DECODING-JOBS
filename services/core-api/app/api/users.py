"""User-related API routes: Google Sign-In and job-seeker preferences.

Real identity is a session (see app/services/auth.py / app/core/security.py
`require_session`), established via Google Sign-In here or the magic-link
flow in app/api/auth.py — both call create_session() so either path yields
the same kind of bearer token. The old /identify endpoint (get-or-create a
User by a bare, unverified email string with no session issued) has been
removed — it granted no session and was superseded entirely by magic links.
"""

import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.security import require_session
from app.db.session import get_db
from app.models.domain import (
    Application,
    ChatConversation,
    EmailEvent,
    MagicLinkToken,
    Resume,
    SavedSearch,
    User,
)
from app.schemas import (
    GoogleAuthRequest,
    SavedSearchCreate,
    SavedSearchRead,
    SessionResponse,
    UserPreferencesRead,
    UserPreferencesUpdate,
)
from app.services.auth import create_session
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
    "/google-auth",
    response_model=SessionResponse,
    summary="Sign in with Google — verifies the ID token, then issues a real session",
)
async def google_auth(
    payload: GoogleAuthRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SessionResponse:
    """Verifies the Google ID token server-side, then issues a session the
    same way the magic-link flow does (app/api/auth.py) — one session
    concept shared by both sign-in paths, so every other endpoint only ever
    has to check `require_session`, never re-implement identity."""
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

    session_token = await create_session(db, user)
    return SessionResponse(session_token=session_token, user=user)


@router.get(
    "/preferences",
    response_model=UserPreferencesRead,
    summary="Get the signed-in user's job-search preferences",
)
async def get_preferences(
    current_user: Annotated[User, Depends(require_session)],
) -> User:
    return current_user


@router.put(
    "/preferences",
    response_model=UserPreferencesRead,
    summary="Update the signed-in user's job-search preferences (personalizes search/chat)",
)
async def update_preferences(
    payload: UserPreferencesUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_session)],
) -> User:
    user = current_user
    if payload.full_name is not None:
        user.full_name = payload.full_name
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
    current_user: Annotated[User, Depends(require_session)],
) -> SavedSearch:
    saved_search = SavedSearch(
        user_id=current_user.id,
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
    current_user: Annotated[User, Depends(require_session)],
) -> list[SavedSearch]:
    result = await db.execute(
        select(SavedSearch)
        .where(SavedSearch.user_id == current_user.id)
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
    current_user: Annotated[User, Depends(require_session)],
) -> None:
    result = await db.execute(
        select(SavedSearch).where(SavedSearch.id == saved_search_id, SavedSearch.user_id == current_user.id)
    )
    saved_search = result.scalar_one_or_none()
    if saved_search is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Saved search not found.")
    await db.delete(saved_search)
    await db.commit()


@router.get(
    "/me/export",
    summary="Export everything this account holds (data portability)",
)
async def export_my_data(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_session)],
) -> dict:
    """Returns the signed-in user's own data as JSON.

    A data-portability / "download my data" affordance to sit alongside
    account deletion — required in spirit by India's DPDP Act and standard
    practice anywhere personal data (here: resumes and forwarded email) is
    held. Deliberately excludes other users' data and raw email bodies.
    """
    saved_searches = await db.execute(
        select(SavedSearch).where(SavedSearch.user_id == current_user.id)
    )
    applications = await db.execute(
        select(Application)
        .options(selectinload(Application.job))
        .where(Application.user_id == current_user.id)
    )
    resumes = await db.execute(select(Resume).where(Resume.user_id == current_user.id))
    conversations = await db.execute(
        select(ChatConversation).where(ChatConversation.user_id == current_user.id)
    )

    return {
        "account": {
            "email": current_user.email,
            "full_name": current_user.full_name,
            "created_at": current_user.created_at.isoformat(),
        },
        "preferences": {
            "target_roles": current_user.target_roles or [],
            "preferred_cities": current_user.preferred_cities or [],
            "preferred_work_mode": current_user.preferred_work_mode,
            "min_salary": current_user.min_salary,
            "skills": current_user.skills or [],
            "experience_years": current_user.experience_years,
            "notice_period": current_user.notice_period,
            "github_url": current_user.github_url,
            "linkedin_url": current_user.linkedin_url,
            "leetcode_url": current_user.leetcode_url,
            "profile_visible_to_recruiters": current_user.profile_visible_to_recruiters,
        },
        "saved_searches": [
            {"label": s.label, "filters": s.filters, "email_alerts_enabled": s.email_alerts_enabled}
            for s in saved_searches.scalars().all()
        ],
        "applications": [
            {
                "job_title": a.job.title if a.job else None,
                "status": a.status.value,
                "interview_round": a.interview_round,
                "resume_filename": a.resume_filename,
                "applied_at": a.applied_at.isoformat(),
            }
            for a in applications.scalars().all()
        ],
        "resumes": [
            {"filename": r.filename, "ats_score": r.ats_score, "uploaded_at": r.uploaded_at.isoformat()}
            for r in resumes.scalars().all()
        ],
        "chat_conversations": [
            {"title": c.title, "created_at": c.created_at.isoformat()}
            for c in conversations.scalars().all()
        ],
    }


@router.delete(
    "/me",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete this account and all of its data",
)
async def delete_my_account(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_session)],
) -> None:
    """Hard-deletes the account and everything tied to it.

    Most children cascade via their FK (sessions, resumes, saved searches,
    chat, candidate unlocks), but two don't and are cleared explicitly:
    `applications.user_id` is ON DELETE SET NULL (they'd be orphaned, not
    removed) and `magic_link_tokens` has no FK at all (keyed by email).
    """
    await db.execute(delete(EmailEvent).where(EmailEvent.user_id == current_user.id))
    await db.execute(delete(Application).where(Application.user_id == current_user.id))
    await db.execute(delete(MagicLinkToken).where(MagicLinkToken.email == current_user.email))
    await db.delete(current_user)
    await db.commit()
