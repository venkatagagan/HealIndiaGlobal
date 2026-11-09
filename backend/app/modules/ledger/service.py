"""Double-entry ledger service (PLAN 4.12 / 6.3).

Public contract (other modules may import these)::

    from app.modules.ledger.service import post_transaction, get_or_create_account

    txn = await post_transaction(
        db,
        txn_type=LedgerTxnType.PAYMENT_CAPTURED,
        reference_type="payment",
        reference_id=payment.id,
        idempotency_key=f"capture:{payment.id}",
        description="Payment captured",
        entries=[
            ("GATEWAY:razorpay:RECEIVABLE", "debit", 100_00),
            ("PLATFORM:PATIENT_ESCROW", "credit", 100_00),
        ],
    )

Rules
* All amounts are INR minor units; every entry amount must be a positive integer and the debits must equal the
  credits. ``post_transaction`` validates this before writing; the database re-checks it at COMMIT.
* ``idempotency_key`` is unique: posting the same key again returns the existing transaction unchanged (even
  when racing with a concurrent poster - the insert uses ``ON CONFLICT DO NOTHING``).
* Involved accounts are locked ``FOR UPDATE`` in id order (deadlock-free) and their cached
  ``balance_minor`` is updated with the normal-balance sign (assets/expenses debit-positive,
  everything else credit-positive).
* Entries and transactions are never updated or deleted (database triggers reject it). Corrections are new
  ``adjustment`` (or reversing) transactions.
* Nothing here commits: the caller owns the transaction.
"""

from __future__ import annotations

import re
import uuid
from collections import defaultdict
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import structlog
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.enums import EntryDirection, LedgerAccountType, LedgerOwnerType, LedgerTxnType
from app.core.ids import uuid7
from app.models.ledger import LedgerAccount, LedgerEntry, LedgerTransaction

logger = structlog.get_logger(__name__)

BASE_CURRENCY = "INR"

# ------------------------------------------------------------------------------------------ account codes
ESCROW = "PLATFORM:PATIENT_ESCROW"
BANK = "PLATFORM:BANK"
COMMISSION_REVENUE = "PLATFORM:COMMISSION_REVENUE"
SERVICE_FEE_REVENUE = "PLATFORM:SERVICE_FEE_REVENUE"
GST_OUTPUT = "TAX:GST_OUTPUT"
TDS_194O = "TAX:TDS_194O"
GATEWAY_FEES = "EXPENSE:GATEWAY_FEES"
AGENT_COMMISSION_EXPENSE = "EXPENSE:AGENT_COMMISSION"
# Implementation accounts (not in PLAN 4.12; documented in docs/PAYMENTS.md 7.2).
TDS_194H = "TAX:TDS_194H"  # TDS withheld from resident agents' commission
TDS_195 = "TAX:TDS_195"  # withholding on non-resident agents' commission (rate per CA/DTAA advice)
CANCELLATION_REVENUE = "PLATFORM:CANCELLATION_REVENUE"  # platform share of retained cancellation amounts
FX_GAIN_LOSS = "PLATFORM:FX_GAIN_LOSS"  # realised FX differences (debit = loss, credit = gain)
EQUITY = "PLATFORM:EQUITY"
ADJUSTMENTS = "PLATFORM:ADJUSTMENTS"


def gateway_receivable(gateway: str) -> str:
    return f"GATEWAY:{_enum_value(gateway)}:RECEIVABLE"


def hospital_payable(hospital_id: uuid.UUID | str) -> str:
    return f"HOSPITAL:{uuid.UUID(str(hospital_id))}:PAYABLE"


def agent_payable(agent_id: uuid.UUID | str) -> str:
    return f"AGENT:{uuid.UUID(str(agent_id))}:PAYABLE"


def vendor_payable(vendor_id: uuid.UUID | str) -> str:
    return f"VENDOR:{uuid.UUID(str(vendor_id))}:PAYABLE"


def payee_payable(payee_type: str, payee_id: uuid.UUID | str) -> str:
    kind = _enum_value(payee_type)
    if kind == "hospital":
        return hospital_payable(payee_id)
    if kind == "agent":
        return agent_payable(payee_id)
    if kind == "vendor":
        return vendor_payable(payee_id)
    raise ValueError(f"unknown payee type {payee_type!r}")


@dataclass(frozen=True, slots=True)
class AccountSpec:
    code: str
    name: str
    type: LedgerAccountType
    owner_type: LedgerOwnerType
    owner_id: uuid.UUID | None


