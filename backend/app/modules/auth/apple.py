"""Sign in with Apple: verify an identity token issued for one of ``settings.APPLE_CLIENT_IDS``.

Apple signs identity tokens (RS256) with keys published at ``APPLE_JWKS_URL``. Fetching the JWKS is blocking,
so key lookup runs in a worker thread (``PyJWKClient`` caches keys). Checks: signature, ``iss``, ``aud`` (one
of the configured client ids: the iOS bundle id and/or the web Services ID), ``exp``/``iat``, ``sub`` and
``nonce``: the app sends Apple ``sha256(raw_nonce)`` and sends us the raw nonce, so the ``nonce`` claim
must equal ``sha256_hex(raw_nonce)`` (replay protection). Tests monkeypatch ``_signing_key``.
"""

from __future__ import annotations

import hashlib
import hmac
import time
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

import httpx
import jwt
import structlog
from starlette.concurrency import run_in_threadpool

from app.core.config import settings
from app.core.errors import AppError, Unauthorized

logger = structlog.get_logger(__name__)

APPLE_ISSUER = "https://appleid.apple.com"
APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys"
APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token"  # noqa: S105 - endpoint URL, not a secret
APPLE_REVOKE_URL = "https://appleid.apple.com/auth/revoke"


@dataclass(frozen=True, slots=True)
class AppleIdentity:
    sub: str
    email: str | None
    email_verified: bool
    is_private_email: bool
    audience: str = ""


@lru_cache(maxsize=1)
def _jwk_client() -> jwt.PyJWKClient:
    return jwt.PyJWKClient(APPLE_JWKS_URL, cache_keys=True, lifespan=3600, timeout=10)


def _signing_key(token: str) -> Any:
    """Public key for ``token``'s ``kid`` (blocking HTTP on a cache miss)."""
    return _jwk_client().get_signing_key_from_jwt(token).key


def _truthy(value: Any) -> bool:
    return value in (True, "true", "True")


def nonce_hash(raw_nonce: str) -> str:
    return hashlib.sha256(raw_nonce.encode("utf-8")).hexdigest()


def _invalid() -> Unauthorized:
    return Unauthorized("Apple sign-in failed", code="invalid_apple_token")


async def verify_apple_identity_token(token: str, raw_nonce: str) -> AppleIdentity:
    """Verify ``token`` and return the identity. 503 ``apple_signin_unavailable`` when Apple sign-in is not
    configured; 401 ``invalid_apple_token`` on any verification failure."""
    audiences = [a for a in settings.APPLE_CLIENT_IDS if a]
    if not audiences:
        raise AppError(
            "Sign in with Apple is not available", code="apple_signin_unavailable", status_code=503
        )
    try:
        key = await run_in_threadpool(_signing_key, token)
        claims: dict[str, Any] = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            audience=audiences,
            issuer=APPLE_ISSUER,
            options={"require": ["exp", "iat", "sub", "iss", "aud"]},
            leeway=30,
        )
    except (jwt.PyJWTError, ValueError) as exc:
        logger.info("auth.apple_token_rejected", error=type(exc).__name__)
        raise _invalid() from exc
    expected_nonce = nonce_hash(raw_nonce)
    if not hmac.compare_digest(str(claims.get("nonce") or ""), expected_nonce):
        raise _invalid()
    sub = str(claims.get("sub") or "").strip()
    if not sub:
        raise _invalid()
    email = claims.get("email")
    return AppleIdentity(
        sub=sub[:255],
        email=str(email).strip().lower() if email else None,
        email_verified=bool(email) and _truthy(claims.get("email_verified")),
        is_private_email=_truthy(claims.get("is_private_email")),
        audience=str(claims.get("aud") or ""),
    )


# --- token exchange / revocation (App Store 5.1.1(v): revoke on account deletion) ----------------------
def token_api_configured() -> bool:
    return bool(settings.APPLE_TEAM_ID and settings.APPLE_KEY_ID and settings.APPLE_PRIVATE_KEY)


def _client_secret(client_id: str) -> str:
    """ES256 client secret JWT for Apple's token endpoints (valid 5 minutes)."""
    now = int(time.time())
    key = settings.APPLE_PRIVATE_KEY.replace("\\n", "\n")
    return jwt.encode(
        {"iss": settings.APPLE_TEAM_ID, "iat": now, "exp": now + 300, "aud": APPLE_ISSUER, "sub": client_id},
        key,
        algorithm="ES256",
        headers={"kid": settings.APPLE_KEY_ID},
    )


async def _post_apple(url: str, data: dict[str, str]) -> httpx.Response:
    async with httpx.AsyncClient(timeout=10) as client:
        return await client.post(url, data=data)


def pack_refresh_token(client_id: str, refresh_token: str) -> str:
    return f"{client_id} {refresh_token}"


def unpack_refresh_token(packed: str) -> tuple[str, str]:
    client_id, _, token = packed.partition(" ")
    return client_id, token


async def exchange_authorization_code(code: str, client_id: str) -> str | None:
    """Exchange the one-time ``authorization_code`` for Apple's refresh token (best effort; None on error)."""
    if not token_api_configured() or not code or not client_id:
        return None
    try:
        data = {
            "client_id": client_id,
            "client_secret": _client_secret(client_id),
            "code": code,
            "grant_type": "authorization_code",
        }
        response = await _post_apple(APPLE_TOKEN_URL, data)
        if response.status_code != 200:
            logger.warning("auth.apple_code_exchange_failed", status=response.status_code)
            return None
        token = response.json().get("refresh_token")
        return str(token) if token else None
    except (httpx.HTTPError, ValueError, jwt.PyJWTError) as exc:
        logger.warning("auth.apple_code_exchange_failed", error=type(exc).__name__)
        return None


async def revoke_refresh_token(packed: str) -> bool:
    """Revoke a stored Apple refresh token (account deletion). Best effort: returns False on any failure."""
    client_id, token = unpack_refresh_token(packed)
    if not token_api_configured() or not client_id or not token:
        return False
    try:
        data = {
            "client_id": client_id,
            "client_secret": _client_secret(client_id),
            "token": token,
            "token_type_hint": "refresh_token",
        }
        response = await _post_apple(APPLE_REVOKE_URL, data)
    except (httpx.HTTPError, ValueError, jwt.PyJWTError) as exc:
        logger.warning("auth.apple_revoke_failed", error=type(exc).__name__)
        return False
    if response.status_code != 200:
        logger.warning("auth.apple_revoke_failed", status=response.status_code)
        return False
    return True
