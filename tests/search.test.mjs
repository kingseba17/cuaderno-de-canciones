// Tests de la búsqueda sobre el índice real (data/rhyme-index.json).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildIndex, search, analyzeList } from '../js/rhyme/search.js';

const t0 = performance.now();
const index = buildIndex(JSON.parse(readFileSync(new URL('../data/rhyme-index.json', import.meta.url), 'utf8')));
const loadMs = performance.now() - t0;

const wordsOf = (res) => res.groups.flatMap((g) => g.words.map((w) => w.word));

test('el índice carga en menos de 1 segundo', () => {
  assert.ok(loadMs < 1000, `tardó ${loadMs.toFixed(0)} ms`);
});

test('"amor" muestra consonantes y asonantes en menos de 1 segundo', () => {
  const t = performance.now();
  const r = search(index, 'amor');
  const ms = performance.now() - t;
  assert.ok(ms < 1000, `tardó ${ms.toFixed(0)} ms`);
  const cons = wordsOf(r.consonant);
  const aso = wordsOf(r.assonant);
  for (const w of ['dolor', 'flor', 'calor', 'color']) assert.ok(cons.includes(w), w);
  for (const w of ['corazón', 'sol', 'voz']) assert.ok(aso.includes(w), w);
  assert.ok(!cons.includes('amor') && !aso.includes('amor'), 'no se rima consigo misma');
  assert.ok(!aso.includes('dolor'), 'las consonantes no se repiten en asonantes');
});

test('filtro por sílabas: "amor" con 2 sílabas', () => {
  const r = search(index, 'amor', { syllables: 2 });
  assert.ok(r.consonant.groups.every((g) => g.syllables === 2));
  assert.ok(wordsOf(r.consonant).includes('dolor'));
  assert.ok(!wordsOf(r.consonant).includes('flor'));
});

test('las palabras comunes salen primero', () => {
  const r = search(index, 'corazón');
  const two = r.consonant.groups.find((g) => g.syllables === 2).words.map((w) => w.word);
  assert.ok(two.indexOf('razón') < 10, 'razón entre las primeras');
});

test('"casa" encuentra "taza" (consonante) y "cama" (asonante)', () => {
  const r = search(index, 'casa');
  assert.ok(wordsOf(r.consonant).includes('taza'));
  assert.ok(wordsOf(r.assonant).includes('cama'));
});

test('diccionario personal: "cachai" y "bacán" entran a las búsquedas', () => {
  const personal = analyzeList(['cachai', 'bacán']);
  const r = search(index, 'jamás', { personal });
  assert.ok(wordsOf(r.consonant).includes('bacán') === false);
  assert.ok(wordsOf(r.assonant).includes('bacán'));
  const r2 = search(index, 'hay', { personal });
  assert.ok(wordsOf(r2.consonant).includes('cachai'));
  const twoSyl = r2.consonant.groups.find((g) => g.syllables === 2).words;
  assert.equal(twoSyl[0].word, 'cachai', 'las tuyas salen primero en su grupo');
  assert.equal(twoSyl[0].personal, true);
});

test('solo palabras usadas en mis canciones', () => {
  const used = analyzeList('camino solo por la calle buscando tu corazón y no hay razón'.split(' '));
  const r = search(index, 'canción', { used });
  assert.deepEqual(wordsOf(r.consonant).sort(), ['corazón', 'razón']);
});

test('terminaciones: "-ción" trae palabras que terminan así', () => {
  const r = search(index, '-ción');
  const words = wordsOf(r.results);
  assert.ok(words.includes('canción') && words.includes('emoción'));
  // Con seseo, -ción, -sión, -zión y -xión (conexión = "coneksión") suenan igual al final.
  assert.ok(words.every((w) => /[csxz]i[oó]n$/.test(w)), 'todas terminan en -ción / -sión / -xión');
});

test('rimas de frase: "corazón partido"', () => {
  const r = search(index, 'mi corazón partido');
  assert.equal(r.kind, 'phrase');
  assert.deepEqual(r.words, ['corazón', 'partido']);
  assert.equal(r.pattern, 'O · I-o');
  assert.ok(wordsOf(r.parts[1].consonant).includes('perdido'));
});
