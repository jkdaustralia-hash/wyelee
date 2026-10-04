# Wyelee back office — especificación (contrato entre backend, panel y sitio)

Objetivo: dentro del mismo repo/proyecto `wyelee/` (sitio estático ya desplegado en Vercel), añadir un **back office** con:
1. **Mini-CRM** para las personas que dejan sus datos en los formularios del sitio (`/quote/` y `/contact/`): pipeline Kanban, tabla y ficha de leads con fotos, estadísticas, usuarios.
2. **Integraciones**: página de administrador para IDs de Google (GA4, GTM, Google Ads), Meta Pixel, TikTok, Microsoft Clarity, Hotjar, y **código de terceros incrustado** (fragmentos HTML/JS en `<head>`, inicio o fin de `<body>`) que el sitio público carga en tiempo de ejecución sin tocar código.
3. **Login solo por magic link** (sin contraseñas) por correo (Resend).

Arquitectura calcada de `../jkd-legacy-crm` (Node ≥ 22, sin frameworks; `node:http` + `node:sqlite` en local, Turso/libSQL en Vercel; frontend vanilla). **Copiar de allí todo lo que sirva** (`lib/app.js`, `lib/email.js`, `public/app.js`, `public/styles.css`) y adaptarlo a este contrato. Idioma del panel: **español** (el cliente es hispanohablante); los datos de los leads llegan en inglés.

## Carpetas (todo dentro de `wyelee/`)

```
lib/db.js          capa BD (ya copiada, lista; archivo local data/wyelee-crm.db; Turso si hay TURSO_DATABASE_URL)
lib/app.js         handler handle(req,res) + ensureInit()  ← BACKEND (agente A)
lib/email.js       magic link + notificación de lead con fotos adjuntas (Resend REST)  ← agente A
api/index.js       entrada serverless Vercel (ya escrita)
server.js          entrada local, puerto 8834 (ya escrita)
webui/index.html   SPA del panel (<base href="/crm/">)  ← agente B
webui/app.js       frontend del panel  ← agente B
webui/styles.css   tema Wyelee (claro)  ← agente B
webui/assets/      logo.svg, isotipo.svg, favicon.png (ya copiados)
js/analytics.js    cargador de etiquetas/código de terceros del sitio público  ← agente C
js/site.js         envío de formularios al CRM (JSON + fotos reducidas)  ← agente C (modificar)
_src/*.html + _build.py   data-endpoint y <script analytics.js>  ← agente C (modificar) y `python _build.py`
package.json, vercel.json (ya escritos)
```

Rutas servidas por el server local (`node server.js`, puerto **8834**) y por la función en Vercel:
- `/` → el sitio estático de esta carpeta (en Vercel lo sirve el CDN directamente; el server local lo sirve él mismo **excluyendo** `lib/`, `api/`, `webui/`, `data/`, `node_modules/`, `_*`, `package*.json`, `vercel.json`, `server.js`, `*.md`).
- `/crm` y `/crm/*` → SPA del panel (`webui/`), con fallback a `index.html`.
- `/api/*` y `/crm/api/*` → API (el prefijo `/crm` se quita antes de enrutar). `/crm/auth/verify` = verificación del magic link.
- Rutas limpias: el sitio usa carpetas con `index.html` (`/quote/`); no hay redirecciones de migración WordPress (quitar `migrationTarget`, `MIGRATION_REDIRECTS`, `REAL_PAGES`, `injectHead`, JSON-LD y todo lo específico de JKD). No hay `?lang=`.

## Variables de entorno

`PORT` (local, 8834) · `SITE_DIR` (opcional) · `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` (producción) · `RESEND_API_KEY` · `MAIL_FROM` (por defecto `Wyelee <onboarding@resend.dev>`) · `APP_URL` (opcional) · `ADMIN_EMAIL` (primer admin; por defecto `juan.garcia@wearedatalab.co`) · `ADMIN_EMAIL_2` (segundo admin opcional; por defecto `Kenleong23@wyeleeassembly.com.au`) · `CRON_SECRET` (protege `/api/cron/tasks`; Vercel lo envía automáticamente en sus crons).
`vercel.json` lleva `"crons": [{ "path": "/api/cron/tasks", "schedule": "0 22 * * *" }]` (22:00 UTC = 08:30 Adelaide; el plan Hobby permite un cron diario). Sin `RESEND_API_KEY` el magic link sale por consola y (solo fuera de producción) como `devLink` en la respuesta.

