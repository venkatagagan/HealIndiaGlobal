"""Agent CRM business logic (docs/AGENT_CRM.md).

Scoping: a lead belongs to an agency (``agent_id``); every member of the agency sees the agency's leads. Today
an agency has exactly one login (``agents.user_id``), so the only valid ``owner_user_id`` is that user; the
column is ready for agency teams. Anything outside the agency is 404.

Converting a lead reuses ``POST /agent-portal/patients`` (the agent's consent attestation is mandatory and the
patient is invited to confirm it); the lead then becomes ``won`` and points to the managed patient. Leads have
no login and must not hold health data beyond what the agent typed in.
"""

from __future__ import annotations

import csv
import io
import re
import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from typing import Any

from fastapi import Request
from pydantic import ValidationError
from sqlalchemy import Select, and_, case, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit_log
from app.core.crypto import keyed_fingerprint
from app.core.deps import PageQuery
from app.core.errors import BadRequest, Conflict, NotFound
from app.core.pagination import Page, paginate
from app.models import Agent, Procedure, Specialty, User
from app.models.crm import (
    OPEN_LEAD_STATUSES,
    AgentLead,
    AgentLeadActivity,
    LeadActivityKind,
    LeadSource,
    LeadStatus,
)
from app.models.sequences import IST
from app.modules.agents import service as agents
from app.modules.crm.schemas import (
    ActivityIn,
    ActivityOut,
    ImportResultOut,
    ImportRowError,
    LeadConvertIn,
    LeadConvertOut,
    LeadCreate,
    LeadDetailOut,
    LeadOut,
    LeadUpdate,
    PipelineOut,
    SourceStats,
    StageCount,
)

MAX_IMPORT_ROWS = 1000
MAX_IMPORT_BYTES = 1_000_000
EXPORT_COLUMNS = (
    "id",
    "full_name",
    "country",
    "email",
    "phone",
    "whatsapp",
    "preferred_language",
    "source",
    "source_detail",
    "interest",
    "budget_minor",
    "budget_currency",
    "status",
    "lost_reason",
    "next_follow_up_at",
    "tags",
    "converted_patient_id",
    "created_at",
    "updated_at",
)
IMPORT_COLUMNS = (
    "full_name",
    "country",
    "email",
    "phone",
    "whatsapp",
    "preferred_language",
    "source",
    "source_detail",
    "interest",
    "budget",
    "budget_currency",
    "next_follow_up",
    "tags",
    "note",
)
LEAD_SORT_PATTERN = r"^-?(created_at|updated_at|next_follow_up_at|full_name|status|last_activity_at)$"
_SORT_COLUMNS = {
    "created_at": AgentLead.created_at,
    "updated_at": AgentLead.updated_at,
    "next_follow_up_at": AgentLead.next_follow_up_at,
    "full_name": AgentLead.full_name,
    "status": AgentLead.status,
    "last_activity_at": AgentLead.last_activity_at,
}


def _now() -> datetime:
    return datetime.now(UTC)


def _v(value: Any) -> str:
    return str(getattr(value, "value", value))


def ist_today(now: datetime | None = None) -> date:
    return (now or _now()).astimezone(IST).date()


def ist_day_end(day: date) -> datetime:
    return datetime.combine(day + timedelta(days=1), time.min, tzinfo=IST)


def ist_day_start(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=IST)


def email_fingerprint(email: str | None) -> str | None:
    value = (email or "").strip().lower()
    return keyed_fingerprint(value, "crm-email") if value else None


def phone_fingerprint(phone: str | None) -> str | None:
    digits = re.sub(r"\D", "", phone or "")
    return keyed_fingerprint(digits[-10:], "crm-phone") if len(digits) >= 7 else None


# --------------------------------------------------------------------------------------------------- scope
async def get_agent(db: AsyncSession, user: User) -> Agent:
    return await agents.get_agent(db, user)


async def _team_user_ids(db: AsyncSession, agent: Agent) -> set[uuid.UUID]:
    """Users who belong to the agency (today: the agency's single login)."""
    return {agent.user_id}


async def _get_lead(db: AsyncSession, agent: Agent, lead_id: uuid.UUID, *, lock: bool = False) -> AgentLead:
    stmt = select(AgentLead).where(AgentLead.id == lead_id, AgentLead.agent_id == agent.id)
    if lock:
        stmt = stmt.with_for_update()
    lead = (await db.execute(stmt)).scalar_one_or_none()
    if lead is None:
        raise NotFound("Lead not found", code="lead_not_found")
    return lead


