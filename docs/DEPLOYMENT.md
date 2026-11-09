# Heal India Global - Deployment Guide and Production Checklist

The reference deployment is the Docker Compose stack in `infra/` (single host or a small VM fleet). The same
images run unchanged on Kubernetes, ECS or similar; the sections below describe what must be true in production
regardless of the orchestrator.

For the AWS (Terraform) and Kubernetes targets see [deploy/README.md](../deploy/README.md); its "Known gaps"
section lists what they still need to match this stack (single-domain routing, the website service, split
database roles).

## 1. Components

Everything is served from **one domain** (`SITE_DOMAIN`) with path routing (PLAN §3.1;
`infra/nginx/snippets/app-locations.conf` is the source of truth):

| Path | Upstream | Notes |
|---|---|---|
| `/` (incl. `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`) | `website` :3000 | Public website and the **public door** for patients, agents and hospital users |
| `/app/`, `/agent/`, `/hospital/` | `web` :8081 / :8082 / :8083 | Patient, agent and hospital SPAs (prefix stripped by the edge) |
| `/gahi/` | `web` :8084 | **Staff door** + admin console (`admin`, `finance`, `support`, `super_admin`; web only). `X-Robots-Tag: noindex`; optional network allow-list in `snippets/staff-access.conf` |
| `/api/` | `api` :8000 | REST, WebSocket `/api/v1/ws`, payment webhooks (not IP-limited). Stricter limits on `/api/v1/auth/` and `/api/v1/auth/staff/` |
| `/health` | `api` | Probes. `/metrics` returns 404 at the edge |

| Service | Image / source | Notes |
|---|---|---|
| `edge` | `nginx:1.27-alpine` + `infra/nginx/` | Only public entry point (:80 redirect + ACME, :443 TLS/HTTP2). Fixed IP (`EDGE_IPV4`); the API trusts forwarded headers from that IP only |
| `website` | `infra/website/Dockerfile` (built from `website/`) | Next.js standalone server, read-only root filesystem, no database access |
| `web` | `web/Dockerfile` | nginx serving the four SPAs on 8081-8084, each built with its Vite `base` |
| `migrate` | API image, one-off | `alembic upgrade head` as `MIGRATOR_DB_USER` (schema owner). `api` and `worker` start only after it exits 0 |
| `api` | `backend/Dockerfile` | gunicorn + uvicorn workers (`WEB_CONCURRENCY`), connects as `APP_DB_USER`, `RUN_MIGRATIONS=0` |
| `worker` | same image, `python -m app.worker` | Background jobs and schedules, `APP_DB_USER`. Scale horizontally |
| `postgres` | `postgres:17` + `infra/postgres/init` | Prefer a managed service (RDS/Cloud SQL/Azure Flexible Server) in production |
| `redis` | `redis:7-alpine` | Password-protected; prefer managed Redis with TLS in production |
| `minio` | optional profile `s3` | Use AWS S3 (ap-south-1) or another managed object store in production |

**Database roles** (`infra/postgres/init/02-roles.sh`, runs on first initialisation; idempotent, re-run it by hand
for an existing volume or after rotating a password):

| Role | Used by | Rights |
|---|---|---|
| `POSTGRES_USER` | init scripts, operators | Bootstrap superuser; never used by the application |
| `MIGRATOR_DB_USER` (`healindia_migrator`) | `migrate` only | Owns the database, schema and tables; no superuser, no CREATEDB/CREATEROLE |
| `APP_DB_USER` (`healindia_app`) | `api`, `worker` | CONNECT + SELECT/INSERT/UPDATE/DELETE via default privileges; no DDL, no TRUNCATE |

(Local development is different: one app role on this project's own PostgreSQL cluster at `127.0.0.1:5433`,
created by `scripts/setup-db.ps1`; see the README.)

### First deployment

```bash
cp infra/.env.example infra/.env               # fill in every secret (see section 3)
# put real certificates in infra/nginx/certs/{fullchain,privkey}.pem (section 2)
docker compose -f infra/docker-compose.yml --env-file infra/.env build
docker compose -f infra/docker-compose.yml --env-file infra/.env up -d
docker compose -f infra/docker-compose.yml --env-file infra/.env ps
curl -fsS https://<SITE_DOMAIN>/health/ready
```

Do **not** seed demo data in production (`python -m scripts.seed` refuses when `ENV=production`; its accounts
share a public demo password). Create the first super_admin through a controlled one-off command, enable TOTP
immediately, then create other staff from the admin console at `/gahi/`.

