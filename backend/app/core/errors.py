"""Application errors and the uniform JSON error envelope (PLAN section 3).

Every error response has the shape::

    {"error": {"code": "not_found", "message": "Case not found", "details": null, "request_id": "..."}}

Raise the subclasses below from services/routers; never build error responses by hand::

    from app.core.errors import NotFound, Forbidden, Conflict, BadRequest

    raise NotFound("Case not found")
    raise BadRequest("Quote expired", code="quote_expired", details={"valid_until": "2026-10-01"})
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

import structlog
from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = structlog.get_logger("app.errors")


class AppError(Exception):
    """Base application error rendered as the standard envelope."""

    status_code: int = 400
    code: str = "bad_request"
    default_message: str = "Bad request"

    def __init__(
        self,
        message: str | None = None,
        *,
        code: str | None = None,
        status_code: int | None = None,
        details: Any = None,
        headers: Mapping[str, str] | None = None,
    ) -> None:
        self.message = message or self.default_message
        if code is not None:
            self.code = code
        if status_code is not None:
            self.status_code = status_code
        self.details = details
        self.headers: dict[str, str] = dict(headers or {})
        super().__init__(self.message)

    def __repr__(self) -> str:
        return (
            f"{type(self).__name__}(code={self.code!r}, status={self.status_code}, message={self.message!r})"
        )


class BadRequest(AppError):
    status_code = 400
    code = "bad_request"
    default_message = "Bad request"


class Unauthorized(AppError):
    status_code = 401
    code = "unauthorized"
    default_message = "Authentication required"

    def __init__(self, message: str | None = None, **kwargs: Any) -> None:
        headers = dict(kwargs.pop("headers", None) or {})
        headers.setdefault("WWW-Authenticate", "Bearer")
        super().__init__(message, headers=headers, **kwargs)


class PaymentError(AppError):
    status_code = 402
    code = "payment_error"
    default_message = "Payment failed"


class Forbidden(AppError):
    status_code = 403
    code = "forbidden"
    default_message = "You do not have permission to perform this action"


class NotFound(AppError):
    status_code = 404
    code = "not_found"
    default_message = "Resource not found"


class Conflict(AppError):
    status_code = 409
    code = "conflict"
    default_message = "Conflict"


class ValidationFailed(AppError):
    """Business-level validation failure rendered like a request validation error (422)."""

    status_code = 422
    code = "validation_error"
    default_message = "Validation failed"


class RateLimited(AppError):
    status_code = 429
    code = "rate_limited"
    default_message = "Too many requests, please slow down"

    def __init__(self, message: str | None = None, *, retry_after: int | None = None, **kwargs: Any) -> None:
        headers = dict(kwargs.pop("headers", None) or {})
        if retry_after is not None:
            headers["Retry-After"] = str(max(1, int(retry_after)))
        self.retry_after = retry_after
        super().__init__(message, headers=headers, **kwargs)


_HTTP_CODE_MAP: dict[int, str] = {
    400: "bad_request",
    401: "unauthorized",
    402: "payment_error",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    406: "not_acceptable",
    408: "request_timeout",
    409: "conflict",
    410: "gone",
    411: "length_required",
    413: "payload_too_large",
    415: "unsupported_media_type",
    422: "validation_error",
    429: "rate_limited",
    500: "internal_error",
    501: "not_implemented",
    502: "bad_gateway",
    503: "service_unavailable",
    504: "gateway_timeout",
}

_HTTP_DEFAULT_MESSAGES: dict[int, str] = {
    404: "Resource not found",
    405: "Method not allowed",
    401: "Authentication required",
    403: "Forbidden",
}


def _request_id(request: Request) -> str | None:
    rid = getattr(request.state, "request_id", None)
    if rid:
        return str(rid)
    return request.headers.get("x-request-id")


def error_body(code: str, message: str, details: Any = None, request_id: str | None = None) -> dict[str, Any]:
    return {
        "error": {
            "code": code,
            "message": message,
            "details": jsonable_encoder(details) if details is not None else None,
            "request_id": request_id,
        }
    }


def error_response(
    request: Request,
    *,
    status_code: int,
    code: str,
    message: str,
    details: Any = None,
    headers: Mapping[str, str] | None = None,
) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content=error_body(code, message, details, _request_id(request)),
        headers=dict(headers) if headers else None,
    )


async def app_error_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, AppError)  # noqa: S101 - registered only for AppError
    if exc.status_code >= 500:
        logger.error("app_error", code=exc.code, message=exc.message, path=request.url.path)
    return error_response(
        request,
        status_code=exc.status_code,
        code=exc.code,
        message=exc.message,
        details=exc.details,
        headers=exc.headers,
    )


def _clean_loc(loc: Any) -> list[Any]:
    return [part for part in (loc or ()) if not (isinstance(part, str) and part.startswith("function-after"))]


async def validation_error_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)  # noqa: S101
    details = [
        {"loc": _clean_loc(err.get("loc")), "msg": str(err.get("msg", "")), "type": str(err.get("type", ""))}
        for err in exc.errors()
    ]
    return error_response(
        request,
        status_code=422,
        code="validation_error",
        message="Request validation failed",
        details=details,
    )


async def http_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StarletteHTTPException)  # noqa: S101
    status_code = exc.status_code
    code = _HTTP_CODE_MAP.get(status_code, "internal_error" if status_code >= 500 else "bad_request")
    detail = exc.detail
    details: Any = None
    if isinstance(detail, str) and detail:
        message = detail
    elif isinstance(detail, dict):
        message = str(detail.get("message") or _HTTP_DEFAULT_MESSAGES.get(status_code, "Error"))
        code = str(detail.get("code") or code)
        details = detail.get("details")
    else:
        message = _HTTP_DEFAULT_MESSAGES.get(status_code, "Error")
        details = detail
    if status_code == 404 and message == "Not Found":
        message = "Resource not found"
    return error_response(
        request,
        status_code=status_code,
        code=code,
        message=message,
        details=details,
        headers=getattr(exc, "headers", None),
    )


async def integrity_error_handler(request: Request, exc: Exception) -> JSONResponse:
    orig = getattr(exc, "orig", None)
    constraint = getattr(orig, "constraint_name", None) or getattr(
        getattr(orig, "__cause__", None), "constraint_name", None
    )
    logger.warning("integrity_error", path=request.url.path, constraint=constraint)
    return error_response(
        request,
        status_code=409,
        code="conflict",
        message="The request conflicts with existing data",
        details={"constraint": constraint} if constraint else None,
    )


async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception(
        "unhandled_error", path=request.url.path, method=request.method, exc_type=type(exc).__name__
    )
    return error_response(
        request,
        status_code=500,
        code="internal_error",
        message="An unexpected error occurred",
    )


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(IntegrityError, integrity_error_handler)
    app.add_exception_handler(Exception, unhandled_error_handler)
