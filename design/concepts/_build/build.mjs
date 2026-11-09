// Builds the inner pages of every theme (treatments, hospitals, cities, doctors, guides, partners, sign-in) from the
// API snapshot in _build/data and the guides in content/en. Each page reuses its theme's own head, header, menus,
// footer and scripts, so the four themes stay four complete sites.
// Run: node design/concepts/_build/build.mjs   (re-run after editing a theme's index.html, the data or the guides)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const REPO = path.resolve(ROOT, '../..');
const CONTENT = path.join(REPO, 'content/en');
const NM = path.join(REPO, 'website/node_modules');
const { micromark } = await import(pathToFileURL(path.join(NM, 'micromark/index.js')));
const { gfm, gfmHtml } = await import(pathToFileURL(path.join(NM, 'micromark-extension-gfm/index.js')));

const THEMES = [['concept-main', 'm'], ['concept-a-editorial', 'a'], ['concept-b-clinical', 'b'], ['concept-c-journey', 'c']];
const GENERATED = ['treatments', 'hospitals', 'cities', 'doctors', 'plan-your-trip', 'partners', 'login', 'assessment', 'costs',
  'support', 'about', 'contact', 'careers', 'faq', 'privacy', 'terms', 'cookies', 'accessibility', 'second-opinion',
  'how-quotes-work', 'accreditation', 'how-we-verify', 'international-desks', 'video-consultation', 'how-we-vet-doctors'];
const ASSET_V = 2;

/* ---------- helpers ---------- */
const read = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const json = (f) => JSON.parse(read(f));
const D = (...p) => path.join(HERE, 'data', ...p);
const list = (x) => (Array.isArray(x) ? x : x.items);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const strip = (s) => s.replace(/<[^>]+>/g, '');
const slugify = (s) => strip(s).toLowerCase().replace(/&amp;|&/g, ' and ').replace(/[^a-z0-9\s-]/g, '').trim().replace(/[\s-]+/g, '-');
const trim = (s, n) => (s.length <= n ? s : s.slice(0, s.lastIndexOf(' ', n)).replace(/[,;:]$/, '') + '…');
const plural = (n, one, many) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
const days = (n) => (n === 1 ? '1 day' : `${n} days`);
const initials = (n) => n.replace(/^Dr\.?\s+/, '').split(/\s+/).filter((w) => /^[A-Z]/.test(w)).slice(0, 2).map((w) => w[0]).join('');
const FX = Object.fromEntries(json(D('fx.json')).map((r) => [r.quote_currency, +r.rate]));
const usd = (minor, cur = 'INR') => ((minor / 100) * (cur === 'INR' ? 1 : FX[cur])) / FX.USD;
const money = (n) => '$' + (n < 1000 ? Math.max(10, Math.round(n / 10) * 10) : Math.round(n / 100) * 100).toLocaleString('en-US');
const range = (a, b, cur) => `${money(usd(a, cur))} – ${money(usd(b, cur))}`;
const enc = encodeURIComponent;

