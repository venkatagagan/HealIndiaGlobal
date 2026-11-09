"""Auth business logic (PLAN 8.1 / 9.2): registration, login with lockout + TOTP, refresh-token rotation with
family reuse detection, Google sign-in, guests, email verification, password reset/change, MFA, consents,
device tokens, invites and account deletion.

Two login doors (PLAN 3.1): the *public* door (patient|agent|hospital; web cookie ``hig_refresh`` or mobile
body tokens) and the *staff* door (admin|finance|support|super_admin; web-only cookie ``hig_staff_refresh``,
TOTP, optional IP allowlist). Refresh tokens and access JWTs carry the door (``portal``); a token only works
at its own door.

Routers stay thin: they parse the request, call these functions and turn ``IssuedSession`` into a
``TokenOut`` (+ the refresh cookie for web clients).
"""

from __future__ import annotations

import re
import secrets
import unicodedata
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import structlog
from fastapi import Request
from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.dialects.postgresql import distinct_on
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import set_committed_value

from app.core.audit import audit_log
from app.core.config import settings
from app.core.deps import get_client_ip, get_user_agent, is_staff
from app.core.enums import (
    AgentStatus,
    AuthPortal,
    BookingStatus,
    CaseStatus,
    ConsentKind,
    HospitalMemberRole,
    HospitalStatus,
    KycStatus,
    OrderStatus,
    UserRole,
    UserStatus,
    VerificationPurpose,
)
from app.core.errors import BadRequest, Conflict, Forbidden, NotFound, Unauthorized
from app.core.events import publish
from app.core.ids import uuid7
from app.core.jobs import enqueue
from app.core.security import (
    create_access_token,
    hash_password,
    hash_token,
    match_totp_step,
    needs_rehash,
    new_opaque_token,
    new_refresh_token,
    new_totp_secret,
    totp_uri,
    validate_password_strength,
    verify_password,
    verify_totp,
)
from app.models import (
    Agent,
    AuditLog,
    Booking,
    Case,
    Consent,
    DeviceToken,
    Document,
    Hospital,
    HospitalMember,
    PatientCompanion,
    PatientProfile,
    PaymentOrder,
    RefreshToken,
    SavedItem,
    User,
    VerificationToken,
)
from app.modules.auth import apple as apple_api
from app.modules.auth.apple import verify_apple_identity_token
from app.modules.auth.google import verify_google_id_token
from app.modules.auth.schemas import (
    AcceptInviteIn,
    AccountDeleteIn,
    AppleIn,
    ConsentIn,
    DeletionRequestIn,
    DeviceIn,
    GoogleIn,
    GuestUpgradeIn,
    MeUpdateIn,
    RegisterIn,
    UserHospitalRef,
    UserOut,
)
from app.modules.auth.scoping import agent_id_for, hospital_memberships_for, patient_profile_id_for

logger = structlog.get_logger(__name__)

REFRESH_COOKIE_NAME = "hig_refresh"
REFRESH_COOKIE_PATH = "/api/v1/auth"
STAFF_REFRESH_COOKIE_NAME = "hig_staff_refresh"
STAFF_REFRESH_COOKIE_PATH = "/api/v1/auth/staff"
TERMS_VERSION = "2026-10"
AGREEMENT_VERSION = "2026-10"
LOCKOUT_THRESHOLD = 5
LOCKOUT_MINUTES = 15
VERIFY_EMAIL_TTL_HOURS = 48
RESET_PASSWORD_TTL_MINUTES = 60
MFA_ENROLMENT_TTL_HOURS = 24
GENERIC_LOGIN_ERROR = "Incorrect email or password"

# Current version of each versioned legal text (GET /auth/consents/versions). Agreement kinds must be accepted
# at exactly the current version; other kinds record whatever version the client displayed.
CONSENT_VERSIONS: dict[ConsentKind, str] = {
    ConsentKind.TERMS: TERMS_VERSION,
    ConsentKind.PRIVACY: TERMS_VERSION,
    ConsentKind.HOSPITAL_PARTNER_AGREEMENT: AGREEMENT_VERSION,
    ConsentKind.AGENT_AGREEMENT: AGREEMENT_VERSION,
}
AGREEMENT_KINDS = frozenset({ConsentKind.HOSPITAL_PARTNER_AGREEMENT, ConsentKind.AGENT_AGREEMENT})

# What DELETE /auth/me keeps (INTEGRATION_BACKLOG #15; returned to the client and stored in the audit log).
RETENTION_RULES: tuple[str, ...] = (
    "Payments, invoices, refunds and ledger entries are kept for the statutory period required by tax and "
    "accounting law.",
    "Medical records that belong to a case (case details, quotes, bookings, travel records and case "
    "documents) are kept for the period required by medical-records rules; only the treating hospital and "
    "our compliance staff can access them.",
    "Consent and security audit records are kept as evidence of what was agreed and done.",
    "Your name, date of birth and nationality stay on those retained records. Contact details, passport and "
    "insurance numbers, health notes on your profile, companions, saved items, devices and documents that "
    "are not part of a case are erased, and you are signed out everywhere.",
)
_ACTIVE_CASE_STATUSES = (CaseStatus.ACCEPTED, CaseStatus.BOOKED, CaseStatus.IN_TREATMENT)
_ACTIVE_BOOKING_STATUSES = (BookingStatus.CONFIRMED, BookingStatus.ADMITTED)
_PENDING_ORDER_STATUSES = (OrderStatus.PENDING,)
_AGENT_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def utcnow() -> datetime:
    return datetime.now(UTC)


def _role(user: User) -> str:
    return str(getattr(user.role, "value", user.role))


def _status(user: User) -> str:
    return str(getattr(user.status, "value", user.status))


def normalize_email(email: str) -> str:
    return email.strip().lower()


def split_name(full_name: str) -> tuple[str, str]:
    parts = full_name.strip().split(None, 1)
    if not parts:
        return "", ""
    first = parts[0][:100]
    last = parts[1][:100] if len(parts) > 1 else ""
    return first, last


@dataclass(slots=True)
class IssuedSession:
    user: User
    access_token: str
    refresh_token: str
    family_id: uuid.UUID
    expires_in: int
    portal: AuthPortal = AuthPortal.PUBLIC


def _portal_value(portal: Any) -> str:
    return str(getattr(portal, "value", portal))


def _generic_login_failure() -> Unauthorized:
    return Unauthorized(GENERIC_LOGIN_ERROR, code="invalid_credentials")


# --- UserOut ---------------------------------------------------------------------------------------------
async def build_user_out(db: AsyncSession, user: User) -> UserOut:
    role = _role(user)
    patient_profile_id = await patient_profile_id_for(db, user.id) if role == UserRole.PATIENT else None
    agent_id = await agent_id_for(db, user.id) if role == UserRole.AGENT else None
    hospitals: list[UserHospitalRef] = []
    pending_consents: list[ConsentKind] = []
    if role == UserRole.PATIENT and not user.is_guest:
        # lazy: agents.consent only imports core/models/agents.schemas (no cycle with auth)
        from app.modules.agents.consent import pending_agent_consents

        pending_consents = list(await pending_agent_consents(db, user.id))
    if role == UserRole.HOSPITAL:
        hospitals = [
            UserHospitalRef(id=hid, name=name, slug=slug, member_role=member_role)
            for hid, name, slug, member_role in await hospital_memberships_for(db, user.id)
        ]
    return UserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        status=user.status,
        phone=user.phone,
        country_code=user.country_code,
        preferred_language=user.preferred_language,
        avatar_url=user.avatar_url,
        is_guest=user.is_guest,
        email_verified=user.email_verified_at is not None,
        mfa_enabled=user.mfa_enabled,
        created_at=user.created_at,
        patient_profile_id=patient_profile_id,
        agent_id=agent_id,
        hospitals=hospitals,
        pending_consents=pending_consents,
    )


# --- sessions --------------------------------------------------------------------------------------------
async def issue_session(
    db: AsyncSession,
    user: User,
    request: Request | None,
    *,
    family_id: uuid.UUID | None = None,
    portal: AuthPortal = AuthPortal.PUBLIC,
) -> tuple[IssuedSession, RefreshToken]:
    """Create a refresh token row (new family unless ``family_id``) and an access token bound to it, both
    stamped with the login door ``portal``."""
    raw, token_hash = new_refresh_token()
    family = family_id or uuid7()
    row = RefreshToken(
        user_id=user.id,
        token_hash=token_hash,
        family_id=family,
        expires_at=utcnow() + timedelta(days=settings.REFRESH_TOKEN_TTL_DAYS),
        user_agent=get_user_agent(request) if request is not None else None,
        ip=get_client_ip(request) if request is not None else None,
        portal=portal,
    )
    db.add(row)
    access = create_access_token(user.id, _role(user), family, portal=_portal_value(portal))
    issued = IssuedSession(
        user=user,
        access_token=access,
        refresh_token=raw,
        family_id=family,
        expires_in=settings.ACCESS_TOKEN_TTL_MINUTES * 60,
        portal=portal,
    )
    return issued, row


