"""Routes: content reports (``/reports``), the moderation queue (``/admin/reports``), push device tokens
(``/notifications/devices``) and website enquiries (``/site/enquiries``, ``/admin/enquiries``).

Mounted AFTER the admin router so the fixed ``/admin/reports/revenue|cases|export`` routes win over
``/admin/reports/{report_id}``.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response, status

from app.core.deps import CurrentUser, DbSession, PageParams, require_roles
from app.core.enums import EnquiryStatus, ReportStatus, ReportTargetType, UserRole
from app.core.pagination import Page
from app.core.rate_limit import rate_limit
from app.models import User
from app.modules.messaging import push
from app.modules.messaging.schemas import (
    AdminReportOut,
    DeviceRegisterIn,
    EnquiryAccepted,
    EnquiryCreate,
    EnquiryOut,
    EnquiryUpdate,
    ReportCreate,
    ReportOut,
    ReportResolveIn,
)
from app.modules.moderation import enquiries, service

router = APIRouter(tags=["moderation"])

ModeratorUser = Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPPORT))]
ReportLimit = Annotated[None, Depends(rate_limit("reports.create", 20, 3600, key="user"))]
DeviceLimit = Annotated[None, Depends(rate_limit("notifications.devices", 30, 60, key="user"))]


# --------------------------------------------------------------------------------------------- push devices
@router.post(
    "/notifications/devices",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    tags=["messaging"],
)
async def register_push_device(
    body: DeviceRegisterIn, db: DbSession, user: CurrentUser, _: DeviceLimit
) -> Response:
    """Register (or refresh) this device's FCM token for push notifications."""
    await push.register_device(db, user, body.platform, body.token, body.app_version)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete(
    "/notifications/devices",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    tags=["messaging"],
)
async def remove_push_device(
    db: DbSession, user: CurrentUser, token: Annotated[str, Query(min_length=8, max_length=512)]
) -> Response:
    """Forget a device token (call on sign-out, before the session is cleared)."""
    await push.remove_device(db, user, token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ------------------------------------------------------------------------------------------------ reports
@router.post("/reports", response_model=ReportOut, status_code=status.HTTP_201_CREATED)
async def create_report(
    body: ReportCreate, request: Request, db: DbSession, user: CurrentUser, _: ReportLimit
) -> ReportOut:
    return await service.create_report(db, user, body, request)


@router.get("/admin/reports", response_model=Page[AdminReportOut])
async def list_reports(
    db: DbSession,
    user: ModeratorUser,
    params: PageParams,
    status_: Annotated[ReportStatus | None, Query(alias="status")] = ReportStatus.OPEN,
    target_type: ReportTargetType | None = None,
) -> Page[AdminReportOut]:
    return await service.list_reports(db, params, status=status_, target_type=target_type)


@router.get("/admin/reports/{report_id}", response_model=AdminReportOut)
async def get_report(report_id: uuid.UUID, db: DbSession, user: ModeratorUser) -> AdminReportOut:
    return await service.get_report(db, report_id)


@router.post("/admin/reports/{report_id}/resolve", response_model=AdminReportOut)
async def resolve_report(
    report_id: uuid.UUID, body: ReportResolveIn, request: Request, db: DbSession, user: ModeratorUser
) -> AdminReportOut:
    return await service.resolve_report(db, user, report_id, body, request)


# ------------------------------------------------------------------------------------- website enquiries
@router.post(
    "/site/enquiries",
    response_model=EnquiryAccepted,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(rate_limit("site.enquiries", 5, 600))],
    tags=["site"],
)
async def create_enquiry(body: EnquiryCreate, request: Request, db: DbSession) -> EnquiryAccepted:
    await enquiries.create_enquiry(db, body, request)
    return EnquiryAccepted()


@router.get("/admin/enquiries", response_model=Page[EnquiryOut])
async def list_enquiries(
    db: DbSession,
    user: ModeratorUser,
    params: PageParams,
    status_: Annotated[EnquiryStatus | None, Query(alias="status")] = None,
) -> Page[EnquiryOut]:
    return await enquiries.list_enquiries(db, params, status_)


@router.patch("/admin/enquiries/{enquiry_id}", response_model=EnquiryOut)
async def update_enquiry(
    enquiry_id: uuid.UUID, body: EnquiryUpdate, request: Request, db: DbSession, user: ModeratorUser
) -> EnquiryOut:
    return await enquiries.update_enquiry(db, user, enquiry_id, body.status, request)
