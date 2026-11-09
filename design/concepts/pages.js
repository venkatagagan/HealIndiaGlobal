/* Inner pages: filters and search, hospital comparison, the assessment steps, the log-in doors and preview forms.
   Preview forms never send anything; on this PC (localhost) a few buttons can open the real portals. */
(function () {
  var params = new URLSearchParams(location.search);
  var LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var header = $('.site-header');
  if (header) document.documentElement.style.setProperty('--pg-top', header.offsetHeight + 'px');

  /* ---------- filters (chips + search) ---------- */
  $$('[data-filter]').forEach(function (group) {
    var scope = group.closest('.wrap');
    var attr = group.getAttribute('data-filter');
    var search = $('[data-search]', scope), count = $('[data-count]', scope), empty = $('[data-empty]', scope);
    var items = $$('[data-' + attr + ']', scope).filter(function (el) { return el !== group && !el.matches('.pg-chip'); });
    var noun = items[0] && items[0].tagName === 'TR' ? ['treatment', 'treatments'] : attr === 'city' ? ['hospital', 'hospitals'] : ['doctor', 'doctors'];
    var value = '';
    function apply() {
      var q = search ? search.value.trim().toLowerCase() : '';
      var n = 0;
      items.forEach(function (el) {
        var ok = (!value || el.getAttribute('data-' + attr) === value) && (!q || (el.getAttribute('data-text') || el.textContent.toLowerCase()).indexOf(q) > -1);
        el.hidden = !ok; if (ok) n++;
      });
      if (count) count.textContent = n + ' ' + (n === 1 ? noun[0] : noun[1]);
      if (empty) empty.hidden = n > 0;
    }
    function set(v) {
      value = v;
      $$('.pg-chip', group).forEach(function (c) { c.setAttribute('aria-pressed', String(c.getAttribute('data-value') === v)); });
      apply();
    }
    group.addEventListener('click', function (e) { var c = e.target.closest('.pg-chip'); if (c) set(c.getAttribute('data-value')); });
    if (search) search.addEventListener('input', apply);
    var start = params.get(attr === 'spec' ? 'specialty' : attr) || '';
    if (search && params.get('q')) search.value = params.get('q');
    set($('.pg-chip[data-value="' + start + '"]', group) ? start : '');
    if (search && location.hash === '#find') setTimeout(function () { search.focus(); }, 300);
  });

  /* ---------- compare hospitals ---------- */
  var cmpData = $('#cmp-data');
  if (cmpData) {
    var H = JSON.parse(cmpData.textContent), bySlug = {};
    H.forEach(function (h) { bySlug[h.slug] = h; });
    var sels = $$('[data-cmp]'), out = $('#cmp-table');
    var first = bySlug[params.get('h')] || H[0], picks = [first.slug], cities = [first.cityKey];
    H.forEach(function (h) { if (picks.length < 3 && cities.indexOf(h.cityKey) < 0) { picks.push(h.slug); cities.push(h.cityKey); } });
    sels.forEach(function (s, i) { s.value = picks[i] || ''; s.addEventListener('change', render); });
    var ROWS = [['City', 'city'], ['Accreditation', 'acc'], ['Beds', 'beds'], ['Established', 'est'], ['From the airport', 'km', ' km'], ['Procedures from', 'from'],
      ['Specialties', 'specs'], ['Languages', 'langs'], ['International desk', 'intl'], ['Doctors listed', 'docs'], ['Procedures priced', 'procs']];
    var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); };
    var root = location.pathname.match(/^\/[^/]+\//)[0];
    function render() {
      var hs = sels.map(function (s) { return bySlug[s.value]; }).filter(Boolean);
      out.innerHTML = '<div class="pg-tbl-wrap"><table class="pg-tbl"><thead><tr><th scope="col">Compare</th>' + hs.map(function (h) {
        return '<th scope="col"><a href="' + root + 'hospitals/' + h.slug + '/">' + esc(h.name) + '</a></th>'; }).join('') + '</tr></thead><tbody>' +
        ROWS.map(function (r) { return '<tr><th scope="row">' + r[0] + '</th>' + hs.map(function (h) { return '<td>' + esc(h[r[1]]) + (r[2] || '') + '</td>'; }).join('') + '</tr>'; }).join('') +
        '</tbody></table></div>';
    }
    render();
  }

  /* ---------- URL parameters shown on the page ---------- */
  $$('[data-param]').forEach(function (el) { var v = params.get(el.getAttribute('data-param')); if (v) el.value = v; });
  $$('[data-param-show]').forEach(function (el) {
    var v = params.get(el.getAttribute('data-param-show'));
    if (v) { el.hidden = false; var t = $('[data-param-text]', el); if (t) t.textContent = v; }
  });
  $$('[data-fill]').forEach(function (b) {
    b.addEventListener('click', function () { var i = $('#a-need'); if (i) { i.value = b.getAttribute('data-fill'); i.focus(); } });
  });
  function showLocal(el, href) { if (LOCAL && href) { el.href = href; el.hidden = false; } else el.hidden = true; }
  $$('[data-local-href]').forEach(function (el) { showLocal(el, el.getAttribute('data-local-href')); });

  /* ---------- log-in doors ---------- */
  var login = $('[data-login]');
  if (login) {
    var DOORS = {
      patient: ['Your assessment, quotes, bookings and messages with your coordinator.', 'New here? Start a free assessment', 'assessment/', 'http://localhost:3000/login'],
      hospital: ['Referrals, itemised quotes, admissions and settlements for your hospital.', 'Not a partner yet? Become a partner hospital', 'partners/hospitals/', 'http://localhost:5175/hospital/'],
      agent: ['Your patients, their cases and your commission on every booking.', 'Not an agent yet? Join as an agent', 'partners/agents/', 'http://localhost:5174/agent/'],
    };
    var base = location.pathname.match(/^\/[^/]+\//)[0];
    var door = function (k) {
      if (!DOORS[k]) k = 'patient';
      $$('[data-door]', login).forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-door') === k)); });
      $('[data-door-text]', login).textContent = DOORS[k][0];
      var alt = $('[data-door-alt]', login); alt.textContent = DOORS[k][1]; alt.href = base + DOORS[k][2];
      showLocal($('[data-door-local]', login), DOORS[k][3]);
      login.classList.remove('pg-done');
    };
    login.addEventListener('click', function (e) { var b = e.target.closest('[data-door]'); if (b) { history.replaceState(null, '', '#' + b.getAttribute('data-door')); door(b.getAttribute('data-door')); } });
    var pick = function () { var h = location.hash.slice(1); door(h === 'partner' ? 'hospital' : h); };
    addEventListener('hashchange', pick); pick();
  }

  /* ---------- preview forms and the assessment steps ---------- */
  function valid(fields) {
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      var bad = f.required && (!f.value.trim() || (f.type === 'email' && !/^\S+@\S+\.\S+$/.test(f.value)));
      f.setAttribute('aria-invalid', String(bad));
      if (bad) { f.focus(); return false; }
    }
    return true;
  }
  $$('form[data-preview]').forEach(function (form) {
    var box = form.closest('[data-form]');
    var steps = $$('[data-step]', form), at = 0;
    var back = $('[data-back]', form), next = $('[data-next]', form);
    function show(i) {
      at = i;
      steps.forEach(function (s, k) { s.hidden = k !== i; });
      $$('.pg-progress i', box).forEach(function (b, k) { b.classList.toggle('pg-on', k <= i); });
      if (back) back.hidden = i === 0;
      if (next) next.textContent = i === steps.length - 1 ? 'Finish' : 'Continue';
    }
    if (steps.length) show(0);
    if (back) back.addEventListener('click', function () { show(Math.max(0, at - 1)); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var scope = steps.length ? steps[at] : form;
      if (!valid($$('input,select,textarea', scope))) return;
      if (steps.length && at < steps.length - 1) { show(at + 1); var f = $('input,select,textarea', steps[at]); if (f) f.focus(); return; }
      $$('[data-echo]', box).forEach(function (el) { var f = form.elements[el.getAttribute('data-echo')]; el.textContent = f ? f.value : ''; });
      box.classList.add('pg-done');
      var done = $('.pg-form-done', box); done.setAttribute('tabindex', '-1'); done.focus();
    });
  });
})();
