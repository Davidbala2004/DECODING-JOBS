"""Pydantic request/response schemas for the core-api service."""

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.domain import ApplicationStatus, EmploymentType, WorkMode


class CompanySentimentRead(BaseModel):
    """AI-synthesized pros/cons shown in the Company Pulse section."""

    model_config = ConfigDict(from_attributes=True)

    pros: list[str] = Field(default_factory=list)
    cons: list[str] = Field(default_factory=list)


class CompanyRead(BaseModel):
    """API representation of a Company, with PostGIS geometry flattened to lat/lng."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None = None
    logo_url: str | None = None
    website_url: str | None = None
    address: str
    latitude: float
    longitude: float
    sentiment_summary: CompanySentimentRead | None = None
    culture_score: float | None = None
    # Phase 2: real company enrichment fields.
    sector: str | None = None
    stage: str | None = None
    area: str | None = None
    city: str | None = None
    founded_year: int | None = None
    team_size: str | None = None
    total_funding: str | None = None
    linkedin_url: str | None = None
    jobs_url: str | None = None
    status: str | None = None
    active_job_count: int = 0
    # True if any of this company's active jobs went live in the last few
    # days — powers the map pin's "freshly hiring" flash (distinct from the
    # steady pulse every hiring company gets).
    recently_hiring: bool = False
    created_at: datetime

    @model_validator(mode="before")
    @classmethod
    def extract_active_job_count(cls, data: "CompanyRead") -> "CompanyRead":
        """Pull the _active_job_count/_recently_hiring attributes the API route
        annotates onto the ORM object before validation."""
        for attr, field in (("_active_job_count", "active_job_count"), ("_recently_hiring", "recently_hiring")):
            if hasattr(data, attr):
                setattr(data, field, getattr(data, attr))
            elif isinstance(data, dict) and attr in data:
                data[field] = data.pop(attr)
        return data


class BoundingBoxQuery(BaseModel):
    """Validated map-viewport bounding box for the spatial company search endpoint."""

    model_config = ConfigDict(extra="forbid")

    min_lat: float = Field(..., ge=-90, le=90, description="Southwest corner latitude")
    min_lng: float = Field(..., ge=-180, le=180, description="Southwest corner longitude")
    max_lat: float = Field(..., ge=-90, le=90, description="Northeast corner latitude")
    max_lng: float = Field(..., ge=-180, le=180, description="Northeast corner longitude")

    @model_validator(mode="after")
    def check_bounds_are_ordered(self) -> "BoundingBoxQuery":
        if self.min_lat >= self.max_lat:
            raise ValueError("min_lat must be less than max_lat")
        if self.min_lng >= self.max_lng:
            raise ValueError("min_lng must be less than max_lng")
        return self


class JobRead(BaseModel):
    """API representation of a Job posting."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    title: str
    description: str
    employment_type: EmploymentType
    min_experience_years: int
    salary_min: Decimal | None = None
    salary_max: Decimal | None = None
    work_mode: WorkMode | None = None
    apply_url: str | None = None
    is_active: bool
    # Phase 2: job source tracking.
    source: str | None = None
    source_url: str | None = None
    # Functional department (Engineering, Data & AI, HR & Recruiting, etc.)
    department: str | None = None
    created_at: datetime


class JobWithCompanyRead(JobRead):
    """A Job posting with its parent Company embedded — used for the detail view."""

    company: CompanyRead


class ApplicationSubmitRequest(BaseModel):
    """Body for POST /applications/submit — the Document Vault's SUBMIT APPLICATION action."""

    model_config = ConfigDict(extra="forbid")

    job_id: int
    resume_filename: str = Field(..., min_length=1, max_length=255)
    user_email: str | None = Field(None, description="Ties the application to a tracker board")


class ApplicationSaveRequest(BaseModel):
    """Body for POST /applications/save — bookmark a job into the tracker's Saved column."""

    model_config = ConfigDict(extra="forbid")

    job_id: int
    user_email: str = Field(..., min_length=3, max_length=320)


class ApplicationStatusUpdate(BaseModel):
    """Body for PATCH /applications/{id}/status — a Kanban column drop."""

    model_config = ConfigDict(extra="forbid")

    status: ApplicationStatus


class ApplicationRoundUpdate(BaseModel):
    """Body for PATCH /applications/{id}/round — advancing/setting the interview round."""

    model_config = ConfigDict(extra="forbid")

    interview_round: int = Field(..., ge=1)


