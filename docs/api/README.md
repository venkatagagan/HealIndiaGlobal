# Heal India Global API: Postman collection, smoke test and e2e tests

This folder holds the developer-facing API tooling for the `/api/v1` REST API described in
[`docs/PLAN.md` §8](../PLAN.md):

| File | What it is |
|---|---|
| `HealIndia.postman_collection.json` | Postman v2.1 collection (282 requests): every §8 endpoint grouped by module/portal, plus an *Extras* folder for the endpoints the modules implement beyond the §8 table. It was checked against the app's routes: every request resolves to a route and every OpenAPI operation is covered. |
| `README.md` | This guide: environments, the auth flow, collection conventions, smoke and e2e tests |

Related code (backend):

| Path | What it is |
|---|---|
| `backend/scripts/smoke_api.py` | Standalone smoke test (async httpx) that runs a short patient journey against a running server |
| `backend/tests/e2e/test_full_journey.py` | pytest e2e journeys (marker `e2e`) run in-process against a throwaway PostgreSQL database |

---

## 1. Importing the collection

1. Postman → **Import** → select `docs/api/HealIndia.postman_collection.json`.
2. Open the collection → **Variables** and check `baseUrl` / `serverUrl` (defaults below).
3. Run **Auth → Demo logins → Login as …** (or **Auth → Login** with `loginEmail` / `loginPassword`).
4. Send any other request. Every request inherits **Bearer `{{accessToken}}`** from the collection, except the
   public ones, which are marked `No Auth`.

Folders, in the order a journey usually goes:

| Folder | Module (owner) | Typical caller |
|---|---|---|
| Auth | `auth` (be-auth) | everyone |
| System | core | ops / monitoring |
| Catalog - public | `catalog` (be-catalog) | anonymous visitors, mobile app |
| Patient portal | `patients` (be-auth) | patient |
| Documents | `documents` (be-auth) | everyone (scoped) |
| Screening | `screening` (be-screening) | patient, agent |
| Cases & quotes / Bookings / Consultations | `cases` (be-cases) | patient, agent, hospital, staff |
| Travel | `travel` (be-cases) | patient, agent, hospital, support |
| Messaging & notifications | `messaging` (be-messaging) | everyone |
| Agent portal | `agents` (be-messaging) | agent |
| Hospital portal | `hospitals` (be-catalog) | hospital members |
| Payments | `payments` (be-payments) | patient, agent, finance |
| Finance - ledger | `ledger` (be-finance) | finance (summary also for hospitals/agents) |
| Finance - settlements | `settlements` (be-finance) | finance, hospital, agent |
| Admin portal | `admin` (be-admin) | admin, support, finance, super_admin |
| Extras - implemented beyond PLAN section 8 | various | item reads, PUT (full-update) aliases, reinstate, commission-rule resolve, hospital-wide availability |

Each request's description starts with **Who:**, listing the roles allowed (PLAN §8 legend: P patient,
A agent, H hospital member, S staff, F finance|super_admin, AD admin|super_admin).

### Chained ids

Create-requests run a small test script that stores the new id in a collection variable, and later requests
reference it. For example, **Create case** sets `{{caseId}}`, **Send quote** sets `{{quoteId}}`, **Create booking**
sets `{{bookingId}}` and **Create payment order** sets `{{orderId}}`. The folders can therefore be run
top-to-bottom with the Collection Runner once you switch users at the right points: log in as the patient
for screening, cases and bookings, as the hospital owner to send the quote, and as `finance1`/`finance2` for
settlements.

## 2. Environments

The collection ships with collection variables for local development. To target another deployment, create a
Postman **environment** that overrides these variables (environment values take precedence):

| Variable | Local (uvicorn) | docker-compose (nginx) | Staging / production (example) |
|---|---|---|---|
| `serverUrl` | `http://127.0.0.1:8000` | `http://localhost` | `https://api.healindia.example` |
| `baseUrl` | `http://127.0.0.1:8000/api/v1` | `http://localhost/api/v1` | `https://api.healindia.example/api/v1` |
| `demoPassword` | `HealIndia@2026` | `HealIndia@2026` | *(no demo accounts)* |

Notes:

* `GET /health/live`, `GET /health/ready` and `GET /metrics` are served at the **server root**, not under
  `/api/v1`, so the System folder uses `{{serverUrl}}`. OpenAPI is at `{{serverUrl}}/api/openapi.json` (Swagger
  UI at `/api/docs`) unless `ENV=production` and `ENABLE_DOCS=false`.
* The `mock` payment gateway (`POST /payments/mock/{order_id}/complete`) is refused in production, and
  `PAYMENT_GATEWAYS_ENABLED` decides which gateways a server offers.
