"""Uploaded documents (PLAN 4.9). Files live in object storage under ``storage_key``."""

from __future__ import annotations

import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import BigInteger, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import DocumentKind, DocumentStatus, sa_enum
from app.models.base import Base, TimestampMixin, UUIDPkMixin, fk

__all__ = ["Document"]


class Document(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "documents"
    __table_args__ = (
        sa.CheckConstraint("size_bytes >= 0", name="size_nonneg"),
        sa.Index("ix_documents_case_id_kind", "case_id", "kind"),
    )

    owner_user_id: Mapped[uuid.UUID] = fk("users.id", ondelete="CASCADE")
    patient_id: Mapped[uuid.UUID | None] = fk("patient_profiles.id", ondelete="SET NULL", nullable=True)
    case_id: Mapped[uuid.UUID | None] = fk("cases.id", ondelete="SET NULL", nullable=True)
    hospital_id: Mapped[uuid.UUID | None] = fk("hospitals.id", ondelete="SET NULL", nullable=True)
    agent_id: Mapped[uuid.UUID | None] = fk("agents.id", ondelete="SET NULL", nullable=True)
    kind: Mapped[DocumentKind] = mapped_column(sa_enum(DocumentKind), nullable=False, index=True)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    storage_key: Mapped[str] = mapped_column(String(512), nullable=False, unique=True)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    status: Mapped[DocumentStatus] = mapped_column(
        sa_enum(DocumentStatus),
        nullable=False,
        default=DocumentStatus.UPLOADED,
        server_default="uploaded",
        index=True,
    )
    verified_by: Mapped[uuid.UUID | None] = fk("users.id", ondelete="SET NULL", nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
