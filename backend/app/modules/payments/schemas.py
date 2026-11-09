"""Pydantic schemas for the payments API (PLAN 8.11)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.enums import (
    InstallmentStatus,
    InvoiceKind,
    OrderStatus,
    PaymentGateway,
    PaymentMethod,
    PaymentPurpose,
    PaymentStatus,
    RefundStatus,
)


class _In(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class _Out(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ----------------------------------------------------------------------------------------------- requests
class OrderCreate(_In):
    """Amounts are never accepted from the client; they are derived from ``purpose`` server-side."""

    purpose: PaymentPurpose
    gateway: PaymentGateway
    booking_id: uuid.UUID | None = None
    installment_id: uuid.UUID | None = None
    consultation_id: uuid.UUID | None = None
    currency: str | None = Field(default=None, min_length=3, max_length=3, pattern=r"^[A-Za-z]{3}$")

    @field_validator("currency")
    @classmethod
    def _upper(cls, value: str | None) -> str | None:
        return value.upper() if value else value


class VerifyIn(_In):
    """Razorpay: the three ``razorpay_*`` fields returned by Checkout.js. Stripe: ``payment_intent_id``."""

    razorpay_payment_id: str | None = Field(default=None, max_length=100)
    razorpay_order_id: str | None = Field(default=None, max_length=100)
    razorpay_signature: str | None = Field(default=None, max_length=256)
    payment_intent_id: str | None = Field(default=None, max_length=100)


class BankTransferProofIn(_In):
    document_id: uuid.UUID
    reference: str = Field(min_length=1, max_length=100)


class MarkPaidIn(_In):
    reference: str = Field(min_length=1, max_length=100)
    amount_minor: int = Field(gt=0)


class MockCompleteIn(_In):
    outcome: Literal["success", "failure"] = "success"


class RefundCreate(_In):
    payment_id: uuid.UUID | None = None
    order_id: uuid.UUID | None = None
    amount_minor: int = Field(gt=0, description="In the payment's currency (minor units)")
    reason: str = Field(min_length=1, max_length=1000)

    @model_validator(mode="after")
    def _target(self) -> RefundCreate:
        if self.payment_id is None and self.order_id is None:
            raise ValueError("payment_id or order_id is required")
        return self


class RefundRejectIn(_In):
    reason: str = Field(min_length=1, max_length=1000)


class MarkPaidApproveIn(_In):
    """SEC-063: the checker states which request was reviewed (as shown in ``mark_paid_request``); the
    approval is refused with 409 ``mark_paid_request_changed`` if the pending request differs."""

    request_id: uuid.UUID | None = Field(
        default=None, description="``mark_paid_request.id``; when sent it must match the pending request"
    )
    reference: str = Field(min_length=1, max_length=100, description="The bank reference (UTR) reviewed")
    amount_minor: int = Field(gt=0, description="The amount reviewed (order currency, minor units)")


class MarkPaidDecisionIn(_In):
    """Second-approver decision on a pending bank-transfer mark-paid request."""

    reason: str | None = Field(default=None, max_length=1000)


class AmountReviewIn(_In):
    """Finance decision on a payment held because its captured amount differed from the order amount.
    ``accept`` applies it pro rata (the booking is credited with what was actually received); ``return``
    refunds it in full through the gateway without touching the books."""

    payment_id: uuid.UUID
    decision: Literal["accept", "return"]
    note: str = Field(min_length=1, max_length=1000)


# ----------------------------------------------------------------------------------------------- responses
class PaymentOrderOut(_Out):
    id: uuid.UUID
    order_number: str
    purpose: PaymentPurpose
    status: OrderStatus
    gateway: PaymentGateway
    amount_minor: int
    currency: str
    base_amount_minor: int
    base_currency: str
    fx_rate: Decimal
    booking_id: uuid.UUID | None
    installment_id: uuid.UUID | None
    consultation_id: uuid.UUID | None
    case_id: uuid.UUID | None = None
    patient_id: uuid.UUID | None = None
    gateway_order_id: str | None
    created_at: datetime
    paid_at: datetime | None
    expires_at: datetime | None
    review_required: Literal["amount", "mark_paid"] | None = None
    # staff list / detail display fields (filled by payments.listing; None elsewhere)
    payer_name: str | None = None
    patient_name: str | None = None
    booking_number: str | None = None
    payment_method: PaymentMethod | None = None


class PaymentOut(_Out):
    id: uuid.UUID
    order_id: uuid.UUID
    gateway: PaymentGateway
    gateway_payment_id: str
    method: PaymentMethod | None
    status: PaymentStatus
    amount_minor: int
    currency: str
    base_amount_minor: int
    fee_minor: int
    tax_on_fee_minor: int
    amount_refunded_minor: int
    error_code: str | None
    error_description: str | None
    captured_at: datetime | None
    created_at: datetime


class RefundOut(_Out):
    id: uuid.UUID
    payment_id: uuid.UUID
    order_id: uuid.UUID
    booking_id: uuid.UUID | None
    amount_minor: int
    currency: str
    base_amount_minor: int
    reason: str | None
    status: RefundStatus
    gateway_refund_id: str | None
    requested_by: uuid.UUID | None
    approved_by: uuid.UUID | None
    processed_at: datetime | None
    created_at: datetime
    updated_at: datetime
    # staff list display fields (filled by payments.listing; None elsewhere)
    order_number: str | None = None
    patient_name: str | None = None
    requested_by_name: str | None = None
    approved_by_name: str | None = None


class BankTransferProofOut(BaseModel):
    document_id: uuid.UUID
    reference: str
    submitted_at: datetime


class MarkPaidRequestOut(BaseModel):
    """Bank-transfer reconciliation awaiting (or decided by) a second finance user (staff view only)."""

    id: uuid.UUID | None = None  # None only for requests recorded before SEC-063
    status: Literal["pending", "approved", "rejected"]
    reference: str
    amount_minor: int
    requested_by: uuid.UUID
    requested_at: datetime
    decided_by: uuid.UUID | None = None
    decided_at: datetime | None = None
    reason: str | None = None


class AmountReviewOut(BaseModel):
    """A payment held because the captured amount differed from the order amount (staff view only)."""

    payment_id: uuid.UUID
    status: Literal["pending", "returning", "accepted", "returned"]
    #: why it was held: ``amount_mismatch`` or (SEC-007) ``booking_cancelled``, ``overpayment``,
    #: ``installment_cancelled``, ``installment_already_paid``, ``consultation_cancelled``,
    #: ``consultation_already_paid`` - those can only be returned
    reason: str = "amount_mismatch"
    expected_minor: int
    received_minor: int
    currency: str
    held_at: datetime
    decided_by: uuid.UUID | None = None
    decided_at: datetime | None = None
    note: str | None = None


class PaymentOrderDetail(PaymentOrderOut):
    payments: list[PaymentOut] = Field(default_factory=list)
    refunds: list[RefundOut] = Field(default_factory=list)
    bank_transfer_proof: BankTransferProofOut | None = None
    mark_paid_request: MarkPaidRequestOut | None = None
    amount_reviews: list[AmountReviewOut] = Field(default_factory=list)


class RazorpayPrefill(BaseModel):
    name: str = ""
    email: str = ""
    contact: str = ""


class RazorpayCheckout(BaseModel):
    key_id: str
    order_id: str | None
    amount: int
    currency: str
    name: str
    description: str
    prefill: RazorpayPrefill


class StripeCheckout(BaseModel):
    publishable_key: str
    client_secret: str | None


class BankTransferCheckout(BaseModel):
    beneficiary_name: str | None = None
    bank_name: str | None = None
    account_number: str | None = None
    ifsc: str | None = None
    swift: str | None = None
    iban: str | None = None
    reference: str


class MockCheckout(BaseModel):
    complete_url: str


class CheckoutOut(BaseModel):
    order: PaymentOrderOut
    gateway: PaymentGateway
    razorpay: RazorpayCheckout | None = None
    stripe: StripeCheckout | None = None
    bank_transfer: BankTransferCheckout | None = None
    mock: MockCheckout | None = None


class InstallmentOut(_Out):
    id: uuid.UUID
    booking_id: uuid.UUID
    seq: int
    due_date: date
    amount_minor: int
    currency: str
    status: InstallmentStatus
    order_id: uuid.UUID | None
    paid_at: datetime | None


class InvoiceOut(_Out):
    id: uuid.UUID
    invoice_number: str
    kind: InvoiceKind
    booking_id: uuid.UUID | None
    order_id: uuid.UUID | None
    settlement_batch_id: uuid.UUID | None
    issued_to_user_id: uuid.UUID | None
    hospital_id: uuid.UUID | None
    agent_id: uuid.UUID | None
    line_items: list[dict[str, Any]]
    subtotal_minor: int
    tax_minor: int
    total_minor: int
    currency: str
    supplier_gstin: str | None
    recipient_gstin: str | None
    place_of_supply: str | None
    issued_at: datetime
    created_at: datetime
    has_pdf: bool = False


class WebhookAck(BaseModel):
    status: Literal["processed", "duplicate", "ignored", "error"]
    event_id: str | None = None


class OrderStatusCounts(BaseModel):
    """``GET /payments/orders/status-counts``: orders per status (every status key present), their sum and
    the finance-review queues (``amount`` / ``mark_paid`` / ``any``) for the same filters."""

    counts: dict[str, int]
    total: int
    review: dict[str, int]


class RefundStatusCounts(BaseModel):
    """``GET /payments/refunds/status-counts``: refunds per status, their sum and the requested refunds above
    the dual-approval threshold (``threshold_minor``, INR) that need a second finance approver."""

    counts: dict[str, int]
    total: int
    awaiting_second_approval: int
    threshold_minor: int
