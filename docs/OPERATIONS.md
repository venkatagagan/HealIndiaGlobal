# Operations

Day-to-day running of Heal India Global: local setup on Windows, processes, background jobs, health and
metrics, backups, and runbooks.

* Production deployment, TLS, scaling, monitoring stack: [DEPLOYMENT.md](DEPLOYMENT.md). Architecture:
  [ARCHITECTURE.md](ARCHITECTURE.md). Money flows and daily reconciliation: [PAYMENTS.md](PAYMENTS.md) §11.
  Security model: [SECURITY.md](SECURITY.md).
* **House rules:**
  * Use only the shared toolchain under `C:\NewProjects` (never `C:\laragon\…`) and don't install tools.
  * This project's PostgreSQL is its **own dedicated cluster** (`C:\NewProjects\pgdata-healindia`, port
    **5433**). Never touch the shared cluster (`C:\NewProjects\pgdata`, port 5432), its roles or its databases.
  * Never print, paste or commit values from `backend\.env`.

---

## 1. Processes at a glance

| Component | Local (Windows) | Docker compose (`infra/docker-compose.yml`) |
|---|---|---|
| API | `.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000`. Runs an **embedded worker** when `RUN_WORKER_IN_API=true` (the default). | `api` service: gunicorn + Uvicorn workers (`WEB_CONCURRENCY`), migrations on start (`RUN_MIGRATIONS=1`), `RUN_WORKER_IN_API=false` |
| Worker | `.venv\Scripts\python -m app.worker [--concurrency 2] [--once]` | `worker` service (`python -m app.worker`) |
| PostgreSQL 17 | Dedicated cluster `C:\NewProjects\pgdata-healindia`, `127.0.0.1:5433`, db/role `healindia` | `postgres` service (private `data` network, no published port) |
| Redis | Optional: `C:\NewProjects\redis`, `127.0.0.1:6379`, **db 3** | `redis` service (password protected) |
| Documents | `STORAGE_BACKEND=local`, `STORAGE_LOCAL_DIR=./storage` (that is `backend\storage`, git-ignored) | MinIO / S3 |
| Web apps | `npm run dev -w apps/<app>`: patient 5173, agent 5174, hospital 5175, admin 5176 | `web` + `edge` (nginx, TLS) |

---

## 2. Running locally (Windows)

### 2.1 Toolchain

```powershell
. C:\NewProjects\ForHosp\scripts\env.ps1        # PowerShell: puts Node, Python 3.13, PostgreSQL bin, Redis on PATH
```

```bash
source /c/NewProjects/ForHosp/scripts/env.sh    # Git Bash
```

### 2.2 Database: the dedicated PostgreSQL cluster

One-time setup (idempotent; safe to re-run):

```powershell
powershell -ExecutionPolicy Bypass -File C:\NewProjects\ForHosp\scripts\setup-db.ps1
```

`scripts/setup-db.ps1` uses the shared binaries in `C:\NewProjects\pgsql`. It:

1. Initialises the cluster once in `C:\NewProjects\pgdata-healindia`: UTF-8, `scram-sha-256`, listening on
   `127.0.0.1` port **5433**. The local superuser `postgres` gets a random password, stored as
   `LOCAL_PG_SUPERUSER_PASSWORD` in `backend\.env` (development only; the app never uses it).
2. Starts the cluster **detached** if it's stopped (log: `C:\NewProjects\pgdata-healindia.log`) and waits
   for `pg_isready`.
3. Creates or updates the role and database from `DATABASE_URL` in `backend\.env` (role `healindia` with
   `CREATEDB` for the per-test databases; database `healindia`) plus the extensions `citext`, `pg_trgm`,
   `btree_gin`, `pgcrypto`.
4. Points `DATABASE_URL` at port 5433 and checks that the app role can log in.

Day-to-day control:

```powershell
$pg = 'C:\NewProjects\pgsql\bin'; $data = 'C:\NewProjects\pgdata-healindia'
& "$pg\pg_ctl.exe" status -D $data                          # running?
& "$pg\pg_isready.exe" -h 127.0.0.1 -p 5433                  # accepting connections?
# start DETACHED (never pipe or -Wait on "pg_ctl start": the postmaster would keep the console attached)
Start-Process -FilePath "$pg\pg_ctl.exe" -ArgumentList @('start','-D',$data,'-l','C:\NewProjects\pgdata-healindia.log') -WindowStyle Hidden
& "$pg\pg_ctl.exe" stop -D $data -m fast                      # stop
```

Re-running `setup-db.ps1` is the simplest way to "make sure it's up". Connect with `psql` without printing
the password (sets `PG*` variables for this PowerShell session only):

```powershell
$line = Get-Content C:\NewProjects\ForHosp\backend\.env | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
if ($line -notmatch '://([^:]+):([^@]+)@([^:/]+):(\d+)/(\w+)') { throw 'DATABASE_URL not found' }
$env:PGUSER = $Matches[1]; $env:PGPASSWORD = $Matches[2]; $env:PGHOST = $Matches[3]
$env:PGPORT = $Matches[4]; $env:PGDATABASE = $Matches[5]
psql                                   # connected to healindia as healindia on 127.0.0.1:5433
Remove-Item Env:PGPASSWORD             # when finished
```

> `setup-db.ps1` expects the `DATABASE_URL` password to be alphanumeric. Keep that in mind when rotating it
> (§6.4).

### 2.3 Backend

```powershell
cd C:\NewProjects\ForHosp\backend
# one-time (already done by backend-core): C:\NewProjects\python313\python.exe -m venv .venv
#                                          .venv\Scripts\python -m pip install -e ".[dev]"
.venv\Scripts\python -m alembic upgrade head                           # schema
.venv\Scripts\python -m scripts.seed                                   # demo data (§7)
.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000      # API (+ embedded worker)
```

