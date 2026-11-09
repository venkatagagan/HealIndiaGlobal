# Security

Threat model, security controls and compliance mapping for Heal India Global. The platform holds **health
data and identity documents of foreign nationals** and **moves money between patients, hospitals and
agents**. Those two facts drive most decisions below.

* **Status legend:** **[core]** = implemented in shared code (`backend/app/core/*`, `app/models/*`,
  `infra/*`) and verified when this was written. **[PLAN]** = required by `docs/PLAN.md` (§9 security
  checklist and module contracts) and implemented by the module owners. **[rec]** = recommendation, not yet
  required by PLAN. Each [PLAN] control has a test in the module's test suite (see §19).
* **No certification claims.** Heal India Global is **not** certified or attested under HIPAA, ISO 27001,
  SOC 2, PCI DSS or any other scheme. §17 maps controls to legal frameworks as a gap analysis aid, not as a
  compliance statement. Product copy must never claim certifications we don't hold (PLAN §9.9).
* Production hardening checklist: [DEPLOYMENT.md](DEPLOYMENT.md) §3, §13–15. Runbooks (rotation, unlock,
  MFA reset, webhook replay): [OPERATIONS.md](OPERATIONS.md). Payment flows: [PAYMENTS.md](PAYMENTS.md).

---

## 1. Assets and security objectives

| Asset | Why it matters | Primary objective |
|---|---|---|
| Health data: screenings, AI triage results, medical reports, case summaries, messages | Special-category data (GDPR Art. 9). Sensitive under DPDP. Harm if disclosed. | Confidentiality, need-to-know access |
| Identity data: passport numbers and scans, visas, DOB, nationality, insurance policy numbers | Identity theft, visa fraud | Confidentiality (field encryption, masking) |
| Money: payment orders, ledger, settlements, payout accounts | Direct financial loss, fraud | Integrity (double-entry, immutability, maker-checker) |
| Accounts and sessions: passwords, refresh tokens, MFA secrets, staff accounts | Gateway to everything else | Strong authentication, revocation |
| Availability of coordination: messages, itinerary, SOS, helplines | Patients may be mid-treatment abroad | Availability, degraded modes |
| AI usage: Anthropic API key and spend | Cost abuse, data sent to a third party | Consent gating, rate limiting |

---

## 2. Architecture and trust boundaries

```
 Internet (untrusted)                     │ edge (TLS)            │ private network                   │ third parties
                                          │                       │                                   │
 Patient web / Agent / Hospital / Admin ──┼─► nginx  ─────────────┼─► API (FastAPI, gunicorn/uvicorn) ─┼─► Razorpay / Stripe (REST)
 SPAs (browser)                           │  TLS 1.2/1.3, HSTS,   │     │  ▲                          ├─► Anthropic Claude API
 Flutter app (Android/iOS)  ──────────────┼─► rate limits, CSP,   │     ▼  │ jobs (outbox)            ├─► SMTP / FCM
 Payment gateway webhooks ────────────────┼─► /metrics → 404      │   Worker (python -m app.worker) ──┼─► Google (id_token keys)
                                          │                       │     │                             │
                                          │                       │   PostgreSQL 17 · Redis · S3/MinIO│
```

* **TB1 Internet → edge:** everything is untrusted, including gateway webhooks until their signature is
  verified.
* **TB2 edge → API:** nginx forwards `X-Forwarded-For` / `X-Real-IP` / `X-Request-ID`. The API trusts
  forwarded headers only from private or loopback peers (`app.core.deps.get_client_ip`). See finding F1.
* **TB3 API/worker → data stores:** PostgreSQL, Redis and MinIO sit on a private Docker network (`data`) with
  no published ports in `infra/docker-compose.yml`. Locally, the dedicated PostgreSQL cluster listens on
  127.0.0.1:5433 only.
* **TB4 platform → third parties:** outbound HTTPS only. The data sent is minimised per §8 (AI) and §10
  (payments).

---

## 3. Threat model (STRIDE per component)

### 3.1 Clients: web SPAs (patient, agent, hospital, admin) and the Flutter app

| STRIDE | Threat | Controls |
|---|---|---|
| S | Phishing look-alike portals; stolen session | Short-lived access tokens (15 min) **[core]**. Refresh tokens rotate with reuse detection **[PLAN]**. Staff MFA (TOTP) **[core+PLAN]**. HSTS **[core]**. |
| T | XSS altering the UI or stealing tokens | Strict SPA CSP (`script-src 'self'` + Razorpay/Stripe/Google only), `frame-ancestors 'none'`, `object-src 'none'` **[core: infra/nginx/snippets/csp-spa.conf]**. React escaping. Access token kept **in memory**; refresh token in an **httpOnly** cookie **[PLAN]**. |
| R | User denies an action (cancellation, quote acceptance) | Server-side audit log with actor, IP and user agent **[PLAN]** |
| I | Tokens or PII leaked from device storage, logs or Referer | Mobile refresh token in `flutter_secure_storage` (Keychain/Keystore) **[PLAN]**. Web never stores tokens in `localStorage` **[PLAN]**. One-time tokens in SPA URLs can leak through `Referer` into access logs (finding F4). |
| D | Client floods the API | Edge and API rate limits (§11) |
| E | Tampered client calls admin endpoints or other tenants' ids | All authorization is server-side: `require_roles` + resource scoping, with out-of-scope ids returning 404 **[core+PLAN]**. UI role checks are cosmetic. |

### 3.2 Edge and API (nginx + FastAPI)

| STRIDE | Threat | Controls |
|---|---|---|
| S | Forged JWT; token for another audience; `alg` confusion | HS256 with a fixed algorithm list. `iss`=`heal-india-global`, `aud`=`hig-api`, `type`=`access` and required `exp/iat/sub` are all checked; 5 s leeway **[core: app/core/security.py]**. Production refuses to start with a weak `JWT_SECRET` (< 32 chars or a known-weak value) **[core: config.py]**. |
| S | Credential stuffing, brute force | Argon2id. Login 10/min/IP and lockout after 5 failures for 15 min **[PLAN]**. Edge `auth_zone` 30 req/min per IP **[core: nginx]**. |
| T | Mass assignment, over-posting, injection | Pydantic v2 request models forbid extra fields and constrain lengths **[PLAN §3]**. SQLAlchemy parameterised queries. Enums validated. |
| T | Amount tampering at checkout | Amounts computed server-side. Gateway amount and currency re-checked on capture **[PLAN §9.3]**. |
| R | Disputed staff actions (approvals, refunds, role changes) | `audit_logs` with before/after JSON (redacted) **[core: app/core/audit.py + PLAN §9.8]**. Request id on every response and log line **[core]**. |
| I | IDOR: reading another patient's case or document | Resource scoping in `policies.py` returns **404** for out-of-scope ids **[PLAN §9.1]**, with an IDOR test per module (§19) |
| I | Verbose errors and stack traces | Uniform error envelope. Unhandled errors return `internal_error` without details **[core: errors.py, middleware.py]**. Docs off in production when `ENABLE_DOCS=false` **[core]**. |
| I | Metrics and health leakage | `/metrics` returns 404 at the edge **[core: app-locations.conf]**, and in production also 404 unless the peer is private/loopback **[core: main.py]**. `/health/ready` reveals only ok/error per dependency. |
| D | Large uploads, slowloris, expensive endpoints | `client_max_body_size 20m`, header and body timeouts, `limit_conn` 100/IP **[core: nginx]**. `MAX_UPLOAD_MB` **[core]**. Rate limits on AI submit and uploads **[PLAN]**. |
| E | Privilege escalation via role change | Only AD can change roles. The last `super_admin` can't be demoted. Role changes are audited **[PLAN §8.13]**. `require_roles` always admits `super_admin` and nobody else implicitly **[core]**. |
| E | Suspended or locked user keeps using a token | Every request reloads the user. `suspended` → 403 `account_suspended`, deleted → 403 `account_deleted`, locked → 403 `account_locked` **[core: app/core/deps.py]**. |

### 3.3 Worker (`python -m app.worker`)

