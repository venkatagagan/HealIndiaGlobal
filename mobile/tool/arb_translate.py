"""Translation helpers for the ARB files (dev helper, not shipped).

From mobile/:
  python tool/arb_translate.py export out.json
      Writes every key of app_en.arb missing in at least one of ar/fr/bn/ru as
      {"key": {"text": ..., "description": ..., "placeholders": [...]}}.
  python tool/arb_translate.py import <locale> translated.json
      Merges {"key": "translated text"} into app_<locale>.arb; keys are written in app_en.arb order and
      placeholders must match the English text.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
L10N = ROOT / "lib" / "l10n"
LOCALES = ("ar", "fr", "bn", "ru")


def _load(locale: str) -> dict:
    return json.loads((L10N / f"app_{locale}.arb").read_text(encoding="utf-8"))


def _save(locale: str, data: dict) -> None:
    (L10N / f"app_{locale}.arb").write_bytes((json.dumps(data, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))


def _args(text: str) -> set[str]:
    """Top-level ICU argument names ({name} and {name, plural|select, ...})."""
    names: set[str] = set()
    depth = 0
    i = 0
    while i < len(text):
        ch = text[i]
        if ch == "{":
            if depth == 0:
                m = re.match(r"\{\s*([A-Za-z_][A-Za-z0-9_]*)", text[i:])
                if m:
                    names.add(m.group(1))
            depth += 1
        elif ch == "}":
            depth -= 1
        i += 1
    return names


def export(out: str) -> None:
    en = _load("en")
    missing: dict[str, dict] = {}
    others = {loc: _load(loc) for loc in LOCALES}
    for key, value in en.items():
        if key.startswith("@"):
            continue
        if all(key in others[loc] for loc in LOCALES):
            continue
        meta = en.get("@" + key, {})
        missing[key] = {
            "text": value,
            "description": meta.get("description", ""),
            "placeholders": sorted((meta.get("placeholders") or {}).keys()),
        }
    Path(out).write_bytes((json.dumps(missing, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    print(f"{len(missing)} keys to translate -> {out}")


def import_(locale: str, path: str) -> None:
    en = _load("en")
    current = _load(locale)
    tr = json.loads(Path(path).read_text(encoding="utf-8"))
    errors = []
    for key, text in tr.items():
        if key not in en:
            errors.append(f"{key}: not in app_en.arb")
        elif not isinstance(text, str) or not text.strip():
            errors.append(f"{key}: empty")
        elif _args(text) != _args(en[key]):
            errors.append(f"{key}: placeholders {_args(text)} != {_args(en[key])}")
    if errors:
        raise SystemExit("\n".join(errors))
    merged = {"@@locale": locale}
    for key in en:
        if key.startswith("@"):
            continue
        if key in tr:
            merged[key] = tr[key]
        elif key in current:
            merged[key] = current[key]
    _save(locale, merged)
    left = [k for k in en if not k.startswith("@") and k not in merged]
    print(f"app_{locale}.arb: {len(tr)} merged, {len(left)} still missing")


if __name__ == "__main__":
    if sys.argv[1] == "export":
        export(sys.argv[2])
    elif sys.argv[1] == "import":
        import_(sys.argv[2], sys.argv[3])
    else:
        raise SystemExit(__doc__)
