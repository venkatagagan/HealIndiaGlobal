"""End-to-end journeys through the public HTTP API (PLAN sections 5, 6.4 and 8).

(a) ``test_full_journey_hospital_onboarding_to_settlement_payout``: hospital onboarding and approval, agent
    approval, patient referral, rules-engine screening and matching, case + itemized quote, deposit booking
    paid through the mock gateway (with an ``Idempotency-Key`` replay), admission, discharge, revenue
    recognition, settlement hold (time-travel with time-machine), maker-checker batch approval, mock payouts,
    and a balanced ledger with zero hospital/agent payables.
(b) ``test_cancellation_triggers_automatic_refund``: a paid booking cancelled >= 14 days before admission
    is refunded automatically (refund ``processed``, escrow back to zero, booking ``cancelled``).
(c) ``test_cross_tenant_idor_sweep``: another patient, agent and hospital get 404 for A's case, booking,
    payment order, document and screening; non-finance users cannot approve settlement batches.

Every step talks HTTP only (``tests/e2e/journey.py``); reference catalog rows (specialty, procedure, cost
benchmark, FX rates) and staff users come from factories/fixtures. A failing step names the endpoint and the
module responsible for it - nothing is skipped or xfailed.
"""

from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

import httpx
import pytest
import time_machine
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from tests.e2e.journey import (
    PASSWORD,
    SIDE_EFFECT_OWNERS,
    Actor,
    Journey,
    dig,
    id_of,
    items_of,
    owner_of,
    pdf_bytes,
    short_uid,
)

pytestmark = pytest.mark.e2e

MakeUser = Callable[..., Awaitable[Any]]
AuthHeaders = Callable[[Any], dict[str, str]]
RunJobs = Callable[..., Awaitable[int]]

# Platform defaults (app.core.settings_store.DEFAULTS / PLAN 6.3)
COMMISSION_BPS = 1500
AGENT_COMMISSION_BPS = 500
GST_BPS = 1800
TDS_BPS = 10
DEPOSIT_PCT = 20
SETTLEMENT_HOLD_DAYS = 3

QUOTE_LINES: list[dict[str, Any]] = [
    {
        "category": "surgery",
        "description": "Total knee replacement incl. OT charges",
        "amount_minor": 30_000_000,
    },
    {"category": "implants", "description": "Cobalt-chromium knee implant", "amount_minor": 12_000_000},
    {"category": "hospital_stay", "description": "5 nights, private room", "amount_minor": 5_000_000},
    {"category": "tests_scans", "description": "Pre-operative tests and scans", "amount_minor": 1_500_000},
    {"category": "medications", "description": "Medications and consumables", "amount_minor": 1_500_000},
]
QUOTE_TOTAL = sum(line["amount_minor"] for line in QUOTE_LINES)  # INR 5,00,000.00

TASK_MODULE_OWNERS = {
    "auth": "auth (be-auth)",
    "patients": "patients (be-auth)",
    "documents": "documents (be-auth)",
    "catalog": "catalog (be-catalog)",
    "hospitals": "hospitals (be-catalog)",
    "screening": "screening (be-screening)",
    "cases": "cases (be-cases)",
    "travel": "travel (be-cases)",
    "messaging": "messaging (be-messaging)",
    "agents": "agents (be-messaging)",
    "notifications": "messaging (be-messaging)",
    "payments": "payments (be-payments)",
    "ledger": "ledger (be-finance)",
    "settlements": "settlements (be-finance)",
    "admin": "admin (be-admin)",
}


IST = timezone(timedelta(hours=5, minutes=30))


def today_ist() -> date:
    """India's calendar date - admission dates, availability and refund windows are Indian dates."""
    return datetime.now(IST).date()


def bps(amount: int, rate_bps: int) -> int:
    """Round-half-up basis-point share (the reference used to check postings, tolerance +-1 minor unit)."""
    return (amount * rate_bps + 5_000) // 10_000


def near(actual: Any, expected: int, tolerance: int = 1) -> bool:
    return isinstance(actual, int) and abs(actual - expected) <= tolerance


# ===================================================================================== shared setup
@dataclass
class Staff:
    admin: Actor
    support: Actor
    finance_a: Actor
    finance_b: Actor

    def all(self) -> list[Actor]:
        return [self.admin, self.support, self.finance_a, self.finance_b]


@dataclass
class Catalog:
    specialty_id: str
    specialty_slug: str
    procedure_id: str
    procedure_slug: str


@dataclass
class HospitalCtx:
    owner: Actor
    hospital_id: str
    slug: str | None = None
    name: str = ""
    doctor_id: str | None = None
    hospital_procedure_id: str | None = None
    package_ids: list[str] = field(default_factory=list)


@dataclass
class AgentCtx:
    actor: Actor
    agent_id: str
    agent_code: str | None = None


@dataclass
class BookingCtx:
    case_id: str
    quote_id: str
    booking_id: str
    booking: dict[str, Any]
    screening_id: str | None = None
    order_id: str | None = None
    order: dict[str, Any] | None = None


async def make_staff(make_user: MakeUser, auth_headers: AuthHeaders) -> Staff:
    async def one(role: str, label: str, full_name: str) -> Actor:
        email = f"{role}.{short_uid()}@e2e.example"
        user = await make_user(role=role, email=email, full_name=full_name, password=PASSWORD)
        actor = Actor(label=label, role=role, user=user, user_id=str(user.id), email=email, password=PASSWORD)
        actor.headers = auth_headers(user)
        return actor

    return Staff(
        admin=await one("admin", "admin (operations)", "Olivia Ops"),
        support=await one("support", "support coordinator", "Sanjay Support"),
        finance_a=await one("finance", "finance user A (maker)", "Farah Finance-A"),
        finance_b=await one("finance", "finance user B (checker)", "Felix Finance-B"),
    )


def remint_staff(staff: Staff, auth_headers: AuthHeaders) -> None:
    """Issue fresh access tokens (used inside a time-travel window: old tokens are expired there)."""
    for actor in staff.all():
        actor.headers = auth_headers(actor.user)


async def refresh_tokens(j: Journey, staff: Staff, auth_headers: AuthHeaders, actors: list[Actor]) -> None:
    """After moving the clock, re-issue every access token (old ones are expired / not yet valid)."""
    remint_staff(staff, auth_headers)
    for actor in actors:
        await j.login(actor)


async def seed_catalog(db: AsyncSession) -> Catalog:
    """Reference data an operator would maintain in the admin catalog (not part of the journeys)."""
    from app.models import CostBenchmark
    from tests import factories

    specialty = await factories.create_specialty(db, slug="orthopedics", name="Orthopedics")
    procedure = await factories.create_procedure(
        db,
        specialty,
        slug="total-knee-replacement",
        name="Total Knee Replacement",
        keywords=["knee", "knee pain", "arthritis", "osteoarthritis", "joint replacement"],
        body_areas=["left_leg", "right_leg"],
    )
    db.add(
        CostBenchmark(
            procedure_id=procedure.id,
            country_code="US",
            currency="USD",
            cost_min_minor=3_500_000,
            cost_max_minor=5_000_000,
            wait_time_text="3-6 months",
            source="e2e",
        )
    )
    await db.commit()
    await factories.create_fx_rates(db)
    return Catalog(
        specialty_id=str(specialty.id),
        specialty_slug=specialty.slug,
        procedure_id=str(procedure.id),
        procedure_slug=procedure.slug,
    )


async def drain_jobs(j: Journey, db: AsyncSession, run_jobs: RunJobs) -> int:
    """Run every due background job, then record jobs that failed (they are reported with any later
    failure and asserted at the end of each journey)."""
    from app.models import BackgroundJob

    processed = await run_jobs()
    rows = (
        await db.execute(
            select(BackgroundJob.task_name, BackgroundJob.status, BackgroundJob.last_error).where(
                BackgroundJob.last_error.is_not(None)
            )
        )
    ).all()
    for task_name, status, last_error in rows:
        module = TASK_MODULE_OWNERS.get(str(task_name).split(".", 1)[0], "backend-core")
        first_line = (last_error or "").strip().splitlines()[0] if last_error else ""
        note = (
            f"background job {task_name} [{getattr(status, 'value', status)}] ({module}): {first_line[:300]}"
        )
        if note not in j.notes:
            j.notes.append(note)
    await db.commit()  # end the read transaction without expiring loaded objects
    return processed


def assert_no_failed_jobs(j: Journey) -> None:
    j.step("no background job failed during the journey")
    if j.notes:
        j.fail("background jobs raised errors:\n    " + "\n    ".join(j.notes), module="see each job above")


async def run_periodic_task(j: Journey, db: AsyncSession, run_jobs: RunJobs, name: str) -> None:
    """Enqueue one periodic task by name (only that one - not the whole scheduler, so no auto-batching runs)
    and drain the queue; fail if the task is unknown or did not succeed."""
    from app.core import jobs as jobs_module
    from app.models import BackgroundJob

    owner = SIDE_EFFECT_OWNERS["mark_eligible"]
    j.check(
        name in jobs_module.list_tasks(),
        f"periodic task {name!r} is not registered (expected @periodic in app/modules/settlements/tasks.py); "
        f"registered: {sorted(jobs_module.list_tasks())}",
        module=owner,
    )
    job_id = await jobs_module.enqueue(db, name, {})
    await db.commit()
    await drain_jobs(j, db, run_jobs)
    if job_id is not None:
        row = (
            await db.execute(
                select(BackgroundJob.status, BackgroundJob.last_error).where(BackgroundJob.id == job_id)
            )
        ).first()
        await db.commit()
        status = getattr(row[0], "value", row[0]) if row else None
        j.check(
            status == "succeeded",
            f"job {name} finished with status {status!r}: {(row[1] if row else '')!s:.600}",
            module=owner,
        )


