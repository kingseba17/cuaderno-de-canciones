// Panel de búsqueda de rimas. Se usa en la pestaña Rimas y dentro del editor.

import { h } from '../ui.js';
import { getIndex } from './loader.js';
import { search, vowelPattern } from './search.js';
import { TYPE_LABELS } from './phonetics.js';
import { personalAnalyzed, usedAnalyzed } from '../dictionary.js';

const FIRST_PAGE = 36;
const NEXT_PAGE = 120;

/**
 * createRhymePanel({ initial, onPick, onQuery })
 *   onPick(word): al tocar una palabra
 *   onQuery(text): cada vez que cambia la búsqueda
 * Devuelve { el, refresh, setQuery }
 */
export function createRhymePanel({ initial = '', onPick, onQuery } = {}) {
  const state = { query: initial, mode: 'ambas', syllables: 0, type: '', onlyUsed: false };
  let timer = null;
  let runId = 0;

  const input = h('input', {
    class: 'rhyme-input', type: 'search', value: initial,
    placeholder: 'Palabra, frase o -terminación',
    enterkeyhint: 'search', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', autocomplete: 'off',
    'aria-label': 'Buscar rimas',
    oninput: () => {
      state.query = input.value;
      onQuery?.(state.query);
      clearTimeout(timer);
      timer = setTimeout(run, 120);
    },
  });
  const form = h('form', {
    class: 'rhyme-search',
    onsubmit: (e) => { e.preventDefault(); input.blur(); run(); },
  }, input);

  const info = h('div', { class: 'rhyme-info' });
  const results = h('div', { class: 'rhyme-results' });

  const modes = { ambas: 'Ambas', consonante: 'Consonantes', asonante: 'Asonantes' };
  const modeSeg = h('div', { class: 'segmented' }, Object.entries(modes).map(([k, label]) =>
    h('button', {
      type: 'button', class: k === state.mode ? 'on' : '', 'data-k': k,
      onclick: () => {
        state.mode = k;
        modeSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.k === k));
        run();
      },
    }, label)));

  // Filtros: tocar uno lo activa, tocarlo otra vez lo quita.
  const filterDefs = [
    ...[1, 2, 3, 4].map((n) => ({ group: 'syllables', value: n, label: `${n} síl.` })),
    { group: 'syllables', value: 5, label: '5+ síl.' },
    { group: 'type', value: 'aguda', label: 'Aguda' },
    { group: 'type', value: 'grave', label: 'Grave' },
    { group: 'type', value: 'esdrujula', label: 'Esdrújula' },
    { group: 'onlyUsed', value: true, label: 'Solo las que he usado' },
  ];
  const filters = h('div', { class: 'chips scroll filters' }, filterDefs.map((f) =>
    h('button', {
      type: 'button', class: 'chip small',
      onclick: (e) => {
        const off = !f.value ? false : state[f.group] === f.value;
        state[f.group] = off ? (f.group === 'type' ? '' : f.group === 'onlyUsed' ? false : 0) : f.value;
        filters.querySelectorAll('.chip').forEach((c, i) => {
          const d = filterDefs[i];
          c.classList.toggle('on', state[d.group] === d.value);
        });
        e.currentTarget.blur();
        run();
      },
    }, f.label)));

  function wordButton(r, kind) {
    const cls = ['w', kind, r.common ? '' : 'rare', r.personal ? 'mine' : '', r.used ? 'used' : ''].filter(Boolean).join(' ');
    return h('button', {
      type: 'button', class: cls,
      title: r.personal ? 'De tu diccionario' : r.common ? '' : 'Poco común',
      onclick: () => onPick?.(r.word),
    }, r.word);
  }

  function block(title, res, kind, { compact = false } = {}) {
    const box = h('section', { class: 'rblock ' + kind });
    box.append(h('h3', { class: 'rblock-title' }, title, h('span', { class: 'count' }, res.total ? res.total.toLocaleString('es-CL') : '')));
    if (!res.total) {
      box.append(h('p', { class: 'muted small' }, 'Sin resultados con estos filtros.'));
      return box;
    }
    for (const g of res.groups) {
      const wrap = h('div', { class: 'wgrid' });
      let shown = 0;
      const more = h('button', { type: 'button', class: 'link more' });
      const page = (n) => {
        const slice = g.words.slice(shown, shown + n);
        wrap.append(...slice.map((r) => wordButton(r, kind)));
        shown += slice.length;
        const left = g.words.length - shown;
        more.textContent = `Ver ${Math.min(left, NEXT_PAGE)} más de ${left.toLocaleString('es-CL')}`;
        more.hidden = left <= 0;
      };
      more.onclick = () => page(NEXT_PAGE);
      page(compact ? 18 : FIRST_PAGE);
      box.append(h('h4', { class: 'rgroup-title' }, g.syllables >= 9 ? '9 o más sílabas' : `${g.syllables} sílaba${g.syllables > 1 ? 's' : ''}`), wrap, more);
    }
    return box;
  }

  function describe(infoObj) {
    return h('div', { class: 'word-info' },
      h('span', { class: 'sylls' }, infoObj.syllables.map((s, i) => h(i === infoObj.tonic ? 'strong' : 'span', null, s)).reduce((acc, el, i) => (i ? [...acc, '·', el] : [el]), [])),
      h('span', null, `${infoObj.count} sílaba${infoObj.count > 1 ? 's' : ''} · ${TYPE_LABELS[infoObj.type]}`),
      h('span', { class: 'keys' }, h('span', { class: 'key cons' }, '−' + infoObj.cons), h('span', { class: 'key aso' }, vowelPattern(infoObj))));
  }

  function wordResults(res, opts = {}) {
    const out = [];
    if (state.mode !== 'asonante') out.push(block('Consonantes', res.consonant, 'cons', opts));
    if (state.mode !== 'consonante') out.push(block('Asonantes', res.assonant, 'aso', opts));
    return out;
  }

  async function run() {
    const id = ++runId;
    const q = state.query.trim();
    if (!q) {
      info.replaceChildren();
      results.replaceChildren(h('div', { class: 'rhyme-help' },
        h('p', null, 'Escribe una palabra para ver sus rimas.'),
        h('ul', null,
          h('li', null, h('strong', null, 'amor'), ': rimas de una palabra'),
          h('li', null, h('strong', null, 'corazón partido'), ': rima de frase (las dos últimas palabras)'),
          h('li', null, h('strong', null, '-ción'), ': palabras que terminan así'))));
      return;
    }

    let index;
    try {
      if (!results.firstChild || results.dataset.loaded !== '1') results.replaceChildren(h('p', { class: 'muted' }, 'Cargando diccionario…'));
      index = await getIndex();
      results.dataset.loaded = '1';
    } catch (err) {
      results.replaceChildren(h('p', { class: 'warn' }, err.message));
      return;
    }
    const opts = {
      syllables: state.syllables,
      type: state.type,
      personal: await personalAnalyzed(),
      used: state.onlyUsed ? await usedAnalyzed() : null,
    };
    if (id !== runId) return; // ya hay una búsqueda más nueva

    const res = search(index, q, opts);
    if (!res) {
      info.replaceChildren();
      results.replaceChildren(h('p', { class: 'muted' }, 'Escribe palabras en español (solo letras).'));
      return;
    }

    if (res.kind === 'word') {
      info.replaceChildren(describe(res.info));
      results.replaceChildren(...wordResults(res));
    } else if (res.kind === 'ending') {
      info.replaceChildren(h('div', { class: 'word-info' }, h('span', null, `Palabras que terminan en −${res.ending}`)));
      results.replaceChildren(block(`Terminan en −${res.ending}`, res.results, 'cons'));
    } else {
      info.replaceChildren(h('div', { class: 'word-info' },
        h('span', null, 'Rima de frase'),
        h('span', { class: 'keys' }, h('span', { class: 'key aso' }, res.pattern))));
      results.replaceChildren(
        h('p', { class: 'muted small' }, 'Busca una palabra que rime con cada una y combínalas a tu manera.'),
        ...res.parts.flatMap((part, i) => [
          h('h3', { class: 'phrase-title' }, `Para «${res.words[i]}»`),
          describe(part.info),
          ...wordResults(part, { compact: true }),
        ]));
    }
  }

  run();

  return {
    el: h('div', { class: 'rhyme-panel' }, form, info, modeSeg, filters, results),
    refresh: run,
    setQuery(q) { input.value = q; state.query = q; run(); },
  };
}
