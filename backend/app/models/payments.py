"""Payment orders, payments, refunds, webhooks, installments, invoices (PLAN 4.11)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

import sqlalchemy as sa
from sqlalchemy import Boolean, Date, DateTime, Numeric, SmallInteger, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import (
    InstallmentStatus,
    InvoiceKind,
    OrderStatus,
    PaymentGateway,
    PaymentMethod,
    PaymentPurpose,
    PaymentStatus,
    RefundStatus,
    sa_enum,
)
from app.models.base import (
    Base,
    TimestampMixin,
    UUIDPkMixin,
    currency_col,
    fk,
    json_list_col,
    json_obj_col,
    money_col,
)

__all__ = ["Installment", "Invoice", "Payment", "PaymentOrder", "Refund", "WebhookEvent"]


class PaymentOrder(UUIDPkMixin, TimestampMixin, Base):
    """A request to collect money. ``meta`` maps to the ``metadata`` column (name reserved by SQLAlchemy)."""

    __tablename__ = "payment_orders"
    __table_args__ = (
        sa.UniqueConstraint("payer_user_id", "idempotency_key"),
        sa.UniqueConstraint("gateway", "gateway_order_id"),
        sa.CheckConstraint("amount_minor >= 0 AND base_amount_minor >= 0", name="amounts_nonneg"),
        sa.CheckConstraint("fx_rate > 0", name="fx_rate_positive"),
        sa.Index("ix_payment_orders_status_created_at", "status", "created_at"),
    )

    order_number: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    purpose: Mapped[PaymentPurpose] = mapped_column(sa_enum(PaymentPurpose), nullable=False, index=True)
    status: Mapped[OrderStatus] = mapped_column(
        sa_enum(OrderStatus),
        nullable=False,
        default=OrderStatus.CREATED,
        server_default="created",
        index=True,
    )
    gateway: Mapped[PaymentGateway] = mapped_column(sa_enum(PaymentGateway), nullable=False, index=True)
    payer_user_id: Mapped[uuid.UUID] = fk("users.id", ondelete="RESTRICT")
    patient_id: Mapped[uuid.UUID] = fk("patient_profiles.id", ondelete="RESTRICT")
    case_id: Mapped[uuid.UUID | None] = fk("cases.id", ondelete="SET NULL", nullable=True)
    booking_id: Mapped[uuid.UUID | None] = fk("bookings.id", ondelete="RESTRICT", nullable=True)
    consultation_id: Mapped[uuid.UUID | None] = fk("consultations.id", ondelete="SET NULL", nullable=True)
    installment_id: Mapped[uuid.UUID | None] = fk(
        "installments.id", ondelete="SET NULL", nullable=True, use_alter=True
    )
    amount_minor: Mapped[int] = money_col()
    currency: Mapped[str] = currency_col(None)
    base_amount_minor: Mapped[int] = money_col()
    base_currency: Mapped[str] = currency_col("INR")
    fx_rate: Mapped[Decimal] = mapped_column(
        Numeric(18, 8), nullable=False, default=Decimal("1"), server_default="1"
    )
    gateway_order_id: Mapped[str | None] = mapped_column(String(100))
    idempotency_key: Mapped[str | None] = mapped_column(String(255))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    meta: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB, nullable=False, default=dict, server_default=sa.text("'{}'::jsonb")
    )

    @property
    def review_required(self) -> str | None:
        """Pending finance action recorded in ``meta``: ``"amount"`` (a payment whose amount differs from the
        order is held for review) or ``"mark_paid"`` (a bank-transfer mark-paid awaits a second approver)."""
        meta = self.meta or {}
        if meta.get("amount_review_pending"):
            return "amount"
        request = meta.get("mark_paid_request")
        if isinstance(request, dict) and request.get("status") == "pending":
            return "mark_paid"
        return None


class Payment(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "payments"
    __table_args__ = (
        sa.UniqueConstraint("gateway", "gateway_payment_id"),
        sa.CheckConstraint(
            "amount_minor >= 0 AND base_amount_minor >= 0 AND fee_minor >= 0 AND tax_on_fee_minor >= 0 "
            "AND amount_refunded_minor >= 0",
            name="amounts_nonneg",
        ),
        sa.CheckConstraint("amount_refunded_minor <= amount_minor", name="refund_le_amount"),
    )

    order_id: Mapped[uuid.UUID] = fk("payment_orders.id", ondelete="RESTRICT")
    gateway: Mapped[PaymentGateway] = mapped_column(sa_enum(PaymentGateway), nullable=False)
    gateway_payment_id: Mapped[str] = mapped_column(String(100), nullable=False)
    method: Mapped[PaymentMethod | None] = mapped_column(sa_enum(PaymentMethod))
    status: Mapped[PaymentStatus] = mapped_column(
        sa_enum(PaymentStatus),
        nullable=False,
        default=PaymentStatus.CREATED,
        server_default="created",
        index=True,
    )
    amount_minor: Mapped[int] = money_col()
    currency: Mapped[str] = currency_col(None)
    base_amount_minor: Mapped[int] = money_col()
    fee_minor: Mapped[int] = money_col()
    tax_on_fee_minor: Mapped[int] = money_col()
    amount_refunded_minor: Mapped[int] = money_col()
    error_code: Mapped[str | None] = mapped_column(String(100))
    error_description: Mapped[str | None] = mapped_column(Text)
    captured_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    raw: Mapped[dict[str, Any]] = json_obj_col()


class Refund(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "refunds"
    __table_args__ = (
        sa.CheckConstraint("amount_minor > 0 AND base_amount_minor >= 0", name="amounts_valid"),
    )

    payment_id: Mapped[uuid.UUID] = fk("payments.id", ondelete="RESTRICT")
    order_id: Mapped[uuid.UUID] = fk("payment_orders.id", ondelete="RESTRICT")
    booking_id: Mapped[uuid.UUID | None] = fk("bookings.id", ondelete="RESTRICT", nullable=True)
    amount_minor: Mapped[int] = money_col()
    currency: Mapped[str] = currency_col(None)
    base_amount_minor: Mapped[int] = money_col()
    reason: Mapped[str | None] = mapped_column(Text)
    status: Mapped[RefundStatus] = mapped_column(
        sa_enum(RefundStatus),
        nullable=False,
        default=RefundStatus.REQUESTED,
        server_default="requested",
        index=True,
    )
    gateway_refund_id: Mapped[str | None] = mapped_column(String(100), index=True)
    requested_by: Mapped[uuid.UUID | None] = fk("users.id", ondelete="SET NULL", nullable=True)
    approved_by: Mapped[uuid.UUID | None] = fk("users.id", ondelete="SET NULL", nullable=True)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class WebhookEvent(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "webhook_events"
    __table_args__ = (sa.UniqueConstraint("gateway", "event_id"),)

    gateway: Mapped[PaymentGateway] = mapped_column(sa_enum(PaymentGateway), nullable=False)
    event_id: Mapped[str] = mapped_column(String(255), nullable=False)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    signature_valid: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=sa.false()
    )
    payload: Mapped[dict[str, Any]] = json_obj_col()
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    processing_error: Mapped[str | None] = mapped_column(Text)


class Installment(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "installments"
    __table_args__ = (
        sa.UniqueConstraint("booking_id", "seq"),
        sa.CheckConstraint("amount_minor >= 0", name="amount_nonneg"),
        sa.CheckConstraint("seq >= 1", name="seq_positive"),
        sa.Index("ix_installments_status_due_date", "status", "due_date"),
    )

    booking_id: Mapped[uuid.UUID] = fk("bookings.id", ondelete="CASCADE")
    seq: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    amount_minor: Mapped[int] = money_col()
    currency: Mapped[str] = currency_col("INR")
    status: Mapped[InstallmentStatus] = mapped_column(
        sa_enum(InstallmentStatus), nullable=False, default=InstallmentStatus.DUE, server_default="due"
    )
    order_id: Mapped[uuid.UUID | None] = fk("payment_orders.id", ondelete="SET NULL", nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Invoice(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "invoices"
    __table_args__ = (
        sa.CheckConstraint(
            "subtotal_minor >= 0 AND tax_minor >= 0 AND total_minor >= 0", name="amounts_nonneg"
        ),
    )

    invoice_number: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    kind: Mapped[InvoiceKind] = mapped_column(sa_enum(InvoiceKind), nullable=False, index=True)
    booking_id: Mapped[uuid.UUID | None] = fk("bookings.id", ondelete="RESTRICT", nullable=True)
    order_id: Mapped[uuid.UUID | None] = fk("payment_orders.id", ondelete="RESTRICT", nullable=True)
    settlement_batch_id: Mapped[uuid.UUID | None] = fk(
        "settlement_batches.id", ondelete="RESTRICT", nullable=True
    )
    issued_to_user_id: Mapped[uuid.UUID | None] = fk("users.id", ondelete="SET NULL", nullable=True)
    hospital_id: Mapped[uuid.UUID | None] = fk("hospitals.id", ondelete="RESTRICT", nullable=True)
    agent_id: Mapped[uuid.UUID | None] = fk("agents.id", ondelete="RESTRICT", nullable=True)
    line_items: Mapped[list[dict[str, Any]]] = json_list_col()
    subtotal_minor: Mapped[int] = money_col()
    tax_minor: Mapped[int] = money_col()
    total_minor: Mapped[int] = money_col()
    currency: Mapped[str] = currency_col("INR")
    supplier_gstin: Mapped[str | None] = mapped_column(String(15))
    recipient_gstin: Mapped[str | None] = mapped_column(String(15))
    place_of_supply: Mapped[str | None] = mapped_column(String(100))
    issued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )
    storage_key: Mapped[str | None] = mapped_column(String(512))