| STRIDE | Threat | Controls |
|---|---|---|
| S | Forged job rows | Jobs are only inserted by application code in the business transaction (outbox). DB access requires DB credentials (TB3). |
| T | Poisoned payloads (for example ids pointing at other tenants) | Tasks re-load entities and re-check state. Payloads carry ids, not authority. |
| R | Unexplained side effects (emails, payouts) | `background_jobs` keeps attempts, `last_error`, `locked_by`, `finished_at` **[core]**. Business effects are audited. |
| I | PII in job payloads or `last_error` | Payloads should carry ids only **[rec]**. Logs are redacted **[core]**. Finished jobs are purged by `jobs.cleanup` (succeeded after 14 days, failed/dead after 90) **[core]**. |
| D | Poison job loops; crashed worker holding locks | Exponential backoff (30 s·2ⁿ, max 6 h), `max_attempts` 5, then `dead`. Stale locks are re-queued after 30 min. Per-task timeout 900 s **[core: app/core/jobs.py]**. |
| E | Task executing with excessive rights | The worker uses the same least-privileged DB role as the API **[rec: §16]**. External calls only from tasks (PLAN §6.1). |

### 3.4 PostgreSQL

| STRIDE | Threat | Controls |
|---|---|---|
| S | Stolen DB credentials | `scram-sha-256` auth, listening on 127.0.0.1 (local cluster) or a private network (compose). Credentials only in `DATABASE_URL` **[core]**. |
| T | Ledger tampering or "fixing" balances | Ledger rows are append-only: UPDATE/DELETE triggers raise SQLSTATE 23001, and a deferred trigger rejects unbalanced transactions (SQLSTATE 23514) **[core: app/models/ledger.py]**. The runtime role still owns its tables and could disable triggers or TRUNCATE, so separate the migration-owner and runtime roles **[rec: §16]**. |
| R | Direct SQL changes without trace | Ops changes go through scripts that call `audit_log()` (OPERATIONS.md). PostgreSQL statement logging for DDL **[rec]**. |
| I | Dump or backup theft; disk theft | Field-level AES-256-GCM for six identifier and secret columns **[core]**. Volume/disk encryption and encrypted backups **[rec / DEPLOYMENT §4]**. |
| D | Connection exhaustion | Pool size 10 + overflow 20 per process, 30 s pool timeout, `pre_ping` **[core: db.py]** |
| E | SQL injection | ORM / bound parameters only. `EncryptedString` refuses SQL literal rendering **[core]**. |

### 3.5 Object storage (local `STORAGE_LOCAL_DIR` or S3/MinIO)

| STRIDE | Threat | Controls |
|---|---|---|
| S/E | Direct public access to files | No public URLs. Files are served only via `GET /documents/{id}/download` after an authorization check **[PLAN §8.3]**. Bucket private **[rec / DEPLOYMENT §8]**. |
| T | Path traversal or overwrite through names | Random keys `<prefix>/YYYY/MM/<uuid>.<ext>`. `validate_key` rejects absolute paths, `..`, backslashes, `:` and NUL. The local backend re-checks root containment **[core: storage.py]**. The user file name is metadata only. |
| T | Malicious files (polyglots, malware) | Magic-byte allowlist, size limit **[PLAN]**. Malware scanning **[rec]**. |
| I | Medical files readable by storage admins or backups | Encryption at rest at the storage layer (S3 SSE / encrypted volume) **[rec]**. Application-level encryption of blobs is not implemented (finding F6). |
| D | Storage exhaustion | Per-request size limit **[core]**. Per-user quotas **[rec]**. |

### 3.6 Payment gateways and webhooks

| STRIDE | Threat | Controls |
|---|---|---|
| S | Forged webhook ("payment captured") | HMAC over the **raw body** (`X-Razorpay-Signature`; `Stripe-Signature` with 300 s tolerance), constant-time compare, verified **before** parsing **[PLAN §9.4]** |
| S | Forged client callback (`/verify`) | Razorpay signature check, then a server-side `fetch_payment` with amount and currency comparison **[PLAN]** |
| T | Replay of old events; double processing | `UNIQUE(gateway, event_id)`, `UNIQUE(gateway, gateway_payment_id)`, ledger `idempotency_key`, `SELECT … FOR UPDATE` **[PLAN]** |
| R | "We never received the money" | `webhook_events` keeps verified payloads (payer PII scrubbed). `payments.raw` stores the gateway response. Every capture, refund and payout is audited. Daily reconciliation (PAYMENTS.md §11). |
| I | Card data exposure | Cards are entered only in gateway-hosted UI (Checkout.js iframe, Stripe Elements). No PAN, CVV or expiry reaches our servers **[PLAN §9.6]**. |
| D | Webhook floods | Edge passes webhooks through (gateways burst from shared ranges). Invalid signatures are rejected cheaply before parsing. |
| E | Insider marks orders paid or approves payouts alone | `mark-paid` restricted to finance and audited. Settlement batches require approver ≠ creator **[PLAN]**. Extend maker-checker to refunds and manual payouts **[rec]** (PAYMENTS.md §14). |

### 3.7 AI provider (Anthropic Claude API)

| STRIDE | Threat | Controls |
|---|---|---|
| S | Stolen `ANTHROPIC_API_KEY` used elsewhere | Key only in the secret store. Separate keys per environment. Console spend limits and alerts **[rec]**. |
| T | Prompt injection in patient notes or uploaded reports ("ignore instructions…") | The system prompt marks patient content as untrusted data. JSON-schema-constrained output (`output_config.format`). No tools are given to the model. The server drops unknown specialty/procedure slugs **[PLAN §7]**. |
| R | Unclear which model produced a triage | `ai_request_logs` (model, tokens, latency, status). `screenings.ai_engine` / `ai_model` **[PLAN]**. Record `response.model`, which can differ when a server-side fallback served the request (§8.5). |
| I | Health data sent to a third party without a lawful basis | Consent gate (`consent_ai` + `ai_processing` consent), minimised intake with no direct identifiers, reports attached only with consent **[PLAN + §8]** |
| D | Provider outage or refusal blocks screening | Deterministic rules-engine fallback with the same output shape (`engine="rules"`) **[PLAN §7]** |
| E | Model output treated as a medical decision | Output is advisory with a disclaimer. Matching is deterministic SQL. Doctors and coordinators decide. Emergencies divert the patient to local emergency care **[PLAN §7]**. |

---

## 4. Authentication

### 4.1 Passwords [core + PLAN]

* Argon2id via `pwdlib` (library defaults; `needs_rehash` enables transparent upgrades).
* Policy: 10–128 characters, at least one letter and one digit, and not in the common-password list
  (`app.core.security.validate_password_strength`, error code `weak_password`).
* Unknown accounts run a dummy hash, so response time doesn't reveal whether an account exists.
  `forgot-password` always returns 202.
* Lockout: 5 consecutive failures (wrong passwords **and** wrong TOTP codes) set `users.locked_until` = now +
  15 min (`failed_login_count`; audited as `auth.account_locked`). Wrong credentials return 401
  `invalid_credentials`; a locked account returns 403 `account_locked` **[core+PLAN]**. Lockout can be abused
  to lock known staff accounts, so staff use MFA and the unlock runbook. Per-account+IP progressive delays are
  an option **[rec]**.

### 4.2 Tokens

| Token | Format | Lifetime | Storage (server) | Notes |
|---|---|---|---|---|
| Access | JWT HS256: `sub`, `role`, `type=access`, `iss`, `aud`, `iat`, `nbf`, `exp`, `jti`, optional `sid` | `ACCESS_TOKEN_TTL_MINUTES` (15) | Not stored | Sent as `Authorization: Bearer`. Validated on every request together with the user's live status. |
| Refresh | Opaque `secrets.token_urlsafe(48)` | `REFRESH_TOKEN_TTL_DAYS` (30) | `refresh_tokens.token_hash` = sha256 (never the raw token), `family_id`, `replaced_by_id`, `revoked_at`, `ip`, `user_agent` | **Rotated on every use.** Presenting an already-rotated token is reuse: the whole family is revoked and the user must log in again **[PLAN]**. |
| Email verify / reset / invite | Opaque `token_urlsafe(32)` | Short expiry | `verification_tokens.token_hash` (sha256), `used_at` | Single use. Compared by hash lookup. |

