"""Pydantic schemas for settlements, payouts, payout accounts, commission rules and finance summaries
(PLAN 8.12). Money is always integer minor units (INR)."""

from __future__ import annotations

import re
import uuid
from datetime import date, datetime
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_validator

from app.core.enums import (
    CommissionScope,
    InvoiceKind,
    PayeeType,
    PayoutAccountStatus,
    PayoutMethod,
    PayoutStatus,
    SettlementBatchStatus,
    SettlementItemStatus,
)

Reason = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]

_IFSC_RE = re.compile(r"^[A-Z]{4}0[A-Z0-9]{6}$")
_SWIFT_RE = re.compile(r"^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$")
_ACCOUNT_RE = re.compile(r"^[A-Z0-9]{5,34}$")
_UTR_RE = re.compile(r"^[A-Za-z0-9-]{4,64}$")
_TRANSFER_ID_RE = re.compile(r"^trf_[A-Za-z0-9]{6,40}$")  # Razorpay Route transfer id (case-sensitive)
_LINKED_RE = re.compile(r"^acc_[A-Za-z0-9]{6,40}$")


class _In(BaseModel):
    model_config = ConfigDict(extra="forbid")


class _Out(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ------------------------------------------------------------------------------------------ items / payouts
class SettlementItemOut(_Out):
    id: uuid.UUID
    payee_type: PayeeType
    payee_id: uuid.UUID
    payee_name: str | None = None
    booking_id: uuid.UUID
    booking_number: str | None = None
    payment_id: uuid.UUID | None = None
    ledger_transaction_id: uuid.UUID | None = None
    gross_minor: int
    commission_minor: int
    tax_minor: int
    tds_minor: int
    net_minor: int
    currency: str
    status: SettlementItemStatus
    eligible_at: datetime | None
    hold_reason: str | None
    batch_id: uuid.UUID | None
    created_at: datetime


class PayoutOut(_Out):
    id: uuid.UUID
    batch_id: uuid.UUID
    batch_number: str | None = None
    payee_type: PayeeType
    payee_id: uuid.UUID
    payee_name: str | None = None
    payout_account_id: uuid.UUID | None = None
    amount_minor: int
    currency: str
    method: PayoutMethod
    status: PayoutStatus
    utr: str | None
    gateway_payout_id: str | None
    failure_reason: str | None
    processed_at: datetime | None
    created_at: datetime
    # manual mark-paid maker-checker: set by the first finance user; a different one must confirm
    paid_requested_by: uuid.UUID | None = None
    paid_requested_at: datetime | None = None
    paid_confirmed_by: uuid.UUID | None = None
    awaiting_confirmation: bool = False  # UTR recorded, waiting for the second finance user
    paid_request_id: uuid.UUID | None = None  # SEC-063: send it back to mark-paid/approve
    # failing a processed / needs_reconciliation payout: requested by one finance user, approved by another
    reversal_requested_by: uuid.UUID | None = None
    reversal_requested_at: datetime | None = None
    reversal_reason: str | None = None
    reversal_reference: str | None = None
    reversal_request_id: uuid.UUID | None = None  # SEC-063: send it back to mark-failed/approve


class SettlementBatchOut(_Out):
    id: uuid.UUID
    batch_number: str
    payee_type: PayeeType
    payee_id: uuid.UUID | None
    payee_name: str | None = None
    status: SettlementBatchStatus
    period_end: date | None
    items_count: int
    total_gross_minor: int
    total_commission_minor: int
    total_tax_minor: int
    total_tds_minor: int
    total_net_minor: int
    currency: str
    created_by: uuid.UUID | None = None
    approved_by: uuid.UUID | None = None
    created_by_name: str | None = None
    approved_by_name: str | None = None
    notes: str | None = None
    created_at: datetime
    approved_at: datetime | None
    processed_at: datetime | None
    # destination accounts frozen at generation ({payee_id: masked details + fingerprint, or null})
    payout_accounts_snapshot: dict[str, Any] | None = None
    items: list[SettlementItemOut] | None = None
    payouts: list[PayoutOut] | None = None


class HoldIn(_In):
    reason: Reason


class ReleaseIn(_In):
    reason: Reason | None = None


class BatchCreateIn(_In):
    payee_type: PayeeType
    payee_id: uuid.UUID | None = None
    period_end: date | None = None
    notes: Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)] | None = None


