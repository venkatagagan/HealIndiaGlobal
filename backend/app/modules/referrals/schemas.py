"""Referral programme / platform credit API schemas."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import PaymentPurpose
from app.models.referrals import (
    CreditMovementKind,
    PatientCreditKind,
    PatientCreditStatus,
    ReferralChannel,
    ReferralStatus,
)


class _In(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class MoneyOut(BaseModel):
    amount_minor: int
    currency: str


class CreditBalanceOut(BaseModel):
    """Usable credit in INR (``base_*``) and in the patient's preferred currency (``amount_minor``)."""

    base_amount_minor: int
    base_currency: str
    amount_minor: int
    currency: str
    expiring_soon_minor: int  # in ``currency``: credit expiring within 30 days
    next_expiry_at: datetime | None


class ReferralRewardInfo(BaseModel):
    referrer: MoneyOut | None  # what the patient earns per friend (None = no referrer reward)
    referee: MoneyOut | None  # what the friend gets
    max_rewards_per_year: int
    credit_validity_days: int


class MyReferralOut(BaseModel):
    """One referral as the referrer sees it: first name + initial only, never booking or health details."""

    id: uuid.UUID
    friend_name: str
    status: ReferralStatus
    created_at: datetime
    rewarded_at: datetime | None
    reward: MoneyOut | None


class ReferralOverviewOut(BaseModel):
    enabled: bool
    code: str | None
    share_url: str | None
    patient_web_url: str | None
    app_url: str | None
    rewards: ReferralRewardInfo
    credit: CreditBalanceOut
    counts: dict[str, int]
    referrals: list[MyReferralOut]


class CreditOut(BaseModel):
    id: uuid.UUID
    kind: PatientCreditKind
    status: PatientCreditStatus
    amount_minor: int  # INR
    remaining_minor: int  # INR
    currency: str
    original_amount_minor: int | None
    original_currency: str | None
    display_remaining_minor: int
    display_currency: str
    expires_at: datetime | None
    created_at: datetime


class CreditMovementOut(BaseModel):
    id: uuid.UUID
    credit_id: uuid.UUID
    kind: CreditMovementKind
    amount_minor: int  # INR
    display_amount_minor: int
    display_currency: str
    booking_id: uuid.UUID | None
    payment_id: uuid.UUID | None
    created_at: datetime


class CreditsOut(BaseModel):
    balance: CreditBalanceOut
    credits: list[CreditOut]
    movements: list[CreditMovementOut]


class CreditPreviewOut(BaseModel):
    booking_id: uuid.UUID
    purpose: PaymentPurpose
    currency: str  # booking currency
    due_minor: int
    available_minor: int  # credit in the booking currency
    available_base_minor: int
    base_currency: str
    apply_minor: int
    remaining_due_minor: int
    applicable: bool
    reason: str | None  # installments | nothing_due | no_credit | amount_too_small | programme_off


class CreditApplyIn(_In):
    booking_id: uuid.UUID
    purpose: PaymentPurpose = PaymentPurpose.BOOKING_FULL


class CreditApplyOut(BaseModel):
    order_id: uuid.UUID
    order_number: str
    payment_id: uuid.UUID
    applied_minor: int
    currency: str
    applied_base_minor: int
    remaining_due_minor: int
    credit: CreditBalanceOut


class CodeCheckOut(BaseModel):
    """Public check of a referral code typed at sign-up (no personal data)."""

    valid: bool
    kind: str | None  # patient | agent
    referee_reward: MoneyOut | None


# ------------------------------------------------------------------------------------------------- staff
class ReferralPartyOut(BaseModel):
    patient_id: uuid.UUID
    user_id: uuid.UUID | None
    name: str
    email: str | None


class ReferralCreditBrief(BaseModel):
    id: uuid.UUID
    patient_id: uuid.UUID
    kind: PatientCreditKind
    status: PatientCreditStatus
    amount_minor: int
    remaining_minor: int
    original_amount_minor: int | None
    original_currency: str | None


class AdminReferralOut(BaseModel):
    id: uuid.UUID
    code: str
    status: ReferralStatus
    channel: ReferralChannel
    referrer: ReferralPartyOut
    referred: ReferralPartyOut
    created_at: datetime
    expires_at: datetime | None
    qualified_at: datetime | None
    rewarded_at: datetime | None
    voided_at: datetime | None
    void_reason: str | None
    qualifying_booking_id: uuid.UUID | None
    checks: dict[str, Any]
    credits: list[ReferralCreditBrief]


class ReferralVoidIn(_In):
    reason: str = Field(min_length=3, max_length=500)


class ReferralSummaryOut(BaseModel):
    by_status: dict[str, int]
    by_channel: dict[str, int]
    credits_issued_minor: int  # INR, all time
    credits_redeemed_minor: int
    credits_expired_minor: int
    credits_voided_minor: int
    credits_reinstated_minor: int
    outstanding_minor: int  # usable credit owed to patients (from the credits table)
    ledger_liability_minor: int  # PLATFORM:REFERRAL_CREDIT balance (should equal outstanding + expired-unswept)
    base_currency: str


class ReferralSettingsOut(BaseModel):
    env_enabled: bool
    effective_enabled: bool
    setting_key: str
    value: dict[str, Any]
