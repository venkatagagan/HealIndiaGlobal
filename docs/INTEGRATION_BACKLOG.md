# Integration backlog (input for the integration phase)

Items discovered while the feature agents were building. Each item names the owning area. Tick them off during
integration; anything deferred must be listed in the final report.

## A. Product requirements added during the build
1. **Login doors (PLAN §3.1)** — public door on the website (`/login`, `/register`, …) for patient/agent/hospital with
   role-based redirect; staff door `/gahi` (admin SPA) with `/auth/staff/*`, separate `hig_staff_refresh` cookie,
   `portal` JWT claim, door/role enforcement in `get_current_user`/`require_roles`, optional `STAFF_ALLOWED_IPS`.
   Portals lose their own login forms (redirect to the website door); Vite `base` + router `basename` per portal
   (`/app/`, `/agent/`, `/hospital/`, `/gahi/`); nginx path routing; `scripts/dev.ps1` URLs. *(backend auth, all web apps,
   website, infra)*
2. **Document intelligence (PLAN §7.1)** — backend `docai` module; web `@hig/shared/docai` components mounted in
   patient-web (screening step 3, documents page, case detail), agent-portal (patient documents), hospital-portal (case
   detail, clinical view, confirmed data only); Flutter `features/documents_ai` wired into screening step 3 and Trips →
   Documents. Review → edit → confirm is mandatory; only confirmed data is used.
3. **Voice intake (PLAN §7.2)** — backend `voice` module (local Whisper STT + Claude extraction); web `@hig/shared/voice`
   in the patient screening wizard and the agent screening form; Flutter `features/voice` on screening steps 1–2.
   Review → edit → confirm is mandatory.
4. **Public website (`website/`, Next.js, :3000)** — wire into nginx (`/` → website), docker-compose, dev script, CI.

## B. Gaps found by the legal-drafts review (`docs/legal/README.md` checklist)
5. Per-hospital consent evidence: `consents` needs `case_id`/`hospital_id` (share_with_hospitals is per hospital).
6. Hospital- or platform-initiated cancellation must refund 100% (cancel endpoint currently applies patient tiers).
7. Snapshot `refund_policy` on the booking at confirmation; apply that snapshot on cancellation.
8. Retained cancellation amounts (50%/0% tiers) need a ledger posting out of `PLATFORM:PATIENT_ESCROW`
   (to hospital payable / platform revenue per the hospital agreement Schedule A).
9. Agent commission tax handling: TDS on agent commission (Indian agents), GST/reverse-charge notes for foreign agents.
10. `doctors` needs `registration_number` + `registration_council` (NMC/state council).
11. Consent kinds for accepting the hospital partner agreement and agent agreement (versioned).
12. Guests must upgrade to a full account before creating a case or paying.
13. AI payload minimisation (only consented fields) and emergency gating: an `emergency` urgency blocks the booking flow
    until the patient acknowledges the emergency guidance.
14. Marketing claims ("500,000+ patients", "70% less", "zero wait time", platform-level JCI/NABH badges) must stay
    editable content and be verified before launch.

## C. Store / platform compliance
15. In-app account deletion (Apple + Google requirement): `DELETE /auth/me` (+ retention rules for financial/medical
    records), UI in patient-web profile and the Flutter profile.
16. Sign in with Apple on iOS if Google sign-in is offered there.

## D. Build health
17. web-foundation crashed before finishing `@hig/shared` (auth/ui/layout/lib/i18n/ws/theme); a recovery agent is
    completing it — portals currently carry local fallbacks (agent-portal/hospital-portal `src/auth`, `components/ui`,
    patient-web `features/portal/ui`, admin `features/ops/ui`). Consolidate where cheap; at minimum all apps must
    typecheck and build.
18. Initial Alembic migration (all models incl. docai/voice + LEDGER_DDL + extensions + sequences), `alembic upgrade
    head` on the `healindia` DB, `python -m scripts.seed`, full pytest, `scripts/check_contracts.py`, end-to-end
    journey test, Flutter analyze/test/build web, all web typecheck/build, website build.
19. Security review findings (`docs/reviews/SECURITY_REVIEW.md`): fix all critical/high.

## E. Findings from the docs (PAYMENTS/SECURITY/OPERATIONS) review
20. F1 client-IP spoofing: compose sets `FORWARDED_ALLOW_IPS="*"`, nginx appends X-Forwarded-For and `get_client_ip`
    takes the first hop → trust only the proxy hop (rightmost untrusted) for rate limits and audit logs.
21. F3 compose app connects as the postgres bootstrap superuser → separate least-privilege app role.
22. F4 one-time tokens (verify/reset/invite) in SPA URLs leak via Referer → `Referrer-Policy: no-referrer` on those
    pages + exchange token from the fragment/POST body.