* Swagger: `http://127.0.0.1:8000/api/docs`. Health: `http://127.0.0.1:8000/health/ready`.
* **Embedded or separate worker:** with `RUN_WORKER_IN_API=true` (default), the API process also runs jobs.
  To run the worker separately (closer to production), set `RUN_WORKER_IN_API=false` in `backend\.env` and
  start `.venv\Scripts\python -m app.worker` in a second window. Running both at once is safe:
  `FOR UPDATE SKIP LOCKED` and per-bucket dedupe keys prevent double execution.
* `python -m app.worker --once` processes everything that is due now and exits (handy after a restore or in
  scripts). Stop the worker with Ctrl+C (graceful).
* Tests create and drop their own databases (`hig_test_<pid>_<rand>`) on the same cluster:
  `.venv\Scripts\python -m pytest -q`.
* Smoke-test a running API end to end:
  `.venv\Scripts\python -m scripts.smoke_api --base-url http://127.0.0.1:8000` (`--fresh` to register new
  users, `--settle` to also run a maker-checker settlement batch).

### 2.4 Web and mobile

```powershell
cd C:\NewProjects\ForHosp\web
npm run dev -w apps/patient-web          # 5173 (agent-portal 5174, hospital-portal 5175, admin-portal 5176)
```

Vite proxies `/api` (including WebSockets) to `http://127.0.0.1:8000`, so the refresh cookie is same-origin.
Mobile: `cd mobile; flutter run --dart-define=API_BASE_URL=http://10.0.2.2:8000/api/v1` (Android emulator).
Use a LAN IP for a physical device, and `https://…` for release builds.

### 2.5 `scripts/dev.ps1` / `scripts/dev.sh`

`scripts/dev.ps1` runs `alembic upgrade head`, then opens the API (and optionally a worker with `-Worker`)
and the selected web apps (`-Apps patient,admin`, `-Apps none`), each in its own window. Use `-SkipMigrate`
and `-NoApi` as needed. `scripts/dev.sh` does the same in one Git Bash terminal.

> **Caution (when this was written):** both scripts still check and **start the shared cluster**
> (`C:\NewProjects\pgdata`, port 5432) and mention `create-db.ps1`, which has been replaced by
> `setup-db.ps1`. Until infra updates them, start the dedicated cluster with `setup-db.ps1` first, and
> **don't run `dev.ps1`/`dev.sh` while the shared 5432 cluster is stopped**: they would start it
> automatically. Run the steps in §2.3 manually instead (migrations, API, worker and web apps each in their
> own window).

### 2.6 Redis (optional locally)

`REDIS_URL` empty (the default) means in-memory fallbacks. Set `REDIS_URL=redis://127.0.0.1:6379/3` to use
the shared Redis (db index **3** only). Without Redis:

* rate limits are counted per process;
* WebSocket events raised in a **separate** worker process can't reach browsers connected to the API, so
  clients fall back to polling;
* the cache is per process.

Production requires Redis.

### 2.7 Configuration reference (`backend\.env`, see `app/core/config.py`)

