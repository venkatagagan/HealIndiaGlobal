"""Document intelligence service (PLAN 7.1): request -> background AI reading -> review -> edit -> confirm.

The AI output is only a draft: ``ai_output`` keeps the immutable copy, the extraction columns hold the working
draft, and ``confirmed_data`` the version the patient (or their agent/staff) confirmed. Only confirmed data is
used for screening (:func:`get_confirmed_analyses_for_documents`) or shown to hospitals.
"""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import Sequence
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Any

import structlog
from fastapi import Request
from sqlalchemy import any_, literal, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit_log
from app.core.config import settings
from app.core.deps import get_client_ip, get_user_agent
from app.core.enums import AIRequestStatus, ConsentKind, DocumentKind
from app.core.errors import BadRequest, Conflict, NotFound
from app.core.events import publish
from app.core.jobs import enqueue
from app.core.pagination import Page, paginate
from app.core.storage import ObjectNotFound, get_storage
from app.models import AIRequestLog, Case, Consent, Document, PatientProfile, User
from app.models.docai import (
    AnalysisDocType,
    AnalysisReviewStatus,
    DocumentAnalysis,
    DocumentAnalysisStatus,
)
from app.modules.docai import ai, policies
from app.modules.docai.pipeline import PageError, PreparedPage, check_request_size, prepare_page
from app.modules.docai.schemas import (
    EDITABLE_FIELDS,
    AnalysisConfirm,
    AnalysisCreate,
    AnalysisPatch,
    DocumentAnalysisOut,
)
from app.modules.documents.policies import (
    Principal,
    can_access_case,
    can_access_patient,
    load_principal,
    visibility_clause,
)

logger = structlog.get_logger(__name__)

ANALYZE_TASK = "docai.analyze"
AI_PURPOSE = "docai"
AI_CONSENT_VERSION = "ai-docai-2026-10"
#: The product is English-only: every AI output (including ``summary_patient``) is written in English.
OUTPUT_LANGUAGE = "en"
NOT_CONFIGURED_MESSAGE = "AI document reading is not configured"
MEDICAL_KINDS = frozenset(
    {
        DocumentKind.MEDICAL_REPORT,
        DocumentKind.PRESCRIPTION,
        DocumentKind.LAB_RESULT,
        DocumentKind.IMAGING,
        DocumentKind.OTHER,
    }
)
#: Rate-limited AI calls are re-queued this many times (with growing delays) before the analysis fails.
MAX_RATE_LIMIT_RETRIES = 3


def _now() -> datetime:
    return datetime.now(UTC)


def _role(user: User) -> str:
    return str(getattr(user.role, "value", user.role))


# ------------------------------------------------------------------------------------------- output
def _editable_snapshot(a: DocumentAnalysis) -> dict[str, Any]:
    return {
        "doc_type": a.doc_type.value if a.doc_type is not None else None,
        "report_date": a.report_date.isoformat() if a.report_date is not None else None,
        "facility_name": a.facility_name,
        "key_findings": list(a.key_findings or []),
        "lab_values": list(a.lab_values or []),
        "diagnoses_mentioned": list(a.diagnoses_mentioned or []),
        "medications": list(a.medications or []),
        "procedures_mentioned": list(a.procedures_mentioned or []),
        "recommendations": list(a.recommendations or []),
        "summary_patient": a.summary_patient,
    }


def _edited_fields(a: DocumentAnalysis) -> list[str]:
    """Editable fields whose current (or confirmed) value differs from what the AI returned."""
    if not a.ai_output:
        return []
    current = a.confirmed_data if a.confirmed_data is not None else _editable_snapshot(a)
    return [f for f in EDITABLE_FIELDS if current.get(f) != a.ai_output.get(f)]


