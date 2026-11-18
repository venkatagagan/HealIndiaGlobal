"""Localized server-supplied content (audit E8 + E7): catalog names/descriptions, search over translations,
admin content translations, visa guide texts, structured wait times and the screening result in the patient's
language (Claude block + rules-engine templates)."""

from __future__ import annotations

import json
from typing import Any

import pytest
from sqlalchemy import select

from app.i18n import t
from app.i18n.content import (
    glossary,
    glossary_sources_matching,
    localize_text,
    localize_wait_text,
    plural_category,
)
from app.models import AuditLog
from app.models.i18n import ContentTranslation
from app.modules.screening.ai import rules as rules_engine
from app.modules.screening.ai.schema import (
    DISCLAIMER,
    CatalogProcedure,
    CatalogSnapshot,
    CatalogSpecialty,
    LocalizedCondition,
    PatientLocalized,
    PossibleCondition,
    TriageResult,
)
from app.modules.screening.service import _localize_result
from app.modules.travel import visa_data
from tests.factories import create_procedure, create_specialty
from tests.modules.catalog_helpers import add_benchmark
from tests.modules.test_i18n import enable

API = "/api/v1"
LOCALES = ("ar", "fr", "bn", "ru")
CARDIO = "Cardiology & Cardiac Surgery"


# ----------------------------------------------------------------------------------------- shipped data
def test_shipped_translations_cover_the_seeded_content() -> None:
    from scripts.seed_data.catalog import PROCEDURES, SPECIALTIES

    sources = [s["name"] for s in SPECIALTIES] + [s["description"] for s in SPECIALTIES]
    sources += [p["name"] for p in PROCEDURES] + [
        p["description"] for p in PROCEDURES if p.get("description")
    ]
    sources += [r["notes"] for r in visa_data.default_rules() if "TODO" not in r["notes"]]
    sources += [visa_data.FALLBACK_RULE["notes"]]
    for item in visa_data.default_checklist():
        sources += [item["title"], item["description"]]
    for code in LOCALES:
        missing = [s for s in sources if s not in glossary(code)]
        assert not missing, (code, missing[:3])
        assert all(v.strip() for v in glossary(code).values())
    assert glossary("en") == {}


def test_plural_rules_and_wait_times() -> None:
    assert [plural_category(n, "ru") for n in (1, 2, 5, 11, 21, 22)] == [
        "one",
        "few",
        "many",
        "many",
        "one",
        "few",
    ]
    assert [plural_category(n, "ar") for n in (0, 1, 2, 3, 11, 100)] == [
        "zero",
        "one",
        "two",
        "few",
        "many",
        "other",
    ]
    assert localize_wait_text("6–18 months (NHS)", "ru") == "6–18 месяцев (NHS)"
    assert localize_wait_text("1–3 months", "ru") == "1–3 месяца"
    assert localize_wait_text("1–2 weeks", "fr") == "1–2 semaines"
    assert localize_wait_text("4–12 weeks (private)", "fr") == "4–12 semaines (privé)"
    assert localize_wait_text("2-8 weeks", "ar") == "2–8 أسابيع"
    assert localize_wait_text("Limited local availability", "bn") == t("content.wait.limited", "bn")
    assert localize_wait_text("18 weeks (NHS target)", "fr") is None  # free text: normal translation layers
    assert localize_text("4–12 weeks", "en") == "4–12 weeks"
    assert localize_text("1–2 weeks", "ru", field="wait_time_text") == "1–2 недели"


def test_glossary_search_finds_english_sources() -> None:
    french = glossary("fr")[CARDIO]
    assert CARDIO in glossary_sources_matching(french[:6])
    assert glossary_sources_matching("x") == []


def test_english_templates_match_the_canonical_rules_text() -> None:
    assert t("screening.disclaimer", "en") == DISCLAIMER
    assert t("screening.rules.emergency_advice", "en") == rules_engine.EMERGENCY_ADVICE


