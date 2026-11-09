import { defineConfig, devices } from '@playwright/test';
import { IS_CI, PORTALS, PUBLIC_LOGIN_URL } from './fixtures/env';

/**
 * Heal India Global - end-to-end tests for the four web portals.
 *
 * The suite runs against an already running stack (API :8000 + Vite dev servers :5173-:5176) with seeded demo
 * data - see README.md. Tag conventions: `@slow` (multi-step money/booking flows), `@smoke` (fast render
 * checks). Chromium only.
 */
export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  globalSetup: './global-setup.ts',

  timeout: 60_000,
  expect: { timeout: 10_000 },

  // Files run in parallel; tests inside one file run in order (each test still builds its own data).
  fullyParallel: false,
  forbidOnly: IS_CI,
  retries: IS_CI ? 1 : 0,
  workers: process.env.E2E_WORKERS ? Number(process.env.E2E_WORKERS) : IS_CI ? 2 : 3,

  reporter: IS_CI
    ? [
        ['list'],
        ['github'],
        ['html', { open: 'never', outputFolder: 'playwright-report' }],
        ['junit', { outputFile: 'test-results/junit.xml' }],
      ]
    : [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],

  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    // Vite compiles modules on first request; the first navigation of a run can be slow.
    navigationTimeout: 45_000,
    locale: 'en-US',
    timezoneId: 'UTC',
    colorScheme: 'light',
  },

  projects: [
    {
      // PLAN 3.1 doors: website public door (:3000) -> role redirect, staff door (/gahi/), account deletion.
      name: 'doors',
      testDir: './tests/doors',
      use: { ...devices['Desktop Chrome'], baseURL: new URL(PUBLIC_LOGIN_URL).origin },
    },
    {
      name: 'patient-web',
      testDir: './tests/patient-web',
      use: { ...devices['Desktop Chrome'], baseURL: PORTALS.patient },
    },
    {
      name: 'agent-portal',
      testDir: './tests/agent-portal',
      use: { ...devices['Desktop Chrome'], baseURL: PORTALS.agent },
    },
    {
      name: 'hospital-portal',
      testDir: './tests/hospital-portal',
      use: { ...devices['Desktop Chrome'], baseURL: PORTALS.hospital },
    },
    {
      name: 'admin-portal',
      testDir: './tests/admin-portal',
      use: { ...devices['Desktop Chrome'], baseURL: PORTALS.admin },
    },
    {
      // Cross-portal access-control checks (tests use absolute portal URLs).
      name: 'security',
      testDir: './tests/security',
      use: { ...devices['Desktop Chrome'], baseURL: PORTALS.admin },
    },
  ],

  /*
   * webServer is intentionally left disabled: the stack needs PostgreSQL, migrations and seed data first.
   * Start it yourself (see README.md):
   *
   *   powershell -ExecutionPolicy Bypass -File scripts\dev.ps1          # API :8000 + all four portals
   *
   * To let Playwright start the servers instead (e.g. in CI after `alembic upgrade head` + `seed.py`), uncomment
   * and adjust. `reuseExistingServer` keeps already running servers.
   *
   * webServer: [
   *   {
   *     command: '..\\..\\backend\\.venv\\Scripts\\python -m uvicorn app.main:app --port 8000',   // POSIX: ../../backend/.venv/bin/python
   *     cwd: '../../backend',
   *     url: 'http://127.0.0.1:8000/api/v1/health/live',
   *     reuseExistingServer: !IS_CI,
   *     timeout: 120_000,
   *     env: { RATE_LIMIT_ENABLED: 'false', PAYMENT_GATEWAYS_ENABLED: 'mock,bank_transfer' },
   *   },
   *   { command: 'npm run dev -w apps/patient-web', cwd: '..', url: PORTALS.patient, reuseExistingServer: !IS_CI, timeout: 120_000 },
   *   { command: 'npm run dev -w apps/agent-portal', cwd: '..', url: PORTALS.agent, reuseExistingServer: !IS_CI, timeout: 120_000 },
   *   { command: 'npm run dev -w apps/hospital-portal', cwd: '..', url: PORTALS.hospital, reuseExistingServer: !IS_CI, timeout: 120_000 },
   *   { command: 'npm run dev -w apps/admin-portal', cwd: '..', url: PORTALS.admin, reuseExistingServer: !IS_CI, timeout: 120_000 },
   * ],
   */
});
