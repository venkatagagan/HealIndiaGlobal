"""users apple_sub

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-21

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002"
down_revision: str | Sequence[str] | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("apple_sub", sa.String(length=255), nullable=True))
    op.create_unique_constraint(op.f("uq_users_apple_sub"), "users", ["apple_sub"])


def downgrade() -> None:
    op.drop_constraint(op.f("uq_users_apple_sub"), "users", type_="unique")
    op.drop_column("users", "apple_sub")
