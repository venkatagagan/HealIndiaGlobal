"""Case and booking state machines (PLAN section 5).

Case:    enquiry -> quoted -> accepted -> booked -> in_treatment -> completed
         enquiry -> accepted          (a treatment package was booked directly, without a quote)
         enquiry|quoted|accepted|booked -> cancelled ;  enquiry|quoted -> declined
Booking: pending_payment -> confirmed -> admitted -> completed ; pending_payment|confirmed -> cancelled

Every case transition inserts ``case_status_history``, writes an audit row, publishes ``case.status_changed``
and queues a ``case.updated`` websocket push. The caller commits.
"""

from __future__ import annotations

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit_log
from app.core.enums import BookingStatus, CaseStatus
from app.core.errors import BadRequest
from app.core.events import publish
from app.models import Case, CaseStatusHistory, User
from app.modules.cases.common import queue_case_push, utcnow

CASE_TRANSITIONS: dict[CaseStatus, frozenset[CaseStatus]] = {
    CaseStatus.ENQUIRY: frozenset(
        {CaseStatus.QUOTED, CaseStatus.ACCEPTED, CaseStatus.CANCELLED, CaseStatus.DECLINED}
    ),
    CaseStatus.QUOTED: frozenset({CaseStatus.ACCEPTED, CaseStatus.CANCELLED, CaseStatus.DECLINED}),
    CaseStatus.ACCEPTED: frozenset({CaseStatus.BOOKED, CaseStatus.CANCELLED}),
    CaseStatus.BOOKED: frozenset({CaseStatus.IN_TREATMENT, CaseStatus.CANCELLED}),
    CaseStatus.IN_TREATMENT: frozenset({CaseStatus.COMPLETED}),
    CaseStatus.COMPLETED: frozenset(),
    CaseStatus.CANCELLED: frozenset(),
    CaseStatus.DECLINED: frozenset(),
}

CLOSED_CASE_STATUSES: frozenset[CaseStatus] = frozenset(
    {CaseStatus.COMPLETED, CaseStatus.CANCELLED, CaseStatus.DECLINED}
)
CANCELLABLE_CASE_STATUSES: frozenset[CaseStatus] = frozenset(
    {CaseStatus.ENQUIRY, CaseStatus.QUOTED, CaseStatus.ACCEPTED, CaseStatus.BOOKED}
)

BOOKING_TRANSITIONS: dict[BookingStatus, frozenset[BookingStatus]] = {
    BookingStatus.PENDING_PAYMENT: frozenset({BookingStatus.CONFIRMED, BookingStatus.CANCELLED}),
    BookingStatus.CONFIRMED: frozenset({BookingStatus.ADMITTED, BookingStatus.CANCELLED}),
    BookingStatus.ADMITTED: frozenset({BookingStatus.COMPLETED}),
    BookingStatus.COMPLETED: frozenset(),
    BookingStatus.CANCELLED: frozenset(),
}


def can_transition_case(from_status: CaseStatus, to_status: CaseStatus) -> bool:
    return to_status in CASE_TRANSITIONS.get(CaseStatus(from_status), frozenset())


def ensure_booking_transition(from_status: BookingStatus, to_status: BookingStatus) -> None:
    if to_status not in BOOKING_TRANSITIONS.get(BookingStatus(from_status), frozenset()):
        raise BadRequest(
            f"A {BookingStatus(from_status).value} booking cannot become {to_status.value}",
            code="invalid_transition",
            details={"from_status": BookingStatus(from_status).value, "to_status": to_status.value},
        )


async def transition_case(
    db: AsyncSession,
    case: Case,
    to_status: CaseStatus,
    *,
    actor: User | None,
    note: str | None = None,
    request: Request | None = None,
) -> None:
    """Move ``case`` to ``to_status`` (validated against the state machine). The caller commits."""
    from_status = CaseStatus(case.status)
    if not can_transition_case(from_status, to_status):
        raise BadRequest(
            f"A case in status {from_status.value} cannot move to {to_status.value}",
            code="invalid_transition",
            details={"from_status": from_status.value, "to_status": to_status.value},
        )
    case.status = to_status
    if to_status in CLOSED_CASE_STATUSES:
        case.closed_at = utcnow()
    db.add(
        CaseStatusHistory(
            case_id=case.id,
            from_status=from_status,
            to_status=to_status,
            changed_by_user_id=actor.id if actor is not None else None,
            note=note,
        )
    )
    await audit_log(
        db,
        actor=actor,
        action="case.status_change",
        entity_type="case",
        entity_id=case.id,
        before={"status": from_status.value},
        after={"status": to_status.value, "note": note},
        request=request,
    )
    await publish(
        db,
        "case.status_changed",
        {
            "case_id": str(case.id),
            "from_status": from_status.value,
            "to_status": to_status.value,
            "changed_by_user_id": str(actor.id) if actor is not None else None,
            "note": note,
        },
    )
    await queue_case_push(
        db,
        case,
        "case.updated",
        {"case_id": str(case.id), "status": to_status.value, "from_status": from_status.value},
    )
