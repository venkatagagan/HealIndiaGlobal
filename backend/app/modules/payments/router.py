"""HTTP routes for the payments module (PLAN 8.11). Full paths in each decorator; no router prefix."""

from __future__ import annotations

import re
import uuid
from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, Query, Request, Response
from sqlalchemy import select

from app.core.deps import (
    ADMIN_ROLES,
    FINANCE_ROLES,
    STAFF_ROLES,
    CurrentUser,
    DbSession,
    PageParams,
    require_roles,
)
from app.core.enums import (
    InvoiceKind,
    OrderStatus,
    PaymentGateway,
    PaymentMethod,
    PaymentPurpose,
    RefundStatus,
    UserRole,
)
from app.core.errors import NotFound
from app.core.pagination import Page, paginate
from app.core.rate_limit import rate_limit
from app.models import Booking, Installment, Invoice, PaymentOrder, Refund, User
from app.modules.documents import service as documents_service
from app.modules.documents.schemas import DocumentOut
from app.modules.payments import invoices, listing, policies, service
from app.modules.payments.schemas import (
    AmountReviewIn,
    BankTransferProofIn,
    CheckoutOut,
    InstallmentOut,
    InvoiceOut,
    MarkPaidApproveIn,
    MarkPaidDecisionIn,
    MarkPaidIn,
    MockCompleteIn,
    OrderCreate,
    OrderStatusCounts,
    PaymentOrderDetail,
    PaymentOrderOut,
    RefundCreate,
    RefundOut,
    RefundRejectIn,
    RefundStatusCounts,
    VerifyIn,
    WebhookAck,
)

router = APIRouter(tags=["payments"])

PayerUser = Annotated[User, Depends(require_roles(UserRole.PATIENT, UserRole.AGENT, *STAFF_ROLES))]
FinanceUser = Annotated[User, Depends(require_roles(*FINANCE_ROLES))]
RefundRequester = Annotated[User, Depends(require_roles(*FINANCE_ROLES, *ADMIN_ROLES))]
StaffUser = Annotated[User, Depends(require_roles(*STAFF_ROLES))]


# ----------------------------------------------------------------------------------------------- orders
@router.post(
    "/payments/orders",
    response_model=CheckoutOut,
    status_code=201,
    dependencies=[Depends(rate_limit("payments.create_order", 30, 60, key="user"))],
)
async def create_order(
    body: OrderCreate,
    request: Request,
    db: DbSession,
    user: PayerUser,
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key", max_length=255)] = None,
) -> CheckoutOut:
    return await service.create_order(db, user, body, idempotency_key=idempotency_key, request=request)


_CURRENCY_RE = re.compile(r"^[A-Z]{3}$")


def order_list_filters(
    status_: Annotated[list[OrderStatus] | None, Query(alias="status", description="Repeatable")] = None,
    booking_id: uuid.UUID | None = None,
    gateway: Annotated[list[PaymentGateway] | None, Query(description="Repeatable")] = None,
    purpose: Annotated[list[PaymentPurpose] | None, Query(description="Repeatable")] = None,
    method: Annotated[
        list[PaymentMethod] | None, Query(description="Orders with a payment attempt by this method")
    ] = None,
    currency: Annotated[list[str] | None, Query(description="Order currency (repeatable)")] = None,
    q: Annotated[
        str | None, Query(max_length=64, description="Order / booking number, gateway order id, patient")
    ] = None,
    review: Annotated[
        Literal["amount", "mark_paid", "any"] | None,
        Query(description="Orders awaiting a finance decision (amount review / second mark-paid approver)"),
    ] = None,
    created_from: Annotated[date | None, Query(description="Inclusive IST date")] = None,
    created_to: Annotated[date | None, Query(description="Inclusive IST date")] = None,
    paid_from: Annotated[date | None, Query(description="Inclusive IST date")] = None,
    paid_to: Annotated[date | None, Query(description="Inclusive IST date")] = None,
    min_amount: Annotated[int | None, Query(ge=0, description="Base-currency (INR) minor units")] = None,
    max_amount: Annotated[int | None, Query(ge=0, description="Base-currency (INR) minor units")] = None,
) -> listing.OrderListFilters:
    return listing.OrderListFilters(
        status=status_ or None,
        booking_id=booking_id,
        gateway=gateway or None,
        purpose=purpose or None,
        method=method or None,
        currency=[c.upper() for c in currency or [] if _CURRENCY_RE.match(c.upper())] or None,
        q=q,
        review=review,
        created_from=created_from,
        created_to=created_to,
        paid_from=paid_from,
        paid_to=paid_to,
        min_amount=min_amount,
        max_amount=max_amount,
    )


