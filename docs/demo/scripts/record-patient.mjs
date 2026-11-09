// Patient walkthrough - ONE continuous take covering every screen of the patient portal plus the website entry:
// website -> sign-in -> dashboard -> AI screening -> matches/costs/compare -> cases & quotes -> booking -> pay ->
// receipts -> trip hub -> documents & AI reading -> messages -> notifications -> saved -> profile.
//   source scripts/env.sh && node docs/demo/scripts/record-patient.mjs
// Output: docs/demo/patient/patient-walkthrough.mp4 (+ .srt/.vtt/.json, narration.json, coverage.md, screenshots/01..NN).
// The video is rendered to patient-walkthrough.rendering.* and renamed over the previous files only when finished,
// so an aborted run never leaves a half-written video behind. Old screenshots are replaced on success only.
//
// Account: patient.us@healindia.example (James Whitaker) / HealIndia@2026 (seeded).
// Data: so that the case close-up shows a clean record (the shared dev DB also holds "E2E ..." test cases), the script
// prepares - via the API, idempotently - one realistic quoted knee-replacement case for James at Sanjeevani (Gurugram)
// with a short patient/hospital message exchange. Apart from that it only reads, plus one support message on camera.
import fs from 'node:fs';
import path from 'node:path';
import { Demo, URLS } from './lib/recorder.mjs';
import { DEMO_DIR } from './lib/tools.mjs';

const P = URLS.patient;
const ORIGIN = 'http://localhost:5173';
const API = process.env.DEMO_API ?? 'http://127.0.0.1:8000/api/v1';
const PASSWORD = 'HealIndia@2026';
const EMAIL = 'patient.us@healindia.example';
const HOSPITAL_OWNER = 'owner.sanjeevani-gurugram@healindia.example';
const HOSPITAL_SLUG = 'sanjeevani-gurugram';
const MARKER = 'Right knee pain for about two years, worse on stairs and after long walks. My orthopedic surgeon at home recommended a total knee replacement.';