# ------------------------------------------------------------------------------------------ public catalog
async def test_catalog_is_served_in_the_request_language(db: Any, client: Any) -> None:
    await enable(db, "fr", "ar")
    spec = await create_specialty(db, slug="cardiology", name=CARDIO, description=None)
    from scripts.seed_data.catalog import PROCEDURES

    cabg = next(p for p in PROCEDURES if p["slug"] == "cabg")
    proc = await create_procedure(db, spec, slug="cabg", name=cabg["name"], description=cabg["description"])
    await add_benchmark(db, proc, "GB", "GBP", 1_000_000, 2_000_000, wait_time_text="6–18 months (NHS)")

    english = (await client.get(f"{API}/specialties")).json()
    assert english[0]["name"] == CARDIO
    r = await client.get(f"{API}/specialties", headers={"Accept-Language": "fr-FR,fr;q=0.9"})
    assert r.json()[0]["name"] == glossary("fr")[CARDIO]
    assert "accept-language" in r.headers["vary"].lower()
    assert r.headers["content-language"] == "fr"

    r = await client.get(f"{API}/procedures/cabg", params={"lang": "ar"})
    body = r.json()
    assert body["name"] == glossary("ar")[cabg["name"]]
    assert body["description"] == glossary("ar")[cabg["description"]]
    assert body["specialty"]["name"] == glossary("ar")[CARDIO]
    assert body["benchmarks"][0]["wait_time_text"] == "6–18 شهرًا (NHS)"

    r = await client.get(
        f"{API}/cost-comparison", params={"procedure": "cabg", "country": "GB", "lang": "fr"}
    )
    assert r.status_code == 200, r.text
    cost = r.json()
    assert cost["home"]["wait_time_text"] == "6–18 mois (NHS)"
    assert cost["india"]["wait_time_text"] == "1–2 semaines"
    assert cost["procedure"]["name"] == glossary("fr")[cabg["name"]]

    # a disabled language is never served
    r = await client.get(f"{API}/specialties", params={"lang": "ru"})
    assert r.json()[0]["name"] == CARDIO


async def test_admin_content_translations_win_and_are_searchable(
    db: Any, client: Any, make_user: Any, auth_headers: Any
) -> None:
    await enable(db, "ar", "ru")
    admin = await make_user(role="admin")
    spec = await create_specialty(db, slug="ortho", name="Orthopedics")
    proc = await create_procedure(db, spec, slug="knee", name="Knee Replacement", description="New knee.")
    url = f"{API}/admin/content-translations/procedure/{proc.id}"

    patient = await make_user(role="patient")
    assert (await client.get(url, headers=auth_headers(patient))).status_code == 403

    r = await client.put(
        url,
        json={"translations": [{"locale": "ar", "field": "name", "text": "<b>استبدال</b> الركبة"}]},
        headers=auth_headers(admin),
    )
    assert r.status_code == 200, r.text
    name = next(f for f in r.json()["fields"] if f["field"] == "name")
    assert name["source"] == "Knee Replacement"
    assert name["translations"]["ar"]["text"] == "استبدال الركبة"  # HTML stripped
    assert name["translations"]["ar"]["effective"] == "استبدال الركبة"
    assert name["translations"]["fr"]["effective"] == "Knee Replacement"
    audit = (
        await db.execute(select(AuditLog).where(AuditLog.action == "i18n.content_translation_set"))
    ).scalars()
    assert len(list(audit)) == 1

    body = (await client.get(f"{API}/procedures/knee", params={"lang": "ar"})).json()
    assert body["name"] == "استبدال الركبة" and body["description"] == "New knee."
    assert (await client.get(f"{API}/procedures/knee")).json()["name"] == "Knee Replacement"

    found = (await client.get(f"{API}/search", params={"q": "الركبة"})).json()
    assert [p["slug"] for p in found["procedures"]] == ["knee"]
    found = (await client.get(f"{API}/procedures", params={"q": "الركبة", "lang": "ar"})).json()
    assert found[0]["name"] == "استبدال الركبة"

    bad = await client.put(
        url,
        json={"translations": [{"locale": "ar", "field": "bio", "text": "x"}]},
        headers=auth_headers(admin),
    )
    assert bad.status_code == 422
    bad = await client.put(
        url,
        json={"translations": [{"locale": "en", "field": "name", "text": "x"}]},
        headers=auth_headers(admin),
    )
    assert bad.status_code == 422
    missing = f"{API}/admin/content-translations/procedure/00000000-0000-0000-0000-000000000000"
    assert (await client.get(missing, headers=auth_headers(admin))).status_code == 404

    r = await client.put(
        url,
        json={"translations": [{"locale": "ar", "field": "name", "text": ""}]},
        headers=auth_headers(admin),
    )
    assert r.status_code == 200
    assert (await db.execute(select(ContentTranslation))).first() is None
    assert (await client.get(f"{API}/procedures/knee", params={"lang": "ar"})).json()[
        "name"
    ] == "Knee Replacement"


