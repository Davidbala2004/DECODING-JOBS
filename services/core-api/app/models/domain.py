"""SQLAlchemy 2.0 ORM domain models for DECODING JOBS Phase 1.

Table DDL (including the PostGIS geometry column, GiST index, and the
`employment_type` enum) lives in infra/init-db/*.sql — these classes map
onto that existing schema, they do not generate it.
"""

import enum
from datetime import datetime
from decimal import Decimal
from typing import TypedDict

from geoalchemy2 import Geometry
from geoalchemy2.elements import WKBElement
from geoalchemy2.shape import to_shape
from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
)
from sqlalchemy import (
    Enum as SAEnum,
)
from sqlalchemy import (
    ForeignKey,
    Integer,
    LargeBinary,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    """Shared declarative base for all ORM models."""


class EmploymentType(str, enum.Enum):
    """Mirrors the Postgres `employment_type` enum created in 02-init-jobs-users.sql."""

    FULL_TIME = "full_time"
    INTERNSHIP = "internship"
    CONTRACT = "contract"
    PART_TIME = "part_time"


class WorkMode(str, enum.Enum):
    """Mirrors the Postgres `work_mode` enum created in 03-add-sentiment-and-work-mode.sql."""

    REMOTE = "remote"
    HYBRID = "hybrid"
    ONSITE = "onsite"


class ApplicationStatus(str, enum.Enum):
    """Mirrors the Postgres `application_status` enum (created in 04-init-applications.sql,
    with SAVED added in 11-add-application-tracker.sql for the Kanban tracker).

    SAVED/APPLIED/INTERVIEW/OFFER back the tracker's Kanban columns; VIEWED
    and REJECTED are tracked but not yet surfaced as their own column.
    """

    SAVED = "saved"
    APPLIED = "applied"
    VIEWED = "viewed"
    INTERVIEW = "interview"
    REJECTED = "rejected"
    OFFER = "offer"


class CompanySentiment(TypedDict):
    """Shape of `Company.sentiment_summary`'s JSONB payload."""

    pros: list[str]
    cons: list[str]


class Company(Base):
    """A tech company shown as a pin on the map."""

    __tablename__ = "companies"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    logo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    website_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    address: Mapped[str] = mapped_column(String(500), nullable=False)
    location: Mapped[WKBElement] = mapped_column(
        Geometry(geometry_type="POINT", srid=4326), nullable=False
    )
    sentiment_summary: Mapped[CompanySentiment | None] = mapped_column(JSONB, nullable=True)
    culture_score: Mapped[Decimal | None] = mapped_column(Numeric(2, 1), nullable=True)
    # Phase 2: real company enrichment fields.
    sector: Mapped[str | None] = mapped_column(String(50), nullable=True)
    stage: Mapped[str | None] = mapped_column(String(50), nullable=True)
    area: Mapped[str | None] = mapped_column(String(100), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True, default="Bengaluru")
    founded_year: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    team_size: Mapped[str | None] = mapped_column(String(20), nullable=True)
    total_funding: Mapped[str | None] = mapped_column(String(50), nullable=True)
    linkedin_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    jobs_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str | None] = mapped_column(String(20), nullable=True, default="active")
    # Set only for founder self-registrations (see POST /companies/register);
    # null for scraped/seeded companies. Never exposed via CompanyRead.
    submitted_by_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    jobs: Mapped[list["Job"]] = relationship(
        back_populates="company", cascade="all, delete-orphan"
    )

    @property
    def longitude(self) -> float:
        """Decodes the geometry column into a plain float for API responses."""
        return to_shape(self.location).x

    @property
    def latitude(self) -> float:
        """Decodes the geometry column into a plain float for API responses."""
        return to_shape(self.location).y


