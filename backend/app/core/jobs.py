"""Transactional-outbox job queue on PostgreSQL (``background_jobs``, ``FOR UPDATE SKIP LOCKED``).

Register tasks in ``app/modules/<x>/tasks.py`` (imported at startup by ``load_module_hooks``)::

    from app.core.jobs import task, periodic, enqueue, PermanentJobError

    @task("screening.run_ai")
    async def run_ai(db: AsyncSession, payload: dict) -> None:
        ...                                   # db is a fresh session; it is committed after the task returns

    @periodic("settlements.mark_eligible", every_seconds=3600)
    async def mark_eligible(db: AsyncSession, payload: dict) -> None: ...

    # inside a service, in the SAME transaction as the business change (committed by the caller):
    await enqueue(db, "screening.run_ai", {"screening_id": str(screening.id)},
                  dedupe_key=f"ai:{screening.id}")

Semantics
* At-least-once delivery: tasks must be idempotent.
* A task that raises is retried with exponential backoff ``30 s * 2**(attempt-1)`` (capped at 6 h) until
  ``max_attempts`` is reached, then the job becomes ``dead``. Raise ``PermanentJobError`` to fail at once
  (status ``failed``).
* ``dedupe_key``: while a job with the same key is ``queued``/``running`` a second ``enqueue`` is skipped
  (returns ``None``).
* Tests call ``await run_pending_jobs()`` (the ``run_jobs`` fixture) to drain everything due now, including
  jobs enqueued by other jobs.
"""

from __future__ import annotations

import asyncio
import os
import socket
import traceback
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import structlog
from fastapi.encoders import jsonable_encoder
from sqlalchemy import and_, delete, exists, literal, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import db as db_module
from app.core.config import settings
from app.core.enums import JobStatus
from app.core.ids import uuid7

logger = structlog.get_logger(__name__)

TaskFn = Callable[[AsyncSession, dict[str, Any]], Awaitable[Any]]

BACKOFF_BASE_SECONDS = 30
BACKOFF_MAX_SECONDS = 6 * 3600
DEFAULT_TASK_TIMEOUT_SECONDS = 900
STALE_LOCK_SECONDS = 1800
MAX_ERROR_LENGTH = 4000


class PermanentJobError(Exception):
    """Raise from a task to mark the job ``failed`` without retrying."""


@dataclass(frozen=True, slots=True)
class TaskSpec:
    name: str
    fn: TaskFn
    timeout_seconds: float


@dataclass(frozen=True, slots=True)
class PeriodicSpec:
    name: str
    every_seconds: int
    fn: TaskFn


_tasks: dict[str, TaskSpec] = {}
_periodic: dict[str, PeriodicSpec] = {}
_last_bucket: dict[str, int] = {}


# ----------------------------------------------------------------------------------------- registration
def _register(name: str, fn: TaskFn, timeout_seconds: float) -> None:
    existing = _tasks.get(name)
    if existing is not None and (existing.fn.__module__, existing.fn.__qualname__) != (
        fn.__module__,
        fn.__qualname__,
    ):
        raise ValueError(f"Task {name!r} is already registered by {existing.fn.__module__}")
    _tasks[name] = TaskSpec(name=name, fn=fn, timeout_seconds=timeout_seconds)


def task(name: str, *, timeout_seconds: float = DEFAULT_TASK_TIMEOUT_SECONDS) -> Callable[[TaskFn], TaskFn]:
    """Register ``async def fn(db, payload)`` as the handler for jobs named ``name``."""

    def decorator(fn: TaskFn) -> TaskFn:
        _register(name, fn, timeout_seconds)
        return fn

    return decorator


def periodic(
    name: str, every_seconds: int, *, timeout_seconds: float = DEFAULT_TASK_TIMEOUT_SECONDS
) -> Callable[[TaskFn], TaskFn]:
    """Register a task that the worker enqueues once per ``every_seconds`` time bucket (payload ``{}``)."""
    if every_seconds < 1:
        raise ValueError("every_seconds must be >= 1")

    def decorator(fn: TaskFn) -> TaskFn:
        _register(name, fn, timeout_seconds)
        _periodic[name] = PeriodicSpec(name=name, every_seconds=int(every_seconds), fn=fn)
        return fn

    return decorator


def list_tasks() -> dict[str, TaskSpec]:
    return dict(_tasks)


def list_periodic() -> dict[str, PeriodicSpec]:
    return dict(_periodic)


