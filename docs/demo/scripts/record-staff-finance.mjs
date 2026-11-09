// Staff console walkthrough - Part 2 · Finance (merged by the admin recording into docs/demo/staff/staff-walkthrough.mp4).
// Recorded from the real running admin portal (http://localhost:5176/gahi/) as finance1 (maker, Kavita Iyer); the
// two-person rule is shown by finance2 (checker, Sandeep Bhatia) signing in from a separate browser context.
//
//   source scripts/env.sh
//   node docs/demo/scripts/setup-finance-data.mjs          # once: populated payments / settlements / ledger
//   node docs/demo/scripts/setup-finance-data.mjs --live   # before a re-take: fresh bank transfer + held item
//   node docs/demo/scripts/record-staff-finance.mjs        # DEMO_DRY=1 = rehearsal (dialogs cancelled, nothing recorded)
//
// Outputs (written atomically): docs/demo/staff/parts/02-finance.mp4 (+ .srt, .vtt, -narration.json, -coverage.md,
// .json) and docs/demo/staff/screenshots/2-NN-<screen>.png.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Demo, DEMO_DIR, FF, URLS, finalize, fmt, probeDuration } from './lib/recorder.mjs';
import { REPO } from './lib/tools.mjs';
import { spawnSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DRY = process.env.DEMO_DRY === '1';
const A = URLS.admin;
const F = URLS.finance;
const STATE = JSON.parse(fs.readFileSync(path.join(DEMO_DIR, '.cache', 'finance-setup.json'), 'utf8'));
const LIVE = STATE.live;
const B = STATE.bookings;
const STAFF_DIR = path.join(DEMO_DIR, 'staff');
// a rehearsal (DEMO_DRY=1) never touches docs/demo/staff: the admin agent merges whatever is in parts/
const DRY_DIR = path.join(DEMO_DIR, '.cache', 'raw', 'staff-02-finance-dry');
const PARTS_DIR = DRY ? DRY_DIR : path.join(STAFF_DIR, 'parts');
const SHOT_DIR = DRY ? path.join(DRY_DIR, 'screenshots') : path.join(STAFF_DIR, 'screenshots');
const TMP_OUT = path.join(DEMO_DIR, '.cache', 'raw', 'staff-02-finance-out');

// Full Chromium (new headless) instead of the headless shell, so the invoice PDF renders in the built-in viewer.
const require = createRequire(path.join(REPO, 'web', 'package.json'));
const { chromium } = require('playwright');
const launch = chromium.launch.bind(chromium);
chromium.launch = (opts = {}) => launch({ ...opts, channel: 'chromium' });
// The lib's caption/cursor overlay, re-used for the checker's separate browser context.
const OVERLAY_SRC = fs.readFileSync(path.join(HERE, 'lib', 'recorder.mjs'), 'utf8').match(/const OVERLAY_INIT = (\(\) => \{[\s\S]*?\r?\n\});\r?\n/)[1];

const N = {
  intro: "The finance team works in the same staff console. In this part, Kavita Iyer signs in as the finance maker, and later Sandeep Bhatia approves her work as the checker, because every money movement needs two people.",
  login: 'Finance staff sign in at the same staff door, with their own account and finance permissions.',
  dash: 'For finance, the dashboard leads with money queues: payout accounts to verify, refunds, settlement batches, payouts and ledger adjustments, each waiting for a second approver.',
  perf: 'Performance starts with GMV and revenue, then bookings and conversion, for the period you choose.',
  sidebar: 'The sidebar groups finance work into three sections: Payments, Settlements, and Accounting and reports.',
  overview: "Finance overview is the platform's money position, straight from the double-entry ledger: patient escrow, gateway receivable, bank and GMV.",
  overview2: 'Revenue, taxes and payables follow. Awaiting finance review counts every queue that needs a second pair of eyes, and each row opens it.',
  orders: 'Payment orders lists every checkout, with status tabs and a separate queue for orders that need review.',
  ordersFilter: 'Filters narrow the list by gateway, amount or date. Here, only bank transfers.',
  ordersSearch: "Search finds an order by number, booking or patient. Let's open Liam O'Connor's payment.",
  order: "An order shows the amount in the patient's currency and in rupees, the captured payments, and every refund against them.",
  refundDialog: "Create refund asks for the payment, the amount and a reason. We'll cancel this one.",
  recon: 'Bank reconciliation matches transfers to the bank statement. Its queues separate proofs submitted, requests awaiting a second approval, and transfers still waiting for proof.',
  proof: `Opening a row shows the booking and the receipt the patient uploaded. ${LIVE.patient} has sent the deposit for a knee replacement.`,
  receipt: 'The receipt opens in a new tab, so Kavita can compare the reference and amount with the bank statement.',
  markPaid: 'The credit is in the bank, so Kavita records the reference and the amount received. If the amount differed, the dialog would stop her.',
  pending: "The order is not captured yet. It now waits for a second finance user, and Kavita can't approve her own request.",
  refunds: "Refunds has its own queues. Liam's twelve-hundred-dollar refund is above the fifty-thousand-rupee threshold, so it waits for a second approver. Smaller refunds can be approved by the requester.",
  items: "Settlements start with items: each hospital's net share and each agent's commission for a completed stay, after commission, GST and TDS. Items become eligible after the hold period.",
  hold: "Items can be put on hold when something needs checking. This one was waiting for an itemised implant bill from Deccan Crest.",
  release: 'The bill has arrived, so Kavita releases the hold with a note, and the item becomes eligible.',
  generate: 'Generate batch collects eligible items into a settlement batch. Kavita is recorded as the maker.',
  batchNew: "The new batch waits for approval. As its maker, Kavita can't approve it. Its payout destinations are frozen now, so a bank account changed later can't redirect the money.",
  batches: 'Batches lists every settlement run. The Auto tab shows batches created by the daily job; they still need a finance approver before anything is paid.',
  batchDetail: 'A processed batch shows its totals, the maker and the checker, the frozen payout destinations, and each payout with its UTR.',
  payouts: 'Payouts has queues for exceptions. Needs reconciliation collects payouts whose bank result is unknown, and today it is empty.',
  payoutsConfirm: 'A manual bank transfer stays open until one finance user records the UTR and a different one confirms it. And when a bank returns a payout, the reversal needs a second approver too.',
  docs: 'Every completed payout issues documents: tax invoices for our commission, credit notes when a refund reverses commission, and statements for agents.',
  invoice: 'This tax invoice is for a Mumbai hospital, in the same state as the platform, so GST is split into CGST and SGST.',
  pdf: 'Download PDF gives the formal invoice, with both GSTINs, ready to send to the hospital.',
  accounts: 'Payout accounts holds every hospital and agent bank account. New or changed details stay unverified until a different finance user verifies them.',
  verify: "Verify shows the full details to check against the bank proof. We'll cancel.",
  rules: 'Commission rules set the platform rate for a hospital, specialty or procedure, with effective dates, overriding the default rate.',
  ledger: 'Accounting starts with the ledger: every account with its type, owner and balance.',
  entries: 'Opening an account lists its entries, with a running balance.',
  journal: 'The journal shows every transaction, each one balanced, with its debit and credit lines.',
  adjustments: 'Manual adjustments, such as FX differences or bank charges, are posted only after a second finance user approves them.',
  trial: 'The trial balance proves that debits equal credits across the whole ledger.',
  reports: 'Reports break down bookings, GMV, revenue, commission and refunds by month, hospital or specialty, with CSV export.',
  settings: 'Under System, Settings marks the keys only finance may change, such as commission, deposit and tax rates.',
  settings2: 'Further down are the settlement hold period, the refund dual-approval threshold, and the platform GSTIN printed on every tax invoice.',
  collapse: 'The sidebar collapses to icons for more room, and expands again with one click.',
  switch: 'Now the second person. Sandeep Bhatia signs in from his own browser session, as the checker.',
  checkerQueue: `His Awaiting second approval queue shows Kavita's request for ${LIVE.patient}'s deposit.`,
  checkerOrder: 'He sees who recorded the request, the reference and the amount, and checks them against the bank statement.',
  approve: 'He approves. Only now is the payment captured, and the booking is confirmed.',
  checkerBatch: "He also approves Kavita's settlement batch. Payouts can be processed only after this approval.",
  bye: 'That completes the finance tour: every rupee is traceable in the ledger, and every money movement takes two people.',
};

class FinanceDemo extends Demo {
  constructor(o) {
    super(o);
    this.outDir = TMP_OUT;
    this.shotDir = SHOT_DIR;
    this.base = '02-finance';
    this.rawDir = path.join(DEMO_DIR, '.cache', 'raw', 'staff-02-finance');
    this.segments = []; // [{ page, t0 }] browser contexts in recording order
  }

  async start() {
    await super.start();
    this.segments.push({ page: this.page, context: this.context, t0: 0 });
  }

  async shot(name, opts) {
    const file = await super.shot(name, opts);
    const renamed = path.join(path.dirname(file), `2-${path.basename(file)}`);
    fs.renameSync(file, renamed);
    return renamed;
  }

  /** Part chapter card (no full title card: Part 1 has it). */
  async partCard(narration) {
    await this.page.setContent('<html><body style="background:#06281d"></body></html>');
    await this.wait(400);
    this.tStart = this.now();
    this.chapter('Part 2 · Finance (chapter card)');
    await this.card({ kicker: 'Heal India Global · Staff console', title: 'Part 2 · Finance', subtitle: 'Payments, settlements and accounting, with maker-checker approvals.',
      items: ['Finance overview', 'Bank reconciliation', 'Refunds', 'Settlement batches', 'Payouts', 'Invoices', 'Ledger', 'Reports'] }, 0);
    await this.say(narration);
  }

  /** Continues the recording in a brand-new browser context (separate session, e.g. a second finance user). */
  async newContextSegment() {
    const context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, recordVideo: { dir: this.rawDir, size: { width: 1920, height: 1080 } },
      locale: 'en-US', timezoneId: 'Asia/Kolkata', colorScheme: 'light',
    });
    await context.addInitScript({ content: `(${OVERLAY_SRC})();` });
    const page = await context.newPage();
    const t0 = this.now();
    page.setDefaultTimeout(15_000);
    this.context = context;
    this.page = page;
    this.mouse = { x: 960, y: 540 };
    this.segments.push({ page, context, t0 });
  }

  /** Shows a document (image or PDF bytes) full screen on a same-origin page, so the caption overlay stays visible. */
  async showDocument(bytes, mime, title) {
    const base = `${A}/__demo_doc`;
    await this.page.route(`${base}/**`, (route) => {
      const u = route.request().url();
      if (u.endsWith('/file')) return route.fulfill({ status: 200, contentType: mime, body: bytes });
      const inner = mime.startsWith('image/')
        ? `<img src="${base}/file" style="max-height:92vh;max-width:92vw;box-shadow:0 20px 60px rgba(0,0,0,.5);border-radius:8px">`
        : `<iframe src="${base}/file#zoom=page-width" style="border:0;width:100vw;height:100vh"></iframe>`;
      return route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><html><head><title>${title}</title></head><body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#2b2f36">${inner}</body></html>` });
    });
    await this.goto(`${base}/view`);
  }

  async finish() {
    for (const s of this.segments) await s.context.close();
    await this.browser.close();
    // 1. stitch the context recordings on the common clock: segment i covers [t0_i, t0_{i+1})
    const parts = [];
    for (let i = 0; i < this.segments.length; i++) {
      const s = this.segments[i];
      const webm = await s.page.video().path();
      const from = i === 0 ? 0 : s.t0;
      const to = i + 1 < this.segments.length ? this.segments[i + 1].t0 : null;
      parts.push({ webm, ss: from - s.t0, dur: to === null ? null : to - from });
    }
    let video = parts[0].webm;
    if (parts.length > 1) {
      video = path.join(this.rawDir, 'stitched.mkv');
      const args = ['-y', '-hide_banner', '-loglevel', 'error'];
      parts.forEach((p) => args.push('-ss', p.ss.toFixed(3), ...(p.dur !== null ? ['-t', p.dur.toFixed(3)] : []), '-i', p.webm));
      const f = parts.map((_, i) => `[${i}:v]fps=30,setpts=PTS-STARTPTS[v${i}]`).join(';') + `;${parts.map((_, i) => `[v${i}]`).join('')}concat=n=${parts.length}:v=1:a=0[v]`;
      args.push('-filter_complex', f, '-map', '[v]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '12', '-pix_fmt', 'yuv420p', video);
      const r = spawnSync(FF.ffmpeg, args, { encoding: 'utf8' });
      if (r.status !== 0) throw new Error(`stitch failed: ${r.stderr}`);
    }
    const session = {
      role: 'staff', label: 'Staff console', part: '', base: this.base, outDir: TMP_OUT, rawDir: this.rawDir, webm: video,
      tStart: this.tStart, tEnd: this.tEnd, cuts: this.cuts, timeline: this.timeline, chapters: this.chapters, warnings: this.warnings,
    };
    fs.writeFileSync(path.join(this.rawDir, 'session.json'), JSON.stringify(session, null, 2));
    return publish(session);
  }
}

