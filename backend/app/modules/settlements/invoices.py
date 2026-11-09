"""Settlement documents (backlog #27): commission tax invoices and credit notes to hospitals, commission
statements to agents. Issued when a payout is completed, from the settlement items that payout paid.

* ``commission_invoice`` (series ``HIG<FY><serial>``, e.g. ``HIG2627000001``; at most 16 characters as GST
  Rule 46 requires): platform -> hospital, the commission (C) and GST (G) of the payout's positive items. GST
  is split into CGST + SGST when the hospital's state equals the platform's registered state (setting
  ``platform_gst_state``), IGST otherwise. ``supplier_gstin`` = setting ``platform_gstin``,
  ``recipient_gstin`` = ``hospitals.gstin``, ``place_of_supply`` = the hospital's state.
* ``credit_note`` (series ``HCN<FY><serial>``): the commission and GST reversed by clawback items (refunds
  after completion) netted in the same payout; each line references the original commission invoice.
* ``agent_statement`` (series ``HAS<FY><serial>``): commission (K), withholding (TDS u/s 194H or non-resident
  withholding) and net paid per booking. GST-registered Indian agents invoice the platform themselves; GST on
  foreign agents' commission (reverse charge / intermediary) is a CA determination and is noted, not computed.

Every settlement item is documented at most once (lines carry ``item_id``), so a bounced payout whose items
are paid again in a later batch does not produce a second invoice for the same commission. Nothing here
commits. The CA must review the formats before go-live (docs/PAYMENTS.md 10.2).
"""

from __future__ import annotations

import re
import uuid
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any

import structlog
from fpdf import FPDF, FontFace
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.core.config import settings
from app.core.enums import InvoiceKind, PayeeType, SettlementItemStatus
from app.core.money import format_minor
from app.core.settings_store import get_setting
from app.models.agents import Agent
from app.models.cases import Booking
from app.models.hospitals import Hospital
from app.models.payments import Invoice
from app.models.sequences import next_number
from app.models.settlements import Payout, SettlementItem

logger = structlog.get_logger(__name__)

SETTLEMENT_DOCUMENT_KINDS = (
    InvoiceKind.COMMISSION_INVOICE,
    InvoiceKind.CREDIT_NOTE,
    InvoiceKind.AGENT_STATEMENT,
)
FOREIGN_AGENT_GST_NOTE = (
    "GST on commission paid to a non-resident agent (reverse charge on import of services, or none for an "
    "intermediary located outside India) is determined separately and is not part of this statement."
)


def _v(value: object) -> str:
    return str(getattr(value, "value", value))


async def _already_documented(db: AsyncSession, item_ids: Sequence[uuid.UUID]) -> set[str]:
    done: set[str] = set()
    for item_id in item_ids:
        hit = (
            await db.execute(
                select(Invoice.id)
                .where(
                    Invoice.kind.in_(list(SETTLEMENT_DOCUMENT_KINDS)),
                    Invoice.line_items.contains([{"item_id": str(item_id)}]),
                )
                .limit(1)
            )
        ).scalar_one_or_none()
        if hit is not None:
            done.add(str(item_id))
    return done


async def _booking_numbers(db: AsyncSession, ids: set[uuid.UUID]) -> dict[uuid.UUID, str]:
    if not ids:
        return {}
    rows = (await db.execute(select(Booking.id, Booking.booking_number).where(Booking.id.in_(ids)))).all()
    return {bid: number for bid, number in rows}


def _gst_split(tax: int, intra_state: bool) -> list[tuple[str, int]]:
    if tax == 0:
        return []
    if intra_state:
        cgst = tax // 2
        return [("CGST", cgst), ("SGST", tax - cgst)]
    return [("IGST", tax)]


