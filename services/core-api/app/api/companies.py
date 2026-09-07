"""Company-related API routes: viewport-driven map search with filters."""

from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_ingestion_key
from app.db.session import get_db
from app.models.domain import Company, Job
from app.schemas import CompanyRead
from app.services.company_verification import verify_founder_domain
from app.services.geo import city_center_with_jitter

router = APIRouter(prefix="/companies", tags=["companies"])

# How fresh a job posting has to be for its company's pin to flash "hiring now".
RECENT_HIRING_DAYS = 3


@router.get(
    "/search",
    response_model=list[CompanyRead],
    summary="Find companies whose pin falls inside a map viewport",
)
async def search_companies(
    db: Annotated[AsyncSession, Depends(get_db)],
    min_lat: float = Query(..., ge=-90, le=90, description="Southwest corner latitude"),
    min_lng: float = Query(..., ge=-180, le=180, description="Southwest corner longitude"),
    max_lat: float = Query(..., ge=-90, le=90, description="Northeast corner latitude"),
    max_lng: float = Query(..., ge=-180, le=180, description="Northeast corner longitude"),
    sector: str | None = Query(None, description="Filter by sector (AI, SaaS, Fintech, etc.)"),
    city: str | None = Query(None, description="Filter by city (Bengaluru, Chennai, etc.)"),
    hiring_only: bool | None = Query(None, description="Only return companies with active jobs"),
    stage: str | None = Query(None, description="Filter by stage (Seed, Growth, Public, etc.)"),
    area: str | None = Query(None, description="Filter by area (Koramangala, HSR Layout, etc.)"),
    company_type: str | None = Query(None, description="Filter by computed type (Startup, Growth, Public, Other)"),
) -> list[Company]:
    """Returns every company located inside the given lat/lng bounding box.

    Supports optional filters for sector, city, and hiring status.
    Powers the map's viewport-driven pin loading.
    """
    if min_lat >= max_lat:
        raise HTTPException(status_code=422, detail="min_lat must be less than max_lat")
    if min_lng >= max_lng:
        raise HTTPException(status_code=422, detail="min_lng must be less than max_lng")

    envelope = func.ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)
    stmt = select(Company).where(func.ST_Within(Company.location, envelope))

    # Apply optional filters.
    if sector:
        stmt = stmt.where(Company.sector == sector)
    if city:
        stmt = stmt.where(Company.city == city)
    if hiring_only:
        # Subquery: companies that have at least one active job.
        hiring_subq = (
            select(Job.company_id)
            .where(Job.is_active.is_(True))
            .distinct()
        )
        stmt = stmt.where(Company.id.in_(hiring_subq))
    if stage:
        stmt = stmt.where(Company.stage == stage)
    if area:
        stmt = stmt.where(Company.area == area)
    if company_type:
        # Map computed type back to stage values for filtering
        if company_type == 'Startup':
            stmt = stmt.where(Company.stage.in_(['Seed', 'Early Stage']))
        elif company_type == 'Growth':
            stmt = stmt.where(Company.stage.in_(['Series A', 'Series B', 'Growth']))
        elif company_type == 'Public':
            stmt = stmt.where(Company.stage == 'Public')
        elif company_type == 'Other':
            stmt = stmt.where(Company.stage.notin_(['Seed', 'Early Stage', 'Series A', 'Series B', 'Growth', 'Public']))

    result = await db.execute(stmt)
    companies = list(result.scalars().all())

    # Annotate each company with its active job count + "hiring freshness"
    # for the frontend (job posted in the last 3 days gets a flash on the pin).
    recent_cutoff = datetime.now(timezone.utc) - timedelta(days=RECENT_HIRING_DAYS)
    for company in companies:
        count_result = await db.execute(
            select(func.count(Job.id)).where(
                Job.company_id == company.id,
                Job.is_active.is_(True),
            )
        )
        company._active_job_count = count_result.scalar() or 0

        recent_result = await db.execute(
            select(func.count(Job.id)).where(
                Job.company_id == company.id,
                Job.is_active.is_(True),
                Job.created_at >= recent_cutoff,
            )
        )
        company._recently_hiring = (recent_result.scalar() or 0) > 0

    return companies


@router.get(
    "/sectors",
    summary="Get distinct sector values for filter dropdown",
)
async def list_sectors(
    db: Annotated[AsyncSession, Depends(get_db)],
    city: str | None = Query(None, description="Scope counts to a single city"),
) -> list[dict]:
    """Returns the list of distinct sectors with company counts."""
    stmt = select(Company.sector, func.count(Company.id)).where(Company.sector.isnot(None))
    if city:
        stmt = stmt.where(Company.city == city)
    stmt = stmt.group_by(Company.sector).order_by(func.count(Company.id).desc())
    result = await db.execute(stmt)
    return [{"sector": row[0], "count": row[1]} for row in result.all()]


