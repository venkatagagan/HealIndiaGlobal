import { expect, test, type Locator, type Page, type Response } from '@playwright/test';
import type { Account } from '../fixtures/accounts';
import { escapeRegExp } from '../fixtures/data';
import { PORTALS, PUBLIC_LOGIN_URL, url, type PortalName } from '../fixtures/env';

/** Sonner toasts (all portals use sonner's <Toaster/>). */
export function toasts(page: Page): Locator {
  return page.locator('[data-sonner-toast]');
}

export async function expectToast(page: Page, text: RegExp): Promise<void> {
  await expect(toasts(page).filter({ hasText: text }).first()).toBeVisible({ timeout: 15_000 });
}

/** Waits for an API response (through the portal's /api/v1 proxy) matching method + path pattern. */
export function waitForApi(page: Page, method: string, path: RegExp, okOnly = true): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === method.toUpperCase() &&
      path.test(new URL(response.url()).pathname) &&
      (!okOnly || response.ok()),
    { timeout: 30_000 },
  );
}

/**
 * The open modal dialog (native <dialog> or role="dialog"), optionally narrowed by text it contains (its title).
 * Closed native dialogs are hidden, so getByRole only sees the open one(s).
 */
export function dialog(page: Page, title?: RegExp): Locator {
  const open = page.getByRole('dialog');
  return (title ? open.filter({ hasText: title }) : open).last();
}

/** Visible elements only (Playwright >= 1.51). */
export function visible(locator: Locator): Locator {
  return locator.filter({ visible: true });
}

/** Accessible name of a login email field ("Email", "Work email", "Email address"; required "*" tolerated). */
export const EMAIL_LABEL = /^(work )?email( address)?\s*\*?$/i;

/** Login endpoints of both doors (PLAN 3.1): public `/auth/login`, staff `/auth/staff/login`. */
const LOGIN_PATH = /\/api\/v1\/auth\/(staff\/)?login$/;

/**
 * A login form: the website's public door, the admin console's staff door, or (before PLAN 3.1 lands) a portal's
 * own /login page - all use "Email"/"Password" fields and a "Sign in"/"Log in" button.
 */
export class LoginForm {
  constructor(readonly page: Page) {}

  get email(): Locator {
    return this.page.getByLabel(EMAIL_LABEL).first();
  }
  get password(): Locator {
    return this.page.getByLabel(/^password\s*\*?$/i).first();
  }
  get submit(): Locator {
    return this.page.getByRole('button', { name: /^(sign in|log ?in)$/i }).first();
  }

  /**
   * Submits the form and returns the login response. A 429 (login limits: 10/min/IP public, 5/min staff) is waited
   * out (Retry-After, test timeout extended) and the form submitted again, up to 3 times - the forms keep their
   * values, so this is exactly what a user retrying would do. Run e2e with RATE_LIMIT_ENABLED=false to avoid it.
   */
  async submitWithRetry(): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      const response = waitForApi(this.page, 'POST', LOGIN_PATH, false);
      await this.submit.click();
      const res = await response;
      if (res.status() !== 429 || attempt >= 3) return res;
      const retryAfter = Number(res.headers()['retry-after'] ?? '10');
      const waitMs = Math.min(65_000, (Number.isFinite(retryAfter) ? retryAfter : 10) * 1000 + 500);
      console.warn(`[e2e] UI login rate limited (429); retrying in ${Math.round(waitMs / 1000)}s (RATE_LIMIT_ENABLED=false avoids this).`);
      test.info().setTimeout(test.info().timeout + waitMs + 10_000);
      await this.page.waitForTimeout(waitMs);
    }
  }

  async login(account: Pick<Account, 'email' | 'password'>): Promise<void> {
    await expect(this.email).toBeVisible();
    await this.email.fill(account.email);
    await this.password.fill(account.password);
    const res = await this.submitWithRetry();
    if (res.status() === 401 && (await res.text()).includes('mfa_required')) {
      throw new Error(`${account.email} requires a TOTP code - run e2e with ADMIN_MFA_REQUIRED=false (dev default).`);
    }
    expect(res.status(), `POST ${new URL(res.url()).pathname} as ${account.email}`).toBe(200);
  }
}

