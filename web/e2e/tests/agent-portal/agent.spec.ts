import { url } from '../../fixtures/env';
import { uniqueSuffix } from '../../fixtures/data';
import { expect, test } from '../../fixtures/test';
import type { CaseOut } from '../../fixtures/types';
import { AgentEnquiry, AgentPatients } from '../../pages/agent';
import { expectToast } from '../../pages/common';

test.describe('agent-portal', () => {

  test('add a patient on their behalf', async ({ page, loginAs }) => {
    await loginAs('agent');
    const patients = new AgentPatients(page);
    await patients.goto();

    const lastName = `Okoro ${uniqueSuffix()}`;
    const created = await patients.add({
      firstName: 'Amaka',
      lastName,
      nationality: 'NG',
      medicalHistory: 'Knee osteoarthritis, failed physiotherapy (e2e).',
    });
    await expectToast(page, /patient added/i);
    await expect(page.getByRole('heading', { level: 1, name: new RegExp(`Amaka ${lastName}`) })).toBeVisible();
    await expect(page.locator('#main-content').getByRole('link', { name: /new enquiry/i })).toBeVisible();

    // listed and searchable on the patients page
    await patients.goto();
    await page.getByRole('searchbox', { name: /search patients/i }).fill(lastName);
    await expect(page.getByText(`Amaka ${lastName}`).first()).toBeVisible();
    expect(created.id).toBeTruthy();
  });

  test('send one enquiry to two hospitals (two cases for the patient)', async ({ page, loginAs, scenarios, world, apiAs }) => {
    const patient = await scenarios.agentPatient();
    const [first, second] = await Promise.all([scenarios.hospital(world.hospitalSlug), scenarios.hospital(world.secondHospitalSlug)]);
    test.skip(first.id === second.id, 'Needs two active seeded hospitals');

    await loginAs('agent');
    const enquiry = new AgentEnquiry(page);
    await enquiry.gotoForPatient(patient.id);
    await expect(page.getByText(patient.fullName).first()).toBeVisible();

    await enquiry.addHospital(first.name);
    await enquiry.addHospital(second.name);
    await expect(page.getByText(/selected hospitals \(2\/3\)/i)).toBeVisible();

    const cases = await enquiry.send('E2E: knee replacement enquiry, preferred travel next month.', 2);
    expect(cases.every((c) => !!c.id), JSON.stringify(cases).slice(0, 800)).toBe(true);
    expect(cases.map((c) => c.hospital.name).sort()).toEqual([first.name, second.name].sort());
    await expectToast(page, /enquiry sent to 2 hospitals/i);
    for (const c of cases) {
      await expect(page.getByText(`Case ${c.case_number} created`)).toBeVisible();
    }
    await expect(page.getByRole('button', { name: /compare quotes/i })).toBeVisible();

    // both cases belong to the patient and are linked to the agent
    const agent = await apiAs('agent');
    for (const c of cases) {
      const detail = await agent.get<CaseOut & { agent: { id: string } | null }>(`/cases/${c.id}`);
      expect(detail.status).toBe('enquiry');
      expect(detail.patient.id).toBe(patient.id);
      expect(detail.agent).not.toBeNull();
    }
  });

  test('commissions page renders the summary and items', { tag: '@smoke' }, async ({ page, loginAs }) => {
    await loginAs('agent');
    await page.goto(url('agent', '/commissions'));
    await expect(page.getByRole('heading', { level: 1, name: /^commissions$/i })).toBeVisible();
    for (const label of [/^pending$/i, /^eligible$/i, /^paid out$/i]) {
      await expect(page.getByText(label).first()).toBeVisible();
    }
    // either commission rows or the explicit empty state
    await expect(
      page.getByRole('table').or(page.getByText(/no commission yet/i)).first(),
    ).toBeVisible();
  });
});
