// Modelo de datos de canciones.
//
// Una canción tiene:
//   sections:  los bloques de texto únicos (cada coro se escribe una sola vez)
//   structure: el orden en que suenan, como referencias [{ id, sectionId }]
// Así, [Verso 1, Coro, Verso 2, Coro] apunta dos veces al mismo coro.

import * as db from './db.js';

export const SECTION_TYPES = ['Intro', 'Verso', 'Pre-coro', 'Coro', 'Puente', 'Outro'];

export const STATUSES = {
  idea: 'Idea',
  proceso: 'En proceso',
  terminada: 'Terminada',
};

export const TAG_GROUPS = {
  tema: 'Tema',
  animo: 'Ánimo',
  ritmo: 'Ritmo',
};

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export const clone = (value) => JSON.parse(JSON.stringify(value));

export function newLine(text = '', chords = '') {
  return { id: uid(), text, chords };
}

export function newSection(type, name) {
  return { id: uid(), type, name: name || type, lines: [newLine()] };
}

export function newSong() {
  const now = Date.now();
  const verso = newSection('Verso', 'Verso 1');
  const coro = newSection('Coro', 'Coro');
  return {
    id: uid(),
    title: '',
    status: 'idea',
    tags: { tema: [], animo: [], ritmo: [] },
    key: '',
    bpm: null,
    about: '',
    showChords: false,
    sections: [verso, coro],
    structure: [
      { id: uid(), sectionId: verso.id },
      { id: uid(), sectionId: coro.id },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

/** Nombre sugerido para una sección nueva: "Verso 2", "Puente 2"... */
export function nextSectionName(song, type) {
  const same = song.sections.filter((s) => s.type === type).length;
  if (type === 'Verso') return `Verso ${same + 1}`;
  return same ? `${type} ${same + 1}` : type;
}

export function isEmpty(song) {
  return !song.title.trim()
    && !song.about.trim()
    && song.sections.every((s) => s.lines.every((l) => !l.text.trim()));
}

export function searchText(song) {
  const tags = Object.values(song.tags || {}).flat();
  const lines = song.sections.flatMap((s) => s.lines.map((l) => l.text));
  return [song.title, song.about, ...tags, ...lines].join(' ');
}

/** Primera línea con texto, para mostrar de adelanto en la lista. */
export function firstLine(song) {
  for (const item of song.structure) {
    const sec = song.sections.find((s) => s.id === item.sectionId);
    const line = sec?.lines.find((l) => l.text.trim());
    if (line) return line.text.trim();
  }
  return '';
}

// ---- Guardado ----

export async function listSongs() {
  const songs = await db.getAll('songs');
  return songs.sort((a, b) => b.updatedAt - a.updatedAt);
}

export const getSong = (id) => db.get('songs', id);

export const saveSong = (song) => db.put('songs', song);

export async function createSong() {
  const song = newSong();
  await saveSong(song);
  return song;
}

/** Borra la canción con todas sus versiones y notas de voz. */
export function deleteSong(id) {
  return db.transaction(['songs', 'versions', 'audios'], 'readwrite', (tx) => {
    tx.objectStore('songs').delete(id);
    for (const storeName of ['versions', 'audios']) {
      const store = tx.objectStore(storeName);
      const cursorReq = store.index('songId').openKeyCursor(IDBKeyRange.only(id));
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          store.delete(cursor.primaryKey);
          cursor.continue();
        }
      };
    }
  });
}

// ---- Versiones (v1, v2...) ----

const CONTENT_KEYS = ['title', 'status', 'tags', 'key', 'bpm', 'about', 'showChords', 'sections', 'structure'];

export async function listVersions(songId) {
  const versions = await db.getAllByIndex('versions', 'songId', songId);
  return versions.sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveVersion(song, label) {
  const snapshot = {};
  for (const k of CONTENT_KEYS) snapshot[k] = clone(song[k]);
  const version = { id: uid(), songId: song.id, label, createdAt: Date.now(), snapshot };
  await db.put('versions', version);
  return version;
}

/** Copia el contenido de una versión sobre la canción (no guarda; eso lo hace el editor). */
export function applyVersion(song, version) {
  for (const k of CONTENT_KEYS) {
    if (k in version.snapshot) song[k] = clone(version.snapshot[k]);
  }
}

export const deleteVersion = (id) => db.del('versions', id);
