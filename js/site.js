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

  /* ---------- form submission (quote + contact) ---------- */
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
      function fail() {
        if (status) { status.className = 'form-status err'; status.textContent = 'Sorry, something went wrong sending the form. Please text or WhatsApp us on 0432 470 313.'; }
        if (btn) { btn.disabled = false; btn.textContent = btn.getAttribute('data-txt'); }
      }
      if (btn) { btn.setAttribute('data-txt', btn.textContent); btn.disabled = true; btn.textContent = 'Sending…'; }
      if (endpoint) {
        fetch(endpoint, { method: 'POST', body: new FormData(form), headers: { 'Accept': 'application/json' } })
          .then(function (r) { if (!r.ok) throw new Error(r.status); done('', false); })
          .catch(fail);
      } else {
        // No endpoint configured yet: open WhatsApp with a prefilled summary.
        var text = (kind === 'quote' ? 'Hi Wyelee, I would like a quote:\n' : 'Hi Wyelee,\n') + lines.join('\n') + (hasFiles ? '\n(Photos: I will send them here in the chat.)' : '');
        var w = window.open(WA + '?text=' + encodeURIComponent(text), '_blank', 'noopener');
        done(hasFiles ? 'Photos can’t travel with the WhatsApp link — just send them in the chat we opened for you.' : '', true);
        if (!w && status) { status.className = 'form-status ok'; status.textContent = 'If WhatsApp did not open, use the button below.'; }
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
