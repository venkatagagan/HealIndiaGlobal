-- Heal India Global: executed once by the postgres:17 image when the data volume is first initialised.
-- Runs as the bootstrap superuser against $POSTGRES_DB. The Alembic migration also issues
-- CREATE EXTENSION IF NOT EXISTS (a no-op when the extension exists, so it works for the non-superuser
-- migrator role created by 02-roles.sh).
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- Slow-query diagnostics (needs shared_preload_libraries=pg_stat_statements, set in docker-compose.yml).
-- Read it with: SELECT query, calls, mean_exec_time FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 20;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Make the same extensions available in every database created later from template1
-- (e.g. per-test-session databases in a containerised CI run).
\connect template1
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
