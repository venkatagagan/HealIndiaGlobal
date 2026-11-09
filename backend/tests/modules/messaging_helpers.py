"""Shared builders for the messaging and agent-portal tests."""

from __future__ import annotations

import secrets
from dataclasses import dataclass
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import DocumentKind, HospitalMemberRole
from app.models import Agent, Case, Document, Hospital, HospitalMember, PatientProfile, User
from tests.factories import create_agent, create_case, create_hospital, create_patient, create_user

API = "/api/v1"


@dataclass
class CaseWorld:
    patient_user: User
    patient: PatientProfile
    agent_user: User
    agent: Agent
    owner: User
    coordinator_member: User
    hospital: Hospital
    case: Case


async def build_case_world(db: AsyncSession, **case_fields: Any) -> CaseWorld:
    """A patient (referred and managed by an agent), a hospital with an owner and a coordinator member,
    and an ``enquiry`` case linking them."""
    agent_user = await create_user(db, role="agent")
    agent = await create_agent(db, user=agent_user)
    patient_user = await create_user(db, role="patient")
    patient = await create_patient(
        db, user=patient_user, managed_by_agent_id=agent.id, referred_by_agent_id=agent.id
    )
    owner = await create_user(db, role="hospital")
    hospital = await create_hospital(db, owner=owner)
    coordinator_member = await create_user(db, role="hospital")
    db.add(
        HospitalMember(
            hospital_id=hospital.id, user_id=coordinator_member.id, member_role=HospitalMemberRole.COORDINATOR
        )
    )
    await db.commit()
    case = await create_case(db, patient, hospital, agent_id=agent.id, **case_fields)
    return CaseWorld(
        patient_user=patient_user,
        patient=patient,
        agent_user=agent_user,
        agent=agent,
        owner=owner,
        coordinator_member=coordinator_member,
        hospital=hospital,
        case=case,
    )


async def make_document(db: AsyncSession, owner: User, **fields: Any) -> Document:
    values: dict[str, Any] = {
        "owner_user_id": owner.id,
        "kind": DocumentKind.MEDICAL_REPORT,
        "file_name": "report.pdf",
        "content_type": "application/pdf",
        "size_bytes": 1234,
        "storage_key": f"documents/2026/10/{secrets.token_hex(16)}.pdf",
        "sha256": secrets.token_hex(32),
    }
    values.update(fields)
    doc = Document(**values)
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return doc
