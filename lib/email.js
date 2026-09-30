// ============================================================
//  Wyelee — correo transaccional vía Resend (REST, sin dependencias).
//   · sendMagicLink        → enlace de acceso al panel (un solo uso, 15 min)
//   · sendLeadNotification → aviso de nueva solicitud a los admins (fotos adjuntas)
//   · sendTaskReminder     → recordatorio de tarea (inmediato o programado con scheduled_at)
//   · cancelScheduledEmail → cancela un correo programado en Resend
//  Todo es best-effort: ninguna función lanza; devuelven { ok, ... }.
//  La API key se lee de process.env.RESEND_API_KEY (nunca hardcodeada).
// ============================================================
import process from 'node:process';

const API = 'https://api.resend.com/emails';
const NAVY = '#1D153E';
const GREEN = '#25803A';
const GREEN_TXT = '#23752E';
const GREY = '#4B4668';
const FOG = '#F2F4F1';

const ESC = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const NL2BR = (s) => ESC(s).replace(/\r?\n/g, '<br>');

function fromAddress() { return process.env.MAIL_FROM || 'Wyelee <onboarding@resend.dev>'; }
function apiKey() { return process.env.RESEND_API_KEY || ''; }

export function adelaide(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleString('es-CO', { timeZone: 'Australia/Adelaide', dateStyle: 'medium', timeStyle: 'short' }) + ' (Adelaide)';
  } catch (e) { return String(iso); }
}

