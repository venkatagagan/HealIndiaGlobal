# Heal India Global - Architecture

This document explains how the platform is put together and why. The binding, field-level contract (tables,
enums, JSON shapes, endpoint list) is [PLAN.md](PLAN.md); this file is the narrative view of the same design.

## 1. System overview

```
  website (Next.js)   ┌───────────────┐ ┌──────────────┐ ┌─────────────────┐ ┌──────────────┐
  /  + public door    │ patient-web   │ │ agent-portal │ │ hospital-portal │ │ admin-portal │  React 19 + Vite
  /login, /register   │ /app/         │ │ /agent/      │ │ /hospital/      │ │ /gahi/ staff │
        │             └──────┬────────┘ └──────┬───────┘ └────────┬────────┘ └──────┬───────┘
 Flutter app ─┐              │                 │                  │                 │
 (patients,   └──────────────┴──── one domain: HTTPS /api/v1 + WSS /api/v1/ws ──────┘
  agents, hospitals)               │  nginx edge (TLS, HTTP/2, path routing, gzip, static cache, rate limits)
                     ┌─────────────▼──────────────┐      ┌───────────────────────┐
                     │ FastAPI (modular monolith) │◄────►│ Worker (python -m      │
                     │ async SQLAlchemy/asyncpg   │      │ app.worker): jobs +    │
                     └───┬──────────┬──────────┬──┘      │ periodic schedules     │
                         │          │          │         └──────────┬────────────┘
                  PostgreSQL 17   Redis 7   S3/MinIO          Claude API (AI triage)
                  (data, ledger,  (cache,   (documents)       Razorpay / Stripe (payments, payouts)
                   job queue)     ratelimit,                  SMTP / FCM (notifications)
                                  ws fan-out)
```

| Component | Technology | Responsibility |
|---|---|---|
| Mobile app | Flutter 3.44, Riverpod, go_router, dio | Public door for patients, agents and hospital users; a role-specific shell after login (patient journey; agent patients, cases and commissions; hospital enquiries, quotes, admissions and settlements). Staff never sign in on mobile |
| Website | Next.js (`website/`) | Public marketing site, catalogue pages and the **public door** (`/login`, `/register`, password reset, email verification); sends each role to its own portal |
| Web apps | React 19, TypeScript, Vite, Tailwind v4, TanStack Query, React Router 7 | Patient portal (`/app/`), agent portal (`/agent/`), hospital portal (`/hospital/`), and the admin console behind the **staff door** (`/gahi/`); one SPA each, shared `@hig/shared` package. The three public portals have no login form of their own |
| Edge | nginx | One domain with path routing (PLAN §3.1), TLS termination, HTTP/2, compression, rate limiting, security headers/CSP, SPA and asset caching, WebSocket upgrade |
| API | FastAPI on gunicorn + uvicorn workers | All business logic, REST `/api/v1`, WebSocket `/api/v1/ws` |
| Worker | `python -m app.worker` (same image) | Background jobs and periodic schedules from the PostgreSQL job table |
| PostgreSQL 17 | asyncpg, SQLAlchemy 2.0, Alembic | System of record, double-entry ledger, job queue (outbox) |
| Redis 7 | optional | Cache, rate-limit counters, WebSocket fan-out across API processes (in-memory fallbacks when absent) |
| Object storage | local disk or S3/MinIO | Documents (passports, medical reports, KYC, invoices) |

**Two doors.** Patients, agents and hospital users sign in at the public door (`/auth/login`, cookie
`hig_refresh`). `admin`, `finance`, `support` and `super_admin` sign in only at the web-only staff door
(`/auth/staff/login`, TOTP, cookie `hig_staff_refresh`, optional `STAFF_ALLOWED_IPS`). Each door refuses the
other door's roles with the generic login error, and a refresh token only works at the door that issued it.

Every client talks to the API with the **same JSON contract** (snake_case keys, the same enum values, the same
error envelope), so the four SPAs and the mobile app share types and behaviour.

