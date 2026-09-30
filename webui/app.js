// ============================================================
//  Wyelee — panel del back office (vanilla JS, script clásico)
//  Arquitectura heredada de jkd-legacy-crm/public/app.js:
//  state · api() · toast · modal · hash routing · kanban por bloques · pager
// ============================================================
const $ = (s, r = document) => r.querySelector(s);
const root = $('#root');
const state = {
  me: null, meta: null, leads: [], users: [], settings: null,
  view: 'kanban', detailId: null,
  filter: 'all', fService: '', fCity: '', q: '', leadsPage: 1, kLimit: {},
  taskScope: 'mine', taskTab: 'open', summary: null,
};

// ---------- constantes (única fuente en el frontend; lib/app.js es la del backend) ----------
const STATUSES = ['nuevo', 'contactado', 'cotizado', 'agendado', 'ganado', 'perdido'];
const STATUS_LABELS = { nuevo: 'Nuevo', contactado: 'Contactado', cotizado: 'Cotizado', agendado: 'Agendado', ganado: 'Ganado', perdido: 'Perdido' };
const STATUS_COLORS = { nuevo: 'var(--blue)', contactado: 'var(--amber)', cotizado: 'var(--violet)', agendado: 'var(--teal)', ganado: 'var(--green)', perdido: 'var(--red)' };
const STATUS_META = Object.fromEntries(STATUSES.map((s) => [s, { label: STATUS_LABELS[s], color: STATUS_COLORS[s], cls: s }]));
const LOSS_REASONS = { no_responde: 'No responde', precio: 'Precio', fuera_zona: 'Fuera de zona', fecha: 'No hay fecha disponible', spam: 'Spam', otro: 'Otro' };
const SERVICES = { furniture: 'Furniture assembly', wardrobe: 'Wardrobe assembly', disassembly: 'Disassembly', kitchen: 'IKEA kitchen' };
const CONDITIONS = { new: 'New in the box', partial: 'Partially assembled', assembled: 'Already assembled' };
const ADDONS = { packaging: 'Packaging removal', anchoring: 'Wall anchoring', disassembly: 'Disassembly of old furniture' };
const DAYS = { weekdays: 'Weekdays', weekend: 'Weekend', either: 'Either' };
const TIMES = { morning: 'Morning', afternoon: 'Afternoon', either: 'Either' };
const SOURCE_LABELS = { quote: 'Cotización', contact: 'Contacto', manual: 'Manual' };
const SOURCE_SHORT = { quote: 'Web', contact: 'Contacto', manual: 'Manual' }; // etiqueta corta para la tarjeta del Kanban
const ROLES = ['admin', 'comercial'];
const ROLE_LABELS = { admin: 'Administrador', comercial: 'Comercial' };
const SLA_HOURS = 24;            // promesa del sitio: cotización en 24 h
const DEFAULT_WA = '61432470313'; // número del negocio (settings.whatsapp_number)
const ADMIN_VIEWS = ['users', 'redirects', 'integrations'];
const VIEWS = ['kanban', 'leads', 'tasks', 'stats', 'users', 'redirects', 'integrations'];
const SNIPPET_POSITIONS = { head: 'Inicio de <head>', body_start: 'Inicio de <body>', body_end: 'Fin de <body>' };

const roleLabel = (r) => ROLE_LABELS[r] || r;
const isAdmin = () => !!(state.me && state.me.role === 'admin');
// El backend manda /api/meta con los mismos diccionarios; si viene, manda él.
const lossReasons = () => (state.meta && state.meta.lossReasons) || LOSS_REASONS;
const services = () => (state.meta && state.meta.services) || SERVICES;
const lossLabel = (k) => lossReasons()[k] || k || '';
const svcLabel = (k) => services()[k] || '';

const ICON = {
  kanban: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="5" height="18" rx="1"/><rect x="9.5" y="3" width="5" height="12" rx="1"/><rect x="16" y="3" width="5" height="8" rx="1"/></svg>',
  leads: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></svg>',
  tasks: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
  stats: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="6"/><rect x="12" y="7" width="3" height="10"/><rect x="17" y="13" width="3" height="4"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  redirect: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="15 10 20 15 15 20"/><path d="M4 4v7a4 4 0 0 0 4 4h12"/></svg>',
  integrations: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0V8zM12 17v5"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/></svg>',
  out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  photo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
};

