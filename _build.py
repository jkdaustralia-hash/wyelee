# -*- coding: utf-8 -*-
"""Wyelee — generador del sitio estático.
   python _build.py  →  envuelve cada _src/<ruta>.html (fragmento <main>) en el shell común
   y escribe /<ruta>/index.html + sitemap.xml, robots.txt, llms.txt, 404.html, site.webmanifest.

   Formato de fragmento: primera línea  <!--meta {json} -->  y luego el HTML del <main>.
   Claves meta: route ("" = home, "quote/"…), title, description, og (imagen relativa a img/),
                crumb (etiqueta de migas), nav (clave del enlace activo), service (dict opcional
                para JSON-LD Service), body_class (opcional). Las FAQ (<details class="faq-item">)
                se convierten solas en FAQPage JSON-LD.
"""
import json, os, re, io, html as H

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, '_src')
SITE = 'https://wyeleeassembly.com.au/'
BASE = os.environ.get('WYELEE_BASE', '/')   # prefijo absoluto del host: '/' en produccion, '/wyelee/' en GitHub Pages
BRAND = 'Wyelee'
TAGLINE = 'Furniture Assembly & Installation'
PHONE_DISPLAY = '0432 470 313'
PHONE_TEL = '+61432470313'
WA = 'https://wa.me/61432470313'
WA_TEXT = 'Hi Wyelee, I would like a quote for furniture assembly.'
EMAIL = 'Kenleong23@wyeleeassembly.com.au'
CITY = 'Sydney'
AREAS = ['Adelaide', 'Sydney', 'Brisbane', 'Perth']
YEAR = '2026'

SERVICES = [
    ('furniture-assembly/', 'Furniture Assembly', 'Any flatpack, any brand'),
    ('wardrobe-assembly/', 'Wardrobe Assembly', 'PAX, sliding doors, walk-ins'),
    ('disassembly-service/', 'Disassembly Service', 'Dismantled and labelled for your move'),
    ('ikea-kitchen-assembly/', 'IKEA Kitchen Assembly', 'METOD cabinets, basic scope'),
]
PAGES_ORDER = ['', 'furniture-assembly/', 'wardrobe-assembly/', 'disassembly-service/', 'ikea-kitchen-assembly/', 'quote/', 'contact/']


