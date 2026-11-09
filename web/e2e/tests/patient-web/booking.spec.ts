import { expect, test } from '../../fixtures/test';
import { isoDate } from '../../fixtures/data';
import type { BookingOut } from '../../fixtures/types';
import { BookPage, PatientCasePage, PayPage } from '../../pages/patient';

/**
 * Quote -> booking -> payment. Setup (API): the demo patient's enquiry at the primary hospital receives an
 * itemized quote (case `quoted`). UI: accept the quote, pick an admission date + package + deposit, pay with the
 * development mock gateway, and see the booking confirmed.
 */
test.describe('patient-web booking & payment', () => {
  test('accept a quote, book with a deposit and pay with the mock gateway', { tag: '@slow' }, async ({ page, loginAs, scenarios, apiAs }) => {
    test.slow();
    const { caseOut, quote } = await scenarios.quotedCase();
    expect(quote.status).toBe('sent');
    // the calendar below must offer free admission days: own that capacity instead of relying on the seed
    await scenarios.ensureAdmissionCapacity(await scenarios.offering());
    await loginAs('patient');

    const casePage = new PatientCasePage(page);
    await casePage.goto(caseOut.id);
    await expect(page.getByText(caseOut.case_number).first()).toBeVisible();
    // the itemized quote lines are listed with a total
    await expect(page.getByText(/procedure incl\. ot and surgeon fees/i)).toBeVisible();
    await expect(page.getByText(/^total$/i).first()).toBeVisible();

    await casePage.acceptQuote();

    const book = new BookPage(page);
    await book.expectLoaded();
    await book.chooseAdmissionDate(isoDate(30));
    const pkg = await book.choosePackage(/stay/i);
    if (!pkg) await book.chooseAcceptedQuote();
    await book.choosePaymentOption(/pay a deposit now/i);
    const booking = await book.proceedToPayment();
    expect(booking.payment_option).toBe('deposit');
    expect(booking.booking_number).toMatch(/^HIG-B-/);
    expect(booking.deposit_minor).toBeGreaterThan(0);
    expect(booking.deposit_minor).toBeLessThan(booking.total_minor);

    await new PayPage(page).payWithMockGateway();

    // server state: the captured deposit confirms the booking (applied by the payment.captured handler)
    const patient = await apiAs('patient');
    await expect
      .poll(async () => (await patient.get<BookingOut>(`/bookings/${booking.id}`)).status, {
        message: 'booking status after the mock payment',
        timeout: 45_000,
      })
      .toBe('confirmed');
    const confirmed = await patient.get<BookingOut>(`/bookings/${booking.id}`);
    expect(confirmed.amount_paid_minor).toBeGreaterThanOrEqual(confirmed.deposit_minor);

    // UI: booking detail shows the confirmed status
    await page.getByRole('link', { name: /view booking/i }).click();
    await expect(page).toHaveURL(new RegExp(`/app/bookings/${booking.id}$`));
    await expect(page.getByText(booking.booking_number).first()).toBeVisible();
    await expect(page.getByText(/^confirmed$/i).first()).toBeVisible();
  });
});
