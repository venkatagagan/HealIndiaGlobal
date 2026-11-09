import { ApiClient } from '../../fixtures/api';
import { fakeUtr } from '../../fixtures/data';
import { url } from '../../fixtures/env';
import { expect, test } from '../../fixtures/test';
import type { BookingOut, PaymentOrderOut } from '../../fixtures/types';
import { dialog, expectToast, waitForApi } from '../../pages/common';

/**
 * Finance maker-checker on a bank-transfer payment (PLAN 6.4, backlog #43): finance1 (maker) records the
 * mark-paid request and cannot approve it (UI disabled + API 403); finance2 (checker) approves it, which captures
 * the order and confirms the booking. The test creates its own booking + bank-transfer order through the API.
 */
test.describe('admin-portal finance two-person approval', () => {
  test('finance1 requests mark-paid, finance2 approves', { tag: '@slow' }, async ({ page, loginAs, newSession, scenarios, apiAs }) => {
    test.setTimeout(180_000);
    const { booking, order } = await scenarios.bankTransferOrder();
    expect(order.gateway).toBe('bank_transfer');
    expect(order.status).toMatch(/^(created|pending)$/);
    const utr = fakeUtr();

    // ---- maker: finance1
    const makerToken = await loginAs('finance1', 'admin');
    const maker = new ApiClient(page.request, makerToken.access_token);
    await page.goto(url('admin', `/finance/orders/${order.id}`));
    await expect(page.getByText(order.order_number).first()).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: /^mark paid$/i }).click();
    const markPaid = dialog(page, new RegExp(`mark ${order.order_number} as paid`, 'i'));
    await expect(markPaid).toBeVisible();
    await markPaid.getByLabel(/bank reference \/ utr/i).fill(utr);
    const requested = waitForApi(page, 'POST', /\/api\/v1\/payments\/orders\/[^/]+\/mark-paid$/, false);
    await markPaid.getByRole('button', { name: /^record payment$/i }).click();
    expect((await requested).status()).toBeLessThan(300);
    await expectToast(page, /stays pending until a second finance user approves it/i);

    await expect(page.getByText(/awaiting a second finance user/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /^approve payment$/i })).toBeDisabled();
    await expect(page.getByText(/you recorded this request, so you cannot approve it/i)).toBeVisible();
    // the API is the real boundary
    const selfApprove = await maker.raw('POST', `/payments/orders/${order.id}/mark-paid/approve`, {
      reference: utr,
      amount_minor: order.amount_minor,
    });
    expect(selfApprove.status, 'maker approving own mark-paid request').toBe(403);
    expect((await maker.get<PaymentOrderOut>(`/payments/orders/${order.id}`)).status).not.toBe('paid');

    // ---- checker: finance2 (separate browser context)
    const checker = await newSession('finance2', 'admin');
    const cpage = checker.page;
    await cpage.goto(url('admin', `/finance/orders/${order.id}`));
    await expect(cpage.getByText(/awaiting a second finance user/i)).toBeVisible({ timeout: 30_000 });
    await expect(cpage.getByText(utr).first()).toBeVisible();
    const approveButton = cpage.getByRole('button', { name: /^approve payment$/i });
    await expect(approveButton).toBeEnabled();
    await approveButton.click();
    const confirm = dialog(cpage, /approve bank transfer/i);
    await expect(confirm).toBeVisible();
    const approved = waitForApi(cpage, 'POST', /\/api\/v1\/payments\/orders\/[^/]+\/mark-paid\/approve$/, false);
    await confirm.getByRole('button', { name: /^approve payment$/i }).click();
    expect((await approved).status()).toBeLessThan(300);
    await expectToast(cpage, new RegExp(`${order.order_number} marked as paid`, 'i'));

    // server state: order paid, booking confirmed by the captured deposit
    const checkerApi = new ApiClient(cpage.request, checker.token?.access_token ?? null);
    await expect
      .poll(async () => (await checkerApi.get<PaymentOrderOut>(`/payments/orders/${order.id}`)).status, { timeout: 30_000 })
      .toBe('paid');
    const patient = await apiAs('patient');
    await expect
      .poll(async () => (await patient.get<BookingOut>(`/bookings/${booking.id}`)).status, {
        message: 'booking confirmed after the approved bank transfer',
        timeout: 45_000,
      })
      .toBe('confirmed');
  });
});
