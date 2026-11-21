// Pantalla: ajustes (respaldo, tema, almacenamiento, instalar, acerca de).

import { h, sheet, toast, relativeDate } from '../ui.js';
import { getSetting } from '../db.js';
import { createBackup, markBackupDone, parseBackup, planImport, applyImport, formatBytes } from '../backup.js';
import { saveFile } from '../export.js';
import { APP_VERSION } from '../version.js';

function readTheme() {
  try { return localStorage.getItem('theme') || 'auto'; } catch { return 'auto'; }
}

function applyTheme(theme) {
  try { localStorage.setItem('theme', theme); } catch { /* sin almacenamiento: solo dura esta sesión */ }
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function describeCounts(c) {
  return [
    plural(c.songs, 'canción', 'canciones'),
    plural(c.versions, 'versión', 'versiones'),
    plural(c.audios, 'nota de voz', 'notas de voz'),
    plural(c.ideas, 'idea', 'ideas'),
    plural(c.dictionary, 'palabra propia', 'palabras propias'),
  ].join(', ');
}

export async function renderSettings(view) {
  // ---- Respaldo ----
  const lastBackup = await getSetting('lastBackup', null);
  const lastEl = h('p', null, 'Último respaldo: ', h('strong', null, lastBackup ? relativeDate(lastBackup) : 'nunca'));
  const backupArea = h('div', { class: 'backup-area' });

  function showBackupButton() {
    backupArea.replaceChildren(h('button', { class: 'btn primary wide-btn', type: 'button', onclick: prepare }, 'Hacer respaldo completo'));
  }

  // Dos pasos: preparar (puede tardar) y guardar (el iPhone pide un toque fresco para abrir Compartir).
  async function prepare() {
    backupArea.replaceChildren(h('p', { class: 'muted' }, 'Preparando respaldo…'));
    let result;
    try {
      result = await createBackup();
    } catch (err) {
      console.error(err);
      toast('No se pudo preparar el respaldo.');
      showBackupButton();
      return;
    }
    backupArea.replaceChildren(
      h('p', { class: 'small' }, `Listo: ${describeCounts(result.counts)}.`),
      h('button', {
        class: 'btn primary wide-btn', type: 'button',
        onclick: async () => {
          const r = await saveFile(result.blob, result.filename);
          if (r === 'cancelled') return;
          await markBackupDone();
          lastEl.replaceChildren('Último respaldo: ', h('strong', null, 'hace un momento'));
          toast('Respaldo guardado');
          showBackupButton();
        },
      }, `Guardar archivo (${formatBytes(result.blob.size)})`),
      h('p', { class: 'muted small' }, 'En el iPhone elige «Guardar en Archivos» (iCloud Drive) o mándatelo por correo.'));
  }
  showBackupButton();

  const fileInput = h('input', {
    type: 'file', accept: 'application/json,.json', hidden: true,
    onchange: async () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (!file) return;
      let backup;
      try {
        backup = parseBackup(await file.text());
      } catch (err) {
        toast(err.message, 4000);
        return;
      }
      const plan = await planImport(backup);
      const date = new Date(backup.exportedAt).toLocaleString('es-CL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      const details = [
        `Respaldo del ${date}: ${describeCounts(plan.counts)}.`,
        plan.currentSongs
          ? `Al combinar: ${plural(plan.newSongs, 'canción nueva', 'canciones nuevas')}, ${plan.updatedSongs} se actualizan, ${plan.keptSongs} se quedan como están (la de aquí es igual o más reciente).`
          : '',
      ].filter(Boolean).join(' ');
      const choice = await sheet({
        title: 'Importar respaldo',
        message: details,
        items: [
          { label: 'Combinar con lo que tengo', sub: 'No se borra nada de este iPhone', value: 'merge' },
          plan.currentSongs > 0 && { label: 'Reemplazar todo', sub: 'Borra lo de aquí y deja solo el respaldo', value: 'replace', danger: true },
        ].filter(Boolean),
      });
      if (!choice) return;
      if (choice === 'replace') {
        const sure = await sheet({
          title: '¿Reemplazar todo?',
          message: `Se borran las ${plan.currentSongs} canciones de este iPhone con sus notas y versiones. Si no tienes respaldo de ellas, se pierden.`,
          items: [{ label: 'Sí, reemplazar todo', value: 'yes', danger: true }],
        });
        if (sure !== 'yes') return;
      }
      try {
        await applyImport(backup, choice);
      } catch (err) {
        console.error(err);
        toast('No se pudo importar. Revisa el espacio del iPhone.', 4000);
        return;
      }
      toast('Respaldo importado');
      location.hash = '#/canciones';
    },
  });

  // ---- Apariencia ----
  let theme = readTheme();
  const themes = { auto: 'Automático', light: 'Claro', dark: 'Oscuro' };
  const seg = h('div', { class: 'segmented' }, Object.entries(themes).map(([k, label]) =>
    h('button', {
      type: 'button', class: k === theme ? 'on' : '', 'data-k': k,
      onclick: () => {
        theme = k;
        applyTheme(k);
        seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.k === k));
      },
    }, label)));

  // ---- Almacenamiento ----
  let persisted = null;
  let usage = null;
  try {
    persisted = await navigator.storage?.persisted?.();
    usage = (await navigator.storage?.estimate?.())?.usage ?? null;
  } catch { /* no disponible */ }

  const standalone = navigator.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches;

  view.replaceChildren(
    h('header', { class: 'page-head' }, h('h1', null, 'Ajustes')),

    h('section', { class: 'panel' },
      h('h2', { class: 'panel-title' }, 'Respaldo'),
      lastEl,
      backupArea,
      h('button', { class: 'btn wide-btn', type: 'button', onclick: () => fileInput.click() }, 'Importar un respaldo'),
      fileInput,
      h('p', { class: 'warn' },
        h('strong', null, 'Importante: '),
        'si borras la app de la pantalla de inicio, se borran tus canciones y audios. ',
        'Haz un respaldo de vez en cuando; te lo recordaré si pasan más de 30 días.')),

    !standalone && h('section', { class: 'panel' },
      h('h2', { class: 'panel-title' }, 'Instalar en el iPhone'),
      h('ol', { class: 'steps' },
        h('li', null, 'Abre esta página en Safari.'),
        h('li', null, 'Toca el botón Compartir (el cuadrado con la flecha).'),
        h('li', null, 'Elige «Agregar a pantalla de inicio».'),
        h('li', null, 'Abre la app desde el ícono. Funciona sin internet.')),
      h('p', { class: 'muted small' }, 'Ojo: lo que escribas en Safari y en la app instalada se guarda por separado. Si ya escribiste en Safari, haz un respaldo aquí e impórtalo en la app.')),

    h('section', { class: 'panel' },
      h('h2', { class: 'panel-title' }, 'Apariencia'),
      seg),

    h('section', { class: 'panel' },
      h('h2', { class: 'panel-title' }, 'Tus datos'),
      h('p', null, 'Tus canciones, audios e ideas se guardan solo en este aparato. Nunca se suben a internet.'),
      h('ul', { class: 'facts' },
        h('li', null, 'Almacenamiento protegido: ',
          h('strong', null, persisted ? 'activado' : persisted === false ? 'no confirmado todavía' : 'no disponible')),
        usage != null && h('li', null, 'Espacio usado: ', h('strong', null, formatBytes(usage))))),

    h('section', { class: 'panel' },
      h('h2', { class: 'panel-title' }, 'Acerca de'),
      h('p', null, `Cuaderno de Canciones · versión ${APP_VERSION}`),
      h('p', { class: 'muted' }, 'La app te acompaña mientras escribes, pero nunca escribe versos por ti.'),
      h('p', { class: 'muted small' }, 'Diccionario de rimas: FrequencyWords de Hermit Dave (CC-BY-SA 4.0) y an-array-of-spanish-words de Titus Wormer (MIT).')),
  );
}
