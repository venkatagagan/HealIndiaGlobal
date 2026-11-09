"""HTTP routes for the admin console (PLAN 8.13). Full paths in each decorator; the router has no prefix.

Role gates: S (admin|finance|support|super_admin) for reads; AD (admin|super_admin) for user, staff,
approval and catalog writes; finance settings keys F (finance|super_admin), other settings AD;
commission/cycle/tier patches AD or F.
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.responses import StreamingResponse

from app.core.audit import audit_log
from app.core.deps import ADMIN_ROLES, FINANCE_ROLES, STAFF_ROLES, DbSession, PageParams, require_roles
from app.core.enums import (
    AgentStatus,
    AgentTier,
    HospitalStatus,
    KycStatus,
    ServiceKind,
    UserRole,
    UserStatus,
)
from app.core.pagination import Page
from app.models import User
from app.modules.admin import catalog_admin, dashboard, listing, reports, service
from app.modules.admin.schemas import (
    AccommodationProviderIn,
    AccommodationProviderOut,
    AccommodationProviderPatch,
    AdminAgentOut,
    AdminAgentUpdateIn,
    AdminDashboard,
    AdminDoctorOut,
    AdminFacets,
    AdminHospitalDetail,
    AdminHospitalUpdateIn,
    AdminProcedureOut,
    AdminSpecialtyOut,
    AdminUserDetail,
    AdminUserOut,
    AdminUserUpdateIn,
    AuditLogOut,
    CasesReport,
    CostBenchmarkIn,
    CostBenchmarkOut,
    CostBenchmarkPatch,
    CulturalTipIn,
    CulturalTipOut,
    CulturalTipPatch,
    ExportType,
    FxRateIn,
    FxRateOut,
    FxRatePatch,
    HospitalProfileOut,
    OptionalReasonIn,
    PlatformSettingIn,
    PlatformSettingOut,
    ProcedureIn,
    ProcedurePatch,
    ReasonIn,
    ReportGroupBy,
    RevenueReport,
    ServiceProviderIn,
    ServiceProviderOut,
    ServiceProviderPatch,
    SpecialtyIn,
    SpecialtyPatch,
    StaffCreateIn,
    StaffMemberOut,
    StatusCounts,
)

router = APIRouter(tags=["admin"])

StaffUser = Annotated[User, Depends(require_roles(*STAFF_ROLES))]
AdminUser = Annotated[User, Depends(require_roles(*ADMIN_ROLES))]
AdminOrFinanceUser = Annotated[User, Depends(require_roles(*(ADMIN_ROLES | FINANCE_ROLES)))]
DateFrom = Annotated[date | None, Query(alias="from")]
DateTo = Annotated[date | None, Query(alias="to")]
SearchQ = Annotated[str | None, Query(max_length=100)]


# ------------------------------------------------------------------------------------------------ dashboard
@router.get("/admin/dashboard", response_model=AdminDashboard)
async def admin_dashboard(db: DbSession, _: StaffUser) -> AdminDashboard:
    return await reports.dashboard(db)


@router.get("/admin/dashboard/overview", response_model=dashboard.DashboardOverview)
async def admin_dashboard_overview(
    db: DbSession, _: StaffUser, period: dashboard.DashboardPeriod = "30d"
) -> dashboard.DashboardOverview:
    """Work queue + period KPIs (vs the previous period), series, funnel and upcoming admissions."""
    return await dashboard.overview(db, period)


# ---------------------------------------------------------------------------------------------------- users
def user_list_filters(
    role: Annotated[list[UserRole] | None, Query(description="Repeatable")] = None,
    status: Annotated[list[UserStatus] | None, Query(description="Repeatable")] = None,
    q: SearchQ = None,
    country_code: Annotated[list[str] | None, Query(description="ISO-2, repeatable")] = None,
    created_from: date | None = None,
    created_to: date | None = None,
    email_verified: bool | None = None,
    mfa_enabled: bool | None = None,
    is_guest: bool | None = None,
) -> dict[str, Any]:
    """Filters of ``GET /admin/users`` and ``GET /admin/users/role-counts`` (dates: inclusive IST days)."""
    return {
        "role": role or None,
        "status": status or None,
        "q": q,
        "country_code": country_code or None,
        "created_from": created_from,
        "created_to": created_to,
        "email_verified": email_verified,
        "mfa_enabled": mfa_enabled,
        "is_guest": is_guest,
    }


UserFilters = Annotated[dict[str, Any], Depends(user_list_filters)]


@router.get("/admin/users", response_model=Page[AdminUserOut])
async def list_users(
    db: DbSession,
    _: StaffUser,
    params: PageParams,
    filters: UserFilters,
    sort: Annotated[
        str | None,
        Query(pattern=listing.sort_pattern(listing.USER_SORT_FIELDS), description="'-' prefix = descending"),
    ] = None,
) -> Page[AdminUserOut]:
    return await service.list_users(db, params, sort=sort, **filters)


@router.get("/admin/users/role-counts", response_model=StatusCounts)
async def user_role_counts(db: DbSession, _: StaffUser, filters: UserFilters) -> StatusCounts:
    """Users per role for the same filters as ``GET /admin/users`` (``role`` is ignored)."""
    start, end = service.day_bounds(filters.pop("created_from"), filters.pop("created_to"))
    counts = await listing.user_role_counts(db, created_from=start, created_to=end, **filters)
    return StatusCounts(counts=counts, total=sum(counts.values()))


@router.get("/admin/facets", response_model=AdminFacets)
async def admin_facets(db: DbSession, _: StaffUser) -> AdminFacets:
    """Distinct values for the admin list filters (cities, countries, accreditations, audit actions ...)."""
    return AdminFacets(**await listing.admin_facets(db))


@router.get("/admin/users/{user_id}", response_model=AdminUserDetail)
async def get_user(user_id: uuid.UUID, db: DbSession, _: StaffUser) -> AdminUserDetail:
    return await service.get_user_detail(db, user_id)


@router.patch("/admin/users/{user_id}", response_model=AdminUserDetail)
async def update_user(
    user_id: uuid.UUID, body: AdminUserUpdateIn, request: Request, db: DbSession, actor: AdminUser
) -> AdminUserDetail:
    return await service.update_user(db, actor, user_id, body, request)


@router.post("/admin/users", response_model=AdminUserOut, status_code=201)
async def create_staff(
    body: StaffCreateIn, request: Request, db: DbSession, actor: AdminUser
) -> AdminUserOut:
    return await service.create_staff(db, actor, body, request)


@router.get("/admin/staff", response_model=list[StaffMemberOut])
async def list_staff(db: DbSession, _: StaffUser, role: UserRole | None = None) -> list[StaffMemberOut]:
    return await service.list_staff(db, role)


# ------------------------------------------------------------------------------------------------ hospitals
def hospital_list_filters(
    status: Annotated[list[HospitalStatus] | None, Query(description="Repeatable")] = None,
    q: SearchQ = None,
    kyc_status: Annotated[list[KycStatus] | None, Query(description="Repeatable")] = None,
    city: Annotated[list[str] | None, Query(description="Repeatable, case-insensitive")] = None,
    state: Annotated[list[str] | None, Query(description="Repeatable, case-insensitive")] = None,
    accreditation: Annotated[list[str] | None, Query(description="Any of (repeatable)")] = None,
    specialty_id: uuid.UUID | None = None,
    is_featured: bool | None = None,
) -> dict[str, Any]:
    """Filters of ``GET /admin/hospitals`` and ``GET /admin/hospitals/status-counts``."""
    return {
        "status": status or None,
        "q": q,
        "kyc_status": kyc_status or None,
        "city": city or None,
        "state": state or None,
        "accreditation": accreditation or None,
        "specialty_id": specialty_id,
        "is_featured": is_featured,
    }


HospitalFilters = Annotated[dict[str, Any], Depends(hospital_list_filters)]


@router.get("/admin/hospitals", response_model=Page[HospitalProfileOut])
async def list_hospitals(
    db: DbSession,
    _: StaffUser,
    params: PageParams,
    filters: HospitalFilters,
    sort: Annotated[
        str | None,
        Query(
            pattern=listing.sort_pattern(listing.HOSPITAL_SORT_FIELDS),
            description="name | city | created_at | updated_at | rating_avg; default: approval queue first",
        ),
    ] = None,
) -> Page[HospitalProfileOut]:
    return await service.list_hospitals(db, params, sort=sort, **filters)


@router.get("/admin/hospitals/status-counts", response_model=StatusCounts)
async def hospital_status_counts(db: DbSession, _: StaffUser, filters: HospitalFilters) -> StatusCounts:
    """Hospitals per status for the same filters as ``GET /admin/hospitals`` (``status`` is ignored)."""
    counts = await listing.hospital_status_counts(db, **filters)
    return StatusCounts(counts=counts, total=sum(counts.values()))


@router.get("/admin/hospitals/{hospital_id}", response_model=AdminHospitalDetail)
async def get_hospital(hospital_id: uuid.UUID, db: DbSession, _: StaffUser) -> AdminHospitalDetail:
    return await service.get_hospital_detail(db, hospital_id)


@router.post("/admin/hospitals/{hospital_id}/approve", response_model=AdminHospitalDetail)
async def approve_hospital(
    hospital_id: uuid.UUID, request: Request, db: DbSession, actor: AdminUser
) -> AdminHospitalDetail:
    return await service.approve_hospital(db, actor, hospital_id, request)


@router.post("/admin/hospitals/{hospital_id}/reject", response_model=AdminHospitalDetail)
async def reject_hospital(
    hospital_id: uuid.UUID, body: ReasonIn, request: Request, db: DbSession, actor: AdminUser
) -> AdminHospitalDetail:
    return await service.reject_hospital(db, actor, hospital_id, body.reason, request)


@router.post("/admin/hospitals/{hospital_id}/suspend", response_model=AdminHospitalDetail)
async def suspend_hospital(
    hospital_id: uuid.UUID,
    request: Request,
    db: DbSession,
    actor: AdminUser,
    body: OptionalReasonIn | None = None,
) -> AdminHospitalDetail:
    return await service.suspend_hospital(db, actor, hospital_id, body.reason if body else None, request)


@router.post("/admin/hospitals/{hospital_id}/reinstate", response_model=AdminHospitalDetail)
async def reinstate_hospital(
    hospital_id: uuid.UUID, request: Request, db: DbSession, actor: AdminUser
) -> AdminHospitalDetail:
    return await service.reinstate_hospital(db, actor, hospital_id, request)


@router.patch("/admin/hospitals/{hospital_id}", response_model=AdminHospitalDetail)
async def update_hospital(
    hospital_id: uuid.UUID,
    body: AdminHospitalUpdateIn,
    request: Request,
    db: DbSession,
    actor: AdminOrFinanceUser,
) -> AdminHospitalDetail:
    return await service.update_hospital(db, actor, hospital_id, body, request)


# --------------------------------------------------------------------------------------------------- doctors
@router.post("/admin/doctors/{doctor_id}/verify-registration", response_model=AdminDoctorOut)
async def verify_doctor_registration(
    doctor_id: uuid.UUID, request: Request, db: DbSession, actor: AdminUser
) -> AdminDoctorOut:
    """Confirm the doctor's number is on the NMC / State Medical Council register (shown publicly)."""
    return await service.set_doctor_registration_verified(
        db, actor, doctor_id, verified=True, request=request
    )


