"""Insurance & pay-later partner routes.

Public: ``GET /insurance/products``, ``GET /financing/partners``. Patients (guests included):
``/insurance/requests``, ``/financing/eligibility-checks`` (+ ``/{id}/cancel``). Any signed-in user:
``GET /financing/installment-plan`` (CG-18 rule). Staff: ``/admin/insurance/*``, ``/admin/financing/*``
(catalog writes admin/super_admin; lead updates any staff)."""

from __future__ import annotations

import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response

from app.core.deps import ADMIN_ROLES, STAFF_ROLES, CurrentUser, DbSession, PageParams, require_roles
from app.core.enums import PartnerKind, PartnerLeadStatus, UserRole
from app.core.pagination import Page
from app.models import User
from app.modules.partners import service
from app.modules.partners.schemas import (
    AdminLeadOut,
    InstallmentPlanOut,
    LeadCreate,
    LeadOut,
    LeadStatusCounts,
    LeadUpdate,
    OfferingIn,
    OfferingOut,
    OfferingPatch,
)

router = APIRouter(tags=["partners"])

PatientUser = Annotated[User, Depends(require_roles(UserRole.PATIENT))]
StaffUser = Annotated[User, Depends(require_roles(*STAFF_ROLES))]
AdminUser = Annotated[User, Depends(require_roles(*ADMIN_ROLES))]
CountryQ = Annotated[str | None, Query(max_length=2, description="patient's home country, ISO-3166 alpha-2")]

INS, PL = PartnerKind.INSURANCE, PartnerKind.PAY_LATER


# ------------------------------------------------------------------------------------------------- public
@router.get("/insurance/products", response_model=list[OfferingOut])
async def insurance_products(db: DbSession, country: CountryQ = None) -> list[OfferingOut]:
    return await service.public_catalog(db, INS, country)


@router.get("/financing/partners", response_model=list[OfferingOut])
async def financing_partners(db: DbSession, country: CountryQ = None) -> list[OfferingOut]:
    return await service.public_catalog(db, PL, country)


@router.get("/financing/installment-plan", response_model=InstallmentPlanOut)
async def installment_plan(
    db: DbSession,
    _: CurrentUser,
    admission_date: date,
    months: Annotated[int | None, Query(ge=1, le=service.MAX_INSTALLMENT_MONTHS)] = None,
    total_minor: Annotated[int | None, Query(ge=0)] = None,
    deposit_minor: Annotated[int | None, Query(ge=0)] = None,
    country: CountryQ = None,
) -> InstallmentPlanOut:
    return await service.installment_plan(db, admission_date, months, total_minor, deposit_minor, country)


# ------------------------------------------------------------------------------------------------ patient
@router.post("/insurance/requests", response_model=LeadOut, status_code=201)
async def create_insurance_request(
    body: LeadCreate, request: Request, db: DbSession, user: PatientUser
) -> LeadOut:
    return await service.create_lead(db, user, INS, body, request)


@router.get("/insurance/requests", response_model=list[LeadOut])
async def my_insurance_requests(db: DbSession, user: PatientUser) -> list[LeadOut]:
    return await service.my_leads(db, user, INS)


@router.post("/insurance/requests/{lead_id}/cancel", response_model=LeadOut)
async def cancel_insurance_request(
    lead_id: uuid.UUID, request: Request, db: DbSession, user: PatientUser
) -> LeadOut:
    return await service.cancel_lead(db, user, INS, lead_id, request)


@router.post("/financing/eligibility-checks", response_model=LeadOut, status_code=201)
async def create_eligibility_check(
    body: LeadCreate, request: Request, db: DbSession, user: PatientUser
) -> LeadOut:
    return await service.create_lead(db, user, PL, body, request)


@router.get("/financing/eligibility-checks", response_model=list[LeadOut])
async def my_eligibility_checks(db: DbSession, user: PatientUser) -> list[LeadOut]:
    return await service.my_leads(db, user, PL)


@router.post("/financing/eligibility-checks/{lead_id}/cancel", response_model=LeadOut)
async def cancel_eligibility_check(
    lead_id: uuid.UUID, request: Request, db: DbSession, user: PatientUser
) -> LeadOut:
    return await service.cancel_lead(db, user, PL, lead_id, request)


# -------------------------------------------------------------------------------------------------- admin
def _register_admin(kind: PartnerKind, catalog: str, leads: str) -> None:
    @router.get(catalog, response_model=list[OfferingOut], name=f"admin_list_{kind.value}")
    async def list_catalog(db: DbSession, _: StaffUser) -> list[OfferingOut]:
        return await service.admin_catalog(db, kind)

    @router.post(catalog, response_model=OfferingOut, status_code=201, name=f"admin_create_{kind.value}")
    async def create_catalog(
        body: OfferingIn, request: Request, db: DbSession, actor: AdminUser
    ) -> OfferingOut:
        return await service.create_offering(db, actor, kind, body, request)

    @router.patch(catalog + "/{offering_id}", response_model=OfferingOut, name=f"admin_update_{kind.value}")
    async def update_catalog(
        offering_id: uuid.UUID, body: OfferingPatch, request: Request, db: DbSession, actor: AdminUser
    ) -> OfferingOut:
        return await service.update_offering(db, actor, kind, offering_id, body, request)

    @router.delete(catalog + "/{offering_id}", status_code=204, name=f"admin_delete_{kind.value}")
    async def delete_catalog(
        offering_id: uuid.UUID, request: Request, db: DbSession, actor: AdminUser
    ) -> Response:
        await service.delete_offering(db, actor, kind, offering_id, request)
        return Response(status_code=204)

    @router.get(leads, response_model=Page[AdminLeadOut], name=f"admin_leads_{kind.value}")
    async def list_leads(
        db: DbSession, _: StaffUser, params: PageParams, status: PartnerLeadStatus | None = None
    ) -> Page[AdminLeadOut]:
        return await service.admin_leads(db, kind, params, status)

    @router.get(
        leads + "/status-counts", response_model=LeadStatusCounts, name=f"admin_lead_counts_{kind.value}"
    )
    async def lead_counts(db: DbSession, _: StaffUser) -> LeadStatusCounts:
        return await service.admin_status_counts(db, kind)

    @router.patch(leads + "/{lead_id}", response_model=AdminLeadOut, name=f"admin_update_lead_{kind.value}")
    async def update_lead(
        lead_id: uuid.UUID, body: LeadUpdate, request: Request, db: DbSession, actor: StaffUser
    ) -> AdminLeadOut:
        return await service.update_lead(db, actor, kind, lead_id, body, request)


_register_admin(INS, "/admin/insurance/products", "/admin/insurance/requests")
_register_admin(PL, "/admin/financing/partners", "/admin/financing/requests")
