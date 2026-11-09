"""In-process domain events (PLAN 6.1).

    # app/modules/<x>/handlers.py
    from app.core.events import subscribe

    @subscribe("payment.captured")
    async def on_payment_captured(db: AsyncSession, payload: dict) -> None: ...

    # publisher (inside a service, before its commit):
    await publish(db, "payment.captured", {"payment_id": str(p.id), ...})

``publish`` awaits every handler sequentially in the SAME session/transaction, so handler writes commit or
roll back together with the publisher's change. A handler exception propagates to the publisher (and aborts
its transaction) - handlers must therefore be idempotent and must not call external systems inline: enqueue a
job instead (``app.core.jobs.enqueue``).
"""

from __future__ import annotations

import importlib
import importlib.util
import pkgutil
from collections.abc import Awaitable, Callable
from typing import Any

import structlog
from fastapi.encoders import jsonable_encoder
from sqlalchemy.ext.asyncio import AsyncSession

logger = structlog.get_logger(__name__)

EventHandler = Callable[[AsyncSession, dict[str, Any]], Awaitable[Any]]

_subscribers: dict[str, list[EventHandler]] = {}
_hooks_loaded = False

HOOK_SUBMODULES = ("handlers", "tasks")


def subscribe(event_name: str) -> Callable[[EventHandler], EventHandler]:
    """Register ``async def handler(db, payload)`` for ``event_name`` (idempotent per function)."""

    def decorator(fn: EventHandler) -> EventHandler:
        handlers = _subscribers.setdefault(event_name, [])
        ident = (fn.__module__, fn.__qualname__)
        if not any((h.__module__, h.__qualname__) == ident for h in handlers):
            handlers.append(fn)
        return fn

    return decorator


async def publish(db: AsyncSession, event_name: str, payload: dict[str, Any] | None = None) -> int:
    """Run all handlers for ``event_name`` sequentially in ``db``'s transaction. Returns the handler count."""
    handlers = list(_subscribers.get(event_name, ()))
    data: dict[str, Any] = jsonable_encoder(payload or {})
    logger.debug("event.publish", event_name=event_name, handlers=len(handlers))
    for handler in handlers:
        try:
            await handler(db, dict(data))
        except Exception:
            logger.exception(
                "event.handler_failed",
                event_name=event_name,
                handler=f"{handler.__module__}.{handler.__qualname__}",
            )
            raise
    return len(handlers)


def list_subscribers() -> dict[str, list[str]]:
    return {
        name: [f"{h.__module__}.{h.__qualname__}" for h in handlers]
        for name, handlers in _subscribers.items()
    }


def unsubscribe_all(event_name: str | None = None) -> None:
    """Remove subscriptions (tests only)."""
    if event_name is None:
        _subscribers.clear()
    else:
        _subscribers.pop(event_name, None)


def load_module_hooks(force: bool = False) -> list[str]:
    """Import every existing ``app.modules.<name>.handlers`` and ``app.modules.<name>.tasks`` module (plus
    core modules that register tasks) so their ``@subscribe``/``@task``/``@periodic`` decorators run.

    Called by the API lifespan, the worker and the test suite. Returns the imported module names."""
    global _hooks_loaded
    if _hooks_loaded and not force:
        return []
    import app.modules as modules_pkg

    imported: list[str] = []
    # Core modules that register tasks.
    for core_mod in ("app.core.jobs", "app.core.email"):
        importlib.import_module(core_mod)
    for mod in sorted(pkgutil.iter_modules(modules_pkg.__path__), key=lambda m: m.name):
        if not mod.ispkg:
            continue
        for sub in HOOK_SUBMODULES:
            full_name = f"{modules_pkg.__name__}.{mod.name}.{sub}"
            try:
                spec = importlib.util.find_spec(full_name)
            except ModuleNotFoundError:
                spec = None
            if spec is None:
                continue
            importlib.import_module(full_name)
            imported.append(full_name)
    _hooks_loaded = True
    logger.debug("hooks.loaded", modules=imported)
    return imported
