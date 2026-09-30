// ============================================================
//  Wyelee — App handler (async, portable)
//  DB async (Turso libSQL en prod / node:sqlite en local) vía ./db.js
//  Sirve el sitio estático de esta carpeta en "/" y el back office en "/crm"
//  (un solo origen). Derivado de jkd-legacy-crm/lib/app.js (misma estructura y
//  endurecimiento), sin nada específico de JKD.
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import * as db from './db.js';
import { sendMagicLink, sendLeadNotification, sendTaskReminder, cancelScheduledEmail, adelaide } from './email.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(path.join(__dirname, '..'));               // …/wyelee (raíz del proyecto = sitio)
const WEBUI_DIR = path.join(ROOT, 'webui');                          // SPA del panel (bajo /crm)
const SITE_DIR = (process.env.SITE_DIR && fs.existsSync(process.env.SITE_DIR)) ? path.resolve(process.env.SITE_DIR) : ROOT;
const IS_PROD = !!(process.env.VERCEL || process.env.NODE_ENV === 'production');
const TZ = 'Australia/Adelaide';

// ---------------- Constants (única fuente en backend) ----------------
export const STATUSES = ['nuevo', 'contactado', 'cotizado', 'agendado', 'ganado', 'perdido'];
export const STATUS_LABELS = { nuevo: 'Nuevo', contactado: 'Contactado', cotizado: 'Cotizado', agendado: 'Agendado', ganado: 'Ganado', perdido: 'Perdido' };
export const LOSS_REASONS = { no_responde: 'No responde', precio: 'Precio', fuera_zona: 'Fuera de zona', fecha: 'No hay fecha disponible', spam: 'Spam', otro: 'Otro' };
export const SERVICES = { furniture: 'Furniture assembly', wardrobe: 'Wardrobe assembly', disassembly: 'Disassembly', kitchen: 'IKEA kitchen' };
export const CONDITIONS = { new: 'New in the box', partial: 'Partially assembled', assembled: 'Already assembled' };
export const ADDONS = { packaging: 'Packaging removal', anchoring: 'Wall anchoring', disassembly: 'Disassembly of old furniture' };
export const DAYS = { weekdays: 'Weekdays', weekend: 'Weekend', either: 'Either' };
export const TIMES = { morning: 'Morning', afternoon: 'Afternoon', either: 'Either' };
export const ROLES = ['admin', 'comercial'];
export const ROLE_LABELS = { admin: 'Administrador', comercial: 'Comercial' };
export const SLA_HOURS = 24;
const SOURCES = ['quote', 'contact', 'manual'];
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PHOTOS = 6;
const MAX_PHOTO_B64 = 700000;

// ---------------- Helpers ----------------
const nowISO = () => new Date().toISOString();
const addDays = (d, n) => new Date(d.getTime() + n * 864e5);
const addMinutes = (n) => new Date(Date.now() + n * 60000);
const token = (n = 24) => crypto.randomBytes(n).toString('hex');
const shortId = () => crypto.randomBytes(4).toString('hex');
const clean = (s) => (s == null ? null : String(s).trim() || null);
const cap = (s, n) => { const v = clean(s); return v == null ? null : v.slice(0, n); };
const toISO = (v) => { if (!v) return null; const d = new Date(v); return isNaN(d.getTime()) ? null : d.toISOString(); };
const hoursBetween = (a, b) => Math.round(((new Date(b).getTime() - new Date(a).getTime()) / 36e5) * 10) / 10;
const fmtAdelaide = (iso) => adelaide(iso);

// Acepta la clave ('new') o la etiqueta ('New in the box', 'Already assembled — needs disassembly') → clave o null
function normKey(v, map) {
  const s = clean(v);
  if (!s) return null;
  if (Object.prototype.hasOwnProperty.call(map, s)) return s;
  const low = s.toLowerCase();
  for (const [k, label] of Object.entries(map)) {
    if (k.toLowerCase() === low || String(label).toLowerCase() === low) return k;
  }
  for (const [k, label] of Object.entries(map)) {
    if (low.startsWith(String(label).toLowerCase()) || String(label).toLowerCase().startsWith(low)) return k;
  }
  return null;
}
function normAddons(v) {
  const list = Array.isArray(v) ? v : String(v || '').split(',');
  const out = [];
  for (const item of list) { const k = normKey(item, ADDONS); if (k && !out.includes(k)) out.push(k); }
  return out.length ? out.join(',') : null;
}
const labelsOf = (csv, map) => String(csv || '').split(',').map((k) => map[k.trim()] || k.trim()).filter(Boolean).join(', ');
function normMobile(m) {
  const s = clean(m);
  if (!s) return null;
  return s.replace(/[^\d+()\s-]/g, '').trim().slice(0, 40) || null;
}

function send(res, code, data, headers = {}) {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  res.writeHead(code, {
    'Content-Type': typeof data === 'string' ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8',
    ...headers,
  });
  res.end(body);
}
const json = (res, code, data, headers) => send(res, code, data, headers);

// CSP del panel: solo scripts propios (app.js, sin inline), estilos propios + Google Fonts (inline por los style="" del render),
// imágenes propias/data:, fetch solo al mismo origen, nunca embebible. El sitio público no lleva CSP: carga etiquetas de terceros
// configurables desde Integraciones y una CSP fija las rompería.
const CRM_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
function setSecurityHeaders(res, isCrm) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', isCrm ? 'DENY' : 'SAMEORIGIN');
  if (isCrm) res.setHeader('Content-Security-Policy', CRM_CSP);
  if (IS_PROD) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}
function corsPublic(res, methods) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
function baseUrl(req) {
  if (process.env.APP_URL) return String(process.env.APP_URL).replace(/\/+$/, '');
  const proto = (req.headers['x-forwarded-proto'] || '').split(',')[0] || (IS_PROD ? 'https' : 'http');
  const host = (req.headers['x-forwarded-host'] || req.headers.host || 'localhost');
  return `${proto}://${host}`;
}
function clientIp(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || req.socket?.remoteAddress || '0.0.0.0';
}
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > -1) { try { out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); } catch (e) { out[p.slice(0, i).trim()] = p.slice(i + 1).trim(); } }
  });
  return out;
}
// Lee el body JSON con tope de tamaño (1 MB por defecto; 5 MB en la captura de leads con fotos).
function readBody(req, maxBytes = 1e6) {
  // Vercel (y otros frameworks) pre-parsean el body → úsalo si ya viene resuelto
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') { try { return Promise.resolve(req.body ? JSON.parse(req.body) : {}); } catch (e) { return Promise.resolve({}); } }
    if (typeof req.body === 'object') return Promise.resolve(req.body);
  }
  return new Promise((resolve) => {
    const chunks = []; let size = 0; let done = false; let timer = null;
    const parse = () => { const b = Buffer.concat(chunks).toString('utf8'); try { return b ? JSON.parse(b) : {}; } catch (e) { return {}; } };
    const finish = (v) => { if (!done) { done = true; clearTimeout(timer); resolve(v); } };
    // Salvaguarda por inactividad: si el stream ya fue consumido y no re-emite, no cuelgues
    const arm = () => { clearTimeout(timer); timer = setTimeout(() => finish(parse()), 8000); };
    req.on('data', (c) => { size += c.length; if (size > maxBytes) { req.destroy(); return finish({ __too_large: true }); } chunks.push(c); arm(); });
    req.on('end', () => finish(parse()));
    req.on('error', () => finish({}));
    arm();
  });
}
const COOKIE = 'wy_sid';
const sidCookie = (sid, days = 7) => `${COOKIE}=${sid}; HttpOnly; ${IS_PROD ? 'Secure; ' : ''}Path=/; Max-Age=${days * 86400}; SameSite=Lax`;
const clearCookie = () => `${COOKIE}=; HttpOnly; ${IS_PROD ? 'Secure; ' : ''}Path=/; Max-Age=0; SameSite=Lax`;

// Rate limit fijo por ventana, respaldado en BD (funciona entre invocaciones serverless)
async function rateOk(bucket, max, windowSec) {
  const now = Date.now();
  const row = await db.get('SELECT count, window_start FROM rate_hits WHERE bucket=?', [bucket]);
  if (!row) { await db.run('INSERT INTO rate_hits (bucket,count,window_start) VALUES (?,1,?)', [bucket, String(now)]); return true; }
  if (now - Number(row.window_start) > windowSec * 1000) {
    await db.run('UPDATE rate_hits SET count=1, window_start=? WHERE bucket=?', [String(now), bucket]);
    return true;
  }
  if (Number(row.count) < max) { await db.run('UPDATE rate_hits SET count=count+1 WHERE bucket=?', [bucket]); return true; }
  return false;
}

