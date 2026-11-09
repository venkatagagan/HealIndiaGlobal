"""doctor registration verification

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-21

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0003"
down_revision: str | Sequence[str] | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("doctors", sa.Column("registration_verified_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("doctors", sa.Column("registration_verified_by_user_id", sa.UUID(), nullable=True))
    op.create_index(
        op.f("ix_doctors_registration_verified_by_user_id"),
        "doctors",
        ["registration_verified_by_user_id"],
        unique=False,
    )
    op.create_foreign_key(
        op.f("fk_doctors_registration_verified_by_user_id_users"),
        "doctors",
        "users",
        ["registration_verified_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("fk_doctors_registration_verified_by_user_id_users"), "doctors", type_="foreignkey"
    )
    op.drop_index(op.f("ix_doctors_registration_verified_by_user_id"), table_name="doctors")
    op.drop_column("doctors", "registration_verified_by_user_id")
    op.drop_column("doctors", "registration_verified_at")