# ------------------------------------------------------------------------------------------------ outputs
async def _names(db: AsyncSession, model: Any, ids: set[uuid.UUID | None]) -> dict[uuid.UUID, str]:
    clean = [i for i in ids if i is not None]
    if not clean:
        return {}
    column = model.full_name if model is User else model.name
    return {
        row[0]: row[1]
        for row in (await db.execute(select(model.id, column).where(model.id.in_(clean)))).all()
    }


async def lead_outs(db: AsyncSession, leads: list[AgentLead]) -> list[LeadOut]:
    owners = await _names(db, User, {lead.owner_user_id for lead in leads})
    specialties = await _names(db, Specialty, {lead.interested_specialty_id for lead in leads})
    procedures = await _names(db, Procedure, {lead.interested_procedure_id for lead in leads})
    end_today = ist_day_end(ist_today())
    out = []
    for lead in leads:
        out.append(
            LeadOut(
                id=lead.id,
                full_name=lead.full_name,
                country=lead.country,
                email=lead.email,
                phone=lead.phone,
                whatsapp=lead.whatsapp,
                preferred_language=lead.preferred_language,
                source=lead.source,
                source_detail=lead.source_detail,
                interested_specialty_id=lead.interested_specialty_id,
                interested_specialty_name=specialties.get(lead.interested_specialty_id)  # type: ignore[arg-type]
                if lead.interested_specialty_id
                else None,
                interested_procedure_id=lead.interested_procedure_id,
                interested_procedure_name=procedures.get(lead.interested_procedure_id)  # type: ignore[arg-type]
                if lead.interested_procedure_id
                else None,
                interest=lead.interest,
                budget_minor=lead.budget_minor,
                budget_currency=lead.budget_currency,
                status=lead.status,
                status_changed_at=lead.status_changed_at,
                lost_reason=lead.lost_reason,
                next_follow_up_at=lead.next_follow_up_at,
                follow_up_due=bool(
                    lead.next_follow_up_at is not None
                    and lead.next_follow_up_at < end_today
                    and lead.status in OPEN_LEAD_STATUSES
                ),
                last_activity_at=lead.last_activity_at,
                owner_user_id=lead.owner_user_id,
                owner_name=owners.get(lead.owner_user_id) if lead.owner_user_id else None,
                tags=list(lead.tags or []),
                converted_patient_id=lead.converted_patient_id,
                converted_at=lead.converted_at,
                created_at=lead.created_at,
                updated_at=lead.updated_at,
            )
        )
    return out


async def lead_detail(db: AsyncSession, lead: AgentLead) -> LeadDetailOut:
    base = (await lead_outs(db, [lead]))[0]
    activities = (
        (
            await db.execute(
                select(AgentLeadActivity)
                .where(AgentLeadActivity.lead_id == lead.id)
                .order_by(AgentLeadActivity.occurred_at.desc(), AgentLeadActivity.id.desc())
            )
        )
        .scalars()
        .all()
    )
    actors = await _names(db, User, {a.actor_user_id for a in activities})
    items = []
    for a in activities:
        item = ActivityOut.model_validate(a)
        item.actor_name = actors.get(a.actor_user_id) if a.actor_user_id else None
        items.append(item)
    return LeadDetailOut(**base.model_dump(), activities=items)


# -------------------------------------------------------------------------------------------------- lists
@dataclass(slots=True)
class LeadFilters:
    status: tuple[LeadStatus, ...] = ()
    source: tuple[LeadSource, ...] = ()
    q: str | None = None
    tag: str | None = None
    owner_user_id: uuid.UUID | None = None
    follow_up: str | None = None  # due (by end of today, incl. overdue) | overdue | none
    country: str | None = None


