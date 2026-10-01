"""Resume upload + ATS scoring — the Assistant page's "Resume Coach" panel."""

import logging
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_session
from app.db.session import get_db
from app.models.domain import Job, Resume, User
from app.schemas import ResumeAnalyzeRequest, ResumeRead
from app.services.resume_analyzer import analyze_resume
from app.services.resume_parser import UnsupportedResumeFormat, extract_text, resolve_content_type

logger = logging.getLogger("decoding_jobs.core_api.resumes")

router = APIRouter(prefix="/resumes", tags=["resumes"])

MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5MB


@router.post(
    "/upload",
    response_model=ResumeRead,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a resume (PDF or DOCX) for ATS scoring",
)
async def upload_resume(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_session)],
    file: Annotated[UploadFile, File()],
) -> Resume:
    # Accept a valid declared type, or infer one from the filename when the
    # browser reported nothing usable (empty / octet-stream for a real .docx).
    resolved_content_type = resolve_content_type(file.content_type, file.filename)
    if resolved_content_type is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only PDF and DOCX resumes are supported",
        )

    file_bytes = await file.read()
    if len(file_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Resume must be 5MB or smaller",
        )

    try:
        extracted_text = extract_text(file_bytes, resolved_content_type)
    except UnsupportedResumeFormat as exc:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail=str(exc)) from exc
    except Exception:
        logger.exception("Resume text extraction failed for %r", file.filename)
        extracted_text = None

    resume = Resume(
        user_id=current_user.id,
        filename=file.filename or "resume",
        content_type=resolved_content_type,
        file_bytes=file_bytes,
        extracted_text=extracted_text,
    )
    db.add(resume)
    await db.commit()
    await db.refresh(resume)

    return resume


@router.get(
    "",
    response_model=list[ResumeRead],
    summary="List a user's uploaded resumes, newest first",
)
async def list_resumes(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_session)],
) -> list[Resume]:
    result = await db.execute(
        select(Resume).where(Resume.user_id == current_user.id).order_by(Resume.uploaded_at.desc())
    )
    return list(result.scalars().all())


@router.post(
    "/{resume_id}/analyze",
    response_model=ResumeRead,
    summary="Run (or re-run) ATS analysis on a resume, optionally tailored to one job",
)
async def analyze(
    resume_id: int,
    payload: ResumeAnalyzeRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_session)],
) -> Resume:
    resume = await db.get(Resume, resume_id)
    if resume is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Resume {resume_id} not found")
    if resume.user_id != current_user.id:
        # Previously this endpoint took no identity at all — anyone who
        # guessed a resume_id could trigger (and read back) its analysis.
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your resume.")

    if not resume.extracted_text:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="This resume's text couldn't be extracted — try re-uploading",
        )

    job_description = None
    if payload.job_id is not None:
        job = await db.get(Job, payload.job_id)
        if job is not None:
            job_description = f"{job.title}\n{job.description}"

    result = await analyze_resume(resume.extracted_text, job_description)

    resume.ats_score = result["ats_score"]
    resume.ats_summary = result["summary"]
    resume.ats_suggestions = {
        "strengths": result["strengths"],
        "weaknesses": result["weaknesses"],
        "suggestions": result["suggestions"],
        "missing_keywords": result["missing_keywords"],
    }
    resume.analyzed_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(resume)

    return resume