def _job_model() -> Any:
    from app.models.jobs import BackgroundJob

    return BackgroundJob


def _utcnow() -> datetime:
    return datetime.now(UTC)


# ----------------------------------------------------------------------------------------- enqueue
async def enqueue(
    db: AsyncSession,
    name: str,
    payload: dict[str, Any] | None = None,
    run_at: datetime | None = None,
    dedupe_key: str | None = None,
    max_attempts: int = 5,
) -> uuid.UUID | None:
    """Insert a job in the caller's transaction (the caller commits). Returns the job id, or ``None`` when a
    queued/running job with the same ``dedupe_key`` already exists."""
    if name not in _tasks:
        logger.warning("jobs.enqueue_unknown_task", task=name)
    if max_attempts < 1:
        raise ValueError("max_attempts must be >= 1")
    job = _job_model()
    when = run_at or _utcnow()
    if when.tzinfo is None:
        when = when.replace(tzinfo=UTC)
    job_id = uuid7()
    stmt = (
        pg_insert(job)
        .values(
            id=job_id,
            task_name=name,
            payload=jsonable_encoder(payload or {}),
            status=JobStatus.QUEUED,
            attempts=0,
            max_attempts=max_attempts,
            run_at=when,
            dedupe_key=dedupe_key,
        )
        .on_conflict_do_nothing()
        .returning(job.id)
    )
    result = await db.execute(stmt)
    inserted = result.scalar_one_or_none()
    if inserted is None:
        logger.debug("jobs.enqueue_deduplicated", task=name, dedupe_key=dedupe_key)
    return inserted