// ---------- utils ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initials = (n) => (n || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const leadName = (l) => String(l.name || '').trim() || '(sin nombre)';
const firstName = (l) => (String(l.name || '').trim().split(/\s+/)[0]) || 'there';
const pad = (n) => String(n).padStart(2, '0');
function fmtDate(iso) { if (!iso) return '—'; const d = new Date(iso); return d.toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' }); }
function fmtDateTime(iso) { if (!iso) return '—'; const d = new Date(iso); return d.toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
function fmtMonth(m) { if (!m) return '—'; const [y, mo] = String(m).split('-'); return new Date(y, mo - 1, 1).toLocaleDateString('es', { month: 'short' }).replace('.', ''); }
function fmtMonthLong(m) { if (!m) return '—'; const [y, mo] = String(m).split('-'); const d = new Date(y, mo - 1, 1).toLocaleDateString('es', { month: 'long', year: 'numeric' }); return d.charAt(0).toUpperCase() + d.slice(1); }
function fmtSize(b) { b = Number(b) || 0; return b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`; }
function fmtHours(h) { if (!isFinite(h)) return '—'; if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`; return `${h < 10 ? Math.round(h * 10) / 10 : Math.round(h)} h`; }
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
// "hoy 15:00" · "mañana 09:00" · "12 ene 10:00"
function fmtDue(iso) {
  if (!iso) return '—';
  const d = new Date(iso), now = new Date(), tom = new Date(now); tom.setDate(now.getDate() + 1);
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (sameDay(d, now)) return `hoy ${hm}`;
  if (sameDay(d, tom)) return `mañana ${hm}`;
  return `${d.toLocaleDateString('es', { day: '2-digit', month: 'short' }).replace('.', '')} ${hm}`;
}
function toLocalInput(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function hoursOpen(l) { if (typeof l.hours_open === 'number') return l.hours_open; return (Date.now() - new Date(l.created_at).getTime()) / 36e5; }
// Badge de SLA: en 'nuevo' cuenta las horas que quedan de la promesa de 24 h; después, cuánto tardó la cotización.
function slaHTML(l) {
  if (l.status === 'nuevo') {
    const left = SLA_HOURS - hoursOpen(l);
    return left > 0
      ? `<span class="sla ok" title="Promesa del sitio: cotización en 24 h">Cotizar en ${Math.max(1, Math.ceil(left))}h</span>`
      : `<span class="sla late" title="Lleva más de 24 h sin cotizar">Vencido +${Math.floor(-left)}h</span>`;
  }
  if (l.quoted_at && l.created_at) {
    const h = (new Date(l.quoted_at) - new Date(l.created_at)) / 36e5;
    return `<span class="sla ${h <= SLA_HOURS ? 'ok' : 'late'}" title="Tiempo hasta la cotización">Cotizado en ${fmtHours(h)}</span>`;
  }
  return '';
}
// WhatsApp/SMS necesitan solo dígitos con prefijo país. Normaliza móviles AU (04xx → 614xx).
function waNumber(m) { let d = String(m || '').replace(/\D/g, ''); if (!d) return ''; if (d.startsWith('0')) d = '61' + d.slice(1); else if (!d.startsWith('61')) d = '61' + d; return d; }
function locLabel(l) { const a = [l.suburb, l.postcode].filter(Boolean).join(' '); const b = l.city || ''; return [a, b].filter(Boolean).join(', ') || '—'; }
function addonsArr(l) { const a = l.addons; if (Array.isArray(a)) return a; return String(a || '').split(',').map((x) => x.trim()).filter(Boolean); }
function chipService(l) {
  if (!l.service) return `<span class="chip-service contact">${l.source === 'contact' ? 'Contacto' : 'Sin servicio'}</span>`;
  return `<span class="chip-service ${esc(l.service)}">${esc(svcLabel(l.service) || l.service)}</span>`;
}
const leadSearchText = (l) => [l.name, l.email, l.mobile, l.suburb, l.postcode, l.city, l.items].map((x) => x || '').join(' ').toLowerCase();
// Usuarios asignables: la lista de /api/users (admin) o, si el comercial no puede verla, al menos yo mismo
function usersForSelect() { const list = state.users.slice(); if (state.me && !list.some((u) => u.id === state.me.id)) list.unshift({ id: state.me.id, name: state.me.name }); return list; }
function ownerOptions(selectedId) {
  return ['<option value="">Sin asignar</option>', ...usersForSelect().map((u) => `<option value="${u.id}" ${u.id === selectedId ? 'selected' : ''}>${esc(u.name)}</option>`)].join('');
}
const statusPill = (st) => `<span class="status-pill st-${esc(st)}"><i class="dot"></i>${esc(STATUS_LABELS[st] || st)}</span>`;

const API_BASE = '/crm'; // el panel y su API cuelgan de /crm en el mismo dominio del sitio
const fileURL = (leadId, fid) => `${API_BASE}/api/leads/${Number(leadId)}/files/${Number(fid)}`;
async function api(method, path, body) {
  const opt = { method, headers: {} };
  if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  const res = await fetch(API_BASE + path, opt);
  if (res.status === 401) { state.me = null; stopPolling(); renderLogin(); throw new Error('unauth'); }
  const data = (res.headers.get('content-type') || '').includes('json') ? await res.json() : null;
  if (!res.ok) throw new Error((data && data.error) || res.statusText);
  return data;
}
let toastT;
function toast(msg, type = 'ok') {
  const t = $('#toast'); t.textContent = msg; t.className = `toast show ${type}`;
  clearTimeout(toastT); toastT = setTimeout(() => (t.className = 'toast'), 2600);
}

// ============================================================
//  LOGIN (solo magic link)
// ============================================================
function renderLogin() {
  stopPolling();
  document.title = 'Wyelee · Panel';
  const expired = location.hash === '#expired';
  const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  root.innerHTML = `
  <div class="login-wrap">
    <div class="login-card">
      <div class="login-logo"><img src="assets/logo.svg" alt="Wyelee"><span class="tag">Panel de cotizaciones</span></div>
      <h1>Acceso al panel</h1>
      <p class="sub">Escribe tu correo y te enviamos un enlace de acceso. Sin contraseñas.</p>
      ${expired ? '<div class="login-alert">El enlace caducó o ya se usó. Pide uno nuevo.</div>' : ''}
      <form id="login-form">
        <div class="field">
          <label>Correo electrónico</label>
          <input type="email" id="email" placeholder="tu@wyeleeassembly.com.au" required autocomplete="email">
        </div>
        <button class="btn btn-primary" style="width:100%" type="submit">Enviar enlace de acceso</button>
      </form>
      <div id="magic-out"></div>
      ${local ? '<p class="login-note">Entorno local: sin <code>RESEND_API_KEY</code> el enlace no se envía por correo; aparece aquí abajo y en la consola del servidor.</p>' : ''}
    </div>
  </div>`;

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    const email = $('#email').value.trim();
    btn.disabled = true; btn.textContent = 'Enviando…';
    try {
      const r = await api('POST', '/api/auth/request', { email });
      // Mensaje neutro siempre — no revela si el correo existe.
      let h = '<div class="magic-result"><b>Revisa tu correo</b><p>Si el correo está registrado, te enviamos un enlace de acceso válido por 15 minutos y de un solo uso.</p>';
      if (r && r.devLink) h += `<span class="devtag" style="display:block;margin-bottom:8px">Modo local (sin correo)</span><a class="btn btn-primary btn-sm" href="${esc(r.devLink)}">Entrar al panel →</a>`;
      $('#magic-out').innerHTML = h + '</div>';
    } catch (err) { toast('No se pudo solicitar el enlace', 'err'); }
    btn.disabled = false; btn.textContent = 'Enviar enlace de acceso';
  });
}

// ============================================================
//  APP SHELL
// ============================================================
function renderApp() {
  const navItems = [
    ['kanban', 'Pipeline', ICON.kanban],
    ['leads', 'Leads', ICON.leads],
    ['tasks', 'Tareas', ICON.tasks],
    ['stats', 'Estadísticas', ICON.stats],
    ['users', 'Usuarios', ICON.users],
    ['redirects', 'Redirecciones', ICON.redirect],
    ['integrations', 'Integraciones', ICON.integrations],
  ].filter(([k]) => isAdmin() || !ADMIN_VIEWS.includes(k));
  // Bloquea el acceso directo del comercial a vistas restringidas (y corrige el hash para que Atrás/F5 no vuelvan a intentarlo)
  if (!isAdmin() && ADMIN_VIEWS.includes(state.view)) {
    state.view = 'kanban';
    if (location.hash && location.hash !== '#kanban') { try { history.replaceState(null, '', '#kanban'); } catch (e) {} }
  }
  root.innerHTML = `
  <div class="app">
    <aside class="sidebar" id="sidebar">
      <div class="side-top">
        <a class="side-logo" href="#kanban"><img src="assets/logo.svg" alt="Wyelee"><span>Panel</span></a>
        <button class="menu-btn" id="menu-btn" aria-label="Menú" aria-expanded="false">${ICON.menu}</button>
      </div>
      <nav id="nav">
        ${navItems.map(([k, label, icon]) => `
          <button class="nav-item ${state.view === k || (state.view === 'leadDetail' && k === 'leads') ? 'active' : ''}" data-view="${k}">
            ${icon}<span>${label}</span>${k === 'leads' ? '<span class="badge" id="badge-leads"></span>' : k === 'tasks' ? '<span class="badge" id="badge-tasks"></span>' : ''}
          </button>`).join('')}
      </nav>
      <div class="side-foot">
        <div class="side-user">
          <span class="avatar">${initials(state.me.name)}</span>
          <span><span class="nm">${esc(state.me.name)}</span><span class="rl">${roleLabel(state.me.role)}</span></span>
        </div>
        <button class="nav-item" id="logout">${ICON.out}<span>Cerrar sesión</span></button>
      </div>
    </aside>
    <main class="main">
      ${state.me.impersonating ? `<div class="imp-bar">
        <span class="imp-msg">${ICON.eye} Estás viendo el panel como <b>${esc(state.me.name)}</b> · ${roleLabel(state.me.role)}</span>
        <button class="btn btn-sm imp-back" id="stop-imp">Volver a ${esc(state.me.impersonating.name)} →</button>
      </div>` : ''}
      <div id="view"></div>
    </main>
  </div>
  <div class="modal-bg" id="modal"></div>`;

  $('#nav').addEventListener('click', (e) => {
    const b = e.target.closest('.nav-item'); if (!b) return;
    $('#sidebar').classList.remove('open');
    // La vista vive en el hash → al recargar (F5) se mantiene y Atrás funciona
    if (location.hash === '#' + b.dataset.view) { state.view = b.dataset.view; renderApp(); }
    else location.hash = b.dataset.view;
  });
  $('#menu-btn').addEventListener('click', () => { const sb = $('#sidebar'); const open = sb.classList.toggle('open'); $('#menu-btn').setAttribute('aria-expanded', String(open)); });
  $('#logout').addEventListener('click', async () => { try { await api('POST', '/api/auth/logout'); } catch (e) {} location.reload(); });
  const stopImp = $('#stop-imp');
  if (stopImp) stopImp.addEventListener('click', async () => {
    try { await api('POST', '/api/auth/stop-impersonate'); location.reload(); }
    catch (e) { toast('No se pudo volver a tu cuenta', 'err'); }
  });

  $('#badge-leads').textContent = state.leads.length || '';
  paintTaskBadge();
  const views = { kanban: viewKanban, leads: viewLeads, tasks: viewTasks, stats: viewStats, users: viewUsers, redirects: viewRedirects, integrations: viewIntegrations, leadDetail: () => viewLeadDetail(state.detailId) };
  (views[state.view] || viewKanban)();
}

// ============================================================
//  KANBAN (Pipeline)
// ============================================================
async function viewKanban() {
  const v = $('#view');
  v.innerHTML = `
    <div class="topbar">
      <div><span class="ey">Pipeline de cotizaciones</span><h1>De la solicitud al montaje</h1></div>
      <div class="tools">
        <div class="search">${ICON.search}<input id="k-search" placeholder="Buscar nombre, suburb, móvil…" value="${esc(state.q)}"></div>
        <button class="btn btn-ghost btn-sm" id="new-lead">+ Lead manual</button>
      </div>
    </div>
    <div class="kanban" id="kanban"></div>`;

  $('#new-lead').addEventListener('click', openNewLead);
  $('#k-search').addEventListener('input', (e) => { state.q = e.target.value; paintKanban(); });
  await loadLeads();
  paintKanban();
}

const KANBAN_BLOCK = 10; // los leads se cargan en bloques de 10 por columna

function paintKanban() {
  const board = $('#kanban'); if (!board) return;
  const q = state.q.trim().toLowerCase();
  const leads = state.leads.filter((l) => !q || leadSearchText(l).includes(q));
  board.innerHTML = STATUSES.map((st) => {
    const items = leads.filter((l) => l.status === st);
    const m = STATUS_META[st];
    return `
    <div class="col" data-status="${st}">
      <div class="col-head">
        <span class="col-dot" style="background:${m.color}"></span>
        <h3>${m.label}</h3><span class="cnt">${items.length}</span>
      </div>
      <div class="col-body" data-status="${st}">${colBodyHTML(st, items)}</div>
    </div>`;
  }).join('');
  wireDnD();
  board.querySelectorAll('.card').forEach((c) => c.addEventListener('click', () => { if (!c.dataset.dragged) openLead(Number(c.dataset.id)); }));
  wireKanbanMore(board, leads);
}

// Renderiza solo los primeros N (bloque) de una columna + botón "ver más"
function colBodyHTML(st, items) {
  if (!items.length) return `<div class="col-empty">—</div>`;
  const limit = state.kLimit[st] || KANBAN_BLOCK;
  const shown = items.slice(0, limit);
  const rest = items.length - shown.length;
  const more = rest > 0
    ? `<button class="col-more" data-status="${st}">↓ Ver ${Math.min(KANBAN_BLOCK, rest)} más · ${rest} restante${rest === 1 ? '' : 's'}</button>`
    : '';
  return shown.map(cardHTML).join('') + more;
}

// Botón "ver 10 más" + carga incremental al llegar al final del scroll de cada columna
function wireKanbanMore(board, leads) {
  const bump = (st) => {
    const total = leads.filter((l) => l.status === st).length;
    const cur = state.kLimit[st] || KANBAN_BLOCK;
    if (cur >= total) return;
    state.kLimit[st] = cur + KANBAN_BLOCK;
    const scrolls = {};
    board.querySelectorAll('.col-body').forEach((b) => (scrolls[b.dataset.status] = b.scrollTop));
    paintKanban();
    const nb = $('#kanban');
    nb && nb.querySelectorAll('.col-body').forEach((b) => { if (scrolls[b.dataset.status] != null) b.scrollTop = scrolls[b.dataset.status]; });
  };
  board.querySelectorAll('.col-more').forEach((btn) =>
    btn.addEventListener('click', (e) => { e.stopPropagation(); bump(btn.dataset.status); }));
  board.querySelectorAll('.col-body').forEach((body) =>
    body.addEventListener('scroll', () => {
      if (body.scrollTop + body.clientHeight >= body.scrollHeight - 56) bump(body.dataset.status);
    }));
}

function cardHTML(l) {
  const loss = l.status === 'perdido' && l.loss_reason ? `<span class="chip loss" title="Motivo de pérdida: ${esc(lossLabel(l.loss_reason))}">${esc(lossLabel(l.loss_reason))}</span>` : '';
  const loc = [l.suburb, l.postcode].filter(Boolean).join(' ') || l.city || '—';
  const nt = l.next_task
    ? `<span class="tk-clock ${new Date(l.next_task.due_at) < new Date() ? 'late' : ''}" title="${esc(l.next_task.title)}">📞 ${fmtDue(l.next_task.due_at)}</span>`
    : '';
  return `
  <div class="card" draggable="true" data-id="${l.id}">
    <div class="nm" title="${esc(leadName(l))}">${esc(leadName(l))}</div>
    <div class="tags">${chipService(l)}${l.status === 'nuevo' ? slaHTML(l) : ''}${loss}</div>
    <div class="meta"><span title="${esc(locLabel(l))}">${esc(loc)}</span><span>${fmtDate(l.created_at)}</span>${l.photos ? `<span class="photos-n" title="${l.photos} foto${l.photos === 1 ? '' : 's'}">${ICON.photo}${l.photos}</span>` : ''}</div>
    ${nt ? `<div class="meta">${nt}</div>` : ''}
    <div class="foot">
      <span class="own">${l.owner_name ? `<span class="av">${initials(l.owner_name)}</span><span class="own-nm">${esc(l.owner_name.split(' ')[0])}</span>` : '<span class="own-nm" style="color:var(--mute)">Sin asignar</span>'}</span>
      <span class="src" title="${esc(SOURCE_LABELS[l.source] || l.source || '')}">${esc(SOURCE_SHORT[l.source] || l.source || '')}</span>
    </div>
  </div>`;
}

function wireDnD() {
  let dragId = null;
  document.querySelectorAll('.card').forEach((card) => {
    card.addEventListener('dragstart', (e) => { dragId = Number(card.dataset.id); card.classList.add('dragging'); card.dataset.dragged = '1'; e.dataTransfer.effectAllowed = 'move'; });
    card.addEventListener('dragend', () => { card.classList.remove('dragging'); setTimeout(() => delete card.dataset.dragged, 50); });
  });
  document.querySelectorAll('.col').forEach((col) => {
    col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drop'); });
    col.addEventListener('dragleave', () => col.classList.remove('drop'));
    col.addEventListener('drop', async (e) => {
      e.preventDefault(); col.classList.remove('drop');
      const status = col.dataset.status;
      const lead = state.leads.find((l) => l.id === dragId);
      if (!lead || lead.status === status) return;
      if (status === 'perdido') openLossModal(async (reason) => { await changeStatus(dragId, 'perdido', reason); });
      else await changeStatus(dragId, status);
    });
  });
}

async function changeStatus(id, status, loss_reason) {
  try {
    await api('PATCH', `/api/leads/${id}/status`, { status, loss_reason });
    await loadLeads();
    if (state.view === 'kanban') paintKanban();
    else if (state.view === 'leads') paintLeads();
    else if (state.view === 'leadDetail') viewLeadDetail(id);
    toast(`Lead → ${STATUS_LABELS[status] || status}`);
  } catch (e) { if (e.message !== 'unauth') toast('No se pudo actualizar', 'err'); }
}

// ============================================================
//  LEADS (tabla)
// ============================================================
async function viewLeads() {
  const v = $('#view');
  v.innerHTML = `
    <div class="topbar">
      <div><span class="ey">Base de datos</span><h1>Leads</h1></div>
      <div class="tools">
        <div class="search">${ICON.search}<input id="l-search" placeholder="Buscar nombre, correo, móvil…" value="${esc(state.q)}"></div>
        <button class="btn btn-ghost btn-sm" id="new-lead">+ Lead manual</button>
      </div>
    </div>
    <div class="filters" id="filters">
      ${['all', ...STATUSES].map((f) => `<button class="fbtn ${state.filter === f ? 'active' : ''}" data-f="${f}">${f === 'all' ? 'Todos' : STATUS_LABELS[f]}</button>`).join('')}
      <span class="spacer"></span>
      <select class="sel" id="fl-service" title="Filtrar por servicio"></select>
      <select class="sel" id="fl-city" title="Filtrar por ciudad"></select>
    </div>
    <div class="panel"><div id="leads-table"></div></div>`;

  $('#new-lead').addEventListener('click', openNewLead);
  $('#filters').addEventListener('click', (e) => { const b = e.target.closest('.fbtn'); if (!b) return; state.filter = b.dataset.f; state.leadsPage = 1; $('#filters').querySelectorAll('.fbtn').forEach((x) => x.classList.toggle('active', x === b)); paintLeads(); });
  $('#l-search').addEventListener('input', (e) => { state.q = e.target.value; state.leadsPage = 1; paintLeads(); });
  $('#fl-service').addEventListener('change', (e) => { state.fService = e.target.value; state.leadsPage = 1; paintLeads(); });
  $('#fl-city').addEventListener('change', (e) => { state.fCity = e.target.value; state.leadsPage = 1; paintLeads(); });
  await loadLeads();
  paintFilterSelects();
  paintLeads();
}

function paintFilterSelects() {
  const fs = $('#fl-service'), fc = $('#fl-city'); if (!fs || !fc) return;
  fs.innerHTML = ['<option value="">Todos los servicios</option>', ...Object.entries(services()).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`), '<option value="contact">Solo contacto (sin servicio)</option>'].join('');
  fs.value = state.fService;
  const cities = [...new Set(state.leads.map((l) => String(l.city || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  fc.innerHTML = ['<option value="">Todas las ciudades</option>', ...cities.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`)].join('');
  fc.value = cities.includes(state.fCity) ? state.fCity : '';
  if (fc.value !== state.fCity) state.fCity = '';
}

const LEADS_PER_PAGE = 20; // tamaño de página de la tabla de leads

function filteredLeads() {
  const q = state.q.trim().toLowerCase();
  return state.leads.filter((l) =>
    (state.filter === 'all' || l.status === state.filter) &&
    (!state.fService || (state.fService === 'contact' ? !l.service : l.service === state.fService)) &&
    (!state.fCity || String(l.city || '').trim() === state.fCity) &&
    (!q || leadSearchText(l).includes(q)));
}

function paintLeads() {
  const wrap = $('#leads-table'); if (!wrap) return;
  const rows = filteredLeads();
  if (!rows.length) { wrap.innerHTML = `<div class="empty"><div class="big">Sin leads</div>No hay registros con este filtro.</div>`; return; }

  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / LEADS_PER_PAGE));
  state.leadsPage = Math.min(Math.max(1, state.leadsPage), pages);
  const start = (state.leadsPage - 1) * LEADS_PER_PAGE;
  const pageRows = rows.slice(start, start + LEADS_PER_PAGE);

  wrap.innerHTML = `<table><thead><tr>
    <th>Nombre</th><th>Contacto</th><th>Servicio</th><th>Ciudad / suburb</th><th>Estado</th><th>Fotos</th><th>Creado</th><th>Responsable</th>
    </tr></thead><tbody>
    ${pageRows.map((l) => `<tr data-id="${l.id}">
      <td><span class="lead-nm">${esc(leadName(l))}</span><span class="sub">${esc(SOURCE_LABELS[l.source] || l.source || '')}</span></td>
      <td>${esc(l.mobile || '—')}<span class="sub">${esc(l.email || '')}</span></td>
      <td>${chipService(l)}</td>
      <td>${esc(l.city || '—')}<span class="sub">${esc([l.suburb, l.postcode].filter(Boolean).join(' '))}</span></td>
      <td>${statusPill(l.status)}
        ${l.status === 'nuevo' ? `<span class="sub" style="margin-top:4px">${slaHTML(l)}</span>` : ''}
        ${l.status === 'perdido' && l.loss_reason ? `<span class="sub">${esc(lossLabel(l.loss_reason))}</span>` : ''}</td>
      <td>${l.photos ? `<span class="photos-n">${ICON.photo}${l.photos}</span>` : '<span style="color:var(--mute)">—</span>'}</td>
      <td class="nowrap" title="${fmtDateTime(l.created_at)}">${fmtDate(l.created_at)}</td>
      <td>${l.owner_name ? esc(l.owner_name) : '<span style="color:var(--mute)">—</span>'}</td>
    </tr>`).join('')}
  </tbody></table>${leadsPager(state.leadsPage, pages, total, start, pageRows.length)}`;

  wrap.querySelectorAll('tr[data-id]').forEach((tr) => tr.addEventListener('click', () => openLead(Number(tr.dataset.id))));
  const pager = wrap.querySelector('.pager');
  if (pager) pager.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-pg]'); if (!b || b.disabled) return;
    const v = b.dataset.pg;
    state.leadsPage = v === 'prev' ? state.leadsPage - 1 : v === 'next' ? state.leadsPage + 1 : Number(v);
    paintLeads();
  });
}

