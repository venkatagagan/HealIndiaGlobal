"""Seed a Heal India Global database with fictional demo data.

Run from ``backend/`` (settings come from ``backend/.env`` / the environment via ``app.core.config``)::

    python -m scripts.seed                    # catalog + demo hospitals, partners, users and patient journeys
    python -m scripts.seed --minimal          # reference catalog + staff accounts only
    python -m scripts.seed --reset            # TRUNCATE every app table first (refused when ENV=production)
    python -m scripts.seed --create-schema    # CREATE EXTENSIONs + metadata.create_all (temporary/dev DBs)
    python -m scripts.seed --skip-journeys    # everything except the API-driven demo journeys
    python -m scripts.seed --no-time-travel   # never move the clock (the discharge then waits for its date)

Safe to re-run: rows are upserted by natural keys (slug, e-mail, unique pairs); accounts, statuses, FX rates,
commission rules and payout accounts are only inserted, never overwritten; journeys resume an existing case
instead of creating a duplicate. Ledger rows are never written here: demo journeys go through the real HTTP
API in-process (cases -> quotes -> bookings -> MOCK payments -> admit/complete), so domain events post the
ledger entries and settlement items exactly as in production. A journey whose module is not ready yet is
skipped with a message.

Bookings need a future admission date and a discharge cannot precede it, so - like ``tests/e2e`` - the single
"discharge" call of the completed journey runs with the clock moved to the admission date (``time-machine``,
a dev dependency). With ``--no-time-travel`` (or without time-machine) that journey stops at ``admitted`` and
is completed by a later re-run on/after its admission date.

Every demo account shares the DEMO-ONLY password ``HealIndia@2026``. The script refuses to run at all when
``ENV=production``.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import re
import sys
import uuid
from collections import Counter, defaultdict
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta, timezone
from datetime import time as dtime
from decimal import Decimal
from typing import TYPE_CHECKING, Any

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import insert as pg_insert

from scripts import seed_data
from scripts.seed_data.availability import AVAILABILITY_DAYS, doctor_slots, hospital_slots
from scripts.seed_data.benchmarks import COST_BENCHMARKS
from scripts.seed_data.catalog import PROCEDURES, SPECIALTIES
from scripts.seed_data.content import CULTURAL_TIPS, FX_RATES, FX_SOURCE
from scripts.seed_data.doctors import DOCTORS
from scripts.seed_data.finance import COMMISSION_RULES, PAYOUT_ACCOUNTS
from scripts.seed_data.hospitals import ACCREDITATION_PENDING, HOSPITALS
from scripts.seed_data.journeys import JOURNEYS, REVIEWS, STAGES
from scripts.seed_data.offerings import (
    build_packages,
    exclusions_for,
    inclusions_for,
    offering_price_range,
    offering_success_rate,
    round_inr,
)
from scripts.seed_data.travel import ACCOMMODATIONS, SERVICE_PROVIDERS
from scripts.seed_data.users import (
    AGENTS,
    CONSENT_KINDS,
    CONSENT_VERSION,
    DEMO_PASSWORD,
    PATIENTS,
    STAFF_USERS,
    hospital_users,
)

if TYPE_CHECKING:
    import httpx
    from fastapi import FastAPI
    from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine

IST = timezone(timedelta(hours=5, minutes=30), "IST")
SEED_USER_AGENT = "heal-india-seed-script"

# Tables whose row counts are reported at the end.
_REPORT_TABLES = (
    "specialties",
    "procedures",
    "cost_benchmarks",
    "cultural_tips",
    "fx_rates",
    "platform_settings",
    "hospitals",
    "hospital_specialties",
    "doctors",
    "hospital_procedures",
    "treatment_packages",
    "availability_slots",
    "accommodation_providers",
    "accommodation_hospital_links",
    "service_providers",
    "users",
    "patient_profiles",
    "agents",
    "hospital_members",
    "consents",
    "payout_accounts",
    "commission_rules",
    "hospital_accreditations",
    "reviews",
    "cases",
    "case_status_history",
    "quotes",
    "bookings",
    "checklist_items",
    "visa_requests",
    "accommodation_bookings",
    "travel_bookings",
    "payment_orders",
    "payments",
    "ledger_transactions",
    "ledger_entries",
    "settlement_items",
    "conversations",
    "messages",
    "notifications",
)

# Routes each journey stage needs (path parameters normalised to ``{}``).
_STAGE_ROUTES: dict[str, list[tuple[str, str]]] = {
    "enquiry": [("POST", "/api/v1/cases")],
    "quoted": [("POST", "/api/v1/cases/{}/quotes")],
    "accepted": [("POST", "/api/v1/cases/{}/quotes/{}/accept")],
    "booked": [
        ("POST", "/api/v1/bookings"),
        ("POST", "/api/v1/payments/orders"),
        ("POST", "/api/v1/payments/mock/{}/complete"),
    ],
    "admitted": [("POST", "/api/v1/bookings/{}/admit")],
    "completed": [("POST", "/api/v1/bookings/{}/complete")],
}
_STAGE_OF_STATUS = {
    "enquiry": "enquiry",
    "quoted": "quoted",
    "accepted": "accepted",
    "booked": "booked",
    "in_treatment": "admitted",
    "completed": "completed",
}


# ================================================================================================ output
def out(message: str = "") -> None:
    print(message, flush=True)


def _configure_stdout() -> None:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            try:
                reconfigure(encoding="utf-8", errors="replace")
            except (ValueError, OSError):  # pragma: no cover - non-reconfigurable stream
                pass


def _describe_database(url: str) -> str:
    """``host:port/database`` - never print credentials."""
    parsed = sa.engine.make_url(url)
    return f"{parsed.host or 'localhost'}:{parsed.port or 5432}/{parsed.database}"


# ======================================================================================== schema drift
_NO_PLACEHOLDER = object()


def _placeholder(column: sa.Column[Any], now: datetime) -> Any:
    """Neutral value for an unknown NOT NULL column (see ``Seeder._fill_required``)."""
    column_type = column.type
    enums = getattr(column_type, "enums", None)
    if enums:
        return enums[0]
    if isinstance(column_type, sa.JSON):
        return {}
    try:
        python_type = column_type.python_type
    except NotImplementedError:
        return _NO_PLACEHOLDER
    if python_type is bool:
        return False
    if python_type is int:
        return 0
    if python_type in (float, Decimal):
        return Decimal("0") if python_type is Decimal else 0.0
    if python_type is str:
        return ""
    if python_type is datetime:
        return now
    if python_type is date:
        return now.date()
    if python_type is dict:
        return {}
    if python_type is list:
        return []
    return _NO_PLACEHOLDER


# ================================================================================================ stats
@dataclass
class Stats:
    inserted: Counter[str] = field(default_factory=Counter)
    updated: Counter[str] = field(default_factory=Counter)
    existing: Counter[str] = field(default_factory=Counter)
    unknown_columns: dict[str, set[str]] = field(default_factory=lambda: defaultdict(set))
    placeholder_columns: set[str] = field(default_factory=set)
    warnings: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    journeys: list[tuple[str, str, str]] = field(default_factory=list)

    def warn(self, message: str) -> None:
        self.warnings.append(message)
        out(f"  ! {message}")


# ================================================================================================ seeder
class Seeder:
    """Idempotent Core-level upserts into the tables registered on ``Base.metadata``."""

    def __init__(self, conn: AsyncConnection, metadata: sa.MetaData, stats: Stats, today: date) -> None:
        self.conn = conn
        self.metadata = metadata
        self.stats = stats
        self.today = today
        self.now = datetime.now(UTC)
        self.ids: dict[str, dict[str, uuid.UUID]] = defaultdict(dict)

    # ---------------------------------------------------------------------------------------- helpers
    def table(self, name: str) -> sa.Table:
        try:
            return self.metadata.tables[name]
        except KeyError:
            raise RuntimeError(f"table {name!r} is not registered on Base.metadata") from None

    def has_table(self, name: str) -> bool:
        return name in self.metadata.tables

    def _clean(self, table: sa.Table, data: dict[str, Any]) -> dict[str, Any]:
        cleaned: dict[str, Any] = {}
        for key, value in data.items():
            if key not in table.c:
                self.stats.unknown_columns[table.name].add(key)
                continue
            column_type = table.c[key].type
            if (
                value is not None
                and isinstance(column_type, sa.Numeric)
                and not isinstance(column_type, sa.Float)
                and not isinstance(value, Decimal)
            ):
                value = Decimal(str(value))
            cleaned[key] = value
        return cleaned

    def _fill_required(self, table: sa.Table, data: dict[str, Any]) -> dict[str, Any]:
        """Give NOT NULL columns the seed does not know about (added to the models later, without any
        default) a neutral placeholder so the insert does not fail; each one is reported as a warning.
        New nullable columns need nothing: they are simply left NULL / server default."""
        for column in table.c:
            if (
                column.name in data
                or column.nullable
                or column.default is not None
                or column.server_default is not None
                or column.primary_key
                or column.foreign_keys
                or column.computed is not None
            ):
                continue
            placeholder = _placeholder(column, self.now)
            if placeholder is _NO_PLACEHOLDER:
                continue  # let the database report it
            data[column.name] = placeholder
            key = f"{table.name}.{column.name}"
            if key not in self.stats.placeholder_columns:
                self.stats.placeholder_columns.add(key)
                self.stats.warn(f"{key} is NOT NULL without a default; seeded placeholder {placeholder!r}")
        return data

    @staticmethod
    def _where(table: sa.Table, match: dict[str, Any]) -> list[Any]:
        return [table.c[k].is_(None) if v is None else table.c[k] == v for k, v in match.items()]

    async def find_row(self, table_name: str, match: dict[str, Any]) -> Any:
        table = self.table(table_name)
        return (await self.conn.execute(sa.select(table).where(*self._where(table, match)).limit(1))).first()

    async def upsert(
        self,
        table_name: str,
        match: dict[str, Any],
        values: dict[str, Any] | None = None,
        *,
        insert_only: dict[str, Any] | None = None,
        update: bool = True,
    ) -> uuid.UUID:
        """Insert or update the row identified by ``match``; returns its id.

        ``values`` are written on insert and (when ``update``) whenever they differ from the stored row;
        ``insert_only`` values are written on insert only."""
        table = self.table(table_name)
        existing = await self.find_row(table_name, match)
        values = self._clean(table, values or {})
        if existing is not None:
            current = existing._mapping
            changes = {k: v for k, v in values.items() if current[k] != v} if update else {}
            if changes:
                await self.conn.execute(sa.update(table).where(table.c.id == existing.id).values(**changes))
                self.stats.updated[table_name] += 1
            else:
                self.stats.existing[table_name] += 1
            return existing.id
        data = self._fill_required(table, self._clean(table, {**match, **values, **(insert_only or {})}))
        new_id = (await self.conn.execute(sa.insert(table).values(**data).returning(table.c.id))).scalar_one()
        self.stats.inserted[table_name] += 1
        return new_id

    async def insert_ignore(self, table_name: str, rows: Sequence[dict[str, Any]]) -> int:
        """Bulk ``INSERT ... ON CONFLICT DO NOTHING``; returns the number of rows sent."""
        if not rows:
            return 0
        table = self.table(table_name)
        cleaned = [self._fill_required(table, self._clean(table, row)) for row in rows]
        stmt = pg_insert(table).on_conflict_do_nothing()
        for start in range(0, len(cleaned), 1000):
            await self.conn.execute(stmt, cleaned[start : start + 1000])
        return len(cleaned)

    def password_hash(self) -> str:
        from app.core.security import hash_password

        return hash_password(DEMO_PASSWORD)

    # --------------------------------------------------------------------------------------- reference
    async def seed_reference(self) -> None:
        out("Reference catalog")
        for order, spec in enumerate(SPECIALTIES, start=1):
            self.ids["specialty"][spec["slug"]] = await self.upsert(
                "specialties", {"slug": spec["slug"]}, {**spec, "sort_order": order, "is_active": True}
            )
        for proc in PROCEDURES:
            values = {k: v for k, v in proc.items() if k != "specialty"}
            values.update(specialty_id=self.ids["specialty"][proc["specialty"]], is_active=True)
            self.ids["procedure"][proc["slug"]] = await self.upsert(
                "procedures", {"slug": proc["slug"]}, values
            )
        for row in COST_BENCHMARKS:
            match = {
                "procedure_id": self.ids["procedure"][row["procedure"]],
                "country_code": row["country_code"],
            }
            values = {k: v for k, v in row.items() if k not in {"procedure", "country_code"}}
            await self.upsert("cost_benchmarks", match, values)
        for order, tip in enumerate(CULTURAL_TIPS, start=1):
            await self.upsert(
                "cultural_tips", {"title": tip["title"]}, {**tip, "sort_order": order, "is_active": True}
            )
        for ccy, rate in FX_RATES.items():
            # FX rates are admin-managed: insert defaults, never overwrite an edited rate.
            await self.upsert(
                "fx_rates",
                {"base_currency": "INR", "quote_currency": ccy},
                {"rate": rate, "source": FX_SOURCE, "as_of": self.now},
                update=False,
            )
        visa_count = await self.seed_visa_rules()
        settings_count = await self.seed_platform_settings()
        out(f"  {visa_count} visa country rules (phase 1; source + date in app/modules/travel/visa_data.py)")
        out(
            f"  {len(SPECIALTIES)} specialties, {len(PROCEDURES)} procedures, {len(COST_BENCHMARKS)} cost "
            f"benchmarks, {len(CULTURAL_TIPS)} cultural tips, {len(FX_RATES)} FX rates, "
            f"{settings_count} platform settings"
        )

    async def seed_visa_rules(self) -> int:
        """Visa rules + checklists per nationality (insert-only: admin edits are never overwritten)."""
        if not self.has_table("visa_country_rules") or not self.has_table("visa_checklist_items"):
            self.stats.warn("visa tables missing - run the migrations; the visa guide uses built-in defaults")
            return 0
        from app.modules.travel import visa_data

        rules = visa_data.default_rules()
        for row in rules:
            values = {k: v for k, v in row.items() if k != "nationality"}
            await self.upsert("visa_country_rules", {"nationality": row["nationality"]}, values, update=False)
        for item in visa_data.default_checklist():
            match = {k: item[k] for k in ("visa_route", "nationality", "item_key")}
            values = {k: v for k, v in item.items() if k not in match}
            await self.upsert("visa_checklist_items", match, values, update=False)
        return len(rules)

    async def seed_platform_settings(self) -> int:
        """Materialise the code defaults (PLAN 6.3) as rows; admin-edited values are never overwritten."""
        if not self.has_table("platform_settings"):
            self.stats.warn("platform_settings table missing - settings fall back to code defaults")
            return 0
        from app.core.settings_store import DEFAULTS

        table = self.table("platform_settings")
        count = sa.select(sa.func.count()).select_from(table)
        before = (await self.conn.execute(count)).scalar_one()
        await self.insert_ignore("platform_settings", [{"key": k, "value": v} for k, v in DEFAULTS.items()])
        added = (await self.conn.execute(count)).scalar_one() - before
        self.stats.inserted["platform_settings"] += added
        self.stats.existing["platform_settings"] += len(DEFAULTS) - added
        return len(DEFAULTS)

    # ------------------------------------------------------------------------------------------- users
    async def ensure_user(
        self,
        *,
        email: str,
        full_name: str,
        role: str,
        phone: str | None = None,
        country_code: str | None = None,
    ) -> uuid.UUID:
        """Create a demo account if missing. Existing accounts are never modified (password, role, status)."""
        users = self.table("users")
        row = (await self.conn.execute(sa.select(users.c.id).where(users.c.email == email))).first()
        if row is not None:
            self.stats.existing["users"] += 1
            self.ids["user"][email] = row[0]
            return row[0]
        user_id = await self.upsert(
            "users",
            {"email": email},
            insert_only={
                "full_name": full_name,
                "role": role,
                "status": "active",
                "phone": phone,
                "country_code": country_code,
                "preferred_language": "en",
                "is_guest": False,
                "email_verified_at": self.now,
                "password_hash": self.password_hash(),
                "mfa_enabled": False,
                "failed_login_count": 0,
            },
            update=False,
        )
        self.ids["user"][email] = user_id
        return user_id

    async def seed_staff(self) -> None:
        out("Staff accounts")
        for staff in STAFF_USERS:
            await self.ensure_user(
                email=staff["email"],
                full_name=staff["full_name"],
                role=staff["role"],
                phone=staff["phone"],
                country_code="IN",
            )
        out(f"  {len(STAFF_USERS)} staff accounts (super_admin, admin, 2x finance, support)")

    async def seed_agents(self) -> None:
        out("Agents")
        approver = self.ids["user"].get(STAFF_USERS[0]["email"])
        for agent in AGENTS:
            user_id = await self.ensure_user(
                email=agent["email"],
                full_name=agent["full_name"],
                role="agent",
                phone=agent["phone"],
                country_code=agent["country_code"],
            )
            active = agent["status"] == "active"
            agent_id = await self.upsert(
                "agents",
                {"user_id": user_id},
                insert_only={
                    "agency_name": agent["agency_name"],
                    "agent_code": agent["agent_code"],
                    "country": agent["country"],
                    "city": agent["city"],
                    "phone": agent["phone"],
                    "website": agent["website"],
                    "status": agent["status"],
                    "kyc_status": agent["kyc_status"],
                    "tier": agent["tier"],
                    "approved_by": approver if active else None,
                    "approved_at": self.now if active else None,
                },
                update=False,
            )
            self.ids["agent"][agent["agent_code"]] = agent_id
            self.ids["agent_by_email"][agent["email"]] = agent_id
        out(f"  {len(AGENTS)} agents (Lagos active, Dubai pending approval)")

    # ---------------------------------------------------------------------------------------- hospitals
    async def seed_hospitals(self) -> None:
        out("Hospitals, doctors and stays")
        approver = self.ids["user"].get(STAFF_USERS[0]["email"])
        non_columns = {"specialties", "offerings", "price_factor", "owner_name"}
        for hospital in HOSPITALS:
            values = {k: v for k, v in hospital.items() if k not in non_columns}
            hospital_id = await self.upsert(
                "hospitals",
                {"slug": hospital["slug"]},
                values,
                insert_only={
                    "status": "active",
                    "kyc_status": "approved",
                    "approved_by": approver,
                    "approved_at": self.now,
                },
            )
            self.ids["hospital"][hospital["slug"]] = hospital_id
            await self.seed_accreditations(hospital, hospital_id, approver)
            await self.insert_ignore(
                "hospital_specialties",
                [
                    {"hospital_id": hospital_id, "specialty_id": self.ids["specialty"][slug]}
                    for slug in hospital["specialties"]
                ],
            )
        for doc in DOCTORS:
            values = {k: v for k, v in doc.items() if k not in {"hospital", "specialty"}}
            values.update(
                hospital_id=self.ids["hospital"][doc["hospital"]],
                specialty_id=self.ids["specialty"][doc["specialty"]],
                is_active=True,
            )
            self.ids["doctor"][doc["slug"]] = await self.upsert("doctors", {"slug": doc["slug"]}, values)
        for acc in ACCOMMODATIONS:
            values = {k: v for k, v in acc.items() if k != "links"}
            provider_id = await self.upsert(
                "accommodation_providers",
                {"name": acc["name"], "city": acc["city"]},
                {**values, "is_active": True},
            )
            self.ids["accommodation"][acc["name"]] = provider_id
            links = self.table("accommodation_hospital_links")
            for hospital_slug, distance in acc["links"]:
                stmt = pg_insert(links).values(
                    **self._fill_required(
                        links,
                        {
                            "provider_id": provider_id,
                            "hospital_id": self.ids["hospital"][hospital_slug],
                            "distance_km": Decimal(str(distance)),
                        },
                    )
                )
                await self.conn.execute(
                    stmt.on_conflict_do_update(
                        index_elements=[links.c.provider_id, links.c.hospital_id],
                        set_={"distance_km": stmt.excluded.distance_km},
                    )
                )
        for provider in SERVICE_PROVIDERS:
            await self.upsert(
                "service_providers",
                {"kind": provider["kind"], "name": provider["name"]},
                {**provider, "is_active": True},
            )
        out(
            f"  {len(HOSPITALS)} hospitals, {len(DOCTORS)} doctors, {len(ACCOMMODATIONS)} accommodation "
            f"providers, {len(SERVICE_PROVIDERS)} service providers"
        )

    async def seed_accreditations(
        self, hospital: dict[str, Any], hospital_id: uuid.UUID, approver: uuid.UUID | None
    ) -> None:
        """Structured certificates for the declared accreditations: verified by the demo admin, valid for two
        more years. One certificate (``ACCREDITATION_PENDING``) is left unverified for the admin queue."""
        if not self.has_table("hospital_accreditations"):
            return
        for index, body in enumerate(hospital.get("accreditations") or []):
            pending = (hospital["slug"], body) == ACCREDITATION_PENDING
            serial = index + 1
            await self.upsert(
                "hospital_accreditations",
                {"hospital_id": hospital_id, "body": body},
                insert_only={
                    "certificate_number": f"{body.upper()}-DEMO-{hospital['slug'][:12].upper()}-{serial:02d}",
                    "valid_until": self.today.replace(year=self.today.year + 2),
                    "verified_at": None if pending else self.now,
                    "verified_by_admin_id": None if pending else approver,
                },
                update=False,
            )

    def _stay_choice(self, hospital_slug: str) -> tuple[int, str]:
        """Nightly rate + type used for packages: the cheapest hotel/serviced apartment near the hospital."""
        nearby = [acc for acc in ACCOMMODATIONS if any(slug == hospital_slug for slug, _d in acc["links"])]
        preferred = [acc for acc in nearby if acc["type"] in {"hotel", "service_apartment"}] or nearby
        choice = min(preferred, key=lambda acc: acc["nightly_rate_minor"])
        return choice["nightly_rate_minor"], choice["type"]

    async def seed_offerings(self) -> None:
        out("Procedure offerings and packages")
        procedures = {p["slug"]: p for p in PROCEDURES}
        offerings = packages = 0
        for hospital in HOSPITALS:
            hospital_id = self.ids["hospital"][hospital["slug"]]
            nightly, stay_type = self._stay_choice(hospital["slug"])
            for proc_slug in hospital["offerings"]:
                proc = procedures[proc_slug]
                low, high = offering_price_range(hospital, proc)
                lead_doctors = [
                    self.ids["doctor"][d["slug"]]
                    for d in DOCTORS
                    if d["hospital"] == hospital["slug"] and d["specialty"] == proc["specialty"]
                ]
                hp_id = await self.upsert(
                    "hospital_procedures",
                    {"hospital_id": hospital_id, "procedure_id": self.ids["procedure"][proc_slug]},
                    {
                        "doctor_ids": lead_doctors,
                        "price_min_minor": low,
                        "price_max_minor": high,
                        "currency": "INR",
                        "hospital_stay_days": proc["hospital_stay_days"],
                        "success_rate_pct": offering_success_rate(hospital["slug"], proc),
                        "inclusions": inclusions_for(proc),
                        "exclusions": exclusions_for(proc),
                        "is_active": True,
                    },
                )
                self.ids["hospital_procedure"][f"{hospital['slug']}:{proc_slug}"] = hp_id
                offerings += 1
                for package in build_packages(
                    price_min_minor=low,
                    price_max_minor=high,
                    procedure=proc,
                    nightly_rate_minor=nightly,
                    stay_type=stay_type,
                ):
                    await self.upsert(
                        "treatment_packages",
                        {"hospital_procedure_id": hp_id, "tier": package["tier"]},
                        {**package, "is_active": True},
                    )
                    packages += 1
        out(f"  {offerings} hospital procedure offerings, {packages} treatment packages")

    async def seed_availability(self) -> None:
        table = self.table("availability_slots")
        end = self.today + timedelta(days=AVAILABILITY_DAYS)
        doctors_by_hospital: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for doc in DOCTORS:
            doctors_by_hospital[doc["hospital"]].append(doc)
        sent = 0
        for hospital in HOSPITALS:
            hospital_id = self.ids["hospital"][hospital["slug"]]
            existing = {
                (row.doctor_id, row.date, str(getattr(row.slot_kind, "value", row.slot_kind)))
                for row in (
                    await self.conn.execute(
                        sa.select(table.c.doctor_id, table.c.date, table.c.slot_kind).where(
                            table.c.hospital_id == hospital_id, table.c.date >= self.today, table.c.date < end
                        )
                    )
                ).all()
            }
            rows: list[dict[str, Any]] = []
            plan: list[tuple[uuid.UUID | None, list[dict[str, Any]]]] = [
                (None, hospital_slots(self.today, AVAILABILITY_DAYS))
            ]
            for doc in doctors_by_hospital[hospital["slug"]]:
                plan.append((self.ids["doctor"][doc["slug"]], doctor_slots(doc["slug"], self.today)))
            for doctor_id, slots in plan:
                for slot in slots:
                    if (doctor_id, slot["date"], slot["slot_kind"]) in existing:
                        continue
                    rows.append({"hospital_id": hospital_id, "doctor_id": doctor_id, "booked": 0, **slot})
            sent += await self.insert_ignore("availability_slots", rows)
        self.stats.inserted["availability_slots"] += sent
        out(f"  availability: {sent} new slot rows for {self.today.isoformat()} + {AVAILABILITY_DAYS} days")

    async def seed_hospital_users(self) -> None:
        out("Hospital team accounts")
        users = hospital_users()
        for member in users:
            user_id = await self.ensure_user(
                email=member["email"],
                full_name=member["full_name"],
                role="hospital",
                phone=member["phone"],
                country_code="IN",
            )
            await self.upsert(
                "hospital_members",
                {"hospital_id": self.ids["hospital"][member["hospital"]], "user_id": user_id},
                insert_only={"member_role": member["member_role"]},
                update=False,
            )
        out(
            f"  {len(users)} hospital accounts (an owner per hospital; coordinator + finance for the first 3)"
        )

    async def seed_patients(self) -> None:
        out("Patients")
        consent_version = _consent_version()
        consents = self.table("consents")
        for patient in PATIENTS:
            user_id = await self.ensure_user(
                email=patient["email"],
                full_name=patient["full_name"],
                role="patient",
                phone=patient["phone"],
                country_code=patient["country_code"],
            )
            profile = dict(patient["profile"])
            passport = profile.get("passport_number")
            profile["passport_last4"] = passport[-4:] if passport else None
            agent_code = patient.get("referred_by")
            if agent_code:
                profile["referred_by_agent_id"] = self.ids["agent"][agent_code]
            profile_id = await self.upsert(
                "patient_profiles", {"user_id": user_id}, insert_only=profile, update=False
            )
            self.ids["patient"][patient["email"]] = profile_id
            for kind in CONSENT_KINDS:
                found = (
                    await self.conn.execute(
                        sa.select(consents.c.id).where(consents.c.user_id == user_id, consents.c.kind == kind)
                    )
                ).first()
                if found is None:
                    await self.conn.execute(
                        sa.insert(consents).values(
                            **self._fill_required(
                                consents,
                                {
                                    "user_id": user_id,
                                    "kind": kind,
                                    "version": consent_version,
                                    "granted": True,
                                    "user_agent": SEED_USER_AGENT,
                                },
                            )
                        )
                    )
                    self.stats.inserted["consents"] += 1
        out(f"  {len(PATIENTS)} patients with full profiles and consents (terms, privacy, AI, sharing)")

    async def seed_finance(self) -> None:
        out("Finance set-up")
        creator = self.ids["user"].get(STAFF_USERS[0]["email"])
        for rule in COMMISSION_RULES:
            scope, target = rule["scope"], rule["target"]
            match: dict[str, Any] = {
                "scope": scope,
                "hospital_id": self.ids["hospital"][target] if scope == "hospital" else None,
                "specialty_id": self.ids["specialty"][target] if scope == "specialty" else None,
                "procedure_id": self.ids["procedure"][target] if scope == "procedure" else None,
                "agent_id": self.ids["agent"][target] if scope == "agent" else None,
            }
            await self.upsert(
                "commission_rules",
                match,
                insert_only={
                    "rate_bps": rule["rate_bps"],
                    "effective_from": rule["effective_from"],
                    "is_active": True,
                    "created_by": creator,
                },
                update=False,
            )
        for account in PAYOUT_ACCOUNTS:
            owner_kind = "hospital" if account["owner_type"] == "hospital" else "agent"
            owner_id = self.ids[owner_kind][account["owner"]]
            values = {k: v for k, v in account.items() if k not in {"owner_type", "owner"}}
            await self.upsert(
                "payout_accounts",
                {"owner_type": account["owner_type"], "owner_id": owner_id, "is_primary": True},
                insert_only=values,
                update=False,
            )
        out(f"  {len(COMMISSION_RULES)} commission rules, {len(PAYOUT_ACCOUNTS)} payout accounts")

    async def seed_reviews(self, journey_cases: dict[str, uuid.UUID]) -> None:
        if not self.has_table("reviews"):
            return
        count = verified = 0
        for review in REVIEWS:
            patient_id = self.ids["patient"].get(review["patient"])
            if patient_id is None:
                continue
            case_id = journey_cases.get(review["journey"]) if review["journey"] else None
            link: dict[str, Any] = {}
            if case_id:
                link["case_id"] = case_id
                booking = await self.completed_booking(case_id)
                if booking is not None:
                    # a completed booking makes it a verified-patient review
                    link.update(booking_id=booking.id, procedure_id=booking.procedure_id)
                    verified += 1
            await self.upsert(
                "reviews",
                {"patient_id": patient_id, "hospital_id": self.ids["hospital"][review["hospital"]]},
                # link the review to its journey case/booking once they exist (e.g. on a later run)
                link or None,
                insert_only={
                    "doctor_id": self.ids["doctor"].get(review["doctor"]) if review["doctor"] else None,
                    "rating": review["rating"],
                    "title": review["title"],
                    "body": review["body"],
                    "status": review["status"],
                    "published_at": self.now if review["status"] == "published" else None,
                },
            )
            count += 1
        out(
            f"Reviews\n  {count} patient reviews (published + 1 pending moderation), "
            f"{verified} linked to a completed booking"
        )

    async def completed_booking(self, case_id: uuid.UUID) -> Any:
        if not self.has_table("bookings"):
            return None
        bookings = self.table("bookings")
        return (
            await self.conn.execute(
                sa.select(bookings.c.id, bookings.c.procedure_id)
                .where(bookings.c.case_id == case_id, bookings.c.status == "completed")
                .limit(1)
            )
        ).first()


def _consent_version() -> str:
    """Use the auth module's current terms version when it exists (falls back to the seed default)."""
    try:
        from app.modules.auth.service import TERMS_VERSION
    except Exception:  # noqa: BLE001 - optional module, any import problem means "use the default"
        return CONSENT_VERSION
    return str(TERMS_VERSION)


