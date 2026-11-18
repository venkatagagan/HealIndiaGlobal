"""Agent CRM API schemas (leads, activities, pipeline)."""

from __future__ import annotations

import re
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.crm import LeadActivityKind, LeadSource, LeadStatus
from app.modules.agents.schemas import AgentPatientCreate, AgentPatientOut
from app.modules.auth.schemas import EmailAddress, normalize_country, normalize_language, normalize_phone

MAX_TAGS = 10
_TAG_RE = re.compile(r"^[\w .&/+-]{1,40}$", re.UNICODE)
_CCY_RE = re.compile(r"^[A-Z]{3}$")


class _In(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


def _tags(value: list[str] | None) -> list[str] | None:
    if value is None:
        return None
    out: list[str] = []
    for raw in value:
        tag = " ".join(str(raw).split()).lower()
        if not tag:
            continue
        if not _TAG_RE.match(tag):
            raise ValueError("tags may use letters, digits, spaces and . & / + - (max 40 characters)")
        if tag not in out:
            out.append(tag)
    if len(out) > MAX_TAGS:
        raise ValueError(f"at most {MAX_TAGS} tags")
    return out


def _currency(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip().upper()
    if not value:
        return None
    if not _CCY_RE.match(value):
        raise ValueError("must be an ISO-4217 currency code")
    return value


def _blank(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value or None


class _LeadFields(_In):
    country: str | None = Field(default=None, max_length=2)
    email: EmailAddress | None = None
    phone: str | None = Field(default=None, max_length=32)
    whatsapp: str | None = Field(default=None, max_length=32)
    preferred_language: str | None = Field(default=None, max_length=10)
    source: LeadSource | None = None
    source_detail: str | None = Field(default=None, max_length=200)
    interested_specialty_id: uuid.UUID | None = None
    interested_procedure_id: uuid.UUID | None = None
    # what the person is looking for, in a few words - not medical history (that belongs to the patient
    # record)
    interest: str | None = Field(default=None, max_length=300)
    budget_minor: int | None = Field(default=None, ge=0, le=10**13)
    budget_currency: str | None = Field(default=None, max_length=3)
    next_follow_up_at: datetime | None = None
    owner_user_id: uuid.UUID | None = None
    tags: list[str] | None = Field(default=None, max_length=20)

    _country = field_validator("country")(normalize_country)
    _phones = field_validator("phone", "whatsapp")(normalize_phone)
    _language = field_validator("preferred_language")(normalize_language)
    _ccy = field_validator("budget_currency")(_currency)
    _tag_list = field_validator("tags")(_tags)
    _text = field_validator("source_detail", "interest")(_blank)


class LeadCreate(_LeadFields):
    full_name: str = Field(min_length=1, max_length=200)
    status: LeadStatus = LeadStatus.NEW
    note: str | None = Field(default=None, max_length=5000)  # first timeline note

    @field_validator("full_name")
    @classmethod
    def _name(cls, value: str) -> str:
        value = " ".join(value.split())
        if not value:
            raise ValueError("must not be blank")
        return value

    @field_validator("status")
    @classmethod
    def _status(cls, value: LeadStatus) -> LeadStatus:
        if value in (LeadStatus.WON, LeadStatus.LOST):
            raise ValueError("a new lead must be open")
        return value


class LeadUpdate(_LeadFields):
    """PATCH: only the fields sent are changed (``null`` clears an optional field)."""

    full_name: str | None = Field(default=None, min_length=1, max_length=200)
    status: LeadStatus | None = None
    lost_reason: str | None = Field(default=None, max_length=500)


class ActivityIn(_In):
    kind: LeadActivityKind
    body: str | None = Field(default=None, max_length=5000)
    occurred_at: datetime | None = None
    next_follow_up_at: datetime | None = None  # optionally (re)schedule the follow-up at the same time

    @field_validator("kind")
    @classmethod
    def _kind(cls, value: LeadActivityKind) -> LeadActivityKind:
        if value == LeadActivityKind.STATUS_CHANGE:
            raise ValueError("status changes are recorded by updating the lead")
        return value


class ActivityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    kind: LeadActivityKind
    body: str | None
    from_status: str | None
    to_status: str | None
    actor_user_id: uuid.UUID | None
    actor_name: str | None = None
    occurred_at: datetime
    created_at: datetime


class LeadOut(BaseModel):
    id: uuid.UUID
    full_name: str
    country: str | None
    email: str | None
    phone: str | None
    whatsapp: str | None
    preferred_language: str | None
    source: LeadSource
    source_detail: str | None
    interested_specialty_id: uuid.UUID | None
    interested_specialty_name: str | None = None
    interested_procedure_id: uuid.UUID | None
    interested_procedure_name: str | None = None
    interest: str | None
    budget_minor: int | None
    budget_currency: str | None
    status: LeadStatus
    status_changed_at: datetime | None
    lost_reason: str | None
    next_follow_up_at: datetime | None
    follow_up_due: bool = False
    last_activity_at: datetime | None
    owner_user_id: uuid.UUID | None
    owner_name: str | None = None
    tags: list[str]
    converted_patient_id: uuid.UUID | None
    converted_at: datetime | None
    created_at: datetime
    updated_at: datetime


class LeadDetailOut(LeadOut):
    activities: list[ActivityOut]


class LeadConvertIn(AgentPatientCreate):
    """Same body (and consent attestation) as ``POST /agent-portal/patients``; prefilled from the lead."""


class LeadConvertOut(BaseModel):
    lead: LeadDetailOut
    patient: AgentPatientOut


class StageCount(BaseModel):
    status: LeadStatus
    count: int


class SourceStats(BaseModel):
    source: LeadSource
    total: int
    won: int
    lost: int
    conversion_rate: float | None  # won / (won + lost); None when nothing closed yet


class PipelineOut(BaseModel):
    total: int
    open: int
    stages: list[StageCount]
    sources: list[SourceStats]
    won: int
    lost: int
    conversion_rate: float | None  # won / (won + lost)
    follow_ups_due_today: int  # open leads with a follow-up due by the end of today (IST), incl. overdue
    follow_ups_overdue: int  # due before today
    new_this_month: int


class ImportRowError(BaseModel):
    row: int  # 1-based data row (the header is row 0)
    field: str | None
    message: str


class ImportResultOut(BaseModel):
    dry_run: bool
    total_rows: int
    created: int
    skipped_duplicates: int
    errors: list[ImportRowError]
