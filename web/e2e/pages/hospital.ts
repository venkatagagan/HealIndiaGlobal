import { expect, type Locator, type Page } from '@playwright/test';
import { url } from '../fixtures/env';
import { dialog, waitForApi } from './common';

export interface QuoteLineInput {
  category?: string; // option label, e.g. "Implants"
  description?: string;
  amount: string; // major units, e.g. "250000"
}

/** Enquiries & cases inbox (/cases) and case detail (/cases/:id) with the itemized quote form. */
export class HospitalCases {
  constructor(readonly page: Page) {}

  async gotoInbox(): Promise<void> {
    await this.page.goto(url('hospital', '/cases'));
    await expect(this.page.getByRole('heading', { name: /enquiries & cases/i })).toBeVisible();
  }

  /** Finds the case in the inbox by its number (search box) and opens it. */
  async openFromInbox(caseNumber: string): Promise<void> {
    await this.gotoInbox();
    // DataTable list: debounced search box, then click the case's row (the whole row opens the case)
    await this.page.getByPlaceholder(/case number or patient/i).fill(caseNumber);
    const cell = this.page.getByRole('row').getByText(caseNumber, { exact: true });
    await expect(cell).toBeVisible({ timeout: 15_000 });
    await cell.click();
    await expect(this.page).toHaveURL(/\/cases\/[^/]+$/);
    await expect(this.page.getByRole('heading', { name: new RegExp(caseNumber) }).first()).toBeVisible();
  }

  async openQuoteForm(): Promise<Locator> {
    await this.page.getByRole('button', { name: /^(send|revise) quote$/i }).first().click();
    const form = dialog(this.page, /line items/i);
    await expect(form).toBeVisible();
    return form;
  }

  /**
   * Fills the itemized quote. The form starts with default lines (surgery, stay, medications, tests); amounts are
   * filled in order and extra lines are added with "Add item".
   */
  async fillQuote(form: Locator, plan: string, lines: QuoteLineInput[], stayDays = '7'): Promise<void> {
    await form.getByLabel(/treatment plan/i).fill(plan);
    await form.getByLabel(/estimated stay/i).fill(stayDays);
    const amounts = form.getByLabel(/^amount/i);
    let existing = await amounts.count();
    for (const [index, line] of lines.entries()) {
      if (index >= existing) {
        await form.getByRole('button', { name: /add item/i }).click();
        existing += 1;
        await expect(amounts).toHaveCount(existing);
      }
      if (line.category) await form.getByLabel(/^category$/i).nth(index).selectOption({ label: line.category });
      if (line.description) await form.getByLabel(/^description$/i).nth(index).fill(line.description);
      await amounts.nth(index).fill(line.amount);
    }
    // drop untouched default lines beyond the ones we filled
    while ((await amounts.count()) > lines.length) {
      await form.getByRole('button', { name: /remove line item/i }).last().click();
    }
  }

  async submitQuote(form: Locator): Promise<{ id: string; total_minor: number; line_items: unknown[]; status: string }> {
    const sent = waitForApi(this.page, 'POST', /\/api\/v1\/cases\/[^/]+\/quotes$/);
    await form.getByRole('button', { name: /^send (revised )?quote/i }).click();
    const quote = await (await sent).json();
    await expect(form).toBeHidden();
    return quote;
  }
}

/** Booking detail (/bookings/:id): admit and discharge. */
export class HospitalBookings {
  constructor(readonly page: Page) {}

  async gotoList(): Promise<void> {
    await this.page.goto(url('hospital', '/bookings'));
    await expect(this.page.getByRole('heading', { name: /^bookings$/i })).toBeVisible();
  }

  async open(bookingNumber: string): Promise<void> {
    const cell = this.page.getByRole('row').getByText(bookingNumber, { exact: true });
    await expect(cell).toBeVisible({ timeout: 15_000 });
    await cell.click();
    await expect(this.page).toHaveURL(/\/bookings\/[^/]+$/);
    await expect(this.page.getByText(bookingNumber).first()).toBeVisible();
  }

  async admit(): Promise<void> {
    await this.page.getByRole('button', { name: /^admit patient$/i }).click();
    const confirm = dialog(this.page, /admit patient\?/i);
    await expect(confirm).toBeVisible();
    const admitted = waitForApi(this.page, 'POST', /\/api\/v1\/bookings\/[^/]+\/admit$/);
    await confirm.getByRole('button', { name: /confirm admission/i }).click();
    await admitted;
  }

  async discharge(dischargeDate?: string): Promise<void> {
    await this.page.getByRole('button', { name: /discharge & complete/i }).click();
    const confirm = dialog(this.page, /discharge & complete treatment\?/i);
    await expect(confirm).toBeVisible();
    if (dischargeDate) await confirm.getByLabel(/discharge date/i).fill(dischargeDate);
    const completed = waitForApi(this.page, 'POST', /\/api\/v1\/bookings\/[^/]+\/complete$/, false);
    await confirm.getByRole('button', { name: /discharge patient/i }).click();
    const response = await completed;
    expect(response.status(), `complete booking: ${await response.text()}`).toBe(200);
  }
}

/** Doctor availability editor (/doctors/:id/availability). */
export class AvailabilityEditor {
  constructor(readonly page: Page) {}

  /** Opens the editor of the first doctor in the list; returns the doctor id from the URL. */
  async openFirstDoctor(): Promise<string> {
    await this.page.goto(url('hospital', '/doctors'));
    await expect(this.page.getByRole('heading', { name: /^doctors$/i })).toBeVisible();
    await this.page.getByRole('link', { name: /^availability/i }).first().click();
    await expect(this.page).toHaveURL(/\/doctors\/[^/]+\/availability$/);
    await expect(this.page.getByRole('heading', { name: /availability/i }).first()).toBeVisible();
    const id = /\/doctors\/([^/]+)\/availability/.exec(this.page.url())?.[1];
    if (!id) throw new Error(`doctor id not found in ${this.page.url()}`);
    return id;
  }

  /** Capacity input of one day ("Consultation capacity on 5 November"). */
  capacityInput(kind: 'Consultation' | 'Admission', dayLabel: string): Locator {
    return this.page.getByLabel(new RegExp(`${kind} capacity on ${dayLabel}$`, 'i'));
  }

  async save(): Promise<void> {
    const saved = waitForApi(this.page, 'PUT', /\/api\/v1\/hospital-portal\/doctors\/[^/]+\/availability$/);
    await this.page.getByRole('button', { name: /save changes/i }).click();
    await saved;
  }
}