async def _enqueue_periodic_if_absent(db: AsyncSession, spec: PeriodicSpec, bucket: int) -> bool:
    """Insert the periodic job for ``bucket`` unless one with that dedupe key exists in any state."""
    job = _job_model()
    key = f"periodic:{spec.name}:{bucket}"
    now = _utcnow()
    select_values = select(
        literal(uuid7()),
        literal(spec.name),
        literal({}, type_=job.__table__.c.payload.type),
        literal(JobStatus.QUEUED.value),
        literal(0),
        literal(3),
        literal(now, type_=job.__table__.c.run_at.type),
        literal(key),
    ).where(~exists().where(job.dedupe_key == key))
    stmt = (
        pg_insert(job)
        .from_select(
            ["id", "task_name", "payload", "status", "attempts", "max_attempts", "run_at", "dedupe_key"],
            select_values,
        )
        .on_conflict_do_nothing()
        .returning(job.id)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none() is not None


async def schedule_periodic(now: datetime | None = None) -> int:
    """Enqueue every periodic task whose current time bucket has not been enqueued yet. Returns the count."""
    if not _periodic:
        return 0
    ts = (now or _utcnow()).timestamp()
    due = [
        (spec, int(ts // spec.every_seconds))
        for spec in _periodic.values()
        if _last_bucket.get(spec.name) != int(ts // spec.every_seconds)
    ]
    if not due:
        return 0
    created = 0
    async with db_module.SessionLocal() as session:
        for spec, bucket in due:
            if await _enqueue_periodic_if_absent(session, spec, bucket):
                created += 1
        await session.commit()
    for spec, bucket in due:
        _last_bucket[spec.name] = bucket
    return created


# ----------------------------------------------------------------------------------------- execution
@dataclass(frozen=True, slots=True)
class ClaimedJob:
    id: uuid.UUID
    task_name: str
    payload: dict[str, Any]
    attempts: int
    max_attempts: int


async def _claim(worker_id: str, now: datetime) -> ClaimedJob | None:
    job = _job_model()
    candidate = (
        select(job.id)
        .where(job.status == JobStatus.QUEUED, job.run_at <= now)
        .order_by(job.run_at, job.id)
        .limit(1)
        .with_for_update(skip_locked=True)
        .scalar_subquery()
    )
    stmt = (
        update(job)
        .where(job.id == candidate)
        .values(
            status=JobStatus.RUNNING,
            locked_at=now,
            locked_by=worker_id,
            attempts=job.attempts + 1,
        )
        .returning(job.id, job.task_name, job.payload, job.attempts, job.max_attempts)
        .execution_options(synchronize_session=False)
    )
    async with db_module.SessionLocal() as session:
        row = (await session.execute(stmt)).first()
        await session.commit()
    if row is None:
        return None
    return ClaimedJob(
        id=row[0],
        task_name=row[1],
        payload=dict(row[2] or {}),
        attempts=int(row[3]),
        max_attempts=int(row[4]),
    )


def backoff_seconds(attempts: int) -> int:
    return int(min(BACKOFF_MAX_SECONDS, BACKOFF_BASE_SECONDS * (2 ** max(0, attempts - 1))))


async def _mark_failure(claimed: ClaimedJob, error: str, *, permanent: bool) -> JobStatus:
    job = _job_model()
    now = _utcnow()
    values: dict[str, Any] = {"last_error": error[:MAX_ERROR_LENGTH], "locked_at": None, "locked_by": None}
    if permanent:
        status = JobStatus.FAILED
        values.update(status=status, finished_at=now)
    elif claimed.attempts >= claimed.max_attempts:
        status = JobStatus.DEAD
        values.update(status=status, finished_at=now)
    else:
        status = JobStatus.QUEUED
        values.update(status=status, run_at=now + timedelta(seconds=backoff_seconds(claimed.attempts)))
    async with db_module.SessionLocal() as session:
        await session.execute(
            update(job)
            .where(job.id == claimed.id)
            .values(**values)
            .execution_options(synchronize_session=False)
        )
        await session.commit()
    return status


async def _execute(claimed: ClaimedJob) -> JobStatus:
    job = _job_model()
    log = logger.bind(job_id=str(claimed.id), task=claimed.task_name, attempt=claimed.attempts)
    spec = _tasks.get(claimed.task_name)
    if spec is None:
        log.error("jobs.unknown_task")
        return await _mark_failure(claimed, f"Unknown task {claimed.task_name!r}", permanent=True)
    structlog.contextvars.bind_contextvars(job_id=str(claimed.id), task=claimed.task_name)
    started = asyncio.get_running_loop().time()
    try:
        async with db_module.SessionLocal() as session:
            try:
                await asyncio.wait_for(spec.fn(session, dict(claimed.payload)), timeout=spec.timeout_seconds)
                await session.execute(
                    update(job)
                    .where(job.id == claimed.id)
                    .values(
                        status=JobStatus.SUCCEEDED,
                        finished_at=_utcnow(),
                        locked_at=None,
                        locked_by=None,
                        last_error=None,
                    )
                    .execution_options(synchronize_session=False)
                )
                await session.commit()
            except BaseException:
                await session.rollback()
                raise
    except asyncio.CancelledError:
        await _mark_failure(claimed, "Cancelled (worker shutdown)", permanent=False)
        raise
    except PermanentJobError as exc:
        log.warning("jobs.failed_permanently", error=str(exc))
        return await _mark_failure(claimed, f"PermanentJobError: {exc}", permanent=True)
    except Exception as exc:
        tb = traceback.format_exc(limit=8)
        status = await _mark_failure(claimed, f"{type(exc).__name__}: {exc}\n{tb}", permanent=False)
        if status == JobStatus.DEAD:
            log.error("jobs.dead", error=str(exc), exc_type=type(exc).__name__)
        else:
            log.warning("jobs.retry_scheduled", error=str(exc), exc_type=type(exc).__name__)
        return status
    finally:
        structlog.contextvars.unbind_contextvars("job_id", "task")
    duration_ms = round((asyncio.get_running_loop().time() - started) * 1000, 1)
    log.info("jobs.succeeded", duration_ms=duration_ms)
    return JobStatus.SUCCEEDED


async def run_one(worker_id: str | None = None, now: datetime | None = None) -> JobStatus | None:
    """Claim and execute a single due job. Returns its resulting status, or ``None`` if nothing was due."""
    claimed = await _claim(worker_id or _default_worker_id(), now or _utcnow())
    if claimed is None:
        return None
    return await _execute(claimed)


async def run_pending_jobs(max_jobs: int = 100, *, now: datetime | None = None) -> int:
    """Process every job due now (including jobs enqueued by the jobs themselves), up to ``max_jobs``.
    Returns the number of jobs processed (whatever their outcome). Used by tests and scripts."""
    processed = 0
    worker_id = f"inline:{os.getpid()}"
    while processed < max_jobs:
        status = await run_one(worker_id, now or _utcnow())
        if status is None:
            break
        processed += 1
    return processed


async def requeue_stale_jobs(stale_after_seconds: int = STALE_LOCK_SECONDS) -> int:
    """Return jobs stuck in ``running`` (crashed worker) to the queue, or mark them dead when out of
    attempts."""
    job = _job_model()
    cutoff = _utcnow() - timedelta(seconds=stale_after_seconds)
    async with db_module.SessionLocal() as session:
        dead = await session.execute(
            update(job)
            .where(job.status == JobStatus.RUNNING, job.locked_at < cutoff, job.attempts >= job.max_attempts)
            .values(status=JobStatus.DEAD, finished_at=_utcnow(), last_error="Lock expired (worker lost)")
            .execution_options(synchronize_session=False)
        )
        requeued = await session.execute(
            update(job)
            .where(job.status == JobStatus.RUNNING, job.locked_at < cutoff)
            .values(
                status=JobStatus.QUEUED,
                locked_at=None,
                locked_by=None,
                last_error="Lock expired (worker lost)",
            )
            .execution_options(synchronize_session=False)
        )
        await session.commit()
    count = int(getattr(dead, "rowcount", 0) or 0) + int(getattr(requeued, "rowcount", 0) or 0)
    if count:
        logger.warning("jobs.stale_requeued", count=count)
    return count


@periodic("jobs.cleanup", every_seconds=86_400)
async def cleanup_finished_jobs(db: AsyncSession, payload: dict[str, Any]) -> None:
    """Delete succeeded jobs older than 14 days and failed/dead jobs older than 90 days."""
    job = _job_model()
    now = _utcnow()
    await db.execute(
        delete(job).where(and_(job.status == JobStatus.SUCCEEDED, job.finished_at < now - timedelta(days=14)))
    )
    await db.execute(
        delete(job).where(
            and_(
                job.status.in_([JobStatus.FAILED, JobStatus.DEAD]), job.finished_at < now - timedelta(days=90)
            )
        )
    )


def _short_error(exc: BaseException) -> str:
    """First line of an exception message (SQLAlchemy errors embed the full SQL statement)."""
    text = str(getattr(exc, "orig", None) or exc)
    return (text.splitlines()[0] if text else type(exc).__name__)[:300]


def _default_worker_id() -> str:
    return f"{socket.gethostname()}:{os.getpid()}:{uuid.uuid4().hex[:6]}"


# ----------------------------------------------------------------------------------------- worker loop
async def run_worker(
    stop_event: asyncio.Event | None = None,
    *,
    concurrency: int = 2,
    poll_interval: float | None = None,
) -> None:
    """Run until ``stop_event`` is set: claim/execute jobs, enqueue due periodic tasks, requeue stale locks.

    Windows-compatible (no signal handlers here - the caller decides how to set ``stop_event``)."""
    stop = stop_event or asyncio.Event()
    interval = poll_interval if poll_interval is not None else settings.WORKER_POLL_INTERVAL_SECONDS
    worker_base = _default_worker_id()
    logger.info("worker.started", worker=worker_base, concurrency=concurrency, tasks=sorted(_tasks))

    async def _sleep(seconds: float) -> None:
        try:
            await asyncio.wait_for(stop.wait(), timeout=seconds)
        except TimeoutError:
            pass

    async def consumer(index: int) -> None:
        worker_id = f"{worker_base}#{index}"
        while not stop.is_set():
            try:
                status = await run_one(worker_id)
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # DB down etc. - keep the loop alive
                logger.warning("worker.loop_error", error=_short_error(exc), exc_type=type(exc).__name__)
                await _sleep(max(interval, 5.0))
                continue
            if status is None:
                await _sleep(interval)

    async def scheduler() -> None:
        last_reap = 0.0
        loop = asyncio.get_running_loop()
        while not stop.is_set():
            try:
                await schedule_periodic()
                if loop.time() - last_reap > 60:
                    await requeue_stale_jobs()
                    last_reap = loop.time()
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning("worker.scheduler_error", error=_short_error(exc), exc_type=type(exc).__name__)
                await _sleep(max(interval, 15.0))
                continue
            await _sleep(max(1.0, interval))

    workers = [asyncio.create_task(consumer(i), name=f"job-consumer-{i}") for i in range(max(1, concurrency))]
    workers.append(asyncio.create_task(scheduler(), name="job-scheduler"))
    try:
        await stop.wait()
    finally:
        # Give running jobs a moment to finish, then cancel.
        done, pending = await asyncio.wait(workers, timeout=10)
        for t in pending:
            t.cancel()
        await asyncio.gather(*pending, return_exceptions=True)
        logger.info("worker.stopped", worker=worker_base)


def reset_periodic_state() -> None:
    """Forget which periodic buckets were enqueued (tests)."""
    _last_bucket.clear()
