"""Pydantic schemas for conversations, messages and notifications (PLAN 8.9)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.core.enums import (
    ConversationKind,
    DevicePlatform,
    EnquiryStatus,
    ModerationAction,
    ReportReason,
    ReportStatus,
    ReportTargetType,
    UserRole,
    UserStatus,
)

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
    # True only in the views that may still see a moderated message (its sender and staff).
    hidden: bool = False


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


# -------------------------------------------------------------------------------------------- push devices
class DeviceRegisterIn(_In):
    platform: DevicePlatform
    token: str = Field(min_length=8, max_length=512)
    app_version: str | None = Field(default=None, max_length=32)


# ---------------------------------------------------------------------------------- content reports (CG-16)
class ReportCreate(_In):
    target_type: ReportTargetType
    target_id: uuid.UUID
    reason: ReportReason
    note: str | None = Field(default=None, max_length=1000)

    @field_validator("note")
    @classmethod
    def _strip_note(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None


class ReportOut(BaseModel):
    id: uuid.UUID
    target_type: ReportTargetType
    target_id: uuid.UUID
    reason: ReportReason
    note: str | None
    status: ReportStatus
    created_at: datetime


class ModerationUserRef(BaseModel):
    id: uuid.UUID
    full_name: str
    role: UserRole
    status: UserStatus | None = None


class AdminReportOut(ReportOut):
    reporter: ModerationUserRef | None = None
    target_user: ModerationUserRef | None = None
    excerpt: str | None = None
    conversation_id: uuid.UUID | None = None
    message_hidden: bool = False
    report_count: int = 1
    resolved_at: datetime | None = None
    resolved_by: ModerationUserRef | None = None
    action: ModerationAction | None = None
    resolution_note: str | None = None


class ReportResolveIn(_In):
    action: ModerationAction
    note: str | None = Field(default=None, max_length=1000)


# ------------------------------------------------------------------------------------- website enquiries
class EnquiryCreate(BaseModel):
    # Unknown fields from the public form are ignored rather than rejected.
    model_config = ConfigDict(extra="ignore")

    name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    phone: str | None = Field(default=None, max_length=32)
    country: str | None = Field(default=None, max_length=100)
    topic: str | None = Field(default=None, max_length=40)
    message: str = Field(min_length=1, max_length=4000)
    # Honeypot: a hidden field people never see; bots fill it in.
    website: str | None = Field(default=None, max_length=500)

    @field_validator("name", "message")
    @classmethod
    def _required(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value

    @field_validator("phone", "country", "topic")
    @classmethod
    def _optional(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None


class EnquiryAccepted(BaseModel):
    status: str = "received"


class EnquiryOut(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    phone: str | None
    country: str | None
    topic: str | None
    message: str
    status: EnquiryStatus
    created_at: datetime
    handled_by: ModerationUserRef | None = None
    handled_at: datetime | None = None


class EnquiryUpdate(_In):
    status: EnquiryStatus
