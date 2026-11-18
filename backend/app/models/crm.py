"""Agent CRM: leads an agency works before they become managed patients (docs/AGENT_CRM.md).

A lead is personal data of a prospective patient who has no account and no login. Contact details are
encrypted at rest (searchable only through keyed fingerprints used for de-duplication); activity notes are
encrypted too. Leads must not hold health data beyond the short interest the agent types in.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import StrEnum

import sqlalchemy as sa
from sqlalchemy import BigInteger, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.crypto import EncryptedString, EncryptedText
from app.core.enums import sa_enum
from app.models.base import Base, CreatedAtMixin, TimestampMixin, UUIDPkMixin, fk, text_array_col

__all__ = ["AgentLead", "AgentLeadActivity", "LeadActivityKind", "LeadSource", "LeadStatus"]


class LeadStatus(StrEnum):
    NEW = "new"
    CONTACTED = "contacted"
    QUALIFIED = "qualified"
    SCREENING = "screening"
    QUOTE_REQUESTED = "quote_requested"
    WON = "won"  # converted to a managed patient
    LOST = "lost"


OPEN_LEAD_STATUSES: tuple[LeadStatus, ...] = (
    LeadStatus.NEW,
    LeadStatus.CONTACTED,
    LeadStatus.QUALIFIED,
    LeadStatus.SCREENING,
    LeadStatus.QUOTE_REQUESTED,
)


class LeadSource(StrEnum):
    WALK_IN = "walk_in"
    WHATSAPP = "whatsapp"
    FACEBOOK = "facebook"
    REFERRAL = "referral"
    EVENT = "event"
    OTHER = "other"


class LeadActivityKind(StrEnum):
    CALL = "call"
    MESSAGE = "message"
    MEETING = "meeting"
    NOTE = "note"
    STATUS_CHANGE = "status_change"


class AgentLead(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "agent_leads"
    __table_args__ = (
        sa.CheckConstraint("budget_minor IS NULL OR budget_minor >= 0", name="budget_nonneg"),
        sa.Index("ix_agent_leads_agent_status", "agent_id", "status"),
        sa.Index("ix_agent_leads_agent_follow_up", "agent_id", "next_follow_up_at"),
        sa.Index("ix_agent_leads_status_changed", "status", "status_changed_at"),
    )

    agent_id: Mapped[uuid.UUID] = fk("agents.id", ondelete="CASCADE", index=False)
    # the agency team member who works the lead (today an agency has one login: the agent user)
    owner_user_id: Mapped[uuid.UUID | None] = fk("users.id", ondelete="SET NULL", nullable=True)
    created_by_user_id: Mapped[uuid.UUID | None] = fk(
        "users.id", ondelete="SET NULL", nullable=True, index=False
    )
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    country: Mapped[str | None] = mapped_column(String(2))
    email: Mapped[str | None] = mapped_column(EncryptedString())
    phone: Mapped[str | None] = mapped_column(EncryptedString())
    whatsapp: Mapped[str | None] = mapped_column(EncryptedString())
    # keyed fingerprints of the normalised email / phone (duplicate detection without decrypting)
    email_fingerprint: Mapped[str | None] = mapped_column(String(64), index=True)
    phone_fingerprint: Mapped[str | None] = mapped_column(String(64), index=True)
    preferred_language: Mapped[str | None] = mapped_column(String(10))
    source: Mapped[LeadSource] = mapped_column(
        sa_enum(LeadSource), nullable=False, default=LeadSource.OTHER, server_default="other", index=True
    )
    source_detail: Mapped[str | None] = mapped_column(String(200))
    interested_specialty_id: Mapped[uuid.UUID | None] = fk(
        "specialties.id", ondelete="SET NULL", nullable=True, index=False
    )
    interested_procedure_id: Mapped[uuid.UUID | None] = fk(
        "procedures.id", ondelete="SET NULL", nullable=True, index=False
    )
    interest: Mapped[str | None] = mapped_column(String(300))
    budget_minor: Mapped[int | None] = mapped_column(BigInteger)
    budget_currency: Mapped[str | None] = mapped_column(String(3))
    status: Mapped[LeadStatus] = mapped_column(
        sa_enum(LeadStatus), nullable=False, default=LeadStatus.NEW, server_default="new"
    )
    status_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    lost_reason: Mapped[str | None] = mapped_column(String(500))
    next_follow_up_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # day (IST, ISO date) the follow-up reminder was last sent, so it is sent once per due date
    follow_up_reminded_on: Mapped[str | None] = mapped_column(String(10))
    last_activity_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    tags: Mapped[list[str]] = text_array_col()
    converted_patient_id: Mapped[uuid.UUID | None] = fk(
        "patient_profiles.id", ondelete="SET NULL", nullable=True
    )
    converted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AgentLeadActivity(UUIDPkMixin, CreatedAtMixin, Base):
    __tablename__ = "agent_lead_activities"
    __table_args__ = (sa.Index("ix_agent_lead_activities_lead_occurred", "lead_id", "occurred_at"),)

    lead_id: Mapped[uuid.UUID] = fk("agent_leads.id", ondelete="CASCADE", index=False)
    agent_id: Mapped[uuid.UUID] = fk("agents.id", ondelete="CASCADE")
    actor_user_id: Mapped[uuid.UUID | None] = fk("users.id", ondelete="SET NULL", nullable=True, index=False)
    kind: Mapped[LeadActivityKind] = mapped_column(sa_enum(LeadActivityKind), nullable=False)
    body: Mapped[str | None] = mapped_column(EncryptedText())
    from_status: Mapped[str | None] = mapped_column(String(40))
    to_status: Mapped[str | None] = mapped_column(String(40))
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=sa.func.now()
    )
