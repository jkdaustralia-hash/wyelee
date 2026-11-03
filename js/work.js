/* Wyelee — /our-work/: type filter for the job sheets + accessible photo viewer (vanilla, no dependencies).
   Without JS every job shows (the filter bar is hidden by CSS) and each photo link opens the full-size JPEG. */
(function () {
  'use strict';
  var d = document, root = d.documentElement;
  var jobs = Array.prototype.slice.call(d.querySelectorAll('.job'));
  if (!jobs.length) return;

  /* ---------- filter: buttons with aria-pressed; hides non-matching sheets ---------- */
  var bar = d.querySelector('[data-work-filter]'), status = d.querySelector('[data-work-status]');
  var btns = bar ? Array.prototype.slice.call(bar.querySelectorAll('[data-filter]')) : [];
  function applyFilter(cat, announce) {
    var shown = 0, label = '';
    jobs.forEach(function (j) {
      var on = cat === 'all' || j.getAttribute('data-cat') === cat;
      j.hidden = !on;
      if (on) shown++;
    });
    btns.forEach(function (b) {
      var on = b.getAttribute('data-filter') === cat;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (on) label = (b.firstChild && b.firstChild.nodeValue || '').trim();
    });
    if (announce && status) status.textContent = 'Showing ' + shown + (shown === 1 ? ' job' : ' jobs') + (cat === 'all' ? '' : ': ' + label) + '.';
  }
  btns.forEach(function (b) {
    b.addEventListener('click', function () { applyFilter(b.getAttribute('data-filter'), true); });
  });
  // a link to #job-NN (e.g. from the home teaser) must never land on a sheet the filter has hidden
  function revealHash() {
    var id = window.location.hash.slice(1), t = id && d.getElementById(id);
    if (t && t.hidden) { applyFilter('all', false); t.scrollIntoView(); }
  }
  window.addEventListener('hashchange', revealHash);
  revealHash();

  /* ---------- viewer: <dialog> with focus trap, Esc, arrows, swipe, counter and caption ---------- */
  var dlg = d.createElement('dialog');
  if (typeof dlg.showModal !== 'function') return; // very old browsers: the links keep opening the JPEG
  function icon(n) { return '<svg class="ic" aria-hidden="true"><use href="#i-' + n + '"/></svg>'; }
  dlg.className = 'viewer';
  dlg.setAttribute('aria-labelledby', 'viewer-title');
  dlg.setAttribute('aria-describedby', 'viewer-live'); // "Photo 1 of 4. caption" is read with the dialog on open
  dlg.innerHTML =
    '<div class="viewer-top">' +
      '<h2 class="viewer-title" id="viewer-title"><span class="fig" data-v-job></span> <span data-v-name></span></h2>' +
      '<p class="viewer-count" aria-hidden="true"><span data-v-i></span> / <span data-v-n></span></p>' +
      '<button type="button" class="viewer-btn viewer-close" data-v-close aria-label="Close photo viewer">' + icon('x') + '</button>' +
    '</div>' +
    '<div class="viewer-stage" data-v-stage><img data-v-img alt="" decoding="async"></div>' +
    '<div class="viewer-foot">' +
      '<button type="button" class="viewer-btn viewer-prev" data-v-prev aria-label="Previous photo">' + icon('arrow') + '</button>' +
      '<p class="viewer-cap" data-v-cap></p>' +
      '<button type="button" class="viewer-btn viewer-next" data-v-next aria-label="Next photo">' + icon('arrow') + '</button>' +
    '</div>' +
    '<p class="sr-only" id="viewer-live" aria-live="polite" data-v-live></p>';
  d.body.appendChild(dlg);
  function q(sel) { return dlg.querySelector(sel); }
  var img = q('[data-v-img]'), stage = q('[data-v-stage]'), cap = q('[data-v-cap]'), live = q('[data-v-live]');
  var closeBtn = q('[data-v-close]'), prevBtn = q('[data-v-prev]'), nextBtn = q('[data-v-next]');
  var set = [], idx = 0, current = null, trigger = null;

  function photosOf(job) {
    return Array.prototype.map.call(job.querySelectorAll('.shot'), function (a) {
      var pic = a.querySelector('img');
      return {
        el: a, full: a.href, mid: a.href.replace(/\.jpg$/, '-m.jpg'),
        w: +a.getAttribute('data-w') || 0, h: +a.getAttribute('data-h') || 0,
        caption: a.getAttribute('data-caption') || '', alt: pic ? pic.alt : ''
      };
    });
  }
  function preload(src) { var i = new Image(); i.decoding = 'async'; i.src = src; return i; }
  function show(i) {
    var n = set.length;
    idx = (i + n) % n;
    var p = set[idx];
    current = p;
    img.alt = p.alt;
    if (p.w && p.h) { img.width = p.w; img.height = p.h; }
    img.src = p.mid;                       // medium file first (already cached for the main photos)…
    var full = preload(p.full);            // …then the full-size JPEG as soon as it has loaded
    full.onload = function () { if (current === p) img.src = p.full; };
    q('[data-v-i]').textContent = idx + 1;
    q('[data-v-n]').textContent = n;
    cap.textContent = p.caption;
    live.textContent = 'Photo ' + (idx + 1) + ' of ' + n + '. ' + p.caption;
    if (n > 1) { preload(set[(idx + 1) % n].full); preload(set[(idx - 1 + n) % n].full); }
  }
  function open(job, i, from) {
    set = photosOf(job);
    if (!set.length) return;
    trigger = from;
    var no = job.querySelector('.job-no b'), title = job.querySelector('h2');
    q('[data-v-job]').textContent = 'Job ' + (no ? no.textContent : '');
    q('[data-v-name]').textContent = title ? title.textContent : '';
    dlg.classList.toggle('is-single', set.length < 2);
    show(Math.max(0, i));
    root.classList.add('viewer-open');     // no background scroll while open
    dlg.showModal();
    closeBtn.focus();
  }
  function close() { if (dlg.open) dlg.close(); }
  dlg.addEventListener('close', function () {
    root.classList.remove('viewer-open');
    current = null;
    img.removeAttribute('src');
    if (trigger && trigger.focus) trigger.focus(); // back to the photo that opened it
  });

  closeBtn.addEventListener('click', close);
  prevBtn.addEventListener('click', function () { show(idx - 1); });
  nextBtn.addEventListener('click', function () { show(idx + 1); });
  dlg.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'ArrowRight' && set.length > 1) { e.preventDefault(); show(idx + 1); return; }
    if (e.key === 'ArrowLeft' && set.length > 1) { e.preventDefault(); show(idx - 1); return; }
    if (e.key === 'Tab') { // keep focus inside the dialog (close / previous / next)
      var items = [closeBtn].concat(set.length > 1 ? [prevBtn, nextBtn] : []);
      var at = items.indexOf(d.activeElement);
      e.preventDefault();
      items[(at + (e.shiftKey ? -1 : 1) + items.length) % items.length].focus();
    }
  });
  // swipe left/right on touch screens
  var sx = null, sy = 0;
  stage.addEventListener('pointerdown', function (e) { if (e.pointerType !== 'mouse') { sx = e.clientX; sy = e.clientY; } });
  stage.addEventListener('pointerup', function (e) {
    if (sx === null) return;
    var dx = e.clientX - sx, dy = e.clientY - sy;
    sx = null;
    if (set.length > 1 && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) show(idx + (dx < 0 ? 1 : -1));
  });
  stage.addEventListener('pointercancel', function () { sx = null; });

  // any photo link on a sheet opens the viewer; modified clicks (new tab / window) keep the plain JPEG link
  d.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('.job .shot') : null;
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    var job = a.closest('.job');
    open(job, Array.prototype.indexOf.call(job.querySelectorAll('.shot'), a), a);
  });
})();