# ------------------------------------------------------------------------------------------ hospital
async def onboard_hospital(
    j: Journey,
    staff: Staff,
    catalog: Catalog,
    *,
    tag: str,
    with_offerings: bool = True,
) -> HospitalCtx:
    uid = short_uid()
    name = f"Sunrise Speciality Hospital {tag.upper()}-{uid}"

    j.step(f"hospital {tag}: owner registers (POST /auth/register role=hospital)")
    owner, token = await j.register(
        f"hospital owner {tag.upper()}",
        {
            "email": f"owner.{tag}.{uid}@e2e.example",
            "password": PASSWORD,
            "full_name": f"Meera Iyer {tag.upper()}",
            "role": "hospital",
            "phone": "+91-44-4000-1000",
            "country_code": "IN",
            "hospital_name": name,
            "city": "Chennai",
            "accept_terms": True,
            "is_adult": True,
        },
    )
    hospitals = dig(token, "user", "hospitals") or []
    hospital_id = id_of(hospitals[0]) if hospitals else None

    j.step(f"hospital {tag}: owner reads the draft profile (GET /hospital-portal/profile)")
    profile = await j.call(owner, "GET", "/hospital-portal/profile")
    hospital_id = hospital_id or id_of(profile)
    j.check(
        hospital_id,
        f"no hospital id in TokenOut.user.hospitals or the profile: {profile}",
        module="hospitals (be-catalog)",
    )
    j.check(
        profile.get("status") in ("draft", None),
        f"a freshly registered hospital should be 'draft', got {profile.get('status')!r}",
        module="auth (be-auth) / hospitals (be-catalog)",
    )
    ctx = HospitalCtx(owner=owner, hospital_id=str(hospital_id), slug=profile.get("slug"), name=name)

    j.step(f"hospital {tag}: owner completes the profile (PUT /hospital-portal/profile)")
    profile = await j.call(
        owner,
        "PUT",
        "/hospital-portal/profile",
        json={
            "name": name,
            "legal_name": f"Sunrise Healthcare {tag.upper()} Pvt Ltd",
            "description": "Tertiary-care hospital with a dedicated international patient desk.",
            "city": "Chennai",
            "state": "Tamil Nadu",
            "address": "12 Mount Road, Anna Salai",
            "pincode": "600002",
            "phone": "+91-44-4000-1000",
            "email": f"intl.{tag}.{uid}@e2e.example",
            "website": "https://sunrise.example",
            "accreditations": ["jci", "nabh"],
            "established_year": 1998,
            "bed_count": 600,
            "languages": ["English", "Hindi", "Tamil"],
            "international_desk": True,
            "airport_distance_km": 14.5,
            "gstin": "33ABCDE1234F1Z7",
        },
    )
    j.check(
        profile.get("city") == "Chennai" and "jci" in (profile.get("accreditations") or []),
        f"profile update not reflected: {profile}",
        module="hospitals (be-catalog)",
    )
    ctx.slug = profile.get("slug") or ctx.slug

    j.step(f"hospital {tag}: owner uploads a kyc_registration document (POST /documents)")
    document = await j.call(
        owner,
        "POST",
        "/documents",
        files={
            "file": ("registration-certificate.pdf", pdf_bytes("Registration certificate"), "application/pdf")
        },
        data={"kind": "kyc_registration", "hospital_id": ctx.hospital_id},
        expect=(200, 201),
    )
    j.check(
        document.get("kind") == "kyc_registration" and document.get("status") == "uploaded",
        f"unexpected DocumentOut: {document}",
        module="documents (be-auth)",
    )

    j.step(f"hospital {tag}: owner submits for review (POST /hospital-portal/submit-for-review)")
    submitted = await j.call(owner, "POST", "/hospital-portal/submit-for-review", expect=(200, 201, 202))
    status = (submitted or {}).get("status") if isinstance(submitted, dict) else None
    if status is None:
        status = (await j.call(owner, "GET", "/hospital-portal/profile")).get("status")
    j.check(
        status == "pending_review",
        f"hospital status after submit-for-review is {status!r}",
        module="hospitals (be-catalog)",
    )

    j.step(f"hospital {tag}: hospital is not publicly listed before approval (GET /hospitals)")
    listing = await j.call(None, "GET", "/hospitals", params={"q": name})
    j.check(
        all(id_of(card) != ctx.hospital_id for card in items_of(listing)),
        "a pending_review hospital appears in the public catalog (only status=active may be listed)",
        module="catalog (be-catalog)",
    )

    j.step(
        f"hospital {tag}: admin sees it in the approval queue (GET /admin/hospitals?status=pending_review)"
    )
    queue = await j.call(staff.admin, "GET", "/admin/hospitals", params={"status": "pending_review"})
    j.check(
        any(id_of(h) == ctx.hospital_id for h in items_of(queue)),
        f"hospital {ctx.hospital_id} missing from the pending_review queue: {queue}",
        module="admin (be-admin)",
    )
    detail = await j.call(staff.admin, "GET", f"/admin/hospitals/{ctx.hospital_id}")
    documents_listed = detail.get("documents") or detail.get("kyc_documents") or []
    j.check(
        any(id_of(d) == id_of(document) for d in documents_listed),
        f"admin hospital detail does not list the uploaded KYC document (keys: {sorted(detail)})",
        module="admin (be-admin)",
    )

    j.step(f"hospital {tag}: admin approves (POST /admin/hospitals/{{id}}/approve)")
    approved = await j.call(staff.admin, "POST", f"/admin/hospitals/{ctx.hospital_id}/approve", json={})
    approved_status = approved.get("status") if isinstance(approved, dict) else None
    if approved_status is None:
        approved_status = (await j.call(owner, "GET", "/hospital-portal/profile")).get("status")
    j.check(
        approved_status == "active",
        f"hospital status after approval is {approved_status!r}",
        module="admin (be-admin)",
    )

    if not with_offerings:
        return ctx

    j.step(f"hospital {tag}: adds its specialty (PUT /hospital-portal/specialties)")
    await j.call(owner, "PUT", "/hospital-portal/specialties", json={"specialty_ids": [catalog.specialty_id]})

    j.step(f"hospital {tag}: adds a doctor (POST /hospital-portal/doctors)")
    doctor = await j.call(
        owner,
        "POST",
        "/hospital-portal/doctors",
        json={
            "full_name": f"Dr. Arjun Mehta {tag.upper()}",
            "gender": "male",
            "specialty_id": catalog.specialty_id,
            "sub_specialties": ["Joint replacement"],
            "qualifications": ["MBBS", "MS (Ortho)", "Fellowship in Arthroplasty"],
            "experience_years": 18,
            "languages": ["English", "Hindi"],
            "bio": "Has performed more than 4,000 knee and hip replacements.",
            "success_rate_pct": 97.5,
            "consultation_fee_minor": 150_000,
            "currency": "INR",
            "teleconsult_available": True,
        },
        expect=(200, 201),
    )
    ctx.doctor_id = id_of(doctor)

    j.step(f"hospital {tag}: adds a procedure offering (POST /hospital-portal/procedures)")
    offering = await j.call(
        owner,
        "POST",
        "/hospital-portal/procedures",
        json={
            "procedure_id": catalog.procedure_id,
            "doctor_ids": [ctx.doctor_id],
            "price_min_minor": 45_000_000,
            "price_max_minor": 60_000_000,
            "currency": "INR",
            "hospital_stay_days": 5,
            "success_rate_pct": 98.0,
            "inclusions": ["Surgery", "Implant", "5 nights stay", "Physiotherapy"],
            "exclusions": ["Flights", "Visa fees"],
        },
        expect=(200, 201),
    )
    ctx.hospital_procedure_id = id_of(offering)

    j.step(f"hospital {tag}: adds packages (POST /hospital-portal/procedures/{{id}}/packages)")
    for package in (
        {
            "name": "Medical only",
            "tier": "medical_only",
            "price_minor": 48_000_000,
            "original_price_minor": None,
            "description": "Surgery, implant and hospital stay",
            "includes": {
                "accommodation_nights": 0,
                "airport_pickup": False,
                "translator": False,
                "meals": True,
                "local_transport": False,
                "followup_teleconsults": 1,
            },
        },
        {
            "name": "Medical + Stay",
            "tier": "medical_stay",
            "price_minor": 52_000_000,
            "original_price_minor": 56_000_000,
            "description": "Adds 10 nights in a partner guest house",
            "includes": {
                "accommodation_nights": 10,
                "airport_pickup": True,
                "translator": False,
                "meals": True,
                "local_transport": True,
                "followup_teleconsults": 2,
            },
        },
    ):
        created = await j.call(
            owner,
            "POST",
            f"/hospital-portal/procedures/{ctx.hospital_procedure_id}/packages",
            json={**package, "currency": "INR"},
            expect=(200, 201),
        )
        ctx.package_ids.append(str(id_of(created)))

    j.step(
        f"hospital {tag}: publishes doctor availability (PUT /hospital-portal/doctors/{{id}}/availability)"
    )
    today = today_ist()
    slots = [
        {"date": (today + timedelta(days=offset)).isoformat(), "slot_kind": kind, "capacity": 5}
        for offset in range(1, 61)
        for kind in ("consultation", "admission")
    ]
    await j.call(owner, "PUT", f"/hospital-portal/doctors/{ctx.doctor_id}/availability", json=slots)
    availability = await j.call(
        None,
        "GET",
        f"/doctors/{ctx.doctor_id}/availability",
        params={
            "from": (today + timedelta(days=1)).isoformat(),
            "to": (today + timedelta(days=10)).isoformat(),
        },
    )
    j.check(
        any(
            slot.get("slot_kind") == "admission" and (slot.get("available") or 0) > 0
            for slot in items_of(availability)
        ),
        f"published admission slots are not visible publicly: {availability}",
        module="catalog (be-catalog)",
    )

    j.step(f"hospital {tag}: hospital is listed publicly with its doctor (GET /hospitals/{{slug}})")
    public = await j.call(None, "GET", f"/hospitals/{ctx.slug or ctx.hospital_id}")
    j.check(
        any(id_of(d) == ctx.doctor_id for d in public.get("doctors") or []),
        f"public hospital detail does not include the new doctor: {public.get('doctors')}",
        module="catalog (be-catalog)",
    )
    return ctx


