import { expect, type Locator, type Page } from '@playwright/test';
import { PUBLIC_LOGIN_URL, url } from '../fixtures/env';
import { escapeRegExp } from '../fixtures/data';
import { dialog, waitForApi } from './common';

/**
 * "Continue as guest" on the website's public door (PLAN 3.1): POST /auth/guest, then the website sends the guest
 * to the patient portal's AI screening start page (/app/screening/new).
 */
export async function startGuestSession(page: Page): Promise<void> {
  await page.goto(PUBLIC_LOGIN_URL);
  const guest = waitForApi(page, 'POST', /\/api\/v1\/auth\/guest$/);
  await page.getByRole('button', { name: /continue as guest/i }).click();
  // (the website navigates away immediately, so the response body is not readable here)
  expect((await guest).status()).toBeLessThan(300);
  await expect(page).toHaveURL(new RegExp(`^${escapeRegExp(url('patient', '/app/screening/new'))}`), {
    timeout: 30_000,
  });
}

/**
 * Guest -> full account through the "Create your account" dialog (POST /auth/guest/upgrade). `opener` is the
 * "Create account" button that opens it (dashboard banner or an in-flow guest gate).
 */
export async function completeGuestUpgrade(
  page: Page,
  input: { fullName: string; email: string; password: string },
): Promise<void> {
  const form = dialog(page, /create your account/i);
  await expect(form).toBeVisible();
  await form.getByLabel(/^full name/i).fill(input.fullName);
  await form.getByLabel(/^email/i).fill(input.email);
  await form.getByLabel(/^password/i).fill(input.password);
  await form.getByLabel(/^confirm password/i).fill(input.password);
  const upgraded = waitForApi(page, 'POST', /\/api\/v1\/auth\/guest\/upgrade$/);
  await form.getByRole('button', { name: /^create account$/i }).click();
  await upgraded;
  await expect(form).toBeHidden();
}

/** Guest -> full account from the dashboard banner ("Create account"). */
export async function upgradeGuest(page: Page, input: { fullName: string; email: string; password: string }): Promise<void> {
  await page.goto(url('patient', '/app/'));
  await page.getByRole('button', { name: /^create account$/i }).first().click();
  await completeGuestUpgrade(page, input);
}

/** AI screening wizard (/app/screening/new -> /app/screening/:id/step/1..4 -> processing -> results). */
export class ScreeningWizard {
  constructor(readonly page: Page) {}

  get stepHeading(): Locator {
    return this.page.getByRole('heading', { level: 1 });
  }

  /** Picks a specialty tile on /app/screening/new. */
  async chooseSpecialty(name: RegExp): Promise<void> {
    await expect(this.page.getByRole('heading', { name: /what brings you to india/i })).toBeVisible();
    const created = waitForApi(this.page, 'POST', /\/api\/v1\/screenings$/);
    await this.page.getByRole('button', { name }).first().click();
    await created;
    await expect(this.page).toHaveURL(/\/app\/screening\/[^/]+\/step\/1/);
  }

  async expectStep(step: number, title: RegExp): Promise<void> {
    await expect(this.page).toHaveURL(new RegExp(`/step/${step}$`));
    await expect(this.page.getByText(new RegExp(`Step ${step} of 4`, 'i'))).toBeVisible();
    await expect(this.stepHeading).toHaveText(title);
  }

  async next(): Promise<void> {
    const saved = waitForApi(this.page, 'PATCH', /\/api\/v1\/screenings\/[^/]+$/);
    await this.page.getByRole('button', { name: /^next/i }).click();
    await saved;
  }