// Ventana de números de página (con elipsis cuando hay muchas)
function pageWindow(cur, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out = [1];
  let lo = Math.max(2, cur - 1), hi = Math.min(pages - 1, cur + 1);
  if (cur <= 3) { lo = 2; hi = 4; }
  if (cur >= pages - 2) { lo = pages - 3; hi = pages - 1; }
  if (lo > 2) out.push('…');
  for (let i = lo; i <= hi; i++) out.push(i);
  if (hi < pages - 1) out.push('…');
  out.push(pages);
  return out;
}

function leadsPager(page, pages, total, start, count) {
  const from = total ? start + 1 : 0, to = start + count;
  const caption = `<span class="pager-count">Mostrando <b>${from}–${to}</b> de <b>${total}</b></span>`;
  if (pages <= 1) return `<div class="pager">${caption}</div>`;
  const nums = pageWindow(page, pages).map((n) => n === '…'
    ? `<span class="pager-gap">…</span>`
    : `<button class="pager-pg${n === page ? ' active' : ''}" data-pg="${n}">${n}</button>`).join('');
  return `<div class="pager">
    ${caption}
    <div class="pager-ctrl">
      <button class="pager-pg" data-pg="prev"${page === 1 ? ' disabled' : ''}>‹</button>
      ${nums}
      <button class="pager-pg" data-pg="next"${page === pages ? ' disabled' : ''}>›</button>
    </div>
  </div>`;
}

// ============================================================
//  FICHA DEL LEAD (#lead-<id>)
// ============================================================
function openLead(id) {
  if (location.hash === `#lead-${id}`) { state.detailId = id; state.view = 'leadDetail'; renderApp(); }
  else location.hash = `lead-${id}`;
}
function backToLeads() {
  if (location.hash === '#leads') { state.view = 'leads'; renderApp(); }
  else location.hash = 'leads';
}

// Plantillas en inglés para el cliente final (WhatsApp / SMS / correo)
function msgTemplates(l) {
  const svc = (svcLabel(l.service) || 'assembly').toLowerCase();
  const where = l.suburb ? ` in ${l.suburb}` : '';
  const n = firstName(l);
  const phone = '+' + ((state.settings && state.settings.whatsapp_number) || DEFAULT_WA);
  return [
    { key: 'intro', label: 'Primer contacto', text: `Hi ${n}, this is Wyelee about your ${svc} quote${where}. Thanks for getting in touch! When is a good time to call you so we can confirm the details and send your quote?` },
    { key: 'quote', label: 'Enviar cotización', text: `Hi ${n}, this is Wyelee. Here is your quote for the ${svc}${where}: $____. It includes assembly, clean-up and a final stability check. Reply YES to book a time, or let us know if you have any questions.` },
    { key: 'followup', label: 'Seguimiento', text: `Hi ${n}, just following up on the ${svc} quote we sent. Would you like to lock in a date? We usually have availability this week. Thanks, Wyelee` },
    { key: 'confirm', label: 'Confirmar visita', text: `Hi ${n}, this is Wyelee confirming your ${svc} appointment. We'll message you when we're on the way. If anything changes, you can reach us on ${phone}. See you soon!` },
  ];
}

async function loadLeadTasks(leadId) {
  try { const all = await api('GET', '/api/tasks?scope=all&state=all'); return (all || []).filter((t) => Number(t.lead_id) === Number(leadId)); }
  catch (e) { return []; }
}
function presetDue(k) {
  const d = new Date();
  if (k === '1h') d.setHours(d.getHours() + 1);
  else if (k === '3h') d.setHours(d.getHours() + 3);
  else if (k === 'tomorrow') { d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); }
  else if (k === '3d') { d.setDate(d.getDate() + 3); d.setHours(9, 0, 0, 0); }
  d.setSeconds(0, 0);
  return d;
}
async function createTask(leadId, body) {
  try { await api('POST', `/api/leads/${leadId}/tasks`, body); toast('Recordatorio creado'); return true; }
  catch (e) { if (e.message !== 'unauth') toast('No se pudo crear la tarea', 'err'); return false; }
}

async function viewLeadDetail(id) {
  const v = $('#view');
  v.innerHTML = `<div class="empty">Cargando…</div>`;
  let lead;
  try { lead = await api('GET', `/api/leads/${id}`); }
  catch (e) {
    if (e.message === 'unauth') return;
    v.innerHTML = `<div class="empty"><div class="big">Lead no encontrado</div><button class="btn btn-ghost btn-sm" id="back" style="margin-top:14px">← Volver a Leads</button></div>`;
    $('#back').addEventListener('click', backToLeads); return;
  }
  let tasks = Array.isArray(lead.tasks) ? lead.tasks : await loadLeadTasks(id);
  const tpls = msgTemplates(lead);
  const files = lead.files || [];
  const isContact = !lead.service && lead.source === 'contact';

  v.innerHTML = `
    <div class="topbar">
      <div>
        <button class="backlink" id="back">← Volver a Leads</button>
        <h1 style="margin-top:6px">${esc(leadName(lead))}</h1>
        <div class="detail-sub">
          ${statusPill(lead.status)}
          ${slaHTML(lead)}
          ${chipService(lead)}
          <span class="sep">·</span><span>${esc(SOURCE_LABELS[lead.source] || lead.source || '')}</span>
          <span class="sep">·</span><span>Recibido ${fmtDateTime(lead.created_at)}</span>
          <span class="sep">·</span><span class="mono">#${Number(lead.id)}</span>
        </div>
      </div>
      <div class="tools">${isAdmin() ? '<button class="btn btn-ghost btn-sm danger" id="del">Eliminar</button>' : ''}</div>
    </div>

    <div class="detail-grid">
      <div class="detail-main">
        ${quoteCardHTML(lead, isContact)}

        <div class="card-box">
          <div class="section-t">Fotos del cliente ${files.length ? `<span class="cnt">${files.length}</span>` : ''}</div>
          ${galleryHTML(lead)}
        </div>

        ${editCardHTML(lead)}

        <div class="card-box">
          <div class="section-t">Actividad</div>
          <div class="timeline" id="timeline">${timelineHTML(lead)}</div>
          <div class="note-add">
            <input id="note" placeholder="Añadir nota…">
            <button class="btn btn-ghost btn-sm" id="note-btn">Añadir</button>
          </div>
        </div>
      </div>

      <aside class="detail-side">
        <div class="card-box">
          <div class="section-t">Estado en el pipeline</div>
          <div class="status-select" id="status-sel">
            ${STATUSES.map((s) => `<button class="ss ${s} ${lead.status === s ? 'active' : ''}" data-s="${s}">${STATUS_LABELS[s]}</button>`).join('')}
          </div>
          ${lead.status === 'perdido' && lead.loss_reason ? `<p class="loss-note">Motivo de pérdida: <b>${esc(lossLabel(lead.loss_reason))}</b></p>` : ''}
          ${lead.quoted_at ? `<p class="help" style="margin-top:10px">Cotizado el ${fmtDateTime(lead.quoted_at)}.</p>` : ''}
        </div>

        <div class="card-box">
          <div class="section-t">Acciones rápidas</div>
          <div class="field"><label>Plantilla (en inglés, editable)</label>
            <select id="qa-tpl">${tpls.map((t, i) => `<option value="${i}">${esc(t.label)}</option>`).join('')}</select>
          </div>
          <textarea id="qa-text" class="qa-text" rows="4">${esc(tpls[0].text)}</textarea>
          <div class="qa-grid">
            <a class="btn btn-primary btn-sm" id="qa-wa" target="_blank" rel="noopener noreferrer">WhatsApp</a>
            <a class="btn btn-ghost btn-sm" id="qa-sms">SMS</a>
            <a class="btn btn-ghost btn-sm" id="qa-call">Llamar</a>
            <a class="btn btn-ghost btn-sm" id="qa-mail">Correo</a>
          </div>
          <button class="btn btn-ghost btn-sm" id="qa-copy" style="width:100%">Copiar mensaje</button>
          ${!lead.mobile ? '<p class="help" style="margin-top:8px">Este lead no dejó móvil: WhatsApp, SMS y llamada no están disponibles.</p>' : ''}
        </div>

        <div class="card-box" id="tasks-card">${leadTasksCardHTML(lead, tasks)}</div>

        <div class="card-box">
          <div class="section-t">Origen y atribución</div>
          ${attrHTML(lead)}
        </div>
      </aside>
    </div>`;

  $('#back').addEventListener('click', backToLeads);
  const del = $('#del');
  if (del) del.addEventListener('click', async () => {
    if (!confirm('¿Eliminar este lead permanentemente? Se borran también sus fotos y su historial.')) return;
    try { await api('DELETE', `/api/leads/${id}`); await loadLeads(); toast('Lead eliminado'); backToLeads(); }
    catch (e) { if (e.message !== 'unauth') toast('No se pudo eliminar', 'err'); }
  });
  $('#status-sel').addEventListener('click', (e) => {
    const b = e.target.closest('.ss'); if (!b) return;
    const s = b.dataset.s; if (s === lead.status) return;
    if (s === 'perdido') openLossModal((reason) => changeStatus(id, 'perdido', reason));
    else changeStatus(id, s);
  });

  // ----- acciones rápidas: la plantilla alimenta los enlaces de WhatsApp / SMS / correo -----
  const setHref = (a, href) => { if (!a) return; if (href) { a.href = href; a.classList.remove('disabled'); a.removeAttribute('aria-disabled'); } else { a.removeAttribute('href'); a.classList.add('disabled'); a.setAttribute('aria-disabled', 'true'); } };
  const syncQA = () => {
    const text = $('#qa-text').value;
    const wa = waNumber(lead.mobile);
    setHref($('#qa-wa'), wa ? `https://wa.me/${wa}?text=${encodeURIComponent(text)}` : '');
    setHref($('#qa-sms'), wa ? `sms:+${wa}?&body=${encodeURIComponent(text)}` : '');
    setHref($('#qa-call'), wa ? `tel:+${wa}` : '');
    setHref($('#qa-mail'), lead.email ? `mailto:${lead.email}?subject=${encodeURIComponent('Your Wyelee assembly quote')}&body=${encodeURIComponent(text)}` : '');
  };
  $('#qa-tpl').addEventListener('change', (e) => { $('#qa-text').value = tpls[Number(e.target.value)].text; syncQA(); });
  $('#qa-text').addEventListener('input', syncQA);
  $('#qa-copy').addEventListener('click', () => {
    navigator.clipboard.writeText($('#qa-text').value).then(() => toast('Mensaje copiado')).catch(() => toast('No se pudo copiar', 'err'));
  });
  syncQA();

  // ----- galería -----
  v.querySelectorAll('.gallery .ph').forEach((b) => b.addEventListener('click', () => openViewer(lead, Number(b.dataset.ph))));

  // ----- edición inline -----
  $('#save').addEventListener('click', async () => {
    const val = (sel) => { const el = $(sel); return el ? el.value.trim() : ''; };
    const body = {
      name: val('#f-name'), email: val('#f-email'), mobile: val('#f-mobile'),
      suburb: val('#f-suburb'), postcode: val('#f-postcode'), city: val('#f-city'),
      service: val('#f-service') || null, condition: val('#f-condition') || null,
      days: val('#f-days') || null, time: val('#f-time') || null,
      addons: [...v.querySelectorAll('input[name="f-addon"]:checked')].map((c) => c.value).join(','),
      items: $('#f-items').value, notes: $('#f-notes').value,
      owner_id: val('#f-owner') ? Number(val('#f-owner')) : null,
    };
    if (!body.mobile && !body.email) { toast('Hace falta móvil o correo', 'err'); return; }
    if (body.postcode && !/^\d{4}$/.test(body.postcode)) { toast('El postcode son 4 dígitos', 'err'); return; }
    try { await api('PATCH', `/api/leads/${id}`, body); await loadLeads(); toast('Cambios guardados'); viewLeadDetail(id); }
    catch (e) { if (e.message !== 'unauth') toast('Error al guardar', 'err'); }
  });

  // ----- notas -----
  const refreshTimeline = async () => {
    try { const fresh = await api('GET', `/api/leads/${id}`); lead.events = fresh.events; const tl = $('#timeline'); if (tl) tl.innerHTML = timelineHTML(lead); } catch (e) {}
  };
  const addNote = async () => {
    const note = $('#note').value.trim(); if (!note) return;
    try { await api('POST', `/api/leads/${id}/note`, { note }); $('#note').value = ''; toast('Nota añadida'); refreshTimeline(); }
    catch (e) { if (e.message !== 'unauth') toast('Error', 'err'); }
  };
  $('#note-btn').addEventListener('click', addNote);
  $('#note').addEventListener('keydown', (e) => { if (e.key === 'Enter') addNote(); });

  // ----- tareas del lead (delegación: la tarjeta se repinta tras cada cambio) -----
  const tasksCard = $('#tasks-card');
  const refreshTasks = async () => { tasks = await loadLeadTasks(id); if ($('#tasks-card')) $('#tasks-card').innerHTML = leadTasksCardHTML(lead, tasks); refreshTimeline(); pollTasks(); };
  tasksCard.addEventListener('click', async (e) => {
    const p = e.target.closest('[data-preset]');
    if (p) {
      const ok = await createTask(id, { title: `Llamar a ${firstName(lead)}`, due_at: presetDue(p.dataset.preset).toISOString(), user_id: state.me.id });
      if (ok) await refreshTasks();
      return;
    }
    if (e.target.closest('#t-add')) {
      const title = $('#t-title').value.trim(), dueV = $('#t-due').value, uid = $('#t-user').value;
      if (!title) { toast('Escribe el título de la tarea', 'err'); return; }
      if (!dueV || isNaN(new Date(dueV))) { toast('Elige fecha y hora', 'err'); return; }
      const ok = await createTask(id, { title, due_at: new Date(dueV).toISOString(), user_id: uid ? Number(uid) : null });
      if (ok) await refreshTasks();
      return;
    }
    const d = e.target.closest('[data-del]');
    if (d) {
      if (!confirm('¿Eliminar esta tarea?')) return;
      try { await api('DELETE', `/api/tasks/${Number(d.dataset.del)}`); removeAlert(d.dataset.del); toast('Tarea eliminada'); }
      catch (err) { if (err.message !== 'unauth') toast('No se pudo eliminar', 'err'); }
      await refreshTasks();
    }
  });
  tasksCard.addEventListener('change', async (e) => {
    const cb = e.target.closest('input[data-task]'); if (!cb) return;
    try { await api('PATCH', `/api/tasks/${Number(cb.dataset.task)}`, { done: cb.checked }); if (cb.checked) removeAlert(cb.dataset.task); toast(cb.checked ? 'Tarea hecha' : 'Tarea reabierta'); }
    catch (err) { if (err.message !== 'unauth') toast('No se pudo actualizar', 'err'); }
    await refreshTasks();
  });
}