### Updating

1. Build and tag images in CI (`IMAGE_TAG=<git sha>`), push to your registry.
2. Back up / confirm PITR is healthy (section 4).
3. Run migrations once (`docker compose ... run --rm migrate`, section 5), then roll `api`, `worker`, `web`,
   `website`; reload `edge` if its config changed (`docker compose exec edge nginx -s reload`).
4. Watch error rate, latency and job queue depth for 15 minutes; roll back by redeploying the previous tag
   (migrations must be backward compatible - see section 5).

## 2. TLS

- [ ] A real certificate for `SITE_DOMAIN` (plus `www.` if you enable the redirect block in
      `infra/nginx/templates/edge.conf.template`) in `infra/nginx/certs/fullchain.pem` and `privkey.pem`.
      The `certs-init` service only generates a self-signed fallback when these files are missing. Unknown SNI
      names are rejected at the TLS handshake.
- [ ] Let's Encrypt: the edge serves `/.well-known/acme-challenge/` from the `certbot-webroot` volume. Run certbot
      with `--webroot -w /var/www/certbot` against that volume, copy/link the results into `infra/nginx/certs/`,
      and reload nginx after each renewal (cron/systemd timer, twice daily).
- [ ] Behind a cloud load balancer that terminates TLS: keep TLS to the edge (re-encrypt) or restrict the edge to
      the LB's private network, and configure `set_real_ip_from` in `infra/nginx/snippets/real-ip.conf`.
- [ ] Verify: TLS 1.2+ only, HSTS present, SSL Labs grade A, HTTP redirects to HTTPS. Submit the domains to the
      HSTS preload list only after confirming every subdomain serves HTTPS.
- [ ] `COOKIE_SECURE=true` (enforced when `ENV=production`). Leave `COOKIE_DOMAIN` empty: with one domain the
      refresh cookies (`hig_refresh`, Path `/api/v1/auth`; staff `hig_staff_refresh`, Path `/api/v1/auth/staff`)
      are host-only and same-origin for every portal.

## 3. Secrets management

- [ ] Never commit `.env` files. In production inject secrets from a secret manager (AWS Secrets Manager / SSM,
      GCP Secret Manager, Azure Key Vault, Vault, Doppler) into the container environment; `infra/.env` on disk is
      acceptable only on a hardened single host with `chmod 600` and restricted SSH access.
- [ ] Generate fresh values per environment: `JWT_SECRET` (>= 32 random chars), `FIELD_ENCRYPTION_KEY` (32 random
      bytes, url-safe base64), database, Redis and MinIO passwords, gateway webhook secrets.
- [ ] **`FIELD_ENCRYPTION_KEY` is irrecoverable data**: passports, policy/bank account numbers, PAN and MFA secrets
      are encrypted with it. Store it in at least two secured locations (secret manager + offline escrow). Plan key
      rotation as a re-encryption migration (decrypt with old, encrypt with new) during a maintenance window.
- [ ] Rotating `JWT_SECRET` logs everyone out (access tokens become invalid; refresh tokens are opaque and stored
      hashed, so users can refresh once the API trusts the new secret). Rotate on suspicion of compromise.
- [ ] Separate credentials per environment (dev/staging/prod) and per gateway mode (test vs live keys).
- [ ] Separate database credentials: `POSTGRES_PASSWORD` (operators only), `MIGRATOR_DB_PASSWORD` (migrate job
      only) and `APP_DB_PASSWORD` (api/worker). Use URL-safe (hex) values. Extensions are created by the init
      script / migration, never by the app role.
- [ ] Restrict who can read production secrets; log access; rotate after staff changes.

## 4. Database: backups and point-in-time recovery

- [ ] **Managed PostgreSQL** (recommended): enable automated backups with PITR (>= 14 days retention, 35 for
      financial data comfort), Multi-AZ/high availability, storage autoscaling, encryption at rest, TLS enforced
      (`?ssl=require` in `DATABASE_URL` for asyncpg).
- [ ] **Self-hosted**: continuous WAL archiving with pgBackRest or WAL-G to object storage (encrypted, versioned,
      different account/region), nightly full + incremental backups, `wal_level=replica` (set in compose),
      monitoring of archive lag.
- [ ] Logical dumps in addition (weekly `pg_dump -Fc`) for portability and per-table restores.
- [ ] **Restore drills** every quarter: restore to a scratch instance, run `alembic current`, verify the ledger
      trial balance nets to zero and row counts match. Record RPO/RTO achieved (targets: RPO <= 5 min, RTO <= 1 h).
