"""Data export (GDPR Art. 15/20 access and portability, DPDP s.11 right to information): everything about the
requesting user as machine-readable JSON, optionally zipped together with their uploaded files.

Rows are serialised generically from the models (every column) minus :data:`EXCLUDED_COLUMNS` (credentials,
token hashes, storage keys, raw gateway payloads and staff-only notes), so new columns are exported by
default. Encrypted columns are exported decrypted - it is the person's own data.
"""

from __future__ import annotations

import io
import json
import re
import uuid
import zipfile
from collections.abc import Iterable, Sequence
from datetime import UTC, datetime
from typing import Any

import structlog
from fastapi.encoders import jsonable_encoder
from sqlalchemy import inspect as sa_inspect
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import PHI_ACTIONS, audit_log
from app.core.config import settings
from app.core.storage import ObjectNotFound, get_storage
from app.models import (
    Agent,
    AuditLog,
    Booking,
    Case,
    CaseStatusHistory,
    ChecklistItem,
    Consent,
    Consultation,
    DeviceToken,
    Document,
    DocumentAnalysis,
    HospitalMember,
    Installment,
    Invoice,
    ItineraryItem,
    Message,
    Notification,
    PatientCompanion,
    PatientProfile,
    Payment,
    PaymentOrder,
    Quote,
    Refund,
    SavedItem,
    Screening,
    ScreeningMatch,
    SosAlert,
    TravelBooking,
    User,
    VisaRequest,
    VoiceTranscription,
)
from app.models.privacy import DataNominee, DataRightsRequest, GuardianConsent
from app.models.travel import AccommodationBooking, ServiceBooking

logger = structlog.get_logger(__name__)

EXPORT_FORMAT_VERSION = "1"
#: never exported (secrets, internal pointers, raw third-party payloads, staff-only notes)
EXCLUDED_COLUMNS = frozenset(
    {
        "password_hash",
        "mfa_secret",
        "apple_refresh_token",
        "token_hash",
        "token",
        "storage_key",
        "raw",
        "payload",
        "idempotency_key",
        "internal_notes",
        "legal_hold",
        "legal_hold_reason",
        "legal_hold_set_at",
        "legal_hold_set_by",
        "inactivity_notice_at",
    }
)


def serialize(row: Any, *, exclude: Iterable[str] = ()) -> dict[str, Any]:
    """All mapped columns of ``row`` except :data:`EXCLUDED_COLUMNS` and ``exclude``."""
    skip = EXCLUDED_COLUMNS | set(exclude)
    mapper = sa_inspect(row).mapper
    out: dict[str, Any] = {}
    for attr in mapper.column_attrs:
        if attr.key in skip:
            continue
        out[attr.key] = getattr(row, attr.key)
    return jsonable_encoder(out)


def _rows(rows: Sequence[Any], **kw: Any) -> list[dict[str, Any]]:
    return [serialize(r, **kw) for r in rows]


async def _all(db: AsyncSession, stmt: Any) -> list[Any]:
    return list((await db.execute(stmt)).scalars().all())


