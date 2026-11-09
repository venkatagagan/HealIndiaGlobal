"""Create or refresh the App Store / Google Play REVIEW accounts (store gap CG-06).

Run from ``backend/`` against the target database (production is allowed - that is where reviewers sign in)::

    REVIEW_PATIENT_PASSWORD=... REVIEW_AGENT_PASSWORD=... REVIEW_HOSPITAL_PASSWORD=... \
        python -m scripts.seed_review_accounts

Passwords come ONLY from the environment (a secrets manager in production), never from code, and must pass the
normal password policy. Optional overrides: ``REVIEW_PATIENT_EMAIL``, ``REVIEW_AGENT_EMAIL``,
``REVIEW_HOSPITAL_EMAIL`` (defaults ``review.<role>@healindiaglobal.com``).

What it creates (idempotent: re-running resets the three passwords - rotate them after every review - and
keeps the demo data):

* three active, e-mail-verified accounts with MFA OFF and terms, privacy, AI-processing and 18+ consents;
* a review hospital "Heal India Global App Review Hospital" in status ``draft``: every public catalog and
  search query lists ``active`` hospitals only, so reviewers' data never shows to real patients. The review
  hospital user is its coordinator (not owner);
* for the patient: a completed rules-engine screening, a case in ``quoted`` with a sent quote the reviewer can
  accept, and a second case with a ``confirmed`` booking created directly (no payment rows, so the ledger and
  settlements are untouched);
* for the agent: an approved agency with two fictional managed patients, one with a quoted case.

Nothing here sends e-mail or touches payments, the ledger or settlements.
"""

from __future__ import annotations

import asyncio
import os
import sys
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any

REVIEW_ROLES = ("patient", "agent", "hospital")
REVIEW_HOSPITAL_SLUG = "hig-app-review-hospital"
REVIEW_AGENCY_CODE = "REVIEW01"


@dataclass(frozen=True)
class ReviewCredentials:
    patient_email: str
    patient_password: str
    agent_email: str
    agent_password: str
    hospital_email: str
    hospital_password: str


def credentials_from_env(env: dict[str, str] | None = None) -> ReviewCredentials:
    """Read the review credentials; raise ``SystemExit`` with a clear message when a password is missing."""
    env = dict(os.environ if env is None else env)
    missing = [
        f"REVIEW_{r.upper()}_PASSWORD" for r in REVIEW_ROLES if not env.get(f"REVIEW_{r.upper()}_PASSWORD")
    ]
    if missing:
        raise SystemExit(f"Set {', '.join(missing)} (from your secrets manager) and run again.")
    return ReviewCredentials(
        **{
            f"{r}_{field}": (
                env[f"REVIEW_{r.upper()}_PASSWORD"]
                if field == "password"
                else env.get(f"REVIEW_{r.upper()}_EMAIL") or f"review.{r}@healindiaglobal.com"
            ).strip()
            for r in REVIEW_ROLES
            for field in ("email", "password")
        }
    )


