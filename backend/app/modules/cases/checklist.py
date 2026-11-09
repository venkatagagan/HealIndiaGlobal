"""Pre-arrival checklist (PLAN 8.7): created when a booking is confirmed, kept in sync with travel records.

Keys (in display order): treatment_booked, visa_approved, flight_booked, travel_insurance, airport_pickup,
accommodation_booked, documents_uploaded. Statuses derived from travel records:

* visa_approved        - a visa request is ``approved`` (done) / in progress otherwise
* flight_booked        - a ``flight`` travel booking is confirmed/completed
* airport_pickup       - an ``airport_pickup`` travel booking is confirmed/completed
* accommodation_booked - an accommodation booking is confirmed/completed
* travel_insurance     - an ``insurance`` service booking is confirmed/completed
* documents_uploaded   - passport + a medical document uploaded (done) / any document (in progress)
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import (
    ChecklistKey,
    ChecklistStatus,
    DocumentKind,
    ServiceBookingStatus,
    ServiceKind,
    TravelKind,
    VisaStatus,
)
from app.core.ids import uuid7
from app.models import (
    AccommodationBooking,
    Case,
    ChecklistItem,
    Document,
    ServiceBooking,
    TravelBooking,
    VisaRequest,
)
from app.modules.cases.common import utcnow

CHECKLIST_DEFS: tuple[tuple[ChecklistKey, str], ...] = (
    (ChecklistKey.TREATMENT_BOOKED, "Treatment booked"),
    (ChecklistKey.VISA_APPROVED, "Medical visa approved"),
    (ChecklistKey.FLIGHT_BOOKED, "Flights booked"),
    (ChecklistKey.TRAVEL_INSURANCE, "Travel insurance arranged"),
    (ChecklistKey.AIRPORT_PICKUP, "Airport pickup arranged"),
    (ChecklistKey.ACCOMMODATION_BOOKED, "Accommodation booked"),
    (ChecklistKey.DOCUMENTS_UPLOADED, "Passport and medical documents uploaded"),
)

_RANK = {ChecklistStatus.PENDING: 0, ChecklistStatus.IN_PROGRESS: 1, ChecklistStatus.DONE: 2}

_SERVICE_DONE = {ServiceBookingStatus.CONFIRMED, ServiceBookingStatus.COMPLETED}
_SERVICE_ACTIVE = {ServiceBookingStatus.REQUESTED, ServiceBookingStatus.QUOTED}
_MEDICAL_DOCS = {
    DocumentKind.MEDICAL_REPORT,
    DocumentKind.LAB_RESULT,
    DocumentKind.IMAGING,
    DocumentKind.PRESCRIPTION,
}


def _from_service_statuses(statuses: Iterable[Any]) -> ChecklistStatus:
    values = {ServiceBookingStatus(s) for s in statuses}
    if values & _SERVICE_DONE:
        return ChecklistStatus.DONE
    if values & _SERVICE_ACTIVE:
        return ChecklistStatus.IN_PROGRESS
    return ChecklistStatus.PENDING


async def derive_status(db: AsyncSession, case: Case, key: ChecklistKey) -> ChecklistStatus | None:
    """Status implied by the case's records, or ``None`` for keys that are not derived."""
    if key == ChecklistKey.TREATMENT_BOOKED:
        return ChecklistStatus.DONE
    if key == ChecklistKey.VISA_APPROVED:
        visas = {
            VisaStatus(s)
            for s in (
                await db.execute(select(VisaRequest.status).where(VisaRequest.case_id == case.id))
            ).scalars()
        }
        if VisaStatus.APPROVED in visas:
            return ChecklistStatus.DONE
        if visas - {VisaStatus.NOT_STARTED, VisaStatus.REJECTED}:
            return ChecklistStatus.IN_PROGRESS
        return ChecklistStatus.PENDING
    if key in (ChecklistKey.FLIGHT_BOOKED, ChecklistKey.AIRPORT_PICKUP):
        kind = TravelKind.FLIGHT if key == ChecklistKey.FLIGHT_BOOKED else TravelKind.AIRPORT_PICKUP
        rows = (
            await db.execute(
                select(TravelBooking.status).where(
                    TravelBooking.case_id == case.id, TravelBooking.kind == kind
                )
            )
        ).scalars()
        return _from_service_statuses(rows)
    if key == ChecklistKey.ACCOMMODATION_BOOKED:
        rows = (
            await db.execute(
                select(AccommodationBooking.status).where(AccommodationBooking.case_id == case.id)
            )
        ).scalars()
        return _from_service_statuses(rows)
    if key == ChecklistKey.TRAVEL_INSURANCE:
        rows = (
            await db.execute(
                select(ServiceBooking.status).where(
                    ServiceBooking.case_id == case.id, ServiceBooking.kind == ServiceKind.INSURANCE
                )
            )
        ).scalars()
        return _from_service_statuses(rows)
    if key == ChecklistKey.DOCUMENTS_UPLOADED:
        kinds = {
            DocumentKind(k)
            for k in (
                await db.execute(
                    select(Document.kind).where(
                        Document.deleted_at.is_(None),
                        (Document.case_id == case.id) | (Document.patient_id == case.patient_id),
                    )
                )
            ).scalars()
        }
        if DocumentKind.PASSPORT in kinds and kinds & _MEDICAL_DOCS:
            return ChecklistStatus.DONE
        if kinds & (_MEDICAL_DOCS | {DocumentKind.PASSPORT, DocumentKind.VISA}):
            return ChecklistStatus.IN_PROGRESS
        return ChecklistStatus.PENDING
    return None


