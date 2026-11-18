"""HL7 FHIR R4 export of a discharge summary: a ``Bundle`` of type ``document``.

The first entry is the ``Composition`` (LOINC 18842-5 "Discharge summary"); the bundle also holds the
``Patient``, ``Practitioner`` (treating doctor), ``Organization`` (hospital), ``Encounter`` (the inpatient
stay), ``Condition`` (diagnosis), ``Procedure``, one ``MedicationStatement`` per medicine and an
``AllergyIntolerance``. Every reference is a ``urn:uuid:`` ``fullUrl`` inside the bundle, so the document is
self-contained (FHIR R4 3.3.1 document bundles). Ids are stable per summary (UUIDv5), so two exports of the
same final version are identical apart from ``timestamp``/``meta.lastUpdated``.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from html import escape
from typing import Any

FHIR_MEDIA_TYPE = "application/fhir+json"
LOINC = "http://loinc.org"
SNOMED = "http://snomed.info/sct"
ICD10 = "http://hl7.org/fhir/sid/icd-10"
IDENTIFIER_SYSTEM = "https://healindiaglobal.com/fhir/discharge-summary"
CASE_SYSTEM = "https://healindiaglobal.com/fhir/case"

_NS = uuid.UUID("8f6f0d7e-2d0b-4b55-9c55-3b6a2f1a4e10")


@dataclass(slots=True)
class FhirMedication:
    name: str
    dose: str | None = None
    frequency: str | None = None
    duration_days: int | None = None
    route: str | None = None
    instructions: str | None = None


@dataclass(slots=True)
class FhirContext:
    summary_id: uuid.UUID
    version: int
    status_final: bool
    finalized_at: datetime | None
    updated_at: datetime
    case_number: str
    patient_id: uuid.UUID
    patient_given: str
    patient_family: str
    patient_dob: date | None
    patient_gender: str | None  # male | female | other | unknown
    patient_country: str | None
    hospital_id: uuid.UUID
    hospital_name: str
    hospital_city: str | None
    hospital_country: str | None
    hospital_phone: str | None
    hospital_email: str | None
    doctor_id: uuid.UUID | None
    doctor_name: str | None
    doctor_registration: str | None
    admission_date: date | None
    discharge_date: date | None
    diagnosis: str | None
    diagnosis_code: str | None
    procedure_name: str | None
    procedure_code: str | None
    procedure_date: date | None
    hospital_course: str | None
    follow_up_instructions: str | None
    red_flag_symptoms: str | None
    allergies: str | None
    investigations_summary: str | None
    medications: list[FhirMedication] = field(default_factory=list)


def _urn(ctx: FhirContext, kind: str, index: int | str = 0) -> str:
    return f"urn:uuid:{uuid.uuid5(_NS, f'{ctx.summary_id}:{ctx.version}:{kind}:{index}')}"


def _narrative(text: str) -> dict[str, str]:
    body = "<br/>".join(escape(line) for line in text.strip().splitlines()) or escape(text)
    return {"status": "generated", "div": f'<div xmlns="http://www.w3.org/1999/xhtml">{body}</div>'}


def _iso(value: datetime) -> str:
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def _ref(urn: str, display: str | None = None) -> dict[str, str]:
    ref = {"reference": urn}
    if display:
        ref["display"] = display
    return ref


def build_bundle(ctx: FhirContext, *, now: datetime | None = None) -> dict[str, Any]:
    """The FHIR R4 document ``Bundle`` (a JSON-ready dict)."""
    now = now or datetime.now(UTC)
    patient_urn = _urn(ctx, "patient")
    org_urn = _urn(ctx, "organization")
    practitioner_urn = _urn(ctx, "practitioner") if ctx.doctor_name else None
    encounter_urn = _urn(ctx, "encounter")
    condition_urn = _urn(ctx, "condition") if (ctx.diagnosis or ctx.diagnosis_code) else None
    procedure_urn = _urn(ctx, "procedure") if (ctx.procedure_name or ctx.procedure_code) else None
    allergy_urn = _urn(ctx, "allergy")
    patient_name = f"{ctx.patient_given} {ctx.patient_family}".strip()

    patient: dict[str, Any] = {
        "resourceType": "Patient",
        "identifier": [{"system": "https://healindiaglobal.com/fhir/patient", "value": str(ctx.patient_id)}],
        "name": [{"use": "official", "family": ctx.patient_family or None, "given": [ctx.patient_given]}],
        "gender": ctx.patient_gender or "unknown",
    }
    if not ctx.patient_family:
        patient["name"][0].pop("family")
        patient["name"][0]["text"] = patient_name
    if ctx.patient_dob:
        patient["birthDate"] = ctx.patient_dob.isoformat()
    if ctx.patient_country:
        patient["address"] = [{"country": ctx.patient_country}]

    organization: dict[str, Any] = {
        "resourceType": "Organization",
        "identifier": [
            {"system": "https://healindiaglobal.com/fhir/hospital", "value": str(ctx.hospital_id)}
        ],
        "active": True,
        "type": [
            {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/organization-type",
                        "code": "prov",
                        "display": "Healthcare Provider",
                    }
                ]
            }
        ],
        "name": ctx.hospital_name,
    }
    telecom = [
        {"system": s, "value": v}
        for s, v in (("phone", ctx.hospital_phone), ("email", ctx.hospital_email))
        if v
    ]
    if telecom:
        organization["telecom"] = telecom
    if ctx.hospital_city or ctx.hospital_country:
        organization["address"] = [
            {k: v for k, v in (("city", ctx.hospital_city), ("country", ctx.hospital_country)) if v}
        ]

    entries: list[tuple[str, dict[str, Any]]] = []
    practitioner: dict[str, Any] | None = None
    if practitioner_urn:
        practitioner = {"resourceType": "Practitioner", "name": [{"text": ctx.doctor_name}]}
        if ctx.doctor_registration:
            practitioner["identifier"] = [
                {"system": "https://www.nmc.org.in/doctor-registration", "value": ctx.doctor_registration}
            ]

    encounter: dict[str, Any] = {
        "resourceType": "Encounter",
        "status": "finished",
        "class": {
            "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
            "code": "IMP",
            "display": "inpatient encounter",
        },
        "identifier": [{"system": CASE_SYSTEM, "value": ctx.case_number}],
        "subject": _ref(patient_urn, patient_name),
        "serviceProvider": _ref(org_urn, ctx.hospital_name),
    }
    period = {
        k: v.isoformat()
        for k, v in (("start", ctx.admission_date), ("end", ctx.discharge_date))
        if v is not None
    }
    if period:
        encounter["period"] = period
    if practitioner_urn:
        encounter["participant"] = [{"individual": _ref(practitioner_urn, ctx.doctor_name)}]
    if condition_urn:
        encounter["diagnosis"] = [{"condition": _ref(condition_urn), "rank": 1}]

    condition: dict[str, Any] | None = None
    if condition_urn:
        code: dict[str, Any] = {"text": (ctx.diagnosis or ctx.diagnosis_code or "").strip()}
        if ctx.diagnosis_code:
            code["coding"] = [{"system": ICD10, "code": ctx.diagnosis_code}]
        condition = {
            "resourceType": "Condition",
            "clinicalStatus": {
                "coding": [
                    {"system": "http://terminology.hl7.org/CodeSystem/condition-clinical", "code": "active"}
                ]
            },
            "verificationStatus": {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/condition-ver-status",
                        "code": "confirmed",
                    }
                ]
            },
            "category": [
                {
                    "coding": [
                        {
                            "system": "http://terminology.hl7.org/CodeSystem/condition-category",
                            "code": "encounter-diagnosis",
                        }
                    ]
                }
            ],
            "code": code,
            "subject": _ref(patient_urn, patient_name),
            "encounter": _ref(encounter_urn),
        }

    procedure: dict[str, Any] | None = None
    if procedure_urn:
        pcode: dict[str, Any] = {"text": (ctx.procedure_name or ctx.procedure_code or "").strip()}
        if ctx.procedure_code:
            pcode["coding"] = [{"system": SNOMED, "code": ctx.procedure_code}]
        procedure = {
            "resourceType": "Procedure",
            "status": "completed",
            "code": pcode,
            "subject": _ref(patient_urn, patient_name),
            "encounter": _ref(encounter_urn),
        }
        if ctx.procedure_date:
            procedure["performedDateTime"] = ctx.procedure_date.isoformat()
        if practitioner_urn:
            procedure["performer"] = [{"actor": _ref(practitioner_urn, ctx.doctor_name)}]
        if condition_urn:
            procedure["reasonReference"] = [_ref(condition_urn)]

    medication_entries: list[tuple[str, dict[str, Any]]] = []
    for i, med in enumerate(ctx.medications):
        dosage_text = ", ".join(
            x
            for x in (
                med.dose,
                med.frequency,
                f"for {med.duration_days} days" if med.duration_days else None,
                med.instructions,
            )
            if x
        )
        dosage: dict[str, Any] = {"text": dosage_text or med.name}
        if med.route:
            dosage["route"] = {"text": med.route}
        statement: dict[str, Any] = {
            "resourceType": "MedicationStatement",
            "status": "active",
            "medicationCodeableConcept": {"text": med.name},
            "subject": _ref(patient_urn, patient_name),
            "context": _ref(encounter_urn),
            "dosage": [dosage],
        }
        if ctx.discharge_date:
            eff: dict[str, str] = {"start": ctx.discharge_date.isoformat()}
            if med.duration_days:
                eff["end"] = (ctx.discharge_date + timedelta(days=med.duration_days)).isoformat()
            statement["effectivePeriod"] = eff
        if ctx.finalized_at:
            statement["dateAsserted"] = _iso(ctx.finalized_at)
        medication_entries.append((_urn(ctx, "medication", i), statement))

    allergy_text = (ctx.allergies or "").strip()
    if allergy_text:
        allergy: dict[str, Any] = {
            "resourceType": "AllergyIntolerance",
            "clinicalStatus": {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical",
                        "code": "active",
                    }
                ]
            },
            "verificationStatus": {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/allergyintolerance-verification",
                        "code": "unconfirmed",
                    }
                ]
            },
            "code": {"text": allergy_text},
            "patient": _ref(patient_urn, patient_name),
            "encounter": _ref(encounter_urn),
        }
    else:
        # No allergies recorded: SNOMED CT 716186003 "No known allergy".
        allergy = {
            "resourceType": "AllergyIntolerance",
            "clinicalStatus": {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical",
                        "code": "active",
                    }
                ]
            },
            "code": {"coding": [{"system": SNOMED, "code": "716186003", "display": "No known allergy"}]},
            "patient": _ref(patient_urn, patient_name),
        }

    # ------------------------------------------------------------------ composition (sections)
    def section(title: str, loinc: str, text: str | None, refs: list[str] | None = None) -> dict[str, Any]:
        out: dict[str, Any] = {
            "title": title,
            "code": {"coding": [{"system": LOINC, "code": loinc, "display": title}]},
            "text": _narrative(text.strip() if text and text.strip() else "Not recorded"),
        }
        if refs:
            out["entry"] = [_ref(r) for r in refs]
        return out

    meds_text = "\n".join(
        f"{m.name}: "
        + (
            ", ".join(
                x
                for x in (m.dose, m.frequency, f"{m.duration_days} days" if m.duration_days else "ongoing")
                if x
            )
        )
        for m in ctx.medications
    )
    sections = [
        section(
            "Discharge diagnosis",
            "11535-2",
            (ctx.diagnosis or "") + (f" (ICD-10 {ctx.diagnosis_code})" if ctx.diagnosis_code else ""),
            [condition_urn] if condition_urn else None,
        ),
        section(
            "Procedures",
            "47519-4",
            " ".join(
                x
                for x in (ctx.procedure_name, ctx.procedure_date.isoformat() if ctx.procedure_date else None)
                if x
            ),
            [procedure_urn] if procedure_urn else None,
        ),
        section("Hospital course", "8648-8", ctx.hospital_course),
        section("Relevant diagnostic tests and laboratory data", "30954-2", ctx.investigations_summary),
        section(
            "Allergies and adverse reactions", "48765-2", allergy_text or "No known allergy", [allergy_urn]
        ),
        section(
            "Discharge medications",
            "10183-2",
            meds_text or "None",
            [u for u, _ in medication_entries] or None,
        ),
        section(
            "Plan of care and follow-up",
            "18776-5",
            "\n".join(
                x
                for x in (
                    ctx.follow_up_instructions,
                    f"Return / seek urgent care if: {ctx.red_flag_symptoms}"
                    if ctx.red_flag_symptoms
                    else None,
                )
                if x
            ),
        ),
    ]
    composition: dict[str, Any] = {
        "resourceType": "Composition",
        "identifier": {"system": IDENTIFIER_SYSTEM, "value": f"{ctx.summary_id}/v{ctx.version}"},
        "status": "final" if ctx.status_final else "preliminary",
        "type": {"coding": [{"system": LOINC, "code": "18842-5", "display": "Discharge summary"}]},
        "subject": _ref(patient_urn, patient_name),
        "encounter": _ref(encounter_urn),
        "date": _iso(ctx.finalized_at or ctx.updated_at),
        "author": [_ref(practitioner_urn, ctx.doctor_name)]
        if practitioner_urn
        else [_ref(org_urn, ctx.hospital_name)],
        "title": "Discharge summary",
        "custodian": _ref(org_urn, ctx.hospital_name),
        "section": sections,
    }
    if practitioner_urn and ctx.status_final:
        composition["attester"] = [
            {
                "mode": "legal",
                "time": _iso(ctx.finalized_at or ctx.updated_at),
                "party": _ref(practitioner_urn, ctx.doctor_name),
            }
        ]

    entries.append((_urn(ctx, "composition"), composition))
    entries.append((patient_urn, patient))
    if practitioner_urn and practitioner is not None:
        entries.append((practitioner_urn, practitioner))
    entries.append((org_urn, organization))
    entries.append((encounter_urn, encounter))
    if condition_urn and condition is not None:
        entries.append((condition_urn, condition))
    if procedure_urn and procedure is not None:
        entries.append((procedure_urn, procedure))
    entries.extend(medication_entries)
    entries.append((allergy_urn, allergy))

    for urn, resource in entries:
        resource["id"] = urn.removeprefix("urn:uuid:")
    return {
        "resourceType": "Bundle",
        "id": str(uuid.uuid5(_NS, f"{ctx.summary_id}:{ctx.version}:bundle")),
        "meta": {"lastUpdated": _iso(now)},
        "identifier": {"system": IDENTIFIER_SYSTEM, "value": f"{ctx.summary_id}/v{ctx.version}/bundle"},
        "type": "document",
        "timestamp": _iso(now),
        "entry": [{"fullUrl": urn, "resource": resource} for urn, resource in entries],
    }


def collect_references(value: Any) -> list[str]:
    """Every ``reference`` string in a resource tree (used by tests and by :func:`validate_bundle`)."""
    found: list[str] = []
    if isinstance(value, dict):
        for k, v in value.items():
            if k == "reference" and isinstance(v, str):
                found.append(v)
            else:
                found.extend(collect_references(v))
    elif isinstance(value, list):
        for item in value:
            found.extend(collect_references(item))
    return found


#: minimal required elements per resource type (FHIR R4 cardinality 1..*)
REQUIRED: dict[str, tuple[str, ...]] = {
    "Composition": ("status", "type", "date", "author", "title"),
    "Encounter": ("status", "class"),
    "Condition": ("subject",),
    "Procedure": ("status", "subject"),
    "MedicationStatement": ("status", "subject"),
    "AllergyIntolerance": ("patient",),
    "Patient": (),
    "Practitioner": (),
    "Organization": (),
}


def validate_bundle(bundle: dict[str, Any]) -> list[str]:
    """Structural checks of a document bundle: type, Composition first, required elements, unique fullUrls
    and every reference resolving inside the bundle. Returns the problems (empty = valid)."""
    problems: list[str] = []
    if bundle.get("resourceType") != "Bundle" or bundle.get("type") != "document":
        problems.append("not a document Bundle")
    if not bundle.get("identifier") or not bundle.get("timestamp"):
        problems.append("document Bundle needs identifier and timestamp")
    entries = bundle.get("entry") or []
    if not entries or entries[0].get("resource", {}).get("resourceType") != "Composition":
        problems.append("first entry must be a Composition")
    urls = [e.get("fullUrl") for e in entries]
    if len(set(urls)) != len(urls) or any(not u for u in urls):
        problems.append("fullUrl values must be present and unique")
    known = set(urls)
    for e in entries:
        res = e.get("resource") or {}
        rtype = res.get("resourceType")
        if rtype not in REQUIRED:
            problems.append(f"unexpected resource {rtype}")
            continue
        for name in REQUIRED[rtype]:
            if not res.get(name):
                problems.append(f"{rtype}.{name} is required")
        for ref in collect_references(res):
            if ref not in known:
                problems.append(f"{rtype} reference {ref} does not resolve")
    return problems