/**
 * Cuts the silent stretches between scenes (page loads, session checks, screenshots) down to ~1.8 s, so the voice
 * never pauses long; no narration is inside a cut. Then lib finalize into a temp folder and move the files into
 * docs/demo/staff/parts (the video last, by an atomic rename).
 */
function publish(session) {
  const tl = session.timeline;
  const gapCuts = [];
  for (let i = 0; i < tl.length - 1; i++) {
    const end = tl[i].t + tl[i].dur;
    const next = tl[i + 1].t;
    if (next - end > 2.2) gapCuts.push([end + 0.8, next - 1.0]);
  }
  const s = { ...session, cuts: [...(session.cuts ?? []), ...gapCuts] };
  {
    fs.rmSync(TMP_OUT, { recursive: true, force: true });
    fs.mkdirSync(TMP_OUT, { recursive: true });
    const info = finalize(s);
    fs.mkdirSync(PARTS_DIR, { recursive: true });
    const moves = [
      ['02-finance.srt', '02-finance.srt'], ['02-finance.vtt', '02-finance.vtt'], ['narration.json', '02-finance-narration.json'],
      ['02-finance.json', '02-finance.json'],
    ];
    for (const [from, to] of moves) fs.renameSync(path.join(TMP_OUT, from), path.join(PARTS_DIR, to));
    fs.writeFileSync(path.join(PARTS_DIR, '02-finance-coverage.md'), coverage(info));
    // the video last (rename = atomic on the same volume): its presence means the part is complete
    fs.copyFileSync(path.join(TMP_OUT, '02-finance.mp4'), path.join(PARTS_DIR, '02-finance.mp4.tmp'));
    fs.renameSync(path.join(PARTS_DIR, '02-finance.mp4.tmp'), path.join(PARTS_DIR, '02-finance.mp4'));
    return info;
  }
}

