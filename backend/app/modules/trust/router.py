"""Routes for verified reviews and structured accreditations.

Patients:   POST /reviews, GET /me/reviews, GET /me/reviews/eligible, PATCH/DELETE /me/reviews/{id}
Staff:      GET /admin/reviews, PATCH /admin/reviews/{id} (publish / hide with a reason)
            GET/POST /admin/hospitals/{hospital_id}/accreditations,
            PATCH/DELETE /admin/accreditations/{id}, POST /admin/accreditations/{id}/verify|unverify
Hospitals:  GET/POST /hospital-portal/accreditations, PATCH/DELETE /hospital-portal/accreditations/{id}
Public reads live in the catalogue (GET /hospitals/{id}/reviews, GET /doctors/{id}/reviews).
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status

from app.core.deps import ADMIN_ROLES, STAFF_ROLES, DbSession, PageParams, require_roles
from app.core.enums import ReviewStatus, UserRole
from app.core.pagination import Page
from app.core.rate_limit import rate_limit
from app.models import User
from app.modules.hospitals.policies import PROFILE_ROLES, Portal
from app.modules.trust import service
from app.modules.trust.schemas import (
    AccreditationIn,
    AccreditationOut,
    AccreditationPatch,
    AdminReviewOut,
    PatientReviewOut,
    ReviewableBookingOut,
    ReviewCreateIn,
    ReviewModerateIn,
    ReviewUpdateIn,
)

router = APIRouter(tags=["trust"])

PatientUser = Annotated[User, Depends(require_roles(UserRole.PATIENT))]
StaffUser = Annotated[User, Depends(require_roles(*STAFF_ROLES))]
AdminUser = Annotated[User, Depends(require_roles(*ADMIN_ROLES))]


# ----------------------------------------------------------------------------- patient reviews
@router.post(
    "/reviews",
    status_code=status.HTTP_201_CREATED,
    response_model=PatientReviewOut,
    dependencies=[Depends(rate_limit("reviews.create", 20, 3600, key="user"))],
)
async def create_review(
    body: ReviewCreateIn, request: Request, db: DbSession, user: PatientUser
) -> PatientReviewOut:
    """Review a hospital (and optionally a doctor) after a completed booking. Starts as ``pending``."""
    return await service.create_review(db, user, body, request)


@router.get("/me/reviews", response_model=list[PatientReviewOut])
async def my_reviews(db: DbSession, user: PatientUser) -> list[PatientReviewOut]:
    return await service.list_my_reviews(db, user)


@router.get("/me/reviews/eligible", response_model=list[ReviewableBookingOut])
async def reviewable_bookings(db: DbSession, user: PatientUser) -> list[ReviewableBookingOut]:
    """Completed bookings that can still be reviewed."""
    return await service.reviewable_bookings(db, user)


@router.patch("/me/reviews/{review_id}", response_model=PatientReviewOut)
async def update_my_review(
    review_id: uuid.UUID, body: ReviewUpdateIn, request: Request, db: DbSession, user: PatientUser
) -> PatientReviewOut:
    return await service.update_my_review(db, user, review_id, body, request)


@router.delete("/me/reviews/{review_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_review(
    review_id: uuid.UUID, request: Request, db: DbSession, user: PatientUser
) -> Response:
    await service.delete_my_review(db, user, review_id, request)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ----------------------------------------------------------------------------- moderation
@router.get("/admin/reviews", response_model=Page[AdminReviewOut])
async def admin_reviews(
    db: DbSession,
    _staff: StaffUser,
    params: PageParams,
    status: ReviewStatus | None = None,
    hospital_id: uuid.UUID | None = None,
    doctor_id: uuid.UUID | None = None,
) -> Page[AdminReviewOut]:
    return await service.list_admin_reviews(
        db, params, status=status, hospital_id=hospital_id, doctor_id=doctor_id
    )


@router.patch("/admin/reviews/{review_id}", response_model=AdminReviewOut)
async def moderate_review(
    review_id: uuid.UUID, body: ReviewModerateIn, request: Request, db: DbSession, user: AdminUser
) -> AdminReviewOut:
    """Publish or hide a review (a reason is required to hide). Recomputes hospital/doctor ratings."""
    return await service.moderate_review(db, user, review_id, body, request)


# ----------------------------------------------------------------------------- accreditations: staff
@router.get("/admin/hospitals/{hospital_id}/accreditations", response_model=list[AccreditationOut])
async def admin_list_accreditations(
    hospital_id: uuid.UUID, db: DbSession, _staff: StaffUser
) -> list[AccreditationOut]:
    return await service.list_accreditations(db, hospital_id)


@router.post(
    "/admin/hospitals/{hospital_id}/accreditations",
    status_code=status.HTTP_201_CREATED,
    response_model=AccreditationOut,
)
async def admin_create_accreditation(
    hospital_id: uuid.UUID, body: AccreditationIn, request: Request, db: DbSession, user: AdminUser
) -> AccreditationOut:
    return await service.create_accreditation(db, user, hospital_id, body, request)


@router.patch("/admin/accreditations/{accreditation_id}", response_model=AccreditationOut)
async def admin_update_accreditation(
    accreditation_id: uuid.UUID, body: AccreditationPatch, request: Request, db: DbSession, user: AdminUser
) -> AccreditationOut:
    acc = await service.get_accreditation(db, accreditation_id)
    return await service.update_accreditation(db, user, acc, body, request)


@router.delete("/admin/accreditations/{accreditation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_accreditation(
    accreditation_id: uuid.UUID, request: Request, db: DbSession, user: AdminUser
) -> Response:
    acc = await service.get_accreditation(db, accreditation_id)
    await service.delete_accreditation(db, user, acc, request)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/admin/accreditations/{accreditation_id}/verify", response_model=AccreditationOut)
async def admin_verify_accreditation(
    accreditation_id: uuid.UUID, request: Request, db: DbSession, user: AdminUser
) -> AccreditationOut:
    """Mark the certificate as checked; it then shows publicly until ``valid_until``."""
    acc = await service.get_accreditation(db, accreditation_id)
    return await service.set_accreditation_verified(db, user, acc, True, request)


@router.post("/admin/accreditations/{accreditation_id}/unverify", response_model=AccreditationOut)
async def admin_unverify_accreditation(
    accreditation_id: uuid.UUID, request: Request, db: DbSession, user: AdminUser
) -> AccreditationOut:
    acc = await service.get_accreditation(db, accreditation_id)
    return await service.set_accreditation_verified(db, user, acc, False, request)


# ----------------------------------------------------------------------------- accreditations: hospital
@router.get("/hospital-portal/accreditations", response_model=list[AccreditationOut])
async def portal_list_accreditations(ctx: Portal, db: DbSession) -> list[AccreditationOut]:
    return await service.list_accreditations(db, ctx.hospital_id)


@router.post(
    "/hospital-portal/accreditations", status_code=status.HTTP_201_CREATED, response_model=AccreditationOut
)
async def portal_create_accreditation(
    body: AccreditationIn, ctx: Portal, request: Request, db: DbSession
) -> AccreditationOut:
    """Add a certificate for admin verification (not public until verified)."""
    ctx.require(PROFILE_ROLES)
    return await service.create_accreditation(db, ctx.user, ctx.hospital_id, body, request)


@router.patch("/hospital-portal/accreditations/{accreditation_id}", response_model=AccreditationOut)
async def portal_update_accreditation(
    accreditation_id: uuid.UUID, body: AccreditationPatch, ctx: Portal, request: Request, db: DbSession
) -> AccreditationOut:
    """Changing the details removes the verification until an admin checks them again."""
    ctx.require(PROFILE_ROLES)
    acc = await service.get_accreditation(db, accreditation_id, ctx.hospital_id)
    return await service.update_accreditation(db, ctx.user, acc, body, request)


@router.delete("/hospital-portal/accreditations/{accreditation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def portal_delete_accreditation(
    accreditation_id: uuid.UUID, ctx: Portal, request: Request, db: DbSession
) -> Response:
    ctx.require(PROFILE_ROLES)
    acc = await service.get_accreditation(db, accreditation_id, ctx.hospital_id)
    await service.delete_accreditation(db, ctx.user, acc, request)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
