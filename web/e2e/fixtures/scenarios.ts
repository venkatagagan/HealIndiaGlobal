import { expect } from '@playwright/test';
import { ACCOUNTS, hospitalOwner, type Account } from './accounts';
import { ApiCallError, type ApiClient } from './api';
import { e2eEmail, e2eName, isoDate, uniqueSuffix } from './data';
import type {
  AvailabilityDay,
  BookingOut,
  CaseOut,
  CheckoutOut,
  ConversationOut,
  DoctorCard,
  HospitalDetail,
  HospitalProcedureOut,
  MessageOut,
  Page,
  QuoteLineItem,
  QuoteOut,
  TokenOut,
} from './types';
import type { World } from './world';

/** Items of a paginated response or a plain list. */
export function itemsOf<T>(payload: Page<T> | T[] | null | undefined): T[] {
  if (!payload) return [];
  return Array.isArray(payload) ? payload : (payload.items ?? []);
}

export const DEFAULT_QUOTE_LINES: QuoteLineItem[] = [
  { category: 'surgery', description: 'Procedure incl. OT and surgeon fees', amount_minor: 25_000_000 },
  { category: 'hospital_stay', description: '5 nights, private room', amount_minor: 6_000_000 },
  { category: 'tests_scans', description: 'Pre-operative tests and imaging', amount_minor: 1_500_000 },
  { category: 'medications', description: 'Medications and consumables', amount_minor: 1_000_000 },
];

export interface Offering {
  hospital: HospitalDetail;
  doctor: DoctorCard | null;
  procedure: HospitalProcedureOut | null;
}

export interface ScenarioDeps {
  world: World;
  anon: ApiClient;
  /** Authenticated API client for an account (cached per worker). */
  apiAs: (account: Account) => Promise<ApiClient>;
  /** TokenOut of the cached session (user ids, hospitals...). */
  tokenOf: (account: Account) => Promise<TokenOut>;
}

/**
 * Builders for the data a UI test needs, created through the public API so every test owns its records:
 * enquiry -> quoted -> accepted -> booking (pending_payment) -> paid with the mock gateway (confirmed) -> admitted.
 */
export class Scenarios {
  private readonly hospitals = new Map<string, Promise<HospitalDetail>>();

  constructor(private readonly deps: ScenarioDeps) {}

  get world(): World {
    return this.deps.world;
  }

  // ---------------------------------------------------------------------------------------------- sessions
  patient(account: Account = ACCOUNTS.patient): Promise<ApiClient> {
    return this.deps.apiAs(account);
  }

  /** Hospital owner session for `slug`, with X-Hospital-Id pinned to that hospital. */
  async owner(slug: string = this.world.hospitalSlug): Promise<ApiClient> {
    const account = hospitalOwner(slug);
    const [client, token] = await Promise.all([this.deps.apiAs(account), this.deps.tokenOf(account)]);
    const membership = token.user.hospitals?.find((h) => h.slug === slug) ?? token.user.hospitals?.[0];
    return membership ? client.withHeaders({ 'X-Hospital-Id': membership.id }) : client;
  }

  staff(account: Account = ACCOUNTS.superadmin): Promise<ApiClient> {
    return this.deps.apiAs(account);
  }

  // ---------------------------------------------------------------------------------------------- catalog
  hospital(slug: string = this.world.hospitalSlug): Promise<HospitalDetail> {
    let cached = this.hospitals.get(slug);
    if (!cached) {
      cached = this.deps.anon.get<HospitalDetail>(`/hospitals/${encodeURIComponent(slug)}`);
      this.hospitals.set(slug, cached);
    }
    return cached;
  }

  /** A doctor + procedure the hospital offers (prefers a procedure with packages that lists the doctor). */
  async offering(slug: string = this.world.hospitalSlug): Promise<Offering> {
    const hospital = await this.hospital(slug);
    const procedures = hospital.procedures ?? [];
    const doctors = hospital.doctors ?? [];
    const withPackages = procedures.filter((p) => (p.packages ?? []).length > 0);
    const procedure = withPackages[0] ?? procedures[0] ?? null;
    const doctor =
      (procedure && doctors.find((d) => (procedure as { doctor_ids?: string[] }).doctor_ids?.includes(d.id))) ??
      doctors[0] ??
      null;
    return { hospital, doctor, procedure };
  }

