# User journeys — end to end

> Owner: product-docs · Baseline: [PLAN.md](../PLAN.md) and the repo as of 2026-10-21 · Related:
> [ROADMAP.md](ROADMAP.md) · [store compliance gaps](../store/COMPLIANCE_GAPS.md) · [PAYMENTS.md](../PAYMENTS.md).

Each journey lists its steps with the **screen** (mobile app and web), the **API** call (PLAN §8, prefix `/api/v1`)
and the **events and notifications** the step triggers (PLAN §6.1, plus events found in the code). Steps that
notify nobody today are marked **gap** and collected in §7.

## 0. Ground rules that shape every journey

- **Doors (PLAN §3.1).** Patients, agents and hospital users use the public door: the website `/login` on the web,
  and **one login screen in the mobile app**, which routes each role to its own section after sign-in. Staff use
  the web-only staff door (email + password + TOTP); the app refuses staff accounts.
- **Mobile sections.** Patient: Home · Search · Trips · Messages · Profile. Agent: Dashboard · Patients · Cases ·
  Bookings · Earnings (`/agent/**`). Hospital: Dashboard · Enquiries · Patients · Settlements · More
  (`/hospital/**`). Partner onboarding (KYC, payout account, hospital profile wizard) is web-only.
- **English only.** UI, notifications, listings and voice intake (spoken English; no translation).
- **AI is a draft.** Screening suggestions, voice extraction and report reading always go through review → edit →
  confirm, and need the `ai_processing` consent naming Anthropic (CG-04, CG-33).
- **Notifications** are in-app (`notifications` + WebSocket) and e-mail; push is not built yet (CG-15). No medical
  details in push or e-mail.

Abbreviations: **P** patient, **A** agent, **H** hospital user, **S** staff (admin/support), **F** finance.

## 1. Direct patient

| # | Step | Mobile screen | Web screen | API | Events → notifications |
|---|---|---|---|---|---|
| 1.1 | First open, onboarding | `/onboarding` (3 pages) | Website home | — | — |
| 1.2 | Sign up / sign in / guest | `/auth`, `/auth/register` (Patient tab), `/auth/login`; Google; Apple on iOS (CG-02) | Website `/register`, `/login` → `/app/` | `POST /auth/register` · `/auth/login` · `/auth/google` · `/auth/apple` (missing, CG-02) · `/auth/guest` | `user.registered` → welcome notification and e-mail |
| 1.3 | Consents | Registration notice; AI consent sheet | Same | `POST /auth/consents` (`terms`, `privacy`, later `ai_processing`, `share_with_hospitals`) | Audit only |
| 1.4 | Browse | `/home`, `/search`, `/hospitals/:id`, `/doctors/:id` | Public pages | `/specialties`, `/procedures`, `/hospitals`, `/doctors`, `/search` | — |
| 1.5 | Screening steps 1–4 (typed, or by voice in English) | `/screening/new` → `/screening/:id/step/1..4`; voice sheet on steps 1–2 | Screening wizard | `POST /screenings`, `PATCH /screenings/{id}`; voice: `POST /voice/transcriptions` → `GET …/{id}` → `POST …/{id}/confirm` | `voice.transcribed` → in-app "transcript ready" |
| 1.6 | Add reports (photo or PDF), optional AI reading | Step 3, `features/documents_ai` | Step 3 `DocumentCapture` | `POST /documents`; `POST /documents/analyses` → `PATCH`/`POST …/confirm` | `document.uploaded`; `document.analyzed` → patient notified; `document.analysis_confirmed` |
| 1.7 | Submit; AI or rules engine | `/screening/:id/processing` | Processing view | `POST /screenings/{id}/submit {consent_ai}` (job `screening.run_ai`) | `screening.completed` → notification + WS |
| 1.8 | Emergency branch | Blocking interstitial (CG-05) | Same | `urgency`/`red_flags` in `ScreeningOut` | **gap**: no alert to a coordinator |
| 1.9 | Matches, compare, cost comparison | `/screening/:id/matches`, `/compare`, `/cost-comparison` | Matches, compare | `GET /screenings/{id}/matches`, `/cost-comparison` | — |
| 1.10 | Request a quote (guest must upgrade first) | "Book Consultation" → creates case; `/cases/:id` | Request quote | `POST /auth/guest/upgrade`; `POST /cases` | `case.created` → case conversation created; hospital members notified |
| 1.11 | Hospital sends quote (journey 3) | `/cases/:id` | Case detail | — | `quote.sent` → patient (and agent) notified |
| 1.12 | Accept or reject quote | `/cases/:id` | Case detail | `POST /cases/{id}/quotes/{qid}/accept` · `/reject` | `quote.accepted` → hospital notified; reject: **gap** |
| 1.13 | Book dates and package | `/book/:caseId` | Book | `GET /doctors/{id}/availability`; `POST /bookings` | `booking.created` → instalment schedule |
| 1.14 | Pay (biometric confirm) | `/pay/:bookingId` | Pay | `POST /payments/orders` → Razorpay → `POST …/verify`; or bank transfer `POST …/bank-transfer-proof` | `payment.captured` → booking paid, ledger posting, receipt; `payment.failed` → notification; first capture → `booking.confirmed` → checklist created, notification |
| 1.15 | Pre-arrival | `/trips` (countdown, checklist, quick actions) | Trip | `GET /patient/dashboard`; `PATCH /bookings/{id}/checklist/{item}`; `/travel/visa-requests`, `/travel/*-bookings` | Status changes on visa and travel: **gap** |
| 1.16 | Chat | `/messages`, `/messages/:id` | Messages | `/conversations/*` + WS | `message.created` → WS + notification |
| 1.17 | In India: schedule, map, helpline, SOS | `/support` | Trip | `GET /bookings/{id}/itinerary`; `/content/helplines`; `POST /travel/sos` | `sos.created` → coordinator and support notified; acknowledgement: **gap** |
| 1.18 | Admission and discharge (journey 3) | `/trips`, `/cases/:id` | Case | — | `booking.admitted`, `booking.completed` → notifications |
| 1.19 | Instalments, receipts | `/cases/:id` | Payments | `GET /payments/bookings/{id}/installments`; `/payments/invoices/{id}/pdf` | Due/overdue reminders: **gap** |
| 1.20 | Cancel | `/cases/:id` | Booking | `POST /bookings/{id}/cancel` | `booking.cancelled` → refunds per snapshot policy; `refund.processed` → notification |
| 1.21 | Delete account | Profile › Delete account | Profile › Delete account | `DELETE /auth/me` (409 `account_deletion_blocked` while treatment or payments are in progress) | `user.deleted` → modules scrub; blocked path needs a request flow (CG-01) |

