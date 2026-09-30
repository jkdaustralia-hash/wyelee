// ============================================================
//  Copia SOLO los archivos públicos del sitio a dist/ (Output Directory de Vercel).
//  Así el CDN nunca sirve lib/, webui/, server.js, docs, scripts ni _src/.
//  El back office (api/index.js + lib/ + webui/) se empaqueta aparte como función.
//  Uso: node _dist.mjs   (Vercel lo ejecuta como buildCommand)
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'dist');

const PUBLIC_FILES = ['index.html', '404.html', 'sitemap.xml', 'robots.txt', 'llms.txt', 'site.webmanifest', 'favicon.ico'];
const PUBLIC_DIRS = ['css', 'js', 'img'];
const NEVER = new Set(['lib', 'webui', 'api', 'data', 'node_modules', 'dist', '.git', '.vercel', '_src', '_screens']);

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let files = 0;
const copy = (src, dst) => { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); files++; };
const copyDir = (src, dst) => {
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name.startsWith('_')) continue;
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else copy(s, d);
  }
};

for (const f of PUBLIC_FILES) { const p = path.join(ROOT, f); if (fs.existsSync(p)) copy(p, path.join(OUT, f)); }
for (const d of PUBLIC_DIRS) { const p = path.join(ROOT, d); if (fs.existsSync(p)) copyDir(p, path.join(OUT, d)); }

// Rutas del sitio: carpetas de primer nivel con index.html (quote/, contact/, furniture-assembly/…)
const routes = [];
for (const e of fs.readdirSync(ROOT, { withFileTypes: true })) {
  if (!e.isDirectory() || NEVER.has(e.name) || e.name.startsWith('.') || e.name.startsWith('_') || PUBLIC_DIRS.includes(e.name)) continue;
  if (fs.existsSync(path.join(ROOT, e.name, 'index.html'))) { copyDir(path.join(ROOT, e.name), path.join(OUT, e.name)); routes.push(e.name); }
}

console.log(`dist/: ${files} archivos · rutas: / ${routes.map((r) => '/' + r + '/').join(' ')}`);