async def seed_review_accounts(
    db: Any, creds: ReviewCredentials, today: date | None = None
) -> dict[str, Any]:
    """Create/refresh the review accounts and their demo data in ``db`` (an AsyncSession); commits."""
    from sqlalchemy import select

    from app.core.enums import (
        AgentStatus,
        AgentTier,
        BookingStatus,
        CaseStatus,
        ConsentKind,
        HospitalMemberRole,
        HospitalStatus,
        KycStatus,
        PaymentOption,
        QuoteStatus,
        ScreeningStatus,
        Urgency,
        UserRole,
        UserStatus,
    )
    from app.core.security import hash_password, validate_password_strength
    from app.models import (
        Agent,
        Booking,
        Case,
        Consent,
        Hospital,
        HospitalMember,
        PatientProfile,
        Quote,
        Screening,
        User,
    )
    from app.models.sequences import next_number
    from app.modules.auth.service import AGE_ATTESTATION_VERSION, TERMS_VERSION, record_consent

    today = today or datetime.now(UTC).date()
    now = datetime.now(UTC)
    for password in (creds.patient_password, creds.agent_password, creds.hospital_password):
        validate_password_strength(password)

    async def upsert_user(email: str, password: str, role: UserRole, name: str, country: str) -> User:
        user = (await db.execute(select(User).where(User.email == email.lower()))).scalar_one_or_none()
        if user is not None and str(getattr(user.role, "value", user.role)) != role.value:
            raise SystemExit(f"{email} already exists with another role; choose another REVIEW_*_EMAIL.")
        if user is None:
            user = User(email=email.lower(), role=role, full_name=name, country_code=country)
            db.add(user)
        user.password_hash = hash_password(password)
        user.status = UserStatus.ACTIVE
        user.email_verified_at = user.email_verified_at or now
        user.mfa_enabled = False
        user.mfa_secret = None
        user.failed_login_count = 0
        user.locked_until = None
        user.is_guest = False
        user.is_adult = True
        user.deleted_at = None
        await db.flush()
        existing = set(
            (await db.execute(select(Consent.kind).where(Consent.user_id == user.id, Consent.granted)))
            .scalars()
            .all()
        )
        kinds = [ConsentKind.TERMS, ConsentKind.PRIVACY, ConsentKind.AGE_18_PLUS]
        if role == UserRole.PATIENT:
            kinds.append(ConsentKind.AI_PROCESSING)
        for kind in kinds:
            if kind not in existing:
                version = AGE_ATTESTATION_VERSION if kind == ConsentKind.AGE_18_PLUS else TERMS_VERSION
                record_consent(db, user.id, kind, version, None)
        return user

    async def profile_for(user: User | None, first: str, last: str, **extra: Any) -> PatientProfile:
        if user is not None:
            found = (
                await db.execute(select(PatientProfile).where(PatientProfile.user_id == user.id))
            ).scalar_one_or_none()
            if found is not None:
                return found
        else:
            # A fictional agent-managed patient: no e-mail or password, so nobody can sign in as them.
            user = User(email=None, role=UserRole.PATIENT, full_name=f"{first} {last}", country_code="GB")
            db.add(user)
            await db.flush()
        profile = PatientProfile(
            user_id=user.id,
            first_name=first,
            last_name=last,
            date_of_birth=date(1979, 4, 12),
            nationality="GB",
            country_of_residence="GB",
            preferred_language="en",
            preferred_currency="USD",
            **extra,
        )
        db.add(profile)
        await db.flush()
        return profile

    # --- accounts ---------------------------------------------------------------------------------------
    patient_user = await upsert_user(
        creds.patient_email, creds.patient_password, UserRole.PATIENT, "Review Patient", "GB"
    )
    agent_user = await upsert_user(
        creds.agent_email, creds.agent_password, UserRole.AGENT, "Review Agent", "AE"
    )
    hospital_user = await upsert_user(
        creds.hospital_email, creds.hospital_password, UserRole.HOSPITAL, "Review Hospital Coordinator", "IN"
    )

    # --- review hospital (draft = hidden from the public catalog and search) ----------------------------
    hospital = (
        await db.execute(select(Hospital).where(Hospital.slug == REVIEW_HOSPITAL_SLUG))
    ).scalar_one_or_none()
    if hospital is None:
        hospital = Hospital(
            slug=REVIEW_HOSPITAL_SLUG,
            name="Heal India Global App Review Hospital",
            legal_name="App Review Fixture (not a real hospital)",
            description="Fictional hospital used only by App Store and Google Play reviewers.",
            city="Chennai",
            state="Tamil Nadu",
            country="IN",
            status=HospitalStatus.DRAFT,
            kyc_status=KycStatus.NOT_SUBMITTED,
            international_desk=True,
        )
        db.add(hospital)
        await db.flush()
    member = (
        await db.execute(
            select(HospitalMember).where(
                HospitalMember.hospital_id == hospital.id, HospitalMember.user_id == hospital_user.id
            )
        )
    ).scalar_one_or_none()
    if member is None:
        db.add(
            HospitalMember(
                hospital_id=hospital.id, user_id=hospital_user.id, member_role=HospitalMemberRole.COORDINATOR
            )
        )

    # --- agency + managed patients -------------------------------------------------------------------------
    agent = (await db.execute(select(Agent).where(Agent.user_id == agent_user.id))).scalar_one_or_none()
    if agent is None:
        agent = Agent(
            user_id=agent_user.id,
            agency_name="Heal India Global Review Agency",
            agent_code=REVIEW_AGENCY_CODE,
            country="AE",
            city="Dubai",
            status=AgentStatus.ACTIVE,
            kyc_status=KycStatus.APPROVED,
            tier=AgentTier.BRONZE,
            approved_at=now,
        )
        db.add(agent)
        await db.flush()
    managed = list(
        (await db.execute(select(PatientProfile).where(PatientProfile.managed_by_agent_id == agent.id)))
        .scalars()
        .all()
    )
    for first, last in (("Omar", "Haddad (fictional)"), ("Fatima", "Rahman (fictional)"))[len(managed) :]:
        managed.append(
            await profile_for(None, first, last, managed_by_agent_id=agent.id, referred_by_agent_id=agent.id)
        )

    patient = await profile_for(patient_user, "Review", "Patient")

    # --- demo journeys (created once) ----------------------------------------------------------------------
    async def ensure_case(
        profile: PatientProfile, status: CaseStatus, note: str, **fields: Any
    ) -> tuple[Case, bool]:
        # patient_notes is field-encrypted (non-deterministic), so compare after decryption, not in SQL
        candidates = (
            await db.execute(
                select(Case).where(Case.patient_id == profile.id, Case.hospital_id == hospital.id)
            )
        ).scalars()
        existing = next((c for c in candidates if c.patient_notes == note), None)
        if existing is not None:
            return existing, False
        case = Case(
            case_number=await next_number(db, "case"),
            patient_id=profile.id,
            hospital_id=hospital.id,
            status=status,
            patient_notes=note,
            created_by_user_id=profile.user_id or agent_user.id,
            **fields,
        )
        db.add(case)
        await db.flush()
        return case, True

    def add_quote(case: Case) -> None:
        lines = [
            {"category": "surgery", "description": "Knee replacement (demo)", "amount_minor": 3_00_000_00},
            {"category": "hospital_stay", "description": "5 nights ward (demo)", "amount_minor": 60_000_00},
        ]
        db.add(
            Quote(
                case_id=case.id,
                hospital_id=hospital.id,
                prepared_by_user_id=hospital_user.id,
                status=QuoteStatus.SENT,
                treatment_plan="Demo plan for app review: tests, surgery and physiotherapy.",
                line_items=lines,
                total_minor=sum(li["amount_minor"] for li in lines),
                currency="INR",
                estimated_stay_days=14,
                valid_until=today + timedelta(days=90),
            )
        )

    screening = (
        await db.execute(select(Screening).where(Screening.patient_id == patient.id).limit(1))
    ).scalar_one_or_none()
    if screening is None:
        screening = Screening(
            patient_id=patient.id,
            created_by_user_id=patient_user.id,
            status=ScreeningStatus.COMPLETED,
            body_areas=["knee"],
            pain_intensity=5,
            notes="Demo screening for app review.",
            consent_ai=False,
            ai_result={"summary": "Demo result for app review. Not medical advice.", "engine": "rules"},
            urgency=Urgency.ROUTINE,
            submitted_at=now,
            completed_at=now,
        )
        db.add(screening)
        await db.flush()

    quoted, created = await ensure_case(
        patient, CaseStatus.QUOTED, "App review: knee pain (quoted demo case)"
    )
    if created:
        quoted.screening_id = screening.id
        add_quote(quoted)
    booked, created = await ensure_case(patient, CaseStatus.BOOKED, "App review: booked demo case")
    if created:
        admission = today + timedelta(days=45)
        db.add(
            Booking(
                booking_number=await next_number(db, "booking"),
                case_id=booked.id,
                patient_id=patient.id,
                hospital_id=hospital.id,
                status=BookingStatus.CONFIRMED,
                admission_date=admission,
                discharge_date=admission + timedelta(days=5),
                duration_days=14,
                payment_option=PaymentOption.DEPOSIT,
                currency="INR",
                subtotal_minor=3_60_000_00,
                total_minor=3_60_000_00,
                deposit_minor=72_000_00,
            )
        )
    agent_case, created = await ensure_case(
        managed[0], CaseStatus.QUOTED, "App review: agent-managed demo case", agent_id=agent.id
    )
    if created:
        add_quote(agent_case)
    await db.commit()
    return {
        "patient_user_id": patient_user.id,
        "agent_user_id": agent_user.id,
        "hospital_user_id": hospital_user.id,
        "hospital_id": hospital.id,
        "cases": [quoted.case_number, booked.case_number, agent_case.case_number],
    }


async def _main() -> int:
    from app.core import db as core_db
    from app.core.config import settings
    from app.core.logging import configure_logging

    configure_logging()
    creds = credentials_from_env()
    print(f"Review accounts -> ENV={settings.ENV}")
    try:
        async with core_db.SessionLocal() as session:
            result = await seed_review_accounts(session, creds)
    finally:
        await core_db.dispose_engine()
    print("Review accounts ready (passwords were read from the environment and are not printed):")
    for role in REVIEW_ROLES:
        print(f"  {role:<8} {getattr(creds, f'{role}_email')}")
    print(f"  demo cases: {', '.join(result['cases'])}")
    print(
        "Put the e-mails and passwords in App Store Connect (App Review Information) and in Play Console "
        "(App access)."
    )
    return 0


def main() -> int:
    os.environ.setdefault("RATE_LIMIT_ENABLED", "false")
    os.environ.setdefault("LOG_LEVEL", "WARNING")
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    return asyncio.run(_main())


if __name__ == "__main__":
    raise SystemExit(main())