const N = {
  intro: 'Welcome! In this walkthrough, we follow James, a patient from the United States, through every screen of the Heal India Global patient experience: from the website and his first AI screening, to quotes, bookings and payments, and the trip itself.',
  home: 'It all starts on the public website. Patients see the promise up front: world-class treatment in India, at a fraction of the cost back home.',
  home2: 'They can browse specialties, real cost examples, and accredited partner hospitals, before they ever create an account.',
  door: 'Patients, agents and hospitals all use one secure sign-in door. James types his email and password, and lands in his own portal.',
  dash: 'This is the patient dashboard. It counts down to the next admission, and shows the booking, the hospital and the doctor at a glance.',
  dash2: 'Below, a pre-travel checklist, quick actions, today\'s schedule and recent AI screenings keep the whole journey in one place.',
  header: 'The header holds the notification bell, a light and dark theme switch, and the account menu.',
  screenings: 'First, let\'s see how James finds the right treatment. Under Care, AI screenings lists every assessment he has started. Tabs separate the ones with matches ready from the ones not finished yet.',
  newScreening: 'Starting a new AI screening begins with one simple question: what brings you to India? Each specialty shows the typical savings.',
  step1: 'Step one is an interactive body map. James marks where the problem is, or picks an area from the list, and can even describe it by voice.',
  step2: 'Step two asks about symptoms, with quick yes, maybe, or no answers, and room to add anything that is missing.',
  step3: 'Step three covers how long the condition has lasted, how severe it is, and any previous treatment. Reports can be attached right here.',
  step4: 'Finally, James personalizes his matches by language, doctor gender, budget and travel window. His answers are saved as a draft, so he can come back anytime.',
  results: 'When a screening is complete, the AI explains the findings in plain language: a summary, possible conditions to discuss, and suggested specialties.',
  results2: 'It then lists matched doctors and hospitals, with filters for city, accreditation, price and rating. Each match can be saved, compared, or asked for a quote.',
  cost: 'A treatment cost comparison shows what the same procedure costs in India versus at home, which is often the deciding factor.',
  compare: 'Selecting two or three matches opens a side by side comparison of doctors, hospitals, experience, inclusions and price.',
  cases: 'Now let\'s follow James from his quotes to the trip home. Every quote request becomes a case. My cases shows them all, with status tabs from waiting for a quote, to booked, to completed.',
  casesFilter: 'Filters and search make it easy to find a case. James shows only the cases where a quote has arrived, and looks up his knee replacement by its case number.',
  caseDetail: 'Inside the case, James sees the hospital\'s itemized quote, and can accept or decline it. His note, the doctor, documents and a full timeline sit on the same page.',
  book: 'From a quote, James can go straight to booking: he picks the admission date and confirms who is traveling with him.',
  bookings: 'Bookings lists every confirmed treatment, with tabs for awaiting payment, confirmed, admitted and completed, and a filter for anything left to pay.',
  bookingDetail: 'A booking shows the treatment, the payment schedule with receipts, and a clear price summary.',
  pay: 'Paying is secure and simple. James sees exactly what is due, and chooses a payment method, card or international bank transfer.',
  payments: 'Payments and receipts collects every transaction in one place, with status tabs and downloadable receipts.',
  trip: 'With treatment booked, it\'s time to plan the journey. The trip hub is James\'s travel companion: a pre-arrival checklist, visa support, flights and transfers, accommodation, and a translator or local guide.',
  trip2: 'It also has the itinerary, 24/7 help numbers, cultural tips for India, and an SOS button for emergencies.',
  docs: 'Documents keeps medical reports, scans and the passport together. Files can be uploaded and filtered by type.',
  docsAi: 'And with AI report reading, James can upload or photograph a medical report, and get a plain-language summary that he confirms before it is shared.',
  messages: 'Staying in touch is just as easy. Messages connects James with the hospital and his care coordinator, with one conversation per case. Here, the hospital has answered his question about physiotherapy.',
  support: 'He can also contact support at any time. Here he asks his coordinator a quick question about the airport pickup.',
  notifications: 'Notifications collect every update, from new quotes to payment confirmations, with an unread filter and mark all as read.',
  saved: 'Last comes James\'s account. Saved keeps the hospitals, doctors and procedures he bookmarked while researching.',
  profile: 'In the profile, James manages his personal information and home address, along with medical and insurance details.',
  profile2: 'Separate tabs hold the passport and emergency contact, travel companions, and language and notification preferences.',
  privacy: 'Privacy and account shows every consent with its date, and lets him request account deletion. Security handles his password and sessions.',
  collapse: 'And one last tip: the sidebar can be collapsed to icons for more room, and expanded again with one click.',
  outro: 'That is the complete patient journey, from the first AI screening to the trip home. Thank you for watching!',
};