_FIXED_ACCOUNTS: dict[str, tuple[str, LedgerAccountType, LedgerOwnerType]] = {
    BANK: ("Platform bank account", LedgerAccountType.ASSET, LedgerOwnerType.PLATFORM),
    ESCROW: ("Patient escrow", LedgerAccountType.LIABILITY, LedgerOwnerType.PLATFORM),
    COMMISSION_REVENUE: ("Commission revenue", LedgerAccountType.REVENUE, LedgerOwnerType.PLATFORM),
    SERVICE_FEE_REVENUE: ("Patient service fee revenue", LedgerAccountType.REVENUE, LedgerOwnerType.PLATFORM),
    GST_OUTPUT: ("GST output tax payable", LedgerAccountType.LIABILITY, LedgerOwnerType.TAX),
    TDS_194O: ("TDS u/s 194-O payable", LedgerAccountType.LIABILITY, LedgerOwnerType.TAX),
    GATEWAY_FEES: ("Payment gateway fees", LedgerAccountType.EXPENSE, LedgerOwnerType.PLATFORM),
    AGENT_COMMISSION_EXPENSE: (
        "Agent commission expense",
        LedgerAccountType.EXPENSE,
        LedgerOwnerType.PLATFORM,
    ),
    EQUITY: ("Owner's equity", LedgerAccountType.EQUITY, LedgerOwnerType.PLATFORM),
    ADJUSTMENTS: ("Manual adjustments", LedgerAccountType.EXPENSE, LedgerOwnerType.PLATFORM),
    TDS_194H: ("TDS on agent commission payable", LedgerAccountType.LIABILITY, LedgerOwnerType.TAX),
    TDS_195: (
        "Withholding on non-resident agent commission",
        LedgerAccountType.LIABILITY,
        LedgerOwnerType.TAX,
    ),
    CANCELLATION_REVENUE: (
        "Cancellation retention revenue",
        LedgerAccountType.REVENUE,
        LedgerOwnerType.PLATFORM,
    ),
    FX_GAIN_LOSS: ("FX gain / loss", LedgerAccountType.EXPENSE, LedgerOwnerType.PLATFORM),
}

_GATEWAY_RE = re.compile(r"^GATEWAY:([a-z_]{2,30}):RECEIVABLE$")
_PAYABLE_RE = re.compile(r"^(HOSPITAL|AGENT|VENDOR):([0-9a-fA-F-]{36}):PAYABLE$")
_PAYABLE_OWNER = {
    "HOSPITAL": (LedgerOwnerType.HOSPITAL, "Hospital payable"),
    "AGENT": (LedgerOwnerType.AGENT, "Agent commission payable"),
    "VENDOR": (LedgerOwnerType.VENDOR, "Vendor payable"),
}


class InvalidAccountCode(ValueError):
    pass


class LedgerValidationError(ValueError):
    pass


def _enum_value(value: Any) -> str:
    return str(getattr(value, "value", value))


def parse_account_code(code: str) -> AccountSpec:
    """Derive name/type/owner from an account code (PLAN 4.12). Raises ``InvalidAccountCode``."""
    if code in _FIXED_ACCOUNTS:
        name, acc_type, owner_type = _FIXED_ACCOUNTS[code]
        return AccountSpec(code, name, acc_type, owner_type, None)
    m = _GATEWAY_RE.match(code)
    if m:
        gateway = m.group(1)
        return AccountSpec(
            code, f"Gateway receivable ({gateway})", LedgerAccountType.ASSET, LedgerOwnerType.GATEWAY, None
        )
    m = _PAYABLE_RE.match(code)
    if m:
        kind, raw_id = m.group(1), m.group(2)
        try:
            owner_id = uuid.UUID(raw_id)
        except ValueError as exc:
            raise InvalidAccountCode(f"invalid owner id in account code {code!r}") from exc
        if str(owner_id) != raw_id.lower():
            raise InvalidAccountCode(f"non-canonical owner id in account code {code!r}")
        owner_type, label = _PAYABLE_OWNER[kind]
        canonical = f"{kind}:{owner_id}:PAYABLE"
        return AccountSpec(
            canonical, f"{label} {owner_id}", LedgerAccountType.LIABILITY, owner_type, owner_id
        )
    raise InvalidAccountCode(f"unknown ledger account code {code!r}")


def is_debit_normal(account_type: LedgerAccountType | str) -> bool:
    return _enum_value(account_type) in (LedgerAccountType.ASSET.value, LedgerAccountType.EXPENSE.value)


def signed_delta(account_type: LedgerAccountType | str, direction: EntryDirection | str, amount: int) -> int:
    """Balance change in the account's normal-balance sign."""
    debit = _enum_value(direction) == EntryDirection.DEBIT.value
    return amount if debit == is_debit_normal(account_type) else -amount


