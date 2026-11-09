"""On-demand revalidation of the public website (Next.js ISR) when catalogue data changes.

Contract with the website (``website/src/app/api/revalidate``, ``website/README.md``)::

    POST ${WEBSITE_REVALIDATE_URL}             default http://localhost:3000/api/revalidate (internal URL:
                                               on the public domain /api/ is routed to this backend)
    Authorization: Bearer ${REVALIDATE_SECRET} the same value (>= 32 characters) on both sides
    Content-Type: application/json
    {"tags": ["hospital:<slug>", "doctor:<slug>", "procedure:<slug>", "specialty:<slug>", "catalog"]}

At most 100 tags and 16 KB per body (more -> just ``catalog``); slugs must be lowercase letters, digits and
hyphens (others are dropped; ``catalog`` still covers them).

How changes are detected: SQLAlchemy session events, so every write path (admin catalog CRUD, hospital
approve/suspend/reject, hospital-portal profile/doctor/procedure/package edits, doctor registration
verification, rating refreshes) is covered without each service having to remember a call.

* ``after_flush`` records which tracked rows (hospital, doctor, procedure, specialty, cost benchmark, hospital
  procedure, treatment package) were inserted, changed or deleted, in ``session.info``.
* ``before_commit`` writes ONE ``catalog.revalidate_website`` background job into the same transaction
  (transactional outbox: no commit, no job; rollback discards the pending set). Slugs that are not on the
  changed row itself (e.g. the hospital of a package) are resolved by the job.
* The job (``app/modules/catalog/tasks.py``) POSTs the tags; transport errors, 408/425/429 and 5xx are retried
  by the job system with exponential backoff, other 4xx fail permanently. The secret is never logged or stored
  in the job payload.

Website & contact settings (``app/core/site_settings.py``) send the tag ``site`` (alone, without ``catalog``):
``request_site_revalidation`` is called by the admin settings service before it commits.

Disabled (nothing is recorded or enqueued) while ``WEBSITE_REVALIDATE_URL`` or ``REVALIDATE_SECRET`` is empty.
"""

from __future__ import annotations

import hashlib
import json
import re
import uuid
from collections.abc import Iterable
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import structlog
from sqlalchemy import event, inspect, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session, SessionTransaction, UOWTransaction

from app.core.enums import HospitalStatus, JobStatus
from app.core.ids import uuid7
from app.core.jobs import PermanentJobError
from app.models import (
    CostBenchmark,
    Doctor,
    Hospital,
    HospitalProcedure,
    Procedure,
    Specialty,
    TreatmentPackage,
)
from app.modules.catalog.settings import catalog_settings

logger = structlog.get_logger(__name__)

TASK_NAME = "catalog.revalidate_website"
CATALOG_TAG = "catalog"
# Website & contact settings (app/core/site_settings.py): every page's layout reads them with this fetch tag.
SITE_TAG = "site"
MAX_TAGS = 100  # the website's limit; above it a single "catalog" tag is sent (e.g. a bulk import)
MAX_BODY_BYTES = 15_000  # the website refuses bodies over 16 KB
_SLUG_TAG = re.compile(r"^(hospital|doctor|procedure|specialty):[a-z0-9-]{1,160}$")
MAX_ATTEMPTS = 6  # 30 s, 1, 2, 4, 8 min backoff between attempts (app.core.jobs)
# Small delay so the job runs after the committing request has cleared the API's own catalogue cache.
DELAY_SECONDS = 3
RETRYABLE_STATUS = {408, 425, 429}

_INFO_KEY = "hig_catalog_revalidate"
_TRACKED = (Hospital, Doctor, Procedure, Specialty, CostBenchmark, HospitalProcedure, TreatmentPackage)

# Tests replace this with ``httpx.MockTransport``.
HTTP_TRANSPORT: httpx.AsyncBaseTransport | None = None


# ----------------------------------------------------------------------------------------- change capture
def _new_pending() -> dict[str, set[str]]:
    return {"tags": set(), "hospital_ids": set(), "procedure_ids": set(), "hospital_procedure_ids": set()}


