// Shared helpers for the narrated product walkthrough recordings (docs/demo/scripts/record-<role>.mjs).
//
// Flow of one recording:
//   1. every narration line is synthesised up front (edge-tts, US-English female neural voice; cached by text hash;
//      offline fallback: Windows SAPI "Microsoft Zira") and its duration measured with ffprobe;
//   2. Playwright drives the real running portals at 1920x1080 with recordVideo on. Each `say()` shows the line as a
//      caption, performs the on-screen actions while it is "spoken", and holds the screen for the narration length
//      (+0.7 s). The wall-clock start of each line is logged into a timeline;
//   3. post-processing (ffmpeg from .devtools/ffmpeg): the WebM is trimmed to intro..outro, the narration clips are
//      placed at their logged offsets (adelay), mixed, loudness-normalised (loudnorm I=-16) and muxed as AAC 128k onto
//      an H.264/yuv420p/faststart MP4 (see finalize.mjs). API documentation: ./README.md
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { finalize } from './finalize.mjs';
import { DEMO_DIR, FF, REPO, fmt, probeDuration } from './tools.mjs';

export { DEMO_DIR, FF, REPO, fmt, finalize, probeDuration };
const require = createRequire(path.join(REPO, 'web', 'package.json'));
process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.join(REPO, '.devtools', 'ms-playwright');
const { chromium } = require('playwright');

export const PASSWORD = 'HealIndia@2026';
export const URLS = {
  website: 'http://localhost:3000',
  door: 'http://localhost:3000/login',
  patient: 'http://localhost:5173/app',
  agent: 'http://localhost:5174/agent',
  hospital: 'http://localhost:5175/hospital',
  admin: 'http://localhost:5176/gahi',
  finance: 'http://localhost:5176/gahi/finance',
};

const VOICES = ['en-US-JennyNeural', 'en-US-AriaNeural', 'en-US-AvaNeural']; // US-English female only
const W = 1920;
const H = 1080;
const HOLD_PAD_MS = 700;

const EDGE_TTS = path.join(REPO, '.devtools', 'tts-venv', 'Scripts', 'edge-tts.exe');
const TTS_CACHE = path.join(DEMO_DIR, '.cache', 'tts');

function spawnAsync(bin, args) {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => resolve({ status: code, stderr: err }));
    child.on('error', (e) => resolve({ status: -1, stderr: String(e) }));
  });
}

async function synthEdge(text, file) {
  for (const voice of VOICES) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await spawnAsync(EDGE_TTS, ['--voice', voice, '--rate=+4%', '--text', text, '--write-media', file]);
      if (r.status === 0 && fs.existsSync(file) && fs.statSync(file).size > 1000) return voice;
    }
  }
  return null;
}

async function synthZira(text, file) {
  // Offline fallback: Windows SAPI, female US voice (Microsoft Zira). Text passed via a temp file.
  const txt = `${file}.txt`;
  fs.writeFileSync(txt, text, 'utf8');
  const ps = `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer;` +
    ` $v = $s.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo } | Where-Object { $_.Name -like '*Zira*' } | Select-Object -First 1;` +
    ` if (-not $v) { throw 'Microsoft Zira not installed' }; $s.SelectVoice($v.Name); $s.Rate = 0;` +
    ` $s.SetOutputToWaveFile('${file.replace(/'/g, "''")}'); $s.Speak([IO.File]::ReadAllText('${txt.replace(/'/g, "''")}')); $s.Dispose()`;
  const r = await spawnAsync('powershell.exe', ['-NoProfile', '-Command', ps]);
  fs.rmSync(txt, { force: true });
  return r.status === 0 && fs.existsSync(file) ? 'Microsoft Zira (SAPI)' : null;
}

