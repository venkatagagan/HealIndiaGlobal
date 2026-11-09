# @hig/e2e - Playwright end-to-end tests

Browser tests (Chromium only) for the website doors and the four Heal India Global portals, run against a **real,
seeded stack**. The suite creates the data each test needs through the public API (patients, cases, quotes,
bookings, mock and bank-transfer payments), so tests never mutate shared demo records destructively.

| Project | Base URL | Specs |
|---|---|---|
| `doors` | http://localhost:3000 (website) | `tests/doors/*` - website home -> public door `/login` -> role redirect (patient / agent deep link with `?next=` / hospital); staff rejected at the public door; staff door `/gahi/login`; account deletion (public page + patient deletes own account) |
| `patient-web` | http://localhost:5173/app/ | `tests/patient-web/*` - guest -> screening wizard -> matches -> request quote (guest-upgrade gate) -> hospital quote -> accept (emergency gate when applicable) -> booking -> mock payment; demo-patient booking; dashboard; messages |
| `agent-portal` | http://localhost:5174/agent/ | add a patient with consent attestation; enquiry to two hospitals; commissions |
| `hospital-portal` | http://localhost:5175/hospital/ | answer an enquiry with an itemized quote; admit / discharge; availability |
| `admin-portal` | http://localhost:5176/gahi/ | finance maker-checker (finance1 records a bank-transfer mark-paid, finance2 approves); settlements; ops approvals / catalog |
| `security` | all portals | role guards, door redirects for anonymous visitors, API authorization |

Tags: `@smoke` (fast render checks), `@slow` (multi-step money/booking flows).

## Install (once, everything stays inside the repo)

`@playwright/test` is a devDependency of `web/` (the e2e folder resolves it from `web/node_modules`). Browsers go to
the repo-local cache **`PLAYWRIGHT_BROWSERS_PATH=C:/NewProjects/ForHosp/.devtools/ms-playwright`** - never the user
profile. `pw.mjs` sets that variable for every command (an explicitly set value wins), and all npm scripts use it.

```powershell
. C:\NewProjects\ForHosp\scripts\env.ps1          # shared Node 22 toolchain (never C:\laragon)
cd C:\NewProjects\ForHosp\web
npm install                                       # includes @playwright/test
npm run test:e2e:install                          # = node e2e/pw.mjs install chromium
```

Calling the CLI directly instead of `pw.mjs`: set the variable first,
`$env:PLAYWRIGHT_BROWSERS_PATH='C:/NewProjects/ForHosp/.devtools/ms-playwright'; npx playwright test -c e2e/playwright.config.ts`.

## Run against the local stack

1. Database + demo data (password of every demo account: `HealIndia@2026`): `alembic upgrade head`, then
   `python -m scripts.seed` in `backend/`.
2. Start everything: `powershell -ExecutionPolicy Bypass -File C:\NewProjects\ForHosp\scripts\dev.ps1`
   (API :8000, website :3000, portals :5173-:5176). Use `localhost` URLs - Vite listens on `::1`.
3. Run the tests:

   ```powershell
   cd C:\NewProjects\ForHosp\web
   npm run test:e2e                                  # everything (node e2e/pw.mjs test)
   npm run test:e2e -- --project=doors               # one project
   npm run test:e2e -- e2e/tests/patient-web/screening.spec.ts --headed
   npm run test:e2e:report                           # last HTML report (traces, screenshots, videos)
   cd e2e; npm run typecheck                         # tsc --noEmit
   ```

Backend settings that matter (`backend\.env`, restart the API after changing):

| Setting | Why |
|---|---|
| `RATE_LIMIT_ENABLED=false` (recommended for e2e) | logins are limited to 10/min/IP, staff logins 5/min, registrations 5/min. With limits on, the API helper waits out `429 Retry-After` (and extends the test timeout), so runs pass but are slower; keep `E2E_WORKERS` low. |
| `ADMIN_MFA_REQUIRED=false` (dev default) | staff sign in at the staff door without TOTP. |
| `RUN_WORKER_IN_API=true` (or run `python -m app.worker`) | screening triage and payment events are background jobs. |
| `PAYMENT_GATEWAYS_ENABLED` contains `mock,bank_transfer`, `ENV` not `production` | mock card payments and bank-transfer orders. |

`global-setup.ts` checks `http://127.0.0.1:8000/health/live`, detects each portal's base path, checks the website
door and picks the seeded hospitals the flows use. Pin them with `E2E_HOSPITAL_SLUG` / `E2E_HOSPITAL_SLUG_2`.

### Environment variables

| Variable | Default |
|---|---|
| `PLAYWRIGHT_BROWSERS_PATH` | `C:/NewProjects/ForHosp/.devtools/ms-playwright` (set by `pw.mjs`) |
| `E2E_PATIENT_URL` / `E2E_AGENT_URL` / `E2E_HOSPITAL_URL` / `E2E_ADMIN_URL` | `http://localhost:5173`, `:5174/agent`, `:5175/hospital`, `:5176/gahi` |
| `E2E_PUBLIC_LOGIN_URL` | `http://localhost:3000/login` (website public door) |
| `E2E_API_URL` (used for test-data setup) | `http://127.0.0.1:8000/api/v1` |
| `E2E_DEMO_PASSWORD` | `HealIndia@2026` |
| `E2E_HOSPITAL_SLUG`, `E2E_HOSPITAL_SLUG_2` | auto-detected |
| `E2E_WORKERS` | 3 locally, 2 on CI (use 1 when rate limits are on) |
| `CI` | enables `retries: 1`, `forbidOnly`, GitHub + JUnit reporters |