// Datos de la cotización (o el mensaje de contacto)
function quoteCardHTML(lead, isContact) {
  const tel = waNumber(lead.mobile);
  const addons = addonsArr(lead).map((k) => ADDONS[k] || k);
  const contactRows = `
    <div class="kv-row"><span class="k">Móvil</span>${lead.mobile ? `<a class="v" href="tel:+${esc(tel)}">${esc(lead.mobile)}</a>` : '<span class="v">—</span>'}</div>
    <div class="kv-row"><span class="k">Correo</span>${lead.email ? `<a class="v" href="mailto:${esc(lead.email)}">${esc(lead.email)}</a>` : '<span class="v">—</span>'}</div>
    <div class="kv-row"><span class="k">Ubicación</span><span class="v">${esc(locLabel(lead))}</span></div>
    <div class="kv-row"><span class="k">Responsable</span><span class="v">${lead.owner_name ? esc(lead.owner_name) : 'Sin asignar'}</span></div>
    <div class="kv-row"><span class="k">Último cambio</span><span class="v">${fmtDateTime(lead.updated_at)}</span></div>`;
  if (isContact) {
    return `<div class="card-box">
      <div class="section-t">Mensaje de contacto</div>
      ${lead.notes ? `<div class="items-box" style="margin:0 0 14px">${esc(lead.notes)}</div>` : '<p class="muted" style="margin-bottom:14px">Sin mensaje.</p>'}
      <div class="kv">${contactRows}</div>
    </div>`;
  }
  return `<div class="card-box">
    <div class="section-t">Solicitud de cotización</div>
    <div class="quote-head">
      <div class="qh"><div class="k">Servicio</div><div class="v">${esc(svcLabel(lead.service) || lead.service || '—')}</div></div>
      <div class="qh"><div class="k">Condición</div><div class="v">${esc(CONDITIONS[lead.condition] || lead.condition || '—')}</div></div>
      <div class="qh"><div class="k">Días</div><div class="v">${esc(DAYS[lead.days] || lead.days || '—')}</div></div>
      <div class="qh"><div class="k">Franja</div><div class="v">${esc(TIMES[lead.time] || lead.time || '—')}</div></div>
    </div>
    <div class="kv">
      <div class="kv-row"><span class="k">Extras</span><span class="v">${addons.length ? addons.map((a) => esc(a)).join(' · ') : '—'}</span></div>
      ${contactRows}
    </div>
    <div class="section-t" style="margin-top:16px">Artículos</div>
    ${lead.items ? `<div class="items-box" style="margin-top:0">${esc(lead.items)}</div>` : '<p class="muted">El cliente no listó artículos.</p>'}
    ${lead.notes ? `<div class="section-t" style="margin-top:16px">Notas del cliente</div><div class="items-box" style="margin-top:0">${esc(lead.notes)}</div>` : ''}
  </div>`;
}

function galleryHTML(lead) {
  const files = lead.files || [];
  if (!files.length) return '<p class="muted">El cliente no adjuntó fotos.</p>';
  return `<div class="gallery">${files.map((f, i) => `<button type="button" class="ph" data-ph="${i}" title="${esc(f.name || 'Foto')}"><img src="${fileURL(lead.id, f.id)}" alt="${esc(f.name || 'Foto')}" loading="lazy"></button>`).join('')}</div>`;
}

// Visor de fotos en modal (flechas ← → y Esc)
function openViewer(lead, idx) {
  const files = lead.files || []; if (!files.length) return;
  let i = Math.max(0, Math.min(idx, files.length - 1));
  const m = modal('', 'viewer');
  const paint = () => {
    const f = files[i], url = fileURL(lead.id, f.id);
    m.firstElementChild.innerHTML = `
      <button class="vw-x" id="vw-x" title="Cerrar">×</button>
      ${files.length > 1 ? '<button class="vw-nav prev" id="vw-prev" title="Anterior">‹</button><button class="vw-nav next" id="vw-next" title="Siguiente">›</button>' : ''}
      <img src="${url}" alt="${esc(f.name || 'Foto')}">
      <div class="vw-cap"><span>${esc(f.name || 'Foto')} · ${fmtSize(f.size)} · ${i + 1}/${files.length}</span><a class="btn btn-ghost btn-sm" href="${url}" target="_blank" rel="noopener noreferrer">Abrir en pestaña nueva</a></div>`;
    $('#vw-x').addEventListener('click', closeModal);
    const prev = $('#vw-prev'), next = $('#vw-next');
    if (prev) prev.addEventListener('click', () => { i = (i - 1 + files.length) % files.length; paint(); });
    if (next) next.addEventListener('click', () => { i = (i + 1) % files.length; paint(); });
  };
  paint();
}

