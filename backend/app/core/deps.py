"""Common FastAPI dependencies: db session, current user, role checks, pagination params, client IP.

Usage in a module router::

    from app.core.deps import DbSession, CurrentUser, PageParams, require_roles, STAFF_ROLES
    from app.core.enums import UserRole

    @router.get("/cases/{case_id}")
    async def get_case(case_id: UUID, db: DbSession, user: CurrentUser) -> CaseDetail: ...

    @router.post("/finance/settlements/batches", dependencies=[Depends(require_roles(*FINANCE_ROLES))])
    async def create_batch(...): ...

    # or get the user back from the role check:
    async def approve(user: Annotated[User, Depends(require_roles(UserRole.ADMIN))]): ...
"""

from __future__ import annotations

import ipaddress
import uuid
from collections.abc import Awaitable, Callable, Iterable
from dataclasses import dataclass
from functools import lru_cache
from typing import Annotated, Any

from fastapi import Depends, Query, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_db
from app.core.enums import AuthPortal, UserRole, UserStatus
from app.core.errors import Forbidden, Unauthorized
from app.core.security import decode_access_token
from app.models.identity import User

DbSession = Annotated[AsyncSession, Depends(get_db)]

STAFF_ROLES: frozenset[UserRole] = frozenset(
    {UserRole.ADMIN, UserRole.FINANCE, UserRole.SUPPORT, UserRole.SUPER_ADMIN}
)
FINANCE_ROLES: frozenset[UserRole] = frozenset({UserRole.FINANCE, UserRole.SUPER_ADMIN})
ADMIN_ROLES: frozenset[UserRole] = frozenset({UserRole.ADMIN, UserRole.SUPER_ADMIN})

_bearer = HTTPBearer(auto_error=False, description="JWT access token")


def _role_value(role: Any) -> str:
    return str(getattr(role, "value", role))


def is_staff(user: User) -> bool:
    return _role_value(user.role) in {r.value for r in STAFF_ROLES}


def has_role(user: User, *roles: UserRole | str) -> bool:
    """True if the user has one of ``roles``; super_admin always matches."""
    role = _role_value(user.role)
    return role == UserRole.SUPER_ADMIN.value or role in {_role_value(r) for r in roles}


def token_portal(payload: dict[str, Any] | None) -> str:
    """The ``portal`` claim of an access token (``public`` when absent)."""
    value = (payload or {}).get("portal") or AuthPortal.PUBLIC.value
    return str(value)


def ensure_portal_matches(user: User, payload: dict[str, Any] | None) -> None:
    """PLAN 3.1: staff roles may only use staff-door tokens; everyone else only public-door tokens."""
    expected = AuthPortal.STAFF.value if is_staff(user) else AuthPortal.PUBLIC.value
    if token_portal(payload) != expected:
        raise Unauthorized("This session is not valid here, please sign in again", code="wrong_portal")


async def ensure_session_live(db: AsyncSession, payload: dict[str, Any]) -> None:
    """SEC-031: an access token bound to a session (``sid`` = refresh-token family) dies with the session:
    after logout, a password reset, an admin revocation or refresh-token reuse detection, the family has no
    live refresh token left and the access token is refused before it expires."""
    sid = payload.get("sid")
    if not sid:
        return
    from app.models.identity import RefreshToken

    try:
        family_id = uuid.UUID(str(sid))
    except ValueError as exc:
        raise Unauthorized("Invalid access token", code="invalid_token") from exc
    live = (
        await db.execute(
            select(RefreshToken.id)
            .where(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None))
            .limit(1)
        )
    ).first()
    if live is None:
        raise Unauthorized("Your session has ended, please sign in again", code="session_revoked")


# Paths a member of a suspended organisation may still call (to see why, and to sign out).
_SUSPENDED_ORG_ALLOWED_PREFIXES = ("/api/v1/auth/",)


