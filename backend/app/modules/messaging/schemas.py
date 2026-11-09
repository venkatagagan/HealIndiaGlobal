"""Pydantic schemas for conversations, messages and notifications (PLAN 8.9)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.enums import ConversationKind, UserRole

MAX_MESSAGE_LENGTH = 5000
MAX_ATTACHMENTS = 10
MAX_EXTRA_PARTICIPANTS = 20


class _In(BaseModel):
    model_config = ConfigDict(extra="forbid")


class UserRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str
    role: UserRole


class ParticipantOut(BaseModel):
    user_id: uuid.UUID
    full_name: str
    role: UserRole
    last_read_at: datetime | None = None


class MessageOut(BaseModel):
    id: uuid.UUID
    conversation_id: uuid.UUID
    sender: UserRef | None
    body: str
    attachment_document_ids: list[uuid.UUID]
    created_at: datetime
    edited_at: datetime | None = None


class ConversationOut(BaseModel):
    id: uuid.UUID
    kind: ConversationKind
    case_id: uuid.UUID | None
    case_number: str | None = None
    subject: str | None
    participants: list[ParticipantOut]
    last_message: MessageOut | None
    unread_count: int
    last_message_at: datetime | None
    created_at: datetime


class ConversationCreate(_In):
    case_id: uuid.UUID | None = None
    subject: str | None = Field(default=None, max_length=255)
    participant_user_ids: list[uuid.UUID] = Field(default_factory=list, max_length=MAX_EXTRA_PARTICIPANTS)

    @field_validator("subject")
    @classmethod
    def _strip_subject(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None


class MessageCreate(_In):
    body: str = Field(max_length=MAX_MESSAGE_LENGTH)
    attachment_document_ids: list[uuid.UUID] = Field(default_factory=list, max_length=MAX_ATTACHMENTS)

    @field_validator("body")
    @classmethod
    def _strip_body(cls, value: str) -> str:
        return value.strip()


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    kind: str
    title: str
    body: str | None
    data: dict[str, Any] = Field(default_factory=dict)
    read_at: datetime | None
    created_at: datetime


class UnreadCountOut(BaseModel):
    count: int


class ReadAllOut(BaseModel):
    updated: int
