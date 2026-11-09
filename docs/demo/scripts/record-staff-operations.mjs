// Narrated walkthrough of the STAFF CONSOLE - part 1: OPERATIONS (admin / support staff), recorded from the real
// running stack. Part 2 (finance) is recorded by record-staff-finance; merge-staff.mjs joins both parts into
// docs/demo/staff/staff-walkthrough.mp4.
//
// Story: the public login vs the separate staff door; Meera Kapoor (super admin) signs in, reads the dashboard, works
// the cases list (tabs, pills, chips, export, view options), opens a new urgent enquiry (Grace Otieno, Kenya) and
// assigns a coordinator, tours an in-treatment case (Olivia Bennett) tab by tab, bookings + booking drawer, the
// travel desk (incl. an SOS that Grace raises during the recording, acknowledged and resolved on camera), the support
// inbox (reply to Grace), partners (a newly registered hospital: checklist, KYC verify, doctor registration verify,
// approve dialog cancelled; an active hospital's team and cases; a new agent's KYC), catalog & content, users and
// staff, settings and audit log, dark mode, sidebar collapse/accordion, and hands over to the finance part.
//
// Only records created by this script are changed (Kaveri Coast Orthopaedic Hospital, Savannah Health Journeys,
// patient Grace Otieno and her case / conversation / SOS). Seeded partners are only viewed; dialogs are cancelled.
//
// Usage (repo root, after `source scripts/env.sh`):
//   node docs/demo/scripts/record-staff-operations.mjs [--fresh]   (--fresh: retire the previous run's records, create new ones)
// Outputs: docs/demo/staff/parts/01-operations.{mp4,srt,vtt,json} + 01-operations-narration.json, 01-operations-coverage.md,
//          docs/demo/staff/screenshots/1-NN-<screen>.png
import fs from 'node:fs';
import path from 'node:path';
import { Demo, URLS, DEMO_DIR } from './lib/recorder.mjs';

const G = URLS.admin; // http://localhost:5176/gahi
const API = process.env.DEMO_API ?? 'http://127.0.0.1:8000/api/v1';
const STAFF_DIR = path.join(DEMO_DIR, 'staff');
const STATE_FILE = path.join(DEMO_DIR, '.cache', 'staff-ops-state.json');
const PW = 'Demo-Password-2026'; // password of the accounts this script registers
const PDF = '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n';

