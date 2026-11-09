"""HTTP routes for visa help (phase 1): the public visa guide, admin rule/checklist CRUD and the hospital
invitation letter. Included by the travel router (paths written in full)."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response, status

from app.core.deps import ADMIN_ROLES, STAFF_ROLES, DbSession, require_roles
from app.core.enums import VisaRoute
from app.models import User
from app.modules.hospitals.policies import Portal
from app.modules.travel import visa

router = APIRouter(tags=["visa"])

AdminUser = Annotated[User, Depends(require_roles(*ADMIN_ROLES))]
StaffUser = Annotated[User, Depends(require_roles(*STAFF_ROLES))]
Nationality = Annotated[str, Query(min_length=2, max_length=2, pattern=r"^[A-Za-z]{2}$")]


@router.get("/travel/visa-guide", response_model=visa.VisaGuideOut)
async def visa_guide(nationality: Nationality, db: DbSession) -> visa.VisaGuideOut:
    """Public: how a national of ``nationality`` (ISO2) gets a visa for treatment in India - route,
    checklist, processing time, attendants and the official link."""
    return await visa.visa_guide(db, nationality)


# ---------------------------------------------------------------------------------------------------- admin
@router.get("/admin/visa/rules", response_model=list[visa.VisaCountryRuleOut])
async def list_rules(
    db: DbSession,
    user: StaffUser,
    route: VisaRoute | None = None,
    q: Annotated[str | None, Query(max_length=100, description="ISO2 code or country name")] = None,
) -> list[visa.VisaCountryRuleOut]:
    return [visa.VisaCountryRuleOut.model_validate(r) for r in await visa.list_rules(db, route, q)]


@router.post("/admin/visa/rules", response_model=visa.VisaCountryRuleOut, status_code=status.HTTP_201_CREATED)
async def create_rule(
    body: visa.VisaCountryRuleIn, request: Request, db: DbSession, user: AdminUser
) -> visa.VisaCountryRuleOut:
    return visa.VisaCountryRuleOut.model_validate(await visa.create_rule(db, user, body, request))


@router.patch("/admin/visa/rules/{nationality}", response_model=visa.VisaCountryRuleOut)
async def update_rule(
    nationality: str, body: visa.VisaCountryRuleUpdate, request: Request, db: DbSession, user: AdminUser
) -> visa.VisaCountryRuleOut:
    return visa.VisaCountryRuleOut.model_validate(
        await visa.update_rule(db, user, nationality, body, request)
    )


@router.delete(
    "/admin/visa/rules/{nationality}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response
)
async def delete_rule(nationality: str, request: Request, db: DbSession, user: AdminUser) -> Response:
    await visa.delete_rule(db, user, nationality, request)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/admin/visa/checklist-items", response_model=list[visa.VisaAdminChecklistItemOut])
async def list_checklist_items(
    db: DbSession,
    user: StaffUser,
    route: VisaRoute | None = None,
    nationality: Annotated[str | None, Query(min_length=2, max_length=2)] = None,
) -> list[visa.VisaAdminChecklistItemOut]:
    rows = await visa.list_checklist_items(db, route, nationality)
    return [visa.VisaAdminChecklistItemOut.model_validate(r) for r in rows]


@router.post(
    "/admin/visa/checklist-items",
    response_model=visa.VisaAdminChecklistItemOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_checklist_item(
    body: visa.VisaChecklistItemIn, request: Request, db: DbSession, user: AdminUser
) -> visa.VisaAdminChecklistItemOut:
    return visa.VisaAdminChecklistItemOut.model_validate(
        await visa.create_checklist_item(db, user, body, request)
    )


@router.patch("/admin/visa/checklist-items/{item_id}", response_model=visa.VisaAdminChecklistItemOut)
async def update_checklist_item(
    item_id: uuid.UUID, body: visa.VisaChecklistItemUpdate, request: Request, db: DbSession, user: AdminUser
) -> visa.VisaAdminChecklistItemOut:
    row = await visa.update_checklist_item(db, user, item_id, body, request)
    return visa.VisaAdminChecklistItemOut.model_validate(row)


@router.delete(
    "/admin/visa/checklist-items/{item_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response
)
async def delete_checklist_item(
    item_id: uuid.UUID, request: Request, db: DbSession, user: AdminUser
) -> Response:
    await visa.delete_checklist_item(db, user, item_id, request)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/admin/visa/load-defaults", response_model=visa.LoadDefaultsOut)
async def load_defaults(request: Request, db: DbSession, user: AdminUser) -> visa.LoadDefaultsOut:
    """Insert the built-in rules and checklist items that are missing (edited rows are kept)."""
    return await visa.load_defaults(db, user, request)


# ------------------------------------------------------------------------------------------ hospital portal
@router.post(
    "/hospital-portal/visa-requests/{visa_id}/invitation-letter/generate",
    response_model=visa.InvitationLetterOut,
)
async def generate_invitation_letter(
    visa_id: uuid.UUID,
    request: Request,
    ctx: Portal,
    db: DbSession,
    body: visa.InvitationLetterGenerate | None = None,
) -> visa.InvitationLetterOut:
    """Create (or re-create) the draft invitation letter PDF on the hospital's letterhead. Only the hospital
    and platform staff can see the draft until it is approved."""
    return await visa.generate_invitation_letter(
        db, ctx, visa_id, body or visa.InvitationLetterGenerate(), request
    )


@router.post(
    "/hospital-portal/visa-requests/{visa_id}/invitation-letter/approve",
    response_model=visa.InvitationLetterOut,
)
async def approve_invitation_letter(
    visa_id: uuid.UUID, request: Request, ctx: Portal, db: DbSession
) -> visa.InvitationLetterOut:
    """Approve the draft: it is attached to the visa request (status ``invitation_issued``) and the patient
    can download it from their documents."""
    return await visa.approve_invitation_letter(db, ctx, visa_id, request)