## Esquema de base de datos (SQL exacto; `db.execMany`)

```sql
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, role TEXT NOT NULL DEFAULT 'comercial', active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS magic_tokens (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL, impersonator_id INTEGER);
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY,
  name TEXT, email TEXT, mobile TEXT,
  suburb TEXT, postcode TEXT, city TEXT,
  service TEXT,            -- furniture | wardrobe | disassembly | kitchen | NULL (contacto)
  items TEXT,              -- texto libre, una línea por artículo
  condition TEXT,          -- new | partial | assembled | NULL
  days TEXT, time TEXT,    -- weekdays|weekend|either ; morning|afternoon|either
  addons TEXT,             -- csv: packaging,anchoring,disassembly
  notes TEXT,              -- notas del cliente (quote) o mensaje (contact)
  source TEXT DEFAULT 'quote',   -- quote | contact | manual
  status TEXT NOT NULL DEFAULT 'nuevo',
  loss_reason TEXT, owner_id INTEGER, attribution TEXT,
  quoted_at TEXT,          -- se fija la primera vez que pasa a 'cotizado' (mide el SLA de 24 h)
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lead_files (id INTEGER PRIMARY KEY, lead_id INTEGER NOT NULL, name TEXT, mime TEXT, size INTEGER, data TEXT NOT NULL, created_at TEXT NOT NULL);   -- data = base64 (sin prefijo data:)
CREATE TABLE IF NOT EXISTS lead_events (id INTEGER PRIMARY KEY, lead_id INTEGER NOT NULL, type TEXT NOT NULL, from_status TEXT, to_status TEXT, loss_reason TEXT, note TEXT, user_id INTEGER, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY, lead_id INTEGER NOT NULL, user_id INTEGER, title TEXT NOT NULL, due_at TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0, done_at TEXT, notified INTEGER NOT NULL DEFAULT 0, emailed INTEGER NOT NULL DEFAULT 0, email_id TEXT, created_by INTEGER, created_at TEXT NOT NULL);   -- user_id = responsable (NULL = cualquiera); due_at ISO UTC; email_id = id del correo programado en Resend
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(done, due_at);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '', updated_at TEXT);
CREATE TABLE IF NOT EXISTS redirects (id INTEGER PRIMARY KEY, from_path TEXT NOT NULL UNIQUE, to_path TEXT NOT NULL, code INTEGER NOT NULL DEFAULT 301, active INTEGER NOT NULL DEFAULT 1, hits INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS rate_hits (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, window_start TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_leads_updated ON leads(updated_at);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_events_lead ON lead_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_files_lead ON lead_files(lead_id);
```
Seed (solo si `users` está vacía): `ADMIN_EMAIL` como "Administrador"/admin y `ADMIN_EMAIL_2` como "Ken Leong"/admin. 0 leads. (Un script aparte `_seed_demo.mjs` puede meter leads de prueba en local; no forma parte del server.)

## Constantes (una sola fuente por lado: `lib/app.js` en backend, `webui/app.js` en frontend)

```js
STATUSES = ['nuevo', 'contactado', 'cotizado', 'agendado', 'ganado', 'perdido']
STATUS_LABELS = { nuevo:'Nuevo', contactado:'Contactado', cotizado:'Cotizado', agendado:'Agendado', ganado:'Ganado', perdido:'Perdido' }
LOSS_REASONS = { no_responde:'No responde', precio:'Precio', fuera_zona:'Fuera de zona', fecha:'No hay fecha disponible', spam:'Spam', otro:'Otro' }
SERVICES = { furniture:'Furniture assembly', wardrobe:'Wardrobe assembly', disassembly:'Disassembly', kitchen:'IKEA kitchen' }
CONDITIONS = { new:'New in the box', partial:'Partially assembled', assembled:'Already assembled' }
ADDONS = { packaging:'Packaging removal', anchoring:'Wall anchoring', disassembly:'Disassembly of old furniture' }
ROLES = ['admin','comercial']; ROLE_LABELS = { admin:'Administrador', comercial:'Comercial' }
SLA_HOURS = 24   // promesa del sitio: cotización en 24 h
```

