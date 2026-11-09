"""Content reports and moderation (CG-16; Apple 1.2, Google Play UGC policy).

* Any signed-in user can report content they can see: a chat message, an AI result (screening triage or
  document analysis) or a hospital review (``create_report``). Reporting the same target again while the
  user's earlier report is open returns that report.
* Support/admin work the queue (``list_reports``/``resolve_report``): dismiss, hide a chat message (it then
  shows only to its sender and staff), warn the author (in-app notification + email) or suspend the author's
  account (sessions revoked). Resolving closes every open report on the same target.

Blocking users is not offered: non-staff users cannot start direct conversations (only case and support
conversations exist), so there is no user-to-user channel to block; reports + moderation cover abuse in case
chats.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from fastapi import Request
from sqlalchemy import Select, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit_log
from app.core.deps import is_staff
from app.core.enums import (
    ModerationAction,
    ReportStatus,
    ReportTargetType,
    ReviewStatus,
    UserRole,
    UserStatus,
)
from app.core.errors import BadRequest, Conflict, NotFound
from app.core.pagination import Page, paginate
from app.models import (
    ContentReport,
    ConversationParticipant,
    DocumentAnalysis,
    Message,
    PatientProfile,
    RefreshToken,
    Review,
    User,
)
from app.modules.messaging import policies as messaging_policies
from app.modules.messaging.notifications import notify, notify_many
from app.modules.messaging.outbox import queue_realtime
from app.modules.messaging.schemas import (
    AdminReportOut,
    ModerationUserRef,
    ReportCreate,
    ReportOut,
    ReportResolveIn,
)
from app.modules.messaging.service import get_conversation_for_user

MODERATOR_ROLES = (UserRole.ADMIN, UserRole.SUPPORT, UserRole.SUPER_ADMIN)
EXCERPT_LENGTH = 500


def _now() -> datetime:
    return datetime.now(UTC)


def _excerpt(text: str | None) -> str | None:
    if not text:
        return None
    text = text.strip()
    return text if len(text) <= EXCERPT_LENGTH else text[: EXCERPT_LENGTH - 3] + "..."


@dataclass
class _Target:
    author_user_id: uuid.UUID | None
    excerpt: str | None
    conversation_id: uuid.UUID | None = None
    message_hidden: bool = False


async def _patient_user(db: AsyncSession, patient_id: uuid.UUID | None) -> uuid.UUID | None:
    if patient_id is None:
        return None
    return (
        await db.execute(select(PatientProfile.user_id).where(PatientProfile.id == patient_id))
    ).scalar_one_or_none()


def _screening_excerpt(ai_result: dict[str, Any] | None) -> str | None:
    result = ai_result or {}
    for key in ("summary", "patient_summary", "summary_patient", "explanation"):
        value = result.get(key)
        if isinstance(value, str) and value.strip():
            return _excerpt(value)
    return None


async def _resolve_target_for_reporter(
    db: AsyncSession, user: User, target_type: ReportTargetType, target_id: uuid.UUID
) -> _Target:
    """Load the target as ``user`` sees it (404 when it does not exist or is out of the user's scope)."""
    if target_type == ReportTargetType.MESSAGE:
        message = await db.get(Message, target_id)
        if message is None:
            raise NotFound("Message not found")
        await get_conversation_for_user(db, user, message.conversation_id)
        if message.hidden_at is not None and message.sender_user_id != user.id and not is_staff(user):
            raise NotFound("Message not found")
        if message.sender_user_id == user.id:
            raise BadRequest("You cannot report your own message", code="cannot_report_own")
        return _Target(
            author_user_id=message.sender_user_id,
            excerpt=_excerpt(message.body),
            conversation_id=message.conversation_id,
            message_hidden=message.hidden_at is not None,
        )
    if target_type == ReportTargetType.SCREENING_RESULT:
        from app.modules.screening.policies import get_screening_scoped

        screening, _profile = await get_screening_scoped(db, user, target_id)
        return _Target(author_user_id=None, excerpt=_screening_excerpt(screening.ai_result))
    if target_type == ReportTargetType.DOCUMENT_ANALYSIS:
        from app.modules.docai.service import get_analysis

        await get_analysis(db, user, target_id)  # scope check (404 when not visible)
        analysis = await db.get(DocumentAnalysis, target_id)
        if analysis is None:  # pragma: no cover - just checked
            raise NotFound("Analysis not found")
        return _Target(author_user_id=None, excerpt=_excerpt(analysis.summary_patient))
    # Reviews: published ones are public.
    review = await db.get(Review, target_id)
    if review is None or str(getattr(review.status, "value", review.status)) != ReviewStatus.PUBLISHED.value:
        raise NotFound("Review not found")
    text = " - ".join(t for t in (review.title, review.body) if t)
    return _Target(author_user_id=await _patient_user(db, review.patient_id), excerpt=_excerpt(text))


async def _target_for_moderator(db: AsyncSession, report: ContentReport) -> _Target:
    target_type = ReportTargetType(report.target_type)
    if target_type == ReportTargetType.MESSAGE:
        message = await db.get(Message, report.target_id)
        if message is None:
            return _Target(author_user_id=report.target_user_id, excerpt=None)
        return _Target(
            author_user_id=message.sender_user_id,
            excerpt=_excerpt(message.body),
            conversation_id=message.conversation_id,
            message_hidden=message.hidden_at is not None,
        )
    if target_type == ReportTargetType.SCREENING_RESULT:
        from app.models import Screening

        screening = await db.get(Screening, report.target_id)
        return _Target(None, _screening_excerpt(screening.ai_result) if screening else None)
    if target_type == ReportTargetType.DOCUMENT_ANALYSIS:
        analysis = await db.get(DocumentAnalysis, report.target_id)
        return _Target(None, _excerpt(analysis.summary_patient) if analysis else None)
    review = await db.get(Review, report.target_id)
    text = " - ".join(t for t in (review.title, review.body) if t) if review else None
    return _Target(report.target_user_id, _excerpt(text))


def report_out(report: ContentReport) -> ReportOut:
    return ReportOut(
        id=report.id,
        target_type=report.target_type,
        target_id=report.target_id,
        reason=report.reason,
        note=report.note,
        status=report.status,
        created_at=report.created_at,
    )


# ------------------------------------------------------------------------------------------------- reporting
async def create_report(
    db: AsyncSession, user: User, body: ReportCreate, request: Request | None = None
) -> ReportOut:
    target = await _resolve_target_for_reporter(db, user, body.target_type, body.target_id)
    existing = (
        await db.execute(
            select(ContentReport)
            .where(
                ContentReport.reporter_user_id == user.id,
                ContentReport.target_type == body.target_type,
                ContentReport.target_id == body.target_id,
                ContentReport.status == ReportStatus.OPEN,
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    if existing is not None:
        return report_out(existing)
    first_open = (
        await db.execute(
            select(ContentReport.id)
            .where(
                ContentReport.target_type == body.target_type,
                ContentReport.target_id == body.target_id,
                ContentReport.status == ReportStatus.OPEN,
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    now = _now()
    report = ContentReport(
        reporter_user_id=user.id,
        target_type=body.target_type,
        target_id=body.target_id,
        target_user_id=target.author_user_id,
        reason=body.reason,
        note=body.note,
        status=ReportStatus.OPEN,
        created_at=now,
        updated_at=now,
    )
    db.add(report)
    await db.flush()
    await audit_log(
        db,
        actor=user,
        action="content_report.create",
        entity_type="content_report",
        entity_id=report.id,
        after={
            "target_type": body.target_type.value,
            "target_id": str(body.target_id),
            "reason": body.reason,
        },
        request=request,
    )
    if first_open is None:
        # One queue notification per reported item (later reports on it raise its count instead).
        await notify_many(
            db,
            await messaging_policies.staff_user_ids(db, [UserRole.SUPPORT, UserRole.ADMIN]),
            "moderation.report_created",
            "New content report",
            f"A user reported a {body.target_type.value.replace('_', ' ')} ({body.reason.value}). "
            "Please review it in the moderation queue.",
            {"report_id": str(report.id), "link": f"/moderation?report={report.id}"},
            dedupe_key=f"moderation.report_created:{body.target_type.value}:{body.target_id}",
            email=False,
        )
    await db.commit()
    return report_out(report)


# ------------------------------------------------------------------------------------------------ moderation
def _ref(user: User | None) -> ModerationUserRef | None:
    if user is None:
        return None
    return ModerationUserRef(id=user.id, full_name=user.full_name or "", role=user.role, status=user.status)


async def admin_report_out(db: AsyncSession, report: ContentReport) -> AdminReportOut:
    target = await _target_for_moderator(db, report)
    ids = {
        report.reporter_user_id,
        report.target_user_id or target.author_user_id,
        report.resolved_by_user_id,
    }
    users = {
        u.id: u
        for u in (await db.execute(select(User).where(User.id.in_([i for i in ids if i])))).scalars().all()
    }
    count = (
        await db.execute(
            select(func.count())
            .select_from(ContentReport)
            .where(
                ContentReport.target_type == report.target_type,
                ContentReport.target_id == report.target_id,
                ContentReport.status == ReportStatus.OPEN,
            )
        )
    ).scalar_one()
    author_id = report.target_user_id or target.author_user_id
    return AdminReportOut(
        **report_out(report).model_dump(),
        reporter=_ref(users.get(report.reporter_user_id)) if report.reporter_user_id else None,
        target_user=_ref(users.get(author_id)) if author_id else None,
        excerpt=target.excerpt,
        conversation_id=target.conversation_id,
        message_hidden=target.message_hidden,
        report_count=max(int(count), 1),
        resolved_at=report.resolved_at,
        resolved_by=_ref(users.get(report.resolved_by_user_id)) if report.resolved_by_user_id else None,
        action=report.action,
        resolution_note=report.resolution_note,
    )


async def list_reports(
    db: AsyncSession,
    params: Any,
    *,
    status: ReportStatus | None = ReportStatus.OPEN,
    target_type: ReportTargetType | None = None,
) -> Page[AdminReportOut]:
    stmt: Select[Any] = select(ContentReport)
    if status is not None:
        stmt = stmt.where(ContentReport.status == status)
    if target_type is not None:
        stmt = stmt.where(ContentReport.target_type == target_type)
    stmt = stmt.order_by(ContentReport.created_at.desc(), ContentReport.id.desc())
    page = await paginate(db, stmt, params)
    items = [await admin_report_out(db, r) for r in page.items]
    return Page[AdminReportOut].create(items, page.total, page.page, page.page_size)


async def get_report(db: AsyncSession, report_id: uuid.UUID) -> AdminReportOut:
    report = await db.get(ContentReport, report_id)
    if report is None:
        raise NotFound("Report not found")
    return await admin_report_out(db, report)


WARNING_TITLE = "A message from the Heal India Global team"
WARNING_BODY = (
    "Our team reviewed content you posted and found that it breaks our community rules. Please keep "
    "conversations respectful and on topic. Repeated problems can lead to your account being suspended."
)


async def resolve_report(
    db: AsyncSession, actor: User, report_id: uuid.UUID, body: ReportResolveIn, request: Request | None = None
) -> AdminReportOut:
    report = (
        await db.execute(select(ContentReport).where(ContentReport.id == report_id).with_for_update())
    ).scalar_one_or_none()
    if report is None:
        raise NotFound("Report not found")
    if ReportStatus(report.status) != ReportStatus.OPEN:
        raise Conflict("This report has already been resolved", code="already_resolved")
    target = await _target_for_moderator(db, report)
    author_id = report.target_user_id or target.author_user_id
    author = await db.get(User, author_id) if author_id else None
    action = body.action
    now = _now()
    detail: dict[str, Any] = {}

    if action == ModerationAction.HIDE_MESSAGE:
        if ReportTargetType(report.target_type) != ReportTargetType.MESSAGE:
            raise BadRequest("Only chat messages can be hidden", code="invalid_action")
        message = await db.get(Message, report.target_id)
        if message is None:
            raise BadRequest("The message no longer exists", code="invalid_action")
        if message.hidden_at is None:
            message.hidden_at = now
            message.hidden_by_user_id = actor.id
        participants = list(
            (
                await db.execute(
                    select(ConversationParticipant.user_id).where(
                        ConversationParticipant.conversation_id == message.conversation_id
                    )
                )
            )
            .scalars()
            .all()
        )
        queue_realtime(
            db,
            participants,
            "message.hidden",
            {"message_id": str(message.id), "conversation_id": str(message.conversation_id)},
        )
    elif action in (ModerationAction.WARN, ModerationAction.SUSPEND):
        if author is None:
            raise BadRequest("This content has no author to act on", code="invalid_action")
        if author.is_staff:
            raise BadRequest("Staff accounts cannot be warned or suspended here", code="invalid_action")
        if action == ModerationAction.WARN:
            await notify(
                db,
                author.id,
                "moderation.warning",
                WARNING_TITLE,
                WARNING_BODY,
                {"link": "/"},
                dedupe_key=f"moderation.warning:{report.id}",
                email=True,
            )
        else:
            before_status = str(getattr(author.status, "value", author.status))
            author.status = UserStatus.SUSPENDED
            result = await db.execute(
                update(RefreshToken)
                .where(RefreshToken.user_id == author.id, RefreshToken.revoked_at.is_(None))
                .values(revoked_at=func.now())
                .execution_options(synchronize_session=False)
            )
            revoked = int(getattr(result, "rowcount", 0) or 0)
            detail = {"user_status_before": before_status, "sessions_revoked": revoked}
            await audit_log(
                db,
                actor=actor,
                action="user.status_change",
                entity_type="user",
                entity_id=author.id,
                before={"status": before_status},
                after={
                    "status": UserStatus.SUSPENDED.value,
                    "reason": "moderation",
                    "report_id": str(report.id),
                },
                request=request,
            )

    final_status = ReportStatus.DISMISSED if action == ModerationAction.DISMISS else ReportStatus.ACTIONED
    siblings = list(
        (
            await db.execute(
                select(ContentReport)
                .where(
                    ContentReport.target_type == report.target_type,
                    ContentReport.target_id == report.target_id,
                    ContentReport.status == ReportStatus.OPEN,
                )
                .with_for_update()
            )
        )
        .scalars()
        .all()
    )
    for item in {r.id: r for r in [report, *siblings]}.values():
        item.status = final_status
        item.action = action
        item.resolution_note = body.note
        item.resolved_by_user_id = actor.id
        item.resolved_at = now
    await audit_log(
        db,
        actor=actor,
        action="content_report.resolve",
        entity_type="content_report",
        entity_id=report.id,
        before={"status": ReportStatus.OPEN.value},
        after={
            "status": final_status.value,
            "action": action.value,
            "reports_closed": len(siblings) or 1,
            "target_user_id": str(author_id) if author_id else None,
            **detail,
        },
        request=request,
    )
    await db.commit()
    await db.refresh(report)
    return await admin_report_out(db, report)
