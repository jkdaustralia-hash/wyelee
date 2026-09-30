#!/usr/bin/env node
// ============================================================
//  Wyelee — datos de DEMOSTRACIÓN para el back office (uso local).
//  Inserta ~13 leads realistas (Adelaide, Sydney, Brisbane, Perth), sus
//  eventos de pipeline coherentes y algunas tareas (una ya vencida) para
//  poder ver el panel con contenido. Sin fotos. NO forma parte del server.
//
//  Uso:
//    node _seed_demo.mjs            → solo si la tabla leads está vacía
//    node _seed_demo.mjs --force    → borra leads, eventos, fotos y tareas y vuelve a sembrar
//    node _seed_demo.mjs --remote   → obligatorio además si TURSO_DATABASE_URL apunta a una BD remota
//
//  Los clientes son ficticios: correos @example.*, móviles del rango que la
//  ACMA reserva para ficción (0491 57x xxx). Los datos del cliente van en
//  inglés (así llegan del sitio); las notas internas y tareas, en español.
// ============================================================
import process from 'node:process';
import * as db from './lib/db.js';
import { ensureInit } from './lib/app.js';

const args = new Set(process.argv.slice(2));
const FORCE = args.has('--force');
const REMOTE = args.has('--remote');

// ---------------- Tiempo ----------------
const TZ = 'Australia/Adelaide';
const H = 3600e3;
const now = new Date();
const hoursAgo = (h) => new Date(now.getTime() - h * H);
const hoursFromNow = (h) => new Date(now.getTime() + h * H);
const iso = (d) => d.toISOString();

