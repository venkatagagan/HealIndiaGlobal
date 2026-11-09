# Heal India Global: load tests (Locust)

`locustfile.py` drives a realistic mixed workload against the FastAPI node
(`http://127.0.0.1:8000/api/v1` by default). It covers anonymous catalog browsing, the AI-screening wizard,
case → quote → booking → payment journeys, messaging and admin dashboards. It also prints an SLO verdict at
the end of every run. The test-case view of performance lives in `docs/QA_TEST_PLAN.md` (§PERF).

---

## 1. Safety rules (read before every run)

1. **Never against production.** The locustfile refuses any host that is not listed in `HIG_LT_ALLOW_HOSTS`
   (default `127.0.0.1, localhost, ::1`) or that matches `HIG_LT_DENY_HOST_REGEX` (default: hostnames that
   contain `prod`, `production` or `live`). Do not weaken these settings to reach production. The mock gateway
   is refused there anyway, so journeys would fail.
2. **Use a disposable database.** The test writes data: guests, `lt.patient.NNNN@healindia.example` pool
   accounts, cases, quotes, bookings, payments, ledger postings and messages, all marked `[loadtest]`. Ledger
   rows are immutable (DB triggers), so cleaning up means **recreating the database and re-seeding**.
3. **Do not load the shared dev cluster.** The local PostgreSQL at `127.0.0.1:5432` (`C:\NewProjects\pgsql`)
   also hosts other projects (ExamCon). Against the local dev API, only run the **smoke** profile (≤ 100 users at
   `HIG_LT_THINK_SCALE=2`, about 10 req/s). SLO, capacity, soak and spike runs belong on the dedicated perf
   environment (§3). Never change the shared cluster's configuration (e.g. `shared_preload_libraries`) or
   restart it.
4. **No external side effects.** The target must run the AI **rules engine** (`ANTHROPIC_API_KEY` empty or
   `AI_ENABLED=false`) with `EMAIL_BACKEND=console` and the `mock` gateway. Real Claude, SMTP, FCM or Razorpay
   calls under load cost money and can get keys rate-limited or banned.
5. **Shared staging needs approval.** Announce the window and keep the test traffic identifiable: every request
   carries `User-Agent: hig-loadtest/1.0` and `X-Request-ID: lt-<run>-<n>`, and `<run>` is printed at start.

---

## 2. Workload model

The user weights are tuned so the **share of HTTP requests** matches the targets below. The end-of-run summary
prints the measured mix. Each user waits between tasks ("think time") as a real person would, scaled by
`HIG_LT_THINK_SCALE`.

| Scenario (target share) | User class (default weight) | What it does | Think time |
|---|---|---|---|
| Anonymous catalog browsing / search (**~60%**) | `CatalogBrowser` (55) | specialties, procedures, cost comparison (12 home markets / currencies), hospital & doctor lists with random filters/sort/pages, details, availability, search-as-you-type (debounced prefixes, typos), content, stays/services | 2–7 s |
| Patient AI screening (**~15%**) | `ScreeningPatient` (19), 30% as guests | specialty → PATCH steps 1–4 (body map/pain, symptoms yes/maybe/no, duration/severity/treatments, preferences/budget/travel window) → submit → poll every 2 s → matches → cost comparison / hospital / doctor. About 5% of runs use red-flag input and must come back `urgency=emergency` | 3–8 s per step |
| Cases / bookings / payments (**~10%**) | `PatientCasesUser` (5), `HospitalDeskUser` (2), `AgentDeskUser` (1), `TreatmentJourneyUser` (3) | dashboards, case/booking/payment/trip reads, quote requests. **Journey:** enquiry → hospital quote (owner login, `X-Hospital-Id`) → accept → booking on an available admission date → mock payment with `Idempotency-Key` (10% same-key retry, 5% decline-then-retry) → confirmed → 20% cancel (refund policy) / 25% admit + discharge (revenue recognition, settlement items). 20% of journeys are run by the agent on behalf of a managed patient | 3–8 s |
| Messaging / notifications (**~10%**) | `MessagingUser` (10) | unread badge polling, notification list / mark read, conversations, message history, send (`[loadtest] … #lt:<id>:<ms>`), mark read; optional WebSocket listener | 2–7 s |
| Admin dashboards (**~5%**) | `AdminOpsUser` (3), `FinanceDeskUser` (1), `SupportDeskUser` (1) | admin dashboard, approval queues, users, audit logs, SOS, revenue report; finance summary, orders, settlement items/batches, trial balance, journal, refunds, rare CSV export; support case/travel/SOS views | 2–7 s |
| *(optional)* Auth churn | `AuthChurnUser` (0 → set `HIG_LT_WEIGHT_AUTH_CHURN`) | login → me → refresh → logout (measures the Argon2id cost) | 5–15 s |

