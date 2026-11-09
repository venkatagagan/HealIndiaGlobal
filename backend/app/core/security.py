"""Password hashing (Argon2id via pwdlib), JWT access tokens, refresh/verification tokens and TOTP."""

from __future__ import annotations

import hashlib
import hmac
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
import pyotp
from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher

from app.core.config import settings
from app.core.errors import BadRequest, Unauthorized

_password_hash = PasswordHash((Argon2Hasher(),))

# A dummy hash used to equalise timing when a user does not exist.
_DUMMY_HASH: str | None = None

PASSWORD_MIN_LENGTH = 10
PASSWORD_MAX_LENGTH = 128
COMMON_PASSWORDS = frozenset(
    {
        "password123",
        "password1234",
        "passw0rd123",
        "qwerty12345",
        "qwertyuiop1",
        "1234567890a",
        "a1234567890",
        "abc1234567",
        "abcd123456",
        "iloveyou123",
        "welcome123",
        "welcome1234",
        "letmein1234",
        "admin12345",
        "administrator1",
        "changeme123",
        "football123",
        "baseball123",
        "monkey12345",
        "dragon12345",
        "sunshine123",
        "princess123",
        "trustno1234",
        "healindia123",
        "healindia2026",
        "india123456",
        "zaq12wsxcde3",
        "1q2w3e4r5t",
        "1qaz2wsx3edc",
    }
)


# --- passwords -------------------------------------------------------------------------------------------
def hash_password(password: str) -> str:
    return _password_hash.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    """Verify ``password`` against ``password_hash``. Runs a dummy verification when the hash is missing
    so that timing does not reveal whether an account exists."""
    global _DUMMY_HASH
    if not password_hash:
        if _DUMMY_HASH is None:
            _DUMMY_HASH = _password_hash.hash(secrets.token_urlsafe(16))
        _password_hash.verify(password, _DUMMY_HASH)
        return False
    try:
        return _password_hash.verify(password, password_hash)
    except Exception:  # malformed/unknown hash format
        return False


def needs_rehash(password_hash: str) -> bool:
    try:
        return _password_hash.current_hasher.check_needs_rehash(password_hash)
    except Exception:
        return True


def password_strength_errors(password: str) -> list[str]:
    errors: list[str] = []
    if len(password) < PASSWORD_MIN_LENGTH:
        errors.append(f"Password must be at least {PASSWORD_MIN_LENGTH} characters long")
    if len(password) > PASSWORD_MAX_LENGTH:
        errors.append(f"Password must be at most {PASSWORD_MAX_LENGTH} characters long")
    if not any(ch.isalpha() for ch in password):
        errors.append("Password must contain at least one letter")
    if not any(ch.isdigit() for ch in password):
        errors.append("Password must contain at least one digit")
    if password.lower() in COMMON_PASSWORDS:
        errors.append("Password is too common")
    return errors


def validate_password_strength(password: str) -> None:
    """Raise ``BadRequest(code="weak_password")`` when the password does not meet the policy."""
    errors = password_strength_errors(password)
    if errors:
        raise BadRequest(errors[0], code="weak_password", details={"errors": errors})


# --- constant-time helpers -------------------------------------------------------------------------------
def constant_time_compare(a: str | bytes | None, b: str | bytes | None) -> bool:
    if a is None or b is None:
        return False
    a_bytes = a.encode() if isinstance(a, str) else a
    b_bytes = b.encode() if isinstance(b, str) else b
    return hmac.compare_digest(a_bytes, b_bytes)


def hash_token(raw: str) -> str:
    """sha256 hex digest (64 chars) used to store refresh/verification tokens."""
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def new_refresh_token() -> tuple[str, str]:
    """Return ``(raw_token, sha256_hex)``; store only the hash."""
    raw = secrets.token_urlsafe(48)
    return raw, hash_token(raw)


def new_opaque_token(nbytes: int = 32) -> tuple[str, str]:
    """Opaque token for email verification / password reset / invites: ``(raw, sha256_hex)``."""
    raw = secrets.token_urlsafe(nbytes)
    return raw, hash_token(raw)


# --- JWT -------------------------------------------------------------------------------------------------
def create_access_token(
    user_id: uuid.UUID | str,
    role: str,
    session_id: uuid.UUID | str | None = None,
    *,
    expires_minutes: int | None = None,
    extra_claims: dict[str, Any] | None = None,
    portal: str | None = None,
) -> str:
    """Mint an access JWT. ``portal`` (``public|staff``, PLAN 3.1) defaults to the door of the role."""
    now = datetime.now(UTC)
    role_value = str(getattr(role, "value", role))
    ttl = timedelta(
        minutes=expires_minutes if expires_minutes is not None else settings.ACCESS_TOKEN_TTL_MINUTES
    )
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "role": role_value,
        "portal": str(getattr(portal, "value", portal)) if portal else default_portal_for_role(role_value),
        "type": "access",
        "iss": settings.JWT_ISSUER,
        "aud": settings.JWT_AUDIENCE,
        "iat": int(now.timestamp()),
        "nbf": int(now.timestamp()),
        "exp": int((now + ttl).timestamp()),
        "jti": uuid.uuid4().hex,
    }
    if session_id is not None:
        payload["sid"] = str(session_id)
    if extra_claims:
        for key, value in extra_claims.items():
            payload.setdefault(key, value)
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


STAFF_ROLE_VALUES = frozenset({"admin", "finance", "support", "super_admin"})


def default_portal_for_role(role: str) -> str:
    """``staff`` for admin|finance|support|super_admin, ``public`` for everyone else."""
    return "staff" if str(getattr(role, "value", role)) in STAFF_ROLE_VALUES else "public"


def decode_access_token(token: str) -> dict[str, Any]:
    """Decode and validate an access token. Raises ``Unauthorized`` (code ``token_expired`` or
    ``invalid_token``) on any problem."""
    try:
        payload: dict[str, Any] = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
            audience=settings.JWT_AUDIENCE,
            issuer=settings.JWT_ISSUER,
            options={"require": ["exp", "iat", "sub", "iss", "aud"]},
            leeway=5,
        )
    except jwt.ExpiredSignatureError as exc:
        raise Unauthorized("Access token expired", code="token_expired") from exc
    except jwt.PyJWTError as exc:
        raise Unauthorized("Invalid access token", code="invalid_token") from exc
    if payload.get("type") != "access":
        raise Unauthorized("Invalid access token", code="invalid_token")
    try:
        uuid.UUID(str(payload["sub"]))
    except (ValueError, KeyError) as exc:
        raise Unauthorized("Invalid access token", code="invalid_token") from exc
    return payload


# --- TOTP ------------------------------------------------------------------------------------------------
def new_totp_secret() -> str:
    return pyotp.random_base32()


def totp_uri(secret: str, email: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name=settings.APP_NAME)


def verify_totp(secret: str | None, code: str | None, valid_window: int = 1) -> bool:
    if not secret or not code:
        return False
    normalized = code.strip().replace(" ", "")
    if not normalized.isdigit() or len(normalized) != 6:
        return False
    try:
        return bool(pyotp.TOTP(secret).verify(normalized, valid_window=valid_window))
    except Exception:
        return False
