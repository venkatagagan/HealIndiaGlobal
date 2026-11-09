// Joins the two staff-console parts into ONE walkthrough:
//   docs/demo/staff/parts/01-operations.mp4  (intro title card + "Part 1 · Operations"; record-staff-operations.mjs)
//   docs/demo/staff/parts/02-finance.mp4     ("Part 2 · Finance" chapter card; finance recording script)
//   docs/demo/staff/parts/99-outro.mp4       (narrated outro card; recorded here with the shared lib if missing)
// -> docs/demo/staff/staff-walkthrough.mp4 (+ .srt/.vtt, narration.json, staff-walkthrough.json, coverage.md)
//
// Every part is re-encoded through one concat filter (30 fps, yuv420p, 48 kHz stereo). Each part's audio is padded /
// trimmed to exactly its video length before the join, so the narration stays in sync across the joins; subtitle
// and chapter times are shifted by the cumulative part durations.
//
// Usage (repo root, after `source scripts/env.sh`):  node docs/demo/scripts/merge-staff.mjs [--outro]
//   --outro       re-record the outro clip even if it exists
//   --outro-only  only (re-)record the outro clip
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Demo, DEMO_DIR, FF, fmt } from './lib/recorder.mjs';
import { run, vtt } from './lib/tools.mjs';

const STAFF = path.join(DEMO_DIR, 'staff');
const PARTS = path.join(STAFF, 'parts');
const OUTRO_TEXT = "That's the staff console: operations and finance working together in one secure place. Thank you for watching.";

function streamDur(file, sel) {
  const out = execFileSync(FF.ffprobe, ['-v', 'error', '-select_streams', sel, '-show_entries', 'stream=duration', '-of', 'default=nw=1:nk=1', file]);
  return Number(String(out).trim().split(/\s+/)[0]);
}

async function recordOutro() {
  const d = new Demo({ role: 'staff', label: 'Staff console', lines: [OUTRO_TEXT] });
  const tmp = path.join(DEMO_DIR, '.cache', 'staff-outro'); // own folder: finalize() also writes narration.json/coverage.md
  fs.mkdirSync(tmp, { recursive: true });
  d.outDir = tmp;
  d.shotDir = path.join(STAFF, 'screenshots');
  d.base = '99-outro';
  d.rawDir = path.join(DEMO_DIR, '.cache', 'raw', 'staff-99-outro');
  await d.start();
  await d.card({ kicker: 'Thank you', title: 'Staff console walkthrough complete', subtitle: '', items: [] }, 500);
  d.tStart = d.now();
  await d.outro(OUTRO_TEXT, 'Every screen shown is the real running product with demo data.');
  await d.finish();
  for (const ext of ['mp4', 'srt', 'json']) fs.copyFileSync(path.join(tmp, `99-outro.${ext}`), path.join(PARTS, `99-outro.${ext}`));
}

function parseSrt(file) {
  const txt = fs.readFileSync(file, 'utf8').replace(/\r/g, '');
  const toS = (t) => { const [h, m, rest] = t.split(':'); const [s, ms] = rest.split(','); return +h * 3600 + +m * 60 + +s + +ms / 1000; };
  return txt.split(/\n\n+/).map((b) => b.trim()).filter(Boolean).map((b) => {
    const lines = b.split('\n');
    const i = lines.findIndex((l) => l.includes('-->'));
    const [a, z] = lines[i].split('-->').map((s) => toS(s.trim()));
    return { s: a, e: z, text: lines.slice(i + 1).join('\n') };
  });
}

function chaptersOf(base) {
  const j = path.join(PARTS, `${base}.json`);
  if (fs.existsSync(j)) return JSON.parse(fs.readFileSync(j, 'utf8')).chapters ?? [];
  // fallback: a coverage table "| # | time | screen | screenshot |"
  const md = [path.join(PARTS, `${base}-coverage.md`), path.join(PARTS, 'coverage.md')].find((f) => fs.existsSync(f));
  if (!md) return [];
  return fs.readFileSync(md, 'utf8').split('\n').filter((l) => /^\|\s*\d+\s*\|/.test(l)).map((l) => {
    const c = l.split('|').map((s) => s.trim());
    const [m, s] = c[2].split(':').map(Number);
    const shot = (c[4].match(/\]\(([^)]+)\)/) ?? [])[1] ?? null;
    return { t: m * 60 + s, title: c[3], shot };
  });
}

// ---------------------------------------------------------------------------------------------------------------
const parts = [
  { base: '01-operations', label: 'Part 1 · Operations' },
  { base: '02-finance', label: 'Part 2 · Finance' },
  { base: '99-outro', label: 'Outro' },
];
if (process.argv.includes('--outro-only')) { await recordOutro(); process.exit(0); }
for (const p of parts.slice(0, 2)) {
  if (!fs.existsSync(path.join(PARTS, `${p.base}.mp4`))) throw new Error(`missing ${p.base}.mp4 in ${PARTS}`);
}
if (process.argv.includes('--outro') || !fs.existsSync(path.join(PARTS, '99-outro.mp4'))) await recordOutro();