function editCardHTML(lead) {
  const opts = (dict, cur, none) => [`<option value="">${none}</option>`, ...Object.entries(dict).map(([k, v]) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${esc(v)}</option>`)].join('');
  const addons = addonsArr(lead);
  return `<div class="card-box">
    <div class="section-t">Editar datos</div>
    <div class="form-row-3">
      <div class="field"><label>Nombre</label><input id="f-name" value="${esc(lead.name || '')}"></div>
      <div class="field"><label>Correo</label><input id="f-email" type="email" value="${esc(lead.email || '')}"></div>
      <div class="field"><label>Móvil</label><input id="f-mobile" value="${esc(lead.mobile || '')}"></div>
    </div>
    <div class="form-row-3">
      <div class="field"><label>Suburb</label><input id="f-suburb" value="${esc(lead.suburb || '')}"></div>
      <div class="field"><label>Postcode</label><input id="f-postcode" inputmode="numeric" maxlength="4" value="${esc(lead.postcode || '')}"></div>
      <div class="field"><label>Ciudad</label><input id="f-city" value="${esc(lead.city || '')}"></div>
    </div>
    <div class="form-row-3">
      <div class="field"><label>Servicio</label><select id="f-service">${opts(services(), lead.service, '— (solo contacto)')}</select></div>
      <div class="field"><label>Condición</label><select id="f-condition">${opts(CONDITIONS, lead.condition, '—')}</select></div>
      <div class="field"><label>Responsable</label><select id="f-owner">${ownerOptions(lead.owner_id)}</select></div>
    </div>
    <div class="form-row">
      <div class="field"><label>Días</label><select id="f-days">${opts(DAYS, lead.days, '—')}</select></div>
      <div class="field"><label>Franja horaria</label><select id="f-time">${opts(TIMES, lead.time, '—')}</select></div>
    </div>
    <div class="field"><label>Extras</label><div class="checks">${Object.entries(ADDONS).map(([k, v]) => `<label><input type="checkbox" name="f-addon" value="${k}" ${addons.includes(k) ? 'checked' : ''}> ${esc(v)}</label>`).join('')}</div></div>
    <div class="field"><label>Artículos (uno por línea)</label><textarea id="f-items">${esc(lead.items || '')}</textarea></div>
    <div class="field"><label>Notas del cliente / mensaje</label><textarea id="f-notes">${esc(lead.notes || '')}</textarea></div>
    <button class="btn btn-primary btn-sm" id="save">Guardar cambios</button>
  </div>`;
}

function leadTasksCardHTML(lead, tasks) {
  const byDue = (a, b) => new Date(a.due_at) - new Date(b.due_at);
  const open = tasks.filter((t) => !t.done).sort(byDue);
  const done = tasks.filter((t) => t.done).sort((a, b) => new Date(b.done_at || b.due_at) - new Date(a.done_at || a.due_at)).slice(0, 5);
  const userOpts = ['<option value="">Cualquiera</option>', ...usersForSelect().map((u) => `<option value="${u.id}" ${u.id === state.me.id ? 'selected' : ''}>${esc(u.name)}</option>`)].join('');
  const item = (t) => {
    const overdue = !t.done && new Date(t.due_at) < new Date();
    return `<label class="task-item ${overdue ? 'overdue' : ''} ${t.done ? 'done' : ''}">
      <input type="checkbox" data-task="${Number(t.id)}" ${t.done ? 'checked' : ''}>
      <span class="tk-body"><span class="tk-title">${esc(t.title)}</span><span class="tk-due">${t.done ? `Hecha ${fmtDateTime(t.done_at || t.due_at)}` : `${overdue ? 'Venció ' : 'Vence '}${fmtDue(t.due_at)}`}${t.user_name ? ` · ${esc(t.user_name)}` : ''}</span></span>
      <button type="button" class="tk-del" data-del="${Number(t.id)}" title="Eliminar">×</button>
    </label>`;
  };
  return `
    <div class="section-t">Tareas ${open.length ? `<span class="cnt">${open.length} abierta${open.length === 1 ? '' : 's'}</span>` : ''}</div>
    <div class="task-presets">
      <button type="button" class="preset" data-preset="1h">Llamar en 1 h</button>
      <button type="button" class="preset" data-preset="3h">Llamar en 3 h</button>
      <button type="button" class="preset" data-preset="tomorrow">Mañana 9:00</button>
      <button type="button" class="preset" data-preset="3d">En 3 días</button>
    </div>
    <div class="field"><label>Nueva tarea</label><input id="t-title" placeholder="Enviar cotización por WhatsApp"></div>
    <div class="form-row">
      <div class="field"><label>Vence</label><input id="t-due" type="datetime-local" value="${toLocalInput(presetDue('1h'))}"></div>
      <div class="field"><label>Responsable</label><select id="t-user">${userOpts}</select></div>
    </div>
    <button class="btn btn-primary btn-sm" id="t-add" style="width:100%">Crear recordatorio</button>
    <p class="help" style="margin-top:8px">Avisa en el panel y por correo a la hora indicada.</p>
    <div class="task-list">
      ${open.map(item).join('')}${done.map(item).join('')}
      ${!tasks.length ? '<p class="muted">Sin tareas para este lead.</p>' : ''}
    </div>`;
}

// Atribución / origen del lead (página, referencia, UTMs, gclid…)
function attrHTML(lead) {
  let a; try { a = typeof lead.attribution === 'string' ? JSON.parse(lead.attribution || 'null') : lead.attribution; } catch (e) { a = null; }
  if (!a || typeof a !== 'object' || !Object.keys(a).length) return '<p class="muted">Sin datos de origen (lead manual o registrado sin captura).</p>';
  // Solo http(s):// se emite como enlace; cualquier otro esquema se muestra como texto (anti-XSS)
  const linkv = (u) => {
    const raw = String(u);
    return /^https?:\/\//i.test(raw)
      ? `<a class="v" href="${esc(raw)}" target="_blank" rel="noopener noreferrer" style="word-break:break-all">${esc(raw)}</a>`
      : `<span class="v" style="word-break:break-all">${esc(raw)}</span>`;
  };
  const row = (label, val, isLink) => (val ? `<div class="kv-row"><span class="k">${label}</span>${isLink ? linkv(val) : `<span class="v">${esc(val)}</span>`}</div>` : '');
  const known = ['page', 'referrer', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'msclkid', 'ttclid', 'user_agent'];
  const rows = [
    row('Página', a.page), row('Referencia', a.referrer, true),
    row('utm_source', a.utm_source), row('utm_medium', a.utm_medium), row('utm_campaign', a.utm_campaign),
    row('utm_term', a.utm_term), row('utm_content', a.utm_content),
    row('Google Click ID', a.gclid), row('Meta Click ID', a.fbclid), row('Microsoft Click ID', a.msclkid), row('TikTok Click ID', a.ttclid),
    ...Object.entries(a).filter(([k, v]) => !known.includes(k) && v && typeof v !== 'object').map(([k, v]) => row(esc(k), String(v))),
  ].join('');
  return `<div class="kv">${rows || '<p class="muted">Sin datos de origen.</p>'}</div>
    ${a.user_agent ? `<p class="help" style="margin-top:10px;word-break:break-word">${esc(a.user_agent)}</p>` : ''}`;
}

function timelineHTML(lead) {
  return (lead.events || []).slice().reverse().map(eventHTML).join('') || '<p class="muted">Sin eventos.</p>';
}
function eventHTML(ev) {
  let txt = '', cls = ev.type;
  if (ev.type === 'created') txt = `Lead registrado${ev.note ? ` · ${esc(ev.note)}` : ''}`;
  else if (ev.type === 'status') { cls = ev.to_status; txt = `Movido a <b>${esc(STATUS_LABELS[ev.to_status] || ev.to_status)}</b>${ev.loss_reason ? ` — ${esc(lossLabel(ev.loss_reason))}` : ''}`; }
  else if (ev.type === 'note') txt = `Nota: ${esc(ev.note)}`;
  else if (ev.type === 'task') txt = `⏰ ${esc(ev.note || 'Tarea creada')}`;
  else if (ev.type === 'task_done') txt = `✓ ${esc(ev.note || 'Tarea completada')}`;
  else txt = esc(ev.note || ev.type);
  return `<div class="tl ${esc(cls)}"><span class="dot"></span><div class="body"><div class="t">${txt}</div><div class="d">${fmtDateTime(ev.created_at)}${ev.user_name ? ' · ' + esc(ev.user_name) : ''}</div></div></div>`;
}

// ============================================================
//  MODALES — motivo de pérdida / lead manual / usuarios / fragmentos
// ============================================================
function modal(html, cls = '') { const m = $('#modal'); m.innerHTML = `<div class="modal ${cls}">${html}</div>`; m.classList.add('open'); return m; }
function closeModal() { const m = $('#modal'); if (m) { m.classList.remove('open'); m.innerHTML = ''; } }
document.addEventListener('keydown', (e) => {
  const m = $('#modal'); if (!m || !m.classList.contains('open')) return;
  if (e.key === 'Escape') { closeModal(); return; }
  if (m.querySelector('.viewer')) {
    if (e.key === 'ArrowLeft') { const b = $('#vw-prev'); if (b) b.click(); }
    if (e.key === 'ArrowRight') { const b = $('#vw-next'); if (b) b.click(); }
  }
});
document.addEventListener('click', (e) => { const m = $('#modal'); if (m && e.target === m && m.querySelector('.viewer')) closeModal(); });

function openLossModal(onConfirm) {
  const opts = Object.entries(lossReasons()).map(([k, v]) => `<option value="${esc(k)}">${esc(v)}</option>`).join('');
  modal(`
    <h2>Marcar como Perdido</h2>
    <p class="desc">Selecciona el motivo de pérdida para el reporte.</p>
    <div class="field"><label>Motivo</label><select id="loss-r">${opts}</select></div>
    <div class="modal-foot">
      <button class="btn btn-ghost btn-sm" id="loss-cancel">Cancelar</button>
      <button class="btn btn-primary btn-sm" id="loss-ok">Confirmar pérdida</button>
    </div>`);
  $('#loss-cancel').addEventListener('click', () => { closeModal(); if (state.view === 'kanban') paintKanban(); });
  $('#loss-ok').addEventListener('click', () => { const r = $('#loss-r').value; closeModal(); onConfirm(r); });
}

function openNewLead() {
  const ownerOpts = usersForSelect().map((u) => `<option value="${u.id}" ${u.id === state.me.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('');
  modal(`
    <h2>Nuevo lead</h2>
    <p class="desc">Registro manual (llamada, WhatsApp directo, referido…).</p>
    <div class="form-row">
      <div class="field"><label>Nombre</label><input id="n-name"></div>
      <div class="field"><label>Móvil</label><input id="n-mobile" placeholder="04xx xxx xxx"></div>
    </div>
    <div class="form-row">
      <div class="field"><label>Correo</label><input id="n-email" type="email"></div>
      <div class="field"><label>Servicio</label><select id="n-service"><option value="">— (solo contacto)</option>${Object.entries(services()).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></div>
    </div>
    <div class="form-row-3">
      <div class="field"><label>Suburb</label><input id="n-suburb"></div>
      <div class="field"><label>Postcode</label><input id="n-postcode" inputmode="numeric" maxlength="4"></div>
      <div class="field"><label>Ciudad</label><input id="n-city" placeholder="Adelaide"></div>
    </div>
    <div class="field"><label>Artículos (uno por línea)</label><textarea id="n-items" rows="3"></textarea></div>
    <div class="field"><label>Notas</label><textarea id="n-notes" rows="2"></textarea></div>
    <div class="field"><label>Responsable</label><select id="n-owner">${ownerOpts}</select></div>
    <div class="modal-foot">
      <button class="btn btn-ghost btn-sm" id="n-cancel">Cancelar</button>
      <button class="btn btn-primary btn-sm" id="n-ok">Crear lead</button>
    </div>`, 'wide');
  $('#n-cancel').addEventListener('click', closeModal);
  $('#n-ok').addEventListener('click', async () => {
    const g = (id) => $(id).value.trim();
    const body = { name: g('#n-name'), mobile: g('#n-mobile'), email: g('#n-email'), service: g('#n-service') || null, suburb: g('#n-suburb'), postcode: g('#n-postcode'), city: g('#n-city'), items: $('#n-items').value, notes: $('#n-notes').value, owner_id: Number($('#n-owner').value) || null, source: 'manual' };
    if (!body.name) { toast('Falta el nombre', 'err'); return; }
    if (!body.mobile && !body.email) { toast('Hace falta móvil o correo', 'err'); return; }
    if (body.postcode && !/^\d{4}$/.test(body.postcode)) { toast('El postcode son 4 dígitos', 'err'); return; }
    try { await api('POST', '/api/leads', body); closeModal(); await loadLeads(); if (state.view === 'kanban') paintKanban(); else if (state.view === 'leads') { paintFilterSelects(); paintLeads(); } toast('Lead creado'); }
    catch (e) { if (e.message !== 'unauth') toast('Error al crear', 'err'); }
  });
}

// ============================================================
//  TAREAS — vista #tasks + avisos
// ============================================================
async function viewTasks() {
  const v = $('#view');
  const canNotify = 'Notification' in window;
  const granted = canNotify && Notification.permission === 'granted';
  v.innerHTML = `
    <div class="topbar">
      <div><span class="ey">Recordatorios</span><h1>Tareas</h1></div>
      <div class="tools">
        <div class="seg" id="tk-scope"><button data-s="mine" class="${state.taskScope === 'mine' ? 'active' : ''}">Mías</button><button data-s="all" class="${state.taskScope === 'all' ? 'active' : ''}">Todas</button></div>
        <div class="seg" id="tk-tab"><button data-t="open" class="${state.taskTab === 'open' ? 'active' : ''}">Abiertas</button><button data-t="done" class="${state.taskTab === 'done' ? 'active' : ''}">Hechas</button></div>
        ${canNotify ? (granted ? '<span class="pill-ok">Avisos del navegador activos</span>' : '<button class="btn btn-ghost btn-sm" id="tk-notif">Activar avisos del navegador</button>') : ''}
      </div>
    </div>
    <p class="help" style="margin:-10px 0 18px;max-width:78ch">Las tareas se crean desde la ficha de cada lead. Al vencer, aparece un aviso abajo a la derecha (mientras el panel esté abierto), llega un correo al responsable (o a los administradores si la tarea no tiene responsable) y, si activas los avisos del navegador, también una notificación del sistema.</p>
    <div id="tasks-wrap"><div class="empty">Cargando…</div></div>`;

  $('#tk-scope').addEventListener('click', (e) => { const b = e.target.closest('button[data-s]'); if (!b) return; state.taskScope = b.dataset.s; $('#tk-scope').querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b)); paintTasksView(); });
  $('#tk-tab').addEventListener('click', (e) => { const b = e.target.closest('button[data-t]'); if (!b) return; state.taskTab = b.dataset.t; $('#tk-tab').querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b)); paintTasksView(); });
  const nb = $('#tk-notif');
  if (nb) nb.addEventListener('click', async () => {
    try {
      const p = await Notification.requestPermission();
      if (p === 'granted') { toast('Avisos del navegador activados'); viewTasks(); }
      else toast('El navegador no concedió el permiso', 'err');
    } catch (e) { toast('No se pudo pedir el permiso', 'err'); }
  });
  wireTasksWrap($('#tasks-wrap'));
  await paintTasksView();
}