function coverage(info) {
  const dur = probeDuration(path.join(TMP_OUT, '02-finance.mp4'));
  const rows = info.chapters.map((c, i) => `| ${i + 1} | ${fmt(c.t)} | ${c.title} | ${c.shot ? `[${path.basename(c.shot)}](../screenshots/${path.basename(c.shot)})` : '-'} |`);
  return `# Staff console - Part 2 · Finance - screen checklist

Video: \`parts/02-finance.mp4\` (${fmt(dur)}). Timestamps are relative to the start of this part. Recorded as
\`finance1@healindia.example\` (Kavita Iyer, maker) and, in a separate browser context, \`finance2@healindia.example\`
(Sandeep Bhatia, checker).

| # | Time | Screen | Screenshot |
|---|---|---|---|
${rows.join('\n')}

## Not shown / limits

- **Payouts → Needs reconciliation** is shown as an empty queue: a payout parks there only when a provider call has an
  unknown outcome (Razorpay Route timeout), which cannot be produced with the dev mock/manual providers.
- Read-only operations screens that finance can also open (Cases, Bookings, Hospitals, Agents, Users, Catalog, Content,
  Audit log) are covered in Part 1 (operations) and are not repeated here.
- Proof receipt and invoice PDF are shown full screen exactly as the console opens them (new tab / download).

## Demo data created for this part (through the real APIs)

Created by \`docs/demo/scripts/setup-finance-data.mjs\` (state: \`docs/demo/.cache/finance-setup.json\`):

- 13 patients registered (e.g. Ahmed Al-Balushi, Fatima Rahman, Daniel Kowalski, Grace Okafor - referred by agent
  Lagos MedConnect, Thomas Wright, Noah Bennett, Sarah Mitchell, Elena Petrova, Priya Nair, Mariam Yusuf, Amara Mensah, Liam O'Connor), each with an
  enquiry, an itemised hospital quote, an accepted booking and a payment (mock gateway or bank transfer + uploaded receipt).
- 7 stays admitted and completed by the hospitals (Nandi Valley x2, Coromandel, Vasundhara, Deccan Crest x2, Ratnakar Bay).
  Time passing was simulated with \`finance_timetravel.py\` only: admission date moved 6 days into the past, settlement
  hold period ended, and the real daily auto-batch job body run once.
- Settlement batches HIG-S-2026-000001..5: manual (finance1 maker, finance2 checker) with manual bank transfers and
  UTRs (one confirmed, one awaiting confirmation), a Nandi Valley batch with a refund-after-completion clawback (tax
  invoice + credit note), an agent commission batch whose payout was then reported returned (reversal pending), the
  Vasundhara auto batch (needs approval) and a Ratnakar Bay batch (intra-state CGST+SGST invoice).
- Refunds: one after completion, a small one (approved by the requester) and a USD 1,200 refund above the threshold
  (awaiting a second approver). Ledger adjustments: one FX difference posted (maker + checker), one bank-charges
  adjustment awaiting approval. Finance settings: platform GSTIN 27AAHCH4821M1ZQ, GST state Maharashtra.
- Live in the video: finance1 released the Deccan Crest hold and generated a batch (approved by finance2), recorded the
  mark-paid request for ${LIVE.patient}'s bank-transfer deposit (approved by finance2).
`;
}

