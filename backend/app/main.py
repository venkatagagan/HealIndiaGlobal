"""FastAPI application factory.

Run: ``.venv/Scripts/python -m uvicorn app.main:app --reload --port 8000``
"""

from __future__ import annotations

import asyncio
import contextlib
import ipaddress
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

import structlog
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response
from prometheus_client import CONTENT_TYPE_LATEST, CollectorRegistry, generate_latest
from prometheus_fastapi_instrumentator import Instrumentator
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.core import db as db_module
from app.core.config import settings
from app.core.errors import error_response, register_exception_handlers
from app.core.events import load_module_hooks
from app.core.jobs import run_worker
from app.core.logging import configure_logging
from app.core.middleware import CatchAllErrorsMiddleware, RequestIDMiddleware, SecurityHeadersMiddleware
from app.core.realtime import hub
from app.core.redis import close_redis, get_redis

logger = structlog.get_logger("app.main")


def _init_sentry() -> None:
    if not settings.SENTRY_DSN:
        return
    try:
        import sentry_sdk
    except ImportError:  # pragma: no cover - optional
        logger.warning("sentry.unavailable")
        return
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.ENV,
        send_default_pii=False,
        traces_sample_rate=0.0,
    )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    configure_logging()
    load_module_hooks()
    hub.start_listener()
    stop_event = asyncio.Event()
    worker_task: asyncio.Task[None] | None = None
    if settings.RUN_WORKER_IN_API and not settings.is_test:
        worker_task = asyncio.create_task(run_worker(stop_event), name="embedded-worker")
    logger.info("app.started", env=settings.ENV, embedded_worker=worker_task is not None)
    try:
        yield
    finally:
        stop_event.set()
        if worker_task is not None:
            with contextlib.suppress(Exception, asyncio.CancelledError):
                await asyncio.wait_for(worker_task, timeout=15)
        await hub.stop_listener()
        await hub.close_all()
        await close_redis()
        if not settings.is_test:
            await db_module.dispose_engine()
        logger.info("app.stopped")


def _is_internal(request: Request) -> bool:
    host = request.client.host if request.client else None
    if not host:
        return False
    try:
        addr = ipaddress.ip_address(host)
    except ValueError:
        return host in ("testclient", "localhost")
    return addr.is_private or addr.is_loopback


def create_app() -> FastAPI:
    _init_sentry()
    docs = settings.docs_enabled
    app = FastAPI(
        title=f"{settings.APP_NAME} API",
        version="1.0.0",
        description="Heal India Global - medical travel platform API.",
        docs_url="/api/docs" if docs else None,
        redoc_url=None,
        openapi_url="/api/openapi.json" if docs else None,
        swagger_ui_parameters={"persistAuthorization": True},
        lifespan=lifespan,
    )

    # Middleware: add_middleware() wraps the current stack, so add innermost first.
    # Final order (outer -> inner): RequestID/access-log, SecurityHeaders, TrustedHost (prod), CORS, GZip,
    # CatchAllErrors.
    app.add_middleware(CatchAllErrorsMiddleware)
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_origin_regex=settings.cors_origin_regex,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID", "Retry-After", "Content-Disposition"],
        max_age=600,
    )
    if settings.is_production and settings.TRUSTED_HOSTS and settings.TRUSTED_HOSTS != ["*"]:
        app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.TRUSTED_HOSTS)
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(RequestIDMiddleware)

    register_exception_handlers(app)

    # --- health ------------------------------------------------------------------------------------------
    @app.get("/health/live", tags=["system"], include_in_schema=False)
    async def health_live() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/health/ready", tags=["system"], include_in_schema=False)
    async def health_ready(request: Request) -> Any:
        checks: dict[str, str] = {}
        healthy = True
        try:
            await asyncio.wait_for(db_module.ping_database(), timeout=5)
            checks["database"] = "ok"
        except Exception as exc:
            healthy = False
            checks["database"] = "error"
            logger.warning("health.db_failed", error=type(exc).__name__)
        if get_redis() is None:
            checks["redis"] = "disabled"
        else:
            try:
                client = get_redis()
                assert client is not None  # noqa: S101
                await asyncio.wait_for(client.ping(), timeout=3)
                checks["redis"] = "ok"
            except Exception as exc:
                healthy = False
                checks["redis"] = "error"
                logger.warning("health.redis_failed", error=type(exc).__name__)
        if not healthy:
            return error_response(
                request, status_code=503, code="service_unavailable", message="Not ready", details=checks
            )
        return JSONResponse({"status": "ok", "checks": checks})

    # --- metrics -----------------------------------------------------------------------------------------
    registry = CollectorRegistry(auto_describe=True)
    Instrumentator(
        should_group_status_codes=True,
        should_ignore_untemplated=True,
        excluded_handlers=["/metrics", "/health/live", "/health/ready"],
        registry=registry,
    ).instrument(app)

    @app.get("/metrics", tags=["system"], include_in_schema=False)
    async def metrics(request: Request) -> Response:
        if settings.is_production and not _is_internal(request):
            return error_response(request, status_code=404, code="not_found", message="Resource not found")
        return Response(generate_latest(registry), media_type=CONTENT_TYPE_LATEST)

    # --- API ---------------------------------------------------------------------------------------------
    from app.api import api_router

    app.include_router(api_router)
    return app


app = create_app()
