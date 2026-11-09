"""Build API shapes (CaseOut, BookingOut, QuoteOut, ...) with batched lookups (no N+1, no lazy loads)."""

from __future__ import annotations

import uuid
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from datetime import date
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.dialects.postgresql import distinct_on
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import BookingStatus
from app.models import (
    Agent,
    Booking,
    Case,
    CaseDocument,
    CaseStatusHistory,
    Consultation,
    Doctor,
    Document,
    Hospital,
    PatientProfile,
    Procedure,
    Quote,
    Screening,
    Specialty,
    TreatmentPackage,
    User,
)
from app.modules.cases.common import utcnow
from app.modules.cases.emergency import ack_required, screening_urgencies
from app.modules.cases.quick_quote import quote_clock
from app.modules.cases.schemas import (
    AgentRef,
    BookingOut,
    CaseDetail,
    CaseDocumentOut,
    CaseOut,
    ConsultationOut,
    DoctorRef,
    HospitalRef,
    NamedRef,
    PackageOut,
    PatientRef,
    QuoteOut,
    RefundTier,
    TimelineEntry,
    UserRef,
)


def _ids(values: Iterable[uuid.UUID | None]) -> set[uuid.UUID]:
    return {v for v in values if v is not None}


def age_on(dob: date | None, today: date | None = None) -> int | None:
    if dob is None:
        return None
    today = today or date.today()
    years = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
    return max(years, 0)


@dataclass
class Refs:
    patients: dict[uuid.UUID, PatientProfile] = field(default_factory=dict)
    agents: dict[uuid.UUID, Agent] = field(default_factory=dict)
    hospitals: dict[uuid.UUID, Hospital] = field(default_factory=dict)
    doctors: dict[uuid.UUID, tuple[Doctor, str | None]] = field(default_factory=dict)
    procedures: dict[uuid.UUID, Procedure] = field(default_factory=dict)
    specialties: dict[uuid.UUID, Specialty] = field(default_factory=dict)
    users: dict[uuid.UUID, User] = field(default_factory=dict)
    packages: dict[uuid.UUID, TreatmentPackage] = field(default_factory=dict)

    # ------------------------------------------------------------------ ref builders
    def patient(self, pid: uuid.UUID) -> PatientRef:
        p = self.patients.get(pid)
        if p is None:
            return PatientRef(id=pid, full_name="")
        return PatientRef(
            id=p.id,
            full_name=p.full_name,
            nationality=p.nationality,
            gender=str(p.gender.value) if p.gender is not None else None,
            age=age_on(p.date_of_birth),
        )

    def agent(self, aid: uuid.UUID | None) -> AgentRef | None:
        a = self.agents.get(aid) if aid else None
        return AgentRef(id=a.id, agency_name=a.agency_name) if a else None

    def hospital(self, hid: uuid.UUID) -> HospitalRef:
        h = self.hospitals.get(hid)
        if h is None:
            return HospitalRef(id=hid, slug="", name="")
        return HospitalRef(id=h.id, slug=h.slug, name=h.name, city=h.city)

    def doctor(self, did: uuid.UUID | None) -> DoctorRef | None:
        entry = self.doctors.get(did) if did else None
        if entry is None:
            return None
        doc, specialty_name = entry
        return DoctorRef(id=doc.id, full_name=doc.full_name, specialty_name=specialty_name)

    def procedure(self, pid: uuid.UUID | None) -> NamedRef | None:
        p = self.procedures.get(pid) if pid else None
        return NamedRef(id=p.id, slug=p.slug, name=p.name) if p else None

    def specialty(self, sid: uuid.UUID | None) -> NamedRef | None:
        s = self.specialties.get(sid) if sid else None
        return NamedRef(id=s.id, slug=s.slug, name=s.name) if s else None

    def user(self, uid: uuid.UUID | None) -> UserRef | None:
        u = self.users.get(uid) if uid else None
        return UserRef(id=u.id, full_name=u.full_name) if u else None

    def user_name(self, uid: uuid.UUID | None) -> str | None:
        u = self.users.get(uid) if uid else None
        return u.full_name if u else None

    def package(self, pid: uuid.UUID | None) -> PackageOut | None:
        p = self.packages.get(pid) if pid else None
        if p is None:
            return None
        return PackageOut(
            id=p.id,
            name=p.name,
            tier=p.tier,
            price_minor=p.price_minor,
            original_price_minor=p.original_price_minor,
            currency=p.currency,
            description=p.description,
            includes=dict(p.includes or {}),
        )


