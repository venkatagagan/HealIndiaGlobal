"""HTTP routes for privacy and data rights. Paths are written in full (the router has no prefix).

Public:   GET  /site-config/privacy-contact, POST /privacy/requests (also signed in)
Users:    GET  /auth/me/export, GET /privacy/requests[/{id}], GET|PUT|DELETE /privacy/nominee,
          GET|POST|DELETE /privacy/guardian-consent, GET /privacy/access-log
Staff:    /admin/privacy/* (requests queue, guardian verification, access logs, legal holds, breach register)
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Query, Request, Response, status

from app.core.config import settings
from app.core.deps import (
    ADMIN_ROLES,
    CurrentUser,
    DbSession,
    OptionalUser,
    PageParams,
    require_roles,
)
from app.core.enums import UserRole
from app.core.pagination import Page
from app.core.rate_limit import hit, rate_limit
from app.models import User
from app.models.privacy import BreachStatus, DataRightsRequestKind, DataRightsRequestStatus
from app.modules.privacy import service
from app.modules.privacy.export import export_user_data
from app.modules.privacy.schemas import (
    AccessLogEntry,
    AdminDataRightsRequestOut,
    BreachIn,
    BreachOut,
    BreachUpdate,
    DataRightsRequestIn,
    DataRightsRequestOut,
    DataRightsRequestUpdate,
    GuardianConsentIn,
    GuardianConsentOut,
    GuardianStatusOut,
    LegalHoldIn,
    LegalHoldOut,
    NomineeIn,
    NomineeOut,
    PrivacyContactOut,
)

router = APIRouter(tags=["privacy"])

PrivacyStaff = Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPPORT))]
PrivacyAdmin = Annotated[User, Depends(require_roles(*ADMIN_ROLES))]


# --- public -------------------------------------------------------------------------------------------------
@router.get(
    "/site-config/privacy-contact",
    response_model=PrivacyContactOut,
    dependencies=[Depends(rate_limit("privacy.contact", 60, 60))],
)
async def privacy_contact(response: Response) -> PrivacyContactOut:
    """Grievance Officer and DPO contact details (DPDP s.8(10), Rule 14; GDPR Art. 13)."""
    response.headers["Cache-Control"] = "public, max-age=300"
    return service.privacy_contact()


@router.post(
    "/privacy/requests",
    status_code=status.HTTP_201_CREATED,
    response_model=DataRightsRequestOut,
    dependencies=[Depends(rate_limit("privacy.request", 5, 3600))],
)
async def create_request(
    body: DataRightsRequestIn, request: Request, db: DbSession, user: OptionalUser
) -> DataRightsRequestOut:
    """File a data-rights request or grievance (access, correction, erasure, nomination, consent withdrawal,
    complaint). Without signing in, name and email are required."""
    return service.request_out(await service.create_request(db, user, body, request))


# --- signed-in users ----------------------------------------------------------------------------------------
@router.get(
    "/auth/me/export",
    response_class=Response,
    responses={200: {"content": {"application/zip": {}, "application/json": {}}, "description": "Your data"}},
)
async def export_my_data(
    request: Request,
    db: DbSession,
    user: CurrentUser,
    format: Annotated[Literal["zip", "json"], Query()] = "zip",  # noqa: A002 - public query name
) -> Response:
    """Download everything we hold about you: JSON, or a ZIP with the JSON and your files."""
    await hit(
        "privacy.export",
        str(user.id),
        settings.DATA_EXPORT_DAILY_LIMIT,
        86_400,
        message="You can download your data a few times a day. Please try again tomorrow.",
    )
    payload = await export_user_data(db, user, as_zip=format == "zip", request=request)
    stamp = datetime.now(UTC).strftime("%Y%m%d")
    name = f"healindia-my-data-{stamp}.{format}"
    return Response(
        content=payload,
        media_type="application/zip" if format == "zip" else "application/json",
        headers={
            "Content-Disposition": f'attachment; filename="{name}"',
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/privacy/requests", response_model=list[DataRightsRequestOut])
async def my_requests(db: DbSession, user: CurrentUser) -> list[DataRightsRequestOut]:
    return [service.request_out(r) for r in await service.list_my_requests(db, user)]


@router.get("/privacy/requests/{request_id}", response_model=DataRightsRequestOut)
async def my_request(request_id: uuid.UUID, db: DbSession, user: CurrentUser) -> DataRightsRequestOut:
    return service.request_out(await service.get_my_request(db, user, request_id))


@router.get("/privacy/nominee", response_model=NomineeOut | None)
async def get_nominee(db: DbSession, user: CurrentUser) -> Any:
    row = await service.get_nominee(db, user)
    return NomineeOut.model_validate(row) if row is not None else None


@router.put(
    "/privacy/nominee",
    response_model=NomineeOut,
    dependencies=[Depends(rate_limit("privacy.nominee", 10, 3600, key="user"))],
)
async def put_nominee(body: NomineeIn, request: Request, db: DbSession, user: CurrentUser) -> NomineeOut:
    """Nominate someone to exercise your data rights if you die or cannot act yourself (DPDP s.14)."""
    return NomineeOut.model_validate(await service.set_nominee(db, user, body, request))


@router.delete("/privacy/nominee", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def delete_nominee(request: Request, db: DbSession, user: CurrentUser) -> Response:
    await service.remove_nominee(db, user, request)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/privacy/guardian-consent", response_model=GuardianStatusOut)
async def guardian_status(
    db: DbSession, user: CurrentUser, patient_id: Annotated[uuid.UUID | None, Query()] = None
) -> GuardianStatusOut:
    """Whether the patient is under 18 and a verified guardian consent is in place."""
    return await service.guardian_status(db, user, patient_id)


@router.post(
    "/privacy/guardian-consent",
    status_code=status.HTTP_201_CREATED,
    response_model=GuardianConsentOut,
    dependencies=[Depends(rate_limit("privacy.guardian", 10, 3600, key="user"))],
)
async def record_guardian_consent(
    body: GuardianConsentIn, request: Request, db: DbSession, user: CurrentUser
) -> GuardianConsentOut:
    return GuardianConsentOut.model_validate(await service.record_guardian_consent(db, user, body, request))


@router.delete("/privacy/guardian-consent", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def revoke_guardian_consent(
    request: Request,
    db: DbSession,
    user: CurrentUser,
    patient_id: Annotated[uuid.UUID | None, Query()] = None,
) -> Response:
    await service.revoke_guardian_consent(db, user, patient_id, request)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/privacy/access-log", response_model=list[AccessLogEntry])
async def my_access_log(db: DbSession, user: CurrentUser) -> list[dict[str, Any]]:
    """Who viewed or downloaded your health records (other than you)."""
    return await service.my_access_log(db, user)


# --- staff --------------------------------------------------------------------------------------------------
@router.get("/admin/privacy/requests", response_model=Page[AdminDataRightsRequestOut])
async def admin_requests(
    db: DbSession,
    _: PrivacyStaff,
    params: PageParams,
    status_: Annotated[DataRightsRequestStatus | None, Query(alias="status")] = None,
    kind: Annotated[DataRightsRequestKind | None, Query()] = None,
    open_only: Annotated[bool, Query(alias="open")] = False,
    overdue: Annotated[bool, Query()] = False,
) -> Page[Any]:
    rows, total = await service.admin_list_requests(
        db, params, status=status_, kind=kind, open_only=open_only, overdue_only=overdue
    )
    pages = (total + params.page_size - 1) // params.page_size if total else 0
    return Page[Any](
        items=[service.request_out(r, admin=True) for r in rows],
        total=total,
        page=params.page,
        page_size=params.page_size,
        pages=pages,
    )


@router.patch("/admin/privacy/requests/{request_id}", response_model=AdminDataRightsRequestOut)
async def admin_update_request(
    request_id: uuid.UUID, body: DataRightsRequestUpdate, request: Request, db: DbSession, actor: PrivacyStaff
) -> DataRightsRequestOut:
    return service.request_out(
        await service.admin_update_request(db, actor, request_id, body, request), admin=True
    )


@router.get("/admin/privacy/guardian-consents", response_model=list[GuardianConsentOut])
async def admin_pending_guardian_consents(db: DbSession, _: PrivacyStaff) -> list[GuardianConsentOut]:
    return [GuardianConsentOut.model_validate(r) for r in await service.list_pending_guardian_consents(db)]


@router.post("/admin/privacy/guardian-consents/{consent_id}/verify", response_model=GuardianConsentOut)
async def admin_verify_guardian_consent(
    consent_id: uuid.UUID, request: Request, db: DbSession, actor: PrivacyStaff
) -> GuardianConsentOut:
    return GuardianConsentOut.model_validate(
        await service.verify_guardian_consent(db, actor, consent_id, request)
    )


@router.get("/admin/privacy/access-log", response_model=list[AccessLogEntry])
async def admin_access_log(
    db: DbSession, _: PrivacyAdmin, patient_id: Annotated[uuid.UUID, Query()]
) -> list[dict[str, Any]]:
    """Every read of a patient's health records by someone other than the patient."""
    return await service.patient_access_log(db, patient_id)