async function paintTasksView() {
  const wrap = $('#tasks-wrap'); if (!wrap) return;
  let rows = [];
  try { rows = (await api('GET', `/api/tasks?scope=${state.taskScope}&state=${state.taskTab}`)) || []; }
  catch (e) { if (e.message !== 'unauth') wrap.innerHTML = '<div class="empty">No se pudieron cargar las tareas.</div>'; return; }
  if (!rows.length) {
    wrap.innerHTML = `<div class="empty"><div class="big">${state.taskTab === 'done' ? 'Nada hecho todavía' : 'Sin tareas pendientes'}</div>${state.taskTab === 'done' ? 'Las tareas marcadas como hechas aparecerán aquí.' : 'Crea recordatorios desde la ficha de un lead: "Llamar en 1 h", "Mañana 9:00"…'}</div>`;
    return;
  }
  const now = new Date();
  const dateLab = (iso) => { const d = new Date(iso); const tom = new Date(now); tom.setDate(now.getDate() + 1); return sameDay(d, now) ? 'hoy' : sameDay(d, tom) ? 'mañana' : d.toLocaleDateString('es', { day: '2-digit', month: 'short' }).replace('.', ''); };
  const rowHTML = (t) => {
    const d = new Date(t.due_at);
    const overdue = !t.done && (t.overdue || d < now);
    return `<div class="task-row ${overdue ? 'overdue' : ''}">
      <div class="tk-when"><b>${pad(d.getHours())}:${pad(d.getMinutes())}</b><span>${t.done ? fmtDate(t.done_at || t.due_at) : dateLab(t.due_at)}</span></div>
      <div class="tk-body">
        <div class="tk-title">${esc(t.title)}</div>
        <div class="tk-meta"><a href="#lead-${Number(t.lead_id)}">${esc(t.lead_name || `Lead #${t.lead_id}`)}</a>${t.lead_mobile ? ` · ${esc(t.lead_mobile)}` : ''} · ${t.user_name ? esc(t.user_name) : 'Cualquiera'}${t.done ? ` · hecha ${fmtDateTime(t.done_at)}` : ''}</div>
      </div>
      <div class="tk-actions">
        <button class="btn btn-ghost btn-sm" data-go="${Number(t.lead_id)}">Ver lead</button>
        ${t.done ? `<button class="btn btn-ghost btn-sm" data-reopen="${Number(t.id)}">Reabrir</button>` : `<button class="btn btn-primary btn-sm" data-done="${Number(t.id)}">Hecha</button>`}
      </div>
    </div>`;
  };
  const group = (title, list, cls) => list.length ? `<div class="task-group ${cls}"><h3>${title} <span class="cnt">${list.length}</span></h3>${list.map(rowHTML).join('')}</div>` : '';

  if (state.taskTab === 'done') {
    wrap.innerHTML = group('Hechas', rows.slice().sort((a, b) => new Date(b.done_at || b.due_at) - new Date(a.done_at || a.due_at)), 'done');
  } else {
    const g = { late: [], today: [], soon: [] };
    rows.forEach((t) => { const d = new Date(t.due_at); if (t.overdue || d < now) g.late.push(t); else if (sameDay(d, now)) g.today.push(t); else g.soon.push(t); });
    wrap.innerHTML = group('Vencidas', g.late, 'late') + group('Hoy', g.today, 'today') + group('Próximas', g.soon, 'soon');
  }
}

// Delegación única sobre #tasks-wrap (la lista se repinta con innerHTML, el contenedor permanece)
function wireTasksWrap(wrap) {
  wrap.addEventListener('click', async (e) => {
    const go = e.target.closest('[data-go]'); if (go) { openLead(Number(go.dataset.go)); return; }
    const dn = e.target.closest('[data-done]'); if (dn) { dn.disabled = true; try { await completeTask(Number(dn.dataset.done)); } catch (err) { dn.disabled = false; if (err.message !== 'unauth') toast('No se pudo actualizar', 'err'); } return; }
    const ro = e.target.closest('[data-reopen]'); if (ro) { try { await api('PATCH', `/api/tasks/${Number(ro.dataset.reopen)}`, { done: false }); toast('Tarea reabierta'); paintTasksView(); pollTasks(); } catch (err) { if (err.message !== 'unauth') toast('No se pudo reabrir', 'err'); } }
  });
}

// Marca hecha desde un aviso o desde la vista de tareas y refresca lo que esté en pantalla
async function completeTask(taskId) {
  await api('PATCH', `/api/tasks/${taskId}`, { done: true });
  removeAlert(taskId);
  toast('Tarea hecha');
  pollTasks();
  if (state.view === 'tasks') paintTasksView();
  else if (state.view === 'leadDetail') viewLeadDetail(state.detailId);
  else if (state.view === 'kanban') { await loadLeads(); paintKanban(); }
}

// ----- sondeo de /api/tasks/summary (al entrar y cada 60 s) -----
let pollT = null;
function startPolling() { stopPolling(); pollTasks(); pollT = setInterval(pollTasks, 60000); }
function stopPolling() { if (pollT) clearInterval(pollT); pollT = null; }
async function pollTasks() {
  if (!state.me) return;
  let s; try { s = await api('GET', '/api/tasks/summary'); } catch (e) { return; }
  if (!s) return;
  state.summary = s;
  paintTaskBadge();
  (s.due || []).forEach(showTaskAlert);
  updateTitle();
}
function paintTaskBadge() {
  const b = $('#badge-tasks'); if (!b) return;
  const s = state.summary || {};
  const n = (Number(s.overdue) || 0) + (Number(s.today) || 0);
  b.textContent = n || '';
  b.classList.toggle('hot', (Number(s.overdue) || 0) > 0);
}
function updateTitle() {
  const n = (state.summary && Number(state.summary.overdue)) || 0;
  document.title = n ? `(${n}) Wyelee CRM` : 'Wyelee · Panel';
}
// Aviso apilable en la esquina superior derecha; no desaparece solo
function showTaskAlert(t) {
  const host = $('#alerts'); if (!host || !t) return;
  if (host.querySelector(`[data-task="${Number(t.id)}"]`)) return;
  const el = document.createElement('div');
  el.className = 'alert-task'; el.dataset.task = String(Number(t.id));
  el.innerHTML = `
    <div class="at-head">
      <span class="at-ico">⏰</span>
      <div class="at-txt"><b>${esc(t.title)}</b><span>${esc(t.lead_name || `Lead #${t.lead_id}`)} · ${fmtDue(t.due_at)}</span></div>
      <button class="at-x" title="Cerrar aviso">×</button>
    </div>
    <div class="at-actions">
      <button class="btn btn-ghost btn-sm" data-go>Ver lead</button>
      <button class="btn btn-primary btn-sm" data-done>Hecha</button>
    </div>`;
  el.querySelector('.at-x').addEventListener('click', () => el.remove());
  el.querySelector('[data-go]').addEventListener('click', () => openLead(Number(t.lead_id)));
  el.querySelector('[data-done]').addEventListener('click', async (e) => {
    e.target.disabled = true;
    try { await completeTask(Number(t.id)); } catch (err) { e.target.disabled = false; if (err.message !== 'unauth') toast('No se pudo marcar', 'err'); }
  });
  host.appendChild(el);
  // Notificación del sistema si el usuario la activó en la vista Tareas
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      const n = new Notification(`⏰ ${t.title}`, { body: `${t.lead_name || 'Lead'} · ${fmtDue(t.due_at)}`, tag: `wy-task-${t.id}`, icon: `${location.origin}/crm/assets/favicon.png` });
      n.onclick = () => { try { window.focus(); } catch (e2) {} location.hash = `lead-${Number(t.lead_id)}`; n.close(); };
    } catch (e) {}
  }
}
function removeAlert(taskId) { const el = $(`#alerts [data-task="${Number(taskId)}"]`); if (el) el.remove(); }

// ============================================================
//  USUARIOS (solo admin)
// ============================================================
async function viewUsers() {
  const v = $('#view');
  try { state.users = await api('GET', '/api/users'); }
  catch (e) { if (e.message !== 'unauth') v.innerHTML = '<div class="empty"><div class="big">Acceso restringido</div>Solo los administradores pueden ver los usuarios.</div>'; return; }
  const admin = isAdmin();
  v.innerHTML = `
    <div class="topbar">
      <div><span class="ey">Equipo</span><h1>Usuarios del panel</h1></div>
      <div class="tools">${admin ? '<button class="btn btn-primary btn-sm" id="new-user">+ Crear usuario</button>' : ''}</div>
    </div>
    <p class="help" style="margin:-10px 0 16px">Cada usuario entra con su correo mediante enlace de acceso. El rol <b>Comercial</b> gestiona leads y tareas; el <b>Administrador</b> además elimina leads y administra usuarios, redirecciones e integraciones.</p>
    <div class="panel"><table><thead><tr>
      <th>Usuario</th><th>Correo</th><th>Rol</th><th>Estado</th>${admin ? '<th></th>' : ''}
    </tr></thead><tbody>
    ${state.users.map((u) => `<tr>
      <td><div style="display:flex;align-items:center;gap:10px"><span class="avatar" style="width:30px;height:30px;font-size:.72rem">${initials(u.name)}</span><span class="lead-nm" style="font-size:.92rem">${esc(u.name)}</span></div></td>
      <td>${esc(u.email)}</td>
      <td><span class="status-pill ${u.role === 'admin' ? 'st-ganado' : 'st-nuevo'}">${roleLabel(u.role)}</span></td>
      <td>${u.active ? '<span style="color:var(--green-text);font-weight:700">● Activo</span>' : '<span style="color:var(--mute)">○ Inactivo</span>'}</td>
      ${admin ? `<td style="text-align:right;white-space:nowrap">
        ${u.id !== state.me.id && u.active ? `<button class="btn btn-ghost btn-sm" data-imp="${u.id}">Entrar como</button>` : ''}
        <button class="btn btn-ghost btn-sm" data-edit="${u.id}">Editar</button>
      </td>` : ''}
    </tr>`).join('')}
    </tbody></table></div>`;

  if (admin) {
    $('#new-user').addEventListener('click', openNewUser);
    v.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openEditUser(state.users.find((u) => u.id === Number(b.dataset.edit)))));
    v.querySelectorAll('[data-imp]').forEach((b) => b.addEventListener('click', async () => {
      const u = state.users.find((x) => x.id === Number(b.dataset.imp));
      if (!u || !confirm(`¿Entrar al panel como ${u.name}? Navegarás con los permisos de ${roleLabel(u.role)}. Podrás volver a tu cuenta cuando quieras.`)) return;
      try { await api('POST', `/api/users/${u.id}/impersonate`); location.reload(); }
      catch (e) { if (e.message !== 'unauth') toast('No se pudo entrar como usuario', 'err'); }
    }));
  }
}

function openNewUser() {
  modal(`
    <h2>Crear usuario</h2>
    <p class="desc">Podrá acceder con su correo mediante enlace de acceso.</p>
    <div class="field"><label>Nombre completo</label><input id="u-name"></div>
    <div class="field"><label>Correo</label><input id="u-email" type="email"></div>
    <div class="field"><label>Rol</label><select id="u-role">${ROLES.map((r) => `<option value="${r}" ${r === 'comercial' ? 'selected' : ''}>${roleLabel(r)}</option>`).join('')}</select></div>
    <div class="modal-foot">
      <button class="btn btn-ghost btn-sm" id="u-cancel">Cancelar</button>
      <button class="btn btn-primary btn-sm" id="u-ok">Crear</button>
    </div>`);
  $('#u-cancel').addEventListener('click', closeModal);
  $('#u-ok').addEventListener('click', async () => {
    const body = { name: $('#u-name').value.trim(), email: $('#u-email').value.trim(), role: $('#u-role').value };
    if (!body.name || !body.email) { toast('Nombre y correo requeridos', 'err'); return; }
    try { await api('POST', '/api/users', body); closeModal(); viewUsers(); toast('Usuario creado'); }
    catch (e) { if (e.message !== 'unauth') toast(/exist/i.test(e.message) ? 'Ese correo ya existe' : 'Error al crear', 'err'); }
  });
}