## API

Todas las respuestas JSON. Cookie de sesión `wy_sid` (HttpOnly, SameSite=Lax, Secure en prod), 7 días. Rate limit por IP respaldado en `rate_hits`: `/api/public/lead` 20/h, `/api/auth/request` 6/15 min. Cabeceras de seguridad como en JKD. CORS `*` solo en las rutas públicas.

### Públicas
- `GET /api/public/site-config` → `{ enabled, ga4_id, gtm_id, google_ads_id, google_ads_label, meta_pixel_id, tiktok_pixel_id, clarity_id, hotjar_id, custom_head, custom_body_start, custom_body_end, snippets:[{ id, name, position:'head'|'body_start'|'body_end', code }] }` (solo snippets con `enabled`). `Cache-Control: public, max-age=60, s-maxage=300`.
- `POST /api/public/lead` (JSON, ≤ 4.5 MB). Body: `{ source:'quote'|'contact', name, email, mobile, suburb, postcode, city, service, items, condition, days, time, addons:[...]|'a,b', notes, message, photos:[{ name, type, data }], attribution:{ page, referrer, utm_source, utm_medium, utm_campaign, gclid }, website }`.
  - `website` = honeypot: si viene con valor → responder `201 {ok:true}` sin guardar.
  - `contact`: usa `name`, `contact` (móvil o correo: si contiene `@` → email, si no → mobile), `message` → `notes`. `service` NULL.
  - Validación: email con regex si viene; `mobile` o `email` obligatorio; `postcode` 4 dígitos si viene; `service` ∈ SERVICES o NULL; `condition/days/time` ∈ sus listas o NULL; `addons` filtrado por ADDONS; tope de longitud en todo (`cap`). `photos`: máximo 6, cada `data` ≤ 700 000 caracteres base64, `type` ∈ image/jpeg|png|webp; se guardan en `lead_files`.
  - Estado inicial `nuevo`; evento `created` con nota `Recibido desde el sitio web (quote|contact) · <canal>`.
  - Notifica por correo a todos los admins activos (best-effort) adjuntando las fotos (Resend `attachments:[{filename, content}]`, content = base64).
  - Respuesta `201 { ok:true, id }`.

### Auth
- `POST /api/auth/request` `{email}` → siempre `200 {ok:true}` (+ `devLink` solo fuera de producción cuando el correo existe). Link = `${base}/crm/auth/verify?token=…`, un solo uso, 15 min.
- `GET /crm/auth/verify?token=` → set-cookie + `302 /crm` (token inválido → `302 /crm#expired`).
- `POST /api/auth/logout`. `GET /api/me` → `{ id, name, email, role, impersonating }`. `POST /api/auth/stop-impersonate`.

