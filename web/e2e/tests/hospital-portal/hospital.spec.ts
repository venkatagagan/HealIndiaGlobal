import { url } from '../../fixtures/env';
import { hospitalOwner } from '../../fixtures/accounts';
import { isoDate } from '../../fixtures/data';
import { itemsOf } from '../../fixtures/scenarios';
import { expect, test } from '../../fixtures/test';
import type { AvailabilityDay, BookingOut, CaseOut, Page, SettlementItemOut } from '../../fixtures/types';
import { expectToast } from '../../pages/common';
import { AvailabilityEditor, HospitalBookings, HospitalCases } from '../../pages/hospital';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

test.describe('hospital-portal', () => {

  test('enquiries inbox -> send an itemized quote', async ({ page, loginAs, scenarios, world }) => {
    const enquiry = await scenarios.enquiry();
    await loginAs(hospitalOwner(world.hospitalSlug));

    const cases = new HospitalCases(page);
    await cases.openFromInbox(enquiry.case_number);
    await expect(page.getByText(/^enquiry$/i).first()).toBeVisible();

    const form = await cases.openQuoteForm();
    await cases.fillQuote(form, 'Total knee replacement (cemented), 5 nights private room, physiotherapy from day 1.', [
      { category: 'Surgery', description: 'Surgeon & OT charges', amount: '250000' },
      { category: 'Hospital stay', description: '5 nights, private room', amount: '60000' },
      { category: 'Medications', description: 'Medicines & consumables', amount: '15000' },
      { category: 'Tests & scans', description: 'Pre-operative tests & imaging', amount: '10000' },
      { category: 'Implants', description: 'Knee implant (cobalt-chrome)', amount: '120000' },
    ]);
    const quote = await cases.submitQuote(form);

    expect(quote.status).toBe('sent');
    expect(quote.line_items).toHaveLength(5);
    expect(quote.total_minor).toBe(45_500_000); // INR 4,55,000.00 in paise
    await expectToast(page, /quote sent to the patient/i);
    await expect(page.getByText(/^quoted$/i).first()).toBeVisible();

    // the patient now sees a quoted case
    const patient = await scenarios.patient();
    const seen = await patient.get<CaseOut>(`/cases/${enquiry.id}`);
    expect(seen.status).toBe('quoted');
    expect(seen.latest_quote?.total_minor).toBe(45_500_000);
  });

  test('bookings -> admit a confirmed booking', { tag: '@slow' }, async ({ page, loginAs, scenarios, world }) => {
    test.slow();
    const { booking } = await scenarios.confirmedBooking();
    await loginAs(hospitalOwner(world.hospitalSlug));

    const bookings = new HospitalBookings(page);
    await bookings.gotoList();
    // status quick filters (segmented buttons with counts)
    const confirmedTab = page.getByRole('group', { name: /booking status/i }).getByRole('button', { name: /^confirmed/i });
    await confirmedTab.click();
    await expect(confirmedTab).toHaveAttribute('aria-pressed', 'true');
    await expect(page).toHaveURL(/[?&]status=confirmed/);
    await expect(page.getByRole('table').or(page.getByText(/no bookings/i)).first()).toBeVisible();
    // the list is paginated (demo data grows with every run) - open the new booking directly
    await page.goto(url('hospital', `/bookings/${booking.id}`));
    await expect(page.getByText(booking.booking_number).first()).toBeVisible();
    await expect(page.getByText(/^confirmed$/i).first()).toBeVisible();

    await bookings.admit();
    await expectToast(page, /patient admitted/i);
    await expect(page.getByText(/^admitted$/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /discharge & complete/i })).toBeVisible();

    const owner = await scenarios.owner();
    expect((await owner.get<BookingOut>(`/bookings/${booking.id}`)).status).toBe('admitted');
    expect((await owner.get<CaseOut>(`/cases/${booking.case_id}`)).status).toBe('in_treatment');
  });

  test('bookings -> discharge & complete an admitted booking', { tag: '@slow' }, async ({ page, loginAs, scenarios, apiAs }) => {
    // Only bookings whose planned admission date has arrived can be discharged (the API rejects a discharge date
    // before the admission date, and new bookings must be admitted in the future), so this uses seed data or an
    // older e2e booking.
    const target = await scenarios.dischargeableBooking();
    test.skip(!target, 'No admitted booking with admission date <= today (reseed: patient.uk is seeded as admitted).');
    const { booking, hospitalSlug } = target!;
    await loginAs(hospitalOwner(hospitalSlug));

    const bookings = new HospitalBookings(page);
    await page.goto(url('hospital', `/bookings/${booking.id}`));
    await expect(page.getByText(booking.booking_number).first()).toBeVisible();
    await bookings.discharge(isoDate(0));
    await expectToast(page, /patient discharged/i);
    await expect(page.getByText(/^completed$/i).first()).toBeVisible();

    // booking.completed -> revenue recognition + settlement items (PLAN 6.4)
    const finance = await apiAs('finance1');
    await expect
      .poll(
        async () => {
          const items = itemsOf(await finance.get<Page<SettlementItemOut>>('/finance/settlements/items', { page_size: 100, status: 'pending' }));
          return items.filter((i) => i.booking_id === booking.id).map((i) => i.payee_type);
        },
        { message: 'settlement items for the completed booking', timeout: 30_000 },
      )
      .toContain('hospital');
  });

  test('doctor availability can be edited', async ({ page, loginAs, scenarios, world }) => {
    await loginAs(hospitalOwner(world.hospitalSlug));
    const editor = new AvailabilityEditor(page);
    const doctorId = await editor.openFirstDoctor();

    const target = isoDate(10);
    const [year, month, day] = target.split('-').map(Number) as [number, number, number];
    const now = new Date();
    if (month !== now.getUTCMonth() + 1 || year !== now.getUTCFullYear()) {
      await page.getByRole('button', { name: /next month/i }).click();
    }
    const input = editor.capacityInput('Consultation', `${day} ${MONTHS[month - 1]}`);
    await expect(input).toBeEnabled();
    const original = (await input.inputValue()).trim();
    const updated = String((Number(original) || 0) + 1);
    await input.fill(updated);
    await editor.save();
    await expectToast(page, /availability saved/i);
    await expect(input).toHaveValue(updated);

    const owner = await scenarios.owner();
    const path = `/hospital-portal/doctors/${doctorId}/availability`;
    const slots = itemsOf(await owner.get<Page<AvailabilityDay> | AvailabilityDay[]>(path, { from: target, to: target }));
    expect(slots.find((s) => s.slot_kind === 'consultation' && s.date.startsWith(target))?.capacity).toBe(Number(updated));

    // restore the seeded capacity so repeated runs keep the demo data stable
    await owner.put(path, [{ date: target, slot_kind: 'consultation', capacity: Number(original) || 0 }]);
  });
});
