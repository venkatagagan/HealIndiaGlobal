"""Hospital portal routes (PLAN 8.5) under ``/hospital-portal``.

All routes require role ``hospital`` plus membership of the selected hospital (``X-Hospital-Id`` header,
default = the user's first hospital); see ``policies.py`` for the per-member-role rules. Cases, quotes and
bookings for hospitals are served by the cases module (PLAN 8.7).
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import Annotated, Any

from fastapi import APIRouter, Body, Query, Request, Response, status

from app.core.deps import DbSession
from app.core.enums import ReviewStatus
from app.modules.catalog.schemas import AvailabilityDay, HospitalProcedureOut, PackageOut, ReviewOut
from app.modules.hospitals import service
from app.modules.hospitals.dashboard import dashboard as build_dashboard
from app.modules.hospitals.policies import Portal
from app.modules.hospitals.schemas import (
    AvailabilitySlotIn,
    DashboardOut,
    DoctorAdminOut,
    DoctorIn,
    DoctorUpdateIn,
    HospitalProcedureIn,
    HospitalProcedureUpdateIn,
    HospitalProfileIn,
    HospitalProfileOut,
    HospitalSpecialtiesIn,
    MemberInviteIn,
    MemberOut,
    MemberUpdateIn,
    PackageIn,
    PackageUpdateIn,
)

router = APIRouter(tags=["hospitals"])

P = "/hospital-portal"
SlotsBody = Annotated[list[AvailabilitySlotIn], Body(max_length=400)]
FromQ = Annotated[date | None, Query(alias="from")]


# ----------------------------------------------------------------------------- profile
@router.get(f"{P}/profile", response_model=HospitalProfileOut)
async def get_profile(ctx: Portal, db: DbSession) -> Any:
    return await service.get_profile(db, ctx)


@router.put(f"{P}/profile", response_model=HospitalProfileOut)
async def update_profile(body: HospitalProfileIn, ctx: Portal, db: DbSession, request: Request) -> Any:
    return await service.update_profile(db, ctx, body, request)


@router.post(f"{P}/submit-for-review", response_model=HospitalProfileOut)
async def submit_for_review(ctx: Portal, db: DbSession, request: Request) -> Any:
    return await service.submit_for_review(db, ctx, request)


@router.get(f"{P}/dashboard", response_model=DashboardOut)
async def get_dashboard(ctx: Portal, db: DbSession) -> Any:
    return await build_dashboard(db, ctx)


@router.put(f"{P}/specialties", response_model=HospitalProfileOut)
async def set_specialties(body: HospitalSpecialtiesIn, ctx: Portal, db: DbSession, request: Request) -> Any:
    return await service.set_specialties(db, ctx, body, request)


# ----------------------------------------------------------------------------- members
@router.get(f"{P}/members", response_model=list[MemberOut])
async def list_members(ctx: Portal, db: DbSession) -> Any:
    return await service.list_members(db, ctx)


@router.post(f"{P}/members", response_model=MemberOut, status_code=status.HTTP_201_CREATED)
async def invite_member(body: MemberInviteIn, ctx: Portal, db: DbSession, request: Request) -> Any:
    return await service.invite_member(db, ctx, body, request)


@router.get(f"{P}/members/{{member_id}}", response_model=MemberOut)
async def get_member(member_id: uuid.UUID, ctx: Portal, db: DbSession) -> Any:
    return await service.get_member(db, ctx, member_id)


@router.put(f"{P}/members/{{member_id}}", response_model=MemberOut)
async def update_member(
    member_id: uuid.UUID, body: MemberUpdateIn, ctx: Portal, db: DbSession, request: Request
) -> Any:
    return await service.update_member(db, ctx, member_id, body, request)


@router.patch(f"{P}/members/{{member_id}}", response_model=MemberOut, include_in_schema=False)
async def patch_member(
    member_id: uuid.UUID, body: MemberUpdateIn, ctx: Portal, db: DbSession, request: Request
) -> Any:
    return await service.update_member(db, ctx, member_id, body, request)


@router.delete(f"{P}/members/{{member_id}}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def remove_member(member_id: uuid.UUID, ctx: Portal, db: DbSession, request: Request) -> Response:
    await service.remove_member(db, ctx, member_id, request)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ----------------------------------------------------------------------------- doctors
@router.get(f"{P}/doctors", response_model=list[DoctorAdminOut])
async def list_doctors(ctx: Portal, db: DbSession) -> Any:
    return await service.list_doctors(db, ctx)


@router.post(f"{P}/doctors", response_model=DoctorAdminOut, status_code=status.HTTP_201_CREATED)
async def create_doctor(body: DoctorIn, ctx: Portal, db: DbSession, request: Request) -> Any:
    return await service.create_doctor(db, ctx, body, request)


@router.get(f"{P}/doctors/{{doctor_id}}", response_model=DoctorAdminOut)
async def get_doctor(doctor_id: uuid.UUID, ctx: Portal, db: DbSession) -> Any:
    return await service.doctor_out(db, ctx, await service.get_doctor(db, ctx, doctor_id))


@router.put(f"{P}/doctors/{{doctor_id}}", response_model=DoctorAdminOut)
async def update_doctor(
    doctor_id: uuid.UUID, body: DoctorUpdateIn, ctx: Portal, db: DbSession, request: Request
) -> Any:
    return await service.update_doctor(db, ctx, doctor_id, body, request)


@router.patch(f"{P}/doctors/{{doctor_id}}", response_model=DoctorAdminOut, include_in_schema=False)
async def patch_doctor(
    doctor_id: uuid.UUID, body: DoctorUpdateIn, ctx: Portal, db: DbSession, request: Request
) -> Any:
    return await service.update_doctor(db, ctx, doctor_id, body, request)


@router.delete(f"{P}/doctors/{{doctor_id}}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def delete_doctor(doctor_id: uuid.UUID, ctx: Portal, db: DbSession, request: Request) -> Response:
    await service.delete_doctor(db, ctx, doctor_id, request)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(f"{P}/doctors/{{doctor_id}}/availability", response_model=list[AvailabilityDay])
async def get_doctor_availability(
    doctor_id: uuid.UUID, ctx: Portal, db: DbSession, from_: FromQ = None, to: date | None = None
) -> Any:
    return await service.get_availability(db, ctx, doctor_id, from_, to)


@router.put(f"{P}/doctors/{{doctor_id}}/availability", response_model=list[AvailabilityDay])
async def set_doctor_availability(
    doctor_id: uuid.UUID, slots: SlotsBody, ctx: Portal, db: DbSession, request: Request
) -> Any:
    return await service.set_availability(db, ctx, doctor_id, slots, request)


# Hospital-wide slots (doctor_id NULL), e.g. admission capacity not tied to one doctor.
@router.get(f"{P}/availability", response_model=list[AvailabilityDay])
async def get_hospital_availability(
    ctx: Portal, db: DbSession, from_: FromQ = None, to: date | None = None
) -> Any:
    return await service.get_availability(db, ctx, None, from_, to)


@router.put(f"{P}/availability", response_model=list[AvailabilityDay])
async def set_hospital_availability(slots: SlotsBody, ctx: Portal, db: DbSession, request: Request) -> Any:
    return await service.set_availability(db, ctx, None, slots, request)


# ----------------------------------------------------------------------------- procedures
@router.get(f"{P}/procedures", response_model=list[HospitalProcedureOut])
async def list_procedures(ctx: Portal, db: DbSession) -> Any:
    return await service.list_procedures(db, ctx)


@router.post(f"{P}/procedures", response_model=HospitalProcedureOut, status_code=status.HTTP_201_CREATED)
async def create_procedure(body: HospitalProcedureIn, ctx: Portal, db: DbSession, request: Request) -> Any:
    return await service.create_procedure(db, ctx, body, request)


@router.get(f"{P}/procedures/{{hp_id}}", response_model=HospitalProcedureOut)
async def get_procedure(hp_id: uuid.UUID, ctx: Portal, db: DbSession) -> Any:
    return await service.get_procedure(db, ctx, hp_id)


@router.put(f"{P}/procedures/{{hp_id}}", response_model=HospitalProcedureOut)
async def update_procedure(
    hp_id: uuid.UUID, body: HospitalProcedureUpdateIn, ctx: Portal, db: DbSession, request: Request
) -> Any:
    return await service.update_procedure(db, ctx, hp_id, body, request)


@router.patch(f"{P}/procedures/{{hp_id}}", response_model=HospitalProcedureOut, include_in_schema=False)
async def patch_procedure(
    hp_id: uuid.UUID, body: HospitalProcedureUpdateIn, ctx: Portal, db: DbSession, request: Request
) -> Any:
    return await service.update_procedure(db, ctx, hp_id, body, request)


@router.delete(f"{P}/procedures/{{hp_id}}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def delete_procedure(hp_id: uuid.UUID, ctx: Portal, db: DbSession, request: Request) -> Response:
    await service.delete_procedure(db, ctx, hp_id, request)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ----------------------------------------------------------------------------- packages
@router.get(f"{P}/procedures/{{hp_id}}/packages", response_model=list[PackageOut])
async def list_packages(hp_id: uuid.UUID, ctx: Portal, db: DbSession) -> Any:
    return await service.list_packages(db, ctx, hp_id)


@router.post(
    f"{P}/procedures/{{hp_id}}/packages", response_model=PackageOut, status_code=status.HTTP_201_CREATED
)
async def create_package(
    hp_id: uuid.UUID, body: PackageIn, ctx: Portal, db: DbSession, request: Request
) -> Any:
    return await service.create_package(db, ctx, hp_id, body, request)


@router.put(f"{P}/procedures/{{hp_id}}/packages/{{package_id}}", response_model=PackageOut)
async def update_package(
    hp_id: uuid.UUID,
    package_id: uuid.UUID,
    body: PackageUpdateIn,
    ctx: Portal,
    db: DbSession,
    request: Request,
) -> Any:
    return await service.update_package(db, ctx, hp_id, package_id, body, request)


@router.patch(
    f"{P}/procedures/{{hp_id}}/packages/{{package_id}}", response_model=PackageOut, include_in_schema=False
)
async def patch_package(
    hp_id: uuid.UUID,
    package_id: uuid.UUID,
    body: PackageUpdateIn,
    ctx: Portal,
    db: DbSession,
    request: Request,
) -> Any:
    return await service.update_package(db, ctx, hp_id, package_id, body, request)


@router.delete(
    f"{P}/procedures/{{hp_id}}/packages/{{package_id}}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
async def delete_package(
    hp_id: uuid.UUID, package_id: uuid.UUID, ctx: Portal, db: DbSession, request: Request
) -> Response:
    await service.delete_package(db, ctx, hp_id, package_id, request)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ----------------------------------------------------------------------------- reviews
@router.get(f"{P}/reviews", response_model=list[ReviewOut])
async def list_reviews(
    ctx: Portal, db: DbSession, status_: Annotated[ReviewStatus | None, Query(alias="status")] = None
) -> Any:
    return await service.list_reviews(db, ctx, status_)
