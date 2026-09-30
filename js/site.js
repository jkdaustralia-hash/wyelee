/* Wyelee — site behaviour (vanilla, no dependencies) */
(function () {
  'use strict';
  var d = document, root = d.documentElement;
  root.classList.remove('no-js'); root.classList.add('js');
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var WA = 'https://wa.me/61432470313';

  /* ---------- header: services dropdown ---------- */
  d.querySelectorAll('.nav .has-menu').forEach(function (li) {
    var btn = li.querySelector('button');
    if (!btn) return;
    function open(v) { if (v) li.setAttribute('data-open', ''); else li.removeAttribute('data-open'); btn.setAttribute('aria-expanded', v ? 'true' : 'false'); }
    btn.addEventListener('click', function () { open(!li.hasAttribute('data-open')); });
    li.addEventListener('mouseenter', function () { if (window.matchMedia('(hover:hover)').matches) open(true); });
    li.addEventListener('mouseleave', function () { if (window.matchMedia('(hover:hover)').matches) open(false); });
    li.addEventListener('keydown', function (e) { if (e.key === 'Escape') { open(false); btn.focus(); } });
    // Tab past the last link (or Shift+Tab off the button) closes the disclosure so aria-expanded never lies.
    li.addEventListener('focusout', function (e) { if (!li.contains(e.relatedTarget)) open(false); });
    d.addEventListener('click', function (e) { if (!li.contains(e.target)) open(false); });
  });

  /* ---------- mobile drawer ---------- */
  var drawer = d.getElementById('drawer'), toggle = d.querySelector('.menu-toggle');
  if (drawer && toggle) {
    var lastFocus;
    // Everything behind the dialog (skip link, header, main, footer, floats) goes inert while it is open.
    var behind = Array.prototype.filter.call(d.body.children, function (el) { return el !== drawer && el.tagName !== 'SCRIPT'; });
    function setDrawer(v) {
      behind.forEach(function (el) { el.toggleAttribute('inert', v); }); // before any focus() so lastFocus.focus() works on close
      if (v) { lastFocus = d.activeElement; drawer.setAttribute('data-open', ''); root.style.overflow = 'hidden'; var f = drawer.querySelector('button, a'); if (f) f.focus(); }
      else { drawer.removeAttribute('data-open'); root.style.overflow = ''; if (lastFocus) lastFocus.focus(); }
      toggle.setAttribute('aria-expanded', v ? 'true' : 'false');
    }
    toggle.addEventListener('click', function () { setDrawer(!drawer.hasAttribute('data-open')); });
    drawer.querySelectorAll('[data-close]').forEach(function (el) { el.addEventListener('click', function () { setDrawer(false); }); });
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && drawer.hasAttribute('data-open')) setDrawer(false); });
    // Tab wrap inside the panel (fallback for browsers without `inert`).
    drawer.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab' || !drawer.hasAttribute('data-open')) return;
      var panel = drawer.querySelector('.drawer-panel') || drawer;
      var items = Array.prototype.filter.call(panel.querySelectorAll('button, a[href]'), function (el) { return !el.disabled; });
      if (!items.length) return;
      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && d.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && d.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  /* ---------- reveal on scroll ---------- */
  var rv = d.querySelectorAll('.rv');
  if (rv.length && 'IntersectionObserver' in window && !reduced) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    rv.forEach(function (el) { io.observe(el); });
  } else { rv.forEach(function (el) { el.classList.add('in'); }); }

  /* ---------- "build" animations: [data-build] gets .is-built when visible ---------- */
  var builds = d.querySelectorAll('[data-build]');
  if (builds.length) {
    if (reduced || !('IntersectionObserver' in window)) { builds.forEach(function (el) { el.classList.add('is-built'); }); }
    else {
      var bo = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { var el = en.target; setTimeout(function () { el.classList.add('is-built'); }, parseInt(el.getAttribute('data-build') || '0', 10)); bo.unobserve(el); }
        });
      }, { threshold: 0.35 });
      builds.forEach(function (el) { bo.observe(el); });
    }
    d.querySelectorAll('[data-replay]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = d.querySelector(btn.getAttribute('data-replay'));
        if (!target) return;
        target.classList.remove('is-built');
        void target.offsetWidth; // reflow
        setTimeout(function () { target.classList.add('is-built'); }, 60);
      });
    });
  }

  /* ---------- multi-step form (quote) ---------- */
  d.querySelectorAll('form[data-steps]').forEach(function (form) {
    var panels = Array.prototype.slice.call(form.querySelectorAll('.step-panel'));
    var nav = form.querySelector('.steps-nav');
    var navItems = nav ? Array.prototype.slice.call(nav.querySelectorAll('li')) : [];
    var cur = 0;
    function show(i) {
      cur = i;
      panels.forEach(function (p, k) { if (k === i) p.removeAttribute('hidden'); else p.setAttribute('hidden', ''); });
      navItems.forEach(function (li, k) { li.classList.toggle('done', k < i); if (k === i) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current'); });
      var h = panels[i].querySelector('legend'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
      var top = form.getBoundingClientRect().top + window.pageYOffset - 100;
      if (i > 0 && window.pageYOffset > top) window.scrollTo({ top: top, behavior: reduced ? 'auto' : 'smooth' });
    }
    function valid(i) {
      var ok = true;
      panels[i].querySelectorAll('input, select, textarea').forEach(function (el) {
        var field = el.closest('.field');
        if (!el.checkValidity()) { ok = false; if (field) field.classList.add('is-invalid'); if (ok === false && !form._focused) { el.focus(); form._focused = true; } }
        else if (field) field.classList.remove('is-invalid');
      });
      form._focused = false;
      return ok;
    }
    form.querySelectorAll('[data-next]').forEach(function (b) { b.addEventListener('click', function () { if (valid(cur)) show(Math.min(cur + 1, panels.length - 1)); }); });
    form.querySelectorAll('[data-prev]').forEach(function (b) { b.addEventListener('click', function () { show(Math.max(cur - 1, 0)); }); });
    form.addEventListener('input', function (e) { var f = e.target.closest('.field'); if (f && e.target.checkValidity()) f.classList.remove('is-invalid'); });
    panels.forEach(function (p, k) { if (k !== 0) p.setAttribute('hidden', ''); });
    form._validAll = function () { for (var i = 0; i < panels.length; i++) { if (!valid(i)) { show(i); return false; } } return true; };
  });

  /* ---------- attribution: utm_* / gclid / referrer / landing page, captured on the first page view ---------- */
  var ATTR_KEY = 'wy_attr', ATTR_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid'];
  function readAttr() { try { return JSON.parse(sessionStorage.getItem(ATTR_KEY) || 'null') || {}; } catch (e) { return {}; } }
  (function captureAttr() {
    try {
      var p = new URLSearchParams(window.location.search), a = readAttr(), touched = false;
      ATTR_PARAMS.forEach(function (k) { var v = p.get(k); if (v) { a[k] = v.slice(0, 200); touched = true; } });
      if (!a.landing) { a.landing = window.location.pathname + window.location.search; a.referrer = d.referrer || ''; a.ts = new Date().toISOString(); touched = true; }
      if (touched) sessionStorage.setItem(ATTR_KEY, JSON.stringify(a));
    } catch (e) { /* private mode / storage blocked: attribution is best-effort */ }
  })();
  function attribution() {
    var a = readAttr(), p = new URLSearchParams(window.location.search);
    var out = { page: window.location.pathname, referrer: a.referrer || d.referrer || '', landing: a.landing || window.location.pathname };
    ATTR_PARAMS.forEach(function (k) { var v = p.get(k) || a[k] || ''; if (v) out[k] = v; });
    return out;
  }

  /* ---------- form submission (quote + contact) ---------- */
  /* Field values in the markup are the human labels; the CRM stores short keys. Unknown values pass through untouched. */
  var VALUE_KEYS = {
    condition: { 'new in the box': 'new', 'partially assembled': 'partial', 'already assembled': 'assembled' },
    days: { weekdays: 'weekdays', weekend: 'weekend', either: 'either' },
    time: { morning: 'morning', afternoon: 'afternoon', either: 'either' },
    addons: { 'packaging removal': 'packaging', 'wall anchoring': 'anchoring', 'disassembly of old furniture': 'disassembly' }
  };
  function normalize(name, val) {
    var map = VALUE_KEYS[name]; if (!map) return val;
    var k = String(val).toLowerCase().trim();
    for (var key in map) { if (k.indexOf(key) === 0) return map[key]; }
    return val;
  }
  function payload(form, source) {
    var out = { source: source, website: '' };
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.disabled || el.type === 'file' || el.type === 'submit' || el.type === 'button') return;
      if ((el.type === 'radio' || el.type === 'checkbox') && !el.checked) return;
      var v = normalize(el.name, (el.value || '').trim());
      if (el.type === 'checkbox') { (out[el.name] = out[el.name] || []).push(v); return; }
      out[el.name] = v;
    });
    return out;
  }
  /* photos: downscaled in the browser (longest side 1600 px, JPEG 0.8), max 6; originals over 4 MB are left out with a notice */
  var PHOTO_MAX_ORIGINAL = 4 * 1024 * 1024, PHOTO_MAX = 6, PHOTO_SIDE = 1600, PHOTO_B64_MAX = 700000;
  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('decode')); };
      img.src = url;
    });
  }
  function shrink(file) {
    return loadImage(file).then(function (img) {
      var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height, side = PHOTO_SIDE, q = 0.8, data = '';
      if (!w || !h) throw new Error('empty');
      for (var attempt = 0; attempt < 4; attempt++) {
        var scale = Math.min(1, side / Math.max(w, h));
        var c = d.createElement('canvas'); c.width = Math.max(1, Math.round(w * scale)); c.height = Math.max(1, Math.round(h * scale));
        var ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
        data = (c.toDataURL('image/jpeg', q).split(',')[1]) || '';
        if (data.length <= PHOTO_B64_MAX) break;
        q = Math.max(0.5, q - 0.15); side = Math.round(side * 0.8); // busy photo: try smaller until it fits the API limit
      }
      if (!data || data.length > PHOTO_B64_MAX) throw new Error('too big');
      return { name: file.name.replace(/\.[^.]+$/, '') + '.jpg', type: 'image/jpeg', data: data };
    });
  }
  function preparePhotos(form) {
    var input = form.querySelector('input[type="file"]');
    var files = input && input.files ? Array.prototype.slice.call(input.files) : [], photos = [], skipped = [];
    if (!files.length) return Promise.resolve({ photos: photos, skipped: skipped });
    files.forEach(function (f) { if (f.size > PHOTO_MAX_ORIGINAL) skipped.push(f.name); });
    files = files.filter(function (f) { return f.size <= PHOTO_MAX_ORIGINAL; });
    if (files.length > PHOTO_MAX) { files.slice(PHOTO_MAX).forEach(function (f) { skipped.push(f.name); }); files = files.slice(0, PHOTO_MAX); }
    return files.reduce(function (p, f) {
      return p.then(function () { return shrink(f).then(function (ph) { photos.push(ph); }, function () { skipped.push(f.name); }); });
    }, Promise.resolve()).then(function () { return { photos: photos, skipped: skipped }; });
  }
  function skippedNote(skipped) {
    if (!skipped.length) return '';
    var n = skipped.length;
    return 'We received your request but ' + (n === 1 ? '1 photo was' : n + ' photos were') + ' left out (over 4 MB or not readable): ' + skipped.join(', ') + '. Text them to 0432 470 313 and we will add them to your quote.';
  }
  function summary(form) {
    var lines = [], seen = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.type === 'file' || el.type === 'hidden' || el.type === 'submit' || el.type === 'button' || el.name === 'website') return;
      if ((el.type === 'radio' || el.type === 'checkbox') && !el.checked) return;
      var label = el.getAttribute('data-label') || (el.closest('.field') && el.closest('.field').querySelector('label, .label') ? el.closest('.field').querySelector('label, .label').textContent.trim() : el.name);
      var val = (el.type === 'checkbox' || el.type === 'radio') ? (el.parentNode.textContent || el.value).trim() : el.value.trim();
      if (!val) return;
      if (el.type === 'checkbox' && seen[label]) { lines[seen[label] - 1] += ', ' + val; return; }
      lines.push(label + ': ' + val); if (el.type === 'checkbox') seen[label] = lines.length;
    });
    return lines;
  }
  d.querySelectorAll('form[data-lead]').forEach(function (form) {
    var status = form.querySelector('.form-status'), success = form.querySelector('.form-success') || d.getElementById(form.getAttribute('data-success') || '');
    var kind = form.getAttribute('data-lead') || 'quote';
    /* inline errors: .field.is-invalid shows the <span class="error"> text; aria-invalid for AT */
    function fieldOf(el) { return el && el.closest ? el.closest('.field') : null; }
    function mark(el, bad) { var f = fieldOf(el); if (f) f.classList.toggle('is-invalid', bad); if (bad) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid'); }
    // checkValidity()/reportValidity() dispatch `invalid` on each failing control (does not bubble → capture)
    form.addEventListener('invalid', function (e) { mark(e.target, true); }, true);
    form.addEventListener('focusout', function (e) {
      var el = e.target;
      if (!el.matches || !el.matches('input, select, textarea') || /^(radio|checkbox|file)$/.test(el.type)) return;
      var f = fieldOf(el);
      if (f && (el.value || f.classList.contains('is-invalid'))) mark(el, !el.checkValidity());
    });
    function clearIfValid(e) {
      var f = fieldOf(e.target);
      // only call checkValidity() once already flagged: checkValidity() itself fires `invalid`
      if (f && f.classList.contains('is-invalid') && e.target.checkValidity()) mark(e.target, false);
    }
    form.addEventListener('input', clearIfValid);
    form.addEventListener('change', clearIfValid);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (form.website && form.website.value) return; // honeypot
      if (form._validAll ? !form._validAll() : !form.checkValidity()) { form.reportValidity && form.reportValidity(); return; }
      var btn = form.querySelector('[type="submit"]'), endpoint = form.getAttribute('data-endpoint');
      var lines = summary(form);
      var hasFiles = form.querySelector('input[type="file"]') && form.querySelector('input[type="file"]').files.length > 0;
      function done(msg, showWa) {
        if (success) {
          success.setAttribute('data-show', '');
          var body = form.querySelector('.form-body'); if (body) body.setAttribute('hidden', '');
          var extra = success.querySelector('[data-extra]'); if (extra) extra.textContent = msg || '';
          var wa = success.querySelector('[data-wa-link]'); if (wa) { wa.href = WA + '?text=' + encodeURIComponent((kind === 'quote' ? 'Hi Wyelee, here is my quote request:\n' : 'Hi Wyelee,\n') + lines.join('\n')); if (!showWa) wa.setAttribute('hidden', ''); }
          success.focus && success.setAttribute('tabindex', '-1'); success.focus();
        } else if (status) { status.className = 'form-status ok'; status.textContent = msg || 'Thanks — we have your message.'; }
      }
      function reset() { if (btn) { btn.disabled = false; btn.textContent = btn.getAttribute('data-txt'); } }
      // WhatsApp fallback: no endpoint (static preview) or the CRM could not be reached → open a chat with the prefilled summary.
      function waFallback(note) {
        var text = (kind === 'quote' ? 'Hi Wyelee, I would like a quote:\n' : 'Hi Wyelee,\n') + lines.join('\n') + (hasFiles ? '\n(Photos: I will send them here in the chat.)' : '');
        var w = window.open(WA + '?text=' + encodeURIComponent(text), '_blank', 'noopener');
        var extra = hasFiles ? 'Photos can’t travel with the WhatsApp link — just send them in the chat we opened for you.' : '';
        done([note, extra].filter(Boolean).join(' '), true);
        if (!w && status) { status.className = 'form-status ok'; status.textContent = 'If WhatsApp did not open, use the button below.'; }
        reset();
      }
      if (btn) { btn.setAttribute('data-txt', btn.textContent); btn.disabled = true; btn.textContent = 'Sending…'; }
      if (endpoint) {
        // JSON to the CRM: fields by name (checkbox → array), source, attribution and browser-reduced photos.
        var body = payload(form, kind), saved = false;
        body.attribution = attribution();
        preparePhotos(form).then(function (res) {
          body.photos = res.photos;
          return fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(body) })
            .then(function (r) {
              if (!r.ok) throw new Error('HTTP ' + r.status);
              saved = true;
              return r.json().catch(function () { return {}; });
            })
            .then(function (j) {
              done(skippedNote(res.skipped), false); // success block, WhatsApp button hidden
              try { window.dispatchEvent(new CustomEvent('wyelee:lead', { detail: { source: kind, id: j && j.id } })); } catch (err) { /* analytics is optional */ }
            });
        }).catch(function () {
          if (saved) return; // stored fine; only the post-success UI failed
          waFallback('We couldn’t reach our server just now, so we opened WhatsApp with your details instead.');
        });
      } else {
        waFallback('');
      }
    });
  });

  /* ---------- current year ---------- */
  d.querySelectorAll('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });
})();

