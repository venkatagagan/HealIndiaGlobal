import { url } from '../../fixtures/env';
import { expect, test } from '../../fixtures/test';

/**
 * Phase-1 patient screens: home vs India block -> procedure page (earliest dates), hospital / doctor browsing
 * with "Soonest available", the visa guide checklist (ticks kept on the device) and the aftercare / reviews pages.
 * Needs the seeded catalogue and cost benchmarks.
 */
test.describe('patient-web phase 1', () => {
  test('home vs India card opens the procedure page with earliest dates', async ({ page, loginAs, scenarios }) => {
    const patient = await scenarios.registerPatient();
    await loginAs(patient);
    await page.goto(url('patient', '/app/'));

    const block = page.getByRole('heading', { name: /your country vs india/i });
    await expect(block).toBeVisible();
    await expect(page.getByText(/prices for|showing .* prices/i).first()).toBeVisible();
    // every card shows an estimate source button; a saving badge only appears with a medium/high benchmark
    const firstCard = page.getByRole('listitem').filter({ has: page.getByRole('button', { name: /estimate/i }) }).first();
    await expect(firstCard).toBeVisible();
    await firstCard.getByRole('link').first().click();

    await expect(page).toHaveURL(/\/app\/procedures\/[^/]+$/);
    await expect(page.getByRole('heading', { name: /price in india/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /earliest dates/i })).toBeVisible();
  });

  test('browse hospitals soonest first and open a hospital profile', async ({ page, loginAs, scenarios }) => {
    const patient = await scenarios.registerPatient();
    await loginAs(patient);
    await page.goto(url('patient', '/app/browse'));

    await expect(page.getByRole('heading', { level: 1, name: /hospitals & doctors/i })).toBeVisible();
    await expect(page.getByRole('combobox', { name: /sort by/i })).toHaveValue('soonest');
    const first = page.getByRole('main').getByRole('listitem').getByRole('link').first();
    await expect(first).toBeVisible();
    await first.click();

    await expect(page).toHaveURL(/\/app\/hospitals\/[^/]+$/);
    await expect(page.getByRole('heading', { name: /treatments and prices/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /patient reviews/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /request a quote/i }).first()).toBeVisible();
  });

  test('visa guide keeps checklist ticks on this device', async ({ page, loginAs, scenarios }) => {
    const patient = await scenarios.registerPatient();
    await loginAs(patient);
    await page.goto(url('patient', '/app/visa-guide?nationality=NG'));

    await expect(page.getByRole('heading', { level: 1, name: /visa guide/i })).toBeVisible();
    await expect(page.getByText(/for .* passport holders/i)).toBeVisible();
    const item = page.getByRole('checkbox').first();
    await expect(item).toBeVisible();
    await item.click();
    await expect(item).toHaveAttribute('aria-checked', 'true');
    await page.reload();
    await expect(page.getByRole('checkbox').first()).toHaveAttribute('aria-checked', 'true');
  });

  test('aftercare and my reviews pages load for a new patient', async ({ page, loginAs, scenarios }) => {
    const patient = await scenarios.registerPatient();
    await loginAs(patient);
    await page.goto(url('patient', '/app/aftercare'));
    await expect(page.getByRole('heading', { level: 1, name: /aftercare/i })).toBeVisible();
    await expect(page.getByText(/no aftercare yet/i)).toBeVisible();

    await page.goto(url('patient', '/app/reviews'));
    await expect(page.getByRole('heading', { level: 1, name: /my reviews/i })).toBeVisible();
    await expect(page.getByText(/you have not written any reviews yet/i).first()).toBeVisible();
  });
});