@router.post("/admin/doctors/{doctor_id}/unverify-registration", response_model=AdminDoctorOut)
async def unverify_doctor_registration(
    doctor_id: uuid.UUID, request: Request, db: DbSession, actor: AdminUser
) -> AdminDoctorOut:
    return await service.set_doctor_registration_verified(
        db, actor, doctor_id, verified=False, request=request
    )


# --------------------------------------------------------------------------------------------------- agents
def agent_list_filters(
    status: Annotated[list[AgentStatus] | None, Query(description="Repeatable")] = None,
    q: SearchQ = None,
    kyc_status: Annotated[list[KycStatus] | None, Query(description="Repeatable")] = None,
    tier: Annotated[list[AgentTier] | None, Query(description="Repeatable")] = None,
    country: Annotated[list[str] | None, Query(description="ISO-2, repeatable")] = None,
) -> dict[str, Any]:
    """Filters of ``GET /admin/agents`` and ``GET /admin/agents/status-counts``."""
    return {
        "status": status or None,
        "q": q,
        "kyc_status": kyc_status or None,
        "tier": tier or None,
        "country": country or None,
    }


AgentFilters = Annotated[dict[str, Any], Depends(agent_list_filters)]


@router.get("/admin/agents", response_model=Page[AdminAgentOut])
async def list_agents(
    db: DbSession,
    _: StaffUser,
    params: PageParams,
    filters: AgentFilters,
    sort: Annotated[
        str | None,
        Query(
            pattern=listing.sort_pattern(listing.AGENT_SORT_FIELDS),
            description="agency_name | created_at | commission_rate_bps; default: pending first",
        ),
    ] = None,
) -> Page[AdminAgentOut]:
    return await service.list_agents(db, params, sort=sort, **filters)


