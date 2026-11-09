"""Website & contact settings: platform settings shown on the public website, editable only by a super admin.

They live in ``platform_settings`` like every other setting (``app.core.settings_store``); this module holds
their defaults, validation and the public projection served at ``GET /api/v1/site-config``.

Keys (JSON objects / lists; an empty string means "unset": the website then uses its environment fallback):

* ``helplines``                    phone numbers (also used by the patient apps), public email, support hours
                                   and the WhatsApp prefilled message
* ``website_floating_buttons``     show / hide the floating WhatsApp and Call buttons
* ``website_social_links``         Facebook, Instagram, LinkedIn, X, YouTube profile URLs (footer, sameAs)
* ``website_analytics``            provider (none | plausible | ga4) and its IDs
* ``website_search_verification``  Google / Bing verification tokens, IndexNow key (server-side only)
* ``website_marketing``            marketing claims (savings %, stats, wait text): value, source, show/hide
* ``website_reviewers``            medical reviewers credited on health pages (pages reference ``id``)
* ``website_footer``               "Developed by" credit and the footer disclaimer

The defaults reproduce what the website showed before these settings existed (content/site/marketing.json,
content/site/reviewers.json, the footer copy), so nothing changes visually until a super admin edits a value.
"""

from __future__ import annotations

import copy
import re
from typing import Any
from urllib.parse import urlsplit

from app.core.errors import BadRequest

SOCIAL_NETWORKS: tuple[str, ...] = ("facebook", "instagram", "linkedin", "x", "youtube")
ANALYTICS_PROVIDERS: tuple[str, ...] = ("none", "plausible", "ga4")
PHONE_KEYS: tuple[str, ...] = ("24x7", "whatsapp", "emergency")

#: Values that shipped as code defaults before launch. They are not real numbers and are never published.
PLACEHOLDER_NUMBERS: frozenset[str] = frozenset({"+91-11-4000-0000", "+91-90000-00000"})

DEFAULT_WHATSAPP_MESSAGE = "Hello Heal India Global, I would like help planning treatment in India."
DEFAULT_DISCLAIMER = (
    "We are a medical-travel facilitator, not a healthcare provider. Content and the AI assessment are "
    "not medical advice or a diagnosis; prices are indicative until the hospital quotes in writing. "
    "Accreditations belong to the hospitals. In an emergency, call your local emergency number."
)

WEBSITE_DEFAULTS: dict[str, Any] = {
    "helplines": {
        "24x7": "",
        "whatsapp": "",
        "emergency": "112",
        "email": "",
        "support_hours": "",
        "whatsapp_message": DEFAULT_WHATSAPP_MESSAGE,
    },
    "website_floating_buttons": {"show_whatsapp": True, "show_call": True},
    "website_social_links": {name: "" for name in SOCIAL_NETWORKS},
    "website_analytics": {
        "provider": "none",
        "plausible_domain": "",
        "plausible_script_url": "",
        "ga4_measurement_id": "",
    },
    "website_search_verification": {"google": "", "bing": "", "indexnow_key": ""},
    # content/site/marketing.json (testimonials stay in that file).
    "website_marketing": {
        "claims_verified": False,
        "max_savings_pct": {"value": 70, "source": "", "show": True},
        "stats": [
            {
                "id": "patientsTreated",
                "label": "Patients treated",
                "value": "5,000+",
                "source": "",
                "show": True,
            }
        ],
        "india_wait": "Usually 1–2 weeks once your quote is accepted",
        "show_testimonials": True,
    },
    # content/site/reviewers.json: only the placeholder entry, which is inactive (never shown publicly).
    "website_reviewers": [
        {
            "id": "medical-reviewer-placeholder",
            "name": "",
            "credentials": "",
            "registration_number": "",
            "registration_council": "",
            "bio": "",
            "photo_url": "",
            "active": False,
        }
    ],
    "website_footer": {
        "developer_name": "DV Soft",
        "developer_url": "https://dvsoft.in",
        "disclaimer": DEFAULT_DISCLAIMER,
    },
}

#: Keys only a super admin may change (finance keys stay finance-only, see settings_store.FINANCE_KEYS).
WEBSITE_KEYS: frozenset[str] = frozenset(WEBSITE_DEFAULTS)

_PHONE_RE = re.compile(r"^\+?[0-9][0-9 ().-]*$")
_LABEL = r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?"
_EMAIL_RE = re.compile(rf"^[^@\s]{{1,64}}@{_LABEL}(?:\.[A-Za-z0-9-]{{1,63}})+$")
_HOST_RE = re.compile(rf"^(?=.{{1,253}}$)(?:{_LABEL}\.)+{_LABEL}$")
_GA4_RE = re.compile(r"^G-[A-Z0-9]{4,20}$")
_TOKEN_RE = re.compile(r"^[A-Za-z0-9_=.-]{4,128}$")
_INDEXNOW_RE = re.compile(r"^[A-Za-z0-9-]{8,128}$")
_STAT_ID_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_-]{0,39}$")
_SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
_META_CONTENT_RE = re.compile(r"""content\s*=\s*["']([^"']*)["']""", re.IGNORECASE)