# ─────────────────────────── SVG sprite (icons used by all pages) ───────────────────────────
ICONS = {
    'arrow': '<path d="M4 12h15M13 6l6 6-6 6"/>',
    'chev-down': '<path d="m6 9 6 6 6-6"/>',
    'check': '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    'check-circle': '<circle cx="12" cy="12" r="9.5"/><path d="m8 12.5 2.8 2.8L16.5 9"/>',
    'x': '<path d="M6 6l12 12M18 6 6 18"/>',
    'minus-circle': '<circle cx="12" cy="12" r="9.5"/><path d="M8 12h8"/>',
    'phone': '<path d="M5.5 3h3l1.6 4.2-2 1.4a12 12 0 0 0 6.3 6.3l1.4-2L20 14.5v3a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 3.5 5.2 2 2 0 0 1 5.5 3z"/>',
    'sms': '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4A2.5 2.5 0 0 1 4 13.5z"/><path d="M8 8.5h8M8 11.5h5"/>',
    'mail': '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.5 7 8.5 6 8.5-6"/>',
    'pin': '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
    'clock': '<circle cx="12" cy="12" r="9.5"/><path d="M12 7v5.5l3.5 2"/>',
    'camera': '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1.5-2h5L16 7h2.5A1.5 1.5 0 0 1 20 8.5V18a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18z"/><circle cx="12" cy="13" r="3.2"/>',
    'tools': '<path d="M14.5 6.5a3.5 3.5 0 0 0 4.4 4.4L21 13l-2.2 2.2-2.1-2.1a3.5 3.5 0 0 0-4.4-4.4L10 6.5z"/><path d="m3 21 8-8"/><path d="M6 3 3 6l3.5 3.5L10 6z"/>',
    'level': '<rect x="2.5" y="8" width="19" height="8" rx="2"/><circle cx="12" cy="12" r="2.2"/><path d="M6 8v8M18 8v8"/>',
    'box': '<path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9"/>',
    'shield': '<path d="M12 3 4.5 6v5.5c0 4.2 3 7.7 7.5 9.5 4.5-1.8 7.5-5.3 7.5-9.5V6z"/><path d="m9 12 2 2 4-4.5"/>',
    'anchor': '<path d="M12 3v18M6 9h12M5 13a7 7 0 0 0 14 0"/><circle cx="12" cy="6" r="2"/>',
    'recycle': '<path d="M7 19.5H4.5L3 17l3.5-6"/><path d="m9.5 4.5 2.5-1.5 2.5 1.5L18 10.5"/><path d="M21 17l-1.5 2.5H12"/><path d="M4 11.5 6.5 11 7 13.5M18.2 10.4l-.7-2.5-2.5.6M12 22l-2-2.5 2-2.3"/>',
    'calendar': '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    'home': '<path d="m3.5 11 8.5-7 8.5 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-6h4v6"/>',
    'building': '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2M10 21v-3h4v3"/>',
    'wa': '<path fill="currentColor" stroke="none" d="M20.5 3.5A11.9 11.9 0 0 0 12 0C5.4 0 0 5.4 0 12c0 2.1.6 4.2 1.6 6L0 24l6.2-1.6A12 12 0 0 0 12 24c6.6 0 12-5.4 12-12 0-3.2-1.2-6.2-3.5-8.5zM12 22a10 10 0 0 1-5.1-1.4l-.4-.2-3.7 1 1-3.6-.2-.4A10 10 0 1 1 12 22zm5.5-7.5c-.3-.1-1.8-.9-2-1-.3-.1-.5-.1-.7.1l-.9 1.1c-.2.2-.3.2-.6.1a8.2 8.2 0 0 1-4-3.5c-.3-.5.3-.5.8-1.5.1-.2 0-.4 0-.5l-1-2.3c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.2.2 2.1 3.3 5.2 4.6 1.9.8 2.7.9 3.6.8.6-.1 1.8-.7 2-1.5.3-.7.3-1.3.2-1.4 0-.2-.2-.3-.5-.4z"/>',
    'menu': '<path d="M4 7h16M4 12h16M4 17h16"/>',
    'info': '<circle cx="12" cy="12" r="9.5"/><path d="M12 11v5.5M12 7.5h.01"/>',
    'star': '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    'drill': '<path d="M3 9h10l2-2h4a1.5 1.5 0 0 1 1.5 1.5v3A1.5 1.5 0 0 1 19 13h-4l-2-2H9v6l-1.5 3h-3L6 15v-2H3z"/><path d="M13 11h6"/>',
    'sparkle': '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.8 2.8M14.9 14.9l2.8 2.8M6.3 17.7l2.8-2.8M14.9 9.1l2.8-2.8"/>',
    'move': '<path d="M5 12h14M12 5l7 7-7 7"/><path d="M3 5v14"/>',
    'chevron': '<path fill="currentColor" stroke="none" d="M3 3h9l5 9-5 9H3l5-9z"/>',
}


