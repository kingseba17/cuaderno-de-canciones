// Arma data/rhyme-index.json, el índice de rimas que usa la app sin internet.
// Se corre una sola vez (o cuando cambie el motor):  npm run build-index
//
// Fuentes:
//  - FrequencyWords (Hermit Dave), palabras de subtítulos con su frecuencia y tildes. CC-BY-SA 4.0
//    https://github.com/hermitdave/FrequencyWords
//  - an-array-of-spanish-words (Titus Wormer), ~636.000 palabras del español, sin tildes. MIT
//    Se usa para filtrar: solo quedan palabras que existen en el diccionario.
//
// Formato del índice (compacto, para que cargue rápido en el iPhone):
//  words:  todas las palabras separadas por espacio, de la más usada a la menos usada.
//          El número de cada palabra es su posición (0 = la más común).
//  syl:    un dígito por palabra con su número de sílabas (9 = 9 o más).
//  groups: [claveConsonante, claveAsonante, tipo, "posiciones en base 36"]
//          Todas las palabras de un grupo riman consonante entre sí.

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { analyze } from '../js/rhyme/phonetics.js';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('..', import.meta.url));
const CACHE = root + 'tools/cache/es_full.txt';
const SOURCE_URL = 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/es/es_full.txt';
const OUT = root + 'data/rhyme-index.json';

const MIN_COUNT = 3;          // apariciones mínimas en los subtítulos
const VARIANT_RATIO = 0.1;    // "cancion" (sin tilde) se descarta si "canción" es 10 veces más usada
const MAX_LENGTH = 18;
const SINGLE_LETTERS = new Set(['a', 'e', 'o', 'u', 'y']);
const TYPE_CHAR = { aguda: 'a', grave: 'g', esdrujula: 'e', sobresdrujula: 's' };

const deaccent = (w) => w.replace(/[áéíóúü]/g, (c) => ({ á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u' })[c]);

async function loadFrequencies() {
  try {
    await access(CACHE);
  } catch {
    console.log('Descargando lista de frecuencias…');
    const res = await fetch(SOURCE_URL);
    if (!res.ok) throw new Error('No se pudo descargar: ' + res.status);
    await mkdir(root + 'tools/cache', { recursive: true });
    await writeFile(CACHE, await res.text());
  }
  return readFile(CACHE, 'utf8');
}

const dictionary = new Set(require('an-array-of-spanish-words'));
const text = await loadFrequencies();

// 1. Palabras válidas con su frecuencia.
const byKey = new Map(); // "cancion" -> [["canción", 42468], ["cancion", 1256]]
for (const line of text.split('\n')) {
  const [word, countStr] = line.trim().split(' ');
  const count = Number(countStr);
  if (!word || !(count >= MIN_COUNT)) continue;
  if (!/^[a-záéíóúüñ]+$/.test(word) || word.length > MAX_LENGTH) continue;
  if (word.length === 1 && !SINGLE_LETTERS.has(word)) continue;
  const key = deaccent(word);
  if (!dictionary.has(key)) continue;
  if (!byKey.has(key)) byKey.set(key, []);
  byKey.get(key).push([word, count]);
}

// 2. Entre variantes con y sin tilde, quedan solo las que se usan de verdad.
const kept = [];
for (const variants of byKey.values()) {
  const max = Math.max(...variants.map(([, c]) => c));
  for (const [word, count] of variants) if (count >= max * VARIANT_RATIO) kept.push([word, count]);
}
kept.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'));

// 3. Analizar cada palabra y agrupar por rima consonante.
const words = [];
const syl = [];
const groups = new Map();
for (const [word] of kept) {
  const info = analyze(word);
  if (!info || !info.aso) continue;
  const idx = words.length;
  words.push(word);
  syl.push(Math.min(info.count, 9));
  const key = TYPE_CHAR[info.type] + info.cons;
  if (!groups.has(key)) groups.set(key, { cons: info.cons, aso: info.aso, t: TYPE_CHAR[info.type], ids: [] });
  groups.get(key).ids.push(idx);
}

const index = {
  v: 1,
  credits: 'Frecuencias: FrequencyWords de Hermit Dave (CC-BY-SA 4.0). Filtro: an-array-of-spanish-words de Titus Wormer (MIT).',
  license: 'CC-BY-SA-4.0',
  words: words.join(' '),
  syl: syl.join(''),
  groups: [...groups.values()].map((g) => [g.cons, g.aso, g.t, g.ids.map((n) => n.toString(36)).join(' ')]),
};

await mkdir(root + 'data', { recursive: true });
const json = JSON.stringify(index);
await writeFile(OUT, json);
console.log(`Listo: ${words.length.toLocaleString('es-CL')} palabras, ${groups.size.toLocaleString('es-CL')} grupos de rima, ${(json.length / 1024 / 1024).toFixed(2)} MB → data/rhyme-index.json`);