const DOOR_ORIGIN = new URL(PUBLIC_LOGIN_URL).origin;
const STUB_DOOR = `<!doctype html><html lang="en"><body><main><h1>Public login door (e2e stub)</h1>
<form><label for="e">Email address</label><input id="e" type="email"><label for="p">Password</label>
<input id="p" type="password"><button type="button">Log in</button></form></main></body></html>`;

/**
 * When the website (PLAN 3.1 public door, :3000) is not running, answer its URLs with a stub login page so
 * redirects to the door can still be asserted. Returns true when the stub is active.
 */
export async function stubPublicDoorIfDown(page: Page): Promise<boolean> {
  if (process.env.E2E_PUBLIC_DOOR_UP === '1') return false;
  await page.route(`${DOOR_ORIGIN}/**`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: STUB_DOOR }));
  return true;
}

export function isPublicDoorUrl(href: string): boolean {
  return href.startsWith(DOOR_ORIGIN);
}

/**
 * Signs in through the door the portal sends anonymous visitors to: the PLAN 3.1 public door on the website (then
 * back to the portal via `?next=`), the admin console's staff door, or a portal's own /login form. Returns
 * 'door-down' when the portal redirects to the website door but the website is not running.
 */
export async function signInThroughDoor(page: Page, portal: PortalName, account: Account): Promise<'signed-in' | 'door-down'> {
  const stubbed = await stubPublicDoorIfDown(page);
  await page.goto(url(portal, '/'));
  await expect(page).toHaveURL(/login/i, { timeout: 20_000 });
  if (stubbed && isPublicDoorUrl(page.url())) return 'door-down';
  await new LoginForm(page).login(account);
  await expect(page).toHaveURL(new RegExp(`^${escapeRegExp(PORTALS[portal])}`), { timeout: 20_000 });
  await expect(page).not.toHaveURL(/\/login(\?|$)/);
  return 'signed-in';
}

/** Asserts the page shows a login screen (redirected there by a route guard). */
export async function expectLoginScreen(page: Page): Promise<void> {
  await expect(page).toHaveURL(/login/i);
  await expect(page.getByLabel(EMAIL_LABEL).first()).toBeVisible();
}

/** Text shown by role guards ("This portal is not for your account", "This portal is for hospital partners"...). */
export const ACCESS_DENIED =
  /not authori[sz]ed|forbidden|access denied|(do not|don't) have (access|permission)|not allowed|staff only|staff account|portal is not for your account|this portal is for|this area is for|use (the|your own) portal|permission/i;

/**
 * Waits until a protected portal page is refused: redirected to a login form, shown an access-denied screen, or
 * sent away to the user's own portal (PLAN 3.1). Fails if the protected page stays reachable.
 */
export async function expectBlocked(page: Page, portal: PortalName): Promise<'login' | 'denied' | 'redirected'> {
  const root = PORTALS[portal];
  const state = async (): Promise<'login' | 'denied' | 'redirected' | null> => {
    if (!page.url().startsWith(root)) return 'redirected';
    if (await page.getByText(ACCESS_DENIED).first().isVisible()) return 'denied';
    if (/login/i.test(page.url()) && (await page.getByLabel(EMAIL_LABEL).first().isVisible())) return 'login';
    return null;
  };
  await expect
    .poll(state, { message: `${page.url()} should be blocked (login, access denied or redirect away)`, timeout: 20_000 })
    .not.toBeNull();
  const outcome = (await state()) ?? 'redirected';
  test.info().annotations.push({ type: 'guard', description: `${portal}: ${outcome} (${page.url()})` });
  return outcome;
}

/** Table row (role=row) containing `text`. */
export function rowWith(scope: Page | Locator, text: string | RegExp): Locator {
  return scope.getByRole('row').filter({ hasText: text }).first();
}