## 2. Patient via agent (facilitator)

| # | Step | Mobile (agent section) | Web (agent portal) | API | Events → notifications |
|---|---|---|---|---|---|
| 2.1 | Agent registers | `/auth/register` (Agent tab, agency name) | Website `/register?role=agent` | `POST /auth/register {role:"agent", agency_name}` | `user.registered` |
| 2.2 | KYC, payout account (web only) | App shows "pending verification" (CG-32 point 6) | Profile & KYC, Payout account | `PUT /agent-portal/profile`, `POST /documents`, `POST /agent-portal/submit-kyc`, `POST /finance/payout-accounts` | — |
| 2.3 | Staff approve agency (journey 4) | — | — | `POST /admin/agents/{id}/approve` | `agent.approved` / `agent.rejected` → agent notified |
| 2.4 | Add a patient | `/agent/patients/new` | Patients › Add | `POST /agent-portal/patients` (invite e-mail if address given) | Invite e-mail; patient consent: **gap** (CG-14) |
| 2.5 | Or: patient signs up with the agent's referral code | Patient `/auth/register` | Website register | `POST /auth/register {referral_code}`; `GET /agent-portal/referral` | Agent notified: **gap** |
| 2.6 | Screening on the patient's behalf (typed, voice in English, report photos) | `/agent/patients/:id/screening`, `/agent/screenings/:id` | New screening | `POST /screenings {patient_id}`, `PATCH`, `POST …/submit`; voice and docai as 1.5–1.6 | `screening.completed` → agent and patient notified |
| 2.7 | Compare hospitals and request quotes | `/agent/patients/:id/compare`, `/agent/patients/:id/request-quote` | Cases › Create | `GET /screenings/{id}/matches`; `POST /cases {patient_id}` (one per hospital) | `case.created` per case |
| 2.8 | Compare quotes, accept | `/agent/cases/:id` | Case detail, quote comparison | `POST /cases/{id}/quotes/{qid}/accept` | `quote.accepted` |
| 2.9 | Book and pay on behalf | `/agent/cases/:id/book`, `/agent/bookings/:id` | Book, Pay | `POST /bookings`; `POST /payments/orders` (A) | As 1.13–1.14; patient also notified |
| 2.10 | Track trip and chat | Bookings tab, case chat | Messages | §8.8, §8.9 | `message.created` |
| 2.11 | Commission after discharge | Earnings | Commissions | `GET /agent-portal/commissions`, `/finance/summary`, `/finance/settlements/payouts` | `booking.completed` → settlement item; `payout.processed` / `payout.failed` → agent notified |
| 2.12 | Agent deletes account | **missing** in the agent section (CG-01) | **missing** | `DELETE /auth/me` (blocked while the agent has active cases) | `user.deleted` |