- [ ] Ledger tables are append-only by trigger - never "fix" data with UPDATE/DELETE; post adjusting transactions.
- [ ] Object storage (documents) needs its own backup: bucket versioning + lifecycle + cross-region replication.

## 5. Migrations

- [ ] Migrations are Alembic revisions in `backend/alembic/versions`, reviewed like code. CI applies them to an
      empty database (`alembic upgrade head`) on every push.
- [ ] Single runner as the schema owner: the compose `migrate` service runs `alembic upgrade head` with
      `MIGRATOR_DB_USER` before `api`/`worker` start; `api` and `worker` keep `RUN_MIGRATIONS=0` (the app role
      cannot run DDL). For a release: `docker compose -f infra/docker-compose.yml --env-file infra/.env run --rm
      migrate`, then roll the services.
- [ ] Expand/contract: add nullable columns / new tables first, deploy code that writes both, backfill in batches,
      then remove old columns in a later release. Never rename or drop in the same release that stops using them.
- [ ] Large tables: `CREATE INDEX CONCURRENTLY` (in an autocommit block), avoid long locks; set
      `lock_timeout`/`statement_timeout` for migration sessions.
- [ ] Take a backup / confirm PITR before any destructive migration; keep downgrade paths for at least one release.

## 6. Scaling the API and workers

- [ ] API is stateless: scale containers (`docker compose up -d --scale api=N` behind the edge upstream, or an
      orchestrator service with N replicas). Per container `WEB_CONCURRENCY` ~ 2 x CPU cores (CPU bound) or more
      for I/O-heavy loads; measure.
- [ ] Connection budget: `(DB_POOL_SIZE + DB_MAX_OVERFLOW) x WEB_CONCURRENCY x api replicas + worker processes`
      must stay below PostgreSQL `max_connections` minus admin headroom. Introduce PgBouncer (transaction pooling)
      before raising `max_connections` far beyond a few hundred.
- [ ] Workers: scale replicas freely (`FOR UPDATE SKIP LOCKED`); watch `background_jobs` queue depth and age of the
      oldest `queued` job; alert on `dead` jobs.
- [ ] Keep `RUN_WORKER_IN_API=false` in production so request latency is not affected by jobs.
- [ ] WebSockets: requires Redis so events reach users connected to any process; the edge keeps upgraded
      connections open for up to 1 hour of inactivity.
- [ ] Autoscale on CPU and p95 latency; set graceful timeouts (`stop_grace_period`) so in-flight requests and jobs
      finish during rollouts.

## 7. Redis

- [ ] Password (`requirepass`) always; TLS (`rediss://`) on managed services; no public exposure (the compose
      `data` network is internal).
- [ ] Used for cache, rate-limit counters and WebSocket fan-out - not as a system of record (jobs live in
      PostgreSQL). `allkeys-lru` eviction with a `maxmemory` cap is therefore safe; AOF enabled to survive restarts.
- [ ] Monitor memory, evictions, connected clients, latency. The app degrades to in-memory fallbacks if Redis is
      unavailable, but rate limits then become per-process - alert on Redis outages.

## 8. Object storage (S3)

- [ ] `STORAGE_BACKEND=s3`, private bucket (block all public access), SSE-S3 or SSE-KMS encryption, versioning
      enabled, lifecycle rules for old versions, access logs on.
- [ ] Least-privilege IAM credentials limited to the bucket (`s3:GetObject`, `PutObject`, `DeleteObject`,
      `ListBucket`); prefer instance/task roles over static keys.
- [ ] Store data in India (`ap-south-1` Mumbai / `ap-south-2` Hyderabad) unless a documented transfer basis exists.
- [ ] Files are only ever served through the API's authorised download endpoint - never via public URLs.
- [ ] Local storage (`STORAGE_BACKEND=local`) is acceptable only for single-host deployments; back up the
      `storage` volume.

## 9. Monitoring and alerting

- [ ] Health: `/health/live` (process) and `/health/ready` (database + Redis) for load balancers and orchestrators;
      `/nginx-health` for the edge.
- [ ] Metrics: Prometheus scrapes `api:8000/metrics` on the private network (the edge returns 404 for
      `/metrics`). Dashboards: request rate, error rate, p50/p95/p99 latency per route, DB pool usage, job queue
      depth/age, AI call latency and fallback rate (`ai_request_logs`), payment success rate, webhook failures.
