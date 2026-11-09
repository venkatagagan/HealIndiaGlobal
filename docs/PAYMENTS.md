# Payments, Ledger & Settlements

How money moves through Heal India Global: collecting from international patients, holding it in escrow,
recognising platform revenue and taxes, and paying hospitals and agents.

* **Contract:** `docs/PLAN.md` §3 (money conventions), §4.11–4.13 (tables), §5 (enums), §6.1 (events),
  §6.3 (settings defaults), §6.4 (postings), §8.11–8.12 (endpoints). If this document and the code disagree,
  the code under `backend/app/modules/{payments,ledger,settlements}` is authoritative for implementation
  details, and PLAN is authoritative for the contract. Report any mismatch.
* **Not legal or tax advice.** The GST, TDS, RBI and FEMA notes below are orientation for engineers. Have a
  Chartered Accountant and payments/FEMA counsel review the flows before going live (see §13).

Related: [API.md](API.md) (request/response shapes), [SECURITY.md](SECURITY.md) (webhook and payment
security), [OPERATIONS.md](OPERATIONS.md) (jobs, webhook replay, failed payouts).

---

## 1. Principles

| Rule | What it means in practice |
|---|---|
| Integer minor units | Every amount is `*_minor` (BIGINT) + ISO-4217 `currency`. INR 4,40,000.00 is `44000000`. Exponents: 0 for JPY/KRW, 3 for KWD/BHD/OMR, otherwise 2 (`app.core.money.CURRENCY_EXPONENTS`). No floats anywhere. |
| Rates in basis points | `1500` = 15 %. `app.core.money.apply_bps(amount, bps)` rounds half-up. |
| Server-computed amounts | Clients never send what to charge. `POST /payments/orders` derives the amount from the booking, installment or consultation. |
| Patient currency in, INR ledger | Orders are in the patient's currency (USD by default) with an FX snapshot. The ledger, bookings priced in INR, settlements and payouts are in INR. |
| Escrow until completion | Captured money is a liability (`PLATFORM:PATIENT_ESCROW`) until the hospital marks the booking `completed`. Only then is it split into hospital payable, commission, GST and TDS. |
| Double-entry, immutable | Every posting balances, ledger rows can't be updated or deleted, and corrections are reversing transactions. The database enforces all three (§7.1). |
| Idempotent everywhere | Retries, duplicate webhooks and a client verify racing a webhook all produce exactly one payment, one posting and one settlement item (§5.3). |
| Cards never touch our servers | Card entry happens in Razorpay Checkout or Stripe Elements. The API only sees gateway ids and signatures. |

---

## 2. Gateways

| `gateway` (`PaymentGateway`) | Use | Methods / currencies | Client integration | Source of truth for "paid" |
|---|---|---|---|---|
| `razorpay` | Default for live card payments | International cards in the order currency (requires international payments to be activated on the account). UPI, netbanking and wallets work only for **INR** orders, which suits NRI patients with Indian accounts. | Web: Checkout.js. Android/iOS: `razorpay_flutter` | `POST /payments/orders/{id}/verify` (client HMAC) **and** webhooks (whichever arrives first, idempotently) |
| `stripe` | Optional second card processor | Cards through PaymentIntents | Web only: Stripe.js Payment Element. Flutter has no Stripe SDK in the dependency set. | Webhooks, or `POST /payments/orders/{id}/verify {"payment_intent_id": …}` (the server fetches the PaymentIntent) |
| `bank_transfer` | SWIFT wires (large amounts, patients without cards) and domestic NEFT/RTGS | Any currency the platform's bank account accepts | Shows beneficiary details, then the patient uploads proof | Finance calls `POST /payments/orders/{id}/mark-paid` after matching the bank credit |
| `mock` | Local development, tests, demos | Anything | `POST /payments/mock/{order_id}/complete` | The mock endpoint runs the same capture path as a webhook |

Configuration (`backend/.env`, see `app/core/config.py`):

| Setting | Default | Notes |
|---|---|---|
| `PAYMENT_GATEWAYS_ENABLED` | `mock,bank_transfer` | Only listed gateways are offered. **With `ENV=production` the app refuses to start if `mock` is listed** (settings validation). |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | empty | `key_id` is public (sent to clients in `CheckoutOut.razorpay.key_id`). `key_secret` is server-only. |
| `RAZORPAY_WEBHOOK_SECRET` | empty | Set per webhook in the Razorpay Dashboard. It is different from the key secret. |
| `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` / `STRIPE_WEBHOOK_SECRET` | empty | The publishable key goes to the client. The `whsec_…` secret belongs to one webhook endpoint. |
| `BASE_CURRENCY` / `DEFAULT_PATIENT_CURRENCY` | `INR` / `USD` | Don't change `BASE_CURRENCY`; the ledger assumes INR. |
| platform setting `bank_transfer_details` | placeholder bank data | **Finance-only key** (`PUT /admin/settings/bank_transfer_details`). Replace the example values before go-live. |
| platform setting `supported_currencies` | USD, EUR, GBP, AED, SAR, INR, NGN, KES, BDT, AUD, CAD, OMR, QAR, KWD | Confirm each currency is enabled on the gateway account (§12). |

Each gateway adapter implements `PaymentGateway` (`create_order`, `verify_client_signature`, `verify_webhook`,
`parse_webhook`, `fetch_payment`, `refund`) in `app/modules/payments/gateways/{razorpay,stripe,bank_transfer,mock}.py`.
Adapters use `httpx.AsyncClient` against Razorpay REST (`https://api.razorpay.com/v1`, basic auth
`key_id:key_secret`) and Stripe REST (`https://api.stripe.com/v1`, PaymentIntents).

---

## 3. Orders, payments and their lifecycle

### 3.1 What an order charges (`PaymentPurpose`)

| `purpose` | Amount (computed on the server, in the booking/consultation currency, then converted) | Linked by |
|---|---|---|
| `booking_deposit` | `bookings.deposit_minor` (= `total_minor × deposit_pct`, default 20 %) | `booking_id` |
| `booking_balance` | Outstanding balance (`total_minor − amount_paid_minor`, net of refunds as implemented) | `booking_id` |
| `booking_full` | `bookings.total_minor` | `booking_id` |
| `installment` | `installments.amount_minor` | `booking_id`, `installment_id` |
| `consultation_fee` | `consultations.fee_minor` | `consultation_id` |
| `service` | Travel or stay service price | `case_id` (PLAN defines no recognition rule; see §14) |

### 3.2 Statuses

```
payment_orders.status (OrderStatus)
  created ──► pending ──► paid ──► partially_refunded ──► refunded
                 │
                 ├──► failed      (gateway reported failure; the patient can start a new order)
                 ├──► expired     (expires_at passed without payment; expiry job)
                 └──► cancelled

payments.status (PaymentStatus)
  created ──► authorized ──► captured ──► partially_refunded ──► refunded
                  └──► failed
```

* An order has at most one successful payment. Failed attempts on the same gateway order can create
  `failed` payment rows.
* An order moves `created → pending` when the gateway reports a non-final state on verify, or when a
  bank-transfer proof is submitted.
* **Expiry** (`app/modules/payments/service.py`): `expires_at` = creation + **30 minutes** for card and mock
  orders, + **7 days** for `bank_transfer` (wires take 1–5 business days). The periodic job
  `payments.expire_orders` runs every 5 minutes and moves **`created`** orders past `expires_at` to `expired`.
  `pending` orders aren't auto-expired.
* **Late captures are still accepted.** If the gateway captures, or finance reconciles, after the order was
  `expired`, `failed` or `cancelled`, the capture path still records the payment, so the money is never lost.
  Watch for this in reconciliation (§11).
* Expired or failed orders are never re-priced. Create a new order, which takes a fresh FX snapshot.

### 3.3 Applying a capture: one idempotent path

Client verify, webhook, mock completion, an approved bank-transfer `mark-paid` (§4.4) and an accepted
amount review all end in the same routine,
`app.modules.payments.service.capture_order`:

1. `SELECT … FOR UPDATE` the `payment_orders` row. If a payment with the same `(gateway, gateway_payment_id)`
   is already captured, return it unchanged.
2. The payment comes from a verified webhook or is fetched from the gateway (verify path), never from the
   client. Checks:
   * The payment must belong to this order (`order_mismatch`).
   * Its currency must equal the order currency, otherwise 402 `currency_mismatch`.
   * If the captured **amount** differs from `amount_minor`, the payment is **held for finance review**: it
     is recorded as `authorized`, the order stays `pending` with `meta.amount_review_pending`, nothing is
     posted and `payments.amount_review_required` is logged. Finance decides with
     `POST /payments/orders/{id}/amount-review {payment_id, decision: "accept" | "return", note}`: `accept`
     runs this capture path with the received amount (proportionally scaled `base_amount_minor`; an
     over-payment can then be partially refunded); `return` refunds the full received amount at the gateway
     (the payment becomes `failed`, the books are untouched, an open order becomes `failed`).
   * Bank-transfer `mark-paid` is stricter and requires the exact order amount (§4.4).