OrderFilters = Annotated[listing.OrderListFilters, Depends(order_list_filters)]


@router.get("/payments/orders", response_model=Page[PaymentOrderOut])
async def list_orders(
    db: DbSession,
    user: CurrentUser,
    params: PageParams,
    filters: OrderFilters,
    sort: Annotated[
        str | None,
        Query(
            pattern=listing.ORDER_SORT_PATTERN,
            description="created_at | paid_at | base_amount_minor | amount_minor | order_number | status; "
            "prefix '-' for descending (default -created_at)",
        ),
    ] = None,
) -> Page[PaymentOrderOut]:
    stmt = select(PaymentOrder)
    scope = await policies.order_scope(db, user)
    if scope is not None:
        stmt = stmt.where(scope)
    for clause in listing.order_clauses(filters):
        stmt = stmt.where(clause)
    stmt = listing.apply_sort(stmt, listing.ORDER_SORT_FIELDS, sort, PaymentOrder.id)
    staff = user.role in STAFF_ROLES

    async def _transform(rows: list[PaymentOrder]) -> list[PaymentOrderOut]:
        if staff:
            return await listing.enrich_orders(db, rows)
        return [PaymentOrderOut.model_validate(r) for r in rows]

    return await paginate(db, stmt, params, transform=_transform)


@router.get("/payments/orders/status-counts", response_model=OrderStatusCounts)
async def order_status_counts(db: DbSession, user: StaffUser, filters: OrderFilters) -> OrderStatusCounts:
    """Orders per status and per finance-review queue for the same filters as ``GET /payments/orders``
    (``status`` and ``review`` themselves are ignored so the counts can drive tabs)."""
    scope = await policies.order_scope(db, user)
    counts, review = await listing.order_status_counts(db, scope, filters)
    return OrderStatusCounts(counts=counts, total=sum(counts.values()), review=review)


@router.get("/payments/orders/{order_id}", response_model=PaymentOrderDetail)
async def get_order(order_id: uuid.UUID, db: DbSession, user: CurrentUser) -> PaymentOrderDetail:
    order = await service.get_order_for_user(db, user, order_id)
    staff = user.role in STAFF_ROLES
    detail = await service.order_detail(db, order, staff=staff)
    if staff:
        enriched = (await listing.enrich_orders(db, [order]))[0]
        extra = {"payer_name", "patient_name", "booking_number", "payment_method"}
        detail.update(enriched.model_dump(include=extra))
        refunds = (
            (await db.execute(select(Refund).where(Refund.order_id == order.id).order_by(Refund.created_at)))
            .scalars()
            .all()
        )
        detail["refunds"] = await listing.enrich_refunds(db, refunds)
    return PaymentOrderDetail.model_validate(detail)


@router.get("/payments/orders/{order_id}/proof-documents", response_model=list[DocumentOut])
async def order_proof_documents(order_id: uuid.UUID, db: DbSession, user: StaffUser) -> list[DocumentOut]:
    """Bank-transfer proof documents for reconciliation: the one submitted against the order plus
    ``payment_proof`` uploads for its case/patient since the order was created (staff only)."""
    order = await service.get_order_for_user(db, user, order_id)
    documents = await service.bank_transfer_proof_documents(db, order)
    return await documents_service.to_out_many(db, documents)


