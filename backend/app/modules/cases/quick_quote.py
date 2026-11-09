"""Quick quote (phase 1): the 24-48 h quote promise, shared reports and multi-hospital quote requests.

* Every new case gets ``quote_due_at`` = created + ``QUOTE_SLA_HOURS``; ``send_quote`` stamps
  ``first_quote_at``. The ``cases.quote_sla`` periodic job publishes ``quote.reminder_due`` after
  ``QUOTE_REMINDER_HOURS`` without a quote and ``quote.overdue`` at the due time (each once per case).
* Reports from the screening (or listed ``document_ids``) are shared with the case's hospital through
  ``case_documents`` (patient-owned medical documents only).
* ``POST /cases/quote-request`` creates one case per hospital (up to ``QUOTE_MAX_HOSPITALS``) grouped by
  ``quote_group_id``; ``GET /cases/quote-groups/{id}`` compares the answers in the patient's currency.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import datetime, timedelta
from typing import Any

import structlog
from fastapi import Request
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.enums import CaseStatus, DocumentKind, QuoteStatus
from app.core.errors import BadRequest, NotFound
from app.core.events import publish
from app.core.ids import uuid7
from app.core.money import convert, normalize_currency
from app.models import Case, CaseDocument, Document, PatientProfile, User
from app.modules.cases import policies
from app.modules.cases.common import utcnow
from app.modules.cases.schemas import (
    CaseCreate,
    QuoteGroupCase,
    QuoteGroupOut,
    QuoteRequestCreate,
)

logger = structlog.get_logger(__name__)

#: Document kinds a patient can share with a hospital for a quote.
SHAREABLE_KINDS = frozenset(
    {
        DocumentKind.MEDICAL_REPORT,
        DocumentKind.PRESCRIPTION,
        DocumentKind.LAB_RESULT,
        DocumentKind.IMAGING,
        DocumentKind.OTHER,
    }
)


# --------------------------------------------------------------------------------------------- SLA clock
def quote_due_for(created_at: datetime) -> datetime:
    return created_at + timedelta(hours=settings.QUOTE_SLA_HOURS)


def waiting_for_quote(case: Case) -> bool:
    return CaseStatus(case.status) == CaseStatus.ENQUIRY and case.first_quote_at is None


def quote_clock(case: Case, now: datetime | None = None) -> tuple[bool, float | None]:
    """``(quote_overdue, hours_left)`` for API output. ``hours_left`` is ``None`` when no quote is awaited."""
    if case.quote_due_at is None or not waiting_for_quote(case):
        return False, None
    now = now or utcnow()
    seconds = (case.quote_due_at - now).total_seconds()
    return seconds <= 0, round(max(seconds, 0) / 3600, 1)


# --------------------------------------------------------------------------------------------- reports
async def shareable_documents(
    db: AsyncSession, patient: PatientProfile, ids: Sequence[uuid.UUID], *, strict: bool
) -> list[Document]:
    """The patient's own (non-deleted) medical documents among ``ids``. ``strict``: any other id -> 404."""
    unique = list(dict.fromkeys(ids))
    if not unique:
        return []
    rows = (
        (
            await db.execute(
                select(Document).where(
                    Document.id.in_(unique),
                    Document.deleted_at.is_(None),
                    or_(Document.patient_id == patient.id, Document.owner_user_id == patient.user_id),
                )
            )
        )
        .scalars()
        .all()
    )
    found = {d.id: d for d in rows}
    if strict:
        if any(i not in found for i in unique):
            raise NotFound("Document not found")
        if any(DocumentKind(found[i].kind) not in SHAREABLE_KINDS for i in unique):
            raise BadRequest(
                "Only medical reports, prescriptions, lab results and scans can be shared",
                code="invalid_document_kind",
            )
    return [found[i] for i in unique if i in found and DocumentKind(found[i].kind) in SHAREABLE_KINDS]