def to_out(a: DocumentAnalysis, p: Principal) -> DocumentAnalysisOut:
    clinical = policies.is_clinical(p)
    values: dict[str, Any] = {
        "id": a.id,
        "audience": policies.audience(p),
        "document_ids": list(a.document_ids or []),
        "primary_document_id": a.primary_document_id,
        "patient_id": a.patient_id,
        "case_id": a.case_id,
        "requested_by_user_id": a.requested_by_user_id,
        "status": a.status,
        "engine": str(getattr(a.engine, "value", a.engine)),
        "model": a.model,
        "error": a.error,
        "summary_language": a.summary_language,
        "language": a.language,
        "summary_clinical": a.summary_clinical,
        "red_flags": list(a.red_flags or []),
        "quality": dict(a.quality or {}),
        "suggested_specialties": list(a.suggested_specialties or []),
        "confidence": a.confidence,
        "review_status": a.review_status,
        "ai_output": None if clinical else a.ai_output,
        "confirmed_data": a.confirmed_data,
        "confirmed_by_user_id": a.confirmed_by_user_id,
        "confirmed_at": a.confirmed_at,
        "completed_at": a.completed_at,
        "created_at": a.created_at,
        "updated_at": a.updated_at,
    }
    data = _editable_snapshot(a)
    if clinical and a.confirmed_data is not None:
        data = {f: a.confirmed_data.get(f) for f in EDITABLE_FIELDS}
    data["key_findings"] = data.get("key_findings") or []
    data["lab_values"] = data.get("lab_values") or []
    data["medications"] = data.get("medications") or []
    for f in ("diagnoses_mentioned", "procedures_mentioned", "recommendations"):
        data[f] = data.get(f) or []
    values.update(data)
    edited = _edited_fields(a)
    values["edited_fields"] = edited
    values["edited_by_patient"] = bool(edited)
    return DocumentAnalysisOut.model_validate(values)


# ------------------------------------------------------------------------------------------- helpers
async def _get_scoped(
    db: AsyncSession, p: Principal, analysis_id: uuid.UUID, *, for_update: bool = False
) -> DocumentAnalysis:
    stmt = select(DocumentAnalysis).where(DocumentAnalysis.id == analysis_id, policies.scope_clause(p))
    if for_update:
        stmt = stmt.with_for_update()
    analysis = (await db.execute(stmt)).scalar_one_or_none()
    if analysis is None:
        raise NotFound("Analysis not found")
    return analysis


async def _patient_for_document(db: AsyncSession, doc: Document) -> uuid.UUID | None:
    if doc.patient_id is not None:
        return doc.patient_id
    return (
        await db.execute(select(PatientProfile.id).where(PatientProfile.user_id == doc.owner_user_id))
    ).scalar_one_or_none()


async def _enqueue_analysis(
    db: AsyncSession, analysis_id: uuid.UUID, *, attempt: int = 0, delay: int = 0
) -> None:
    await enqueue(
        db,
        ANALYZE_TASK,
        {"analysis_id": str(analysis_id), "attempt": attempt},
        run_at=_now() + timedelta(seconds=delay) if delay else None,
        dedupe_key=f"{ANALYZE_TASK}:{analysis_id}:{attempt}",
    )


