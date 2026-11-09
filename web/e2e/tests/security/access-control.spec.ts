import type { Page } from '@playwright/test';
import { escapeRegExp } from '../../fixtures/data';
import { PORTALS, PUBLIC_LOGIN_URL, url, type PortalName } from '../../fixtures/env';
import { expect, test } from '../../fixtures/test';
import { expectBlocked as expectBlockedOrAway } from '../../pages/common';

/** Text shown by the portals' role guards ("This portal is for hospital partners", "You don't have access"...). */
const ACCESS_DENIED =
  /not authori[sz]ed|forbidden|access denied|(do not|don't) have (access|permission)|not allowed|staff only|staff account|this portal is for|use (the|your own) portal|permission/i;

/** Login form (redirect) or an access-denied screen - never the protected content. */
async function expectBlocked(page: Page): Promise<'login' | 'denied'> {
  const denied = page.getByText(ACCESS_DENIED).first();
  const login = page.getByLabel(/^(work )?email( address)?\s*\*?$/i).first();
  await expect(denied.or(login)).toBeVisible();
  return (await denied.isVisible()) ? 'denied' : 'login';
}

test.describe('access control', () => {
  test('a patient session cannot open admin-portal routes', async ({ page, loginAs, apiAs }) => {
    // one cookie-based session for every portal on this host (cookies are not port-scoped)
    await loginAs('patient', 'admin');

    for (const path of ['/dashboard', '/hospitals', '/settings', '/finance', '/finance/settlements/batches']) {
      await page.goto(`${PORTALS.admin}${path}`);
      const outcome = await expectBlocked(page);
      // admin navigation / data must not render for a patient
      await expect(page.getByRole('heading', { level: 1, name: /^(dashboard|hospitals|platform settings|settlements|finance overview)$/i })).toHaveCount(0);
      test.info().annotations.push({ type: 'admin guard', description: `${path}: ${outcome}` });
    }

    // the API is the real boundary
    const patient = await apiAs('patient');
    expect((await patient.raw('GET', '/admin/dashboard')).status).toBe(403);
    expect((await patient.raw('GET', '/admin/users')).status).toBe(403);
    expect((await patient.raw('GET', '/finance/settlements/batches')).status).toBe(403);
    expect((await patient.raw('POST', '/finance/settlements/batches', { payee_type: 'hospital' })).status).toBe(403);
    expect((await patient.raw('PUT', '/admin/settings/deposit_pct', { value: 1 })).status).toBe(403);
  });

  test('a patient session cannot use the agent or hospital portals', async ({ page, loginAs }) => {
    await loginAs('patient', 'patient');
    await page.goto(url('agent', '/patients'));
    // refused: sent back to the patient's own portal, the door, or an access-denied screen
    expect(await expectBlockedOrAway(page, 'agent')).not.toBeNull();
    await expect(page.getByRole('heading', { level: 1, name: /^patients$/i })).toHaveCount(0);

    await page.goto(url('hospital', '/cases'));
    expect(await expectBlockedOrAway(page, 'hospital')).not.toBeNull();
    await expect(page.getByRole('heading', { level: 1, name: /enquiries & cases/i })).toHaveCount(0);
  });

  test('unauthenticated visitors are sent to their door with ?next=', async ({ newSession }) => {
    const protectedRoutes: [PortalName, string][] = [
      ['patient', '/app/'],
      ['patient', '/app/cases'],
      ['agent', '/patients'],
      ['agent', '/commissions'],
      ['hospital', '/cases'],
      ['hospital', '/bookings'],
    ];
    for (const [portal, path] of protectedRoutes) {
      const { page } = await newSession(null, portal);
      await page.goto(url(portal, path));
      // public door on the website (PLAN 3.1), keeping the destination
      await expect(page).toHaveURL(new RegExp(`^${escapeRegExp(PUBLIC_LOGIN_URL)}\\?next=`), { timeout: 30_000 });
      expect(new URL(page.url()).searchParams.get('next') ?? '').toContain(url(portal, path).replace(/\/$/, ''));
      await page.context().close();
    }
    // the admin console uses its own staff door
    for (const path of ['/dashboard', '/finance/settlements/batches']) {
      const { page } = await newSession(null, 'admin');
      await page.goto(url('admin', path));
      await expect(page).toHaveURL(new RegExp(`^${escapeRegExp(url('admin', '/login'))}`), { timeout: 30_000 });
      await expect(page.getByLabel(/^email/i).first()).toBeVisible();
      await page.context().close();
    }
  });

  test('API rejects anonymous and cross-tenant access', async ({ anonApi, scenarios, apiAs }) => {
    expect((await anonApi.raw('GET', '/cases')).status).toBe(401);
    expect((await anonApi.raw('GET', '/admin/dashboard')).status).toBe(401);

    // a case of the demo patient is invisible (404, not 403) to another patient
    const enquiry = await scenarios.enquiry();
    const other = await apiAs(await scenarios.registerPatient('GB'));
    expect((await other.raw('GET', `/cases/${enquiry.id}`)).status).toBe(404);
  });
});