PICTOS = {  # linea de manual, viewBox 0 0 64 64; class="g" = acento verde
    'bed': '<path d="M8 50V30a4 4 0 0 1 4-4h40a4 4 0 0 1 4 4v20"/><path d="M8 42h48M12 50v5M52 50v5"/><path d="M14 26V18a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v8"/><path class="g" d="M34 34h14v8H34z"/>',
    'wardrobe': '<rect x="12" y="8" width="40" height="50" rx="2"/><path d="M32 8v50M27 30v7M37 30v7M12 58v4M52 58v4"/><path class="g" d="M52 14h7M59 10v8"/>',
    'desk': '<path d="M6 24h52M10 24v30M54 24v30M30 24v30M10 40h20"/><path class="g" d="M14 29h12v7H14z"/>',
    'bookshelf': '<rect x="12" y="6" width="40" height="52" rx="2"/><path d="M12 24h40M12 42h40M32 6v52"/><path class="g" d="M17 15v9M21 13v11M40 33v9M44 31v11"/>',
    'drawers': '<rect x="10" y="10" width="44" height="46" rx="2"/><path d="M10 25h44M10 40h44M28 18h8M28 33h8M28 48h8"/>',
    'sofa': '<path d="M12 38v-8a4 4 0 0 1 4-4h2v-4a5 5 0 0 1 5-5h18a5 5 0 0 1 5 5v4h2a4 4 0 0 1 4 4v8"/><path d="M6 38h52v9H6zM12 47v6M52 47v6"/><path class="g" d="M18 30v8M46 30v8M32 26v12"/>',
    'box': '<path d="M10 22l22-10 22 10v24L32 56 10 46z"/><path d="M10 22l22 10 22-10M32 32v24"/><path class="g" d="M28 38c0-4 8-4 8 0 0 2-4 2-4 5M32 46v1"/>',
    'phone-box': '<rect x="18" y="4" width="28" height="56" rx="5"/><path d="M28 10h8"/><path class="g" d="M24 30l8-4 8 4v10l-8 4-8-4zM24 30l8 4 8-4M32 34v10"/>',
    'quote-clock': '<path d="M14 6h22l10 10v18"/><path d="M14 6v52h20"/><path d="M36 6v10h10M20 28h18M20 36h12M20 44h8"/><circle class="g" cx="46" cy="46" r="10"/><path class="g" d="M46 40v6l4 3"/>',
    'level-key': '<rect x="6" y="20" width="52" height="14" rx="3"/><circle class="g" cx="32" cy="27" r="4"/><path d="M25 20v14M39 20v14"/><path d="M16 56l12-12M28 44l4-4 4 4-4 4zM12 52l4 4"/>',
    'kitchen': '<rect x="10" y="10" width="44" height="28" rx="2"/><path d="M32 10v28M10 18h44M19 26h4M41 26h4"/><path class="g" d="M6 44h52M14 44v10M50 44v10"/>',
    'drawers-tag': '<rect x="10" y="10" width="40" height="46" rx="2"/><path d="M10 25h40M10 40h40M26 18h8M26 33h8M26 48h8"/><path class="g" d="M46 18h12v8l-6 4-6-4z"/>',
    'flatpack': '<path d="M8 46h48l-4 8H12zM12 36h40l-3 8H15zM16 26h32l-3 8H19z"/><path class="g" d="M40 14l4 4 8-8"/>',
    'allen': '<path d="M12 52l20-20"/><path d="M32 32l8-8-4-4-8 8"/><path d="M40 24l6-6 4 4-6 6"/><path class="g" d="M20 44l-8 8"/>',
    'wall-anchor': '<path d="M10 8v48"/><path d="M10 20h14v-6M24 20h8v34h-8"/><path class="g" d="M12 14l6 6M12 34l6 6M12 48l6 6"/>',
    'home': '<path d="m8 30 24-20 24 20"/><path d="M14 26v30h36V26"/><path class="g" d="M26 56V40h12v16"/>',
    'office': '<rect x="10" y="6" width="44" height="52" rx="2"/><path d="M20 16h6M32 16h6M20 28h6M32 28h6M20 40h6M32 40h6"/><path class="g" d="M28 58V48h8v10"/>',
    'moving': '<path d="M6 44V22a3 3 0 0 1 3-3h30v25"/><path d="M39 27h10l9 9v8H39"/><circle cx="16" cy="48" r="4"/><circle cx="48" cy="48" r="4"/><path class="g" d="M14 27h14v9H14z"/>',
    'scissors': '<circle cx="18" cy="46" r="7"/><circle cx="18" cy="18" r="7"/><path d="M23 23l32 20M23 41l32-20"/>',
}


def sprite():
    out = ['<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">']
    for k, v in ICONS.items():
        out.append('<symbol id="i-%s" viewBox="0 0 24 24">%s</symbol>' % (k, v))
    for k, v in PICTOS.items():
        out.append('<symbol id="p-%s" viewBox="0 0 64 64">%s</symbol>' % (k, v))
    out.append('</svg>')
    return ''.join(out)


def ic(name, cls='ic'):
    return '<svg class="%s" aria-hidden="true"><use href="#i-%s"/></svg>' % (cls, name)


# ─────────────────────────── helpers ───────────────────────────
def esc(s):
    return H.escape(str(s), quote=True)


def rel(route):
    """prefijo relativo a la raíz desde una ruta ("" | "quote/")."""
    return '../' * route.count('/')


def wa_href(text=WA_TEXT):
    from urllib.parse import quote
    return WA + '?text=' + quote(text)


