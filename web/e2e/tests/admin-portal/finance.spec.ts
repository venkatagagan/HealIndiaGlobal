import { url } from '../../fixtures/env';
import { fakeUtr } from '../../fixtures/data';
import { itemsOf } from '../../fixtures/scenarios';
import { expect, test } from '../../fixtures/test';
import type { Page, SettlementBatchOut, SettlementItemOut, UserOut } from '../../fixtures/types';
import { expectToast } from '../../pages/common';
import { FinanceSettlements } from '../../pages/admin';

/**
 * Settlement pipeline with maker-checker (PLAN 6.4).
 *  1. maker (finance1) generates a hospital batch from eligible items and cannot approve it (UI + API);
 *  2. checker (finance2, a different user) approves a pending batch, processes it and marks a manual bank transfer
 *     payout as paid with a UTR.
 *
 * Eligible items come from completed bookings past `settlement_hold_days`; fresh e2e bookings cannot be completed
 * before their admission date, so they come from (aged) seed data. The daily `settlements.auto_batch` job may
 * already have batched them - the checker test then works on that system-created batch. Each test skips with a
 * reason when its precondition is missing. Tests run in file order, so (2) normally picks up the batch of (1).
 */
test.describe('admin-portal finance settlements', () => {
  test('maker generates a hospital batch and cannot approve it', { tag: '@slow' }, async ({ page, loginAs, apiAs }) => {
    const finance1 = await apiAs('finance1');
    const eligible = itemsOf(
      await finance1.get<Page<SettlementItemOut>>('/finance/settlements/items', { status: 'eligible', payee_type: 'hospital', page_size: 100 }),
    );
    test.skip(eligible.length === 0, 'No eligible hospital settlement items (completed bookings past the hold period).');

    await loginAs('finance1');
    const maker = new FinanceSettlements(page);
    await maker.gotoBatches();
    const batch = await maker.generateBatch('Hospital');
    expect(batch.items_count).toBeGreaterThan(0);
    await expectToast(page, new RegExp(`batch ${batch.batch_number} created`, 'i'));
    await expect(maker.heading(batch.batch_number)).toBeVisible();
    await expect(page.getByText(/pending approval/i).first()).toBeVisible();
    await expect(page.getByText(/created by \(maker\)/i)).toBeVisible();

    // maker-checker: the creator sees Approve disabled (with the explanation) ...
    await expect(maker.approveButton()).toBeDisabled();
    await expect(page.getByText(/you generated this batch, so you cannot approve it/i)).toBeVisible();
    // ... and the API refuses it as well
    const selfApprove = await finance1.raw('POST', `/finance/settlements/batches/${batch.id}/approve`, {});
    expect(selfApprove.status, 'maker approving own batch').toBeGreaterThanOrEqual(400);
    const after = await finance1.get<SettlementBatchOut>(`/finance/settlements/batches/${batch.id}`);
    expect(after.status).toBe('pending_approval');
  });

  test('checker approves, processes and marks a payout paid with a UTR', { tag: '@slow' }, async ({ loginAs, page, apiAs }) => {
    test.slow();
    const finance2 = await apiAs('finance2');
    const me = await finance2.get<UserOut>('/auth/me');
    const pending = itemsOf(
      await finance2.get<Page<SettlementBatchOut>>('/finance/settlements/batches', { status: 'pending_approval', page_size: 50 }),
    )
      .filter((b) => b.created_by !== me.id && b.created_by_name !== me.full_name)
      .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
    test.skip(pending.length === 0, 'No batch awaiting approval by another finance user.');
    // newest first: normally the batch the maker test just created, else e.g. a system auto-batch
    const batch = pending[0] as SettlementBatchOut;

    await loginAs('finance2');
    const checker = new FinanceSettlements(page);
    await page.goto(url('admin', `/finance/settlements/batches/${batch.id}`));
    await expect(checker.heading(batch.batch_number)).toBeVisible();
    await expect(checker.approveButton()).toBeEnabled();
    await checker.approve();
    await expectToast(page, new RegExp(`batch ${batch.batch_number} approved`, 'i'));
    await expect(page.getByText(/approved by \(checker\)/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /process payouts/i })).toBeVisible();

    // Outside production the API pays out through the mock provider (instantly "processed"); production without
    // Razorpay Route uses manual bank transfers where finance records the UTR. The UI's "Process" sends no method,
    // so steer this one request to manual transfers to exercise the UTR path end to end.
    await page.route('**/api/v1/finance/settlements/batches/*/process', (route) =>
      route.continue({ postData: JSON.stringify({ method: 'manual_bank_transfer' }) }),
    );
    await checker.process();
    await expectToast(page, /sent for processing/i);

    const fetchBatch = () => finance2.get<SettlementBatchOut>(`/finance/settlements/batches/${batch.id}`);
    await expect
      .poll(async () => (await fetchBatch()).payouts?.length ?? 0, { message: 'payouts of the processed batch', timeout: 45_000 })
      .toBeGreaterThan(0);
    const processed = await fetchBatch();
    await page.reload();
    await expect(checker.payoutRows().first()).toBeVisible();

    const actionable = processed.payouts?.find((p) => p.status === 'queued' || p.status === 'processing');
    if (!actionable) {
      test.info().annotations.push({
        type: 'note',
        description: `No payout waiting for a UTR (statuses: ${processed.payouts?.map((p) => `${p.method}:${p.status}`).join(', ')}).`,
      });
      expect(processed.payouts?.every((p) => ['processed', 'failed'].includes(p.status))).toBe(true);
      return;
    }

    // two-person control: finance2 records the UTR (payout stays open), a different finance user confirms it
    const utr = fakeUtr();
    await checker.markFirstPayoutPaid(utr);
    await expectToast(page, /reference recorded/i);
    await expect(page.getByText(utr).first()).toBeVisible();
    const recorded = (await fetchBatch()).payouts?.find((p) => (p.utr ?? '').toUpperCase() === utr.toUpperCase());
    expect(recorded?.status, 'payout stays open until a second finance user confirms').not.toBe('processed');
    const finance1 = await apiAs('finance1');
    const confirm = await finance1.raw('POST', `/finance/settlements/payouts/${recorded?.id}/mark-paid/approve`, {
      request_id: recorded?.paid_request_id ?? '',
      reference: recorded?.utr ?? utr,
      amount_minor: recorded?.amount_minor ?? 0,
    });
    expect(confirm.status, 'second finance user confirms the UTR').toBe(200);
    await expect
      .poll(async () => (await fetchBatch()).payouts?.find((p) => p.id === recorded?.id)?.status ?? null, { message: 'payout status after confirmation' })
      .toBe('processed');
  });
});