class BatchApproveIn(_In):
    notes: Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)] | None = None


class BatchRejectIn(_In):
    reason: Reason


class BatchProcessIn(_In):
    method: PayoutMethod | None = Field(
        default=None,
        description="Force a payout method for every payee; default picks per payout account "
        "(razorpay_route when linked, mock outside production, else manual_bank_transfer).",
    )


class MarkPaidIn(_In):
    utr: Annotated[str, StringConstraints(strip_whitespace=True)]

    @field_validator("utr")
    @classmethod
    def _utr(cls, value: str) -> str:
        return normalize_utr(value)


def normalize_utr(value: str) -> str:
    """Bank UTRs are upper-cased; Razorpay ``trf_`` ids (parked Route payouts) keep their case."""
    if _TRANSFER_ID_RE.match(value):
        return value
    if not _UTR_RE.match(value):
        raise ValueError("UTR must be 4-64 letters, digits or dashes (or a Razorpay trf_ id)")
    return value.upper()


class MarkPaidApproveIn(_In):
    """SEC-063: the checker names the request reviewed (``paid_request_id``, UTR and amount as shown on the
    payout); 409 ``mark_paid_request_changed`` if the pending request differs."""

    request_id: uuid.UUID
    reference: Annotated[str, StringConstraints(strip_whitespace=True)]
    amount_minor: int = Field(gt=0)

    @field_validator("reference")
    @classmethod
    def _reference(cls, value: str) -> str:
        return normalize_utr(value)


class MarkFailedApproveIn(_In):
    """SEC-063: the checker names the reversal request reviewed (``reversal_request_id`` and reference)."""

    request_id: uuid.UUID
    reference: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=100)]


class MarkFailedIn(_In):
    reason: Reason
    # required when the payout is processed or needs_reconciliation (bank return / gateway reference)
    reference: (
        Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=100)] | None
    ) = None


# ------------------------------------------------------------------------------------------ commission rules
class CommissionRuleOut(_Out):
    id: uuid.UUID
    scope: CommissionScope
    hospital_id: uuid.UUID | None
    specialty_id: uuid.UUID | None
    procedure_id: uuid.UUID | None
    agent_id: uuid.UUID | None
    rate_bps: int
    effective_from: date
    effective_to: date | None
    is_active: bool
    created_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    # display names of the targets (filled by the list endpoint)
    hospital_name: str | None = None
    specialty_name: str | None = None
    procedure_name: str | None = None
    agent_name: str | None = None


class CommissionRuleIn(_In):
    scope: CommissionScope
    hospital_id: uuid.UUID | None = None
    specialty_id: uuid.UUID | None = None
    procedure_id: uuid.UUID | None = None
    agent_id: uuid.UUID | None = None
    rate_bps: int = Field(ge=0, le=10_000)
    effective_from: date | None = None
    effective_to: date | None = None
    is_active: bool = True

    @model_validator(mode="after")
    def _check(self) -> CommissionRuleIn:
        scope = self.scope
        targets = {
            "hospital_id": self.hospital_id,
            "specialty_id": self.specialty_id,
            "procedure_id": self.procedure_id,
            "agent_id": self.agent_id,
        }
        if scope is CommissionScope.GLOBAL and any(targets.values()):
            raise ValueError("a global rule cannot target a hospital, specialty, procedure or agent")
        if scope is CommissionScope.HOSPITAL and self.hospital_id is None:
            raise ValueError("a hospital rule needs hospital_id")
        if scope is CommissionScope.SPECIALTY and self.specialty_id is None:
            raise ValueError("a specialty rule needs specialty_id")
        if scope is CommissionScope.PROCEDURE and self.procedure_id is None:
            raise ValueError("a procedure rule needs procedure_id")
        if scope is CommissionScope.AGENT and any(v for k, v in targets.items() if k != "agent_id"):
            raise ValueError("an agent rule can only target agent_id (empty = default for all agents)")
        if scope is not CommissionScope.AGENT and self.agent_id is not None:
            raise ValueError("agent_id is only valid for agent rules")
        if scope is CommissionScope.SPECIALTY and self.procedure_id is not None:
            raise ValueError("a specialty rule cannot target a procedure (use a procedure rule)")
        if self.effective_from and self.effective_to and self.effective_to < self.effective_from:
            raise ValueError("effective_to must be on or after effective_from")
        return self


