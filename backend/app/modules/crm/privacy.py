"""Data-rights hooks for CRM leads that became patients (called by app.modules.privacy)."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.crm import AgentLead, AgentLeadActivity


async def export_for_patient(db: AsyncSession, patient_id: uuid.UUID, serialize: Any) -> list[dict[str, Any]]:
    """The lead record(s) an agency kept about the person before they became a patient, with the timeline."""
    leads = (
        (await db.execute(select(AgentLead).where(AgentLead.converted_patient_id == patient_id)))
        .scalars()
        .all()
    )
    out = []
    for lead in leads:
        activities = (
            (
                await db.execute(
                    select(AgentLeadActivity)
                    .where(AgentLeadActivity.lead_id == lead.id)
                    .order_by(AgentLeadActivity.occurred_at)
                )
            )
            .scalars()
            .all()
        )
        out.append(
            {
                **serialize(
                    lead, exclude=("email_fingerprint", "phone_fingerprint", "follow_up_reminded_on")
                ),
                "activities": [serialize(a) for a in activities],
            }
        )
    return out


async def erase_for_patient(db: AsyncSession, patient_id: uuid.UUID) -> int:
    """Delete the converted lead(s) and their timeline (the agency keeps the managed-patient link only)."""
    result = await db.execute(
        delete(AgentLead)
        .where(AgentLead.converted_patient_id == patient_id)
        .execution_options(synchronize_session=False)
    )
    return int(getattr(result, "rowcount", 0) or 0)