* Refresh errors (all 401): `refresh_token_reused` (family revoked), `refresh_token_expired`,
  `invalid_refresh_token`. A cookie-based refresh or logout without `X-Requested-With` gets 403
  `csrf_check_failed`.
* Rotating `JWT_SECRET` invalidates only access tokens. Refresh tokens are DB rows, so clients refresh
  transparently (OPERATIONS.md → *Secret rotation*).
* Logout revokes the refresh token or family **[PLAN]**. Password change or reset should revoke all of the
  user's families **[rec]**.
* **Multi-tab false positives:** two tabs refreshing at once can trip reuse detection and log the user out.
  The shared web client refreshes single-flight per tab. Add cross-tab coordination (BroadcastChannel or Web
  Locks) or a few-second grace window for the immediately previous token **[rec]** (finding F7).

### 4.3 Web vs mobile token handling

| | Web SPAs | Flutter app |
|---|---|---|
| Access token | In memory (shared API client). Lost on reload and re-obtained via refresh. | In memory, plus refresh as needed |
| Refresh token | httpOnly cookie `hig_refresh`, `Path=/api/v1/auth`, `SameSite=Strict`, `Secure` when `COOKIE_SECURE=true` (mandatory in production), optional `COOKIE_DOMAIN` | Returned in the JSON body (`refresh_token`) because the app sends `X-Client-Type: mobile`. Stored in `flutter_secure_storage`. |
| CSRF defence | `SameSite=Strict`, plus `X-Requested-With: XMLHttpRequest` required on cookie-based `/auth/refresh` and `/auth/logout` (forces a CORS preflight; only allowlisted origins pass). The cookie is scoped to auth paths. | Not cookie-based |
| Same-origin | Each SPA reaches the API at `/api/` on its own domain through nginx, so the cookie is first-party | n/a |

### 4.4 MFA (TOTP) [core + PLAN]

* `POST /auth/mfa/setup` returns `{secret, otpauth_url}`. `/auth/mfa/enable {code}` and
  `/auth/mfa/disable {code}`. 6-digit TOTP with ±1 step tolerance (`pyotp`). The secret is stored encrypted
  (`users.mfa_secret`, AES-256-GCM).
* Login returns 401 `mfa_required` until `otp_code` is supplied. A wrong code returns 401 `invalid_otp` and
  counts toward the lockout.
* `ADMIN_MFA_REQUIRED=true` enforces MFA for staff roles **[core: auth service]**:
  * A staff user without MFA is **enrolled at sign-in**. After a correct password the API generates a secret
    and returns 401 `mfa_required` with `details = {setup_required: true, secret, otpauth_url}`. The user
    scans it and repeats the login with `otp_code`.
  * Staff can't disable MFA while it's required (403 `mfa_required_for_staff`).
  * The setting defaults to `false` for development and **must be true in production** (DEPLOYMENT.md §15).
    Production settings validation doesn't enforce it yet **[rec]**.
* Because staff enrol at sign-in, **anyone who knows a staff password can enrol right after an MFA reset**.
  The MFA-reset runbook therefore resets the password at the same time and verifies identity out of band
  (OPERATIONS.md).
* No recovery codes in PLAN. A lost device goes through the MFA reset runbook (identity verification plus a
  second admin) **[rec: add recovery codes]**.
* Within its validity window a TOTP code can be replayed. Remember the last accepted time-step per user
  **[rec]**.

### 4.5 Google Sign-In, guests, email verification

* **Google:** verify the `id_token` signature, `iss`, `exp` and **`aud` ∈ `GOOGLE_CLIENT_IDS`**. Link by
  `google_sub`. An existing email account is linked only when Google reports `email_verified`, and an email
  already linked to a different Google identity is refused (409 `google_account_mismatch`). Linking is
  audited (`auth.google_linked`), and MFA still applies (`otp_code`) **[implemented]**.
  The `role` parameter may only be `patient|agent|hospital` on first sign-up, never a staff role.
* **Guests:** `POST /auth/guest` creates a `patient` with `is_guest=true` and no email. `/auth/guest/upgrade`
  converts it in place. Rate-limit guest creation and purge inactive guest accounts and their data
  **[rec: e.g. 90 days, DEPLOYMENT §13]**.
* **Email verification:** `REQUIRE_EMAIL_VERIFICATION` (true in production) **[core setting]**.

---

## 5. Authorization

### 5.1 Roles

| Role | Scope |
|---|---|
| `patient` | Own profile, screenings, cases, bookings, documents, payments, messages |
| `agent` | Patients they manage (`managed_by_agent_id`) or referred (`referred_by_agent_id`), and those patients' cases, screenings, documents and payments; own commissions |
| `hospital` | Hospitals they're a member of (`hospital_members`). `X-Hospital-Id` selects one and is validated against membership. Covers cases, quotes, bookings and documents of linked cases, and own finance. |
| `support` | Staff: all cases, travel, messaging (coordinators) |
| `admin` | Staff: operations, catalog, users, approvals (`AD` endpoints with `super_admin`) |
| `finance` | Staff: payments, refunds, ledger, settlements (`F` endpoints with `super_admin`) |
| `super_admin` | Everything. Always passes `require_roles`. |

`app.core.deps` exposes `require_roles(*roles)`, `STAFF_ROLES`, `FINANCE_ROLES`, `ADMIN_ROLES`, `is_staff`,
`has_role` **[core]**.

### 5.2 Resource scoping and IDOR [PLAN §9.1]

* Every query is filtered by the caller's scope in the module's `policies.py`, not only by role.
* **Out-of-scope ids return 404, not 403**, so their existence isn't revealed.
* Nested resources check the parent too (for example `/bookings/{id}/itinerary/{item_id}` checks the booking
  scope and that the item belongs to that booking).
* Within a hospital, `member_role` (`owner|admin|coordinator|finance|doctor`) exists, but PLAN doesn't define
  per-role permissions. Restrict payout accounts and finance endpoints to `owner`/`finance` and member
  management to `owner`/`admin` **[rec]** (finding F9).

### 5.3 Separation of duties

| Action | Control |
|---|---|
| Settlement batch approval | **Maker-checker:** `approved_by` ≠ `created_by` (F or super_admin), else 403 `maker_checker` **[PLAN, implemented]**. Batches generated by `settlements.auto_batch` have no creator, so a single finance user approves them **[rec: require a named maker]**. |
| Refund approval, bank-transfer `mark-paid`, payout `mark-paid` (UTR) | Finance only and audited **[PLAN]**. The implementation lets the requester of a refund approve it. Cancellation refunds are auto-approved. Require a second user above a threshold **[rec]**. |
| Payout account create/change | Write-only account number, returned masked. Finance verifies (`/verify`). Changing the account number or bank details **resets verification**, and `razorpay_linked_account_id` can only be set by finance **[implemented]**. Also notify the hospital owner and add a cooling-off period before the next payout (protects against bank-detail-change fraud) **[rec]**. |
| Platform settings | `PUT /admin/settings/{key}`: finance keys (`default_commission_bps`, `default_agent_commission_bps`, `gst_rate_bps`, `tds_194o_rate_bps`, `deposit_pct`, `settlement_hold_days`, `settlement_cycle_days`, `patient_service_fee_bps`, `refund_policy`, `bank_transfer_details`) are F only **[core: settings_store.FINANCE_KEYS]** |
| Staff creation and role changes | AD only. Last super_admin protected. Audited. |

---

## 6. Data classification and protection

### 6.1 Classification

