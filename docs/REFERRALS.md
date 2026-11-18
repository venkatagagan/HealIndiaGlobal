# Patient referral programme and platform credit

"Refer a friend": every patient has a personal code; a friend who signs up with it and completes a first booking
earns credit for the referrer and/or the friend. Credit pays towards future bookings. Terms: Terms of Service
§13A (draft, legal review pending).

Code: `backend/app/modules/referrals` (`service.py`, `credits.py`, `queries.py`, `router.py`, `handlers.py`,
`tasks.py`, `privacy.py`), models `backend/app/models/referrals.py`, setting `backend/app/core/referral_settings.py`,
gateway `backend/app/modules/payments/gateways/platform_credit.py`, migration `0010b`.

## Settings

| Where | Key | Default | Meaning |
|---|---|---|---|
| env | `REFERRAL_ENABLED` | `true` | Master switch (both this and the setting must be on) |
| env | `MOBILE_APP_SCHEME` | `healindia` | Deep link in shared links: `healindia://register?ref=CODE` |
| platform setting (finance only) | `referral_programme` | see below | Business rules, edited in Admin → System settings |

`referral_programme` (strict schema, every key validated):

```json
{
  "enabled": true,
  "reward_referrer": true,
  "reward_referee": true,
  "referrer_reward": {"USD": 5000},
  "referee_reward": {"USD": 2500},
  "fallback_currency": "USD",
  "max_rewards_per_year": 10,
  "credit_validity_days": 365,
  "qualify_within_days": 365
}
```

* Amounts are minor units per currency. A patient is rewarded in their preferred currency when listed, otherwise
  in `fallback_currency` (a fixed "USD-equivalent" reward), converted to INR at the day's rate when issued.
* `max_rewards_per_year` caps the **referrer's** rewards per rolling 365 days (0 = no referrer rewards). The
  friend still gets their reward when the referrer is capped (referral `checks.referrer_reward_skipped`).
* All defaults are placeholders: **TODO-BUSINESS** (amounts, who gets credit, cap, validity).

## Flow

1. `GET /patient/referral` creates the code on first use (`R` + 9 characters from a 32-letter alphabet,
   ~3.5·10¹³ combinations) and returns share links: website `/?ref=CODE` (the website stores `?ref` from any
   page and forwards it to `/register`), patient web `/register?ref=CODE`, app `healindia://register?ref=CODE`.
   The `X-Device-Id` header (app/browser install id) is stored as a keyed hash on the code (max 10).
2. Sign-up (`POST /auth/register`, `/auth/google`, `/auth/apple`) with `referral_code` (+ optional `device_id`,
   header `X-Client-App: website|patient_web|mobile`). Agent codes keep working as before; a patient code
   creates a `referrals` row: `pending`, or `void` when the new account has the same normalised email (Gmail
   dots and `+tags` ignored), phone (last 10 digits) or device as the referrer. A referred person can only have
   one referral. Sign-up never fails because of a referral (unknown codes still return `invalid_referral_code`).
3. `booking.completed` for the referred patient: the pending referral is re-checked — expired
   (`qualify_within_days`) → `void`; a card fingerprint / UPI handle shared with the referrer's payments →
   `void (same_payment_method)` — then `qualified`, credits are issued → `rewarded`. Notifications:
   `referral.signed_up`, `referral.rewarded` / `referral.qualified` (capped), `referral.welcome_credit`
   (catalog keys `referral.notifications.*`). The referrer only ever sees the friend's first name + initial.
4. Staff (`/admin/referrals`, admin portal → Payments → Referrals) list, inspect and **void** referrals
   (admin/finance). Voiding also voids the unused part of credits from that referral; spent credit is not
   clawed back.
5. Daily jobs: `referrals.expire_credits` (unused credit past `expires_at`) and `referrals.expire_pending`.

## Credit and the ledger

Credit is held in INR minor units (ledger base currency) in `patient_credits` (`remaining_minor` is consumed
first-expiring-first) with an append-only history in `patient_credit_movements`. Accounts:

| Account | Type | |
|---|---|---|
| `PLATFORM:REFERRAL_CREDIT` | liability | credit owed to patients |
| `EXPENSE:REFERRAL_REWARDS` | expense | marketing cost of rewards |

| Event | Posting (`txn_type = referral_credit`) | Idempotency key |
|---|---|---|
| Reward issued | Dr `EXPENSE:REFERRAL_REWARDS` / Cr `PLATFORM:REFERRAL_CREDIT` | `referral_credit_grant:<credit>` |
| Credit applied to a booking | standard capture (Dr `GATEWAY:platform_credit:RECEIVABLE` / Cr escrow) + Dr `PLATFORM:REFERRAL_CREDIT` / Cr `GATEWAY:platform_credit:RECEIVABLE` | `capture:<payment>`, `referral_credit_redeem:<payment>` |
| Refund of a credit payment | standard refund + Dr receivable / Cr `PLATFORM:REFERRAL_CREDIT` (new `reinstated` credit) | `referral_credit_reinstate:<refund>` |
| Expiry / void / erasure | Dr `PLATFORM:REFERRAL_CREDIT` / Cr `EXPENSE:REFERRAL_REWARDS` | `referral_credit_expire:<credit>`, `referral_credit_void:<credit>` |

`PLATFORM:REFERRAL_CREDIT` always equals the sum of `remaining_minor` of active credits (the admin summary shows
both). Expired credit reverses the expense (breakage); finance may prefer a separate breakage-income account —
TODO-BUSINESS/CA.

### Paying with credit (design choice)

Credit is integrated into payments rather than implemented as a discount code: a discount would lower the
booking total and therefore the hospital's payout and commission base, while the hospital must be paid in full
and the platform carries the reward. Applying credit (`POST /patient/credits/apply {booking_id, purpose}`)
creates a booking payment through an **internal gateway `platform_credit`** and captures it at once through the
normal single capture path, so the booking paid amount, confirmation at deposit, escrow, revenue recognition,
settlements, receipts and refunds all work unchanged. The receivable is settled from the liability immediately,
so the T+2 sweep never moves it to the bank. The gateway is never offered at checkout
(`is_gateway_enabled('platform_credit')` is always false). The order purpose is always `booking_balance` (so a
partial credit never marks instalment 1 as paid). Limits: not for instalment-plan bookings or consultation fees;
only the patient can spend their credit (agents cannot); refunds of credit payments return credit, never cash.

Pay screens (patient web `PayPage`, mobile payment screen) call `GET /patient/credits/preview` and show "Use my
credit"; after applying, the remainder (if any) is paid with a normal gateway order.

## API

| Method | Path | Who |
|---|---|---|
| GET | `/api/v1/patient/referral` | patient (header `X-Device-Id`) |
| GET | `/api/v1/patient/credits` | patient |
| GET | `/api/v1/patient/credits/preview?booking_id=&purpose=` | patient |
| POST | `/api/v1/patient/credits/apply` | patient (20/hour) |
| GET | `/api/v1/referrals/check?code=` | public (30/min/IP), no personal data |
| GET | `/api/v1/admin/referrals`, `/summary`, `/settings`, `/{id}` | staff |
| POST | `/api/v1/admin/referrals/{id}/void` | admin, finance, super_admin |

## Privacy

Export (`GET /auth/me/export`) includes `referral_programme` (code, referrals the person is part of with the
other party by id only, credits, movements). Erasure disables the code, removes device hashes and voids unused
credit; referral and credit rows stay as financial records pointing at the anonymised patient shell. ROPA row 18.

## Business decisions needed (TODO-BUSINESS)

* Reward amounts per currency, fallback currency, and whether the referrer, the new patient or both are rewarded.
* Yearly cap, credit validity, qualification window.
* Terms §13A review (consumer law, healthcare-referral inducement rules in target countries, tax on credits).
* Accounting treatment of expired credit (expense reversal vs breakage income).