- [ ] Alerts (paging): 5xx rate > 2% for 5 min, p95 > 2 s, `/health/ready` failing, dead jobs > 0, oldest queued job
      > 10 min, webhook signature failures spike, ledger trial balance != 0, settlement batch stuck in `processing`
      > 24 h, certificate expiry < 14 days, disk > 80%, backup/WAL archive failures, replication lag.
- [ ] Errors: set `SENTRY_DSN` (or equivalent) with PII scrubbing enabled.
- [ ] Uptime checks from outside India and from the patients' main source regions.

## 10. Logs

- [ ] `LOG_JSON=true`: structured JSON to stdout from the API/worker; the edge logs JSON lines with `request_id`,
      which is forwarded to the API (`X-Request-ID`) so a request can be traced across layers.
- [ ] Ship container logs to a central store (CloudWatch, Loki, Elastic, Datadog) with retention: application
      logs 30-90 days, security/audit exports >= 1 year. The in-database `audit_logs` table is the authoritative
      audit trail.
- [ ] Never log PII, tokens, passwords, OTPs, card data or raw webhook payloads at info level. The edge logs paths
      without query strings (WebSocket tokens are in the query string).
- [ ] Docker log rotation is configured (`json-file`, 5 x 20 MB per container).

## 11. Payments go-live

### Razorpay

- [ ] Complete KYC and activate the live account; request **International Payments** (cards issued abroad) and
      the required **cross-border / OPGSP** approvals for foreign patients; confirm settlement currency (INR).
- [ ] Live `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` in the secret store; `PAYMENT_GATEWAYS_ENABLED` contains
      `razorpay` and **not** `mock` (startup fails otherwise).
- [ ] Webhook URL: `https://<SITE_DOMAIN>/api/v1/payments/webhooks/razorpay`, with a strong secret set as
      `RAZORPAY_WEBHOOK_SECRET`. Subscribe at least to `payment.captured`, `payment.failed`, `order.paid`,
      `refund.processed`, `refund.failed`, and (for Route/RazorpayX) `transfer.*` / `payout.*` events.
- [ ] **Route linked accounts** for hospitals (and agents if paid via Route): create linked accounts after KYC,
      store `razorpay_linked_account_id` on the verified payout account; payouts then use `razorpay_route`.
      Payees without a linked account fall back to `manual_bank_transfer` with UTR entry by finance.
- [ ] Domain whitelisting for Checkout on `SITE_DOMAIN`; test with a small live transaction and a refund.

### Stripe (if enabled)

- [ ] Live `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY`; webhook endpoint
      `https://<SITE_DOMAIN>/api/v1/payments/webhooks/stripe` with signing secret `STRIPE_WEBHOOK_SECRET`;
      events `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`.
- [ ] Confirm eligibility for the business entity/country and the currencies offered to patients.

### Bank transfer (SWIFT)

- [ ] Fill `bank_transfer_details` in platform settings (beneficiary, bank, account, IFSC, SWIFT, IBAN where
      applicable). Finance reconciles transfers with **mark paid** and the bank reference; a second finance user
      approves it (`/mark-paid/approve`) before the payment is captured.

### Common

- [ ] End-to-end test in live mode: deposit, balance, instalment, cancellation refund, completion -> ledger postings
      -> settlement batch -> maker-checker approval -> payout. Trial balance must net to zero.
- [ ] Gateway IPs are not rate limited at the edge (`/api/v1/payments/webhooks/`); signatures are the control.
- [ ] Tax: GST registration and invoice numbering (`HIG/2026-27/...`), TDS 194-O rate in settings, reviewed by the
      company's chartered accountant before launch.

## 12. Email, SMS and push

- [ ] `EMAIL_BACKEND=smtp` with a transactional provider (Amazon SES ap-south-1, SendGrid, Postmark, Mailgun):
      `SMTP_HOST/PORT/USER/PASSWORD`, `SMTP_STARTTLS=true`, verified `EMAIL_FROM` domain.
- [ ] SPF, DKIM and DMARC (`p=quarantine` or stricter) on the sending domain; bounce/complaint handling.
- [ ] SMS/WhatsApp (if enabled later, e.g. MSG91, Twilio, Gupshup): DLT registration of sender ids and templates is
      mandatory for Indian numbers; international numbers need provider-specific sender registration.
- [ ] Push (FCM/APNs): service-account credentials in the secret store; prune invalid device tokens.
- [ ] Never send medical details in email/SMS bodies; link to the authenticated app instead.