  /**
   * Makes sure the offering's admission calendar has free capacity in the window the booking flows pick from
   * (+7 .. +90 days): every existing admission day with fewer than `minFree` free slots is topped up to
   * `booked + minFree` through the hospital owner's availability API. Bookings never give their slot back, so
   * without this every run (and the demo data) drains the seeded capacity and parallel tests race for the last
   * slots of a day. Days the hospital does not open for admissions are left alone.
   */
  async ensureAdmissionCapacity(offering: Offering, minFree = 3): Promise<void> {
    const owner = await this.owner(offering.hospital.slug);
    const path = offering.doctor
      ? `/hospital-portal/doctors/${offering.doctor.id}/availability`
      : '/hospital-portal/availability';
    const days = itemsOf(await owner.get<Page<AvailabilityDay> | AvailabilityDay[]>(path, { from: isoDate(7), to: isoDate(90) }));
    const low = days.filter((d) => d.slot_kind === 'admission' && d.capacity - d.booked < minFree);
    if (low.length === 0) return;
    await owner.put(
      path,
      low.map((d) => ({ date: d.date.slice(0, 10), slot_kind: 'admission', capacity: d.booked + minFree })),
    );
  }

  /** First future date (>= +minDays) with free admission capacity for the doctor/hospital; falls back to +30d. */
  async admissionDate(offering: Offering, minDays = 14): Promise<string> {
    const query = { from: isoDate(minDays), to: isoDate(minDays + 60) };
    const path = offering.doctor
      ? `/doctors/${offering.doctor.id}/availability`
      : `/hospitals/${offering.hospital.id}/availability`;
    try {
      const days = itemsOf(await this.deps.anon.get<Page<AvailabilityDay> | AvailabilityDay[]>(path, query));
      const free = days
        .filter((d) => d.slot_kind === 'admission' && (d.available ?? d.capacity - d.booked) > 0)
        .map((d) => d.date)
        .sort();
      // Spread parallel tests over several free days so they do not race for the last slot of one day.
      if (free.length > 0) return free[Math.floor(Math.random() * Math.min(free.length, 10))] as string;
    } catch {
      // availability endpoint unavailable - fall through to a default date
    }
    return isoDate(minDays + 16);
  }

  // ---------------------------------------------------------------------------------------------- cases
  /** POST /cases as the patient (status `enquiry`). */
  async enquiry(opts: { slug?: string; notes?: string; patient?: Account } = {}): Promise<CaseOut> {
    const offering = await this.offering(opts.slug);
    const patient = await this.patient(opts.patient);
    return patient.post<CaseOut>('/cases', {
      hospital_id: offering.hospital.id,
      ...(offering.doctor ? { doctor_id: offering.doctor.id } : {}),
      ...(offering.procedure ? { procedure_id: offering.procedure.procedure.id } : {}),
      patient_notes: opts.notes ?? `${e2eName('enquiry')} - created by the Playwright suite`,
      consent_share: true,
    });
  }

  /** POST /cases/{id}/quotes as the hospital owner (case -> `quoted`). */
  async sendQuote(caseId: string, opts: { slug?: string; lines?: QuoteLineItem[] } = {}): Promise<QuoteOut> {
    const owner = await this.owner(opts.slug);
    return owner.post<QuoteOut>(`/cases/${caseId}/quotes`, {
      treatment_plan: 'E2E treatment plan: pre-operative work-up, procedure, 5 nights in a private room, physiotherapy.',
      line_items: (opts.lines ?? DEFAULT_QUOTE_LINES) as unknown as Record<string, unknown>[],
      currency: 'INR',
      estimated_stay_days: 7,
      valid_until: isoDate(30),
    });
  }

  async quotedCase(opts: { slug?: string; patient?: Account } = {}): Promise<{ caseOut: CaseOut; quote: QuoteOut }> {
    const caseOut = await this.enquiry(opts);
    const quote = await this.sendQuote(caseOut.id, opts);
    return { caseOut, quote };
  }

  async acceptQuote(caseId: string, quoteId: string, patient?: Account): Promise<void> {
    const client = await this.patient(patient);
    await client.post(`/cases/${caseId}/quotes/${quoteId}/accept`, {});
  }

