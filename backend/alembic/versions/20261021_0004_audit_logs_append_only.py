"""audit_logs append-only (SEC-054)

* BEFORE UPDATE/DELETE row trigger on ``audit_logs`` that raises (SQLSTATE 23001), so even the single local role (or
  the table owner) cannot rewrite history. The one exception is the ``ON DELETE SET NULL`` action of
  ``actor_user_id -> users.id``: an update that changes nothing but ``actor_user_id`` to NULL is allowed, otherwise
  hard-deleting a user (erasure) would be impossible. ``TRUNCATE`` (test cleanup / seed --reset) is unaffected.
* ``REVOKE UPDATE, DELETE, TRUNCATE`` on ``audit_logs`` from PUBLIC and from every role holding table privileges other
  than the owner (in the compose setup: the DML-only ``APP_DB_USER``; FK actions run as the owner, so they still work).

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-21

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0004"
down_revision: str | Sequence[str] | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UPGRADE_DDL: list[str] = [
    """
CREATE OR REPLACE FUNCTION audit_logs_reject_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.actor_user_id IS NOT NULL AND NEW.actor_user_id IS NULL
       AND (to_jsonb(NEW) - 'actor_user_id') = (to_jsonb(OLD) - 'actor_user_id') THEN
        RETURN NEW;  -- ON DELETE SET NULL of the actor's user row
    END IF;
    RAISE EXCEPTION USING
        ERRCODE = '23001',
        MESSAGE = 'audit_logs rows are append-only (' || TG_OP || ' rejected)';
END;
$$
""".strip(),
    "DROP TRIGGER IF EXISTS audit_logs_append_only ON audit_logs",
    """
CREATE TRIGGER audit_logs_append_only
    BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION audit_logs_reject_mutation()
""".strip(),
    "REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM PUBLIC",
    """
DO $$
DECLARE
    r text;
BEGIN
    FOR r IN
        SELECT DISTINCT g.grantee FROM information_schema.role_table_grants g
         WHERE g.table_schema = 'public' AND g.table_name = 'audit_logs'
           AND g.privilege_type IN ('UPDATE', 'DELETE', 'TRUNCATE')
           AND g.grantee <> 'PUBLIC'
           AND g.grantee <> (SELECT pg_get_userbyid(c.relowner) FROM pg_class c WHERE c.oid = 'public.audit_logs'::regclass)
    LOOP
        EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM %I', r);
    END LOOP;
END
$$
""".strip(),
]

DOWNGRADE_DDL: list[str] = [
    "DROP TRIGGER IF EXISTS audit_logs_append_only ON audit_logs",
    "DROP FUNCTION IF EXISTS audit_logs_reject_mutation()",
    # Privileges revoked above are not re-granted: re-run infra/postgres/init/02-roles.sh to restore the defaults.
]


def upgrade() -> None:
    for stmt in UPGRADE_DDL:
        op.execute(stmt)


def downgrade() -> None:
    for stmt in DOWNGRADE_DDL:
        op.execute(stmt)