let offset = 0;
const inputs = [];
const filters = [];
const cues = [];
const chapters = [];
parts.forEach((p, i) => {
  const file = path.join(PARTS, `${p.base}.mp4`);
  const v = streamDur(file, 'v:0');
  const a = streamDur(file, 'a:0');
  p.file = file;
  p.dur = v;
  p.offset = offset;
  console.log(`${p.base}: video ${v.toFixed(2)} s, audio ${a.toFixed(2)} s (diff ${(a - v).toFixed(2)} s), starts at ${fmt(offset)}`);
  inputs.push('-i', file);
  filters.push(`[${i}:v]fps=30,scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p,setpts=PTS-STARTPTS[v${i}]`);
  filters.push(`[${i}:a]aresample=48000,aformat=channel_layouts=stereo,apad,atrim=0:${v.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`);
  const srt = path.join(PARTS, `${p.base}.srt`);
  if (fs.existsSync(srt)) for (const c of parseSrt(srt)) cues.push({ s: c.s + offset, e: Math.min(c.e, v) + offset, text: c.text });
  for (const c of chaptersOf(p.base)) {
    if (/^Intro$/.test(c.title) && i > 0) continue;
    if (c.title === 'Outro' && i < parts.length - 1) c.title = `${p.label.replace(/^Part \d+ · /, '')} wrap-up`; // a part's closing line
    chapters.push({ t: c.t + offset, title: c.title, part: p.label, shot: c.shot ? path.basename(c.shot) : null });
  }
  offset += v;
});
filters.push(`${parts.map((_, i) => `[v${i}][a${i}]`).join('')}concat=n=${parts.length}:v=1:a=1[v][a]`);
const script = path.join(DEMO_DIR, '.cache', 'staff-merge.filter');
fs.writeFileSync(script, filters.join(';\n'));
const out = path.join(STAFF, 'staff-walkthrough.mp4');
run(FF.ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', ...inputs, '-/filter_complex', script, '-map', '[v]', '-map', '[a]',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30',
  '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-movflags', '+faststart', out]);

// subtitles / narration
for (let i = 0; i < cues.length - 1; i++) cues[i].e = Math.min(cues[i].e, cues[i + 1].s - 0.05);
fs.writeFileSync(path.join(STAFF, 'staff-walkthrough.srt'),
  cues.map((c, i) => `${i + 1}\n${vtt(c.s).replace('.', ',')} --> ${vtt(c.e).replace('.', ',')}\n${c.text}\n`).join('\n'));
fs.writeFileSync(path.join(STAFF, 'staff-walkthrough.vtt'), `WEBVTT\n\n${cues.map((c) => `${vtt(c.s)} --> ${vtt(c.e)}\n${c.text}\n`).join('\n')}`);
fs.writeFileSync(path.join(STAFF, 'narration.json'), JSON.stringify(cues.map((c) => ({ start: +c.s.toFixed(2), end: +c.e.toFixed(2), text: c.text })), null, 2));

// coverage checklist (both parts, merged timestamps)
const vd = streamDur(out, 'v:0');
const ad = streamDur(out, 'a:0');
const size = fs.statSync(out).size;
// optional per-part notes (screens not shown and why): parts/01-operations-notes.md, parts/02-finance-notes.md
const extra = ['01-operations-notes.md', '02-finance-notes.md'].map((f) => path.join(PARTS, f)).filter((f) => fs.existsSync(f))
  .map((f) => `\n${fs.readFileSync(f, 'utf8').trim()}\n`).join('');
let md = '# Staff console walkthrough - screen checklist\n\n' +
  `Video: \`staff-walkthrough.mp4\` (${fmt(vd)}, ${(size / 1048576).toFixed(1)} MB). Part 1 (operations) starts at 0:00, ` +
  `part 2 (finance) at ${fmt(parts[1].offset)}, outro at ${fmt(parts[2].offset)}. Each row is a screen shown in the video ` +
  '(timestamps are in the merged video).\n';
let lastPart = '';
let n = 0;
for (const c of chapters) {
  if (c.part !== lastPart) {
    md += `\n## ${c.part}\n\n| # | Time | Screen | Screenshot |\n|---|---|---|---|\n`;
    lastPart = c.part;
  }
  n += 1;
  md += `| ${n} | ${fmt(c.t)} | ${c.title} | ${c.shot ? `[${c.shot}](screenshots/${c.shot})` : '-'} |\n`;
}
fs.writeFileSync(path.join(STAFF, 'coverage.md'), md + extra);
fs.writeFileSync(path.join(STAFF, 'staff-walkthrough.json'), JSON.stringify({
  file: 'staff/staff-walkthrough.mp4', duration: +vd.toFixed(2), durationText: fmt(vd), audioDuration: +ad.toFixed(2), size,
  parts: parts.map((p) => ({ base: p.base, label: p.label, start: +p.offset.toFixed(2), duration: +p.dur.toFixed(2) })),
  chapters: chapters.map((c) => ({ ...c, t: +c.t.toFixed(1) })),
}, null, 2));

// frames around each join (sync / blank check)
const frameDir = path.join(DEMO_DIR, '.cache', 'frames', 'staff-walkthrough');
fs.rmSync(frameDir, { recursive: true, force: true });
fs.mkdirSync(frameDir, { recursive: true });
for (const t of [2, parts[1].offset - 1, parts[1].offset + 1.5, parts[2].offset - 1, parts[2].offset + 1.5, vd - 1]) {
  run(FF.ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-ss', t.toFixed(2), '-i', out, '-frames:v', '1', path.join(frameDir, `t${String(Math.round(t)).padStart(4, '0')}.png`)]);
}
console.log(`staff-walkthrough.mp4 ${fmt(vd)} (video ${vd.toFixed(2)} s, audio ${ad.toFixed(2)} s) ${(size / 1048576).toFixed(1)} MB, ${cues.length} cues, ${chapters.length} chapters`);
