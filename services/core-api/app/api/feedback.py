"""Tester feedback: a public, rate-limited capture endpoint backed by Postgres.

The private-beta feedback page (feedback/index.html) previously had no backend —
with no `endpoint` configured it fell back to a `mailto:` link addressed to a
placeholder inbox, so real tester submissions were silently lost. This router
gives feedback a durable home in the same database as everything else, plus a
read endpoint so the team can pull every response without an email client.

The POST is intentionally public and unauthenticated (testers hold no account),
so it is rate-limited per client and returns nothing but an acknowledgement.
"""

from __future__ import annotations

import hashlib
import logging
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.ratelimit import RateLimit
from app.core.security import require_ingestion_key
from app.db.session import get_db
from app.models.domain import FeedbackSubmission
from app.services.sendgrid_client import send_email

logger = logging.getLogger("decoding_jobs.core_api.feedback")

router = APIRouter(prefix="/feedback", tags=["feedback"])

# Form field name -> column name. The page's rating inputs are named
# map/search/company/assistant/tracker/auth/overall; each is nullable because a
# tester who never opened a page leaves it blank, and a blank is real signal.
_RATING_FIELDS = {
    "map": "rating_map",
    "search": "rating_search",
    "company": "rating_company",
    "assistant": "rating_assistant",
    "tracker": "rating_tracker",
    "auth": "rating_auth",
    "overall": "rating_overall",
}

_MAX_SHORT = 200
_MAX_TEXT = 5000


def _opt_str(value: Any, limit: int = _MAX_SHORT) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text[:limit] or None


def _opt_rating(value: Any) -> int | None:
    """Ratings arrive as the strings "1".."5"; anything else (including "" from
    an untouched radio group) becomes NULL rather than a wrong number."""
    try:
        n = int(value)
    except (TypeError, ValueError):
        return None
    return n if 1 <= n <= 5 else None


def _truthy(value: Any) -> bool:
    return str(value).strip().lower() in {"yes", "true", "1", "on"}


def _notify_addresses() -> list[str]:
    """Where to email each submission. Comma-separated so a founder can send
    it to more than one inbox; empty means store-only (no email)."""
    raw = get_settings().FEEDBACK_NOTIFY_EMAIL or ""
    return [addr.strip() for addr in raw.split(",") if addr.strip()]


# Pretty labels for the notification email, in the order the form presents them.
_RATING_LABELS = [
    ("Finding companies on the map", "rating_map"),
    ("Searching and filtering", "rating_search"),
    ("Company panel", "rating_company"),
    ("AI assistant", "rating_assistant"),
    ("Application tracker", "rating_tracker"),
    ("Sign up / sign in", "rating_auth"),
    ("Would recommend", "rating_overall"),
]


def _esc(value: Any) -> str:
    """Minimal HTML escaping — feedback is untrusted user input."""
    text = "" if value is None else str(value)
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def _render_feedback_email(sub: dict[str, Any]) -> str:
    rating_rows = "".join(
        f"<tr><td style='padding:2px 12px 2px 0;color:#555'>{_esc(label)}</td>"
        f"<td style='font-weight:600'>{sub.get(key) if sub.get(key) else '—'}</td></tr>"
        for label, key in _RATING_LABELS
    )
    who = sub.get("name") or sub.get("tester") or "(anonymous)"
    return f"""
    <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:640px;color:#111">
      <h2 style="margin:0 0 4px">New tester feedback</h2>
      <p style="margin:0 0 16px;color:#666">#{sub.get('id')} · {_esc(sub.get('created_at'))}</p>

      <p style="margin:0 0 4px"><strong>{_esc(who)}</strong>
        {f"&lt;{_esc(sub.get('email'))}&gt;" if sub.get("email") else ""}</p>
      <p style="margin:0 0 16px;color:#666">
        role: {_esc(sub.get('role')) or '—'} ·
        tester tag: {_esc(sub.get('tester')) or '—'} ·
        quote ok: {'yes' if sub.get('quote_ok') else 'no'}</p>

      <table style="font-size:14px;margin-bottom:16px">{rating_rows}</table>

      <h3 style="margin:0 0 4px">What confused / broke</h3>
      <p style="margin:0 0 16px;white-space:pre-wrap">{_esc(sub.get('confused')) or '(blank)'}</p>

      <h3 style="margin:0 0 4px">What they liked</h3>
      <p style="margin:0 0 16px;white-space:pre-wrap">{_esc(sub.get('liked')) or '(blank)'}</p>

      <h3 style="margin:0 0 4px">Anything else</h3>
      <p style="margin:0 0 16px;white-space:pre-wrap">{_esc(sub.get('anything')) or '(blank)'}</p>
    </div>
    """


async def _email_feedback_notification(subject: str, html: str) -> None:
    for address in _notify_addresses():
        await send_email(to=address, subject=subject, html_content=html)


def _ip_hash(request: Request) -> str | None:
    """Store a salted hash, never the raw IP — enough to spot one submitter
    spamming, without retaining personal network data."""
    forwarded = request.headers.get("x-forwarded-for", "")
    ip = forwarded.split(",")[0].strip() or (request.client.host if request.client else "")
    if not ip:
        return None
    salt = get_settings().INGESTION_API_KEY or "decoding-jobs-feedback"
    return hashlib.sha256(f"{salt}:{ip}".encode()).hexdigest()


