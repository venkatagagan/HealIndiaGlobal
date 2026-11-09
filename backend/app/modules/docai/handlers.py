"""Event handlers for document intelligence (PLAN 7.1): notify the patient when the AI reading is ready, and
the case's hospital members once the patient has confirmed it (hospitals only ever see confirmed data)."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.events import subscribe
from app.models import Case, HospitalMember, PatientProfile
from app.models.docai import DocumentAnalysis


async def _notify(db: AsyncSession, user_ids: list[uuid.UUID], key: str, data: dict[str, Any]) -> None:
    """In-app notification (+ realtime ``notification.created``) and a realtime ``document.analyzed`` event,
    both delivered after the transaction commits. ``key`` = catalog group (``<key>.title`` / ``<key>.body``),
    rendered in each recipient's language."""
    if not user_ids:
        return
    kind = "document.analyzed"
    try:
        from app.modules.messaging.outbox import queue_realtime
        from app.modules.messaging.service import notify_many
    except ImportError:  # pragma: no cover - messaging is part of the platform; realtime-only fallback
        from app.core import realtime

        await realtime.send_to_users(list(user_ids), kind, data)
        return
    dedupe = f"{kind}:{data.get('analysis_id')}:{data.get('review_status')}"
    await notify_many(
        db, user_ids, kind, data=data, dedupe_key=dedupe, title_key=f"{key}.title", body_key=f"{key}.body"
    )
    queue_realtime(db, list(user_ids), kind, data)


def _payload(analysis: DocumentAnalysis) -> dict[str, Any]:
    return {
        "analysis_id": str(analysis.id),
        "patient_id": str(analysis.patient_id),
        "case_id": str(analysis.case_id) if analysis.case_id else None,
        "status": str(analysis.status),
        "review_status": str(analysis.review_status) if analysis.review_status else None,
    }


@subscribe("document.analyzed")
async def on_document_analyzed(db: AsyncSession, payload: dict[str, Any]) -> None:
    analysis = await db.get(DocumentAnalysis, uuid.UUID(str(payload["analysis_id"])))
    if analysis is None:
        return
    profile = await db.get(PatientProfile, analysis.patient_id)
    recipients = [profile.user_id] if profile is not None else []
    if analysis.requested_by_user_id and analysis.requested_by_user_id not in recipients:
        recipients.append(analysis.requested_by_user_id)
    await _notify(
        db,
        recipients,
        "notifications.document_analyzed",
        _payload(analysis),
    )


@subscribe("document.analysis_confirmed")
async def on_analysis_confirmed(db: AsyncSession, payload: dict[str, Any]) -> None:
    analysis = await db.get(DocumentAnalysis, uuid.UUID(str(payload["analysis_id"])))
    if analysis is None or analysis.case_id is None:
        return
    members = (
        await db.execute(
            select(HospitalMember.user_id)
            .join(Case, Case.hospital_id == HospitalMember.hospital_id)
            .where(Case.id == analysis.case_id)
        )
    ).scalars()
    await _notify(
        db,
        list(dict.fromkeys(members)),
        "notifications.document_confirmed",
        _payload(analysis),
    )
