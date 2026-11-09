# Heal India Global

> **Your Gateway to Indian Medical Excellence.** A medical-travel platform that takes international patients
> from first symptom to recovery: AI screening -> matched Indian hospitals and doctors -> quotes -> booking ->
> payment -> visa, travel and stay -> in-country support -> hospital and agent settlement.

Heal India Global connects four groups of people on one platform:

| Who | Where | What they do |
|---|---|---|
| **Patients** (international) | Flutter mobile app + patient portal (`/app/`) | Describe their condition, get AI-assisted triage and matched hospitals/doctors, compare costs with their home country, request quotes, book and pay, manage visa/travel/stay, chat with coordinators, get in-country support (SOS, helplines, translators). |
| **Agents / facilitators** | Agent portal (`/agent/`) + mobile app | Register patients, run screenings on their behalf, compare quotes across hospitals, book and pay for patients, and earn commission that is settled automatically. |
| **Hospital providers** | Hospital portal (`/hospital/`) + mobile app | Onboard (KYC, accreditations, specialties, doctors, prices, packages), answer enquiries with itemised quotes, manage admissions/discharges and itineraries, issue visa invitation letters, and track settlements and payouts. |
| **Central admin** (operations, finance, support) | Admin console behind the staff door (`/gahi/`, web only) | Approve hospitals and agents, run the catalogue and content, coordinate cases and travel, handle SOS, reconcile payments and refunds, run the double-entry ledger, approve settlement batches (maker-checker) and pay out. |

---

## Features

- **AI symptom screening** - 4-step questionnaire (body map + pain, symptoms, duration/severity/history and
  reports, preferences). Claude produces a structured, schema-validated triage (never a diagnosis), with red-flag
  detection that tells patients to seek local emergency care instead of travelling. A deterministic rules engine
  is used when AI is disabled, unconfigured or unavailable.
- **Matching** - transparent 0-100 score across specialty, procedure, accreditation (JCI/NABH), rating, success
  rate, language, doctor-gender preference, budget fit and availability, with human-readable reasons.
- **Cost comparison** - home-country benchmarks vs India, itemised, converted into the patient's currency.
- **Cases, quotes and bookings** - case state machine (enquiry -> quoted -> accepted -> booked -> in_treatment ->
  completed), itemised hospital quotes, packages (medical only / medical + stay / all-inclusive), deposits and
  instalment plans. Patient cancellations refund per the refund policy snapshotted when the booking was
  confirmed; hospital- or platform-initiated cancellations refund 100%. Cases screened as a possible emergency
  cannot be booked until the patient (or agent) acknowledges the emergency guidance; guests must upgrade to a
  full account before creating a case or booking.
- **Payments** - Razorpay (cards/UPI/netbanking, international cards), Stripe, SWIFT bank transfer with proof
  upload and finance reconciliation, and a mock gateway for development. Amounts are always computed
  server-side; webhooks are signature-verified and idempotent. Bank transfers are confirmed by two different
  finance users (maker-checker); a captured amount that differs from the order is held for finance review; in
  production a missing or stale FX rate refuses the order instead of guessing.
- **Ledger and settlements** - immutable double-entry ledger in INR (DB-enforced balance and append-only),
  commission rules, GST on commission, TDS 194-O, hold periods, settlement batches with maker-checker approval,
  payouts via Razorpay Route or manual bank transfer with UTR capture, clawbacks on late refunds.
- **Travel and stay** - e-Medical visa tracking and invitation letters, flights, airport pickup, accommodation
  near the hospital, translators and local guides, itinerary, pre-arrival checklist and countdown.
- **In-country support** - realtime chat per case (WebSocket), notifications (in-app, email, push), SOS alerts
  routed to coordinators, helplines and cultural tips.
- **Security and compliance** - Argon2id, short-lived JWTs with rotating refresh tokens and reuse detection,
  a separate web-only staff door with TOTP MFA, RBAC plus per-resource scoping, AES-256-GCM field encryption
  for passports/bank details, audit log, rate limiting, consent capture (terms, privacy, AI processing, sharing
  with hospitals; agents attest consent for patients they register, and the patient confirms on first login).

## Access: one domain, path routing

Production serves everything from one domain behind nginx (PLAN §3.1; [infra/nginx](infra/nginx) and
[deploy/README.md](deploy/README.md) are the source of truth):