@router.get("/admin/agents/status-counts", response_model=StatusCounts)
async def agent_status_counts(db: DbSession, _: StaffUser, filters: AgentFilters) -> StatusCounts:
    """Agents per status for the same filters as ``GET /admin/agents`` (``status`` is ignored)."""
    counts = await listing.agent_status_counts(db, **filters)
    return StatusCounts(counts=counts, total=sum(counts.values()))


@router.get("/admin/agents/{agent_id}", response_model=AdminAgentOut)
async def get_agent(agent_id: uuid.UUID, db: DbSession, _: StaffUser) -> AdminAgentOut:
    return await service.get_agent(db, agent_id)


@router.post("/admin/agents/{agent_id}/approve", response_model=AdminAgentOut)
async def approve_agent(
    agent_id: uuid.UUID, request: Request, db: DbSession, actor: AdminUser
) -> AdminAgentOut:
    return await service.approve_agent(db, actor, agent_id, request)


@router.post("/admin/agents/{agent_id}/reject", response_model=AdminAgentOut)
async def reject_agent(
    agent_id: uuid.UUID, body: ReasonIn, request: Request, db: DbSession, actor: AdminUser
) -> AdminAgentOut:
    return await service.reject_agent(db, actor, agent_id, body.reason, request)


@router.post("/admin/agents/{agent_id}/suspend", response_model=AdminAgentOut)
async def suspend_agent(
    agent_id: uuid.UUID,
    request: Request,
    db: DbSession,
    actor: AdminUser,
    body: OptionalReasonIn | None = None,
) -> AdminAgentOut:
    return await service.suspend_agent(db, actor, agent_id, body.reason if body else None, request)


