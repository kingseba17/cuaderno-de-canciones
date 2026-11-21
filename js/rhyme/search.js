// Búsqueda de rimas sobre el índice precalculado (data/rhyme-index.json).
// Funciona igual en la app y en los tests.

import { analyze, cleanWord, phonetic } from './phonetics.js';

const TYPE_OF = { a: 'aguda', g: 'grave', e: 'esdrujula', s: 'sobresdrujula' };
const CHAR_OF = { aguda: 'a', grave: 'g', esdrujula: 'e', sobresdrujula: 's' };
export const COMMON_LIMIT = 25000; // las 25.000 palabras más usadas se marcan como "comunes"
const BIG = 1e9; // posición para palabras que no están en el índice (tuyas o de tus canciones)

/** Prepara el índice para buscar rápido. */
export function buildIndex(data) {
  const words = data.words.split(' ');
  const syl = data.syl;
  const rank = new Map();
  words.forEach((w, i) => rank.set(w, i));
  const byCons = new Map();
  const byAso = new Map();
  for (const [cons, aso, t, ids] of data.groups) {
    const group = { cons, aso, type: TYPE_OF[t], raw: ids, ids: null };
    byCons.set(t + cons, group);
    if (!byAso.has(aso)) byAso.set(aso, []);
    byAso.get(aso).push(group);
  }
  return { words, syl, rank, byCons, byAso, groups: [...byCons.values()] };
}

function groupIds(group) {
  if (!group.ids) group.ids = group.raw.split(' ').map((s) => parseInt(s, 36));
  return group.ids;
}

/** Convierte posiciones del índice en resultados { word, syllables, type, rank, common }. */
function fromIndex(index, ids, type) {
  return ids.map((i) => ({ word: index.words[i], syllables: Number(index.syl[i]), type, rank: i, common: i < COMMON_LIMIT }));
}

function fromAnalysis(info, extra) {
  return { word: info.word, syllables: info.count, type: info.type, rank: BIG, common: true, ...extra };
}

/** Agrupa por número de sílabas, aplicando filtros, sin repetir palabras. */
function finish(list, opts, exclude) {
  const seen = new Set(exclude);
  const out = new Map();
  list.sort((a, b) => (b.personal ? 1 : 0) - (a.personal ? 1 : 0) || a.rank - b.rank);
  for (const r of list) {
    if (seen.has(r.word)) continue;
    if (opts.syllables && (opts.syllables >= 5 ? r.syllables < 5 : r.syllables !== opts.syllables)) continue;
    if (opts.type && r.type !== opts.type) continue;
    seen.add(r.word);
    const key = Math.min(r.syllables, 9);
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(r);
  }
  const groups = [...out.entries()].sort((a, b) => a[0] - b[0]).map(([syllables, words]) => ({ syllables, words }));
  return { groups, total: groups.reduce((n, g) => n + g.words.length, 0) };
}

/** Analiza una lista de palabras propias (tu diccionario o las de tus canciones). */
export function analyzeList(words) {
  const out = [];
  const seen = new Set();
  for (const w of words) {
    const clean = cleanWord(w);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    const info = analyze(clean);
    if (info?.aso) out.push(info);
  }
  return out;
}

/**
 * Rimas de una palabra.
 * opts: { syllables, type, personal: [análisis], used: [análisis] | null }
 *   - used: si viene, solo se buscan palabras que ya usaste en tus canciones.
 */
export function rhymesForWord(index, word, opts = {}) {
  const info = analyze(word);
  if (!info || !info.aso) return null;
  const consList = [];
  const asoList = [];

  if (opts.used) {
    for (const u of opts.used) {
      if (u.word === info.word) continue;
      if (u.cons === info.cons && u.type === info.type) consList.push(fromAnalysis(u, { used: true, rank: index.rank.get(u.word) ?? BIG }));
      else if (u.aso === info.aso) asoList.push(fromAnalysis(u, { used: true, rank: index.rank.get(u.word) ?? BIG }));
    }
  } else {
    const own = index.byCons.get(CHAR_OF[info.type] + info.cons);
    if (own) consList.push(...fromIndex(index, groupIds(own), own.type));
    for (const g of index.byAso.get(info.aso) || []) {
      if (g === own) continue;
      if (opts.type && g.type !== opts.type) continue;
      asoList.push(...fromIndex(index, groupIds(g), g.type));
    }
  }

  for (const p of opts.personal || []) {
    if (p.word === info.word) continue;
    if (p.cons === info.cons && p.type === info.type) consList.push(fromAnalysis(p, { personal: true }));
    else if (p.aso === info.aso) asoList.push(fromAnalysis(p, { personal: true }));
  }

  const consonant = finish(consList, opts, [info.word]);
  const consonantWords = consonant.groups.flatMap((g) => g.words.map((r) => r.word));
  const assonant = finish(asoList, opts, [info.word, ...consonantWords]);
  return { info, consonant, assonant };
}

/** Palabras que terminan con un sonido: "-ción", "-ado". */
export function wordsEndingWith(index, ending, opts = {}) {
  const target = phonetic(cleanWord(ending));
  if (!target) return null;
  const list = [];
  for (const g of index.groups) {
    if (opts.type && g.type !== opts.type) continue;
    if (g.cons.endsWith(target)) {
      list.push(...fromIndex(index, groupIds(g), g.type));
    } else if (target.endsWith(g.cons)) {
      for (const r of fromIndex(index, groupIds(g), g.type)) {
        if (phonetic(r.word).endsWith(target)) list.push(r);
      }
    }
  }
  for (const p of opts.personal || []) {
    if (phonetic(p.word).endsWith(target)) list.push(fromAnalysis(p, { personal: true }));
  }
  const pool = opts.used ? new Set(opts.used.map((u) => u.word)) : null;
  return { target, results: finish(pool ? list.filter((r) => pool.has(r.word)) : list, opts, []) };
}

/**
 * Busca según lo que escribas:
 *  - una palabra:          rimas de esa palabra
 *  - "-ción":              palabras que terminan así
 *  - dos o más palabras:   rimas de frase (multisílabas): la penúltima y la última por separado
 */
export function search(index, query, opts = {}) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return null;
  if (q.startsWith('-')) {
    const r = wordsEndingWith(index, q.slice(1), opts);
    return r && { kind: 'ending', ending: q.slice(1), ...r };
  }
  const parts = q.split(/\s+/).map(cleanWord).filter(Boolean);
  if (!parts.length) return null;
  if (parts.length === 1) {
    const r = rhymesForWord(index, parts[0], opts);
    return r && { kind: 'word', ...r };
  }
  const [prev, last] = parts.slice(-2);
  const a = rhymesForWord(index, prev, opts);
  const b = rhymesForWord(index, last, opts);
  if (!a || !b) return null;
  return { kind: 'phrase', words: [prev, last], pattern: `${vowelPattern(a.info)} · ${vowelPattern(b.info)}`, parts: [a, b] };
}

/** Vocales desde la tónica, con la tónica en mayúscula: "amor" → "O", "partido" → "I-o". */
export function vowelPattern(info) {
  return info.aso.split('').map((v, i) => (i === 0 ? v.toUpperCase() : v)).join('-');
}