async def provision_hospital(
    j: Journey, db: AsyncSession, make_user: MakeUser, catalog: Catalog, *, tag: str
) -> HospitalCtx:
    """An approved hospital with a doctor, offering, package and 60 days of availability, created with
    factories. Used by journeys whose subject is not onboarding (journey (a) onboards over HTTP)."""
    from app.core.enums import SlotKind
    from app.models import AvailabilitySlot, HospitalSpecialty, Procedure, Specialty
    from tests import factories

    j.step(f"setup: hospital {tag} provisioned with factories (active, doctor, offering, availability)")
    uid = short_uid()
    email = f"owner.{tag}.{uid}@e2e.example"
    owner_user = await make_user(
        role="hospital", email=email, full_name=f"Owner {tag.upper()}", password=PASSWORD
    )
    hospital = await factories.create_hospital(
        db,
        owner=owner_user,
        name=f"Factory Hospital {tag.upper()}-{uid}",
        slug=f"factory-hospital-{tag}-{uid}",
        city="Chennai",
        email=f"intl.{tag}.{uid}@e2e.example",
    )
    specialty = await db.get(Specialty, uuid.UUID(catalog.specialty_id), populate_existing=True)
    procedure = await db.get(Procedure, uuid.UUID(catalog.procedure_id), populate_existing=True)
    assert specialty is not None and procedure is not None
    db.add(HospitalSpecialty(hospital_id=hospital.id, specialty_id=specialty.id))
    await db.commit()
    doctor = await factories.create_doctor(db, hospital, specialty, languages=["English", "Hindi"])
    offering = await factories.create_hospital_procedure(db, hospital, procedure, doctor_ids=[doctor.id])
    package = await factories.create_package(db, offering)
    today = today_ist()
    for offset in range(1, 61):
        for kind in (SlotKind.CONSULTATION, SlotKind.ADMISSION):
            db.add(
                AvailabilitySlot(
                    hospital_id=hospital.id,
                    doctor_id=doctor.id,
                    date=today + timedelta(days=offset),
                    slot_kind=kind,
                    capacity=5,
                )
            )
    await db.commit()
    owner = Actor(
        label=f"hospital owner {tag.upper()}",
        role="hospital",
        user=owner_user,
        user_id=str(owner_user.id),
        email=email,
        password=PASSWORD,
    )
    await j.login(owner)
    return HospitalCtx(
        owner=owner,
        hospital_id=str(hospital.id),
        slug=hospital.slug,
        name=hospital.name,
        doctor_id=str(doctor.id),
        hospital_procedure_id=str(offering.id),
        package_ids=[str(package.id)],
    )


async def provision_agent(j: Journey, db: AsyncSession, make_user: MakeUser, *, tag: str) -> AgentCtx:
    """An active (KYC-approved) agent created with factories; logs in over HTTP."""
    from tests import factories

    j.step(f"setup: agent {tag} provisioned with factories (active)")
    email = f"agent.{tag}.{short_uid()}@e2e.example"
    user = await make_user(role="agent", email=email, full_name=f"Agent {tag.upper()}", password=PASSWORD)
    agent = await factories.create_agent(db, user=user, agency_name=f"Factory Travel {tag.upper()}")
    actor = Actor(
        label=f"agent {tag.upper()}",
        role="agent",
        user=user,
        user_id=str(user.id),
        email=email,
        password=PASSWORD,
    )
    await j.login(actor)
    return AgentCtx(actor=actor, agent_id=str(agent.id), agent_code=agent.agent_code)


async def add_verified_payout_account(
    j: Journey, owner: Actor, staff: Staff, *, holder: str, label: str
) -> str:
    j.step(f"{label}: adds a payout account (POST /finance/payout-accounts)")
    account = await j.call(
        owner,
        "POST",
        "/finance/payout-accounts",
        json={
            "account_holder_name": holder,
            "account_number": "001234567890",
            "ifsc": "HDFC0000123",
            "bank_name": "HDFC Bank",
            "is_primary": True,
        },
        expect=(200, 201),
    )
    masked = str(account.get("account_number_masked") or "")
    j.check(
        "001234567890" not in str(account) and masked.endswith("7890"),
        f"payout account number must be write-only and returned masked: {account}",
        module="settlements (be-finance)",
    )
    j.step(f"{label}: finance verifies the payout account (POST /finance/payout-accounts/{{id}}/verify)")
    verified = await j.call(
        staff.finance_a, "POST", f"/finance/payout-accounts/{id_of(account)}/verify", json={}
    )
    j.check(
        verified is None or verified.get("is_verified") in (True, None),
        f"payout account not verified: {verified}",
        module="settlements (be-finance)",
    )
    return str(id_of(account))


# ------------------------------------------------------------------------------------------ agent / patient
async def onboard_agent(j: Journey, staff: Staff, *, tag: str) -> AgentCtx:
    uid = short_uid()
    j.step(f"agent {tag}: registers (POST /auth/register role=agent)")
    actor, token = await j.register(
        f"agent {tag.upper()}",
        {
            "email": f"agent.{tag}.{uid}@e2e.example",
            "password": PASSWORD,
            "full_name": f"Chidi Okafor {tag.upper()}",
            "role": "agent",
            "phone": "+234-800-000-0001",
            "country_code": "NG",
            "agency_name": f"Lagos MedTravel {tag.upper()}-{uid}",
            "accept_terms": True,
            "is_adult": True,
        },
    )
    agent_id = dig(token, "user", "agent_id")
    profile = await j.call(actor, "GET", "/agent-portal/profile")
    agent_id = agent_id or id_of(profile)
    j.check(
        agent_id,
        f"no agent id in TokenOut.user.agent_id or /agent-portal/profile: {profile}",
        module="agents (be-messaging)",
    )
    j.check(
        profile.get("status") == "pending",
        f"new agent status should be 'pending': {profile.get('status')!r}",
        module="agents (be-messaging)",
    )

    j.step(f"agent {tag}: uploads KYC id proof and submits KYC (POST /documents, /agent-portal/submit-kyc)")
    await j.call(
        actor,
        "POST",
        "/documents",
        files={"file": ("id-proof.pdf", pdf_bytes("Agent ID proof"), "application/pdf")},
        data={"kind": "kyc_id_proof"},
        expect=(200, 201),
    )
    await j.call(actor, "POST", "/agent-portal/submit-kyc", json={}, expect=(200, 201, 202))

    j.step(f"agent {tag}: admin approves (POST /admin/agents/{{id}}/approve)")
    queue = await j.call(staff.admin, "GET", "/admin/agents", params={"status": "pending"})
    j.check(
        any(id_of(a) == str(agent_id) for a in items_of(queue)),
        f"agent {agent_id} missing from GET /admin/agents?status=pending",
        module="admin (be-admin)",
    )
    await j.call(staff.admin, "POST", f"/admin/agents/{agent_id}/approve", json={})
    profile = await j.call(actor, "GET", "/agent-portal/profile")
    j.check(
        profile.get("status") == "active",
        f"agent status after approval: {profile.get('status')!r}",
        module="admin (be-admin)",
    )

    j.step(f"agent {tag}: reads the referral code (GET /agent-portal/referral)")
    referral = await j.call(actor, "GET", "/agent-portal/referral")
    code = referral.get("agent_code")
    j.check(
        isinstance(code, str) and len(code) == 8 and str(code) in str(referral.get("referral_url", "")),
        f"unexpected referral payload: {referral}",
        module="agents (be-messaging)",
    )
    return AgentCtx(actor=actor, agent_id=str(agent_id), agent_code=code)


async def register_patient(j: Journey, *, tag: str, referral_code: str | None = None) -> tuple[Actor, str]:
    uid = short_uid()
    j.step(f"patient {tag}: registers" + (" with the agent's referral code" if referral_code else ""))
    payload: dict[str, Any] = {
        "email": f"patient.{tag}.{uid}@e2e.example",
        "password": PASSWORD,
        "full_name": f"Jane Doe {tag.upper()}",
        "role": "patient",
        "phone": "+1-202-555-0143",
        "country_code": "US",
        "accept_terms": True,
        "is_adult": True,
    }
    if referral_code:
        payload["referral_code"] = referral_code
    actor, token = await j.register(f"patient {tag.upper()}", payload)
    patient_id = dig(token, "user", "patient_profile_id")

    j.step(f"patient {tag}: completes the profile (PUT /patient/profile)")
    profile = await j.call(
        actor,
        "PUT",
        "/patient/profile",
        json={
            "first_name": "Jane",
            "last_name": f"Doe {tag.upper()}",
            "date_of_birth": "1975-04-12",
            "gender": "female",
            "nationality": "US",
            "country_of_residence": "US",
            "passport_number": "X12345678",
            "passport_expiry": "2031-01-31",
            "phone": "+1-202-555-0143",
            "emergency_contact": {"name": "John Doe", "relationship": "spouse", "phone": "+1-202-555-0199"},
            "preferred_language": "en",
            "preferred_currency": "USD",
        },
    )
    j.check(
        "X12345678" not in str(profile) and profile.get("passport_last4") == "5678",
        f"passport must be returned masked (passport_last4 only): {profile}",
        module="patients (be-auth)",
    )
    patient_id = patient_id or id_of(profile)
    j.check(patient_id, f"no patient profile id: {profile}", module="patients (be-auth)")
    return actor, str(patient_id)