  /** Accepted quote -> booking in `pending_payment` (deposit option). */
  async pendingBooking(
    opts: { slug?: string; patient?: Account } = {},
  ): Promise<{ caseOut: CaseOut; quote: QuoteOut; booking: BookingOut }> {
    const { caseOut, quote } = await this.quotedCase(opts);
    await this.acceptQuote(caseOut.id, quote.id, opts.patient);
    const offering = await this.offering(opts.slug);
    await this.ensureAdmissionCapacity(offering);
    const patient = await this.patient(opts.patient);
    let booking: BookingOut | null = null;
    // A parallel test may still grab the last slot of the chosen day: retry with another free day.
    for (let attempt = 0; attempt < 3 && !booking; attempt++) {
      try {
        booking = await patient.post<BookingOut>('/bookings', {
          case_id: caseOut.id,
          quote_id: quote.id,
          admission_date: await this.admissionDate(offering, 14 + attempt * 7),
          payment_option: 'deposit',
        });
      } catch (error) {
        const retryable = error instanceof ApiCallError && (error.code === 'date_unavailable' || error.code === 'no_capacity');
        if (!retryable || attempt === 2) throw error;
      }
    }
    return { caseOut, quote, booking: booking as BookingOut };
  }

  /** Pays the booking deposit with the mock gateway and waits until the booking is `confirmed`. */
  async payDepositWithMock(bookingId: string, patientAccount?: Account): Promise<BookingOut> {
    const patient = await this.patient(patientAccount);
    const checkout = await patient.postIdempotent<CheckoutOut>('/payments/orders', {
      booking_id: bookingId,
      purpose: 'booking_deposit',
      gateway: 'mock',
      currency: 'USD',
    });
    await patient.post(`/payments/mock/${checkout.order.id}/complete`, { outcome: 'success' });
    await expect
      .poll(async () => (await patient.get<BookingOut>(`/bookings/${bookingId}`)).status, {
        message: 'booking to be confirmed after the mock payment (is the API worker running?)',
        timeout: 45_000,
      })
      .toBe('confirmed');
    return patient.get<BookingOut>(`/bookings/${bookingId}`);
  }

  /**
   * A booking in `pending_payment` whose deposit the patient chose to pay by bank transfer: returns the pending
   * `bank_transfer` order that finance confirms with maker-checker (mark-paid request + approval).
   */
  async bankTransferOrder(opts: { slug?: string; patient?: Account } = {}): Promise<{ booking: BookingOut; order: CheckoutOut['order'] }> {
    const { booking } = await this.pendingBooking(opts);
    const patient = await this.patient(opts.patient);
    const checkout = await patient.postIdempotent<CheckoutOut>('/payments/orders', {
      booking_id: booking.id,
      purpose: 'booking_deposit',
      gateway: 'bank_transfer',
      currency: 'USD',
    });
    return { booking, order: checkout.order };
  }

  async confirmedBooking(
    opts: { slug?: string; patient?: Account } = {},
  ): Promise<{ caseOut: CaseOut; quote: QuoteOut; booking: BookingOut }> {
    const created = await this.pendingBooking(opts);
    const booking = await this.payDepositWithMock(created.booking.id, opts.patient);
    return { ...created, booking };
  }

  async admit(bookingId: string, slug?: string): Promise<BookingOut> {
    const owner = await this.owner(slug);
    return owner.post<BookingOut>(`/bookings/${bookingId}/admit`, { note: 'Admitted by the e2e suite' });
  }

  /**
   * An `admitted` booking whose admission date is not in the future (only those can be discharged: the API
   * rejects a discharge date before the admission date). Fresh bookings always have a future admission date,
   * so this comes from seed data; returns null when none is left.
   */
  async dischargeableBooking(): Promise<{ booking: BookingOut; hospitalSlug: string } | null> {
    const staff = await this.staff();
    const today = isoDate(0);
    // newest first; admitted e2e bookings (future admission dates) accumulate, so look through a few pages
    for (let pageNo = 1; pageNo <= 10; pageNo++) {
      const page = await staff.get<Page<BookingOut>>('/bookings', { status: 'admitted', page: pageNo, page_size: 100 });
      const candidate = itemsOf(page).find((b) => !b.admission_date || b.admission_date <= today);
      if (candidate) {
        const caseOut = await staff.get<CaseOut>(`/cases/${candidate.case_id}`);
        return { booking: candidate, hospitalSlug: caseOut.hospital.slug };
      }
      if (pageNo >= (page.pages ?? 1)) break;
    }
    return null;
  }

  // ---------------------------------------------------------------------------------------------- messaging
  /** The auto-created case conversation (created on case.created), as seen by `account`. */
  async caseConversation(caseId: string, client: ApiClient): Promise<ConversationOut> {
    const find = async (): Promise<ConversationOut | undefined> =>
      itemsOf(await client.get<Page<ConversationOut> | ConversationOut[]>('/conversations', { case_id: caseId, limit: 100 })).find(
        (c) => c.case_id === caseId,
      );
    await expect
      .poll(async () => !!(await find()), { message: `case conversation for case ${caseId}`, timeout: 20_000 })
      .toBe(true);
    return (await find()) as ConversationOut;
  }

