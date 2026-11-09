#!/bin/sh
# Heal India Global - least-privilege database roles (INTEGRATION_BACKLOG #21).
#
#   POSTGRES_USER    bootstrap superuser: used ONLY by this script and by operators; never by the application.
#   MIGRATOR_DB_USER owns the database, the public schema and every table (runs `alembic upgrade head` via the
#                    one-off `migrate` service). NOSUPERUSER NOCREATEDB NOCREATEROLE.
#   APP_DB_USER      what api/worker connect as: CONNECT + schema USAGE + SELECT/INSERT/UPDATE/DELETE on tables and
#                    USAGE/SELECT on sequences (granted through default privileges, so new migrations are covered).
#                    No DDL, no TRUNCATE, no ownership - a SQL injection cannot drop or alter the schema.
#
# Runs automatically (docker-entrypoint-initdb.d) when the data volume is first initialised. It is idempotent, so
# for an EXISTING volume (or after rotating a password) re-run it by hand:
#   docker compose -f infra/docker-compose.yml --env-file infra/.env exec postgres \
#     sh /docker-entrypoint-initdb.d/02-roles.sh
# Re-running also hands any objects created earlier by another owner (e.g. tables created when the app still
# connected as the superuser) over to the migrator role.
#
# Passwords travel as psql variables (:'name' quoting), never interpolated into SQL text by the shell. Use URL-safe
# values (hex): they are also embedded in DATABASE_URL.
# The body runs in a subshell function: the image's entrypoint SOURCES non-executable *.sh init files, and
# `set -eu` / `exit` must not leak into it.
hig_roles_main() (
set -eu

: "${POSTGRES_USER:?}" "${POSTGRES_DB:?}"
: "${APP_DB_USER:?set APP_DB_USER}" "${APP_DB_PASSWORD:?set APP_DB_PASSWORD}"
: "${MIGRATOR_DB_USER:?set MIGRATOR_DB_USER}" "${MIGRATOR_DB_PASSWORD:?set MIGRATOR_DB_PASSWORD}"

if [ "$APP_DB_USER" = "$POSTGRES_USER" ] || [ "$MIGRATOR_DB_USER" = "$POSTGRES_USER" ] || [ "$APP_DB_USER" = "$MIGRATOR_DB_USER" ]; then
  echo "02-roles.sh: POSTGRES_USER, MIGRATOR_DB_USER and APP_DB_USER must be three different roles" >&2
  exit 1
fi

psql -v ON_ERROR_STOP=1 -X -q \
  -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -v db="$POSTGRES_DB" \
  -v app_user="$APP_DB_USER" -v app_password="$APP_DB_PASSWORD" \
  -v migrator_user="$MIGRATOR_DB_USER" -v migrator_password="$MIGRATOR_DB_PASSWORD" <<'SQL'
-- psql variables are not expanded inside $$ bodies: pass them in through custom GUCs.
-- (\gset stores the result row in psql variables instead of printing it.)
SELECT set_config('hig.app_user', :'app_user', false) AS _app,
       set_config('hig.migrator_user', :'migrator_user', false) AS _migrator \gset

DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY[current_setting('hig.migrator_user'), current_setting('hig.app_user')] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', r);
    ELSE
      EXECUTE format('ALTER ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', r);
    END IF;
  END LOOP;
END
$$;

ALTER ROLE :"migrator_user" PASSWORD :'migrator_password';
ALTER ROLE :"app_user" PASSWORD :'app_password';
ALTER ROLE :"app_user" CONNECTION LIMIT 300;

-- Database + schema ownership -> migrator; nobody else gets implicit rights.
ALTER DATABASE :"db" OWNER TO :"migrator_user";
REVOKE ALL ON DATABASE :"db" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"db" TO :"app_user";
ALTER SCHEMA public OWNER TO :"migrator_user";
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO :"app_user";

-- Hand existing objects (not extension members) over to the migrator, so later migrations can alter them.
DO $$
DECLARE
  m text := current_setting('hig.migrator_user');
  o record;
BEGIN
  FOR o IN
    SELECT c.oid, c.relname, c.relkind FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace
      AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
      AND pg_get_userbyid(c.relowner) <> m
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e')
    ORDER BY c.relkind = 'S'          -- tables first: their owned (serial/identity) sequences follow them
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I OWNER TO %I', o.relname, m);
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'skipped %: %', o.relname, SQLERRM;
    END;
  END LOOP;
  FOR o IN
    SELECT t.oid FROM pg_type t
    WHERE t.typnamespace = 'public'::regnamespace AND t.typtype IN ('e', 'd')   -- enums, domains
      AND pg_get_userbyid(t.typowner) <> m
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_type'::regclass AND d.objid = t.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('ALTER TYPE %s OWNER TO %I', o.oid::regtype, m);
  END LOOP;
  FOR o IN
    SELECT p.oid FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND pg_get_userbyid(p.proowner) <> m
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('ALTER ROUTINE %s OWNER TO %I', o.oid::regprocedure, m);
  END LOOP;
END
$$;

-- Data access for the application role: existing objects ...
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"app_user";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :"app_user";
GRANT EXECUTE ON ALL ROUTINES IN SCHEMA public TO :"app_user";
-- ... and everything the migrator creates from now on.
ALTER DEFAULT PRIVILEGES FOR ROLE :"migrator_user" IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_user";
ALTER DEFAULT PRIVILEGES FOR ROLE :"migrator_user" IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO :"app_user";
ALTER DEFAULT PRIVILEGES FOR ROLE :"migrator_user" IN SCHEMA public
  GRANT EXECUTE ON ROUTINES TO :"app_user";

-- audit_logs is append-only for the application (SEC-054). On a fresh volume the table does not exist yet: Alembic
-- revision 0004 revokes these privileges (and adds the append-only trigger) when it creates/updates the schema; this
-- block re-applies the revoke when the script is re-run on an existing database (the GRANT above re-adds them).
DO $$
BEGIN
  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM %I', current_setting('hig.app_user'));
  END IF;
END
$$;

-- Read-only diagnostics without superuser: pg_stat_statements / pg_stat_activity of all sessions.
GRANT pg_read_all_stats TO :"migrator_user";
SQL

echo "02-roles.sh: roles '$MIGRATOR_DB_USER' (owner/migrations) and '$APP_DB_USER' (application, DML only) ready"
)

hig_roles_main