### Protegidas (401 sin sesión; `comercial` no puede: borrar leads, ni ver/editar usuarios, redirecciones, integraciones)
- `GET /api/meta` → `{ statuses, statusLabels, lossReasons, services, conditions, addons, roles, slaHours }`.
- `GET /api/leads?status=&q=&service=&city=` → filas con `owner_name` (JOIN) + `photos` (COUNT de lead_files) + `hours_open` (horas desde created_at, número) ; LIMIT 1000, orden `updated_at DESC`.
- `POST /api/leads` (lead manual; mismos campos; `source:'manual'`, `owner_id` por defecto el usuario).
- `GET /api/leads/:id` → lead + `owner_name` + `events[]` (con `user_name`) + `files:[{ id, name, mime, size }]` (sin data).
- `GET /api/leads/:id/files/:fid` → la imagen binaria (`Content-Type` = mime, `Cache-Control: private, max-age=3600`). Protegida por sesión.
- `PATCH /api/leads/:id` (campos editables: name, email, mobile, suburb, postcode, city, service, items, condition, days, time, addons, notes, owner_id).
- `PATCH /api/leads/:id/status` `{status, loss_reason?}` → valida; `perdido` exige `loss_reason`; al pasar a `cotizado` por primera vez fija `quoted_at`; evento `status`.
- `POST /api/leads/:id/note` `{note}`. `DELETE /api/leads/:id` (admin; borra events y files).
- **Tareas por lead** (recordatorios: "llamar al lead en 2 horas", etc.):
  - `GET /api/tasks?scope=mine|all&state=open|done|all` → `[{ id, lead_id, lead_name, lead_mobile, user_id, user_name, title, due_at, done, done_at, created_at, overdue:bool }]` ordenadas por `due_at ASC`; `scope=mine` = tareas con `user_id` = yo o NULL (por defecto `mine`, `state=open`).
  - `GET /api/tasks/summary` → `{ overdue:n, dueSoon:n, today:n, due:[{ id, lead_id, lead_name, title, due_at }] }` donde `due` = tareas abiertas con `due_at <= now` y `notified=0` (máx. 10) — al devolverlas el server las marca `notified=1` (se avisan una sola vez; el badge sigue contando las vencidas). `dueSoon` = vencen en los próximos 60 min.
  - `POST /api/leads/:id/tasks` `{ title, due_at, user_id? }` → 201 tarea; también crea `lead_events` tipo `task` con nota `Tarea: <title> · vence <fecha>`. **Recordatorio por correo:** si hay `RESEND_API_KEY`, programa el correo de recordatorio con Resend (`scheduled_at = due_at`, ISO) al responsable (`user_id`) o, si es NULL, a todos los admins activos; guarda el `id` devuelto en `email_id` y `emailed=1`. Si Resend rechaza la programación (p. ej. fecha a más de 30 días) deja `emailed=0` para el respaldo.
  - `PATCH /api/tasks/:id` `{ done?, title?, due_at?, user_id? }` (al marcar `done` fija `done_at` y crea evento `task_done`; si tiene `email_id` y aún no venció, cancela el correo programado `POST https://api.resend.com/emails/:id/cancel`; si cambia `due_at`/`user_id`, cancela y reprograma); `DELETE /api/tasks/:id` (cancela el correo programado).
  - **Respaldo de recordatorios**: `GET /api/tasks/summary` (autenticado) y `GET /api/cron/tasks` (sin sesión; exige `Authorization: Bearer ${CRON_SECRET}` cuando `CRON_SECRET` está definido; Vercel lo llama a diario según `vercel.json` `crons`) envían por correo, con `sendTaskReminder`, toda tarea abierta con `due_at <= now` y `emailed=0`, y la marcan `emailed=1`. Así el aviso llega aunque la programación de Resend haya fallado.
  - `GET /api/leads` incluye `next_task:{ id, title, due_at }|null` (la tarea abierta más próxima) y `open_tasks` (n).
- Usuarios: `GET/POST /api/users`, `PATCH /api/users/:id`, `POST /api/users/:id/impersonate` (igual que JKD).
- Redirecciones: igual que JKD (`/api/redirects` CRUD, chequeo en `handle()` para GET/HEAD del sitio, no aplica a `/crm`, `/api`, ni assets).
- `GET /api/stats?month=YYYY-MM` → `{ funnel:{estado:n}, total, monthly:[{month, created, won, lost, conversion}], lossBreakdown, byService:[{key,label,count}], byCity:[{city,count}], availableMonths, month, kpi:{ total, newThisMonth, won, lost, winRate, active, avgHoursToQuote, slaRate, overdue } }` — `avgHoursToQuote` = media de `quoted_at - created_at` en horas (1 decimal) sobre leads con `quoted_at`; `slaRate` = % de esos con ≤ 24 h; `overdue` = leads en `nuevo` con más de 24 h.
- Ajustes (admin): `GET /api/settings` → todas las claves; `PUT /api/settings` → guarda solo `ALLOWED_SETTING_KEYS`.

