// Mi diccionario (palabras chilenas, jerga...) y las palabras que ya usé en mis canciones.

import * as db from './db.js';
import { cleanWord } from './rhyme/phonetics.js';
import { analyzeList } from './rhyme/search.js';

let personalCache = null;

export async function listPersonal() {
  const rows = await db.getAll('dictionary');
  return rows.sort((a, b) => a.word.localeCompare(b.word, 'es'));
}

export async function addPersonal(word) {
  const w = cleanWord(word);
  if (!w) return null;
  await db.put('dictionary', { word: w, addedAt: Date.now() });
  personalCache = null;
  return w;
}

export async function removePersonal(word) {
  await db.del('dictionary', word);
  personalCache = null;
}

export async function personalAnalyzed() {
  if (!personalCache) personalCache = analyzeList((await listPersonal()).map((r) => r.word));
  return personalCache;
}

/** Todas las palabras de tus letras, analizadas. */
export async function usedAnalyzed() {
  const songs = await db.getAll('songs');
  const words = [];
  for (const song of songs) {
    for (const sec of song.sections) {
      for (const line of sec.lines) words.push(...line.text.split(/[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]+/));
    }
  }
  return analyzeList(words.filter((w) => w.length > 1));
}
