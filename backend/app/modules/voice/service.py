"""Voice intake service (PLAN 7.2): upload -> local speech-to-text -> Claude extraction -> review -> confirm.

The extraction is only a suggestion. Nothing reaches a screening until the patient confirms it, and then only
empty questionnaire fields are filled - answers the patient already gave are returned as ``conflicts``.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

import structlog
from fastapi import Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit_log
from app.core.config import settings
from app.core.deps import get_client_ip, get_user_agent
from app.core.enums import AIRequestStatus, ConsentKind, ScreeningStatus, UserRole
from app.core.errors import AppError, BadRequest, Conflict, NotFound
from app.core.events import publish
from app.core.jobs import enqueue
from app.core.storage import ObjectNotFound, get_storage, make_key
from app.models import AIRequestLog, Case, Consent, PatientProfile, Screening, Specialty, User
from app.models.voice import VoiceReviewStatus, VoiceStatus, VoiceTranscription
from app.modules.voice import ai, policies, stt
from app.modules.voice.ai import IntakeSuggestion
from app.modules.voice.audio import AudioDecodeError, AudioTooLong, sniff_audio_format
from app.modules.voice.schemas import ConfirmIn, ConfirmOut, IntakeExtractIn, VoiceTranscriptionOut

logger = structlog.get_logger(__name__)

TRANSCRIBE_TASK = "voice.transcribe"
AI_PURPOSE = "voice_intake"
AI_CONSENT_VERSION = "ai-voice-2026-10"
MAX_AUDIO_BYTES = 10 * 1024 * 1024
NOT_CONFIGURED_MESSAGE = (
    "AI extraction not configured - basic keyword suggestion only. Please review every field."
)
AI_FAILED_MESSAGE = "AI extraction failed - basic keyword suggestion only. Please review every field."


class UnsupportedAudio(AppError):
    status_code = 415
    code = "unsupported_audio"
    default_message = "Unsupported audio format. Use webm, ogg/opus, m4a/mp4, aac, mp3 or wav."


class STTUnavailable(AppError):
    status_code = 503
    code = "stt_unavailable"
    default_message = "Speech-to-text is not available. Please type your answers instead."


def _now() -> datetime:
    return datetime.now(UTC)


def to_out(t: VoiceTranscription) -> VoiceTranscriptionOut:
    return VoiceTranscriptionOut(
        id=t.id,
        user_id=t.user_id,
        patient_id=t.patient_id,
        screening_id=t.screening_id,
        case_id=t.case_id,
        status=t.status,
        review_status=t.review_status,
        provider=t.provider,
        model=t.model,
        duration_seconds=t.duration_seconds,
        language_hint=t.language_hint,
        language_detected=t.language_detected,
        transcript=t.transcript,
        transcript_en=t.transcript_en,
        segments=list(t.segments or []),
        intake_suggestion=t.intake_suggestion,
        error=t.error,
        confirmed_intake=t.confirmed_intake,
        confirmed_at=t.confirmed_at,
        audio_retained=t.storage_key is not None and t.status in (VoiceStatus.COMPLETED, VoiceStatus.FAILED),
        completed_at=t.completed_at,
        created_at=t.created_at,
        updated_at=t.updated_at,
    )


#: The product is English-only: Whisper is forced to English and no translation step exists.
LANGUAGE = "en"


async def _own_profile(db: AsyncSession, user: User) -> PatientProfile | None:
    return (
        await db.execute(select(PatientProfile).where(PatientProfile.user_id == user.id))
    ).scalar_one_or_none()


async def _specialty_slugs(db: AsyncSession) -> list[str]:
    rows = await db.execute(
        select(Specialty.slug).where(Specialty.is_active.is_(True)).order_by(Specialty.slug)
    )
    return list(rows.scalars())


def _consent(user_id: uuid.UUID, request: Request | None) -> Consent:
    return Consent(
        user_id=user_id,
        kind=ConsentKind.AI_PROCESSING,
        version=AI_CONSENT_VERSION,
        granted=True,
        ip=get_client_ip(request) if request is not None else None,
        user_agent=get_user_agent(request) if request is not None else None,
    )


# ------------------------------------------------------------------------------------------- upload
async def create_transcription(
    db: AsyncSession,
    user: User,
    data: bytes,
    *,
    screening_id: uuid.UUID | None,
    case_id: uuid.UUID | None,
    consent_ai: bool,
    patient_id: uuid.UUID | None = None,
    request: Request | None = None,
) -> VoiceTranscriptionOut:
    policies.ensure_can_modify(user)
    if not consent_ai:
        raise BadRequest("Consent to AI processing is required to use voice input", code="consent_required")
    if not data:
        raise BadRequest("The recording is empty", code="empty_file")
    if len(data) > MAX_AUDIO_BYTES:
        raise AppError("Recordings can be at most 10 MB", code="file_too_large", status_code=413)
    audio_format = sniff_audio_format(data)
    if audio_format is None:
        raise UnsupportedAudio()
    provider = stt.get_provider()
    if provider.name == "none":
        raise STTUnavailable()

    patient: PatientProfile | None = None
    if patient_id is not None:
        # Agents record for their managed/referred patients and staff for anyone; a patient may only name
        # themself. Out of scope -> 404 (same rule as screenings / the agent portal).
        patient = await policies.resolve_patient_for_create(db, user, patient_id)
    if screening_id is not None:
        _, screening_patient = await policies.screening_for_caller(db, user, screening_id)
        if patient is not None and screening_patient.id != patient.id:
            raise BadRequest("The screening belongs to another patient", code="patient_mismatch")
        patient = screening_patient
    if case_id is not None:
        from app.modules.documents.policies import can_access_case, load_principal

        case = await db.get(Case, case_id)
        if case is None or not await can_access_case(db, await load_principal(db, user), case):
            raise NotFound("Case not found")
        if patient is not None and case.patient_id != patient.id:
            raise BadRequest("The case belongs to another patient", code="case_mismatch")
        if patient is None:
            patient = await db.get(PatientProfile, case.patient_id)
    if patient is None and str(getattr(user.role, "value", user.role)) == UserRole.PATIENT.value:
        patient = await _own_profile(db, user)

    transcription = VoiceTranscription(
        user_id=user.id,
        patient_id=patient.id if patient is not None else None,
        screening_id=screening_id,
        case_id=case_id,
        language_hint=LANGUAGE,
        status=VoiceStatus.QUEUED,
        provider=provider.name,
        model=provider.model,
    )
    db.add(transcription)
    await db.flush()
    key = make_key(f"voice/{user.id}", audio_format.extension)
    await get_storage().save(key, data, audio_format.content_type)
    transcription.storage_key = key
    db.add(_consent(patient.user_id if patient is not None else user.id, request))
    await enqueue(
        db,
        TRANSCRIBE_TASK,
        {"transcription_id": str(transcription.id), "format": audio_format.name},
        dedupe_key=f"{TRANSCRIBE_TASK}:{transcription.id}",
    )
    await audit_log(
        db,
        actor=user,
        action="voice.upload",
        entity_type="voice_transcription",
        entity_id=transcription.id,
        after={"format": audio_format.name, "bytes": len(data), "screening_id": screening_id},
        request=request,
    )
    try:
        await db.commit()
    except Exception:
        await get_storage().delete(key)
        raise
    await db.refresh(transcription)
    return to_out(transcription)


async def get_transcription(
    db: AsyncSession, user: User, transcription_id: uuid.UUID
) -> VoiceTranscriptionOut:
    return to_out(await policies.get_scoped(db, user, transcription_id))


# ------------------------------------------------------------------------------------------- extraction
async def _extract(db: AsyncSession, text: str) -> tuple[IntakeSuggestion, str | None]:
    """Claude when configured (logged in ``ai_request_logs``), else/on failure the deterministic fallback.
    Returns the suggestion and a user-facing note (``None`` when Claude succeeded)."""
    from app.modules.screening.service import load_catalog

    catalog = await load_catalog(db)
    if not settings.ai_available:
        db.add(
            AIRequestLog(
                purpose=AI_PURPOSE,
                model=settings.AI_MODEL,
                status=AIRequestStatus.FALLBACK,
                error="AI is not configured",
            )
        )
        return ai.rules_suggestion(text, catalog), NOT_CONFIGURED_MESSAGE
    slugs = [s.slug for s in catalog.specialties]
    await db.commit()  # no transaction open during the external call
    outcome = await ai.extract_with_claude(text, slugs)
    db.add(
        AIRequestLog(
            purpose=AI_PURPOSE,
            model=outcome.model,
            status=outcome.status,
            input_tokens=outcome.input_tokens,
            output_tokens=outcome.output_tokens,
            latency_ms=outcome.latency_ms,
            error=outcome.error,
        )
    )
    if outcome.ok and outcome.suggestion is not None:
        return outcome.suggestion, None
    return ai.rules_suggestion(text, catalog), AI_FAILED_MESSAGE


async def extract_text(db: AsyncSession, user: User, body: IntakeExtractIn) -> IntakeSuggestion:
    """Typed free text or an on-device transcript -> IntakeSuggestion. Read-only: nothing is applied."""
    policies.ensure_can_modify(user)
    if body.screening_id is not None:
        await policies.screening_for_caller(db, user, body.screening_id)
    suggestion, _ = await _extract(db, body.text.strip())
    await db.commit()  # only the ai_request_logs row
    return suggestion


# ------------------------------------------------------------------------------------------- the job
async def _delete_audio(t: VoiceTranscription) -> None:
    if t.storage_key is None or settings.VOICE_RETAIN_AUDIO:
        return
    try:
        await get_storage().delete(t.storage_key)
    except (ObjectNotFound, OSError, ValueError):
        logger.warning("voice.audio_delete_failed", transcription_id=str(t.id))
    t.storage_key = None


async def _fail(db: AsyncSession, t: VoiceTranscription, message: str) -> None:
    t.status = VoiceStatus.FAILED
    t.error = message[:1000]
    t.completed_at = _now()
    await _delete_audio(t)
    await publish(db, "voice.transcribed", {"transcription_id": str(t.id), "user_id": str(t.user_id)})
    await db.commit()


async def process_transcription(db: AsyncSession, transcription_id: uuid.UUID) -> bool:
    t = (
        await db.execute(
            select(VoiceTranscription)
            .where(VoiceTranscription.id == transcription_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if t is None or t.status not in (VoiceStatus.QUEUED, VoiceStatus.PROCESSING):
        await db.rollback()
        return False
    t.status = VoiceStatus.PROCESSING
    await db.commit()

    if t.storage_key is None:
        await _fail(db, t, "The recording is no longer available. Please record again.")
        return True
    try:
        data = await get_storage().open(t.storage_key)
    except (ObjectNotFound, OSError, ValueError):
        await _fail(db, t, "The recording is no longer available. Please record again.")
        return True
    audio_format = sniff_audio_format(data)
    if audio_format is None:
        await _fail(db, t, UnsupportedAudio.default_message)
        return True

    provider = stt.get_provider()
    try:
        result = await provider.transcribe(
            data, audio_format, language=LANGUAGE, max_seconds=float(settings.VOICE_MAX_SECONDS)
        )
    except AudioTooLong:
        await _fail(
            db,
            t,
            f"The recording is longer than {settings.VOICE_MAX_SECONDS} seconds. Please keep it shorter.",
        )
        return True
    except AudioDecodeError:
        await _fail(db, t, "The recording could not be read. Please record again.")
        return True
    except stt.STTError as exc:
        await _fail(db, t, str(exc))
        return True
    logger.info("voice.transcribed", transcription_id=str(t.id), latency_ms=result.latency_ms)

    t.provider = provider.name
    t.model = result.model or provider.model
    t.duration_seconds = result.duration_seconds
    t.language_detected = LANGUAGE
    t.transcript = result.text
    t.segments = result.segments
    await _delete_audio(t)
    await db.commit()

    if not result.text.strip():
        t.status = VoiceStatus.COMPLETED
        t.error = "No speech was recognised. Please try again in a quieter place, or type your answers."
        t.completed_at = _now()
    else:
        suggestion, note = await _extract(db, result.text)
        t.intake_suggestion = suggestion.model_dump(mode="json")
        t.transcript_en = result.text
        t.status = VoiceStatus.COMPLETED
        t.error = note
        t.completed_at = _now()
    await publish(db, "voice.transcribed", {"transcription_id": str(t.id), "user_id": str(t.user_id)})
    await db.commit()
    return True


async def mark_failed(db: AsyncSession, transcription_id: uuid.UUID, message: str) -> None:
    await db.rollback()
    t = await db.get(VoiceTranscription, transcription_id)
    if t is None or t.status not in (VoiceStatus.QUEUED, VoiceStatus.PROCESSING):
        return
    await _fail(db, t, message)


# ------------------------------------------------------------------------------------------- review
def _ensure_pending(t: VoiceTranscription) -> None:
    if t.status != VoiceStatus.COMPLETED or t.review_status != VoiceReviewStatus.PENDING_REVIEW:
        raise Conflict(
            "Only a completed transcription waiting for review can be changed", code="not_pending_review"
        )


async def _apply_to_screening(
    db: AsyncSession, screening: Screening, intake: IntakeSuggestion
) -> tuple[list[str], list[dict[str, Any]]]:
    """Fill empty questionnaire fields; differing existing answers become conflicts (never overwritten)."""
    applied: list[str] = []
    conflicts: list[dict[str, Any]] = []

    def take(field: str, current: Any, suggested: Any, setter: Any) -> None:
        if suggested in (None, "", [], {}):
            return
        if current in (None, "", [], {}):
            setter(suggested)
            applied.append(field)
        elif current != suggested:
            conflicts.append({"field": field, "current": current, "suggested": suggested})

    if intake.specialty_slug:
        spec = (
            await db.execute(
                select(Specialty).where(
                    Specialty.slug == intake.specialty_slug, Specialty.is_active.is_(True)
                )
            )
        ).scalar_one_or_none()
        if spec is not None:
            current_slug = None
            if screening.specialty_id is not None:
                current = await db.get(Specialty, screening.specialty_id)
                current_slug = current.slug if current is not None else None
            take(
                "specialty_slug",
                current_slug,
                spec.slug,
                lambda _v: setattr(screening, "specialty_id", spec.id),
            )

    take(
        "body_areas",
        list(screening.body_areas or []),
        list(intake.body_areas),
        lambda v: setattr(screening, "body_areas", v),
    )
    take(
        "pain_intensity",
        screening.pain_intensity,
        intake.pain_intensity,
        lambda v: setattr(screening, "pain_intensity", v),
    )
    symptoms = [s.model_dump(mode="json") for s in intake.symptoms]
    take("symptoms", list(screening.symptoms or []), symptoms, lambda v: setattr(screening, "symptoms", v))
    if intake.duration_value is not None and intake.duration_unit is not None:
        current_duration = (
            {"value": screening.duration_value, "unit": str(screening.duration_unit)}
            if screening.duration_value is not None and screening.duration_unit is not None
            else None
        )

        def _set_duration(v: dict[str, Any]) -> None:
            screening.duration_value = v["value"]
            screening.duration_unit = intake.duration_unit

        take(
            "duration",
            current_duration,
            {"value": intake.duration_value, "unit": str(intake.duration_unit)},
            _set_duration,
        )
    if intake.severity is not None:
        severity = dict(screening.severity or {})
        changed = False
        for key in ("work", "sleep", "mobility"):
            value = getattr(intake.severity, key)
            if value is None:
                continue
            current = severity.get(key)
            if current in (None, ""):
                severity[key] = str(value)
                changed = True
                applied.append(f"severity.{key}")
            elif current != str(value):
                conflicts.append({"field": f"severity.{key}", "current": current, "suggested": str(value)})
        if changed:
            screening.severity = severity
    treatments = [str(x) for x in intake.previous_treatments]
    take(
        "previous_treatments",
        [str(x) for x in screening.previous_treatments or []],
        treatments,
        lambda v: setattr(screening, "previous_treatments", v),
    )
    notes = (intake.notes or intake.transcript_en or "").strip()[:4000]
    take("notes", (screening.notes or "").strip(), notes, lambda v: setattr(screening, "notes", v))
    return applied, conflicts


async def confirm_transcription(
    db: AsyncSession, user: User, transcription_id: uuid.UUID, body: ConfirmIn, request: Request | None = None
) -> ConfirmOut:
    policies.ensure_can_modify(user)
    t = await policies.get_scoped(db, user, transcription_id, for_update=True)
    _ensure_pending(t)
    intake = body.intake.model_copy()
    slugs = set(await _specialty_slugs(db))
    if intake.specialty_slug and intake.specialty_slug not in slugs:
        raise BadRequest("Unknown specialty", code="invalid_specialty")
    transcript = (body.transcript if body.transcript is not None else t.transcript or "").strip()
    confirmed = {**intake.model_dump(mode="json"), "transcript": transcript}
    t.confirmed_intake = confirmed
    t.review_status = VoiceReviewStatus.CONFIRMED
    t.confirmed_at = _now()

    applied: list[str] = []
    conflicts: list[dict[str, Any]] = []
    note: str | None = "No screening is linked to this recording."
    if t.screening_id is not None:
        try:
            screening, _ = await policies.screening_for_caller(db, user, t.screening_id, for_update=True)
        except NotFound:
            screening = None
        if screening is None:
            note = "The linked screening is no longer available."
        elif screening.status != ScreeningStatus.DRAFT:
            note = "The screening was already submitted; the answers were not changed."
        else:
            applied, conflicts = await _apply_to_screening(db, screening, intake)
            note = None
    await audit_log(
        db,
        actor=user,
        action="voice.confirm",
        entity_type="voice_transcription",
        entity_id=t.id,
        before={"intake_suggestion": t.intake_suggestion},
        after={"confirmed_intake": confirmed, "applied_fields": applied, "conflicts": len(conflicts)},
        request=request,
    )
    await db.commit()
    await db.refresh(t)
    return ConfirmOut.model_validate(
        {
            "transcription": to_out(t),
            "applied_fields": applied,
            "conflicts": conflicts,
            "screening_note": note,
        }
    )


async def discard_transcription(
    db: AsyncSession, user: User, transcription_id: uuid.UUID, request: Request | None = None
) -> VoiceTranscriptionOut:
    policies.ensure_can_modify(user)
    t = await policies.get_scoped(db, user, transcription_id, for_update=True)
    if t.review_status != VoiceReviewStatus.PENDING_REVIEW:
        raise Conflict("This transcription was already reviewed", code="not_pending_review")
    t.review_status = VoiceReviewStatus.DISCARDED
    if t.status in (VoiceStatus.COMPLETED, VoiceStatus.FAILED) and t.storage_key is not None:
        try:
            await get_storage().delete(t.storage_key)
        except (ObjectNotFound, OSError, ValueError):
            logger.warning("voice.audio_delete_failed", transcription_id=str(t.id))
        t.storage_key = None
    await audit_log(
        db,
        actor=user,
        action="voice.discard",
        entity_type="voice_transcription",
        entity_id=t.id,
        request=request,
    )
    await db.commit()
    await db.refresh(t)
    return to_out(t)