@router.post("/payments/orders/{order_id}/verify", response_model=PaymentOrderOut)
async def verify_order(
    order_id: uuid.UUID, body: VerifyIn, request: Request, db: DbSession, user: CurrentUser
) -> PaymentOrderOut:
    order = await service.verify_order(db, user, order_id, body, request)
    return PaymentOrderOut.model_validate(order)


@router.post("/payments/orders/{order_id}/bank-transfer-proof", response_model=PaymentOrderOut)
async def bank_transfer_proof(
    order_id: uuid.UUID, body: BankTransferProofIn, request: Request, db: DbSession, user: CurrentUser
) -> PaymentOrderOut:
    order = await service.submit_bank_transfer_proof(db, user, order_id, body, request)
    return PaymentOrderOut.model_validate(order)


@router.post("/payments/orders/{order_id}/mark-paid", response_model=PaymentOrderOut)
async def mark_paid(
    order_id: uuid.UUID, body: MarkPaidIn, request: Request, db: DbSession, user: FinanceUser
) -> PaymentOrderOut:
    """Maker step: records a pending request; a different finance user approves it (``mark-paid/approve``)."""
    order = await service.mark_bank_transfer_paid(db, user, order_id, body, request)
    return PaymentOrderOut.model_validate(order)


@router.post("/payments/orders/{order_id}/mark-paid/approve", response_model=PaymentOrderOut)
async def approve_mark_paid(
    order_id: uuid.UUID, body: MarkPaidApproveIn, request: Request, db: DbSession, user: FinanceUser
) -> PaymentOrderOut:
    """Checker step: applies the pending bank-transfer capture (403 ``second_approver_required`` for the
    requester). The body names the reviewed request (reference + amount, optionally its id): 409
    ``mark_paid_request_changed`` if the pending request no longer matches (SEC-063)."""
    order = await service.approve_bank_transfer_paid(db, user, order_id, body, request)
    return PaymentOrderOut.model_validate(order)


@router.post("/payments/orders/{order_id}/mark-paid/reject", response_model=PaymentOrderOut)
async def reject_mark_paid(
    order_id: uuid.UUID, body: MarkPaidDecisionIn, request: Request, db: DbSession, user: FinanceUser
) -> PaymentOrderOut:
    order = await service.reject_bank_transfer_paid(db, user, order_id, body.reason, request)
    return PaymentOrderOut.model_validate(order)


@router.post("/payments/orders/{order_id}/amount-review", response_model=PaymentOrderOut)
async def amount_review(
    order_id: uuid.UUID, body: AmountReviewIn, request: Request, db: DbSession, user: FinanceUser
) -> PaymentOrderOut:
    """Decide on a payment held because its captured amount differed from the order amount."""
    order = await service.review_amount_difference(db, user, order_id, body, request)
    return PaymentOrderOut.model_validate(order)


@router.post("/payments/mock/{order_id}/complete", response_model=PaymentOrderOut)
async def mock_complete(
    order_id: uuid.UUID, body: MockCompleteIn, request: Request, db: DbSession, user: CurrentUser
) -> PaymentOrderOut:
    order = await service.complete_mock_order(db, user, order_id, body.outcome, request)
    return PaymentOrderOut.model_validate(order)


# ----------------------------------------------------------------------------------------------- webhooks
_webhook_limit = Depends(rate_limit("payments.webhook", 600, 60))


@router.post("/payments/webhooks/razorpay", response_model=WebhookAck, dependencies=[_webhook_limit])
async def razorpay_webhook(request: Request, db: DbSession) -> WebhookAck:
    raw = await request.body()
    result = await service.handle_webhook(db, PaymentGateway.RAZORPAY, raw, request.headers)
    return WebhookAck.model_validate(result)


@router.post("/payments/webhooks/stripe", response_model=WebhookAck, dependencies=[_webhook_limit])
async def stripe_webhook(request: Request, db: DbSession) -> WebhookAck:
    raw = await request.body()
    result = await service.handle_webhook(db, PaymentGateway.STRIPE, raw, request.headers)
    return WebhookAck.model_validate(result)