def _conditions(agent: Agent, filters: LeadFilters) -> list[Any]:
    conds: list[Any] = [AgentLead.agent_id == agent.id]
    if filters.status:
        conds.append(AgentLead.status.in_(list(filters.status)))
    if filters.source:
        conds.append(AgentLead.source.in_(list(filters.source)))
    if filters.q:
        q = filters.q.strip()
        pattern = "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        name_match = AgentLead.full_name.ilike(pattern, escape="\\")
        exact = [fp for fp in (email_fingerprint(q) if "@" in q else None, phone_fingerprint(q)) if fp]
        contact = [AgentLead.email_fingerprint == fp for fp in exact] + [
            AgentLead.phone_fingerprint == fp for fp in exact
        ]
        conds.append(or_(name_match, AgentLead.interest.ilike(pattern, escape="\\"), *contact))
    if filters.tag:
        conds.append(AgentLead.tags.any(filters.tag.strip().lower()))
    if filters.owner_user_id is not None:
        conds.append(AgentLead.owner_user_id == filters.owner_user_id)
    if filters.country:
        conds.append(AgentLead.country == filters.country.strip().upper()[:2])
    if filters.follow_up:
        today = ist_today()
        if filters.follow_up == "due":
            conds += [
                AgentLead.status.in_(OPEN_LEAD_STATUSES),
                AgentLead.next_follow_up_at < ist_day_end(today),
            ]
        elif filters.follow_up == "overdue":
            conds += [
                AgentLead.status.in_(OPEN_LEAD_STATUSES),
                AgentLead.next_follow_up_at < ist_day_start(today),
            ]
        elif filters.follow_up == "none":
            conds += [AgentLead.status.in_(OPEN_LEAD_STATUSES), AgentLead.next_follow_up_at.is_(None)]
    return conds


def _sorted(stmt: Select[Any], sort: str | None) -> Select[Any]:
    key = (sort or "-created_at").lstrip("-")
    column = _SORT_COLUMNS.get(key, AgentLead.created_at)
    desc = (sort or "-created_at").startswith("-")
    ordered = column.desc().nulls_last() if desc else column.asc().nulls_last()
    return stmt.order_by(ordered, AgentLead.id.desc())


async def list_leads(
    db: AsyncSession, user: User, params: PageQuery, filters: LeadFilters, sort: str | None
) -> Page[LeadOut]:
    agent = await get_agent(db, user)
    stmt = _sorted(select(AgentLead).where(*_conditions(agent, filters)), sort)

    async def _transform(rows: list[AgentLead]) -> list[LeadOut]:
        return await lead_outs(db, rows)

    return await paginate(db, stmt, params, transform=_transform)


async def pipeline(db: AsyncSession, user: User, filters: LeadFilters | None = None) -> PipelineOut:
    agent = await get_agent(db, user)
    base_filters = LeadFilters(
        source=filters.source if filters else (),
        q=filters.q if filters else None,
        tag=filters.tag if filters else None,
        owner_user_id=filters.owner_user_id if filters else None,
        country=filters.country if filters else None,
    )
    conds = _conditions(agent, base_filters)
    stage_rows = dict(
        (
            await db.execute(select(AgentLead.status, func.count()).where(*conds).group_by(AgentLead.status))
        ).all()
    )
    stages = [StageCount(status=s, count=int(stage_rows.get(s, 0))) for s in LeadStatus]
    won = int(stage_rows.get(LeadStatus.WON, 0))
    lost = int(stage_rows.get(LeadStatus.LOST, 0))
    total = sum(int(v) for v in stage_rows.values())
    source_rows = (
        await db.execute(
            select(
                AgentLead.source,
                func.count(),
                func.count().filter(AgentLead.status == LeadStatus.WON),
                func.count().filter(AgentLead.status == LeadStatus.LOST),
            )
            .where(*conds)
            .group_by(AgentLead.source)
        )
    ).all()
    by_source = {LeadSource(_v(s)): (int(t), int(w), int(lo)) for s, t, w, lo in source_rows}
    sources = []
    for source in LeadSource:
        t, w, lo = by_source.get(source, (0, 0, 0))
        sources.append(
            SourceStats(
                source=source,
                total=t,
                won=w,
                lost=lo,
                conversion_rate=round(w / (w + lo), 4) if w + lo else None,
            )
        )
    today = ist_today()
    open_due = and_(AgentLead.status.in_(OPEN_LEAD_STATUSES), AgentLead.next_follow_up_at.is_not(None))
    due_row = (
        await db.execute(
            select(
                func.count().filter(AgentLead.next_follow_up_at < ist_day_end(today)),
                func.count().filter(AgentLead.next_follow_up_at < ist_day_start(today)),
            ).where(*conds, open_due)
        )
    ).one()
    month_start = datetime.combine(today.replace(day=1), time.min, tzinfo=IST)
    new_this_month = int(
        (
            await db.execute(
                select(func.count()).select_from(AgentLead).where(*conds, AgentLead.created_at >= month_start)
            )
        ).scalar_one()
    )
    return PipelineOut(
        total=total,
        open=sum(int(stage_rows.get(s, 0)) for s in OPEN_LEAD_STATUSES),
        stages=stages,
        sources=sources,
        won=won,
        lost=lost,
        conversion_rate=round(won / (won + lost), 4) if won + lost else None,
        follow_ups_due_today=int(due_row[0]),
        follow_ups_overdue=int(due_row[1]),
        new_this_month=new_this_month,
    )


