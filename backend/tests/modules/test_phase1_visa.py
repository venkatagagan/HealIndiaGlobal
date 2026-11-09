"""Phase 1 visa help: country rules + checklists, visa guide, admin CRUD, visa type from the rule and the
hospital invitation letter (generate -> approve -> patient download)."""

from __future__ import annotations

from sqlalchemy import select

from app.core.crypto import encrypt_str
from app.models import Document, Notification, PatientCompanion, VisaCountryRule, VisaRequest
from app.modules.travel import visa_data
from app.modules.travel.invitation_letter import _passport
from tests.factories import create_case, create_hospital, create_user
from tests.modules.cases_helpers import (  # noqa: F401  (fixture import)
    EventLog,
    event_log_fixture,
    make_world,
)

API = "/api/v1"


def test_seed_data_is_consistent() -> None:
    rules = visa_data.default_rules()
    codes = [r["nationality"] for r in rules]
    assert len(codes) == len(set(codes))
    by_code = {r["nationality"]: r for r in rules}
    assert by_code["NP"]["visa_route"] == by_code["BT"]["visa_route"] == "not_required"
    assert by_code["PK"]["visa_route"] == "regular_visa"
    assert by_code["US"]["visa_route"] == "e_visa" and by_code["GB"]["max_attendants"] == 2
    assert all(len(c) == 2 and c.isupper() for c in codes)
    assert all(r["source"] and r["official_url"].startswith("https://") for r in rules)
    keys = [(i["visa_route"], i["nationality"], i["item_key"]) for i in visa_data.default_checklist()]
    assert len(keys) == len(set(keys))


async def test_visa_guide_routes(db, client) -> None:
    r = await client.get(f"{API}/travel/visa-guide", params={"nationality": "us"})
    assert r.status_code == 200, r.text
    us = r.json()
    assert us["nationality"] == "US" and us["country_name"] == "United States"
    assert us["visa_route"] == "e_visa" and us["visa_type"] == "e_medical"
    assert us["attendant_visa_type"] == "e_medical_attendant" and us["max_attendants"] == 2
    assert (
        us["typical_processing_days"] == 3 and us["official_url"] == "https://indianvisaonline.gov.in/evisa/"
    )
    assert {"passport", "apply_online", "invitation_letter"} <= {i["item_key"] for i in us["checklist"]}

    nepal = (await client.get(f"{API}/travel/visa-guide", params={"nationality": "NP"})).json()
    assert nepal["visa_route"] == "not_required" and nepal["visa_type"] == "not_required"
    assert nepal["attendant_visa_type"] is None

    pk = (await client.get(f"{API}/travel/visa-guide", params={"nationality": "PK"})).json()
    assert pk["visa_route"] == "regular_visa" and pk["visa_type"] == "medical"
    assert "pakistan_origin" in {i["item_key"] for i in pk["checklist"]}
    assert "pakistan_origin" not in {
        i["item_key"]
        for i in (await client.get(f"{API}/travel/visa-guide", params={"nationality": "BD"})).json()[
            "checklist"
        ]
    }

    unknown = (await client.get(f"{API}/travel/visa-guide", params={"nationality": "ZZ"})).json()
    assert unknown["visa_route"] == "regular_visa" and unknown["is_default"] is True
    assert (await client.get(f"{API}/travel/visa-guide", params={"nationality": "1A"})).status_code == 422