/* ---------- sticky quote bar (mobile) + prefill of /quote/ from the home picker ---------- */
(function () {
  var d = document, bar = d.querySelector('[data-sticky]'), FIELD = 'input, textarea, select';
  function inField() { var a = d.activeElement; return !!(a && a.matches && a.matches(FIELD)); }
  /* body.is-typing while any form field has focus (CSS hides .wa-float); debounced so field→field does not flicker */
  d.addEventListener('focusin', function (e) { if (e.target.matches && e.target.matches(FIELD)) d.body.classList.add('is-typing'); });
  d.addEventListener('focusout', function () { setTimeout(function () { if (!inField()) d.body.classList.remove('is-typing'); }, 0); });
  if (bar) {
    var hero = d.querySelector('[data-hero-cta]');
    if (hero && 'IntersectionObserver' in window) {
      d.body.classList.add('has-bar');
      var ctaOut = false, typing = false;
      function sync() { if (ctaOut && !typing) bar.setAttribute('data-show', ''); else bar.removeAttribute('data-show'); }
      var io = new IntersectionObserver(function (en) {
        ctaOut = !en[0].isIntersecting && en[0].boundingClientRect.top < 0; // only once the CTA has scrolled above the viewport, not while still below the fold
        sync();
      }, { threshold: 0 });
      io.observe(hero);
      d.addEventListener('focusin', function (e) { if (e.target.matches && e.target.matches(FIELD)) { typing = true; sync(); } });
      d.addEventListener('focusout', function () {
        setTimeout(function () { if (!inField()) { typing = false; sync(); } }, 0); // let focus settle first
      });
    } else if (!hero) { d.body.classList.add('has-bar'); bar.setAttribute('data-show', ''); }
  }
  var q = d.querySelector('form[data-lead="quote"]');
  if (q && window.location.search) {
    var p = new URLSearchParams(window.location.search);
    var pc = p.get('pc'), items = p.getAll('item');
    if (pc && q.elements.suburb && !q.elements.suburb.value) {
      var m = pc.match(/\b(\d{4})\b/);
      if (m && q.elements.postcode) { q.elements.postcode.value = m[1]; q.elements.suburb.value = pc.replace(m[1], '').replace(/[,\s]+$/, '').trim(); }
      else q.elements.suburb.value = pc;
    }
    if (items.length && q.elements.items && !q.elements.items.value) {
      q.elements.items.value = items.map(function (i) { return i + ' × 1'; }).join('\n');
    }
  }
})();
