"""Patients: profiles, travelling companions, saved items (PLAN 4.2)."""

from __future__ import annotations

import uuid
from datetime import date
from typing import TYPE_CHECKING, Any

import sqlalchemy as sa
from sqlalchemy import Date, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.crypto import EncryptedString, EncryptedText
from app.core.enums import Gender, SavedEntityType, sa_enum
from app.models.base import Base, TimestampMixin, UUIDPkMixin, fk

if TYPE_CHECKING:
    from app.models.identity import User

__all__ = ["PatientCompanion", "PatientProfile", "SavedItem"]


class PatientProfile(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "patient_profiles"

    user_id: Mapped[uuid.UUID] = fk("users.id", ondelete="CASCADE", index=False, unique=True)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False, default="", server_default="")
    last_name: Mapped[str] = mapped_column(String(100), nullable=False, default="", server_default="")
    date_of_birth: Mapped[date | None] = mapped_column(Date)
    gender: Mapped[Gender | None] = mapped_column(sa_enum(Gender))
    nationality: Mapped[str | None] = mapped_column(String(2), index=True)
    country_of_residence: Mapped[str | None] = mapped_column(String(2))
    passport_number: Mapped[str | None] = mapped_column(EncryptedString())
    passport_last4: Mapped[str | None] = mapped_column(String(4))
    passport_expiry: Mapped[date | None] = mapped_column(Date)
    phone: Mapped[str | None] = mapped_column(String(32))
    whatsapp: Mapped[str | None] = mapped_column(String(32))
    address: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    emergency_contact: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    preferred_language: Mapped[str | None] = mapped_column(String(10))
    blood_group: Mapped[str | None] = mapped_column(String(5))
    # health free text: encrypted at rest
    allergies: Mapped[str | None] = mapped_column(EncryptedText())
    medical_history: Mapped[str | None] = mapped_column(EncryptedText())
    insurance_provider: Mapped[str | None] = mapped_column(String(200))
    insurance_policy_number: Mapped[str | None] = mapped_column(EncryptedString())
    referred_by_agent_id: Mapped[uuid.UUID | None] = fk("agents.id", ondelete="SET NULL", nullable=True)
    managed_by_agent_id: Mapped[uuid.UUID | None] = fk("agents.id", ondelete="SET NULL", nullable=True)
    preferred_currency: Mapped[str] = mapped_column(
        String(3), nullable=False, default="USD", server_default="USD"
    )
    # True once the patient picked a currency themselves; until then it follows the country of residence.
    currency_set_by_user: Mapped[bool] = mapped_column(
        sa.Boolean, nullable=False, default=False, server_default=sa.false()
    )

    user: Mapped[User] = relationship("User", back_populates="patient_profile", lazy="raise")

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()


class PatientCompanion(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "patient_companions"

    patient_id: Mapped[uuid.UUID] = fk("patient_profiles.id", ondelete="CASCADE")
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    relationship: Mapped[str | None] = mapped_column(String(60))
    nationality: Mapped[str | None] = mapped_column(String(2))
    date_of_birth: Mapped[date | None] = mapped_column(Date)
    passport_number: Mapped[str | None] = mapped_column(EncryptedString())
    passport_last4: Mapped[str | None] = mapped_column(String(4))


class SavedItem(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "saved_items"
    __table_args__ = (sa.UniqueConstraint("user_id", "entity_type", "entity_id"),)

    user_id: Mapped[uuid.UUID] = fk("users.id", ondelete="CASCADE")
    entity_type: Mapped[SavedEntityType] = mapped_column(sa_enum(SavedEntityType), nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
