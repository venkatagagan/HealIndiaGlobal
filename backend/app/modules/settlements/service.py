"""Settlements: commission resolution, settlement items, batches (maker-checker), payouts, payout accounts,
summaries and statements (PLAN 4.13 / 6.3 / 6.4 / 8.12).

Public contract (other modules may import)::

    from app.modules.settlements.service import resolve_commission_bps, resolve_agent_commission_bps
    bps = await resolve_commission_bps(db, hospital_id=h, procedure_id=p, specialty_id=s)
    agent_bps = await resolve_agent_commission_bps(db, agent_id)

    # agent portal / hospital portal listings of settlement items (SettlementItemOut pages):
    page = await list_items_page(db, params, payee_type=PayeeType.AGENT, payee_id=agent.id, status="pending")

Settlement items are *derived from the ledger*: every booking-scoped ledger transaction (revenue recognition,
its proportional reversals and agent commissions) produces exactly one item (unique
``ledger_transaction_id``), so items always agree with the payables in the ledger. Positive items start
``pending`` with ``eligible_at = completed_at + settlement_hold_days``; clawbacks (negative) are
``eligible`` immediately so they net against the payee's next batch.
Nothing in this module commits; routers/tasks commit.
"""

from __future__ import annotations

import csv
import hashlib
import io
import uuid
from collections import defaultdict
from collections.abc import Iterable, Sequence
from datetime import UTC, date, datetime, time, timedelta
from typing import Any

import structlog
from fastapi import Request
from sqlalchemy import Select, and_, func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit_log
from app.core.config import settings
from app.core.crypto import mask
from app.core.enums import (
    CommissionScope,
    PayeeType,
    PayoutAccountStatus,
    PayoutMethod,
    PayoutStatus,
    SettlementBatchStatus,
    SettlementItemStatus,
)
from app.core.errors import BadRequest, Conflict, Forbidden, NotFound
from app.core.events import publish
from app.core.ids import uuid7
from app.core.jobs import enqueue
from app.core.pagination import Page, paginate
from app.core.settings_store import get_setting
from app.models.agents import Agent
from app.models.cases import Booking
from app.models.catalog import Procedure, Specialty
from app.models.hospitals import Hospital
from app.models.identity import User
from app.models.ledger import LedgerTransaction
from app.models.payments import Payment
from app.models.settlements import CommissionRule, Payout, PayoutAccount, SettlementBatch, SettlementItem
from app.models.travel import AccommodationProvider, ServiceProvider
from app.modules.ledger import service as ledger
from app.modules.ledger.postings import CAPTURED_STATUSES
from app.modules.settlements import invoices as settlement_documents
from app.modules.settlements.policies import Payee
from app.modules.settlements.providers import (
    PayoutOutcomeUnknown,
    PayoutResult,
    PayoutTransientError,
    default_method,
    get_provider,
)
from app.modules.settlements.schemas import (
    CommissionRuleIn,
    CommissionRulePatch,
    PayeeSummaryOut,
    PayoutAccountCreate,
    PayoutAccountOut,
    PayoutAccountPatch,
    PayoutOut,
    SettlementBatchOut,
    SettlementItemOut,
    StaffSummaryOut,
    StatementOut,
    StatementRow,
)

logger = structlog.get_logger(__name__)

HOLDABLE_STATUSES = (SettlementItemStatus.PENDING, SettlementItemStatus.ELIGIBLE)
UNPAID_STATUSES = (
    SettlementItemStatus.PENDING,
    SettlementItemStatus.ELIGIBLE,
    SettlementItemStatus.ON_HOLD,
    SettlementItemStatus.BATCHED,
)
IN_FLIGHT_PAYOUT = (PayoutStatus.QUEUED, PayoutStatus.PROCESSING, PayoutStatus.NEEDS_RECONCILIATION)
# Failing these needs a second finance user (money may already have left: SEC-003 / SEC-004).
DUAL_CONTROL_FAILURE = (PayoutStatus.PROCESSED, PayoutStatus.NEEDS_RECONCILIATION)
ACCOUNT_CHANGED_REASON = "payout account changed since the batch was generated; regenerate the batch"


def _v(value: object) -> str:
    return str(getattr(value, "value", value))


def _now() -> datetime:
    return datetime.now(UTC)


def today() -> date:
    return _now().date()


def _today() -> date:
    return _now().date()


# ================================================================================================ commission
def _rule_rank(rule: CommissionRule) -> int:
    has_h, has_p, has_s = (
        rule.hospital_id is not None,
        rule.procedure_id is not None,
        rule.specialty_id is not None,
    )
    if has_h and has_p:
        return 60
    if has_h and has_s:
        return 55
    if has_h:
        return 50
    if has_p:
        return 30
    if has_s:
        return 20
    return 10


HOSPITAL_OVERRIDE_RANK = 45  # hospitals.commission_rate_bps: below hospital rules, above procedure rules


def _active_on(on: date) -> Any:
    return and_(
        CommissionRule.is_active.is_(True),
        CommissionRule.effective_from <= on,
        or_(CommissionRule.effective_to.is_(None), CommissionRule.effective_to >= on),
    )


def _matches(column: Any, value: uuid.UUID | None) -> Any:
    return column.is_(None) if value is None else or_(column.is_(None), column == value)


async def resolve_commission_bps(
    db: AsyncSession,
    *,
    hospital_id: uuid.UUID | None,
    procedure_id: uuid.UUID | None = None,
    specialty_id: uuid.UUID | None = None,
    on: date | None = None,
) -> int:
    """Platform commission rate. Most specific active rule wins: procedure+hospital > hospital(+specialty) >
    ``hospitals.commission_rate_bps`` > procedure > specialty > global > setting ``default_commission_bps``.
    Ties go to the latest ``effective_from`` then the newest rule."""
    on = on or _today()
    if specialty_id is None and procedure_id is not None:
        specialty_id = (
            await db.execute(select(Procedure.specialty_id).where(Procedure.id == procedure_id))
        ).scalar_one_or_none()
    rules = (
        (
            await db.execute(
                select(CommissionRule).where(
                    CommissionRule.scope != CommissionScope.AGENT,
                    _active_on(on),
                    _matches(CommissionRule.hospital_id, hospital_id),
                    _matches(CommissionRule.procedure_id, procedure_id),
                    _matches(CommissionRule.specialty_id, specialty_id),
                    CommissionRule.agent_id.is_(None),
                )
            )
        )
        .scalars()
        .all()
    )
    best: tuple[int, date, datetime] | None = None
    best_rate: int | None = None
    for rule in rules:
        key = (_rule_rank(rule), rule.effective_from, rule.created_at)
        if best is None or key > best:
            best, best_rate = key, int(rule.rate_bps)
    if hospital_id is not None and (best is None or best[0] < HOSPITAL_OVERRIDE_RANK):
        override = (
            await db.execute(select(Hospital.commission_rate_bps).where(Hospital.id == hospital_id))
        ).scalar_one_or_none()
        if override is not None:
            return int(override)
    if best_rate is not None:
        return best_rate
    return int(await get_setting(db, "default_commission_bps"))


async def resolve_agent_commission_bps(
    db: AsyncSession, agent_id: uuid.UUID | None, *, on: date | None = None
) -> int:
    """Agent commission rate: agent-specific rule > ``agents.commission_rate_bps`` > default agent rule
    (scope agent, no agent_id) > setting ``default_agent_commission_bps``."""
    on = on or _today()
    rules = (
        (
            await db.execute(
                select(CommissionRule).where(
                    CommissionRule.scope == CommissionScope.AGENT,
                    _active_on(on),
                    _matches(CommissionRule.agent_id, agent_id),
                )
            )
        )
        .scalars()
        .all()
    )
    specific = [r for r in rules if r.agent_id is not None]
    generic = [r for r in rules if r.agent_id is None]

    def _latest(candidates: list[CommissionRule]) -> int | None:
        if not candidates:
            return None
        return int(max(candidates, key=lambda r: (r.effective_from, r.created_at)).rate_bps)

    rate = _latest(specific)
    if rate is not None:
        return rate
    if agent_id is not None:
        own = (
            await db.execute(select(Agent.commission_rate_bps).where(Agent.id == agent_id))
        ).scalar_one_or_none()
        if own is not None:
            return int(own)
    rate = _latest(generic)
    if rate is not None:
        return rate
    return int(await get_setting(db, "default_agent_commission_bps"))


async def create_commission_rule(
    db: AsyncSession, actor: User, body: CommissionRuleIn, request: Request | None = None
) -> CommissionRule:
    checks: list[tuple[Any, uuid.UUID | None, str]] = [
        (Hospital, body.hospital_id, "hospital"),
        (Specialty, body.specialty_id, "specialty"),
        (Procedure, body.procedure_id, "procedure"),
        (Agent, body.agent_id, "agent"),
    ]
    for model, value, label in checks:
        if value is not None and await db.get(model, value) is None:
            raise BadRequest(f"Unknown {label}", code="invalid_reference", details={"field": f"{label}_id"})
    rule = CommissionRule(
        scope=body.scope,
        hospital_id=body.hospital_id,
        specialty_id=body.specialty_id,
        procedure_id=body.procedure_id,
        agent_id=body.agent_id,
        rate_bps=body.rate_bps,
        effective_from=body.effective_from or _today(),
        effective_to=body.effective_to,
        is_active=body.is_active,
        created_by=actor.id,
    )
    db.add(rule)
    await db.flush()
    await audit_log(
        db,
        actor=actor,
        action="commission_rule.create",
        entity_type="commission_rule",
        entity_id=rule.id,
        after=body.model_dump(mode="json"),
        request=request,
    )
    return rule