# ================================================================================================ journeys
class ApiError(Exception):
    def __init__(self, method: str, path: str, status: int, payload: Any) -> None:
        error = payload.get("error") if isinstance(payload, dict) else None
        self.status = status
        self.code = (error or {}).get("code") if isinstance(error, dict) else None
        message = (error or {}).get("message") if isinstance(error, dict) else None
        self.message = message or (str(payload)[:300] if payload is not None else "")
        super().__init__(f"{method} {path} -> HTTP {status} {self.code or ''}: {self.message}".strip())


@dataclass(frozen=True)
class Actor:
    user_id: uuid.UUID
    role: str
    email: str
    hospital_id: uuid.UUID | None = None


def _jsonable(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _jsonable(v) for k, v in value.items()}
    if isinstance(value, list | tuple):
        return [_jsonable(v) for v in value]
    if isinstance(value, uuid.UUID | date | datetime | Decimal):
        return value.isoformat() if isinstance(value, date | datetime) else str(value)
    return value


def _status(value: Any) -> str:
    return str(getattr(value, "value", value)) if value is not None else ""


class JourneyRunner:
    """Drives demo journeys through the HTTP API in-process (``httpx.ASGITransport``)."""

    def __init__(
        self,
        *,
        engine: AsyncEngine,
        app: FastAPI,
        client: httpx.AsyncClient,
        seeder: Seeder,
        stats: Stats,
        today: date,
        time_travel: bool = True,
    ) -> None:
        self.engine = engine
        self.app = app
        self.time_travel = time_travel
        self.client = client
        self.ids = seeder.ids
        self.metadata = seeder.metadata
        self.stats = stats
        self.today = today
        self.routes = self._route_set(app)
        self.cases: dict[str, uuid.UUID] = {}
        member_hospital = {m["email"]: m["hospital"] for m in hospital_users()}
        self.hospital_of_user = {email: self.ids["hospital"][slug] for email, slug in member_hospital.items()}

    # --------------------------------------------------------------------------------------- plumbing
    @staticmethod
    def _route_set(app: FastAPI) -> set[tuple[str, str]]:
        routes: set[tuple[str, str]] = set()

        def add(path: str | None, methods: Iterable[str] | None) -> None:
            if path:
                normalised = re.sub(r"\{[^}]+\}", "{}", path)
                routes.update((method, normalised) for method in methods or ())

        for route in app.routes:
            contexts = getattr(route, "effective_route_contexts", None)
            if callable(contexts):  # newer FastAPI resolves included routers lazily
                for context in contexts():
                    add(getattr(context, "path", None), getattr(context, "methods", None))
            else:
                add(getattr(route, "path", None), getattr(route, "methods", None))
        return routes

    def missing_routes(self, target: str) -> list[str]:
        needed: list[tuple[str, str]] = []
        for stage in STAGES[: STAGES.index(target) + 1]:
            needed.extend(_STAGE_ROUTES[stage])
        return [f"{m} {p}" for m, p in needed if (m, p) not in self.routes]

    def has_route(self, method: str, path: str) -> bool:
        return (method, path) in self.routes

    def actor(self, email: str) -> Actor:
        role = {
            **{s["email"]: s["role"] for s in STAFF_USERS},
            **{a["email"]: "agent" for a in AGENTS},
            **{p["email"]: "patient" for p in PATIENTS},
            **{m["email"]: "hospital" for m in hospital_users()},
        }[email]
        return Actor(self.ids["user"][email], role, email, self.hospital_of_user.get(email))

    async def call(
        self,
        actor: Actor,
        method: str,
        path: str,
        body: Any = None,
        *,
        headers: dict[str, str] | None = None,
    ) -> Any:
        from app.core.security import create_access_token

        request_headers = {"Authorization": f"Bearer {create_access_token(actor.user_id, actor.role)}"}
        if actor.hospital_id is not None:
            request_headers["X-Hospital-Id"] = str(actor.hospital_id)
        request_headers.update(headers or {})
        response = await self.client.request(
            method,
            f"/api/v1{path}",
            json=_jsonable(body) if body is not None else None,
            headers=request_headers,
        )
        payload: Any = None
        if response.content:
            try:
                payload = response.json()
            except ValueError:
                payload = response.text
        if response.status_code >= 400:
            raise ApiError(method, path, response.status_code, payload)
        return payload

    async def drain_jobs(self) -> int:
        try:
            from app.core.jobs import run_pending_jobs
        except Exception:  # noqa: BLE001
            return 0
        return await run_pending_jobs(max_jobs=500)

    async def fetch(self, stmt: Any) -> Any:
        async with self.engine.connect() as conn:
            return (await conn.execute(stmt)).first()

    def t(self, name: str) -> sa.Table:
        return self.metadata.tables[name]

    # --------------------------------------------------------------------------------------- state reads
    async def case_row(self, case_id: uuid.UUID) -> Any:
        cases = self.t("cases")
        return await self.fetch(sa.select(cases).where(cases.c.id == case_id))

    async def find_case(self, patient_id: uuid.UUID, hospital_id: uuid.UUID, procedure_id: uuid.UUID) -> Any:
        cases = self.t("cases")
        return await self.fetch(
            sa.select(cases)
            .where(
                cases.c.patient_id == patient_id,
                cases.c.hospital_id == hospital_id,
                cases.c.procedure_id == procedure_id,
                cases.c.status.notin_(["cancelled", "declined"]),
            )
            .order_by(cases.c.created_at.desc())
            .limit(1)
        )

    async def latest_quote(self, case_id: uuid.UUID, status: str) -> Any:
        quotes = self.t("quotes")
        return await self.fetch(
            sa.select(quotes)
            .where(quotes.c.case_id == case_id, quotes.c.status == status)
            .order_by(quotes.c.created_at.desc())
            .limit(1)
        )

    async def active_booking(self, case_id: uuid.UUID) -> Any:
        bookings = self.t("bookings")
        return await self.fetch(
            sa.select(bookings)
            .where(bookings.c.case_id == case_id, bookings.c.status != "cancelled")
            .order_by(bookings.c.created_at.desc())
            .limit(1)
        )

    async def count(self, table: str, **filters: Any) -> int:
        tbl = self.t(table)
        stmt = sa.select(sa.func.count()).select_from(tbl).where(*[tbl.c[k] == v for k, v in filters.items()])
        row = await self.fetch(stmt)
        return int(row[0]) if row else 0

    # --------------------------------------------------------------------------------------- journey
    def _quote_body(self, journey: dict[str, Any]) -> dict[str, Any]:
        hospital = next(h for h in HOSPITALS if h["slug"] == journey["hospital"])
        procedure = next(p for p in PROCEDURES if p["slug"] == journey["procedure"])
        low, high = offering_price_range(hospital, procedure)
        quote = journey["quote"]
        total = round_inr((low + 0.3 * (high - low)) * float(quote.get("factor", 1.0)))
        lines: list[dict[str, Any]] = []
        allocated = 0
        for index, (category, description, share) in enumerate(quote["lines"]):
            amount = total - allocated if index == len(quote["lines"]) - 1 else total * share // 100
            allocated += amount
            lines.append({"category": category, "description": description, "amount_minor": amount})
        return {
            "treatment_plan": quote["treatment_plan"],
            "line_items": lines,
            "currency": "INR",
            "estimated_stay_days": procedure["total_stay_days"],
            "valid_until": self.today + timedelta(days=30),
        }

    async def run(self, journey: dict[str, Any]) -> None:
        key, target = journey["key"], journey["target"]
        missing = self.missing_routes(target)
        if missing:
            self.stats.journeys.append(
                (key, target, "skipped: module not ready (" + ", ".join(missing) + ")")
            )
            out(f"  - {key}: skipped - endpoints not available yet: {', '.join(missing)}")
            return
        try:
            summary = await self._run(journey)
        except ApiError as exc:
            self.stats.journeys.append((key, target, f"failed: {exc}"))
            self.stats.warn(f"journey {key} stopped: {exc}")
            return
        except Exception as exc:  # noqa: BLE001 - report and continue with the next journey
            self.stats.journeys.append((key, target, f"failed: {type(exc).__name__}: {exc}"))
            self.stats.warn(f"journey {key} stopped: {type(exc).__name__}: {exc}")
            return
        self.stats.journeys.append((key, target, summary))
        out(f"  - {key}: {summary}")

    async def _run(self, journey: dict[str, Any]) -> str:  # noqa: C901 - linear state machine walk
        target_index = STAGES.index(journey["target"])
        patient = self.actor(journey["patient"])
        actor = patient if journey["actor"] == "patient" else self.actor(journey["actor"])
        hospital_actor = self.actor(journey["hospital_user"])
        patient_id = self.ids["patient"][journey["patient"]]
        hospital_id = self.ids["hospital"][journey["hospital"]]
        procedure = next(p for p in PROCEDURES if p["slug"] == journey["procedure"])
        procedure_id = self.ids["procedure"][journey["procedure"]]

        case = await self.find_case(patient_id, hospital_id, procedure_id)
        if case is None:
            body: dict[str, Any] = {
                "hospital_id": hospital_id,
                "doctor_id": self.ids["doctor"][journey["doctor"]],
                "procedure_id": procedure_id,
                "specialty_id": self.ids["specialty"][procedure["specialty"]],
                "patient_notes": journey["patient_notes"],
            }
            if actor.role == "agent":
                body["patient_id"] = patient_id
            created = await self.call(actor, "POST", "/cases", body)
            case_id = uuid.UUID(str(created["id"]))
        else:
            case_id = case.id
        self.cases[journey["key"]] = case_id
        await self._assign_coordinator(journey, case_id)

        async def stage() -> str:
            row = await self.case_row(case_id)
            return _STAGE_OF_STATUS.get(_status(row.status), _status(row.status))

        current = await stage()
        if current not in STAGES:
            return f"case {case_id} is '{current}', left untouched"

        if target_index >= STAGES.index("quoted") and current == "enquiry":
            await self.call(hospital_actor, "POST", f"/cases/{case_id}/quotes", self._quote_body(journey))
            current = await stage()
        await self._post_messages(journey, case_id, patient, hospital_actor)

        if target_index >= STAGES.index("accepted") and current == "quoted":
            quote = await self.latest_quote(case_id, "sent")
            if quote is None:
                raise RuntimeError("no sent quote to accept")
            await self.call(actor, "POST", f"/cases/{case_id}/quotes/{quote.id}/accept", {})
            current = await stage()

        booking = None
        if target_index >= STAGES.index("booked") and current == "accepted":
            await self._book(journey, case_id, actor)
            booking = await self._pay_initial(journey, case_id, actor)
            current = await stage()
            if current != "booked":
                await self.drain_jobs()
                current = await stage()
            if current != "booked":
                raise RuntimeError(f"payment captured but case is '{current}' (expected booked)")

        if target_index >= STAGES.index("booked"):
            booking = booking or await self.active_booking(case_id)
            if booking is not None:
                await self._travel_extras(journey, case_id, booking, actor)

        if target_index >= STAGES.index("admitted") and current == "booked":
            booking = await self.active_booking(case_id)
            if journey["booking"].get("pay_balance"):
                await self._pay_balance(journey, booking, actor)
            await self.call(
                hospital_actor, "POST", f"/bookings/{booking.id}/admit", {"note": "Admitted (demo journey)."}
            )
            current = await stage()

        if target_index >= STAGES.index("completed") and current == "admitted":
            booking = await self.active_booking(case_id)
            await self._pay_balance(journey, booking, actor)
            await self._complete(journey, booking, hospital_actor)
            current = await stage()

        row = await self.case_row(case_id)
        booking = await self.active_booking(case_id)
        detail = f"case {row.case_number}"
        if booking is not None:
            detail += f", booking {booking.booking_number} ({_status(booking.status)})"
        reached = STAGES.index(current) >= target_index if current in STAGES else False
        return f"{'OK' if reached else 'INCOMPLETE'} at '{current}' - {detail}"

    async def _assign_coordinator(self, journey: dict[str, Any], case_id: uuid.UUID) -> None:
        if not journey.get("assign_coordinator") or not self.has_route(
            "POST", "/api/v1/cases/{}/assign-coordinator"
        ):
            return
        row = await self.case_row(case_id)
        if row.coordinator_user_id is not None:
            return
        support = self.ids["user"][next(s["email"] for s in STAFF_USERS if s["role"] == "support")]
        admin = self.actor(next(s["email"] for s in STAFF_USERS if s["role"] == "super_admin"))
        try:
            await self.call(admin, "POST", f"/cases/{case_id}/assign-coordinator", {"user_id": support})
        except ApiError as exc:
            self.stats.warn(f"journey {journey['key']}: coordinator not assigned ({exc})")

    async def _book(self, journey: dict[str, Any], case_id: uuid.UUID, actor: Actor) -> None:
        """Create the booking from the accepted quote, trying a few admission dates if one is refused."""
        if await self.active_booking(case_id) is not None:
            return
        quote = await self.latest_quote(case_id, "accepted")
        spec = journey["booking"]
        base = int(spec.get("admission_in_days", 14))
        last_error: ApiError | None = None
        for offset in dict.fromkeys([base, base + 1, base + 2, base + 3, base + 5, base + 7, base + 14]):
            body = {
                "case_id": case_id,
                "quote_id": quote.id if quote is not None else None,
                "admission_date": self.today + timedelta(days=offset),
                "payment_option": spec["payment_option"],
                "insurance_claim_requested": False,
            }
            try:
                await self.call(actor, "POST", "/bookings", body)
            except ApiError as exc:
                if exc.status in (400, 409, 422):
                    last_error = exc
                    continue
                raise
            return
        raise last_error or RuntimeError("booking could not be created")

    async def _complete(self, journey: dict[str, Any], booking: Any, hospital_actor: Actor) -> None:
        """Discharge the patient. The API only accepts a discharge on/after the admission date (which must be
        in the future when booking), so - like ``tests/e2e`` - the clock is moved to the admission date with
        ``time-machine`` for this single call unless ``--no-time-travel`` was given."""
        path = f"/bookings/{booking.id}/complete"
        body: dict[str, Any] = {"note": "Discharged in stable condition with a physiotherapy plan (demo)."}
        admission = booking.admission_date
        if admission is None or admission <= datetime.now(IST).date():
            await self.call(hospital_actor, "POST", path, body)
            await self.drain_jobs()
            return
        try:
            import time_machine
        except ImportError:
            time_machine = None
        if not self.time_travel or time_machine is None:
            self.stats.warn(
                f"journey {journey['key']}: discharge must wait for the admission date {admission}; "
                "re-run the seed on/after that date to complete it"
            )
            return
        destination = datetime.combine(admission, dtime(0, 5), tzinfo=IST)
        with time_machine.travel(destination, tick=True):
            await self.call(hospital_actor, "POST", path, {**body, "discharge_date": admission})
            await self.drain_jobs()
        self.stats.notes.append(
            f"{journey['key']}: discharge recorded on the admission date {admission} (clock moved forward "
            "with time-machine for that one call, as in tests/e2e)"
        )

    async def _pay(self, journey: dict[str, Any], booking: Any, actor: Actor, purpose: str) -> None:
        currency = journey["booking"].get("pay_currency", "USD")
        checkout = await self.call(
            actor,
            "POST",
            "/payments/orders",
            {"booking_id": booking.id, "purpose": purpose, "gateway": "mock", "currency": currency},
            headers={"Idempotency-Key": f"seed-{journey['key']}-{purpose}-{booking.id}"},
        )
        order = checkout.get("order", checkout) if isinstance(checkout, dict) else {}
        if _status(order.get("status")) != "paid":
            await self.call(actor, "POST", f"/payments/mock/{order['id']}/complete", {"outcome": "success"})
        await self.drain_jobs()

    async def _pay_initial(self, journey: dict[str, Any], case_id: uuid.UUID, actor: Actor) -> Any:
        """Pay the deposit (or the full amount) for a ``pending_payment`` booking; returns the booking row."""
        booking = await self.active_booking(case_id)
        if booking is None:
            raise RuntimeError("booking was not created")
        if _status(booking.status) == "pending_payment":
            purpose = "booking_full" if journey["booking"]["payment_option"] == "full" else "booking_deposit"
            await self._pay(journey, booking, actor, purpose)
            booking = await self.active_booking(case_id)
        return booking

    async def _pay_balance(self, journey: dict[str, Any], booking: Any, actor: Actor) -> None:
        bookings = self.t("bookings")
        row = await self.fetch(sa.select(bookings).where(bookings.c.id == booking.id))
        if row is None or int(row.amount_paid_minor) >= int(row.total_minor):
            return
        await self._pay(journey, row, actor, "booking_balance")

    async def _post_messages(
        self, journey: dict[str, Any], case_id: uuid.UUID, patient: Actor, hospital_actor: Actor
    ) -> None:
        messages = journey.get("messages")
        if not messages or not self.has_route("POST", "/api/v1/conversations/{}/messages"):
            return
        conversations = self.t("conversations")
        conversation = await self.fetch(
            sa.select(conversations.c.id).where(conversations.c.case_id == case_id)
        )
        if conversation is None or await self.count("messages", conversation_id=conversation.id) > 0:
            return
        try:
            for sender, body in messages:
                who = hospital_actor if sender == "hospital" else patient
                await self.call(who, "POST", f"/conversations/{conversation.id}/messages", {"body": body})
        except ApiError as exc:
            self.stats.warn(f"journey {journey['key']}: demo messages not posted ({exc})")

    async def _travel_extras(
        self, journey: dict[str, Any], case_id: uuid.UUID, booking: Any, actor: Actor
    ) -> None:
        travel = journey.get("travel")
        if not travel:
            return
        admission = getattr(booking, "admission_date", None) or self.today
        hospital = next(h for h in HOSPITALS if h["slug"] == journey["hospital"])
        arrive = datetime.combine(admission - timedelta(days=2), datetime.min.time(), tzinfo=IST) + timedelta(
            hours=9
        )
        requests: list[tuple[str, str, dict[str, Any]]] = [
            # visa_type comes from the patient's nationality rule (e_medical, medical or not_required)
            ("visa_requests", "/travel/visa-requests", {"case_id": case_id}),
            (
                "accommodation_bookings",
                "/travel/accommodation-bookings",
                {
                    "case_id": case_id,
                    "provider_id": self.ids["accommodation"][travel["stay_provider"]],
                    "check_in": admission - timedelta(days=2),
                    "check_out": admission + timedelta(days=int(travel["nights"])),
                    "guests": 2,
                    "room_type": "Twin room",
                    "notes": "Ground floor or lift access requested (demo).",
                },
            ),
            (
                "travel_bookings",
                "/travel/travel-bookings",
                {
                    "case_id": case_id,
                    "kind": "airport_pickup",
                    "from_location": f"{travel['pickup_from']} airport, international arrivals",
                    "to_location": hospital["name"],
                    "arrive_at": arrive,
                    "passengers": 2,
                    "notes": "Wheelchair at the aircraft door, please (demo).",
                },
            ),
        ]
        for table, path, body in requests:
            if not self.has_route("POST", f"/api/v1{path}") or await self.count(table, case_id=case_id) > 0:
                continue
            try:
                await self.call(actor, "POST", path, body)
            except ApiError as exc:
                self.stats.warn(f"journey {journey['key']}: {path} not created ({exc})")

        # The support coordinator (travel desk) then moves the requests forward.
        row = await self.case_row(case_id)
        reference = f"DEMO-{str(row.case_number)[-6:]}"
        steps: list[tuple[str, str, list[str], dict[str, dict[str, Any]]]] = [
            (
                "visa_requests",
                "/travel/visa-requests",
                travel.get("visa_steps", []),
                {"applied": {"application_reference": f"EMV-{reference}"}},
            ),
            (
                "accommodation_bookings",
                "/travel/accommodation-bookings",
                travel.get("stay_steps", []),
                {"confirmed": {"confirmation_code": reference}},
            ),
            ("travel_bookings", "/travel/travel-bookings", travel.get("pickup_steps", []), {}),
        ]
        for table, path, wanted, extra in steps:
            await self._advance(journey, table, path, case_id, wanted, extra)

    async def _advance(
        self,
        journey: dict[str, Any],
        table: str,
        path: str,
        case_id: uuid.UUID,
        wanted: list[str],
        extra: dict[str, dict[str, Any]],
    ) -> None:
        """PATCH a travel item through ``wanted`` statuses as the support coordinator (skips done steps)."""
        if not wanted or not self.has_route("PATCH", f"/api/v1{path}/{{}}"):
            return
        tbl = self.t(table)
        row = await self.fetch(
            sa.select(tbl.c.id, tbl.c.status)
            .where(tbl.c.case_id == case_id)
            .order_by(tbl.c.created_at)
            .limit(1)
        )
        if row is None:
            return
        current = _status(row.status)
        remaining = wanted[wanted.index(current) + 1 :] if current in wanted else wanted
        staff = self.actor(next(s["email"] for s in STAFF_USERS if s["role"] == "support"))
        for status in remaining:
            try:
                await self.call(
                    staff, "PATCH", f"{path}/{row.id}", {"status": status, **extra.get(status, {})}
                )
            except ApiError as exc:
                self.stats.warn(f"journey {journey['key']}: {table} not moved to '{status}' ({exc})")
                return