## 3. Hospital provider

| # | Step | Mobile (hospital section) | Web (hospital portal) | API | Events → notifications |
|---|---|---|---|---|---|
| 3.1 | Register or accept member invite | `/auth/register` (Hospital tab) | Website `/register?role=hospital`; invite link | `POST /auth/register {role:"hospital", hospital_name, city}`; `POST /auth/accept-invite` | `user.registered` |
| 3.2 | Onboarding wizard, KYC, payout account, submit (web only) | "Pending verification" state | Onboarding wizard | `PUT /hospital-portal/profile`, `/hospital-portal/doctors`, `/procedures`, `/packages`, `POST /hospital-portal/submit-for-review` | — |
| 3.3 | Staff approve hospital | — | — | `POST /admin/hospitals/{id}/approve` | `hospital.approved` / `hospital.rejected` → hospital notified |
| 3.4 | New enquiry arrives | Enquiries, `/hospital/cases/:id` | Enquiries inbox | `GET /cases?status=enquiry` (scoped by `X-Hospital-Id`) | `case.created` → hospital members notified |
| 3.5 | Review case (confirmed report data only) | `/hospital/cases/:id` | Case detail, clinical view | `GET /cases/{id}`, `GET /documents/analyses?case_id=` | — |
| 3.6 | Send itemised quote, or decline | `/hospital/cases/:id/quote` | Send quote / Decline | `POST /cases/{id}/quotes`; `POST /cases/{id}/status` | `quote.sent` → patient/agent; decline → `case.status_changed` → patient/agent |
| 3.7 | Booking confirmed; visa letter | `/hospital/visas` | Visa invitation letters | `PATCH /travel/visa-requests/{id}` | `booking.confirmed` → hospital notified; visa status change: **gap** |
| 3.8 | Itinerary for the patient | `/hospital/itineraries`, `/hospital/bookings/:id` | Bookings › itinerary | `POST/PATCH /bookings/{id}/itinerary` | Patient sees it on `/support`; no notification: **gap** |
| 3.9 | Admit, then discharge | `/hospital/bookings/:id` (Admit / Discharge) | Bookings | `POST /bookings/{id}/admit` · `/complete` | `booking.admitted`; `booking.completed` → revenue recognition, settlement items, notifications |
| 3.10 | Settlements (read-only) | Settlements tab | Finance | `/finance/summary`, `/finance/settlements/items`, `/payouts`, `/finance/statements` | `payout.processed` / `payout.failed` → hospital notified |
| 3.11 | Doctors, availability, price list | `/hospital/doctors`, `/hospital/price-list` (view) | Doctors, Procedures & pricing | `/hospital-portal/doctors`, `/availability`, `/procedures` | — |
| 3.12 | Hospital user deletes account | **missing** in the hospital section (CG-01) | **missing** | `DELETE /auth/me` (blocked for the owner of a listed hospital) | `user.deleted` |

## 4. Admin operations (staff console, web only)