MAX_STATS = 12
MAX_REVIEWERS = 50


def _bad(message: str) -> BadRequest:
    return BadRequest(message, code="invalid_setting")


def _obj(key: str, value: Any, allowed: tuple[str, ...] | frozenset[str]) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise _bad(f"Setting '{key}' must be an object")
    unknown = sorted(set(value) - set(allowed))
    if unknown:
        raise _bad(f"Setting '{key}' has unknown field(s): {', '.join(unknown)}")
    return value


def _text(label: str, value: Any, max_len: int, *, required: bool = False) -> str:
    if value is None:
        value = ""
    if not isinstance(value, str):
        raise _bad(f"{label} must be text")
    value = value.strip()
    if len(value) > max_len:
        raise _bad(f"{label} must be at most {max_len} characters")
    if required and not value:
        raise _bad(f"{label} is required")
    return value


def _bool(label: str, value: Any) -> bool:
    if not isinstance(value, bool):
        raise _bad(f"{label} must be true or false")
    return value


def _https_url(label: str, value: Any, *, max_len: int = 500, allow_path: bool = False) -> str:
    value = _text(label, value, max_len)
    if not value:
        return ""
    if allow_path and value.startswith("/") and not value.startswith("//") and " " not in value:
        return value
    parts = urlsplit(value)
    if parts.scheme != "https" or not parts.hostname or " " in value or parts.username or parts.password:
        raise _bad(f"{label} must be an https:// URL")
    return value


def _phone(label: str, value: Any, *, min_digits: int, require_plus: bool) -> str:
    value = _text(label, value, 30)
    if not value:
        return ""
    value = re.sub(r"\s+", " ", value)
    digits = re.sub(r"\D", "", value)
    if not _PHONE_RE.match(value) or not min_digits <= len(digits) <= 15:
        raise _bad(f"{label} must be a phone number with {min_digits}-15 digits, e.g. +91 98765 43210")
    if require_plus and not value.startswith("+"):
        raise _bad(f"{label} must be in international format starting with + and the country code")
    return value


def _token(label: str, value: Any) -> str:
    value = _text(label, value, 500)
    match = _META_CONTENT_RE.search(value)  # a pasted <meta ... content="..."> tag: keep only the token
    if match:
        value = match.group(1).strip()
    if value and not _TOKEN_RE.match(value):
        raise _bad(f"{label} must be the verification code only (letters, digits, - _ . =; 4-128 characters)")
    return value


def _validate_helplines(value: Any) -> dict[str, Any]:
    allowed = tuple(WEBSITE_DEFAULTS["helplines"])
    v = _obj("helplines", value, allowed)
    return {
        "24x7": _phone("Phone / helpline number", v.get("24x7"), min_digits=7, require_plus=True),
        "whatsapp": _phone("WhatsApp number", v.get("whatsapp"), min_digits=7, require_plus=True),
        "emergency": _phone("Emergency number", v.get("emergency"), min_digits=3, require_plus=False),
        "email": _email(v.get("email")),
        "support_hours": _text("Support hours", v.get("support_hours"), 120),
        "whatsapp_message": _text("WhatsApp message", v.get("whatsapp_message"), 500),
    }


def _email(value: Any) -> str:
    value = _text("Contact email", value, 254)
    if value and not _EMAIL_RE.match(value):
        raise _bad("Contact email must be a valid email address")
    return value


def _validate_buttons(value: Any) -> dict[str, Any]:
    v = _obj("website_floating_buttons", value, ("show_whatsapp", "show_call"))
    return {
        "show_whatsapp": _bool("Show WhatsApp button", v.get("show_whatsapp", True)),
        "show_call": _bool("Show Call button", v.get("show_call", True)),
    }


def _validate_social(value: Any) -> dict[str, Any]:
    v = _obj("website_social_links", value, SOCIAL_NETWORKS)
    return {name: _https_url(f"{name} profile URL", v.get(name), max_len=300) for name in SOCIAL_NETWORKS}


def _validate_analytics(value: Any) -> dict[str, Any]:
    allowed = tuple(WEBSITE_DEFAULTS["website_analytics"])
    v = _obj("website_analytics", value, allowed)
    provider = _text("Analytics provider", v.get("provider") or "none", 20).lower()
    if provider not in ANALYTICS_PROVIDERS:
        raise _bad(f"Analytics provider must be one of: {', '.join(ANALYTICS_PROVIDERS)}")
    domain = _text("Plausible domain", v.get("plausible_domain"), 253).lower()
    if domain and not _HOST_RE.match(domain):
        raise _bad("Plausible domain must be a host name such as healindiaglobal.com")
    script = _https_url("Plausible script URL", v.get("plausible_script_url"), max_len=300)
    ga4 = _text("GA4 measurement ID", v.get("ga4_measurement_id"), 30).upper()
    if ga4 and not _GA4_RE.match(ga4):
        raise _bad("GA4 measurement ID must look like G-XXXXXXXXXX")
    if provider == "ga4" and not ga4:
        raise _bad("Enter the GA4 measurement ID to use Google Analytics")
    return {
        "provider": provider,
        "plausible_domain": domain,
        "plausible_script_url": script,
        "ga4_measurement_id": ga4,
    }


def _validate_verification(value: Any) -> dict[str, Any]:
    v = _obj("website_search_verification", value, ("google", "bing", "indexnow_key"))
    indexnow = _text("IndexNow key", v.get("indexnow_key"), 128)
    if indexnow and not _INDEXNOW_RE.match(indexnow):
        raise _bad("IndexNow key must be 8-128 characters: letters, digits and -")
    return {
        "google": _token("Google verification code", v.get("google")),
        "bing": _token("Bing verification code", v.get("bing")),
        "indexnow_key": indexnow,
    }


def _validate_marketing(value: Any) -> dict[str, Any]:
    allowed = tuple(WEBSITE_DEFAULTS["website_marketing"])
    v = _obj("website_marketing", value, allowed)
    savings = _obj("max_savings_pct", v.get("max_savings_pct") or {}, ("value", "source", "show"))
    pct = savings.get("value", 70)
    if isinstance(pct, bool) or not isinstance(pct, int) or not 0 <= pct <= 100:
        raise _bad("Maximum savings must be a whole percentage between 0 and 100")
    stats_in = v.get("stats", [])
    if not isinstance(stats_in, list) or len(stats_in) > MAX_STATS:
        raise _bad(f"Marketing stats must be a list of at most {MAX_STATS} entries")
    stats: list[dict[str, Any]] = []
    seen: set[str] = set()
    for i, raw in enumerate(stats_in, start=1):
        s = _obj(f"stat {i}", raw, ("id", "label", "value", "source", "show"))
        stat_id = _text(f"Stat {i} id", s.get("id"), 40, required=True)
        if not _STAT_ID_RE.match(stat_id):
            raise _bad(f"Stat {i} id must start with a letter (letters, digits, - and _ only)")
        if stat_id in seen:
            raise _bad(f"Stat id '{stat_id}' is used twice")
        seen.add(stat_id)
        stats.append(
            {
                "id": stat_id,
                "label": _text(f"Stat {i} label", s.get("label"), 60, required=True),
                "value": _text(f"Stat {i} value", s.get("value"), 30, required=True),
                "source": _text(f"Stat {i} source", s.get("source"), 300),
                "show": _bool(f"Stat {i} show", s.get("show", True)),
            }
        )
    return {
        "claims_verified": _bool("Claims verified", v.get("claims_verified", False)),
        "max_savings_pct": {
            "value": pct,
            "source": _text("Savings source", savings.get("source"), 300),
            "show": _bool("Show savings claim", savings.get("show", True)),
        },
        "stats": stats,
        "india_wait": _text("Typical wait in India", v.get("india_wait"), 200),
        "show_testimonials": _bool("Show testimonials", v.get("show_testimonials", True)),
    }


def _validate_reviewers(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list) or len(value) > MAX_REVIEWERS:
        raise _bad(f"Reviewers must be a list of at most {MAX_REVIEWERS} entries")
    fields = tuple(WEBSITE_DEFAULTS["website_reviewers"][0])
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for i, raw in enumerate(value, start=1):
        r = _obj(f"reviewer {i}", raw, fields)
        rid = _text(f"Reviewer {i} id", r.get("id"), 80, required=True).lower()
        if not _SLUG_RE.match(rid):
            raise _bad(f"Reviewer {i} id must be lowercase letters, digits and hyphens (e.g. dr-asha-rao)")
        if rid in seen:
            raise _bad(f"Reviewer id '{rid}' is used twice")
        seen.add(rid)
        item = {
            "id": rid,
            "name": _text(f"Reviewer {i} name", r.get("name"), 120),
            "credentials": _text(f"Reviewer {i} credentials", r.get("credentials"), 200),
            "registration_number": _text(f"Reviewer {i} registration no.", r.get("registration_number"), 60),
            "registration_council": _text(f"Reviewer {i} council", r.get("registration_council"), 160),
            "bio": _text(f"Reviewer {i} bio", r.get("bio"), 600),
            "photo_url": _https_url(f"Reviewer {i} photo URL", r.get("photo_url"), allow_path=True),
            "active": _bool(f"Reviewer {i} active", r.get("active", False)),
        }
        if item["active"]:
            missing = [
                label
                for label, field in (
                    ("name", "name"),
                    ("credentials", "credentials"),
                    ("registration number", "registration_number"),
                    ("council", "registration_council"),
                )
                if not item[field]
            ]
            if missing:
                raise _bad(f"Reviewer '{rid}' needs {', '.join(missing)} before it can be active")
            text = f"{item['name']} {item['credentials']} {item['registration_council']}"
            if re.search("placeholder", text, re.IGNORECASE):
                raise _bad(f"Reviewer '{rid}' still contains placeholder text")
        out.append(item)
    return out


def _validate_footer(value: Any) -> dict[str, Any]:
    v = _obj("website_footer", value, ("developer_name", "developer_url", "disclaimer"))
    return {
        "developer_name": _text("Developed by", v.get("developer_name"), 60),
        "developer_url": _https_url("Developer URL", v.get("developer_url"), max_len=300),
        "disclaimer": _text("Disclaimer", v.get("disclaimer"), 1000),
    }


_VALIDATORS = {
    "helplines": _validate_helplines,
    "website_floating_buttons": _validate_buttons,
    "website_social_links": _validate_social,
    "website_analytics": _validate_analytics,
    "website_search_verification": _validate_verification,
    "website_marketing": _validate_marketing,
    "website_reviewers": _validate_reviewers,
    "website_footer": _validate_footer,
}


def validate_website_setting(key: str, value: Any) -> Any:
    """Normalised value for a website key (raises ``BadRequest(code=invalid_setting)``).

    Object values may be partial: missing fields keep their defaults (unknown fields are refused)."""
    default = WEBSITE_DEFAULTS[key]
    if isinstance(default, dict) and isinstance(value, dict):
        value = {**copy.deepcopy(default), **value}
    return _VALIDATORS[key](value)


# ------------------------------------------------------------------------------------------- public view
def _merged(values: dict[str, Any], key: str) -> Any:
    """Stored value over the default, field by field for objects (rows written before a field existed)."""
    default = copy.deepcopy(WEBSITE_DEFAULTS[key])
    stored = values.get(key)
    if isinstance(default, dict) and isinstance(stored, dict):
        default.update({k: v for k, v in stored.items() if k in default})
        return default
    return copy.deepcopy(stored) if stored is not None else default


def merged_value(key: str, stored: Any) -> Any:
    """A stored website setting completed with defaults for fields added after it was saved."""
    return _merged({key: stored}, key)


def public_number(value: Any) -> str:
    """A phone number fit for publishing: '' when unset, malformed or a known placeholder."""
    if not isinstance(value, str):
        return ""
    value = value.strip()
    if not value or value in PLACEHOLDER_NUMBERS:
        return ""
    return value if 3 <= len(re.sub(r"\D", "", value)) <= 15 else ""


def public_helplines(value: Any) -> dict[str, str]:
    """Phone entries of ``helplines`` for ``GET /content/helplines`` (patient apps): real numbers only."""
    out: dict[str, str] = {}
    for key, number in dict(value or {}).items():
        if key in ("email", "support_hours", "whatsapp_message"):
            continue
        published = public_number(number)
        if published:
            out[str(key)] = published
    return out


def public_site_config(values: dict[str, Any]) -> dict[str, Any]:
    """Public-safe website configuration (no IndexNow key, no inactive reviewers, no placeholder numbers)."""
    helplines = _merged(values, "helplines")
    buttons = _merged(values, "website_floating_buttons")
    verification = _merged(values, "website_search_verification")
    reviewers = _merged(values, "website_reviewers")
    return {
        "contact": {
            "whatsapp": public_number(helplines.get("whatsapp")),
            "phone": public_number(helplines.get("24x7")),
            "emergency": public_number(helplines.get("emergency")),
            "email": str(helplines.get("email") or ""),
            "support_hours": str(helplines.get("support_hours") or ""),
            "whatsapp_message": str(helplines.get("whatsapp_message") or ""),
            "show_whatsapp_button": buttons.get("show_whatsapp") is not False,
            "show_call_button": buttons.get("show_call") is not False,
        },
        "social": _merged(values, "website_social_links"),
        "analytics": _merged(values, "website_analytics"),
        "verification": {"google": verification.get("google") or "", "bing": verification.get("bing") or ""},
        "marketing": _merged(values, "website_marketing"),
        "reviewers": [
            r for r in (reviewers if isinstance(reviewers, list) else []) if r.get("active") is True
        ],
        "footer": _merged(values, "website_footer"),
    }


def indexnow_key(values: dict[str, Any]) -> str:
    return str(_merged(values, "website_search_verification").get("indexnow_key") or "")