async def update_commission_rule(
    db: AsyncSession,
    actor: User,
    rule_id: uuid.UUID,
    body: CommissionRulePatch,
    request: Request | None = None,
) -> CommissionRule:
    rule = await db.get(CommissionRule, rule_id, with_for_update=True)
    if rule is None:
        raise NotFound("Commission rule not found")
    changes = body.model_dump(exclude_unset=True)
    before = {k: getattr(rule, k) for k in changes}
    for key, value in changes.items():
        if key in {"rate_bps", "effective_from", "is_active"} and value is None:
            raise BadRequest(f"{key} cannot be null", code="invalid_value")
        setattr(rule, key, value)
    if rule.effective_to is not None and rule.effective_to < rule.effective_from:
        raise BadRequest("effective_to must be on or after effective_from", code="invalid_value")
    await db.flush()
    await audit_log(
        db,
        actor=actor,
        action="commission_rule.update",
        entity_type="commission_rule",
        entity_id=rule.id,
        before=before,
        after=changes,
        request=request,
    )
    return rule


# ================================================================================================ names
async def payee_names(
    db: AsyncSession, pairs: Iterable[tuple[str, uuid.UUID]]
) -> dict[tuple[str, uuid.UUID], str]:
    wanted: dict[str, set[uuid.UUID]] = defaultdict(set)
    for payee_type, payee_id in pairs:
        if payee_id is not None:
            wanted[_v(payee_type)].add(payee_id)
    out: dict[tuple[str, uuid.UUID], str] = {}
    if wanted.get("hospital"):
        for hid, name in (
            await db.execute(select(Hospital.id, Hospital.name).where(Hospital.id.in_(wanted["hospital"])))
        ).all():
            out[("hospital", hid)] = name
    if wanted.get("agent"):
        for aid, name in (
            await db.execute(select(Agent.id, Agent.agency_name).where(Agent.id.in_(wanted["agent"])))
        ).all():
            out[("agent", aid)] = name
    if wanted.get("vendor"):
        ids = wanted["vendor"]
        for model in (ServiceProvider, AccommodationProvider):
            for vid, name in (await db.execute(select(model.id, model.name).where(model.id.in_(ids)))).all():
                out[("vendor", vid)] = name
    return out


async def _user_names(db: AsyncSession, ids: Iterable[uuid.UUID | None]) -> dict[uuid.UUID, str]:
    wanted = {i for i in ids if i is not None}
    if not wanted:
        return {}
    rows = (await db.execute(select(User.id, User.full_name, User.email).where(User.id.in_(wanted)))).all()
    return {uid: (full_name or email or "") for uid, full_name, email in rows}


async def _booking_numbers(db: AsyncSession, ids: Iterable[uuid.UUID]) -> dict[uuid.UUID, str]:
    wanted = set(ids)
    if not wanted:
        return {}
    rows = (await db.execute(select(Booking.id, Booking.booking_number).where(Booking.id.in_(wanted)))).all()
    return dict(rows)


# ============================================================================================= serialization
async def serialize_items(db: AsyncSession, items: Sequence[SettlementItem]) -> list[SettlementItemOut]:
    names = await payee_names(db, {(_v(i.payee_type), i.payee_id) for i in items})
    numbers = await _booking_numbers(db, {i.booking_id for i in items})
    out: list[SettlementItemOut] = []
    for item in items:
        model = SettlementItemOut.model_validate(item)
        model.payee_name = names.get((_v(item.payee_type), item.payee_id))
        model.booking_number = numbers.get(item.booking_id)
        out.append(model)
    return out


async def serialize_payouts(db: AsyncSession, payouts: Sequence[Payout]) -> list[PayoutOut]:
    names = await payee_names(db, {(_v(p.payee_type), p.payee_id) for p in payouts})
    batch_ids = {p.batch_id for p in payouts}
    numbers: dict[uuid.UUID, str] = {}
    if batch_ids:
        numbers = dict(
            (
                await db.execute(
                    select(SettlementBatch.id, SettlementBatch.batch_number).where(
                        SettlementBatch.id.in_(batch_ids)
                    )
                )
            ).all()
        )
    out: list[PayoutOut] = []
    for payout in payouts:
        model = PayoutOut.model_validate(payout)
        model.payee_name = names.get((_v(payout.payee_type), payout.payee_id))
        model.batch_number = numbers.get(payout.batch_id)
        model.awaiting_confirmation = (
            payout.paid_requested_by is not None and payout.status in IN_FLIGHT_PAYOUT
        )
        out.append(model)
    return out


async def serialize_batches(db: AsyncSession, batches: Sequence[SettlementBatch]) -> list[SettlementBatchOut]:
    users = await _user_names(db, [b.created_by for b in batches] + [b.approved_by for b in batches])
    names = await payee_names(db, {(_v(b.payee_type), b.payee_id) for b in batches if b.payee_id})
    out: list[SettlementBatchOut] = []
    for batch in batches:
        model = SettlementBatchOut.model_validate(
            {
                **{c: getattr(batch, c) for c in SettlementBatchOut.model_fields if c not in _BATCH_EXTRA},
                "items": None,
                "payouts": None,
            }
        )
        model.created_by_name = users.get(batch.created_by) if batch.created_by else "System"
        model.approved_by_name = users.get(batch.approved_by) if batch.approved_by else None
        model.payee_name = names.get((_v(batch.payee_type), batch.payee_id)) if batch.payee_id else None
        out.append(model)
    return out


_BATCH_EXTRA = frozenset({"items", "payouts", "created_by_name", "approved_by_name", "payee_name"})


async def batch_detail(db: AsyncSession, batch: SettlementBatch) -> SettlementBatchOut:
    (model,) = await serialize_batches(db, [batch])
    items = (
        (
            await db.execute(
                select(SettlementItem)
                .where(SettlementItem.batch_id == batch.id)
                .order_by(SettlementItem.payee_id, SettlementItem.created_at, SettlementItem.id)
            )
        )
        .scalars()
        .all()
    )
    payouts = (
        (
            await db.execute(
                select(Payout).where(Payout.batch_id == batch.id).order_by(Payout.created_at, Payout.id)
            )
        )
        .scalars()
        .all()
    )
    model.items = await serialize_items(db, items)
    model.payouts = await serialize_payouts(db, payouts)
    return model


def serialize_account(account: PayoutAccount, owner_name: str | None = None) -> PayoutAccountOut:
    return PayoutAccountOut(
        id=account.id,
        owner_type=PayeeType(_v(account.owner_type)),
        owner_id=account.owner_id,
        owner_name=owner_name,
        account_holder_name=account.account_holder_name,
        account_number_masked=mask("0" * 8 + account.account_number_last4, keep=4),
        ifsc=account.ifsc,
        bank_name=account.bank_name,
        swift=account.swift,
        razorpay_linked_account_id=account.razorpay_linked_account_id,
        is_verified=account.is_verified,
        is_primary=account.is_primary,
        status=PayoutAccountStatus(_v(account.status)),
        submitted_by=account.submitted_by,
        verified_by=account.verified_by,
        verified_at=account.verified_at,
        created_at=account.created_at,
        updated_at=account.updated_at,
    )


async def serialize_accounts(db: AsyncSession, accounts: Sequence[PayoutAccount]) -> list[PayoutAccountOut]:
    names = await payee_names(db, {(_v(a.owner_type), a.owner_id) for a in accounts})
    return [serialize_account(a, names.get((_v(a.owner_type), a.owner_id))) for a in accounts]


# ================================================================================================ listing
def items_query(
    *,
    payee_type: PayeeType | str | None = None,
    payee_id: uuid.UUID | None = None,
    status: SettlementItemStatus | str | Sequence[SettlementItemStatus | str] | None = None,
    booking_id: uuid.UUID | None = None,
    batch_id: uuid.UUID | None = None,
) -> Select[Any]:
    stmt = select(SettlementItem)
    if payee_type is not None:
        stmt = stmt.where(SettlementItem.payee_type == PayeeType(_v(payee_type)))
    if payee_id is not None:
        stmt = stmt.where(SettlementItem.payee_id == payee_id)
    if isinstance(status, (list, tuple)):
        if status:
            stmt = stmt.where(SettlementItem.status.in_([SettlementItemStatus(_v(s)) for s in status]))
    elif status is not None:
        stmt = stmt.where(SettlementItem.status == SettlementItemStatus(_v(status)))
    if booking_id is not None:
        stmt = stmt.where(SettlementItem.booking_id == booking_id)
    if batch_id is not None:
        stmt = stmt.where(SettlementItem.batch_id == batch_id)
    return stmt.order_by(SettlementItem.created_at.desc(), SettlementItem.id.desc())


