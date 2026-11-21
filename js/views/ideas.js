// Pantalla: banco de ideas.

import { h, icon, sheet, promptSheet, confirmSheet, toast, normalize, relativeDate } from '../ui.js';
import { KINDS, listIdeas, saveIdea, deleteIdea, parseTags, markUnused, randomIdeas, ideaLabel } from '../ideas.js';
import { quickIdea, useInSong } from '../ideas-flow.js';
import * as N from '../audio/notes.js';
import { createPlayer } from '../audio/player.js';
import { recordNow } from '../audio/record-flow.js';

const STATUS_FILTERS = { 'sin-usar': 'Sin usar', usadas: 'Usadas', todas: 'Todas' };
const state = { status: 'sin-usar', kind: '', tag: '', q: '' }; // se recuerda mientras la app esté abierta

export async function renderIdeas(view) {
  let ideas = [];
  let notes = new Map();
  let players = [];
  let randomShown = [];

  const listEl = h('div', { class: 'idea-list' });
  const randomEl = h('div', { class: 'idea-list random-list' });
  const tagsEl = h('div', { class: 'chips scroll' });
  const countEl = h('span', { class: 'muted small' });

  async function load() {
    ideas = await listIdeas();
    notes = new Map();
    for (const idea of ideas.filter((i) => i.kind === 'voz')) {
      const note = await N.getNote(idea.audioId);
      if (note) notes.set(idea.audioId, note);
    }
    // Ideas de voz cuyo audio se borró (por ejemplo, con su canción): ya no sirven.
    const orphans = ideas.filter((i) => i.kind === 'voz' && !notes.has(i.audioId));
    for (const o of orphans) await deleteIdea(o);
    ideas = ideas.filter((i) => !orphans.includes(i));
  }

  function makePlayer(note, onMenu) {
    const p = createPlayer(note, { onMenu });
    players.push(p);
    return p.el;
  }

  function ideaCard(idea) {
    const note = notes.get(idea.audioId);
    const menuBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Opciones de la idea', onclick: () => menu(idea) }, icon('more'));
    return h('article', { class: 'idea-card kind-' + idea.kind },
      h('div', { class: 'idea-top' },
        h('span', { class: 'idea-kind' }, KINDS[idea.kind]),
        h('span', { class: 'idea-date' }, relativeDate(idea.createdAt)),
        h('span', { class: 'spacer' }),
        idea.kind !== 'voz' && menuBtn),
      idea.kind === 'voz'
        ? makePlayer(note, () => menu(idea))
        : h('p', { class: 'idea-text' }, idea.text),
      idea.tags?.length > 0 && h('div', { class: 'tag-row' }, idea.tags.map((t) => h('span', { class: 'tag' }, t))),
      h('div', { class: 'idea-foot' },
        idea.usedIn
          ? h('a', { class: 'used', href: '#/cancion/' + idea.usedIn.songId },
            `Usada en «${idea.usedIn.songTitle || 'una canción'}»${idea.usedIn.sectionName ? ' · ' + idea.usedIn.sectionName : ''}`)
          : h('span', { class: 'unused' }, 'Sin usar'),
        !idea.usedIn && h('button', { class: 'chip small accent', type: 'button', onclick: () => use(idea) }, 'Usar en canción')));
  }

  async function use(idea) {
    const done = await useInSong(idea, notes.get(idea.audioId));
    if (done) refresh();
  }

  async function menu(idea) {
    const note = notes.get(idea.audioId);
    const choice = await sheet({
      title: ideaLabel(idea, note).slice(0, 60),
      items: [
        { label: idea.usedIn ? 'Usar en otra canción' : 'Usar en canción', value: 'use' },
        idea.kind === 'voz' ? { label: 'Cambiar nombre', value: 'rename' } : { label: 'Editar texto', value: 'edit' },
        { label: 'Etiquetas', value: 'tags' },
        idea.usedIn && idea.kind !== 'voz' && { label: 'Marcar como sin usar', value: 'unused' },
        { label: 'Eliminar idea', value: 'delete', danger: true },
      ].filter(Boolean),
    });
    if (choice === 'use') return use(idea);
    if (choice === 'edit') {
      const text = await promptSheet({ title: 'Editar idea', value: idea.text });
      if (!text) return;
      idea.text = text;
      await saveIdea(idea);
    }
    if (choice === 'rename') {
      const name = await promptSheet({ title: 'Nombre de la nota', value: note.name });
      if (!name) return;
      note.name = name;
      idea.text = name;
      await N.saveNote(note);
      await saveIdea(idea);
    }
    if (choice === 'tags') {
      const text = await promptSheet({ title: 'Etiquetas', value: (idea.tags || []).join(', '), placeholder: 'noche, mar, rabia' });
      if (text == null) return;
      idea.tags = parseTags(text);
      await saveIdea(idea);
    }
    if (choice === 'unused') await markUnused(idea);
    if (choice === 'delete') {
      const msg = idea.kind === 'voz'
        ? (idea.usedIn ? 'También se borra el audio de la canción donde la usaste.' : 'El audio se borra para siempre.')
        : 'No se puede deshacer.';
      if (!(await confirmSheet({ title: '¿Eliminar esta idea?', message: msg, ok: 'Eliminar', danger: true }))) return;
      await deleteIdea(idea);
    }
    if (choice) refresh();
  }

  function drawRandom(next = false) {
    const panel = randomEl.closest('.random');
    if (panel) panel.hidden = ideas.length < 2;
    if (!ideas.length) { randomEl.replaceChildren(); return; }
    const want = Math.min(3, ideas.length);
    let shown = randomShown.map((id) => ideas.find((i) => i.id === id)).filter(Boolean);
    if (next || shown.length < want) {
      randomShown = randomIdeas(ideas, 3, next ? randomShown : []).map((i) => i.id);
      shown = randomShown.map((id) => ideas.find((i) => i.id === id)).filter(Boolean);
    }
    randomEl.replaceChildren(...shown.map(ideaCard));
  }

  function drawTags() {
    const all = [...new Set(ideas.flatMap((i) => i.tags || []))].sort((a, b) => a.localeCompare(b, 'es'));
    if (state.tag && !all.includes(state.tag)) state.tag = '';
    tagsEl.hidden = !all.length;
    tagsEl.replaceChildren(...all.map((t) => h('button', {
      type: 'button', class: 'chip small' + (state.tag === t ? ' on' : ''),
      onclick: () => { state.tag = state.tag === t ? '' : t; drawTags(); drawList(); },
    }, '#' + t)));
  }

  function drawList() {
    const words = normalize(state.q).split(/\s+/).filter(Boolean);
    const shown = ideas.filter((i) => {
      if (state.status === 'sin-usar' && i.usedIn) return false;
      if (state.status === 'usadas' && !i.usedIn) return false;
      if (state.kind && i.kind !== state.kind) return false;
      if (state.tag && !(i.tags || []).includes(state.tag)) return false;
      const text = normalize([ideaLabel(i, notes.get(i.audioId)), ...(i.tags || [])].join(' '));
      return words.every((w) => text.includes(w));
    });
    countEl.textContent = `${ideas.filter((i) => !i.usedIn).length} sin usar · ${ideas.length} en total`;
    listEl.replaceChildren(...(shown.length
      ? shown.map(ideaCard)
      : [h('p', { class: 'hint' }, ideas.length ? 'Ninguna idea coincide.' : 'Tu banco está vacío. Anota la primera idea arriba.')]));
  }

  async function refresh() {
    players.forEach((p) => p.destroy());
    players = [];
    await load();
    drawTags();
    drawRandom();
    drawList();
  }

  async function capture(kind) {
    if (kind === 'voz') {
      const note = await recordNow(null);
      if (note) refresh();
      return;
    }
    const idea = await quickIdea({ kind });
    if (idea) refresh();
  }

  const segBtn = (group, defs) => {
    const el = h('div', { class: 'chips scroll' }, Object.entries(defs).map(([k, label]) =>
      h('button', {
        type: 'button', class: 'chip small' + (state[group] === k ? ' on' : ''), 'data-k': k,
        onclick: () => {
          state[group] = group === 'kind' && state.kind === k ? '' : k;
          el.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c.dataset.k === state[group]));
          drawList();
        },
      }, label)));
    return el;
  };

  view.replaceChildren(
    h('header', { class: 'page-head' }, h('h1', null, 'Ideas'), countEl),
    h('div', { class: 'capture' },
      h('button', { type: 'button', class: 'cap-btn', onclick: () => capture('frase') }, h('strong', null, 'Frase'), h('span', null, 'una línea suelta')),
      h('button', { type: 'button', class: 'cap-btn', onclick: () => capture('palabra') }, h('strong', null, 'Palabra'), h('span', null, 'que te gusta')),
      h('button', { type: 'button', class: 'cap-btn', onclick: () => capture('imagen') }, h('strong', null, 'Imagen'), h('span', null, 'algo que viste')),
      h('button', { type: 'button', class: 'cap-btn voice', onclick: () => capture('voz') }, h('strong', null, icon('mic'), 'Voz'), h('span', null, 'graba ya'))),
    h('section', { class: 'panel random' },
      h('div', { class: 'sa-head' },
        h('h2', null, 'Ideas al azar'),
        h('button', { class: 'link', type: 'button', onclick: () => drawRandom(true) }, 'Otras 3')),
      h('p', { class: 'muted small' }, 'Tres ideas viejas para destrabarte.'),
      randomEl),
    h('label', { class: 'search' }, icon('search'),
      h('input', {
        type: 'search', placeholder: 'Buscar en tus ideas', value: state.q, autocomplete: 'off',
        oninput: (e) => { state.q = e.target.value; drawList(); },
      })),
    segBtn('status', STATUS_FILTERS),
    segBtn('kind', KINDS),
    tagsEl,
    listEl);

  await refresh();
  return () => players.forEach((p) => p.destroy());
}