# --------------------------------------------------------------------------------------------- visa guide
async def test_visa_guide_in_the_request_language(
    db: Any, client: Any, make_user: Any, auth_headers: Any
) -> None:
    await enable(db, "fr")
    r = await client.get(f"{API}/travel/visa-guide", params={"nationality": "US", "lang": "fr"})
    guide = r.json()
    assert guide["notes"] == glossary("fr")[visa_data.EVISA_NOTE]
    passport = next(i for i in guide["checklist"] if i["item_key"] == "passport")
    assert passport["title"] == glossary("fr")["Passport valid for 6 months"]
    assert "accept-language" in r.headers["vary"].lower()

    admin = await make_user(role="admin")
    r = await client.put(
        f"{API}/admin/content-translations/visa_checklist/e_visa:*:passport",
        json={"translations": [{"locale": "fr", "field": "title", "text": "Passeport (6 mois)"}]},
        headers=auth_headers(admin),
    )
    assert r.status_code == 200, r.text
    r = await client.put(
        f"{API}/admin/content-translations/visa_rule/us",
        json={
            "translations": [
                {"locale": "fr", "field": "notes", "text": "Demandez le visa e-Medical en ligne."}
            ]
        },
        headers=auth_headers(admin),
    )
    assert r.status_code == 200, r.text
    assert r.json()["entity_id"] == "US"
    guide = (await client.get(f"{API}/travel/visa-guide", params={"nationality": "US", "lang": "fr"})).json()
    assert guide["notes"] == "Demandez le visa e-Medical en ligne."
    assert next(i for i in guide["checklist"] if i["item_key"] == "passport")["title"] == "Passeport (6 mois)"
    english = (await client.get(f"{API}/travel/visa-guide", params={"nationality": "US"})).json()
    assert english["notes"] == visa_data.EVISA_NOTE


# ---------------------------------------------------------------------------------------------- screening
def _catalog() -> CatalogSnapshot:
    return CatalogSnapshot(
        specialties=(CatalogSpecialty(id="1", slug="cardiology", name=CARDIO),),
        procedures=(
            CatalogProcedure(
                id="2",
                slug="cabg",
                name="Coronary Artery Bypass Grafting (CABG)",
                specialty_slug="cardiology",
                keywords=("bypass", "blocked arteries"),
                body_areas=("chest",),
            ),
        ),
    )


async def test_rules_engine_patient_texts_come_from_translated_templates(db: Any) -> None:
    await enable(db, "ar")
    intake = {
        "specialty_slug": "cardiology",
        "body_areas": ["chest"],
        "notes": "I need a heart bypass",
        "symptoms": [],
    }
    english = rules_engine.rules_triage(intake, _catalog())
    assert english.patient_localized is None and english.summary_localized == ""
    result = rules_engine.rules_triage(intake, _catalog(), language="ar")
    assert result.summary == english.summary and result.disclaimer == DISCLAIMER  # English stays canonical
    block = result.patient_localized
    assert block is not None and block.language == "ar" and result.summary_language == "ar"
    assert block.disclaimer == t("screening.disclaimer", "ar")
    assert glossary("ar")[CARDIO] in result.summary_localized
    assert len(block.questions_for_doctor) == len(result.questions_for_doctor)
    assert len(block.possible_conditions) == len(result.possible_conditions)

    emergency = rules_engine.rules_triage(
        {"notes": "crushing chest pain spreading to my left arm and sweating", "symptoms": []},
        _catalog(),
        "ar",
    )
    assert emergency.urgency.value == "emergency"
    assert emergency.patient_localized is not None
    assert emergency.patient_localized.travel_advice == t("screening.rules.emergency_advice", "ar")
    assert len(emergency.patient_localized.red_flags) == len(emergency.red_flags) > 0
    assert emergency.patient_localized.red_flags != emergency.red_flags

    disabled = rules_engine.rules_triage(intake, _catalog(), language="ru")  # ru is not enabled
    assert disabled.patient_localized is None


