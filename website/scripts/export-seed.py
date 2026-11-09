"""Export the backend demo seed catalogue to JSON for the website's offline fallback data.

Usage (from the repo root or anywhere):
    <python> -I -B website/scripts/export-seed.py [--backend PATH] [--out PATH]

* Read-only with respect to backend/: ``-B`` stops Python writing ``__pycache__`` files there.
* Standard library only. The seed modules live in ``backend/scripts/seed_data`` and are imported as the
  ``scripts.seed_data`` package, so the backend directory is put on ``sys.path``.
* Only public catalogue fields are exported (no GSTIN/PAN/owner names).
"""

from __future__ import annotations

import argparse
import datetime as _dt
import importlib
import json
import sys
from decimal import Decimal
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
DEFAULT_BACKEND = HERE.parent.parent / "backend"
DEFAULT_OUT = HERE.parent / "src" / "data" / "seed-data.json"

HOSPITAL_PUBLIC_FIELDS = (
    "slug",
    "name",
    "description",
    "city",
    "state",
    "country",
    "address",
    "pincode",
    "lat",
    "lng",
    "logo_url",
    "cover_image_url",
    "accreditations",
    "established_year",
    "bed_count",
    "languages",
    "international_desk",
    "airport_distance_km",
    "rating_avg",
    "rating_count",
    "is_featured",
    "specialties",
    "offerings",
    "price_factor",
)

DOCTOR_PUBLIC_FIELDS = (
    "slug",
    "full_name",
    "gender",
    "photo_url",
    "hospital",
    "hospital_slug",
    "specialty",
    "specialty_slug",
    "sub_specialties",
    "qualifications",
    "experience_years",
    "languages",
    "bio",
    "success_rate_pct",
    "rating_avg",
    "rating_count",
    "consultation_fee_minor",
    "currency",
    "teleconsult_available",
    "procedures",
)


def _plain(value: Any) -> Any:
    """Make seed values JSON-serialisable (Decimal -> str keeps exact rates)."""
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, dict):
        return {str(k): _plain(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set, frozenset)):
        return [_plain(v) for v in value]
    return value


def _pick(row: dict[str, Any], fields: tuple[str, ...]) -> dict[str, Any]:
    return {k: _plain(row[k]) for k in fields if k in row}


def _optional_module(name: str) -> Any | None:
    try:
        return importlib.import_module(name)
    except ModuleNotFoundError:
        return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backend", type=Path, default=DEFAULT_BACKEND)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    backend = args.backend.resolve()
    if not (backend / "scripts" / "seed_data").is_dir():
        print(f"seed data not found under {backend}", file=sys.stderr)
        return 2
    sys.dont_write_bytecode = True
    sys.path.insert(0, str(backend))

    catalog = importlib.import_module("scripts.seed_data.catalog")
    content = importlib.import_module("scripts.seed_data.content")
    hospitals_mod = importlib.import_module("scripts.seed_data.hospitals")
    benchmarks_mod = _optional_module("scripts.seed_data.benchmarks")
    doctors_mod = _optional_module("scripts.seed_data.doctors")

    specialties = []
    for index, row in enumerate(catalog.SPECIALTIES, start=1):
        item = _plain(dict(row))
        item.setdefault("sort_order", index)
        specialties.append(item)

    doctors_raw = None
    for mod in (doctors_mod, hospitals_mod):
        if mod is not None and getattr(mod, "DOCTORS", None):
            doctors_raw = mod.DOCTORS
            break

    # Per-hospital offering prices exactly as the backend seed computes them (when the helper module exists).
    offerings_mod = _optional_module("scripts.seed_data.offerings")
    procedures_by_slug = {p["slug"]: p for p in catalog.PROCEDURES}
    hospitals_out = []
    for raw in hospitals_mod.HOSPITALS:
        item = _pick(dict(raw), HOSPITAL_PUBLIC_FIELDS)
        details = []
        for slug in raw.get("offerings", []):
            proc = procedures_by_slug.get(slug)
            if proc is None:
                continue
            row: dict[str, Any] = {"procedure": slug, "currency": "INR"}
            if offerings_mod is not None:
                low, high = offerings_mod.offering_price_range(raw, proc)
                row.update(
                    price_min_minor=low,
                    price_max_minor=high,
                    success_rate_pct=offerings_mod.offering_success_rate(raw["slug"], proc),
                    inclusions=list(offerings_mod.inclusions_for(proc)),
                    exclusions=list(offerings_mod.exclusions_for(proc)),
                )
            details.append(_plain(row))
        item["offering_details"] = details
        hospitals_out.append(item)

    payload: dict[str, Any] = {
        "generated_at": _dt.datetime.now(_dt.UTC).replace(microsecond=0).isoformat(),
        "source": "backend/scripts/seed_data",
        "note": "Illustrative demo catalogue (fictional hospitals); used only when the API is unavailable.",
        "specialties": specialties,
        "procedures": [_plain(dict(p)) for p in catalog.PROCEDURES],
        "benchmarks": [_plain(dict(b)) for b in getattr(benchmarks_mod, "COST_BENCHMARKS", [])]
        if benchmarks_mod
        else [],
        "hospitals": hospitals_out,
        "doctors": [_pick(dict(d), DOCTOR_PUBLIC_FIELDS) for d in doctors_raw] if doctors_raw else [],
        "fx_rates": _plain(dict(getattr(content, "FX_RATES", {}))),
        "fx_source": getattr(content, "FX_SOURCE", "seed"),
        "cultural_tips": [_plain(dict(t)) for t in getattr(content, "CULTURAL_TIPS", [])],
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(payload, ensure_ascii=False, indent=1)
    args.out.write_text(text + "\n", encoding="utf-8")
    print(
        f"wrote {args.out} - {len(payload['specialties'])} specialties, {len(payload['procedures'])} procedures, "
        f"{len(payload['benchmarks'])} benchmarks, {len(payload['hospitals'])} hospitals, "
        f"{len(payload['doctors'])} doctors"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
