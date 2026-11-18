"""content translations: admin translations of server-supplied content (catalog, visa guide, tips, benchmarks)

Revision ID: 0010e
Revises: 0009f
Create Date: 2026-11-18 12:00:00.000000

Shipped translations of the seeded content live in ``app/i18n/content/<lng>.json`` (no data migration needed);
this table holds admin edits, which win over them.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0010e"
down_revision: str | Sequence[str] | None = "0010b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_ENTITY_TYPES = (
    "specialty",
    "procedure",
    "hospital",
    "doctor",
    "cultural_tip",
    "cost_benchmark",
    "visa_rule",
    "visa_checklist",
)


def upgrade() -> None:
    op.create_table(
        "content_translations",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("entity_type", sa.String(length=40), nullable=False),
        sa.Column("entity_id", sa.String(length=120), nullable=False),
        sa.Column("field", sa.String(length=60), nullable=False),
        sa.Column("locale", sa.String(length=10), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("updated_by_user_id", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "entity_type IN (" + ", ".join(f"'{e}'" for e in _ENTITY_TYPES) + ")",
            name=op.f("ck_content_translations_entity_type_valid"),
        ),
        sa.CheckConstraint("char_length(text) <= 10000", name=op.f("ck_content_translations_text_length")),
        sa.CheckConstraint("locale <> 'en'", name=op.f("ck_content_translations_not_english")),
        sa.ForeignKeyConstraint(
            ["updated_by_user_id"],
            ["users.id"],
            name=op.f("fk_content_translations_updated_by_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_content_translations")),
        sa.UniqueConstraint(
            "entity_type", "entity_id", "field", "locale", name="uq_content_translations_entity_field_locale"
        ),
    )
    op.create_index(
        "ix_content_translations_locale_entity", "content_translations", ["locale", "entity_id"], unique=False
    )
    op.create_index(
        op.f("ix_content_translations_updated_by_user_id"),
        "content_translations",
        ["updated_by_user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_content_translations_updated_by_user_id"), table_name="content_translations")
    op.drop_index("ix_content_translations_locale_entity", table_name="content_translations")
    op.drop_table("content_translations")