async def test_admin_visa_rule_crud(db, client, auth_headers) -> None:
    admin = await create_user(db, role="admin")
    support = await create_user(db, role="support")
    patient = await create_user(db, role="patient")
    a_h, s_h = auth_headers(admin), auth_headers(support)

    r = await client.post(f"{API}/admin/visa/load-defaults", headers=a_h)
    assert r.status_code == 200, r.text
    added = r.json()
    assert added["rules_added"] == len(visa_data.default_rules()) and added["checklist_items_added"] > 10
    again = (await client.post(f"{API}/admin/visa/load-defaults", headers=a_h)).json()
    assert again == {"rules_added": 0, "checklist_items_added": 0}

    r = await client.get(f"{API}/admin/visa/rules", params={"route": "not_required"}, headers=s_h)
    assert r.status_code == 200 and {x["nationality"] for x in r.json()} == {"NP", "BT"}
    assert (await client.post(f"{API}/admin/visa/load-defaults", headers=s_h)).status_code == 403
    assert (await client.get(f"{API}/admin/visa/rules", headers=auth_headers(patient))).status_code == 403

    r = await client.patch(
        f"{API}/admin/visa/rules/us",
        json={"visa_route": "regular_visa", "typical_processing_days": 10, "notes": "Temporarily paper only"},
        headers=a_h,
    )
    assert r.status_code == 200, r.text
    guide = (await client.get(f"{API}/travel/visa-guide", params={"nationality": "US"})).json()
    assert guide["visa_route"] == "regular_visa" and guide["typical_processing_days"] == 10
    assert guide["is_default"] is False and guide["updated_at"] is not None

    r = await client.post(
        f"{API}/admin/visa/rules",
        json={"nationality": "NP", "visa_route": "e_visa"},
        headers=a_h,
    )
    assert r.status_code == 409
    r = await client.post(
        f"{API}/admin/visa/rules",
        json={
            "nationality": "XK",
            "country_name": "Kosovo",
            "visa_route": "regular_visa",
            "max_attendants": 1,
        },
        headers=a_h,
    )
    assert r.status_code == 201, r.text
    r = await client.post(
        f"{API}/admin/visa/rules",
        json={"nationality": "XQ", "visa_route": "e_visa", "official_url": "http://insecure.example"},
        headers=a_h,
    )
    assert r.status_code == 422
    assert (await client.delete(f"{API}/admin/visa/rules/XK", headers=a_h)).status_code == 204
    assert (await client.delete(f"{API}/admin/visa/rules/XK", headers=a_h)).status_code == 404
    # with the table loaded, a nationality without a row falls back to the regular visa
    assert (await client.get(f"{API}/travel/visa-guide", params={"nationality": "XK"})).json()["is_default"]

    r = await client.post(
        f"{API}/admin/visa/checklist-items",
        json={
            "visa_route": "e_visa",
            "nationality": "ng",
            "item_key": "yellow_fever",
            "title": "Yellow fever certificate",
            "required": True,
            "sort_order": 50,
        },
        headers=a_h,
    )
    assert r.status_code == 201, r.text
    item = r.json()
    assert item["nationality"] == "NG"
    dup = {**{k: item[k] for k in ("visa_route", "nationality", "item_key", "title")}}
    assert (await client.post(f"{API}/admin/visa/checklist-items", json=dup, headers=a_h)).status_code == 409
    r = await client.patch(
        f"{API}/admin/visa/checklist-items/{item['id']}", json={"required": False}, headers=a_h
    )
    assert r.status_code == 200 and r.json()["required"] is False
    r = await client.get(f"{API}/admin/visa/checklist-items", params={"nationality": "NG"}, headers=s_h)
    assert [i["item_key"] for i in r.json()] == ["yellow_fever"]
    assert (
        await client.delete(f"{API}/admin/visa/checklist-items/{item['id']}", headers=a_h)
    ).status_code == 204
    assert (
        await db.execute(select(VisaCountryRule).where(VisaCountryRule.nationality == "XK"))
    ).first() is None


