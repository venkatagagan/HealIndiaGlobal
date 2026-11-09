"""Hospital-portal access control.

Every ``/hospital-portal`` route resolves a :class:`PortalContext`: the current user must have role
``hospital`` and be a member of the selected hospital (``X-Hospital-Id`` header, default = the first
membership). A hospital the user does not belong to is reported as 404 (never 403) so ids cannot be probed.
``super_admin`` may act on any hospital by sending ``X-Hospital-Id`` (treated as owner).

Per-hospital ``member_role`` permissions:

* owner / admin   - profile (incl. GSTIN/PAN), submit for review, members, plus everything below
* coordinator     - doctors, availability, procedures & packages, specialties
* finance, doctor - read-only
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import DbSession, require_roles
from app.core.enums import HospitalMemberRole, HospitalStatus, UserRole
from app.core.errors import Forbidden, NotFound
from app.models import Hospital, HospitalMember, User

PROFILE_ROLES: frozenset[HospitalMemberRole] = frozenset({HospitalMemberRole.OWNER, HospitalMemberRole.ADMIN})
MEMBER_ADMIN_ROLES = PROFILE_ROLES
CATALOG_ROLES: frozenset[HospitalMemberRole] = frozenset(
    {HospitalMemberRole.OWNER, HospitalMemberRole.ADMIN, HospitalMemberRole.COORDINATOR}
)


@dataclass(slots=True)
class PortalContext:
    user: User
    hospital: Hospital
    member_role: HospitalMemberRole

    @property
    def hospital_id(self) -> uuid.UUID:
        return self.hospital.id

    def require(self, roles: frozenset[HospitalMemberRole], *, write: bool = True) -> None:
        """403 unless the member role is in ``roles`` (and, for writes, the hospital is not suspended)."""
        if self.member_role not in roles:
            raise Forbidden("Your hospital role does not allow this action", code="insufficient_member_role")
        if write and self.hospital.status == HospitalStatus.SUSPENDED:
            raise Forbidden("This hospital is suspended", code="hospital_suspended")


async def resolve_portal_context(db: AsyncSession, user: User, hospital_header: str | None) -> PortalContext:
    requested: uuid.UUID | None = None
    if hospital_header is not None and hospital_header.strip():
        try:
            requested = uuid.UUID(hospital_header.strip())
        except ValueError as exc:
            raise NotFound("Hospital not found") from exc

    is_super = str(getattr(user.role, "value", user.role)) == UserRole.SUPER_ADMIN.value
    if is_super and requested is not None:
        hospital = await db.get(Hospital, requested)
        if hospital is None:
            raise NotFound("Hospital not found")
        return PortalContext(user=user, hospital=hospital, member_role=HospitalMemberRole.OWNER)

    stmt = (
        select(HospitalMember, Hospital)
        .join(Hospital, Hospital.id == HospitalMember.hospital_id)
        .where(HospitalMember.user_id == user.id)
        .order_by(HospitalMember.created_at, HospitalMember.hospital_id)
    )
    if requested is not None:
        stmt = stmt.where(HospitalMember.hospital_id == requested)
    row = (await db.execute(stmt.limit(1))).first()
    if row is None:
        if requested is not None:
            raise NotFound("Hospital not found")
        raise NotFound("No hospital is linked to this account", code="no_hospital")
    member, hospital = row
    return PortalContext(user=user, hospital=hospital, member_role=HospitalMemberRole(member.member_role))


async def get_portal_context(
    db: DbSession,
    user: Annotated[User, Depends(require_roles(UserRole.HOSPITAL))],
    x_hospital_id: Annotated[str | None, Header(alias="X-Hospital-Id", max_length=64)] = None,
) -> PortalContext:
    return await resolve_portal_context(db, user, x_hospital_id)


Portal = Annotated[PortalContext, Depends(get_portal_context)]