23. Production settings validation must require `ADMIN_MFA_REQUIRED=true`; staff MFA enrolment must not be possible with
    the password alone after an MFA reset (one-time enrolment token from a super_admin).
24. Captured amount ≠ order amount is accepted pro-rata with only a warning → hold for finance review instead.
25. FX: missing DB rate silently falls back to hard-coded defaults → fail closed in production (or alert).
26. Maker-checker beyond settlement batches: refund approval by a different user than the requester (above a
    threshold), bank-transfer mark-paid and payout mark-paid need a second approver; auto-generated batches still need a
    human approver.
27. Invoice numbers must be ≤ 16 characters for GST (e.g. `HIG2627000001`); commission invoices/agent statements and
    credit notes are not generated yet.
28. Ledger gaps: tax remittance, FX differences and manual adjustments need txn types + finance endpoint; recognition rule
    for consultation/service payments; gateway-settlement sweep should reconcile against gateway settlement reports
    (Razorpay Route transfers leave the Razorpay balance); document `PLATFORM:EQUITY`/`PLATFORM:ADJUSTMENTS`.
29. Precedence between `hospitals.commission_rate_bps` and `commission_rules` must be defined and tested; per-member
    permissions inside a hospital (owner/admin/coordinator/finance/doctor) enforced consistently.
30. Consent flow for agent-created patients, guardian model for minors, data export / erasure / retention jobs (DPDP/GDPR).

## E2. Findings from QA (`docs/QA_TEST_PLAN.md` §12)
32. F-05: empty `JWT_SECRET` outside production makes every worker generate its own secret → fail fast at startup in
    staging/production (and in any multi-worker run).