## How the suite signs in

- PLAN 3.1 doors: patients, agents and hospital users sign in on the website (`/login`), which redirects by role
  (honouring a same-portal `?next=`); staff sign in only at the admin console's staff door (`/gahi/login`,
  `POST /auth/staff/login`, cookie `hig_staff_refresh`). The `doors` specs drive those forms for real.
- Other specs use `loginAs(who)`: it posts the login **through the portal's own origin** (Vite proxy) with the
  browser context's request API, so the httpOnly refresh cookie lands in that context; the next `page.goto()` is
  signed in. Every test gets its own token family, so refresh-token rotation never trips across tests.
- Cookies are host-scoped, not port-scoped: one browser context = one session for all portals on `localhost`.
  Tests needing a second user (finance checker, hospital replying to a patient) use `newSession(who, portal)`.
- Test-data setup uses a per-worker cache of API sessions (`apiAs('finance1')`, `scenarios.*`).

Demo accounts (`fixtures/accounts.ts`): `superadmin@`, `admin@`, `finance1@`, `finance2@`, `support@`,
`agent.lagos@`, `patient.us@healindia.example`, hospital owners `owner.<hospital-slug>@healindia.example`.
Users created by the suite are `e2e.<kind>.<id>@healindia.example` (password `E2e-Password-2026`); records are
named `E2E ...`. Throwaway hospitals are suspended and test specialties deleted after their tests.

## Data the suite cannot create

Three tests depend on time passing and therefore on seed data; they **skip** (with a reason) when it is missing:

- *Hospital: discharge & complete* needs an `admitted` booking whose admission date is today or earlier. New
  bookings must have a future admission date and the API refuses a discharge date before the planned admission
  date. The seeded `patient.uk` booking is admitted with admission "tomorrow", so it becomes dischargeable from
  the day after seeding; bookings admitted by earlier e2e runs become dischargeable once their date passes.
- *Finance: maker generates a batch* needs `eligible` hospital settlement items: completed bookings older than
  `settlement_hold_days` (default 3) after the hourly `settlements.mark_eligible` job ran. The seeded completed
  journey (`patient.us`) produces them ~3 days after seeding. Each run batches all of them.
- *Finance: checker approves / processes / UTR* needs a `pending_approval` batch created by someone other than
  `finance2` - normally the one the maker test just created (file order), or a system batch from the daily
  `settlements.auto_batch` job. It steers "Process" to `manual_bank_transfer` (the dev default is the mock provider,
  which pays instantly) so the UTR step can be exercised.

## CI notes

- Start Postgres, `pip install -e "backend[dev]"`, `alembic upgrade head`, `python -m scripts.seed`, then the API
  in the background with `RATE_LIMIT_ENABLED=false RUN_WORKER_IN_API=true PAYMENT_GATEWAYS_ENABLED=mock,bank_transfer`.
- Portals: either `npm run dev -w apps/<app>` (simplest) or production builds served by `vite preview` on the same
  ports. **Preview builds must be built with `VITE_ENABLE_MOCK_PAYMENTS=true`**, otherwise the patient payment page
  does not offer the mock gateway. `vite preview` also needs the same `/api` proxy as the dev servers.
- Alternatively uncomment `webServer` in `playwright.config.ts` and let Playwright start the servers.
- Then (from `web/`): `npm ci && node e2e/pw.mjs install --with-deps chromium && node e2e/pw.mjs test`.
- Upload `web/e2e/playwright-report/` and `web/e2e/test-results/` (traces, videos, `junit.xml`) as artifacts.
- On CI `retries` is 1 and traces are recorded on the first retry (`trace: 'on-first-retry'`); screenshots and
  videos are kept for failures.

Example GitHub Actions steps (after the backend + portals are up):

```yaml
- uses: actions/setup-node@v4
  with: { node-version: "22" }
- run: npm ci
  working-directory: web
- run: node e2e/pw.mjs install --with-deps chromium
  working-directory: web
- run: node e2e/pw.mjs test
  working-directory: web
  env: { CI: "true" }
- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: playwright-report
    path: |
      web/e2e/playwright-report
      web/e2e/test-results
```

## Layout

```
playwright.config.ts   projects (doors + one per portal + security), retries/trace/screenshot policy
pw.mjs                 runs the Playwright CLI with the repo-local PLAYWRIGHT_BROWSERS_PATH
global-setup.ts        API health check, portal reachability, hospital discovery (exported as env vars)
fixtures/              env + demo accounts, API client (rate-limit aware), scenarios (data builders), test fixtures
pages/                 page objects per portal (getByRole / getByLabel / getByText with regex)
tests/<project>/       specs
```

Conventions: no fixed sleeps (web-first assertions, `expect.poll`, `waitForResponse`), every test owns its data,
selectors follow accessible names, imports limited to `@playwright/test` and Node built-ins.