  /** Step 1: body area chip ("Or choose from the list") + pain slider. */
  async answerBodyMap(area: string, pain: number): Promise<void> {
    await this.page.getByRole('button', { name: area, exact: true }).click();
    await expect(this.page.getByRole('button', { name: area, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await this.page.getByLabel(/pain intensity/i).fill(String(pain));
    await expect(this.page.getByText(new RegExp(`${pain}/10`))).toBeVisible();
  }

  /** Step 2: adds a custom symptom (answered "yes") - independent of the symptom library contents. */
  async addSymptom(symptom: string): Promise<void> {
    const input = this.page.getByLabel(/add another symptom/i);
    await input.fill(symptom);
    await input.press('Enter');
    // answered symptoms get a per-row answer <select> ("Change answer for <name>")
    await expect(this.page.getByLabel(`Change answer for ${symptom}`)).toHaveValue('yes');
  }

  /** Step 3: duration (default unit weeks). */
  async answerDuration(value: number, unit: 'Days' | 'Weeks' | 'Months' | 'Years' = 'Months'): Promise<void> {
    await this.page.getByRole('radiogroup', { name: /duration unit/i }).getByRole('button', { name: unit }).click();
    await this.page.getByLabel(/^number of/i).fill(String(value));
  }

  /** Step 4: turn off "Use AI recommendations" so the deterministic rules engine is used. */
  async disableAi(): Promise<void> {
    const toggle = this.page.getByRole('switch', { name: /use ai recommendations/i });
    if ((await toggle.getAttribute('aria-checked')) === 'true') await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
  }

  async findMyDoctors(): Promise<void> {
    const submitted = waitForApi(this.page, 'POST', /\/api\/v1\/screenings\/[^/]+\/submit$/);
    await this.page.getByRole('button', { name: /find my doctors/i }).click();
    await submitted;
  }

  /** Processing page -> results (the page polls until the worker has completed the screening). */
  async waitForResults(): Promise<void> {
    await expect(this.page).toHaveURL(/\/app\/screening\/[^/]+\/(processing|results)/);
    await expect(this.page).toHaveURL(/\/results$/, { timeout: 60_000 });
    await expect(this.page.getByRole('heading', { name: /your top matches/i })).toBeVisible();
  }

  matchCards(): Locator {
    return this.page.getByRole('button', { name: /^request quote$/i });
  }
}

/** "Select dates & package" (/app/cases/:id/book). */
export class BookPage {
  constructor(readonly page: Page) {}

  async expectLoaded(): Promise<void> {
    await expect(this.page).toHaveURL(/\/app\/cases\/[^/]+\/book$/);
    await expect(this.page.getByRole('heading', { name: /select dates & package/i })).toBeVisible();
  }

  /**
   * Picks an admission date: a green day of the availability calendar (random among the first free days so
   * parallel runs do not race for one slot), or the manual date input when the hospital publishes no slots.
   */
  async chooseAdmissionDate(fallbackIsoDate: string): Promise<void> {
    const calendar = this.page.getByRole('grid', { name: /admission dates/i });
    await expect(calendar).toBeVisible();
    const container = calendar.locator('..'); // carries aria-busy while the month's availability loads
    const manual = this.page.getByLabel(/preferred admission date/i);
    for (let month = 0; month < 3; month++) {
      const free = calendar.getByRole('gridcell', { name: /\d+ slots? available/i });
      await expect(container).toHaveAttribute('aria-busy', 'false', { timeout: 20_000 });
      if (await manual.isVisible()) {
        await manual.fill(fallbackIsoDate);
        return;
      }
      const count = await free.count();
      if (count > 0) {
        await free.nth(Math.floor(Math.random() * Math.min(count, 6))).click();
        await expect(this.page.getByText(/^admission on/i)).toBeVisible();
        return;
      }
      await this.page.getByRole('button', { name: /next month/i }).click();
    }
    throw new Error('No admission date with free slots in the next 3 months');
  }

  /** "Select package" options: the accepted quote (if any) and the hospital's standard packages. */
  private priceSources(): Locator {
    return this.page.locator('label').filter({ has: this.page.locator('input[name="price-source"]') });
  }

  /** Chooses a standard package tier (prefers `preferred`); returns its title, or null when none is offered. */
  async choosePackage(preferred: RegExp = /stay/i): Promise<string | null> {
    const packages = this.priceSources().filter({ hasNotText: /your accepted quote/i });
    await expect(this.priceSources().first()).toBeVisible();
    if ((await packages.count()) === 0) return null;
    const matching = packages.filter({ hasText: preferred });
    const pick = (await matching.count()) > 0 ? matching.first() : packages.first();
    const title = (await pick.locator('span.font-semibold').first().innerText()).trim();
    await pick.locator('input[type="radio"]').check();
    await expect(pick.locator('input[type="radio"]')).toBeChecked();
    return title;
  }

  /** Keeps the accepted quote as the price source. */
  async chooseAcceptedQuote(): Promise<void> {
    const quote = this.priceSources().filter({ hasText: /your accepted quote/i });
    await quote.locator('input[type="radio"]').check();
  }

  async choosePaymentOption(option: RegExp = /pay a deposit now/i): Promise<void> {
    await this.page.getByLabel(option).check();
  }

  async proceedToPayment(): Promise<{ id: string; booking_number: string; payment_option: string; deposit_minor: number; total_minor: number }> {
    const created = waitForApi(this.page, 'POST', /\/api\/v1\/bookings$/);
    await this.page.getByRole('button', { name: /proceed to payment/i }).click();
    const booking = await (await created).json();
    await expect(this.page).toHaveURL(new RegExp(`/app/bookings/${booking.id}/pay`));
    return booking;
  }
}

/** Payment page (/app/bookings/:id/pay) with the development "Test payment" (mock) gateway. */
export class PayPage {
  constructor(readonly page: Page) {}

  async payWithMockGateway(): Promise<string> {
    await expect(this.page.getByText(/what would you like to pay\?/i)).toBeVisible();
    await this.page.getByLabel(/deposit to confirm your booking/i).check();
    const mock = this.page.getByLabel(/test payment \(development only\)/i);
    await expect(mock, 'mock gateway is offered only in dev builds or with VITE_ENABLE_MOCK_PAYMENTS=true').toBeVisible();
    await mock.check();

    const order = waitForApi(this.page, 'POST', /\/api\/v1\/payments\/orders$/);
    await this.page.getByRole('button', { name: /create test order/i }).click();
    const checkout = await (await order).json();
    expect(checkout.order.gateway).toBe('mock');
    expect(checkout.order.purpose).toBe('booking_deposit');

    const completed = waitForApi(this.page, 'POST', /\/api\/v1\/payments\/mock\/[^/]+\/complete$/);
    await this.page.getByRole('button', { name: /simulate success/i }).click();
    await completed;
    await expect(this.page).toHaveURL(/\/pay\/result\?order=/);
    await expect(this.page.getByRole('heading', { name: /payment successful/i })).toBeVisible({ timeout: 45_000 });
    return checkout.order.id as string;
  }
}

/** Patient case detail (/app/cases/:id). */
export class PatientCasePage {
  constructor(readonly page: Page) {}

  async goto(caseId: string): Promise<void> {
    await this.page.goto(url('patient', `/app/cases/${caseId}`));
    await expect(this.page.getByRole('heading', { name: /quotes/i }).first()).toBeVisible();
  }

  async acceptQuote(): Promise<void> {
    await this.page.getByRole('button', { name: /^accept quote$/i }).first().click();
    const confirm = dialog(this.page, /accept this quote/i);
    await expect(confirm).toBeVisible();
    const accepted = waitForApi(this.page, 'POST', /\/quotes\/[^/]+\/accept$/);
    await confirm.getByRole('button', { name: /^accept quote$/i }).click();
    await accepted;
  }
}

/**
 * Emergency gate (backlog #13): a case screened as an emergency blocks quote acceptance and booking until the
 * patient acknowledges the guidance. Acknowledges it when shown; returns whether it was shown.
 */
export async function acknowledgeEmergencyIfShown(page: Page): Promise<boolean> {
  const panel = page.getByRole('alert').filter({ hasText: /may need urgent medical care/i }).first();
  if (!(await panel.isVisible())) return false;
  await panel.getByRole('checkbox').check();
  const acked = waitForApi(page, 'POST', /\/api\/v1\/cases\/[^/]+\/emergency-ack$/);
  await panel.getByRole('button', { name: /i understand - continue/i }).click();
  await acked;
  await expect(panel).toBeHidden();
  return true;
}