@router.post("/admin/agents/{agent_id}/reinstate", response_model=AdminAgentOut)
async def reinstate_agent(
    agent_id: uuid.UUID, request: Request, db: DbSession, actor: AdminUser
) -> AdminAgentOut:
    return await service.reinstate_agent(db, actor, agent_id, request)


@router.patch("/admin/agents/{agent_id}", response_model=AdminAgentOut)
async def update_agent(
    agent_id: uuid.UUID, body: AdminAgentUpdateIn, request: Request, db: DbSession, actor: AdminOrFinanceUser
) -> AdminAgentOut:
    return await service.update_agent(db, actor, agent_id, body, request)


# ---------------------------------------------------------------------------------------------- specialties
@router.get("/admin/specialties", response_model=list[AdminSpecialtyOut])
async def list_specialties(
    db: DbSession, _: StaffUser, q: SearchQ = None, is_active: bool | None = None
) -> list[AdminSpecialtyOut]:
    return await catalog_admin.list_specialties(db, q, is_active)


@router.get("/admin/specialties/{item_id}", response_model=AdminSpecialtyOut)
async def get_specialty(item_id: uuid.UUID, db: DbSession, _: StaffUser) -> AdminSpecialtyOut:
    return await catalog_admin.get_specialty(db, item_id)


@router.post("/admin/specialties", response_model=AdminSpecialtyOut, status_code=201)
async def create_specialty(
    body: SpecialtyIn, request: Request, db: DbSession, actor: AdminUser
) -> AdminSpecialtyOut:
    return await catalog_admin.create_specialty(db, actor, body, request)


@router.patch("/admin/specialties/{item_id}", response_model=AdminSpecialtyOut)
async def update_specialty(
    item_id: uuid.UUID, body: SpecialtyPatch, request: Request, db: DbSession, actor: AdminUser
) -> AdminSpecialtyOut:
    return await catalog_admin.update_specialty(db, actor, item_id, body, request)


@router.delete("/admin/specialties/{item_id}", status_code=204)
async def delete_specialty(item_id: uuid.UUID, request: Request, db: DbSession, actor: AdminUser) -> Response:
    await catalog_admin.delete_specialty(db, actor, item_id, request)
    return Response(status_code=204)