/* ---------- markdown ---------- */
const MDLINK = {
  'in-country-guide.md': 'plan-your-trip/in-country-guide/', 'pre-arrival-guide.md': 'plan-your-trip/pre-arrival-guide/',
  'post-treatment-care.md': 'plan-your-trip/recovery-and-going-home/', 'payments-and-refunds.md': 'plan-your-trip/costs-and-payment/',
  'faq.md': 'faq/', 'visa-overview.md': 'plan-your-trip/e-medical-visa/', 'privacy-in-plain-language.md': 'privacy/',
};
function frontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?/);
  const fm = {};
  if (m) {
    for (const l of m[1].split('\n')) { const k = l.match(/^(\w+):\s*"?(.*?)"?\s*$/); if (k) fm[k[1]] = k[2]; }
    md = md.slice(m[0].length);
  }
  return { fm, body: md };
}
const doc = (name) => frontmatter(read(path.join(CONTENT, name)));
function dropRelated(md) { // the "Related guides" list points at the old site; pages add their own related links
  return md.replace(/\n## Related guides\n[\s\S]*?(?=\n>|\n#|$)/, '\n');
}
function section(md, heading, { level = 2, title } = {}) {
  const lines = md.split('\n');
  const i = lines.findIndex((l) => /^#+\s/.test(l) && l.replace(/^#+\s*/, '').trim() === heading);
  if (i < 0) throw new Error('Section not found: ' + heading);
  const lv = lines[i].match(/^#+/)[0].length;
  let j = i + 1;
  while (j < lines.length && !(/^#+\s/.test(lines[j]) && lines[j].match(/^#+/)[0].length <= lv)) j++;
  const out = lines.slice(i, j).map((l) => (/^#+\s/.test(l) ? '#'.repeat(Math.max(2, l.match(/^#+/)[0].length + level - lv)) + l.replace(/^#+/, '') : l));
  if (title) out[0] = '#'.repeat(level) + ' ' + title;
  return out.join('\n');
}
let PROC_GUIDE = {}; // guide file name -> procedure page path (filled after data load)
function md(src) {
  const body = dropRelated(src.replace(/^# .*\n/m, ''));
  let html = micromark(body, { extensions: [gfm()], htmlExtensions: [gfmHtml()] });
  html = html.replace(/<a href="([^"]*)">([\s\S]*?)<\/a>/g, (m, href, text) => {
    if (/^(https?:|mailto:|#)/.test(href)) return /^https?:/.test(href) ? `<a href="${href}" target="_blank" rel="noopener">${text}</a>` : m;
    const [file, hash] = href.split('#');
    const base = file.split('/').pop();
    let to = MDLINK[base];
    if (!to && /cities\//.test(file) && CITY_BY[base.replace('.md', '')]) to = `cities/${base.replace('.md', '')}/`;
    if (!to && /procedures\//.test(file)) to = PROC_GUIDE[base];
    return to ? `<a href="@@/${to}${hash ? '#' + hash : ''}">${text}</a>` : text;
  });
  const toc = [];
  html = html.replace(/<h([23])>([\s\S]*?)<\/h\1>/g, (m, n, text) => {
    const id = slugify(text);
    if (n === '2') toc.push([id, strip(text)]);
    return `<h${n} id="${id}">${text}</h${n}>`;
  });
  return { html, toc };
}

/* ---------- data ---------- */
const CITIES = [
  { key: 'delhi-ncr', name: 'Delhi NCR', code: 'DEL', line: 'The capital region, with Delhi and Gurugram hospitals', img: '1765024540871-16f5e5dbcd4b', alt: "Visitors walking towards Humayun's Tomb in Delhi" },
  { key: 'chennai', name: 'Chennai', code: 'MAA', line: 'A long-standing hub for international patients', img: '1582510003544-4d00b7f74220', alt: 'A temple gopuram lit at night under a starry sky' },
  { key: 'mumbai', name: 'Mumbai', code: 'BOM', line: 'The coastal financial capital', img: '1785768569545-a0b75d68006f', alt: 'The Gateway of India and the Mumbai waterfront skyline' },
  { key: 'bengaluru', name: 'Bengaluru', code: 'BLR', line: 'Mild climate all year round', img: '1698332137428-3c4296198e8f', alt: 'The Vidhana Soudha in Bengaluru under a blue sky' },
  { key: 'hyderabad', name: 'Hyderabad', code: 'HYD', line: 'Major multi-specialty centres', img: '1741545979534-02f59c742730', alt: 'The Charminar in Hyderabad' },
  { key: 'vijayawada', name: 'Vijayawada', code: 'VGA', line: 'On the banks of the Krishna', img: 'px:15877640', alt: 'The bridge over the Krishna river in Vijayawada at sunrise' },
  { key: 'visakhapatnam', name: 'Visakhapatnam', code: 'VTZ', line: 'Hills meet the Bay of Bengal', img: '1655979521437-ae1875109d79', alt: 'The Visakhapatnam coastline with green hills and beach' },
];
const CITY_BY = Object.fromEntries(CITIES.map((c) => [c.key, c]));
const IMG = (id, w, h) => (/^px:/.test(id)
  ? `https://images.pexels.com/photos/${id.slice(3)}/pexels-photo-${id.slice(3)}.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=${w}&h=${h}`
  : `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&h=${h}&q=80`);
for (const c of CITIES) {
  const g = doc(`cities/${c.key}.md`);
  c.summary = g.fm.summary || '';
  c.guide = g.body;
  const air = g.body.match(/\| Main airport \| ([^|]+) \|/);
  c.airport = air ? air[1].trim().split(/\.\s/)[0].replace(/\s*\([A-Z]{3}\)/, '').replace(/\.$/, '') : c.code; // first airport, without the code shown beside it
  const st = g.body.match(/\| State\/territory \| ([^|]+) \|/);
  c.state = st ? st[1].trim() : '';
}

// The home page promises 14 hospitals in these 7 cities. Seven seed hospitals already sit in them; the other seven
// seed profiles are placed in the remaining cities under new sample names (all names are fictional sample data).
const RELOC = {
  'hooghly-valley-kolkata': { slug: 'bluewater-mumbai', name: 'Bluewater Heart & Multispeciality Hospital', city: 'mumbai', area: 'Mumbai', state: 'Maharashtra', address: 'Andheri East, Mumbai', km: 9,
    desc: 'A referral centre for heart, brain and cancer care in the western suburbs, a short drive from the international airport. Case managers handle visas, pickups and affordable stays near the hospital.' },
  'aravali-heights-jaipur': { slug: 'silverwood-bengaluru', name: 'Silverwood Superspeciality Hospital', city: 'bengaluru', area: 'Bengaluru', state: 'Karnataka', address: 'Whitefield, Bengaluru', km: 38,
    desc: 'A friendly mid-sized hospital in east Bengaluru, offering knee replacement, aesthetic surgery, dental and eye care at accessible prices, with quiet green neighbourhoods nearby for recovery walks.' },
  'deccan-crest-pune': { slug: 'deccan-crest-hyderabad', name: 'Deccan Crest Multispeciality Hospital', city: 'hyderabad', area: 'Hyderabad', state: 'Telangana', address: 'Gachibowli, Hyderabad', km: 32,
    desc: "A compact, patient-friendly hospital in Hyderabad's western technology district, with a sports-medicine and joint-replacement centre, a spine unit, IVF lab, aesthetic surgery suite and laser eye clinic." },
  'shubh-arogya-ahmedabad': { slug: 'krishna-delta-vijayawada', name: 'Krishna Delta Institute of Medical Sciences', city: 'vijayawada', area: 'Vijayawada', state: 'Andhra Pradesh', address: 'Benz Circle, Vijayawada', km: 19,
    desc: 'A value-focused multispeciality hospital near the Krishna, with long-standing links to patients from East Africa. Known for bilateral knee replacement, cardiac care, robotic urology and a full-service dental implant centre.' },
  'yamuna-valley-noida': { slug: 'riverbend-vijayawada', name: 'Riverbend Superspeciality Hospital', city: 'vijayawada', area: 'Vijayawada', state: 'Andhra Pradesh', address: 'Gunadala, Vijayawada', km: 17,
    desc: 'A modern superspeciality hospital with strong orthopaedic, spine and neuroscience programmes, an advanced fertility centre and a day-care eye unit. Weekend clinics and an on-campus guest house for companions make longer stays easier.' },
  'shivalik-chandigarh': { slug: 'eastern-ghats-visakhapatnam', name: 'Eastern Ghats Institute of Medical Sciences', city: 'visakhapatnam', area: 'Visakhapatnam', state: 'Andhra Pradesh', address: 'Madhurawada, Visakhapatnam', km: 22,
    desc: 'A specialty-focused institute in the green hills north of the city, with a cochlear implant and hearing centre, retina and cornea services, joint replacement, an epilepsy clinic and fertility care.' },
  'vembanad-kochi': { slug: 'bayview-visakhapatnam', name: 'Bayview Integrative & Multispeciality Centre', city: 'visakhapatnam', area: 'Visakhapatnam', state: 'Andhra Pradesh', address: 'Beach Road, Visakhapatnam', km: 14,
    desc: 'An integrative hospital near the beach, combining modern joint replacement, cardiac and fertility care with a supervised Ayurveda and rehabilitation wing: a calm place to recover by the Bay of Bengal.' },
};
const AREA_CITY = { 'New Delhi': 'delhi-ncr', Gurugram: 'delhi-ncr', Chennai: 'chennai', Mumbai: 'mumbai', Bengaluru: 'bengaluru', Hyderabad: 'hyderabad' };

const SPEC_ROWS = [ // api slug, page slug, name, short line (first eight are the home page's specialties)
  ['cardiology', 'cardiac-sciences', 'Cardiac sciences', 'Bypass, valve repair, angioplasty'],
  ['orthopedics', 'orthopaedics', 'Orthopaedics', 'Knee, hip and shoulder replacement'],
  ['oncology', 'oncology', 'Oncology', 'Surgery, radiation and chemotherapy'],
  ['transplant', 'organ-transplant', 'Organ transplant', 'Kidney, liver and bone marrow'],
  ['neurology', 'neurosciences', 'Neurosciences', 'Brain and spine surgery, stroke care'],
  ['fertility', 'fertility-ivf', 'Fertility and IVF', 'IVF, ICSI and egg freezing'],
  ['bariatric', 'weight-loss-surgery', 'Weight-loss surgery', 'Sleeve gastrectomy, gastric bypass'],
  ['ophthalmology', 'eye-care', 'Eye care', 'Cataract, LASIK and retina surgery'],
  ['spine', 'spine-surgery', 'Spine surgery', 'Disc surgery, fusion and scoliosis correction'],
  ['cosmetic', 'cosmetic-surgery', 'Cosmetic and plastic surgery', 'Rhinoplasty, hair transplant, body contouring'],
  ['dental', 'dental-care', 'Dental care', 'Implants, veneers and full-mouth rehabilitation'],
  ['urology', 'urology', 'Urology', 'Kidney stones, prostate surgery'],
  ['gastroenterology', 'digestive-surgery', 'Digestive and GI surgery', 'Gallbladder, hernia and colorectal surgery'],
  ['ent', 'ent', 'Ear, nose and throat', 'Cochlear implants, sinus and thyroid surgery'],
  ['nephrology', 'kidney-care', 'Kidney care and dialysis', 'Dialysis courses and AV fistula'],
  ['wellness', 'wellness', 'Wellness and check-ups', 'Health check-ups and Ayurveda programmes'],
];
const apiSpecs = Object.fromEntries(list(json(D('specialties.json'))).map((s) => [s.slug, s]));
const SPECS = SPEC_ROWS.map(([api, slug, name, line], i) => ({ api, slug, name, line, featured: i < 8, ...pick(apiSpecs[api], ['description', 'savings_min_pct', 'savings_max_pct']), apiName: apiSpecs[api].name }));
function pick(o, keys) { return Object.fromEntries(keys.map((k) => [k, o[k]])); }
const SPEC = Object.fromEntries(SPECS.map((s) => [s.api, s]));
const SPEC_BY_NAME = Object.fromEntries(SPECS.map((s) => [s.apiName, s]));

const PROCS = list(json(D('procedures.json'))).map((p) => ({
  slug: p.slug, name: p.name, desc: p.description, spec: SPEC[p.specialty.slug], stay: p.hospital_stay_days, recovery: p.recovery_days,
  total: p.total_stay_days, min: p.india_price_min_minor, max: p.india_price_max_minor, benchmarks: p.benchmarks || [],
}));
for (const p of PROCS) p.path = `treatments/${p.spec.slug}/${p.slug}/`;
const PROC = Object.fromEntries(PROCS.map((p) => [p.slug, p]));
for (const f of fs.readdirSync(path.join(CONTENT, 'procedures'))) {
  const g = doc(`procedures/${f}`);
  const p = PROC[g.fm.catalog_slug];
  if (p) { p.guide = g.body; PROC_GUIDE[f] = p.path; }
}

const HOSPITALS = fs.readdirSync(D('hospitals')).map((f) => json(D('hospitals', f))).map((h) => {
  const r = RELOC[h.slug];
  return {
    slug: r ? r.slug : h.slug, name: r ? r.name : h.name, city: r ? r.city : AREA_CITY[h.city], area: r ? r.area : h.city,
    state: r ? r.state : h.state, address: r ? r.address : h.address, desc: r ? r.desc : h.description, km: r ? r.km : h.airport_distance_km,
    acc: h.accreditations, beds: h.bed_count, est: h.established_year, rating: h.rating_avg, ratings: h.rating_count, langs: h.languages,
    specs: h.specialties.map((n) => SPEC_BY_NAME[n]).filter(Boolean), intl: h.international_desk, from: h.starting_price_minor, oldSlug: h.slug,
    procs: h.procedures.map((p) => ({ proc: PROC[p.procedure.slug], min: p.price_min_minor, max: p.price_max_minor, stay: p.hospital_stay_days, incl: p.inclusions || [], excl: p.exclusions || [] })).filter((p) => p.proc),
  };
});
if (HOSPITALS.some((h) => !h.city)) throw new Error('Hospital without a city: ' + HOSPITALS.filter((h) => !h.city).map((h) => h.slug));
const HOSP_BY_OLD = Object.fromEntries(HOSPITALS.map((h) => [h.oldSlug, h]));
const HOSP = Object.fromEntries(HOSPITALS.map((h) => [h.slug, h]));
HOSPITALS.sort((a, b) => CITIES.findIndex((c) => c.key === a.city) - CITIES.findIndex((c) => c.key === b.city) || b.beds - a.beds);

const DOC_GROUPS = [
  { slug: 'cardiac-surgeons', name: 'Cardiac surgeons', specs: ['cardiology'], lead: 'Cardiac surgeons and interventional cardiologists for bypass, valve, angioplasty and congenital heart repair.' },
  { slug: 'orthopaedic-surgeons', name: 'Orthopaedic surgeons', specs: ['orthopedics'], lead: 'Joint-replacement and sports-medicine surgeons for knee, hip and shoulder surgery.' },
  { slug: 'oncologists', name: 'Oncologists', specs: ['oncology'], lead: 'Surgical, medical and radiation oncologists, with tumour-board opinions available before you travel.' },
  { slug: 'transplant-surgeons', name: 'Transplant surgeons', specs: ['transplant'], lead: 'Kidney, liver and bone marrow transplant specialists working in multidisciplinary transplant teams.' },
  { slug: 'neurosurgeons', name: 'Neurosurgeons', specs: ['neurology', 'spine'], lead: 'Neurosurgeons, neurologists and spine surgeons for brain, spine, epilepsy and movement disorders.' },
  { slug: 'fertility-specialists', name: 'Fertility specialists', specs: ['fertility'], lead: 'Reproductive medicine specialists for IVF, ICSI, IUI and egg freezing.' },
];
const groupOf = (api) => DOC_GROUPS.find((g) => g.specs.includes(api));
const DOCTORS = fs.readdirSync(D('doctors')).map((f) => json(D('doctors', f))).map((d) => ({
  slug: d.slug, name: d.full_name, spec: SPEC[d.specialty.slug], quals: d.qualifications || [], exp: d.experience_years, langs: d.languages || [],
  success: d.success_rate_pct, rating: d.rating_avg, ratings: d.rating_count, fee: d.consultation_fee_minor, tele: d.teleconsult_available,
  hosp: HOSP_BY_OLD[d.hospital.slug], bio: d.bio || '', subs: d.sub_specialties || [], next: d.next_available_date,
  procs: (d.procedures || []).map((p) => ({ proc: PROC[p.procedure.slug], min: p.price_min_minor, max: p.price_max_minor, stay: p.hospital_stay_days })).filter((p) => p.proc),
})).sort((a, b) => b.exp - a.exp);
for (const d of DOCTORS) d.group = groupOf(d.spec.api);
for (const h of HOSPITALS) h.doctors = DOCTORS.filter((d) => d.hosp === h);
for (const c of CITIES) { c.hospitals = HOSPITALS.filter((h) => h.city === c.key); c.doctors = DOCTORS.filter((d) => d.hosp.city === c.key); }
if (HOSPITALS.length !== 14 || CITIES.some((c) => !c.hospitals.length)) throw new Error('Expected 14 hospitals covering all 7 cities');

/* ---------- components ---------- */
const btn = (label, href, kind = 'primary') => `<a class="btn ${kind === 'primary' ? 'btn-primary' : 'btn-line'}" href="${href}">${label}</a>`;
const assess = (need) => `@@/assessment/${need ? '?need=' + enc(need) : ''}`;
function hero(o) {
  const crumbs = [['Home', '@@/'], ...(o.crumbs || [])];
  return `<section class="pg-hero${o.media ? ' pg-has-media' : ''}"><div class="wrap"><div class="pg-grid"><div>
<ol class="pg-crumbs" aria-label="Breadcrumb">${crumbs.map(([n, h], i) => (i === crumbs.length - 1 ? `<li aria-current="page">${esc(n)}</li>` : `<li><a href="${h}">${esc(n)}</a></li>`)).join('')}</ol>
${o.eyebrow ? `<p class="pg-eyebrow">${esc(o.eyebrow)}</p>` : ''}<h1>${o.title}</h1>${o.lead ? `<p class="pg-lead">${o.lead}</p>` : ''}${o.after || ''}${o.actions ? `<div class="pg-actions">${o.actions}</div>` : ''}</div>
${o.media ? `<figure class="pg-media"><img src="${o.media.src}" alt="${esc(o.media.alt)}" width="1200" height="900" fetchpriority="high"></figure>` : ''}</div>
${o.facts ? facts(o.facts) : ''}</div></section>`;
}
const facts = (rows) => `<dl class="pg-facts">${rows.map(([t, v, s]) => `<div><dt>${t}</dt><dd>${v}${s ? `<small>${s}</small>` : ''}</dd></div>`).join('')}</dl>`;
function sec(title, inner, o = {}) {
  return `<section class="pg-sec${o.alt ? ' pg-alt' : ''}"${o.id ? ` id="${o.id}"` : ''}><div class="wrap">${title ? `<div class="pg-head"><div><h2 class="pg-h2">${title}</h2>${o.sub ? `<p class="pg-sub">${o.sub}</p>` : ''}</div>${o.more || ''}</div>` : ''}${inner}</div></section>`;
}
const more = (label, href) => `<a class="pg-more" href="${href}">${label}</a>`;
const cta = (title = 'Begin with a free AI assessment.', text = 'Share your reports and receive matched hospitals with itemised quotes. Free, and without obligation.', actions) =>
  sec('', `<div class="pg-cta-band"><div><h2>${title}</h2><p>${text}</p></div><div class="pg-actions">${actions || btn('Get a free AI assessment', assess()) + btn('Talk to a coordinator', '@@/support/', 'line')}</div></div>`);
const SAMPLE = '<p class="pg-note pg-sample"><span><b>Sample profiles.</b> Hospital and doctor names, figures and ratings in this design preview are illustrative. At launch they come from the verified hospital database.</span></p>';
const badges = (acc) => `<div class="pg-tags">${acc.map((a) => `<span class="pg-badge ${a}">${a.toUpperCase()}</span>`).join('')}</div>`;
function hospCard(h) {
  const c = CITY_BY[h.city];
  return `<article class="pg-card" data-city="${h.city}"><div class="pg-card-top"><span class="pg-mono" aria-hidden="true">${initials(h.name)}</span><div><h3><a class="pg-card-link" href="@@/hospitals/${h.slug}/">${esc(h.name)}</a></h3><div class="pg-city-line">${esc(h.area === c.name ? c.name : `${h.area}, ${c.name}`)}</div></div></div>
${badges(h.acc)}<p>${esc(trim(h.desc, 150))}</p><div class="pg-meta"><span>${h.beds} beds</span><span>${h.km} km from ${c.code}</span><span>${plural(h.doctors.length, 'doctor', 'doctors')} listed</span></div>
<div class="pg-price">From ${money(usd(h.from))} <small>indicative, per procedure</small></div><span class="pg-go">View hospital</span></article>`;
}
function docCard(d) {
  const text = [d.name, d.spec.name, d.spec.apiName, d.hosp.name, CITY_BY[d.hosp.city].name, ...d.langs, ...d.subs].join(' ').toLowerCase();
  return `<article class="pg-card" data-group="${d.group ? d.group.slug : 'other'}" data-text="${esc(text)}"><div class="pg-card-top"><span class="pg-mono pg-avatar" aria-hidden="true">${initials(d.name)}</span><div><h3><a class="pg-card-link" href="@@/doctors/${d.slug}/">${esc(d.name)}</a></h3><div class="pg-city-line">${esc(d.spec.name)}</div></div></div>
<p>${esc(d.hosp.name)}, ${esc(CITY_BY[d.hosp.city].name)}</p><div class="pg-meta"><span>${d.exp} years' experience</span><span>${esc(d.langs.slice(0, 3).join(', '))}${d.langs.length > 3 ? ' +' + (d.langs.length - 3) : ''}</span></div>
${d.tele ? '<div class="pg-tags"><span class="pg-tag">Video consultation</span></div>' : ''}<span class="pg-go">View profile</span></article>`;
}
function procCard(p) {
  return `<article class="pg-card"><h3><a class="pg-card-link" href="@@/${p.path}">${esc(p.name)}</a></h3><p>${esc(trim(p.desc, 150))}</p>
<div class="pg-meta"><span>${p.stay ? 'Hospital stay ' + days(p.stay) : 'Day care'}</span><span>About ${days(p.total)} in India</span></div><div class="pg-price">From ${money(usd(p.min))} <small>indicative</small></div><span class="pg-go">See treatment</span></article>`;
}
function specCard(s) {
  const ps = PROCS.filter((p) => p.spec === s);
  return `<article class="pg-card"><h3><a class="pg-card-link" href="@@/treatments/${s.slug}/">${esc(s.name)}</a></h3><p>${esc(s.line)}</p><div class="pg-meta"><span>${plural(ps.length, 'treatment', 'treatments')}</span><span>${s.savings_min_pct}–${s.savings_max_pct}% below US prices</span></div><span class="pg-go">See treatments</span></article>`;
}
function tile(c, small) {
  return `<a class="pg-tile" href="@@/cities/${c.key}/"${small ? ' style="min-height:220px"' : ''}><img src="${IMG(c.img, 720, 720)}" alt="${esc(c.alt)}" loading="lazy" width="720" height="720"><span class="pg-iata">${c.code}</span><h3>${esc(c.name)}</h3><p>${esc(c.line)}</p><span class="pg-n">${plural(c.hospitals.length, 'partner hospital', 'partner hospitals')}</span></a>`;
}
function article(src, { toc = true } = {}) {
  const r = md(src);
  const showToc = toc && r.toc.length >= 3;
  return `<div class="pg-article">${showToc ? `<nav class="pg-toc" aria-label="On this page"><p>On this page</p><ol>${r.toc.map(([id, t]) => `<li><a href="#${id}">${esc(t)}</a></li>`).join('')}</ol></nav>` : '<div class="pg-toc-empty"></div>'}<div class="pg-prose">${r.html}</div></div>`;
}
const related = (items) => sec('Related', `<ul class="pg-list-links">${items.map(([label, href, small]) => `<li><a href="@@/${href}">${label}</a>${small ? `<small>${small}</small>` : ''}</li>`).join('')}</ul>`, { alt: true });
const tbl = (head, rows) => `<div class="pg-tbl-wrap"><table class="pg-tbl"><thead><tr>${head.map((h) => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
const COUNTRY = { AE: 'United Arab Emirates', AU: 'Australia', BD: 'Bangladesh', CA: 'Canada', GB: 'United Kingdom', KE: 'Kenya', NG: 'Nigeria', OM: 'Oman', SA: 'Saudi Arabia', US: 'United States' };
const COST_NOTE = 'Indicative hospital charges only. Flights, stay and follow-up care are extra. Your quote depends on your reports and the hospital you choose.';
const EMERGENCY = '<div class="pg-alert" role="note"><span><b>Emergency — seek local care now.</b> If you feel unwell before you travel, call your local emergency number first. We are not an emergency service.</span></div>';
const fmtDate = (s) => (s ? new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '');

/* ---------- pages ---------- */
const PAGES = []; // { path, title, desc, body }
const page = (p, title, desc, body) => PAGES.push({ path: p, title, desc, body });

// Treatments
page('treatments/', 'Treatments', 'More than 40 treatments at accredited hospitals in India, with typical time in India and indicative costs.',
  hero({ crumbs: [['Treatments']], eyebrow: 'Treatments', title: 'Care led by senior specialists, <em>quoted line by line.</em>',
    lead: 'Choose a specialty to see its treatments, the typical time you spend in India and indicative costs. Not sure what you need? A doctor reviews every free AI assessment.',
    actions: btn('Start an assessment', assess()) + btn('Indicative costs', '@@/costs/', 'line'),
    facts: [['Specialties', SPECS.length], ['Treatments', PROCS.length], ['Partner hospitals', HOSPITALS.length], ['Cities', CITIES.length]] })
  + sec('Eight specialties, <em>chosen for depth.</em>', `<div class="pg-cards">${SPECS.filter((s) => s.featured).map(specCard).join('')}</div>`, { sub: "We focus where India's accredited hospitals have the most experience with international patients." })
  + sec('More specialties', `<div class="pg-cards">${SPECS.filter((s) => !s.featured).map(specCard).join('')}</div>`, { alt: true })
  + sec('All treatments, A to Z', SPECS.map((s) => `<h3 style="margin:28px 0 8px;font-size:20px"><a href="@@/treatments/${s.slug}/" style="text-decoration:none;color:var(--navy)">${esc(s.name)}</a></h3><ul class="pg-list-links">${PROCS.filter((p) => p.spec === s).map((p) => `<li><a href="@@/${p.path}">${esc(p.name)}</a><small>India from ${money(usd(p.min))} · about ${days(p.total)} in India</small></li>`).join('')}</ul>`).join(''), { id: 'all' })
  + cta());

for (const s of SPECS) {
  const ps = PROCS.filter((p) => p.spec === s);
  const hs = HOSPITALS.filter((h) => h.specs.includes(s));
  const ds = DOCTORS.filter((d) => d.spec === s);
  const g = groupOf(s.api);
  page(`treatments/${s.slug}/`, s.name, `${s.name} in India: ${ps.length} treatments at accredited hospitals, with time in India and indicative costs.`,
    hero({ crumbs: [['Treatments', '@@/treatments/'], [s.name]], eyebrow: 'Specialty', title: esc(s.name), lead: esc(s.description),
      actions: btn('Get a free AI assessment', assess(s.name)) + btn('Compare costs', `@@/costs/?specialty=${s.slug}`, 'line'),
      facts: [['Treatments', ps.length], ['Typical saving', `${s.savings_min_pct}–${s.savings_max_pct}%`, 'vs US self-pay prices, indicative'], ['Partner hospitals', hs.length], ['Specialists listed', ds.length]] })
    + sec(`${esc(s.name)} treatments`, `<div class="pg-cards">${ps.map(procCard).join('')}</div>`, { sub: 'Specialists are named on every quote, with their training and experience.' })
    + (hs.length ? sec(`Hospitals for ${esc(s.name.toLowerCase())}`, `<div class="pg-cards">${hs.map(hospCard).join('')}</div>${SAMPLE}`, { alt: true, more: more('All hospitals', '@@/hospitals/') }) : '')
    + (ds.length ? sec('Specialists', `<div class="pg-cards">${ds.slice(0, 6).map(docCard).join('')}</div>`, { more: more(g ? `All ${g.name.toLowerCase()}` : 'All doctors', g ? `@@/doctors/${g.slug}/` : '@@/doctors/') }) : '')
    + cta());
}

for (const p of PROCS) {
  const hs = HOSPITALS.map((h) => ({ h, hp: h.procs.find((x) => x.proc === p) })).filter((x) => x.hp);
  let ds = DOCTORS.filter((d) => d.procs.some((x) => x.proc === p));
  if (!ds.length) ds = DOCTORS.filter((d) => d.spec === p.spec);
  const bench = p.benchmarks.map((b) => ({ c: COUNTRY[b.country_code] || b.country_code, min: usd(b.cost_min_minor, b.currency), max: usd(b.cost_max_minor, b.currency), wait: b.wait_time_text }))
    .sort((a, b) => (a.c === 'United States' ? -1 : b.c === 'United States' ? 1 : b.max - a.max));
  const inc = hs[0] ? hs[0].hp : null;
  const body = p.guide ? article(p.guide)
    : `<div class="pg-prose"><p>${esc(p.desc)}</p><p>A detailed guide for this treatment is being prepared. Your coordinator and the treating specialist answer your questions on the first call, and your quote lists every test and line of cost.</p></div>`;
  page(p.path, p.name, `${p.name} in India: what it involves, time in hospital and in India, and indicative costs at accredited hospitals.`,
    hero({ crumbs: [['Treatments', '@@/treatments/'], [p.spec.name, `@@/treatments/${p.spec.slug}/`], [p.name]], eyebrow: p.spec.name, title: esc(p.name), lead: esc(p.desc),
      actions: btn('Get a free AI assessment', assess(p.name)) + btn('Compare costs', '#costs', 'line'),
      facts: [['Indicative cost in India', range(p.min, p.max), 'Hospital charges, USD'], ['Time in hospital', p.stay ? days(p.stay) : 'Day care'], ['Recovery', days(p.recovery)], ['Typical time in India', days(p.total)]] })
    + sec(p.guide ? 'What to know' : 'About this treatment', body)
    + sec('Indicative costs compared', tbl(['Where', 'Typical price (USD)', 'Typical wait'], [
      `<tr class="pg-hl"><th scope="row">India, partner hospitals</th><td class="pg-num">${range(p.min, p.max)}</td><td>Dates agreed with you</td></tr>`,
      ...bench.map((b) => `<tr><th scope="row">${b.c}</th><td class="pg-num">${money(b.min)} – ${money(b.max)}</td><td>${esc(b.wait)}</td></tr>`)]) + `<p class="pg-note pg-sample"><span>${COST_NOTE} Prices abroad are illustrative self-pay estimates.</span></p>`, { alt: true, id: 'costs', more: more('How quotes work', '@@/how-quotes-work/') })
    + (hs.length ? sec(`Hospitals offering ${esc(p.name)}`, tbl(['Hospital', 'City', 'Accreditation', 'Indicative price', 'Hospital stay'], hs.map(({ h, hp }) =>
      `<tr><th scope="row"><a href="@@/hospitals/${h.slug}/">${esc(h.name)}</a></th><td><a href="@@/cities/${h.city}/">${CITY_BY[h.city].name}</a></td><td>${h.acc.map((a) => a.toUpperCase()).join(', ')}</td><td class="pg-num">${range(hp.min, hp.max)}</td><td>${hp.stay ? days(hp.stay) : 'Day care'}</td></tr>`))
      + (inc ? `<div class="pg-split" style="margin-top:32px"><div class="pg-prose"><h3>Usually included</h3><ul>${inc.incl.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div><div class="pg-prose"><h3>Not included</h3><ul>${inc.excl.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></div>` : '') + SAMPLE) : '')
    + (ds.length ? sec('Specialists', `<div class="pg-cards">${ds.slice(0, 6).map(docCard).join('')}</div>`, { alt: true }) : '')
    + cta());
}

// Costs
page('costs/', 'Indicative costs', `Indicative hospital charges in India for ${PROCS.length} treatments, next to typical self-pay prices in the United States.`,
  hero({ crumbs: [['Indicative costs']], eyebrow: 'Indicative costs', title: 'The same operation, <em>at a fraction of the price.</em>',
    lead: `Indicative hospital charges in India for ${PROCS.length} treatments, next to typical self-pay prices in the United States. Your own quote from India is itemised line by line.`,
    actions: btn('Get a free AI assessment', assess()) + btn('How quotes work', '@@/how-quotes-work/', 'line') })
  + sec('', `<div class="pg-chips" role="group" aria-label="Filter by specialty" data-filter="spec"><button class="pg-chip" type="button" data-value="" aria-pressed="true">All</button>${SPECS.map((s) => `<button class="pg-chip" type="button" data-value="${s.slug}" aria-pressed="false">${esc(s.name)}</button>`).join('')}</div>
<div class="pg-search"><input type="search" placeholder="Search a treatment, e.g. knee" aria-label="Search treatments" data-search></div><p class="pg-count" data-count></p>`
    + tbl(['Treatment', 'Specialty', 'India (USD)', 'United States (USD)', 'Typical saving', 'Time in India'], PROCS.map((p) => {
      const us = p.benchmarks.find((b) => b.country_code === 'US');
      const usMin = us ? usd(us.cost_min_minor, 'USD') : 0, usMax = us ? usd(us.cost_max_minor, 'USD') : 0;
      const pct = us ? Math.round(100 * (1 - (usd(p.min) + usd(p.max)) / (usMin + usMax))) : null;
      return `<tr data-spec="${p.spec.slug}" data-text="${esc((p.name + ' ' + p.spec.name).toLowerCase())}"><th scope="row"><a href="@@/${p.path}">${esc(p.name)}</a></th><td>${esc(p.spec.name)}</td><td class="pg-num">${range(p.min, p.max)}</td><td class="pg-num">${us ? `${money(usMin)} – ${money(usMax)}` : '—'}</td><td>${pct ? `about ${pct}% less` : '—'}</td><td>${days(p.total)}</td></tr>`;
    })) + `<p class="pg-note pg-sample"><span>${COST_NOTE} US prices are illustrative self-pay estimates.</span></p>`)
  + sec('Every quote is itemised', `<ol class="pg-steps"><li><h3>Surgeon and theatre</h3><p>Surgeon, anaesthetist and operating theatre fees.</p></li><li><h3>Room and ICU stay</h3><p>Each night in the room and in intensive care, priced separately.</p></li><li><h3>Implants and medicines</h3><p>Named implants and the medicines in your treatment plan.</p></li><li><h3>Tests and follow-up</h3><p>Tests before treatment and the review before you fly home.</p></li></ol>`, { alt: true, more: more('How quotes work', '@@/how-quotes-work/') })
  + cta());

// Hospitals
page('hospitals/', 'Hospitals', 'Fourteen accredited partner hospitals in seven Indian cities, compared on the same terms.',
  hero({ crumbs: [['Hospitals']], eyebrow: 'Hospitals', title: 'Accredited hospitals, <em>compared on the same terms.</em>',
    lead: 'Fourteen partner hospitals in seven cities with international airports. Every one holds JCI or NABH accreditation, and every quote names the hospital, the surgeon and each line of cost.',
    actions: btn('Compare hospitals', '@@/hospitals/compare/') + btn('JCI and NABH explained', '@@/accreditation/', 'line') })
  + sec('', `<div class="pg-chips" role="group" aria-label="Filter by city" data-filter="city"><button class="pg-chip" type="button" data-value="" aria-pressed="true">All cities</button>${CITIES.map((c) => `<button class="pg-chip" type="button" data-value="${c.key}" aria-pressed="false">${c.name} (${c.hospitals.length})</button>`).join('')}</div><p class="pg-count" data-count></p><div class="pg-cards" data-list>${HOSPITALS.map(hospCard).join('')}</div>${SAMPLE}`)
  + related([['JCI and NABH explained', 'accreditation/', 'What each accreditation means and how to check it'], ['How we verify hospitals', 'how-we-verify/', 'What we check before a hospital is listed'],
    ['Compare hospitals', 'hospitals/compare/', 'Side by side, on the same terms'], ['International desks', 'international-desks/', 'The team that looks after patients from abroad'],
    ['What a quote includes', 'how-quotes-work/#what-a-quote-includes', 'Every line of cost, named'], ['All seven cities', 'cities/', 'Airports, climate and getting around']])
  + cta());

const CMP = HOSPITALS.map((h) => ({ slug: h.slug, name: h.name, city: CITY_BY[h.city].name, cityKey: h.city, acc: h.acc.map((a) => a.toUpperCase()).join(', '), beds: h.beds, est: h.est, km: h.km,
  from: money(usd(h.from)), specs: h.specs.map((s) => s.name).join(', '), langs: h.langs.join(', '), intl: h.intl ? 'Yes' : 'No', docs: h.doctors.length, procs: h.procs.length }));
page('hospitals/compare/', 'Compare hospitals', 'Compare partner hospitals side by side: accreditation, size, distance from the airport, specialties and indicative prices.',
  hero({ crumbs: [['Hospitals', '@@/hospitals/'], ['Compare']], eyebrow: 'Hospitals', title: 'Compare hospitals',
    lead: 'Choose up to three hospitals to compare accreditation, size, distance from the airport, specialties and indicative starting prices side by side.' })
  + sec('', `<div class="pg-compare-pick">${[0, 1, 2].map((i) => `<div class="pg-field"><label for="cmp-${i}">Hospital ${i + 1}</label><select id="cmp-${i}" data-cmp>${i ? '<option value="">None</option>' : ''}${CITIES.map((c) => `<optgroup label="${c.name}">${c.hospitals.map((h) => `<option value="${h.slug}">${esc(h.name)}</option>`).join('')}</optgroup>`).join('')}</select></div>`).join('')}</div>
<div id="cmp-table"></div><script type="application/json" id="cmp-data">${JSON.stringify(CMP).replace(/</g, '\\u003c')}</script>${SAMPLE}`)
  + related([['What a quote includes', 'how-quotes-work/#what-a-quote-includes'], ['JCI and NABH explained', 'accreditation/'], ['All hospitals', 'hospitals/'], ['International desks', 'international-desks/']])
  + cta());

for (const h of HOSPITALS) {
  const c = CITY_BY[h.city];
  const others = HOSPITALS.filter((x) => x.city === h.city && x !== h);
  page(`hospitals/${h.slug}/`, h.name, `${h.name}, ${c.name}: accreditations, doctors, procedures and indicative prices for international patients.`,
    hero({ crumbs: [['Hospitals', '@@/hospitals/'], [c.name, `@@/cities/${c.key}/`], [h.name]], eyebrow: `${h.area === c.name ? c.name : h.area + ', ' + c.name} · ${h.state}`, title: esc(h.name), lead: esc(h.desc),
      after: `<div style="margin-top:18px">${badges(h.acc)}</div>`,
      actions: btn('Request a quote', assess() + '?hospital=' + enc(h.name)) + btn('Compare hospitals', `@@/hospitals/compare/?h=${h.slug}`, 'line'),
      facts: [['Established', h.est], ['Beds', h.beds], ['From the airport', `${h.km} km`, `${c.code}, ${esc(c.airport)}`], ['Rating', `${h.rating.toFixed(1)} / 5`, plural(h.ratings, 'review', 'reviews')], ['Doctors listed', h.doctors.length]] })
    + sec('About the hospital', `<div class="pg-split"><div class="pg-prose"><p>${esc(h.desc)}</p><p>${h.intl ? 'The hospital has an international patient desk that prepares your quote, issues the visa invitation letter and plans your admission with your coordinator.' : 'Your coordinator works directly with the hospital on your quote, visa letter and admission.'}</p><p>Accreditation is held by the hospital and can change. Verify the current status with the accrediting body. <a href="@@/accreditation/">JCI and NABH explained</a>.</p></div>
<dl class="pg-kv"><dt>Address</dt><dd>${esc(h.address)}</dd><dt>City</dt><dd><a href="@@/cities/${c.key}/">${c.name}</a></dd><dt>Accreditations</dt><dd>${h.acc.map((a) => a.toUpperCase()).join(', ')}</dd><dt>Languages</dt><dd>${esc(h.langs.join(', '))}</dd><dt>International desk</dt><dd>${h.intl ? 'Yes' : 'No'}</dd><dt>Specialties</dt><dd>${h.specs.map((s) => `<a href="@@/treatments/${s.slug}/">${esc(s.name)}</a>`).join(', ')}</dd></dl></div>`)
    + sec('Procedures and indicative prices', tbl(['Procedure', 'Specialty', 'Indicative price', 'Hospital stay'], h.procs.map((x) =>
      `<tr><th scope="row"><a href="@@/${x.proc.path}">${esc(x.proc.name)}</a></th><td>${esc(x.proc.spec.name)}</td><td class="pg-num">${range(x.min, x.max)}</td><td>${x.stay ? days(x.stay) : 'Day care'}</td></tr>`)) + `<p class="pg-note pg-sample"><span>${COST_NOTE}</span></p>`, { alt: true })
    + (h.doctors.length ? sec(`Doctors at ${esc(h.name)}`, `<div class="pg-cards">${h.doctors.map(docCard).join('')}</div>`) : '')
    + (others.length ? sec(`Also in ${c.name}`, `<div class="pg-cards">${others.map(hospCard).join('')}</div>`, { alt: true, more: more(`${c.name} city guide`, `@@/cities/${c.key}/`) }) : '')
    + sec('', SAMPLE)
    + cta(`Get a quote from ${esc(h.name)}`, 'Start with a free AI assessment. We match you with the right specialist and help you request an itemised quote.',
      btn('Get a free AI assessment', assess() + '?hospital=' + enc(h.name)) + btn('Talk to a coordinator', '@@/support/', 'line')));
}

// Cities
page('cities/', 'Destinations', 'Seven Indian cities with international airports and accredited partner hospitals: hospitals, airports, climate and getting around.',
  hero({ crumbs: [['Destinations']], eyebrow: 'Destinations', title: 'Seven cities, <em>one standard of care.</em>',
    lead: 'Choose a city for its hospital, its flights or simply the place you would like to recover in. Each city page lists its partner hospitals and a practical city guide.',
    facts: [['Cities', 7], ['Partner hospitals', 14], ['e-Medical visa', '~72 h', 'Typical decision, indicative']] })
  + sec('', `<div class="pg-tiles">${CITIES.map((c) => tile(c)).join('')}</div>`)
  + related([['Flights and airport pickup', 'plan-your-trip/flights-and-airport-pickup/'], ['Where you will stay', 'plan-your-trip/where-you-will-stay/'], ['e-Medical visa', 'plan-your-trip/e-medical-visa/'], ['All hospitals', 'hospitals/']])
  + cta());

for (const c of CITIES) {
  const specs = SPECS.filter((s) => c.hospitals.some((h) => h.specs.includes(s)));
  page(`cities/${c.key}/`, `Treatment in ${c.name}`, `${c.name}, India for international patients: ${plural(c.hospitals.length, 'partner hospital', 'partner hospitals')}, the airport, climate and getting around.`,
    hero({ crumbs: [['Destinations', '@@/cities/'], [c.name]], eyebrow: `Destination · ${c.state}`, title: `${esc(c.name)}<span class="pg-iata">${c.code}</span>`, lead: `${esc(c.line)}. ${esc(c.summary.replace(/^Practical notes on [^:]+: /, 'This guide covers ').replace(/^./, (x) => x.toUpperCase()))}`,
      media: { src: IMG(c.img, 1200, 900), alt: c.alt },
      actions: btn(`See ${plural(c.hospitals.length, 'hospital', 'hospitals')} in ${esc(c.name)}`, '#hospitals') + btn('Plan your trip', '@@/plan-your-trip/', 'line'),
      facts: [['Partner hospitals', c.hospitals.length], ['Airport', c.code, esc(c.airport)], ['Specialties', specs.length], ['Doctors listed', c.doctors.length]] })
    + sec(`Partner hospitals in ${esc(c.name)}`, `<div class="pg-cards pg-two">${c.hospitals.map(hospCard).join('')}</div>${SAMPLE}`, { id: 'hospitals', sub: 'Every partner hospital holds JCI or NABH accreditation. Open a hospital to see its doctors, procedures and indicative prices.' })
    + sec(`Treatments in ${esc(c.name)}`, `<div class="pg-tags">${specs.map((s) => `<a class="pg-chip" href="@@/treatments/${s.slug}/">${esc(s.name)}</a>`).join('')}</div>`, { alt: true, sub: 'Specialties offered by the partner hospitals in this city.' })
    + (c.doctors.length ? sec(`Doctors in ${esc(c.name)}`, `<div class="pg-cards">${c.doctors.slice(0, 6).map(docCard).join('')}</div>`, { more: more('All doctors', '@@/doctors/') }) : '')
    + sec(`${esc(c.name)} city guide`, article(c.guide), { alt: true, id: 'guide' })
    + sec('Other cities', `<div class="pg-tiles">${CITIES.filter((x) => x !== c).map((x) => tile(x, true)).join('')}</div>`)
    + cta());
}

// Doctors
const docFilters = `<div class="pg-search" id="find"><input type="search" placeholder="Search by name, specialty, hospital or language" aria-label="Find a doctor by name" data-search></div>
<div class="pg-chips" role="group" aria-label="Filter by specialty" data-filter="group"><button class="pg-chip" type="button" data-value="" aria-pressed="true">All</button>${DOC_GROUPS.map((g) => `<button class="pg-chip" type="button" data-value="${g.slug}" aria-pressed="false">${g.name}</button>`).join('')}<button class="pg-chip" type="button" data-value="other" aria-pressed="false">Other specialties</button></div><p class="pg-count" data-count></p>`;
page('doctors/', 'Doctors', `Find ${DOCTORS.length} specialists at partner hospitals in India by name, specialty and language.`,
  hero({ crumbs: [['Doctors']], eyebrow: 'Doctors', title: 'Know your surgeon <em>before you fly.</em>',
    lead: `Browse ${DOCTORS.length} specialists at our partner hospitals by name, specialty and language. Every profile lists qualifications and hospital affiliation.`,
    actions: btn('Book a video consultation', '@@/video-consultation/') + btn('How we vet doctors', '@@/how-we-vet-doctors/', 'line') })
  + sec('', docFilters + `<div class="pg-cards" data-list>${DOCTORS.map(docCard).join('')}</div><p class="pg-empty" data-empty hidden>No doctors match. Try another name or specialty.</p>${SAMPLE}`)
  + related([['Video consultation', 'video-consultation/'], ['Second opinion', 'second-opinion/'], ['How we vet doctors', 'how-we-vet-doctors/'], ['All treatments', 'treatments/']])
  + cta());
for (const g of DOC_GROUPS) {
  const ds = DOCTORS.filter((d) => d.group === g);
  page(`doctors/${g.slug}/`, g.name, `${g.name} at partner hospitals in India: qualifications, experience, languages and hospital.`,
    hero({ crumbs: [['Doctors', '@@/doctors/'], [g.name]], eyebrow: 'Doctors by specialty', title: g.name, lead: `${esc(g.lead)} ${plural(ds.length, 'specialist', 'specialists')} listed.`,
      actions: btn('Book a video consultation', '@@/video-consultation/') + g.specs.map((a) => btn(esc(SPEC[a].name) + ' treatments', `@@/treatments/${SPEC[a].slug}/`, 'line')).join('') })
    + sec('', `<div class="pg-cards">${ds.map(docCard).join('')}</div>${SAMPLE}`)
    + related(DOC_GROUPS.filter((x) => x !== g).map((x) => [x.name, `doctors/${x.slug}/`]).concat([['All doctors', 'doctors/']]))
    + cta());
}
for (const d of DOCTORS) {
  const c = CITY_BY[d.hosp.city];
  const colleagues = d.hosp.doctors.filter((x) => x !== d);
  page(`doctors/${d.slug}/`, d.name, `${d.name}, ${d.spec.name} at ${d.hosp.name}, ${c.name}: qualifications, experience, languages and procedures.`,
    hero({ crumbs: [['Doctors', '@@/doctors/'], ...(d.group ? [[d.group.name, `@@/doctors/${d.group.slug}/`]] : []), [d.name]], eyebrow: d.spec.name, title: esc(d.name),
      lead: esc(d.bio || `${d.spec.name} specialist at ${d.hosp.name}.`),
      after: `<div class="pg-tags" style="margin-top:18px">${d.tele ? '<span class="pg-tag">Video consultation available</span>' : ''}${d.langs.map((l) => `<span class="pg-tag">${esc(l)}</span>`).join('')}</div>`,
      actions: (d.tele ? btn('Book a video consultation', `@@/video-consultation/?doctor=${enc(d.name)}`) : '') + btn('Request a quote', assess() + '?doctor=' + enc(d.name), d.tele ? 'line' : 'primary'),
      facts: [['Experience', `${d.exp} years`], ['Reported success rate', `${d.success}%`, 'Reported by the hospital'], ['Rating', `${d.rating.toFixed(1)} / 5`, plural(d.ratings, 'review', 'reviews')], ['Consultation fee', money(usd(d.fee)), 'Indicative']] })
    + sec('Training and expertise', `<div class="pg-split"><div class="pg-prose"><h3>Qualifications</h3><ul>${d.quals.map((q) => `<li>${esc(q)}</li>`).join('')}</ul>${d.subs.length ? `<h3>Areas of expertise</h3><ul>${d.subs.map((q) => `<li>${esc(q)}</li>`).join('')}</ul>` : ''}</div>
<dl class="pg-kv"><dt>Hospital</dt><dd><a href="@@/hospitals/${d.hosp.slug}/">${esc(d.hosp.name)}</a></dd><dt>City</dt><dd><a href="@@/cities/${c.key}/">${c.name}</a></dd><dt>Specialty</dt><dd><a href="@@/treatments/${d.spec.slug}/">${esc(d.spec.name)}</a></dd><dt>Languages</dt><dd>${esc(d.langs.join(', '))}</dd><dt>Video consultation</dt><dd>${d.tele ? 'Available' : 'Not offered'}</dd>${d.next ? `<dt>Next available</dt><dd>${fmtDate(d.next)}</dd>` : ''}</dl></div>
<p class="pg-note pg-sample"><span>Success rates are reported by hospitals and are not independently verified. <a href="@@/how-we-vet-doctors/">How to read a profile</a>.</span></p>`)
    + (d.procs.length ? sec('Procedures', tbl(['Procedure', 'Indicative price', 'Hospital stay'], d.procs.map((x) => `<tr><th scope="row"><a href="@@/${x.proc.path}">${esc(x.proc.name)}</a></th><td class="pg-num">${range(x.min, x.max)}</td><td>${x.stay ? days(x.stay) : 'Day care'}</td></tr>`)), { alt: true }) : '')
    + (colleagues.length ? sec(`Other specialists at ${esc(d.hosp.name)}`, `<div class="pg-cards">${colleagues.slice(0, 3).map(docCard).join('')}</div>`, { more: more('View hospital', `@@/hospitals/${d.hosp.slug}/`) }) : '')
    + sec('', SAMPLE)
    + cta(`Consult ${esc(d.name)}`, 'Get a free AI assessment and request a video consultation or an itemised quote.'));
}

// Guides composed from content/en plus short pages written for the preview
const FAQ = doc('faq.md').body, PRE = doc('pre-arrival-guide.md').body, INC = doc('in-country-guide.md').body;
const F = (h, o) => section(FAQ, h, o), P = (h, o) => section(PRE, h, o), I = (h, o) => section(INC, h, o);
const GUIDES = [
  { path: 'second-opinion/', crumbs: [['Treatments', '@@/treatments/']], eyebrow: 'Before you decide', title: 'Second opinion',
    lead: 'A senior specialist in India reviews your reports and the treatment you have been offered, so you can decide with confidence before you book anything.',
    md: `## Who it is for
- You have been advised to have major surgery, such as heart bypass, spine surgery or a joint replacement, and want another view first.
- You have a cancer diagnosis and would like a second oncologist or a tumour board to look at your treatment plan.
- You were quoted a long wait or a price you cannot afford, and want to know whether the same treatment is suitable in India.

## How it works
1. **Share your reports.** Start a free AI assessment and upload your scans, test results and the plan you were given. The assessment organises your history; it is not a diagnosis.
2. **A doctor on our medical team reviews it.** They check that the reports are complete and choose the right specialty.
3. **A specialist at a partner hospital gives an opinion.** You receive a written summary with their view, any tests they would repeat and, if treatment in India suits you, an itemised quote.
4. **Talk it through.** If you would like to speak to the specialist, book a video consultation.

## What to send
- Recent scans (CT, MRI, X-ray) with the radiologist's report, and the images where you can
- Blood tests and other investigations from the last three months
- The diagnosis and treatment plan you were given, and a list of your current medicines

## What a second opinion is not
A second opinion is a review of the records you share. It does not replace your own doctor, and the specialist may ask for new tests before giving a firm recommendation. If you have severe or sudden symptoms, seek emergency care where you are now.`,
    related: [['Video consultation', 'video-consultation/'], ['How quotes work', 'how-quotes-work/'], ['How we vet doctors', 'how-we-vet-doctors/'], ['All doctors', 'doctors/']] },
  { path: 'how-quotes-work/', crumbs: [['Treatments', '@@/treatments/']], eyebrow: 'Before you decide', title: 'How quotes work',
    lead: 'Every quote names the hospital, the surgeon and each line of cost, so you can compare hospitals on the same terms and see what is and is not included.',
    md: `## From your reports to your quote
1. **Assessment.** You share your reports through the free AI assessment, and a doctor on our medical team reviews them.
2. **Matched hospitals.** Two or three accredited hospitals that treat your condition receive your case with the records attached.
3. **Itemised quotes.** Each hospital prices the surgeon, room, ICU, implants, medicines and tests separately. Most quotes arrive within 48 hours of complete reports.
4. **Compare and ask.** You compare quotes side by side, ask questions through your coordinator and can book a video consultation with the surgeon.
5. **Accept.** When you accept a quote, the hospital confirms your admission date and your coordinator starts on the visa letter and travel.

${F('How much will my treatment cost?')}

${F('What does a quote include?', { title: 'What a quote includes' })}

${F('What is usually not included?')}

${F('Why could my final bill be different from the quote?')}

${F('How long is a quote valid?')}

${F('Can I compare several hospitals?')}

${F('Which currency will I pay in?')}`,
    related: [['Indicative costs', 'costs/'], ['Costs and payment', 'plan-your-trip/costs-and-payment/'], ['Compare hospitals', 'hospitals/compare/'], ['Second opinion', 'second-opinion/']] },
  { path: 'accreditation/', crumbs: [['Hospitals', '@@/hospitals/']], eyebrow: 'Choosing well', title: 'JCI and NABH explained',
    lead: 'Every partner hospital holds Joint Commission International (JCI) or NABH accreditation. Here is what each one means, what it does not tell you, and how to check it.',
    md: `## JCI
Joint Commission International is a US-based organisation that accredits hospitals around the world against international standards for patient safety and quality of care. Surveyors visit the hospital and review areas such as infection control, medication safety, surgical safety and patient rights. Hospitals are re-surveyed to keep their accreditation.

## NABH
The National Accreditation Board for Hospitals and Healthcare Providers is India's national hospital accreditation body, part of the Quality Council of India. Its standards cover patient safety, clinical care, infection control and patient rights.

## NABL
Some hospitals also list NABL. The National Accreditation Board for Testing and Calibration Laboratories accredits laboratories, so it applies to the hospital's lab tests rather than to the hospital as a whole.

## What accreditation does not tell you
Accreditation shows that a hospital met recognised standards when it was surveyed. It does not rate individual doctors or guarantee an outcome. That is why every quote also names your surgeon, with their training and experience.

## How to check
Accreditation is held by the hospital and can change. Each hospital profile lists its accreditations, and you can confirm the current status in the public directories that JCI and NABH publish.`,
    related: [['How we verify hospitals', 'how-we-verify/'], ['All hospitals', 'hospitals/'], ['Compare hospitals', 'hospitals/compare/'], ['International desks', 'international-desks/']] },
  { path: 'how-we-verify/', crumbs: [['Hospitals', '@@/hospitals/']], eyebrow: 'Choosing well', title: 'How we verify hospitals',
    lead: 'A hospital is listed only after our team has reviewed its registration, accreditation and international patient services.',
    md: `## Before a hospital is listed
- **Registration and tax documents.** The hospital uploads its registration, accreditation and tax documents and its payout account for review.
- **Accreditation.** JCI or NABH accreditation is required, and we check it against the accrediting body.
- **International patient services.** An international desk that can prepare quotes, visa invitation letters and admissions for patients from abroad.
- **Doctor profiles.** Each listed doctor's qualifications, registration and current affiliation with the hospital.
- **Itemised prices.** Procedures and packages priced line by line, so quotes can be compared.

${F('How do you check hospitals before listing them?', { title: 'In short' })}

## While a hospital is listed
Hospitals keep their prices, packages and availability up to date in the hospital portal, and patient feedback is shared with them. Accreditations belong to the hospitals, not to us, and we are not a hospital: diagnosis and treatment decisions are made by qualified doctors at the hospital you choose.`,
    related: [['JCI and NABH explained', 'accreditation/'], ['How we vet doctors', 'how-we-vet-doctors/'], ['All hospitals', 'hospitals/'], ['About us', 'about/']] },
  { path: 'international-desks/', crumbs: [['Hospitals', '@@/hospitals/']], eyebrow: 'Choosing well', title: 'International desks',
    lead: 'Each partner hospital has an international patient desk: the team that looks after quotes, admission and paperwork for patients travelling from abroad, working alongside your coordinator.',
    md: `## What the desk does
- Prepares your itemised quote with the treating department
- Issues the visa invitation letter you need for your e-Medical visa
- Plans your admission date, tests before treatment and your room
- Arranges interpreters for consultations, consent and discharge
- Prepares your discharge papers, medical reports and final bill

## How it works with your coordinator
Your coordinator from Heal India Global is your single point of contact. They speak to the desk for you, keep your family updated if you want them to, and make sure nothing is lost between the hospital, your hotel and the airport.

## Languages
Desks and interpreters cover languages such as Arabic, French, Bengali and Swahili. Each hospital profile lists the languages its teams speak.`,
    related: [['Your coordinator', 'plan-your-trip/your-coordinator/'], ['Translators', 'plan-your-trip/translators/'], ['e-Medical visa', 'plan-your-trip/e-medical-visa/'], ['All hospitals', 'hospitals/']] },
  { path: 'video-consultation/', crumbs: [['Doctors', '@@/doctors/']], eyebrow: 'Talk to a doctor', title: 'Video consultation',
    lead: 'Speak to a specialist from home before you decide. Video consultations are with the surgeon or specialist named on your quote.',
    md: `## When it helps
- Before you accept a quote, to ask the surgeon about the operation, the risks and your recovery
- When you want a second opinion and would like to talk it through
- After you return home, for follow-ups booked with your treating doctor

## How to book
1. Start a free AI assessment, or open your quote if you already have one.
2. Choose a doctor who offers video consultations. It is shown on every doctor's profile.
3. Pick a time. Your coordinator confirms it and can join with a translator.
4. After the call, the doctor's notes are added to your case.

## Fees
The consultation fee is shown on each doctor's profile and is confirmed before you book.

## Before the call
Have your reports, your list of medicines and your questions ready. A quiet room and a stable internet connection help.

${F('Can I talk to my Indian doctor after I go home?')}

${F('Can my local doctor speak to my doctor in India?')}

## Not for emergencies
Video consultations are not an emergency service. If you have severe or sudden symptoms, call your local emergency number.`,
    related: [['All doctors', 'doctors/'], ['Second opinion', 'second-opinion/'], ['How we vet doctors', 'how-we-vet-doctors/'], ['Get a free AI assessment', 'assessment/']] },
  { path: 'how-we-vet-doctors/', crumbs: [['Doctors', '@@/doctors/']], eyebrow: 'Talk to a doctor', title: 'How we vet doctors',
    lead: 'Every profile lists qualifications and hospital affiliation. Here is how doctors come to be listed and how to read what you see.',
    md: `## Who is listed
Doctors are added by their partner hospital. A profile appears only for a doctor who currently practises at that hospital.

## What we check
- **Medical registration** with the relevant Indian medical council
- **Qualifications and specialist training**, as listed on the profile
- **Hospital affiliation**, confirmed with the hospital
- **The procedures they perform**, with indicative prices from the hospital

${F('How should I read ratings and success rates on profiles?')}

## Ask your surgeon
On a video consultation, ask how often they perform your operation, what recovery usually looks like and what would make them change the plan. Your coordinator can help you prepare.`,
    related: [['All doctors', 'doctors/'], ['Video consultation', 'video-consultation/'], ['How we verify hospitals', 'how-we-verify/'], ['Second opinion', 'second-opinion/']] },
  // Plan your trip
  { path: 'plan-your-trip/e-medical-visa/', trip: true, title: 'e-Medical visa', lead: 'Patients travel on an e-Medical visa and companions on an e-Medical Attendant visa. The decision typically takes around 72 hours after you apply (indicative).',
    md: doc('visa-overview.md').body + '\n\n' + section(FAQ, 'Visas', { title: 'Visa questions' }),
    related: [['Flights and airport pickup', 'plan-your-trip/flights-and-airport-pickup/'], ['Pre-arrival guide', 'plan-your-trip/pre-arrival-guide/'], ['International desks', 'international-desks/']] },
  { path: 'plan-your-trip/flights-and-airport-pickup/', trip: true, title: 'Flights and airport pickup', lead: 'Book flights once your admission date is confirmed. Someone meets you at arrivals and takes you to your stay or straight to the hospital.',
    md: [P('Flights'), P('Airport pickup and translator', { level: 2, title: 'Airport pickup' }), P('Arrival day'), F('Can you book my flights?'), F('Will someone meet me at the airport?'), F('How soon after treatment can I fly home?')].join('\n\n'),
    related: [['e-Medical visa', 'plan-your-trip/e-medical-visa/'], ['Where you will stay', 'plan-your-trip/where-you-will-stay/'], ['All seven cities', 'cities/']] },
  { path: 'plan-your-trip/costs-and-payment/', trip: true, title: 'Costs and payment', lead: 'How your price is set, how you pay, and how cancellations and refunds work.', md: doc('payments-and-refunds.md').body,
    related: [['How quotes work', 'how-quotes-work/'], ['Indicative costs', 'costs/'], ['Terms', 'terms/']] },
  { path: 'plan-your-trip/what-to-bring/', trip: true, title: 'What to bring', lead: 'Your medical records, your medicines and a short packing list, so nothing important is left at home.',
    md: [P('Medical records'), P('Medicines'), P('Money and cards'), P('Phone and internet'), P('Packing list')].join('\n\n'),
    related: [['Pre-arrival guide', 'plan-your-trip/pre-arrival-guide/'], ['Flights and airport pickup', 'plan-your-trip/flights-and-airport-pickup/'], ['Where you will stay', 'plan-your-trip/where-you-will-stay/']] },
  { path: 'plan-your-trip/where-you-will-stay/', trip: true, title: 'Where you will stay', lead: 'You and one companion stay a short drive from your hospital, before admission and while you recover.',
    md: [F('Where will I stay?'), F('Can my companion stay with me in hospital?'), P('Accommodation'), P('Decide who travels with you')].join('\n\n'),
    related: [['All seven cities', 'cities/'], ['Your coordinator', 'plan-your-trip/your-coordinator/'], ['In-country guide', 'plan-your-trip/in-country-guide/']] },
  { path: 'plan-your-trip/your-coordinator/', trip: true, title: 'Your coordinator', lead: 'One person who knows your case, day and night. Your coordinator books every appointment, translates when you need it and answers at 3 am.',
    md: [I('Your support team'), I('At the hospital')].join('\n\n'),
    related: [['Translators', 'plan-your-trip/translators/'], ['WhatsApp and SOS line', 'plan-your-trip/whatsapp-and-sos-line/'], ['Patient support', 'support/']] },
  { path: 'plan-your-trip/translators/', trip: true, title: 'Translators', lead: 'A translator joins your consultations, surgery day and discharge. Arabic, French, Bengali, Swahili and more.',
    md: [I('Communication and translators'), F('Will the doctors speak my language?'), F('How do I get a translator?')].join('\n\n'),
    related: [['Your coordinator', 'plan-your-trip/your-coordinator/'], ['International desks', 'international-desks/'], ['In-country guide', 'plan-your-trip/in-country-guide/']] },
  { path: 'plan-your-trip/whatsapp-and-sos-line/', trip: true, title: 'WhatsApp and SOS line', lead: 'Messages answered around the clock on WhatsApp, and a direct SOS line while you are in India.',
    md: `## WhatsApp, 24/7
Your coordinator and our patient desk answer WhatsApp messages around the clock, for anything from a changed pickup time to a question about your medicines.

## SOS line
While you are in India you have a direct line to the patient desk for urgent help. Your coordinator shares the number on your first call.

${I('Emergency numbers and help')}

${F('What should I do in an emergency in India?')}`, emergency: true,
    related: [['Your coordinator', 'plan-your-trip/your-coordinator/'], ['Patient support', 'support/'], ['In-country guide', 'plan-your-trip/in-country-guide/']] },
  { path: 'plan-your-trip/pre-arrival-guide/', trip: true, title: 'Pre-arrival guide', lead: 'A week-by-week checklist from your first quote to the day you land.', md: PRE,
    related: [['e-Medical visa', 'plan-your-trip/e-medical-visa/'], ['What to bring', 'plan-your-trip/what-to-bring/'], ['Flights and airport pickup', 'plan-your-trip/flights-and-airport-pickup/']] },
  { path: 'plan-your-trip/in-country-guide/', trip: true, title: 'In-country guide', lead: 'Practical notes for your time in India: your support team, the hospital, food and water, getting around and staying safe.', md: INC,
    related: [['Your coordinator', 'plan-your-trip/your-coordinator/'], ['WhatsApp and SOS line', 'plan-your-trip/whatsapp-and-sos-line/'], ['All seven cities', 'cities/']] },
  { path: 'plan-your-trip/recovery-and-going-home/', trip: true, title: 'Recovery and going home', lead: 'Fly home with a plan, then video follow-ups with your doctor.', md: doc('post-treatment-care.md').body,
    related: [['Video consultation', 'video-consultation/'], ['Flights and airport pickup', 'plan-your-trip/flights-and-airport-pickup/'], ['FAQs', 'faq/']] },
  // Partners
  { path: 'partners/hospitals/requirements/', crumbs: [['Partners', '@@/partners/'], ['Hospitals', '@@/partners/hospitals/']], eyebrow: 'For hospitals', title: 'Requirements',
    lead: 'What a hospital needs to join the network and receive screened international referrals.',
    md: `## To join
- **Accreditation.** JCI or NABH accreditation is required.
- **Registration documents.** Hospital registration, accreditation certificates, tax documents and the payout account for settlements.
- **An international patient desk** that can prepare quotes, issue visa invitation letters and plan admissions for patients from abroad.
- **Itemised pricing.** Procedures and packages priced line by line: surgeon and theatre, room and ICU stay, implants and medicines, tests and follow-up.
- **Doctor profiles** with qualifications, registration and experience.

## What we agree together
- Structured, itemised quote requests answered from one portal, typically within 48 hours of complete reports
- Coordinated arrivals: visa letters, airport pickup and admission planned with your desk
- Commercial terms, including commission, set out in your partner agreement before you go live

## How to apply
1. **Register.** Create a hospital account with your work email.
2. **Complete your profile.** Add specialties, doctors, procedures, prices and packages.
3. **Verification.** Upload registration, accreditation and tax documents and your payout account for review.
4. **Go live.** Once approved, your hospital appears in search and starts receiving enquiries.`,
    related: [['Become a partner hospital', 'partners/hospitals/'], ['How referrals work', 'partners/how-referrals-work/'], ['Talk to our partnerships team', 'partners/contact/']] },
  { path: 'partners/how-referrals-work/', crumbs: [['Partners', '@@/partners/']], eyebrow: 'Partner programme', title: 'How referrals work',
    lead: 'Screened referrals, complete reports. Cases arrive with records attached, and every step is visible to the hospital and the referring agent.',
    md: `## The steps
1. **Assessment.** The patient, or their agent, starts a free AI assessment and uploads reports.
2. **Medical review.** A doctor on our medical team checks the case and chooses the specialty.
3. **Referral.** Two or three matched, accredited hospitals receive the case with the records attached.
4. **Quotes.** Each hospital sends an itemised quote from the hospital portal, typically within 48 hours.
5. **Booking.** The patient compares quotes and accepts one. We coordinate the visa letter, flights, pickup and stay.
6. **Treatment and follow-up.** The coordinator is with the patient from arrival to discharge, and follow-ups continue by video.

## What hospitals receive
Complete, structured cases: history, reports, preferences and travel dates, so your team can quote quickly and on the same terms as other hospitals.

## What agents see
Each case's status in real time, the quotes your patients receive and your commission on every booking.`,
    related: [['For hospitals', 'partners/hospitals/'], ['For agents and facilitators', 'partners/agents/'], ['Talk to our partnerships team', 'partners/contact/']] },
  { path: 'partners/agents/commission-and-payouts/', crumbs: [['Partners', '@@/partners/'], ['Agents', '@@/partners/agents/']], eyebrow: 'For agents and facilitators', title: 'Commission and payouts',
    lead: 'See your commission on every booking, from the first referral to the payout.',
    md: `## How commission works
You earn commission on bookings made by patients linked to your account, whether you added them yourself or they registered through your referral link. Commission rates and payout terms are confirmed in your agent agreement.

## Tracking
The agent portal shows pending and paid commissions per booking, with statements you can download.

## Payouts
Payouts are made to the verified payout account you add during onboarding, after your KYC documents are approved.`,
    related: [['Join as an agent', 'partners/agents/'], ['Marketing resources', 'partners/agents/marketing-resources/'], ['How referrals work', 'partners/how-referrals-work/']] },
  { path: 'partners/agents/marketing-resources/', crumbs: [['Partners', '@@/partners/'], ['Agents', '@@/partners/agents/']], eyebrow: 'For agents and facilitators', title: 'Marketing resources',
    lead: 'Everything you need to explain medical travel to India clearly and honestly to the patients you work with.',
    md: `## Your referral link
Share your referral link so patients who register through you are linked to your account.

## Guides you can share
- Treatment guides with typical time in hospital, recovery and indicative costs
- City guides for all seven destinations
- The pre-arrival guide, in-country guide and recovery guide

## Brand and claims
Use the Heal India Global name and logo only as agreed in your agent agreement. Prices are indicative and every patient receives an itemised quote; please do not promise outcomes, prices or visa decisions.`,
    related: [['Join as an agent', 'partners/agents/'], ['Treatments', 'treatments/'], ['Destinations', 'cities/']] },
  // Company
  { path: 'faq/', eyebrow: 'Help', title: 'Frequently asked questions', lead: 'How Heal India Global works, costs and quotes, payments, visas, travel, safety and your data.', md: FAQ,
    related: [['Patient support', 'support/'], ['How quotes work', 'how-quotes-work/'], ['e-Medical visa', 'plan-your-trip/e-medical-visa/']] },
  { path: 'privacy/', eyebrow: 'Legal', title: 'Privacy', lead: 'What we collect, why, who can see it and your rights, in plain language.', md: doc('privacy-in-plain-language.md').body,
    related: [['Terms', 'terms/'], ['Cookies', 'cookies/'], ['Contact', 'contact/']] },
  { path: 'terms/', eyebrow: 'Legal', title: 'Terms of use', lead: 'Summary. The complete terms are being finalised and will be published here before launch.',
    md: `## In short
- Heal India Global is a medical-travel facilitation service. We are not a hospital and do not provide medical advice, diagnosis or treatment.
- Hospital information and prices on this website are indicative. Treatment, prices and dates are agreed between you and the hospital in a written quote.
- The AI assessment is an informational tool and not a diagnosis. In an emergency, contact local emergency services.
- The complete terms of use will be published on this page before launch.

## Cancellations and refunds
- Your booking confirmation shows the cancellation terms that apply to it.
- Under the current default policy, cancelling 14 or more days before admission is refunded in full, 7–13 days before is refunded at 50%, and later cancellations are not refundable. Hospital-specific terms may differ and are shown in your quote.
- Refunds are paid back to the original payment method and may take several business days to arrive, depending on your bank.`,
    related: [['Privacy', 'privacy/'], ['Costs and payment', 'plan-your-trip/costs-and-payment/'], ['Contact', 'contact/']] },
  { path: 'cookies/', eyebrow: 'Legal', title: 'Cookies', lead: 'This website does not use tracking or advertising cookies.',
    md: `## What we use
- **Strictly necessary.** Logging in sets a security cookie that keeps you signed in. It is removed when you sign out or when it expires.
- **No tracking or advertising cookies.** We do not use cookies to follow you across other websites.

## Your choices
You can block or delete cookies in your browser settings. If you block the sign-in cookie, you will not be able to log in.

## Questions
Write to care@healindiaglobal.example.`,
    related: [['Privacy', 'privacy/'], ['Terms', 'terms/']] },
  { path: 'accessibility/', eyebrow: 'Legal', title: 'Accessibility', lead: 'We want everyone to be able to plan treatment with us, whatever device, browser or assistive technology they use.',
    md: `## Our standard
We design and test against the Web Content Accessibility Guidelines (WCAG) 2.2 at level AA.

## What that means in practice
- Text and controls meet colour-contrast requirements, and colour is never the only way information is shown
- Every page works with a keyboard, with a visible focus outline
- Pages reflow on small screens and when text is enlarged
- Images have text alternatives, and forms have labels and clear error messages
- Motion is reduced when your device asks for it

## Tell us about a barrier
If something on this website is hard to use, write to care@healindiaglobal.example with the page address and what happened. We reply by email.`,
    related: [['Contact', 'contact/'], ['Patient support', 'support/']] },
  { path: 'careers/', eyebrow: 'Company', title: 'Careers', lead: 'We are building a calm, honest way for international patients to reach accredited care in India.',
    md: `## Who we look for
Patient coordinators, translators, doctors for our medical review team, partnership managers and engineers who care about getting the details right for people far from home.

## Open roles
Open roles will be listed on this page. To introduce yourself in the meantime, write to care@healindiaglobal.example with your CV and the kind of work you would like to do.`,
    related: [['About us', 'about/'], ['Contact', 'contact/']] },
];
for (const g of GUIDES) {
  const crumbs = g.trip ? [['Plan your trip', '@@/plan-your-trip/'], [g.title]] : [...(g.crumbs || []), [g.title]];
  page(g.path, g.title, g.lead,
    hero({ crumbs, eyebrow: g.trip ? 'Plan your trip' : g.eyebrow, title: esc(g.title), lead: esc(g.lead) })
    + (g.emergency ? sec('', EMERGENCY) : '')
    + sec('', article(g.md))
    + related(g.related)
    + cta());
}

// Plan your trip index
const TRIP = GUIDES.filter((g) => g.trip);
const tripCard = (g) => `<article class="pg-card"><h3><a class="pg-card-link" href="@@/${g.path}">${esc(g.title)}</a></h3><p>${esc(trim(g.lead, 130))}</p><span class="pg-go">Read</span></article>`;
const tripPick = (paths) => paths.map((p) => tripCard(TRIP.find((g) => g.path === `plan-your-trip/${p}/`))).join('');
page('plan-your-trip/', 'Trip planning guide', 'Everything to arrange before you fly to India for treatment and while you are there.',
  hero({ crumbs: [['Plan your trip']], eyebrow: 'Trip planning guide', title: 'From your quote <em>to your flight home.</em>',
    lead: 'Everything to arrange before you fly and while you are in India, in the order you will need it.',
    actions: btn('Get a free AI assessment', assess()) + btn('Talk to a coordinator', '@@/support/', 'line'),
    facts: [['e-Medical visa', '~72 h', 'Typical decision, indicative'], ['First upload to arrival', '2 to 4 weeks', 'Typical'], ['Your coordinator', 'One person', 'WhatsApp, 24/7']] })
  + sec('Before you fly', `<div class="pg-cards">${tripPick(['e-medical-visa', 'flights-and-airport-pickup', 'costs-and-payment', 'what-to-bring', 'pre-arrival-guide'])}</div>`)
  + sec('While in India', `<div class="pg-cards">${tripPick(['where-you-will-stay', 'your-coordinator', 'translators', 'whatsapp-and-sos-line', 'in-country-guide', 'recovery-and-going-home'])}</div>`, { alt: true })
  + sec('Timeline at a glance', `<div class="pg-prose">${md(section(PRE, 'Timeline at a glance')).html.replace(/<h2[^>]*>.*?<\/h2>/, '')}</div>`, { more: more('Pre-arrival guide', '@@/plan-your-trip/pre-arrival-guide/') })
  + sec('Destinations', `<div class="pg-tiles">${CITIES.map((c) => tile(c, true)).join('')}</div>`, { alt: true, more: more('All seven cities', '@@/cities/') })
  + cta());

// Support
page('support/', 'Patient support', 'Your coordinator, WhatsApp 24/7, the SOS line and translators: support from your first question to your flight home.',
  hero({ crumbs: [['Patient support']], eyebrow: 'Patient support', title: 'One person who knows your case, <em>day and night.</em>',
    lead: 'Your coordinator books every appointment, translates when you need it and answers at 3 am.',
    actions: '<a class="btn btn-primary" href="https://wa.me/919000000000">WhatsApp us</a>' + btn('Send a message', '#message', 'line') })
  + sec('', EMERGENCY)
  + sec('How we support you', `<div class="pg-cards">${[['WhatsApp, 24/7', 'Messages answered around the clock.', 'plan-your-trip/whatsapp-and-sos-line/'], ['SOS line', 'A direct line while you are in India.', 'plan-your-trip/whatsapp-and-sos-line/'],
    ['Airport to bedside', 'Pickup, transfers and admission.', 'plan-your-trip/flights-and-airport-pickup/'], ['Translators', 'Arabic, French, Bengali, Swahili and more.', 'plan-your-trip/translators/'],
    ['Your coordinator', 'One person who knows your case.', 'plan-your-trip/your-coordinator/'], ['In-country guide', 'Practical notes for your time in India.', 'plan-your-trip/in-country-guide/']]
    .map(([t, p, h]) => `<article class="pg-card"><h3><a class="pg-card-link" href="@@/${h}">${t}</a></h3><p>${p}</p><span class="pg-go">Read more</span></article>`).join('')}</div>`)
  + sec('What a message looks like', `<div class="pg-split"><div class="pg-panel"><p class="pg-eyebrow" style="margin-bottom:8px">Your coordinator · 05:12</p><p style="margin:0;font-size:18px;color:var(--navy)">Your pickup is confirmed for 06:40 at Terminal 2. I will be at the arrivals gate with your name.</p></div><div class="pg-prose"><p>Illustrative example. You meet your named coordinator on your first call.</p><p>Your coordinator stays with your case from the first call to your last video follow-up, and your family at home gets updates if you want them to.</p></div></div>`, { alt: true })
  + sec('Send us a message', contactForm('patient'), { id: 'message', sub: 'We reply by email. Please do not include detailed medical information here; share reports through the free AI assessment.' })
  + related([['FAQs', 'faq/'], ['Contact', 'contact/'], ['Trip planning guide', 'plan-your-trip/']])
  + cta());

function contactForm(topic) {
  const topics = [['patient', 'Treatment enquiry'], ['booking', 'Existing booking'], ['hospital', 'Hospital partnership'], ['agent', 'Agent partnership'], ['media', 'Media'], ['other', 'Other']];
  return `<div class="pg-panel" data-form style="max-width:640px"><form class="pg-form pg-form-body" data-preview novalidate>
<div class="pg-field"><label for="f-name">Your name</label><input id="f-name" name="name" required autocomplete="name"></div>
<div class="pg-field"><label for="f-email">Email address</label><input id="f-email" name="email" type="email" required autocomplete="email"></div>
<div class="pg-field"><label for="f-phone">Phone or WhatsApp (optional)</label><input id="f-phone" name="phone" autocomplete="tel"></div>
<div class="pg-field"><label for="f-topic">Topic</label><select id="f-topic" name="topic">${topics.map(([v, t]) => `<option value="${v}"${v === topic ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
<div class="pg-field"><label for="f-msg">Message</label><textarea id="f-msg" name="message" required></textarea><span class="pg-hint">We use your details only to answer your message.</span></div>
<div><button class="btn btn-primary" type="submit">Send message</button></div></form>
<div class="pg-form-done" role="status"><h3 style="font-size:22px;margin-bottom:8px">Thank you, your message is ready.</h3><p style="margin:0">Design preview: nothing is sent. On the live website this goes to the patient desk, and we reply by email.</p></div></div>`;
}

// Partners
page('partners/', 'Partner programme', 'Work with a transparent network: accredited hospitals and the agents and facilitators who refer patients to them.',
  hero({ crumbs: [['Partners']], eyebrow: 'Partner programme', title: 'Grow with a network <em>built on transparency.</em>',
    lead: 'We work with accredited hospitals and with the agents and facilitators who refer patients to them.',
    actions: btn('Talk to our partnerships team', '@@/partners/contact/') + btn('How referrals work', '@@/partners/how-referrals-work/', 'line'),
    facts: [['Portal for every case', '1'], ['To hospital quotes', '48 h', 'Typical, after complete reports'], ['Accreditation', 'JCI or NABH', 'Required for hospitals']] })
  + sec('', `<div class="pg-cards pg-two"><article class="pg-card"><p class="pg-eyebrow" style="margin:0">For hospitals</p><h3><a class="pg-card-link" href="@@/partners/hospitals/">Receive screened international referrals</a></h3><p>Complete reports arrive before the first call, and you quote from one portal.</p><ul style="margin:0;padding-left:20px"><li>JCI or NABH accreditation required</li><li>Structured, itemised quote requests</li><li>Coordinated arrivals</li></ul><span class="pg-go">Become a partner hospital</span></article>
<article class="pg-card"><p class="pg-eyebrow" style="margin:0">For agents and facilitators</p><h3><a class="pg-card-link" href="@@/partners/agents/">Refer patients and follow every case</a></h3><p>See each case's status in real time and your commission on every booking.</p><ul style="margin:0;padding-left:20px"><li>1 portal for every case</li><li>48 h to hospital quotes</li><li>Free registration, reviewed before activation</li></ul><span class="pg-go">Join as an agent</span></article></div>`)
  + related([['Become a partner hospital', 'partners/hospitals/'], ['Requirements', 'partners/hospitals/requirements/'], ['How referrals work', 'partners/how-referrals-work/'], ['Join as an agent', 'partners/agents/'],
    ['Commission and payouts', 'partners/agents/commission-and-payouts/'], ['Marketing resources', 'partners/agents/marketing-resources/'], ['Partner log in', 'login/#hospital'], ['Partnerships team', 'partners/contact/']])
  + cta('Talk to our partnerships team', 'Tell us about your hospital or agency and we will reply by email.', btn('Talk to our partnerships team', '@@/partners/contact/') + btn('Partner log in', '@@/login/#hospital', 'line')));

const benefits = (rows) => `<div class="pg-cards">${rows.map(([t, b]) => `<article class="pg-card"><h3>${t}</h3><p>${b}</p></article>`).join('')}</div>`;
const steps = (rows) => `<ol class="pg-steps">${rows.map(([t, b]) => `<li><h3>${t}</h3><p>${b}</p></li>`).join('')}</ol>`;
page('partners/hospitals/', 'For hospitals', 'Receive qualified international patient enquiries, send itemised quotes and get settlements on a clear schedule.',
  hero({ crumbs: [['Partners', '@@/partners/'], ['Hospitals']], eyebrow: 'For hospitals', title: 'Grow your international patient programme',
    lead: 'Heal India Global brings pre-assessed international enquiries to your international desk and handles visa letters, travel and coordination around them.',
    actions: btn('Become a partner hospital', '@@/partners/contact/?topic=hospital') + btn('Hospital log in', '@@/login/#hospital', 'line') })
  + sec('Why partner with us', benefits([['Qualified enquiries', 'Patients arrive with an AI-assisted intake, medical reports and preferences, so your team can quote faster.'], ['Itemised quotes and bookings', 'Send quotes, confirm admissions and manage bookings, packages and availability in the hospital portal.'],
    ['Clear settlements', 'Payments are collected through regulated payment providers and settled to your account on an agreed cycle with full statements.'], ['Travel handled', 'Visa invitation letters, airport pickups, accommodation and interpreters are coordinated with your desk.']]))
  + sec('How onboarding works', steps([['Register', 'Create a hospital account with your work email.'], ['Complete your profile', 'Add specialties, doctors, procedures, prices and packages.'], ['Verification', 'Upload registration, accreditation and tax documents and your payout account for review.'], ['Go live', 'Once approved, your hospital appears in search and starts receiving enquiries.']])
    + '<p class="pg-note pg-sample"><span>Commercial terms, including commission, are set out in your partner agreement before you go live.</span></p>', { alt: true, more: more('Requirements', '@@/partners/hospitals/requirements/') })
  + related([['Requirements', 'partners/hospitals/requirements/'], ['How referrals work', 'partners/how-referrals-work/'], ['Hospital log in', 'login/#hospital'], ['Talk to our partnerships team', 'partners/contact/']])
  + cta('Ready to welcome international patients?', 'Registration takes a few minutes. Our team reviews every hospital before it is listed.', btn('Become a partner hospital', '@@/partners/contact/?topic=hospital') + btn('Hospital log in', '@@/login/#hospital', 'line')));

page('partners/agents/', 'For agents and facilitators', 'Manage your patients, compare quotes from partner hospitals in India and track commissions in one portal.',
  hero({ crumbs: [['Partners', '@@/partners/'], ['Agents and facilitators']], eyebrow: 'For agents and facilitators', title: 'One portal for your medical-travel patients',
    lead: 'Register as an agent or facilitator to submit assessments for your patients, compare quotes across hospitals and track every case and commission.',
    actions: btn('Join as an agent', '@@/partners/contact/?topic=agent') + btn('Agent log in', '@@/login/#agent', 'line') })
  + sec('What you get', benefits([['Patient management', 'Add patients, run assessments on their behalf and keep their documents in one secure place.'], ['Compare quotes', 'Request itemised quotes from several partner hospitals and compare them side by side.'],
    ['Transparent commissions', 'See pending and paid commissions per booking, with statements and payouts to your account.'], ['Referral link', 'Share your referral link so patients who register through you are linked to your account.']]))
  + sec('Getting started', steps([['Register', 'Create an agent account with your agency name and country.'], ['Verify your agency', 'Upload your KYC documents and payout account in the agent portal.'], ['Start referring', 'Once approved, add patients, request quotes and book treatment.']])
    + '<p class="pg-note pg-sample"><span>Commission rates and payout terms are confirmed in your agent agreement.</span></p>', { alt: true })
  + related([['Commission and payouts', 'partners/agents/commission-and-payouts/'], ['Marketing resources', 'partners/agents/marketing-resources/'], ['How referrals work', 'partners/how-referrals-work/'], ['Agent log in', 'login/#agent']])
  + cta('Bring your patients to accredited Indian hospitals', 'Registration is free. Every agent is reviewed before activation.', btn('Join as an agent', '@@/partners/contact/?topic=agent') + btn('Agent log in', '@@/login/#agent', 'line')));

page('partners/contact/', 'Partnerships team', 'Talk to the Heal India Global partnerships team about hospital or agent partnerships.',
  hero({ crumbs: [['Partners', '@@/partners/'], ['Partnerships team']], eyebrow: 'Partner programme', title: 'Talk to our partnerships team',
    lead: 'Tell us about your hospital or agency. Screened referrals, complete reports: cases arrive with records attached.' })
  + sec('', contactForm('hospital'))
  + related([['For hospitals', 'partners/hospitals/'], ['For agents and facilitators', 'partners/agents/'], ['How referrals work', 'partners/how-referrals-work/']])
  + cta());

// Company
page('about/', 'About us', 'Heal India Global is a medical-travel facilitator connecting international patients with accredited partner hospitals in India.',
  hero({ crumbs: [['About us']], eyebrow: 'Company', title: 'About Heal India Global',
    lead: 'We help international patients reach quality, affordable care in India, with honest information, transparent prices and people who support you from your first question to your recovery.' })
  + sec('', `<div class="pg-split"><div class="pg-prose"><h2 id="what-we-do">What we do</h2><ul><li>A free AI-assisted assessment that suggests relevant specialties and matches you with hospitals and doctors.</li><li>Transparent, indicative prices compared with your home country, and itemised quotes from hospitals.</li><li>Booking and secure payments, e-Medical visa support, travel, accommodation and interpreters.</li><li>In-country support with a coordinator, a 24/7 helpline and practical guidance.</li></ul>
<h2 id="what-we-are-not">What we are not</h2><p>We are not a hospital and we do not provide medical care. Diagnosis and treatment decisions are made by qualified doctors at the hospital you choose. Accreditations belong to the hospitals, not to us.</p></div>
<div class="pg-prose"><h2 id="how-hospitals-are-listed">How hospitals are listed</h2><p>Hospitals register, complete their profile and upload registration, accreditation and tax documents. Our team reviews them before they appear on the platform, and hospitals keep their prices and availability up to date. <a href="@@/how-we-verify/">How we verify hospitals</a>.</p>
<h2 id="how-we-use-ai">How we use AI</h2><p>The assessment uses an AI model to organise your answers and suggest relevant specialties. It is not a diagnosis, it only runs with your consent, and urgent symptoms are flagged so you can seek local emergency care. You can always choose not to use AI.</p>
<h2 id="your-data">Your data</h2><p>Medical information is shared with a hospital only after you consent. Sensitive fields such as passport numbers are encrypted, and card details are handled by the payment provider, never stored by us.</p></div></div>`)
  + related([['How we verify hospitals', 'how-we-verify/'], ['Careers', 'careers/'], ['Contact', 'contact/'], ['Privacy', 'privacy/']])
  + cta());

page('contact/', 'Contact', 'Questions about treatment in India, a hospital or agent partnership, or your booking? Contact the Heal India Global team.',
  hero({ crumbs: [['Contact']], eyebrow: 'Company', title: 'Contact us', lead: 'Questions about treatment, a partnership or an existing booking? Send us a message and we will reply by email.' })
  + sec('', `<div class="pg-split"><div>${contactForm('patient')}</div><div class="pg-prose"><h2 id="patients">Patients with an account</h2><p>Message your coordinator from the patient portal to keep everything about your case in one place.</p>
<h2 id="reach-us">Reach us</h2><p><a href="https://wa.me/919000000000">WhatsApp us</a> · <a href="tel:+919000000000">+91 90000 00000</a><br><a href="mailto:care@healindiaglobal.example">care@healindiaglobal.example</a></p>
<h2 id="helplines">Helplines</h2><p>In a medical emergency in India, dial 112.</p><p>Please do not include detailed medical information in this form. Share medical reports securely through the patient portal or the AI assessment.</p></div></div>`)
  + sec('', EMERGENCY)
  + related([['Patient support', 'support/'], ['FAQs', 'faq/'], ['Talk to our partnerships team', 'partners/contact/']])
  + cta());

// Assessment (preview of the first steps; on this PC it can open the real app)
page('assessment/', 'Free AI assessment', 'Start a free AI assessment: tell us what is wrong, share your reports and a doctor reviews your case.',
  hero({ crumbs: [['Free AI assessment']], eyebrow: 'Free AI assessment · About 5 minutes', title: 'Tell us what is wrong, <em>in your own words.</em>',
    lead: 'Upload reports or answer a short guided questionnaire. Our AI organises your history, and a doctor on our medical team reviews it. Not a diagnosis.' })
  + sec('', `<div class="pg-split"><div class="pg-panel" data-form data-steps><div class="pg-progress" aria-hidden="true"><i class="pg-on"></i><i></i><i></i></div>
<form class="pg-form pg-form-body" data-preview novalidate style="max-width:none">
<fieldset data-step="1" style="border:0;padding:0;margin:0;display:grid;gap:16px"><legend class="pg-eyebrow">Step 1 of 3 · Your treatment</legend>
<div class="pg-field"><label for="a-need">What would you like help with?</label><input id="a-need" name="need" placeholder="e.g. knee replacement" required data-param="need"><span class="pg-hint" data-param-show="hospital" hidden>Hospital you asked about: <b data-param-text="hospital"></b></span><span class="pg-hint" data-param-show="doctor" hidden>Doctor you asked about: <b data-param-text="doctor"></b></span></div>
<div class="pg-pill-opts" role="group" aria-label="Popular">${['Heart bypass', 'Knee replacement', 'IVF', 'Kidney transplant'].map((x) => `<button type="button" class="pg-chip" data-fill="${x}">${x}</button>`).join('')}</div></fieldset>
<fieldset data-step="2" hidden style="border:0;padding:0;margin:0;display:grid;gap:16px"><legend class="pg-eyebrow">Step 2 of 3 · About you</legend>
<div class="pg-field"><label for="a-for">Who is the treatment for?</label><select id="a-for" name="for"><option>Me</option><option>A family member</option><option>A patient I refer (agent)</option></select></div>
<div class="pg-field"><label for="a-country">Country of residence</label><input id="a-country" name="country" autocomplete="country-name" required></div>
<div class="pg-field"><label for="a-when">When would you like treatment?</label><select id="a-when" name="when"><option>As soon as possible</option><option>Within 1 to 3 months</option><option>Later, I am exploring options</option></select></div></fieldset>
<fieldset data-step="3" hidden style="border:0;padding:0;margin:0;display:grid;gap:16px"><legend class="pg-eyebrow">Step 3 of 3 · Your reports</legend>
<div class="pg-field"><label for="a-files">Reports and scans (optional)</label><input id="a-files" type="file" multiple><span class="pg-hint">PDF or images. In this design preview files stay on your device.</span></div>
<div class="pg-field"><label for="a-notes">Anything else your doctor should know?</label><textarea id="a-notes" name="notes"></textarea></div></fieldset>
<div style="display:flex;gap:12px;flex-wrap:wrap"><button type="button" class="btn btn-line" data-back hidden>Back</button><button class="btn btn-primary" type="submit" data-next>Continue</button></div></form>
<div class="pg-form-done" role="status"><p class="pg-eyebrow">Free AI assessment</p><h3 style="font-size:26px;margin-bottom:12px">Here is what happens next</h3><p>You asked about: <b data-echo="need"></b></p>
<ol class="pg-steps" style="margin:18px 0"><li><h3>Create your free account</h3><p>So your reports and quotes stay in one secure place.</p></li><li><h3>Answer a few questions</h3><p>Add any reports you have. It takes about 5 minutes.</p></li><li><h3>A doctor reviews your case</h3><p>Usually within 2 working days, then matched hospitals send itemised quotes.</p></li></ol>
<p class="pg-note"><span>Design preview: nothing is sent. On the live website this starts your assessment.</span></p><a class="btn btn-primary" data-local-href="http://localhost:3000/login?next=http://localhost:5173/app/screening/new" hidden>Open the real assessment on this PC</a></div></div>
<div class="pg-prose"><h2 id="what-happens">What happens next</h2><ol><li><strong>Assess.</strong> A free AI assessment, reviewed by a doctor.</li><li><strong>Choose.</strong> Compare matched hospitals and itemised quotes.</li><li><strong>Travel.</strong> e-Medical visa, flights, airport pickup and a stay nearby.</li><li><strong>Treat.</strong> Your coordinator and a translator at every appointment.</li><li><strong>Recover.</strong> Fly home with a plan, then video follow-ups.</li></ol>
<p>AI-assisted screening. Not a diagnosis. A doctor reviews every case.</p>${EMERGENCY}</div></div>`)
  + related([['How quotes work', 'how-quotes-work/'], ['Second opinion', 'second-opinion/'], ['Privacy', 'privacy/'], ['FAQs', 'faq/']]));

// Sign in
page('login/', 'Log in', 'Log in to Heal India Global as a patient, a partner hospital or an agent.',
  hero({ crumbs: [['Log in']], eyebrow: 'Welcome back', title: 'Log in', lead: 'Patients, partner hospitals and agents each have their own portal. Choose yours to continue.' })
  + sec('', `<div class="pg-split"><div class="pg-panel" data-form data-login><div class="pg-seg" role="tablist" aria-label="Account type">${[['patient', 'Patient'], ['hospital', 'Hospital'], ['agent', 'Agent']].map(([k, t], i) => `<button type="button" role="tab" data-door="${k}" aria-selected="${i ? 'false' : 'true'}">${t}</button>`).join('')}</div>
<form class="pg-form pg-form-body" data-preview novalidate><p class="pg-sub" style="margin:0" data-door-text>Your assessment, quotes, bookings and messages with your coordinator.</p>
<div class="pg-field"><label for="l-email">Email address</label><input id="l-email" type="email" required autocomplete="email"></div>
<div class="pg-field"><label for="l-pass">Password</label><input id="l-pass" type="password" required autocomplete="current-password"></div>
<div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap"><button class="btn btn-primary" type="submit">Log in</button><a href="@@/assessment/" data-door-alt>New here? Start a free assessment</a></div></form>
<div class="pg-form-done" role="status"><h3 style="font-size:22px;margin-bottom:8px">Design preview</h3><p>Sign-in opens on the live website. Nothing was sent.</p><a class="btn btn-primary" data-local-href="" data-door-local hidden>Open the real portal on this PC</a></div></div>
<div class="pg-prose"><h2 id="portals">Three portals</h2><ul><li><strong>Patients:</strong> your assessment, quotes, bookings, payments and messages with your coordinator.</li><li><strong>Hospitals:</strong> referrals, itemised quotes, admissions and settlements.</li><li><strong>Agents and facilitators:</strong> your patients, their cases and your commission.</li></ul><p>Not a partner yet? <a href="@@/partners/hospitals/">Become a partner hospital</a> or <a href="@@/partners/agents/">join as an agent</a>.</p></div></div>`));

/* ---------- write every page into every theme ---------- */
const WRAP_NOTE = '<!-- generated by _build/build.mjs: edit the builder, not this file -->';
let written = 0;
for (const [dir, key] of THEMES) {
  const src = read(path.join(ROOT, dir, 'index.html'));
  const mainStart = src.indexOf('<main'), mainEnd = src.indexOf('</main>') + 7;
  let head = src.slice(0, src.indexOf('</head>'));
  head = head.replace(/<html([^>]*)>/, (m, a) => `<html${a.replace(/\sdata-pg="[^"]*"/, '')} data-pg="${key}">`)
    .replace(/\s*<link[^>]+rel="preload"[^>]*as="image"[^>]*>/g, '').replace(/\s*<link[^>]+as="image"[^>]*rel="preload"[^>]*>/g, '')
    .replace(/\s*<link[^>]+rel="canonical"[^>]*>/g, '').replace(/\s*<meta[^>]+(property="og:|name="twitter:)[^>]*>/g, '')
    .replace(/\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');
  const top = src.slice(src.indexOf('</head>'), mainStart);
  const bottom = src.slice(mainEnd);
  for (const d of GENERATED) fs.rmSync(path.join(ROOT, dir, d), { recursive: true, force: true });
  for (const p of PAGES) {
    const h = head.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(p.title)} | Heal India Global</title>`)
      .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(p.desc)}">`);
    const html = `${h}\n<link rel="stylesheet" href="/pages.css?v=${ASSET_V}">\n<script src="/pages.js?v=${ASSET_V}" defer></script>\n${top}<main id="main" class="pg">\n${WRAP_NOTE}\n${p.body.replace(/@@\//g, `/${dir}/`)}\n</main>${bottom}`;
    const out = path.join(ROOT, dir, p.path, 'index.html');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, html);
    written++;
  }
}
console.log(`${PAGES.length} pages x ${THEMES.length} themes = ${written} files`);
fs.writeFileSync(path.join(HERE, 'pages.json'), JSON.stringify(PAGES.map((p) => p.path), null, 1));
