import { url } from '../../fixtures/env';
import { expect, test } from '../../fixtures/test';
import { isoDate } from '../../fixtures/data';

/** Whole days from `today` (YYYY-MM-DD) to `date` (YYYY-MM-DD). */
function daysBetween(today: string, date: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** "Today" in India (the API computes the countdown with IST dates). */
function todayIst(): string {
  return new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * Pre-arrival dashboard. A fresh patient gets a confirmed booking through the API (quote accepted, deposit paid
 * with the mock gateway); the dashboard must show "Until treatment: N days" for that booking and the checklist
 * created on booking.confirmed.
 */
test.describe('patient-web dashboard', () => {
  test('shows the treatment countdown and the pre-arrival checklist', { tag: '@slow' }, async ({ page, loginAs, scenarios }) => {
    test.slow();
    const patient = await scenarios.registerPatient();
    const { booking } = await scenarios.confirmedBooking({ patient });
    expect(booking.admission_date).toBeTruthy();

    await loginAs(patient);
    await page.goto(url('patient', '/app/'));
    await expect(page.getByRole('heading', { level: 1, name: /welcome/i })).toBeVisible();

    // countdown
    const countdown = page.getByText(/^until treatment$/i).locator('..');
    await expect(countdown).toBeVisible();
    const expected = [daysBetween(todayIst(), booking.admission_date as string), daysBetween(isoDate(0), booking.admission_date as string)];
    await expect(countdown).toContainText(/\d+\s*days?/);
    const shown = Number((await countdown.innerText()).match(/(\d+)\s*days?/)?.[1]);
    expect(expected, `countdown ${shown} days for admission ${booking.admission_date}`).toContain(shown);

    // checklist (created when the booking was confirmed): treatment booked is done, travel tasks pending
    await expect(page.getByRole('heading', { name: /your checklist/i })).toBeVisible();
    await expect(page.getByText(/\d+ of \d+ completed/i)).toBeVisible();
    for (const item of [/treatment booked/i, /medical visa approved/i, /flights booked/i, /airport pickup arranged/i]) {
      await expect(page.getByText(item).first()).toBeVisible();
    }
    await expect(page.getByRole('heading', { name: /quick actions/i })).toBeVisible();
  });
});
