"""Job-related API routes: listing active postings and fetching a single job."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, or_, distinct
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from pydantic import BaseModel, ConfigDict

from app.core.security import require_ingestion_key
from app.db.session import get_db
from app.models.domain import Job, Company, EmploymentType, WorkMode
from app.schemas import JobRead, JobWithCompanyRead
from app.services.company_verification import verify_founder_domain

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get(
    "/search",
    summary="Search jobs by role/skill and return matching companies",
)
async def search_jobs(
    db: Annotated[AsyncSession, Depends(get_db)],
    q: str = Query(..., min_length=1, description="Search query"),
    city: str | None = Query(None),
    limit: int = Query(20, ge=1, le=50),
) -> list[dict]:
    """Full-text search across job titles and descriptions.
    Returns companies with matching jobs for the map."""
    pattern = f"%{q}%"

    # Single query: JOIN jobs + companies, get lat/lng via ST_X/ST_Y
    stmt = (
        select(
            Company.id.label("company_id"),
            Company.name.label("company_name"),
            Company.city,
            Company.sector,
            Company.area,
            Company.website_url,
            Company.logo_url,
            func.ST_Y(Company.location).label("latitude"),
            func.ST_X(Company.location).label("longitude"),
            Job.id.label("job_id"),
            Job.title.label("job_title"),
            Job.work_mode,
            Job.apply_url,
            Job.salary_min,
            Job.salary_max,
            Job.source,
        )
        .join(Job, Job.company_id == Company.id)
        .where(Job.is_active.is_(True))
        .where(or_(Job.title.ilike(pattern), Job.description.ilike(pattern)))
    )
    if city:
        stmt = stmt.where(Company.city == city)
    stmt = stmt.order_by(Company.name, Job.title).limit(limit)

    result = await db.execute(stmt)
    rows = result.all()

    # Group by company
    company_map: dict[int, dict] = {}
    for row in rows:
        cid = row.company_id
        if cid not in company_map:
            # Count total active jobs for this company
            count_stmt = select(func.count(Job.id)).where(
                Job.company_id == cid, Job.is_active.is_(True)
            )
            count_result = await db.execute(count_stmt)
            total = count_result.scalar() or 0

            company_map[cid] = {
                "company_id": cid,
                "company_name": row.company_name,
                "city": row.city,
                "sector": row.sector,
                "area": row.area,
                "latitude": float(row.latitude) if row.latitude else None,
                "longitude": float(row.longitude) if row.longitude else None,
                "website_url": row.website_url,
                "logo_url": row.logo_url,
                "active_job_count": total,
                "matching_jobs": [],
            }
        company_map[cid]["matching_jobs"].append({
            "id": row.job_id,
            "title": row.job_title,
            "work_mode": row.work_mode.value if row.work_mode else None,
            "apply_url": row.apply_url,
            "salary_min": row.salary_min,
            "salary_max": row.salary_max,
            "source": row.source,
        })

    return list(company_map.values())


@router.get(
    "/suggestions",
    summary="Autocomplete suggestions for job role search",
)
async def job_suggestions(
    db: Annotated[AsyncSession, Depends(get_db)],
    q: str = Query(..., min_length=1),
    city: str | None = Query(None),
    limit: int = Query(8, ge=1, le=15),
) -> list[dict]:
    """Returns unique job titles matching the query for autocomplete dropdown."""
    pattern = f"%{q}%"
    stmt = (
        select(distinct(Job.title))
        .join(Company, Job.company_id == Company.id)
        .where(Job.is_active.is_(True))
        .where(Job.title.ilike(pattern))
    )
    if city:
        stmt = stmt.where(Company.city == city)
    stmt = stmt.order_by(Job.title).limit(limit)

    result = await db.execute(stmt)
    return [{"title": row[0]} for row in result.all()]


@router.get(
    "",
    response_model=list[JobRead],
    summary="List active job postings, optionally filtered by company",
)
async def list_active_jobs(
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: Annotated[
        int | None, Query(description="Restrict results to a single company's jobs")
    ] = None,
) -> list[Job]:
    """Returns every job currently marked active, newest first."""
    stmt = select(Job).where(Job.is_active.is_(True))
    if company_id is not None:
        stmt = stmt.where(Job.company_id == company_id)
    stmt = stmt.order_by(Job.created_at.desc())

    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.get(
    "/{job_id}",
    response_model=JobWithCompanyRead,
    summary="Get a single job posting by ID",
)
async def get_job(
    job_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Job:
    """Returns full job detail with its parent company embedded."""
    stmt = select(Job).options(selectinload(Job.company)).where(Job.id == job_id)
    result = await db.execute(stmt)
    job = result.scalar_one_or_none()

    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job {job_id} not found",
        )

    return job


class JobSeedRequest(BaseModel):
    """Request body for seeding a job from the scraper."""
    model_config = ConfigDict(extra="forbid")

    company_id: int
    title: str
    description: str = ""
    employment_type: str = "full_time"
    work_mode: str | None = None
    apply_url: str | None = None
    source: str | None = "manual"
    source_url: str | None = None


@router.post(
    "/seed",
    response_model=JobRead,
    status_code=status.HTTP_201_CREATED,
    summary="Seed (or refresh) a job posting from the ingestion pipeline",
    dependencies=[Depends(require_ingestion_key)],
)
async def seed_job(
    payload: JobSeedRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Job:
    """Insert a job posting, or — if it already exists — bump its `fetched_at` and
    reactivate it. Upserting here (instead of 409-ing on conflict) matters for the
    staleness sweep below: a posting that's still open keeps getting re-confirmed
    by every ingestion run, so it must not look "unrefreshed" and get auto-expired.
    """
    from datetime import datetime, timezone

    existing = await db.execute(
        select(Job).where(
            Job.company_id == payload.company_id,
            Job.title == payload.title,
        )
    )
    job = existing.scalar_one_or_none()

    if job:
        job.is_active = True
        job.fetched_at = datetime.now(timezone.utc)
        job.apply_url = payload.apply_url or job.apply_url
        job.description = payload.description or job.description
    else:
        job = Job(
            company_id=payload.company_id,
            title=payload.title,
            description=payload.description or "No description provided.",
            employment_type=EmploymentType(payload.employment_type),
            work_mode=WorkMode(payload.work_mode) if payload.work_mode else None,
            apply_url=payload.apply_url,
            is_active=True,
            source=payload.source,
            source_url=payload.source_url,
            fetched_at=datetime.now(timezone.utc),
        )
        db.add(job)

    await db.commit()
    await db.refresh(job)

    return job


class JobRegisterRequest(BaseModel):
    """A founder manually posting a role under their own (verified) company."""
    model_config = ConfigDict(extra="forbid")

    founder_email: str
    company_id: int
    title: str
    description: str
    employment_type: str = "full_time"
    work_mode: str | None = None
    salary_min: float | None = None
    salary_max: float | None = None
    apply_url: str | None = None


@router.post(
    "/register",
    response_model=JobRead,
    status_code=status.HTTP_201_CREATED,
    summary="Founder posts a role under their own company (verified by work-email domain)",
)
async def register_job(
    payload: JobRegisterRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Job:
    """Re-verifies the founder's email against the target company's website
    domain on every post — a verified company doesn't let just anyone add
    roles to it, only whoever controls that domain."""
    company = await db.get(Company, payload.company_id)
    if company is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")

    error = verify_founder_domain(payload.founder_email, company.website_url)
    if error:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=error)

    job = Job(
        company_id=company.id,
        title=payload.title.strip(),
        description=payload.description.strip(),
        employment_type=EmploymentType(payload.employment_type),
        work_mode=WorkMode(payload.work_mode) if payload.work_mode else None,
        salary_min=payload.salary_min,
        salary_max=payload.salary_max,
        apply_url=payload.apply_url,
        is_active=True,
        source="founder",
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    return job


@router.post(
    "/expire-stale",
    summary="Mark ingested jobs inactive if they haven't been re-confirmed by a recent run",
    dependencies=[Depends(require_ingestion_key)],
)
async def expire_stale_jobs(
    db: Annotated[AsyncSession, Depends(get_db)],
    days: int = Query(21, ge=1, le=365, description="Inactivity threshold in days"),
) -> dict:
    """Flips `is_active=false` on jobs whose `fetched_at` is older than `days`.

    Only touches pipeline-managed jobs (`fetched_at IS NOT NULL`) — statically
    seeded demo jobs have no `fetched_at` and are never auto-expired, since
    nothing ever re-confirms them. Intended to be called once per ingestion
    run (see scripts/fetch-real-jobs.mjs) so listings that disappeared from
    the source stop looking "live" instead of accumulating forever.
    """
    from datetime import datetime, timedelta, timezone

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    result = await db.execute(
        select(Job).where(
            Job.is_active.is_(True),
            Job.fetched_at.isnot(None),
            Job.fetched_at < cutoff,
        )
    )
    stale_jobs = list(result.scalars().all())
    for job in stale_jobs:
        job.is_active = False

    await db.commit()

    return {"expired_count": len(stale_jobs), "threshold_days": days}