// ------------------------------------------------------------------------------------------------- helpers
if (process.argv.includes('--refinalize')) {
  // re-render the last recording (e.g. after changing the cut policy) without recording again
  const sess = JSON.parse(fs.readFileSync(path.join(DEMO_DIR, '.cache', 'raw', 'staff-02-finance', 'session.json'), 'utf8'));
  const info = publish(sess);
  console.log(JSON.stringify({ duration: info.durationText, size: info.size, warnings: info.warnings }, null, 2));
  process.exit(0);
}
const d = new FinanceDemo({ role: 'staff', label: 'Finance', lines: Object.values(N) });
const p = () => d.page;
const main = () => p().locator('main');
const dialogBox = (title) => p().getByRole('dialog').filter({ hasText: title }).last();
async function closeDialog() {
  const dlg = p().getByRole('dialog').last();
  if (!(await d.tryClick(dlg.getByRole('button', { name: /^cancel$/i })))) await p().keyboard.press('Escape');
  await d.wait(400);
}
/** Quick-filter tabs (button groups with aria-pressed) or real tabs. */
function tabLoc(name) { return main().getByRole('group').getByRole('button', { name }).or(main().getByRole('tab', { name })).first(); }
async function tab(name) { return d.tryClick(tabLoc(name)); }

if (!LIVE) throw new Error('run setup-finance-data.mjs first');