## 2. Backend: modular monolith

One deployable API process, strict module boundaries inside it:

```
app/
├── main.py      create_app(): middleware, exception handlers, routers, lifespan (optional embedded worker)
├── api.py       api_router (/api/v1) including every module router
├── worker.py    job runner + periodic scheduler
├── core/        config, db, ids (UUIDv7), security, crypto, deps, errors, middleware, logging, rate_limit,
│                cache, storage, email, jobs, events, realtime, money, pagination, audit, enums
├── models/      SQLAlchemy 2.0 typed models, one file per domain
└── modules/     auth · patients · documents · docai · voice · catalog · hospitals · screening · cases ·
                 travel · messaging · agents · payments · ledger · settlements · admin
```

| Module | Owns | Key responsibilities |
|---|---|---|
| auth / patients / documents | users, tokens, consents, devices, audit, patient profiles, companions, documents | Registration (patient/agent/hospital/guest/Google), login + MFA, refresh rotation, profile, patient dashboard, uploads with magic-byte validation and authorised download |
| catalog / hospitals | specialties, procedures, benchmarks, FX, tips, hospitals, doctors, prices, packages, availability, reviews | Public directory and search, cost comparison, hospital portal (profile, doctors, pricing, packages, team) |
| screening | screenings, matches, AI request log | Questionnaire, Claude triage with rules fallback, deterministic matching |
| docai / voice | document analyses, voice transcriptions | AI reading of uploaded reports, and spoken intake (English only); always reviewed and confirmed by a person (PLAN §7.1, §7.2; in progress) |
| cases / travel | cases, quotes, bookings, consultations, checklist, itinerary, visa, travel/stay/service bookings, SOS | Case and booking state machines, quotes, emergency gating, cancellations (who initiated decides the refund), pre-arrival checklist, travel desk |
| messaging / agents | conversations, messages, notifications, agents | Case chat, notifications (in-app/email/push), WebSocket events, agent portal and patients-on-behalf with consent attestation |
| payments | orders, payments, refunds, webhooks, instalments, invoices | Gateways (Razorpay, Stripe, bank transfer, mock), checkout, verification, webhooks, refunds, receipts, finance controls (maker-checker mark-paid, amount review, FX freshness) |
| ledger / settlements | accounts, transactions, entries, commission rules, payout accounts, settlement items/batches, payouts | Double-entry postings, commission resolution, settlement pipeline, payouts |
| admin | (no tables of its own) | Approvals, catalogue/content CRUD, settings, audit-log viewer, reports and exports |

**Boundary rules.** Modules communicate only through