class CommissionRulePatch(_In):
    rate_bps: int | None = Field(default=None, ge=0, le=10_000)
    effective_from: date | None = None
    effective_to: date | None = None
    is_active: bool | None = None


class CommissionResolveOut(BaseModel):
    commission_bps: int
    agent_commission_bps: int | None = None


# ------------------------------------------------------------------------------------------ payout accounts
class PayoutAccountOut(BaseModel):
    id: uuid.UUID
    owner_type: PayeeType
    owner_id: uuid.UUID
    owner_name: str | None = None
    account_holder_name: str
    account_number_masked: str
    ifsc: str | None
    bank_name: str | None
    swift: str | None
    razorpay_linked_account_id: str | None
    is_verified: bool
    is_primary: bool
    status: PayoutAccountStatus
    submitted_by: uuid.UUID | None = None  # who last submitted the bank details (cannot verify them)
    verified_by: uuid.UUID | None = None
    verified_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


def _norm_upper(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = re.sub(r"[\s-]", "", value).upper()
    return cleaned or None


class _PayoutAccountFields(_In):
    @field_validator("account_number", mode="before", check_fields=False)
    @classmethod
    def _account_number(cls, value: object) -> object:
        if value is None:
            return None
        cleaned = _norm_upper(str(value))
        if cleaned is None or not _ACCOUNT_RE.match(cleaned):
            raise ValueError("account number must be 5-34 letters or digits")
        return cleaned

    @field_validator("ifsc", mode="before", check_fields=False)
    @classmethod
    def _ifsc(cls, value: object) -> object:
        cleaned = _norm_upper(str(value)) if value is not None else None
        if cleaned is not None and not _IFSC_RE.match(cleaned):
            raise ValueError("invalid IFSC code (e.g. HDFC0000123)")
        return cleaned

    @field_validator("swift", mode="before", check_fields=False)
    @classmethod
    def _swift(cls, value: object) -> object:
        cleaned = _norm_upper(str(value)) if value is not None else None
        if cleaned is not None and not _SWIFT_RE.match(cleaned):
            raise ValueError("invalid SWIFT/BIC code")
        return cleaned

    @field_validator("razorpay_linked_account_id", mode="before", check_fields=False)
    @classmethod
    def _linked(cls, value: object) -> object:
        if value is None or str(value).strip() == "":
            return None
        cleaned = str(value).strip()
        if not _LINKED_RE.match(cleaned):
            raise ValueError("invalid Razorpay linked account id (acc_...)")
        return cleaned


class PayoutAccountCreate(_PayoutAccountFields):
    owner_type: PayeeType | None = Field(default=None, description="Finance only: the payee to add it for")
    owner_id: uuid.UUID | None = Field(default=None, description="Finance only")
    account_holder_name: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=2, max_length=200)
    ]
    account_number: str
    ifsc: str | None = None
    bank_name: Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)] | None = None
    swift: str | None = None
    razorpay_linked_account_id: str | None = Field(default=None, description="Finance only")
    is_primary: bool = False

    @model_validator(mode="after")
    def _routing(self) -> PayoutAccountCreate:
        if not (self.ifsc or self.swift):
            raise ValueError("either ifsc (Indian accounts) or swift (international) is required")
        if (self.owner_type is None) != (self.owner_id is None):
            raise ValueError("owner_type and owner_id go together")
        return self


