"""Patient receipt invoices: creation on capture and PDF rendering (fpdf2) into ``app.core.storage``.

The PDF is rendered by the ``payments.render_invoice`` job right after capture and, as a fallback, on demand
by ``GET /payments/invoices/{id}/pdf`` (so a lost job or a wiped storage bucket never breaks downloads).
Core PDF fonts are Latin-1 only, so non-Latin characters are transliterated to ``?``.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import structlog
from fpdf import FPDF
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.core.config import settings
from app.core.enums import InvoiceKind, PaymentPurpose
from app.core.money import format_minor
from app.core.storage import ObjectNotFound, get_storage, make_key
from app.models import Booking, Hospital, Invoice, Payment, PaymentOrder, User
from app.models.sequences import next_number

logger = structlog.get_logger(__name__)

PURPOSE_LABELS: dict[str, str] = {
    PaymentPurpose.BOOKING_DEPOSIT.value: "Treatment booking deposit",
    PaymentPurpose.BOOKING_BALANCE.value: "Treatment balance payment",
    PaymentPurpose.BOOKING_FULL.value: "Treatment payment (full)",
    PaymentPurpose.INSTALLMENT.value: "Treatment installment",
    PaymentPurpose.CONSULTATION_FEE.value: "Tele-consultation fee",
    PaymentPurpose.SERVICE.value: "Service payment",
}


def purpose_label(purpose: Any) -> str:
    value = str(getattr(purpose, "value", purpose))
    return PURPOSE_LABELS.get(value, value.replace("_", " ").capitalize())


async def create_receipt(
    db: AsyncSession, *, order: PaymentOrder, payment: Payment, booking: Booking | None
) -> Invoice:
    """Add a ``patient_receipt`` invoice for a captured payment (no commit). Idempotent per payment."""
    existing = (
        await db.execute(
            select(Invoice).where(
                Invoice.order_id == order.id,
                Invoice.kind == InvoiceKind.PATIENT_RECEIPT,
                Invoice.line_items.contains([{"payment_id": str(payment.id)}]),
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        return existing
    description = purpose_label(order.purpose)
    if booking is not None:
        description = f"{description} - booking {booking.booking_number}"
    invoice = Invoice(
        invoice_number=await next_number(db, "invoice"),
        kind=InvoiceKind.PATIENT_RECEIPT,
        booking_id=order.booking_id,
        order_id=order.id,
        issued_to_user_id=order.payer_user_id,
        hospital_id=booking.hospital_id if booking is not None else None,
        line_items=[
            {
                "description": description[:300],
                "amount_minor": int(payment.amount_minor),
                "currency": payment.currency,
                "order_number": order.order_number,
                "payment_id": str(payment.id),
            }
        ],
        subtotal_minor=int(payment.amount_minor),
        tax_minor=0,
        total_minor=int(payment.amount_minor),
        currency=payment.currency,
        issued_at=datetime.now(UTC),
    )
    db.add(invoice)
    await db.flush()
    return invoice


# ----------------------------------------------------------------------------------------------- PDF
@dataclass(slots=True)
class ReceiptContext:
    invoice_number: str
    issued_at: datetime
    payer_name: str
    payer_email: str
    order_number: str | None
    booking_number: str | None
    hospital_name: str | None
    gateway: str | None
    payment_reference: str | None
    line_items: list[dict[str, Any]]
    subtotal_minor: int
    tax_minor: int
    total_minor: int
    currency: str


def _latin1(text: Any) -> str:
    return str(text if text is not None else "").encode("latin-1", "replace").decode("latin-1")


def _money(amount_minor: int, currency: str) -> str:
    # Core fonts cannot draw the rupee sign; prefix with the ISO code instead.
    value = int(amount_minor)
    number = re.sub(r"^[^\d]+", "", format_minor(abs(value), currency))
    return _latin1(f"{'-' if value < 0 else ''}{currency} {number}")


def render_receipt_pdf(ctx: ReceiptContext) -> bytes:
    pdf = FPDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()
    pdf.set_title(_latin1(f"Receipt {ctx.invoice_number}"))
    pdf.set_author(_latin1(settings.APP_NAME))

    pdf.set_font("Helvetica", "B", 18)
    pdf.cell(0, 10, _latin1(settings.APP_NAME), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 5, "Your Gateway to Indian Medical Excellence", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(6)

    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 8, "Payment Receipt", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    rows = [
        ("Receipt number", ctx.invoice_number),
        ("Date", ctx.issued_at.strftime("%d %b %Y %H:%M UTC")),
        ("Received from", ctx.payer_name),
        ("Email", ctx.payer_email),
        ("Order", ctx.order_number or "-"),
        ("Booking", ctx.booking_number or "-"),
        ("Hospital", ctx.hospital_name or "-"),
        ("Payment method", (ctx.gateway or "-").replace("_", " ").title()),
        ("Payment reference", ctx.payment_reference or "-"),
    ]
    for label, value in rows:
        pdf.set_font("Helvetica", "B", 10)
        pdf.cell(45, 6, _latin1(label))
        pdf.set_font("Helvetica", "", 10)
        pdf.multi_cell(0, 6, _latin1(value), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    pdf.set_font("Helvetica", "B", 10)
    pdf.set_fill_color(240, 244, 248)
    pdf.cell(130, 8, "Description", border=1, fill=True)
    pdf.cell(0, 8, "Amount", border=1, fill=True, align="R", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    for item in ctx.line_items:
        pdf.cell(130, 8, _latin1(str(item.get("description", ""))[:90]), border=1)
        pdf.cell(
            0,
            8,
            _money(int(item.get("amount_minor", 0)), str(item.get("currency") or ctx.currency)),
            border=1,
            align="R",
            new_x="LMARGIN",
            new_y="NEXT",
        )
    totals = [("Subtotal", ctx.subtotal_minor), ("Tax", ctx.tax_minor), ("Total paid", ctx.total_minor)]
    for label, amount in totals:
        pdf.set_font("Helvetica", "B" if label == "Total paid" else "", 10)
        pdf.cell(130, 8, label, border=1, align="R")
        pdf.cell(0, 8, _money(amount, ctx.currency), border=1, align="R", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(8)
    pdf.set_font("Helvetica", "", 8)
    pdf.multi_cell(
        0,
        4,
        "This is a computer-generated payment receipt and does not require a signature. Amounts are held in "
        "escrow and released to the treating hospital per the platform terms. Refunds follow the "
        "cancellation policy shown at booking.",
    )
    return bytes(pdf.output())


async def build_receipt_context(db: AsyncSession, invoice: Invoice) -> ReceiptContext:
    payer_name, payer_email = "Patient", ""
    if invoice.issued_to_user_id is not None:
        user = await db.get(User, invoice.issued_to_user_id)
        if user is not None:
            payer_name = user.full_name or payer_name
            payer_email = user.email or ""
    order = await db.get(PaymentOrder, invoice.order_id) if invoice.order_id else None
    booking = await db.get(Booking, invoice.booking_id) if invoice.booking_id else None
    hospital = await db.get(Hospital, invoice.hospital_id) if invoice.hospital_id else None
    payment_ref: str | None = None
    payment_ids = [li.get("payment_id") for li in invoice.line_items or [] if li.get("payment_id")]
    if payment_ids:
        payment = (await db.execute(select(Payment).where(Payment.id == payment_ids[0]))).scalar_one_or_none()
        if payment is not None:
            payment_ref = payment.gateway_payment_id
    return ReceiptContext(
        invoice_number=invoice.invoice_number,
        issued_at=invoice.issued_at,
        payer_name=payer_name,
        payer_email=payer_email,
        order_number=order.order_number if order else None,
        booking_number=booking.booking_number if booking else None,
        hospital_name=hospital.name if hospital else None,
        gateway=str(getattr(order.gateway, "value", order.gateway)) if order else None,
        payment_reference=payment_ref,
        line_items=list(invoice.line_items or []),
        subtotal_minor=invoice.subtotal_minor,
        tax_minor=invoice.tax_minor,
        total_minor=invoice.total_minor,
        currency=invoice.currency,
    )


async def ensure_invoice_pdf(db: AsyncSession, invoice: Invoice) -> bytes:
    """Return the stored PDF, rendering and storing it first when missing (sets ``storage_key``; the caller
    commits)."""
    storage = get_storage()
    if invoice.storage_key:
        try:
            return await storage.open(invoice.storage_key)
        except ObjectNotFound:
            logger.warning("invoice.pdf_missing", invoice_id=str(invoice.id))
    ctx = await build_receipt_context(db, invoice)
    data = await run_in_threadpool(render_receipt_pdf, ctx)
    key = invoice.storage_key or make_key("invoices", "pdf")
    await storage.save(key, data, "application/pdf")
    invoice.storage_key = key
    return data