1. **shared models** (read access to another domain's tables),
2. **domain events** for side effects (section 3), and
3. a handful of **explicit service contracts**: `ledger.service.post_transaction` / `get_or_create_account`,
   `settlements.service.resolve_commission_bps` / `resolve_agent_commission_bps`, and the core helpers
   `money`, `storage`, `realtime`, `audit`, `settings_store`.

Routers stay thin (validation + authorisation + call a service); services hold logic; `policies.py` holds
resource-scoping rules. This keeps the codebase splittable into services later without rewriting business logic.

## 3. Events and background jobs

### 3.1 Domain events (in-process, same transaction)

`await publish(db, "payment.captured", {...})` runs every subscribed handler **in the same database session and
transaction** as the change that caused it, so either everything commits or nothing does. Handlers are
idempotent and must not call external systems inline - they enqueue jobs instead.

| Event | Publisher | Subscribers |
|---|---|---|
| `user.registered` | auth | messaging (welcome notification/email) |
| `hospital.approved` / `hospital.rejected`, `agent.approved` / `agent.rejected` | admin | messaging |
| `screening.completed` | screening | messaging (notification + WebSocket) |
| `case.created`, `case.status_changed`, `quote.sent`, `quote.accepted` | cases | messaging (case conversation, notifications) |
| `booking.created` | cases | payments (instalment schedule) |
| `booking.confirmed`, `booking.admitted` | cases | messaging, cases (checklist) |
| `booking.completed` | cases | **ledger** (revenue recognition), **settlements** (items), messaging |
| `booking.cancelled` (with `initiated_by`, `refund_pct`, `refundable_minor`) | cases | payments (automatic refunds), messaging |
| `payment.captured` | payments | **cases** (apply payment, confirm booking), **ledger** (capture posting), messaging |
| `payment.failed` | payments | messaging |
| `refund.processed` | payments | **ledger**, **cases** (refunded amount), settlements (clawback), messaging |
| `payout.processed` / `payout.failed` | settlements | ledger (payout posting), messaging |
| `message.created` | messaging | messaging (WebSocket + notification) |
| `document.uploaded` | documents | - |

### 3.2 Job queue (transactional outbox in PostgreSQL)

`background_jobs` rows are inserted with `enqueue(...)` in the same transaction as the business change, so a job
exists if and only if the change committed. Workers claim jobs with `SELECT ... FOR UPDATE SKIP LOCKED`, which
lets any number of worker processes run without a broker and without double-processing. Jobs retry with backoff
up to `max_attempts` (5) and then move to `dead` for operator attention; a partial unique index on `dedupe_key`
(while queued/running) prevents duplicate work.

Typical jobs: `screening.run_ai`, email/push delivery, gateway refund/payout calls, invoice PDF generation.
Periodic schedules (registered with `@periodic`): settlement items `pending -> eligible` (hourly), automatic
settlement batches for payees whose cycle is due (daily), gateway settlement sweep (daily), expiring unpaid orders
and quotes, overdue instalments.

In development the API can run the worker loop in-process (`RUN_WORKER_IN_API=true`); in production the worker
is a separate container (`RUN_WORKER_IN_API=false`).

### 3.3 Realtime

Clients connect to `WSS /api/v1/ws?token=<access token>`. The server pushes `{"type", "data"}` events:
`message.created`, `notification.created`, `screening.completed`, `booking.updated`, `case.updated`.
`realtime.send_to_user` delivers to every connection of that user; with Redis configured, events are fanned out
via pub/sub so a user connected to any API process receives them.

## 4. Data model overview

PostgreSQL 17 with extensions `citext` (case-insensitive emails), `pg_trgm` + `btree_gin` (fuzzy search on
hospital/procedure names), `pgcrypto`.

Conventions: UUIDv7 primary keys (time-ordered, index-friendly); `created_at`/`updated_at` `timestamptz`;
enums stored as `VARCHAR` with lowercase snake_case values shared by every client; money as `*_minor BIGINT` plus
ISO-4217 `currency`; rates in basis points; FX as `NUMERIC(18,8)`; human-readable numbers from sequences
(`HIG-C-2026-000123`, `HIG-B-...`, `HIG-P-...`, `HIG-S-...`, invoice `HIG/2026-27/000001`).

| Domain | Main tables |
|---|---|
| Identity | `users`, `refresh_tokens`, `verification_tokens`, `consents` (append-only), `device_tokens`, `audit_logs` (append-only) |
| Patients | `patient_profiles` (encrypted passport/insurance numbers), `patient_companions`, `saved_items` |
| Agents | `agents` (agent code, KYC, tier, commission override) |
| Catalogue | `specialties`, `procedures`, `cost_benchmarks`, `cultural_tips`, `fx_rates`, `platform_settings` |
| Hospitals | `hospitals`, `hospital_members`, `hospital_specialties`, `doctors`, `hospital_procedures`, `treatment_packages`, `availability_slots`, `reviews` |
| Screening | `screenings` (answers + AI result), `screening_matches`, `ai_request_logs` |
| Cases | `cases`, `case_status_history`, `quotes`, `bookings`, `consultations`, `checklist_items`, `itinerary_items` |
| Travel | `visa_requests`, `accommodation_providers`, `accommodation_hospital_links`, `service_providers`, `travel_bookings`, `accommodation_bookings`, `service_bookings`, `sos_alerts` |
| Documents | `documents` (metadata; bytes live in object storage under random keys) |
| Messaging | `conversations`, `conversation_participants`, `messages`, `notifications` |
| Payments | `payment_orders`, `payments`, `refunds`, `webhook_events`, `installments`, `invoices` |
| Ledger | `ledger_accounts`, `ledger_transactions`, `ledger_entries` |
| Settlements | `commission_rules`, `payout_accounts` (encrypted account numbers), `settlement_items`, `settlement_batches`, `payouts` |
| Jobs | `background_jobs` |

State machines:

- **Case**: `enquiry -> quoted -> accepted -> booked -> in_treatment -> completed`; `cancelled` from any state
  before treatment; `declined` by the hospital from `enquiry|quoted`. Every transition writes
  `case_status_history` and publishes `case.status_changed`.
- **Booking**: `pending_payment -> confirmed` (first captured payment >= deposit) `-> admitted -> completed`;
  `cancelled` from `pending_payment|confirmed`. Confirmation snapshots the current `refund_policy` setting onto
  the booking, so later policy changes never alter an existing booking's terms.
- **Emergency gating**: a case whose screening urgency is `emergency` cannot reach quote acceptance or booking
  until the patient (or their agent) acknowledges the emergency guidance (`emergency_acknowledged_at`, audited).
- **Cancellation refunds**: patient-initiated cancellations use the snapshotted tiers; hospital- or
  platform-initiated cancellations (and never-confirmed bookings) refund 100% of the net amount paid.

Relationships default to `lazy="raise"`: every query loads what it needs explicitly (`selectinload` /
`joinedload`), which eliminates N+1 queries and accidental async lazy loads.

## 5. Money flow and the ledger

### 5.1 Principles

- Integer minor units everywhere, never floats. Currency exponents: 0 (JPY, KRW), 3 (KWD, BHD, OMR), else 2.
- Patients pay in their own currency (USD by default); every order stores an **FX snapshot** (`fx_rate`, INR per
  unit) and the INR `base_amount_minor`. The ledger is kept in **INR**.
- Amounts are always derived server-side from bookings, instalments and settings; client amounts are ignored.
- FX rates must be current (`fx_rate_max_age_hours`); in production a missing or stale rate refuses the order
  (503 `fx_rate_unavailable`) instead of pricing on a fallback.
- Nothing is captured silently: a gateway amount that differs from the order is held for a finance decision
  (accept what was received, or return it in full); a bank transfer is captured only after a second finance user
  approves the first user's mark-paid; large refunds and manual payouts also need a second approver.
- Idempotency is enforced by unique keys: order `(payer, Idempotency-Key)`, `(gateway, gateway_order_id)`,
  `(gateway, gateway_payment_id)`, webhook `(gateway, event_id)`, ledger `idempotency_key`.

### 5.2 Double-entry ledger

`ledger_transactions` group `ledger_entries` (debit/credit, amount > 0). The database itself guarantees
integrity: a deferred constraint trigger asserts that debits equal credits per transaction, and triggers reject
any UPDATE or DELETE on entries and transactions (corrections are new, reversing transactions). Accounts carry a
cached `balance_minor` updated under row locks taken in id order (no deadlocks).

Fixed accounts: `GATEWAY:{gw}:RECEIVABLE`, `PLATFORM:BANK`, `PLATFORM:PATIENT_ESCROW`,
`PLATFORM:COMMISSION_REVENUE`, `PLATFORM:SERVICE_FEE_REVENUE`, `TAX:GST_OUTPUT`, `TAX:TDS_194O`,
`EXPENSE:GATEWAY_FEES`, `EXPENSE:AGENT_COMMISSION`, `HOSPITAL:{id}:PAYABLE`, `AGENT:{id}:PAYABLE`,
`VENDOR:{id}:PAYABLE`.

### 5.3 Postings

| Step | Trigger | Entries (INR) |
|---|---|---|
| 1. Capture | `payment.captured` (amount A, fee F) | Dr gateway receivable A / Cr patient escrow A; Dr gateway fees F / Cr gateway receivable F |
| 2. Revenue recognition | `booking.completed` (P = paid - refunded, H = P - service fees) | Commission C = H x rate, GST G = C x gst, TDS T = H x tds, hospital net N = H - C - G - T. Dr escrow P / Cr hospital payable N, Cr commission revenue C, Cr GST output G, Cr TDS 194-O T, Cr service-fee revenue (P - H). With an agent: Dr agent commission expense K / Cr agent payable K (K = H x agent rate, K <= C) |
| 3. Refund | `refund.processed` | Before completion: Dr escrow R / Cr gateway receivable R. After completion: proportional reversal of step 2 + negative (clawback) settlement items |
| 4. Payout | `payout.processed` (X) | Dr hospital/agent payable X / Cr platform bank X |
| 5. Gateway sweep | daily job (captures older than T+2) | Dr platform bank / Cr gateway receivable |

Late payments after completion (e.g. instalments) produce incremental step-2 postings and settlement items.

### 5.4 Settlement pipeline

```
booking.completed ──► settlement_items (pending, eligible_at = completed_at + hold days)
  hourly job ──► eligible ──► daily auto-batch per payee whose cycle is due (or finance clicks "Generate")
  batch: draft ─► pending_approval ─► approved (by a DIFFERENT finance/super_admin user: maker-checker)
         ─► processing ─► payouts (razorpay_route | razorpayx | manual_bank_transfer + UTR | mock)
         ─► completed | partially_failed
```

Commission resolution: the most specific active rule wins (procedure+hospital > hospital > procedure > specialty >
global); agent commission rules are resolved separately and paid out of platform commission. Items on hold are
skipped; negative (clawback) items net against the payee's positive items in the same batch.

## 6. AI screening pipeline

```
POST /screenings (draft) ─► PATCH answers per step ─► POST /screenings/{id}/submit {consent_ai}
      │                                                    │ status=processing, enqueue screening.run_ai
      ▼                                                    ▼
 client polls GET /screenings/{id}  ◄── ws screening.completed ◄── worker: triage ─► matching ─► persist
                                                                                   top-10 screening_matches
```

1. **Intake** - specialty, body areas, pain intensity, symptoms (yes/maybe/no), duration, severity
   (work/sleep/mobility), previous treatments, notes, preferences (languages, doctor gender, budget, travel window,
   use AI), optional reports (up to 3 PDFs/images, only with AI consent).
2. **Triage (Claude)** - `AsyncAnthropic` with the model from `AI_MODEL` (default `claude-opus-5-5`), effort from
   `AI_EFFORT`, and **structured output** constrained by a JSON schema (`TriageResult`). The system prompt (cached)
   states the assistant is a medical-travel triage aid, **not a diagnosis**, embeds the catalogue of valid
   specialty/procedure slugs, treats all patient text as untrusted data (prompt-injection resistant), and forces
   `urgency="emergency"` with advice to seek local emergency care for red-flag symptoms. The intake is sent as JSON
   inside `<patient_intake>` tags. Refusals are detected via `stop_reason`; errors are caught by type.
3. **Validation** - unknown slugs are dropped server-side; the result is stored on the screening with engine,
   model and urgency; every call is logged in `ai_request_logs` (tokens, latency, status).
4. **Rules fallback** - with no API key, AI disabled, `use_ai=false`, an error or a refusal, a deterministic
   keyword/body-area engine produces the same shape with `engine="rules"`. The product never depends on the AI
   being available.
5. **Matching** - deterministic SQL + Python over active doctors in active hospitals. Score (0-100) = specialty 30
   + procedure offered 20 + accreditation (JCI 10 / NABH 7) + rating 10 x (rating/5) + success rate 10 x (pct/100)
   + language 5 + doctor-gender preference 5 + budget fit 5 + availability in the travel window 5, with
   human-readable reasons. Estimated cost = package price or hospital procedure minimum, converted to the
   patient's budget currency.

## 7. Security model

| Layer | Controls |
|---|---|
| Edge | TLS 1.2/1.3 only, HSTS, HTTP to HTTPS redirect, unknown-SNI handshake rejection, per-IP rate limits (auth, uploads, API), connection limits, 20 MB body cap, CSP and security headers for the SPAs, `/metrics` not exposed |
| Doors | Public door (patients, agents, hospital users; website and mobile) and a web-only staff door at `/gahi/` (staff roles only, TOTP, stricter rate limit, optional `STAFF_ALLOWED_IPS`, `noindex`, never linked publicly). Separate refresh cookies; tokens are bound to their door |
| Authentication | Argon2id password hashes, lockout after repeated failures, short-lived JWT access tokens (`iss/aud/exp/type` checked), rotating refresh tokens stored hashed with reuse detection (whole family revoked), httpOnly `SameSite=Strict` refresh cookie scoped to `/api/v1/auth` plus `X-Requested-With` CSRF guard, TOTP MFA for staff, Google sign-in via verified ID tokens |
| Authorisation | Role checks on every endpoint plus resource scoping in queries: patients see their own data, agents their managed/referred patients, hospital members their hospital(s), staff everything (finance actions restricted to finance/super_admin). Out-of-scope ids return 404 to avoid enumeration |
| Data | AES-256-GCM field encryption for passport, insurance policy, bank account and PAN numbers and MFA secrets, with masked values (`*_last4`) in responses; PII, tokens and card data never logged; cards never touch our servers |
| Payments | Webhook HMAC verified over the raw body, stored before processing, deduplicated by event id; Stripe signatures with 5-minute tolerance; amounts recomputed server-side; row locks on bookings/orders when applying payments; mock gateway refused in production |
| Uploads | Size limit, magic-byte allowlist (pdf/jpg/png/webp/heic/dcm), SHA-256, random storage keys, no path traversal, served only via an authorised download endpoint with `Content-Disposition: attachment` |
| Audit | Append-only audit log for logins/MFA, role/status changes, KYC approvals, quote/booking transitions, payments, refunds, settlement approvals and payouts, settings and document verification |
| Privacy | Explicit consents (terms, privacy, AI processing, sharing with hospitals) captured append-only and required before AI screening and before a case is shared with a hospital. An agent registering a patient must attest the patient's consent (kinds, method; audit-logged), and the patient confirms it on first login |
| Platform | Least-privilege database roles (schema-owner migrator used only by the migrate job; DML-only app role for api/worker), containers run as non-root, data tier on an internal network, secrets only via environment/secret store, production settings validated at startup (strong secrets, secure cookies, no mock gateway) |

## 8. Performance strategy

- **Async end to end**: FastAPI + asyncpg; no blocking I/O on the event loop; external calls (Claude, gateways,
  email, push) are moved to background jobs so request latency stays low.
- **Query discipline**: every FK and filter column is indexed; trigram GIN indexes for name search; `(status,
  city)` composite index for hospital listing; `lazy="raise"` relationships with explicit eager loading; pagination
  capped at 100 items.
- **Caching**: Redis for public catalogue reads (specialties, procedures, FX, settings) and rate-limit counters,
  with in-memory fallbacks; SPA assets are content-hashed and cached for a year (edge micro-cache + browser), while
  `index.html` is always revalidated.
- **Horizontal scaling**: stateless API processes (gunicorn workers x containers) behind the edge; any number of
  worker processes thanks to `SKIP LOCKED`; WebSocket fan-out through Redis pub/sub.
- **Connection budgeting**: `DB_POOL_SIZE + DB_MAX_OVERFLOW` per process x processes must stay below PostgreSQL
  `max_connections` (add PgBouncer in transaction mode when scaling far out).
- **Payload efficiency**: gzip at the edge, HTTP/2, list endpoints return compact "card" shapes, details on demand.
- **Observability**: structured JSON logs with request ids propagated from the edge, Prometheus `/metrics`,
  `ai_request_logs` for AI latency/tokens, health endpoints for orchestration.
