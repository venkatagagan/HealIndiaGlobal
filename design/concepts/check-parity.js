// Content parity check for the home-page themes: every theme must carry the information in CONTENT.md.
// Usage (concepts server on :3200):  node check-parity.js [concept-main concept-a-editorial ...]
// Resolve playwright from the web workspace; browsers live in the project .devtools.
process.env.PLAYWRIGHT_BROWSERS_PATH ||= 'C:/NewProjects/ForHosp/.devtools/ms-playwright';
const { chromium } = require(require.resolve('playwright', { paths: ['C:/NewProjects/ForHosp/web'] }));

const BASE = (process.env.BASE || 'http://localhost:3200').replace(/\/$/, '');
const THEMES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['concept-main', 'concept-a-editorial', 'concept-b-clinical', 'concept-c-journey'];

// Key phrases from CONTENT.md (matched after normalising whitespace, dashes and apostrophes, case-insensitive).
const REQUIRED = {
  header: ['International patient desk, open 24 hours', 'Patient support', '+91 90000 00000', 'Log in', 'Get started',
    'Treatments', 'Hospitals', 'Doctors', 'Plan your trip', 'Partners'],
  'menu: treatments': ['Care led by senior specialists, quoted line by line.', 'All treatments', 'Heart bypass (CABG)',
    'Hip replacement', 'Spine surgery', 'Cancer care', 'Not sure which treatment you need?', 'Start an assessment',
    'Before you decide', 'Second opinion', 'Indicative costs', 'How quotes work'],
  'menu: hospitals': ['Accredited hospitals, compared on the same terms.', 'All hospitals', 'By city', 'Choosing well',
    'JCI and NABH explained', 'How we verify', 'Compare hospitals', 'International desks', 'What a quote includes',
    'In seven cities with international airports.', 'Every quote names the hospital, the surgeon and each line of cost.'],
  'menu: doctors': ['Know your surgeon before you fly.', 'All doctors', 'Cardiac surgeons', 'Orthopaedic surgeons',
    'Oncologists', 'Transplant surgeons', 'Neurosurgeons', 'Fertility specialists', 'Video consultation',
    'Find a doctor by name', 'How we vet doctors', 'Speak to a specialist from home', 'Book a consultation',
    'Every profile lists qualifications and hospital affiliation.'],
  'menu: trip': ['From your quote to your flight home.', 'Trip planning guide', 'Before you fly', 'Flights and airport pickup',
    'Costs and payment', 'What to bring', 'While in India', 'Where you will stay', 'WhatsApp and SOS line',
    'e-Medical visa decision', 'Typical time after you apply. Indicative.', 'All seven cities'],
  'menu: partners': ['Work with a transparent network.', 'Partner programme', 'Become a partner', 'Requirements',
    'How referrals work', 'Hospital log in', 'Commission and payouts', 'Marketing resources', 'Agent log in',
    'Screened referrals, complete reports', 'Cases arrive with records attached.', 'Talk to our partnerships team',
    'Partnerships team'],
  hero: ['Medical travel to India', 'Exceptional care in India, arranged around you.',
    'Accredited hospitals, itemised quotes and one coordinator, from your first report to your flight home.',
    'Free AI assessment', 'About 5 minutes', 'Start assessment', 'Kidney transplant',
    'Not a diagnosis. A doctor reviews every case.', 'JCI & NABH accredited', 'Itemised quotes in 48 hours', '24-hour patient desk'],
  'journey rail': ['Your journey, in five stops', 'Share reports from home. A free AI assessment, reviewed by a doctor.',
    'Compare matched hospitals and itemised quotes.', 'e-Medical visa, flights, airport pickup and a stay nearby.',
    'Your coordinator and a translator at every appointment.', 'Fly home with a plan, then video follow-ups with your doctor.'],
  trust: ['Every partner hospital holds Joint Commission International or NABH accreditation', 'Accredited partner hospitals',
    'Cities with international airports', '5,000+', 'International patients guided', 'Indicative figure across our partner network.'],
  specialties: ['Eight specialties, chosen for depth.',
    "We focus where India's accredited hospitals have the most experience with international patients.",
    'Specialists are named on every quote, with their training and experience.',
    'Cardiac sciences', 'Bypass, valve repair, angioplasty', 'Orthopaedics', 'Knee, hip and shoulder replacement', 'Oncology',
    'Surgery, radiation and chemotherapy', 'Organ transplant', 'Kidney, liver and bone marrow', 'Neurosciences',
    'Brain and spine surgery, stroke care', 'Fertility and IVF', 'IVF, ICSI and egg freezing', 'Weight-loss surgery',
    'Sleeve gastrectomy, gastric bypass', 'Eye care', 'Cataract, LASIK and retina surgery',
    'We cover more than 40 treatments.', 'Browse all treatments'],
  costs: ['The same operation, at a fraction of the price.', 'Coronary artery bypass graft (CABG)', '$70,000 - $200,000',
    '$4,000 - $7,400', 'Your US quote', 'Every quote is itemised', 'Surgeon and theatre', 'Room and ICU stay',
    'Implants and medicines', 'Tests and follow-up', 'Flights, stay and follow-up care are extra.'],
  destinations: ['Seven cities, one standard of care.', 'Choose a city for its hospital, its flights or simply the place you would like to recover in.',
    'Delhi NCR', 'The capital region, with Delhi and Gurugram hospitals', 'Chennai', 'A long-standing hub for international patients',
    'Mumbai', 'The coastal financial capital', 'Bengaluru', 'Mild climate all year round', 'Hyderabad',
    'Major multi-specialty centres', 'Vijayawada', 'On the banks of the Krishna', 'Visakhapatnam', 'Hills meet the Bay of Bengal',
    'DEL', 'MAA', 'BOM', 'BLR', 'HYD', 'VGA', 'VTZ'],
  'how it works': ['Five stops. One coordinator. Door to door.', 'Typical time from first upload to arrival: 2 to 4 weeks',
    'Tell us what is wrong, in your own words.', 'Compare matched hospitals, line by line.',
    'Visa, flights and a room near the hospital.', 'Someone beside you at every appointment.',
    'A plan for home, and a doctor who stays in touch.', 'No surprises at discharge.', 'Companion stay', 'Lagos', '18 days',
    'Translator on site', 'Discharge plan', 'Video follow-ups', 'A free assessment takes about ten minutes.'],
  support: ['One person who knows your case, day and night.', 'answers at 3 am', 'Messages answered around the clock',
    'A direct line while you are in India', 'Airport to bedside', 'Pickup, transfers and admission',
    'Arabic, French, Bengali, Swahili and more', 'Your pickup is confirmed for 06:40 at Terminal 2.',
    'Emergency - seek local care now', 'We are not an emergency service.'],
  story: ['An illustrative patient journey', "We came for my husband's bypass.", 'a coordinator who still checks in every month',
    'Illustrative: a composite of typical journeys, not a real patient or quote.', 'Reports uploaded', 'Quote accepted',
    'Lands in Chennai', 'Bypass surgery', 'Flies home', 'Video follow-up'],
  partners: ['Grow with a network built on transparency.', 'Receive screened international referrals',
    'JCI or NABH accreditation required', 'Structured, itemised quote requests', 'Coordinated arrivals',
    'Become a partner hospital', 'Refer patients and follow every case', 'your commission on every booking', 'Join as an agent'],
  'final cta': ['Begin with a free AI assessment.', 'Free, and without obligation.', 'Talk to a coordinator',
    'AI-assisted screening. Not a diagnosis.'],
  footer: ['Disclaimer', 'is a medical travel facilitator, not a hospital or a doctor.', 'care@healindiaglobal.example', 'FAQs',
    'Travel and stay', 'In-country support', 'Agents and facilitators', 'Partner log in', 'About us', 'How we verify hospitals',
    'Careers', 'Photo credits', '© 2026 Heal India Global', 'Privacy', 'Terms', 'Cookies', 'Accessibility', 'Developed by',
    'DV Soft', 'WhatsApp us', 'Call us'],
};
const FORBIDDEN = ['menus shown open', 'five menus, shown open', 'all five menus', 'five menus, one calm pattern', 'lorem ipsum'];