# ------------------------------------------------------------------------------------------------- writes
async def _check_refs(db: AsyncSession, agent: Agent, values: dict[str, Any]) -> None:
    owner = values.get("owner_user_id")
    if owner is not None and owner not in await _team_user_ids(db, agent):
        raise BadRequest("The owner must be a member of your agency", code="invalid_owner")
    specialty = values.get("interested_specialty_id")
    if specialty is not None and await db.get(Specialty, specialty) is None:
        raise BadRequest("Unknown specialty", code="invalid_specialty")
    procedure = values.get("interested_procedure_id")
    if procedure is not None and await db.get(Procedure, procedure) is None:
        raise BadRequest("Unknown procedure", code="invalid_procedure")
    if values.get("budget_minor") is not None and not values.get("budget_currency"):
        raise BadRequest("A budget needs a currency", code="budget_currency_required")


def _set_contact(lead: AgentLead, field: str, value: str | None) -> None:
    setattr(lead, field, value)
    if field == "email":
        lead.email_fingerprint = email_fingerprint(value)
    elif field == "phone":
        lead.phone_fingerprint = phone_fingerprint(value) or phone_fingerprint(lead.whatsapp)
    elif field == "whatsapp" and not lead.phone:
        lead.phone_fingerprint = phone_fingerprint(value)


def _activity(
    lead: AgentLead,
    actor: User | None,
    kind: LeadActivityKind,
    *,
    body: str | None = None,
    from_status: str | None = None,
    to_status: str | None = None,
    occurred_at: datetime | None = None,
) -> AgentLeadActivity:
    when = occurred_at or _now()
    lead.last_activity_at = max(lead.last_activity_at or when, when)
    return AgentLeadActivity(
        lead_id=lead.id,
        agent_id=lead.agent_id,
        actor_user_id=actor.id if actor else None,
        kind=kind,
        body=body,
        from_status=from_status,
        to_status=to_status,
        occurred_at=when,
    )


def _new_lead(agent: Agent, user: User, body: LeadCreate) -> AgentLead:
    now = _now()
    lead = AgentLead(
        agent_id=agent.id,
        owner_user_id=body.owner_user_id or user.id,
        created_by_user_id=user.id,
        full_name=body.full_name,
        country=body.country,
        preferred_language=body.preferred_language,
        source=body.source or LeadSource.OTHER,
        source_detail=body.source_detail,
        interested_specialty_id=body.interested_specialty_id,
        interested_procedure_id=body.interested_procedure_id,
        interest=body.interest,
        budget_minor=body.budget_minor,
        budget_currency=body.budget_currency,
        status=body.status,
        status_changed_at=now,
        next_follow_up_at=body.next_follow_up_at,
        tags=list(body.tags or []),
        last_activity_at=now,
    )
    _set_contact(lead, "email", str(body.email).lower() if body.email else None)
    _set_contact(lead, "whatsapp", body.whatsapp)
    _set_contact(lead, "phone", body.phone)
    return lead


async def create_lead(
    db: AsyncSession, user: User, body: LeadCreate, request: Request | None = None
) -> LeadDetailOut:
    agent = await get_agent(db, user)
    await _check_refs(db, agent, body.model_dump())
    lead = _new_lead(agent, user, body)
    db.add(lead)
    await db.flush()
    if body.note:
        db.add(_activity(lead, user, LeadActivityKind.NOTE, body=body.note))
    await audit_log(
        db,
        actor=user,
        action="crm.lead_create",
        entity_type="agent_lead",
        entity_id=lead.id,
        after={"agent_id": str(agent.id), "source": _v(lead.source), "status": _v(lead.status)},
        request=request,
    )
    await db.commit()
    return await lead_detail(db, lead)


