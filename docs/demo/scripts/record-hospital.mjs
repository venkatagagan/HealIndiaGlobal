// Narrated walkthrough of the hospital provider portal (http://localhost:5175/hospital/), recorded from the real
// running product. Run from the repo root (Git Bash):
//   source scripts/env.sh && node docs/demo/scripts/record-hospital.mjs
// Data: setup-hospital-data.mjs creates (or reuses) a fresh cardiology enquiry from Hamed Al-Rawahi (Oman) with an
// AI screening, an echocardiogram and patient-confirmed report readings. The video sends that enquiry a quote and a
// message; every other dialog (decline, admit, add doctor, invite, itinerary item) is opened and cancelled.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Demo, URLS } from './lib/recorder.mjs';

/**
 * Silent stretches between two narration lines (slow page loads, long typing on a busy machine) are cut down to
 * ~2.5 s: 1 s after a line ends and 1.5 s before the next one starts stay in the video. Returns [from, to] cuts in
 * raw-recording seconds for Demo.cuts / finalize(). Also used to re-finalize a session:
 *   node docs/demo/scripts/record-hospital.mjs --refinalize
 */
export function gapCuts(timeline, { after = 1.0, before = 1.5 } = {}) {
  const cuts = [];
  for (let i = 0; i < timeline.length - 1; i++) {
    const from = timeline[i].t + timeline[i].dur + after;
    const to = timeline[i + 1].t - before;
    if (to - from > 0.5) cuts.push([+from.toFixed(3), +to.toFixed(3)]);
  }
  return cuts;
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
if (process.argv.includes('--refinalize')) {
  const fs = await import('node:fs');
  const { finalize, DEMO_DIR } = await import('./lib/recorder.mjs');
  const file = path.join(DEMO_DIR, '.cache', 'raw', 'hospital-walkthrough', 'session.json');
  const session = JSON.parse(fs.readFileSync(file, 'utf8'));
  session.cuts = [...(session.cuts ?? []).filter((c) => !c.gap), ...gapCuts(session.timeline)];
  const info = finalize(session);
  console.log(JSON.stringify({ duration: info.durationText, size: info.size, warnings: info.warnings }, null, 2));
  process.exit(0);
}
const DRY = process.env.DEMO_DRY === '1'; // rehearsal: no quote / message is actually sent
const H = URLS.hospital;
const EMAIL = 'owner.sanjeevani-gurugram@healindia.example';
const BOOKING_CONFIRMED = '01a15fbe-c5c5-7472-b28d-4c9eaa205452'; // HIG-B-2026-000003 Babatunde Adeyemi (seed)
const BOOKING_COMPLETED = '01a15ef9-053a-717e-a406-39ecd7cb4962'; // HIG-B-2026-000001 James Whitaker (seed)
const DOCTOR = '01a15ef8-9876-713e-9e75-1b4c433b0feb'; // Dr. Arvind Khanna

// ---- demo data (before the recording starts) ------------------------------------------------------------------
const setup = spawnSync(process.execPath, [path.join(HERE, 'setup-hospital-data.mjs')], { encoding: 'utf8' });
if (setup.status !== 0) throw new Error(`setup failed: ${setup.stderr}`);
const { caseId, caseNumber } = JSON.parse(setup.stdout.trim().split('\n').pop());
console.log('demo enquiry', caseNumber, caseId);

const N = {
  intro: "Welcome to the Heal India Global hospital portal. Let's follow Sanjeevani Heart Institute as it cares for international patients, from the first enquiry to payout.",
  login: 'Hospital teams sign in on the main website, through the same secure door as patients and agents.',
  dash: 'The dashboard opens with quick links to open enquiries and upcoming admissions.',
  stats: "Live counters track enquiries, quotes, admissions, patients in treatment and this month's revenue, with monthly charts below.",
  recent: 'Recent enquiries sit at the bottom, so nothing new slips through.',
  cases: 'Enquiries and cases lists every request sent to the hospital, with status tabs across the top.',
  casesFilter: 'Tabs, urgency, dates and search narrow the list. Here, only new enquiries still waiting for a reply.',
  caseOpen: "Let's open Hamed Al-Rawahi's enquiry from Oman about heart valve replacement.",
  screening: 'The case shows the patient, the requested doctor and his message, then the AI screening summary: symptoms, impact, budget, languages and suggested procedures.',
  readings: 'Report readings are findings the AI extracted from his echocardiogram and the patient confirmed. Urgent findings and abnormal labs stand out, and patient edits are marked.',
  docs: 'The original documents are right below, ready to download and verify.',
  decline: "Decline closes an enquiry with a reason for the patient. We'll cancel, because we can help him.",
  quoteOpen: 'Instead, we build an itemised quote, starting from the usual cost lines.',
  quotePlan: 'We describe the treatment plan and the expected stay. Quotes are valid for thirty days by default.',
  quoteLines: 'Then we price each line and add the valve implant. The total updates as we type.',
  quoteSent: 'One click sends it. The patient is notified at once, and the case moves to quoted.',
  bookings: 'Bookings lists every admission, with tabs from pending payment to discharged.',
  bookingsSearch: 'Search finds a patient instantly.',
  calendar: 'The calendar view shows admissions by month, so the ward can plan beds ahead.',
  bookingDetail: 'A booking shows the treatment, doctor, admission date and payment status, including the deposit held in escrow.',
  admit: "Admit patient records the arrival; we'll just peek at the dialog and cancel. Once a patient is admitted, Discharge and complete appears here.",
  itinerary: "The itinerary plans appointments, admission and follow-ups, and items can be added at any time.",
  visa: 'The hospital uploads its e-Medical visa invitation letter right here, next to transfers like the airport pickup.',
  completed: 'A completed booking keeps the full record, from admission to discharge.',
  doctors: 'Doctors lists your specialists with experience, rating, fee and medical registration; the check mark means the registration is verified.',
  doctorForm: "The doctor form holds specialty, qualifications, languages and registration. We'll close it unchanged.",
  availability: 'Each doctor has an availability calendar for teleconsults and admissions.',
  procedures: 'Procedures and pricing is your price list, with price ranges, stay and success rates.',
  packages: 'Each procedure has bookable packages, showing exactly what is included.',
  profile: 'The hospital profile holds contact details, accreditations, specialties, KYC documents and the payout account.',
  accreditations: 'Accreditations, languages and the international desk are shown to patients.',
  kyc: 'KYC documents like registration, PAN and GST certificates are uploaded here for verification.',
  team: 'Team shows everyone with portal access, and their role.',
  invite: "Invite member sends a secure invitation with a chosen role. We'll cancel this one.",
  reviews: 'Reviews collects patient feedback; published reviews appear on your public profile.',
  finance: 'Finance shows what is pending, eligible, on hold and paid out, and each settlement item after platform commission.',
  payouts: 'Payouts tracks bank transfers to the hospital.',
  statements: 'Statements give opening and closing balances, earnings and every ledger entry for a period.',
  account: 'And here is the payout bank account.',
  messages: "Messages keeps one secure conversation per case. Let's reply to Mister Al-Rawahi.",
  notifications: 'Notifications collects every alert, with a filter for unread ones.',
  switcher: 'The top bar shows the active hospital; owners of several hospitals get a switcher here.',
  collapse: 'The sidebar collapses to icons, and expands again with one click.',
  dark: 'And dark mode is a single toggle away.',
  outro: "That's the hospital portal: enquiries, quotes, admissions, doctors, pricing and payouts, all in one place. Thank you for watching.",
};

const d = new Demo({ role: 'hospital', label: 'Hospital', lines: Object.values(N) });
await d.start();
// Render the title card inside an http page (one run lost the about:blank card from the WebM, shifting all audio).
await d.page.goto(`${URLS.website}/favicon.ico`).catch(() => {});
const p = d.page;
const main = () => p.locator('main');
const dialog = () => p.getByRole('dialog').last();
const cancelDialog = async () => {
  const c = dialog().getByRole('button', { name: /^(cancel|close)$/i }).first();
  if (!(await d.tryClick(c, { settle: false }))) await p.keyboard.press('Escape');
  await d.wait(500);
};
const tab = (name) => main().getByRole('tab', { name }).or(main().getByRole('radio', { name })).or(main().getByRole('button', { name })).first();
/** natural typing for the first words, then the rest at once (long texts re-render slowly while recording) */
const typeLong = async (loc, text, n = 42) => { await d.type(loc, text.slice(0, n), 35); await loc.fill(text); };
/** screenshot linked to the current chapter in coverage.md */
const snap = async (name) => { const f = await d.shot(name); const c = d.chapters.at(-1); if (c && !c.shot) c.shot = f; };

await d.intro('Hospital provider portal: enquiries, quotes, admissions, doctors, pricing and payouts', [
  'Enquiries & AI screening', 'Itemised quotes', 'Bookings & calendar', 'Doctors & pricing', 'Team & KYC', 'Finance & payouts',
]);
await d.say(N.intro);

// ---- sign in -----------------------------------------------------------------------------------------------------
await d.scene({
  title: 'Sign in (website door)',
  go: URLS.door,
  narration: N.login,
  shot: 'login',
  shotWhen: 'before',
  action: async () => { await d.signIn(EMAIL); },
});

// ---- dashboard -----------------------------------------------------------------------------------------------------
await d.scene({ title: 'Dashboard - hero', go: `${H}/`, narration: N.dash, shot: 'dashboard', shotWhen: 'before',
  action: async () => { await d.hover(main().getByRole('link', { name: /open enquiries/i }).first()); await d.hover(main().getByRole('link', { name: /upcoming admissions/i }).first()); } });
await d.scene({ title: 'Dashboard - stats & charts', narration: N.stats,
  action: async () => { await d.moveTo(900, 450); await d.scroll(420); } });
await d.scene({ title: 'Dashboard - recent enquiries', narration: N.recent, shot: 'dashboard-recent',
  action: async () => { await d.scroll(500); } });

// ---- enquiries & cases --------------------------------------------------------------------------------------------
await d.scene({ title: 'Enquiries & cases - list with status tabs', nav: ['Patients', 'Enquiries & cases', `${H}/cases`], narration: N.cases, shot: 'cases-list', shotWhen: 'before',
  action: async () => { await d.hover(main().getByText(/^Booked/).first()); } });
await d.scene({ title: 'Enquiries & cases - filters (New)', narration: N.casesFilter, shot: 'cases-filter-new',
  action: async () => {
    await d.hover(main().getByRole('button', { name: /urgency/i }).first());
    await d.click(tab(/^New/));
  } });
await d.scene({ title: 'Case detail - patient', narration: N.caseOpen,
  action: async () => {
    await d.tryClick(main().getByRole('row').filter({ hasText: caseNumber }).getByText('Hamed Al-Rawahi').first());
    if (!p.url().includes(caseId)) await d.goto(`${H}/cases/${caseId}`);
  } });
await d.scene({ title: 'Case detail - AI screening summary', narration: N.screening, shot: 'case-detail', shotWhen: 'before',
  action: async () => { await d.moveTo(900, 600); await d.scroll(520); } });
await d.scene({ title: 'Case detail - confirmed AI report readings', narration: N.readings,
  action: async () => {
    const h = main().getByText('Report readings (confirmed by the patient)');
    await h.scrollIntoViewIfNeeded();
    await d.wait(300);
    await d.scroll(160);
    await snap('case-report-readings');
    await d.scroll(520);
    await d.hover(main().getByText('Edited by patient').first());
  } });
await d.scene({ title: 'Case detail - medical documents', narration: N.docs, shot: 'case-documents',
  action: async () => {
    const h = main().getByRole('heading', { name: 'Medical documents' });
    await h.scrollIntoViewIfNeeded();
    await d.scroll(-120);
    await d.hover(main().getByRole('button', { name: /^Download /i }).first());
  } });
await d.scene({ title: 'Decline enquiry dialog (cancelled)', narration: N.decline,
  action: async () => {
    await d.scrollTop();
    await d.click(main().getByRole('button', { name: /^Decline$/ }).first(), { settle: false });
    await d.wait(900);
    await snap('case-decline-dialog');
    await d.wait(1800);
    await cancelDialog();
  }, shotWhen: 'none' });
await d.scene({ title: 'Quote builder - itemised quote', narration: N.quoteOpen, shot: 'quote-builder',
  action: async () => {
    await d.click(main().getByRole('button', { name: /^Send quote$/ }).first(), { settle: false });
    await d.wait(900);
  } });
await d.say(N.quotePlan, async () => {
  const m = dialog();
  await typeLong(m.getByLabel(/treatment plan/i), 'Transcatheter aortic valve implantation (TAVI) by Dr. Arvind Khanna after a heart-team review; surgical valve replacement if anatomy is unsuitable. 2 nights ICU, 4 nights ward, cardiac rehab before discharge.');
  await d.type(m.getByLabel(/estimated stay/i), '8', 120);
  await d.hover(m.getByLabel(/valid until/i));
});
await d.say(N.quoteLines, async () => {
  const m = dialog();
  const amounts = ['420000', '110000', '45000', '30000'];
  for (let i = 0; i < amounts.length; i++) { const a = m.getByPlaceholder(/^Amount/).nth(i); await d.click(a, { settle: false }); await a.fill(amounts[i]); }
  await d.click(m.getByRole('button', { name: /add item/i }), { settle: false });
  await d.wait(300);
  const rows = m.getByPlaceholder('Description');
  const last = (await rows.count()) - 1;
  await m.locator('select').nth(1 + last).selectOption('implants').catch(() => {});
  await typeLong(rows.nth(last), 'Self-expanding transcatheter aortic valve', 16);
  await d.click(m.getByPlaceholder(/^Amount/).nth(last), { settle: false }); await m.getByPlaceholder(/^Amount/).nth(last).fill('1650000');
  await d.hover(m.getByRole('button', { name: /^Send quote ·/ }));
  await snap('quote-builder-filled');
});
await d.scene({ title: 'Quote sent - case moves to Quoted', narration: N.quoteSent, shot: 'case-quoted',
  action: async () => {
    if (DRY) await cancelDialog();
    else await d.click(dialog().getByRole('button', { name: /^Send quote ·/ }), { settle: false });
    await d.wait(1800);
    await d.settle(400);
    const q = main().getByRole('heading', { name: 'Quotes' });
    await q.scrollIntoViewIfNeeded().catch(() => {});
    await d.scroll(200);
  } });

// ---- bookings ------------------------------------------------------------------------------------------------------
await d.scene({ title: 'Bookings - list with status tabs', nav: ['Patients', 'Bookings', `${H}/bookings`], narration: N.bookings, shot: 'bookings-list', shotWhen: 'before',
  action: async () => { await d.hover(main().getByText(/^Confirmed/).first()); await d.hover(main().getByText(/^Discharged/).first()); } });
await d.scene({ title: 'Bookings - search', narration: N.bookingsSearch, shot: 'bookings-search',
  action: async () => { await d.type(main().getByRole('searchbox').or(main().locator('input[type=search]')).first(), 'Adeyemi', 110); await d.settle(400); } });
await d.scene({ title: 'Bookings - admissions calendar', narration: N.calendar, shot: 'bookings-calendar',
  action: async () => {
    await d.goto(`${H}/bookings?view=calendar`);
    await d.wait(600);
    await d.click(main().getByRole('button', { name: /next month/i }).first());
  } });
await d.scene({ title: 'Booking detail - treatment & payment', go: `${H}/bookings/${BOOKING_CONFIRMED}`, narration: N.bookingDetail, shot: 'booking-detail', shotWhen: 'before',
  action: async () => { await d.hover(main().getByText('Deposit paid').first()); } });
await d.scene({ title: 'Booking detail - admit dialog (cancelled); discharge action', narration: N.admit, shotWhen: 'none',
  action: async () => {
    await d.click(main().getByRole('button', { name: /^Admit patient$/ }), { settle: false });
    await d.wait(900);
    await snap('booking-admit-dialog');
    await d.wait(2500);
    await cancelDialog();
  } });
await d.scene({ title: 'Booking detail - itinerary', narration: N.itinerary, shot: 'booking-itinerary',
  action: async () => {
    await main().getByRole('heading', { name: 'Itinerary' }).scrollIntoViewIfNeeded();
    await d.click(main().getByRole('button', { name: /^Add item$/ }), { settle: false });
    await d.wait(1200);
    await snap('itinerary-add-dialog');
    await d.wait(1200);
    await cancelDialog();
  } });
await d.scene({ title: 'Booking detail - visa invitation letter & transfers', narration: N.visa, shot: 'booking-visa',
  action: async () => {
    await d.moveTo(900, 600);
    await d.scroll(380);
    await d.hover(main().getByRole('button', { name: /upload invitation letter/i }).first());
    await d.scroll(300);
  } });
await d.scene({ title: 'Booking detail - completed (discharged) booking', go: `${H}/bookings/${BOOKING_COMPLETED}`, narration: N.completed, shot: 'booking-completed', shotWhen: 'before',
  action: async () => { await d.moveTo(900, 500); await d.scroll(450); } });

// ---- doctors & services ------------------------------------------------------------------------------------------
await d.scene({ title: 'Doctors - list with registration badges', nav: ['Doctors & services', 'Doctors', `${H}/doctors`], narration: N.doctors, shot: 'doctors', shotWhen: 'before',
  action: async () => { await d.hover(main().getByText('HMC/1999/17309').first()); await d.hover(main().getByText(/Haryana Medical Council/).nth(3)); } });
await d.scene({ title: 'Doctor form (cancelled)', narration: N.doctorForm, shotWhen: 'none',
  action: async () => {
    await d.click(main().getByRole('button', { name: `Edit Dr. Arvind Khanna` }).first(), { settle: false });
    await d.wait(1800);
    await snap('doctor-form');
    await d.moveTo(960, 640);
    await d.scroll(300);
    await cancelDialog();
  } });
await d.scene({ title: 'Doctor availability calendar', go: `${H}/doctors/${DOCTOR}/availability`, narration: N.availability, shot: 'doctor-availability', shotWhen: 'before',
  action: async () => { await d.moveTo(900, 520); await d.scroll(300); } });
await d.scene({ title: 'Procedures & pricing', nav: ['Doctors & services', 'Procedures & pricing', `${H}/procedures`], narration: N.procedures, shot: 'procedures', shotWhen: 'before',
  action: async () => { await d.hover(main().getByRole('columnheader', { name: /price range/i }).first()); } });
await d.scene({ title: 'Procedure drawer with packages', narration: N.packages, shot: 'procedure-packages',
  action: async () => {
    await d.click(main().getByText('Heart Valve Replacement / Repair', { exact: true }).first(), { settle: false });
    await d.wait(1500);
    await d.moveTo(1500, 600, 18);
    await d.scroll(350);
  } });
await p.keyboard.press('Escape');
await d.wait(400);

// ---- hospital ------------------------------------------------------------------------------------------------------
await d.scene({ title: 'Hospital profile - profile & contact', nav: ['Hospital', 'Hospital profile', `${H}/profile`], narration: N.profile, shot: 'hospital-profile', shotWhen: 'before',
  action: async () => { await d.moveTo(900, 600); await d.scroll(400); await d.scrollTop(); } });
await d.scene({ title: 'Hospital profile - accreditations', narration: N.accreditations, shot: 'hospital-accreditations',
  action: async () => { await d.click(tab(/^Accreditations/)); } });
await d.scene({ title: 'Hospital profile - KYC documents', narration: N.kyc, shot: 'hospital-kyc',
  action: async () => { await d.click(tab(/^KYC documents/)); await d.hover(main().getByRole('button', { name: /^Upload$/ }).first()); } });
await d.scene({ title: 'Team members', nav: ['Hospital', 'Team', `${H}/team`], narration: N.team, shot: 'team', shotWhen: 'before',
  action: async () => { await d.hover(main().getByRole('row').nth(1)); } });
await d.scene({ title: 'Invite team member dialog (cancelled)', narration: N.invite, shotWhen: 'none',
  action: async () => {
    await d.click(main().getByRole('button', { name: /^Invite member$/ }).first(), { settle: false });
    await d.wait(700);
    const m = dialog();
    await d.type(m.getByLabel(/full name/i), 'Dr. Ritu Mehra', 60);
    await d.type(m.getByLabel(/^email/i), 'ritu.mehra@sanjeevani.example', 40);
    await snap('team-invite-dialog');
    await cancelDialog();
  } });

// ---- reviews & finance -----------------------------------------------------------------------------------------
await d.scene({ title: 'Reviews', nav: ['Reviews & finance', 'Reviews', `${H}/reviews`], narration: N.reviews, shot: 'reviews', shotWhen: 'before',
  action: async () => { await d.moveTo(900, 500); await d.scroll(250); } });
await d.scene({ title: 'Finance - settlement items', nav: ['Reviews & finance', 'Finance', `${H}/finance`], narration: N.finance, shot: 'finance-settlement-items', shotWhen: 'before',
  action: async () => { await d.hover(main().getByRole('row').nth(1)); } });
await d.scene({ title: 'Finance - payouts', narration: N.payouts, shot: 'finance-payouts',
  action: async () => { await d.click(tab(/^Payouts$/)); } });
await d.scene({ title: 'Finance - statements with totals', narration: N.statements, shot: 'finance-statements',
  action: async () => { await d.click(tab(/^Statements$/)); } });
await d.scene({ title: 'Finance - payout account', narration: N.account, shot: 'finance-payout-account',
  action: async () => { await d.click(tab(/^Payout account$/)); } });

// ---- messages & alerts ---------------------------------------------------------------------------------------------
await d.scene({ title: 'Messages - case conversation', nav: ['Messages & alerts', 'Messages', `${H}/messages`], narration: N.messages, shot: 'messages',
  action: async () => {
    await d.click(main().getByRole('button', { name: new RegExp(caseNumber) }).first());
    const box = main().getByPlaceholder(/write a message/i);
    await typeLong(box, 'Dear Mr. Al-Rawahi, thank you for your reports. Dr. Khanna has reviewed your echo and we have sent you a quote for TAVI. Happy to arrange a video consultation this week.');
    if (DRY) await d.hover(main().getByRole('button', { name: 'Send message' }));
    else await d.click(main().getByRole('button', { name: 'Send message' }), { settle: false });
    await d.wait(1200);
  } });
await d.scene({ title: 'Notifications', narration: N.notifications,
  action: async () => {
    if (!(await d.tryClick(p.locator('aside nav, nav[aria-label]').first().getByRole('link', { name: /^Notifications/ }).first()))) await d.goto(`${H}/notifications`);
    await snap('notifications'); await d.click(tab(/^Unread/)); await d.wait(600); await d.click(tab(/^All/)); } });

// ---- shell: hospital switcher, sidebar, dark mode -------------------------------------------------------------------
await d.scene({ title: 'Top bar - active hospital (switcher appears with 2+ hospitals)', go: `${H}/`, narration: N.switcher,
  action: async () => { await d.hover(p.getByRole('banner').getByText('Sanjeevani Heart & Multispeciality Institute').first().or(p.getByText('Sanjeevani Heart & Multispeciality Institute').first())); } });
await d.scene({ title: 'Sidebar collapse / expand', narration: N.collapse, shotWhen: 'none',
  action: async () => {
    await d.click(p.getByRole('button', { name: /collapse sidebar/i }).first(), { settle: false });
    await d.wait(1200);
    await snap('sidebar-collapsed');
    await d.click(p.getByRole('button', { name: /expand sidebar/i }).first(), { settle: false });
    await d.wait(600);
  } });
await d.scene({ title: 'Dark mode toggle', narration: N.dark, shotWhen: 'none',
  action: async () => {
    await d.click(p.getByRole('button', { name: /toggle dark mode/i }).first(), { settle: false });
    await d.wait(1500);
    await snap('dark-mode');
    await d.click(p.getByRole('button', { name: /toggle dark mode/i }).first(), { settle: false });
  } });

await d.outro(N.outro);
d.cuts.push(...gapCuts(d.timeline));
const info = await d.finish();
{
  // sanity check: the WebM must cover the whole wall-clock session, otherwise narration drifts out of sync
  const { probeDuration } = await import('./lib/recorder.mjs');
  const fs = await import('node:fs');
  const raw = JSON.parse(fs.readFileSync(path.join(d.rawDir, 'session.json'), 'utf8'));
  const webmDur = probeDuration(raw.webm);
  if (Math.abs(webmDur - raw.tEnd) > 3) console.error(`SYNC WARNING: WebM ${webmDur.toFixed(1)} s vs session ${raw.tEnd.toFixed(1)} s`);
  else console.log(`sync ok: WebM ${webmDur.toFixed(1)} s, session ${raw.tEnd.toFixed(1)} s`);
}
console.log(JSON.stringify({ duration: info.durationText, size: info.size, warnings: info.warnings }, null, 2));