/** Synthesises (or loads from cache) one narration line. Resolves to { file, dur, voice }. */
export async function tts(text) {
  fs.mkdirSync(TTS_CACHE, { recursive: true });
  const key = crypto.createHash('sha1').update(`${VOICES[0]}|+4%|${text}`).digest('hex').slice(0, 16);
  for (const ext of ['mp3', 'wav']) {
    const f = path.join(TTS_CACHE, `${key}.${ext}`);
    if (fs.existsSync(f) && fs.statSync(f).size > 1000) return { file: f, dur: probeDuration(f), voice: 'cached' };
  }
  const mp3 = path.join(TTS_CACHE, `${key}.tmp-${process.pid}.mp3`);
  let voice = await synthEdge(text, mp3);
  let file = path.join(TTS_CACHE, `${key}.mp3`);
  if (voice) fs.renameSync(mp3, file);
  else {
    fs.rmSync(mp3, { force: true });
    file = path.join(TTS_CACHE, `${key}.wav`);
    voice = await synthZira(text, file);
  }
  if (!voice) throw new Error(`TTS failed for: ${text}`);
  return { file, dur: probeDuration(file), voice };
}

/** Synthesises many lines with limited concurrency. Resolves to Map(text -> { file, dur, voice }). */
export async function ttsAll(lines, concurrency = 6) {
  const unique = [...new Set(lines)];
  const out = new Map();
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, unique.length) }, async () => {
    while (next < unique.length) {
      const line = unique[next++];
      out.set(line, await tts(line));
    }
  }));
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// In-page overlay: caption bar (subtitles), fake cursor + click ripple. Injected on every document.
// ---------------------------------------------------------------------------------------------------------------
const OVERLAY_INIT = () => {
  if (window.__demoOverlay) return;
  window.__demoOverlay = true;
  const css = `
  #__demo_cap{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:2147483646;max-width:1480px;
    display:flex;align-items:center;gap:16px;padding:14px 26px;border-radius:16px;background:rgba(10,18,36,.90);
    color:#fff;font:500 25px/1.38 Inter,'Segoe UI',system-ui,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.35);
    pointer-events:none;transition:opacity .35s ease;letter-spacing:.1px;backdrop-filter:blur(6px)}
  #__demo_cap[data-empty="1"]{opacity:0}
  #__demo_cap b{flex:none;font:700 13px/1 Inter,'Segoe UI',sans-serif;text-transform:uppercase;letter-spacing:1.4px;
    padding:8px 11px;border-radius:999px;background:linear-gradient(135deg,#0f9d58,#6d28d9);color:#fff}
  #__demo_cur{position:fixed;left:0;top:0;width:30px;height:30px;z-index:2147483647;pointer-events:none;
    transform:translate(-100px,-100px);filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))}
  .__demo_rip{position:fixed;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;z-index:2147483645;
    pointer-events:none;border:3px solid rgba(124,58,237,.9);background:rgba(124,58,237,.18);animation:__demo_rip .6s ease-out forwards}
  @keyframes __demo_rip{from{transform:scale(.3);opacity:1}to{transform:scale(1.6);opacity:0}}
  html.__demo_hide #__demo_cap,html.__demo_hide #__demo_cur{display:none!important}
  html:not(.__demo_toasts) [data-sonner-toaster]{display:none!important}`;
  const mount = () => {
    if (document.getElementById('__demo_cap')) return;
    const st = document.createElement('style');
    st.textContent = css;
    document.documentElement.appendChild(st);
    const cap = document.createElement('div');
    cap.id = '__demo_cap';
    cap.dataset.empty = '1';
    document.documentElement.appendChild(cap);
    const cur = document.createElement('div');
    cur.id = '__demo_cur';
    cur.innerHTML = '<svg viewBox="0 0 24 24" width="30" height="30"><path d="M4 2.5l15.5 9.2-6.8 1.6 4 7.4-3 1.6-4-7.5-5.2 4.6z" fill="#111827" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(cur);
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem('__demo_state') || 'null'); } catch {}
    if (saved) {
      window.__demoSetCaption(saved.chip, saved.text);
      cur.style.transform = `translate(${saved.x}px,${saved.y}px)`;
    }
  };
  const save = (patch) => {
    try {
      const s = JSON.parse(sessionStorage.getItem('__demo_state') || '{}');
      sessionStorage.setItem('__demo_state', JSON.stringify({ ...s, ...patch }));
    } catch {}
  };
  window.__demoSetCaption = (chip, text) => {
    save({ chip, text }); // save first: if the bar is not mounted yet, mount() must not restore a stale caption
    const cap = document.getElementById('__demo_cap');
    if (!cap) return;
    cap.innerHTML = '';
    if (text) {
      if (chip) { const b = document.createElement('b'); b.textContent = chip; cap.appendChild(b); }
      const s = document.createElement('span'); s.textContent = text; cap.appendChild(s);
    }
    cap.dataset.empty = text ? '0' : '1';
  };
  document.addEventListener('mousemove', (e) => {
    const cur = document.getElementById('__demo_cur');
    if (cur) cur.style.transform = `translate(${e.clientX - 4}px,${e.clientY - 2}px)`;
    save({ x: e.clientX - 4, y: e.clientY - 2 });
  }, true);
  document.addEventListener('mousedown', (e) => {
    const r = document.createElement('div');
    r.className = '__demo_rip';
    r.style.left = `${e.clientX}px`;
    r.style.top = `${e.clientY}px`;
    document.documentElement.appendChild(r);
    setTimeout(() => r.remove(), 700);
  }, true);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
  const watch = () => new MutationObserver(() => { if (!document.getElementById('__demo_cap') && document.body) mount(); })
    .observe(document.documentElement, { childList: true });
  if (document.documentElement) watch();
  else document.addEventListener('DOMContentLoaded', watch);
};

