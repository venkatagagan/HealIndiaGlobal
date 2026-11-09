"""Screening business logic (PLAN 7 and 8.6): questionnaire CRUD, submit/rerun, the AI/rules triage run, and
match presentation."""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import UTC, date, datetime
from typing import Any, cast

import structlog
from fastapi import Request
from pydantic import ValidationError
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ai_quota import take_global_budget
from app.core.audit import audit_log
from app.core.config import settings
from app.core.deps import PageQuery
from app.core.enums import (
    AIEngine,
    AIRequestStatus,
    ConsentKind,
    HospitalStatus,
    ScreeningStatus,
    SlotKind,
)
from app.core.errors import BadRequest, Conflict, ValidationFailed
from app.core.events import publish
from app.core.jobs import enqueue
from app.core.pagination import Page, paginate
from app.core.settings_store import get_setting
from app.core.storage import ObjectNotFound, get_storage
from app.models import (
    AIRequestLog,
    Doctor,
    Document,
    Hospital,
    HospitalProcedure,
    HospitalSpecialty,
    PatientProfile,
    Procedure,
    Screening,
    ScreeningMatch,
    Specialty,
    TreatmentPackage,
    User,
)
from app.modules.auth.service import record_consent
from app.modules.catalog.earliest import slot_minima
from app.modules.privacy.guards import ensure_guardian_consent
from app.modules.screening import policies
from app.modules.screening.ai import claude
from app.modules.screening.ai.prompts import build_intake
from app.modules.screening.ai.rules import rules_triage
from app.modules.screening.ai.schema import CatalogProcedure, CatalogSnapshot, CatalogSpecialty, TriageResult
from app.modules.screening.matching import compute_matches, compute_savings
from app.modules.screening.schemas import (
    DoctorCard,
    HospitalCard,
    HospitalRef,
    MatchOut,
    PackageOut,
    PreferencesIn,
    ProcedureRef,
    SavingsOut,
    ScreeningCreate,
    ScreeningOut,
    ScreeningUpdate,
    SpecialtyRef,
    SubmitIn,
)

logger = structlog.get_logger(__name__)

AI_CONSENT_VERSION = "ai-screening-2026-10"
RUN_AI_TASK = "screening.run_ai"
AI_PURPOSE = "screening.triage"


def _now() -> datetime:
    return datetime.now(UTC)


# --------------------------------------------------------------------------------------------- presentation
async def _specialties_by_id(db: AsyncSession, ids: set[uuid.UUID]) -> dict[uuid.UUID, Specialty]:
    if not ids:
        return {}
    rows = (await db.execute(select(Specialty).where(Specialty.id.in_(ids)))).scalars().all()
    return {s.id: s for s in rows}


def _to_out(screening: Screening, specialty: Specialty | None) -> ScreeningOut:
    ai_result: TriageResult | None = None
    if screening.ai_result:
        try:
            ai_result = TriageResult.model_validate(screening.ai_result)
        except ValidationError:  # stored by an older schema: hide rather than 500
            ai_result = None
    return ScreeningOut(
        id=screening.id,
        status=screening.status,
        patient_id=screening.patient_id,
        specialty=SpecialtyRef.model_validate(specialty) if specialty is not None else None,
        body_areas=list(screening.body_areas or []),
        pain_intensity=screening.pain_intensity,
        symptoms=list(screening.symptoms or []),
        duration_value=screening.duration_value,
        duration_unit=screening.duration_unit,
        severity=dict(screening.severity or {}),
        previous_treatments=list(screening.previous_treatments or []),
        notes=screening.notes,
        preferences=dict(screening.preferences or {}),
        report_document_ids=list(screening.report_document_ids or []),
        consent_ai=screening.consent_ai,
        home_country=screening.home_country,
        ai_result=ai_result,
        urgency=screening.urgency,
        red_flags=list(screening.red_flags or []),
        error=screening.error,
        created_at=screening.created_at,
        submitted_at=screening.submitted_at,
        completed_at=screening.completed_at,
    )


