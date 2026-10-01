"""Application-related API routes: the Application Tracker's Kanban board."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.ratelimit import RateLimit
from app.core.security import optional_session, require_session
from app.db.session import get_db
from app.models.domain import Application, ApplicationStatus, EmailEvent, Job, User
from app.schemas import (
    ApplicationBoardRead,
    ApplicationRead,
    ApplicationRoundUpdate,
    ApplicationSaveRequest,
    ApplicationStatusUpdate,
    ApplicationSubmitRequest,
)

router = APIRouter(prefix="/applications", tags=["applications"])


@router.get(
    "/board",
    response_model=list[ApplicationBoardRead],
    summary="List the signed-in user's applications for the Kanban tracker, newest-moved first",
)
async def get_board(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_session)],
) -> list[Application]:
    """Returns every Saved/Applied/Interviewing/Offered card for the signed-in user."""
    user = current_user

    result = await db.execute(
        select(Application)
        .options(selectinload(Application.job).selectinload(Job.company))
        .where(Application.user_id == user.id)
        .order_by(Application.updated_at.desc())
    )
    applications = list(result.scalars().all())

    auto_tracked_result = await db.execute(
        select(EmailEvent.application_id)
        .where(EmailEvent.user_id == user.id, EmailEvent.matched.is_(True))
        .distinct()
    )
    auto_tracked_ids = {row[0] for row in auto_tracked_result.all()}
    for application in applications:
        application._auto_tracked = application.id in auto_tracked_ids

    return applications


@router.post(
    "/save",
    response_model=ApplicationBoardRead,
    status_code=status.HTTP_201_CREATED,
    summary="Bookmark a job into the tracker's Saved column",
)
async def save_job(
    payload: ApplicationSaveRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_session)],
) -> Application:
    """Idempotent: re-saving a job you've already saved/applied to just returns it."""
    job = await db.get(Job, payload.job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Job {payload.job_id} not found")

    user = current_user

    existing = await db.execute(
        select(Application).where(Application.job_id == payload.job_id, Application.user_id == user.id)
    )
    application = existing.scalar_one_or_none()

    if application is None:
        application = Application(job_id=payload.job_id, user_id=user.id, status=ApplicationStatus.SAVED)
        db.add(application)

    await db.commit()

    result = await db.execute(
        select(Application)
        .options(selectinload(Application.job).selectinload(Job.company))
        .where(Application.id == application.id)
    )
    return result.scalar_one()


@router.patch(
    "/{application_id}/status",
    response_model=ApplicationBoardRead,
    summary="Move a card to a new Kanban column",
)
async def update_status(
    application_id: int,
    payload: ApplicationStatusUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_session)],
) -> Application:
    application = await db.get(Application, application_id)
    if application is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Application {application_id} not found"
        )
    if application.user_id != current_user.id:
        # Previously this endpoint took no identity at all — anyone who
        # guessed an application_id could move any user's card.
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your application.")

    application.status = payload.status
    # Entering Interviewing for the first time starts at Round 1; leaving it
    # (back to Saved/Applied, or forward to Offer) keeps the round as history.
    if payload.status == ApplicationStatus.INTERVIEW and application.interview_round is None:
        application.interview_round = 1
    await db.commit()

    result = await db.execute(
        select(Application)
        .options(selectinload(Application.job).selectinload(Job.company))
        .where(Application.id == application_id)
    )
    return result.scalar_one()


@router.patch(
    "/{application_id}/round",
    response_model=ApplicationBoardRead,
    summary="Advance (or set) the interview round for a card in the Interviewing column",
)
async def update_round(
    application_id: int,
    payload: ApplicationRoundUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_session)],
) -> Application:
    application = await db.get(Application, application_id)
    if application is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Application {application_id} not found"
        )
    if application.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your application.")

    application.interview_round = payload.interview_round
    await db.commit()

    result = await db.execute(
        select(Application)
        .options(selectinload(Application.job).selectinload(Job.company))
        .where(Application.id == application_id)
    )
    return result.scalar_one()


@router.post(
    "/submit",
    response_model=ApplicationRead,
    status_code=status.HTTP_201_CREATED,
    summary="Submit a job application via the Document Vault's 1-Click Apply flow",
    dependencies=[Depends(RateLimit(limit=60, window_seconds=3600, scope="apply"))],
)
async def submit_application(
    payload: ApplicationSubmitRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User | None, Depends(optional_session)],
) -> Application:
    """Creates (or advances) an Application row with status 'applied'.

    Identity comes from the session, if one is present — never from a
    client-supplied email — so this can no longer be used to add a bogus
    row to someone else's tracker board. Signing in is still optional here:
    with no session, this submits anonymously (user_id NULL), same as
    before the tracker existed, for a true zero-friction 1-click apply.
    If that job was already saved/applied to by the same signed-in user,
    this updates that existing row in place instead of duplicating it.
    """
    job = await db.get(Job, payload.job_id)
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job {payload.job_id} not found",
        )

    application = None
    if current_user is not None:
        existing = await db.execute(
            select(Application).where(Application.job_id == payload.job_id, Application.user_id == current_user.id)
        )
        application = existing.scalar_one_or_none()

    if application:
        application.status = ApplicationStatus.APPLIED
        application.resume_filename = payload.resume_filename
    else:
        application = Application(
            job_id=payload.job_id,
            user_id=current_user.id if current_user else None,
            resume_filename=payload.resume_filename,
            status=ApplicationStatus.APPLIED,
        )
        db.add(application)

    await db.commit()
    await db.refresh(application)

    return application
