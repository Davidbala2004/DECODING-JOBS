"""FastAPI entry point for the DECODING JOBS core-api service."""

import logging
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.requests import Request
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api import alerts, applications, auth, chat, companies, emails, jobs, logos, recruiters, resumes, users
from app.core.config import get_settings
from app.db.session import engine

logger = logging.getLogger("decoding_jobs.core_api")
logging.basicConfig(level=logging.INFO)

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Manage resources that must live for the whole process lifetime."""
    logger.info("Database engine initialized for %s", settings.ENVIRONMENT)
    _warn_on_insecure_production_config()
    try:
        yield
    finally:
        await engine.dispose()
        logger.info("Database engine disposed")


def _warn_on_insecure_production_config() -> None:
    """Loudly flag the misconfigurations that silently weaken auth in prod.

    These don't hard-fail the boot (a deploy shouldn't die over a warning),
    but they are exactly the settings that turned "missing key" into "open
    door" in the past, so they belong in the logs on every start.
    """
    if settings.ENVIRONMENT != "production":
        return
    if not settings.SENDGRID_API_KEY:
        logger.warning(
            "PRODUCTION without SENDGRID_API_KEY: magic-link emails cannot be sent, "
            "and the dev sign-in link is disabled — no one can sign in via email."
        )
    if not settings.GOOGLE_CLIENT_ID:
        logger.warning("PRODUCTION without GOOGLE_CLIENT_ID: Google Sign-In is unavailable.")
    if not settings.INGESTION_API_KEY:
        logger.warning("PRODUCTION without INGESTION_API_KEY: ingestion endpoints are closed.")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="0.1.0",
    docs_url="/docs" if settings.ENVIRONMENT != "production" else None,
    redoc_url="/redoc" if settings.ENVIRONMENT != "production" else None,
    openapi_url=f"{settings.API_V1_PREFIX}/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # Without this the browser hides these from JS on a cross-origin call —
    # the map's "500+" indicator would silently never light up.
    expose_headers=["X-Result-Capped"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """One structured line per request: method, path, status, duration.

    Minimal, dependency-free observability — enough to see slow endpoints
    and error rates in the container logs without wiring up a full APM.
    Health probes are skipped so they don't drown out real traffic.
    """
    started = time.perf_counter()
    response = await call_next(request)
    if request.url.path not in ("/health", "/health/db"):
        duration_ms = (time.perf_counter() - started) * 1000
        logger.info(
            "%s %s -> %s (%.1fms)",
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
        )
    return response

app.include_router(companies.router, prefix=settings.API_V1_PREFIX)
app.include_router(jobs.router, prefix=settings.API_V1_PREFIX)
app.include_router(applications.router, prefix=settings.API_V1_PREFIX)
app.include_router(users.router, prefix=settings.API_V1_PREFIX)
app.include_router(emails.router, prefix=settings.API_V1_PREFIX)
app.include_router(logos.router, prefix=settings.API_V1_PREFIX)
app.include_router(resumes.router, prefix=settings.API_V1_PREFIX)
app.include_router(chat.router, prefix=settings.API_V1_PREFIX)
app.include_router(alerts.router, prefix=settings.API_V1_PREFIX)
app.include_router(recruiters.router, prefix=settings.API_V1_PREFIX)
app.include_router(auth.router, prefix=settings.API_V1_PREFIX)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch-all so unexpected errors never leak internals to the client."""
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error"},
    )


@app.get("/health", tags=["health"], summary="Liveness probe")
async def health() -> dict[str, str]:
    """Returns 200 as soon as the process is up — no external dependencies."""
    return {"status": "ok", "service": settings.PROJECT_NAME}


@app.get("/health/db", tags=["health"], summary="Readiness probe (database)")
async def health_db() -> dict[str, str]:
    """Confirms the API can actually reach PostGIS — used for readiness checks."""
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception as exc:
        logger.error("Database readiness check failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable",
        ) from exc

    return {"status": "ok", "database": "reachable"}
