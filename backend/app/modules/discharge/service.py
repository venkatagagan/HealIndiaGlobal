"""Discharge summaries for the patient's home doctor.

* The hospital (write members) or ops staff create a **draft** at discharge (pre-filled from the case,
  booking, doctor, procedure and the patient's recorded allergies), edit it and **finalize** it. Finalizing
  locks the version, renders the PDF (stored as a ``discharge_summary`` Document visible to the patient, the
  hospital and consented agents), creates the medication reminders (disabled until the patient opts in) and
  publishes ``discharge_summary.finalized``. Editing a final summary starts a new draft version; when that
  version is finalized the previous one is marked superseded.
* Patients (and their agent, with ``share_with_agent`` consent) see final versions only; drafts are visible to
  the hospital and staff. Reads by anyone but the patient are recorded as PHI access.
* **Share with the home doctor**: the patient creates a time-limited, revocable link (random token; only its
  SHA-256 is stored) showing ONE final summary plus the documents they select. Consent
  ``share_with_home_doctor`` is recorded and the link is emailed to the doctor. Every view/download through
  the link is audited as PHI access (actor role ``home_doctor``).
"""

from __future__ import annotations

import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta, timezone
from typing import Any, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import structlog
from fastapi import Request
from sqlalchemy import and_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.core.audit import audit_log
from app.core.config import settings
from app.core.deps import has_role
from app.core.enums import (
    BookingStatus,
    ConsentKind,
    DischargeSummaryStatus,
    DocumentKind,
    DocumentStatus,
    Gender,
    UserRole,
)
from app.core.errors import BadRequest, Conflict, Forbidden, NotFound
from app.core.events import publish
from app.core.jobs import enqueue
from app.core.storage import get_storage, make_key
from app.i18n import normalize_locale, recipient_locale, t
from app.models import (
    Booking,
    Case,
    Consultation,
    DischargeShare,
    DischargeSummary,
    Doctor,
    Document,
    Hospital,
    MedicationReminder,
    PatientProfile,
    Procedure,
    User,
)
from app.modules.cases import policies as case_policies
from app.modules.discharge import schemas as s
from app.modules.discharge.fhir import FhirContext, FhirMedication, build_bundle
from app.modules.discharge.pdf import DischargePdfContext, PdfMedication, render_discharge_summary
from app.modules.documents import policies as doc_policies
from app.modules.travel.countries import country_name

logger = structlog.get_logger(__name__)

CONSENT_VERSION = "2026-11"
Access = Literal["staff", "hospital", "patient", "agent"]
TEXT_FIELDS = (
    "doctor_name",
    "doctor_registration",
    "admission_date",
    "discharge_date",
    "diagnosis",
    "diagnosis_code",
    "procedure_name",
    "procedure_code",
    "procedure_date",
    "hospital_course",
    "follow_up_instructions",
    "red_flag_symptoms",
    "allergies",
    "investigations_summary",
)


def utcnow() -> datetime:
    return datetime.now(UTC)


async def _required[M](db: AsyncSession, model: type[M], ident: Any) -> M:
    row = await db.get(model, ident)
    if row is None:  # pragma: no cover - FK-protected
        raise NotFound(f"{model.__name__} not found")
    return row


# ============================================================================================ access
async def _access(db: AsyncSession, user: User, summary: DischargeSummary) -> Access | None:
    p = await doc_policies.load_principal(db, user)
    if p.full_staff_access or has_role(user, UserRole.SUPER_ADMIN):
        return "staff"
    if p.staff:
        if p.role == UserRole.SUPPORT.value:
            case = await db.get(Case, summary.case_id)
            if case is not None and case.coordinator_user_id == user.id:
                return "staff"
        return None
    if p.patient_id is not None and p.patient_id == summary.patient_id:
        return "patient"
    if p.hospital_ids and summary.hospital_id in p.hospital_ids:
        return "hospital"
    if p.agent_id is not None:
        case = await db.get(Case, summary.case_id)
        if case is None or not await doc_policies.can_access_case(db, p, case):
            return None
        consented = (
            await db.execute(
                doc_policies.agent_consented_patients().where(PatientProfile.id == summary.patient_id)
            )
        ).scalar_one_or_none()
        return "agent" if consented is not None else None
    return None


def _can_see(access: Access | None, summary: DischargeSummary) -> bool:
    if access is None:
        return False
    if access in ("patient", "agent"):
        return DischargeSummaryStatus(summary.status) == DischargeSummaryStatus.FINAL
    return True


async def _can_write(db: AsyncSession, user: User, hospital_id: uuid.UUID) -> bool:
    return await case_policies.can_act_for_hospital(db, user, hospital_id)


async def get_summary(
    db: AsyncSession, user: User, summary_id: uuid.UUID, *, for_update: bool = False
) -> tuple[DischargeSummary, Access]:
    stmt = select(DischargeSummary).where(DischargeSummary.id == summary_id)
    if for_update:
        stmt = stmt.with_for_update()
    summary = (await db.execute(stmt)).scalar_one_or_none()
    if summary is None:
        raise NotFound("Discharge summary not found")
    access = await _access(db, user, summary)
    if not _can_see(access, summary):
        raise NotFound("Discharge summary not found")
    if access is None:  # pragma: no cover - _can_see rejects None
        raise NotFound("Discharge summary not found")
    return summary, access


async def audit_read(
    db: AsyncSession,
    user: User,
    summary: DischargeSummary,
    request: Request | None,
    action: str = "phi.view",
    resource_type: str = "discharge_summary",
) -> None:
    from app.core.audit import audit_phi_access

    await audit_phi_access(
        db,
        actor=user,
        patient_ids=summary.patient_id,
        resource_type=resource_type,
        resource_id=summary.id,
        action=action,
        request=request,
    )


