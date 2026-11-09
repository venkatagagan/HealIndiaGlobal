"""Agents / facilitators (PLAN 4.3)."""

from __future__ import annotations

import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import AgentStatus, AgentTier, KycStatus, sa_enum
from app.models.base import Base, TimestampMixin, UUIDPkMixin, fk

__all__ = ["Agent"]


class Agent(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "agents"
    __table_args__ = (
        sa.CheckConstraint(
            "commission_rate_bps IS NULL OR (commission_rate_bps >= 0 AND commission_rate_bps <= 10000)",
            name="commission_rate_bps_range",
        ),
    )

    user_id: Mapped[uuid.UUID] = fk("users.id", ondelete="RESTRICT", index=False, unique=True)
    agency_name: Mapped[str] = mapped_column(String(200), nullable=False)
    agent_code: Mapped[str] = mapped_column(String(8), nullable=False, unique=True)
    country: Mapped[str | None] = mapped_column(String(2), index=True)
    city: Mapped[str | None] = mapped_column(String(100))
    phone: Mapped[str | None] = mapped_column(String(32))
    website: Mapped[str | None] = mapped_column(String(512))
    status: Mapped[AgentStatus] = mapped_column(
        sa_enum(AgentStatus),
        nullable=False,
        default=AgentStatus.PENDING,
        server_default="pending",
        index=True,
    )
    kyc_status: Mapped[KycStatus] = mapped_column(
        sa_enum(KycStatus),
        nullable=False,
        default=KycStatus.NOT_SUBMITTED,
        server_default="not_submitted",
        index=True,
    )
    tier: Mapped[AgentTier] = mapped_column(
        sa_enum(AgentTier), nullable=False, default=AgentTier.BRONZE, server_default="bronze"
    )
    commission_rate_bps: Mapped[int | None] = mapped_column(Integer)
    approved_by: Mapped[uuid.UUID | None] = fk("users.id", ondelete="SET NULL", nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejection_reason: Mapped[str | None] = mapped_column(Text)
