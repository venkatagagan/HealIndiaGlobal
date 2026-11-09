/* Shared link behaviour for every theme (loaded by the theme-switcher block that switcher.py injects).
 * Theme pages use placeholder links (href="#"). Sections carry the same headings in every theme (CONTENT.md), so a
 * link label resolves to a section by its heading text: the page scrolls there and the open menu/drawer closes.
 * Pages that are not part of the home page (log in, legal, about) open on the live website. */
(function () {
  var SITE = 'http://localhost:3000';
  // Opened through a tunnel (ngrok) the live website on this PC is unreachable, so those links explain instead.
  var LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  // Placeholder contact number (+91 90000 00000) may belong to a real person: never dial or message it.
  var DEMO_NUMBER = /919000000000/;
  // section key -> phrase that only that section contains (heading text from CONTENT.md)
  var SECTIONS = {
    specialties: 'Eight specialties, chosen for depth',
    costs: 'The same operation, at a fraction of the price',
    destinations: 'Seven cities, one standard of care',
    trust: 'Every partner hospital holds Joint Commission International',
    how: 'Five stops. One coordinator. Door to door',
    support: 'One person who knows your case, day and night',
    story: 'An illustrative patient journey',
    partners: 'Grow with a network built on transparency',
    final: 'Begin with a free AI assessment'
  };
  var LINKS = {
    assess: ['start an assessment', 'get started', 'free ai assessment', 'get a free ai assessment', 'second opinion',
      'video consultation', 'book a consultation', 'speak to a specialist from home'],
    specialties: ['all treatments', 'browse all treatments', 'treatments', 'heart bypass (cabg)', 'knee replacement',
      'hip replacement', 'spine surgery', 'weight-loss surgery', 'cancer care', 'organ transplant', 'neurosciences',
      'fertility and ivf', 'eye care', 'all doctors', 'cardiac surgeons', 'orthopaedic surgeons', 'oncologists',
      'transplant surgeons', 'neurosurgeons', 'fertility specialists', 'find a doctor by name', 'how we vet doctors',
      'cardiac sciences', 'orthopaedics', 'oncology', 'not sure which treatment you need?'],
    costs: ['indicative costs', 'how quotes work', 'what a quote includes', 'costs and payment', 'compare hospitals'],
    destinations: ['all hospitals', 'delhi ncr', 'chennai', 'mumbai', 'bengaluru', 'hyderabad', 'vijayawada',
      'visakhapatnam', 'all seven cities', 'destinations', 'international desks', 'accredited partner hospitals'],
    trust: ['jci and nabh explained', 'how we verify', 'how we verify hospitals'],
    how: ['how it works', 'see the whole journey', 'see every stop', 'trip planning guide', 'e-medical visa',
      'flights and airport pickup', 'what to bring', 'where you will stay', 'travel and stay', 'e-medical visa decision'],
    support: ['your coordinator', 'translators', 'whatsapp and sos line', 'in-country support', 'talk to a coordinator',
      'patient support'],
    partners: ['partner programme', 'become a partner', 'become a partner hospital', 'requirements', 'how referrals work',
      'join as an agent', 'commission and payouts', 'marketing resources', 'talk to our partnerships team',
      'partnerships team', 'hospitals', 'agents and facilitators', 'screened referrals, complete reports'],
    top: ['heal india global', 'home']
  };
  var LIVE = { 'log in': '/login', 'hospital log in': '/login', 'agent log in': '/login', 'partner log in': '/login',
    'about us': '/about', 'contact': '/contact', 'faqs': '/faq', 'privacy': '/privacy', 'terms': '/terms' };
  var SOON = ['careers', 'cookies', 'accessibility'];

  var norm = function (s) {
    return (s || '').replace(/[→↗→↗]/g, '').replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();
  };
  var byLabel = {};
  Object.keys(LINKS).forEach(function (k) { LINKS[k].forEach(function (l) { byLabel[l] = k; }); });
  // Feature tiles wrap several lines in one link: match on a distinctive phrase, longest first.
  var all = Object.keys(byLabel).sort(function (a, b) { return b.length - a.length; });
  var phrases = all.filter(function (l) { return l.length > 12; });

  function resolve(a) {
    var label = norm(a.getAttribute('aria-label') || a.textContent);
    if (LIVE[label]) return { live: LIVE[label] };
    if (SOON.indexOf(label) >= 0) return { soon: true };
    if (byLabel[label]) return { key: byLabel[label], label: label };
    // Cards: "02 Orthopaedics Knee, hip…", "Delhi NCR DEL The capital region…" start with their label.
    var bare = label.replace(/^\d+\s*/, '');
    for (var j = 0; j < all.length; j++) if (bare.indexOf(all[j]) === 0) return { key: byLabel[all[j]], label: all[j] };
    for (var i = 0; i < phrases.length; i++) if (label.indexOf(phrases[i]) >= 0) return { key: byLabel[phrases[i]], label: phrases[i] };
    return null;
  }

  function sectionFor(key) {
    var phrase = norm(SECTIONS[key]);
    var skip = function (n) {
      return /^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT|HEADER|NAV|FOOTER)$/i.test(n.tagName) ||
        n.closest('header, nav, footer, .mega, [role="dialog"], [data-ts], #drawer, .drawer');
    };
    var has = function (n) { return !skip(n) && norm(n.textContent).indexOf(phrase) >= 0; };
    // first occurrence in document order, then down to the innermost element that still holds the phrase
    var nodes = document.body.querySelectorAll('*'), hit = null;
    for (var i = 0; i < nodes.length && !hit; i++) if (has(nodes[i])) hit = nodes[i];
    for (var deeper = hit; deeper; ) {
      hit = deeper; deeper = null;
      for (var c = 0; c < hit.children.length; c++) if (has(hit.children[c])) { deeper = hit.children[c]; break; }
    }
    if (!hit) return null;
    var sec = hit.closest('section');
    return sec && hit.getBoundingClientRect().top - sec.getBoundingClientRect().top < 400 ? sec : hit;
  }

  function headerOffset() {
    var hs = document.querySelectorAll('.site-header, body > header, header');
    for (var i = 0; i < hs.length; i++) {
      var cs = getComputedStyle(hs[i]);
      // the header's height where it sticks (the utility bar above it has scrolled away by then)
      if (cs.position === 'sticky' || cs.position === 'fixed') return hs[i].getBoundingClientRect().height + (parseFloat(cs.top) || 0);
    }
    return 0;
  }

  function scrollToEl(el) {
    var gap = el.tagName === 'SECTION' ? 8 : 64; // a bare heading gets room for its eyebrow
    var y = el.getBoundingClientRect().top + scrollY - headerOffset() - gap;
    scrollTo({ top: Math.max(0, y), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  function toast(msg) {
    var t = document.getElementById('nl-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'nl-toast'; t.setAttribute('role', 'status');
      t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483001;background:#102A43;color:#fff;font:500 14px/1.4 Inter,system-ui,sans-serif;padding:12px 18px;border-radius:999px;box-shadow:0 12px 32px -12px rgba(16,42,67,.5);transition:opacity .2s';
      document.body.appendChild(t);
    }
    t.textContent = msg; t.style.opacity = '1';
    clearTimeout(t._h); t._h = setTimeout(function () { t.style.opacity = '0'; }, 2400);
  }

  function closeMenus() {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  function go(r) {
    if (r.key === 'top') return scrollTo({ top: 0, behavior: 'smooth' });
    if (r.key === 'assess') {
      var input = document.querySelector('input[placeholder*="knee replacement" i]');
      if (input) {
        scrollToEl(input.closest('form') || input);
        // focus once the smooth scroll has settled (menus may hand focus back to their button while closing)
        setTimeout(function () { input.focus({ preventScroll: true }); }, 800);
        return;
      }
      r = { key: 'final' };
    }
    var el = sectionFor(r.key);
    if (!el) return;
    scrollToEl(el);
    // Destinations: select the city in themes whose atlas uses buttons/tabs.
    if (r.key === 'destinations' && r.label) {
      var opts = el.querySelectorAll('button, [role="tab"]');
      for (var i = 0; i < opts.length; i++) if (norm(opts[i].textContent).indexOf(r.label) === 0) { opts[i].click(); break; }
    }
  }

  window.__navLinks = { resolve: resolve, sectionFor: sectionFor };

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a || a.closest('[data-ts]')) return;
    var href = a.getAttribute('href');
    if (DEMO_NUMBER.test(href)) {
      e.preventDefault();
      return toast('Demo number. The real WhatsApp and phone numbers will be added before launch.');
    }
    if (href !== '' && href.charAt(0) !== '#') return; // real URLs (dvsoft.in, mailto:, ...) behave normally
    // Contact buttons without a real link yet: same note as the demo number.
    if (/^(whatsapp( us)?|call( us)?|\+91 90000 00000)$/.test(norm(a.getAttribute('aria-label') || a.textContent))) {
      e.preventDefault();
      return toast('Demo number. The real WhatsApp and phone numbers will be added before launch.');
    }
    // In-page links: the shared label map wins, so every theme lands on the same section the same way.
    var r = resolve(a);
    if (!r && href.length > 1 && document.getElementById(href.slice(1))) { setTimeout(closeMenus, 0); return; }
    e.preventDefault();
    if (!r) { closeMenus(); return toast('This page is part of the full website, coming soon.'); }
    if (r.live) {
      if (LOCAL) { location.href = SITE + r.live; return; }
      closeMenus(); return toast('This page is part of the full website, coming soon.');
    }
    if (r.soon) { closeMenus(); return toast('This page is coming soon.'); }
    closeMenus();
    requestAnimationFrame(function () { requestAnimationFrame(function () { go(r); }); });
  }, true);
})();