## 13. Data protection (India DPDP Act 2023 and GDPR)

Heal India Global processes **health data and passport data of foreign nationals**. Treat the platform as a Data
Fiduciary under India's **Digital Personal Data Protection Act, 2023** (and its Rules) and, for patients in the
EU/EEA/UK, as subject to the **GDPR / UK GDPR** (Art. 3(2): offering services to people in the EU). Health data is
special-category data under GDPR Art. 9. Obtain legal review before launch; the checklist below is the engineering
side.

### Consent and notice

- [ ] Clear, itemised privacy notice (in English, the product's only language) describing purposes:
      treatment coordination, sharing with selected hospitals, AI-assisted triage, payments, travel/visa support.
- [ ] Separate, granular consents captured in `consents` (append-only, versioned, with IP/user agent):
      `terms`, `privacy`, `ai_processing`, `share_with_hospitals`, `marketing` (opt-in only). AI screening and
      sharing a case with a hospital are blocked without the relevant consent; withdrawal is as easy as granting.
- [ ] Explicit consent for special-category health data (GDPR Art. 9(2)(a)); record the version accepted.
- [ ] Children: verifiable parental/guardian consent for minors (DPDP s.9).
- [ ] Agents registering a patient must attest the patient's consent (`consent_attested`, kinds, method; stored
      as an audit-log row); the patient then confirms each attested kind on first login before it counts.

### Data minimisation, residency and processors

- [ ] Collect only what each step needs; passport numbers only when visa/booking requires them; encrypted at rest
      (field-level AES-256-GCM) and masked in every response.
- [ ] Data hosted in India by default; cross-border transfers only as permitted by DPDP notifications and, for EU
      patients, with an Art. 46 mechanism (SCCs) and transfer impact assessment.
- [ ] Data Processing Agreements with every processor: cloud host, email/SMS/push providers, payment gateways,
      Anthropic (AI triage - send no direct identifiers in the intake; only consented documents), error tracking.
      Maintain a record of processing activities (GDPR Art. 30).
- [ ] Hospitals receive case data only after `share_with_hospitals` consent and only for cases they are part of
      (enforced by resource scoping).

### Retention

- [ ] Confirm the retention schedule with counsel. Implemented defaults (settings in `backend/.env.example`,
      daily jobs in `backend/app/modules/privacy/tasks.py`, legal holds suspend them):
      guest accounts without activity - 90 days (`GUEST_RETENTION_DAYS`, matches Terms §4.2); passport/visa
      scans - 90 days after the treatment trip (`TRAVEL_ID_RETENTION_DAYS_AFTER_TRIP`); files users deleted -
      30 days (`SOFT_DELETED_FILE_RETENTION_DAYS`); accounts without sign-in - 3 years with a 30-day notice
      (`INACTIVE_ACCOUNT_RETENTION_DAYS`, `INACTIVE_ACCOUNT_NOTICE_DAYS`); notifications - 180 days
      (`NOTIFICATION_RETENTION_DAYS`). Financial records (payments, invoices, ledger) - 8 years (pseudonymised
      on account erasure); audit logs - >= 1 year (longer for finance actions); marketing data - until consent
      withdrawal.
- [x] Scheduled purge jobs; deletion also removes objects from storage (`privacy.delete_objects`). Still to do
      in infrastructure: S3 lifecycle rules for old object versions and expiring backups within the backup
      retention window; re-apply erasures after any restore (the `auth.account_deleted` audit rows list them).
- [ ] Production `DATABASE_SSLMODE=require` (or `verify-full` with the provider CA) and a field-encryption key
      rotation runbook (`FIELD_ENCRYPTION_KEY_ID`, `FIELD_ENCRYPTION_OLD_KEYS`, job `privacy.reencrypt_fields`).
      After deploying migration 0009b, enqueue `privacy.reencrypt_fields` once so existing health free text is
      encrypted (it otherwise runs daily).

### Data subject / Data Principal rights

- [x] Access and portability: `GET /api/v1/auth/me/export` (ZIP with JSON + files, or JSON; rate-limited by
      `DATA_EXPORT_DAILY_LIMIT`), "Download my data" in the patient web app and the mobile profile.
- [x] Correction, erasure (`DELETE /auth/me` erases health data and files; payments/ledger/invoices kept but
      pseudonymised; legal holds block it), withdrawal of consent (`POST /auth/consents`, enforced for hospital and
      agent document access), nomination (`/privacy/nominee`, DPDP s.14) and grievance redressal
      (`POST /privacy/requests`, staff queue in the admin portal under Privacy requests, SLA `DATA_RIGHTS_SLA_DAYS`).
