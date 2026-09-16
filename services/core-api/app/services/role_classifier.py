"""Classifies a job title into a functional department for filtering.

Built on the same keyword knowledge as scripts/fetch-real-jobs.mjs's
tech-role allowlist (tuned against real Adzuna job titles across all 15
ingested cities before either was trusted) — but here the goal is a
department *label*, not a keep/discard decision. Nothing gets dropped for
being ambiguous; it just lands in "Other" and stays visible.
"""

import re

_PATTERNS: list[tuple[str, re.Pattern]] = [
    ("Data & AI", re.compile(
        r"\bdata\b|machine learning|\bai\b|artificial intelligence|mlops|ml ops|"
        r"\bgis\b|computational biolog|quantitative research|power ?bi",
        re.I,
    )),
    ("DevOps & Infra", re.compile(
        r"devops|\bsre\b|site reliability|\bcloud\b|infrastructure|platform engineer|"
        r"network|database|\bdba\b|kubernetes|\baws\b|system administrator|"
        r"linux|\bvlsi\b|\bnoc\b|sql server|\bbim\b|information technology",
        re.I,
    )),
    ("Security", re.compile(
        r"security|penetration test|cybersecurity|\bvapt\b", re.I,
    )),
    ("QA & Testing", re.compile(
        r"\bqa\b|sdet|automation|\btester\b|quality assurance", re.I,
    )),
    ("Design", re.compile(
        r"designer|product design|user interface|\bux\b|\bui\b|\b2d\b|\b3d\b artist|"
        r"animator|visualizer",
        re.I,
    )),
    ("Product & Program Management", re.compile(
        r"product manager|program manager|project manager|technical program|"
        r"\btpm\b|scrum master|\bpmo\b",
        re.I,
    )),
    ("HR & Recruiting", re.compile(
        r"\bhr\b|human resources?|\brecruit(er|ment|ing)\b|talent acquisition|"
        r"people partner",
        re.I,
    )),
    ("Support & Technical Writing", re.compile(
        r"technical (writer|support|consultant)|content writer|technical writing|"
        r"\bit\b support|\bcto\b",
        re.I,
    )),
    ("Engineering", re.compile(
        r"engineer|\bengr\b|developer|devleoper|programmer|architect|\bsoftware\b|"
        r"\btech(nical)? lead\b|full.?stack|front.?end|back.?end|\bios\b|\bandroid\b|flutter|"
        r"react native|\.net\b|dotnet|\bjava\b|javascript|typescript|python|"
        r"golang|node\.?js|\bphp\b|\bionic\b|embedded|mobile app|blockchain|"
        r"driver development|device driver|\bsap\b|\bsde\b|\bfde\b|salesforce|"
        r"servicenow|solutions? architect|\bcrm\b",
        re.I,
    )),
    ("Data & AI", re.compile(r"analyst|business intelligence", re.I)),
]


def classify_department(title: str) -> str:
    """Returns a department label for a job title. Never returns None — an
    unrecognized title lands in "Other" and stays visible, it just isn't
    filterable by a specific department."""
    if not title:
        return "Other"
    for department, pattern in _PATTERNS:
        if pattern.search(title):
            return department
    return "Other"