# ----------------------------------------------------------------------------------------------- procedures
@router.get("/admin/procedures", response_model=list[AdminProcedureOut])
async def list_procedures(
    db: DbSession,
    _: StaffUser,
    specialty_id: uuid.UUID | None = None,
    q: SearchQ = None,
    is_active: bool | None = None,
) -> list[AdminProcedureOut]:
    return await catalog_admin.list_procedures(db, specialty_id, q, is_active)


@router.get("/admin/procedures/{item_id}", response_model=AdminProcedureOut)
async def get_procedure(item_id: uuid.UUID, db: DbSession, _: StaffUser) -> AdminProcedureOut:
    return await catalog_admin.get_procedure(db, item_id)


@router.post("/admin/procedures", response_model=AdminProcedureOut, status_code=201)
async def create_procedure(
    body: ProcedureIn, request: Request, db: DbSession, actor: AdminUser
) -> AdminProcedureOut:
    return await catalog_admin.create_procedure(db, actor, body, request)


@router.patch("/admin/procedures/{item_id}", response_model=AdminProcedureOut)
async def update_procedure(
    item_id: uuid.UUID, body: ProcedurePatch, request: Request, db: DbSession, actor: AdminUser
) -> AdminProcedureOut:
    return await catalog_admin.update_procedure(db, actor, item_id, body, request)


@router.delete("/admin/procedures/{item_id}", status_code=204)
async def delete_procedure(item_id: uuid.UUID, request: Request, db: DbSession, actor: AdminUser) -> Response:
    await catalog_admin.delete_procedure(db, actor, item_id, request)
    return Response(status_code=204)


# ------------------------------------------------------------------------------------------ cost benchmarks
@router.get("/admin/cost-benchmarks", response_model=list[CostBenchmarkOut])
async def list_cost_benchmarks(
    db: DbSession,
    _: StaffUser,
    procedure_id: uuid.UUID | None = None,
    country_code: Annotated[str | None, Query(max_length=2)] = None,
) -> list[CostBenchmarkOut]:
    return await catalog_admin.list_cost_benchmarks(db, procedure_id, country_code)


@router.get("/admin/cost-benchmarks/{item_id}", response_model=CostBenchmarkOut)
async def get_cost_benchmark(item_id: uuid.UUID, db: DbSession, _: StaffUser) -> CostBenchmarkOut:
    return await catalog_admin.get_cost_benchmark(db, item_id)


@router.post("/admin/cost-benchmarks", response_model=CostBenchmarkOut, status_code=201)
async def create_cost_benchmark(
    body: CostBenchmarkIn, request: Request, db: DbSession, actor: AdminUser
) -> CostBenchmarkOut:
    return await catalog_admin.create_cost_benchmark(db, actor, body, request)


@router.patch("/admin/cost-benchmarks/{item_id}", response_model=CostBenchmarkOut)
async def update_cost_benchmark(
    item_id: uuid.UUID, body: CostBenchmarkPatch, request: Request, db: DbSession, actor: AdminUser
) -> CostBenchmarkOut:
    return await catalog_admin.update_cost_benchmark(db, actor, item_id, body, request)


@router.delete("/admin/cost-benchmarks/{item_id}", status_code=204)
async def delete_cost_benchmark(
    item_id: uuid.UUID, request: Request, db: DbSession, actor: AdminUser
) -> Response:
    await catalog_admin.delete_cost_benchmark(db, actor, item_id, request)
    return Response(status_code=204)


# -------------------------------------------------------------------------------------------- cultural tips
@router.get("/admin/cultural-tips", response_model=list[CulturalTipOut])
async def list_cultural_tips(
    db: DbSession, _: StaffUser, category: Annotated[str | None, Query(max_length=60)] = None
) -> list[CulturalTipOut]:
    return await catalog_admin.list_cultural_tips(db, category)


@router.get("/admin/cultural-tips/{item_id}", response_model=CulturalTipOut)
async def get_cultural_tip(item_id: uuid.UUID, db: DbSession, _: StaffUser) -> CulturalTipOut:
    return await catalog_admin.get_cultural_tip(db, item_id)


@router.post("/admin/cultural-tips", response_model=CulturalTipOut, status_code=201)
async def create_cultural_tip(
    body: CulturalTipIn, request: Request, db: DbSession, actor: AdminUser
) -> CulturalTipOut:
    return await catalog_admin.create_cultural_tip(db, actor, body, request)


