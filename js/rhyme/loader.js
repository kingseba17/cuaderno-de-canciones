// Carga el índice de rimas una sola vez y lo deja en memoria.

import { buildIndex } from './search.js';

let promise = null;

export function getIndex() {
  if (!promise) {
    promise = fetch(new URL('../../data/rhyme-index.json', import.meta.url))
      .then((res) => {
        if (!res.ok) throw new Error('No se pudo cargar el diccionario de rimas');
        return res.json();
      })
      .then(buildIndex)
      .catch((err) => { promise = null; throw err; });
  }
  return promise;
}

/** Lo carga en segundo plano para que la primera búsqueda sea instantánea. */
export function preloadIndex() {
  setTimeout(() => getIndex().catch(() => {}), 1200);
}
