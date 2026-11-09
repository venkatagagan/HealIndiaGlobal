"""Merge new / changed English strings into lib/l10n/app_en.arb (dev helper, not shipped).

Usage (from mobile/):  python tool/arb_add.py fragment.json [fragment2.json ...]

A fragment is a JSON object ``{"key": {"text": "...", "description": "...", "placeholders": {...}}}``
(``placeholders`` optional, same shape as ARB metadata). Existing keys are updated in place, new keys are
appended at the end. Changing the text of an existing key needs ``--update``. A lock file serialises concurrent runs. Translations are merged separately with
``python tool/arb_translate.py``.
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EN = ROOT / "lib" / "l10n" / "app_en.arb"
LOCK = ROOT / "lib" / "l10n" / ".arb.lock"


def _lock() -> int:
    for _ in range(600):
        try:
            return os.open(LOCK, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        except FileExistsError:
            if time.time() - LOCK.stat().st_mtime > 60:
                LOCK.unlink(missing_ok=True)
            time.sleep(0.1)
    raise SystemExit("could not acquire the ARB lock")


def main(paths: list[str]) -> None:
    allow_update = "--update" in paths
    paths = [p for p in paths if p != "--update"]
    fd = _lock()
    try:
        arb = json.loads(EN.read_text(encoding="utf-8"))
        added = updated = 0
        for p in paths:
            frag = json.loads(Path(p).read_text(encoding="utf-8"))
            for key, spec in frag.items():
                if not isinstance(spec, dict) or "text" not in spec or "description" not in spec:
                    raise SystemExit(f"{p}: {key} needs text and description")
                meta: dict = {"description": spec["description"]}
                if spec.get("placeholders"):
                    meta["placeholders"] = spec["placeholders"]
                if key in arb:
                    if arb[key] != spec["text"] and not allow_update:
                        raise SystemExit(f"{key} already exists with other text; pick a new key (or pass --update)")
                    updated += 1
                else:
                    added += 1
                arb[key] = spec["text"]
                arb["@" + key] = meta
        EN.write_bytes((json.dumps(arb, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
        print(f"app_en.arb: {added} added, {updated} updated, {sum(1 for k in arb if not k.startswith('@'))} keys")
    finally:
        os.close(fd)
        LOCK.unlink(missing_ok=True)


if __name__ == "__main__":
    main(sys.argv[1:])
