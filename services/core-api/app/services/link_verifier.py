"""Best-effort reachability checks for a candidate's self-reported GitHub,
LinkedIn, and LeetCode links. This is a credibility signal, not proof of
ownership — a dead/unreachable/slow link just leaves the badge unverified,
it never blocks saving the profile (same graceful-degradation discipline as
sendgrid_client.send_email and the ingestion pipeline's optional features).
"""

import logging
import re

import httpx

logger = logging.getLogger(__name__)

TIMEOUT = httpx.Timeout(5.0)
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; DecodingJobsBot/1.0)"}

GITHUB_USERNAME_PATTERN = re.compile(r"github\.com/([A-Za-z0-9-]+)")


async def _check_github(url: str) -> bool:
    match = GITHUB_USERNAME_PATTERN.search(url)
    if not match:
        return False
    username = match.group(1)
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT, headers=HEADERS) as client:
            response = await client.get(f"https://api.github.com/users/{username}")
            return response.status_code == 200 and response.json().get("login") is not None
    except Exception:
        logger.info("GitHub verification failed for %s", url, exc_info=True)
        return False


async def _check_reachable(url: str) -> bool:
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT, headers=HEADERS, follow_redirects=True) as client:
            response = await client.get(url)
            return response.status_code < 400
    except Exception:
        logger.info("Reachability check failed for %s", url, exc_info=True)
        return False


async def verify_links(
    github_url: str | None, linkedin_url: str | None, leetcode_url: str | None
) -> dict[str, bool]:
    return {
        "github_verified": await _check_github(github_url) if github_url else False,
        "linkedin_verified": await _check_reachable(linkedin_url) if linkedin_url else False,
        "leetcode_verified": await _check_reachable(leetcode_url) if leetcode_url else False,
    }
