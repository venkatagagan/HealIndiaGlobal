-- Read-only, column-scoped monitoring role for sql_exporter. Run AFTER the first migration (the tables must
-- exist), as the RDS master user (member of the application role after db-bootstrap) or the database owner:
--
--   psql "host=<rds endpoint> dbname=healindia user=hig_master sslmode=require" \
--        -v monitor_password="$(cat /secure/path/monitor_password)" -f monitor-role.sql
--
-- The role can read job/webhook/settlement/payout status columns and connection statistics only - no
-- patient data, no webhook payloads, no amounts except ledger_entries.amount_minor for the balance check.

SELECT 'CREATE ROLE hig_monitor LOGIN'
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hig_monitor') \gexec

ALTER ROLE hig_monitor WITH LOGIN PASSWORD :'monitor_password' CONNECTION LIMIT 3;
ALTER ROLE hig_monitor SET statement_timeout = '10s';
ALTER ROLE hig_monitor SET default_transaction_read_only = on;

-- pg_stat_activity of every session + pg_settings (connection metrics).
GRANT pg_monitor TO hig_monitor;

GRANT CONNECT ON DATABASE healindia TO hig_monitor;
GRANT USAGE ON SCHEMA public TO hig_monitor;

GRANT SELECT (task_name, status, attempts, run_at, locked_at, finished_at) ON background_jobs TO hig_monitor;
GRANT SELECT (gateway, signature_valid, received_at, processed_at, processing_error) ON webhook_events TO hig_monitor;
GRANT SELECT (status, updated_at) ON settlement_batches TO hig_monitor;
GRANT SELECT (method, status, updated_at) ON payouts TO hig_monitor;
GRANT SELECT (status, created_at) ON ai_request_logs TO hig_monitor;
GRANT SELECT (direction, amount_minor) ON ledger_entries TO hig_monitor;
