"""WebSocket fan-out hub: ``{user_id: set[WebSocket]}``.

    from app.core import realtime
    await realtime.send_to_user(user_id, "notification.created", {"id": str(n.id), ...})

Messages are JSON ``{"type": event_type, "data": {...}}``. With ``REDIS_URL`` set, messages are published on
the ``hig:rt`` channel and every API process relays them to its local sockets (so the worker process can
notify users connected to any API instance). Failures are logged and never raised: realtime delivery must not
break business transactions. The ``/ws`` endpoint itself lives in the messaging module and calls
``hub.connect(user_id, websocket, family_id=sid)`` / ``hub.disconnect(user_id, websocket)``.

SEC-031: when sessions are revoked (logout, password change/reset, suspension, admin revocation, refresh
reuse detection), :func:`queue_close_sessions` closes the affected open sockets once the revoking
transaction commits - in every API process (a ``control`` envelope on the same Redis channel). The socket
loop also re-checks its session periodically, so a missed message cannot keep a socket open for long.
"""

from __future__ import annotations

import asyncio
import contextlib
import uuid
from typing import Any

import orjson
import structlog
from fastapi.encoders import jsonable_encoder
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session
from starlette.websockets import WebSocket, WebSocketState

from app.core.redis import get_redis

logger = structlog.get_logger(__name__)

CHANNEL = "hig:rt"
WS_CLOSE_SESSION_REVOKED = 4401  # same "unauthorized" close code the /ws endpoint uses


class RealtimeHub:
    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = {}
        self._families: dict[WebSocket, str] = {}  # socket -> session (refresh-token family) id
        self._listener_task: asyncio.Task[None] | None = None
        self._instance_id = uuid.uuid4().hex

    # --- connection management ---------------------------------------------------------------------------
    async def connect(
        self,
        user_id: uuid.UUID | str,
        websocket: WebSocket,
        *,
        accept: bool = True,
        family_id: uuid.UUID | str | None = None,
    ) -> None:
        if accept and websocket.application_state == WebSocketState.CONNECTING:
            await websocket.accept()
        # Dict mutations happen without awaits, so no lock is needed on the single event loop.
        self._connections.setdefault(str(user_id), set()).add(websocket)
        if family_id:
            self._families[websocket] = str(family_id)

    async def disconnect(self, user_id: uuid.UUID | str, websocket: WebSocket) -> None:
        self._families.pop(websocket, None)
        sockets = self._connections.get(str(user_id))
        if sockets is not None:
            sockets.discard(websocket)
            if not sockets:
                self._connections.pop(str(user_id), None)

    def connection_count(self, user_id: uuid.UUID | str | None = None) -> int:
        if user_id is not None:
            return len(self._connections.get(str(user_id), ()))
        return sum(len(s) for s in self._connections.values())

    def is_online(self, user_id: uuid.UUID | str) -> bool:
        return bool(self._connections.get(str(user_id)))

    # --- delivery ------------------------------------------------------------------------------------------
    async def _deliver_local(self, user_id: str, message: str) -> int:
        sockets = list(self._connections.get(user_id, ()))
        delivered = 0
        for ws in sockets:
            try:
                await ws.send_text(message)
                delivered += 1
            except Exception:
                await self.disconnect(user_id, ws)
        return delivered

    async def send_to_user(self, user_id: uuid.UUID | str, event_type: str, data: Any = None) -> None:
        """Deliver ``{"type", "data"}`` to all of the user's sockets (via Redis when configured)."""
        try:
            message = orjson.dumps({"type": event_type, "data": jsonable_encoder(data or {})}).decode()
            client = get_redis()
            if client is not None:
                try:
                    envelope = orjson.dumps({"user_id": str(user_id), "message": message}).decode()
                    await client.publish(CHANNEL, envelope)
                    return
                except Exception as exc:
                    logger.warning("realtime.redis_publish_failed", error=str(exc))
            await self._deliver_local(str(user_id), message)
        except Exception as exc:  # never break callers
            logger.warning("realtime.send_failed", error=str(exc), event_type=event_type)

    async def send_to_users(self, user_ids: list[uuid.UUID | str], event_type: str, data: Any = None) -> None:
        for uid in dict.fromkeys(str(u) for u in user_ids):
            await self.send_to_user(uid, event_type, data)

    # --- session revocation (SEC-031) ---------------------------------------------------------------------
    async def _close_local(
        self, user_id: str, family_id: str | None, except_family: str | None = None
    ) -> int:
        """Close this process's sockets of ``user_id``: only those of session ``family_id`` when given, all
        but session ``except_family`` when that is given."""
        closed = 0
        for ws in list(self._connections.get(user_id, ())):
            if family_id is not None and self._families.get(ws) != family_id:
                continue
            if except_family is not None and self._families.get(ws) == except_family:
                continue
            await self.disconnect(user_id, ws)
            with contextlib.suppress(Exception):
                await ws.close(code=WS_CLOSE_SESSION_REVOKED, reason="session_revoked")
            closed += 1
        return closed

    async def close_sessions(
        self,
        user_id: uuid.UUID | str,
        family_id: uuid.UUID | str | None = None,
        except_family: uuid.UUID | str | None = None,
    ) -> None:
        """Close the user's open sockets (of one session, or all but one, or all) in every process. Never
        raises."""
        try:
            fam = str(family_id) if family_id else None
            keep = str(except_family) if except_family else None
            client = get_redis()
            if client is not None:
                try:
                    envelope = orjson.dumps(
                        {"control": "close", "user_id": str(user_id), "family_id": fam, "except_family": keep}
                    ).decode()
                    await client.publish(CHANNEL, envelope)
                    return
                except Exception as exc:
                    logger.warning("realtime.redis_publish_failed", error=str(exc))
            await self._close_local(str(user_id), fam, keep)
        except Exception as exc:
            logger.warning("realtime.close_failed", error=str(exc))

    # --- redis listener ------------------------------------------------------------------------------------
    async def _listen(self) -> None:
        backoff = 1.0
        while True:
            client = get_redis()
            if client is None:
                return
            pubsub = client.pubsub(ignore_subscribe_messages=True)
            try:
                await pubsub.subscribe(CHANNEL)
                backoff = 1.0
                async for item in pubsub.listen():
                    if item.get("type") != "message":
                        continue
                    try:
                        envelope = orjson.loads(item["data"])
                        if envelope.get("control") == "close":
                            family = envelope.get("family_id")
                            keep = envelope.get("except_family")
                            await self._close_local(
                                str(envelope["user_id"]),
                                str(family) if family else None,
                                str(keep) if keep else None,
                            )
                            continue
                        await self._deliver_local(str(envelope["user_id"]), str(envelope["message"]))
                    except Exception as exc:
                        logger.warning("realtime.bad_message", error=str(exc))
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning("realtime.listener_error", error=str(exc), retry_in=backoff)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30.0)
            finally:
                with contextlib.suppress(Exception):
                    await pubsub.aclose()

    def start_listener(self) -> None:
        """Start relaying Redis messages to local sockets (no-op without Redis or when already running)."""
        if get_redis() is None or (self._listener_task is not None and not self._listener_task.done()):
            return
        self._listener_task = asyncio.create_task(self._listen(), name="realtime-listener")

    async def stop_listener(self) -> None:
        task = self._listener_task
        self._listener_task = None
        if task is not None and not task.done():
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await task

    async def close_all(self) -> None:
        sockets = [(uid, ws) for uid, set_ in self._connections.items() for ws in set_]
        self._connections.clear()
        self._families.clear()
        for _, ws in sockets:
            with contextlib.suppress(Exception):
                await ws.close(code=1001)