async def to_out(db: AsyncSession, screening: Screening) -> ScreeningOut:
    specialty = await db.get(Specialty, screening.specialty_id) if screening.specialty_id else None
    return _to_out(screening, specialty)


async def to_out_many(db: AsyncSession, screenings: Sequence[Screening]) -> list[ScreeningOut]:
    specs = await _specialties_by_id(db, {s.specialty_id for s in screenings if s.specialty_id})
    return [_to_out(s, specs.get(s.specialty_id) if s.specialty_id else None) for s in screenings]


# --------------------------------------------------------------------------------------------- helpers
async def _active_specialty(db: AsyncSession, slug: str) -> Specialty:
    spec = (
        await db.execute(select(Specialty).where(Specialty.slug == slug, Specialty.is_active.is_(True)))
    ).scalar_one_or_none()
    if spec is None:
        raise BadRequest("Unknown specialty", code="invalid_specialty", details={"specialty_slug": slug})
    return spec


async def _validate_currency(db: AsyncSession, currency: str | None) -> None:
    if not currency:
        return
    supported = await get_setting(db, "supported_currencies") or []
    if currency not in {str(c).upper() for c in supported}:
        raise BadRequest(
            "Unsupported budget currency", code="unsupported_currency", details={"budget_currency": currency}
        )


async def _validate_documents(
    db: AsyncSession, profile: PatientProfile, user: User, ids: list[uuid.UUID]
) -> None:
    if not ids:
        return
    owners = {profile.user_id, user.id}
    rows = (
        await db.execute(
            select(Document.id, Document.patient_id, Document.owner_user_id).where(
                Document.id.in_(ids), Document.deleted_at.is_(None)
            )
        )
    ).all()
    allowed = {r.id for r in rows if r.patient_id == profile.id or r.owner_user_id in owners}
    missing = [str(i) for i in ids if i not in allowed]
    if missing:
        raise BadRequest(
            "Unknown report document", code="invalid_document", details={"document_ids": missing}
        )


def _home_country(screening: Screening, profile: PatientProfile | None) -> str | None:
    if screening.home_country:
        return screening.home_country
    if profile is None:
        return None
    return profile.country_of_residence or profile.nationality


def _ensure_draft(screening: Screening) -> None:
    if screening.status != ScreeningStatus.DRAFT:
        raise Conflict(
            "This screening has already been submitted",
            code="screening_not_draft",
            details={"status": str(screening.status)},
        )


# --------------------------------------------------------------------------------------------- commands
async def create_screening(
    db: AsyncSession, user: User, body: ScreeningCreate, request: Request | None = None
) -> ScreeningOut:
    policies.ensure_can_modify(user)
    profile = await policies.resolve_patient_for_create(db, user, body.patient_id)
    specialty = await _active_specialty(db, body.specialty_slug) if body.specialty_slug else None
    screening = Screening(
        patient_id=profile.id,
        created_by_user_id=user.id,
        specialty_id=specialty.id if specialty else None,
        status=ScreeningStatus.DRAFT,
        home_country=(profile.country_of_residence or profile.nationality),
        preferences={"use_ai": True},
    )
    db.add(screening)
    await db.flush()
    await audit_log(
        db,
        actor=user,
        action="screening.create",
        entity_type="screening",
        entity_id=screening.id,
        after={"patient_id": str(profile.id), "specialty_id": str(specialty.id) if specialty else None},
        request=request,
    )
    await db.commit()
    return _to_out(screening, specialty)


