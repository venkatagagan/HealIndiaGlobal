"""multi-language support: languages, translation overrides, English copy of AI patient summaries

Revision ID: 0009f
Revises: 0008
Create Date: 2026-11-09 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0009f"
down_revision: str | Sequence[str] | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_APPS = ("website", "patient_web", "admin", "agent", "hospital", "mobile", "server")

_SEED = (
    # code, name, native_name, rtl, enabled, sort
    ("en", "English", "English", False, True, 0),
    ("ar", "Arabic", "العربية", True, False, 10),
    ("fr", "French", "Français", False, False, 20),
    ("bn", "Bengali", "বাংলা", False, False, 30),
    ("ru", "Russian", "Русский", False, False, 40),
)


def upgrade() -> None:
    languages = op.create_table(
        "languages",
        sa.Column("code", sa.String(length=10), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("native_name", sa.String(length=80), nullable=False),
        sa.Column("rtl", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("enabled", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("sort", sa.Integer(), server_default="0", nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("code", name=op.f("pk_languages")),
    )
    op.bulk_insert(
        languages,
        [
            {"code": c, "name": n, "native_name": nn, "rtl": rtl, "enabled": en, "sort": sort}
            for c, n, nn, rtl, en, sort in _SEED
        ],
    )

    op.create_table(
        "translation_overrides",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("locale", sa.String(length=10), nullable=False),
        sa.Column("app", sa.String(length=20), nullable=False),
        sa.Column("key", sa.String(length=300), nullable=False),
        sa.Column("text", sa.Text(), nullable=True),
        sa.Column("updated_by_user_id", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "app IN (" + ", ".join(f"'{a}'" for a in _APPS) + ")",
            name=op.f("ck_translation_overrides_app_valid"),
        ),
        sa.CheckConstraint(
            "text IS NULL OR char_length(text) <= 5000", name=op.f("ck_translation_overrides_text_length")
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_user_id"],
            ["users.id"],
            name=op.f("fk_translation_overrides_updated_by_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_translation_overrides")),
        sa.UniqueConstraint("locale", "app", "key", name="uq_translation_overrides_locale_app_key"),
    )
    op.create_index(
        "ix_translation_overrides_app_locale", "translation_overrides", ["app", "locale"], unique=False
    )
    op.create_index(
        op.f("ix_translation_overrides_updated_by_user_id"),
        "translation_overrides",
        ["updated_by_user_id"],
        unique=False,
    )

    op.add_column("document_analyses", sa.Column("summary_patient_en", sa.Text(), nullable=True))
    # Existing analyses were written in English (the product was English-only until now).
    op.execute(
        "UPDATE document_analyses SET summary_patient_en = summary_patient "
        "WHERE summary_patient IS NOT NULL AND summary_language = 'en'"
    )


def downgrade() -> None:
    op.drop_column("document_analyses", "summary_patient_en")
    op.drop_index(op.f("ix_translation_overrides_updated_by_user_id"), table_name="translation_overrides")
    op.drop_index("ix_translation_overrides_app_locale", table_name="translation_overrides")
    op.drop_table("translation_overrides")
    op.drop_table("languages")