3. Insert into `payments` (`UNIQUE(gateway, gateway_payment_id)` absorbs duplicates). Set `captured_at`,
   `base_amount_minor` (INR at the order's snapshot), and `fee_minor` / `tax_on_fee_minor` when the gateway
   reports them.
4. Mark the order `paid` (`paid_at`). If installment-linked, mark the installment `paid`. A deposit capture
   also marks installment #1 paid. Create the receipt invoice and enqueue `payments.render_invoice`.
5. `publish(db, "payment.captured", {...})` in the same transaction. The subscribers:
   * **cases:** `bookings.amount_paid_minor += …`. The first captured payment of at least `deposit_minor`
     moves the booking `pending_payment → confirmed` and the case to `booked`, then emits
     `booking.confirmed` (checklist).
   * **ledger:** posts the capture and gateway fee (§7.3 rules 1–2). For a booking that is already
     completed, it also posts an incremental revenue recognition.
   * **settlements:** for an already-completed booking (a late installment), creates the incremental
     settlement items.
   * **messaging:** sends notifications and the receipt email (enqueued).
6. Commit. Each layer is guarded by a unique key, so the second arrival is a no-op.

---

## 4. Checkout flows per client

### 4.1 Web: Razorpay Checkout.js

```
Browser                         API                                 Razorpay
  │ POST /payments/orders        │                                     │
  │  Idempotency-Key: <uuid>     │── create_order (amount, currency) ──►│
  │◄─ CheckoutOut{order,razorpay}│◄──────────── order_id ──────────────│
  │ new Razorpay({...}).open()  ─┼────────── card entry (iframe) ──────►│
  │◄──────────── handler({razorpay_payment_id, razorpay_order_id, razorpay_signature})
  │ POST /payments/orders/{id}/verify ──► HMAC check, fetch payment,   │
  │                              │        capture (idempotent) ────────►│
  │◄─ PaymentOrderOut(status=paid)│◄── webhook payment.captured/order.paid (deduplicated)
```

```ts
// patient-web / agent-portal (illustrative; use the shared API client)
const checkout = await api.post('/payments/orders',
  { booking_id, purpose: 'booking_deposit', gateway: 'razorpay', currency: 'USD' },
  { headers: { 'Idempotency-Key': crypto.randomUUID() } });   // one key per checkout attempt
const r = checkout.razorpay!;
const rzp = new (window as any).Razorpay({
  key: r.key_id, order_id: r.order_id, amount: r.amount, currency: r.currency,
  name: r.name, description: r.description, prefill: r.prefill,
  handler: async (resp: any) => {
    await api.post(`/payments/orders/${checkout.order.id}/verify`, {
      razorpay_payment_id: resp.razorpay_payment_id,
      razorpay_order_id: resp.razorpay_order_id,
      razorpay_signature: resp.razorpay_signature,
    });
  },
  modal: { ondismiss: () => { /* order stays open until it expires; offer "try again" */ } },
});
rzp.on('payment.failed', (e: any) => { /* show e.error.description; the server decides final state */ });
rzp.open();
```

* Load `https://checkout.razorpay.com/v1/checkout.js` once. The SPA CSP (`infra/nginx/snippets/csp-spa.conf`)
  already allows `checkout.razorpay.com` and `api.razorpay.com`.
* The client never marks anything paid. If the tab closes before `verify`, the webhook completes the order.
  The UI can poll `GET /payments/orders/{id}`.
* Retrying `POST /payments/orders` with the **same** `Idempotency-Key` returns the same order. A new attempt
  (for example after the previous order expired) uses a new key.

### 4.2 Flutter: `razorpay_flutter` (Android/iOS)

```dart
// mobile/lib/features/booking (illustrative)
final razorpay = Razorpay();
razorpay.on(Razorpay.EVENT_PAYMENT_SUCCESS, (PaymentSuccessResponse r) async {
  await paymentRepository.verify(orderId,
      razorpayPaymentId: r.paymentId!, razorpayOrderId: r.orderId!, razorpaySignature: r.signature!);
});
razorpay.on(Razorpay.EVENT_PAYMENT_ERROR, (PaymentFailureResponse r) { /* show r.message */ });
razorpay.on(Razorpay.EVENT_EXTERNAL_WALLET, (ExternalWalletResponse r) { /* informational */ });
razorpay.open({
  'key': checkout.razorpay.keyId, 'order_id': checkout.razorpay.orderId,
  'amount': checkout.razorpay.amount, 'currency': checkout.razorpay.currency,
  'name': checkout.razorpay.name, 'description': checkout.razorpay.description,
  'prefill': {'contact': prefill.contact, 'email': prefill.email},
});
// dispose(): razorpay.clear();
```

* A biometric confirmation (`local_auth`) runs before the order is created. It's a UX safeguard against
  accidental taps, not an authentication factor.
* `razorpay_flutter` exists only on Android and iOS. Other Flutter targets get the `mock` gateway in
  development, and `mock` is refused in production, so those targets have no card checkout in production.
* The app sends `X-Client-Type: mobile` like every other mobile request. The verify payload is identical to
  the web one.

### 4.3 Web: Stripe (optional)

`CheckoutOut.stripe = {publishable_key, client_secret}` → mount the Payment Element → `stripe.confirmPayment(...)`.
The `payment_intent.succeeded` webhook marks the order paid. The client can also call
`POST /payments/orders/{id}/verify {"payment_intent_id": "pi_…"}`, and the server then fetches the
PaymentIntent from Stripe; otherwise it polls `GET /payments/orders/{id}`. The SPA CSP allows `js.stripe.com`
and `hooks.stripe.com`. See §13.3 for Stripe availability to Indian entities.

### 4.4 Bank transfer (SWIFT / NEFT / RTGS) and finance reconciliation

1. `POST /payments/orders` with `gateway: "bank_transfer"` returns
   `CheckoutOut.bank_transfer = {beneficiary_name, bank_name, account_number, ifsc, swift, iban, reference}`.
   `reference` identifies the order (the order number). The patient must quote it in the wire's remittance
   information.
2. The UI tells the patient to wire **exactly** `amount_minor` `currency` and to choose charges **"OUR"**
   (sender pays all bank fees). With "SHA" or "BEN", intermediary banks deduct fees and the credit arrives
   short.
3. The patient uploads the bank's confirmation (MT103 or a receipt) with `POST /documents` (multipart,
   `kind=payment_proof`), then calls `POST /payments/orders/{id}/bank-transfer-proof {document_id, reference}`.
4. Finance (Admin portal → Finance → Bank-transfer reconciliation) checks against the bank statement or
   e-FIRA/FIRC: the remitter matches the patient or payer, the reference matches the order, the amount and
   currency match, and the credit is final (not provisional).
5. **Maker-checker.** Finance calls `POST /payments/orders/{id}/mark-paid {reference, amount_minor}`
   (role F), with `amount_minor` in the **order currency**. This only records an audited request
   (`order.meta.mark_paid_request`; a new request replaces a pending one). A **different** finance user then
   calls `POST /payments/orders/{id}/mark-paid/approve`, which runs the §3.3 capture path with
   `method=bank_transfer` (the requester gets 403 `second_approver_required`), or
   `POST …/mark-paid/reject {reason}`. The rules:
   * The amount must **equal** the order amount, otherwise 400 `amount_mismatch` with
     `details.expected_minor`.
   * An order that is already paid returns 409 `already_paid`.
   * Expired, failed or cancelled bank-transfer orders can still be marked paid (late wires).
   * Proof can only be submitted while the order is open (`created`/`pending`), otherwise 400
     `order_not_open`. The proof document must belong to the payer or the patient.
6. **Short credit** (fees deducted along the way): the exact-amount rule blocks marking it paid. Ask the
   patient to top up through a new order for the difference. Combining the two receipts is a manual finance
   decision (§14).
7. **FX difference:** the bank converts the foreign currency to INR at its own rate when it credits the
   account. The ledger records `base_amount_minor` from the order's snapshot. The difference shows up in bank
   reconciliation (§11) and is booked as an `fx_difference` adjustment (§7.4).

### 4.5 Mock (development only)

`CheckoutOut.mock = {complete_url}`. `POST /payments/mock/{order_id}/complete {"outcome": "success"|"failure"}`
by the order owner simulates the webhook path, so ledger postings, booking confirmation and notifications run
exactly as they would with a real gateway. Refused when `ENV=production`.

---

## 5. Webhooks: signature verification and idempotency

### 5.1 Endpoints

| Endpoint | Signature | Event id |
|---|---|---|
| `POST /api/v1/payments/webhooks/razorpay` | `X-Razorpay-Signature` = hex HMAC-SHA256 of the **raw request body** keyed with `RAZORPAY_WEBHOOK_SECRET` | `x-razorpay-event-id` request header |
| `POST /api/v1/payments/webhooks/stripe` | `Stripe-Signature: t=<unix>,v1=<hex>[,v1=…]`. Signed payload is `"<t>.<raw body>"` with HMAC-SHA256 and `STRIPE_WEBHOOK_SECRET`. **Reject if \|now − t\| > 300 s** and accept if any `v1` matches (Stripe sends several while a secret is being rolled). | `id` (`evt_…`) in the JSON body |

### 5.2 Processing contract (PLAN §9.4)

As implemented in `app.modules.payments.service.handle_webhook`:

1. A gateway that isn't enabled returns 404. A missing webhook secret returns 400 `webhook_not_configured`.
   A body over 1 MB returns 400.
2. **Verify the signature over the raw bytes before parsing JSON**, in constant time
   (`hmac.compare_digest`). If it's invalid, a forensic row is stored: `event_id = "invalid:<uuid>"`,
   `event_type = "unverified"`, `signature_valid = false`, payload = only `{sha256, size}` of the body. The
   response is 400 `invalid_signature`. The row is never processed, and it is never keyed on the unverified
   event id, so a forged event can't block the real one.
3. Insert into `webhook_events (gateway, event_id, event_type, signature_valid=true, payload, received_at)`
   with `ON CONFLICT (gateway, event_id) DO NOTHING`, then **commit before processing or responding**.
   Stored payloads are scrubbed of payer PII (`email`, `contact`, `card`, `vpa`, `bank_account`,
   `billing_details`, `shipping`, `receipt_email`, `customer_details`, `payment_method_details`,
   `client_secret`).
4. A duplicate delivery returns 2xx `{"status": "duplicate"}` and is not reprocessed.
5. Processing runs inline and sets `processed_at`. If it raises, `processing_error` is recorded, the job
   `payments.process_webhook` is enqueued (`dedupe_key = "wh:<webhook_event_id>"`, retried with backoff),
   and the response is still 2xx `{"status": "error"}`, so the gateway doesn't hammer the endpoint. A
   verified event for an unknown order or refund gets `processed_at` **and** `processing_error` and isn't
   retried. Find these with the queries in §11 and OPERATIONS.md → *Webhook replay*.

Events the adapters act on. Everything else is stored and acknowledged as "ignored".

| Gateway | Events | Effect |
|---|---|---|
| Razorpay | `payment.captured`, `order.paid` | Capture path (§3.3) |
| Razorpay | `payment.authorized` | Captured through the API, then the capture path (idempotent) |
| Razorpay | `payment.failed` | Order `failed`, `payment.failed` event |
| Razorpay | `refund.processed`, `refund.failed` | Refund `processed` (`refund.processed` event) or `failed` |
| Stripe | `payment_intent.succeeded` | Capture path |
| Stripe | `payment_intent.payment_failed` | Order `failed` |
| Stripe | `refund.created`, `refund.updated`, `charge.refund.updated` | Refund status (`processed` / `failed`) |
| Both | Disputes and chargebacks (`payment.dispute.*`, `charge.dispute.*`) | **Ignored today.** Subscribe anyway, so they're stored, and route gateway dispute emails to finance (§14). |

Razorpay Route transfers are created synchronously by the payout job (§8.4), so no transfer webhook is
needed.

### 5.3 Idempotency layers

| Layer | Key | Guarantee |
|---|---|---|
| Order creation | `UNIQUE(payer_user_id, idempotency_key)` from the `Idempotency-Key` header | A retried `POST /payments/orders` returns the same order |
| Gateway order | `UNIQUE(gateway, gateway_order_id)` | One local order per gateway order |
| Webhook delivery | `UNIQUE(gateway, event_id)` | Each event is stored once |
| Payment | `UNIQUE(gateway, gateway_payment_id)` | Verify, webhook and replay yield one `payments` row |
| Row locks | `SELECT … FOR UPDATE` on order and booking | Concurrent verify and webhook are serialised |
| Ledger | `ledger_transactions.idempotency_key` UNIQUE | Each posting happens once. `post_transaction` returns the existing transaction for a repeated key. |
| Jobs | `background_jobs.dedupe_key` (partial unique while `queued`/`running`) | No duplicate pending work |

