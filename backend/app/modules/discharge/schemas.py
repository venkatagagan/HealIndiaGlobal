"""Request/response models of discharge summaries, home-doctor shares and medication reminders."""

from __future__ import annotations

import re
import uuid
from datetime import date, datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.core.enums import DischargeSummaryStatus

LongText = Annotated[str, Field(max_length=10_000)]
ShortText = Annotated[str, Field(max_length=500)]


class _In(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class MedicationIn(_In):
    name: str = Field(min_length=1, max_length=200)
    dose: str | None = Field(default=None, max_length=100)
    frequency: str | None = Field(default=None, max_length=100)
    duration_days: int | None = Field(default=None, ge=1, le=3650, description="Empty = ongoing")
    route: str | None = Field(default=None, max_length=60, description="e.g. oral, topical")
    instructions: str | None = Field(default=None, max_length=500)


class MedicationOut(BaseModel):
    name: str
    dose: str | None = None
    frequency: str | None = None
    duration_days: int | None = None
    route: str | None = None
    instructions: str | None = None


class DischargeSummaryFields(_In):
    """Editable fields (all optional on a draft; diagnosis + discharge date are required to finalize)."""

    doctor_id: uuid.UUID | None = None
    doctor_name: str | None = Field(default=None, max_length=200)
    doctor_registration: str | None = Field(default=None, max_length=80)
    admission_date: date | None = None
    discharge_date: date | None = None
    diagnosis: LongText | None = None
    diagnosis_code: str | None = Field(default=None, max_length=20, pattern=r"^[A-Za-z0-9.\-]{1,20}$")
    procedure_name: ShortText | None = None
    procedure_code: str | None = Field(default=None, max_length=20, pattern=r"^[A-Za-z0-9.\-]{1,20}$")
    procedure_date: date | None = None
    hospital_course: LongText | None = None
    medications: list[MedicationIn] | None = Field(default=None, max_length=50)
    follow_up_instructions: LongText | None = None
    red_flag_symptoms: LongText | None = None
    allergies: LongText | None = None
    investigations_summary: LongText | None = None
    attachment_document_ids: list[uuid.UUID] | None = Field(default=None, max_length=30)


class DischargeSummaryCreate(DischargeSummaryFields):
    case_id: uuid.UUID
    booking_id: uuid.UUID | None = None


class DischargeSummaryUpdate(DischargeSummaryFields):
    pass


class AttachmentOut(BaseModel):
    id: uuid.UUID
    file_name: str
    content_type: str
    size_bytes: int
    kind: str


class DischargeSummaryOut(BaseModel):
    id: uuid.UUID
    case_id: uuid.UUID
    case_number: str | None = None
    booking_id: uuid.UUID | None
    booking_number: str | None = None
    patient_id: uuid.UUID
    patient_name: str | None = None
    hospital_id: uuid.UUID
    hospital_name: str | None = None
    doctor_id: uuid.UUID | None
    doctor_name: str | None
    doctor_registration: str | None
    version: int
    supersedes_id: uuid.UUID | None
    status: DischargeSummaryStatus
    is_latest: bool = True
    admission_date: date | None
    discharge_date: date | None
    diagnosis: str | None
    diagnosis_code: str | None
    procedure_name: str | None
    procedure_code: str | None
    procedure_date: date | None
    hospital_course: str | None
    medications: list[MedicationOut]
    follow_up_instructions: str | None
    red_flag_symptoms: str | None
    allergies: str | None
    investigations_summary: str | None
    attachments: list[AttachmentOut]
    pdf_document_id: uuid.UUID | None
    finalized_at: datetime | None
    finalized_by_user_id: uuid.UUID | None
    superseded_at: datetime | None
    created_at: datetime
    updated_at: datetime


class DischargeSummaryListItem(BaseModel):
    id: uuid.UUID
    case_id: uuid.UUID
    case_number: str | None = None
    booking_id: uuid.UUID | None
    patient_name: str | None = None
    hospital_name: str | None = None
    version: int
    status: DischargeSummaryStatus
    is_latest: bool = True
    discharge_date: date | None
    pdf_document_id: uuid.UUID | None
    finalized_at: datetime | None
    updated_at: datetime


class DischargePrefillOut(BaseModel):
    """Values to start a draft from the case / booking / consultation data (nothing is saved)."""

    case_id: uuid.UUID
    booking_id: uuid.UUID | None
    doctor_id: uuid.UUID | None
    doctor_name: str | None
    doctor_registration: str | None
    admission_date: date | None
    discharge_date: date | None
    procedure_name: str | None
    procedure_date: date | None
    allergies: str | None
    diagnosis: str | None
    hospital_course: str | None
    available_documents: list[AttachmentOut]


# ------------------------------------------------------------------------------------------------ shares
class ShareCreate(_In):
    doctor_email: EmailStr
    doctor_name: str | None = Field(default=None, max_length=200)
    document_ids: list[uuid.UUID] = Field(default_factory=list, max_length=30)
    expires_in_days: int | None = Field(default=None, ge=1, le=365)
    language: str | None = Field(default=None, pattern=r"^(en|ar|fr|bn|ru)$")
    consent: bool = Field(description="The patient agrees to share this summary with the doctor")


class ShareOut(BaseModel):
    id: uuid.UUID
    discharge_summary_id: uuid.UUID
    doctor_email_masked: str
    doctor_name: str | None
    document_ids: list[uuid.UUID]
    language: str
    expires_at: datetime
    revoked_at: datetime | None
    view_count: int
    last_viewed_at: datetime | None
    created_at: datetime
    active: bool


class ShareCreatedOut(ShareOut):
    url: str = Field(description="Shown once - only a hash of the token is stored")


class PublicShareOut(BaseModel):
    """What the home doctor sees (read-only)."""

    patient_name: str
    patient_date_of_birth: date | None
    patient_sex: str | None
    hospital_name: str
    hospital_address: str | None
    hospital_phone: str | None
    hospital_email: str | None
    summary: DischargeSummaryOut
    documents: list[AttachmentOut]
    expires_at: datetime
    shared_by_name: str | None = None


# ------------------------------------------------------------------------------------------------ reminders
class MedicationReminderOut(BaseModel):
    id: uuid.UUID
    discharge_summary_id: uuid.UUID
    name: str
    dose: str | None
    frequency: str | None
    start_on: date
    end_on: date | None
    enabled: bool
    remind_hour: int
    timezone: str
    last_sent_on: date | None


_TZ_RE = re.compile(r"^(UTC|[+-](0\d|1[0-4]):[0-5]\d|[A-Za-z_]{1,32}(/[A-Za-z0-9_+\-]{1,32}){1,2})$")


class MedicationRemindersUpdate(_In):
    enabled: bool
    remind_hour: int = Field(default=9, ge=0, le=23, description="Local hour of the daily reminder")
    timezone: str = Field(
        default="UTC", max_length=64, description='IANA zone ("Africa/Lagos") or a UTC offset ("+01:00")'
    )

    @field_validator("timezone")
    @classmethod
    def _tz(cls, value: str) -> str:
        if not _TZ_RE.match(value):
            raise ValueError("Unknown time zone")
        return value
