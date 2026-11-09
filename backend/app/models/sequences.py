"""PostgreSQL sequences backing human-readable document numbers (PLAN section 3).

``await next_number(db, "case")`` -> ``"HIG-C-2026-000123"``; ``"invoice"`` -> ``"HIG2627000001"`` and
``"credit_note"`` -> ``"HCN2627000001"``, ``"statement"`` (agent commission statements) ->
``"HAS2627000001"`` (prefix + Indian financial year April-March in IST + serial).
Invoice and credit-note numbers stay within the 16-character limit of GST Rule 46 (13 characters up to serial
999,999; 14 beyond). Sequences are global and never reset, so numbers are unique even across years.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta, timezone
from typing import Literal

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.base import Base

__all__ = [
    "IST",
    "NUMBER_SEQUENCES",
    "NumberKind",
    "financial_year",
    "format_number",
    "next_number",
]

IST = timezone(timedelta(hours=5, minutes=30), "IST")

NumberKind = Literal["case", "booking", "order", "batch", "invoice", "credit_note", "statement"]

case_number_seq = sa.Sequence("case_number_seq", start=1, metadata=Base.metadata)
booking_number_seq = sa.Sequence("booking_number_seq", start=1, metadata=Base.metadata)
order_number_seq = sa.Sequence("order_number_seq", start=1, metadata=Base.metadata)
batch_number_seq = sa.Sequence("batch_number_seq", start=1, metadata=Base.metadata)
invoice_number_seq = sa.Sequence("invoice_number_seq", start=1, metadata=Base.metadata)
credit_note_number_seq = sa.Sequence("credit_note_number_seq", start=1, metadata=Base.metadata)
statement_number_seq = sa.Sequence("statement_number_seq", start=1, metadata=Base.metadata)

NUMBER_SEQUENCES: dict[str, sa.Sequence] = {
    "case": case_number_seq,
    "booking": booking_number_seq,
    "order": order_number_seq,
    "batch": batch_number_seq,
    "invoice": invoice_number_seq,
    "credit_note": credit_note_number_seq,
    "statement": statement_number_seq,
}

# GST document series (Rule 46: at most 16 characters, unique per financial year).
_GST_SERIES_PREFIX = {"invoice": "HIG", "credit_note": "HCN", "statement": "HAS"}

_PREFIX = {"case": "HIG-C", "booking": "HIG-B", "order": "HIG-P", "batch": "HIG-S"}


def financial_year(at: datetime) -> str:
    """Indian financial year label (April-March, IST): 2026-10-21 and 2027-02-01 -> ``"2026-27"``."""
    local = at.astimezone(IST) if at.tzinfo else at
    start = local.year if local.month >= 4 else local.year - 1
    return f"{start}-{(start + 1) % 100:02d}"


def format_number(kind: str, value: int, at: datetime | None = None) -> str:
    """Pure formatter used by :func:`next_number` (exposed for tests and seeds)."""
    moment = at or datetime.now(UTC)
    if kind in _GST_SERIES_PREFIX:
        fy = financial_year(moment)  # "2026-27" -> "2627"
        return f"{_GST_SERIES_PREFIX[kind]}{fy[2:4]}{fy[5:7]}{value:06d}"
    try:
        prefix = _PREFIX[kind]
    except KeyError:
        raise ValueError(f"unknown number kind: {kind!r}") from None
    year = (moment.astimezone(IST) if moment.tzinfo else moment).year
    return f"{prefix}-{year}-{value:06d}"


async def next_number(db: AsyncSession, kind: NumberKind | str, *, at: datetime | None = None) -> str:
    """Draw the next value from the kind's sequence and format it.

    Sequences are non-transactional: a rolled-back transaction leaves a gap, which is acceptable for these
    identifiers (GST invoice series only require uniqueness and ordering).
    """
    seq = NUMBER_SEQUENCES.get(kind)
    if seq is None:
        raise ValueError(f"unknown number kind: {kind!r}")
    value = (await db.execute(sa.select(seq.next_value()))).scalar_one()
    return format_number(kind, int(value), at)