# ============================================================================================ serialization
async def _attachments(db: AsyncSession, ids: list[uuid.UUID]) -> list[s.AttachmentOut]:
    if not ids:
        return []
    rows = (
        (await db.execute(select(Document).where(Document.id.in_(ids), Document.deleted_at.is_(None))))
        .scalars()
        .all()
    )
    by_id = {d.id: d for d in rows}
    return [_attachment_out(by_id[i]) for i in ids if i in by_id]


def _attachment_out(d: Document) -> s.AttachmentOut:
    return s.AttachmentOut(
        id=d.id,
        file_name=d.file_name,
        content_type=d.content_type,
        size_bytes=d.size_bytes,
        kind=str(getattr(d.kind, "value", d.kind)),
    )


def _medications(summary: DischargeSummary) -> list[s.MedicationOut]:
    out: list[s.MedicationOut] = []
    for item in summary.medications or []:
        if isinstance(item, dict) and item.get("name"):
            out.append(s.MedicationOut.model_validate(item))
    return out


async def _is_latest(db: AsyncSession, summary: DischargeSummary) -> bool:
    newer = (
        await db.execute(
            select(DischargeSummary.id)
            .where(
                DischargeSummary.case_id == summary.case_id,
                DischargeSummary.version > summary.version,
                DischargeSummary.status == DischargeSummaryStatus.FINAL,
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    return newer is None and summary.superseded_at is None


async def summary_out(db: AsyncSession, summary: DischargeSummary) -> s.DischargeSummaryOut:
    case = await db.get(Case, summary.case_id)
    booking = await db.get(Booking, summary.booking_id) if summary.booking_id else None
    patient = await db.get(PatientProfile, summary.patient_id)
    hospital = await db.get(Hospital, summary.hospital_id)
    return s.DischargeSummaryOut(
        id=summary.id,
        case_id=summary.case_id,
        case_number=case.case_number if case else None,
        booking_id=summary.booking_id,
        booking_number=booking.booking_number if booking else None,
        patient_id=summary.patient_id,
        patient_name=patient.full_name if patient else None,
        hospital_id=summary.hospital_id,
        hospital_name=hospital.name if hospital else None,
        doctor_id=summary.doctor_id,
        doctor_name=summary.doctor_name,
        doctor_registration=summary.doctor_registration,
        version=summary.version,
        supersedes_id=summary.supersedes_id,
        status=DischargeSummaryStatus(summary.status),
        is_latest=await _is_latest(db, summary),
        admission_date=summary.admission_date,
        discharge_date=summary.discharge_date,
        diagnosis=summary.diagnosis,
        diagnosis_code=summary.diagnosis_code,
        procedure_name=summary.procedure_name,
        procedure_code=summary.procedure_code,
        procedure_date=summary.procedure_date,
        hospital_course=summary.hospital_course,
        medications=_medications(summary),
        follow_up_instructions=summary.follow_up_instructions,
        red_flag_symptoms=summary.red_flag_symptoms,
        allergies=summary.allergies,
        investigations_summary=summary.investigations_summary,
        attachments=await _attachments(db, list(summary.attachment_document_ids or [])),
        pdf_document_id=summary.pdf_document_id,
        finalized_at=summary.finalized_at,
        finalized_by_user_id=summary.finalized_by_user_id,
        superseded_at=summary.superseded_at,
        created_at=summary.created_at,
        updated_at=summary.updated_at,
    )


async def list_summaries(
    db: AsyncSession,
    user: User,
    *,
    case_id: uuid.UUID | None = None,
    booking_id: uuid.UUID | None = None,
    status: DischargeSummaryStatus | None = None,
    limit: int = 100,
) -> list[s.DischargeSummaryListItem]:
    stmt = select(DischargeSummary, Case.case_number, PatientProfile, Hospital.name).join(
        Case, Case.id == DischargeSummary.case_id
    )
    stmt = stmt.join(PatientProfile, PatientProfile.id == DischargeSummary.patient_id).join(
        Hospital, Hospital.id == DischargeSummary.hospital_id
    )
    p = await doc_policies.load_principal(db, user)
    if p.patient_id is not None or p.agent_id is not None:
        stmt = stmt.where(DischargeSummary.status == DischargeSummaryStatus.FINAL)
    if not (p.full_staff_access or has_role(user, UserRole.SUPER_ADMIN)):
        if p.staff and p.role == UserRole.SUPPORT.value:
            stmt = stmt.where(Case.coordinator_user_id == user.id)
        elif p.staff:
            return []
        elif p.patient_id is not None:
            stmt = stmt.where(DischargeSummary.patient_id == p.patient_id)
        elif p.hospital_ids:
            stmt = stmt.where(DischargeSummary.hospital_id.in_(p.hospital_ids))
        elif p.agent_id is not None:
            stmt = stmt.where(
                case_policies.case_condition(user),
                DischargeSummary.patient_id.in_(doc_policies.agent_consented_patients()),
            )
        else:
            return []
    if case_id is not None:
        stmt = stmt.where(DischargeSummary.case_id == case_id)
    if booking_id is not None:
        stmt = stmt.where(DischargeSummary.booking_id == booking_id)
    if status is not None:
        stmt = stmt.where(DischargeSummary.status == status)
    stmt = stmt.order_by(DischargeSummary.updated_at.desc(), DischargeSummary.version.desc()).limit(limit)
    rows = (await db.execute(stmt)).all()
    latest_final: dict[uuid.UUID, int] = {}
    for summary, *_ in rows:
        if DischargeSummaryStatus(summary.status) == DischargeSummaryStatus.FINAL:
            latest_final[summary.case_id] = max(latest_final.get(summary.case_id, 0), summary.version)
    items = [
        s.DischargeSummaryListItem(
            id=summary.id,
            case_id=summary.case_id,
            case_number=case_number,
            booking_id=summary.booking_id,
            patient_name=patient.full_name,
            hospital_name=hospital_name,
            version=summary.version,
            status=DischargeSummaryStatus(summary.status),
            is_latest=summary.superseded_at is None
            and summary.version >= latest_final.get(summary.case_id, 0),
            discharge_date=summary.discharge_date,
            pdf_document_id=summary.pdf_document_id,
            finalized_at=summary.finalized_at,
            updated_at=summary.updated_at,
        )
        for summary, case_number, patient, hospital_name in rows
    ]
    if p.hospital_ids or p.staff:
        await doc_policies_audit_list(db, user, [r[0] for r in rows])
    return items


async def doc_policies_audit_list(db: AsyncSession, user: User, summaries: list[DischargeSummary]) -> None:
    from app.core.audit import audit_phi_access

    patient_ids = list({str(x.patient_id) for x in summaries})
    if patient_ids:
        await audit_phi_access(
            db, actor=user, patient_ids=patient_ids, resource_type="discharge_summary", action="phi.list"
        )


# ========================================================================================== prefill / create
async def _case_and_booking(
    db: AsyncSession, user: User, case_id: uuid.UUID, booking_id: uuid.UUID | None
) -> tuple[Case, Booking | None]:
    case = await case_policies.get_case_for_user(db, case_id, user)
    if not await _can_write(db, user, case.hospital_id):
        raise Forbidden("Only the hospital team or platform staff can write discharge summaries")
    booking: Booking | None = None
    if booking_id is not None:
        booking = await db.get(Booking, booking_id)
        if booking is None or booking.case_id != case.id:
            raise NotFound("Booking not found")
    else:
        booking = (
            await db.execute(
                select(Booking)
                .where(Booking.case_id == case.id, Booking.status != BookingStatus.CANCELLED)
                .order_by(Booking.created_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
    return case, booking


async def _documents_for_case(db: AsyncSession, case: Case) -> list[Document]:
    """Documents a hospital may attach: the case's documents and the patient's documents visible to it."""
    rows = (
        (
            await db.execute(
                select(Document)
                .where(
                    Document.deleted_at.is_(None),
                    Document.kind != DocumentKind.DISCHARGE_SUMMARY,
                    (Document.case_id == case.id)
                    | and_(Document.patient_id == case.patient_id, Document.hospital_id == case.hospital_id),
                )
                .order_by(Document.created_at.desc())
                .limit(100)
            )
        )
        .scalars()
        .all()
    )
    return list(rows)


async def prefill(
    db: AsyncSession, user: User, case_id: uuid.UUID, booking_id: uuid.UUID | None
) -> s.DischargePrefillOut:
    case, booking = await _case_and_booking(db, user, case_id, booking_id)
    patient = await db.get(PatientProfile, case.patient_id)
    doctor_id = (booking.doctor_id if booking else None) or case.doctor_id
    if doctor_id is None:
        doctor_id = (
            await db.execute(
                select(Consultation.doctor_id)
                .where(Consultation.case_id == case.id)
                .order_by(Consultation.created_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
    doctor = await db.get(Doctor, doctor_id) if doctor_id else None
    procedure_id = (booking.procedure_id if booking else None) or case.procedure_id
    procedure = await db.get(Procedure, procedure_id) if procedure_id else None
    admission = None
    if booking is not None:
        admission = booking.admitted_at.date() if booking.admitted_at else booking.admission_date
    discharge = None
    if booking is not None:
        discharge = booking.completed_at.date() if booking.completed_at else booking.discharge_date
    await audit_read_case(db, user, case)
    return s.DischargePrefillOut(
        case_id=case.id,
        booking_id=booking.id if booking else None,
        doctor_id=doctor.id if doctor else None,
        doctor_name=doctor.full_name if doctor else None,
        doctor_registration=doctor.registration_number if doctor else None,
        admission_date=admission,
        discharge_date=discharge or date.today(),
        procedure_name=procedure.name if procedure else None,
        procedure_date=admission,
        allergies=patient.allergies if patient else None,
        diagnosis=None,
        hospital_course=None,
        available_documents=[_attachment_out(d) for d in await _documents_for_case(db, case)],
    )


async def audit_read_case(db: AsyncSession, user: User, case: Case) -> None:
    from app.core.audit import audit_phi_access

    await audit_phi_access(
        db, actor=user, patient_ids=case.patient_id, resource_type="discharge_prefill", resource_id=case.id
    )


async def _apply_fields(
    db: AsyncSession, summary: DischargeSummary, case: Case, body: s.DischargeSummaryFields
) -> list[str]:
    data = body.model_dump(exclude_unset=True)
    changed: list[str] = []
    if "doctor_id" in data:
        doctor_id = data["doctor_id"]
        if doctor_id is not None:
            doctor = await db.get(Doctor, doctor_id)
            if doctor is None or doctor.hospital_id != summary.hospital_id:
                raise BadRequest("The doctor does not practise at this hospital", code="invalid_doctor")
            summary.doctor_id = doctor.id
            if "doctor_name" not in data:
                summary.doctor_name = doctor.full_name
            if "doctor_registration" not in data:
                summary.doctor_registration = doctor.registration_number
        else:
            summary.doctor_id = None
        changed.append("doctor_id")
    for name in TEXT_FIELDS:
        if name in data:
            value = data[name]
            setattr(summary, name, value if value != "" else None)
            changed.append(name)
    if "medications" in data:
        meds = body.medications or []
        summary.medications = [m.model_dump(exclude_none=True) for m in meds]
        changed.append("medications")
    if "attachment_document_ids" in data:
        ids = list(dict.fromkeys(body.attachment_document_ids or []))
        allowed = {d.id for d in await _documents_for_case(db, case)}
        bad = [str(i) for i in ids if i not in allowed]
        if bad:
            raise BadRequest(
                "Some documents cannot be attached to this summary", code="invalid_documents", details=bad
            )
        summary.attachment_document_ids = ids
        changed.append("attachment_document_ids")
    if summary.admission_date and summary.discharge_date and summary.discharge_date < summary.admission_date:
        raise BadRequest("The discharge date is before the admission date", code="invalid_dates")
    return changed


async def _apply_defaults(
    db: AsyncSession, summary: DischargeSummary, case: Case, booking: Booking | None
) -> None:
    """Start a new draft from what the platform already knows (the body's values win)."""
    doctor_id = (booking.doctor_id if booking else None) or case.doctor_id
    doctor = await db.get(Doctor, doctor_id) if doctor_id else None
    if doctor is not None and doctor.hospital_id == summary.hospital_id:
        summary.doctor_id = doctor.id
        summary.doctor_name = doctor.full_name
        summary.doctor_registration = doctor.registration_number
    if booking is not None:
        admitted = booking.admitted_at.date() if booking.admitted_at else booking.admission_date
        discharged = booking.completed_at.date() if booking.completed_at else booking.discharge_date
        summary.admission_date = admitted
        summary.discharge_date = None if admitted and discharged and discharged < admitted else discharged
    procedure_id = (booking.procedure_id if booking else None) or case.procedure_id
    procedure = await db.get(Procedure, procedure_id) if procedure_id else None
    if procedure is not None:
        summary.procedure_name = procedure.name
    patient = await db.get(PatientProfile, case.patient_id)
    if patient is not None and patient.allergies:
        summary.allergies = patient.allergies


async def create_summary(
    db: AsyncSession, user: User, body: s.DischargeSummaryCreate, request: Request | None
) -> DischargeSummary:
    case, booking = await _case_and_booking(db, user, body.case_id, body.booking_id)
    existing = (
        await db.execute(
            select(DischargeSummary.id).where(
                DischargeSummary.case_id == case.id, DischargeSummary.status == DischargeSummaryStatus.DRAFT
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise Conflict(
            "A draft discharge summary already exists for this case",
            code="discharge_draft_exists",
            details={"discharge_summary_id": str(existing)},
        )
    last_version = (
        await db.execute(
            select(DischargeSummary.version)
            .where(DischargeSummary.case_id == case.id)
            .order_by(DischargeSummary.version.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if last_version is not None:
        raise Conflict(
            "This case already has a final discharge summary - edit it to create a new version",
            code="discharge_summary_exists",
        )
    summary = DischargeSummary(
        case_id=case.id,
        booking_id=booking.id if booking else None,
        patient_id=case.patient_id,
        hospital_id=case.hospital_id,
        version=1,
        status=DischargeSummaryStatus.DRAFT,
        created_by_user_id=user.id,
        updated_by_user_id=user.id,
        medications=[],
        attachment_document_ids=[],
    )
    db.add(summary)
    await _apply_defaults(db, summary, case, booking)
    changed = await _apply_fields(db, summary, case, body)
    try:
        await db.flush()
    except IntegrityError as exc:  # concurrent create
        await db.rollback()
        raise Conflict("A draft discharge summary already exists", code="discharge_draft_exists") from exc
    await audit_log(
        db,
        actor=user,
        action="discharge_summary.create",
        entity_type="discharge_summary",
        entity_id=summary.id,
        after={"case_id": case.id, "version": 1, "fields": changed},
        request=request,
    )
    await db.commit()
    return summary


async def update_summary(
    db: AsyncSession,
    user: User,
    summary_id: uuid.UUID,
    body: s.DischargeSummaryUpdate,
    request: Request | None,
) -> DischargeSummary:
    summary, access = await get_summary(db, user, summary_id, for_update=True)
    if access not in ("hospital", "staff") or not await _can_write(db, user, summary.hospital_id):
        raise Forbidden("Only the hospital team or platform staff can edit discharge summaries")
    if DischargeSummaryStatus(summary.status) != DischargeSummaryStatus.DRAFT:
        raise Conflict(
            "A final discharge summary is locked - create a new version to change it",
            code="discharge_summary_final",
        )
    case = await _required(db, Case, summary.case_id)
    changed = await _apply_fields(db, summary, case, body)
    summary.updated_by_user_id = user.id
    summary.updated_at = utcnow()
    await audit_log(
        db,
        actor=user,
        action="discharge_summary.update",
        entity_type="discharge_summary",
        entity_id=summary.id,
        after={"fields": changed},
        request=request,
    )
    await db.commit()
    return summary


async def new_version(
    db: AsyncSession, user: User, summary_id: uuid.UUID, request: Request | None
) -> DischargeSummary:
    """Start a new draft version from a final summary (the final one stays locked)."""
    summary, access = await get_summary(db, user, summary_id, for_update=True)
    if access not in ("hospital", "staff") or not await _can_write(db, user, summary.hospital_id):
        raise Forbidden("Only the hospital team or platform staff can edit discharge summaries")
    if DischargeSummaryStatus(summary.status) != DischargeSummaryStatus.FINAL:
        raise Conflict("This summary is still a draft - edit it directly", code="discharge_summary_draft")
    draft = (
        await db.execute(
            select(DischargeSummary).where(
                DischargeSummary.case_id == summary.case_id,
                DischargeSummary.status == DischargeSummaryStatus.DRAFT,
            )
        )
    ).scalar_one_or_none()
    if draft is not None:
        return draft
    top = (
        await db.execute(
            select(DischargeSummary.version)
            .where(DischargeSummary.case_id == summary.case_id)
            .order_by(DischargeSummary.version.desc())
            .limit(1)
        )
    ).scalar_one()
    copy = DischargeSummary(
        case_id=summary.case_id,
        booking_id=summary.booking_id,
        patient_id=summary.patient_id,
        hospital_id=summary.hospital_id,
        doctor_id=summary.doctor_id,
        version=int(top) + 1,
        supersedes_id=summary.id,
        status=DischargeSummaryStatus.DRAFT,
        created_by_user_id=user.id,
        updated_by_user_id=user.id,
        attachment_document_ids=list(summary.attachment_document_ids or []),
        medications=list(summary.medications or []),
        **{name: getattr(summary, name) for name in TEXT_FIELDS},
    )
    db.add(copy)
    await db.flush()
    await audit_log(
        db,
        actor=user,
        action="discharge_summary.new_version",
        entity_type="discharge_summary",
        entity_id=copy.id,
        after={"supersedes_id": summary.id, "version": copy.version},
        request=request,
    )
    await db.commit()
    return copy


async def discard_draft(db: AsyncSession, user: User, summary_id: uuid.UUID, request: Request | None) -> None:
    summary, access = await get_summary(db, user, summary_id, for_update=True)
    if access not in ("hospital", "staff") or not await _can_write(db, user, summary.hospital_id):
        raise Forbidden("Only the hospital team or platform staff can edit discharge summaries")
    if DischargeSummaryStatus(summary.status) != DischargeSummaryStatus.DRAFT:
        raise Conflict("A final discharge summary cannot be deleted", code="discharge_summary_final")
    await audit_log(
        db,
        actor=user,
        action="discharge_summary.discard",
        entity_type="discharge_summary",
        entity_id=summary.id,
        before={"version": summary.version},
        request=request,
    )
    await db.delete(summary)
    await db.commit()


# ============================================================================================ finalize
def _gender(value: Any) -> str | None:
    if value is None:
        return None
    g = Gender(value)
    return {"male": "male", "female": "female", "other": "other"}.get(g.value, "unknown")


async def pdf_context(db: AsyncSession, summary: DischargeSummary, locale: str = "en") -> DischargePdfContext:
    case = await _required(db, Case, summary.case_id)
    hospital = await _required(db, Hospital, summary.hospital_id)
    patient = await _required(db, PatientProfile, summary.patient_id)
    booking = await db.get(Booking, summary.booking_id) if summary.booking_id else None
    attachments = await _attachments(db, list(summary.attachment_document_ids or []))
    sex = _gender(patient.gender)
    return DischargePdfContext(
        reference=f"{case.case_number}/DS",
        version=summary.version,
        issued_on=(summary.finalized_at or utcnow()).date(),
        finalized_at=summary.finalized_at,
        hospital_name=hospital.name,
        hospital_legal_name=hospital.legal_name,
        hospital_address_lines=[
            line
            for line in (
                hospital.address,
                ", ".join(x for x in (hospital.city, hospital.state, hospital.pincode) if x),
                country_name(hospital.country),
            )
            if line
        ],
        hospital_phone=hospital.phone,
        hospital_email=hospital.email,
        hospital_website=hospital.website,
        patient_name=patient.full_name or "-",
        patient_dob=patient.date_of_birth,
        patient_sex=t(f"discharge.pdf.sex_{sex}", locale) if sex else None,
        nationality=country_name(patient.nationality),
        case_number=case.case_number,
        booking_number=booking.booking_number if booking else None,
        doctor_name=summary.doctor_name,
        doctor_registration=summary.doctor_registration,
        admission_date=summary.admission_date,
        discharge_date=summary.discharge_date,
        diagnosis=summary.diagnosis,
        diagnosis_code=summary.diagnosis_code,
        procedure_name=summary.procedure_name,
        procedure_code=summary.procedure_code,
        procedure_date=summary.procedure_date,
        hospital_course=summary.hospital_course,
        follow_up_instructions=summary.follow_up_instructions,
        red_flag_symptoms=summary.red_flag_symptoms,
        allergies=summary.allergies,
        investigations_summary=summary.investigations_summary,
        medications=[PdfMedication(**m.model_dump()) for m in _medications(summary)],
        attachments=[a.file_name for a in attachments],
        locale=locale,
    )


async def finalize(
    db: AsyncSession, user: User, summary_id: uuid.UUID, request: Request | None
) -> DischargeSummary:
    summary, access = await get_summary(db, user, summary_id, for_update=True)
    if access not in ("hospital", "staff") or not await _can_write(db, user, summary.hospital_id):
        raise Forbidden("Only the hospital team or platform staff can finalize discharge summaries")
    if DischargeSummaryStatus(summary.status) == DischargeSummaryStatus.FINAL:
        return summary
    missing = [
        name
        for name, value in (
            ("diagnosis", summary.diagnosis),
            ("discharge_date", summary.discharge_date),
            ("doctor_name", summary.doctor_name),
            ("follow_up_instructions", summary.follow_up_instructions),
        )
        if not value
    ]
    if missing:
        raise BadRequest(
            "Fill in the required fields before finalizing", code="discharge_incomplete", details=missing
        )
    case = await _required(db, Case, summary.case_id)
    now = utcnow()
    summary.status = DischargeSummaryStatus.FINAL
    summary.finalized_at = now
    summary.finalized_by_user_id = user.id
    summary.updated_by_user_id = user.id
    summary.updated_at = now
    ctx = await pdf_context(db, summary)
    pdf = await run_in_threadpool(render_discharge_summary, ctx)
    key = make_key("documents", "pdf")
    storage = get_storage()
    await storage.save(key, pdf, "application/pdf")
    try:
        document = Document(
            owner_user_id=user.id,
            patient_id=summary.patient_id,
            case_id=summary.case_id,
            hospital_id=summary.hospital_id,
            kind=DocumentKind.DISCHARGE_SUMMARY,
            file_name=f"discharge-summary-{case.case_number}-v{summary.version}.pdf",
            content_type="application/pdf",
            size_bytes=len(pdf),
            storage_key=key,
            sha256=hashlib.sha256(pdf).hexdigest(),
            status=DocumentStatus.VERIFIED,
            verified_by=user.id,
            verified_at=now,
        )
        db.add(document)
        await db.flush()
        summary.pdf_document_id = document.id
        previous: DischargeSummary | None = None
        if summary.supersedes_id is not None:
            previous = await db.get(DischargeSummary, summary.supersedes_id)
        template: MedicationReminder | None = None
        if previous is not None:
            # the new version keeps the patient's reminder choice (on/off, hour, time zone)
            template = (
                await db.execute(
                    select(MedicationReminder)
                    .where(MedicationReminder.discharge_summary_id == previous.id)
                    .order_by(MedicationReminder.enabled.desc())
                    .limit(1)
                )
            ).scalar_one_or_none()
        if previous is not None and previous.superseded_at is None:
            previous.superseded_at = now
            # reminders of the old version stop; the new version gets its own
            await db.execute(
                update(MedicationReminder)
                .where(MedicationReminder.discharge_summary_id == previous.id)
                .values(enabled=False)
                .execution_options(synchronize_session=False)
            )
        await _create_reminders(db, summary, template)
        await audit_log(
            db,
            actor=user,
            action="discharge_summary.finalize",
            entity_type="discharge_summary",
            entity_id=summary.id,
            after={"version": summary.version, "document_id": str(document.id)},
            request=request,
        )
        await publish(
            db,
            "discharge_summary.finalized",
            {
                "discharge_summary_id": str(summary.id),
                "case_id": str(summary.case_id),
                "patient_id": str(summary.patient_id),
                "hospital_id": str(summary.hospital_id),
                "version": summary.version,
                "document_id": str(document.id),
            },
        )
        await db.commit()
    except BaseException:
        await db.rollback()
        try:
            await storage.delete(key)
        except Exception:  # pragma: no cover - best effort cleanup
            logger.warning("discharge.pdf_cleanup_failed", storage_key=key)
        raise
    return summary


async def _create_reminders(
    db: AsyncSession, summary: DischargeSummary, template: MedicationReminder | None
) -> None:
    """One (disabled) reminder per medicine; enabled only when the patient had switched reminders on for the
    previous version of this summary and has not withdrawn the consent since."""
    patient = await db.get(PatientProfile, summary.patient_id)
    if patient is None:
        return
    keep_on = bool(
        template is not None and template.enabled and await _reminders_opted_in(db, patient.user_id)
    )
    start = summary.discharge_date or utcnow().date()
    for i, med in enumerate(_medications(summary)):
        db.add(
            MedicationReminder(
                discharge_summary_id=summary.id,
                patient_id=summary.patient_id,
                user_id=patient.user_id,
                position=i,
                name=med.name,
                dose=med.dose,
                frequency=med.frequency,
                start_on=start,
                end_on=start + timedelta(days=med.duration_days - 1) if med.duration_days else None,
                enabled=keep_on,
                remind_hour=template.remind_hour if template else 9,
                timezone=template.timezone if template else "UTC",
            )
        )


async def _reminders_opted_in(db: AsyncSession, user_id: uuid.UUID) -> bool:
    from app.models import Consent

    latest = (
        await db.execute(
            select(Consent.granted)
            .where(Consent.user_id == user_id, Consent.kind == ConsentKind.MEDICATION_REMINDERS)
            .order_by(Consent.created_at.desc(), Consent.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    return bool(latest)


# ============================================================================================ exports
async def fhir_context(db: AsyncSession, summary: DischargeSummary) -> FhirContext:
    case = await _required(db, Case, summary.case_id)
    hospital = await _required(db, Hospital, summary.hospital_id)
    patient = await _required(db, PatientProfile, summary.patient_id)
    return FhirContext(
        summary_id=summary.id,
        version=summary.version,
        status_final=DischargeSummaryStatus(summary.status) == DischargeSummaryStatus.FINAL,
        finalized_at=summary.finalized_at,
        updated_at=summary.updated_at,
        case_number=case.case_number,
        patient_id=patient.id,
        patient_given=patient.first_name or patient.full_name or "Patient",
        patient_family=patient.last_name or "",
        patient_dob=patient.date_of_birth,
        patient_gender=_gender(patient.gender),
        patient_country=patient.nationality,
        hospital_id=hospital.id,
        hospital_name=hospital.name,
        hospital_city=hospital.city,
        hospital_country=hospital.country,
        hospital_phone=hospital.phone,
        hospital_email=hospital.email,
        doctor_id=summary.doctor_id,
        doctor_name=summary.doctor_name,
        doctor_registration=summary.doctor_registration,
        admission_date=summary.admission_date,
        discharge_date=summary.discharge_date,
        diagnosis=summary.diagnosis,
        diagnosis_code=summary.diagnosis_code,
        procedure_name=summary.procedure_name,
        procedure_code=summary.procedure_code,
        procedure_date=summary.procedure_date,
        hospital_course=summary.hospital_course,
        follow_up_instructions=summary.follow_up_instructions,
        red_flag_symptoms=summary.red_flag_symptoms,
        allergies=summary.allergies,
        investigations_summary=summary.investigations_summary,
        medications=[FhirMedication(**m.model_dump()) for m in _medications(summary)],
    )


async def fhir_bundle(db: AsyncSession, summary: DischargeSummary) -> dict[str, Any]:
    return build_bundle(await fhir_context(db, summary))


async def pdf_bytes(db: AsyncSession, summary: DischargeSummary) -> tuple[bytes, str]:
    """The stored PDF of a final summary, or a freshly rendered preview of a draft."""
    if summary.pdf_document_id is not None:
        doc = await db.get(Document, summary.pdf_document_id)
        if doc is not None and doc.deleted_at is None:
            return await get_storage().open(doc.storage_key), doc.file_name
    case = await db.get(Case, summary.case_id)
    ctx = await pdf_context(db, summary)
    data = await run_in_threadpool(render_discharge_summary, ctx)
    number = case.case_number if case else str(summary.id)
    return data, f"discharge-summary-{number}-v{summary.version}-draft.pdf"


# ============================================================================================ shares
def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _mask_email(value: str) -> str:
    local, _, domain = value.partition("@")
    return f"{local[:2]}***@{domain}"


def share_out(share: DischargeShare, now: datetime | None = None) -> s.ShareOut:
    now = now or utcnow()
    return s.ShareOut(
        id=share.id,
        discharge_summary_id=share.discharge_summary_id,
        doctor_email_masked=share.doctor_email_masked,
        doctor_name=share.doctor_name,
        document_ids=list(share.document_ids or []),
        language=share.language,
        expires_at=share.expires_at,
        revoked_at=share.revoked_at,
        view_count=share.view_count,
        last_viewed_at=share.last_viewed_at,
        created_at=share.created_at,
        active=share.revoked_at is None and share.expires_at > now,
    )


def share_url(token: str) -> str:
    """Public page of the patient portal. The portal SPA is served under ``/app/`` (dev server and edge
    nginx), while ``PATIENT_WEB_URL`` is the site root in deployments."""
    base = settings.PATIENT_WEB_URL.rstrip("/")
    if not base.endswith("/app"):
        base = f"{base}/app"
    return f"{base}/share/{token}"


async def _shareable_document_ids(db: AsyncSession, user: User, summary: DischargeSummary) -> set[uuid.UUID]:
    """Documents the patient may add: the summary's PDF + attachments and the patient's own documents."""
    p = await doc_policies.load_principal(db, user)
    rows = (
        await db.execute(
            select(Document.id).where(
                doc_policies.visibility_clause(p),
                Document.patient_id == summary.patient_id,
            )
        )
    ).scalars()
    allowed = set(rows)
    allowed.update(summary.attachment_document_ids or [])
    if summary.pdf_document_id:
        allowed.add(summary.pdf_document_id)
    return allowed


async def create_share(
    db: AsyncSession, user: User, summary_id: uuid.UUID, body: s.ShareCreate, request: Request | None
) -> s.ShareCreatedOut:
    from app.modules.auth.service import record_consent

    summary, access = await get_summary(db, user, summary_id)
    if access != "patient":
        raise Forbidden("Only the patient can share their discharge summary", code="patient_only")
    if not body.consent:
        raise BadRequest("Please confirm that you want to share this summary", code="consent_required")
    if summary.superseded_at is not None:
        raise BadRequest("Share the latest version of the summary", code="discharge_summary_superseded")
    allowed = await _shareable_document_ids(db, user, summary)
    ids = list(dict.fromkeys(body.document_ids))
    bad = [str(i) for i in ids if i not in allowed]
    if bad:
        raise BadRequest("Some documents cannot be shared", code="invalid_documents", details=bad)
    if summary.pdf_document_id and summary.pdf_document_id not in ids:
        ids.insert(0, summary.pdf_document_id)
    days = body.expires_in_days or settings.DISCHARGE_SHARE_DEFAULT_DAYS
    if days > settings.DISCHARGE_SHARE_MAX_DAYS:
        raise BadRequest(
            f"A link can be valid for at most {settings.DISCHARGE_SHARE_MAX_DAYS} days",
            code="share_too_long",
            details={"max_days": settings.DISCHARGE_SHARE_MAX_DAYS},
        )
    locale = normalize_locale(body.language) or recipient_locale(user)
    token = secrets.token_urlsafe(32)
    email = str(body.doctor_email).strip().lower()
    share = DischargeShare(
        discharge_summary_id=summary.id,
        patient_id=summary.patient_id,
        created_by_user_id=user.id,
        token_hash=_token_hash(token),
        doctor_email=email,
        doctor_email_masked=_mask_email(email),
        doctor_name=body.doctor_name or None,
        language=locale,
        document_ids=ids,
        expires_at=utcnow() + timedelta(days=days),
    )
    db.add(share)
    await db.flush()
    record_consent(
        db,
        user.id,
        ConsentKind.SHARE_WITH_HOME_DOCTOR,
        CONSENT_VERSION,
        request,
        granted=True,
        case_id=summary.case_id,
    )
    await audit_log(
        db,
        actor=user,
        action="discharge_share.create",
        entity_type="discharge_share",
        entity_id=share.id,
        after={
            "discharge_summary_id": summary.id,
            "doctor_email": share.doctor_email_masked,
            "documents": len(ids),
            "expires_at": share.expires_at,
        },
        request=request,
    )
    url = share_url(token)
    patient = await db.get(PatientProfile, summary.patient_id)
    patient_name = patient.full_name if patient else user.full_name
    expires = share.expires_at.strftime("%d %b %Y")
    await enqueue(
        db,
        "email.send",
        {
            "to": email,
            "subject": t("discharge.share_email.subject", locale, patient=patient_name),
            "template": "generic_notification.html",
            "locale": locale,
            "context": {
                "title": t("discharge.share_email.title", locale),
                "body": t("discharge.share_email.body", locale, patient=patient_name, date=expires)
                + "\n\n"
                + t("discharge.share_email.privacy", locale),
                "name": body.doctor_name or "",
                "url": url,
                "action_label": t("discharge.share_email.action", locale),
            },
        },
        max_attempts=5,
    )
    await db.commit()
    out = share_out(share)
    return s.ShareCreatedOut(**out.model_dump(), url=url)


async def list_shares(db: AsyncSession, user: User, summary_id: uuid.UUID) -> list[s.ShareOut]:
    summary, access = await get_summary(db, user, summary_id)
    if access not in ("patient", "staff"):
        raise Forbidden("Only the patient can see their share links", code="patient_only")
    rows = (
        (
            await db.execute(
                select(DischargeShare)
                .where(DischargeShare.discharge_summary_id == summary.id)
                .order_by(DischargeShare.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    now = utcnow()
    return [share_out(r, now) for r in rows]


async def revoke_share(
    db: AsyncSession, user: User, summary_id: uuid.UUID, share_id: uuid.UUID, request: Request | None
) -> s.ShareOut:
    summary, access = await get_summary(db, user, summary_id)
    if access not in ("patient", "staff"):
        raise Forbidden("Only the patient can revoke their share links", code="patient_only")
    share = (
        await db.execute(
            select(DischargeShare)
            .where(DischargeShare.id == share_id, DischargeShare.discharge_summary_id == summary.id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if share is None:
        raise NotFound("Share link not found")
    if share.revoked_at is None:
        share.revoked_at = utcnow()
        await audit_log(
            db,
            actor=user,
            action="discharge_share.revoke",
            entity_type="discharge_share",
            entity_id=share.id,
            request=request,
        )
        await db.commit()
    return share_out(share)


@dataclass(slots=True)
class ShareContext:
    share: DischargeShare
    summary: DischargeSummary


async def resolve_share(db: AsyncSession, token: str) -> ShareContext:
    """The active share for ``token`` (404 for unknown, expired or revoked links - indistinguishable)."""
    if not token or len(token) > 100:
        raise NotFound("This link is not valid", code="share_not_found")
    share = (
        await db.execute(
            select(DischargeShare).where(DischargeShare.token_hash == _token_hash(token)).with_for_update()
        )
    ).scalar_one_or_none()
    if share is None or share.revoked_at is not None or share.expires_at <= utcnow():
        raise NotFound("This link is not valid or has expired", code="share_not_found")
    summary = await db.get(DischargeSummary, share.discharge_summary_id)
    if summary is None or DischargeSummaryStatus(summary.status) != DischargeSummaryStatus.FINAL:
        raise NotFound("This link is not valid or has expired", code="share_not_found")
    return ShareContext(share=share, summary=summary)


async def audit_share_access(
    db: AsyncSession, ctx: ShareContext, request: Request | None, action: str, resource_id: Any = None
) -> None:
    """PHI access through a home-doctor link (no user account: actor role ``home_doctor``)."""
    await audit_log(
        db,
        actor=None,
        actor_role="home_doctor",
        action=action,
        entity_type="discharge_summary" if resource_id is None else "document",
        entity_id=resource_id or ctx.summary.id,
        after={
            "patient_id": str(ctx.summary.patient_id),
            "share_id": str(ctx.share.id),
            "doctor_email": ctx.share.doctor_email_masked,
        },
        request=request,
    )
    if action == "phi.view":
        ctx.share.view_count += 1
        ctx.share.last_viewed_at = utcnow()
    await db.commit()


async def public_view(db: AsyncSession, ctx: ShareContext) -> s.PublicShareOut:
    summary = ctx.summary
    patient = await _required(db, PatientProfile, summary.patient_id)
    hospital = await _required(db, Hospital, summary.hospital_id)
    out = await summary_out(db, summary)
    sex = _gender(patient.gender)
    return s.PublicShareOut(
        patient_name=patient.full_name,
        patient_date_of_birth=patient.date_of_birth,
        patient_sex=sex,
        hospital_name=hospital.name,
        hospital_address=", ".join(
            x for x in (hospital.address, hospital.city, country_name(hospital.country)) if x
        )
        or None,
        hospital_phone=hospital.phone,
        hospital_email=hospital.email,
        summary=out,
        documents=await _attachments(db, list(ctx.share.document_ids or [])),
        expires_at=ctx.share.expires_at,
        shared_by_name=patient.full_name,
    )


async def public_document(
    db: AsyncSession, ctx: ShareContext, document_id: uuid.UUID
) -> tuple[Document, bytes]:
    if document_id not in (ctx.share.document_ids or []):
        raise NotFound("Document not found")
    doc = await db.get(Document, document_id)
    if doc is None or doc.deleted_at is not None:
        raise NotFound("Document not found")
    return doc, await get_storage().open(doc.storage_key)


# ============================================================================================ reminders
def reminder_out(r: MedicationReminder) -> s.MedicationReminderOut:
    return s.MedicationReminderOut(
        id=r.id,
        discharge_summary_id=r.discharge_summary_id,
        name=r.name,
        dose=r.dose,
        frequency=r.frequency,
        start_on=r.start_on,
        end_on=r.end_on,
        enabled=r.enabled,
        remind_hour=r.remind_hour,
        timezone=r.timezone,
        last_sent_on=r.last_sent_on,
    )


async def list_reminders(
    db: AsyncSession, user: User, summary_id: uuid.UUID
) -> list[s.MedicationReminderOut]:
    summary, access = await get_summary(db, user, summary_id)
    if access not in ("patient", "agent", "staff"):
        raise Forbidden("Medication reminders belong to the patient", code="patient_only")
    rows = (
        (
            await db.execute(
                select(MedicationReminder)
                .where(MedicationReminder.discharge_summary_id == summary.id)
                .order_by(MedicationReminder.position)
            )
        )
        .scalars()
        .all()
    )
    return [reminder_out(r) for r in rows]


async def set_reminders(
    db: AsyncSession,
    user: User,
    summary_id: uuid.UUID,
    body: s.MedicationRemindersUpdate,
    request: Request | None,
) -> list[s.MedicationReminderOut]:
    from app.modules.auth.service import record_consent

    summary, access = await get_summary(db, user, summary_id)
    if access != "patient":
        raise Forbidden("Only the patient can switch medication reminders", code="patient_only")
    rows = list(
        (
            await db.execute(
                select(MedicationReminder)
                .where(MedicationReminder.discharge_summary_id == summary.id)
                .order_by(MedicationReminder.position)
                .with_for_update()
            )
        )
        .scalars()
        .all()
    )
    if not rows:
        raise BadRequest("This summary has no medicines to remind you about", code="no_medications")
    if summary.superseded_at is not None and body.enabled:
        raise BadRequest("Use the latest version of the summary", code="discharge_summary_superseded")
    for r in rows:
        r.enabled = body.enabled
        r.remind_hour = body.remind_hour
        r.timezone = body.timezone
    record_consent(
        db, user.id, ConsentKind.MEDICATION_REMINDERS, CONSENT_VERSION, request, granted=body.enabled
    )
    await audit_log(
        db,
        actor=user,
        action="medication_reminders.update",
        entity_type="discharge_summary",
        entity_id=summary.id,
        after={"enabled": body.enabled, "remind_hour": body.remind_hour, "timezone": body.timezone},
        request=request,
    )
    await db.commit()
    return [reminder_out(r) for r in rows]


def resolve_tz(name: str) -> timezone | ZoneInfo:
    if name == "UTC":
        return UTC
    if name[:1] in "+-" and len(name) == 6:
        sign = 1 if name[0] == "+" else -1
        hours, minutes = int(name[1:3]), int(name[4:6])
        return timezone(sign * timedelta(hours=hours, minutes=minutes))
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        return UTC
