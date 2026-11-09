"""Cross-module privacy gates.

* :func:`ensure_guardian_consent` - DPDP s.9: processing the personal data of a child (under
  ``AGE_OF_MAJORITY``) needs the verifiable consent of a parent or lawful guardian. Screening submission, AI
  processing (document reading, voice intake) and bookings call it and fail with ``guardian_consent_required``
  until a verified guardian consent exists.
* :func:`legal_hold_blockers` - legal holds on the account or any of the patient's cases block erasure.

Only core and models are imported at module level so any module can import this one without cycles.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import Forbidden
from app.models import Case, PatientProfile, User
from app.models.privacy import GuardianConsent

GUARDIAN_CONSENT_REQUIRED = "guardian_consent_required"


def age_on(dob: date, today: date | None = None) -> int:
    today = today or datetime.now(UTC).date()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


def is_minor(profile: PatientProfile | None, today: date | None = None) -> bool:
    """True when the profile's date of birth makes the patient younger than ``AGE_OF_MAJORITY``.

    An unknown date of birth is not treated as a minor (the sign-up 18+ attestation covers adults)."""
    if profile is None or profile.date_of_birth is None:
        return False
    return age_on(profile.date_of_birth, today) < settings.AGE_OF_MAJORITY


async def active_guardian_consent(db: AsyncSession, patient_id: uuid.UUID) -> GuardianConsent | None:
    """The latest guardian consent that is verified and not revoked."""
    return (
        await db.execute(
            select(GuardianConsent)
            .where(
                GuardianConsent.patient_id == patient_id,
                GuardianConsent.revoked_at.is_(None),
                GuardianConsent.verified_at.is_not(None),
            )
            .order_by(GuardianConsent.created_at.desc(), GuardianConsent.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


async def ensure_guardian_consent(db: AsyncSession, patient: PatientProfile | uuid.UUID | None) -> None:
    """Raise 403 ``guardian_consent_required`` for a minor patient without a verified guardian consent."""
    if patient is None:
        return
    profile = patient if isinstance(patient, PatientProfile) else await db.get(PatientProfile, patient)
    if not is_minor(profile):
        return
    assert profile is not None  # noqa: S101 - is_minor(None) is False
    if await active_guardian_consent(db, profile.id) is not None:
        return
    raise Forbidden(
        "This patient is under 18. A parent or legal guardian must give consent, and we must verify it, "
        "before we can continue.",
        code=GUARDIAN_CONSENT_REQUIRED,
        details={"patient_id": str(profile.id), "age_of_majority": settings.AGE_OF_MAJORITY},
    )


async def legal_hold_blockers(db: AsyncSession, user: User) -> dict[str, int]:
    """``{"legal_hold": n}`` when the account or any of the user's patient cases is under legal hold."""
    count = 1 if user.legal_hold else 0
    profile_id = (
        await db.execute(select(PatientProfile.id).where(PatientProfile.user_id == user.id))
    ).scalar_one_or_none()
    if profile_id is not None:
        count += int(
            (
                await db.execute(
                    select(func.count(Case.id)).where(
                        Case.patient_id == profile_id, Case.legal_hold.is_(True)
                    )
                )
            ).scalar_one()
            or 0
        )
    return {"legal_hold": count} if count else {}