// ------------------------------------------------------------------------------------------------- recording
await d.start();
// warm the dev server (first module load can be slow); this happens before the part card, so it is trimmed away
for (let i = 0; i < 3; i++) { try { await d.page.goto(`${A}/login`, { waitUntil: 'networkidle', timeout: 60_000 }); break; } catch (e) { d.log('warm-up retry', String(e.message).slice(0, 120)); } }
await d.partCard(N.intro);

// finance1 signs in
await d.scene({
  title: 'Staff door sign-in (finance1, maker)', go: `${A}/login`, narration: N.login, shot: 'finance-login', shotWhen: 'before',
  action: async () => { await d.signIn('finance1@healindia.example', { submitWait: (u) => !u.pathname.includes('/login') }); },
});

await d.scene({ title: 'Dashboard (finance queues)', narration: N.dash, shot: 'finance-dashboard', action: async () => {
  if (!p().url().includes('/dashboard')) await d.goto(`${A}/dashboard`);
  await d.hover(main().getByText(/payout accounts to verify/i).first());
  await d.hover(main().getByText(/ledger adjustments/i).first());
} });
await d.scene({ title: 'Dashboard - performance (GMV / revenue first)', narration: N.perf, action: async () => {
  await d.scroll(420, { x: 1100, y: 600 });
  await d.tryClick(main().getByRole('button', { name: /^90 days$/i }).or(main().getByRole('tab', { name: /^90 days$/i })));
  await d.hover(main().getByText(/^GMV$/).first());
} });
await d.scene({ title: 'Sidebar - finance sections', narration: N.sidebar, action: async () => {
  await d.scrollTop();
  const nav = p().locator('aside nav, nav[aria-label]').first();
  for (const g of ['Payments', 'Settlements', 'Accounting & reports']) await d.hover(nav.getByRole('button', { name: g }).first());
} });

// ---- Payments
await d.scene({ title: 'Payments › Finance overview', nav: ['Payments', 'Finance overview', F], narration: N.overview, shot: 'finance-overview' });
await d.scene({ title: 'Finance overview - awaiting finance review', narration: N.overview2, action: async () => {
  await d.scroll(700, { x: 1100, y: 640 });
  await d.hover(main().getByText(/payouts awaiting utr confirmation/i).first());
}, shot: 'finance-overview-review' });

await d.scene({ title: 'Payments › Payment orders', nav: ['Payments', 'Payment orders', `${F}/orders`], narration: N.orders, shot: 'payment-orders', action: async () => {
  await d.hover(tabLoc(/^all/i));
  await d.hover(tabLoc(/review required/i));
} });
await d.scene({ title: 'Payment orders - gateway filter (bank transfer)', narration: N.ordersFilter, shot: 'payment-orders-bank-transfer', action: async () => {
  await d.click(main().getByRole('button', { name: /^gateway/i }).first(), { settle: false });
  await d.wait(400);
  await d.tryClick(p().getByRole('option', { name: /bank transfer/i }).or(p().getByRole('menuitemcheckbox', { name: /bank transfer/i })).or(p().getByRole('checkbox', { name: /bank transfer/i })).first());
  await p().keyboard.press('Escape');
  await d.settle(400);
} });
await d.scene({ title: 'Payment orders - search', narration: N.ordersSearch, action: async () => {
  await d.goto(`${F}/orders`);
  await d.type(main().getByPlaceholder(/order|search/i).first(), 'Liam', 90);
  await d.settle(800);
  await d.click(main().getByText(B.R1.order_number ?? "Liam O'Connor").first());
} });
await d.scene({ title: 'Payment order detail (payments + refunds)', narration: N.order, shot: 'order-detail', action: async () => {
  if (!p().url().includes(B.R1.order_id)) await d.goto(`${F}/orders/${B.R1.order_id}`);
  await d.scroll(520, { x: 1100, y: 640 });
} });
await d.scene({ title: 'Create refund dialog (cancelled)', narration: N.refundDialog, shot: 'refund-dialog', action: async () => {
  await d.scrollTop();
  await d.click(main().getByRole('button', { name: /create refund/i }).first(), { settle: false });
  await d.wait(900);
  await d.hover(p().getByRole('dialog').last().getByText(/dual approval/i).first());
} });
await closeDialog();

