"""Retention, purge and re-encryption jobs (``@periodic``, daily). Every period is a setting
(``app/core/config``, documented in ``backend/.env.example``); 0 disables a purge. Legal holds win over
retention.

* ``privacy.purge_guests``              guest accounts unused for ``GUEST_RETENTION_DAYS`` -> erased
* ``privacy.purge_travel_ids``          passport/visa scans ``TRAVEL_ID_RETENTION_DAYS_AFTER_TRIP`` after the
                                        patient's treatment trip ended (all cases closed, one completed)
* ``privacy.purge_soft_deleted_files``  files deleted by users, kept ``SOFT_DELETED_FILE_RETENTION_DAYS``
* ``privacy.inactive_accounts``         notice ``INACTIVE_ACCOUNT_NOTICE_DAYS`` before, then erasure after
                                        ``INACTIVE_ACCOUNT_RETENTION_DAYS`` without sign-in
* ``privacy.purge_notifications``       in-app notifications older than ``NOTIFICATION_RETENTION_DAYS``
* ``privacy.reencrypt_fields``          encrypts legacy plaintext and moves values to the current key
* ``privacy.data_rights_sla``           reminds privacy staff of requests due within 3 days or overdue
* ``privacy.delete_objects`` (task)     deletes storage objects after an erasure/purge has committed
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import structlog
from sqlalchemy import Text, and_, delete, func, literal, or_, select, type_coerce, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit_log
from app.core.config import settings
from app.core.crypto import CryptoError, EncryptedJSON, EncryptedString, needs_reencrypt
from app.core.enums import CaseStatus, DocumentKind, UserRole, UserStatus
from app.core.jobs import enqueue, periodic, task
from app.core.storage import get_storage
from app.models import Case, Document, Notification, PatientProfile, User
from app.models.base import Base
from app.models.privacy import DataRightsRequest
from app.modules.privacy.erasure import DELETE_OBJECTS_TASK, enqueue_object_deletion, erase_account

logger = structlog.get_logger(__name__)

DAY = 86_400
BATCH = 200
REENCRYPT_BATCH = 500
REENCRYPT_MAX_ROWS_PER_COLUMN = 20_000
_STAFF = (UserRole.ADMIN, UserRole.FINANCE, UserRole.SUPPORT, UserRole.SUPER_ADMIN)
_CLOSED_CASE = (CaseStatus.COMPLETED, CaseStatus.CANCELLED, CaseStatus.DECLINED)


def _now() -> datetime:
    return datetime.now(UTC)


def _last_seen() -> Any:
    return func.coalesce(User.last_login_at, User.created_at)


@task(DELETE_OBJECTS_TASK)
async def delete_objects(db: AsyncSession, payload: dict[str, Any]) -> None:
    """Delete storage objects whose database rows are already gone (idempotent: missing objects are fine)."""
    storage = get_storage()
    for key in payload.get("keys") or []:
        try:
            await storage.delete(str(key))
        except ValueError:
            logger.warning("privacy.invalid_storage_key")


async def _delete_documents(db: AsyncSession, rows: list[tuple[Any, str]], reason: str) -> int:
    if not rows:
        return 0
    await db.execute(
        delete(Document)
        .where(Document.id.in_([doc_id for doc_id, _ in rows]))
        .execution_options(synchronize_session=False)
    )
    await enqueue_object_deletion(db, [key for _, key in rows], reason=reason)
    return len(rows)


def _not_on_hold() -> Any:
    """Documents whose owner, patient and case are not under legal hold."""
    held_users = select(User.id).where(User.legal_hold.is_(True))
    held_patients = select(PatientProfile.id).where(PatientProfile.user_id.in_(held_users))
    held_cases = select(Case.id).where(Case.legal_hold.is_(True))
    return and_(
        Document.owner_user_id.not_in(held_users),
        or_(Document.patient_id.is_(None), Document.patient_id.not_in(held_patients)),
        or_(Document.case_id.is_(None), Document.case_id.not_in(held_cases)),
    )


# --- guests -------------------------------------------------------------------------------------------------
@periodic("privacy.purge_guests", every_seconds=DAY)
async def purge_guests(db: AsyncSession, payload: dict[str, Any]) -> int:
    if settings.GUEST_RETENTION_DAYS <= 0:
        return 0
    cutoff = _now() - timedelta(days=settings.GUEST_RETENTION_DAYS)
    guests = (
        (
            await db.execute(
                select(User)
                .where(
                    User.is_guest.is_(True),
                    User.deleted_at.is_(None),
                    User.legal_hold.is_(False),
                    _last_seen() < cutoff,
                )
                .order_by(User.created_at)
                .limit(BATCH)
            )
        )
        .scalars()
        .all()
    )
    erased = 0
    for guest in guests:
        if await _blocked(db, guest):
            continue
        await erase_account(
            db,
            guest,
            actor=None,
            reason="guest retention period ended",
            request=None,
            trigger="guest_retention",
        )
        erased += 1
    if erased:
        logger.info("privacy.guests_purged", count=erased)
    return erased


async def _blocked(db: AsyncSession, user: User) -> bool:
    from app.modules.auth.service import _deletion_blockers  # lazy: auth imports privacy lazily

    return bool(await _deletion_blockers(db, user, str(getattr(user.role, "value", user.role))))


# --- passport / visa scans after the trip -------------------------------------------------------------------
@periodic("privacy.purge_travel_ids", every_seconds=DAY)
async def purge_travel_ids(db: AsyncSession, payload: dict[str, Any]) -> int:
    if settings.TRAVEL_ID_RETENTION_DAYS_AFTER_TRIP <= 0:
        return 0
    cutoff = _now() - timedelta(days=settings.TRAVEL_ID_RETENTION_DAYS_AFTER_TRIP)
    trip_over = (
        select(Case.patient_id)
        .group_by(Case.patient_id)
        .having(
            func.bool_and(Case.status.in_(_CLOSED_CASE)),
            func.bool_or(Case.status == CaseStatus.COMPLETED),
            func.max(func.coalesce(Case.closed_at, Case.updated_at)) < cutoff,
        )
    )
    rows = (
        await db.execute(
            select(Document.id, Document.storage_key)
            .where(
                Document.kind.in_([DocumentKind.PASSPORT, DocumentKind.VISA]),
                Document.patient_id.in_(trip_over),
                _not_on_hold(),
            )
            .limit(BATCH)
        )
    ).all()
    count = await _delete_documents(db, [(r[0], r[1]) for r in rows], "travel_id_retention")
    if count:
        await audit_log(
            db,
            actor=None,
            action="privacy.retention_purge",
            entity_type="document",
            entity_id=None,
            after={"rule": "travel_id_after_trip", "documents": count},
        )
    return count


# --- soft-deleted files -------------------------------------------------------------------------------------
@periodic("privacy.purge_soft_deleted_files", every_seconds=DAY)
async def purge_soft_deleted_files(db: AsyncSession, payload: dict[str, Any]) -> int:
    if settings.SOFT_DELETED_FILE_RETENTION_DAYS <= 0:
        return 0
    cutoff = _now() - timedelta(days=settings.SOFT_DELETED_FILE_RETENTION_DAYS)
    rows = (
        await db.execute(
            select(Document.id, Document.storage_key)
            .where(Document.deleted_at.is_not(None), Document.deleted_at < cutoff, _not_on_hold())
            .limit(BATCH * 5)
        )
    ).all()
    count = await _delete_documents(db, [(r[0], r[1]) for r in rows], "soft_deleted_retention")
    if count:
        await audit_log(
            db,
            actor=None,
            action="privacy.retention_purge",
            entity_type="document",
            entity_id=None,
            after={"rule": "soft_deleted_files", "documents": count},
        )
    return count


# --- inactive accounts --------------------------------------------------------------------------------------
@periodic("privacy.inactive_accounts", every_seconds=DAY)
async def inactive_accounts(db: AsyncSession, payload: dict[str, Any]) -> dict[str, int]:
    """Warn, then erase, accounts that have not signed in for ``INACTIVE_ACCOUNT_RETENTION_DAYS``."""
    result = {"notified": 0, "erased": 0}
    if settings.INACTIVE_ACCOUNT_RETENTION_DAYS <= 0:
        return result
    now = _now()
    notice_days = settings.INACTIVE_ACCOUNT_NOTICE_DAYS
    retention = timedelta(days=settings.INACTIVE_ACCOUNT_RETENTION_DAYS)
    base = and_(
        User.is_guest.is_(False),
        User.deleted_at.is_(None),
        User.legal_hold.is_(False),
        User.role.not_in(_STAFF),
        # suspended accounts are left to staff (they may be under investigation)
        User.status.in_([UserStatus.ACTIVE, UserStatus.PENDING_VERIFICATION]),
    )
    to_warn = (
        (
            await db.execute(
                select(User)
                .where(
                    base,
                    User.inactivity_notice_at.is_(None),
                    _last_seen() < now - retention + timedelta(days=notice_days),
                )
                .limit(BATCH)
            )
        )
        .scalars()
        .all()
    )
    from app.modules.messaging.notifications import notify

    for user in to_warn:
        user.inactivity_notice_at = now
        await notify(
            db,
            user.id,
            "privacy.inactivity_notice",
            "Your account will be deleted soon",
            f"You have not signed in for a long time. Sign in within {notice_days} days to keep your "
            "account; otherwise we will delete it and your data as described in our privacy policy.",
            {"erase_after": (now + timedelta(days=notice_days)).isoformat()},
            dedupe_key=f"inactivity:{now:%Y%m%d}",
            email=True,
        )
        result["notified"] += 1
    to_erase = (
        (
            await db.execute(
                select(User)
                .where(
                    base,
                    User.inactivity_notice_at.is_not(None),
                    User.inactivity_notice_at < now - timedelta(days=notice_days),
                    _last_seen() < now - retention,
                )
                .limit(BATCH)
            )
        )
        .scalars()
        .all()
    )
    for user in to_erase:
        if await _blocked(db, user):
            continue
        await erase_account(
            db, user, actor=None, reason="inactive account retention", request=None, trigger="inactivity"
        )
        result["erased"] += 1
    if result["notified"] or result["erased"]:
        logger.info("privacy.inactive_accounts", **result)
    return result


# --- notifications ------------------------------------------------------------------------------------------
@periodic("privacy.purge_notifications", every_seconds=DAY)
async def purge_notifications(db: AsyncSession, payload: dict[str, Any]) -> int:
    if settings.NOTIFICATION_RETENTION_DAYS <= 0:
        return 0
    cutoff = _now() - timedelta(days=settings.NOTIFICATION_RETENTION_DAYS)
    result = await db.execute(delete(Notification).where(Notification.created_at < cutoff))
    return int(getattr(result, "rowcount", 0) or 0)


# --- data-rights SLA ----------------------------------------------------------------------------------------
@periodic("privacy.data_rights_sla", every_seconds=DAY)
async def data_rights_sla(db: AsyncSession, payload: dict[str, Any]) -> int:
    from app.modules.messaging.notifications import notify_many
    from app.modules.privacy.service import OPEN_REQUEST_STATUSES, _privacy_staff_ids

    now = _now()
    due = (
        (
            await db.execute(
                select(DataRightsRequest).where(
                    DataRightsRequest.status.in_(OPEN_REQUEST_STATUSES),
                    DataRightsRequest.due_at < now + timedelta(days=3),
                )
            )
        )
        .scalars()
        .all()
    )
    if not due:
        return 0
    staff = await _privacy_staff_ids(db)
    for row in due:
        overdue = row.due_at < now
        recipients = [row.assigned_to_user_id] if row.assigned_to_user_id else staff
        await notify_many(
            db,
            recipients,
            "privacy.request_due",
            f"Data-rights request {row.reference} {'is overdue' if overdue else 'is due soon'}",
            f"Reply by {row.due_at:%d %b %Y}.",
            {"request_id": str(row.id)},
            dedupe_key=f"{row.id}:{now:%Y%m%d}",
            email=overdue,
        )
    return len(due)


# --- re-encryption (key rotation, legacy plaintext) ---------------------------------------------------------
def encrypted_columns() -> list[tuple[Any, Any]]:
    """``(table, column)`` for every application-encrypted column."""
    out = []
    for table in Base.metadata.sorted_tables:
        if "id" not in table.c:
            continue
        for column in table.c:
            if isinstance(column.type, (EncryptedString, EncryptedJSON)):
                out.append((table, column))
    return out


@periodic("privacy.reencrypt_fields", every_seconds=DAY, timeout_seconds=3600)
async def reencrypt_fields(db: AsyncSession, payload: dict[str, Any]) -> dict[str, int]:
    """Rewrite values that are plaintext (columns encrypted after the fact), legacy (no key id) or under an
    old key, using the current key. Bounded per run; returns ``{"table.column": rewritten}``."""
    summary: dict[str, int] = {}
    for table, column in encrypted_columns():
        raw = type_coerce(column, Text)
        last_id: Any = None
        done = 0
        while done < REENCRYPT_MAX_ROWS_PER_COLUMN:
            stmt = select(table.c.id, raw.label("raw")).where(column.is_not(None)).order_by(table.c.id)
            if last_id is not None:
                stmt = stmt.where(table.c.id > last_id)
            rows = (await db.execute(stmt.limit(REENCRYPT_BATCH))).all()
            if not rows:
                break
            last_id = rows[-1][0]
            for row_id, value in rows:
                if not needs_reencrypt(value):
                    continue
                try:
                    plain = column.type.process_result_value(value, None)
                except (CryptoError, ValueError) as exc:
                    logger.error(
                        "privacy.reencrypt_failed",
                        table=table.name,
                        column=column.name,
                        error=type(exc).__name__,
                    )
                    continue
                cipher = column.type.process_bind_param(plain, None)
                await db.execute(
                    update(table)
                    .where(table.c.id == row_id)
                    .values({column.name: literal(cipher, type_=Text())})
                    .execution_options(synchronize_session=False)
                )
                summary[f"{table.name}.{column.name}"] = summary.get(f"{table.name}.{column.name}", 0) + 1
            done += len(rows)
    if summary:
        logger.info("privacy.reencrypted", columns=summary)
    return summary


async def enqueue_reencrypt(db: AsyncSession) -> None:
    """Run the re-encryption now (e.g. right after a key rotation deploy)."""
    await enqueue(db, "privacy.reencrypt_fields", {}, dedupe_key="privacy.reencrypt_fields:manual")
