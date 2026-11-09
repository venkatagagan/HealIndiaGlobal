"""Finance ledger adjustments under maker-checker (tax remittance, FX differences, manual corrections).

Flow: ``POST /finance/ledger/adjustments`` stores a *pending* request (validated, nothing posted); a different
finance user approves it (``.../approve``) which posts one balanced transaction
(``adjustment:<id>``; txn type ``tax_remittance`` / ``fx_difference`` / ``adjustment``); or anyone in finance
rejects it. Every step is audited. Nothing here commits.

Rules per kind (docs/PAYMENTS.md 7.4):
* ``tax_remittance`` - debit only ``TAX:*`` accounts, credit only ``PLATFORM:BANK`` (GST / TDS paid to the
  government, PAYMENTS S8).
* ``fx_difference`` - must use ``PLATFORM:FX_GAIN_LOSS`` (debit = loss, credit = gain) against escrow,
  bank or a gateway receivable.
* ``manual`` - must use ``PLATFORM:ADJUSTMENTS`` (expense) or ``PLATFORM:EQUITY`` (capital in/out).
* Never: payee payables (``HOSPITAL:/AGENT:/VENDOR:...:PAYABLE``) - settlement items are derived from
  booking postings, so payables are corrected through refunds/clawbacks, not ad-hoc entries.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any

from fastapi import Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit_log
from app.core.enums import LedgerTxnType
from app.core.errors import BadRequest, Conflict, Forbidden, NotFound
from app.models.identity import User
from app.models.ledger import LedgerAdjustment
from app.modules.ledger.service import (
    ADJUSTMENTS,
    BANK,
    EQUITY,
    FX_GAIN_LOSS,
    InvalidAccountCode,
    LedgerValidationError,
    _normalize_entries,
    post_transaction,
)

TXN_TYPES: dict[str, LedgerTxnType] = {
    "tax_remittance": LedgerTxnType.TAX_REMITTANCE,
    "fx_difference": LedgerTxnType.FX_DIFFERENCE,
    "manual": LedgerTxnType.ADJUSTMENT,
}
_PAYABLE_PREFIXES = ("HOSPITAL:", "AGENT:", "VENDOR:")


def _v(value: object) -> str:
    return str(getattr(value, "value", value))


def validate_adjustment(kind: str, entries: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    """Normalise and validate the entries for ``kind``; raises ``BadRequest`` (400 ``invalid_adjustment``)."""
    try:
        raw = [(str(e["account_code"]), _v(e["direction"]), e["amount_minor"]) for e in entries]
        normalized = _normalize_entries(raw)
    except (KeyError, InvalidAccountCode, LedgerValidationError) as exc:
        raise BadRequest(str(exc), code="invalid_adjustment") from exc
    codes = {code for code, _, _ in normalized}
    if any(code.startswith(_PAYABLE_PREFIXES) for code in codes):
        raise BadRequest(
            "Payee payables cannot be adjusted manually; use refunds, clawbacks or settlement holds",
            code="invalid_adjustment",
        )
    if kind == "tax_remittance":
        for code, direction, _ in normalized:
            debit = _v(direction) == "debit"
            if debit and not code.startswith("TAX:"):
                raise BadRequest("A tax remittance debits TAX:* accounts only", code="invalid_adjustment")
            if not debit and code != BANK:
                raise BadRequest(f"A tax remittance credits {BANK} only", code="invalid_adjustment")
    elif kind == "fx_difference":
        if FX_GAIN_LOSS not in codes:
            raise BadRequest(f"An FX difference must use {FX_GAIN_LOSS}", code="invalid_adjustment")
    elif kind == "manual":
        if not codes & {ADJUSTMENTS, EQUITY}:
            raise BadRequest(
                f"A manual adjustment must use {ADJUSTMENTS} or {EQUITY}", code="invalid_adjustment"
            )
    else:
        raise BadRequest(f"Unknown adjustment kind {kind!r}", code="invalid_adjustment")
    return [
        {"account_code": code, "direction": _v(direction), "amount_minor": amount}
        for code, direction, amount in normalized
    ]


def _snapshot(adj: LedgerAdjustment) -> dict[str, Any]:
    return {
        "kind": adj.kind,
        "status": adj.status,
        "amount_minor": adj.amount_minor,
        "entries": adj.entries,
        "external_reference": adj.external_reference,
    }


async def request_adjustment(
    db: AsyncSession,
    actor: User,
    *,
    kind: str,
    description: str,
    entries: Sequence[dict[str, Any]],
    external_reference: str | None = None,
    request: Request | None = None,
) -> LedgerAdjustment:
    normalized = validate_adjustment(kind, entries)
    adj = LedgerAdjustment(
        kind=kind,
        status="pending_approval",
        description=description,
        external_reference=external_reference,
        entries=normalized,
        amount_minor=sum(e["amount_minor"] for e in normalized if e["direction"] == "debit"),
        requested_by=actor.id,
    )
    db.add(adj)
    await db.flush()
    await audit_log(
        db,
        actor=actor,
        action="ledger_adjustment.request",
        entity_type="ledger_adjustment",
        entity_id=adj.id,
        after=_snapshot(adj),
        request=request,
    )
    return adj


async def _get_locked(db: AsyncSession, adjustment_id: uuid.UUID) -> LedgerAdjustment:
    adj = (
        await db.execute(
            select(LedgerAdjustment)
            .where(LedgerAdjustment.id == adjustment_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if adj is None:
        raise NotFound("Ledger adjustment not found")
    return adj


async def approve_adjustment(
    db: AsyncSession, actor: User, adjustment_id: uuid.UUID, request: Request | None = None
) -> LedgerAdjustment:
    """Maker-checker: the approver must differ from the requester (403 ``maker_checker``)."""
    adj = await _get_locked(db, adjustment_id)
    if adj.status != "pending_approval":
        raise Conflict(f"Adjustment is {adj.status}", code="invalid_state")
    if adj.requested_by == actor.id:
        raise Forbidden("The user who requested an adjustment cannot approve it", code="maker_checker")
    entries = validate_adjustment(adj.kind, adj.entries)
    txn = await post_transaction(
        db,
        txn_type=TXN_TYPES[adj.kind],
        reference_type="ledger_adjustment",
        reference_id=adj.id,
        idempotency_key=f"adjustment:{adj.id}",
        description=(
            f"{adj.description} [{adj.external_reference}]" if adj.external_reference else adj.description
        ),
        entries=[(e["account_code"], e["direction"], int(e["amount_minor"])) for e in entries],
        created_by=actor.id,
    )
    adj.status = "posted"
    adj.approved_by = actor.id
    adj.approved_at = datetime.now(UTC)
    adj.ledger_transaction_id = txn.id
    await db.flush()
    await audit_log(
        db,
        actor=actor,
        action="ledger_adjustment.approve",
        entity_type="ledger_adjustment",
        entity_id=adj.id,
        before={"status": "pending_approval"},
        after={"status": "posted", "ledger_transaction_id": str(txn.id), "amount_minor": adj.amount_minor},
        request=request,
    )
    return adj


async def reject_adjustment(
    db: AsyncSession, actor: User, adjustment_id: uuid.UUID, reason: str, request: Request | None = None
) -> LedgerAdjustment:
    adj = await _get_locked(db, adjustment_id)
    if adj.status != "pending_approval":
        raise Conflict(f"Adjustment is {adj.status}", code="invalid_state")
    adj.status = "rejected"
    adj.rejection_reason = reason
    await db.flush()
    await audit_log(
        db,
        actor=actor,
        action="ledger_adjustment.reject",
        entity_type="ledger_adjustment",
        entity_id=adj.id,
        before={"status": "pending_approval"},
        after={"status": "rejected", "reason": reason},
        request=request,
    )
    return adj
