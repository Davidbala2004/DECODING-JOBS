"""AI Job Search Assistant: a tool-calling chat backed by our own real data.

The model never invents a company or posting — every job/company it mentions
comes from one of the tool calls below, which query the same tables the map
and Kanban tracker use. If GROQ_API_KEY isn't set, /chat degrades to a
friendly canned reply instead of erroring, same pattern as the rest of the
app's optional LLM features.
"""

import json
import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.ratelimit import RateLimit
from app.core.security import optional_session, require_session
from app.db.session import get_db
from app.models.domain import ChatConversation, ChatMessageRecord, Company, Job, Resume, User
from app.schemas import (
    ChatCompanyResult,
    ChatConversationRead,
    ChatJobResult,
    ChatMessageAppendRequest,
    ChatMessageAppendResponse,
    ChatMessageRead,
    ChatRequest,
    ChatResponse,
)
from app.services.groq_client import GroqUnavailable, chat_completion

logger = logging.getLogger("decoding_jobs.core_api.chat")

router = APIRouter(prefix="/chat", tags=["chat"])

MAX_TOOL_ROUNDS = 4

_SYSTEM_PROMPT = """You are the AI Job Search Assistant for DECODING JOBS, a map-based job \
search tool for tech students and job seekers in India. You help people find real jobs and \
companies, and give interview/application prep guidance.

Rules:
- You have tools to search real jobs, list real companies, get a company's real detail, and \
get interview prep grounded in real company data. ALWAYS use a tool before naming a specific \
company or job — never invent one.
- After search_jobs or list_companies, the app ALREADY renders every result as its own clickable \
card right below your reply (logo, title, company, city) — never repeat them in a Markdown table \
or list in your text. Your reply should just be a short sentence or two of commentary (e.g. what \
you found, a pattern worth noting, a follow-up question) — the cards are the listing, not your prose.
- If a request is vague (e.g. just "find me a job"), ask a short clarifying question first — \
role/title, city, and work mode (remote/hybrid/onsite) are the things a real job seeker narrows \
by. Don't ask more than one or two questions before trying a search.
- When asked to prepare for an interview or a specific role, use get_interview_prep. Be clear \
about what's real (the company's actual culture/sentiment data, the actual job description if \
found) versus general advice about that type of role — never claim to know real interview \
questions you don't have.
- If the user's resume text is included in this conversation's context, use it to give specific, \
personalized advice when relevant (e.g. how it matches a role) — don't ask them to paste it again.
- If asked to rewrite, tailor, or create a new resume/version, produce the FULL rewritten resume as \
Markdown, formatted to actually survive an ATS parse, not just to look nice in chat:
  * "# Full Name" header, then contact info as plain text (email · phone · LinkedIn · location) on \
one line — no table, no columns, no icons.
  * Standard section headers in this order: "## Summary", "## Skills", "## Experience", "## Education" \
(add "## Projects" or "## Certifications" only if the source resume has that material).
  * Experience entries as "**Job Title — Company** (dates)" followed by plain "- " bullet points, \
each starting with a strong verb and, wherever the source material supports it, a number/outcome.
  * NEVER use a Markdown table for the resume body itself (tables are for your own analysis replies, \
like a job-comparison — real ATS software frequently mis-parses or drops table content). One column, \
top to bottom, plain bullets only.
  * Base it strictly on the real experience/skills already in their uploaded resume text — never \
invent employers, titles, dates, or achievements that aren't there; rephrase, reorder, and surface \
keywords from the target job description when one is in context, but don't fabricate new facts.
- Editing is iterative, like any other chat assistant: if you already produced a rewritten resume \
earlier in THIS conversation and the user now asks for a change ("make it shorter", "focus more on \
backend work", "add the internship back in"), revise THAT version — don't regenerate from the raw \
original as if starting over, and don't restate parts that didn't change. Only fall back to the raw \
original resume text if the user explicitly asks to start over or there's no earlier rewrite yet.
- Keep conversational replies concise; a full resume rewrite or a detailed prep guide is the one \
exception where a long, thorough, well-formatted answer is exactly what's wanted.
"""

TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "search_jobs",
            "description": "Search real job postings by role/title/skill, optionally scoped to a city.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Role, title, or skill keywords"},
                    "city": {"type": "string", "description": "Optional city to scope the search to"},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_companies",
            "description": "List real companies, optionally filtered by sector, city, funding stage, or hiring status.",
            "parameters": {
                "type": "object",
                "properties": {
                    "sector": {"type": "string", "description": "e.g. AI, Fintech, SaaS, Consumer"},
                    "city": {"type": "string"},
                    "stage": {"type": "string", "description": "e.g. Seed, Series A, Growth, Public"},
                    "hiring_only": {"type": "boolean", "description": "Only companies with open roles"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_company_detail",
            "description": "Get one company's real detail: sector, city, funding, culture score, sentiment pros/cons.",
            "parameters": {
                "type": "object",
                "properties": {"company_name": {"type": "string"}},
                "required": ["company_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_interview_prep",
            "description": "Get real data to prep for an interview at a company: culture/sentiment, and the real job description if one is posted.",
            "parameters": {
                "type": "object",
                "properties": {
                    "company_name": {"type": "string"},
                    "job_title": {"type": "string", "description": "Optional specific role title"},
                },
                "required": ["company_name"],
            },
        },
    },
]


def _company_dict(company: Company, active_job_count: int = 0) -> dict:
    return {
        "id": company.id,
        "name": company.name,
        "sector": company.sector,
        "city": company.city,
        "stage": company.stage,
        "website_url": company.website_url,
        "active_job_count": active_job_count,
    }


def _job_dict(job: Job) -> dict:
    return {
        "id": job.id,
        "title": job.title,
        "company_name": job.company.name,
        "company_id": job.company.id,
        "sector": job.company.sector,
        "city": job.company.city,
        "work_mode": job.work_mode.value if job.work_mode else None,
        "apply_url": job.apply_url,
        "website_url": job.company.website_url,
    }


async def _tool_search_jobs(db: AsyncSession, query: str, city: str | None = None) -> list[dict]:
    pattern = f"%{query}%"
    stmt = (
        select(Job)
        .options(selectinload(Job.company))
        .join(Company, Job.company_id == Company.id)
        .where(Job.is_active.is_(True))
        .where(or_(Job.title.ilike(pattern), Job.description.ilike(pattern)))
    )
    if city:
        stmt = stmt.where(Company.city.ilike(f"%{city}%"))
    stmt = stmt.order_by(Job.created_at.desc()).limit(8)

    result = await db.execute(stmt)
    return [_job_dict(job) for job in result.scalars().all()]


async def _tool_list_companies(
    db: AsyncSession,
    sector: str | None = None,
    city: str | None = None,
    stage: str | None = None,
    hiring_only: bool | None = None,
) -> list[dict]:
    stmt = select(Company)
    if sector:
        stmt = stmt.where(Company.sector.ilike(f"%{sector}%"))
    if city:
        stmt = stmt.where(Company.city.ilike(f"%{city}%"))
    if stage:
        stmt = stmt.where(Company.stage.ilike(f"%{stage}%"))
    if hiring_only:
        hiring_subq = select(Job.company_id).where(Job.is_active.is_(True)).distinct()
        stmt = stmt.where(Company.id.in_(hiring_subq))
    stmt = stmt.limit(8)

    result = await db.execute(stmt)
    companies = list(result.scalars().all())

    # One grouped count for the whole page of companies instead of a COUNT per
    # company (the previous N+1).
    company_ids = [c.id for c in companies]
    counts: dict[int, int] = {}
    if company_ids:
        counts_result = await db.execute(
            select(Job.company_id, func.count(Job.id))
            .where(Job.company_id.in_(company_ids), Job.is_active.is_(True))
            .group_by(Job.company_id)
        )
        counts = {cid: total for cid, total in counts_result.all()}

    return [_company_dict(company, counts.get(company.id, 0)) for company in companies]


async def _tool_get_company_detail(db: AsyncSession, company_name: str) -> dict:
    result = await db.execute(select(Company).where(Company.name.ilike(f"%{company_name}%")).limit(1))
    company = result.scalar_one_or_none()
    if company is None:
        return {"found": False, "message": f"No company matching '{company_name}' found"}

    return {
        "found": True,
        "name": company.name,
        "description": company.description,
        "sector": company.sector,
        "stage": company.stage,
        "city": company.city,
        "area": company.area,
        "founded_year": company.founded_year,
        "team_size": company.team_size,
        "total_funding": company.total_funding,
        "culture_score": float(company.culture_score) if company.culture_score else None,
        "sentiment_pros": (company.sentiment_summary or {}).get("pros", []),
        "sentiment_cons": (company.sentiment_summary or {}).get("cons", []),
    }


async def _tool_get_interview_prep(
    db: AsyncSession, company_name: str, job_title: str | None = None
) -> dict:
    detail = await _tool_get_company_detail(db, company_name)
    if not detail.get("found"):
        return detail

    job_stmt = select(Job).join(Company, Job.company_id == Company.id).where(
        Company.name.ilike(f"%{company_name}%"), Job.is_active.is_(True)
    )
    if job_title:
        job_stmt = job_stmt.where(Job.title.ilike(f"%{job_title}%"))
    job_stmt = job_stmt.limit(1)

    job_result = await db.execute(job_stmt)
    job = job_result.scalar_one_or_none()

    return {
        **detail,
        "matching_job_title": job.title if job else None,
        "matching_job_description": job.description if job else None,
        "note": "culture_score/sentiment/job_description above are real data from our database; "
        "anything else about interview format is general guidance, not confirmed real questions.",
    }


_TOOL_IMPLS = {
    "search_jobs": _tool_search_jobs,
    "list_companies": _tool_list_companies,
    "get_company_detail": _tool_get_company_detail,
    "get_interview_prep": _tool_get_interview_prep,
}


def _fallback_response(text: str) -> ChatResponse:
    return ChatResponse(reply=text, jobs=[], companies=[])


def _conversation_title(first_message: str) -> str:
    title = first_message.strip().splitlines()[0]
    return title[:57] + "…" if len(title) > 60 else title or "New chat"


async def _get_owned_conversation(
    db: AsyncSession, conversation_id: int, user_id: int
) -> ChatConversation | None:
    """Fetches a conversation only if it belongs to this user — prevents one
    user from reading/appending to another's history by guessing an id."""
    result = await db.execute(
        select(ChatConversation).where(
            ChatConversation.id == conversation_id, ChatConversation.user_id == user_id
        )
    )
    return result.scalar_one_or_none()


async def _persist_turn(
    db: AsyncSession,
    conversation: ChatConversation,
    role: str,
    content: str,
    jobs: list[dict] | None = None,
    companies: list[dict] | None = None,
    resume_id: int | None = None,
) -> ChatMessageRecord:
    message = ChatMessageRecord(
        conversation_id=conversation.id,
        role=role,
        content=content,
        jobs_json=jobs or None,
        companies_json=companies or None,
        resume_id=resume_id,
    )
    db.add(message)
    conversation.updated_at = func.now()  # type: ignore[assignment]
    await db.commit()
    await db.refresh(message)
    return message


@router.get(
    "/conversations",
    response_model=list[ChatConversationRead],
    summary="List a user's AI Assistant conversations, most recently active first",
)
async def list_conversations(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_session)],
) -> list[ChatConversation]:
    result = await db.execute(
        select(ChatConversation)
        .where(ChatConversation.user_id == current_user.id)
        .order_by(ChatConversation.updated_at.desc())
    )
    return list(result.scalars().all())