def _values(obj: Any, attr: str) -> list[Any]:
    """Current value plus any value replaced in this flush, without triggering a lazy load."""
    state = inspect(obj)
    out: list[Any] = []
    current = state.dict.get(attr)
    if current is not None:
        out.append(current)
    history = state.attrs[attr].history
    out.extend(v for v in (history.deleted or ()) if v is not None)
    return out


def _record(obj: Any, kind: str, pending: dict[str, set[str]]) -> None:
    if isinstance(obj, Hospital):
        statuses = {str(s) for s in _values(obj, "status")}
        # Draft / pending hospitals have no public page; record only what is or was public.
        if kind != "deleted" and HospitalStatus.ACTIVE.value not in statuses:
            return
        pending["tags"].update(f"hospital:{slug}" for slug in _values(obj, "slug"))
    elif isinstance(obj, Doctor):
        pending["tags"].update(f"doctor:{slug}" for slug in _values(obj, "slug"))
        pending["hospital_ids"].update(str(v) for v in _values(obj, "hospital_id"))
    elif isinstance(obj, Procedure):
        pending["tags"].update(f"procedure:{slug}" for slug in _values(obj, "slug"))
    elif isinstance(obj, Specialty):
        pending["tags"].update(f"specialty:{slug}" for slug in _values(obj, "slug"))
    elif isinstance(obj, CostBenchmark):
        pending["procedure_ids"].update(str(v) for v in _values(obj, "procedure_id"))
    elif isinstance(obj, HospitalProcedure):
        pending["hospital_ids"].update(str(v) for v in _values(obj, "hospital_id"))
        pending["procedure_ids"].update(str(v) for v in _values(obj, "procedure_id"))
    elif isinstance(obj, TreatmentPackage):
        pending["hospital_procedure_ids"].update(str(v) for v in _values(obj, "hospital_procedure_id"))
    pending["tags"].add(CATALOG_TAG)


def _after_flush(session: Session, flush_context: UOWTransaction) -> None:
    if not catalog_settings.revalidation_enabled:
        return
    changed: list[tuple[Any, str]] = [(o, "new") for o in session.new if isinstance(o, _TRACKED)]
    changed += [
        (o, "dirty")
        for o in session.dirty
        if isinstance(o, _TRACKED) and session.is_modified(o, include_collections=False)
    ]
    changed += [(o, "deleted") for o in session.deleted if isinstance(o, _TRACKED)]
    if not changed:
        return
    pending = session.info.setdefault(_INFO_KEY, _new_pending())
    for obj, kind in changed:
        try:
            _record(obj, kind, pending)
        except Exception as exc:  # never break the business transaction over a cache hint
            logger.warning("catalog.revalidate_capture_failed", entity=type(obj).__name__, error=str(exc))


def request_site_revalidation(db: AsyncSession) -> None:
    """Ask for a ``site`` tag revalidation when the current transaction commits (website & contact settings).

    Same outbox path as catalogue changes: the job is written by ``before_commit`` (nothing on rollback)."""
    if not catalog_settings.revalidation_enabled:
        return
    pending = db.sync_session.info.setdefault(_INFO_KEY, _new_pending())
    pending["tags"].add(SITE_TAG)


def build_payload(pending: dict[str, set[str]]) -> dict[str, list[str]]:
    return {key: sorted(values) for key, values in pending.items() if values}


def _before_commit(session: Session) -> None:
    if not catalog_settings.revalidation_enabled:
        session.info.pop(_INFO_KEY, None)
        return
    if session.new or session.dirty or session.deleted:
        session.flush()  # capture changes that are still pending (the commit would flush them next)
    pending = session.info.pop(_INFO_KEY, None)
    if not pending:
        return
    payload = build_payload(pending)
    if not payload:
        return
    from app.models.jobs import BackgroundJob

    digest = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()[:40]
    stmt = (
        pg_insert(BackgroundJob)
        .values(
            id=uuid7(),
            task_name=TASK_NAME,
            payload=payload,
            status=JobStatus.QUEUED,
            attempts=0,
            max_attempts=MAX_ATTEMPTS,
            run_at=datetime.now(UTC) + timedelta(seconds=DELAY_SECONDS),
            dedupe_key=f"{TASK_NAME}:{digest}",
        )
        .on_conflict_do_nothing()
    )
    session.execute(stmt)


def _after_soft_rollback(session: Session, previous_transaction: SessionTransaction) -> None:
    if not previous_transaction.nested:
        session.info.pop(_INFO_KEY, None)