async def list_items_page(
    db: AsyncSession,
    params: Any,
    *,
    payee_type: PayeeType | str | None = None,
    payee_id: uuid.UUID | None = None,
    status: SettlementItemStatus | str | Sequence[SettlementItemStatus | str] | None = None,
    booking_id: uuid.UUID | None = None,
    batch_id: uuid.UUID | None = None,
) -> Page[SettlementItemOut]:
    """``Page[SettlementItemOut]`` (used by the finance API and the agent/hospital portals)."""
    stmt = items_query(
        payee_type=payee_type, payee_id=payee_id, status=status, booking_id=booking_id, batch_id=batch_id
    )

    async def _transform(rows: list[SettlementItem]) -> list[SettlementItemOut]:
        return await serialize_items(db, rows)

    return await paginate(db, stmt, params, transform=_transform)


# ================================================================================================ items
def _payee_from_code(code: str) -> tuple[PayeeType, uuid.UUID] | None:
    parts = code.split(":")
    if len(parts) == 3 and parts[2] == "PAYABLE" and parts[0] in {"HOSPITAL", "AGENT", "VENDOR"}:
        return PayeeType(parts[0].lower()), uuid.UUID(parts[1])
    return None


async def sync_items_for_booking(
    db: AsyncSession, booking_id: uuid.UUID | str, *, payment_id: uuid.UUID | str | None = None
) -> int:
    """Create the settlement items for every booking-scoped ledger transaction that has none yet. Idempotent
    (unique ``ledger_transaction_id``). Returns the number of items created."""
    bid = uuid.UUID(str(booking_id))
    booking = await db.get(Booking, bid)
    if booking is None:
        return 0
    has_item = select(SettlementItem.id).where(SettlementItem.ledger_transaction_id == LedgerTransaction.id)
    txns = (
        (
            await db.execute(
                select(LedgerTransaction)
                .where(
                    LedgerTransaction.reference_type == "booking",
                    LedgerTransaction.reference_id == bid,
                    ~has_item.exists(),
                )
                .order_by(LedgerTransaction.posted_at, LedgerTransaction.id)
            )
        )
        .scalars()
        .all()
    )
    if not txns:
        return 0
    entries = await ledger.entries_with_accounts(db, [t.id for t in txns])
    hold_days = int(await get_setting(db, "settlement_hold_days"))
    now = _now()
    prior_positive: set[str] = {
        _v(pt)
        for (pt,) in (
            await db.execute(
                select(SettlementItem.payee_type)
                .where(SettlementItem.booking_id == bid, SettlementItem.net_minor > 0)
                .distinct()
            )
        ).all()
    }
    pid = uuid.UUID(str(payment_id)) if payment_id else None
    created = 0
    for txn in txns:
        credit_net: dict[str, int] = defaultdict(int)
        for entry, account in entries.get(txn.id, []):
            amount = int(entry.amount_minor)
            credit_net[account.code] += amount if _v(entry.direction) == "credit" else -amount
        payee: tuple[PayeeType, uuid.UUID] | None = None
        net = 0
        for code, amount in credit_net.items():
            parsed = _payee_from_code(code)
            if parsed is not None:
                payee, net = parsed, amount
                break
        if payee is None:
            continue
        if payee[0] is PayeeType.HOSPITAL:
            commission = credit_net.get(ledger.COMMISSION_REVENUE, 0)
            tax = credit_net.get(ledger.GST_OUTPUT, 0)
            tds = credit_net.get(ledger.TDS_194O, 0)
        else:
            # agent items: gross = commission K, tds = withholding (s.194H / non-resident), net = payable
            commission = tax = 0
            tds = credit_net.get(ledger.TDS_194H, 0) + credit_net.get(ledger.TDS_195, 0)
        gross = net + commission + tax + tds
        if gross == 0 and net == 0:
            continue
        if net >= 0:
            first = payee[0].value not in prior_positive
            base = booking.completed_at if (first and booking.completed_at is not None) else now
            eligible_at = base + timedelta(days=hold_days)
            status = SettlementItemStatus.PENDING
            prior_positive.add(payee[0].value)
        else:
            eligible_at = now
            status = SettlementItemStatus.ELIGIBLE
        result = await db.execute(
            pg_insert(SettlementItem)
            .values(
                id=uuid7(),
                payee_type=payee[0],
                payee_id=payee[1],
                booking_id=bid,
                payment_id=pid if net >= 0 else None,
                ledger_transaction_id=txn.id,
                gross_minor=gross,
                commission_minor=commission,
                tax_minor=tax,
                tds_minor=tds,
                net_minor=net,
                currency="INR",
                status=status,
                eligible_at=eligible_at,
            )
            .on_conflict_do_nothing()
            .returning(SettlementItem.id)
        )
        if result.scalar_one_or_none() is not None:
            created += 1
    if created:
        logger.info("settlements.items_created", booking_id=str(bid), count=created)
    return created


async def mark_eligible(db: AsyncSession, *, now: datetime | None = None) -> int:
    """``pending`` -> ``eligible`` once ``eligible_at`` has passed (application clock)."""
    now = now or _now()
    items = (
        (
            await db.execute(
                select(SettlementItem)
                .where(
                    SettlementItem.status == SettlementItemStatus.PENDING,
                    SettlementItem.eligible_at.is_not(None),
                    SettlementItem.eligible_at <= now,
                )
                .with_for_update(skip_locked=True)
            )
        )
        .scalars()
        .all()
    )
    for item in items:
        item.status = SettlementItemStatus.ELIGIBLE
    await db.flush()
    return len(items)