@router.get(
    "/conversations/{conversation_id}/messages",
    response_model=list[ChatMessageRead],
    summary="Get a conversation's full turn history, to reopen it exactly as it looked",
)
async def get_conversation_messages(
    conversation_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_session)],
) -> list[ChatMessageRecord]:
    conversation = await _get_owned_conversation(db, conversation_id, current_user.id)
    if conversation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    result = await db.execute(
        select(ChatMessageRecord)
        .options(selectinload(ChatMessageRecord.resume))
        .where(ChatMessageRecord.conversation_id == conversation_id)
        .order_by(ChatMessageRecord.created_at)
    )
    return list(result.scalars().all())


@router.delete(
    "/conversations/{conversation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a conversation from history",
)
async def delete_conversation(
    conversation_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_session)],
) -> None:
    conversation = await _get_owned_conversation(db, conversation_id, current_user.id)
    if conversation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    await db.delete(conversation)
    await db.commit()


@router.post(
    "/conversations/messages",
    response_model=ChatMessageAppendResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Log a turn that didn't go through /chat (e.g. a resume-upload attachment)",
)
async def append_message(
    payload: ChatMessageAppendRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_session)],
) -> ChatMessageAppendResponse:
    conversation: ChatConversation | None = None
    if payload.conversation_id is not None:
        conversation = await _get_owned_conversation(db, payload.conversation_id, current_user.id)
    if conversation is None:
        conversation = ChatConversation(user_id=current_user.id, title=_conversation_title(payload.content))
        db.add(conversation)
        await db.flush()

    message = await _persist_turn(
        db, conversation, payload.role, payload.content, resume_id=payload.resume_id
    )
    return ChatMessageAppendResponse(conversation_id=conversation.id, message_id=message.id)


