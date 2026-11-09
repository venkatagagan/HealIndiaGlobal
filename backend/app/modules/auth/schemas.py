"""Pydantic schemas for the auth module (PLAN 8.1)."""

from __future__ import annotations

import re
import uuid
from datetime import datetime
from typing import Annotated, Literal

from email_validator import EmailNotValidError, validate_email
from pydantic import AfterValidator, BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.config import settings
from app.core.enums import ConsentKind, DevicePlatform, HospitalMemberRole, UserRole, UserStatus

_COUNTRY_RE = re.compile(r"^[A-Z]{2}$")
_LANG_RE = re.compile(r"^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$")
_PHONE_RE = re.compile(r"^[0-9+()\-. ]{4,32}$")

RegistrableRole = Literal["patient", "agent", "hospital"]


def _validate_email_address(value: str) -> str:
    """Syntax-check an email address (no DNS lookups) and lower-case it. Outside production the special-use
    ``.test`` domain is accepted so that seeds and tests can use it."""
    try:
        result = validate_email(
            value.strip(), check_deliverability=False, test_environment=not settings.is_production
        )
    except EmailNotValidError as exc:
        raise ValueError(f"value is not a valid email address: {exc}") from exc
    return result.normalized.lower()


def _loose_email(value: str) -> str:
    """Lookup key for sign-in style requests: trimmed, lower-cased, must look like ``local@domain``."""
    value = value.strip().lower()
    local, sep, domain = value.rpartition("@")
    if not sep or not local or not domain or any(ch.isspace() for ch in value):
        raise ValueError("value is not a valid email address")
    return value


# New addresses (registration, guest upgrade): full syntax validation.
EmailAddress = Annotated[str, Field(min_length=3, max_length=254), AfterValidator(_validate_email_address)]
# Addresses used only to look up an existing account (login, forgot password).
LookupEmail = Annotated[str, Field(min_length=3, max_length=254), AfterValidator(_loose_email)]