// ---------------------------------------------------------------------------------------------------------------
// Data preparation through the public API (own records only)
// ---------------------------------------------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function call(token, method, url, body, headers = {}) {
  for (let i = 0; i < 8; i++) {
    const res = await fetch(API + url, {
      method,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (res.status === 429) { await sleep(12_000); continue; }
    if (!res.ok) throw new Error(`${method} ${url} -> ${res.status}: ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  }
  throw new Error(`${method} ${url}: rate-limited too long`);
}
const login = async (email) => (await call(null, 'POST', '/auth/login', { email, password: PW })).access_token;
async function upload(token, fields, name) {
  const fd = new FormData();
  fd.append('file', new Blob([PDF], { type: 'application/pdf' }), name);
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  const r = await fetch(`${API}/documents`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: fd });
  if (!r.ok) throw new Error(`upload ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.json();
}
const register = (body) => call(null, 'POST', '/auth/register', { password: PW, accept_terms: true, accept_agreement: true, ...body });

async function ensureData() {
  const st = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : {};
  const save = () => fs.writeFileSync(STATE_FILE, JSON.stringify(st, null, 2));
  const sfx = st.sfx ?? (st.sfx = Math.random().toString(36).slice(2, 6));
  if (!st.hospital) { // newly registered hospital waiting for review
    const email = `owner.kaverico.${sfx}@healindia.example`;
    const tok = await register({ email, full_name: 'Dr. Anitha Menon', role: 'hospital', country_code: 'IN', hospital_name: 'Kaveri Coast Orthopaedic Hospital', city: 'Kochi' });
    const o = tok.access_token;
    const prof = await call(o, 'PUT', '/hospital-portal/profile', {
      legal_name: 'Kaveri Coast Healthcare Private Limited',
      description: 'A 220-bed orthopaedic and sports-medicine hospital on the Kochi waterfront with a dedicated international patient desk.',
      city: 'Kochi', state: 'Kerala', address: '14 Marine Drive', pincode: '682031', phone: '+91-484-400-2200',
      accreditations: ['nabh'], languages: ['English', 'Malayalam', 'Arabic'], international_desk: true,
    });
    const hid = prof?.id ?? tok.user?.hospitals?.[0]?.id;
    await upload(o, { kind: 'kyc_registration', hospital_id: hid }, 'certificate-of-incorporation.pdf');
    await upload(o, { kind: 'kyc_accreditation', hospital_id: hid }, 'nabh-accreditation.pdf');
    await call(o, 'POST', '/hospital-portal/submit-for-review', {});
    st.hospital = { email, name: 'Kaveri Coast Orthopaedic Hospital', id: hid };
    save();
  }
  if (!st.doctors) {
    const o = await login(st.hospital.email);
    const ortho = (await call(null, 'GET', '/specialties')).find((s) => s.slug === 'orthopedics');
    st.doctors = [];
    for (const d of [
      { full_name: 'Dr. Thomas Kurian', gender: 'male', qualifications: ['MBBS', 'MS (Ortho)', 'Fellowship in Arthroplasty'], experience_years: 21, languages: ['English', 'Malayalam'], registration_number: 'NMC-48213', registration_council: 'nmc' },
      { full_name: 'Dr. Lakshmi Nair', gender: 'female', qualifications: ['MBBS', 'DNB (Ortho)'], experience_years: 14, languages: ['English', 'Malayalam', 'Arabic'], registration_number: 'NMC-61907', registration_council: 'nmc' },
    ]) st.doctors.push((await call(o, 'POST', '/hospital-portal/doctors', { ...d, specialty_id: ortho.id }, { 'X-Hospital-Id': st.hospital.id })).id);
    save();
  }
  if (!st.agent) { // new facilitator with KYC submitted
    const email = `agent.savannah.${sfx}@healindia.example`;
    const a = (await register({ email, full_name: 'Wanjiru Kamau', role: 'agent', country_code: 'KE', agency_name: 'Savannah Health Journeys' })).access_token;
    await call(a, 'PUT', '/agent-portal/profile', { city: 'Nairobi' }).catch(() => {});
    await upload(a, { kind: 'kyc_id_proof' }, 'passport-wanjiru-kamau.pdf');
    await upload(a, { kind: 'kyc_registration' }, 'business-registration.pdf');
    await call(a, 'POST', '/agent-portal/submit-kyc', {}).catch(() => {});
    st.agent = { email, agency: 'Savannah Health Journeys' };
    save();
  }
  if (!st.patient?.caseId) { // new patient: screening -> enquiry, plus a support conversation
    const email = `grace.otieno.${sfx}@healindia.example`;
    if (!st.patient) { await register({ email, full_name: 'Grace Otieno', role: 'patient', country_code: 'KE' }); st.patient = { email }; save(); }
    const p = await login(email);
    await call(p, 'PUT', '/patient/profile', { first_name: 'Grace', last_name: 'Otieno', date_of_birth: '1968-04-12', gender: 'female', nationality: 'KE', country_of_residence: 'KE', phone: '+254-722-480-115', preferred_language: 'en' });
    const s = await call(p, 'POST', '/screenings', { specialty_slug: 'orthopedics' });
    await call(p, 'PATCH', `/screenings/${s.id}`, {
      body_areas: ['right_leg'], pain_intensity: 7,
      symptoms: [{ name: 'Knee pain', answer: 'yes' }, { name: 'Knee swelling or stiffness', answer: 'yes' }, { name: 'Difficulty walking or climbing stairs', answer: 'yes' }],
      duration_value: 3, duration_unit: 'years', severity: { work: 'moderate', sleep: 'moderate', mobility: 'severe' },
      previous_treatments: ['medication', 'physical_therapy'],
      notes: 'Right knee pain for three years, worse on stairs. Steroid injections helped only for a few weeks. My surgeon in Nairobi suggested a knee replacement.',
      home_country: 'KE', preferences: { use_ai: false, languages: ['en'] },
    });
    await call(p, 'POST', `/screenings/${s.id}/submit`, {});
    const h = ((await call(null, 'GET', '/hospitals?q=Sanjeevani&page_size=5')).items)[0];
    const tkr = (await call(null, 'GET', '/procedures?specialty=orthopedics')).find((x) => /knee replacement/i.test(x.name));
    const c = await call(p, 'POST', '/cases', { hospital_id: h.id, procedure_id: tkr?.id, screening_id: s.id, consent_share: true, patient_notes: 'Hoping to travel in late November with my daughter. Please advise on recovery time before the flight home to Nairobi.' });
    const conv = await call(p, 'POST', '/conversations', { subject: 'Airport wheelchair for my mother' });
    await call(p, 'POST', `/conversations/${conv.id}/messages`, { body: 'Hello! My mother uses a walking stick. Can you arrange a wheelchair and an airport pickup when we land in Delhi?' });
    Object.assign(st.patient, { caseId: c.id, caseNumber: c.case_number, conversationId: conv.id });
    save();
  }
  return st;
}
// --fresh: retire the records of a previous run (they were acted on: verified, assigned...) and register new ones.
// Only this script's own records are touched: the hospital / agent are rejected as duplicates, the case cancelled.
async function retireOld() {
  if (!fs.existsSync(STATE_FILE)) return;
  const st = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  const staff = (await call(null, 'POST', '/auth/staff/login', { email: 'superadmin@healindia.example', password: 'HealIndia@2026' })).access_token;
  const reason = { reason: 'Duplicate demo registration (walkthrough re-recorded)' };
  if (st.hospital?.id) await call(staff, 'POST', `/admin/hospitals/${st.hospital.id}/reject`, reason).catch((e) => console.log('retire hospital:', e.message));
  if (st.agent?.email) {
    const list = await call(staff, 'GET', `/admin/agents?q=${encodeURIComponent(st.agent.email)}`).catch(() => null);
    const a = (list?.items ?? list ?? [])[0];
    if (a) await call(staff, 'POST', `/admin/agents/${a.id}/reject`, reason).catch((e) => console.log('retire agent:', e.message));
  }
  if (st.patient?.caseId) await call(staff, 'POST', `/cases/${st.patient.caseId}/status`, { to_status: 'cancelled', note: 'Duplicate demo enquiry' }).catch((e) => console.log('retire case:', e.message));
  fs.renameSync(STATE_FILE, `${STATE_FILE}.${Date.now()}.old`);
}
async function raiseSos(st) { // Grace raises an SOS from her hotel (acknowledged + resolved on camera)
  const p = await login(st.patient.email);
  return call(p, 'POST', '/travel/sos', { message: 'Feeling dizzy and short of breath at the hotel. Please call me.', lat: 28.4595, lng: 77.0266, case_id: st.patient.caseId });
}

// ---------------------------------------------------------------------------------------------------------------
// Narration
// ---------------------------------------------------------------------------------------------------------------
const N = {
  intro: 'Welcome to the Heal India Global staff console, where the operations and finance teams run everything behind each patient journey.',
  part1: "In part one, we follow the operations team, from new enquiries to partner approvals and platform settings.",
  publicDoor: 'Patients, agents and hospitals sign in here, on the public website. Staff accounts cannot use this page.',
  staffDoor: 'Staff have their own door at a separate address, with a separate session and two-step verification in production. Meera, our super admin, signs in.',
  attention: 'The dashboard opens with Needs your attention. Each card is a live work queue, such as unassigned enquiries or agents to approve, with how long the oldest item has waited.',
  period: 'Performance compares this period with the previous one. Switch between seven, thirty or ninety days, or this month.',
  charts: 'The chart shows GMV, bookings or enquiries per day, and the case funnel shows how enquiries turn into quotes, bookings and completed treatments.',
  widgets: 'Further down are cases by specialty, top hospitals by value, and the patients due for admission this week.',
  activity: 'Recent activity is a live feed of actions across cases, quotes and payments, next to a snapshot of the whole platform.',
  cases: 'Cases is the heart of patient operations. Status tabs show how many cases sit at each stage, from enquiry to completed.',
  pills: 'Pill filters narrow the list. I filter by hospital, and each active filter appears as a chip that removes it with one click.',
  export: 'Export downloads the current view as a spreadsheet, and the view options switch row density and show or hide columns.',
  search: 'Let me search for a new enquiry from Grace Otieno, a patient from Kenya.',
  caseOverview: 'The case page shows a stepper from enquiry to completion, the key facts on the right, and the next best action at the top. This case is flagged urgent, and nobody owns it yet.',
  screening: 'The Screening tab shows what Grace reported: the affected area, pain level, symptoms and previous treatment, plus the triage result.',
  assign: 'So let me assign a coordinator. I pick Fatima from the support team, and she becomes Grace\'s single point of contact.',
  olivia: 'Here is Olivia Bennett from the UK, now in treatment for a hip replacement. The stepper shows each stage she has completed.',
  quotes: 'Quotes lists every quote from the hospital, with its treatment plan, price breakdown and status.',
  booking: 'Booking and payments shows the admission dates, what has been paid, and what is still due.',
  travel: 'The Travel tab brings together her medical visa, flights, airport pickup and hotel stay.',
  docsActivity: 'Documents holds the medical reports and invoices, and Activity is the case\'s own audit trail.',
  bookings: 'Bookings lists every confirmed treatment, with payment progress, admissions and discharges, and the same tabs and filters.',
  drawer: 'Opening a booking shows its progress, the payment breakdown and the pre-arrival checklist, with actions like mark admitted.',
  sos: 'The travel desk opens on SOS alerts. Grace has just raised one from her hotel, so the team acknowledges it right away, and resolves it once she is safe.',
  visa: 'The Visa tab tracks each medical visa, from documents and invitation letters to approval.',
  flights: 'Flights and transfers covers air tickets and airport pickups.',
  stays: 'Accommodation tracks hotel stays near the hospital, and Translators and services handles in-country help like interpreters.',
  inbox: 'The support inbox collects conversations with patients, agents and hospitals. Grace asks about a wheelchair at the airport, so let me reply.',
  hospitals: 'Partners covers hospitals and agents. The hospitals list shows status, KYC and commission, and the approval queue holds new registrations.',
  checklist: 'Kaveri Coast Orthopaedic Hospital has just registered. The approval checklist shows what is done, and what is still missing before it can go live.',
  kyc: 'On KYC and documents, staff open each document and verify or reject it. I verify the registration certificate.',
  doctors: 'Doctors lists each doctor with their medical registration. After checking it with the medical council, staff click Verify, and patients then see a verified badge.',
  approve: 'When everything checks out, Approve hospital asks for confirmation. I cancel for now, because a verified payout account is still missing.',
  activeHospital: 'For an active partner like Yamuna Valley, the Team tab shows who has portal access, and Cases lists every case the hospital handles.',
  agents: 'Agents and facilitators works the same way, with an approval queue, KYC status, tier and commission.',
  agentDrawer: 'Savannah Health Journeys from Nairobi is waiting. The drawer shows contact details, the KYC documents to verify, and tier and commission.',
  agentApprove: 'I verify the ID proof, then look at the approval dialog, and cancel until the second document is checked.',
  catalog: 'Catalog and content manage reference data: specialties, procedures with India prices, and home-country cost benchmarks for the savings calculator.',
  content: 'Content holds cultural tips for patients, partner hotels and service providers, and the currency rates used at checkout.',
  users: 'Users lists every account on the platform, with role tabs and filters. The user drawer shows security status, with actions like suspend or change role.',
  staff: 'Staff is for admins only. It lists console users by role, and New staff user creates an account with exactly the access it needs.',
  settings: 'Settings holds platform-wide values like commission, deposit and tax rates. Finance settings are marked, only finance or a super admin can change them, and every change is audited.',
  audit: 'The audit log is an append-only record of every sensitive action, filtered by action, entity, actor or date.',
  dark: 'The console also has a dark mode, one click away in the top bar.',
  sidebar: 'The sidebar collapses to icons for more room, and expands again. Its groups work like an accordion, so only one is open at a time.',
  finance: 'The Payments, Settlements and Accounting groups hold the finance screens: orders, refunds, reconciliation, settlements, payouts, the ledger and reports.',
  next: "Next, let's see how the finance team works in the same console.",
};

// ---------------------------------------------------------------------------------------------------------------
// Recorder with the staff part layout (parts/01-operations.*, screenshots/1-NN-*.png)
// ---------------------------------------------------------------------------------------------------------------
class OpsDemo extends Demo {
  constructor(o) {
    super(o);
    this.outDir = path.join(STAFF_DIR, 'parts');
    this.shotDir = path.join(STAFF_DIR, 'screenshots');
    this.base = '01-operations';
    this.rawDir = path.join(DEMO_DIR, '.cache', 'raw', 'staff-01-operations');
    fs.mkdirSync(this.outDir, { recursive: true });
  }

  async shot(name, opts) {
    const f = await super.shot(name, opts);
    const to = path.join(path.dirname(f), `1-${path.basename(f)}`);
    try { fs.renameSync(f, to); } catch { return f; }
    return to;
  }
}

if (process.argv.includes('--fresh')) await retireOld();
const st = await ensureData();
console.log('demo data:', JSON.stringify({ case: st.patient.caseNumber, hospital: st.hospital.id }));
for (const f of fs.existsSync(path.join(STAFF_DIR, 'screenshots')) ? fs.readdirSync(path.join(STAFF_DIR, 'screenshots')) : []) {
  if (f.startsWith('1-')) fs.rmSync(path.join(STAFF_DIR, 'screenshots', f));
}

const d = new OpsDemo({ role: 'staff', label: 'Staff console', lines: Object.values(N) });
const p = () => d.page;
const row = (text) => p().locator('main tbody tr', { hasText: text }).first();
const graceRow = () => row(st.patient.caseNumber); // a previous run may have left a cancelled Grace Otieno case
const main = () => p().locator('main');
// detail pages use role=tab, list pages use status-tab buttons; both scoped to <main> (the sidebar has group buttons)
const tab = (name) => main().getByRole('tab', { name }).or(main().getByRole('button', { name })).first();
const seg = (name) => main().getByRole('tab', { name, exact: true }).or(main().getByRole('radio', { name, exact: true })).or(main().getByRole('button', { name, exact: true })).first();
const btn = (name) => p().getByRole('button', { name }).first();
const dialog = () => p().getByRole('dialog').last();
// in-page click without the lib's network-idle settle (dashboard/lists poll, so networkidle never comes)
const tap = async (loc, ms = 900) => {
  await d.click(loc, { settle: false });
  await p().waitForFunction(() => !document.querySelector('main [aria-busy="true"], main .animate-pulse'), null, { timeout: 4000 }).catch(() => {});
  await d.wait(ms);
};
const esc = async () => { await p().keyboard.press('Escape'); await d.wait(400); };

await d.start();
await d.intro('Operations and finance in one secure console', ['Dashboard', 'Cases & bookings', 'Travel desk', 'Partners', 'Catalog', 'People & access', 'Settings & audit', 'Finance']);
await d.say(N.intro);
d.chapter('Part 1 · Operations (chapter card)');
await d.card({ kicker: 'Part 1', title: 'Operations', subtitle: 'Admin and support staff: queues, cases, travel, partners and settings', items: [] }, 300);
await d.say(N.part1);
d.label = 'Operations';

// -- doors -------------------------------------------------------------------------------------------------------
await d.scene({ title: 'Public website login (patients, agents, hospitals)', go: URLS.door, narration: N.publicDoor, shot: 'public-login',
  action: async () => { await d.hover(p().getByRole('button', { name: /^log ?in$/i }).first()); } });
await d.scene({ title: 'Staff door: separate sign-in', go: `${G}/login`, narration: N.staffDoor, shot: 'staff-login', shotWhen: 'before',
  action: async () => { await d.signIn('superadmin@healindia.example', { submitWait: /\/gahi\/dashboard/ }); } });

// -- dashboard ---------------------------------------------------------------------------------------------------
await d.scene({ title: 'Dashboard: Needs your attention', narration: N.attention, shot: 'dashboard',
  action: async () => {
    await d.settle(800);
    const cards = p().locator('main a').filter({ hasText: /Oldest waiting/ });
    const n = Math.min(await cards.count(), 4);
    for (let i = 0; i < n; i++) await d.hover(cards.nth(i));
  } });
await d.scene({ title: 'Dashboard: performance period switch', narration: N.period, shot: 'dashboard-period',
  action: async () => {
    await d.scroll(420, { x: 1100, y: 600 });
    for (const t of ['7 days', '90 days', 'This month', '30 days']) await tap(seg(t), 1000);
  } });
await d.scene({ title: 'Dashboard: charts and case funnel', narration: N.charts, shot: 'dashboard-charts',
  action: async () => {
    await d.scroll(300, { x: 1100, y: 600 });
    await tap(seg('Bookings'), 1500);
    await tap(seg('GMV'), 500);
    await d.hover(p().getByText('Case funnel').first());
  } });
await d.scene({ title: 'Dashboard: specialties, top hospitals, admissions', narration: N.widgets,
  action: async () => { await d.scroll(420, { x: 1100, y: 600 }); await d.hover(p().getByText('Admissions this week').first()); } });
await d.scene({ title: 'Dashboard: recent activity and platform snapshot', narration: N.activity, shot: 'dashboard-activity',
  action: async () => { await d.scroll(500, { x: 1100, y: 600 }); await d.hover(p().getByText('Recent activity').first()); } });

// -- cases -------------------------------------------------------------------------------------------------------
await d.scene({ title: 'Cases list with status tabs', nav: ['Patient operations', 'Cases', `${G}/cases`], narration: N.cases, shot: 'cases',
  action: async () => {
    await tap(tab(/^Enquiry/), 1300);
    await tap(tab(/^In treatment/), 1300);
    await tap(tab(/^All/), 600);
  } });
await d.scene({ title: 'Cases: pill filters and chips', narration: N.pills, shot: 'cases-filter-chip', shotWhen: 'after',
  action: async () => {
    await d.click(btn(/^Hospital/), { settle: false });
    await d.wait(400);
    const f = p().getByPlaceholder(/Filter hospital/i);
    await d.type(f, 'Sanjeevani', 80);
    await d.wait(500);
    await tap(p().getByRole('option', { name: /Sanjeevani/ }).first(), 600);
    await esc();
    await d.hover(p().getByRole('group', { name: 'Active filters' }));
    await d.wait(1200);
  } });
d.chapter('Cases: export menu and table view options');
await d.say(N.export, async () => {
  await tap(p().getByRole('button', { name: /^Remove filter/ }).first(), 600);
  await d.click(btn(/^Export/), { settle: false });
  await d.wait(1300);
  await esc();
  await d.click(btn('Table view options'), { settle: false });
  await d.wait(1500);
  await esc();
});

await d.scene({ title: 'Cases: search', narration: N.search,
  action: async () => {
    await d.type(p().getByPlaceholder('Case number or patient…'), 'Otieno', 90);
    await d.wait(1500);
    await d.hover(graceRow());
  } });
await d.scene({ title: 'Case detail: stepper and overview', narration: N.caseOverview, shot: 'case-overview',
  action: async () => {
    await d.click(graceRow());
    await d.wait(600);
    await d.hover(p().getByText('Key facts').first());
    await d.hover(btn('Assign coordinator'));
  } });
await d.scene({ title: 'Case detail: Screening tab', narration: N.screening, shot: 'case-screening',
  action: async () => { await d.click(tab(/^Screening/)); await d.scroll(350, { x: 900, y: 650 }); } });
await d.scene({ title: 'Case detail: assign coordinator dialog', narration: N.assign, shot: 'case-assign', shotWhen: 'after',
  action: async () => {
    await d.scrollTop();
    await d.click(btn('Assign coordinator'), { settle: false });
    await d.wait(600);
    const sel = p().getByLabel('Support coordinator');
    await d.hover(sel);
    await sel.selectOption({ label: 'Fatima Qureshi' });
    await d.wait(500);
    await d.click(p().getByRole('button', { name: /^Assign$/ }).last());
    await d.wait(1200);
  } });

// in-treatment case: the remaining tabs
await d.scene({ title: 'Case detail: in-treatment case', narration: N.olivia, shot: 'case-in-treatment',
  action: async () => {
    await d.goto(`${G}/cases`);
    await d.type(p().getByPlaceholder('Case number or patient…'), 'Olivia', 90);
    await d.wait(1500);
    const r = p().locator('main tbody tr', { hasText: 'Olivia Bennett' }).filter({ hasText: 'In treatment' }).first();
    await d.click((await r.count()) ? r : row('Olivia Bennett'));
    await d.hover(p().getByText('Completed').first());
  } });
await d.scene({ title: 'Case detail: Quotes tab', narration: N.quotes, shot: 'case-quotes',
  action: async () => { await d.click(tab(/^Quotes/)); await d.scroll(400, { x: 900, y: 650 }); } });
await d.scene({ title: 'Case detail: Booking & payments tab', narration: N.booking, shot: 'case-booking',
  action: async () => { await d.scrollTop(); await d.click(tab(/^Booking/)); await d.scroll(300, { x: 900, y: 650 }); } });
await d.scene({ title: 'Case detail: Travel tab', narration: N.travel, shot: 'case-travel',
  action: async () => { await d.scrollTop(); await d.click(tab(/^Travel/)); await d.scroll(300, { x: 900, y: 650 }); } });
await d.scene({ title: 'Case detail: Documents and Activity tabs', narration: N.docsActivity, shot: 'case-activity',
  action: async () => { await d.scrollTop(); await d.click(tab(/^Documents/)); await d.wait(1400); await d.click(tab(/^Activity/)); } });

// -- bookings ----------------------------------------------------------------------------------------------------
await d.scene({ title: 'Bookings list', nav: ['Patient operations', 'Bookings', `${G}/bookings`], narration: N.bookings, shot: 'bookings',
  action: async () => {
    await tap(tab(/^Admitted/), 1300);
    await tap(tab(/^All/), 500);
    await d.type(p().getByPlaceholder('Booking number or patient…'), 'Olivia', 90);
    await d.wait(1200);
  } });
await d.scene({ title: 'Booking drawer', narration: N.drawer, shot: 'booking-drawer',
  action: async () => {
    await d.click(row('Olivia Bennett'));
    await d.wait(700);
    await d.scroll(500, { x: 1530, y: 700 });
    await d.wait(600);
    await d.scroll(-500, { x: 1530, y: 700 });
  } });
await esc();

// -- travel desk -------------------------------------------------------------------------------------------------
await d.offCamera(async () => { await raiseSos(st); });
await d.scene({ title: 'Travel desk: SOS alerts', nav: ['Patient operations', 'Travel desk', `${G}/travel`], narration: N.sos, shot: 'travel-sos', shotWhen: 'before',
  action: async () => {
    const r = p().locator('main tbody tr', { hasText: 'Grace Otieno' }).filter({ has: p().getByRole('button', { name: 'Acknowledge' }) }).first();
    await d.hover(r);
    await tap(r.getByRole('button', { name: 'Acknowledge' }), 1500);
    await tap(p().locator('main tbody tr', { hasText: 'Grace Otieno' }).first().getByRole('button', { name: 'Resolve' }), 600);
  } });
await d.scene({ title: 'Travel desk: Visa', narration: N.visa, shot: 'travel-visa',
  action: async () => { await tap(tab(/^Visa/), 1200); await d.hover(p().locator('main tbody tr').first()); } });
await d.scene({ title: 'Travel desk: Flights & transfers', narration: N.flights, shot: 'travel-flights',
  action: async () => { await tap(tab(/^Flights/), 1200); await d.hover(p().locator('main tbody tr').first()); } });
await d.scene({ title: 'Travel desk: Accommodation; Translators & services', narration: N.stays, shot: 'travel-services',
  action: async () => { await tap(tab(/^Accommodation/), 2200); await tap(tab(/^Translators/), 600); } });

// -- support inbox -----------------------------------------------------------------------------------------------
await d.scene({ title: 'Support inbox: reply to a patient', nav: ['Patient operations', 'Support inbox', `${G}/messages`], narration: N.inbox, shot: 'support-inbox',
  action: async () => {
    await d.click(p().getByRole('button', { name: /Airport wheelchair/ }).first());
    const box = p().getByPlaceholder(/Write a reply/);
    await d.type(box, 'Of course, Grace! We will book a wheelchair and a pickup at Delhi airport, and share the driver details before you fly.', 28);
    await d.click(p().getByRole('button', { name: /^Send$/ }));
    await d.wait(800);
  } });

// -- partners: hospitals -----------------------------------------------------------------------------------------
await d.scene({ title: 'Hospitals list and approval queue', nav: ['Partners', 'Hospitals', `${G}/hospitals`], narration: N.hospitals, shot: 'hospitals',
  action: async () => { await d.wait(500); await tap(tab(/^Approval queue/), 1200); await d.hover(row('Kaveri Coast')); } });
await d.scene({ title: 'Hospital detail: approval checklist', narration: N.checklist, shot: 'hospital-checklist',
  action: async () => { await d.click(row('Kaveri Coast')); await d.hover(p().getByText('Waiting for your review').first()); await d.hover(p().getByText(/No verified payout account/).first()); } });
await d.scene({ title: 'Hospital detail: KYC & documents (verify)', narration: N.kyc, shot: 'hospital-kyc',
  action: async () => {
    await d.click(tab(/^KYC/));
    const doc = main().locator('li').filter({ hasText: 'certificate-of-incorporation.pdf' }).first();
    await d.hover(doc);
    await d.click(doc.getByRole('button', { name: /^Verify$/ }));
    await d.wait(1000);
  } });
await d.scene({ title: 'Hospital detail: Doctors (Verify registration)', narration: N.doctors, shot: 'hospital-doctors',
  action: async () => {
    await d.click(tab(/^Doctors/));
    await d.hover(row('Thomas Kurian'));
    await d.click(row('Thomas Kurian').getByRole('button', { name: /^Verify$/ }));
    await d.wait(900);
  } });
await d.scene({ title: 'Hospital detail: approve dialog (cancelled)', narration: N.approve,
  action: async () => {
    await d.scrollTop();
    await d.click(btn('Approve hospital'), { settle: false });
    await d.wait(2600);
    await d.shot('hospital-approve-dialog-open');
    await d.click(dialog().getByRole('button', { name: 'Cancel' }));
  } });
await d.scene({ title: 'Active hospital: Team and Cases tabs', narration: N.activeHospital, shot: 'hospital-team-cases',
  action: async () => {
    await d.goto(`${G}/hospitals`);
    await d.type(p().getByPlaceholder('Name, city or email…'), 'Yamuna', 90);
    await d.wait(1200);
    await d.click(row('Yamuna Valley'));
    await d.click(tab(/^Team/));
    await d.wait(1300);
    await d.click(tab(/^Cases/));
  } });

// -- partners: agents --------------------------------------------------------------------------------------------
await d.scene({ title: 'Agents list', nav: ['Partners', 'Agents', `${G}/agents`], narration: N.agents, shot: 'agents',
  action: async () => { await tap(tab(/^Approval queue/), 1000); await d.type(p().getByPlaceholder('Agency, code or email…'), 'Savannah', 90); await d.wait(1000); } });
await d.scene({ title: 'Agent drawer with KYC documents', narration: N.agentDrawer, shot: 'agent-drawer',
  action: async () => { await d.click(row('Savannah')); await d.hover(p().getByText('KYC documents').last()); await d.hover(p().getByText('Tier & commission').first()); } });
await d.scene({ title: 'Agent KYC verify; approve dialog (cancelled)', narration: N.agentApprove, shot: 'agent-kyc-verified',
  action: async () => {
    const drawer = dialog();
    const item = drawer.locator('li').filter({ hasText: 'passport-wanjiru-kamau.pdf' }).first();
    await d.click(item.getByRole('button', { name: /^Verify$/ }));
    await d.wait(900);
    await d.click(drawer.getByRole('button', { name: /^Approve$/ }).first(), { settle: false });
    await d.wait(1800);
    await d.click(p().getByRole('dialog').filter({ hasText: /Approve agent/ }).getByRole('button', { name: 'Cancel' }));
  } });
await esc();

// -- catalog & content -------------------------------------------------------------------------------------------
await d.scene({ title: 'Catalog: specialties, procedures, cost benchmarks', nav: ['Catalog & content', 'Catalog', `${G}/catalog`], narration: N.catalog, shot: 'catalog',
  action: async () => { await d.wait(600); await tap(tab(/^Procedures/), 2000); await tap(tab(/^Cost benchmarks/), 600); } });
await d.scene({ title: 'Content: tips, stays, services, FX rates', nav: ['Catalog & content', 'Content', `${G}/content`], narration: N.content, shot: 'content',
  action: async () => {
    for (const t of [/^Accommodation/, /^Service providers/, /^FX rates/]) await tap(tab(t), 1500);
  } });

// -- people & access ---------------------------------------------------------------------------------------------
await d.scene({ title: 'Users list and user drawer', nav: ['People & access', 'Users', `${G}/users`], narration: N.users, shot: 'user-drawer',
  action: async () => {
    await tap(tab(/^Patient \d/), 800);
    await d.type(p().getByPlaceholder('Name, email or phone…'), 'Olivia', 90);
    await d.wait(1000);
    await d.click(row('Olivia'));
    await d.wait(800);
  } });
await esc();
await d.scene({ title: 'Staff and New staff user dialog (cancelled)', nav: ['People & access', 'Staff', `${G}/staff`], narration: N.staff, shot: 'staff',
  action: async () => {
    await d.wait(600);
    await d.click(btn('New staff user'), { settle: false });
    await d.wait(2400);
    await d.click(dialog().getByRole('button', { name: 'Cancel' }));
  } });

// -- system ------------------------------------------------------------------------------------------------------
await d.scene({ title: 'Settings incl. finance settings', nav: ['System', 'Settings', `${G}/settings`], narration: N.settings, shot: 'settings',
  action: async () => { await d.wait(500); await d.scroll(700, { x: 1100, y: 600 }); await d.wait(500); await d.scroll(900, { x: 1100, y: 600 }); } });
await d.scene({ title: 'Audit log with filters', nav: ['System', 'Audit log', `${G}/audit-logs`], narration: N.audit, shot: 'audit-log',
  action: async () => {
    await d.click(btn(/^Action/), { settle: false });
    await d.wait(400);
    await d.type(p().getByPlaceholder('Filter action…'), 'staff_login', 90);
    await d.wait(600);
    await tap(p().getByRole('option', { name: /^auth\.staff_login/ }).first(), 1000);
    await d.hover(p().getByRole('group', { name: 'Active filters' }));
    await d.scrollTop();
  } });

// -- shell: dark mode, sidebar, finance hand-over ----------------------------------------------------------------
await d.scene({ title: 'Dark mode toggle', narration: N.dark,
  action: async () => {
    await d.click(btn('Toggle dark mode'), { settle: false });
    await d.wait(2600);
    await d.shot('dark-mode-on');
    await d.click(btn('Toggle dark mode'), { settle: false });
  } });
await d.scene({ title: 'Sidebar collapse / expand and accordion', narration: N.sidebar, shot: 'sidebar',
  action: async () => {
    await d.click(btn('Collapse sidebar'), { settle: false });
    await d.wait(1500);
    await d.click(btn('Expand sidebar'), { settle: false });
    await d.wait(700);
    const nav = p().locator('aside nav, nav[aria-label]').first();
    await d.click(nav.getByRole('button', { name: 'Partners' }), { settle: false });
    await d.wait(900);
    await d.click(nav.getByRole('button', { name: 'Patient operations' }), { settle: false });
  } });
await d.scene({ title: 'Finance groups in the sidebar (covered in part 2)', narration: N.finance, shot: 'sidebar-finance',
  action: async () => {
    const nav = p().locator('aside nav, nav[aria-label]').first();
    for (const g of ['Payments', 'Settlements', 'Accounting & reports']) {
      await d.click(nav.getByRole('button', { name: g }), { settle: false });
      await d.wait(1100);
    }
  } });
await d.say(N.next, async () => { await d.hover(p().locator('aside nav, nav[aria-label]').first().getByRole('button', { name: 'Payments' })); });
await d.wait(600);
d.tEnd = d.now();

const info = await d.finish();
// keep part-specific names next to the finance part (both parts share docs/demo/staff/parts/)
for (const [from, to] of [['narration.json', '01-operations-narration.json'], ['coverage.md', '01-operations-coverage.md']]) {
  const f = path.join(STAFF_DIR, 'parts', from);
  if (fs.existsSync(f)) fs.renameSync(f, path.join(STAFF_DIR, 'parts', to));
}
console.log(JSON.stringify({ duration: info.durationText, warnings: info.warnings }, null, 2));
