"""Finance endpoints: summary, settlement items, batches (maker-checker), payouts, commission rules, payout
accounts and statements (PLAN 8.12).

Route paths are written in full in each decorator; the router itself has no prefix.
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy import select

from app.core.deps import FINANCE_ROLES, CurrentUser, DbSession, PageParams, is_staff, require_roles
from app.core.enums import (
    CommissionScope,
    PayeeType,
    PayoutAccountStatus,
    PayoutMethod,
    PayoutStatus,
    SettlementBatchStatus,
    SettlementItemStatus,
    UserRole,
)
from app.core.errors import BadRequest, NotFound
from app.core.pagination import Page, paginate
from app.models.identity import User
from app.models.payments import Invoice
from app.models.settlements import CommissionRule, Payout, PayoutAccount, SettlementBatch, SettlementItem
from app.modules.settlements import invoices as settlement_documents
from app.modules.settlements import listing, service
from app.modules.settlements.policies import Payee, finance_or_payee, payee_for_user
from app.modules.settlements.schemas import (
    BatchApproveIn,
    BatchCreateIn,
    BatchProcessIn,
    BatchRejectIn,
    CommissionResolveOut,
    CommissionRuleIn,
    CommissionRuleOut,
    CommissionRulePatch,
    HoldIn,
    ListCountsOut,
    MarkFailedApproveIn,
    MarkFailedIn,
    MarkPaidApproveIn,
    MarkPaidIn,
    PayeeSummaryOut,
    PayoutAccountCreate,
    PayoutAccountOut,
    PayoutAccountPatch,
    PayoutOut,
    ReleaseIn,
    SettlementBatchOut,
    SettlementDocumentOut,
    SettlementItemOut,
    StaffSummaryOut,
    StatementOut,
)

router = APIRouter(tags=["settlements"])

FinanceUser = Annotated[User, Depends(require_roles(*FINANCE_ROLES))]
RulesUser = Annotated[User, Depends(require_roles(UserRole.FINANCE, UserRole.ADMIN))]


# ------------------------------------------------------------------------------------------ summary
@router.get("/finance/summary", response_model=StaffSummaryOut | PayeeSummaryOut)
async def finance_summary(
    request: Request, db: DbSession, user: CurrentUser
) -> StaffSummaryOut | PayeeSummaryOut:
    """Staff (finance/admin/support): platform balances. Hospital members / agents: their own settlements."""
    if is_staff(user):
        return await service.staff_summary(db)
    payee = await payee_for_user(db, user, request)
    return await service.payee_summary(db, payee)


# ------------------------------------------------------------------------------------------ items
QText = Annotated[str | None, Query(max_length=100, description="Search text")]
MinorAmount = Annotated[int | None, Query(ge=0, description="Amount in minor units")]


def item_list_filters(
    q: QText = None,
    eligible_from: Annotated[
        date | None, Query(description="Eligible (hold ends) on/after (IST day)")
    ] = None,
    eligible_to: Annotated[date | None, Query(description="Eligible (hold ends) on/before (IST day)")] = None,
    created_from: date | None = None,
    created_to: date | None = None,
    min_net: MinorAmount = None,
    max_net: MinorAmount = None,
) -> listing.ItemListFilters:
    return listing.ItemListFilters(
        q=q,
        eligible_from=eligible_from,
        eligible_to=eligible_to,
        created_from=created_from,
        created_to=created_to,
        min_net=min_net,
        max_net=max_net,
    )


ItemFilters = Annotated[listing.ItemListFilters, Depends(item_list_filters)]


async def _items_stmt(
    db: Any,
    user: User,
    request: Request,
    *,
    payee_type: PayeeType | None,
    payee_id: uuid.UUID | None,
    status: list[SettlementItemStatus] | None,
    booking_id: uuid.UUID | None,
    batch_id: uuid.UUID | None,
    extra: listing.ItemListFilters,
) -> Any:
    own = await finance_or_payee(db, user, request)
    if own is not None:
        payee_type, payee_id = own.payee_type, own.payee_id
    stmt = service.items_query(
        payee_type=payee_type, payee_id=payee_id, status=status, booking_id=booking_id, batch_id=batch_id
    )
    clauses = extra.clauses()
    return stmt.where(*clauses) if clauses else stmt


@router.get("/finance/settlements/items", response_model=Page[SettlementItemOut])
async def list_items(
    request: Request,
    db: DbSession,
    user: CurrentUser,
    params: PageParams,
    filters: ItemFilters,
    payee_type: PayeeType | None = None,
    payee_id: uuid.UUID | None = None,
    status: Annotated[list[SettlementItemStatus] | None, Query(description="Repeatable")] = None,
    booking_id: uuid.UUID | None = None,
    batch_id: uuid.UUID | None = None,
    sort: Annotated[
        str | None,
        Query(
            pattern=listing.ITEM_SORT_PATTERN,
            description="created_at | eligible_at | net_minor | gross_minor | status",
        ),
    ] = None,
) -> Page[Any]:
    stmt = await _items_stmt(
        db,
        user,
        request,
        payee_type=payee_type,
        payee_id=payee_id,
        status=status,
        booking_id=booking_id,
        batch_id=batch_id,
        extra=filters,
    )
    stmt = listing.apply_sort(stmt, sort, listing.ITEM_SORT_FIELDS, SettlementItem.id)

    async def _transform(rows: list[SettlementItem]) -> list[SettlementItemOut]:
        return await service.serialize_items(db, rows)

    return await paginate(db, stmt, params, transform=_transform)


@router.get("/finance/settlements/items/status-counts", response_model=ListCountsOut)
async def item_status_counts(
    request: Request,
    db: DbSession,
    user: CurrentUser,
    filters: ItemFilters,
    payee_type: PayeeType | None = None,
    payee_id: uuid.UUID | None = None,
    booking_id: uuid.UUID | None = None,
    batch_id: uuid.UUID | None = None,
) -> ListCountsOut:
    """Settlement items per status for the same filters as the list (``status`` itself is ignored)."""
    stmt = await _items_stmt(
        db,
        user,
        request,
        payee_type=payee_type,
        payee_id=payee_id,
        status=None,
        booking_id=booking_id,
        batch_id=batch_id,
        extra=filters,
    )
    counts = await listing.count_by(db, stmt, SettlementItem.status)
    return ListCountsOut(counts=counts, total=sum(counts.values()))


async def _item_for(db: Any, item_id: uuid.UUID, own: Payee | None) -> SettlementItem:
    item = await db.get(SettlementItem, item_id)
    if item is None or (
        own is not None and (item.payee_type != own.payee_type or item.payee_id != own.payee_id)
    ):
        raise NotFound("Settlement item not found")
    return item


@router.get("/finance/settlements/items/{item_id}", response_model=SettlementItemOut)
async def get_item(
    item_id: uuid.UUID, request: Request, db: DbSession, user: CurrentUser
) -> SettlementItemOut:
    own = await finance_or_payee(db, user, request)
    item = await _item_for(db, item_id, own)
    return (await service.serialize_items(db, [item]))[0]


@router.post("/finance/settlements/items/{item_id}/hold", response_model=SettlementItemOut)
async def hold_item(
    item_id: uuid.UUID, body: HoldIn, request: Request, db: DbSession, user: FinanceUser
) -> SettlementItemOut:
    item = await service.hold_item(db, user, item_id, body.reason, request)
    await db.commit()
    return (await service.serialize_items(db, [item]))[0]


@router.post("/finance/settlements/items/{item_id}/release", response_model=SettlementItemOut)
async def release_item(
    item_id: uuid.UUID, request: Request, db: DbSession, user: FinanceUser, body: ReleaseIn | None = None
) -> SettlementItemOut:
    item = await service.release_item(db, user, item_id, body.reason if body else None, request)
    await db.commit()
    return (await service.serialize_items(db, [item]))[0]


# ------------------------------------------------------------------------------------------ batches
@router.post("/finance/settlements/batches", response_model=SettlementBatchOut, status_code=201)
async def create_batch(
    body: BatchCreateIn, request: Request, db: DbSession, user: FinanceUser
) -> SettlementBatchOut:
    batch = await service.generate_batch(
        db,
        actor=user,
        payee_type=body.payee_type,
        payee_id=body.payee_id,
        period_end=body.period_end,
        notes=body.notes,
        request=request,
    )
    await db.commit()
    return await service.batch_detail(db, batch)


def batch_list_filters(
    status: Annotated[list[SettlementBatchStatus] | None, Query(description="Repeatable")] = None,
    payee_type: PayeeType | None = None,
    payee_id: uuid.UUID | None = None,
    auto: Annotated[
        bool | None, Query(description="true: generated by the daily job (no human maker)")
    ] = None,
    q: QText = None,
    created_from: date | None = None,
    created_to: date | None = None,
    min_net: MinorAmount = None,
    max_net: MinorAmount = None,
) -> listing.BatchListFilters:
    return listing.BatchListFilters(
        status=status,
        payee_type=payee_type,
        payee_id=payee_id,
        auto=auto,
        q=q,
        created_from=created_from,
        created_to=created_to,
        min_net=min_net,
        max_net=max_net,
    )


BatchFilters = Annotated[listing.BatchListFilters, Depends(batch_list_filters)]


@router.get("/finance/settlements/batches", response_model=Page[SettlementBatchOut])
async def list_batches(
    db: DbSession,
    user: FinanceUser,
    params: PageParams,
    filters: BatchFilters,
    sort: Annotated[
        str | None,
        Query(
            pattern=listing.BATCH_SORT_PATTERN,
            description="created_at | batch_number | period_end | items_count | total_net_minor | status",
        ),
    ] = None,
) -> Page[Any]:
    stmt = select(SettlementBatch).where(*filters.clauses())
    stmt = stmt.order_by(SettlementBatch.created_at.desc(), SettlementBatch.id.desc())
    stmt = listing.apply_sort(stmt, sort, listing.BATCH_SORT_FIELDS, SettlementBatch.id)

    async def _transform(rows: list[SettlementBatch]) -> list[SettlementBatchOut]:
        return await service.serialize_batches(db, rows)

    return await paginate(db, stmt, params, transform=_transform)


@router.get("/finance/settlements/batches/status-counts", response_model=ListCountsOut)
async def batch_status_counts(db: DbSession, user: FinanceUser, filters: BatchFilters) -> ListCountsOut:
    """Batches per status for the same filters as the list (``status`` ignored), plus automatic batches that
    wait for a human approver."""
    stmt = select(SettlementBatch).where(*filters.clauses(with_status=False))
    counts = await listing.count_by(db, stmt, SettlementBatch.status)
    auto_pending = await listing.count_rows(
        db,
        stmt.where(
            SettlementBatch.status == SettlementBatchStatus.PENDING_APPROVAL,
            SettlementBatch.created_by.is_(None),
        ),
    )
    return ListCountsOut(counts=counts, total=sum(counts.values()), auto_pending_approval=auto_pending)


@router.get("/finance/settlements/batches/{batch_id}", response_model=SettlementBatchOut)
async def get_batch(batch_id: uuid.UUID, db: DbSession, user: FinanceUser) -> SettlementBatchOut:
    batch = await db.get(SettlementBatch, batch_id)
    if batch is None:
        raise NotFound("Settlement batch not found")
    return await service.batch_detail(db, batch)


@router.post("/finance/settlements/batches/{batch_id}/approve", response_model=SettlementBatchOut)
async def approve_batch(
    batch_id: uuid.UUID,
    request: Request,
    db: DbSession,
    user: FinanceUser,
    body: BatchApproveIn | None = None,
) -> SettlementBatchOut:
    batch = await service.approve_batch(db, user, batch_id, body.notes if body else None, request)
    await db.commit()
    return await service.batch_detail(db, batch)


@router.post("/finance/settlements/batches/{batch_id}/reject", response_model=SettlementBatchOut)
async def reject_batch(
    batch_id: uuid.UUID, body: BatchRejectIn, request: Request, db: DbSession, user: FinanceUser
) -> SettlementBatchOut:
    batch = await service.reject_batch(db, user, batch_id, body.reason, request)
    await db.commit()
    return await service.batch_detail(db, batch)


@router.post("/finance/settlements/batches/{batch_id}/process", response_model=SettlementBatchOut)
async def process_batch(
    batch_id: uuid.UUID,
    request: Request,
    db: DbSession,
    user: FinanceUser,
    body: BatchProcessIn | None = None,
) -> SettlementBatchOut:
    batch = await service.process_batch(db, user, batch_id, body.method if body else None, request)
    await db.commit()
    return await service.batch_detail(db, batch)


# ------------------------------------------------------------------------------------------ payouts
def payout_list_filters(
    method: Annotated[list[PayoutMethod] | None, Query(description="Repeatable")] = None,
    q: QText = None,
    created_from: date | None = None,
    created_to: date | None = None,
    processed_from: date | None = None,
    processed_to: date | None = None,
    min_amount: MinorAmount = None,
    max_amount: MinorAmount = None,
) -> listing.PayoutListFilters:
    return listing.PayoutListFilters(
        method=method,
        q=q,
        created_from=created_from,
        created_to=created_to,
        processed_from=processed_from,
        processed_to=processed_to,
        min_amount=min_amount,
        max_amount=max_amount,
    )


PayoutFilters = Annotated[listing.PayoutListFilters, Depends(payout_list_filters)]


def _reversal_pending_clause() -> Any:
    return Payout.reversal_requested_by.is_not(None) & Payout.status.in_(service.DUAL_CONTROL_FAILURE)


async def _payouts_stmt(
    db: Any,
    user: User,
    request: Request,
    *,
    status: list[PayoutStatus] | None,
    batch_id: uuid.UUID | None,
    payee_type: PayeeType | None,
    payee_id: uuid.UUID | None,
    awaiting_confirmation: bool | None,
    reversal_pending: bool | None,
    extra: listing.PayoutListFilters,
) -> Any:
    own = await finance_or_payee(db, user, request)
    if own is not None:
        payee_type, payee_id = own.payee_type, own.payee_id
    stmt = select(Payout).where(*extra.clauses())
    if status:
        stmt = stmt.where(Payout.status.in_(status))
    if awaiting_confirmation is not None:
        clause = service.awaiting_confirmation_clause()
        stmt = stmt.where(clause if awaiting_confirmation else ~clause)
    if reversal_pending is not None:
        pending = _reversal_pending_clause()
        stmt = stmt.where(pending if reversal_pending else ~pending)
    if batch_id is not None:
        stmt = stmt.where(Payout.batch_id == batch_id)
    if payee_type is not None:
        stmt = stmt.where(Payout.payee_type == payee_type)
    if payee_id is not None:
        stmt = stmt.where(Payout.payee_id == payee_id)
    return stmt


@router.get("/finance/settlements/payouts", response_model=Page[PayoutOut])
async def list_payouts(
    request: Request,
    db: DbSession,
    user: CurrentUser,
    params: PageParams,
    filters: PayoutFilters,
    status: Annotated[list[PayoutStatus] | None, Query(description="Repeatable")] = None,
    batch_id: uuid.UUID | None = None,
    payee_type: PayeeType | None = None,
    payee_id: uuid.UUID | None = None,
    awaiting_confirmation: Annotated[
        bool | None,
        Query(description="true: UTR recorded and waiting for the second finance user (mark-paid/approve)"),
    ] = None,
    reversal_pending: Annotated[
        bool | None, Query(description="true: a failure/reversal request waits for the second finance user")
    ] = None,
    sort: Annotated[
        str | None,
        Query(
            pattern=listing.PAYOUT_SORT_PATTERN,
            description="created_at | processed_at | amount_minor | status",
        ),
    ] = None,
) -> Page[Any]:
    stmt = await _payouts_stmt(
        db,
        user,
        request,
        status=status,
        batch_id=batch_id,
        payee_type=payee_type,
        payee_id=payee_id,
        awaiting_confirmation=awaiting_confirmation,
        reversal_pending=reversal_pending,
        extra=filters,
    )
    stmt = stmt.order_by(Payout.created_at.desc(), Payout.id.desc())
    stmt = listing.apply_sort(stmt, sort, listing.PAYOUT_SORT_FIELDS, Payout.id)

    async def _transform(rows: list[Payout]) -> list[PayoutOut]:
        return await service.serialize_payouts(db, rows)

    return await paginate(db, stmt, params, transform=_transform)


@router.get("/finance/settlements/payouts/status-counts", response_model=ListCountsOut)
async def payout_status_counts(
    request: Request,
    db: DbSession,
    user: CurrentUser,
    filters: PayoutFilters,
    batch_id: uuid.UUID | None = None,
    payee_type: PayeeType | None = None,
    payee_id: uuid.UUID | None = None,
) -> ListCountsOut:
    """Payouts per status for the same filters as the list (``status`` and the queue flags ignored), plus the
    two second-approver queues (UTR awaiting confirmation, failure / reversal awaiting approval)."""
    stmt = await _payouts_stmt(
        db,
        user,
        request,
        status=None,
        batch_id=batch_id,
        payee_type=payee_type,
        payee_id=payee_id,
        awaiting_confirmation=None,
        reversal_pending=None,
        extra=filters,
    )
    counts = await listing.count_by(db, stmt, Payout.status)
    return ListCountsOut(
        counts=counts,
        total=sum(counts.values()),
        awaiting_confirmation=await listing.count_rows(
            db, stmt.where(service.awaiting_confirmation_clause())
        ),
        reversal_pending=await listing.count_rows(db, stmt.where(_reversal_pending_clause())),
    )


@router.get("/finance/settlements/payouts/{payout_id}", response_model=PayoutOut)
async def get_payout(payout_id: uuid.UUID, request: Request, db: DbSession, user: CurrentUser) -> PayoutOut:
    own = await finance_or_payee(db, user, request)
    payout = await db.get(Payout, payout_id)
    if payout is None or (
        own is not None and (payout.payee_type != own.payee_type or payout.payee_id != own.payee_id)
    ):
        raise NotFound("Payout not found")
    return (await service.serialize_payouts(db, [payout]))[0]


@router.post("/finance/settlements/payouts/{payout_id}/mark-paid", response_model=PayoutOut)
async def mark_payout_paid(
    payout_id: uuid.UUID, body: MarkPaidIn, request: Request, db: DbSession, user: FinanceUser
) -> PayoutOut:
    """Maker step: records the UTR; a different finance user completes it via ``mark-paid/approve``."""
    payout = await service.mark_payout_paid(db, user, payout_id, body.utr, request)
    await db.commit()
    return (await service.serialize_payouts(db, [payout]))[0]


@router.post("/finance/settlements/payouts/{payout_id}/mark-paid/approve", response_model=PayoutOut)
async def approve_payout_paid(
    payout_id: uuid.UUID, body: MarkPaidApproveIn, request: Request, db: DbSession, user: FinanceUser
) -> PayoutOut:
    """Checker step: a different finance user confirms the recorded UTR (403 ``second_approver_required``).
    The body names the reviewed request (``paid_request_id``, UTR, amount); 409 ``mark_paid_request_changed``
    if the pending request differs (SEC-063)."""
    payout = await service.approve_payout_paid(
        db,
        user,
        payout_id,
        request,
        request_id=body.request_id,
        reference=body.reference,
        amount_minor=body.amount_minor,
    )
    await db.commit()
    return (await service.serialize_payouts(db, [payout]))[0]


@router.post("/finance/settlements/payouts/{payout_id}/mark-paid/reject", response_model=PayoutOut)
async def reject_payout_paid(
    payout_id: uuid.UUID, body: ReleaseIn, request: Request, db: DbSession, user: FinanceUser
) -> PayoutOut:
    payout = await service.reject_payout_paid(db, user, payout_id, body.reason, request)
    await db.commit()
    return (await service.serialize_payouts(db, [payout]))[0]


@router.post("/finance/settlements/payouts/{payout_id}/mark-failed", response_model=PayoutOut)
async def mark_payout_failed(
    payout_id: uuid.UUID, body: MarkFailedIn, request: Request, db: DbSession, user: FinanceUser
) -> PayoutOut:
    """Queued/processing payouts fail at once. Processed (bounced) or needs_reconciliation payouts only
    record a request (``reference`` required) that a different finance user approves via
    ``mark-failed/approve``."""
    payout = await service.mark_payout_failed(
        db, user, payout_id, body.reason, request, reference=body.reference
    )
    await db.commit()
    return (await service.serialize_payouts(db, [payout]))[0]


@router.post("/finance/settlements/payouts/{payout_id}/mark-failed/approve", response_model=PayoutOut)
async def approve_payout_failure(
    payout_id: uuid.UUID, body: MarkFailedApproveIn, request: Request, db: DbSession, user: FinanceUser
) -> PayoutOut:
    """Second finance user applies a pending failure/reversal (403 ``second_approver_required``). The body
    names the reviewed request (``reversal_request_id``, reference); 409 ``mark_failed_request_changed`` if it
    changed (SEC-063)."""
    payout = await service.approve_payout_failure(
        db, user, payout_id, request, request_id=body.request_id, reference=body.reference
    )
    await db.commit()
    return (await service.serialize_payouts(db, [payout]))[0]


@router.post("/finance/settlements/payouts/{payout_id}/mark-failed/reject", response_model=PayoutOut)
async def reject_payout_failure(
    payout_id: uuid.UUID, body: ReleaseIn, request: Request, db: DbSession, user: FinanceUser
) -> PayoutOut:
    payout = await service.reject_payout_failure(db, user, payout_id, body.reason, request)
    await db.commit()
    return (await service.serialize_payouts(db, [payout]))[0]


# ------------------------------------------------------------------------------------------ commission rules
@router.get("/finance/commission-rules", response_model=Page[CommissionRuleOut])
async def list_commission_rules(
    db: DbSession,
    user: RulesUser,
    params: PageParams,
    scope: CommissionScope | None = None,
    hospital_id: uuid.UUID | None = None,
    agent_id: uuid.UUID | None = None,
    procedure_id: uuid.UUID | None = None,
    specialty_id: uuid.UUID | None = None,
    is_active: bool | None = None,
) -> Page[Any]:
    stmt = select(CommissionRule)
    filters: list[tuple[Any, Any]] = [
        (CommissionRule.scope, scope),
        (CommissionRule.hospital_id, hospital_id),
        (CommissionRule.agent_id, agent_id),
        (CommissionRule.procedure_id, procedure_id),
        (CommissionRule.specialty_id, specialty_id),
        (CommissionRule.is_active, is_active),
    ]
    for column, value in filters:
        if value is not None:
            stmt = stmt.where(column == value)
    stmt = stmt.order_by(CommissionRule.created_at.desc(), CommissionRule.id.desc())

    async def _transform(rows: list[CommissionRule]) -> list[CommissionRuleOut]:
        return await listing.commission_rule_outs(db, rows)

    return await paginate(db, stmt, params, transform=_transform)


@router.get("/finance/commission-rules/resolve", response_model=CommissionResolveOut)
async def resolve_commission(
    db: DbSession,
    user: RulesUser,
    hospital_id: uuid.UUID | None = None,
    procedure_id: uuid.UUID | None = None,
    specialty_id: uuid.UUID | None = None,
    agent_id: uuid.UUID | None = None,
    on: date | None = None,
) -> CommissionResolveOut:
    """Preview the effective rates for a hospital/procedure/specialty (and agent)."""
    bps = await service.resolve_commission_bps(
        db, hospital_id=hospital_id, procedure_id=procedure_id, specialty_id=specialty_id, on=on
    )
    agent_bps = await service.resolve_agent_commission_bps(db, agent_id, on=on) if agent_id else None
    return CommissionResolveOut(commission_bps=bps, agent_commission_bps=agent_bps)


@router.post("/finance/commission-rules", response_model=CommissionRuleOut, status_code=201)
async def create_commission_rule(
    body: CommissionRuleIn, request: Request, db: DbSession, user: RulesUser
) -> CommissionRuleOut:
    rule = await service.create_commission_rule(db, user, body, request)
    await db.commit()
    return (await listing.commission_rule_outs(db, [rule]))[0]


@router.patch("/finance/commission-rules/{rule_id}", response_model=CommissionRuleOut)
async def update_commission_rule(
    rule_id: uuid.UUID, body: CommissionRulePatch, request: Request, db: DbSession, user: RulesUser
) -> CommissionRuleOut:
    rule = await service.update_commission_rule(db, user, rule_id, body, request)
    await db.commit()
    await db.refresh(rule)
    return (await listing.commission_rule_outs(db, [rule]))[0]


# ------------------------------------------------------------------------------------------ payout accounts
def account_list_filters(
    status: Annotated[list[PayoutAccountStatus] | None, Query(description="Repeatable")] = None,
    q: QText = None,
    route: Annotated[
        Literal["razorpay_route", "manual"] | None,
        Query(description="Linked Razorpay account or manual transfer"),
    ] = None,
) -> listing.AccountListFilters:
    return listing.AccountListFilters(status=status, q=q, route=route)


AccountFilters = Annotated[listing.AccountListFilters, Depends(account_list_filters)]


async def _accounts_stmt(
    db: Any,
    user: User,
    request: Request,
    *,
    owner_type: PayeeType | None,
    owner_id: uuid.UUID | None,
    extra: listing.AccountListFilters,
    with_status: bool = True,
) -> Any:
    own = await finance_or_payee(db, user, request)
    if own is not None:
        owner_type, owner_id = own.payee_type, own.payee_id
    stmt = select(PayoutAccount).where(*extra.clauses(with_status=with_status))
    if owner_type is not None:
        stmt = stmt.where(PayoutAccount.owner_type == owner_type)
    if owner_id is not None:
        stmt = stmt.where(PayoutAccount.owner_id == owner_id)
    return stmt


@router.get("/finance/payout-accounts", response_model=Page[PayoutAccountOut])
async def list_payout_accounts(
    request: Request,
    db: DbSession,
    user: CurrentUser,
    params: PageParams,
    filters: AccountFilters,
    owner_type: PayeeType | None = None,
    owner_id: uuid.UUID | None = None,
    is_verified: bool | None = None,
    sort: Annotated[
        str | None,
        Query(pattern=listing.ACCOUNT_SORT_PATTERN, description="created_at | account_holder_name"),
    ] = None,
) -> Page[Any]:
    stmt = await _accounts_stmt(db, user, request, owner_type=owner_type, owner_id=owner_id, extra=filters)
    if is_verified is not None:
        stmt = stmt.where(PayoutAccount.is_verified.is_(is_verified))
    stmt = stmt.order_by(PayoutAccount.is_primary.desc(), PayoutAccount.created_at.desc(), PayoutAccount.id)
    stmt = listing.apply_sort(stmt, sort, listing.ACCOUNT_SORT_FIELDS, PayoutAccount.id)

    async def _transform(rows: list[PayoutAccount]) -> list[PayoutAccountOut]:
        return await service.serialize_accounts(db, rows)

    return await paginate(db, stmt, params, transform=_transform)


@router.get("/finance/payout-accounts/verification-counts", response_model=ListCountsOut)
async def payout_account_verification_counts(
    request: Request,
    db: DbSession,
    user: CurrentUser,
    filters: AccountFilters,
    owner_type: PayeeType | None = None,
    owner_id: uuid.UUID | None = None,
) -> ListCountsOut:
    """``counts``: ``unverified`` / ``verified`` (active accounts) and ``disabled``, for the same filters
    as the list (``status`` and ``is_verified`` ignored)."""
    stmt = await _accounts_stmt(
        db, user, request, owner_type=owner_type, owner_id=owner_id, extra=filters, with_status=False
    )
    active = stmt.where(PayoutAccount.status == PayoutAccountStatus.ACTIVE)
    counts = {
        "unverified": await listing.count_rows(db, active.where(PayoutAccount.is_verified.is_(False))),
        "verified": await listing.count_rows(db, active.where(PayoutAccount.is_verified.is_(True))),
        "disabled": await listing.count_rows(
            db, stmt.where(PayoutAccount.status == PayoutAccountStatus.DISABLED)
        ),
    }
    return ListCountsOut(counts=counts, total=sum(counts.values()))


@router.post("/finance/payout-accounts", response_model=PayoutAccountOut, status_code=201)
async def create_payout_account(
    body: PayoutAccountCreate, request: Request, db: DbSession, user: CurrentUser
) -> PayoutAccountOut:
    own = await finance_or_payee(db, user, request)
    account = await service.create_payout_account(db, user, own, body, request)
    await db.commit()
    return (await service.serialize_accounts(db, [account]))[0]


@router.get("/finance/payout-accounts/{account_id}", response_model=PayoutAccountOut)
async def get_payout_account(
    account_id: uuid.UUID, request: Request, db: DbSession, user: CurrentUser
) -> PayoutAccountOut:
    own = await finance_or_payee(db, user, request)
    account = await service.get_payout_account(db, account_id, own)
    return (await service.serialize_accounts(db, [account]))[0]


@router.patch("/finance/payout-accounts/{account_id}", response_model=PayoutAccountOut)
async def update_payout_account(
    account_id: uuid.UUID, body: PayoutAccountPatch, request: Request, db: DbSession, user: CurrentUser
) -> PayoutAccountOut:
    own = await finance_or_payee(db, user, request)
    account = await service.update_payout_account(db, user, own, account_id, body, request)
    await db.commit()
    return (await service.serialize_accounts(db, [account]))[0]


@router.post("/finance/payout-accounts/{account_id}/verify", response_model=PayoutAccountOut)
async def verify_payout_account(
    account_id: uuid.UUID, request: Request, db: DbSession, user: FinanceUser
) -> PayoutAccountOut:
    account = await service.verify_payout_account(db, user, account_id, request)
    await db.commit()
    return (await service.serialize_accounts(db, [account]))[0]


# ------------------------------------------------------------------------------------------ statements
@router.get("/finance/statements", response_model=StatementOut)
async def statement(
    request: Request,
    db: DbSession,
    user: CurrentUser,
    from_date: Annotated[date | None, Query(alias="from")] = None,
    to_date: Annotated[date | None, Query(alias="to")] = None,
    format: Literal["json", "csv"] = "json",  # noqa: A002 - public query parameter name
    payee_type: PayeeType | None = None,
    payee_id: uuid.UUID | None = None,
) -> Any:
    """Hospital members / agents: their own statement. Finance may pass ``payee_type`` + ``payee_id``.
    ``format=csv`` returns a spreadsheet-safe CSV download."""
    own = await finance_or_payee(db, user, request)
    if own is None:
        if payee_type is None or payee_id is None:
            raise BadRequest("payee_type and payee_id are required", code="payee_required")
        own = Payee(payee_type, payee_id)
    to_value = to_date or service.today()
    from_value = from_date or (to_value - timedelta(days=30))
    result = await service.build_statement(db, own, from_value, to_value)
    if format == "csv":
        filename = f"statement-{own.payee_type.value}-{from_value.isoformat()}-{to_value.isoformat()}.csv"
        return Response(
            content=service.statement_csv(result),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    return result


# ------------------------------------------------------------------------------------------ documents
DocumentKind = Literal["commission_invoice", "credit_note", "agent_statement"]


def document_list_filters(
    q: QText = None,
    issued_from: date | None = None,
    issued_to: date | None = None,
    min_total: MinorAmount = None,
    max_total: MinorAmount = None,
) -> listing.DocumentListFilters:
    return listing.DocumentListFilters(
        q=q, issued_from=issued_from, issued_to=issued_to, min_total=min_total, max_total=max_total
    )


DocumentFilters = Annotated[listing.DocumentListFilters, Depends(document_list_filters)]


@router.get("/finance/settlements/invoices", response_model=Page[SettlementDocumentOut])
async def list_settlement_documents(
    request: Request,
    db: DbSession,
    user: CurrentUser,
    params: PageParams,
    filters: DocumentFilters,
    kind: Annotated[list[DocumentKind] | None, Query(description="Repeatable")] = None,
    batch_id: uuid.UUID | None = None,
    payee_type: PayeeType | None = None,
    payee_id: uuid.UUID | None = None,
    sort: Annotated[
        str | None,
        Query(pattern=listing.DOCUMENT_SORT_PATTERN, description="issued_at | invoice_number | total_minor"),
    ] = None,
) -> Page[Any]:
    """Commission invoices / credit notes (hospitals) and commission statements (agents). Finance sees all;
    hospital members and agents only their own."""
    stmt = await _documents_stmt(
        db,
        user,
        request,
        kind=kind,
        batch_id=batch_id,
        payee_type=payee_type,
        payee_id=payee_id,
        extra=filters,
    )
    stmt = stmt.order_by(Invoice.issued_at.desc(), Invoice.id.desc())
    stmt = listing.apply_sort(stmt, sort, listing.DOCUMENT_SORT_FIELDS, Invoice.id)

    async def _transform(rows: list[Invoice]) -> list[SettlementDocumentOut]:
        return await settlement_documents.serialize_documents(db, rows)

    return await paginate(db, stmt, params, transform=_transform)


@router.get("/finance/settlements/invoices/kind-counts", response_model=ListCountsOut)
async def settlement_document_kind_counts(
    request: Request,
    db: DbSession,
    user: CurrentUser,
    filters: DocumentFilters,
    batch_id: uuid.UUID | None = None,
    payee_type: PayeeType | None = None,
    payee_id: uuid.UUID | None = None,
) -> ListCountsOut:
    """Settlement documents per kind for the same filters as the list (``kind`` ignored)."""
    stmt = await _documents_stmt(
        db,
        user,
        request,
        kind=None,
        batch_id=batch_id,
        payee_type=payee_type,
        payee_id=payee_id,
        extra=filters,
    )
    counts = await listing.count_by(db, stmt, Invoice.kind)
    return ListCountsOut(counts=counts, total=sum(counts.values()))


async def _documents_stmt(
    db: Any,
    user: User,
    request: Request,
    *,
    kind: list[DocumentKind] | None,
    batch_id: uuid.UUID | None,
    payee_type: PayeeType | None,
    payee_id: uuid.UUID | None,
    extra: listing.DocumentListFilters,
) -> Any:
    own = await finance_or_payee(db, user, request)
    if own is not None:
        payee_type, payee_id = own.payee_type, own.payee_id
    stmt = select(Invoice).where(Invoice.kind.in_(list(settlement_documents.SETTLEMENT_DOCUMENT_KINDS)))
    stmt = stmt.where(*extra.clauses())
    if kind:
        stmt = stmt.where(Invoice.kind.in_(kind))
    if batch_id is not None:
        stmt = stmt.where(Invoice.settlement_batch_id == batch_id)
    if payee_type is PayeeType.HOSPITAL:
        stmt = stmt.where(Invoice.hospital_id.is_not(None))
        if payee_id is not None:
            stmt = stmt.where(Invoice.hospital_id == payee_id)
    elif payee_type is PayeeType.AGENT:
        stmt = stmt.where(Invoice.agent_id.is_not(None))
        if payee_id is not None:
            stmt = stmt.where(Invoice.agent_id == payee_id)
    elif payee_type is not None:
        stmt = stmt.where(False)
    return stmt


async def _settlement_document(db: Any, user: User, request: Request, invoice_id: uuid.UUID) -> Invoice:
    """Finance: any settlement document; hospital members / agents: their own (404 otherwise)."""
    own = await finance_or_payee(db, user, request)
    invoice = await db.get(Invoice, invoice_id)
    kinds = {k.value for k in settlement_documents.SETTLEMENT_DOCUMENT_KINDS}
    if invoice is None or str(getattr(invoice.kind, "value", invoice.kind)) not in kinds:
        raise NotFound("Document not found")
    if own is not None:
        owner = invoice.hospital_id if own.payee_type is PayeeType.HOSPITAL else invoice.agent_id
        if owner != own.payee_id:
            raise NotFound("Document not found")
    return invoice


@router.get("/finance/settlements/invoices/{invoice_id}", response_model=SettlementDocumentOut)
async def get_settlement_document(
    invoice_id: uuid.UUID, request: Request, db: DbSession, user: CurrentUser
) -> SettlementDocumentOut:
    invoice = await _settlement_document(db, user, request, invoice_id)
    return (await settlement_documents.serialize_documents(db, [invoice]))[0]


@router.get(
    "/finance/settlements/invoices/{invoice_id}/pdf",
    response_class=Response,
    responses={200: {"content": {"application/pdf": {}}}},
)
async def settlement_document_pdf(
    invoice_id: uuid.UUID, request: Request, db: DbSession, user: CurrentUser
) -> Response:
    invoice = await _settlement_document(db, user, request, invoice_id)
    data = await settlement_documents.document_pdf(db, invoice)
    return Response(
        content=data,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{invoice.invoice_number}.pdf"',
            "Cache-Control": "private, no-store",
        },
    )
