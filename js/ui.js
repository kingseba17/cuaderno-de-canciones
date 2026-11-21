// Pequeñas herramientas de interfaz: crear elementos, íconos, hojas de opciones y avisos.

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'value' || k === 'checked') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

const svg = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  more: svg('<circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/>'),
  grip: svg('<circle cx="9" cy="6" r="1.3" fill="currentColor"/><circle cx="15" cy="6" r="1.3" fill="currentColor"/><circle cx="9" cy="12" r="1.3" fill="currentColor"/><circle cx="15" cy="12" r="1.3" fill="currentColor"/><circle cx="9" cy="18" r="1.3" fill="currentColor"/><circle cx="15" cy="18" r="1.3" fill="currentColor"/>'),
  repeat: svg('<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>'),
  songs: svg('<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>'),
  ideas: svg('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3z"/>'),
  mic: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
  rhyme: svg('<path d="M3 9c2-2.5 4-2.5 6 0s4 2.5 6 0 4-2.5 6 0"/><path d="M3 16c2-2.5 4-2.5 6 0s4 2.5 6 0 4-2.5 6 0"/>'),
  settings: svg('<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
  play: svg('<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>'),
  pause: svg('<rect x="7" y="5" width="3.5" height="14" rx="1" fill="currentColor"/><rect x="13.5" y="5" width="3.5" height="14" rx="1" fill="currentColor"/>'),
  next: svg('<path d="M6 5.5v13l9-6.5z" fill="currentColor"/><path d="M18 5v14"/>'),
  stop: svg('<rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor"/>'),
  versions: svg('<path d="M12 7v5l3 2"/><path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3 4v4h4"/>'),
};

export function icon(name) {
  return h('span', { class: 'ico', html: ICONS[name] || '' });
}

/** Rellena los <span data-icon="..."> que vienen en el HTML. */
export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = ICONS[el.dataset.icon] || ''; });
}

// ---- Hojas (los menús que suben desde abajo) ----

export function openSheet(build, { top = false, tall = false, modal = false } = {}) {
  return new Promise((resolve) => {
    const root = document.getElementById('overlay-root');
    let closed = false;
    const close = (value) => {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey);
      wrap.classList.remove('open');
      setTimeout(() => wrap.remove(), 220);
      resolve(value);
    };
    // modal: no se cierra tocando afuera (para no perder una grabación por accidente).
    const onKey = (e) => { if (e.key === 'Escape' && !modal) close(null); };
    const panel = h('div', { class: 'sheet' + (top ? ' top' : '') + (tall ? ' tall' : ''), role: 'dialog', 'aria-modal': 'true' });
    const wrap = h('div', { class: 'overlay' }, h('div', { class: 'backdrop', onclick: () => { if (!modal) close(null); } }), panel);
    panel.append(...build(close).filter(Boolean));
    document.addEventListener('keydown', onKey);
    root.append(wrap);
    wrap.getBoundingClientRect(); // fuerza el layout para que la animación se vea
    wrap.classList.add('open');
    const focusTarget = panel.querySelector('[data-autofocus]');
    if (focusTarget) { focusTarget.focus(); focusTarget.select?.(); }
  });
}

/** Menú de opciones. items: [{ label, sub, value, danger }]. Devuelve el value elegido o null. */
export function sheet({ title, message, items = [], cancel = 'Cancelar' }) {
  return openSheet((close) => [
    title && h('h3', { class: 'sheet-title' }, title),
    message && h('p', { class: 'sheet-msg' }, message),
    items.length && h('div', { class: 'sheet-items' }, items.map((it) =>
      h('button', { class: 'sheet-item' + (it.danger ? ' danger' : ''), type: 'button', onclick: () => close(it.value ?? it.label) },
        h('span', null, it.label), it.sub && h('small', null, it.sub)))),
    cancel && h('button', { class: 'sheet-item cancel', type: 'button', onclick: () => close(null) }, cancel),
  ]);
}

/** Pide un texto. Devuelve el texto o null si se cancela. */
export function promptSheet({ title, value = '', placeholder = '', ok = 'Guardar' }) {
  return openSheet((close) => {
    const input = h('input', { class: 'field', value, placeholder, 'data-autofocus': true, enterkeyhint: 'done', autocomplete: 'off' });
    const form = h('form', { class: 'sheet-form', onsubmit: (e) => { e.preventDefault(); close(input.value.trim()); } },
      input,
      h('div', { class: 'sheet-actions' },
        h('button', { class: 'btn ghost', type: 'button', onclick: () => close(null) }, 'Cancelar'),
        h('button', { class: 'btn primary', type: 'submit' }, ok)));
    return [title && h('h3', { class: 'sheet-title' }, title), form];
  }, { top: true });
}

export async function confirmSheet({ title, message, ok = 'Aceptar', danger = false }) {
  const v = await sheet({ title, message, items: [{ label: ok, value: 'ok', danger }] });
  return v === 'ok';
}

export function toast(message, ms = 2200) {
  const t = h('div', { class: 'toast', role: 'status' }, message);
  document.body.append(t);
  t.getBoundingClientRect();
  t.classList.add('show');
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, ms);
}

// ---- Texto y fechas ----

export function normalize(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function relativeDate(ts) {
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const hours = Math.round(min / 60);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (ts >= today.getTime()) return `hace ${hours} h`;
  if (ts >= today.getTime() - 86400000) return 'ayer';
  const days = Math.floor((today.getTime() - ts) / 86400000) + 1;
  if (days < 7) return `hace ${days} días`;
  return new Date(ts).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(ts) {
  return new Date(ts).toLocaleString('es-CL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function autosize(ta) {
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 'px';
}
