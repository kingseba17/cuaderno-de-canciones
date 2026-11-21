// Punto de entrada: navegación entre pantallas y barra inferior.

import { hydrateIcons } from './ui.js';
import { recordNow } from './audio/record-flow.js';
import { renderSongs } from './views/songs.js';
import { renderEditor } from './views/editor.js';
import { renderIdeas } from './views/ideas.js';
import { renderRhymes } from './views/rhymes.js';
import { renderSettings } from './views/settings.js';
import { renderPrint } from './views/print.js';
import { preloadIndex } from './rhyme/loader.js';
import { quickIdea } from './ideas-flow.js';
import { h } from './ui.js';

const view = document.getElementById('view');
let cleanup = null;      // función que la pantalla actual entrega para guardar antes de salir
let queue = Promise.resolve();

async function route() {
  const hash = location.hash || '#/canciones';

  if (cleanup) {
    const fn = cleanup;
    cleanup = null;
    try { await fn(); } catch (err) { console.error(err); }
  }

  let tab = 'canciones';
  let m;
  try {
    if ((m = hash.match(/^#\/cancion\/([\w-]+)/))) {
      cleanup = await renderEditor(view, m[1]);
    } else if ((m = hash.match(/^#\/imprimir\/([\w-]+)/))) {
      tab = '';
      cleanup = await renderPrint(view, m[1]);
    } else if (hash.startsWith('#/ideas')) {
      tab = 'ideas';
      cleanup = await renderIdeas(view);
      // Acceso directo "Nueva idea" (Android y computador; el iPhone no tiene accesos directos).
      if (hash === '#/ideas/nueva') {
        history.replaceState(null, '', '#/ideas');
        quickIdea().then((idea) => { if (idea) go(); });
      }
    } else if (hash.startsWith('#/rimas')) {
      tab = 'rimas';
      cleanup = await renderRhymes(view);
    } else if (hash.startsWith('#/ajustes')) {
      tab = 'ajustes';
      cleanup = await renderSettings(view);
    } else {
      cleanup = await renderSongs(view);
    }
  } catch (err) {
    console.error(err);
    view.textContent = 'Algo falló al abrir esta pantalla: ' + err.message;
  }

  window.scrollTo(0, 0);
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === tab));
}

function go() { queue = queue.then(route); }

window.addEventListener('hashchange', go);

// Botón Grabar: un toque y graba. Dentro de una canción ofrece pegarla ahí; si no, va a la bandeja.
document.getElementById('rec-btn').addEventListener('click', async () => {
  const note = await recordNow();
  if (note && !note.songId && location.hash.startsWith('#/ideas')) go(); // refresca la bandeja
});

// Mientras escribes, se esconde la barra inferior para dejar espacio al teclado.
let typingTimer;
document.addEventListener('focusin', (e) => {
  if (e.target.matches('textarea, input:not([type=button]):not([type=checkbox])')) {
    clearTimeout(typingTimer);
    document.body.classList.add('typing');
  }
});
document.addEventListener('focusout', () => {
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    if (!document.activeElement?.matches('textarea, input')) document.body.classList.remove('typing');
  }, 120);
});

// Pide al iPhone que no borre los datos por falta de espacio.
async function askPersistentStorage() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch (err) { console.warn('persist()', err); }
}

// ---- Modo sin internet (service worker) y aviso de versión nueva ----
function showUpdateBanner(worker) {
  if (document.querySelector('.update-banner')) return;
  const banner = h('div', { class: 'update-banner', role: 'status' },
    h('span', null, 'Hay una versión nueva de la app.'),
    h('button', {
      class: 'btn primary', type: 'button',
      onclick: async () => {
        // Guardar lo que estés escribiendo antes de recargar.
        if (cleanup) { const fn = cleanup; cleanup = null; try { await fn(); } catch (err) { console.error(err); } }
        // Usar la versión más reciente que esté esperando (por si quedó una a medias sin internet).
        const reg = await navigator.serviceWorker.getRegistration();
        await reg?.update().catch(() => {});
        (reg?.waiting || worker).postMessage('skipWaiting');
        setTimeout(() => location.reload(), 4000); // por si el aviso de cambio no llega
      },
    }, 'Actualizar'));
  document.body.append(banner);
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    if (reg.waiting && navigator.serviceWorker.controller) showUpdateBanner(reg.waiting);
    // En el iPhone la app vuelve del fondo sin recargarse: revisar si hay versión nueva al volver.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner(worker);
      });
    });
  }).catch((err) => console.warn('Service worker:', err));

  // Solo recargar cuando se reemplaza una versión anterior (no la primera vez que se instala).
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !hadController) return;
    reloading = true;
    location.reload();
  });
}

hydrateIcons();
askPersistentStorage();
preloadIndex();
registerServiceWorker();
go();
