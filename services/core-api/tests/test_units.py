"""Pure-function unit tests — no database, no live server.

The rest of the suite (test_auth, test_applications_ownership, test_recruiters)
is deliberately integration-level, hitting a running core-api. These cover the
logic that has no I/O so it can be checked in milliseconds and in any
environment: verification, classification, rate limiting, and file-type
resolution.
"""

import os
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

# app.db.session reads DATABASE_URL at import time; a placeholder keeps these
# pure-function tests importable without a real database.
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost:5432/test")

from app.core.ratelimit import enforce, reset  # noqa: E402
from app.api.alerts import _matches_filters  # noqa: E402
from app.api.companies import PLACEHOLDER_COMPANY_NAMES  # noqa: E402
from app.services.company_verification import extract_domain, verify_founder_domain  # noqa: E402
from app.services.geo import CITY_CENTERS, city_center_with_jitter  # noqa: E402
from app.services.resume_parser import resolve_content_type  # noqa: E402
from app.services.role_classifier import classify_department  # noqa: E402

DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


# --------------------------------------------------------------------------- #
# company_verification
# --------------------------------------------------------------------------- #

class TestExtractDomain:
    def test_strips_scheme_www_and_path(self):
        assert extract_domain("https://www.razorpay.com/careers?x=1") == "razorpay.com"

    def test_handles_bare_domain(self):
        assert extract_domain("acme.com") == "acme.com"

    def test_handles_email(self):
        assert extract_domain("founder@acme.co.in") == "acme.co.in"

    def test_is_case_insensitive(self):
        assert extract_domain("You@ACME.COM") == "acme.com"


class TestVerifyFounderDomain:
    def test_matching_domain_passes(self):
        assert verify_founder_domain("you@acme.com", "https://acme.com") is None

    def test_www_website_still_matches(self):
        assert verify_founder_domain("you@acme.com", "https://www.acme.com") is None

    def test_personal_email_is_rejected(self):
        error = verify_founder_domain("you@gmail.com", "https://gmail.com")
        assert error is not None and "work email" in error.lower()

    def test_domain_mismatch_is_rejected(self):
        error = verify_founder_domain("you@acme.com", "https://other.com")
        assert error is not None and "doesn't match" in error

    def test_missing_website_is_rejected(self):
        error = verify_founder_domain("you@acme.com", None)
        assert error is not None and "website" in error.lower()

    def test_invalid_email_is_rejected(self):
        error = verify_founder_domain("not-an-email", "https://acme.com")
        assert error is not None and "valid email" in error.lower()


# --------------------------------------------------------------------------- #
# role_classifier
# --------------------------------------------------------------------------- #

class TestClassifyDepartment:
    @pytest.mark.parametrize(
        ("title", "expected"),
        [
            ("Senior Backend Engineer", "Engineering"),
            ("Full Stack Developer", "Engineering"),
            ("Data Scientist", "Data & AI"),
            ("Machine Learning Engineer", "Data & AI"),
            ("DevOps Engineer", "DevOps & Infra"),
            ("Site Reliability Engineer", "DevOps & Infra"),
            ("Product Designer", "Design"),
            ("QA Automation Engineer", "QA & Testing"),
            ("Technical Recruiter", "HR & Recruiting"),
            ("Security Engineer", "Security"),
        ],
    )
    def test_known_titles(self, title, expected):
        assert classify_department(title) == expected

    def test_unknown_title_falls_back_to_other(self):
        assert classify_department("Chief Vibes Officer") == "Other"

    def test_empty_title_is_other(self):
        assert classify_department("") == "Other"


# --------------------------------------------------------------------------- #
# geo
# --------------------------------------------------------------------------- #

class TestCityCenterWithJitter:
    def test_is_deterministic_for_the_same_seed(self):
        assert city_center_with_jitter("Bengaluru", "Acme") == city_center_with_jitter("Bengaluru", "Acme")

    def test_different_companies_get_different_points(self):
        assert city_center_with_jitter("Bengaluru", "Acme") != city_center_with_jitter("Bengaluru", "Beta")

    def test_stays_near_the_city_center(self):
        center_lat, center_lng = CITY_CENTERS["Chennai"]
        lat, lng = city_center_with_jitter("Chennai", "Acme")
        assert abs(lat - center_lat) <= 0.05
        assert abs(lng - center_lng) <= 0.05

    def test_unknown_city_falls_back_to_default(self):
        assert city_center_with_jitter("Atlantis", "Acme") == city_center_with_jitter(None, "Acme")


# --------------------------------------------------------------------------- #
# ratelimit
# --------------------------------------------------------------------------- #

