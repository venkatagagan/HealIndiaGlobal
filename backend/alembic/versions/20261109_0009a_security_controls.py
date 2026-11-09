"""security controls (SEC-008, SEC-009, SEC-020, SEC-024)

* ``payments.bank_reference`` + UNIQUE (gateway, bank_reference): one bank reference (UTR) settles one order.
* ``users.mfa_last_step``: last accepted TOTP time step (no replay inside the validity window).
* ``fx_rates.pending_rate`` / ``pending_requested_by`` / ``pending_requested_at``: a large FX change waits
  for a second finance approver.
* ``hospitals.pending_profile``: identity / accreditation changes of an approved hospital wait for review.

Revision ID: 0009a
Revises: 0008
Create Date: 2026-11-09 12:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0009a"
down_revision: str | Sequence[str] | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("payments", sa.Column("bank_reference", sa.String(length=100), nullable=True))
    op.create_unique_constraint(
        "uq_payments_gateway_bank_reference", "payments", ["gateway", "bank_reference"]
    )

    op.add_column("users", sa.Column("mfa_last_step", sa.BigInteger(), nullable=True))

    op.add_column("fx_rates", sa.Column("pending_rate", sa.Numeric(precision=18, scale=8), nullable=True))
    op.add_column("fx_rates", sa.Column("pending_requested_by", sa.UUID(), nullable=True))
    op.add_column("fx_rates", sa.Column("pending_requested_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index(
        op.f("ix_fx_rates_pending_requested_by"), "fx_rates", ["pending_requested_by"], unique=False
    )
    op.create_foreign_key(
        op.f("fk_fx_rates_pending_requested_by_users"),
        "fx_rates",
        "users",
        ["pending_requested_by"],
        ["id"],
        ondelete="SET NULL",
    )

    op.add_column(
        "hospitals",
        sa.Column(
            "pending_profile",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("hospitals", "pending_profile")

    op.drop_constraint(op.f("fk_fx_rates_pending_requested_by_users"), "fx_rates", type_="foreignkey")
    op.drop_index(op.f("ix_fx_rates_pending_requested_by"), table_name="fx_rates")
    op.drop_column("fx_rates", "pending_requested_at")
    op.drop_column("fx_rates", "pending_requested_by")
    op.drop_column("fx_rates", "pending_rate")

    op.drop_column("users", "mfa_last_step")

    op.drop_constraint("uq_payments_gateway_bank_reference", "payments", type_="unique")
    op.drop_column("payments", "bank_reference")