# ------------------------------------------------------------------------------------------- create
async def create_analysis(
    db: AsyncSession, user: User, body: AnalysisCreate, request: Request | None = None
) -> DocumentAnalysisOut:
    p = await load_principal(db, user)
    policies.ensure_can_modify(p)
    if not body.consent_ai:
        raise BadRequest("Consent to AI processing is required to read your report", code="consent_required")
    ids = list(body.document_ids)
    if len(set(ids)) != len(ids):
        raise BadRequest("Each page may only be listed once", code="duplicate_pages")
    if len(ids) > settings.DOCAI_MAX_PAGES:
        raise BadRequest(f"A report can have at most {settings.DOCAI_MAX_PAGES} pages", code="too_many_pages")

    docs = (
        (await db.execute(select(Document).where(Document.id.in_(ids), visibility_clause(p)))).scalars().all()
    )
    by_id = {d.id: d for d in docs}
    if any(i not in by_id for i in ids):
        raise NotFound("Document not found")
    ordered = [by_id[i] for i in ids]
    if any(d.kind not in MEDICAL_KINDS for d in ordered):
        raise BadRequest("Only medical documents can be read with AI", code="not_medical_document")

    explicit: uuid.UUID | None = None
    if body.patient_id is not None:
        # Agents (their managed/referred patients) and staff act on behalf of a patient; a patient may only
        # name themself; anything out of scope is a 404 (same rule as screenings / the agent portal).
        from app.modules.screening.policies import resolve_patient_for_create

        explicit = (await resolve_patient_for_create(db, user, body.patient_id)).id
    patient_ids: set[uuid.UUID | None] = set()
    for d in ordered:
        doc_patient = await _patient_for_document(db, d)
        if doc_patient is None and explicit is not None and d.owner_user_id == user.id:
            doc_patient = explicit  # uploaded by the caller on the patient's behalf without a patient link
        patient_ids.add(doc_patient)
    if len(patient_ids) != 1 or None in patient_ids:
        raise BadRequest("All pages must belong to the same patient", code="different_patients")
    patient_id = next(iter(patient_ids))
    if patient_id is None:  # pragma: no cover - excluded above
        raise NotFound("Patient not found")
    if explicit is not None and patient_id != explicit:
        raise BadRequest("The pages belong to a different patient", code="different_patients")
    if not await can_access_patient(db, p, patient_id):
        raise NotFound("Document not found")
    profile = await db.get(PatientProfile, patient_id)
    if profile is None:
        raise NotFound("Patient not found")

    case_id = body.case_id
    if case_id is None:
        case_ids = {d.case_id for d in ordered if d.case_id is not None}
        case_id = next(iter(case_ids)) if len(case_ids) == 1 else None
    if case_id is not None:
        case = await db.get(Case, case_id)
        if case is None or case.patient_id != patient_id or not await can_access_case(db, p, case):
            if body.case_id is not None:
                raise NotFound("Case not found")
            case_id = None

    db.add(
        Consent(
            user_id=profile.user_id,
            kind=ConsentKind.AI_PROCESSING,
            version=AI_CONSENT_VERSION,
            granted=True,
            ip=get_client_ip(request) if request is not None else None,
            user_agent=get_user_agent(request) if request is not None else None,
        )
    )
    analysis = DocumentAnalysis(
        document_ids=ids,
        primary_document_id=ids[0],
        patient_id=patient_id,
        case_id=case_id,
        requested_by_user_id=user.id,
        summary_language=OUTPUT_LANGUAGE,
        status=DocumentAnalysisStatus.QUEUED,
        model=settings.AI_MODEL,
    )
    db.add(analysis)
    await db.flush()
    await _enqueue_analysis(db, analysis.id)
    await audit_log(
        db,
        actor=user,
        action="docai.request",
        entity_type="document_analysis",
        entity_id=analysis.id,
        after={"document_ids": [str(i) for i in ids], "case_id": str(case_id) if case_id else None},
        request=request,
    )
    await db.commit()
    await db.refresh(analysis)
    return to_out(analysis, p)


# ------------------------------------------------------------------------------------------- reads
async def list_analyses(
    db: AsyncSession,
    user: User,
    params: Any,
    *,
    patient_id: uuid.UUID | None = None,
    case_id: uuid.UUID | None = None,
    status: DocumentAnalysisStatus | None = None,
    review_status: AnalysisReviewStatus | None = None,
) -> Page[DocumentAnalysisOut]:
    p = await load_principal(db, user)
    stmt = select(DocumentAnalysis).where(policies.scope_clause(p))
    if patient_id is not None:
        stmt = stmt.where(DocumentAnalysis.patient_id == patient_id)
    if case_id is not None:
        stmt = stmt.where(DocumentAnalysis.case_id == case_id)
    if status is not None:
        stmt = stmt.where(DocumentAnalysis.status == status)
    if review_status is not None:
        stmt = stmt.where(DocumentAnalysis.review_status == review_status)
    stmt = stmt.order_by(DocumentAnalysis.created_at.desc(), DocumentAnalysis.id.desc())

    def _transform(rows: list[Any]) -> list[DocumentAnalysisOut]:
        return [to_out(a, p) for a in rows]

    return await paginate(db, stmt, params, _transform)


async def get_analysis(db: AsyncSession, user: User, analysis_id: uuid.UUID) -> DocumentAnalysisOut:
    p = await load_principal(db, user)
    return to_out(await _get_scoped(db, p, analysis_id), p)


