"""Patient referral programme ("refer a friend") and platform credit (docs/REFERRALS.md).

* ``referral_codes``            one personal, non-guessable code per patient (+ hashed device ids seen on the
                                referrer's own devices, for the self-referral check)
* ``referrals``                 referrer -> referred patient (one per referred person); pending -> qualified
                                (the referred patient's first booking COMPLETED) -> rewarded, or void
* ``patient_credits``           credit grants (INR base minor units, like the ledger); ``remaining_minor`` is a
                                cached remainder consumed FIFO by expiry; the ledger account
                                ``PLATFORM:REFERRAL_CREDIT`` holds the liability
* ``patient_credit_movements``  append-only history: grant / redeem / reinstate / expire / void
"""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import StrEnum
from typing import Any

import sqlalchemy as sa
from sqlalchemy import BigInteger, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import sa_enum
from app.models.base import (
    Base,
    CreatedAtMixin,
    TimestampMixin,
    UUIDPkMixin,
    fk,
    json_obj_col,
    text_array_col,
)

__all__ = [
    "CreditMovementKind",
    "PatientCredit",
    "PatientCreditKind",
    "PatientCreditMovement",
    "PatientCreditStatus",
    "Referral",
    "ReferralChannel",
    "ReferralCode",
    "ReferralStatus",
]


class ReferralStatus(StrEnum):
    PENDING = "pending"  # signed up with the code; waiting for the first completed booking
    QUALIFIED = "qualified"  # first booking completed; reward not (yet) issued (e.g. yearly cap reached)
    REWARDED = "rewarded"  # credits issued
    VOID = "void"  # self-referral, expired or voided by staff


class ReferralChannel(StrEnum):
    WEBSITE = "website"
    PATIENT_WEB = "patient_web"
    MOBILE = "mobile"
    OTHER = "other"


class PatientCreditKind(StrEnum):
    REFERRER_REWARD = "referrer_reward"
    REFEREE_REWARD = "referee_reward"
    REINSTATED = "reinstated"  # credit paid back after a refund of a credit-funded payment


class PatientCreditStatus(StrEnum):
    ACTIVE = "active"
    USED = "used"
    EXPIRED = "expired"
    VOID = "void"


class CreditMovementKind(StrEnum):
    GRANT = "grant"
    REDEEM = "redeem"
    REINSTATE = "reinstate"
    EXPIRE = "expire"
    VOID = "void"


class ReferralCode(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "referral_codes"

    patient_id: Mapped[uuid.UUID] = fk("patient_profiles.id", ondelete="CASCADE", index=False, unique=True)
    code: Mapped[str] = mapped_column(String(16), nullable=False, unique=True)
    # keyed fingerprints (never raw ids) of the referrer's own devices; at most 10, newest last
    device_hashes: Mapped[list[str]] = text_array_col()
    disabled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Referral(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "referrals"
    __table_args__ = (
        sa.CheckConstraint("referrer_patient_id <> referred_patient_id", name="not_self"),
        sa.Index("ix_referrals_referrer_status", "referrer_patient_id", "status"),
    )

    referrer_patient_id: Mapped[uuid.UUID] = fk("patient_profiles.id", ondelete="CASCADE", index=False)
    # one referral per referred person
    referred_patient_id: Mapped[uuid.UUID] = fk(
        "patient_profiles.id", ondelete="CASCADE", index=False, unique=True
    )
    code: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[ReferralStatus] = mapped_column(
        sa_enum(ReferralStatus),
        nullable=False,
        default=ReferralStatus.PENDING,
        server_default="pending",
        index=True,
    )
    channel: Mapped[ReferralChannel] = mapped_column(
        sa_enum(ReferralChannel), nullable=False, default=ReferralChannel.OTHER, server_default="other"
    )
    signup_device_hash: Mapped[str | None] = mapped_column(String(64))
    qualifying_booking_id: Mapped[uuid.UUID | None] = fk("bookings.id", ondelete="SET NULL", nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    qualified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rewarded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    void_reason: Mapped[str | None] = mapped_column(String(500))
    voided_by: Mapped[uuid.UUID | None] = fk("users.id", ondelete="SET NULL", nullable=True, index=False)
    # anti-abuse results and reward notes (``{"reward_skipped": "annual_cap"}``)
    checks: Mapped[dict[str, Any]] = json_obj_col()


class PatientCredit(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "patient_credits"
    __table_args__ = (
        sa.CheckConstraint("amount_minor > 0", name="amount_positive"),
        sa.CheckConstraint("remaining_minor >= 0 AND remaining_minor <= amount_minor", name="remaining_range"),
        sa.Index("ix_patient_credits_patient_status", "patient_id", "status"),
        sa.Index("ix_patient_credits_status_expires_at", "status", "expires_at"),
    )

    patient_id: Mapped[uuid.UUID] = fk("patient_profiles.id", ondelete="CASCADE", index=False)
    referral_id: Mapped[uuid.UUID | None] = fk("referrals.id", ondelete="SET NULL", nullable=True)
    kind: Mapped[PatientCreditKind] = mapped_column(sa_enum(PatientCreditKind), nullable=False)
    status: Mapped[PatientCreditStatus] = mapped_column(
        sa_enum(PatientCreditStatus),
        nullable=False,
        default=PatientCreditStatus.ACTIVE,
        server_default="active",
    )
    # INR (ledger base currency) minor units
    amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    remaining_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR", server_default="INR")
    # the reward as configured (e.g. USD 50.00) for display; ``amount_minor`` is its INR value at issue
    original_amount_minor: Mapped[int | None] = mapped_column(BigInteger)
    original_currency: Mapped[str | None] = mapped_column(String(3))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # the payment whose refund reinstated this credit (kind ``reinstated``)
    source_refund_id: Mapped[uuid.UUID | None] = fk(
        "refunds.id", ondelete="SET NULL", nullable=True, index=False, unique=True
    )


class PatientCreditMovement(UUIDPkMixin, CreatedAtMixin, Base):
    __tablename__ = "patient_credit_movements"
    __table_args__ = (
        sa.CheckConstraint("amount_minor > 0", name="amount_positive"),
        sa.Index("ix_patient_credit_movements_patient_created", "patient_id", "created_at"),
    )

    patient_id: Mapped[uuid.UUID] = fk("patient_profiles.id", ondelete="CASCADE", index=False)
    credit_id: Mapped[uuid.UUID] = fk("patient_credits.id", ondelete="CASCADE")
    kind: Mapped[CreditMovementKind] = mapped_column(sa_enum(CreditMovementKind), nullable=False)
    amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)  # INR minor units, always > 0
    payment_id: Mapped[uuid.UUID | None] = fk("payments.id", ondelete="SET NULL", nullable=True)
    refund_id: Mapped[uuid.UUID | None] = fk("refunds.id", ondelete="SET NULL", nullable=True, index=False)
    booking_id: Mapped[uuid.UUID | None] = fk("bookings.id", ondelete="SET NULL", nullable=True, index=False)
    note: Mapped[str | None] = mapped_column(String(300))
