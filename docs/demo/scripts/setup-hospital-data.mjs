// Demo data for the hospital walkthrough video: a fresh, realistic cardiology enquiry at Sanjeevani (Gurugram)
// from patient Hamed Al-Rawahi (Oman) with a completed AI screening, an uploaded echocardiography report and
// patient-confirmed report readings. Idempotent: reuses an open enquiry it created earlier (no quote yet).
// Usage: node docs/demo/scripts/setup-hospital-data.mjs   -> prints {"caseId": "..."} on the last line.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const require = createRequire(path.join(REPO, 'web', 'package.json'));
const API = process.env.DEMO_API ?? 'http://127.0.0.1:8000/api/v1';
const PASSWORD = 'HealIndia@2026';
const PATIENT = 'patient.om@healindia.example';
const SLUG = 'sanjeevani-gurugram';
const MARKER = 'Breathless on exertion for about eight months';

async function call(token, method, url, body, headers = {}) {
  const isForm = body instanceof FormData;
  const req = () => fetch(API + url, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body && !isForm ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  // a keep-alive socket closed by the server while spawnSync blocked the event loop -> one retry
  const res = await req().catch(async (e) => { if (method !== 'GET') throw e; await sleep(500); return req(); });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}
const login = async (email) => (await call(null, 'POST', '/auth/login', { email, password: PASSWORD })).access_token;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function echoPdf() {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(`<html><body style="font-family:Arial;margin:40px;color:#111">
    <h2 style="margin:0">Royal Muscat Cardiac Centre</h2><div>Department of Cardiology - Echocardiography Laboratory</div><hr/>
    <h3>Transthoracic Echocardiogram Report</h3>
    <p><b>Patient:</b> Hamed Al-Rawahi &nbsp; <b>Age/Sex:</b> 58 / M &nbsp; <b>Date:</b> 02 Oct 2026</p>
    <p><b>Referring physician:</b> Dr. Salim Al-Harthy</p>
    <h4>Findings</h4><ul>
      <li>Severe calcific aortic stenosis. Peak velocity 4.6 m/s, mean gradient 48 mmHg, aortic valve area 0.8 cm2.</li>
      <li>Concentric left ventricular hypertrophy. LV ejection fraction 50% (mildly reduced).</li>
      <li>Mild mitral regurgitation. No pericardial effusion.</li>
      <li>Estimated pulmonary artery systolic pressure 38 mmHg.</li></ul>
    <h4>Laboratory (01 Oct 2026)</h4>
    <table border="1" cellpadding="4" style="border-collapse:collapse"><tr><th>Test</th><th>Result</th><th>Reference</th></tr>
      <tr><td>Haemoglobin</td><td>13.4 g/dL</td><td>13.0-17.0</td></tr>
      <tr><td>Serum creatinine</td><td>1.1 mg/dL</td><td>0.7-1.3</td></tr>
      <tr><td>HbA1c</td><td>7.2 %</td><td>&lt; 5.7</td></tr>
      <tr><td>NT-proBNP</td><td>1,240 pg/mL</td><td>&lt; 125</td></tr></table>
    <h4>Impression</h4><p>Severe symptomatic aortic stenosis. Recommend evaluation for aortic valve replacement (surgical or TAVI).</p>
    <p><b>Current medication:</b> Metformin 500 mg twice daily; Atorvastatin 20 mg at night; Aspirin 75 mg daily.</p>
  </body></html>`);
  const pdf = await page.pdf({ format: 'A4' });
  await browser.close();
  return pdf;
}

async function main() {
  const patient = await login(PATIENT);
  const hospital = await call(null, 'GET', `/hospitals/${SLUG}`);
  const proc = hospital.procedures.find((p) => p.procedure.slug === 'heart-valve-replacement') ?? hospital.procedures[0];
  const doctor = hospital.doctors.find((d) => /Arvind Khanna/.test(d.full_name ?? d.name)) ?? hospital.doctors[0];

  const mine = await call(patient, 'GET', '/cases?page_size=100');
  const existing = mine.items.find(
    (c) => c.status === 'enquiry' && (c.hospital?.id ?? c.hospital_id) === hospital.id && (c.patient_notes ?? '').startsWith(MARKER),
  );
  if (existing && !process.argv.includes('--new')) {
    console.log(JSON.stringify({ caseId: existing.id, caseNumber: existing.case_number, reused: true }));
    return;
  }

  // 1. Screening with the report attached
  const pdf = await echoPdf();
  const fd = new FormData();
  fd.append('file', new Blob([pdf], { type: 'application/pdf' }), 'Echocardiogram-Hamed-Al-Rawahi.pdf');
  fd.append('kind', 'medical_report');
  const doc = await call(patient, 'POST', '/documents', fd);
  const scr = await call(patient, 'POST', '/screenings', { specialty_slug: 'cardiology' });
  await call(patient, 'PATCH', `/screenings/${scr.id}`, {
    body_areas: ['chest'],
    pain_intensity: 4,
    symptoms: [
      { name: 'Shortness of breath', answer: 'yes' },
      { name: 'Chest tightness on exertion', answer: 'yes' },
      { name: 'Dizziness', answer: 'maybe' },
      { name: 'Fainting', answer: 'no' },
    ],
    duration_value: 8,
    duration_unit: 'months',
    severity: { work: 'moderate', sleep: 'mild', mobility: 'moderate' },
    previous_treatments: ['medication'],
    notes: 'Diagnosed with severe aortic stenosis in Muscat. Type 2 diabetes, well controlled.',
    preferences: { languages: ['English', 'Arabic'], budget_min_minor: 1200000, budget_max_minor: 2000000, budget_currency: 'USD' },
    report_document_ids: [doc.id],
    home_country: 'OM',
  });
  await call(patient, 'POST', `/screenings/${scr.id}/submit`, { consent_ai: true });

  // 2. Enquiry to the hospital
  const c = await call(patient, 'POST', '/cases', {
    hospital_id: hospital.id,
    doctor_id: doctor.id,
    procedure_id: proc.procedure.id,
    screening_id: scr.id,
    patient_notes:
      `${MARKER}; my echo in Muscat shows severe aortic stenosis. ` +
      'I would like Dr. Arvind Khanna to advise whether TAVI or surgical valve replacement suits me, and the total cost. ' +
      'Travelling with my son in late November.',
    consent_share: true,
  });
  const caseDoc = new FormData();
  caseDoc.append('file', new Blob([pdf], { type: 'application/pdf' }), 'Echocardiogram-Hamed-Al-Rawahi.pdf');
  caseDoc.append('kind', 'medical_report');
  caseDoc.append('case_id', c.id);
  const cdoc = await call(patient, 'POST', '/documents', caseDoc).catch((e) => (console.error('case doc upload:', e.message), null));

  // 3. AI report reading, confirmed by the patient (with the readings the patient checked)
  let analysis = await call(patient, 'POST', '/documents/analyses', { document_ids: [cdoc?.id ?? doc.id], case_id: c.id, consent_ai: true });
  analysis = Array.isArray(analysis) ? analysis[0] : (analysis.items?.[0] ?? analysis);
  for (let i = 0; i < 60 && ['queued', 'processing'].includes(analysis.status); i++) {
    await sleep(3000);
    analysis = await call(patient, 'GET', `/documents/analyses/${analysis.id}`);
  }
  console.error('analysis status:', analysis.status);
  if (analysis.status === 'failed') {
    // AI is not configured in this local stack: replay a fixed AI reading through the real pipeline.
    const py = path.join(REPO, 'backend', '.venv', 'Scripts', 'python.exe');
    const r = spawnSync(py, [path.join(HERE, 'fill-demo-analysis.py'), analysis.id], { cwd: path.join(REPO, 'backend'), encoding: 'utf8' });
    console.error('fill-demo-analysis:', (r.stdout || r.stderr || '').trim().split('\n').pop());
    analysis = await call(patient, 'GET', `/documents/analyses/${analysis.id}`);
  }
  if (analysis.status === 'completed') {
    // The patient checks the reading and corrects one medication frequency (shown as an edited value).
    await call(patient, 'POST', `/documents/analyses/${analysis.id}/confirm`, {
      medications: [
        { name: 'Metformin', dose: '500 mg', frequency: 'Twice daily' },
        { name: 'Atorvastatin', dose: '20 mg', frequency: 'Once daily at night' },
        { name: 'Aspirin', dose: '75 mg', frequency: 'Once daily' },
      ],
    });
  }
  console.log(JSON.stringify({ caseId: c.id, caseNumber: c.case_number, analysis: analysis.status }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