async def load_refs(
    db: AsyncSession,
    *,
    patient_ids: Iterable[uuid.UUID | None] = (),
    agent_ids: Iterable[uuid.UUID | None] = (),
    hospital_ids: Iterable[uuid.UUID | None] = (),
    doctor_ids: Iterable[uuid.UUID | None] = (),
    procedure_ids: Iterable[uuid.UUID | None] = (),
    specialty_ids: Iterable[uuid.UUID | None] = (),
    user_ids: Iterable[uuid.UUID | None] = (),
    package_ids: Iterable[uuid.UUID | None] = (),
) -> Refs:
    refs = Refs()
    if ids := _ids(patient_ids):
        rows = (await db.execute(select(PatientProfile).where(PatientProfile.id.in_(ids)))).scalars()
        refs.patients = {p.id: p for p in rows}
    if ids := _ids(agent_ids):
        rows_a = (await db.execute(select(Agent).where(Agent.id.in_(ids)))).scalars()
        refs.agents = {a.id: a for a in rows_a}
    if ids := _ids(hospital_ids):
        rows_h = (await db.execute(select(Hospital).where(Hospital.id.in_(ids)))).scalars()
        refs.hospitals = {h.id: h for h in rows_h}
    if ids := _ids(doctor_ids):
        result = await db.execute(
            select(Doctor, Specialty.name)
            .join(Specialty, Specialty.id == Doctor.specialty_id, isouter=True)
            .where(Doctor.id.in_(ids))
        )
        refs.doctors = {doc.id: (doc, sname) for doc, sname in result.all()}
    if ids := _ids(procedure_ids):
        rows_p = (await db.execute(select(Procedure).where(Procedure.id.in_(ids)))).scalars()
        refs.procedures = {p.id: p for p in rows_p}
    if ids := _ids(specialty_ids):
        rows_s = (await db.execute(select(Specialty).where(Specialty.id.in_(ids)))).scalars()
        refs.specialties = {s.id: s for s in rows_s}
    if ids := _ids(user_ids):
        rows_u = (await db.execute(select(User).where(User.id.in_(ids)))).scalars()
        refs.users = {u.id: u for u in rows_u}
    if ids := _ids(package_ids):
        rows_k = (await db.execute(select(TreatmentPackage).where(TreatmentPackage.id.in_(ids)))).scalars()
        refs.packages = {k.id: k for k in rows_k}
    return refs


# --------------------------------------------------------------------------------------------- quotes
def quote_out(q: Quote, refs: Refs) -> QuoteOut:
    return QuoteOut(
        id=q.id,
        case_id=q.case_id,
        status=q.status,
        treatment_plan=q.treatment_plan,
        line_items=list(q.line_items or []),
        total_minor=q.total_minor,
        currency=q.currency,
        estimated_stay_days=q.estimated_stay_days,
        valid_until=q.valid_until,
        prepared_by_name=refs.user_name(q.prepared_by_user_id),
        rejected_reason=q.rejected_reason,
        created_at=q.created_at,
        accepted_at=q.accepted_at,
    )


async def quote_outs(db: AsyncSession, quotes: Sequence[Quote]) -> list[QuoteOut]:
    refs = await load_refs(db, user_ids=(q.prepared_by_user_id for q in quotes))
    return [quote_out(q, refs) for q in quotes]


