"""finance payout controls

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-21

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0006"
down_revision: str | Sequence[str] | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("payout_accounts", sa.Column("submitted_by", sa.UUID(), nullable=True))
    op.add_column("payout_accounts", sa.Column("verified_by", sa.UUID(), nullable=True))
    op.add_column("payout_accounts", sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index(
        op.f("ix_payout_accounts_submitted_by"), "payout_accounts", ["submitted_by"], unique=False
    )
    op.create_index(op.f("ix_payout_accounts_verified_by"), "payout_accounts", ["verified_by"], unique=False)
    op.create_foreign_key(
        op.f("fk_payout_accounts_submitted_by_users"),
        "payout_accounts",
        "users",
        ["submitted_by"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        op.f("fk_payout_accounts_verified_by_users"),
        "payout_accounts",
        "users",
        ["verified_by"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.add_column("payouts", sa.Column("account_fingerprint", sa.String(length=64), nullable=True))
    op.add_column("payouts", sa.Column("gateway_attempted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("payouts", sa.Column("reversal_requested_by", sa.UUID(), nullable=True))
    op.add_column("payouts", sa.Column("reversal_requested_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("payouts", sa.Column("reversal_reason", sa.Text(), nullable=True))
    op.add_column("payouts", sa.Column("reversal_reference", sa.String(length=100), nullable=True))
    op.create_index(
        op.f("ix_payouts_reversal_requested_by"), "payouts", ["reversal_requested_by"], unique=False
    )
    op.create_foreign_key(
        op.f("fk_payouts_reversal_requested_by_users"),
        "payouts",
        "users",
        ["reversal_requested_by"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.add_column(
        "settlement_batches",
        sa.Column("payout_accounts_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("settlement_batches", "payout_accounts_snapshot")
    op.drop_constraint(op.f("fk_payouts_reversal_requested_by_users"), "payouts", type_="foreignkey")
    op.drop_index(op.f("ix_payouts_reversal_requested_by"), table_name="payouts")
    op.drop_column("payouts", "reversal_reference")
    op.drop_column("payouts", "reversal_reason")
    op.drop_column("payouts", "reversal_requested_at")
    op.drop_column("payouts", "reversal_requested_by")
    op.drop_column("payouts", "gateway_attempted_at")
    op.drop_column("payouts", "account_fingerprint")
    op.drop_constraint(op.f("fk_payout_accounts_verified_by_users"), "payout_accounts", type_="foreignkey")
    op.drop_constraint(op.f("fk_payout_accounts_submitted_by_users"), "payout_accounts", type_="foreignkey")
    op.drop_index(op.f("ix_payout_accounts_verified_by"), table_name="payout_accounts")
    op.drop_index(op.f("ix_payout_accounts_submitted_by"), table_name="payout_accounts")
    op.drop_column("payout_accounts", "verified_at")
    op.drop_column("payout_accounts", "verified_by")
    op.drop_column("payout_accounts", "submitted_by")