* Never store real credentials in an exported collection. Keep secrets (passwords, tokens) in environment
  variables of type *secret*.

### Demo accounts (local seed)

`python -m scripts.seed` (run from `backend/`) creates the demo data. Every demo account uses the password
`HealIndia@2026`:

| Role | Email |
|---|---|
| super_admin | `superadmin@healindia.example` |
| admin (operations) | `admin@healindia.example` |
| finance (maker) | `finance1@healindia.example` |
| finance (checker) | `finance2@healindia.example` |
| support (coordinator) | `support@healindia.example` |
| agent | `agent.lagos@healindia.example` |
| patient | `patient.us@healindia.example` |
| hospital owner | `owner.<hospital-slug>@healindia.example`, e.g. `owner.sanjeevani-gurugram@healindia.example` (the collection's `hospitalOwnerEmail` default) |

## 3. Auth flow

```
POST /auth/register | /auth/login | /auth/google | /auth/guest  ──►  TokenOut
      {access_token, token_type:"bearer", expires_in, refresh_token?, user: UserOut}

Authorization: Bearer <access_token>          (JWT, ~15 min, claims iss/aud/exp/type=access)

POST /auth/refresh   ──►  new TokenOut (refresh token rotated; re-use of an old one revokes the family)
POST /auth/logout    ──►  204 (refresh token revoked)
```

* **Web clients** receive the refresh token as the httpOnly cookie `hig_refresh` (Path `/api/v1/auth`,
  SameSite=Strict, Secure in production). `POST /auth/refresh` and `POST /auth/logout` with the cookie must send
  `X-Requested-With: XMLHttpRequest`.
* **Mobile clients and Postman** send `X-Client-Type: mobile` and receive `refresh_token` in the response body.
  Refresh with `{"refresh_token": "..."}`.
* **MFA**: if TOTP is enabled (always for staff when `ADMIN_MFA_REQUIRED=true`), `POST /auth/login` answers 401
  with `error.code = "mfa_required"`. Send the same request again with `otp_code`. You can set up MFA with
  `/auth/mfa/setup` → `/auth/mfa/enable {code}`.
* **Lockout / rate limits**: login is limited to 10/min/IP, and 5 failures lock the account for 15 minutes.
  Register is limited to 5/min/IP and forgot-password to 3/min/IP. A limited request gets 429 `rate_limited`
  with a `Retry-After` header.
* **Hospital users** who belong to several hospitals choose one with the `X-Hospital-Id` header (the Hospital
  portal folder sets it to `{{hospitalId}}`). Without the header, the first hospital is used.

How the collection automates this:

* The login, register and refresh requests send `X-Client-Type: mobile`. Their test scripts store
  `accessToken`, `refreshToken`, `userId`, `currentRole` and, when present, `patientId`, `agentId` and
  `hospitalId`/`hospitalSlug`.
* The collection-level **pre-request script** decodes the stored access token's `exp`. When the token expires
  within 30 seconds and a `refreshToken` is stored, it calls `POST {{baseUrl}}/auth/refresh` before sending your
  request, so long Runner sessions keep working.
* The collection-level **test script** checks that error responses use the standard envelope
  `{"error": {"code", "message", "details", "request_id"}}`.

## 4. Conventions you will see in responses

* **Money** is always an integer in minor units plus an ISO-4217 currency: `amount_minor: 1250000` with
  `currency: "INR"` means ₹12,500.00. Rates are basis points (`*_bps`, 1500 = 15%). The ledger is kept in INR.
  Patients pay in their own currency (USD by default), and each order carries the FX snapshot (`fx_rate`,
  `base_amount_minor`).
* **Pagination**: `?page=1&page_size=20` (max 100) returns `{"items", "total", "page", "page_size", "pages"}`.
* **Errors**: the standard envelope above. Codes are `validation_error` 422, `bad_request` 400,
  `unauthorized` 401, `forbidden` 403, `not_found` 404, `conflict` 409, `rate_limited` 429, `payment_error` 402,
  `internal_error` 500. An out-of-scope id (another tenant's case, booking, document, …) returns **404**, not 403.
* **Idempotency**: `POST /payments/orders` requires an `Idempotency-Key` header. Re-sending the same key returns
  the same order. The collection uses `{{$guid}}` (a new key per send); set a fixed value to see the replay.
* **Dates** are `YYYY-MM-DD`. Timestamps are ISO-8601 UTC.

## 5. A full journey with the collection (local, demo data)

1. **Auth → Demo logins → Login as Patient**. Then **Catalog → Specialties** and **Procedures** (these store
   `specialtySlug`, `procedureId`, …).
2. **Screening → Start screening → Answer step → Submit**. Poll **Get screening** until `status = completed`;
   the embedded worker processes the triage job. Then **Matches** stores `hospitalId`/`doctorId`.
3. **Auth → Record consent** (`share_with_hospitals`) → **Cases → Create case**.
4. **Login as Hospital owner** (set `hospitalOwnerEmail`) → **Cases → Send quote**.
5. **Login as Patient** → **Accept quote** → **Bookings → Create booking** → **Payments → Create payment order**
   (`gateway: mock`) → **Complete mock payment** → **Get booking** (`confirmed`) → **Checklist**.
6. **Login as Hospital owner** → **Admit patient** → **Complete / discharge**.
7. **Login as Finance 1** → **Finance summary**, **Settlement items** (pending for `settlement_hold_days`),
   **Trial balance**. After the hold: **Generate batch**. Then **Login as Finance 2** → **Approve batch** (the
   creator gets 403, which is the maker-checker rule) → **Process batch** → **Payouts**.

## 6. Smoke test against a running server

```bash
# from backend/, with the API running (python -m uvicorn app.main:app --port 8000) and demo data seeded
.venv/Scripts/python -m scripts.smoke_api --base-url http://127.0.0.1:8000
.venv/Scripts/python -m scripts.smoke_api --fresh     # register fresh patient/agent/hospital users instead
.venv/Scripts/python -m scripts.smoke_api --settle    # also generate/approve/process a batch from eligible items
```

The script runs about 20 steps (health, staff logins, catalog, screening, case, quote, booking, mock payment,
admission and discharge, settlement items, trial balance, IDOR and RBAC spot checks, notifications). It
prints `PASS`/`FAIL`/`SKIP` for each step with its duration. It exits **1** if any step failed. A failed
critical step skips the steps that depend on it. Background work (screening triage, payment events) needs
the worker: `RUN_WORKER_IN_API=true` (the default in `backend/.env`) or `python -m app.worker`.

Without demo data, the script registers fresh users and has the demo admin approve them. The staff accounts
must still exist, because the first admin cannot be created over HTTP.

## 7. End-to-end tests (pytest)

```bash
cd backend
.venv/Scripts/python -m pytest tests/e2e -q            # or: -m e2e from the whole suite
```

The tests run the app in-process (`httpx.ASGITransport`) against a throwaway PostgreSQL database created by
`tests/conftest.py`. Every journey step is an HTTP call. Factories create only setup data: reference catalog
rows, staff users, and the hospitals and agents of journeys (b) and (c), whose subject is not onboarding.
With AI disabled, screening uses the rules engine. Jobs are drained with `run_jobs()`. Bookings need a
future admission date and a discharge cannot precede it, so journey (a) moves the clock with `time-machine`:
first to admission day, then +5 days to discharge, then past the 3-day settlement hold. It then runs the
`settlements.mark_eligible` periodic task (only that task, so no auto-batching interferes).
`E2E_TRACE=1 pytest tests/e2e -s` prints each step as it runs.

| Test | Journey |
|---|---|
| `test_full_journey_hospital_onboarding_to_settlement_payout` | Hospital registers, completes its profile, uploads KYC, submits and is approved, then adds specialty, doctor, procedure, packages, availability and a payout account. Agent registers and is approved. Patient registers with the referral code. Screening → matches → case → itemized quote → accept → deposit booking → mock payment (Idempotency-Key replay) → confirmed + checklist → admit → discharge. Escrow is released and settlement items are pending. Time travel past the hold → eligible → finance A generates the batches → A/admin/support approval is rejected (403) → finance B approves → process → payouts processed. The trial balance is zero, hospital/agent payables are zero, the patient has notifications and the case conversation works. |
| `test_cancellation_triggers_automatic_refund` | A paid booking cancelled 30 days before admission is refunded in full automatically. The refund is `processed`, the order `refunded`, escrow is back to 0, the booking and case are `cancelled`, no settlement items exist and the ledger is balanced. |
| `test_cross_tenant_idor_sweep` | Patient B, agent B and hospital B get 404 for A's case, booking, checklist, payment order, document (and download) and screening (and matches). Their list endpoints don't leak A's ids, writes to A's resources are rejected, and non-finance users get 403 on batch approve/process and the ledger. |

A failing step prints the journey, the step, the endpoint, the actor, the response and the **responsible module**.
It says explicitly when a route does not exist yet. Background jobs that raised errors are listed as notes,
and each journey ends by asserting that no job failed.