async def _get_item_locked(db: AsyncSession, item_id: uuid.UUID) -> SettlementItem:
    item = (
        await db.execute(
            select(SettlementItem)
            .where(SettlementItem.id == item_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if item is None:
        raise NotFound("Settlement item not found")
    return item


async def hold_item(
    db: AsyncSession, actor: User, item_id: uuid.UUID, reason: str, request: Request | None = None
) -> SettlementItem:
    item = await _get_item_locked(db, item_id)
    if item.status not in HOLDABLE_STATUSES:
        raise Conflict(f"A {_v(item.status)} item cannot be put on hold", code="invalid_state")
    before = {"status": _v(item.status), "hold_reason": item.hold_reason}
    item.status = SettlementItemStatus.ON_HOLD
    item.hold_reason = reason
    await db.flush()
    await audit_log(
        db,
        actor=actor,
        action="settlement_item.hold",
        entity_type="settlement_item",
        entity_id=item.id,
        before=before,
        after={"status": "on_hold", "hold_reason": reason},
        request=request,
    )
    return item


async def release_item(
    db: AsyncSession,
    actor: User,
    item_id: uuid.UUID,
    reason: str | None = None,
    request: Request | None = None,
) -> SettlementItem:
    item = await _get_item_locked(db, item_id)
    if item.status != SettlementItemStatus.ON_HOLD:
        raise Conflict("Only items on hold can be released", code="invalid_state")
    before = {"status": "on_hold", "hold_reason": item.hold_reason}
    due = item.eligible_at is None or item.eligible_at <= _now()
    item.status = SettlementItemStatus.ELIGIBLE if due else SettlementItemStatus.PENDING
    item.hold_reason = None
    await db.flush()
    await audit_log(
        db,
        actor=actor,
        action="settlement_item.release",
        entity_type="settlement_item",
        entity_id=item.id,
        before=before,
        after={"status": _v(item.status), "reason": reason},
        request=request,
    )
    return item


# ================================================================================================ batches
async def _payee_exists(db: AsyncSession, payee_type: PayeeType, payee_id: uuid.UUID) -> bool:
    if payee_type is PayeeType.HOSPITAL:
        return await db.get(Hospital, payee_id) is not None
    if payee_type is PayeeType.AGENT:
        return await db.get(Agent, payee_id) is not None
    return (
        await db.get(ServiceProvider, payee_id) is not None
        or await db.get(AccommodationProvider, payee_id) is not None
    )


async def generate_batch(
    db: AsyncSession,
    *,
    actor: User | None,
    payee_type: PayeeType | str,
    payee_id: uuid.UUID | None = None,
    period_end: date | None = None,
    notes: str | None = None,
    request: Request | None = None,
) -> SettlementBatch:
    """Collect eligible items (not on hold) of the payee type (optionally one payee) into a batch awaiting
    approval. Payees whose eligible items net to <= 0 are left out (their clawbacks carry forward)."""
    ptype = PayeeType(_v(payee_type))
    cutoff = datetime.combine(period_end, time.max, tzinfo=UTC) if period_end else _now()
    stmt = select(SettlementItem).where(
        SettlementItem.payee_type == ptype,
        SettlementItem.status == SettlementItemStatus.ELIGIBLE,
        or_(SettlementItem.eligible_at.is_(None), SettlementItem.eligible_at <= cutoff),
    )
    if payee_id is not None:
        stmt = stmt.where(SettlementItem.payee_id == payee_id)
    items = (
        (
            await db.execute(
                stmt.order_by(
                    SettlementItem.payee_id, SettlementItem.created_at, SettlementItem.id
                ).with_for_update(skip_locked=True)
            )
        )
        .scalars()
        .all()
    )
    grouped: dict[uuid.UUID, list[SettlementItem]] = defaultdict(list)
    for item in items:
        grouped[item.payee_id].append(item)
    selected = [i for group in grouped.values() if sum(int(x.net_minor) for x in group) > 0 for i in group]
    if not selected:
        raise BadRequest(
            "No eligible settlement items with a positive balance to batch",
            code="no_eligible_items",
            details={"payee_type": ptype.value, "payee_id": str(payee_id) if payee_id else None},
        )
    # SEC-003: freeze each payee's destination now; the approver sees it and processing refuses changes.
    snapshot: dict[str, Any] = {}
    for pid in sorted({i.payee_id for i in selected}, key=str):
        snapshot[str(pid)] = account_snapshot(await primary_payout_account(db, ptype, pid))
    batch = SettlementBatch(
        batch_number=await ledger_next_batch_number(db),
        payee_type=ptype,
        payee_id=payee_id,
        status=SettlementBatchStatus.PENDING_APPROVAL,
        period_end=period_end or _today(),
        items_count=len(selected),
        total_gross_minor=sum(int(i.gross_minor) for i in selected),
        total_commission_minor=sum(int(i.commission_minor) for i in selected),
        total_tax_minor=sum(int(i.tax_minor) for i in selected),
        total_tds_minor=sum(int(i.tds_minor) for i in selected),
        total_net_minor=sum(int(i.net_minor) for i in selected),
        currency="INR",
        created_by=actor.id if actor is not None else None,
        notes=notes,
        payout_accounts_snapshot=snapshot,
    )
    db.add(batch)
    await db.flush()
    for item in selected:
        item.status = SettlementItemStatus.BATCHED
        item.batch_id = batch.id
    await db.flush()
    await audit_log(
        db,
        actor=actor,
        action="settlement_batch.create",
        entity_type="settlement_batch",
        entity_id=batch.id,
        after={
            "batch_number": batch.batch_number,
            "payee_type": ptype.value,
            "payee_id": str(payee_id) if payee_id else None,
            "items_count": batch.items_count,
            "total_net_minor": batch.total_net_minor,
            "payout_accounts": snapshot,
        },
        request=request,
    )
    await publish(
        db,
        "settlement_batch.pending_approval",
        {
            "batch_id": str(batch.id),
            "batch_number": batch.batch_number,
            "payee_type": ptype.value,
            "created_by": str(batch.created_by) if batch.created_by else None,
        },
    )
    return batch


async def ledger_next_batch_number(db: AsyncSession) -> str:
    from app.models.sequences import next_number

    return await next_number(db, "batch")


async def auto_batch(db: AsyncSession, *, now: datetime | None = None) -> list[uuid.UUID]:
    """Daily: one batch per payee with eligible items whose settlement cycle is due. System-created batches
    (``created_by`` NULL) are generated ``pending_approval`` like manual ones: they are never auto-approved or
    processed, and :func:`approve_batch` needs an authenticated finance user (backlog #26)."""
    now = now or _now()
    default_cycle = int(await get_setting(db, "settlement_cycle_days"))
    payees = (
        await db.execute(
            select(SettlementItem.payee_type, SettlementItem.payee_id)
            .where(
                SettlementItem.status == SettlementItemStatus.ELIGIBLE,
                or_(SettlementItem.eligible_at.is_(None), SettlementItem.eligible_at <= now),
            )
            .group_by(SettlementItem.payee_type, SettlementItem.payee_id)
            .having(func.sum(SettlementItem.net_minor) > 0)
        )
    ).all()
    created: list[uuid.UUID] = []
    for payee_type, payee_id in payees:
        cycle = default_cycle
        if _v(payee_type) == PayeeType.HOSPITAL.value:
            own = (
                await db.execute(select(Hospital.settlement_cycle_days).where(Hospital.id == payee_id))
            ).scalar_one_or_none()
            cycle = int(own or default_cycle)
        last = (
            await db.execute(
                select(func.max(SettlementBatch.created_at)).where(
                    SettlementBatch.payee_type == payee_type,
                    SettlementBatch.payee_id == payee_id,
                    SettlementBatch.status != SettlementBatchStatus.CANCELLED,
                )
            )
        ).scalar_one_or_none()
        if last is not None and last + timedelta(days=cycle) > now:
            continue
        try:
            async with db.begin_nested():
                batch = await generate_batch(db, actor=None, payee_type=payee_type, payee_id=payee_id)
                created.append(batch.id)
        except BadRequest:
            continue
    return created


async def get_batch_locked(db: AsyncSession, batch_id: uuid.UUID) -> SettlementBatch:
    batch = (
        await db.execute(
            select(SettlementBatch)
            .where(SettlementBatch.id == batch_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if batch is None:
        raise NotFound("Settlement batch not found")
    return batch


async def approve_batch(
    db: AsyncSession,
    actor: User,
    batch_id: uuid.UUID,
    notes: str | None = None,
    request: Request | None = None,
) -> SettlementBatch:
    """Maker-checker: the approver must differ from the creator (403 ``maker_checker``)."""
    batch = await get_batch_locked(db, batch_id)
    if batch.status != SettlementBatchStatus.PENDING_APPROVAL:
        raise Conflict(f"Batch is {_v(batch.status)}, not pending approval", code="invalid_state")
    if batch.created_by is not None and batch.created_by == actor.id:
        raise Forbidden("The user who generated a batch cannot approve it", code="maker_checker")
    batch.status = SettlementBatchStatus.APPROVED
    batch.approved_by = actor.id
    batch.approved_at = _now()
    if notes:
        batch.notes = f"{batch.notes}\n{notes}" if batch.notes else notes
    await db.flush()
    await audit_log(
        db,
        actor=actor,
        action="settlement_batch.approve",
        entity_type="settlement_batch",
        entity_id=batch.id,
        before={"status": "pending_approval"},
        after={"status": "approved", "total_net_minor": batch.total_net_minor},
        request=request,
    )
    return batch


async def reject_batch(
    db: AsyncSession, actor: User, batch_id: uuid.UUID, reason: str, request: Request | None = None
) -> SettlementBatch:
    """Cancel a batch that has not started processing; its items return to ``eligible``."""
    batch = await get_batch_locked(db, batch_id)
    if batch.status not in (SettlementBatchStatus.PENDING_APPROVAL, SettlementBatchStatus.APPROVED):
        raise Conflict(f"A {_v(batch.status)} batch cannot be rejected", code="invalid_state")
    before = _v(batch.status)
    items = (
        (
            await db.execute(
                select(SettlementItem)
                .where(
                    SettlementItem.batch_id == batch.id, SettlementItem.status == SettlementItemStatus.BATCHED
                )
                .with_for_update()
            )
        )
        .scalars()
        .all()
    )
    for item in items:
        item.status = SettlementItemStatus.ELIGIBLE
        item.batch_id = None
    batch.status = SettlementBatchStatus.CANCELLED
    batch.notes = f"{batch.notes}\nRejected: {reason}" if batch.notes else f"Rejected: {reason}"
    await db.flush()
    await audit_log(
        db,
        actor=actor,
        action="settlement_batch.reject",
        entity_type="settlement_batch",
        entity_id=batch.id,
        before={"status": before},
        after={"status": "cancelled", "reason": reason, "items_released": len(items)},
        request=request,
    )
    return batch


def account_fingerprint(account: PayoutAccount | None) -> str | None:
    """Hash of everything that decides where money goes (id, holder, number, IFSC/SWIFT, Route account)."""
    if account is None:
        return None
    raw = "|".join(
        [
            str(account.id),
            account.account_holder_name or "",
            account.account_number or "",
            account.ifsc or "",
            account.swift or "",
            account.razorpay_linked_account_id or "",
        ]
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def account_snapshot(account: PayoutAccount | None) -> dict[str, Any] | None:
    """Masked destination details frozen into a batch (shown to the approver)."""
    if account is None:
        return None
    return {
        "payout_account_id": str(account.id),
        "fingerprint": account_fingerprint(account),
        "account_holder_name": account.account_holder_name,
        "account_number_masked": mask("0" * 8 + account.account_number_last4, keep=4),
        "ifsc": account.ifsc,
        "swift": account.swift,
        "bank_name": account.bank_name,
        "razorpay_linked_account_id": account.razorpay_linked_account_id,
    }


def _account_changed(batch: SettlementBatch, payee_id: uuid.UUID, account: PayoutAccount | None) -> bool:
    snapshot = batch.payout_accounts_snapshot
    if snapshot is None or str(payee_id) not in snapshot:
        return True
    frozen = snapshot[str(payee_id)]
    return (frozen or {}).get("fingerprint") != account_fingerprint(account)


async def primary_payout_account(
    db: AsyncSession, payee_type: PayeeType | str, payee_id: uuid.UUID
) -> PayoutAccount | None:
    """The payee's primary verified active account (falls back to the newest verified active one)."""
    return (
        (
            await db.execute(
                select(PayoutAccount)
                .where(
                    PayoutAccount.owner_type == PayeeType(_v(payee_type)),
                    PayoutAccount.owner_id == payee_id,
                    PayoutAccount.is_verified.is_(True),
                    PayoutAccount.status == PayoutAccountStatus.ACTIVE,
                )
                .order_by(PayoutAccount.is_primary.desc(), PayoutAccount.updated_at.desc(), PayoutAccount.id)
                .limit(1)
            )
        )
        .scalars()
        .first()
    )


async def process_batch(
    db: AsyncSession,
    actor: User,
    batch_id: uuid.UUID,
    method: PayoutMethod | None = None,
    request: Request | None = None,
) -> SettlementBatch:
    """Create one payout per payee and hand it to the provider (mock/manual inline, Razorpay via a job)."""
    if method is PayoutMethod.RAZORPAYX:
        raise BadRequest("RazorpayX payouts are not supported; use razorpay_route", code="unsupported_method")
    if method is PayoutMethod.MOCK and settings.is_production:
        raise BadRequest("Mock payouts are disabled in production", code="unsupported_method")
    batch = await get_batch_locked(db, batch_id)
    if batch.status != SettlementBatchStatus.APPROVED:
        raise Conflict(
            f"Batch is {_v(batch.status)}; only approved batches can be processed", code="invalid_state"
        )
    if batch.approved_by is None:
        raise Conflict("Batch has not been approved", code="invalid_state")
    if batch.created_by is None and batch.approved_by == actor.id:
        # SEC-003: a system batch has no maker, so its approver may not also release the money.
        raise Forbidden(
            "The approver of a system-generated batch cannot also process it", code="maker_checker"
        )
    items = (
        (
            await db.execute(
                select(SettlementItem)
                .where(
                    SettlementItem.batch_id == batch.id, SettlementItem.status == SettlementItemStatus.BATCHED
                )
                .order_by(SettlementItem.payee_id, SettlementItem.id)
                .with_for_update()
            )
        )
        .scalars()
        .all()
    )
    batch.status = SettlementBatchStatus.PROCESSING
    grouped: dict[tuple[PayeeType, uuid.UUID], int] = defaultdict(int)
    for item in items:
        grouped[(PayeeType(_v(item.payee_type)), item.payee_id)] += int(item.net_minor)
    created: list[Payout] = []
    for (ptype, pid), amount in sorted(grouped.items(), key=lambda kv: str(kv[0][1])):
        account = await primary_payout_account(db, ptype, pid)
        chosen = method or default_method(account)
        provider = get_provider(chosen)
        payout = Payout(
            batch_id=batch.id,
            payee_type=ptype,
            payee_id=pid,
            payout_account_id=account.id if account else None,
            account_fingerprint=account_fingerprint(account),
            amount_minor=max(amount, 0),
            currency="INR",
            method=chosen,
            status=PayoutStatus.QUEUED,
        )
        db.add(payout)
        await db.flush()
        created.append(payout)
        if amount <= 0:
            await _fail_payout(db, payout, "payee balance in this batch is not positive")
        elif _account_changed(batch, pid, account):
            await _fail_payout(db, payout, ACCOUNT_CHANGED_REASON)
        elif provider.requires_account and account is None:
            await _fail_payout(db, payout, "no verified payout account for this payee")
        elif provider.runs_inline:
            await apply_payout_result(db, payout, await provider.execute(payout, account))
        else:
            payout.status = PayoutStatus.PROCESSING
            await db.flush()
            await enqueue(
                db,
                "settlements.execute_payout",
                {"payout_id": str(payout.id)},
                dedupe_key=f"payout:{payout.id}",
                max_attempts=8,
            )
    await refresh_batch_status(db, batch)
    await audit_log(
        db,
        actor=actor,
        action="settlement_batch.process",
        entity_type="settlement_batch",
        entity_id=batch.id,
        before={"status": "approved"},
        after={
            "status": _v(batch.status),
            "payouts": [{"id": str(p.id), "method": _v(p.method), "status": _v(p.status)} for p in created],
        },
        request=request,
    )
    return batch


async def refresh_batch_status(db: AsyncSession, batch: SettlementBatch) -> None:
    if batch.status not in (
        SettlementBatchStatus.PROCESSING,
        SettlementBatchStatus.COMPLETED,
        SettlementBatchStatus.PARTIALLY_FAILED,
    ):
        return
    statuses = [
        PayoutStatus(_v(s))
        for (s,) in (await db.execute(select(Payout.status).where(Payout.batch_id == batch.id))).all()
    ]
    if not statuses or any(s in IN_FLIGHT_PAYOUT for s in statuses):
        batch.status = SettlementBatchStatus.PROCESSING
        batch.processed_at = None
    else:
        batch.status = (
            SettlementBatchStatus.COMPLETED
            if all(s is PayoutStatus.PROCESSED for s in statuses)
            else SettlementBatchStatus.PARTIALLY_FAILED
        )
        batch.processed_at = batch.processed_at or _now()
    await db.flush()


# ================================================================================================ payouts
async def _payout_items(
    db: AsyncSession, payout: Payout, statuses: Sequence[SettlementItemStatus]
) -> list[SettlementItem]:
    return list(
        (
            await db.execute(
                select(SettlementItem)
                .where(
                    SettlementItem.batch_id == payout.batch_id,
                    SettlementItem.payee_type == payout.payee_type,
                    SettlementItem.payee_id == payout.payee_id,
                    SettlementItem.status.in_(list(statuses)),
                )
                .with_for_update()
            )
        )
        .scalars()
        .all()
    )


def _payout_payload(payout: Payout) -> dict[str, Any]:
    return {
        "payout_id": str(payout.id),
        "batch_id": str(payout.batch_id),
        "payee_type": _v(payout.payee_type),
        "payee_id": str(payout.payee_id),
        "amount_minor": int(payout.amount_minor),
        "currency": payout.currency,
        "status": _v(payout.status),
    }


async def _complete_payout(
    db: AsyncSession, payout: Payout, *, gateway_payout_id: str | None = None, utr: str | None = None
) -> None:
    payout.status = PayoutStatus.PROCESSED
    payout.processed_at = _now()
    payout.failure_reason = None
    if gateway_payout_id:
        payout.gateway_payout_id = gateway_payout_id
    if utr:
        payout.utr = utr
    for item in await _payout_items(db, payout, [SettlementItemStatus.BATCHED]):
        item.status = SettlementItemStatus.PAID
    await db.flush()
    await settlement_documents.issue_payout_documents(db, payout)
    await publish(db, "payout.processed", _payout_payload(payout))


async def _fail_payout(db: AsyncSession, payout: Payout, reason: str) -> None:
    """Failed (or bounced after success -> ``reversed``): items go back to ``eligible`` for the next batch."""
    was_processed = payout.status == PayoutStatus.PROCESSED
    payout.status = PayoutStatus.REVERSED if was_processed else PayoutStatus.FAILED
    payout.failure_reason = reason[:1000]
    statuses = [SettlementItemStatus.PAID] if was_processed else [SettlementItemStatus.BATCHED]
    for item in await _payout_items(db, payout, statuses):
        item.status = SettlementItemStatus.ELIGIBLE
    await db.flush()
    await publish(db, "payout.failed", {**_payout_payload(payout), "reason": payout.failure_reason})


async def apply_payout_result(db: AsyncSession, payout: Payout, result: PayoutResult) -> None:
    if result.status is PayoutStatus.PROCESSED:
        await _complete_payout(db, payout, gateway_payout_id=result.gateway_payout_id)
    elif result.status is PayoutStatus.FAILED:
        if result.gateway_payout_id:
            payout.gateway_payout_id = result.gateway_payout_id
        await _fail_payout(db, payout, result.failure_reason or "payout failed")
    else:
        payout.status = PayoutStatus.PROCESSING
        if result.gateway_payout_id:
            payout.gateway_payout_id = result.gateway_payout_id
        await db.flush()


async def get_payout_locked(db: AsyncSession, payout_id: uuid.UUID) -> Payout:
    payout = (
        await db.execute(
            select(Payout)
            .where(Payout.id == payout_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if payout is None:
        raise NotFound("Payout not found")
    return payout


async def _refresh_payout_batch(db: AsyncSession, payout: Payout) -> None:
    batch = await get_batch_locked(db, payout.batch_id)
    await refresh_batch_status(db, batch)


async def execute_payout(db: AsyncSession, payout_id: uuid.UUID) -> None:
    """Job body for ``settlements.execute_payout`` (external provider call)."""
    try:
        payout = await get_payout_locked(db, payout_id)
    except NotFound:
        logger.warning("payout.execute.missing", payout_id=str(payout_id))
        return
    if payout.status not in (PayoutStatus.QUEUED, PayoutStatus.PROCESSING):
        return  # done, failed, or parked for reconciliation: never re-sent automatically
    if payout.gateway_payout_id:
        await _complete_payout(db, payout)
        await _refresh_payout_batch(db, payout)
        return
    account = await db.get(PayoutAccount, payout.payout_account_id) if payout.payout_account_id else None
    provider = get_provider(payout.method)
    if provider.requires_account and (
        account is None
        or not account.is_verified
        or _v(account.status) != PayoutAccountStatus.ACTIVE.value
        or account_fingerprint(account) != payout.account_fingerprint
    ):
        await _fail_payout(db, payout, "payout account changed or is no longer verified and active")
        await _refresh_payout_batch(db, payout)
        return
    if payout.gateway_attempted_at is not None:
        # A previous attempt may have reached the provider (crash, timeout, stale lock): never re-send.
        await _park_payout(db, payout, "a previous provider call has no recorded outcome")
        await _refresh_payout_batch(db, payout)
        return
    # SEC-004: commit the attempt marker before calling out, so a crash mid-call cannot lead to a re-send.
    payout.gateway_attempted_at = _now()
    await db.commit()
    payout = await get_payout_locked(db, payout_id)
    try:
        result = await provider.execute(payout, account)
    except PayoutTransientError:
        # The request provably never created a transfer: clear the marker and let the job retry.
        logger.warning("payout.execute.transient", payout_id=str(payout.id))
        payout.gateway_attempted_at = None
        await db.commit()
        raise
    except PayoutOutcomeUnknown as exc:
        await _park_payout(db, payout, str(exc))
        await _refresh_payout_batch(db, payout)
        return
    await apply_payout_result(db, payout, result)
    await _refresh_payout_batch(db, payout)


async def _park_payout(db: AsyncSession, payout: Payout, reason: str) -> None:
    """``needs_reconciliation``: finance checks the provider dashboard, then records the transfer with
    mark-paid (+ approve) or fails it with a second approver (``mark-failed`` + ``mark-failed/approve``)."""
    payout.status = PayoutStatus.NEEDS_RECONCILIATION
    payout.failure_reason = f"needs reconciliation: {reason}"[:1000]
    await db.flush()
    logger.warning("payout.needs_reconciliation", payout_id=str(payout.id), reason=reason)


async def mark_payout_paid(
    db: AsyncSession, actor: User, payout_id: uuid.UUID, utr: str, request: Request | None = None
) -> Payout:
    """Maker step of the manual mark-paid (backlog #26, same pattern as bank-transfer orders): records the UTR
    and the requesting finance user; the payout stays ``processing`` until a *different* finance user calls
    :func:`approve_payout_paid`. A new request replaces a pending one."""
    payout = await get_payout_locked(db, payout_id)
    if payout.status not in IN_FLIGHT_PAYOUT:
        raise Conflict(f"Payout is {_v(payout.status)}", code="invalid_state")
    previous = (
        {"utr": payout.utr, "requested_by": str(payout.paid_requested_by)}
        if payout.paid_requested_by
        else None
    )
    payout.utr = utr
    payout.paid_requested_by = actor.id
    payout.paid_requested_at = _now()
    payout.paid_confirmed_by = None
    payout.paid_request_id = uuid7()  # SEC-063: a replaced request invalidates approvals of the old one
    await db.flush()
    await audit_log(
        db,
        actor=actor,
        action="payout.mark_paid_request",
        entity_type="payout",
        entity_id=payout.id,
        before=previous,
        after={"status": _v(payout.status), "utr": utr, "amount_minor": payout.amount_minor},
        request=request,
    )
    return payout


def _pending_mark_paid(payout: Payout) -> None:
    if payout.status not in IN_FLIGHT_PAYOUT:
        raise Conflict(f"Payout is {_v(payout.status)}", code="invalid_state")
    if payout.paid_requested_by is None:
        raise BadRequest("There is no pending mark-paid request for this payout", code="no_pending_request")


async def approve_payout_paid(
    db: AsyncSession,
    actor: User,
    payout_id: uuid.UUID,
    request: Request | None = None,
    *,
    request_id: uuid.UUID,
    reference: str,
    amount_minor: int,
) -> Payout:
    """Checker step: a finance user other than the requester completes the payout with the recorded UTR
    (``processed``, items paid, ``payout.processed`` published). The requester gets 403
    ``second_approver_required``. SEC-063: ``request_id``/``reference``/``amount_minor`` must match the
    pending request the checker reviewed, else 409 ``mark_paid_request_changed``."""
    payout = await get_payout_locked(db, payout_id)
    _pending_mark_paid(payout)
    if payout.paid_requested_by == actor.id:
        raise Forbidden(
            "A manual payout must be confirmed by a second finance user", code="second_approver_required"
        )
    if (
        payout.paid_request_id != request_id
        or (payout.utr or "") != reference
        or int(payout.amount_minor) != amount_minor
    ):
        raise Conflict(
            "The pending mark-paid request changed since it was reviewed; review it again",
            code="mark_paid_request_changed",
        )
    before = _v(payout.status)
    payout.paid_confirmed_by = actor.id
    await _complete_payout(db, payout, utr=payout.utr)
    await _refresh_payout_batch(db, payout)
    await audit_log(
        db,
        actor=actor,
        action="payout.mark_paid",
        entity_type="payout",
        entity_id=payout.id,
        before={"status": before, "requested_by": str(payout.paid_requested_by)},
        after={"status": "processed", "utr": payout.utr, "amount_minor": payout.amount_minor},
        request=request,
    )
    return payout


async def reject_payout_paid(
    db: AsyncSession, actor: User, payout_id: uuid.UUID, reason: str | None, request: Request | None = None
) -> Payout:
    """Reject (or, for the requester, withdraw) a pending mark-paid request; the payout stays in flight."""
    payout = await get_payout_locked(db, payout_id)
    _pending_mark_paid(payout)
    before = {"utr": payout.utr, "requested_by": str(payout.paid_requested_by)}
    payout.utr = None
    payout.paid_requested_by = None
    payout.paid_requested_at = None
    payout.paid_request_id = None
    await db.flush()
    await audit_log(
        db,
        actor=actor,
        action="payout.mark_paid_reject",
        entity_type="payout",
        entity_id=payout.id,
        before=before,
        after={"status": _v(payout.status), "reason": reason},
        request=request,
    )
    return payout


async def mark_payout_failed(
    db: AsyncSession,
    actor: User,
    payout_id: uuid.UUID,
    reason: str,
    request: Request | None = None,
    reference: str | None = None,
) -> Payout:
    """A queued/processing payout (no money sent) fails immediately. A ``processed`` (bounced) or
    ``needs_reconciliation`` payout may already have paid the payee, so failing it only records a request
    (with a bank/gateway ``reference``) that a different finance user approves (SEC-003)."""
    payout = await get_payout_locked(db, payout_id)
    if payout.status not in (*IN_FLIGHT_PAYOUT, PayoutStatus.PROCESSED):
        raise Conflict(f"Payout is {_v(payout.status)}", code="invalid_state")
    before = _v(payout.status)
    if payout.status in DUAL_CONTROL_FAILURE:
        if not reference:
            raise BadRequest(
                "A bank or gateway reference is required to reverse this payout", code="reference_required"
            )
        payout.reversal_requested_by = actor.id
        payout.reversal_requested_at = _now()
        payout.reversal_reason = reason
        payout.reversal_reference = reference
        payout.reversal_request_id = uuid7()  # SEC-063
        await db.flush()
        await audit_log(
            db,
            actor=actor,
            action="payout.reversal_request",
            entity_type="payout",
            entity_id=payout.id,
            before={"status": before},
            after={"status": before, "reason": reason, "reference": reference},
            request=request,
        )
        return payout
    await _fail_payout(db, payout, reason)
    await _refresh_payout_batch(db, payout)
    await audit_log(
        db,
        actor=actor,
        action="payout.mark_failed",
        entity_type="payout",
        entity_id=payout.id,
        before={"status": before},
        after={"status": _v(payout.status), "reason": reason},
        request=request,
    )
    return payout


def _pending_reversal(payout: Payout) -> None:
    if payout.status not in DUAL_CONTROL_FAILURE:
        raise Conflict(f"Payout is {_v(payout.status)}", code="invalid_state")
    if payout.reversal_requested_by is None:
        raise BadRequest("There is no pending failure request for this payout", code="no_pending_request")


async def approve_payout_failure(
    db: AsyncSession,
    actor: User,
    payout_id: uuid.UUID,
    request: Request | None = None,
    *,
    request_id: uuid.UUID,
    reference: str,
) -> Payout:
    """Checker step: a different finance user fails/reverses the payout; items return to ``eligible`` and a
    processed payout's ledger posting is reversed. SEC-063: ``request_id``/``reference`` must match the
    pending request (409 ``mark_failed_request_changed``)."""
    payout = await get_payout_locked(db, payout_id)
    _pending_reversal(payout)
    if payout.reversal_requested_by == actor.id:
        raise Forbidden(
            "A payout reversal must be approved by a second finance user", code="second_approver_required"
        )
    if payout.reversal_request_id != request_id or (payout.reversal_reference or "") != reference:
        raise Conflict(
            "The pending failure request changed since it was reviewed; review it again",
            code="mark_failed_request_changed",
        )
    before = _v(payout.status)
    reason = f"{payout.reversal_reason} [ref {payout.reversal_reference}]"
    await _fail_payout(db, payout, reason)
    await _refresh_payout_batch(db, payout)
    await audit_log(
        db,
        actor=actor,
        action="payout.mark_failed",
        entity_type="payout",
        entity_id=payout.id,
        before={"status": before, "requested_by": str(payout.reversal_requested_by)},
        after={"status": _v(payout.status), "reason": reason},
        request=request,
    )
    return payout


async def reject_payout_failure(
    db: AsyncSession, actor: User, payout_id: uuid.UUID, reason: str | None, request: Request | None = None
) -> Payout:
    payout = await get_payout_locked(db, payout_id)
    _pending_reversal(payout)
    before = {"reason": payout.reversal_reason, "reference": payout.reversal_reference}
    payout.reversal_requested_by = None
    payout.reversal_requested_at = None
    payout.reversal_reason = None
    payout.reversal_reference = None
    payout.reversal_request_id = None
    await db.flush()
    await audit_log(
        db,
        actor=actor,
        action="payout.reversal_reject",
        entity_type="payout",
        entity_id=payout.id,
        before=before,
        after={"status": _v(payout.status), "reason": reason},
        request=request,
    )
    return payout


# ================================================================================================ accounts
async def _unset_other_primaries(db: AsyncSession, account: PayoutAccount) -> None:
    others = (
        (
            await db.execute(
                select(PayoutAccount)
                .where(
                    PayoutAccount.owner_type == account.owner_type,
                    PayoutAccount.owner_id == account.owner_id,
                    PayoutAccount.id != account.id,
                    PayoutAccount.is_primary.is_(True),
                )
                .with_for_update()
            )
        )
        .scalars()
        .all()
    )
    for other in others:
        other.is_primary = False


def _account_audit(account: PayoutAccount) -> dict[str, Any]:
    return {
        "owner_type": _v(account.owner_type),
        "owner_id": str(account.owner_id),
        "account_holder_name": account.account_holder_name,
        "account_last4": account.account_number_last4,
        "ifsc": account.ifsc,
        "swift": account.swift,
        "bank_name": account.bank_name,
        "razorpay_linked_account_id": account.razorpay_linked_account_id,
        "is_verified": account.is_verified,
        "is_primary": account.is_primary,
        "status": _v(account.status),
        "submitted_by": str(account.submitted_by) if account.submitted_by else None,
        "verified_by": str(account.verified_by) if account.verified_by else None,
    }


async def create_payout_account(
    db: AsyncSession,
    actor: User,
    own_payee: Payee | None,
    body: PayoutAccountCreate,
    request: Request | None = None,
) -> PayoutAccount:
    """``own_payee`` is None for finance users (who must name the owner in the body)."""
    if own_payee is None:
        if body.owner_type is None or body.owner_id is None:
            raise BadRequest("owner_type and owner_id are required", code="owner_required")
        owner_type, owner_id = body.owner_type, body.owner_id
        if not await _payee_exists(db, owner_type, owner_id):
            raise BadRequest("Unknown payee", code="invalid_reference")
    else:
        if body.owner_type is not None and (body.owner_type, body.owner_id) != (
            own_payee.payee_type,
            own_payee.payee_id,
        ):
            raise Forbidden("You can only add payout accounts for yourself")
        if body.razorpay_linked_account_id:
            raise Forbidden("Only finance can set a Razorpay linked account", code="finance_only_field")
        owner_type, owner_id = own_payee.payee_type, own_payee.payee_id
    has_primary = (
        await db.execute(
            select(func.count())
            .select_from(PayoutAccount)
            .where(
                PayoutAccount.owner_type == owner_type,
                PayoutAccount.owner_id == owner_id,
                PayoutAccount.is_primary.is_(True),
                PayoutAccount.status == PayoutAccountStatus.ACTIVE,
            )
        )
    ).scalar_one()
    account = PayoutAccount(
        owner_type=owner_type,
        owner_id=owner_id,
        account_holder_name=body.account_holder_name,
        account_number=body.account_number,
        account_number_last4=body.account_number[-4:],
        ifsc=body.ifsc,
        bank_name=body.bank_name,
        swift=body.swift,
        razorpay_linked_account_id=body.razorpay_linked_account_id,
        is_verified=False,
        is_primary=bool(body.is_primary or not has_primary),
        status=PayoutAccountStatus.ACTIVE,
        submitted_by=actor.id,
    )
    db.add(account)
    await db.flush()
    if account.is_primary:
        await _unset_other_primaries(db, account)
        await db.flush()
    await audit_log(
        db,
        actor=actor,
        action="payout_account.create",
        entity_type="payout_account",
        entity_id=account.id,
        after=_account_audit(account),
        request=request,
    )
    return account


async def get_payout_account(
    db: AsyncSession, account_id: uuid.UUID, own_payee: Payee | None, *, lock: bool = False
) -> PayoutAccount:
    stmt = select(PayoutAccount).where(PayoutAccount.id == account_id)
    if own_payee is not None:
        stmt = stmt.where(
            PayoutAccount.owner_type == own_payee.payee_type, PayoutAccount.owner_id == own_payee.payee_id
        )
    if lock:
        stmt = stmt.with_for_update().execution_options(populate_existing=True)
    account = (await db.execute(stmt)).scalar_one_or_none()
    if account is None:
        raise NotFound("Payout account not found")
    return account


_REVERIFY_FIELDS = frozenset(
    {"account_holder_name", "account_number", "ifsc", "swift", "razorpay_linked_account_id"}
)


async def update_payout_account(
    db: AsyncSession,
    actor: User,
    own_payee: Payee | None,
    account_id: uuid.UUID,
    body: PayoutAccountPatch,
    request: Request | None = None,
) -> PayoutAccount:
    account = await get_payout_account(db, account_id, own_payee, lock=True)
    changes = body.model_dump(exclude_unset=True)
    if own_payee is not None and "razorpay_linked_account_id" in changes:
        raise Forbidden("Only finance can set a Razorpay linked account", code="finance_only_field")
    for key in ("account_holder_name", "account_number", "is_primary", "status"):
        if key in changes and changes[key] is None:
            raise BadRequest(f"{key} cannot be null", code="invalid_value")
    before = _account_audit(account)
    reverify = False
    for key, value in changes.items():
        if key == "account_number":
            if value != account.account_number:
                account.account_number = value
                account.account_number_last4 = value[-4:]
                reverify = True
            continue
        if key in {"is_primary", "status"}:
            continue
        if getattr(account, key) != value:
            setattr(account, key, value)
            reverify = reverify or key in _REVERIFY_FIELDS
    if not (account.ifsc or account.swift):
        raise BadRequest("either ifsc or swift is required", code="invalid_value")
    if "status" in changes:
        new_status = PayoutAccountStatus(changes["status"])
        if (
            new_status == PayoutAccountStatus.ACTIVE
            and _v(account.status) != PayoutAccountStatus.ACTIVE.value
        ):
            reverify = True  # SEC-023: re-activating a disabled account always needs a fresh verification
        account.status = new_status
        if account.status == PayoutAccountStatus.DISABLED:
            account.is_primary = False
    if reverify:
        # SEC-003: new destination details are a new submission that someone else must verify.
        account.is_verified = False
        account.verified_by = None
        account.verified_at = None
        account.submitted_by = actor.id
    if changes.get("is_primary") is True:
        if account.status != PayoutAccountStatus.ACTIVE:
            raise BadRequest("A disabled account cannot be primary", code="invalid_value")
        account.is_primary = True
        await _unset_other_primaries(db, account)
    elif changes.get("is_primary") is False:
        account.is_primary = False
    await db.flush()
    await audit_log(
        db,
        actor=actor,
        action="payout_account.update",
        entity_type="payout_account",
        entity_id=account.id,
        before=before,
        after=_account_audit(account),
        request=request,
    )
    return account


async def verify_payout_account(
    db: AsyncSession, actor: User, account_id: uuid.UUID, request: Request | None = None
) -> PayoutAccount:
    account = await get_payout_account(db, account_id, None, lock=True)
    if account.status != PayoutAccountStatus.ACTIVE:
        raise Conflict("A disabled account cannot be verified", code="invalid_state")
    if account.submitted_by is not None and account.submitted_by == actor.id:
        raise Forbidden("The user who submitted these bank details cannot verify them", code="maker_checker")
    account.is_verified = True
    account.verified_by = actor.id
    account.verified_at = _now()
    await db.flush()
    await audit_log(
        db,
        actor=actor,
        action="payout_account.verify",
        entity_type="payout_account",
        entity_id=account.id,
        before={"is_verified": False},
        after={"is_verified": True},
        request=request,
    )
    return account


# ================================================================================================ summaries
def awaiting_confirmation_clause() -> Any:
    """Payouts whose UTR was recorded and that wait for the second finance user (``mark-paid/approve``)."""
    return and_(Payout.paid_requested_by.is_not(None), Payout.status.in_(IN_FLIGHT_PAYOUT))


async def staff_summary(db: AsyncSession) -> StaffSummaryOut:
    by_status = dict(
        (
            await db.execute(
                select(SettlementItem.status, func.coalesce(func.sum(SettlementItem.net_minor), 0)).group_by(
                    SettlementItem.status
                )
            )
        ).all()
    )
    sums = {_v(k): int(v) for k, v in by_status.items()}
    gmv = (
        await db.execute(
            select(func.coalesce(func.sum(Payment.base_amount_minor), 0)).where(
                Payment.status.in_(CAPTURED_STATUSES)
            )
        )
    ).scalar_one()
    pending_batches = (
        await db.execute(
            select(func.count())
            .select_from(SettlementBatch)
            .where(SettlementBatch.status == SettlementBatchStatus.PENDING_APPROVAL)
        )
    ).scalar_one()
    in_flight = (
        await db.execute(select(func.count()).select_from(Payout).where(Payout.status.in_(IN_FLIGHT_PAYOUT)))
    ).scalar_one()
    awaiting_confirmation = (
        await db.execute(select(func.count()).select_from(Payout).where(awaiting_confirmation_clause()))
    ).scalar_one()
    needs_reconciliation = (
        await db.execute(
            select(func.count()).select_from(Payout).where(Payout.status == PayoutStatus.NEEDS_RECONCILIATION)
        )
    ).scalar_one()
    reversals_pending = (
        await db.execute(
            select(func.count())
            .select_from(Payout)
            .where(Payout.reversal_requested_by.is_not(None), Payout.status.in_(DUAL_CONTROL_FAILURE))
        )
    ).scalar_one()
    return StaffSummaryOut(
        escrow_minor=await ledger.get_balance(db, ledger.ESCROW),
        gateway_receivable_minor=await ledger.sum_balances_by_prefix(db, "GATEWAY:"),
        bank_minor=await ledger.get_balance(db, ledger.BANK),
        commission_revenue_minor=await ledger.get_balance(db, ledger.COMMISSION_REVENUE),
        service_fee_revenue_minor=await ledger.get_balance(db, ledger.SERVICE_FEE_REVENUE),
        gst_payable_minor=await ledger.get_balance(db, ledger.GST_OUTPUT),
        tds_payable_minor=await ledger.get_balance(db, ledger.TDS_194O),
        gateway_fees_minor=await ledger.get_balance(db, ledger.GATEWAY_FEES),
        agent_commission_expense_minor=await ledger.get_balance(db, ledger.AGENT_COMMISSION_EXPENSE),
        hospital_payables_minor=await ledger.sum_balances_by_prefix(db, "HOSPITAL:"),
        agent_payables_minor=await ledger.sum_balances_by_prefix(db, "AGENT:"),
        pending_settlement_minor=sum(sums.get(s.value, 0) for s in UNPAID_STATUSES),
        eligible_settlement_minor=sums.get(SettlementItemStatus.ELIGIBLE.value, 0),
        on_hold_settlement_minor=sums.get(SettlementItemStatus.ON_HOLD.value, 0),
        batches_pending_approval=int(pending_batches),
        payouts_in_progress=int(in_flight),
        payouts_awaiting_confirmation=int(awaiting_confirmation),
        payouts_needs_reconciliation=int(needs_reconciliation),
        payout_reversals_pending=int(reversals_pending),
        gmv_minor=int(gmv or 0),
    )


async def _cycle_days(db: AsyncSession, payee: Payee) -> int:
    default_cycle = int(await get_setting(db, "settlement_cycle_days"))
    if payee.payee_type is PayeeType.HOSPITAL:
        own = (
            await db.execute(select(Hospital.settlement_cycle_days).where(Hospital.id == payee.payee_id))
        ).scalar_one_or_none()
        return int(own or default_cycle)
    return default_cycle


async def payee_summary(db: AsyncSession, payee: Payee) -> PayeeSummaryOut:
    rows = (
        await db.execute(
            select(SettlementItem.status, func.coalesce(func.sum(SettlementItem.net_minor), 0))
            .where(SettlementItem.payee_type == payee.payee_type, SettlementItem.payee_id == payee.payee_id)
            .group_by(SettlementItem.status)
        )
    ).all()
    sums = {_v(status): int(total) for status, total in rows}
    last = (
        (
            await db.execute(
                select(Payout)
                .where(
                    Payout.payee_type == payee.payee_type,
                    Payout.payee_id == payee.payee_id,
                    Payout.status == PayoutStatus.PROCESSED,
                )
                .order_by(Payout.processed_at.desc().nulls_last(), Payout.id.desc())
                .limit(1)
            )
        )
        .scalars()
        .first()
    )
    cycle = await _cycle_days(db, payee)
    pending = sums.get("pending", 0)
    eligible = sums.get("eligible", 0)
    batched = sums.get("batched", 0)
    next_date: date | None = None
    today = _today()
    if pending + eligible + batched > 0:
        base = (last.processed_at.date() + timedelta(days=cycle)) if last and last.processed_at else today
        if eligible + batched > 0:
            next_date = max(base, today)
        else:
            earliest = (
                await db.execute(
                    select(func.min(SettlementItem.eligible_at)).where(
                        SettlementItem.payee_type == payee.payee_type,
                        SettlementItem.payee_id == payee.payee_id,
                        SettlementItem.status == SettlementItemStatus.PENDING,
                    )
                )
            ).scalar_one_or_none()
            next_date = max(base, earliest.date() if earliest else today, today)
    names = await payee_names(db, [(payee.payee_type.value, payee.payee_id)])
    return PayeeSummaryOut(
        payee_type=payee.payee_type,
        payee_id=payee.payee_id,
        payee_name=names.get((payee.payee_type.value, payee.payee_id)),
        pending_minor=pending,
        eligible_minor=eligible,
        on_hold_minor=sums.get("on_hold", 0),
        batched_minor=batched,
        paid_minor=sums.get("paid", 0),
        last_payout=(await serialize_payouts(db, [last]))[0] if last else None,
        next_payout_date=next_date,
        settlement_cycle_days=cycle,
    )


# ================================================================================================ statements
async def build_statement(db: AsyncSession, payee: Payee, from_date: date, to_date: date) -> StatementOut:
    """Earnings (items, by creation time) and processed payouts with a running balance."""
    if to_date < from_date:
        raise BadRequest("'to' must be on or after 'from'", code="invalid_range")
    if (to_date - from_date).days > 731:
        raise BadRequest("Statement period is limited to two years", code="invalid_range")
    start = datetime.combine(from_date, time.min, tzinfo=UTC)
    end = datetime.combine(to_date + timedelta(days=1), time.min, tzinfo=UTC)
    item_filter = (SettlementItem.payee_type == payee.payee_type, SettlementItem.payee_id == payee.payee_id)
    payout_filter = (
        Payout.payee_type == payee.payee_type,
        Payout.payee_id == payee.payee_id,
        Payout.status == PayoutStatus.PROCESSED,
    )
    earned_before = (
        await db.execute(
            select(func.coalesce(func.sum(SettlementItem.net_minor), 0)).where(
                *item_filter, SettlementItem.created_at < start
            )
        )
    ).scalar_one()
    paid_before = (
        await db.execute(
            select(func.coalesce(func.sum(Payout.amount_minor), 0)).where(
                *payout_filter, Payout.processed_at < start
            )
        )
    ).scalar_one()
    items = (
        (
            await db.execute(
                select(SettlementItem)
                .where(*item_filter, SettlementItem.created_at >= start, SettlementItem.created_at < end)
                .order_by(SettlementItem.created_at, SettlementItem.id)
            )
        )
        .scalars()
        .all()
    )
    payouts = (
        (
            await db.execute(
                select(Payout)
                .where(*payout_filter, Payout.processed_at >= start, Payout.processed_at < end)
                .order_by(Payout.processed_at, Payout.id)
            )
        )
        .scalars()
        .all()
    )
    numbers = await _booking_numbers(db, {i.booking_id for i in items})
    batch_numbers: dict[uuid.UUID, str] = {}
    if payouts:
        batch_numbers = dict(
            (
                await db.execute(
                    select(SettlementBatch.id, SettlementBatch.batch_number).where(
                        SettlementBatch.id.in_({p.batch_id for p in payouts})
                    )
                )
            ).all()
        )
    events: list[tuple[datetime, int, StatementRow]] = []
    for item in items:
        net = int(item.net_minor)
        number = numbers.get(item.booking_id)
        kind = "earning" if net >= 0 else "clawback"
        events.append(
            (
                item.created_at,
                0,
                StatementRow(
                    date=item.created_at,
                    kind=kind,
                    reference=number,
                    booking_id=item.booking_id,
                    booking_number=number,
                    description=(
                        f"{'Earnings' if net >= 0 else 'Refund clawback'} "
                        f"for booking {number or item.booking_id}"
                    ),
                    gross_minor=int(item.gross_minor),
                    commission_minor=int(item.commission_minor),
                    tax_minor=int(item.tax_minor),
                    tds_minor=int(item.tds_minor),
                    amount_minor=net,
                    status=_v(item.status),
                    balance_minor=0,
                ),
            )
        )
    for payout in payouts:
        if payout.processed_at is None:
            continue
        events.append(
            (
                payout.processed_at,
                1,
                StatementRow(
                    date=payout.processed_at,
                    kind="payout",
                    reference=payout.utr or payout.gateway_payout_id or batch_numbers.get(payout.batch_id),
                    description=(
                        f"Payout ({_v(payout.method)}) in batch {batch_numbers.get(payout.batch_id, '')}"
                    ),
                    gross_minor=0,
                    commission_minor=0,
                    tax_minor=0,
                    tds_minor=0,
                    amount_minor=-int(payout.amount_minor),
                    status=_v(payout.status),
                    balance_minor=0,
                ),
            )
        )
    events.sort(key=lambda e: (e[0], e[1]))
    opening = int(earned_before) - int(paid_before)
    balance = opening
    rows: list[StatementRow] = []
    earned = paid = 0
    for _, _, row in events:
        balance += row.amount_minor
        row.balance_minor = balance
        if row.kind == "payout":
            paid += -row.amount_minor
        else:
            earned += row.amount_minor
        rows.append(row)
    names = await payee_names(db, [(payee.payee_type.value, payee.payee_id)])
    return StatementOut(
        payee_type=payee.payee_type,
        payee_id=payee.payee_id,
        payee_name=names.get((payee.payee_type.value, payee.payee_id)),
        from_date=from_date,
        to_date=to_date,
        opening_balance_minor=opening,
        total_earned_minor=earned,
        total_paid_minor=paid,
        closing_balance_minor=balance,
        rows=rows,
    )


_CSV_FIELDS = (
    "date",
    "kind",
    "reference",
    "booking_number",
    "description",
    "gross_minor",
    "commission_minor",
    "tax_minor",
    "tds_minor",
    "amount_minor",
    "status",
    "balance_minor",
)


def _csv_safe(value: Any) -> Any:
    """Neutralise spreadsheet formula injection in text cells."""
    if isinstance(value, str) and value[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + value
    return value


def statement_csv(statement: StatementOut) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(_CSV_FIELDS)
    for row in statement.rows:
        data = row.model_dump(mode="json")
        writer.writerow([_csv_safe(data.get(f)) if f not in {"date"} else data.get(f) for f in _CSV_FIELDS])
    return buffer.getvalue()
