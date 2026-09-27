# Wyelee — component cheat-sheet for page fragments (`_src/<route>.html`)

Read `_brief.md` first (facts, copy rules). The canonical example is `_src/index.html` — copy its patterns.
`python _build.py` wraps every fragment in the shared shell (head, header, drawer, footer, WhatsApp float, sticky bar, sprite, JSON-LD).

## Fragment format
```html
<!--meta {
  "route": "furniture-assembly/",
  "title": "Furniture Assembly in Adelaide, Sydney, Brisbane & Perth | Wyelee",
  "description": "…150–160 chars…",
  "og": "srv-furniture.jpg",            // file in img/ (use og-home.jpg if the photo is missing)
  "crumb": "Furniture Assembly",         // breadcrumb label
  "service": {"name": "Furniture Assembly", "serviceType": "Furniture assembly", "description": "…"}   // optional → Service JSON-LD
} -->
{{CRUMBS}}
<section …>…</section>
```
Placeholders replaced by the builder: `{{R}}` (relative root: `../` on subpages — use it for every internal href/src), `{{WA}}` (WhatsApp link with prefilled text), `{{TEL}}` (`tel:+61432470313`), `{{PHONE}}` (`0432 470 313`), `{{EMAIL}}`, `{{CRUMBS}}` (breadcrumb nav, subpages only), `{{XV}}` (exploded-shelf SVG — home only), `{{MAP}}` (Australia map SVG).
FAQ items written as `<details class="faq-item"><summary>Q</summary><div><p>A</p></div></details>` are auto-collected into FAQPage JSON-LD.

## Layout
- `.wrap` (1180 px) / `.wrap-narrow` (820 px); `.section` (big padding) / `.section-tight`; backgrounds `.bg-fog`, `.bg-navy`.
- `.split` two columns ≥880 px (`.split-r` swaps order); `.grid.grid-2/.grid-3`.
- Inner-page hero: `<section class="page-hero"><div class="wrap split">…text…<figure class="figure">…</figure></div></section>`.
- Text: `.eyebrow` (green uppercase label with chevron), `h1/h2/h3`, `.lead`, `.muted`, `.fig` (small uppercase label).

## Buttons & links
`.btn.btn-primary` (green, white text — main CTA), `.btn.btn-navy`, `.btn.btn-ghost` (outline), `.btn.btn-white` (on navy), sizes `.btn-sm/.btn-lg`, `.btn-block`; `.cta-row` wrapper; `.link-arrow` text link with arrow.
Icons: `<svg class="ic" aria-hidden="true"><use href="#i-NAME"/></svg>` — names: arrow, chev-down, check, check-circle, x, minus-circle, phone, sms, mail, pin, clock, camera, tools, level, box, shield, anchor, recycle, calendar, home, building, wa, menu, info, star, drill, sparkle, move.
Pictograms (64-grid line art): `<svg class="pict" aria-hidden="true"><use href="#p-NAME"/></svg>` — names: bed, wardrobe, desk, bookshelf, drawers, sofa, box, phone-box, quote-clock, level-key, kitchen, drawers-tag, flatpack, allen, wall-anchor, home, office, moving, scissors. Size them with CSS (e.g. `style="width:64px;height:64px"`) or inside `.sheet-panel .pict` / `.parts .pict`.