async def ensure_organisation_active(db: AsyncSession, user: User, request: Request | None) -> None:
    """SEC-014: members of a suspended hospital, and suspended agents, lose access to every module (cases,
    documents, chats, payments...) until staff reinstate the organisation. A hospital user who also belongs
    to another, non-suspended hospital keeps access (the scope helpers drop the suspended hospital)."""
    role = _role_value(user.role)
    if role not in (UserRole.HOSPITAL.value, UserRole.AGENT.value):
        return
    if request is not None and request.url.path.startswith(_SUSPENDED_ORG_ALLOWED_PREFIXES):
        return
    from app.core.enums import AgentStatus, HospitalStatus
    from app.models.agents import Agent
    from app.models.hospitals import Hospital, HospitalMember

    if role == UserRole.HOSPITAL.value:
        statuses = (
            (
                await db.execute(
                    select(Hospital.status)
                    .join(HospitalMember, HospitalMember.hospital_id == Hospital.id)
                    .where(HospitalMember.user_id == user.id)
                )
            )
            .scalars()
            .all()
        )
        if statuses and all(_role_value(s) == HospitalStatus.SUSPENDED.value for s in statuses):
            raise Forbidden(
                "Your hospital's account is suspended. Please contact support.", code="organisation_suspended"
            )
        return
    agent_status = (
        await db.execute(select(Agent.status).where(Agent.user_id == user.id))
    ).scalar_one_or_none()
    if agent_status is not None and _role_value(agent_status) == AgentStatus.SUSPENDED.value:
        raise Forbidden(
            "Your agency account is suspended. Please contact support.", code="organisation_suspended"
        )


async def _user_from_token(db: AsyncSession, token: str, request: Request | None) -> User:
    payload = decode_access_token(token)
    user = await db.get(User, uuid.UUID(str(payload["sub"])))
    if user is None:
        raise Unauthorized("Invalid access token", code="invalid_token")
    ensure_portal_matches(user, payload)
    status = _role_value(user.status)
    if status == UserStatus.DELETED.value or getattr(user, "deleted_at", None) is not None:
        raise Forbidden("This account has been deleted", code="account_deleted")
    if status == UserStatus.SUSPENDED.value:
        raise Forbidden("This account is suspended", code="account_suspended")
    # SEC-017: a failed-sign-in lock only blocks NEW sign-ins (auth service); it must not end the owner's
    # live sessions, otherwise anyone who knows the email could keep the owner signed out.
    await ensure_session_live(db, payload)
    await ensure_organisation_active(db, user, request)
    if request is not None:
        if is_staff(user):
            # The staff door is web-only (PLAN 3.1): staff sessions are never valid from the mobile app.
            if request.headers.get("x-client-type", "").strip().lower() == "mobile":
                raise Unauthorized("This session is not valid here", code="wrong_portal")
            ensure_staff_ip_allowed(request)
        request.state.user = user
        request.state.token_payload = payload
    return user


