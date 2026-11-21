// Pantalla: lista de canciones con buscador y filtro por estado.

import { h, icon, normalize, relativeDate } from '../ui.js';
import { listSongs, createSong, STATUSES, searchText, firstLine } from '../songs.js';
import { quickIdea } from '../ideas-flow.js';
import { backupReminderDays, snoozeReminder } from '../backup.js';

export async function renderSongs(view) {
  const songs = await listSongs();
  const indexed = songs.map((song) => ({ song, text: normalize(searchText(song)) }));
  let query = '';
  let status = 'todas';

  const list = h('div', { class: 'song-list' });

  const newBtn = h('button', {
    class: 'btn primary', type: 'button',
    onclick: async () => {
      newBtn.disabled = true;
      const song = await createSong();
      location.hash = '#/cancion/' + song.id;
    },
  }, icon('plus'), 'Nueva');

  const search = h('label', { class: 'search' },
    icon('search'),
    h('input', {
      type: 'search', placeholder: 'Buscar título, letra o etiqueta', autocomplete: 'off',
      oninput: (e) => { query = normalize(e.target.value.trim()); draw(); },
    }));

  const chips = h('div', { class: 'chips scroll' },
    [['todas', 'Todas'], ...Object.entries(STATUSES)].map(([k, label]) =>
      h('button', {
        class: 'chip' + (k === status ? ' on' : ''), type: 'button', 'data-k': k,
        onclick: () => {
          status = k;
          chips.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c.dataset.k === k));
          draw();
        },
      }, label)));

  function card(song) {
    const tags = Object.values(song.tags || {}).flat().slice(0, 4);
    const preview = firstLine(song);
    return h('a', { class: 'song-card', href: '#/cancion/' + song.id },
      h('div', { class: 'song-card-top' },
        h('h2', null, song.title.trim() || 'Sin título'),
        h('span', { class: 'status st-' + song.status }, STATUSES[song.status])),
      preview && h('p', { class: 'song-preview' }, preview),
      h('div', { class: 'song-meta' },
        h('span', null, 'Editada ' + relativeDate(song.updatedAt)),
        song.key && h('span', null, song.key),
        song.bpm && h('span', null, song.bpm + ' BPM')),
      tags.length > 0 && h('div', { class: 'tag-row' }, tags.map((t) => h('span', { class: 'tag' }, t))));
  }

  function draw() {
    const words = query.split(/\s+/).filter(Boolean);
    const shown = indexed.filter(({ song, text }) =>
      (status === 'todas' || song.status === status) && words.every((w) => text.includes(w)));

    if (!songs.length) {
      list.replaceChildren(h('div', { class: 'empty' },
        h('p', { class: 'empty-title' }, 'Tu cuaderno está en blanco'),
        h('p', null, 'Toca «Nueva» para empezar tu primera canción.')));
    } else if (!shown.length) {
      list.replaceChildren(h('p', { class: 'hint' }, 'Ninguna canción coincide.'));
    } else {
      list.replaceChildren(...shown.map(({ song }) => card(song)));
    }
  }

  // Captura en 2 toques: abrir la app → "Idea".
  const ideaBtn = h('button', {
    class: 'btn', type: 'button', 'aria-label': 'Anotar una idea',
    onclick: () => quickIdea(),
  }, icon('ideas'), 'Idea');

  // Recordatorio de respaldo (más de 30 días).
  const days = await backupReminderDays();
  const reminder = days > 0 && h('div', { class: 'reminder' },
    h('p', null, h('strong', null, `Hace ${days} días que no respaldas.`), ' Si borras la app o cambias de iPhone sin respaldo, pierdes tus canciones.'),
    h('div', { class: 'reminder-actions' },
      h('button', { class: 'btn ghost', type: 'button', onclick: async () => { await snoozeReminder(7); reminder.remove(); } }, 'Más tarde'),
      h('a', { class: 'btn primary', href: '#/ajustes' }, 'Respaldar')));

  view.replaceChildren(...[
    h('header', { class: 'page-head' }, h('h1', null, 'Canciones'), h('div', { class: 'head-actions' }, ideaBtn, newBtn)),
    reminder,
    songs.length && search,
    songs.length && chips,
    list,
  ].filter(Boolean));
  draw();
}
