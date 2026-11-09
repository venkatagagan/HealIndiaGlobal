"""Public website configuration, edited by a super admin in the staff console (System -> Website & contact).

* ``GET /site-config`` - public, unauthenticated: contact numbers, floating-button switches, social links,
  analytics provider/IDs, search-console verification codes, marketing claims, active medical reviewers and
  the footer credit/disclaimer. Never the IndexNow key, inactive reviewers or placeholder numbers. Served
  through the public catalogue route class: ``ETag`` / ``304``, short shared cache, per-IP rate limit.
* ``GET /site-config/server`` - the website's server only: ``Authorization: Bearer <REVALIDATE_SECRET>`` (the
  on-demand revalidation secret both sides already share). Returns the IndexNow key; 503 without a secret.

Values are read straight from ``platform_settings`` (not the 30 s in-process settings cache) so the website's
revalidation, triggered right after a change, always sees the new values even with several API processes.
"""

from __future__ import annotations

import hmac
from typing import Any

from fastapi import APIRouter, Request
from sqlalchemy import select

from app.core.deps import DbSession
from app.core.errors import AppError, Unauthorized
from app.core.site_settings import WEBSITE_KEYS, indexnow_key, public_site_config
from app.modules.catalog.http_cache import PublicCacheRoute
from app.modules.catalog.settings import catalog_settings

router = APIRouter(tags=["site"], route_class=PublicCacheRoute)


async def _website_values(db: DbSession) -> dict[str, Any]:
    from app.models.catalog import PlatformSetting

    stmt = select(PlatformSetting.key, PlatformSetting.value).where(
        PlatformSetting.key.in_(sorted(WEBSITE_KEYS))
    )
    rows = await db.execute(stmt)
    return {key: value for key, value in rows.all()}


@router.get("/site-config")
async def site_config(db: DbSession) -> dict[str, Any]:
    """Public-safe website configuration (fetch tag ``site`` on the website)."""
    return public_site_config(await _website_values(db))


@router.get("/site-config/server", include_in_schema=False)
async def site_config_server(request: Request, db: DbSession) -> dict[str, Any]:
    """Server-only values for the website (bearer = REVALIDATE_SECRET)."""
    secret = catalog_settings.REVALIDATE_SECRET.strip()
    if not catalog_settings.revalidation_enabled or not secret:
        raise AppError("Website server configuration is not enabled", code="not_configured", status_code=503)
    header = request.headers.get("authorization") or ""
    supplied = header[7:].strip() if header[:7].lower() == "bearer " else ""
    if not supplied or not hmac.compare_digest(supplied.encode(), secret.encode()):
        raise Unauthorized("Invalid website secret", code="unauthorized")
    return {"indexnow_key": indexnow_key(await _website_values(db))}
