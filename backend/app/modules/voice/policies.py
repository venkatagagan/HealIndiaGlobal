"""Access rules for voice transcriptions (PLAN 7.2: access like screenings).

The uploader always sees their own recordings; patients see recordings about themselves; agents those of the
patients they manage/referred; staff everything. Hospitals have no access. Out-of-scope ids yield 404.
"""

from __future__ import annotations

import uuid

from sqlalchemy import ColumnElement, or_, select, true
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import is_staff
from app.core.enums import UserRole
from app.core.errors import NotFound
from app.models import PatientProfile, Screening, User
from app.models.voice import VoiceTranscription
from app.modules.screening import policies as screening_policies

ensure_can_modify = screening_policies.ensure_can_modify
resolve_patient_for_create = screening_policies.resolve_patient_for_create


async def scope_clause(db: AsyncSession, user: User) -> ColumnElement[bool]:
    if is_staff(user):
        return true()
    role = str(getattr(user.role, "value", user.role))
    conditions: list[ColumnElement[bool]] = [VoiceTranscription.user_id == user.id]
    if role == UserRole.PATIENT.value:
        own = select(PatientProfile.id).where(PatientProfile.user_id == user.id)
        conditions.append(VoiceTranscription.patient_id.in_(own))
    elif role == UserRole.AGENT.value:
        agent = await screening_policies.agent_for_user(db, user)
        if agent is not None:
            managed = select(PatientProfile.id).where(
                or_(
                    PatientProfile.managed_by_agent_id == agent.id,
                    PatientProfile.referred_by_agent_id == agent.id,
                )
            )
            conditions.append(VoiceTranscription.patient_id.in_(managed))
    elif role == UserRole.HOSPITAL.value:
        return VoiceTranscription.id.is_(None)  # never matches
    return or_(*conditions)


async def get_scoped(
    db: AsyncSession, user: User, transcription_id: uuid.UUID, *, for_update: bool = False
) -> VoiceTranscription:
    stmt = select(VoiceTranscription).where(
        VoiceTranscription.id == transcription_id, await scope_clause(db, user)
    )
    if for_update:
        stmt = stmt.with_for_update()
    row = (await db.execute(stmt)).scalar_one_or_none()
    if row is None:
        raise NotFound("Transcription not found")
    return row


async def screening_for_caller(
    db: AsyncSession, user: User, screening_id: uuid.UUID, *, for_update: bool = False
) -> tuple[Screening, PatientProfile]:
    """The screening if the caller may modify it (patient own, agent for their patients, staff), else 404."""
    if str(getattr(user.role, "value", user.role)) == UserRole.HOSPITAL.value:
        raise NotFound("Screening not found")
    return await screening_policies.get_screening_scoped(db, user, screening_id, for_update=for_update)