// ---------------------------------------------------------------------------------------------------------------
// Title / outro cards
// ---------------------------------------------------------------------------------------------------------------
function logoDataUri() {
  const svg = fs.readFileSync(path.join(REPO, 'web', 'apps', 'patient-web', 'public', 'brand', 'logo-horizontal-on-dark.svg'));
  return `data:image/svg+xml;base64,${svg.toString('base64')}`;
}

function cardHtml({ kicker, title, subtitle, items = [] }) {
  const li = items.map((i) => `<li>${i}</li>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100%;font-family:Inter,'Segoe UI',system-ui,sans-serif;color:#fff;overflow:hidden}
  body{background:radial-gradient(1200px 700px at 15% 10%,#13a36b 0%,transparent 60%),
    radial-gradient(1100px 800px at 90% 90%,#6d28d9 0%,transparent 60%),linear-gradient(135deg,#06281d,#1b1240);
    display:flex;align-items:center;justify-content:center}
  .wrap{width:1380px;animation:in 1s ease-out both}
  @keyframes in{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}
  img{height:96px;display:block;margin-bottom:56px}
  .k{font-size:22px;letter-spacing:4px;text-transform:uppercase;opacity:.8;margin-bottom:18px;font-weight:600}
  h1{font-size:84px;line-height:1.05;margin:0 0 26px;font-weight:800;letter-spacing:-1.5px}
  p{font-size:32px;opacity:.88;margin:0 0 36px;max-width:1200px;line-height:1.35}
  ul{display:flex;flex-wrap:wrap;gap:12px;padding:0;margin:0;list-style:none}
  li{font-size:21px;padding:10px 18px;border-radius:999px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2)}
  </style></head><body><div class="wrap"><img src="${logoDataUri()}" alt=""><div class="k">${kicker}</div>
  <h1>${title}</h1><p>${subtitle}</p><ul>${li}</ul></div></body></html>`;
}

// ---------------------------------------------------------------------------------------------------------------
// Recorder
// ---------------------------------------------------------------------------------------------------------------
export class Demo {
  /**
   * @param {object} o
   * @param {string} o.role     folder name (patient, agent, hospital, admin, finance)
   * @param {string} o.label    human label ("Patient")
   * @param {string} [o.part]   optional part suffix ("part1")
   * @param {string[]} o.lines  every narration line used by the script (pre-synthesised)
   * @param {boolean} [o.showToasts] show sonner toasts (default hidden: parallel e2e traffic causes noise)
   */
  constructor({ role, label, part = '', lines = [], showToasts = false, trimOverrun = true }) {
    this.showToasts = showToasts; // realtime toasts (often from parallel test traffic) are hidden unless true
    this.trimOverrun = trimOverrun; // cut dead air when a say() action runs > 2 s past its narration
    this.role = role;
    this.label = label;
    this.part = part;
    this.lines = lines;
    this.outDir = path.join(DEMO_DIR, role);
    this.shotDir = path.join(this.outDir, 'screenshots');
    this.base = `${role}-walkthrough${part ? `-${part}` : ''}`;
    this.rawDir = path.join(DEMO_DIR, '.cache', 'raw', this.base);
    this.timeline = [];
    this.chapters = [];
    this.cuts = [];
    this.warnings = [];
    this.shotNo = 0;
    this.audio = new Map();
  }

  log(...a) { console.log(`[${this.base}]`, ...a); }
  warn(msg) { this.warnings.push(msg); console.warn(`[${this.base}] WARN ${msg}`); }

  async start({ shotStart = 0 } = {}) {
    this.shotNo = shotStart;
    // 1. narration
    const t = Date.now();
    this.audio = await ttsAll(this.lines);
    const voices = new Set([...this.audio.values()].map((a) => a.voice));
    this.log(`narration ready: ${this.lines.length} lines, ${[...this.audio.values()].reduce((s, a) => s + a.dur, 0).toFixed(1)} s speech, voices=${[...voices].join(',')} (${((Date.now() - t) / 1000).toFixed(1)} s)`);
    // 2. browser
    fs.rmSync(this.rawDir, { recursive: true, force: true });
    fs.mkdirSync(this.rawDir, { recursive: true });
    fs.mkdirSync(this.shotDir, { recursive: true });
    this.browser = await chromium.launch({ args: ['--hide-scrollbars', '--force-color-profile=srgb', '--font-render-hinting=none'] });
    this.context = await this.browser.newContext({
      viewport: { width: W, height: H },
      deviceScaleFactor: 1,
      recordVideo: { dir: this.rawDir, size: { width: W, height: H } },
      locale: 'en-US',
      timezoneId: 'Asia/Kolkata',
      colorScheme: 'light',
    });
    await this.context.addInitScript(OVERLAY_INIT);
    this.page = await this.context.newPage();
    this.t0 = Date.now();
    this.page.setDefaultTimeout(15_000);
    this.page.on('pageerror', (e) => this.log('pageerror:', String(e.message).slice(0, 160)));
    this.mouse = { x: W / 2, y: H / 2 };
  }

  now() { return (Date.now() - this.t0) / 1000; }
  wait(ms) { return this.page.waitForTimeout(ms); }

  async setCaption(text, chip = this.label) {
    this.caption = { text, chip };
    await this.page.evaluate(([c, t]) => window.__demoSetCaption?.(c, t), [chip, text]).catch(() => {});
  }

  /** Marks a chapter (screen) for the coverage checklist. */
  chapter(title) {
    const c = { t: this.now(), title, shot: null };
    this.chapters.push(c);
    return c;
  }

  /**
   * One screen of the walkthrough: chapter marker + narration (caption and voice) while `action` runs, then an
   * optional clean screenshot (`shot: '<name>'`, saved as NN-<name>.png and linked in coverage.md).
   * `go` (url) navigates first; `nav: [group, item, url]` navigates through the sidebar (falls back to the url).
   */
  async scene({ title, narration, action, shot, go, nav, shotWhen = 'after' }) {
    const c = this.chapter(title ?? narration.slice(0, 60));
    if (nav || go) await this.setCaption(''); // previous line fades out while the next screen loads
    if (nav) await this.nav(...nav);
    else if (go) await this.goto(go);
    if (shot && shotWhen === 'before') c.shot = await this.shot(shot);
    await this.say(narration, action);
    if (shot && shotWhen === 'after') c.shot = await this.shot(shot);
  }

  /**
   * Narrates `text` (caption + voice) while running `actions`; holds until the narration has finished (+0.7 s).
   * Failures inside `actions` are logged and do not stop the recording.
   */
  async say(text, actions) {
    let a = this.audio.get(text);
    if (!a) {
      this.warn(`narration not pre-registered (synthesised on the fly, adds a pause): ${text.slice(0, 60)}`);
      a = await tts(text);
      this.audio.set(text, a);
    }
    const start = Date.now();
    this.timeline.push({ t: this.now(), dur: a.dur, file: a.file, text });
    await this.setCaption(text);
    if (actions) {
      try { await actions(); } catch (e) { this.warn(`action failed during "${text.slice(0, 50)}...": ${String(e.message).split('\n')[0]}`); }
    }
    const narrEnd = start + a.dur * 1000 + HOLD_PAD_MS;
    const overrun = Date.now() - narrEnd;
    if (this.trimOverrun && overrun > 2000) {
      // the actions ran long after the voice ended (slow load, stalled locator): cut the dead air from the video
      this.cuts.push([(narrEnd - this.t0) / 1000 + 0.6, (Date.now() - this.t0) / 1000 - 0.5]);
      this.log(`trimmed ${(overrun / 1000).toFixed(1)} s of dead air after "${text.slice(0, 40)}..."`);
    }
    const left = narrEnd - Date.now();
    if (left > 0) await this.wait(left);
    // keep caption state in sync after any navigation inside actions
    await this.setCaption(text);
  }

  /**
   * Runs `fn` off camera: the time it takes is cut out of the final video (caption hidden meanwhile). Use it for
   * data preparation, rate-limit waits or slow loads that would otherwise show as dead air.
   */
  async offCamera(fn) {
    const prev = this.caption;
    await this.setCaption('');
    const a = this.now();
    try { return await fn(); } finally {
      if (prev) await this.setCaption(prev.text, prev.chip);
      await this.wait(150);
      this.cuts.push([a, this.now()]);
    }
  }

  async card(opts, ms) {
    await this.page.setContent(cardHtml(opts));
    await this.setCaption('');
    await this.wait(ms);
  }

  async intro(subtitle, items) {
    await this.page.setContent(cardHtml({ kicker: 'Product walkthrough', title: 'Heal India Global', subtitle: '', items: [] }));
    await this.wait(400); // first frames of the video are blank - trimmed away
    this.tStart = this.now();
    this.chapter('Intro');
    await this.page.setContent(cardHtml({ kicker: 'Product walkthrough', title: `Heal India Global — ${this.label} walkthrough${this.part ? ` (${this.part.replace('part', 'Part ')})` : ''}`, subtitle, items }));
  }

  async outro(text, subtitle = 'Every screen shown is the real running product with demo data.') {
    this.chapter('Outro');
    await this.page.setContent(cardHtml({ kicker: 'Thank you', title: `${this.label} walkthrough complete`, subtitle, items: [] }));
    await this.say(text);
    await this.wait(1200);
    this.tEnd = this.now();
  }

  // ---- navigation & interaction ------------------------------------------------------------------------------
  async settle(extra = 600) {
    await this.page.evaluate((show) => document.documentElement.classList.toggle('__demo_toasts', show), this.showToasts).catch(() => {});
    await this.page.waitForLoadState('domcontentloaded').catch(() => {});
    await this.page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
    // wait for skeletons / spinners to disappear (best effort)
    await this.page.waitForFunction(() => !document.querySelector('[aria-busy="true"], .animate-pulse'), null, { timeout: 5000 }).catch(() => {});
    await this.wait(extra);
    // re-show the fake cursor on a freshly loaded document (it only appears on mousemove)
    await this.page.mouse.move(this.mouse.x + 1, this.mouse.y).catch(() => {});
    await this.page.mouse.move(this.mouse.x, this.mouse.y).catch(() => {});
    await this.checkError();
  }

  async checkError() {
    const bad = await this.page.getByText(/^(something went wrong|page not found)$/i).first().isVisible().catch(() => false);
    if (bad) this.warn(`error screen at ${this.page.url()}`);
    return bad;
  }

  async goto(url) {
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    await this.settle();
    if (this.caption) await this.setCaption(this.caption.text, this.caption.chip);
  }

  async moveTo(x, y, steps = 22) {
    await this.page.mouse.move(x, y, { steps });
    this.mouse = { x, y };
  }

  async hover(locator) {
    const box = await this.box(locator);
    await this.moveTo(box.x + box.width / 2, box.y + box.height / 2);
    await this.wait(250);
  }

  async box(locator) {
    await locator.waitFor({ state: 'visible', timeout: 10_000 });
    await locator.scrollIntoViewIfNeeded({ timeout: 2500 }).catch(() => {});
    const box = await locator.boundingBox();
    if (!box) throw new Error('element has no box');
    return box;
  }

  /** Hover if the element is present (no failure). Returns true when hovered. */
  async tryHover(locator) {
    try {
      await this.hover(locator.first());
      return true;
    } catch (e) {
      this.warn(`tryHover: ${String(e.message).split('\n')[0]}`);
      return false;
    }
  }

  /** Moves the visible cursor to the element and clicks it. */
  async click(locator, { settle = true } = {}) {
    const box = await this.box(locator);
    await this.moveTo(box.x + Math.min(box.width / 2, 120), box.y + box.height / 2);
    await this.wait(180);
    await this.page.mouse.down();
    await this.wait(60);
    await this.page.mouse.up();
    if (settle) await this.settle(500);
  }

  /** Click if the element is present (no failure). Returns true when clicked. */
  async tryClick(locator, opts) {
    try {
      if (!(await locator.first().isVisible({ timeout: 2500 }).catch(() => false))) {
        await locator.first().waitFor({ state: 'visible', timeout: 3000 });
      }
      await this.click(locator.first(), opts);
      return true;
    } catch (e) {
      this.warn(`tryClick: ${String(e.message).split('\n')[0]}`);
      return false;
    }
  }

  async type(locator, text, delay = 65) {
    await this.click(locator, { settle: false });
    await locator.fill('');
    await locator.pressSequentially(text, { delay });
  }

  /** Smooth wheel scroll at the current cursor position (works for window and inner scroll containers). */
  async scroll(dy, { x, y, stepPx = 60, stepMs = 22 } = {}) {
    if (x !== undefined) await this.moveTo(x, y, 10);
    const n = Math.max(1, Math.round(Math.abs(dy) / stepPx));
    for (let i = 0; i < n; i++) {
      await this.page.mouse.wheel(0, Math.sign(dy) * stepPx);
      await this.wait(stepMs);
    }
    await this.wait(250);
  }

  async scrollTop() {
    await this.page.evaluate(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      document.querySelectorAll('main, [data-scroll-container]').forEach((el) => el.scrollTo?.({ top: 0, behavior: 'smooth' }));
    });
    await this.wait(700);
  }

  /**
   * Sidebar navigation: expands the accordion group (if needed) and clicks the link; falls back to a direct URL.
   */
  async nav(group, item, url) {
    const p = this.page;
    try {
      const nav = p.locator('aside nav, nav[aria-label]').first();
      // link names may carry a badge ("Notifications 99+"): match the label at the start
      const name = typeof item === 'string' ? new RegExp(`^${item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`, 'i') : item;
      let link = nav.getByRole('link', { name }).first();
      if (!(await link.isVisible().catch(() => false)) && group) {
        const g = nav.getByRole('button', { name: group }).first();
        if ((await g.getAttribute('aria-expanded')) !== 'true') await this.click(g, { settle: false });
        await this.wait(350);
        link = nav.getByRole('link', { name }).first();
      }
      await this.click(link);
      if (url && !p.url().split('?')[0].startsWith(url.split('?')[0])) throw new Error(`landed on ${p.url()}`);
      if (url && url.includes('?')) await this.goto(url);
    } catch (e) {
      this.warn(`nav ${group ?? ''} > ${item}: ${String(e.message).split('\n')[0]} - using URL`);
      if (url) await this.goto(url);
    }
  }

  /** Saves a clean screenshot (overlays hidden). */
  async shot(name, { fullPage = false } = {}) {
    this.shotNo += 1;
    const file = path.join(this.shotDir, `${String(this.shotNo).padStart(2, '0')}-${name}.png`);
    await this.page.evaluate(() => document.documentElement.classList.add('__demo_hide')).catch(() => {});
    await this.page.screenshot({ path: file, fullPage }).catch((e) => this.warn(`screenshot ${name}: ${e.message}`));
    await this.page.evaluate(() => document.documentElement.classList.remove('__demo_hide')).catch(() => {});
    const last = this.chapters[this.chapters.length - 1];
    if (last && !last.shot) last.shot = file; // first screenshot of a screen is linked in coverage.md
    return file;
  }

  // ---- sign-in --------------------------------------------------------------------------------------------------
  /** Types credentials into the visible login form (public door or staff door) and submits. */
  async signIn(email, { submitWait = /\/(app|agent|hospital|gahi)\// } = {}) {
    const p = this.page;
    const emailBox = p.getByLabel(/^(work )?email( address)?\s*\*?$/i).first();
    const pwd = p.getByLabel(/^password\s*\*?$/i).first();
    await this.type(emailBox, email, 45);
    await this.type(pwd, PASSWORD, 55);
    await this.wait(300);
    for (let attempt = 0; attempt < 4; attempt++) {
      const resp = p.waitForResponse((r) => /\/auth\/(staff\/)?login$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST', { timeout: 30_000 });
      await this.click(p.getByRole('button', { name: /^(sign in|log ?in)$/i }).first(), { settle: false });
      const r = await resp;
      if (r.status() !== 429) break;
      this.warn('login rate-limited, waiting 30 s (cut from the video)');
      await this.offCamera(() => this.wait(30_000));
    }
    await p.waitForURL(submitWait, { timeout: 30_000 }).catch(() => {});
    await this.settle(800);
  }

  async signOutStaff() {
    // clear cookies / storage of the staff console so a second staff user can sign in
    await this.context.clearCookies();
    await this.page.evaluate(() => { try { localStorage.clear(); } catch {} }).catch(() => {});
  }

  // ---- finish ---------------------------------------------------------------------------------------------------
  async finish() {
    const video = this.page.video();
    await this.context.close();
    await this.browser.close();
    const webm = await video.path();
    const session = {
      role: this.role, label: this.label, part: this.part, base: this.base, outDir: this.outDir, rawDir: this.rawDir,
      webm, tStart: this.tStart, tEnd: this.tEnd, cuts: this.cuts, timeline: this.timeline, chapters: this.chapters, warnings: this.warnings,
    };
    fs.writeFileSync(path.join(this.rawDir, 'session.json'), JSON.stringify(session, null, 2));
    return finalize(session);
  }
}

/** Collects the narration lines of a script object { key: text } into the list Demo needs. */
export function linesOf(N) {
  return Object.values(N);
}