async def get_lead(db: AsyncSession, user: User, lead_id: uuid.UUID) -> LeadDetailOut:
    agent = await get_agent(db, user)
    return await lead_detail(db, await _get_lead(db, agent, lead_id))


_PLAIN_FIELDS = (
    "full_name",
    "country",
    "preferred_language",
    "source",
    "source_detail",
    "interested_specialty_id",
    "interested_procedure_id",
    "interest",
    "budget_minor",
    "budget_currency",
    "next_follow_up_at",
    "owner_user_id",
    "tags",
)


async def update_lead(
    db: AsyncSession, user: User, lead_id: uuid.UUID, body: LeadUpdate, request: Request | None = None
) -> LeadDetailOut:
    agent = await get_agent(db, user)
    lead = await _get_lead(db, agent, lead_id, lock=True)
    sent = body.model_dump(exclude_unset=True)
    if "full_name" in sent and not (sent["full_name"] or "").strip():
        raise BadRequest("The name is required", code="name_required")
    merged = {
        "owner_user_id": sent.get("owner_user_id"),
        "interested_specialty_id": sent.get("interested_specialty_id"),
        "interested_procedure_id": sent.get("interested_procedure_id"),
        "budget_minor": sent.get("budget_minor", lead.budget_minor),
        "budget_currency": sent.get("budget_currency", lead.budget_currency),
    }
    await _check_refs(db, agent, merged)
    changed: list[str] = []
    for field in _PLAIN_FIELDS:
        if field in sent:
            value = sent[field]
            if field == "tags":
                value = list(value or [])
            if field == "source" and value is None:
                value = LeadSource.OTHER
            if field == "full_name":
                value = " ".join(str(value).split())
            if getattr(lead, field) != value:
                setattr(lead, field, value)
                changed.append(field)
                if field == "next_follow_up_at":
                    lead.follow_up_reminded_on = None
    for field in ("email", "phone", "whatsapp"):
        if field in sent:
            value = sent[field]
            if field == "email" and value:
                value = str(value).lower()
            if getattr(lead, field) != value:
                _set_contact(lead, field, value)
                changed.append(field)
    if "status" in sent and sent["status"] is not None and sent["status"] != lead.status:
        new = LeadStatus(sent["status"])
        if new == LeadStatus.WON:
            raise BadRequest("Convert the lead to a patient to mark it won", code="lead_convert_required")
        if lead.status == LeadStatus.WON:
            raise Conflict("This lead was converted to a patient", code="lead_converted")
        if new == LeadStatus.LOST:
            reason = (sent.get("lost_reason") or "").strip()
            if not reason:
                raise BadRequest("Give a reason why the lead was lost", code="lost_reason_required")
            lead.lost_reason = reason
        else:
            lead.lost_reason = None
        db.add(
            _activity(
                lead, user, LeadActivityKind.STATUS_CHANGE, from_status=_v(lead.status), to_status=new.value
            )
        )
        lead.status = new
        lead.status_changed_at = _now()
        changed.append("status")
    elif "lost_reason" in sent and lead.status == LeadStatus.LOST and sent["lost_reason"]:
        lead.lost_reason = sent["lost_reason"]
        changed.append("lost_reason")
    if changed:
        await audit_log(
            db,
            actor=user,
            action="crm.lead_update",
            entity_type="agent_lead",
            entity_id=lead.id,
            after={"fields": sorted(set(changed)), "status": _v(lead.status)},
            request=request,
        )
    await db.commit()
    return await lead_detail(db, lead)


async def delete_lead(
    db: AsyncSession, user: User, lead_id: uuid.UUID, request: Request | None = None
) -> None:
    agent = await get_agent(db, user)
    lead = await _get_lead(db, agent, lead_id, lock=True)
    await db.execute(delete(AgentLead).where(AgentLead.id == lead.id))
    await audit_log(
        db, actor=user, action="crm.lead_delete", entity_type="agent_lead", entity_id=lead_id, request=request
    )
    await db.commit()