async function currentUser(req) {
  const sid = parseCookies(req)[COOKIE];
  if (!sid) return null;
  const s = await db.get('SELECT * FROM sessions WHERE id = ?', [sid]);
  if (!s || s.expires_at < nowISO()) return null;
  const u = await db.get('SELECT id,name,email,role,active FROM users WHERE id = ?', [s.user_id]);
  return u && u.active ? u : null;
}
async function sessionRow(req) {
  const sid = parseCookies(req)[COOKIE];
  if (!sid) return null;
  return (await db.get('SELECT * FROM sessions WHERE id = ?', [sid])) || null;
}
async function activeAdminEmails() {
  const rows = await db.all("SELECT email FROM users WHERE role='admin' AND active=1");
  return rows.map((r) => String(r.email || '').trim()).filter((e) => EMAIL_RE.test(e));
}
// Admins activos + notify_emails (csv) sin duplicados
async function notificationRecipients() {
  const set = new Set(await activeAdminEmails());
  try {
    const s = await getAllSettings();
    String(s.notify_emails || '').split(/[,;\s]+/).map((e) => e.trim()).filter((e) => EMAIL_RE.test(e)).forEach((e) => set.add(e));
  } catch (e) { /* noop */ }
  return Array.from(set);
}

// ---------------- Schema + seed + settings ----------------
let _initP = null;
export function ensureInit() { return _initP || (_initP = doInit()); }
async function doInit() {
  await db.ready();
  await ensureSchema();
  await seed();
  await ensureSettings();
  try { await db.run("DELETE FROM redirects WHERE from_path LIKE '/http%'"); } catch (e) { /* noop */ }
}
async function ensureSchema() {
  await db.execMany([
    `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, role TEXT NOT NULL DEFAULT 'comercial', active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS magic_tokens (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL, impersonator_id INTEGER)`,
    `CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY,
      name TEXT, email TEXT, mobile TEXT,
      suburb TEXT, postcode TEXT, city TEXT,
      service TEXT,
      items TEXT,
      condition TEXT,
      days TEXT, time TEXT,
      addons TEXT,
      notes TEXT,
      source TEXT DEFAULT 'quote',
      status TEXT NOT NULL DEFAULT 'nuevo',
      loss_reason TEXT, owner_id INTEGER, attribution TEXT,
      quoted_at TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS lead_files (id INTEGER PRIMARY KEY, lead_id INTEGER NOT NULL, name TEXT, mime TEXT, size INTEGER, data TEXT NOT NULL, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS lead_events (id INTEGER PRIMARY KEY, lead_id INTEGER NOT NULL, type TEXT NOT NULL, from_status TEXT, to_status TEXT, loss_reason TEXT, note TEXT, user_id INTEGER, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY, lead_id INTEGER NOT NULL, user_id INTEGER, title TEXT NOT NULL, due_at TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0, done_at TEXT, notified INTEGER NOT NULL DEFAULT 0, emailed INTEGER NOT NULL DEFAULT 0, email_id TEXT, created_by INTEGER, created_at TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(done, due_at)`,
    `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '', updated_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS redirects (id INTEGER PRIMARY KEY, from_path TEXT NOT NULL UNIQUE, to_path TEXT NOT NULL, code INTEGER NOT NULL DEFAULT 301, active INTEGER NOT NULL DEFAULT 1, hits INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS rate_hits (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, window_start TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS idx_leads_updated ON leads(updated_at)`,
    `CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status)`,
    `CREATE INDEX IF NOT EXISTS idx_events_lead ON lead_events(lead_id)`,
    `CREATE INDEX IF NOT EXISTS idx_files_lead ON lead_files(lead_id)`,
  ]);
  // Migraciones idempotentes para BDs preexistentes (columnas ya incluidas arriba en BDs nuevas)
  for (const stmt of [
    'ALTER TABLE leads ADD COLUMN attribution TEXT',
    'ALTER TABLE leads ADD COLUMN quoted_at TEXT',
    'ALTER TABLE sessions ADD COLUMN impersonator_id INTEGER',
    'ALTER TABLE tasks ADD COLUMN notified INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE tasks ADD COLUMN emailed INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE tasks ADD COLUMN email_id TEXT',
    'ALTER TABLE tasks ADD COLUMN created_by INTEGER',
  ]) {
    try { await db.run(stmt); } catch (e) { /* la columna ya existe */ }
  }
}
async function seed() {
  const c = await db.get('SELECT COUNT(*) c FROM users');
  if (Number(c.c) > 0) return;
  const t = nowISO();
  const adminEmail = (process.env.ADMIN_EMAIL || 'juan.garcia@wearedatalab.co').trim().toLowerCase();
  const admin2 = (process.env.ADMIN_EMAIL_2 || 'Kenleong23@wyeleeassembly.com.au').trim().toLowerCase();
  await db.run('INSERT INTO users (name,email,role,active,created_at) VALUES (?,?,?,1,?)', ['Administrador', adminEmail, 'admin', t]);
  if (admin2 && admin2 !== adminEmail) {
    await db.run('INSERT OR IGNORE INTO users (name,email,role,active,created_at) VALUES (?,?,?,1,?)', ['Ken Leong', admin2, 'admin', t]);
  }
  console.log('· Seed: admins (' + adminEmail + (admin2 && admin2 !== adminEmail ? ', ' + admin2 : '') + '), 0 leads.');
}

const DEFAULT_SETTINGS = {
  tracking_enabled: '0',
  ga4_id: '', gtm_id: '', google_ads_id: '', google_ads_label: '',
  meta_pixel_id: '', tiktok_pixel_id: '', clarity_id: '', hotjar_id: '',
  custom_head: '', custom_body_start: '', custom_body_end: '',
  snippets: '[]',
  notify_emails: '',
  whatsapp_number: '61432470313',
};
const ALLOWED_SETTING_KEYS = Object.keys(DEFAULT_SETTINGS);
const SNIPPET_POSITIONS = ['head', 'body_start', 'body_end'];
async function ensureSettings() {
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    await db.run('INSERT OR IGNORE INTO settings (key,value,updated_at) VALUES (?,?,?)', [k, v, nowISO()]);
  }
}
async function getAllSettings() {
  const o = { ...DEFAULT_SETTINGS };
  for (const r of await db.all('SELECT key,value FROM settings')) o[r.key] = r.value;
  return o;
}
function parseSnippets(raw) {
  let arr;
  try { arr = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw; } catch (e) { arr = []; }
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const s of arr) {
    if (!s || typeof s !== 'object') continue;
    const code = String(s.code == null ? '' : s.code).slice(0, 20000);
    const name = cap(s.name, 80) || 'Fragmento';
    const position = SNIPPET_POSITIONS.includes(s.position) ? s.position : 'body_end';
    const enabled = (s.enabled === true || s.enabled === 1 || s.enabled === '1') ? 1 : 0;
    const id = String(s.id || '').replace(/[^\w-]/g, '').slice(0, 24) || shortId();
    out.push({ id, name, position, enabled, code });
    if (out.length >= 50) break;
  }
  return out;
}
function publicSiteConfig(s) {
  const enabled = s.tracking_enabled === '1';
  if (!enabled) {
    return {
      enabled: false, ga4_id: '', gtm_id: '', google_ads_id: '', google_ads_label: '', meta_pixel_id: '', tiktok_pixel_id: '',
      clarity_id: '', hotjar_id: '', custom_head: '', custom_body_start: '', custom_body_end: '', snippets: [],
    };
  }
  return {
    enabled: true,
    ga4_id: s.ga4_id || '', gtm_id: s.gtm_id || '', google_ads_id: s.google_ads_id || '', google_ads_label: s.google_ads_label || '',
    meta_pixel_id: s.meta_pixel_id || '', tiktok_pixel_id: s.tiktok_pixel_id || '', clarity_id: s.clarity_id || '', hotjar_id: s.hotjar_id || '',
    custom_head: s.custom_head || '', custom_body_start: s.custom_body_start || '', custom_body_end: s.custom_body_end || '',
    snippets: parseSnippets(s.snippets).filter((x) => x.enabled).map(({ id, name, position, code }) => ({ id, name, position, code })),
  };
}