  async sendMessage(conversationId: string, client: ApiClient, body: string): Promise<MessageOut> {
    return client.post<MessageOut>(`/conversations/${conversationId}/messages`, { body });
  }

  // ---------------------------------------------------------------------------------------------- people
  /** Registers a brand-new patient (isolated data: dashboard, messages...). */
  async registerPatient(countryCode = 'US'): Promise<Account> {
    const email = e2eEmail('patient');
    await this.deps.anon.post<TokenOut>('/auth/register', {
      email,
      password: E2E_PASSWORD,
      full_name: `${e2eName('Patient')}`,
      role: 'patient',
      country_code: countryCode,
      accept_terms: true,
    });
    return { email, password: E2E_PASSWORD, role: 'patient', label: `fresh patient ${email}` };
  }

  /** A patient created by the demo agent (POST /agent-portal/patients, managed_by_agent). */
  async agentPatient(agent: Account = ACCOUNTS.agent): Promise<{ id: string; fullName: string }> {
    const client = await this.deps.apiAs(agent);
    const firstName = 'E2E';
    const lastName = `Agentpatient ${uniqueSuffix()}`;
    const patient = await client.post<{ id: string }>('/agent-portal/patients', {
      first_name: firstName,
      last_name: lastName,
      nationality: 'NG',
      gender: 'female',
      medical_history: 'Created by the Playwright e2e suite.',
      consent_attested: true,
      consent_kinds: ['terms', 'privacy', 'share_with_hospitals'],
      consent_method: 'in_person',
    });
    return { id: patient.id, fullName: `${firstName} ${lastName}` };
  }

  // ---------------------------------------------------------------------------------------------- partners
  /** Registers a new agent (status `pending`, waiting in the admin approval queue). */
  async registerAgent(): Promise<{ email: string; fullName: string; agencyName: string }> {
    const email = e2eEmail('agent');
    const agencyName = e2eName('Travel Agency');
    const fullName = e2eName('Agent');
    await this.deps.anon.post<TokenOut>('/auth/register', {
      email,
      password: E2E_PASSWORD,
      full_name: fullName,
      role: 'agent',
      country_code: 'KE',
      agency_name: agencyName,
      accept_terms: true,
    });
    return { email, fullName, agencyName };
  }

  /**
   * Registers a new hospital, fills the profile, uploads a KYC document and submits it for review
   * (status `pending_review`). Returns the hospital name the admin sees in the approval queue.
   */
  async registerPendingHospital(): Promise<{ email: string; hospitalName: string; hospitalId: string | null }> {
    const email = e2eEmail('hospital');
    const hospitalName = e2eName('Hospital');
    const token = await this.deps.anon.post<TokenOut>('/auth/register', {
      email,
      password: E2E_PASSWORD,
      full_name: e2eName('Owner'),
      role: 'hospital',
      country_code: 'IN',
      hospital_name: hospitalName,
      city: 'Chennai',
      accept_terms: true,
    });
    const owner = this.deps.anon.withToken(token.access_token);
    const profile = await owner.put<{ id: string }>('/hospital-portal/profile', {
      legal_name: `${hospitalName} Private Limited`,
      description: 'Hospital registered by the Playwright e2e suite.',
      city: 'Chennai',
      state: 'Tamil Nadu',
      address: '1 Test Road',
      pincode: '600001',
      phone: '+91-44-0000-0000',
      accreditations: ['nabh'],
      languages: ['English'],
      international_desk: true,
    });
    const hospitalId = profile?.id ?? token.user.hospitals?.[0]?.id ?? null;
    await owner.upload('/documents', {
      file: { name: 'registration.pdf', mimeType: 'application/pdf', buffer: Buffer.from(MINIMAL_PDF) },
      kind: 'kyc_registration',
      ...(hospitalId ? { hospital_id: hospitalId } : {}),
    });
    await owner.post('/hospital-portal/submit-for-review', {});
    return { email, hospitalName, hospitalId };
  }
}

/** Password of users registered by the suite (meets the 10+ chars, letter + digit policy). */
export const E2E_PASSWORD = 'E2e-Password-2026';

/** Smallest valid PDF (magic bytes %PDF) accepted by the upload validator. */
export const MINIMAL_PDF = '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n';