async def update_screening(
    db: AsyncSession, user: User, screening_id: uuid.UUID, body: ScreeningUpdate
) -> ScreeningOut:
    policies.ensure_can_modify(user)
    screening, profile = await policies.get_screening_scoped(db, user, screening_id, for_update=True)
    _ensure_draft(screening)
    fields = body.model_fields_set

    if "specialty_slug" in fields:
        screening.specialty_id = (
            (await _active_specialty(db, body.specialty_slug)).id if body.specialty_slug else None
        )
    if "body_areas" in fields:
        screening.body_areas = list(body.body_areas or [])
    if "pain_intensity" in fields:
        screening.pain_intensity = body.pain_intensity
    if "symptoms" in fields:
        screening.symptoms = [s.model_dump(mode="json") for s in body.symptoms or []]
    if "duration_value" in fields:
        screening.duration_value = body.duration_value
    if "duration_unit" in fields:
        screening.duration_unit = body.duration_unit
    if "severity" in fields:
        screening.severity = body.severity.model_dump(mode="json", exclude_none=True) if body.severity else {}
    if "previous_treatments" in fields:
        screening.previous_treatments = [str(t) for t in body.previous_treatments or []]
    if "notes" in fields:
        screening.notes = body.notes or None
    if "home_country" in fields:
        screening.home_country = body.home_country
    if "report_document_ids" in fields:
        ids = list(body.report_document_ids or [])
        await _validate_documents(db, profile, user, ids)
        screening.report_document_ids = ids
    if "preferences" in fields:
        incoming = body.preferences.model_dump(mode="json", exclude_unset=True) if body.preferences else {}
        merged = {**dict(screening.preferences or {}), **incoming} if body.preferences else {"use_ai": True}
        try:
            prefs = PreferencesIn.model_validate(merged)
        except ValidationError as exc:
            raise ValidationFailed(
                "Invalid preferences",
                details=[{"loc": ["body", "preferences", *e["loc"]], "msg": e["msg"]} for e in exc.errors()],
            ) from exc
        await _validate_currency(db, prefs.budget_currency)
        screening.preferences = prefs.model_dump(mode="json")

    await db.commit()
    return await to_out(db, screening)


async def _start_processing(db: AsyncSession, screening: Screening) -> None:
    screening.status = ScreeningStatus.PROCESSING
    screening.submitted_at = _now()
    screening.completed_at = None
    screening.error = None
    await enqueue(
        db,
        RUN_AI_TASK,
        {"screening_id": str(screening.id)},
        dedupe_key=f"{RUN_AI_TASK}:{screening.id}",
        max_attempts=3,
    )


async def submit_screening(
    db: AsyncSession, user: User, screening_id: uuid.UUID, body: SubmitIn, request: Request | None = None
) -> ScreeningOut:
    policies.ensure_can_modify(user)
    screening, profile = await policies.get_screening_scoped(db, user, screening_id, for_update=True)
    _ensure_draft(screening)
    await ensure_guardian_consent(db, profile)  # DPDP s.9: a minor's screening needs a guardian's consent
    use_ai = bool((screening.preferences or {}).get("use_ai", True))
    if use_ai and not body.consent_ai:
        raise BadRequest(
            "Consent to AI processing is required, or turn off AI to use the standard rules",
            code="consent_required",
        )
    if not (
        screening.specialty_id
        or screening.body_areas
        or screening.symptoms
        or (screening.notes or "").strip()
    ):
        raise BadRequest(
            "Choose a specialty or describe your symptoms before submitting", code="screening_incomplete"
        )
    if body.consent_ai:
        # SEC-060: an agent acting for the patient is recorded as the granter (``record_consent`` stores
        # it only when it is not the patient), so the row is not the patient's own confirmation.
        record_consent(
            db,
            profile.user_id,
            ConsentKind.AI_PROCESSING,
            AI_CONSENT_VERSION,
            request,
            granted_by_user_id=user.id,
        )
    screening.consent_ai = body.consent_ai
    screening.home_country = _home_country(screening, profile)
    await _start_processing(db, screening)
    await audit_log(
        db,
        actor=user,
        action="screening.submit",
        entity_type="screening",
        entity_id=screening.id,
        after={"consent_ai": body.consent_ai, "use_ai": use_ai},
        request=request,
    )
    await db.commit()
    return await to_out(db, screening)


