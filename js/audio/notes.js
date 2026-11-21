// Notas de voz guardadas en IndexedDB (almacén "audios").
//
// Una nota: { id, blob, mime, duration, name, songId, sectionId, lineId, ideaId, main, createdAt }
//   - songId null + ideaId: está en la bandeja del banco de ideas
//   - main: la toma elegida para "Reproducir canción" en esa sección

import * as db from '../db.js';
import { uid } from '../songs.js';

export async function listForSong(songId) {
  const notes = await db.getAllByIndex('audios', 'songId', songId);
  return notes.sort((a, b) => a.createdAt - b.createdAt);
}

export const getNote = (id) => db.get('audios', id);
export const saveNote = (note) => db.put('audios', note);

export function deleteNote(note) {
  return db.transaction(['audios', 'ideas'], 'readwrite', (tx) => {
    tx.objectStore('audios').delete(note.id);
    if (note.ideaId) tx.objectStore('ideas').delete(note.ideaId);
  });
}

/** Guarda la nota en la bandeja de ideas (crea la idea de tipo "voz", o la vuelve a "sin usar"). */
export async function saveToInbox(note) {
  const existing = note.ideaId ? await db.get('ideas', note.ideaId) : null;
  const idea = existing
    ? { ...existing, usedIn: null }
    : { id: uid(), kind: 'voz', text: note.name, audioId: note.id, tags: [], createdAt: note.createdAt, usedIn: null };
  Object.assign(note, { songId: null, sectionId: null, lineId: null, main: false, ideaId: idea.id });
  return db.transaction(['audios', 'ideas'], 'readwrite', (tx) => {
    tx.objectStore('audios').put(note);
    tx.objectStore('ideas').put(idea);
  });
}

/**
 * Pega la nota a una canción. Si venía del banco de ideas, la idea queda marcada como usada.
 * usedIn: { songId, songTitle, sectionId, sectionName, at }
 */
export async function attachToSong(note, { songId, sectionId = null, lineId = null }, usedIn = null) {
  const idea = note.ideaId ? await db.get('ideas', note.ideaId) : null;
  Object.assign(note, { songId, sectionId, lineId, main: false });
  return db.transaction(['audios', 'ideas'], 'readwrite', (tx) => {
    tx.objectStore('audios').put(note);
    if (idea) tx.objectStore('ideas').put({ ...idea, usedIn: usedIn || { songId, sectionId, at: Date.now() } });
  });
}

export function formatDuration(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