def cur(route, href_route):
    if route == href_route:
        return ' aria-current="page"'
    return ''


# ─────────────────────────── shell ───────────────────────────
def head(m, route):
    R = rel(route)
    url = SITE + route
    og = SITE + 'img/' + m.get('og', 'og-home.jpg')
    title = m['title']
    desc = m['description']
    ld = jsonld(m, route)
    return f'''<!DOCTYPE html>
<html lang="en-AU" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{url}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="theme-color" content="#1D153E">
<meta property="og:type" content="website">
<meta property="og:site_name" content="{BRAND}">
<meta property="og:locale" content="en_AU">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{og}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{esc(title)}">
<meta name="twitter:description" content="{esc(desc)}">
<meta name="twitter:image" content="{og}">
<link rel="icon" href="{R}img/logo/wyelee-isotipo-color.svg" type="image/svg+xml">
<link rel="icon" href="{R}favicon.ico" sizes="any">
<link rel="apple-touch-icon" href="{R}img/logo/apple-touch-icon.png">
<link rel="manifest" href="{R}site.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito:wght@700;800&family=Nunito+Sans:ital,wght@0,400;0,600;0,700;1,400&display=swap">
<link rel="stylesheet" href="{R}css/site.css">
{''.join('<link rel="stylesheet" href="%s%s">' % (R, c) for c in m.get('css', []))}
<script>document.documentElement.classList.replace('no-js','js')</script>
{ld}
</head>
<body class="{esc(m.get('body_class', ''))}">
{sprite()}
<a class="skip" href="#main">Skip to content</a>
'''


def header(route):
    R = rel(route)
    services_cur = ' aria-current="true"' if any(route == s[0] for s in SERVICES) else ''
    menu = ''.join(
        f'<li><a href="{R}{r}"{cur(route, r)}><span>{esc(n)}<small>{esc(sub)}</small></span></a></li>'
        for r, n, sub in SERVICES)
    return f'''<header class="site-header">
  <div class="wrap">
    <a class="brand" href="{R if R else './'}" aria-label="{BRAND} — {TAGLINE}, home">
      <img src="{R}img/logo/wyelee-horizontal-sin-tagline-color.svg" alt="{BRAND}" width="176" height="40">
    </a>
    <nav class="nav" aria-label="Main">
      <a href="{R if R else './'}"{cur(route, '')}>Home</a>
      <div class="has-menu">
        <button type="button" aria-expanded="false" aria-haspopup="true"{services_cur.replace('aria-current', 'data-current')}>Services {ic('chev-down')}</button>
        <ul class="menu">{menu}</ul>
      </div>
      <a href="{R}contact/"{cur(route, 'contact/')}>Contact</a>
    </nav>
    <div class="header-cta">
      <a class="header-phone" href="tel:{PHONE_TEL}">{ic('phone')}<span>{PHONE_DISPLAY}</span></a>
      <span class="chip">{ic('clock')} Quote within 24 h</span>
      <a class="btn btn-primary btn-sm" href="{R}quote/"{cur(route, 'quote/')}>Get a quote</a>
    </div>
    <a class="btn btn-primary btn-sm m-cta" href="{R}quote/"{cur(route, 'quote/')}>Get a quote</a>
    <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="drawer" aria-label="Open menu">{ic('menu')}</button>
  </div>
</header>
<div class="drawer" id="drawer" role="dialog" aria-modal="true" aria-label="Menu">
  <div class="drawer-bg" data-close></div>
  <div class="drawer-panel">
    <div class="drawer-head">
      <img src="{R}img/logo/wyelee-horizontal-sin-tagline-color.svg" alt="{BRAND}" width="150" height="34">
      <button class="menu-toggle" type="button" data-close aria-label="Close menu">{ic('x')}</button>
    </div>
    <nav aria-label="Mobile">
      <a href="{R if R else './'}"{cur(route, '')}>Home</a>
      <a href="{R}furniture-assembly/"{cur(route, 'furniture-assembly/')}>Furniture Assembly</a>
      <div class="sub">
        <a href="{R}wardrobe-assembly/"{cur(route, 'wardrobe-assembly/')}>Wardrobe Assembly</a>
        <a href="{R}disassembly-service/"{cur(route, 'disassembly-service/')}>Disassembly Service</a>
        <a href="{R}ikea-kitchen-assembly/"{cur(route, 'ikea-kitchen-assembly/')}>IKEA Kitchen Assembly</a>
      </div>
      <a href="{R}contact/"{cur(route, 'contact/')}>Contact</a>
    </nav>
    <div class="drawer-cta">
      <a class="btn btn-primary btn-block" href="{R}quote/"{cur(route, 'quote/')}>Get my quote in 24 hours</a>
      <a class="btn btn-ghost btn-block" href="tel:{PHONE_TEL}">{ic('phone')} Call {PHONE_DISPLAY}</a>
    </div>
  </div>
</div>
<main id="main">
'''