async def rerun_screening(
    db: AsyncSession, user: User, screening_id: uuid.UUID, request: Request | None = None
) -> ScreeningOut:
    policies.ensure_can_modify(user)
    screening, profile = await policies.get_screening_scoped(db, user, screening_id, for_update=True)
    await ensure_guardian_consent(db, profile)
    if screening.status not in (ScreeningStatus.COMPLETED, ScreeningStatus.FAILED):
        raise Conflict(
            "Only completed or failed screenings can be re-run",
            code="screening_not_rerunnable",
            details={"status": str(screening.status)},
        )
    screening.home_country = _home_country(screening, profile)
    await _start_processing(db, screening)
    await audit_log(
        db,
        actor=user,
        action="screening.rerun",
        entity_type="screening",
        entity_id=screening.id,
        request=request,
    )
    await db.commit()
    return await to_out(db, screening)


# --------------------------------------------------------------------------------------------- queries
async def get_screening(db: AsyncSession, user: User, screening_id: uuid.UUID) -> ScreeningOut:
    screening, _ = await policies.get_screening_scoped(db, user, screening_id)
    return await to_out(db, screening)


async def list_screenings(
    db: AsyncSession,
    user: User,
    params: PageQuery,
    *,
    status: ScreeningStatus | None = None,
    patient_id: uuid.UUID | None = None,
) -> Page[ScreeningOut]:
    stmt = select(Screening).join(PatientProfile, PatientProfile.id == Screening.patient_id)
    clause = await policies.scope_clause(db, user)
    if clause is not None:
        stmt = stmt.where(clause)
    if status is not None:
        stmt = stmt.where(Screening.status == status)
    if patient_id is not None:
        stmt = stmt.where(Screening.patient_id == patient_id)
    stmt = stmt.order_by(Screening.created_at.desc(), Screening.id.desc())

    async def transform(rows: list[Screening]) -> list[ScreeningOut]:
        return await to_out_many(db, rows)

    page: Page[ScreeningOut] = await paginate(db, stmt, cast(Any, params), transform=transform)
    return page


async def get_matches(db: AsyncSession, user: User, screening_id: uuid.UUID) -> list[MatchOut]:
    screening, profile = await policies.get_screening_scoped(db, user, screening_id)
    if screening.status != ScreeningStatus.COMPLETED:
        return []
    matches = list(
        (
            await db.execute(
                select(ScreeningMatch)
                .where(ScreeningMatch.screening_id == screening.id)
                .order_by(ScreeningMatch.rank, ScreeningMatch.id)
            )
        ).scalars()
    )
    if not matches:
        return []
    return await build_match_outs(db, matches, _home_country(screening, profile))


