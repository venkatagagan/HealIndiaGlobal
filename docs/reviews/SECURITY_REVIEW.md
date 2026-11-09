# Heal India Global — Security Review

| | |
|---|---|
| Reviewer | security-auditor. Pass 1 was read-only. In pass 2 the auditor fixed High findings (with tests) only in modules whose builders had finished; everything else is recorded for routing (section 5). |
| Standards | PLAN §9 security checklist · OWASP ASVS 4.0.3 Level 2 · OWASP API Security Top 10 (2023) |
| Scope | `backend/app/**` (core + all 14 modules + `voice` when present), `infra/**`, `backend/Dockerfile`, `.github/workflows/ci.yml`, `web/packages/shared/**`, `web/apps/*/**`, `mobile/lib/**` + Android/iOS config, dependency manifests |
| Method | Static code review of the live tree while ~25 agents were still writing code. No dynamic testing, no dependency CVE scan (no tools installed). Pass 1 was run in parallel (module reviewers forked from the auditor); every High and the core Medium findings were re-verified by hand. |
| Pass 1 | 2026-10-21 12:36–13:40 IST (code snapshot about 13:00–13:30) |
| Pass 2 | 2026-10-21 evening (resume run). Re-checked and extended the review of the finished modules: cases/bookings/travel, payments (amount review, mark-paid approve/reject, refund second approver, FX fail-closed), messaging + WebSocket, agents (consent attestation), admin, catalog/hospitals, screening (outside `rules*.py`), ledger read paths, `deploy/**`, `infra/**`. Auth, documents, settlements/ledger writes, docai, voice, web and mobile were still being worked on: their pass-1 findings keep their status unless a pass-2 note says otherwise. |

**Status values:** `Open` · `Fixed (pass 2)` · `Partially fixed (pass 2)` · `New (pass 2)` (combined with one of the others).
**Severity:** Critical = remotely exploitable with no preconditions, leading to full compromise or theft of funds. High = cross-tenant PHI exposure, account takeover or direct money loss that needs only modest preconditions. Medium = a real abuse path that needs an insider, a race or extra conditions, or a significant control gap. Low = hardening, defence in depth, privacy hygiene.

## 0. Status update 2026-11-09 (re-verified against the code)

The finding entries below keep their original text; this table is the current status where it differs.

| Finding | Now | Evidence |
|---|---|---|
| SEC-001 (High) Google/Apple link to unverified accounts | **Fixed** | `auth/service.py` federated sign-in refuses `account_exists_unverified` and audits it |
| SEC-002 (High) hospital access to all patient documents | **Fixed** | `documents/policies.py`: hospital branch limited to its own hospital and cases; `can_access_patient` is False for hospitals |
| SEC-013 (Medium) ops admin can grant finance/admin | **Fixed** | `admin/service.py` `_PRIVILEGED_GRANTS`: only a super_admin grants finance or admin (create and update); test in `test_admin.py` |
| SEC-016 (Medium) pre-created accounts | Partial | Google path fixed by SEC-001; invites still create active users |
| SEC-034 (Low) PHI responses cacheable | **Fixed** | `core/middleware.py`: every `/api/v1/` response defaults to `Cache-Control: no-store`; public catalogue keeps its own policy |
| SEC-041 (Low) http meeting links | **Fixed** | `cases/schemas.py` `ConsultationUpdate` accepts https only |
| SEC-047 (Low) `/verify` without rate limit | **Fixed** | `payments/router.py` 30/min per user |
| SEC-050 (Low) hospital-portal source maps | **Fixed** | `web/apps/hospital-portal/vite.config.ts` `sourcemap: false` |
| SEC-051 (Low) Android backups | **Fixed** | `AndroidManifest.xml` `allowBackup=false`, `res/xml/data_extraction_rules.xml` excludes everything |
| SEC-054 (Low) audit log tampering | Partial | Append-only trigger and REVOKE in migration 0004; AES-GCM AAD not re-checked |
| SEC-060 follow-up: document AI and voice consent | **Fixed** | `docai/service.py`, `voice/service.py` use `record_consent(..., granted_by_user_id=actor)`; tests check the granter |