await d.scene({ title: 'Payments › Bank reconciliation (queues)', nav: ['Payments', 'Bank reconciliation', `${F}/reconciliation`], narration: N.recon, shot: 'bank-reconciliation', action: async () => {
  await d.hover(tabLoc(/awaiting 2nd approval/i));
  await d.hover(tabLoc(/awaiting proof/i));
} });
await d.scene({ title: 'Bank reconciliation - proof drawer', narration: N.proof, shot: 'proof-drawer', action: async () => {
  const row = main().getByRole('row').filter({ hasText: LIVE.order_number });
  await d.click(row.getByRole('button', { name: /proof/i }).first());
  await d.wait(800);
} });
await d.scene({ title: 'Uploaded transfer receipt (opened in a new tab)', narration: N.receipt, shot: 'proof-receipt', action: async () => {
  const drawer = p().getByRole('dialog').last();
  const [popup] = await Promise.all([p().waitForEvent('popup', { timeout: 15_000 }), d.click(drawer.getByRole('button', { name: /^view /i }).first(), { settle: false })]);
  await popup.waitForURL(/^blob:/, { timeout: 15_000 });
  const bytes = Buffer.from(await popup.evaluate(async () => Array.from(new Uint8Array(await (await fetch(location.href)).arrayBuffer()))));
  await popup.close();
  await d.showDocument(bytes, 'image/png', 'Transfer receipt');
} });
await d.scene({ title: 'Mark paid - maker records the bank reference', narration: N.markPaid, shot: 'mark-paid-dialog', action: async () => {
  await d.goto(`${F}/reconciliation`);
  const row = main().getByRole('row').filter({ hasText: LIVE.order_number });
  await d.click(row.getByRole('button', { name: /mark paid/i }).first(), { settle: false });
  const dlg = dialogBox(/as paid/i);
  await dlg.waitFor();
  await d.type(dlg.getByLabel(/bank reference/i), LIVE.reference, 70);
  await d.hover(dlg.getByLabel(/amount received/i));
} });
await d.scene({ title: 'Mark-paid request pending - maker cannot approve', narration: N.pending, shot: 'mark-paid-pending', action: async () => {
  const dlg = dialogBox(/as paid/i);
  if (DRY) await closeDialog();
  else await d.click(dlg.getByRole('button', { name: /^record payment$/i }));
  await d.goto(`${F}/orders/${LIVE.order_id}`);
  await d.hover(main().getByRole('button', { name: /^approve payment$/i }).first());
  await d.hover(main().getByText(/you recorded this request|awaiting a second finance user/i).first());
} });

await d.scene({ title: 'Payments › Refunds (second-approver threshold)', nav: ['Payments', 'Refunds', `${F}/refunds`], narration: N.refunds, shot: 'refunds', action: async () => {
  await tab(/awaiting second approval/i);
  await d.hover(main().getByRole('row').filter({ hasText: /1,200/ }).first());
  await tab(/^all/i);
} });

// ---- Settlements
await d.scene({ title: 'Settlements › Settlement items', nav: ['Settlements', 'Settlement items', `${F}/settlements`], narration: N.items, shot: 'settlement-items' });
await d.scene({ title: 'Settlement items - on hold', narration: N.hold, shot: 'settlement-items-on-hold', action: async () => {
  await tab(/on hold/i);
  await d.hover(main().getByText(/awaiting the final itemised bill/i).first());
} });
await d.scene({ title: 'Release hold (live)', narration: N.release, shot: 'release-hold', shotWhen: 'before', action: async () => {
  const row = main().getByRole('row').filter({ hasText: LIVE.held_booking });
  await d.click(row.getByRole('button', { name: /release/i }).first(), { settle: false });
  const dlg = dialogBox(/release hold/i);
  await dlg.waitFor();
  await d.type(dlg.getByRole('textbox').first(), 'Itemised implant bill received and checked', 55);
  if (DRY) await closeDialog();
  else await d.click(dlg.getByRole('button', { name: /^release$/i }));
  await tab(/^eligible/i);
} });
await d.scene({ title: 'Generate settlement batch (maker)', narration: N.generate, shot: 'generate-batch-dialog', action: async () => {
  await d.click(main().getByRole('button', { name: /^generate batch$/i }).first(), { settle: false });
  const dlg = dialogBox(/generate settlement batch/i);
  await dlg.waitFor();
  await d.hover(dlg.getByLabel(/payee type/i));
  await d.hover(dlg.getByText(/recorded as the batch maker/i));
} });
let liveBatchUrl = null;
await d.scene({ title: 'New batch - pending approval, frozen payout destinations', narration: N.batchNew, shot: 'new-batch-detail', action: async () => {
  const dlg = dialogBox(/generate settlement batch/i);
  if (DRY) { await closeDialog(); await d.goto(`${F}/settlements/batches/${STATE.batches.S1.id}`); return; }
  await d.click(dlg.getByRole('button', { name: /^generate batch$/i }));
  await p().waitForURL(/settlements\/batches\/[0-9a-f-]{36}/, { timeout: 20_000 });
  await d.settle(600);
  liveBatchUrl = p().url();
  await d.hover(main().getByRole('button', { name: /^approve$/i }).first());
  await d.scroll(420, { x: 1100, y: 640 });
  await d.hover(main().getByText(/frozen at generation/i).first());
} });

