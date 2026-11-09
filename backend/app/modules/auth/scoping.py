"""Small lookups that map a user to the tenant records they act for (patient profile, agent, hospitals).

Used by the auth, patients and documents modules for ``UserOut`` and resource scoping (PLAN 9.1).
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import HospitalMemberRole
from app.models import Agent, Hospital, HospitalMember, PatientProfile


async def patient_profile_id_for(db: AsyncSession, user_id: uuid.UUID) -> uuid.UUID | None:
    return (
        await db.execute(select(PatientProfile.id).where(PatientProfile.user_id == user_id))
    ).scalar_one_or_none()


async def agent_id_for(db: AsyncSession, user_id: uuid.UUID) -> uuid.UUID | None:
    return (await db.execute(select(Agent.id).where(Agent.user_id == user_id))).scalar_one_or_none()


async def hospital_ids_for(db: AsyncSession, user_id: uuid.UUID) -> list[uuid.UUID]:
    rows = await db.execute(
        select(HospitalMember.hospital_id)
        .where(HospitalMember.user_id == user_id)
        .order_by(HospitalMember.created_at, HospitalMember.hospital_id)
    )
    return list(rows.scalars().all())


async def hospital_memberships_for(
    db: AsyncSession, user_id: uuid.UUID
) -> list[tuple[uuid.UUID, str, str, HospitalMemberRole]]:
    """``[(hospital_id, name, slug, member_role)]`` ordered by membership age (oldest first)."""
    rows = await db.execute(
        select(Hospital.id, Hospital.name, Hospital.slug, HospitalMember.member_role)
        .join(HospitalMember, HospitalMember.hospital_id == Hospital.id)
        .where(HospitalMember.user_id == user_id)
        .order_by(HospitalMember.created_at, Hospital.id)
    )
    return [(r[0], r[1], r[2], r[3]) for r in rows.all()]