@router.post(
    "",
    status_code=201,
    summary="Submit tester feedback (public, rate-limited)",
    dependencies=[Depends(RateLimit(limit=20, window_seconds=3600, scope="feedback"))],
)
async def submit_feedback(
    request: Request,
    background: BackgroundTasks,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    """Accepts the feedback page's JSON body. Unknown keys are preserved in
    `raw` so a new form question is captured before a column exists for it."""
    try:
        payload = await request.json()
    except Exception:
        payload = {}
    if not isinstance(payload, dict):
        payload = {}

    record = FeedbackSubmission(
        tester=_opt_str(payload.get("tester"), 120),
        name=_opt_str(payload.get("name")),
        email=_opt_str(payload.get("email"), 255),
        role=_opt_str(payload.get("role"), 60),
        quote_ok=_truthy(payload.get("quote_ok")),
        confused=_opt_str(payload.get("confusing"), _MAX_TEXT),
        liked=_opt_str(payload.get("liked"), _MAX_TEXT),
        anything=_opt_str(payload.get("anything"), _MAX_TEXT),
        source=_opt_str(payload.get("page"), 40) or "tester-feedback",
        user_agent=request.headers.get("user-agent"),
        ip_hash=_ip_hash(request),
        raw=payload,
    )
    for form_name, column in _RATING_FIELDS.items():
        setattr(record, column, _opt_rating(payload.get(form_name)))

    db.add(record)
    await db.commit()
    await db.refresh(record)

    logger.info(
        "feedback #%s from tester=%s role=%s overall=%s",
        record.id,
        record.tester,
        record.role,
        record.rating_overall,
    )

    # Email each submission to the configured inbox(es). Runs AFTER the response
    # is sent (BackgroundTasks), so a slow or failing SendGrid never delays the
    # tester, and a mail outage still leaves the row safely in Postgres.
    if _notify_addresses():
        summary = {
            "id": record.id,
            "created_at": record.created_at.isoformat() if record.created_at else "",
            "name": record.name,
            "tester": record.tester,
            "email": record.email,
            "role": record.role,
            "quote_ok": record.quote_ok,
            "confused": record.confused,
            "liked": record.liked,
            "anything": record.anything,
            **{key: getattr(record, key) for _, key in _RATING_LABELS},
        }
        who = record.name or record.tester or "anonymous"
        background.add_task(
            _email_feedback_notification,
            f"New tester feedback — {who}",
            _render_feedback_email(summary),
        )

    # Nothing sensitive echoed back — just proof it landed.
    return {"ok": True, "id": record.id}


class FeedbackRead(BaseModel):
    """A stored feedback submission, newest first."""

    id: int
    created_at: datetime
    tester: str | None = None
    name: str | None = None
    email: str | None = None
    role: str | None = None
    quote_ok: bool = False
    rating_map: int | None = None
    rating_search: int | None = None
    rating_company: int | None = None
    rating_assistant: int | None = None
    rating_tracker: int | None = None
    rating_auth: int | None = None
    rating_overall: int | None = None
    confused: str | None = None
    liked: str | None = None
    anything: str | None = None
    source: str = "tester-feedback"

    model_config = {"from_attributes": True}


@router.get(
    "",
    response_model=list[FeedbackRead],
    summary="List stored feedback submissions, newest first (ingestion only)",
    dependencies=[Depends(require_ingestion_key)],
)
async def list_feedback(
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
) -> list[FeedbackSubmission]:
    result = await db.execute(
        select(FeedbackSubmission)
        .order_by(FeedbackSubmission.created_at.desc(), FeedbackSubmission.id.desc())
        .offset(offset)
        .limit(limit)
    )
    return list(result.scalars().all())


@router.get(
    "/summary",
    summary="Aggregate feedback totals (ingestion only)",
    dependencies=[Depends(require_ingestion_key)],
)
async def feedback_summary(db: Annotated[AsyncSession, Depends(get_db)]) -> dict[str, Any]:
    """Averages per rating plus the response count — the number a founder reads
    first. Blanks are excluded from each average (they mean "never got to it")."""
    from sqlalchemy import func

    columns = {
        "map": FeedbackSubmission.rating_map,
        "search": FeedbackSubmission.rating_search,
        "company": FeedbackSubmission.rating_company,
        "assistant": FeedbackSubmission.rating_assistant,
        "tracker": FeedbackSubmission.rating_tracker,
        "auth": FeedbackSubmission.rating_auth,
        "overall": FeedbackSubmission.rating_overall,
    }
    result = await db.execute(
        select(
            func.count(FeedbackSubmission.id),
            *[func.avg(col).label(name) for name, col in columns.items()],
        )
    )
    row = result.one()
    return {
        "responses": row[0],
        "averages": {
            name: (round(float(row[i + 1]), 2) if row[i + 1] is not None else None)
            for i, name in enumerate(columns)
        },
    }
