import { url } from '../../fixtures/env';
import { e2eName, uniqueSuffix } from '../../fixtures/data';
import { itemsOf } from '../../fixtures/scenarios';
import { expect, test } from '../../fixtures/test';
import type { HospitalCard, Page } from '../../fixtures/types';
import { AdminCatalog, AdminPartners } from '../../pages/admin';
import { expectToast } from '../../pages/common';

test.describe('admin-portal operations', () => {

  test('approve a pending hospital from the approval queue', async ({ page, loginAs, scenarios, anonApi, apiAs }) => {
    const pending = await scenarios.registerPendingHospital();
    await loginAs('admin');
    try {
      await new AdminPartners(page).approveHospital(pending.hospitalName);
      await expectToast(page, /approved/i);
      await expect(page.getByText(/^active$/i).first()).toBeVisible();

      // active hospitals are listed publicly
      const listed = itemsOf(await anonApi.get<Page<HospitalCard>>('/hospitals', { q: pending.hospitalName, page_size: 5 }));
      expect(listed.map((h) => h.name)).toContain(pending.hospitalName);
    } finally {
      // keep the public catalog clean: hide the throwaway hospital again
      if (pending.hospitalId) {
        const admin = await apiAs('admin');
        await admin.raw('POST', `/admin/hospitals/${pending.hospitalId}/suspend`, { reason: 'e2e cleanup' });
      }
    }
  });

  test('a row click is not cancelled by a search that is still debouncing', async ({ page, loginAs, scenarios }) => {
    // Regression: with lazy routes the list stays mounted while the detail page loads; the debounced search
    // used to fire setSearchParams during that window and navigate back to the list.
    const hospital = await scenarios.hospital();
    await loginAs('admin');
    await page.goto(url('admin', `/hospitals?q=${encodeURIComponent(hospital.name)}`));
    const row = page.getByRole('row').filter({ hasText: hospital.name });
    await expect(row).toHaveCount(1, { timeout: 15_000 });

    // make the detail page's code-split module slow, then change the search and click before it is applied
    await page.route(/HospitalDetailPage/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      await route.continue();
    });
    await page.getByPlaceholder(/name, city or email/i).fill(hospital.name.toLowerCase());
    await row.click();

    await expect(page).toHaveURL(new RegExp(`/hospitals/${hospital.id}$`));
    await expect(page.getByRole('heading', { level: 1, name: hospital.name })).toBeVisible();
    await page.waitForTimeout(500); // past the 300 ms search debounce: still on the detail page
    await expect(page).toHaveURL(new RegExp(`/hospitals/${hospital.id}$`));
  });

  test('approve a pending agent', async ({ page, loginAs, scenarios, apiAs }) => {
    const agent = await scenarios.registerAgent();
    await loginAs('admin');
    await new AdminPartners(page).approveAgent(agent.email, agent.agencyName);
    await expectToast(page, /approved/i);
    await expect(page.getByRole('dialog').getByText(/^active$/i).first()).toBeVisible();

    const admin = await apiAs('admin');
    const found = itemsOf(await admin.get<Page<{ email?: string; agency_name: string; status: string }>>('/admin/agents', { q: agent.email }));
    expect(found.find((a) => a.agency_name === agent.agencyName)?.status).toBe('active');
  });

  test('create a specialty in the catalog', async ({ page, loginAs, apiAs }) => {
    await loginAs('admin');
    const catalog = new AdminCatalog(page);
    await catalog.gotoSpecialties();

    const name = e2eName('Specialty');
    const slug = `e2e-specialty-${uniqueSuffix()}`;
    const created = await catalog.createSpecialty({
      name,
      slug,
      icon: 'stethoscope',
      savingsMin: '40',
      savingsMax: '60',
      description: 'Created by the Playwright e2e suite (inactive).',
      active: false, // never shown on the public site
    });
    try {
      expect(created.slug).toBe(slug);
      await expectToast(page, /created|saved|added/i);
      await page.getByPlaceholder(/search specialt/i).fill(name);
      await expect(page.getByRole('row').filter({ hasText: name })).toBeVisible();
    } finally {
      const admin = await apiAs('admin');
      await admin.raw('DELETE', `/admin/specialties/${created.id}`);
    }
  });

  test('platform settings page lists the business settings', { tag: '@smoke' }, async ({ page, loginAs }) => {
    await loginAs('admin');
    await page.goto(url('admin', '/settings'));
    await expect(page.getByRole('heading', { level: 1, name: /platform settings/i })).toBeVisible();
    for (const label of [/default hospital commission/i, /booking deposit/i, /gst on commission/i, /settlement hold/i, /refund policy/i, /supported currencies/i]) {
      await expect(page.getByText(label).first()).toBeVisible();
    }
  });
});