await d.scene({ title: 'Settlements › Batches (auto · needs approval)', nav: ['Settlements', 'Batches', `${F}/settlements/batches`], narration: N.batches, shot: 'batches-auto', action: async () => {
  await tab(/auto/i);
  await d.wait(600);
  await tab(/^all/i);
} });
await d.scene({ title: 'Batch detail (processed, frozen payout destinations)', go: `${F}/settlements/batches/${STATE.batches.S1.id}`, narration: N.batchDetail, shot: 'batch-detail', action: async () => {
  await d.hover(main().getByText(/approved by \(checker\)/i).first());
  await d.scroll(520, { x: 1100, y: 640 });
  await d.wait(500);
  await d.scroll(420, { x: 1100, y: 640 });
} });
await d.scene({ title: 'Settlements › Payouts - needs reconciliation', nav: ['Settlements', 'Payouts', `${F}/settlements/payouts`], narration: N.payouts, shot: 'payouts-needs-reconciliation', action: async () => {
  await tab(/needs reconciliation/i);
} });
await d.scene({ title: 'Payouts - awaiting confirmation, then reversal pending', narration: N.payoutsConfirm, shot: 'payouts-reversal-pending', action: async () => {
  await tab(/awaiting confirmation/i);
  await d.hover(main().getByText(/another finance user must confirm/i).first());
  await d.shot('payouts-awaiting-confirmation');
  await d.wait(1200);
  await tab(/reversal pending/i);
  await d.hover(main().getByText(/another finance user|must approve/i).first());
} });

await d.scene({ title: 'Settlements › Invoices & credit notes', nav: ['Settlements', 'Invoices & credit notes', `${F}/settlements/documents`], narration: N.docs, shot: 'invoices-credit-notes', action: async () => {
  await d.hover(tabLoc(/credit notes/i));
} });
await d.scene({ title: 'Tax invoice detail (CGST + SGST)', narration: N.invoice, shot: 'tax-invoice', action: async () => {
  await d.click(main().getByRole('row').filter({ hasText: /Ratnakar/i }).first().getByText(/Ratnakar/i).first());
  await d.wait(600);
} });
await d.scene({ title: 'Tax invoice PDF preview', narration: N.pdf, shot: 'tax-invoice-pdf', action: async () => {
  const dlg = p().getByRole('dialog').last();
  const [download] = await Promise.all([p().waitForEvent('download', { timeout: 20_000 }), d.click(dlg.getByRole('button', { name: /download pdf/i }), { settle: false })]);
  const file = path.join(d.rawDir, 'invoice.pdf');
  await download.saveAs(file);
  await d.showDocument(fs.readFileSync(file), 'application/pdf', 'Tax invoice');
  await d.wait(1200);
} });

await d.scene({ title: 'Settlements › Payout accounts (verification)', nav: ['Settlements', 'Payout accounts', `${F}/payout-accounts`], narration: N.accounts, shot: 'payout-accounts', action: async () => {
  await tab(/awaiting verification/i);
} });
await d.scene({ title: 'Verify payout account dialog (cancelled)', narration: N.verify, shot: 'verify-payout-account', action: async () => {
  await d.click(main().getByRole('button', { name: /^verify$/i }).first(), { settle: false });
  await d.wait(900);
} });
await closeDialog();
await d.scene({ title: 'Settlements › Commission rules', nav: ['Settlements', 'Commission rules', `${F}/commission-rules`], narration: N.rules, shot: 'commission-rules', action: async () => {
  await d.hover(main().getByRole('row').nth(1));
  await d.hover(main().getByRole('row').nth(3));
} });

