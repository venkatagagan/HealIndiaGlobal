# Developer tools: `simulate_webhooks.py` and `check_contracts.py`

Two standalone scripts for the Heal India Global repo. Both use **only the Python standard library**, so any
Python 3.10+ runs them (on this machine `C:\NewProjects\python313\python.exe`, or the backend venv). Run them
from the repo root. Neither script ever prints a value from `backend/.env`.

| Script | Purpose |
|---|---|
| [`simulate_webhooks.py`](#simulate_webhookspy) | Sends correctly signed Razorpay and Stripe webhook deliveries to the local API, to test signature checks, idempotency, the Stripe timestamp tolerance, and payment/refund handling without a gateway account or a tunnel. |
| [`check_contracts.py`](#check_contractspy) | Compares the backend's real routes with the web and mobile client calls and with `docs/PLAN.md`. Reports missing routes, method mismatches, unimplemented PLAN endpoints, and duplicate or shadowed routes. Exits 1 on CRITICAL findings. |

---

## simulate_webhooks.py

Builds realistic gateway payloads for a given order/payment id, amount and currency, signs them exactly the
way the gateway does, and POSTs them to `http://127.0.0.1:8000/api/v1/payments/webhooks/{razorpay|stripe}`
(PLAN §8.11). It prints the HTTP status and body of each delivery.

| Gateway | Signature | Event id |
|---|---|---|
| Razorpay | `X-Razorpay-Signature`: hex HMAC-SHA256 of the **raw body**, keyed with `RAZORPAY_WEBHOOK_SECRET` | `X-Razorpay-Event-Id` header |
| Stripe | `Stripe-Signature: t=<unix>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">`, keyed with `STRIPE_WEBHOOK_SECRET` (the whole `whsec_...` string) | body `id` (`evt_...`) |

Payloads follow the gateway documentation: Razorpay sends compact JSON with `payload.payment.entity` (plus
`payload.refund.entity` for refunds). Stripe sends a pretty-printed `event` object. Stripe payloads include
both the current fields (`latest_charge`) and the legacy embedded lists (`charges`, `charge.refunds`), so a
parser written against either the old or the new docs finds what it needs. The backend's `charge.refunded`
handler reads `data.object.refunds.data[]`.

### Prerequisites (one-time, in `backend/.env`, then restart the API)

```
PAYMENT_GATEWAYS_ENABLED=mock,bank_transfer,razorpay,stripe   # a gateway that is not enabled answers 404
RAZORPAY_WEBHOOK_SECRET=<any test secret>                     # empty -> 400 webhook_not_configured
STRIPE_WEBHOOK_SECRET=whsec_<any test secret>
```

Start the API: `cd backend && .venv/Scripts/python -m uvicorn app.main:app --port 8000`.

The secret is resolved like the API's settings: **process environment first, then `backend/.env`** (use
`--env-file` for another file). `--secret` overrides both. Use it only with throwaway test secrets, because
command lines end up in shell history and process listings. If no secret is configured, the script stops
with exit 2. The one exception is `--bad-signature`, which then signs with a random key.

### Events

| Gateway | Success | Failure | Refund |
|---|---|---|---|
| razorpay | `payment.captured` | `payment.failed` | `refund.processed` |
| stripe | `payment_intent.succeeded` | `payment_intent.payment_failed` | `charge.refunded` |

The aliases `success`/`captured`, `failed`, and `refund` map to the right event for either gateway. If you
pass the other gateway's event name, it is translated to the equivalent event.

### Which ids to pass

Take them from the order you created with `POST /payments/orders` (`CheckoutOut.order`), using
`GET /payments/orders/{id}`.

| Option | Razorpay | Stripe |
|---|---|---|
| `--order-id` | `PaymentOrderOut.gateway_order_id` (`order_...`) | `PaymentOrderOut.gateway_order_id` (`pi_...`). The API stores the PaymentIntent id as both the order id and the payment id. |
| `--payment-id` | Razorpay payment id (`pay_...`, any new value for a first capture) | charge id `ch_...` (`latest_charge`), optional |
| `--refund-id` (refund events) | `refunds.gateway_refund_id` (`rfnd_...`) of the refund finance created | `refunds.gateway_refund_id` (`re_...`) |
| `--meta order_id=<uuid>` | goes into `notes`; the API uses it as a fallback order lookup | goes into `metadata`; same fallback |
| `--amount` / `--currency` | minor units + ISO code of the order (`amount_minor`, `currency`) | same (sent lowercase, as Stripe does) |

Ids you omit are generated. The request still exercises signature verification and dedupe, but the API finds
no matching order (the script prints a note saying so).

### Walkthroughs

```bash
py=scripts/simulate_webhooks.py

# 1. Capture: should answer 200 {"status": "processed", ...}; the order becomes paid, the booking is
#    confirmed once the deposit is covered, and the ledger capture is posted
python $py razorpay payment.captured --order-id order_Pq1... --payment-id pay_Pq1... --amount 2500000 --currency INR
python $py stripe payment_intent.succeeded --order-id pi_3Q... --amount 250000 --currency USD --meta order_id=0192...

# 2. Idempotency: the identical event is delivered twice. Both must be 2xx and the second must be
#    {"status": "duplicate"}, with no second payment or ledger posting
python $py stripe success --order-id pi_3Q... --amount 250000 --replay
python $py razorpay success --order-id order_Pq1... --amount 2500000 --replay --event-id KzUgnJ2fyqk7v1

# 3. Tampering: wrong key -> expect 400 invalid_signature and no row in webhook_events
python $py razorpay payment.captured --order-id order_Pq1... --bad-signature

# 4. Replay window (Stripe only): t is 600 s old (> 300 s tolerance) with a valid HMAC -> expect 400
python $py stripe payment_intent.succeeded --order-id pi_3Q... --stale            # or --stale-seconds 900

# 5. Failure: order -> failed, the patient gets a notification
python $py razorpay payment.failed --order-id order_Pq1... --error-description "Card declined by bank"

# 6. Refund processed: refund -> processed, ledger reversal, booking.amount_refunded_minor updated
python $py stripe charge.refunded --order-id pi_3Q... --amount 250000 --refund-amount 50000 --refund-id re_3Q...
python $py razorpay refund.processed --order-id order_Pq1... --payment-id pay_Pq1... --amount 2500000 \
       --refund-amount 500000 --refund-id rfnd_Pq1...

# 7. Inspect without sending
python $py stripe refund --dry-run            # prints the payload and the signature headers
python $py razorpay success --show-payload    # sends and also prints the body
```

### Options (most useful)

| Option | Meaning |
|---|---|
| `--replay` / `--replay-delay S` | send the same event twice (Stripe re-signs the retry with a fresh `t`, as Stripe does) |
| `--bad-signature` | sign with the wrong key (expects 4xx) |
| `--stale` / `--stale-seconds N` / `--timestamp T` | Stripe timestamp outside the 300 s window, or an exact `t` |
| `--event-id ID` | reuse an event id across runs (dedupe across process restarts) |
| `--refund-amount`, `--total-refunded` | partial refunds; `--total-refunded` = cumulative refunded on the payment |
| `--method card\|upi\|netbanking\|wallet\|emi`, `--fee`, `--tax`, `--base-amount` | Razorpay payment details (default fee about 2% + 18% GST) |
| `--event-name NAME` | advanced: same payload shape, different event type (e.g. check that unknown events are `ignored`) |
| `--base-url URL` / `--url URL` | another API origin (`/api/v1` is appended unless present) or an exact URL |
| `--expect-status CODE` | make the exit status depend on an exact HTTP code (scripting / CI) |
| `--dry-run`, `--show-payload`, `--timeout S` | |

### Reading the output

Every delivery prints `HTTP <status>`, the `x-request-id`, and the pretty-printed body. Where the outcome is
recognisable, a one-line hint follows:

| Response | Meaning |
|---|---|
| `200 {"status": "processed"}` | verified, stored in `webhook_events`, applied |
| `200 {"status": "duplicate"}` | the event id was seen before; nothing was applied again (expected on the 2nd `--replay` delivery) |
| `200 {"status": "ignored"}` | the event type is not handled |
| `200 {"status": "error"}` | stored, but processing failed; see `webhook_events.processing_error` (an unknown order id is the usual cause) |
| `400 invalid_signature` | expected with `--bad-signature` / `--stale`. Otherwise the API's secret differs from the one used (restart the API after editing `.env`?) |
| `400 webhook_not_configured` | the API has no webhook secret for that gateway |
| `404` | the gateway is not in `PAYMENT_GATEWAYS_ENABLED`, or the URL is wrong |

**Exit status:** `0` = every delivery got the expected status (2xx normally, 4xx for `--bad-signature`/`--stale`,
or exactly `--expect-status`); `1` = an unexpected status; `2` = usage/configuration/connection error.

---

## check_contracts.py

```bash
python scripts/check_contracts.py                     # text report; exit 1 if any CRITICAL
python scripts/check_contracts.py -q                  # sources + summary + CRITICAL only
python scripts/check_contracts.py --json > contracts.json
python scripts/check_contracts.py --json-file contracts.json --max-items 0   # text on screen, JSON on disk
python scripts/check_contracts.py --inventory         # also list every route / client call / PLAN endpoint
python scripts/check_contracts.py --backend-mode ast  # static scan only (no venv import; about 5 s)
python scripts/check_contracts.py --fail-on warning   # stricter CI gate
```

It takes about 20 s with the import (dominated by importing the app) and about 5 s in AST mode. It works on
partial trees: missing directories are listed under *Sources*, and the checks that need them are skipped.

### What is compared

| Source | How it is read |
|---|---|
| **backend** | `app.main:app` is imported **in the backend venv** (`backend/.venv`, as a subprocess, `PYTHONDONTWRITEBYTECODE=1`). Every effective route is listed, including routes with `include_in_schema=False` and the WebSocket, with its `file:line` and path-parameter types; the list is cross-checked with `app.openapi()`. FastAPI 0.156 keeps included routers nested (`_IncludedRouter`), so the routes are read through `fastapi.routing.iter_route_contexts`, not `app.routes`. **If `app.main` does not import**, each `app.modules.<x>.router` is imported separately. Modules that still fail, or a missing venv, fall back to an `ast` scan of `backend/app/**/*.py`: route decorators, `add_api_route`, `APIRouter(prefix=…)`, and `include_router` chains (including the `for _router in (...)` loop in `app/api.py`), resolved through imports. |
| **web** | `web/packages/shared/src/api/endpoints/*.ts` (primary), the rest of `web/packages/shared/src`, and `web/apps/*/src` (skip these with `--no-web-apps`). Recognised: `api.get/post/put/patch/delete/upload/download/downloadAndSave(...)`, `request('POST', path)`, `fetch(buildUrl('/x'), {method})`, `fetch('/api/...')`. Paths are relative to the client base `/api/v1`. |
| **mobile** | `mobile/lib/core/repositories/*.dart` and `core/auth/auth_repository.dart` (primary), plus every other `.dart` under `mobile/lib`: `_api.get/post/put/patch/delete/upload/getBytes/…(...)`, dio `request(..., options: Options(method: ...))`. |
| **PLAN** | `docs/PLAN.md` §8 tables and paragraphs, plus endpoints written with an explicit method elsewhere in the plan (currently §3.1 staff door `/auth/staff/*`, §7.1 docai `/documents/analyses…`, §7.2 voice `/voice/…`). `--plan-section8-only` ignores those. |

Client path extraction understands template literals and Dart interpolation (`${id}`, `$id`), `+`
concatenation, constants used as base paths (`const BASE = '/hospital-portal'`, Dart `static const`; the nearest
definition wins), query strings (`?…`, `${buildQuery(q)}`) and comments. In endpoint and repository files,
any other `/`-rooted string literal (for example a CRUD factory `crud('/admin/specialties')`) counts as a path
reference with an unknown method (`ANY`). Any string containing `/ws?…` counts as a WebSocket client
(`WS /api/v1/ws`). Calls to the same method and path from several places are merged; all locations are kept.

PLAN syntax handled: `` METHOD `/path` `` and `` `METHOD /path` ``; `GET/PATCH` combos; method carry-over
(`` POST `/a` · `/b` ``); sibling shorthands (`` POST `/x/{id}/approve` · `/reject` `` → `/x/{id}/reject`);
`` `/admin/agents/{id}/approve|reject|suspend` ``; `CRUD /x` → `GET /x`, `POST /x`, `PATCH|PUT /x/{id}`,
`DELETE /x/{id}`, plus an optional `GET /x/{id}`; `GET/POST/PATCH /x` → `PATCH` on `/x` **or** `/x/{id}`;
the "GET path" table in §8.4; absolute paths in §8.14 (`/health/*`, `/metrics`, `/api/docs`). Query strings
are ignored.

**Matching:** path parameters match each other whatever their names (`{id}` = `${slugOrId}` = `$id` = `:id`).
A literal client segment that hits a backend parameter is checked against the parameter's type: a `UUID`/`int`
parameter rejects words, an enum/`Literal` parameter accepts only its values, and a `str` parameter gives a
*weak* match (WARNING `client_weak_match`, for example a client calling `/notifications/unread-count` when only
`/notifications/{id}` exists).

### Findings

| Severity | Category | Meaning / what to do |
|---|---|---|
| CRITICAL | `client_route_missing` | A client calls a path the backend does not serve at all. The message says whether the call is *in PLAN §x (backend not implemented yet)*, *NOT in PLAN (client invented this path)*, or that the backend serves it *at the root, outside /api/v1*. |
| CRITICAL | `client_method_mismatch` | The path exists, but not with that method (a 405 at runtime) |
| WARNING | `backend_import_failed` / `backend_syntax_error` / `openapi_failed` | The API cannot start, a file does not parse, or `/api/openapi.json` would raise. The error text is scrubbed of `.env` secrets. |
| WARNING | `client_weak_match` | Only a generic `{param}` route catches the call (see above) |
| WARNING | `trailing_slash_mismatch` | Client and route differ by a trailing `/` (a 307 redirect) |
| WARNING | `backend_duplicate_route` | The same method and path are registered twice; the first one wins |
| WARNING | `backend_shadowed_route` | An earlier `{param}` route captures a later literal route (e.g. `/x/{id}` declared before `/x/stats`), so the later route is unreachable. Registration order is exact in import mode and inferred in AST mode. |
| WARNING | `backend_unmounted_router` | (AST mode) A router has routes but is never included into the app |
| WARNING | `plan_method_mismatch` | A PLAN path is served, but not with the PLAN's method |
| WARNING | `plan_not_implemented` | A PLAN endpoint has no backend route (grouped by PLAN section) |
| INFO | `plan_optional_not_implemented` | The CRUD-derived `GET /x/{id}` is missing |
| INFO | `plan_weak_match` | A PLAN literal path is served only by a generic `{param}` route |
| INFO | `backend_not_in_plan` | A backend route the PLAN does not describe (record the deviation, or add it to the PLAN) |
| CRITICAL | `field_request_rejected` | The client body has a key the backend schema forbids (`extra="forbid"` -> 422) |
| CRITICAL | `field_required_missing` | The client never sends a body field / query param the backend requires (422) |
| CRITICAL | `field_content_type` | JSON vs multipart mismatch between client and route |
| WARNING | `field_request_ignored` | A body/form key the backend does not read (silently dropped) |
| WARNING | `field_query_unknown` | A query param the route does not declare (ignored) |
| WARNING | `field_response_unknown` | A client model relies on a response field the backend never sends (TS: required property; Dart: any key read in `fromJson`) |
| INFO | `field_response_optional_unknown` | A TS response type declares an optional field the backend never sends |

**Exit status:** `1` when findings reach `--fail-on` (default `critical`; `warning` makes WARNINGs fail too;
`never` always gives 0), otherwise `0`; `2` on usage errors. The JSON report (`--json`/`--json-file`) has
`sources`, `summary`, `by_category`, `stats` (PLAN implemented N/M, client calls resolved N/M), and
`findings[]` (`severity`, `category`, `method`, `path`, `label`, `message`, `locations`, `group`). With
`--inventory` it also includes `inventory.backend_routes`, `inventory.client_calls` and
`inventory.plan_endpoints`.

### Options

| Option | Default | |
|---|---|---|
| `--root PATH` | parent of `scripts/` | repository root |
| `--backend-mode auto\|ast` | `auto` | `auto` = import → per-module import + AST → AST; `ast` = static only |
| `--python PATH` | `backend/.venv/Scripts/python.exe` (or `bin/python`) | interpreter for the import step |
| `--import-timeout S` | 120 | |
| `--no-web-apps` | off | only scan `web/packages/shared` |
| `--plan-section8-only` | off | ignore PLAN endpoints defined outside §8 |
| `--fail-on critical\|warning\|never` | `critical` | |
| `--max-items N` | 40 | text mode: items or groups per category (0 = all) |
| `--no-fields` | off | skip the request/response field checks |
| `-q/--quiet`, `--json`, `--json-file F`, `--inventory` | | |

### Limitations

* Client extraction is pattern-based. A path computed at runtime from variables the tool cannot resolve is not
  checked. Use `--inventory` to see exactly what was found.
* Field checks (import mode only; they need `app.openapi()`) compare, per call site, the statically visible
  shape: TS object literals, `FormData.append('x', ...)`, parameters typed with an interface / alias from
  `web/packages/shared` (`Partial`/`Omit`/`Pick`/`&`/`extends` are followed) and the `api.get<T>` response
  generic (`Page<T>`, `T[]` unwrapped); Dart `data:`/`query:`/`fields:` map literals (incl. `compactJson({...})`,
  `x.toJson()` of a model, one nesting level) and the keys read by `X.fromJson` in the same statement. Bodies
  built at runtime are skipped; enum values and types are not compared.
* Paths wrapped in `rootUrl(...)`/`originUrl(...)` are taken as origin-root paths (no `/api/v1` prefix).
* Untyped (`str`) path parameters cannot tell an id from a word, which is why `client_weak_match` is a
  WARNING rather than a CRITICAL.
