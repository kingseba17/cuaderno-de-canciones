// Tests del banco de ideas (las partes que no necesitan base de datos).

import test from 'node:test';
import assert from 'node:assert/strict';
import { randomIdeas, appendTextToSection, parseTags } from '../js/ideas.js';

const day = 86400000;
const make = (n, used = []) => Array.from({ length: n }, (_, i) => ({
  id: 'i' + i, kind: 'frase', text: 'idea ' + i, createdAt: i * day, usedIn: used.includes(i) ? { songId: 's' } : null,
}));

test('ideas al azar: 3 ideas, sin usar, de las más viejas', () => {
  const ideas = make(20, [0, 1]);
  for (let k = 0; k < 50; k++) {
    const r = randomIdeas(ideas, 3);
    assert.equal(r.length, 3);
    assert.equal(new Set(r.map((i) => i.id)).size, 3, 'sin repetir');
    assert.ok(r.every((i) => !i.usedIn), 'sin usar');
    assert.ok(r.every((i) => i.createdAt <= 13 * day), 'del 60 % más viejo');
  }
});

test('"Otras 3" no repite las que acabas de ver si hay más', () => {
  const ideas = make(10);
  const first = randomIdeas(ideas, 3);
  const second = randomIdeas(ideas, 3, first.map((i) => i.id));
  assert.ok(second.every((i) => !first.includes(i)));
});

test('con pocas ideas igual cambia algo', () => {
  const ideas = make(4);
  const first = randomIdeas(ideas, 3);
  const second = randomIdeas(ideas, 3, first.map((i) => i.id));
  assert.equal(second.length, 3);
  const missing = ideas.find((i) => !first.includes(i));
  assert.ok(second.includes(missing), 'aparece la que faltaba');
});

test('pegar una idea usa el verso vacío y separa líneas', () => {
  const sec = { lines: [{ id: 'a', text: 'primer verso', chords: '' }, { id: 'b', text: '', chords: '' }] };
  const added = appendTextToSection(sec, 'línea uno\nlínea dos');
  assert.deepEqual(sec.lines.map((l) => l.text), ['primer verso', 'línea uno', 'línea dos']);
  assert.equal(added.length, 2);
  assert.equal(sec.lines[1].id, 'b', 'reusa el verso vacío');
});

test('etiquetas: sin repetir, en minúscula', () => {
  assert.deepEqual(parseTags('Noche, mar,  noche ,'), ['noche', 'mar']);
});