async def attach_case_documents(
    db: AsyncSession, case: Case, documents: Sequence[Document], user: User
) -> None:
    """Share ``documents`` with the case's hospital (idempotent). A document without a case is also linked
    to this case directly (its first case), and linked to the patient when it was not."""
    existing = set(
        (
            await db.execute(
                select(CaseDocument.document_id).where(
                    CaseDocument.case_id == case.id,
                    CaseDocument.document_id.in_([d.id for d in documents]),
                )
            )
        ).scalars()
    )
    for doc in documents:
        if doc.patient_id is None:
            doc.patient_id = case.patient_id
        if doc.case_id is None and case.quote_group_id is None:
            doc.case_id = case.id
        if doc.id not in existing:
            db.add(CaseDocument(case_id=case.id, document_id=doc.id, shared_by_user_id=user.id))
    await db.flush()


async def shared_document_ids(db: AsyncSession, case_id: uuid.UUID) -> list[uuid.UUID]:
    return list(
        (
            await db.execute(
                select(CaseDocument.document_id)
                .where(CaseDocument.case_id == case_id)
                .order_by(CaseDocument.created_at, CaseDocument.id)
            )
        ).scalars()
    )


# --------------------------------------------------------------------------------------------- multi-hospital
async def create_quote_request(
    db: AsyncSession, user: User, body: QuoteRequestCreate, request: Request | None = None
) -> uuid.UUID:
    """One enquiry per hospital, grouped by a new ``quote_group_id``. All or nothing."""
    from app.modules.cases.service import build_case, resolve_case_patient

    if len(body.hospital_ids) > settings.QUOTE_MAX_HOSPITALS:
        raise BadRequest(
            f"You can ask up to {settings.QUOTE_MAX_HOSPITALS} hospitals at once",
            code="too_many_hospitals",
            details={"max_hospitals": settings.QUOTE_MAX_HOSPITALS},
        )
    if body.procedure_id is None and body.specialty_id is None and body.screening_id is None:
        raise BadRequest(
            "Choose a procedure or specialty (or attach a screening) for the quote",
            code="procedure_required",
        )
    patient, agent_id = await resolve_case_patient(db, user, body.patient_id)
    group_id = uuid7()
    for hospital_id in body.hospital_ids:
        await build_case(
            db,
            user,
            patient,
            agent_id,
            CaseCreate(
                hospital_id=hospital_id,
                procedure_id=body.procedure_id,
                specialty_id=body.specialty_id,
                screening_id=body.screening_id,
                patient_notes=body.notes,
                patient_id=patient.id,
                consent_share=body.consent_share,
                document_ids=list(body.document_ids),
            ),
            request,
            quote_group_id=group_id,
        )
    await publish(
        db,
        "quote.requested",
        {
            "quote_group_id": str(group_id),
            "patient_id": str(patient.id),
            "hospital_ids": [str(h) for h in body.hospital_ids],
        },
    )
    await db.commit()
    return group_id


async def _patient_currency(patient: PatientProfile) -> str:
    try:
        return normalize_currency(patient.preferred_currency or "INR")
    except ValueError:
        return "INR"


