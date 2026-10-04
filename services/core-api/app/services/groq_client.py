"""Shared low-level client for Groq's free-tier, OpenAI-compatible chat API.

Used by resume_analyzer.py and api/chat.py. app/services/email_parser.py
predates this and has its own proven, working call — left as-is rather than
risking a refactor of a shipped feature for the sake of DRY-ness.
"""

import asyncio
import logging
from typing import Any

import httpx

from app.core.config import get_settings

logger = logging.getLogger("decoding_jobs.core_api.groq_client")

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
DEFAULT_MODEL = "openai/gpt-oss-120b"

# Groq's free tier allows 8000 tokens per minute. A tool-calling chat spends
# most of that budget on the system prompt + tool schemas before generating a
# single token, so the *second* round of any tool-using turn used to trip a 429
# every time and surface to the user as "Something went wrong on my end". The
# window is rolling and resets in seconds (x-ratelimit-reset-tokens is usually
# under 5s), so a short backoff turns a hard failure into a slower reply.
MAX_429_RETRIES = 3
BASE_BACKOFF_SECONDS = 1.5
MAX_BACKOFF_SECONDS = 12.0


class GroqRateLimited(Exception):
    """Groq kept returning 429 after our retries.

    Kept distinct from GroqUnavailable so the caller can say "the assistant is
    busy, try again in a moment" rather than "not configured", which would be a
    lie about the actual cause.
    """


class GroqBadRequest(Exception):
    """Groq rejected the request body (400).

    Groq's own error message is the only thing that explains *which* message in
    the payload it disliked, so it is carried on the exception rather than
    swallowed into a generic "something went wrong".
    """


class GroqUnavailable(Exception):
    """Raised when GROQ_API_KEY isn't configured — callers should degrade
    gracefully (a canned response), never surface this as a 500."""


def _retry_after_seconds(response: httpx.Response, attempt: int) -> float:
    """How long to wait before retrying a 429.

    Prefers Groq's own `retry-after`, then the token-window reset, and falls
    back to exponential backoff. Capped so a long Retry-After can't hang the
    request past its own timeout.
    """
    for header in ("retry-after", "x-ratelimit-reset-tokens"):
        raw = response.headers.get(header)
        if not raw:
            continue
        try:
            # reset-tokens arrives as "1.995s" / "12m57.599s"; retry-after as "7".
            text = raw.strip()
            if text.endswith("s") and not text.endswith("ms"):
                text = text[:-1]
                if "m" in text:
                    minutes, _, seconds = text.partition("m")
                    return min(float(minutes) * 60 + float(seconds), MAX_BACKOFF_SECONDS)
            return min(float(text), MAX_BACKOFF_SECONDS)
        except ValueError:
            continue
    return min(BASE_BACKOFF_SECONDS * (2**attempt), MAX_BACKOFF_SECONDS)


async def chat_completion(
    messages: list[dict[str, Any]],
    *,
    tools: list[dict[str, Any]] | None = None,
    json_mode: bool = False,
    model: str = DEFAULT_MODEL,
    max_tokens: int = 1024,
    timeout: float = 30.0,
) -> dict[str, Any]:
    """Calls Groq's chat completions endpoint, returning the raw response JSON.

    Retries transparently on 429 (the free tier's per-minute token window), then
    raises. A 429 is usually transient rather than a real error, so the retry
    belongs here rather than at every call site.

    Raises GroqUnavailable if no API key is configured; GroqRateLimited if the
    key is fine but the account is out of budget after retries. Any other
    failure (network, non-2xx, malformed response) raises normally — callers
    that need a soft-fail (e.g. structured extraction) should catch broadly.
    """
    settings = get_settings()
    if not settings.GROQ_API_KEY:
        raise GroqUnavailable("GROQ_API_KEY not configured")

    payload: dict[str, Any] = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": messages,
    }
    if tools:
        payload["tools"] = tools
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    last_response: httpx.Response | None = None
    async with httpx.AsyncClient(timeout=timeout) as client:
        for attempt in range(MAX_429_RETRIES + 1):
            response = await client.post(
                GROQ_API_URL,
                headers={
                    "Authorization": f"Bearer {settings.GROQ_API_KEY}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            if response.status_code == 429:
                last_response = response
                if attempt < MAX_429_RETRIES:
                    delay = _retry_after_seconds(response, attempt)
                    logger.warning(
                        "groq 429 (attempt %d/%d), retrying in %.2fs",
                        attempt + 1,
                        MAX_429_RETRIES + 1,
                        delay,
                    )
                    await asyncio.sleep(delay)
                    continue
                logger.error("groq 429 exhausted after %d attempts", MAX_429_RETRIES + 1)
                raise GroqRateLimited("Groq rate limit exceeded") from None
            if response.status_code == 400:
                # Groq's body names the offending field (e.g. which message is
                # malformed). Without this the user-visible symptom is a
                # generic "Something went wrong on my end" and the real cause is
                # invisible in the logs.
                detail = response.text[:600]
                logger.error("groq 400 bad request: %s", detail)
                raise GroqBadRequest(detail) from None
            response.raise_for_status()
            return response.json()

    # Unreachable: the loop either returns or raises.
    raise GroqRateLimited("Groq rate limit exceeded") from None