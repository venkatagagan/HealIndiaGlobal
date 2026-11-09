"""Transactional-outbox job queue (PLAN 4.14), consumed with ``FOR UPDATE SKIP LOCKED`` by app.core.jobs."""

from __future__ import annotations

from datetime import datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import JobStatus, sa_enum
from app.models.base import Base, TimestampMixin, UUIDPkMixin, json_obj_col

__all__ = ["BackgroundJob"]


class BackgroundJob(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "background_jobs"
    __table_args__ = (
        sa.Index("ix_background_jobs_status_run_at", "status", "run_at"),
        # Only one live (queued/running) job per dedupe_key; finished jobs don't block re-enqueueing.
        sa.Index(
            "uq_background_jobs_dedupe_key_active",
            "dedupe_key",
            unique=True,
            postgresql_where=sa.text("dedupe_key IS NOT NULL AND status IN ('queued', 'running')"),
        ),
        sa.CheckConstraint("attempts >= 0 AND max_attempts >= 1", name="attempts_valid"),
    )

    task_name: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    payload: Mapped[dict[str, Any]] = json_obj_col()
    status: Mapped[JobStatus] = mapped_column(
        sa_enum(JobStatus), nullable=False, default=JobStatus.QUEUED, server_default="queued"
    )
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    max_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=5, server_default="5")
    run_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    locked_by: Mapped[str | None] = mapped_column(String(120))
    last_error: Mapped[str | None] = mapped_column(Text)
    dedupe_key: Mapped[str | None] = mapped_column(String(255))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