Still open after re-verification (Medium): SEC-006 (partial), 007, 008 (partial), 009 (partial), 010 (partial), 011,
014, 015, 017, 018, 019, 020, 021, 022. Recommended order: 007+009 (money), 014 (suspension), 011 (beneficiary
account), 015 (former parties' chat access), 008 (FX bounds).

## 1. Summary

| Severity | Pass 1 | New in pass 2 | Fixed | Partially fixed | Still open |
|---|---|---|---|---|---|
| Critical | 0 | 0 | 0 | 0 | 0 |
| High | 4 | 2 | 2 (SEC-056, SEC-057) | 0 | 4 |
| Medium | 19 | 3 | 3 (SEC-005, SEC-012, SEC-058) | 6 | 13 |
| Low | 32 | 3 | 1 (SEC-062) | 3 | 31 |
| **Total** | **55** | **8** | **6** | **9** | **48** |

"Still open" for Low includes findings in modules that were not re-checked in pass 2 (auth, documents, settlements, web, mobile).

### Top risks (after pass 2)
1. **SEC-001** (be-auth, open) Google sign-in links a Google identity to *unverified* pre-existing accounts (account pre-hijacking).
2. **SEC-002** (be-auth, open) Members of any hospital can list and download *all* documents of every patient who ever opened a case with that hospital.
3. **SEC-003** (be-finance, fixed) Settlement maker-checker does not cover the auto-batch path or the payout destination.
4. **SEC-004** (be-finance, fixed) Razorpay Route payouts are retried blindly on timeouts (double payout).
5. **SEC-060** (new, fixed) An agent can turn its own consent attestation into the patient's "confirmation" through case creation or screening submit.
6. **SEC-059** (new, fixed) Any staff role can cancel a confirmed booking as `platform`, which creates auto-approved 100% refunds with no second person.
7. **SEC-007/009** (open/partial) Several open orders per target; mark-paid accepted on cancelled orders and with a reusable UTR.
8. **SEC-014/015** (open) Suspension is cosmetic; former case parties keep reading case chats.

Fixed in pass 2: **SEC-056** (agent account takeover of Google-activated managed patients), **SEC-057** (refund second-approver bypass through the settings API or by splitting), **SEC-058** (AWS client IP = CloudFront edge), **SEC-062** (nginx export location without a per-IP ceiling), plus pass-1 **SEC-005** (X-Forwarded-For spoofing) and **SEC-012** (MFA secret returned on password-only login), which the owners fixed.

### Findings by owner (pass 1)
| Owner | H | M | L |
|---|---|---|---|
| be-auth (auth, patients, documents) | 2 | 3 | 9 |
| be-finance (ledger, settlements) | 2 | 1 | 2 |
| be-payments | – | 4 | 2 |
| be-admin | – | 4 | 3 |
| be-cases (cases, travel) | – | 2 | 4 |
| be-messaging (messaging, agents) | – | 2 | 2 |
| be-catalog (catalog, hospitals) | – | 1 | – |
| be-screening | – | 1 | 1 |
| backend-core / backend-models | – | 1 | 6 |
| infra-docs / plan owner | – | 1 | 1 |
| web-* / flutter-* | – | – | 3 |

A finding is counted once, under its primary owner. Shared owners are listed on each finding.

---

## 2. Findings

### High

#### SEC-001 · High · Open — Google sign-in auto-links unverified pre-existing accounts (account pre-hijacking)
- **Where:** `backend/app/modules/auth/service.py:611-621` (link) and `:208-219` (`_ensure_can_sign_in`)
- **Refs:** ASVS 2.5 / 3.1; OWASP API2:2023
- **What happens:** `google_sign_in` looks up `User.email == identity.email` and attaches `google_sub` even when the existing account's `email_verified_at` is NULL. It then marks the email verified, but keeps the existing `password_hash`, refresh-token families and MFA secret.
- **Attack:**
  1. The attacker registers `victim@gmail.com` with a password they choose.
  2. The victim later uses "Continue with Google", lands in the attacker-created account, and stores their passport, medical history and reports there.
  3. The attacker keeps logging in with the password, or keeps rotating the refresh token issued at registration.
- **Why the email-verification setting does not help:** with `REQUIRE_EMAIL_VERIFICATION=true` the link sets `email_verified_at`, and that makes the attacker's password login valid.
- **Fix:** auto-link only when `user.email_verified_at` is already set. Otherwise refuse with `account_exists_unverified`, or treat Google as proof of ownership and reset the account:
  - clear `password_hash`;
  - disable and clear MFA;
  - `revoke_all_sessions(user)`;
  - write an audit row and notify the user.
- **Owner:** be-auth
- **Pass 2:** Unchanged. Current code `backend/app/modules/auth/service.py:707-722` still links on `User.email == identity.email` for accounts with `email_verified_at IS NULL` (including agent- and hospital-pre-created accounts) and keeps their password hash, sessions and MFA. Route to be-auth.

#### SEC-002 · High · Open — Hospitals can read every document of any patient who ever had a case with them (cross-tenant PHI)
- **Where:** `backend/app/modules/documents/policies.py:74-83` (`visibility_clause`, `Document.patient_id.in_(hospital_patients)`) and `:127-132` (`can_access_patient`)
- **Refs:** OWASP API1:2023 BOLA; ASVS 4.2.1
- **What happens:** for hospital users, the predicate includes any document whose `patient_id` belongs to a patient with *any* case at the member's hospital. Declined and cancelled cases count. The predicate covers list, get and download, for every member role.
- **What leaks:**
  - passport and visa scans;
  - payment proofs and receipts;
  - reports uploaded for the same patient's case at a competing hospital. `patient_id` is copied from the case on upload (`documents/service.py:127`).
- **Exploit:** `GET /documents?patient_id=<id from CaseOut>`, then `/documents/{id}/download`.
- **Why it is out of policy:** it goes beyond PLAN §8.3 ("hospital of a linked case") and beyond the per-case `share_with_hospitals` consent.
- **Fix:**
  - Limit the hospital branch to `Document.hospital_id IN member_hospitals OR Document.case_id IN cases_of(member_hospitals)`.
  - Share patient-level documents (no case) only when they are explicitly attached to that hospital's case.
  - Release the passport only for a booked case that needs an invitation letter.
  - Apply the same rule in `can_access_patient`, and add an IDOR test with two hospitals and one patient.
- **Owner:** be-auth
- **Pass 2:** Unchanged. `backend/app/modules/documents/policies.py:76,81` (`Document.patient_id.in_(hospital_patients)`) and `:124-129` (`can_access_patient` hospital branch). Route to be-auth.

#### SEC-003 · High · Fixed (be-finance) — Maker-checker does not protect the payout itself; one finance user can redirect and release settlement money
- **Where:** `backend/app/modules/settlements/service.py`
  - `:808-849` `auto_batch` → `generate_batch(actor=None)`, so `created_by` is NULL;
  - `:875` the approve check is skipped when `created_by` is NULL;
  - `:1000` the destination account is resolved only at *process* time;
  - `:1274-1337` finance can create payout accounts for any payee, including `is_primary` and `razorpay_linked_account_id`;
  - `:1419-1437` the same user can verify them;
  - `:1214-1233` mark-failed on an already PROCESSED payout returns its items to `eligible`.
  - DB check `backend/app/models/settlements.py:116-118` passes when `created_by IS NULL`.
- **Refs:** ASVS 1.11 / 11.1.x (business logic, separation of duties); OWASP API6:2023
- **Attack (one rogue finance user, or one stolen finance session with MFA):**
  1. Add their own bank account to hospital X and verify it.
  2. Approve and process the next auto-batch, which pays the account they control.
  3. Or "fail" a processed payout so the same items are paid again in the next batch.
- **Fix:**
  - Snapshot each payee's `payout_account_id` (masked number and IFSC) into the batch when it is generated, show it to the approver, and refuse to process if it changed.
  - Payout-account create, change and verify need two different finance users. Store `created_by`/`verified_by` and add a CHECK that they differ.
  - For system batches, require processor ≠ approver.
  - Reversing a processed payout needs a second approver and a reference.
  - Re-check `is_verified AND status='active'` in `execute_payout`.
- **Owner:** be-finance
- **Pass 2:** Unchanged (be-finance still working). Current lines in `backend/app/modules/settlements/service.py`: `auto_batch` `:811-849` (`generate_batch(actor=None)`), `approve_batch` `:870`, `process_batch` `:965`, `update_payout_account` `:1435-1491`, `verify_payout_account` `:1494-1510` (any finance user, including the creator). Route to be-finance.
- **Fix applied (be-finance):**
  - Each batch stores `payout_accounts_snapshot` (masked details plus a fingerprint) at generation. Processing fails a payee whose account changed, and `execute_payout` re-checks verified/active/fingerprint before sending.
  - Payout accounts record `submitted_by`/`verified_by` (DB CHECK that they differ); the submitter gets 403 `maker_checker` on verify.
  - The approver of a system batch cannot process it.
  - Failing a processed or `needs_reconciliation` payout needs a reference and a second finance user (`mark-failed/approve`).
  - Tests: `test_settlements.py::test_payout_account_changed_after_batch_generation_is_refused`, `::test_system_batch_approver_cannot_process`, `::test_payout_account_verification_and_reactivation`, `::test_manual_bank_transfer_mark_paid_and_failed`.

#### SEC-004 · High · Fixed (be-finance) — Razorpay Route transfers are retried without idempotency (double payout)
- **Where:** `backend/app/modules/settlements/providers.py:101-110` (any `httpx.HTTPError`, including a read timeout after Razorpay already created the transfer, raises `PayoutTransientError`) and `:122-123` (missing id → retry); `service.py:1182-1187`; retry and stale-lock requeue in `backend/app/core/jobs.py`
- **Refs:** PLAN §9.3; ASVS 11.1.4
- **What happens:** the job rolls back and POSTs `/v1/transfers` again, up to `max_attempts` times, with no idempotency key and no lookup of an existing transfer for `notes.payout_id`. Confidence: medium. Exploitation needs a network timeout, but a timeout means real money paid twice.
- **Fix:**
  - Commit a `processing/attempted` marker *before* the call.
  - Retry automatically only on connect errors, where the request provably never reached Razorpay.
  - On read timeouts or 5xx, query transfers by `notes.payout_id` (or use the gateway idempotency header where supported) before re-sending, or park the payout in a `needs_reconciliation` state for finance.
- **Owner:** be-finance
- **Pass 2:** Unchanged. `backend/app/modules/settlements/providers.py:107-123` still maps every `httpx.HTTPError` and a missing id to `PayoutTransientError`. Route to be-finance.
- **Fix applied (be-finance):**
  - `gateway_attempted_at` is committed before the call.
  - Only connect errors and HTTP 429 raise `PayoutTransientError` (the marker is cleared, then the job retries).
  - Read timeouts, other transport errors, 5xx, a missing id, or a job that finds the marker set raise `PayoutOutcomeUnknown`. The payout is then parked as `needs_reconciliation` and never re-sent; finance resolves it with mark-paid (`trf_` id) or the two-person mark-failed.
  - Tests: `test_settlements.py::test_razorpay_timeout_is_parked_never_resent`, `::test_razorpay_connect_error_is_retried`.

### Medium

#### SEC-005 · Medium · Fixed (pass 2) — Client IP can be spoofed via `X-Forwarded-For` (rate-limit bypass, forged audit and consent IPs)
- **Where:**
  - `backend/app/core/deps.py:153-180` (`get_client_ip` takes the *first* XFF entry when the peer is private);
  - `infra/nginx/snippets/proxy-api.conf:7` (`$proxy_add_x_forwarded_for` *appends* to the client's header);
  - `infra/docker-compose.yml:219` with `backend/Dockerfile:99` (`FORWARDED_ALLOW_IPS="*"`: uvicorn ProxyHeadersMiddleware then sets `request.client` to the first, client-supplied XFF entry; verified in uvicorn 0.54 `proxy_headers.py:176-177`).
- **Refs:** ASVS 4.0 / 7.1.3; PLAN §9.7
- **Impact:**
  - Any client can send `X-Forwarded-For: <random>` on every request, which bypasses all app-level per-IP limits: login 10/min, register 5/min, forgot-password 3/min, guest 10/min, webhooks 600/min.
  - Audit-log and consent-record IPs can be forged (they are used as legal evidence of consent).
  - Only nginx's own `limit_req` (keyed on the real `$remote_addr`) remains.
- **Fix:**
  - nginx: `proxy_set_header X-Forwarded-For $remote_addr;` (overwrite instead of append).
  - Set `FORWARDED_ALLOW_IPS` to the nginx container network, never `*`.
  - In `get_client_ip`, prefer `X-Real-IP` (set by nginx) or take the right-most untrusted XFF hop, with an explicit `TRUSTED_PROXIES` CIDR list instead of "any private address".
- **Owner:** backend-core, infra-docs
- **Pass 2:** Fixed by backend-core and infra: nginx now overwrites `X-Forwarded-For`/`X-Real-IP` with `$remote_addr` (`infra/nginx/snippets/proxy-api.conf:9-10`), compose trusts proxy headers only from the edge's fixed address (`infra/docker-compose.yml:266`), and `get_client_ip` takes the right-most untrusted hop behind `TRUSTED_PROXIES` (`backend/app/core/deps.py:231-258`). k8s keeps `use-forwarded-headers: "false"`. The AWS target still keyed limits on the CloudFront edge; see SEC-058 (fixed).

#### SEC-006 · Medium · Partially fixed (pass 2) — Webhook capture matched via payer-controlled `notes.order_id`; short captures marked PAID
- **Where:**
  - `backend/app/modules/payments/service.py:896-917` (`_find_order_for_event` falls back to `ev.our_order_id`);
  - `gateways/razorpay.py:199,211` (`our_order_id` read from payment `notes`, which the payer can set in Checkout options);
  - `service.py:558-571` (a missing or short amount only logs a warning);
  - `:610-631` (order set PAID and installment set PAID with no amount check).
- **Refs:** PLAN §9.3; OWASP API6
- **Exploit:** needs a captured payment whose Razorpay `order_id` is not one of ours, for example a payment without an order, a Payment Link, or another integration on the same merchant account. Pay ₹1 with `notes.order_id=<victim order uuid>`. The order, installment or consultation is marked paid.
- **Fix:**
  - Match only on `gateway_order_id` and require `info.gateway_order_id == order.gateway_order_id`. Drop the notes fallback.
  - Treat `amount < order.amount_minor` (or an unknown amount) as underpaid: record the Payment, keep the order pending, leave the installment unpaid, and alert finance.
- **Owner:** be-payments
- **Pass 2:** Short or long captures are now held for finance review instead of being applied (`payments/service.py:740-744`, `_hold_for_review` `:628-701`, decision endpoint `POST /payments/orders/{id}/amount-review` `:1165-1276`), so the ₹1 attack no longer marks anything paid. Residual (Low): `_find_order_for_event` still falls back to the payer-controlled `notes.order_id` (`:1303-1310`), and an unknown amount (`info.amount_minor <= 0`) is treated as the full order amount (`:740`).

#### SEC-007 · Medium · Open — Several open orders per target; overpayment and captures on cancelled bookings are accepted
- **Where:**
  - `backend/app/modules/payments/service.py:403-526` (no lock on the target, no check for existing open orders; `installment.order_id` is overwritten at `:499`);
  - `:318-324` (consultations count only PAID orders);
  - `:109-115` (captures accepted on EXPIRED or CANCELLED orders);
  - `backend/app/modules/cases/bookings.py:361-381` (`apply_captured_payment` checks neither `status` nor `amount_paid ≤ total`).
- **Refs:** PLAN §9.3; OWASP API6
- **Impact:**
  - A patient can be charged twice: deposit plus full, two balance orders, or two installment orders.
  - Money captured after a cancel stays in escrow with no refund.
  - At completion, `P = paid − refunded` moves the overpayment into the hospital payable.
- **Fix:**
  - Lock the booking, installment or consultation `FOR UPDATE` in `create_order`.
  - Reuse or cancel the existing open order for the same target and purpose (partial unique index on open orders).
  - Compute the amount due net of open orders, and make `Idempotency-Key` mandatory.
  - In `apply_captured_payment`, reject or flag captures for non-payable bookings and auto-create a refund request.
- **Owner:** be-payments, be-cases
- **Pass 2:** Unchanged: `create_order` (`payments/service.py:474-597`) neither locks the target nor reuses open orders; `CAPTURABLE_ORDER_STATUSES` includes `expired`, `failed` and `cancelled` (`:122-128`); `apply_captured_payment` (`cases/bookings.py:367-405`) still credits cancelled bookings and over-payments.

#### SEC-008 · Medium · Partially fixed (pass 2) — FX rates that price real payments are editable by ops admins without bounds
- **Where:** `backend/app/modules/admin/router.py:462-477`, `admin/schemas.py:728-749` (only `rate > 0`), `admin/catalog_admin.py:864-925`, `backend/app/core/money.py:150-174` (silent fall back to hard-coded `DEFAULT_FX_RATES`)
- **Refs:** OWASP API6; ASVS 11.1.4
- **Impact:** an absurd rate (USD = 0.00000001 INR) means patients pay almost nothing, while the booking and ledger are credited with the full INR snapshot. Hospitals are then paid from escrow that was never funded.
- **Fix:**
  - FX writes are finance-only, with a second approver when the change deviates more than ±5–10% from the previous rate or a reference feed.
  - Refuse stale or default rates for non-INR orders.
  - Audit and alert on every change, and reconcile gateway-settled INR against base amounts.
- **Owner:** be-admin, be-payments (money.py: backend-core)
- **Pass 2:** Missing or stale FX rates now fail closed in production (`payments/service.py:194-231`, 503 `fx_rate_unavailable`). Still open: one ops admin can create or change a rate without bounds (`admin/router.py:462-477`, `admin/catalog_admin.py:864-920`), and one finance user can set `fx_rate_max_age_hours=0` to switch the staleness check off (`core/settings_store.py:98`).

#### SEC-009 · Medium · Partially fixed (pass 2) — Bank-transfer reconciliation: one finance user, reusable UTR, works on cancelled orders
- **Where:** `backend/app/modules/payments/service.py:855-882`
- **What happens:**
  - Mark-paid accepts any `reference` and never checks it for uniqueness across orders, so one wire (or none) can "pay" many orders.
  - CANCELLED and EXPIRED orders are accepted.
  - A single finance user confirms a booking that is later settled to the hospital.
- **Fix:**
  - Store the UTR on `payments` with `UNIQUE(gateway, reference)`.
  - Refuse non-pending orders and non-payable bookings.
  - Require a second finance approver above a threshold, plus daily reconciliation against bank statements.
- **Owner:** be-payments
- **Pass 2:** Mark-paid is now maker-checker (`payments/service.py:1037-1161`, 403 `second_approver_required` for the requester) and the amount must equal the order amount. Still open: no uniqueness of the bank reference (UTR) across orders, and cancelled/expired orders can still be marked paid (`_check_mark_paid_allowed` `:1075-1081` uses `CAPTURABLE_ORDER_STATUSES`). See also SEC-063.

#### SEC-010 · Medium · Partially fixed (pass 2) — Refunds have no requester ≠ approver, and manual refunds are "processed" instantly
- **Where:** `backend/app/modules/payments/service.py:1274-1298`; `gateways/bank_transfer.py:40-54` (returns PROCESSED with a synthetic id, with no UTR and no destination)
- **Impact:** a single finance user can request and approve a refund. For bank-transfer refunds the ledger and booking show the money as returned even though nothing (or an off-book payment to an arbitrary account) happened.
- **Fix:**
  - Enforce `approved_by <> requested_by` in code and with a DB CHECK.
  - Keep manual refunds in `processing` until a *second* finance user records the UTR against a verified patient account.
- **Owner:** be-payments
- **Pass 2:** Requester ≠ approver is enforced above a threshold (`payments/service.py:1679-1735`), and pass 2 closed the bypasses of that threshold (SEC-057). Still open: no DB CHECK; bank-transfer refunds are still `processed` instantly with a synthetic id (`payments/gateways/bank_transfer.py:40-54`); system cancellation refunds are auto-approved (SEC-059).

#### SEC-011 · Medium · Open — One finance user can change the beneficiary account patients wire money to; the audit row hides the change
- **Where:** `backend/app/modules/admin/service.py:995-1015`; `backend/app/core/settings_store.py:283-284` (`bank_transfer_details` only has to be a dict); `backend/app/core/logging.py:34` (the `account_number` key is redacted in the before *and* after values)
- **Impact:** an insider, or a stolen finance session, can silently redirect every new bank-transfer payment. Investigators cannot see which account was shown to patients.
- **Fix:**
  - Two-person approval and a notification to all finance users.
  - Strict schema validation (account and IFSC/SWIFT/IBAN formats).
  - In the audit row, store a masked value plus a keyed hash of the account number instead of `[REDACTED]`.
- **Owner:** be-admin, backend-core
- **Pass 2:** `bank_transfer_details` is now a finance-only key (`core/settings_store.py:71-86`), but one finance user still changes it alone, without format validation, and the audit row still redacts the account number.

#### SEC-012 · Medium · Fixed (pass 2) — Staff MFA enrolment secret is returned to anyone who knows the password
- **Where:** `backend/app/modules/auth/service.py:532-561`
- **Refs:** ASVS 2.7 / 2.8
- **What happens:**
  - With `ADMIN_MFA_REQUIRED`, a password-only login for a not-yet-enrolled staff user creates and commits a TOTP secret, then returns `secret` and `otpauth_url` in the 401 details.
  - The same secret is returned again on every attempt until enrolment completes.
  - Staff accounts are created by an admin with an admin-chosen password (`admin/service.py:395-430`).
- **Impact:** the creator, or anyone who phished the initial password, binds the second factor and permanently owns the account. Combined with SEC-013, this defeats maker-checker.
- **Fix:**
  - Provision staff with a single-use invite link where the invitee sets the password and enrols MFA in that session.
  - Never return a TOTP secret in a password-only response.
  - Force a password change on first login.
- **Owner:** be-auth (+ be-admin)
- **Pass 2:** Fixed by be-auth: staff MFA enrolment now needs a one-time enrolment code issued by a *different* super_admin (`auth/service.py:1440-1500`, `:1548-1580`), and production refuses to start without `ADMIN_MFA_REQUIRED=true` (`core/config.py:235-236`). Verified by reading the code only.

#### SEC-013 · Medium · Partially fixed (pass 2) — Ops `admin` can create and promote `finance` and `admin` staff (separation of duties)
- **Where:** `backend/app/modules/admin/service.py:395-430` (`create_staff`, password chosen by the admin), `:344-348` and `:362-363` (staff ↔ staff role changes); `router.py:101-112`
- **Refs:** PLAN §5 and §6.4; ASVS 4.1.3
- **Impact:** a rogue admin can create two finance accounts with passwords they know (and MFA they control, see SEC-012). They become both maker and checker for batches, refunds and mark-paid.
- **Fix:**
  - Only `super_admin`, or a second approver, may grant or create `finance` and `admin`.
  - Use invite-based provisioning.
  - Notify existing finance and super_admin users of every staff-role change.
- **Owner:** be-admin
- **Pass 2:** A newly created staff account can no longer finish MFA enrolment without a super_admin's code (SEC-012), which blocks the "two finance accounts with known passwords" path when MFA is required. Still open: ops `admin` creates `finance` users and moves existing staff (for example a support user) into `finance` (`admin/service.py:344-380`, `:400-436`).

#### SEC-014 · Medium · Open — Suspending a hospital or agent is cosmetic: their users keep PHI access, write powers and payouts
- **Where:**
  - `backend/app/modules/admin/service.py:703-718`, `:935-944` (status field only; `_revoke_sessions` exists at `:319` but is not called);
  - `backend/app/modules/cases/policies.py:80-93`, `:184-189` (no `Hospital.status` / `Agent.status` checks);
  - `backend/app/modules/agents/service.py:111-116` (read paths skip `_require_operational`);
  - `backend/app/modules/messaging/policies.py:139-146`, `:176-182`;
  - `backend/app/modules/settlements/policies.py:67-83` and batch generation (no payee status checks).
- **Refs:** OWASP API5:2023; ASVS 4.1.5
- **Impact:** a hospital or agent suspended for fraud keeps reading cases, screenings, documents and conversations, can quote, admit and complete bookings, and keeps receiving auto-batched payouts.
- **Fix:**
  - On suspend or reject: set member and agent `users.status=suspended` (or a per-membership flag), revoke sessions, and put pending settlement items on hold.
  - Add `status == active` to the shared scope helpers for every write path, and preferably for reads too.
  - Reinstate should undo only what suspend changed.
- **Owner:** be-admin, be-cases, be-messaging, be-finance
- **Pass 2:** Unchanged: `suspend_hospital`/`suspend_agent` (`admin/service.py:737-752`, `:969`) still only change the status field; the scope helpers do not check `Hospital.status`.

#### SEC-015 · Medium · Open — Former case parties keep access to case conversations
- **Where:** `backend/app/modules/messaging/service.py:235-241` (a participant row grants access before the case-party check), `:258-262` (list); fan-out in `handlers.py:784-843`
- **What happens:** participant rows are never removed. A doctor or coordinator removed from `hospital_members`, a re-assigned coordinator, or an unlinked agent keeps reading the case chat (PHI) and receives new messages over WS and notifications.
- **Fix:**
  - For `kind=case`, require `can_access_case` on every read, list and fan-out.
  - Delete participant rows when a membership, coordinator or agent link changes. be-catalog should publish a `hospital.member_removed` event.
- **Owner:** be-messaging (+ be-catalog)
- **Pass 2:** Unchanged: `messaging/service.py:231-243` grants access on a participant row before the case-party check; `hospitals/service.py:474-494` (`remove_member`) does not remove conversation participants.

#### SEC-016 · Medium · Partially fixed (pass 2) — Pre-created accounts (agent-created patients, hospital invites) enable email squatting and silent agent access to a person's PHI
- **Where:** `backend/app/modules/agents/service.py:495-561`; `backend/app/modules/hospitals/service.py:343-439` and `router.py:174` (draft or rejected hospitals can invite, no rate limit); `backend/app/modules/auth/service.py:610-619` (Google links to them)
- **What happens:**
  - Agents and hospitals create ACTIVE users with no password for arbitrary emails.
  - The INVITE token is never consumed, because no accept-invite endpoint exists.
  - The real owner later uses forgot-password or Google sign-in and lands inside an agent-managed patient account (the agent sees their screenings, reports and passport), or inside an unknown hospital tenant.
  - The real owner can no longer register ("email taken").
  - Invite mails carry attacker-chosen hospital and agency names (200 characters each) from the platform's domain, which enables phishing.
- **Fix:**
  - Create invited users as `pending_verification` and implement `POST /auth/accept-invite`.
  - On first sign-in by any method, require explicit acceptance of "managed by <agency>" or "member of <hospital>" (record a consent).
  - Let patients revoke `managed_by_agent_id`.
  - Allow invites only from ACTIVE hospitals and agents, with per-day caps.
- **Owner:** be-messaging, be-catalog, be-auth
- **Pass 2:** `POST /auth/accept-invite` now exists (`auth/service.py:1510-1535`). Still open: invites from draft or rejected hospitals with no rate limit (`hospitals/router.py:80`), Google sign-in links to pre-created accounts (SEC-001), and no explicit "managed by <agency>" acceptance. Related: SEC-056 (fixed) and SEC-060.

#### SEC-017 · Medium · Open — Account lockout can be weaponised (targeted DoS, live sessions killed) and leaks account existence
- **Where:** `backend/app/modules/auth/service.py:477-518`, `:590-592`; `backend/app/core/deps.py:72-74`
- **What happens:**
  - Five wrong passwords or OTPs from anyone lock the account for 15 minutes, and the counter resets, so the lock can be renewed indefinitely (per-IP limits are bypassable, SEC-005).
  - During the lock, `deps._user_from_token` rejects the victim's *existing* access tokens and refresh refuses to rotate. An attacker can keep finance users out during payout windows.
  - `403 account_locked` (with `locked_until`) is returned before the password check, while unknown emails get 401. That is an account-existence oracle.
- **Fix:**
  - Do not invalidate existing sessions on failed-login locks.
  - Throttle per (account, IP/device) with progressive delay or CAPTCHA.
  - Return the same 401 for locked and unknown accounts and email the owner instead.
- **Owner:** be-auth, backend-core
- **Pass 2:** Not re-checked in depth (be-auth still working). `core/deps.py:91-93` still rejects existing access tokens while the account is locked.

#### SEC-018 · Medium · Open — Unpaid bookings hold admission capacity until the admission date; no caps on case, booking and consultation creation
- **Where:** `backend/app/modules/cases/bookings.py:253` (slot reserved for `pending_payment`), `:544` (expiry only once `admission_date < today`); `router.py:57`, `:134`, `:265` (no rate limits)
- **Refs:** OWASP API4 / API6
- **Impact:** one patient, or free guest accounts, can block all published slots of a hospital or doctor for weeks at zero cost, and spam hospital members with `case.created` notifications.
- **Fix:**
  - Expire `pending_payment` bookings after a payment window (30–60 min, ≤ 24 h) and release the slot.
  - Cap open enquiries and pending bookings per patient.
  - Apply `rate_limit(..., key="user")` on the create endpoints, and block guests from booking.
- **Owner:** be-cases
- **Pass 2:** Unchanged: `expire_unpaid_bookings` still waits for the admission date (`cases/bookings.py:603-611`); `POST /cases`, `/bookings` and `/consultations` have no per-user rate limit (`cases/router.py:61`, `:156`, `:296`).

#### SEC-019 · Medium · Open — A hospital can "admit" long before the admission date, which removes the patient's right to cancel
- **Where:** `backend/app/modules/cases/bookings.py:567-575`; `state.py:47` (no ADMITTED → CANCELLED)
- **What happens:** any write-role member can admit a freshly confirmed booking. The patient's self-service cancel and refund disappear. Complete then triggers revenue recognition and payout after the hold period.
- **Fix:**
  - Allow admit only when `admission_date <= today_ist() + 1`; staff overrides are audited.
  - Optionally require arrival confirmation by the coordinator or patient.
  - Extend the settlement hold when completion follows admission within hours.
- **Owner:** be-cases (+ be-finance)
- **Pass 2:** Unchanged: `admit_booking` (`cases/bookings.py:637-669`) has no admission-date window.

#### SEC-020 · Medium · Open — Approved hospitals can change legal identity and accreditation claims without re-review
- **Where:** `backend/app/modules/hospitals/service.py:154-183` (`update_profile`); `schemas.py:78-101`
- **What happens:**
  - Owners and admins of an ACTIVE hospital can edit `name`, `legal_name`, `gstin`, `pan`, `email`, `website` and `accreditations` with no status or KYC reset.
  - Accreditations are self-declared but drive public "JCI accredited" badges and the matching bonus (PLAN §7, +10 / +7).
  - This contradicts PLAN §9.9 ("never claim certifications we don't hold").
- **Fix:**
  - Route post-approval changes of these fields to a pending-change record that needs admin approval.
  - Show an accreditation only after it has been verified against a `kyc_accreditation` document.
- **Owner:** be-catalog (+ be-admin)
- **Pass 2:** Unchanged: `hospitals/service.py:154-184`.

#### SEC-021 · Medium · Open — AI screening has no real spend cap ("denial of wallet")
- **Where:** `backend/app/modules/screening/router.py:19` (5/min/user only); `service.py:286-357` (unlimited reruns)
- **What happens:** guests are free (`/auth/guest` 10/min/IP, with the IP spoofable via SEC-005). Each submit or rerun is an Opus call (max_tokens 16000) with up to 3 × 10 MB attachments. There is no per-patient quota and no global budget or circuit breaker.
- **Refs:** OWASP API4:2023
- **Fix:**
  - A per-patient daily quota, with a low cap on reruns.
  - The rules engine only for guests and unverified accounts.
  - A global daily spend cap that falls back to rules.
  - Alerting on `ai_request_logs` volume.
- **Owner:** be-screening (+ be-auth)
- **Pass 2:** Unchanged: only `screening.submit` 5/min/user (`screening/router.py:19`).

#### SEC-022 · Medium · Open — PLAN §3.1 (changed 13:20) puts the staff console on the same origin as the public website and portals
- **Where:** `docs/PLAN.md:180-217`; `web/packages/shared/src/auth/doors.ts:35-45`
- **What happens:** `/gahi/` (staff) shares an origin with the Next.js website and the patient, agent and hospital SPAs, which load third-party scripts (Razorpay, Stripe, Google GIS). Cookie `Path` and `SameSite=Strict` do not isolate same-origin JavaScript. Any XSS or compromised third-party script on *any* page can call `fetch('/api/v1/auth/staff/refresh', {method:'POST', credentials:'include', headers:{'X-Requested-With':'XMLHttpRequest'}})` and obtain a finance or super_admin access token.
- **Fix:**
  - Serve the staff console and `/api/v1/auth/staff/*` from a separate origin (for example `ops.<domain>`) with host-only cookies and a CSP that allows no third-party scripts.
  - At minimum, make `STAFF_ALLOWED_IPS` mandatory in production and require step-up TOTP for money actions.
- **Owner:** plan owner, infra-docs, web-foundation, be-auth
- **Pass 2:** Plan unchanged (one origin). Mitigation now available: the app enforces `STAFF_ALLOWED_IPS` on every staff request (`core/deps.py:91-96`) and on the staff door; set it in production.

#### SEC-023 · Medium · Fixed (be-finance) — Payees can re-activate a payout account that finance disabled, and it stays verified
- **Where:** `backend/app/modules/settlements/service.py:1394-1402` (`status` is not in `_REVERIFY_FIELDS`)
- **What happens:** a hospital owner, admin or finance member, or an agent, sends `{"status":"active","is_primary":true}`. That undoes finance's only block on a compromised account, and the account receives the next payout.
- **Fix:** only finance may re-activate a disabled account, or re-activation resets `is_verified`. Audit it either way.
- **Owner:** be-finance
- **Pass 2:** Unchanged: a payee may still send `status: active` (`settlements/service.py:1468-1471`); `status` is not in `_REVERIFY_FIELDS` (`:1431-1433`). Route to be-finance.
- **Fix applied (be-finance):** re-activating a disabled account resets `is_verified`/`verified_by`/`verified_at` and records the actor as `submitted_by`, and it is audited. Test: `test_settlements.py::test_payout_account_verification_and_reactivation`.

### New in pass 2 (High and Medium)

#### SEC-056 · High · New, Fixed (pass 2) — Agent can take over a managed patient's account after the patient activated it with Google
- **Where (before the fix):** `backend/app/modules/agents/service.py` `update_patient` (email change locked only when `password_hash` was set); `backend/app/modules/auth/service.py:1051-1076` (`forgot_password` mails any active account) and `:1510-1535` (`accept_invite` sets a password when there is none).
- **Attack:**
  1. An agent creates a managed patient with the patient's real email.
  2. The patient signs in with Google (SEC-001 links the account, sets `email_verified_at`, no password) and uses the account.
  3. The agent sends `PATCH /agent-portal/patients/{id} {"email": "agent@evil"}`. This was allowed because `password_hash` was empty, and a fresh invite went to the agent's address.
  4. The agent accepts the invite, sets a password and signs in as the patient: messages, payments, consents and account deletion.
- **Verified:** failing test `tests/modules/test_agent_portal.py::test_patch_email_locked_after_google_activation` (200 instead of 400 before the fix).
- **Fix applied:** new `account_activated(user)` (`agents/service.py:373-386`) = password **or** `google_sub` **or** `email_verified_at` **or** `last_login_at`. It now gates email changes (`:715`) and drives the `account_activated` output field.
- **Owner:** be-messaging (agents)

#### SEC-057 · High · New, Fixed (pass 2) — Refund second-approver control could be switched off by the same finance user
- **Where (before the fix):** `backend/app/modules/payments/service.py` `approve_refund` read `refund_dual_approval_threshold_minor` from platform settings, which any finance user changes alone with `PUT /admin/settings/refund_dual_approval_threshold_minor` (range 0–10¹², `core/settings_store.py:99`). Each refund was also checked on its own.
- **Bypasses:**
  1. Raise the threshold to 10¹² with one call, then request and approve any refund yourself.
  2. Split a large refund into several requests below INR 50,000 and self-approve each one.

  Either way the backlog #26 maker-checker is defeated, and for bank-transfer payments the "refund" is booked as processed with no money trail (SEC-010).
- **Verified:** failing tests `tests/modules/test_payments_refunds.py::test_refund_self_approval_cannot_be_split_or_raised` and the updated `test_refund_reject`.
- **Fix applied:** `approve_refund` (`payments/service.py:1679-1735`):
  - the effective threshold is `min(setting, DEFAULT_REFUND_DUAL_APPROVAL_MINOR)`, so the setting can only tighten the control;
  - refunds the same user requested **and** approved in the last 24 h count toward the threshold.
- **Residual (Low):** two concurrent self-approvals are not serialised, so each could pass the 24 h sum once. Lock the approver's rows (or use an advisory lock per user) if this matters.
- **Owner:** be-payments (+ be-admin for the settings API)

#### SEC-058 · Medium · New, Fixed (pass 2) — On AWS every viewer behind one CloudFront edge shared one "client IP"
- **Where:** `deploy/terraform/aws/ecs.tf` (no `TRUST_CLOUDFRONT_VIEWER_ADDRESS`), `backend/app/core/deps.py:224-258`
- **What happened:** uvicorn trusts the VPC (`FORWARDED_ALLOW_IPS = var.vpc_cidr`), so the peer became the CloudFront edge address. Effects:
  - per-IP limits (login 10/min, register, forgot-password, guest, webhooks) were shared by all users of a POP, an easy lockout DoS;
  - audit and consent IPs were edge addresses;
  - `STAFF_ALLOWED_IPS` could not work.
- **Fix applied:** `TRUST_CLOUDFRONT_VIEWER_ADDRESS = "true"` in the ECS app environment (`ecs.tf:63-66`). This is safe because the ALB admits only CloudFront (origin-facing prefix list plus the secret `X-Origin-Verify` header, `alb.tf:5-6`, `:118-119`) and CloudFront overwrites the header. `deploy/README.md` was updated. k8s and compose keep it `false`.
- **Owner:** infra-docs (deploy)

#### SEC-059 · Medium · New, Fixed — Any staff role can cancel a confirmed booking as `platform`, which auto-creates approved 100% refunds
- **Where:**
  - `backend/app/modules/cases/bookings.py:565-583` (`resolve_initiator`: staff default to `PLATFORM`, or choose freely);
  - `:478-499` (`compute_refund`: non-patient initiator means 100%);
  - `cases/router.py:198-210` (support and finance pass `PatientSideHospitalOrStaff`);
  - `backend/app/modules/payments/service.py:1868-1990` (`create_cancellation_refunds` creates refunds with `status=APPROVED`, `requested_by=None`, `:1972`).
- **Impact:** one support or finance user, alone, waives the patient's cancellation tier (50% or 0%) and releases the full escrow back to the patient. This is a collusion or kick-back path that bypasses the refund maker-checker (SEC-010/057). For bank-transfer payments the refund is booked as processed with no money trail. Hospital-initiated cancellations do the same, but only for a member of the hospital that loses the revenue.
- **Fix:**
  - When the actor is staff and the refund exceeds the patient-tier amount, create the cancellation refunds as `requested` (`requested_by = actor`), so a second finance user approves.
  - Alternatively, limit `initiated_by=platform` to admin/super_admin with a mandatory reason code.
- **Owner:** be-cases, be-payments
- **Fix applied:** `resolve_initiator` (`cases/bookings.py`) lets only admin/super_admin cancel as `platform`/`hospital` (403 `platform_cancel_admin_only`); other staff default to `patient` (refund tiers). A staff `platform`/`hospital` cancellation publishes `refund_requested_by` = the cancelling user, and `create_cancellation_refunds` (`payments/service.py`) then creates the refunds `requested` with that requester (no processing enqueued), so `approve_refund` and its second-approver rule apply. Patient, agent, hospital-member and system (unpaid expiry) cancellations are unchanged. Tests: `test_bookings_cancellation.py::test_hospital_and_platform_cancellations_refund_in_full`, `test_payments_refunds.py::test_staff_platform_cancellation_refund_needs_second_approver`.

#### SEC-060 · Medium · New, Fixed — The agent can turn its own consent attestation into the patient's "confirmation"
- **Where:**
  - `backend/app/modules/agents/consent.py:73-90`: `_latest_patient_consents` treats any account-wide `consents` row as the patient's own confirmation.
  - `backend/app/modules/cases/service.py:116-127`: `consent_share=true` writes a `SHARE_WITH_HOSPITALS` consent under `patient.user_id` whoever the actor is.
  - `backend/app/modules/screening/service.py:308-319`: `consent_ai=true` writes `AI_PROCESSING` the same way.
  - This is SEC-028 applied to the new feature.
- **Impact:** after attesting, the agent creates a case or submits a screening for the patient. The attested kinds flip from `pending_patient_confirmation` to `confirmed`, `pending_agent_consents()` returns nothing, and the patient is never asked to confirm. The consent record that is shown as the patient's own (DPDP/GDPR evidence) was produced by the agent, with the agent's IP. Before the patient activates, the agent also controls the invite mailbox if it typed its own address, so a "confirmation" by accept-invite plus `POST /auth/consents` proves control of the mailbox, not identity.
- **Fix:**
  - Write `consents` rows only when the actor is the data subject (`user.id == patient.user_id`).
  - For agents and staff, require an existing patient consent, or record an audit row "granted on behalf by <actor>" that does **not** count as confirmation.
  - Alternatively, add `granted_by_user_id` to `consents` (backend-models) and make `consent.py` count only rows with `granted_by_user_id == user_id`.
  - Flag invites accepted from the inviting agent's IP or device.
- **Owner:** be-cases, be-screening, be-messaging (agents); model column: backend-models / be-auth
- **Fix applied:** be-auth added `consents.granted_by_user_id` and `record_consent(..., granted_by_user_id=)`; `agents/consent.py` counts only self-granted rows. Call sites now pass the actor: `cases/service.py` `create_case` records `share_with_hospitals` scoped to the new case and its hospital with `granted_by_user_id` = the acting agent/staff; `screening/service.py` `submit_screening` records `ai_processing` the same way (`record_consent` stores the granter only when it is not the patient). The pre-check for an existing share consent now looks at rows for that hospital or account-wide rows. Tests: `test_cases.py::test_agent_cases_and_scoping`, `test_screening.py::test_agent_on_behalf_of_managed_patient`. Still open from the suggested fix: flagging invites accepted from the inviting agent's IP/device.

### Low

| ID | Status | Finding | Where | Fix | Owner |
|---|---|---|---|---|---|
| SEC-024 | Open | TOTP codes can be replayed within the ±1 step window (no last-used step stored, ASVS 2.8.4). `/auth/mfa/disable` failures are not counted toward lockout. | `backend/app/core/security.py:202-211`; `backend/app/modules/auth/service.py:1011-1025` | Store `mfa_last_step` and reject steps at or below it. Count invalid codes on enable and disable. | be-auth, backend-core, backend-models |
| SEC-025 | Open | No step-up re-authentication for MFA setup, enable or disable, or for setting a *first* password on password-less accounts. A stolen 15-minute token becomes permanent access. The common-password list has about 29 entries and there is no breached-password check (ASVS 2.1.7, 3.7.1). | `auth/service.py:994-1003`, `:876-881`; `core/security.py:27-59` | Require current password or fresh TOTP or Google re-auth, and revoke other sessions after MFA changes. Add a top-100k breached-password list. | be-auth, backend-core |
| SEC-026 | Open | With `REQUIRE_EMAIL_VERIFICATION=true`, register and guest-upgrade still issue working sessions to `pending_verification` users, and deps does not reject them. | `auth/service.py:434`, `:471`; `core/deps.py:67-74` | Issue no tokens, or allow only `/auth/*` verification calls, until verified. | be-auth, backend-core |
| SEC-027 | Open | A referral code silently gives the agent access to the patient's cases, screenings and documents. There is no consent row and no revoke. Agent codes can be probed through `invalid_referral_code`. The web form prefills `?ref=` without disclosure. | `auth/service.py:350-362`, `:432`; `web/apps/patient-web/src/features/auth/pages/RegisterPage.tsx:90`, `:212-213` | Explicit "share with <agency>" consent, a patient-side revoke, and referral-only agents limited to commission tracking. | be-auth, web-public |
| SEC-028 | Open | Consent capture gaps (PLAN §9.9): Google sign-up and guest upgrade write TERMS/PRIVACY consents without explicit acceptance. Agents and staff grant `ai_processing` and `share_with_hospitals` under the patient's `user_id` without recording who granted them. | `auth/service.py:668`, `:743`; `screening/service.py:308-319`; `cases/service.py:113-124` | Require `accept_terms` in those flows. Record `granted_by_user_id` (or an audit row), or require the patient's own consent for referred patients. | be-auth, be-screening, be-cases |
| SEC-029 | Open | Enumeration and email flooding: forgot-password is limited per IP only (spoofable), with no per-recipient cap. Register, guest-upgrade and agent `create_patient` return 409 `email_taken`. | `auth/router.py:271-279`; `auth/service.py:850-863`; `agents/service.py:533-534` | Per-recipient limits (for example 3/h). Accept the 409s as a documented trade-off or move to an email-first flow. | be-auth, be-messaging |
| SEC-030 | Open | PII and PHI in audit logs: before/after values of medical_history, allergies, address and phone from agent `update_patient` and `/auth/me`. Every staff role can read all audit logs and export all bookings and payments without a date range or rate limit. | `agents/service.py:627-681`; `auth/service.py:365-368`; `admin/router.py:494-515`, `:537-566` | Log changed field names only. Restrict audit logs to admin and super_admin and exports by role, with bounded ranges and rate limits. | be-messaging, be-auth, be-admin |
| SEC-031 | Partially fixed (pass 2) — WebSockets now close at token expiry (`messaging/router.py:186-205`); `sid` is still not checked | Access tokens cannot be revoked server-side (the `sid` is not checked). After logout, password reset or refresh-reuse detection, tokens stay valid for up to 15 minutes. WebSockets stay open after suspension. | `core/deps.py:62-78`; `messaging/router.py:172-197` | Check the `sid` family's `revoked_at` (cached) in `_user_from_token`. Close sockets on suspend or revoke. | backend-core, be-messaging |
| SEC-032 | Open | Raw reset, verify and invite tokens are persisted in `background_jobs.payload` (the `email.send` context), and the dev console backend prints full mail bodies. | `core/email.py:87-94`, `:124-132`; `agents/service.py:507-523` | Render the email before enqueueing and store only a job reference, or encrypt the payload. Purge finished email jobs quickly. | backend-core, be-auth, be-messaging |
| SEC-033 | Open | Reset and verify tokens stay in `?token=`. Same-origin requests send them in `Referer`, nginx logs `$http_referer`, and the URL stays in browser history. | `web/apps/patient-web/src/features/auth/pages/ResetPasswordPage.tsx:26-27`, `VerifyEmailPage.tsx:19-20`; `infra/nginx/nginx.conf:48-53` | Call `history.replaceState` after reading the token or use `#token=`; set `Referrer-Policy: no-referrer` on these pages; drop the referer from the log format. | web-public, infra-docs |
| SEC-034 | Open | `Cache-Control: no-store` is set only under `/api/v1/auth`. Authenticated PHI JSON (profile, cases, screenings, finance) can be cached by browsers and proxies (ASVS 8.2.1). | `backend/app/core/middleware.py:100`, `:117-119` | Add `no-store` to every authenticated `/api/v1/*` response. | backend-core |
| SEC-035 | Open | The upload size limit and upload rate limit run only after FastAPI has parsed and spooled the whole multipart body. Without nginx in front (dev, or the API exposed directly), the disk can be filled. | `documents/router.py:23-34` | An ASGI byte-counting limit on `/api/v1/documents` (and `/voice`), and reject missing `Content-Length` there. | be-auth, backend-core |
| SEC-036 | Open | Document `kind` is free for every role: patients can upload `invoice`, `kyc_*` or `invitation_letter`, and hospitals can plant patient-level documents. Any hospital member role, including doctor and finance, can "verify" documents, including their own uploads. | `documents/service.py:128-146`; `documents/policies.py:136-145` | Allowlist kinds per role and context. Limit verify to owner, admin and coordinator, never your own upload. Leave payment proofs to finance staff. | be-auth |
| SEC-037 | Open | Hospitals see more of a screening than needed: budget preferences (price anchoring), the AI `error` string, `report_document_ids`, and `/matches`, which reveals competing hospitals and their estimated costs. | `cases/serializers.py:346-374`; `screening/policies.py:173-180` | A reduced hospital view, and deny `/matches` to hospital users. | be-cases, be-screening |
| SEC-038 | Open | PHI can reach logs: on invalid model output, `str(ValidationError)` (with `input_value=` fragments of the model output) is written to structlog and `ai_request_logs.error`. | `screening/ai/claude.py:228-233` | Log `exc.errors(include_input=False)` (type and location only). | be-screening |
| SEC-039 | Open | Without Redis, the in-process cache is an unbounded dict keyed by every distinct public query (`/search?q=`, `/hospitals?q=`), so anonymous users can exhaust memory. | `backend/app/core/cache.py:26-64`; `catalog/router.py:107`, `:198-212` | A bounded LRU with a max size; do not cache free-text searches. | backend-core, be-catalog |
| SEC-040 | Open | A package booking can bypass an *accepted* quote. Any active package of the hospital can be booked when `procedure_id` is NULL, and the case procedure is overwritten. | `cases/bookings.py:192-210`, `:287-301` | Reject `package_id` once a quote is accepted, or require a matching procedure and mark the quote superseded. | be-cases |
| SEC-041 | Open | `meeting_url` accepts any http(s) URL from hospital members, which allows phishing and cleartext links pushed to patients. | `cases/schemas.py:343`; `cases/consultations.py:152-153` | https only, max length, an allowlist of meeting providers, or server-generated links. | be-cases |
| SEC-042 | Open | Lock-order inversion: cancel locks case → booking, while admit, complete and capture lock booking → case. Concurrent runs deadlock, causing 500s and failed webhook processing. | `cases/service.py:226-242`; `cases/bookings.py:529-617` | One global order: case first, then booking. | be-cases |
| SEC-043 | Open | Razorpay transfer `created` or `pending` is treated as PROCESSED (items PAID, ledger posted) with no later reconciliation. Payouts completed by the job have no audit row. | `settlements/providers.py:124-129`; `settlements/service.py` | Map created/pending to `processing`, then confirm by polling or a signed webhook. Audit job-completed payouts. | be-finance |
| SEC-044 | Open | Commission rates (0–10000 bps) can be changed by one user with immediate effect. Rates above about 8,470 bps make the hospital net negative and break revenue-recognition postings. | `admin/schemas.py:293`, `:332`; `settlements/service.py:242-309`; `ledger/postings.py:266-270` | A business cap (for example ≤ 3000 bps), a second approval, and validation that the net stays ≥ 0. | be-admin, be-finance |
| SEC-045 | Open | Approve sets `kyc_status=approved` without checking that any KYC documents exist or are verified. | `admin/service.py:651-675`, `:899-912` | Require the mandatory verified KYC documents and record them in the audit entry. | be-admin |
| SEC-046 | Open | Webhook hardening: every bad-signature request inserts a `webhook_events` row (DB growth). Razorpay dedupe uses the unsigned `X-Razorpay-Event-Id` header, and there is no `created_at` freshness check. | `payments/service.py:1020-1034`; `payments/gateways/razorpay.py:175-180` | Do not persist unverified requests (count or log them instead). Dedupe on signed fields and reject stale events. Add an nginx limit on the webhook path. | be-payments, infra-docs |
| SEC-047 | Open | Payments information exposure: patient receipts (payer name and email) are visible to every hospital member. Bank-proof `document_id` is shown to hospital viewers. Gateway error text is returned verbatim (`PaymentError(str(exc))`). `/verify` is not rate-limited. | `payments/invoices.py:69`; `payments/policies.py:169-173`; `payments/service.py:371-372`, `:1667-1673`; `payments/router.py:106-111` | Scope receipts to owner and finance members, return generic gateway errors, and rate-limit verify. | be-payments |
| SEC-048 | Partially fixed (pass 2) — per-user limits on messages (60/min) and new conversations (30/h) (`messaging/router.py:52-56`); the rest is open | Messaging and agents hygiene: no rate limits on conversations and messages (each support conversation notifies all support staff); invite emails to arbitrary addresses; agency name changeable after KYC (impersonation); no per-user WebSocket cap and 16 MiB frames; finance can read all clinical chats. | `messaging/router.py:66-92`, `:172-197`; `messaging/service.py:235`, `:330-341`; `agents/service.py:145-170`, `:495-534` | Per-user rate limits; re-review agency renames; cap sockets and set `--ws-max-size` to about 64 KB; least-privilege chat access for finance. | be-messaging |
| SEC-049 | Open | The bearer token is attached to *absolute* URLs passed to the API clients, so any server-provided absolute URL leaks the token to that host. | `web/packages/shared/src/api/client.ts:201-205`, `:385-386`; `mobile/lib/core/network/api_client.dart:278-286` | Attach auth only when the request origin equals the API origin. | web-foundation, flutter-foundation |
| SEC-050 | Open | Web build and UI hygiene: production source maps published (hospital-portal); agent-portal `next` filter misses `/\evil.com`; admin console renders patient uploads as same-origin `blob:` in an iframe or `window.open` without noopener; hospital-controlled image URLs (http allowed) track viewers; Playwright reports are not git- or docker-ignored; Google Fonts CDN (privacy); Google sign-in sends no `nonce`. | `web/apps/hospital-portal/vite.config.ts:24`; `web/apps/agent-portal/src/features/auth/LoginPage.tsx:20-22`; `web/apps/admin-portal/src/features/ops/components/DocumentList.tsx:145-166`, `.../finance/pages/ReconciliationPage.tsx:160-167`; `.gitignore` | `sourcemap: false` or `'hidden'`; use shared `safeNextPath`; force download or an allowlisted MIME with `noopener`; https-only or proxied images; ignore `web/e2e/playwright-report/`; self-host fonts; add a nonce. | web-hospital, web-agent, web-admin-ops, web-admin-finance, infra-docs, web-public |
| SEC-051 | Open | Mobile hardening: | `mobile/android/app/build.gradle.kts:31`; `mobile/android/app/src/main/AndroidManifest.xml`; `mobile/lib/core/config/env.dart:46-60`; `mobile/lib/core/auth/token_storage.dart:137-141`; `mobile/lib/main.dart:47` | Real release signing from `key.properties`; `allowBackup=false` (or `dataExtractionRules`); refuse non-https `API_BASE_URL` when `APP_ENV=production`; no persistent tokens on web; guard logs with `kDebugMode`; consider pinning. | flutter-foundation |
| | | • the release build is signed with the debug key | | | |
| | | • `allowBackup` is not disabled | | | |
| | | • a release build without `API_BASE_URL` defaults to `http://` | | | |
| | | • the Flutter **web** target keeps access and refresh tokens in SharedPreferences (localStorage) | | | |
| | | • `debugPrint` of uncaught errors in release | | | |
| | | • no certificate pinning | | | |
| SEC-052 | Open | Supply chain: `fastapi[standard]` pulls `fastapi-cloud-cli` (and `agent-detector`, `detect-installer`, `rignore`, `fastar`) into the production image; dev tools (pytest, mypy, ruff, respx) in the lock are installed in production; CI installs unpinned `pip install -e ".[dev]"` instead of the lock; no `pip-audit` or `npm audit` gate; `minio:latest` and `mc:latest`; actions pinned by tag, not SHA. | `backend/pyproject.toml:11`; `backend/requirements.lock.txt`; `backend/Dockerfile:32-35`; `.github/workflows/ci.yml:69-72`, `:111`; `infra/docker-compose.yml:165`, `:185` | Depend on `fastapi` + `uvicorn[standard]`; split prod and dev locks; install from the lock in CI; add audit jobs; pin images and actions by digest or SHA. | backend-core, infra-docs |
| SEC-053 | Partially fixed (pass 2) — production now requires `ADMIN_MFA_REQUIRED` (`core/config.py:235`); still open: staging hardening, webhook secrets, `TRUSTED_HOSTS=*` (`infra/docker-compose.yml:57`, `deploy/k8s/base/config.env:11`) and the MinIO root-password fallback `change-me-hex-password` (`infra/docker-compose.yml:196`, `:217`; `s3` profile only). The compose app now uses a DML-only role (`infra/postgres/init/02-roles.sh`) | Configuration hardening: the production validator does not require `ADMIN_MFA_REQUIRED=true` (now mandatory per §3.1) or webhook secrets for enabled gateways. `ENV=staging` gets no hardening (mock gateway, insecure cookies and the localhost CORS regex are allowed). `TRUSTED_HOSTS` defaults to `*`. The admin-domain IP allowlist is ineffective because `/api/` is reachable on every server block. MinIO falls back to the root password `change-me-hex-password`. | `backend/app/core/config.py:91-97`, `:176-193`, `:208-213`; `infra/nginx/templates/edge.conf.template:75-77`; `infra/docker-compose.yml:171`, `:192` | Validate prod and staging alike; set a real host allowlist; enforce staff IPs in the app (§3.1 `STAFF_ALLOWED_IPS`); use `:?` for MinIO secrets. | backend-core, infra-docs |
| SEC-054 | Open — pass 2: the DML-only app role still has `UPDATE, DELETE` on `audit_logs` (`infra/postgres/init/02-roles.sh:110`); the initial migration should `REVOKE UPDATE, DELETE ON audit_logs FROM healindia_app` | Data-at-rest integrity and disclosure: `audit_logs` is append-only only by convention (no UPDATE/DELETE trigger as the ledger has); AES-GCM field encryption has no AAD (ciphertexts can be swapped between rows) and no key-rotation path; the IntegrityError handler returns constraint names. | `backend/app/models/identity.py:118-132`; `backend/app/core/crypto.py:65-86`; `backend/app/core/errors.py:247-259` | Add an immutability trigger on `audit_logs` (or a separate DB role); bind AAD = table/column/row id and add a key id; return a generic 409. | backend-models, backend-core |
| SEC-055 | Open | MFA is enforced only for staff. Hospital owner and finance members (who control payout bank accounts) and agents (who see PHI) cannot be required to use MFA. | `auth/service.py:532` (`_check_mfa`) | Require TOTP for hospital owner and finance members and for agents (ASVS L2 high-value functions). | be-auth |
| SEC-061 | New, Fixed (portal + IP; session `sid` and close-on-suspend still open) | The WebSocket handshake checks only the JWT and the account status. It ignores `STAFF_ALLOWED_IPS`, the `portal` claim and the session `sid`, so a stolen staff token streams notifications and message events from any network until it expires. | `backend/app/modules/messaging/router.py:145-160` | Call `ensure_portal_matches` and, for staff, `staff_ip_allowed(websocket)` (both work with `HTTPConnection`); close sockets on suspend/revoke. **Applied:** `_authenticate_ws` now rejects (4401) a token whose `portal` claim does not match the role and staff connections from outside `STAFF_ALLOWED_IPS` (shared `get_client_ip`); test `test_messaging_ws.py::test_ws_enforces_portal_claim_and_staff_ips`. | be-messaging |
| SEC-062 | New, Fixed (pass 2) | nginx `/api/v1/admin/reports/export` was limited only by `api_zone`, which is keyed on the bearer-token signature. Invented tokens got a fresh bucket per request, so unauthenticated floods reached the API. | `infra/nginx/snippets/app-locations.conf:93-97` | Added the `api_ip_zone` per-IP ceiling, as on `/api/`. | infra-docs |
| SEC-063 | New, Fixed (payments and settlements) | The mark-paid checker approves whatever request is pending *at that moment*. The maker can replace it (new reference) between the checker's review and the approve call, and the approve body carries nothing to bind them. | `backend/app/modules/payments/service.py:1052-1060`, `:1091-1104`; `router.py:138-145` | Send the reviewed `requested_at` (or a request id or hash) in the approve body and return 409 on mismatch. Do not let a pending request be replaced; reject it first. **Applied (payments):** each request gets an `id` (shown in `mark_paid_request`); `POST /payments/orders/{id}/mark-paid/approve` now requires `{reference, amount_minor, request_id?}` and returns 409 `mark_paid_request_changed` when the pending request differs (test `test_payments_orders.py::test_bank_transfer_proof_and_finance_mark_paid`). The web admin client (`approveMarkPaid` sends `{}`) must send these fields. **Applied (settlements, be-finance):** each payout mark-paid request gets `paid_request_id` and each reversal request `reversal_request_id` (new `payouts` columns, shown on `PayoutOut`); `POST /finance/settlements/payouts/{id}/mark-paid/approve` requires `{request_id, reference, amount_minor}` (409 `mark_paid_request_changed`) and `…/mark-failed/approve` requires `{request_id, reference}` (409 `mark_failed_request_changed`); tests `test_settlements.py::test_manual_bank_transfer_mark_paid_and_failed` and `::test_razorpay_timeout_is_parked_never_resent`. Replacing a pending request is still allowed (a stale approval gets 409). The admin web client must send these fields. | be-payments, be-finance |

---

## 3. Verified controls (pass 1)

These controls were checked and found correct. They are recorded so regressions can be spotted in later passes.

- **JWT** (`core/security.py:167-190`): HS256 with `algorithms=[…]` pinned. `exp/iat/sub/iss/aud` are required, `type=="access"` is checked, and the role is always read from the DB (`core/deps.py:62-118`). `require_roles` always lets super_admin through.
- **Passwords:** Argon2id (pwdlib) with a dummy verify for unknown users (`core/security.py:63-79`), rehash on login, and a policy of ≥10 characters including a letter and a digit. Token compares use `hmac.compare_digest` (`core/security.py:112-117`).
- **Refresh tokens:**
  - stored as sha256, looked up `FOR UPDATE`;
  - rotation, with reuse of a rotated token revoking the whole family (audited);
  - cookie `hig_refresh` is httpOnly, Secure per `COOKIE_SECURE`, `SameSite=Strict`, `Path=/api/v1/auth`;
  - `X-Requested-With` is required for cookie refresh and logout;
  - mobile gets the token in the body only.
- **Password lifecycle:** reset and change revoke all sessions. Verify and reset tokens are 32 bytes, hashed, purpose-bound, single-use and short-lived. Links are built from settings, never from the Host header.
- **Mass assignment:** every request model reviewed uses `extra="forbid"`. Roles that may register are `patient|agent|hospital`. `PATCH /auth/me` cannot touch role, status, email or MFA. The hospital profile, agent profile and patient profile cannot set status, KYC, commission, managing agent or rating fields.
- **BOLA scoping:**
  - `cases/policies.py` (scope helpers, 404 on miss), screening, travel, payments and settlements payee scoping;
  - `X-Hospital-Id` is resolved only within the caller's memberships;
  - client-supplied child ids (quote ↔ case, package ↔ hospital, screening ↔ patient, checklist and itinerary ↔ booking) are bound to their parent.
- **Money:**
  - amounts are always derived server-side, with a currency allowlist and FX snapshot;
  - `Idempotency-Key` is unique per payer, with 409 on a body mismatch;
  - booking, order and case rows are locked; slot reservation is atomic;
  - ledger postings are positive, balanced, INR and idempotent, with accounts locked in id order;
  - DB triggers make `ledger_entries` and `ledger_transactions` immutable (`models/ledger.py:85-139`);
  - maker-checker is enforced in code and in the DB for batches created by a person.
- **Webhooks and gateway verification:**
  - signature verified over the raw body before parsing;
  - an empty secret fails closed;
  - Stripe uses a 300 s tolerance;
  - events are deduplicated with a unique key and committed before processing;
  - Razorpay client signatures are checked with `compare_digest` and the order must match the path;
  - the mock gateway is refused in production (config validator plus gateway checks).
- **Uploads:**
  - magic-byte allowlist; the client content type and extension are ignored;
  - random storage keys; `core/storage.validate_key` blocks traversal;
  - file names are sanitised;
  - `Content-Disposition` follows RFC 6266/5987 with an `attachment` disposition;
  - downloads are sent with `nosniff`, a sandbox CSP and `no-store`.
- **Injection:** no raw or f-string SQL was found; LIKE input is escaped; sort and group_by values are allowlisted. CSV exports neutralise formula injection (admin, agent and hospital portals). Email templates are autoescaped.
- **AI (Claude):** the intake is de-identified (no name, contact or passport). Patient text is wrapped as untrusted data with an explicit instruction-ignoring policy, the output is schema-constrained, and slugs are validated server-side. Consent is checked at submit and again in the job.
- **Web:**
  - the access token lives in memory only; localStorage is used for UI preferences only;
  - there is no `dangerouslySetInnerHTML` or `eval`;
  - `safeNextPath`/`safeNextUrl` are sound;
  - payment UIs never send amounts;
  - bank, passport and policy numbers are write-only and masked.
- **Mobile:**
  - tokens are in `flutter_secure_storage` on Android and iOS;
  - the release manifest sets `usesCleartextTraffic=false`;
  - there is no TLS bypass (`badCertificateCallback`);
  - `tel:` and WhatsApp links are sanitised;
  - website links are forced to http(s);
  - the WebSocket token is passed in the query string only.
- **Edge:**
  - nginx logs `$uri` (no `?token=`);
  - `/metrics` returns 404 at the edge;
  - TLS 1.2+ with `ssl_reject_handshake` for unknown SNI;
  - HSTS is set;
  - the SPA CSP has no `unsafe-inline` scripts;
  - the API image runs as a non-root user, and `.env` is excluded from the Docker context.

## 3a. Verified controls (pass 2, finished modules)

- **Payments:**
  - every capture still goes through `capture_order` with the order row locked, and is idempotent on `(gateway, gateway_payment_id)`;
  - an amount mismatch is held (`authorized`, nothing published) until finance accepts or returns it;
  - the "return" path commits a `returning` marker before the gateway call and uses an idempotent refund id;
  - bank-transfer mark-paid requires a different approver (`second_approver_required`), and the requester can only withdraw;
  - non-INR orders fail closed on missing or stale FX in production;
  - webhook signature is checked on the raw body before parsing; unverified requests never use the event id; there is a 1 MB body cap;
  - out-of-scope orders, invoices and installments return 404.
- **Agents:** consent attestations are append-only audit rows (never written to `consents` by the agent module itself); patient edits and email changes are limited to *managed* patients of an *active* agency.
- **Cases:**
  - cancellation `initiated_by` is derived from the actor; only staff may state it;
  - the refund-policy snapshot is applied;
  - emergency acknowledgement is patient or agent only, and scoped;
  - travel objects are scoped through `case_in_scope` and loaded with 404 on miss.
- **WebSocket:**
  - the token is validated (signature, `exp`, account active, not locked) before any data is sent;
  - the socket closes with 4401 at token expiry;
  - client frames are ignored except ping (≤ 1 KiB).
- **Ledger:** read endpoints are finance-only (router-level `require_roles(*FINANCE_ROLES)`); manual adjustments are maker-checker (`ledger/adjustments.py:158`).
- **Admin:** `PUT /admin/settings` splits finance keys from admin keys; super_admin accounts can be changed only by a super_admin; nobody can change their own role.
- **Infra/deploy:**
  - nginx overwrites XFF and X-Real-IP;
  - compose trusts the edge address only; k8s keeps `use-forwarded-headers: "false"`;
  - the ALB is reachable only from CloudFront with a secret header;
  - compose secrets use `:?` and the app connects as a DML-only role (`NOSUPERUSER NOBYPASSRLS`);
  - `/metrics` returns 404 at the edge.

## 4. Not covered / limitations
- No dynamic testing or fuzzing. No CVE database lookup for dependencies; the dependency notes are based on manifests.
- The `voice` module, the `docai` module (PLAN §7.1), the `website/` Next.js project, the admin-portal shell, and the §3.1 staff-door backend changes (`/auth/staff/*`, the `portal` claim, `STAFF_ALLOWED_IPS`) were not yet present or not complete. They are scheduled for pass 2.
- Tests were not reviewed for security coverage. Alembic migrations had not landed, so ledger triggers in the migration were not yet verified.

### Pass 2 limitations
- Pass 2 did not re-review auth, documents, settlements/ledger writes, docai, voice, `website/`, the web portals or mobile, because those agents were still working. Their findings keep their pass-1 status except where a pass-2 note says otherwise.
- `nginx -t` was not run (the edge config needs the container paths). The SEC-062 change repeats a directive pattern already used in the same file.

## 5. Routing list: open findings in modules still being worked on

| Owner | Finding | File:line | Suggested fix (summary) |
|---|---|---|---|
| be-auth | SEC-001 (High) | `backend/app/modules/auth/service.py:711-722` | Auto-link Google only when `email_verified_at` is already set; otherwise refuse (`account_exists_unverified`) or reset the password, MFA and sessions, then audit and notify. |
| be-auth | SEC-002 (High) | `backend/app/modules/documents/policies.py:76,81` and `:124-129` | Drop `Document.patient_id.in_(hospital_patients)`; hospital members see `hospital_id IN mine OR case_id IN cases_of(mine)` only. Add an IDOR test with two hospitals and one patient. |
| be-finance | SEC-003 (High) | `backend/app/modules/settlements/service.py:811-849`, `:870`, `:965`, `:1494-1510` | Snapshot the payout account into the batch; two-person create/verify of payout accounts; processor ≠ approver for system batches; second approver for reversals. |
| be-finance | SEC-004 (High) | `backend/app/modules/settlements/providers.py:107-123` | Retry only connect errors; on a read timeout or 5xx, look up the transfer by `notes.payout_id` or park the payout as `needs_reconciliation`. |
| be-finance | SEC-023 (Medium) | `backend/app/modules/settlements/service.py:1468-1471` | Only finance may re-activate a disabled account, or re-activation resets `is_verified`. |
| be-auth | SEC-017, SEC-024–SEC-029, SEC-055 | see the table rows | as listed |
| be-auth / backend-models | SEC-060 (model part) | `backend/app/models/identity.py` (`consents`) | Add `granted_by_user_id`; count only self-granted rows as patient confirmation. |
| web-* / flutter-* | SEC-033, SEC-049–SEC-051 | see the table rows | as listed |

Fixed by the auditor in pass 2, in finished modules only: SEC-056 (`agents/service.py`), SEC-057 (`payments/service.py`), SEC-058 (`deploy/terraform/aws/ecs.tf`, `deploy/README.md`), SEC-062 (`infra/nginx/snippets/app-locations.conf`). Tests: `tests/modules/test_agent_portal.py` (11 passed), `tests/modules/test_payments_refunds.py` + `test_payments_controls.py` (9 passed); ruff clean.
