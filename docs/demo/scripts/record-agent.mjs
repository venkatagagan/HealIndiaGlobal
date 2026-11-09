// Narrated walkthrough of the AGENT (facilitator) portal, recorded from the real running stack.
//
// Story: Chinedu Okafor (Lagos MedConnect Travel) registers a new patient (Aisha Rahman, Nigeria) with a consent
// attestation, uploads her knee X-ray report, runs a screening on her behalf, requests quotes from two matched
// hospitals, compares the quotes and accepts one (part 1); then books the treatment, pays the deposit with the test
// gateway and tours bookings, hospital network, earnings, messages, notifications and account settings (part 2).
// The two hospital quotes (and one coordinator reply in the case chat) are created through the API as the hospital
// users, exactly as the hospital portal would.
//
// Usage (repo root, after `source scripts/env.sh`):
//   node docs/demo/scripts/record-agent.mjs            # part 1 then part 2
//   node docs/demo/scripts/record-agent.mjs part2      # part 2 only (needs the state file written by part 1)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Demo, URLS, PASSWORD, DEMO_DIR, REPO } from './lib/recorder.mjs';

const require = createRequire(path.join(REPO, 'web', 'package.json'));
const A = URLS.agent; // http://localhost:5174/agent
const API = process.env.DEMO_API ?? 'http://127.0.0.1:8000/api/v1';
const AGENT_EMAIL = 'agent.lagos@healindia.example';
const STATE_FILE = path.join(DEMO_DIR, '.cache', 'agent-demo-state.json');
const ASSET_DIR = path.join(DEMO_DIR, 'scripts', 'assets');
const XRAY_NAME = 'right-knee-xray-report.pdf';
let XRAY_PDF = path.join(ASSET_DIR, XRAY_NAME);