const norm = (s) => s.replace(/[\u00a0\u202f]/g, ' ').replace(/[\u2013\u2014\u2212]/g, '-').replace(/[\u2018\u2019]/g, "'")
  .replace(/\s+/g, ' ').toLowerCase();

(async () => {
  const browser = await chromium.launch();
  let failed = 0;
  for (const theme of THEMES) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: { 'ngrok-skip-browser-warning': '1' } });
    await page.goto(`${BASE}/${theme}/`, { waitUntil: 'load' });
    // Visible text plus hidden menus and drawers; scripts and styles excluded.
    const text = norm(await page.evaluate(() => {
      const c = document.body.cloneNode(true);
      c.querySelectorAll('script,style,noscript,template').forEach((n) => n.remove());
      c.querySelectorAll('*').forEach((n) => { if (n.shadowRoot) n.append(n.shadowRoot.textContent); });
      // textContent glues adjacent blocks ("01Assess"); add separators at element boundaries.
      const parts = [];
      (function rec(n) { for (const ch of n.childNodes) { if (ch.nodeType === 3) parts.push(ch.data); else if (ch.nodeType === 1) { parts.push(' '); rec(ch); parts.push(' '); } } })(c);
      return parts.join('').replace(/ {2,}/g, ' ');
    }));
    const missing = [];
    for (const [section, phrases] of Object.entries(REQUIRED))
      for (const p of phrases) if (!text.includes(norm(p))) missing.push(`${section}: ${p}`);
    const banned = FORBIDDEN.filter((p) => text.includes(norm(p)));
    const ok = !missing.length && !banned.length;
    if (!ok) failed++;
    console.log(`\n${ok ? 'PASS' : 'FAIL'} ${theme}  (${missing.length} missing, ${banned.length} forbidden)`);
    for (const m of missing) console.log('  missing   ' + m);
    for (const b of banned) console.log('  forbidden ' + b);
    await page.close();
  }
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