async def add_activity(
    db: AsyncSession, user: User, lead_id: uuid.UUID, body: ActivityIn, request: Request | None = None
) -> LeadDetailOut:
    agent = await get_agent(db, user)
    lead = await _get_lead(db, agent, lead_id, lock=True)
    occurred = body.occurred_at
    if occurred is not None and occurred > _now() + timedelta(minutes=5):
        raise BadRequest("An activity cannot be in the future", code="activity_in_future")
    db.add(_activity(lead, user, body.kind, body=body.body, occurred_at=occurred))
    if "next_follow_up_at" in body.model_fields_set:
        lead.next_follow_up_at = body.next_follow_up_at
        lead.follow_up_reminded_on = None
    if lead.status == LeadStatus.NEW and body.kind in (
        LeadActivityKind.CALL,
        LeadActivityKind.MESSAGE,
        LeadActivityKind.MEETING,
    ):
        db.add(
            _activity(
                lead,
                user,
                LeadActivityKind.STATUS_CHANGE,
                from_status=LeadStatus.NEW.value,
                to_status=LeadStatus.CONTACTED.value,
            )
        )
        lead.status = LeadStatus.CONTACTED
        lead.status_changed_at = _now()
    await audit_log(
        db,
        actor=user,
        action="crm.lead_activity",
        entity_type="agent_lead",
        entity_id=lead.id,
        after={"kind": body.kind.value},
        request=request,
    )
    await db.commit()
    return await lead_detail(db, lead)


async def convert_lead(
    db: AsyncSession, user: User, lead_id: uuid.UUID, body: LeadConvertIn, request: Request | None = None
) -> LeadConvertOut:
    """Create the managed patient (same rules and consent attestation as ``POST /agent-portal/patients``),
    then mark the lead won. The lead's notes are NOT copied into the patient record."""
    agent = await get_agent(db, user)
    lead = await _get_lead(db, agent, lead_id)
    if lead.status == LeadStatus.WON or lead.converted_patient_id is not None:
        raise Conflict("This lead was already converted", code="lead_converted")
    patient = await agents.create_patient(db, user, body, request)  # commits
    lead = await _get_lead(db, agent, lead_id, lock=True)
    if lead.converted_patient_id is not None:  # pragma: no cover - concurrent conversion
        raise Conflict("This lead was already converted", code="lead_converted")
    db.add(
        _activity(
            lead,
            user,
            LeadActivityKind.STATUS_CHANGE,
            from_status=_v(lead.status),
            to_status=LeadStatus.WON.value,
        )
    )
    lead.status = LeadStatus.WON
    lead.status_changed_at = _now()
    lead.lost_reason = None
    lead.converted_patient_id = patient.id
    lead.converted_at = _now()
    lead.next_follow_up_at = None
    await audit_log(
        db,
        actor=user,
        action="crm.lead_convert",
        entity_type="agent_lead",
        entity_id=lead.id,
        after={"patient_id": str(patient.id)},
        request=request,
    )
    await db.commit()
    return LeadConvertOut(lead=await lead_detail(db, lead), patient=patient)


# ------------------------------------------------------------------------------------------------- import
def _cell(row: dict[str, Any], key: str) -> str | None:
    value = row.get(key)
    if value is None:
        return None
    value = str(value).strip()
    return value or None


def _parse_budget(raw: str | None, currency: str | None) -> int | None:
    if raw is None:
        return None
    from app.core.money import to_minor

    cleaned = raw.replace(",", "").replace(" ", "")
    return to_minor(cleaned, currency or "USD")


def _parse_follow_up(raw: str | None) -> datetime | None:
    if raw is None:
        return None
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError as exc:
        raise ValueError("use YYYY-MM-DD or an ISO date-time") from exc
    if parsed.tzinfo is None:
        parsed = (
            parsed.replace(tzinfo=IST)
            if parsed.time() != time.min
            else datetime.combine(parsed.date(), time(10, 0), tzinfo=IST)
        )
    return parsed