| # | Step | Screen | API | Events → notifications |
|---|---|---|---|---|
| 4.1 | Staff sign-in with TOTP | Staff door login | `POST /auth/staff/login` (+ refresh/logout) | Every attempt audited |
| 4.2 | Approve partners | Hospitals / Agents approval queues | `POST /admin/hospitals/{id}/approve|reject|suspend`, `/admin/agents/{id}/…` | `hospital.*`, `agent.*` → partner notified |
| 4.3 | Assign coordinator | Cases | `POST /cases/{id}/assign-coordinator` | Coordinator added to the case conversation; patient notified: **gap** |
| 4.4 | Travel desk: visa, flights, stays, translators, guides | Travel desk | `/travel/*` PATCH | Status → checklist items; patient notification: **gap** |
| 4.5 | SOS handling | Travel desk › SOS | `GET /travel/sos`, `PATCH /travel/sos/{id}` | `sos.created` received; acknowledgement to patient: **gap** |
| 4.6 | Catalog, content, settings | Catalog, Content, Settings | `/admin/*` CRUD, `PUT /admin/settings/{key}` | Audit log |
| 4.7 | Users and support | Users | `/admin/users`, `PATCH /admin/users/{id}` | Audit log |
| 4.8 | Deletion requests that were blocked | — (not built) | — | Needs a queue (CG-01) |
| 4.9 | Store review fixture | — | Review-fixture command (CG-06) | Excluded from reports |

## 5. Finance

| # | Step | Screen | API | Events → notifications |
|---|---|---|---|---|
| 5.1 | Bank-transfer reconciliation | Bank transfers | `POST /payments/orders/{id}/mark-paid` | `payment.captured` → booking, ledger, patient |
| 5.2 | Refunds | Refunds | `POST /payments/refunds`, `/approve` · `/reject` | `refund.processed` → ledger, booking, clawback, patient; request created: **gap** |
| 5.3 | Ledger checks | Ledger, trial balance | `/finance/ledger/*` | — |
| 5.4 | Settlement items: hold or release | Settlements | `POST /finance/settlements/items/{id}/hold` · `/release` | — (job `settlements.mark_eligible`) |
| 5.5 | Batch, approve (maker ≠ checker), process | Settlements › batches | `POST /finance/settlements/batches`, `/approve`, `/process` | Batch awaiting approval: **gap** |
| 5.6 | Payouts | Payouts | `POST /finance/settlements/payouts/{id}/mark-paid` · `/mark-failed` | `payout.processed` / `payout.failed` → ledger, payee |
| 5.7 | Reports and exports | Reports | `/admin/reports/*`, `/finance/summary` | — |

## 6. Cross-journey checks

- Every journey works in **both** the mobile section and the web portal for P, A and H, except partner onboarding
  (web only) and staff (web only).
- A role can never reach another role's section (router guard on mobile, redirect on web).
- Each consent is recorded before the action that needs it (`share_with_hospitals` before `POST /cases`,
  `ai_processing` before any AI call).
- Deletion is reachable from every role (CG-01).

## 7. Gaps found while mapping the journeys

| Gap | Journeys | Recommendation | Owner |
|---|---|---|---|
| Quote rejected or expired notifies nobody | 1.12, 3.6 | Publish `quote.rejected` / `quote.expired`; notify hospital and agent | be-cases, be-messaging |
| Visa, flight, stay and service status changes notify nobody | 1.15, 3.7, 4.4 | Publish `travel.status_changed`; notify patient and agent | be-cases, be-messaging |
| SOS acknowledged / resolved not told to the patient | 1.17, 4.5 | `sos.acknowledged` → patient notification | be-cases, be-messaging |
| Emergency screening result alerts nobody | 1.8 | Notify the coordinator or support on `urgency=emergency` | be-screening, be-messaging |
| Consultation scheduled | 1.x | `consultation.scheduled` → patient | be-cases |
| Instalment due or overdue | 1.19 | Periodic job + `installment.due` / `installment.overdue` | be-payments |
| Refund requested | 5.2 | `refund.requested` → finance queue | be-payments |
| Settlement batch awaiting approval | 5.5 | `settlement_batch.pending_approval` → other finance users | be-finance |
| Coordinator assigned | 4.3 | Notify the patient and agent | be-cases |
| Itinerary added or changed | 3.8 | Notify the patient | be-cases |
| Referred patient signed up | 2.5 | Notify the agent (after patient consent, CG-14) | be-auth, be-messaging |
| Agent acts for a patient without the patient's consent on record | 2.4–2.9 | `share_with_agent` consent; AI and hospital sharing only with patient consent | CG-14 |
| Partner deletion not reachable in the app or partner portals | 2.12, 3.12 | Add to the account menu and portals | CG-01 |
| Blocked deletion has no request queue | 1.21, 4.8 | Request record + staff queue + 30-day promise | CG-01 |
| Pending partner sees empty screens | 2.2, 3.2 | "Pending verification" state in the app | CG-32 |
