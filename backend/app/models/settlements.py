"""Commission rules, payout accounts, settlement items/batches and payouts (PLAN 4.13)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy import Boolean, Date, DateTime, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.crypto import EncryptedString
from app.core.enums import (
    CommissionScope,
    PayeeType,
    PayoutAccountStatus,
    PayoutMethod,
    PayoutStatus,
    SettlementBatchStatus,
    SettlementItemStatus,
    sa_enum,
)
from app.models.base import Base, TimestampMixin, UUIDPkMixin, currency_col, fk, money_col

__all__ = ["CommissionRule", "PayoutAccount", "Payout", "SettlementBatch", "SettlementItem"]


class CommissionRule(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "commission_rules"
    __table_args__ = (
        sa.CheckConstraint("rate_bps >= 0 AND rate_bps <= 10000", name="rate_bps_range"),
        sa.CheckConstraint("effective_to IS NULL OR effective_to >= effective_from", name="effective_range"),
        sa.Index("ix_commission_rules_scope_is_active", "scope", "is_active"),
    )

    scope: Mapped[CommissionScope] = mapped_column(sa_enum(CommissionScope), nullable=False)
    hospital_id: Mapped[uuid.UUID | None] = fk("hospitals.id", ondelete="CASCADE", nullable=True)
    specialty_id: Mapped[uuid.UUID | None] = fk("specialties.id", ondelete="CASCADE", nullable=True)
    procedure_id: Mapped[uuid.UUID | None] = fk("procedures.id", ondelete="CASCADE", nullable=True)
    agent_id: Mapped[uuid.UUID | None] = fk("agents.id", ondelete="CASCADE", nullable=True)
    rate_bps: Mapped[int] = mapped_column(Integer, nullable=False)
    effective_from: Mapped[date] = mapped_column(Date, nullable=False, server_default=func.current_date())
    effective_to: Mapped[date | None] = mapped_column(Date)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=sa.true())
    created_by: Mapped[uuid.UUID | None] = fk("users.id", ondelete="SET NULL", nullable=True)


class PayoutAccount(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "payout_accounts"
    __table_args__ = (
        sa.Index("ix_payout_accounts_owner", "owner_type", "owner_id"),
        # SEC-003: the person who submitted the current bank details never verifies them.
        sa.CheckConstraint(
            "verified_by IS NULL OR submitted_by IS NULL OR verified_by <> submitted_by",
            name="verify_maker_checker",
        ),
    )

    owner_type: Mapped[PayeeType] = mapped_column(sa_enum(PayeeType), nullable=False)
    owner_id: Mapped[uuid.UUID] = mapped_column(sa.UUID(as_uuid=True), nullable=False)
    account_holder_name: Mapped[str] = mapped_column(String(200), nullable=False)
    account_number: Mapped[str] = mapped_column(EncryptedString(), nullable=False)
    account_number_last4: Mapped[str] = mapped_column(String(4), nullable=False)
    ifsc: Mapped[str | None] = mapped_column(String(11))
    bank_name: Mapped[str | None] = mapped_column(String(200))
    swift: Mapped[str | None] = mapped_column(String(11))
    razorpay_linked_account_id: Mapped[str | None] = mapped_column(String(100))
    is_verified: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=sa.false()
    )
    is_primary: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=sa.false()
    )
    status: Mapped[PayoutAccountStatus] = mapped_column(
        sa_enum(PayoutAccountStatus),
        nullable=False,
        default=PayoutAccountStatus.ACTIVE,
        server_default="active",
        index=True,
    )
    # SEC-003 maker-checker (implementation columns, not in PLAN 4.13): who last submitted the destination
    # details (create, bank-field change, re-activation) and who verified them (must differ).
    submitted_by: Mapped[uuid.UUID | None] = fk("users.id", ondelete="RESTRICT", nullable=True)
    verified_by: Mapped[uuid.UUID | None] = fk("users.id", ondelete="RESTRICT", nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class SettlementItem(UUIDPkMixin, TimestampMixin, Base):
    """Amounts are INR minor units; may be negative for clawbacks (refund after completion)."""

    __tablename__ = "settlement_items"
    __table_args__ = (
        sa.Index("ix_settlement_items_payee_status", "payee_type", "payee_id", "status"),
        sa.Index("ix_settlement_items_status_eligible_at", "status", "eligible_at"),
        sa.Index("ix_settlement_items_batch_payee", "batch_id", "payee_type", "payee_id"),
        # One settlement item per ledger transaction (items are derived from recognition/reversal postings),
        # which makes item creation idempotent under concurrent or repeated event delivery.
        sa.Index(
            "uq_settlement_items_ledger_transaction_id",
            "ledger_transaction_id",
            unique=True,
            postgresql_where=sa.text("ledger_transaction_id IS NOT NULL"),
        ),
    )

    payee_type: Mapped[PayeeType] = mapped_column(sa_enum(PayeeType), nullable=False)
    payee_id: Mapped[uuid.UUID] = mapped_column(sa.UUID(as_uuid=True), nullable=False)
    booking_id: Mapped[uuid.UUID] = fk("bookings.id", ondelete="RESTRICT")
    payment_id: Mapped[uuid.UUID | None] = fk("payments.id", ondelete="RESTRICT", nullable=True)
    ledger_transaction_id: Mapped[uuid.UUID | None] = fk(
        "ledger_transactions.id", ondelete="RESTRICT", nullable=True, index=False
    )
    gross_minor: Mapped[int] = money_col()
    commission_minor: Mapped[int] = money_col()
    tax_minor: Mapped[int] = money_col()
    tds_minor: Mapped[int] = money_col()
    net_minor: Mapped[int] = money_col()
    currency: Mapped[str] = currency_col("INR")
    status: Mapped[SettlementItemStatus] = mapped_column(
        sa_enum(SettlementItemStatus),
        nullable=False,
        default=SettlementItemStatus.PENDING,
        server_default="pending",
    )
    eligible_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    hold_reason: Mapped[str | None] = mapped_column(Text)
    batch_id: Mapped[uuid.UUID | None] = fk("settlement_batches.id", ondelete="SET NULL", nullable=True)

    batch: Mapped[SettlementBatch | None] = relationship(
        "SettlementBatch", back_populates="items", lazy="raise"
    )


class SettlementBatch(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "settlement_batches"
    __table_args__ = (
        sa.CheckConstraint(
            "approved_by IS NULL OR created_by IS NULL OR approved_by <> created_by", name="maker_checker"
        ),
        sa.CheckConstraint("items_count >= 0", name="items_count_nonneg"),
        sa.Index("ix_settlement_batches_payee", "payee_type", "payee_id"),
    )

    batch_number: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    payee_type: Mapped[PayeeType] = mapped_column(sa_enum(PayeeType), nullable=False)
    payee_id: Mapped[uuid.UUID | None] = mapped_column(sa.UUID(as_uuid=True))
    status: Mapped[SettlementBatchStatus] = mapped_column(
        sa_enum(SettlementBatchStatus),
        nullable=False,
        default=SettlementBatchStatus.DRAFT,
        server_default="draft",
        index=True,
    )
    period_end: Mapped[date | None] = mapped_column(Date)
    items_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    total_gross_minor: Mapped[int] = money_col()
    total_commission_minor: Mapped[int] = money_col()
    total_tax_minor: Mapped[int] = money_col()
    total_tds_minor: Mapped[int] = money_col()
    total_net_minor: Mapped[int] = money_col()
    currency: Mapped[str] = currency_col("INR")
    created_by: Mapped[uuid.UUID | None] = fk("users.id", ondelete="RESTRICT", nullable=True)
    approved_by: Mapped[uuid.UUID | None] = fk("users.id", ondelete="RESTRICT", nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(Text)
    # SEC-003: each payee's destination account at generation time ({payee_id: {payout_account_id,
    # fingerprint, masked details}} or null when the payee had none). Processing refuses a payee whose
    # current account differs. Implementation column.
    payout_accounts_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSONB)

    items: Mapped[list[SettlementItem]] = relationship(
        "SettlementItem", back_populates="batch", lazy="raise", order_by="SettlementItem.created_at"
    )
    payouts: Mapped[list[Payout]] = relationship(
        "Payout", back_populates="batch", lazy="raise", order_by="Payout.created_at"
    )


class Payout(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "payouts"
    __table_args__ = (
        sa.CheckConstraint("amount_minor >= 0", name="amount_nonneg"),
        sa.Index("ix_payouts_payee", "payee_type", "payee_id"),
    )

    batch_id: Mapped[uuid.UUID] = fk("settlement_batches.id", ondelete="RESTRICT")
    payee_type: Mapped[PayeeType] = mapped_column(sa_enum(PayeeType), nullable=False)
    payee_id: Mapped[uuid.UUID] = mapped_column(sa.UUID(as_uuid=True), nullable=False)
    payout_account_id: Mapped[uuid.UUID | None] = fk("payout_accounts.id", ondelete="SET NULL", nullable=True)
    amount_minor: Mapped[int] = money_col()
    currency: Mapped[str] = currency_col("INR")
    method: Mapped[PayoutMethod] = mapped_column(sa_enum(PayoutMethod), nullable=False)
    status: Mapped[PayoutStatus] = mapped_column(
        sa_enum(PayoutStatus),
        nullable=False,
        default=PayoutStatus.QUEUED,
        server_default="queued",
        index=True,
    )
    gateway_payout_id: Mapped[str | None] = mapped_column(String(100), index=True)
    utr: Mapped[str | None] = mapped_column(String(64))
    failure_reason: Mapped[str | None] = mapped_column(Text)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Manual mark-paid maker-checker (backlog #26): the first finance user records the UTR, a different one
    # confirms it. Not in PLAN 4.13 (implementation columns).
    paid_requested_by: Mapped[uuid.UUID | None] = fk("users.id", ondelete="RESTRICT", nullable=True)
    paid_requested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    paid_confirmed_by: Mapped[uuid.UUID | None] = fk("users.id", ondelete="RESTRICT", nullable=True)
    # SEC-063: id of the pending mark-paid request; the checker's approval must name it (new per request).
    paid_request_id: Mapped[uuid.UUID | None] = mapped_column(sa.UUID(as_uuid=True))
    # SEC-003: fingerprint of the destination account the payout was created for (re-checked before sending).
    account_fingerprint: Mapped[str | None] = mapped_column(String(64))
    # SEC-004: set (and committed) before a provider call; a set marker without a result means the outcome is
    # unknown, so the payout is parked as needs_reconciliation instead of being re-sent.
    gateway_attempted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # SEC-003: reversing a processed (bounced) payout needs a second finance user.
    reversal_requested_by: Mapped[uuid.UUID | None] = fk("users.id", ondelete="RESTRICT", nullable=True)
    reversal_requested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reversal_reason: Mapped[str | None] = mapped_column(Text)
    reversal_reference: Mapped[str | None] = mapped_column(String(100))
    reversal_request_id: Mapped[uuid.UUID | None] = mapped_column(sa.UUID(as_uuid=True))  # SEC-063

    batch: Mapped[SettlementBatch] = relationship("SettlementBatch", back_populates="payouts", lazy="raise")
