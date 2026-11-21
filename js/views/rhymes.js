// Pantalla: buscador de rimas + mi diccionario.

import { h, icon, toast, confirmSheet } from '../ui.js';
import { createRhymePanel } from '../rhyme/panel.js';
import { listPersonal, addPersonal, removePersonal } from '../dictionary.js';

let lastQuery = '';

async function copyWord(word) {
  try {
    await navigator.clipboard.writeText(word);
    toast(`«${word}» copiada`);
  } catch {
    toast(word);
  }
}

export async function renderRhymes(view) {
  const panel = createRhymePanel({ initial: lastQuery, onPick: copyWord, onQuery: (q) => { lastQuery = q; } });

  // ---- Mi diccionario ----
  const list = h('div', { class: 'tag-row dict-list' });
  const drawList = async () => {
    const words = await listPersonal();
    list.replaceChildren(...(words.length
      ? words.map(({ word }) => h('span', { class: 'dict-word' },
        h('button', { type: 'button', class: 'dict-name', onclick: () => { panel.setQuery(word); window.scrollTo({ top: 0, behavior: 'smooth' }); } }, word),
        h('button', {
          type: 'button', class: 'dict-del', 'aria-label': `Quitar ${word}`,
          onclick: async () => {
            if (!(await confirmSheet({ title: `¿Quitar «${word}» de tu diccionario?`, ok: 'Quitar', danger: true }))) return;
            await removePersonal(word);
            drawList(); panel.refresh();
          },
        }, '×')))
      : [h('p', { class: 'muted small' }, 'Todavía no agregas palabras.')]));
  };

  const addInput = h('input', {
    class: 'field', placeholder: 'cachai, bacán, pololo…', autocapitalize: 'none', autocorrect: 'off',
    spellcheck: 'false', enterkeyhint: 'done', 'aria-label': 'Palabra nueva',
  });
  const addForm = h('form', {
    class: 'dict-form',
    onsubmit: async (e) => {
      e.preventDefault();
      const words = addInput.value.split(/[,\s]+/).filter(Boolean);
      const added = [];
      for (const w of words) { const ok = await addPersonal(w); if (ok) added.push(ok); }
      addInput.value = '';
      if (added.length) toast(added.length === 1 ? `«${added[0]}» agregada` : `${added.length} palabras agregadas`);
      drawList(); panel.refresh();
    },
  }, addInput, h('button', { class: 'btn primary', type: 'submit' }, icon('plus'), 'Agregar'));

  view.replaceChildren(
    h('header', { class: 'page-head' }, h('h1', null, 'Rimas')),
    panel.el,
    h('section', { class: 'panel dict' },
      h('h2', { class: 'panel-title' }, 'Mi diccionario'),
      h('p', { class: 'muted small' }, 'Tus palabras entran a todas las búsquedas. Si el acento cae donde no dice la regla, escríbelo con tilde (ej.: «cachái»).'),
      addForm,
      list),
    h('p', { class: 'credits' }, 'Diccionario: FrequencyWords de Hermit Dave (CC-BY-SA 4.0) y an-array-of-spanish-words de Titus Wormer (MIT). Toca una palabra para copiarla.'),
  );
  drawList();
}