def sticky(route):
    if route in ('quote/', 'contact/'):
        return ''
    R = rel(route)
    return (f'<div class="sticky-bar" data-sticky><strong>Quote within 24 hours</strong>'
            f'<a class="btn btn-primary btn-sm" href="{R}quote/">Get my quote</a>'
            f'<a class="btn btn-ghost btn-sm btn-ico" href="sms:{PHONE_TEL}" aria-label="Text us on {PHONE_DISPLAY}">{ic("sms")}</a></div>')


def footer(route, m=None):
    m = m or {}
    R = rel(route)
    svc = ''.join(f'<li><a href="{R}{r}">{esc(n)}</a></li>' for r, n, _ in SERVICES)
    areas = ''.join(f'<li>{esc(a)}</li>' for a in AREAS)
    return f'''</main>
<footer class="site-footer">
  <div class="wrap">
    <div class="footer-grid">
      <div class="footer-brand">
        <img src="{R}img/logo/wyelee-horizontal-color.svg" alt="{BRAND} — {TAGLINE}" width="214" height="54" loading="lazy">
        <p>IKEA and flatpack furniture assembly for homes and businesses. Send us your order details and get a quote within 24 hours.</p>
      </div>
      <div>
        <h3>Services</h3>
        <ul>{svc}</ul>
      </div>
      <div>
        <h3>Service areas</h3>
        <ul class="areas">{areas}<li>Across Australia</li></ul>
      </div>
      <div>
        <h3>Contact</h3>
        <ul class="contact-list">
          <li>{ic('phone')}<a href="tel:{PHONE_TEL}">{PHONE_DISPLAY}</a></li>
          <li>{ic('wa')}<a href="{wa_href()}" target="_blank" rel="noopener">WhatsApp us</a></li>
          <li>{ic('mail')}<a href="mailto:{EMAIL}">{EMAIL}</a></li>
          <li>{ic('pin')}<span>{CITY}, Australia</span></li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <span>© <span data-year>{YEAR}</span> {BRAND} — {TAGLINE}</span>
      <span><a href="{R}quote/">Get a quote</a> · <a href="{R}contact/">Contact</a></span>
    </div>
  </div>
</footer>
<a class="wa-float" href="{wa_href()}" target="_blank" rel="noopener" aria-label="Chat with Wyelee on WhatsApp">{ic('wa')}<span>WhatsApp</span></a>
{sticky(route)}
<script src="{R}js/site.js" defer></script>
{''.join('<script src="%s%s" defer></script>' % (R, j) for j in m.get('js', []))}
</body>
</html>
'''


# ─────────────────────────── JSON-LD ───────────────────────────
def org():
    return {
        '@type': ['LocalBusiness', 'HomeAndConstructionBusiness'], '@id': SITE + '#business',
        'name': BRAND, 'alternateName': 'Wyelee Furniture Assembly & Installation', 'url': SITE,
        'logo': SITE + 'img/logo/wyelee-isotipo-color.png', 'image': SITE + 'img/og-home.jpg',
        'telephone': PHONE_TEL, 'email': EMAIL,
        'description': 'IKEA and flatpack furniture assembly and installation for homes and businesses across Australia. Quotes within 24 hours.',
        'address': {'@type': 'PostalAddress', 'addressLocality': CITY, 'addressRegion': 'NSW', 'addressCountry': 'AU'},
        'areaServed': [{'@type': 'City', 'name': a} for a in AREAS] + [{'@type': 'Country', 'name': 'Australia'}],
        'sameAs': [],
        'contactPoint': {'@type': 'ContactPoint', 'telephone': PHONE_TEL, 'contactType': 'customer service', 'availableLanguage': 'en'},
        'makesOffer': [{'@type': 'Offer', 'itemOffered': {'@type': 'Service', 'name': n, 'url': SITE + r}} for r, n, _ in SERVICES],
    }