// ---- Accounting & reports
await d.scene({ title: 'Accounting › Ledger accounts', nav: ['Accounting & reports', 'Ledger', `${F}/ledger`], narration: N.ledger, shot: 'ledger-accounts' });
await d.scene({ title: 'Ledger account entries (running balance)', narration: N.entries, shot: 'ledger-account-entries', action: async () => {
  await d.click(main().getByRole('row').filter({ hasText: /COMMISSION_REVENUE|commission revenue/i }).first());
  await d.wait(500);
  await d.scroll(300, { x: 1100, y: 640 });
} });
await d.scene({ title: 'Ledger journal', go: `${F}/ledger/journal`, narration: N.journal, shot: 'ledger-journal', action: async () => {
  await d.tryClick(main().getByRole('row').nth(1), { settle: false });
  await d.wait(900);
} });
await p().keyboard.press('Escape');
await d.scene({ title: 'Ledger adjustments (maker-checker)', go: `${F}/ledger/adjustments`, narration: N.adjustments, shot: 'ledger-adjustments', action: async () => {
  await d.hover(tabLoc(/pending approval/i));
  await d.hover(main().getByText(/bank charges/i).first());
} });
await d.scene({ title: 'Trial balance', go: `${F}/ledger/trial-balance`, narration: N.trial, shot: 'trial-balance', action: async () => {
  await d.scroll(500, { x: 1100, y: 640 });
} });
await d.scene({ title: 'Accounting › Reports', nav: ['Accounting & reports', 'Reports', `${F}/reports`], narration: N.reports, shot: 'finance-reports', action: async () => {
  await d.tryClick(main().getByRole('tab', { name: /by hospital/i }).or(main().getByRole('button', { name: /by hospital/i })).first());
  await d.wait(500);
} });

// ---- System › Settings (finance keys)
await d.scene({ title: 'System › Settings (finance keys)', nav: ['System', 'Settings', `${A}/settings`], narration: N.settings, shot: 'settings-finance-keys', action: async () => {
  await d.hover(main().getByText('Finance', { exact: true }).first());
} });
await d.scene({ title: 'Settings - hold period, refund threshold, platform GSTIN', narration: N.settings2, shot: 'settings-threshold-gstin', action: async () => {
  await d.hover(main().getByText('Settlement hold', { exact: false }).first());
  await d.hover(main().getByText('Refund dual-approval threshold').first());
  await d.hover(main().getByText('Platform GSTIN').first());
} });
await d.scene({ title: 'Sidebar collapse / expand', narration: N.collapse, action: async () => {
  await d.click(p().getByRole('button', { name: /collapse sidebar/i }).first(), { settle: false });
  await d.wait(1600);
  await d.click(p().getByRole('button', { name: /expand sidebar/i }).first(), { settle: false });
  await d.wait(600);
} });

// ---- finance2 (checker) in a separate browser context
await d.newContextSegment();
await d.scene({ title: 'Checker signs in (finance2, separate browser context)', go: `${A}/login`, narration: N.switch, shot: 'checker-login', shotWhen: 'before', action: async () => {
  await d.signIn('finance2@healindia.example', { submitWait: (u) => !u.pathname.includes('/login') });
} });
await d.scene({ title: 'Checker - bank reconciliation awaiting 2nd approval', go: `${F}/reconciliation?status=approval`, narration: N.checkerQueue, shot: 'checker-awaiting-approval', action: async () => {
  await d.hover(main().getByRole('row').filter({ hasText: LIVE.order_number }).first());
} });
await d.scene({ title: 'Checker - mark-paid request on the order', go: `${F}/orders/${LIVE.order_id}`, narration: N.checkerOrder, shot: 'checker-order-request', action: async () => {
  await d.hover(main().getByText(LIVE.reference).first());
  await d.hover(main().getByRole('button', { name: /^approve payment$/i }).first());
} });
await d.scene({ title: 'Checker approves - order paid, booking confirmed', narration: N.approve, shot: 'checker-approved', action: async () => {
  await d.click(main().getByRole('button', { name: /^approve payment$/i }).first(), { settle: false });
  const dlg = dialogBox(/approve bank transfer/i);
  await dlg.waitFor();
  await d.wait(900);
  if (DRY) await closeDialog();
  else await d.click(dlg.getByRole('button', { name: /^approve payment$/i }));
  await d.wait(1200);
  await d.goto(p().url());
} });
await d.scene({ title: "Checker approves the maker's settlement batch", go: liveBatchUrl ?? `${F}/settlements/batches`, narration: N.checkerBatch, shot: 'checker-batch-approved', action: async () => {
  if (!liveBatchUrl) return;
  await d.click(main().getByRole('button', { name: /^approve$/i }).first(), { settle: false });
  const dlg = dialogBox(/approve batch/i);
  await dlg.waitFor();
  await d.wait(700);
  if (DRY) await closeDialog();
  else await d.click(dlg.getByRole('button', { name: /^approve$/i }));
  await d.wait(800);
  await d.hover(main().getByText(/approved by \(checker\)/i).first());
} });

d.label = 'Staff console';
await d.outro(N.bye);
const info = await d.finish();
console.log(JSON.stringify({ duration: info.durationText, size: info.size, warnings: info.warnings }, null, 2));
