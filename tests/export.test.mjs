// Tests de exportar letra y del formato de respaldo.

import test from 'node:test';
import assert from 'node:assert/strict';
import { songToText, hasChords, fileSlug } from '../js/export.js';
import { parseBackup, countsOf, BACKUP_APP } from '../js/backup.js';

const song = {
  title: 'Canción de prueba', key: 'La menor', bpm: 92,
  sections: [
    { id: 'v', name: 'Verso 1', lines: [{ text: 'Camino solo por la calle', chords: 'Am F' }, { text: 'buscando tu corazón', chords: '' }, { text: '', chords: '' }] },
    { id: 'c', name: 'Coro', lines: [{ text: 'Y no hay razón', chords: 'C G' }] },
    { id: 'p', name: 'Puente', lines: [{ text: '   ', chords: '' }] },
  ],
  structure: [{ sectionId: 'v' }, { sectionId: 'c' }, { sectionId: 'p' }, { sectionId: 'c' }],
};

test('.txt sin acordes: título, datos, secciones en orden y coro repetido completo', () => {
  const txt = songToText(song);
  assert.equal(txt, [
    'Canción de prueba', 'La menor · 92 BPM', '',
    '[Verso 1]', 'Camino solo por la calle', 'buscando tu corazón', '',
    '[Coro]', 'Y no hay razón', '',
    '[Coro]', 'Y no hay razón', '',
  ].join('\n'));
  assert.ok(!txt.includes('Puente'), 'las secciones vacías no salen');
  assert.ok(!txt.includes('Am'), 'sin acordes');
});

test('.txt con acordes: el acorde va sobre su verso', () => {
  const txt = songToText(song, { chords: true });
  assert.ok(txt.includes('[Verso 1]\nAm F\nCamino solo por la calle\nbuscando tu corazón'));
});

test('.md: título con #, secciones con ## y saltos de línea', () => {
  const md = songToText(song, { markdown: true });
  assert.ok(md.startsWith('# Canción de prueba\n\n*La menor · 92 BPM*'));
  assert.ok(md.includes('## Coro\nY no hay razón  '));
  const withChords = songToText(song, { markdown: true, chords: true });
  assert.ok(withChords.includes('## Coro\n```\nC G\nY no hay razón\n```'));
});

test('detecta acordes y arma nombres de archivo seguros', () => {
  assert.equal(hasChords(song), true);
  assert.equal(fileSlug('Canción de prueba'), 'cancion-de-prueba');
  assert.equal(fileSlug('¿Año? ñandú!'), 'ano-nandu');
  assert.equal(fileSlug('   '), 'cancion');
});

test('respaldo: acepta el formato propio y rechaza otros archivos', () => {
  const ok = parseBackup(JSON.stringify({ app: BACKUP_APP, format: 1, exportedAt: 1, data: { songs: [{ id: 'a' }] } }));
  assert.deepEqual(countsOf(ok.data), { songs: 1, versions: 0, audios: 0, ideas: 0, dictionary: 0 });
  assert.throws(() => parseBackup('no es json'), /no es un respaldo válido/);
  assert.throws(() => parseBackup('{"app":"otra"}'), /no es un respaldo de Cuaderno/);
  assert.throws(() => parseBackup(JSON.stringify({ app: BACKUP_APP, format: 99, data: {} })), /versión más nueva/);
});
