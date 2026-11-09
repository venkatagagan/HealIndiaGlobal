"""Heal India Global - Locust load test: a realistic mixed workload against the FastAPI node.

Default target: http://127.0.0.1:8000/api/v1 (override with --host or HIG_LT_HOST). NEVER run this against
production: a host guard refuses hosts outside HIG_LT_ALLOW_HOSTS or matching HIG_LT_DENY_HOST_REGEX.
Read loadtest/README.md first (environment prerequisites, SLOs, what to watch).

Request mix (share of HTTP requests; the user weights below are tuned for it and the end-of-run summary
prints the measured mix):
    ~60%  anonymous catalog browsing / search      CatalogBrowser
    ~15%  patient AI screening wizard              ScreeningPatient (30% of them as guests)
    ~10%  cases / quotes / bookings / payments     PatientCasesUser, HospitalDeskUser, AgentDeskUser,
                                                   TreatmentJourneyUser (case -> quote -> accept -> book -> pay)
    ~10%  messaging / notifications                MessagingUser (+ optional WebSocket listeners)
    ~5%   admin dashboards                         AdminOpsUser, FinanceDeskUser, SupportDeskUser
    opt.  login / refresh / logout churn           AuthChurnUser (only when HIG_LT_WEIGHT_AUTH_CHURN > 0)

Every request carries User-Agent "hig-loadtest/1.0", an X-Request-ID "lt-<run>-<n>" and (by default) a
synthetic per-user X-Forwarded-For from 198.18.0.0/15 (RFC 2544 benchmarking range) so per-IP rate limits
behave as they would for real, distinct clients. Data written by the test is marked "[loadtest]".
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import itertools
import json
import logging
import math
import os
import random
import re
import struct
import time
import uuid
from collections import Counter
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any, Callable
from urllib.parse import urlencode, urlsplit

import gevent
from gevent.lock import Semaphore
from locust import FastHttpUser, LoadTestShape, SequentialTaskSet, events, tag, task
from locust.exception import RescheduleTask, StopUser
from locust.runners import WorkerRunner
from locust.stats import StatsEntry

log = logging.getLogger("hig.loadtest")


# =========================================================================================================
# Configuration (environment variables - see README "Configuration")
# =========================================================================================================
def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def _env_list(name: str, default: list[str]) -> list[str]:
    raw = _env(name)
    values = [part.strip() for part in raw.split(",") if part.strip()] if raw else []
    return values or list(default)


def _env_float(name: str, default: float) -> float:
    try:
        return float(_env(name) or default)
    except ValueError:
        log.warning("Ignoring invalid %s=%r", name, os.getenv(name))
        return default


def _env_int(name: str, default: int) -> int:
    return int(_env_float(name, default))


def _env_bool(name: str, default: bool = False) -> bool:
    raw = _env(name).lower()
    return default if not raw else raw in {"1", "true", "yes", "on"}


def _env_pairs(name: str) -> dict[str, str]:
    """``a@x=SECRET1,b@x=SECRET2`` -> {"a@x": "SECRET1", ...} (keys lower-cased). Values are never logged."""
    pairs: dict[str, str] = {}
    for part in _env(name).split(","):
        key, sep, value = part.partition("=")
        if sep and key.strip() and value.strip():
            pairs[key.strip().lower()] = value.strip()
    return pairs


DEFAULT_HOST = _env("HIG_LT_HOST", "http://127.0.0.1:8000/api/v1")
EMAIL_DOMAIN = _env("HIG_LT_EMAIL_DOMAIN", "healindia.example")
PASSWORD = _env("HIG_LT_PASSWORD", "HealIndia@2026")  # documented demo-seed password (non-production only)
PATIENT_EMAILS = _env_list("HIG_LT_PATIENTS", [f"patient.us@{EMAIL_DOMAIN}"])
PATIENT_POOL = max(0, _env_int("HIG_LT_PATIENT_POOL", 0))  # >0: lt.patient.NNNN@ accounts, auto-registered
AGENT_EMAILS = _env_list("HIG_LT_AGENTS", [f"agent.lagos@{EMAIL_DOMAIN}"])
ADMIN_EMAILS = _env_list("HIG_LT_ADMINS", [f"admin@{EMAIL_DOMAIN}"])
FINANCE_EMAILS = _env_list("HIG_LT_FINANCE", [f"finance1@{EMAIL_DOMAIN}", f"finance2@{EMAIL_DOMAIN}"])
SUPPORT_EMAILS = _env_list("HIG_LT_SUPPORT", [f"support@{EMAIL_DOMAIN}"])
HOSPITAL_OWNER_EMAILS = _env_list("HIG_LT_HOSPITAL_OWNERS", [])  # default: owner.<slug>@ of discovered hospitals
TOTP_SECRETS = _env_pairs("HIG_LT_TOTP_SECRETS")  # only needed when staff MFA is enforced

THINK_SCALE = max(0.0, _env_float("HIG_LT_THINK_SCALE", 1.0))
GUEST_SHARE = min(1.0, max(0.0, _env_float("HIG_LT_GUEST_SHARE", 0.3)))
USE_AI = _env_bool("HIG_LT_USE_AI")  # keep off: the load-test API must run the rules engine (no Claude calls)
ACCEPT_429 = _env_bool("HIG_LT_ACCEPT_429")
SPOOF_CLIENT_IP = _env_bool("HIG_LT_SPOOF_CLIENT_IP", True)
ENABLE_WS = _env_bool("HIG_LT_WS")
SCREENING_TIMEOUT_S = max(5.0, _env_float("HIG_LT_SCREENING_TIMEOUT", 60.0))
JOURNEY_HOSPITALS = max(1, _env_int("HIG_LT_JOURNEY_HOSPITALS", 3))
JOURNEY_CANCEL_SHARE = _env_float("HIG_LT_JOURNEY_CANCEL_SHARE", 0.2)
JOURNEY_COMPLETE_SHARE = _env_float("HIG_LT_JOURNEY_COMPLETE_SHARE", 0.25)
JOURNEY_AGENT_SHARE = _env_float("HIG_LT_JOURNEY_AGENT_SHARE", 0.2)
CONSENT_VERSION = _env("HIG_LT_CONSENT_VERSION", "1.0")
ALLOW_HOSTS = {h.lower() for h in _env_list("HIG_LT_ALLOW_HOSTS", ["127.0.0.1", "localhost", "::1"])}
DENY_HOST_RE = re.compile(_env("HIG_LT_DENY_HOST_REGEX", r"(^|[.-])(prod|production|live)([.-]|$)"), re.I)

ENFORCE_SLO = _env_bool("HIG_LT_ENFORCE_SLO")
TARGET_RPS = _env_float("HIG_LT_TARGET_RPS", 200.0)
SLO_CATALOG_P95_MS = _env_float("HIG_LT_SLO_CATALOG_P95_MS", 300.0)
SLO_WRITE_P95_MS = _env_float("HIG_LT_SLO_WRITE_P95_MS", 800.0)
SLO_AUTH_READ_P95_MS = _env_float("HIG_LT_SLO_AUTH_READ_P95_MS", 500.0)
SLO_ERROR_RATE = _env_float("HIG_LT_SLO_ERROR_RATE", 0.005)

MARK = "[loadtest]"
USER_AGENT = "hig-loadtest/1.0 (locust)"
MOBILE_HEADERS = {"X-Client-Type": "mobile"}  # refresh token returned in the body (no cookie juggling)
RUN_ID = uuid.uuid4().hex[:8]

# --- static reference data (live catalog data is discovered at start-up) ------------------------------------
SEARCH_TERMS = [
    "knee", "knee replacement", "kne replacment", "hip replacement", "cardiac", "heart bypass", "angioplasty",
    "cardiolgy", "ivf", "fertility", "cancer", "chemotherapy", "breast cancer", "dental implant", "root canal",
    "cataract", "lasik", "spine surgery", "slip disc", "liver transplant", "kidney transplant", "bariatric",
    "rhinoplasty", "hair transplant", "apollo", "delhi", "mumbai", "chennai", "arabic", "pediatric",
]
CITIES = ["New Delhi", "Gurugram", "Mumbai", "Chennai", "Bengaluru", "Hyderabad", "Kolkata", "Pune"]
ACCREDITATIONS = ["jci", "nabh"]
SORTS = ["rating", "price", "name"]
# (country, currency, weight) - where international patients come from
HOME_MARKETS = [
    ("US", "USD", 30), ("GB", "GBP", 10), ("AE", "AED", 10), ("SA", "SAR", 8), ("NG", "NGN", 10),
    ("KE", "KES", 6), ("BD", "BDT", 8), ("AU", "AUD", 5), ("CA", "CAD", 5), ("OM", "OMR", 3),
    ("QA", "QAR", 2), ("KW", "KWD", 3),
]
# currency -> (minor-unit exponent, rough units per USD); only used to make budgets plausible
CURRENCY_INFO = {
    "USD": (2, 1.0), "GBP": (2, 0.79), "EUR": (2, 0.92), "AED": (2, 3.67), "SAR": (2, 3.75),
    "NGN": (2, 1550.0), "KES": (2, 129.0), "BDT": (2, 120.0), "AUD": (2, 1.5), "CAD": (2, 1.37),
    "OMR": (3, 0.385), "QAR": (2, 3.64), "KWD": (3, 0.307), "INR": (2, 84.0),
}
FALLBACK_SPECIALTIES = ["cardiology", "orthopedics", "oncology", "cosmetic-surgery", "dental", "neurology"]
FALLBACK_PROCEDURES = ["knee-replacement", "hip-replacement", "angioplasty", "dental-implants", "ivf"]
FALLBACK_BODY_AREAS = ["head", "chest", "abdomen", "lower_back", "knee", "hip", "shoulder"]
FALLBACK_SYMPTOMS = ["Fatigue", "Headaches", "Dizziness", "Joint pain", "Swelling", "Stiffness", "Numbness"]
FALLBACK_LANGUAGES = ["English", "Hindi", "Arabic"]
RED_FLAG_NOTES = "Sudden crushing chest pain at rest with difficulty breathing since this morning."
BENIGN_NOTES = [
    "Pain gets worse when climbing stairs.",
    "Stiffness in the morning that eases after an hour.",
    "Physiotherapy helped only briefly.",
    "Looking for a second opinion and a cost estimate.",
    "Symptoms started after a sports injury last year.",
]
CHAT_LINES = [
    "Hello, is there any update on my quote?",
    "Can you share the invitation letter for my visa?",
    "What documents should I bring for admission?",
    "Is airport pickup included in the package?",
    "Thank you, that is helpful.",
]
# (category, description, amount in INR paise) - a typical itemised quote, randomised +/-20% per journey
QUOTE_LINES = [
    ("surgery", "Procedure and surgeon fees", 25_000_000),
    ("hospital_stay", "Private room, 5 nights", 6_000_000),
    ("medications", "Medicines and consumables", 1_500_000),
    ("tests_scans", "Pre-operative tests and imaging", 2_000_000),
    ("doctor_fees", "Consultations and follow-up", 3_000_000),
]
CATALOG_PREFIXES = (
    "/specialties", "/procedures", "/hospitals", "/doctors", "/cost-comparison", "/search", "/content/",
    "/accommodations", "/service-providers",
)
MARKER_RE = re.compile(r"lt:[0-9a-f]{12}:\d{13}")


# =========================================================================================================
# Helpers
# =========================================================================================================
def think(min_s: float, max_s: float) -> Callable[[Any], float]:
    """A Locust ``wait_time`` (seconds between tasks) scaled by HIG_LT_THINK_SCALE."""

    def _wait(_instance: Any) -> float:
        return random.uniform(min_s, max_s) * THINK_SCALE

    return _wait


def items_of(data: Any) -> list[dict]:
    """Rows of a ``Page`` ({"items": [...]}) or of a plain JSON list."""
    if isinstance(data, dict):
        data = data.get("items")
    return [row for row in data if isinstance(row, dict)] if isinstance(data, list) else []


def error_code(data: Any) -> str:
    if isinstance(data, dict) and isinstance(data.get("error"), dict):
        return str(data["error"].get("code") or "")
    return ""


def qs(path: str, **params: Any) -> str:
    clean = {key: value for key, value in params.items() if value not in (None, "", [])}
    return f"{path}?{urlencode(clean, doseq=True)}" if clean else path


def today_plus(days: int) -> str:
    return (date.today() + timedelta(days=days)).isoformat()


def market() -> tuple[str, str]:
    country, currency, _weight = random.choices(HOME_MARKETS, weights=[m[2] for m in HOME_MARKETS])[0]
    return country, currency


def budget(currency: str) -> tuple[str, int, int]:
    """(currency, min_minor, max_minor): mostly USD 5K-50K like the design; sometimes the home currency."""
    ccy = currency if currency in CURRENCY_INFO and random.random() < 0.3 else "USD"
    exponent, per_usd = CURRENCY_INFO[ccy]
    scale = per_usd * 10**exponent
    low_usd = random.choice([5_000, 5_000, 8_000, 10_000])
    high_usd = random.choice([15_000, 25_000, 35_000, 50_000])
    return ccy, int(round(low_usd * scale)), int(round(high_usd * scale))


_LOGGED_ONCE: set[str] = set()


def log_once(level: int, key: str, message: str, *args: Any) -> None:
    if key not in _LOGGED_ONCE:
        _LOGGED_ONCE.add(key)
        log.log(level, message, *args)


def totp_now(secret_b32: str, step: int = 30, digits: int = 6) -> str:
    """RFC 6238 TOTP (SHA-1, 30 s) for staff accounts when MFA is enforced on the target."""
    cleaned = secret_b32.replace(" ", "").upper()
    key = base64.b32decode(cleaned + "=" * (-len(cleaned) % 8))
    digest = hmac.new(key, struct.pack(">Q", int(time.time()) // step), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    code = (struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF) % (10**digits)
    return str(code).zfill(digits)


def host_problem(host: str | None) -> str | None:
    """Why ``host`` must not be load tested (None = allowed)."""
    hostname = (urlsplit(host or "").hostname or "").lower()
    if not hostname:
        return f"no usable host in {host!r}"
    if DENY_HOST_RE.search(hostname):
        return f"host {hostname!r} matches HIG_LT_DENY_HOST_REGEX (looks like production)"
    if "*" not in ALLOW_HOSTS and hostname not in ALLOW_HOSTS:
        return f"host {hostname!r} is not listed in HIG_LT_ALLOW_HOSTS ({', '.join(sorted(ALLOW_HOSTS))})"
    return None


def classify(method: str, name: str) -> str | None:
    """SLO class of a stats row: catalog_read | auth_read | write | None (setup/FLOW/WS rows)."""
    if method in ("FLOW", "WS") or name.startswith("setup:"):
        return None
    if method == "GET":
        return "catalog_read" if name.startswith(CATALOG_PREFIXES) else "auth_read"
    if method in ("POST", "PUT", "PATCH", "DELETE"):
        return "write"
    return None


class FlowCheckFailed(Exception):
    """A business-level expectation measured by the load test was not met."""


def flow(user: HigUser, name: str, elapsed_ms: float, problem: str | None = None) -> None:
    """Record a business-level measurement as request_type FLOW (excluded from the HTTP SLO maths)."""
    user.environment.events.request.fire(
        request_type="FLOW", name=name, response_time=max(0.0, elapsed_ms), response_length=0,
        response=None, context={"scenario": user.scenario}, url=None, start_time=time.time(),
        exception=FlowCheckFailed(problem) if problem else None,
    )


def ws_event(user: HigUser, name: str, started: float, exc: BaseException | None = None) -> None:
    user.environment.events.request.fire(
        request_type="WS", name=name, response_time=(time.time() - started) * 1000, response_length=0,
        response=None, context={"scenario": user.scenario}, url=None, start_time=started, exception=exc,
    )


def _json_body(resp: Any) -> Any:
    try:
        text = resp.text
    except Exception:  # undecodable body -> treated as "no JSON"
        return None
    if not text:
        return None
    try:
        return json.loads(text)
    except ValueError:
        return None


# =========================================================================================================
# Sessions: one login per account per process, proactive single-flight refresh
# =========================================================================================================
@dataclass
class Account:
    key: str
    email: str | None = None
    password: str | None = None
    probe: bool = False  # guessed account (owner.<slug>@...): a 401 is not a test failure
    auto_register: bool = False  # pool account: registered through the API on first use
    register_tried: bool = False
    access: str = ""
    refresh: str = ""
    expires_at: float = 0.0
    user: dict = field(default_factory=dict)
    hospital_id: str | None = None
    disabled: str = ""  # reason; a disabled account is never retried (prevents lockouts)
    consents: set = field(default_factory=set)
    lock: Semaphore = field(default_factory=Semaphore)


class TokenStore:
    """Shares sessions between simulated users of one process. Refresh is single-flight per account, so a
    rotated refresh token is never replayed (the API revokes the whole family on reuse)."""

    def __init__(self) -> None:
        self._accounts: dict[str, Account] = {}

    def account(self, email: str, *, probe: bool = False, auto_register: bool = False) -> Account:
        key = email.lower()
        acct = self._accounts.get(key)
        if acct is None:
            acct = Account(key=key, email=email, password=PASSWORD, probe=probe, auto_register=auto_register)
            self._accounts[key] = acct
        return acct

    @staticmethod
    def _fresh(acct: Account) -> bool:
        return bool(acct.access) and time.time() < acct.expires_at - 60

    def token(self, user: HigUser, acct: Account) -> str | None:
        if acct.disabled:
            return None
        if self._fresh(acct):
            return acct.access
        with acct.lock:
            if acct.disabled:
                return None
            if self._fresh(acct):
                return acct.access
            if acct.refresh and user.auth_refresh(acct):
                return acct.access
            ok = user.auth_login(acct) if acct.email else user.auth_guest(acct)
            return acct.access if ok else None

    @staticmethod
    def invalidate(acct: Account, used_token: str | None) -> None:
        if used_token and acct.access == used_token:
            acct.expires_at = 0.0  # the next call refreshes (or logs in again)


TOKENS = TokenStore()


def patient_account(index: int) -> Account:
    """Patient for simulated user ``index``: the pool (HIG_LT_PATIENT_POOL) or the HIG_LT_PATIENTS list."""
    if PATIENT_POOL > 0:
        return TOKENS.account(f"lt.patient.{index % PATIENT_POOL + 1:04d}@{EMAIL_DOMAIN}", auto_register=True)
    return TOKENS.account(PATIENT_EMAILS[index % len(PATIENT_EMAILS)])


# =========================================================================================================
# Catalog reference data, discovered once per process from the public API
# =========================================================================================================
class CatalogData:
    def __init__(self) -> None:
        self.lock = Semaphore()
        self.loaded_at = 0.0
        self.specialties: list[str] = []
        self.procedures: list[dict] = []
        self.hospitals: list[dict] = []
        self.doctors: list[dict] = []
        self.symptoms: list[dict] = []
        self.languages: list[str] = []
        self.cities: list[str] = []
        self.body_areas: list[str] = []
        self.journey_lock = Semaphore()
        self.journey_ready = False
        self.journey: list[tuple[dict, Account]] = []  # (hospital card, owner account) usable for quotes

    def _stale(self) -> bool:
        return not self.hospitals and time.time() - self.loaded_at > 60

    def ensure(self, user: HigUser) -> None:
        if not self._stale():
            return
        with self.lock:
            if self._stale():
                self._load(user)
                self.loaded_at = time.time()

    def _get(self, user: HigUser, path: str, label: str) -> Any:
        _status, data = user.api("GET", path, name=f"setup: {label}", auth=False, scenario="setup")
        return data

    def _load(self, user: HigUser) -> None:
        self.specialties = [s["slug"] for s in items_of(self._get(user, "/specialties", "/specialties")) if s.get("slug")]
        self.procedures = [p for p in items_of(self._get(user, qs("/procedures", page_size=100), "/procedures")) if p.get("slug")]
        self.hospitals = [
            h for h in items_of(self._get(user, qs("/hospitals", page_size=100), "/hospitals")) if h.get("id") and h.get("slug")
        ]
        self.doctors = [d for d in items_of(self._get(user, qs("/doctors", page_size=100), "/doctors")) if d.get("id")]
        self.symptoms = [s for s in items_of(self._get(user, "/content/symptoms", "/content/symptoms")) if s.get("name")]
        languages = {lang for row in self.hospitals + self.doctors for lang in row.get("languages") or [] if isinstance(lang, str)}
        self.languages = sorted(languages) or list(FALLBACK_LANGUAGES)
        self.cities = sorted({h["city"] for h in self.hospitals if isinstance(h.get("city"), str)}) or list(CITIES)
        areas = {area for s in self.symptoms for area in s.get("body_areas") or [] if isinstance(area, str)}
        self.body_areas = sorted(areas) or list(FALLBACK_BODY_AREAS)
        if self.hospitals:
            log.info(
                "Catalog discovered: %d specialties, %d procedures, %d hospitals, %d doctors, %d symptoms",
                len(self.specialties), len(self.procedures), len(self.hospitals), len(self.doctors), len(self.symptoms),
            )
        else:
            log.error("Catalog discovery found no active hospitals - is the target seeded (backend/scripts/seed.py)?")

    # --- random pickers (fall back to plausible slugs so an empty catalog shows up as 404s) ---------------
    def specialty(self) -> str:
        return random.choice(self.specialties or FALLBACK_SPECIALTIES)

    def procedure_slug(self) -> str:
        return random.choice(self.procedures)["slug"] if self.procedures else random.choice(FALLBACK_PROCEDURES)

    def hospital(self) -> dict | None:
        return random.choice(self.hospitals) if self.hospitals else None

    def doctor(self) -> dict | None:
        return random.choice(self.doctors) if self.doctors else None

    def doctors_at(self, hospital_id: Any) -> list[dict]:
        return [d for d in self.doctors if str((d.get("hospital") or {}).get("id")) == str(hospital_id)]

    def symptom_names(self, specialty: str) -> list[str]:
        names = [s["name"] for s in self.symptoms if specialty in (s.get("specialty_slugs") or [])]
        return names or [s["name"] for s in self.symptoms] or list(FALLBACK_SYMPTOMS)

    def journey_hospitals(self, user: HigUser) -> list[tuple[dict, Account]]:
        """Hospitals whose owner can log in (needed to send quotes / admit / discharge). Resolved once."""
        if self.journey_ready:
            return self.journey
        with self.journey_lock:
            if self.journey_ready:
                return self.journey
            if HOSPITAL_OWNER_EMAILS:
                candidates = [TOKENS.account(email) for email in HOSPITAL_OWNER_EMAILS]
            else:
                candidates = [
                    TOKENS.account(f"owner.{h['slug']}@{EMAIL_DOMAIN}", probe=True)
                    for h in self.hospitals[: JOURNEY_HOSPITALS * 3]
                ]
            for acct in candidates:
                if len(self.journey) >= JOURNEY_HOSPITALS:
                    break
                if not TOKENS.token(user, acct):
                    continue
                if not acct.hospital_id:  # UserOut without hospitals[]: ask the portal which hospital it is
                    _status, profile = user.api(
                        "GET", "/hospital-portal/profile", name="setup: /hospital-portal/profile", account=acct,
                        scenario="setup", soft=(403, 404),
                    )
                    if isinstance(profile, dict) and profile.get("id"):
                        acct.hospital_id = str(profile["id"])
                if acct.hospital_id:
                    card = next((h for h in self.hospitals if str(h.get("id")) == acct.hospital_id), None)
                    self.journey.append((card or {"id": acct.hospital_id, "slug": acct.hospital_id}, acct))
            self.journey_ready = True
            if self.journey:
                log.info("Journey hospitals: %s", ", ".join(str(card.get("slug")) for card, _ in self.journey))
            else:
                log.error(
                    "No hospital owner could log in (tried %d accounts). Journey and hospital-desk users will stop; "
                    "set HIG_LT_HOSPITAL_OWNERS=owner.<slug>@%s,...",
                    len(candidates), EMAIL_DOMAIN,
                )
        return self.journey


CATALOG = CatalogData()


# =========================================================================================================
# Base user
# =========================================================================================================
_USER_SEQ = itertools.count(1)


class HigUser(FastHttpUser):
    abstract = True
    host = DEFAULT_HOST
    scenario = "other"
    wait_time = think(2, 7)
    connection_timeout = 10.0
    network_timeout = 30.0

    def __init__(self, environment: Any) -> None:
        super().__init__(environment)
        self.seq = next(_USER_SEQ)
        # one stable synthetic client address per simulated user (198.18.0.0/15, RFC 2544 benchmarking)
        self.client_ip = f"198.{18 + (self.seq >> 16) % 2}.{(self.seq >> 8) & 255}.{self.seq & 255}"
        self.account: Account | None = None

    def on_start(self) -> None:
        problem = host_problem(self.host)
        if problem:
            log_once(logging.CRITICAL, "host-guard", "Refusing to load test: %s (see loadtest/README.md)", problem)
            raise StopUser()
        CATALOG.ensure(self)

    def context(self) -> dict:
        return {"scenario": self.scenario}

    # --- HTTP ------------------------------------------------------------------------------------------
    def api(
        self,
        method: str,
        path: str,
        *,
        name: str | None = None,
        body: Any = None,
        auth: bool = True,
        expect: tuple[int, ...] = (200, 201, 204),
        soft: tuple[int, ...] = (),
        accept: Callable[[int, Any], bool] | None = None,
        headers: dict[str, str] | None = None,
        account: Account | None = None,
        scenario: str | None = None,
    ) -> tuple[int, Any]:
        """One request, recorded in Locust stats under ``name``. Returns (status, parsed JSON or None).

        Success = status in ``expect``/``soft`` (or ``accept(status, data)``), plus 429 when HIG_LT_ACCEPT_429=1.
        Authenticated calls get a cached token (login/refresh on demand); a 401 invalidates that token."""
        hdrs = {
            "Accept": "application/json",
            "User-Agent": USER_AGENT,
            "X-Request-ID": f"lt-{RUN_ID}-{uuid.uuid4().hex[:16]}",
        }
        if SPOOF_CLIENT_IP:
            hdrs["X-Forwarded-For"] = self.client_ip
        acct = account or self.account
        token: str | None = None
        if auth:
            if acct is None:
                raise StopUser()
            token = TOKENS.token(self, acct)
            if not token:
                if acct.disabled:
                    log_once(logging.ERROR, f"stop:{acct.key}", "Stopping users of %s: %s", acct.email or acct.key, acct.disabled)
                    raise StopUser()
                raise RescheduleTask()  # transient (rate limited / API down): try again after a wait
            hdrs["Authorization"] = f"Bearer {token}"
            if acct.hospital_id:
                hdrs["X-Hospital-Id"] = acct.hospital_id
        if headers:
            hdrs.update(headers)
        extra: dict[str, Any] = {}
        if body is not None:
            extra["json"] = body
        with self.client.request(
            method, path, name=name or path, headers=hdrs, catch_response=True,
            context={"scenario": scenario or self.scenario}, **extra,
        ) as resp:
            status = int(resp.status_code or 0)
            data = _json_body(resp)
            if accept is not None:
                ok = accept(status, data) or (status == 429 and ACCEPT_429)
            else:
                ok = status in expect or status in soft or (status == 429 and ACCEPT_429)
            if ok:
                resp.success()
            else:
                resp.failure(f"HTTP {status} {error_code(data)}".strip())
        if status == 401 and auth and acct is not None:
            TOKENS.invalidate(acct, token)
        return status, data

    # --- authentication (called by TokenStore while holding the account lock) ---------------------------
    def _store_session(self, acct: Account, data: Any) -> bool:
        if not isinstance(data, dict) or not data.get("access_token"):
            return False
        acct.access = str(data["access_token"])
        acct.refresh = str(data.get("refresh_token") or "")
        acct.expires_at = time.time() + float(data.get("expires_in") or 900)
        user = data.get("user")
        if isinstance(user, dict):
            acct.user = user
            hospitals = [h for h in user.get("hospitals") or [] if isinstance(h, dict) and h.get("id")]
            if hospitals:
                wanted = (acct.email or "").split("@")[0].removeprefix("owner.")
                match = next((h for h in hospitals if h.get("slug") == wanted), hospitals[0])
                acct.hospital_id = str(match["id"])
        return True

    def _clear_cookies(self) -> None:
        jar = getattr(self.client, "cookiejar", None)
        if jar is not None:
            try:
                jar.clear()
            except Exception:  # cookie jar implementations differ between Locust versions
                pass

    def auth_login(self, acct: Account) -> bool:
        body: dict[str, Any] = {"email": acct.email, "password": acct.password}
        quiet_401 = acct.probe or acct.auto_register
        for _attempt in range(4):
            self._clear_cookies()
            status, data = self.api(
                "POST", "/auth/login", name="/auth/login [probe]" if acct.probe else "/auth/login", body=body,
                auth=False, headers=MOBILE_HEADERS, scenario="auth",
                accept=lambda s, d: s == 200 or (s == 401 and (quiet_401 or error_code(d) == "mfa_required")),
            )
            if status == 200 and self._store_session(acct, data):
                return True
            code = error_code(data)
            if status == 401 and code == "mfa_required" and "otp_code" not in body:
                secret = TOTP_SECRETS.get((acct.email or "").lower())
                if not secret:
                    acct.disabled = "MFA required: set HIG_LT_TOTP_SECRETS or ADMIN_MFA_REQUIRED=false on the target"
                    break
                body = {**body, "otp_code": totp_now(secret)}
                continue
            if status == 401 and acct.auto_register and not acct.register_tried:
                acct.register_tried = True
                return self.auth_register(acct)
            if status in (0, 429) or status >= 500:
                gevent.sleep(random.uniform(5, 15))  # transient: retry later, never disable
                continue
            acct.disabled = f"login failed: HTTP {status} {code}".strip()
            break
        if acct.disabled:
            log_once(
                logging.DEBUG if acct.probe else logging.ERROR, f"login:{acct.key}",
                "Account %s disabled for this run: %s", acct.email, acct.disabled,
            )
        return False

    def auth_register(self, acct: Account) -> bool:
        """Create a pool patient (lt.patient.NNNN@...) through the public registration endpoint."""
        country, _currency = market()
        number = (acct.email or "").split("@")[0].rsplit(".", 1)[-1]
        body = {
            "email": acct.email, "password": acct.password, "full_name": f"Loadtest Patient {number}",
            "role": "patient", "country_code": country, "accept_terms": True, "is_adult": True,
        }
        status, data = self.api(
            "POST", "/auth/register", name="/auth/register [pool]", body=body, auth=False,
            headers=MOBILE_HEADERS, scenario="setup", expect=(200, 201),
        )
        if status in (200, 201) and self._store_session(acct, data):
            return True
        if status in (0, 429) or status >= 500:
            acct.register_tried = False  # transient: try again later
        else:
            acct.disabled = f"pool registration failed: HTTP {status} {error_code(data)}".strip()
            log_once(logging.ERROR, f"register:{acct.key}", "Account %s disabled: %s", acct.email, acct.disabled)
        return False

    def auth_refresh(self, acct: Account) -> bool:
        self._clear_cookies()
        status, data = self.api(
            "POST", "/auth/refresh", body={"refresh_token": acct.refresh}, auth=False, scenario="auth",
            headers={**MOBILE_HEADERS, "X-Requested-With": "XMLHttpRequest"}, expect=(200,),
        )
        if status == 200 and self._store_session(acct, data):
            return True
        acct.refresh = ""  # rotated or revoked: log in again (or open a new guest session)
        return False

    def auth_guest(self, acct: Account) -> bool:
        status, data = self.api(
            "POST", "/auth/guest", body={}, auth=False, headers=MOBILE_HEADERS, scenario="auth", expect=(200, 201)
        )
        if status in (200, 201) and self._store_session(acct, data):
            return True
        if status not in (0, 429) and status < 500:
            acct.disabled = f"guest session failed: HTTP {status} {error_code(data)}".strip()
        return False

    def ensure_consent(self, acct: Account, kind: str) -> None:
        """Grant a consent once per account per process (e.g. share_with_hospitals before a case)."""
        if kind in acct.consents:
            return
        _status, data = self.api("GET", "/auth/consents", account=acct)
        if kind not in {str(row.get("kind")) for row in items_of(data) if row.get("granted")}:
            self.api(
                "POST", "/auth/consents", body={"kind": kind, "version": CONSENT_VERSION, "granted": True},
                account=acct,
            )
        acct.consents.add(kind)


# =========================================================================================================
# ~60%: anonymous catalog browsing and search
# =========================================================================================================
class CatalogBrowser(HigUser):
    """Anonymous visitor on the public site or the app in guest mode: browse, filter, search, compare."""

    weight = _env_int("HIG_LT_WEIGHT_CATALOG", 55)
    scenario = "catalog"
    wait_time = think(2, 7)

    @tag("catalog", "read")
    @task(8)
    def home_specialties(self) -> None:
        self.api("GET", "/specialties", auth=False)

    @tag("catalog", "read")
    @task(3)
    def specialty_detail(self) -> None:
        self.api("GET", f"/specialties/{CATALOG.specialty()}", name="/specialties/{slug}", auth=False)

    @tag("catalog", "read")
    @task(5)
    def procedures_by_specialty(self) -> None:
        self.api("GET", qs("/procedures", specialty=CATALOG.specialty()), name="/procedures?specialty=", auth=False)

    @tag("catalog", "read")
    @task(5)
    def procedure_detail(self) -> None:
        self.api("GET", f"/procedures/{CATALOG.procedure_slug()}", name="/procedures/{slug}", auth=False)

    @tag("catalog", "read", "cost")
    @task(5)
    def cost_comparison(self) -> None:
        country, currency = market()
        path = qs("/cost-comparison", procedure=CATALOG.procedure_slug(), country=country, currency=currency)
        self.api("GET", path, name="/cost-comparison", auth=False)

    @tag("catalog", "read")
    @task(10)
    def hospitals_list(self) -> None:
        params: dict[str, Any] = {"page": random.choice([1, 1, 1, 2, 3])}
        if random.random() < 0.4:
            params["city"] = random.choice(CATALOG.cities or CITIES)
        if random.random() < 0.5:
            params["specialty"] = CATALOG.specialty()
        if random.random() < 0.2:
            params["accreditation"] = random.choice(ACCREDITATIONS)
        if random.random() < 0.15:
            params["language"] = random.choice(CATALOG.languages or FALLBACK_LANGUAGES)
        if random.random() < 0.15:
            params["procedure"] = CATALOG.procedure_slug()
        if random.random() < 0.5:
            params["sort"] = random.choice(SORTS)
        self.api("GET", qs("/hospitals", **params), name="/hospitals?[filters]", auth=False)

    @tag("catalog", "read")
    @task(7)
    def hospital_detail(self) -> None:
        hospital = CATALOG.hospital()
        if hospital:
            self.api("GET", f"/hospitals/{hospital['slug']}", name="/hospitals/{slug}", auth=False)

    @tag("catalog", "read")
    @task(7)
    def doctors_list(self) -> None:
        params: dict[str, Any] = {"page": random.choice([1, 1, 2])}
        if random.random() < 0.6:
            params["specialty"] = CATALOG.specialty()
        if random.random() < 0.2:
            params["language"] = random.choice(CATALOG.languages or FALLBACK_LANGUAGES)
        if random.random() < 0.15:
            params["gender"] = random.choice(["male", "female"])
        if random.random() < 0.15:
            params["procedure"] = CATALOG.procedure_slug()
        self.api("GET", qs("/doctors", **params), name="/doctors?[filters]", auth=False)

    @tag("catalog", "read")
    @task(4)
    def doctor_detail(self) -> None:
        doctor = CATALOG.doctor()
        if doctor:
            self.api("GET", f"/doctors/{doctor['id']}", name="/doctors/{id}", auth=False)

    @tag("catalog", "read", "availability")
    @task(2)
    def doctor_availability(self) -> None:
        doctor = CATALOG.doctor()
        if doctor:
            start = random.randint(7, 60)
            window = {"from": today_plus(start), "to": today_plus(start + 30)}
            self.api("GET", qs(f"/doctors/{doctor['id']}/availability", **window), name="/doctors/{id}/availability", auth=False)

    @tag("catalog", "read", "availability")
    @task(1)
    def hospital_availability(self) -> None:
        hospital = CATALOG.hospital()
        if hospital:
            start = random.randint(7, 60)
            window = {"from": today_plus(start), "to": today_plus(start + 30)}
            path = qs(f"/hospitals/{hospital['id']}/availability", **window)
            self.api("GET", path, name="/hospitals/{id}/availability", auth=False)

    @tag("catalog", "read", "search")
    @task(8)
    def search_as_you_type(self) -> None:
        term = random.choice(SEARCH_TERMS)
        prefixes = list(dict.fromkeys([term[:3], term[: max(4, len(term) // 2)], term]))
        for i, prefix in enumerate(prefixes[-random.randint(1, len(prefixes)) :]):  # debounced: 1-3 calls
            if i:
                gevent.sleep(random.uniform(0.3, 0.8))
            self.api("GET", qs("/search", q=prefix), name="/search?q=", auth=False)

    @tag("catalog", "read", "content")
    @task(3)
    def content(self) -> None:
        path = random.choice(["/content/cultural-tips", "/content/helplines", "/content/fx-rates", "/content/symptoms"])
        if path == "/content/symptoms" and random.random() < 0.6:
            self.api("GET", qs(path, specialty=CATALOG.specialty()), name="/content/symptoms?specialty=", auth=False)
        else:
            self.api("GET", path, auth=False)

    @tag("catalog", "read", "travel")
    @task(2)
    def stays_and_services(self) -> None:
        if random.random() < 0.6:
            hospital = CATALOG.hospital()
            if hospital and random.random() < 0.5:
                params: dict[str, Any] = {"hospital_id": hospital["id"]}
            else:
                params = {"city": random.choice(CATALOG.cities or CITIES)}
            self.api("GET", qs("/accommodations", **params), name="/accommodations?[filters]", auth=False)
        else:
            params = {"kind": random.choice(["translator", "local_guide", "transport"]), "city": random.choice(CATALOG.cities or CITIES)}
            self.api("GET", qs("/service-providers", **params), name="/service-providers?[filters]", auth=False)


# =========================================================================================================
# ~15%: patient AI screening wizard (rules engine on the load-test API - never Claude)
# =========================================================================================================
class ScreeningFlow(SequentialTaskSet):
    """Specialty -> step 1 body map -> step 2 symptoms -> step 3 timeline -> step 4 preferences -> submit and
    poll (processing screen) -> matches -> compare/cost comparison -> idle. ~5% of runs use red-flag input."""

    def on_start(self) -> None:
        self.reset()

    def reset(self) -> None:
        self.sid: str | None = None
        self.specialty = CATALOG.specialty()
        self.red_flag = random.random() < 0.05
        self.country, self.currency = market()
        self.matches: list[dict] = []

    def patch(self, body: dict, step: str) -> None:
        status, _data = self.user.api("PATCH", f"/screenings/{self.sid}", name=f"/screenings/{{id}} [{step}]", body=body)
        if status not in (200, 201):
            self.sid = None  # broken flow: start over on the next loop

    @tag("screening", "read")
    @task
    def s00_choose_specialty(self) -> None:
        self.reset()
        self.user.api("GET", "/specialties")

    @tag("screening", "write")
    @task
    def s01_create(self) -> None:
        if USE_AI:
            self.user.ensure_consent(self.user.account, "ai_processing")
        status, data = self.user.api("POST", "/screenings", body={"specialty_slug": self.specialty}, expect=(200, 201))
        if status in (200, 201) and isinstance(data, dict) and data.get("id"):
            self.sid = str(data["id"])

    @tag("screening", "write")
    @task
    def s02_body_map(self) -> None:
        if not self.sid:
            return
        areas = CATALOG.body_areas or FALLBACK_BODY_AREAS
        picked = random.sample(areas, k=min(len(areas), random.randint(1, 2)))
        self.patch({"body_areas": picked, "pain_intensity": random.randint(2, 9)}, "step1")

    @tag("screening", "write")
    @task
    def s03_symptoms(self) -> None:
        if not self.sid:
            return
        if random.random() < 0.5:
            self.user.api("GET", qs("/content/symptoms", specialty=self.specialty), name="/content/symptoms?specialty=")
        names = CATALOG.symptom_names(self.specialty)
        picked = random.sample(names, k=min(len(names), random.randint(3, 6)))
        symptoms = [{"name": name, "answer": random.choice(["yes", "yes", "maybe", "no"])} for name in picked]
        if self.red_flag:
            symptoms.append({"name": "Chest pain at rest", "answer": "yes"})
        self.patch({"symptoms": symptoms}, "step2")

    @tag("screening", "write")
    @task
    def s04_timeline(self) -> None:
        if not self.sid:
            return
        levels = ["none", "mild", "moderate", "severe"]
        body = {
            "duration_value": random.randint(1, 18),
            "duration_unit": random.choice(["days", "weeks", "months", "months", "years"]),
            "severity": {"work": random.choice(levels), "sleep": random.choice(levels), "mobility": random.choice(levels)},
            "previous_treatments": random.sample(["medication", "physical_therapy", "surgery", "other"], k=random.randint(0, 2)),
            "notes": f"{MARK} {RED_FLAG_NOTES if self.red_flag else random.choice(BENIGN_NOTES)}",
        }
        self.patch(body, "step3")

    @tag("screening", "write")
    @task
    def s05_preferences(self) -> None:
        if not self.sid:
            return
        if random.random() < 0.15:  # "Skip & Use Defaults"
            prefs: dict[str, Any] = {"use_ai": USE_AI}
        else:
            ccy, low, high = budget(self.currency)
            start = random.randint(20, 60)
            languages = CATALOG.languages or FALLBACK_LANGUAGES
            prefs = {
                "languages": random.sample(languages, k=min(len(languages), random.randint(1, 2))),
                "doctor_gender": random.choice(["male", "female", "no_preference", "no_preference"]),
                "budget_min_minor": low,
                "budget_max_minor": high,
                "budget_currency": ccy,
                "travel_window_start": today_plus(start),
                "travel_window_end": today_plus(start + random.randint(14, 60)),
                "use_ai": USE_AI,
            }
        self.patch({"preferences": prefs}, "step4")

    @tag("screening", "write")
    @task
    def s06_submit_and_wait(self) -> None:
        if not self.sid:
            return
        status, _data = self.user.api(
            "POST", f"/screenings/{self.sid}/submit", name="/screenings/{id}/submit", body={"consent_ai": USE_AI},
            expect=(200, 201, 202),
        )
        if status not in (200, 201, 202):
            self.sid = None
            return
        submitted = time.time()
        final: dict | None = None
        while time.time() - submitted < SCREENING_TIMEOUT_S:  # the processing screen polls every ~2 s
            gevent.sleep(2.0)
            status, data = self.user.api("GET", f"/screenings/{self.sid}", name="/screenings/{id} [poll]")
            if isinstance(data, dict) and data.get("status") in ("completed", "failed"):
                final = data
                break
            if status in (401, 403, 404):
                break
        elapsed_ms = (time.time() - submitted) * 1000
        if final is None or final.get("status") != "completed":
            reason = f"no result within {SCREENING_TIMEOUT_S:.0f} s" if final is None else "screening failed"
            flow(self.user, "screening submit -> result", elapsed_ms, reason)
            self.sid = None
            return
        flow(self.user, "screening submit -> result", elapsed_ms)
        if self.red_flag:
            urgency = final.get("urgency") or (final.get("ai_result") or {}).get("urgency")
            problem = None if urgency == "emergency" else f"urgency={urgency!r} for red-flag input"
            flow(self.user, "screening red-flag -> urgency=emergency", 0, problem)

    @tag("screening", "read")
    @task
    def s07_matches(self) -> None:
        if not self.sid:
            return
        _status, data = self.user.api("GET", f"/screenings/{self.sid}/matches", name="/screenings/{id}/matches")
        self.matches = items_of(data)

    @tag("screening", "read", "cost")
    @task
    def s08_compare(self) -> None:
        if not self.matches:
            return
        top = self.matches[: random.randint(1, 3)]
        roll = random.random()
        if roll < 0.5:
            slugs = [m["procedure"]["slug"] for m in top if isinstance(m.get("procedure"), dict) and m["procedure"].get("slug")]
            if slugs:
                path = qs("/cost-comparison", procedure=slugs[0], country=self.country, currency=self.currency)
                self.user.api("GET", path, name="/cost-comparison")
        elif roll < 0.85:
            hospital = top[0].get("hospital") if isinstance(top[0].get("hospital"), dict) else {}
            ref = hospital.get("slug") or hospital.get("id")
            if ref:
                self.user.api("GET", f"/hospitals/{ref}", name="/hospitals/{slug}")
        else:
            doctor = top[0].get("doctor") if isinstance(top[0].get("doctor"), dict) else {}
            if doctor.get("id"):
                self.user.api("GET", f"/doctors/{doctor['id']}", name="/doctors/{id}")

    @task
    def s09_idle(self) -> None:
        gevent.sleep(random.uniform(5, 15) * THINK_SCALE)  # session over; no request


class ScreeningPatient(HigUser):
    weight = _env_int("HIG_LT_WEIGHT_SCREENING", 19)
    scenario = "screening"
    wait_time = think(3, 8)  # filling in a wizard step
    tasks = [ScreeningFlow]

    def on_start(self) -> None:
        super().on_start()
        if random.random() < GUEST_SHARE:
            self.account = Account(key=f"guest:{uuid.uuid4().hex}")  # "Browse as Guest" -> POST /auth/guest
        else:
            self.account = patient_account(self.seq)


# =========================================================================================================
# ~10%: cases, quotes, bookings, payments (patient, hospital desk, agent desk, full journey)
# =========================================================================================================
class PatientCasesUser(HigUser):
    """Logged-in patient: dashboard, cases, bookings, payments, trip items; occasionally requests a quote."""

    weight = _env_int("HIG_LT_WEIGHT_PATIENT_CASES", 5)
    scenario = "cases"

    def on_start(self) -> None:
        super().on_start()
        self.account = patient_account(self.seq)
        self.case_ids: list[str] = []
        self.booking_ids: list[str] = []

    @tag("cases", "read")
    @task(5)
    def dashboard(self) -> None:
        self.api("GET", "/patient/dashboard")

    @tag("cases", "read")
    @task(4)
    def cases_list(self) -> None:
        _status, data = self.api("GET", qs("/cases", page=1), name="/cases?page=")
        self.case_ids = [str(c["id"]) for c in items_of(data) if c.get("id")] or self.case_ids

    @tag("cases", "read")
    @task(4)
    def case_detail(self) -> None:
        if self.case_ids:
            self.api("GET", f"/cases/{random.choice(self.case_ids)}", name="/cases/{id}")

    @tag("cases", "bookings", "read")
    @task(3)
    def bookings_list(self) -> None:
        _status, data = self.api("GET", qs("/bookings", page=1), name="/bookings?page=")
        self.booking_ids = [str(b["id"]) for b in items_of(data) if b.get("id")] or self.booking_ids

    @tag("cases", "bookings", "read")
    @task(2)
    def booking_detail(self) -> None:
        if self.booking_ids:
            self.api("GET", f"/bookings/{random.choice(self.booking_ids)}", name="/bookings/{id}")

    @tag("cases", "bookings", "read")
    @task(2)
    def checklist(self) -> None:
        if self.booking_ids:
            self.api("GET", f"/bookings/{random.choice(self.booking_ids)}/checklist", name="/bookings/{id}/checklist")

    @tag("cases", "bookings", "read")
    @task(1)
    def itinerary(self) -> None:
        if self.booking_ids:
            self.api("GET", f"/bookings/{random.choice(self.booking_ids)}/itinerary", name="/bookings/{id}/itinerary")

    @tag("cases", "payments", "read")
    @task(1)
    def payment_orders(self) -> None:
        booking = random.choice(self.booking_ids) if self.booking_ids else None
        self.api("GET", qs("/payments/orders", booking_id=booking), name="/payments/orders?booking_id=")

    @tag("cases", "payments", "read")
    @task(1)
    def installments(self) -> None:
        if self.booking_ids:
            booking = random.choice(self.booking_ids)
            self.api("GET", f"/payments/bookings/{booking}/installments", name="/payments/bookings/{id}/installments")

    @tag("cases", "travel", "read")
    @task(1)
    def travel_items(self) -> None:
        kind = random.choice(["visa-requests", "travel-bookings", "accommodation-bookings", "service-bookings"])
        self.api("GET", f"/travel/{kind}")

    @tag("cases", "read")
    @task(1)
    def documents(self) -> None:
        case = random.choice(self.case_ids) if self.case_ids and random.random() < 0.5 else None
        self.api("GET", qs("/documents", case_id=case), name="/documents?case_id=")

    @tag("cases", "read")
    @task(1)
    def saved(self) -> None:
        self.api("GET", "/patient/saved")

    @tag("cases", "write")
    @task(1)
    def request_quote(self) -> None:
        hospital = CATALOG.hospital()
        if not hospital or self.account is None:
            return
        self.ensure_consent(self.account, "share_with_hospitals")
        body: dict[str, Any] = {"hospital_id": hospital["id"], "patient_notes": f"{MARK} Requesting a quote."}
        doctors = CATALOG.doctors_at(hospital["id"])
        if doctors and random.random() < 0.6:
            body["doctor_id"] = random.choice(doctors)["id"]
        _status, data = self.api("POST", "/cases", body=body, expect=(200, 201))
        if isinstance(data, dict) and data.get("id"):
            self.case_ids.append(str(data["id"]))


class HospitalDeskUser(HigUser):
    """Hospital coordinator: dashboard, enquiry inbox, bookings, doctors, finance."""

    weight = _env_int("HIG_LT_WEIGHT_HOSPITAL", 2)
    scenario = "cases"

    def on_start(self) -> None:
        super().on_start()
        self.case_ids: list[str] = []

    def owner(self) -> None:
        if self.account is None:
            hospitals = CATALOG.journey_hospitals(self)
            if not hospitals:
                raise StopUser()
            self.account = random.choice(hospitals)[1]

    @tag("cases", "hospital", "read")
    @task(4)
    def dashboard(self) -> None:
        self.owner()
        self.api("GET", "/hospital-portal/dashboard")

    @tag("cases", "hospital", "read")
    @task(4)
    def enquiries(self) -> None:
        self.owner()
        status = random.choice(["enquiry", "enquiry", "quoted", "accepted", "booked"])
        _code, data = self.api("GET", qs("/cases", status=status, page=1), name="/cases?status=")
        self.case_ids = [str(c["id"]) for c in items_of(data) if c.get("id")] or self.case_ids

    @tag("cases", "hospital", "read")
    @task(3)
    def case_detail(self) -> None:
        self.owner()
        if self.case_ids:
            self.api("GET", f"/cases/{random.choice(self.case_ids)}", name="/cases/{id}")

    @tag("cases", "hospital", "bookings", "read")
    @task(2)
    def bookings(self) -> None:
        self.owner()
        self.api("GET", qs("/bookings", status=random.choice(["confirmed", "admitted"]), page=1), name="/bookings?status=")

    @tag("cases", "hospital", "read")
    @task(1)
    def doctors(self) -> None:
        self.owner()
        self.api("GET", "/hospital-portal/doctors")

    @tag("cases", "hospital", "read")
    @task(1)
    def procedures(self) -> None:
        self.owner()
        self.api("GET", "/hospital-portal/procedures")

    @tag("cases", "hospital", "finance", "read")
    @task(1)
    def finance(self) -> None:
        self.owner()
        if random.random() < 0.5:
            self.api("GET", "/finance/summary")
        else:
            self.api("GET", qs("/finance/settlements/items", page=1), name="/finance/settlements/items?page=")


class AgentDeskUser(HigUser):
    """Medical-travel agent: dashboard, managed patients, cases, commissions."""

    weight = _env_int("HIG_LT_WEIGHT_AGENT", 1)
    scenario = "cases"

    def on_start(self) -> None:
        super().on_start()
        self.account = TOKENS.account(AGENT_EMAILS[self.seq % len(AGENT_EMAILS)])
        self.case_ids: list[str] = []

    @tag("cases", "agent", "read")
    @task(4)
    def dashboard(self) -> None:
        self.api("GET", "/agent-portal/dashboard")

    @tag("cases", "agent", "read")
    @task(3)
    def patients(self) -> None:
        self.api("GET", "/agent-portal/patients")

    @tag("cases", "agent", "read")
    @task(3)
    def cases(self) -> None:
        _status, data = self.api("GET", qs("/cases", page=1), name="/cases?page=")
        self.case_ids = [str(c["id"]) for c in items_of(data) if c.get("id")] or self.case_ids

    @tag("cases", "agent", "read")
    @task(2)
    def case_detail(self) -> None:
        if self.case_ids:
            self.api("GET", f"/cases/{random.choice(self.case_ids)}", name="/cases/{id}")

    @tag("cases", "agent", "finance", "read")
    @task(1)
    def commissions(self) -> None:
        self.api("GET", qs("/agent-portal/commissions", page=1), name="/agent-portal/commissions?page=")

    @tag("cases", "agent", "finance", "read")
    @task(1)
    def finance_summary(self) -> None:
        self.api("GET", "/finance/summary")

    @tag("cases", "agent", "read")
    @task(1)
    def screenings(self) -> None:
        self.api("GET", "/screenings")

    @tag("cases", "agent", "read")
    @task(1)
    def referral(self) -> None:
        self.api("GET", "/agent-portal/referral")


class TreatmentJourney(SequentialTaskSet):
    """The money path end to end: enquiry -> hospital quote -> accept -> booking (availability) -> mock
    payment (Idempotency-Key, 10% client retry, 5% failure then retry) -> confirmed -> cancel (refund policy)
    or admit + discharge (revenue recognition, settlement items) or just read the checklist."""

    def on_start(self) -> None:
        self.reset()

    def reset(self) -> None:
        self.hospital: dict = {}
        self.owner: Account | None = None
        self.actor: Account | None = None
        self.case_id: str | None = None
        self.quote_id: str | None = None
        self.booking_id: str | None = None
        self.booking: dict = {}
        self.order_id: str | None = None
        self.paid_at = 0.0

    @tag("journey", "cases", "write")
    @task
    def j01_enquiry(self) -> None:
        self.reset()
        user = self.user
        hospitals = CATALOG.journey_hospitals(user)
        if not hospitals:
            raise StopUser()
        self.hospital, self.owner = random.choice(hospitals)
        self.actor, patient_id = user.pick_actor()
        if patient_id is None:
            user.ensure_consent(self.actor, "share_with_hospitals")
        ref = self.hospital.get("slug") or self.hospital["id"]
        _status, detail = user.api("GET", f"/hospitals/{ref}", name="/hospitals/{slug}", account=self.actor)
        detail = detail if isinstance(detail, dict) else {}
        body: dict[str, Any] = {"hospital_id": self.hospital["id"], "patient_notes": f"{MARK} journey {uuid.uuid4().hex[:8]}"}
        offered = [p.get("procedure") for p in detail.get("procedures") or [] if isinstance(p, dict)]
        offered = [p for p in offered if isinstance(p, dict) and p.get("id")]
        if offered:
            body["procedure_id"] = random.choice(offered)["id"]
        doctors = [d for d in detail.get("doctors") or [] if isinstance(d, dict) and d.get("id")]
        if doctors and random.random() < 0.7:
            body["doctor_id"] = random.choice(doctors)["id"]
        if patient_id:
            body["patient_id"] = patient_id
        _status, data = user.api("POST", "/cases", body=body, account=self.actor, expect=(200, 201))
        self.case_id = str(data["id"]) if isinstance(data, dict) and data.get("id") else None

    @tag("journey", "cases", "write")
    @task
    def j02_hospital_sends_quote(self) -> None:
        if not self.case_id:
            return
        lines = [
            {"category": cat, "description": desc, "amount_minor": int(amount * random.uniform(0.8, 1.2))}
            for cat, desc, amount in QUOTE_LINES
        ]
        body = {
            "treatment_plan": f"{MARK} Evaluation, procedure and supervised recovery.",
            "line_items": lines,
            "currency": "INR",
            "estimated_stay_days": random.randint(4, 10),
            "valid_until": today_plus(30),
        }
        _status, data = self.user.api(
            "POST", f"/cases/{self.case_id}/quotes", name="/cases/{id}/quotes", body=body, account=self.owner, expect=(200, 201)
        )
        self.quote_id = str(data["id"]) if isinstance(data, dict) and data.get("id") else None

    @tag("journey", "cases", "read")
    @task
    def j03_review_quote(self) -> None:
        if self.quote_id:
            self.user.api("GET", f"/cases/{self.case_id}", name="/cases/{id}", account=self.actor)

    @tag("journey", "cases", "write")
    @task
    def j04_accept_quote(self) -> None:
        if not self.quote_id:
            return
        status, _data = self.user.api(
            "POST", f"/cases/{self.case_id}/quotes/{self.quote_id}/accept", name="/cases/{id}/quotes/{id}/accept",
            body={}, account=self.actor,
        )
        if status not in (200, 201, 204):
            self.quote_id = None

    @tag("journey", "bookings", "write")
    @task
    def j05_book(self) -> None:
        if not self.quote_id:
            return
        start = random.randint(21, 75)
        window = {"from": today_plus(start), "to": today_plus(start + 30)}
        _status, slots = self.user.api(
            "GET", qs(f"/hospitals/{self.hospital['id']}/availability", **window), name="/hospitals/{id}/availability",
            account=self.actor,
        )
        open_days = [
            s["date"] for s in items_of(slots)
            if s.get("date") and s.get("slot_kind") in (None, "admission")
            and (s.get("available") if s.get("available") is not None else (s.get("capacity") or 0) - (s.get("booked") or 0)) > 0
        ]
        admission = random.choice(open_days) if open_days else today_plus(start + random.randint(0, 30))
        option = random.choices(["full", "deposit", "installments"], weights=[50, 35, 15])[0]
        body: dict[str, Any] = {
            "case_id": self.case_id,
            "quote_id": self.quote_id,
            "admission_date": admission,
            "payment_option": option,
            "insurance_claim_requested": random.random() < 0.1,
        }
        if option == "installments":
            body["installment_months"] = random.choice([3, 6, 12])
        status, data = self.user.api("POST", "/bookings", body=body, account=self.actor, expect=(200, 201), soft=(409,))
        if status == 409:
            flow(self.user, "booking rejected: capacity/conflict (409)", 0)  # expected under contention
            return
        if isinstance(data, dict) and data.get("id"):
            self.booking_id = str(data["id"])
            self.booking = data

    def _order(self, body: dict, key: str, name: str = "/payments/orders") -> str | None:
        _status, data = self.user.api(
            "POST", "/payments/orders", name=name, body=body, headers={"Idempotency-Key": key}, account=self.actor,
            expect=(200, 201),
        )
        order = data.get("order") if isinstance(data, dict) else None
        return str(order["id"]) if isinstance(order, dict) and order.get("id") else None

    def _complete(self, order_id: str, outcome: str) -> None:
        self.user.api(
            "POST", f"/payments/mock/{order_id}/complete", name="/payments/mock/{id}/complete",
            body={"outcome": outcome}, account=self.actor,
        )

    @tag("journey", "payments", "write")
    @task
    def j06_pay(self) -> None:
        if not self.booking_id:
            return
        purpose = "booking_full" if self.booking.get("payment_option") == "full" else "booking_deposit"
        body: dict[str, Any] = {"booking_id": self.booking_id, "purpose": purpose, "gateway": "mock"}
        if random.random() < 0.3:
            body["currency"] = random.choice(["USD", "GBP", "AED", "EUR"])
        key = uuid.uuid4().hex
        order_id = self._order(body, key)
        if not order_id:
            return
        if random.random() < 0.1:  # client retry (timeout / double tap) with the same key -> same order
            again = self._order(body, key, name="/payments/orders [idempotent retry]")
            flow(self.user, "payment order retry -> same order", 0, None if again == order_id else "a different order was returned")
        if random.random() < 0.05:  # declined first attempt, patient retries with a new order
            self._complete(order_id, "failure")
            order_id = self._order(body, uuid.uuid4().hex)
            if not order_id:
                return
        self._complete(order_id, "success")
        self.order_id = order_id
        self.paid_at = time.time()

    @tag("journey", "payments", "read")
    @task
    def j07_confirmed(self) -> None:
        if not self.order_id or not self.booking_id:
            return
        self.user.api("GET", f"/payments/orders/{self.order_id}", name="/payments/orders/{id}", account=self.actor)
        state = None
        for _attempt in range(8):  # capture may be applied by the worker (webhook path): allow ~10 s
            _status, booking = self.user.api("GET", f"/bookings/{self.booking_id}", name="/bookings/{id}", account=self.actor)
            state = booking.get("status") if isinstance(booking, dict) else None
            if state != "pending_payment":
                break
            gevent.sleep(1.5)
        problem = None if state == "confirmed" else f"booking status {state!r} after capture"
        flow(self.user, "payment captured -> booking confirmed", (time.time() - self.paid_at) * 1000, problem)
        if state != "confirmed":
            self.booking_id = None

    @tag("journey", "write")
    @task
    def j08_after_care(self) -> None:
        if not self.booking_id:
            return
        roll = random.random()
        if roll < JOURNEY_CANCEL_SHARE:
            self.user.api(
                "POST", f"/bookings/{self.booking_id}/cancel", name="/bookings/{id}/cancel",
                body={"reason": f"{MARK} change of travel plans"}, account=self.actor,
            )
        elif roll < JOURNEY_CANCEL_SHARE + JOURNEY_COMPLETE_SHARE:
            status, _data = self.user.api(
                "POST", f"/bookings/{self.booking_id}/admit", name="/bookings/{id}/admit",
                body={"note": f"{MARK} admitted"}, account=self.owner,
            )
            if status in (200, 201, 204):
                gevent.sleep(random.uniform(1, 3) * THINK_SCALE)
                try:
                    admission = date.fromisoformat(str(self.booking.get("admission_date")))
                except ValueError:
                    admission = date.today()
                discharge = (admission + timedelta(days=random.randint(3, 8))).isoformat()
                self.user.api(
                    "POST", f"/bookings/{self.booking_id}/complete", name="/bookings/{id}/complete",
                    body={"note": f"{MARK} discharged", "discharge_date": discharge}, account=self.owner,
                )
        else:
            self.user.api("GET", f"/bookings/{self.booking_id}/checklist", name="/bookings/{id}/checklist", account=self.actor)

    @task
    def j09_idle(self) -> None:
        gevent.sleep(random.uniform(20, 60) * THINK_SCALE)  # next patient arrives later; no request


class TreatmentJourneyUser(HigUser):
    weight = _env_int("HIG_LT_WEIGHT_JOURNEY", 3)
    scenario = "cases"
    wait_time = think(3, 8)
    tasks = [TreatmentJourney]

    def on_start(self) -> None:
        super().on_start()
        self.account = patient_account(self.seq)
        self.agent_patients: list[str] = []
        self.agent_patients_at = 0.0

    def pick_actor(self) -> tuple[Account, str | None]:
        """(account that creates/accepts/pays, patient_id when an agent acts on behalf of a patient)."""
        if AGENT_EMAILS and random.random() < JOURNEY_AGENT_SHARE:
            agent = TOKENS.account(random.choice(AGENT_EMAILS))
            if TOKENS.token(self, agent):
                if time.time() - self.agent_patients_at > 300:
                    _status, data = self.api("GET", "/agent-portal/patients", account=agent)
                    self.agent_patients = [str(p["id"]) for p in items_of(data) if p.get("id")]
                    self.agent_patients_at = time.time()
                if self.agent_patients:
                    return agent, random.choice(self.agent_patients)
        if PATIENT_POOL > 0 or self.account is None:  # spread journeys over the pool, not one patient per user
            self.account = patient_account(random.randrange(max(PATIENT_POOL, len(PATIENT_EMAILS))))
        return self.account, None


# =========================================================================================================
# ~10%: messaging and notifications (+ optional WebSocket listeners)
# =========================================================================================================
_SENT_MARKERS: dict[str, float] = {}


class MessagingUser(HigUser):
    """Inbox polling, conversations and chat. With HIG_LT_WS=1 each user also holds /ws open and measures
    the delay from POST /messages to the ``message.created`` event (same-process senders only)."""

    weight = _env_int("HIG_LT_WEIGHT_MESSAGING", 10)
    scenario = "messaging"

    def on_start(self) -> None:
        super().on_start()
        roll = random.random()
        owners = CATALOG.journey if CATALOG.journey_ready else []
        if roll < 0.10 and owners:
            self.account = random.choice(owners)[1]
        elif roll < 0.25:
            self.account = TOKENS.account(random.choice(AGENT_EMAILS))
        else:
            self.account = patient_account(self.seq)
        self.conversation_ids: list[str] = []
        self.unread_ids: list[str] = []
        self._ws: Any = None
        self._ws_running = ENABLE_WS
        self._ws_greenlet = gevent.spawn(self._ws_loop) if ENABLE_WS else None

    def on_stop(self) -> None:
        self._ws_running = False
        ws, self._ws = self._ws, None
        if ws is not None:
            try:
                ws.close()
            except Exception:  # already closed
                pass
        if self._ws_greenlet is not None:
            self._ws_greenlet.kill(block=False)

    def _conversation(self) -> str | None:
        if not self.conversation_ids:
            _status, data = self.api("GET", "/conversations")
            self.conversation_ids = [str(c["id"]) for c in items_of(data) if c.get("id")]
        if not self.conversation_ids and random.random() < 0.2:
            _status, data = self.api(
                "POST", "/conversations", body={"subject": f"{MARK} Question about my treatment"}, expect=(200, 201)
            )
            if isinstance(data, dict) and data.get("id"):
                self.conversation_ids = [str(data["id"])]
        return random.choice(self.conversation_ids) if self.conversation_ids else None

    @tag("notifications", "read")
    @task(8)
    def unread_count(self) -> None:
        self.api("GET", "/notifications/unread-count")

    @tag("notifications", "read")
    @task(3)
    def notifications(self) -> None:
        _status, data = self.api("GET", qs("/notifications", unread="true"), name="/notifications?unread=")
        self.unread_ids = [str(n["id"]) for n in items_of(data) if n.get("id") and not n.get("read_at")][:20]

    @tag("notifications", "write")
    @task(1)
    def mark_read(self) -> None:
        if self.unread_ids:
            notification = self.unread_ids.pop()
            self.api("POST", f"/notifications/{notification}/read", name="/notifications/{id}/read", body={}, soft=(404,))
        elif random.random() < 0.3:
            self.api("POST", "/notifications/read-all", body={})

    @tag("messaging", "read")
    @task(5)
    def conversations(self) -> None:
        _status, data = self.api("GET", "/conversations")
        self.conversation_ids = [str(c["id"]) for c in items_of(data) if c.get("id")] or self.conversation_ids

    @tag("messaging", "read")
    @task(5)
    def messages(self) -> None:
        conversation = self._conversation()
        if conversation:
            self.api("GET", qs(f"/conversations/{conversation}/messages", limit=30), name="/conversations/{id}/messages")

    @tag("messaging", "write")
    @task(2)
    def send_message(self) -> None:
        conversation = self._conversation()
        if not conversation:
            return
        marker = f"lt:{uuid.uuid4().hex[:12]}:{int(time.time() * 1000)}"
        if ENABLE_WS:
            if len(_SENT_MARKERS) > 5000:
                cutoff = time.time() - 120
                for key in [k for k, sent in _SENT_MARKERS.items() if sent < cutoff]:
                    _SENT_MARKERS.pop(key, None)
            _SENT_MARKERS[marker] = time.time()
        body = {"body": f"{MARK} {random.choice(CHAT_LINES)} #{marker}"}
        self.api("POST", f"/conversations/{conversation}/messages", name="/conversations/{id}/messages", body=body, expect=(200, 201))

    @tag("messaging", "write")
    @task(2)
    def mark_conversation_read(self) -> None:
        conversation = self._conversation()
        if conversation:
            self.api("POST", f"/conversations/{conversation}/read", name="/conversations/{id}/read", body={})

    # --- WebSocket listener (optional) --------------------------------------------------------------------
    def _ws_loop(self) -> None:
        try:
            import websocket  # websocket-client; optional dependency (requirements.txt)
        except ImportError:
            log_once(logging.ERROR, "ws-missing", "HIG_LT_WS=1 needs the 'websocket-client' package (see requirements.txt)")
            return
        base = self.host.replace("https://", "wss://", 1).replace("http://", "ws://", 1).rstrip("/")
        backoff = 1.0
        while self._ws_running:
            token = TOKENS.token(self, self.account) if self.account is not None else None
            if not token:
                gevent.sleep(5)
                continue
            started = time.time()
            try:
                ws = websocket.create_connection(
                    f"{base}/ws?token={token}", timeout=30,
                    header=[f"User-Agent: {USER_AGENT}", f"X-Forwarded-For: {self.client_ip}"],
                )
            except Exception as exc:  # handshake refused / network error
                ws_event(self, "/ws connect", started, exc)
                gevent.sleep(backoff)
                backoff = min(backoff * 2, 30.0)
                continue
            ws_event(self, "/ws connect", started)
            backoff = 1.0
            self._ws = ws
            try:
                while self._ws_running:
                    try:
                        raw = ws.recv()
                    except websocket.WebSocketTimeoutException:
                        ws.ping()
                        continue
                    if not raw:
                        break
                    self._on_ws_message(raw)
            except Exception as exc:  # connection dropped by the server or the network
                if self._ws_running:
                    ws_event(self, "/ws receive", time.time(), exc)
            finally:
                self._ws = None
                try:
                    ws.close()
                except Exception:  # already closed
                    pass
            gevent.sleep(random.uniform(0.5, 2.0))

    def _on_ws_message(self, raw: Any) -> None:
        text = raw.decode("utf-8", "replace") if isinstance(raw, bytes) else str(raw)
        if '"message.created"' not in text:
            return
        match = MARKER_RE.search(text)
        sent = _SENT_MARKERS.get(match.group(0)) if match else None
        if sent is not None:
            ws_event(self, "/ws message.created fan-out", sent)


# =========================================================================================================
# ~5%: admin portal dashboards (ops, finance, support)
# =========================================================================================================
class AdminOpsUser(HigUser):
    weight = _env_int("HIG_LT_WEIGHT_ADMIN", 3)
    scenario = "admin"

    def on_start(self) -> None:
        super().on_start()
        self.account = TOKENS.account(ADMIN_EMAILS[self.seq % len(ADMIN_EMAILS)])

    @tag("admin", "read")
    @task(5)
    def dashboard(self) -> None:
        self.api("GET", "/admin/dashboard")

    @tag("admin", "read")
    @task(2)
    def approval_queue(self) -> None:
        if random.random() < 0.6:
            self.api("GET", qs("/admin/hospitals", status="pending_review", page=1), name="/admin/hospitals?status=")
        else:
            self.api("GET", qs("/admin/agents", status="pending"), name="/admin/agents?status=")

    @tag("admin", "read")
    @task(2)
    def users(self) -> None:
        role = random.choice([None, "patient", "agent", "hospital"])
        self.api("GET", qs("/admin/users", role=role, page=random.choice([1, 1, 2])), name="/admin/users?[filters]")

    @tag("admin", "read")
    @task(2)
    def cases(self) -> None:
        status = random.choice([None, "enquiry", "quoted", "booked", "in_treatment"])
        self.api("GET", qs("/cases", status=status, page=1), name="/cases?status=")

    @tag("admin", "read")
    @task(2)
    def bookings(self) -> None:
        self.api("GET", qs("/bookings", page=1), name="/bookings?page=")

    @tag("admin", "read")
    @task(1)
    def audit_logs(self) -> None:
        self.api("GET", qs("/admin/audit-logs", page=1), name="/admin/audit-logs?page=")

    @tag("admin", "read")
    @task(1)
    def sos(self) -> None:
        self.api("GET", "/travel/sos")

    @tag("admin", "read", "heavy")
    @task(1)
    def revenue_report(self) -> None:
        params = {"from": today_plus(-180), "to": today_plus(0), "group_by": random.choice(["month", "hospital", "specialty"])}
        self.api("GET", qs("/admin/reports/revenue", **params), name="/admin/reports/revenue")


class FinanceDeskUser(HigUser):
    weight = _env_int("HIG_LT_WEIGHT_FINANCE", 1)
    scenario = "admin"

    def on_start(self) -> None:
        super().on_start()
        self.account = TOKENS.account(FINANCE_EMAILS[self.seq % len(FINANCE_EMAILS)])

    @tag("admin", "finance", "read")
    @task(4)
    def summary(self) -> None:
        self.api("GET", "/finance/summary")

    @tag("admin", "finance", "read")
    @task(2)
    def orders(self) -> None:
        status = random.choice([None, "paid", "pending", "failed"])
        self.api("GET", qs("/payments/orders", status=status, page=1), name="/payments/orders?status=")

    @tag("admin", "finance", "read")
    @task(2)
    def settlement_items(self) -> None:
        status = random.choice(["eligible", "pending", "on_hold"])
        self.api("GET", qs("/finance/settlements/items", status=status, page=1), name="/finance/settlements/items?status=")

    @tag("admin", "finance", "read")
    @task(1)
    def batches(self) -> None:
        self.api("GET", qs("/finance/settlements/batches", page=1), name="/finance/settlements/batches?page=")

    @tag("admin", "finance", "read")
    @task(1)
    def trial_balance(self) -> None:
        self.api("GET", "/finance/ledger/trial-balance")

    @tag("admin", "finance", "read")
    @task(1)
    def refunds(self) -> None:
        self.api("GET", "/payments/refunds")

    @tag("admin", "finance", "read")
    @task(1)
    def journal(self) -> None:
        self.api("GET", qs("/finance/ledger/transactions", page=1), name="/finance/ledger/transactions?page=")

    @tag("admin", "finance", "read", "heavy")
    @task(1)
    def csv_export(self) -> None:
        if random.random() < 0.25:  # exports are rare
            kind = random.choice(["bookings", "payments", "settlements"])
            self.api("GET", qs("/admin/reports/export", type=kind), name="/admin/reports/export?type=")


class SupportDeskUser(HigUser):
    weight = _env_int("HIG_LT_WEIGHT_SUPPORT", 1)
    scenario = "admin"

    def on_start(self) -> None:
        super().on_start()
        self.account = TOKENS.account(SUPPORT_EMAILS[self.seq % len(SUPPORT_EMAILS)])

    @tag("admin", "support", "read")
    @task(3)
    def cases(self) -> None:
        self.api("GET", qs("/cases", page=1), name="/cases?page=")

    @tag("admin", "support", "read")
    @task(2)
    def sos(self) -> None:
        self.api("GET", "/travel/sos")

    @tag("admin", "support", "read")
    @task(2)
    def visas(self) -> None:
        self.api("GET", "/travel/visa-requests")

    @tag("admin", "support", "read")
    @task(2)
    def conversations(self) -> None:
        self.api("GET", "/conversations")

    @tag("admin", "support", "read")
    @task(1)
    def travel_bookings(self) -> None:
        self.api("GET", "/travel/travel-bookings")

    @tag("admin", "support", "read")
    @task(1)
    def dashboard(self) -> None:
        self.api("GET", "/admin/dashboard")


# =========================================================================================================
# Optional: authentication churn (Argon2id cost). Disabled unless HIG_LT_WEIGHT_AUTH_CHURN > 0.
# =========================================================================================================
class AuthChurnUser(HigUser):
    weight = _env_int("HIG_LT_WEIGHT_AUTH_CHURN", 0)
    scenario = "auth"
    wait_time = think(5, 15)

    @tag("auth", "write")
    @task
    def login_cycle(self) -> None:
        email = patient_account(random.randrange(10**6)).email or PATIENT_EMAILS[0]
        acct = Account(key=f"churn:{uuid.uuid4().hex}", email=email, password=PASSWORD, auto_register=PATIENT_POOL > 0)
        if not self.auth_login(acct):
            if acct.disabled:  # never keep hammering a failing password (account lockout after 5 failures)
                log_once(logging.ERROR, "churn-stop", "Auth churn stopped: %s", acct.disabled)
                raise StopUser()
            return
        self.api("GET", "/auth/me", account=acct)
        if acct.refresh and random.random() < 0.5:
            self.auth_refresh(acct)
        body = {"refresh_token": acct.refresh} if acct.refresh else {}
        self.api(
            "POST", "/auth/logout", body=body, account=acct, expect=(200, 204),
            headers={**MOBILE_HEADERS, "X-Requested-With": "XMLHttpRequest"},
        )


# =========================================================================================================
# Optional load shape: HIG_LT_SHAPE=step (capacity discovery). Otherwise -u/-r/-t apply as usual.
# =========================================================================================================
if _env("HIG_LT_SHAPE").lower() == "step":

    class StepLoadShape(LoadTestShape):
        """Add HIG_LT_STEP_USERS every HIG_LT_STEP_SECONDS up to HIG_LT_PEAK_USERS, hold HIG_LT_HOLD_SECONDS, stop."""

        step_users = max(1, _env_int("HIG_LT_STEP_USERS", 50))
        step_seconds = max(10, _env_int("HIG_LT_STEP_SECONDS", 120))
        peak_users = max(1, _env_int("HIG_LT_PEAK_USERS", 1000))
        hold_seconds = max(0, _env_int("HIG_LT_HOLD_SECONDS", 300))

        def tick(self) -> tuple[int, float] | None:
            run_time = self.get_run_time()
            ramp = math.ceil(self.peak_users / self.step_users) * self.step_seconds
            spawn_rate = max(1.0, self.step_users / 10)
            if run_time < ramp:
                return min(self.peak_users, (int(run_time // self.step_seconds) + 1) * self.step_users), spawn_rate
            if run_time < ramp + self.hold_seconds:
                return self.peak_users, spawn_rate
            return None


# =========================================================================================================
# Events: target guard, scenario mix accounting (works distributed), SLO summary + optional exit code
# =========================================================================================================
SCENARIO_REQUESTS: Counter[str] = Counter()


@events.test_start.add_listener
def _guard_target(environment: Any, **_kw: Any) -> None:
    if isinstance(environment.runner, WorkerRunner):
        return
    target = environment.host or DEFAULT_HOST
    problem = host_problem(target)
    if problem:
        log.critical("Refusing to run the load test: %s (see loadtest/README.md)", problem)
        environment.process_exit_code = 2
        gevent.spawn_later(0.5, environment.runner.quit)
    else:
        log.info("Heal India Global load test %s -> %s (think scale %.2f, patient pool %d)", RUN_ID, target, THINK_SCALE, PATIENT_POOL)


@events.request.add_listener
def _count_scenario(request_type: str, context: dict | None = None, **_kw: Any) -> None:
    if request_type not in ("FLOW", "WS"):
        SCENARIO_REQUESTS[(context or {}).get("scenario", "other")] += 1


@events.reset_stats.add_listener
def _reset_scenarios(**_kw: Any) -> None:
    SCENARIO_REQUESTS.clear()


@events.report_to_master.add_listener
def _send_scenarios(client_id: str, data: dict, **_kw: Any) -> None:
    data["hig_scenarios"] = dict(SCENARIO_REQUESTS)
    SCENARIO_REQUESTS.clear()


@events.worker_report.add_listener
def _merge_scenarios(client_id: str, data: dict, **_kw: Any) -> None:
    for scenario, count in (data.get("hig_scenarios") or {}).items():
        SCENARIO_REQUESTS[scenario] += int(count)


@events.quitting.add_listener
def _summarise(environment: Any, **_kw: Any) -> None:
    if isinstance(environment.runner, WorkerRunner):
        return
    stats = environment.stats
    groups = {key: StatsEntry(stats, key, "SLO") for key in ("catalog_read", "auth_read", "write", "http")}
    business: list[StatsEntry] = []
    for (name, method), entry in list(stats.entries.items()):
        if method in ("FLOW", "WS"):
            business.append(entry)
            continue
        klass = classify(method, name)
        if klass is not None:
            groups[klass].extend(entry)
            groups["http"].extend(entry)
    http = groups["http"]
    if not http.num_requests:
        return
    elapsed = max((http.last_request_timestamp or time.time()) - http.start_time, 1.0)
    rps = http.num_requests / elapsed
    error_rate = http.num_failures / http.num_requests
    checks: list[tuple[str, str, str, bool, bool]] = []  # (objective, measured, target, ok, gating)

    def p95_check(key: str, label: str, target: float, gating: bool) -> None:
        entry = groups[key]
        if entry.num_requests:
            value = entry.get_response_time_percentile(0.95)
            checks.append((label, f"{value} ms (n={entry.num_requests})", f"< {target:.0f} ms", value < target, gating))

    p95_check("catalog_read", "catalog reads p95", SLO_CATALOG_P95_MS, True)
    p95_check("write", "writes p95", SLO_WRITE_P95_MS, True)
    p95_check("auth_read", "authenticated reads p95 (info)", SLO_AUTH_READ_P95_MS, False)
    checks.append(("HTTP error rate", f"{error_rate:.3%}", f"< {SLO_ERROR_RATE:.2%}", error_rate < SLO_ERROR_RATE, True))
    checks.append(("throughput", f"{rps:.1f} req/s", f">= {0.9 * TARGET_RPS:.0f} req/s", rps >= 0.9 * TARGET_RPS, True))

    lines = ["", "=" * 110, f"Heal India Global load test {RUN_ID}: {http.num_requests} HTTP requests in {elapsed:.0f} s"]
    for label, measured, target, ok, gating in checks:
        verdict = ("PASS" if ok else "FAIL") if gating else ("ok" if ok else "warn")
        lines.append(f"  {verdict:<5} {label:<34} {measured:<30} target {target}")
    total = sum(SCENARIO_REQUESTS.values())
    if total:
        mix = ", ".join(f"{name} {count / total:.1%}" for name, count in SCENARIO_REQUESTS.most_common())
        lines.append(f"  request mix: {mix}")
        lines.append("  (target mix: catalog 60%, screening 15%, cases 10%, messaging 10%, admin 5%; setup/auth are overhead)")
    slowest = sorted(
        (e for (_n, m), e in stats.entries.items() if m not in ("FLOW", "WS") and e.num_requests >= 20),
        key=lambda e: e.get_response_time_percentile(0.95), reverse=True,
    )[:8]
    if slowest:
        lines.append("  slowest endpoints (p95):")
        for e in slowest:
            lines.append(
                f"    {e.method:<6} {e.name:<48} p95 {e.get_response_time_percentile(0.95):>6} ms"
                f"  p99 {e.get_response_time_percentile(0.99):>6} ms  n={e.num_requests}  failures={e.num_failures}"
            )
    if business:
        lines.append("  business flows / websocket:")
        for e in sorted(business, key=lambda entry: entry.name):
            lines.append(
                f"    {e.method:<6} {e.name:<48} p95 {e.get_response_time_percentile(0.95):>6} ms"
                f"  n={e.num_requests}  failures={e.num_failures}"
            )
    gate_failed = any(gating and not ok for _label, _measured, _target, ok, gating in checks)
    if ENFORCE_SLO:
        lines.append(f"  SLO gate (HIG_LT_ENFORCE_SLO=1): {'FAILED' if gate_failed else 'passed'}")
        if gate_failed:
            environment.process_exit_code = 1
    lines.append("=" * 110)
    log.info("\n".join(lines))