The average is about **0.21 req/s per simulated user at `HIG_LT_THINK_SCALE=1`**. So 200 req/s needs about
**950 users**, or about 475 users at `HIG_LT_THINK_SCALE=0.5`.

**Sessions.** Each account logs in once per Locust process (`X-Client-Type: mobile`, so the refresh token
comes back in the body). Its access token is shared by every simulated user of that account and refreshed
proactively, one refresh at a time per account. That matters because the API revokes the whole token family
when a rotated refresh token is replayed. Logins therefore never hit the 10/min/IP limit, and a wrong password
disables that account for the rest of the run instead of locking it after 5 failures.

**Client IPs.** By default each simulated user sends a stable synthetic `X-Forwarded-For` address from
`198.18.0.0/15`, the RFC 2544 benchmarking range. The API honours it only from loopback/private peers, which is
exactly where the load generator sits when it talks to the API directly. Per-IP rate limits then apply per
simulated user, as they would for distinct real clients. Turn this off with `HIG_LT_SPOOF_CLIENT_IP=0`.

**Reference data** (specialty, procedure, hospital and doctor IDs, symptoms, languages, cities) is discovered
from the public API at start-up (`setup:` rows in the stats), so the test follows whatever the seed created.
Journey and hospital-desk users need hospital owners who can log in. By default the test tries
`owner.<hospital-slug>@healindia.example` for the first discovered hospitals; override with
`HIG_LT_HOSPITAL_OWNERS`.

---

## 3. Target environment prerequisites (perf environment)

The SLOs are defined for **one API node with 4 vCPU**. Use a dedicated host (the `infra/` docker-compose stack
on a perf VM is fine), and run Locust on **another** machine so the generator does not steal CPU from the API.
Expose the API port to the generator only (perf-only port mapping, or an SSH tunnel), then add that host to
`HIG_LT_ALLOW_HOSTS`.

| Setting (API + worker) | Value for load tests | Why |
|---|---|---|
| `ENV` | `staging` | production-like, but the `mock` gateway is still allowed |
| `WEB_CONCURRENCY` (gunicorn) / `uvicorn --workers` | `4` | one async worker per vCPU |
| `JWT_SECRET`, `FIELD_ENCRYPTION_KEY` | fixed, strong values | an **empty** `JWT_SECRET` outside production makes **each worker process generate its own secret**, causing random 401s with more than one worker |
| `RUN_WORKER_IN_API` | `false`, plus 1–2 `python -m app.worker` processes | keeps job processing off the request path, as in production |
| `DB_POOL_SIZE` / `DB_MAX_OVERFLOW` | e.g. `10` / `10` | keep `workers × (pool + overflow) + worker processes × (…) + 20` ≤ PostgreSQL `max_connections` (compose: 200) |
| `REDIS_URL` | Redis 7 (compose) | shared rate-limit counters and cross-process WebSocket fan-out, as in production |
| `PAYMENT_GATEWAYS_ENABLED` | `mock,bank_transfer` | journeys pay through `POST /payments/mock/{id}/complete` |
| `ANTHROPIC_API_KEY` / `AI_ENABLED` | empty / `false` | rules engine only (§1.4) |
| `EMAIL_BACKEND` | `console` | no real e-mail |
| `RATE_LIMIT_ENABLED` | `true` (default) | realistic; works with the synthetic client IPs. Use `false` only for raw-capacity experiments |
| `ADMIN_MFA_REQUIRED` | `false`, or provide `HIG_LT_TOTP_SECRETS` | staff logins in the admin scenario |
| `REQUIRE_EMAIL_VERIFICATION` | `false` | pool accounts are registered on the fly |
| `LOG_JSON` / `LOG_LEVEL` | `true` / `INFO` | correlate failures by `X-Request-ID` |

**Data.** Run migrations and the seed (`backend/scripts/seed.py`). Then make sure the journey hospitals have
**admission availability** (`availability_slots`, `slot_kind=admission`) for roughly the next 90 days, with
enough capacity. Otherwise most bookings end in `409` (reported as the FLOW row
`booking rejected: capacity/conflict (409)`). For meaningful query plans the database should be much larger
than the demo seed (for example 200 hospitals, 2,000 doctors, 50k patients, 100k cases). Ask the backend team
for a volume seed before the formal SLO run, and record the data volume in the report.