# ----------------------------------------------------------------------------------- screening -> booking
async def screening_flow(
    j: Journey, db: AsyncSession, run_jobs: RunJobs, patient: Actor, catalog: Catalog, hospital: HospitalCtx
) -> tuple[str, dict[str, Any]]:
    today = today_ist()
    j.step("patient: starts a screening (POST /screenings)")
    screening = await j.call(
        patient, "POST", "/screenings", json={"specialty_slug": catalog.specialty_slug}, expect=(200, 201)
    )
    screening_id = str(id_of(screening))
    j.check(
        screening.get("status") == "draft",
        f"new screening should be draft: {screening.get('status')!r}",
        module="screening (be-screening)",
    )

    j.step("patient: answers the questionnaire (PATCH /screenings/{id})")
    await j.call(
        patient,
        "PATCH",
        f"/screenings/{screening_id}",
        json={
            "body_areas": ["right_leg"],
            "pain_intensity": 7,
            "symptoms": [
                {"name": "Knee pain", "answer": "yes"},
                {"name": "Joint stiffness", "answer": "yes"},
                {"name": "Swelling", "answer": "maybe"},
            ],
            "duration_value": 8,
            "duration_unit": "months",
            "severity": {"work": "moderate", "sleep": "mild", "mobility": "severe"},
            "previous_treatments": ["medication", "physical_therapy"],
            "notes": "Pain when climbing stairs; X-ray shows osteoarthritis of the right knee.",
            "preferences": {
                "languages": ["English"],
                "doctor_gender": "no_preference",
                "budget_min_minor": 500_000,
                "budget_max_minor": 2_000_000,
                "budget_currency": "USD",
                "travel_window_start": (today + timedelta(days=7)).isoformat(),
                "travel_window_end": (today + timedelta(days=60)).isoformat(),
                "use_ai": False,
            },
            "home_country": "US",
        },
    )

    j.step("patient: submits the screening (POST /screenings/{id}/submit)")
    submitted = await j.call(
        patient, "POST", f"/screenings/{screening_id}/submit", json={"consent_ai": False}
    )
    j.check(
        submitted.get("status") in ("processing", "completed"),
        f"submitted screening status {submitted.get('status')!r}",
        module="screening (be-screening)",
    )

    j.step("worker: runs the triage job (run_jobs) - rules engine, AI disabled in tests")
    await drain_jobs(j, db, run_jobs)
    result = await j.call(patient, "GET", f"/screenings/{screening_id}")
    j.check(
        result.get("status") == "completed",
        f"screening not completed after run_jobs: status={result.get('status')!r} "
        f"error={result.get('error')!r}",
        module="screening (be-screening)",
    )
    ai_result = result.get("ai_result") or {}
    j.check(
        ai_result.get("engine") == "rules",
        f"expected the rules engine (AI disabled): {ai_result}",
        module="screening (be-screening)",
    )
    j.check(
        result.get("urgency") in ("routine", "soon", "urgent"),
        f"knee osteoarthritis must not be triaged as {result.get('urgency')!r}",
        module="screening (be-screening)",
    )
    suggested = [s.get("slug") for s in ai_result.get("suggested_specialties") or []]
    j.check(
        catalog.specialty_slug in suggested,
        f"rules engine did not suggest {catalog.specialty_slug}: {suggested}",
        module="screening (be-screening)",
    )

    j.step("patient: reviews matches (GET /screenings/{id}/matches)")
    matches = items_of(await j.call(patient, "GET", f"/screenings/{screening_id}/matches"))
    ours = [m for m in matches if id_of(m.get("hospital")) == hospital.hospital_id]
    j.check(
        ours,
        f"the onboarded hospital is not among the matches: {[id_of(m.get('hospital')) for m in matches]}",
        module="screening (be-screening) matching.py",
    )
    match = ours[0]
    j.check(
        id_of(match.get("doctor")) == hospital.doctor_id,
        f"match doctor mismatch: {match.get('doctor')}",
        module="screening (be-screening) matching.py",
    )
    j.check(
        0 < float(match.get("match_score") or 0) <= 100 and match.get("reasons"),
        f"match must carry a 0-100 score and human reasons: {match}",
        module="screening (be-screening)",
    )
    j.check(
        (match.get("estimated_cost_minor") or 0) > 0 and match.get("currency") == "USD",
        f"estimated cost must be converted to the budget currency (USD): {match}",
        module="screening (be-screening) matching.py",
    )
    return screening_id, match


async def case_quote_booking(
    j: Journey,
    *,
    patient: Actor,
    hospital: HospitalCtx,
    catalog: Catalog,
    screening_id: str | None,
    admission_in_days: int,
    expect_agent_id: str | None = None,
) -> BookingCtx:
    today = today_ist()
    j.step("patient: requests a quote, consenting to share with the hospital (POST /cases consent_share)")
    payload: dict[str, Any] = {
        "hospital_id": hospital.hospital_id,
        "doctor_id": hospital.doctor_id,
        "procedure_id": catalog.procedure_id,
        "specialty_id": catalog.specialty_id,
        "patient_notes": "Hoping to have surgery within the next two months.",
        "consent_share": True,
    }
    if screening_id:
        payload["screening_id"] = screening_id
    case = await j.call(patient, "POST", "/cases", json=payload, expect=(200, 201))
    case_id = str(id_of(case))
    j.check(
        case.get("status") == "enquiry", f"new case status {case.get('status')!r}", module="cases (be-cases)"
    )
    j.check(
        str(case.get("case_number", "")).startswith("HIG-C-"),
        f"case_number format: {case.get('case_number')}",
        module="cases (be-cases)",
    )
    if expect_agent_id:
        j.check(
            id_of(case.get("agent")) == expect_agent_id,
            f"case of a referred patient must carry the referring agent {expect_agent_id}: "
            f"agent={case.get('agent')}",
            module="cases (be-cases) (agent_id from patient_profiles.referred_by_agent_id)",
        )

    j.step("hospital: sees the enquiry in its inbox (GET /cases)")
    inbox = await j.call(hospital.owner, "GET", "/cases", params={"status": "enquiry"})
    j.check(
        any(id_of(c) == case_id for c in items_of(inbox)),
        "hospital inbox does not show the new enquiry",
        module="cases (be-cases)",
    )

    j.step("hospital: sends an itemized quote (POST /cases/{id}/quotes)")
    quote = await j.call(
        hospital.owner,
        "POST",
        f"/cases/{case_id}/quotes",
        json={
            "treatment_plan": "Right total knee replacement, 5 nights in hospital, physiotherapy from day 1.",
            "line_items": QUOTE_LINES,
            "currency": "INR",
            "estimated_stay_days": 12,
            "valid_until": (today + timedelta(days=30)).isoformat(),
        },
        expect=(200, 201),
    )
    quote_id = str(id_of(quote))
    j.check(
        quote.get("status") == "sent" and quote.get("total_minor") == QUOTE_TOTAL,
        f"quote must be 'sent' with total {QUOTE_TOTAL}: {quote}",
        module="cases (be-cases)",
    )
    case = await j.call(patient, "GET", f"/cases/{case_id}")
    j.check(
        case.get("status") == "quoted",
        f"case status after quote {case.get('status')!r}",
        module="cases (be-cases)",
    )

    j.step("patient: accepts the quote (POST /cases/{id}/quotes/{quote_id}/accept)")
    await j.call(patient, "POST", f"/cases/{case_id}/quotes/{quote_id}/accept", json={})
    case = await j.call(patient, "GET", f"/cases/{case_id}")
    j.check(
        case.get("status") == "accepted",
        f"case status after accept {case.get('status')!r}",
        module="cases (be-cases)",
    )

    j.step("patient: books with a deposit (POST /bookings payment_option=deposit)")
    admission = today + timedelta(days=admission_in_days)
    booking = await j.call(
        patient,
        "POST",
        "/bookings",
        json={
            "case_id": case_id,
            "quote_id": quote_id,
            "admission_date": admission.isoformat(),
            "payment_option": "deposit",
            "insurance_claim_requested": False,
        },
        expect=(200, 201),
    )
    booking_id = str(id_of(booking))
    expected_deposit = QUOTE_TOTAL * DEPOSIT_PCT // 100
    j.check(
        booking.get("status") == "pending_payment"
        and booking.get("total_minor") == QUOTE_TOTAL
        and booking.get("deposit_minor") == expected_deposit
        and booking.get("currency") == "INR"
        and str(booking.get("booking_number", "")).startswith("HIG-B-"),
        f"booking must be pending_payment, total {QUOTE_TOTAL}, deposit {expected_deposit} INR: {booking}",
        module="cases (be-cases)",
    )
    return BookingCtx(
        case_id=case_id, quote_id=quote_id, booking_id=booking_id, booking=booking, screening_id=screening_id
    )


