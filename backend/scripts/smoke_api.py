"""Smoke-test a *running* Heal India Global API with a short version of the end-to-end journey.

Usage (from ``backend/``, server started with ``python -m uvicorn app.main:app --port 8000``)::

    .venv/Scripts/python -m scripts.smoke_api --base-url http://127.0.0.1:8000
    .venv/Scripts/python -m scripts.smoke_api --fresh            # ignore demo patient/agent/hospital accounts
    .venv/Scripts/python -m scripts.smoke_api --settle           # also run a maker-checker settlement batch

The script uses the seeded demo accounts (``python -m scripts.seed``; password ``HealIndia@2026``):
staff ``superadmin@ / admin@ / finance1@ / finance2@ / support@healindia.example``, the agent
``agent.lagos@healindia.example``, the patient ``patient.us@healindia.example`` and hospital owners
``owner.<hospital-slug>@healindia.example``. When a demo patient/agent/hospital account is missing (or with
``--fresh``) it registers fresh users instead (agents and hospitals are approved by the demo admin). Staff
accounts must exist (the server cannot create the first admin over HTTP).

Background work (screening triage, payment events) is processed by the API's embedded worker
(``RUN_WORKER_IN_API=true``) or a separate ``python -m app.worker``; the script polls for the results.

A live server cannot move its clock, so the discharge step runs only once the admission date has arrived
(otherwise it is SKIPped); discharge, the settlement hold and payouts are covered by ``tests/e2e`` with time
travel. Instead, a second paid booking is cancelled to verify the automatic refund pipeline in real time.

Every step prints PASS/FAIL/SKIP with its duration; the exit code is 1 if any step failed. Only ``httpx`` and
the standard library are used, so the script can run from any machine that can reach the server.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import time
import uuid
from collections.abc import Awaitable, Callable, Iterable
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Any

import httpx

DEMO_PASSWORD = "HealIndia@2026"  # noqa: S105 - documented demo password of the seeded accounts
DEMO_DOMAIN = "healindia.example"
STAFF_ACCOUNTS = {
    "superadmin": f"superadmin@{DEMO_DOMAIN}",
    "admin": f"admin@{DEMO_DOMAIN}",
    "finance1": f"finance1@{DEMO_DOMAIN}",
    "finance2": f"finance2@{DEMO_DOMAIN}",
    "support": f"support@{DEMO_DOMAIN}",
}
DEMO_PATIENT = f"patient.us@{DEMO_DOMAIN}"
DEMO_AGENT = f"agent.lagos@{DEMO_DOMAIN}"
FRESH_PASSWORD = "Smoke-Test-2026"  # noqa: S105 - password for throwaway users registered by this script
PDF = b"%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"

QUOTE_LINES = [
    {"category": "surgery", "description": "Procedure incl. OT charges", "amount_minor": 30_000_000},
    {"category": "implants", "description": "Implant", "amount_minor": 12_000_000},
    {"category": "hospital_stay", "description": "5 nights, private room", "amount_minor": 5_000_000},
    {"category": "tests_scans", "description": "Pre-operative tests", "amount_minor": 1_500_000},
    {"category": "medications", "description": "Medications", "amount_minor": 1_500_000},
]

GREEN, RED, YELLOW, DIM, RESET = "\033[32m", "\033[31m", "\033[33m", "\033[2m", "\033[0m"


class StepFailed(Exception):
    """A check failed; the message explains what and where."""


class StepSkipped(Exception):
    """The step does not apply (e.g. optional feature not requested)."""


@dataclass
class Account:
    label: str
    email: str
    password: str
    token: str | None = None
    user: dict[str, Any] = field(default_factory=dict)

    @property
    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token}"} if self.token else {}


@dataclass
class Result:
    name: str
    status: str
    ms: float
    detail: str = ""


def items_of(payload: Any) -> list[Any]:
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict) and isinstance(payload.get("items"), list):
        return payload["items"]
    return []


def id_of(value: Any) -> str | None:
    if isinstance(value, dict):
        return str(value["id"]) if value.get("id") is not None else None
    return str(value) if value is not None else None


IST = timezone(timedelta(hours=5, minutes=30))


def today_ist() -> date:
    """India's calendar date (admission/discharge dates are Indian dates)."""
    return datetime.now(IST).date()


def ensure(condition: Any, message: str) -> None:
    if not condition:
        raise StepFailed(message)


