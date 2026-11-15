import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { catalogRoute } from './catalog-api.mjs';
const root = fileURLToPath(new URL('.', import.meta.url));
const files = new Map([['/', 'index.html'], ['/index.html', 'index.html'], ['/app.js', 'app.js'], ['/style.css', 'style.css']]);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
  if (url.pathname.startsWith('/api/')) return catalogRoute(url, res);
  const file = files.get(url.pathname);
  if (!file) { res.writeHead(404); res.end('Not found'); return; }
  try { res.writeHead(200, { 'Content-Type': `${types[path.extname(file)]}; charset=utf-8` }); res.end(await readFile(path.join(root, file))); }
  catch { res.writeHead(500); res.end('Unable to load application'); }
}).listen(Number(process.env.PORT) || 5173, '127.0.0.1', () => console.log(`Aura: http://localhost:${process.env.PORT || 5173}`));