## Manual devices (use these instead of generic cards)
- **Figure frame**: `<figure class="figure"><div class="photo-wide"><img … width height loading="lazy" decoding="async"></div><figcaption><span class="fig">Fig. 1</span><span>caption</span></figcaption></figure>` (`.photo-tall` = 4:5). Photos available now: `img/hero.jpg`, `img/srv-wardrobe.jpg`, `img/srv-disassembly.jpg` (+ `-m.jpg` 800 px variants for srcset). MISSING until fal.ai is topped up: srv-furniture, srv-kitchen, result, team, detail-parts, quote → for those use a **placeholder figure**: `<figure class="figure"><div class="photo-wide photo-placeholder" data-missing="srv-furniture.jpg">Photo pending: srv-furniture.jpg</div><figcaption>…</figcaption></figure>` (the builder/reviewer will swap it later).
- **Photo callouts** (max 2 desktop / 1 mobile): wrap the image in `.callouts` and add `<div class="callout to-left|to-right [desk]" style="--x:61%;--y:63%;--i:0"><span class="pin"></span><span class="pill"><svg class="ic"…#i-check…>Text</span></div>`. `.desk` hides it on mobile.
- **Step sheet** ("Your next 24 hours"): `.stepsheet` → `.brackets` (YOU / WYELEE) + `.sheet` with three `.sheet-panel` (each: `<p class="frame-tag"><b>1</b> Today</p>`, `<svg class="pict">`, `h3`, `p`) + `.tape` axis (`.rule` + `.labels` with three spans). Copy the block from index.html and reword frame 3 per service.
- **Parts ledger** (services list): `<ul class="parts ledger">` rows `<li><a href="{{R}}route/"><span class="num">01</span><span class="pict-wrap pict"><svg class="pict">…</svg></span><span class="part-name"><small>Service 01</small>Name</span><p class="part-desc">…</p><span class="part-go"><svg class="ic">#i-arrow</svg></span></a></li>`. For "Other services" on a service page omit the current one.
- **Included / not included**: `<div class="scope"><div class="scope-box yes"><h3><svg class="ic">#i-check-circle</svg> Included</h3><ul><li><svg class="ic">#i-check</svg>…</li></ul></div><div class="scope-box no"><h3><svg class="ic">#i-minus-circle</svg> Not included</h3><ul><li><svg class="ic">#i-x</svg>…</li></ul></div></div>`.
- **Item index** (what we assemble, columns): `<ul class="index-list"><li>Bed frames</li>…</ul>`.
- **Checklist** (sign-off): `<ul class="checklist"><li style="--k:0"><svg class="ic">#i-check-circle</svg><div><strong>…</strong><p>…</p></div></li></ul>` inside a `.signoff.rv` section for the tick draw-in.
- **Tags**: `<ul class="tags"><li class="hl">Adelaide</li><li>Sydney</li></ul>`; **brands**: `<ul class="brands"><li class="big"><span>IKEA</span><span class="qty">× most of our jobs</span></li><li><span>Bunnings</span></li>…</ul>`.
- **Note**: `<div class="note"><svg class="ic">#i-info</svg><p>…</p></div>` (`.note.navy` variant).
- **FAQ**: `<div class="faq"><details class="faq-item"><summary>Q</summary><div><p>A</p></div></details>…</div>`.
- **Tear-off CTA slip**: copy the `#start` section from index.html verbatim (navy card with scissors, three ways to start).
- **Reveal on scroll**: add `.rv` (+ `.rv-d1/.rv-d2` delays) to blocks.

## Forms (quote / contact)
`<form class="form" data-lead="quote|contact" data-endpoint="" novalidate>` → JS validates, posts FormData to `data-endpoint` if set, otherwise opens WhatsApp with a summary. Inside: `.field` (label + input/select/textarea + `<span class="error">`), `.form-row` (2 cols; `.r-3`), `.choices` with `.choice` (`<label class="choice"><input type="radio|checkbox" …><span>Text</span></label>`), `.form-foot` with `.fine`, `.form-status`, honeypot `<input class="hp" name="website" tabindex="-1" autocomplete="off">`. Success block: `<div class="form-success" tabindex="-1"><svg class="ic">#i-check-circle</svg><h2>Thanks — your quote is on its way within 24 hours.</h2><p data-extra></p><a class="btn btn-primary" data-wa-link href="{{WA}}" target="_blank" rel="noopener">Open WhatsApp</a></div>` and wrap the fields in `<div class="form-body">`. Field names the JS expects on the quote form: `suburb`, `postcode`, `city`, `service`, `items` (textarea), `condition`, `photos`, `days`, `time`, `name`, `mobile`, `email`, `notes`, `addons`. Use `.step-panel` fieldsets with `<legend>` for the three "sheets" (no wizard: all visible; do NOT add `data-steps`).

## Rules
- Every internal link starts with `{{R}}`; every image has width/height/alt; only the hero image may be eager.
- Copy: Australian English, short sentences, no invented stats/prices/hours/policies, "24 hours" is the only number. Email displayed exactly `Kenleong23@wyeleeassembly.com.au`.
- No carousels, marquees, stat bars, generic 3-icon card grids, CTA bands with stock photos.