// ---------------- Plantilla base (marca Wyelee: fondo blanco, cabecera navy, botón verde) ----------------
function layout({ kicker, bodyHtml, width = 560 }) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:${FOG};padding:32px 12px;font-family:'Nunito Sans',-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${NAVY}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="${width}" cellpadding="0" cellspacing="0" style="max-width:${width}px;width:100%;background:#ffffff;border:1px solid #E3E6E1;border-radius:16px;overflow:hidden">
      <tr><td style="background:${NAVY};padding:22px 32px">
        <div style="font-family:Nunito,'Nunito Sans',-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#ffffff;font-size:26px;font-weight:800;letter-spacing:-.02em;line-height:1">wyelee<span style="color:#6FD17B">.</span></div>
        ${kicker ? `<div style="color:#C9C4E4;font-size:11px;letter-spacing:.18em;text-transform:uppercase;margin-top:8px">${ESC(kicker)}</div>` : ''}
      </td></tr>
      ${bodyHtml}
      <tr><td style="padding:14px 32px 22px;color:#8A86A3;font-size:12px;line-height:1.6;border-top:1px solid #EEF0EC">
        Wyelee Assembly · Adelaide, SA · Notificación automática del panel.
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}
function button(href, label) {
  return `<a href="${ESC(href)}" style="display:inline-block;background:${GREEN};color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 26px;border-radius:100px">${ESC(label)} →</a>`;
}
function dataTable(rows) {
  const tr = rows
    .filter(([, v]) => v != null && String(v).trim() !== '')
    .map(([k, v, raw]) => `<tr>
      <td style="padding:9px 0;border-bottom:1px solid #EEF0EC;color:${GREY};font-size:12px;letter-spacing:.02em;vertical-align:top;width:150px">${ESC(k)}</td>
      <td style="padding:9px 0;border-bottom:1px solid #EEF0EC;color:${NAVY};font-size:14px;line-height:1.5">${raw ? v : NL2BR(v)}</td>
    </tr>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #EEF0EC">${tr}</table>`;
}
const linkTel = (m) => m ? `<a href="tel:${ESC(String(m).replace(/[^\d+]/g, ''))}" style="color:${GREEN_TXT};text-decoration:none;font-weight:700">${ESC(m)}</a>` : '';
const linkMail = (e) => e ? `<a href="mailto:${ESC(e)}" style="color:${GREEN_TXT};text-decoration:none;font-weight:700">${ESC(e)}</a>` : '';

// ---------------- Plantillas ----------------
function magicLinkHtml({ name, link }) {
  const body = `
      <tr><td style="padding:24px 32px 4px;font-size:15px;line-height:1.6;color:${NAVY}">
        Hola${name ? ' ' + ESC(name) : ''}, usa este botón para entrar al panel de Wyelee. El enlace es de un solo uso y caduca en 15&nbsp;minutos.
      </td></tr>
      <tr><td style="padding:20px 32px 8px">${button(link, 'Entrar al panel')}</td></tr>
      <tr><td style="padding:8px 32px 22px;color:${GREY};font-size:12px;line-height:1.6">
        Si no solicitaste este acceso, ignora este correo.<br>
        <span style="color:#8A86A3">O copia y pega:</span><br><span style="color:${GREY};word-break:break-all">${ESC(link)}</span>
      </td></tr>`;
  return layout({ kicker: 'Panel · Acceso', bodyHtml: body, width: 480 });
}

function leadNotifyHtml({ lead, crmLink, photoCount }) {
  const name = lead.name || 'Nuevo contacto';
  const location = [lead.suburb, lead.postcode, lead.city].filter(Boolean).join(' · ');
  const when = [lead.days_label || lead.days, lead.time_label || lead.time].filter(Boolean).join(' / ');
  const contact = [linkTel(lead.mobile), linkMail(lead.email)].filter(Boolean).join(' &nbsp;·&nbsp; ');
  const rows = [
    ['Nombre', name],
    ['Contacto', contact, true],
    ['Ubicación', location],
    ['Servicio', lead.service_label || lead.service],
    ['Artículos', lead.items],
    ['Condición', lead.condition_label || lead.condition],
    ['Días / franja', when],
    ['Add-ons', lead.addons_label || lead.addons],
    ['Notas', lead.notes],
    ['Fotos', photoCount ? `${photoCount} adjunta${photoCount === 1 ? '' : 's'}` : ''],
    ['Fuente', lead.source],
    ['Canal', lead.channel],
    ['Página', lead.page],
    ['Fecha', lead.created_label],
  ];
  const isContact = lead.source === 'contact';
  const body = `
      <tr><td style="padding:24px 32px 4px;font-size:15px;line-height:1.6;color:${NAVY}">
        ${isContact ? 'Llegó un nuevo mensaje desde el formulario de contacto del sitio.' : 'Llegó una nueva solicitud de cotización desde el sitio web. Estos son los datos:'}
      </td></tr>
      <tr><td style="padding:14px 32px 6px">${dataTable(rows)}</td></tr>
      ${lead.email ? `<tr><td style="padding:8px 32px 2px;color:${GREY};font-size:12px">Puedes responder este correo directamente: la respuesta le llega a ${linkMail(lead.email)}.</td></tr>` : ''}
      <tr><td style="padding:18px 32px 16px">${button(crmLink, 'Ver en el panel')}</td></tr>`;
  return layout({ kicker: isContact ? 'Nuevo mensaje de contacto' : 'Nueva solicitud de cotización', bodyHtml: body });
}

function taskReminderHtml({ task, lead, crmLink }) {
  const leadName = (lead && lead.name) || 'Lead';
  const contact = lead ? [linkTel(lead.mobile), linkMail(lead.email)].filter(Boolean).join(' &nbsp;·&nbsp; ') : '';
  const rows = [
    ['Tarea', task.title],
    ['Vence', adelaide(task.due_at)],
    ['Lead', leadName],
    ['Contacto', contact, true],
    ['Servicio', lead && (lead.service_label || lead.service)],
    ['Ubicación', lead ? [lead.suburb, lead.postcode].filter(Boolean).join(' ') : ''],
    ['Estado', lead && (lead.status_label || lead.status)],
  ];
  const body = `
      <tr><td style="padding:24px 32px 4px;font-size:15px;line-height:1.6;color:${NAVY}">
        ⏰ Te programaste un recordatorio para este lead. Ya es la hora:
      </td></tr>
      <tr><td style="padding:14px 32px 6px">${dataTable(rows)}</td></tr>
      <tr><td style="padding:18px 32px 16px">${button(crmLink, 'Abrir la ficha')}</td></tr>`;
  return layout({ kicker: 'Recordatorio de tarea', bodyHtml: body });
}

// ---------------- Transporte ----------------
async function post(url, payload, tag) {
  const key = apiKey();
  if (!key) return { ok: false, skipped: true };
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    let data = null;
    try { data = await resp.json(); } catch (e) { data = null; }
    if (!resp.ok) {
      console.error(`[email] ${tag}`, resp.status, JSON.stringify(data || '').slice(0, 300));
      return { ok: false, status: resp.status, error: (data && (data.message || data.error)) || `HTTP ${resp.status}` };
    }
    return { ok: true, id: data && data.id ? String(data.id) : null, data };
  } catch (e) {
    console.error(`[email] ${tag} fallo de red:`, e?.message || e);
    return { ok: false, error: String(e?.message || e) };
  }
}
const recipients = (to) => (Array.isArray(to) ? to : [to]).map((x) => String(x || '').trim()).filter(Boolean);

