/* ============================================================
   Wyelee — /thank-you/ (confirmation page after a form send)
   js/site.js redirects here with ?s=quote|contact&k=<nonce>[&via=wa][&photos=skipped].
   This script only switches the copy variants; the conversion events are
   fired by js/analytics.js (once per nonce) so GA4 / Google Ads / GTM can
   measure the lead by this URL.
   ============================================================ */
(function () {
  'use strict';
  var d = document, root = d.querySelector('[data-thanks-page]');
  if (!root) return;
  var p = new URLSearchParams(location.search);
  var s = p.get('s') === 'contact' ? 'contact' : 'quote';
  var via = p.get('via') === 'wa';
  var skipped = p.get('photos') === 'skipped';
  root.setAttribute('data-s', s);
  if (via) root.setAttribute('data-via', 'wa');

  /* data-only="a b" shows when any key matches (OR); data-not="c" hides when any of those keys matches,
     so "quote and not wa" is data-only="quote" data-not="wa". */
  function match(k) {
    if (k === 'quote' || k === 'contact') return k === s;
    if (k === 'wa') return via;
    if (k === 'crm') return !via;
    if (k === 'skipped') return skipped;
    return false;
  }
  d.querySelectorAll('[data-only]').forEach(function (el) {
    var keys = el.getAttribute('data-only').split(/\s+/).filter(Boolean);
    var omit = (el.getAttribute('data-not') || '').split(/\s+/).filter(Boolean);
    var show = keys.some(match) && !omit.some(match);
    if (show) el.removeAttribute('hidden'); else el.setAttribute('hidden', '');
  });

  if (via) d.title = 'One more tap — send it in WhatsApp | Wyelee';
  else if (s === 'contact') d.title = 'Thanks — your message is in | Wyelee';

  /* WhatsApp fallback: nothing has reached us until the visitor presses send, so row 1 of the sign-off
     stays an empty circle (.todo, css/site.css) instead of a green tick */
  var first = root.querySelector('.checklist li');
  if (first) first.classList.toggle('todo', via);

  /* WhatsApp fallback: reuse the summary js/site.js stored before redirecting */
  var wa = d.querySelector('[data-wa-open]');
  if (wa) {
    try {
      var t = sessionStorage.getItem('wy_wa_text');
      if (t) wa.href = wa.getAttribute('data-wa-base') + '?text=' + encodeURIComponent(t);
    } catch (e) { /* keep the generic link */ }
  }

  /* draw the sign-off ticks straight away (the sheet is above the fold) */
  var sheet = d.querySelector('.signoff');
  if (sheet) requestAnimationFrame(function () { sheet.classList.add('in'); });
})();