async def build_match_outs(
    db: AsyncSession, matches: list[ScreeningMatch], home_country: str | None
) -> list[MatchOut]:
    """Assemble ``MatchOut`` cards with a fixed number of queries regardless of the match count."""
    hospital_ids = {m.hospital_id for m in matches}
    doctor_ids = {m.doctor_id for m in matches if m.doctor_id}
    procedure_ids = {m.procedure_id for m in matches if m.procedure_id}
    package_ids = {m.package_id for m in matches if m.package_id}

    hospitals = {
        h.id: h for h in (await db.execute(select(Hospital).where(Hospital.id.in_(hospital_ids)))).scalars()
    }
    doctors = (
        {d.id: d for d in (await db.execute(select(Doctor).where(Doctor.id.in_(doctor_ids)))).scalars()}
        if doctor_ids
        else {}
    )
    procedures = (
        {
            p.id: p
            for p in (await db.execute(select(Procedure).where(Procedure.id.in_(procedure_ids)))).scalars()
        }
        if procedure_ids
        else {}
    )
    packages = (
        {
            p.id: p
            for p in (
                await db.execute(select(TreatmentPackage).where(TreatmentPackage.id.in_(package_ids)))
            ).scalars()
        }
        if package_ids
        else {}
    )
    doctor_specs = await _specialties_by_id(db, {d.specialty_id for d in doctors.values()})

    spec_names: dict[uuid.UUID, list[str]] = {hid: [] for hid in hospital_ids}
    for hid, name in (
        await db.execute(
            select(HospitalSpecialty.hospital_id, Specialty.name)
            .join(Specialty, Specialty.id == HospitalSpecialty.specialty_id)
            .where(HospitalSpecialty.hospital_id.in_(hospital_ids), Specialty.is_active.is_(True))
            .order_by(Specialty.sort_order, Specialty.name)
        )
    ).all():
        spec_names[hid].append(name)

    starting: dict[uuid.UUID, tuple[int, str]] = {}
    for hid, ccy, min_price in (
        await db.execute(
            select(
                HospitalProcedure.hospital_id,
                HospitalProcedure.currency,
                func.min(HospitalProcedure.price_min_minor),
            )
            .where(
                HospitalProcedure.hospital_id.in_(hospital_ids),
                HospitalProcedure.is_active.is_(True),
                HospitalProcedure.price_min_minor.is_not(None),
            )
            .group_by(HospitalProcedure.hospital_id, HospitalProcedure.currency)
        )
    ).all():
        # Prefer INR (the catalog's pricing currency) when a hospital prices in several currencies.
        if min_price is not None and (hid not in starting or ccy == "INR"):
            starting[hid] = (int(min_price), str(ccy))

    savings = await compute_savings(db, matches, home_country)
    minima = await slot_minima(db, hospital_ids)

    def _next(m: ScreeningMatch, kind: SlotKind) -> date | None:
        if m.doctor_id is not None:
            return minima.doctor(m.doctor_id, m.hospital_id, kind)
        return minima.hospital(m.hospital_id, kind)

    out: list[MatchOut] = []
    for m in matches:
        hospital = hospitals.get(m.hospital_id)
        if hospital is None or hospital.status != HospitalStatus.ACTIVE:
            continue  # hospital removed or suspended since matching
        price = starting.get(hospital.id)
        card = HospitalCard(
            id=hospital.id,
            slug=hospital.slug,
            name=hospital.name,
            city=hospital.city,
            state=hospital.state,
            accreditations=list(hospital.accreditations or []),
            rating_avg=hospital.rating_avg,
            rating_count=hospital.rating_count,
            logo_url=hospital.logo_url,
            cover_image_url=hospital.cover_image_url,
            specialties=spec_names.get(hospital.id, []),
            languages=list(hospital.languages or []),
            international_desk=hospital.international_desk,
            starting_price_minor=price[0] if price else None,
            currency=price[1] if price else "INR",
        )
        doctor_card: DoctorCard | None = None
        doctor = doctors.get(m.doctor_id) if m.doctor_id else None
        if doctor is not None and doctor.is_active:
            spec = doctor_specs.get(doctor.specialty_id)
            doctor_card = DoctorCard(
                id=doctor.id,
                slug=doctor.slug,
                full_name=doctor.full_name,
                gender=doctor.gender,
                photo_url=doctor.photo_url,
                specialty=SpecialtyRef.model_validate(spec) if spec else None,
                qualifications=list(doctor.qualifications or []),
                experience_years=doctor.experience_years,
                languages=list(doctor.languages or []),
                success_rate_pct=doctor.success_rate_pct,
                rating_avg=doctor.rating_avg,
                rating_count=doctor.rating_count,
                consultation_fee_minor=doctor.consultation_fee_minor,
                currency=doctor.currency,
                teleconsult_available=doctor.teleconsult_available,
                hospital=HospitalRef.model_validate(hospital),
            )
        proc = procedures.get(m.procedure_id) if m.procedure_id else None
        pkg = packages.get(m.package_id) if m.package_id else None
        sav = savings.get(m.id)
        out.append(
            MatchOut(
                id=m.id,
                rank=m.rank,
                match_score=m.match_score,
                reasons=list(m.reasons or []),
                doctor=doctor_card,
                hospital=card,
                procedure=ProcedureRef.model_validate(proc) if proc else None,
                package=PackageOut.model_validate(pkg) if pkg else None,
                estimated_cost_minor=m.estimated_cost_minor,
                currency=m.currency,
                savings=SavingsOut(**sav) if sav else None,
                next_available_consultation=_next(m, SlotKind.CONSULTATION),
                next_available_admission=_next(m, SlotKind.ADMISSION),
            )
        )
    return out


