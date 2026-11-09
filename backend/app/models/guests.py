"""Guest journey before registration (phase 1): contact verification codes, the one free intro
consultation with a platform medical coordinator, and the guest AI quota ledger."""

from __future__ import annotations

import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import DateTime, Integer, SmallInteger, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.crypto import EncryptedString
from app.core.enums import ConsultationStatus, ContactChannel, sa_enum
from app.models.base import Base, CreatedAtMixin, TimestampMixin, UUIDPkMixin, fk, uuid_array_col

__all__ = ["GuestAiUsage", "GuestContactVerification", "IntroConsultation"]


class GuestContactVerification(UUIDPkMixin, TimestampMixin, Base):
    """A 6-digit code sent to a guest's email/phone. The code is stored only as a keyed HMAC bound to this
    row id; the contact as a keyed HMAC (lookups) plus an encrypted copy. 10-minute expiry, 5 attempts."""

    __tablename__ = "guest_contact_verifications"
    __table_args__ = (sa.Index("ix_guest_contact_verifications_contact", "contact_hash", "created_at"),)

    user_id: Mapped[uuid.UUID] = fk("users.id", ondelete="CASCADE")
    channel: Mapped[ContactChannel] = mapped_column(sa_enum(ContactChannel), nullable=False)
    contact_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    contact_value: Mapped[str] = mapped_column(EncryptedString(), nullable=False)
    """The email/phone itself (encrypted): the coordinator needs it to reach the guest."""
    code_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    attempts: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0, server_default="0")
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    """Set when the verified contact was used for the free consultation (one use per verification)."""
    ip: Mapped[str | None] = mapped_column(String(64))


class IntroConsultation(UUIDPkMixin, TimestampMixin, Base):
    """The one free 15-minute video call a guest (or new patient) gets with a platform medical coordinator.

    One per verified contact (``contact_hash`` unique) and one per device (``device_hash`` unique)."""

    __tablename__ = "intro_consultations"
    __table_args__ = (
        sa.UniqueConstraint("contact_hash", name="uq_intro_consultations_contact_hash"),
        sa.Index(
            "uq_intro_consultations_device_hash",
            "device_hash",
            unique=True,
            postgresql_where=sa.text("device_hash IS NOT NULL"),
        ),
        sa.CheckConstraint("duration_min > 0", name="duration_positive"),
    )

    user_id: Mapped[uuid.UUID | None] = fk("users.id", ondelete="SET NULL", nullable=True)
    patient_id: Mapped[uuid.UUID | None] = fk("patient_profiles.id", ondelete="SET NULL", nullable=True)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    contact_channel: Mapped[ContactChannel] = mapped_column(sa_enum(ContactChannel), nullable=False)
    contact_value: Mapped[str] = mapped_column(EncryptedString(), nullable=False)
    contact_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    device_hash: Mapped[str | None] = mapped_column(String(64))
    preferred_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    preferred_to: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    timezone: Mapped[str | None] = mapped_column(String(64))
    screening_id: Mapped[uuid.UUID | None] = fk("screenings.id", ondelete="SET NULL", nullable=True)
    document_ids: Mapped[list[uuid.UUID]] = uuid_array_col()
    question: Mapped[str | None] = mapped_column(EncryptedString())
    status: Mapped[ConsultationStatus] = mapped_column(
        sa_enum(ConsultationStatus),
        nullable=False,
        default=ConsultationStatus.REQUESTED,
        server_default="requested",
        index=True,
    )
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    duration_min: Mapped[int] = mapped_column(Integer, nullable=False, default=15, server_default="15")
    meeting_url: Mapped[str | None] = mapped_column(String(1024))
    coordinator_user_id: Mapped[uuid.UUID | None] = fk("users.id", ondelete="SET NULL", nullable=True)
    coordinator_notes: Mapped[str | None] = mapped_column(Text)
    reminder_24h_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reminder_1h_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class GuestAiUsage(UUIDPkMixin, CreatedAtMixin, Base):
    """One row per AI screening / report scan started by a guest (daily quota per guest and per IP)."""

    __tablename__ = "guest_ai_usage"
    __table_args__ = (sa.Index("ix_guest_ai_usage_ip_hash_created_at", "ip_hash", "created_at"),)

    user_id: Mapped[uuid.UUID | None] = fk("users.id", ondelete="SET NULL", nullable=True)
    ip_hash: Mapped[str | None] = mapped_column(String(64))
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    reference_id: Mapped[str | None] = mapped_column(Text)