### Claves de `settings` (DEFAULT_SETTINGS)
`tracking_enabled` ('0' por defecto — interruptor maestro), `ga4_id`, `gtm_id`, `google_ads_id`, `google_ads_label`, `meta_pixel_id`, `tiktok_pixel_id`, `clarity_id`, `hotjar_id`, `custom_head`, `custom_body_start`, `custom_body_end`, `snippets` (JSON array `[{id, name, position, enabled:0|1, code}]`, `id` = string corto aleatorio), `notify_emails` (csv opcional de correos extra que reciben la notificación de lead, además de los admins), `whatsapp_number` (por defecto `61432470313`, para las acciones rápidas del panel).

## Panel (`webui/`) — vistas y comportamiento

Hash routing como JKD: `#kanban` (defecto), `#leads`, `#lead-<id>`, `#tasks`, `#stats`, `#users`, `#redirects`, `#integrations`. Menú lateral en este orden: Pipeline, Leads, Tareas, Estadísticas, Usuarios, Redirecciones, Integraciones. Rol `comercial` no ve Usuarios/Redirecciones/Integraciones.

- **Login**: tarjeta con logo, campo de correo, botón "Enviar enlace de acceso"; tras enviar, mensaje "Revisa tu correo"; en local muestra el `devLink` como botón. Si `location.hash === '#expired'` muestra "El enlace caducó o ya se usó".
- **Pipeline** (`#kanban`): 6 columnas en el orden de STATUSES, drag & drop entre columnas (perdido → modal con motivo). Tarjeta: nombre, servicio (chip), suburb + postcode, fecha, responsable, fuente (`quote`/`contact`/`manual`) y, en `nuevo`, **badge de SLA**: verde "Cotizar en Xh" si faltan horas, rojo "Vencido +Xh" si pasó de 24 h. Buscador y botón "+ Lead manual". Carga por bloques de 10 por columna ("ver más").
- **Leads** (`#leads`): tabla paginada (20) con filtros por estado, servicio y ciudad y búsqueda; columnas: nombre, contacto, servicio, ciudad/suburb, estado, fotos (contador), creado, responsable. Clic → ficha.
- **Ficha** (`#lead-<id>`): cabecera con nombre/estado/SLA; **acciones rápidas** con plantillas en inglés: WhatsApp (`https://wa.me/<mobile normalizado 61…>?text=Hi <name>, this is Wyelee about your assembly quote…`), SMS (`sms:`), llamar, correo; datos de la cotización (servicio, artículos, condición, días/franja, add-ons, notas, ubicación); **galería de fotos** (miniaturas desde `/crm/api/leads/:id/files/:fid`, clic abre en grande en un modal); atribución (página, referencia, UTMs); edición inline de campos; control de estado (selector + motivo); línea de tiempo (eventos y notas); nota nueva; eliminar (admin).
- **Tareas** (en la ficha y como vista `#tasks`): en la ficha del lead, tarjeta "Tareas" con atajos ("Llamar en 1 h", "Llamar en 3 h", "Mañana 9:00", "En 3 días") + formulario (título, fecha/hora `datetime-local`, responsable) y lista con casilla para marcar hecha, vencidas en rojo. Vista `#tasks` (ítem de menú "Tareas" con **badge** = vencidas + de hoy): lista de mis tareas abiertas agrupadas en Vencidas / Hoy / Próximas, cada fila con lead (enlace a la ficha), título, hora, botones "Hecha" y "Ver lead"; conmutador "todas / mías"; pestaña "Hechas". Tarjeta del Kanban: si el lead tiene `next_task`, mostrar un reloj con la hora ("📞 hoy 15:00"), en rojo si venció.
  **Alerta**: `webui/app.js` consulta `/api/tasks/summary` al entrar y cada 60 s; por cada tarea en `due` muestra un **aviso pequeño** en la esquina superior derecha (`.alert-task`, apilable, no desaparece solo) con "⏰ <título> — <lead>", botones "Ver lead" (va a `#lead-<id>`) y "Hecha" (PATCH done); el título de la pestaña pasa a "(n) Wyelee CRM" mientras haya vencidas. Botón en la vista Tareas "Activar avisos del navegador" que pide permiso de `Notification` y, si está concedido, también lanza una notificación del sistema al vencer.