async def pay_deposit(
    j: Journey, db: AsyncSession, run_jobs: RunJobs, patient: Actor, ctx: BookingCtx, staff: Staff
) -> None:
    key = f"e2e-{short_uid()}-{ctx.booking_id}"
    order_body = {
        "booking_id": ctx.booking_id,
        "purpose": "booking_deposit",
        "gateway": "mock",
        "currency": "USD",
    }

    j.step("patient: opens checkout (POST /payments/orders, Idempotency-Key, mock gateway, USD)")
    checkout = await j.call(
        patient,
        "POST",
        "/payments/orders",
        json=order_body,
        headers={"Idempotency-Key": key},
        expect=(200, 201),
    )
    order = checkout.get("order") or {}
    order_id = str(id_of(order))
    j.check(
        order.get("currency") == "USD"
        and (order.get("amount_minor") or 0) > 0
        and order.get("base_currency") == "INR"
        and order.get("purpose") == "booking_deposit"
        and str(order.get("order_number", "")).startswith("HIG-P-"),
        f"unexpected CheckoutOut.order: {order}",
        module="payments (be-payments)",
    )
    j.check(
        near(order.get("base_amount_minor"), ctx.booking["deposit_minor"], tolerance=100),
        f"order base amount {order.get('base_amount_minor')} INR should equal the deposit "
        f"{ctx.booking['deposit_minor']} (server-side amount derivation)",
        module="payments (be-payments)",
    )
    j.check(
        dig(checkout, "mock", "complete_url"),
        f"mock checkout must expose complete_url: {checkout}",
        module="payments (be-payments)",
    )

    j.step("patient: retries checkout with the same Idempotency-Key (same order expected)")
    replay = await j.call(
        patient,
        "POST",
        "/payments/orders",
        json=order_body,
        headers={"Idempotency-Key": key},
        expect=(200, 201),
    )
    j.check(
        id_of(replay.get("order")) == order_id,
        f"idempotent replay created a different order: {id_of(replay.get('order'))} != {order_id}",
        module="payments (be-payments)",
    )

    j.step("patient: completes the mock payment (POST /payments/mock/{order_id}/complete)")
    await j.call(
        patient,
        "POST",
        f"/payments/mock/{order_id}/complete",
        json={"outcome": "success"},
        expect=(200, 201, 202),
    )

    j.step("worker: processes the gateway event (run_jobs)")
    await drain_jobs(j, db, run_jobs)
    order = await j.call(patient, "GET", f"/payments/orders/{order_id}")
    j.check(
        order.get("status") == "paid" and order.get("paid_at"),
        f"order not paid after mock success: {order}",
        module="payments (be-payments)",
    )

    j.step("booking is confirmed by the captured payment (GET /bookings/{id})")
    booking = await j.call(patient, "GET", f"/bookings/{ctx.booking_id}")
    j.check(
        booking.get("status") == "confirmed",
        f"booking status {booking.get('status')!r} after the order was paid "
        f"(amount_paid_minor={booking.get('amount_paid_minor')}, "
        f"deposit_minor={booking.get('deposit_minor')})",
        module=SIDE_EFFECT_OWNERS["payment.captured->booking"],
    )
    j.check(
        (booking.get("amount_paid_minor") or 0) >= booking["deposit_minor"]
        and booking.get("balance_due_minor") == booking["total_minor"] - booking["amount_paid_minor"],
        f"booking amounts inconsistent after payment: {booking}",
        module=SIDE_EFFECT_OWNERS["payment.captured->booking"],
    )
    case = await j.call(patient, "GET", f"/cases/{ctx.case_id}")
    j.check(
        case.get("status") == "booked",
        f"case status after payment {case.get('status')!r}",
        module=SIDE_EFFECT_OWNERS["payment.captured->booking"],
    )

    j.step("pre-arrival checklist is created (GET /bookings/{id}/checklist)")
    checklist = items_of(await j.call(patient, "GET", f"/bookings/{ctx.booking_id}/checklist"))
    keys = {item.get("key"): item.get("status") for item in checklist}
    expected_keys = {
        "treatment_booked",
        "visa_approved",
        "flight_booked",
        "travel_insurance",
        "airport_pickup",
        "accommodation_booked",
        "documents_uploaded",
    }
    j.check(
        expected_keys <= set(keys) and keys.get("treatment_booked") == "done",
        f"checklist after confirmation: {keys}",
        module=SIDE_EFFECT_OWNERS["booking.confirmed->checklist"],
    )

    j.step("escrow holds the captured amount (GET /finance/summary as finance)")
    summary = await j.call(staff.finance_a, "GET", "/finance/summary")
    j.check(
        summary.get("escrow_minor") == order.get("base_amount_minor"),
        f"escrow_minor {summary.get('escrow_minor')} != captured base amount "
        f"{order.get('base_amount_minor')}",
        module=SIDE_EFFECT_OWNERS["payment.captured->ledger"],
    )
    ctx.order_id, ctx.order, ctx.booking = order_id, order, booking


# ------------------------------------------------------------------------------------------ ledger helpers
def trial_balance_net(tb: Any) -> int | None:
    """Debit-minus-credit imbalance from a trial balance payload (None when the shape is not understood)."""
    if not isinstance(tb, dict):
        rows = tb if isinstance(tb, list) else []
        if rows and all(isinstance(r, dict) for r in rows):
            debit = sum(int(r.get("debit_minor") or r.get("total_debit_minor") or 0) for r in rows)
            credit = sum(int(r.get("credit_minor") or r.get("total_credit_minor") or 0) for r in rows)
            if any("debit_minor" in r or "total_debit_minor" in r for r in rows):
                return debit - credit
        return None
    for key in ("net_minor", "difference_minor", "imbalance_minor", "net"):
        if isinstance(tb.get(key), int):
            return int(tb[key])
    for debit_key, credit_key in (
        ("total_debit_minor", "total_credit_minor"),
        ("debit_minor", "credit_minor"),
        ("debits_minor", "credits_minor"),
    ):
        if isinstance(tb.get(debit_key), int) and isinstance(tb.get(credit_key), int):
            return int(tb[debit_key]) - int(tb[credit_key])
    if isinstance(tb.get("totals"), dict):
        return trial_balance_net(tb["totals"])
    for key in ("rows", "by_type", "types", "accounts", "items"):
        if isinstance(tb.get(key), list):
            return trial_balance_net(tb[key])
    if isinstance(tb.get("balanced"), bool) or isinstance(tb.get("is_balanced"), bool):
        return 0 if (tb.get("balanced") or tb.get("is_balanced")) else 1
    return None


async def assert_trial_balance_zero(j: Journey, finance: Actor) -> None:
    tb = await j.call(finance, "GET", "/finance/ledger/trial-balance")
    net = trial_balance_net(tb)
    j.check(
        net is not None, f"cannot read the trial balance shape: {str(tb)[:800]}", module="ledger (be-finance)"
    )
    j.check(
        net == 0,
        f"trial balance does not net to zero (debit - credit = {net}): {str(tb)[:800]}",
        module="ledger (be-finance)",
    )


async def ledger_account(j: Journey, finance: Actor, owner_type: str, code: str) -> dict[str, Any] | None:
    accounts = items_of(
        await j.call(
            finance, "GET", "/finance/ledger/accounts", params={"owner_type": owner_type, "page_size": 100}
        )
    )
    return next((a for a in accounts if a.get("code") == code), None)


