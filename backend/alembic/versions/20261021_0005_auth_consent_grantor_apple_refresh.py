"""auth consent grantor apple refresh

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-21

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0005"
down_revision: str | Sequence[str] | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("consents", sa.Column("granted_by_user_id", sa.UUID(), nullable=True))
    op.create_index(op.f("ix_consents_granted_by_user_id"), "consents", ["granted_by_user_id"], unique=False)
    op.create_foreign_key(
        op.f("fk_consents_granted_by_user_id_users"),
        "consents",
        "users",
        ["granted_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.add_column("users", sa.Column("apple_refresh_token", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "apple_refresh_token")
    op.drop_constraint(op.f("fk_consents_granted_by_user_id_users"), "consents", type_="foreignkey")
    op.drop_index(op.f("ix_consents_granted_by_user_id"), table_name="consents")
    op.drop_column("consents", "granted_by_user_id")
