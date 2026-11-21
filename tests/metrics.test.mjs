// Tests de métrica (sílabas de cada verso) y esquema de rimas por estrofa.

import test from 'node:test';
import assert from 'node:assert/strict';
import { metricLine, stanzaRhymes } from '../js/metrics.js';

const m = (text) => metricLine(text).metric;

test('versos clásicos: octosílabos', () => {
  assert.equal(m('Verde que te quiero verde'), 8);           // Lorca
  assert.equal(m('Caminante, no hay camino'), 8);            // Machado: sinalefa "no‿hay"
});

test('sinalefa: "La princesa está triste" = 7', () => {
  const r = metricLine('La princesa está triste');             // Darío
  assert.equal(r.metric, 7);
  assert.equal(r.merges, 1);
  assert.equal(r.display, 'la prin·ce·sa‿es·tá tris·te');
});

test('alejandrino: "Puedo escribir los versos más tristes esta noche" = 14', () => {
  assert.equal(m('Puedo escribir los versos más tristes esta noche'), 14);  // Neruda
});

test('final agudo suma 1, esdrújulo resta 1', () => {
  assert.equal(m('buscando tu corazón'), 8);   // 7 + 1
  assert.equal(m('canto una canción'), 6);      // can·to‿u·na·can·ción = 5 + 1
  assert.equal(m('bajo la luz de la lámpara'), 8); // 9 − 1
});

test('la "y" se une con las vocales vecinas', () => {
  assert.equal(m('la luna y el mar'), 5);   // la·lu·na‿y‿el·mar = 4 + 1
});

test('"hie" y "hue" no hacen sinalefa', () => {
  assert.equal(metricLine('la hierba').merges, 0);
  assert.equal(metricLine('la hora').merges, 1);
});

test('un verso vacío no cuenta', () => {
  assert.equal(metricLine('   '), null);
  assert.equal(metricLine('...'), null);
});

test('esquema ABAB con rima consonante', () => {
  const r = stanzaRhymes(['buscando tu corazón', 'camino por la calle', 'no tengo razón', 'me pierdo en el valle']);
  assert.equal(r.scheme, 'ABAB');
  assert.ok(r.lines.every((l) => l.strength === 'strong'));
  assert.equal(r.lines[0].color, r.lines[2].color);
  assert.notEqual(r.lines[0].color, r.lines[1].color);
});

test('esquema ABAB con rima asonante', () => {
  const r = stanzaRhymes(['mi casa', 'el olivo', 'tu cama', 'el trigo']);
  assert.equal(r.scheme, 'ABAB');
  assert.ok(r.lines.every((l) => l.strength === 'soft'));
});

test('esquema AABB y versos sueltos', () => {
  assert.equal(stanzaRhymes(['amor', 'dolor', 'casa', 'taza']).scheme, 'AABB');
  assert.equal(stanzaRhymes(['luna', 'mar', 'cielo']).scheme, '');
  assert.equal(stanzaRhymes(['luna', 'amor', 'cielo', 'dolor']).scheme, '–A–A');
});

test('una asonante se une al grupo consonante con las mismas vocales', () => {
  const r = stanzaRhymes(['amor', 'sol', 'dolor']);
  assert.equal(r.scheme, 'AAA');
  assert.equal(r.lines[0].strength, 'strong');
  assert.equal(r.lines[1].strength, 'soft');
});

test('marca la posición de la palabra final', () => {
  const r = stanzaRhymes(['buscando tu corazón,', 'no tengo razón']);
  assert.equal(r.lines[0].start, 12);
  assert.equal(r.lines[0].end, 19);
});