def faqs_from(html_):
    out = []
    for m in re.finditer(r'<details class="faq-item"[^>]*>\s*<summary>(.*?)</summary>\s*<div>(.*?)</div>\s*</details>', html_, re.S):
        q = re.sub(r'<[^>]+>', '', m.group(1)).strip()
        a = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', m.group(2))).strip()
        out.append({'@type': 'Question', 'name': H.unescape(q), 'acceptedAnswer': {'@type': 'Answer', 'text': H.unescape(a)}})
    return out


def jsonld(m, route):
    graph = [org()]
    graph.append({'@type': 'WebSite', '@id': SITE + '#website', 'url': SITE, 'name': BRAND, 'publisher': {'@id': SITE + '#business'}, 'inLanguage': 'en-AU'})
    page = {'@type': 'WebPage', '@id': SITE + route + '#webpage', 'url': SITE + route, 'name': m['title'], 'description': m['description'],
            'isPartOf': {'@id': SITE + '#website'}, 'about': {'@id': SITE + '#business'}, 'inLanguage': 'en-AU'}
    graph.append(page)
    if route:
        crumbs = [{'@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': SITE},
                  {'@type': 'ListItem', 'position': 2, 'name': m.get('crumb', m['title']), 'item': SITE + route}]
        graph.append({'@type': 'BreadcrumbList', 'itemListElement': crumbs})
    if m.get('service'):
        s = dict(m['service'])
        s.setdefault('@type', 'Service')
        s.setdefault('provider', {'@id': SITE + '#business'})
        s.setdefault('areaServed', [{'@type': 'City', 'name': a} for a in AREAS] + [{'@type': 'Country', 'name': 'Australia'}])
        s.setdefault('url', SITE + route)
        graph.append(s)
    if m.get('_faqs'):
        graph.append({'@type': 'FAQPage', 'mainEntity': m['_faqs']})
    return '<script type="application/ld+json">%s</script>' % json.dumps({'@context': 'https://schema.org', '@graph': graph}, ensure_ascii=False)


# ─────────────────────────── build ───────────────────────────
def read_fragment(path):
    s = io.open(path, encoding='utf-8').read()
    m = re.match(r'\s*<!--\s*meta\s*(\{.*?\})\s*-->\s*', s, re.S)
    if not m:
        raise SystemExit('Sin meta: ' + path)
    meta = json.loads(m.group(1))
    body = s[m.end():]
    return meta, body


def build_page(meta, body):
    route = meta['route']
    R = rel(route)
    body = body.replace('{{R}}', R).replace('{{WA}}', wa_href()).replace('{{TEL}}', 'tel:' + PHONE_TEL)
    body = body.replace('{{PHONE}}', PHONE_DISPLAY).replace('{{EMAIL}}', EMAIL)
    for tag, fn in (('{{XV}}', '_hero-exploded.svg'), ('{{MAP}}', '_map-australia.svg')):
        if tag in body:
            body = body.replace(tag, io.open(os.path.join(SRC, fn), encoding='utf-8').read())
    if route:
        crumb = f'<nav class="crumbs" aria-label="Breadcrumb"><div class="wrap"><ol><li><a href="{R}">Home</a></li><li aria-current="page">{esc(meta.get("crumb", meta["title"]))}</li></ol></div></nav>'
        body = body.replace('{{CRUMBS}}', crumb)
    else:
        body = body.replace('{{CRUMBS}}', '')
    meta['_faqs'] = faqs_from(body)
    return head(meta, route) + header(route) + body + footer(route, meta)


def write(path, s):
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    io.open(path, 'w', encoding='utf-8', newline='\n').write(s)