class Job(Base):
    """A job posting belonging to a single company."""

    __tablename__ = "jobs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    company_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    employment_type: Mapped[EmploymentType] = mapped_column(
        SAEnum(
            EmploymentType,
            name="employment_type",
            # Postgres enum labels are the lowercase `.value`s (e.g. "full_time"),
            # not the uppercase Python member names — without this, SQLAlchemy
            # would try to write "FULL_TIME" and fail against the DB enum.
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        default=EmploymentType.FULL_TIME,
    )
    # NULL means "unknown," not "0 years required" — Adzuna (97% of ingested
    # jobs) has no experience field at all, so a NOT-NULL default of 0 would
    # silently misrepresent every one of those jobs as fresher-friendly.
    min_experience_years: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    salary_min: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    salary_max: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    work_mode: Mapped[WorkMode | None] = mapped_column(
        SAEnum(
            WorkMode,
            name="work_mode",
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=True,
    )
    apply_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Phase 2: job source tracking.
    source: Mapped[str | None] = mapped_column(String(50), nullable=True, default="manual")
    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Functional department (Engineering, Data & AI, DevOps & Infra, QA,
    # Design, Product, Security, HR & Recruiting, Support, Other) — lets a
    # user filter by role type instead of the ingestion pipeline making an
    # all-or-nothing tech/non-tech call. See app/services/role_classifier.py.
    department: Mapped[str | None] = mapped_column(String(40), nullable=True)
    fetched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    company: Mapped["Company"] = relationship(back_populates="jobs")


class Application(Base):
    """A submitted job application — created by the Document Vault's 1-Click Apply flow."""

    __tablename__ = "applications"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    job_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("jobs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    # NULL for a "saved" bookmark that hasn't gone through 1-Click Apply yet.
    resume_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[ApplicationStatus] = mapped_column(
        SAEnum(
            ApplicationStatus,
            name="application_status",
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        default=ApplicationStatus.APPLIED,
    )
    # Which interview round the candidate is on. NULL until the card first
    # enters INTERVIEW; set to 1 at that point and bumped from the board.
    interview_round: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    applied_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    job: Mapped["Job"] = relationship()


class SavedSearch(Base):
    """A user's saved map filter combo, optionally with email alerts."""

    __tablename__ = "saved_searches"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    filters: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    email_alerts_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship()


class User(Base):
    """A student/job-seeker account."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    email: Mapped[str] = mapped_column(String(320), nullable=False, unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    # Phase 1 identity is email-only (no login) — see api/users.py `identify`.
    hashed_password: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Local-part of this user's personal inbound-email address
    # (u-{forwarding_token}@{INBOUND_EMAIL_DOMAIN}) — see api/emails.py.
    forwarding_token: Mapped[str | None] = mapped_column(String(32), unique=True, nullable=True)
    # Set once a user signs in with Google — verifies this row's email is the
    # one Google actually authenticated, not just whatever was typed in.
    google_id: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Job-seeker preferences — personalize search/chat without re-asking.
    target_roles: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    preferred_cities: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    preferred_work_mode: Mapped[str | None] = mapped_column(String(20), nullable=True)
    min_salary: Mapped[int | None] = mapped_column(Integer, nullable=True)
    skills: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    # Candidate-search fields — let a recruiter filter/rank by seniority and
    # credibility signals without opening a resume. Links are self-reported;
    # the *_verified flags come from a best-effort reachability check (see
    # services/link_verifier.py), not proof of ownership.
    experience_years: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    # "immediate", "15_days", "30_days", "60_days", "90_days" — free-form
    # string, not an enum, since notice terms vary enough across companies
    # that a fixed DB enum would be too rigid.
    notice_period: Mapped[str | None] = mapped_column(String(20), nullable=True)
    github_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    linkedin_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    leetcode_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    github_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    linkedin_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    leetcode_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Opt-out of recruiter candidate search entirely — defaults true so
    # existing behavior doesn't change, but a job seeker can turn it off.
    profile_visible_to_recruiters: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class CandidateUnlock(Base):
    """Records that a company has viewed a candidate's full profile/resume.

    Free for now — this table exists so a credits system can be added later
    (deduct on insert, block on limit) without a schema change, and so
    re-viewing an already-unlocked candidate doesn't re-charge anything.
    """

    __tablename__ = "candidate_unlocks"
    __table_args__ = (UniqueConstraint("company_id", "user_id", name="uq_candidate_unlocks_company_user"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    company_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    unlocked_by_email: Mapped[str] = mapped_column(String(320), nullable=False)
    unlocked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    company: Mapped["Company"] = relationship()
    user: Mapped["User"] = relationship()


class MagicLinkToken(Base):
    """A single-use, short-lived token emailed to prove mailbox ownership.

    Only the SHA-256 hash is stored — the raw token exists only in the
    emailed link and the HTTP response, never persisted. See app/services/auth.py.
    """

    __tablename__ = "magic_link_tokens"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    email: Mapped[str] = mapped_column(String(320), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Session(Base):
    """A logged-in bearer session, issued after a magic-link click or a
    verified Google sign-in — the single source of truth for "who is this"
    that replaced trusting a bare client-supplied email string.
    """

    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_used_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship()


class EmailEvent(Base):
    """Audit trail of one inbound email the parser has seen, matched or not.

    Created by the SendGrid Inbound Parse webhook in api/emails.py.
    """

    __tablename__ = "email_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    application_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("applications.id", ondelete="SET NULL"), nullable=True, index=True
    )
    from_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    subject: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    extracted_company: Mapped[str | None] = mapped_column(String(255), nullable=True)
    extracted_round: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    extracted_stage_label: Mapped[str | None] = mapped_column(String(100), nullable=True)
    extracted_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    matched: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class LogoCache(Base):
    """A cached company favicon, keyed by domain.

    Durable (Postgres-backed) so it survives a frontend restart/redeploy and
    is shared across every instance — see api/logos.py and
    apps/web/app/api/logo/route.ts.
    """

    __tablename__ = "logo_cache"

    domain: Mapped[str] = mapped_column(String(255), primary_key=True)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    image_bytes: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Resume(Base):
    """An uploaded resume, its extracted text, and its ATS analysis.

    File bytes are kept (same BYTEA-in-Postgres pattern as LogoCache) so a
    resume can be re-analyzed later without asking the user to re-upload.
    """

    __tablename__ = "resumes"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_bytes: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    extracted_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    ats_score: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    ats_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    ats_suggestions: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    analyzed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ChatConversation(Base):
    """One AI Assistant conversation thread — the sidebar's list entries.

    Auto-created on a user's first message in a new chat, titled from it.
    """

    __tablename__ = "chat_conversations"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    messages: Mapped[list["ChatMessageRecord"]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan", order_by="ChatMessageRecord.created_at"
    )


class ChatMessageRecord(Base):
    """One turn in a ChatConversation — named *Record* to avoid colliding with
    the Pydantic `ChatMessage` request schema in app/schemas.py.

    `jobs_json`/`companies_json` are result-card snapshots (from the tool
    calls that produced them), and `resume_id` links a resume-analysis turn
    back to its Resume row — together these let a reopened conversation
    render exactly what the user saw the first time, not just plain text.
    """

    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    conversation_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("chat_conversations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    jobs_json: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    companies_json: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    resume_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("resumes.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    conversation: Mapped["ChatConversation"] = relationship(back_populates="messages")
    resume: Mapped["Resume | None"] = relationship()


class FeedbackSubmission(Base):
    """One submission from the private-beta tester feedback page.

    Public and unauthenticated by design (testers have no account), so it is
    rate-limited per IP and never exposes anything back to the caller. `raw`
    keeps the exact request body, so a question added to the form is captured
    even before a dedicated column exists for it.
    """

    __tablename__ = "feedback_submissions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    tester: Mapped[str | None] = mapped_column(String(120), nullable=True)
    name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[str | None] = mapped_column(String(60), nullable=True)
    quote_ok: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    rating_map: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    rating_search: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    rating_company: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    rating_assistant: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    rating_tracker: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    rating_auth: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    rating_overall: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    confused: Mapped[str | None] = mapped_column(Text, nullable=True)
    liked: Mapped[str | None] = mapped_column(Text, nullable=True)
    anything: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(String(40), nullable=False, default="tester-feedback")
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    ip_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    raw: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
