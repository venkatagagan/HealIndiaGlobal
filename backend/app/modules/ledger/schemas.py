"""Ledger read models (PLAN 8.12). Amounts are INR minor units."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.core.enums import EntryDirection, LedgerAccountType, LedgerOwnerType, LedgerTxnType


class LedgerAccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    name: str
    type: LedgerAccountType
    owner_type: LedgerOwnerType
    owner_id: uuid.UUID | None
    currency: str
    balance_minor: int
    created_at: datetime
    updated_at: datetime


class LedgerEntryOut(BaseModel):
    id: uuid.UUID
    account_id: uuid.UUID
    account_code: str
    account_name: str
    account_type: LedgerAccountType
    direction: EntryDirection
    amount_minor: int
    currency: str


class LedgerTransactionOut(BaseModel):
    id: uuid.UUID
    txn_type: LedgerTxnType
    reference_type: str | None
    reference_id: uuid.UUID | None
    description: str | None
    idempotency_key: str
    posted_at: datetime
    created_by: uuid.UUID | None
    created_at: datetime
    total_minor: int
    entries: list[LedgerEntryOut]


class AccountEntryOut(BaseModel):
    """One line of an account statement; ``signed_amount_minor`` is in the account's normal-balance sign."""

    id: uuid.UUID
    transaction_id: uuid.UUID
    txn_type: LedgerTxnType
    reference_type: str | None
    reference_id: uuid.UUID | None
    description: str | None
    direction: EntryDirection
    amount_minor: int
    signed_amount_minor: int
    currency: str
    posted_at: datetime
    created_at: datetime


class TrialBalanceTypeRow(BaseModel):
    type: LedgerAccountType
    debit_minor: int
    credit_minor: int
    balance_minor: int  # normal-balance sign


class TrialBalanceAccountRow(BaseModel):
    id: uuid.UUID
    code: str
    name: str
    type: LedgerAccountType
    debit_minor: int
    credit_minor: int
    balance_minor: int  # computed from entries, normal-balance sign
    cached_balance_minor: int


class TrialBalanceOut(BaseModel):
    currency: str = "INR"
    as_of: datetime
    rows: list[TrialBalanceTypeRow]
    accounts: list[TrialBalanceAccountRow]
    total_debit_minor: int
    total_credit_minor: int
    net_minor: int  # total debit - total credit; always 0 for a healthy ledger
    balanced: bool
    cached_balances_consistent: bool


# ------------------------------------------------------------------------------------------ adjustments
AdjustmentKind = Literal["tax_remittance", "fx_difference", "manual"]
AdjustmentStatus = Literal["pending_approval", "posted", "rejected"]


class AdjustmentEntryIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    account_code: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=120)]
    direction: EntryDirection
    amount_minor: Annotated[int, Field(gt=0, le=10**15)]


class AdjustmentCreateIn(BaseModel):
    """Request a finance posting. ``tax_remittance``: debit ``TAX:*`` accounts, credit ``PLATFORM:BANK``;
    ``fx_difference``: must use ``PLATFORM:FX_GAIN_LOSS``; ``manual``: must use ``PLATFORM:ADJUSTMENTS`` or
    ``PLATFORM:EQUITY``. Payee payables cannot be adjusted here (use settlement items / refunds)."""

    model_config = ConfigDict(extra="forbid")

    kind: AdjustmentKind
    description: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=1000)]
    external_reference: (
        Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)] | None
    ) = None
    entries: Annotated[list[AdjustmentEntryIn], Field(min_length=2, max_length=20)]


class AdjustmentRejectIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=1000)]


class AdjustmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    kind: AdjustmentKind
    status: AdjustmentStatus
    description: str
    external_reference: str | None
    entries: list[dict[str, Any]]
    amount_minor: int
    currency: str = "INR"
    requested_by: uuid.UUID
    approved_by: uuid.UUID | None
    approved_at: datetime | None
    rejection_reason: str | None
    ledger_transaction_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


class LedgerAccountSummaryOut(BaseModel):
    """``GET /finance/ledger/accounts/summary``: accounts and summed balances per account type."""

    counts: dict[str, int]
    balances: dict[str, int]
    total: int


class AdjustmentStatusCounts(BaseModel):
    """``GET /finance/ledger/adjustments/status-counts``: adjustments per status and their sum."""

    counts: dict[str, int]
    total: int
