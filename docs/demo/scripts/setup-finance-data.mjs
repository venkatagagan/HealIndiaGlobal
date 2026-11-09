// Demo data for the finance part of the staff-console walkthrough (docs/demo/scripts/record-staff-finance.mjs).
//
// Everything is created through the real API (patients register, hospitals quote, patients pay with the mock gateway or
// by bank transfer, hospitals admit/discharge, finance1 = maker, finance2 = checker). Only "time passing" is
// simulated with finance_timetravel.py (a hospital stay in the past + the settlement hold period elapsed + the daily
// auto-batch job), because the API rightly refuses to discharge before the admission date.
//
//   source scripts/env.sh && node docs/demo/scripts/setup-finance-data.mjs          # full scenario (idempotent, resumable)
//   node docs/demo/scripts/setup-finance-data.mjs --live                             # fresh records for the live steps only
//
// State: docs/demo/.cache/finance-setup.json (ids of everything created).
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const API = process.env.DEMO_API_URL ?? 'http://127.0.0.1:8000/api/v1';
const PASSWORD = 'HealIndia@2026';
const D = '@healindia.example';
const STATE_FILE = path.join(REPO, 'docs', 'demo', '.cache', 'finance-setup.json');
const TT = path.join(HERE, 'finance_timetravel.py');
const PY = path.join(REPO, 'backend', '.venv', 'Scripts', 'python.exe');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = (d = 0) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
const log = (...a) => console.log('[finance-setup]', ...a);

const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : {};
const save = () => { fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true }); fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)); };

