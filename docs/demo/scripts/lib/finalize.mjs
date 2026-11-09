// Post-processing of one recording session (called by Demo.finish(); can be re-run on its own):
//   node docs/demo/scripts/lib/finalize.mjs docs/demo/.cache/raw/<base>/session.json
//
// Produces in docs/demo/<role>/:
//   <base>.mp4            H.264 (yuv420p, CRF 20, 30 fps, faststart) + AAC 128k narration (loudnorm I=-16)
//   <base>.srt / .vtt     subtitles = the narration text, timed to the voice
//   narration.json        (narration-<part>.json for parts) every line with start/end seconds
//   coverage.md           (coverage-<part>.md) screen checklist: screen -> timestamp -> screenshot
//   <base>.json           summary (duration, size, chapters, warnings, frame-check results)
// Frame check: frames at 2/10/20 s and end-20/-10/-2 s are extracted to .cache/frames/<base>/ and tiny (blank) ones flagged.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DEMO_DIR, FF, fmt, probeDuration, run, vtt } from './tools.mjs';

export function finalize(session) {
  const { base, outDir, rawDir, webm, timeline, chapters, warnings = [], label } = session;
  const suffix = session.part ? `-${session.part}` : '';
  const ts = Math.max(0, session.tStart - 0.05);
  const te = session.tEnd;
  // kept segments = [ts, te] minus the off-camera cuts (rate-limit waits, data preparation...)
  const cuts = (session.cuts ?? []).filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const segs = [];
  let cur = ts;
  for (const [a, b] of cuts) {
    if (b <= cur || a >= te) continue;
    if (a > cur) segs.push([cur, a]);
    cur = Math.max(cur, b);
  }
  if (cur < te) segs.push([cur, te]);
  /** raw recording time -> output time */
  const map = (t) => segs.reduce((acc, [a, b]) => acc + Math.max(0, Math.min(t, b) - a), 0);
  const dur = map(te);
  const out = path.join(outDir, `${base}.mp4`);
  const narr = path.join(rawDir, 'narration.wav');

  // 1. narration track: each clip delayed to its logged start, mixed, padded to the video length, normalised
  const inputs = [];
  const filters = [];
  timeline.forEach((l, i) => {
    inputs.push('-i', l.file);
    const ms = Math.max(0, Math.round(map(l.t) * 1000));
    filters.push(`[${i}:a]aresample=48000,aformat=channel_layouts=mono,adelay=${ms}:all=1[a${i}]`);
  });
  const mix = `${timeline.map((_, i) => `[a${i}]`).join('')}amix=inputs=${timeline.length}:normalize=0:dropout_transition=0,` +
    `apad=whole_dur=${dur.toFixed(3)},atrim=0:${dur.toFixed(3)},loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[out]`;
  const script = path.join(rawDir, 'narration.filter');
  fs.writeFileSync(script, [...filters, mix].join(';\n'));
  run(FF.ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', ...inputs, '-/filter_complex', script, '-map', '[out]', '-ac', '2', narr]);

  // 2. cut the blank start/end (and off-camera segments) of the WebM, encode H.264 and mux the narration
  const enc = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30',
    '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-shortest', out];
  if (segs.length === 1) {
    run(FF.ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-ss', ts.toFixed(3), '-t', dur.toFixed(3), '-i', webm, '-i', narr,
      '-map', '0:v:0', '-map', '1:a:0', ...enc]);
  } else {
    const vf = segs.map(([a, b], i) => `[0:v]fps=30,trim=start=${a.toFixed(3)}:end=${b.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`);
    vf.push(`${segs.map((_, i) => `[v${i}]`).join('')}concat=n=${segs.length}:v=1:a=0[v]`);
    const vscript = path.join(rawDir, 'video.filter');
    fs.writeFileSync(vscript, vf.join(';\n'));
    run(FF.ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', webm, '-i', narr, '-/filter_complex', vscript,
      '-map', '[v]', '-map', '1:a:0', ...enc]);
  }

  // 3. subtitles, narration log, chapters / coverage checklist
  const cues = timeline.map((l) => ({ s: map(l.t), e: map(l.t) + l.dur + 0.4, text: l.text }));
  for (let i = 0; i < cues.length - 1; i++) cues[i].e = Math.min(cues[i].e, cues[i + 1].s - 0.05);
  fs.writeFileSync(path.join(outDir, `${base}.vtt`), `WEBVTT\n\n${cues.map((c) => `${vtt(c.s)} --> ${vtt(c.e)}\n${c.text}\n`).join('\n')}`);
  fs.writeFileSync(path.join(outDir, `${base}.srt`),
    cues.map((c, i) => `${i + 1}\n${vtt(c.s).replace('.', ',')} --> ${vtt(c.e).replace('.', ',')}\n${c.text}\n`).join('\n'));
  fs.writeFileSync(path.join(outDir, `narration${suffix}.json`),
    JSON.stringify(cues.map((c) => ({ start: +c.s.toFixed(2), end: +c.e.toFixed(2), text: c.text })), null, 2));
  const chaps = chapters.map((c) => ({ ...c, t: map(c.t) }));
  const rel = (f) => path.relative(outDir, f).replace(/\\/g, '/');
  fs.writeFileSync(path.join(outDir, `coverage${suffix}.md`),
    `# ${label} walkthrough${session.part ? ` (${session.part})` : ''} - screen checklist\n\n` +
    `Video: \`${base}.mp4\` (${fmt(probeDuration(out))}). Each row is a screen shown in the video.\n\n` +
    `| # | Time | Screen | Screenshot |\n|---|---|---|---|\n` +
    chaps.map((c, i) => `| ${i + 1} | ${fmt(c.t)} | ${c.title} | ${c.shot ? `[${path.basename(c.shot)}](${rel(c.shot)})` : '-'} |`).join('\n') + '\n');

  // 4. frame check (first and last 20 s)
  const final = probeDuration(out);
  const frameDir = path.join(DEMO_DIR, '.cache', 'frames', base);
  fs.rmSync(frameDir, { recursive: true, force: true });
  fs.mkdirSync(frameDir, { recursive: true });
  const frames = [];
  for (const t of [2, 10, 20, final - 20, final - 10, final - 2].filter((t) => t > 0 && t < final)) {
    const f = path.join(frameDir, `t${String(Math.round(t)).padStart(4, '0')}.png`);
    run(FF.ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-ss', t.toFixed(2), '-i', out, '-frames:v', '1', f]);
    const size = fs.statSync(f).size;
    frames.push({ t: +t.toFixed(1), file: f, size, blank: size < 25_000 });
  }
  const blank = frames.filter((f) => f.blank);
  if (blank.length) warnings.push(`possibly blank frames at ${blank.map((f) => `${f.t}s`).join(', ')}`);

  const info = {
    file: path.relative(DEMO_DIR, out).replace(/\\/g, '/'),
    duration: +final.toFixed(2),
    durationText: fmt(final),
    size: fs.statSync(out).size,
    chapters: chaps.map((c) => ({ t: +c.t.toFixed(1), title: c.title, shot: c.shot ? rel(c.shot) : null })),
    frames,
    warnings,
  };
  fs.writeFileSync(path.join(outDir, `${base}.json`), JSON.stringify(info, null, 2));
  console.log(`[${base}] rendered ${out} ${fmt(final)} ${(info.size / 1048576).toFixed(1)} MB; ${warnings.length} warning(s); frames: ${frames.map((f) => `${f.t}s=${Math.round(f.size / 1024)}KB`).join(' ')}`);
  return info;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: node finalize.mjs <docs/demo/.cache/raw/<base>/session.json>');
    process.exit(2);
  }
  finalize(JSON.parse(fs.readFileSync(file, 'utf8')));
}
