"""Background jobs of the discharge module: daily medication reminders (patient opt-in) and the "your
recovery check-in is due" notification (also sent on WhatsApp to opted-in patients)."""

from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import UTC, date, datetime, timedelta
from typing import Any

import structlog
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.jobs import periodic
from app.models import AftercareCheckin, Case, DischargeSummary, MedicationReminder
from app.modules.discharge.service import resolve_tz
from app.modules.messaging import policies as mpolicies
from app.modules.messaging.notifications import notify, notify_many

logger = structlog.get_logger(__name__)

MAX_NAMES = 5


async def send_medication_reminders(db: AsyncSession, now: datetime | None = None) -> int:
    """One reminder per patient per local day, at or after their chosen hour, listing the medicines still
    in their course. Idempotent (``last_sent_on`` + notification dedupe key)."""
    now = now or datetime.now(UTC)
    today = now.date()
    rows = list(
        (
            await db.execute(
                select(MedicationReminder)
                .join(DischargeSummary, DischargeSummary.id == MedicationReminder.discharge_summary_id)
                .where(
                    MedicationReminder.enabled.is_(True),
                    DischargeSummary.superseded_at.is_(None),
                    MedicationReminder.start_on <= today + timedelta(days=1),
                    or_(
                        MedicationReminder.end_on.is_(None),
                        MedicationReminder.end_on >= today - timedelta(days=1),
                    ),
                )
                .order_by(MedicationReminder.user_id, MedicationReminder.position)
                .with_for_update(of=MedicationReminder, skip_locked=True)
            )
        )
        .scalars()
        .all()
    )
    due: dict[tuple[uuid.UUID, date], list[MedicationReminder]] = defaultdict(list)
    for r in rows:
        local = now.astimezone(resolve_tz(r.timezone))
        local_day = local.date()
        if local.hour < r.remind_hour or r.last_sent_on == local_day:
            continue
        if r.start_on > local_day or (r.end_on is not None and r.end_on < local_day):
            continue
        due[(r.user_id, local_day)].append(r)
    sent = 0
    for (user_id, local_day), items in due.items():
        names = ", ".join(i.name for i in items[:MAX_NAMES]) + (" ..." if len(items) > MAX_NAMES else "")
        n = await notify(
            db,
            user_id,
            "aftercare.medication_reminder",
            data={
                "discharge_summary_id": str(items[0].discharge_summary_id),
                "link": f"/discharge-summaries/{items[0].discharge_summary_id}",
            },
            title_key="discharge.notifications.medication_reminder.title",
            body_key="discharge.notifications.medication_reminder.body",
            params={"medicines": names, "count": len(items)},
            dedupe_key=f"medication_reminder:{user_id}:{local_day.isoformat()}",
            email=False,
        )
        for i in items:
            i.last_sent_on = local_day
        if n is not None:
            sent += 1
    await db.commit()
    return sent


@periodic("discharge.medication_reminders", every_seconds=900)
async def medication_reminders_job(db: AsyncSession, payload: dict[str, Any]) -> None:
    sent = await send_medication_reminders(db)
    if sent:
        logger.info("discharge.medication_reminders", sent=sent)


async def send_checkin_due_notifications(db: AsyncSession, now: datetime | None = None) -> int:
    """Recovery check-ins that became due in the last 24 hours and are not answered yet."""
    now = now or datetime.now(UTC)
    rows = (
        await db.execute(
            select(AftercareCheckin, Case)
            .join(Case, Case.id == AftercareCheckin.case_id)
            .where(
                AftercareCheckin.submitted_at.is_(None),
                AftercareCheckin.due_at <= now,
                AftercareCheckin.due_at > now - timedelta(hours=24),
            )
            .limit(1000)
        )
    ).all()
    sent = 0
    for checkin, case in rows:
        recipients = [
            await mpolicies.patient_user_id(db, case.patient_id),
            await mpolicies.agent_user_id(db, case.agent_id),
        ]
        created = await notify_many(
            db,
            [r for r in recipients if r is not None],
            "aftercare.checkin_due",
            data={
                "checkin_id": str(checkin.id),
                "case_id": str(case.id),
                "day": checkin.day,
                "link": "/aftercare",
            },
            title_key="discharge.notifications.checkin_due.title",
            body_key="discharge.notifications.checkin_due.body",
            params={"case_number": case.case_number, "day": checkin.day},
            dedupe_key=f"aftercare.checkin_due:{checkin.id}",
            email=False,
        )
        sent += len(created)
    await db.commit()
    return sent


# Not scheduled: ``cases.aftercare_checkin_reminders`` (cases/aftercare.py) is the single scheduled
# "check-in due" reminder; both use the same notification kind and dedupe key, so this helper stays only as a
# safe manual/backfill entry point.