async def run_journeys(
    engine: AsyncEngine, seeder: Seeder, stats: Stats, today: date, *, time_travel: bool = True
) -> dict[str, uuid.UUID]:
    out("Demo journeys (through the HTTP API, in-process)")
    try:
        import httpx

        from app.core.events import load_module_hooks
        from app.main import app as fastapi_app

        load_module_hooks()
    except Exception as exc:  # noqa: BLE001 - an unfinished module must not break catalog seeding
        message = f"journeys skipped - the API app could not be loaded ({type(exc).__name__}: {exc})"
        stats.journeys.extend((j["key"], j["target"], "skipped: app not loadable") for j in JOURNEYS)
        stats.warn(message)
        return {}
    transport = httpx.ASGITransport(app=fastapi_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://localhost", timeout=120) as client:
        runner = JourneyRunner(
            engine=engine,
            app=fastapi_app,
            client=client,
            seeder=seeder,
            stats=stats,
            today=today,
            time_travel=time_travel,
        )
        for journey in JOURNEYS:
            await runner.run(journey)
        await runner.drain_jobs()
    return runner.cases


# ========================================================================================= schema / reset
async def create_schema(engine: AsyncEngine) -> None:
    from app.models import REQUIRED_EXTENSIONS, Base

    async with engine.begin() as conn:
        for extension in REQUIRED_EXTENSIONS:
            await conn.execute(sa.text(f'CREATE EXTENSION IF NOT EXISTS "{extension}"'))
        await conn.run_sync(Base.metadata.create_all)
    out("Schema: extensions + tables created (Base.metadata.create_all)")


async def reset_database(engine: AsyncEngine) -> None:
    from app.models import NUMBER_SEQUENCES, Base

    names = [table.name for table in Base.metadata.sorted_tables]
    async with engine.begin() as conn:
        present = set(
            (
                await conn.execute(
                    sa.text("SELECT tablename FROM pg_tables WHERE schemaname = current_schema()")
                )
            ).scalars()
        )
        targets = [name for name in names if name in present]
        if targets:
            quoted = ", ".join(f'"{name}"' for name in targets)
            await conn.execute(sa.text(f"TRUNCATE {quoted} RESTART IDENTITY CASCADE"))
        for sequence in NUMBER_SEQUENCES.values():
            await conn.execute(sa.text(f'ALTER SEQUENCE IF EXISTS "{sequence.name}" RESTART'))
    out(f"Reset: truncated {len(targets)} tables and restarted number sequences")


# ================================================================================================ report
async def print_report(engine: AsyncEngine, stats: Stats, metadata: sa.MetaData) -> None:
    out("")
    out("Rows written this run (inserted / updated / unchanged)")
    tables = sorted(set(stats.inserted) | set(stats.updated) | set(stats.existing))
    for name in tables:
        out(f"  {name:<30} {stats.inserted[name]:>6} {stats.updated[name]:>8} {stats.existing[name]:>9}")
    out("")
    out("Rows now in the database")
    async with engine.connect() as conn:
        for name in _REPORT_TABLES:
            if name not in metadata.tables:
                continue
            table = metadata.tables[name]
            total = (await conn.execute(sa.select(sa.func.count()).select_from(table))).scalar_one()
            out(f"  {name:<30} {total:>7}")
        if "ledger_entries" in metadata.tables:
            entries = metadata.tables["ledger_entries"]
            sums = dict(
                (
                    await conn.execute(
                        sa.select(
                            entries.c.direction, sa.func.coalesce(sa.func.sum(entries.c.amount_minor), 0)
                        ).group_by(entries.c.direction)
                    )
                ).all()
            )
            debit = int(sums.get("debit", 0) or 0)
            credit = int(sums.get("credit", 0) or 0)
            verdict = "balanced" if debit == credit else "NOT BALANCED"
            out(f"  ledger check: debits {debit} = credits {credit} (INR minor) -> {verdict}")
    if stats.journeys:
        out("")
        out("Journeys")
        for key, target, result in stats.journeys:
            out(f"  {key:<24} -> {target:<10} {result}")
    if stats.unknown_columns:
        out("")
        out("Seed fields without a matching column (ignored):")
        for name, columns in sorted(stats.unknown_columns.items()):
            out(f"  {name}: {', '.join(sorted(columns))}")
    if stats.notes:
        out("")
        out("Notes:")
        for message in stats.notes:
            out(f"  - {message}")
    if stats.warnings:
        out("")
        out(f"Warnings ({len(stats.warnings)}):")
        for message in stats.warnings:
            out(f"  - {message}")


def print_credentials(minimal: bool) -> None:
    rows: list[tuple[str, str, str]] = [(s["role"], s["email"], s["note"]) for s in STAFF_USERS]
    if not minimal:
        rows += [("agent", a["email"], a["note"]) for a in AGENTS]
        rows += [("hospital", m["email"], m["note"]) for m in hospital_users()]
        rows += [("patient", p["email"], p["note"]) for p in PATIENTS]
    out("")
    out(f"DEMO CREDENTIALS - demo-only, never use in production. Password for every account: {DEMO_PASSWORD}")
    out(f"  {'ROLE':<12} {'EMAIL':<52} NOTES")
    for role, email, note in rows:
        out(f"  {role:<12} {email:<52} {note}")


# ================================================================================================ main
def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="python -m scripts.seed",
        description="Seed Heal India Global with fictional demo data (idempotent).",
    )
    parser.add_argument(
        "--reset", action="store_true", help="TRUNCATE all app tables first (not in production)"
    )
    parser.add_argument("--minimal", action="store_true", help="reference catalog + staff accounts only")
    parser.add_argument(
        "--create-schema", action="store_true", help="create extensions + tables (temporary/dev databases)"
    )
    parser.add_argument(
        "--skip-journeys", action="store_true", help="do not run the API-driven demo journeys"
    )
    parser.add_argument(
        "--no-time-travel",
        action="store_true",
        help="never move the clock: the 'completed' journey then waits at admitted until its admission date",
    )
    parser.add_argument("--verbose", action="store_true", help="keep application INFO logs")
    return parser.parse_args(argv)