# --------------------------------------------------------------------------------------------- bookings
def _refund_tiers(policy: list[dict[str, Any]] | None) -> list[RefundTier] | None:
    if policy is None:
        return None
    return [
        RefundTier(days_before=int(t.get("days_before", 0)), refund_pct=int(t.get("refund_pct", 0)))
        for t in policy
        if isinstance(t, dict)
    ]


def booking_out(b: Booking, refs: Refs) -> BookingOut:
    patient = refs.patient(b.patient_id)
    return BookingOut(
        id=b.id,
        booking_number=b.booking_number,
        case_id=b.case_id,
        status=b.status,
        patient=patient,
        hospital=refs.hospital(b.hospital_id),
        doctor=refs.doctor(b.doctor_id),
        procedure=refs.procedure(b.procedure_id),
        package=refs.package(b.package_id),
        quote_id=b.quote_id,
        admission_date=b.admission_date,
        discharge_date=b.discharge_date,
        duration_days=b.duration_days,
        payment_option=b.payment_option,
        installment_months=b.installment_months,
        insurance_claim_requested=b.insurance_claim_requested,
        currency=b.currency,
        subtotal_minor=b.subtotal_minor,
        discount_minor=b.discount_minor,
        service_fee_minor=b.service_fee_minor,
        tax_minor=b.tax_minor,
        total_minor=b.total_minor,
        deposit_minor=b.deposit_minor,
        amount_paid_minor=b.amount_paid_minor,
        amount_refunded_minor=b.amount_refunded_minor,
        balance_due_minor=b.balance_due_minor,
        cancel_reason=b.cancel_reason,
        refund_policy=_refund_tiers(b.refund_policy),
        created_at=b.created_at,
        confirmed_at=b.confirmed_at,
        admitted_at=b.admitted_at,
        completed_at=b.completed_at,
        cancelled_at=b.cancelled_at,
    )


def _booking_ref_ids(bookings: Sequence[Booking]) -> dict[str, Any]:
    return {
        "patient_ids": [b.patient_id for b in bookings],
        "hospital_ids": [b.hospital_id for b in bookings],
        "doctor_ids": [b.doctor_id for b in bookings],
        "procedure_ids": [b.procedure_id for b in bookings],
        "package_ids": [b.package_id for b in bookings],
    }


async def booking_outs(db: AsyncSession, bookings: Sequence[Booking]) -> list[BookingOut]:
    refs = await load_refs(db, **_booking_ref_ids(bookings))
    return [booking_out(b, refs) for b in bookings]


async def booking_out_one(db: AsyncSession, booking: Booking) -> BookingOut:
    return (await booking_outs(db, [booking]))[0]


# --------------------------------------------------------------------------------------------- cases
async def _latest_quotes(db: AsyncSession, case_ids: set[uuid.UUID]) -> dict[uuid.UUID, Quote]:
    if not case_ids:
        return {}
    rows = (
        await db.execute(
            select(Quote)
            .where(Quote.case_id.in_(case_ids))
            .ext(distinct_on(Quote.case_id))
            .order_by(Quote.case_id, Quote.created_at.desc(), Quote.id.desc())
        )
    ).scalars()
    return {q.case_id: q for q in rows}


async def _case_bookings(db: AsyncSession, case_ids: set[uuid.UUID]) -> dict[uuid.UUID, Booking]:
    """The active booking of each case, else its most recent (cancelled) booking."""
    if not case_ids:
        return {}
    rows = (
        await db.execute(
            select(Booking)
            .where(Booking.case_id.in_(case_ids))
            .order_by(Booking.case_id, Booking.created_at.desc(), Booking.id.desc())
        )
    ).scalars()
    chosen: dict[uuid.UUID, Booking] = {}
    for b in rows:
        current = chosen.get(b.case_id)
        if current is None or (
            current.status == BookingStatus.CANCELLED and b.status != BookingStatus.CANCELLED
        ):
            chosen[b.case_id] = b
    return chosen


