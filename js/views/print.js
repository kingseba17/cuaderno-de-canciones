// Vista para imprimir o guardar como PDF (Compartir → Imprimir → pellizcar para PDF en el iPhone).

import { h, icon } from '../ui.js';
import { getSong } from '../songs.js';
import { hasChords } from '../export.js';

export async function renderPrint(view, id) {
  const song = await getSong(id);
  if (!song) {
    view.replaceChildren(h('div', { class: 'empty' }, h('p', { class: 'empty-title' }, 'No encontré esa canción'), h('a', { class: 'btn', href: '#/canciones' }, 'Volver')));
    return null;
  }
  document.body.classList.add('print-mode');
  const withChords = hasChords(song);
  let showChords = withChords;
  const sheetEl = h('article', { class: 'print-sheet' });

  function draw() {
    const meta = [song.key, song.bpm && `${song.bpm} BPM`].filter(Boolean).join(' · ');
    const blocks = [];
    for (const item of song.structure) {
      const sec = song.sections.find((s) => s.id === item.sectionId);
      const lines = sec?.lines.filter((l) => l.text.trim() || (showChords && l.chords?.trim())) || [];
      if (!lines.length) continue;
      blocks.push(h('section', { class: 'print-sec' },
        h('h2', null, sec.name),
        lines.map((l) => h('p', { class: 'print-line' },
          showChords && l.chords?.trim() && h('span', { class: 'print-chords' }, l.chords.trim()),
          l.text))));
    }
    sheetEl.replaceChildren(
      h('h1', null, song.title.trim() || 'Sin título'),
      meta && h('p', { class: 'print-meta' }, meta),
      ...(blocks.length ? blocks : [h('p', { class: 'muted' }, 'Esta canción todavía no tiene letra.')]));
  }

  const chordsBtn = withChords && h('button', {
    class: 'chip small on', type: 'button',
    onclick: () => { showChords = !showChords; chordsBtn.classList.toggle('on', showChords); draw(); },
  }, 'Acordes');

  view.replaceChildren(
    h('div', { class: 'print-tools no-print' },
      h('a', { class: 'back', href: '#/cancion/' + song.id }, icon('back'), 'Volver'),
      chordsBtn,
      h('button', { class: 'btn primary', type: 'button', onclick: () => window.print() }, 'Imprimir o PDF')),
    sheetEl);
  draw();

  return () => document.body.classList.remove('print-mode');
}