// ---------------- Redirects ----------------
function normFrom(s) {
  s = String(s || '').trim();
  if (!s) return '';
  const u = s.match(/^https?:\/\/[^/]+(\/[^\s]*)?$/i);
  if (u) s = u[1] || '/';
  s = s.split('#')[0].split('?')[0];
  if (!s.startsWith('/')) s = '/' + s;
  if (s.length > 1) s = s.replace(/\/+$/, '') || '/';
  return s;
}
function normTo(s) {
  s = String(s || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (!s.startsWith('/')) s = '/' + s;
  return s;
}
async function findRedirect(pathname) {
  const key = pathname.length > 1 ? (pathname.replace(/\/+$/, '') || '/') : pathname;
  return (await db.get('SELECT id, to_path, code FROM redirects WHERE active=1 AND from_path=? LIMIT 1', [key])) || null;
}

// ---------------- Auth ----------------
async function requestMagicLink(email, base) {
  try { await db.run('DELETE FROM magic_tokens WHERE used=1 OR expires_at < ?', [nowISO()]); } catch (e) { /* noop */ }
  try { await db.run('DELETE FROM sessions WHERE expires_at < ?', [nowISO()]); } catch (e) { /* noop */ }
  try { await db.run('DELETE FROM rate_hits WHERE window_start < ?', [String(Date.now() - 864e5)]); } catch (e) { /* noop: cubos de rate-limit de hace más de un día */ }
  const u = await db.get('SELECT * FROM users WHERE lower(email)=lower(?) AND active=1', [email]);
  if (!u) return { ok: false };
  try { await db.run('UPDATE magic_tokens SET used=1 WHERE user_id=? AND used=0', [u.id]); } catch (e) { /* noop */ }
  const t = token(24);
  await db.run('INSERT INTO magic_tokens (token,user_id,expires_at,used,created_at) VALUES (?,?,?,0,?)', [t, u.id, addMinutes(15).toISOString(), nowISO()]);
  const link = `${base}/crm/auth/verify?token=${t}`;
  if (process.env.RESEND_API_KEY) await sendMagicLink({ to: u.email, name: u.name, link });
  if (!IS_PROD) console.log(`\n  ✉  Magic link para ${u.email} (${u.name}):\n     ${link}\n`);
  return { ok: true, link, name: u.name };
}
async function verifyToken(t) {
  if (!t || !/^[a-f0-9]{20,64}$/i.test(t)) return null;
  const row = await db.get('SELECT * FROM magic_tokens WHERE token=?', [t]);
  if (!row || row.used || row.expires_at < nowISO()) return null;
  await db.run('UPDATE magic_tokens SET used=1 WHERE token=?', [t]);
  const sid = token(24);
  await db.run('INSERT INTO sessions (id,user_id,expires_at,created_at) VALUES (?,?,?,?)', [sid, row.user_id, addDays(new Date(), 7).toISOString(), nowISO()]);
  return sid;
}

// ---------------- Leads: normalización / validación ----------------
// Devuelve { ok:true, lead } o { ok:false, error }
function normalizeLead(b, source) {
  const out = {};
  const isContact = source === 'contact';
  out.name = cap(b.name, 120);
  let email = cap(b.email, 160);
  let mobile = normMobile(b.mobile);
  if (isContact) {
    const c = cap(b.contact, 160);
    if (c) { if (c.includes('@')) email = email || c; else mobile = mobile || normMobile(c); }
  }
  if (email && !EMAIL_RE.test(email)) return { ok: false, error: 'Invalid email address' };
  if (!email && !mobile) return { ok: false, error: 'Mobile or email is required' };
  out.email = email ? email.toLowerCase() : null;
  out.mobile = mobile;
  out.suburb = cap(b.suburb, 80);
  const pc = cap(b.postcode, 10);
  if (pc && !/^\d{4}$/.test(pc)) return { ok: false, error: 'Postcode must be 4 digits' };
  out.postcode = pc;
  out.city = cap(b.city, 80);
  out.service = isContact ? null : normKey(b.service, SERVICES);
  out.items = cap(b.items, 4000);
  out.condition = normKey(b.condition, CONDITIONS);
  out.days = normKey(b.days, DAYS);
  out.time = normKey(b.time, TIMES);
  out.addons = normAddons(b.addons);
  out.notes = cap(isContact ? (b.message != null ? b.message : b.notes) : (b.notes != null ? b.notes : b.message), 4000);
  return { ok: true, lead: out };
}
function normalizePhotos(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const p of list) {
    if (!p || typeof p !== 'object') continue;
    const type = String(p.type || p.mime || '').toLowerCase().trim();
    if (!PHOTO_TYPES.includes(type)) continue;
    let data = String(p.data || '');
    const m = data.match(/^data:[^;]+;base64,(.*)$/s);
    if (m) data = m[1];
    data = data.replace(/\s+/g, '');
    if (!data || data.length > MAX_PHOTO_B64 || !/^[A-Za-z0-9+/=]+$/.test(data)) continue;
    const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
    const name = (cap(p.name, 120) || `photo-${out.length + 1}.${ext}`).replace(/[\\/:*?"<>|]+/g, '_');
    out.push({ name, mime: type, size: Math.floor(data.length * 3 / 4), data });
    if (out.length >= MAX_PHOTOS) break;
  }
  return out;
}
function channelOf(attr) {
  if (!attr || typeof attr !== 'object') return 'directo';
  const src = clean(attr.utm_source), med = clean(attr.utm_medium);
  if (src) return (src + (med ? '/' + med : '')).slice(0, 60);
  if (clean(attr.gclid)) return 'google/cpc';
  const ref = clean(attr.referrer);
  if (ref) { try { return new URL(ref).hostname.replace(/^www\./, '').slice(0, 60); } catch (e) { return String(ref).slice(0, 60); } }
  return 'directo';
}
function attributionJson(attr) {
  if (!attr || typeof attr !== 'object') return null;
  const keep = {};
  for (const k of ['page', 'referrer', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'channel', 'landing']) {
    if (attr[k] != null && String(attr[k]).trim() !== '') keep[k] = String(attr[k]).slice(0, 300);
  }
  const j = JSON.stringify(keep);
  return j.length > 2000 ? j.slice(0, 2000) : j;
}
function leadLabels(l) {
  return {
    ...l,
    service_label: l.service ? (SERVICES[l.service] || l.service) : null,
    condition_label: l.condition ? (CONDITIONS[l.condition] || l.condition) : null,
    days_label: l.days ? (DAYS[l.days] || l.days) : null,
    time_label: l.time ? (TIMES[l.time] || l.time) : null,
    addons_label: l.addons ? labelsOf(l.addons, ADDONS) : null,
    status_label: l.status ? (STATUS_LABELS[l.status] || l.status) : null,
  };
}
async function leadRow(r) {
  if (!r) return r;
  const owner = r.owner_id ? await db.get('SELECT name FROM users WHERE id=?', [r.owner_id]) : null;
  return { ...r, owner_name: owner ? owner.name : null, hours_open: hoursBetween(r.created_at, nowISO()) };
}
const LEAD_COLS = 'name,email,mobile,suburb,postcode,city,service,items,condition,days,time,addons,notes';
async function insertLead(lead, { source, status = 'nuevo', ownerId = null, attribution = null, t = nowISO() }) {
  const r = await db.run(`INSERT INTO leads (${LEAD_COLS},source,status,owner_id,attribution,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [lead.name, lead.email, lead.mobile, lead.suburb, lead.postcode, lead.city, lead.service, lead.items, lead.condition, lead.days, lead.time, lead.addons, lead.notes,
      source, status, ownerId, attribution, t, t]);
  return r.lastInsertRowid;
}

// ---------------- Tareas: programación de recordatorios ----------------
async function taskRecipients(task) {
  if (task.user_id) {
    const u = await db.get('SELECT email FROM users WHERE id=? AND active=1', [task.user_id]);
    if (u && EMAIL_RE.test(String(u.email || ''))) return [u.email];
  }
  return activeAdminEmails();
}
// Programa el recordatorio en Resend (scheduled_at = due_at). Guarda email_id/emailed. Nunca lanza.
async function scheduleTaskEmail(task, base) {
  try {
    if (!process.env.RESEND_API_KEY || !task || task.done) return;
    if (new Date(task.due_at).getTime() <= Date.now()) { await db.run('UPDATE tasks SET emailed=0, email_id=NULL WHERE id=?', [task.id]); return; } // vencida: la manda el respaldo
    const lead = await db.get('SELECT * FROM leads WHERE id=?', [task.lead_id]);
    const to = await taskRecipients(task);
    if (!to.length) return;
    const r = await sendTaskReminder({ to, task, lead: leadLabels(lead || {}), crmLink: `${base}/crm#lead-${task.lead_id}`, scheduledAt: task.due_at });
    if (r && r.ok && r.id) await db.run('UPDATE tasks SET emailed=1, email_id=? WHERE id=?', [r.id, task.id]);
    else await db.run('UPDATE tasks SET emailed=0, email_id=NULL WHERE id=?', [task.id]);
  } catch (e) { console.error('[tasks] schedule', e?.message || e); }
}
async function cancelTaskEmail(task) {
  try {
    if (!task || !task.email_id) return;
    if (new Date(task.due_at).getTime() > Date.now()) await cancelScheduledEmail(task.email_id);
    await db.run('UPDATE tasks SET email_id=NULL WHERE id=?', [task.id]);
  } catch (e) { console.error('[tasks] cancel', e?.message || e); }
}
// Respaldo: envía por correo toda tarea abierta vencida con emailed=0 y la marca emailed=1.
async function processDueReminders(base) {
  let sent = 0, checked = 0;
  try {
    const rows = await db.all('SELECT * FROM tasks WHERE done=0 AND emailed=0 AND due_at <= ? ORDER BY due_at ASC LIMIT 50', [nowISO()]);
    checked = rows.length;
    for (const task of rows) {
      const lead = await db.get('SELECT * FROM leads WHERE id=?', [task.lead_id]);
      const to = await taskRecipients(task);
      let ok = false;
      if (to.length && process.env.RESEND_API_KEY) {
        const r = await sendTaskReminder({ to, task, lead: leadLabels(lead || {}), crmLink: `${base}/crm#lead-${task.lead_id}` });
        ok = !!(r && r.ok);
      }
      // Sin RESEND_API_KEY (local) también se marca: no hay nada que reintentar y evita crecer la cola
      if (ok || !process.env.RESEND_API_KEY) { await db.run('UPDATE tasks SET emailed=1 WHERE id=?', [task.id]); if (ok) sent++; }
    }
  } catch (e) { console.error('[tasks] due-reminders', e?.message || e); }
  return { checked, sent };
}
const TASK_SELECT = `SELECT t.id, t.lead_id, l.name lead_name, l.mobile lead_mobile, l.status lead_status, t.user_id, u.name user_name, t.title, t.due_at, t.done, t.done_at, t.notified, t.emailed, t.created_by, t.created_at
  FROM tasks t LEFT JOIN leads l ON l.id=t.lead_id LEFT JOIN users u ON u.id=t.user_id`;
const taskOut = (r, now) => ({ ...r, done: Number(r.done) ? 1 : 0, overdue: !Number(r.done) && r.due_at < now });
const dayKey = (iso) => { try { return new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ }); } catch (e) { return ''; } };