async def get_current_user(
    request: Request,
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    """Resolve the Bearer JWT into a ``User``.

    401 when missing/invalid/expired; 403 when suspended/deleted."""
    if credentials is None or credentials.scheme.lower() != "bearer" or not credentials.credentials:
        raise Unauthorized("Authentication required")
    return await _user_from_token(db, credentials.credentials, request)


async def get_optional_user(
    request: Request,
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User | None:
    """Like ``get_current_user`` but returns ``None`` for anonymous requests. An *invalid* token still 401s
    so that clients notice and refresh."""
    if credentials is None or not credentials.credentials:
        return None
    return await _user_from_token(db, credentials.credentials, request)


CurrentUser = Annotated[User, Depends(get_current_user)]
OptionalUser = Annotated[User | None, Depends(get_optional_user)]


def require_roles(*roles: UserRole | str) -> Callable[..., Awaitable[User]]:
    """Dependency factory: the current user must have one of ``roles`` (super_admin is always allowed)."""
    allowed = {_role_value(r) for r in roles} | {UserRole.SUPER_ADMIN.value}

    async def _checker(user: CurrentUser) -> User:
        if _role_value(user.role) not in allowed:
            raise Forbidden("You do not have permission to perform this action")
        return user

    _checker.__name__ = f"require_roles_{'_'.join(sorted(allowed))}"
    return _checker


def require_staff() -> Callable[..., Awaitable[User]]:
    return require_roles(*STAFF_ROLES)


async def require_full_account(user: CurrentUser) -> User:
    """Reject guest accounts (INTEGRATION_BACKLOG #12): guests must upgrade (``POST /auth/guest/upgrade``)
    before creating a case or paying. Use ``user: FullAccountUser`` or
    ``dependencies=[Depends(require_full_account)]``."""
    if user.is_guest:
        raise Forbidden(
            "Create a full account to continue", code="guest_upgrade_required", details={"is_guest": True}
        )
    return user


FullAccountUser = Annotated[User, Depends(require_full_account)]


@dataclass(frozen=True, slots=True)
class PageQuery:
    """Validated pagination query (``page`` 1-based, ``page_size`` 1..100)."""

    page: int = 1
    page_size: int = 20

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size

    @property
    def limit(self) -> int:
        return self.page_size


def page_params(
    page: Annotated[int, Query(ge=1, le=100_000, description="1-based page number")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Items per page (max 100)")] = 20,
) -> PageQuery:
    return PageQuery(page=page, page_size=page_size)


# Use as ``params: PageParams`` in an endpoint signature (do NOT add ``= Depends()``).
PageParams = Annotated[PageQuery, Depends(page_params)]
Pagination = PageParams


IPAddress = ipaddress.IPv4Address | ipaddress.IPv6Address
IPNetwork = ipaddress.IPv4Network | ipaddress.IPv6Network


@lru_cache(maxsize=32)
def _networks(cidrs: tuple[str, ...]) -> tuple[IPNetwork, ...]:
    return tuple(ipaddress.ip_network(c, strict=False) for c in cidrs)


def _parse_ip(value: str | None) -> IPAddress | None:
    if not value:
        return None
    try:
        return ipaddress.ip_address(value.strip())
    except ValueError:
        return None


def ip_in_networks(ip: str | IPAddress | None, cidrs: Iterable[str]) -> bool:
    addr = ip if isinstance(ip, ipaddress.IPv4Address | ipaddress.IPv6Address) else _parse_ip(ip)
    if addr is None:
        return False
    if isinstance(addr, ipaddress.IPv6Address) and addr.ipv4_mapped is not None:
        addr = addr.ipv4_mapped
    return any(addr.version == net.version and addr in net for net in _networks(tuple(cidrs)))


def _is_trusted_proxy(ip: IPAddress | None) -> bool:
    return ip is not None and ip_in_networks(ip, settings.TRUSTED_PROXIES)


def _cloudfront_viewer_ip(value: str | None) -> IPAddress | None:
    """``CloudFront-Viewer-Address`` is ``<ip>:<port>`` (IPv6 unbracketed, e.g. ``2001:db8::1:443``)."""
    if not value:
        return None
    host, sep, port = value.strip().rpartition(":")
    if not sep or not port.isdigit():
        return None
    return _parse_ip(host.strip("[]"))


def get_client_ip(request: Request) -> str | None:
    """THE client IP for rate limits, audit logs and ``STAFF_ALLOWED_IPS`` (INTEGRATION_BACKLOG #20).

    Forwarding headers are honoured only when the direct peer is a trusted proxy (``TRUSTED_PROXIES``; in
    compose the edge's fixed ``EDGE_IPV4``, which uvicorn also trusts via ``FORWARDED_ALLOW_IPS`` and then
    already presents as the peer). From an untrusted peer every forwarding header is ignored. Order:
    ``CloudFront-Viewer-Address`` (only if ``TRUST_CLOUDFRONT_VIEWER_ADDRESS``: the AWS edge always sets
    it) -> right-most untrusted ``X-Forwarded-For`` hop (the edge overwrites XFF with ``$remote_addr``;
    anything a client prepends is ignored) -> ``X-Real-IP`` -> the peer itself."""
    peer = request.client.host if request.client else None
    peer_ip = _parse_ip(peer)
    if settings.TRUST_CLOUDFRONT_VIEWER_ADDRESS:
        viewer = _cloudfront_viewer_ip(request.headers.get("cloudfront-viewer-address"))
        if viewer is not None:
            return str(viewer)
    if not _is_trusted_proxy(peer_ip):
        return peer
    hops = [h.strip() for h in request.headers.get("x-forwarded-for", "").split(",") if h.strip()]
    for hop in reversed(hops):
        hop_ip = _parse_ip(hop)
        if hop_ip is None:
            break  # malformed entry: do not trust anything to its left
        if not _is_trusted_proxy(hop_ip):
            return str(hop_ip)
    real_ip = _parse_ip(request.headers.get("x-real-ip"))
    if real_ip is not None:
        return str(real_ip)
    return peer


def staff_ip_allowed(request: Request) -> bool:
    """True when ``STAFF_ALLOWED_IPS`` is empty or the client IP is inside one of its networks."""
    if not settings.STAFF_ALLOWED_IPS:
        return True
    return ip_in_networks(get_client_ip(request), settings.STAFF_ALLOWED_IPS)


def ensure_staff_ip_allowed(request: Request) -> None:
    """Dependency/helper for the staff door and staff APIs (PLAN 3.1 ``STAFF_ALLOWED_IPS``)."""
    if not staff_ip_allowed(request):
        raise Forbidden("Access from this network is not allowed", code="ip_not_allowed")


def get_user_agent(request: Request) -> str | None:
    ua = request.headers.get("user-agent")
    return ua[:500] if ua else None