async def case_outs(db: AsyncSession, cases: Sequence[Case]) -> list[CaseOut]:
    if not cases:
        return []
    case_ids = {c.id for c in cases}
    quotes = await _latest_quotes(db, case_ids)
    bookings = await _case_bookings(db, case_ids)
    urgencies = await screening_urgencies(db, [c.screening_id for c in cases])
    booking_ids = _booking_ref_ids(list(bookings.values()))
    refs = await load_refs(
        db,
        patient_ids=[c.patient_id for c in cases] + booking_ids["patient_ids"],
        agent_ids=[c.agent_id for c in cases],
        hospital_ids=[c.hospital_id for c in cases] + booking_ids["hospital_ids"],
        doctor_ids=[c.doctor_id for c in cases] + booking_ids["doctor_ids"],
        procedure_ids=[c.procedure_id for c in cases] + booking_ids["procedure_ids"],
        specialty_ids=[c.specialty_id for c in cases],
        user_ids=[c.coordinator_user_id for c in cases] + [q.prepared_by_user_id for q in quotes.values()],
        package_ids=booking_ids["package_ids"],
    )
    out: list[CaseOut] = []
    now = utcnow()
    for c in cases:
        q = quotes.get(c.id)
        b = bookings.get(c.id)
        urgency = urgencies.get(c.screening_id) if c.screening_id else None
        overdue, hours_left = quote_clock(c, now)
        out.append(
            CaseOut(
                id=c.id,
                case_number=c.case_number,
                status=c.status,
                patient=refs.patient(c.patient_id),
                agent=refs.agent(c.agent_id),
                hospital=refs.hospital(c.hospital_id),
                doctor=refs.doctor(c.doctor_id),
                procedure=refs.procedure(c.procedure_id),
                specialty=refs.specialty(c.specialty_id),
                screening_id=c.screening_id,
                coordinator=refs.user(c.coordinator_user_id),
                patient_notes=c.patient_notes,
                latest_quote=quote_out(q, refs) if q else None,
                booking=booking_out(b, refs) if b else None,
                urgency=urgency,
                emergency_ack_required=ack_required(c, urgency),
                emergency_acknowledged_at=c.emergency_acknowledged_at,
                quote_due_at=c.quote_due_at,
                first_quote_at=c.first_quote_at,
                quote_overdue=overdue,
                hours_left=hours_left,
                quote_group_id=c.quote_group_id,
                created_at=c.created_at,
                updated_at=c.updated_at,
            )
        )
    return out


async def case_out_one(db: AsyncSession, case: Case) -> CaseOut:
    return (await case_outs(db, [case]))[0]


def screening_dict(s: Screening, specialty: Specialty | None) -> dict[str, Any]:
    """``ScreeningOut`` shape (PLAN 8.6) built from the model (read-only view for the case detail)."""
    return {
        "id": str(s.id),
        "status": str(s.status.value),
        "patient_id": str(s.patient_id),
        "specialty": (
            {"id": str(specialty.id), "slug": specialty.slug, "name": specialty.name} if specialty else None
        ),
        "body_areas": list(s.body_areas or []),
        "pain_intensity": s.pain_intensity,
        "symptoms": list(s.symptoms or []),
        "duration_value": s.duration_value,
        "duration_unit": str(s.duration_unit.value) if s.duration_unit is not None else None,
        "severity": dict(s.severity or {}),
        "previous_treatments": list(s.previous_treatments or []),
        "notes": s.notes,
        "preferences": dict(s.preferences or {}),
        "report_document_ids": [str(x) for x in (s.report_document_ids or [])],
        "consent_ai": s.consent_ai,
        "home_country": s.home_country,
        "ai_result": s.ai_result,
        "urgency": str(s.urgency.value) if s.urgency is not None else None,
        "red_flags": list(s.red_flags or []),
        "error": s.error,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "submitted_at": s.submitted_at.isoformat() if s.submitted_at else None,
        "completed_at": s.completed_at.isoformat() if s.completed_at else None,
    }