# ------------------------------------------------------------------------------------------ accounts
async def get_or_create_account(db: AsyncSession, code: str) -> LedgerAccount:
    """Return the account for ``code``, creating it (race-safe) from the code pattern if needed."""
    spec = parse_account_code(code)
    existing = (
        await db.execute(select(LedgerAccount).where(LedgerAccount.code == spec.code))
    ).scalar_one_or_none()
    if existing is not None:
        return existing
    await db.execute(
        pg_insert(LedgerAccount)
        .values(
            id=uuid7(),
            code=spec.code,
            name=spec.name,
            type=spec.type,
            owner_type=spec.owner_type,
            owner_id=spec.owner_id,
            currency=BASE_CURRENCY,
            balance_minor=0,
        )
        .on_conflict_do_nothing(index_elements=[LedgerAccount.code])
    )
    return (await db.execute(select(LedgerAccount).where(LedgerAccount.code == spec.code))).scalar_one()


async def get_account_by_code(db: AsyncSession, code: str) -> LedgerAccount | None:
    return (await db.execute(select(LedgerAccount).where(LedgerAccount.code == code))).scalar_one_or_none()


async def get_balance(db: AsyncSession, code: str) -> int:
    """Cached normal-sign balance of an account (0 if the account does not exist yet)."""
    value = (
        await db.execute(select(LedgerAccount.balance_minor).where(LedgerAccount.code == code))
    ).scalar_one_or_none()
    return int(value or 0)


async def sum_balances_by_prefix(db: AsyncSession, prefix: str) -> int:
    """Sum of balances of all accounts whose code starts with ``prefix`` (e.g. ``"HOSPITAL:"``)."""
    escaped = prefix.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    value = (
        await db.execute(
            select(func.coalesce(func.sum(LedgerAccount.balance_minor), 0)).where(
                LedgerAccount.code.like(f"{escaped}%", escape="\\")
            )
        )
    ).scalar_one()
    return int(value or 0)


# ------------------------------------------------------------------------------------------ posting
EntryInput = tuple[str, str | EntryDirection, int] | tuple[str, str | EntryDirection, int, str]


def _normalize_entries(entries: Sequence[EntryInput]) -> list[tuple[str, EntryDirection, int]]:
    if not entries:
        raise LedgerValidationError("a ledger transaction needs entries")
    normalized: list[tuple[str, EntryDirection, int]] = []
    debit_total = 0
    credit_total = 0
    for entry in entries:
        if len(entry) not in (3, 4):
            raise LedgerValidationError("entries must be (account_code, direction, amount_minor[, currency])")
        code, direction_raw, amount = entry[0], entry[1], entry[2]
        if len(entry) == 4 and str(entry[3]).upper() != BASE_CURRENCY:
            raise LedgerValidationError("ledger entries must be in INR")
        try:
            direction = EntryDirection(_enum_value(direction_raw))
        except ValueError as exc:
            raise LedgerValidationError(f"invalid entry direction {direction_raw!r}") from exc
        if isinstance(amount, bool) or not isinstance(amount, int):
            raise LedgerValidationError("entry amounts must be integers (minor units)")
        if amount <= 0:
            raise LedgerValidationError("entry amounts must be positive")
        spec = parse_account_code(code)
        normalized.append((spec.code, direction, amount))
        if direction is EntryDirection.DEBIT:
            debit_total += amount
        else:
            credit_total += amount
    if debit_total != credit_total:
        raise LedgerValidationError(f"unbalanced transaction: debit {debit_total} != credit {credit_total}")
    if len(normalized) < 2:
        raise LedgerValidationError("a ledger transaction needs at least two entries")
    return normalized


def balanced_lines(lines: Iterable[tuple[str, str, int]]) -> list[tuple[str, str, int]]:
    """Helper for callers that compute signed amounts: zero lines are dropped and a negative amount flips the
    direction (``("X", "credit", -5)`` becomes ``("X", "debit", 5)``)."""
    out: list[tuple[str, str, int]] = []
    for code, direction, amount in lines:
        if amount == 0:
            continue
        if amount < 0:
            direction = "credit" if _enum_value(direction) == "debit" else "debit"
            amount = -amount
        out.append((code, _enum_value(direction), int(amount)))
    return out


async def get_transaction_by_key(db: AsyncSession, idempotency_key: str) -> LedgerTransaction | None:
    return (
        await db.execute(
            select(LedgerTransaction).where(LedgerTransaction.idempotency_key == idempotency_key)
        )
    ).scalar_one_or_none()


