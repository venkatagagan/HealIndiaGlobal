"""Request/response shapes for document intelligence (PLAN 7.1)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.docai import AnalysisDocType, AnalysisReviewStatus, DocumentAnalysisStatus
from app.modules.docai.ai import KeyFinding, LabValue, Medication

#: Fields the patient (or their agent/staff) may edit and confirm; ``confirmed_data`` holds exactly these.
EDITABLE_FIELDS: tuple[str, ...] = (
    "doc_type",
    "report_date",
    "facility_name",
    "key_findings",
    "lab_values",
    "diagnoses_mentioned",
    "medications",
    "procedures_mentioned",
    "recommendations",
    "summary_patient",
)

_ShortList = list[str]


class _Request(BaseModel):
    model_config = ConfigDict(extra="forbid")


def _clean_str_list(v: Any) -> Any:
    if not isinstance(v, list):
        return v
    out: list[str] = []
    for item in v:
        if isinstance(item, str) and item.strip() and item.strip() not in out:
            out.append(item.strip()[:500])
    return out


class AnalysisCreate(_Request):
    document_ids: list[uuid.UUID] = Field(min_length=1, max_length=50)
    #: agents (for their managed/referred patients) and staff; a patient may only name themself
    patient_id: uuid.UUID | None = None
    case_id: uuid.UUID | None = None
    consent_ai: bool = False


class AnalysisPatch(_Request):
    """Edit the draft (any subset of the editable fields; only while ``pending_review``)."""

    doc_type: AnalysisDocType | None = None
    report_date: date | None = None
    facility_name: str | None = Field(default=None, max_length=300)
    key_findings: list[KeyFinding] | None = Field(default=None, max_length=100)
    lab_values: list[LabValue] | None = Field(default=None, max_length=100)
    diagnoses_mentioned: _ShortList | None = Field(default=None, max_length=100)
    medications: list[Medication] | None = Field(default=None, max_length=100)
    procedures_mentioned: _ShortList | None = Field(default=None, max_length=100)
    recommendations: _ShortList | None = Field(default=None, max_length=100)
    summary_patient: str | None = Field(default=None, max_length=4000)

    _lists = field_validator("diagnoses_mentioned", "procedures_mentioned", "recommendations", mode="before")(
        _clean_str_list
    )


class AnalysisConfirm(_Request):
    """The final, patient-reviewed version. Omitted fields are taken from the current draft."""

    doc_type: AnalysisDocType | None = None
    report_date: date | None = None
    facility_name: str | None = Field(default=None, max_length=300)
    key_findings: list[KeyFinding] | None = Field(default=None, max_length=100)
    lab_values: list[LabValue] | None = Field(default=None, max_length=100)
    diagnoses_mentioned: _ShortList | None = Field(default=None, max_length=100)
    medications: list[Medication] | None = Field(default=None, max_length=100)
    procedures_mentioned: _ShortList | None = Field(default=None, max_length=100)
    recommendations: _ShortList | None = Field(default=None, max_length=100)
    summary_patient: str | None = Field(default=None, max_length=4000)

    _lists = field_validator("diagnoses_mentioned", "procedures_mentioned", "recommendations", mode="before")(
        _clean_str_list
    )


class DocumentAnalysisOut(BaseModel):
    """One analysis. ``audience`` tells the client which view it got:

    * ``owner`` (patient, their agent, staff): the working draft (or confirmed version) + ``ai_output``;
    * ``clinical`` (hospital members): only confirmed analyses, extraction fields = the confirmed version,
      ``ai_output`` omitted; ``edited_by_patient``/``edited_fields`` mark where it differs from the AI output.
    """

    id: uuid.UUID
    audience: Literal["owner", "clinical"]
    document_ids: list[uuid.UUID]
    primary_document_id: uuid.UUID
    patient_id: uuid.UUID
    case_id: uuid.UUID | None
    requested_by_user_id: uuid.UUID | None
    status: DocumentAnalysisStatus
    engine: str
    model: str | None
    error: str | None
    summary_language: str
    doc_type: AnalysisDocType | None
    language: str | None
    report_date: date | None
    facility_name: str | None
    summary_patient: str | None
    summary_clinical: str | None
    key_findings: list[dict[str, Any]]
    lab_values: list[dict[str, Any]]
    diagnoses_mentioned: list[str]
    medications: list[dict[str, Any]]
    procedures_mentioned: list[str]
    recommendations: list[str]
    red_flags: list[str]
    quality: dict[str, Any]
    suggested_specialties: list[str]
    confidence: Decimal | None
    review_status: AnalysisReviewStatus | None
    ai_output: dict[str, Any] | None = None
    confirmed_data: dict[str, Any] | None
    confirmed_by_user_id: uuid.UUID | None
    confirmed_at: datetime | None
    edited_by_patient: bool
    edited_fields: list[str]
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime
