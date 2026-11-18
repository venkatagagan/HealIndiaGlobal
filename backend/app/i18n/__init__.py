"""Server-side translations (emails, notifications, API error messages) and request-locale resolution.

* Catalogs: ``app/i18n/<lng>.json`` (nested JSON, looked up with dotted keys such as
  ``"notifications.booking_confirmed.title"``). English is the source; a key missing in a language falls
  back to English, then to the key itself.
* Admin overrides (``translation_overrides`` rows with ``app = 'server'``) win over the shipped catalogs. They
  are kept in an in-process snapshot (:data:`STATE`) together with the enabled languages, so :func:`t` stays
  synchronous. The snapshot is refreshed by :func:`app.i18n.runtime.ensure_fresh` (on the first API request
  after ``SNAPSHOT_TTL`` seconds, before rendering notifications, and immediately after an admin change).
* Languages: English is always on; the others are switched on/off by admins (``languages`` table). Only
  enabled languages are ever used for a request or a recipient.

    from app.i18n import t
    t("notifications.payment_failed.title", "ar")
    t("email.common.greeting", locale, name="Amara")
"""

from __future__ import annotations

import json
import os
import re
import string
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any

__all__ = [
    "APPS",
    "DEFAULT_LANGUAGE",
    "DEFAULT_LANGUAGES",
    "I18N_DIR",
    "RTL_LANGUAGES",
    "STATE",
    "SUPPORTED_LANGUAGES",
    "LanguageInfo",
    "Msg",
    "enabled_languages",
    "format_text",
    "has_key",
    "is_rtl",
    "language_name",
    "normalize_locale",
    "parse_accept_language",
    "recipient_locale",
    "resolve_locale",
    "server_catalog",
    "t",
    "text_direction",
]

I18N_DIR = Path(__file__).resolve().parent
CATALOGS_DIR = I18N_DIR / "catalogs"

SUPPORTED_LANGUAGES: tuple[str, ...] = ("en", "ar", "fr", "bn", "ru")
DEFAULT_LANGUAGE = "en"
RTL_LANGUAGES: frozenset[str] = frozenset({"ar"})
#: Apps whose strings can be overridden (``translation_overrides.app``).
APPS: tuple[str, ...] = ("website", "patient_web", "admin", "agent", "hospital", "mobile", "server")
#: Seconds an in-process snapshot (enabled languages + server overrides) is trusted before a reload.
SNAPSHOT_TTL = 60.0

_LOCALE_RE = re.compile(r"^[a-z]{2,3}$")


@dataclass(frozen=True, slots=True)
class LanguageInfo:
    code: str
    name: str
    native_name: str
    rtl: bool
    enabled: bool
    sort: int


#: Seed rows (also inserted by migration 0009f). The ``languages`` table overrides these per code.
DEFAULT_LANGUAGES: tuple[LanguageInfo, ...] = (
    LanguageInfo("en", "English", "English", False, True, 0),
    LanguageInfo("ar", "Arabic", "العربية", True, False, 10),
    LanguageInfo("fr", "French", "Français", False, False, 20),
    LanguageInfo("bn", "Bengali", "বাংলা", False, False, 30),
    LanguageInfo("ru", "Russian", "Русский", False, False, 40),
)
_DEFAULT_BY_CODE = {lang.code: lang for lang in DEFAULT_LANGUAGES}


@dataclass(slots=True)
class _Snapshot:
    """In-process view of the DB-backed i18n settings (replaced atomically by ``runtime.refresh``)."""

    languages: tuple[LanguageInfo, ...] = DEFAULT_LANGUAGES
    enabled: frozenset[str] = frozenset({DEFAULT_LANGUAGE})
    #: ``{locale: {key: text}}`` admin overrides of server strings
    overrides: dict[str, dict[str, str]] = field(default_factory=dict)
    loaded_at: float | None = None

    def reset(self) -> None:
        self.languages = DEFAULT_LANGUAGES
        self.enabled = frozenset({DEFAULT_LANGUAGE})
        self.overrides = {}
        self.loaded_at = None


STATE = _Snapshot()


# --------------------------------------------------------------------------------------------- languages
def normalize_locale(value: str | None) -> str | None:
    """``"fr-CA"`` / ``"FR_ca"`` / ``" fr "`` -> ``"fr"``; ``None`` for empty or malformed values."""
    if not value or not isinstance(value, str):
        return None
    primary = value.strip().lower().replace("_", "-").split("-", 1)[0]
    return primary if _LOCALE_RE.match(primary) else None


def enabled_languages() -> frozenset[str]:
    """Codes of the enabled languages (English always included)."""
    return STATE.enabled | {DEFAULT_LANGUAGE}


def is_rtl(locale: str | None) -> bool:
    code = normalize_locale(locale) or DEFAULT_LANGUAGE
    for lang in STATE.languages:
        if lang.code == code:
            return lang.rtl
    return code in RTL_LANGUAGES


def text_direction(locale: str | None) -> str:
    return "rtl" if is_rtl(locale) else "ltr"


