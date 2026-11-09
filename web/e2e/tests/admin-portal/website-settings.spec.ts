import { PUBLIC_LOGIN_URL, url } from '../../fixtures/env';
import { expect, test } from '../../fixtures/test';
import { expectToast } from '../../pages/common';

/**
 * System -> Website & contact (super admin): a saved WhatsApp number reaches the public website's floating button
 * within seconds (backend enqueues the `site` revalidation; the website expires its `site` fetch tag).
 *
 * Needs the website (`next dev`, :3000) and on-demand revalidation configured on both sides (REVALIDATE_SECRET in
 * backend/.env and website/.env.local). Restores the previous value afterwards.
 */
const WEBSITE = new URL(PUBLIC_LOGIN_URL).origin;

interface Setting {
  key: string;
  value: Record<string, unknown>;
}

test.describe('admin-portal website & contact settings', () => {
  test('super admin changes the WhatsApp number and the website button follows', async ({ page, browser, loginAs, apiAs }) => {
    test.setTimeout(120_000);
    const api = await apiAs('superadmin');
    const settings = await api.get<Setting[]>('/admin/settings');
    const original = settings.find((s) => s.key === 'helplines')!.value;
    const digits = `9198${String(Date.now()).slice(-8)}`;
    const display = `+${digits.slice(0, 2)} ${digits.slice(2, 7)} ${digits.slice(7)}`;

    await loginAs('superadmin');
    try {
      await page.goto(url('admin', '/settings/website'));
      const section = page.getByTestId('website-setting-helplines');
      await section.getByLabel('WhatsApp number').fill(display);
      await section.getByRole('button', { name: 'Save' }).click();
      await expectToast(page, /saved/i);
      const savedAt = Date.now();

      // the website (a separate browser context: no shared cache) shows the new number on the floating button
      const site = await browser.newPage();
      try {
        await expect
          .poll(
            async () => {
              await site.goto(`${WEBSITE}/contact`, { waitUntil: 'domcontentloaded' });
              const links = site.locator('[data-floating-contact] a[href^="https://wa.me/"]');
              return (await links.count()) ? await links.first().getAttribute('href') : null;
            },
            { timeout: 60_000, intervals: [1_000, 2_000, 3_000] },
          )
          .toContain(`https://wa.me/${digits}`);
        test.info().annotations.push({ type: 'website updated after', description: `${Math.round((Date.now() - savedAt) / 1000)} s` });
      } finally {
        await site.close();
      }
    } finally {
      await api.put('/admin/settings/helplines', { value: original });
    }
  });

  test('admin can view but not edit', async ({ page, loginAs }) => {
    await loginAs('admin');
    await page.goto(url('admin', '/settings/website'));
    await expect(page.getByText(/only a super admin can change these settings/i)).toBeVisible();
    const section = page.getByTestId('website-setting-helplines');
    await expect(section.getByLabel('WhatsApp number')).toBeDisabled();
    await expect(section.getByRole('button', { name: 'Save' })).toHaveCount(0);
  });
});
