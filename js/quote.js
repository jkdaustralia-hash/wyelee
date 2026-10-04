/* Wyelee — /quote/ helpers: prefill from the URL, live quote sheet, photo size check, inline errors.
   Submission itself is handled by js/site.js (form[data-lead]); nothing here posts anything.
   Loads after site.js (both deferred), so `pc` / `item` are already prefilled when this runs. */
(function () {
  'use strict';
  var d = document, form = d.querySelector('form[data-lead="quote"]');
  if (!form) return;
  // Photo size limit: one source of truth in js/site.js (PHOTO_MAX_ORIGINAL → window.WY_PHOTO_MAX); the literal is only a fallback.
  var f = form.elements, MAX = window.WY_PHOTO_MAX || 10 * 1024 * 1024;

  /* ---------- prefill: ?svc= (service pages) and ?other= (picker "something else") ---------- */
  var p = new URLSearchParams(window.location.search);
  var svc = (p.get('svc') || '').replace(/[^a-z]/g, '');
  if (svc && !form.querySelector('input[name="service"]:checked')) {
    var r = form.querySelector('input[name="service"][value="' + svc + '"]');
    if (r) r.checked = true;
  }
  var other = (p.get('other') || '').trim();
  if (other && f.items && f.items.value.indexOf(other) === -1) {
    f.items.value = (f.items.value ? f.items.value + '\n' : '') + other + ' × 1';
  }

  /* ---------- live quote sheet (right rail) ---------- */
  var sheet = d.querySelector('[data-quote-sheet]');
  function picked(name) {
    var el = form.querySelector('input[name="' + name + '"]:checked');
    return el ? el.parentNode.textContent.trim() : '';
  }
  function set(key, val) {
    var dd = sheet.querySelector('[data-qs="' + key + '"]');
    if (!dd) return;
    dd.textContent = val || '—';
    dd.classList.toggle('is-empty', !val);
  }
  function refresh() {
    if (!sheet) return;
    var where = [f.suburb.value.trim(), f.postcode.value.trim()].filter(Boolean).join(' ');
    if (f.city.value) where = where ? where + ', ' + f.city.value : f.city.value;
    set('where', where);
    set('service', picked('service'));
    var n = f.items.value.split('\n').filter(function (l) { return l.trim(); }).length;
    set('items', n ? n + (n === 1 ? ' item' : ' items') : '');
    set('condition', picked('condition'));
    set('when', [picked('days'), picked('time')].filter(Boolean).join(' · '));
    set('addons', Array.prototype.map.call(form.querySelectorAll('input[name="addons"]:checked'), function (c) { return c.value; }).join(', '));
  }
  form.addEventListener('input', refresh);
  form.addEventListener('change', refresh);
  refresh();

  /* ---------- photos: size check, inline error, "n photos attached" ---------- */
  var photos = f.photos, pf = photos && photos.closest('.field'), list = pf && pf.querySelector('[data-photo-list]');
  if (photos && pf) {
    photos.addEventListener('change', function () {
      var files = Array.prototype.slice.call(photos.files || []);
      var big = files.filter(function (x) { return x.size > MAX; });
      photos.setCustomValidity(big.length ? 'One of your photos is over 10 MB.' : '');
      pf.classList.toggle('is-invalid', big.length > 0);
      if (list) {
        if (files.length && !big.length) { list.textContent = files.length + (files.length === 1 ? ' photo attached' : ' photos attached'); list.hidden = false; }
        else list.hidden = true;
      }
    });
  }

  /* ---------- inline errors: on blur once a field has been touched, cleared as soon as it is valid ---------- */
  function fieldOf(el) { return el.closest ? el.closest('.field') : null; }
  form.addEventListener('focusout', function (e) {
    var el = e.target;
    if (!el.matches || !el.matches('input, select, textarea') || /^(radio|checkbox|file)$/.test(el.type)) return;
    var fld = fieldOf(el);
    if (fld && (el.value || fld.classList.contains('is-invalid'))) fld.classList.toggle('is-invalid', !el.checkValidity());
  });
  function clearIfValid(e) {
    var fld = fieldOf(e.target);
    if (fld && fld.classList.contains('is-invalid') && e.target.checkValidity()) fld.classList.remove('is-invalid');
  }
  form.addEventListener('input', clearIfValid);
  form.addEventListener('change', clearIfValid);
  // reportValidity() in site.js fires `invalid` on each failing control (does not bubble → capture)
  form.addEventListener('invalid', function (e) { var fld = fieldOf(e.target); if (fld) fld.classList.add('is-invalid'); }, true);

  /* ---------- hide the floating WhatsApp button while typing (CSS: body.is-typing .wa-float) ---------- */
  form.addEventListener('focusin', function (e) { if (e.target.matches && e.target.matches('input, select, textarea')) d.body.classList.add('is-typing'); });
  form.addEventListener('focusout', function () { setTimeout(function () { if (!form.contains(d.activeElement)) d.body.classList.remove('is-typing'); }, 0); });
})();