- **Estadísticas** (`#stats`): KPIs (Leads totales, Nuevos este mes, Ganados, Tasa de cierre, Tiempo medio a cotización, SLA 24 h cumplido %, Vencidos), evolución mensual (barras creados/ganados/perdidos, últimos 6 meses), tasa de conversión por mes, por servicio, por ciudad, motivos de pérdida; filtro por mes.
- **Usuarios** y **Redirecciones**: como JKD (crear, editar, activar/desactivar, "Entrar como").
- **Integraciones** (`#integrations`, el encargo principal de esta página): 
  1. Interruptor maestro "Etiquetas activas en el sitio" + aviso "no se disparan en localhost".
  2. Tarjetas por proveedor con campo de ID y ayuda: Google Analytics 4 (`G-…`), Google Tag Manager (`GTM-…`), Google Ads (`AW-…` + etiqueta de conversión), Meta Pixel, TikTok Pixel, Microsoft Clarity, Hotjar.
  3. **Código incrustado**: tres editores (`<textarea>` monoespaciado) para "Inicio de `<head>`", "Inicio de `<body>`", "Fin de `<body>`" con ayuda de qué va en cada uno.
  4. **Fragmentos de terceros** (lista): cada fila con nombre, posición (select), activo (switch), código; botones añadir/editar/eliminar; se guardan como `snippets` JSON. Ejemplos en placeholder (chat widget, Google Reviews, Calendly…).
  5. Notificaciones: `notify_emails`, `whatsapp_number`.
  6. Botón "Guardar" (PUT `/api/settings`) con toast, y un panel lateral "Cómo funciona" explicando que el sitio lee `/api/public/site-config` y que los cambios aplican sin tocar código; muestra la URL del endpoint y un botón "Ver JSON público" (abre en pestaña nueva).

Tema visual: **claro**, marca Wyelee — fondo niebla `#F2F4F1`/blanco, texto navy `#1D153E`, acento verde `#2C933A` (botones con `#25803A` y texto blanco; texto verde pequeño `#23752E`), gris texto `#4B4668`; Nunito (títulos 800) + Nunito Sans (UI) + `ui-monospace` para IDs/código. Colores de estado: nuevo azul `#2F6FDE`, contactado ámbar `#D08A1C`, cotizado violeta `#6F5BD9`, agendado teal `#1F8E9A`, ganado verde `#2C933A`, perdido rojo `#C5362B`. Mantener las clases y estructura de `public/styles.css` de JKD (`.app`, `.sidebar`, `.nav-item`, `.topbar`, `.kanban`, `.card`, `.table`, `.detail-grid`, `.card-box`, `.field`, `.btn…`, `.modal-bg`, `.toast`) cambiando tokens y añadiendo lo nuevo (`.sla`, `.chip-service`, `.gallery`, `.snippet-row`, `.switch`, `.code`). Responsive: el sidebar colapsa a barra superior bajo 900 px.

## Integración con el sitio público (`js/analytics.js`, `js/site.js`, `_build.py`)

