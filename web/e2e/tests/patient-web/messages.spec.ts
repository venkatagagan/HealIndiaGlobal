import { hospitalOwner } from '../../fixtures/accounts';
import { uniqueSuffix } from '../../fixtures/data';
import { url } from '../../fixtures/env';
import { expect, test } from '../../fixtures/test';
import { waitForApi } from '../../pages/common';

/**
 * Case conversation (auto-created on case.created): the patient writes from patient-web, the hospital reads and
 * answers from the hospital portal, and the answer reaches the patient's open thread over the WebSocket.
 */
test.describe('patient-web messages', () => {
  test('patient and hospital exchange messages on a case', async ({ page, loginAs, newSession, scenarios, world }) => {
    const enquiry = await scenarios.enquiry();
    const conversation = await scenarios.caseConversation(enquiry.id, await scenarios.patient());

    // ---- patient sends
    await loginAs('patient');
    await page.goto(url('patient', `/app/messages/${conversation.id}`));
    await expect(page.getByRole('link', { name: /view case/i })).toHaveAttribute('href', new RegExp(enquiry.id));
    const question = `E2E question from the patient ${uniqueSuffix()}`;
    const composer = page.getByLabel('Message', { exact: true });
    await composer.fill(question);
    const sent = waitForApi(page, 'POST', /\/api\/v1\/conversations\/[^/]+\/messages$/);
    await page.getByRole('button', { name: /send message/i }).click();
    await sent;
    await expect(page.getByText(question, { exact: true }).first()).toBeVisible();
    await expect(composer).toHaveValue('');

    // ---- hospital reads and replies (hospital portal, separate browser session)
    const hospital = await newSession(hospitalOwner(world.hospitalSlug), 'hospital');
    await hospital.page.goto(url('hospital', `/messages?c=${conversation.id}`));
    await expect(hospital.page.getByText(question, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
    const answer = `E2E answer from the hospital ${uniqueSuffix()}`;
    await hospital.page.getByLabel('Message', { exact: true }).fill(answer);
    const replied = waitForApi(hospital.page, 'POST', /\/api\/v1\/conversations\/[^/]+\/messages$/);
    await hospital.page.getByRole('button', { name: /send message/i }).click();
    await replied;
    await expect(hospital.page.getByText(answer, { exact: true }).first()).toBeVisible();

    // ---- patient receives it live (WebSocket message.created), without reloading
    await expect.soft(page.getByText(answer, { exact: true }).first(), 'reply delivered in realtime to the open thread').toBeVisible({ timeout: 15_000 });
    if (!(await page.getByText(answer, { exact: true }).first().isVisible())) {
      await page.reload();
      await expect(page.getByText(answer, { exact: true }).first()).toBeVisible();
    }
  });
});