| Path | Serves | Who |
|---|---|---|
| `/` | Public website (`website/`, Next.js) | Everyone |
| `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email` | **Public door** (website pages) | Patients, agents, hospital users |
| `/app/` | Patient portal SPA (`web/apps/patient-web`) | Patients |
| `/agent/` | Agent portal SPA (`web/apps/agent-portal`) | Agents |
| `/hospital/` | Hospital portal SPA (`web/apps/hospital-portal`) | Hospital users |
| `/gahi/` | **Staff door** + admin console SPA (`web/apps/admin-portal`); never linked publicly, `noindex` | `admin`, `finance`, `support`, `super_admin` only; web only |
| `/api/` | FastAPI (REST `/api/v1`, WebSocket `/api/v1/ws`, webhooks); `/health/*` for probes | All clients |

The portals have no login form of their own: they redirect to `/login?next=…`, and after login the website
sends each role to its own portal. Staff accounts are refused at the public door and sign in only at `/gahi/`
(`POST /auth/staff/login`, separate `hig_staff_refresh` cookie, optional `STAFF_ALLOWED_IPS`). The **mobile
app is the same public door** for patients, agents and hospital users (role tabs on register, a role-specific
shell after login); staff never sign in on mobile.

## Architecture (summary)

```
 Flutter app (patients, agents, hospital users)     Next.js website + public door (/, /login)
 4 React SPAs (/app/, /agent/, /hospital/, /gahi/)
                  |  HTTPS, one domain: /api/v1  +  WSS /api/v1/ws
            nginx edge (TLS, HTTP/2, gzip, path routing, rate limits, security headers, static caching)
                  |
     FastAPI modular monolith (async SQLAlchemy/asyncpg)  <-->  Worker (python -m app.worker)
        |              |             |                           jobs + periodic schedules
  PostgreSQL 17     Redis 7      S3 / MinIO          Claude API, Razorpay/Stripe, SMTP/FCM
  (data, ledger,    (cache, rate  (documents)
   job queue)        limits, ws)
```

One deployable API with strict module boundaries; modules communicate through shared models (read), in-process
domain events and a few explicit service contracts. Background work uses a transactional outbox queue in
PostgreSQL (`FOR UPDATE SKIP LOCKED`), so no message broker is needed. Money is stored as integer minor units with
an ISO-4217 currency everywhere. Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Repository layout

```
ForHosp/
├── backend/            FastAPI app (Python 3.13): app/{core,models,modules/*}, alembic/, tests/, scripts/seed.py
├── website/            Next.js public website + public login door (/, /login, /register, ...)
├── web/                npm workspaces: apps/{patient-web,agent-portal,hospital-portal,admin-portal}, packages/shared
├── mobile/             Flutter app (package heal_india_global): patients, agents, hospital users
├── infra/              docker-compose.yml, nginx/ (edge, path routing), postgres/init (DB roles), website/, .env.example
├── deploy/             production IaC: terraform/aws, k8s, observability
├── scripts/            env.ps1 / env.sh (shared toolchain), setup-db.ps1, dev.ps1 / dev.sh
├── docs/               PLAN.md (build contract), ARCHITECTURE.md, DEPLOYMENT.md, API.md, PAYMENTS.md, ...
└── .github/workflows/  ci.yml (backend, web, mobile, docker build)
```

## Prerequisites

Everything runs on a **shared toolchain under `C:\NewProjects`** (nothing is installed per project, and nothing
under `C:\laragon` is used):

| Tool | Location |
|---|---|
| Node 22 + npm | `C:\NewProjects\nodejs` |
| Python 3.13 | `C:\NewProjects\python313` (project venv in `backend\.venv`) |
| PostgreSQL 17 | binaries `C:\NewProjects\pgsql` (shared); this project's **own cluster**: data dir `C:\NewProjects\pgdata-healindia`, server `127.0.0.1:5433` |
| Redis (optional) | `C:\NewProjects\redis` (`127.0.0.1:6379`, db index 3; the app falls back to in-memory without it) |
| Flutter 3.44 / Dart 3.12 | `D:\dev\flutter\bin` |

Activate the toolchain in a shell: `. C:\NewProjects\ForHosp\scripts\env.ps1` (PowerShell) or
`source /c/NewProjects/ForHosp/scripts/env.sh` (Git Bash).