@router.get(
    "/stages",
    summary="Get distinct stage values for filter dropdown",
)
async def list_stages(
    db: Annotated[AsyncSession, Depends(get_db)],
    city: str | None = Query(None, description="Scope counts to a single city"),
) -> list[dict]:
    """Returns the list of distinct stages with company counts."""
    stmt = select(Company.stage, func.count(Company.id)).where(Company.stage.isnot(None))
    if city:
        stmt = stmt.where(Company.city == city)
    stmt = stmt.group_by(Company.stage).order_by(func.count(Company.id).desc())
    result = await db.execute(stmt)
    return [{"stage": row[0], "count": row[1]} for row in result.all()]


@router.get(
    "/areas",
    summary="Get distinct area values for filter dropdown",
)
async def list_areas(
    db: Annotated[AsyncSession, Depends(get_db)],
    city: str | None = Query(None, description="Filter areas by city"),
) -> list[dict]:
    """Returns the list of distinct areas with company counts."""
    stmt = select(Company.area, func.count(Company.id)).where(Company.area.isnot(None))
    if city:
        stmt = stmt.where(Company.city == city)
    stmt = stmt.group_by(Company.area).order_by(func.count(Company.id).desc())
    result = await db.execute(stmt)
    return [{"area": row[0], "count": row[1]} for row in result.all()]


@router.get(
    "/types",
    summary="Get company types (Startup / Growth / Public) for filter",
)
async def list_types(
    db: Annotated[AsyncSession, Depends(get_db)],
    city: str | None = Query(None, description="Filter by city"),
) -> list[dict]:
    """Returns company type categories with counts."""
    stmt = (
        select(
            case(
                (Company.stage.in_(['Seed', 'Early Stage']), 'Startup'),
                (Company.stage.in_(['Series A', 'Series B', 'Growth']), 'Growth'),
                (Company.stage == 'Public', 'Public'),
                else_='Other',
            ).label('company_type'),
            func.count(Company.id),
        )
        .group_by('company_type')
        .order_by(func.count(Company.id).desc())
    )
    if city:
        stmt = stmt.where(Company.city == city)
    result = await db.execute(stmt)
    return [{"type": row[0], "count": row[1]} for row in result.all()]


