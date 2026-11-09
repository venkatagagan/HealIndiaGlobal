# Observability: Prometheus, Grafana and Alertmanager

Monitoring for the Heal India Global API, its background jobs, payments and the data stores. It works with either
deployment target: Kubernetes (`deploy/k8s`) or ECS (`deploy/terraform/aws`). The CloudWatch alarms in
`monitoring.tf` cover the AWS-native signals (ALB, ECS, RDS, ElastiCache). This stack covers application and
business signals.

```
deploy/observability/
├── prometheus/prometheus.yml               scrape jobs (job names are a contract with the rules and dashboard)
├── prometheus/rules/hig-recording.rules.yml  request rate, 5xx ratio, p50/p95/p99 (also per route)
├── prometheus/rules/hig-alerts.rules.yml     30 alerts: API, jobs, webhooks, settlements, ledger, DB, Redis, probes
├── alertmanager/alertmanager.example.yml   routing: critical -> pager, money path -> finance + platform, warning -> e-mail
├── exporters/sql_exporter.yml              burningalchemist/sql_exporter (port 9399)
├── exporters/hig.collector.yml             queue / webhook / settlement / payout / AI / connection metrics (SQL)
├── exporters/hig-ledger.collector.yml      ledger imbalance check (15 min interval)
├── exporters/monitor-role.sql              read-only, column-scoped `hig_monitor` role for the exporter
├── exporters/blackbox.yml                  external HTTPS probes and certificate expiry
└── grafana/
    ├── provisioning/datasources.yml        Prometheus data source (uid `prometheus`)
    ├── provisioning/dashboards.yml         file provider -> /var/lib/grafana/dashboards/heal-india-global
    └── dashboards/hig-api-overview.json    "Heal India Global - API overview" (uid hig-api-overview)
```

## Scrape jobs

| job | source | what it provides |
|---|---|---|
| `hig-api` | FastAPI `/metrics` (prometheus-fastapi-instrumentator) | `http_requests_total{handler,method,status}` (status grouped as `2xx`..`5xx`), `http_request_duration_highr_seconds` (fine buckets, for SLO quantiles), `http_request_duration_seconds{handler}` (coarse, per route) |
| `hig-sql-exporter` | PostgreSQL through sql_exporter | `hig_jobs_*`, `hig_webhook_events_*`, `hig_settlement_batches_*`, `hig_payouts_failed_recent`, `hig_ai_requests_recent`, `hig_ledger_imbalance_minor`, `hig_db_connections`, `hig_db_max_connections`, `hig_db_longest_transaction_seconds` |
| `hig-redis-exporter` | oliver006/redis_exporter | `redis_up`, `redis_memory_used_bytes`, `redis_memory_max_bytes` |
| `hig-blackbox` | blackbox_exporter | `probe_success`, `probe_ssl_earliest_cert_expiry` for `/health/ready` and the public pages |

`/metrics` returns 404 at the public edge (nginx, ingress, ALB rule). Scrape it inside the cluster or VPC only.

### Metrics the app does not export yet

The app does not export queue depth, webhook failures or settlement state itself, so those are computed in
PostgreSQL by the SQL collectors. If the backend adds native counters later, these are the recommended names.
Switch the rules over once they exist:

| recommended metric | type | labels |
|---|---|---|
| `hig_jobs_enqueued_total`, `hig_jobs_completed_total`, `hig_jobs_failed_total` | counter | `task_name`, `outcome` |
| `hig_job_duration_seconds` | histogram | `task_name` |
| `hig_webhook_events_total` | counter | `gateway`, `result` (`processed`, `duplicate`, `invalid_signature`, `error`) |
| `hig_settlement_batches_total` | counter | `status` |
| `hig_ai_requests_total` | counter | `status` (`ok`, `fallback`, `error`, `refusal`) |
| `hig_ws_connections` | gauge | none |

## Dashboard: API overview

The dashboard file is `grafana/dashboards/hig-api-overview.json`. It has 4 rows and 24 panels. The variables are
`datasource`, `job` (default `hig-api`) and `instance` (multi-select).

1. **Headline:** request rate, 5xx ratio, p95 latency, healthy targets, due jobs and the oldest due job. Each
   stat tile uses threshold colours that match the alert thresholds.
2. **Traffic and latency:**
   - requests by status class
   - p50/p95/p99 latency (one sequential blue ramp, ordered by quantile)
   - 5xx ratio with dashed warning (2%) and critical (5%) lines
   - top routes by request rate
   - slowest routes (p95)
   - 5xx responses by route
3. **Background jobs, payments and settlements:**
   - due jobs by task
   - dead and failed jobs
   - webhook failing, backlog and invalid-signature counts by gateway
   - settlement and payout failures
   - AI screening outcomes
   - ledger imbalance (must stay at 0)
4. **PostgreSQL and Redis:** connections by state against `max_connections`, and Redis memory against
   `maxmemory`.

Design rules:
- Status colours (good, warning, serious, critical) are used only for states, and every series carries a label.
- No panel has two y-axes.
- Every multi-series panel has a legend table showing last and max values.

To change the dashboard, edit and run `grafana/gen_dashboard.py` (usage in its docstring), or edit the
JSON in Grafana and export it. Keep `uid` and the panel ids stable.

## Running it

**Kubernetes (kube-prometheus-stack):**
1. Load `prometheus/rules/*.yml` as a `PrometheusRule`. The `groups:` body is the same.
2. Use the `hig-api` job as is, or create an equivalent `PodMonitor` that selects
   `app.kubernetes.io/name=hig-api`, port `http`.
3. Mount the dashboard JSON through a ConfigMap labelled `grafana_dashboard: "1"`.

**ECS:** run Prometheus, or an ADOT collector that remote-writes to Amazon Managed Service for Prometheus,
inside the VPC:
1. Replace `kubernetes_sd_configs` with the Cloud Map `dns_sd_configs` example in `prometheus.yml`. The
   discovery name comes from `terraform output metrics_scrape_dns_name`.
2. Add the scraper CIDR to `metrics_scrape_cidrs`.

**SQL exporter:**
1. After the first migration, create the monitoring role with `exporters/monitor-role.sql`. Pass the password as
   a psql variable and never commit it.
2. Put the DSN (`hig_monitor`, `sslmode=require`) in the exporter's secret, not in `sql_exporter.yml`.

The role is read-only (`default_transaction_read_only`, `statement_timeout 10s`). Its column grants cover status
columns only: no patient data, no payloads.

**Alertmanager:** copy `alertmanager.example.yml` and replace every `REPLACE_ME`. Critical money-path alerts
(dead payment jobs, settlement failures, ledger imbalance) go to finance and also continue to the pager.

## Local development

The compose stack (`infra/docker-compose.yml`) loads `pg_stat_statements`. For slow queries, run:

```sql
SELECT query, calls, round(mean_exec_time::numeric, 1) AS mean_ms, round(total_exec_time::numeric) AS total_ms
FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 20;
```

Production RDS loads `pg_stat_statements` through its parameter group (`rds.tf`).
