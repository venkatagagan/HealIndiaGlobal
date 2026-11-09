# API Reference (v1)

REST + WebSocket API of Heal India Global. This document covers the conventions every client relies on
(auth, errors, pagination, idempotency, realtime, webhooks) and an index of every endpoint by module and role.

* **Contract:** `docs/PLAN.md` §3 (conventions), §5 (enums), §8 (endpoints and shapes).
* **Live schema:** Swagger UI at **`/api/docs`**, OpenAPI JSON at **`/api/openapi.json`** (for example
  `http://127.0.0.1:8000/api/docs`). Both are disabled when `ENV=production` and `ENABLE_DOCS=false`.
* **Postman:** [`docs/api/HealIndia.postman_collection.json`](api/HealIndia.postman_collection.json) (see
  [`docs/api/README.md`](api/README.md)). Import it, set `baseUrl` (default `http://127.0.0.1:8000/api/v1`)
  and `serverUrl` (default `http://127.0.0.1:8000`), then run **Auth → Demo logins** (or **Auth → Login**). The
  test scripts store `accessToken`/`refreshToken`, refresh the access token automatically, and save created
  ids (`caseId`, `bookingId`, `orderId`, …) so folders can be run top to bottom.
* Payments in depth: [PAYMENTS.md](PAYMENTS.md). Security model: [SECURITY.md](SECURITY.md).

---

## 1. Base URL, versioning, formats

| Environment | Base URL |
|---|---|
| Local API (direct) | `http://127.0.0.1:8000/api/v1` |
| Local web apps (Vite proxy / Next.js rewrite, same origin; needed for the refresh cookie) | `http://localhost:5173/api/v1` (agent 5174, hospital 5175, admin 5176, website 3000) |
| Android emulator | `http://10.0.2.2:8000/api/v1` (Flutter `API_BASE_URL` via `--dart-define`) |
| Production | `https://<domain>/api/v1`. One domain with path routing (PLAN §3.1): website and public door at `/`, SPAs at `/app/`, `/agent/`, `/hospital/`, staff door at `/gahi/`, API at `/api/`, so every client is same-origin with the API. |

* **Versioning:** the major version is in the path (`/api/v1`). Within v1, changes are additive: new endpoints,
  new optional request fields, new response fields. Clients must ignore unknown response fields and handle
  unknown enum values gracefully (show them as-is or as "other"). Breaking changes go to `/api/v2`, and v1
  keeps running during an announced deprecation window. System endpoints (`/health/*`, `/metrics`) are
  unversioned and live outside `/api`.
* **JSON:** UTF-8, **snake_case** keys everywhere (no camelCase conversion in any client). Request models
  reject unknown fields (422).
* **Ids:** UUIDv7 strings. Human numbers: `HIG-C-2026-000123` (case), `HIG-B-…` (booking), `HIG-P-…`
  (payment order), `HIG-S-…` (settlement batch), `HIG/2026-27/000001` (invoice).
* **Time:** timestamps are ISO-8601 UTC (`2026-10-21T09:15:02Z`), dates are `YYYY-MM-DD`.
* **Money:** integer minor units plus an ISO-4217 code, for example
  `{"total_minor": 44000000, "currency": "INR"}` = INR 4,40,000.00. Exponents: 0 (JPY, KRW), 3 (KWD, BHD,
  OMR), otherwise 2. Rates are in basis points (`*_bps`, 1500 = 15 %). FX rates are decimal strings
  (`"88.00000000"`).
* **Enums:** lowercase snake_case, identical in all clients (PLAN §5).

### Common headers

| Header | Direction | Purpose |
|---|---|---|
| `Authorization: Bearer <access_token>` | request | Authentication (all non-public endpoints) |
| `X-Client-Type: mobile` | request | Flutter app. Auth responses return `refresh_token` in the body instead of a cookie. |
| `X-Requested-With: XMLHttpRequest` | request | **Required** on cookie-based `POST /auth/refresh` and `POST /auth/logout` (CSRF defence) |
| `Idempotency-Key: <uuid>` | request | `POST /payments/orders` (§7) |
| `X-Hospital-Id: <hospital uuid>` | request | Hospital users who belong to several hospitals. Selects the hospital for `/hospital-portal/*` and hospital-scoped lists (default: the first membership). |
| `X-Request-ID` | both | Optional on requests (8–128 chars `[A-Za-z0-9._:-]`). Always echoed on responses and included in error bodies. Quote it in support tickets. |
| `Retry-After` | response | Seconds to wait after a 429 |

---

## 2. Authentication

`TokenOut = {access_token, token_type: "bearer", expires_in, refresh_token?, user: UserOut}`.
`expires_in` is in seconds (default 900 = `ACCESS_TOKEN_TTL_MINUTES` 15).

`UserOut = {id, email, full_name, role, status, phone, country_code, preferred_language, avatar_url, is_guest,
email_verified, mfa_enabled, created_at, patient_profile_id?, agent_id?, hospitals?: [{id, name, slug,
member_role}]}`

### 2.1 Register

```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "email": "maria.lopez@example.com",
  "password": "Sunrise-2026-trip",
  "full_name": "Maria Lopez",
  "role": "patient",
  "phone": "+1 415 555 0134",
  "country_code": "US",
  "referral_code": "AGT7K2QX",
  "accept_terms": true
}
```