| Class | Examples (tables / columns) | Handling |
|---|---|---|
| **Restricted: health** | `screenings` (symptoms, notes, severity, `ai_result`, `red_flags`), `patient_profiles.medical_history/allergies/blood_group`, `cases.medical_summary/patient_notes`, `documents` of kind `medical_report/prescription/lab_result/imaging`, `consultations.notes`, `messages.body`, `sos_alerts` (location) | Need-to-know scoping, consent before sharing or AI use, TLS, at-rest encryption, never logged, access audited **[rec for downloads]** |
| **Restricted: identifiers & secrets** | `passport_number`, `insurance_policy_number`, `hospitals.pan`, `payout_accounts.account_number`, `users.mfa_secret` (all **field-encrypted**); passport/visa scans; `password_hash`; token hashes | Field encryption + `*_last4` masking; full value never returned |
| **Confidential: personal** | Names, emails, phones, DOB, nationality, address, emergency contacts, companions, device tokens, IPs and user agents | Scoped access, minimisation, redacted logs |
| **Confidential: financial** | `payment_orders`, `payments` (incl. `raw` gateway payload: may hold payer email/phone, card network and last4), `webhook_events.payload`, ledger, settlements, invoices | Finance-only (plus own-scope views for H/A/P) |
| **Internal** | Platform settings, job payloads, catalog drafts, audit logs | Staff only |
| **Public** | Active hospitals, doctors, procedures, packages, cost benchmarks, content, FX rates | Public endpoints |

### 6.2 Field-level encryption [core: app/core/crypto.py]

* AES-256-GCM (authenticated). Format `"v1:" + urlsafe_b64(nonce[12] | ciphertext | tag[16])`, with a fresh
  random 96-bit nonce per value. The key is `FIELD_ENCRYPTION_KEY` (32 bytes, base64 or urlsafe-base64). It
  is required when `ENV=production`.
* `EncryptedString` columns: `users.mfa_secret`, `patient_profiles.passport_number`,
  `patient_profiles.insurance_policy_number`, `patient_companions.passport_number`, `hospitals.pan`,
  `payout_accounts.account_number`.
* Encrypted values can't be searched or compared in SQL. Use the `*_last4` columns. `mask()` keeps the last 4
  and fully masks short values.
* **Single key, no key id in the ciphertext**, so rotation is an offline re-encryption of all six columns
  (OPERATIONS.md → *Rotate FIELD_ENCRYPTION_KEY*). Keep the old key for as long as backups encrypted with it
  are retained. A keyring (`v2:<kid>:…`) would allow online rotation **[rec]** (finding F5).
* `FIELD_ENCRYPTION_KEY` loss = permanent loss of those fields. Escrow it (DEPLOYMENT §3).

### 6.3 In transit

* Edge: TLS 1.2/1.3 (Mozilla intermediate ciphers), session tickets off, OCSP stapling, HSTS
  `max-age=63072000; includeSubDomains`, HTTP→HTTPS redirect **[core: infra/nginx]**.
* API responses also carry HSTS in production **[core: middleware.py]**.
* Internal hops (nginx→API, API→PostgreSQL/Redis/MinIO) run on private Docker networks. Use TLS (`?ssl=require`
  for asyncpg, `rediss://`) whenever a hop crosses hosts or uses a managed service **[rec / DEPLOYMENT §4, §7]**.
* Outbound: HTTPS to Razorpay, Stripe, Anthropic and Google. SMTP with STARTTLS (`SMTP_STARTTLS=true`).
* Mobile release builds must use `https://` `API_BASE_URL` (the dev defaults are `http://10.0.2.2:8000` /
  `http://127.0.0.1:8000`) and must not allow cleartext traffic **[rec]**.

### 6.4 At rest

* Database volumes, backups and object storage encrypted by the platform: managed-DB encryption, encrypted
  disks, S3 SSE (KMS) with versioning **[rec / DEPLOYMENT §4, §8]**.
* Documents aren't encrypted at the application layer (finding F6). Protect them with storage encryption and
  strict access. App-level envelope encryption of medical blobs is a candidate improvement **[rec]**.
* Development: `backend/.env` holds generated secrets and the local superuser password
  (`LOCAL_PG_SUPERUSER_PASSWORD`, dev only). It is git-ignored (`.gitignore`: `.env`, `.env.*`, `*.env`).
  Never print or copy it.

### 6.5 Minimisation and retention [rec]

PLAN has no retention or erasure jobs. DEPLOYMENT.md §13 proposes a schedule: medical data for the duration of
care plus the period required by Indian medical-records guidance; financial records 8 years; audit logs at
least 1 year; inactive guests 90 days. Implement purge or anonymisation jobs that also delete storage objects.
The ledger and settlement tables reference ids and contain no direct PII, so financial records can be kept
while personal fields are anonymised.

---

## 7. Medical data handling and consent

* **Consent records** (`consents`): `kind` ∈ `terms | privacy | ai_processing | share_with_hospitals |
  marketing`, `version`, `granted`, `ip`, `user_agent`. **Append-only**: withdrawal is a new row with
  `granted=false`. The latest row per kind wins **[PLAN]**.
* **Gates [PLAN §9.9]:**
  * AI screening uses Claude only with `consent_ai=true` on submit, which also records `ai_processing`.
    Otherwise the rules engine runs.
  * Creating a case shares the patient's case data with the chosen hospital and requires
    `share_with_hospitals`.
  * Marketing is opt-in only.
* **What hospitals see:** only cases linked to them (patient summary, screening summary, documents attached to
  that case). Hospitals are separate controllers/fiduciaries for the treatment they provide. Put a
  data-sharing agreement in place with each hospital **[rec]**.
* **Agents:** agents can create patients (`POST /agent-portal/patients`) and act for them. The patient's own
  consents (privacy, `share_with_hospitals`, `ai_processing`) must still be obtained, either through the
  emailed invite or a recorded attestation by the agent. PLAN doesn't define this (finding F10;
  DEPLOYMENT §13 suggests an attestation).
* **Minors:** paediatric treatment is common in medical travel. DPDP s.9 requires verifiable parental/guardian
  consent. PLAN has no guardian model (finding F10).
* **Access logging:** PLAN audits document *verification*. Also audit document *downloads* and staff views of
  medical records (accountability under DPDP/GDPR, and the HIPAA-style audit-controls practice) **[rec]**.
* **Messages** can contain health information. They are treated as Restricted, scoped to conversation
  participants, and never logged.
* **Emergencies:** an `urgency="emergency"` triage tells the patient to seek local emergency care instead of
  travelling. SOS alerts notify the coordinator and support staff. Rate limits on `/travel/sos` must be
  generous (§11).

---

## 8. AI data handling (Claude API)

### 8.1 What is sent

