"""Shared fixtures/builders for the screening tests."""

from __future__ import annotations

import json
from dataclasses import dataclass
from types import SimpleNamespace
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import Gender
from app.models import (
    CostBenchmark,
    Doctor,
    Hospital,
    HospitalProcedure,
    PatientProfile,
    Procedure,
    Specialty,
    TreatmentPackage,
    User,
)
from tests.factories import (
    create_doctor,
    create_fx_rates,
    create_hospital,
    create_hospital_procedure,
    create_package,
    create_patient,
    create_procedure,
    create_specialty,
    create_user,
)


@dataclass
class World:
    ortho: Specialty
    cardio: Specialty
    tkr: Procedure
    cabg: Procedure
    hosp_a: Hospital  # JCI + NABH, speaks Arabic, has a package (INR 4,00,000)
    hosp_b: Hospital  # NABH only, cheaper (INR 3,00,000), no package
    hosp_c: Hospital  # no accreditation, otherwise like B
    doc_a: Doctor  # female, ar
    doc_b: Doctor  # male, en/hi
    doc_c: Doctor  # male, en/hi
    cardio_doc: Doctor
    hp_a: HospitalProcedure
    hp_b: HospitalProcedure
    package_a: TreatmentPackage
    patient_user: User
    patient: PatientProfile


async def build_world(db: AsyncSession) -> World:
    await create_fx_rates(db)
    ortho = await create_specialty(db, slug="orthopedics", name="Orthopedics")
    cardio = await create_specialty(db, slug="cardiology", name="Cardiology")
    tkr = await create_procedure(
        db,
        ortho,
        slug="total-knee-replacement",
        name="Total Knee Replacement",
        keywords=["knee replacement", "arthritis", "knee"],
        body_areas=["knee"],
    )
    cabg = await create_procedure(
        db,
        cardio,
        slug="cabg",
        name="Coronary Artery Bypass",
        keywords=["bypass", "angina"],
        body_areas=["chest"],
    )

    hosp_a = await create_hospital(db, accreditations=["jci", "nabh"], languages=["en", "ar"])
    hosp_b = await create_hospital(db, accreditations=["nabh"], languages=["en", "hi"])
    hosp_c = await create_hospital(db, accreditations=[], languages=["en", "hi"])
    common = {"rating_avg": 4.8, "rating_count": 50, "success_rate_pct": 97}
    doc_a = await create_doctor(db, hosp_a, ortho, gender=Gender.FEMALE, languages=["en", "ar"], **common)
    doc_b = await create_doctor(db, hosp_b, ortho, gender=Gender.MALE, languages=["en", "hi"], **common)
    doc_c = await create_doctor(db, hosp_c, ortho, gender=Gender.MALE, languages=["en", "hi"], **common)
    cardio_doc = await create_doctor(db, hosp_a, cardio, gender=Gender.MALE, languages=["en"], **common)

    hp_a = await create_hospital_procedure(
        db, hosp_a, tkr, doctor_ids=[doc_a.id], price_min_minor=3_90_000_00, success_rate_pct=96
    )
    package_a = await create_package(db, hp_a, tier="medical_only", price_minor=4_00_000_00)
    hp_b = await create_hospital_procedure(db, hosp_b, tkr, price_min_minor=3_00_000_00, success_rate_pct=96)
    await create_hospital_procedure(db, hosp_c, tkr, price_min_minor=3_00_000_00, success_rate_pct=96)
    db.add(
        CostBenchmark(
            procedure_id=tkr.id,
            country_code="US",
            currency="USD",
            cost_min_minor=30_000_00,
            cost_max_minor=50_000_00,
            wait_time_text="3-6 months",
        )
    )
    await db.commit()

    patient_user = await create_user(db, role="patient")
    patient = await create_patient(db, patient_user, nationality="US", country_of_residence="US")
    return World(
        ortho=ortho,
        cardio=cardio,
        tkr=tkr,
        cabg=cabg,
        hosp_a=hosp_a,
        hosp_b=hosp_b,
        hosp_c=hosp_c,
        doc_a=doc_a,
        doc_b=doc_b,
        doc_c=doc_c,
        cardio_doc=cardio_doc,
        hp_a=hp_a,
        hp_b=hp_b,
        package_a=package_a,
        patient_user=patient_user,
        patient=patient,
    )


def claude_triage_payload(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "summary": "Knee pain consistent with osteoarthritis.",
        "suggested_specialties": [
            {"slug": "orthopedics", "name": "Ortho", "confidence": 0.92, "rationale": "Knee joint pain."},
            {"slug": "made-up-specialty", "name": "Nope", "confidence": 0.5, "rationale": "Invented."},
        ],
        "possible_conditions": [
            {"name": "Osteoarthritis", "likelihood": "high", "notes": "Age and symptoms."}
        ],
        "recommended_procedures": [
            {"slug": "total-knee-replacement", "name": "TKR", "rationale": "Advanced arthritis."},
            {"slug": "fake-procedure", "name": "Fake", "rationale": "Invented."},
        ],
        "urgency": "routine",
        "red_flags": [],
        "recommended_tests": ["Standing knee X-ray"],
        "questions_for_doctor": ["Which implant do you use?"],
        "travel_advice": "Plan for 3 weeks in India.",
        "disclaimer": "Not a diagnosis.",
    }
    payload.update(overrides)
    return payload


def fake_response(
    *, text: str | None = None, stop_reason: str = "end_turn", model: str = "claude-opus-5-5"
) -> SimpleNamespace:
    content: list[SimpleNamespace] = [SimpleNamespace(type="thinking", thinking="")]
    if text is not None:
        content.append(SimpleNamespace(type="text", text=text))
    return SimpleNamespace(
        stop_reason=stop_reason,
        stop_details=SimpleNamespace(type="refusal", category="bio", explanation="x")
        if stop_reason == "refusal"
        else None,
        content=content,
        usage=SimpleNamespace(
            input_tokens=1200, output_tokens=300, cache_read_input_tokens=0, cache_creation_input_tokens=0
        ),
        model=model,
    )


def json_response(payload: dict[str, Any]) -> SimpleNamespace:
    return fake_response(text=json.dumps(payload))
