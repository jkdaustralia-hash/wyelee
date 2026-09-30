// ============================================================
//  Wyelee — entrada de DESARROLLO LOCAL / host persistente.
//  Sirve el sitio estático en "/" y el back office en "/crm" (un solo origen).
//  (En Vercel serverless se usa api/index.js; la lógica vive en lib/app.js.)
// ============================================================
import http from 'node:http';
import process from 'node:process';
import { handle, ensureInit } from './lib/app.js';

const PORT = Number(process.env.PORT) || 8834;

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error('✗ Request error', req.method, req.url, '→', err?.message || err);
    if (!res.headersSent) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'server error' })); }
  });
});
process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e?.message || e));
process.on('uncaughtException', (e) => console.error('uncaughtException:', e?.message || e));

ensureInit().then(() => {
  server.listen(PORT, () => {
    console.log(`\n  Wyelee — sitio en http://localhost:${PORT}  ·  panel en http://localhost:${PORT}/crm`);
    console.log(`  BD: ${process.env.TURSO_DATABASE_URL ? 'Turso (libSQL)' : 'node:sqlite (data/wyelee-crm.db)'}`);
    console.log(`  Login: ${process.env.ADMIN_EMAIL || 'juan.garcia@wearedatalab.co'} — sin RESEND_API_KEY el magic link sale aquí en consola\n`);
  });
}).catch((e) => { console.error('Fallo al inicializar la BD:', e); process.exit(1); });