@router.get(
    "/cities",
    summary="Get distinct city values for city toggle",
)
async def list_cities(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[dict]:
    """Returns the list of distinct cities with company + hiring counts.

    `hiring_count` is computed globally (not scoped to the current map
    viewport) so the zoomed-out city cluster pins show an accurate hiring
    badge for every city, not just whichever one happens to be selected.
    """
    hiring_company_ids = (
        select(Job.company_id).where(Job.is_active.is_(True)).distinct().subquery()
    )
    result = await db.execute(
        select(
            Company.city,
            func.count(Company.id),
            func.count(case((Company.id.in_(select(hiring_company_ids.c.company_id)), 1))),
        )
        .where(Company.city.isnot(None))
        .group_by(Company.city)
        .order_by(func.count(Company.id).desc())
    )
    return [{"city": row[0], "count": row[1], "hiring_count": row[2]} for row in result.all()]


@router.get(
    "/{company_id}",
    response_model=CompanyRead,
    summary="Get a single company by ID",
)
async def get_company(
    company_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Company:
    """Returns full company detail, including Company Pulse sentiment, for the slide-over panel."""
    company = await db.get(Company, company_id)

    if company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Company {company_id} not found",
        )

    # Annotate with active job count + hiring freshness.
    count_result = await db.execute(
        select(func.count(Job.id)).where(
            Job.company_id == company.id,
            Job.is_active.is_(True),
        )
    )
    company._active_job_count = count_result.scalar() or 0

    recent_cutoff = datetime.now(timezone.utc) - timedelta(days=RECENT_HIRING_DAYS)
    recent_result = await db.execute(
        select(func.count(Job.id)).where(
            Job.company_id == company.id,
            Job.is_active.is_(True),
            Job.created_at >= recent_cutoff,
        )
    )
    company._recently_hiring = (recent_result.scalar() or 0) > 0

    return company


# ---------------------------------------------------------------------------
# Seed endpoint (used by the LinkedIn scraper)
# ---------------------------------------------------------------------------


class CompanySeedRequest(BaseModel):
    """Request body for seeding a company from the scraper."""

    name: str
    description: str | None = None
    address: str
    latitude: float
    longitude: float
    sector: str | None = None
    stage: str | None = None
    area: str | None = None
    city: str | None = None
    linkedin_url: str | None = None
    jobs_url: str | None = None
    website_url: str | None = None
    status: str | None = "active"


@router.post(
    "/seed",
    response_model=CompanyRead,
    status_code=status.HTTP_201_CREATED,
    summary="Seed a company from the scraper (upsert by name)",
    dependencies=[Depends(require_ingestion_key)],
)
async def seed_company(
    payload: CompanySeedRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Company:
    """Insert or update a company. Used by the LinkedIn scraper to populate real data."""
    from geoalchemy2.shape import from_shape
    from shapely.geometry import Point

    # Check if company already exists.
    existing = await db.execute(
        select(Company).where(Company.name == payload.name)
    )
    company = existing.scalar_one_or_none()

    if company:
        # Update existing company. Fields the payload doesn't carry are left
        # untouched (`or company.X`) so a partial re-seed can't blank out data.
        company.description = payload.description or company.description
        company.sector = payload.sector or company.sector
        company.stage = payload.stage or company.stage
        company.area = payload.area or company.area
        company.city = payload.city or company.city
        company.linkedin_url = payload.linkedin_url or company.linkedin_url
        company.jobs_url = payload.jobs_url or company.jobs_url
        company.website_url = payload.website_url or company.website_url
        company.status = payload.status or company.status
        if payload.latitude and payload.longitude:
            company.location = from_shape(Point(payload.longitude, payload.latitude), srid=4326)
    else:
        # Create new company.
        company = Company(
            name=payload.name,
            description=payload.description,
            address=payload.address,
            location=from_shape(Point(payload.longitude, payload.latitude), srid=4326),
            sector=payload.sector,
            stage=payload.stage,
            area=payload.area,
            city=payload.city,
            linkedin_url=payload.linkedin_url,
            jobs_url=payload.jobs_url,
            website_url=payload.website_url,
            status=payload.status,
        )
        db.add(company)

    await db.commit()
    await db.refresh(company)

    company._active_job_count = 0
    return company


# ---------------------------------------------------------------------------
# Founder self-registration (public — verified by work-email domain match)
# ---------------------------------------------------------------------------


class CompanyRegisterRequest(BaseModel):
    """A founder listing their own startup on the map."""

    founder_email: str
    name: str
    website_url: str
    description: str | None = None
    sector: str | None = None
    stage: str | None = None
    city: str | None = None
    area: str | None = None
    street_address: str | None = None
    # Exact office coordinates, if the founder supplies them (e.g. copied from
    # Google Maps). Falls back to a jittered city-center pin when omitted.
    latitude: float | None = Field(None, ge=-90, le=90)
    longitude: float | None = Field(None, ge=-180, le=180)
    team_size: str | None = None
    founded_year: int | None = None
    linkedin_url: str | None = None


@router.post(
    "/register",
    response_model=CompanyRead,
    status_code=status.HTTP_201_CREATED,
    summary="Founder self-registers their startup (verified by work-email domain)",
)
async def register_company(
    payload: CompanyRegisterRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Company:
    """Publishes immediately if the founder's email domain matches their
    company's website — no admin queue. Rejects free-email addresses and
    domain mismatches outright (see app.services.company_verification)."""
    from geoalchemy2.shape import from_shape
    from shapely.geometry import Point

    error = verify_founder_domain(payload.founder_email, payload.website_url)
    if error:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=error)

    existing = await db.execute(
        select(Company).where(func.lower(Company.name) == payload.name.strip().lower())
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A company with this name is already listed. Contact us if this is your "
            "company and needs updating.",
        )

    # Use the founder's exact coordinates when given; otherwise place them at
    # a jittered point near their city's center so the pin is at least
    # roughly right until they can supply a precise location.
    if payload.latitude is not None and payload.longitude is not None:
        latitude, longitude = payload.latitude, payload.longitude
    else:
        latitude, longitude = city_center_with_jitter(payload.city, seed=payload.name)

    address = payload.street_address or (
        f"{payload.area}, {payload.city}" if payload.area else (payload.city or "India")
    )

    company = Company(
        name=payload.name.strip(),
        description=payload.description,
        address=address,
        location=from_shape(Point(longitude, latitude), srid=4326),
        sector=payload.sector,
        stage=payload.stage,
        area=payload.area,
        city=payload.city,
        founded_year=payload.founded_year,
        team_size=payload.team_size,
        linkedin_url=payload.linkedin_url,
        website_url=payload.website_url,
        status="active",
        submitted_by_email=payload.founder_email,
    )
    db.add(company)
    await db.commit()
    await db.refresh(company)

    company._active_job_count = 0
    return company