def language_name(locale: str | None) -> str:
    """English name of a language (``"ar"`` -> ``"Arabic"``), for AI prompts."""
    code = normalize_locale(locale) or DEFAULT_LANGUAGE
    for lang in STATE.languages:
        if lang.code == code:
            return lang.name
    default = _DEFAULT_BY_CODE.get(code)
    return default.name if default is not None else code


def parse_accept_language(header: str | None) -> list[str]:
    """``"fr-CA,fr;q=0.9,ar;q=0.8,*;q=0.1"`` -> ``["fr", "ar"]`` (by q-value, then order; q=0 dropped)."""
    if not header:
        return []
    ranked: list[tuple[float, int, str]] = []
    for index, part in enumerate(header.split(",")[:20]):
        piece = part.strip()
        if not piece:
            continue
        tag, _, params = piece.partition(";")
        quality = 1.0
        for param in params.split(";"):
            name, _, value = param.strip().partition("=")
            if name.strip().lower() == "q":
                try:
                    quality = float(value.strip())
                except ValueError:
                    quality = 0.0
        code = normalize_locale(tag)
        if code is None or quality <= 0:
            continue
        ranked.append((-quality, index, code))
    ranked.sort()
    return list(dict.fromkeys(code for _, _, code in ranked))


def resolve_locale(
    *,
    query: str | None = None,
    user_language: str | None = None,
    accept_language: str | None = None,
    enabled: Iterable[str] | None = None,
) -> str:
    """Request locale: ``?lang=`` -> the signed-in user's ``preferred_language`` -> ``Accept-Language`` ->
    English, restricted to enabled languages."""
    allowed = set(enabled if enabled is not None else enabled_languages()) | {DEFAULT_LANGUAGE}
    for candidate in (normalize_locale(query), normalize_locale(user_language)):
        if candidate in allowed:
            return candidate
    for candidate in parse_accept_language(accept_language):
        if candidate in allowed:
            return candidate
    return DEFAULT_LANGUAGE


def recipient_locale(user: Any) -> str:
    """Language for emails/notifications to ``user``: their ``preferred_language`` when it is enabled, else
    English (a disabled language is never used, even if the user chose it while it was on)."""
    code = normalize_locale(getattr(user, "preferred_language", None) if user is not None else None)
    return code if code is not None and code in enabled_languages() else DEFAULT_LANGUAGE


# ---------------------------------------------------------------------------------------------- catalogs
def _flatten(value: Any, prefix: str, out: dict[str, str]) -> dict[str, str]:
    if isinstance(value, str):
        out[prefix] = value
    elif isinstance(value, Mapping):
        for key, child in value.items():
            _flatten(child, f"{prefix}.{key}" if prefix else str(key), out)
    return out


@lru_cache(maxsize=32)
def _load_flat(path: str, mtime_ns: int) -> dict[str, str]:
    with open(path, encoding="utf-8") as fh:
        return _flatten(json.load(fh), "", {})


def _mtime(path: Path) -> int | None:
    try:
        return os.stat(path).st_mtime_ns
    except OSError:
        return None


def server_catalog(locale: str) -> dict[str, str]:
    """Flattened shipped server catalog ``app/i18n/<locale>.json`` (empty when missing)."""
    code = normalize_locale(locale)
    if code is None:
        return {}
    path = I18N_DIR / f"{code}.json"
    mtime = _mtime(path)
    if mtime is None:
        return {}
    return _load_flat(str(path), mtime)


def has_key(key: str, locale: str = DEFAULT_LANGUAGE) -> bool:
    return key in STATE.overrides.get(locale, {}) or key in server_catalog(locale)


class _SafeDict(dict[str, Any]):
    def __missing__(self, key: str) -> str:
        return "{" + key + "}"


_FORMATTER = string.Formatter()


def format_text(text: str, params: Mapping[str, Any] | None) -> str:
    """``str.format``-style ``{name}`` substitution that never raises (unknown names are left as-is)."""
    if not params or "{" not in text:
        return text
    try:
        return _FORMATTER.vformat(text, (), _SafeDict(params))
    except (ValueError, IndexError, AttributeError, KeyError):
        return text


@dataclass(frozen=True, slots=True)
class Msg:
    """A translatable value used as a parameter of another message (resolved in the same locale)."""

    key: str
    params: Mapping[str, Any] | None = None

    def render(self, locale: str | None) -> str:
        return t(self.key, locale, **dict(self.params or {}))


def _lookup(key: str, locale: str) -> str | None:
    text = STATE.overrides.get(locale, {}).get(key)
    if text:
        return text
    text = server_catalog(locale).get(key)
    return text or None


def t(key: str, locale: str | None = None, /, **params: Any) -> str:
    """Translate ``key`` into ``locale`` (admin override -> shipped catalog -> English -> the key itself) and
    substitute ``{name}`` parameters. :class:`Msg` parameters are translated in the same locale."""
    code = normalize_locale(locale) or DEFAULT_LANGUAGE
    text = _lookup(key, code)
    if text is None and code != DEFAULT_LANGUAGE:
        code_used = DEFAULT_LANGUAGE
        text = _lookup(key, DEFAULT_LANGUAGE)
    else:
        code_used = code
    if text is None:
        return key
    resolved = {k: (v.render(code_used) if isinstance(v, Msg) else v) for k, v in params.items()}
    return format_text(text, resolved)