* `role` is one of `patient | agent | hospital`. Agents add `agency_name`; hospitals add `hospital_name` and
  `city`. `referral_code` (an agent's `agent_code`) is optional for patients. `accept_terms` must be `true`.
* Password policy: 10–128 characters with at least one letter and one digit, not a common password.
  Otherwise 400 `weak_password` with `details.errors`.
* An existing email returns 409 `email_taken`. An unknown `referral_code` returns 400
  `invalid_referral_code`.
* Rate limit: 5/min per IP.

```http
HTTP/1.1 201 Created
Set-Cookie: hig_refresh=<opaque>; HttpOnly; Path=/api/v1/auth; SameSite=Strict; Secure
Content-Type: application/json

{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…",
  "token_type": "bearer",
  "expires_in": 900,
  "user": {
    "id": "01929f3e-7c1a-7b2e-9a51-3d9c0f6b2a10",
    "email": "maria.lopez@example.com",
    "full_name": "Maria Lopez",
    "role": "patient",
    "status": "active",
    "phone": "+1 415 555 0134",
    "country_code": "US",
    "preferred_language": "en",
    "avatar_url": null,
    "is_guest": false,
    "email_verified": false,
    "mfa_enabled": false,
    "created_at": "2026-10-21T09:15:02Z",
    "patient_profile_id": "01929f3e-7c1b-7d10-8e2f-5a4b3c2d1e0f",
    "agent_id": null,
    "hospitals": []
  }
}
```

With `X-Client-Type: mobile` the response has no `Set-Cookie` and the body contains
`"refresh_token": "<opaque>"`. `Secure` is set when `COOKIE_SECURE=true` (always in production). With
`REQUIRE_EMAIL_VERIFICATION=true` new users start as `pending_verification`.

### 2.2 Login (with MFA)

```http
POST /api/v1/auth/login
Content-Type: application/json

{"email": "maria.lopez@example.com", "password": "Sunrise-2026-trip"}
```

`200 OK` → `TokenOut` (+ cookie, or `refresh_token` for mobile). If the account has TOTP enabled (always the
case for staff when `ADMIN_MFA_REQUIRED=true`):

```http
HTTP/1.1 401 Unauthorized
{"error": {"code": "mfa_required", "message": "…", "details": null, "request_id": "8f1c2a…"}}
```

Repeat the request with the 6-digit code:
`{"email": "…", "password": "…", "otp_code": "492817"}`.

* Rate limit 10/min per IP. **5 consecutive failures (wrong password or wrong code) lock the account for
  15 minutes.** Login then returns 403 `account_locked`, and existing access tokens get 403 `account_locked`
  too.
* Wrong email and wrong password return the same 401 `invalid_credentials` (no account enumeration). A wrong
  code returns 401 `invalid_otp`. Other account states: 403 `account_suspended`, `account_deleted`,
  `email_not_verified` (when `REQUIRE_EMAIL_VERIFICATION=true`).
* **Staff enrolment:** with `ADMIN_MFA_REQUIRED=true`, a staff user without MFA gets 401 `mfa_required` with
  `details = {"setup_required": true, "secret": "…", "otpauth_url": "otpauth://…"}`. Show the QR code, then
  repeat the login with `otp_code` to finish enrolment.

### 2.3 Refresh (rotation with reuse detection)

Web (cookie sent automatically; `fetch(..., {credentials: "include"})`):

```http
POST /api/v1/auth/refresh
X-Requested-With: XMLHttpRequest
Cookie: hig_refresh=<opaque>
```

Mobile:

```http
POST /api/v1/auth/refresh
X-Client-Type: mobile
Content-Type: application/json

{"refresh_token": "<opaque>"}
```

`200 OK` → a new `TokenOut` with a **new** refresh token (new cookie, or new `refresh_token` in the body). The
old refresh token is now spent. **Presenting a spent refresh token is treated as theft:** the whole token
family is revoked, the server answers 401 `refresh_token_reused`, and the user must log in again. Other
failures: 401 `refresh_token_expired` / `invalid_refresh_token`, and 403 `csrf_check_failed` when a cookie
refresh lacks `X-Requested-With`. Limit: 60/min per IP. Clients must therefore:

* run refresh **single-flight** (one refresh in progress; other 401s wait for it), as the shared web and
  Flutter clients do;
* always store the newest refresh token immediately (mobile);
* on 401 from `/auth/refresh`, clear local auth state and go to login.

Access-token handling: on 401 with `error.code` `token_expired` (or any 401 on an authenticated call),
refresh once and retry the original request once.

### 2.4 Logout

`POST /api/v1/auth/logout` (authenticated; web also sends `X-Requested-With: XMLHttpRequest` and the cookie)
→ `204 No Content`. The server revokes the refresh token and the web cookie is cleared. Mobile clients also
delete their stored tokens.

### 2.5 Guest and upgrade

```http
POST /api/v1/auth/guest
Content-Type: application/json

{}
```

→ `TokenOut` for a new `patient` with `"is_guest": true` and `"email": null`. Guests can browse, run a
screening and see matches. To keep the data, upgrade in place (same user id, all data kept):

```http
POST /api/v1/auth/guest/upgrade
Authorization: Bearer <guest access token>
Content-Type: application/json

{"email": "maria.lopez@example.com", "password": "Sunrise-2026-trip", "full_name": "Maria Lopez"}
```

→ `TokenOut` with `"is_guest": false`. A non-guest caller gets 400 `not_guest`. Limits: guest creation
10/min per IP, upgrade 5/min per user.

### 2.6 Google Sign-In

```http
POST /api/v1/auth/google
Content-Type: application/json

{"id_token": "<Google ID token from Google Identity Services / google_sign_in>", "role": "patient"}
```

(Add `"otp_code"` when the account has MFA; the `mfa_required` flow is the same as for password login.)
An existing email account is linked only when Google reports the email as verified.

→ `TokenOut`. The token's audience must be one of `GOOGLE_CLIENT_IDS`. `role` is used only when the account
is created (`patient | agent | hospital`); staff roles can never be self-assigned. The web button appears only
when `VITE_GOOGLE_CLIENT_ID` is configured. Errors: 401 `invalid_google_token`; 400 `google_not_configured`
and `google_email_unverified`; 409 `google_account_mismatch` (the email belongs to an account linked to a
different Google identity). Limit: 10/min per IP.

### 2.7 MFA management (TOTP)

| Request | Response |
|---|---|
| `POST /auth/mfa/setup` | `{"secret": "JBSWY3DPEHPK3PXP", "otpauth_url": "otpauth://totp/Heal%20India%20Global:…"}`. Show as a QR code. Not active yet. |
| `POST /auth/mfa/enable {"code": "492817"}` | MFA active (`mfa_enabled: true`) |
| `POST /auth/mfa/disable {"code": "492817"}` | MFA off (staff get 403 `mfa_required_for_staff` while `ADMIN_MFA_REQUIRED=true`) |

Errors: 400 `mfa_not_setup` (enable before setup), `mfa_already_enabled`, `mfa_not_enabled`; a wrong code
gets 400 `invalid_otp`. Limits: setup 10/min per user, enable and disable 10/min per user.

### 2.8 Other auth endpoints

`GET /auth/me` → `UserOut` · `PATCH /auth/me {full_name?, phone?, country_code?, preferred_language?,
avatar_url?}` · `POST /auth/change-password {current_password, new_password}` · `POST /auth/verify-email
{token}` · `POST /auth/resend-verification` · `POST /auth/forgot-password {email}` → **always 202** (3/min per
IP) · `POST /auth/reset-password {token, new_password}` · `POST /auth/devices {platform: android|ios|web,
token}` (push) · `POST /auth/consents {kind, version, granted}` and `GET /auth/consents` (kinds: `terms`,
`privacy`, `ai_processing`, `share_with_hospitals`, `marketing`).

### 2.9 Public door and staff door

There are two sign-in doors (PLAN §3.1):

* **Public door** (`/login` on the website, and the mobile app): `POST /auth/login`, `/auth/google`,
  `/auth/guest`, `/auth/register`, `/auth/refresh`, `/auth/logout`. Only `patient`, `agent` and `hospital`
  accounts. A staff account gets the same generic 401 `invalid_credentials` as a wrong password.
* **Staff door** (`/gahi/`, web only): `POST /auth/staff/login` `{email, password, otp_code?,
  enrolment_token?}`, `POST /auth/staff/refresh` (cookie `hig_staff_refresh`, `Path=/api/v1/auth/staff`, plus
  `X-Requested-With`), `POST /auth/staff/logout`. Only `admin`, `finance`, `support` and `super_admin`.
  Requests with `X-Client-Type: mobile` get the generic 401. Limit 5/min per IP. `STAFF_ALLOWED_IPS` (CIDRs),
  when set, is enforced here and on every staff API call.
* A refresh token only works at the door that issued it.
* super_admin only: `POST /auth/staff/mfa/enrolment-token` and `POST /auth/staff/mfa/reset` `{user_id}` return a
  one-time `enrolment_token` for a staff user without an authenticator (reset also removes the old one and signs
  the user out everywhere).

The auth module is still being extended; Swagger is authoritative for request and response details.

### 2.10 Web vs mobile token handling (summary)

| | Web (SPAs) | Mobile (Flutter) |
|---|---|---|
| Identify as | (default) | `X-Client-Type: mobile` on every request |
| Access token | Memory only | Memory, re-obtained via refresh |
| Refresh token | httpOnly cookie `hig_refresh` (`Path=/api/v1/auth`, `SameSite=Strict`, `Secure` in prod) | `refresh_token` in JSON body, kept in `flutter_secure_storage` |
| Refresh / logout call | Cookie + `X-Requested-With: XMLHttpRequest`, `credentials: "include"` | `{"refresh_token": …}` in the body |
| Origin | Must be same-origin with `/api` (Vite proxy locally, nginx in production) | n/a |

---

## 3. Errors

Every error uses one envelope:

```json
{"error": {"code": "not_found", "message": "Case not found", "details": null, "request_id": "4bd6c1e0a9f34c07"}}
```

| HTTP | `code` | Meaning / client action |
|---|---|---|
| 400 | `bad_request` | Invalid request for the current state. Modules use more specific codes with the same status (e.g. `weak_password`). |
| 401 | `unauthorized` | Missing or invalid credentials (`WWW-Authenticate: Bearer`). Go to login. |
| 401 | `token_expired` | Access token expired: refresh and retry once |
| 401 | `invalid_token` | Malformed or tampered token, or wrong issuer/audience/type: refresh, else log in |
| 401 | `mfa_required` | Login needs `otp_code` |
| 402 | `payment_error` | Gateway declined, or verification failed |
| 403 | `forbidden` | Authenticated, but the role isn't allowed |
| 403 | `guest_upgrade_required` | A guest tried to create a case, accept a quote or create a booking. Upgrade with `POST /auth/guest/upgrade`, then retry. |
| 403 | `account_suspended` / `account_deleted` / `account_locked` | Account state blocks access |
| 404 | `not_found` | Doesn't exist **or isn't in your scope** (the API never confirms other tenants' ids) |
| 405 | `method_not_allowed` | — |
| 409 | `conflict` | State conflict or unique violation (`details.constraint` may name it) |
| 409 | `emergency_ack_required` | The case was screened as a possible emergency. Show the emergency guidance, call `details.ack_path` (`POST /cases/{id}/emergency-ack`), then retry. |
| 413 / 415 | `payload_too_large` / `unsupported_media_type` | Upload too large or file type not allowed |
| 422 | `validation_error` | Body or query validation. `details` = `[{loc, msg, type}]`. |
| 429 | `rate_limited` | Wait `Retry-After` seconds. `details = {scope, limit}`. |
| 500 | `internal_error` | Unexpected. Report the `request_id`. |
| 503 | `service_unavailable` | Readiness probe failing |
| 503 | `fx_rate_unavailable` | Production only: no current FX rate for the order currency (`details.currencies`). Retry later. |

```json
{"error": {"code": "validation_error", "message": "Request validation failed",
  "details": [{"loc": ["body", "email"], "msg": "value is not a valid email address", "type": "value_error"}],
  "request_id": "5c0e9e8d3b2a4f61"}}
```

Clients branch on `error.code` first and fall back to the HTTP status. `message` is human-readable English
and may change; don't parse it.

Module-specific codes you'll meet (non-exhaustive; Swagger and the module code are authoritative):

| Area | Codes |
|---|---|
| Auth | 401 `invalid_credentials`, `mfa_required`, `invalid_otp`, `refresh_token_reused`, `refresh_token_expired`, `invalid_refresh_token`, `invalid_google_token` · 403 `csrf_check_failed`, `email_not_verified`, `mfa_required_for_staff` · 409 `email_taken`, `google_account_mismatch` · 400 `weak_password`, `invalid_referral_code`, `not_guest`, `mfa_not_setup`, `mfa_already_enabled`, `mfa_not_enabled`, `invalid_current_password`, `password_unchanged` |
| Screening | 400 `consent_required`, `screening_incomplete` · 409 `screening_not_rerunnable` |
| Cases | 403 `guest_upgrade_required` · 409 `emergency_ack_required` · 400 `not_emergency`, `invalid_state`, `quote_not_open` |
| Payments | 400 `gateway_unavailable`, `unsupported_currency`, `nothing_due`, `amount_too_small`, `invalid_signature`, `order_mismatch`, `amount_mismatch`, `order_not_open`, `not_bank_transfer`, `invalid_refund_state`, `no_pending_request` · 402 `currency_mismatch`, `payment_error` · 403 `second_approver_required` · 409 `idempotency_key_reused`, `already_paid` · 503 `fx_rate_unavailable` |
| Settlements | 403 `maker_checker`, `second_approver_required` · 409 `invalid_state` · 400 `no_eligible_items`, `unsupported_method` · 403 `finance_only_field` |

---

## 4. Pagination, filtering, sorting

* Query `page` (1-based) and `page_size` (default 20, **max 100**; larger values return 422).
* Response:
  `{"items": [...], "total": 57, "page": 2, "page_size": 20, "pages": 3}`.
* Filters are plain query parameters listed per endpoint (for example
  `GET /cases?status=quoted&hospital_id=…&q=knee&page=2`). Catalog lists support `sort=rating|price|name`.
* Exception: chat history uses a cursor:
  `GET /conversations/{id}/messages?before=<cursor>&limit=<n>`.

---

## 5. Rate limits

| Endpoint | Limit (per minute) |
|---|---|
| `POST /auth/login` | 10 per IP; 5 failed logins or codes lock the account for 15 min |
| `POST /auth/register` | 5 per IP |
| `POST /auth/google` · `/auth/guest` | 10 per IP each |
| `POST /auth/refresh` | 60 per IP |
| `POST /auth/staff/login` · `/auth/staff/refresh` | 5 · 30 per IP |
| `POST /auth/forgot-password` · `/auth/reset-password` · `/auth/verify-email` | 3 · 10 · 10 per IP |
| `POST /auth/resend-verification` · `/auth/change-password` · `/auth/guest/upgrade` | 3 · 5 · 5 per user |
| `POST /auth/mfa/setup` · `/auth/mfa/enable`+`/disable` | 10 · 10 per user |
| `POST /auth/devices` | 30 per user |
| `POST /documents` | 30 per user |
| `POST /screenings/{id}/submit` + `/rerun` (shared) | 5 per user |
| `POST /payments/orders` | 30 per user |
| `POST /travel/sos` | 10 per user |
| Edge (nginx, real client IP) | `/api/v1/auth/*` 30/min (burst 20; `/auth/me` and `/auth/refresh` use the general budget); `/api/v1/auth/staff/*` stricter (burst 5); other `/api/*` 20/s; document uploads 30/min; webhooks not edge-limited |

Exceeding a limit returns 429 `rate_limited` with `Retry-After`. Back off; don't retry in a tight loop.

---

## 6. Hospital context

Hospital users may belong to several hospitals (`UserOut.hospitals[]`). Send `X-Hospital-Id: <id>` to choose
which one `/hospital-portal/*` and hospital-scoped lists act on. Without it, the first membership is used. An
id the user isn't a member of is rejected.

---

## 7. Idempotency

* **`POST /payments/orders` takes `Idempotency-Key`.** Generate a random UUID per checkout attempt and reuse
  it for retries of the same attempt (timeouts, double clicks, app resumed). The key is unique per payer
  (`UNIQUE(payer_user_id, idempotency_key)`, max 255 chars): a retry returns the **same** order (201 with the
  same `CheckoutOut`) instead of creating a second one. Reusing a key for a different request (another
  purpose, gateway, booking, installment, consultation or currency) returns 409 `idempotency_key_reused`. Use a
  new key for a genuinely new attempt, for example after the previous order expired (card orders expire after
  30 minutes, bank-transfer orders after 7 days) or failed. The header is optional, but clients should always
  send it.
* Payment confirmation is idempotent on the server whatever the client does. `POST /payments/orders/{id}/verify`
  can be retried safely, and verify racing the gateway webhook yields one payment and one ledger posting
  (PAYMENTS.md §5.3).
* Other POSTs aren't idempotent. Disable submit buttons while a request is in flight, and on network errors
  re-read state (`GET`) before retrying.

---

## 8. Realtime (WebSocket)

```
wss://<domain>/api/v1/ws?token=<access_token>           (local: ws://127.0.0.1:8000/api/v1/ws?token=…)
```

* Authenticate with the current **access token** in the query string. Browsers can't set headers on
  WebSocket connections. nginx logs exclude query strings.
* The server sends JSON frames `{"type": "<event>", "data": {...}}`. Clients don't need to send anything.

| `type` | When | Client reaction |
|---|---|---|
| `message.created` | New chat message in a conversation you're in | Append (`MessageOut`) or refetch the conversation |
| `notification.created` | New notification | Prepend (`NotificationOut`), bump the unread count |
| `screening.completed` | AI/rules screening finished | Refetch `GET /screenings/{id}` and `/matches` |
| `booking.updated` | Booking status or payment changed | Refetch the booking |
| `case.updated` | Case status, quote or coordinator changed | Refetch the case |

* Treat events as **invalidation hints**: refetch the resource over REST rather than relying only on the
  frame payload.
* When the socket closes (network, deploy, expired token), reconnect with exponential backoff (1 s → 30 s)
  and a **fresh** access token (refresh first if needed). Also refetch on reconnect, since events sent while
  offline aren't replayed.
* Delivery is best-effort. With `REDIS_URL` set, events published by any API or worker process reach sockets
  on every API instance. In a local setup without Redis, events raised inside a **separate** worker process
  don't reach sockets, so keep polling as a fallback (for example screening status every 2–3 s while
  `processing`).

---

## 9. Payment webhooks (for gateways, not for clients)

| Endpoint | Verification |
|---|---|
| `POST /api/v1/payments/webhooks/razorpay` | `X-Razorpay-Signature`: HMAC-SHA256 of the raw body with `RAZORPAY_WEBHOOK_SECRET`. Deduplicated by `x-razorpay-event-id`. |
| `POST /api/v1/payments/webhooks/stripe` | `Stripe-Signature` (`t=…,v1=…`), HMAC-SHA256 of `"<t>.<raw body>"`, 5-minute tolerance. Deduplicated by event `id`. |

The API verifies the signature before parsing, stores the event (`webhook_events`, unique per gateway and
event id), and processes it idempotently. Responses:

| Case | Response |
|---|---|
| Processed | `200 {"status": "processed", "event_id": "…"}` |
| Duplicate delivery | `200 {"status": "duplicate", "event_id": "…"}` |
| Stored, but processing failed (retried by the `payments.process_webhook` job) | `200 {"status": "error", "event_id": "…"}` |
| Bad signature | `400 invalid_signature` (a hash of the body is kept for forensics) |
| Gateway not enabled / secret missing / body > 1 MB | 404 / 400 `webhook_not_configured` / 400 |

No `Authorization` header is used. Limit: 600/min per IP. To test locally, use the `mock` gateway
(`POST /payments/mock/{order_id}/complete`), which runs the same processing path. Event list and processing
contract: PAYMENTS.md §5.

---

## 10. Endpoint index (by module and role)

**Who:** **Public** = no token · **Any** = any authenticated user · **P** patient · **A** agent · **H**
hospital member · **S** staff (`admin|support|finance|super_admin`) · **F** `finance|super_admin` · **AD**
`admin|super_admin`. `super_admin` passes every role check. "Scoped" means results are limited to what the
caller may see (patients: own; agents: managed or referred patients; hospital members: their hospitals;
staff: all). Out-of-scope ids return 404. "CRUD `/x`" = `GET /x`, `POST /x`, `GET|PATCH|PUT|DELETE /x/{id}` as
listed in Swagger. All paths below are relative to `/api/v1`.

### 10.1 Role quick reference

| Role | Main prefixes |
|---|---|
| Public | `/auth/*` (register, login, google, guest, refresh, forgot/reset, verify-email; staff: `/auth/staff/*`), catalog (`/specialties`, `/procedures`, `/hospitals`, `/doctors`, `/cost-comparison`, `/search`, `/content/*`, `/accommodations`, `/service-providers`) |
| P | `/patient/*`, `/screenings`, `/voice/*`, `/cases`, `/bookings`, `/consultations`, `/travel/*`, `/payments/*` (own), `/documents`, `/conversations`, `/notifications` |
| A | `/agent-portal/*`, `/screenings` (with `patient_id`), `/voice/*`, `/cases`, `/bookings`, `/payments/*` (on behalf), `/documents`, messaging, `/finance/summary` / items / payouts / statements / payout accounts (own) |
| H | `/hospital-portal/*`, `/cases` (quotes), `/bookings` (admit/complete/itinerary), `/consultations`, `/travel/visa-requests`, `/documents`, messaging, `/finance/*` (own: summary, items, payouts, statements, payout accounts) |
| S | `/admin/*` (some AD-only), all cases/bookings/travel/messaging, `/travel/sos` management, `/cases/{id}/assign-coordinator` |
| F | `/payments/*` (all, refunds, mark-paid), `/finance/*` (ledger, settlements, batches, payouts, commission rules) |

### 10.2 Auth (`/auth`)

| Method & path | Who | Body → Response |
|---|---|---|
| POST `/auth/register` | Public | `{email, password, full_name, role, phone?, country_code?, referral_code?, agency_name?, hospital_name?, city?, accept_terms}` → `TokenOut` (201) |
| POST `/auth/login` | Public | `{email, password, otp_code?}` → `TokenOut` · 401 `mfa_required` |
| POST `/auth/google` | Public | `{id_token, role?}` → `TokenOut` |
| POST `/auth/guest` | Public | `{}` → `TokenOut` (guest patient) |
| POST `/auth/guest/upgrade` | P (guest) | `{email, password, full_name}` → `TokenOut` |
| POST `/auth/refresh` | Public (cookie or body) | → `TokenOut` (rotation; reuse revokes the family) |
| POST `/auth/logout` | Any | → 204 |
| GET / PATCH `/auth/me` | Any | → `UserOut` / `{full_name?, phone?, country_code?, preferred_language?, avatar_url?}` |
| DELETE `/auth/me` | Any | Delete own account → `{deleted_at, retained[]}` (records the law requires are kept); clears the cookie |
| POST `/auth/accept-invite` | Public | Accept an emailed invitation → `TokenOut` |
| POST `/auth/change-password` | Any | `{current_password, new_password}` |
| POST `/auth/verify-email` · `/auth/resend-verification` | Public / Any | `{token}` |
| POST `/auth/forgot-password` · `/auth/reset-password` | Public | `{email}` (always 202) · `{token, new_password}` |
| POST `/auth/mfa/setup` · `/auth/mfa/enable` · `/auth/mfa/disable` | Any | → `{secret, otpauth_url}` · `{code}` · `{code}` |
| POST / DELETE `/auth/devices` | Any | `{platform, token}` (register / remove a push token) |
| POST / GET `/auth/consents` · GET `/auth/consents/versions` | Any | `{kind, version, granted}` · current version per kind |
| POST `/auth/staff/login` · `/auth/staff/refresh` · `/auth/staff/logout` | Public (staff door, web only) | §2.9 |
| POST `/auth/staff/mfa/enrolment-token` · `/auth/staff/mfa/reset` | super_admin | `{user_id}` → `{user_id, enrolment_token, expires_at}` |

### 10.3 Patient (`/patient`)

| Method & path | Who | Notes |
|---|---|---|
| GET / PUT `/patient/profile` | P | `PatientProfileOut`. Passport returned masked (`passport_last4`); the full value is accepted only on PUT. |
| CRUD `/patient/companions` | P | Travelling companions (passport encrypted, masked) |
| GET `/patient/dashboard` | P | `{next_booking, days_until_treatment, checklist[], today_schedule[], active_cases, unread_notifications, coordinator, recent_screenings[]}` |
| GET / POST / DELETE `/patient/saved` · DELETE `/patient/saved/{id}` | P | `{entity_type: hospital\|doctor\|procedure, entity_id}` → saved list with embedded cards |

### 10.4 Documents (`/documents`)

| Method & path | Who | Notes |
|---|---|---|
| POST `/documents` | Any | multipart `file`, `kind`, `case_id?`, `patient_id?`, `hospital_id?` → `DocumentOut`. ≤ `MAX_UPLOAD_MB`; pdf/jpg/png/webp/heic/dcm by magic bytes. |
| GET `/documents?case_id=&kind=&patient_id=` | Scoped | List |
| GET `/documents/{id}` | Scoped | `DocumentOut` |
| GET `/documents/{id}/download` | Scoped | Authorised stream, `Content-Disposition: attachment` |
| DELETE `/documents/{id}` | Owner | Soft delete |
| POST `/documents/{id}/verify` | S; H for case documents | `{status: verified\|rejected, note?}` |

| POST / GET `/documents/analyses` · GET / PATCH `/documents/analyses/{id}` | Scoped | AI reading of uploaded reports (PLAN §7.1): `{document_ids[], case_id?, language?}` → analysis; PATCH edits the draft while `pending_review` |
| POST `/documents/analyses/{id}/confirm` · `/reject` · `/retry` · GET `/documents/{id}/analysis` | Scoped | Confirm the reviewed extraction, reject it, retry a failed run; latest analysis of a document |

Access: owner, the patient's agent, the hospital of a linked case, staff. Document analysis and voice intake
(§10.7a) are still being built; Swagger is authoritative for their shapes.
`DocumentOut = {id, kind, file_name, content_type, size_bytes, status, case_id, patient_id, created_at, uploaded_by_name}`.

### 10.5 Catalog: public GET endpoints

| Path | Response |
|---|---|
| `/specialties` · `/specialties/{slug}` | `SpecialtyOut` |
| `/procedures?specialty=&q=` · `/procedures/{slug}` | `ProcedureOut` (with cost benchmarks) |
| `/hospitals?q=&city=&specialty=&procedure=&accreditation=&language=&sort=rating\|price\|name&page=` | `Page[HospitalCard]` (active hospitals only) |
| `/hospitals/{slug_or_id}` | `HospitalDetail` |
| `/doctors?q=&specialty=&hospital_id=&language=&gender=&procedure=&page=` · `/doctors/{id}` | `Page[DoctorCard]` · `DoctorDetail` |
| `/doctors/{id}/availability?from=&to=` · `/hospitals/{id}/availability?from=&to=&doctor_id=` | `[{date, slot_kind, capacity, booked, available}]` |
| `/cost-comparison?procedure=<slug>&country=US&currency=USD` | Home vs India costs, savings, itemised (India converted to `currency`) |
| `/search?q=` | `{specialties[], procedures[], hospitals[], doctors[]}` (≤ 5 each) |
| `/content/cultural-tips` · `/content/helplines` · `/content/fx-rates` · `/content/symptoms?specialty=&body_area=` | Public content |
| `/accommodations?city=&hospital_id=` · `/service-providers?kind=&city=&language=` | Provider lists |

### 10.6 Hospital portal (`/hospital-portal`, role H, `X-Hospital-Id`)

| Method & path | Notes |
|---|---|
| GET / PUT `/hospital-portal/profile` · POST `/hospital-portal/submit-for-review` | Onboarding and KYC review |
| GET `/hospital-portal/dashboard` | KPIs, monthly series, recent cases |
| CRUD `/hospital-portal/members` | Invite `{email, full_name, member_role}` |
| CRUD `/hospital-portal/doctors` · GET / PUT `/hospital-portal/doctors/{id}/availability` · GET / PUT `/hospital-portal/availability` | Availability `[{date, slot_kind, capacity}]` (doctor or hospital level) |
| CRUD `/hospital-portal/procedures` · CRUD `/hospital-portal/procedures/{id}/packages` | Pricing and packages |
| PUT `/hospital-portal/specialties` | `{specialty_ids[]}` |
| GET `/hospital-portal/reviews` | Reviews |

Cases, quotes and bookings for hospitals use §10.8 (scoped to the hospital).

### 10.7 Screening (`/screenings`; P, or A with `patient_id`)

| Method & path | Notes |
|---|---|
| POST `/screenings` | `{specialty_slug?, patient_id?}` → `ScreeningOut` (201, `draft`) |
| PATCH `/screenings/{id}` | Any subset of answer fields, only while `draft` |
| POST `/screenings/{id}/submit` | `{consent_ai: bool}` → `ScreeningOut` (`processing`). With `preferences.use_ai` true (the default), `consent_ai` must be true, otherwise 400 `consent_required`. With `use_ai` false, the rules engine runs. |
| GET `/screenings/{id}` · GET `/screenings` | Poll until `completed`/`failed` (or wait for the `screening.completed` WS event) |
| GET `/screenings/{id}/matches` | `[MatchOut]` (top 10) |
| POST `/screenings/{id}/rerun` | Re-run triage and matching |

### 10.7a Voice intake (`/voice`; authenticated, scoped like screenings)

| Method & path | Notes |
|---|---|
| POST `/voice/transcriptions` · GET `/voice/transcriptions/{id}` | Multipart `audio` upload (English speech only) → transcript plus suggested intake answers (PLAN §7.2) |
| POST `/voice/transcriptions/{id}/confirm` · `/discard` | Keep the reviewed transcript and intake, or discard them |
| POST `/voice/intake-extract` | Text → suggested intake answers; writes nothing (save with `PATCH /screenings/{id}`) |

### 10.8 Cases, quotes, bookings, consultations

| Method & path | Who | Notes |
|---|---|---|
| POST `/cases` | P, A (not guests) | `{hospital_id, doctor_id?, procedure_id?, specialty_id?, screening_id?, patient_notes?, patient_id? (A), consent_share?}` → `CaseOut` (`enquiry`) |
| GET `/cases?status=&hospital_id=&patient_id=&agent_id=&q=&page=` | All (scoped) | `Page[CaseOut]` |
| GET `/cases/{id}` | Scoped | `CaseDetail` |
| POST `/cases/{id}/status` | Per state machine | `{to_status, note?, initiated_by?}` (`initiated_by` only when cancelling a case with an active booking; same rules as booking cancel) |
| POST `/cases/{id}/emergency-ack` | P, A | `{acknowledged: true}` → `CaseOut`. Records that the patient read the emergency guidance; idempotent and audited. 400 `not_emergency` if the screening urgency isn't `emergency`; 400 `invalid_state` if the case is closed. |
| POST `/cases/{id}/assign-coordinator` | S | `{user_id}` |
| POST `/cases/{id}/quotes` | H | `{treatment_plan, line_items[], currency, estimated_stay_days, valid_until}` → `QuoteOut` (case → `quoted`) |
| POST `/cases/{id}/quotes/{quote_id}/accept` · `/reject` | P, A (accept: not guests) | Case → `accepted`. Accept returns 409 `emergency_ack_required` until an emergency case is acknowledged. |
| POST `/bookings` | P, A (not guests) | `{case_id, quote_id? or package_id?, admission_date, payment_option, installment_months?, insurance_claim_requested?}` → `BookingOut` (`pending_payment`). 409 `emergency_ack_required` as above. |
| GET `/bookings?status=&case_id=&hospital_id=&patient_id=&page=` · GET `/bookings/{id}` | Scoped | `BookingOut` (includes `balance_due_minor` and `refund_policy`) |
| POST `/bookings/{id}/cancel` | P, A, H, S | `{reason, initiated_by?}` → `BookingOut` + `{refundable_minor, refund_pct}`. See below. |
| POST `/bookings/{id}/admit` · `/bookings/{id}/complete` | H, S | `{note?, discharge_date?}` |
| GET `/bookings/{id}/checklist` · PATCH `/bookings/{id}/checklist/{item_id}` | Scoped | `{status}` |
| GET / POST `/bookings/{id}/itinerary` · PATCH / DELETE `/bookings/{id}/itinerary/{item_id}` | Read scoped; write H, S | `ItineraryItemOut` |
| POST `/consultations` · GET `/consultations` · GET / PATCH `/consultations/{id}` | P, A create; H, S schedule | Teleconsult requests |

* **Emergency gating.** `CaseOut` includes `urgency` (from the linked screening), `emergency_ack_required` and
  `emergency_acknowledged_at`. While `emergency_ack_required` is true, quote acceptance and booking creation
  return 409 `emergency_ack_required`. Show the guidance (seek local emergency care first), then call
  `POST /cases/{id}/emergency-ack`.
* **Guests** get 403 `guest_upgrade_required` on case creation, quote acceptance and booking creation.
* **Cancellation and refunds.** `initiated_by` is `patient | hospital | platform` and defaults to the caller's
  side (patient/agent → `patient`, hospital member → `hospital`, staff → `platform`). Only staff may set it
  explicitly (for example `patient` when support cancels at the patient's request); anyone else gets 403.
  Patient cancellations refund by the tiers in the booking's `refund_policy` (`[{days_before, refund_pct}]`,
  snapshotted when the booking was confirmed; older bookings fall back to the current setting). Hospital- and
  platform-initiated cancellations, and cancellations of never-confirmed bookings, refund 100% of the net
  amount paid. The `booking.cancelled` event carries `initiated_by`.

### 10.9 Travel (`/travel`)

| Method & path | Who | Notes |
|---|---|---|
| GET / POST `/travel/visa-requests` · PATCH `/travel/visa-requests/{id}` | Scoped; PATCH H, S | Status, invitation letter |
| GET / POST / PATCH `/travel/travel-bookings` | Scoped; P creates (`requested`), staff/hospital move to `quoted\|confirmed\|completed` | Flights, pickup/drop, local transport |
| GET / POST / PATCH `/travel/accommodation-bookings` | Same | Stays |
| GET / POST / PATCH `/travel/service-bookings` | Same | Translator, local guide, transport |
| POST `/travel/sos` | P | `{lat?, lng?, message?, case_id?}`. Notifies the coordinator and support. |
| GET `/travel/sos` · PATCH `/travel/sos/{id}` | S | Acknowledge, resolve |

### 10.10 Messaging and notifications

| Method & path | Who | Notes |
|---|---|---|
| GET `/conversations` · POST `/conversations` · GET `/conversations/{id}` | Any (participants) | `{case_id?, subject?, participant_user_ids?}` → `ConversationOut` |
| GET `/conversations/{id}/messages?before=&limit=` · POST `/conversations/{id}/messages` | Participants | `{body, attachment_document_ids?}` → `MessageOut` |
| POST `/conversations/{id}/read` | Participants | Mark read |
| GET `/notifications?unread=` · GET `/notifications/unread-count` | Any | `NotificationOut` |
| POST `/notifications/{id}/read` · POST `/notifications/read-all` | Any | — |
| WS `/ws?token=<access>` | Any | §8 |

### 10.11 Agent portal (`/agent-portal`, role A)

| Method & path | Notes |
|---|---|
| GET / PUT `/agent-portal/profile` · POST `/agent-portal/submit-kyc` | Profile and KYC |
| GET `/agent-portal/dashboard` | KPIs, conversion, monthly series |
| GET `/agent-portal/patients?q=&page=` · GET / PATCH `/agent-portal/patients/{id}` | `AgentPatientOut` (managed or referred patients) |
| POST `/agent-portal/patients` | Create a patient on behalf: `{first_name, last_name, email?, phone?, nationality, date_of_birth?, gender?, medical_history?, consent_attested: true, consent_kinds?, consent_method?, consent_note?}` → `AgentPatientOut` (201; invite emailed if `email`) |
| POST `/agent-portal/patients/{id}/consent` | Record or re-confirm the consent attestation: `{consent_attested: true, consent_kinds?, consent_method?, consent_note?}` → `AgentPatientOut` |
| GET `/agent-portal/referral` | `{agent_code, referral_url}` |
| GET `/agent-portal/commissions?status=&page=` | `Page[SettlementItemOut]` (agent items) |

**Consent attestation.** `consent_attested` must be `true` (422 otherwise). `consent_kinds` defaults to
`[terms, privacy, share_with_hospitals]` and must include `terms` and `privacy`; it may also include
`ai_processing` and `marketing`. `consent_method` is `in_person` (default), `phone`, `video_call`, `written` or
`email`; `consent_note` is at most 500 characters. The attestation is stored as an audit-log row (not in
`consents`), and the patient is asked to confirm each kind on first login (`POST /auth/consents`).
`AgentPatientOut.consent = {status: not_recorded | pending_patient_confirmation | confirmed | withdrawn, kinds[],
method, version, attested_at, attested_by_user_id, patient_confirmed_at, pending_kinds[]}`.

### 10.12 Payments (`/payments`)

| Method & path | Who | Notes |
|---|---|---|
| POST `/payments/orders` | P, A | Header `Idempotency-Key`. `{booking_id?, installment_id?, consultation_id?, purpose, gateway, currency?}` → `CheckoutOut`. The amount is derived on the server and converted with an FX snapshot. |
| GET `/payments/orders?status=&booking_id=&gateway=&purpose=&q=&review=&page=` · GET `/payments/orders/{id}` | Scoped (S all) | `PaymentOrderOut` (list) / `PaymentOrderDetail` (one). `review=amount\|mark_paid` lists orders waiting for a finance decision. |
| POST `/payments/orders/{id}/verify` | P, A | Razorpay `{razorpay_payment_id, razorpay_order_id, razorpay_signature}` or Stripe `{payment_intent_id}` → `PaymentOrderOut`. The server checks with the gateway. 400 `invalid_signature` / `order_mismatch`. |
| POST `/payments/orders/{id}/bank-transfer-proof` | P, A | `{document_id, reference}` |
| POST `/payments/orders/{id}/mark-paid` | F | `{reference, amount_minor}`. Maker step for a bank transfer: records a **pending** request; nothing is captured yet. |
| POST `/payments/orders/{id}/mark-paid/approve` · `/mark-paid/reject` | F (a different user) | Checker step. Approve captures the payment; the requester gets 403 `second_approver_required`. Reject takes `{reason?}`. 400 `no_pending_request` if nothing is pending. |
| POST `/payments/orders/{id}/amount-review` | F | `{payment_id, decision: accept\|return, note}`. Decides a payment held because the captured amount differed from the order: `accept` credits what was actually received; `return` refunds it in full through the gateway without touching the books. |
| POST `/payments/mock/{order_id}/complete` | Order owner (not in production) | `{outcome: success\|failure}` |
| POST `/payments/webhooks/razorpay` · `/payments/webhooks/stripe` | Public (signature) | §9 |
| POST `/payments/refunds` · GET `/payments/refunds` · POST `/payments/refunds/{id}/approve` · `/reject` | F (create also AD) | `{payment_id or order_id, amount_minor, reason}`; amount ≤ refundable. Above the `refund_dual_approval_threshold_minor` setting (INR) the requester can't approve their own refund (403 `second_approver_required`). |
| GET `/payments/invoices` · GET `/payments/invoices/{id}` · GET `/payments/invoices/{id}/pdf` | Scoped | Receipts and invoices |
| GET `/payments/bookings/{booking_id}/installments` | Scoped | `[InstallmentOut]` |

`PaymentOrderOut` includes `review_required: "amount" | "mark_paid" | null`. `PaymentOrderDetail` adds
`payments[]`, `refunds[]`, `bank_transfer_proof`, and for staff `mark_paid_request {status, reference,
amount_minor, requested_by, requested_at, decided_by, decided_at, reason}` and `amount_reviews[]`.
`POST /payments/orders` in a foreign currency needs a current FX rate; in production a missing or stale rate
returns 503 `fx_rate_unavailable`. Details: [PAYMENTS.md](PAYMENTS.md).

`CheckoutOut = {order: PaymentOrderOut, gateway, razorpay?: {key_id, order_id, amount, currency, name,
description, prefill{name, email, contact}}, stripe?: {publishable_key, client_secret}, bank_transfer?:
{beneficiary_name, bank_name, account_number, ifsc, swift, iban, reference}, mock?: {complete_url}}`

### 10.13 Finance: ledger and settlements (`/finance`)

| Method & path | Who | Notes |
|---|---|---|
| GET `/finance/summary` | F, S; H and A get their own | Staff: escrow, receivables, bank, revenue, GST, TDS, payables, pending, GMV. H/A: pending, eligible, on hold, paid, last payout, next payout date. |
| GET `/finance/ledger/accounts?owner_type=&q=` · GET `/finance/ledger/accounts/{id}/entries?page=` | F | Accounts, entries |
| GET `/finance/ledger/transactions?txn_type=&reference_id=&page=` · GET `/finance/ledger/transactions/{id}` | F | With entries |
| GET `/finance/ledger/trial-balance` | F | Σ by account type; must net to 0 |
| GET `/finance/settlements/items?payee_type=&payee_id=&status=&page=` | F; H/A own | `Page[SettlementItemOut]` |
| POST `/finance/settlements/items/{id}/hold` · `/release` | F | `{reason}` |
| POST `/finance/settlements/batches` | F | `{payee_type, payee_id?, period_end?}` → batch in `pending_approval` |
| GET `/finance/settlements/batches?status=&page=` · GET `/finance/settlements/batches/{id}` | F | `SettlementBatchOut` |
| POST `/finance/settlements/batches/{id}/approve` · `/reject` · `/process` | F (approver ≠ creator) | Maker-checker |
| GET `/finance/settlements/payouts?status=&awaiting_confirmation=&reversal_pending=&page=` | F; H/A own | `Page[PayoutOut]` |
| GET `/finance/settlements/items/{id}` · GET `/finance/settlements/payouts/{id}` | F; H/A own | One item / payout |
| POST `/finance/settlements/payouts/{id}/mark-paid` · `/mark-failed` | F | `{utr}` / `{reason, reference?}`. Mark-paid records the UTR (maker step). Mark-failed is immediate for queued/processing payouts; for processed or `needs_reconciliation` ones it needs `reference` and only records a request. |
| POST `/finance/settlements/payouts/{id}/mark-failed/approve` · `/mark-failed/reject` | F (a different user) | Checker step for reversals: approve takes `{request_id, reference}` (`reversal_request_id`; 409 `mark_failed_request_changed` on mismatch); the requester gets 403 `second_approver_required`. |
| POST `/finance/settlements/payouts/{id}/mark-paid/approve` · `/mark-paid/reject` | F (a different user) | Checker step: approve takes `{request_id, reference, amount_minor}` (the payout's `paid_request_id`, UTR and amount as reviewed; 409 `mark_paid_request_changed` if the pending request changed); the requester gets 403 `second_approver_required`. Reject takes `{reason}`. |
| GET `/finance/settlements/invoices?kind=&batch_id=` · GET `/finance/settlements/invoices/{id}` · `/{id}/pdf` | F all; H/A own | Commission invoices, credit notes, agent statements (with `payee_name`). `/payments/invoices*` serves patient receipts only. |
| GET / POST `/finance/ledger/adjustments` · GET `/finance/ledger/adjustments/{id}` · POST `…/{id}/approve` · `…/{id}/reject` | F | Manual postings (tax remittance, FX difference, other), approved by a different finance user |
| GET / POST / PATCH `/finance/commission-rules` · GET `/finance/commission-rules/resolve?hospital_id=&procedure_id=&specialty_id=` | F, AD | Commission rules; `resolve` shows which rule would apply |
| GET / POST / PATCH `/finance/payout-accounts` · POST `/finance/payout-accounts/{id}/verify` | H/A own; F all (verify: F, not the submitter) | Account number is write-only and returned masked; detail changes and re-activation reset verification |
| GET `/finance/statements?from=&to=` | H, A | CSV-friendly rows |

The finance module is still being extended; Swagger is authoritative for these shapes.

### 10.14 Admin (`/admin`, S unless noted)

| Area | Endpoints |
|---|---|
| Dashboard | GET `/admin/dashboard` |
| Users | GET `/admin/users?role=&status=&q=&page=` · GET `/admin/users/{id}` · PATCH `/admin/users/{id}` `{status?, role?}` (AD; audited; the last super_admin can't be demoted) · POST `/admin/users` (AD: create staff `{email, full_name, role, password}`) |
| Hospitals | GET `/admin/hospitals?status=&q=&page=` · GET `/admin/hospitals/{id}` · POST `/admin/hospitals/{id}/approve` · `/reject` `{reason}` · `/suspend` · `/reinstate` · PATCH `/admin/hospitals/{id}` `{commission_rate_bps?, settlement_cycle_days?, is_featured?}` |
| Agents | GET `/admin/agents?status=&q=` · POST `/admin/agents/{id}/approve` · `/reject` · `/suspend` · `/reinstate` · PATCH `/admin/agents/{id}` `{commission_rate_bps?, tier?}` |
| Catalog CRUD (AD) | `/admin/specialties`, `/admin/procedures`, `/admin/cost-benchmarks`, `/admin/cultural-tips`, `/admin/accommodation-providers`, `/admin/service-providers`, `/admin/fx-rates` |
| Settings | GET `/admin/settings` · PUT `/admin/settings/{key}` `{value}` (AD; finance keys F) |
| Audit | GET `/admin/audit-logs?actor_user_id=&entity_type=&entity_id=&action=&from=&to=&page=` |
| Reports | GET `/admin/reports/revenue?from=&to=&group_by=month\|hospital\|specialty` · `/admin/reports/cases` · `/admin/reports/export?type=bookings\|payments\|settlements` (CSV stream) |
| Staff | GET `/admin/staff?role=` |

Staff lists of cases, bookings and payments come from §10.8 and §10.12 (staff scope = all).

### 10.15 System (no `/api/v1` prefix)

| Path | Notes |
|---|---|
| GET `/health/live` | `{"status": "ok"}` while the process is up |
| GET `/health/ready` | `{"status": "ok", "checks": {"database": "ok", "redis": "ok\|disabled"}}`, or 503 `service_unavailable` with the checks in `details` |
| GET `/metrics` | Prometheus. Blocked at the edge (404). In production only served to private/loopback peers. |
| GET `/api/docs` · `/api/openapi.json` | Swagger / OpenAPI (unless `ENV=production` and `ENABLE_DOCS=false`) |
