"""Conversations, messages and in-app notifications (PLAN 4.10)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import ConversationKind, sa_enum
from app.models.base import Base, TimestampMixin, UUIDPkMixin, fk, json_obj_col, uuid_array_col

__all__ = ["Conversation", "ConversationParticipant", "Message", "Notification"]


class Conversation(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "conversations"
    __table_args__ = (
        # At most one case conversation per case (idempotent auto-creation on ``case.created``).
        sa.Index(
            "uq_conversations_case_id_case_kind",
            "case_id",
            unique=True,
            postgresql_where=sa.text("kind = 'case'"),
        ),
    )

    kind: Mapped[ConversationKind] = mapped_column(sa_enum(ConversationKind), nullable=False, index=True)
    case_id: Mapped[uuid.UUID | None] = fk("cases.id", ondelete="CASCADE", nullable=True)
    subject: Mapped[str | None] = mapped_column(String(255))
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)

    participants: Mapped[list[ConversationParticipant]] = relationship(
        "ConversationParticipant", back_populates="conversation", lazy="raise", passive_deletes=True
    )
    messages: Mapped[list[Message]] = relationship(
        "Message",
        back_populates="conversation",
        lazy="raise",
        order_by="Message.created_at",
        passive_deletes=True,
    )


class ConversationParticipant(Base):
    __tablename__ = "conversation_participants"

    conversation_id: Mapped[uuid.UUID] = fk("conversations.id", ondelete="CASCADE", primary_key=True)
    user_id: Mapped[uuid.UUID] = fk("users.id", ondelete="CASCADE", primary_key=True)
    last_read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    conversation: Mapped[Conversation] = relationship(
        "Conversation", back_populates="participants", lazy="raise"
    )


class Message(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "messages"
    __table_args__ = (sa.Index("ix_messages_conversation_id_created_at", "conversation_id", "created_at"),)

    conversation_id: Mapped[uuid.UUID] = fk("conversations.id", ondelete="CASCADE")
    sender_user_id: Mapped[uuid.UUID | None] = fk("users.id", ondelete="SET NULL", nullable=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    attachment_document_ids: Mapped[list[uuid.UUID]] = uuid_array_col()
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    conversation: Mapped[Conversation] = relationship("Conversation", back_populates="messages", lazy="raise")


class Notification(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "notifications"
    __table_args__ = (
        sa.Index("ix_notifications_user_id_created_at", "user_id", "created_at"),
        sa.Index("ix_notifications_user_id_unread", "user_id", postgresql_where=sa.text("read_at IS NULL")),
    )

    user_id: Mapped[uuid.UUID] = fk("users.id", ondelete="CASCADE")
    kind: Mapped[str] = mapped_column(String(80), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str | None] = mapped_column(Text)
    data: Mapped[dict[str, Any]] = json_obj_col()
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