Ledger idempotency keys (`app/modules/ledger/postings.py`) are deterministic: `capture:<payment_id>`,
`gateway_fee:<payment_id>`, `sweep:<payment_id>`, `recognize:<booking_id>:<n>`,
`agent_commission:<booking_id>:<n>`, `reverse:<refund_id>`, `agent_commission_reversal:<refund_id>`,
`refund:<refund_id>`, `payout:<payout_id>`, `payout_reversal:<payout_id>`.

### 5.4 Client-side signature (Razorpay verify)

`expected = HMAC_SHA256(key = RAZORPAY_KEY_SECRET, msg = razorpay_order_id + "|" + razorpay_payment_id)` as
hex, compared in constant time with `razorpay_signature`. A bad signature returns 400 `invalid_signature`
and is audited (`payment.verify_failed`). The server also:

1. checks that `razorpay_order_id` equals the order's `gateway_order_id`;
2. calls `fetch_payment` and checks the payment's own order id;
3. captures the payment through the API if it is only `authorized`;
4. hands it to the capture path (§3.3), where the currency must match and amount differences are logged.

A valid signature alone proves only that the payment id belongs to the order.

---

## 6. FX snapshot rules

**Rates.** The `fx_rates` table (`base_currency` INR, `quote_currency`, `rate` = **INR per 1 unit** of the
quote currency, `source`, `as_of`) is managed with `/admin/fx-rates` (AD). `app.core.money.get_fx_rate()`
reads it. Orders in a foreign currency need a DB rate no older than `fx_rate_max_age_hours` (default 72;
0 disables the age check). **In production a missing or stale rate fails closed** with 503
`fx_rate_unavailable`; elsewhere the code falls back to the illustrative `DEFAULT_FX_RATES` (USD 88, EUR 95,
GBP 110, AED 24, …) and logs an alert. Keep a current rate for every currency in `supported_currencies`.

**At order creation** (`POST /payments/orders`):

1. `base_amount_minor` (INR) is the amount due, computed from the booking, installment or consultation.
2. `currency` is the requested currency, or else the patient's `preferred_currency` (default `USD`). It must
   be in `supported_currencies` and enabled on the chosen gateway.
3. `fx_rate` is the INR-per-unit snapshot for that currency (`NUMERIC(18,8)`), the same convention as
   `fx_rates` and `app.core.money.to_base()`. *Caution:* `app.core.money.convert()` returns "units of
   `to_ccy` per 1 unit of `from_ccy`", so don't store its second return value as the order's `fx_rate`
   without inverting it.
4. `amount_minor = round_half_up(base_amount_minor × 10^exp(ccy) / (100 × fx_rate))`, using
   `app.core.money.convert_minor`.

| Example | Base (INR) | Rate | Order amount |
|---|---|---|---|
| Deposit, USD | 88,000.00 (`8800000`) | 88.00000000 | USD 1,000.00 (`100000`) |
| Balance, USD | 3,52,000.00 (`35200000`) | 88.50000000 | USD 3,977.40 (`397740`) |
| Deposit, KWD (exponent 3) | 88,000.00 | 287.00000000 | KWD 306.620 (`306620`) |

**Rules**

* The INR amount is fixed and the patient-currency amount floats. Every order (each installment, the balance)
  takes its own snapshot. The booking and ledger are credited with `base_amount_minor`, whatever the rate.
* A snapshot never changes after creation. To re-price, let the order expire and create a new one.
* Refunds use the **original payment's** snapshot. The INR `refunds.base_amount_minor` maps to the
  payment-currency `refunds.amount_minor` at that rate, so the patient gets back the same proportion of what
  they paid.
* The gateway settles in INR at **its own** conversion rate, so the INR that actually arrives differs from the
  snapshot. That difference appears in reconciliation (§11) and is booked to `PLATFORM:FX_GAIN_LOSS` with
  an `fx_difference` adjustment (§7.4).
* Razorpay and Stripe expect 3-decimal currencies (KWD, BHD, OMR) as amounts whose last digit is 0. The
  service rounds those orders to the nearest 10 minor units (minimum 10) for both gateways.
* An unsupported or unknown currency returns 400 `unsupported_currency`. A zero amount due returns 400
  `nothing_due`.
* Price bookings in INR (PLAN: "usually INR"). If a hospital quotes in another currency, the INR credited to
  the hospital moves with FX on every order.

---

## 7. The double-entry ledger

### 7.1 Database guarantees (`app/models/ledger.py`, also installed by the Alembic migration)

* `ledger_entries.amount_minor > 0` (CHECK). `direction` is `debit` or `credit`, and `currency` is INR.
  Zero-amount legs are omitted, never posted.
* A deferrable constraint trigger `ledger_entries_balanced` checks Σdebit = Σcredit for every transaction
  touched, **at COMMIT** (SQLSTATE 23514).
* Triggers `ledger_entries_immutable` / `ledger_transactions_immutable` reject UPDATE and DELETE
  (SQLSTATE 23001: "rows are immutable … post a reversing transaction").
* `app.modules.ledger.service.post_transaction(...)` validates balance, is idempotent on `idempotency_key`,
  locks the affected `ledger_accounts` rows **in id order** (no deadlocks), and updates the cached
  `balance_minor`.
* Sign convention for `balance_minor`: positive means the account's normal side. Assets and expenses are
  debit-positive; liabilities, revenue and equity are credit-positive. A negative balance means the account
  has flipped sides (for example a hospital that owes a clawback).
* Trial balance: Σ(asset + expense balances) − Σ(liability + revenue + equity balances) = 0
  (`GET /finance/ledger/trial-balance`).

### 7.2 Chart of accounts

Accounts are created on first use by `get_or_create_account(db, code)`, which derives type and owner from the
code.

| Code | Type (`LedgerAccountType`) | Normal balance | Owner (`LedgerOwnerType`) | Meaning |
|---|---|---|---|---|
| `GATEWAY:{gateway}:RECEIVABLE` | asset | debit | gateway | Captured money the gateway still owes us (net of its fees and refunds). A negative balance means we owe the gateway, for example a refund issued after settlement. |
| `PLATFORM:BANK` | asset | debit | platform | The platform's bank account(s) |
| `PLATFORM:PATIENT_ESCROW` | liability | credit | platform | Money held for undelivered bookings and services |
| `HOSPITAL:{hospital_id}:PAYABLE` | liability | credit | hospital | Owed to a hospital (net of commission, GST and TDS) |
| `AGENT:{agent_id}:PAYABLE` | liability | credit | agent | Agent commission owed |
| `VENDOR:{id}:PAYABLE` | liability | credit | vendor | Travel and stay vendors (defined but not used by any PLAN posting; see §14) |
| `TAX:GST_OUTPUT` | liability | credit | tax | GST charged on platform commission, due to the government |
| `TAX:TDS_194O` | liability | credit | tax | TDS withheld from hospitals (e-commerce operator), due to the government |
| `PLATFORM:COMMISSION_REVENUE` | revenue | credit | platform | Platform commission (excluding GST) |
| `PLATFORM:SERVICE_FEE_REVENUE` | revenue | credit | platform | Patient service fee (default 0 bps) |
| `EXPENSE:GATEWAY_FEES` | expense | debit | platform | Gateway fees (all-in amount as reported by the gateway) |
| `EXPENSE:AGENT_COMMISSION` | expense | debit | platform | Agent commission (paid out of platform commission) |
| `PLATFORM:EQUITY` | equity | credit | platform | Implementation account (not in PLAN). Owner's capital: capital injected into or withdrawn from `PLATFORM:BANK`. Posted only by a `manual` adjustment (§7.4), never automatically. |
| `PLATFORM:ADJUSTMENTS` | expense | debit | platform | Implementation account (not in PLAN). Manual corrections and bank charges with no better home (for example a bank charge: Dr `PLATFORM:ADJUSTMENTS` / Cr `PLATFORM:BANK`). Posted only by a `manual` adjustment (§7.4). |
| `PLATFORM:FX_GAIN_LOSS` | expense | debit | platform | Implementation account. Realised FX differences: a debit balance is a net loss, a credit (negative) balance a net gain. Posted by `fx_difference` adjustments (§7.4). |
| `PLATFORM:CANCELLATION_REVENUE` | revenue | credit | platform | Implementation account. The platform's share of amounts retained on cancellation (§9.2). |
| `TAX:TDS_194H` | liability | credit | tax | Implementation account. TDS withheld from resident agents' commission (s.194H of the 1961 Act numbering), due to the government |
| `TAX:TDS_195` | liability | credit | tax | Implementation account. Withholding on commission paid to non-resident agents (rate set by finance per CA/DTAA advice) |

### 7.3 Posting rules (PLAN §6.4)

Definitions for a booking: **P** = captured − refunded (INR) at completion, **H** = P − service fees,
**C** = `apply_bps(H, commission_bps)`, **G** = `apply_bps(C, gst_rate_bps)`,
**T** = `apply_bps(H, tds_194o_rate_bps)`, **N** = H − C − G − T (computed as the remainder so the
transaction always balances), **K** = `min(apply_bps(H, agent_bps), C)` (capped at the commission). All
rounding is half-up.

`commission_bps` comes from `resolve_commission_bps(db, hospital_id=, procedure_id=, specialty_id=)` (most
active value wins, see the precedence table below; default `default_commission_bps`=1500). `agent_bps`
comes from `resolve_agent_commission_bps(db, agent_id)` (default `default_agent_commission_bps`=500).
Agent withholding **W** = `apply_bps(K, agent_tds_bps)`: resident agents (`agents.country` IN or empty) use
`agent_tds_rate_bps` (default 200 = 2 %, s.194H) into `TAX:TDS_194H`; non-resident agents use
`agent_nonresident_withholding_bps` (default 0; set per CA/DTAA advice) into `TAX:TDS_195`. The agent payable
is K − W. These settings (and `cancellation_retention_hospital_share_bps`, `platform_gstin`,
`platform_gst_state`) are finance keys in `app/core/settings_store.py` DEFAULTS (not in PLAN §6.3), changed by
finance through the admin settings API.

**Commission precedence (tested in `test_commission_rule_precedence`).** Only rules active on the effective
date (booking completion date) count; ties go to the latest `effective_from`, then the newest rule.