class ApplicationRead(BaseModel):
    """API representation of a submitted Application."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    job_id: int
    user_id: int | None = None
    resume_filename: str | None = None
    status: ApplicationStatus
    interview_round: int | None = None
    applied_at: datetime


class ApplicationBoardRead(ApplicationRead):
    """An Application with its Job (and that Job's Company) embedded — one Kanban card."""

    job: JobWithCompanyRead
    auto_tracked: bool = False

    @model_validator(mode="before")
    @classmethod
    def extract_auto_tracked(cls, data: "ApplicationBoardRead") -> "ApplicationBoardRead":
        """Pulls the _auto_tracked attribute set by the API route onto the response."""
        if hasattr(data, "_auto_tracked"):
            data.auto_tracked = data._auto_tracked
        elif isinstance(data, dict) and "_auto_tracked" in data:
            data["auto_tracked"] = data.pop("_auto_tracked")
        return data


class UserIdentifyRequest(BaseModel):
    """Body for POST /users/identify — Phase 1's password-less sign-in."""

    model_config = ConfigDict(extra="forbid")

    email: str = Field(..., min_length=3, max_length=320)


class UserRead(BaseModel):
    """API representation of a User."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    full_name: str | None = None
    forwarding_token: str | None = None
    forwarding_address: str | None = None

    @model_validator(mode="before")
    @classmethod
    def extract_forwarding_address(cls, data: "UserRead") -> "UserRead":
        """Pulls the _forwarding_address attribute set by the API route onto the response."""
        if hasattr(data, "_forwarding_address"):
            data.forwarding_address = data._forwarding_address
        elif isinstance(data, dict) and "_forwarding_address" in data:
            data["forwarding_address"] = data.pop("_forwarding_address")
        return data


class GoogleAuthRequest(BaseModel):
    """Body for POST /users/google-auth — the ID token from Google's Sign In
    button/One Tap flow, verified server-side before trusting anything in it."""

    model_config = ConfigDict(extra="forbid")

    credential: str = Field(..., min_length=10)


class UserPreferencesRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    target_roles: list[str] = Field(default_factory=list)
    preferred_cities: list[str] = Field(default_factory=list)
    preferred_work_mode: str | None = None
    min_salary: int | None = None
    skills: list[str] = Field(default_factory=list)
    experience_years: int | None = None
    notice_period: str | None = None
    github_url: str | None = None
    linkedin_url: str | None = None
    leetcode_url: str | None = None
    github_verified: bool = False
    linkedin_verified: bool = False
    leetcode_verified: bool = False
    profile_visible_to_recruiters: bool = True

    @model_validator(mode="before")
    @classmethod
    def null_lists_to_empty(cls, data):
        if isinstance(data, dict):
            for field in ("target_roles", "preferred_cities", "skills"):
                if data.get(field) is None:
                    data[field] = []
        else:
            for field in ("target_roles", "preferred_cities", "skills"):
                if getattr(data, field, None) is None:
                    setattr(data, field, [])
        return data


class UserPreferencesUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str = Field(..., min_length=3, max_length=320)
    target_roles: list[str] | None = None
    preferred_cities: list[str] | None = None
    preferred_work_mode: str | None = None
    min_salary: int | None = None
    skills: list[str] | None = None
    experience_years: int | None = None
    notice_period: str | None = None
    github_url: str | None = None
    linkedin_url: str | None = None
    leetcode_url: str | None = None
    profile_visible_to_recruiters: bool | None = None


class RecruiterIdentifyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str = Field(..., min_length=3, max_length=320)


class RecruiterIdentifyResponse(BaseModel):
    company_id: int
    company_name: str


class CandidateSearchResult(BaseModel):
    """A masked candidate — enough to judge fit, nothing to contact them with."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    target_roles: list[str] = Field(default_factory=list)
    preferred_cities: list[str] = Field(default_factory=list)
    preferred_work_mode: str | None = None
    experience_years: int | None = None
    notice_period: str | None = None
    skills: list[str] = Field(default_factory=list)
    ats_score: int | None = None
    github_verified: bool = False
    linkedin_verified: bool = False
    leetcode_verified: bool = False
    already_unlocked: bool = False


class CandidateProfileRead(BaseModel):
    """A candidate's full profile — only returned after an unlock."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    email: str
    target_roles: list[str] = Field(default_factory=list)
    preferred_cities: list[str] = Field(default_factory=list)
    preferred_work_mode: str | None = None
    experience_years: int | None = None
    notice_period: str | None = None
    skills: list[str] = Field(default_factory=list)
    github_url: str | None = None
    linkedin_url: str | None = None
    leetcode_url: str | None = None
    github_verified: bool = False
    linkedin_verified: bool = False
    leetcode_verified: bool = False
    resume_id: int | None = None
    ats_score: int | None = None
    ats_summary: str | None = None
    ats_suggestions: dict | None = None


class SavedSearchCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str = Field(..., min_length=3, max_length=320)
    label: str = Field(..., min_length=1, max_length=120)
    filters: dict = Field(default_factory=dict)
    email_alerts_enabled: bool = False


class SavedSearchRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    label: str
    filters: dict
    email_alerts_enabled: bool
    last_checked_at: datetime | None = None
    created_at: datetime


class EmailEventRead(BaseModel):
    """API representation of an EmailEvent — an unmatched-emails audit entry."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    from_address: str | None = None
    subject: str | None = None
    extracted_company: str | None = None
    extracted_round: int | None = None
    extracted_stage_label: str | None = None
    extracted_status: str | None = None
    matched: bool
    created_at: datetime


class ResumeRead(BaseModel):
    """API representation of a Resume, including its ATS analysis once run."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    filename: str
    ats_score: int | None = None
    ats_summary: str | None = None
    ats_suggestions: dict | None = None
    uploaded_at: datetime
    analyzed_at: datetime | None = None


class ResumeAnalyzeRequest(BaseModel):
    """Body for POST /resumes/{id}/analyze — optionally tailored to one job."""

    model_config = ConfigDict(extra="forbid")

    job_id: int | None = None


class ChatMessage(BaseModel):
    """One turn in a chat conversation.

    This bounds a single human-typed message, but the client also replays
    every prior ASSISTANT reply back as history on each new request — and a
    detailed prep guide or full resume rewrite can legitimately run several
    thousand characters. A limit sized for "one thing a person typed" broke
    every subsequent message in a conversation once one long reply landed in
    it, so this needs real headroom for a full turn, not just an input.
    """

    model_config = ConfigDict(extra="forbid")

    role: str = Field(..., pattern="^(user|assistant)$")
    content: str = Field(..., min_length=1, max_length=20000)


class ChatRequest(BaseModel):
    """Body for POST /chat — the full conversation so far, stateless per-turn."""

    model_config = ConfigDict(extra="forbid")

    messages: list[ChatMessage] = Field(..., min_length=1, max_length=50)
    resume_id: int | None = None
    job_id: int | None = None
    user_email: str | None = None
    conversation_id: int | None = None


class ChatJobResult(BaseModel):
    """A job the assistant found via a tool call, shown as a result card."""

    id: int
    title: str
    company_name: str
    company_id: int
    sector: str | None = None
    city: str | None = None
    work_mode: str | None = None
    apply_url: str | None = None
    website_url: str | None = None


class ChatCompanyResult(BaseModel):
    """A company the assistant found via a tool call, shown as a result card."""

    id: int
    name: str
    sector: str | None = None
    city: str | None = None
    stage: str | None = None
    website_url: str | None = None
    active_job_count: int = 0


class ChatResponse(BaseModel):
    reply: str
    jobs: list[ChatJobResult] = Field(default_factory=list)
    companies: list[ChatCompanyResult] = Field(default_factory=list)
    conversation_id: int | None = None


class ChatConversationRead(BaseModel):
    """One entry in the AI Assistant's conversation-history sidebar."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    updated_at: datetime


class ChatMessageRead(BaseModel):
    """One stored turn, replayed when a past conversation is reopened."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    role: str
    content: str
    jobs: list[ChatJobResult] = Field(default_factory=list, validation_alias="jobs_json")
    companies: list[ChatCompanyResult] = Field(default_factory=list, validation_alias="companies_json")
    resume: ResumeRead | None = None
    created_at: datetime

    @field_validator("jobs", "companies", mode="before")
    @classmethod
    def default_null_json_to_empty_list(cls, value: list | None) -> list:
        """jobs_json/companies_json are nullable in the DB (most turns have
        neither) — coerce a null column value to [] rather than failing
        validation, without touching the source ORM object."""
        return value if value is not None else []


class ChatMessageAppendRequest(BaseModel):
    """Body for POST /chat/conversations/messages — logs a turn that didn't go
    through /chat itself (the resume-upload flow's attachment + analysis turns),
    so history stays complete. Creates a conversation if conversation_id is null."""

    model_config = ConfigDict(extra="forbid")

    conversation_id: int | None = None
    user_email: str = Field(..., min_length=3, max_length=320)
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str = Field(..., min_length=1, max_length=4000)
    resume_id: int | None = None


class ChatMessageAppendResponse(BaseModel):
    conversation_id: int
    message_id: int
