// Banco de ideas.
//
// Una idea: { id, kind, text, audioId, tags, createdAt, usedIn }
//   kind:   'frase' | 'palabra' | 'imagen' | 'voz'
//   usedIn: null (sin usar) o { songId, songTitle, sectionId, sectionName, at }

import * as db from './db.js';
import { uid, newLine } from './songs.js';

export const KINDS = {
  frase: 'Frase',
  palabra: 'Palabra',
  imagen: 'Imagen',
  voz: 'Nota de voz',
};

export const PLACEHOLDERS = {
  frase: 'Una frase que se te ocurrió…',
  palabra: 'Una palabra que te gusta…',
  imagen: 'Describe la imagen: un perro mojado bajo un farol…',
};

export async function listIdeas() {
  const ideas = await db.getAll('ideas');
  return ideas.sort((a, b) => b.createdAt - a.createdAt);
}

export const saveIdea = (idea) => db.put('ideas', idea);

export async function createIdea({ kind, text, tags = [] }) {
  const idea = { id: uid(), kind, text: text.trim(), audioId: null, tags, createdAt: Date.now(), usedIn: null };
  await saveIdea(idea);
  return idea;
}

/** Borra la idea y, si es de voz, su audio. */
export function deleteIdea(idea) {
  return db.transaction(['ideas', 'audios'], 'readwrite', (tx) => {
    tx.objectStore('ideas').delete(idea.id);
    if (idea.audioId) tx.objectStore('audios').delete(idea.audioId);
  });
}

export function parseTags(text) {
  return [...new Set(String(text || '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))];
}

export function markUsed(idea, song, sec) {
  idea.usedIn = {
    songId: song.id,
    songTitle: song.title.trim() || 'Sin título',
    sectionId: sec?.id || null,
    sectionName: sec?.name || null,
    at: Date.now(),
  };
  return saveIdea(idea);
}

export function markUnused(idea) {
  idea.usedIn = null;
  return saveIdea(idea);
}

/**
 * Pega el texto de una idea al final de una sección (en memoria; quien llama guarda).
 * Si el último verso está vacío, lo usa. Devuelve las líneas nuevas.
 */
export function appendTextToSection(sec, text) {
  const parts = String(text).split(/\r?\n/).map((t) => t.trim()).filter(Boolean);
  if (!parts.length) return [];
  const touched = [];
  const last = sec.lines[sec.lines.length - 1];
  if (last && !last.text.trim()) {
    last.text = parts.shift();
    touched.push(last);
  }
  for (const p of parts) {
    const line = newLine(p);
    sec.lines.push(line);
    touched.push(line);
  }
  return touched;
}

/**
 * 3 ideas para inspirarte: sin usar y, de preferencia, viejas.
 * Se elige al azar dentro del 60 % más antiguo.
 */
export function randomIdeas(ideas, n = 3, exclude = []) {
  const skip = new Set(exclude);
  const unused = ideas.filter((i) => !i.usedIn);
  const sorted = [...(unused.length >= n ? unused : ideas)].sort((a, b) => a.createdAt - b.createdAt);
  const older = sorted.slice(0, Math.max(n, Math.ceil(sorted.length * 0.6)));
  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  // Primero viejas que no acabas de ver, luego otras nuevas, y al final repetir si no queda más.
  const fresh = shuffle(older.filter((i) => !skip.has(i.id)));
  const rest = shuffle(sorted.filter((i) => !skip.has(i.id) && !older.includes(i)));
  const seen = shuffle(sorted.filter((i) => skip.has(i.id)));
  return [...fresh, ...rest, ...seen].slice(0, n);
}

/** Texto para mostrar o buscar. */
export function ideaLabel(idea, note) {
  if (idea.kind === 'voz') return note?.name || idea.text || 'Nota de voz';
  return idea.text;
}
