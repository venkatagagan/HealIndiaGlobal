"""HTTP caching and rate limiting for the public, unauthenticated catalogue (used by the public website).

``PublicCacheRoute`` is the ``route_class`` of the public catalog router:

* every successful ``GET`` gets an ``ETag`` (hash of the exact JSON body) and a shared-cache friendly
  ``Cache-Control`` (``public, max-age=300, stale-while-revalidate=3600`` by default, shorter for availability
  and search); a matching ``If-None-Match`` returns ``304 Not Modified`` without a body;
* a request that carries an ``Authorization`` header gets ``private, no-cache`` instead, so no shared cache
  (CDN) ever stores a response to an authenticated request, even though the catalogue holds no personal data;
* every request first passes ``public_catalog_rate_limit``: the website's server(s) (``WEBSITE_SERVER_IPS``)
  get ``CATALOG_RATE_LIMIT_WEBSITE`` requests per minute, every other client IP ``CATALOG_RATE_LIMIT_PUBLIC``.
"""

from __future__ import annotations

import hashlib
from collections.abc import Awaitable, Callable
from typing import Any

from fastapi import Depends, Request, Response
from fastapi.routing import APIRoute

from app.core.config import settings
from app.core.rate_limit import hit
from app.modules.catalog.settings import catalog_settings

PUBLIC_CACHE_CONTROL = "public, max-age=300, stale-while-revalidate=3600"
SHORT_CACHE_CONTROL = "public, max-age=60, stale-while-revalidate=300"
AUTHENTICATED_CACHE_CONTROL = "private, no-cache"
RATE_WINDOW_SECONDS = 60

# Endpoint (function) name -> Cache-Control for anonymous requests. Anything not listed uses the default.
CACHE_POLICIES: dict[str, str] = {
    "hospital_availability": SHORT_CACHE_CONTROL,
    "doctor_availability": SHORT_CACHE_CONTROL,
    "search": SHORT_CACHE_CONTROL,
    # Website & contact settings (app/modules/admin/site_config.py): edits should reach the website quickly.
    "site_config": SHORT_CACHE_CONTROL,
}


def is_website_server(ip: str | None) -> bool:
    from app.core.deps import ip_in_networks  # local import: deps imports models

    return bool(catalog_settings.WEBSITE_SERVER_IPS) and ip_in_networks(
        ip, catalog_settings.WEBSITE_SERVER_IPS
    )


async def public_catalog_rate_limit(request: Request) -> None:
    """Per-IP budget for the public catalogue; the website's server IPs get a separate, generous budget."""
    if not settings.RATE_LIMIT_ENABLED:
        return
    from app.core.deps import get_client_ip  # local import: deps imports models

    ip = get_client_ip(request) or "unknown"
    if is_website_server(ip):
        await hit(
            "catalog.website", f"ip:{ip}", catalog_settings.CATALOG_RATE_LIMIT_WEBSITE, RATE_WINDOW_SECONDS
        )
    else:
        await hit(
            "catalog.public", f"ip:{ip}", catalog_settings.CATALOG_RATE_LIMIT_PUBLIC, RATE_WINDOW_SECONDS
        )


def make_etag(body: bytes) -> str:
    return '"' + hashlib.sha256(body).hexdigest()[:32] + '"'


def etag_matches(if_none_match: str | None, etag: str) -> bool:
    """Weak comparison (RFC 9110 13.1.2): a compressing proxy may have turned the tag into ``W/"..."``."""
    if not if_none_match:
        return False
    value = if_none_match.strip()
    if value == "*":
        return True
    bare = etag.removeprefix("W/")
    return any(candidate.strip().removeprefix("W/") == bare for candidate in value.split(","))


class PublicCacheRoute(APIRoute):
    """APIRoute that rate-limits and adds ``ETag`` / ``Cache-Control`` (and answers 304) for public GETs."""

    def __init__(self, path: str, endpoint: Callable[..., Any], **kwargs: Any) -> None:
        dependencies = list(kwargs.pop("dependencies", None) or [])
        if not any(getattr(d, "dependency", None) is public_catalog_rate_limit for d in dependencies):
            dependencies.insert(0, Depends(public_catalog_rate_limit))
        super().__init__(path, endpoint, dependencies=dependencies, **kwargs)

    def get_route_handler(self) -> Callable[[Request], Awaitable[Response]]:
        original = super().get_route_handler()
        policy = CACHE_POLICIES.get(self.name, PUBLIC_CACHE_CONTROL)

        async def handler(request: Request) -> Response:
            response = await original(request)
            if request.method != "GET" or response.status_code != 200:
                return response
            body = getattr(response, "body", None)
            if not isinstance(body, bytes | bytearray):
                return response  # streaming responses are not hashed
            cache_control = AUTHENTICATED_CACHE_CONTROL if request.headers.get("authorization") else policy
            etag = make_etag(bytes(body))
            if etag_matches(request.headers.get("if-none-match"), etag):
                return Response(status_code=304, headers={"ETag": etag, "Cache-Control": cache_control})
            response.headers["ETag"] = etag
            response.headers["Cache-Control"] = cache_control
            return response

        return handler