// ---------------------------------------------------------------------------------------------------------------
// API helpers (data prep as the hospital users; reads as the agent)
// ---------------------------------------------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function call(token, method, url, body) {
  const res = await fetch(API + url, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`${method} ${url} -> ${res.status}: ${text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return text ? JSON.parse(text) : null;
}
const tokens = new Map();
async function login(email, { fresh = false } = {}) {
  const cached = tokens.get(email);
  if (!fresh && cached && Date.now() - cached.at < 10 * 60_000) return cached.token;
  for (let i = 0; i < 10; i++) {
    try {
      const t = (await call(null, 'POST', '/auth/login', { email, password: PASSWORD })).access_token;
      tokens.set(email, { token: t, at: Date.now() });
      return t;
    } catch (e) {
      if (e.status !== 429) throw e;
      await sleep(12_000);
    }
  }
  throw new Error(`login rate-limited too long for ${email}`);
}

const inDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

const QUOTES = [
  {
    plan: 'Right total knee replacement (cemented, posterior-stabilised implant) under spinal anaesthesia, followed by 5 days of in-patient physiotherapy and a 2-week stay in India for follow-up.',
    stay: 6,
    lines: [
      ['surgery', 'Total knee replacement, right - surgeon, OT and anaesthesia', 19_500_000],
      ['implants', 'Posterior-stabilised knee implant (imported)', 9_500_000],
      ['hospital_stay', '5 nights, private room with attendant bed', 4_500_000],
      ['tests_scans', 'Pre-operative tests, ECG, chest X-ray, knee X-rays', 1_200_000],
      ['medications', 'Medicines and consumables', 1_800_000],
      ['other', 'In-patient physiotherapy (5 sessions)', 600_000],
    ],
  },
  {
    plan: 'Right total knee replacement with computer-navigated alignment, 6 nights in hospital and a supervised physiotherapy programme before discharge.',
    stay: 7,
    lines: [
      ['surgery', 'Navigated total knee replacement, right', 24_000_000],
      ['implants', 'Knee implant (premium range)', 11_500_000],
      ['hospital_stay', '6 nights, single deluxe room', 6_000_000],
      ['tests_scans', 'Pre-operative work-up and imaging', 1_500_000],
      ['medications', 'Medicines and consumables', 2_000_000],
      ['doctor_fees', 'Physician and physiotherapist visits', 900_000],
    ],
  },
];

async function sendQuotes(cases) {
  // cases: [{ id, hospital: { slug } }] in the order we want: index 0 = better value quote
  for (const [i, c] of cases.entries()) {
    const owner = await login(`owner.${c.hospital.slug}@healindia.example`);
    const q = QUOTES[i % QUOTES.length];
    await call(owner, 'POST', `/cases/${c.id}/quotes`, {
      treatment_plan: q.plan,
      currency: 'INR',
      estimated_stay_days: q.stay,
      valid_until: inDays(30),
      line_items: q.lines.map(([category, description, amount_minor]) => ({ category, description, amount_minor })),
    });
  }
}

async function hospitalReply(conversationId, slug, body) {
  for (const who of ['owner', 'coordinator']) {
    try {
      const t = await login(`${who}.${slug}@healindia.example`);
      await call(t, 'POST', `/conversations/${conversationId}/messages`, { body });
      return who;
    } catch (e) {
      console.warn(`reply as ${who}.${slug} failed: ${e.message}`);
    }
  }
  return null;
}

async function makeXrayPdf(fullName) {
  XRAY_PDF = path.join(ASSET_DIR, fullName.toLowerCase().replace(/[^a-z]+/g, '-'), XRAY_NAME);
  if (fs.existsSync(XRAY_PDF)) return;
  fs.mkdirSync(path.dirname(XRAY_PDF), { recursive: true });
  process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.join(REPO, '.devtools', 'ms-playwright');
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(`<html><body style="font-family:Arial;margin:48px;color:#111;font-size:14px">
    <h2 style="margin:0">Lekki Diagnostic &amp; Imaging Centre</h2><div>Admiralty Way, Lekki Phase 1, Lagos</div><hr/>
    <h3>Radiology Report - X-ray Right Knee (AP, Lateral, Skyline)</h3>
    <p><b>Patient:</b> ${fullName} &nbsp; <b>Age/Sex:</b> 53 / F &nbsp; <b>Date:</b> 06 Oct 2026</p>
    <p><b>Referring physician:</b> Dr. Funmilayo Adeyemi, Orthopaedics</p>
    <h4>Findings</h4>
    <ul><li>Severe narrowing of the medial tibiofemoral joint space with bone-on-bone contact.</li>
    <li>Marginal osteophytes at the medial and lateral compartments and patellofemoral joint.</li>
    <li>Subchondral sclerosis and cyst formation in the medial tibial plateau.</li>
    <li>Mild varus alignment (approx. 8 degrees). No fracture or loose body.</li></ul>
    <h4>Impression</h4><p>Advanced (Kellgren-Lawrence grade 4) osteoarthritis of the right knee. Orthopaedic review for
    total knee arthroplasty is recommended.</p>
    <p style="margin-top:40px">Reported by: Dr. Kelechi Nwosu, MBBS, FWACS (Radiology)</p></body></html>`);
  await page.pdf({ path: XRAY_PDF, format: 'A4' });
  await browser.close();
}

// ---------------------------------------------------------------------------------------------------------------
// Patient name: a fresh realistic patient each run (never duplicates an existing one)
// ---------------------------------------------------------------------------------------------------------------
const CANDIDATES = [
  ['Aisha', 'Rahman'],
  ['Zainab', 'Bello'],
  ['Halima', 'Yusuf'],
  ['Ngozi', 'Adebayo'],
];
async function pickPatientName(agentToken) {
  for (const [first, last] of CANDIDATES) {
    const r = await call(agentToken, 'GET', `/agent-portal/patients?q=${encodeURIComponent(`${first} ${last}`)}&page_size=5`);
    if (!r.items.some((p) => p.full_name === `${first} ${last}`)) return { first, last };
  }
  return { first: 'Amina', last: `Okafor ${Date.now() % 1000}` };
}

// ---------------------------------------------------------------------------------------------------------------
// Narration
// ---------------------------------------------------------------------------------------------------------------
function narration1(first, last) {
  const full = `${first} ${last}`;
  return {
    intro: `Welcome to Heal India Global for facilitators. In this first part, we follow an agent in Lagos as they register a new patient, screen her condition, and collect quotes from Indian hospitals.`,
    door: `Agents sign in through the main website, the single door for every role. We're signing in as Chinedu Okafor of Lagos MedConnect Travel.`,
    dash: `The dashboard is the agent's daily cockpit: patients, active cases, confirmed bookings, conversion rate and commission at a glance, with a six-month activity trend.`,
    nav: `The sidebar groups everything into sections that open like an accordion: patients and cases, the hospital network, earnings, messages, and account.`,
    patients: `The patients list shows everyone the agency manages, with consent status tabs across the top.`,
    patientsTabs: `One click filters by consent: still awaiting the patient's own confirmation, or confirmed. Search, nationality, case and date filters narrow it further, and the list can be exported.`,
    add1: `Let's add a new patient: ${full}, a fifty-three-year-old from Lagos who needs a knee replacement.`,
    add2: `Contact details, preferred currency, blood group and medical history help hospitals prepare accurate quotes.`,
    consent: `Before saving, the agent attests that ${first} agreed to the terms and privacy policy, and to sharing her records with hospitals. The attestation is logged with the agent's name, the time, and how consent was obtained.`,
    detail: `${first}'s profile is ready. The consent card shows exactly what was attested, and that it now waits for ${first} to confirm it herself when she first signs in.`,
    docs: `On the documents tab, the agent uploads files on the patient's behalf. Here, ${first}'s knee X-ray report goes up as a medical report.`,
    docsAi: `Reports can also be read by AI. The extracted results are checked and confirmed with the patient before anything is shared with hospitals.`,
    scr1: `Next, a new screening on ${first}'s behalf. The agent picks the specialty, marks where the problem is, and sets the pain level.`,
    scr2: `Symptoms are answered yes, maybe or no, and the history section captures how long it's been going on, the impact on daily life, and earlier treatments.`,
    scr3: `Notes for the medical team, languages, budget and travel window complete the picture.`,
    scr4: `After confirming the patient's consent, we ask the platform to find matching hospitals.`,
    result: `The result opens with a triage summary: suggested specialty, urgency, recommended procedures, and questions to ask the doctor. It's decision support, not a diagnosis.`,
    matches: `Below are ranked hospital and doctor matches, with the reasons for each match, price ranges, and the savings compared with treatment at home.`,
    compareMatches: `Select up to three matches to compare them side by side.`,
    request: `Then request quotes. Each hospital receives its own case, with the agent's message and the patient's consent to share.`,
    sent: `Both enquiries are on their way, and each one has its own case number.`,
    screenings: `The screenings list keeps every screening for all your patients, with status, specialty and urgency, so a draft is never lost.`,
    cases: `Cases and quotes lists every enquiry. Status tabs show at a glance which cases are waiting, quoted, accepted or booked.`,
    casesSearch: `Searching for ${last} brings up ${first}'s two new cases, both waiting for a hospital reply.`,
    caseDetail: `A case page shows the hospital, the treatment, shared documents, and a timeline of every step. Right now, it's awaiting a quote.`,
    quote: `Hospitals reply with itemised quotes, usually within forty-eight hours. The quote appears right on the case: surgery, implant, stay, tests and medicines, line by line.`,
    compare: `With both quotes in, the comparison view lines them up side by side, highlights the lowest total, and shows how much the patient saves.`,
    accept: `The agent accepts the better-value quote, and closes the other open enquiry in the same step.`,
    accepted: `The case is now accepted, and the agent goes straight on to booking: the accepted quote is already filled in.`,
    newEnquiry: `For patients who already know what they need, New enquiry skips the screening: pick the patient and the treatment, then choose hospitals directly.`,
    outro: `That's part one. In part two, we book ${first}'s treatment, pay the deposit, and tour the hospital network, earnings, messages and account settings.`,
  };
}