class PayoutAccountPatch(_PayoutAccountFields):
    account_holder_name: (
        Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=200)] | None
    ) = None
    account_number: str | None = None
    ifsc: str | None = None
    bank_name: Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)] | None = None
    swift: str | None = None
    razorpay_linked_account_id: str | None = None
    is_primary: bool | None = None
    status: PayoutAccountStatus | None = None


# ------------------------------------------------------------------------------------------ summaries
class StaffSummaryOut(BaseModel):
    currency: str = "INR"
    escrow_minor: int
    gateway_receivable_minor: int
    bank_minor: int
    commission_revenue_minor: int
    service_fee_revenue_minor: int
    gst_payable_minor: int
    tds_payable_minor: int
    gateway_fees_minor: int
    agent_commission_expense_minor: int
    hospital_payables_minor: int
    agent_payables_minor: int
    pending_settlement_minor: int
    eligible_settlement_minor: int
    on_hold_settlement_minor: int
    batches_pending_approval: int
    payouts_in_progress: int
    payouts_awaiting_confirmation: int = 0
    payouts_needs_reconciliation: int = 0
    payout_reversals_pending: int = 0
    gmv_minor: int


class PayeeSummaryOut(BaseModel):
    currency: str = "INR"
    payee_type: PayeeType
    payee_id: uuid.UUID
    payee_name: str | None = None
    pending_minor: int
    eligible_minor: int
    on_hold_minor: int
    batched_minor: int
    paid_minor: int
    last_payout: PayoutOut | None
    next_payout_date: date | None
    settlement_cycle_days: int


class StatementRow(BaseModel):
    date: datetime
    kind: str  # earning | clawback | payout
    reference: str | None
    booking_id: uuid.UUID | None = None
    booking_number: str | None = None
    description: str
    gross_minor: int
    commission_minor: int
    tax_minor: int
    tds_minor: int
    amount_minor: int  # signed effect on the payee balance
    status: str
    balance_minor: int


class StatementOut(BaseModel):
    payee_type: PayeeType
    payee_id: uuid.UUID
    payee_name: str | None
    currency: str = "INR"
    from_date: date
    to_date: date
    opening_balance_minor: int
    total_earned_minor: int
    total_paid_minor: int
    closing_balance_minor: int
    rows: list[StatementRow]


# ------------------------------------------------------------------------------------------ documents
class SettlementDocumentOut(_Out):
    """Commission tax invoice / credit note (hospital) or commission statement (agent) for a paid payout."""

    id: uuid.UUID
    invoice_number: str
    kind: InvoiceKind
    settlement_batch_id: uuid.UUID | None
    hospital_id: uuid.UUID | None
    agent_id: uuid.UUID | None
    payee_name: str | None = None  # hospital name or agency name
    line_items: list[dict[str, Any]]
    subtotal_minor: int
    tax_minor: int
    total_minor: int
    currency: str
    supplier_gstin: str | None
    recipient_gstin: str | None
    place_of_supply: str | None
    issued_at: datetime


# ------------------------------------------------------------------------------------------ list counts
class ListCountsOut(BaseModel):
    """Rows per status (or kind / verification state) for the same filters as the list endpoint, which
    ignore the status filter itself; powers the quick-filter tabs of the finance tables."""

    counts: dict[str, int]
    total: int
    # batches: automatic (system) batches waiting for a human approver
    auto_pending_approval: int | None = None
    # payouts: UTR recorded and waiting for a second finance user / failure requests waiting for one
    awaiting_confirmation: int | None = None
    reversal_pending: int | None = None