// ---------------- Stats ----------------
async function buildStats(monthArg) {
  const distinct = (await db.all(`SELECT DISTINCT substr(created_at,1,7) m FROM leads WHERE created_at IS NOT NULL`)).map((r) => r.m);
  const curMonth = new Date().toISOString().slice(0, 7);
  const availableMonths = Array.from(new Set([...distinct, curMonth])).sort();
  const month = monthArg && /^\d{4}-\d{2}$/.test(monthArg) && availableMonths.includes(monthArg) ? monthArg : null;
  const inMonth = month ? ` AND substr(created_at,1,7)='${month}'` : '';
  const inMonthW = month ? ` WHERE substr(created_at,1,7)='${month}'` : '';

  const funnel = {};
  for (const s of STATUSES) funnel[s] = Number((await db.get(`SELECT COUNT(*) c FROM leads WHERE status=?${inMonth}`, [s])).c);
  const total = Number((await db.get(`SELECT COUNT(*) c FROM leads${inMonthW}`)).c);

  const months = [];
  const d0 = new Date();
  for (let i = 5; i >= 0; i--) months.push(new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() - i, 1)).toISOString().slice(0, 7));
  const map = (rows) => Object.fromEntries(rows.map((r) => [r.m, Number(r.c)]));
  const cM = map(await db.all(`SELECT substr(created_at,1,7) m, COUNT(*) c FROM leads GROUP BY m`));
  const wM = map(await db.all(`SELECT substr(created_at,1,7) m, COUNT(*) c FROM lead_events WHERE type='status' AND to_status='ganado' GROUP BY m`));
  const lM = map(await db.all(`SELECT substr(created_at,1,7) m, COUNT(*) c FROM lead_events WHERE type='status' AND to_status='perdido' GROUP BY m`));
  const monthly = months.map((m) => {
    const created = cM[m] || 0, won = wM[m] || 0, lost = lM[m] || 0;
    const resolved = won + lost;
    return { month: m, created, won, lost, conversion: resolved ? Math.round((won / resolved) * 100) : 0 };
  });

  const lossRows = await db.all(`SELECT loss_reason r, COUNT(*) c FROM leads WHERE status='perdido' AND loss_reason IS NOT NULL${inMonth} GROUP BY r ORDER BY c DESC`);
  const lossBreakdown = lossRows.map((r) => ({ key: r.r, label: LOSS_REASONS[r.r] || r.r, count: Number(r.c) }));

  const svcRows = await db.all(`SELECT service s, COUNT(*) c FROM leads WHERE 1=1${inMonth} GROUP BY s ORDER BY c DESC`);
  const byService = svcRows.map((r) => ({ key: r.s || 'contact', label: r.s ? (SERVICES[r.s] || r.s) : 'Contacto (sin servicio)', count: Number(r.c) }));
  const cityRows = await db.all(`SELECT coalesce(nullif(trim(city),''),'—') city, COUNT(*) c FROM leads WHERE 1=1${inMonth} GROUP BY 1 ORDER BY c DESC LIMIT 20`);
  const byCity = cityRows.map((r) => ({ city: r.city, count: Number(r.c) }));

  let won, lost;
  if (month) {
    won = Number((await db.get(`SELECT COUNT(*) c FROM lead_events WHERE type='status' AND to_status='ganado' AND substr(created_at,1,7)='${month}'`)).c);
    lost = Number((await db.get(`SELECT COUNT(*) c FROM lead_events WHERE type='status' AND to_status='perdido' AND substr(created_at,1,7)='${month}'`)).c);
  } else { won = funnel.ganado; lost = funnel.perdido; }
  const winRate = won + lost ? Math.round((won / (won + lost)) * 100) : 0;
  const newThisMonth = month ? total : (cM[months[months.length - 1]] || 0);
  const active = funnel.nuevo + funnel.contactado + funnel.cotizado + funnel.agendado;

  // SLA: tiempo medio hasta cotizar y % dentro de 24 h (sobre leads con quoted_at)
  const qRows = await db.all(`SELECT created_at, quoted_at FROM leads WHERE quoted_at IS NOT NULL${inMonth}`);
  let sumH = 0, within = 0;
  for (const r of qRows) { const h = (new Date(r.quoted_at).getTime() - new Date(r.created_at).getTime()) / 36e5; sumH += h; if (h <= SLA_HOURS) within++; }
  const avgHoursToQuote = qRows.length ? Math.round((sumH / qRows.length) * 10) / 10 : null;
  const slaRate = qRows.length ? Math.round((within / qRows.length) * 100) : null;
  const cutoff = new Date(Date.now() - SLA_HOURS * 36e5).toISOString();
  const overdue = Number((await db.get(`SELECT COUNT(*) c FROM leads WHERE status='nuevo' AND created_at < ?${inMonth}`, [cutoff])).c);

  return {
    funnel, total, monthly, lossBreakdown, byService, byCity, availableMonths, month,
    kpi: { total, newThisMonth, won, lost, winRate, active, avgHoursToQuote, slaRate, overdue, quoted: qRows.length },
  };
}

