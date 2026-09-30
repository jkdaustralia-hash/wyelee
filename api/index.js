// ============================================================
//  Entrada SERVERLESS para Vercel. Toda la lógica vive en ../lib/app.js.
//  vercel.json enruta /crm* y /api* aquí; el resto del sitio lo sirve el CDN.
// ============================================================
import { handle, ensureInit } from '../lib/app.js';

export default async function handler(req, res) {
  try {
    await ensureInit();
    return await handle(req, res);
  } catch (err) {
    console.error('✗', req.method, req.url, '→', err?.message || err);
    if (!res.headersSent) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'server error' })); }
  }
}
