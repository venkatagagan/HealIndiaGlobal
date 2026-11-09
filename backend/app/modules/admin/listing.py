"""List filters, sorting, per-status counts and filter facets of the admin list endpoints
(users, hospitals, agents, audit log). Everything here is additive to the original list endpoints:
omitted parameters keep the previous behaviour."""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from typing import Any

from sqlalchemy import ColumnElement, Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import AgentStatus, AgentTier, HospitalStatus, KycStatus, UserRole, UserStatus
from app.models import Agent, AuditLog, Hospital, HospitalSpecialty, User


def _like(term: str) -> str:
    escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _clean(q: str | None) -> str | None:
    term = " ".join((q or "").split())[:100]
    return term or None


def _order(stmt: Select[Any], fields: dict[str, Any], sort: str, id_col: Any) -> Select[Any]:
    column = fields[sort.lstrip("-")]
    if sort.startswith("-"):
        return stmt.order_by(column.desc().nulls_last(), id_col.desc())
    return stmt.order_by(column.asc().nulls_last(), id_col.asc())


def sort_pattern(fields: dict[str, Any]) -> str:
    return r"^-?(" + "|".join(fields) + r")$"


async def _counts(db: AsyncSession, inner: Any, values: Sequence[str]) -> dict[str, int]:
    sub = inner.subquery()
    rows = (await db.execute(select(sub.c.k, func.count()).group_by(sub.c.k))).all()
    counts = dict.fromkeys(values, 0)
    for value, count in rows:
        key = getattr(value, "value", value)
        if key is not None:
            counts[str(key)] = int(count)
    return counts


# ------------------------------------------------------------------------------------------------------ users
USER_SORT_FIELDS: dict[str, Any] = {
    "created_at": User.created_at,
    "last_login_at": User.last_login_at,
    "full_name": func.lower(User.full_name),
    "email": User.email,
}


def apply_user_filters(
    stmt: Select[Any],
    *,
    role: Sequence[UserRole] | None = None,
    status: Sequence[UserStatus] | None = None,
    q: str | None = None,
    country_code: Sequence[str] | None = None,
    created_from: Any = None,
    created_to: Any = None,
    email_verified: bool | None = None,
    mfa_enabled: bool | None = None,
    is_guest: bool | None = None,
) -> Select[Any]:
    """``created_from`` / ``created_to`` are aware datetimes ``[start, end)`` (see ``service.day_bounds``)."""
    if role:
        stmt = stmt.where(User.role.in_(list(role)))
    if status:
        stmt = stmt.where(User.status.in_(list(status)))
    if country_code:
        stmt = stmt.where(func.upper(User.country_code).in_([c.upper() for c in country_code]))
    if created_from is not None:
        stmt = stmt.where(User.created_at >= created_from)
    if created_to is not None:
        stmt = stmt.where(User.created_at < created_to)
    if email_verified is not None:
        stmt = stmt.where(
            User.email_verified_at.is_not(None) if email_verified else User.email_verified_at.is_(None)
        )
    if mfa_enabled is not None:
        stmt = stmt.where(User.mfa_enabled.is_(mfa_enabled))
    if is_guest is not None:
        stmt = stmt.where(User.is_guest.is_(is_guest))
    term = _clean(q)
    if term:
        pattern = _like(term)
        conds: list[ColumnElement[bool]] = [
            User.email.ilike(pattern, escape="\\"),
            User.full_name.ilike(pattern, escape="\\"),
            User.phone.ilike(pattern, escape="\\"),
        ]
        try:
            conds.append(User.id == uuid.UUID(term))
        except ValueError:
            pass
        stmt = stmt.where(or_(*conds))
    return stmt


def order_users(stmt: Select[Any], sort: str | None) -> Select[Any]:
    return _order(stmt, USER_SORT_FIELDS, sort or "-created_at", User.id)


async def user_role_counts(db: AsyncSession, **filters: Any) -> dict[str, int]:
    """Users per role for the given filters (``role`` ignored)."""
    filters.pop("role", None)
    inner = apply_user_filters(select(User.role.label("k")), **filters)
    return await _counts(db, inner, [r.value for r in UserRole])


# -------------------------------------------------------------------------------------------------- hospitals
HOSPITAL_SORT_FIELDS: dict[str, Any] = {
    "name": func.lower(Hospital.name),
    "city": func.lower(Hospital.city),
    "created_at": Hospital.created_at,
    "updated_at": Hospital.updated_at,
    "rating_avg": Hospital.rating_avg,
}


def apply_hospital_filters(
    stmt: Select[Any],
    *,
    status: Sequence[HospitalStatus] | None = None,
    q: str | None = None,
    kyc_status: Sequence[KycStatus] | None = None,
    city: Sequence[str] | None = None,
    state: Sequence[str] | None = None,
    accreditation: Sequence[str] | None = None,
    specialty_id: uuid.UUID | None = None,
    is_featured: bool | None = None,
) -> Select[Any]:
    if status:
        stmt = stmt.where(Hospital.status.in_(list(status)))
    if kyc_status:
        stmt = stmt.where(Hospital.kyc_status.in_(list(kyc_status)))
    if city:
        stmt = stmt.where(func.lower(Hospital.city).in_([c.lower() for c in city]))
    if state:
        stmt = stmt.where(func.lower(Hospital.state).in_([s.lower() for s in state]))
    if accreditation:
        stmt = stmt.where(Hospital.accreditations.overlap([a.lower() for a in accreditation]))
    if specialty_id is not None:
        stmt = stmt.where(
            Hospital.id.in_(
                select(HospitalSpecialty.hospital_id).where(HospitalSpecialty.specialty_id == specialty_id)
            )
        )
    if is_featured is not None:
        stmt = stmt.where(Hospital.is_featured.is_(is_featured))
    term = _clean(q)
    if term:
        pattern = _like(term)
        stmt = stmt.where(
            or_(
                Hospital.name.ilike(pattern, escape="\\"),
                Hospital.legal_name.ilike(pattern, escape="\\"),
                Hospital.city.ilike(pattern, escape="\\"),
                Hospital.slug.ilike(pattern, escape="\\"),
                Hospital.email.ilike(pattern, escape="\\"),
            )
        )
    return stmt


