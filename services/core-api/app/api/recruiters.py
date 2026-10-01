"""Recruiter-facing candidate search: a company's verified recruiter searches
job seekers by role/experience/work-mode fit, then "unlocks" a promising
candidate to see their full profile and resume.

Identity is a real session (require_session) — the recruiter must have
clicked a magic link or signed in with Google for *that* email, so the
domain-match check below (reusing the founder-registration verification
from services/company_verification.py) runs against a proven mailbox, not
a client-supplied string anyone could type. Before this, typing
`hr@razorpay.com` with no proof at all was enough to unlock real
candidates' resumes.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_session
from app.db.session import get_db
from app.models.domain import CandidateUnlock, Company, Resume, User
from app.schemas import (
    CandidateProfileRead,
    CandidateSearchResult,
    RecruiterIdentifyResponse,
)
from app.services.company_verification import extract_domain

router = APIRouter(prefix="/recruiters", tags=["recruiters"])


async def _verify_recruiter(db: AsyncSession, email: str) -> Company:
    """Returns the Company this session-verified email belongs to, or 403s."""
    normalized = email.strip().lower()
    email_domain = extract_domain(normalized)

    result = await db.execute(select(Company).where(Company.submitted_by_email == normalized))
    company = result.scalar_one_or_none()
    if company is not None:
        return company

    if email_domain:
        result = await db.execute(select(Company).where(Company.website_url.isnot(None)))
        for candidate in result.scalars().all():
            if extract_domain(candidate.website_url) == email_domain:
                return candidate

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="No registered company matches this email. Register your company first at /register.",
    )


@router.post(
    "/identify",
    response_model=RecruiterIdentifyResponse,
    summary="Verify the signed-in user's email against a registered company's domain",
)
async def identify(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_session)],
) -> RecruiterIdentifyResponse:
    company = await _verify_recruiter(db, current_user.email)
    return RecruiterIdentifyResponse(company_id=company.id, company_name=company.name)


@router.get(
    "/candidates",
    response_model=list[CandidateSearchResult],
    summary="Search job-seeker profiles matching a role/experience/work-mode combo",
)
async def search_candidates(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_session)],
    role: str | None = Query(None, description="Matched against target roles and skills"),
    city: str | None = Query(None),
    work_mode: str | None = Query(None),
    experience_min: int | None = Query(None, ge=0),
    experience_max: int | None = Query(None, ge=0),
    notice_period: str | None = Query(None, description="Exact match, e.g. 'immediate'"),
    verified_only: bool = Query(False, description="Only candidates with at least one verified link"),
    limit: int = Query(30, ge=1, le=100),
) -> list[CandidateSearchResult]:
    company = await _verify_recruiter(db, current_user.email)

    stmt = select(User).where(
        (User.target_roles.isnot(None) | User.skills.isnot(None))
        & User.profile_visible_to_recruiters.is_(True)
    )
    # Every scalar filter is pushed into SQL so the query doesn't pull the
    # whole users table into Python and filter it in memory. Only the role/
    # skill keyword match — which spans two JSONB arrays — stays in Python.
    if city:
        stmt = stmt.where(User.preferred_cities.contains([city]))
    if work_mode:
        stmt = stmt.where(User.preferred_work_mode == work_mode)
    if notice_period:
        stmt = stmt.where(User.notice_period == notice_period)
    if experience_min is not None:
        stmt = stmt.where(func.coalesce(User.experience_years, 0) >= experience_min)
    if experience_max is not None:
        stmt = stmt.where(func.coalesce(User.experience_years, 0) <= experience_max)
    if verified_only:
        stmt = stmt.where(or_(User.github_verified, User.linkedin_verified, User.leetcode_verified))

    result = await db.execute(stmt)
    candidates = list(result.scalars().all())

    result = await db.execute(select(CandidateUnlock.user_id).where(CandidateUnlock.company_id == company.id))
    unlocked_ids = {row[0] for row in result.all()}

    result = await db.execute(
        select(Resume.user_id, Resume.ats_score)
        .where(Resume.ats_score.isnot(None))
        .order_by(Resume.analyzed_at.desc())
    )
    latest_ats_score: dict[int, int] = {}
    for user_id, ats_score in result.all():
        latest_ats_score.setdefault(user_id, ats_score)

    role_terms = [t.strip().lower() for t in (role or "").split() if t.strip()]

    def matches(candidate: User) -> bool:
        # Only the role/skill keyword overlap is left to evaluate in Python —
        # all the scalar filters were applied in the SQL query above.
        if role_terms:
            haystack = " ".join((candidate.target_roles or []) + (candidate.skills or [])).lower()
            if not any(term in haystack for term in role_terms):
                return False
        return True

    def score(candidate: User) -> int:
        haystack = " ".join((candidate.target_roles or []) + (candidate.skills or [])).lower()
        role_hits = sum(1 for term in role_terms if term in haystack)
        has_resume = 1 if candidate.id in latest_ats_score else 0
        verified_count = sum([candidate.github_verified, candidate.linkedin_verified, candidate.leetcode_verified])
        return role_hits * 10 + has_resume * 5 + verified_count * 2

    filtered = [c for c in candidates if matches(c)]
    filtered.sort(key=score, reverse=True)

    return [
        CandidateSearchResult(
            id=c.id,
            target_roles=c.target_roles or [],
            preferred_cities=c.preferred_cities or [],
            preferred_work_mode=c.preferred_work_mode,
            experience_years=c.experience_years,
            notice_period=c.notice_period,
            skills=c.skills or [],
            ats_score=latest_ats_score.get(c.id),
            github_verified=c.github_verified,
            linkedin_verified=c.linkedin_verified,
            leetcode_verified=c.leetcode_verified,
            already_unlocked=c.id in unlocked_ids,
        )
        for c in filtered[:limit]
    ]


@router.post(
    "/candidates/{user_id}/unlock",
    response_model=CandidateProfileRead,
    summary="Unlock a candidate's full profile and resume (free, sign-in gated)",
)
async def unlock_candidate(
    user_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_session)],
) -> CandidateProfileRead:
    company = await _verify_recruiter(db, current_user.email)

    candidate = await db.get(User, user_id)
    if candidate is None or not candidate.profile_visible_to_recruiters:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found.")

    stmt = (
        pg_insert(CandidateUnlock)
        .values(company_id=company.id, user_id=user_id, unlocked_by_email=current_user.email)
        .on_conflict_do_nothing(index_elements=["company_id", "user_id"])
    )
    await db.execute(stmt)
    await db.commit()

    result = await db.execute(
        select(Resume)
        .where(Resume.user_id == user_id)
        .order_by(Resume.analyzed_at.desc().nullslast(), Resume.uploaded_at.desc())
        .limit(1)
    )
    resume = result.scalar_one_or_none()

    return CandidateProfileRead(
        id=candidate.id,
        full_name=candidate.full_name,
        email=candidate.email,
        target_roles=candidate.target_roles or [],
        preferred_cities=candidate.preferred_cities or [],
        preferred_work_mode=candidate.preferred_work_mode,
        experience_years=candidate.experience_years,
        notice_period=candidate.notice_period,
        skills=candidate.skills or [],
        github_url=candidate.github_url,
        linkedin_url=candidate.linkedin_url,
        leetcode_url=candidate.leetcode_url,
        github_verified=candidate.github_verified,
        linkedin_verified=candidate.linkedin_verified,
        leetcode_verified=candidate.leetcode_verified,
        resume_id=resume.id if resume else None,
        ats_score=resume.ats_score if resume else None,
        ats_summary=resume.ats_summary if resume else None,
        ats_suggestions=resume.ats_suggestions if resume else None,
    )