| Rank | Platform commission (`resolve_commission_bps`) | Agent commission (`resolve_agent_commission_bps`) |
|---|---|---|
| 1 | `commission_rules` with hospital + procedure | `commission_rules` scope `agent` with this `agent_id` |
| 2 | rule with hospital + specialty | `agents.commission_rate_bps` |
| 3 | rule with hospital only | generic `agent` rule (no `agent_id`) |
| 4 | **`hospitals.commission_rate_bps`** (the hospital's contracted default) | setting `default_agent_commission_bps` |
| 5 | rule with procedure only | |
| 6 | rule with specialty only (derived from the procedure when not given) | |
| 7 | `global` rule | |
| 8 | setting `default_commission_bps` | |

So the hospital column overrides every catalogue-wide rule but any hospital-specific rule overrides the
column (use a hospital rule with dates to schedule a rate change). `GET /finance/commission-rules/resolve`
shows the effective rates.

| # | Trigger | `txn_type` | Debit | Credit |
|---|---|---|---|---|
| 1 | `payment.captured` (base amount A) | `payment_captured` | `GATEWAY:{gw}:RECEIVABLE` A | `PLATFORM:PATIENT_ESCROW` A |
| 2 | Gateway fee F known | `gateway_fee` | `EXPENSE:GATEWAY_FEES` F | `GATEWAY:{gw}:RECEIVABLE` F |
| 3 | `booking.completed` | `revenue_recognition` | `PLATFORM:PATIENT_ESCROW` P | `HOSPITAL:{id}:PAYABLE` N, `PLATFORM:COMMISSION_REVENUE` C, `TAX:GST_OUTPUT` G, `TAX:TDS_194O` T, `PLATFORM:SERVICE_FEE_REVENUE` P−H |
| 4 | `booking.completed`, case has an agent | `agent_commission` | `EXPENSE:AGENT_COMMISSION` K | `AGENT:{id}:PAYABLE` K − W, `TAX:TDS_194H` or `TAX:TDS_195` W |
| 5 | `refund.processed` (R) | `refund` | `PLATFORM:PATIENT_ESCROW` R | `GATEWAY:{gw}:RECEIVABLE` R |
| 6 | `refund.processed` after completion: reversal first | `refund` (row 3) and `agent_commission` (row 4) | Proportional reversal of rows 3–4 for the part of R not covered by money still held in escrow, then row 5 | |
| 7 | `payout.processed` (X) | `payout` | `HOSPITAL:{id}:PAYABLE` (or `AGENT:{id}:PAYABLE`) X | `PLATFORM:BANK` X |
| 7r | `payout.failed` after the payout was posted (bounced) | `payout` | `PLATFORM:BANK` X | payee `PAYABLE` X |
| 8 | Daily sweep `ledger.sweep_gateway_settlements` | `adjustment` | `PLATFORM:BANK` S | `GATEWAY:{gw}:RECEIVABLE` S |
| 9 | Hourly `settlements.recognize_cancellation_retention`: booking `cancelled`, admission date reached, no open refund (§9.2) | `cancellation_retention` | `PLATFORM:PATIENT_ESCROW` R | `HOSPITAL:{id}:PAYABLE` N, `PLATFORM:COMMISSION_REVENUE` C, `TAX:GST_OUTPUT` G, `TAX:TDS_194O` T (on the hospital share treated as H), `PLATFORM:CANCELLATION_REVENUE` R − hospital share |
| 10 | Approved finance adjustment (§7.4) | `tax_remittance` / `fx_difference` / `adjustment` | as requested | as requested |

Implementation notes (`app/modules/ledger/postings.py`):

* **Recognition releases exactly the booking's escrow balance:** captures − refunds − earlier recognitions.
  Recognitions are numbered (`recognize:<booking>:<n>`). A capture after completion (a late installment)
  triggers recognition #n+1 and matching settlement items. If nothing is held, nothing is posted.
* The service-fee share of P is pro rata (`service_fee_minor / total_minor`). With the default fee of 0 bps,
  H = P.
* **Sweep amount S, per payment:** that payment's remaining receivable (capture − fee − refunds posted so far).
  It is swept once (`sweep:<payment_id>`) when `captured_at` ≤ now − 2 days, or **immediately for
  `bank_transfer`** (the money is already in the bank), looking back 90 days. A refund posted *after* the sweep
  leaves the receivable negative. Reconcile it against the gateway settlement that nets the refund (§11).

### 7.4 Finance adjustments (tax remittance, FX differences, manual corrections)

Postings that no event produces are requested and approved through the API (role F; every step audited as
`ledger_adjustment.*`; table `ledger_adjustments`, an implementation table not in PLAN):

1. `POST /finance/ledger/adjustments {kind, description, external_reference?, entries: [{account_code,
   direction, amount_minor}]}` validates the entries (positive INR amounts, Σdebit = Σcredit, known account
   codes) and stores a `pending_approval` request. Nothing is posted.
2. A **different** finance user calls `POST /finance/ledger/adjustments/{id}/approve` (the requester gets 403
   `maker_checker`). The transaction is posted once (`adjustment:<id>`, `reference_type =
   "ledger_adjustment"`, `created_by` = approver) and the request becomes `posted`. Anyone in finance can
   `POST …/reject {reason}` a pending request. `GET /finance/ledger/adjustments?status=&kind=` lists them.

| `kind` | `txn_type` | Rule (400 `invalid_adjustment` otherwise) | Example |
|---|---|---|---|
| `tax_remittance` | `tax_remittance` | debit only `TAX:*`, credit only `PLATFORM:BANK` | S8: Dr `TAX:GST_OUTPUT`, Dr `TAX:TDS_194O`, Dr `TAX:TDS_194H` / Cr `PLATFORM:BANK` (challan number in `external_reference`) |
| `fx_difference` | `fx_difference` | must use `PLATFORM:FX_GAIN_LOSS` | Wire credited INR 1,250 short of the snapshot: Dr `PLATFORM:FX_GAIN_LOSS` / Cr `PLATFORM:PATIENT_ESCROW` (or the receivable / bank leg that differs) |
| `manual` | `adjustment` | must use `PLATFORM:ADJUSTMENTS` or `PLATFORM:EQUITY` | Bank charges: Dr `PLATFORM:ADJUSTMENTS` / Cr `PLATFORM:BANK`; capital: Dr `PLATFORM:BANK` / Cr `PLATFORM:EQUITY` |

Payee payables (`HOSPITAL:/AGENT:/VENDOR:…:PAYABLE`) can never be adjusted here: settlement items are derived
from booking postings, so payables change only through recognitions, refunds/clawbacks and payouts.

---

## 8. Worked example: INR 4,40,000 booking paid in USD

### 8.1 Facts

| Item | Value |
|---|---|
| Booking | `HIG-B-2026-000123`, priced in INR, `total_minor = 44000000` (INR 4,40,000.00), `payment_option = deposit` |
| Patient | Lives in the USA, `preferred_currency = USD` |
| Deposit | 20 % (`deposit_pct`): INR 88,000.00. Balance: INR 3,52,000.00 |
| FX snapshot | 88.00000000 INR/USD on both orders: deposit USD 1,000.00, balance USD 4,000.00 |
| Gateway | Razorpay. **Illustrative** all-in fee of 3 % of the INR amount (fee + GST on fee). Real fees come from the gateway's payment and settlement data. |
| Commission | 15 % (`default_commission_bps` 1500) |
| GST on commission | 18 % (`gst_rate_bps` 1800) |
| TDS u/s 194-O | 0.1 % of H (`tds_194o_rate_bps` 10) |
| Agent | Case created by an agent: 5 % of H (`default_agent_commission_bps` 500), paid out of platform commission |
| Service fee | 0 (`patient_service_fee_bps` 0), so H = P |
| Hold / cycle | `settlement_hold_days` 3 / `settlement_cycle_days` 7 |

Derived at completion: H = 4,40,000.00. C = 66,000.00. G = 18 % × C = 11,880.00. T = 0.1 % × H = 440.00.
**N = 4,40,000 − 66,000 − 11,880 − 440 = 3,61,680.00**. K = 5 % × H = 22,000.00, which is ≤ C.

The deposit order as returned by `GET /payments/orders/{id}` (abridged):

```json
{
  "order_number": "HIG-P-2026-000201",
  "purpose": "booking_deposit",
  "status": "paid",
  "gateway": "razorpay",
  "amount_minor": 100000,
  "currency": "USD",
  "base_amount_minor": 8800000,
  "base_currency": "INR",
  "fx_rate": "88.00000000",
  "booking_id": "0193…"
}
```

### 8.2 Timeline and postings

| Step | When (illustrative) | What happens | Ledger transactions (INR) |
|---|---|---|---|
| S0 | 01 Oct | Booking created (`pending_payment`), deposit order created | none |
| S1 | 01 Oct | Deposit captured (verify and webhook, deduplicated). Booking → `confirmed`, case → `booked`. | **T1** `payment_captured`: Dr `GATEWAY:razorpay:RECEIVABLE` 88,000.00 / Cr `PLATFORM:PATIENT_ESCROW` 88,000.00. **T2** `gateway_fee`: Dr `EXPENSE:GATEWAY_FEES` 2,640.00 / Cr `GATEWAY:razorpay:RECEIVABLE` 2,640.00 |
| S2 | 03 Oct | Daily sweep: Razorpay settled the deposit (T+2) | **T3** `adjustment` (key `sweep:<payment>`): Dr `PLATFORM:BANK` 85,360.00 / Cr `GATEWAY:razorpay:RECEIVABLE` 85,360.00 |
| S3 | 25 Oct | Balance order (new snapshot, here also 88) captured | **T4** `payment_captured`: Dr receivable 3,52,000.00 / Cr escrow 3,52,000.00. **T5** `gateway_fee`: Dr fees 10,560.00 / Cr receivable 10,560.00 |
| S4 | 27 Oct | Sweep for the balance | **T6** `adjustment`: Dr `PLATFORM:BANK` 3,41,440.00 / Cr receivable 3,41,440.00 |
| — | 28 Oct | Hospital admits: booking → `admitted`, case → `in_treatment` | none |
| S5 | 05 Nov | Hospital completes (discharge): `booking.completed` | **T7** `revenue_recognition`: Dr `PLATFORM:PATIENT_ESCROW` 4,40,000.00 / Cr `HOSPITAL:{h}:PAYABLE` 3,61,680.00, Cr `PLATFORM:COMMISSION_REVENUE` 66,000.00, Cr `TAX:GST_OUTPUT` 11,880.00, Cr `TAX:TDS_194O` 440.00 (the service-fee leg is 0 and is omitted). **T8** `agent_commission`: Dr `EXPENSE:AGENT_COMMISSION` 22,000.00 / Cr `AGENT:{a}:PAYABLE` 22,000.00 |
| S6 | 10 Nov | Hospital payout processed | **T9** `payout`: Dr `HOSPITAL:{h}:PAYABLE` 3,61,680.00 / Cr `PLATFORM:BANK` 3,61,680.00 |
| S7 | 10 Nov | Agent payout processed | **T10** `payout`: Dr `AGENT:{a}:PAYABLE` 22,000.00 / Cr `PLATFORM:BANK` 22,000.00 |
| S8 | by 07 Dec | GST and TDS remitted to the government, booked as a `tax_remittance` adjustment requested by one finance user and approved by another (§7.4) | **T11**: Dr `TAX:GST_OUTPUT` 11,880.00, Dr `TAX:TDS_194O` 440.00 / Cr `PLATFORM:BANK` 12,320.00 |

### 8.3 Account balances after each step (INR, normal-balance sign)

| Account (type) | S1 | S2 | S3 | S4 | S5 | S6 | S7 | S8 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `GATEWAY:razorpay:RECEIVABLE` (asset) | 85,360.00 | 0.00 | 3,41,440.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| `PLATFORM:BANK` (asset) | 0.00 | 85,360.00 | 85,360.00 | 4,26,800.00 | 4,26,800.00 | 65,120.00 | 43,120.00 | 30,800.00 |
| `EXPENSE:GATEWAY_FEES` (expense) | 2,640.00 | 2,640.00 | 13,200.00 | 13,200.00 | 13,200.00 | 13,200.00 | 13,200.00 | 13,200.00 |
| `EXPENSE:AGENT_COMMISSION` (expense) | 0.00 | 0.00 | 0.00 | 0.00 | 22,000.00 | 22,000.00 | 22,000.00 | 22,000.00 |
| `PLATFORM:PATIENT_ESCROW` (liability) | 88,000.00 | 88,000.00 | 4,40,000.00 | 4,40,000.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| `HOSPITAL:{h}:PAYABLE` (liability) | 0.00 | 0.00 | 0.00 | 0.00 | 3,61,680.00 | 0.00 | 0.00 | 0.00 |
| `AGENT:{a}:PAYABLE` (liability) | 0.00 | 0.00 | 0.00 | 0.00 | 22,000.00 | 22,000.00 | 0.00 | 0.00 |
| `TAX:GST_OUTPUT` (liability) | 0.00 | 0.00 | 0.00 | 0.00 | 11,880.00 | 11,880.00 | 11,880.00 | 0.00 |
| `TAX:TDS_194O` (liability) | 0.00 | 0.00 | 0.00 | 0.00 | 440.00 | 440.00 | 440.00 | 0.00 |
| `PLATFORM:COMMISSION_REVENUE` (revenue) | 0.00 | 0.00 | 0.00 | 0.00 | 66,000.00 | 66,000.00 | 66,000.00 | 66,000.00 |
| `PLATFORM:SERVICE_FEE_REVENUE` (revenue) | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| **Σ debit-normal** (assets + expenses) | 88,000.00 | 88,000.00 | 4,40,000.00 | 4,40,000.00 | 4,62,000.00 | 1,00,320.00 | 78,320.00 | 66,000.00 |
| **Σ credit-normal** (liabilities + revenue) | 88,000.00 | 88,000.00 | 4,40,000.00 | 4,40,000.00 | 4,62,000.00 | 1,00,320.00 | 78,320.00 | 66,000.00 |
| **Trial balance (difference)** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

Sanity check: the platform's result is commission 66,000.00 − gateway fees 13,200.00 − agent commission
22,000.00 = **30,800.00**, which is exactly the bank balance left after paying the hospital, the agent and the
tax authorities (S8).

### 8.4 Settlement items, batch, maker-checker, payout

**At S5** the settlements subscriber to `booking.completed` creates two items (status `pending`,
`eligible_at = completed_at + 3 days` = 08 Nov):

| Payee | `gross_minor` | `commission_minor` | `tax_minor` (GST) | `tds_minor` | `net_minor` |
|---|---:|---:|---:|---:|---:|
| hospital `{h}` | 44000000 (4,40,000.00) | 6600000 (66,000.00) | 1188000 (11,880.00) | 44000 (440.00) | 36168000 (3,61,680.00) |
| agent `{a}` | 2200000 (22,000.00) | 0 | 0 | 0 | 2200000 (22,000.00) |

(The example agent is non-resident with the default 0 bps withholding. For a resident agent, W = 2 % of K =
440.00 goes to `TAX:TDS_194H`, and the agent item shows `tds_minor` 44000 and `net_minor` 2156000.)

1. **08 Nov:** the hourly `settlements.mark_eligible` job moves both items `pending → eligible` (unless
   finance put them `on_hold`).
2. **09 Nov:** the daily `settlements.auto_batch` job, or finance user **Priya** clicking *Generate*
   (`POST /finance/settlements/batches {"payee_type": "hospital", "payee_id": "{h}"}`), creates batch
   `HIG-S-2026-000042` in `pending_approval` with `created_by` = Priya. The item moves to `batched`.
   (`settlements.auto_batch` batches each payee whose last non-cancelled batch is at least `cycle` days old,
   using `hospitals.settlement_cycle_days` or `settlement_cycle_days`. A batch it creates has
   `created_by = NULL`: it is never auto-approved or auto-processed and still needs an authenticated finance
   user to approve it before `process` is allowed.)
   ```json
   {"batch_number": "HIG-S-2026-000042", "payee_type": "hospital", "status": "pending_approval",
    "items_count": 1, "total_gross_minor": 44000000, "total_commission_minor": 6600000,
    "total_tax_minor": 1188000, "total_tds_minor": 44000, "total_net_minor": 36168000, "currency": "INR"}
   ```
   The agent item goes into a separate batch (`payee_type: "agent"`, `HIG-S-2026-000043`).
   **Destination snapshot (SEC-003):** the batch stores `payout_accounts_snapshot`, each payee's primary
   verified account at generation time (masked number, IFSC/SWIFT, holder, Route account and a fingerprint of
   the full details). The approver reviews it. If the payee's account differs at processing time, that
   payee's payout fails with "payout account changed since the batch was generated". Its items return to
   `eligible`, and a regenerated batch snapshots the new account.
3. **Maker-checker.** Priya calls `POST /finance/settlements/batches/{id}/approve` and is **refused** with 403
   `maker_checker`, because the approver must differ from the creator. Finance user **Arjun** (or a
   `super_admin`) reviews the items and the payee's verified payout account, then approves. The batch becomes
   `approved` with `approved_by` = Arjun. Both actions are audited (`settlement_batch.*`).
   `POST …/reject {reason}` instead cancels a `pending_approval` or `approved` batch and returns its items to
   `eligible`. A **system** batch (`created_by = NULL`) has no maker, so its approver may not also process it
   (403 `maker_checker`).
4. **10 Nov:** `POST …/batches/{id}/process` sets the batch to `processing` and creates one payout per payee
   (amount = Σ `net_minor` of its items = 3,61,680.00). The method is chosen from the payee's primary verified
   active payout account (`app/modules/settlements/providers.py`):
   * `razorpay_route` if the account has `razorpay_linked_account_id` and Razorpay is configured. The job
     `settlements.execute_payout` creates a Route transfer (`POST /v1/transfers`) from the platform's Razorpay
     balance. It is `processed` when Razorpay returns the transfer id. **No blind retries (SEC-004).**
     * Before the call, the job re-checks that the account is still verified, active and unchanged
       (fingerprint), and commits `gateway_attempted_at`.
     * Only connect errors and HTTP 429 (the request never created a transfer) clear the marker and retry,
       up to 8 attempts.
     * A read timeout, another transport error, a 5xx, a 2xx without an id, or a job that finds the marker
       already set parks the payout as **`needs_reconciliation`**. The batch stays `processing` and the
       finance summary counts these payouts in `payouts_needs_reconciliation`.
     * Finance checks the Razorpay dashboard for the transfer (`notes.payout_id`). If it exists, record it
       with `mark-paid {"utr": "trf_…"}` and `mark-paid/approve`. If it doesn't, fail the payout with the
       two-person `mark-failed` flow below, and the items are batched again.
   * Otherwise `mock` outside production (completes inline), or `manual_bank_transfer` in production. The
     payout stays `processing` until finance pays through the bank. **Maker-checker:** one finance user
     records the UTR with `POST /finance/settlements/payouts/{id}/mark-paid {"utr": "<bank UTR>"}` (the
     payout stays `processing`, `paid_requested_by` is set); a **different** finance user confirms with
     `POST …/mark-paid/approve {request_id, reference, amount_minor}` (the requester gets 403
     `second_approver_required`), or anyone rejects the request with `POST …/mark-paid/reject {reason}`.
     **SEC-063:** each request gets a new `paid_request_id` (on the payout). The approve body must repeat
     that id, the UTR and the amount the checker reviewed. If the maker replaced the request in between, the
     approval gets 409 `mark_paid_request_changed`, and the checker reviews again. `GET /finance/settlements/payouts?awaiting_confirmation=true`
     lists the queue; the finance summary counts it (`payouts_awaiting_confirmation`).
   * `razorpayx` is **not supported** by the implementation (400 `unsupported_method`).
   * A payee with no verified account, or a non-positive net, gets a `failed` payout immediately.
5. When the payout is `processed`, `payout.processed` triggers posting **T9**. Items become `paid` and the
   batch becomes `completed`. If a payout fails, its items return to `eligible` for the next batch and the
   batch ends `partially_failed`. A `queued`/`processing` payout (no money sent) can be failed at once with
   `POST …/payouts/{id}/mark-failed {reason}`. Failing a **processed** (bounced) or `needs_reconciliation`
   payout takes two people (SEC-003): `mark-failed {reason, reference}` records the request (400
   `reference_required` without a bank or gateway reference; `?reversal_pending=true` lists the queue), and
   a **different** finance user applies it with `POST …/mark-failed/approve {request_id, reference}`, naming
   the reviewed `reversal_request_id` and reference (403 `second_approver_required` for the requester; 409
   `mark_failed_request_changed` if the request changed, SEC-063), or drops it with `…/mark-failed/reject`. A processed payout then becomes `reversed`,
   the T9 posting is reversed (`payout_reversal:<id>`) and its items return to `eligible` (see
   OPERATIONS.md → *Failed payouts*).
6. The agent batch follows the same path (**T10**). Statements are available at
   `GET /finance/statements?from=&to=` (H, A).
7. **Documents.** When a payout is `processed`, the platform issues the hospital's commission **tax invoice**
   (and a **credit note** for any clawback netted in it) or the agent's **commission statement** (§10.2):
   `GET /finance/settlements/invoices` (F all; H/A own) and `GET /finance/settlements/invoices/{id}/pdf`.

---

## 9. Refunds

### 9.1 Mechanics

* `POST /payments/refunds {payment_id | order_id, amount_minor, reason}`. Finance can create, and admin can
  too. `amount_minor` is in the **payment currency**. The amount must be ≤ refundable (captured − already
  committed refunds **for that payment**). The refund is created as `requested`.
* `POST /payments/refunds/{id}/approve` (F) moves it to `approved` and enqueues `payments.process_refund`.
  That job calls the gateway `refund` and sets `processing`, then `processed` (gateway response or
  `refund.processed` webhook) or `failed`. `…/reject` → `rejected`. **Maker-checker:** a refund above
  `refund_dual_approval_threshold_minor` (INR, default 50,000.00; 0 = every refund) must be approved by a user
  other than its requester (403 `second_approver_required`).
* A booking with several payments (deposit + balance) is refunded payment by payment. A gateway refund can't
  exceed what that payment captured.
* `refunds.amount_minor` is in the payment currency. `refunds.base_amount_minor` is the INR amount at the
  payment's original snapshot (§6).
* `refund.processed` updates the ledger (rule 5 or 6), `bookings.amount_refunded_minor` (cases), creates
  clawback items if the booking was completed (settlements), and notifies the patient (messaging).
* **Cancellation:** `POST /bookings/{id}/cancel` computes the refundable amount from the `refund_policy`
  setting (default: cancelled ≥ 14 days before admission → 100 %, ≥ 7 days → 50 %, otherwise 0 %) and
  publishes `booking.cancelled {booking_id, refundable_minor, reason}`. The payments subscriber cancels the
  booking's open orders and due/overdue installments, then creates **auto-approved** system refunds
  (newest captured payments first, audited as `refund.auto_create`). No finance approval is needed.
  `cases.expire_unpaid_bookings` (every 6 h) cancels `pending_payment` bookings whose admission date has
  passed.
* The gateway's fee on the original payment is normally **not** returned when you refund (check current
  Razorpay and Stripe terms), so it stays in `EXPENSE:GATEWAY_FEES`.
