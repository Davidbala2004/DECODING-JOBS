"""SendGrid Inbound Parse webhook: turns a forwarded interview email into a
Kanban board update.

Setup once a domain exists: point that domain's MX record at SendGrid, create
an Inbound Parse route for it targeting a URL of the form
https://{SENDGRID_INBOUND_USERNAME}:{SENDGRID_INBOUND_PASSWORD}@{api-host}
/api/v1/emails/inbound — this is SendGrid's own documented way to secure an
Inbound Parse route (it has no request-signing like their separate Event
Webhook does) — and set INBOUND_EMAIL_DOMAIN. Until then this endpoint is
fully testable by simulating SendGrid's POST directly (see README).
"""

import logging
import re
import secrets
from email.utils import parseaddr
from typing import Annotated

from fastapi import APIRouter, Depends, Form, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.security import require_session
from app.db.session import get_db
from app.models.domain import Application, ApplicationStatus, EmailEvent, Job, User
from app.schemas import EmailEventRead
from app.services.email_parser import extract_interview_signal

logger = logging.getLogger("decoding_jobs.core_api.emails")

router = APIRouter(prefix="/emails", tags=["emails"])

# auto_error=False: an unconfigured deployment (no Basic Auth credentials set)
# must still be testable without sending an Authorization header at all.
_basic_auth = HTTPBasic(auto_error=False)


def _verify_webhook_auth(credentials: HTTPBasicCredentials | None) -> None:
    """Constant-time Basic Auth check against SENDGRID_INBOUND_USERNAME/PASSWORD.

    A plain `==` comparison leaks timing information proportional to how many
    leading characters match, which is enough to brute-force a secret one
    byte at a time — secrets.compare_digest runs in constant time regardless.
    """
    settings = get_settings()
    if not settings.SENDGRID_INBOUND_USERNAME or not settings.SENDGRID_INBOUND_PASSWORD:
        # Not configured yet (no domain/SendGrid setup) — stays open so the
        # webhook remains testable via the curl example in the README.
        return

    valid = bool(credentials) and secrets.compare_digest(
        credentials.username, settings.SENDGRID_INBOUND_USERNAME
    ) and secrets.compare_digest(credentials.password, settings.SENDGRID_INBOUND_PASSWORD)

    if not valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook credentials",
            headers={"WWW-Authenticate": "Basic"},
        )

# Forward progress only — an email must never move a card backwards, except
# 'rejected' which is terminal and always applies.
_STATUS_RANK = {
    ApplicationStatus.SAVED: 0,
    ApplicationStatus.APPLIED: 1,
    ApplicationStatus.INTERVIEW: 2,
    ApplicationStatus.OFFER: 3,
    ApplicationStatus.VIEWED: 1,
    ApplicationStatus.REJECTED: -1,  # rank irrelevant — handled as a special case below
}


def _extract_token(to_address: str) -> str | None:
    """Pulls the forwarding token out of `u-{token}@anything`."""
    _, addr = parseaddr(to_address)
    match = re.match(r"^u-([a-f0-9]{8,32})@", addr, re.IGNORECASE)
    return match.group(1) if match else None


def _domain_of(address_or_url: str | None) -> str | None:
    if not address_or_url:
        return None
    _, addr = parseaddr(address_or_url)
    if "@" in addr:
        return addr.rsplit("@", 1)[-1].lower()
    # Might already be a bare URL like https://razorpay.com
    match = re.search(r"https?://(?:www\.)?([^/]+)", address_or_url)
    return match.group(1).lower() if match else None


async def _find_matching_application(
    db: AsyncSession, user: User, from_address: str, extracted_company: str | None
) -> Application | None:
    """Finds exactly one of the user's applications this email is about, or None."""
    result = await db.execute(
        select(Application)
        .options(selectinload(Application.job).selectinload(Job.company))
        .where(Application.user_id == user.id)
    )
    applications = list(result.scalars().all())
    if not applications:
        return None

    sender_domain = _domain_of(from_address)
    if sender_domain:
        domain_matches = [
            app
            for app in applications
            if _domain_of(app.job.company.website_url) == sender_domain
        ]
        if len(domain_matches) == 1:
            return domain_matches[0]

    if extracted_company:
        name_matches = [
            app
            for app in applications
            if extracted_company.strip().lower() in app.job.company.name.lower()
            or app.job.company.name.lower() in extracted_company.strip().lower()
        ]
        if len(name_matches) == 1:
            return name_matches[0]

    return None


@router.post(
    "/inbound",
    status_code=status.HTTP_200_OK,
    summary="SendGrid Inbound Parse webhook target — forwarded interview emails land here",
)
async def receive_inbound_email(
    db: Annotated[AsyncSession, Depends(get_db)],
    to: Annotated[str, Form()],
    subject: Annotated[str, Form()] = "",
    text: Annotated[str, Form()] = "",
    from_: Annotated[str, Form(alias="from")] = "",
    credentials: Annotated[HTTPBasicCredentials | None, Depends(_basic_auth)] = None,
) -> dict:
    _verify_webhook_auth(credentials)

    forwarding_token = _extract_token(to)
    if not forwarding_token:
        logger.warning("Inbound email to %r has no recognizable forwarding token", to)
        return {"status": "ignored", "reason": "no forwarding token in recipient"}

    user_result = await db.execute(select(User).where(User.forwarding_token == forwarding_token))
    user = user_result.scalar_one_or_none()
    if user is None:
        logger.warning("Inbound email forwarding token %r matched no user", forwarding_token)
        return {"status": "ignored", "reason": "unknown forwarding token"}

    signal = await extract_interview_signal(subject, text)

    application = await _find_matching_application(db, user, from_, signal["company_name"])

    event = EmailEvent(
        user_id=user.id,
        application_id=application.id if application else None,
        from_address=from_[:500] if from_ else None,
        subject=subject[:500] if subject else None,
        raw_text=text[:5000] if text else None,
        extracted_company=signal["company_name"],
        extracted_round=signal["round_number"],
        extracted_stage_label=signal["stage_label"],
        extracted_status=signal["status"],
        matched=application is not None,
    )
    db.add(event)

    if application is not None:
        if signal["round_number"] and (application.interview_round or 0) < signal["round_number"]:
            application.interview_round = signal["round_number"]

        if signal["status"]:
            new_status = ApplicationStatus(signal["status"])
            if new_status == ApplicationStatus.REJECTED:
                application.status = new_status
            elif _STATUS_RANK.get(new_status, -1) > _STATUS_RANK.get(application.status, -1):
                application.status = new_status
                if new_status == ApplicationStatus.INTERVIEW and application.interview_round is None:
                    application.interview_round = 1

    await db.commit()

    return {"status": "processed", "matched": application is not None}


@router.get(
    "/unmatched",
    response_model=list[EmailEventRead],
    summary="List the signed-in user's forwarded emails the parser couldn't attach",
)
async def list_unmatched(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_session)],
) -> list[EmailEvent]:
    """Identity comes from the session, not a query-string email.

    Previously this took `email` as a query parameter and looked the user up
    by it — so anyone could pass someone else's address and read their
    forwarded interview emails (subjects, senders, raw bodies). It also
    created a user row on a GET as a side effect. Both are gone.
    """
    result = await db.execute(
        select(EmailEvent)
        .where(EmailEvent.user_id == current_user.id, EmailEvent.matched.is_(False))
        .order_by(EmailEvent.created_at.desc())
    )
    return list(result.scalars().all())