# ===================================================================================== (a) full journey
async def test_full_journey_hospital_onboarding_to_settlement_payout(
    client: httpx.AsyncClient,
    db: AsyncSession,
    make_user: MakeUser,
    auth_headers: AuthHeaders,
    run_jobs: RunJobs,
) -> None:
    j = Journey(client, "full journey")
    staff = await make_staff(make_user, auth_headers)
    catalog = await seed_catalog(db)

    hospital = await onboard_hospital(j, staff, catalog, tag="a")
    await add_verified_payout_account(
        j, hospital.owner, staff, holder="Sunrise Healthcare A Pvt Ltd", label="hospital A"
    )
    agent = await onboard_agent(j, staff, tag="a")
    await add_verified_payout_account(j, agent.actor, staff, holder="Lagos MedTravel A Ltd", label="agent A")
    patient, patient_id = await register_patient(j, tag="a", referral_code=agent.agent_code)

    j.step("agent: the referred patient appears in the agent's patient list (GET /agent-portal/patients)")
    agent_patients = items_of(await j.call(agent.actor, "GET", "/agent-portal/patients"))
    j.check(
        any(
            patient_id in (id_of(p), str(p.get("patient_profile_id")), str(p.get("patient_id")))
            for p in agent_patients
        ),
        f"referred patient {patient_id} not visible to the referring agent: {agent_patients}",
        module="auth (be-auth) referral_code -> referred_by_agent_id / agents (be-messaging)",
    )

    screening_id, _match = await screening_flow(j, db, run_jobs, patient, catalog, hospital)
    ctx = await case_quote_booking(
        j,
        patient=patient,
        hospital=hospital,
        catalog=catalog,
        screening_id=screening_id,
        admission_in_days=21,
        expect_agent_id=agent.agent_id,
    )
    await pay_deposit(j, db, run_jobs, patient, ctx, staff)
    assert ctx.order is not None

    # ---------------------------------------------------------------- admission day (time travel)
    # Bookings need a future admission date and a discharge cannot precede it, so the rest of the journey
    # runs on a moved clock: admission day -> +5 days (discharge) -> + hold period (settlement).
    admission = date.fromisoformat(str(ctx.booking["admission_date"]))
    actors = [hospital.owner, agent.actor, patient]
    with time_machine.travel(datetime.combine(admission, time(10, 0), tzinfo=IST), tick=True) as clock:
        await refresh_tokens(j, staff, auth_headers, actors)

        j.step("hospital: admits the patient (POST /bookings/{id}/admit)")
        admitted = await j.call(
            hospital.owner,
            "POST",
            f"/bookings/{ctx.booking_id}/admit",
            json={"note": "Admitted to orthopaedic ward"},
        )
        j.check(
            admitted.get("status") == "admitted",
            f"booking after admit: {admitted.get('status')!r}",
            module="cases (be-cases)",
        )
        case = await j.call(patient, "GET", f"/cases/{ctx.case_id}")
        j.check(
            case.get("status") == "in_treatment",
            f"case after admission {case.get('status')!r}",
            module="cases (be-cases)",
        )

        clock.shift(timedelta(days=5))
        await refresh_tokens(j, staff, auth_headers, actors)

        j.step("hospital: completes treatment / discharge (POST /bookings/{id}/complete)")
        completed = await j.call(
            hospital.owner,
            "POST",
            f"/bookings/{ctx.booking_id}/complete",
            json={"note": "Discharged in good condition"},
        )
        j.check(
            completed.get("status") == "completed" and completed.get("completed_at"),
            f"booking after complete: {completed}",
            module="cases (be-cases)",
        )
        await drain_jobs(j, db, run_jobs)
        case = await j.call(patient, "GET", f"/cases/{ctx.case_id}")
        j.check(
            case.get("status") == "completed",
            f"case after discharge {case.get('status')!r}",
            module="cases (be-cases)",
        )

        # ------------------------------------------------------- revenue recognition (PLAN 6.4 step 2)
        paid = int(completed.get("amount_paid_minor") or ctx.booking["amount_paid_minor"])
        gross = paid  # patient_service_fee_bps = 0  ->  H = P
        commission = bps(gross, COMMISSION_BPS)
        gst = bps(commission, GST_BPS)
        tds = bps(gross, TDS_BPS)
        agent_commission = bps(gross, AGENT_COMMISSION_BPS)

        j.step(
            "finance: escrow released, settlement items pending "
            "(GET /finance/summary, /finance/settlements/items)"
        )
        summary = await j.call(staff.finance_a, "GET", "/finance/summary")
        j.check(
            summary.get("escrow_minor") == 0,
            f"escrow must be released on completion, escrow_minor={summary.get('escrow_minor')}",
            module=SIDE_EFFECT_OWNERS["booking.completed->ledger"],
        )
        items = items_of(
            await j.call(staff.finance_a, "GET", "/finance/settlements/items", params={"page_size": 100})
        )
        hospital_items = [
            i
            for i in items
            if i.get("payee_type") == "hospital" and i.get("payee_id") == hospital.hospital_id
        ]
        agent_items = [
            i for i in items if i.get("payee_type") == "agent" and i.get("payee_id") == agent.agent_id
        ]
        j.check(
            len(hospital_items) == 1 and len(agent_items) == 1,
            f"expected one hospital and one agent settlement item, got: {items}",
            module=SIDE_EFFECT_OWNERS["booking.completed->settlements"],
        )
        h_item, a_item = hospital_items[0], agent_items[0]
        j.check(
            h_item.get("status") == "pending" and a_item.get("status") == "pending",
            f"new settlement items must be 'pending' during the hold: "
            f"{h_item.get('status')}, {a_item.get('status')}",
            module=SIDE_EFFECT_OWNERS["booking.completed->settlements"],
        )
        h_net = int(h_item.get("net_minor") or 0)
        j.check(
            h_item.get("gross_minor") == gross
            and near(h_item.get("commission_minor"), commission)
            and near(h_item.get("tax_minor"), gst)
            and near(h_item.get("tds_minor"), tds)
            and h_net == gross - h_item["commission_minor"] - h_item["tax_minor"] - h_item["tds_minor"],
            f"hospital item must be gross {gross}, commission~{commission}, gst~{gst}, tds~{tds}, "
            f"net=gross-C-G-T: "
            f"{h_item}",
            module=SIDE_EFFECT_OWNERS["booking.completed->settlements"],
        )
        a_net = int(a_item.get("net_minor") or 0)
        j.check(
            near(a_item.get("gross_minor"), agent_commission) and a_net == a_item.get("gross_minor"),
            f"agent item must be gross=net~{agent_commission} (5% of {gross}): {a_item}",
            module=SIDE_EFFECT_OWNERS["booking.completed->settlements"],
        )
        j.check(
            summary.get("hospital_payables_minor") == h_net and summary.get("agent_payables_minor") == a_net,
            f"payables in the finance summary ({summary.get('hospital_payables_minor')}, "
            f"{summary.get('agent_payables_minor')}) != item nets ({h_net}, {a_net})",
            module=SIDE_EFFECT_OWNERS["booking.completed->ledger"],
        )
        await assert_trial_balance_zero(j, staff.finance_a)

        j.step(
            "hospital & agent see their own pending earnings "
            "(GET /finance/summary, /agent-portal/commissions)"
        )
        own = await j.call(hospital.owner, "GET", "/finance/summary")
        j.check(
            own.get("pending_minor") == h_net,
            f"hospital pending_minor {own.get('pending_minor')} != {h_net}",
            module="settlements (be-finance)",
        )
        commissions = items_of(await j.call(agent.actor, "GET", "/agent-portal/commissions"))
        j.check(
            [id_of(c) for c in commissions] == [id_of(a_item)],
            f"agent commissions should list exactly its item: {commissions}",
            module="agents (be-messaging)",
        )

        j.step(
            "support/admin users cannot generate settlement batches "
            "(POST /finance/settlements/batches -> 403)"
        )
        for actor in (staff.admin, staff.support, hospital.owner):
            status, body = await j.status_of(
                actor,
                "POST",
                "/finance/settlements/batches",
                json={"payee_type": "hospital", "payee_id": hospital.hospital_id},
            )
            j.check(
                status == 403,
                f"{actor.label} generating a batch -> {status} {body}",
                module="settlements (be-finance)",
            )

        j.step("the settlement hold is enforced: mark_eligible right after discharge keeps items pending")
        await run_periodic_task(j, db, run_jobs, "settlements.mark_eligible")
        still_pending = items_of(
            await j.call(
                staff.finance_a,
                "GET",
                "/finance/settlements/items",
                params={"status": "pending", "page_size": 100},
            )
        )
        j.check(
            {id_of(h_item), id_of(a_item)} <= {id_of(i) for i in still_pending},
            f"items became eligible before settlement_hold_days={SETTLEMENT_HOLD_DAYS}: {still_pending}",
            module=SIDE_EFFECT_OWNERS["mark_eligible"],
        )

        # ------------------------------------------------------------ settlement hold + payouts
        clock.shift(timedelta(days=SETTLEMENT_HOLD_DAYS + 1))
        await refresh_tokens(j, staff, auth_headers, actors)

        j.step(f"{SETTLEMENT_HOLD_DAYS + 1} days after discharge: settlements.mark_eligible runs")
        await run_periodic_task(j, db, run_jobs, "settlements.mark_eligible")
        eligible = items_of(
            await j.call(
                staff.finance_a,
                "GET",
                "/finance/settlements/items",
                params={"status": "eligible", "page_size": 100},
            )
        )
        j.check(
            {id_of(h_item), id_of(a_item)} <= {id_of(i) for i in eligible},
            "settlement items are not 'eligible' after the hold period "
            "(mark_eligible must compare eligible_at "
            f"with the application clock, which time-machine moves): {eligible}",
            module=SIDE_EFFECT_OWNERS["mark_eligible"],
        )

        j.step("finance user A generates hospital and agent batches (POST /finance/settlements/batches)")
        batches: dict[str, dict[str, Any]] = {}
        for payee_type, payee_id, net in (
            ("hospital", hospital.hospital_id, h_net),
            ("agent", agent.agent_id, a_net),
        ):
            batch = await j.call(
                staff.finance_a,
                "POST",
                "/finance/settlements/batches",
                json={"payee_type": payee_type, "payee_id": payee_id},
                expect=(200, 201),
            )
            j.check(
                batch.get("status") == "pending_approval"
                and batch.get("items_count") == 1
                and batch.get("total_net_minor") == net
                and str(batch.get("batch_number", "")).startswith("HIG-S-"),
                f"{payee_type} batch must be pending_approval with 1 item netting {net}: {batch}",
                module="settlements (be-finance)",
            )
            batches[payee_type] = batch

        j.step("maker-checker: the creator (finance A), admin and support cannot approve (403)")
        for batch in batches.values():
            for actor in (staff.finance_a, staff.admin, staff.support):
                status, body = await j.status_of(
                    actor, "POST", f"/finance/settlements/batches/{id_of(batch)}/approve", json={}
                )
                j.check(
                    status == 403,
                    f"{actor.label} approving batch {batch.get('batch_number')} -> {status} {body}",
                    module="settlements (be-finance) maker-checker",
                )

        j.step("finance user B approves and processes the batches (approve, process)")
        for payee_type, batch in batches.items():
            approved = await j.call(
                staff.finance_b, "POST", f"/finance/settlements/batches/{id_of(batch)}/approve", json={}
            )
            j.check(
                approved.get("status") == "approved" and approved.get("approved_at"),
                f"{payee_type} batch after approval: {approved}",
                module="settlements (be-finance)",
            )
            await j.call(
                staff.finance_b,
                "POST",
                f"/finance/settlements/batches/{id_of(batch)}/process",
                json={},
                expect=(200, 202),
            )
        await drain_jobs(j, db, run_jobs)

        j.step("payouts are processed by the mock provider (GET /finance/settlements/payouts, batches)")
        payouts = items_of(
            await j.call(staff.finance_a, "GET", "/finance/settlements/payouts", params={"page_size": 100})
        )
        by_payee = {(p.get("payee_type"), p.get("payee_id")): p for p in payouts}
        for payee_type, payee_id, net in (
            ("hospital", hospital.hospital_id, h_net),
            ("agent", agent.agent_id, a_net),
        ):
            payout = by_payee.get((payee_type, payee_id))
            j.check(
                payout is not None
                and payout.get("status") == "processed"
                and payout.get("amount_minor") == net,
                f"{payee_type} payout must be processed for {net}: {payout}",
                module="settlements (be-finance) payout provider",
            )
        for payee_type, batch in batches.items():
            final = await j.call(staff.finance_a, "GET", f"/finance/settlements/batches/{id_of(batch)}")
            j.check(
                final.get("status") == "completed",
                f"{payee_type} batch final status {final.get('status')!r}",
                module="settlements (be-finance)",
            )
        paid_items = items_of(
            await j.call(
                staff.finance_a,
                "GET",
                "/finance/settlements/items",
                params={"status": "paid", "page_size": 100},
            )
        )
        j.check(
            {id_of(h_item), id_of(a_item)} <= {id_of(i) for i in paid_items},
            f"settlement items not marked paid: {paid_items}",
            module="settlements (be-finance)",
        )

        j.step("ledger: trial balance nets to zero, hospital/agent payables are zero after payout")
        await assert_trial_balance_zero(j, staff.finance_a)
        for owner_type, code in (
            ("hospital", f"HOSPITAL:{hospital.hospital_id}:PAYABLE"),
            ("agent", f"AGENT:{agent.agent_id}:PAYABLE"),
        ):
            account = await ledger_account(j, staff.finance_a, owner_type, code)
            j.check(
                account is not None and account.get("balance_minor") == 0,
                f"{code} must exist with balance 0 after payout: {account}",
                module=SIDE_EFFECT_OWNERS["payout.processed->ledger"],
            )
        summary = await j.call(staff.finance_a, "GET", "/finance/summary")
        j.check(
            summary.get("hospital_payables_minor") == 0 and summary.get("agent_payables_minor") == 0,
            f"payables after payout: {summary}",
            module="ledger (be-finance)",
        )

        j.step("hospital sees only its own paid payout (GET /finance/summary, /finance/settlements/payouts)")
        own = await j.call(hospital.owner, "GET", "/finance/summary")
        j.check(
            own.get("paid_minor") == h_net and own.get("pending_minor") == 0,
            f"hospital finance summary after payout: {own}",
            module="settlements (be-finance)",
        )
        own_payouts = items_of(await j.call(hospital.owner, "GET", "/finance/settlements/payouts"))
        j.check(
            [p.get("payee_id") for p in own_payouts] == [hospital.hospital_id],
            f"hospital must see exactly its own payout: {own_payouts}",
            module="settlements (be-finance)",
        )

        j.step("patient has notifications (GET /notifications, /notifications/unread-count)")
        notifications = items_of(await j.call(patient, "GET", "/notifications"))
        j.check(
            notifications,
            "patient received no notifications during the whole journey",
            module=SIDE_EFFECT_OWNERS["notifications"],
        )
        unread = await j.call(patient, "GET", "/notifications/unread-count")
        count = unread.get("count", unread.get("unread")) if isinstance(unread, dict) else unread
        j.check(
            isinstance(count, int) and count > 0, f"unread-count: {unread}", module="messaging (be-messaging)"
        )

        j.step("the case conversation exists with patient, agent and hospital (GET /conversations)")
        conversations = items_of(await j.call(patient, "GET", "/conversations"))
        conversation = next((c for c in conversations if str(c.get("case_id")) == ctx.case_id), None)
        j.check(
            conversation is not None,
            f"no case conversation for case {ctx.case_id}: {conversations}",
            module=SIDE_EFFECT_OWNERS["case.created->conversation"],
        )
        assert conversation is not None
        participant_ids = {str(p.get("user_id")) for p in conversation.get("participants") or []}
        j.check(
            {patient.user_id, hospital.owner.user_id, agent.actor.user_id} <= participant_ids,
            f"case conversation participants {participant_ids} must include patient {patient.user_id}, "
            f"hospital owner {hospital.owner.user_id} and agent {agent.actor.user_id}",
            module=SIDE_EFFECT_OWNERS["case.created->conversation"],
        )

        j.step("patient messages the hospital in the case conversation (POST/GET .../messages)")
        await j.call(
            patient,
            "POST",
            f"/conversations/{id_of(conversation)}/messages",
            json={"body": "Thank you for the excellent care!"},
            expect=(200, 201),
        )
        thread = items_of(
            await j.call(hospital.owner, "GET", f"/conversations/{id_of(conversation)}/messages")
        )
        j.check(
            any(m.get("body") == "Thank you for the excellent care!" for m in thread),
            f"hospital cannot read the patient's message: {thread}",
            module="messaging (be-messaging)",
        )

        assert_no_failed_jobs(j)