// ------------------------------------------------------------------------------------------------- HTTP
const tokens = new Map();
async function http(method, p, { token, body, headers = {}, form } = {}) {
  for (let i = 0; i < 30; i++) {
    const h = { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers };
    if (!form) h['content-type'] = 'application/json';
    const r = await fetch(API + p, { method, headers: h, body: form ?? (body !== undefined ? JSON.stringify(body) : undefined) });
    const text = await r.text();
    let j; try { j = JSON.parse(text); } catch { j = text; }
    if (r.status === 429) { await sleep(12_000); continue; }
    if (!r.ok) { const e = new Error(`${method} ${p} -> ${r.status} ${text.slice(0, 400)}`); e.status = r.status; e.body = j; throw e; }
    return j;
  }
  throw new Error(`${method} ${p}: rate limited`);
}
async function login(email) {
  const c = tokens.get(email);
  if (c && c.exp > Date.now()) return c;
  const staff = /^(finance\d|admin|superadmin|support)@/.test(email);
  const t = await http('POST', staff ? '/auth/staff/login' : '/auth/login', { body: { email, password: PASSWORD } });
  const v = { token: t.access_token, user: t.user, exp: Date.now() + 12 * 60_000 };
  tokens.set(email, v);
  return v;
}
function client(email, extraHeaders = {}) {
  const go = async (method, p, body, headers) => http(method, p, { token: (await login(email)).token, body, headers: { ...extraHeaders, ...headers } });
  return {
    email,
    get: (p) => go('GET', p),
    post: (p, body = {}, headers) => go('POST', p, body, headers),
    put: (p, body = {}) => go('PUT', p, body),
    async upload(p, fields, file) {
      const fd = new FormData();
      for (const [k, v] of Object.entries(fields)) fd.append(k, v);
      fd.append('file', new Blob([file.buffer], { type: file.mimeType }), file.name);
      return http('POST', p, { token: (await login(email)).token, form: fd });
    },
    me: async () => (await login(email)).user,
  };
}
const F1 = client(`finance1${D}`);
const F2 = client(`finance2${D}`);
async function owner(slug) {
  const u = (await login(`owner.${slug}${D}`)).user;
  const h = u.hospitals?.find((x) => x.slug === slug) ?? u.hospitals?.[0];
  return client(`owner.${slug}${D}`, h ? { 'X-Hospital-Id': h.id } : {});
}
const items = (p) => (Array.isArray(p) ? p : p?.items ?? []);
async function poll(fn, what, ms = 60_000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timeout waiting for ${what}`);
    await sleep(1500);
  }
}
function timetravel(...args) {
  const out = execFileSync(PY, [TT, ...args], { cwd: path.join(REPO, 'backend'), encoding: 'utf8' });
  log('timetravel', args.join(' '), '->', out.trim());
  return out;
}

// ------------------------------------------------------------------------------------------------- people & bookings
const PATIENTS = {
  ahmed: { name: 'Ahmed Al-Balushi', cc: 'OM' },
  fatima: { name: 'Fatima Rahman', cc: 'BD' },
  daniel: { name: 'Daniel Kowalski', cc: 'US' },
  grace: { name: 'Grace Okafor', cc: 'NG', referral: 'AGTLAGS2' }, // referred by agent.lagos -> agent commission
  thomas: { name: 'Thomas Wright', cc: 'GB' },
  sarah: { name: 'Sarah Mitchell', cc: 'US' },
  mariam: { name: 'Mariam Yusuf', cc: 'KE' },
  amara: { name: 'Amara Mensah', cc: 'GH' },
  liam: { name: "Liam O'Connor", cc: 'IE' },
  elena: { name: 'Elena Petrova', cc: 'GE' },
  noah: { name: 'Noah Bennett', cc: 'CA' },
  priya: { name: 'Priya Nair', cc: 'AE' },
};
async function patient(key) {
  const p = PATIENTS[key];
  const email = `${p.name.toLowerCase().replace(/[^a-z]+/g, '.')}.demo${D}`;
  state.patients ??= {};
  if (!state.patients[key]) {
    try {
      await http('POST', '/auth/register', {
        body: { email, password: PASSWORD, full_name: p.name, role: 'patient', country_code: p.cc, accept_terms: true, ...(p.referral ? { referral_code: p.referral } : {}) },
      });
    } catch (e) {
      if (e.status !== 409 && !/already|exists|taken/i.test(e.message)) throw e;
    }
    state.patients[key] = email;
    save();
  }
  return client(email);
}

const LINES = {
  ortho: [
    { category: 'surgery', description: 'ACL reconstruction (arthroscopic) incl. OT, implants and surgeon fees', amount_minor: 28_500_000 },
    { category: 'hospital_stay', description: '3 nights, private room', amount_minor: 3_600_000 },
    { category: 'tests_scans', description: 'MRI knee and pre-operative work-up', amount_minor: 1_200_000 },
    { category: 'medications', description: 'Medications, physiotherapy and consumables', amount_minor: 900_000 },
  ],
  cardiac: [
    { category: 'surgery', description: 'Coronary artery bypass grafting (CABG) incl. OT and surgeon fees', amount_minor: 42_000_000 },
    { category: 'hospital_stay', description: '7 nights incl. 2 nights ICU', amount_minor: 9_800_000 },
    { category: 'tests_scans', description: 'Angiography, echo and pre-operative tests', amount_minor: 2_400_000 },
    { category: 'medications', description: 'Medications and consumables', amount_minor: 1_800_000 },
  ],
  spine: [
    { category: 'surgery', description: 'Artificial disc replacement (cervical) incl. implant', amount_minor: 36_000_000 },
    { category: 'hospital_stay', description: '4 nights, private room', amount_minor: 4_800_000 },
    { category: 'tests_scans', description: 'MRI spine and pre-operative tests', amount_minor: 1_500_000 },
    { category: 'medications', description: 'Medications and consumables', amount_minor: 1_100_000 },
  ],
  bariatric: [
    { category: 'surgery', description: 'Laparoscopic gastric bypass (Roux-en-Y) incl. staplers', amount_minor: 31_000_000 },
    { category: 'hospital_stay', description: '4 nights, private room', amount_minor: 4_400_000 },
    { category: 'tests_scans', description: 'Endoscopy, ultrasound and pre-operative tests', amount_minor: 1_400_000 },
    { category: 'medications', description: 'Medications and dietician sessions', amount_minor: 1_000_000 },
  ],
  knee: [
    { category: 'surgery', description: 'Bilateral total knee replacement incl. implants', amount_minor: 38_000_000 },
    { category: 'hospital_stay', description: '6 nights, private room', amount_minor: 6_600_000 },
    { category: 'tests_scans', description: 'X-rays and pre-operative tests', amount_minor: 1_100_000 },
    { category: 'medications', description: 'Medications, physiotherapy and consumables', amount_minor: 1_700_000 },
  ],
  oncology: [
    { category: 'surgery', description: 'Breast cancer surgery (modified radical mastectomy)', amount_minor: 29_000_000 },
    { category: 'hospital_stay', description: '4 nights, private room', amount_minor: 4_000_000 },
    { category: 'tests_scans', description: 'PET-CT, biopsy and histopathology', amount_minor: 3_200_000 },
    { category: 'medications', description: 'Medications and consumables', amount_minor: 1_300_000 },
  ],
  cosmetic: [
    { category: 'surgery', description: 'Abdominoplasty incl. OT and surgeon fees', amount_minor: 21_000_000 },
    { category: 'hospital_stay', description: '2 nights, private room', amount_minor: 2_400_000 },
    { category: 'tests_scans', description: 'Pre-operative tests', amount_minor: 600_000 },
    { category: 'medications', description: 'Compression garments, medications and consumables', amount_minor: 800_000 },
  ],
};

const SPECS = {
  C1: { patient: 'ahmed', slug: 'nandi-valley-bengaluru', proc: /disc replacement/i, lines: 'spine', option: 'full', note: 'Persistent neck pain with arm numbness for 8 months; MRI shows C5-C6 disc herniation.' },
  C2: { patient: 'fatima', slug: 'coromandel-chennai', proc: /bypass grafting|CABG/i, lines: 'cardiac', option: 'full', note: 'Triple-vessel disease on angiography; cardiologist advised bypass surgery.' },
  C3: { patient: 'daniel', slug: 'nandi-valley-bengaluru', proc: /ACL/i, lines: 'ortho', option: 'full', note: 'Torn ACL from a skiing accident in January; knee gives way on stairs.' },
  C4: { patient: 'grace', slug: 'vasundhara-hyderabad', proc: /gastric bypass/i, lines: 'bariatric', option: 'full', note: 'BMI 42 with type 2 diabetes; looking for bariatric surgery options.' },
  C5: { patient: 'thomas', slug: 'deccan-crest-pune', proc: /ACL/i, lines: 'ortho', option: 'full', note: 'ACL tear (football), seeking reconstruction with a short stay.' },
  P1: { patient: 'sarah', slug: 'shubh-arogya-ahmedabad', proc: /knee replacement/i, lines: 'knee', option: 'deposit', note: 'Severe osteoarthritis in both knees; walking under 200 metres.' },
  P2: { patient: 'mariam', slug: 'lotus-crest-new-delhi', proc: /breast cancer/i, lines: 'oncology', option: 'deposit', note: 'Biopsy-confirmed breast cancer, stage II; second opinion and surgery.' },
  P3: { patient: 'amara', slug: 'hooghly-valley-kolkata', proc: /breast cancer/i, lines: 'oncology', option: 'deposit', note: 'Recently diagnosed; prefers surgery in India for cost reasons.' },
  R1: { patient: 'liam', slug: 'ratnakar-bay-mumbai', proc: /abdominoplasty/i, lines: 'cosmetic', option: 'full', note: 'Abdominoplasty after major weight loss; would like a quote.' },
  // fresh records for the live steps (created again with --live)
  C6: { patient: 'noah', slug: 'ratnakar-bay-mumbai', proc: /ACL/i, lines: 'ortho', option: 'full', note: 'ACL rupture during a rugby match; wants surgery before the new season.' },
  L1: { patient: 'elena', slug: 'shubh-arogya-ahmedabad', proc: /knee replacement/i, lines: 'knee', option: 'deposit', note: 'Right knee osteoarthritis, failed injections; considering replacement.' },
  L2: { patient: 'priya', slug: 'deccan-crest-pune', proc: /ACL/i, lines: 'ortho', option: 'full', note: 'ACL rupture during a rugby match; wants surgery before the new season.' },
};

async function admissionDate(hospital, doctorId, minDays) {
  const pth = doctorId ? `/doctors/${doctorId}/availability` : `/hospitals/${hospital.id}/availability`;
  try {
    const days = items(await http('GET', `${pth}?from=${today(minDays)}&to=${today(minDays + 60)}`));
    const free = days.filter((d) => d.slot_kind === 'admission' && (d.available ?? d.capacity - d.booked) > 0).map((d) => d.date).sort();
    if (free.length) return free[Math.floor(Math.random() * Math.min(free.length, 8))];
  } catch { /* fall through */ }
  return today(minDays + 16);
}

/** enquiry -> quote -> accept -> booking (pending_payment). Resumable per spec key. */
async function booking(key, { fresh = false } = {}) {
  const spec = SPECS[key];
  state.bookings ??= {};
  if (state.bookings[key]?.booking_id && !fresh) return state.bookings[key];
  const pc = await patient(spec.patient);
  const hospital = await http('GET', `/hospitals/${spec.slug}`);
  const hp = hospital.procedures.find((p) => spec.proc.test(p.procedure.name)) ?? hospital.procedures[0];
  const doctor = hospital.doctors.find((d) => (hp.doctor_ids ?? []).includes(d.id)) ?? hospital.doctors[0];
  const cs = await pc.post('/cases', { hospital_id: hospital.id, doctor_id: doctor.id, procedure_id: hp.procedure.id, patient_notes: spec.note, consent_share: true });
  const own = await owner(spec.slug);
  const quote = await own.post(`/cases/${cs.id}/quotes`, {
    treatment_plan: `Consultation with ${doctor.full_name}, ${hp.procedure.name.toLowerCase()}, inpatient stay and physiotherapy before discharge.`,
    line_items: LINES[spec.lines], currency: 'INR', estimated_stay_days: 7, valid_until: today(30),
  });
  await pc.post(`/cases/${cs.id}/quotes/${quote.id}/accept`, {});
  let b = null;
  for (let attempt = 0; attempt < 4 && !b; attempt++) {
    try {
      b = await pc.post('/bookings', { case_id: cs.id, quote_id: quote.id, admission_date: await admissionDate(hospital, doctor.id, 14 + attempt * 9), payment_option: spec.option });
    } catch (e) { if (!/date_unavailable/.test(e.message) || attempt === 3) throw e; }
  }
  state.bookings[key] = { case_id: cs.id, booking_id: b.id, booking_number: b.booking_number, hospital_id: hospital.id, slug: spec.slug, patient: PATIENTS[spec.patient].name };
  save();
  log(key, 'booking', b.booking_number, spec.slug, PATIENTS[spec.patient].name);
  return state.bookings[key];
}

async function payMock(key) {
  const s = state.bookings[key];
  if (s.paid) return s;
  const pc = client(state.patients[SPECS[key].patient]);
  const purpose = SPECS[key].option === 'full' ? 'booking_full' : 'booking_deposit';
  const co = await pc.post('/payments/orders', { booking_id: s.booking_id, purpose, gateway: 'mock', currency: 'USD' }, { 'Idempotency-Key': crypto.randomUUID() });
  await pc.post(`/payments/mock/${co.order.id}/complete`, { outcome: 'success' });
  await poll(async () => (await pc.get(`/bookings/${s.booking_id}`)).status === 'confirmed', `${key} confirmed`, 60_000);
  s.order_id = co.order.id; s.order_number = co.order.order_number; s.paid = true; save();
  log(key, 'paid', co.order.order_number);
  return s;
}

/** Bank-transfer checkout (+ optional proof upload by the patient). */
async function bankTransfer(key, { proof = true } = {}) {
  const s = state.bookings[key];
  if (s.bt_order_id) return s;
  const pc = client(state.patients[SPECS[key].patient]);
  const co = await pc.post('/payments/orders', { booking_id: s.booking_id, purpose: 'booking_deposit', gateway: 'bank_transfer', currency: 'USD' }, { 'Idempotency-Key': crypto.randomUUID() });
  s.bt_order_id = co.order.id; s.bt_order_number = co.order.order_number; s.bt_amount_minor = co.order.amount_minor;
  if (proof) {
    const ref = `SWIFT${Math.floor(1e9 + Math.random() * 9e9)}`;
    const png = await receiptPng({ payer: s.patient, amount: co.order.amount_minor, currency: co.order.currency, ref, order: co.order.order_number });
    const doc = await pc.upload('/documents', { kind: 'payment_proof', case_id: s.case_id }, { name: `transfer-receipt-${co.order.order_number}.png`, mimeType: 'image/png', buffer: png });
    await pc.post(`/payments/orders/${co.order.id}/bank-transfer-proof`, { document_id: doc.id, reference: ref });
    s.bt_reference = ref;
  }
  save();
  log(key, 'bank transfer', co.order.order_number, proof ? `proof ${s.bt_reference}` : 'awaiting proof');
  return s;
}

/** A realistic bank transfer receipt image, rendered with Playwright from HTML. */
async function receiptPng({ payer, amount, currency, ref, order }) {
  const { createRequire } = await import('node:module');
  const require = createRequire(path.join(REPO, 'web', 'package.json'));
  process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.join(REPO, '.devtools', 'ms-playwright');
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 760, height: 900 } });
  const amt = (amount / 100).toLocaleString('en-US', { style: 'currency', currency });
  const when = new Date(Date.now() - 3600_000 * 20).toUTCString().replace('GMT', 'UTC');
  await page.setContent(`<html><body style="margin:0;font-family:Segoe UI,Arial;background:#f3f4f6">
  <div style="margin:30px;background:#fff;border-radius:14px;padding:34px;box-shadow:0 4px 18px rgba(0,0,0,.08)">
   <div style="display:flex;justify-content:space-between;align-items:center"><div style="font-size:26px;font-weight:700;color:#1e3a8a">First Atlantic Bank</div><div style="color:#16a34a;font-weight:700">COMPLETED</div></div>
   <div style="color:#6b7280;margin-top:4px">International wire transfer - customer copy</div><hr style="margin:22px 0;border:none;border-top:1px solid #e5e7eb">
   ${[['Transfer reference', ref], ['Date', when], ['Ordering customer', payer], ['Amount', amt], ['Charges', 'OUR (paid by sender)'],
     ['Beneficiary', 'Heal India Global Private Limited'], ['Beneficiary bank', 'Demo National Bank, Mumbai, India'], ['Account', 'XXXXXXXX4021'],
     ['SWIFT / BIC', 'DNBKINBBXXX'], ['Payment details', `Booking deposit ${order}`]].map(([k, v]) => `<div style="display:flex;padding:9px 0;border-bottom:1px solid #f1f5f9"><div style="width:230px;color:#6b7280">${k}</div><div style="font-weight:600;color:#111827">${v}</div></div>`).join('')}
   <div style="margin-top:26px;color:#9ca3af;font-size:12px">This is a system-generated advice and does not require a signature.</div></div></body></html>`);
  const buf = await page.screenshot({ fullPage: true });
  await browser.close();
  return buf;
}

async function admitAndComplete(key) {
  const s = state.bookings[key];
  if (s.completed) return s;
  const own = await owner(s.slug);
  let b = await own.get(`/bookings/${s.booking_id}`);
  if (b.status === 'confirmed') b = await own.post(`/bookings/${s.booking_id}/admit`, { note: 'Patient admitted; pre-operative assessment done.' });
  timetravel('stay', s.booking_id, '6'); // the stay happened last week (admission_date = today - 6)
  await own.post(`/bookings/${s.booking_id}/complete`, { discharge_date: today(-1), note: 'Discharged in stable condition; follow-up by video in 2 weeks.' });
  s.completed = true; save();
  log(key, 'completed');
  return s;
}

async function itemsOf(bookingId, { payeeType, minCount = 1, negative = false } = {}) {
  return poll(async () => {
    const page = await F1.get(`/finance/settlements/items?page_size=100&booking_id=${bookingId}`);
    const mine = items(page).filter((i) => i.booking_id === bookingId && (!payeeType || i.payee_type === payeeType) && (negative ? i.net_minor < 0 : true));
    return mine.length >= minCount ? mine : null;
  }, `settlement items of ${bookingId}`, 90_000);
}

async function batchFlow({ key, payeeType, payeeId, notes, method, approve = true, process = true }) {
  state.batches ??= {};
  if (state.batches[key]?.done) return state.batches[key];
  let st = state.batches[key];
  if (!st) {
    const b = await F1.post('/finance/settlements/batches', { payee_type: payeeType, ...(payeeId ? { payee_id: payeeId } : {}), notes });
    st = state.batches[key] = { id: b.id, number: b.batch_number };
    save();
    log('batch', key, b.batch_number, b.items_count, 'items');
  }
  let b = await F2.get(`/finance/settlements/batches/${st.id}`);
  if (approve && b.status === 'pending_approval') b = await F2.post(`/finance/settlements/batches/${st.id}/approve`, { notes: 'Checked items against discharge summaries and bank details.' });
  if (process && b.status === 'approved') b = await F2.post(`/finance/settlements/batches/${st.id}/process`, { method });
  if (process) b = await poll(async () => { const x = await F2.get(`/finance/settlements/batches/${st.id}`); return (x.payouts ?? []).length ? x : null; }, `payouts of ${st.number}`);
  st.payouts = (b.payouts ?? []).map((p) => ({ id: p.id, payee: p.payee_name, status: p.status, amount_minor: p.amount_minor }));
  st.done = true; save();
  return st;
}
const utr = () => `UTIBR${today().replace(/-/g, '').slice(2)}${Math.floor(1e5 + Math.random() * 9e5)}`;

// ------------------------------------------------------------------------------------------------- scenario
async function full() {
  // bookings, payments, completed stays
  for (const k of ['C1', 'C2', 'C3', 'C4', 'C5']) { await booking(k); await payMock(k); await admitAndComplete(k); }
  for (const k of ['C1', 'C2', 'C3', 'C4', 'C5']) {
    const s = state.bookings[k];
    s.items ??= (await itemsOf(s.booking_id)).map((i) => ({ id: i.id, payee_type: i.payee_type, payee_id: i.payee_id, net: i.net_minor }));
    save();
  }
  const hosp = (k) => state.bookings[k].items.find((i) => i.payee_type === 'hospital');
  const agentItem = state.bookings.C4.items.find((i) => i.payee_type === 'agent');
  if (!agentItem) log('WARN: no agent item for C4 (referral not linked?)');

  // S1: weekly hospital batch (C1 + C2): finance1 maker, finance2 checker, manual bank transfers with UTRs
  if (!state.batches?.S1) timetravel('eligible', hosp('C1').id, hosp('C2').id);
  const s1 = await batchFlow({ key: 'S1', payeeType: 'hospital', notes: 'Weekly hospital settlement - completed stays (week 42)', method: 'manual_bank_transfer' });
  if (!state.s1utr) {
    const nandi = s1.payouts.find((p) => /Nandi/.test(p.payee));
    const coro = s1.payouts.find((p) => /Coromandel/.test(p.payee));
    const u1 = utr();
    await F1.post(`/finance/settlements/payouts/${nandi.id}/mark-paid`, { utr: u1 });
    const po = await F2.get(`/finance/settlements/payouts/${nandi.id}`);
    await F2.post(`/finance/settlements/payouts/${nandi.id}/mark-paid/approve`, { request_id: po.paid_request_id, reference: po.utr, amount_minor: po.amount_minor });
    await F1.post(`/finance/settlements/payouts/${coro.id}/mark-paid`, { utr: utr() });
    state.s1utr = true; save();
    log('S1 payouts: Nandi confirmed, Coromandel awaiting confirmation');
  }

  // S2: refund after completion on C1 (clawback) + C3 -> second Nandi batch => commission invoice + credit note
  if (!state.c1refund) {
    const s = state.bookings.C1;
    const r = await F1.post('/payments/refunds', { order_id: s.order_id, amount_minor: 22_000, reason: 'Physiotherapy package not used - partial refund agreed with the hospital' });
    await F1.post(`/payments/refunds/${r.id}/approve`, {});
    state.c1refund = r.id; save();
    log('C1 refund (after completion)', r.id);
  }
  if (!state.batches?.S2) {
    await itemsOf(state.bookings.C1.booking_id, { negative: true }); // clawback item
    timetravel('eligible', hosp('C3').id);
  }
  await batchFlow({ key: 'S2', payeeType: 'hospital', payeeId: hosp('C3').payee_id, notes: 'Nandi Valley - ACL stay plus refund clawback', method: 'mock' });

  // S3: agent commission batch, paid, then the bank returned it -> reversal pending (finance1 requested)
  if (agentItem) {
    if (!state.batches?.S3) timetravel('eligible', agentItem.id);
    const s3 = await batchFlow({ key: 'S3', payeeType: 'agent', notes: 'Agent commissions - October', method: 'mock' });
    if (!state.s3reversal) {
      await F1.post(`/finance/settlements/payouts/${s3.payouts[0].id}/mark-failed`, { reason: 'Beneficiary bank returned the transfer: account name mismatch', reference: `RTN${Math.floor(1e7 + Math.random() * 9e7)}` });
      state.s3reversal = true; save();
    }
  }

  // S4: daily auto-batch job for Vasundhara (system batch awaiting approval)
  if (!state.autoBatch) { timetravel('eligible', hosp('C4').id); timetravel('auto-batch'); state.autoBatch = true; save(); }

  // S5: platform GSTIN configured (finance setting), then a Mumbai stay settled -> intra-state CGST+SGST invoice
  if (!state.gstin) {
    await F1.put('/admin/settings/platform_gstin', { value: '27AAHCH4821M1ZQ' });
    await F1.put('/admin/settings/platform_gst_state', { value: 'Maharashtra' });
    state.gstin = true; save();
  }
  await booking('C6'); await payMock('C6'); await admitAndComplete('C6');
  state.bookings.C6.items ??= (await itemsOf(state.bookings.C6.booking_id)).map((i) => ({ id: i.id, payee_type: i.payee_type, payee_id: i.payee_id, net: i.net_minor }));
  save();
  if (!state.batches?.S5) timetravel('eligible', hosp('C6').id);
  await batchFlow({ key: 'S5', payeeType: 'hospital', payeeId: hosp('C6').payee_id, notes: 'Ratnakar Bay - completed stay', method: 'mock' });

  // payments: bank transfers and refunds
  await booking('P2'); await bankTransfer('P2');
  await booking('P3'); await bankTransfer('P3', { proof: false });
  await booking('R1'); await payMock('R1');
  if (!state.r1refunds) {
    const s = state.bookings.R1;
    const small = await F1.post('/payments/refunds', { order_id: s.order_id, amount_minor: 15_000, reason: 'Second night not used - room charge refunded' });
    await F1.post(`/payments/refunds/${small.id}/approve`, {});
    const big = await F1.post('/payments/refunds', { order_id: s.order_id, amount_minor: 120_000, reason: 'Surgery date moved; implant package cancelled by the hospital' });
    try { await F1.post(`/payments/refunds/${big.id}/approve`, {}); } catch (e) { log('expected: maker cannot approve the large refund ->', e.status); }
    state.r1refunds = { small: small.id, big: big.id }; save();
  }

  // ledger adjustments: one posted (maker + checker), one awaiting approval
  if (!state.adjustments) {
    const a1 = await F1.post('/finance/ledger/adjustments', { kind: 'fx_difference', description: 'FX difference on USD receipts - September revaluation', external_reference: 'FX-2026-09', entries: [
      { account_code: 'PLATFORM:FX_GAIN_LOSS', direction: 'debit', amount_minor: 184_500 }, { account_code: 'PLATFORM:ADJUSTMENTS', direction: 'credit', amount_minor: 184_500 }] });
    await F2.post(`/finance/ledger/adjustments/${a1.id}/approve`, {});
    const a2 = await F1.post('/finance/ledger/adjustments', { kind: 'manual', description: 'Bank charges on inward remittances - October', external_reference: 'BANK-CHG-OCT', entries: [
      { account_code: 'PLATFORM:ADJUSTMENTS', direction: 'debit', amount_minor: 42_000 }, { account_code: 'PLATFORM:EQUITY', direction: 'credit', amount_minor: 42_000 }] });
    state.adjustments = { posted: a1.id, pending: a2.id }; save();
  }
  await live();
}

/** Records the recording changes live: a bank transfer with proof (mark-paid) and a settlement item on hold. */
async function live({ fresh = false } = {}) {
  const k1 = fresh ? 'L1' : 'P1';
  const k2 = fresh ? 'L2' : 'C5';
  await booking(k1); await bankTransfer(k1);
  if (fresh) {
    await booking(k2, { fresh: true }); await payMock(k2); await admitAndComplete(k2);
    state.bookings[k2].items = (await itemsOf(state.bookings[k2].booking_id)).map((i) => ({ id: i.id, payee_type: i.payee_type, payee_id: i.payee_id, net: i.net_minor }));
  }
  const s = state.bookings[k2];
  const item = s.items.find((i) => i.payee_type === 'hospital');
  const cur = await F1.get(`/finance/settlements/items/${item.id}`);
  if (cur.status === 'pending') timetravel('eligible', item.id);
  if (['pending', 'eligible'].includes((await F1.get(`/finance/settlements/items/${item.id}`)).status)) {
    await F1.post(`/finance/settlements/items/${item.id}/hold`, { reason: 'Awaiting the final itemised bill for the implant from the hospital' });
  }
  state.live = { order_id: state.bookings[k1].bt_order_id, order_number: state.bookings[k1].bt_order_number, reference: state.bookings[k1].bt_reference, amount_minor: state.bookings[k1].bt_amount_minor, patient: state.bookings[k1].patient, held_item: item.id, held_booking: s.booking_number, held_hospital: s.slug };
  save();
  log('live records ready', JSON.stringify(state.live));
}

if (process.argv.includes('--live')) {
  for (const k of ['L1', 'L2']) if (state.bookings?.[k]) delete state.bookings[k];
  await live({ fresh: true });
} else {
  await full();
}
log('done');
