"""TEMPORARY (string-extraction phase only): merges l10n_parts/*.json into lib/l10n/app_<locale>.arb,
validates them, then runs `flutter gen-l10n` and tool/gen_l10n_overrides.dart.

Usage (from mobile/):  python l10n_parts/merge.py            # merge + validate + generate
                       python l10n_parts/merge.py --check    # merge + validate only

Each part file: {"en": {"key": "text", "@key": {"description": "...", "placeholders": {...}}, ...},
                 "ar": {"key": "..."}, "fr": {...}, "bn": {...}, "ru": {...}}
"""
import json
import os
import re
import subprocess
import sys

LOCALES = ["en", "ar", "fr", "bn", "ru"]
HERE = os.path.dirname(os.path.abspath(__file__))
MOBILE = os.path.dirname(HERE)
ARB_DIR = os.path.join(MOBILE, "lib", "l10n")
FLUTTER = os.environ.get("FLUTTER", r"D:\dev\flutter\bin\flutter.bat")
DART = os.environ.get("DART", r"D:\dev\flutter\bin\dart.bat")
KEY_RE = re.compile(r"^[a-z][A-Za-z0-9]*$")


class IcuError(Exception):
    pass


def icu_args(msg):
    """Top-level + nested argument names of an ICU message (subset used by gen-l10n)."""
    names = set()
    pos = 0

    def message(top):
        nonlocal pos
        while pos < len(msg):
            c = msg[pos]
            if c == "{":
                argument()
            elif c == "}":
                if top:
                    raise IcuError("unbalanced }")
                return
            else:
                pos += 1

    def ident():
        nonlocal pos
        while pos < len(msg) and msg[pos].isspace():
            pos += 1
        m = re.match(r"[A-Za-z0-9_]+", msg[pos:])
        if not m:
            raise IcuError("expected identifier at %d" % pos)
        pos += len(m.group(0))
        while pos < len(msg) and msg[pos].isspace():
            pos += 1
        return m.group(0)

    def argument():
        nonlocal pos
        pos += 1
        name = ident()
        names.add(name)
        if pos >= len(msg):
            raise IcuError("unterminated")
        if msg[pos] == "}":
            pos += 1
            return
        if msg[pos] != ",":
            raise IcuError("expected , or } after %s" % name)
        pos += 1
        kind = ident()
        if kind not in ("plural", "select"):
            raise IcuError("unsupported type %s" % kind)
        if pos >= len(msg) or msg[pos] != ",":
            raise IcuError("expected ,")
        pos += 1
        cases = set()
        while True:
            while pos < len(msg) and msg[pos].isspace():
                pos += 1
            if pos >= len(msg):
                raise IcuError("unterminated choice")
            if msg[pos] == "}":
                pos += 1
                break
            m = re.match(r"[^{\s]+", msg[pos:])
            if not m:
                raise IcuError("expected selector")
            cases.add(m.group(0))
            pos += len(m.group(0))
            while pos < len(msg) and msg[pos].isspace():
                pos += 1
            if pos >= len(msg) or msg[pos] != "{":
                raise IcuError("expected {")
            pos += 1
            message(False)
            if pos >= len(msg) or msg[pos] != "}":
                raise IcuError("unterminated case")
            pos += 1
        if "other" not in cases:
            raise IcuError("plural/select without other")

    message(True)
    return names


def validate_part(part, data, owner):
    """Returns (errors, {locale: {key: value}}) for one part file."""
    errors = []
    out = {loc: {} for loc in LOCALES}
    en = data.get("en", {})
    keys = [k for k in en if not k.startswith("@")]
    for k in keys:
        if not KEY_RE.match(k):
            errors.append("%s: bad key name %r (lowerCamelCase)" % (part, k))
        if k in owner:
            errors.append("%s: duplicate key %r (already in %s)" % (part, k, owner[k]))
        try:
            en_args = icu_args(en[k])
        except IcuError as e:
            errors.append("%s: en.%s: %s" % (part, k, e))
            continue
        meta = en.get("@" + k, {})
        declared = set((meta.get("placeholders") or {}).keys())
        if en_args != declared:
            errors.append("%s: en.%s uses %s but declares placeholders %s" % (part, k, sorted(en_args), sorted(declared)))
        for name, p in (meta.get("placeholders") or {}).items():
            if "type" not in p:
                errors.append("%s: @%s placeholder %s has no type" % (part, k, name))
        if not meta.get("description"):
            errors.append("%s: @%s has no description" % (part, k))
        out["en"][k] = en[k]
        out["en"]["@" + k] = meta
        for loc in LOCALES[1:]:
            tr = data.get(loc, {})
            if k not in tr:
                errors.append("%s: %s.%s missing" % (part, loc, k))
                continue
            try:
                args = icu_args(tr[k])
            except IcuError as e:
                errors.append("%s: %s.%s: %s" % (part, loc, k, e))
                continue
            if args != en_args:
                errors.append("%s: %s.%s placeholders %s != en %s" % (part, loc, k, sorted(args), sorted(en_args)))
            out[loc][k] = tr[k]
    for k in en:
        if k.startswith("@") and k[1:] not in en:
            errors.append("%s: metadata %s without key" % (part, k))
    for loc in LOCALES[1:]:
        for k in data.get(loc, {}):
            if k not in en:
                errors.append("%s: %s.%s not in en" % (part, loc, k))
    return errors, out


def main():
    check_only = "--check" in sys.argv
    parts = sorted(f for f in os.listdir(HERE) if f.endswith(".json"))
    merged = {loc: {"@@locale": loc} for loc in LOCALES}
    owner = {}
    all_errors = []
    used = 0
    for part in parts:
        with open(os.path.join(HERE, part), encoding="utf-8") as fh:
            try:
                data = json.load(fh)
            except json.JSONDecodeError as e:
                all_errors.append("%s: invalid JSON: %s" % (part, e))
                continue
        errors, out = validate_part(part, data, owner)
        if errors:
            # Skip a broken part entirely so the other parts still build (parts are edited in parallel).
            all_errors.extend(errors)
            all_errors.append("==> %s SKIPPED: its keys are missing from the ARB files until fixed." % part)
            continue
        used += 1
        for loc in LOCALES:
            merged[loc].update(out[loc])
        for k in out["en"]:
            if not k.startswith("@"):
                owner[k] = part
    for loc in LOCALES:
        with open(os.path.join(ARB_DIR, "app_%s.arb" % loc), "w", encoding="utf-8", newline="\n") as fh:
            json.dump(merged[loc], fh, ensure_ascii=False, indent=2)
            fh.write("\n")
    if all_errors:
        print("\n".join(all_errors))
    print("Merged %d keys from %d of %d part(s)." % (len(owner), used, len(parts)))
    if not check_only:
        subprocess.run([FLUTTER, "gen-l10n"], cwd=MOBILE, check=True)
        subprocess.run([DART, "run", "tool/gen_l10n_overrides.dart"], cwd=MOBILE, check=True)
    if all_errors:
        sys.exit(1)


if __name__ == "__main__":
    main()