| Data | Sent? | Condition / note |
|---|---|---|
| System prompt: instructions plus the catalog's specialty and procedure slugs and names | Yes | Contains **no patient data**. Marked `cache_control: ephemeral`. |
| Intake answers (`app/modules/screening/ai/prompts.py::build_intake`): chosen specialty slug, body areas, pain intensity, symptom answers, duration, severity, previous treatments, free-text notes, home country, preferences (languages, doctor gender, travel window; **not** the budget) | Yes, as JSON inside `<patient_intake>` tags | Only when the gate in §8.2 passes |
| Clinical context from the profile: **age in years** (computed from DOB; the DOB itself isn't sent), gender, `medical_history` (first 2,000 chars), `allergies` (first 500 chars) | Yes, under `patient` in the intake | Same gate. Disclosed in the AI consent text **[rec]**. |
| Up to 3 uploaded reports from `report_document_ids`: PDFs as document blocks, JPEG/PNG/GIF/WebP as image blocks (HEIC and DICOM aren't sent), ≤ 10 MB each, base64 inline | Yes | **Only with `consent_ai`**. Reports often contain names and ids, which is why consent is mandatory. |
| Name, email, phone, passport, DOB, address, payment data, other documents | **No** | Never part of the intake ("de-identified intake") |
| Internal identifiers (user, patient, screening ids) | **No** | Correlate through `ai_request_logs.screening_id` on our side |

Free-text notes can contain identifiers. The UI should tell patients not to include contact details, and the
server can scrub emails and phone numbers before sending **[rec]**.

### 8.2 Consent gate and fallback

| `preferences.use_ai` (default true) | `consent_ai` on submit | AI available (`AI_ENABLED` and key set) | Result |
|---|---|---|---|
| true | false | any | **400 `consent_required`.** The patient must consent or switch AI off. |
| false | any | any | Rules engine (no external call) |
| true | true | no | Rules engine. `ai_request_logs.status = fallback` ("AI is not configured"). |
| true | true | yes | Claude. On error, timeout (`AI_TIMEOUT_SECONDS`), refusal or invalid output it falls back to rules (`ai_engine="rules"`; `ai_request_logs.status` = `error`/`refusal`/`fallback`). |

* Submitting with consent appends a `consents` row (`kind = ai_processing`, versioned, with IP and user
  agent) and audits `screening.submit` with `consent_ai` and `use_ai`.
* `POST /screenings/{id}/rerun` (completed or failed screenings only) reuses the stored `consent_ai`, so a
  re-run never upgrades a non-consented screening to Claude.
* Submit and rerun share a limit of 5/min per user (cost control).

### 8.3 Output handling

* JSON-schema output (`output_config.format`). The server validates it against `TriageResult` and drops slugs
  not in the DB. The first `text` block is parsed only after checking `stop_reason != "refusal"`.
* The result is **decision support, not a diagnosis**. It carries a disclaimer, matching is deterministic SQL,
  and hospital doctors review the case. No automated decision with legal or similarly significant effect is
  made from AI output (GDPR Art. 22 consideration).
* Red flags force `urgency="emergency"` with advice to seek local emergency care.

### 8.4 Request configuration (PLAN §7)

* `AsyncAnthropic`, model `settings.AI_MODEL` (default `claude-opus-5-5`), effort `settings.AI_EFFORT`
  (default `medium`), `max_tokens=16000`, client timeout `AI_TIMEOUT_SECONDS` (default 90 s).
* `client.beta.messages.create(..., betas=["server-side-fallback-2026-07-01"], fallbacks="default")`.
* No tools, no `thinking`, `temperature` or `budget_tokens` parameters, no assistant prefill (all rejected by
  this model).

### 8.5 Provider-side data handling: verify the current terms

Statements below reflect Anthropic's documentation at the time of writing. **Provider terms change.** Before go-live,
review the current Commercial Terms, Usage Policy, privacy documentation and data processing addendum, and
record the version reviewed here.

* **Transport and auth:** HTTPS to Anthropic's API with `ANTHROPIC_API_KEY`. No other third party is in the
  request path.
* **Server-side fallback** (`fallbacks="default"`): runs **only on a policy decline** (refusal), never on rate
  limits, overload or server errors. The API re-runs the **same request** on another Anthropic model chosen by
  refusal category, inside the same call. The response's `model` field names the model that answered; store
  it in `ai_request_logs.model` / `screenings.ai_model`. After a fallback, follow-up requests may be routed to
  the fallback model for about an hour through an organisation-scoped record keyed by a content hash (not the
  message content). This record isn't kept for zero-data-retention organisations.
* **Prompt caching:** only the system prompt (no patient data) is marked for caching. Caches are isolated per
  workspace and never shared across organisations. The default TTL is 5 minutes, refreshed on each hit.
* **Files API:** not used. Reports are sent inline per request. Files uploaded through the Files API persist
  until deleted, so if it is ever adopted, delete each file right after use.
* **Retention and training:** Anthropic's commercial terms have stated that API inputs and outputs are not
  used to train models by default, and that API data is retained only for a limited period (for example for
  trust and safety). Zero-data-retention arrangements exist by agreement. Some models (for example the Claude
  Fable 5.x family) require 30-day retention and refuse requests from ZDR organisations, so with ZDR keep
  `AI_MODEL` on a ZDR-eligible model. **Verify all of this against the current terms.**
* **Usage policy:** healthcare-related uses can carry extra requirements (for example qualified human
  oversight and telling users that AI is involved). The product already keeps a human in the loop and labels
  AI output. Confirm against the current policy.
* **Cross-border transfer:** requests are processed outside India and the EU. Cover this in the privacy notice
  and consent text, DPDP s.16 (transfers allowed unless to a restricted country), and GDPR Chapter V (DPA/SCCs
  with Anthropic).

### 8.6 Logging and keys

* `ai_request_logs` stores purpose, model, screening id, token counts, latency, status and error text, **not**
  prompt or response content. The triage result is part of the medical record (`screenings.ai_result`) and
  must never appear in application logs.
* Separate API keys (ideally separate workspaces) per environment, with spend limits and usage alerts in the
  Anthropic Console. Rotate on suspicion (OPERATIONS.md).
* With `ANTHROPIC_API_KEY` empty (development and tests), the rules engine is used and no data leaves the
  platform.

---

## 9. File upload security

| Control | Status |
|---|---|
| Size limit `MAX_UPLOAD_MB` (default 15) in the API. `client_max_body_size 20m` at the edge. | [core] |
| Type allowlist **by magic bytes** (pdf, jpg, png, webp, heic, dcm). The stored `content_type` comes from detection, not from the client. DICOM is recognised by `DICM` at byte offset 128, so test it explicitly. | [PLAN] |
| `sha256` stored. Random storage key (`make_key`). The user file name is metadata only. | [core+PLAN] |
| Downloads only via `GET /documents/{id}/download` after a scope check, with `Content-Disposition: attachment` and `nosniff`. No public or presigned URLs. | [PLAN+core] |
| Edge upload throttling (`upload_zone` 30 req/min/IP on `/api/v1/documents`) plus an API upload rate limit | [core+PLAN] |
| Malware scanning (for example a ClamAV sidecar) before a document is visible to hospitals or staff | [rec] |
| Strip EXIF/GPS metadata from images (photos of passports or wounds can carry location) | [rec] |
| Never parse or render uploaded PDFs server-side outside a sandbox (only Claude receives them, with consent) | [rec] |
| Per-user storage quotas. Soft-delete (`deleted_at`) followed by object deletion under the retention policy. | [rec] |

---

## 10. Webhook and payment security

Details are in PAYMENTS.md §5. In short:

* Verify the signature over the **raw body before parsing**, compare in constant time, and apply a 300 s
  timestamp tolerance for Stripe. Accept any of several `v1` signatures (secret roll).
* Store the event, make it durable, then process. Return 2xx only after the row is stored. Deduplicate by
  `(gateway, event_id)`. Only `processed_at` marks an event as done. Failed processing is retried by the
  `payments.process_webhook` job.
* Stored payloads are scrubbed of payer PII (email, contact, card, VPA, bank account, billing, shipping and
  customer details, `client_secret`). A delivery with an invalid signature is recorded only as
  `{sha256, size}` under a random `invalid:<uuid>` id, then rejected with 400 `invalid_signature`
  **[implemented]**.
* Never trust client callbacks: re-fetch the payment from the gateway and compare amount and currency.
* `mock` gateway: the app refuses to start with `ENV=production` and `mock` enabled **[core: config.py]**.
* PCI scope: card data is entered only in gateway-hosted components, which typically keeps merchant PCI DSS
  scope to the reduced self-assessment for outsourced payment pages. Confirm the applicable SAQ with the
  gateway or acquirer; this is not a compliance claim.
* SPA CSP and `Permissions-Policy: payment=(self "https://checkout.razorpay.com" "https://js.stripe.com")`
  permit only the gateways' scripts and frames **[core: nginx]**.

---

## 11. Rate limiting and abuse prevention

**Two layers:**

* **Edge** (`$binary_remote_addr`, real peer): `auth_zone` 30 r/m (burst 20) on `/api/v1/auth/`,
  `api_zone` 20 r/s on `/api/`, `upload_zone` 30 r/m on `POST /api/v1/documents`, `limit_conn` 100 per IP.
  Webhooks are deliberately not IP-throttled. `/auth/me` and `/auth/refresh` use the API budget so offices
  behind one NAT aren't locked out **[core: app-locations.conf]**.
* **API** (`app.core.rate_limit`): fixed windows with Redis `INCR`+`EXPIRE` (`hig:rl:<scope>:<id>:<window>`),
  falling back to in-process memory. Keyed by IP or by user. 429 `rate_limited` with `Retry-After` and
  `details {scope, limit}`. `RATE_LIMIT_ENABLED=false` only in tests **[core]**. **Without Redis every process
  counts separately**, so production needs `REDIS_URL`.

Implemented API limits (scope, limit per 60 s, key), from the module routers:

| Endpoint | Implemented | Recommendation |
|---|---|---|
| `POST /auth/login` | `auth.login` 10/IP; 5 failures → 15-min lock | Also cap per email |
| `POST /auth/register` · `/auth/google` · `/auth/guest` | 5/IP · 10/IP · 10/IP | Guests: also an hourly cap per IP |
| `POST /auth/refresh` | 60/IP | — |
| `POST /auth/forgot-password` · `/auth/reset-password` · `/auth/verify-email` | 3/IP · 10/IP · 10/IP | Forgot-password: also 3/hour per email |
| `POST /auth/resend-verification` · `/auth/change-password` · `/auth/guest/upgrade` | 3/user · 5/user · 5/user | — |
| `POST /auth/mfa/setup` · `/auth/mfa/enable` · `/auth/mfa/disable` | 10/user · 10/user (shared `auth.mfa_verify`) | — |
| `POST /auth/devices` | 30/user | — |
| `POST /documents` | 30/user (plus edge 30/min/IP) | Hourly cap per user |
| `POST /screenings/{id}/submit`, `/rerun` | 5/user (shared `screening.submit`) | Hourly cap per user (AI cost) |
| `POST /payments/orders` | 30/user | — |
| `POST /travel/sos` | 10/user | Keep it generous. Never block a patient in distress. |
| `POST /payments/webhooks/*` | 600/IP (no edge limit) | Signature check first |

**Finding F1 (client IP spoofing).** nginx appends to `X-Forwarded-For`
(`$proxy_add_x_forwarded_for`). The compose file runs the API with `FORWARDED_ALLOW_IPS="*"`, so uvicorn
takes the **left-most** (client-supplied) entry as the client address, and `get_client_ip` also prefers the
first `X-Forwarded-For` entry. A client can therefore choose its own IP for the **API-level** per-IP limits
and for the IPs recorded in audit logs, consents and refresh tokens. The edge limits still use the real
address. Fix one of:

* in nginx, set `proxy_set_header X-Forwarded-For $remote_addr;` (after `real_ip` configuration if a load
  balancer sits in front); or
* set `FORWARDED_ALLOW_IPS` to the edge network instead of `*`, and make `get_client_ip` prefer `X-Real-IP`
  or the right-most untrusted hop.

---

## 12. HTTP security headers, CORS, documentation endpoints

* API responses **[core: middleware.py]**: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera, microphone, geolocation,
  payment and usb disabled), `Cross-Origin-Opener-Policy: same-origin`,
  `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'` (except docs), HSTS in production, and
  `Cache-Control: no-store` on `/api/v1/auth/*`.
* SPAs **[core: nginx snippets]**: CSP per `csp-spa.conf`, HSTS, nosniff, frame DENY,
  `COOP: same-origin-allow-popups` (Google and Razorpay popups).
* CORS: exact `CORS_ORIGINS` with credentials. The localhost regex applies **only outside production**.
  Exposed headers: `X-Request-ID`, `Retry-After`, `Content-Disposition` **[core: main.py]**.
* `TrustedHostMiddleware` is active in production when `TRUSTED_HOSTS` is set to real host names (default `*`
  disables it). Set it **[rec]**.
* Swagger `/api/docs` and `/api/openapi.json` are off when `ENV=production` and `ENABLE_DOCS=false`.

---

## 13. Audit logging

* `audit_log(db, actor=, action=, entity_type=, entity_id=, before=, after=, request=, actor_role=)` adds a row
  in the caller's transaction. `actor=None` means system (jobs, webhooks). IP and user agent come from the
  request. `before`/`after` pass through the same redaction as logs **[core: app/core/audit.py]**.
* **Must be audited [PLAN §9.8]:** login, logout, MFA changes, role and status changes, KYC approvals, quote
  and booking state changes, payments, refunds, settlement approvals and payouts, settings changes, document
  verification. Also audit document downloads and ops-script actions **[rec]**.
* `audit_logs` has no `updated_at` and is append-only by convention. Add DB triggers like the ledger's
  immutability triggers so the runtime role can't alter history, and ship audit logs to an external store
  **[rec]** (finding F8).
* Read access: `GET /admin/audit-logs` (staff). Retention: at least 1 year, longer for finance actions
  (DEPLOYMENT §13).

---

## 14. Logging with PII redaction

* structlog (JSON in production: `LOG_JSON=true`). `request_id` is bound to every line and echoed as
  `X-Request-ID` and in error envelopes, so support can trace a user report to logs **[core]**.
* **Redaction [core: app/core/logging.py]:** values whose key contains `password`, `passwd`, `token`,
  `secret`, `authorization`, `cookie`, `passport`, `account_number`, `api_key`, `apikey`, `otp`, `mfa_code`,
  `card_number`, `cvv`, `signature`, `private_key`, `policy_number`, or equals or ends with `pan`, are replaced
  by `[REDACTED]`, recursively. Allowed: `token_type`, `expires_in`, `*_last4`.
* Redaction is **key-based**. It doesn't scan free text. Never log request or response bodies, medical
  fields, message bodies, AI prompts or outputs, or exception messages that embed them.
* Access logs: the API logs method, path (no query string), status, duration and client IP. nginx logs `$uri`
  (no query string), so `/api/v1/ws?token=…` doesn't land in logs **[core]**.
* **Finding F4:** nginx logs `$http_referer`. Pages that carry one-time tokens in their URL (verify-email,
  reset-password, invite links) leak them through `Referer` into edge logs. Put tokens in the URL fragment or
  remove them with `history.replaceState` before any API call, and/or log the referer without its query
  string **[rec]**.
* Sentry (optional): `send_default_pii=False`, tracing off **[core]**. Logs older than 180 days must remain
  retrievable (CERT-In); ship them to central storage **[DEPLOYMENT §10]**.

---

## 15. Secrets management and rotation

| Secret | Used by | Suggested rotation | Impact of rotation | How |
|---|---|---|---|---|
| `JWT_SECRET` (≥ 32 random chars, enforced in production) | API | On suspicion, or yearly | Access tokens invalid for ≤ 15 min; clients refresh | OPERATIONS.md |
| `FIELD_ENCRYPTION_KEY` | API, worker | On suspicion only (needs downtime) | Offline re-encryption of 6 columns; keep the old key while old backups exist | OPERATIONS.md |
| `DATABASE_URL` password (role `healindia`) | API, worker, Alembic, tests | Yearly, or on staff change | Restart all processes | OPERATIONS.md |
| `LOCAL_PG_SUPERUSER_PASSWORD` | Dev only (`scripts/setup-db.ps1`) | n/a | Not used by the app | Never in production |
| `REDIS_URL` password | API, worker | Yearly | Restart | Compose `REDIS_PASSWORD` |
| `ANTHROPIC_API_KEY` | Worker (screening) | 90 days or on suspicion | None if overlapped | Create new, deploy, revoke old |
| `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | API, worker | On suspicion or staff change | Brief payment or webhook failures if not coordinated (Razorpay retries webhooks) | OPERATIONS.md |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | API, worker | Roll with overlap | None (Stripe supports overlapping secrets) | Dashboard roll |
| `SMTP_PASSWORD`, `S3_SECRET_ACCESS_KEY` | Worker, API | 90 days – 1 year | Restart | Provider console |
| Public values: `RAZORPAY_KEY_ID`, `STRIPE_PUBLISHABLE_KEY`, `GOOGLE_CLIENT_IDS`, `SENTRY_DSN` | Clients | With their pair | — | — |

* Production values come from a secret manager or injected environment. Never bake them into images or
  commit them (DEPLOYMENT §3).
* **Production startup validation [core: config.py]:** `JWT_SECRET` strong, `FIELD_ENCRYPTION_KEY` present,
  `COOKIE_SECURE=true`, no `mock` gateway. Extend it to `ADMIN_MFA_REQUIRED=true`, `ENABLE_DOCS=false`,
  non-wildcard `TRUSTED_HOSTS`, non-empty `REDIS_URL`, `EMAIL_BACKEND=smtp` **[rec]**.
* Use separate keys per environment and gateway mode (test vs live).

---

## 16. Infrastructure, dependency and container security

* **Database roles [rec]:** run migrations as an owner role and the app as a separate runtime role with DML
  only (no `ALTER`, `TRUNCATE` or trigger control). Today the `healindia` role owns the schema, so a
  compromised app could disable the ledger triggers. In the compose stack the app even connects as the
  container's bootstrap superuser (F3). Locally, the dedicated cluster (`C:\NewProjects\pgdata-healindia`,
  127.0.0.1:5433) uses `scram-sha-256` and listens on loopback only, and the app role isn't a superuser
  **[core: scripts/setup-db.ps1]**.
* **Network:** PostgreSQL, Redis and MinIO have no published ports in compose. Redis requires a password
  (`--requirepass`). Redis carries rate-limit counters, cache and the realtime channel `hig:rt` (notification
  payloads), so keep it private **[core: compose]**.
* **Containers:** the API/worker image runs as the non-root user `app` (uid 10001) under `tini` with a
  `HEALTHCHECK` on `/health/live` **[core: backend/Dockerfile]**. Also consider: read-only root filesystem,
  dropped Linux capabilities, `no-new-privileges`, resource limits, and pinned base-image digests **[rec]**.
* **Dependencies:** pinned `backend/requirements.lock.txt`, `web/package-lock.json`, `mobile/pubspec.lock`.
  CI runs `ruff` with the `S` (bandit) rule set, tests, type checks and image builds **[core: ci.yml]**. Add
  `pip-audit`, `npm audit --omit=dev` / OSV-Scanner, secret scanning (gitleaks), image scanning (Trivy) and an
  SBOM **[rec]**. Don't add tools to the shared dev toolchain; run them in CI.
* **Patching:** monthly dependency review. Urgent patches within 7 days for exploitable criticals **[rec]**.

---

## 17. Compliance mapping (gap-analysis aid; no certification claimed)

### 17.1 India: Digital Personal Data Protection Act, 2023 (and DPDP Rules, 2025)

The DPDP Rules were notified in November 2025 with phased commencement (most obligations about 18 months
later). Verify current dates and requirements with counsel.

| Provision | Requirement (summary) | Platform control / status |
|---|---|---|
| s.5 Notice | Itemised notice before collection | Privacy page and consent screens [PLAN]. Content and legal review pending. |
| s.6 Consent | Free, specific, informed, unambiguous. Withdrawal as easy as giving. | `consents` (versioned, append-only), gates for AI and hospital sharing [PLAN]. Withdrawal UI [rec]. |
| s.7 Legitimate uses | For example medical emergencies | SOS flow. Document the legal basis per purpose [rec]. |
| s.8(5) Security safeguards | Reasonable safeguards to prevent breach | This document: encryption, access control, MFA, audit, rate limits |
| s.8(6) Breach intimation | Inform the Board and each affected Data Principal | §18 |
| s.8(7) Erasure | Erase when the purpose is served or consent is withdrawn, unless law requires retention | Retention jobs [rec, gap] |
| s.8(2) Processors | Contracts with processors | DPAs: cloud, gateways, Anthropic, email/push [rec] |
| s.8(9)–(10) Contact, grievance | Published contact, grievance redressal | [rec] (DEPLOYMENT §13) |
| s.9 Children | Verifiable parental consent; no tracking or targeted ads | Guardian model **missing** (F10) |
| ss.11–14 Rights | Access summary, correction, erasure, grievance, nomination | Profile view/edit exists. Export, erasure and nomination workflows **missing** [rec]. |
| s.10 Significant Data Fiduciary | DPO in India, DPIA, audits if notified | Assess: large-scale health data could lead to SDF notification |
| s.16 Cross-border | Allowed except to countries the government restricts | Track notifications. Anthropic and gateway transfers disclosed. |

Also relevant in India: **CERT-In Directions (28 Apr 2022):** report specified incidents within 6 hours,
keep ICT logs for a rolling 180 days within India, synchronise clocks to NTP, name a point of contact. **IT Act
s.43A / SPDI Rules 2011** apply until the corresponding DPDP provisions take effect. **Telemedicine Practice
Guidelines (2020)** apply to teleconsultations by registered practitioners (the platform must not let AI
output stand in for a practitioner's advice). Hospital-side clinical-establishment and medical-records rules
apply to the hospitals.

### 17.2 GDPR (EU/EEA patients; UK GDPR is analogous)

| Article | Control / status |
|---|---|
| Art. 3(2) territorial scope | Offering services to people in the EU puts the platform in scope |
| Art. 6 + Art. 9(2)(a) | Explicit consent for health data (`consents`, versioned) [PLAN] |
| Art. 12–22 rights | Access, rectification, erasure, portability, objection: workflows [rec, gap]. Art. 22: AI output is advisory and humans decide (§8.3). |
| Art. 25 privacy by design | Minimised AI intake, field encryption, scoping, default-off marketing |
| Art. 27 representative | EU representative if there's no EU establishment [rec] |
| Art. 28 processors | DPAs with Anthropic, gateways, hosting, email [rec] |
| Art. 30 records | Record of processing activities [rec] |
| Art. 32 security | This document |
| Art. 33/34 breaches | 72 h to the supervisory authority. Data subjects without undue delay if high risk (§18). |
| Art. 35 DPIA | Likely required (large-scale special-category data, AI triage) [rec] |
| Art. 44–49 transfers | India has no adequacy decision. Use SCCs or other Art. 46 tools, plus transfer impact assessments [rec]. |

### 17.3 HIPAA-aligned practices (no HIPAA compliance or certification claimed)

An Indian medical-travel platform is generally not a HIPAA covered entity or business associate. If US health
plans or providers engage it, contractual terms (including BAAs) may become relevant, so take legal advice.
The platform aligns its safeguards with the HIPAA Security Rule as good practice:

| Safeguard (45 CFR 164.3xx) | Practice here |
|---|---|
| Risk analysis and management (164.308(a)(1)) | This threat model, reviewed each release |
| Workforce security, access management | Role-based staff access, quarterly access reviews [rec], suspension takes effect immediately |
| Security incident procedures | §18, DEPLOYMENT §14 |
| Contingency plan | Backups and restore drills (OPERATIONS.md, DEPLOYMENT §4) |
| Access control (164.312(a)) | Unique accounts, RBAC + scoping, short sessions, field encryption |
| Audit controls (164.312(b)) | `audit_logs`; extend to record views and downloads [rec] |
| Integrity (164.312(c)) | AES-GCM authentication, document sha256, immutable ledger |
| Authentication (164.312(d)) | Argon2id, TOTP MFA for staff |
| Transmission security (164.312(e)) | TLS 1.2+, HSTS |
| Minimum necessary | Resource scoping, minimised AI intake |

### 17.4 Other regimes to assess with counsel

The supported currencies point at markets with their own laws: UK GDPR / DPA 2018; UAE PDPL (and DIFC/ADGM
rules); Saudi PDPL; Qatar, Oman and Kuwait data-protection laws; Nigeria NDPA 2023; Kenya DPA 2019;
Bangladesh; Australia Privacy Act; Canada PIPEDA. For US patients: state health-privacy laws (for example
Washington's My Health My Data Act) and the FTC Health Breach Notification Rule for non-HIPAA health apps.

---

## 18. Incident response and breach notification

Operational steps (detect → triage → contain → eradicate/recover → notify → review) and contacts:
**DEPLOYMENT.md §14**. Security specifics:

**Severity**

| Level | Examples |
|---|---|
| SEV1 | Confirmed access to Restricted data; payment fraud or unauthorised payouts; leaked `FIELD_ENCRYPTION_KEY`, gateway secret or DB credentials; full outage during active treatments |
| SEV2 | Suspected breach; account takeover of a staff user; webhook forgery attempts that passed verification; AI key leak |
| SEV3 | Vulnerability found but not exploited; isolated account takeover of a patient |

**Containment quick actions**

| Situation | Action |
|---|---|
| Compromised user or staff account | `PATCH /admin/users/{id} {"status": "suspended"}` blocks every request immediately (status is checked per request). Then revoke refresh tokens (OPERATIONS.md). |
| Mass session compromise | Revoke all refresh tokens and rotate `JWT_SECRET` (OPERATIONS.md) |
| Leaked gateway secret or webhook secret | Rotate. Compare `webhook_events` and `payments` with the gateway dashboard for forged or unknown events. Hold settlement batches (`/finance/settlements/items/{id}/hold`). |
| Fraudulent finance action | Hold the affected settlement items. Review `audit_logs`. Correct the ledger with reversing transactions only. |
| Leaked `ANTHROPIC_API_KEY` | Revoke in the Console, review usage, deploy a new key |
| Leaked `FIELD_ENCRYPTION_KEY` | Treat encrypted fields as exposed if the DB may also be exposed. Rotate with re-encryption. |
| Data exfiltration suspected | Preserve evidence first: DB snapshot, nginx JSON logs, app logs, `audit_logs`, chain of custody. Then contain. |

**Notification timelines** (verify current law; involve counsel and the DPO immediately)

| Regime | Notify | When |
|---|---|---|
| CERT-In Directions 2022 | CERT-In | Within **6 hours** of noticing a reportable incident |
| DPDP Act s.8(6) and Rules | Data Protection Board of India and **each affected Data Principal** | Without delay. Detailed report to the Board within **72 hours** (per the Rules). |
| GDPR Art. 33 / 34 | Supervisory authority; data subjects if high risk | **72 hours**; without undue delay |
| UK GDPR | ICO | 72 hours |
| US state laws / FTC HBNR | Residents, regulators | Varies; counsel decides |
| Contracts | Razorpay/Stripe (payment fraud, key compromise), Anthropic (key compromise), hospitals (shared data), agents | Per contract, promptly |

Post-incident: a blameless review within 5 working days, with tracked actions, and updates to this threat
model and the tests in §19.

---

## 19. Security testing checklist

**Automated tests** (pytest, per module; part of each module's definition of done):

- [ ] Authorization matrix per endpoint: 401 without a token, 403 for the wrong role, **404 for out-of-scope
      ids** (patient A vs B, hospital X vs Y, agent's vs another agent's patients, `X-Hospital-Id` of a
      non-member).
- [ ] Tokens: expired, wrong `aud`/`iss`/`type`, tampered signature, `alg` mismatch. Refresh rotation; reuse
      of a rotated token revokes the family; logout revokes. Suspended or locked user's token gets 403.
- [ ] Lockout after 5 failures; rate limits return 429 with `Retry-After`; `mfa_required` flow; MFA
      enable/disable requires a valid code.
- [ ] Cookie refresh without `X-Requested-With` is rejected. Mobile refresh via body with
      `X-Client-Type: mobile`.
- [ ] Webhooks: bad signature, stale Stripe timestamp, duplicate event id processed once, raw-body
      verification (re-serialised JSON fails).
- [ ] Idempotency: verify + webhook + mock → one payment, one ledger transaction, one settlement item. Same
      `Idempotency-Key` → same order.
- [ ] Money: rounding, 0- and 3-decimal currencies, refund > refundable rejected, clawback netting, trial
      balance = 0 after full flows. Ledger UPDATE/DELETE rejected (23001). Unbalanced commit rejected (23514).
- [ ] Uploads: oversize, wrong magic bytes, polyglot, traversal-looking file names, download by a non-owner →
      404.
- [ ] Consent gates: Claude client **not called** without `consent_ai` (mock asserts zero calls). Reports
      never attached without consent.
- [ ] Settings: production validation rejects a weak JWT secret, missing encryption key, insecure cookies and
      the `mock` gateway.
- [ ] Headers present (nosniff, frame DENY, CSP, no-store on auth). CORS rejects unknown origins. Docs
      disabled in production configuration.

**Static and supply chain:** ruff (`S` rules) clean · mypy / `tsc --noEmit` / `flutter analyze` · pip-audit,
npm audit, OSV-Scanner · gitleaks · Trivy on images · licence review.

**Dynamic:** OWASP ZAP baseline plus an authenticated scan against staging · TLS configuration test · header
check on all four domains.

**Manual (before go-live and yearly):** independent penetration test of web, API and mobile, focused on
authorization, payments and settlement business logic (self-approval, double refunds, payout account swaps),
uploads, and AI prompt injection.

**Mobile:** release build has no cleartext traffic and no debug flags; tokens in secure storage; MobSF
static scan; no secrets in the bundle.

**AI red team:** injection through notes and uploaded PDFs; attempts to extract diagnoses or prescriptions;
emergency-keyword handling; unknown slugs dropped; malformed output falls back to rules.

**Operational drills:** quarterly backup restore with trial-balance check; staging rotation drill for
`JWT_SECRET` and `FIELD_ENCRYPTION_KEY`; yearly incident tabletop; quarterly access review (staff roles,
hospital members, finance).

---

## 20. Findings and open items (at the time of writing)

| # | Finding | Severity | Owner / fix |
|---|---|---|---|
| F1 | Client-controlled `X-Forwarded-For` is trusted (`FORWARDED_ALLOW_IPS="*"` + `$proxy_add_x_forwarded_for` + first-entry parsing in `get_client_ip`): API per-IP rate limits bypassable, logged IPs spoofable | Medium | infra (`proxy-api.conf`, compose) + backend-core (`deps.get_client_ip`); §11 |
| F2 | Production validation doesn't enforce `ADMIN_MFA_REQUIRED`, `ENABLE_DOCS=false`, `TRUSTED_HOSTS`, `REDIS_URL` | Medium | backend-core (`config.py`) |
| F3 | The runtime DB role owns the schema (can disable ledger triggers or TRUNCATE). In `infra/docker-compose.yml` the app connects as `POSTGRES_USER`, which the postgres image creates as a **superuser**, contradicting DEPLOYMENT §3 ("no superuser"). | Medium | infra / DEPLOYMENT: separate bootstrap superuser, migration owner and DML-only runtime roles |
| F4 | One-time tokens in SPA URLs can leak through `Referer` into nginx logs | Low–Medium | web-public (fragment or `replaceState`) + infra (log format) |
| F5 | Field-encryption key has no key id, so rotation needs downtime | Low | backend-models (`crypto.py` keyring) |
| F6 | Documents not encrypted at the application layer; no malware scanning; no EXIF stripping | Medium | be-auth (documents) + infra |
| F7 | Refresh-token reuse detection can log out multi-tab users | Low (UX) | web-foundation (cross-tab lock) or be-auth (grace window) |
| F8 | `audit_logs` not DB-immutable; downloads and record views not audited | Medium | backend-models + be-auth |
| F9 | Hospital `member_role` permissions undefined (who may change payout accounts) | Medium | PLAN owner + be-catalog/be-finance |
| F10 | No consent flow for agent-created patients; no guardian model for minors | High (legal) | PLAN owner + be-auth/be-messaging |
| F11 | No MFA recovery codes; no admin unlock or MFA-reset endpoints (script runbooks only) | Low | be-auth / be-admin |
| F12 | No data-subject export or erasure, and no retention jobs | High (legal) | PLAN owner |
| F13 | Single-person finance actions: refund approval by its requester, cancellation refunds auto-approved, bank-transfer and payout `mark-paid`, auto-generated batches with one approval | Medium | be-payments / be-finance (PAYMENTS.md §14 #10–11) |
| F14 | Staff MFA enrolment at sign-in needs only the password, so an MFA reset briefly lets a password holder enrol | Low–Medium | Runbook pairs the MFA reset with a password reset. Long term: an enrolment link sent by email. |