# ===================================================================================== (b) cancellation
async def test_cancellation_triggers_automatic_refund(
    client: httpx.AsyncClient,
    db: AsyncSession,
    make_user: MakeUser,
    auth_headers: AuthHeaders,
    run_jobs: RunJobs,
) -> None:
    j = Journey(client, "cancellation + automatic refund")
    staff = await make_staff(make_user, auth_headers)
    catalog = await seed_catalog(db)
    hospital = await provision_hospital(j, db, make_user, catalog, tag="c")
    patient, _patient_id = await register_patient(j, tag="c")
    ctx = await case_quote_booking(
        j, patient=patient, hospital=hospital, catalog=catalog, screening_id=None, admission_in_days=30
    )
    await pay_deposit(j, db, run_jobs, patient, ctx, staff)
    assert ctx.order is not None
    paid_inr = int(ctx.booking["amount_paid_minor"])

    j.step("patient cancels 30 days before admission (POST /bookings/{id}/cancel) - 100% refundable")
    cancelled = await j.call(
        patient,
        "POST",
        f"/bookings/{ctx.booking_id}/cancel",
        json={"reason": "Family emergency - postponing treatment"},
    )
    j.check(
        cancelled.get("status") == "cancelled"
        and cancelled.get("refund_pct") == 100
        and cancelled.get("refundable_minor") == paid_inr,
        f"cancel 30 days ahead must be 100% refundable ({paid_inr} INR) per refund_policy: "
        f"status={cancelled.get('status')!r} refund_pct={cancelled.get('refund_pct')!r} "
        f"refundable_minor={cancelled.get('refundable_minor')!r}",
        module="cases (be-cases)",
    )

    j.step("worker: automatic refund is processed (run_jobs)")
    await drain_jobs(j, db, run_jobs)

    j.step("refund is processed for the full payment (GET /payments/refunds as finance)")
    refunds = items_of(await j.call(staff.finance_a, "GET", "/payments/refunds", params={"page_size": 100}))
    ours = [
        r
        for r in refunds
        if str(r.get("order_id")) == ctx.order_id or str(r.get("booking_id")) == ctx.booking_id
    ]
    j.check(
        len(ours) == 1,
        f"expected exactly one refund for the cancelled booking, got: {refunds}",
        module=SIDE_EFFECT_OWNERS["booking.cancelled->refund"],
    )
    refund = ours[0]
    j.check(
        refund.get("status") == "processed"
        and (
            refund.get("amount_minor") == ctx.order.get("amount_minor")
            or refund.get("base_amount_minor") == ctx.order.get("base_amount_minor")
        ),
        f"refund must be processed for the whole captured amount ({ctx.order.get('amount_minor')} USD / "
        f"{ctx.order.get('base_amount_minor')} INR): {refund}",
        module="payments (be-payments)",
    )
    order = await j.call(patient, "GET", f"/payments/orders/{ctx.order_id}")
    j.check(
        order.get("status") == "refunded",
        f"order status after full refund {order.get('status')!r}",
        module="payments (be-payments)",
    )

    j.step("booking and case reflect the cancellation and refund (GET /bookings/{id}, /cases/{id})")
    booking = await j.call(patient, "GET", f"/bookings/{ctx.booking_id}")
    j.check(
        booking.get("status") == "cancelled"
        and booking.get("cancelled_at")
        and booking.get("amount_refunded_minor") == paid_inr,
        f"booking must be cancelled with amount_refunded_minor={paid_inr}: {booking}",
        module=SIDE_EFFECT_OWNERS["refund.processed->booking"],
    )
    case = await j.call(patient, "GET", f"/cases/{ctx.case_id}")
    j.check(
        case.get("status") == "cancelled",
        f"case after booking cancellation {case.get('status')!r}",
        module="cases (be-cases)",
    )

    j.step(
        "escrow reduced back to zero and ledger balanced (GET /finance/summary, trial balance, transactions)"
    )
    summary = await j.call(staff.finance_a, "GET", "/finance/summary")
    j.check(
        summary.get("escrow_minor") == 0,
        f"escrow after full refund: {summary.get('escrow_minor')}",
        module=SIDE_EFFECT_OWNERS["refund.processed->ledger"],
    )
    txns = items_of(
        await j.call(staff.finance_a, "GET", "/finance/ledger/transactions", params={"txn_type": "refund"})
    )
    j.check(
        len(txns) == 1,
        f"expected one refund ledger transaction: {txns}",
        module=SIDE_EFFECT_OWNERS["refund.processed->ledger"],
    )
    await assert_trial_balance_zero(j, staff.finance_a)
    items = items_of(await j.call(staff.finance_a, "GET", "/finance/settlements/items"))
    j.check(
        items == [],
        f"a cancelled booking must not create settlement items: {items}",
        module="settlements (be-finance)",
    )

    j.step("patient is notified about the cancellation/refund (GET /notifications)")
    notifications = items_of(await j.call(patient, "GET", "/notifications"))
    kinds = [str(n.get("kind")) for n in notifications]
    j.check(
        any("cancel" in k or "refund" in k for k in kinds),
        f"no cancellation/refund notification for the patient: {kinds}",
        module=SIDE_EFFECT_OWNERS["notifications"],
    )

    assert_no_failed_jobs(j)