@router.patch("/admin/cultural-tips/{item_id}", response_model=CulturalTipOut)
async def update_cultural_tip(
    item_id: uuid.UUID, body: CulturalTipPatch, request: Request, db: DbSession, actor: AdminUser
) -> CulturalTipOut:
    return await catalog_admin.update_cultural_tip(db, actor, item_id, body, request)


@router.delete("/admin/cultural-tips/{item_id}", status_code=204)
async def delete_cultural_tip(
    item_id: uuid.UUID, request: Request, db: DbSession, actor: AdminUser
) -> Response:
    await catalog_admin.delete_cultural_tip(db, actor, item_id, request)
    return Response(status_code=204)


# ---------------------------------------------------------------------------------- accommodation providers
@router.get("/admin/accommodation-providers", response_model=list[AccommodationProviderOut])
async def list_accommodation_providers(
    db: DbSession,
    _: StaffUser,
    city: Annotated[str | None, Query(max_length=100)] = None,
    hospital_id: uuid.UUID | None = None,
    q: SearchQ = None,
) -> list[AccommodationProviderOut]:
    return await catalog_admin.list_accommodation_providers(db, city, hospital_id, q)


@router.get("/admin/accommodation-providers/{item_id}", response_model=AccommodationProviderOut)
async def get_accommodation_provider(
    item_id: uuid.UUID, db: DbSession, _: StaffUser
) -> AccommodationProviderOut:
    return await catalog_admin.get_accommodation_provider(db, item_id)


@router.post("/admin/accommodation-providers", response_model=AccommodationProviderOut, status_code=201)
async def create_accommodation_provider(
    body: AccommodationProviderIn, request: Request, db: DbSession, actor: AdminUser
) -> AccommodationProviderOut:
    return await catalog_admin.create_accommodation_provider(db, actor, body, request)


@router.patch("/admin/accommodation-providers/{item_id}", response_model=AccommodationProviderOut)
async def update_accommodation_provider(
    item_id: uuid.UUID, body: AccommodationProviderPatch, request: Request, db: DbSession, actor: AdminUser
) -> AccommodationProviderOut:
    return await catalog_admin.update_accommodation_provider(db, actor, item_id, body, request)


@router.delete("/admin/accommodation-providers/{item_id}", status_code=204)
async def delete_accommodation_provider(
    item_id: uuid.UUID, request: Request, db: DbSession, actor: AdminUser
) -> Response:
    await catalog_admin.delete_accommodation_provider(db, actor, item_id, request)
    return Response(status_code=204)


# ---------------------------------------------------------------------------------------- service providers
@router.get("/admin/service-providers", response_model=list[ServiceProviderOut])
async def list_service_providers(
    db: DbSession,
    _: StaffUser,
    kind: ServiceKind | None = None,
    city: Annotated[str | None, Query(max_length=100)] = None,
    q: SearchQ = None,
) -> list[ServiceProviderOut]:
    return await catalog_admin.list_service_providers(db, kind, city, q)


@router.get("/admin/service-providers/{item_id}", response_model=ServiceProviderOut)
async def get_service_provider(item_id: uuid.UUID, db: DbSession, _: StaffUser) -> ServiceProviderOut:
    return await catalog_admin.get_service_provider(db, item_id)


@router.post("/admin/service-providers", response_model=ServiceProviderOut, status_code=201)
async def create_service_provider(
    body: ServiceProviderIn, request: Request, db: DbSession, actor: AdminUser
) -> ServiceProviderOut:
    return await catalog_admin.create_service_provider(db, actor, body, request)


@router.patch("/admin/service-providers/{item_id}", response_model=ServiceProviderOut)
async def update_service_provider(
    item_id: uuid.UUID, body: ServiceProviderPatch, request: Request, db: DbSession, actor: AdminUser
) -> ServiceProviderOut:
    return await catalog_admin.update_service_provider(db, actor, item_id, body, request)


@router.delete("/admin/service-providers/{item_id}", status_code=204)
async def delete_service_provider(
    item_id: uuid.UUID, request: Request, db: DbSession, actor: AdminUser
) -> Response:
    await catalog_admin.delete_service_provider(db, actor, item_id, request)
    return Response(status_code=204)


# ------------------------------------------------------------------------------------------------- FX rates
@router.get("/admin/fx-rates", response_model=list[FxRateOut])
async def list_fx_rates(db: DbSession, _: StaffUser) -> list[FxRateOut]:
    return await catalog_admin.list_fx_rates(db)