**PostgreSQL observability (perf DB only).** Set `shared_preload_libraries = 'pg_stat_statements'`,
`pg_stat_statements.track = all`, `track_io_timing = on`, `log_min_duration_statement = 200ms`,
`log_lock_waits = on`, then run `CREATE EXTENSION IF NOT EXISTS pg_stat_statements;`. Call
`SELECT pg_stat_statements_reset();` right before the measured window.

---

## 4. Install (separate venv)

```powershell
# from the repo root (PowerShell)
C:\NewProjects\python313\python.exe -m venv loadtest\.venv
loadtest\.venv\Scripts\python -m pip install -r loadtest\requirements.txt
loadtest\.venv\Scripts\locust --version
```
`loadtest\.venv` is git-ignored. Do not install Locust into `backend\.venv`.

---

## 5. Running

All examples assume PowerShell at the repo root. `$env:NAME = "value"` sets a variable for the current shell.
Results go to `loadtest\results\` (git-ignored).

**Smoke (local dev API; validates seed, credentials and scripts, about 10 req/s):**
```powershell
$env:HIG_LT_THINK_SCALE = "2"
loadtest\.venv\Scripts\locust -f loadtest\locustfile.py --headless -u 100 -r 10 -t 5m `
  --csv loadtest\results\smoke --html loadtest\results\smoke.html
```
Expect 0 failures. If some fail, check §10 before anything else.