- [ ] Publish a Grievance Officer / Data Protection Officer contact (DPDP s.8(9)-(10), GDPR Art. 37 where required) and
      an EU representative if no EU establishment (GDPR Art. 27). Set `GRIEVANCE_OFFICER_*`, `DPO_*` and
      `PRIVACY_POSTAL_ADDRESS` (served on `GET /api/v1/site-config/privacy-contact`). TODO-BUSINESS.
- [x] Log every request and its resolution (`data_rights_requests` + audit log); verify identity before acting
      (staff procedure, see `docs/legal/ROPA.md`).
- [x] Breach register (`breach_incidents`, `/admin/privacy/breaches`) and runbook `docs/legal/BREACH_RESPONSE.md`.

### Security obligations

- [ ] Reasonable security safeguards (DPDP s.8(5)): encryption in transit and at rest, access control, MFA for
      staff, audit logging, least privilege, vulnerability management, periodic penetration tests.
- [ ] DPIA (GDPR Art. 35) for AI-assisted triage and large-scale health-data processing; document the human
      oversight (coordinators and doctors make decisions, AI is decision support only).

## 14. Incident response

1. **Detect** - alerts (section 9), user reports, gateway notices, security researchers.
2. **Triage** - assign an incident commander; classify severity (SEV1 outage/data breach, SEV2 degraded payments
   or matching, SEV3 minor). Open an incident channel and timeline log.
3. **Contain** - revoke compromised credentials/keys (rotate `JWT_SECRET`, gateway keys, DB passwords), disable
   affected gateways via `PAYMENT_GATEWAYS_ENABLED`, suspend compromised accounts, block abusive IPs at the edge,
   restrict the staff door (`STAFF_ALLOWED_IPS` and the `/gahi/` allow-list in `snippets/staff-access.conf`) if
   staff accounts are targeted.
4. **Eradicate and recover** - patch, redeploy known-good images, restore from PITR if data was corrupted (ledger
   corrections only via reversing transactions), re-run failed jobs, reconcile payments against gateway
   dashboards.
5. **Notify** - personal data breaches: inform the **Data Protection Board of India** and each affected Data
   Principal as required by the DPDP Act/Rules (without delay; detailed report within the prescribed period,
   currently 72 hours), **CERT-In within 6 hours** of noticing a reportable cyber incident (CERT-In directions,
   2022), the EU/UK supervisory authority **within 72 hours** where GDPR applies (and data subjects without undue
   delay if high risk), plus payment gateways/partners per contract. Keep logs for 180 days as CERT-In requires.
6. **Review** - blameless post-mortem within 5 working days: root cause, impact (users, records, money),
   follow-up actions with owners and dates.

Keep an up-to-date contact sheet (on-call rotation, gateway support, cloud support, legal counsel, DPO) outside
the production systems.

## 15. Pre-launch checklist (summary)

- [ ] `ENV=production`, `ENABLE_DOCS=false`, `ADMIN_MFA_REQUIRED=true`, `REQUIRE_EMAIL_VERIFICATION=true`,
      `COOKIE_SECURE=true`, `mock` gateway disabled, `CORS_ORIGINS` empty or exactly `https://<SITE_DOMAIN>`
      (everything is same-origin), `STAFF_ALLOWED_IPS` set if staff work from known networks.
- [ ] FX rates loaded and refreshed for every patient currency (a missing or stale rate refuses orders with
      503 `fx_rate_unavailable` in production).
- [ ] At least two finance users (bank-transfer mark-paid, settlement batches and large refunds need a second
      approver).
- [ ] Real TLS certificate for `SITE_DOMAIN`; HSTS; DNS for `SITE_DOMAIN`.
- [ ] Secrets in a secret manager; `FIELD_ENCRYPTION_KEY` escrowed.
- [ ] Managed PostgreSQL with PITR + tested restore; S3 bucket private, encrypted, versioned.
- [ ] Monitoring, alerting, log shipping and uptime checks live.
- [ ] Payments live-tested end to end including refunds and payouts; webhooks verified.
- [ ] Email domain authenticated (SPF/DKIM/DMARC).
- [ ] Privacy notice, consents, retention jobs and DSR process in place; DPAs signed; DPIA done.
- [ ] No demo/seed accounts; first super_admin has MFA; staff accounts reviewed.
- [ ] Incident response contacts and runbooks published.
