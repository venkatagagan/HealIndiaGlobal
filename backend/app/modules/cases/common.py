"""Small shared helpers for the cases and travel modules: clocks, case parties and realtime pushes."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.jobs import enqueue
from app.models import Agent, Case, HospitalMember, PatientProfile
from app.models.sequences import IST

REALTIME_TASK = "cases.realtime_push"


class CancellationInitiator(StrEnum):
    """Who cancelled a booking. Only ``patient`` cancellations apply the refund tiers; hospital- and
    platform-initiated cancellations refund 100% of the net amount paid (INTEGRATION_BACKLOG #6)."""

    PATIENT = "patient"
    HOSPITAL = "hospital"
    PLATFORM = "platform"


def utcnow() -> datetime:
    return datetime.now(UTC)


def today_ist() -> date:
    """Calendar date in India (admission dates, visa dates and refund windows are Indian dates)."""
    return datetime.now(IST).date()


def like_pattern(q: str) -> str:
    escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


async def patient_user_id(db: AsyncSession, patient_id: uuid.UUID) -> uuid.UUID | None:
    return (
        await db.execute(select(PatientProfile.user_id).where(PatientProfile.id == patient_id))
    ).scalar_one_or_none()


async def case_party_user_ids(db: AsyncSession, case: Case) -> list[uuid.UUID]:
    """Patient user, the case agent's user, hospital members and the coordinator (deduplicated)."""
    ids: list[uuid.UUID] = []
    pid = await patient_user_id(db, case.patient_id)
    if pid:
        ids.append(pid)
    if case.agent_id:
        aid = (await db.execute(select(Agent.user_id).where(Agent.id == case.agent_id))).scalar_one_or_none()
        if aid:
            ids.append(aid)
    members = (
        await db.execute(select(HospitalMember.user_id).where(HospitalMember.hospital_id == case.hospital_id))
    ).scalars()
    ids.extend(members)
    if case.coordinator_user_id:
        ids.append(case.coordinator_user_id)
    return list(dict.fromkeys(ids))


async def queue_case_push(db: AsyncSession, case: Case, event_type: str, data: dict[str, Any]) -> None:
    """Enqueue a websocket push (``{type, data}``) to every party of ``case``; delivered after commit."""
    users = await case_party_user_ids(db, case)
    if not users:
        return
    await enqueue(
        db,
        REALTIME_TASK,
        {"user_ids": [str(u) for u in users], "type": event_type, "data": data},
        max_attempts=2,
    )