async def case_detail(db: AsyncSession, case: Case) -> CaseDetail:
    base = await case_out_one(db, case)
    quotes = list(
        (
            await db.execute(
                select(Quote).where(Quote.case_id == case.id).order_by(Quote.created_at.desc(), Quote.id)
            )
        ).scalars()
    )
    history = list(
        (
            await db.execute(
                select(CaseStatusHistory)
                .where(CaseStatusHistory.case_id == case.id)
                .order_by(CaseStatusHistory.created_at, CaseStatusHistory.id)
            )
        ).scalars()
    )
    documents = list(
        (
            await db.execute(
                select(Document)
                .where(
                    or_(
                        Document.case_id == case.id,
                        Document.id.in_(
                            select(CaseDocument.document_id).where(CaseDocument.case_id == case.id)
                        ),
                    ),
                    Document.deleted_at.is_(None),
                )
                .order_by(Document.created_at.desc(), Document.id)
            )
        ).scalars()
    )
    refs = await load_refs(
        db,
        user_ids=[q.prepared_by_user_id for q in quotes]
        + [h.changed_by_user_id for h in history]
        + [d.owner_user_id for d in documents],
    )
    screening: dict[str, Any] | None = None
    if case.screening_id is not None:
        s = await db.get(Screening, case.screening_id)
        if s is not None:
            spec = await db.get(Specialty, s.specialty_id) if s.specialty_id else None
            screening = screening_dict(s, spec)
    return CaseDetail(
        **base.model_dump(),
        medical_summary=case.medical_summary,
        quotes=[quote_out(q, refs) for q in quotes],
        timeline=[
            TimelineEntry(
                from_status=h.from_status,
                to_status=h.to_status,
                note=h.note,
                changed_by_name=refs.user_name(h.changed_by_user_id),
                created_at=h.created_at,
            )
            for h in history
        ],
        screening=screening,
        documents=[
            CaseDocumentOut(
                id=d.id,
                kind=d.kind,
                file_name=d.file_name,
                content_type=d.content_type,
                size_bytes=d.size_bytes,
                status=d.status,
                case_id=d.case_id,
                patient_id=d.patient_id,
                created_at=d.created_at,
                uploaded_by_name=refs.user_name(d.owner_user_id),
            )
            for d in documents
        ],
    )


# --------------------------------------------------------------------------------------------- consultations
async def consultation_outs(db: AsyncSession, items: Sequence[Consultation]) -> list[ConsultationOut]:
    if not items:
        return []
    case_rows = (
        await db.execute(
            select(Case.id, Case.case_number, Case.hospital_id).where(Case.id.in_({c.case_id for c in items}))
        )
    ).all()
    cases = {row.id: row for row in case_rows}
    refs = await load_refs(
        db,
        doctor_ids=[c.doctor_id for c in items],
        patient_ids=[c.patient_id for c in items],
        hospital_ids=[row.hospital_id for row in case_rows],
    )
    out: list[ConsultationOut] = []
    for c in items:
        crow = cases.get(c.case_id)
        out.append(
            ConsultationOut(
                id=c.id,
                case_id=c.case_id,
                case_number=crow.case_number if crow else None,
                doctor=refs.doctor(c.doctor_id),
                patient=refs.patient(c.patient_id),
                hospital=refs.hospital(crow.hospital_id) if crow else None,
                scheduled_at=c.scheduled_at,
                duration_min=c.duration_min,
                mode=c.mode,
                meeting_url=c.meeting_url,
                status=c.status,
                kind=c.kind,
                due_at=c.due_at,
                followup_day=c.followup_day,
                fee_minor=c.fee_minor,
                currency=c.currency,
                notes=c.notes,
                created_at=c.created_at,
                updated_at=c.updated_at,
            )
        )
    return out