* Gateways limit how long after capture a refund can be issued. Older payments must be refunded by bank
  transfer, which isn't modelled in PLAN.

### 9.2 Refund before completion (cancellation)

Start from S2 (deposit captured and settled). The patient cancels 10 days before admission, so 50 % of
INR 88,000.00 = **INR 44,000.00** (USD 500.00 at the original 88 snapshot) is refunded.

**R1** `refund`: Dr `PLATFORM:PATIENT_ESCROW` 44,000.00 / Cr `GATEWAY:razorpay:RECEIVABLE` 44,000.00.

| Account | Before (S2) | After R1 |
|---|---:|---:|
| `GATEWAY:razorpay:RECEIVABLE` | 0.00 | −44,000.00 (we owe Razorpay; it is netted from the next settlement) |
| `PLATFORM:BANK` | 85,360.00 | 85,360.00 |
| `EXPENSE:GATEWAY_FEES` | 2,640.00 | 2,640.00 |
| `PLATFORM:PATIENT_ESCROW` | 88,000.00 | 44,000.00 |
| Σ debit-normal / Σ credit-normal | 88,000.00 / 88,000.00 | 44,000.00 / 44,000.00 |

**Cancellation retention (rule 9).** The retained INR 44,000.00 stays in escrow until the original admission
date. From then on the hourly `settlements.recognize_cancellation_retention` job releases it once (key
`retain:<booking_id>`, txn type `cancellation_retention`), provided no refund of the booking is still
`requested`/`approved`/`processing` and no payment was captured after the cancellation (that money must be
refunded instead). The split follows the hospital agreement Schedule A, setting
`cancellation_retention_hospital_share_bps` (default 10000 = Option A; 0 = Option C, all platform revenue;
in between = Option B): the hospital share is treated as H (commission, GST and TDS u/s 194-O apply, no
agent commission, no service-fee split) and the rest goes to `PLATFORM:CANCELLATION_REVENUE`. With Option A:

**R1r** `cancellation_retention`: Dr `PLATFORM:PATIENT_ESCROW` 44,000.00 / Cr `HOSPITAL:{h}:PAYABLE` 36,168.00,
Cr `PLATFORM:COMMISSION_REVENUE` 6,600.00, Cr `TAX:GST_OUTPUT` 1,188.00, Cr `TAX:TDS_194O` 44.00.

The hospital gets a settlement item (eligible after the hold, paid in its next batch). A later goodwill
refund of the same booking reverses the retention proportionally (§9.3 mechanics).

### 9.3 Refund after completion (clawback)

Start from S7 (both payouts done). Finance refunds **INR 44,000.00** (10 % of P) for an included service
that wasn't delivered. Every component of T7 and T8 is reversed in proportion, r = 44,000 / 4,40,000 = 10 %:
H_r = 44,000.00, C_r = 6,600.00, G_r = 1,188.00, T_r = 44.00, N_r = 36,168.00, K_r = 2,200.00.

* **R2a** `refund`, key `reverse:<refund>` (reversal of T7): Dr `HOSPITAL:{h}:PAYABLE` 36,168.00, Dr
  `PLATFORM:COMMISSION_REVENUE` 6,600.00, Dr `TAX:GST_OUTPUT` 1,188.00, Dr `TAX:TDS_194O` 44.00 / Cr
  `PLATFORM:PATIENT_ESCROW` 44,000.00
* **R2b** `agent_commission`, key `agent_commission_reversal:<refund>` (reversal of T8): Dr `AGENT:{a}:PAYABLE`
  2,200.00 / Cr `EXPENSE:AGENT_COMMISSION` 2,200.00
* **R2c** `refund`, key `refund:<refund>` (cash leg, rule 5): Dr `PLATFORM:PATIENT_ESCROW` 44,000.00 / Cr
  `GATEWAY:razorpay:RECEIVABLE` 44,000.00

Nothing of this booking was still held in escrow, so the whole refund is reversed. If part of the booking's
money were still held (for example a late installment not yet recognised), only the excess over that held
amount would be reversed.

| Account | Before (S7) | After R2 |
|---|---:|---:|
| `GATEWAY:razorpay:RECEIVABLE` | 0.00 | −44,000.00 |
| `PLATFORM:BANK` | 43,120.00 | 43,120.00 |
| `EXPENSE:GATEWAY_FEES` | 13,200.00 | 13,200.00 |
| `EXPENSE:AGENT_COMMISSION` | 22,000.00 | 19,800.00 |
| `PLATFORM:PATIENT_ESCROW` | 0.00 | 0.00 |
| `HOSPITAL:{h}:PAYABLE` | 0.00 | −36,168.00 (the hospital owes the platform) |
| `AGENT:{a}:PAYABLE` | 0.00 | −2,200.00 (the agent owes the platform) |
| `TAX:GST_OUTPUT` | 11,880.00 | 10,692.00 |
| `TAX:TDS_194O` | 440.00 | 396.00 |
| `PLATFORM:COMMISSION_REVENUE` | 66,000.00 | 59,400.00 |
| Σ debit-normal / Σ credit-normal | 78,320.00 / 78,320.00 | 32,120.00 / 32,120.00 |

Clawback settlement items (status `eligible`, net negative): hospital gross −44,000.00, commission −6,600.00,
tax −1,188.00, tds −44.00, **net −36,168.00**; agent gross −2,200.00, **net −2,200.00**. They net against the
payee's next positive items in the same batch. A payee who has no further business must be invoiced manually.

Tax follow-up (CA review): a commission reduction after the invoice was issued needs a GST **credit note**.
When the clawback item is netted in a payout, the platform issues one automatically (series `HCN…`, each
line referencing the original commission invoice; §10.2). The agent's clawback appears on the agent's next
commission statement, including the reversed withholding. Reversing TDS that has already been deposited follows TDS correction rules, not a
simple reversal. If GST and TDS were already remitted (S8), these balances go negative until the next return
adjusts them.

---

## 10. Installments, invoices, settlement cycles

### 10.1 Installments

* `payment_option = installments` with `installment_months` N (UI offers 3, 6 or 12). On `booking.created` the
  payments module creates the schedule (`app.modules.payments.service.installment_plan`):
  * **seq 1 = the deposit** (`deposit_minor`), due on the booking date;
  * the remainder is split into N equal monthly installments, the last absorbing rounding.

  Because the first payment always equals the deposit, the "first captured payment ≥ `deposit_minor`" rule
  confirms installment bookings as soon as seq 1 is paid. A `booking_deposit` order also marks seq 1 paid.
* Each installment is paid through its **own order** (`purpose = installment`, `installment_id`), so each has
  its own FX snapshot. The INR amount is fixed and the patient-currency amount changes month to month.
  Illustrative 3-month plan for INR 4,40,000.00:

  | seq | Due | INR | Snapshot | Charged |
  |---|---|---:|---:|---:|
  | 1 (deposit) | booking date | 88,000.00 | 88.00 | USD 1,000.00 |
  | 2 | +1 month | 1,17,333.33 | 88.40 | USD 1,327.30 |
  | 3 | +2 months | 1,17,333.33 | 87.90 | USD 1,334.85 |
  | 4 | +3 months | 1,17,333.34 | 88.20 | USD 1,330.31 |

* Status moves `due → paid` on capture. The hourly `payments.mark_overdue` job moves it to `overdue` after
  `due_date`. Cancelling the booking sets `cancelled`.
* **Completion before full payment:** revenue recognition covers only P paid so far. Each later installment
  capture posts its own incremental recognition and creates new settlement items. The hospital is paid only
  what has been collected, so the hospital agreement must state that it carries the collection risk on unpaid
  installments.

### 10.2 Invoices and receipts

| `InvoiceKind` | Issued | From → to | Content |
|---|---|---|---|
| `patient_receipt` | Per captured payment (`capture_order` → `invoices.create_receipt`; PDF rendered by `payments.render_invoice`) | Platform → payer | Order and booking numbers, amount and currency paid, INR equivalent and FX rate, gateway reference. A **payment acknowledgement, not a tax invoice for treatment**: the hospital issues its own bill for clinical services. |
| `commission_invoice` | Per processed hospital payout (`app/modules/settlements/invoices.py`), for the payout's positive items | Platform → hospital | Tax invoice: per booking, taxable commission C + GST G, split CGST+SGST when the hospital's `state` equals setting `platform_gst_state`, IGST otherwise. `supplier_gstin` = setting `platform_gstin`, `recipient_gstin` = `hospitals.gstin`, `place_of_supply` = the hospital's state. SAC 998599 is a placeholder (CA to confirm). |
| `credit_note` | Per processed hospital payout that nets clawback items | Platform → hospital | Commission + GST reversed by refunds after completion; each line names the original commission invoice. |
| `agent_statement` | Per processed agent payout | Platform → agent | Commission K, withholding W and net per booking (clawbacks negative). GST-registered Indian agents invoice the platform themselves; for non-resident agents a note says GST (reverse charge / intermediary) is determined separately. |

Each settlement item is documented at most once (lines carry `item_id`), so a bounced payout whose items are
paid again later does not produce a second invoice. Settlement documents are listed and downloaded with
`GET /finance/settlements/invoices` and `…/{id}/pdf` (F all; hospital members and agents their own).

* Numbers: prefix + Indian financial year (IST) + serial, at most **16 characters** (Rule 46 of the CGST
  Rules): invoices and receipts `HIG2627000001` (13 characters; 14 after serial 999,999), credit notes
  `HCN2627000001`, agent statements `HAS2627000001` (separate sequences `invoice_number_seq`,
  `credit_note_number_seq`, `statement_number_seq`). Patient receipts and commission tax invoices still share
  the `HIG` series; ask the CA whether tax invoices need their own. Receipt PDFs are served by
  `GET /payments/invoices/{id}/pdf`, settlement documents by `GET /finance/settlements/invoices/{id}/pdf`.

**GST notes (verify with a CA; rates and notifications change):**