33. F-02: white text on brand green fails WCAG contrast (2.28:1; red 3.76:1) → use dark text on green or darker shades
    (#15803D / #B91C1C) for text-bearing buttons in web + Flutter themes.
34. F-06: compose PostgreSQL should load `pg_stat_statements` (shared_preload_libraries) for slow-query diagnostics.
35. F-07/F-08 (risks): ledger account balance rows are a write hot spot under concurrent payments (consider
    per-transaction balance snapshots or sharded escrow accounts later); nginx per-IP limits may throttle hospital/agency
    offices behind one NAT (use per-user limits after auth).

## E3. Brand assets (`design/`, see design/README.md)
36. Wire brand assets: favicons/logos into web/apps/*/public + shared assets; website logo/illustrations; Flutter
    `mobile/assets/{brand,illustrations,specialties,body_map}` + pubspec assets + `flutter_svg` (or exported PNGs via
    `design/tools/export_png.py`) + `flutter_launcher_icons` config; replace default Flutter web icons.
37. ONE body-area vocabulary everywhere = PLAN/catalog ids (head, neck, chest, abdomen, pelvis, back, left_arm,
    right_arm, left_leg, right_leg, skin, general) — agent-portal `src/lib/constants.ts` uses a finer list (eyes,
    knees…) → map or align; body-map region ids = these ids.

## E4. Found during the resume run (2026-10-21 evening)
38. PLAN.md §8.10: document `POST /agent-portal/patients/{id}/consent` and the `consent_*` fields on agent patient create
    (agent attests → audit log; patient confirms via `POST /auth/consents`).
39. Rest of #30 still open: guardian model for minors; data export / erasure / retention jobs (DPDP/GDPR).
41. #10 still open: `doctors.registration_number` + `registration_council` in `app/models/hospitals.py` (+ catalog/
    hospital-portal schemas and forms) — be-catalog has finished, so the integration agent adds it.
42. New columns for the initial migration (be-cases): `cases.emergency_acknowledged_at`,
    `cases.emergency_acknowledged_by_user_id` (FK users, SET NULL), `bookings.refund_policy` jsonb.
43. Admin finance UI for the new payment controls (be-payments): mark-paid now returns `pending` → approve/reject
    calls, amount-review action (`POST /payments/orders/{id}/amount-review`), `?review=amount|mark_paid` queue, 403
    `second_approver_required` on refund approval; plus be-finance's payout approvals/adjustments when it lands.
44. Root README.md and docs/DEPLOYMENT.md still describe one host per SPA → single-domain path routing (deploy/README.md
    is current); AWS/k8s manifests still one host per SPA, no website service, app role owns the DB.
45. Backend `get_client_ip`: prefer `CloudFront-Viewer-Address` on AWS.
46. **MOSTLY DONE 2026-10-21** (dead code removed, ESLint flat config, body-area mapping; still open: PNG icons, agent/hospital UI kits → `@hig/shared/ui`). Web leftovers (web-shared agent): delete unmounted patient-web `features/public` + `features/auth`; add an ESLint
    config so `npm run lint` works; export PNG icons for manifests; map legacy fine body-area ids (eyes, knees…) in
    stored agent screenings to the 12 catalog ids; consolidate agent/hospital local UI kits into `@hig/shared/ui`.
47. iOS: commit `Runner.entitlements` with the Sign in with Apple capability once the Apple team/signing is set up
    (steps in mobile/README.md); configure APPLE_CLIENT_ID on the backend.
48. Website: backend contact endpoint (form currently opens the visitor's email app); fill `[[PLACEHOLDER]]` fields in
    legal drafts (lawyer); remove noindex from catalogue pages once the live API serves them; set
    `CONTENT_INCLUDE_DRAFTS=false` at launch; professional review of all Arabic/French copy; verify marketing figures in
    `content/site/marketing.json` before launch (#14).
49. User decision (2026-10-21): ENGLISH ONLY. Remove Arabic/French UI, routes, content and RTL everywhere (website +
    content, web portals, docs, store listings). Voice intake and AI report summaries are English only as well.
    Supersedes the translation items in #48.
50. Mobile agent shell: agents can only pay by bank transfer (card/Razorpay checkout lives under `/pay/...`, which the
    router keeps patients-only) → make the payment screen role-aware or add an agent card-checkout route. Agent
    screening uses a condensed form for the same reason. Hospital profile/members/availability/price editing is web-only.
51. Finance not done yet (be-finance): revenue recognition for consultation/service payments; gateway settlement-report
    sweep (Razorpay Route); per-member hospital permissions (owner/admin/coordinator/finance/doctor); TDS 194H annual
    threshold; GST on the platform's cancellation-retention share; PLAN §4.12/4.13/§5 to list the new accounts, txn
    types and commission precedence table. Before go-live: set `platform_gstin` and `platform_gst_state`.
52. Store submission (docs/store/COMPLIANCE_GAPS.md): review-fixture command creating one production review account
    per role (passwords from secrets, MFA off, data hidden from public catalog/reports/payouts, rebuilt nightly);
    agent-run screening must capture the PATIENT's AI-processing consent, not the agent's (CG-14); until
    `POST /auth/apple` ships, hide Apple and Google buttons on iOS.
53. Compose: persistent volume for the Whisper model (`WHISPER_MODEL_DIR`, default `./.models/whisper`) so containers
    don't re-download ~460 MB after recreation. Keep `metrics_scrape_cidrs` (Terraform) to monitoring hosts only —
    anything in it reaches api:8000 directly and could spoof `CloudFront-Viewer-Address`.
54. Audit-log append-only trigger exists only in migration 0004; tests build the DB with `create_all`, so add a
    model-level DDL hook (or run migrations in tests) to exercise it.
55. Security leftovers: SEC-061 WebSocket session `sid` check + close sockets on suspend/revoke; SEC-060 flag invites
    accepted from the inviting agent's IP; invitees accepting the partner/agent agreement (decision pending — currently
    only the organisation accepts it at onboarding).
56. Contract checker (scripts/check_contracts.py) warnings: travel/SOS/consultation types (web + Flutter) expect flat
    `patient_id/patient_name/provider_id/provider_name` but the API sends nested `patient`/`provider` (names likely
    blank in those screens); `LedgerEntryOut.account_id`, Flutter `SavedItem.card`; ignored query params `/bookings?q`,
    travel lists `kind`; `GET /hospital-portal/procedures/{id}/packages/{id}` not implemented. Webhook secrets are not
    set in backend/.env (pass via env/`--secret` to the simulator).
57. #56 DONE except: backend `GET /bookings` has no free-text `q` (booking number / patient) — admin-portal Bookings
    search box was removed until it exists.
58. List filters still client-side in patient-web (small lists): `/screenings` sort + date filter, notifications type +
    search filter, payment orders date filter + sort (bookings multi-status/q/sort/dates and cases `q` on hospital/
    procedure were requested from the admin-ops tables agent).
59. Shared `financeApi.statements` type expects an array but `GET /finance/statements` returns `{balances…, rows}`
    (hospital-portal converts locally) — fix the shared type and any other caller. Table toolkit gaps: totals row,
    expandable rows, server-searchable SelectFilter, ConfirmDialog with reason field, star-rating component.
60. Demo/dev data hygiene: the e2e suite writes "E2E …" records into the same dev DB as the demo accounts (visible in
    demo videos) — run e2e against its own database (or re-seed a clean demo DB before customer-facing recordings).
    Cost benchmark missing for Knee Arthroscopy ("Comparison unavailable"); `AI_ENABLED`/`ANTHROPIC_API_KEY` not set in
    backend/.env, so AI screening/report reading run on the rules fallback in dev.
40. Mobile app now serves patients, agents and hospital users through the public door (PLAN §3.1); staff are web-only.

## F. AI safety
31. **DONE 2026-10-21** (recall 32/32, CI gate step added). Rules-engine emergency recall was 25% on `backend/evals` (gate = 100%) — fix in progress (dedicated agent); CI must
    run `pytest evals/test_rules_engine_gate.py` explicitly (pytest only collects `tests/`).