class TestRateLimit:
    def setup_method(self):
        reset()

    def test_allows_up_to_the_limit(self):
        for _ in range(3):
            enforce("test-key", limit=3, window_seconds=60)

    def test_blocks_past_the_limit_with_429(self):
        for _ in range(3):
            enforce("test-key", limit=3, window_seconds=60)
        with pytest.raises(HTTPException) as exc:
            enforce("test-key", limit=3, window_seconds=60)
        assert exc.value.status_code == 429
        assert "Retry-After" in exc.value.headers

    def test_keys_are_independent(self):
        enforce("a", limit=1, window_seconds=60)
        enforce("b", limit=1, window_seconds=60)

    def test_reset_clears_state(self):
        enforce("test-key", limit=1, window_seconds=60)
        reset()
        enforce("test-key", limit=1, window_seconds=60)


# --------------------------------------------------------------------------- #
# resume_parser
# --------------------------------------------------------------------------- #

class TestResolveContentType:
    def test_accepts_a_declared_type(self):
        assert resolve_content_type("application/pdf", "whatever.pdf") == "application/pdf"

    def test_falls_back_to_extension_when_type_missing(self):
        assert resolve_content_type("", "resume.docx") == DOCX

    def test_falls_back_for_octet_stream(self):
        assert resolve_content_type("application/octet-stream", "resume.PDF") == "application/pdf"

    def test_rejects_a_non_resume_type(self):
        assert resolve_content_type("image/png", "photo.png") is None

    def test_rejects_unknown_extension(self):
        assert resolve_content_type(None, "notes.txt") is None


# --------------------------------------------------------------------------- #
# alert filter matching
# --------------------------------------------------------------------------- #

def _job(city="Bengaluru", sector="AI", stage="Seed", area="Koramangala",
         department="Engineering", work_mode="remote", title="Backend Engineer",
         description="Build APIs"):
    company = SimpleNamespace(city=city, sector=sector, stage=stage, area=area)
    mode = SimpleNamespace(value=work_mode) if work_mode else None
    return SimpleNamespace(
        company=company, department=department, work_mode=mode, title=title, description=description
    )


class TestAlertFilterMatching:
    def test_empty_filters_match_everything(self):
        assert _matches_filters(_job(), {})

    def test_city_mismatch_excludes(self):
        assert not _matches_filters(_job(city="Chennai"), {"city": "Bengaluru"})

    def test_department_matches(self):
        assert _matches_filters(_job(department="Engineering"), {"department": "Engineering"})
        assert not _matches_filters(_job(department="Design"), {"department": "Engineering"})

    def test_work_mode_matches_and_handles_null(self):
        assert _matches_filters(_job(work_mode="remote"), {"work_mode": "remote"})
        assert not _matches_filters(_job(work_mode=None), {"work_mode": "remote"})

    def test_company_type_is_bucketed_from_stage(self):
        assert _matches_filters(_job(stage="Seed"), {"company_type": "Startup"})
        assert not _matches_filters(_job(stage="Public"), {"company_type": "Startup"})

    def test_other_company_type_excludes_known_stages(self):
        assert not _matches_filters(_job(stage="Seed"), {"company_type": "Other"})
        assert _matches_filters(_job(stage="Bootstrap"), {"company_type": "Other"})

    def test_query_matches_description_not_just_title(self):
        job = _job(title="Backend Engineer", description="Experience with Kubernetes required")
        assert _matches_filters(job, {"q": "kubernetes"})
        assert not _matches_filters(job, {"q": "terraform"})


class TestPlaceholderCompanyNames:
    """The denylist that keeps seeded test fixtures out of real job searches.

    The important half of this is the negative case: the obvious "filter out
    anything matching %test%" implementation would also hide real employers,
    which is a worse outcome than showing a stray row.
    """

    @pytest.mark.parametrize(
        "name",
        [
            "Test",
            "test",
            "  Test  ",
            "TestHiring",
            "Partner Engineering Test Company",
        ],
    )
    def test_known_fixtures_are_recognised(self, name):
        assert name.strip().lower() in PLACEHOLDER_COMPANY_NAMES

    @pytest.mark.parametrize(
        "name",
        [
            # Genuine Indian employers that contain "test" — these are exactly
            # what a naive substring filter would have deleted.
            "TestVagrant",
            "Zentest Software Pvt Ltd",
            "Moolya Software Testing Private Limited",
            "Testbook",
            "Contest Technologies",
        ],
    )
    def test_real_companies_are_not_flagged(self, name):
        assert name.strip().lower() not in PLACEHOLDER_COMPANY_NAMES