async def revoke_family(db: AsyncSession, family_id: uuid.UUID) -> int:
    result = await db.execute(
        update(RefreshToken)
        .where(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=func.now())
        .execution_options(synchronize_session=False)
    )
    return int(getattr(result, "rowcount", 0) or 0)


async def revoke_all_sessions(
    db: AsyncSession, user_id: uuid.UUID, *, except_family: uuid.UUID | None = None
) -> int:
    stmt = update(RefreshToken).where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
    if except_family is not None:
        stmt = stmt.where(RefreshToken.family_id != except_family)
    result = await db.execute(stmt.values(revoked_at=func.now()).execution_options(synchronize_session=False))
    return int(getattr(result, "rowcount", 0) or 0)


def _ensure_can_sign_in(user: User) -> None:
    status = _status(user)
    if status == UserStatus.DELETED or user.deleted_at is not None:
        raise Forbidden("This account has been deleted", code="account_deleted")
    if status == UserStatus.SUSPENDED:
        raise Forbidden("This account is suspended", code="account_suspended")
    if (
        settings.REQUIRE_EMAIL_VERIFICATION
        and status == UserStatus.PENDING_VERIFICATION
        and user.email_verified_at is None
    ):
        raise Forbidden("Please verify your email address before signing in", code="email_not_verified")


def _locked_until(user: User) -> datetime | None:
    if user.locked_until is not None and user.locked_until > utcnow():
        return user.locked_until
    return None


def _raise_locked(until: datetime) -> None:
    retry_after = max(1, int((until - utcnow()).total_seconds()))
    raise Forbidden(
        "Too many failed sign-in attempts. Try again later.",
        code="account_locked",
        details={"locked_until": until.isoformat()},
        headers={"Retry-After": str(retry_after)},
    )


# --- consents / verification helpers ---------------------------------------------------------------------
def _record_consents(
    db: AsyncSession,
    user_id: uuid.UUID,
    kinds: list[ConsentKind],
    version: str,
    request: Request | None,
    granted: bool = True,
    *,
    case_id: uuid.UUID | None = None,
    hospital_id: uuid.UUID | None = None,
    granted_by_user_id: uuid.UUID | None = None,
) -> list[Consent]:
    rows = [
        Consent(
            user_id=user_id,
            kind=kind,
            version=version,
            granted=granted,
            case_id=case_id,
            hospital_id=hospital_id,
            granted_by_user_id=granted_by_user_id if granted_by_user_id != user_id else None,
            ip=get_client_ip(request) if request is not None else None,
            user_agent=get_user_agent(request) if request is not None else None,
        )
        for kind in kinds
    ]
    db.add_all(rows)
    return rows


async def _invalidate_tokens(db: AsyncSession, user_id: uuid.UUID, purpose: VerificationPurpose) -> None:
    await db.execute(
        update(VerificationToken)
        .where(
            VerificationToken.user_id == user_id,
            VerificationToken.purpose == purpose,
            VerificationToken.used_at.is_(None),
        )
        .values(used_at=func.now())
        .execution_options(synchronize_session=False)
    )


async def _new_verification_token(
    db: AsyncSession, user_id: uuid.UUID, purpose: VerificationPurpose, ttl: timedelta
) -> str:
    await _invalidate_tokens(db, user_id, purpose)
    raw, token_hash = new_opaque_token()
    db.add(
        VerificationToken(user_id=user_id, purpose=purpose, token_hash=token_hash, expires_at=utcnow() + ttl)
    )
    return raw


def one_time_link(path: str, raw_token: str) -> str:
    """Public-door link for a one-time token (INTEGRATION_BACKLOG #22). The token travels in the URL
    *fragment*, which browsers never send to servers or in ``Referer``; the page reads ``location.hash`` and
    POSTs ``{token}`` to the API."""
    return f"{settings.PUBLIC_SITE_URL.rstrip('/')}{path}#token={raw_token}"


async def send_verification_email(db: AsyncSession, user: User) -> None:
    """Create a verify-email token and enqueue the email (caller commits)."""
    if not user.email:
        return
    raw = await _new_verification_token(
        db, user.id, VerificationPurpose.VERIFY_EMAIL, timedelta(hours=VERIFY_EMAIL_TTL_HOURS)
    )
    await enqueue(
        db,
        "email.send",
        {
            "to": user.email,
            "subject": f"Verify your email for {settings.APP_NAME}",
            "template": "verify_email.html",
            "context": {
                "name": user.full_name or "there",
                "url": one_time_link("/verify-email", raw),
                "expires_hours": VERIFY_EMAIL_TTL_HOURS,
            },
        },
    )


