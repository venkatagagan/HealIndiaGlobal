"""Agent portal routes (PLAN 8.10). Every endpoint requires the ``agent`` role (super_admin passes the role
check but has no agent profile, so it gets 404)."""

from __future__ import annotations

import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request

from app.core.deps import DbSession, PageParams, require_roles
from app.core.enums import SettlementItemStatus, UserRole
from app.core.pagination import Page
from app.models import User
from app.modules.agents import service
from app.modules.agents.schemas import (
    AgentCommissionOut,
    AgentCommissionStatusCounts,
    AgentConsentAttestationIn,
    AgentConsentStatus,
    AgentDashboardOut,
    AgentPatientCounts,
    AgentPatientCreate,
    AgentPatientOut,
    AgentPatientUpdate,
    AgentProfileIn,
    AgentProfileOut,
    ReferralOut,
)

router = APIRouter(tags=["agents"])

AgentUser = Annotated[User, Depends(require_roles(UserRole.AGENT))]


@router.get("/agent-portal/profile", response_model=AgentProfileOut)
async def get_profile(db: DbSession, user: AgentUser) -> AgentProfileOut:
    return await service.profile_out(db, await service.get_agent(db, user))


@router.put("/agent-portal/profile", response_model=AgentProfileOut)
async def update_profile(
    body: AgentProfileIn, request: Request, db: DbSession, user: AgentUser
) -> AgentProfileOut:
    return await service.update_profile(db, user, body, request)


@router.post("/agent-portal/submit-kyc", response_model=AgentProfileOut)
async def submit_kyc(request: Request, db: DbSession, user: AgentUser) -> AgentProfileOut:
    return await service.submit_kyc(db, user, request)


@router.get("/agent-portal/dashboard", response_model=AgentDashboardOut)
async def dashboard(db: DbSession, user: AgentUser) -> AgentDashboardOut:
    return await service.dashboard(db, user)


def patient_list_filters(
    q: Annotated[str | None, Query(max_length=100, description="name, email or phone")] = None,
    consent: Annotated[
        list[AgentConsentStatus] | None, Query(description="consent state (repeatable)")
    ] = None,
    nationality: Annotated[
        list[str] | None, Query(description="ISO-3166 alpha-2 nationality (repeatable)")
    ] = None,
    has_active_case: Annotated[bool | None, Query(description="has a case in an open status")] = None,
    created_from: Annotated[date | None, Query(description="inclusive IST date")] = None,
    created_to: Annotated[date | None, Query(description="inclusive IST date")] = None,
) -> service.PatientListFilters:
    return service.PatientListFilters(
        q=q,
        consent=tuple(consent or ()),
        nationality=tuple(n.strip()[:2] for n in nationality or () if n.strip()),
        has_active_case=has_active_case,
        created_from=created_from,
        created_to=created_to,
    )


PatientFilters = Annotated[service.PatientListFilters, Depends(patient_list_filters)]


@router.get("/agent-portal/patients", response_model=Page[AgentPatientOut])
async def list_patients(
    db: DbSession,
    user: AgentUser,
    params: PageParams,
    filters: PatientFilters,
    sort: Annotated[
        str | None,
        Query(
            pattern=service.PATIENT_SORT_PATTERN,
            description="created_at | updated_at | name; prefix '-' for descending (default -created_at)",
        ),
    ] = None,
) -> Page[AgentPatientOut]:
    return await service.list_patients(db, user, params, filters, sort)


@router.get("/agent-portal/patients/counts", response_model=AgentPatientCounts)
async def patient_counts(db: DbSession, user: AgentUser, filters: PatientFilters) -> AgentPatientCounts:
    """Patients per consent state and per nationality for the same filters as the list (each facet ignores
    its own filter) - drives the consent tabs and the nationality options."""
    return await service.patient_counts(db, user, filters)


@router.post("/agent-portal/patients", response_model=AgentPatientOut, status_code=201)
async def create_patient(
    body: AgentPatientCreate, request: Request, db: DbSession, user: AgentUser
) -> AgentPatientOut:
    return await service.create_patient(db, user, body, request)


@router.get("/agent-portal/patients/{patient_id}", response_model=AgentPatientOut)
async def get_patient(patient_id: uuid.UUID, db: DbSession, user: AgentUser) -> AgentPatientOut:
    return await service.get_patient(db, user, patient_id)


@router.patch("/agent-portal/patients/{patient_id}", response_model=AgentPatientOut)
async def update_patient(
    patient_id: uuid.UUID, body: AgentPatientUpdate, request: Request, db: DbSession, user: AgentUser
) -> AgentPatientOut:
    return await service.update_patient(db, user, patient_id, body, request)


@router.post("/agent-portal/patients/{patient_id}/consent", response_model=AgentPatientOut)
async def attest_consent(
    patient_id: uuid.UUID, body: AgentConsentAttestationIn, request: Request, db: DbSession, user: AgentUser
) -> AgentPatientOut:
    """The agent confirms the patient consented; the patient must still confirm on first login."""
    return await service.attest_consent(db, user, patient_id, body, request)


@router.get("/agent-portal/referral", response_model=ReferralOut)
async def referral(db: DbSession, user: AgentUser) -> ReferralOut:
    return service.referral(await service.get_agent(db, user))


def commission_list_filters(
    status: Annotated[
        list[SettlementItemStatus] | None, Query(description="item status (repeatable)")
    ] = None,
    hospital_id: uuid.UUID | None = None,
    q: Annotated[
        str | None, Query(max_length=100, description="booking/case number, patient or hospital name")
    ] = None,
    created_from: Annotated[date | None, Query(description="inclusive IST date")] = None,
    created_to: Annotated[date | None, Query(description="inclusive IST date")] = None,
    min_net: Annotated[int | None, Query(description="minimum net amount (minor units)")] = None,
    max_net: Annotated[int | None, Query(description="maximum net amount (minor units)")] = None,
) -> service.CommissionListFilters:
    return service.CommissionListFilters(
        status=tuple(status or ()),
        hospital_id=hospital_id,
        q=q,
        created_from=created_from,
        created_to=created_to,
        min_net=min_net,
        max_net=max_net,
    )


CommissionFilters = Annotated[service.CommissionListFilters, Depends(commission_list_filters)]


@router.get("/agent-portal/commissions", response_model=Page[AgentCommissionOut])
async def commissions(
    db: DbSession,
    user: AgentUser,
    params: PageParams,
    filters: CommissionFilters,
    sort: Annotated[
        str | None,
        Query(
            pattern=service.COMMISSION_SORT_PATTERN,
            description="created_at | eligible_at | net_minor | gross_minor | status | booking_number; "
            "prefix '-' for descending (default -created_at)",
        ),
    ] = None,
) -> Page[AgentCommissionOut]:
    return await service.list_commissions(db, user, params, filters, sort)


@router.get("/agent-portal/commissions/status-counts", response_model=AgentCommissionStatusCounts)
async def commission_status_counts(
    db: DbSession, user: AgentUser, filters: CommissionFilters
) -> AgentCommissionStatusCounts:
    """Items and net amount per status for the same filters as the list (``status`` itself is ignored)."""
    return await service.commission_status_counts(db, user, filters)