// Enlace de acceso. Devuelve { ok:true, id } si Resend lo aceptó; { ok:false, ... } en error o sin key.
export async function sendMagicLink({ to, name, link }) {
  if (!apiKey()) { console.log('[email] Sin RESEND_API_KEY — link (solo dev):', link); return { ok: false, skipped: true }; }
  const rcpt = recipients(to);
  if (!rcpt.length) return { ok: false, skipped: true };
  return post(API, {
    from: fromAddress(), to: rcpt,
    subject: 'Tu acceso al panel — Wyelee',
    html: magicLinkHtml({ name: name || '', link: String(link || '') }),
  }, 'magic-link');
}

// Notifica a los administradores (y correos extra) cuando entra un lead. Fotos como adjuntos base64.
// files: [{ name, mime, data }] con data = base64 sin prefijo. Best-effort: nunca lanza.
export async function sendLeadNotification({ to, lead, files, crmLink }) {
  const rcpt = recipients(to);
  if (!apiKey() || !rcpt.length) return { ok: false, skipped: true };
  const l = lead || {};
  const name = l.name || 'Nuevo contacto';
  const svc = l.service_label || l.service || (l.source === 'contact' ? 'Contacto' : 'Cotización');
  const attachments = (Array.isArray(files) ? files : [])
    .filter((f) => f && f.data)
    .slice(0, 6)
    .map((f, i) => {
      const ext = /png/i.test(f.mime || '') ? 'png' : /webp/i.test(f.mime || '') ? 'webp' : 'jpg';
      const fname = String(f.name || `foto-${i + 1}.${ext}`).replace(/[^\w.\-]+/g, '_').slice(0, 80) || `foto-${i + 1}.${ext}`;
      const a = { filename: fname, content: String(f.data) };
      if (f.mime) a.content_type = String(f.mime);
      return a;
    });
  const payload = {
    from: fromAddress(), to: rcpt,
    subject: `Nueva solicitud de cotización — ${name} (${svc})`,
    html: leadNotifyHtml({ lead: l, crmLink: crmLink || '', photoCount: attachments.length }),
  };
  if (attachments.length) payload.attachments = attachments;
  if (l.email) payload.reply_to = l.email;
  return post(API, payload, 'lead-notify');
}

// Recordatorio de tarea. Con scheduledAt (ISO) lo programa en Resend (scheduled_at) y devuelve { ok, id }.
export async function sendTaskReminder({ to, task, lead, crmLink, scheduledAt }) {
  const rcpt = recipients(to);
  if (!apiKey() || !rcpt.length || !task) return { ok: false, skipped: true };
  const leadName = (lead && lead.name) || 'Lead';
  const payload = {
    from: fromAddress(), to: rcpt,
    subject: `⏰ Recordatorio: ${task.title} — ${leadName}`,
    html: taskReminderHtml({ task, lead: lead || {}, crmLink: crmLink || '' }),
  };
  if (scheduledAt) {
    const d = new Date(scheduledAt);
    if (isNaN(d.getTime())) return { ok: false, error: 'scheduledAt inválido' };
    payload.scheduled_at = d.toISOString();
  }
  const r = await post(API, payload, scheduledAt ? 'task-reminder(scheduled)' : 'task-reminder');
  return { ok: !!r.ok, id: r.id || null, ...(r.ok ? {} : { error: r.error, status: r.status, skipped: r.skipped }) };
}

// Cancela un correo programado (POST /emails/:id/cancel). Nunca lanza.
export async function cancelScheduledEmail(id) {
  const eid = String(id || '').trim();
  if (!eid || !apiKey()) return { ok: false, skipped: true };
  return post(`${API}/${encodeURIComponent(eid)}/cancel`, undefined, 'cancel-scheduled');
}
