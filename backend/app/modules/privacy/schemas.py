"""Pydantic schemas for the privacy module."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, model_validator

from app.models.privacy import (
    BreachSeverity,
    BreachStatus,
    DataRightsRequestKind,
    DataRightsRequestStatus,
)
from app.modules.auth.schemas import EmailAddress


class _In(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


def _clean_phone(value: str | None) -> str | None:
    if value is None or not value.strip():
        return None
    value = value.strip()
    if not all(ch.isdigit() or ch in "+()-. " for ch in value) or len(value) < 4:
        raise ValueError("enter a valid phone number")
    return value


Phone = Annotated[str | None, Field(default=None, max_length=32), AfterValidator(_clean_phone)]


# --- privacy contact ---------------------------------------------------------------------------------------
class ContactPerson(BaseModel):
    name: str | None
    email: str | None
    phone: str | None


class PrivacyContactOut(BaseModel):
    grievance_officer: ContactPerson
    data_protection_officer: ContactPerson
    postal_address: str | None
    response_days: int
    request_kinds: list[DataRightsRequestKind]
    data_protection_board_url: str = "https://www.dpb.gov.in"


# --- data-rights requests / grievances ----------------------------------------------------------------------
class DataRightsRequestIn(_In):
    kind: DataRightsRequestKind
    details: str = Field(min_length=10, max_length=5000)
    #: required when not signed in; defaults to the account's details otherwise
    requester_name: str | None = Field(default=None, min_length=2, max_length=200)
    requester_email: EmailAddress | None = None
    requester_phone: Phone = None
    on_behalf_of: str | None = Field(default=None, max_length=300)
    channel: Literal["web", "app"] = "web"


class DataRightsRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    reference: str
    kind: DataRightsRequestKind
    status: DataRightsRequestStatus
    channel: str
    details: str
    on_behalf_of: str | None
    resolution: str | None
    due_at: datetime
    overdue: bool = False
    acknowledged_at: datetime | None
    closed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class AdminDataRightsRequestOut(DataRightsRequestOut):
    user_id: uuid.UUID | None
    requester_name: str
    requester_email: str | None
    requester_phone: str | None
    assigned_to_user_id: uuid.UUID | None
    internal_notes: str | None


class DataRightsRequestUpdate(_In):
    status: DataRightsRequestStatus | None = None
    assigned_to_user_id: uuid.UUID | None = None
    resolution: str | None = Field(default=None, max_length=5000)
    internal_notes: str | None = Field(default=None, max_length=5000)

    @model_validator(mode="after")
    def _closing_needs_answer(self) -> DataRightsRequestUpdate:
        if self.status in (DataRightsRequestStatus.COMPLETED, DataRightsRequestStatus.REJECTED) and not (
            self.resolution and self.resolution.strip()
        ):
            raise ValueError("Write the answer to the requester (resolution) before closing the request")
        return self


# --- nominee (DPDP s.14) ------------------------------------------------------------------------------------
class NomineeIn(_In):
    full_name: str = Field(min_length=2, max_length=200)
    relationship: str = Field(min_length=2, max_length=60)
    email: EmailAddress | None = None
    phone: Phone = None

    @model_validator(mode="after")
    def _contact(self) -> NomineeIn:
        if not self.email and not self.phone:
            raise ValueError("Give an email address or a phone number for your nominee")
        return self


class NomineeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    full_name: str
    relationship: str
    email: str | None
    phone: str | None
    created_at: datetime
    updated_at: datetime


# --- guardian consent (DPDP s.9) ----------------------------------------------------------------------------
GuardianRelationship = Literal["parent", "lawful_guardian"]
VerificationMethod = Literal["id_document", "digilocker", "in_person", "video_call"]


class GuardianConsentIn(_In):
    #: agents and staff name the patient; a patient account uses its own profile
    patient_id: uuid.UUID | None = None
    guardian_name: str = Field(min_length=2, max_length=200)
    relationship: GuardianRelationship
    guardian_email: EmailAddress | None = None
    guardian_phone: Phone = None
    guardian_date_of_birth: date
    verification_method: VerificationMethod
    verification_reference: str | None = Field(default=None, max_length=120)
    #: the guardian confirms they are the child's parent/lawful guardian, an adult, and consent
    declaration: bool

    @model_validator(mode="after")
    def _checks(self) -> GuardianConsentIn:
        if not self.declaration:
            raise ValueError("The guardian must confirm the declaration")
        if not self.guardian_email and not self.guardian_phone:
            raise ValueError("Give the guardian's email address or phone number")
        return self


class GuardianConsentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    patient_id: uuid.UUID
    guardian_name: str
    relationship: str
    guardian_email: str | None
    guardian_phone: str | None
    verification_method: str
    verification_reference: str | None
    verified_at: datetime | None
    revoked_at: datetime | None
    created_at: datetime


class GuardianStatusOut(BaseModel):
    patient_id: uuid.UUID | None
    is_minor: bool
    date_of_birth_known: bool
    #: verified guardian consent in place (or not needed)
    satisfied: bool
    consent: GuardianConsentOut | None = None
    #: a submitted record waiting for staff verification
    pending: GuardianConsentOut | None = None


# --- access log ---------------------------------------------------------------------------------------------
class AccessLogEntry(BaseModel):
    at: datetime
    action: str
    resource_type: str | None
    resource_id: str | None
    viewer_role: str | None
    viewer_name: str | None
    reason: str | None = None


# --- legal holds --------------------------------------------------------------------------------------------
class LegalHoldIn(_In):
    legal_hold: bool
    reason: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def _reason(self) -> LegalHoldIn:
        if self.legal_hold and not (self.reason and len(self.reason.strip()) >= 5):
            raise ValueError(
                "Give the reason for the legal hold (for example the matter or request reference)"
            )
        return self


class LegalHoldOut(BaseModel):
    entity_type: Literal["user", "case"]
    entity_id: uuid.UUID
    label: str
    legal_hold: bool
    reason: str | None
    set_at: datetime | None
    set_by: uuid.UUID | None


# --- breach register ----------------------------------------------------------------------------------------
class BreachIn(_In):
    title: str = Field(min_length=5, max_length=200)
    description: str = Field(min_length=10, max_length=10_000)
    severity: BreachSeverity
    detected_at: datetime | None = None
    occurred_at: datetime | None = None
    data_categories: list[str] = Field(default_factory=list, max_length=20)
    affected_subjects_estimate: int | None = Field(default=None, ge=0)
    likely_consequences: str | None = Field(default=None, max_length=5000)
    measures_taken: str | None = Field(default=None, max_length=5000)
    notes: str | None = Field(default=None, max_length=5000)


class BreachUpdate(_In):
    status: BreachStatus | None = None
    severity: BreachSeverity | None = None
    contained_at: datetime | None = None
    data_categories: list[str] | None = Field(default=None, max_length=20)
    affected_subjects_estimate: int | None = Field(default=None, ge=0)
    likely_consequences: str | None = Field(default=None, max_length=5000)
    measures_taken: str | None = Field(default=None, max_length=5000)
    dpb_notified_at: datetime | None = None
    supervisory_authority_notified_at: datetime | None = None
    subjects_notified_at: datetime | None = None
    notes: str | None = Field(default=None, max_length=5000)


class BreachOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    reference: str
    title: str
    description: str
    severity: BreachSeverity
    status: BreachStatus
    occurred_at: datetime | None
    detected_at: datetime
    notification_deadline_at: datetime
    contained_at: datetime | None
    data_categories: list[str]
    affected_subjects_estimate: int | None
    likely_consequences: str | None
    measures_taken: str | None
    dpb_notified_at: datetime | None
    supervisory_authority_notified_at: datetime | None
    subjects_notified_at: datetime | None
    reported_by_user_id: uuid.UUID | None
    notes: str | None
    closed_at: datetime | None
    created_at: datetime
    updated_at: datetime
    notification_overdue: bool = False