def order_hospitals(stmt: Select[Any], sort: str | None) -> Select[Any]:
    if not sort:
        # Approval queue first (oldest pending first), then the rest newest first.
        pending_first = (Hospital.status != HospitalStatus.PENDING_REVIEW).asc()
        return stmt.order_by(pending_first, Hospital.updated_at.desc(), Hospital.id.desc())
    return _order(stmt, HOSPITAL_SORT_FIELDS, sort, Hospital.id)


async def hospital_status_counts(db: AsyncSession, **filters: Any) -> dict[str, int]:
    filters.pop("status", None)
    inner = apply_hospital_filters(select(Hospital.status.label("k")), **filters)
    return await _counts(db, inner, [s.value for s in HospitalStatus])


# ----------------------------------------------------------------------------------------------------- agents
AGENT_SORT_FIELDS: dict[str, Any] = {
    "agency_name": func.lower(Agent.agency_name),
    "created_at": Agent.created_at,
    "commission_rate_bps": Agent.commission_rate_bps,
}


def apply_agent_filters(
    stmt: Select[Any],
    *,
    status: Sequence[AgentStatus] | None = None,
    q: str | None = None,
    kyc_status: Sequence[KycStatus] | None = None,
    tier: Sequence[AgentTier] | None = None,
    country: Sequence[str] | None = None,
) -> Select[Any]:
    """``stmt`` must already join ``User`` on ``Agent.user_id`` (search covers the user's name/email)."""
    if status:
        stmt = stmt.where(Agent.status.in_(list(status)))
    if kyc_status:
        stmt = stmt.where(Agent.kyc_status.in_(list(kyc_status)))
    if tier:
        stmt = stmt.where(Agent.tier.in_(list(tier)))
    if country:
        stmt = stmt.where(func.upper(Agent.country).in_([c.upper() for c in country]))
    term = _clean(q)
    if term:
        pattern = _like(term)
        stmt = stmt.where(
            or_(
                Agent.agency_name.ilike(pattern, escape="\\"),
                Agent.agent_code.ilike(pattern, escape="\\"),
                Agent.city.ilike(pattern, escape="\\"),
                User.email.ilike(pattern, escape="\\"),
                User.full_name.ilike(pattern, escape="\\"),
            )
        )
    return stmt


def order_agents(stmt: Select[Any], sort: str | None) -> Select[Any]:
    if not sort:
        return stmt.order_by(
            (Agent.status != AgentStatus.PENDING).asc(), Agent.created_at.desc(), Agent.id.desc()
        )
    return _order(stmt, AGENT_SORT_FIELDS, sort, Agent.id)


async def agent_status_counts(db: AsyncSession, **filters: Any) -> dict[str, int]:
    filters.pop("status", None)
    inner = apply_agent_filters(
        select(Agent.status.label("k")).join(User, User.id == Agent.user_id), **filters
    )
    return await _counts(db, inner, [s.value for s in AgentStatus])


# -------------------------------------------------------------------------------------------------- audit log
def apply_audit_search(
    stmt: Select[Any], *, q: str | None = None, actor_role: Sequence[str] | None = None
) -> Select[Any]:
    """Extra audit-log filters: ``q`` matches action, entity type/id and the actor's name/email;
    ``actor_role`` takes role values plus ``system`` (no actor)."""
    if actor_role:
        roles = [r for r in actor_role if r != "system"]
        conds: list[ColumnElement[bool]] = []
        if roles:
            conds.append(AuditLog.actor_role.in_(roles))
        if "system" in actor_role:
            conds.append(AuditLog.actor_user_id.is_(None))
        stmt = stmt.where(or_(*conds))
    term = _clean(q)
    if term:
        pattern = _like(term)
        stmt = stmt.where(
            or_(
                AuditLog.action.ilike(pattern, escape="\\"),
                AuditLog.entity_type.ilike(pattern, escape="\\"),
                AuditLog.entity_id.ilike(pattern, escape="\\"),
                AuditLog.actor_user_id.in_(
                    select(User.id).where(
                        or_(
                            User.full_name.ilike(pattern, escape="\\"), User.email.ilike(pattern, escape="\\")
                        )
                    )
                ),
            )
        )
    return stmt


# ----------------------------------------------------------------------------------------------------- facets
async def _distinct(db: AsyncSession, column: Any, limit: int = 300) -> list[str]:
    rows = await db.execute(
        select(column).where(column.is_not(None)).distinct().order_by(column).limit(limit)
    )
    return [str(v) for v in rows.scalars().all() if str(v).strip()]


async def admin_facets(db: AsyncSession) -> dict[str, list[str]]:
    """Distinct values that populate the admin list filters."""
    accreditations = await db.execute(
        select(func.unnest(Hospital.accreditations).label("a")).distinct().order_by("a").limit(100)
    )
    return {
        "hospital_cities": await _distinct(db, Hospital.city),
        "hospital_states": await _distinct(db, Hospital.state),
        "hospital_accreditations": [str(a) for a in accreditations.scalars().all() if a],
        "agent_countries": await _distinct(db, func.upper(Agent.country)),
        "user_countries": await _distinct(db, func.upper(User.country_code)),
        "audit_entity_types": await _distinct(db, AuditLog.entity_type),
        "audit_actions": await _distinct(db, AuditLog.action, limit=500),
    }