def install_listeners() -> None:
    """Attach the session listeners (idempotent). Called when ``app.modules.catalog.tasks`` is imported."""
    for name, fn in (
        ("after_flush", _after_flush),
        ("before_commit", _before_commit),
        ("after_soft_rollback", _after_soft_rollback),
    ):
        if not event.contains(Session, name, fn):
            event.listen(Session, name, fn)


# ----------------------------------------------------------------------------------------- job side
def _uuids(values: Iterable[str]) -> list[uuid.UUID]:
    out: list[uuid.UUID] = []
    for v in values:
        try:
            out.append(uuid.UUID(str(v)))
        except ValueError:
            continue
    return out


async def resolve_tags(db: AsyncSession, payload: dict[str, Any]) -> list[str]:
    """Turn the job payload into the final tag list (slugs looked up for ids recorded at flush time)."""
    tags: set[str] = {str(t) for t in payload.get("tags") or []}
    hospital_ids = set(_uuids(payload.get("hospital_ids") or []))
    procedure_ids = set(_uuids(payload.get("procedure_ids") or []))
    hp_ids = _uuids(payload.get("hospital_procedure_ids") or [])
    if hp_ids:
        rows = await db.execute(
            select(HospitalProcedure.hospital_id, HospitalProcedure.procedure_id).where(
                HospitalProcedure.id.in_(hp_ids)
            )
        )
        for hospital_id, procedure_id in rows.all():
            hospital_ids.add(hospital_id)
            procedure_ids.add(procedure_id)
    if hospital_ids:
        rows = await db.execute(
            select(Hospital.slug).where(
                Hospital.id.in_(hospital_ids), Hospital.status == HospitalStatus.ACTIVE
            )
        )
        tags.update(f"hospital:{slug}" for slug in rows.scalars())
    if procedure_ids:
        rows = await db.execute(select(Procedure.slug).where(Procedure.id.in_(procedure_ids)))
        tags.update(f"procedure:{slug}" for slug in rows.scalars())
    site = SITE_TAG in tags
    explicit_catalog = CATALOG_TAG in tags
    tags = {t for t in tags if _SLUG_TAG.match(t)}
    # A settings-only change ("site") does not need the whole catalogue re-fetched.
    if tags or explicit_catalog or not site:
        tags.add(CATALOG_TAG)
    ordered = sorted(tags, key=lambda t: (t == CATALOG_TAG, t))
    if len(ordered) > MAX_TAGS or len(json.dumps({"tags": ordered})) > MAX_BODY_BYTES:
        ordered = [CATALOG_TAG]
    return [*ordered, SITE_TAG] if site else ordered


async def post_revalidate(tags: list[str]) -> int:
    """POST the tags to the website. Returns the HTTP status; raises to make the job system retry, or
    ``PermanentJobError`` for responses that a retry cannot fix (bad secret, missing route, bad request)."""
    url = catalog_settings.WEBSITE_REVALIDATE_URL.strip()
    secret = catalog_settings.REVALIDATE_SECRET.strip()
    if not (url and secret):
        return 0
    try:
        async with httpx.AsyncClient(
            timeout=catalog_settings.REVALIDATE_TIMEOUT_SECONDS, transport=HTTP_TRANSPORT
        ) as client:
            response = await client.post(
                url, json={"tags": tags}, headers={"Authorization": f"Bearer {secret}"}
            )
    except httpx.HTTPError as exc:
        # Message names the exception type only: never the request (headers carry the secret).
        logger.warning("catalog.revalidate_unreachable", error_type=type(exc).__name__, tags=len(tags))
        raise RuntimeError(f"website revalidation endpoint unreachable ({type(exc).__name__})") from None
    status = response.status_code
    if status < 300:
        logger.info("catalog.revalidated", status=status, tags=len(tags))
        return status
    if status >= 500 or status in RETRYABLE_STATUS:
        logger.warning("catalog.revalidate_retry", status=status, tags=len(tags))
        raise RuntimeError(f"website revalidation returned HTTP {status}")
    logger.error("catalog.revalidate_rejected", status=status, tags=len(tags))
    raise PermanentJobError(f"website revalidation rejected with HTTP {status}")