def normalize_country(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip().upper()
    if not value:
        return None
    if not _COUNTRY_RE.match(value):
        raise ValueError("must be an ISO 3166-1 alpha-2 country code")
    return value


def normalize_phone(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    if not value:
        return None
    if not _PHONE_RE.match(value):
        raise ValueError("invalid phone number")
    return value


def normalize_language(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    if not value:
        return None
    if not _LANG_RE.match(value):
        raise ValueError("must be a language code such as 'en' or 'ar'")
    return value


def normalize_http_url(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    if not value:
        return None
    if not re.match(r"^https?://[^\s<>\"']+$", value, flags=re.IGNORECASE):
        raise ValueError("must be an http(s) URL")
    return value


class _In(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


# --- requests -------------------------------------------------------------------------------------------
class RegisterIn(_In):
    email: EmailAddress
    password: str = Field(min_length=1, max_length=128)
    full_name: str = Field(min_length=1, max_length=200)
    role: RegistrableRole
    phone: str | None = Field(default=None, max_length=32)
    country_code: str | None = Field(default=None, max_length=2)
    referral_code: str | None = Field(default=None, max_length=16)
    agency_name: str | None = Field(default=None, max_length=200)
    hospital_name: str | None = Field(default=None, max_length=200)
    city: str | None = Field(default=None, max_length=100)
    accept_terms: bool
    # agent/hospital sign-up: also accept the current Agent / Hospital Partner Agreement (click-through)
    accept_agreement: bool = False

    _country = field_validator("country_code")(normalize_country)
    _phone = field_validator("phone")(normalize_phone)

    @field_validator("accept_terms")
    @classmethod
    def _terms(cls, value: bool) -> bool:
        if value is not True:
            raise ValueError("the terms of service and privacy policy must be accepted")
        return value

    @model_validator(mode="after")
    def _role_fields(self) -> RegisterIn:
        if self.role == "agent" and not (self.agency_name and self.agency_name.strip()):
            raise ValueError("agency_name is required for agent registration")
        if self.role == "hospital" and not (self.hospital_name and self.hospital_name.strip()):
            raise ValueError("hospital_name is required for hospital registration")
        return self


class LoginIn(_In):
    email: LookupEmail
    password: str = Field(min_length=1, max_length=256)
    otp_code: str | None = Field(default=None, max_length=10)


class GoogleIn(_In):
    id_token: str = Field(min_length=10, max_length=8192)
    role: RegistrableRole | None = None
    otp_code: str | None = Field(default=None, max_length=10)
    # Optional extras used only when the Google sign-in creates a new agent/hospital account.
    agency_name: str | None = Field(default=None, max_length=200)
    hospital_name: str | None = Field(default=None, max_length=200)
    city: str | None = Field(default=None, max_length=100)
    referral_code: str | None = Field(default=None, max_length=16)
    accept_agreement: bool = False


class AppleNameIn(_In):
    given_name: str | None = Field(default=None, max_length=100)
    family_name: str | None = Field(default=None, max_length=100)


class AppleIn(_In):
    """``POST /auth/apple``. ``nonce`` is the RAW nonce; Apple received ``sha256(nonce)``. Apple sends the
    user's name only on the first authorisation, so the app forwards it as ``full_name``."""

    identity_token: str = Field(min_length=10, max_length=8192)
    nonce: str = Field(min_length=8, max_length=256)
    authorization_code: str | None = Field(default=None, max_length=2048)
    full_name: AppleNameIn | None = None
    role: RegistrableRole | None = None
    otp_code: str | None = Field(default=None, max_length=10)
    agency_name: str | None = Field(default=None, max_length=200)
    hospital_name: str | None = Field(default=None, max_length=200)
    city: str | None = Field(default=None, max_length=100)
    referral_code: str | None = Field(default=None, max_length=16)
    accept_agreement: bool = False


class StaffLoginIn(_In):
    """Staff door (PLAN 3.1). ``enrolment_token`` = one-time MFA enrolment code from a super_admin (#23)."""

    email: LookupEmail
    password: str = Field(min_length=1, max_length=256)
    otp_code: str | None = Field(default=None, max_length=10)
    enrolment_token: str | None = Field(default=None, min_length=10, max_length=512)


class StaffUserIn(_In):
    user_id: uuid.UUID


class MfaEnrolmentTokenOut(BaseModel):
    user_id: uuid.UUID
    enrolment_token: str
    expires_at: datetime


class AcceptInviteIn(_In):
    """``POST /auth/accept-invite``: the one-time invite token travels in the body, never in a URL (#22)."""

    token: str = Field(min_length=10, max_length=512)
    password: str = Field(min_length=1, max_length=128)
    full_name: str | None = Field(default=None, min_length=1, max_length=200)
    accept_terms: bool

    @field_validator("accept_terms")
    @classmethod
    def _terms(cls, value: bool) -> bool:
        if value is not True:
            raise ValueError("the terms of service and privacy policy must be accepted")
        return value


class AccountDeleteIn(_In):
    """``DELETE /auth/me``: re-authentication for password accounts (+ TOTP when enabled)."""

    password: str | None = Field(default=None, max_length=256)
    otp_code: str | None = Field(default=None, max_length=10)
    reason: str | None = Field(default=None, max_length=500)


class GuestUpgradeIn(_In):
    email: EmailAddress
    password: str = Field(min_length=1, max_length=128)
    full_name: str = Field(min_length=1, max_length=200)


class RefreshIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    refresh_token: str | None = Field(default=None, max_length=512)


class MeUpdateIn(_In):
    full_name: str | None = Field(default=None, min_length=1, max_length=200)
    phone: str | None = Field(default=None, max_length=32)
    country_code: str | None = Field(default=None, max_length=2)
    preferred_language: str | None = Field(default=None, max_length=10)
    avatar_url: str | None = Field(default=None, max_length=1024)

    _country = field_validator("country_code")(normalize_country)
    _phone = field_validator("phone")(normalize_phone)
    _lang = field_validator("preferred_language")(normalize_language)
    _avatar = field_validator("avatar_url")(normalize_http_url)


class ChangePasswordIn(_In):
    current_password: str | None = Field(default=None, max_length=256)
    new_password: str = Field(min_length=1, max_length=128)


class TokenIn(_In):
    token: str = Field(min_length=10, max_length=512)


class EmailIn(_In):
    email: LookupEmail


class ResetPasswordIn(_In):
    token: str = Field(min_length=10, max_length=512)
    new_password: str = Field(min_length=1, max_length=128)


class MfaCodeIn(_In):
    code: str = Field(min_length=6, max_length=10)


class DeviceIn(_In):
    platform: DevicePlatform
    token: str = Field(min_length=8, max_length=512)


class ConsentIn(_In):
    kind: ConsentKind
    version: str = Field(min_length=1, max_length=32)
    granted: bool
    # share_with_hospitals: per case and/or hospital; hospital_partner_agreement: the hospital accepted for
    case_id: uuid.UUID | None = None
    hospital_id: uuid.UUID | None = None


# --- responses ------------------------------------------------------------------------------------------
class UserHospitalRef(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    member_role: HospitalMemberRole


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str | None
    full_name: str
    role: UserRole
    status: UserStatus
    phone: str | None
    country_code: str | None
    preferred_language: str
    avatar_url: str | None
    is_guest: bool
    email_verified: bool
    mfa_enabled: bool
    created_at: datetime
    patient_profile_id: uuid.UUID | None = None
    agent_id: uuid.UUID | None = None
    hospitals: list[UserHospitalRef] = Field(default_factory=list)
    # consent kinds an agent attested on the patient's behalf that the patient still has to confirm
    # (POST /auth/consents); clients show a confirmation step while non-empty
    pending_consents: list[ConsentKind] = Field(default_factory=list)


class TokenOut(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"  # noqa: S105 - OAuth token type, not a secret
    expires_in: int
    refresh_token: str | None = None
    user: UserOut


class MfaSetupOut(BaseModel):
    secret: str
    otpauth_url: str


class ConsentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    kind: ConsentKind
    version: str
    granted: bool
    case_id: uuid.UUID | None = None
    hospital_id: uuid.UUID | None = None
    created_at: datetime


class DeletionRequestIn(_In):
    reason: str | None = Field(default=None, max_length=1000)


class DeletionRequestOut(BaseModel):
    id: uuid.UUID
    status: Literal["received"] = "received"
    created_at: datetime


class DeletionPolicyOut(BaseModel):
    """What ``DELETE /auth/me`` erases vs. keeps (shown before the user confirms)."""

    retained: list[str]


class DeviceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    platform: DevicePlatform
    last_seen_at: datetime | None
    created_at: datetime