async def import_csv(
    db: AsyncSession, user: User, content: bytes, *, dry_run: bool, request: Request | None = None
) -> ImportResultOut:
    """Validate every row first; nothing is created unless every row is valid. Rows whose email or phone
    already belongs to a lead of the agency (or an earlier row) are skipped as duplicates."""
    agent = await get_agent(db, user)
    if len(content) > MAX_IMPORT_BYTES:
        raise BadRequest("The file is too large (max 1 MB)", code="import_too_large")
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise BadRequest("The file must be UTF-8 CSV", code="import_not_utf8") from exc
    reader = csv.DictReader(io.StringIO(text))
    header = [h.strip().lower() for h in (reader.fieldnames or [])]
    if "full_name" not in header:
        raise BadRequest(
            "The first row must be a header with at least full_name",
            code="import_bad_header",
            details={"columns": list(IMPORT_COLUMNS)},
        )
    unknown = sorted(set(header) - set(IMPORT_COLUMNS))
    if unknown:
        raise BadRequest("Unknown columns", code="import_bad_header", details={"unknown": unknown})
    reader.fieldnames = header
    errors: list[ImportRowError] = []
    parsed: list[tuple[LeadCreate, str | None]] = []
    rows = list(reader)
    if len(rows) > MAX_IMPORT_ROWS:
        raise BadRequest(f"At most {MAX_IMPORT_ROWS} rows per file", code="import_too_many_rows")
    for index, row in enumerate(rows, start=1):
        try:
            currency = (_cell(row, "budget_currency") or "").upper() or None
            tags = [t for t in re.split(r"[;|]", _cell(row, "tags") or "") if t.strip()]
            data = {
                "full_name": _cell(row, "full_name") or "",
                "country": _cell(row, "country"),
                "email": _cell(row, "email"),
                "phone": _cell(row, "phone"),
                "whatsapp": _cell(row, "whatsapp"),
                "preferred_language": _cell(row, "preferred_language"),
                "source": (_cell(row, "source") or "other").lower().replace("-", "_").replace(" ", "_"),
                "source_detail": _cell(row, "source_detail"),
                "interest": _cell(row, "interest"),
                "budget_minor": _parse_budget(_cell(row, "budget"), currency),
                "budget_currency": currency,
                "next_follow_up_at": _parse_follow_up(_cell(row, "next_follow_up")),
                "tags": tags or None,
            }
            body = LeadCreate.model_validate(data)
            if body.budget_minor is not None and not body.budget_currency:
                raise ValueError("budget_currency is required with a budget")
            parsed.append((body, _cell(row, "note")))
        except ValidationError as exc:
            for err in exc.errors()[:3]:
                loc = err.get("loc") or ()
                errors.append(
                    ImportRowError(
                        row=index, field=str(loc[0]) if loc else None, message=str(err.get("msg"))[:200]
                    )
                )
        except Exception as exc:  # noqa: BLE001 - every row problem is reported, never raised
            errors.append(ImportRowError(row=index, field=None, message=str(exc)[:200]))
        if len(errors) >= 100:
            break
    if errors:
        return ImportResultOut(
            dry_run=dry_run, total_rows=len(rows), created=0, skipped_duplicates=0, errors=errors
        )

    existing = (
        await db.execute(
            select(AgentLead.email_fingerprint, AgentLead.phone_fingerprint).where(
                AgentLead.agent_id == agent.id
            )
        )
    ).all()
    seen_email = {e for e, _ in existing if e}
    seen_phone = {p for _, p in existing if p}
    created = skipped = 0
    for body, note in parsed:
        efp = email_fingerprint(str(body.email) if body.email else None)
        pfp = phone_fingerprint(body.phone) or phone_fingerprint(body.whatsapp)
        if (efp and efp in seen_email) or (pfp and pfp in seen_phone):
            skipped += 1
            continue
        if efp:
            seen_email.add(efp)
        if pfp:
            seen_phone.add(pfp)
        created += 1
        if dry_run:
            continue
        lead = _new_lead(agent, user, body)
        lead.source_detail = lead.source_detail or "CSV import"
        db.add(lead)
        await db.flush()
        if note:
            db.add(_activity(lead, user, LeadActivityKind.NOTE, body=note[:5000]))
    if not dry_run:
        await audit_log(
            db,
            actor=user,
            action="crm.leads_import",
            entity_type="agent",
            entity_id=agent.id,
            after={"rows": len(rows), "created": created, "skipped_duplicates": skipped},
            request=request,
        )
        await db.commit()
    return ImportResultOut(
        dry_run=dry_run, total_rows=len(rows), created=created, skipped_duplicates=skipped, errors=[]
    )


# ------------------------------------------------------------------------------------------------- export
def _csv_safe(value: Any) -> str:
    """Spreadsheet formula injection guard: prefix cells that start with = + - @ (or tab/CR) with a quote."""
    if value is None:
        return ""
    if isinstance(value, list):
        value = ";".join(str(v) for v in value)
    if isinstance(value, datetime):
        value = value.isoformat()
    text = str(getattr(value, "value", value))
    if text and text[0] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + text
    return text