function tzParts(date, tz = TZ) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date);
  const o = {};
  for (const p of parts) if (p.type !== 'literal') o[p.type] = Number(p.value);
  return o;
}
// Desfase (ms) de la zona en un instante dado
function tzOffsetMs(date, tz = TZ) {
  const p = tzParts(date, tz);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUTC - Math.floor(date.getTime() / 1000) * 1000;
}
// Hora "de pared" en Adelaide → instante real (dos pasadas por si cae en cambio de horario)
function zoned(y, m, d, h = 0, mi = 0, tz = TZ) {
  const wall = Date.UTC(y, m - 1, d, h, mi);
  let t = wall;
  for (let i = 0; i < 2; i++) t = wall - tzOffsetMs(new Date(t), tz);
  return new Date(t);
}
// Mañana a las HH:MM en Adelaide
function tomorrowAt(h, mi = 0) {
  const p = tzParts(now);
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  return zoned(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), h, mi);
}
// Mismo formato que lib/email.js adelaide(): "30 sept 2026, 9:00 a. m. (Adelaide)"
const fmtAdelaide = (d) => d.toLocaleString('es-CO', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' }) + ' (Adelaide)';

// ---------------- Datos ----------------
// owner: índice en la lista de usuarios activos (0 = primer admin, 1 = segundo) o null.
// steps: en orden; `after` = horas desde el evento anterior. Con `to` = cambio de estado; sin `to` = nota.
// tasks: dueHoursFromNow (negativo = ya vencida) o dueTomorrowAt [h, m] en hora de Adelaide.
const LEADS = [
  { // Nuevo, reciente (SLA en verde)
    name: 'Sophie Marshall', email: 'sophie.marshall@example.com', mobile: '0491 570 006',
    suburb: 'Norwood', postcode: '5067', city: 'Adelaide', service: 'furniture',
    items: '2 x IKEA BILLY bookcase 80x28x202 (white)\n1 x IKEA KALLAX 4x4 shelving unit\n1 x IKEA LACK coffee table',
    condition: 'new', days: 'weekdays', time: 'morning', addons: ['packaging'],
    notes: 'Ground floor unit, street parking. The boxes are already in the living room.',
    source: 'quote', channel: 'Google Ads',
    attribution: { page: '/quote/', referrer: 'https://www.google.com/', utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'furniture-assembly-adelaide', gclid: 'Cj0KCQjw-demo-sophie' },
    createdHoursAgo: 3, owner: null, steps: [], tasks: [],
  },
  { // Nuevo con SLA vencido (+31 h) y una tarea YA VENCIDA (dispara el aviso y el correo de respaldo)
    name: 'Liam Nguyen', email: 'liam.nguyen@example.com', mobile: '0491 570 156',
    suburb: 'Marrickville', postcode: '2204', city: 'Sydney', service: 'wardrobe',
    items: '1 x IKEA PAX wardrobe 200x60x236 with 2 AULI mirror sliding doors\nKOMPLEMENT interior: 4 shelves, 2 drawers, 2 clothes rails',
    condition: 'new', days: 'either', time: 'afternoon', addons: ['anchoring'],
    notes: 'Bedroom is upstairs (narrow staircase). Can the wardrobe be anchored to a plasterboard wall?',
    source: 'quote', channel: 'Orgánico',
    attribution: { page: '/quote/', referrer: 'https://www.google.com/' },
    createdHoursAgo: 31, owner: 0, steps: [],
    tasks: [{ title: 'Llamar a Liam y enviar la cotización del PAX', dueHoursFromNow: -2, owner: 0, createdHoursAgo: 26 }],
  },
  { // Contacto (formulario /contact/, sin servicio), nuevo
    name: 'Grace Whitfield', email: null, mobile: '0491 570 157',
    suburb: null, postcode: null, city: null, service: null, items: null, condition: null, days: null, time: null, addons: [],
    notes: 'Hi, do you assemble Fantastic Furniture beds? I have a queen bed frame and two bedsides arriving on Friday in Paddington (4064).',
    source: 'contact', channel: 'Directo',
    attribution: { page: '/contact/', referrer: '' },
    createdHoursAgo: 1, owner: null, steps: [], tasks: [],
  },
  { // Contactado, tarea que vence en 2 h (aparece en "dueSoon")
    name: 'Ethan Robertson', email: 'ethan.robertson@example.net', mobile: '0491 570 158',
    suburb: 'Subiaco', postcode: '6008', city: 'Perth', service: 'furniture',
    items: '1 x Kmart 6-drawer tallboy (half done, gave up)\n1 x Temple & Webster Sloane 180cm TV unit\n1 x Mocka Jolt 5-tier bookshelf',
    condition: 'partial', days: 'weekend', time: 'either', addons: [],
    notes: 'I started the tallboy and the drawers do not line up. Happy for you to redo it.',
    source: 'quote', channel: 'Orgánico',
    attribution: { page: '/quote/', referrer: 'https://www.bing.com/' },
    createdHoursAgo: 50, owner: 1,
    steps: [
      { to: 'contactado', after: 6, note: 'Le dejé mensaje de voz y SMS. Pidió que lo llamáramos el sábado por la mañana.' },
      { after: 20, note: 'Devolvió la llamada: confirma que el tallboy hay que desarmarlo y volver a armarlo.' },
    ],
    tasks: [{ title: 'Enviar cotización a Ethan (tallboy + TV unit + estantería)', dueHoursFromNow: 2, owner: 1, createdHoursAgo: 20 }],
  },
  { // Cotizado dentro del SLA (18 h), tarea mañana 9:00
    name: 'Priya Raman', email: 'priya.raman@example.com', mobile: '0491 570 159',
    suburb: 'Chatswood', postcode: '2067', city: 'Sydney', service: 'kitchen',
    items: 'IKEA METOD kitchen (order 4471-2288-19):\n8 x base cabinets 80cm with MAXIMERA drawers\n6 x wall cabinets 80x40\n1 x high cabinet for oven/microwave\nVOXTORP doors, dark grey',
    condition: 'new', days: 'weekdays', time: 'morning', addons: ['packaging'],
    notes: 'Cabinets only please. Benchtop, plumbing and appliances are handled by other trades. Delivery booked for the 6th.',
    source: 'quote', channel: 'Google Ads',
    attribution: { page: '/quote/', referrer: 'https://www.google.com/', utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'ikea-kitchen-sydney', gclid: 'Cj0KCQjw-demo-priya' },
    createdHoursAgo: 5 * 24, owner: 0,
    steps: [
      { to: 'contactado', after: 3, note: 'Hablamos por WhatsApp; envió la lista de IKEA en PDF.' },
      { to: 'cotizado', after: 15, note: 'Cotización enviada por correo (2 días de trabajo, 2 personas).' },
    ],
    tasks: [{ title: 'Confirmar si Priya acepta la cotización de la cocina', dueTomorrowAt: [9, 0], owner: 0, createdHoursAgo: 4 * 24 }],
  },
  { // Cotizado fuera del SLA (50 h)
    name: 'Jack Thompson', email: 'jack.thompson@example.org', mobile: '0491 570 110',
    suburb: 'Glenelg', postcode: '5045', city: 'Adelaide', service: 'disassembly',
    items: '1 x king bed frame (timber, slats)\n1 x 3-door wardrobe 180cm\n1 x 8-seater dining table',
    condition: 'assembled', days: 'either', time: 'morning', addons: ['disassembly'],
    notes: 'Moving from Glenelg to Prospect on the 18th. Need everything disassembled the day before and, if possible, re-assembled at the new place.',
    source: 'quote', channel: 'Facebook',
    attribution: { page: '/quote/', referrer: 'https://l.facebook.com/', utm_source: 'facebook', utm_medium: 'social', utm_campaign: 'moving-season' },
    createdHoursAgo: 8 * 24, owner: 1,
    steps: [
      { to: 'contactado', after: 30, note: 'Contactado tarde (fin de semana). Pidió incluir el re-armado en Prospect.' },
      { to: 'cotizado', after: 20, note: 'Cotización enviada: desarme + re-armado, 2 visitas.' },
    ],
    tasks: [],
  },
  { // Agendado, con una tarea ya hecha
    name: 'Olivia Chen', email: 'olivia.chen@example.com', mobile: '0491 571 266',
    suburb: 'Mawson Lakes', postcode: '5095', city: 'Adelaide', service: 'furniture',
    items: '1 x IKEA MALM bed frame queen with 4 storage boxes\n2 x IKEA MALM bedside tables\n1 x IKEA HEMNES 8-drawer dresser',
    condition: 'new', days: 'weekend', time: 'afternoon', addons: ['packaging', 'anchoring'],
    notes: 'The dresser must be anchored to the wall (toddler in the house).',
    source: 'quote', channel: 'Orgánico',
    attribution: { page: '/quote/', referrer: 'https://www.google.com/' },
    createdHoursAgo: 12 * 24, owner: 0,
    steps: [
      { to: 'contactado', after: 2 },
      { to: 'cotizado', after: 4, note: 'Cotización enviada por WhatsApp.' },
      { to: 'agendado', after: 30, note: 'Aceptó. Agendado para el sábado 9:00, 2 personas.' },
    ],
    tasks: [{ title: 'Confirmar la visita del sábado con Olivia', dueHoursFromNow: -3 * 24, done: true, doneHoursFromNow: -3 * 24 - 1, owner: 0, createdHoursAgo: 5 * 24 }],
  },
  { // Agendado, tarea futura
    name: 'Noah Patel', email: 'noah.patel@example.net', mobile: '0491 571 491',
    suburb: 'Joondalup', postcode: '6027', city: 'Perth', service: 'wardrobe',
    items: '2 x IKEA PAX frames 100x58x236 (white)\nKOMPLEMENT interiors: 6 shelves, 4 drawers, 2 clothes rails\n4 x FORSAND hinged doors',
    condition: 'new', days: 'weekdays', time: 'either', addons: ['anchoring'],
    notes: null,
    source: 'quote', channel: 'Google Ads',
    attribution: { page: '/quote/', referrer: 'https://www.google.com/', utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'wardrobe-assembly-perth', gclid: 'Cj0KCQjw-demo-noah' },
    createdHoursAgo: 15 * 24, owner: 1,
    steps: [
      { to: 'contactado', after: 5 },
      { to: 'cotizado', after: 15 },
      { to: 'agendado', after: 48, note: 'Agendado para el jueves por la mañana.' },
    ],
    tasks: [{ title: 'Recordar a Noah que despeje la habitación antes de la visita', dueHoursFromNow: 3 * 24 + 4, owner: 1, createdHoursAgo: 10 * 24 }],
  },
  { // Ganado
    name: 'Charlotte Evans', email: 'charlotte.evans@example.com', mobile: '0491 571 804',
    suburb: 'West End', postcode: '4101', city: 'Brisbane', service: 'furniture',
    items: '1 x Koala sofa bed\n1 x Mocka bookshelf\n4 x Freedom dining chairs\n1 x Kmart hallway bench',
    condition: 'new', days: 'either', time: 'either', addons: ['packaging'],
    notes: 'Apartment on level 3, there is a lift.',
    source: 'quote', channel: 'Orgánico',
    attribution: { page: '/quote/', referrer: 'https://www.google.com/' },
    createdHoursAgo: 25 * 24, owner: 0,
    steps: [
      { to: 'contactado', after: 1 },
      { to: 'cotizado', after: 4 },
      { to: 'agendado', after: 24 },
      { to: 'ganado', after: 4 * 24, note: 'Trabajo terminado. Dejó reseña en Google.' },
    ],
    tasks: [],
  },
  { // Ganado, lead manual (mes anterior) — sin atribución
    name: 'William Fraser', email: 'w.fraser@example.org', mobile: '0491 572 549',
    suburb: 'Fremantle', postcode: '6160', city: 'Perth', service: 'kitchen',
    items: 'IKEA METOD: 6 base cabinets, 4 wall cabinets, 1 high cabinet for oven\nBODBYN off-white doors',
    condition: 'new', days: 'weekdays', time: 'morning', addons: [],
    notes: 'Called after seeing the van. Renovating a rental in Fremantle.',
    source: 'manual', channel: null,
    attribution: null,
    createdHoursAgo: 40 * 24, owner: 1,
    steps: [
      { to: 'contactado', after: 0.5 },
      { to: 'cotizado', after: 30, note: 'Cotización enviada tras visitar la obra.' },
      { to: 'agendado', after: 48 },
      { to: 'ganado', after: 5 * 24, note: 'Cocina instalada en 2 días.' },
    ],
    tasks: [],
  },
  { // Perdido por precio
    name: 'Mia Kowalski', email: 'mia.kowalski@example.com', mobile: '0491 572 665',
    suburb: 'Chermside', postcode: '4032', city: 'Brisbane', service: 'furniture',
    items: '1 x Kmart bunk bed (single over single)\n1 x Kmart study desk',
    condition: 'partial', days: 'weekend', time: 'morning', addons: [],
    notes: 'My partner started the bunk bed but we are missing a few screws.',
    source: 'quote', channel: 'Facebook',
    attribution: { page: '/quote/', referrer: 'https://m.facebook.com/', utm_source: 'facebook', utm_medium: 'social', utm_campaign: 'kids-rooms' },
    createdHoursAgo: 18 * 24, owner: 0,
    steps: [
      { to: 'contactado', after: 4 },
      { to: 'cotizado', after: 6 },
      { to: 'perdido', after: 3 * 24, loss_reason: 'precio', note: 'Encontró alguien más barato en Airtasker.' },
    ],
    tasks: [],
  },
  { // Perdido por fecha (hace ~7 semanas, alimenta el mes anterior en estadísticas)
    name: "Henry O'Connor", email: 'henry.oconnor@example.net', mobile: '0491 573 770',
    suburb: 'Penrith', postcode: '2750', city: 'Sydney', service: 'disassembly',
    items: 'Office fit-out: 6 x desks, 2 x filing cabinets, 1 x boardroom table\nEverything must be out by the 15th',
    condition: 'assembled', days: 'weekdays', time: 'afternoon', addons: ['disassembly'],
    notes: 'Lease ends on the 15th, needs to be done on the 13th or 14th.',
    source: 'quote', channel: 'Orgánico',
    attribution: { page: '/quote/', referrer: 'https://duckduckgo.com/' },
    createdHoursAgo: 47 * 24, owner: 1,
    steps: [
      { to: 'contactado', after: 2 },
      { to: 'perdido', after: 20, loss_reason: 'fecha', note: 'No teníamos equipo disponible en Penrith para esas fechas.' },
    ],
    tasks: [],
  },
  { // Contacto por correo (sin móvil), contactado; ubicación completada a mano; tarea sin responsable
    name: 'Amelia Singh', email: 'amelia.singh@example.com', mobile: null,
    suburb: 'Bondi', postcode: '2026', city: 'Sydney', service: null, items: null, condition: null, days: null, time: null, addons: [],
    notes: 'Can you assemble a Pottery Barn Kids crib and a change table? We are in Bondi and the baby is due late October.',
    source: 'contact', channel: 'Orgánico',
    attribution: { page: '/contact/', referrer: 'https://www.google.com/' },
    createdHoursAgo: 9 * 24, owner: 0,
    steps: [
      { to: 'contactado', after: 5, note: 'Respondido por correo; le pedí fotos de las cajas. Completé suburbio y código postal a mano.' },
    ],
    tasks: [{ title: 'Escribir de nuevo a Amelia si no responde', dueHoursFromNow: 24 + 5, owner: null, createdHoursAgo: 8 * 24 }],
  },
];

// ---------------- Inserción ----------------
async function main() {
  if (process.env.TURSO_DATABASE_URL && !REMOTE) {
    console.error('✗ TURSO_DATABASE_URL está definida (base remota). Añade --remote si de verdad quieres sembrar datos de demo ahí.');
    process.exit(2);
  }

  await ensureInit();   // esquema + usuarios admin (si la BD es nueva)

  const existing = Number((await db.get('SELECT COUNT(*) AS c FROM leads'))?.c || 0);
  if (existing > 0 && !FORCE) {
    console.log(`· La tabla leads ya tiene ${existing} registros. Nada que hacer (usa --force para reemplazarlos).`);
    return;
  }
  if (existing > 0) {
    console.log(`· --force: borrando ${existing} leads con sus eventos, fotos y tareas…`);
    for (const t of ['tasks', 'lead_events', 'lead_files', 'leads']) await db.run(`DELETE FROM ${t}`);
  }

  const users = await db.all('SELECT id, name, email FROM users WHERE active = 1 ORDER BY id');
  if (!users.length) { console.error('✗ No hay usuarios activos; ensureInit() debería haber creado los administradores.'); process.exit(1); }
  const userAt = (i) => (i == null ? null : (users[i] || users[0]).id);
  const adminId = users[0].id;

  // Más antiguos primero para que los ids sigan el orden natural
  const ordered = [...LEADS].sort((a, b) => b.createdHoursAgo - a.createdHoursAgo);

  const counts = {};
  let nEvents = 0, nTasks = 0, nOverdue = 0;

  for (const L of ordered) {
    const created = hoursAgo(L.createdHoursAgo);
    const ownerId = userAt(L.owner);
    const actorId = ownerId ?? adminId;   // quien registra los cambios de estado / notas
    const events = [{
      at: created, type: 'created', user_id: L.source === 'manual' ? actorId : null,
      note: L.source === 'manual' ? 'Creado manualmente en el panel' : `Recibido desde el sitio web (${L.source}) · ${L.channel}`,
    }];

    let status = 'nuevo', quotedAt = null, lossReason = null, t = created, last = created;
    for (const s of L.steps) {
      t = new Date(t.getTime() + (s.after || 0) * H);
      if (s.to) {
        events.push({ at: t, type: 'status', from: status, to: s.to, loss_reason: s.loss_reason || null, note: s.note || null, user_id: actorId });
        if (s.to === 'cotizado' && !quotedAt) quotedAt = t;
        if (s.to === 'perdido') lossReason = s.loss_reason || 'otro';
        status = s.to;
      } else {
        events.push({ at: t, type: 'note', note: s.note, user_id: actorId });
      }
      last = t;
    }

    const r = await db.run(
      `INSERT INTO leads (name,email,mobile,suburb,postcode,city,service,items,condition,days,time,addons,notes,source,status,loss_reason,owner_id,attribution,quoted_at,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        L.name, L.email ?? null, L.mobile ?? null, L.suburb ?? null, L.postcode ?? null, L.city ?? null,
        L.service ?? null, L.items ?? null, L.condition ?? null, L.days ?? null, L.time ?? null,
        (L.addons || []).join(',') || null, L.notes ?? null, L.source, status, lossReason, ownerId,
        L.attribution ? JSON.stringify(L.attribution) : null, quotedAt ? iso(quotedAt) : null, iso(created), iso(last),
      ],
    );
    const leadId = r.lastInsertRowid;
    counts[status] = (counts[status] || 0) + 1;

    for (const e of events) {
      await db.run(
        'INSERT INTO lead_events (lead_id,type,from_status,to_status,loss_reason,note,user_id,created_at) VALUES (?,?,?,?,?,?,?,?)',
        [leadId, e.type, e.from ?? null, e.to ?? null, e.loss_reason ?? null, e.note ?? null, e.user_id ?? null, iso(e.at)],
      );
      nEvents++;
    }

    for (const T of L.tasks || []) {
      const due = T.dueTomorrowAt ? tomorrowAt(...T.dueTomorrowAt) : hoursFromNow(T.dueHoursFromNow);
      const taskCreated = hoursAgo(T.createdHoursAgo ?? 1);
      const done = T.done ? 1 : 0;
      const doneAt = T.done ? hoursFromNow(T.doneHoursFromNow ?? -1) : null;
      const taskOwner = userAt(T.owner);
      await db.run(
        'INSERT INTO tasks (lead_id,user_id,title,due_at,done,done_at,notified,emailed,email_id,created_by,created_at) VALUES (?,?,?,?,?,?,0,0,NULL,?,?)',
        [leadId, taskOwner, T.title, iso(due), done, doneAt ? iso(doneAt) : null, actorId, iso(taskCreated)],
      );
      await db.run(
        'INSERT INTO lead_events (lead_id,type,note,user_id,created_at) VALUES (?,?,?,?,?)',
        [leadId, 'task', `Tarea: ${T.title} · vence ${fmtAdelaide(due)}`, actorId, iso(taskCreated)],
      );
      nEvents++;
      if (done) {
        await db.run(
          'INSERT INTO lead_events (lead_id,type,note,user_id,created_at) VALUES (?,?,?,?,?)',
          [leadId, 'task_done', `Tarea hecha: ${T.title}`, actorId, iso(doneAt)],
        );
        nEvents++;
      }
      nTasks++;
      if (!done && due < now) nOverdue++;
    }
  }

  const order = ['nuevo', 'contactado', 'cotizado', 'agendado', 'ganado', 'perdido'];
  console.log(`✓ ${ordered.length} leads de demo insertados (${db.backend()}): ` + order.filter((s) => counts[s]).map((s) => `${s} ${counts[s]}`).join(' · '));
  console.log(`  ${nEvents} eventos · ${nTasks} tareas (${nOverdue} ya vencida${nOverdue === 1 ? '' : 's'}: aparecerá como aviso al abrir el panel y, con RESEND_API_KEY, saldrá por correo).`);
  console.log(`  Usuarios: ${users.map((u) => u.email).join(', ')}`);
  console.log('  Abre http://localhost:8834/crm (node server.js) para verlo.');
}

main().catch((e) => { console.error('✗ Seed fallido:', e?.message || e); process.exit(1); });
