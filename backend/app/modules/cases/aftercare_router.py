"""HTTP routes for aftercare (phase 1): ``/me/aftercare`` and recovery check-ins. Included by the cases
router (paths written in full)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Request

from app.core.deps import CurrentUser, DbSession
from app.modules.cases import aftercare

router = APIRouter(tags=["aftercare"])


@router.get("/me/aftercare", response_model=aftercare.AftercareOut)
async def my_aftercare(db: DbSession, user: CurrentUser) -> aftercare.AftercareOut:
    """Upcoming follow-up video consultations and check-ins of the caller's treated cases (patients: their
    own; agents: their patients')."""
    return await aftercare.my_aftercare(db, user)


@router.get("/aftercare/checkins", response_model=list[aftercare.CheckinOut])
async def list_checkins(case_id: uuid.UUID, db: DbSession, user: CurrentUser) -> list[aftercare.CheckinOut]:
    """All check-ins of one case (patient side, the case's hospital team and staff)."""
    return await aftercare.list_checkins(db, user, case_id)


@router.post("/aftercare/checkins/{checkin_id}", response_model=aftercare.CheckinOut)
async def submit_checkin(
    checkin_id: uuid.UUID, body: aftercare.CheckinSubmit, request: Request, db: DbSession, user: CurrentUser
) -> aftercare.CheckinOut:
    """Answer a check-in once. Fever, breathlessness, wound concerns or pain >= 8 alert the hospital and
    the coordinator (``aftercare.red_flag``)."""
    return await aftercare.submit_checkin(db, user, checkin_id, body, request)