// ---- data preparation (API, before the camera rolls) ------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function call(token, method, url, body) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(API + url, {
      method,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (res.status === 429 && attempt < 4) { console.log(`[prepare] ${method} ${url} rate-limited, waiting 30 s`); await sleep(30_000); continue; }
    if (!res.ok) throw new Error(`${method} ${url} -> ${res.status}: ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  }
}
const login = async (email) => (await call(null, 'POST', '/auth/login', { email, password: PASSWORD })).access_token;

/** A clean quoted knee-replacement case for James (reused if an earlier run created it). Returns its case number. */
async function prepareCase() {
  const james = await login(EMAIL);
  const cases = (await call(james, 'GET', '/cases?page_size=100')).items ?? [];
  for (const c of cases.filter((x) => x.status === 'quoted' && x.hospital?.slug === HOSPITAL_SLUG)) {
    const d = await call(james, 'GET', `/cases/${c.id}`);
    if (d.patient_notes === MARKER) { console.log(`[prepare] reusing ${d.case_number}`); return d.case_number; }
  }
  // hospital / doctor / procedure of the seeded knee-replacement journey at Sanjeevani
  let ref = null;
  for (const c of cases.filter((x) => x.hospital?.slug === HOSPITAL_SLUG)) {
    const d = await call(james, 'GET', `/cases/${c.id}`);
    if (d.doctor && /knee/i.test(d.procedure?.name ?? '')) { ref = d; break; }
  }
  if (!ref) throw new Error('no seeded knee-replacement case at Sanjeevani to copy hospital/doctor/procedure from');
  const created = await call(james, 'POST', '/cases', {
    hospital_id: ref.hospital.id, doctor_id: ref.doctor.id, procedure_id: ref.procedure.id, specialty_id: ref.specialty?.id ?? null,
    patient_notes: MARKER, consent_share: true,
  });
  const owner = await login(HOSPITAL_OWNER);
  const validUntil = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  await call(owner, 'POST', `/cases/${created.id}/quotes`, {
    treatment_plan: 'Right total knee replacement (cemented), 5 nights in a private room, physiotherapy from day one and a follow-up review before you fly home.',
    line_items: [
      { category: 'surgery', description: 'Surgeon, anaesthesia & OT charges', amount_minor: 22_500_000 },
      { category: 'implants', description: 'Knee implant (cobalt-chrome)', amount_minor: 11_000_000 },
      { category: 'hospital_stay', description: '5 nights, private room with companion bed', amount_minor: 6_000_000 },
      { category: 'tests_scans', description: 'Pre-operative tests & imaging', amount_minor: 1_200_000 },
      { category: 'medications', description: 'Medicines & consumables', amount_minor: 1_500_000 },
      { category: 'other', description: 'Physiotherapy sessions & discharge review', amount_minor: 800_000 },
    ],
    currency: 'INR', estimated_stay_days: 7, valid_until: validUntil,
  });
  // case conversation (auto-created with the case): a short, realistic exchange
  let conv = null;
  for (let i = 0; i < 10 && !conv; i++) {
    conv = (await call(james, 'GET', '/conversations')).find((c) => c.case_id === created.id) ?? null;
    if (!conv) await sleep(500);
  }
  if (conv) {
    await call(james, 'POST', `/conversations/${conv.id}/messages`, { body: 'Hello! Is physiotherapy included after the surgery, and can my wife stay with me in the room?' });
    await call(owner, 'POST', `/conversations/${conv.id}/messages`, { body: 'Hello James, yes - physiotherapy starts on day one and is included for your whole stay. Your wife is welcome to stay in your private room at no extra cost.' });
  } else console.warn('[prepare] case conversation not found - messages close-up will show the list only');
  console.log(`[prepare] created ${created.case_number}`);
  return created.case_number;
}

// ---- helpers ------------------------------------------------------------------------------------------------------
function helpers(d) {
  const p = () => d.page;
  /** Opens the first table row whose (often visually hidden) link name matches `name`. */
  async function openRow(name) {
    const link = p().getByRole('link', { name }).first();
    await link.waitFor({ state: 'attached', timeout: 10_000 });
    const before = p().url();
    const row = link.locator('xpath=ancestor::tr[1]');
    if (await row.count()) await d.click(row.locator('td').first());
    else await d.click(link);
    if (p().url() === before) {
      await link.evaluate((a) => a.click());
      await d.settle();
    }
  }
  /** Status tab / filter chip buttons look like "Quote received 7". */
  const chip = (label) => p().getByRole('button', { name: new RegExp(`^${label}(\\s|$)`, 'i') }).first();
  return { p, openRow, chip };
}

// ---- screenshots: the old set is kept aside and only dropped once the new video is rendered -------------------
const SHOT_DIR = path.join(DEMO_DIR, 'patient', 'screenshots');
const ASIDE = path.join(DEMO_DIR, '.cache', 'old-shots', 'patient');
function setAsideShots() {
  fs.rmSync(ASIDE, { recursive: true, force: true });
  fs.mkdirSync(ASIDE, { recursive: true });
  if (!fs.existsSync(SHOT_DIR)) return;
  for (const f of fs.readdirSync(SHOT_DIR).filter((x) => x.endsWith('.png'))) fs.renameSync(path.join(SHOT_DIR, f), path.join(ASIDE, f));
}
function restoreShots() {
  if (!fs.existsSync(ASIDE)) return;
  for (const f of fs.readdirSync(SHOT_DIR).filter((x) => x.endsWith('.png'))) fs.rmSync(path.join(SHOT_DIR, f));
  for (const f of fs.readdirSync(ASIDE)) fs.renameSync(path.join(ASIDE, f), path.join(SHOT_DIR, f));
  fs.rmSync(ASIDE, { recursive: true, force: true });
}

// ---- the take -------------------------------------------------------------------------------------------------------
async function record(caseNumber) {
  const d = new Demo({ role: 'patient', label: 'Patient', lines: Object.values(N) });
  d.base = 'patient-walkthrough.rendering'; // rendered under a temporary name, renamed when complete (see main)
  const { p, chip, openRow } = helpers(d);
  await d.start();
  await d.intro('From the website and the AI screening to quotes, bookings, payments and the trip to India.',
    ['Website', 'Sign-in door', 'Dashboard', 'AI screening', 'Matches & costs', 'Cases & quotes', 'Book & pay', 'Receipts', 'Trip hub', 'Documents & AI reading', 'Messages', 'Notifications', 'Profile']);
  await d.say(N.intro);

  // -- website, sign-in, dashboard
  await d.scene({ title: 'Website home', go: `${URLS.website}/`, narration: N.home, shot: 'website-home', shotWhen: 'before', action: () => d.scroll(500, { x: 960, y: 600 }) });
  await d.scene({ title: 'Website: specialties, costs, hospitals', narration: N.home2, action: async () => { await d.scroll(900); await d.scroll(900); await d.scroll(700); } });
  await d.scene({ title: 'Sign-in door', go: URLS.door, narration: N.door, shot: 'login-door', shotWhen: 'before', action: () => d.signIn(EMAIL) });
  if (!p().url().startsWith(P)) await d.goto(`${P}/`);

  await d.scene({ title: 'Dashboard', narration: N.dash, shot: 'dashboard', shotWhen: 'before', action: () => d.tryHover(p().getByText(/until treatment/i)) });
  await d.scene({ title: 'Dashboard: checklist, quick actions, schedule', narration: N.dash2, action: async () => { await d.scroll(450, { x: 1100, y: 600 }); await d.wait(800); await d.scroll(500); await d.scrollTop(); } });
  await d.scene({ title: 'Header: notifications, theme, account menu', narration: N.header, action: async () => {
    await d.tryHover(p().getByRole('link', { name: /^notifications/i }));
    const theme = p().getByRole('button', { name: /theme|dark|light/i }).first();
    if (await d.tryClick(theme, { settle: false })) {
      await d.wait(1500);
      await d.shot('dark-mode');
      await d.click(theme, { settle: false });
    }
    if (await d.tryClick(p().getByRole('button', { name: /user menu|account menu|james whitaker/i }), { settle: false })) {
      await d.wait(1400);
      await p().keyboard.press('Escape');
    }
  } });

  // -- chapter: AI screening
  await d.scene({ title: 'AI screenings list', nav: ['Care', 'AI screenings', `${P}/screenings`], narration: N.screenings, shot: 'ai-screenings', shotWhen: 'before', action: async () => {
    await d.tryClick(chip('Matches ready'), { settle: false });
    await d.wait(1200);
    await d.tryClick(chip('Not finished'), { settle: false });
    await d.wait(1200);
    await d.tryClick(chip('All'), { settle: false });
  } });
  // prefer an orthopedic draft (the body-map step then matches the knee/leg story); else any draft
  const draftHref = (await p().getByRole('link', { name: /^continue answering: (orthopedics|spine)/i }).first().getAttribute('href', { timeout: 3000 }).catch(() => null))
    ?? (await p().getByRole('link', { name: /^continue answering/i }).first().getAttribute('href', { timeout: 3000 }).catch(() => null));
  const resultsHref = await p().getByRole('link', { name: /^view matches/i }).first().getAttribute('href', { timeout: 5000 }).catch(() => null);

  await d.scene({ title: 'New AI screening: specialty grid', go: `${P}/screening/new`, narration: N.newScreening, shot: 'screening-specialties', shotWhen: 'before', action: async () => {
    await d.tryHover(p().getByRole('button', { name: /orthopedics/i }));
    await d.scroll(600, { x: 1100, y: 600 });
    await d.wait(600);
    await d.scrollTop();
  } });

  const draft = draftHref ? `${ORIGIN}${draftHref.replace(/\/step\/\d+$/, '')}` : null;
  if (!draft) d.warn('no draft screening found - wizard steps skipped');
  if (draft) {
    await d.scene({ title: 'Screening step 1: body map', go: `${draft}/step/1`, narration: N.step1, shot: 'screening-body-map', action: async () => {
      const area = p().getByRole('button', { name: 'Right leg', exact: true }).first();
      if ((await area.getAttribute('aria-pressed', { timeout: 5000 }).catch(() => null)) !== 'true') await d.tryClick(area, { settle: false });
      await d.tryHover(p().getByRole('button', { name: /describe it by voice/i }));
    } });
    await d.scene({ title: 'Screening step 2: symptoms', go: `${draft}/step/2`, narration: N.step2, shot: 'screening-symptoms', action: async () => {
      await d.tryHover(p().getByRole('button', { name: /^yes, i have/i }));
      await d.scroll(300, { x: 1100, y: 600 });
    } });
    await d.scene({ title: 'Screening step 3: duration & severity', go: `${draft}/step/3`, narration: N.step3, shot: 'screening-duration', action: async () => {
      await d.scroll(450, { x: 1100, y: 600 });
      await d.wait(500);
      await d.scrollTop();
    } });
    await d.scene({ title: 'Screening step 4: preferences', go: `${draft}/step/4`, narration: N.step4, shot: 'screening-preferences', action: async () => {
      await d.scroll(450, { x: 1100, y: 600 });
      await d.tryHover(p().getByRole('button', { name: /save & exit/i }));
    } });
  }

  const results = resultsHref ? `${ORIGIN}${resultsHref}` : null;
  if (results) {
    await d.scene({ title: 'Screening results: AI summary', go: results, narration: N.results, shot: 'screening-results', shotWhen: 'before', action: () => d.scroll(500, { x: 1100, y: 500 }) });
    await d.scene({ title: 'Matched doctors & hospitals', narration: N.results2, action: async () => {
      await p().getByRole('heading', { name: /matched doctors/i }).first().scrollIntoViewIfNeeded().catch(() => {});
      await d.wait(300);
      await d.shot('matched-doctors');
      const cmp = p().getByRole('button', { name: 'Compare', exact: true });
      await d.tryClick(cmp.nth(0), { settle: false });
      await d.tryClick(cmp.nth(1), { settle: false });
      await d.scroll(400);
    } });
    await d.scene({ title: 'Treatment cost comparison', narration: N.cost, action: async () => {
      await p().getByRole('heading', { name: /treatment cost comparison/i }).first().scrollIntoViewIfNeeded().catch(() => {});
      await d.wait(400);
      // not every procedure has a cost benchmark: switch to one that has (Total Knee Replacement first)
      if (await p().getByText(/comparison unavailable/i).first().isVisible().catch(() => false)) {
        const select = p().locator('select').filter({ has: p().locator('option', { hasText: /replacement|knee|hip/i }) }).first();
        const options = await select.locator('option').allTextContents().catch(() => []);
        const ordered = [...options.filter((o) => /total knee/i.test(o)), ...options.filter((o) => !/total knee/i.test(o))];
        for (const o of ordered) {
          await d.click(select, { settle: false });
          await select.selectOption({ label: o });
          await d.wait(900);
          if (!(await p().getByText(/comparison unavailable/i).first().isVisible().catch(() => false))) break;
        }
      }
      await d.scroll(200);
      await d.shot('cost-comparison');
    } });
    await d.scene({ title: 'Compare matches side by side', narration: N.compare, action: async () => {
      await d.tryClick(p().getByRole('button', { name: 'Compare', exact: true }).last());
      if (!/\/compare/.test(p().url())) await d.goto(results.replace(/\/results$/, '/compare'));
      await d.shot('compare-matches');
      await d.scroll(500, { x: 1100, y: 500 });
    } });
  } else d.warn('no completed screening found - results skipped');

  // -- chapter: from quotes to the trip home
  await d.scene({ title: 'My cases', nav: ['Care', 'My cases', `${P}/cases`], narration: N.cases, shot: 'my-cases', shotWhen: 'before', action: async () => {
    await d.tryHover(chip('Waiting for quote'));
    await d.tryHover(chip('Booked'));
    await d.tryHover(chip('Completed'));
  } });
  await d.scene({ title: 'My cases: filters & search', narration: N.casesFilter, action: async () => {
    await d.click(chip('Quote received'));
    await d.wait(500);
    const search = p().getByPlaceholder(/search by case number/i).first();
    if (caseNumber && await search.isVisible().catch(() => false)) {
      await d.type(search, caseNumber, 55);
      await d.wait(1200);
      await d.settle(300);
    }
    await d.shot('my-cases-filtered');
  } });
  await d.scene({ title: 'Case detail: itemized quote', narration: N.caseDetail, action: async () => {
    if (caseNumber) await openRow(new RegExp(`open case.*${caseNumber}|${caseNumber}`, 'i')).catch(() => openRow(/^open case/i));
    else await openRow(/^open case/i);
    await d.shot('case-detail');
    await d.tryHover(p().getByRole('button', { name: /accept quote/i }));
    await d.scroll(600, { x: 1100, y: 600 });
    await d.wait(500);
    await d.scroll(600);
  } });
  await d.scene({ title: 'Book treatment', narration: N.book, action: async () => {
    await d.scrollTop();
    const book = p().getByRole('link', { name: /book treatment/i }).first();
    if (await book.isVisible().catch(() => false)) await d.click(book);
    else d.warn('book treatment link not visible on quoted case');
    await d.shot('book-treatment');
    await d.scroll(400, { x: 1100, y: 600 });
  } });

  await d.scene({ title: 'Bookings', nav: ['Bookings & payments', 'Bookings', `${P}/bookings`], narration: N.bookings, shot: 'bookings', shotWhen: 'before', action: async () => {
    await d.tryHover(chip('Confirmed'));
    if (await d.tryClick(p().getByRole('button', { name: /left to pay/i }))) {
      await d.wait(1000);
      await d.tryClick(p().getByRole('button', { name: /reset all/i }));
    }
  } });
  await d.scene({ title: 'Booking detail', narration: N.bookingDetail, action: async () => {
    await d.click(chip('Confirmed'));
    await openRow(/^open booking/i);
    await d.shot('booking-detail');
    await d.scroll(400, { x: 1100, y: 600 });
  } });
  await d.scene({ title: 'Pay for a booking', go: `${P}/bookings`, narration: N.pay, action: async () => {
    await d.click(chip('Awaiting payment'));
    await openRow(/^open booking/i);
    const pay = p().getByRole('link', { name: /pay now/i }).first();
    if (await pay.isVisible().catch(() => false)) await d.click(pay);
    else d.warn('pay now not visible');
    await d.shot('pay');
    await d.tryHover(p().getByText(/international bank transfer/i));
  } });
  await d.scene({ title: 'Payments & receipts', nav: ['Bookings & payments', 'Payments', `${P}/payments`], narration: N.payments, shot: 'payments', shotWhen: 'before', action: async () => {
    await d.tryHover(chip('Paid'));
    await d.tryHover(p().getByRole('button', { name: /receipt/i }));
  } });

  // -- trip & documents
  await d.scene({ title: 'Trip hub', nav: ['Trip & documents', 'Trip', `${P}/trip`], narration: N.trip, shot: 'trip-hub', shotWhen: 'before', action: () => d.scroll(600, { x: 1100, y: 600 }) });
  await d.scene({ title: 'Trip hub: itinerary, help, SOS', narration: N.trip2, action: async () => {
    await d.scroll(700);
    await d.shot('trip-itinerary-help');
    await d.scroll(500);
    await d.scrollTop();
    await d.tryHover(p().getByRole('button', { name: /^sos$/i }));
  } });
  await d.scene({ title: 'Documents', nav: ['Trip & documents', 'Documents', `${P}/documents`], narration: N.docs, shot: 'documents', shotWhen: 'before', action: async () => {
    await d.tryHover(p().getByRole('button', { name: /upload files/i }));
    await d.tryHover(chip('Medical'));
  } });
  await d.scene({ title: 'AI report reading', narration: N.docsAi, action: async () => {
    await d.click(p().getByRole('button', { name: /^start$/i }).first(), { settle: false });
    await d.wait(800);
    await d.shot('ai-report-reading');
    await d.tryHover(p().getByRole('button', { name: /take photo/i }));
  } });

  // -- messages & alerts
  await d.scene({ title: 'Messages: case conversation', nav: ['Messages & alerts', 'Messages', `${P}/messages`], narration: N.messages, action: async () => {
    const conv = caseNumber ? p().getByRole('link', { name: new RegExp(caseNumber) }).first() : null;
    if (conv && await d.tryClick(conv)) await d.wait(800);
    else await d.tryHover(p().getByRole('link', { name: /case HIG-C/i }));
    await d.shot('messages');
  } });
  await d.scene({ title: 'Contact support (conversation)', narration: N.support, action: async () => {
    const btn = p().getByRole('button', { name: /contact support/i }).first();
    if (!(await btn.isVisible().catch(() => false))) await d.goto(`${P}/messages`);
    await d.click(btn);
    const box = p().getByRole('textbox').last();
    await d.type(box, 'Hi! Could you confirm the airport pickup time for my admission? Thank you.', 40);
    await d.tryClick(p().getByRole('button', { name: /send message/i }));
    await d.wait(800);
    await d.shot('support-chat');
  } });
  await d.scene({ title: 'Notifications', nav: ['Messages & alerts', 'Notifications', `${P}/notifications`], narration: N.notifications, shot: 'notifications', shotWhen: 'before', action: async () => {
    await d.tryClick(chip('Unread'), { settle: false });
    await d.wait(900);
    await d.tryHover(p().getByRole('button', { name: /mark all as read/i }));
    await d.tryClick(chip('All'), { settle: false });
  } });

  // -- account
  await d.scene({ title: 'Saved', nav: ['Account', 'Saved', `${P}/saved`], narration: N.saved, shot: 'saved', shotWhen: 'before' });
  await d.scene({ title: 'Profile: personal info', nav: ['Account', 'Profile', `${P}/profile`], narration: N.profile, shot: 'profile', shotWhen: 'before', action: () => d.scroll(500, { x: 1100, y: 600 }) });
  await d.scene({ title: 'Profile: passport, companions, preferences', narration: N.profile2, action: async () => {
    await d.scrollTop();
    for (const [tab, name] of [['Passport & emergency', 'profile-passport'], ['Companions', 'profile-companions'], ['Preferences', 'profile-preferences']]) {
      await d.click(p().getByRole('tab', { name: tab }).first(), { settle: false });
      await d.wait(1300);
      await d.shot(name);
    }
  } });
  await d.scene({ title: 'Profile: privacy & account deletion, security', narration: N.privacy, action: async () => {
    await d.click(p().getByRole('tab', { name: /privacy/i }).first(), { settle: false });
    await d.wait(600);
    await d.scroll(400, { x: 1100, y: 600 });
    await d.shot('profile-privacy-deletion');
    await d.wait(1500);
    await d.scrollTop();
    await d.click(p().getByRole('tab', { name: /security/i }).first(), { settle: false });
    await d.wait(1000);
    await d.shot('profile-security');
  } });
  await d.scene({ title: 'Sidebar collapse', narration: N.collapse, action: async () => {
    await d.click(p().getByRole('button', { name: /collapse sidebar/i }).first(), { settle: false });
    await d.wait(1600);
    await d.shot('sidebar-collapsed');
    await d.click(p().getByRole('button', { name: /expand sidebar/i }).first(), { settle: false });
  } });

  await d.outro(N.outro);
  return d.finish();
}

/** Moves patient-walkthrough.rendering.* over patient-walkthrough.* and fixes the references to the temporary name. */
function publish(info) {
  const dir = path.join(DEMO_DIR, 'patient');
  const tmp = 'patient-walkthrough.rendering';
  const fin = 'patient-walkthrough';
  for (const ext of ['vtt', 'srt', 'json', 'mp4']) { // mp4 last: the video only changes once everything else is in place
    const from = path.join(dir, `${tmp}.${ext}`);
    if (ext === 'json') {
      const j = JSON.parse(fs.readFileSync(from, 'utf8'));
      j.file = j.file.replace(tmp, fin);
      fs.writeFileSync(from, JSON.stringify(j, null, 2));
    }
    fs.renameSync(from, path.join(dir, `${fin}.${ext}`));
  }
  const cov = path.join(dir, 'coverage.md');
  fs.writeFileSync(cov, fs.readFileSync(cov, 'utf8').replaceAll(`${tmp}.mp4`, `${fin}.mp4`));
  // a later stand-alone `finalize.mjs <session.json>` re-encode writes straight to the final name
  const session = path.join(DEMO_DIR, '.cache', 'raw', fin, 'session.json');
  if (fs.existsSync(session)) {
    const s = JSON.parse(fs.readFileSync(session, 'utf8'));
    s.base = fin;
    fs.writeFileSync(session, JSON.stringify(s, null, 2));
  }
  return { ...info, file: info.file.replace(tmp, fin) };
}

const caseNumber = await prepareCase().catch((e) => { console.warn(`[prepare] ${e.message} - using the first quoted case`); return null; });
setAsideShots();
let info;
try {
  info = publish(await record(caseNumber));
} catch (e) {
  restoreShots();
  throw e;
}
fs.rmSync(ASIDE, { recursive: true, force: true });
console.log(JSON.stringify({ file: info.file, duration: info.durationText, size: info.size, chapters: info.chapters.length, warnings: info.warnings }, null, 2));
