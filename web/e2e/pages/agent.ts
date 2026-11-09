import { expect, type Page, type Response } from '@playwright/test';
import { url } from '../fixtures/env';
import { dialog, waitForApi } from './common';

export interface NewPatientInput {
  firstName: string;
  lastName: string;
  nationality: string; // ISO-3166 alpha-2 (option value)
  email?: string;
  medicalHistory?: string;
}

/** Patients list (/patients) + "Add a patient" dialog. */
export class AgentPatients {
  constructor(readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto(url('agent', '/patients'));
    await expect(this.page.getByRole('heading', { level: 1, name: /^patients$/i })).toBeVisible();
  }

  async add(input: NewPatientInput): Promise<{ id: string }> {
    await this.page.getByRole('button', { name: /^add patient$/i }).first().click();
    const form = dialog(this.page, /add a patient/i);
    await expect(form).toBeVisible();
    await form.getByLabel(/^first name/i).fill(input.firstName);
    await form.getByLabel(/^last name/i).fill(input.lastName);
    await form.getByLabel(/^nationality/i).selectOption(input.nationality);
    if (input.email) await form.getByLabel(/^email/i).fill(input.email);
    if (input.medicalHistory) await form.getByLabel(/^medical history/i).fill(input.medicalHistory);

    // Consent attestation (backlog #30) is mandatory: submitting without it is refused client-side.
    const attest = form.getByLabel(/i confirm the patient has agreed to the terms of service/i);
    await form.getByRole('button', { name: /^add patient$/i }).click();
    await expect(form.getByRole('alert').filter({ hasText: /consent|confirm|attest/i }).first()).toBeVisible();
    await attest.check();
    await form.getByLabel(/also agreed to share their records/i).check();
    await form.getByLabel(/how was consent obtained/i).selectOption({ index: 0 });

    const created = waitForApi(this.page, 'POST', /\/api\/v1\/agent-portal\/patients$/);
    await form.getByRole('button', { name: /^add patient$/i }).click();
    const patient = await (await created).json();
    await expect(this.page).toHaveURL(new RegExp(`/patients/${patient.id}$`));
    return patient;
  }
}

/** New enquiry (/cases/new): one enquiry -> one case per selected hospital (max 3). */
export class AgentEnquiry {
  constructor(readonly page: Page) {}

  async gotoForPatient(patientId: string): Promise<void> {
    await this.page.goto(url('agent', `/cases/new?patient=${patientId}`));
    await expect(this.page.getByRole('heading', { level: 1, name: /new enquiry/i })).toBeVisible();
  }

  async addHospital(name: string): Promise<void> {
    await this.page.getByRole('searchbox', { name: /search hospitals/i }).fill(name);
    const row = this.page.getByRole('listitem').filter({ has: this.page.getByRole('link', { name, exact: true }) });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole('button', { name: /^add$/i }).click();
    await expect(row.getByRole('button', { name: /^added$/i })).toBeVisible();
  }

  /** Review & send; returns the cases created (one POST /cases per hospital). */
  async send(message: string, expectedCases: number): Promise<{ id: string; case_number: string; hospital: { name: string } }[]> {
    await this.page.getByRole('button', { name: /review & send/i }).click();
    const review = dialog(this.page, /send enquiry/i);
    await expect(review).toBeVisible();
    await review.getByLabel(/message to the hospitals/i).fill(message);
    const sendButton = review.getByRole('button', { name: /^send enquiry$/i });
    await expect(sendButton).toBeDisabled(); // consent first
    await review.getByLabel(/patient consents to sharing/i).check();

    const created: Promise<unknown>[] = [];
    const onResponse = (response: Response) => {
      if (response.request().method() === 'POST' && /\/api\/v1\/cases$/.test(new URL(response.url()).pathname)) {
        created.push(response.json());
      }
    };
    this.page.on('response', onResponse);
    await sendButton.click();
    await expect(dialog(this.page, /enquiry results/i)).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => created.length).toBe(expectedCases);
    this.page.off('response', onResponse);
    return (await Promise.all(created)) as { id: string; case_number: string; hospital: { name: string } }[];
  }
}
