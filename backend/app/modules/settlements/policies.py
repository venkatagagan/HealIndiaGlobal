"""Access policies for finance endpoints (PLAN 8.12 / 9.1).

* ``F`` = finance | super_admin: everything.
* ``S`` (admin | support) additionally read the staff summary.
* Hospital members with member_role owner | admin | finance act for their hospital (``X-Hospital-Id`` header
  selects the hospital when they belong to several; default = their first membership).
* Agents act for their own agency (``agents.user_id``).

Out-of-scope ids raise ``NotFound`` (never ``Forbidden``) so ids cannot be probed.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from fastapi import Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import FINANCE_ROLES, has_role, is_staff
from app.core.enums import HospitalMemberRole, PayeeType, UserRole
from app.core.errors import BadRequest, Forbidden
from app.models.agents import Agent
from app.models.hospitals import HospitalMember
from app.models.identity import User

HOSPITAL_FINANCE_MEMBER_ROLES: frozenset[str] = frozenset(
    {HospitalMemberRole.OWNER.value, HospitalMemberRole.ADMIN.value, HospitalMemberRole.FINANCE.value}
)


@dataclass(frozen=True, slots=True)
class Payee:
    payee_type: PayeeType
    payee_id: uuid.UUID


def role_of(user: User) -> str:
    return str(getattr(user.role, "value", user.role))


def is_finance(user: User) -> bool:
    return has_role(user, *FINANCE_ROLES)


async def hospital_membership(db: AsyncSession, user: User, request: Request | None) -> HospitalMember:
    """The membership the hospital user acts through (``X-Hospital-Id`` or the first one)."""
    header = request.headers.get("x-hospital-id") if request is not None else None
    stmt = select(HospitalMember).where(HospitalMember.user_id == user.id)
    if header:
        try:
            hospital_id = uuid.UUID(header.strip())
        except ValueError as exc:
            raise BadRequest("Invalid X-Hospital-Id header", code="invalid_hospital_id") from exc
        stmt = stmt.where(HospitalMember.hospital_id == hospital_id)
    member = (
        (await db.execute(stmt.order_by(HospitalMember.created_at, HospitalMember.id).limit(1)))
        .scalars()
        .first()
    )
    if member is None:
        raise Forbidden("You are not a member of this hospital", code="not_hospital_member")
    return member


async def payee_for_user(db: AsyncSession, user: User, request: Request | None) -> Payee:
    """The payee a hospital/agent user may see. Raises ``Forbidden`` for everyone else."""
    role = role_of(user)
    if role == UserRole.HOSPITAL.value:
        member = await hospital_membership(db, user, request)
        if str(getattr(member.member_role, "value", member.member_role)) not in HOSPITAL_FINANCE_MEMBER_ROLES:
            raise Forbidden(
                "Only hospital owners, admins and finance members can access settlements",
                code="hospital_role_forbidden",
            )
        return Payee(PayeeType.HOSPITAL, member.hospital_id)
    if role == UserRole.AGENT.value:
        agent_id = (await db.execute(select(Agent.id).where(Agent.user_id == user.id))).scalar_one_or_none()
        if agent_id is None:
            raise Forbidden("No agent profile for this account", code="agent_profile_missing")
        return Payee(PayeeType.AGENT, agent_id)
    raise Forbidden("You do not have permission to perform this action")


async def finance_or_payee(db: AsyncSession, user: User, request: Request | None) -> Payee | None:
    """``None`` for finance users (unrestricted), else the user's own payee (or ``Forbidden``)."""
    if is_finance(user):
        return None
    return await payee_for_user(db, user, request)


def is_staff_user(user: User) -> bool:
    return is_staff(user)