async def export_csv(
    db: AsyncSession, user: User, filters: LeadFilters, request: Request | None = None
) -> str:
    agent = await get_agent(db, user)
    leads = (
        (
            await db.execute(
                select(AgentLead)
                .where(*_conditions(agent, filters))
                .order_by(AgentLead.created_at, AgentLead.id)
            )
        )
        .scalars()
        .all()
    )
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(EXPORT_COLUMNS)
    for lead in leads:
        writer.writerow([_csv_safe(getattr(lead, col)) for col in EXPORT_COLUMNS])
    await audit_log(
        db,
        actor=user,
        action="crm.leads_export",
        entity_type="agent",
        entity_id=agent.id,
        after={"rows": len(leads)},
        request=request,
    )
    await db.commit()
    return "﻿" + buffer.getvalue()


# -------------------------------------------------------------------------------------------------- jobs
async def send_follow_up_reminders(db: AsyncSession, now: datetime | None = None) -> int:
    """One notification per owner per day listing how many open leads have a follow-up due today (incl.
    overdue). Each lead counts once per due date (``follow_up_reminded_on``)."""
    from app.modules.messaging.notifications import notify

    now = now or _now()
    today = ist_today(now)
    today_s = today.isoformat()
    leads = (
        (
            await db.execute(
                select(AgentLead)
                .join(Agent, Agent.id == AgentLead.agent_id)
                .where(
                    AgentLead.status.in_(OPEN_LEAD_STATUSES),
                    AgentLead.next_follow_up_at.is_not(None),
                    AgentLead.next_follow_up_at < ist_day_end(today),
                    or_(
                        AgentLead.follow_up_reminded_on.is_(None), AgentLead.follow_up_reminded_on != today_s
                    ),
                )
                .order_by(AgentLead.next_follow_up_at)
                .limit(2000)
                .with_for_update(of=AgentLead, skip_locked=True)
            )
        )
        .scalars()
        .all()
    )
    agents_by_id: dict[uuid.UUID, Agent] = {}
    per_owner: dict[uuid.UUID, list[AgentLead]] = {}
    for lead in leads:
        owner = lead.owner_user_id
        if owner is None:
            agent = agents_by_id.get(lead.agent_id) or await db.get(Agent, lead.agent_id)
            if agent is None:
                continue
            agents_by_id[lead.agent_id] = agent
            owner = agent.user_id
        per_owner.setdefault(owner, []).append(lead)
        lead.follow_up_reminded_on = today_s
    for owner, owned in per_owner.items():
        first = owned[0]
        await notify(
            db,
            owner,
            "crm.follow_up_due",
            title_key="crm.notifications.follow_up_due.title",
            body_key="crm.notifications.follow_up_due.body"
            if len(owned) > 1
            else "crm.notifications.follow_up_due.body_one",
            params={"count": len(owned), "name": first.full_name},
            data={
                "count": len(owned),
                "lead_id": str(first.id) if len(owned) == 1 else None,
                "link": f"/leads/{first.id}" if len(owned) == 1 else "/leads?follow_up=due",
            },
            dedupe_key=f"crm.follow_up_due:{owner}:{today_s}:{len(owned)}:{first.id}",
            email=False,
        )
    return sum(len(v) for v in per_owner.values())


async def purge_lost_leads(db: AsyncSession, retention_days: int, now: datetime | None = None) -> int:
    if retention_days <= 0:
        return 0
    cutoff = (now or _now()) - timedelta(days=retention_days)
    stale = case(
        (AgentLead.status_changed_at.is_(None), AgentLead.updated_at), else_=AgentLead.status_changed_at
    )
    ids = (
        (
            await db.execute(
                select(AgentLead.id).where(AgentLead.status == LeadStatus.LOST, stale < cutoff).limit(1000)
            )
        )
        .scalars()
        .all()
    )
    if not ids:
        return 0
    await db.execute(
        delete(AgentLead).where(AgentLead.id.in_(ids)).execution_options(synchronize_session=False)
    )
    await audit_log(
        db,
        actor=None,
        action="crm.lost_leads_purged",
        entity_type="agent_lead",
        entity_id=None,
        after={"count": len(ids), "retention_days": retention_days},
    )
    return len(ids)
