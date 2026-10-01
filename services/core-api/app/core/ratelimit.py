"""Lightweight in-process rate limiting for public endpoints.

A single-process, in-memory sliding-window limiter — enough to stop casual
abuse (magic-link email bombing, anonymous LLM spend, spam applications)
without pulling in an external dependency.

Scope note: state is per-process. A multi-worker / multi-instance deployment
needs a shared store (Redis) instead — this is deliberately the smallest
thing that closes the hole today, and the interface (`enforce` / `RateLimit`)
is the seam a Redis-backed implementation can later satisfy without changing
any call site.
"""

import time
from collections import deque

from fastapi import HTTPException, Request, status

# key -> timestamps of requests still inside the current window.
_buckets: dict[str, deque[float]] = {}


def _client_ip(request: Request) -> str:
    """Best-effort client identifier.

    Behind a proxy the socket peer is the proxy, so we prefer the first hop
    in X-Forwarded-For when present. This is advisory only (a client can
    spoof the header) — it raises the bar, it is not a security boundary on
    its own.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def enforce(key: str, limit: int, window_seconds: int) -> None:
    """Raises 429 if `key` has already been seen `limit` times in the window.

    Records the current attempt only when it is allowed, so a client that is
    being throttled cannot extend its own lockout indefinitely.
    """
    now = time.monotonic()
    cutoff = now - window_seconds
    bucket = _buckets.setdefault(key, deque())

    while bucket and bucket[0] < cutoff:
        bucket.popleft()

    if len(bucket) >= limit:
        retry_after = max(1, int(window_seconds - (now - bucket[0])))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests — please slow down and try again shortly.",
            headers={"Retry-After": str(retry_after)},
        )

    bucket.append(now)


class RateLimit:
    """FastAPI dependency: caps requests per client IP for one scope.

    Usage:
        @router.post("/x", dependencies=[Depends(RateLimit(limit=5, window_seconds=60, scope="x"))])
    """

    def __init__(self, limit: int, window_seconds: int, scope: str) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self.scope = scope

    async def __call__(self, request: Request) -> None:
        enforce(
            f"{self.scope}:ip:{_client_ip(request)}",
            self.limit,
            self.window_seconds,
        )


def reset() -> None:
    """Clears all buckets — used by tests so runs don't bleed into each other."""
    _buckets.clear()