async def get_for_document(db: AsyncSession, user: User, document_id: uuid.UUID) -> DocumentAnalysisOut:
    """Latest analysis (visible to the caller) that contains ``document_id`` as one of its pages."""
    p = await load_principal(db, user)
    analysis = (
        await db.execute(
            select(DocumentAnalysis)
            .where(literal(document_id) == any_(DocumentAnalysis.document_ids), policies.scope_clause(p))
            .order_by(DocumentAnalysis.created_at.desc(), DocumentAnalysis.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if analysis is None:
        raise NotFound("No analysis for this document")
    return to_out(analysis, p)


# ------------------------------------------------------------------------------------------- writes
async def retry_analysis(
    db: AsyncSession, user: User, analysis_id: uuid.UUID, request: Request | None = None
) -> DocumentAnalysisOut:
    p = await load_principal(db, user)
    policies.ensure_can_modify(p)
    analysis = await _get_scoped(db, p, analysis_id, for_update=True)
    if analysis.status != DocumentAnalysisStatus.FAILED:
        raise Conflict("Only a failed analysis can be retried", code="not_retryable")
    analysis.status = DocumentAnalysisStatus.QUEUED
    analysis.error = None
    analysis.completed_at = None
    await db.flush()
    await _enqueue_analysis(db, analysis.id, attempt=0)
    await audit_log(
        db,
        actor=user,
        action="docai.retry",
        entity_type="document_analysis",
        entity_id=analysis.id,
        request=request,
    )
    await db.commit()
    await db.refresh(analysis)
    return to_out(analysis, p)


def _ensure_reviewable(analysis: DocumentAnalysis) -> None:
    if (
        analysis.status != DocumentAnalysisStatus.COMPLETED
        or analysis.review_status != AnalysisReviewStatus.PENDING_REVIEW
    ):
        raise Conflict("Only an analysis waiting for review can be changed", code="not_pending_review")


def _apply_fields(analysis: DocumentAnalysis, fields: dict[str, Any]) -> None:
    for name, value in fields.items():
        if name in ("key_findings", "lab_values", "medications"):
            value = [v.model_dump(mode="json") if hasattr(v, "model_dump") else v for v in (value or [])]
        elif name in ("diagnoses_mentioned", "procedures_mentioned", "recommendations"):
            value = list(value or [])
        elif name in ("facility_name", "summary_patient") and isinstance(value, str):
            value = value.strip() or None
        setattr(analysis, name, value)


async def update_draft(
    db: AsyncSession, user: User, analysis_id: uuid.UUID, body: AnalysisPatch, request: Request | None = None
) -> DocumentAnalysisOut:
    p = await load_principal(db, user)
    policies.ensure_can_modify(p)
    analysis = await _get_scoped(db, p, analysis_id, for_update=True)
    _ensure_reviewable(analysis)
    fields = {name: getattr(body, name) for name in body.model_fields_set}
    if "doc_type" in fields and fields["doc_type"] is None:
        fields["doc_type"] = AnalysisDocType.OTHER
    _apply_fields(analysis, fields)
    await db.commit()
    await db.refresh(analysis)
    return to_out(analysis, p)


async def confirm_analysis(
    db: AsyncSession,
    user: User,
    analysis_id: uuid.UUID,
    body: AnalysisConfirm,
    request: Request | None = None,
) -> DocumentAnalysisOut:
    p = await load_principal(db, user)
    policies.ensure_can_modify(p)
    analysis = await _get_scoped(db, p, analysis_id, for_update=True)
    _ensure_reviewable(analysis)
    fields = {name: getattr(body, name) for name in body.model_fields_set}
    if "doc_type" in fields and fields["doc_type"] is None:
        fields["doc_type"] = AnalysisDocType.OTHER
    _apply_fields(analysis, fields)
    confirmed = _editable_snapshot(analysis)
    analysis.confirmed_data = confirmed
    analysis.review_status = AnalysisReviewStatus.CONFIRMED
    analysis.confirmed_by_user_id = user.id
    analysis.confirmed_at = _now()
    edited = [
        f for f in EDITABLE_FIELDS if analysis.ai_output and confirmed.get(f) != analysis.ai_output.get(f)
    ]
    await audit_log(
        db,
        actor=user,
        action="docai.confirm",
        entity_type="document_analysis",
        entity_id=analysis.id,
        before={f: (analysis.ai_output or {}).get(f) for f in edited},
        after={"confirmed_data": confirmed, "edited_fields": edited},
        request=request,
    )
    await publish(
        db,
        "document.analysis_confirmed",
        {
            "analysis_id": str(analysis.id),
            "patient_id": str(analysis.patient_id),
            "case_id": analysis.case_id,
        },
    )
    await db.commit()
    await db.refresh(analysis)
    return to_out(analysis, p)


async def reject_analysis(
    db: AsyncSession, user: User, analysis_id: uuid.UUID, request: Request | None = None
) -> DocumentAnalysisOut:
    p = await load_principal(db, user)
    policies.ensure_can_modify(p)
    analysis = await _get_scoped(db, p, analysis_id, for_update=True)
    _ensure_reviewable(analysis)
    analysis.review_status = AnalysisReviewStatus.REJECTED
    await audit_log(
        db,
        actor=user,
        action="docai.reject",
        entity_type="document_analysis",
        entity_id=analysis.id,
        request=request,
    )
    await db.commit()
    await db.refresh(analysis)
    return to_out(analysis, p)


# ------------------------------------------------------------------------------------------- screening link
async def get_confirmed_analyses_for_documents(
    db: AsyncSession, document_ids: Sequence[uuid.UUID], *, patient_id: uuid.UUID | None = None
) -> list[dict[str, Any]]:
    """Confirmed analyses covering any of ``document_ids`` (latest per report), as compact dicts for the
    screening intake: confirmed clinical summary, lab values, findings and red flags (never the AI draft)."""
    ids = list(document_ids or [])
    if not ids:
        return []
    stmt = (
        select(DocumentAnalysis)
        .where(
            DocumentAnalysis.document_ids.overlap(ids),
            DocumentAnalysis.review_status == AnalysisReviewStatus.CONFIRMED,
            DocumentAnalysis.confirmed_data.is_not(None),
        )
        .order_by(DocumentAnalysis.confirmed_at.desc())
    )
    if patient_id is not None:
        stmt = stmt.where(DocumentAnalysis.patient_id == patient_id)
    rows = (await db.execute(stmt)).scalars().all()
    out: list[dict[str, Any]] = []
    covered: set[uuid.UUID] = set()
    for a in rows:
        pages = set(a.document_ids or [])
        if pages <= covered:
            continue  # an older analysis of the same pages
        covered |= pages
        data = a.confirmed_data or {}
        out.append(
            {
                "analysis_id": str(a.id),
                "document_ids": [str(i) for i in a.document_ids or []],
                "doc_type": data.get("doc_type"),
                "report_date": data.get("report_date"),
                "facility_name": data.get("facility_name"),
                "summary_clinical": a.summary_clinical,
                "key_findings": data.get("key_findings") or [],
                "lab_values": data.get("lab_values") or [],
                "diagnoses_mentioned": data.get("diagnoses_mentioned") or [],
                "medications": data.get("medications") or [],
                "red_flags": list(a.red_flags or []),
            }
        )
    return out


# ------------------------------------------------------------------------------------------- the job
def _log(status: AIRequestStatus, model: str | None, **kw: Any) -> AIRequestLog:
    return AIRequestLog(purpose=AI_PURPOSE, model=model, status=status, **kw)


async def _finish(
    db: AsyncSession,
    analysis_id: uuid.UUID,
    status: DocumentAnalysisStatus,
    error: str | None,
    *,
    quality_issues: list[str] | None = None,
    pages: int | None = None,
) -> None:
    analysis = (
        await db.execute(
            select(DocumentAnalysis)
            .where(DocumentAnalysis.id == analysis_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if analysis is None:
        return
    analysis.status = status
    analysis.error = (error or "")[:1000] or None
    analysis.completed_at = _now()
    if quality_issues is not None:
        analysis.quality = {"legible": False, "issues": quality_issues, "pages_analyzed": pages or 0}
    await db.commit()


async def _load_pages(db: AsyncSession, analysis: DocumentAnalysis) -> list[PreparedPage]:
    ids = list(analysis.document_ids or [])
    docs = (
        (await db.execute(select(Document).where(Document.id.in_(ids), Document.deleted_at.is_(None))))
        .scalars()
        .all()
    )
    by_id = {d.id: d for d in docs}
    pages: list[PreparedPage] = []
    for number, doc_id in enumerate(ids, start=1):
        doc = by_id.get(doc_id)
        if doc is None:
            raise PageError(f"Page {number} was deleted. Upload it again and start a new analysis.")
        try:
            data = await get_storage().open(doc.storage_key)
        except (ObjectNotFound, ValueError, OSError) as exc:
            logger.warning("docai.page_unreadable", document_id=str(doc_id), error=type(exc).__name__)
            raise PageError(f"Page {number} could not be loaded. Please upload it again.") from exc
        pages.append(await asyncio.to_thread(prepare_page, data, number, doc_id))
    check_request_size(pages)
    return pages


async def _specialty_slugs(db: AsyncSession) -> list[str]:
    from app.models import Specialty

    rows = (
        await db.execute(select(Specialty.slug).where(Specialty.is_active.is_(True)).order_by(Specialty.slug))
    ).scalars()
    return list(rows)


def _parse_date(value: str | None) -> date | None:
    try:
        return date.fromisoformat(value) if value else None
    except ValueError:
        return None


async def process_analysis(db: AsyncSession, analysis_id: uuid.UUID, *, attempt: int = 0) -> bool:
    """Run one queued analysis. Returns False when there was nothing to do. Idempotent."""
    analysis = (
        await db.execute(
            select(DocumentAnalysis)
            .where(DocumentAnalysis.id == analysis_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if analysis is None or analysis.status not in (
        DocumentAnalysisStatus.QUEUED,
        DocumentAnalysisStatus.PROCESSING,
    ):
        await db.rollback()
        return False
    analysis.status = DocumentAnalysisStatus.PROCESSING
    await db.commit()

    if not settings.DOCAI_ENABLED or not settings.ai_available:
        db.add(_log(AIRequestStatus.FALLBACK, settings.AI_MODEL, error=NOT_CONFIGURED_MESSAGE))
        await db.commit()
        await _finish(db, analysis_id, DocumentAnalysisStatus.FAILED, NOT_CONFIGURED_MESSAGE)
        return True

    try:
        pages = await _load_pages(db, analysis)
    except PageError as exc:
        await db.rollback()
        status = DocumentAnalysisStatus.UNSUPPORTED if exc.unsupported else DocumentAnalysisStatus.FAILED
        await _finish(db, analysis_id, status, str(exc), quality_issues=[str(exc)])
        return True
    slugs = await _specialty_slugs(db)
    await db.commit()  # no transaction open during the external call

    outcome = await ai.analyze_pages(pages, slugs)
    db.add(
        _log(
            outcome.status,
            outcome.model,
            input_tokens=outcome.input_tokens,
            output_tokens=outcome.output_tokens,
            latency_ms=outcome.latency_ms,
            error=outcome.error,
        )
    )
    await db.commit()

    if not outcome.ok or outcome.result is None:
        if outcome.rate_limited and attempt < MAX_RATE_LIMIT_RETRIES:
            analysis = await db.get(DocumentAnalysis, analysis_id)
            if analysis is not None:
                analysis.status = DocumentAnalysisStatus.QUEUED
                await _enqueue_analysis(db, analysis_id, attempt=attempt + 1, delay=60 * (2**attempt))
                await db.commit()
            return True
        await _finish(db, analysis_id, DocumentAnalysisStatus.FAILED, outcome.message or ai.AI_FAILED_MESSAGE)
        return True

    result = outcome.result
    analysis = (
        await db.execute(
            select(DocumentAnalysis)
            .where(DocumentAnalysis.id == analysis_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if analysis is None or analysis.status != DocumentAnalysisStatus.PROCESSING:
        await db.rollback()
        return False
    ai_output = result.model_dump(mode="json")
    analysis.ai_output = ai_output
    analysis.model = outcome.model
    analysis.doc_type = result.doc_type
    analysis.language = result.language
    analysis.report_date = _parse_date(result.report_date)
    analysis.facility_name = result.facility_name
    analysis.summary_patient = result.summary_patient or None
    analysis.summary_clinical = result.summary_clinical or None
    analysis.key_findings = ai_output["key_findings"]
    analysis.lab_values = ai_output["lab_values"]
    analysis.diagnoses_mentioned = list(result.diagnoses_mentioned)
    analysis.medications = ai_output["medications"]
    analysis.procedures_mentioned = list(result.procedures_mentioned)
    analysis.recommendations = list(result.recommendations)
    analysis.red_flags = list(result.red_flags)
    analysis.suggested_specialties = list(result.suggested_specialties)
    analysis.confidence = Decimal(str(round(result.confidence, 2)))
    issues = [i for page in pages for i in page.issues] + list(result.quality_issues)
    analysis.quality = {
        "legible": bool(result.legible),
        "issues": issues,
        "pages_analyzed": sum(page.page_count for page in pages),
    }
    analysis.status = DocumentAnalysisStatus.COMPLETED
    analysis.review_status = AnalysisReviewStatus.PENDING_REVIEW
    analysis.error = None
    analysis.completed_at = _now()
    await publish(
        db,
        "document.analyzed",
        {
            "analysis_id": str(analysis.id),
            "patient_id": str(analysis.patient_id),
            "case_id": analysis.case_id,
        },
    )
    await db.commit()
    return True


async def mark_failed(db: AsyncSession, analysis_id: uuid.UUID, error: str) -> None:
    await db.rollback()
    analysis = await db.get(DocumentAnalysis, analysis_id)
    if analysis is None or analysis.status not in (
        DocumentAnalysisStatus.QUEUED,
        DocumentAnalysisStatus.PROCESSING,
    ):
        return
    await _finish(db, analysis_id, DocumentAnalysisStatus.FAILED, error)