- `_build.py`: en `head()` añadir `<script src="{R}js/analytics.js" defer></script>` (antes de `site.js`). En los fragmentos `_src/quote.html` y `_src/contact.html` poner `data-endpoint="/api/public/lead"` (ruta absoluta; en GitHub Pages fallará y el JS caerá al WhatsApp como hoy). Reconstruir con `python _build.py` y comprobar `python _check.py` = 0 flags.
- `js/site.js` (handler `form[data-lead]`): cuando hay `data-endpoint`, enviar **JSON** (no FormData): recolectar campos por `name` (checkbox → array), `source` = `data-lead` (`quote`|`contact`), `attribution` = `{ page: location.pathname, referrer: document.referrer, utm_* y gclid leídos de la URL actual o de sessionStorage 'wy_attr' guardado en la primera página }`, y `photos` = imágenes reducidas en el navegador con canvas (lado mayor 1600 px, JPEG calidad 0.8, máximo 6, se descartan las > 10 MB originales con aviso — mismo límite que el hint del formulario y `js/quote.js`, expuesto como `window.WY_PHOTO_MAX`). En éxito: bloque de éxito actual (sin abrir WhatsApp), `window.dispatchEvent(new CustomEvent('wyelee:lead', {detail:{source}}))`. Si el fetch falla (red/404/5xx) → fallback WhatsApp actual + mensaje. Mantener el resto del comportamiento (validación, honeypot `website`).
- `js/analytics.js` (nuevo, ≈ JKD `analytics.js`): no corre en `localhost`/`127.0.0.1`/`*.github.io`; espera a la 1ª interacción o 4 s tras `load`; `fetch('/api/public/site-config')`; si `enabled`: gtag (GA4 + Ads) con `send_page_view`, GTM, Meta Pixel (`PageView`), TikTok, Clarity (`(function(c,l,a,r,i,t,y){…})(window,document,"clarity","script",ID)`), Hotjar (`hjid`); **inyecta** `custom_head` en `<head>`, `custom_body_start` al inicio de `<body>`, `custom_body_end` al final y cada snippet en su posición usando una función `injectHTML(target, html, position)` que parsea con `<template>` y **recrea los `<script>`** (copiando atributos y contenido, `async` respetado) para que se ejecuten; escucha `wyelee:lead` y dispara `gtag('event','generate_lead')`, `gtag('event','conversion',{send_to: ads_id + '/' + label})` si hay etiqueta, `fbq('track','Lead')`, `ttq.track('SubmitForm')`. Nunca lanza errores no capturados.

## Correo (`lib/email.js`)

Plantillas con la marca Wyelee (fondo blanco, cabecera navy con el wordmark en texto, botón verde `#25803A`). `sendMagicLink({to,name,link})`, `sendTaskReminder({to, task, lead, crmLink, scheduledAt?})` (asunto `⏰ Recordatorio: <title> — <lead>`; cuerpo: tarea, lead con móvil/correo como enlaces, hora de vencimiento en hora de Adelaide, botón "Abrir la ficha"; si `scheduledAt` viene, añade `scheduled_at` al payload de Resend y devuelve `{ ok, id }`), `cancelScheduledEmail(id)` y `sendLeadNotification({to, lead, files, crmLink})` — asunto `Nueva solicitud de cotización — <name> (<service>)`; cuerpo en español con tabla de datos (nombre, contacto, ubicación, servicio, artículos, condición, días/franja, add-ons, notas, fuente, canal, fecha en hora de Adelaide `Australia/Adelaide`) + fotos adjuntas + botón "Ver en el panel"; `reply_to` = correo del lead.

## Verificación mínima (lo hace el agente verificador)

1. `cd wyelee && npm install && node server.js` (puerto 8834) arranca sin errores; `GET /` sirve la home; `GET /lib/app.js` y `GET /data/…` devuelven 404 (no se exponen); `GET /crm` sirve la SPA; `GET /crm/api/me` → 401.
2. `POST /api/auth/request` con `ADMIN_EMAIL` devuelve `devLink`; `GET devLink` → 302 + cookie; con la cookie: `GET /api/me`, `/api/meta`, `/api/leads`, `/api/stats`, `/api/settings` responden 200.
3. `POST /api/public/lead` (quote con 1 foto base64 pequeña) → 201; el lead aparece en `nuevo` con `photos:1`; `GET /api/leads/:id/files/:fid` devuelve la imagen; `PATCH status` a `cotizado` fija `quoted_at`; a `perdido` sin motivo → 400.
4. `PUT /api/settings` con snippets → `GET /api/public/site-config` refleja solo los activos; `tracking_enabled` apaga todo.
4b. `POST /api/leads/:id/tasks` con `due_at` en el pasado → `GET /api/tasks/summary` la devuelve en `due` una sola vez (segunda llamada: `due:[]`, `overdue:1`); `PATCH /api/tasks/:id {done:true}` la saca de abiertas.
5. Con agent-browser: login por devLink, capturas de `#kanban`, `#lead-<id>`, `#stats`, `#integrations` a 1380 px, y del sitio `/quote/` enviando el formulario contra el server local (llega al CRM).