class Smoke:
    def __init__(self, args: argparse.Namespace) -> None:
        self.root = args.base_url.rstrip("/")
        if self.root.endswith("/api/v1"):
            self.root = self.root[: -len("/api/v1")]
        self.api = self.root + "/api/v1"
        self.args = args
        self.color = sys.stdout.isatty() and not args.no_color
        self.client = httpx.AsyncClient(timeout=args.timeout, headers={"User-Agent": "hig-smoke/1.0"})
        self.results: list[Result] = []
        self.blocked_by: str | None = None
        self.staff: dict[str, Account] = {}
        self.ctx: dict[str, Any] = {}

    # ------------------------------------------------------------------------------------------ plumbing
    def _paint(self, text: str, color: str) -> str:
        return f"{color}{text}{RESET}" if self.color else text

    def _record(self, name: str, status: str, ms: float, detail: str = "") -> None:
        self.results.append(Result(name, status, ms, detail))
        color = {"PASS": GREEN, "FAIL": RED, "SKIP": YELLOW}[status]
        line = f"[{self._paint(status, color)}] {ms:8.1f} ms  {name}"
        if detail:
            line += self._paint(f"  - {detail}", DIM if status == "PASS" else color)
        print(line, flush=True)

    async def step(self, name: str, fn: Callable[[], Awaitable[Any]], *, critical: bool = True) -> Any:
        if self.blocked_by is not None:
            self._record(name, "SKIP", 0.0, f"blocked by failed step: {self.blocked_by}")
            return None
        started = time.perf_counter()
        try:
            value = await fn()
        except StepSkipped as exc:
            self._record(name, "SKIP", (time.perf_counter() - started) * 1000, str(exc))
            return None
        except (StepFailed, httpx.HTTPError, KeyError, TypeError, ValueError) as exc:
            detail = str(exc) or type(exc).__name__
            if isinstance(exc, httpx.HTTPError):
                detail = f"{type(exc).__name__}: {exc}"
            self._record(name, "FAIL", (time.perf_counter() - started) * 1000, detail)
            if critical:
                self.blocked_by = name
            return None
        detail = value if isinstance(value, str) else ""
        self._record(name, "PASS", (time.perf_counter() - started) * 1000, detail)
        return value

    async def call(
        self,
        method: str,
        path: str,
        *,
        account: Account | None = None,
        expect: int | Iterable[int] = (200,),
        **kwargs: Any,
    ) -> Any:
        expected = (expect,) if isinstance(expect, int) else tuple(expect)
        headers = dict(kwargs.pop("headers", {}) or {})
        if account is not None:
            headers.update(account.headers)
        url = path if path.startswith("http") else self.api + path
        response = await self.client.request(method, url, headers=headers, **kwargs)
        if response.status_code not in expected:
            who = account.label if account else "anonymous"
            raise StepFailed(
                f"{method} {url.replace(self.root, '')} as {who} -> {response.status_code} "
                f"(expected {list(expected)}): {response.text[:400]}"
            )
        if response.status_code == 204 or not response.content:
            return None
        if "json" in response.headers.get("content-type", ""):
            return response.json()
        return response

    async def poll(self, fetch: Callable[[], Awaitable[Any]], done: Callable[[Any], bool], what: str) -> Any:
        deadline = time.monotonic() + self.args.poll_seconds
        value = await fetch()
        while not done(value):
            if time.monotonic() > deadline:
                raise StepFailed(
                    f"timed out after {self.args.poll_seconds}s waiting for {what} (is the worker running? "
                    f"RUN_WORKER_IN_API=true or python -m app.worker); last value: {str(value)[:300]}"
                )
            await asyncio.sleep(1.0)
            value = await fetch()
        return value

    async def login(self, account: Account) -> Account:
        body = await self.call(
            "POST",
            "/auth/login",
            json={"email": account.email, "password": account.password},
            headers={"X-Client-Type": "mobile"},
        )
        account.token = body["access_token"]
        account.user = body.get("user") or {}
        return account

    async def try_login(self, label: str, email: str) -> Account | None:
        """Log in, or return ``None`` when the account does not exist / the password is wrong. Rate limiting
        (429) and server errors are real failures, not a missing account."""
        account = Account(label, email, self.args.password)
        response = await self.client.post(
            self.api + "/auth/login",
            json={"email": email, "password": account.password},
            headers={"X-Client-Type": "mobile"},
        )
        if response.status_code == 200:
            body = response.json()
            account.token = body["access_token"]
            account.user = body.get("user") or {}
            return account
        if response.status_code == 429:
            raise StepFailed(f"login rate limit hit while logging in {email} - wait a minute and retry")
        if response.status_code >= 500:
            raise StepFailed(f"POST /auth/login for {email} -> {response.status_code}: {response.text[:300]}")
        return None

    async def register(self, label: str, payload: dict[str, Any]) -> Account:
        body = await self.call(
            "POST", "/auth/register", json=payload, expect=(200, 201), headers={"X-Client-Type": "mobile"}
        )
        account = Account(
            label, payload["email"], payload["password"], body["access_token"], body.get("user") or {}
        )
        return account

    # ------------------------------------------------------------------------------------------ steps
    async def run(self) -> int:
        print(f"Heal India Global API smoke test against {self.api}\n")
        await self.step("server is live (GET /health/live)", self.health_live)
        await self.step("server is ready: database (+ redis) (GET /health/ready)", self.health_ready)
        await self.step(
            "staff demo accounts can log in (admin, finance1, finance2, support)", self.staff_logins
        )
        await self.step(
            "public catalog: specialties, procedures, hospitals, search", self.catalog, critical=False
        )
        await self.step("patient account (demo patient.us or fresh registration)", self.patient_account)
        await self.step(
            "agent account (demo agent.lagos or fresh, approved by admin)", self.agent_account, critical=False
        )
        await self.step(
            "hospital to treat the patient (demo hospital owner or fresh onboarding)", self.hospital_setup
        )
        await self.step(
            "screening: create, answer, submit (rules engine, use_ai=false)", self.screening_submit
        )
        await self.step("screening completes and returns matches (worker)", self.screening_result)
        await self.step("patient consents and requests a quote (POST /cases)", self.create_case)
        await self.step("hospital sends an itemized quote", self.send_quote)
        await self.step("patient accepts the quote and books with a deposit", self.accept_and_book)
        await self.step(
            "checkout with the mock gateway (Idempotency-Key replay returns the same order)", self.checkout
        )
        await self.step("mock payment succeeds -> order paid, booking confirmed (worker)", self.pay)
        await self.step("pre-arrival checklist exists", self.checklist, critical=False)
        await self.step(
            "escrow holds the captured deposit (GET /finance/summary)", self.escrow, critical=False
        )
        await self.step("hospital admits the patient", self.admit)
        await self.step(
            "hospital discharges the patient (from the admission date)", self.discharge, critical=False
        )
        await self.step(
            "settlement items created for the booking (pending hold)", self.settlement_items, critical=False
        )
        await self.step(
            "cancelling a second paid booking triggers an automatic refund",
            self.cancellation_refund,
            critical=False,
        )
        await self.step("ledger trial balance nets to zero", self.trial_balance, critical=False)
        await self.step(
            "another patient gets 404 for this case/booking/order (IDOR)", self.idor, critical=False
        )
        await self.step(
            "support user cannot approve settlement batches (403)", self.rbac_batches, critical=False
        )
        await self.step(
            "patient has notifications and a case conversation", self.notifications, critical=False
        )
        await self.step("settlement batch maker-checker (--settle)", self.settle, critical=False)
        return self.summary()

    async def health_live(self) -> str:
        await self.call("GET", self.root + "/health/live")
        return "ok"

    async def health_ready(self) -> str:
        body = await self.call("GET", self.root + "/health/ready")
        return ", ".join(f"{k}={v}" for k, v in (body.get("checks") or {}).items())

    async def staff_logins(self) -> str:
        # Logins are rate limited (10/min/IP): only fall back to the super admin when admin is missing.
        missing = []
        for key, email in STAFF_ACCOUNTS.items():
            if key == "superadmin":
                continue
            account = await self.try_login(key, email)
            if account is None:
                missing.append(email)
            else:
                self.staff[key] = account
        if "admin" not in self.staff:
            superadmin = await self.try_login("superadmin", STAFF_ACCOUNTS["superadmin"])
            if superadmin is not None:
                self.staff["admin"] = self.staff["superadmin"] = superadmin
        ensure(
            "admin" in self.staff and "finance1" in self.staff and "finance2" in self.staff,
            f"cannot log in as {missing} with the demo password - seed the database "
            f"(python -m scripts.seed) or pass --password",
        )
        return f"{len(self.staff)} staff logged in" + (f"; missing {missing}" if missing else "")

    async def catalog(self) -> str:
        specialties = items_of(await self.call("GET", "/specialties"))
        ensure(specialties, "GET /specialties returned nothing (catalog not seeded?)")
        preferred = next((s for s in specialties if s.get("slug") in ("orthopedics", "orthopaedics")), None)
        specialty = preferred or max(specialties, key=lambda s: s.get("procedures_count") or 0)
        self.ctx["specialty"] = specialty
        procedures = items_of(await self.call("GET", "/procedures", params={"specialty": specialty["slug"]}))
        self.ctx["procedure"] = procedures[0] if procedures else None
        hospitals = await self.call("GET", "/hospitals", params={"page_size": 5})
        await self.call("GET", "/search", params={"q": "knee"})
        if self.ctx["procedure"]:
            comparison = await self.client.get(
                self.api + "/cost-comparison",
                params={"procedure": self.ctx["procedure"]["slug"], "country": "US", "currency": "USD"},
            )
            no_benchmark = comparison.status_code == 404 and "benchmark_not_found" in comparison.text
            ensure(
                comparison.status_code == 200 or no_benchmark,
                f"GET /cost-comparison -> {comparison.status_code}: {comparison.text[:300]}",
            )
        return (
            f"{len(specialties)} specialties, {len(procedures)} procedures in {specialty['slug']}, "
            f"{hospitals.get('total', len(items_of(hospitals)))} hospitals"
        )

    async def patient_account(self) -> str:
        account = None if self.args.fresh else await self.try_login("patient", DEMO_PATIENT)
        if account is None:
            uid = uuid.uuid4().hex[:8]
            account = await self.register(
                "patient",
                {
                    "email": f"smoke.patient.{uid}@{DEMO_DOMAIN}",
                    "password": FRESH_PASSWORD,
                    "full_name": "Smoke Test Patient",
                    "role": "patient",
                    "country_code": "US",
                    "accept_terms": True,
                },
            )
            self.ctx["patient_fresh"] = True
        self.ctx["patient"] = account
        return account.email

    async def agent_account(self) -> str:
        account = None if self.args.fresh else await self.try_login("agent", DEMO_AGENT)
        if account is None:
            uid = uuid.uuid4().hex[:8]
            account = await self.register(
                "agent",
                {
                    "email": f"smoke.agent.{uid}@{DEMO_DOMAIN}",
                    "password": FRESH_PASSWORD,
                    "full_name": "Smoke Test Agent",
                    "role": "agent",
                    "country_code": "NG",
                    "agency_name": f"Smoke Travel {uid}",
                    "accept_terms": True,
                },
            )
            agent_id = account.user.get("agent_id") or id_of(
                await self.call("GET", "/agent-portal/profile", account=account)
            )
            await self.call("POST", f"/admin/agents/{agent_id}/approve", account=self.staff["admin"], json={})
        referral = await self.call("GET", "/agent-portal/referral", account=account)
        self.ctx["agent"] = account
        return f"{account.email} (code {referral.get('agent_code')})"

    async def hospital_setup(self) -> str:
        if not self.args.fresh:
            hospitals = items_of(
                await self.call(
                    "GET",
                    "/hospitals",
                    params={"specialty": self.ctx.get("specialty", {}).get("slug", ""), "page_size": 20},
                )
            )
            for card in hospitals[:3]:  # stay well below the login rate limit
                owner = await self.try_login("hospital owner", f"owner.{card['slug']}@{DEMO_DOMAIN}")
                if owner is not None:
                    self.ctx["hospital_owner"] = owner
                    self.ctx["hospital"] = card
                    return f"demo hospital {card['slug']} (owner.{card['slug']}@{DEMO_DOMAIN})"
        return await self.onboard_fresh_hospital()

    async def onboard_fresh_hospital(self) -> str:
        specialty = self.ctx.get("specialty")
        procedure = self.ctx.get("procedure")
        if not specialty or not procedure:
            raise StepFailed("fresh hospital onboarding needs a specialty with procedures in the catalog")
        uid = uuid.uuid4().hex[:8]
        owner = await self.register(
            "hospital owner",
            {
                "email": f"smoke.owner.{uid}@{DEMO_DOMAIN}",
                "password": FRESH_PASSWORD,
                "full_name": "Smoke Owner",
                "role": "hospital",
                "country_code": "IN",
                "hospital_name": f"Smoke Test Hospital {uid}",
                "city": "Chennai",
                "accept_terms": True,
            },
        )
        profile = await self.call(
            "PUT",
            "/hospital-portal/profile",
            account=owner,
            json={
                "legal_name": f"Smoke Test Healthcare {uid} Pvt Ltd",
                "description": "Smoke-test hospital with an international patient desk.",
                "city": "Chennai",
                "state": "Tamil Nadu",
                "address": "1 Test Road",
                "pincode": "600001",
                "phone": "+91-44-0000-0000",
                "email": f"intl.{uid}@{DEMO_DOMAIN}",
                "accreditations": ["nabh"],
                "established_year": 2001,
                "bed_count": 200,
                "languages": ["English"],
                "international_desk": True,
                "gstin": "33ABCDE1234F1Z7",
            },
        )
        hospital_id = id_of(profile)
        await self.call(
            "POST",
            "/documents",
            account=owner,
            expect=(200, 201),
            files={"file": ("registration.pdf", PDF, "application/pdf")},
            data={"kind": "kyc_registration", "hospital_id": str(hospital_id)},
        )
        await self.call("POST", "/hospital-portal/submit-for-review", account=owner, expect=(200, 201, 202))
        await self.call(
            "POST", f"/admin/hospitals/{hospital_id}/approve", account=self.staff["admin"], json={}
        )
        await self.call(
            "PUT", "/hospital-portal/specialties", account=owner, json={"specialty_ids": [specialty["id"]]}
        )
        doctor = await self.call(
            "POST",
            "/hospital-portal/doctors",
            account=owner,
            expect=(200, 201),
            json={
                "full_name": "Dr. Smoke Test",
                "gender": "female",
                "specialty_id": specialty["id"],
                "qualifications": ["MBBS", "MS"],
                "experience_years": 12,
                "languages": ["English"],
                "consultation_fee_minor": 100_000,
                "currency": "INR",
            },
        )
        offering = await self.call(
            "POST",
            "/hospital-portal/procedures",
            account=owner,
            expect=(200, 201),
            json={
                "procedure_id": procedure["id"],
                "doctor_ids": [doctor["id"]],
                "price_min_minor": 40_000_000,
                "price_max_minor": 55_000_000,
                "currency": "INR",
                "hospital_stay_days": 5,
            },
        )
        await self.call(
            "POST",
            f"/hospital-portal/procedures/{offering['id']}/packages",
            account=owner,
            expect=(200, 201),
            json={
                "name": "Medical only",
                "tier": "medical_only",
                "price_minor": 45_000_000,
                "currency": "INR",
                "includes": {},
            },
        )
        today = date.today()
        await self.call(
            "PUT",
            f"/hospital-portal/doctors/{doctor['id']}/availability",
            account=owner,
            json=[
                {"date": (today + timedelta(days=d)).isoformat(), "slot_kind": kind, "capacity": 5}
                for d in range(1, 61)
                for kind in ("consultation", "admission")
            ],
        )
        self.ctx["hospital_owner"] = owner
        self.ctx["hospital"] = {"id": hospital_id, "slug": profile.get("slug")}
        return f"fresh hospital {profile.get('slug')} onboarded and approved"

    async def screening_submit(self) -> str:
        patient: Account = self.ctx["patient"]
        today = date.today()
        screening = await self.call(
            "POST",
            "/screenings",
            account=patient,
            expect=(200, 201),
            json={"specialty_slug": self.ctx["specialty"]["slug"]},
        )
        await self.call(
            "PATCH",
            f"/screenings/{screening['id']}",
            account=patient,
            json={
                "body_areas": ["right_leg"],
                "pain_intensity": 6,
                "symptoms": [{"name": "Knee pain", "answer": "yes"}, {"name": "Swelling", "answer": "maybe"}],
                "duration_value": 6,
                "duration_unit": "months",
                "severity": {"work": "moderate", "sleep": "mild", "mobility": "moderate"},
                "previous_treatments": ["medication"],
                "notes": "Smoke test screening",
                "preferences": {
                    "languages": ["English"],
                    "doctor_gender": "no_preference",
                    "budget_min_minor": 500_000,
                    "budget_max_minor": 2_500_000,
                    "budget_currency": "USD",
                    "travel_window_start": (today + timedelta(days=7)).isoformat(),
                    "travel_window_end": (today + timedelta(days=90)).isoformat(),
                    "use_ai": False,
                },
                "home_country": "US",
            },
        )
        await self.call(
            "POST",
            "/auth/consents",
            account=patient,
            expect=(200, 201),
            json={"kind": "ai_processing", "version": "2026-10", "granted": True},
        )
        submitted = await self.call(
            "POST", f"/screenings/{screening['id']}/submit", account=patient, json={"consent_ai": False}
        )
        self.ctx["screening_id"] = screening["id"]
        return f"screening {screening['id']} -> {submitted.get('status')}"

    async def screening_result(self) -> str:
        patient: Account = self.ctx["patient"]
        sid = self.ctx["screening_id"]
        result = await self.poll(
            lambda: self.call("GET", f"/screenings/{sid}", account=patient),
            lambda s: s.get("status") in ("completed", "failed"),
            "the screening to complete",
        )
        ensure(result.get("status") == "completed", f"screening failed: {result.get('error')}")
        matches = items_of(await self.call("GET", f"/screenings/{sid}/matches", account=patient))
        ensure(matches, "no matches returned")
        hospital_id = id_of(self.ctx["hospital"])
        mine = [m for m in matches if id_of(m.get("hospital")) == hospital_id]
        self.ctx["match"] = mine[0] if mine else None
        engine = (result.get("ai_result") or {}).get("engine")
        return f"engine={engine}, urgency={result.get('urgency')}, {len(matches)} matches"

    def case_payload(self, notes: str) -> dict[str, Any]:
        """POST /cases body for the chosen hospital (doctor/procedure from the match when available)."""
        match = self.ctx.get("match") or {}
        payload: dict[str, Any] = {
            "hospital_id": id_of(self.ctx["hospital"]),
            "screening_id": self.ctx["screening_id"],
            "patient_notes": notes,
            "consent_share": True,
        }
        if match.get("doctor"):
            payload["doctor_id"] = id_of(match["doctor"])
        if match.get("procedure"):
            payload["procedure_id"] = id_of(match["procedure"])
        return payload

    async def create_case(self) -> str:
        patient: Account = self.ctx["patient"]
        payload = self.case_payload("Smoke test enquiry")
        case = await self.call("POST", "/cases", account=patient, json=payload, expect=(200, 201))
        ensure(case.get("status") == "enquiry", f"case status {case.get('status')}")
        self.ctx["case"] = case
        return f"{case.get('case_number')} ({case.get('status')})"

    async def send_quote(self) -> str:
        owner: Account = self.ctx["hospital_owner"]
        case_id = self.ctx["case"]["id"]
        quote = await self.call(
            "POST",
            f"/cases/{case_id}/quotes",
            account=owner,
            expect=(200, 201),
            json={
                "treatment_plan": "Smoke test treatment plan",
                "line_items": QUOTE_LINES,
                "currency": "INR",
                "estimated_stay_days": 10,
                "valid_until": (date.today() + timedelta(days=30)).isoformat(),
            },
        )
        ensure(quote.get("status") == "sent", f"quote status {quote.get('status')}")
        self.ctx["quote"] = quote
        return f"quote {quote.get('total_minor')} {quote.get('currency')}"

    async def accept_and_book(self) -> str:
        patient: Account = self.ctx["patient"]
        case_id, quote_id = self.ctx["case"]["id"], self.ctx["quote"]["id"]
        await self.call("POST", f"/cases/{case_id}/quotes/{quote_id}/accept", account=patient, json={})
        admission = await self.admission_date()
        booking = await self.call(
            "POST",
            "/bookings",
            account=patient,
            expect=(200, 201),
            json={
                "case_id": case_id,
                "quote_id": quote_id,
                "admission_date": admission,
                "payment_option": "deposit",
            },
        )
        ensure(booking.get("status") == "pending_payment", f"booking status {booking.get('status')}")
        self.ctx["booking"] = booking
        deposit = f"{booking.get('deposit_minor')} {booking.get('currency')}"
        return f"{booking.get('booking_number')} deposit {deposit}"

    async def admission_date(self) -> str:
        today = date.today()
        doctor_id = id_of((self.ctx.get("match") or {}).get("doctor"))
        if doctor_id:
            slots = await self.call(
                "GET",
                f"/doctors/{doctor_id}/availability",
                params={
                    "from": (today + timedelta(days=15)).isoformat(),
                    "to": (today + timedelta(days=75)).isoformat(),
                },
            )
            for slot in items_of(slots):
                if slot.get("slot_kind") == "admission" and (slot.get("available") or 0) > 0:
                    return str(slot["date"])
        return (today + timedelta(days=30)).isoformat()

    async def checkout(self) -> str:
        patient: Account = self.ctx["patient"]
        key = f"smoke-{uuid.uuid4()}"
        body = {
            "booking_id": self.ctx["booking"]["id"],
            "purpose": "booking_deposit",
            "gateway": "mock",
            "currency": "USD",
        }
        first = await self.call(
            "POST",
            "/payments/orders",
            account=patient,
            json=body,
            expect=(200, 201),
            headers={"Idempotency-Key": key},
        )
        replay = await self.call(
            "POST",
            "/payments/orders",
            account=patient,
            json=body,
            expect=(200, 201),
            headers={"Idempotency-Key": key},
        )
        ensure(
            id_of(first["order"]) == id_of(replay["order"]), "Idempotency-Key replay created a second order"
        )
        self.ctx["order"] = first["order"]
        order = first["order"]
        return f"{order.get('order_number')} {order.get('amount_minor')} {order.get('currency')}"

    async def pay(self) -> str:
        patient: Account = self.ctx["patient"]
        order_id, booking_id = self.ctx["order"]["id"], self.ctx["booking"]["id"]
        await self.call(
            "POST",
            f"/payments/mock/{order_id}/complete",
            account=patient,
            json={"outcome": "success"},
            expect=(200, 201, 202),
        )
        booking = await self.poll(
            lambda: self.call("GET", f"/bookings/{booking_id}", account=patient),
            lambda b: b.get("status") == "confirmed",
            "the booking to be confirmed",
        )
        order = await self.call("GET", f"/payments/orders/{order_id}", account=patient)
        ensure(order.get("status") == "paid", f"order status {order.get('status')}")
        self.ctx["booking"] = booking
        return f"paid {booking.get('amount_paid_minor')} {booking.get('currency')}"

    async def checklist(self) -> str:
        patient: Account = self.ctx["patient"]
        items = items_of(
            await self.call("GET", f"/bookings/{self.ctx['booking']['id']}/checklist", account=patient)
        )
        ensure(
            any(i.get("key") == "treatment_booked" and i.get("status") == "done" for i in items),
            f"treatment_booked not done: {items}",
        )
        return f"{len(items)} items"

    async def escrow(self) -> str:
        summary = await self.call("GET", "/finance/summary", account=self.staff["finance1"])
        base = int(self.ctx["order"].get("base_amount_minor") or 0)
        ensure(
            int(summary.get("escrow_minor") or 0) >= base,
            f"escrow_minor {summary.get('escrow_minor')} < captured base amount {base}",
        )
        return f"escrow {summary.get('escrow_minor')} {summary.get('currency')}"

    async def admit(self) -> str:
        owner: Account = self.ctx["hospital_owner"]
        booking_id = self.ctx["booking"]["id"]
        admitted = await self.call(
            "POST", f"/bookings/{booking_id}/admit", account=owner, json={"note": "smoke admission"}
        )
        ensure(admitted.get("status") == "admitted", f"after admit: {admitted.get('status')}")
        return "admitted"

    async def discharge(self) -> str:
        admission = date.fromisoformat(str(self.ctx["booking"]["admission_date"]))
        if admission > today_ist():
            raise StepSkipped(
                f"admission date {admission} is in the future and a discharge cannot precede it "
                "(tests/e2e covers discharge and settlement with time travel)"
            )
        owner: Account = self.ctx["hospital_owner"]
        booking_id = self.ctx["booking"]["id"]
        completed = await self.call(
            "POST", f"/bookings/{booking_id}/complete", account=owner, json={"note": "smoke discharge"}
        )
        ensure(completed.get("status") == "completed", f"after complete: {completed.get('status')}")
        self.ctx["completed"] = True
        return "completed"

    async def cancellation_refund(self) -> str:
        """A second paid booking, cancelled >= 14 days before admission, is refunded automatically."""
        patient: Account = self.ctx["patient"]
        owner: Account = self.ctx["hospital_owner"]
        case = await self.call(
            "POST",
            "/cases",
            account=patient,
            json=self.case_payload("Smoke test cancellation"),
            expect=(200, 201),
        )
        quote = await self.call(
            "POST",
            f"/cases/{case['id']}/quotes",
            account=owner,
            expect=(200, 201),
            json={
                "treatment_plan": "Smoke test plan (to be cancelled)",
                "line_items": QUOTE_LINES,
                "currency": "INR",
                "estimated_stay_days": 10,
                "valid_until": (date.today() + timedelta(days=30)).isoformat(),
            },
        )
        await self.call("POST", f"/cases/{case['id']}/quotes/{quote['id']}/accept", account=patient, json={})
        booking = await self.call(
            "POST",
            "/bookings",
            account=patient,
            expect=(200, 201),
            json={
                "case_id": case["id"],
                "quote_id": quote["id"],
                "admission_date": await self.admission_date(),
                "payment_option": "deposit",
            },
        )
        checkout = await self.call(
            "POST",
            "/payments/orders",
            account=patient,
            expect=(200, 201),
            headers={"Idempotency-Key": f"smoke-cancel-{uuid.uuid4()}"},
            json={
                "booking_id": booking["id"],
                "purpose": "booking_deposit",
                "gateway": "mock",
                "currency": "USD",
            },
        )
        order_id = checkout["order"]["id"]
        await self.call(
            "POST",
            f"/payments/mock/{order_id}/complete",
            account=patient,
            json={"outcome": "success"},
            expect=(200, 201, 202),
        )
        await self.poll(
            lambda: self.call("GET", f"/bookings/{booking['id']}", account=patient),
            lambda b: b.get("status") == "confirmed",
            "the second booking to be confirmed",
        )
        cancelled = await self.call(
            "POST",
            f"/bookings/{booking['id']}/cancel",
            account=patient,
            json={"reason": "Smoke test cancellation"},
        )
        ensure(
            cancelled.get("status") == "cancelled" and cancelled.get("refund_pct") == 100,
            f"cancellation >= 14 days ahead must be 100% refundable: {str(cancelled)[:300]}",
        )
        order = await self.poll(
            lambda: self.call("GET", f"/payments/orders/{order_id}", account=patient),
            lambda o: o.get("status") == "refunded",
            "the automatic refund",
        )
        final = await self.call("GET", f"/bookings/{booking['id']}", account=patient)
        ensure(
            final.get("amount_refunded_minor") == final.get("amount_paid_minor"),
            f"booking refunded {final.get('amount_refunded_minor')} of {final.get('amount_paid_minor')}",
        )
        return f"{booking.get('booking_number')} refunded {order.get('amount_minor')} {order.get('currency')}"

    async def settlement_items(self) -> str:
        if not self.ctx.get("completed"):
            raise StepSkipped("the booking was not discharged in this run")
        finance = self.staff["finance1"]
        booking_id = self.ctx["booking"]["id"]

        async def fetch() -> list[Any]:
            return items_of(
                await self.call(
                    "GET",
                    "/finance/settlements/items",
                    account=finance,
                    params={"status": "pending", "page_size": 100},
                )
            )

        items = await self.poll(
            fetch,
            lambda rows: any(str(i.get("booking_id")) == str(booking_id) for i in rows),
            "settlement items for the booking",
        )
        mine = [i for i in items if str(i.get("booking_id")) == str(booking_id)]
        return ", ".join(f"{i.get('payee_type')} net {i.get('net_minor')}" for i in mine)

    async def trial_balance(self) -> str:
        tb = await self.call("GET", "/finance/ledger/trial-balance", account=self.staff["finance1"])
        net = None
        if isinstance(tb, dict):
            for key in ("net_minor", "difference_minor", "imbalance_minor"):
                if isinstance(tb.get(key), int):
                    net = tb[key]
            totals: dict[str, Any] = tb["totals"] if isinstance(tb.get("totals"), dict) else tb
            if net is None and isinstance(totals.get("total_debit_minor"), int):
                net = totals["total_debit_minor"] - totals.get("total_credit_minor", 0)
            if net is None and isinstance(tb.get("balanced"), bool):
                net = 0 if tb["balanced"] else None
        ensure(net == 0, f"trial balance does not net to zero: {str(tb)[:300]}")
        return "balanced"

    async def idor(self) -> str:
        uid = uuid.uuid4().hex[:8]
        other = await self.register(
            "other patient",
            {
                "email": f"smoke.other.{uid}@{DEMO_DOMAIN}",
                "password": FRESH_PASSWORD,
                "full_name": "Other Patient",
                "role": "patient",
                "country_code": "GB",
                "accept_terms": True,
            },
        )
        for path in (
            f"/cases/{self.ctx['case']['id']}",
            f"/bookings/{self.ctx['booking']['id']}",
            f"/payments/orders/{self.ctx['order']['id']}",
            f"/screenings/{self.ctx['screening_id']}",
        ):
            await self.call("GET", path, account=other, expect=404)
        return "4 resources hidden"

    async def rbac_batches(self) -> str:
        support = self.staff.get("support")
        if support is None:
            raise StepSkipped("support demo account not available")
        await self.call(
            "POST",
            f"/finance/settlements/batches/{uuid.uuid4()}/approve",
            account=support,
            json={},
            expect=403,
        )
        return "403"

    async def notifications(self) -> str:
        patient: Account = self.ctx["patient"]
        notifications = items_of(await self.call("GET", "/notifications", account=patient))
        ensure(notifications, "no notifications for the patient")
        conversations = items_of(await self.call("GET", "/conversations", account=patient))
        ensure(
            any(str(c.get("case_id")) == str(self.ctx["case"]["id"]) for c in conversations),
            "no case conversation for the new case",
        )
        return f"{len(notifications)} notifications"

    async def settle(self) -> str:
        if not self.args.settle:
            raise StepSkipped(
                "pass --settle to generate/approve/process a batch from currently eligible items"
            )
        maker, checker = self.staff["finance1"], self.staff["finance2"]
        eligible = items_of(
            await self.call(
                "GET",
                "/finance/settlements/items",
                account=maker,
                params={"status": "eligible", "page_size": 100},
            )
        )
        if not eligible:
            raise StepSkipped("no eligible settlement items right now (hold period not over)")
        item = eligible[0]
        batch = await self.call(
            "POST",
            "/finance/settlements/batches",
            account=maker,
            expect=(200, 201),
            json={"payee_type": item["payee_type"], "payee_id": item["payee_id"]},
        )
        await self.call(
            "POST", f"/finance/settlements/batches/{batch['id']}/approve", account=maker, json={}, expect=403
        )
        await self.call(
            "POST", f"/finance/settlements/batches/{batch['id']}/approve", account=checker, json={}
        )
        await self.call(
            "POST",
            f"/finance/settlements/batches/{batch['id']}/process",
            account=checker,
            json={},
            expect=(200, 202),
        )
        final = await self.poll(
            lambda: self.call("GET", f"/finance/settlements/batches/{batch['id']}", account=maker),
            lambda b: b.get("status") in ("completed", "partially_failed"),
            "the batch to complete",
        )
        return f"{batch.get('batch_number')} -> {final.get('status')}"

    def summary(self) -> int:
        counts = {
            status: sum(1 for r in self.results if r.status == status) for status in ("PASS", "FAIL", "SKIP")
        }
        total_ms = sum(r.ms for r in self.results)
        print(
            f"\n{counts['PASS']} passed, {counts['FAIL']} failed, {counts['SKIP']} skipped "
            f"in {total_ms / 1000:.1f}s"
        )
        failed = [r for r in self.results if r.status == "FAIL"]
        if failed:
            print("First failure: " + failed[0].name + " - " + failed[0].detail)
        return 1 if failed else 0


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Smoke-test a running Heal India Global API.")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000", help="server root (without /api/v1)")
    parser.add_argument("--password", default=DEMO_PASSWORD, help="password of the seeded demo accounts")
    parser.add_argument("--fresh", action="store_true", help="register fresh patient/agent/hospital users")
    parser.add_argument("--settle", action="store_true", help="also run a maker-checker settlement batch")
    parser.add_argument("--timeout", type=float, default=30.0, help="per-request timeout in seconds")
    parser.add_argument("--poll-seconds", type=float, default=60.0, help="max wait for background jobs")
    parser.add_argument("--no-color", action="store_true", help="disable ANSI colors")
    return parser.parse_args(argv)


async def main(argv: list[str] | None = None) -> int:
    smoke = Smoke(parse_args(argv))
    try:
        return await smoke.run()
    finally:
        await smoke.client.aclose()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
