// Servidor local para probar la app: node tools/serve.mjs
// Sirve los archivos de esta carpeta en http://localhost:5173

import http from 'node:http';
import os from 'node:os';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT) || 5173;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const server = http.createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    // No servir carpetas ocultas (.git, .claude) ni node_modules.
    if (path.split('/').some((p) => p.startsWith('.') || p === 'node_modules')) throw Object.assign(new Error(), { code: 'ENOENT' });
    const file = resolve(root, '.' + path);
    if (file !== root && !file.startsWith(root + sep)) throw Object.assign(new Error(), { code: 'ENOENT' });
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch (err) {
    res.writeHead(err.code === 'ENOENT' || err.code === 'EISDIR' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('No encontrado');
  }
});

server.listen(PORT, () => {
  console.log(`\nCuaderno de Canciones en http://localhost:${PORT}`);
  const lan = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal);
  if (lan) console.log(`Desde el iPhone (mismo wifi): http://${lan.address}:${PORT}`);
  console.log('Para detenerlo: Ctrl+C\n');
});
