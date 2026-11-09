"""Complete account erasure (DPDP s.12(3), GDPR Art. 17) shared by ``DELETE /auth/me`` and the purge jobs.

What happens to the data of the erased account (``RETENTION_RULES`` in the auth service is the user-facing
summary of the same rules):

* erased: contact details, passport/insurance numbers and health notes on the profile, companions, saved
  items,
  devices, notifications, nominee, guardian details, screenings (+ matches), voice transcriptions and their
  audio, document analyses, every document about the person (rows deleted, files deleted from storage) except
  payment/KYC records, travel references (PNR, flight numbers, notes), SOS locations, the text of messages the
  person sent (replaced by "[deleted]") and their chat memberships;
* pseudonymised and kept (tax, accounting and contract law): cases, quotes, bookings, payments, refunds,
  invoices and ledger entries. The user row stays as an anonymous id ("Deleted user"), the patient profile
  keeps only nationality/country for aggregates; free text on retained records is cleared and personal
  details inside payment gateway payloads are removed;
* kept as evidence: consent records and the audit log (never personal free text).

Storage objects are deleted by the ``privacy.delete_objects`` job, enqueued in the same transaction.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import structlog
from fastapi import Request
from sqlalchemy import and_, delete, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit_log
from app.core.enums import (
    AgentStatus,
    ConsentKind,
    DocumentKind,
    UserRole,
    UserStatus,
)
from app.core.events import publish
from app.core.jobs import enqueue
from app.models import (
    Agent,
    Case,
    Consultation,
    ConversationParticipant,
    DeviceToken,
    Document,
    DocumentAnalysis,
    HospitalMember,
    ItineraryItem,
    Message,
    Notification,
    PatientCompanion,
    PatientProfile,
    Payment,
    PaymentOrder,
    Quote,
    SavedItem,
    Screening,
    SosAlert,
    TravelBooking,
    User,
    VerificationToken,
    VisaRequest,
    VoiceTranscription,
)
from app.models.privacy import DataNominee, DataRightsRequest, GuardianConsent
from app.models.travel import AccommodationBooking, ServiceBooking

logger = structlog.get_logger(__name__)

DELETE_OBJECTS_TASK = "privacy.delete_objects"
DELETED_MESSAGE = "[deleted]"

#: documents kept (pseudonymised through the anonymous owner) for tax, accounting and partner-KYC law
RETAINED_DOCUMENT_KINDS: frozenset[DocumentKind] = frozenset(
    {
        DocumentKind.INVOICE,
        DocumentKind.RECEIPT,
        DocumentKind.PAYMENT_PROOF,
        DocumentKind.BANK_PROOF,
        DocumentKind.KYC_REGISTRATION,
        DocumentKind.KYC_ACCREDITATION,
        DocumentKind.KYC_PAN,
        DocumentKind.KYC_GST,
        DocumentKind.KYC_ID_PROOF,
    }
)
_PROFILE_ERASED_FIELDS = (
    "passport_number",
    "passport_last4",
    "passport_expiry",
    "phone",
    "whatsapp",
    "address",
    "emergency_contact",
    "allergies",
    "medical_history",
    "blood_group",
    "insurance_provider",
    "insurance_policy_number",
    "date_of_birth",
    "gender",
)
#: keys removed (at any depth) from payment gateway payloads kept for accounting
_PAYMENT_PII_KEYS = frozenset(
    {
        "email",
        "contact",
        "phone",
        "name",
        "vpa",
        "card",
        "notes",
        "address",
        "billing_details",
        "customer_details",
        "receipt_email",
        "customer",
        "description",
    }
)


def _now() -> datetime:
    return datetime.now(UTC)


def strip_pii(value: Any) -> Any:
    """Copy of a JSON value without the keys in ``_PAYMENT_PII_KEYS`` (recursively)."""
    if isinstance(value, dict):
        return {k: strip_pii(v) for k, v in value.items() if str(k).lower() not in _PAYMENT_PII_KEYS}
    if isinstance(value, list):
        return [strip_pii(v) for v in value]
    return value


def _rowcount(result: Any) -> int:
    return int(getattr(result, "rowcount", 0) or 0)


async def erase_personal_data(db: AsyncSession, user: User, profile: PatientProfile | None) -> dict[str, Any]:
    """Erase/pseudonymise everything about ``user`` (see the module docstring). Returns counts and the storage
    keys to delete. No commit; the user row itself is handled by :func:`erase_account`."""
    summary: dict[str, Any] = {}
    storage_keys: list[str] = []
    profile_id = profile.id if profile is not None else None

    # --- documents (+ their analyses through the FK cascade) -------------------------------------------
    about_user = and_(
        Document.owner_user_id == user.id, Document.patient_id.is_(None), Document.hospital_id.is_(None)
    )
    doc_filter = or_(Document.patient_id == profile_id, about_user) if profile_id is not None else about_user
    docs = (
        await db.execute(
            select(Document.id, Document.storage_key).where(
                doc_filter, Document.kind.not_in(sorted(RETAINED_DOCUMENT_KINDS))
            )
        )
    ).all()
    storage_keys.extend(key for _, key in docs if key)
    if docs:
        await db.execute(
            delete(Document)
            .where(Document.id.in_([doc_id for doc_id, _ in docs]))
            .execution_options(synchronize_session=False)
        )
    summary["documents_erased"] = len(docs)

    if profile_id is not None:
        # --- AI and health data ----------------------------------------------------------------------
        summary["document_analyses_erased"] = _rowcount(
            await db.execute(
                delete(DocumentAnalysis)
                .where(DocumentAnalysis.patient_id == profile_id)
                .execution_options(synchronize_session=False)
            )
        )
        summary["screenings_erased"] = _rowcount(
            await db.execute(
                delete(Screening)
                .where(Screening.patient_id == profile_id)
                .execution_options(synchronize_session=False)
            )
        )
        await db.execute(delete(PatientCompanion).where(PatientCompanion.patient_id == profile_id))
        await db.execute(delete(GuardianConsent).where(GuardianConsent.patient_id == profile_id))

        # --- retained records: clear free text and travel references --------------------------------
        case_ids = select(Case.id).where(Case.patient_id == profile_id)
        await db.execute(
            update(Case)
            .where(Case.patient_id == profile_id)
            .values(patient_notes=None, medical_summary=None)
            .execution_options(synchronize_session=False)
        )
        await db.execute(
            update(Quote)
            .where(Quote.case_id.in_(case_ids))
            .values(treatment_plan=None)
            .execution_options(synchronize_session=False)
        )
        await db.execute(
            update(Consultation)
            .where(Consultation.patient_id == profile_id)
            .values(notes=None, meeting_url=None)
            .execution_options(synchronize_session=False)
        )
        await db.execute(delete(ItineraryItem).where(ItineraryItem.case_id.in_(case_ids)))
        await db.execute(
            update(VisaRequest)
            .where(VisaRequest.patient_id == profile_id)
            .values(notes=None, application_reference=None, invitation_letter_document_id=None)
            .execution_options(synchronize_session=False)
        )
        await db.execute(
            update(TravelBooking)
            .where(TravelBooking.patient_id == profile_id)
            .values(pnr=None, flight_number=None, notes=None, details={})
            .execution_options(synchronize_session=False)
        )
        await db.execute(
            update(AccommodationBooking)
            .where(AccommodationBooking.patient_id == profile_id)
            .values(confirmation_code=None, notes=None)
            .execution_options(synchronize_session=False)
        )
        await db.execute(
            update(ServiceBooking)
            .where(ServiceBooking.patient_id == profile_id)
            .values(notes=None)
            .execution_options(synchronize_session=False)
        )
        await db.execute(
            update(SosAlert)
            .where(SosAlert.patient_id == profile_id)
            .values(lat=None, lng=None, message=None)
            .execution_options(synchronize_session=False)
        )
        # --- payments: kept for accounting, without personal details in gateway payloads -----------
        orders = (
            (
                await db.execute(
                    select(PaymentOrder).where(
                        or_(PaymentOrder.patient_id == profile_id, PaymentOrder.payer_user_id == user.id)
                    )
                )
            )
            .scalars()
            .all()
        )
        for order in orders:
            order.meta = strip_pii(order.meta or {})
        if orders:
            payments = (
                (await db.execute(select(Payment).where(Payment.order_id.in_([o.id for o in orders]))))
                .scalars()
                .all()
            )
            for payment in payments:
                payment.raw = strip_pii(payment.raw or {})
        # --- the profile keeps an anonymous shell (FK target of retained cases/bookings/payments) -----
        for field in _PROFILE_ERASED_FIELDS:
            setattr(profile, field, None)
        profile.first_name = "Deleted"
        profile.last_name = "patient"

    # --- voice intake (recordings by the user or about the patient) ----------------------------------
    voice_filter = VoiceTranscription.user_id == user.id
    if profile_id is not None:
        voice_filter = or_(voice_filter, VoiceTranscription.patient_id == profile_id)
    voice = (
        await db.execute(select(VoiceTranscription.id, VoiceTranscription.storage_key).where(voice_filter))
    ).all()
    storage_keys.extend(key for _, key in voice if key)
    if voice:
        await db.execute(
            delete(VoiceTranscription)
            .where(VoiceTranscription.id.in_([vid for vid, _ in voice]))
            .execution_options(synchronize_session=False)
        )
    summary["voice_transcriptions_erased"] = len(voice)

    # --- messages, notifications, contacts ---------------------------------------------------------------
    summary["messages_erased"] = _rowcount(
        await db.execute(
            update(Message)
            .where(Message.sender_user_id == user.id)
            .values(body=DELETED_MESSAGE, attachment_document_ids=[], edited_at=func.now())
            .execution_options(synchronize_session=False)
        )
    )
    await db.execute(delete(ConversationParticipant).where(ConversationParticipant.user_id == user.id))
    summary["notifications_erased"] = _rowcount(
        await db.execute(delete(Notification).where(Notification.user_id == user.id))
    )
    await db.execute(delete(DataNominee).where(DataNominee.user_id == user.id))
    await db.execute(
        update(DataRightsRequest)
        .where(DataRightsRequest.user_id == user.id)
        .values(requester_name="Deleted user", requester_email=None, requester_phone=None)
        .execution_options(synchronize_session=False)
    )
    await db.execute(delete(SavedItem).where(SavedItem.user_id == user.id))
    await db.execute(delete(DeviceToken).where(DeviceToken.user_id == user.id))
    await db.execute(
        update(VerificationToken)
        .where(VerificationToken.user_id == user.id, VerificationToken.used_at.is_(None))
        .values(used_at=func.now())
        .execution_options(synchronize_session=False)
    )
    summary["storage_keys"] = storage_keys
    return summary


async def enqueue_object_deletion(db: AsyncSession, keys: list[str], *, reason: str) -> None:
    """Delete storage objects after the transaction commits (job, in the caller's transaction)."""
    unique = sorted({k for k in keys if k})
    for start in range(0, len(unique), 200):
        await enqueue(db, DELETE_OBJECTS_TASK, {"keys": unique[start : start + 200], "reason": reason})


async def erase_account(
    db: AsyncSession,
    user: User,
    *,
    actor: User | None,
    reason: str | None,
    request: Request | None,
    trigger: str = "self_service",
    revoke_apple: bool = True,
) -> datetime:
    """Erase ``user`` completely and close the account (no blocker checks here; callers check them).
    Returns ``deleted_at``. No commit."""
    from app.modules.auth import apple as apple_api
    from app.modules.auth.service import TERMS_VERSION, record_consent, revoke_all_sessions

    now = _now()
    role = str(getattr(user.role, "value", user.role))
    profile = (
        await db.execute(select(PatientProfile).where(PatientProfile.user_id == user.id))
    ).scalar_one_or_none()
    if role == UserRole.AGENT:
        agent = (await db.execute(select(Agent).where(Agent.user_id == user.id))).scalar_one_or_none()
        if agent is not None:
            agent.status = AgentStatus.SUSPENDED
            agent.phone = None
    elif role == UserRole.HOSPITAL:
        await db.execute(delete(HospitalMember).where(HospitalMember.user_id == user.id))

    summary = await erase_personal_data(db, user, profile)
    keys: list[str] = summary.pop("storage_keys")
    sessions = await revoke_all_sessions(db, user.id)
    for kind in (
        ConsentKind.MARKETING,
        ConsentKind.AI_PROCESSING,
        ConsentKind.SHARE_WITH_AGENT,
        ConsentKind.SHARE_WITH_HOSPITALS,
    ):
        record_consent(db, user.id, kind, TERMS_VERSION, request, granted=False)

    apple_revoked: bool | None = None
    if revoke_apple and user.apple_refresh_token:
        apple_revoked = await apple_api.revoke_refresh_token(user.apple_refresh_token)
    user.email = None
    user.phone = None
    user.full_name = "Deleted user"
    user.avatar_url = None
    user.country_code = None
    user.apple_refresh_token = None
    user.google_sub = None
    user.apple_sub = None
    user.password_hash = None
    user.mfa_enabled = False
    user.mfa_secret = None
    user.status = UserStatus.DELETED
    user.deleted_at = now
    await enqueue_object_deletion(db, keys, reason="account_erasure")
    await audit_log(
        db,
        actor=actor,
        action="auth.account_deleted",
        entity_type="user",
        entity_id=user.id,
        after={
            "role": role,
            "trigger": trigger,
            "reason": reason,
            **summary,
            "files_deleted": len(keys),
            "sessions_revoked": sessions,
            "apple_token_revoked": apple_revoked,
        },
        request=request,
    )
    await db.flush()
    await publish(db, "user.deleted", {"user_id": str(user.id), "role": role, "trigger": trigger})
    logger.info("privacy.account_erased", user_id=str(user.id), trigger=trigger)
    return now


__all__ = [
    "DELETE_OBJECTS_TASK",
    "RETAINED_DOCUMENT_KINDS",
    "enqueue_object_deletion",
    "erase_account",
    "erase_personal_data",
    "strip_pii",
]