async def collect(db: AsyncSession, user: User) -> tuple[dict[str, Any], list[Document]]:
    """``(export document, documents whose files belong in the archive)``."""
    profile = (
        await db.execute(select(PatientProfile).where(PatientProfile.user_id == user.id))
    ).scalar_one_or_none()
    pid = profile.id if profile is not None else None
    data: dict[str, Any] = {
        "format_version": EXPORT_FORMAT_VERSION,
        "generated_at": datetime.now(UTC).isoformat(),
        "service": settings.APP_NAME,
        "account": serialize(user),
        "consents": _rows(
            await _all(db, select(Consent).where(Consent.user_id == user.id).order_by(Consent.created_at))
        ),
        "nominee": None,
        "data_rights_requests": _rows(
            await _all(
                db,
                select(DataRightsRequest)
                .where(DataRightsRequest.user_id == user.id)
                .order_by(DataRightsRequest.created_at),
            )
        ),
        "notifications": _rows(
            await _all(
                db,
                select(Notification).where(Notification.user_id == user.id).order_by(Notification.created_at),
            )
        ),
        "messages_sent": _rows(
            await _all(
                db, select(Message).where(Message.sender_user_id == user.id).order_by(Message.created_at)
            )
        ),
        "devices": _rows(await _all(db, select(DeviceToken).where(DeviceToken.user_id == user.id))),
        "saved_items": _rows(await _all(db, select(SavedItem).where(SavedItem.user_id == user.id))),
    }
    nominee = (
        await db.execute(select(DataNominee).where(DataNominee.user_id == user.id))
    ).scalar_one_or_none()
    data["nominee"] = serialize(nominee) if nominee is not None else None

    agent = (await db.execute(select(Agent).where(Agent.user_id == user.id))).scalar_one_or_none()
    if agent is not None:
        data["agent"] = serialize(agent)
    memberships = await _all(db, select(HospitalMember).where(HospitalMember.user_id == user.id))
    if memberships:
        data["hospital_memberships"] = _rows(memberships)

    doc_filter = Document.owner_user_id == user.id
    if pid is not None:
        doc_filter = or_(doc_filter, Document.patient_id == pid)
    documents = await _all(
        db, select(Document).where(doc_filter, Document.deleted_at.is_(None)).order_by(Document.created_at)
    )
    data["documents"] = _rows(documents)
    voice_filter = VoiceTranscription.user_id == user.id
    if pid is not None:
        voice_filter = or_(voice_filter, VoiceTranscription.patient_id == pid)
    data["voice_transcriptions"] = _rows(
        await _all(db, select(VoiceTranscription).where(voice_filter).order_by(VoiceTranscription.created_at))
    )

    if profile is not None and pid is not None:
        data["patient_profile"] = serialize(profile)
        data["companions"] = _rows(
            await _all(db, select(PatientCompanion).where(PatientCompanion.patient_id == pid))
        )
        data["guardian_consents"] = _rows(
            await _all(db, select(GuardianConsent).where(GuardianConsent.patient_id == pid))
        )
        screenings = await _all(
            db, select(Screening).where(Screening.patient_id == pid).order_by(Screening.created_at)
        )
        matches = await _all(
            db,
            select(ScreeningMatch)
            .where(ScreeningMatch.screening_id.in_([s.id for s in screenings] or [uuid.uuid4()]))
            .order_by(ScreeningMatch.screening_id, ScreeningMatch.rank),
        )
        data["screenings"] = [
            {**serialize(s), "matches": _rows([m for m in matches if m.screening_id == s.id])}
            for s in screenings
        ]
        data["document_analyses"] = _rows(
            await _all(
                db,
                select(DocumentAnalysis)
                .where(DocumentAnalysis.patient_id == pid)
                .order_by(DocumentAnalysis.created_at),
            )
        )
        cases = await _all(db, select(Case).where(Case.patient_id == pid).order_by(Case.created_at))
        case_ids = [c.id for c in cases] or [uuid.uuid4()]
        children: dict[str, list[Any]] = {
            "status_history": await _all(
                db,
                select(CaseStatusHistory)
                .where(CaseStatusHistory.case_id.in_(case_ids))
                .order_by(CaseStatusHistory.created_at),
            ),
            "quotes": await _all(
                db, select(Quote).where(Quote.case_id.in_(case_ids)).order_by(Quote.created_at)
            ),
            "consultations": await _all(db, select(Consultation).where(Consultation.case_id.in_(case_ids))),
            "checklist": await _all(db, select(ChecklistItem).where(ChecklistItem.case_id.in_(case_ids))),
            "itinerary": await _all(db, select(ItineraryItem).where(ItineraryItem.case_id.in_(case_ids))),
        }
        data["cases"] = [
            {
                **serialize(c),
                **{name: _rows([r for r in rows if r.case_id == c.id]) for name, rows in children.items()},
            }
            for c in cases
        ]
        bookings = await _all(
            db, select(Booking).where(Booking.patient_id == pid).order_by(Booking.created_at)
        )
        data["bookings"] = _rows(bookings)
        data["installments"] = _rows(
            await _all(
                db,
                select(Installment)
                .where(Installment.booking_id.in_([b.id for b in bookings] or [uuid.uuid4()]))
                .order_by(Installment.booking_id, Installment.seq),
            )
        )
        data["travel"] = {
            "visa_requests": _rows(await _all(db, select(VisaRequest).where(VisaRequest.patient_id == pid))),
            "travel_bookings": _rows(
                await _all(db, select(TravelBooking).where(TravelBooking.patient_id == pid))
            ),
            "accommodation_bookings": _rows(
                await _all(db, select(AccommodationBooking).where(AccommodationBooking.patient_id == pid))
            ),
            "service_bookings": _rows(
                await _all(db, select(ServiceBooking).where(ServiceBooking.patient_id == pid))
            ),
            "sos_alerts": _rows(await _all(db, select(SosAlert).where(SosAlert.patient_id == pid))),
        }
        data["access_log"] = await access_log_entries(db, pid)

    order_filter = PaymentOrder.payer_user_id == user.id
    if pid is not None:
        order_filter = or_(order_filter, PaymentOrder.patient_id == pid)
    orders = await _all(db, select(PaymentOrder).where(order_filter).order_by(PaymentOrder.created_at))
    order_ids = [o.id for o in orders] or [uuid.uuid4()]
    data["payments"] = {
        "orders": _rows(orders, exclude=("meta", "gateway_order_id")),
        "payments": _rows(await _all(db, select(Payment).where(Payment.order_id.in_(order_ids)))),
        "refunds": _rows(await _all(db, select(Refund).where(Refund.order_id.in_(order_ids)))),
        "invoices": _rows(
            await _all(
                db,
                select(Invoice).where(
                    or_(Invoice.issued_to_user_id == user.id, Invoice.order_id.in_(order_ids))
                ),
            )
        ),
    }
    return data, documents


