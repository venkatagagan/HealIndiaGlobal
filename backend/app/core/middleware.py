"""Pure-ASGI middleware: request id + access log, security headers, last-resort error catcher."""

from __future__ import annotations

import re
import time
import uuid
from typing import Any

import orjson
import structlog
from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.config import settings

access_logger = structlog.get_logger("app.access")
error_logger = structlog.get_logger("app.errors")

REQUEST_ID_HEADER = "X-Request-ID"
_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9._:-]{8,128}$")
_SKIP_ACCESS_LOG = frozenset({"/health/live", "/health/ready", "/metrics"})


def _header(scope: Scope, name: bytes) -> str | None:
    for key, value in scope.get("headers") or ():
        if key.lower() == name:
            try:
                return value.decode("latin-1")
            except UnicodeDecodeError:  # pragma: no cover - latin-1 always decodes
                return None
    return None


def _client_ip(scope: Scope) -> str | None:
    client = scope.get("client")
    return client[0] if client else None


class RequestIDMiddleware:
    """Assigns ``X-Request-ID`` (incoming value kept when well-formed), binds it into structlog contextvars,
    stores it on ``request.state.request_id``, echoes it on the response and writes one access-log line."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return

        incoming = _header(scope, b"x-request-id")
        request_id = incoming if incoming and _REQUEST_ID_RE.match(incoming) else uuid.uuid4().hex
        scope.setdefault("state", {})["request_id"] = request_id
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)

        start = time.perf_counter()
        status_holder: dict[str, int] = {"status": 0}

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                status_holder["status"] = int(message["status"])
                headers = MutableHeaders(scope=message)
                headers[REQUEST_ID_HEADER] = request_id
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            path = scope.get("path", "")
            if scope["type"] == "http" and path not in _SKIP_ACCESS_LOG:
                duration_ms = round((time.perf_counter() - start) * 1000, 2)
                status = status_holder["status"] or 500
                log = access_logger.warning if status >= 500 else access_logger.info
                log(
                    "request",
                    method=scope.get("method"),
                    path=path,
                    status=status,
                    duration_ms=duration_ms,
                    client_ip=_client_ip(scope),
                )
            structlog.contextvars.clear_contextvars()


class SecurityHeadersMiddleware:
    """Adds conservative security headers to every HTTP response."""

    def __init__(self, app: ASGIApp, *, hsts: bool | None = None) -> None:
        self.app = app
        self.hsts = settings.is_production if hsts is None else hsts

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        path: str = scope.get("path", "")
        is_docs = path.startswith("/api/docs") or path == "/api/openapi.json"
        no_store = path.startswith("/api/v1/auth")
        api = path.startswith("/api/v1/")  # SEC-034: default no-store; public catalog routes set their own

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers.setdefault("X-Content-Type-Options", "nosniff")
                headers.setdefault("X-Frame-Options", "DENY")
                headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
                headers.setdefault(
                    "Permissions-Policy",
                    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
                )
                headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
                if not is_docs:
                    headers.setdefault(
                        "Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'"
                    )
                if self.hsts:
                    headers.setdefault("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
                if no_store:
                    headers["Cache-Control"] = "no-store"
                    headers.setdefault("Pragma", "no-cache")
                elif api:
                    headers.setdefault("Cache-Control", "no-store")
            await send(message)

        await self.app(scope, receive, send_wrapper)


class CatchAllErrorsMiddleware:
    """Innermost safety net: converts unhandled exceptions into the standard 500 envelope so the response
    still flows through CORS/security/request-id middleware (Starlette's ServerErrorMiddleware sits outside
    them)."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        started = False

        async def send_wrapper(message: Message) -> None:
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except Exception as exc:
            error_logger.exception(
                "unhandled_error",
                path=scope.get("path"),
                method=scope.get("method"),
                exc_type=type(exc).__name__,
            )
            if started:
                raise
            request_id: Any = (scope.get("state") or {}).get("request_id")
            body = orjson.dumps(
                {
                    "error": {
                        "code": "internal_error",
                        "message": "An unexpected error occurred",
                        "details": None,
                        "request_id": request_id,
                    }
                }
            )
            await send(
                {
                    "type": "http.response.start",
                    "status": 500,
                    "headers": [
                        (b"content-type", b"application/json"),
                        (b"content-length", str(len(body)).encode()),
                    ],
                }
            )
            await send({"type": "http.response.body", "body": body})