// ---------------- Router ----------------
export async function handle(req, res) {
  await ensureInit();
  const url = new URL(req.url, baseUrl(req));
  let p = url.pathname;
  const method = req.method;

  const isCrm = p === '/crm' || p.startsWith('/crm/');
  if (isCrm) p = p.slice(4) || '/';
  setSecurityHeaders(res, isCrm);
  const isApi = p.startsWith('/api/');

  // Redirecciones administrables (panel → Redirecciones): páginas del sitio público, GET/HEAD, no assets
  if (!isCrm && !isApi && (method === 'GET' || method === 'HEAD')) {
    const ext = path.extname(p);
    if (!ext || ext === '.html') {
      const rd = await findRedirect(p);
      if (rd) {
        try { await db.run('UPDATE redirects SET hits = hits + 1 WHERE id=?', [rd.id]); } catch (e) { /* noop */ }
        const loc = /^https?:\/\//i.test(rd.to_path) ? rd.to_path : rd.to_path + (rd.to_path.indexOf('?') === -1 ? url.search : '');
        res.writeHead(rd.code || 301, { Location: loc, 'Cache-Control': 'no-cache' });
        return res.end();
      }
    }
  }

  // ---- Público: configuración de etiquetas/código de terceros que lee el sitio ----
  if (p === '/api/public/site-config') {
    corsPublic(res, 'GET, OPTIONS');
    if (method === 'OPTIONS') return send(res, 204, '');
    if (method !== 'GET') return json(res, 405, { error: 'method' });
    return json(res, 200, publicSiteConfig(await getAllSettings()), { 'Cache-Control': 'public, max-age=60, s-maxage=300' });
  }

  // ---- Público: captura de leads (rate-limit + honeypot + validación + fotos) ----
  if (p === '/api/public/lead') {
    corsPublic(res, 'POST, OPTIONS');
    if (method === 'OPTIONS') return send(res, 204, '');
    if (method !== 'POST') return json(res, 405, { error: 'method' });
    if (!(await rateOk(`lead:${clientIp(req)}`, 20, 3600))) return json(res, 429, { error: 'Too many requests. Please try again later.' });
    const b = await readBody(req, 5e6);
    if (b && b.__too_large) return json(res, 413, { error: 'Request too large (max 4.5 MB). Please send fewer or smaller photos.' });
    if (clean(b.website)) return json(res, 201, { ok: true });                 // honeypot: no se guarda
    const source = b.source === 'contact' ? 'contact' : 'quote';
    const n = normalizeLead(b, source);
    if (!n.ok) return json(res, 400, { error: n.error });
    const t = nowISO();
    const attribution = attributionJson(b.attribution);
    const channel = channelOf(b.attribution);
    const id = await insertLead(n.lead, { source, attribution, t });
    await db.run(`INSERT INTO lead_events (lead_id,type,to_status,note,created_at) VALUES (?, 'created','nuevo',?, ?)`,
      [id, `Recibido desde el sitio web (${source}) · ${channel}`, t]);
    const photos = source === 'quote' || Array.isArray(b.photos) ? normalizePhotos(b.photos) : [];
    for (const ph of photos) {
      await db.run('INSERT INTO lead_files (lead_id,name,mime,size,data,created_at) VALUES (?,?,?,?,?,?)', [id, ph.name, ph.mime, ph.size, ph.data, t]);
    }
    // Notifica por correo a los administradores (+ notify_emails). Best-effort: nunca rompe la captura.
    try {
      const to = await notificationRecipients();
      if (to.length) {
        const page = (b.attribution && typeof b.attribution === 'object' && b.attribution.page) ? String(b.attribution.page).slice(0, 200) : null;
        await sendLeadNotification({
          to,
          crmLink: `${baseUrl(req)}/crm#lead-${id}`,
          lead: { ...leadLabels({ ...n.lead, source, status: 'nuevo' }), channel, page, created_label: fmtAdelaide(t) },
          files: photos.map((ph) => ({ name: ph.name, mime: ph.mime, data: ph.data })),
        });
      }
    } catch (e) { console.error('[lead] notify', e?.message || e); }
    return json(res, 201, { ok: true, id });
  }

  // ---- Auth (público) — rate-limited, respuesta neutra (sin enumeración, sin token en prod) ----
  if (p === '/api/auth/request' && method === 'POST') {
    if (!(await rateOk(`auth:${clientIp(req)}`, 6, 900))) return json(res, 429, { error: 'Demasiados intentos. Espera unos minutos.' });
    const b = await readBody(req);
    const r = await requestMagicLink(String(b.email || '').trim().slice(0, 160), baseUrl(req));
    return json(res, 200, { ok: true, ...(!IS_PROD && r.ok ? { devLink: r.link } : {}) });
  }
  if (p === '/auth/verify' && method === 'GET') {
    const sid = await verifyToken(url.searchParams.get('token') || '');
    if (sid) { res.setHeader('Set-Cookie', sidCookie(sid, 7)); res.writeHead(302, { Location: '/crm', 'Cache-Control': 'no-store' }); return res.end(); }
    res.writeHead(302, { Location: '/crm#expired', 'Cache-Control': 'no-store' });
    return res.end();
  }
  if (p === '/api/auth/logout' && method === 'POST') {
    const sid = parseCookies(req)[COOKIE];
    if (sid) await db.run('DELETE FROM sessions WHERE id=?', [sid]);
    res.setHeader('Set-Cookie', clearCookie());
    return json(res, 200, { ok: true });
  }

  // ---- Cron (Vercel): respaldo de recordatorios por correo. Sin sesión; protegido por CRON_SECRET ----
  if (p === '/api/cron/tasks' && (method === 'GET' || method === 'POST')) {
    const secret = process.env.CRON_SECRET;
    // En producción el cron exige CRON_SECRET; sin él, se rechaza (en local queda abierto para pruebas)
    if (!secret && IS_PROD) return json(res, 401, { error: 'CRON_SECRET not configured' });
    if (secret) {
      const auth = String(req.headers.authorization || '');
      const given = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
      const a = Buffer.from(given), s = Buffer.from(secret);
      if (a.length !== s.length || !crypto.timingSafeEqual(a, s)) return json(res, 401, { error: 'unauthorized' });
    }
    const r = await processDueReminders(baseUrl(req));
    return json(res, 200, { ok: true, ...r, at: nowISO() }, { 'Cache-Control': 'no-store' });
  }

  // ---- API protegida ----
  if (isApi) {
    res.setHeader('Cache-Control', 'no-store');
    const user = await currentUser(req);
    if (!user) return json(res, 401, { error: 'unauthorized' });
    const isAdmin = user.role === 'admin';
    const now = nowISO();

    if (p === '/api/me' && method === 'GET') {
      const sess = await sessionRow(req);
      let impersonating = null;
      if (sess && sess.impersonator_id) {
        const adm = await db.get('SELECT id,name FROM users WHERE id=?', [sess.impersonator_id]);
        if (adm) impersonating = { id: adm.id, name: adm.name };
      }
      return json(res, 200, { id: user.id, name: user.name, email: user.email, role: user.role, impersonating });
    }
    if (p === '/api/auth/stop-impersonate' && method === 'POST') {
      const sess = await sessionRow(req);
      if (!sess || !sess.impersonator_id) return json(res, 400, { error: 'not impersonating' });
      const admin = await db.get('SELECT * FROM users WHERE id=? AND active=1', [sess.impersonator_id]);
      if (!admin) return json(res, 401, { error: 'unauthorized' });
      const sid = token(24);
      await db.run('INSERT INTO sessions (id,user_id,expires_at,created_at) VALUES (?,?,?,?)', [sid, admin.id, addDays(new Date(), 7).toISOString(), now]);
      await db.run('DELETE FROM sessions WHERE id=?', [sess.id]);
      res.setHeader('Set-Cookie', sidCookie(sid, 7));
      return json(res, 200, { ok: true });
    }
    if (p === '/api/meta' && method === 'GET') {
      return json(res, 200, {
        statuses: STATUSES, statusLabels: STATUS_LABELS, lossReasons: LOSS_REASONS, services: SERVICES, conditions: CONDITIONS,
        addons: ADDONS, days: DAYS, times: TIMES, roles: ROLES, roleLabels: ROLE_LABELS, slaHours: SLA_HOURS, sources: SOURCES,
      });
    }

    // Leads (lista): filtrado en SQL, owner por JOIN, contadores por subconsulta, tope 1000
    if (p === '/api/leads' && method === 'GET') {
      const status = url.searchParams.get('status');
      const service = url.searchParams.get('service');
      const city = (url.searchParams.get('city') || '').trim().slice(0, 80);
      const qraw = (url.searchParams.get('q') || '').toLowerCase().slice(0, 80);
      const clauses = []; const args = [];
      if (status && STATUSES.includes(status)) { clauses.push('l.status=?'); args.push(status); }
      if (service) { if (SERVICES[service]) { clauses.push('l.service=?'); args.push(service); } else if (service === 'contact' || service === 'none') clauses.push('l.service IS NULL'); }
      if (city) { clauses.push('lower(coalesce(l.city,\'\'))=lower(?)'); args.push(city); }
      if (qraw) {
        const like = '%' + qraw.replace(/[\\%_]/g, (m) => '\\' + m) + '%';
        clauses.push("(lower(coalesce(l.name,'')||' '||coalesce(l.email,'')||' '||coalesce(l.mobile,'')||' '||coalesce(l.suburb,'')||' '||coalesce(l.postcode,'')||' '||coalesce(l.items,'')) LIKE ? ESCAPE '\\')");
        args.push(like);
      }
      const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
      const rows = await db.all(`SELECT l.*, u.name owner_name,
          (SELECT COUNT(*) FROM lead_files f WHERE f.lead_id=l.id) photos,
          (SELECT COUNT(*) FROM tasks t WHERE t.lead_id=l.id AND t.done=0) open_tasks,
          (SELECT t.id FROM tasks t WHERE t.lead_id=l.id AND t.done=0 ORDER BY t.due_at ASC LIMIT 1) nt_id,
          (SELECT t.title FROM tasks t WHERE t.lead_id=l.id AND t.done=0 ORDER BY t.due_at ASC LIMIT 1) nt_title,
          (SELECT t.due_at FROM tasks t WHERE t.lead_id=l.id AND t.done=0 ORDER BY t.due_at ASC LIMIT 1) nt_due
        FROM leads l LEFT JOIN users u ON u.id=l.owner_id ${where} ORDER BY datetime(l.updated_at) DESC LIMIT 1000`, args);
      return json(res, 200, rows.map((r) => {
        const { nt_id, nt_title, nt_due, ...rest } = r;
        return {
          ...rest, photos: Number(r.photos || 0), open_tasks: Number(r.open_tasks || 0),
          hours_open: hoursBetween(r.created_at, now),
          next_task: nt_id ? { id: nt_id, title: nt_title, due_at: nt_due } : null,
        };
      }));
    }
    if (p === '/api/leads' && method === 'POST') {
      const b = await readBody(req);
      const n = normalizeLead(b, b.source === 'contact' ? 'contact' : 'quote');
      if (!n.ok) return json(res, 400, { error: n.error });
      const t = nowISO();
      let ownerId = user.id;
      if ('owner_id' in b) ownerId = b.owner_id ? Number(b.owner_id) || null : null;
      const id = await insertLead(n.lead, { source: 'manual', ownerId, t });
      await db.run(`INSERT INTO lead_events (lead_id,type,to_status,note,user_id,created_at) VALUES (?, 'created','nuevo',?,?,?)`, [id, 'Creado manualmente en el panel', user.id, t]);
      return json(res, 201, await leadRow(await db.get('SELECT * FROM leads WHERE id=?', [id])));
    }
    const leadMatch = p.match(/^\/api\/leads\/(\d+)(\/status|\/note|\/tasks|\/files\/(\d+))?$/);
    if (leadMatch) {
      const id = Number(leadMatch[1]);
      const sub = leadMatch[2] || '';
      const lead = await db.get('SELECT * FROM leads WHERE id=?', [id]);
      if (!lead) return json(res, 404, { error: 'not found' });

      if (!sub && method === 'GET') {
        const events = await db.all(`SELECT e.*, u.name user_name FROM lead_events e LEFT JOIN users u ON u.id=e.user_id WHERE e.lead_id=? ORDER BY datetime(e.created_at) ASC, e.id ASC`, [id]);
        const files = await db.all('SELECT id,name,mime,size,created_at FROM lead_files WHERE lead_id=? ORDER BY id ASC', [id]);
        const tasks = (await db.all(`${TASK_SELECT} WHERE t.lead_id=? ORDER BY t.done ASC, t.due_at ASC`, [id])).map((r) => taskOut(r, now));
        return json(res, 200, { ...(await leadRow(lead)), events, files, tasks, photos: files.length });
      }
      if (sub.startsWith('/files/') && method === 'GET') {
        const fid = Number(leadMatch[3]);
        const f = await db.get('SELECT * FROM lead_files WHERE id=? AND lead_id=?', [fid, id]);
        if (!f) return json(res, 404, { error: 'not found' });
        let buf;
        try { buf = Buffer.from(String(f.data), 'base64'); } catch (e) { return json(res, 500, { error: 'bad file' }); }
        res.writeHead(200, {
          'Content-Type': PHOTO_TYPES.includes(f.mime) ? f.mime : 'application/octet-stream',
          'Content-Length': buf.length,
          'Cache-Control': 'private, max-age=3600',
          'Content-Disposition': `inline; filename="${String(f.name || 'photo').replace(/[^\w.\-]+/g, '_')}"`,
        });
        return res.end(buf);
      }
      if (!sub && method === 'PATCH') {
        const b = await readBody(req);
        const sets = [], vals = [];
        const setf = (f, v) => { sets.push(`${f}=?`); vals.push(v); };
        if ('name' in b) setf('name', cap(b.name, 120));
        if ('email' in b) { const em = cap(b.email, 160); if (em && !EMAIL_RE.test(em)) return json(res, 400, { error: 'Correo inválido' }); setf('email', em ? em.toLowerCase() : null); }
        if ('mobile' in b) setf('mobile', normMobile(b.mobile));
        if ('suburb' in b) setf('suburb', cap(b.suburb, 80));
        if ('postcode' in b) { const pc = cap(b.postcode, 10); if (pc && !/^\d{4}$/.test(pc)) return json(res, 400, { error: 'El código postal debe tener 4 dígitos' }); setf('postcode', pc); }
        if ('city' in b) setf('city', cap(b.city, 80));
        if ('service' in b) setf('service', normKey(b.service, SERVICES));
        if ('items' in b) setf('items', cap(b.items, 4000));
        if ('condition' in b) setf('condition', normKey(b.condition, CONDITIONS));
        if ('days' in b) setf('days', normKey(b.days, DAYS));
        if ('time' in b) setf('time', normKey(b.time, TIMES));
        if ('addons' in b) setf('addons', normAddons(b.addons));
        if ('notes' in b) setf('notes', cap(b.notes, 4000));
        if ('owner_id' in b) {
          const oid = b.owner_id ? Number(b.owner_id) || null : null;
          if (oid && !(await db.get('SELECT id FROM users WHERE id=? AND active=1', [oid]))) return json(res, 400, { error: 'Responsable inválido' });
          setf('owner_id', oid);
        }
        if (sets.length) { vals.push(nowISO(), id); await db.run(`UPDATE leads SET ${sets.join(',')}, updated_at=? WHERE id=?`, vals); }
        return json(res, 200, await leadRow(await db.get('SELECT * FROM leads WHERE id=?', [id])));
      }
      if (sub === '/status' && method === 'PATCH') {
        const b = await readBody(req);
        const status = String(b.status || '');
        if (!STATUSES.includes(status)) return json(res, 400, { error: 'Estado inválido' });
        let loss = null;
        if (status === 'perdido') { loss = String(b.loss_reason || ''); if (!LOSS_REASONS[loss]) return json(res, 400, { error: 'loss_reason required' }); }
        const t = nowISO();
        const quotedAt = (status === 'cotizado' && !lead.quoted_at) ? t : (lead.quoted_at || null);
        await db.run('UPDATE leads SET status=?, loss_reason=?, quoted_at=?, updated_at=? WHERE id=?', [status, loss, quotedAt, t, id]);
        await db.run(`INSERT INTO lead_events (lead_id,type,from_status,to_status,loss_reason,user_id,created_at) VALUES (?, 'status',?,?,?,?,?)`, [id, lead.status, status, loss, user.id, t]);
        return json(res, 200, await leadRow(await db.get('SELECT * FROM leads WHERE id=?', [id])));
      }
      if (sub === '/note' && method === 'POST') {
        const b = await readBody(req);
        const note = cap(b.note, 4000);
        if (!note) return json(res, 400, { error: 'empty' });
        const t = nowISO();
        await db.run(`INSERT INTO lead_events (lead_id,type,note,user_id,created_at) VALUES (?, 'note',?,?,?)`, [id, note, user.id, t]);
        await db.run('UPDATE leads SET updated_at=? WHERE id=?', [t, id]);
        return json(res, 201, { ok: true });
      }
      if (sub === '/tasks' && method === 'POST') {
        const b = await readBody(req);
        const title = cap(b.title, 200);
        if (!title) return json(res, 400, { error: 'Título requerido' });
        const due = toISO(b.due_at);
        if (!due) return json(res, 400, { error: 'Fecha de vencimiento inválida' });
        let userId = null;
        if (b.user_id) { const u = await db.get('SELECT id FROM users WHERE id=? AND active=1', [Number(b.user_id)]); if (!u) return json(res, 400, { error: 'Responsable inválido' }); userId = u.id; }
        const t = nowISO();
        const r = await db.run('INSERT INTO tasks (lead_id,user_id,title,due_at,done,notified,emailed,created_by,created_at) VALUES (?,?,?,?,0,0,0,?,?)', [id, userId, title, due, user.id, t]);
        await db.run(`INSERT INTO lead_events (lead_id,type,note,user_id,created_at) VALUES (?, 'task',?,?,?)`, [id, `Tarea: ${title} · vence ${fmtAdelaide(due)}`, user.id, t]);
        await db.run('UPDATE leads SET updated_at=? WHERE id=?', [t, id]);
        const task = await db.get('SELECT * FROM tasks WHERE id=?', [r.lastInsertRowid]);
        await scheduleTaskEmail(task, baseUrl(req));
        const out = await db.get(`${TASK_SELECT} WHERE t.id=?`, [task.id]);
        return json(res, 201, taskOut(out, nowISO()));
      }
      if (!sub && method === 'DELETE') {
        if (!isAdmin) return json(res, 403, { error: 'forbidden' });
        for (const tk of await db.all('SELECT * FROM tasks WHERE lead_id=?', [id])) await cancelTaskEmail(tk);
        await db.run('DELETE FROM tasks WHERE lead_id=?', [id]);
        await db.run('DELETE FROM lead_files WHERE lead_id=?', [id]);
        await db.run('DELETE FROM lead_events WHERE lead_id=?', [id]);
        await db.run('DELETE FROM leads WHERE id=?', [id]);
        return json(res, 200, { ok: true });
      }
      return json(res, 405, { error: 'method' });
    }

    // ---- Tareas / recordatorios ----
    if (p === '/api/tasks/summary' && method === 'GET') {
      // Respaldo de recordatorios por correo (tareas vencidas con emailed=0)
      await processDueReminders(baseUrl(req));
      const rows = (await db.all(`${TASK_SELECT} WHERE t.done=0 AND (t.user_id=? OR t.user_id IS NULL) ORDER BY t.due_at ASC LIMIT 500`, [user.id])).map((r) => taskOut(r, now));
      const soon = new Date(Date.now() + 60 * 60000).toISOString();
      const todayKey = dayKey(now);
      const overdue = rows.filter((r) => r.due_at <= now).length;
      const dueSoon = rows.filter((r) => r.due_at > now && r.due_at <= soon).length;
      const today = rows.filter((r) => r.due_at > now && dayKey(r.due_at) === todayKey).length;
      const due = rows.filter((r) => r.due_at <= now && !Number(r.notified)).slice(0, 10)
        .map((r) => ({ id: r.id, lead_id: r.lead_id, lead_name: r.lead_name, title: r.title, due_at: r.due_at }));
      for (const d of due) await db.run('UPDATE tasks SET notified=1 WHERE id=?', [d.id]);
      return json(res, 200, { overdue, dueSoon, today, due, badge: overdue + today, at: now });
    }
    if (p === '/api/tasks' && method === 'GET') {
      const scope = url.searchParams.get('scope') === 'all' ? 'all' : 'mine';
      const stateQ = url.searchParams.get('state');
      const state = stateQ === 'done' ? 'done' : stateQ === 'all' ? 'all' : 'open';
      const leadId = Number(url.searchParams.get('lead_id')) || null;
      const clauses = [], args = [];
      if (scope === 'mine') { clauses.push('(t.user_id=? OR t.user_id IS NULL)'); args.push(user.id); }
      if (state === 'open') clauses.push('t.done=0'); else if (state === 'done') clauses.push('t.done=1');
      if (leadId) { clauses.push('t.lead_id=?'); args.push(leadId); }
      const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
      const order = state === 'done' ? 'ORDER BY t.done_at DESC, t.due_at DESC' : 'ORDER BY t.done ASC, t.due_at ASC';
      const rows = await db.all(`${TASK_SELECT} ${where} ${order} LIMIT 500`, args);
      return json(res, 200, rows.map((r) => taskOut(r, now)));
    }
    const taskMatch = p.match(/^\/api\/tasks\/(\d+)$/);
    if (taskMatch) {
      const id = Number(taskMatch[1]);
      const task = await db.get('SELECT * FROM tasks WHERE id=?', [id]);
      if (!task) return json(res, 404, { error: 'not found' });
      if (method === 'PATCH') {
        const b = await readBody(req);
        const sets = [], vals = [];
        let reschedule = false;
        if ('title' in b) { const ti = cap(b.title, 200); if (!ti) return json(res, 400, { error: 'Título requerido' }); sets.push('title=?'); vals.push(ti); reschedule = true; }
        if ('due_at' in b) { const d = toISO(b.due_at); if (!d) return json(res, 400, { error: 'Fecha inválida' }); if (d !== task.due_at) { sets.push('due_at=?'); vals.push(d); sets.push('notified=0'); reschedule = true; } }
        if ('user_id' in b) {
          let uid = null;
          if (b.user_id) { const u = await db.get('SELECT id FROM users WHERE id=? AND active=1', [Number(b.user_id)]); if (!u) return json(res, 400, { error: 'Responsable inválido' }); uid = u.id; }
          if (uid !== (task.user_id == null ? null : Number(task.user_id))) { sets.push('user_id=?'); vals.push(uid); reschedule = true; }
        }
        let doneChange = null;
        if ('done' in b) {
          const d = (b.done === true || b.done === 1 || b.done === '1' || b.done === 'true') ? 1 : 0;
          if (d !== Number(task.done)) {
            doneChange = d;
            sets.push('done=?'); vals.push(d);
            sets.push('done_at=?'); vals.push(d ? nowISO() : null);
            if (!d) { sets.push('notified=0'); }
          }
        }
        if (sets.length) { vals.push(id); await db.run(`UPDATE tasks SET ${sets.join(',')} WHERE id=?`, vals); }
        if (doneChange != null) {
          await db.run(`INSERT INTO lead_events (lead_id,type,note,user_id,created_at) VALUES (?,?,?,?,?)`,
            [task.lead_id, doneChange ? 'task_done' : 'task', (doneChange ? 'Tarea hecha: ' : 'Tarea reabierta: ') + task.title, user.id, nowISO()]);
          await db.run('UPDATE leads SET updated_at=? WHERE id=?', [nowISO(), task.lead_id]);
        }
        const fresh = await db.get('SELECT * FROM tasks WHERE id=?', [id]);
        if (doneChange === 1) {
          await cancelTaskEmail(task);                        // hecha: cancela el programado si aún no venció
        } else if (reschedule || doneChange === 0) {
          await cancelTaskEmail(task);
          await db.run('UPDATE tasks SET emailed=0 WHERE id=?', [id]);
          await scheduleTaskEmail({ ...fresh, emailed: 0, email_id: null }, baseUrl(req));
        }
        const out = await db.get(`${TASK_SELECT} WHERE t.id=?`, [id]);
        return json(res, 200, taskOut(out, nowISO()));
      }
      if (method === 'DELETE') {
        await cancelTaskEmail(task);
        await db.run('DELETE FROM tasks WHERE id=?', [id]);
        return json(res, 200, { ok: true });
      }
      return json(res, 405, { error: 'method' });
    }

    // ---- Usuarios (proyección mínima id,name para no-admin: la necesitan los selectores de responsable) ----
    if (p === '/api/users' && method === 'GET') {
      const cols = isAdmin ? 'id,name,email,role,active,created_at' : 'id,name';
      return json(res, 200, await db.all(`SELECT ${cols} FROM users ${isAdmin ? '' : 'WHERE active=1'} ORDER BY id`));
    }
    if (p === '/api/users' && method === 'POST') {
      if (!isAdmin) return json(res, 403, { error: 'admin only' });
      const b = await readBody(req);
      const name = cap(b.name, 120), email = cap(b.email, 160), role = ROLES.includes(b.role) ? b.role : 'comercial';
      if (!name || !email) return json(res, 400, { error: 'Nombre y correo requeridos' });
      if (!EMAIL_RE.test(email)) return json(res, 400, { error: 'Correo inválido' });
      const exists = await db.get('SELECT 1 FROM users WHERE lower(email)=lower(?)', [email]);
      if (exists) return json(res, 409, { error: 'Ya existe un usuario con ese correo' });
      const r = await db.run('INSERT INTO users (name,email,role,active,created_at) VALUES (?,?,?,1,?)', [name, email.toLowerCase(), role, nowISO()]);
      return json(res, 201, await db.get('SELECT id,name,email,role,active,created_at FROM users WHERE id=?', [r.lastInsertRowid]));
    }
    const userMatch = p.match(/^\/api\/users\/(\d+)$/);
    if (userMatch && method === 'PATCH') {
      if (!isAdmin) return json(res, 403, { error: 'admin only' });
      const id = Number(userMatch[1]);
      const b = await readBody(req);
      const sets = [], vals = [];
      if ('name' in b) { const nm = cap(b.name, 120); if (!nm) return json(res, 400, { error: 'Nombre requerido' }); sets.push('name=?'); vals.push(nm); }
      if ('email' in b) {
        const em = cap(b.email, 160);
        if (em) {
          if (!EMAIL_RE.test(em)) return json(res, 400, { error: 'Correo inválido' });
          const dup = await db.get('SELECT id FROM users WHERE lower(email)=lower(?) AND id<>?', [em, id]);
          if (dup) return json(res, 409, { error: 'Ya existe un usuario con ese correo' });
          sets.push('email=?'); vals.push(em.toLowerCase());
        }
      }
      if ('role' in b && ROLES.includes(b.role)) { if (id === user.id && b.role !== 'admin') return json(res, 400, { error: 'No puedes quitarte el rol de administrador' }); sets.push('role=?'); vals.push(b.role); }
      if ('active' in b) { if (id === user.id && !b.active) return json(res, 400, { error: 'No puedes desactivarte a ti mismo' }); sets.push('active=?'); vals.push(b.active ? 1 : 0); }
      if (sets.length) { vals.push(id); await db.run(`UPDATE users SET ${sets.join(',')} WHERE id=?`, vals); }
      const row = await db.get('SELECT id,name,email,role,active,created_at FROM users WHERE id=?', [id]);
      if (!row) return json(res, 404, { error: 'not found' });
      return json(res, 200, row);
    }
    const impMatch = p.match(/^\/api\/users\/(\d+)\/impersonate$/);
    if (impMatch && method === 'POST') {
      if (!isAdmin) return json(res, 403, { error: 'admin only' });
      const target = await db.get('SELECT * FROM users WHERE id=? AND active=1', [Number(impMatch[1])]);
      if (!target) return json(res, 404, { error: 'not found' });
      if (target.id === user.id) return json(res, 400, { error: 'ya eres tú' });
      const sess = await sessionRow(req);
      const adminId = sess && sess.impersonator_id ? sess.impersonator_id : user.id;
      const sid = token(24);
      await db.run('INSERT INTO sessions (id,user_id,expires_at,created_at,impersonator_id) VALUES (?,?,?,?,?)', [sid, target.id, addDays(new Date(), 1).toISOString(), nowISO(), adminId]);
      res.setHeader('Set-Cookie', sidCookie(sid, 1));
      return json(res, 200, { ok: true, as: { id: target.id, name: target.name, role: target.role } });
    }

    if (p === '/api/stats' && method === 'GET') return json(res, 200, await buildStats(url.searchParams.get('month')));

    // ---- Ajustes / integraciones (solo admin) ----
    if (p === '/api/settings' && method === 'GET') {
      if (!isAdmin) return json(res, 403, { error: 'admin only' });
      const s = await getAllSettings();
      s.snippets = JSON.stringify(parseSnippets(s.snippets));
      return json(res, 200, s);
    }
    if (p === '/api/settings' && method === 'PUT') {
      if (!isAdmin) return json(res, 403, { error: 'admin only' });
      const b = await readBody(req, 2e6);
      for (const k of ALLOWED_SETTING_KEYS) if (k in b) {
        let v;
        if (k === 'snippets') v = JSON.stringify(parseSnippets(b[k]));
        else if (k === 'tracking_enabled') v = (b[k] === true || b[k] === 1 || b[k] === '1' || b[k] === 'true') ? '1' : '0';
        else if (k === 'notify_emails') v = String(b[k] == null ? '' : b[k]).split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter((e) => EMAIL_RE.test(e)).join(',');
        else if (k === 'whatsapp_number') v = String(b[k] == null ? '' : b[k]).replace(/[^\d]/g, '').slice(0, 20);
        else if (/^custom_/.test(k)) v = String(b[k] == null ? '' : b[k]).slice(0, 50000);
        else v = String(b[k] == null ? '' : b[k]).trim().slice(0, 200);
        await db.run('INSERT INTO settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at', [k, v, nowISO()]);
      }
      const s = await getAllSettings();
      s.snippets = JSON.stringify(parseSnippets(s.snippets));
      return json(res, 200, s);
    }

    // ---- Redirecciones 301/302 (solo admin) ----
    if (p === '/api/redirects' && method === 'GET') {
      if (!isAdmin) return json(res, 403, { error: 'admin only' });
      return json(res, 200, await db.all('SELECT * FROM redirects ORDER BY id DESC'));
    }
    if (p === '/api/redirects' && method === 'POST') {
      if (!isAdmin) return json(res, 403, { error: 'admin only' });
      const b = await readBody(req);
      const from = normFrom(b.from_path), to = normTo(b.to_path);
      const code = Number(b.code) === 302 ? 302 : 301;
      if (!from || !to) return json(res, 400, { error: 'Origen y destino requeridos' });
      if (from === '/' || from.startsWith('/crm') || from.startsWith('/api')) return json(res, 400, { error: 'Origen no permitido (no uses /, /crm o /api)' });
      if (from === to || from === to.replace(/\/+$/, '')) return json(res, 400, { error: 'El origen y el destino no pueden ser iguales' });
      if (await db.get('SELECT id FROM redirects WHERE from_path=?', [from])) return json(res, 409, { error: 'Ya existe una redirección para ese origen' });
      const r = await db.run('INSERT INTO redirects (from_path,to_path,code,active,hits,created_at) VALUES (?,?,?,1,0,?)', [from, to, code, nowISO()]);
      return json(res, 201, await db.get('SELECT * FROM redirects WHERE id=?', [r.lastInsertRowid]));
    }
    const redirMatch = p.match(/^\/api\/redirects\/(\d+)$/);
    if (redirMatch) {
      if (!isAdmin) return json(res, 403, { error: 'admin only' });
      const id = Number(redirMatch[1]);
      if (method === 'DELETE') { await db.run('DELETE FROM redirects WHERE id=?', [id]); return json(res, 200, { ok: true }); }
      if (method === 'PATCH') {
        const b = await readBody(req);
        const sets = [], vals = [];
        if ('from_path' in b) {
          const from = normFrom(b.from_path);
          if (!from || from === '/' || from.startsWith('/crm') || from.startsWith('/api')) return json(res, 400, { error: 'Origen no permitido' });
          if (await db.get('SELECT id FROM redirects WHERE from_path=? AND id<>?', [from, id])) return json(res, 409, { error: 'Ya existe una redirección para ese origen' });
          sets.push('from_path=?'); vals.push(from);
        }
        if ('to_path' in b) { const to = normTo(b.to_path); if (!to) return json(res, 400, { error: 'Destino requerido' }); sets.push('to_path=?'); vals.push(to); }
        if ('code' in b) { sets.push('code=?'); vals.push(Number(b.code) === 302 ? 302 : 301); }
        if ('active' in b) { sets.push('active=?'); vals.push(b.active ? 1 : 0); }
        if (sets.length) { vals.push(id); await db.run(`UPDATE redirects SET ${sets.join(',')} WHERE id=?`, vals); }
        const row = await db.get('SELECT * FROM redirects WHERE id=?', [id]);
        if (!row) return json(res, 404, { error: 'not found' });
        return json(res, 200, row);
      }
      return json(res, 405, { error: 'method' });
    }

    return json(res, 404, { error: 'no route' });
  }

  // ---- Estáticos ----
  if (method !== 'GET' && method !== 'HEAD') return json(res, 405, { error: 'method' });
  const gz = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  if (isCrm) return serveStatic(res, p, WEBUI_DIR, true, gz, url);
  return serveStatic(res, p, SITE_DIR, false, gz, url);
}

