"""Event handlers of the discharge module."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.events import subscribe
from app.models import Case, PatientProfile
from app.modules.documents import policies as doc_policies
from app.modules.messaging import policies as mpolicies
from app.modules.messaging.notifications import notify_many


def _uuid(payload: dict[str, Any], key: str) -> uuid.UUID | None:
    try:
        return uuid.UUID(str(payload[key]))
    except (KeyError, ValueError, TypeError):
        return None


@subscribe("discharge_summary.finalized")
async def on_discharge_summary_finalized(db: AsyncSession, payload: dict[str, Any]) -> None:
    """Tell the patient (and their agent, when the patient lets the agent see documents) that the discharge
    summary is ready. The text never contains the diagnosis."""
    summary_id = _uuid(payload, "discharge_summary_id")
    case_id = _uuid(payload, "case_id")
    case = await db.get(Case, case_id) if case_id else None
    if summary_id is None or case is None:
        return
    recipients = [await mpolicies.patient_user_id(db, case.patient_id)]
    if case.agent_id is not None:
        consented = (
            await db.execute(
                doc_policies.agent_consented_patients().where(PatientProfile.id == case.patient_id)
            )
        ).scalar_one_or_none()
        if consented is not None:
            recipients.append(await mpolicies.agent_user_id(db, case.agent_id))
    version = int(payload.get("version") or 1)
    await notify_many(
        db,
        [r for r in recipients if r is not None],
        "discharge_summary.finalized",
        data={
            "discharge_summary_id": str(summary_id),
            "case_id": str(case.id),
            "document_id": payload.get("document_id"),
            "link": f"/discharge-summaries/{summary_id}",
        },
        title_key="discharge.notifications.finalized.title",
        body_key=[
            "discharge.notifications.finalized.body",
            "discharge.notifications.finalized.updated" if version > 1 else None,
            "discharge.notifications.finalized.share_hint",
        ],
        params={"case_number": case.case_number, "version": version},
        dedupe_key=f"discharge_summary.finalized:{summary_id}",
        email=True,
    )