async def _seed(args: argparse.Namespace) -> int:
    from app.core import db as core_db
    from app.core.config import settings
    from app.core.logging import configure_logging
    from app.models import Base

    configure_logging()
    out(f"Heal India Global seed -> {_describe_database(settings.DATABASE_URL)} (ENV={settings.ENV})")
    if settings.is_production:
        out("Refusing to run: ENV=production (the seed creates demo accounts and may TRUNCATE tables).")
        return 2

    stats = Stats()
    today = datetime.now(IST).date()
    engine = core_db.get_engine()
    try:
        if args.create_schema:
            await create_schema(engine)
        if args.reset:
            await reset_database(engine)
        async with engine.begin() as conn:
            seeder = Seeder(conn, Base.metadata, stats, today)
            await seeder.seed_reference()
            await seeder.seed_staff()
            if not args.minimal:
                await seeder.seed_agents()
                await seeder.seed_hospitals()
                await seeder.seed_offerings()
                await seeder.seed_availability()
                await seeder.seed_hospital_users()
                await seeder.seed_patients()
                await seeder.seed_finance()
        if not args.minimal:
            journey_cases: dict[str, uuid.UUID] = {}
            if args.skip_journeys:
                out("Demo journeys skipped (--skip-journeys)")
            else:
                journey_cases = await run_journeys(
                    engine, seeder, stats, today, time_travel=not args.no_time_travel
                )
            async with engine.begin() as conn:
                seeder.conn = conn
                await seeder.seed_reviews(journey_cases)
        await print_report(engine, stats, Base.metadata)
        print_credentials(args.minimal)
    finally:
        await core_db.dispose_engine()
    return 0


def _prepare_environment(args: argparse.Namespace) -> None:
    """Process-local settings for the seed run (must happen before any ``app`` import)."""
    os.environ.setdefault("RATE_LIMIT_ENABLED", "false")  # in-process API calls are not client traffic
    os.environ.setdefault("RUN_WORKER_IN_API", "false")
    if not args.verbose:
        os.environ.setdefault("LOG_LEVEL", "WARNING")


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    _configure_stdout()
    problems = seed_data.validate_all()
    if problems:
        out("Seed data is inconsistent:")
        for problem in problems:
            out(f"  - {problem}")
        return 2
    _prepare_environment(args)
    return asyncio.run(_seed(args))


if __name__ == "__main__":
    raise SystemExit(main())
