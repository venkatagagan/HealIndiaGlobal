"""Domain-event subscribers of the cases module (PLAN 6.1). Idempotent; run in the publisher's transaction."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import BookingStatus, ChecklistKey
from app.core.events import subscribe
from app.models import Booking, Document
from app.modules.cases.bookings import apply_captured_payment, apply_processed_refund, on_booking_confirmed
from app.modules.cases.checklist import sync_checklist_key


@subscribe("payment.captured")
async def on_payment_captured(db: AsyncSession, payload: dict[str, Any]) -> None:
    await apply_captured_payment(db, payload)


@subscribe("refund.processed")
async def on_refund_processed(db: AsyncSession, payload: dict[str, Any]) -> None:
    await apply_processed_refund(db, payload)


@subscribe("booking.confirmed")
async def on_confirmed_create_checklist(db: AsyncSession, payload: dict[str, Any]) -> None:
    booking_id = payload.get("booking_id")
    if booking_id:
        await on_booking_confirmed(db, uuid.UUID(str(booking_id)))


@subscribe("document.uploaded")
async def on_document_uploaded(db: AsyncSession, payload: dict[str, Any]) -> None:
    """Progress the ``documents_uploaded`` checklist item of the affected case(s)."""
    document_id = payload.get("document_id")
    if not document_id:
        return
    doc = await db.get(Document, uuid.UUID(str(document_id)))
    if doc is None:
        return
    case_ids: set[uuid.UUID] = set()
    if doc.case_id is not None:
        case_ids.add(doc.case_id)
    if doc.patient_id is not None:
        rows = await db.execute(
            select(Booking.case_id).where(
                Booking.patient_id == doc.patient_id,
                Booking.status.in_([BookingStatus.CONFIRMED, BookingStatus.ADMITTED]),
            )
        )
        case_ids.update(rows.scalars())
    for case_id in case_ids:
        await sync_checklist_key(db, case_id, ChecklistKey.DOCUMENTS_UPLOADED)
