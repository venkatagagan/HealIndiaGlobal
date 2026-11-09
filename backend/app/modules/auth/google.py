"""Google Sign-In: verify an ID token issued for one of ``settings.GOOGLE_CLIENT_IDS``.

``google.oauth2.id_token.verify_oauth2_token`` is blocking (it fetches Google's certificates over HTTP), so it
runs in a worker thread. Tests monkeypatch ``google_id_token.verify_oauth2_token``.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import structlog
from google.auth import exceptions as google_exceptions
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from starlette.concurrency import run_in_threadpool

from app.core.config import settings
from app.core.errors import BadRequest, Unauthorized

logger = structlog.get_logger(__name__)

_GOOGLE_ISSUERS = frozenset({"accounts.google.com", "https://accounts.google.com"})


@dataclass(frozen=True, slots=True)
class GoogleIdentity:
    sub: str
    email: str | None
    email_verified: bool
    name: str | None
    picture: str | None


def _verify_sync(token: str, audiences: list[str]) -> dict[str, Any]:
    request = google_requests.Request()
    claims = google_id_token.verify_oauth2_token(token, request, audience=audiences)
    return dict(claims)


async def verify_google_id_token(token: str) -> GoogleIdentity:
    """Verify ``token`` and return the identity. Raises 400 when Google sign-in is not configured and 401
    (``invalid_google_token``) when verification fails."""
    audiences = [a for a in settings.GOOGLE_CLIENT_IDS if a]
    if not audiences:
        raise BadRequest("Google sign-in is not configured", code="google_not_configured")
    try:
        claims = await run_in_threadpool(_verify_sync, token, audiences)
    except (ValueError, google_exceptions.GoogleAuthError) as exc:
        logger.info("auth.google_token_rejected", error=type(exc).__name__)
        raise Unauthorized("Google sign-in failed", code="invalid_google_token") from exc
    if claims.get("iss") not in _GOOGLE_ISSUERS:
        raise Unauthorized("Google sign-in failed", code="invalid_google_token")
    if claims.get("aud") not in audiences:
        raise Unauthorized("Google sign-in failed", code="invalid_google_token")
    sub = str(claims.get("sub") or "").strip()
    if not sub:
        raise Unauthorized("Google sign-in failed", code="invalid_google_token")
    email = claims.get("email")
    verified = claims.get("email_verified") in (True, "true", "True")
    return GoogleIdentity(
        sub=sub,
        email=str(email).strip().lower() if email else None,
        email_verified=bool(email) and verified,
        name=(str(claims["name"]).strip()[:200] or None) if claims.get("name") else None,
        picture=str(claims["picture"])[:1024] if claims.get("picture") else None,
    )