function openEditUser(u) {
  if (!u) return;
  modal(`
    <h2>Editar usuario</h2>
    <p class="desc">Actualiza los datos, el rol y si está activo. Un usuario inactivo no puede pedir enlaces de acceso.</p>
    <div class="field"><label>Nombre completo</label><input id="u-name" value="${esc(u.name)}"></div>
    <div class="field"><label>Correo</label><input id="u-email" type="email" value="${esc(u.email)}"></div>
    <div class="field"><label>Rol</label><select id="u-role">${ROLES.map((r) => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${roleLabel(r)}</option>`).join('')}</select></div>
    <div class="field"><label>Estado</label><select id="u-active">
      <option value="1" ${u.active ? 'selected' : ''}>Activo</option>
      <option value="0" ${!u.active ? 'selected' : ''}>Inactivo</option>
    </select></div>
    <div class="modal-foot">
      <button class="btn btn-ghost btn-sm" id="u-cancel">Cancelar</button>
      <button class="btn btn-primary btn-sm" id="u-ok">Guardar cambios</button>
    </div>`);
  $('#u-cancel').addEventListener('click', closeModal);
  $('#u-ok').addEventListener('click', async () => {
    const body = { name: $('#u-name').value.trim(), email: $('#u-email').value.trim(), role: $('#u-role').value, active: Number($('#u-active').value) };
    if (!body.name || !body.email) { toast('Nombre y correo requeridos', 'err'); return; }
    try { await api('PATCH', `/api/users/${u.id}`, body); closeModal(); viewUsers(); toast('Usuario actualizado'); }
    catch (e) { if (e.message !== 'unauth') toast(/exist/i.test(e.message) ? 'Ese correo ya existe' : 'Error al guardar', 'err'); }
  });
}

// ============================================================
//  REDIRECCIONES 301/302 (solo admin)
// ============================================================
async function viewRedirects() {
  const v = $('#view');
  let rows = [];
  try { rows = (await api('GET', '/api/redirects')) || []; }
  catch (e) { if (e.message !== 'unauth') v.innerHTML = '<div class="empty"><div class="big">Acceso restringido</div>Solo los administradores pueden gestionar redirecciones.</div>'; return; }
  v.innerHTML = `
    <div class="topbar">
      <div><span class="ey">SEO</span><h1>Redirecciones</h1></div>
      <div class="tools"><button class="btn btn-primary btn-sm" id="new-rd">+ Crear redirección</button></div>
    </div>
    <p class="help" style="margin:-10px 0 16px;max-width:76ch">Envía una ruta antigua a una nueva con un <b>301</b> (permanente) o <b>302</b> (temporal). Útil al renombrar páginas: conservas el posicionamiento y no rompes enlaces externos. No aplica a <code>/</code>, <code>/crm</code>, <code>/api</code> ni a los archivos estáticos.</p>
    <div class="panel"><div id="rd-table"></div></div>`;
  $('#new-rd').addEventListener('click', openNewRedirect);
  paintRedirects(rows);
}

function paintRedirects(rows) {
  const wrap = $('#rd-table'); if (!wrap) return;
  if (!rows.length) { wrap.innerHTML = `<div class="empty"><div class="big">Sin redirecciones</div>Crea la primera con “+ Crear redirección”.</div>`; return; }
  wrap.innerHTML = `<table><thead><tr>
    <th>Origen</th><th>Destino</th><th>Tipo</th><th>Estado</th><th>Hits</th><th></th>
    </tr></thead><tbody>
    ${rows.map((r) => `<tr>
      <td><code class="rd-path">${esc(r.from_path)}</code></td>
      <td><span class="rd-arrow">→</span> <code class="rd-path">${esc(r.to_path)}</code></td>
      <td><span class="status-pill ${r.code === 301 ? 'st-ganado' : 'st-contactado'}">${Number(r.code)}</span></td>
      <td>${r.active ? '<span style="color:var(--green-text);font-weight:700">● Activa</span>' : '<span style="color:var(--mute)">○ Inactiva</span>'}</td>
      <td><span class="mono" style="color:var(--dim)">${Number(r.hits) || 0}</span></td>
      <td style="text-align:right;white-space:nowrap">
        <button class="btn btn-ghost btn-sm" data-rd-edit="${r.id}">Editar</button>
        <button class="btn btn-ghost btn-sm danger" data-rd-del="${r.id}">Eliminar</button>
      </td>
    </tr>`).join('')}
  </tbody></table>`;
  wrap.querySelectorAll('tbody tr').forEach((tr) => (tr.style.cursor = 'default'));
  wrap.querySelectorAll('[data-rd-edit]').forEach((b) => b.addEventListener('click', () => openEditRedirect(rows.find((x) => x.id === Number(b.dataset.rdEdit)))));
  wrap.querySelectorAll('[data-rd-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('¿Eliminar esta redirección?')) return;
    try { await api('DELETE', `/api/redirects/${Number(b.dataset.rdDel)}`); viewRedirects(); toast('Redirección eliminada'); }
    catch (e) { if (e.message !== 'unauth') toast('No se pudo eliminar', 'err'); }
  }));
}

function redirectForm(r) {
  const isEdit = !!r;
  return `
    <h2>${isEdit ? 'Editar redirección' : 'Crear redirección'}</h2>
    <p class="desc">El origen es una ruta del sitio (ej. <code>/pagina-antigua</code>). El destino puede ser una ruta (<code>/quote/</code>) o una URL completa.</p>
    <div class="field"><label>Origen (ruta antigua)</label><input id="rd-from" placeholder="/pagina-antigua" value="${esc(r ? r.from_path : '')}"></div>
    <div class="field"><label>Destino</label><input id="rd-to" placeholder="/pagina-nueva/" value="${esc(r ? r.to_path : '')}"></div>
    <div class="field"><label>Tipo</label><select id="rd-code">
      <option value="301" ${!r || r.code === 301 ? 'selected' : ''}>301 — Permanente (recomendado para SEO)</option>
      <option value="302" ${r && r.code === 302 ? 'selected' : ''}>302 — Temporal</option>
    </select></div>
    ${isEdit ? `<div class="field"><label>Estado</label><select id="rd-active">
      <option value="1" ${r.active ? 'selected' : ''}>Activa</option>
      <option value="0" ${!r.active ? 'selected' : ''}>Inactiva</option>
    </select></div>` : ''}
    <div class="modal-foot">
      <button class="btn btn-ghost btn-sm" id="rd-cancel">Cancelar</button>
      <button class="btn btn-primary btn-sm" id="rd-ok">${isEdit ? 'Guardar' : 'Crear'}</button>
    </div>`;
}

function redirErr(e) {
  const m = String((e && e.message) || '');
  if (/ya existe|exists/i.test(m)) return 'Ya existe una redirección para ese origen';
  if (/iguales|same/i.test(m)) return 'El origen y el destino no pueden ser iguales';
  if (/no permitido|not allowed/i.test(m)) return 'Origen no permitido (no uses /, /crm o /api)';
  return 'No se pudo guardar la redirección';
}

function openNewRedirect() {
  modal(redirectForm(null));
  $('#rd-cancel').addEventListener('click', closeModal);
  $('#rd-ok').addEventListener('click', async () => {
    const body = { from_path: $('#rd-from').value.trim(), to_path: $('#rd-to').value.trim(), code: Number($('#rd-code').value) };
    if (!body.from_path || !body.to_path) { toast('Origen y destino requeridos', 'err'); return; }
    try { await api('POST', '/api/redirects', body); closeModal(); viewRedirects(); toast('Redirección creada'); }
    catch (e) { if (e.message !== 'unauth') toast(redirErr(e), 'err'); }
  });
}

function openEditRedirect(r) {
  if (!r) return;
  modal(redirectForm(r));
  $('#rd-cancel').addEventListener('click', closeModal);
  $('#rd-ok').addEventListener('click', async () => {
    const body = { from_path: $('#rd-from').value.trim(), to_path: $('#rd-to').value.trim(), code: Number($('#rd-code').value), active: Number($('#rd-active').value) };
    if (!body.from_path || !body.to_path) { toast('Origen y destino requeridos', 'err'); return; }
    try { await api('PATCH', `/api/redirects/${r.id}`, body); closeModal(); viewRedirects(); toast('Redirección actualizada'); }
    catch (e) { if (e.message !== 'unauth') toast(redirErr(e), 'err'); }
  });
}

// ============================================================
//  INTEGRACIONES (solo admin) — etiquetas + código de terceros del sitio público
// ============================================================
const PROVIDERS = [
  ['ga4_id', 'Google Analytics 4', 'G-XXXXXXXXXX', 'ID de medición (Administrar → Flujos de datos → Web). Envía page_view y el evento generate_lead.', 'GA', '#E37400'],
  ['gtm_id', 'Google Tag Manager', 'GTM-XXXXXXX', 'ID del contenedor. Si gestionas todo desde GTM, deja vacíos los demás para no duplicar etiquetas.', 'TM', '#4285F4'],
  ['google_ads', 'Google Ads', 'AW-XXXXXXXXX', 'ID de conversión y etiqueta (label) de la acción "Lead". Se dispara al enviar el formulario de cotización.', 'AD', '#34A853'],
  ['meta_pixel_id', 'Meta Pixel', '1234567890123456', 'ID numérico del píxel (Events Manager). Envía PageView y Lead.', 'f', '#1877F2'],
  ['tiktok_pixel_id', 'TikTok Pixel', 'CXXXXXXXXXXXXXXXXX', 'ID del píxel (TikTok Ads → Events Manager). Envía SubmitForm al cotizar.', 'TT', '#111111'],
  ['clarity_id', 'Microsoft Clarity', 'abcdefghij', 'ID del proyecto: grabaciones de sesión y mapas de calor, gratis.', 'C', '#0078D4'],
  ['hotjar_id', 'Hotjar', '1234567', 'Site ID numérico (hjid).', 'H', '#FD3A5C'],
];
const CODE_FIELDS = [
  ['custom_head', 'Inicio de <head>', 'Metas de verificación (Search Console, Meta), scripts que deben cargar antes que nada, CSS de widgets.', '<!-- p. ej. <meta name="google-site-verification" content="…"> -->'],
  ['custom_body_start', 'Inicio de <body>', 'Fragmentos <noscript> (GTM), barras o banners que deben ir arriba de todo.', '<!-- p. ej. <noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-XXXX" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript> -->'],
  ['custom_body_end', 'Fin de <body>', 'Widgets de chat, botones flotantes, reseñas o reservas que no bloquean la carga.', '<!-- p. ej. <script src="https://embed.tawk.to/XXXX/default" async></script> -->'],
];
const SETTING_IDS = ['ga4_id', 'gtm_id', 'google_ads_id', 'google_ads_label', 'meta_pixel_id', 'tiktok_pixel_id', 'clarity_id', 'hotjar_id', 'notify_emails', 'whatsapp_number'];
const newId = () => Math.random().toString(36).slice(2, 8);
function parseSnippets(raw) {
  let arr = raw;
  if (typeof raw === 'string') { try { arr = JSON.parse(raw || '[]'); } catch (e) { arr = []; } }
  if (!Array.isArray(arr)) return [];
  return arr.filter((s) => s && typeof s === 'object').map((s) => ({
    id: String(s.id || newId()), name: String(s.name || ''), position: SNIPPET_POSITIONS[s.position] ? s.position : 'body_end',
    enabled: s.enabled === 0 || s.enabled === '0' || s.enabled === false ? 0 : 1, code: String(s.code || ''),
  }));
}
const excerpt = (code) => String(code || '').replace(/\s+/g, ' ').trim().slice(0, 90) || '(sin código)';

async function viewIntegrations() {
  const v = $('#view');
  v.innerHTML = `<div class="empty">Cargando…</div>`;
  let s;
  try { s = await api('GET', '/api/settings'); }
  catch (e) { if (e.message !== 'unauth') v.innerHTML = '<div class="empty"><div class="big">Acceso restringido</div>Solo los administradores pueden ver las integraciones.</div>'; return; }
  s = s || {};
  state.settings = s;
  const snippets = parseSnippets(s.snippets);
  const on = s.tracking_enabled === '1' || s.tracking_enabled === 1;
  const endpoint = `${location.origin}/api/public/site-config`;
  const val = (k) => esc(s[k] || '');

  const providerCard = ([key, name, ph, help, ic, color]) => {
    const filled = key === 'google_ads' ? !!s.google_ads_id : !!s[key];
    const fields = key === 'google_ads'
      ? `<div class="field"><label>ID de conversión</label><input id="set-google_ads_id" value="${val('google_ads_id')}" placeholder="AW-XXXXXXXXX" autocomplete="off" spellcheck="false"></div>
         <div class="field"><label>Etiqueta de conversión</label><input id="set-google_ads_label" value="${val('google_ads_label')}" placeholder="AbCdEfGhIjKlMnOp" autocomplete="off" spellcheck="false"></div>`
      : `<div class="field"><label>ID</label><input id="set-${key}" value="${val(key)}" placeholder="${esc(ph)}" autocomplete="off" spellcheck="false"></div>`;
    return `<div class="provider ${filled ? 'filled' : ''}" data-pv="${key}">
      <div class="pv-head"><span class="pv-ic" style="background:${color}">${ic}</span><b>${name}</b><span class="pv-on" title="${filled ? 'Configurado' : 'Sin configurar'}"></span></div>
      ${fields}
      <div class="field-help">${help}</div>
    </div>`;
  };

  v.innerHTML = `
    <div class="topbar">
      <div><span class="ey">Sitio público</span><h1>Integraciones</h1></div>
      <div class="tools"><button class="btn btn-primary btn-sm" id="int-save">Guardar</button></div>
    </div>
    <div class="detail-grid">
      <div class="detail-main">
        <div class="card-box">
          <div class="set-toggle">
            <div><div class="lab">Etiquetas activas en el sitio</div><div class="help">Interruptor maestro. Apagado, el sitio no carga ninguna herramienta ni fragmento. Las etiquetas <b>no se disparan en localhost</b> ni en la vista previa de GitHub Pages, solo en el dominio real.</div></div>
            <label class="switch"><input type="checkbox" id="set-tracking_enabled" ${on ? 'checked' : ''}><span></span></label>
          </div>
          <div class="section-t">Proveedores</div>
          <div class="providers">${PROVIDERS.map(providerCard).join('')}</div>
        </div>

        <div class="card-box">
          <div class="section-t">Código incrustado</div>
          <p class="help" style="margin:-4px 0 16px">Pega aquí HTML o scripts tal como los entrega cada proveedor. Se insertan en todas las páginas del sitio en el punto indicado; los <code>&lt;script&gt;</code> se ejecutan.</p>
          ${CODE_FIELDS.map(([k, label, help, ph]) => `
            <div class="code-block">
              <div class="field"><label>${esc(label)}</label><textarea id="set-${k}" class="code" rows="5" spellcheck="false" placeholder="${esc(ph)}">${val(k)}</textarea></div>
              <div class="field-help">${esc(help)}</div>
            </div>`).join('')}
        </div>

        <div class="card-box">
          <div class="section-t">Fragmentos de terceros <button class="btn btn-ghost btn-sm right" id="sn-add">+ Añadir fragmento</button></div>
          <p class="help" style="margin:-4px 0 14px">Un fragmento por herramienta, con su nombre y posición, para activarlos o apagarlos sin borrar el código. Ejemplos: widget de chat (Tawk.to, Crisp), reseñas de Google (Elfsight), Calendly, botón de WhatsApp…</p>
          <div id="sn-list"></div>
        </div>

        <div class="card-box">
          <div class="section-t">Notificaciones</div>
          <div class="form-row">
            <div class="field"><label>Correos extra para nuevos leads</label><input id="set-notify_emails" value="${val('notify_emails')}" placeholder="ventas@wyeleeassembly.com.au, otro@correo.com" autocomplete="off"><div class="field-help">Separados por coma. Los administradores activos siempre reciben el aviso.</div></div>
            <div class="field"><label>WhatsApp del negocio</label><input id="set-whatsapp_number" value="${esc(s.whatsapp_number || DEFAULT_WA)}" placeholder="${DEFAULT_WA}" inputmode="numeric" autocomplete="off"><div class="field-help">Solo dígitos con prefijo de país (61…). Se usa en las plantillas de las acciones rápidas.</div></div>
          </div>
        </div>

        <div class="save-bar"><button class="btn btn-primary" id="int-save-2">Guardar cambios</button><span class="help">Los cambios llegan al sitio al guardar (el CDN los refresca en un máximo de 5 minutos).</span></div>
      </div>

      <aside class="detail-side">
        <div class="card-box">
          <div class="section-t">Cómo funciona</div>
          <ol class="how">
            <li>El sitio público carga <code class="mono">js/analytics.js</code>, que lee esta configuración desde el endpoint de abajo tras la primera interacción del visitante.</li>
            <li>Si el interruptor está activo, inyecta cada herramienta con su ID y los fragmentos en la posición elegida. <b>Sin tocar código ni volver a publicar.</b></li>
            <li>Al enviarse el formulario de cotización, dispara los eventos de conversión (abajo).</li>
          </ol>
          <div class="endpoint"><label>Endpoint público (JSON)</label><code>${esc(endpoint)}</code></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
            <a class="btn btn-ghost btn-sm" href="${esc(endpoint)}" target="_blank" rel="noopener noreferrer">Ver JSON público</a>
            <button class="btn btn-ghost btn-sm" id="int-copy">Copiar URL</button>
          </div>
        </div>
        <div class="card-box">
          <div class="section-t">Eventos al cotizar</div>
          <ul class="ev-list">
            <li><code>gtag generate_lead</code> GA4</li>
            <li><code>gtag conversion</code> Google Ads (ID/etiqueta)</li>
            <li><code>fbq Lead</code> Meta Pixel</li>
            <li><code>ttq SubmitForm</code> TikTok Pixel</li>
          </ul>
          <p class="help" style="margin-top:12px">Clarity y Hotjar solo graban sesiones; no necesitan eventos.</p>
        </div>
      </aside>
    </div>`;

  // ----- fragmentos de terceros (lista local; se persiste con Guardar) -----
  function paintSnippets() {
    const host = $('#sn-list'); if (!host) return;
    if (!snippets.length) { host.innerHTML = '<p class="muted">Sin fragmentos todavía. Añade el primero con “+ Añadir fragmento”.</p>'; return; }
    host.innerHTML = snippets.map((sn, i) => `
      <div class="snippet-row ${sn.enabled ? '' : 'off'}" data-i="${i}">
        <label class="switch" title="${sn.enabled ? 'Activo en el sitio' : 'Apagado'}"><input type="checkbox" data-k="enabled" ${sn.enabled ? 'checked' : ''}><span></span></label>
        <div class="sn-main"><b>${esc(sn.name || 'Sin nombre')}</b><code>${esc(excerpt(sn.code))}</code></div>
        <select class="sn-pos" data-k="position" title="Posición">${Object.entries(SNIPPET_POSITIONS).map(([k, l]) => `<option value="${k}" ${sn.position === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
        <div class="sn-act"><button class="btn btn-ghost btn-sm" data-act="edit">Editar</button><button class="btn btn-ghost btn-sm danger" data-act="del">Eliminar</button></div>
      </div>`).join('');
  }
  paintSnippets();
  $('#sn-list').addEventListener('change', (e) => {
    const row = e.target.closest('.snippet-row'); const k = e.target.dataset.k; if (!row || !k) return;
    const sn = snippets[Number(row.dataset.i)]; if (!sn) return;
    if (k === 'enabled') sn.enabled = e.target.checked ? 1 : 0;
    if (k === 'position') sn.position = e.target.value;
    paintSnippets();
  });
  $('#sn-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const i = Number(b.closest('.snippet-row').dataset.i); const sn = snippets[i]; if (!sn) return;
    if (b.dataset.act === 'del') { if (!confirm(`¿Eliminar el fragmento "${sn.name || 'sin nombre'}"? Se borra al guardar.`)) return; snippets.splice(i, 1); paintSnippets(); }
    else openSnippetModal(sn, (upd) => { Object.assign(sn, upd); paintSnippets(); });
  });
  $('#sn-add').addEventListener('click', () => openSnippetModal(null, (sn) => { snippets.push(Object.assign({ id: newId() }, sn)); paintSnippets(); }));

  // ----- guardar -----
  const save = async () => {
    const g = (k) => { const el = $('#set-' + k); return el ? el.value.trim() : ''; };
    const body = { tracking_enabled: $('#set-tracking_enabled').checked ? '1' : '0' };
    SETTING_IDS.forEach((k) => { body[k] = g(k); });
    CODE_FIELDS.forEach(([k]) => { body[k] = $('#set-' + k).value; });
    body.whatsapp_number = body.whatsapp_number.replace(/\D/g, '') || DEFAULT_WA;
    body.snippets = JSON.stringify(snippets.map((sn) => ({ id: sn.id, name: sn.name, position: sn.position, enabled: sn.enabled ? 1 : 0, code: sn.code })));
    const btns = [$('#int-save'), $('#int-save-2')]; btns.forEach((b) => (b.disabled = true));
    try { await api('PUT', '/api/settings', body); state.settings = Object.assign({}, state.settings, body); toast('Integraciones guardadas'); v.querySelectorAll('.provider').forEach((p) => { const k = p.dataset.pv === 'google_ads' ? 'google_ads_id' : p.dataset.pv; p.classList.toggle('filled', !!body[k]); }); }
    catch (e) { if (e.message !== 'unauth') toast(e.message === 'admin only' ? 'Solo administradores' : 'Error al guardar', 'err'); }
    btns.forEach((b) => (b.disabled = false));
  };
  $('#int-save').addEventListener('click', save);
  $('#int-save-2').addEventListener('click', save);
  $('#int-copy').addEventListener('click', () => navigator.clipboard.writeText(endpoint).then(() => toast('URL copiada')).catch(() => toast('No se pudo copiar', 'err')));
}