async def ensure_checklist(db: AsyncSession, case: Case) -> int:
    """Create the checklist for ``case`` if missing (idempotent). Returns the number of rows inserted."""
    now = utcnow()
    rows: list[dict[str, Any]] = []
    for order, (key, label) in enumerate(CHECKLIST_DEFS):
        status = await derive_status(db, case, key) or ChecklistStatus.PENDING
        rows.append(
            {
                "id": uuid7(),
                "case_id": case.id,
                "key": key,
                "label": label,
                "status": status,
                "done_at": now if status == ChecklistStatus.DONE else None,
                "sort_order": order,
            }
        )
    stmt = (
        pg_insert(ChecklistItem)
        .values(rows)
        .on_conflict_do_nothing(index_elements=[ChecklistItem.case_id, ChecklistItem.key])
        .returning(ChecklistItem.id)
    )
    inserted = list((await db.execute(stmt)).scalars())
    return len(inserted)


def apply_status(item: ChecklistItem, status: ChecklistStatus) -> bool:
    """Set ``item.status`` (and ``done_at``). Returns True when something changed."""
    if ChecklistStatus(item.status) == status:
        return False
    item.status = status
    item.done_at = utcnow() if status == ChecklistStatus.DONE else None
    return True


async def sync_checklist_key(
    db: AsyncSession, case_id: uuid.UUID, key: ChecklistKey, *, allow_downgrade: bool = False
) -> ChecklistItem | None:
    """Re-derive one checklist item from the case's records. Upgrades only, unless ``allow_downgrade``
    (used when the record that completed the item was cancelled/rejected). No-op without a checklist."""
    item = (
        await db.execute(
            select(ChecklistItem)
            .where(ChecklistItem.case_id == case_id, ChecklistItem.key == key)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if item is None:
        return None
    case = await db.get(Case, case_id)
    if case is None:
        return None
    derived = await derive_status(db, case, key)
    if derived is None:
        return item
    current = ChecklistStatus(item.status)
    if _RANK[derived] > _RANK[current] or (allow_downgrade and _RANK[derived] < _RANK[current]):
        apply_status(item, derived)
    return item
