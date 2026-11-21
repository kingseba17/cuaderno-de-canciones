// Tests de la sincronía entre tu voz y la instrumental.

import test from 'node:test';
import assert from 'node:assert/strict';
import { beatTimeAt, guessMime } from '../js/audio/deck.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test('la instrumental sigue a la voz desde el segundo en que empezaste a grabar', () => {
  const take = { beatOffset: 32.5 };
  close(beatTimeAt(take, 0, 180), 32.5);
  close(beatTimeAt(take, 10, 180), 42.5);
});

test('ajuste de sincronía: positivo adelanta la voz (el beat va más adelante)', () => {
  close(beatTimeAt({ beatOffset: 10, syncMs: 200 }, 5, 180), 15.2);
  close(beatTimeAt({ beatOffset: 10, syncMs: -150 }, 5, 180), 14.85);
});

test('en bucle, la instrumental vuelve a empezar', () => {
  close(beatTimeAt({ beatOffset: 50, beatLoop: true }, 20, 60), 10);
  close(beatTimeAt({ beatOffset: 0, syncMs: -500, beatLoop: true }, 0, 60), 59.5);
});

test('sin bucle, el tiempo puede pasarse del final (el beat se detiene)', () => {
  close(beatTimeAt({ beatOffset: 50 }, 20, 60), 70);
});

test('reconoce el tipo de archivo por la extensión', () => {
  assert.equal(guessMime({ type: '', name: 'beat.MP3' }), 'audio/mpeg');
  assert.equal(guessMime({ type: '', name: 'pista.m4a' }), 'audio/mp4');
  assert.equal(guessMime({ type: 'audio/wav', name: 'x' }), 'audio/wav');
});
