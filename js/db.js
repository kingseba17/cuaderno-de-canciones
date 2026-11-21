// Acceso a IndexedDB: todo lo que escribes vive aquí, dentro del iPhone.
// Se crean desde ya todos los almacenes que usarán las próximas etapas,
// así no hay que migrar datos más adelante.

const DB_NAME = 'cuaderno-canciones';
const DB_VERSION = 1;
let dbPromise = null;

export function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('songs')) {
          db.createObjectStore('songs', { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt');
        }
        if (!db.objectStoreNames.contains('versions')) {
          db.createObjectStore('versions', { keyPath: 'id' }).createIndex('songId', 'songId');
        }
        if (!db.objectStoreNames.contains('audios')) {
          db.createObjectStore('audios', { keyPath: 'id' }).createIndex('songId', 'songId');
        }
        if (!db.objectStoreNames.contains('ideas')) {
          db.createObjectStore('ideas', { keyPath: 'id' }).createIndex('createdAt', 'createdAt');
        }
        if (!db.objectStoreNames.contains('dictionary')) {
          db.createObjectStore('dictionary', { keyPath: 'word' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('La base de datos está abierta en otra pestaña.'));
    });
  }
  return dbPromise;
}

function asPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Ejecuta fn dentro de una transacción y espera a que quede escrita en disco. */
export async function transaction(stores, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let result;
    Promise.resolve(fn(tx)).then((r) => { result = r; }, reject);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transacción cancelada'));
  });
}

export async function get(store, key) {
  const db = await openDB();
  return asPromise(db.transaction(store).objectStore(store).get(key));
}

export async function getAll(store) {
  const db = await openDB();
  return asPromise(db.transaction(store).objectStore(store).getAll());
}

export async function getAllByIndex(store, index, value) {
  const db = await openDB();
  return asPromise(db.transaction(store).objectStore(store).index(index).getAll(value));
}

export function put(store, value) {
  return transaction(store, 'readwrite', (tx) => { tx.objectStore(store).put(value); });
}

export function del(store, key) {
  return transaction(store, 'readwrite', (tx) => { tx.objectStore(store).delete(key); });
}

export async function getSetting(key, fallback = null) {
  const row = await get('settings', key);
  return row ? row.value : fallback;
}

export function setSetting(key, value) {
  return put('settings', { key, value });
}
