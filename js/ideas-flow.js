// Captura rápida de ideas y "Usar en canción" (desde la pestaña Ideas).

import { h, openSheet, sheet, toast } from './ui.js';
import { KINDS, PLACEHOLDERS, createIdea, parseTags, appendTextToSection, markUsed } from './ideas.js';
import { listSongs, getSong, saveSong, createSong, STATUSES } from './songs.js';
import * as N from './audio/notes.js';
import { recordNow } from './audio/record-flow.js';

/** Hoja para anotar una idea: elegir tipo, escribir, guardar. Devuelve la idea o null. */
export function quickIdea({ kind = 'frase' } = {}) {
  return openSheet((close) => {
    let current = kind;
    const ta = h('textarea', {
      class: 'field idea-input', rows: 3, placeholder: PLACEHOLDERS[current],
      autocapitalize: 'sentences', 'data-autofocus': true, 'aria-label': 'Texto de la idea',
      onkeydown: (e) => { if (e.key === 'Enter' && current === 'palabra') { e.preventDefault(); save(); } },
    });
    const tags = h('input', {
      class: 'field', placeholder: 'Etiquetas (opcional): noche, mar', autocapitalize: 'none', autocomplete: 'off',
      enterkeyhint: 'done', 'aria-label': 'Etiquetas',
    });

    const seg = h('div', { class: 'segmented kinds' },
      ['frase', 'palabra', 'imagen'].map((k) => h('button', {
        type: 'button', class: k === current ? 'on' : '', 'data-k': k,
        onclick: () => {
          current = k;
          ta.placeholder = PLACEHOLDERS[k];
          ta.rows = k === 'palabra' ? 1 : 3;
          seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.k === k));
          ta.focus();
        },
      }, KINDS[k])),
      h('button', {
        type: 'button', 'aria-label': 'Grabar nota de voz',
        onclick: () => { recordNow(null); close(null); }, // la nota va a la bandeja
      }, 'Voz'));

    async function save() {
      const text = ta.value.trim();
      if (!text) { ta.focus(); return; }
      const idea = await createIdea({ kind: current, text, tags: parseTags(tags.value) });
      toast('Idea guardada');
      close(idea);
    }

    return [
      h('h3', { class: 'sheet-title' }, 'Nueva idea'),
      seg,
      ta,
      tags,
      h('div', { class: 'sheet-actions' },
        h('button', { class: 'btn ghost', type: 'button', onclick: () => close(null) }, 'Cancelar'),
        h('button', { class: 'btn primary', type: 'button', onclick: save }, 'Guardar idea')),
    ];
  }, { top: true });
}

export function uniqueSections(song) {
  const out = [];
  for (const it of song.structure) {
    const s = song.sections.find((x) => x.id === it.sectionId);
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

/** Elige canción y sección, pega la idea y la marca como usada. Devuelve { song, sec } o null. */
export async function useInSong(idea, note) {
  const songs = await listSongs();
  const choice = await sheet({
    title: '¿En qué canción?',
    items: [
      { label: '+ Canción nueva', value: '__new' },
      ...songs.map((s) => ({ label: s.title.trim() || 'Sin título', sub: STATUSES[s.status], value: s.id })),
    ],
  });
  if (!choice) return null;
  const song = choice === '__new' ? await createSong() : await getSong(choice);
  if (!song) return null;

  const sections = uniqueSections(song);
  const sid = await sheet({
    title: '¿En qué parte?',
    message: idea.kind === 'voz' ? 'La nota queda pegada a esa parte.' : 'Se agrega al final de esa parte.',
    items: [
      ...sections.map((s) => ({ label: s.name, sub: s.lines.find((l) => l.text.trim())?.text, value: s.id })),
      idea.kind === 'voz' && { label: 'Canción completa', value: '__song' },
    ].filter(Boolean),
  });
  if (!sid) return null;
  const sec = song.sections.find((s) => s.id === sid) || null;

  if (idea.kind === 'voz') {
    if (!note) { toast('El audio de esta idea ya no existe'); return null; }
    const usedIn = { songId: song.id, songTitle: song.title.trim() || 'Sin título', sectionId: sec?.id || null, sectionName: sec?.name || null, at: Date.now() };
    await N.attachToSong(note, { songId: song.id, sectionId: sec?.id || null }, usedIn);
    idea.usedIn = usedIn;
  } else {
    appendTextToSection(sec, idea.text);
    song.updatedAt = Date.now();
    await saveSong(song);
    await markUsed(idea, song, sec);
  }
  toast(`Agregada a ${sec ? sec.name : 'la canción'} de «${song.title.trim() || 'Sin título'}»`);
  return { song, sec };
}
