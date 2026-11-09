"""Background jobs of the payments module (PLAN 6.2).

* ``payments.process_refund``   send an approved refund to its gateway (retried with backoff)
* ``payments.process_webhook``  re-process a stored webhook whose inline processing failed
* ``payments.render_invoice``   render + store a receipt PDF
* ``payments.expire_orders``    periodic (5 min): ``created`` orders past ``expires_at`` -> ``expired``
* ``payments.mark_overdue``     periodic (hourly): due installments past their date -> ``overdue``
* ``payments.installment_reminders`` periodic (hourly): ``installment.due`` / ``installment.overdue`` events
"""

from __future__ import annotations

import uuid
from typing import Any

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.jobs import PermanentJobError, periodic, task
from app.models import Invoice
from app.modules.payments import invoices, service

logger = structlog.get_logger(__name__)


def _uuid(payload: dict[str, Any], key: str) -> uuid.UUID:
    try:
        return uuid.UUID(str(payload.get(key)))
    except (TypeError, ValueError) as exc:
        raise PermanentJobError(f"invalid {key}") from exc


@task("payments.process_refund", timeout_seconds=120)
async def process_refund(db: AsyncSession, payload: dict[str, Any]) -> None:
    await service.process_refund(db, _uuid(payload, "refund_id"))


@task("payments.process_webhook", timeout_seconds=120)
async def process_webhook(db: AsyncSession, payload: dict[str, Any]) -> None:
    await service.process_webhook_event(db, _uuid(payload, "webhook_event_id"))


@task("payments.render_invoice", timeout_seconds=120)
async def render_invoice(db: AsyncSession, payload: dict[str, Any]) -> None:
    invoice = await db.get(Invoice, _uuid(payload, "invoice_id"))
    if invoice is None:
        return
    await invoices.ensure_invoice_pdf(db, invoice)


@periodic("payments.expire_orders", every_seconds=300)
async def expire_orders(db: AsyncSession, payload: dict[str, Any]) -> None:
    count = await service.expire_stale_orders(db)
    if count:
        logger.info("payments.orders_expired", count=count)


@periodic("payments.mark_overdue", every_seconds=3600)
async def mark_overdue(db: AsyncSession, payload: dict[str, Any]) -> None:
    count = await service.mark_overdue_installments(db)
    if count:
        logger.info("payments.installments_overdue", count=count)


@periodic("payments.installment_reminders", every_seconds=3600)
async def installment_reminders(db: AsyncSession, payload: dict[str, Any]) -> None:
    """Publish ``installment.due`` / ``installment.overdue`` (notifications dedupe per instalment per day)."""
    count = await service.publish_installment_reminders(db)
    if count:
        logger.info("payments.installment_reminders", count=count)
