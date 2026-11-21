// Métrica de versos y detección de rimas por estrofa.
//
// Sílabas métricas = sílabas de las palabras
//   − sinalefas (vocal final + vocal inicial se unen: "la‿estrella")
//   + 1 si la última palabra es aguda, − 1 si es esdrújula (− 2 si es sobresdrújula).

import { analyze } from './rhyme/phonetics.js';

const WORD_RE = /[a-záéíóúüñ]+/gi;
const ADJUST = { aguda: 1, grave: 0, esdrujula: -1, sobresdrujula: -2 };
export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const COLOR_COUNT = 6;

const endsInVowel = (w) => w === 'y' || /[aeiouáéíóúü]$/.test(w);
// "h" no suena, pero "hie-lo" y "hue-vo" empiezan con sonido de consonante.
const startsWithVowel = (w) => w === 'y' || (/^h?[aeiouáéíóúü]/.test(w) && !/^h[iu][aeiouáéíóú]/.test(w));

/**
 * Cuenta las sílabas métricas de un verso.
 * Devuelve null si no hay palabras, o { metric, phonetic, merges, adjust, type, display }
 * display muestra la separación: "la·prin·ce·sa‿es·tá·tris·te"
 */
export function metricLine(text) {
  const infos = (String(text || '').match(WORD_RE) || [])
    .map((w) => analyze(w))
    .filter((info) => info && info.aso);
  if (!infos.length) return null;

  let phonetic = 0;
  let merges = 0;
  const parts = [];
  infos.forEach((info, k) => {
    phonetic += info.count;
    const piece = info.syllables.join('·');
    if (k > 0 && endsInVowel(infos[k - 1].word) && startsWithVowel(info.word)) {
      merges += 1;
      parts[parts.length - 1] += '‿' + piece;
    } else {
      parts.push(piece);
    }
  });
  const type = infos[infos.length - 1].type;
  const adjust = ADJUST[type];
  return { metric: phonetic - merges + adjust, phonetic, merges, adjust, type, display: parts.join(' ') };
}

/** Última palabra de un verso, con su posición en el texto. */
export function finalWord(text) {
  const matches = [...String(text || '').matchAll(WORD_RE)];
  const m = matches[matches.length - 1];
  if (!m) return null;
  const info = analyze(m[0]);
  if (!info || !info.aso) return null;
  return { start: m.index, end: m.index + m[0].length, word: m[0], info };
}

/**
 * Detecta qué versos de una estrofa riman entre sí.
 * Devuelve { lines: [ { start, end, letter, color, strength } | null ], scheme: "ABAB" }
 *   strength: 'strong' = rima consonante, 'soft' = solo asonante
 *   Los versos que no riman con ninguno llevan letter null y en el esquema salen como "–".
 */
export function stanzaRhymes(texts) {
  const finals = texts.map(finalWord);
  const consCount = new Map();
  const asoCount = new Map();
  for (const f of finals) {
    if (!f) continue;
    const ck = f.info.type + f.info.cons;
    consCount.set(ck, (consCount.get(ck) || 0) + 1);
    asoCount.set(f.info.aso, (asoCount.get(f.info.aso) || 0) + 1);
  }

  // Cada verso recibe una "clave de grupo": consonante si tiene pareja consonante;
  // si solo asuena, se une al primer grupo consonante con esas mismas vocales.
  const keys = finals.map((f) => {
    if (!f) return null;
    const ck = f.info.type + f.info.cons;
    if (consCount.get(ck) >= 2) return { key: 'c' + ck, strength: 'strong' };
    if (asoCount.get(f.info.aso) >= 2) return { key: null, strength: 'soft', aso: f.info.aso };
    return null;
  });
  keys.forEach((k, i) => {
    if (!k || k.key) return;
    const j = finals.findIndex((f, idx) => f && keys[idx]?.key && f.info.aso === k.aso);
    k.key = j >= 0 ? keys[j].key : 'a' + k.aso;
  });

  const letterOf = new Map();
  const lines = finals.map((f, i) => {
    if (!f) return null;
    const k = keys[i];
    if (!k) return { start: f.start, end: f.end, letter: null, color: 0, strength: null };
    if (!letterOf.has(k.key)) letterOf.set(k.key, letterOf.size);
    const n = letterOf.get(k.key);
    return { start: f.start, end: f.end, letter: LETTERS[n % LETTERS.length], color: (n % COLOR_COUNT) + 1, strength: k.strength };
  });

  const scheme = lines.filter(Boolean).map((l) => l.letter || '–').join('');
  return { lines, scheme: letterOf.size ? scheme : '' };
}