function narration2(first) {
  return {
    intro: `Welcome back. In part two, we book ${first}'s treatment, pay the deposit, and explore the rest of the agent portal.`,
    door: `We sign in again through the website door.`,
    book: `From the accepted case, Book treatment shows the accepted quote, the hospital's admission availability, and the payment options.`,
    book2: `We pick an admission date and choose to pay a deposit now, with the balance due before admission. Then we create the booking.`,
    pay: `The payment page lets the agent pay on the patient's behalf. Choose what to pay and the payment method; in this demo environment, we use the test gateway.`,
    paid: `The deposit is received, the booking is confirmed, and every payment is listed in the payment history.`,
    bookings: `The bookings list tracks every booked treatment, with admission dates, payment progress and balances due, filterable by status, hospital and payment state.`,
    bookingDetail: `Opening a booking shows the full case with its booking card: dates, amount paid, balance, and the refund policy.`,
    dash: `Back on the dashboard, the confirmed booking is reflected in the numbers, and ${first}'s case sits at the top of recent cases.`,
    hospitals: `The hospital network lets agents browse every partner hospital, with filters for specialty, city, language and accreditation.`,
    hospital: `A hospital page covers the facilities, doctors, procedures with package prices, and patient reviews.`,
    hospitalEnquiry: `And an enquiry for any patient can be sent straight from here. We'll cancel this one.`,
    doctors: `The doctors directory works the same way, filtered by specialty, language and gender.`,
    doctor: `Each doctor's profile shows their experience, the procedures they perform, and availability for the next sixty days.`,
    commissions: `Earnings starts with commissions: every commission item and its status, from pending through to paid.`,
    payouts: `The payouts tab lists the transfers to your bank, and the statement tab gives a running ledger you can export.`,
    payout: `The payout account holds the bank details commissions are paid to. The agency's account is already verified and set as primary.`,
    payoutSaved: `Further accounts can be added at any time, and each one is verified before it's used.`,
    messages: `Messages keep everyone in the loop. Each case has its own conversation with the hospital team and the patient.`,
    send: `The agent tells the hospital the deposit is paid, and asks for the pre-admission checklist.`,
    reply: `The hospital's reply arrives in real time.`,
    notifications: `Notifications collect every update: new quotes, payments, screening results and messages, with a quick filter for unread items.`,
    profile: `Under account, the profile and KYC page shows the account status, agency details, verification documents, and sign-in security.`,
    deleteAccount: `At the bottom, an agent can permanently delete their account. The platform explains what must be kept by law before asking for confirmation. We'll cancel.`,
    referral: `The referral program gives every agent a unique code and link to invite patients.`,
    sidebar: `The sidebar collapses to icons for more working space, and expands again with a single click.`,
    dark: `And dark mode is one tap away, for those long evenings of case work.`,
    outro: `That's the agent portal: from first contact to confirmed treatment, with quotes, payments and earnings all in one place.`,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Small UI helpers
// ---------------------------------------------------------------------------------------------------------------
async function selectIn(d, locator, value) {
  await d.hover(locator);
  await locator.selectOption(value);
  await d.wait(250);
}
async function tick(d, labelText) {
  const p = d.page;
  const input = p.getByLabel(labelText).first();
  await d.click(p.getByText(labelText).first(), { settle: false });
  await d.wait(200);
  if (!(await input.isChecked().catch(() => true))) await input.check({ force: true });
}
async function quick(d, groupName, name) {
  await d.click(d.page.getByRole('group', { name: groupName }).getByRole('button', { name }).first());
}

// ---------------------------------------------------------------------------------------------------------------
// Part 1
// ---------------------------------------------------------------------------------------------------------------
async function part1(state) {
  const { first, last } = state.name;
  const full = `${first} ${last}`;
  const N = narration1(first, last);
  const d = new Demo({ role: 'agent', label: 'Agent', part: 'part1', lines: Object.values(N) });
  await d.start();
  const p = d.page;

  await d.intro('Part 1 — patients, screening and hospital quotes', ['Add patient & consent', 'Documents', 'Screening', 'Matches', 'Request quotes', 'Compare & accept']);
  await d.say(N.intro);

  await d.scene({
    title: 'Website sign-in door', go: URLS.door, narration: N.door, shot: 'website-login', shotWhen: 'before',
    action: async () => { await d.signIn(AGENT_EMAIL); },
  });
  if (!p.url().startsWith(A)) await d.goto(`${A}/`);

  await d.scene({
    title: 'Dashboard', narration: N.dash, shot: 'dashboard', shotWhen: 'before',
    action: async () => {
      await d.hover(p.getByText(/patients/i).first());
      await d.scroll(380, { x: 1100, y: 600 });
      await d.wait(600);
      await d.scrollTop();
    },
  });

  await d.scene({
    title: 'Sidebar navigation (accordion groups)', narration: N.nav,
    action: async () => {
      const nav = p.locator('aside nav, nav[aria-label]').first();
      for (const g of ['Hospital network', 'Earnings', 'Messages & alerts', 'Account', 'Patients & cases']) {
        await d.click(nav.getByRole('button', { name: g }).first(), { settle: false });
        await d.wait(450);
      }
    },
  });

  // ---- patients list ------------------------------------------------------------------------------------------
  await d.scene({
    title: 'Patients list (consent tabs)', nav: ['Patients & cases', 'Patients', `${A}/patients`], narration: N.patients,
    action: async () => { await d.hover(p.getByRole('group', { name: 'Consent status' }).first()); },
  });
  await d.scene({
    title: 'Patients list - consent filter in use', narration: N.patientsTabs, shot: 'patients-consent-filter',
    action: async () => {
      await quick(d, 'Consent status', /^Awaiting confirmation/);
      await d.wait(700);
      await quick(d, 'Consent status', /^Confirmed/);
      await d.wait(500);
      const natBtn = p.getByRole('button', { name: /Nationality/ }).first();
      await d.click(natBtn, { settle: false });
      await d.wait(1200);
      await p.keyboard.press('Escape');
      await d.wait(300);
    },
  });

  // ---- add patient -------------------------------------------------------------------------------------------
  await d.scene({
    title: 'Add patient dialog', narration: N.add1,
    action: async () => {
      await d.click(p.getByRole('button', { name: 'Add patient' }).first());
      await p.getByRole('dialog').waitFor();
      await d.type(p.locator('#pf-first'), first);
      await d.type(p.locator('#pf-last'), last);
      await selectIn(d, p.locator('#pf-nat'), 'NG');
      await selectIn(d, p.locator('#pf-res'), 'NG');
      await d.click(p.locator('#pf-dob'), { settle: false });
      await p.locator('#pf-dob').fill('1973-04-12');
      await selectIn(d, p.locator('#pf-gender'), 'female');
    },
  });
  await d.scene({
    title: 'Add patient - contact & medical details', narration: N.add2,
    action: async () => {
      await d.type(p.locator('#pf-phone'), '+234 803 555 0142', 40);
      await d.type(p.locator('#pf-wa'), '+234 803 555 0142', 30);
      await selectIn(d, p.locator('#pf-ccy'), 'USD');
      await selectIn(d, p.locator('#pf-blood'), 'O+');
      await d.type(p.locator('#pf-allergies'), 'None known', 40);
      await d.type(p.locator('#pf-history'), 'Osteoarthritis of the right knee for 6 years; bone-on-bone on recent X-ray. Type 2 diabetes (metformin) and hypertension (amlodipine), both well controlled.', 18);
    },
  });
  await d.scene({
    title: 'Add patient - consent attestation', narration: N.consent, shot: 'add-patient-consent',
    action: async () => {
      await d.hover(p.getByText('Patient consent').first());
      await tick(d, 'I confirm the patient has agreed to the Terms of Service and Privacy Policy');
      await tick(d, 'The patient also agreed to share their records with the hospitals I contact for them');
      await selectIn(d, p.locator('#pf-cmethod'), 'written');
      await d.type(p.locator('#pf-cnote'), 'Signed consent form on file at the Lagos office', 30);
    },
  });
  await d.click(p.getByRole('dialog').getByRole('button', { name: 'Add patient' }));
  await p.waitForURL(/\/patients\/[0-9a-f-]{36}/, { timeout: 20_000 }).catch(() => d.warn('patient detail did not open'));
  await d.settle();
  state.patientId = p.url().match(/patients\/([0-9a-f-]{36})/)?.[1];

  await d.scene({
    title: 'Patient detail - profile & consent card', narration: N.detail, shot: 'patient-detail-consent',
    action: async () => {
      await d.hover(p.getByText('Patient consent').first());
      await d.scroll(300, { x: 1100, y: 600 });
    },
  });

  // ---- documents ---------------------------------------------------------------------------------------------
  await d.scene({
    title: 'Patient detail - documents (upload)', narration: N.docs,
    action: async () => {
      await d.scrollTop();
      await d.click(p.getByRole('tab', { name: /Documents/ }));
      const kind = p.getByLabel('Document type').first();
      await selectIn(d, kind, 'medical_report');
      const chooser = p.waitForEvent('filechooser', { timeout: 8000 });
      await d.click(p.getByRole('button', { name: 'Upload document' }).first(), { settle: false });
      await (await chooser).setFiles(XRAY_PDF);
      await p.getByText(XRAY_NAME).first().waitFor({ timeout: 20_000 });
      await d.settle(400);
    },
  });
  await d.scene({
    title: 'Patient documents - AI report reading', narration: N.docsAi, shot: 'patient-documents',
    action: async () => { await d.scroll(420, { x: 1100, y: 650 }); },
  });

  // ---- screening ---------------------------------------------------------------------------------------------
  await d.scrollTop();
  await d.scene({
    title: 'New screening on behalf of the patient - condition', narration: N.scr1,
    action: async () => {
      await d.click(p.getByRole('link', { name: 'New screening' }).first());
      await p.locator('#sc-specialty').waitFor();
      await d.wait(600);
      await selectIn(d, p.locator('#sc-specialty'), 'orthopedics');
      await d.click(p.getByRole('button', { name: 'Right leg', exact: true }), { settle: false });
      const pain = p.locator('#sc-pain');
      await d.hover(pain);
      for (const v of ['3', '5', '7']) { await pain.fill(v); await d.wait(220); }
    },
  });
  await d.scene({
    title: 'New screening - symptoms & history', narration: N.scr2, shot: 'new-screening',
    action: async () => {
      const groups = p.getByRole('radiogroup');
      await groups.first().waitFor({ timeout: 10_000 });
      const answers = ['Yes', 'Yes', 'Maybe'];
      const names = [];
      const count = await groups.count();
      for (let i = 0; i < count && names.length < answers.length; i++) {
        const n = (await groups.nth(i).getAttribute('aria-label')) ?? '';
        if (!/^(Impact on|Doctor gender|Payment)/.test(n)) names.push(n);
      }
      for (const [i, n] of names.entries()) {
        await d.click(p.getByRole('radiogroup', { name: n, exact: true }).getByRole('radio', { name: answers[i] }), { settle: false });
      }
      await d.type(p.getByLabel('Add another symptom'), 'Knee gives way on stairs', 45);
      await p.keyboard.press('Enter');
      await d.type(p.locator('#sc-duration'), '6', 80);
      await selectIn(d, p.getByLabel('Duration unit'), 'years');
      for (const [k, lvl] of [['work', 'Moderate'], ['sleep', 'Moderate'], ['mobility', 'Severe']]) {
        await d.click(p.getByRole('radiogroup', { name: `Impact on ${k}` }).getByRole('radio', { name: lvl }), { settle: false });
      }
      for (const t of ['Medication', 'Physical therapy']) await d.click(p.getByRole('button', { name: t, exact: true }), { settle: false });
    },
  });
  await d.scene({
    title: 'New screening - notes & preferences', narration: N.scr3,
    action: async () => {
      await d.type(p.locator('#sc-notes'), 'X-ray shows grade 4 osteoarthritis of the right knee. Walks with a stick; hoping for a knee replacement in early 2027.', 16);
      const en = p.getByRole('button', { name: 'English', exact: true }).first();
      if ((await en.getAttribute('aria-pressed')) !== 'true') await d.click(en, { settle: false });
      await selectIn(d, p.getByLabel('Budget currency'), 'USD');
      await d.type(p.getByLabel('Maximum budget'), '8000', 70);
      await d.click(p.getByLabel('Earliest travel date'), { settle: false });
      await p.getByLabel('Earliest travel date').fill(inDays(35));
      await p.getByLabel('Latest travel date').fill(inDays(80));
      await d.wait(300);
    },
  });
  await d.scene({
    title: 'New screening - consent & submit', narration: N.scr4,
    action: async () => {
      await tick(d, 'I confirm the patient has consented');
      await d.click(p.getByRole('button', { name: 'Find matching hospitals' }), { settle: false });
      await p.waitForURL(/\/screenings\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    },
  });
  await d.offCamera(async () => {
    await p.getByText('Triage summary').first().waitFor({ timeout: 150_000 }).catch(() => d.warn('triage summary not shown'));
    await d.settle(500);
  });
  state.screeningId = p.url().match(/screenings\/([0-9a-f-]{36})/)?.[1];

  await d.scene({
    title: 'Screening result - triage summary', narration: N.result, shot: 'screening-result',
    action: async () => { await d.scroll(320, { x: 1100, y: 600 }); },
  });

  // choose two matches from different hospitals (card order = rank order)
  const agentToken = await login(AGENT_EMAIL);
  const matches = await call(agentToken, 'GET', `/screenings/${state.screeningId}/matches`).catch(() => []);
  const pickIdx = [];
  const seen = new Set();
  // knee-replacement matches first (the story is a knee patient), then anything else; distinct hospitals
  for (const pass of [(m) => /knee replacement/i.test(m.procedure?.name ?? ''), () => true]) {
    matches.forEach((m, i) => {
      const hid = m.hospital?.id;
      if (pickIdx.length < 2 && hid && !seen.has(hid) && pass(m)) { seen.add(hid); pickIdx.push(i); }
    });
  }
  pickIdx.sort((a, b) => a - b);
  if (pickIdx.length < 2) d.warn(`only ${pickIdx.length} distinct hospitals among ${matches.length} matches`);

  await d.scene({
    title: 'Screening result - ranked matches', narration: N.matches, shot: 'screening-matches',
    action: async () => {
      await d.hover(p.locator('#matches-heading'));
      await d.scroll(420, { x: 1100, y: 600 });
    },
  });
  await d.scene({
    title: 'Compare matches dialog', narration: N.compareMatches, shot: 'compare-matches',
    action: async () => {
      // select higher index first: a selected card's button turns into "Remove"
      for (const i of [...pickIdx].sort((a, b) => b - a)) {
        await d.click(p.getByRole('button', { name: 'Select', exact: true }).nth(i), { settle: false });
        await d.wait(400);
      }
      await d.click(p.getByRole('button', { name: 'Compare', exact: true }), { settle: false });
      await p.getByRole('dialog').waitFor();
      await d.wait(600);
    },
  });
  await d.scene({
    title: 'Request quotes - enquiry dialog', narration: N.request, shot: 'enquiry-dialog',
    action: async () => {
      await d.click(p.getByRole('button', { name: 'Request quotes from these hospitals' }), { settle: false });
      await p.getByRole('dialog').getByLabel('Message to the hospitals').waitFor();
      await d.type(p.getByLabel('Message to the hospitals'), `${full}, 53, advanced osteoarthritis of the right knee (X-ray attached). Seeking total knee replacement; can travel from late November with her daughter. Please quote all-inclusive.`, 14);
      await tick(d, 'The patient consents to sharing their information with these hospitals');
    },
  });
  await d.click(p.getByRole('dialog').getByRole('button', { name: 'Send enquiry' }), { settle: false });
  await p.getByText('Enquiry results').first().waitFor({ timeout: 30_000 }).catch(() => d.warn('enquiry results not shown'));
  await d.scene({ title: 'Enquiry results (cases created)', narration: N.sent, shot: 'enquiry-sent' });

  // the cases just created, best-ranked match first
  const myCases = (await call(agentToken, 'GET', `/cases?patient_id=${state.patientId}&page_size=10`)).items;
  const hospOrder = pickIdx.map((i) => matches[i]?.hospital?.id);
  myCases.sort((a, b) => hospOrder.indexOf(a.hospital.id) - hospOrder.indexOf(b.hospital.id));
  state.cases = myCases.map((c) => ({ id: c.id, number: c.case_number, hospital: c.hospital }));
  // hospitals respond in the background while we look around (as the hospital users, via the API)
  const quoting = sendQuotes(state.cases).then(() => 'ok', (e) => { d.warn(`quotes: ${e.message}`); return 'failed'; });

  await d.click(p.getByRole('dialog').getByRole('button', { name: 'View cases' })).catch(() => {});

  await d.scene({ title: 'Screenings list', nav: ['Patients & cases', 'Screenings', `${A}/screenings`], narration: N.screenings, shot: 'screenings-list' });

  await d.scene({
    title: 'Cases & quotes list (status tabs)', nav: ['Patients & cases', 'Cases & quotes', `${A}/cases`], narration: N.cases,
    action: async () => {
      const g = p.getByRole('group').filter({ has: p.getByRole('button', { name: /^All cases/ }) }).first();
      for (const s of [/^Enquiry/, /^Booked/]) { await d.click(g.getByRole('button', { name: s }).first()); await d.wait(500); }
      await d.click(g.getByRole('button', { name: /^All cases/ }).first());
    },
  });
  await d.scene({
    title: 'Cases list - search', narration: N.casesSearch, shot: 'cases-list',
    action: async () => {
      await d.type(p.getByRole('searchbox', { name: 'Search cases' }).or(p.getByLabel('Search cases')).first(), last, 90);
      await d.settle(800);
    },
  });

  const caseA = state.cases[0];
  const caseB = state.cases[1];
  await d.scene({
    title: 'Case detail - awaiting quote', narration: N.caseDetail, shot: 'case-awaiting-quote', shotWhen: 'before',
    action: async () => {
      await d.scroll(450, { x: 900, y: 650 });
      await d.wait(500);
      await d.scrollTop();
    },
    go: `${A}/cases/${caseA?.id}`,
  });

  await d.offCamera(async () => {
    const r = await quoting;
    if (r !== 'ok') d.warn('quotes were not created');
    await d.goto(`${A}/cases/${caseA?.id}`);
  });
  await d.scene({
    title: 'Case detail - itemised quote received', narration: N.quote, shot: 'case-quote',
    action: async () => { await d.hover(p.getByText('Quotes').first()); await d.scroll(350, { x: 900, y: 650 }); },
  });

  await d.scrollTop();
  await d.scene({
    title: 'Quote comparison across hospitals', narration: N.compare, shot: 'quote-compare',
    action: async () => {
      const link = p.getByRole('link', { name: 'Compare quotes' }).first();
      if (await link.isVisible().catch(() => false)) await d.click(link);
      else await d.goto(`${A}/cases/compare?ids=${caseA.id},${caseB.id}`);
      await d.scroll(450, { x: 1000, y: 650 });
      await d.wait(400);
      await d.scrollTop();
    },
  });
  await d.scene({
    title: 'Accept quote dialog', narration: N.accept, shot: 'accept-quote',
    action: async () => {
      await d.click(p.getByRole('button', { name: 'Accept', exact: true }).first(), { settle: false });
      await p.getByRole('dialog').waitFor();
      const other = p.getByRole('dialog').getByText(/^Cancel the \d+ other open enquir/).first();
      if (await other.isVisible().catch(() => false)) await tick(d, /^Cancel the \d+ other open enquir/);
    },
  });
  await d.scene({
    title: 'Quote accepted', narration: N.accepted, shot: 'quote-accepted',
    action: async () => {
      await d.click(p.getByRole('dialog').getByRole('button', { name: 'Accept quote' }));
      await d.wait(800);
      if (!p.url().includes(`/cases/${caseA.id}`)) await d.goto(`${A}/cases/${caseA.id}`);
    },
  });
  state.acceptedCase = caseA;

  await d.scene({
    title: 'New enquiry (without screening)', narration: N.newEnquiry, shot: 'new-enquiry',
    action: async () => {
      const link = p.getByRole('link', { name: 'New enquiry' }).first();
      await d.click(link);
      await d.scroll(400, { x: 1000, y: 650 });
    },
  });

  await d.outro(N.outro, 'Part 2 continues with booking, payment, network, earnings, messages and account.');
  state.shots1 = d.shotNo;
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  return d.finish();
}

// ---------------------------------------------------------------------------------------------------------------
// Part 2
// ---------------------------------------------------------------------------------------------------------------
async function part2(state) {
  const { first, last } = state.name;
  const full = `${first} ${last}`;
  const N = narration2(first);
  const d = new Demo({ role: 'agent', label: 'Agent', part: 'part2', lines: Object.values(N) });
  await d.start({ shotStart: state.shots1 ?? 0 });
  const p = d.page;
  const caseA = state.acceptedCase;

  await d.intro('Part 2 — booking, payment, network, earnings and account', ['Book & pay', 'Bookings', 'Hospitals & doctors', 'Commissions & payouts', 'Messages', 'Notifications', 'Profile & KYC']);
  await d.say(N.intro);
  await d.scene({
    title: 'Website sign-in door', go: URLS.door, narration: N.door,
    action: async () => { await d.signIn(AGENT_EMAIL); },
  });

  // ---- book + pay --------------------------------------------------------------------------------------------
  await d.goto(`${A}/cases/${caseA.id}`);
  await d.scene({
    title: 'Book treatment (accepted quote, availability, payment option)', narration: N.book, shot: 'book-treatment',
    action: async () => {
      await d.click(p.getByRole('link', { name: 'Book treatment' }).first());
      await p.getByText('Admission date').first().waitFor();
      await d.scroll(380, { x: 900, y: 650 });
    },
  });
  await d.scene({
    title: 'Book treatment - date & deposit', narration: N.book2,
    action: async () => {
      const slots = p.getByRole('radiogroup', { name: 'Available admission dates' }).getByRole('radio');
      if (await slots.count().catch(() => 0)) await d.click(slots.nth(Math.min(2, (await slots.count()) - 1)), { settle: false });
      else {
        await d.click(p.locator('#admission-date'), { settle: false });
        await p.locator('#admission-date').fill(inDays(40));
      }
      await d.click(p.getByRole('radiogroup', { name: 'Payment option' }).getByRole('radio', { name: /deposit/i }), { settle: false });
      await d.wait(400);
      await d.click(p.getByRole('button', { name: /Create booking/ }), { settle: false });
      await p.waitForURL(/\/bookings\/[0-9a-f-]{36}\/pay/, { timeout: 30_000 });
      await d.settle(500);
    },
  });
  state.bookingId = p.url().match(/bookings\/([0-9a-f-]{36})/)?.[1];
  await d.scene({
    title: 'Pay on behalf of patient', narration: N.pay, shot: 'pay-booking',
    action: async () => {
      await d.hover(p.getByText('What to pay').first());
      await d.click(p.getByRole('radio', { name: /Test payment/ }).first(), { settle: false });
      await d.wait(300);
      await d.click(p.getByRole('button', { name: /^Pay / }).first(), { settle: false });
      await p.getByText('Test payment').first().waitFor({ timeout: 20_000 });
      await d.wait(500);
      await d.click(p.getByRole('button', { name: 'Simulate success' }), { settle: false });
      await d.settle(1200);
    },
  });
  await d.scene({
    title: 'Payment received - payment history', narration: N.paid, shot: 'payment-received',
    action: async () => { await d.scroll(400, { x: 900, y: 650 }); },
  });

  // ---- bookings ----------------------------------------------------------------------------------------------
  await d.scene({
    title: 'Bookings list (status & payment filters)', nav: ['Patients & cases', 'Bookings', `${A}/bookings`], narration: N.bookings, shot: 'bookings-list',
    action: async () => {
      const g = p.getByRole('group').filter({ has: p.getByRole('button', { name: /^All bookings/ }) }).first();
      await d.click(g.getByRole('button', { name: /^Confirmed/ }).first());
      await d.wait(500);
      const pay = p.getByRole('button', { name: /^Payment/ }).first();
      if (await pay.isVisible().catch(() => false)) { await d.click(pay, { settle: false }); await d.wait(900); await p.keyboard.press('Escape'); }
    },
  });
  await d.scene({
    title: 'Booking detail (case with booking card)', narration: N.bookingDetail, shot: 'booking-detail',
    action: async () => {
      await d.click(p.getByText(full).first());
      await d.settle(500);
      await d.scroll(300, { x: 900, y: 650 });
    },
  });

  await d.scene({
    title: 'Dashboard - recent cases', nav: [null, 'Dashboard', `${A}/`], narration: N.dash, shot: 'dashboard-recent',
    action: async () => { await d.scroll(700, { x: 1100, y: 650 }); },
  });

  // ---- hospital network --------------------------------------------------------------------------------------
  await d.scene({
    title: 'Hospitals (filters)', nav: ['Hospital network', 'Hospitals', `${A}/hospitals`], narration: N.hospitals, shot: 'hospitals',
    action: async () => {
      const spec = p.getByRole('button', { name: /^Specialty/ }).first();
      await d.click(spec, { settle: false });
      await d.wait(500);
      await d.click(p.getByRole('option', { name: /Orthopedics/ }).first(), { settle: false });
      await p.keyboard.press('Escape');
      await d.settle(600);
    },
  });
  await d.scene({
    title: 'Hospital detail (overview, doctors, packages, reviews)', narration: N.hospital, shot: 'hospital-detail',
    action: async () => {
      const card = p.locator(`a[href$="/hospitals/${caseA.hospital.slug}"]`).first();
      if (await card.isVisible().catch(() => false)) await d.click(card);
      else await d.goto(`${A}/hospitals/${caseA.hospital.slug}`);
      for (const t of [/^Doctors/, /^Procedures & packages/, /^Reviews/, /^Overview/]) {
        await d.click(p.getByRole('tab', { name: t }).first(), { settle: false });
        await d.wait(700);
      }
    },
  });
  await d.scene({
    title: 'Hospital detail - send enquiry dialog', narration: N.hospitalEnquiry,
    action: async () => {
      await d.click(p.getByRole('button', { name: 'Send enquiry for a patient' }), { settle: false });
      await p.getByRole('dialog').waitFor();
      await d.wait(900);
      await d.click(p.getByRole('dialog').getByRole('button', { name: 'Cancel' }), { settle: false });
    },
  });
  await d.scene({
    title: 'Doctors directory', nav: ['Hospital network', 'Doctors', `${A}/doctors`], narration: N.doctors, shot: 'doctors',
    action: async () => { await d.scroll(300, { x: 1100, y: 650 }); await d.scrollTop(); },
  });
  await d.scene({
    title: 'Doctor detail (procedures, availability)', narration: N.doctor, shot: 'doctor-detail',
    action: async () => {
      await d.click(p.locator('a[href*="/doctors/"]').filter({ hasNotText: 'Doctors' }).first());
      await d.scroll(400, { x: 1000, y: 650 });
    },
  });

  // ---- earnings ----------------------------------------------------------------------------------------------
  await d.scene({ title: 'Commissions - commission items', nav: ['Earnings', 'Commissions', `${A}/commissions`], narration: N.commissions, shot: 'commissions' });
  await d.scene({
    title: 'Commissions - payouts & statement tabs', narration: N.payouts, shot: 'commissions-statement',
    action: async () => {
      await d.click(p.getByRole('tab', { name: /^Payouts/ }).first());
      await d.wait(1200);
      await d.click(p.getByRole('tab', { name: /^Statement/ }).first());
    },
  });
  await d.nav('Earnings', 'Payout account', `${A}/payout-account`);
  const hasAccount = !(await p.getByText('No payout account yet').first().isVisible().catch(() => false));
  await d.scene({
    title: 'Payout account (verified primary account)', narration: N.payout, shot: 'payout-account-verified',
    action: async () => {
      // the seeded agent already has a verified account; otherwise one is added here (Zenith Bank)
      if (hasAccount) { await d.hover(p.getByText(/Verified/).first()); return; }
      await d.click(p.getByRole('button', { name: 'Add payout account' }).first(), { settle: false });
      await p.getByRole('dialog').waitFor();
      await d.type(p.locator('#pa-holder'), 'Lagos MedConnect Travel Ltd', 40);
      await d.type(p.locator('#pa-number'), '1023456789', 70);
      await d.type(p.locator('#pa-confirm'), '1023456789', 50);
      await d.type(p.locator('#pa-swift'), 'ZEIBNGLA', 70);
      await d.type(p.locator('#pa-bank'), 'Zenith Bank Plc', 50);
    },
  });
  await d.scene({
    title: 'Payout account - add another account option', narration: N.payoutSaved, shot: 'payout-account',
    action: async () => {
      if (hasAccount) { await d.hover(p.getByRole('button', { name: /Add another account/ }).first()); return; }
      await d.click(p.getByRole('dialog').getByRole('button', { name: 'Save account' }));
      await d.wait(800);
    },
  });

  // ---- messages & notifications ------------------------------------------------------------------------------
  await d.scene({
    title: 'Messages - case conversations', nav: ['Messages & alerts', 'Messages', `${A}/messages`], narration: N.messages,
    action: async () => {
      await d.goto(`${A}/messages?case=${caseA.id}`);
      await p.waitForURL(/\/messages\/[0-9a-f-]{36}/, { timeout: 20_000 });
      await d.settle(400);
    },
  });
  const convId = p.url().match(/messages\/([0-9a-f-]{36})/)?.[1];
  await d.scene({
    title: 'Messages - send a message', narration: N.send,
    action: async () => {
      const box = p.getByPlaceholder(/Write a message/);
      await d.type(box, `Hello team, ${first}'s deposit is paid and she plans to arrive two days before admission. Could you share the pre-admission checklist and any tests she should do in Lagos?`, 14);
      await d.click(p.getByRole('button', { name: 'Send message' }), { settle: false });
      await d.wait(600);
    },
  });
  const replyText = `Thank you, Chinedu. Confirmed - we have blocked the date. Please ask ${first} to bring her HbA1c, a recent ECG and the knee X-rays; our coordinator will share airport pickup details this week.`;
  const replied = await d.offCamera(async () => {
    const who = convId ? await hospitalReply(convId, caseA.hospital.slug, replyText) : null;
    if (!who) d.warn('hospital reply could not be posted');
    else await p.getByText(/blocked the date/).first().waitFor({ timeout: 8000 }).catch(async () => { await d.goto(p.url()); });
    return who;
  });
  await d.scene({
    title: 'Messages - hospital reply in real time', narration: N.reply, shot: 'messages',
    action: async () => { if (replied) await d.hover(p.getByText(/blocked the date/).first()); },
  });
  await d.scene({
    title: 'Notifications (all / unread)', nav: ['Messages & alerts', 'Notifications', `${A}/notifications`], narration: N.notifications, shot: 'notifications',
    action: async () => {
      const g = p.getByRole('group').filter({ has: p.getByRole('button', { name: /^Unread/ }) }).first();
      await d.click(g.getByRole('button', { name: /^Unread/ }).first());
      await d.wait(700);
      await d.click(g.getByRole('button', { name: /^All/ }).first());
    },
  });

  // ---- account -----------------------------------------------------------------------------------------------
  await d.scene({
    title: 'Profile & KYC (status, agency details, documents, security)', nav: ['Account', 'Profile & KYC', `${A}/profile`], narration: N.profile, shot: 'profile-kyc',
    shotWhen: 'before',
    action: async () => { await d.scroll(900, { x: 1000, y: 650 }); },
  });
  await d.scene({
    title: 'Profile - delete account section (dialog, cancelled)', narration: N.deleteAccount, shot: 'delete-account-dialog',
    action: async () => {
      const btn = p.getByRole('button', { name: 'Delete my account' });
      await d.hover(btn);
      await d.click(btn, { settle: false });
      await p.getByRole('dialog').waitFor();
      await d.wait(1500);
    },
  });
  await d.tryClick(p.getByRole('dialog').getByRole('button', { name: 'Cancel' }), { settle: false });
  await d.scene({ title: 'Referral program', nav: ['Account', 'Referral program', `${A}/referral`], narration: N.referral, shot: 'referral' });

  // ---- UI preferences ----------------------------------------------------------------------------------------
  await d.scene({
    title: 'Sidebar collapse / expand', narration: N.sidebar, shot: 'sidebar-collapsed',
    action: async () => {
      await d.click(p.getByRole('button', { name: 'Collapse sidebar' }).first(), { settle: false });
      await d.wait(1600);
    },
  });
  await d.tryClick(p.getByRole('button', { name: 'Expand sidebar' }).first(), { settle: false });
  await d.scene({
    title: 'Dark mode', narration: N.dark, shot: 'dark-mode', go: `${A}/`,
    action: async () => {
      await d.click(p.getByRole('button', { name: 'Toggle dark mode' }).first(), { settle: false });
      await d.wait(1500);
    },
  });
  await d.tryClick(p.getByRole('button', { name: 'Toggle dark mode' }).first(), { settle: false });

  await d.outro(N.outro);
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  return d.finish();
}

// ---------------------------------------------------------------------------------------------------------------
const which = process.argv[2] ?? 'all';
let state;
if (which === 'part2') {
  state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
} else {
  const t = await login(AGENT_EMAIL);
  state = { name: await pickPatientName(t) };
  console.log(`[agent] new patient: ${state.name.first} ${state.name.last}`);
}
await makeXrayPdf(`${state.name.first} ${state.name.last}`);
const results = [];
if (which === 'all' || which === 'part1') results.push(await part1(state));
if (which === 'all' || which === 'part2') results.push(await part2(state));
console.log(JSON.stringify(results.map((r) => ({ file: r.file, duration: r.durationText, size: r.size, warnings: r.warnings })), null, 2));
