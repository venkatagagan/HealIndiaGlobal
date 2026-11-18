"""WhatsApp channel: per-user opt-in with a verified phone number, and the delivery log (no message bodies).

See ``app.modules.messaging.whatsapp`` and docs/integrations/WHATSAPP.md.
"""

from __future__ import annotations

import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import DateTime, Integer, SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.crypto import EncryptedString
from app.core.enums import WhatsAppMessageStatus, WhatsAppOptInStatus, sa_enum
from app.models.base import Base, TimestampMixin, UUIDPkMixin, fk

__all__ = ["WhatsAppMessage", "WhatsAppOptIn"]


class WhatsAppOptIn(UUIDPkMixin, TimestampMixin, Base):
    """One row per user. The phone number is stored encrypted; ``phone_hash`` (keyed HMAC of the E.164
    number) finds the user when a STOP reply arrives on the webhook."""

    __tablename__ = "whatsapp_optins"
    __table_args__ = (sa.CheckConstraint("code_attempts >= 0 AND codes_sent >= 0", name="counters_nonneg"),)

    user_id: Mapped[uuid.UUID] = fk("users.id", ondelete="CASCADE", index=False, unique=True)
    phone_e164: Mapped[str] = mapped_column(EncryptedString(), nullable=False)
    phone_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    phone_masked: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[WhatsAppOptInStatus] = mapped_column(
        sa_enum(WhatsAppOptInStatus),
        nullable=False,
        default=WhatsAppOptInStatus.PENDING,
        server_default="pending",
        index=True,
    )
    # pending verification code (keyed HMAC bound to the row id), 10-minute expiry, 5 attempts
    code_hash: Mapped[str | None] = mapped_column(String(64))
    code_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    code_attempts: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0, server_default="0")
    codes_sent: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    last_code_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    opted_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    opted_out_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # "settings" | "stop_reply" | "admin"
    opt_out_source: Mapped[str | None] = mapped_column(String(20))


class WhatsAppMessage(UUIDPkMixin, TimestampMixin, Base):
    """Delivery log of template messages. Holds the template name and status only - never the rendered
    text or its parameters (they may include names, amounts or links)."""

    __tablename__ = "whatsapp_messages"
    __table_args__ = (
        sa.Index("ix_whatsapp_messages_created_at", "created_at"),
        sa.Index(
            "uq_whatsapp_messages_notification_id",
            "notification_id",
            unique=True,
            postgresql_where=sa.text("notification_id IS NOT NULL"),
        ),
    )

    user_id: Mapped[uuid.UUID | None] = fk("users.id", ondelete="SET NULL", nullable=True)
    notification_id: Mapped[uuid.UUID | None] = fk(
        "notifications.id", ondelete="SET NULL", nullable=True, index=False
    )
    kind: Mapped[str] = mapped_column(String(80), nullable=False)
    template_name: Mapped[str] = mapped_column(String(100), nullable=False)
    language_code: Mapped[str] = mapped_column(String(10), nullable=False)
    phone_masked: Mapped[str | None] = mapped_column(String(32))
    provider: Mapped[str] = mapped_column(String(20), nullable=False, default="meta", server_default="meta")
    provider_message_id: Mapped[str | None] = mapped_column(String(128), unique=True)
    status: Mapped[WhatsAppMessageStatus] = mapped_column(
        sa_enum(WhatsAppMessageStatus),
        nullable=False,
        default=WhatsAppMessageStatus.QUEUED,
        server_default="queued",
        index=True,
    )
    error_code: Mapped[str | None] = mapped_column(String(40))
    error_title: Mapped[str | None] = mapped_column(String(255))
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    failed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