async def _run_chat(payload: ChatRequest, db: AsyncSession, user: User | None) -> ChatResponse:
    system_content = _SYSTEM_PROMPT

    if user is not None and (
        user.target_roles or user.preferred_cities or user.skills or user.min_salary or user.preferred_work_mode
    ):
        prefs = []
        if user.target_roles:
            prefs.append(f"target roles: {', '.join(user.target_roles)}")
        if user.preferred_cities:
            prefs.append(f"preferred cities: {', '.join(user.preferred_cities)}")
        if user.preferred_work_mode:
            prefs.append(f"preferred work mode: {user.preferred_work_mode}")
        if user.min_salary:
            prefs.append(f"minimum salary: ₹{user.min_salary:,}/yr")
        if user.skills:
            prefs.append(f"skills: {', '.join(user.skills)}")
        system_content += (
            "\n\nThe user has saved these preferences (from their Preferences page) — use them to "
            "narrow search/recommendations automatically when relevant, without making them repeat "
            "this; but still follow whatever they explicitly ask for in the conversation over these "
            f"defaults if the two conflict: {'; '.join(prefs)}."
        )

    if payload.resume_id is not None:
        resume = await db.get(Resume, payload.resume_id)
        if resume and resume.extracted_text:
            system_content += f"\n\nThe user's resume text:\n{resume.extracted_text[:4000]}"

    if payload.job_id is not None:
        job_result = await db.execute(
            select(Job).options(selectinload(Job.company)).where(Job.id == payload.job_id)
        )
        job = job_result.scalar_one_or_none()
        if job:
            system_content += (
                f"\n\nThe user is asking specifically about this job: {job.title} at "
                f"{job.company.name}. Description: {job.description[:2000]}"
            )

    messages: list[dict[str, Any]] = [{"role": "system", "content": system_content}]
    messages.extend({"role": m.role, "content": m.content} for m in payload.messages)

    collected_jobs: dict[int, dict] = {}
    collected_companies: dict[int, dict] = {}

    try:
        for round_num in range(MAX_TOOL_ROUNDS):
            # A full resume rewrite or a detailed prep guide runs long, plus
            # gpt-oss spends tokens on an internal `reasoning` field before
            # the visible content — 1200 was cutting real answers off
            # mid-sentence (finish_reason=length).
            data = await chat_completion(messages, tools=TOOLS, max_tokens=3000)
            message = data["choices"][0]["message"]
            tool_calls = message.get("tool_calls")
            logger.info(
                "chat round %d: finish_reason=%s tool_calls=%s content=%r",
                round_num,
                data["choices"][0].get("finish_reason"),
                [c["function"]["name"] for c in (tool_calls or [])],
                message.get("content"),
            )

            if not tool_calls:
                return ChatResponse(
                    reply=message.get("content") or "",
                    jobs=[ChatJobResult(**j) for j in collected_jobs.values()],
                    companies=[ChatCompanyResult(**c) for c in collected_companies.values()],
                )

            # Replay only the spec fields — the raw response also carries a
            # `reasoning` field (gpt-oss models) and omits `content` entirely
            # rather than nulling it, both of which appear to confuse Groq's
            # message validation on the next turn and made it re-issue the
            # same tool call forever instead of ever using the tool result.
            messages.append(
                {
                    "role": "assistant",
                    "content": message.get("content"),
                    "tool_calls": tool_calls,
                }
            )
            for call in tool_calls:
                name = call["function"]["name"]
                try:
                    args = json.loads(call["function"]["arguments"] or "{}")
                except json.JSONDecodeError:
                    args = {}

                impl = _TOOL_IMPLS.get(name)
                if impl is None:
                    tool_result: Any = {"error": f"Unknown tool {name}"}
                else:
                    tool_result = await impl(db, **args)

                if name == "search_jobs" and isinstance(tool_result, list):
                    for j in tool_result:
                        collected_jobs[j["id"]] = j
                elif name == "list_companies" and isinstance(tool_result, list):
                    for c in tool_result:
                        collected_companies[c["id"]] = c

                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": call["id"],
                        "name": name,
                        "content": json.dumps(tool_result),
                    }
                )

        return _fallback_response(
            "I found some options but I'm having trouble putting together a final answer — "
            "try narrowing your request a bit."
        )
    except GroqUnavailable:
        return _fallback_response(
            "The AI assistant isn't configured yet — set GROQ_API_KEY on the server to enable it."
        )
    except Exception:
        logger.exception("Chat request failed")
        return _fallback_response("Something went wrong on my end — please try again.")