# ----------------------------------------------------------------------------------------------- refunds
@router.post("/payments/refunds", response_model=RefundOut, status_code=201)
async def create_refund(
    body: RefundCreate, request: Request, db: DbSession, user: RefundRequester
) -> RefundOut:
    return RefundOut.model_validate(await service.create_refund(db, user, body, request))


def refund_list_filters(
    status_: Annotated[list[RefundStatus] | None, Query(alias="status", description="Repeatable")] = None,
    booking_id: uuid.UUID | None = None,
    payment_id: uuid.UUID | None = None,
    order_id: uuid.UUID | None = None,
    q: Annotated[str | None, Query(max_length=64, description="Order / booking number, patient")] = None,
    created_from: Annotated[date | None, Query(description="Inclusive IST date")] = None,
    created_to: Annotated[date | None, Query(description="Inclusive IST date")] = None,
    min_amount: Annotated[int | None, Query(ge=0, description="Base-currency (INR) minor units")] = None,
    max_amount: Annotated[int | None, Query(ge=0, description="Base-currency (INR) minor units")] = None,
    awaiting_second_approval: Annotated[
        bool, Query(description="Requested refunds above the dual-approval threshold")
    ] = False,
) -> listing.RefundListFilters:
    return listing.RefundListFilters(
        status=status_ or None,
        booking_id=booking_id,
        payment_id=payment_id,
        order_id=order_id,
        q=q,
        created_from=created_from,
        created_to=created_to,
        min_amount=min_amount,
        max_amount=max_amount,
        awaiting_second_approval=awaiting_second_approval,
    )


RefundFilters = Annotated[listing.RefundListFilters, Depends(refund_list_filters)]


@router.get("/payments/refunds", response_model=Page[RefundOut])
async def list_refunds(
    db: DbSession,
    user: RefundRequester,
    params: PageParams,
    filters: RefundFilters,
    sort: Annotated[
        str | None,
        Query(
            pattern=listing.REFUND_SORT_PATTERN,
            description="created_at | processed_at | base_amount_minor | amount_minor | status; "
            "prefix '-' for descending (default -created_at)",
        ),
    ] = None,
) -> Page[RefundOut]:
    threshold = await service.refund_dual_approval_threshold(db)
    stmt = select(Refund)
    for clause in listing.refund_clauses(filters, threshold_minor=threshold):
        stmt = stmt.where(clause)
    stmt = listing.apply_sort(stmt, listing.REFUND_SORT_FIELDS, sort, Refund.id)

    async def _transform(rows: list[Refund]) -> list[RefundOut]:
        return await listing.enrich_refunds(db, rows)

    return await paginate(db, stmt, params, transform=_transform)


@router.get("/payments/refunds/status-counts", response_model=RefundStatusCounts)
async def refund_status_counts(
    db: DbSession, user: RefundRequester, filters: RefundFilters
) -> RefundStatusCounts:
    """Refunds per status plus the "awaiting a second approver" queue for the same filters as
    ``GET /payments/refunds`` (``status`` and ``awaiting_second_approval`` themselves are ignored)."""
    threshold = await service.refund_dual_approval_threshold(db)
    counts, second = await listing.refund_status_counts(db, filters, threshold_minor=threshold)
    return RefundStatusCounts(
        counts=counts,
        total=sum(counts.values()),
        awaiting_second_approval=second,
        threshold_minor=threshold,
    )


@router.post("/payments/refunds/{refund_id}/approve", response_model=RefundOut)
async def approve_refund(
    refund_id: uuid.UUID, request: Request, db: DbSession, user: FinanceUser
) -> RefundOut:
    return RefundOut.model_validate(await service.approve_refund(db, user, refund_id, request))