async def quote_group_out(db: AsyncSession, user: User, group_id: uuid.UUID) -> QuoteGroupOut:
    from app.modules.cases.serializers import case_outs

    cases = list(
        (
            await db.execute(
                policies.scope_cases(select(Case), user)
                .where(Case.quote_group_id == group_id)
                .order_by(Case.created_at, Case.id)
            )
        ).scalars()
    )
    if not cases:
        raise NotFound("Quote request not found")
    outs = await case_outs(db, cases)
    patient = await db.get(PatientProfile, cases[0].patient_id)
    currency = await _patient_currency(patient) if patient is not None else "INR"
    rows: list[QuoteGroupCase] = []
    for out in outs:
        quote = out.latest_quote
        if quote is not None and quote.status in (QuoteStatus.WITHDRAWN, QuoteStatus.DRAFT):
            quote = None
        converted: int | None = None
        if quote is not None:
            converted = await _convert(db, quote.total_minor, quote.currency, currency)
        rows.append(
            QuoteGroupCase(
                case_id=out.id,
                case_number=out.case_number,
                status=out.status,
                hospital=out.hospital,
                doctor=out.doctor,
                quote_due_at=out.quote_due_at,
                quote_overdue=out.quote_overdue,
                hours_left=out.hours_left,
                quote=quote,
                total_in_currency_minor=converted,
            )
        )
    if any(r.quote is not None and r.total_in_currency_minor is None for r in rows):
        # Rates missing for the patient's currency: compare in INR instead.
        currency = "INR"
        for r in rows:
            if r.quote is not None:
                r.total_in_currency_minor = await _convert(db, r.quote.total_minor, r.quote.currency, "INR")
    priced = [r for r in rows if r.quote is not None and r.total_in_currency_minor is not None]
    cheapest = min(priced, key=lambda r: r.total_in_currency_minor or 0).case_id if priced else None
    first = outs[0]
    return QuoteGroupOut(
        quote_group_id=group_id,
        patient=first.patient,
        procedure=first.procedure,
        specialty=first.specialty,
        currency=currency,
        created_at=first.created_at,
        cases=rows,
        cheapest_case_id=cheapest,
    )


async def _convert(db: AsyncSession, amount_minor: int, from_ccy: str, to_ccy: str) -> int | None:
    try:
        converted, _ = await convert(db, amount_minor, from_ccy, to_ccy)
    except Exception as exc:  # unknown currency or no FX rate: the caller falls back to INR
        logger.info("quote_group.convert_failed", from_ccy=from_ccy, to_ccy=to_ccy, error=str(exc))
        return None
    return converted


# --------------------------------------------------------------------------------------------- SLA job
async def run_quote_sla(db: AsyncSession, now: datetime | None = None) -> dict[str, int]:
    """Publish ``quote.reminder_due`` / ``quote.overdue`` for enquiries still waiting for a quote (each at
    most once per case; the ``*_sent_at`` stamps are written in the same transaction as the events)."""
    now = now or utcnow()
    counts = {"reminders": 0, "overdue": 0}
    waiting = (
        Case.status == CaseStatus.ENQUIRY,
        Case.first_quote_at.is_(None),
        Case.quote_due_at.is_not(None),
    )
    reminder_after = timedelta(hours=settings.QUOTE_REMINDER_HOURS)
    due_soon = list(
        (
            await db.execute(
                select(Case)
                .where(
                    *waiting,
                    Case.quote_reminder_sent_at.is_(None),
                    Case.created_at <= now - reminder_after,
                    Case.quote_due_at > now,
                )
                .order_by(Case.quote_due_at)
                .limit(500)
                .with_for_update(skip_locked=True)
            )
        ).scalars()
    )
    for case in due_soon:
        case.quote_reminder_sent_at = now
        await publish(db, "quote.reminder_due", _sla_payload(case, now))
        counts["reminders"] += 1
    overdue = list(
        (
            await db.execute(
                select(Case)
                .where(*waiting, Case.quote_overdue_sent_at.is_(None), Case.quote_due_at <= now)
                .order_by(Case.quote_due_at)
                .limit(500)
                .with_for_update(skip_locked=True)
            )
        ).scalars()
    )
    for case in overdue:
        case.quote_overdue_sent_at = now
        if case.quote_reminder_sent_at is None:
            case.quote_reminder_sent_at = now  # never send a "due soon" reminder after the deadline
        await publish(db, "quote.overdue", _sla_payload(case, now))
        counts["overdue"] += 1
    return counts


def _sla_payload(case: Case, now: datetime) -> dict[str, Any]:
    due = case.quote_due_at or now
    return {
        "case_id": str(case.id),
        "case_number": case.case_number,
        "hospital_id": str(case.hospital_id),
        "patient_id": str(case.patient_id),
        "coordinator_user_id": str(case.coordinator_user_id) if case.coordinator_user_id else None,
        "quote_due_at": due.isoformat(),
        "hours_left": round(max((due - now).total_seconds(), 0) / 3600, 1),
    }
