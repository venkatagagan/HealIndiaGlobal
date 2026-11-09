"""payout account verifier must differ from submitter (SEC-003)

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-21

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0007"
down_revision: str | Sequence[str] | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_check_constraint(
        "verify_maker_checker",
        "payout_accounts",
        "verified_by IS NULL OR submitted_by IS NULL OR verified_by <> submitted_by",
    )


def downgrade() -> None:
    op.drop_constraint("verify_maker_checker", "payout_accounts", type_="check")
