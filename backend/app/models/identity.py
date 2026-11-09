"""Identity: users, tokens, consents, devices, audit log (PLAN 4.1)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

import sqlalchemy as sa
from sqlalchemy import BigInteger, Boolean, DateTime, Integer, String
from sqlalchemy.dialects.postgresql import CITEXT, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.crypto import EncryptedString
from app.core.enums import (
    AuthPortal,
    ConsentKind,
    DevicePlatform,
    UserRole,
    UserStatus,
    VerificationPurpose,
    sa_enum,
)
from app.models.base import Base, CreatedAtMixin, StrId, TimestampMixin, UUIDPkMixin, fk

if TYPE_CHECKING:
    from app.models.patients import PatientProfile

__all__ = ["AuditLog", "Consent", "DeviceToken", "RefreshToken", "User", "VerificationToken"]


class User(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (
        sa.CheckConstraint("failed_login_count >= 0", name="failed_login_count_nonneg"),
        sa.Index("ix_users_role_status", "role", "status"),
    )

    email: Mapped[str | None] = mapped_column(CITEXT, unique=True, nullable=True)
    phone: Mapped[str | None] = mapped_column(String(32))
    password_hash: Mapped[str | None] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(200), nullable=False, default="", server_default="")
    role: Mapped[UserRole] = mapped_column(sa_enum(UserRole), nullable=False, index=True)
    status: Mapped[UserStatus] = mapped_column(
        sa_enum(UserStatus), nullable=False, default=UserStatus.ACTIVE, server_default="active", index=True
    )
    avatar_url: Mapped[str | None] = mapped_column(String(1024))
    country_code: Mapped[str | None] = mapped_column(String(2))
    preferred_language: Mapped[str] = mapped_column(
        String(10), nullable=False, default="en", server_default="en"
    )
    is_guest: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=sa.false())
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    google_sub: Mapped[str | None] = mapped_column(String(255), unique=True)
    apple_sub: Mapped[str | None] = mapped_column(String(255), unique=True)
    # "<client_id> <refresh_token>" from Apple's code exchange; revoked on account deletion (App Store)
    apple_refresh_token: Mapped[str | None] = mapped_column(EncryptedString())
    mfa_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=sa.false()
    )
    mfa_secret: Mapped[str | None] = mapped_column(EncryptedString())
    # SEC-024: last accepted TOTP time step; a code for this step or an earlier one is refused (no replay).
    mfa_last_step: Mapped[int | None] = mapped_column(BigInteger)
    failed_login_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    patient_profile: Mapped[PatientProfile | None] = relationship(
        "PatientProfile", back_populates="user", uselist=False, lazy="raise"
    )

    @property
    def is_staff(self) -> bool:
        return self.role in (UserRole.ADMIN, UserRole.FINANCE, UserRole.SUPPORT, UserRole.SUPER_ADMIN)


class RefreshToken(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "refresh_tokens"

    user_id: Mapped[uuid.UUID] = fk("users.id", ondelete="CASCADE")
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    family_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    replaced_by_id: Mapped[uuid.UUID | None] = fk("refresh_tokens.id", ondelete="SET NULL", nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(512))
    ip: Mapped[str | None] = mapped_column(String(64))
    # Login door that issued the token (PLAN 3.1): a refresh only works at its own door.
    portal: Mapped[AuthPortal] = mapped_column(
        sa_enum(AuthPortal), nullable=False, default=AuthPortal.PUBLIC, server_default="public"
    )


class VerificationToken(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "verification_tokens"

    user_id: Mapped[uuid.UUID] = fk("users.id", ondelete="CASCADE")
    purpose: Mapped[VerificationPurpose] = mapped_column(sa_enum(VerificationPurpose), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Consent(UUIDPkMixin, TimestampMixin, Base):
    """Append-only consent records; the latest row per (user, kind, case_id, hospital_id) is effective.

    ``case_id``/``hospital_id`` scope a consent (e.g. ``share_with_hospitals`` for one hospital/case, or a
    ``hospital_partner_agreement`` accepted for one hospital); both are NULL for account-wide consents.
    """

    __tablename__ = "consents"
    __table_args__ = (sa.Index("ix_consents_user_id_kind", "user_id", "kind"),)

    user_id: Mapped[uuid.UUID] = fk("users.id", ondelete="CASCADE")
    kind: Mapped[ConsentKind] = mapped_column(sa_enum(ConsentKind), nullable=False)
    case_id: Mapped[uuid.UUID | None] = fk("cases.id", ondelete="RESTRICT", nullable=True)
    hospital_id: Mapped[uuid.UUID | None] = fk("hospitals.id", ondelete="RESTRICT", nullable=True)
    # Who recorded the consent when it was not the data subject (agent/staff on the patient's behalf).
    # NULL or == user_id means the subject's own consent; only those count as the patient's confirmation.
    granted_by_user_id: Mapped[uuid.UUID | None] = fk("users.id", ondelete="SET NULL", nullable=True)
    version: Mapped[str] = mapped_column(String(32), nullable=False)
    granted: Mapped[bool] = mapped_column(Boolean, nullable=False)
    ip: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(512))


class DeviceToken(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "device_tokens"

    user_id: Mapped[uuid.UUID] = fk("users.id", ondelete="CASCADE")
    platform: Mapped[DevicePlatform] = mapped_column(sa_enum(DevicePlatform), nullable=False)
    token: Mapped[str] = mapped_column(String(512), nullable=False, unique=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AuditLog(UUIDPkMixin, CreatedAtMixin, Base):
    """Append-only audit trail. ``entity_id`` is text (accepts UUIDs or keys such as a settings key)."""

    __tablename__ = "audit_logs"
    __table_args__ = (sa.Index("ix_audit_logs_entity", "entity_type", "entity_id"),)

    actor_user_id: Mapped[uuid.UUID | None] = fk("users.id", ondelete="SET NULL", nullable=True)
    actor_role: Mapped[str | None] = mapped_column(String(40))
    action: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    entity_type: Mapped[str | None] = mapped_column(String(60))
    entity_id: Mapped[str | None] = mapped_column(StrId())
    ip: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(512))
    before: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    after: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
