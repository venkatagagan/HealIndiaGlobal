"""Ledger endpoints (PLAN 8.12, finance | super_admin only): reads, trial balance and maker-checker
adjustments (tax remittance, FX differences, manual corrections; docs/PAYMENTS.md 7.4).

Route paths are written in full in each decorator; the router itself has no prefix.
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import UTC, date, datetime, time, timedelta
from typing import Annotated, Any, cast, get_args

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, or_, select

from app.core.deps import FINANCE_ROLES, CurrentUser, DbSession, PageParams, require_roles
from app.core.enums import EntryDirection, LedgerAccountType, LedgerOwnerType, LedgerTxnType
from app.core.errors import NotFound
from app.core.pagination import Page, paginate
from app.models.ledger import LedgerAccount, LedgerAdjustment, LedgerEntry, LedgerTransaction
from app.models.sequences import IST
from app.modules.ledger import adjustments
from app.modules.ledger.schemas import (
    AccountEntryOut,
    AdjustmentCreateIn,
    AdjustmentKind,
    AdjustmentOut,
    AdjustmentRejectIn,
    AdjustmentStatus,
    AdjustmentStatusCounts,
    LedgerAccountOut,
    LedgerAccountSummaryOut,
    LedgerEntryOut,
    LedgerTransactionOut,
    TrialBalanceAccountRow,
    TrialBalanceOut,
    TrialBalanceTypeRow,
)
from app.modules.ledger.service import entries_with_accounts, signed_delta

router = APIRouter(tags=["ledger"], dependencies=[Depends(require_roles(*FINANCE_ROLES))])


def _v(value: object) -> str:
    return str(getattr(value, "value", value))


ACCOUNT_SORT_FIELDS: dict[str, Any] = {
    "code": LedgerAccount.code,
    "name": LedgerAccount.name,
    "type": LedgerAccount.type,
    "owner_type": LedgerAccount.owner_type,
    "balance_minor": LedgerAccount.balance_minor,
}
ACCOUNT_SORT_PATTERN = r"^-?(" + "|".join(ACCOUNT_SORT_FIELDS) + r")$"


def _like(term: str) -> str:
    return "%" + term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"


def _ist_day(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=IST)


def _window(column: Any, start: date | None, end: date | None) -> list[Any]:
    """Inclusive IST calendar-date bounds."""
    out: list[Any] = []
    if start is not None:
        out.append(column >= _ist_day(start))
    if end is not None:
        out.append(column < _ist_day(end + timedelta(days=1)))
    return out


def _sorted(stmt: Any, fields: dict[str, Any], sort: str | None, default: str, tiebreak: Any) -> Any:
    sort = sort or default
    column = fields.get(sort.lstrip("-"), fields[default.lstrip("-")])
    if sort.startswith("-"):
        return stmt.order_by(column.desc().nulls_last(), tiebreak.desc())
    return stmt.order_by(column.asc().nulls_last(), tiebreak.asc())


def _account_clauses(
    owner_type: list[LedgerOwnerType] | None,
    types: list[LedgerAccountType] | None,
    owner_id: uuid.UUID | None,
    q: str | None,
    nonzero: bool,
) -> list[Any]:
    clauses: list[Any] = []
    if owner_type:
        clauses.append(LedgerAccount.owner_type.in_(owner_type))
    if types:
        clauses.append(LedgerAccount.type.in_(types))
    if owner_id is not None:
        clauses.append(LedgerAccount.owner_id == owner_id)
    if q:
        pattern = _like(q)
        clauses.append(
            or_(
                LedgerAccount.code.ilike(pattern, escape="\\"), LedgerAccount.name.ilike(pattern, escape="\\")
            )
        )
    if nonzero:
        clauses.append(LedgerAccount.balance_minor != 0)
    return clauses


@router.get("/finance/ledger/accounts", response_model=Page[LedgerAccountOut])
async def list_accounts(
    db: DbSession,
    params: PageParams,
    owner_type: Annotated[list[LedgerOwnerType] | None, Query(description="Repeatable")] = None,
    type: Annotated[  # noqa: A002 - public query parameter name
        list[LedgerAccountType] | None, Query(description="Repeatable")
    ] = None,
    owner_id: uuid.UUID | None = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
    nonzero: Annotated[bool, Query(description="Only accounts with a non-zero balance")] = False,
    sort: Annotated[
        str | None,
        Query(
            pattern=ACCOUNT_SORT_PATTERN,
            description="code | name | type | owner_type | balance_minor; '-' = descending (default code)",
        ),
    ] = None,
) -> Page[Any]:
    stmt = select(LedgerAccount).where(*_account_clauses(owner_type, type, owner_id, q, nonzero))
    stmt = _sorted(stmt, ACCOUNT_SORT_FIELDS, sort, "code", LedgerAccount.id)
    return await paginate(
        db, stmt, params, transform=lambda rows: [LedgerAccountOut.model_validate(r) for r in rows]
    )


@router.get("/finance/ledger/accounts/summary", response_model=LedgerAccountSummaryOut)
async def accounts_summary(
    db: DbSession,
    owner_type: Annotated[list[LedgerOwnerType] | None, Query(description="Repeatable")] = None,
    owner_id: uuid.UUID | None = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
    nonzero: bool = False,
) -> LedgerAccountSummaryOut:
    """Accounts and summed balances per account type for the same filters as the account list (``type``
    itself is not a filter here, so the result can drive type tabs)."""
    rows = (
        await db.execute(
            select(LedgerAccount.type, func.count(), func.coalesce(func.sum(LedgerAccount.balance_minor), 0))
            .where(*_account_clauses(owner_type, None, owner_id, q, nonzero))
            .group_by(LedgerAccount.type)
        )
    ).all()
    counts = {t.value: 0 for t in LedgerAccountType}
    balances = {t.value: 0 for t in LedgerAccountType}
    for account_type, count, balance in rows:
        counts[_v(account_type)] = int(count)
        balances[_v(account_type)] = int(balance)
    return LedgerAccountSummaryOut(counts=counts, balances=balances, total=sum(counts.values()))


@router.get("/finance/ledger/accounts/{account_id}", response_model=LedgerAccountOut)
async def get_account(account_id: uuid.UUID, db: DbSession) -> LedgerAccountOut:
    account = await db.get(LedgerAccount, account_id)
    if account is None:
        raise NotFound("Ledger account not found")
    return LedgerAccountOut.model_validate(account)


ENTRY_SORT_FIELDS: dict[str, Any] = {
    "posted_at": LedgerTransaction.posted_at,
    "amount_minor": LedgerEntry.amount_minor,
}
ENTRY_SORT_PATTERN = r"^-?(" + "|".join(ENTRY_SORT_FIELDS) + r")$"


@router.get("/finance/ledger/accounts/{account_id}/entries", response_model=Page[AccountEntryOut])
async def account_entries(
    account_id: uuid.UUID,
    db: DbSession,
    params: PageParams,
    direction: EntryDirection | None = None,
    txn_type: Annotated[list[LedgerTxnType] | None, Query(description="Repeatable")] = None,
    posted_from: Annotated[date | None, Query(description="Inclusive IST date")] = None,
    posted_to: Annotated[date | None, Query(description="Inclusive IST date")] = None,
    sort: Annotated[
        str | None,
        Query(pattern=ENTRY_SORT_PATTERN, description="posted_at | amount_minor; '-' = descending"),
    ] = None,
) -> Page[Any]:
    account = await db.get(LedgerAccount, account_id)
    if account is None:
        raise NotFound("Ledger account not found")
    stmt = (
        select(LedgerEntry, LedgerTransaction)
        .join(LedgerTransaction, LedgerTransaction.id == LedgerEntry.transaction_id)
        .where(LedgerEntry.account_id == account.id)
        .where(*_window(LedgerTransaction.posted_at, posted_from, posted_to))
    )
    if direction is not None:
        stmt = stmt.where(LedgerEntry.direction == direction)
    if txn_type:
        stmt = stmt.where(LedgerTransaction.txn_type.in_(txn_type))
    stmt = _sorted(stmt, ENTRY_SORT_FIELDS, sort, "-posted_at", LedgerEntry.id)

    def _rows(rows: list[Any]) -> list[AccountEntryOut]:
        out: list[AccountEntryOut] = []
        for entry, txn in rows:
            out.append(
                AccountEntryOut(
                    id=entry.id,
                    transaction_id=txn.id,
                    txn_type=txn.txn_type,
                    reference_type=txn.reference_type,
                    reference_id=txn.reference_id,
                    description=txn.description,
                    direction=entry.direction,
                    amount_minor=int(entry.amount_minor),
                    signed_amount_minor=signed_delta(account.type, entry.direction, int(entry.amount_minor)),
                    currency=entry.currency,
                    posted_at=txn.posted_at,
                    created_at=entry.created_at,
                )
            )
        return out

    return await paginate(db, cast(Any, stmt), params, transform=_rows, scalars=False)


async def _transactions_out(db: Any, txns: list[LedgerTransaction]) -> list[LedgerTransactionOut]:
    grouped = await entries_with_accounts(db, [t.id for t in txns])
    out: list[LedgerTransactionOut] = []
    for txn in txns:
        lines = grouped.get(txn.id, [])
        out.append(
            LedgerTransactionOut(
                id=txn.id,
                txn_type=txn.txn_type,
                reference_type=txn.reference_type,
                reference_id=txn.reference_id,
                description=txn.description,
                idempotency_key=txn.idempotency_key,
                posted_at=txn.posted_at,
                created_by=txn.created_by,
                created_at=txn.created_at,
                total_minor=sum(int(e.amount_minor) for e, _ in lines if _v(e.direction) == "debit"),
                entries=[
                    LedgerEntryOut(
                        id=e.id,
                        account_id=a.id,
                        account_code=a.code,
                        account_name=a.name,
                        account_type=a.type,
                        direction=e.direction,
                        amount_minor=int(e.amount_minor),
                        currency=e.currency,
                    )
                    for e, a in lines
                ],
            )
        )
    return out


@router.get("/finance/ledger/transactions", response_model=Page[LedgerTransactionOut])
async def list_transactions(
    db: DbSession,
    params: PageParams,
    txn_type: Annotated[list[LedgerTxnType] | None, Query(description="Repeatable")] = None,
    reference_type: Annotated[str | None, Query(max_length=60)] = None,
    reference_id: uuid.UUID | None = None,
    account_id: uuid.UUID | None = None,
    q: Annotated[
        str | None, Query(max_length=100, description="Description, reference type or reference id")
    ] = None,
    posted_from: Annotated[date | None, Query(description="Inclusive IST date")] = None,
    posted_to: Annotated[date | None, Query(description="Inclusive IST date")] = None,
    min_amount: Annotated[
        int | None, Query(ge=0, description="Transaction total (sum of debits), minor")
    ] = None,
    max_amount: Annotated[
        int | None, Query(ge=0, description="Transaction total (sum of debits), minor")
    ] = None,
    sort: Annotated[
        str | None, Query(pattern=r"^-?posted_at$", description="posted_at; '-' = descending (default)")
    ] = None,
) -> Page[Any]:
    stmt = select(LedgerTransaction)
    if txn_type:
        stmt = stmt.where(LedgerTransaction.txn_type.in_(txn_type))
    if reference_type:
        stmt = stmt.where(LedgerTransaction.reference_type == reference_type)
    if reference_id is not None:
        stmt = stmt.where(LedgerTransaction.reference_id == reference_id)
    if account_id is not None:
        stmt = stmt.where(
            LedgerTransaction.id.in_(
                select(LedgerEntry.transaction_id).where(LedgerEntry.account_id == account_id)
            )
        )
    stmt = stmt.where(*_window(LedgerTransaction.posted_at, posted_from, posted_to))
    if q and q.strip():
        term = q.strip()
        matches: list[Any] = [
            LedgerTransaction.description.ilike(_like(term), escape="\\"),
            LedgerTransaction.reference_type.ilike(_like(term), escape="\\"),
        ]
        try:
            matches.append(LedgerTransaction.reference_id == uuid.UUID(term))
            matches.append(LedgerTransaction.id == uuid.UUID(term))
        except ValueError:
            pass
        stmt = stmt.where(or_(*matches))
    if min_amount is not None or max_amount is not None:
        total = func.sum(LedgerEntry.amount_minor)
        having: list[Any] = []
        if min_amount is not None:
            having.append(total >= min_amount)
        if max_amount is not None:
            having.append(total <= max_amount)
        stmt = stmt.where(
            LedgerTransaction.id.in_(
                select(LedgerEntry.transaction_id)
                .where(LedgerEntry.direction == EntryDirection.DEBIT)
                .group_by(LedgerEntry.transaction_id)
                .having(*having)
            )
        )
    stmt = _sorted(stmt, {"posted_at": LedgerTransaction.posted_at}, sort, "-posted_at", LedgerTransaction.id)

    async def _transform(rows: list[LedgerTransaction]) -> list[LedgerTransactionOut]:
        return await _transactions_out(db, rows)

    return await paginate(db, stmt, params, transform=_transform)


@router.get("/finance/ledger/transactions/{txn_id}", response_model=LedgerTransactionOut)
async def get_transaction(txn_id: uuid.UUID, db: DbSession) -> LedgerTransactionOut:
    txn = await db.get(LedgerTransaction, txn_id)
    if txn is None:
        raise NotFound("Ledger transaction not found")
    return (await _transactions_out(db, [txn]))[0]


@router.get("/finance/ledger/trial-balance", response_model=TrialBalanceOut)
async def trial_balance(db: DbSession) -> TrialBalanceOut:
    """Debit/credit totals per account and per account type, computed from the entries; ``net_minor``
    (total debit - total credit) must be 0. Also checks the cached account balances against the entries."""
    sums = (
        await db.execute(
            select(
                LedgerEntry.account_id,
                LedgerEntry.direction,
                func.coalesce(func.sum(LedgerEntry.amount_minor), 0),
            ).group_by(LedgerEntry.account_id, LedgerEntry.direction)
        )
    ).all()
    per_account: dict[uuid.UUID, dict[str, int]] = defaultdict(lambda: {"debit": 0, "credit": 0})
    for account_id, direction, total in sums:
        per_account[account_id][_v(direction)] += int(total)
    accounts = (await db.execute(select(LedgerAccount).order_by(LedgerAccount.code))).scalars().all()
    by_type: dict[str, dict[str, int]] = {t.value: {"debit": 0, "credit": 0} for t in LedgerAccountType}
    account_rows: list[TrialBalanceAccountRow] = []
    consistent = True
    for account in accounts:
        totals = per_account.get(account.id, {"debit": 0, "credit": 0})
        balance = signed_delta(account.type, EntryDirection.DEBIT, totals["debit"]) + signed_delta(
            account.type, EntryDirection.CREDIT, totals["credit"]
        )
        consistent = consistent and balance == int(account.balance_minor)
        by_type[_v(account.type)]["debit"] += totals["debit"]
        by_type[_v(account.type)]["credit"] += totals["credit"]
        account_rows.append(
            TrialBalanceAccountRow(
                id=account.id,
                code=account.code,
                name=account.name,
                type=account.type,
                debit_minor=totals["debit"],
                credit_minor=totals["credit"],
                balance_minor=balance,
                cached_balance_minor=int(account.balance_minor),
            )
        )
    rows = [
        TrialBalanceTypeRow(
            type=LedgerAccountType(t),
            debit_minor=v["debit"],
            credit_minor=v["credit"],
            balance_minor=(
                v["debit"] - v["credit"]
                if t in (LedgerAccountType.ASSET.value, LedgerAccountType.EXPENSE.value)
                else v["credit"] - v["debit"]
            ),
        )
        for t, v in by_type.items()
    ]
    total_debit = sum(r.debit_minor for r in rows)
    total_credit = sum(r.credit_minor for r in rows)
    return TrialBalanceOut(
        as_of=datetime.now(UTC),
        rows=rows,
        accounts=account_rows,
        total_debit_minor=total_debit,
        total_credit_minor=total_credit,
        net_minor=total_debit - total_credit,
        balanced=total_debit == total_credit,
        cached_balances_consistent=consistent,
    )


# ------------------------------------------------------------------------------------------ adjustments
ADJUSTMENT_SORT_FIELDS: dict[str, Any] = {
    "created_at": LedgerAdjustment.created_at,
    "approved_at": LedgerAdjustment.approved_at,
    "amount_minor": LedgerAdjustment.amount_minor,
    "status": LedgerAdjustment.status,
    "kind": LedgerAdjustment.kind,
}
ADJUSTMENT_SORT_PATTERN = r"^-?(" + "|".join(ADJUSTMENT_SORT_FIELDS) + r")$"
ADJUSTMENT_STATUSES: tuple[str, ...] = get_args(AdjustmentStatus)


def _adjustment_clauses(
    status: list[AdjustmentStatus] | None,
    kind: list[AdjustmentKind] | None,
    q: str | None,
    created_from: date | None,
    created_to: date | None,
    min_amount: int | None,
    max_amount: int | None,
) -> list[Any]:
    clauses: list[Any] = _window(LedgerAdjustment.created_at, created_from, created_to)
    if status:
        clauses.append(LedgerAdjustment.status.in_(status))
    if kind:
        clauses.append(LedgerAdjustment.kind.in_(kind))
    if q and q.strip():
        pattern = _like(q.strip())
        clauses.append(
            or_(
                LedgerAdjustment.description.ilike(pattern, escape="\\"),
                LedgerAdjustment.external_reference.ilike(pattern, escape="\\"),
            )
        )
    if min_amount is not None:
        clauses.append(LedgerAdjustment.amount_minor >= min_amount)
    if max_amount is not None:
        clauses.append(LedgerAdjustment.amount_minor <= max_amount)
    return clauses


@router.get("/finance/ledger/adjustments", response_model=Page[AdjustmentOut])
async def list_adjustments(
    db: DbSession,
    params: PageParams,
    status: Annotated[list[AdjustmentStatus] | None, Query(description="Repeatable")] = None,
    kind: Annotated[list[AdjustmentKind] | None, Query(description="Repeatable")] = None,
    q: Annotated[str | None, Query(max_length=100, description="Description or external reference")] = None,
    created_from: Annotated[date | None, Query(description="Inclusive IST date")] = None,
    created_to: Annotated[date | None, Query(description="Inclusive IST date")] = None,
    min_amount: Annotated[int | None, Query(ge=0)] = None,
    max_amount: Annotated[int | None, Query(ge=0)] = None,
    sort: Annotated[
        str | None,
        Query(
            pattern=ADJUSTMENT_SORT_PATTERN,
            description="created_at | approved_at | amount_minor | status | kind; '-' = descending",
        ),
    ] = None,
) -> Page[Any]:
    stmt = select(LedgerAdjustment).where(
        *_adjustment_clauses(status, kind, q, created_from, created_to, min_amount, max_amount)
    )
    stmt = _sorted(stmt, ADJUSTMENT_SORT_FIELDS, sort, "-created_at", LedgerAdjustment.id)
    return await paginate(
        db, stmt, params, transform=lambda rows: [AdjustmentOut.model_validate(r) for r in rows]
    )


@router.get("/finance/ledger/adjustments/status-counts", response_model=AdjustmentStatusCounts)
async def adjustment_status_counts(
    db: DbSession,
    kind: Annotated[list[AdjustmentKind] | None, Query(description="Repeatable")] = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
    created_from: date | None = None,
    created_to: date | None = None,
    min_amount: Annotated[int | None, Query(ge=0)] = None,
    max_amount: Annotated[int | None, Query(ge=0)] = None,
) -> AdjustmentStatusCounts:
    """Adjustments per status for the same filters as the list (``status`` itself is not a filter here)."""
    clauses = _adjustment_clauses(None, kind, q, created_from, created_to, min_amount, max_amount)
    rows = (
        await db.execute(
            select(LedgerAdjustment.status, func.count()).where(*clauses).group_by(LedgerAdjustment.status)
        )
    ).all()
    counts = dict.fromkeys(ADJUSTMENT_STATUSES, 0)
    for value, count in rows:
        counts[_v(value)] = int(count)
    return AdjustmentStatusCounts(counts=counts, total=sum(counts.values()))


@router.post("/finance/ledger/adjustments", response_model=AdjustmentOut, status_code=201)
async def create_adjustment(
    body: AdjustmentCreateIn, request: Request, db: DbSession, user: CurrentUser
) -> AdjustmentOut:
    """Request a tax remittance / FX difference / manual posting; a different finance user must approve."""
    adj = await adjustments.request_adjustment(
        db,
        user,
        kind=body.kind,
        description=body.description,
        external_reference=body.external_reference,
        entries=[e.model_dump(mode="json") for e in body.entries],
        request=request,
    )
    await db.commit()
    return AdjustmentOut.model_validate(adj)


@router.get("/finance/ledger/adjustments/{adjustment_id}", response_model=AdjustmentOut)
async def get_adjustment(adjustment_id: uuid.UUID, db: DbSession) -> AdjustmentOut:
    adj = await db.get(LedgerAdjustment, adjustment_id)
    if adj is None:
        raise NotFound("Ledger adjustment not found")
    return AdjustmentOut.model_validate(adj)


@router.post("/finance/ledger/adjustments/{adjustment_id}/approve", response_model=AdjustmentOut)
async def approve_adjustment(
    adjustment_id: uuid.UUID, request: Request, db: DbSession, user: CurrentUser
) -> AdjustmentOut:
    adj = await adjustments.approve_adjustment(db, user, adjustment_id, request)
    await db.commit()
    return AdjustmentOut.model_validate(adj)


@router.post("/finance/ledger/adjustments/{adjustment_id}/reject", response_model=AdjustmentOut)
async def reject_adjustment(
    adjustment_id: uuid.UUID, body: AdjustmentRejectIn, request: Request, db: DbSession, user: CurrentUser
) -> AdjustmentOut:
    adj = await adjustments.reject_adjustment(db, user, adjustment_id, body.reason, request)
    await db.commit()
    return AdjustmentOut.model_validate(adj)