async def _original_invoice_number(
    db: AsyncSession, hospital_id: uuid.UUID, booking_id: uuid.UUID
) -> str | None:
    return (
        await db.execute(
            select(Invoice.invoice_number)
            .where(
                Invoice.kind == InvoiceKind.COMMISSION_INVOICE,
                Invoice.hospital_id == hospital_id,
                Invoice.line_items.contains([{"booking_id": str(booking_id)}]),
            )
            .order_by(Invoice.issued_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


async def _hospital_documents(
    db: AsyncSession, payout: Payout, items: list[SettlementItem], numbers: dict[uuid.UUID, str]
) -> list[Invoice]:
    hospital = await db.get(Hospital, payout.payee_id)
    platform_state = await get_setting(db, "platform_gst_state", None)
    platform_gstin = await get_setting(db, "platform_gstin", None)
    hospital_state = (hospital.state or "").strip() if hospital else ""
    intra = bool(
        platform_state and hospital_state and str(platform_state).strip().lower() == hospital_state.lower()
    )
    gst_label = "CGST+SGST" if intra else "IGST"
    out: list[Invoice] = []
    for kind, sign in ((InvoiceKind.COMMISSION_INVOICE, 1), (InvoiceKind.CREDIT_NOTE, -1)):
        chosen = [i for i in items if (int(i.commission_minor) * sign > 0 or int(i.tax_minor) * sign > 0)]
        if not chosen:
            continue
        lines: list[dict[str, Any]] = []
        subtotal = tax = 0
        for item in chosen:
            commission, gst = int(item.commission_minor) * sign, int(item.tax_minor) * sign
            subtotal += commission
            tax += gst
            booking_number = numbers.get(item.booking_id, str(item.booking_id))
            line: dict[str, Any] = {
                "item_id": str(item.id),
                "booking_id": str(item.booking_id),
                "booking_number": booking_number,
                "description": (
                    f"Platform commission - booking {booking_number}"
                    if sign > 0
                    else f"Commission reversal (refund after completion) - booking {booking_number}"
                ),
                "sac": "998599",  # other support services (CA to confirm the SAC)
                "taxable_minor": commission,
                "gst_minor": gst,
                "gst_split": [{"tax": n, "amount_minor": a} for n, a in _gst_split(gst, intra)],
                "amount_minor": commission + gst,
                "currency": "INR",
            }
            if sign < 0:
                line["original_invoice_number"] = await _original_invoice_number(
                    db, payout.payee_id, item.booking_id
                )
            lines.append(line)
        invoice = Invoice(
            invoice_number=await next_number(db, "invoice" if sign > 0 else "credit_note"),
            kind=kind,
            settlement_batch_id=payout.batch_id,
            hospital_id=payout.payee_id,
            line_items=lines,
            subtotal_minor=subtotal,
            tax_minor=tax,
            total_minor=subtotal + tax,
            currency="INR",
            supplier_gstin=str(platform_gstin)[:15] if platform_gstin else None,
            recipient_gstin=hospital.gstin if hospital else None,
            place_of_supply=(f"{hospital_state} ({gst_label})" if hospital_state else gst_label)[:100],
            issued_at=datetime.now(UTC),
        )
        db.add(invoice)
        out.append(invoice)
    return out


async def _agent_statement(
    db: AsyncSession, payout: Payout, items: list[SettlementItem], numbers: dict[uuid.UUID, str]
) -> Invoice:
    agent = await db.get(Agent, payout.payee_id)
    resident = agent is None or not agent.country or agent.country.upper() == "IN"
    lines: list[dict[str, Any]] = []
    for item in items:
        booking_number = numbers.get(item.booking_id, str(item.booking_id))
        lines.append(
            {
                "item_id": str(item.id),
                "booking_id": str(item.booking_id),
                "booking_number": booking_number,
                "description": (
                    f"Agent commission - booking {booking_number}"
                    if int(item.net_minor) >= 0
                    else f"Commission clawback - booking {booking_number}"
                ),
                "commission_minor": int(item.gross_minor),
                "withholding_minor": int(item.tds_minor),
                "amount_minor": int(item.net_minor),
                "currency": "INR",
            }
        )
    if not resident:
        lines.append(
            {"description": FOREIGN_AGENT_GST_NOTE, "amount_minor": 0, "currency": "INR", "note": True}
        )
    gross = sum(int(i.gross_minor) for i in items)
    net = sum(int(i.net_minor) for i in items)
    invoice = Invoice(
        invoice_number=await next_number(db, "statement"),
        kind=InvoiceKind.AGENT_STATEMENT,
        settlement_batch_id=payout.batch_id,
        agent_id=payout.payee_id,
        issued_to_user_id=agent.user_id if agent else None,
        line_items=lines,
        subtotal_minor=max(gross, 0),
        tax_minor=0,
        total_minor=max(net, 0),
        currency="INR",
        issued_at=datetime.now(UTC),
    )
    db.add(invoice)
    return invoice


async def issue_payout_documents(db: AsyncSession, payout: Payout) -> list[Invoice]:
    """Create the commission invoice / credit note (hospital) or commission statement (agent) for a completed
    payout. Idempotent per settlement item. Returns the documents created."""
    items = list(
        (
            await db.execute(
                select(SettlementItem)
                .where(
                    SettlementItem.batch_id == payout.batch_id,
                    SettlementItem.payee_type == payout.payee_type,
                    SettlementItem.payee_id == payout.payee_id,
                    SettlementItem.status == SettlementItemStatus.PAID,
                )
                .order_by(SettlementItem.created_at, SettlementItem.id)
            )
        )
        .scalars()
        .all()
    )
    done = await _already_documented(db, [i.id for i in items])
    items = [i for i in items if str(i.id) not in done]
    if not items:
        return []
    numbers = await _booking_numbers(db, {i.booking_id for i in items})
    payee_type = _v(payout.payee_type)
    if payee_type == PayeeType.HOSPITAL.value:
        created = await _hospital_documents(db, payout, items, numbers)
    elif payee_type == PayeeType.AGENT.value:
        created = [await _agent_statement(db, payout, items, numbers)]
    else:
        created = []
    await db.flush()
    if created:
        logger.info(
            "settlements.documents_issued",
            payout_id=str(payout.id),
            documents=[f"{_v(d.kind)}:{d.invoice_number}" for d in created],
        )
    return created


# ----------------------------------------------------------------------------------------------- PDF
def _latin1(text: Any) -> str:
    return str(text if text is not None else "").encode("latin-1", "replace").decode("latin-1")


def _money(amount_minor: int) -> str:
    value = int(amount_minor)
    number = re.sub(r"^[^\d]+", "", format_minor(abs(value), "INR"))
    return _latin1(f"{'-' if value < 0 else ''}INR {number}")


_TAX_HEADS = ("CGST", "SGST", "IGST")


def line_tax_split(line: dict[str, Any]) -> dict[str, int]:
    """GST per head (CGST/SGST/IGST) of a commission invoice / credit note line."""
    split: dict[str, int] = {}
    for part in line.get("gst_split") or []:
        if isinstance(part, dict) and part.get("tax"):
            split[str(part["tax"])] = split.get(str(part["tax"]), 0) + int(part.get("amount_minor") or 0)
    return split


def document_tax_heads(line_items: Sequence[dict[str, Any]] | None) -> list[str]:
    """The GST heads used by a document's lines, in CGST, SGST, IGST order (empty when no GST)."""
    used = {head for line in line_items or [] if not line.get("note") for head in line_tax_split(line)}
    return [h for h in _TAX_HEADS if h in used] + sorted(used - set(_TAX_HEADS))


_TITLES = {
    InvoiceKind.COMMISSION_INVOICE.value: "Tax Invoice - Platform Commission",
    InvoiceKind.CREDIT_NOTE.value: "Credit Note - Platform Commission",
    InvoiceKind.AGENT_STATEMENT.value: "Agent Commission Statement",
}


def render_settlement_document_pdf(invoice: Invoice, payee_name: str, batch_number: str | None) -> bytes:
    kind = _v(invoice.kind)
    pdf = FPDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()
    pdf.set_title(_latin1(f"{_TITLES.get(kind, 'Document')} {invoice.invoice_number}"))
    pdf.set_author(_latin1(settings.APP_NAME))
    pdf.set_font("Helvetica", "B", 18)
    pdf.cell(0, 10, _latin1(settings.APP_NAME), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 8, _latin1(_TITLES.get(kind, "Document")), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    rows = [
        ("Number", invoice.invoice_number),
        ("Date", invoice.issued_at.strftime("%d %b %Y")),
        ("Issued to", payee_name),
        ("Settlement batch", batch_number or "-"),
    ]
    if kind != InvoiceKind.AGENT_STATEMENT.value:
        rows += [
            ("Supplier GSTIN", invoice.supplier_gstin or "-"),
            ("Recipient GSTIN", invoice.recipient_gstin or "-"),
            ("Place of supply", invoice.place_of_supply or "-"),
        ]
    for label, value in rows:
        pdf.set_font("Helvetica", "B", 10)
        pdf.cell(45, 6, _latin1(label))
        pdf.set_font("Helvetica", "", 10)
        pdf.multi_cell(0, 6, _latin1(value), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)
    pdf.set_font("Helvetica", "", 9)
    lines = [line for line in invoice.line_items or [] if not line.get("note")]
    statement = kind == InvoiceKind.AGENT_STATEMENT.value
    taxes = [] if statement else document_tax_heads(invoice.line_items)
    columns: list[tuple[str, float]]
    if statement:
        columns = [("Description", 85), ("Commission", 35), ("Withholding", 35), ("Net", 35)]
    else:
        # same columns as the finance portal: SAC, taxable value, one column per GST head, line total
        columns = [("Description", 58), ("SAC", 18), ("Taxable", 30)]
        columns += [(head, 26) for head in taxes] if taxes else [("GST", 26)]
        columns.append(("Total", 190 - sum(w for _, w in columns)))
    rows: list[list[str]] = [[title for title, _ in columns]]
    for line in lines:
        description = str(line.get("description", ""))
        if line.get("original_invoice_number"):
            description += f" (against {line['original_invoice_number']})"
        cells: list[str]
        if statement:
            amounts = [
                line.get("commission_minor", 0),
                line.get("withholding_minor", 0),
                line.get("amount_minor", 0),
            ]
            cells = [_money(int(a)) for a in amounts]
        else:
            split = line_tax_split(line)
            tax_cells = [_money(split.get(head, 0)) for head in taxes] if taxes else [_money(0)]
            cells = [
                _latin1(line.get("sac") or line.get("hsn_sac") or "-"),
                _money(int(line.get("taxable_minor", 0))),
                *tax_cells,
                _money(int(line.get("amount_minor", 0))),
            ]
        rows.append([_latin1(description), *cells])
    with pdf.table(
        col_widths=tuple(w for _, w in columns),
        text_align=tuple("LEFT" if i == 0 else "RIGHT" for i in range(len(columns))),
        line_height=5,
        headings_style=FontFace(emphasis="BOLD", fill_color=(240, 244, 248)),
    ) as table:
        for values in rows:
            row = table.row()
            for value in values:
                row.cell(value)
    pdf.set_font("Helvetica", "B", 10)
    if statement:
        totals = [("Commission", int(invoice.subtotal_minor)), ("Net paid", int(invoice.total_minor))]
    else:
        tax_totals: dict[str, int] = {}
        for line in lines:
            for head, amount in line_tax_split(line).items():
                tax_totals[head] = tax_totals.get(head, 0) + amount
        totals = [("Taxable value", int(invoice.subtotal_minor))]
        totals += (
            [(head, tax_totals.get(head, 0)) for head in taxes]
            if taxes
            else [("GST", int(invoice.tax_minor))]
        )
        totals.append(("Total", int(invoice.total_minor)))
    label_width = 190 - columns[-1][1]
    for label, amount in totals:
        pdf.cell(label_width, 7, label, border=1, align="R")
        pdf.cell(columns[-1][1], 7, _money(amount), border=1, align="R", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(6)
    pdf.set_font("Helvetica", "", 8)
    notes = [str(line.get("description")) for line in invoice.line_items or [] if line.get("note")]
    notes.append("Computer-generated document. Amounts in INR.")
    pdf.multi_cell(0, 4, _latin1(" ".join(notes)))
    return bytes(pdf.output())


async def document_pdf(db: AsyncSession, invoice: Invoice) -> bytes:
    from app.modules.settlements.service import payee_names

    if invoice.hospital_id is not None:
        key = (PayeeType.HOSPITAL.value, invoice.hospital_id)
    else:
        key = (PayeeType.AGENT.value, invoice.agent_id)
    names = await payee_names(db, {key}) if key[1] is not None else {}
    batch_number: str | None = None
    if invoice.settlement_batch_id is not None:
        from app.models.settlements import SettlementBatch

        batch = await db.get(SettlementBatch, invoice.settlement_batch_id)
        batch_number = batch.batch_number if batch else None
    return await run_in_threadpool(
        render_settlement_document_pdf, invoice, names.get(key) or "-", batch_number
    )


async def serialize_documents(db: AsyncSession, invoices: Sequence[Invoice]) -> list[Any]:
    """``SettlementDocumentOut`` rows with ``payee_name`` (hospital name / agency name)."""
    from app.modules.settlements.schemas import SettlementDocumentOut
    from app.modules.settlements.service import payee_names

    def _key(inv: Invoice) -> tuple[str, uuid.UUID] | None:
        if inv.hospital_id is not None:
            return (PayeeType.HOSPITAL.value, inv.hospital_id)
        if inv.agent_id is not None:
            return (PayeeType.AGENT.value, inv.agent_id)
        return None

    keys = {k for k in (_key(inv) for inv in invoices) if k is not None}
    names = await payee_names(db, keys) if keys else {}
    out: list[Any] = []
    for inv in invoices:
        model = SettlementDocumentOut.model_validate(inv)
        key = _key(inv)
        model.payee_name = names.get(key) if key else None
        out.append(model)
    return out