@router.get("/admin/fx-rates/{item_id}", response_model=FxRateOut)
async def get_fx_rate(item_id: uuid.UUID, db: DbSession, _: StaffUser) -> FxRateOut:
    return await catalog_admin.get_fx_rate(db, item_id)


@router.post("/admin/fx-rates", response_model=FxRateOut, status_code=201)
async def create_fx_rate(body: FxRateIn, request: Request, db: DbSession, actor: AdminUser) -> FxRateOut:
    return await catalog_admin.create_fx_rate(db, actor, body, request)


@router.patch("/admin/fx-rates/{item_id}", response_model=FxRateOut)
async def update_fx_rate(
    item_id: uuid.UUID, body: FxRatePatch, request: Request, db: DbSession, actor: AdminUser
) -> FxRateOut:
    return await catalog_admin.update_fx_rate(db, actor, item_id, body, request)


@router.delete("/admin/fx-rates/{item_id}", status_code=204)
async def delete_fx_rate(item_id: uuid.UUID, request: Request, db: DbSession, actor: AdminUser) -> Response:
    await catalog_admin.delete_fx_rate(db, actor, item_id, request)
    return Response(status_code=204)


# ------------------------------------------------------------------------------------------------- settings
@router.get("/admin/settings", response_model=list[PlatformSettingOut])
async def list_settings(db: DbSession, _: StaffUser) -> list[PlatformSettingOut]:
    return await service.list_settings(db)


@router.put("/admin/settings/{key}", response_model=PlatformSettingOut)
async def update_setting(
    key: str, body: PlatformSettingIn, request: Request, db: DbSession, actor: AdminOrFinanceUser
) -> PlatformSettingOut:
    return await service.update_setting(db, actor, key, body.value, request)


# ---------------------------------------------------------------------------------------------------- audit
@router.get("/admin/audit-logs", response_model=Page[AuditLogOut])
async def list_audit_logs(
    db: DbSession,
    _: StaffUser,
    params: PageParams,
    actor_user_id: uuid.UUID | None = None,
    entity_type: Annotated[str | None, Query(max_length=60)] = None,
    entity_id: Annotated[str | None, Query(max_length=100)] = None,
    action: Annotated[str | None, Query(max_length=100)] = None,
    date_from: DateFrom = None,
    date_to: DateTo = None,
    q: Annotated[str | None, Query(max_length=100, description="Action, entity or actor name/email")] = None,
    actor_role: Annotated[list[str] | None, Query(description="Role values or 'system' (repeatable)")] = None,
) -> Page[AuditLogOut]:
    return await service.list_audit_logs(
        db,
        params,
        q=q,
        actor_role=actor_role or None,
        actor_user_id=actor_user_id,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        date_from=date_from,
        date_to=date_to,
    )


# -------------------------------------------------------------------------------------------------- reports
@router.get("/admin/reports/revenue", response_model=RevenueReport)
async def revenue_report(
    db: DbSession,
    _: StaffUser,
    date_from: DateFrom = None,
    date_to: DateTo = None,
    group_by: ReportGroupBy = "month",
) -> RevenueReport:
    return await reports.revenue_report(db, group_by, date_from, date_to)


@router.get("/admin/reports/cases", response_model=CasesReport)
async def cases_report(
    db: DbSession, _: StaffUser, date_from: DateFrom = None, date_to: DateTo = None
) -> CasesReport:
    return await reports.cases_report(db, date_from, date_to)


@router.get("/admin/reports/export", response_class=StreamingResponse)
async def export_report(
    request: Request,
    db: DbSession,
    actor: StaffUser,
    type: ExportType,  # noqa: A002 - query parameter name from the API contract
    date_from: DateFrom = None,
    date_to: DateTo = None,
) -> StreamingResponse:
    start, end = reports.export_bounds(date_from, date_to)
    await audit_log(
        db,
        actor=actor,
        action="report.export",
        entity_type="report",
        entity_id=type,
        after={"type": type, "from": date_from, "to": date_to},
        request=request,
    )
    await db.commit()
    stamp = reports.today_ist().isoformat()
    return StreamingResponse(
        reports.stream_export(type, start, end),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{type}-export-{stamp}.csv"',
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )
