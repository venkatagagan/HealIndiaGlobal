"""Double-entry, immutable ledger in INR (PLAN 4.12).

Database guarantees (installed by ``after_create`` on ``ledger_entries`` and, identically, by the Alembic
migration via :data:`LEDGER_DDL`):

* a DEFERRABLE INITIALLY DEFERRED constraint trigger checks, at COMMIT, that every transaction touched in the
  database transaction has sum(debit) = sum(credit) (SQLSTATE 23514 -> ``IntegrityError``);
* BEFORE UPDATE/DELETE row triggers make ``ledger_entries`` and ``ledger_transactions`` append-only
  (SQLSTATE 23001 -> ``IntegrityError``). ``TRUNCATE`` (test cleanup) is unaffected.

Corrections are posted as new reversing transactions, never by editing rows.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy import DDL, BigInteger, DateTime, String, Text, event, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import EntryDirection, LedgerAccountType, LedgerOwnerType, LedgerTxnType, sa_enum
from app.models.base import Base, CreatedAtMixin, TimestampMixin, UUIDPkMixin, currency_col, fk

__all__ = [
    "ADJUSTMENT_KINDS",
    "ADJUSTMENT_STATUSES",
    "LEDGER_DDL",
    "LEDGER_DROP_DDL",
    "LedgerAccount",
    "LedgerAdjustment",
    "LedgerEntry",
    "LedgerTransaction",
]


class LedgerAccount(UUIDPkMixin, TimestampMixin, Base):
    """``balance_minor`` is a cached balance in the account's normal-balance sign (assets/expenses
    debit-positive; liabilities/revenue/equity credit-positive), maintained by the ledger service."""

    __tablename__ = "ledger_accounts"
    __table_args__ = (sa.Index("ix_ledger_accounts_owner", "owner_type", "owner_id"),)

    code: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    type: Mapped[LedgerAccountType] = mapped_column(sa_enum(LedgerAccountType), nullable=False, index=True)
    owner_type: Mapped[LedgerOwnerType] = mapped_column(sa_enum(LedgerOwnerType), nullable=False)
    owner_id: Mapped[uuid.UUID | None] = mapped_column(sa.UUID(as_uuid=True))
    currency: Mapped[str] = currency_col("INR")
    balance_minor: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default="0")


class LedgerTransaction(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "ledger_transactions"
    __table_args__ = (sa.Index("ix_ledger_transactions_reference", "reference_type", "reference_id"),)

    txn_type: Mapped[LedgerTxnType] = mapped_column(sa_enum(LedgerTxnType), nullable=False, index=True)
    reference_type: Mapped[str | None] = mapped_column(String(60))
    reference_id: Mapped[uuid.UUID | None] = mapped_column(sa.UUID(as_uuid=True))
    description: Mapped[str | None] = mapped_column(Text)
    idempotency_key: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    posted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )
    # RESTRICT (not SET NULL): an ON DELETE SET NULL would UPDATE an immutable row.
    created_by: Mapped[uuid.UUID | None] = fk("users.id", ondelete="RESTRICT", nullable=True)

    entries: Mapped[list[LedgerEntry]] = relationship(
        "LedgerEntry", back_populates="transaction", lazy="raise", order_by="LedgerEntry.id"
    )


class LedgerEntry(UUIDPkMixin, CreatedAtMixin, Base):
    __tablename__ = "ledger_entries"
    __table_args__ = (
        sa.CheckConstraint("amount_minor > 0", name="amount_positive"),
        sa.Index("ix_ledger_entries_account_id_created_at", "account_id", "created_at"),
    )

    transaction_id: Mapped[uuid.UUID] = fk("ledger_transactions.id", ondelete="RESTRICT")
    account_id: Mapped[uuid.UUID] = fk("ledger_accounts.id", ondelete="RESTRICT")
    direction: Mapped[EntryDirection] = mapped_column(sa_enum(EntryDirection), nullable=False)
    amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    currency: Mapped[str] = currency_col("INR")

    transaction: Mapped[LedgerTransaction] = relationship(
        "LedgerTransaction", back_populates="entries", lazy="raise"
    )


ADJUSTMENT_KINDS = ("tax_remittance", "fx_difference", "manual")
ADJUSTMENT_STATUSES = ("pending_approval", "posted", "rejected")


class LedgerAdjustment(UUIDPkMixin, TimestampMixin, Base):
    """A finance-requested ledger posting (tax remittance, FX difference, manual correction) under
    maker-checker: requested by one finance user, posted only when a *different* finance user approves it.
    ``entries`` holds ``[{"account_code", "direction", "amount_minor"}]`` (validated at request time and again
    when posting). Not in PLAN 4.12 (implementation table; docs/PAYMENTS.md 7.4)."""

    __tablename__ = "ledger_adjustments"
    __table_args__ = (
        sa.CheckConstraint("kind IN ('tax_remittance', 'fx_difference', 'manual')", name="kind_valid"),
        sa.CheckConstraint("status IN ('pending_approval', 'posted', 'rejected')", name="status_valid"),
        sa.CheckConstraint("amount_minor > 0", name="amount_positive"),
        sa.Index("ix_ledger_adjustments_status_created_at", "status", "created_at"),
    )

    kind: Mapped[str] = mapped_column(String(30), nullable=False)
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="pending_approval", server_default="pending_approval"
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)
    external_reference: Mapped[str | None] = mapped_column(String(100))  # challan / bank ref / memo id
    entries: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False)
    amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)  # sum of debits
    requested_by: Mapped[uuid.UUID] = fk("users.id", ondelete="RESTRICT")
    approved_by: Mapped[uuid.UUID | None] = fk("users.id", ondelete="RESTRICT", nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejection_reason: Mapped[str | None] = mapped_column(Text)
    ledger_transaction_id: Mapped[uuid.UUID | None] = fk(
        "ledger_transactions.id", ondelete="RESTRICT", nullable=True
    )


# ------------------------------------------------------------------------------------------------- DDL
# Kept free of '%' and ':' so the same strings work with DDL(), op.execute() and text().
LEDGER_DDL: list[str] = [
    """
CREATE OR REPLACE FUNCTION ledger_assert_balanced() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_debit  numeric;
    v_credit numeric;
BEGIN
    SELECT COALESCE(SUM(amount_minor) FILTER (WHERE direction = 'debit'), 0),
           COALESCE(SUM(amount_minor) FILTER (WHERE direction = 'credit'), 0)
      INTO v_debit, v_credit
      FROM ledger_entries
     WHERE transaction_id = NEW.transaction_id;
    IF v_debit <> v_credit THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'ledger transaction ' || NEW.transaction_id || ' is unbalanced (debit '
                      || v_debit || ', credit ' || v_credit || ')',
            CONSTRAINT = 'ledger_entries_balanced';
    END IF;
    RETURN NULL;
END;
$$
""".strip(),
    """
CREATE OR REPLACE FUNCTION ledger_reject_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION USING
        ERRCODE = '23001',
        MESSAGE = TG_TABLE_NAME || ' rows are immutable (' || TG_OP
                  || ' rejected); post a reversing transaction';
END;
$$
""".strip(),
    "DROP TRIGGER IF EXISTS ledger_entries_balanced ON ledger_entries",
    """
CREATE CONSTRAINT TRIGGER ledger_entries_balanced
    AFTER INSERT ON ledger_entries
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION ledger_assert_balanced()
""".strip(),
    "DROP TRIGGER IF EXISTS ledger_entries_immutable ON ledger_entries",
    """
CREATE TRIGGER ledger_entries_immutable
    BEFORE UPDATE OR DELETE ON ledger_entries
    FOR EACH ROW EXECUTE FUNCTION ledger_reject_mutation()
""".strip(),
    "DROP TRIGGER IF EXISTS ledger_transactions_immutable ON ledger_transactions",
    """
CREATE TRIGGER ledger_transactions_immutable
    BEFORE UPDATE OR DELETE ON ledger_transactions
    FOR EACH ROW EXECUTE FUNCTION ledger_reject_mutation()
""".strip(),
]
"""Statements to run (in order) after ``ledger_transactions`` and ``ledger_entries`` exist."""

LEDGER_DROP_DDL: list[str] = [
    "DROP TRIGGER IF EXISTS ledger_transactions_immutable ON ledger_transactions",
    "DROP TRIGGER IF EXISTS ledger_entries_immutable ON ledger_entries",
    "DROP TRIGGER IF EXISTS ledger_entries_balanced ON ledger_entries",
    "DROP FUNCTION IF EXISTS ledger_reject_mutation()",
    "DROP FUNCTION IF EXISTS ledger_assert_balanced()",
]
"""Reverse of :data:`LEDGER_DDL` (for Alembic downgrade)."""

# ledger_entries is created after ledger_transactions (FK dependency), so both tables exist here.
for _stmt in LEDGER_DDL:
    event.listen(LedgerEntry.__table__, "after_create", DDL(_stmt))
