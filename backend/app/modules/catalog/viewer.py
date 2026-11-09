"""Who is looking at the public catalogue: home country and display currency.

The public catalogue never requires a login. A valid Bearer token only *personalises* defaults (home country
for the cost comparison, the display currency); an invalid or expired token is ignored here instead of
failing a public read.

Home country order (``resolve_home_country``):

1. ``?country=`` (``source="query"``)
2. signed-in patient: ``PatientProfile.country_of_residence`` (``"profile"``), else ``User.country_code``
   (``"account"``)
3. anonymous/guest: ``CF-IPCountry`` / ``X-Country`` request header, only when ``TRUST_COUNTRY_HEADER`` is on
   and the request came through a trusted proxy (``TRUSTED_PROXIES``) (``"header"``)
4. the region of the browser's ``Accept-Language`` (``en-GB`` -> ``GB``) (``"accept_language"``)
5. nothing: the caller falls back to the default country (``"default"``, ``is_fallback=true``)
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from fastapi import Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import PatientProfile, User
from app.modules.catalog.settings import catalog_settings

__all__ = [
    "PERSONALISED_VARY",
    "HomeCountry",
    "Viewer",
    "accept_language_country",
    "header_country",
    "load_viewer",
    "normalize_country_code",
    "resolve_home_country",
]

# Responses whose defaults depend on these request headers must say so to shared caches.
PERSONALISED_VARY = "Authorization, Accept-Language, CF-IPCountry, X-Country"
# Cloudflare pseudo-countries: unknown, Tor, anonymous proxy, satellite, other, EU/Asia-Pacific aggregates.
_PSEUDO_COUNTRIES = frozenset({"XX", "T1", "A1", "A2", "O1", "EU", "AP", "ZZ"})


@dataclass(frozen=True)
class Viewer:
    user_id: uuid.UUID | None = None
    profile_country: str | None = None
    account_country: str | None = None
    preferred_currency: str | None = None


@dataclass(frozen=True)
class HomeCountry:
    country: str | None
    source: str


def normalize_country_code(value: str | None) -> str | None:
    code = (value or "").strip().upper()
    if len(code) != 2 or not code.isalpha() or not code.isascii() or code in _PSEUDO_COUNTRIES:
        return None
    return code


def _bearer_user_id(request: Request) -> uuid.UUID | None:
    header = request.headers.get("authorization") or ""
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    from app.core.security import decode_access_token

    try:
        payload = decode_access_token(token.strip())
        return uuid.UUID(str(payload["sub"]))
    except Exception:  # noqa: BLE001 - personalisation only; a bad token never breaks a public read
        return None


async def load_viewer(db: AsyncSession, request: Request) -> Viewer:
    user_id = _bearer_user_id(request)
    if user_id is None:
        return Viewer()
    row = (
        await db.execute(
            select(
                User.country_code,
                PatientProfile.country_of_residence,
                PatientProfile.preferred_currency,
            )
            .outerjoin(PatientProfile, PatientProfile.user_id == User.id)
            .where(User.id == user_id, User.deleted_at.is_(None))
        )
    ).first()
    if row is None:
        return Viewer()
    account_country, profile_country, currency = row
    return Viewer(
        user_id=user_id,
        profile_country=normalize_country_code(profile_country),
        account_country=normalize_country_code(account_country),
        preferred_currency=(currency or None),
    )


def header_country(request: Request) -> str | None:
    """``CF-IPCountry`` / ``X-Country`` set by our CDN/edge; ignored unless explicitly trusted."""
    if not catalog_settings.TRUST_COUNTRY_HEADER:
        return None
    from app.core.deps import ip_in_networks

    peer = request.client.host if request.client else None
    if not ip_in_networks(peer, settings.TRUSTED_PROXIES):
        return None
    for name in ("cf-ipcountry", "x-country"):
        code = normalize_country_code(request.headers.get(name))
        if code:
            return code
    return None


def accept_language_country(value: str | None) -> str | None:
    """Region of the most preferred ``Accept-Language`` tag that has one (``fr-CA;q=0.8`` -> ``CA``)."""
    if not value:
        return None
    candidates: list[tuple[float, int, str]] = []
    for index, part in enumerate(value.split(",")[:20]):
        tag, _, params = part.strip().partition(";")
        weight = 1.0
        params = params.strip()
        if params.startswith("q="):
            try:
                weight = float(params[2:])
            except ValueError:
                weight = 0.0
        subtags = tag.strip().replace("_", "-").split("-")
        region = next((normalize_country_code(s) for s in subtags[1:] if len(s) == 2 and s.isalpha()), None)
        if region and weight > 0:
            candidates.append((-weight, index, region))
    return min(candidates)[2] if candidates else None


def resolve_home_country(request: Request, viewer: Viewer, explicit: str | None) -> HomeCountry:
    if explicit and explicit.strip():
        return HomeCountry(explicit.strip().upper(), "query")
    if viewer.profile_country:
        return HomeCountry(viewer.profile_country, "profile")
    if viewer.account_country:
        return HomeCountry(viewer.account_country, "account")
    detected = header_country(request)
    if detected:
        return HomeCountry(detected, "header")
    detected = accept_language_country(request.headers.get("accept-language"))
    if detected:
        return HomeCountry(detected, "accept_language")
    return HomeCountry(None, "default")