async def _consume_token(db: AsyncSession, raw: str, purpose: VerificationPurpose) -> VerificationToken:
    row = (
        await db.execute(
            select(VerificationToken)
            .where(VerificationToken.token_hash == hash_token(raw), VerificationToken.purpose == purpose)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if row is None or row.used_at is not None or row.expires_at <= utcnow():
        raise BadRequest("This link is invalid or has expired", code="invalid_token")
    row.used_at = utcnow()
    return row


# --- registration ----------------------------------------------------------------------------------------
def _slugify(text: str) -> str:
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", ascii_text).strip("-").lower()
    return slug[:120].strip("-") or "hospital"


async def _unique_hospital_slug(db: AsyncSession, name: str) -> str:
    base = _slugify(name)
    candidate = base
    for _ in range(20):
        exists = (await db.execute(select(Hospital.id).where(Hospital.slug == candidate))).first()
        if exists is None:
            return candidate
        candidate = f"{base}-{secrets.token_hex(3)}"
    return f"{base}-{uuid.uuid4().hex[:12]}"


async def _unique_agent_code(db: AsyncSession) -> str:
    for _ in range(50):
        code = "AGT" + "".join(secrets.choice(_AGENT_CODE_ALPHABET) for _ in range(5))
        exists = (await db.execute(select(Agent.id).where(Agent.agent_code == code))).first()
        if exists is None:
            return code
    raise Conflict("Could not allocate an agent code, please retry")  # pragma: no cover


async def _resolve_referral(db: AsyncSession, referral_code: str | None) -> uuid.UUID | None:
    if not referral_code:
        return None
    code = referral_code.strip().upper()
    if not code:
        return None
    agent = (await db.execute(select(Agent).where(Agent.agent_code == code))).scalar_one_or_none()
    if agent is None:
        raise BadRequest("The referral code is not valid", code="invalid_referral_code")
    if str(getattr(agent.status, "value", agent.status)) != AgentStatus.ACTIVE:
        logger.info("auth.referral_agent_inactive", agent_id=str(agent.id))
        return None
    return agent.id


async def _ensure_email_free(db: AsyncSession, email: str) -> None:
    existing = (await db.execute(select(User.id).where(User.email == email))).first()
    if existing is not None:
        raise Conflict("An account with this email already exists", code="email_taken")


async def _create_role_records(
    db: AsyncSession,
    user: User,
    *,
    role: str,
    phone: str | None,
    country_code: str | None,
    referred_by_agent_id: uuid.UUID | None,
    agency_name: str | None,
    hospital_name: str | None,
    city: str | None,
) -> uuid.UUID | None:
    """Create the tenant record for ``role``; returns the new hospital id for hospital sign-ups."""
    if role == UserRole.PATIENT:
        first, last = split_name(user.full_name)
        db.add(
            PatientProfile(
                user_id=user.id,
                first_name=first,
                last_name=last,
                phone=phone,
                nationality=country_code,
                country_of_residence=country_code,
                preferred_language=user.preferred_language,
                preferred_currency=settings.DEFAULT_PATIENT_CURRENCY,
                referred_by_agent_id=referred_by_agent_id,
            )
        )
    elif role == UserRole.AGENT:
        db.add(
            Agent(
                user_id=user.id,
                agency_name=(agency_name or user.full_name or "Agency").strip()[:200],
                agent_code=await _unique_agent_code(db),
                country=country_code,
                city=(city or None),
                phone=phone,
                status=AgentStatus.PENDING,
                kyc_status=KycStatus.NOT_SUBMITTED,
            )
        )
    elif role == UserRole.HOSPITAL:
        name = (hospital_name or f"{user.full_name} Hospital").strip()[:200]
        hospital = Hospital(
            slug=await _unique_hospital_slug(db, name),
            name=name,
            city=(city or None),
            country="IN",
            phone=phone,
            email=user.email,
            status=HospitalStatus.DRAFT,
            kyc_status=KycStatus.NOT_SUBMITTED,
        )
        db.add(hospital)
        await db.flush()
        db.add(HospitalMember(hospital_id=hospital.id, user_id=user.id, member_role=HospitalMemberRole.OWNER))
        return hospital.id
    return None


def _record_agreement_at_signup(
    db: AsyncSession, user: User, role: str, hospital_id: uuid.UUID | None, request: Request
) -> None:
    """Agent/hospital sign-up forms may include the click-through partner agreement (``accept_agreement``)."""
    if role == UserRole.AGENT:
        _record_consents(db, user.id, [ConsentKind.AGENT_AGREEMENT], AGREEMENT_VERSION, request)
    elif role == UserRole.HOSPITAL and hospital_id is not None:
        _record_consents(
            db,
            user.id,
            [ConsentKind.HOSPITAL_PARTNER_AGREEMENT],
            AGREEMENT_VERSION,
            request,
            hospital_id=hospital_id,
        )


async def register(db: AsyncSession, body: RegisterIn, request: Request) -> IssuedSession:
    validate_password_strength(body.password)
    email = normalize_email(str(body.email))
    await _ensure_email_free(db, email)
    referred_by = await _resolve_referral(db, body.referral_code) if body.role == "patient" else None

    status = UserStatus.PENDING_VERIFICATION if settings.REQUIRE_EMAIL_VERIFICATION else UserStatus.ACTIVE
    user = User(
        email=email,
        password_hash=hash_password(body.password),
        full_name=body.full_name.strip(),
        role=UserRole(body.role),
        status=status,
        phone=body.phone,
        country_code=body.country_code,
        last_login_at=utcnow(),
    )
    db.add(user)
    await db.flush()
    hospital_id = await _create_role_records(
        db,
        user,
        role=body.role,
        phone=body.phone,
        country_code=body.country_code,
        referred_by_agent_id=referred_by,
        agency_name=body.agency_name,
        hospital_name=body.hospital_name,
        city=body.city,
    )
    _record_consents(db, user.id, [ConsentKind.TERMS, ConsentKind.PRIVACY], TERMS_VERSION, request)
    if body.accept_agreement:
        _record_agreement_at_signup(db, user, body.role, hospital_id, request)
    await send_verification_email(db, user)
    await audit_log(
        db,
        actor=user,
        action="auth.register",
        entity_type="user",
        entity_id=user.id,
        after={"role": body.role, "referred_by_agent_id": referred_by},
        request=request,
    )
    await db.flush()
    await publish(db, "user.registered", {"user_id": str(user.id), "role": body.role})
    issued, _ = await issue_session(db, user, request)
    await db.commit()
    return issued


# --- login -----------------------------------------------------------------------------------------------
async def _register_failure(db: AsyncSession, user: User, request: Request, reason: str) -> datetime | None:
    """Count a failed attempt atomically; lock the account at the threshold. Commits."""
    count = (
        await db.execute(
            update(User)
            .where(User.id == user.id)
            .values(failed_login_count=User.failed_login_count + 1)
            .returning(User.failed_login_count)
            .execution_options(synchronize_session=False)
        )
    ).scalar_one()
    locked: datetime | None = None
    if count >= LOCKOUT_THRESHOLD:
        locked = utcnow() + timedelta(minutes=LOCKOUT_MINUTES)
        await db.execute(
            update(User)
            .where(User.id == user.id)
            .values(locked_until=locked, failed_login_count=0)
            .execution_options(synchronize_session=False)
        )
    await audit_log(
        db,
        actor=None,
        actor_role="anonymous",
        action="auth.login_failed",
        entity_type="user",
        entity_id=user.id,
        after={"reason": reason, "locked": locked is not None},
        request=request,
    )
    if locked is not None:
        await audit_log(
            db,
            actor=None,
            action="auth.account_locked",
            entity_type="user",
            entity_id=user.id,
            after={"locked_until": locked},
            request=request,
        )
        if user.email:
            # SEC-017: the sign-in answer does not reveal the lock, so tell the owner by email.
            await enqueue(
                db,
                "email.send",
                {
                    "to": user.email,
                    "subject": f"Sign-in to your {settings.APP_NAME} account was paused",
                    "template": "generic_notification.html",
                    "context": {
                        "title": "Sign-in paused for 15 minutes",
                        "name": user.full_name or "there",
                        "body": (
                            "We noticed several unsuccessful attempts to sign in to your account, so new "
                            f"sign-ins are paused for {LOCKOUT_MINUTES} minutes. You stay signed in on your "
                            "devices.\n\nIf this was not you, we recommend changing your password and "
                            "turning on two-factor authentication."
                        ),
                    },
                },
                dedupe_key=f"account-locked:{user.id}:{int(locked.timestamp()) // 60}",
            )
    await db.commit()
    return locked


async def _password_or_fail(db: AsyncSession, user: User, password: str, request: Request) -> None:
    """Password check with the failed-sign-in lock (SEC-017). While the account is locked a wrong password
    gets the same 401 as an unknown email (no account-existence oracle) and is not counted again; only
    someone who knows the password learns about the lock. Reaching the threshold also answers 401 (the
    owner is emailed instead)."""
    password_ok = verify_password(password, user.password_hash)
    locked = _locked_until(user)
    if locked is not None:
        if password_ok:
            _raise_locked(locked)
        raise _generic_login_failure()
    if not password_ok:
        await _register_failure(db, user, request, "invalid_password")
        raise _generic_login_failure()


async def _consume_totp(db: AsyncSession, user: User, secret: str | None, code: str | None) -> bool:
    """Verify a TOTP code and burn its time step (SEC-024): the same code, or an older one, is refused even
    while it is still inside the +/-1 step window. Atomic, so two parallel requests cannot both use it."""
    step = match_totp_step(secret, code)
    if step is None:
        return False
    burned = (
        await db.execute(
            update(User)
            .where(User.id == user.id, or_(User.mfa_last_step.is_(None), User.mfa_last_step < step))
            .values(mfa_last_step=step)
            .returning(User.id)
            .execution_options(synchronize_session=False)
        )
    ).scalar_one_or_none()
    if burned is None:
        return False
    set_committed_value(user, "mfa_last_step", step)
    return True


async def _verify_otp_or_fail(
    db: AsyncSession, user: User, secret: str | None, otp_code: str, request: Request
) -> None:
    if not await _consume_totp(db, user, secret, otp_code):
        locked = await _register_failure(db, user, request, "invalid_otp")
        if locked is not None:
            _raise_locked(locked)
        raise Unauthorized("The authentication code is not valid", code="invalid_otp")


async def _check_mfa(db: AsyncSession, user: User, otp_code: str | None, request: Request) -> None:
    """Enforce TOTP for accounts that enabled it (the staff door adds mandatory enrolment on top)."""
    if user.mfa_enabled:
        if not otp_code:
            raise Unauthorized("Enter the code from your authenticator app", code="mfa_required")
        await _verify_otp_or_fail(db, user, user.mfa_secret, otp_code, request)


async def _audit_door_rejection(db: AsyncSession, user: User, portal: AuthPortal, request: Request) -> None:
    """A real account tried the wrong door: audit it (no failure count, generic answer to the client)."""
    await audit_log(
        db,
        actor=None,
        actor_role="anonymous",
        action="auth.wrong_door",
        entity_type="user",
        entity_id=user.id,
        after={"portal": _portal_value(portal), "role": _role(user)},
        request=request,
    )
    await db.commit()


async def _complete_login(
    db: AsyncSession,
    user: User,
    request: Request,
    method: str,
    portal: AuthPortal = AuthPortal.PUBLIC,
) -> IssuedSession:
    user.failed_login_count = 0
    user.locked_until = None
    user.last_login_at = utcnow()
    await audit_log(
        db,
        actor=user,
        action="auth.staff_login" if portal == AuthPortal.STAFF else "auth.login",
        entity_type="user",
        entity_id=user.id,
        after={"method": method, "portal": _portal_value(portal)},
        request=request,
    )
    issued, _ = await issue_session(db, user, request, portal=portal)
    await db.commit()
    return issued


async def login(
    db: AsyncSession, email: str, password: str, otp_code: str | None, request: Request
) -> IssuedSession:
    normalized = normalize_email(email)
    user = (await db.execute(select(User).where(User.email == normalized))).scalar_one_or_none()
    if user is None or is_staff(user):
        # Unknown account, or a staff account at the public door (PLAN 3.1): same generic answer + timing.
        verify_password(password, None)
        if user is not None:
            await _audit_door_rejection(db, user, AuthPortal.PUBLIC, request)
        raise _generic_login_failure()
    await _password_or_fail(db, user, password, request)
    _ensure_can_sign_in(user)
    await _check_mfa(db, user, otp_code, request)
    if user.password_hash and needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
    return await _complete_login(db, user, request, "password")


# --- google ----------------------------------------------------------------------------------------------
@dataclass(frozen=True, slots=True)
class FederatedIdentity:
    provider: str  # "google" | "apple"
    sub: str
    email: str | None
    email_verified: bool
    name: str | None = None
    picture: str | None = None


@dataclass(frozen=True, slots=True)
class FederatedSignUp:
    role: str | None
    otp_code: str | None
    agency_name: str | None
    hospital_name: str | None
    city: str | None
    referral_code: str | None
    accept_agreement: bool


async def _federated_sign_in(
    db: AsyncSession, identity: FederatedIdentity, extra: FederatedSignUp, request: Request
) -> tuple[IssuedSession, bool]:
    """Google/Apple: sign in by provider subject, else link an existing account by verified email, else sign
    up (public-door roles only). Returns ``(session, created)``."""
    provider = identity.provider
    label = "Google" if provider == "google" else "Apple"
    sub_column = User.google_sub if provider == "google" else User.apple_sub
    sub_attr = "google_sub" if provider == "google" else "apple_sub"
    user = (await db.execute(select(User).where(sub_column == identity.sub))).scalar_one_or_none()
    linked = False
    if user is None and identity.email and identity.email_verified:
        user = (await db.execute(select(User).where(User.email == identity.email))).scalar_one_or_none()
        if user is not None and user.email_verified_at is None:
            # SEC-001 (account pre-hijacking): never attach a provider identity to an account whose owner has
            # not proven control of the email - someone else may have registered it with their own password.
            await audit_log(
                db,
                actor=None,
                actor_role="anonymous",
                action=f"auth.{provider}_link_refused",
                entity_type="user",
                entity_id=user.id,
                after={"reason": "email_unverified"},
                request=request,
            )
            await db.commit()
            raise Conflict(
                "An account with this email already exists but its email address is not verified yet. Sign "
                "in with your password, or reset it, and verify your email first.",
                code="account_exists_unverified",
            )
        if user is not None:
            current = getattr(user, sub_attr)
            if current and current != identity.sub:
                raise Conflict(
                    f"This email is linked to a different {label} account",
                    code=f"{provider}_account_mismatch",
                )
            setattr(user, sub_attr, identity.sub)
            if user.email_verified_at is None:
                user.email_verified_at = utcnow()
            linked = True
    if user is not None and is_staff(user):
        await _audit_door_rejection(db, user, AuthPortal.PUBLIC, request)
        raise Unauthorized(f"{label} sign-in failed", code="invalid_credentials")
    if user is not None:
        locked = _locked_until(user)
        if locked is not None:
            _raise_locked(locked)
        _ensure_can_sign_in(user)
        if linked:
            await audit_log(
                db,
                actor=user,
                action=f"auth.{provider}_linked",
                entity_type="user",
                entity_id=user.id,
                request=request,
            )
        await _check_mfa(db, user, extra.otp_code, request)
        return await _complete_login(db, user, request, provider), False

    if not identity.email or not identity.email_verified:
        raise BadRequest(
            f"Your {label} account has no verified email address", code=f"{provider}_email_unverified"
        )
    await _ensure_email_free(db, identity.email)
    role = extra.role or "patient"
    name = (identity.name or identity.email.split("@", 1)[0])[:200]
    referred_by = await _resolve_referral(db, extra.referral_code) if role == "patient" else None
    user = User(
        email=identity.email,
        password_hash=None,
        full_name=name,
        role=UserRole(role),
        status=UserStatus.ACTIVE,
        email_verified_at=utcnow(),
        avatar_url=identity.picture,
        last_login_at=utcnow(),
    )
    setattr(user, sub_attr, identity.sub)
    db.add(user)
    await db.flush()
    hospital_id = await _create_role_records(
        db,
        user,
        role=role,
        phone=None,
        country_code=None,
        referred_by_agent_id=referred_by,
        agency_name=extra.agency_name or name,
        hospital_name=extra.hospital_name,
        city=extra.city,
    )
    _record_consents(db, user.id, [ConsentKind.TERMS, ConsentKind.PRIVACY], TERMS_VERSION, request)
    if extra.accept_agreement:
        _record_agreement_at_signup(db, user, role, hospital_id, request)
    await audit_log(
        db,
        actor=user,
        action="auth.register",
        entity_type="user",
        entity_id=user.id,
        after={"role": role, "method": provider, "referred_by_agent_id": referred_by},
        request=request,
    )
    await db.flush()
    await publish(db, "user.registered", {"user_id": str(user.id), "role": role})
    issued, _ = await issue_session(db, user, request)
    await db.commit()
    return issued, True


async def google_sign_in(db: AsyncSession, body: GoogleIn, request: Request) -> tuple[IssuedSession, bool]:
    """Sign in (or sign up) with a Google ID token. Returns ``(session, created)``."""
    google = await verify_google_id_token(body.id_token)
    identity = FederatedIdentity(
        provider="google",
        sub=google.sub,
        email=google.email,
        email_verified=google.email_verified,
        name=google.name,
        picture=google.picture,
    )
    extra = FederatedSignUp(
        role=body.role,
        otp_code=body.otp_code,
        agency_name=body.agency_name,
        hospital_name=body.hospital_name,
        city=body.city,
        referral_code=body.referral_code,
        accept_agreement=body.accept_agreement,
    )
    return await _federated_sign_in(db, identity, extra, request)


async def apple_sign_in(db: AsyncSession, body: AppleIn, request: Request) -> tuple[IssuedSession, bool]:
    """Sign in (or sign up) with an Apple identity token (+ raw nonce). Returns ``(session, created)``.

    When ``authorization_code`` is sent and the Apple token API is configured, Apple's refresh token is
    stored (encrypted) so that account deletion can revoke it (App Store requirement)."""
    apple = await verify_apple_identity_token(body.identity_token, body.nonce)
    name = None
    if body.full_name is not None:
        parts = [body.full_name.given_name or "", body.full_name.family_name or ""]
        name = " ".join(p.strip() for p in parts if p and p.strip()) or None
    identity = FederatedIdentity(
        provider="apple", sub=apple.sub, email=apple.email, email_verified=apple.email_verified, name=name
    )
    extra = FederatedSignUp(
        role=body.role,
        otp_code=body.otp_code,
        agency_name=body.agency_name,
        hospital_name=body.hospital_name,
        city=body.city,
        referral_code=body.referral_code,
        accept_agreement=body.accept_agreement,
    )
    issued, created = await _federated_sign_in(db, identity, extra, request)
    if body.authorization_code:
        refresh_token = await apple_api.exchange_authorization_code(body.authorization_code, apple.audience)
        if refresh_token:
            issued.user.apple_refresh_token = apple_api.pack_refresh_token(apple.audience, refresh_token)
            await db.commit()
    return issued, created


# --- guests ----------------------------------------------------------------------------------------------
async def create_guest(db: AsyncSession, request: Request) -> IssuedSession:
    user = User(
        email=None,
        password_hash=None,
        full_name="Guest",
        role=UserRole.PATIENT,
        status=UserStatus.ACTIVE,
        is_guest=True,
        last_login_at=utcnow(),
    )
    db.add(user)
    await db.flush()
    db.add(
        PatientProfile(
            user_id=user.id,
            first_name="Guest",
            last_name="",
            preferred_currency=settings.DEFAULT_PATIENT_CURRENCY,
        )
    )
    await audit_log(
        db, actor=user, action="auth.guest_created", entity_type="user", entity_id=user.id, request=request
    )
    issued, _ = await issue_session(db, user, request)
    await db.commit()
    return issued


async def upgrade_guest(
    db: AsyncSession, user: User, body: GuestUpgradeIn, request: Request, current_family: uuid.UUID | None
) -> IssuedSession:
    if _role(user) != UserRole.PATIENT or not user.is_guest:
        raise BadRequest("Only guest accounts can be upgraded", code="not_guest")
    validate_password_strength(body.password)
    email = normalize_email(str(body.email))
    await _ensure_email_free(db, email)
    user.email = email
    user.password_hash = hash_password(body.password)
    user.full_name = body.full_name.strip()
    user.is_guest = False
    if settings.REQUIRE_EMAIL_VERIFICATION:
        user.status = UserStatus.PENDING_VERIFICATION
    profile = (
        await db.execute(select(PatientProfile).where(PatientProfile.user_id == user.id))
    ).scalar_one_or_none()
    first, last = split_name(user.full_name)
    if profile is None:
        db.add(
            PatientProfile(
                user_id=user.id,
                first_name=first,
                last_name=last,
                preferred_currency=settings.DEFAULT_PATIENT_CURRENCY,
            )
        )
    elif (profile.first_name in ("", "Guest")) and not profile.last_name:
        profile.first_name, profile.last_name = first, last
    _record_consents(db, user.id, [ConsentKind.TERMS, ConsentKind.PRIVACY], TERMS_VERSION, request)
    await send_verification_email(db, user)
    await audit_log(
        db,
        actor=user,
        action="auth.guest_upgraded",
        entity_type="user",
        entity_id=user.id,
        after={"email": email},
        request=request,
    )
    if current_family is not None:
        await revoke_family(db, current_family)
    await db.flush()
    await publish(db, "user.registered", {"user_id": str(user.id), "role": UserRole.PATIENT.value})
    issued, _ = await issue_session(db, user, request)
    await db.commit()
    return issued


# --- refresh / logout ------------------------------------------------------------------------------------
async def refresh(
    db: AsyncSession, raw_token: str, request: Request, portal: AuthPortal = AuthPortal.PUBLIC
) -> IssuedSession:
    """Rotate a refresh token presented at door ``portal``; a token from the other door is just invalid."""
    row = (
        await db.execute(
            select(RefreshToken).where(RefreshToken.token_hash == hash_token(raw_token)).with_for_update()
        )
    ).scalar_one_or_none()
    if row is None or _portal_value(row.portal) != _portal_value(portal):
        raise Unauthorized("Your session has expired, please sign in again", code="invalid_refresh_token")
    if row.revoked_at is not None:
        if row.replaced_by_id is not None:
            # A rotated token was presented again: assume theft and kill the whole family.
            family_id, user_id = row.family_id, row.user_id
            await revoke_family(db, family_id)
            await audit_log(
                db,
                actor=None,
                action="auth.refresh_reuse_detected",
                entity_type="user",
                entity_id=user_id,
                after={"family_id": family_id},
                request=request,
            )
            await db.commit()
            logger.warning("auth.refresh_reuse_detected", user_id=str(user_id))
            raise Unauthorized(
                "Your session is no longer valid, please sign in again", code="refresh_token_reused"
            )
        raise Unauthorized("Your session has expired, please sign in again", code="invalid_refresh_token")
    if row.expires_at <= utcnow():
        raise Unauthorized("Your session has expired, please sign in again", code="refresh_token_expired")
    user = await db.get(User, row.user_id)
    expected_portal = AuthPortal.STAFF if user is not None and is_staff(user) else AuthPortal.PUBLIC
    if user is None or expected_portal != _portal_value(portal):
        # e.g. a user whose role moved between doors: the old family is no longer valid anywhere.
        if user is not None:
            await revoke_family(db, row.family_id)
            await db.commit()
        raise Unauthorized("Your session has expired, please sign in again", code="invalid_refresh_token")
    # SEC-017: a failed-sign-in lock does not end live sessions (refresh keeps working); only new
    # password sign-ins wait for the lock to expire.
    _ensure_can_sign_in(user)
    issued, new_row = await issue_session(db, user, request, family_id=row.family_id, portal=portal)
    await db.flush()
    row.revoked_at = utcnow()
    row.replaced_by_id = new_row.id
    await db.commit()
    return issued


async def logout(
    db: AsyncSession,
    *,
    raw_refresh: str | None,
    session_family: uuid.UUID | None,
    actor: User | None,
    request: Request,
    portal: AuthPortal = AuthPortal.PUBLIC,
) -> None:
    families: set[uuid.UUID] = set()
    owner_id: uuid.UUID | None = actor.id if actor is not None else None
    if raw_refresh:
        row = (
            await db.execute(select(RefreshToken).where(RefreshToken.token_hash == hash_token(raw_refresh)))
        ).scalar_one_or_none()
        if row is not None and _portal_value(row.portal) == _portal_value(portal):
            families.add(row.family_id)
            owner_id = owner_id or row.user_id
    if session_family is not None and actor is not None:
        families.add(session_family)
    for family in families:
        await revoke_family(db, family)
    if owner_id is not None:
        await audit_log(
            db,
            actor=actor,
            action="auth.logout",
            entity_type="user",
            entity_id=owner_id,
            after={"sessions_revoked": len(families), "portal": _portal_value(portal)},
            request=request,
        )
    await db.commit()


# --- profile / passwords ---------------------------------------------------------------------------------
async def update_me(db: AsyncSession, user: User, body: MeUpdateIn, request: Request) -> User:
    changes = body.model_dump(exclude_unset=True)
    if "full_name" in changes and not changes["full_name"]:
        raise BadRequest("full_name cannot be empty", code="invalid_name")
    if "preferred_language" in changes and changes["preferred_language"] is None:
        changes.pop("preferred_language")
    before = {k: getattr(user, k) for k in changes}
    for key, value in changes.items():
        setattr(user, key, value)
    if changes:
        await audit_log(
            db,
            actor=user,
            action="user.update_self",
            entity_type="user",
            entity_id=user.id,
            before=before,
            after=changes,
            request=request,
        )
    await db.commit()
    return user


async def change_password(
    db: AsyncSession,
    user: User,
    current_password: str | None,
    new_password: str,
    request: Request,
    current_family: uuid.UUID | None,
) -> None:
    if user.password_hash:
        if not current_password or not verify_password(current_password, user.password_hash):
            raise BadRequest("The current password is incorrect", code="invalid_current_password")
        if current_password == new_password:
            raise BadRequest("Choose a password you have not used here", code="password_unchanged")
    validate_password_strength(new_password)
    user.password_hash = hash_password(new_password)
    revoked = await revoke_all_sessions(db, user.id, except_family=current_family)
    await audit_log(
        db,
        actor=user,
        action="auth.password_changed",
        entity_type="user",
        entity_id=user.id,
        after={"other_sessions_revoked": revoked},
        request=request,
    )
    if user.email:
        await enqueue(
            db,
            "email.send",
            {
                "to": user.email,
                "subject": "Your password was changed",
                "template": "generic_notification.html",
                "context": {
                    "title": "Your password was changed",
                    "body": "The password for your account was just changed. If this was not you, reset "
                    "your password immediately and contact support.",
                    "name": user.full_name or "there",
                    "url": f"{settings.PUBLIC_SITE_URL.rstrip('/')}/forgot-password",
                    "action_label": "Reset password",
                },
            },
        )
    await db.commit()


async def verify_email(db: AsyncSession, raw_token: str, request: Request) -> None:
    row = await _consume_token(db, raw_token, VerificationPurpose.VERIFY_EMAIL)
    user = await db.get(User, row.user_id)
    if user is None:  # pragma: no cover - FK cascade
        raise BadRequest("This link is invalid or has expired", code="invalid_token")
    if user.email_verified_at is None:
        user.email_verified_at = utcnow()
    if _status(user) == UserStatus.PENDING_VERIFICATION:
        user.status = UserStatus.ACTIVE
    await audit_log(
        db, actor=user, action="auth.email_verified", entity_type="user", entity_id=user.id, request=request
    )
    await db.commit()


async def resend_verification(db: AsyncSession, user: User) -> None:
    if not user.email or user.email_verified_at is not None:
        return
    await send_verification_email(db, user)
    await db.commit()


async def forgot_password(db: AsyncSession, email: str, request: Request) -> None:
    """Always succeeds (no account enumeration); sends a reset link only to an existing active account."""
    user = (await db.execute(select(User).where(User.email == normalize_email(email)))).scalar_one_or_none()
    if (
        user is None
        or user.deleted_at is not None
        or _status(user) in (UserStatus.DELETED, UserStatus.SUSPENDED)
    ):
        return
    raw = await _new_verification_token(
        db, user.id, VerificationPurpose.RESET_PASSWORD, timedelta(minutes=RESET_PASSWORD_TTL_MINUTES)
    )
    await enqueue(
        db,
        "email.send",
        {
            "to": user.email,
            "subject": f"Reset your {settings.APP_NAME} password",
            "template": "reset_password.html",
            "context": {
                "name": user.full_name or "there",
                "url": one_time_link("/reset-password", raw),
                "expires_minutes": RESET_PASSWORD_TTL_MINUTES,
            },
        },
    )
    await audit_log(
        db,
        actor=None,
        action="auth.password_reset_requested",
        entity_type="user",
        entity_id=user.id,
        request=request,
    )
    await db.commit()


async def reset_password(db: AsyncSession, raw_token: str, new_password: str, request: Request) -> None:
    validate_password_strength(new_password)
    row = await _consume_token(db, raw_token, VerificationPurpose.RESET_PASSWORD)
    user = await db.get(User, row.user_id)
    if user is None:  # pragma: no cover
        raise BadRequest("This link is invalid or has expired", code="invalid_token")
    user.password_hash = hash_password(new_password)
    user.failed_login_count = 0
    user.locked_until = None
    if user.email_verified_at is None:
        user.email_verified_at = utcnow()
        if _status(user) == UserStatus.PENDING_VERIFICATION:
            user.status = UserStatus.ACTIVE
    await revoke_all_sessions(db, user.id)
    await audit_log(
        db, actor=user, action="auth.password_reset", entity_type="user", entity_id=user.id, request=request
    )
    await db.commit()


# --- MFA -------------------------------------------------------------------------------------------------
async def mfa_setup(db: AsyncSession, user: User, request: Request) -> tuple[str, str]:
    if user.mfa_enabled:
        raise Conflict("Two-factor authentication is already enabled", code="mfa_already_enabled")
    if settings.ADMIN_MFA_REQUIRED and is_staff(user):
        # Staff enrol only through the staff door with a super_admin's one-time enrolment token (#23).
        raise Forbidden(
            "Staff accounts set up two-factor authentication at the staff sign-in with an enrolment code",
            code="mfa_enrolment_token_required",
        )
    secret = new_totp_secret()
    user.mfa_secret = secret
    await audit_log(
        db, actor=user, action="auth.mfa_setup", entity_type="user", entity_id=user.id, request=request
    )
    await db.commit()
    return secret, totp_uri(secret, user.email or str(user.id))


async def mfa_enable(db: AsyncSession, user: User, code: str, request: Request) -> None:
    if user.mfa_enabled:
        raise Conflict("Two-factor authentication is already enabled", code="mfa_already_enabled")
    if not user.mfa_secret:
        raise BadRequest("Start two-factor setup first", code="mfa_not_setup")
    if not await _consume_totp(db, user, user.mfa_secret, code):
        await _register_failure(db, user, request, "invalid_otp_mfa_enable")  # SEC-024: counts to lockout
        raise BadRequest("The authentication code is not valid", code="invalid_otp")
    user.mfa_enabled = True
    await audit_log(
        db, actor=user, action="auth.mfa_enabled", entity_type="user", entity_id=user.id, request=request
    )
    await db.commit()


async def mfa_disable(db: AsyncSession, user: User, code: str, request: Request) -> None:
    if not user.mfa_enabled:
        raise BadRequest("Two-factor authentication is not enabled", code="mfa_not_enabled")
    if settings.ADMIN_MFA_REQUIRED and user.is_staff:
        raise Forbidden("Staff accounts must keep two-factor authentication", code="mfa_required_for_staff")
    if not await _consume_totp(db, user, user.mfa_secret, code):
        await _register_failure(db, user, request, "invalid_otp_mfa_disable")  # SEC-024: counts to lockout
        raise BadRequest("The authentication code is not valid", code="invalid_otp")
    user.mfa_enabled = False
    user.mfa_secret = None
    await audit_log(
        db, actor=user, action="auth.mfa_disabled", entity_type="user", entity_id=user.id, request=request
    )
    await db.commit()


# --- devices / consents ----------------------------------------------------------------------------------
async def register_device(db: AsyncSession, user: User, body: DeviceIn) -> DeviceToken:
    now = utcnow()
    stmt = (
        pg_insert(DeviceToken)
        .values(id=uuid7(), user_id=user.id, platform=body.platform, token=body.token, last_seen_at=now)
        .on_conflict_do_update(
            index_elements=[DeviceToken.token],
            set_={
                "user_id": user.id,
                "platform": body.platform,
                "last_seen_at": now,
                "updated_at": func.now(),
            },
        )
        .returning(DeviceToken.id)
    )
    device_id = (await db.execute(stmt)).scalar_one()
    await db.commit()
    device = await db.get(DeviceToken, device_id, populate_existing=True)
    assert device is not None  # noqa: S101 - just upserted
    return device


async def remove_device(db: AsyncSession, user: User, token: str) -> None:
    device = (
        await db.execute(
            select(DeviceToken).where(DeviceToken.token == token, DeviceToken.user_id == user.id)
        )
    ).scalar_one_or_none()
    if device is not None:
        await db.delete(device)
        await db.commit()


async def _consent_scope(
    db: AsyncSession, user: User, body: ConsentIn
) -> tuple[uuid.UUID | None, uuid.UUID | None]:
    """Validate ``case_id``/``hospital_id`` for ``body.kind``; returns the scope to store (PLAN 9.9,
    INTEGRATION_BACKLOG #5/#11). Out-of-scope ids answer 404 (PLAN 9.1)."""
    kind = ConsentKind(body.kind)
    role = _role(user)
    case_id, hospital_id = body.case_id, body.hospital_id
    if kind in AGREEMENT_KINDS and body.granted and body.version != CONSENT_VERSIONS[kind]:
        raise BadRequest(
            "Please review and accept the current version of the agreement",
            code="consent_version_outdated",
            details={"current_version": CONSENT_VERSIONS[kind]},
        )
    if kind == ConsentKind.AGENT_AGREEMENT:
        if role != UserRole.AGENT:
            raise BadRequest("This agreement applies to agent accounts", code="consent_not_applicable")
        if case_id or hospital_id:
            raise BadRequest("This consent cannot be scoped", code="consent_scope_not_allowed")
        return None, None
    if kind == ConsentKind.HOSPITAL_PARTNER_AGREEMENT:
        if role != UserRole.HOSPITAL:
            raise BadRequest("This agreement applies to hospital accounts", code="consent_not_applicable")
        if case_id:
            raise BadRequest("This consent cannot be scoped to a case", code="consent_scope_not_allowed")
        memberships = {
            hid: str(getattr(mr, "value", mr))
            for hid, _, _, mr in await hospital_memberships_for(db, user.id)
        }
        if hospital_id is None:
            if len(memberships) != 1:
                raise BadRequest("hospital_id is required", code="hospital_required")
            hospital_id = next(iter(memberships))
        if hospital_id not in memberships:
            raise NotFound("Hospital not found")
        if memberships[hospital_id] not in (HospitalMemberRole.OWNER, HospitalMemberRole.ADMIN):
            raise Forbidden("Only a hospital owner or admin can accept the partner agreement")
        return None, hospital_id
    if kind == ConsentKind.SHARE_WITH_HOSPITALS:
        if case_id is not None:
            profile_id = await patient_profile_id_for(db, user.id) if role == UserRole.PATIENT else None
            case = await db.get(Case, case_id)
            if case is None or profile_id is None or case.patient_id != profile_id:
                raise NotFound("Case not found")
            if hospital_id is not None and hospital_id != case.hospital_id:
                raise BadRequest("hospital_id does not match the case", code="hospital_mismatch")
            return case_id, case.hospital_id
        if hospital_id is not None and await db.get(Hospital, hospital_id) is None:
            raise NotFound("Hospital not found")
        return None, hospital_id
    if case_id or hospital_id:
        raise BadRequest("This consent cannot be scoped", code="consent_scope_not_allowed")
    return None, None


def record_consent(
    db: AsyncSession,
    user_id: uuid.UUID,
    kind: ConsentKind,
    version: str,
    request: Request | None,
    *,
    granted: bool = True,
    case_id: uuid.UUID | None = None,
    hospital_id: uuid.UUID | None = None,
    granted_by_user_id: uuid.UUID | None = None,
) -> Consent:
    """Append one consent row (no commit, no validation). Other modules may import this, e.g. be-cases records
    ``share_with_hospitals`` with the case's ``case_id`` + ``hospital_id`` (INTEGRATION_BACKLOG #5).

    ``granted_by_user_id``: the actor when it is NOT the data subject (agent/staff acting on the patient's
    behalf); such rows never count as the patient's own confirmation (SEC-060)."""
    [row] = _record_consents(
        db,
        user_id,
        [kind],
        version,
        request,
        granted=granted,
        case_id=case_id,
        hospital_id=hospital_id,
        granted_by_user_id=granted_by_user_id,
    )
    return row


async def add_consent(db: AsyncSession, user: User, body: ConsentIn, request: Request) -> Consent:
    case_id, hospital_id = await _consent_scope(db, user, body)
    row = record_consent(
        db,
        user.id,
        body.kind,
        body.version,
        request,
        granted=body.granted,
        case_id=case_id,
        hospital_id=hospital_id,
    )
    await audit_log(
        db,
        actor=user,
        action="consent.record",
        entity_type="user",
        entity_id=user.id,
        after={
            "kind": body.kind,
            "version": body.version,
            "granted": body.granted,
            "case_id": case_id,
            "hospital_id": hospital_id,
        },
        request=request,
    )
    await db.commit()
    return row


async def list_consents(db: AsyncSession, user: User, *, history: bool = False) -> list[Consent]:
    if history:
        stmt = (
            select(Consent)
            .where(Consent.user_id == user.id)
            .order_by(Consent.created_at.desc(), Consent.id.desc())
            .limit(500)
        )
    else:
        stmt = (
            select(Consent)
            .where(Consent.user_id == user.id)
            .order_by(
                Consent.kind,
                Consent.case_id,
                Consent.hospital_id,
                Consent.created_at.desc(),
                Consent.id.desc(),
            )
            .ext(distinct_on(Consent.kind, Consent.case_id, Consent.hospital_id))
        )
    return list((await db.execute(stmt)).scalars().all())


async def has_consent(
    db: AsyncSession,
    user_id: uuid.UUID,
    kind: ConsentKind,
    *,
    case_id: uuid.UUID | None = None,
    hospital_id: uuid.UUID | None = None,
    version: str | None = None,
) -> bool:
    """True when the user's latest consent of ``kind`` is granted (other modules may import this).

    ``case_id``/``hospital_id`` restrict the lookup to consents with that scope; ``version`` additionally
    requires the latest grant to be for that version (e.g. ``CONSENT_VERSIONS[kind]`` for agreements)."""
    stmt = select(Consent.granted, Consent.version).where(Consent.user_id == user_id, Consent.kind == kind)
    if case_id is not None:
        stmt = stmt.where(Consent.case_id == case_id)
    if hospital_id is not None:
        stmt = stmt.where(Consent.hospital_id == hospital_id)
    row = (await db.execute(stmt.order_by(Consent.created_at.desc(), Consent.id.desc()).limit(1))).first()
    if row is None or not row[0]:
        return False
    return version is None or row[1] == version


async def has_current_agreement(
    db: AsyncSession, user_id: uuid.UUID, kind: ConsentKind, *, hospital_id: uuid.UUID | None = None
) -> bool:
    """True when the current version of a partner agreement is accepted (hospital: for ``hospital_id``)."""
    return await has_consent(db, user_id, kind, hospital_id=hospital_id, version=CONSENT_VERSIONS[kind])


def token_claims_family(payload: dict[str, Any] | None) -> uuid.UUID | None:
    if not payload or not payload.get("sid"):
        return None
    try:
        return uuid.UUID(str(payload["sid"]))
    except ValueError:
        return None


# --- staff door (PLAN 3.1, INTEGRATION_BACKLOG #1/#23) -----------------------------------------------------
async def _staff_mfa_enrolment(
    db: AsyncSession, user: User, otp_code: str | None, enrolment_token: str | None, request: Request
) -> None:
    """``ADMIN_MFA_REQUIRED`` and no TOTP yet: enrolment needs a super_admin's one-time enrolment token, so a
    stolen password alone can never bind a new authenticator (INTEGRATION_BACKLOG #23)."""
    if not enrolment_token:
        await audit_log(
            db,
            actor=None,
            actor_role="anonymous",
            action="auth.staff_mfa_enrolment_required",
            entity_type="user",
            entity_id=user.id,
            request=request,
        )
        await db.commit()
        raise Unauthorized(
            "Two-factor authentication must be set up. Ask a super admin for an enrolment code.",
            code="mfa_enrolment_required",
            details={"setup_required": True, "enrolment_token_required": True},
        )
    row = (
        await db.execute(
            select(VerificationToken)
            .where(
                VerificationToken.token_hash == hash_token(enrolment_token),
                VerificationToken.purpose == VerificationPurpose.MFA_ENROLMENT,
                VerificationToken.user_id == user.id,
            )
            .with_for_update()
        )
    ).scalar_one_or_none()
    if row is None or row.used_at is not None or row.expires_at <= utcnow():
        locked = await _register_failure(db, user, request, "invalid_enrolment_token")
        if locked is not None:
            _raise_locked(locked)
        raise Unauthorized("The enrolment code is invalid or has expired", code="invalid_enrolment_token")
    if not user.mfa_secret:
        user.mfa_secret = new_totp_secret()
        await db.commit()
    secret = user.mfa_secret or ""
    if not otp_code:
        raise Unauthorized(
            "Scan the code with your authenticator app and enter the 6-digit code",
            code="mfa_required",
            details={
                "setup_required": True,
                "secret": secret,
                "otpauth_url": totp_uri(secret, user.email or str(user.id)),
            },
        )
    await _verify_otp_or_fail(db, user, secret, otp_code, request)
    row.used_at = utcnow()
    user.mfa_enabled = True
    await audit_log(
        db,
        actor=user,
        action="auth.mfa_enabled",
        entity_type="user",
        entity_id=user.id,
        after={"via": "staff_enrolment_token"},
        request=request,
    )


async def staff_login(
    db: AsyncSession,
    email: str,
    password: str,
    otp_code: str | None,
    enrolment_token: str | None,
    request: Request,
) -> IssuedSession:
    """``POST /auth/staff/login``: staff roles only (generic 401 for anyone else); every attempt audited."""
    normalized = normalize_email(email)
    user = (await db.execute(select(User).where(User.email == normalized))).scalar_one_or_none()
    if user is None or not is_staff(user):
        verify_password(password, None)
        await audit_log(
            db,
            actor=None,
            actor_role="anonymous",
            action="auth.staff_login_failed",
            entity_type="user",
            entity_id=user.id if user is not None else None,
            after={"reason": "unknown_account" if user is None else "not_staff", "email": normalized},
            request=request,
        )
        await db.commit()
        raise _generic_login_failure()
    await _password_or_fail(db, user, password, request)
    _ensure_can_sign_in(user)
    if user.mfa_enabled:
        await _check_mfa(db, user, otp_code, request)
    elif settings.ADMIN_MFA_REQUIRED:
        await _staff_mfa_enrolment(db, user, otp_code, enrolment_token, request)
    if user.password_hash and needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
    return await _complete_login(db, user, request, "password", portal=AuthPortal.STAFF)


async def issue_mfa_enrolment_token(
    db: AsyncSession,
    actor: User | None,
    user_id: uuid.UUID,
    request: Request | None,
    *,
    reset: bool = False,
) -> tuple[str, datetime]:
    """One-time staff MFA enrolment code (24 h), issued by a super_admin (``actor=None`` = bootstrap script).

    ``reset=True`` first removes the user's authenticator and signs them out everywhere. Returns
    ``(raw_token, expires_at)``; only the hash is stored. Commits."""
    target = await db.get(User, user_id)
    if target is None or not is_staff(target) or target.deleted_at is not None:
        raise NotFound("Staff user not found")
    if actor is not None and actor.id == target.id:
        raise Forbidden("Another super admin must issue your enrolment code", code="self_enrolment_forbidden")
    if reset:
        target.mfa_enabled = False
        target.mfa_secret = None
        await revoke_all_sessions(db, target.id)
    elif target.mfa_enabled:
        raise Conflict(
            "Two-factor authentication is already enabled; reset it instead", code="mfa_already_enabled"
        )
    ttl = timedelta(hours=MFA_ENROLMENT_TTL_HOURS)
    raw = await _new_verification_token(db, target.id, VerificationPurpose.MFA_ENROLMENT, ttl)
    await audit_log(
        db,
        actor=actor,
        action="auth.mfa_reset" if reset else "auth.mfa_enrolment_token_issued",
        entity_type="user",
        entity_id=target.id,
        after={"expires_in_hours": MFA_ENROLMENT_TTL_HOURS},
        request=request,
    )
    await db.commit()
    return raw, utcnow() + ttl


# --- invites (INTEGRATION_BACKLOG #22) ---------------------------------------------------------------------
async def accept_invite(db: AsyncSession, body: AcceptInviteIn, request: Request) -> IssuedSession:
    """Activate an account created by an agent (managed patient) or a hospital (member invite): set the
    password, verify the email (the link proved access to it), record terms + privacy and sign in."""
    validate_password_strength(body.password)
    row = await _consume_token(db, body.token, VerificationPurpose.INVITE)
    user = await db.get(User, row.user_id)
    if user is None or is_staff(user):
        raise BadRequest("This link is invalid or has expired", code="invalid_token")
    _ensure_can_sign_in(user)
    if user.password_hash:
        raise Conflict(
            "This invitation was already accepted. Please sign in.", code="invite_already_accepted"
        )
    user.password_hash = hash_password(body.password)
    if body.full_name:
        user.full_name = body.full_name.strip()
    if user.email_verified_at is None:
        user.email_verified_at = utcnow()
    if _status(user) == UserStatus.PENDING_VERIFICATION:
        user.status = UserStatus.ACTIVE
    user.is_guest = False
    _record_consents(db, user.id, [ConsentKind.TERMS, ConsentKind.PRIVACY], TERMS_VERSION, request)
    await audit_log(
        db, actor=user, action="auth.invite_accepted", entity_type="user", entity_id=user.id, request=request
    )
    return await _complete_login(db, user, request, "invite")


# --- account deletion (INTEGRATION_BACKLOG #15) ------------------------------------------------------------
async def _deletion_blockers(db: AsyncSession, user: User, role: str) -> dict[str, int]:
    """Engagements that must finish (or be cancelled) before the account can be deleted."""
    blockers: dict[str, int] = {}

    async def count(stmt: Any) -> int:
        return int((await db.execute(stmt)).scalar_one() or 0)

    if role == UserRole.PATIENT:
        profile_id = await patient_profile_id_for(db, user.id)
        if profile_id is not None:
            blockers["cases_in_progress"] = await count(
                select(func.count(Case.id)).where(
                    Case.patient_id == profile_id, Case.status.in_(_ACTIVE_CASE_STATUSES)
                )
            )
            blockers["active_bookings"] = await count(
                select(func.count(Booking.id)).where(
                    Booking.patient_id == profile_id, Booking.status.in_(_ACTIVE_BOOKING_STATUSES)
                )
            )
        blockers["payments_in_progress"] = await count(
            select(func.count(PaymentOrder.id)).where(
                PaymentOrder.payer_user_id == user.id, PaymentOrder.status.in_(_PENDING_ORDER_STATUSES)
            )
        )
    elif role == UserRole.AGENT:
        agent_id = await agent_id_for(db, user.id)
        if agent_id is not None:
            blockers["cases_in_progress"] = await count(
                select(func.count(Case.id)).where(
                    Case.agent_id == agent_id, Case.status.in_(_ACTIVE_CASE_STATUSES)
                )
            )
    elif role == UserRole.HOSPITAL:
        blockers["owned_listed_hospitals"] = await count(
            select(func.count(HospitalMember.id))
            .join(Hospital, Hospital.id == HospitalMember.hospital_id)
            .where(
                HospitalMember.user_id == user.id,
                HospitalMember.member_role == HospitalMemberRole.OWNER,
                Hospital.status != HospitalStatus.DRAFT,
            )
        )
    return {k: v for k, v in blockers.items() if v}


async def delete_account(db: AsyncSession, user: User, body: AccountDeleteIn, request: Request) -> datetime:
    """``DELETE /auth/me`` (App Store / Play requirement): erase the account's personal data and close it,
    keeping only what ``RETENTION_RULES`` describe. Returns ``deleted_at``. Commits."""
    if is_staff(user):
        raise Forbidden(
            "Staff accounts are closed by an administrator", code="staff_account_deletion_not_allowed"
        )
    if user.password_hash and (not body.password or not verify_password(body.password, user.password_hash)):
        raise BadRequest("The password is incorrect", code="invalid_current_password")
    if user.mfa_enabled and not verify_totp(user.mfa_secret, body.otp_code):
        raise BadRequest("The authentication code is not valid", code="invalid_otp")
    apple_revoked: bool | None = None
    role = _role(user)
    blockers = await _deletion_blockers(db, user, role)
    if blockers:
        raise Conflict(
            "Your account has treatment, bookings or payments in progress. Please finish or cancel them, or "
            "contact support, before deleting your account.",
            code="account_deletion_blocked",
            details=blockers,
        )
    now = utcnow()
    profile_id: uuid.UUID | None = None
    if role == UserRole.PATIENT:
        profile = (
            await db.execute(select(PatientProfile).where(PatientProfile.user_id == user.id))
        ).scalar_one_or_none()
        if profile is not None:
            profile_id = profile.id
            for field in (
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
            ):
                setattr(profile, field, None)
            await db.execute(delete(PatientCompanion).where(PatientCompanion.patient_id == profile.id))
    elif role == UserRole.AGENT:
        agent = (await db.execute(select(Agent).where(Agent.user_id == user.id))).scalar_one_or_none()
        if agent is not None:
            agent.status = AgentStatus.SUSPENDED
            agent.phone = None
    elif role == UserRole.HOSPITAL:
        await db.execute(delete(HospitalMember).where(HospitalMember.user_id == user.id))

    owner_filter = Document.owner_user_id == user.id
    if profile_id is not None:
        owner_filter = or_(owner_filter, Document.patient_id == profile_id)
    erased_docs = await db.execute(
        update(Document)
        .where(owner_filter, Document.case_id.is_(None), Document.deleted_at.is_(None))
        .values(deleted_at=now)
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
    sessions = await revoke_all_sessions(db, user.id)
    _record_consents(
        db, user.id, [ConsentKind.MARKETING, ConsentKind.AI_PROCESSING], TERMS_VERSION, request, granted=False
    )

    user.email = None
    user.phone = None
    user.full_name = "Deleted user"
    user.avatar_url = None
    if user.apple_refresh_token:
        apple_revoked = await apple_api.revoke_refresh_token(user.apple_refresh_token)
    user.apple_refresh_token = None
    user.google_sub = None
    user.apple_sub = None
    user.password_hash = None
    user.mfa_enabled = False
    user.mfa_secret = None
    user.status = UserStatus.DELETED
    user.deleted_at = now
    await audit_log(
        db,
        actor=user,
        action="auth.account_deleted",
        entity_type="user",
        entity_id=user.id,
        after={
            "role": role,
            "reason": body.reason,
            "documents_erased": int(getattr(erased_docs, "rowcount", 0) or 0),
            "sessions_revoked": sessions,
            "apple_token_revoked": apple_revoked,
        },
        request=request,
    )
    await db.flush()
    await publish(db, "user.deleted", {"user_id": str(user.id), "role": role})
    await db.commit()
    return now


async def request_account_deletion(
    db: AsyncSession, user: User, body: DeletionRequestIn, request: Request
) -> AuditLog:
    """``POST /auth/me/deletion-request``: when self-service deletion is blocked (treatment, bookings or
    payments in progress, legal hold), record the request for support follow-up and notify support. The
    audit row is the request record (its id is returned). Commits."""
    if is_staff(user):
        raise Forbidden(
            "Staff accounts are closed by an administrator", code="staff_account_deletion_not_allowed"
        )
    role = _role(user)
    blockers = await _deletion_blockers(db, user, role)
    entry = await audit_log(
        db,
        actor=user,
        action="auth.deletion_requested",
        entity_type="user",
        entity_id=user.id,
        after={"reason": body.reason, "blockers": blockers, "role": role},
        request=request,
    )
    await db.flush()
    support_ids = (
        (
            await db.execute(
                select(User.id).where(
                    User.role.in_([UserRole.SUPPORT, UserRole.ADMIN]),
                    User.status == UserStatus.ACTIVE,
                    User.deleted_at.is_(None),
                )
            )
        )
        .scalars()
        .all()
    )
    if support_ids:
        from app.modules.messaging.notifications import notify_many  # lazy: messaging imports auth

        await notify_many(
            db,
            support_ids,
            "account.deletion_requested",
            "Account deletion request",
            f"A {role} account asked to be deleted; deletion is blocked until open items are resolved.",
            {"user_id": str(user.id), "request_id": str(entry.id), "blockers": blockers or None},
            dedupe_key=str(entry.id),
            email=False,
        )
    await db.commit()
    return entry
