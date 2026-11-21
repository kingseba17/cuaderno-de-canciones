// Respaldo completo en un archivo .json: canciones, versiones, notas de voz (dentro del
// archivo, como texto base64), ideas, tu diccionario y ajustes. Sirve para cambiar de
// celular o tener una copia por si se borra la app.

import * as db from './db.js';

export const BACKUP_APP = 'cuaderno-de-canciones';
export const BACKUP_FORMAT = 1;
const STORES = ['songs', 'versions', 'audios', 'ideas', 'dictionary', 'settings'];
const SKIP_SETTINGS = new Set(['lastBackup', 'backupSnooze']); // propios de cada aparato
export const REMIND_AFTER_DAYS = 30;

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(b64, type) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

export function countsOf(data) {
  return {
    songs: data.songs?.length || 0,
    versions: data.versions?.length || 0,
    audios: data.audios?.length || 0,
    ideas: data.ideas?.length || 0,
    dictionary: data.dictionary?.length || 0,
  };
}

/** Arma el respaldo. Devuelve { blob, filename, counts }. */
export async function createBackup() {
  const data = {};
  for (const store of STORES) data[store] = await db.getAll(store);
  data.settings = data.settings.filter((s) => !SKIP_SETTINGS.has(s.key));
  data.audios = await Promise.all(data.audios.map(async ({ blob, ...rest }) => ({
    ...rest,
    mime: rest.mime || blob?.type || 'audio/mp4',
    data: blob ? await blobToBase64(blob) : '',
  })));
  const counts = countsOf(data);
  const backup = { app: BACKUP_APP, format: BACKUP_FORMAT, exportedAt: Date.now(), counts, data };
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { blob, filename: `cuaderno-respaldo-${stamp}.json`, counts };
}

export const markBackupDone = () => db.setSetting('lastBackup', Date.now());

/** Lee y revisa un archivo de respaldo. Lanza un error con mensaje en español si no sirve. */
export function parseBackup(text) {
  let backup;
  try { backup = JSON.parse(text); } catch { throw new Error('El archivo no es un respaldo válido (no es JSON).'); }
  if (backup?.app !== BACKUP_APP || !backup.data) throw new Error('Este archivo no es un respaldo de Cuaderno de Canciones.');
  if (backup.format > BACKUP_FORMAT) throw new Error('Este respaldo es de una versión más nueva de la app. Actualiza la app primero.');
  for (const store of STORES) if (!Array.isArray(backup.data[store])) backup.data[store] = [];
  return backup;
}

/**
 * Compara el respaldo con lo que hay en este aparato.
 * Para canciones con el mismo id, gana la editada más recientemente.
 */
export async function planImport(backup) {
  const current = new Map((await db.getAll('songs')).map((s) => [s.id, s]));
  const plan = { newSongs: 0, updatedSongs: 0, keptSongs: 0 };
  for (const s of backup.data.songs) {
    const mine = current.get(s.id);
    if (!mine) plan.newSongs++;
    else if ((s.updatedAt || 0) > (mine.updatedAt || 0)) plan.updatedSongs++;
    else plan.keptSongs++;
  }
  plan.counts = countsOf(backup.data);
  plan.currentSongs = current.size;
  return plan;
}

/**
 * Importa. mode: 'merge' (combinar) o 'replace' (borrar todo lo de aquí y dejar solo el respaldo).
 */
export async function applyImport(backup, mode = 'merge') {
  const { data } = backup;
  // Convertir los audios antes de abrir la transacción (no se puede esperar dentro).
  const audios = data.audios.map(({ data: b64, ...rest }) => ({ ...rest, blob: base64ToBlob(b64 || '', rest.mime || 'audio/mp4') }));
  const currentSongs = mode === 'merge' ? new Map((await db.getAll('songs')).map((s) => [s.id, s])) : new Map();

  await db.transaction(STORES, 'readwrite', (tx) => {
    if (mode === 'replace') {
      for (const store of STORES) {
        if (store === 'settings') continue;
        tx.objectStore(store).clear();
      }
    }
    for (const s of data.songs) {
      const mine = currentSongs.get(s.id);
      if (mine && (mine.updatedAt || 0) >= (s.updatedAt || 0)) continue; // la tuya es igual o más nueva
      tx.objectStore('songs').put(s);
    }
    for (const v of data.versions) tx.objectStore('versions').put(v);
    for (const a of audios) tx.objectStore('audios').put(a);
    for (const i of data.ideas) tx.objectStore('ideas').put(i);
    for (const w of data.dictionary) tx.objectStore('dictionary').put(w);
    for (const st of data.settings) if (!SKIP_SETTINGS.has(st.key)) tx.objectStore('settings').put(st);
  });
}

/** ¿Toca recordar el respaldo? Devuelve los días sin respaldo, o 0 si no hace falta. */
export async function backupReminderDays() {
  const now = Date.now();
  const snooze = await db.getSetting('backupSnooze', 0);
  if (snooze > now) return 0;
  const songs = await db.getAll('songs');
  if (!songs.length) return 0;
  const last = await db.getSetting('lastBackup', null);
  const since = last ?? Math.min(...songs.map((s) => s.createdAt));
  const days = Math.floor((now - since) / 86400000);
  return days > REMIND_AFTER_DAYS ? days : 0;
}

export const snoozeReminder = (days = 7) => db.setSetting('backupSnooze', Date.now() + days * 86400000);

export function formatBytes(n) {
  if (n < 1024 * 1024) return Math.max(1, Math.round(n / 1024)) + ' KB';
  return (n / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB';
}