async def post_transaction(
    db: AsyncSession,
    *,
    txn_type: LedgerTxnType | str,
    reference_type: str | None,
    reference_id: uuid.UUID | str | None,
    idempotency_key: str,
    description: str | None,
    entries: Sequence[EntryInput],
    created_by: uuid.UUID | None = None,
    posted_at: datetime | None = None,
) -> LedgerTransaction:
    """Post a balanced INR transaction (see module docstring). Returns the new or the existing transaction."""
    if not idempotency_key or len(idempotency_key) > 255:
        raise LedgerValidationError("idempotency_key is required (max 255 chars)")
    kind = LedgerTxnType(_enum_value(txn_type))
    normalized = _normalize_entries(entries)

    existing = await get_transaction_by_key(db, idempotency_key)
    if existing is not None:
        return existing

    # Accounts first (creation is idempotent), then lock them in id order.
    accounts_by_code: dict[str, LedgerAccount] = {}
    for code in sorted({code for code, _, _ in normalized}):
        accounts_by_code[code] = await get_or_create_account(db, code)

    txn_id = uuid7()
    when = posted_at or datetime.now(UTC)
    ref_id = uuid.UUID(str(reference_id)) if reference_id is not None else None
    inserted = (
        await db.execute(
            pg_insert(LedgerTransaction)
            .values(
                id=txn_id,
                txn_type=kind,
                reference_type=reference_type,
                reference_id=ref_id,
                description=(description or None),
                idempotency_key=idempotency_key,
                posted_at=when,
                created_by=created_by,
            )
            .on_conflict_do_nothing(index_elements=[LedgerTransaction.idempotency_key])
            .returning(LedgerTransaction.id)
        )
    ).scalar_one_or_none()
    if inserted is None:
        # A concurrent poster won the race (we waited for its commit); return its transaction.
        winner = await get_transaction_by_key(db, idempotency_key)
        if winner is None:  # pragma: no cover - defensive
            raise LedgerValidationError("idempotent ledger transaction vanished")
        return winner

    account_ids = sorted(acc.id for acc in accounts_by_code.values())
    locked = (
        (
            await db.execute(
                select(LedgerAccount)
                .where(LedgerAccount.id.in_(account_ids))
                .order_by(LedgerAccount.id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        )
        .scalars()
        .all()
    )
    by_id = {acc.id: acc for acc in locked}

    deltas: dict[uuid.UUID, int] = defaultdict(int)
    for code, direction, amount in normalized:
        account = by_id[accounts_by_code[code].id]
        if account.currency != BASE_CURRENCY:
            raise LedgerValidationError(f"account {code} is not an INR account")
        db.add(
            LedgerEntry(
                id=uuid7(),
                transaction_id=txn_id,
                account_id=account.id,
                direction=direction,
                amount_minor=amount,
                currency=BASE_CURRENCY,
            )
        )
        deltas[account.id] += signed_delta(account.type, direction, amount)
    for account_id, delta in deltas.items():
        if delta:
            account = by_id[account_id]
            account.balance_minor = int(account.balance_minor) + delta
    await db.flush()

    txn = (
        await db.execute(
            select(LedgerTransaction)
            .where(LedgerTransaction.id == txn_id)
            .execution_options(populate_existing=True)
        )
    ).scalar_one()
    logger.info(
        "ledger.posted",
        txn_id=str(txn_id),
        txn_type=kind.value,
        key=idempotency_key,
        amount=sum(a for _, d, a in normalized if d is EntryDirection.DEBIT),
    )
    return txn


async def load_transaction(db: AsyncSession, txn_id: uuid.UUID) -> LedgerTransaction | None:
    return (
        await db.execute(
            select(LedgerTransaction)
            .where(LedgerTransaction.id == txn_id)
            .options(selectinload(LedgerTransaction.entries))
        )
    ).scalar_one_or_none()


async def entries_with_accounts(
    db: AsyncSession, txn_ids: Sequence[uuid.UUID]
) -> dict[uuid.UUID, list[tuple[LedgerEntry, LedgerAccount]]]:
    """Entries (with their accounts) grouped by transaction id."""
    out: dict[uuid.UUID, list[tuple[LedgerEntry, LedgerAccount]]] = defaultdict(list)
    if not txn_ids:
        return out
    rows = (
        await db.execute(
            select(LedgerEntry, LedgerAccount)
            .join(LedgerAccount, LedgerAccount.id == LedgerEntry.account_id)
            .where(LedgerEntry.transaction_id.in_(list(txn_ids)))
            .order_by(LedgerEntry.transaction_id, LedgerEntry.id)
        )
    ).all()
    for entry, account in rows:
        out[entry.transaction_id].append((entry, account))
    return out
