"""HTTP driver for the end-to-end journeys.

Every request goes through :meth:`Journey.call`, which turns an unexpected response into a readable
``pytest.fail`` naming the journey step, the endpoint, the actor and the module responsible for it (PLAN 2.2
ownership), and says explicitly when the route does not exist yet. No step is ever skipped or xfailed.

Set ``E2E_TRACE=1`` (with ``pytest -s``) to print every step as it starts.
"""

from __future__ import annotations

import json as jsonlib
import os
import uuid
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from typing import Any, NoReturn

import httpx
import pytest
from starlette.routing import Match

API = "/api/v1"
PASSWORD = "E2e-Journey-2026"
TRACE = os.environ.get("E2E_TRACE", "").lower() in ("1", "true", "yes")

# Longest prefix first: path prefix -> "module (owning agent)".
_OWNERS: tuple[tuple[str, str], ...] = (
    ("/finance/ledger", "ledger (be-finance)"),
    ("/finance/summary", "ledger/settlements (be-finance)"),
    ("/finance", "settlements (be-finance)"),
    ("/hospital-portal", "hospitals (be-catalog)"),
    ("/agent-portal", "agents (be-messaging)"),
    ("/auth", "auth (be-auth)"),
    ("/patient", "patients (be-auth)"),
    ("/documents", "documents (be-auth)"),
    ("/screenings", "screening (be-screening)"),
    ("/cases", "cases (be-cases)"),
    ("/bookings", "cases (be-cases)"),
    ("/consultations", "cases (be-cases)"),
    ("/travel", "travel (be-cases)"),
    ("/conversations", "messaging (be-messaging)"),
    ("/notifications", "messaging (be-messaging)"),
    ("/payments", "payments (be-payments)"),
    ("/admin", "admin (be-admin)"),
)

# Modules responsible for event-driven side effects (PLAN 6.1), used in assertion messages.
SIDE_EFFECT_OWNERS = {
    "payment.captured->booking": "cases (be-cases) handler for payment.captured (apply payment, confirm)",
    "payment.captured->ledger": "ledger (be-finance) handler for payment.captured (capture posting)",
    "booking.confirmed->checklist": "cases (be-cases) handler for booking.confirmed (checklist)",
    "booking.completed->ledger": "ledger (be-finance) handler for booking.completed (revenue recognition)",
    "booking.completed->settlements": "settlements (be-finance) handler for booking.completed (items)",
    "booking.cancelled->refund": "payments (be-payments) handler for booking.cancelled (automatic refunds)",
    "refund.processed->booking": "cases (be-cases) handler for refund.processed (amount_refunded)",
    "refund.processed->ledger": "ledger (be-finance) handler for refund.processed (refund posting)",
    "payout.processed->ledger": "ledger (be-finance) handler for payout.processed (payout posting)",
    "case.created->conversation": "messaging (be-messaging) handler for case.created (case conversation)",
    "notifications": "messaging (be-messaging) event handlers (notifications)",
    "mark_eligible": "settlements (be-finance) periodic task settlements.mark_eligible",
}


def owner_of(path: str) -> str:
    bare = path.split("?", 1)[0]
    for prefix, owner in _OWNERS:
        if bare == prefix or bare.startswith(prefix + "/"):
            return owner
    return "catalog (be-catalog)"


def route_exists(method: str, full_path: str) -> bool:
    """True when the ASGI app has a route matching ``method`` + ``full_path`` (incl. ``/api/v1``)."""
    from app.main import app

    scope = {"type": "http", "path": full_path, "method": method.upper(), "root_path": ""}
    for route in app.routes:
        match, _ = route.matches(scope)
        if match == Match.FULL:
            return True
    return False


def items_of(payload: Any) -> list[Any]:
    """The list in a ``Page`` (``{"items": [...]}``) or a bare list response."""
    if isinstance(payload, list):
        return payload
    if isinstance(payload, Mapping):
        for key in ("items", "results", "data"):
            value = payload.get(key)
            if isinstance(value, list):
                return value
    return []


def dig(obj: Any, *path: str, default: Any = None) -> Any:
    """``dig(case, "agent", "id")`` - tolerant nested lookup."""
    cur = obj
    for key in path:
        if not isinstance(cur, Mapping) or key not in cur:
            return default
        cur = cur[key]
    return cur


def id_of(value: Any) -> str | None:
    """Id from either an embedded object (``{"id": ...}``) or a bare id."""
    if isinstance(value, Mapping):
        raw = value.get("id")
        return str(raw) if raw is not None else None
    return str(value) if value is not None else None


def pdf_bytes(title: str = "Heal India e2e") -> bytes:
    """A tiny but well-formed PDF (magic bytes ``%PDF``) for upload tests."""
    body = (
        "%PDF-1.4\n"
        "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
        "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
        "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 4 0 R>>endobj\n"
        f"4 0 obj<</Length {len(title) + 20}>>stream\nBT /F1 12 Tf ({title}) Tj ET\nendstream endobj\n"
        "trailer<</Root 1 0 R>>\n%%EOF\n"
    )
    return body.encode("latin-1")


def short_uid() -> str:
    return uuid.uuid4().hex[:8]


@dataclass
class Actor:
    """Somebody using the API: a label for messages plus the headers that authenticate them."""

    label: str
    role: str
    headers: dict[str, str] = field(default_factory=dict)
    user_id: str | None = None
    email: str | None = None
    password: str | None = None
    user: Any = None  # ORM user for make_user-created staff (re-minted with auth_headers)
    data: dict[str, Any] = field(default_factory=dict)

    def bearer(self, token: str) -> None:
        self.headers["Authorization"] = f"Bearer {token}"


