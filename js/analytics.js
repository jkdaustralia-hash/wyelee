/* ============================================================
   Wyelee — tags, pixels and third-party code (config-driven)
   Everything here is managed from the back office:
     /crm → Integraciones.
   The script reads /api/public/site-config and only initialises what is
   configured there, so the site never needs a code change to add a tag.
   It never runs on localhost / 127.0.0.1 / *.github.io (previews) and it
   never throws: every step is wrapped so a bad snippet cannot break the page.
   ============================================================ */
(function () {
  'use strict';
  try {
    var host = location.hostname;
    if (!host || host === 'localhost' || host === '127.0.0.1' || host === '[::1]' ||
        /\.github\.io$/i.test(host) || /\.local$/i.test(host) || /\.test$/i.test(host)) return;

    var cfg = null;

    /* Conversion page: js/site.js redirects every successful form send to /thank-you/?s=quote|contact&k=<nonce>.
       The lead events fire here, once per nonce (sessionStorage guard against reloads), so GA4 / Google Ads /
       GTM measure the conversion by this URL. A visit without `k` (typed URL, bookmark) never counts.
       GTM: the conversion trigger must be the Custom Event `wyelee_lead` (Data Layer variable `lead_source` =
       quote | contact), pushed once per nonce by trackLead(). A Page View trigger on /thank-you/ cannot see the
       sessionStorage guard, so it would also count reloads and direct visits.
       lead_source becomes quote_wa | contact_wa when the send fell back to WhatsApp (&via=wa): nothing reached
       the CRM and the visitor still has to press send in the chat, so GA4 / Ads / GTM can segment or exclude it. */
    var convKey = null, convSource = 'quote';
    try {
      if (/\/thank-you\/?$/i.test(location.pathname)) {
        var qp = new URLSearchParams(location.search);
        convKey = qp.get('k') || null;
        convSource = (qp.get('s') === 'contact' ? 'contact' : 'quote') + (qp.get('via') === 'wa' ? '_wa' : '');
      }
    } catch (err) { convKey = null; }

    /* ---------- deferred boot: 1st interaction or 4 s after load (keeps LCP/TBT clean);
                 immediate on the thank-you page so the conversion is not lost if the visitor leaves ---------- */
    var started = false;
    function go() {
      if (started) return; started = true;
      try {
        fetch('/api/public/site-config', { credentials: 'omit' })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (c) {
            cfg = c || {};
            if (cfg.enabled) { safe(init); if (convKey) safe(trackLeadOnce); }
          })
          .catch(function () { /* no config → nothing to load */ });
      } catch (err) { /* never throw */ }
    }
    if (convKey) {
      go();
    } else {
      ['pointerdown', 'keydown', 'touchstart', 'scroll'].forEach(function (ev) {
        addEventListener(ev, go, { once: true, passive: true });
      });
      var later = function () { setTimeout(go, 4000); };
      if (document.readyState === 'complete') later(); else addEventListener('load', later);
    }

    function safe(fn) { try { fn(); } catch (err) { if (window.console && console.warn) console.warn('[wyelee analytics]', err); } }

    function loadScript(src, async) {
      var s = document.createElement('script'); s.async = async !== false; s.src = src;
      document.head.appendChild(s); return s;
    }

    /* ---------- injectHTML: parse with <template>, recreate <script> so they execute ----------
       target   : Element (document.head / document.body)
       html     : raw HTML string from the back office
       position : 'start' (prepend) | 'end' (append)
       Scripts parsed via innerHTML are flagged "already started" and never run; a fresh
       <script> created with createElement, with the same attributes and content, does. */
    function injectHTML(target, html, position) {
      if (!target || !html || !/\S/.test(html)) return;
      var tpl = document.createElement('template');
      tpl.innerHTML = html;
      var frag = document.importNode(tpl.content, true);
      var scripts = Array.prototype.slice.call(frag.querySelectorAll('script'));
      scripts.forEach(function (old) {
        var s = document.createElement('script');
        Array.prototype.forEach.call(old.attributes, function (a) { s.setAttribute(a.name, a.value); });
        if (old.src && !old.hasAttribute('async')) s.async = false; // dynamic scripts default to async; keep author order unless they asked for async
        s.text = old.textContent || '';
        old.parentNode.replaceChild(s, old);
      });
      if (position === 'start' && target.firstChild) target.insertBefore(frag, target.firstChild);
      else target.appendChild(frag);
    }
    function inject(position, html) {
      if (position === 'head') injectHTML(document.head, html, 'end');
      else if (position === 'body_start') injectHTML(document.body, html, 'start');
      else injectHTML(document.body, html, 'end');
    }

    /* ---------- providers ---------- */
    function init() {
      /* Google: gtag (GA4 + Google Ads) */
      var googleIds = [cfg.ga4_id, cfg.google_ads_id].filter(Boolean);
      if (googleIds.length) safe(function () {
        window.dataLayer = window.dataLayer || [];
        window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
        loadScript('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(googleIds[0]));
        gtag('js', new Date());
        googleIds.forEach(function (id) { gtag('config', id, { send_page_view: true }); });
      });

      /* Google Tag Manager */
      if (cfg.gtm_id) safe(function () {
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
        loadScript('https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(cfg.gtm_id));
      });

      /* Meta (Facebook) Pixel */
      if (cfg.meta_pixel_id) safe(function () {
        !function (f, b, e, v, n, t, s) {
          if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
          if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
          t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
        }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
        fbq('init', String(cfg.meta_pixel_id));
        fbq('track', 'PageView');
      });

      /* TikTok Pixel */
      if (cfg.tiktok_pixel_id) safe(function () {
        !function (w, d, t) {
          w.TiktokAnalyticsObject = t; var ttq = w[t] = w[t] || [];
          ttq.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie'];
          ttq.setAndDefer = function (t, e) { t[e] = function () { t.push([e].concat(Array.prototype.slice.call(arguments, 0))); }; };
          for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);
          ttq.load = function (e, n) {
            var i = 'https://analytics.tiktok.com/i18n/pixel/events.js';
            ttq._i = ttq._i || {}; ttq._i[e] = []; ttq._i[e]._u = i; ttq._t = ttq._t || {}; ttq._t[e] = +new Date();
            ttq._o = ttq._o || {}; ttq._o[e] = n || {};
            var o = d.createElement('script'); o.type = 'text/javascript'; o.async = !0; o.src = i + '?sdkid=' + e + '&lib=' + t;
            var a = d.getElementsByTagName('script')[0]; a.parentNode.insertBefore(o, a);
          };
          ttq.load(String(cfg.tiktok_pixel_id)); ttq.page();
        }(window, document, 'ttq');
      });

      /* Microsoft Clarity */
      if (cfg.clarity_id) safe(function () {
        (function (c, l, a, r, i, t, y) {
          c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
          t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i;
          y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
        })(window, document, 'clarity', 'script', String(cfg.clarity_id));
      });

      /* Hotjar */
      if (cfg.hotjar_id) safe(function () {
        (function (h, o, t, j, a, r) {
          h.hj = h.hj || function () { (h.hj.q = h.hj.q || []).push(arguments); };
          h._hjSettings = { hjid: cfg.hotjar_id, hjsv: 6 };
          a = o.getElementsByTagName('head')[0];
          r = o.createElement('script'); r.async = 1;
          r.src = t + h._hjSettings.hjid + j + h._hjSettings.hjsv;
          a.appendChild(r);
        })(window, document, 'https://static.hotjar.com/c/hotjar-', '.js?sv=');
      });

      /* Custom code blocks (head / body start / body end) */
      safe(function () { inject('head', cfg.custom_head); });
      safe(function () { inject('body_start', cfg.custom_body_start); });
      safe(function () { inject('body_end', cfg.custom_body_end); });

      /* Third-party snippets (only the active ones come back from the API) */
      var snippets = Array.isArray(cfg.snippets) ? cfg.snippets : [];
      snippets.forEach(function (sn) {
        if (!sn || !sn.code) return;
        safe(function () { inject(sn.position || 'body_end', sn.code); });
      });
    }

    /* ---------- lead conversion (fired on /thank-you/?k=<nonce>, once per nonce) ---------- */
    function trackLeadOnce() {
      var flag = 'wy_conv_' + convKey;
      try { if (sessionStorage.getItem(flag)) return; sessionStorage.setItem(flag, '1'); } catch (err) { /* no storage: fire anyway */ }
      trackLead(convSource);
      /* drop the nonce from the address bar a moment later: a copied / re-opened URL can no longer count again
         (sessionStorage is per tab). The copy variants were already read by js/thanks.js at load. */
      setTimeout(function () {
        try {
          var u = new URL(location.href); u.searchParams.delete('k');
          history.replaceState(history.state, '', u.pathname + u.search + u.hash);
        } catch (err) { /* ignore */ }
      }, 3000);
    }
    function trackLead(source) {
      if (!cfg || !cfg.enabled) return;
      var payload = { value: 1, currency: 'AUD', lead_source: source };
      if (window.dataLayer) safe(function () { window.dataLayer.push({ event: 'wyelee_lead', lead_source: source }); });
      if (typeof window.gtag === 'function') {
        if (cfg.ga4_id) safe(function () { gtag('event', 'generate_lead', payload); });
        if (cfg.google_ads_id && cfg.google_ads_label) safe(function () {
          gtag('event', 'conversion', { send_to: cfg.google_ads_id + '/' + cfg.google_ads_label, value: 1, currency: 'AUD' });
        });
      }
      if (cfg.meta_pixel_id && typeof window.fbq === 'function') safe(function () { fbq('track', 'Lead', { content_name: source }); });
      if (cfg.tiktok_pixel_id && window.ttq && typeof window.ttq.track === 'function') safe(function () { ttq.track('SubmitForm', { content_type: source }); });
    }
  } catch (err) { /* never throw */ }
})();