@router.post(
    "",
    response_model=ChatResponse,
    summary="Chat with the AI Job Search Assistant",
    dependencies=[Depends(RateLimit(limit=40, window_seconds=3600, scope="chat"))],
)
async def chat(
    payload: ChatRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User | None, Depends(optional_session)],
) -> ChatResponse:
    response = await _run_chat(payload, db, current_user)

    # Persist history only when signed in — anonymous chat (no session)
    # stays exactly as stateless as before this feature existed.
    if current_user is not None:
        user = current_user

        conversation: ChatConversation | None = None
        if payload.conversation_id is not None:
            conversation = await _get_owned_conversation(db, payload.conversation_id, user.id)
        if conversation is None:
            # payload.messages is the FULL history the client is holding;
            # its last entry is this turn's new user message.
            title_source = payload.messages[-1].content if payload.messages else "New chat"
            conversation = ChatConversation(user_id=user.id, title=_conversation_title(title_source))
            db.add(conversation)
            await db.flush()

        if payload.messages:
            await _persist_turn(db, conversation, "user", payload.messages[-1].content)
        await _persist_turn(
            db,
            conversation,
            "assistant",
            response.reply,
            jobs=[j.model_dump() for j in response.jobs] or None,
            companies=[c.model_dump() for c in response.companies] or None,
        )
        response.conversation_id = conversation.id

    return response
