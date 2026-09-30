"""FastAPI entry point for the DECODING JOBS core-api service."""

import logging
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
    try:
        yield
    finally:
        await engine.dispose()
        logger.info("Database engine disposed")


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
)

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