async def access_log_entries(
    db: AsyncSession, patient_id: uuid.UUID, limit: int = 1000
) -> list[dict[str, Any]]:
    """PHI read audit rows about ``patient_id`` (who viewed the records), newest first."""
    rows = (
        await db.execute(
            select(AuditLog, User.full_name)
            .outerjoin(User, User.id == AuditLog.actor_user_id)
            .where(
                AuditLog.action.in_(PHI_ACTIONS),
                AuditLog.after["patient_id"].astext == str(patient_id),
            )
            .order_by(AuditLog.created_at.desc())
            .limit(limit)
        )
    ).all()
    return [
        {
            "at": entry.created_at.isoformat(),
            "action": entry.action,
            "resource_type": entry.entity_type,
            "resource_id": entry.entity_id,
            "viewer_role": entry.actor_role,
            "viewer_name": name,
            "reason": (entry.after or {}).get("reason"),
        }
        for entry, name in rows
    ]


_SAFE_NAME = re.compile(r"[^A-Za-z0-9._-]+")


def _archive_name(document: Document) -> str:
    base = _SAFE_NAME.sub("_", document.file_name or "file").strip("._") or "file"
    return f"files/{document.id}_{base[:120]}"


async def build_archive(data: dict[str, Any], documents: Sequence[Document]) -> bytes:
    """ZIP with ``data.json``, ``README.txt`` and the files (up to ``DATA_EXPORT_MAX_FILES_MB``)."""
    budget = settings.DATA_EXPORT_MAX_FILES_MB * 1024 * 1024
    storage = get_storage()
    included: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for document in documents:
            if document.size_bytes > budget:
                skipped.append({"document_id": str(document.id), "reason": "export size limit"})
                continue
            try:
                content = await storage.open(document.storage_key)
            except (ObjectNotFound, FileNotFoundError):
                skipped.append({"document_id": str(document.id), "reason": "file not found"})
                continue
            budget -= len(content)
            name = _archive_name(document)
            archive.writestr(name, content)
            included.append({"document_id": str(document.id), "path": name})
        data = {**data, "files": {"included": included, "skipped": skipped}}
        archive.writestr("data.json", json.dumps(data, indent=2, ensure_ascii=False, default=str))
        archive.writestr(
            "README.txt",
            (
                f"Your data from {settings.APP_NAME}\n\n"
                "data.json holds everything we store about you in a machine-readable format (JSON).\n"
                "The files folder holds the documents you uploaded or that were added to your record.\n"
                "Files that did not fit in this download are listed under files.skipped in data.json; "
                "download them one by one from the Documents page.\n"
                "Questions or corrections: contact our Grievance Officer (see the privacy policy).\n"
            ),
        )
    return buffer.getvalue()


async def export_user_data(db: AsyncSession, user: User, *, as_zip: bool, request: Any = None) -> bytes:
    """Build the export and record it in the audit log (commits)."""
    data, documents = await collect(db, user)
    payload = (
        await build_archive(data, documents)
        if as_zip
        else json.dumps(data, indent=2, ensure_ascii=False, default=str).encode("utf-8")
    )
    await audit_log(
        db,
        actor=user,
        action="privacy.data_export",
        entity_type="user",
        entity_id=user.id,
        after={"format": "zip" if as_zip else "json", "documents": len(documents), "bytes": len(payload)},
        request=request,
    )
    await db.commit()
    return payload