def main():
    routes = []
    for fn in sorted(os.listdir(SRC)):
        if not fn.endswith('.html') or fn.startswith('_'):
            continue
        meta, body = read_fragment(os.path.join(SRC, fn))
        route = meta['route']
        out = os.path.join(ROOT, route.replace('/', os.sep), 'index.html')
        write(out, build_page(meta, body))
        routes.append(route)
        print('  ', route or '/', '->', os.path.relpath(out, ROOT))
    # 404
    m404 = {'route': '', 'title': 'Page not found — Wyelee', 'description': 'That page does not exist.', 'crumb': '404'}
    body404 = '''<section class="section"><div class="wrap-narrow center"><p class="eyebrow">Error 404</p><h1>That page isn’t in the box.</h1><p class="lead mx">The link may be old or mistyped. Head back home or get a quote for your assembly.</p><div class="cta-row" style="justify-content:center"><a class="btn btn-primary" href="/">Back to home</a><a class="btn btn-ghost" href="/quote/">Get a quote</a></div></div></section>'''
    p = build_page(m404, body404)
    # el host sirve 404.html en cualquier URL inexistente (p. ej. /quote/typo/) → rutas absolutas desde la raíz
    p = re.sub(r'\b(href|src)="(?!https?:|/|#|mailto:|tel:|sms:)(\./)?', lambda m: '%s="%s' % (m.group(1), BASE), p)
    p = p.replace('href="/"', 'href="%s"' % BASE).replace('href="/quote/"', 'href="%squote/"' % BASE)
    p = p.replace('<link rel="canonical" href="%s">\n' % SITE, '').replace('<meta name="robots" content="index, follow, max-image-preview:large">', '<meta name="robots" content="noindex">')
    write(os.path.join(ROOT, '404.html'), p)
    # sitemap
    ordered = [r for r in PAGES_ORDER if r in routes] + [r for r in routes if r not in PAGES_ORDER]
    sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for r in ordered:
        pr = '1.0' if r == '' else ('0.9' if r in ('furniture-assembly/', 'quote/') else '0.8')
        sm.append(f'  <url><loc>{SITE}{r}</loc><changefreq>monthly</changefreq><priority>{pr}</priority></url>')
    sm.append('</urlset>')
    write(os.path.join(ROOT, 'sitemap.xml'), '\n'.join(sm) + '\n')
    write(os.path.join(ROOT, 'robots.txt'), f'User-agent: *\nAllow: /\nDisallow: /_src/\n\nSitemap: {SITE}sitemap.xml\n')
    write(os.path.join(ROOT, 'site.webmanifest'), json.dumps({
        'name': 'Wyelee — Furniture Assembly & Installation', 'short_name': 'Wyelee', 'start_url': BASE, 'display': 'browser',
        'background_color': '#FFFFFF', 'theme_color': '#1D153E',
        'icons': [{'src': BASE + 'img/logo/apple-touch-icon.png', 'sizes': '180x180', 'type': 'image/png'}]}, indent=2))
    write(os.path.join(ROOT, 'llms.txt'), f'''# Wyelee — Furniture Assembly & Installation

> IKEA and flatpack furniture assembly service for homes and businesses in Adelaide, Sydney, Brisbane, Perth and across Australia. Customers send their order details or a photo and receive a quote within 24 hours. Phone/SMS {PHONE_DISPLAY}. Email {EMAIL}.

## Services
- [Furniture Assembly]({SITE}furniture-assembly/): any flatpack furniture from IKEA, Fantastic Furniture, Officeworks, Bunnings, Harvey Norman, Amart and online stores — beds, wardrobes, desks, drawers, bookshelves, TV units, sofas, outdoor and office furniture.
- [Wardrobe Assembly]({SITE}wardrobe-assembly/): IKEA PAX and other sliding-door, walk-in, free-standing and fitted wardrobes, anchored to the wall.
- [Disassembly Service]({SITE}disassembly-service/): careful dismantling for moves, fittings bagged and labelled per item, optional re-assembly.
- [IKEA Kitchen Assembly]({SITE}ikea-kitchen-assembly/): assembly of IKEA METOD kitchen cabinets (carcasses, doors, drawers, hinges, legs, plinths). No plumbing, electrical or benchtop work.

## Get a quote
- [Quote form]({SITE}quote/): suburb and postcode, items (name, article number or link), condition, photos, preferred days — quote within 24 hours.
- [Contact]({SITE}contact/)
''')
    print('OK', len(routes), 'páginas')


if __name__ == '__main__':
    main()
