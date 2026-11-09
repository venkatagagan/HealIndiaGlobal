// Builds docs/demo/index.html - a local gallery (video player with subtitles + chapter list + screenshot grid per role)
// from whatever role folders exist under docs/demo/.  Run after recording:  node docs/demo/scripts/build-gallery.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEMO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORDER = ['patient', 'agent', 'hospital', 'staff'];
const SKIP = new Set(['scripts', '.cache', 'admin', 'finance']); // admin + finance are merged into "staff"
const LABELS = { patient: 'Patient', agent: 'Agent / facilitator', hospital: 'Hospital', staff: 'Staff console (operations + finance)' };

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmt = (s) => `${Math.floor(Math.round(s) / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`;

const roles = fs.readdirSync(DEMO, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !SKIP.has(e.name) && !e.name.startsWith('_') && !e.name.startsWith('.'))
  .map((e) => e.name)
  .sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b));

const sections = roles.map((role) => {
  const dir = path.join(DEMO, role);
  const files = fs.readdirSync(dir);
  const videos = files.filter((f) => f.endsWith('.mp4')).sort().map((mp4) => {
    const base = mp4.replace(/\.mp4$/, '');
    let meta = {};
    try { meta = JSON.parse(fs.readFileSync(path.join(dir, `${base}.json`), 'utf8')); } catch {}
    const size = fs.statSync(path.join(dir, mp4)).size;
    return { mp4: `${role}/${mp4}`, vtt: files.includes(`${base}.vtt`) ? `${role}/${base}.vtt` : null, title: base, meta, size };
  });
  const shotDir = path.join(dir, 'screenshots');
  const shots = fs.existsSync(shotDir) ? fs.readdirSync(shotDir).filter((f) => f.endsWith('.png')).sort() : [];
  return { role, label: LABELS[role] ?? role, videos, shots };
});

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Heal India Global — Product walkthroughs</title>
<style>
:root{--bg:#f6f8fb;--card:#fff;--fg:#0f172a;--muted:#64748b;--line:#e2e8f0;--accent:#0f9d58;--accent2:#6d28d9}
@media (prefers-color-scheme:dark){:root{--bg:#0b1120;--card:#111827;--fg:#e5e7eb;--muted:#94a3b8;--line:#1f2937}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 Inter,'Segoe UI',system-ui,sans-serif}
header{padding:40px 24px 24px;max-width:1280px;margin:0 auto}
h1{margin:0 0 6px;font-size:30px;letter-spacing:-.5px}
header p{margin:0;color:var(--muted)}
nav.toc{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}
nav.toc a{padding:6px 14px;border-radius:999px;border:1px solid var(--line);color:var(--fg);text-decoration:none;background:var(--card)}
nav.toc a:hover{border-color:var(--accent)}
main{max-width:1280px;margin:0 auto;padding:0 24px 60px}
section{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:24px;margin:22px 0}
h2{margin:0 0 4px;font-size:22px}
.meta{color:var(--muted);font-size:13px;margin-bottom:14px}
.player{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:18px;margin-bottom:18px}
video{width:100%;border-radius:12px;background:#000;aspect-ratio:16/9}
.chapters{max-height:420px;overflow:auto;border:1px solid var(--line);border-radius:12px;padding:6px}
.chapters button{display:flex;gap:10px;width:100%;text-align:left;background:none;border:0;color:var(--fg);padding:6px 8px;border-radius:8px;cursor:pointer;font:inherit;font-size:13px}
.chapters button:hover{background:color-mix(in srgb,var(--accent) 12%,transparent)}
.chapters time{color:var(--accent);font-variant-numeric:tabular-nums;min-width:38px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}
.grid a{display:block;border:1px solid var(--line);border-radius:10px;overflow:hidden;color:var(--muted);text-decoration:none;font-size:12px;background:var(--bg)}
.grid img{width:100%;aspect-ratio:16/9;object-fit:cover;object-position:top;display:block}
.grid span{display:block;padding:6px 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.warn{color:#b45309;font-size:12px}
details summary{cursor:pointer;color:var(--muted);margin:8px 0}
@media (max-width:900px){.player{grid-template-columns:1fr}.chapters{max-height:220px}}
</style>
</head>
<body>
<header>
  <h1>Heal India Global — product walkthroughs</h1>
  <p>Narrated recordings of the real running product (demo data), one per role, with subtitles, chapters and screenshots.
  Re-record: <code>node docs/demo/scripts/record-&lt;role&gt;.mjs</code>, then <code>node docs/demo/scripts/build-gallery.mjs</code>.</p>
  <nav class="toc">${sections.map((s) => `<a href="#${s.role}">${esc(s.label)}</a>`).join('')}</nav>
</header>
<main>
${sections.map((s) => `<section id="${s.role}">
  <h2>${esc(s.label)}</h2>
  ${s.videos.length ? '' : '<p class="meta">No video recorded yet.</p>'}
  ${s.videos.map((v, i) => `<div class="meta">${esc(v.title)}.mp4 · ${v.meta.durationText ?? ''} · ${(v.size / 1048576).toFixed(1)} MB${v.meta.chapters ? ` · ${v.meta.chapters.length} screens` : ''}</div>
  <div class="player">
    <video id="v-${s.role}-${i}" controls preload="metadata" src="${esc(v.mp4)}">${v.vtt ? `<track kind="subtitles" srclang="en" label="English" src="${esc(v.vtt)}">` : ''}</video>
    <div class="chapters">${(v.meta.chapters ?? []).map((c) => `<button data-v="v-${s.role}-${i}" data-t="${c.t}"><time>${fmt(c.t)}</time><span>${esc(c.title)}</span></button>`).join('')}</div>
  </div>`).join('\n')}
  ${s.shots.length ? `<details open><summary>${s.shots.length} screenshots</summary><div class="grid">${s.shots.map((f) => `<a href="${s.role}/screenshots/${esc(f)}" target="_blank" rel="noopener"><img loading="lazy" src="${s.role}/screenshots/${esc(f)}" alt="${esc(f)}"><span>${esc(f.replace(/\.png$/, ''))}</span></a>`).join('')}</div></details>` : ''}
</section>`).join('\n')}
</main>
<script>
document.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-v]');
  if (!b) return;
  const v = document.getElementById(b.dataset.v);
  v.currentTime = Number(b.dataset.t);
  v.play();
});
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(DEMO, 'index.html'), html);
console.log(`gallery: ${sections.map((s) => `${s.role}(${s.videos.length} video, ${s.shots.length} shots)`).join(', ')} -> ${path.join(DEMO, 'index.html')}`);