Heal India Global runs **its own PostgreSQL 17 cluster** (the shared binaries, a separate data directory and port
5433), so the shared cluster on port 5432 used by other projects is never touched. `scripts/setup-db.ps1`
(idempotent) initialises/starts it and creates the app role and database from the credentials in
`backend/.env`. The app, tests and scripts only ever connect with that `DATABASE_URL`; tests create and drop
their own uniquely named databases (`hig_test_<pid>_<rand>`) with the same role. (The Docker stack is stricter:
see [Docker](#docker-production-like-stack).)

## Quickstart (Windows, PowerShell)

```powershell
cd C:\NewProjects\ForHosp
. .\scripts\env.ps1

# 1. Backend virtualenv + dependencies (once)
C:\NewProjects\python313\python.exe -m venv backend\.venv
backend\.venv\Scripts\python -m pip install -e "backend[dev]"

# 2. Configuration: backend\.env holds DATABASE_URL and generated secrets (never commit it).
#    For a fresh clone copy backend\.env.example to backend\.env and fill in the values.

# 3. Initialise/start this project's own PostgreSQL cluster (127.0.0.1:5433) and create the healindia
#    role + database (idempotent; safe to re-run after a reboot to start the cluster again)
powershell -ExecutionPolicy Bypass -File scripts\setup-db.ps1

# 4. Schema + demo data (the seed refuses to run when ENV=production)
cd backend
.venv\Scripts\python -m alembic upgrade head
.venv\Scripts\python -m scripts.seed
cd ..

# 5. Run everything (API + website + 4 web apps, one window each; checks/starts PostgreSQL, migrates first,
#    and runs `npm ci` in web/ and website/ on first use)
.\scripts\dev.ps1                       # or: .\scripts\dev.ps1 -Apps website,patient,admin -Worker
```

Development URLs (separate ports; `localhost` cookies are shared across ports):

| What | URL |
|---|---|
| Website + public door | `http://localhost:3000` (login at `http://localhost:3000/login`) |
| Patient portal | `http://localhost:5173/app/` |
| Agent portal | `http://localhost:5174/agent/` |
| Hospital portal | `http://localhost:5175/hospital/` |
| Staff door + admin console | `http://localhost:5176/gahi/` |
| API (Swagger) | `http://127.0.0.1:8000/api/docs` |

Or run the pieces yourself:

```powershell
cd backend; .venv\Scripts\python -m uvicorn app.main:app --reload --port 8000   # API
cd backend; .venv\Scripts\python -m app.worker                                  # worker (or RUN_WORKER_IN_API=true)
cd website; npm run dev                                                         # http://localhost:3000
cd web; npm run dev -w apps/patient-web                                         # http://localhost:5173/app/
cd web; npm run dev -w apps/agent-portal                                        # http://localhost:5174/agent/
cd web; npm run dev -w apps/hospital-portal                                     # http://localhost:5175/hospital/
cd web; npm run dev -w apps/admin-portal                                        # http://localhost:5176/gahi/
cd mobile; flutter pub get; flutter run                                         # API_BASE_URL via --dart-define
```

The Vite dev servers proxy `/api` (including the WebSocket) to `http://127.0.0.1:8000`, and the website
rewrites `/api/*` to the same API. The mobile app defaults
to `http://10.0.2.2:8000/api/v1` on the Android emulator and `http://127.0.0.1:8000/api/v1` elsewhere; override
with `flutter run --dart-define=API_BASE_URL=https://your-host/api/v1`.

Git Bash users can run `scripts/dev.sh` (same steps, all servers in one terminal, Ctrl+C stops them).

### Docker (production-like stack)

```bash
cp infra/.env.example infra/.env        # fill in secrets
docker compose -f infra/docker-compose.yml --env-file infra/.env up -d --build
docker compose -f infra/docker-compose.yml --env-file infra/.env exec api python -m scripts.seed   # demo only
# https://localhost/ (website, /login) · /app/ · /agent/ · /hospital/ · /gahi/ (staff) · /api/
```

One domain (`SITE_DOMAIN`), path routing as in the table above. The database uses three roles
(`infra/postgres/init/02-roles.sh`): the bootstrap superuser (operators only), `MIGRATOR_DB_USER` (schema owner,
used only by the one-off `migrate` service that runs `alembic upgrade head`) and `APP_DB_USER` (DML only, used
by `api` and `worker`). Without real certificates the stack generates a self-signed one. See
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Tests and quality checks

```powershell
cd backend
.venv\Scripts\python -m ruff check app tests
.venv\Scripts\python -m pytest -q                               # whole suite (real PostgreSQL, per-session DB)
.venv\Scripts\python -m pytest -q tests/modules/test_payments_orders.py   # one file

cd web
npm run typecheck                    # all apps
npm run build                        # all apps
npm run typecheck -w apps/agent-portal

cd mobile
flutter analyze
flutter test
```

CI (`.github/workflows/ci.yml`) runs the same checks plus Docker image builds and an nginx config lint.

## Configuration

- **Backend**: environment variables / `backend/.env` (template `backend/.env.example`), read by
  `app/core/config.py`. Key settings: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `FIELD_ENCRYPTION_KEY`,
  `ANTHROPIC_API_KEY` / `AI_MODEL`, `PAYMENT_GATEWAYS_ENABLED` + gateway keys, `EMAIL_BACKEND` + SMTP,
  `STORAGE_BACKEND` (+ S3), `CORS_ORIGINS`, `COOKIE_SECURE`, `ADMIN_MFA_REQUIRED`.
- **Docker / production**: `infra/.env.example` documents every variable used by `infra/docker-compose.yml`.
- **Runtime business settings** (commission, GST/TDS rates, deposit %, refund policy, hold days, helplines,
  supported currencies) live in the `platform_settings` table and are edited in the admin portal.
- **Web**: Vite `VITE_*` variables at build time (e.g. `VITE_GOOGLE_CLIENT_ID`, `VITE_PUBLIC_LOGIN_URL`);
  website: `NEXT_PUBLIC_*` (portal URLs, API base) at build time.
- **Staff door**: `ADMIN_MFA_REQUIRED`, `STAFF_ALLOWED_IPS` (comma-separated CIDRs, enforced on `/auth/staff/*`
  and every staff API call).
- **Mobile**: `--dart-define=API_BASE_URL=...`.

## Demo accounts

`python -m scripts.seed` (run from `backend/` after `alembic upgrade head`) creates the accounts below and prints
them. It refuses to run when `ENV=production`.

> **Every demo account uses the password `HealIndia@2026`.** This is for demo and development databases only.
> Demo accounts and this password must never exist in production.

All emails are `@healindia.example`.

| Who | Accounts | Sign in at |
|---|---|---|
| Staff | `superadmin@` (super_admin), `admin@` (admin), `finance1@` (finance, maker), `finance2@` (finance, checker), `support@` (support) | Staff door `/gahi/` (dev: `http://localhost:5176/gahi/`) |
| Agents | `agent.lagos@` (active), `agent.dubai@` (pending approval) | Public door `/login` |
| Hospitals | `owner.<slug>@` for all 14 hospitals; also `coordinator.<slug>@` and `finance.<slug>@` for `sanjeevani-gurugram`, `yamuna-valley-noida`, `lotus-crest-new-delhi` | Public door `/login` |
| Patients | `patient.us@`, `patient.uk@`, `patient.ng@`, `patient.om@`, `patient.bd@` | Public door `/login` or the mobile app |

Hospital slugs: `sanjeevani-gurugram`, `yamuna-valley-noida`, `lotus-crest-new-delhi`, `ratnakar-bay-mumbai`,
`coromandel-chennai`, `pournami-chennai`, `nandi-valley-bengaluru`, `vasundhara-hyderabad`,
`hooghly-valley-kolkata`, `vembanad-kochi`, `shubh-arogya-ahmedabad`, `deccan-crest-pune`,
`aravali-heights-jaipur`, `shivalik-chandigarh`. Use `finance1@` and `finance2@` together to try the
maker-checker flows (bank-transfer mark-paid, settlement batches, large refunds). With
`ADMIN_MFA_REQUIRED=true` (always in production; `false` in `backend/.env.example`) staff enrol TOTP on first
sign-in.

## Security notes

- Never commit `.env` files or print secrets; `backend/.env` is generated per machine. Back up
  `FIELD_ENCRYPTION_KEY` - encrypted fields (passport, policy and bank account numbers, PAN, MFA secrets) cannot be
  recovered without it.
- Card data never touches our servers (gateway-hosted checkout). Webhooks are verified over the raw body and
  deduplicated; client-supplied amounts are never trusted.
- Every endpoint enforces role checks and resource scoping (out-of-scope ids return 404); sensitive actions are
  audit-logged; staff accounts should have TOTP MFA (`ADMIN_MFA_REQUIRED=true` in production).
- AI output is decision support for coordinators and doctors, not a diagnosis; red-flag symptoms always direct
  the patient to local emergency care. AI processing and sharing with hospitals require explicit consent.
- Report vulnerabilities privately to the maintainers; do not open public issues for security problems.

## Documentation

- [docs/PLAN.md](docs/PLAN.md) - build contract: data model, enums, API shapes, events, ownership
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - architecture, modules, events/jobs, money flow, AI pipeline,
  security and performance
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) - production checklist (TLS, secrets, backups, scaling, payments
  go-live, data protection, incident response); [deploy/README.md](deploy/README.md) - AWS / Kubernetes IaC
- [docs/API.md](docs/API.md), [docs/PAYMENTS.md](docs/PAYMENTS.md) - API and payment details; live OpenAPI at
  `/api/docs` (non-production)
- [docs/SECURITY.md](docs/SECURITY.md), [docs/OPERATIONS.md](docs/OPERATIONS.md) - security model and runbooks