**Interactive (web UI on http://localhost:8089):**
```powershell
loadtest\.venv\Scripts\locust -f loadtest\locustfile.py
```

**Formal SLO run (perf environment, 200 req/s, 5 min ramp + 30 min measured):**
```powershell
$env:HIG_LT_ALLOW_HOSTS = "perf-api.internal"          # the perf API host name / IP
$env:HIG_LT_PATIENT_POOL = "200"                        # spread load over 200 patients (auto-registered)
$env:HIG_LT_THINK_SCALE = "0.5"
$env:HIG_LT_ENFORCE_SLO = "1"                           # exit code 1 when an SLO gate fails (CI-friendly)
loadtest\.venv\Scripts\locust -f loadtest\locustfile.py --host http://perf-api.internal:8000/api/v1 `
  --headless -u 480 -r 2 -t 35m --reset-stats --stop-timeout 30 `
  --csv loadtest\results\slo --csv-full-history --html loadtest\results\slo.html
```
`-r 2` takes about 4 minutes to spawn 480 users. `--reset-stats` starts measuring once spawning has finished.
Always use a patient pool for SLO, soak and capacity runs. A single demo patient with thousands of
cases and screenings is an unrealistic hotspot and distorts dashboard and list queries.

**Capacity discovery (find the knee):**
```powershell
$env:HIG_LT_SHAPE = "step"; $env:HIG_LT_STEP_USERS = "100"; $env:HIG_LT_STEP_SECONDS = "180"
$env:HIG_LT_PEAK_USERS = "2000"; $env:HIG_LT_HOLD_SECONDS = "300"
loadtest\.venv\Scripts\locust -f loadtest\locustfile.py --host http://perf-api.internal:8000/api/v1 --headless `
  --csv loadtest\results\step --csv-full-history --html loadtest\results\step.html
```
The knee is the step where p95 latency doubles or errors exceed 1%. Report the last good step's req/s as the
sustainable capacity. `HIG_LT_SHAPE` must be unset for normal `-u/-r/-t` runs.

**Soak (leaks and slow drift):** 70% of the SLO load (`-u 340` at think scale 0.5) for `-t 4h`. Watch API RSS,
DB connections, `background_jobs` and Redis memory (§7). The API RSS should stay flat within ±10% after warm-up.

**Spike:** in the web UI, jump from 200 to 1,000 users at `-r 100`, hold 3 minutes, then drop back. Recovery
means p95 back under target within 2 minutes, with no stuck jobs and no pool exhaustion.

**Realtime:** set `$env:HIG_LT_WS = "1"` (needs `websocket-client`). Each `MessagingUser` keeps `/ws` open and
records `WS /ws message.created fan-out` latency. For 1,000 sockets, run more messaging users
(`HIG_LT_WEIGHT_MESSAGING`).

**Distributed generators** (needed above about 1,500 users per CPU core of the generator). `--processes` is not
available on Windows, so start one master and N workers in separate terminals:
```powershell
loadtest\.venv\Scripts\locust -f loadtest\locustfile.py --master --headless -u 1000 -r 20 -t 30m --expect-workers 4
loadtest\.venv\Scripts\locust -f loadtest\locustfile.py --worker --master-host 127.0.0.1   # x4
```
Every worker needs the same `HIG_LT_*` environment.

**Selecting scenarios.**
* Name user classes to run only those, e.g. `locust -f loadtest\locustfile.py CatalogBrowser`.
* Tags slice tasks: `catalog, search, cost, availability, content, travel, screening, cases, bookings, payments,
  journey, hospital, agent, messaging, notifications, admin, finance, support, auth, heavy, read, write`.
  For example `--exclude-tags heavy` or `--tags read`.
* When using `--tags`, also name classes that still have tasks. A class whose tasks are all filtered out cannot
  start.

---

## 6. Configuration (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `HIG_LT_HOST` | `http://127.0.0.1:8000/api/v1` | default target (`--host` overrides) |
| `HIG_LT_ALLOW_HOSTS` | `127.0.0.1,localhost,::1` | hostnames the test may hit (`*` = any; never use it on a network that can reach production) |
| `HIG_LT_DENY_HOST_REGEX` | `(^\|[.-])(prod\|production\|live)([.-]\|$)` | hostnames always refused |
| `HIG_LT_PASSWORD` | `HealIndia@2026` | demo seed password (non-production only) |
| `HIG_LT_PATIENTS` / `HIG_LT_AGENTS` | `patient.us@…` / `agent.lagos@…` | comma-separated accounts |
| `HIG_LT_ADMINS` / `HIG_LT_FINANCE` / `HIG_LT_SUPPORT` | `admin@…` / `finance1@…,finance2@…` / `support@…` | staff accounts for the admin scenario |
| `HIG_LT_HOSPITAL_OWNERS` | *(discover `owner.<slug>@…`)* | hospital owner accounts for journeys / hospital desk |
| `HIG_LT_EMAIL_DOMAIN` | `healindia.example` | domain of seed and pool accounts |
| `HIG_LT_PATIENT_POOL` | `0` | >0: use `lt.patient.0001…N@` (registered through `/auth/register` on first use) |
| `HIG_LT_TOTP_SECRETS` | *(empty)* | `email=BASE32,email2=BASE32` when staff MFA is enforced (never printed) |
| `HIG_LT_THINK_SCALE` | `1.0` | multiplies all think times (0.5 = twice the load per user) |
| `HIG_LT_GUEST_SHARE` | `0.3` | share of screening users that start as guests |
| `HIG_LT_USE_AI` | `0` | send `use_ai/consent_ai=true` (the target must still use the rules engine) |
| `HIG_LT_SCREENING_TIMEOUT` | `60` | seconds to wait for a screening result |
| `HIG_LT_JOURNEY_HOSPITALS` | `3` | how many hospitals the journeys use |
| `HIG_LT_JOURNEY_CANCEL_SHARE` / `_COMPLETE_SHARE` / `_AGENT_SHARE` | `0.2` / `0.25` / `0.2` | journey branches (set COMPLETE to 0 if the build forbids admitting before the admission date) |
| `HIG_LT_WEIGHT_<CLASS>` | see §2 | `CATALOG, SCREENING, PATIENT_CASES, HOSPITAL, AGENT, JOURNEY, MESSAGING, ADMIN, FINANCE, SUPPORT, AUTH_CHURN` |
| `HIG_LT_SPOOF_CLIENT_IP` | `1` | synthetic per-user `X-Forwarded-For` |
| `HIG_LT_ACCEPT_429` | `0` | count 429 as success (rate-limiter validation runs) |
| `HIG_LT_WS` | `0` | WebSocket listeners for messaging users |
| `HIG_LT_CONSENT_VERSION` | `1.0` | version sent when granting `share_with_hospitals` / `ai_processing` |
| `HIG_LT_SHAPE` (+ `_STEP_USERS`, `_STEP_SECONDS`, `_PEAK_USERS`, `_HOLD_SECONDS`) | *(off)* | `step` = capacity-discovery shape |
| `HIG_LT_ENFORCE_SLO` | `0` | non-zero exit code when a gate fails |
| `HIG_LT_TARGET_RPS` | `200` | throughput gate (≥ 90% of it) |
| `HIG_LT_SLO_CATALOG_P95_MS` / `_WRITE_P95_MS` / `_AUTH_READ_P95_MS` / `_ERROR_RATE` | `300` / `800` / `500` / `0.005` | SLO thresholds |

---

## 7. Service level objectives

Measured at the API node (direct, not through nginx), steady state, with the default mix at **≥ 200 req/s on
one 4 vCPU API node** (separate DB host). These are the release gates for PERF-002 in the QA plan:

| # | Objective | Target | Gate |
|---|---|---|---|
| 1 | Catalog reads p95 (public GETs: specialties, procedures, hospitals, doctors, availability, search, cost comparison, content, stays) | **< 300 ms** | yes |
| 2 | Writes p95 (all POST/PUT/PATCH/DELETE: screening steps, cases, quotes, bookings, payments, messages, auth) | **< 800 ms** | yes |
| 3 | HTTP error rate (non-2xx except expected 409/404 noted in the script, plus connection errors) | **< 0.5%** | yes |
| 4 | Throughput | **≥ 90% of 200 req/s** | yes |
| 5 | Authenticated reads p95 (dashboards, lists, details) | < 500 ms | info |
| 6 | `FLOW screening submit -> result` p95 (rules engine, worker poll 2 s) | < 10 s | info |
| 7 | `FLOW payment captured -> booking confirmed` p95 | < 5 s, 0 failures | info |
| 8 | `WS /ws message.created fan-out` p95 | < 1 s | info |
| 9 | Correctness under load: 0 failures on `screening red-flag -> urgency=emergency` and `payment order retry -> same order`; no 5xx; trial balance = 0; no overbooked slots; no duplicate captures (SQL in §7.2) | must hold | yes (manual) |
| 10 | Recovery: `background_jobs` queue drained ≤ 2 min after the load stops; no `dead` jobs | must hold | yes (manual) |

The summary at the end of every run prints PASS/FAIL for gates 1–4, informational p95s, the measured request
mix, the slowest endpoints and the FLOW/WS rows. `FLOW` and `WS` rows are business measurements and are
excluded from gates 1–4. With `HIG_LT_ENFORCE_SLO=1` the process exits with code 1 when a gate fails. A run
that does not reach the target throughput is **inconclusive**, not a pass.

### 7.1 What to watch during a run

**API node**
* CPU per worker process (it should not sit at 100% while p95 is low, which would mean headroom is gone), RSS
  memory, open sockets/FDs, gunicorn worker timeouts or restarts in logs.
* `GET /metrics` (Prometheus; internal only, nginx returns 404): request-duration histograms per route,
  requests in progress, 5xx rate.
* Logs: `QueuePool limit of size … overflow … reached` / `TimeoutError` (DB pool exhausted, shows up as 500s),
  `unhandled_error`, slow requests. Correlate by `X-Request-ID` (`lt-<run>-…`).
* Argon2id: each login/registration hash costs CPU and about 64 MiB RAM. Keep login churn out of the main mix
  and measure it separately with `AuthChurnUser`.

**PostgreSQL**
```sql
-- 1. connection / pool saturation: per API process, active+idle-in-txn must stay below pool+overflow
SELECT application_name, state, wait_event_type, count(*)
FROM pg_stat_activity WHERE datname = 'healindia' GROUP BY 1, 2, 3 ORDER BY 4 DESC;

-- 2. lock waits: watch ledger_accounts (escrow / gateway receivable rows are updated on every capture),
--    bookings & payment_orders (SELECT … FOR UPDATE), availability_slots (capacity)
SELECT pid, now() - query_start AS waiting, wait_event, left(query, 140)
FROM pg_stat_activity WHERE datname = 'healindia' AND wait_event_type = 'Lock' ORDER BY 2 DESC;

-- 3. slowest statements (pg_stat_statements; reset right before the measured window)
SELECT calls, round(total_exec_time) AS total_ms, round(mean_exec_time, 1) AS mean_ms,
       round(max_exec_time) AS max_ms, rows, left(query, 140)
FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 20;

-- 4. health: cache hit ratio (> 0.99), temp files (sorts spilling), deadlocks (must be 0)
SELECT round(blks_hit::numeric / nullif(blks_hit + blks_read, 0), 4) AS cache_hit, temp_files, deadlocks
FROM pg_stat_database WHERE datname = 'healindia';

-- 5. missing indexes: big tables with many sequential scans (search / filters / COUNT(*) for Page.total)
SELECT relname, seq_scan, idx_scan, n_live_tup FROM pg_stat_user_tables ORDER BY seq_scan DESC LIMIT 10;
```

**Worker queue (transactional outbox in PostgreSQL)**
```sql
SELECT status, count(*), max(attempts) FROM background_jobs GROUP BY status;
SELECT now() - min(run_at) AS oldest_due_job FROM background_jobs WHERE status = 'queued' AND run_at <= now();
SELECT task_name, count(*) FROM background_jobs WHERE status IN ('failed', 'dead') GROUP BY 1;
```
The oldest due job should stay under 30 s during the run. If it grows steadily, the worker cannot keep up:
screening results and notifications lag and the `FLOW screening submit -> result` row degrades.

**Redis** (compose: db 0; local dev: db 3)
```
redis-cli INFO stats      # instantaneous_ops_per_sec, rejected_connections, evicted_keys
redis-cli INFO clients    # connected_clients (grows with WebSockets), blocked_clients
redis-cli INFO memory     # used_memory_human vs maxmemory (compose 256 MB), mem_fragmentation_ratio
redis-cli --latency       # should stay ~1 ms
redis-cli SLOWLOG GET 10
redis-cli PUBSUB NUMSUB <channel>   # WebSocket fan-out subscribers
```

**Generator (Locust machine).** Locust warns when its CPU is above 90%. If so, the numbers are not valid: add
workers.

### 7.2 After the run (correctness under load)
```sql
-- every ledger transaction balances (expect 0 rows) and the trial balance nets to 0
SELECT t.id FROM ledger_transactions t JOIN ledger_entries e ON e.transaction_id = t.id GROUP BY t.id
HAVING sum(CASE WHEN e.direction = 'debit' THEN e.amount_minor ELSE -e.amount_minor END) <> 0;
-- no overbooked admission dates (expect 0 rows)
SELECT * FROM availability_slots WHERE booked > capacity;
-- no duplicate captures / webhook double-processing (expect 0 rows)
SELECT gateway, gateway_payment_id, count(*) FROM payments GROUP BY 1, 2 HAVING count(*) > 1;
-- no stuck or dead jobs once the queue has drained
SELECT status, count(*) FROM background_jobs WHERE status IN ('queued', 'running', 'dead') GROUP BY 1;
```
Also call `GET /api/v1/finance/ledger/trial-balance` as finance; it must net to 0.

---

## 8. Reporting

Attach `results/<name>.html`, `results/<name>_stats.csv` and the console summary to the test report or PR, with:
build/commit, environment (vCPU/RAM of the API and DB nodes, worker counts, pool sizes, Redis on/off),
data volume, users / think scale / duration, achieved req/s, the SLO table (PASS/FAIL), the top 5 slowest
endpoints, the pg_stat_statements top 10, the queue depth chart, errors (grouped), and the bottlenecks found
with their owners.

## 9. Cleanup

Recreate the database and re-seed. There is no selective cleanup: ledger tables are append-only by design, and
`[loadtest]` rows reference each other across modules. Pool users are `lt.patient.*@healindia.example`.

## 10. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `Refusing to run the load test: host …` | Host not in `HIG_LT_ALLOW_HOSTS`, or it looks like production. Add the perf host, never production. |
| `Account … disabled for this run: login failed: HTTP 401` | Seed not loaded or password changed. Check `HIG_LT_PASSWORD`. The account is not retried, so no lockout. |
| `MFA required` | Staff MFA is enforced. Set `ADMIN_MFA_REQUIRED=false` on the perf API or provide `HIG_LT_TOTP_SECRETS`. |
| `No hospital owner could log in` | Set `HIG_LT_HOSPITAL_OWNERS=owner.<slug>@healindia.example,…` (the slugs of active, seeded hospitals). |
| Random 401s on authenticated calls | `JWT_SECRET` empty with several workers (each process has its own secret), or the API restarted mid-run. |
| Many 429s | Rate limiting with `HIG_LT_SPOOF_CLIENT_IP=0`, or the run goes through nginx (`limit_req` 20 r/s per IP). Test the API directly, or allowlist the generator on the perf edge. |
| `booking rejected: capacity/conflict (409)` is high | Too little admission availability for the journey hospitals (see §3 Data). |
| 422 on screening PATCH / bookings / orders | Schema drift between this script and the API. Compare with `docs/API.md` / `/api/openapi.json` and update the script. |
| `screening submit -> result` failures | Worker not running (`RUN_WORKER_IN_API=false` without `python -m app.worker`), or the queue is backlogged. |
| Generator CPU > 90% | Add `--worker` processes (§5). |
