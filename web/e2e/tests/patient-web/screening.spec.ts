import { e2eEmail, e2eName, isoDate } from '../../fixtures/data';
import { E2E_PASSWORD } from '../../fixtures/scenarios';
import { expect, test } from '../../fixtures/test';
import type { CaseOut } from '../../fixtures/types';
import { dialog, expectToast, waitForApi } from '../../pages/common';
import {
  acknowledgeEmergencyIfShown,
  BookPage,
  completeGuestUpgrade,
  PatientCasePage,
  PayPage,
  ScreeningWizard,
  startGuestSession,
} from '../../pages/patient';

/**
 * Full patient journey, starting as a guest on the website door:
 * "Continue as guest" -> AI screening wizard (specialty + 4 steps, rules engine) -> matches -> request a quote
 * (guest gate: create the account in place, backlog #12) -> case created -> the matched hospital quotes (API) ->
 * accept the quote (emergency gate when the screening flagged one, backlog #13) -> booking (date + package +
 * deposit) -> mock payment -> booking confirmed.
 */
test.describe('patient-web journey (guest -> screening -> quote -> booking -> payment)', () => {
  test('guest screening to a paid booking', { tag: '@slow' }, async ({ page, scenarios }) => {
    test.setTimeout(240_000);
    await startGuestSession(page);

    const wizard = new ScreeningWizard(page);
    await wizard.chooseSpecialty(/orthopedics/i);

    // Step 1 - body map + pain
    await wizard.expectStep(1, /where are you experiencing issues/i);
    await page.getByRole('button', { name: /^next/i }).click();
    await expect(page.getByText(/select at least one area/i)).toBeVisible(); // validation before saving
    await wizard.answerBodyMap('Right leg', 6);
    await wizard.next();

    // Step 2 - symptoms
    await wizard.expectStep(2, /which symptoms are you experiencing/i);
    await wizard.addSymptom('Knee pain');
    await wizard.next();

    // Step 3 - duration & severity
    await wizard.expectStep(3, /how long have you had this condition/i);
    await wizard.answerDuration(6, 'Months');
    await wizard.next();

    // Step 4 - preferences: rules engine only
    await wizard.expectStep(4, /personali[sz]e your matches/i);
    await wizard.disableAi();
    await wizard.findMyDoctors();

    // Processing -> matches
    await wizard.waitForResults();
    await expect(page.getByText(/rule-based/i).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /matched doctors & hospitals/i })).toBeVisible();
    await expect(wizard.matchCards().first()).toBeVisible();

    // Request a quote: guests are asked to create their account first, inside the dialog
    await wizard.matchCards().first().click();
    const quoteDialog = dialog(page, /request a quote/i);
    await expect(quoteDialog).toBeVisible();
    await expect(quoteDialog.getByText(/create your free account to request a quote/i)).toBeVisible();
    await expect(quoteDialog.getByRole('button', { name: /send request/i })).toBeDisabled();
    await quoteDialog.getByRole('button', { name: /^create account$/i }).click();
    await completeGuestUpgrade(page, { fullName: e2eName('Guest Patient'), email: e2eEmail('guest'), password: E2E_PASSWORD });

    // now a full account: the request form is available in the same dialog
    const form = dialog(page, /request a quote/i);
    await form.getByLabel(/message for the hospital/i).fill('E2E: I would like a quote for knee replacement.');
    await form.getByRole('button', { name: /send request/i }).click();
    await expect(form.getByText(/you need to agree/i)).toBeVisible(); // consent is required
    await form.getByLabel(/i agree to share my screening answers/i).check();
    const created = waitForApi(page, 'POST', /\/api\/v1\/cases$/, false);
    await form.getByRole('button', { name: /send request/i }).click();
    const createdRes = await created;
    expect(createdRes.status(), `POST /cases: ${await createdRes.text()}`).toBe(201);
    const caseOut = (await createdRes.json()) as CaseOut;
    expect(caseOut.status).toBe('enquiry');
    expect(caseOut.case_number).toMatch(/^HIG-C-\d{4}-\d+$/);
    await expectToast(page, new RegExp(`case ${caseOut.case_number} created`, 'i'));
    await expect(page).toHaveURL(new RegExp(`/app/cases/${caseOut.id}$`));
    await expect(page.getByText(/waiting for the hospital's quote/i)).toBeVisible();

    // the matched hospital answers with an itemized quote (its owner, via the API)
    const quote = await scenarios.sendQuote(caseOut.id, { slug: caseOut.hospital.slug });
    expect(quote.status).toBe('sent');

    // accept the quote (emergency gate first when the screening flagged one)
    const casePage = new PatientCasePage(page);
    await casePage.goto(caseOut.id);
    const gated = await acknowledgeEmergencyIfShown(page);
    test.info().annotations.push({ type: 'emergency gate', description: gated ? 'shown and acknowledged' : 'not applicable' });
    await expect(page.getByText(/procedure incl\. ot and surgeon fees/i)).toBeVisible();
    await casePage.acceptQuote();

    // booking: date + package + deposit
    const book = new BookPage(page);
    await book.expectLoaded();
    await acknowledgeEmergencyIfShown(page);
    await book.chooseAdmissionDate(isoDate(30));
    const pkg = await book.choosePackage(/stay/i);
    if (!pkg) await book.chooseAcceptedQuote();
    await book.choosePaymentOption(/pay a deposit now/i);
    const booking = await book.proceedToPayment();
    expect(booking.payment_option).toBe('deposit');
    expect(booking.deposit_minor).toBeGreaterThan(0);

    // mock payment -> confirmed
    await new PayPage(page).payWithMockGateway();
    await page.getByRole('link', { name: /view booking/i }).click();
    await expect(page).toHaveURL(new RegExp(`/app/bookings/${booking.id}$`));
    await expect(page.getByText(booking.booking_number).first()).toBeVisible();
    await expect(page.getByText(/^confirmed$/i).first()).toBeVisible({ timeout: 30_000 });
  });
});
