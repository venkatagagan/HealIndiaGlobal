"""Referral programme routes: patient "Refer a friend" + credit, public code check, staff admin."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, Request

from app.core.deps import ADMIN_ROLES, FINANCE_ROLES, STAFF_ROLES, DbSession, PageParams, require_roles
from app.core.enums import PaymentPurpose, UserRole
from app.core.pagination import Page
from app.core.rate_limit import rate_limit
from app.models import User
from app.models.referrals import ReferralStatus
from app.modules.referrals import credits, queries, service
from app.modules.referrals.schemas import (
    AdminReferralOut,
    CodeCheckOut,
    CreditApplyIn,
    CreditApplyOut,
    CreditPreviewOut,
    CreditsOut,
    ReferralOverviewOut,
    ReferralSettingsOut,
    ReferralSummaryOut,
    ReferralVoidIn,
)

router = APIRouter(tags=["referrals"])

PatientUser = Annotated[User, Depends(require_roles(UserRole.PATIENT))]
StaffUser = Annotated[User, Depends(require_roles(*STAFF_ROLES))]
VoidUser = Annotated[User, Depends(require_roles(*(ADMIN_ROLES | FINANCE_ROLES)))]


@router.get("/patient/referral", response_model=ReferralOverviewOut)
async def my_referral(
    db: DbSession,
    user: PatientUser,
    x_device_id: Annotated[str | None, Header(max_length=200)] = None,
) -> ReferralOverviewOut:
    """Personal code + share links, rewards, credit balance and the friends who used the code."""
    profile = await credits.own_profile(db, user)
    return await queries.overview(db, profile, x_device_id)


@router.get("/patient/credits", response_model=CreditsOut)
async def my_credits(db: DbSession, user: PatientUser) -> CreditsOut:
    return await queries.credits_out(db, await credits.own_profile(db, user))


@router.get("/patient/credits/preview", response_model=CreditPreviewOut)
async def credit_preview(
    db: DbSession,
    user: PatientUser,
    booking_id: uuid.UUID,
    purpose: PaymentPurpose = PaymentPurpose.BOOKING_FULL,
) -> CreditPreviewOut:
    """How much credit the pay screen can apply to this booking payment."""
    return CreditPreviewOut.model_validate(await credits.preview(db, user, booking_id, purpose))


@router.post(
    "/patient/credits/apply",
    response_model=CreditApplyOut,
    dependencies=[Depends(rate_limit("credits.apply", 20, 3600, key="user"))],
)
async def apply_credit(
    body: CreditApplyIn, request: Request, db: DbSession, user: PatientUser
) -> CreditApplyOut:
    """Pay as much of the booking payment as the credit covers; pay the rest with a normal order."""
    applied = await credits.apply_credit(db, user, body.booking_id, body.purpose, request)
    profile = await credits.own_profile(db, user)
    return CreditApplyOut(
        order_id=applied.order.id,
        order_number=applied.order.order_number,
        payment_id=applied.payment.id,
        applied_minor=applied.applied_minor,
        currency=applied.currency,
        applied_base_minor=applied.applied_base_minor,
        remaining_due_minor=applied.remaining_due_minor,
        credit=await queries.balance_out(db, profile),
    )


@router.get(
    "/referrals/check",
    response_model=CodeCheckOut,
    dependencies=[Depends(rate_limit("referrals.check", 30, 60))],
)
async def check_code(
    db: DbSession,
    code: Annotated[str, Query(min_length=3, max_length=16)],
    currency: Annotated[str | None, Query(min_length=3, max_length=3)] = None,
) -> CodeCheckOut:
    """Public: is this sign-up code valid, and what does the new patient get (no personal data)."""
    return await queries.check_code(db, code, currency)


# ------------------------------------------------------------------------------------------------- staff
@router.get("/admin/referrals", response_model=Page[AdminReferralOut])
async def admin_referrals(
    db: DbSession,
    user: StaffUser,
    params: PageParams,
    status: Annotated[list[ReferralStatus] | None, Query()] = None,
    q: Annotated[str | None, Query(max_length=100, description="code, name or email")] = None,
) -> Page[AdminReferralOut]:
    return await queries.admin_list(db, params, queries.ReferralFilters(status=tuple(status or ()), q=q))


@router.get("/admin/referrals/summary", response_model=ReferralSummaryOut)
async def admin_summary(db: DbSession, user: StaffUser) -> ReferralSummaryOut:
    return await queries.summary(db)


@router.get("/admin/referrals/settings", response_model=ReferralSettingsOut)
async def admin_settings(db: DbSession, user: StaffUser) -> ReferralSettingsOut:
    """Effective programme settings (edit with ``PUT /admin/settings/referral_programme``, finance)."""
    return await queries.settings_out(db)


@router.get("/admin/referrals/{referral_id}", response_model=AdminReferralOut)
async def admin_referral(referral_id: uuid.UUID, db: DbSession, user: StaffUser) -> AdminReferralOut:
    return await queries.admin_get(db, referral_id)


@router.post("/admin/referrals/{referral_id}/void", response_model=AdminReferralOut)
async def admin_void(
    referral_id: uuid.UUID, body: ReferralVoidIn, request: Request, db: DbSession, user: VoidUser
) -> AdminReferralOut:
    await service.void_referral(db, user, referral_id, body.reason, request)
    return await queries.admin_get(db, referral_id)
