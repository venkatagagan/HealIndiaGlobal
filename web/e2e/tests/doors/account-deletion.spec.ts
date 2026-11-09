import { PUBLIC_LOGIN_URL, url } from '../../fixtures/env';
import { escapeRegExp } from '../../fixtures/data';
import { expect, test } from '../../fixtures/test';
import { dialog, LoginForm, waitForApi } from '../../pages/common';

/**
 * Account deletion (app-store requirement): the public page on the website explains the process and links each
 * account type to the door with `next` = its account page; a patient deletes their own (freshly registered) account
 * from Profile > Privacy & account, after which the credentials no longer work.
 */
const WEBSITE = new URL(PUBLIC_LOGIN_URL).origin;

test.describe('account deletion', () => {
  test('public deletion page explains the process', { tag: '@smoke' }, async ({ page }) => {
    await page.goto(`${WEBSITE}/account/delete`);
    await expect(page.getByRole('heading', { level: 1, name: /delete your account/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /how to delete your account/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /what we keep|retained|kept/i }).first()).toBeVisible();
    const patientLink = page.getByRole('link', { name: /sign in to delete \(patient\)/i });
    await expect(patientLink).toHaveAttribute('href', /\/login\?next=.*profile%3Ftab%3Dprivacy/);
    await expect(page.getByRole('link', { name: /^agent account$/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /^hospital account$/i })).toBeVisible();
  });

  test('a patient deletes their account from the portal', async ({ page, scenarios, anonApi }) => {
    const account = await scenarios.registerPatient('US');

    await page.goto(`${WEBSITE}/account/delete`);
    await page.getByRole('link', { name: /sign in to delete \(patient\)/i }).click();
    await expect(page).toHaveURL(/\/login\?next=/);
    await new LoginForm(page).login(account);

    await expect(page).toHaveURL(new RegExp(`^${escapeRegExp(url('patient', '/app/profile'))}\\?tab=privacy`), { timeout: 30_000 });
    await page.getByRole('button', { name: /^delete my account$/i }).click();
    const confirm = dialog(page, /delete your account\?/i);
    await expect(confirm).toBeVisible();
    const submit = confirm.getByRole('button', { name: /^delete permanently$/i });
    await expect(submit).toBeDisabled();
    await confirm.getByLabel(/your password/i).fill(account.password);
    await confirm.getByLabel(/type delete to confirm/i).fill('DELETE');
    await expect(submit).toBeEnabled();
    const deleted = waitForApi(page, 'DELETE', /\/api\/v1\/auth\/me$/, false);
    await submit.click();
    expect((await deleted).status()).toBe(204);
    // The confirmation (with the retained-data list) must stay on screen; soft so the API check below still runs.
    await expect.soft(page.getByText(/your account has been deleted/i)).toBeVisible();

    // the credentials no longer work
    const login = await anonApi.raw('POST', '/auth/login', { email: account.email, password: account.password });
    expect(login.status).toBe(401);
  });
});
