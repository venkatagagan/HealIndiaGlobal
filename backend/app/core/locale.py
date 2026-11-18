"""Request locale: ``?lang=`` -> the signed-in user's ``preferred_language`` -> ``Accept-Language`` -> ``en``,
restricted to the ENABLED languages.

* :class:`LocaleMiddleware` (pure ASGI) refreshes the cached i18n snapshot when stale (no DB query otherwise),
  stores the query/header-based locale on ``request.state.locale`` and, when the response starts, re-resolves
  it with the language of the user that authentication loaded (``request.state.user_language``, set by
  ``app.core.deps``) and adds a ``Content-Language`` header to every ``/api/`` response.
* :func:`request_locale` / the ``RequestLocale`` dependency give handlers (and the error handlers) the same
  answer. The user's preference only counts once authentication has run, so declare ``RequestLocale`` AFTER
  ``CurrentUser``/``OptionalUser`` in an endpoint signature when the user's language should win.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import Depends, Request
from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.i18n import resolve_locale
from app.i18n.runtime import ensure_fresh

__all__ = ["LocaleMiddleware", "RequestLocale", "get_request_locale", "locale_from_scope", "request_locale"]


def _header(scope: Scope, name: bytes) -> str | None:
    for key, value in scope.get("headers") or ():
        if key.lower() == name:
            return value.decode("latin-1")
    return None


def _query_lang(scope: Scope) -> str | None:
    from urllib.parse import parse_qs

    raw = scope.get("query_string") or b""
    if b"lang=" not in raw:
        return None
    values = parse_qs(raw.decode("latin-1")).get("lang")
    return values[0] if values else None


def locale_from_scope(scope: Scope) -> str:
    state: dict[str, Any] = scope.get("state") or {}
    # ``user_language`` is a plain string stored by authentication (``app.core.deps``); never touch the ORM
    # user here: its session may already be closed when the response starts.
    user_language = state.get("user_language")
    return resolve_locale(
        query=_query_lang(scope),
        user_language=user_language if isinstance(user_language, str) else None,
        accept_language=_header(scope, b"accept-language"),
    )


def request_locale(request: Request) -> str:
    """The locale of ``request`` (recomputed, so it sees a user loaded after the middleware ran)."""
    locale = locale_from_scope(request.scope)
    request.state.locale = locale
    return locale


async def get_request_locale(request: Request) -> str:
    return request_locale(request)


RequestLocale = Annotated[str, Depends(get_request_locale)]


class LocaleMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not str(scope.get("path", "")).startswith("/api/"):
            await self.app(scope, receive, send)
            return
        await ensure_fresh()
        scope.setdefault("state", {})["locale"] = locale_from_scope(scope)

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                if "content-language" not in headers:
                    headers["Content-Language"] = locale_from_scope(scope)
            await send(message)

        await self.app(scope, receive, send_wrapper)