@router.get("/admin/privacy/legal-holds", response_model=list[LegalHoldOut])
async def admin_legal_holds(db: DbSession, _: PrivacyAdmin) -> list[LegalHoldOut]:
    return await service.list_holds(db)


@router.put("/admin/privacy/legal-holds/users/{user_id}", response_model=LegalHoldOut)
async def admin_user_hold(
    user_id: uuid.UUID, body: LegalHoldIn, request: Request, db: DbSession, actor: PrivacyAdmin
) -> LegalHoldOut:
    """Place or release a legal hold on an account (blocks erasure and retention purges). Audited."""
    return await service.set_user_hold(db, actor, user_id, body, request)


@router.put("/admin/privacy/legal-holds/cases/{case_id}", response_model=LegalHoldOut)
async def admin_case_hold(
    case_id: uuid.UUID, body: LegalHoldIn, request: Request, db: DbSession, actor: PrivacyAdmin
) -> LegalHoldOut:
    return await service.set_case_hold(db, actor, case_id, body, request)


@router.get("/admin/privacy/breaches", response_model=list[BreachOut])
async def admin_breaches(
    db: DbSession, _: PrivacyAdmin, status_: Annotated[BreachStatus | None, Query(alias="status")] = None
) -> list[BreachOut]:
    return [service.breach_out(b) for b in await service.list_breaches(db, status_)]


@router.post("/admin/privacy/breaches", status_code=status.HTTP_201_CREATED, response_model=BreachOut)
async def admin_record_breach(
    body: BreachIn, request: Request, db: DbSession, actor: PrivacyAdmin
) -> BreachOut:
    """Record a personal-data breach in the register (starts the 72-hour notification clock)."""
    return service.breach_out(await service.record_breach(db, actor, body, request))


@router.patch("/admin/privacy/breaches/{breach_id}", response_model=BreachOut)
async def admin_update_breach(
    breach_id: uuid.UUID, body: BreachUpdate, request: Request, db: DbSession, actor: PrivacyAdmin
) -> BreachOut:
    return service.breach_out(await service.update_breach(db, actor, breach_id, body, request))
