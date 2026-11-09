"""Request/response shapes for verified reviews and structured accreditations."""

from __future__ import annotations

import re
import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.modules.catalog.schemas import IdSlugName, ReviewOut

_BODY_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,19}$")


class _In(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


def _clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value or None


# ----------------------------------------------------------------------------- reviews
class ReviewCreateIn(_In):
    hospital_id: uuid.UUID
    booking_id: uuid.UUID
    doctor_id: uuid.UUID | None = None
    rating: int = Field(ge=1, le=5)
    title: str | None = Field(default=None, max_length=200)
    body: str | None = Field(default=None, max_length=5000)

    _text = field_validator("title", "body")(_clean_text)


class ReviewUpdateIn(_In):
    """Edit an own review while it is still pending. Send only the fields to change."""

    doctor_id: uuid.UUID | None = None
    rating: int | None = Field(default=None, ge=1, le=5)
    title: str | None = Field(default=None, max_length=200)
    body: str | None = Field(default=None, max_length=5000)

    _text = field_validator("title", "body")(_clean_text)

    @model_validator(mode="after")
    def _rating_not_null(self) -> ReviewUpdateIn:
        if "rating" in self.model_fields_set and self.rating is None:
            raise ValueError("rating cannot be empty")
        return self


class PatientReviewOut(ReviewOut):
    booking_id: uuid.UUID | None = None
    # Why staff hid the review (shown to its author only).
    moderation_reason: str | None = None
    updated_at: datetime | None = None
    editable: bool = False


class NameRef(BaseModel):
    id: uuid.UUID
    name: str


class ReviewableBookingOut(BaseModel):
    """A completed booking of the patient that has no review yet."""

    booking_id: uuid.UUID
    booking_number: str
    hospital: IdSlugName
    doctor: NameRef | None = None
    procedure: IdSlugName | None = None
    admission_date: date | None = None
    discharge_date: date | None = None
    completed_at: datetime | None = None


class AdminReviewOut(ReviewOut):
    booking_id: uuid.UUID | None = None
    booking_number: str | None = None
    patient_id: uuid.UUID
    moderation_reason: str | None = None
    moderated_at: datetime | None = None
    moderated_by_user_id: uuid.UUID | None = None
    updated_at: datetime | None = None


class ReviewModerateIn(_In):
    status: Literal["published", "hidden"]
    reason: str | None = Field(default=None, max_length=1000)

    _text = field_validator("reason")(_clean_text)

    @model_validator(mode="after")
    def _reason_for_hide(self) -> ReviewModerateIn:
        if self.status == "hidden" and not self.reason:
            raise ValueError("A reason is required to hide a review")
        return self


# ----------------------------------------------------------------------------- accreditations
def _normalize_body(value: str | None) -> str | None:
    if value is None:
        return None
    body = value.strip().lower().replace(" ", "-")
    if not _BODY_RE.match(body):
        raise ValueError("body must be a short accreditation code such as jci, nabh or nabl")
    return body


class AccreditationIn(_In):
    body: str = Field(min_length=2, max_length=20, description="Accrediting body code, e.g. jci, nabh, nabl")
    certificate_number: str | None = Field(default=None, max_length=100)
    valid_until: date | None = None
    document_id: uuid.UUID | None = Field(default=None, description="Uploaded certificate (documents API)")

    _body = field_validator("body")(_normalize_body)
    _cert = field_validator("certificate_number")(_clean_text)


class AccreditationPatch(_In):
    body: str | None = Field(default=None, min_length=2, max_length=20)
    certificate_number: str | None = Field(default=None, max_length=100)
    valid_until: date | None = None
    document_id: uuid.UUID | None = None

    _body = field_validator("body")(_normalize_body)
    _cert = field_validator("certificate_number")(_clean_text)

    @model_validator(mode="after")
    def _body_not_null(self) -> AccreditationPatch:
        if "body" in self.model_fields_set and self.body is None:
            raise ValueError("body cannot be empty")
        return self


class AccreditationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    hospital_id: uuid.UUID
    body: str
    certificate_number: str | None = None
    valid_until: date | None = None
    document_id: uuid.UUID | None = None
    verified: bool = False
    verified_at: datetime | None = None
    verified_by_admin_id: uuid.UUID | None = None
    # verified and not expired: shown publicly in ``accreditations_verified``
    is_public: bool = False
    created_at: datetime
    updated_at: datetime
