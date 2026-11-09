import { expect, type Locator, type Page } from '@playwright/test';
import { url } from '../fixtures/env';
import { dialog, waitForApi } from './common';

/** Partner approvals: hospitals (/hospitals -> /hospitals/:id) and agents (/agents, detail drawer). */
export class AdminPartners {
  constructor(readonly page: Page) {}

  async approveHospital(hospitalName: string): Promise<void> {
    await this.page.goto(url('admin', '/hospitals'));
    await expect(this.page.getByRole('heading', { level: 1, name: /^hospitals$/i })).toBeVisible();
    const queue = this.page.getByRole('group', { name: /hospital status/i }).getByRole('button', { name: /approval queue/i });
    await queue.click();
    await expect(queue).toHaveAttribute('aria-pressed', 'true');
    await this.page.getByPlaceholder(/name, city or email/i).fill(hospitalName);
    const row = this.page.getByRole('row').filter({ hasText: hospitalName });
    await expect(row).toHaveCount(1, { timeout: 15_000 });
    await row.click();

    await expect(this.page).toHaveURL(/\/hospitals\/[^/]+$/);
    await expect(this.page.getByRole('heading', { level: 1, name: hospitalName })).toBeVisible();
    await this.page.getByRole('button', { name: /^approve( hospital)?$/i }).click();
    const confirm = dialog(this.page, /approve hospital\?/i);
    await expect(confirm).toBeVisible();
    const approved = waitForApi(this.page, 'POST', /\/api\/v1\/admin\/hospitals\/[^/]+\/approve$/);
    await confirm.getByRole('button', { name: /^approve$/i }).click();
    await approved;
  }

  async approveAgent(search: string, agencyName: string): Promise<void> {
    await this.page.goto(url('admin', '/agents'));
    await expect(this.page.getByRole('heading', { level: 1, name: /agents/i })).toBeVisible();
    await this.page.getByRole('group', { name: /agent status/i }).getByRole('button', { name: /approval queue/i }).click();
    await this.page.getByPlaceholder(/agency, code or email/i).fill(search);
    const row = this.page.getByRole('row').filter({ hasText: agencyName });
    await expect(row).toHaveCount(1, { timeout: 15_000 });
    await row.click();

    const drawer = dialog(this.page, new RegExp(agencyName));
    await expect(drawer).toBeVisible();
    await drawer.getByRole('button', { name: /^approve$/i }).click();
    const confirm = dialog(this.page, /approve agent\?/i);
    await expect(confirm).toBeVisible();
    const approved = waitForApi(this.page, 'POST', /\/api\/v1\/admin\/agents\/[^/]+\/approve$/);
    await confirm.getByRole('button', { name: /^approve$/i }).click();
    await approved;
  }
}

/** Catalog CRUD (/catalog): specialties tab. */
export class AdminCatalog {
  constructor(readonly page: Page) {}

  async gotoSpecialties(): Promise<void> {
    await this.page.goto(url('admin', '/catalog'));
    await expect(this.page.getByRole('heading', { level: 1, name: /^catalog$/i })).toBeVisible();
    await this.page.getByRole('tab', { name: /^specialties$/i }).click();
  }

  async createSpecialty(input: { name: string; slug: string; icon?: string; savingsMin?: string; savingsMax?: string; description?: string; active?: boolean }): Promise<{ id: string; slug: string }> {
    await this.page.getByRole('button', { name: /add specialty/i }).click();
    const form = dialog(this.page, /new specialty/i);
    await expect(form).toBeVisible();
    await form.getByLabel(/^name/i).fill(input.name);
    await form.getByLabel(/^slug/i).fill(input.slug);
    if (input.icon) await form.getByLabel(/^icon/i).fill(input.icon);
    if (input.savingsMin) await form.getByLabel(/savings min/i).fill(input.savingsMin);
    if (input.savingsMax) await form.getByLabel(/savings max/i).fill(input.savingsMax);
    if (input.description) await form.getByLabel(/^description/i).fill(input.description);
    if (input.active === false) await form.getByLabel(/^active$/i).uncheck();

    const created = waitForApi(this.page, 'POST', /\/api\/v1\/admin\/specialties$/);
    await form.getByRole('button', { name: /^create$/i }).click();
    const specialty = await (await created).json();
    await expect(form).toBeHidden();
    return specialty;
  }
}

/** Settlements (finance console): generate batch, approve (maker-checker), process, payouts. */
export class FinanceSettlements {
  constructor(readonly page: Page) {}

  async gotoBatches(): Promise<void> {
    await this.page.goto(url('admin', '/finance/settlements/batches'));
    await expect(this.page.getByRole('heading', { level: 1, name: /settlement batches/i })).toBeVisible();
  }

  async generateBatch(payeeType: 'Hospital' | 'Agent'): Promise<{ id: string; batch_number: string; items_count: number }> {
    await this.page.getByRole('button', { name: /^generate batch$/i }).first().click();
    const form = dialog(this.page, /generate settlement batch/i);
    await expect(form).toBeVisible();
    await form.getByLabel(/^payee type/i).selectOption({ label: payeeType });
    await expect(form.getByText(/you will be recorded as the batch maker/i)).toBeVisible();
    const created = waitForApi(this.page, 'POST', /\/api\/v1\/finance\/settlements\/batches$/);
    await form.getByRole('button', { name: /^generate batch$/i }).click();
    const batch = await (await created).json();
    await expect(this.page).toHaveURL(new RegExp(`/finance/settlements/batches/${batch.id}$`));
    return batch;
  }

  heading(batchNumber: string): Locator {
    return this.page.getByRole('heading', { level: 1, name: new RegExp(batchNumber) });
  }

  approveButton(): Locator {
    return this.page.getByRole('button', { name: /^approve$/i }).first();
  }

  async approve(): Promise<void> {
    await this.approveButton().click();
    const confirm = dialog(this.page, /approve batch/i);
    await expect(confirm).toBeVisible();
    const approved = waitForApi(this.page, 'POST', /\/api\/v1\/finance\/settlements\/batches\/[^/]+\/approve$/);
    await confirm.getByRole('button', { name: /^approve$/i }).click();
    await approved;
  }

  async process(): Promise<void> {
    await this.page.getByRole('button', { name: /process payouts/i }).click();
    const confirm = dialog(this.page, /process payouts/i);
    await expect(confirm).toBeVisible();
    const processed = waitForApi(this.page, 'POST', /\/api\/v1\/finance\/settlements\/batches\/[^/]+\/process$/);
    await confirm.getByRole('button', { name: /^process$/i }).click();
    await processed;
  }

  /** Payout rows in the batch's "Payouts (n)" table. */
  payoutRows(): Locator {
    return this.page.getByRole('row').filter({ has: this.page.getByRole('cell') }).filter({ hasText: /queued|processing|processed|failed|reversed/i });
  }

  /** Maker step: records the UTR; a different finance user must confirm it (mark-paid/approve). */
  async markFirstPayoutPaid(utr: string): Promise<void> {
    await this.page.getByRole('button', { name: /^mark paid$/i }).first().click();
    const form = dialog(this.page, /record payout utr/i);
    await expect(form).toBeVisible();
    await form.getByLabel(/utr/i).fill(utr);
    const paid = waitForApi(this.page, 'POST', /\/api\/v1\/finance\/settlements\/payouts\/[^/]+\/mark-paid$/);
    await form.getByRole('button', { name: /^record reference$/i }).click();
    await paid;
  }
}