| Area | Variables (defaults) | Notes |
|---|---|---|
| App | `ENV` (`development` / `test` / `staging` / `production`), `APP_NAME`, `API_BASE_URL`, `PATIENT_WEB_URL`, `AGENT_PORTAL_URL`, `HOSPITAL_PORTAL_URL`, `ADMIN_PORTAL_URL`, `ENABLE_DOCS` (true), `TRUSTED_HOSTS` (`*`) | `ENV=production` turns on strict validation (§6.4) |
| Logging | `LOG_LEVEL` (INFO), `LOG_JSON` (false; true in production), `SENTRY_DSN` | Logs are redacted (SECURITY.md §14) |
| Database | `DATABASE_URL`, `DB_POOL_SIZE` (10), `DB_MAX_OVERFLOW` (20), `DB_ECHO` (false) | Local: `…@127.0.0.1:5433/healindia` |
| Redis | `REDIS_URL` (empty) | §2.6 |
| Auth | `JWT_SECRET`, `JWT_ALGORITHM` (HS256), `JWT_ISSUER`, `JWT_AUDIENCE`, `ACCESS_TOKEN_TTL_MINUTES` (15), `REFRESH_TOKEN_TTL_DAYS` (30), `COOKIE_SECURE` (false), `COOKIE_DOMAIN`, `CORS_ORIGINS`, `CORS_ORIGIN_REGEX` (dev only), `GOOGLE_CLIENT_IDS`, `ADMIN_MFA_REQUIRED` (false), `REQUIRE_EMAIL_VERIFICATION` (false), `RATE_LIMIT_ENABLED` (true) | An empty `JWT_SECRET` outside production means an ephemeral secret: sessions don't survive a restart |
| Encryption | `FIELD_ENCRYPTION_KEY` (32 bytes, base64) | Required in production. Rotation: §6.4. |
| AI | `ANTHROPIC_API_KEY` (empty → rules engine), `AI_MODEL` (`claude-opus-5-5`), `AI_EFFORT` (`medium`), `AI_ENABLED` (true), `AI_TIMEOUT_SECONDS` (90) | |
| Storage | `STORAGE_BACKEND` (`local` / `s3`), `STORAGE_LOCAL_DIR` (`./storage`), `S3_BUCKET`, `S3_ENDPOINT_URL`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `MAX_UPLOAD_MB` (15) | |
| Email | `EMAIL_BACKEND` (`console` / `smtp`), `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_STARTTLS` (true), `EMAIL_FROM` | `console` prints emails to the log |
| Payments | `PAYMENT_GATEWAYS_ENABLED` (`mock,bank_transfer`), `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `BASE_CURRENCY` (INR), `DEFAULT_PATIENT_CURRENCY` (USD) | `mock` is refused in production |
| Worker | `RUN_WORKER_IN_API` (true), `WORKER_POLL_INTERVAL_SECONDS` (2.0) | |
| Dev only | `LOCAL_PG_SUPERUSER_PASSWORD` | Written by `setup-db.ps1`; not read by the app |
| Container only | `FORWARDED_ALLOW_IPS`, `WEB_CONCURRENCY`, `GUNICORN_*`, `RUN_MIGRATIONS` | `backend/Dockerfile`. See SECURITY.md F1 about `FORWARDED_ALLOW_IPS`. |

Business settings (commission, GST/TDS rates, deposit %, hold and cycle days, refund policy, bank-transfer
details, currencies) live in the `platform_settings` table and are edited in Admin → Settings
(`PUT /admin/settings/{key}`; finance keys need F).

**Website & contact settings** (`app/core/site_settings.py`) are `platform_settings` keys too, edited by a
**super admin only** in Admin → System → Website & contact (`/gahi/settings/website`; other staff can view; every
change is audit-logged as `settings.update`). The public website reads them from `GET /api/v1/site-config` and
is refreshed within seconds through the `catalog.revalidate_website` job with tag `site` (needs
`REVALIDATE_SECRET` + `WEBSITE_REVALIDATE_URL`; otherwise after the website's 5-minute refresh).

| Key | What | Was |
|---|---|---|
| `helplines` | WhatsApp, phone / 24x7 helpline, emergency number (also `GET /content/helplines` for the patient app), public email, support hours, WhatsApp prefilled message | website env `NEXT_PUBLIC_WHATSAPP_NUMBER`, `NEXT_PUBLIC_PHONE_NUMBER`, `NEXT_PUBLIC_CONTACT_EMAIL` |
| `website_floating_buttons` | show the WhatsApp / Call floating buttons | - |
| `website_social_links` | Facebook, Instagram, LinkedIn, X, YouTube URLs | `NEXT_PUBLIC_SOCIAL_PROFILES` |
| `website_analytics` | none / plausible / ga4 + domain, script URL, GA4 ID (CSP follows) | `NEXT_PUBLIC_ANALYTICS_*` |
| `website_search_verification` | Google + Bing verification codes, IndexNow key (server-side only: `GET /api/v1/site-config/server` with the revalidate secret) | `GOOGLE_SITE_VERIFICATION`, `BING_SITE_VERIFICATION`, `INDEXNOW_KEY` |
| `website_marketing` | savings %, home stats (value, source, show), wait text, testimonials switch | `content/site/marketing.json` |
| `website_reviewers` | medical reviewers (id, name, credentials, registration no. + council, bio, photo URL, active) | `content/site/reviewers.json` |
| `website_footer` | "Developed by" name + URL, footer disclaimer | hard-coded |

The website env variables and the `content/site/*.json` files remain as fallbacks (API unreachable or value
empty). Phone numbers that are unset, or the old placeholders `+91-11-4000-0000` / `+91-90000-00000`, are
never published: the matching button is hidden.

---

## 3. Background jobs

### 3.1 How the queue works (`app/core/jobs.py`)

* **Outbox:** jobs are rows in `background_jobs`, inserted in the same transaction as the business change and
  claimed with `FOR UPDATE SKIP LOCKED`. Delivery is at least once, so tasks are idempotent.
* **Retries:** a failing task is retried after 30 s·2^(attempt−1) (capped at 6 h) until `max_attempts` (5 by
  default; `screening.run_ai` 3, periodic jobs 3, `settlements.execute_payout` 8). It then becomes `dead`.
  `PermanentJobError` marks it `failed` at once. Default task timeout: 900 s.
* **Crash recovery:** jobs `running` with `locked_at` older than **30 min** are re-queued, or marked `dead` if
  out of attempts. The worker's scheduler checks every 60 s.
* **Dedupe:** while a job with the same `dedupe_key` is `queued`/`running`, another enqueue is skipped.
* **Periodic jobs** run once per time bucket, `floor(unix_time / every_seconds)` (dedupe key
  `periodic:<name>:<bucket>`). Daily jobs therefore start just after **00:00 UTC (05:30 IST)**, hourly jobs at
  the top of each UTC hour. A bucket missed while no worker was running is skipped; the jobs are state-based
  and catch up on the next run.
* **Housekeeping:** `jobs.cleanup` deletes succeeded jobs after 14 days and failed or dead jobs after 90 days.

### 3.2 Job catalogue

| Name | Kind / schedule | Module | Purpose |
|---|---|---|---|
| `screening.run_ai` | task, on submit or rerun (dedupe `screening.run_ai:<screening_id>`, timeout 300 s) | screening | Triage (Claude or rules) and matching for a `processing` screening |
| `email.send` | task | core (`app/core/email.py`) | Send one email (SMTP, or console in development) |
| `messaging.send_email` | task (timeout 120 s) | messaging | Notification emails (welcome, case and booking updates…) |
| `cases.realtime_push` | task (timeout 30 s) | cases | Deliver WebSocket events after the transaction commits |
| `cases.expire_quotes` | periodic, **hourly** | cases | `sent` quotes past `valid_until` become `expired` |
| `cases.expire_unpaid_bookings` | periodic, **every 6 h** | cases | Cancel `pending_payment` bookings whose admission date has passed |
| `payments.expire_orders` | periodic, **every 5 min** | payments | **Payment order expiry:** `created` orders past `expires_at` (30 min; bank transfer 7 days) become `expired` |
| `payments.mark_overdue` | periodic, **hourly** | payments | `due` installments past their due date become `overdue` |
| `payments.process_webhook` | task (dedupe `wh:<id>`) | payments | Re-process a stored webhook whose inline processing failed |
| `payments.process_refund` | task (dedupe `refund:<id>`) | payments | Send an approved refund to the gateway |
| `payments.render_invoice` | task (dedupe `inv:<id>`) | payments | Render and store a receipt PDF |
| `ledger.sweep_gateway_settlements` | periodic, **daily** (timeout 600 s) | ledger | Move captured funds older than T+2 (bank transfers immediately) from `GATEWAY:*:RECEIVABLE` to `PLATFORM:BANK` |
| `settlements.mark_eligible` | periodic, **hourly** | settlements | Settlement items `pending → eligible` once the hold period has passed |
| `settlements.auto_batch` | periodic, **daily** | settlements | One `pending_approval` batch per payee whose settlement cycle is due |
| `settlements.execute_payout` | task, on batch processing (Route payouts; up to 8 attempts) | settlements | Razorpay Route transfer for one payout |
| `jobs.cleanup` | periodic, **daily** | core | Purge finished jobs |

The authoritative list is whatever the code registers. Print it with:

```powershell
cd C:\NewProjects\ForHosp\backend
.venv\Scripts\python -c "from app.core.events import load_module_hooks; from app.core.jobs import list_tasks, list_periodic; load_module_hooks(); print(sorted(list_tasks())); print({k: v.every_seconds for k, v in list_periodic().items()})"
```

### 3.3 Inspecting the queue

```sql
-- backlog and failures per task
SELECT task_name, status, COUNT(*) FROM background_jobs GROUP BY 1, 2 ORDER BY 1, 2;
-- due but not picked up (worker down or overloaded)
SELECT task_name, COUNT(*), MIN(run_at) FROM background_jobs
WHERE status = 'queued' AND run_at < now() - interval '5 minutes' GROUP BY 1;
-- recent dead/failed jobs with their error
SELECT id, task_name, attempts, max_attempts, finished_at, left(last_error, 300) AS error
FROM background_jobs WHERE status IN ('dead', 'failed') ORDER BY finished_at DESC LIMIT 50;
```

---

## 4. Health, metrics, logs

| Endpoint | Response | Use |
|---|---|---|
| `GET /health/live` | `200 {"status": "ok"}` | Liveness (process up). Used by the container `HEALTHCHECK`. |
| `GET /health/ready` | `200 {"status": "ok", "checks": {"database": "ok", "redis": "ok\|disabled"}}`, or `503` (`service_unavailable`, checks in `details`) | Readiness (load balancer). DB ping timeout 5 s, Redis 3 s. |
| `GET /metrics` | Prometheus text | HTTP request counts and latency histograms per route (status grouped `2xx`/`4xx`/`5xx`). The edge returns 404 for `/metrics`. In production the API serves it only to private/loopback peers. Scrape `api:8000` from inside the network. |

These endpoints sit at the server root (no `/api/v1`) and are excluded from the access log.

**Logs:** structlog, one line per request (`request_id`, method, path without query, status, duration, client
IP). Set `LOG_JSON=true` in production. Every response carries `X-Request-ID`, which also appears in error
bodies, so search the logs by it. Locally, logs go to each process window. In compose:
`docker compose -f infra/docker-compose.yml logs -f api worker`.

**Suggested alerts:**

* `/health/ready` failing;
* 5xx rate above 1 %;
* queue backlog (§3.3) or any `dead` job;
* `webhook_events` with `processing_error` or invalid-signature spikes (PAYMENTS.md §11 step 7);
* payouts `failed`/`reversed`;
* AI fallback rate:
  `SELECT status, COUNT(*) FROM ai_request_logs WHERE created_at > now() - interval '1 hour' GROUP BY 1`;
* log events `payments.amount_differs` and `refund.auto_create` bursts;
* daily trial balance ≠ 0.

---

## 5. Backup and restore (the `healindia` database only)

Rules:

* Use the `healindia` role and only the `healindia` database on **127.0.0.1:5433**. Never dump or restore
  the shared cluster or other projects' databases.
* Store backups **outside the repository**. With real patient data, encrypt them (for example on a
  BitLocker volume).
* Production uses managed or WAL-based point-in-time recovery: [DEPLOYMENT.md](DEPLOYMENT.md) §4. Logical
  dumps complement it.

### 5.1 Back up

```powershell
. C:\NewProjects\ForHosp\scripts\env.ps1
$line = Get-Content C:\NewProjects\ForHosp\backend\.env | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
if ($line -notmatch '://([^:]+):([^@]+)@') { throw 'DATABASE_URL not found' }
$env:PGPASSWORD = $Matches[2]                                   # process-local, never echoed
$dir = 'C:\NewProjects\backups\healindia'; New-Item -ItemType Directory -Force $dir | Out-Null
$file = Join-Path $dir ("healindia-{0:yyyyMMdd-HHmm}.dump" -f (Get-Date))
pg_dump -h 127.0.0.1 -p 5433 -U healindia -Fc -f $file healindia
pg_restore --list $file | Select-Object -First 5                 # sanity check: readable archive
Remove-Item Env:PGPASSWORD
```

Back up `backend\storage` (or the S3/MinIO bucket) at the same time. Document rows without their files, or
files without rows, are the usual restore surprise.

### 5.2 Restore drill (recommended monthly): scratch database

```powershell
# (PGPASSWORD set as in 5.1)
createdb   -h 127.0.0.1 -p 5433 -U healindia -O healindia -E UTF8 -T template0 healindia_restore_check
pg_restore -h 127.0.0.1 -p 5433 -U healindia -d healindia_restore_check --no-owner --role=healindia --exit-on-error $file
psql -h 127.0.0.1 -p 5433 -U healindia -d healindia_restore_check -c "SELECT SUM(CASE WHEN direction='debit' THEN amount_minor ELSE -amount_minor END) AS trial_balance FROM ledger_entries;"
dropdb     -h 127.0.0.1 -p 5433 -U healindia healindia_restore_check
```

The trial balance must be `0`. Compare row counts of key tables with production. `citext`, `pg_trgm`,
`btree_gin` and `pgcrypto` are trusted extensions, so the database owner can recreate them during the
restore.

### 5.3 Full restore of `healindia` (data loss beyond the backup point)

1. Stop the API, the worker and any `dev.ps1` windows. Take a fresh backup of the current state (§5.1), even
   if it's broken.
2. Recreate and restore:

   ```powershell
   dropdb     -h 127.0.0.1 -p 5433 -U healindia healindia
   createdb   -h 127.0.0.1 -p 5433 -U healindia -O healindia -E UTF8 -T template0 healindia
   pg_restore -h 127.0.0.1 -p 5433 -U healindia -d healindia --no-owner --role=healindia --exit-on-error --single-transaction $file
   ```

   Restoring into a freshly created database avoids `--clean`, which would try to drop the extensions
   (owned by the cluster superuser) and fail.
3. `cd backend; .venv\Scripts\python -m alembic current` shows the head revision. Run
   `alembic upgrade head` if the backup is older than the code.
4. Restore the matching document storage snapshot.
5. Start the API and worker, then run PAYMENTS.md §11. Payments captured after the backup point exist at the
   gateways but not in the database. Recover them with the gateway dashboards and the sync procedure in §6.3.

**Compose deployment:**

```bash
docker compose -f infra/docker-compose.yml exec -T postgres pg_dump -U healindia -Fc healindia > healindia.dump
```

Restore by piping into `pg_restore -U healindia -d healindia` inside the container, following the same
create-fresh steps.

### 5.4 Left-over test databases

Interrupted test runs can leave `hig_test_*` databases behind. Only those names may be dropped:

```powershell
psql -h 127.0.0.1 -p 5433 -U healindia -d healindia -Atc "SELECT datname FROM pg_database WHERE datname LIKE 'hig\_test\_%'"
dropdb -h 127.0.0.1 -p 5433 -U healindia <hig_test_name>
```

---

## 6. Runbooks

**Ops scripts.** Several runbooks use short Python scripts. Save each one **outside the repository** (for
example `%TEMP%\hig-ops\unlock_user.py`) and run it from the backend folder:
`cd C:\NewProjects\ForHosp\backend; .venv\Scripts\python $env:TEMP\hig-ops\unlock_user.py …`. The editable
install makes `app` importable, and settings load `backend\.env` automatically. Every script writes an
`audit_logs` row (`actor_role="ops"`). Pass a ticket reference so the audit trail explains why. Try them on
staging before production.

### 6.1 Stuck or dead jobs

1. Inspect (§3.3). Look at `last_error` and the worker logs (`jobs.retry_scheduled`, `jobs.dead`).
2. **Nothing is running:** the worker isn't started, or `RUN_WORKER_IN_API=false` without a separate worker.
   Start it. Jobs stuck in `running` for more than 30 min are re-queued automatically.
3. **Dead job:** fix the cause first (credentials, gateway outage, bad data), then requeue:

   ```sql
   UPDATE background_jobs
      SET status = 'queued', attempts = 0, run_at = now(), locked_at = NULL, locked_by = NULL,
          finished_at = NULL, last_error = NULL
    WHERE id = '<job id>' AND status IN ('dead', 'failed');
   ```

   If this violates the `dedupe_key` unique index, an equivalent job is already queued: leave it.
4. **Run a periodic job now** (for example after an outage) instead of waiting for its bucket:

   ```python
   # run_periodic_now.py <task_name>
   import asyncio, sys
   from datetime import UTC, datetime
   from app.core.db import session_scope
   from app.core.events import load_module_hooks
   from app.core.jobs import enqueue

   async def main(name: str) -> None:
       load_module_hooks()
       async with session_scope() as db:
           job = await enqueue(db, name, {}, dedupe_key=f"manual:{name}:{datetime.now(UTC):%Y%m%d%H%M}")
       print("queued" if job else "already queued", name)

   asyncio.run(main(sys.argv[1]))
   ```

   Then `.venv\Scripts\python -m app.worker --once` (or let the running worker pick it up).

### 6.2 Failed payouts

1. Find them: Admin → Finance → Settlements → Payouts (status `failed`/`reversed`), or PAYMENTS.md §11 step 6.
   Read `failure_reason`.
2. What already happened automatically: the payout's settlement items went back to **`eligible`**, and the
   batch shows `partially_failed`. A payout marked failed **after** it was processed (funds bounced) is
   `reversed`, and its ledger posting was reversed (`payout_reversal:<id>`).
3. Fix the cause:

   | `failure_reason` / symptom | Action |
   |---|---|
   | "no verified payout account for this payee" | The payee adds or updates the account. Finance checks the bank proof and calls `POST /finance/payout-accounts/{id}/verify`. Changing account details resets verification. |
   | "payee balance in this batch is not positive" | Clawbacks exceed earnings. Nothing to pay; items carry forward. |
   | Razorpay Route error (linked account not activated, KYC pending, insufficient balance) | Complete linked-account KYC in the Razorpay Dashboard, or fund the Razorpay balance. `settlements.execute_payout` retried transient errors up to 8 times. Check `background_jobs` for a `dead` job (§6.1). |
   | Bank return after a manual transfer | Confirm with the bank statement, then `POST /finance/settlements/payouts/{id}/mark-failed {"reason": "…", "reference": "<bank return ref>"}`; a **second** finance user applies it with `…/mark-failed/approve` (sets `reversed` and reverses the ledger) |
| `needs_reconciliation` (Razorpay timeout / 5xx; never re-sent automatically) | Look up the transfer in the Razorpay dashboard by `notes.payout_id`. Found: `mark-paid {"utr": "trf_…"}` + `mark-paid/approve`. Not found: `mark-failed {reason, reference}` + `mark-failed/approve`, then batch again |
| "payout account changed since the batch was generated" | Expected after a destination change: check the change in the audit log, then regenerate the batch (it snapshots the new account) |

4. Pay again: the next `settlements.auto_batch`, or finance generates a batch for that payee
   (`POST /finance/settlements/batches {"payee_type": "hospital", "payee_id": "…"}`). A **different** finance
   user approves it, then it is processed.
5. Manual bank transfers stay `processing` until finance records the bank reference with
   `POST /finance/settlements/payouts/{id}/mark-paid {"utr": "…"}`. Never mark paid without a UTR from the
   bank statement, and have a second finance user check it.

### 6.3 Webhook replay and missed webhooks

Background: PAYMENTS.md §5.2. Detection queries: PAYMENTS.md §11 step 7.

1. **Stored, processing failed** (`processing_error` set, `processed_at` NULL): `payments.process_webhook`
   retries automatically with backoff. If its job is `dead`, fix the cause and requeue it (§6.1). Or enqueue a
   fresh run (the processor skips already-processed and invalid-signature rows):

   ```python
   # reprocess_webhook.py <webhook_events.id>
   import asyncio, sys
   from app.core.db import session_scope
   from app.core.events import load_module_hooks
   from app.core.jobs import enqueue

   async def main(event_row_id: str) -> None:
       load_module_hooks()
       async with session_scope() as db:
           await enqueue(db, "payments.process_webhook", {"webhook_event_id": event_row_id},
                         dedupe_key=f"wh:{event_row_id}")
       print("queued", event_row_id)

   asyncio.run(main(sys.argv[1]))
   ```

2. **Verified but unmatched** (`processed_at` **and** `processing_error` like "No matching …"): the event
   refers to an order or refund we don't know. Typical causes are test-mode and live-mode webhooks crossed
   between environments, or an order created in another environment. These rows aren't retried. If the cause
   is fixed and the event must be applied, run `UPDATE webhook_events SET processed_at = NULL WHERE id =
   '<id>';` and then step 1. Processing is idempotent.
3. **Never arrived** (no row at all):
   * Stripe: Dashboard → Developers → Webhooks → endpoint → event → **Resend**.
   * Razorpay retries failed deliveries automatically for a period (check the current policy and the
     webhook delivery status in the Dashboard).
   * A redelivered event with an id we already stored is acknowledged as `duplicate`.
4. **Payment captured at the gateway but the order is still open**, with no webhook and no client verify.
   This will be an API endpoint later (PAYMENTS.md §14 #16). Until then, finance can apply it with the ops
   script below. It uses the same idempotent capture path as verify, so running it twice is harmless.

   ```python
   # sync_gateway_payment.py <order_number> <gateway_payment_id>
   import asyncio, sys
   from sqlalchemy import select
   from app.core.db import session_scope
   from app.core.events import load_module_hooks
   from app.models import PaymentOrder
   from app.modules.payments import service
   from app.modules.payments.gateways import get_gateway
   from app.modules.payments.gateways.base import GatewayPaymentStatus

   async def main(order_number: str, payment_id: str) -> None:
       load_module_hooks()   # REQUIRED: registers the cases/ledger/settlements/messaging subscribers
       async with session_scope() as db:
           order = (await db.execute(
               select(PaymentOrder).where(PaymentOrder.order_number == order_number))).scalar_one()
           gateway = get_gateway(order.gateway)
           info = await gateway.fetch_payment(payment_id)
           if info.gateway_order_id != order.gateway_order_id:
               raise SystemExit("payment belongs to a different gateway order")
           if info.status == GatewayPaymentStatus.AUTHORIZED:
               await gateway.capture_payment(info.gateway_payment_id, info.amount_minor, info.currency)
               info.status = GatewayPaymentStatus.CAPTURED
           if info.status != GatewayPaymentStatus.CAPTURED:
               raise SystemExit(f"gateway status is {info.status}; nothing to apply")
           payment = await service.capture_order(db, order.id, info, source="ops_sync")
       print("captured", payment.id)

   asyncio.run(main(sys.argv[1], sys.argv[2]))
   ```

   For Stripe, pass the PaymentIntent id (`pi_…`), which is the order's `gateway_order_id`.

### 6.4 Secret rotation

General: generate new values per environment, change one secret at a time, restart **all** API and worker
processes together, then watch logs, `/health/ready` and webhook processing. `ENV=production` refuses to
start with a weak `JWT_SECRET` (< 32 chars), a missing `FIELD_ENCRYPTION_KEY`, `COOKIE_SECURE=false` or the
`mock` gateway.

| Secret | Procedure | User impact |
|---|---|---|
| `JWT_SECRET` | New value (`python -c "import secrets; print(secrets.token_urlsafe(48))"`), put it in the secret store or `.env`, restart all API processes at once (mixed secrets give random 401s) | Access tokens fail with `invalid_token`; clients refresh transparently (refresh tokens are opaque DB rows). WebSockets reconnect. |
| `DATABASE_URL` password | **Local:** change the password in `DATABASE_URL` (alphanumeric), re-run `setup-db.ps1` (it runs `ALTER ROLE … PASSWORD` to match), restart. **Prod:** `ALTER ROLE` with the DB admin, update the secret, rolling restart. | Brief restart |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Regenerate in the Razorpay Dashboard (API keys), deploy right away | Checkout and refunds fail until deployed |
| `RAZORPAY_WEBHOOK_SECRET` | Set the new secret on the webhook in the Dashboard and in config at the same time, restart | Deliveries in between get 400 `invalid_signature` and are retried by Razorpay. Afterwards run §6.3. |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Roll in the Stripe Dashboard with an expiry for the old value, deploy, let the old one expire | None: the verifier accepts any matching `v1` signature |
| `ANTHROPIC_API_KEY` | Create a new key in the Anthropic Console, deploy, restart the worker (and the API with an embedded worker), revoke the old key | None (screenings fall back to rules if the key is invalid) |
| `SMTP_PASSWORD`, `S3_SECRET_ACCESS_KEY`, `REDIS_URL` password | Provider console, then config, then restart | Brief |
| **`FIELD_ENCRYPTION_KEY`** | Offline re-encryption (below) | Maintenance window |

**Rotate `FIELD_ENCRYPTION_KEY`.** The key encrypts `users.mfa_secret`, `patient_profiles.passport_number`,
`patient_profiles.insurance_policy_number`, `patient_companions.passport_number`, `hospitals.pan` and
`payout_accounts.account_number`. Ciphertexts (`v1:…`) carry no key id, so all values must be re-encrypted
in one go while nothing else writes:

1. Announce a maintenance window. **Stop every API and worker process.**
2. Take a backup (§5.1) and record which key it was made with. **Keep the old key, escrowed, for as long as
   any backup encrypted with it is retained.**
3. Generate the new key straight into your secret store or editor buffer, not into shell history:
   `python -c "import base64, secrets; print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())"`.
4. Run the script below. It reads the **current** key from settings and **prompts** for the new key (input
   hidden), then re-encrypts all six columns in **one transaction**. Any error rolls everything back.

   ```python
   # reencrypt_fields.py  (API and worker must be stopped)
   import asyncio, base64, binascii, getpass, os
   from cryptography.hazmat.primitives.ciphers.aead import AESGCM
   from sqlalchemy import text
   from app.core.config import settings
   from app.core.db import session_scope

   COLUMNS = [("users", "mfa_secret"), ("patient_profiles", "passport_number"),
              ("patient_profiles", "insurance_policy_number"), ("patient_companions", "passport_number"),
              ("hospitals", "pan"), ("payout_accounts", "account_number")]
   PREFIX = "v1:"

   def load_key(raw: str) -> AESGCM:
       raw = raw.strip(); padded = raw + "=" * (-len(raw) % 4)
       for decode in (base64.b64decode, base64.urlsafe_b64decode):
           try:
               key = decode(padded.encode("ascii"))
           except (binascii.Error, ValueError):
               continue
           if len(key) == 32:
               return AESGCM(key)
       raise SystemExit("key must be 32 bytes, base64 encoded")

   async def main() -> None:
       old = load_key(settings.FIELD_ENCRYPTION_KEY)
       new_raw = getpass.getpass("New FIELD_ENCRYPTION_KEY (hidden): ")
       if new_raw.strip() == settings.FIELD_ENCRYPTION_KEY.strip():
           raise SystemExit("the new key equals the current key")
       new = load_key(new_raw)
       async with session_scope() as db:            # single transaction, all or nothing
           for table, column in COLUMNS:
               rows = (await db.execute(text(
                   f"SELECT id, {column} FROM {table} WHERE {column} IS NOT NULL FOR UPDATE"))).all()
               for row_id, token in rows:
                   if not token.startswith(PREFIX):
                       raise SystemExit(f"unexpected format in {table}.{column} id={row_id}")
                   blob = base64.urlsafe_b64decode(token[len(PREFIX):])
                   plain = old.decrypt(blob[:12], blob[12:], None)       # raises if the old key is wrong
                   nonce = os.urandom(12)
                   fresh = PREFIX + base64.urlsafe_b64encode(nonce + new.encrypt(nonce, plain, None)).decode()
                   await db.execute(text(f"UPDATE {table} SET {column} = :v WHERE id = :id"),
                                    {"v": fresh, "id": row_id})
               print(f"{table}.{column}: {len(rows)} value(s) re-encrypted")
       print("Done. Set FIELD_ENCRYPTION_KEY to the new key, then start the API and worker.")

   asyncio.run(main())
   ```

5. Replace `FIELD_ENCRYPTION_KEY` in the secret store (`backend\.env` locally) with the new key. Edit the file
   directly; don't echo the value.
6. Start the API and worker. Verify a decrypt path: a staff MFA login, `GET /patient/profile` showing
   `passport_last4`, a payout-account list showing the masked number. Rehearse the whole procedure on staging
   first.

### 6.5 Re-run AI screening

* **Patient or agent self-service:** `POST /api/v1/screenings/{id}/rerun` (completed or failed screenings;
  5/min per user). The stored `consent_ai` is reused, so a non-consented screening never goes to Claude.
* **After an AI outage** (screenings answered by the rules engine):

  ```sql
  SELECT status, left(error, 120) AS error, COUNT(*) FROM ai_request_logs
  WHERE created_at > now() - interval '1 day' GROUP BY 1, 2 ORDER BY 3 DESC;

  -- candidates: consented, AI wanted, answered by rules
  SELECT id, status, submitted_at FROM screenings
  WHERE ai_engine = 'rules' AND consent_ai
    AND COALESCE((preferences->>'use_ai')::boolean, true)
    AND submitted_at > now() - interval '1 day'
  ORDER BY submitted_at;
  ```

  Re-run selected screenings (this replaces their triage and matches, so tell the patients or coordinators):

  ```python
  # rerun_screening.py <screening_id> <ticket>
  import asyncio, sys, uuid
  from datetime import UTC, datetime
  from app.core.audit import audit_log
  from app.core.db import session_scope
  from app.core.enums import ScreeningStatus
  from app.core.jobs import enqueue
  from app.models import Screening
  from app.modules.screening.service import RUN_AI_TASK

  async def main(screening_id: str, ticket: str) -> None:
      async with session_scope() as db:
          s = await db.get(Screening, uuid.UUID(screening_id), with_for_update=True)
          if s is None or s.status not in (ScreeningStatus.COMPLETED, ScreeningStatus.FAILED):
              raise SystemExit("screening not found or not completed/failed")
          s.status, s.submitted_at, s.completed_at, s.error = (
              ScreeningStatus.PROCESSING, datetime.now(UTC), None, None)
          await enqueue(db, RUN_AI_TASK, {"screening_id": str(s.id)},
                        dedupe_key=f"{RUN_AI_TASK}:{s.id}", max_attempts=3)
          await audit_log(db, actor=None, actor_role="ops", action="screening.rerun",
                          entity_type="screening", entity_id=s.id, after={"ticket": ticket})
      print("queued", screening_id)

  asyncio.run(main(sys.argv[1], sys.argv[2]))
  ```

* **Stuck in `processing` for more than 15 min:** check for the job
  (`SELECT status, attempts, last_error FROM background_jobs WHERE dedupe_key = 'screening.run_ai:<id>' ORDER BY created_at DESC LIMIT 1;`).
  Start the worker or requeue a dead job (§6.1).

### 6.6 Unlock a user

Lockouts expire by themselves after 15 minutes. If waiting isn't acceptable (for example a coordinator during
an emergency), verify the person, then:

```python
# unlock_user.py <email> <ticket>
import asyncio, sys
from sqlalchemy import select
from app.core.audit import audit_log
from app.core.db import session_scope
from app.models import User

async def main(email: str, ticket: str) -> None:
    async with session_scope() as db:
        user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if user is None:
            raise SystemExit("no such user")
        before = {"failed_login_count": user.failed_login_count, "locked_until": user.locked_until}
        user.failed_login_count, user.locked_until = 0, None
        await audit_log(db, actor=None, actor_role="ops", action="user.unlock", entity_type="user",
                        entity_id=user.id, before=before, after={"ticket": ticket})
    print("unlocked", email)

asyncio.run(main(sys.argv[1], sys.argv[2]))
```

Suspended accounts are different. An admin reactivates them with `PATCH /api/v1/admin/users/{id}
{"status": "active"}` (AD, audited). Repeated lockouts of staff accounts can mean a targeted attack: check
`audit_logs` (`auth.account_locked`) and the source IPs before unlocking.

### 6.7 MFA reset (lost authenticator)

1. **Verify identity out of band**: video call against the staff ID or HR record, or the hospital owner
   confirming for a hospital user. Get approval from a second admin and record both in the ticket.
2. Run the script. It disables MFA, **invalidates the current password** (sets an unusable random hash) and
   revokes all sessions. With `ADMIN_MFA_REQUIRED=true`, staff re-enrol at sign-in after only a password, so
   the old password must stop working (SECURITY.md F14).

   ```python
   # reset_mfa.py <email> <ticket>
   import asyncio, secrets, sys
   from datetime import UTC, datetime
   from sqlalchemy import select, update
   from app.core.audit import audit_log
   from app.core.db import session_scope
   from app.core.security import hash_password
   from app.models import RefreshToken, User

   async def main(email: str, ticket: str) -> None:
       async with session_scope() as db:
           user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
           if user is None:
               raise SystemExit("no such user")
           user.mfa_enabled, user.mfa_secret = False, None
           user.password_hash = hash_password(secrets.token_urlsafe(32))   # forces "Forgot password"
           user.failed_login_count, user.locked_until = 0, None
           result = await db.execute(update(RefreshToken)
                                     .where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
                                     .values(revoked_at=datetime.now(UTC)))
           await audit_log(db, actor=None, actor_role="ops", action="user.mfa_reset", entity_type="user",
                           entity_id=user.id, after={"ticket": ticket, "sessions_revoked": result.rowcount})
       print("MFA reset; user must use Forgot password, then enrol a new authenticator")

   asyncio.run(main(sys.argv[1], sys.argv[2]))
   ```

3. While still on the call, the user runs **Forgot password** (the email proves control of the mailbox), sets
   a new password, signs in and enrols the new authenticator. Staff are prompted automatically. Others
   re-enable MFA under Profile → Security.

### 6.8 Revoke all sessions (security incident)

```sql
UPDATE refresh_tokens SET revoked_at = now() WHERE revoked_at IS NULL;
```

Then rotate `JWT_SECRET` (§6.4) so outstanding access tokens die immediately instead of within 15 minutes.
For a single compromised account, suspend it (`PATCH /admin/users/{id} {"status": "suspended"}`); that takes
effect on the next request.

### 6.9 FX rates and ledger corrections

* **FX:** keep a current row in `fx_rates` (Admin → Content → FX rates) for every currency in
  `supported_currencies`. Missing currencies silently fall back to the illustrative `DEFAULT_FX_RATES` (§14
  #13 in PAYMENTS.md). Check with
  `SELECT quote_currency, rate, source, as_of FROM fx_rates WHERE base_currency = 'INR' ORDER BY as_of;`.
* **Ledger:** never UPDATE or DELETE ledger rows. The triggers reject it (SQLSTATE 23001) by design. There's no
  adjustment endpoint yet (PAYMENTS.md §14 #1). Corrections are engineering-reviewed reversing transactions
  posted with `app.modules.ledger.service.post_transaction`, with a unique idempotency key and two-person
  sign-off.

---

## 7. Demo data seeding

```powershell
cd C:\NewProjects\ForHosp\backend
.venv\Scripts\python -m scripts.seed                    # catalog + demo hospitals, partners, users, patient journeys
.venv\Scripts\python -m scripts.seed --minimal          # reference catalog only (+ staff accounts outside production)
.venv\Scripts\python -m scripts.seed --reset            # TRUNCATE all app tables first (refused when ENV=production)
.venv\Scripts\python -m scripts.seed --skip-journeys    # everything except the API-driven demo journeys
.venv\Scripts\python -m scripts.seed --no-time-travel   # never move the clock for the "completed" journey
.venv\Scripts\python -m scripts.seed --create-schema    # create extensions + tables (temporary/dev databases)
```

* Safe to re-run: rows are upserted by natural keys, and existing accounts, statuses and payout accounts are
  not overwritten.
* Demo journeys go through the real API in-process (cases → quotes → bookings → `mock` payments →
  admit/complete), so ledger postings and settlement items are produced by the real event handlers. They need
  `mock` in `PAYMENT_GATEWAYS_ENABLED` (the default).
* Demo accounts (all fictional) share a **demo-only** password documented in `backend/scripts/seed.py`:
  * staff `superadmin@`, `admin@`, `finance1@`, `finance2@` (two finance users for maker-checker),
    `support@healindia.example`;
  * agent `agent.lagos@healindia.example`;
  * patient `patient.us@healindia.example`;
  * hospital owners `owner.<hospital-slug>@healindia.example`.
* Demo accounts are never created with `ENV=production`, and a production database must not contain them
  (DEPLOYMENT.md §15).

---

## 8. Routine checklist

| Cadence | Task |
|---|---|
| Daily | PAYMENTS.md §11 reconciliation; dead jobs and queue backlog (§3.3); webhook gaps; failed payouts; FX rates updated; approve settlement batches (two finance users) |
| Weekly | Verify that the latest backup restores (`pg_restore --list`); review new staff accounts and role changes (`/admin/audit-logs`); check AI fallback rate and spend |
| Monthly | GST/TDS remittance and the S8 adjustment (PAYMENTS.md §8.2); scratch-database restore drill (§5.2); dependency updates through CI |
| Quarterly | Full restore drill with RPO/RTO recorded (DEPLOYMENT.md §4); access review (staff, hospital members, finance); rotation drill on staging (§6.4) |
| Yearly | Penetration test; incident-response tabletop; review of this runbook and SECURITY.md |