# --------------------------------------------------------------------------------------------- triage run
async def load_catalog(db: AsyncSession) -> CatalogSnapshot:
    specs = (
        await db.execute(
            select(Specialty.id, Specialty.slug, Specialty.name)
            .where(Specialty.is_active.is_(True))
            .order_by(Specialty.slug)
        )
    ).all()
    procs = (
        await db.execute(
            select(
                Procedure.id,
                Procedure.slug,
                Procedure.name,
                Specialty.slug,
                Procedure.keywords,
                Procedure.body_areas,
            )
            .join(Specialty, Specialty.id == Procedure.specialty_id)
            .where(Procedure.is_active.is_(True), Specialty.is_active.is_(True))
            .order_by(Procedure.slug)
        )
    ).all()
    return CatalogSnapshot(
        specialties=tuple(CatalogSpecialty(id=str(i), slug=s, name=n) for i, s, n in specs),
        procedures=tuple(
            CatalogProcedure(
                id=str(i),
                slug=s,
                name=n,
                specialty_slug=ss,
                keywords=tuple(kw or ()),
                body_areas=tuple(ba or ()),
            )
            for i, s, n, ss, kw, ba in procs
        ),
    )


async def _load_attachments(
    db: AsyncSession,
    screening: Screening,
    profile: PatientProfile,
    exclude: set[uuid.UUID] | None = None,
) -> list[claude.Attachment]:
    """Up to 3 PDF/image reports (each at most 10 MB) that belong to the patient. Pages in ``exclude``
    (already covered by a confirmed document analysis) are not re-sent."""
    ids = [i for i in screening.report_document_ids or [] if i not in (exclude or set())]
    if not ids:
        return []
    allowed_types = claude.IMAGE_TYPES | {claude.PDF_TYPE, "image/jpg"}
    docs = (
        (
            await db.execute(
                select(Document).where(
                    Document.id.in_(ids),
                    Document.deleted_at.is_(None),
                    (Document.patient_id == profile.id) | (Document.owner_user_id == profile.user_id),
                )
            )
        )
        .scalars()
        .all()
    )
    by_id = {d.id: d for d in docs}
    out: list[claude.Attachment] = []
    for doc_id in ids:
        doc = by_id.get(doc_id)
        if (
            doc is None
            or doc.content_type.lower() not in allowed_types
            or doc.size_bytes > claude.MAX_ATTACHMENT_BYTES
        ):
            continue
        try:
            data = await get_storage().open(doc.storage_key)
        except (ObjectNotFound, ValueError, OSError) as exc:
            logger.warning("screening_report_unreadable", document_id=str(doc.id), error=type(exc).__name__)
            continue
        if len(data) > claude.MAX_ATTACHMENT_BYTES:
            continue
        out.append(claude.Attachment(content_type=doc.content_type, data=data))
        if len(out) >= claude.MAX_ATTACHMENTS:
            break
    return out


def _log_row(screening_id: uuid.UUID, status: AIRequestStatus, model: str | None, **kw: Any) -> AIRequestLog:
    return AIRequestLog(purpose=AI_PURPOSE, model=model, screening_id=screening_id, status=status, **kw)


