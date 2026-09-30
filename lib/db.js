// ============================================================
//  Capa de base de datos (async) — funciona en dos backends:
//   · Producción / Vercel serverless: Turso (libSQL) vía HTTP  → persiste
//   · Local / host persistente:       node:sqlite (archivo)    → sin deps
//  La API es la misma en ambos: get() / all() / run() / execMany().
//  Se elige Turso automáticamente si existe TURSO_DATABASE_URL.
// ============================================================
import process from 'node:process';

let _exec = null;   // (sql, args[]) => { rows, lastInsertRowid, rowsAffected }
let _ready = null;  // promesa de init (memoizada)
let _backend = 'sqlite';

async function init() {
  const url = process.env.TURSO_DATABASE_URL;
  if (url) {
    // --- Backend Turso (libSQL) — cliente web puro (fetch), ideal para serverless ---
    const { createClient } = await import('@libsql/client/web');
    const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
    _backend = 'turso';
    _exec = async (sql, args = []) => {
      const r = await client.execute({ sql, args });
      // Normaliza a objetos planos {col: value} para que {...row} sea seguro
      const cols = r.columns || [];
      const rows = (r.rows || []).map((row) => {
        const o = {};
        for (let i = 0; i < cols.length; i++) o[cols[i]] = row[i];
        return o;
      });
      return {
        rows,
        lastInsertRowid: r.lastInsertRowid == null ? null : Number(r.lastInsertRowid),
        rowsAffected: Number(r.rowsAffected || 0),
      };
    };
  } else {
    // --- Backend local node:sqlite (archivo) — sin dependencias externas ---
    const { DatabaseSync } = await import('node:sqlite');
    const path = await import('node:path');
    const fs = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const dataDir = path.join(dir, '..', 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    const sdb = new DatabaseSync(path.join(dataDir, 'wyelee-crm.db'));
    try { sdb.exec('PRAGMA journal_mode = WAL;'); } catch (e) { /* noop */ }
    _backend = 'sqlite';
    _exec = async (sql, args = []) => {
      const head = sql.replace(/^[\s(]+/, '').slice(0, 6).toLowerCase();
      const st = sdb.prepare(sql);
      if (head === 'select' || head === 'pragma') {
        return { rows: st.all(...args), lastInsertRowid: null, rowsAffected: 0 };
      }
      const info = st.run(...args);
      return {
        rows: [],
        lastInsertRowid: info.lastInsertRowid == null ? null : Number(info.lastInsertRowid),
        rowsAffected: Number(info.changes || 0),
      };
    };
  }
}

export function ready() { return _ready || (_ready = init()); }
export function backend() { return _backend; }

export async function get(sql, args = []) { await ready(); return (await _exec(sql, args)).rows[0] || null; }
export async function all(sql, args = []) { await ready(); return (await _exec(sql, args)).rows; }
export async function run(sql, args = []) { await ready(); return _exec(sql, args); }

// Ejecuta una lista de sentencias (DDL de esquema/migraciones). Cada una por separado
// para ser compatible con ambos backends (libSQL no acepta multi-statement en execute()).
export async function execMany(statements) {
  await ready();
  for (const s of statements) { const t = s.trim(); if (t) await _exec(t, []); }
}