def _preview(value: Any, limit: int = 1500) -> str:
    if value is None:
        return "-"
    if isinstance(value, (bytes, bytearray)):
        text = value[:limit].decode("utf-8", "replace")
    elif isinstance(value, str):
        text = value
    else:
        try:
            text = jsonlib.dumps(value, default=str)
        except (TypeError, ValueError):
            text = repr(value)
    return text if len(text) <= limit else text[:limit] + f"... ({len(text)} chars)"


class Journey:
    """Drives one journey; remembers completed steps so a failure says how far the platform got."""

    def __init__(self, client: httpx.AsyncClient, name: str) -> None:
        self.client = client
        self.name = name
        self.done: list[str] = []
        self.current = "setup"
        self.notes: list[str] = []  # e.g. background jobs that failed so far

    # ------------------------------------------------------------------------------------------ steps
    def step(self, title: str) -> None:
        self.done.append(self.current)
        self.current = title
        if TRACE:
            print(f"[{self.name}] step {len(self.done)}: {title}", flush=True)  # noqa: T201

    def fail(self, message: str, *, module: str) -> NoReturn:
        recent = "; ".join(self.done[-4:]) or "-"
        notes = "".join(f"\n  note: {note}" for note in self.notes)
        pytest.fail(
            f"\n[{self.name}] FAILED at step: {self.current}\n"
            f"  responsible module: {module}\n"
            f"  {message}\n"
            f"  steps completed before this one: {len(self.done)} (last: {recent}){notes}",
            pytrace=False,
        )

    def check(self, condition: Any, message: str, *, module: str) -> None:
        if not condition:
            self.fail(message, module=module)

    # ------------------------------------------------------------------------------------------ http
    async def call(
        self,
        actor: Actor | None,
        method: str,
        path: str,
        *,
        expect: int | Iterable[int] = 200,
        json: Any = None,
        params: Mapping[str, Any] | None = None,
        headers: Mapping[str, str] | None = None,
        files: Any = None,
        data: Mapping[str, Any] | None = None,
        module: str | None = None,
    ) -> Any:
        """Send ``method`` ``/api/v1{path}`` as ``actor``; fail the journey unless the status is expected.

        Returns the decoded JSON body (``None`` for empty bodies, the raw response for non-JSON bodies)."""
        url = API + path
        owner = module or owner_of(path)
        who = actor.label if actor else "anonymous"
        request_headers: dict[str, str] = dict(actor.headers) if actor else {}
        request_headers.update(headers or {})
        expected = (expect,) if isinstance(expect, int) else tuple(expect)
        try:
            response = await self.client.request(
                method, url, json=json, params=params, headers=request_headers, files=files, data=data
            )
        except Exception as exc:  # an exception escaped the app instead of an error response
            self.fail(
                f"{method} {url} as {who} raised {type(exc).__name__}: {exc}\n  request: {_preview(json)}",
                module=owner,
            )
        if response.status_code not in expected:
            hint = ""
            if response.status_code in (404, 405) and not route_exists(method, url):
                hint = "  <-- endpoint NOT IMPLEMENTED (no matching route)"
            body: Any
            try:
                body = response.json()
            except ValueError:
                body = response.text
            self.fail(
                f"{method} {url} as {who} -> HTTP {response.status_code}, expected {list(expected)}{hint}\n"
                f"  request: {_preview(json if json is not None else data)}\n"
                f"  response: {_preview(body)}",
                module=owner,
            )
        if response.status_code == 204 or not response.content:
            return None
        if "json" in response.headers.get("content-type", ""):
            return response.json()
        return response

    async def status_of(
        self,
        actor: Actor | None,
        method: str,
        path: str,
        *,
        json: Any = None,
        params: Mapping[str, Any] | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> tuple[int, Any]:
        """Raw ``(status, body)`` - for negative checks (IDOR, maker-checker)."""
        request_headers: dict[str, str] = dict(actor.headers) if actor else {}
        request_headers.update(headers or {})
        try:
            response = await self.client.request(
                method, API + path, json=json, params=params, headers=request_headers
            )
        except Exception as exc:
            self.fail(
                f"{method} {API + path} as {actor.label if actor else 'anonymous'} raised "
                f"{type(exc).__name__}: {exc}",
                module=owner_of(path),
            )
        try:
            body: Any = response.json()
        except ValueError:
            body = response.text
        return response.status_code, body

    # ------------------------------------------------------------------------------------------ auth
    async def register(self, label: str, payload: dict[str, Any]) -> tuple[Actor, dict[str, Any]]:
        """POST /auth/register -> an authenticated :class:`Actor` and the ``TokenOut`` body."""
        body = await self.call(
            None,
            "POST",
            "/auth/register",
            json=payload,
            expect=(200, 201),
            headers={"X-Client-Type": "mobile"},
        )
        self.check(
            isinstance(body, Mapping) and body.get("access_token"),
            f"POST /auth/register returned no access_token: {_preview(body)}",
            module="auth (be-auth)",
        )
        user = body.get("user") or {}
        actor = Actor(
            label=label,
            role=str(payload.get("role")),
            user_id=id_of(user),
            email=str(payload["email"]),
            password=str(payload["password"]),
        )
        actor.bearer(str(body["access_token"]))
        return actor, body

    async def login(self, actor: Actor) -> dict[str, Any]:
        """POST /auth/login with the actor's credentials; refreshes the actor's bearer token."""
        body = await self.call(
            None,
            "POST",
            "/auth/login",
            json={"email": actor.email, "password": actor.password},
            headers={"X-Client-Type": "mobile"},
        )
        self.check(
            isinstance(body, Mapping) and body.get("access_token"),
            f"POST /auth/login returned no access_token for {actor.label}: {_preview(body)}",
            module="auth (be-auth)",
        )
        actor.bearer(str(body["access_token"]))
        return body