function openSnippetModal(sn, onSave) {
  const isEdit = !!sn;
  const d = sn || { name: '', position: 'body_end', enabled: 1, code: '' };
  modal(`
    <h2>${isEdit ? 'Editar fragmento' : 'Nuevo fragmento'}</h2>
    <p class="desc">Pega el código tal como lo entrega el proveedor (chat, reseñas, Calendly, WhatsApp…). Se inyecta en la posición elegida en todas las páginas del sitio.</p>
    <div class="form-row">
      <div class="field"><label>Nombre</label><input id="sn-name" value="${esc(d.name)}" placeholder="Chat de Tawk.to"></div>
      <div class="field"><label>Posición</label><select id="sn-pos">${Object.entries(SNIPPET_POSITIONS).map(([k, l]) => `<option value="${k}" ${d.position === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
    </div>
    <div class="field"><label>Código</label><textarea id="sn-code" class="code" rows="9" spellcheck="false" placeholder="${esc('<script src="https://embed.tawk.to/XXXX/default" async></script>')}">${esc(d.code)}</textarea></div>
    <label class="check-inline"><input type="checkbox" id="sn-on" ${d.enabled ? 'checked' : ''}> Activo en el sitio</label>
    <div class="modal-foot">
      <button class="btn btn-ghost btn-sm" id="sn-cancel">Cancelar</button>
      <button class="btn btn-primary btn-sm" id="sn-ok">${isEdit ? 'Aplicar' : 'Añadir'}</button>
    </div>`, 'wide');
  $('#sn-cancel').addEventListener('click', closeModal);
  $('#sn-ok').addEventListener('click', () => {
    const upd = { name: $('#sn-name').value.trim(), position: $('#sn-pos').value, enabled: $('#sn-on').checked ? 1 : 0, code: $('#sn-code').value };
    if (!upd.name) { toast('Ponle un nombre al fragmento', 'err'); return; }
    if (!upd.code.trim()) { toast('El fragmento no tiene código', 'err'); return; }
    closeModal(); onSave(upd);
    toast('Recuerda pulsar Guardar para aplicarlo en el sitio');
  });
}

// ============================================================
//  ESTADÍSTICAS
// ============================================================
async function viewStats(month) {
  const v = $('#view');
  v.innerHTML = `<div class="empty">Cargando…</div>`;
  let s;
  try { s = await api('GET', '/api/stats' + (month ? `?month=${encodeURIComponent(month)}` : '')); }
  catch (e) { if (e.message !== 'unauth') v.innerHTML = '<div class="empty">No se pudieron cargar las estadísticas.</div>'; return; }
  const monthly = s.monthly || [], loss = s.lossBreakdown || [], byService = s.byService || [], byCity = s.byCity || [], funnel = s.funnel || {}, k = s.kpi || {};
  const maxBar = Math.max(1, ...monthly.flatMap((m) => [m.created, m.won, m.lost]));
  const maxLoss = Math.max(1, ...loss.map((l) => l.count));
  const maxSvc = Math.max(1, ...byService.map((x) => x.count));
  const maxCity = Math.max(1, ...byCity.map((x) => x.count));
  const funnelMax = Math.max(1, ...STATUSES.map((st) => Number(funnel[st]) || 0));
  const scoped = !!s.month;
  const monthOpts = ['<option value="">Todos los meses</option>',
    ...(s.availableMonths || []).slice().reverse().map((m) => `<option value="${esc(m)}" ${m === s.month ? 'selected' : ''}>${fmtMonthLong(m)}</option>`)].join('');
  const num = (x) => (x === null || x === undefined || x === '' ? '—' : x);
  const kpis = [
    ['', scoped ? 'Leads del mes' : 'Leads totales', num(k.total)],
    scoped ? ['red', 'Perdidos', num(k.lost)] : ['blue', 'Nuevos este mes', num(k.newThisMonth)],
    ['green', 'Ganados', num(k.won)],
    ['green', 'Tasa de cierre', num(k.winRate), '%'],
    ['violet', 'Tiempo medio a cotización', num(k.avgHoursToQuote), 'h'],
    ['teal', 'SLA 24 h cumplido', num(k.slaRate), '%'],
    ['red', 'Vencidos sin cotizar', num(k.overdue)],
  ];

  v.innerHTML = `
    <div class="topbar">
      <div><span class="ey">Análisis</span><h1>Estadísticas</h1></div>
      <div class="tools"><label class="month-lab" for="stat-month">Filtrar por mes</label><select id="stat-month" class="month-sel">${monthOpts}</select></div>
    </div>

    <div class="kpis">
      ${kpis.map(([cls, lab, val, suf]) => `<div class="kpi ${cls}"><div class="lab">${lab}</div><div class="val">${esc(val)}${suf && val !== '—' ? `<small>${suf}</small>` : ''}</div></div>`).join('')}
    </div>

    <div class="stat-grid">
      <div class="card-box">
        <h3>Evolución mensual</h3>
        <p class="desc">Leads creados vs. ganados vs. perdidos — últimos ${monthly.length || 6} meses.</p>
        ${monthly.length ? `<div class="chart">
          ${monthly.map((m) => `
            <div class="bar-group">
              <div class="bars">
                <div class="bar created" style="height:${(m.created / maxBar) * 100}%" data-v="${Number(m.created) || 0}"></div>
                <div class="bar won" style="height:${(m.won / maxBar) * 100}%" data-v="${Number(m.won) || 0}"></div>
                <div class="bar lost" style="height:${(m.lost / maxBar) * 100}%" data-v="${Number(m.lost) || 0}"></div>
              </div>
              <span class="bar-x">${esc(fmtMonth(m.month))}</span>
            </div>`).join('')}
        </div>
        <div class="legend">
          <span><i style="background:var(--blue)"></i>Creados</span>
          <span><i style="background:var(--green)"></i>Ganados</span>
          <span><i style="background:var(--red)"></i>Perdidos</span>
        </div>` : '<p class="muted">Aún no hay datos mensuales.</p>'}
      </div>

      <div class="card-box">
        <h3>Tasa de conversión</h3>
        <p class="desc">% de ganados sobre resueltos (ganados + perdidos) por mes.</p>
        ${monthly.length ? monthly.map((m) => `
          <div class="conv-row">
            <span class="m">${esc(fmtMonth(m.month))}</span>
            <div class="conv-track"><div class="conv-fill" style="width:${Math.min(100, Number(m.conversion) || 0)}%"></div></div>
            <span class="pct">${Number(m.conversion) || 0}%</span>
          </div>`).join('') : '<p class="muted">Sin datos.</p>'}
      </div>

      <div class="card-box">
        <h3>${scoped ? 'Embudo del mes' : 'Embudo actual'}</h3>
        <p class="desc">${scoped ? `Leads creados en ${fmtMonthLong(s.month)}, por estado.` : 'Distribución de todos los leads por estado.'}</p>
        <div class="funnel">
          ${STATUSES.map((st) => `
            <div class="fn-row">
              <span class="lab"><span class="col-dot" style="background:${STATUS_META[st].color}"></span>${STATUS_META[st].label}</span>
              <div class="fn-bar" style="width:${Math.max(8, ((Number(funnel[st]) || 0) / funnelMax) * 100)}%;background:${STATUS_META[st].color}">${Number(funnel[st]) || 0}</div>
            </div>`).join('')}
        </div>
      </div>

      <div class="card-box">
        <h3>Por servicio</h3>
        <p class="desc">Qué piden más los clientes.</p>
        ${byService.length ? byService.map((x) => `
          <div class="dist-row">
            <span class="lab" title="${esc(x.label || x.key)}">${esc(x.label || svcLabel(x.key) || x.key || 'Sin servicio')}</span>
            <div class="dist-track"><div class="dist-fill" style="width:${(x.count / maxSvc) * 100}%"></div></div>
            <span class="n">${Number(x.count) || 0}</span>
          </div>`).join('') : '<p class="muted">Sin datos.</p>'}
      </div>

      <div class="card-box">
        <h3>Por ciudad</h3>
        <p class="desc">De dónde llegan las solicitudes.</p>
        ${byCity.length ? byCity.map((x) => `
          <div class="dist-row">
            <span class="lab" title="${esc(x.city || '')}">${esc(x.city || 'Sin ciudad')}</span>
            <div class="dist-track"><div class="dist-fill navy" style="width:${(x.count / maxCity) * 100}%"></div></div>
            <span class="n">${Number(x.count) || 0}</span>
          </div>`).join('') : '<p class="muted">Sin datos.</p>'}
      </div>

      <div class="card-box">
        <h3>Motivos de pérdida</h3>
        <p class="desc">Por qué se pierden los leads.</p>
        ${loss.length ? loss.map((l) => `
          <div class="loss-row">
            <span class="lab">${esc(l.label || lossLabel(l.key || l.reason))}</span>
            <div class="loss-track"><div class="loss-fill" style="width:${(l.count / maxLoss) * 100}%"></div></div>
            <span class="n">${Number(l.count) || 0}</span>
          </div>`).join('') : '<p class="muted">Aún no hay leads perdidos.</p>'}
      </div>
    </div>`;

  $('#stat-month').addEventListener('change', (e) => viewStats(e.target.value || undefined));
}

// ---------- data loaders ----------
async function loadLeads() {
  state.leads = (await api('GET', '/api/leads')) || [];
  const b = $('#badge-leads'); if (b) b.textContent = state.leads.length || '';
}

// ============================================================
//  BOOT
// ============================================================
(async function boot() {
  // Sin sesión: si el hash cambia (p. ej. llega #expired desde /crm/auth/verify) se repinta el login con el aviso
  window.addEventListener('hashchange', () => { if (!state.me) renderLogin(); });
  try { state.me = await api('GET', '/api/me'); }
  catch (e) { if (e.message !== 'unauth') renderLogin(); return; } // 401 ya pintó el login
  try { state.meta = await api('GET', '/api/meta'); } catch (e) { state.meta = null; }
  // El comercial no puede listar usuarios: los selectores de responsable caen a "yo mismo"
  try { state.users = (await api('GET', '/api/users')) || []; } catch (e) { state.users = []; }
  if (isAdmin()) { try { state.settings = await api('GET', '/api/settings'); } catch (e) { state.settings = null; } }
  try { await loadLeads(); } catch (e) { if (e.message === 'unauth') return; state.leads = []; toast('No se pudieron cargar los leads', 'err'); }
  window.addEventListener('hashchange', syncHash);
  syncHash(); // fija la vista desde el hash (o kanban por defecto) y renderiza
  startPolling();
})();

// Hash routing: la vista actual vive en el hash (#stats, #users, #lead-<id>…) para
// que el reload conserve la página y el botón Atrás del navegador funcione.
function syncHash() {
  if (!state.me) return;
  const h = location.hash.replace(/^#/, '');
  const m = h.match(/^lead-(\d+)$/);
  if (m) { state.detailId = Number(m[1]); state.view = 'leadDetail'; }
  else if (VIEWS.includes(h)) { state.view = h; }
  else if (state.view === 'leadDetail') { state.view = 'leads'; }
  closeModal();
  renderApp();
}