hub = RealtimeHub()


async def send_to_user(user_id: uuid.UUID | str, event_type: str, data: Any = None) -> None:
    await hub.send_to_user(user_id, event_type, data)


async def send_to_users(user_ids: list[uuid.UUID | str], event_type: str, data: Any = None) -> None:
    await hub.send_to_users(user_ids, event_type, data)


async def connect(
    user_id: uuid.UUID | str,
    websocket: WebSocket,
    *,
    accept: bool = True,
    family_id: uuid.UUID | str | None = None,
) -> None:
    await hub.connect(user_id, websocket, accept=accept, family_id=family_id)


# --- post-commit socket closing (SEC-031) ----------------------------------------------------------------
_CLOSE_KEY = "hig_realtime_close_pending"
_background: set[asyncio.Task[None]] = set()


CloseItem = tuple[str, str | None, str | None]


def queue_close_sessions(
    db: AsyncSession | Session,
    user_id: uuid.UUID | str,
    family_id: uuid.UUID | str | None = None,
    *,
    except_family: uuid.UUID | str | None = None,
) -> None:
    """Close the user's open sockets (of session ``family_id``; else all but ``except_family``; else all)
    after ``db`` commits."""
    sync = db.sync_session if isinstance(db, AsyncSession) else db
    pending: list[CloseItem] = sync.info.setdefault(_CLOSE_KEY, [])
    pending.append(
        (str(user_id), str(family_id) if family_id else None, str(except_family) if except_family else None)
    )


async def _close_all(items: list[CloseItem]) -> None:
    for user_id, family_id, except_family in dict.fromkeys(items):
        await hub.close_sessions(user_id, family_id, except_family)


@event.listens_for(Session, "after_commit")
def _after_commit(session: Session) -> None:
    items: list[CloseItem] | None = session.info.pop(_CLOSE_KEY, None)
    if not items:
        return
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return
    task = loop.create_task(_close_all(items), name="realtime-close-sessions")
    _background.add(task)
    task.add_done_callback(_background.discard)


@event.listens_for(Session, "after_rollback")
def _after_rollback(session: Session) -> None:
    session.info.pop(_CLOSE_KEY, None)


async def drain_background() -> None:
    """Await scheduled socket closes (tests)."""
    while _background:
        await asyncio.gather(*list(_background), return_exceptions=True)


async def disconnect(user_id: uuid.UUID | str, websocket: WebSocket) -> None:
    await hub.disconnect(user_id, websocket)
