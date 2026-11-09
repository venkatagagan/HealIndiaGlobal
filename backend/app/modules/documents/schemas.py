"""Pydantic schemas for the documents module (PLAN 8.3)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import DocumentKind, DocumentStatus


class DocumentOut(BaseModel):
    id: uuid.UUID
    kind: DocumentKind
    file_name: str
    content_type: str
    size_bytes: int
    status: DocumentStatus
    case_id: uuid.UUID | None
    patient_id: uuid.UUID | None
    hospital_id: uuid.UUID | None
    agent_id: uuid.UUID | None
    owner_user_id: uuid.UUID
    uploaded_by_name: str | None
    verified_at: datetime | None
    created_at: datetime


class DocumentVerifyIn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    status: Literal["verified", "rejected"]
    note: str | None = Field(default=None, max_length=1000)
