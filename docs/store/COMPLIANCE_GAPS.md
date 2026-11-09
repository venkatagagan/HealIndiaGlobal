# Store & privacy compliance gaps — build actions

> Owner: product-docs · Applies to: the Flutter app (`mobile/`), which serves patients, agents and hospital users
> through one login with role-based sections (PLAN §3.1; staff are web-only), plus the backend, web and website
> pieces it depends on. The product is English only (listings, UI and voice intake).
> **Revised 2026-10-21 (evening):** CG-01, CG-02, CG-04, CG-06, CG-09 re-checked against the repo; CG-32 and CG-33
> added for the role sections, voice intake and camera capture.
> Basis: the repo as of 2026-10-21 and the App Store / Google Play policy texts checked that day (sources are in
> [GOOGLE_PLAY.md §12](GOOGLE_PLAY.md#12-sources) and [APP_STORE.md §13](APP_STORE.md#13-sources)).
> Store rules change. Re-check before each submission.

This is the single register both store documents refer to (`CG-xx`). Each gap lists evidence in the repo, the
store or legal basis, and a concrete fix with an owner taken from PLAN §2.2. Nothing here changes PLAN. Items that
need a PLAN change (new endpoint, enum value or event) say so and belong under `cross_module_requests`.

**Priorities:** **P0** blocks store submission or causes near-certain rejection · **P1** fix before public launch
(high legal or review risk) · **P2** fix soon after launch.

## Summary

| ID | Gap | Pri | Stores | Primary owners |
|---|---|---|---|---|
| CG-01 | Account deletion: backend `DELETE /auth/me` and the patient sheet exist; **missing** in the agent and hospital sections, no MFA-code field, no request path when blocked, no public web page | P0 | Both | be-auth, fl-onboarding, flutter (agent/hospital shells), web-agent, web-hospital, public-website |
| CG-02 | Sign in with Apple: app button wired, **backend `POST /auth/apple` missing**, no entitlement, no token revocation | P0 | Apple | be-auth, backend-models, flutter-foundation |
| CG-03 | Unsubstantiated or false claims in app UI and designs | P0 | Both | fl-onboarding, fl-screening, fl-journey, web-public, public-website, brand-assets |
| CG-04 | Third-party AI (Anthropic) disclosure and explicit opt-in not yet specified end to end | P0 | Both | fl-screening, web-patient, be-screening, docs/legal |
| CG-05 | Medical disclaimers and emergency handling in the app and listing | P0 | Both | fl-screening, web-patient, product-docs (listing) |
| CG-06 | Reviewer access: dedicated review accounts for patient, agent and hospital (not the seeded demo password) | P0 | Both | seed-data, release manager |
| CG-07 | Organisation developer accounts, legal entity, D-U-N-S, EU trader status | P0 | Both | Business / legal |
| CG-08 | Privacy policy: public URL, in-app link, required content | P0 | Both | docs/legal, public-website, fl-onboarding |
| CG-09 | No iOS privacy manifest; two plugins ship none | P0 | Apple | flutter-foundation |
| CG-10 | Location permission declared with no location code | P0 | Both | flutter-foundation, fl-journey |
| CG-11 | Placeholder platform config: Flutter default icons, iOS Google client ID, debug release signing, final app IDs | P0 | Both | flutter-foundation, brand-assets, deploy-iac |
| CG-12 | Store privacy forms must match the shipped binary (Razorpay SDK, future SDKs) | P0 | Both | Release manager, flutter-foundation |
| CG-13 | AI "possible conditions" shown to patients raises medical-device (SaMD) exposure | P1 | Both | fl-screening, web-patient, be-screening, legal |
| CG-14 | Agents see patient data without a patient consent record | P1 | Both | backend-models, be-auth, be-messaging, be-screening, be-cases, web-agent |
| CG-15 | Push notifications not implemented; content and opt-in rules needed when they are | P1 | Both | flutter-foundation, be-messaging |
| CG-16 | No way to report content (chat, AI results, future reviews) | P1 | Both | be-messaging, be-admin, fl-journey, fl-screening, web-patient, web-admin-ops |
| CG-17 | Payment screen copy ("Pay with Face ID", "with Affirm"), biometric fallback, Face ID purpose string | P1 | Both | fl-journey, web-patient, flutter-foundation |
| CG-18 | Instalments that run past treatment are credit (Financial features declaration) | P1 | Google | be-payments, be-cases, product |
| CG-19 | Real hospital brands and accreditation or WHO logos in designs and screenshots | P1 | Both | brand-assets, fl-onboarding, store assets |
| CG-20 | Name can be confused with the Government of India "Heal in India" initiative | P1 | Both | Business / legal, product-docs |
| CG-21 | Personal health information must stay out of iCloud backups | P1 | Apple | flutter-foundation, fl-journey |
| CG-22 | Device and OS targets: iPad and landscape declared, Android API 36, 16 KB pages | P1 | Both | flutter-foundation |
| CG-23 | iOS release pipeline: Xcode 26 SDK, macOS CI, export-compliance key | P1 | Apple | deploy-iac, flutter-foundation |
| CG-24 | Age rating and audience vs Terms (18+); no adult attestation at sign-up | P1 | Both | be-auth, fl-onboarding, legal |
| CG-25 | Guest data retention: Terms (12 months) and DEPLOYMENT (90 days) disagree; no purge job | P1 | Both | be-auth, docs/legal |
| CG-26 | No data export (data subject request) endpoint | P2 | — (legal) | be-auth + modules |
| CG-27 | Paid tele-consult fees on Google Play: policy says nothing either way | P2 | Google | Product, be-payments |
| CG-28 | `google_fonts` fetches fonts from Google at runtime | P2 | Both (privacy) | flutter-foundation |
| CG-29 | OpenStreetMap tile usage policy and attribution in production | P2 | — (ops) | fl-journey, deploy-iac |
| CG-30 | Missing domain events, so some journey steps notify nobody | P2 | — (UX) | be-cases, be-messaging, be-payments |
| CG-31 | Logging hygiene: search queries and free text must not persist | P2 | Both (disclosures) | backend-core, infra |
| CG-32 | One app, three role sections: listing, review access, privacy forms and deletion must cover agents and hospital users; staff stay web-only | P0 | Both | Release manager, product-docs, flutter (shells), be-auth |
| CG-33 | Microphone (voice intake) and camera (report photos) now ship: privacy forms, purpose strings, pre-prompts and AI disclosure | P0 | Both | flutter (voice, documents_ai), be-voice, be-docai, docs/legal, release manager |

---

## P0 — blocks submission

### CG-01 · Account deletion (in-app + web)

**Status (re-checked 2026-10-21 evening).** Much of this now exists; the remaining gaps are listed first.
- **Done:** `DELETE /auth/me` (`backend/app/modules/auth/router.py`, rate-limited, password re-auth, TOTP when MFA
  is on, `RETENTION_RULES` returned, staff refused with `staff_account_deletion_not_allowed`, blockers per role:
  patient bookings and payments in progress, agent active cases, hospital owner of a listed hospital →
  409 `account_deletion_blocked` with details). Mobile: Profile › Delete account (`delete_account_sheet.dart`,
  guests included). Web: patient portal `DeleteAccountSection.tsx`.
- **Missing — agent and hospital sections in the app.** Their shells (`agent_shell.dart`, `hospital_shell.dart`)
  only offer "Log out" in `portal_account_menu.dart`; the router confines those roles to `/agent/**` and
  `/hospital/**`, so they can't reach the Profile sheet. Add "Delete account" to the account menu, reusing
  `showDeleteAccountSheet`, with role-specific text (agents: managed patients keep their own accounts and are told;
  hospital users: the hospital listing stays with the other members).
- **Missing — MFA.** Public-role users can enable TOTP (`/auth/mfa/*`) but the sheet has no code field, so they get
  `invalid_otp`. Add the field when `user.mfa_enabled`.
- **Missing — blocked path.** A 409 shows only an error banner. Apple accepts extra steps in regulated industries,
  not a dead end: show the blockers in plain words and a "Request deletion" button that records the request (see
  step 1 below or a support ticket) with a 30-day completion promise.
- **Missing — public web page** `https://healindiaglobal.com/account/delete` (no such page under `website/src/app`)
  and delete in the agent and hospital web portals. Play requires the web path for every role that can sign in to
  the app.
- **Missing — Apple token revocation** on deletion (CG-02).

The original analysis follows; where it differs from the implementation (immediate scrub vs 7-day grace), keep the
implementation unless counsel asks for a grace period.

**Original evidence.** PLAN §8.1 had no deletion endpoint. SECURITY.md F12 records the same gap.

**Basis.** Apple 5.1.1(v): "If your app supports account creation, you must also offer account deletion within the
app." Apple's deletion guidance adds:
- delete the whole account record and associated personal data, including user content shared with others such
  as reviews;
- deactivation is not enough;
- guest accounts must be deletable;
- tell people how long deletion takes, and what is retained for legal reasons;
- apps in highly regulated industries (healthcare qualifies) may add customer-service steps to confirm deletion.

Google Play needs an in-app path **and** a working web page where users can request deletion without the app.
That URL goes in the Data safety form. Deactivation or "freezing" does not count, and retention for legal reasons
must be disclosed.

**Recommendation.** These are proposed additions to PLAN §8.1 and §6.1.

1. **API (be-auth):**
   - `POST /auth/account-deletion` (👤): `{password? | otp_code? | id_token?, reason?}` returns
     202 `{status, scheduled_for, blockers[]}`. Re-authentication uses the password for password accounts and a
     fresh Google/Apple token for social accounts. Guests need no re-auth because the token is device-bound.
   - `GET /auth/account-deletion` (👤) returns the request status.
   - `DELETE /auth/account-deletion` (👤) cancels during the grace period.
   - Public web flow: `POST /auth/account-deletion/request-link` (🌐) `{email}` always returns 202 and emails a
     signed link. `POST /auth/account-deletion/confirm` (🌐) `{token}` schedules the deletion.
   - Model changes (backend-models): add `delete_account` to `verification_tokens.purpose`, and either a new
     `account_deletion_requests` table (`user_id, status requested|scheduled|blocked|cancelled|completed,
     channel app|web|support, reason, scheduled_for, blockers JSONB, completed_at`) or equivalent columns.
2. **Process:**
   - Grace period of **7 days** (cancellable), then execution. Disclose a maximum of **30 days** end to end.
   - A periodic job (e.g. `auth.execute_account_deletions`) publishes a new event **`user.deleted`** `{user_id}`.
     Each module scrubs its own tables in its handler, which keeps module boundaries (PLAN §1). Also publish
     `user.deletion_requested` so messaging can confirm by email and alert the coordinator if a case is active.
   - Write an audit-log entry (actor `system`) and send a final confirmation to the pre-scrub email.
   - **Blockers** (don't silently refuse): a booking in `confirmed|admitted`, pending refunds, or unpaid instalments
     after treatment. The request moves to `blocked`, the user sees why, and support finishes it. Apple permits
     this for regulated industries.
3. **Data map** (what the `user.deleted` handlers do):

   | Data (PLAN §4) | Action | Retained? (basis) | Owner |
   |---|---|---|---|
   | `users` | Null email, phone, full_name, avatar_url, google_sub, apple_sub, password_hash, mfa_secret; status `deleted`, `deleted_at` | Row id only, for FK integrity | be-auth |
   | `refresh_tokens`, `verification_tokens`, `device_tokens` | Delete | No | be-auth |
   | `consents` | Keep | Yes: proof of consent and withdrawal (limitation period, per counsel) | be-auth |
   | `audit_logs` | Keep. Before/after snapshots must not hold PII (SECURITY §13) | Yes: ≥ 1 year, longer for finance (DEPLOYMENT §13) | core |
   | `patient_profiles` | Null every personal and medical field (names, DOB, passport, phone, WhatsApp, address, emergency contact, blood group, allergies, medical history, insurance) | Row plus `country_of_residence` for aggregates | be-auth |
   | `patient_companions`, `saved_items` | Delete | No | be-auth |
   | `documents` + storage objects | Delete objects (all versions) and rows | Except `invoice`, `receipt`, and `payment_proof` linked to a payment: financial record | be-auth (documents) |
   | `screenings`, `screening_matches` | Delete; set `ai_request_logs.screening_id` to NULL (logs hold no PII) | No | be-screening |
   | `cases`, `quotes`, `case_status_history` | No payment: delete. Paid: keep amounts and statuses; null `patient_notes`, `medical_summary`, `quotes.treatment_plan` | Paid cases: as financial and contract record | be-cases |
   | `bookings`, `installments` | Keep; null `cancel_reason` | Yes: tax and accounting | be-cases / be-payments |
   | `consultations` | Null `notes`, `meeting_url`; keep fee fields | Fee record | be-cases |
   | `checklist_items`, `itinerary_items` | Delete | No | be-cases |
   | `visa_requests`, `travel_bookings`, `accommodation_bookings`, `service_bookings` | Unpaid: delete. Paid: keep amounts; null PNR, flight number, notes, `details` | Paid: financial record | be-cases |
   | `sos_alerts` | Null `lat`, `lng`, `message` once resolved | Incident row for a safety audit window (e.g. 12 months) | be-cases |
   | `messages`, `conversation_participants` | Replace the user's message bodies with "[deleted]"; detach attachments; remove the participant | No | be-messaging |
   | `notifications` | Delete | No | be-messaging |
   | `reviews` (when launched) | Delete | No (Apple names reviews explicitly) | be-catalog |
   | `payment_orders`, `payments`, `refunds`, `invoices` | Keep; null PII inside `metadata`/`raw` | Yes: 8 years (DEPLOYMENT §13 retention) | be-payments |
   | `ledger_*`, `settlement_*` | No change (no personal data; immutable) | — | be-finance |
   | Backups | Expire within the backup window; re-apply deletions after any restore (keep a deletion log) | Window only (e.g. 35 days) | infra |

   Also: ask processors to delete where applicable. Razorpay keeps records under RBI rules, so disclose that.
   Anthropic's retention follows the API terms (SECURITY §8.5). Tell the hospitals on linked cases. They are
   independent controllers and keep their own medical records under their own obligations, and the deletion page
   must say so.
4. **UI:**
   - Mobile: Profile › Settings › **Delete account** (fl-onboarding). This needs a route such as
     `/profile/delete-account` in `mobile/lib/core/router` (flutter-foundation, cross-module request). The screen
     shows: what is deleted; what is retained and why; the 7-day grace period; blockers; then a final confirmation.
   - Web: patient portal Profile › Security › Delete account (web-patient).
   - Public page `https://healindiaglobal.com/account/delete` (public-website). It must name the app and developer
     as listed on Play, give the in-app steps and a web request form, say what is deleted and retained and for how
     long, give the processing time and the Grievance Officer contact.
5. **Partial deletion (optional Google field "delete some data"):** these already exist:
   - `DELETE /documents/{id}`
   - `DELETE /patient/saved`
   - withdrawing consent via `POST /auth/consents {granted:false}`

   Add `DELETE /screenings/{id}` for screenings not linked to a case. Then publish
   `https://healindiaglobal.com/account/data`.
6. **Sign in with Apple accounts:** revoke tokens via Apple's REST API on deletion (see CG-02).

**Done when:** a patient (including a guest, a Google user and an Apple user), an agent and a hospital user can each
start deletion in the app and on the web; a blocked deletion offers a request path; Apple tokens are revoked; tests
cover blockers per role and idempotency.

### CG-02 · Sign in with Apple (Guideline 4.8)

**Status (re-checked 2026-10-21 evening).** The app side of option A is built: `sign_in_with_apple: ^8.2.0`,
`core/auth/apple_sign_in_service.dart` (nonce, iOS/macOS only, `APPLE_SIGN_IN_ENABLED` define), "Continue with
Apple" on both the Registration decision and login screens, labelled "Google and Apple sign-in are for patients".
Still missing: **`POST /auth/apple` in the backend** (the app calls it; nothing under `backend/app` handles it), the
`apple_sub` column, Apple token storage and revocation, server-to-server notifications, the Sign in with Apple
entitlement (`ios/Runner/Runner.entitlements` doesn't exist), and the private-relay e-mail domain. Until the
backend exists, either ship it or build with `--dart-define=APPLE_SIGN_IN_ENABLED=false` **and** hide Google on iOS
(option B); a visible Apple button that fails is a 2.1 rejection.

**Role rule.** The login screen is shared by patients, agents and hospital users. Social login must only create
patient accounts. Decide one rule for an existing partner whose e-mail matches (log in, or refuse with "Partner
accounts sign in with email and password") and apply it identically to Google and Apple. Never allow a staff account
through either.

**Original evidence.** The registration design and PLAN §11 `/auth` offer "Continue with Google"; the backend has
`POST /auth/google`.

**Basis.** Apple 4.8 (text checked 2026-10-21): apps that use a third-party login such as Google Sign-In for the
primary account "must also offer as an equivalent option another login service" that limits data to name and email,
"allows users to keep their email address private as part of setting up their account", and doesn't collect
interactions for advertising without consent. Our email/password sign-up is not such a service, because the user
cannot keep their email private. The exception "exclusively uses your company's own account setup" applies only if
Google sign-in is removed on iOS. Full analysis: [APP_STORE.md §4](APP_STORE.md#4-sign-in-options-and-guideline-48).

**Recommendation.** Option A is preferred. Option B is an acceptable stop-gap for v1.
- **A. Implement Sign in with Apple.**
  - Add the `sign_in_with_apple` plugin (a new dependency, so report it under `needed_dependencies`).
  - Backend: `POST /auth/apple {identity_token, authorization_code, raw_nonce, full_name?, role?: "patient"}`.
    - Verify the JWT against Apple's JWKS: `iss=https://appleid.apple.com`, `aud=com.healindiaglobal.app`
      (plus the web Services ID if used), `exp`, and `nonce = sha256(raw_nonce)`.
    - Exchange `authorization_code` at `/auth/token` using an ES256 client-secret JWT, and store the Apple refresh
      token encrypted (it is needed for revocation).
    - Link accounts on a new `users.apple_sub UNIQUE NULL` column (backend-models).
    - Accept `@privaterelay.appleid.com` emails as verified. Persist the name on first authorisation only (Apple
      sends it once).
  - Add a server-to-server notification endpoint `POST /auth/apple/notifications` for `email-disabled`,
    `email-enabled`, `consent-revoked` and `account-delete`.
  - On account deletion, call Apple's `/auth/revoke` with the stored token.
  - Register the sending domain with Apple's **Private Email Relay** (SPF/DKIM), or every email to relay addresses
    bounces.
  - Follow the public-door rules: creates `role=patient` only (PLAN §3.1); same partner rule as Google (above).
  - UI: Apple's standard button, at least as prominent as "Continue with Google", on the Registration decision
    screen. Do not ask again for the name or email that Sign in with Apple already provided (a frequent rejection
    reason): prefill the profile instead.
- **B. Hide "Continue with Google" on iOS** until A ships. Email/password plus guest only falls under the 4.8
  exception. Android keeps Google sign-in.

### CG-03 · Unsubstantiated or false claims (app UI, designs, listing)

**Evidence.** The design images, and code that copies them:

| Where | Current copy | Problem | Replace with |
|---|---|---|---|
| `mobile/lib/features/onboarding/onboarding_content.dart` `impactStat` | "500,000+ Patients Treated" | Unverifiable; the platform has treated no one yet | Remove, or a sourced and dated industry statistic with its source shown |
| same, `impactHeadline`; web hero `features/public/content.ts` | "World-Class Healthcare at 70% Less Cost" / "up to 70% less cost" | Absolute savings claim; varies by procedure and country | "Compare costs before you travel" + "Many procedures cost less in India*" with footnote "*Based on published price ranges; your quote may differ". Web: keep "up to" only with a methodology link (cost_benchmarks source) |
| same, badges | JCI · NABH · **WHO** ("Care that follows WHO patient-safety guidelines") | WHO does not accredit hospitals; logos imply endorsement | Drop WHO. Show JCI/NABH only on hospitals whose `accreditations[]` contain them, as text, not logos (CG-19) |
| same, trust page | "Zero Wait Time" | False absolute | "See availability before you book" / "Short waits at many hospitals" |
| same, trust page | "Joint Commission Certified · Internationally accredited facilities" | Blanket claim; not every partner is accredited | "Filter for JCI- and NABH-accredited hospitals" |
| Trust page design | Testimonial "Saved $45,000 on my cardiac surgery…" | Unattributed; Play Metadata policy bans unattributed testimonials in listings; consumer-protection rules | Only real, consented, attributed testimonials with date and "individual results vary", or none |
| Security & Process design | "HIPAA Compliant & SSL Secured" | HIPAA compliance is not claimed (SECURITY §17.3); "SSL" is inaccurate | "Encrypted connections. Passport numbers encrypted at rest." |
| Security & Process design | "Your medical data is never stored, only matched." | **False**: screenings, documents and cases are stored (PLAN §4.6, §4.9) | "Your medical information is stored securely and shared only with hospitals you choose." |
| AI processing design | "78% of patients find their doctor in first 3 matches" | Unsubstantiated statistic | Remove; or a tip: "Compare up to 3 matches side by side." |
| Matches design; `core/widgets/status_badge.dart` doc example | "98% Success" | Outcome claim with no definition or source | "Success rate (hospital-reported)" with an info sheet giving source and period, or omit. Never in screenshots |
| Home design | "Save 60–80%", "Save 50–70%"… | Savings claims per specialty | Hide in v1, or "Typical vs US prices*" with methodology; never in screenshots |
| Treatment selection design | "Save $500" | Promotional unless a real original price exists | Show only when `treatment_packages.original_price_minor` is set truthfully by the hospital |
| In-country support design | "Call 24/7 Helpline" | Only true if staffed 24/7 | Keep only once 24/7 staffing is in place; else "Call helpline" |

**Basis.** Google Play Deceptive Behaviour and Metadata policies, and Health Content and Services ("misleading health
claims"). Apple 1.4.1 (accuracy claims need disclosed methodology), 2.3 (accurate metadata) and 5.1.1(i) (a privacy
statement must be true). PLAN §9.9: "Honest copy: never claim certifications we don't hold."

**Recommendation.** Fix the strings above (fl-onboarding owns `onboarding_content.dart`; fl-screening owns the
processing and matches screens; fl-journey the support and payment screens; web-public and public-website the hero
copy). Keep a sourced-claims register in `content/`: every number shown to patients needs a source, date and owner.

### CG-04 · Third-party AI disclosure and explicit opt-in

**Evidence.** PLAN §7 sends intake JSON, and up to 3 reports, to the Claude API. `ConsentKind.ai_processing` and
`screenings.consent_ai` exist, and the mobile repository already posts consents. There is no specification of the
disclosure screen, and nothing server-side that ties the AI call to a recorded consent.

**Basis.** Apple 5.1.2(i) (checked 2026-10-21): "You must clearly disclose where personal data will be shared with
third parties, **including with third-party AI**, and obtain explicit permission before doing so." Google User Data
policy: prominent disclosure and consent for sensitive data. GDPR Art. 9 / DPDP consent (DEPLOYMENT §13).

**Recommendation.**
1. Step 4 "Use AI recommendations" stays **off by default** (as in the design). Turning it on opens a disclosure
   sheet. The sheet covers:
   - the provider by name: "Anthropic (Claude)";
   - what is sent (questionnaire answers, plus only the reports the user ticks);
   - what is not sent (name, contact details, passport);
   - the purpose (suggest specialties and urgency; not a diagnosis);
   - where it is processed (outside India);
   - retention (per provider terms);
   - how to withdraw (Profile › Privacy).

   Buttons: "I agree" / "Not now".
2. Record `POST /auth/consents {kind:"ai_processing", version, granted:true}` **before**
   `POST /screenings/{id}/submit {consent_ai:true}`. Ticking a report per screening counts as per-report consent.
3. be-screening refuses to call Claude unless a current-version `ai_processing` consent is on record **and**
   `consent_ai` is true; otherwise it uses the rules engine (PLAN §7 fallback).
4. Agent-run screenings use AI only with the patient's own consent (CG-14). Today the agent's screening form shows
   the same AI consent sheet to the **agent** (`agent_screening_screens.dart`), which records the agent's choice,
   not the patient's.
5. **The disclosure covers every AI path, not just screening** (CG-33): voice intake (the transcript goes to Claude
   for extraction; audio stays on our servers), and "Read my report with AI" (the report itself, which may show the
   patient's name, goes to Claude). Each path records `ai_processing` and shows the review → edit → confirm step.
6. Name Anthropic in the privacy policy (CG-08) and in both store listings. The drafted copy already does.

### CG-05 · Medical disclaimers and emergency handling

**Basis.** Google Health Content and Services: apps that are not regulated medical devices "must include a clear
disclaimer in their app description" that the app is "not a medical device and does not diagnose, treat, cure, or
prevent any medical condition", and "remind users to consult a healthcare professional". Apple 1.4.1: "Apps should
remind users to check with a doctor in addition to using the app and before making medical decisions."

**Recommendation.**
- Listing: done in the drafted descriptions (GOOGLE_PLAY.md §3, APP_STORE.md §3).
- In the app (fl-screening, web-patient), show:
  - a one-line "Not a diagnosis — always consult a doctor" on the screening intro, the processing screen, every
    AI summary and the matches screen;
  - "Estimate — final price after the hospital examines you" on the cost comparison and quotes;
  - a full disclaimer in Profile › Legal.
- **Emergency branch:** when `urgency == "emergency"` or `red_flags` is not empty, show a blocking interstitial:
  "Your answers suggest you may need urgent care. Call your local emergency number now. Do not travel for
  treatment." Show the `travel_advice` text, hide "Book"/"Request quote" for that screening, and offer "Talk to a
  coordinator". Inside India, the support screen's helpline `emergency` (112) applies. Abroad, say "your local
  emergency number" and don't hard-code 112.

### CG-06 · Reviewer access (App access / demo account)

**Basis.** Apple 2.1(a): include demo account information "if your app includes a login" (demo mode only with
Apple's prior approval). Google Play App access: give credentials for restricted functionality.

**Never use the seeded demo accounts for store review.** `backend/scripts/seed.py` gives every demo account the
shared password `HealIndia@2026`. It is demo-only: published in the repo and the seed output, the seed refuses
`ENV=production`, and the `@healindia.example` addresses can't receive mail. Use it only for dev, staging, QA and
screenshot capture.

**Recommendation.** Add a "review fixture" command to `backend/scripts/seed*.py` (seed-data; e.g.
`python -m scripts.seed --review-accounts`, allowed in production, passwords read from secrets such as
`REVIEW_PATIENT_PASSWORD`, never from code) that creates in production **one account per role** (full list and
reviewer notes in [APP_STORE.md §9](APP_STORE.md#9-app-review-information)):
- `review.patient@healindiaglobal.com`, `review.agent@healindiaglobal.com` (approved review agency, two fictional
  managed patients, a case with two quotes, a booking, pending commission items) and
  `review.hospital@healindiaglobal.com` (coordinator, not owner, of the review hospital; an open enquiry, an
  upcoming admission, a settlement item); all with unique strong passwords rotated after each review, MFA off,
  e-mail verified and consents recorded;
- a review hospital that is **active for its portal but hidden from the public catalog and search** (a
  review-fixture flag; a `draft` hospital may not be able to receive cases, so check the portal works before
  choosing `draft`);
- a completed rules-engine screening;
- a case in `quoted` with a sent quote, so the reviewer can accept it;
- a second case with a **confirmed booking created directly by the fixture with no payment rows**, so the ledger and
  settlements are untouched and Trips and Support have data;
- itinerary items, a conversation with a coordinator message, and a checklist.

Exclude the review hospital and agency from admin and finance reports, settlements and payouts. Reset the fixture
nightly, recreating any account a reviewer deleted. The reviewer notes template
is in APP_STORE.md §9. Because `mock` is refused in production (PLAN §8.11), the notes explain that payment isn't
needed for review.

### CG-07 · Developer accounts and legal entity

**Basis.**
- Apple 5.1.1(ix): apps providing services in highly regulated fields, healthcare included, "should be submitted by
  a legal entity that provides the services, and not by an individual developer".
- Google lists health apps (e.g. Medical) among those that need an Organisation developer account. Google's pages
  word this as "must" in the 2024 announcement and "should" in the current help text, so treat it as required. An
  Organisation account needs a D-U-N-S number.
- EU Digital Services Act: both stores require a trader declaration to distribute in the EU, with address, phone and
  email shown on the listing.

**Recommendation.** Enrol both accounts as the operating company (the contracting entity named in
`docs/legal/TERMS_OF_SERVICE.md` §1), with matching seller or developer names. Declare **trader** status. Keep the
company registration, a sample hospital agreement and the privacy policy ready: reviewers of healthcare apps
sometimes ask for proof that the entity provides the service.

### CG-08 · Privacy policy

**Basis.** Apple 5.1.1(i): a link in App Store Connect **and** inside the app. The policy must:
- identify what data is collected, how, and all its uses;
- confirm that third parties provide equal protection;
- explain retention and deletion, and how to revoke consent or request deletion.

Google: a public, active, non-geofenced URL, not a PDF, with an in-app link.

**Recommendation.** Publish `https://healindiaglobal.com/privacy` (public-website, from `docs/legal/**`). Content
checklist:
- data categories exactly as in GOOGLE_PLAY.md §6 / APP_STORE.md §6;
- recipients: chosen hospitals, the patient's agent, travel vendors, and processors (cloud host in AWS
  `ap-south-1`, Razorpay, Stripe for web, Anthropic, email/SMS/push providers);
- international transfers (AI processing outside India; GDPR SCCs);
- retention schedule (DEPLOYMENT §13) and deletion (CG-01);
- consents and how to withdraw;
- children (18+ only);
- Grievance Officer / DPO contact (DPDP), and the EU representative (GDPR Art. 27);
- an explicit statement that health data is never used for advertising (Apple 5.1.3(i)).

In-app links: the registration "By continuing…" notice (`TermsNotice` exists) and Profile › Legal.

### CG-09 · iOS privacy manifest

**Evidence.** There is no `PrivacyInfo.xcprivacy` under `mobile/ios`. In the pub cache, `file_picker 13.1.0` and
`razorpay_flutter 1.4.7` ship no privacy manifest. `local_auth_darwin`, `google_sign_in_ios`, `url_launcher_ios`,
`flutter_secure_storage_darwin` and `shared_preferences_foundation` do.

**Update (2026-10-21 evening).** New iOS plugins: `image_picker_ios 0.8.13+10` and `record_ios 2.1.1` ship manifests;
`sign_in_with_apple 8.2.0` ships none. The app manifest must now also declare `NSPrivacyCollectedDataTypeAudioData`.

**Recommendation.** Add `ios/Runner/PrivacyInfo.xcprivacy` with:
- `NSPrivacyTracking = false` and empty `NSPrivacyTrackingDomains`;
- `NSPrivacyCollectedDataTypes` mirroring APP_STORE.md §6;
- required-reason API entries for anything Xcode's privacy report flags. For example `NSPrivacyAccessedAPICategoryUserDefaults` with
  reason `CA92.1` if app code reads or writes defaults; file-timestamp and disk-space categories if flagged for
  `file_picker`.

Build with Xcode 26, run *Generate Privacy Report* on the archive, and resolve every ITMS-91053 warning before
upload. Check that the native Razorpay iOS SDK pulled by `razorpay_flutter` carries its own manifest; if not, declare
its APIs.

### CG-10 · Location permission without implementation

**Evidence.** `AndroidManifest.xml` declares `ACCESS_FINE_LOCATION` and `ACCESS_COARSE_LOCATION`, and `Info.plist`
has `NSLocationWhenInUseUsageDescription`. But `pubspec.yaml` has no location plugin, so `POST /travel/sos {lat?,
lng?}` can't be populated. Declaring a sensitive permission the app never uses invites review questions and makes
the Data safety answers wrong either way.

**Recommendation.** Choose one before submission:
- **(a) Implement.** Add `geolocator` (needed dependency). Request when-in-use access just-in-time, only when the
  user taps SOS or "Show my location" on the support map, with the pre-prompt in GOOGLE_PLAY.md §8. SOS must still
  work without location (`lat`/`lng` are optional) and offer a "Where are you?" text field (Apple 5.1.1(iv)). Never
  request background location.
- **(b) Remove** both Android permissions and the plist key for v1, and answer "location: not collected" on both
  forms.

### CG-11 · Placeholder platform configuration

**Evidence and fixes:**
1. **Launcher icons are the Flutter logo.** `ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-1024x1024@1x.png`
   and the Android `mipmap-*` icons are the defaults; the Flutter logo is Google's trademark. Generate icons from
   `design/icons/app-icon-ios.svg`, `app-icon-foreground.svg` and `app-icon-background.svg` (adaptive icon).
   The Play store icon is 512×512 and the App Store icon 1024×1024 with no alpha.
2. **Google Sign-In on iOS is unconfigured.** `Info.plist` has the placeholder URL scheme
   `com.googleusercontent.apps.heal-india-global` and no `GIDClientID`, so the Google button will fail on iOS (an
   Apple 2.1 rejection). Create the iOS OAuth client, set `GIDClientID` and the real reversed client ID, and add the
   iOS client ID to the backend's accepted `aud` list for `POST /auth/google`.
3. **Release builds sign with the debug key.** `android/app/build.gradle.kts` has
   `signingConfig = signingConfigs.getByName("debug")`, with a comment that CI overrides it. Enrol in Play App
   Signing, create an upload key, have CI inject `key.properties`, and fail the release build if no upload key is
   present.
4. **App IDs are permanent after first upload.** DONE 2026-11-09: both the Android `applicationId` and the iOS
   bundle ID are `com.healindiaglobal.app` (register this ID in Play Console and App Store Connect).
5. `pubspec.yaml` `description: "A new Flutter project."`: replace it (cosmetic).

### CG-12 · Store privacy forms must match the binary

**Evidence.** `razorpay_flutter` pulls `com.razorpay:checkout:1.6.+`. In the cache, `checkout 1.6.41` brings
`core 1.0.18`, which merges `READ_BASIC_PHONE_STATE`, and `standard-core 1.7.17`, which merges `NFC`, plus
`<queries>` for UPI apps. Google counts data collected by SDKs as the app's collection. Apple counts data collected
by third-party partners' code.

**Recommendation.**
- Get Razorpay's SDK data-collection statement for the exact version and mirror it. Expect device identifiers
  for fraud checks, and possibly the list of installed UPI apps if it leaves the device.
- Inspect the merged manifest (`build/app/intermediates/merged_manifests/release`) and remove anything unused with
  `tools:node="remove"`.
- Make "privacy forms reviewed" a release-checklist gate whenever a dependency, permission or SDK changes: push,
  crash reporting, analytics, video, WhatsApp.

### CG-32 · One app, three role sections (patients, agents, hospital users)

**Evidence.** PLAN §3.1 (mobile = the public door for all three roles). `mobile/lib/core/router/app_router.dart`
confines each role to its shell (`/home…` patient, `/agent/**`, `/hospital/**`); `register_screen.dart` has role
tabs Patient / Agent / Hospital; `features/agent_portal` (Dashboard · Patients · Cases · Bookings · Earnings) and
`features/hospital_portal` (Dashboard · Enquiries · Patients · Settlements · More). Staff are refused on mobile: the
staff door returns the generic 401 to `X-Client-Type: mobile` (`staff_door_guard`).

**Basis.** Apple 2.1 (demo access to every gated feature), 2.3.1 (the listing must describe what the app does),
5.1.1(v) (deletion for every account type). Google Play App access declaration; account deletion for every account
the app lets users create; Data safety accuracy for all data the app collects.

**Recommendation.**
1. **Listing:** patients stay the primary audience; one partner block in the description and one screenshot per
   partner role (done in APP_STORE.md §3.1, §8 and GOOGLE_PLAY.md §3.3, §4).
2. **Review access:** three dedicated production review accounts (CG-06), described in the review notes and Play's
   App access instructions. Never the shared demo password.
3. **Privacy forms** cover data agents enter about patients (identity, passport, medical history, reports, voice)
   and data hospital users write (quotes, admission and discharge notes). Partner bank and KYC details stay on the
   web portals; if they move into the app, update both forms first (CG-12 gate).
4. **Deletion** reachable from every section (CG-01).
5. **Staff stay out of the app.** Keep the server-side refusal; never name the staff door path in store metadata,
   review notes, screenshots, crash reports or deep links.
6. **Partner approval gate.** A newly registered agent or hospital must see a clear "pending verification" state in
   the app, not empty or broken screens (a 2.1 risk if a reviewer signs up as a partner).
7. **Agent consent** for patients they manage (CG-14) is now also an in-app concern, because agents can run
   screenings, record voice and photograph reports for patients from the phone.

### CG-33 · Microphone, camera and AI processing of voice and reports

**Evidence.** `pubspec.yaml`: `record: ^7.1.2` (voice), `image_picker: ^1.2.4` (camera and gallery,
`ImageSource.camera` in `features/documents_ai/data/report_page_source.dart`). `AndroidManifest.xml` declares
`RECORD_AUDIO`; `Info.plist` has `NSMicrophoneUsageDescription` and `NSCameraUsageDescription`. PLAN §7.1 (docai: the
report itself goes to Claude) and §7.2 (voice: audio to local Whisper on our servers, transcript to Claude; English
only per the product decision).

**Basis.** Apple 5.1.1(ii) (purpose strings), 5.1.2(i) (explicit permission before sharing with third-party AI), App
Privacy accuracy (Audio Data). Google Permissions policy (`RECORD_AUDIO` is dangerous; request in context), User
Data policy (prominent disclosure), Data safety (Audio › Voice or sound recordings).

**Recommendation.**
1. **Privacy forms:** declare Audio Data (Apple) / Voice or sound recordings (Google): collected, not shared, App
   functionality, linked to the user. Not "ephemeral": the file sits in storage until the job runs. Photos stay
   declared. Done in APP_STORE.md §6 and GOOGLE_PLAY.md §6.2.
2. **Production settings** must keep `STT_PROVIDER=local_whisper` and `VOICE_RETAIN_AUDIO=false`; the listing
   copy depends on both. Any change is a CG-12 gate (forms, listing, privacy policy).
3. **Permissions:** request microphone only on "Describe it by voice", with the pre-prompt in GOOGLE_PLAY.md §8;
   never declare Android `CAMERA` or `READ_MEDIA_*`; typing and file upload always remain alternatives; no
   background recording.
4. **AI disclosure (CG-04 point 5):** the consent sheet must name Anthropic and say what each path sends: the
   transcript (voice), the report pages (docai; they may show the patient's name), the questionnaire (screening).
5. **English only:** the voice UI, purpose strings and listing say "in English"; reject or warn on non-English
   audio rather than producing a poor transcript, and never promise translation.
6. **Agents** recording or photographing for a patient need that patient's consent on record (CG-14).

---

## P1 — before public launch

### CG-13 · AI "possible conditions" and medical-device exposure

**Evidence.** `TriageResult` includes `possible_conditions[{name, likelihood}]`, `urgency` and `recommended_tests`
(PLAN §7), and the Terms (§3.3) mention "possible condition".

**Basis.**
- Apple 1.4.1: apps that "could be used for diagnosing" get greater scrutiny.
- Google: regulated medical-device apps must be declared and get a "Medical Device" label. EU MDR or IVDR apps must
  add public disclosures in the EEA.
- EU MDR Rule 11 places most software that informs diagnostic or therapeutic decisions in class IIa or higher.
  Symptom checkers that list likely conditions are typically treated as devices in the EU and UK.
- In the US, FDA policy exercises enforcement discretion for some symptom-checker functions.

**Recommendation.** Patients see suggested specialties with rationale, red flags and emergency advice, "questions to
ask your doctor", and travel advice. **Do not show `possible_conditions` or likelihoods to patients**: be-screening
omits them from patient- and agent-scoped responses, and hospital clinicians see them labelled "AI-generated,
unverified". Get a regulatory opinion before marketing AI screening in the EU/EEA/UK. Until cleared, consider
rules-engine-only screening for users in those regions. In the Play Health apps declaration, do **not** tick
"Medical Device Apps" (GOOGLE_PLAY.md §5) unless counsel concludes otherwise.

### CG-14 · Agent access needs patient consent

**Evidence.** PLAN §9.1 scopes agents to "cases/patients they manage or **referred**". A patient who signs up with a
`referral_code` therefore becomes visible to the agent. `POST /agent-portal/patients` creates patients and lets
agents run screenings and create cases for them. `ConsentKind` has no agent-sharing value. DEPLOYMENT §13 already
asks for an agent attestation.

**Recommendation.**
- Add `share_with_agent` to `ConsentKind` (backend-models, §5 change). Capture it at referral sign-up with
  explicit text: "<Agency> will be able to see your cases, quotes and documents."
- Until the patient activates their invite and accepts Terms, Privacy and the relevant consents (Terms §4.3), agents
  may draft screenings but may not trigger AI processing or share with hospitals. The exception is an agent
  attestation plus an uploaded signed consent (a new `DocumentKind` such as `consent_form`).
- Enforce this server-side in be-screening (`submit`) and be-cases (`POST /cases`).
- Store impact: agent visibility is one reason the Data safety answers mark health and personal info as "shared".

### CG-15 · Push notifications

**Evidence.** The backend has `device_tokens` and `POST /auth/devices`, and DEPLOYMENT §12 plans FCM/APNs. The
pubspec has no `firebase_messaging` or APNs plugin.

**Recommendation (when implemented):**
- iOS: Push capability (`aps-environment`). Android 13+: request `POST_NOTIFICATIONS` in context, after the first
  quote request, not at launch.
- Payloads must be generic. Apple 4.5.4: push "should not be used to send sensitive personal or confidential
  information". Example: "You have an update on your case" plus a deep link; never conditions, procedures or
  documents.
- Marketing pushes only with explicit opt-in (`ConsentKind.marketing`) and an in-app opt-out (Apple 4.5.4).
- The app must work fully with push denied.
- Update Data safety (Device or other IDs) and App Privacy (Device ID).

### CG-16 · Content reporting (UGC)

**Basis.** Apple 1.2 requires UGC apps to have filtering, a report mechanism with timely responses, blocking of
abusive users, and published contact details. Google's UGC policy needs in-app reporting and moderation. Google's
AI-Generated Content policy covers chatbots and image/voice generators. Our triage summary probably falls outside
it, but a report control is cheap insurance.

**Recommendation.** Proposed new endpoint `POST /reports {entity_type: message|conversation|review|screening_result,
entity_id, reason, details?}` (be-messaging), with an admin queue in web-admin-ops. Add:
- "Report" on message long-press and the conversation menu (fl-journey, web-patient);
- "Report this result" on AI summaries (fl-screening);
- mute or leave for non-case conversations;
- support contact in Profile › Help.

Reviews (ROADMAP R6) must ship with reporting and moderation from day one.

### CG-17 · Payment screen copy and biometric fallback

**Evidence.** `mobile/lib/core/services/biometric_service.dart` returns "Pay with Face ID". The payment design shows
"Payment Plans — 3, 6, 12 months with Affirm".

**Recommendation.**
- Button text: "Confirm with Face ID" / "Confirm with Touch ID" on iOS, "Confirm with fingerprint" or "Confirm with
  face unlock" on Android, then start the payment. "Pay with Face ID" reads like Apple Pay.
- Show the amount in the prompt.
- Allow the device passcode as fallback (`biometricOnly: false`). With no biometrics enrolled, use a plain "Pay"
  plus a confirmation dialog.
- It is a UX safeguard, not an authentication factor (PAYMENTS.md §4.2).
- Remove "with Affirm": nothing is integrated (ROADMAP R4). Use "Payment plan: 3, 6 or 12 instalments".
- **Fix the iOS purpose string** (flutter-foundation). `NSFaceIDUsageDescription` currently says Face ID is used to
  "protect your medical information", but no app lock exists. Apple 5.1.1(ii) wants purpose strings that describe
  the use accurately. Replacement text: [APP_STORE.md §7](APP_STORE.md#7-permissions-purpose-strings-and-entitlements).

### CG-18 · Instalments that become credit

**Evidence.** PAYMENTS.md §10.1 allows completion before full payment, with later instalments, and notes that a
first instalment below the deposit never confirms the booking (§14 #5).

**Basis.** Google Play's Financial features declaration must be filed by every app. Deferred payment after the
service is effectively credit (personal loan / BNPL style), with consumer-credit rules in patients' countries and RBI
digital-lending rules if an Indian lender is involved.

**Recommendation for v1:**
- Instalment 1 equals the deposit.
- The schedule must finish **before** `admission_date`: a pre-payment plan, no interest, no fees.
- Declare "no financial features".

Revisit with licensed BNPL partners (ROADMAP R4).

### CG-19 · Third-party trademarks and sample data

**Evidence.** The designs show "Apollo Hospitals, New Delhi", real-looking doctor photos, and JCI/NABH/WHO badges.

**Recommendation.**
- Screenshots and marketing use fictional sample data ("Dr. A. Sharma (sample)", "Sample Hospital, New Delhi").
- Real hospital names and photos appear only for contracted hospitals, with written permission (hospital
  agreement).
- Accreditations appear as data-driven text. Use accreditation logos only where the accrediting body's rules allow
  it.
- Never show the WHO emblem.

### CG-20 · Possible confusion with the government "Heal in India" initiative

**Evidence.** "Heal in India" is a Government of India programme led by MoHFW with the Ministry of Ayush, including a
multilingual portal for medical travellers.

**Basis.** Google Play's Impersonation policy (implying an affiliation that doesn't exist, including with
government) and Apple's rules on misleading metadata.

**Recommendation.**
- A non-affiliation line in both descriptions (drafted) and in the app's About screen.
- No national emblem, tricolour-dominant icon or government-style styling.
- Trademark clearance for "Heal India Global" in the relevant classes before launch.
- Consider registering as a facilitator on the government portal if that becomes available.

### CG-21 · Keep personal health information out of iCloud

**Basis.** Apple 5.1.3(ii): apps "may not store personal health information in iCloud".

**Recommendation.**
- Never write medical documents, screening drafts or cached case data to the app Documents or Application Support
  directories or to `shared_preferences`. Those are included in iCloud backup.
- Use temporary or cache directories and delete after viewing, or set `NSURLIsExcludedFromBackupKey`.
- Keep tokens in `flutter_secure_storage` with a non-synchronising, this-device-only accessibility.
- `cached_network_image` may cache hospital and doctor photos only, never documents. Documents always stream from
  `GET /documents/{id}/download`.

A grep on 2026-10-21 found no file writes in `mobile/lib`. Keep it that way with a code-review rule.

### CG-22 · Device and OS targets

**Evidence and fixes:**
- **iPad and landscape.** iOS `TARGETED_DEVICE_FAMILY = "1,2"` (iPad) and iPhone landscape orientations in
  `Info.plist`. Either QA iPad and landscape layouts and supply 13-inch iPad screenshots, or ship iPhone-only and
  portrait-only in v1.
- **Android target API.** New apps and updates must target **API 36** since 2026-08-31 (extensions to 2026-11-01).
  `targetSdk = flutter.targetSdkVersion`, so confirm that Flutter 3.44 resolves to ≥ 36.
- **Large screens.** Apps targeting API 36 can't lock orientation on large screens, so tablet and foldable
  landscape must render correctly.
- **16 KB pages.** Verify that the native libraries (Razorpay SDK) support 16 KB memory pages, which Play requires
  for apps targeting Android 15+.

### CG-23 · iOS release pipeline

**Recommendation.**
- Uploads have needed Xcode 26 and the iOS 26 SDK since **2026-04-28**. Development machines run Windows, so set
  up a macOS CI runner (deploy-iac).
- Add `ITSAppUsesNonExemptEncryption = false` to `Info.plist`: the app uses only OS-provided TLS and Keychain.
- Distribution signing must include the Sign in with Apple and Push entitlements.

### CG-24 · Age rating, audience and adult attestation

**Recommendation.**
- Terms §4.1 requires 18+. Apple's calculated rating will likely be **16+** (frequent medical/treatment
  information), so set it to **18+** manually or accept 16+; this is a business decision, see APP_STORE.md §5.
- Google: target audience "18 and over".
- Add an "I am 18 or older" attestation to registration (be-auth, `POST /auth/register` currently takes no DOB or
  age), and check the patient's date of birth at booking.
- Treating children (a parent booking for a child) is a product gap for the roadmap: dependants are not modelled,
  and DPDP s.9 requires verifiable parental consent.

### CG-25 · Guest data retention

**Evidence.** Terms §4.2 says (bracketed) "We delete guest data after 12 months without activity". DEPLOYMENT §13
says 90 days.

**Recommendation.** Pick one with legal (90 days is safer), implement a periodic purge that reuses the CG-01 handlers,
and make sure guests can delete in the app (Apple requires it).

---

## P2 — soon after launch

- **CG-26 · Data export.** GDPR Art. 15/20 and the DPDP rights need an export of profile, screenings, cases,
  bookings, documents and messages (SECURITY F12). Proposed: `POST /auth/data-export` starts a job that produces a
  ZIP document, then `GET /documents/{id}/download`.
- **CG-27 · Paid tele-consults on Android.** Google's Payments policy bans Play Billing for "physical services" but
  says nothing about consultations or telehealth (checked 2026-10-21). Apple 3.1.3(d) explicitly allows non-IAP
  payment for real-time 1:1 "medical consultations". Before charging `consultation_fee` in the Android app, confirm
  with Google Play policy support, or collect it as part of the booking. Any future *digital* product (paid AI
  report, subscription) must use IAP and Play Billing.
- **CG-28 · Runtime font fetching.** `google_fonts` downloads fonts from Google at runtime, which sends the user's
  IP to Google and fails offline. Bundle the fonts (Inter; the product is English only) and set
  `GoogleFonts.config.allowRuntimeFetching = false`.
- **CG-29 · Map tiles.** `flutter_map` with OSM tiles needs visible "© OpenStreetMap contributors" attribution.
  Production traffic must not use `tile.openstreetmap.org` (its usage policy forbids heavy app use). Use a
  commercial or self-hosted tile service and set a proper User-Agent.
- **CG-30 · Missing events.** Several journey steps publish nothing, so nobody is notified. Examples: quote rejected
  or expired, visa and travel status changes, SOS acknowledged, consultation scheduled, instalment due or overdue,
  refund requested, settlement batch awaiting approval. See
  [../product/USER_JOURNEYS.md §7](../product/USER_JOURNEYS.md#7-gaps-found-while-mapping-the-journeys).
- **CG-31 · Logging hygiene.** The forms answer "in-app search history: not collected". Keep that true: the API
  must not log `q=` query strings or free-text bodies. The edge already strips query strings (DEPLOYMENT §10).