// Rutas del proyecto que NUNCA se sirven como estáticos del sitio
const PRIVATE_DIRS = new Set(['lib', 'api', 'webui', 'data', 'node_modules']);
const PRIVATE_FILES = new Set(['package.json', 'package-lock.json', 'vercel.json', 'server.js']);
function isPrivatePath(rel) {
  const segs = rel.split('/').filter(Boolean);
  if (!segs.length) return false;
  if (PRIVATE_DIRS.has(segs[0].toLowerCase())) return true;
  for (const s of segs) if (s.startsWith('_') || s.startsWith('.')) return true;   // _src, _build.py, .git, .env, .gitignore, .nojekyll…
  const last = segs[segs.length - 1].toLowerCase();
  if (PRIVATE_FILES.has(last)) return true;
  if (/\.(md|py|pyc|db|db-wal|db-shm|log|env|mjs)$/.test(last)) return true;
  return false;
}

async function serveStatic(res, p, dir, spa, gz, url) {
  let rel;
  try { rel = decodeURIComponent(p); } catch (e) { return send(res, 400, 'Bad request'); }
  rel = rel.replace(/\\/g, '/').replace(/^\/+/, '');
  if (rel.includes('\0')) return send(res, 400, 'Bad request');
  if (!spa && isPrivatePath(rel)) return serve404(res);
  const base = path.resolve(dir);
  let full = path.resolve(base, rel || '.');
  if (full !== base && !full.startsWith(base + path.sep)) return send(res, 403, 'forbidden');

  // Rutas limpias del sitio: carpeta con index.html → "/quote/" ; "/quote" → 301 "/quote/"
  let st = null;
  try { st = await fs.promises.stat(full); } catch (e) { st = null; }
  if (st && st.isDirectory()) {
    if (!spa && rel && !p.endsWith('/')) {
      res.writeHead(301, { Location: p + '/' + (url ? url.search : ''), 'Cache-Control': 'public, max-age=3600' });
      return res.end();
    }
    full = path.join(full, 'index.html');
    st = null;
    try { st = await fs.promises.stat(full); } catch (e) { st = null; }
  }
  if (!spa && st && /\/index\.html$/i.test(p)) {
    // /quote/index.html → /quote/  (canónica)
    res.writeHead(301, { Location: p.replace(/index\.html$/i, '') + (url ? url.search : ''), 'Cache-Control': 'public, max-age=3600' });
    return res.end();
  }
  let buf;
  try { buf = await fs.promises.readFile(full); }
  catch (e) {
    if (spa) {
      try { const idx = await fs.promises.readFile(path.join(base, 'index.html')); return sendFile(res, '.html', idx, gz, false); }
      catch (e2) { return send(res, 404, 'Not found'); }
    }
    return serve404(res);
  }
  const ext = path.extname(full).toLowerCase();
  return sendFile(res, ext, buf, gz, !spa);
}
function sendFile(res, ext, buf, gz, isSite) {
  const types = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
    '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp', '.avif': 'image/avif',
    '.woff2': 'font/woff2', '.woff': 'font/woff', '.mp4': 'video/mp4', '.webm': 'video/webm', '.pdf': 'application/pdf',
  };
  const ctype = types[ext] || 'application/octet-stream';
  const cache = /image|font|video/.test(ctype) ? 'public, max-age=2592000'
    : ext === '.html' ? 'no-cache'
      : isSite ? 'public, max-age=86400, stale-while-revalidate=604800'
        : 'no-cache';
  const textual = /text\/|javascript|json|xml|svg|manifest/.test(ctype);
  const headers = { 'Content-Type': ctype, 'Cache-Control': cache, 'Vary': 'Accept-Encoding' };
  if (gz && textual && buf.length > 512) {
    const z = zlib.gzipSync(buf);
    res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip' });
    return res.end(z);
  }
  res.writeHead(200, headers);
  res.end(buf);
}
async function serve404(res) {
  try {
    const buf = await fs.promises.readFile(path.join(SITE_DIR, '404.html'));
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(buf);
  } catch (e) { send(res, 404, 'Not found'); }
}