def test_patient_view_swaps_in_the_localized_block() -> None:
    result = TriageResult(
        summary="See a cardiologist.",
        summary_localized="راجع طبيب القلب.",
        summary_language="ar",
        possible_conditions=[
            PossibleCondition(name="Angina", likelihood="medium", notes="Chest pain on effort.")
        ],
        recommended_tests=["ECG", "Echo"],
        questions_for_doctor=["Do I need surgery?"],
        travel_advice="Bring reports.",
        patient_localized=PatientLocalized(
            language="ar",
            possible_conditions=[LocalizedCondition(name="الذبحة الصدرية", notes="ألم في الصدر عند الجهد.")],
            recommended_tests=["تخطيط القلب"],  # length differs: English kept
            questions_for_doctor=["هل أحتاج إلى جراحة؟"],
            travel_advice="أحضر التقارير.",
            disclaimer="ليس تشخيصًا.",
        ),
    )
    patient = type("U", (), {"role": "patient"})()
    mine = _localize_result(result, patient)  # type: ignore[arg-type]
    assert mine.possible_conditions[0].name == "الذبحة الصدرية"
    assert mine.possible_conditions[0].likelihood == "medium"
    assert mine.recommended_tests == ["ECG", "Echo"]
    assert mine.questions_for_doctor == ["هل أحتاج إلى جراحة؟"]
    assert mine.travel_advice == "أحضر التقارير." and mine.disclaimer == "ليس تشخيصًا."
    assert mine.patient_localized is None
    hospital = type("U", (), {"role": "hospital"})()
    theirs = _localize_result(result, hospital)  # type: ignore[arg-type]
    assert theirs.possible_conditions[0].name == "Angina" and theirs.travel_advice == "Bring reports."
    assert theirs.patient_localized is None and theirs.summary == "See a cardiologist."


async def test_claude_request_asks_for_the_localized_block(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.modules.screening.ai import claude
    from tests.modules.test_docai import fake_response

    captured: list[dict[str, Any]] = []
    payload = {
        "summary": "Knee pain.",
        "summary_localized": "Douleur au genou.",
        "patient_localized": {
            "possible_conditions": [{"name": "Arthrose", "notes": "Usure du cartilage."}],
            "red_flags": [],
            "recommended_tests": ["Radiographie du genou"],
            "questions_for_doctor": [],
            "travel_advice": "Apportez vos radios.",
            "disclaimer": "Pas un diagnostic.",
        },
        "suggested_specialties": [],
        "possible_conditions": [
            {"name": "Osteoarthritis", "likelihood": "medium", "notes": "Wear and tear."}
        ],
        "recommended_procedures": [],
        "urgency": "routine",
        "red_flags": [],
        "recommended_tests": ["Knee X-ray"],
        "questions_for_doctor": [],
        "travel_advice": "Bring your X-rays.",
        "disclaimer": "Not a diagnosis.",
    }

    async def _fake(**kwargs: Any) -> Any:
        captured.append(kwargs)
        return fake_response(json.dumps(payload))

    monkeypatch.setattr(claude, "create_message", _fake)
    outcome = await claude.triage_with_claude({"notes": "genou"}, CatalogSnapshot(), [], language="fr")
    assert outcome.ok and outcome.result is not None
    block = outcome.result.patient_localized
    assert (
        block is not None and block.language == "fr" and block.recommended_tests == ["Radiographie du genou"]
    )
    schema = captured[0]["output_config"]["format"]["schema"]
    assert "patient_localized" in schema["required"]
    assert "patient_localized" in captured[0]["messages"][0]["content"][-1]["text"]

    payload["patient_localized"] = "garbage"  # a malformed block never fails the screening
    outcome = await claude.triage_with_claude({"notes": "genou"}, CatalogSnapshot(), [], language="fr")
    assert outcome.ok and outcome.result is not None and outcome.result.patient_localized is None

    english = await claude.triage_with_claude({"notes": "knee"}, CatalogSnapshot(), [], language="en")
    assert english.result is not None and english.result.patient_localized is None
    assert "patient_localized" not in captured[-1]["output_config"]["format"]["schema"]["properties"]
