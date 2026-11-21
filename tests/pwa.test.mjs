// Revisa que la app pueda funcionar sin internet: el service worker debe guardar todos los archivos.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_VERSION } from '../js/version.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const precache = [...sw.match(/const PRECACHE = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

function walk(dir) {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const path = join(root, dir, name);
    return statSync(path).isDirectory() ? walk(join(dir, name)) : [relative(root, path).split(sep).join('/')];
  });
}

test('el service worker guarda todos los archivos de la app', () => {
  const needed = ['index.html', 'manifest.webmanifest', ...walk('js'), ...walk('css'), ...walk('data'), ...walk('icons')];
  const missing = needed.filter((f) => !precache.includes(f));
  assert.deepEqual(missing, [], 'faltan en PRECACHE de sw.js');
});

test('todo lo que el service worker guarda existe', () => {
  const absent = precache.filter((f) => f !== './' && !existsSync(join(root, f)));
  assert.deepEqual(absent, []);
});

test('la versión de sw.js coincide con js/version.js', () => {
  assert.equal(sw.match(/const VERSION = '([^']+)'/)[1], APP_VERSION);
});

test('el manifest es válido y sus íconos existen', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './', 'rutas relativas para GitHub Pages');
  for (const icon of manifest.icons) assert.ok(existsSync(join(root, icon.src)), icon.src);
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  assert.ok(html.includes('apple-touch-icon'), 'ícono para el iPhone');
});

test('no hay rutas absolutas que fallen en GitHub Pages (/usuario.github.io/repo/)', () => {
  const files = ['index.html', ...walk('js')].map((f) => [f, readFileSync(join(root, f), 'utf8')]);
  for (const [f, text] of files) {
    assert.ok(!/(src|href)="\/(?!\/)/.test(text), `${f}: usa rutas relativas`);
    assert.ok(!/fetch\(['"]\//.test(text), `${f}: fetch con ruta absoluta`);
  }
});
