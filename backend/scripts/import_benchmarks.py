"""Import home-country cost benchmarks (with their sources) from a JSON file.

Run from ``backend/``::

    python -m scripts.import_benchmarks path/to/benchmarks.json            # upsert
    python -m scripts.import_benchmarks path/to/benchmarks.json --dry-run  # validate + report only
    python scripts/import_benchmarks.py path/to/benchmarks.json            # same, as a plain script

File shape::

    {"rows": [{
        "procedure": "total-knee-replacement",       # procedure slug (must exist)
        "country": "GB",                             # ISO 3166-1 alpha-2
        "currency": "GBP",                           # ISO 4217 of the amounts below
        "min": 12000, "max": 15000,
        "amount_unit": "major",                      # "major" (12000 = GBP 12,000) or "minor" (pence)
        "price_year": 2025,                          # optional; defaults to source.year
        "wait_time_text": "18 weeks (NHS target)",   # optional, max 100 chars
        "wait_source": "NHS RTT statistics",         # optional, max 255 chars
        "source": {"title": "...", "url": "https://...", "publisher": "...", "year": 2025},
        "confidence": "high"                         # optional: high | medium | low
    }]}

Rows are upserted by ``(procedure, country)``. Amounts are stored in minor units of the *country's* currency
(``app.core.currency.COUNTRY_CURRENCY``): a row priced in another currency (e.g. USD for Nigeria) is
converted with the platform's FX rates (``fx_rates`` table, else the code defaults); when no rate exists the
row keeps its own currency and a warning is printed. Invalid rows are reported and skipped; ``--strict``
makes any invalid row abort the whole import (exit code 1, nothing written).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path
from typing import Any

if __package__ in (None, ""):  # ``python scripts/import_benchmarks.py``: make ``app`` importable
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402
from sqlalchemy.dialects.postgresql import insert as pg_insert  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession  # noqa: E402

from app.core.currency import currency_for_country  # noqa: E402
from app.core.money import CurrencyError, convert_minor, get_fx_rate, normalize_currency, to_minor  # noqa: E402
from app.models import CostBenchmark, Procedure  # noqa: E402

CONFIDENCE_LEVELS = frozenset({"high", "medium", "low"})
MAX_MINOR = 10**15


class RowError(ValueError):
    pass


@dataclass
class ImportReport:
    inserted: int = 0
    updated: int = 0
    unchanged: int = 0
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def written(self) -> int:
        return self.inserted + self.updated

    def summary(self) -> str:
        return (
            f"{self.inserted} inserted, {self.updated} updated, {self.unchanged} unchanged, "
            f"{len(self.errors)} invalid rows, {len(self.warnings)} warnings"
        )


def _text(value: Any, limit: int) -> str | None:
    if value is None:
        return None
    text = " ".join(str(value).split())
    return text[:limit] or None


def _amount(value: Any, unit: str, ccy: str, label: str) -> int:
    if isinstance(value, bool) or value is None:
        raise RowError(f"{label} is missing")
    try:
        minor = to_minor(value, ccy) if unit == "major" else int(Decimal(str(value)))
    except (CurrencyError, ArithmeticError, ValueError) as exc:
        raise RowError(f"{label} is not a number: {value!r}") from exc
    if minor < 0 or minor > MAX_MINOR:
        raise RowError(f"{label} is out of range: {value!r}")
    return minor


def parse_row(row: Any) -> dict[str, Any]:
    """Validate one JSON row; returns the normalised values (amounts still in the row currency)."""
    if not isinstance(row, dict):
        raise RowError("row must be an object")
    slug = str(row.get("procedure") or "").strip().lower()
    if not slug:
        raise RowError("procedure is missing")
    country = str(row.get("country") or "").strip().upper()
    if len(country) != 2 or not country.isalpha() or not country.isascii():
        raise RowError(f"country must be an ISO 3166-1 alpha-2 code: {row.get('country')!r}")
    try:
        ccy = normalize_currency(str(row.get("currency") or ""))
    except CurrencyError as exc:
        raise RowError(f"currency must be an ISO 4217 code: {row.get('currency')!r}") from exc
    unit = str(row.get("amount_unit") or "major").strip().lower()
    if unit not in ("major", "minor"):
        raise RowError("amount_unit must be 'major' or 'minor'")
    lo = _amount(row.get("min"), unit, ccy, "min")
    hi = _amount(row.get("max", row.get("min")), unit, ccy, "max")
    lo, hi = min(lo, hi), max(lo, hi)
    source = row.get("source") or {}
    if isinstance(source, str):
        source = {"title": source}
    if not isinstance(source, dict):
        raise RowError("source must be an object")
    title = _text(source.get("title"), 255)
    publisher = _text(source.get("publisher"), 255)
    if title and publisher and publisher.lower() not in title.lower():
        title = _text(f"{title} - {publisher}", 255)
    year = row.get("price_year") or source.get("year")
    price_year: int | None = None
    if year not in (None, ""):
        try:
            price_year = int(year)
        except (TypeError, ValueError) as exc:
            raise RowError(f"price_year is not a year: {year!r}") from exc
        if not 1990 <= price_year <= 2100:
            raise RowError(f"price_year is not plausible: {price_year}")
    confidence = _text(row.get("confidence"), 20)
    confidence = confidence.lower() if confidence else None
    if confidence is not None and confidence not in CONFIDENCE_LEVELS:
        raise RowError(f"confidence must be one of high, medium, low: {row.get('confidence')!r}")
    url = _text(source.get("url"), 1024)
    if url and not url.lower().startswith(("https://", "http://")):
        raise RowError(f"source.url must be an http(s) URL: {url!r}")
    return {
        "procedure": slug,
        "country_code": country,
        "currency": ccy,
        "cost_min_minor": lo,
        "cost_max_minor": hi,
        "wait_time_text": _text(row.get("wait_time_text"), 100),
        "wait_source": _text(row.get("wait_source"), 255),
        "source": title or publisher,
        "source_url": url,
        "price_year": price_year,
        "confidence": confidence,
    }


async def _to_country_currency(
    db: AsyncSession, values: dict[str, Any], rates: dict[str, Decimal], report: ImportReport, label: str
) -> dict[str, Any]:
    target = currency_for_country(values["country_code"])
    src = values["currency"]
    if target is None or target == src:
        return values
    try:
        for code in (src, target):
            if code not in rates:
                rates[code] = await get_fx_rate(db, code)
    except CurrencyError:
        report.warnings.append(f"{label}: no FX rate for {src}->{target}; kept in {src}")
        return values
    return {
        **values,
        "currency": target,
        "cost_min_minor": convert_minor(values["cost_min_minor"], src, target, rates[src], rates[target]),
        "cost_max_minor": convert_minor(values["cost_max_minor"], src, target, rates[src], rates[target]),
    }


async def import_rows(
    db: AsyncSession, rows: list[Any], *, dry_run: bool = False, strict: bool = False
) -> ImportReport:
    """Validate and upsert ``rows``. Commits unless ``dry_run`` (or ``strict`` with invalid rows)."""
    report = ImportReport()
    procedures: dict[str, Any] = dict((await db.execute(select(Procedure.slug, Procedure.id))).all())
    benchmarks = (await db.execute(select(CostBenchmark))).scalars()
    existing = {(b.procedure_id, b.country_code.upper()): b for b in benchmarks}
    rates: dict[str, Decimal] = {}
    pending: list[dict[str, Any]] = []
    seen: set[tuple[Any, str]] = set()
    for index, row in enumerate(rows, start=1):
        label = f"row {index}"
        try:
            values = parse_row(row)
        except RowError as exc:
            report.errors.append(f"{label}: {exc}")
            continue
        label = f"row {index} ({values['procedure']}/{values['country_code']})"
        procedure_id = procedures.get(values.pop("procedure"))
        if procedure_id is None:
            report.errors.append(f"{label}: unknown procedure")
            continue
        key = (procedure_id, values["country_code"])
        if key in seen:
            report.warnings.append(f"{label}: duplicate row, the later one wins")
        seen.add(key)
        values = await _to_country_currency(db, values, rates, report, label)
        values["procedure_id"] = procedure_id
        current = existing.get(key)
        if current is None:
            report.inserted += 1
        elif all(getattr(current, k) == v for k, v in values.items()):
            report.unchanged += 1
            continue
        else:
            report.updated += 1
        pending.append(values)
    if dry_run or (strict and report.errors):
        await db.rollback()
        return report
    by_key = {(v["procedure_id"], v["country_code"]): v for v in pending}
    for values in by_key.values():
        stmt = pg_insert(CostBenchmark).values(**values)
        update_cols = {k: stmt.excluded[k] for k in values if k not in ("procedure_id", "country_code")}
        await db.execute(
            stmt.on_conflict_do_update(
                index_elements=[CostBenchmark.procedure_id, CostBenchmark.country_code], set_=update_cols
            )
        )
    await db.commit()
    return report


def load_file(path: Path) -> list[Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    rows = data.get("rows") if isinstance(data, dict) else data
    if not isinstance(rows, list):
        raise SystemExit('The file must be {"rows": [...]} (or a list of rows)')
    return rows


async def _main(args: argparse.Namespace) -> int:
    from app.core.db import SessionLocal, dispose_engine
    from app.modules.catalog.service import invalidate_catalog_cache

    rows = load_file(Path(args.file))
    try:
        async with SessionLocal() as db:
            report = await import_rows(db, rows, dry_run=args.dry_run, strict=args.strict)
        if report.written and not args.dry_run and not (args.strict and report.errors):
            await invalidate_catalog_cache()
    finally:
        await dispose_engine()
    for line in report.errors:
        print(f"ERROR   {line}")
    for line in report.warnings:
        print(f"WARNING {line}")
    mode = "dry run: " if args.dry_run else ""
    aborted = " (aborted: --strict and invalid rows)" if args.strict and report.errors else ""
    print(f"{mode}{len(rows)} rows read; {report.summary()}{aborted}")
    return 1 if report.errors and args.strict else 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Import cost benchmarks from a JSON file.")
    parser.add_argument("file", help='JSON file: {"rows": [...]}')
    parser.add_argument("--dry-run", action="store_true", help="validate and report, write nothing")
    parser.add_argument("--strict", action="store_true", help="write nothing if any row is invalid")
    args = parser.parse_args(argv)
    return asyncio.run(_main(args))


if __name__ == "__main__":
    raise SystemExit(main())