* Health care services by a clinical establishment, authorised medical practitioner or para-medics are
  generally **exempt** (Notification 12/2017-Central Tax (Rate)). Cosmetic or plastic surgery that doesn't
  restore anatomy or function after congenital defects, developmental abnormalities, injury or trauma is
  excluded from the exemption. Some hospital charges (for example high-value non-ICU room rent) have been
  taxed separately. These are the **hospital's** supplies and invoices, not the platform's.
* The platform's **commission to hospitals is a taxable service (18 % GST)**. That is what
  `TAX:GST_OUTPUT` models. A patient service fee, if ever enabled, has no GST split in PLAN, and whether it is
  an export of service or an intermediary service taxable in India needs a determination.
* Not modelled (CA decision needed): TCS that e-commerce operators must collect under CGST s.52 on
  *taxable* supplies made through the platform (for example taxable cosmetic procedures, hotels); s.9(5)
  liability for certain services supplied through an e-commerce operator (accommodation); input tax credit on
  GST charged in gateway fees (`payments.tax_on_fee_minor` is stored but not posted separately); mandatory GST
  registration as an e-commerce operator.

### 10.3 Settlement cycles and holds

* **Hold:** items become `eligible` at `completed_at + settlement_hold_days` (default 3; finance setting).
  The hourly `settlements.mark_eligible` job applies it.
* **Manual holds:** `POST /finance/settlements/items/{id}/hold {reason}` and `/release` (F). Use them for
  complaints, disputes, KYC problems, or a missing or unverified payout account. `on_hold` items are skipped
  when batching.
* **Cycle:** `settlement_cycle_days` (default 7) or a per-hospital `hospitals.settlement_cycle_days`. The daily
  `settlements.auto_batch` job batches each payee whose cycle is due. Finance can generate a batch at any time.
* **Netting:** negative (clawback) items are netted against the same payee's positive items in the batch.
  A payee whose eligible items net to ≤ 0 is **left out of the batch**, and the clawback carries forward
  to later items. If no payee nets positive, batch generation returns 400 `no_eligible_items`.
* **Batch states:** batches are generated directly in `pending_approval` (`draft` is unused), then
  `approved → processing → completed | partially_failed`. Reject → `cancelled`, with items back to
  `eligible`. **Approver ≠ creator** (F or super_admin; 403 `maker_checker`).
* **Failed payouts:** items return to `eligible` and are picked up by the next batch after the cause is
  fixed. Bounced payouts (marked failed after `processed`) become `reversed`, with a reversing ledger posting.
* **Payout accounts (SEC-003, SEC-023):** whoever submits the destination details (`submitted_by`: create,
  a change to holder, number, IFSC, SWIFT or Route account, or re-activating a disabled account) can't verify
  them (403 `maker_checker`). Any such submission resets `is_verified`, `verified_by` and `verified_at`. A
  payee therefore can't undo finance disabling an account: re-activation needs a new verification.
* **Before paying, check:** payee `active` with KYC `approved`; a primary payout account with
  `is_verified = true` and `status = active`; hospital PAN on file (needed for TDS); for a non-resident agent,
  outward-remittance compliance (§13), which in practice means `manual_bank_transfer`.

---

## 11. Reconciliation runbook (daily)

Run these as finance (read-only SQL, or the matching Admin → Finance screens). Use `psql` against the
`healindia` database only (see OPERATIONS.md for connection details). Investigate anything other than the
expected result before the day's batches are approved.

**1. Ledger integrity.** Expect `0`, and no rows from the second query.

```sql
SELECT SUM(CASE WHEN direction = 'debit' THEN amount_minor ELSE -amount_minor END) AS net_minor
FROM ledger_entries;

SELECT a.code, a.type, a.balance_minor,
       CASE WHEN a.type IN ('asset', 'expense') THEN COALESCE(x.net_debit, 0)
            ELSE -COALESCE(x.net_debit, 0) END AS recomputed_minor
FROM ledger_accounts a
LEFT JOIN (SELECT account_id,
                  SUM(CASE WHEN direction = 'debit' THEN amount_minor ELSE -amount_minor END) AS net_debit
           FROM ledger_entries GROUP BY account_id) x ON x.account_id = a.id
WHERE a.balance_minor <> CASE WHEN a.type IN ('asset', 'expense') THEN COALESCE(x.net_debit, 0)
                              ELSE -COALESCE(x.net_debit, 0) END;
```

**2. Escrow vs undelivered bookings.** `PLATFORM:PATIENT_ESCROW` should equal (a) + (b) below.

```sql
-- (a) money held per booking status (INR, base amounts); completed bookings should net to 0
WITH captured AS (
    SELECT o.booking_id, SUM(p.base_amount_minor) AS paid_minor
    FROM payments p JOIN payment_orders o ON o.id = p.order_id
    WHERE o.booking_id IS NOT NULL AND p.status IN ('captured', 'partially_refunded', 'refunded')
    GROUP BY o.booking_id
), refunded AS (
    SELECT booking_id, SUM(base_amount_minor) AS refunded_minor
    FROM refunds WHERE status = 'processed' AND booking_id IS NOT NULL
    GROUP BY booking_id
)
SELECT b.status, COUNT(*) AS bookings,
       SUM(COALESCE(c.paid_minor, 0) - COALESCE(r.refunded_minor, 0)) AS held_minor
FROM bookings b
LEFT JOIN captured c ON c.booking_id = b.id
LEFT JOIN refunded r ON r.booking_id = b.id
GROUP BY b.status;

-- (b) captures not linked to a booking (consultation fees, services), net of their refunds
SELECT COALESCE(SUM(p.base_amount_minor), 0)
       - COALESCE((SELECT SUM(r.base_amount_minor) FROM refunds r
                    JOIN payment_orders o2 ON o2.id = r.order_id
                    WHERE r.status = 'processed' AND o2.booking_id IS NULL), 0) AS non_booking_held_minor
FROM payments p JOIN payment_orders o ON o.id = p.order_id
WHERE o.booking_id IS NULL AND p.status IN ('captured', 'partially_refunded', 'refunded');

SELECT balance_minor FROM ledger_accounts WHERE code = 'PLATFORM:PATIENT_ESCROW';
```

Expected: rows for `pending_payment`/`confirmed`/`admitted` are money held for future treatment. The
`completed` row should be 0. A non-zero `cancelled` row is a retained cancellation amount whose admission
date has not been reached yet, or one blocked by an open refund or a capture after cancellation (§9.2);
anything older than the admission date plus a day needs a look. (b) covers consultation and service
payments, still a known gap (§14 #4), so track them as open items.

**3. Bookings vs payments** (event handler failures). Expect no rows for INR-priced bookings.

```sql
SELECT b.booking_number, b.amount_paid_minor, COALESCE(SUM(p.base_amount_minor), 0) AS captured_minor
FROM bookings b
LEFT JOIN payment_orders o ON o.booking_id = b.id
LEFT JOIN payments p ON p.order_id = o.id AND p.status IN ('captured', 'partially_refunded', 'refunded')
WHERE b.currency = 'INR'
GROUP BY b.id, b.booking_number, b.amount_paid_minor
HAVING b.amount_paid_minor <> COALESCE(SUM(p.base_amount_minor), 0);
```

**4. Gateway settlement reports vs ledger.** Download the gateway's settlement report for the settlement date
(Razorpay Dashboard → Reports → Settlements, or the settlement reconciliation API; Stripe → Balance →
Payouts). For each day:
`Σ captured − Σ fees (incl. GST) − Σ refunds − Σ dispute deductions = amount credited to the bank`.
Compare with the day's sweep postings (Dr `PLATFORM:BANK` / Cr `GATEWAY:{gw}:RECEIVABLE`) and the bank
statement. Expected differences, booked as finance adjustments (§7.4): the gateway's FX conversion vs our
snapshot, fees reported only at settlement, refunds netted out of settlements, and international settlement
cycles longer than T+2. The `GATEWAY:{gw}:RECEIVABLE` balance should equal captures not yet settled, net of
fees and refunds. Compare it with the gateway dashboard's unsettled balance.

**5. Payables vs settlement items.** Expect no rows.

```sql
SELECT a.code, a.balance_minor, COALESCE(SUM(i.net_minor), 0) AS unpaid_items_minor
FROM ledger_accounts a
LEFT JOIN settlement_items i
       ON i.payee_id = a.owner_id AND i.payee_type = a.owner_type
      AND i.status IN ('pending', 'eligible', 'on_hold', 'batched')
WHERE a.owner_type IN ('hospital', 'agent')
GROUP BY a.code, a.balance_minor
HAVING a.balance_minor <> COALESCE(SUM(i.net_minor), 0);
```

**6. Failed or stuck payouts.**

```sql
SELECT id, batch_id, payee_type, payee_id, amount_minor, method, status, failure_reason, created_at
FROM payouts
WHERE status IN ('failed', 'reversed')
   OR (status IN ('queued', 'processing') AND created_at < now() - interval '24 hours')
ORDER BY created_at;
```

Follow OPERATIONS.md → *Failed payouts*. Never mark a payout paid without a bank UTR, and have a second
finance user check the UTR.

**7. Webhook gaps.**

```sql
-- stored but unprocessed / failed processing
SELECT gateway, event_type, COUNT(*) AS events, MIN(received_at) AS oldest
FROM webhook_events
WHERE (processed_at IS NULL AND received_at < now() - interval '15 minutes') OR processing_error IS NOT NULL
GROUP BY gateway, event_type;

-- invalid signatures in the last day (spike = misconfigured secret or probing)
SELECT gateway, COUNT(*) FROM webhook_events
WHERE signature_valid = false AND received_at > now() - interval '1 day' GROUP BY gateway;

-- orders still open long after checkout (possible missed webhook): check each in the gateway dashboard
SELECT order_number, gateway, gateway_order_id, status, created_at, expires_at
FROM payment_orders
WHERE gateway IN ('razorpay', 'stripe') AND status IN ('created', 'pending')
  AND gateway_order_id IS NOT NULL AND created_at < now() - interval '30 minutes'
ORDER BY created_at;
```

Also compare the day's count of captured payments in the gateway dashboard with
`SELECT COUNT(*) FROM payments WHERE status <> 'failed' AND captured_at::date = current_date - 1;`.

**8. Bank transfers awaiting reconciliation.** List `bank_transfer` orders still open more than 2 business
days after proof was uploaded, and work them through §4.4.

**9. Taxes (monthly).** `TAX:GST_OUTPUT` should match the GST on the month's commission invoices, and
`TAX:TDS_194O` the TDS computed on the month's recognised H. Remit both by the statutory due dates and record
the payments (S8).

---

## 12. Razorpay go-live checklist

- [ ] Account KYC complete and live mode activated. Website and app show the policies Razorpay requires
      (terms, privacy, refund/cancellation, contact; the patient-web legal pages).
- [ ] **International payments** activated for the account. Check every currency in `supported_currencies`
      is enabled and remove the ones that aren't. Confirm the international settlement cycle (it can be
      longer than domestic T+2) and adjust the sweep assumption (§14).
