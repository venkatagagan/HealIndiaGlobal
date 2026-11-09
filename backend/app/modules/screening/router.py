"""HTTP routes for AI screening (PLAN 8.6). Paths are written in full; the router has no prefix."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request

from app.core.ai_quota import ai_daily_quota
from app.core.audit import audit_phi_access
from app.core.deps import CurrentUser, DbSession, PageParams
from app.core.enums import ScreeningStatus
from app.core.pagination import Page
from app.core.rate_limit import rate_limit
from app.modules.guests.quota import guest_screening_quota
from app.modules.screening import service
from app.modules.screening.schemas import MatchOut, ScreeningCreate, ScreeningOut, ScreeningUpdate, SubmitIn

router = APIRouter(tags=["screening"])

_submit_limit = Depends(rate_limit("screening.submit", 5, 60, key="user"))
# SEC-021: per-user daily AI quota (over the platform budget the job falls back to the rules engine)
_ai_quota = Depends(ai_daily_quota("screening", global_budget=False))
# Guests (before registering) may run GUEST_AI_DAILY_LIMIT AI screenings a day (per guest and per IP).
_guest_quota = Depends(guest_screening_quota())


@router.post("/screenings", status_code=201, response_model=ScreeningOut)
async def create_screening(
    body: ScreeningCreate, db: DbSession, user: CurrentUser, request: Request
) -> ScreeningOut:
    """Start a draft questionnaire (patients for themselves; agents/staff with ``patient_id``)."""
    return await service.create_screening(db, user, body, request)


@router.get("/screenings", response_model=Page[ScreeningOut])
async def list_screenings(
    request: Request,
    db: DbSession,
    user: CurrentUser,
    params: PageParams,
    status: Annotated[ScreeningStatus | None, Query()] = None,
    patient_id: Annotated[uuid.UUID | None, Query()] = None,
) -> Page[ScreeningOut]:
    """Patients: their own. Agents: their patients. Staff: all."""
    page = await service.list_screenings(db, user, params, status=status, patient_id=patient_id)
    await audit_phi_access(
        db,
        actor=user,
        patient_ids=[s.patient_id for s in page.items],
        resource_type="screening",
        action="phi.list",
        request=request,
    )
    return page


@router.get("/screenings/{screening_id}", response_model=ScreeningOut)
async def get_screening(
    screening_id: uuid.UUID, db: DbSession, user: CurrentUser, request: Request
) -> ScreeningOut:
    out = await service.get_screening(db, user, screening_id)
    await audit_phi_access(
        db,
        actor=user,
        patient_ids=out.patient_id,
        resource_type="screening",
        resource_id=out.id,
        request=request,
    )
    return out


@router.patch("/screenings/{screening_id}", response_model=ScreeningOut)
async def update_screening(
    screening_id: uuid.UUID, body: ScreeningUpdate, db: DbSession, user: CurrentUser
) -> ScreeningOut:
    """Save answers for one or more wizard steps (draft only)."""
    return await service.update_screening(db, user, screening_id, body)


@router.post(
    "/screenings/{screening_id}/submit",
    response_model=ScreeningOut,
    dependencies=[_submit_limit, _ai_quota, _guest_quota],
)
async def submit_screening(
    screening_id: uuid.UUID, body: SubmitIn, db: DbSession, user: CurrentUser, request: Request
) -> ScreeningOut:
    """Submit for triage; poll ``GET /screenings/{id}`` (or wait for the ``screening.completed`` ws event)."""
    return await service.submit_screening(db, user, screening_id, body, request)


@router.post(
    "/screenings/{screening_id}/rerun",
    response_model=ScreeningOut,
    dependencies=[_submit_limit, _ai_quota, _guest_quota],
)
async def rerun_screening(
    screening_id: uuid.UUID, db: DbSession, user: CurrentUser, request: Request
) -> ScreeningOut:
    return await service.rerun_screening(db, user, screening_id, request)


@router.get("/screenings/{screening_id}/matches", response_model=list[MatchOut])
async def get_matches(screening_id: uuid.UUID, db: DbSession, user: CurrentUser) -> list[MatchOut]:
    """Top matches (empty until the screening is completed)."""
    return await service.get_matches(db, user, screening_id)