async def process_screening(db: AsyncSession, screening_id: uuid.UUID) -> bool:
    """Run triage + matching for a ``processing`` screening. Returns False when there was nothing to do
    (already finished, re-submitted meanwhile, or deleted). Idempotent under at-least-once delivery."""
    screening = await db.get(Screening, screening_id)
    if screening is None or screening.status != ScreeningStatus.PROCESSING:
        return False
    marker = screening.submitted_at
    profile = await db.get(PatientProfile, screening.patient_id)
    catalog = await load_catalog(db)
    chosen_slug = next(
        (
            s.slug
            for s in catalog.specialties
            if screening.specialty_id and s.id == str(screening.specialty_id)
        ),
        None,
    )
    intake = build_intake(screening, specialty_slug=chosen_slug, patient=profile)
    # PLAN 7.1: confirmed document analyses replace re-sending those files (only confirmed data is used).
    from app.modules.docai.service import get_confirmed_analyses_for_documents

    confirmed_reports = await get_confirmed_analyses_for_documents(
        db, list(screening.report_document_ids or []), patient_id=screening.patient_id
    )
    if confirmed_reports:
        intake["confirmed_reports"] = confirmed_reports
    covered = {uuid.UUID(d) for r in confirmed_reports for d in r["document_ids"]}
    wants_ai = bool((screening.preferences or {}).get("use_ai", True)) and screening.consent_ai
    # SEC-021: free guest accounts and an exhausted platform AI budget use the rules engine.
    ai_block: str | None = None
    if wants_ai and settings.ai_available:
        patient_user = await db.get(User, profile.user_id) if profile is not None else None
        if patient_user is not None and patient_user.is_guest:
            ai_block = "Guest accounts use the standard rules"
        elif not await take_global_budget():
            ai_block = "The daily AI budget is used up"

    attachments: list[claude.Attachment] = []
    if wants_ai and settings.ai_available and ai_block is None and profile is not None:
        attachments = await _load_attachments(db, screening, profile, exclude=covered)
    await db.commit()  # do not hold a transaction open during the external call

    result: TriageResult | None = None
    model: str | None = None
    if wants_ai and settings.ai_available and ai_block is None:
        outcome = await claude.triage_with_claude(intake, catalog, attachments)
        db.add(
            _log_row(
                screening_id,
                outcome.status,
                outcome.model,
                input_tokens=outcome.input_tokens,
                output_tokens=outcome.output_tokens,
                latency_ms=outcome.latency_ms,
                error=outcome.error,
            )
        )
        if outcome.ok and outcome.result is not None:
            result, model = outcome.result, outcome.model
        else:
            logger.info("screening_ai_fallback", screening_id=str(screening_id), status=str(outcome.status))
        await db.commit()
    elif wants_ai:
        db.add(
            _log_row(
                screening_id,
                AIRequestStatus.FALLBACK,
                settings.AI_MODEL,
                error=ai_block or "AI is not configured",
            )
        )
        await db.commit()

    if result is None:
        result = rules_triage(intake, catalog)

    # Re-lock and make sure nobody re-submitted or finished the screening meanwhile.
    screening = (
        await db.execute(select(Screening).where(Screening.id == screening_id).with_for_update())
    ).scalar_one_or_none()
    if (
        screening is None
        or screening.status != ScreeningStatus.PROCESSING
        or screening.submitted_at != marker
    ):
        await db.rollback()
        return False

    matches = await compute_matches(db, screening, result, catalog, profile)
    await db.execute(delete(ScreeningMatch).where(ScreeningMatch.screening_id == screening.id))
    db.add_all(matches)
    screening.ai_result = result.model_dump(mode="json")
    screening.ai_engine = result.engine if result.engine == AIEngine.CLAUDE else AIEngine.RULES
    screening.ai_model = model if result.engine == AIEngine.CLAUDE else None
    screening.urgency = result.urgency
    screening.red_flags = list(result.red_flags)
    screening.status = ScreeningStatus.COMPLETED
    screening.completed_at = _now()
    screening.error = None
    await publish(
        db,
        "screening.completed",
        {"screening_id": str(screening.id), "patient_id": str(screening.patient_id)},
    )
    await db.commit()
    return True


async def mark_failed(db: AsyncSession, screening_id: uuid.UUID, error: str) -> None:
    await db.rollback()
    screening = (
        await db.execute(select(Screening).where(Screening.id == screening_id).with_for_update())
    ).scalar_one_or_none()
    if screening is None or screening.status != ScreeningStatus.PROCESSING:
        return
    screening.status = ScreeningStatus.FAILED
    screening.error = error[:1000]
    screening.completed_at = None
    await db.commit()