async def test_visa_request_type_from_nationality(db, client, auth_headers) -> None:
    world = await make_world(db)
    p_h = auth_headers(world.patient_user)

    async def new_case():
        return await create_case(db, world.patient, world.hospital, doctor_id=world.doctor.id)

    case = await new_case()
    r = await client.post(f"{API}/travel/visa-requests", json={"case_id": str(case.id)}, headers=p_h)
    assert r.status_code == 201 and r.json()["visa_type"] == "e_medical"

    world.patient.nationality = "PK"
    await db.commit()
    case = await new_case()
    r = await client.post(
        f"{API}/travel/visa-requests", json={"case_id": str(case.id), "visa_type": "e_medical"}, headers=p_h
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "visa_type_not_available"
    assert r.json()["error"]["details"]["allowed"] == ["medical"]
    r = await client.post(f"{API}/travel/visa-requests", json={"case_id": str(case.id)}, headers=p_h)
    assert r.status_code == 201 and r.json()["visa_type"] == "medical"
    assert r.json()["status"] == "documents_pending"

    world.patient.nationality = "NP"
    await db.commit()
    case = await new_case()
    r = await client.post(f"{API}/travel/visa-requests", json={"case_id": str(case.id)}, headers=p_h)
    assert r.status_code == 201, r.text
    assert r.json()["visa_type"] == "not_required" and r.json()["status"] == "approved"


async def test_invitation_letter_generate_and_approve(db, client, auth_headers, event_log: EventLog) -> None:
    world = await make_world(db)
    world.patient.passport_number = "N1234567"
    world.patient.passport_last4 = "4567"
    world.patient.nationality = "NG"
    db.add(
        PatientCompanion(
            patient_id=world.patient.id,
            full_name="Ada Okafor",
            relationship="spouse",
            passport_number="A7654321",
        )
    )
    await db.commit()
    p_h = auth_headers(world.patient_user)
    h_h = auth_headers(world.hospital_user)
    case = await create_case(
        db, world.patient, world.hospital, doctor_id=world.doctor.id, procedure_id=world.procedure.id
    )
    r = await client.post(f"{API}/travel/visa-requests", json={"case_id": str(case.id)}, headers=p_h)
    visa = r.json()
    base = f"{API}/hospital-portal/visa-requests/{visa['id']}/invitation-letter"

    r = await client.post(f"{base}/approve", headers=h_h)
    assert r.status_code == 400 and r.json()["error"]["code"] == "invitation_letter_required"
    assert (await client.post(f"{base}/generate", headers=p_h)).status_code == 403
    other_owner = await create_user(db, role="hospital")
    await create_hospital(db, owner=other_owner)
    assert (await client.post(f"{base}/generate", headers=auth_headers(other_owner))).status_code == 404

    r = await client.post(
        f"{base}/generate",
        json={"estimated_arrival_date": "2026-12-10", "estimated_duration_days": 14},
        headers=h_h,
    )
    assert r.status_code == 200, r.text
    letter = r.json()
    assert letter["draft_document_id"] and letter["document_id"] is None
    assert letter["missing"] == []
    draft_id = letter["draft_document_id"]
    # the draft is visible to the hospital only
    r = await client.get(f"{API}/documents/{draft_id}/download", headers=h_h)
    assert r.status_code == 200 and r.content.startswith(b"%PDF")
    assert (await client.get(f"{API}/documents/{draft_id}/download", headers=p_h)).status_code == 404

    # too many attendants for the nationality
    r = await client.post(
        f"{base}/generate",
        json={"attendants": [{"full_name": f"Person {i}"} for i in range(3)]},
        headers=h_h,
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "too_many_attendants"

    # regenerating replaces the draft
    r = await client.post(f"{base}/generate", headers=h_h)
    assert r.status_code == 200 and "estimated_arrival_date" in r.json()["missing"]
    new_draft = r.json()["draft_document_id"]
    assert new_draft != draft_id
    assert (await db.get(Document, draft_id)).deleted_at is not None

    r = await client.post(f"{base}/approve", headers=h_h)
    assert r.status_code == 200, r.text
    approved = r.json()
    assert approved["document_id"] == new_draft and approved["visa_status"] == "invitation_issued"
    assert approved["approved_at"] is not None
    r = await client.get(f"{API}/documents/{new_draft}/download", headers=p_h)
    assert r.status_code == 200 and r.content.startswith(b"%PDF")
    doc = await db.get(Document, new_draft)
    await db.refresh(doc)
    assert doc.kind == "invitation_letter" and doc.case_id == case.id and doc.patient_id == world.patient.id
    row = (await db.execute(select(VisaRequest).where(VisaRequest.id == visa["id"]))).scalar_one()
    assert str(row.invitation_letter_document_id) == new_draft
    r = await client.get(f"{API}/travel/visa-requests/{visa['id']}", headers=p_h)
    assert r.json()["invitation_letter_document_id"] == new_draft
    assert r.json()["invitation_letter_approved_at"] is not None

    assert event_log.of("visa.invitation_issued")[0]["document_id"] == new_draft
    note = (
        await db.execute(
            select(Notification).where(
                Notification.user_id == world.patient_user.id, Notification.kind == "visa.invitation_issued"
            )
        )
    ).scalar_one()
    assert "invitation letter" in note.title.lower()
    # approving again is a no-op
    assert (await client.post(f"{base}/approve", headers=h_h)).status_code == 200
    assert len(event_log.of("visa.invitation_issued")) == 1


def test_passport_decrypted_only_while_rendering() -> None:
    assert _passport(encrypt_str("N1234567")) == "N1234567"
    assert _passport(None) == "To be provided"
    assert _passport("v1:not-valid") == "To be provided"