- [ ] Transaction documentation for cross-border collections agreed with Razorpay (invoice or purpose data
      per payment, payer details). See §13.
- [ ] Payment capture: auto-capture configured (Dashboard), or the verify/webhook path captures authorized
      payments. Razorpay automatically refunds authorized payments that are never captured.
- [ ] **Route** (if `razorpay_route` payouts are used): Route enabled; one linked account per hospital with
      completed KYC (PAN, bank account, business details); id stored in
      `payout_accounts.razorpay_linked_account_id`; payout account `is_verified`. Read §14 on how Route
      funds flow differently from the PLAN ledger.
- [ ] **RazorpayX** payouts aren't implemented (`razorpayx` → 400 `unsupported_method`). Non-Route payees are
      paid with `manual_bank_transfer` plus a UTR.
- [ ] Keep enough **Razorpay balance** for Route transfers: they are direct transfers from the merchant balance
      (`POST /v1/transfers`), made weeks after capture once the booking completes. Agree the settlement and
      balance arrangement with Razorpay.
- [ ] **Webhooks:** live-mode webhook URL `https://<api-domain>/api/v1/payments/webhooks/razorpay`; a long
      random secret stored only in `RAZORPAY_WEBHOOK_SECRET`; the events in §5.2 enabled. Test mode and live
      mode have **separate** webhook configurations and secrets.
- [ ] **Keys:** `rzp_live_…` key id and secret only in the production secret store; `rzp_test_…` everywhere
      else. Confirm `ENV=production` and that `mock` is not in `PAYMENT_GATEWAYS_ENABLED` (the app refuses
      to start otherwise).
- [ ] The CSP allows Checkout (`infra/nginx/snippets/csp-spa.conf`). Checkout tested on patient-web,
      agent-portal and the Android/iOS builds.
- [ ] End-to-end live smoke test with a small real payment: verify, webhook, ledger postings, refund, refund
      webhook, then the reconciliation queries (§11).
- [ ] Disputes/chargebacks: owner named and dispute webhooks routed to finance alerts.
- [ ] `bank_transfer_details` setting holds the real beneficiary bank, SWIFT and IFSC. The account accepts
      foreign inward remittances.

---

## 13. RBI / FEMA / tax notes (high level; get professional review)

This section flags questions to take to counsel. It is not an answer to any of them.

### 13.1 Who may hold patient money

RBI regulates payment aggregators (PAs): entities that collect funds from customers and settle them to
merchants must be authorised, or must use an authorised PA or bank arrangement. In the PLAN model, captured
funds settle to `PLATFORM:BANK` and the platform later pays hospitals and agents. That model must be checked
against the PA framework. Common compliant patterns:

* Settlement through the licensed PA's split or hold features (for example Razorpay Route transfers held
  until completion).
* The hospital as merchant of record, with the platform earning commission only.
* A properly structured escrow arrangement with a bank.

**Get this decision from counsel before go-live.** It also changes the ledger flows (§14, Route note).

### 13.2 Cross-border collection

* Card payments from foreign patients through a PA fall under RBI's cross-border payment aggregator (PA-CB)
  framework for export of services. Expect payer KYC and transaction-level data requirements. There is a
  per-transaction value cap (₹25 lakh per unit of goods or services when this was written; verify the
  current limit). Route larger treatments (transplants, complex oncology) through SWIFT bank transfer.
* SWIFT inward remittances arrive through an AD Category-I bank with a purpose code and an e-FIRA/FIRC.
  Confirm the correct purpose code for medical-travel receipts with the bank. If the platform rather than the
  hospital receives export proceeds, the export documentation trail sits with the platform.
* NRI patients paying from Indian (NRE/NRO) accounts are domestic INR flows, and UPI or netbanking may apply.

### 13.3 Outward flows

* Refunds to foreign cards go back through the gateway as reversals of the original transaction.
* Commission to **non-resident agents** is an outward remittance. Expect Form 15CA/15CB, withholding analysis
  under the Income-tax Act (DTAA, permanent-establishment questions), a purpose code, and the AD bank. Route
  and RazorpayX payouts are domestic INR only, so use `manual_bank_transfer` for these.
* Stripe has restricted onboarding of new Indian businesses (invite-only since 2024; verify current status).
  Using Stripe through a foreign group entity changes the cross-border, transfer-pricing and tax analysis.

### 13.4 Direct and indirect tax

* **TDS on hospitals:** section 194-O (e-commerce operator), 0.1 % from 1 Oct 2024 (previously 1 %),
  deducted at credit or payment, whichever is earlier. The posting at completion is the credit. A hospital
  without a valid PAN attracts a higher rate (s.206AA), so require PAN in KYC. Deposit TDS and file quarterly
  statements and certificates on time. **The Income-tax Act, 2025 replaces the 1961 Act for tax years from
  1 April 2026 and renumbers TDS provisions.** "194-O" and the account code `TAX:TDS_194O` are kept as labels.
  Confirm the current section reference and rate.
* **TDS on agent commission:** commission paid to resident agents is ordinarily subject to TDS (s.194H under
  the 1961 Act), and non-resident payments need withholding analysis. The implementation withholds
  `agent_tds_rate_bps` (default 2 %) from resident agents into `TAX:TDS_194H` and
  `agent_nonresident_withholding_bps` (default 0) from non-resident agents into `TAX:TDS_195` (§7.3). The
  s.194H annual threshold, lower-deduction certificates and the 206AA no-PAN rate are **not** modelled: set
  the rates with the CA.
* **GST:** see §10.2 (exempt healthcare, 18 % on commission, ECO TCS, s.9(5), reverse charge on services
  imported from foreign agents, credit notes).
* **Card data:** never store card numbers. RBI's card-on-file tokenisation rules prohibit merchants from
  storing card data, and the gateway-hosted checkout already ensures this.

**Recommendation:** before go-live, get a written opinion from (1) a CA on GST, TDS/TCS and invoicing and
(2) payments/FEMA counsel on PA/PA-CB, the escrow model, export proceeds and agent remittances. Record the
decisions here.

---

## 14. Known gaps and open questions (payments, ledger, settlements)

| # | Gap | Impact | Suggested resolution |
|---|---|---|---|
| 1 | Resolved in code: `POST /finance/ledger/adjustments` (F, maker-checker, audited) books tax remittances, FX differences (`PLATFORM:FX_GAIN_LOSS`) and manual corrections (§7.4). The sweep still uses the generic `adjustment` type. | — | Add the implementation accounts (`PLATFORM:EQUITY`, `PLATFORM:ADJUSTMENTS`, `PLATFORM:FX_GAIN_LOSS`, `PLATFORM:CANCELLATION_REVENUE`, `TAX:TDS_194H`, `TAX:TDS_195`) and txn types to PLAN §4.12/§5 |
| 2 | The sweep moves each payment's net receivable to `PLATFORM:BANK` 2 days after capture, based on our own postings, not the gateway's settlement reports | Diverges from the bank with Razorpay Route (transfers leave the Razorpay balance, but the payout posting credits `PLATFORM:BANK`), with refunds or disputes netted from later settlements (the receivable stays negative), and with international cycles longer than T+2 | Sweep from settlement reports. Choose the payout credit account by method (Route → receivable). |
| 3 | Resolved in code: retention posting (rule 9, §9.2) with a configurable hospital share | — | Confirm the Schedule A option and set `cancellation_retention_hospital_share_bps`; decide GST on the platform's share |
| 4 | `consultation_fee` and `service` captures have no recognition or settlement rule; `VENDOR:{id}:PAYABLE` is unused | Teleconsult fees and vendor money stay in escrow | Add recognition on consultation `completed` and vendor items |
| 5 | Resolved in code: the installment schedule starts with the deposit (§10.1), so the confirmation rule works. PLAN doesn't describe the schedule. | — | Document `installment_plan` in PLAN §4.11 |
| 6 | No chargeback/dispute model; dispute webhooks are ignored | Funds deducted by gateways are unexplained in reconciliation | Dispute statuses, a hold on related settlement items, a ledger posting |
| 7 | Resolved in code and tested: precedence table in §7.3 (hospital column between hospital rules and catalogue rules; agent column between the agent-specific and the generic agent rule) | — | Copy the table into PLAN §4.13 |
| 8 | Resolved in code: failed payouts return items to `eligible`; bounced ones become `reversed` with a `payout_reversal` posting. Not described in PLAN §6.4. | — | Add to PLAN |
| 9 | Resolved in code: payees whose items net ≤ 0 are left out of batches and carried forward | — | Add to PLAN |
| 10 | Resolved in code: refunds above `refund_dual_approval_threshold_minor`, bank-transfer `mark-paid`, payout `mark-paid`, payout reversals, payout-account verification (submitter ≠ verifier) and system-batch processing (approver ≠ processor) all need a second finance user; batches snapshot each payee's destination account (SEC-003); Route timeouts are parked, not re-sent (SEC-004). | — | Reconcile Route transfers against Razorpay settlement reports |
| 11 | Cancellation refunds are auto-approved (no human approval, no amount limit) | A wrong `refund_policy` setting or a cancellation bug pays out immediately | Approval above a threshold; alert on `refund.auto_create` |
| 12 | `mark-paid` requires the exact order amount; no way to record a short or combined wire | Short wires can't be booked | Multiple receipts per order, or a top-up flow |
| 13 | Resolved in code: production refuses foreign-currency orders without a DB rate newer than `fx_rate_max_age_hours` (503 `fx_rate_unavailable`); other environments fall back and log an alert | — | Automate the FX feed |
| 14 | Resolved in code: `HIG2627000001` (≤ 16 characters), `credit_note` kind and `HCN` series, `HAS` series for agent statements. Receipts and commission tax invoices still share the `HIG` series. | CA may require a separate tax-invoice series | Decide with the CA |
| 15 | No GST split for the patient service fee or the platform's cancellation share; ECO TCS (s.52), s.9(5), ITC on gateway-fee GST and RCM on foreign agents not modelled. (Agent TDS is modelled, §7.3.) | Tax under- or over-statement | CA review, then add accounts and postings |
| 16 | No ops endpoint to re-sync an order from the gateway (`fetch_payment`) | Missed webhooks need a gateway-side resend | Add `POST /payments/orders/{id}/sync` (F) using the idempotent capture path |
| 17 | Resolved in code: such payments are held `authorized` for `POST /payments/orders/{id}/amount-review` (accept or return, §3.3) | — | Alert on `payments.amount_review_required` |
| 18 | Captures on `expired`/`cancelled` orders are accepted (money is never lost); `pending` orders never expire | A payment can land on a cancelled booking | Auto-refund, or flag captures on cancelled bookings for finance |
| 19 | Resolved in code: commission invoices, credit notes and agent statements are issued per processed payout (§10.2). Set `platform_gstin` and `platform_gst_state`; formats need CA review. | — | CA review of the PDF layout and SAC |
