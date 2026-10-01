"""Job-alert sweep: for every saved search with email alerts enabled, finds
jobs matching its filters posted since the search was last checked, and
emails the owner. Meant to be triggered on a schedule (same pattern as
POST /jobs/expire-stale) — not called by the frontend directly.
"""

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import require_ingestion_key
from app.db.session import get_db
from app.models.domain import Company, Job, SavedSearch, User
from app.services.sendgrid_client import send_email

router = APIRouter(prefix="/alerts", tags=["alerts"])


# Same stage -> company-type buckets the map's /companies/types endpoint and
# the filter dropdown use, so a saved `company_type` means the same thing in
# an alert email as it does on the map.
_COMPANY_TYPE_STAGES = {
    "Startup": {"Seed", "Early Stage"},
    "Growth": {"Series A", "Series B", "Growth"},
    "Public": {"Public"},
}


def _matches_filters(job: Job, filters: dict) -> bool:
    """Does this job match a saved search's stored filters?

    Mirrors the shape MapWorkspace saves (`SavedSearchFilters`). Kept in sync
    deliberately: a filter the map honours but this ignores means an alert
    emails jobs the user's saved search would never have shown them.

    `hiring_only` needs no explicit check here — every candidate job is
    already `is_active`, so the company necessarily has a live role.
    """
    company = job.company
    if filters.get("city") and company.city != filters["city"]:
        return False
    if filters.get("sector") and company.sector != filters["sector"]:
        return False
    if filters.get("stage") and company.stage != filters["stage"]:
        return False
    if filters.get("area") and company.area != filters["area"]:
        return False
    company_type = filters.get("company_type")
    if company_type:
        if company_type == "Other":
            if company.stage in {s for stages in _COMPANY_TYPE_STAGES.values() for s in stages}:
                return False
        elif company.stage not in _COMPANY_TYPE_STAGES.get(company_type, set()):
            return False
    if filters.get("department") and job.department != filters["department"]:
        return False
    work_mode = filters.get("work_mode")
    if work_mode and (job.work_mode is None or job.work_mode.value != work_mode):
        return False
    # The map's role search matches title OR description (see /jobs/search), so
    # an alert on a description keyword must too.
    query = filters.get("q")
    if query:
        needle = query.lower()
        if needle not in job.title.lower() and needle not in (job.description or "").lower():
            return False
    return True


def _render_alert_email(label: str, jobs: list[Job]) -> str:
    rows = "".join(
        f"<li><strong>{job.title}</strong> at {job.company.name} ({job.company.city or 'India'})</li>"
        for job in jobs
    )
    return (
        f"<p>New jobs matching your saved search <strong>{label}</strong>:</p>"
        f"<ul>{rows}</ul>"
        f"<p>— DECODING JOBS</p>"
    )


@router.post(
    "/run",
    summary="Sweep saved searches with alerts enabled and email matching new jobs",
    dependencies=[Depends(require_ingestion_key)],
)
async def run_alert_sweep(db: Annotated[AsyncSession, Depends(get_db)]) -> dict:
    now = datetime.now(timezone.utc)

    result = await db.execute(
        select(SavedSearch)
        .where(SavedSearch.email_alerts_enabled.is_(True))
        .options(selectinload(SavedSearch.user))
    )
    saved_searches = list(result.scalars().all())

    result = await db.execute(
        select(Job).where(Job.is_active.is_(True)).options(selectinload(Job.company))
    )
    active_jobs = list(result.scalars().all())

    emails_sent = 0
    for saved_search in saved_searches:
        since = saved_search.last_checked_at
        candidates = [j for j in active_jobs if since is None or j.created_at > since]
        matches = [j for j in candidates if _matches_filters(j, saved_search.filters or {})]

        if matches:
            sent = await send_email(
                to=saved_search.user.email,
                subject=f"{len(matches)} new job(s) match '{saved_search.label}'",
                html_content=_render_alert_email(saved_search.label, matches),
            )
            if sent:
                emails_sent += 1

        saved_search.last_checked_at = now

    await db.commit()

    return {
        "saved_searches_checked": len(saved_searches),
        "emails_sent": emails_sent,
    }
