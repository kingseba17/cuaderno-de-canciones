// Tests del motor de rimas. Se corren con:  npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, rhymeType, countSyllables, phonetic } from '../js/rhyme/phonetics.js';

// ---- Los casos pedidos ----

test('"corazón" rima consonante con "canción", "razón", "pasión"', () => {
  for (const w of ['canción', 'razón', 'pasión']) {
    assert.equal(rhymeType('corazón', w), 'consonante', w);
  }
});

test('"casa" rima consonante con "taza" (seseo)', () => {
  assert.equal(rhymeType('casa', 'taza'), 'consonante');
});

test('"casa" rima asonante con "cama" y "playa"', () => {
  assert.equal(rhymeType('casa', 'cama'), 'asonante');
  assert.equal(rhymeType('casa', 'playa'), 'asonante');
});

test('"olivo" rima asonante con "trigo"', () => {
  assert.equal(rhymeType('olivo', 'trigo'), 'asonante');
});

test('"vaca" rima consonante con "baca" (b = v)', () => {
  assert.equal(rhymeType('vaca', 'baca'), 'consonante');
});

test('"camión" NO rima consonante con "camino"', () => {
  assert.notEqual(rhymeType('camión', 'camino'), 'consonante');
});

test('sílabas: "corazón" = 3, "esdrújula" = 4, "Chile" = 2', () => {
  assert.equal(countSyllables('corazón'), 3);
  assert.equal(countSyllables('esdrújula'), 4);
  assert.equal(countSyllables('Chile'), 2);
});

// ---- Casos extra: separación en sílabas ----

test('separa bien diptongos, hiatos y grupos de consonantes', () => {
  const cases = {
    'día': 'dí-a', 'país': 'pa-ís', 'cielo': 'cie-lo', 'ciudad': 'ciu-dad', 'poeta': 'po-e-ta',
    'aire': 'ai-re', 'buey': 'buey', 'guitarra': 'gui-ta-rra', 'pingüino': 'pin-güi-no',
    'quiero': 'quie-ro', 'ahora': 'a-ho-ra', 'hombre': 'hom-bre', 'instante': 'ins-tan-te',
    'calle': 'ca-lle', 'muchacho': 'mu-cha-cho', 'abstracto': 'abs-trac-to', 'leía': 'le-í-a',
    'creer': 'cre-er', 'Paraguay': 'pa-ra-guay', 'canción': 'can-ción', 'hablar': 'ha-blar',
  };
  for (const [word, expected] of Object.entries(cases)) {
    assert.equal(analyze(word).syllables.join('-'), expected, word);
  }
});

test('reconoce agudas, graves, esdrújulas y sobresdrújulas', () => {
  const cases = {
    'amor': 'aguda', 'canción': 'aguda', 'reloj': 'aguda', 'estoy': 'aguda', 'café': 'aguda',
    'casa': 'grave', 'árbol': 'grave', 'joven': 'grave', 'lunes': 'grave', 'Chile': 'grave',
    'música': 'esdrujula', 'lágrima': 'esdrujula', 'esdrújula': 'esdrujula',
    'dígamelo': 'sobresdrujula',
  };
  for (const [word, type] of Object.entries(cases)) {
    assert.equal(analyze(word).type, type, word);
  }
});

// ---- Casos extra: pronunciación chilena ----

test('ll = y: "valla" rima consonante con "vaya"', () => {
  assert.equal(rhymeType('valla', 'vaya'), 'consonante');
});

test('h muda: "hecho" rima consonante con "derecho"', () => {
  assert.equal(rhymeType('hecho', 'derecho'), 'consonante');
});

test('g(e,i) = j: "elige" rima consonante con "dije"', () => {
  assert.equal(rhymeType('elige', 'dije'), 'consonante');
});

test('qu = k, gu(e,i) = g, c(e,i) = s', () => {
  assert.equal(phonetic('quilo'), phonetic('kilo'));
  assert.equal(phonetic('guitarra'), 'gitaRa');
  assert.equal(phonetic('cielo'), phonetic('sielo'));
  assert.equal(phonetic('pingüino'), 'pinguino');
});

test('"rey" rima consonante con "ley" y "y" final suena como i', () => {
  assert.equal(rhymeType('rey', 'ley'), 'consonante');
  assert.equal(analyze('rey').cons, 'ei');
});

test('asonante ignora la vocal débil del diptongo: "patio" con "barco"', () => {
  assert.equal(rhymeType('patio', 'barco'), 'asonante');
  assert.equal(rhymeType('gracia', 'casa'), 'asonante');
});

test('esdrújula asuena con grave: "lágrima" con "casa"', () => {
  assert.equal(rhymeType('lágrima', 'casa'), 'asonante');
});

test('aguda y grave no riman: "amor" con "flores"', () => {
  assert.equal(rhymeType('amor', 'flores'), null);
});

test('"amor": consonante con "dolor", asonante con "corazón"', () => {
  assert.equal(rhymeType('amor', 'dolor'), 'consonante');
  assert.equal(rhymeType('amor', 'corazón'), 'asonante');
});

test('chilenismos sin tilde que terminan en diptongo son agudas: "cachai", "estai"', () => {
  assert.equal(analyze('cachai').type, 'aguda');
  assert.equal(rhymeType('cachai', 'hay'), 'consonante');
  assert.equal(rhymeType('estai', 'jamás'), 'asonante');
});

test('"carro" no rima consonante con "caro" (rr distinta de r)', () => {
  assert.equal(rhymeType('carro', 'caro'), 'asonante');
});
