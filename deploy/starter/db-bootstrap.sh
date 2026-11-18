#!/bin/bash
# Least-privilege roles on Amazon RDS - the RDS counterpart of infra/postgres/init/02-roles.sh (same model,
# INTEGRATION_BACKLOG #21):
#
#   master   (RDS-managed secret)  rds_superuser; this script and break-glass only, never the application
#   MIGRATOR_DB_USER               owns the database, the public schema and every table; runs migrations only
#   APP_DB_USER                    api + worker: CONNECT, schema USAGE, SELECT/INSERT/UPDATE/DELETE, sequences;
#                                  no DDL, no TRUNCATE; audit_logs is append-only (SEC-054)
#
# Also creates the extensions the schema needs (citext, pg_trgm, btree_gin, pgcrypto, pg_stat_statements; see
# infra/postgres/init/01-extensions.sql). Idempotent: deploy.sh runs it on every deploy while Terraform's
# bootstrap_mode = true (it needs the master secret); re-running re-applies passwords and grants.
#
# psql runs in a throw-away postgres:17 container on the box; passwords reach psql through environment variables
# (\getenv), never through command-line arguments. TLS is required (rds.force_ssl = 1).
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/starter/common.sh
. "$here/common.sh"

PSQL_IMAGE="${PSQL_IMAGE:-public.ecr.aws/docker/library/postgres:17-alpine}"

[ -n "${HIG_CONFIG:-}" ] || load_config
master="$(secret_json "$(cfg .db_master_secret_arn)")"
generated="$(secret_json "$(cfg .generated_secret_id)")"

PGHOST="$(cfg .db_host)"
PGPORT="$(cfg .db_port)"
PGDATABASE="$(cfg .db_name)"
PGUSER="$(jq -r '.username // empty' <<<"$master")"
PGPASSWORD="$(jq -r '.password // empty' <<<"$master")"
APP_DB_USER="$(cfg .db_app_user)"
MIGRATOR_DB_USER="$(cfg .db_migrator_user)"
APP_DB_PASSWORD="$(jq -r '.APP_DB_PASSWORD // empty' <<<"$generated")"
MIGRATOR_DB_PASSWORD="$(jq -r '.MIGRATOR_DB_PASSWORD // empty' <<<"$generated")"
PGSSLMODE=require
export PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD PGSSLMODE
export APP_DB_USER APP_DB_PASSWORD MIGRATOR_DB_USER MIGRATOR_DB_PASSWORD

[ -n "$PGUSER" ] && [ -n "$PGPASSWORD" ] || die "RDS master secret unreadable"
[ -n "$APP_DB_PASSWORD" ] && [ -n "$MIGRATOR_DB_PASSWORD" ] || die "run init-secrets.sh first"
if [ "$APP_DB_USER" = "$PGUSER" ] || [ "$MIGRATOR_DB_USER" = "$PGUSER" ] || [ "$APP_DB_USER" = "$MIGRATOR_DB_USER" ]; then
  die "master, migrator and app must be three different roles"
fi

log "db-bootstrap: roles $MIGRATOR_DB_USER (owner) and $APP_DB_USER (DML) on $PGHOST/$PGDATABASE"
docker run --rm -i --network host \
  -e PGHOST -e PGPORT -e PGDATABASE -e PGUSER -e PGPASSWORD -e PGSSLMODE \
  -e APP_DB_USER -e APP_DB_PASSWORD -e MIGRATOR_DB_USER -e MIGRATOR_DB_PASSWORD \
  "$PSQL_IMAGE" psql -v ON_ERROR_STOP=1 -X -q <<'SQL'
\getenv app_user APP_DB_USER
\getenv app_password APP_DB_PASSWORD
\getenv migrator_user MIGRATOR_DB_USER
\getenv migrator_password MIGRATOR_DB_PASSWORD
\getenv db PGDATABASE

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

SELECT set_config('hig.app_user', :'app_user', false) AS _app,
       set_config('hig.migrator_user', :'migrator_user', false) AS _migrator \gset

-- RDS: the master user has CREATEROLE but is not a superuser, so only the attributes it may set are listed
-- (new roles default to NOSUPERUSER NOREPLICATION NOBYPASSRLS).
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY[current_setting('hig.migrator_user'), current_setting('hig.app_user')] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('CREATE ROLE %I LOGIN NOCREATEDB NOCREATEROLE', r);
    ELSE
      EXECUTE format('ALTER ROLE %I LOGIN NOCREATEDB NOCREATEROLE', r);
    END IF;
  END LOOP;
END
$$;

ALTER ROLE :"migrator_user" PASSWORD :'migrator_password';
ALTER ROLE :"app_user" PASSWORD :'app_password';
-- db.t4g.small allows ~200 connections: keep a reserve for the migrator and operators.
ALTER ROLE :"app_user" CONNECTION LIMIT 150;

-- The master must be a member of the migrator to hand ownership over (PostgreSQL 16+ grants it ADMIN on the
-- roles it created, not membership).
GRANT :"migrator_user" TO CURRENT_USER;

-- Schema first (the master still owns the database here), then the database itself.
ALTER SCHEMA public OWNER TO :"migrator_user";
ALTER DATABASE :"db" OWNER TO :"migrator_user";
REVOKE ALL ON DATABASE :"db" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"db" TO :"app_user";
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO :"app_user";

-- Hand existing objects (not extension members) over to the migrator.
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
    ORDER BY c.relkind = 'S'
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I OWNER TO %I', o.relname, m);
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'skipped %: %', o.relname, SQLERRM;
    END;
  END LOOP;
  FOR o IN
    SELECT t.oid FROM pg_type t
    WHERE t.typnamespace = 'public'::regnamespace AND t.typtype IN ('e', 'd')
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

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"app_user";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :"app_user";
GRANT EXECUTE ON ALL ROUTINES IN SCHEMA public TO :"app_user";
ALTER DEFAULT PRIVILEGES FOR ROLE :"migrator_user" IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_user";
ALTER DEFAULT PRIVILEGES FOR ROLE :"migrator_user" IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO :"app_user";
ALTER DEFAULT PRIVILEGES FOR ROLE :"migrator_user" IN SCHEMA public
  GRANT EXECUTE ON ROUTINES TO :"app_user";

-- audit_logs is append-only for the application (SEC-054; Alembic 0004 also revokes on creation).
DO $$
BEGIN
  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM %I', current_setting('hig.app_user'));
  END IF;
END
$$;

-- Diagnostics without superuser (pg_stat_statements of all sessions), where RDS lets the master grant it.
DO $$
BEGIN
  EXECUTE format('GRANT pg_read_all_stats TO %I', current_setting('hig.migrator_user'));
EXCEPTION WHEN others THEN
  RAISE NOTICE 'pg_read_all_stats not granted: %', SQLERRM;
END
$$;
SQL

install -d -m 0700 "$HIG_STATE"
date -u +%FT%TZ > "$HIG_STATE/db-bootstrapped"
log "db-bootstrap: done"