@router.post("/payments/refunds/{refund_id}/reject", response_model=RefundOut)
async def reject_refund(
    refund_id: uuid.UUID, body: RefundRejectIn, request: Request, db: DbSession, user: FinanceUser
) -> RefundOut:
    return RefundOut.model_validate(await service.reject_refund(db, user, refund_id, body.reason, request))


# ----------------------------------------------------------------------------------------------- invoices
def _invoice_out(invoice: Invoice) -> InvoiceOut:
    out = InvoiceOut.model_validate(invoice)
    out.has_pdf = bool(invoice.storage_key)
    return out


async def _get_invoice(db: DbSession, user: User, invoice_id: uuid.UUID) -> Invoice:
    # Patient receipts only: commission invoices, credit notes and agent statements are settlement documents
    # served (and access-checked: finance all, payees their own) by /finance/settlements/invoices.
    stmt = select(Invoice).where(Invoice.id == invoice_id, Invoice.kind == InvoiceKind.PATIENT_RECEIPT)
    scope = await policies.invoice_scope(db, user)
    if scope is not None:
        stmt = stmt.where(scope)
    invoice = (await db.execute(stmt)).scalar_one_or_none()
    if invoice is None:
        raise NotFound("Invoice not found")
    return invoice


@router.get("/payments/invoices", response_model=Page[InvoiceOut])
async def list_invoices(
    db: DbSession,
    user: CurrentUser,
    params: PageParams,
    booking_id: uuid.UUID | None = None,
    order_id: uuid.UUID | None = None,
    kind: InvoiceKind | None = None,
) -> Page[InvoiceOut]:
    """Patient receipts (settlement documents are listed by ``GET /finance/settlements/invoices``)."""
    stmt = select(Invoice).where(Invoice.kind == InvoiceKind.PATIENT_RECEIPT)
    scope = await policies.invoice_scope(db, user)
    if scope is not None:
        stmt = stmt.where(scope)
    if booking_id is not None:
        stmt = stmt.where(Invoice.booking_id == booking_id)
    if order_id is not None:
        stmt = stmt.where(Invoice.order_id == order_id)
    if kind is not None:
        stmt = stmt.where(Invoice.kind == kind)
    stmt = stmt.order_by(Invoice.issued_at.desc(), Invoice.id.desc())
    return await paginate(db, stmt, params, transform=lambda rows: [_invoice_out(r) for r in rows])


@router.get("/payments/invoices/{invoice_id}", response_model=InvoiceOut)
async def get_invoice(invoice_id: uuid.UUID, db: DbSession, user: CurrentUser) -> InvoiceOut:
    return _invoice_out(await _get_invoice(db, user, invoice_id))


@router.get(
    "/payments/invoices/{invoice_id}/pdf",
    response_class=Response,
    responses={200: {"content": {"application/pdf": {}}}},
)
async def invoice_pdf(invoice_id: uuid.UUID, db: DbSession, user: CurrentUser) -> Response:
    invoice = await _get_invoice(db, user, invoice_id)
    had_key = invoice.storage_key
    data = await invoices.ensure_invoice_pdf(db, invoice)
    if invoice.storage_key != had_key:
        await db.commit()
    filename = re.sub(r"[^A-Za-z0-9._-]+", "-", invoice.invoice_number).strip("-") or "invoice"
    return Response(
        content=data,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}.pdf"',
            "Cache-Control": "private, no-store",
        },
    )


# ----------------------------------------------------------------------------------------------- installments
@router.get("/payments/bookings/{booking_id}/installments", response_model=list[InstallmentOut])
async def list_installments(booking_id: uuid.UUID, db: DbSession, user: CurrentUser) -> list[InstallmentOut]:
    booking = await db.get(Booking, booking_id)
    if booking is None or not await policies.can_view_booking(db, user, booking):
        raise NotFound("Booking not found")
    rows = await db.execute(
        select(Installment).where(Installment.booking_id == booking_id).order_by(Installment.seq)
    )
    return [InstallmentOut.model_validate(r) for r in rows.scalars().all()]
