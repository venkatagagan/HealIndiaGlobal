"""HTTP routes of the guest journey (phase 1). Paths are written in full; the router has no prefix.

A visitor first gets a guest session (``POST /auth/guest``), may search, run AI screenings / report scans
(``GUEST_AI_DAILY_LIMIT`` a day) and book ONE free 15-minute video call with a platform medical coordinator
after verifying an email or phone number.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, Request, status

from app.core.deps import CurrentUser, DbSession, PageParams, require_roles
from app.core.enums import ConsultationStatus, UserRole
from app.core.pagination import Page, paginate
from app.core.rate_limit import rate_limit
from app.models import IntroConsultation, User
from app.modules.guests import service

router = APIRouter(tags=["guests"])

Coordinator = Annotated[User, Depends(require_roles(UserRole.SUPPORT, UserRole.ADMIN))]
DeviceId = Annotated[str | None, Header(alias="X-Device-Id", max_length=200)]


@router.post(
    "/guest/verify/start",
    response_model=service.VerifyStartOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[
        Depends(rate_limit("guest.verify_start", 5, 600)),
        Depends(rate_limit("guest.verify_start_user", 5, 3600, key="user")),
    ],
)
async def verify_start(
    body: service.VerifyStartIn, request: Request, db: DbSession, user: CurrentUser
) -> service.VerifyStartOut:
    """Send a 6-digit code (valid 10 minutes) to the email or phone number."""
    return await service.start_verification(db, user, body, request)


@router.post(
    "/guest/verify/confirm",
    response_model=service.VerifyConfirmOut,
    dependencies=[Depends(rate_limit("guest.verify_confirm", 20, 600))],
)
async def verify_confirm(
    body: service.VerifyConfirmIn, request: Request, db: DbSession, user: CurrentUser
) -> service.VerifyConfirmOut:
    """Check the code (5 attempts)."""
    return await service.confirm_verification(db, user, body, request)


@router.post(
    "/guest/consultation",
    response_model=service.IntroConsultationOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit("guest.consultation", 5, 3600))],
)
async def request_consultation(
    body: service.IntroRequestIn,
    request: Request,
    db: DbSession,
    user: CurrentUser,
    device_id: DeviceId = None,
) -> service.IntroConsultationOut:
    """Book the one free 15-minute video call with a medical coordinator (one per verified contact and per
    device). A coordinator confirms the time; the video link appears once it is scheduled."""
    return await service.request_intro(db, user, body, device_id, request)


@router.get("/guest/consultation", response_model=service.IntroConsultationOut)
async def my_consultation(db: DbSession, user: CurrentUser) -> service.IntroConsultationOut:
    """The caller's free intro call (404 when none was requested)."""
    return await service.my_intro(db, user)


# --------------------------------------------------------------------------------------------- coordinators
@router.get("/admin/intro-consultations", response_model=Page[service.IntroConsultationAdminOut])
async def list_intro_consultations(
    db: DbSession,
    user: Coordinator,
    params: PageParams,
    status_: Annotated[ConsultationStatus | None, Query(alias="status")] = None,
    mine: Annotated[bool, Query(description="Only calls assigned to me")] = False,
) -> Page[service.IntroConsultationAdminOut]:
    """Free intro calls for coordinators (unscheduled first, then by time)."""
    stmt = service.intro_list_stmt(status_, mine, user)

    async def transform(rows: list[IntroConsultation]) -> list[service.IntroConsultationAdminOut]:
        return await service.admin_outs(db, list(rows))

    return await paginate(db, stmt, params, transform=transform)


@router.patch("/admin/intro-consultations/{intro_id}", response_model=service.IntroConsultationAdminOut)
async def update_intro_consultation(
    intro_id: uuid.UUID,
    body: service.IntroConsultationUpdate,
    request: Request,
    db: DbSession,
    user: Coordinator,
) -> service.IntroConsultationAdminOut:
    """Schedule (``scheduled_at``; a Jitsi link is created when ``meeting_url`` is empty), reassign,
    complete or cancel a free intro call."""
    return await service.update_intro(db, user, intro_id, body, request)