# ===================================================================================== (c) IDOR sweep
async def test_cross_tenant_idor_sweep(
    client: httpx.AsyncClient,
    db: AsyncSession,
    make_user: MakeUser,
    auth_headers: AuthHeaders,
    run_jobs: RunJobs,
) -> None:
    j = Journey(client, "cross-tenant IDOR sweep")
    staff = await make_staff(make_user, auth_headers)
    catalog = await seed_catalog(db)

    # ---- tenant A: hospital, agent-referred patient with screening, document, case, booking, payment order
    hospital_a = await provision_hospital(j, db, make_user, catalog, tag="ida")
    agent_a = await provision_agent(j, db, make_user, tag="ida")
    patient_a, patient_a_id = await register_patient(j, tag="ida", referral_code=agent_a.agent_code)
    screening_id, _ = await screening_flow(j, db, run_jobs, patient_a, catalog, hospital_a)
    ctx = await case_quote_booking(
        j,
        patient=patient_a,
        hospital=hospital_a,
        catalog=catalog,
        screening_id=screening_id,
        admission_in_days=25,
        expect_agent_id=agent_a.agent_id,
    )

    j.step("patient A uploads a medical report to the case (POST /documents)")
    document = await j.call(
        patient_a,
        "POST",
        "/documents",
        files={"file": ("mri-report.pdf", pdf_bytes("MRI right knee"), "application/pdf")},
        data={"kind": "medical_report", "case_id": ctx.case_id},
        expect=(200, 201),
    )
    document_id = str(id_of(document))

    j.step("patient A opens a payment order (POST /payments/orders)")
    checkout = await j.call(
        patient_a,
        "POST",
        "/payments/orders",
        json={
            "booking_id": ctx.booking_id,
            "purpose": "booking_deposit",
            "gateway": "mock",
            "currency": "USD",
        },
        headers={"Idempotency-Key": f"idor-{short_uid()}"},
        expect=(200, 201),
    )
    order_id = str(id_of(checkout.get("order")))

    j.step("owners can read their own resources (sanity before the sweep)")
    for actor, path in (
        (patient_a, f"/cases/{ctx.case_id}"),
        (patient_a, f"/bookings/{ctx.booking_id}"),
        (patient_a, f"/payments/orders/{order_id}"),
        (patient_a, f"/documents/{document_id}"),
        (patient_a, f"/screenings/{screening_id}"),
        (agent_a.actor, f"/cases/{ctx.case_id}"),
        (hospital_a.owner, f"/cases/{ctx.case_id}"),
        (hospital_a.owner, f"/bookings/{ctx.booking_id}"),
        (hospital_a.owner, f"/documents/{document_id}"),
    ):
        await j.call(actor, "GET", path)

    # ---- tenant B
    hospital_b = await provision_hospital(j, db, make_user, catalog, tag="idb")
    agent_b = await provision_agent(j, db, make_user, tag="idb")
    patient_b, _ = await register_patient(j, tag="idb")
    attackers = (patient_b, agent_b.actor, hospital_b.owner)

    # Role-gated endpoints (PLAN 8): screenings are P/A only, so a hospital user may get 403 instead of 404 -
    # acceptable only when it is identical for a random id (no existence oracle).
    random_id = "0190f000-0000-7000-8000-000000000000"
    targets = {
        "case": f"/cases/{ctx.case_id}",
        "booking": f"/bookings/{ctx.booking_id}",
        "booking checklist": f"/bookings/{ctx.booking_id}/checklist",
        "payment order": f"/payments/orders/{order_id}",
        "document": f"/documents/{document_id}",
        "document download": f"/documents/{document_id}/download",
        "screening": f"/screenings/{screening_id}",
        "screening matches": f"/screenings/{screening_id}/matches",
    }
    j.step(
        "IDOR: patient B, agent B and hospital B get 404 for A's case, booking, order, document, screening"
    )
    leaks: list[str] = []
    for attacker in attackers:
        for label, path in targets.items():
            status, body = await j.status_of(attacker, "GET", path)
            allowed = {404}
            if attacker is hospital_b.owner and label.startswith("screening"):
                probe = path.replace(screening_id, random_id)
                random_status, _ = await j.status_of(attacker, "GET", probe)
                allowed = {404} | ({403} if random_status == 403 else set())
            if status not in allowed:
                leaks.append(f"{attacker.label} GET {path} ({label}) -> {status} {str(body)[:200]}")
    j.check(
        not leaks,
        "cross-tenant access not denied with 404:\n    " + "\n    ".join(leaks),
        module="per-endpoint owners: cases/bookings (be-cases), payments (be-payments), "
        "documents (be-auth), screening (be-screening)",
    )

    j.step("IDOR: B's list endpoints do not contain A's resources")
    for attacker in attackers:
        for path, needle in (
            ("/cases", ctx.case_id),
            ("/bookings", ctx.booking_id),
            ("/payments/orders", order_id),
            ("/documents", document_id),
        ):
            status, body = await j.status_of(attacker, "GET", path)
            j.check(
                status in (200, 403) and needle not in str(body),
                f"{attacker.label} GET {path} -> {status}, leaks A's id {needle}",
                module=owner_of(path),
            )

    j.step("IDOR: B cannot act on A's resources (cancel, quote, admit, pay, complete mock payment, delete)")
    attempts = [
        (patient_b, "POST", f"/bookings/{ctx.booking_id}/cancel", {"reason": "x"}),
        (agent_b.actor, "POST", f"/bookings/{ctx.booking_id}/cancel", {"reason": "x"}),
        (patient_b, "POST", f"/cases/{ctx.case_id}/quotes/{ctx.quote_id}/accept", {}),
        (
            hospital_b.owner,
            "POST",
            f"/cases/{ctx.case_id}/quotes",
            {
                "treatment_plan": "x",
                "line_items": QUOTE_LINES,
                "currency": "INR",
                "estimated_stay_days": 3,
                "valid_until": (today_ist() + timedelta(days=10)).isoformat(),
            },
        ),
        (hospital_b.owner, "POST", f"/bookings/{ctx.booking_id}/admit", {}),
        (patient_b, "POST", f"/payments/mock/{order_id}/complete", {"outcome": "success"}),
        (patient_b, "PATCH", f"/screenings/{screening_id}", {"notes": "tampered"}),
        (patient_b, "DELETE", f"/documents/{document_id}", None),
    ]
    problems = []
    for actor, method, path, payload in attempts:
        status, body = await j.status_of(actor, method, path, json=payload)
        if status != 404:
            problems.append(f"{actor.label} {method} {path} -> {status} {str(body)[:200]}")
    status, body = await j.status_of(
        patient_b,
        "POST",
        "/payments/orders",
        json={"booking_id": ctx.booking_id, "purpose": "booking_deposit", "gateway": "mock"},
        headers={"Idempotency-Key": f"idor-b-{short_uid()}"},
    )
    if status != 404:
        problems.append(f"patient B POST /payments/orders for A's booking -> {status} {str(body)[:200]}")
    status, body = await j.status_of(
        agent_b.actor,
        "POST",
        "/cases",
        json={
            "hospital_id": hospital_a.hospital_id,
            "patient_id": patient_a_id,
            "patient_notes": "x",
            "consent_share": True,
        },
    )
    if status not in (403, 404):
        problems.append(f"agent B POST /cases for A's patient -> {status} {str(body)[:200]}")
    j.check(
        not problems,
        "cross-tenant writes were not rejected with 404:\n    " + "\n    ".join(problems),
        module="per-endpoint owners (see paths)",
    )

    j.step("A's resources are untouched after the attempts")
    booking = await j.call(patient_a, "GET", f"/bookings/{ctx.booking_id}")
    j.check(
        booking.get("status") == "pending_payment",
        f"A's booking changed: {booking.get('status')!r}",
        module="cases (be-cases)",
    )
    await j.call(patient_a, "GET", f"/documents/{document_id}")

    j.step("non-finance users cannot approve settlement batches or read the ledger (403)")
    denied = []
    for actor in (staff.admin, staff.support, hospital_b.owner, agent_b.actor, patient_b):
        for method, path in (
            ("POST", f"/finance/settlements/batches/{random_id}/approve"),
            ("POST", f"/finance/settlements/batches/{random_id}/process"),
            ("GET", "/finance/ledger/trial-balance"),
        ):
            status, body = await j.status_of(actor, method, path, json={} if method == "POST" else None)
            if status != 403:
                denied.append(f"{actor.label} {method} {path} -> {status} {str(body)[:160]}")
    j.check(
        not denied,
        "finance-only endpoints are not restricted:\n    " + "\n    ".join(denied),
        module="settlements/ledger (be-finance)",
    )

    await drain_jobs(j, db, run_jobs)
    assert_no_failed_jobs(j)
