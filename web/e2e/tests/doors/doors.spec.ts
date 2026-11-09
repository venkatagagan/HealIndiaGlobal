import type { Page } from '@playwright/test';
import { ACCOUNTS, hospitalOwner, type Account } from '../../fixtures/accounts';
import { PORTALS, PUBLIC_LOGIN_URL, url } from '../../fixtures/env';
import { escapeRegExp } from '../../fixtures/data';
import { expect, test } from '../../fixtures/test';
import { LoginForm, waitForApi } from '../../pages/common';

/**
 * PLAN 3.1 doors: the website (:3000) is the single public door for patients, agents and hospital users and sends
 * each role to its own portal; staff sign in only at the admin console's staff door (/gahi/login) and are refused
 * at the public door with the generic "Invalid email or password." answer.
 */

const WEBSITE = new URL(PUBLIC_LOGIN_URL).origin;

async function loginAtPublicDoor(page: Page, account: Account): Promise<void> {
  await expect(page).toHaveURL(new RegExp(`^${escapeRegExp(PUBLIC_LOGIN_URL)}`));
  await expect(page.getByRole('heading', { name: /log in to heal india global/i })).toBeVisible();
  await new LoginForm(page).login(account);
}

test.describe('public website door', () => {
  test('website home -> Log in -> patient lands in the patient portal', { tag: '@smoke' }, async ({ page }) => {
    await page.goto(`${WEBSITE}/`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.getByRole('banner').getByRole('link', { name: /^log in$/i }).first().click();
    await loginAtPublicDoor(page, ACCOUNTS.patient);

    await expect(page).toHaveURL(new RegExp(`^${escapeRegExp(url('patient', '/app/'))}/?$`), { timeout: 30_000 });
    await expect(page.getByText(/patient\.us@|welcome|dashboard/i).first()).toBeVisible({ timeout: 30_000 });
    // "My cases" sits in the collapsed "Care" sidebar section; the dashboard links to the cases too
    await expect(page.getByRole('link', { name: /^cases|my cases|active cases/i }).first()).toBeVisible();
  });

  test('agent deep link -> door with ?next= -> back to the agent page', async ({ page }) => {
    const target = url('agent', '/patients');
    await page.goto(target);
    // the portal sends anonymous visitors to the website door, keeping the destination
    await expect(page).toHaveURL(new RegExp(`^${escapeRegExp(PUBLIC_LOGIN_URL)}\\?next=`), { timeout: 30_000 });
    expect(new URL(page.url()).searchParams.get('next')).toMatch(new RegExp(`^${escapeRegExp(target)}`));
    await loginAtPublicDoor(page, ACCOUNTS.agent);

    await expect(page).toHaveURL(new RegExp(`^${escapeRegExp(target)}`), { timeout: 30_000 });
    await expect(page.getByRole('heading', { level: 1, name: /^patients$/i })).toBeVisible({ timeout: 30_000 });
  });

  test('hospital owner is sent to the hospital portal', async ({ page, world }) => {
    await page.goto(PUBLIC_LOGIN_URL);
    await loginAtPublicDoor(page, hospitalOwner(world.hospitalSlug));

    await expect(page).toHaveURL(new RegExp(`^${escapeRegExp(PORTALS.hospital)}/`), { timeout: 30_000 });
    await expect(page.getByRole('link', { name: /enquiries/i }).first()).toBeVisible({ timeout: 30_000 });
  });

  test('a staff account is refused at the public door', async ({ page }) => {
    await page.goto(PUBLIC_LOGIN_URL);
    const form = new LoginForm(page);
    await form.email.fill(ACCOUNTS.admin.email);
    await form.password.fill(ACCOUNTS.admin.password);
    const response = await form.submitWithRetry();
    expect(new URL(response.url()).pathname).toBe('/api/v1/auth/login');
    expect(response.status()).toBe(401);
    await expect(page.getByText(/invalid email or password/i)).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`^${escapeRegExp(PUBLIC_LOGIN_URL)}`));
  });
});

test.describe('staff door', () => {
  test('admin signs in at /gahi/ through the staff door', async ({ page }) => {
    await page.goto(url('admin', '/'));
    await expect(page).toHaveURL(new RegExp(`^${escapeRegExp(url('admin', '/login'))}`), { timeout: 30_000 });
    const staffLogin = waitForApi(page, 'POST', /\/api\/v1\/auth\/staff\/login$/, false);
    await new LoginForm(page).login(ACCOUNTS.admin);
    expect((await staffLogin).status()).toBe(200);

    await expect(page).toHaveURL(new RegExp(`^${escapeRegExp(PORTALS.admin)}/(?!login)`), { timeout: 30_000 });
    await expect(page.getByRole('navigation').first()).toBeVisible();
    const cookies = await page.context().cookies();
    expect(cookies.map((c) => c.name)).toContain('hig_staff_refresh');
  });
});
