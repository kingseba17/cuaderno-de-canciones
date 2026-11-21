// Pantalla: editor de una canción.
//
// Cada verso es su propia caja de texto. Enter crea un verso nuevo y borrar
// al inicio de un verso lo une con el anterior. Así cada línea tiene su
// identidad (para acordes ahora, y para sílabas y notas de voz más adelante).

import { h, icon, sheet, openSheet, promptSheet, confirmSheet, toast, autosize, formatDateTime } from '../ui.js';
import * as S from '../songs.js';
import { createRhymePanel } from '../rhyme/panel.js';
import { metricLine, stanzaRhymes } from '../metrics.js';
import { TYPE_LABELS } from '../rhyme/phonetics.js';
import * as N from '../audio/notes.js';
import { createPlayer, pauseAll, claimAudio } from '../audio/player.js';
import { recordNow, recordOverBeat, setRecordContext } from '../audio/record-flow.js';
import { Deck, probeDuration, guessMime, DEFAULT_BEAT_VOL } from '../audio/deck.js';
import { KINDS, listIdeas, appendTextToSection, markUsed, ideaLabel } from '../ideas.js';
import { uniqueSections } from '../ideas-flow.js';
import { relativeDate } from '../ui.js';
import { songToText, hasChords, fileSlug, saveFile } from '../export.js';

const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Interruptores de sílabas y rimas: se recuerdan en este iPhone.
function readPref(key) {
  try { return localStorage.getItem(key) !== 'off'; } catch { return true; }
}
function writePref(key, on) {
  try { localStorage.setItem(key, on ? 'on' : 'off'); } catch { /* solo dura esta sesión */ }
}

const LAST_WORD = /([a-záéíóúüñ]+)[^a-záéíóúüñ]*$/i;
const lastWord = (text) => (text || '').match(LAST_WORD)?.[1] || '';

const NOTES = ['Do', 'Do#', 'Re', 'Mib', 'Mi', 'Fa', 'Fa#', 'Sol', 'Lab', 'La', 'Sib', 'Si'];
const KEYS = [...NOTES.map((n) => n + ' mayor'), ...NOTES.map((n) => n + ' menor')];

export async function renderEditor(view, id) {
  const song = await S.getSong(id);
  if (!song) {
    view.replaceChildren(h('div', { class: 'empty' },
      h('p', { class: 'empty-title' }, 'No encontré esa canción'),
      h('a', { class: 'btn', href: '#/canciones' }, 'Volver a Canciones')));
    return null;
  }

  const allAudio = await N.listForSong(song.id);
  let voiceNotes = allAudio.filter((n) => n.kind !== 'beat');
  let beats = allAudio.filter((n) => n.kind === 'beat'); // instrumentales subidas a esta canción
  const beatOf = (note) => (note.beatId ? beats.find((b) => b.id === note.beatId) || null : null);
  let players = []; // reproductores en pantalla (se limpian al redibujar)

  // ---------- Guardado automático ----------
  let dirty = false;
  let saveTimer = null;
  let deleted = false;
  const saveState = h('span', { class: 'save-state' }, 'Guardado');

  function touch() {
    dirty = true;
    saveState.textContent = 'Guardando…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 500);
  }

  async function flush() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (!dirty || deleted) return;
    dirty = false;
    song.updatedAt = Date.now();
    try {
      await S.saveSong(song);
      saveState.textContent = 'Guardado';
    } catch (err) {
      console.error(err);
      dirty = true;
      saveState.textContent = 'No se pudo guardar';
      toast('No se pudo guardar. Revisa el espacio del iPhone.');
    }
  }

  // En el iPhone la app puede cerrarse en cualquier momento: guardar al salir.
  const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', flush);
  const onResize = () => view.querySelectorAll('textarea').forEach(autosize);
  window.addEventListener('resize', onResize);

  // ---------- Ayudantes ----------
  const sectionById = (sid) => song.sections.find((s) => s.id === sid);
  const firstItemOf = (sid) => song.structure.find((it) => it.sectionId === sid);
  const countOf = (sid) => song.structure.filter((it) => it.sectionId === sid).length;
  const hasText = (sec) => sec.lines.some((l) => l.text.trim());

  const structureEl = h('div', { class: 'structure' });

  // ---------- Cabecera y datos de la canción ----------
  function buildHeader() {
    const top = h('div', { class: 'editor-top' },
      h('a', { class: 'back', href: '#/canciones' }, icon('back'), 'Canciones'),
      saveState,
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Opciones de la canción', onclick: songMenu }, icon('more')));

    const title = h('input', {
      class: 'song-title', value: song.title, placeholder: 'Sin título',
      autocapitalize: 'sentences', enterkeyhint: 'done', 'aria-label': 'Título',
      oninput: (e) => { song.title = e.target.value; touch(); },
      onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); },
    });

    const status = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Estado' },
      Object.entries(S.STATUSES).map(([k, label]) => h('button', {
        type: 'button', class: k === song.status ? 'on' : '', 'data-k': k,
        onclick: () => {
          song.status = k;
          status.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.k === k));
          touch();
        },
      }, label)));

    return [top, title, status, buildDetails()];
  }

  function buildDetails() {
    const summaryText = h('span', { class: 'details-sum' });
    const updateSummary = () => {
      const tagCount = Object.values(song.tags).flat().length;
      const bits = [song.key, song.bpm && `${song.bpm} BPM`, tagCount && `${tagCount} etiqueta${tagCount > 1 ? 's' : ''}`].filter(Boolean);
      summaryText.textContent = bits.length ? bits.join(' · ') : 'Tonalidad, BPM, etiquetas';
    };
    updateSummary();

    const keySel = h('select', {
      class: 'field', 'aria-label': 'Tonalidad',
      onchange: (e) => { song.key = e.target.value; updateSummary(); touch(); },
    }, h('option', { value: '' }, 'Sin tonalidad'), KEYS.map((k) => h('option', { value: k }, k)));
    keySel.value = song.key || '';

    const bpm = h('input', {
      class: 'field', type: 'number', inputmode: 'numeric', min: 20, max: 300,
      placeholder: '—', value: song.bpm ?? '', 'aria-label': 'BPM',
      oninput: (e) => {
        const n = parseInt(e.target.value, 10);
        song.bpm = Number.isFinite(n) && n > 0 ? n : null;
        updateSummary(); touch();
      },
    });

    const tagFields = Object.entries(S.TAG_GROUPS).map(([k, label]) =>
      h('label', { class: 'fld' }, h('span', null, label),
        h('input', {
          class: 'field', value: (song.tags[k] || []).join(', '), placeholder: 'separa con comas',
          autocapitalize: 'none',
          oninput: (e) => {
            song.tags[k] = e.target.value.split(',').map((t) => t.trim()).filter(Boolean);
            updateSummary(); touch();
          },
        })));

    const about = h('textarea', {
      class: 'field about', rows: 2, placeholder: 'De qué trata, qué quiero decir…',
      oninput: (e) => { song.about = e.target.value; autosize(e.target); touch(); },
    });
    about.value = song.about;

    const details = h('details', { class: 'details' },
      h('summary', null, h('span', null, 'Detalles'), summaryText),
      h('div', { class: 'details-grid' },
        h('label', { class: 'fld' }, h('span', null, 'Tonalidad'), keySel),
        h('label', { class: 'fld' }, h('span', null, 'BPM'), bpm),
        ...tagFields,
        h('label', { class: 'fld wide' }, h('span', null, 'De qué trata'), about)));
    details.addEventListener('toggle', () => autosize(about));
    // Si ya escribiste de qué trata, se muestra abierto para tenerlo presente.
    if (song.about.trim()) details.open = true;
    return details;
  }

  // ---------- Estructura y secciones ----------
  function renderStructure() {
    players.forEach((p) => p.destroy());
    players = [];
    structureEl.replaceChildren(...song.structure.map((item) => sectionCard(item)));
    if (!song.structure.length) {
      structureEl.append(h('p', { class: 'hint' }, 'Agrega tu primera sección.'));
    }
    for (const sec of song.sections) paintSection(sec);
    renderAudioBlock();
    requestAnimationFrame(() => structureEl.querySelectorAll('textarea').forEach(autosize));
  }

  // ---------- Notas de voz ----------
  // Si una nota apunta a un verso o sección que ya no existe, sube al nivel siguiente.
  const byDate = (a, b) => a.createdAt - b.createdAt;
  function notesOfLine(lineId) {
    return voiceNotes.filter((n) => n.lineId === lineId).sort(byDate);
  }
  function notesOfSection(sec) {
    const lineIds = new Set(sec.lines.map((l) => l.id));
    return voiceNotes.filter((n) => n.sectionId === sec.id && (!n.lineId || !lineIds.has(n.lineId))).sort(byDate);
  }
  function notesOfSong() {
    const secIds = new Set(song.sections.map((s) => s.id));
    return voiceNotes.filter((n) => !n.sectionId || !secIds.has(n.sectionId)).sort(byDate);
  }
  /** La toma que suena en "Reproducir canción": la marcada, o la más reciente. */
  function takeFor(sec) {
    const list = notesOfSection(sec);
    return list.find((n) => n.main) || list[list.length - 1] || null;
  }

  function notePlayer(note) {
    const p = createPlayer(note, { onMenu: () => noteMenu(note), beat: beatOf(note) });
    players.push(p);
    return p.el;
  }

  // ---------- Instrumentales ----------
  const beatInput = h('input', {
    type: 'file', hidden: true, accept: 'audio/*,.mp3,.m4a,.wav,.aac,.aif,.aiff',
    onchange: () => { const f = beatInput.files?.[0]; beatInput.value = ''; if (f) addBeat(f); },
  });

  async function addBeat(file) {
    const mb = file.size / 1024 / 1024;
    if (mb > 40 && !(await confirmSheet({
      title: 'Archivo grande',
      message: `Esta instrumental pesa ${mb.toFixed(0)} MB. Ocupa espacio en el iPhone y hace más pesado el respaldo. ¿Guardarla igual?`,
      ok: 'Guardar igual',
    }))) return;
    toast('Cargando instrumental…');
    let blob;
    let duration;
    try {
      blob = new Blob([await file.arrayBuffer()], { type: guessMime(file) }); // copia propia, no depende del archivo original
      duration = await probeDuration(blob);
    } catch {
      toast('No puedo reproducir este archivo. Usa mp3, m4a o wav.', 4000);
      return;
    }
    const beat = {
      id: S.uid(), kind: 'beat', blob, mime: blob.type, duration,
      name: file.name.replace(/\.[^.]+$/, '') || 'Instrumental',
      songId: song.id, sectionId: null, lineId: null, ideaId: null,
      main: !beats.length, createdAt: Date.now(),
    };
    try {
      await N.saveNote(beat);
    } catch (err) {
      console.error(err);
      toast('No se pudo guardar. Revisa el espacio del iPhone.');
      return;
    }
    beats.push(beat);
    renderAudioBlock();
    toast(`Instrumental «${beat.name}» lista`);
  }

  function beatPlayer(beat) {
    const p = createPlayer(beat, { onMenu: () => beatMenu(beat) });
    players.push(p);
    return p.el;
  }

  async function beatMenu(beat) {
    const takes = voiceNotes.filter((n) => n.beatId === beat.id).length;
    const choice = await sheet({
      title: beat.name,
      message: `${N.formatDuration(beat.duration)} · ${takes ? `${takes} toma${takes > 1 ? 's' : ''} grabada${takes > 1 ? 's' : ''} encima` : 'sin tomas todavía'}`,
      items: [
        { label: 'Grabar encima', value: 'record' },
        { label: 'Cambiar nombre', value: 'rename' },
        !beat.main && beats.length > 1 && { label: 'Usar como principal', value: 'main' },
        { label: 'Eliminar instrumental', value: 'delete', danger: true },
      ].filter(Boolean),
    });
    if (choice === 'record') recordOverBeat(recordContext(), [beat]);
    if (choice === 'rename') {
      const name = await promptSheet({ title: 'Nombre de la instrumental', value: beat.name });
      if (!name) return;
      beat.name = name;
      await N.saveNote(beat);
      renderStructure();
    }
    if (choice === 'main') {
      for (const b of beats) { if (b.main !== (b === beat)) { b.main = b === beat; await N.saveNote(b); } }
      renderAudioBlock();
    }
    if (choice === 'delete') {
      const msg = takes
        ? `Las ${takes} tomas grabadas encima se conservan, pero sonarán solo con tu voz.`
        : 'El archivo se borra de la app.';
      if (!(await confirmSheet({ title: `¿Eliminar «${beat.name}»?`, message: msg, ok: 'Eliminar', danger: true }))) return;
      await N.deleteNote(beat);
      beats = beats.filter((b) => b !== beat);
      if (beats.length && !beats.some((b) => b.main)) { beats[0].main = true; await N.saveNote(beats[0]); }
      renderStructure();
    }
  }

  /** Mezcla de una toma grabada sobre instrumental: volumen de voz, del beat y sincronía. */
  function mixSheet(note) {
    const beat = beatOf(note);
    if (!beat) return;
    const preview = createPlayer(note, { bare: true, beat });
    const pct = (v) => `${Math.round(v * 100)} %`;
    const syncText = (ms) => (ms === 0 ? 'sin ajuste' : ms > 0 ? `voz ${ms} ms antes` : `voz ${-ms} ms después`);
    const slider = (label, value, min, max, step, fmt, set) => {
      const out = h('strong', null, fmt(value));
      const input = h('input', {
        class: 'pl-bar', type: 'range', min, max, step, value, 'aria-label': label,
        oninput: (e) => { const v = Number(e.target.value); set(v); out.textContent = fmt(v); preview.refresh(); },
      });
      return h('div', { class: 'mix-row' }, h('p', { class: 'fld-label' }, label, ' ', out), input);
    };
    const syncOut = h('strong', null, syncText(note.syncMs || 0));
    const syncInput = h('input', {
      class: 'pl-bar', type: 'range', min: -500, max: 500, step: 10, value: note.syncMs || 0, 'aria-label': 'Sincronía',
      oninput: (e) => setSync(Number(e.target.value)),
    });
    const setSync = (v) => {
      note.syncMs = Math.max(-500, Math.min(500, v));
      syncInput.value = note.syncMs;
      syncOut.textContent = syncText(note.syncMs);
      preview.refresh();
    };
    openSheet((close) => [
      h('h3', { class: 'sheet-title' }, 'Mezcla y sincronía'),
      h('p', { class: 'muted small center' }, `${note.name} ♫ ${beat.name}`),
      preview.el,
      slider('Voz', note.voiceVol ?? 1, 0, 1.5, 0.05, pct, (v) => { note.voiceVol = v; }),
      slider('Instrumental', note.beatVol ?? DEFAULT_BEAT_VOL, 0, 1.5, 0.05, pct, (v) => { note.beatVol = v; }),
      h('div', { class: 'mix-row' },
        h('p', { class: 'fld-label' }, 'Sincronía ', syncOut),
        syncInput,
        h('div', { class: 'mix-nudge' },
          h('button', { class: 'chip small', type: 'button', onclick: () => setSync((note.syncMs || 0) - 10) }, '−10 ms'),
          h('button', { class: 'chip small', type: 'button', onclick: () => setSync(0) }, 'Reiniciar'),
          h('button', { class: 'chip small', type: 'button', onclick: () => setSync((note.syncMs || 0) + 10) }, '+10 ms')),
        h('p', { class: 'muted small' }, 'Si tu voz suena atrasada respecto al beat (pasa con AirPods), muévela hacia «antes».')),
      h('div', { class: 'sheet-actions' },
        h('button', { class: 'btn primary', type: 'button', onclick: () => close(true) }, 'Listo')),
    ], { top: true }).then(async () => {
      preview.destroy();
      await N.saveNote(note);
      renderStructure();
    });
  }

  function notesList(list, cls) {
    return list.length ? h('div', { class: 'notes ' + cls }, list.map(notePlayer)) : null;
  }

  const audioEl = h('section', { class: 'song-audio' });
  const playSongBtn = h('button', { class: 'btn primary', type: 'button', onclick: () => toggleSongPlayback() }, icon('play'), 'Reproducir canción');

  function renderAudioBlock() {
    const songNotes = notesOfSong();
    const withAudio = song.structure.filter((it) => { const s = sectionById(it.sectionId); return s && takeFor(s); }).length;
    const sortedBeats = [...beats].sort((a, b) => (b.main ? 1 : 0) - (a.main ? 1 : 0) || a.createdAt - b.createdAt);
    audioEl.replaceChildren(...[
      h('div', { class: 'sa-head' }, h('h2', null, 'Audio'), withAudio ? playSongBtn : null),
      withAudio
        ? h('p', { class: 'muted small' }, `Suenan seguidas las ${withAudio} partes con audio, en el orden de la estructura.`)
        : h('p', { class: 'muted small' }, 'Graba una melodía con el micrófono y guárdala en una sección. Después puedes escuchar la canción entera seguida.'),
      songNotes.length ? h('p', { class: 'fld-label' }, 'Notas de la canción') : null,
      notesList(songNotes, 'song-notes'),
      h('p', { class: 'fld-label' }, 'Instrumentales'),
      sortedBeats.length
        ? h('div', { class: 'notes beats' }, sortedBeats.map(beatPlayer))
        : h('p', { class: 'muted small' }, 'Sube un beat (mp3, m4a o wav) desde Archivos y graba tu voz encima para improvisar.'),
      h('div', { class: 'beat-actions' },
        sortedBeats.length > 0 && h('button', {
          class: 'btn primary', type: 'button', onclick: () => recordOverBeat(recordContext(), sortedBeats),
        }, icon('mic'), 'Grabar sobre la instrumental'),
        h('button', { class: 'btn', type: 'button', onclick: () => beatInput.click() }, icon('plus'), 'Subir instrumental')),
      beatInput,
    ].filter(Boolean));
  }

  async function noteMenu(note) {
    const sec = song.sections.find((s) => s.id === note.sectionId);
    const isSectionTake = sec && !note.lineId;
    const choice = await sheet({
      title: note.name,
      message: `${N.formatDuration(note.duration)} · ${formatDateTime(note.createdAt)}`,
      items: [
        { label: 'Cambiar nombre', value: 'rename' },
        { label: 'Mover a…', value: 'move' },
        beatOf(note) && { label: 'Mezcla y sincronía', sub: 'Volumen de voz y beat, ajustar desfase', value: 'mix' },
        isSectionTake && !note.main && { label: 'Usar esta toma al reproducir la canción', value: 'main' },
        { label: 'Eliminar nota', value: 'delete', danger: true },
      ].filter(Boolean),
    });

    if (choice === 'mix') return mixSheet(note);

    if (choice === 'rename') {
      const name = await promptSheet({ title: 'Nombre de la nota', value: note.name });
      if (!name) return;
      note.name = name;
      await N.saveNote(note);
      renderStructure();
    }

    if (choice === 'main') {
      for (const n of notesOfSection(sec)) {
        if (n.main !== (n === note)) { n.main = n === note; await N.saveNote(n); }
      }
      renderStructure();
      toast('Esta toma suena al reproducir la canción');
    }

    if (choice === 'move') {
      const targets = [{ label: 'Canción completa', value: 'song' }];
      const seen = new Set();
      for (const it of song.structure) {
        const s = sectionById(it.sectionId);
        if (s && !seen.has(s.id)) { seen.add(s.id); targets.push({ label: `Sección: ${s.name}`, value: 'sec:' + s.id }); }
      }
      if (sec) {
        sec.lines.filter((l) => l.text.trim()).forEach((l) => targets.push({ label: `Verso: «${l.text.trim().slice(0, 30)}»`, value: 'line:' + l.id }));
      }
      targets.push({ label: 'Bandeja de ideas', value: 'inbox' });
      const to = await sheet({ title: 'Mover a…', items: targets });
      if (!to) return;
      if (to === 'inbox') {
        await N.saveToInbox(note);
        voiceNotes = voiceNotes.filter((n) => n !== note);
        toast('Movida a la bandeja de ideas');
      } else {
        note.main = false;
        if (to === 'song') Object.assign(note, { sectionId: null, lineId: null });
        else if (to.startsWith('sec:')) Object.assign(note, { sectionId: to.slice(4), lineId: null });
        else Object.assign(note, { sectionId: sec.id, lineId: to.slice(5) });
        await N.saveNote(note);
      }
      renderStructure();
    }

    if (choice === 'delete') {
      if (!(await confirmSheet({ title: `¿Eliminar «${note.name}»?`, message: 'El audio se borra para siempre.', ok: 'Eliminar', danger: true }))) return;
      await N.deleteNote(note);
      voiceNotes = voiceNotes.filter((n) => n !== note);
      renderStructure();
    }
  }

  // ---------- Traer una idea del banco ----------
  async function bringIdea() {
    const unused = (await listIdeas()).filter((i) => !i.usedIn);
    const noteOf = new Map();
    for (const i of unused.filter((x) => x.kind === 'voz')) {
      const n = await N.getNote(i.audioId);
      if (n) noteOf.set(i.audioId, n);
    }
    const usable = unused.filter((i) => i.kind !== 'voz' || noteOf.has(i.audioId));
    if (!usable.length) { toast('No tienes ideas sin usar. Anótalas en la pestaña Ideas.'); return; }

    const id = await sheet({
      title: 'Traer una idea',
      items: usable.slice(0, 50).map((i) => {
        const label = ideaLabel(i, noteOf.get(i.audioId));
        return { label: label.length > 60 ? label.slice(0, 59) + '…' : label, sub: `${KINDS[i.kind]} · ${relativeDate(i.createdAt)}`, value: i.id };
      }),
    });
    const idea = usable.find((i) => i.id === id);
    if (!idea) return;

    const sections = uniqueSections(song);
    if (!sections.length) { toast('Primero agrega una sección'); return; }
    let sec = sections[0];
    if (sections.length > 1) {
      const sid = await sheet({
        title: '¿En qué sección?',
        message: idea.kind === 'voz' ? 'La nota queda pegada a esa sección.' : 'Se agrega al final de esa sección.',
        items: sections.map((s) => ({ label: s.name + (s === caret?.sec ? '  (donde escribías)' : ''), value: s.id })),
      });
      sec = sections.find((s) => s.id === sid);
      if (!sec) return;
    }

    if (idea.kind === 'voz') {
      const note = noteOf.get(idea.audioId);
      const usedIn = { songId: song.id, songTitle: song.title.trim() || 'Sin título', sectionId: sec.id, sectionName: sec.name, at: Date.now() };
      await N.attachToSong(note, { songId: song.id, sectionId: sec.id }, usedIn);
      voiceNotes.push(note);
    } else {
      appendTextToSection(sec, idea.text);
      await markUsed(idea, song, sec);
      touch();
    }
    renderStructure();
    const item = firstItemOf(sec.id);
    structureEl.querySelector(`[data-item-id="${item?.id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    toast(`Idea agregada a ${sec.name}`);
  }

  // ---------- Reproducir canción ----------
  let playback = null;

  function toggleSongPlayback() {
    if (playback) { playback.stop(); return; }
    const queue = song.structure
      .map((item) => ({ item, sec: sectionById(item.sectionId) }))
      .map((q) => ({ ...q, note: q.sec && takeFor(q.sec) }))
      .filter((q) => q.note);
    if (!queue.length) { toast('Primero graba audio en alguna sección'); return; }

    pauseAll();
    // La misma "bandeja" para todas las partes: así el iPhone deja seguir sin tocar play,
    // y las tomas grabadas sobre una instrumental suenan con su beat.
    const deck = new Deck();
    const audio = deck.voice;
    claimAudio(audio);
    let i = -1;
    const label = h('span', { class: 'sb-label' });
    const pauseBtn = h('button', {
      class: 'icon-btn', type: 'button', 'aria-label': 'Pausa',
      onclick: () => { if (audio.paused) deck.play().catch(() => {}); else deck.pause(); },
    }, icon('pause'));
    const bar = h('div', { class: 'song-bar', role: 'region', 'aria-label': 'Reproduciendo canción' },
      h('span', { class: 'sb-dot' }),
      label,
      pauseBtn,
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Siguiente parte', onclick: () => playAt(i + 1) }, icon('next')),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Detener', onclick: () => stop() }, icon('stop')));
    document.body.append(bar);

    const mark = (itemId) => {
      structureEl.querySelectorAll('.sec-card.now').forEach((c) => c.classList.remove('now'));
      if (!itemId) return;
      const card = structureEl.querySelector(`[data-item-id="${itemId}"]`);
      card?.classList.add('now');
      card?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    };

    function playAt(k) {
      if (k >= queue.length) { stop(); return; }
      i = k;
      const q = queue[i];
      deck.load(q.note, beatOf(q.note));
      deck.play().catch(() => toast('No se pudo reproducir'));
      label.textContent = `${sectionById(q.item.sectionId)?.name || ''} · ${i + 1} de ${queue.length}`;
      mark(q.item.id);
    }

    function stop() {
      deck.destroy();
      bar.remove();
      mark(null);
      playback = null;
      playSongBtn.replaceChildren(icon('play'), 'Reproducir canción');
    }

    audio.addEventListener('ended', () => playAt(i + 1));
    audio.addEventListener('play', () => { pauseBtn.querySelector('.ico').replaceWith(icon('pause')); });
    audio.addEventListener('pause', () => { pauseBtn.querySelector('.ico').replaceWith(icon('play')); });

    playback = { stop };
    playSongBtn.replaceChildren(icon('stop'), 'Detener');
    if (queue.length < song.structure.length) toast(`Suenan ${queue.length} de ${song.structure.length} partes (las demás no tienen audio)`, 3000);
    playAt(0);
  }

  function sectionCard(item) {
    const sec = sectionById(item.sectionId);
    const isRepeat = firstItemOf(sec.id) !== item;
    const total = countOf(sec.id);

    const card = h('section', {
      class: 'sec-card' + (isRepeat ? ' repeat' : ''),
      'data-item-id': item.id, 'data-section-id': sec.id, 'data-type': sec.type,
    });

    const handle = h('button', {
      class: 'drag-handle', type: 'button', 'aria-label': 'Mantén y arrastra para mover ' + sec.name,
      onpointerdown: (e) => startDrag(e, card),
    }, icon('grip'));

    const head = h('div', { class: 'sec-head' },
      handle,
      h('button', { class: 'sec-name', type: 'button', onclick: () => renameSection(sec) }, sec.name),
      isRepeat
        ? h('span', { class: 'badge' }, icon('repeat'), 'se repite')
        : total > 1 && h('span', { class: 'badge soft' }, `×${total}`),
      !isRepeat && h('span', { class: 'scheme', title: 'Esquema de rima' }),
      h('span', { class: 'spacer' }),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Opciones de ' + sec.name, onclick: () => sectionMenu(item) }, icon('more')));

    card.append(head, isRepeat ? repeatPreview(sec) : linesEditor(sec));
    if (!isRepeat) {
      const list = notesList(notesOfSection(sec), 'sec-notes');
      if (list) card.append(list);
    }
    return card;
  }

  function repeatPreview(sec) {
    const lines = sec.lines.filter((l) => l.text.trim());
    return h('div', { class: 'preview' },
      lines.length
        ? lines.map((l) => h('p', null, l.text))
        : h('p', { class: 'muted' }, '(todavía vacía)'),
      h('button', {
        class: 'link', type: 'button',
        onclick: () => {
          const first = firstItemOf(sec.id);
          const el = structureEl.querySelector(`[data-item-id="${first.id}"] .lyric`);
          if (el) { el.focus(); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
        },
      }, 'Se edita donde aparece por primera vez'));
  }

  function refreshPreviews(sec) {
    paintSection(sec);
    structureEl.querySelectorAll(`.sec-card.repeat[data-section-id="${sec.id}"] .preview`)
      .forEach((p) => p.replaceWith(repeatPreview(sec)));
  }

  // ---------- Versos ----------
  function linesEditor(sec) {
    return h('div', { class: 'lines' }, sec.lines.map((line) => lineRow(sec, line)));
  }

  function lineRow(sec, line) {
    const row = h('div', { class: 'line', 'data-line-id': line.id });

    if (song.showChords) {
      row.append(h('input', {
        class: 'chords', value: line.chords || '', placeholder: 'acordes',
        autocapitalize: 'characters', autocorrect: 'off', spellcheck: 'false', autocomplete: 'off',
        'aria-label': 'Acordes',
        oninput: (e) => { line.chords = e.target.value; touch(); },
      }));
    }

    const ta = h('textarea', {
      class: 'lyric', rows: 1, placeholder: 'Escribe aquí…',
      autocapitalize: 'sentences', spellcheck: 'true', 'aria-label': 'Verso',
    });
    ta.value = line.text;
    ta.addEventListener('focus', () => { caret = { sec, line, ta }; updateFab(); });

    ta.addEventListener('input', () => {
      if (ta.value.includes('\n') || ta.value.includes('\r')) {
        splitIntoLines(sec, line, ta); // pegaste varias líneas, o el teclado metió un salto
      } else {
        line.text = ta.value;
        autosize(ta);
      }
      touch();
      refreshPreviews(sec);
    });

    ta.addEventListener('keydown', (e) => {
      if (e.isComposing) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        const start = ta.selectionStart;
        ta.value = ta.value.slice(0, start) + '\n' + ta.value.slice(ta.selectionEnd);
        ta.setSelectionRange(start + 1, start + 1);
        splitIntoLines(sec, line, ta);
        touch();
        refreshPreviews(sec);
      } else if (e.key === 'Backspace' && ta.selectionStart === 0 && ta.selectionEnd === 0) {
        if (mergeWithPrevious(sec, line, ta)) {
          e.preventDefault();
          touch();
          refreshPreviews(sec);
        }
      }
    });

    // Detrás del texto va un "espejo" con la palabra final pintada; el texto real queda encima.
    const mirror = h('div', { class: 'mirror', 'aria-hidden': 'true' });
    const gutter = h('button', {
      class: 'gutter', type: 'button', tabindex: '-1', 'aria-label': 'Ver sílabas del verso',
      onclick: () => showMetric(line),
    }, h('span', { class: 'syl' }), h('span', { class: 'rl' }));
    row.append(h('div', { class: 'lyric-wrap' }, mirror, ta), gutter);
    const ln = notesList(notesOfLine(line.id), 'line-notes');
    if (ln) row.append(ln);
    return row;
  }

  function showMetric(line) {
    const m = metricLine(line.text);
    if (!m) return;
    const adj = m.adjust > 0 ? ` +${m.adjust} (aguda)` : m.adjust < 0 ? ` ${m.adjust} (${TYPE_LABELS[m.type]})` : '';
    toast(`${m.display} → ${m.phonetic - m.merges}${adj} = ${m.metric}`, 4000);
  }

  /** Cuenta sílabas y pinta las rimas de una sección (estrofa). */
  function paintSection(sec) {
    const card = structureEl.querySelector(`.sec-card:not(.repeat)[data-section-id="${sec.id}"]`);
    if (!card) return;
    const { lines, scheme } = stanzaRhymes(sec.lines.map((l) => l.text));
    sec.lines.forEach((line, i) => {
      const row = card.querySelector(`[data-line-id="${line.id}"]`);
      if (!row) return;
      const r = lines[i];
      const text = line.text;
      row.querySelector('.mirror').innerHTML = r?.letter
        ? `${escapeHtml(text.slice(0, r.start))}<mark class="c${r.color} ${r.strength}">${escapeHtml(text.slice(r.start, r.end))}</mark>${escapeHtml(text.slice(r.end))}​`
        : escapeHtml(text) + '​';
      const m = metricLine(text);
      row.querySelector('.syl').textContent = m ? m.metric : '';
      const rl = row.querySelector('.rl');
      rl.textContent = r?.letter || '';
      rl.className = 'rl' + (r?.letter ? ` c${r.color} ${r.strength}` : '');
    });
    card.querySelectorAll('.scheme').forEach((el) => { el.textContent = scheme; });
  }

  /** Convierte una caja con saltos de línea en varios versos, dejando el cursor donde iba. */
  function splitIntoLines(sec, line, ta) {
    const value = ta.value.replace(/\r\n?/g, '\n');
    const caret = Math.min(ta.selectionStart, value.length);
    const parts = value.split('\n');

    let acc = 0, caretLine = parts.length - 1, caretOffset = parts[parts.length - 1].length;
    for (let i = 0; i < parts.length; i++) {
      if (caret <= acc + parts[i].length) { caretLine = i; caretOffset = caret - acc; break; }
      acc += parts[i].length + 1;
    }

    line.text = parts[0];
    ta.value = parts[0];
    const newLines = parts.slice(1).map((t) => S.newLine(t));
    sec.lines.splice(sec.lines.indexOf(line) + 1, 0, ...newLines);

    const rows = newLines.map((l) => lineRow(sec, l));
    ta.closest('.line').after(...rows);
    autosize(ta);
    rows.forEach((r) => autosize(r.querySelector('.lyric')));

    const target = caretLine === 0 ? ta : rows[caretLine - 1].querySelector('.lyric');
    target.focus();
    target.setSelectionRange(caretOffset, caretOffset);
  }

  function mergeWithPrevious(sec, line, ta) {
    const idx = sec.lines.indexOf(line);
    if (idx <= 0) return false;
    const prev = sec.lines[idx - 1];
    const caret = prev.text.length;
    prev.text += line.text;
    if (line.chords?.trim()) prev.chords = [prev.chords, line.chords].filter((c) => c?.trim()).join(' ');
    sec.lines.splice(idx, 1);

    // Las notas de voz del verso borrado pasan al verso de arriba.
    const moved = voiceNotes.filter((n) => n.lineId === line.id);
    moved.forEach((n) => { n.lineId = prev.id; N.saveNote(n); });

    const row = ta.closest('.line');
    if (moved.length) {
      // Redibujar después del foco para no cerrar el teclado.
      setTimeout(() => {
        const r = structureEl.querySelector(`[data-line-id="${prev.id}"]`);
        r?.querySelector('.line-notes')?.remove();
        const list = notesList(notesOfLine(prev.id), 'line-notes');
        if (r && list) r.append(list);
      });
    }
    const prevRow = row.previousElementSibling;
    const prevTa = prevRow.querySelector('.lyric');
    prevTa.value = prev.text;
    const prevChords = prevRow.querySelector('.chords');
    if (prevChords) prevChords.value = prev.chords || '';
    prevTa.focus(); // primero el foco, para que el teclado del iPhone no se cierre
    row.remove();
    prevTa.setSelectionRange(caret, caret);
    autosize(prevTa);
    return true;
  }

  // ---------- Rimas desde el editor ----------
  // Un botón flotante sobre el teclado. Con una palabra seleccionada busca sus rimas;
  // sin selección, busca la última palabra del verso anterior (con la que quieres rimar).
  let caret = null; // { sec, line, ta } del último verso donde escribiste
  const fabLabel = h('span', null, 'Rimas');
  const fab = h('button', {
    class: 'fab-rhyme', type: 'button',
    onpointerdown: (e) => e.preventDefault(), // no quitar el foco del verso
    onclick: () => openRhymes(),
  }, icon('rhyme'), fabLabel);
  // Mientras escribes, la barra inferior se esconde: el micrófono queda aquí, junto a Rimas.
  const micFab = h('button', {
    class: 'fab-mic', type: 'button', 'aria-label': 'Grabar nota de voz',
    onpointerdown: (e) => e.preventDefault(),
    onclick: () => recordNow(),
  }, icon('mic'));
  const fabs = h('div', { class: 'fabs', hidden: true }, micFab, fab);
  document.body.append(fabs);

  // Lo que ofrece la pantalla de grabar como destino.
  const recordContext = () => ({
    song,
    sec: caret?.sec || null,
    line: caret?.line || null,
    countFor: (dest) => (dest.sectionId
      ? voiceNotes.filter((n) => n.sectionId === dest.sectionId).length
      : notesOfSong().length),
    onSaved: (note) => {
      if (note.songId !== song.id) return;
      voiceNotes.push(note);
      renderStructure();
    },
  });
  setRecordContext(recordContext);

  function selectionOf(ta) {
    return ta.value.slice(ta.selectionStart, ta.selectionEnd).trim();
  }

  function updateFab() {
    const active = document.activeElement;
    const show = !!caret && active === caret.ta;
    fabs.hidden = !show;
    if (!show) return;
    const sel = selectionOf(caret.ta);
    fabLabel.textContent = sel && sel.length <= 30 ? `Rimas de «${sel}»` : 'Rimas';
    placeFab();
  }

  function placeFab() {
    const vv = window.visualViewport;
    const bottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
    fabs.style.transform = `translateY(${Math.round(bottom - 58)}px)`;
  }

  const onSelection = () => { if (caret && document.activeElement === caret.ta) updateFab(); };
  const onFocusOut = () => setTimeout(updateFab, 150);
  document.addEventListener('selectionchange', onSelection);
  document.addEventListener('focusout', onFocusOut);
  window.visualViewport?.addEventListener('resize', placeFab);
  window.visualViewport?.addEventListener('scroll', placeFab);

  function openRhymes() {
    if (!caret) return;
    const { sec, line, ta } = caret;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = ta.value.slice(start, end).trim();
    const idx = sec.lines.indexOf(line);
    let query;
    let mode;
    if (selected) {
      query = selected;
      mode = 'next';
    } else {
      query = lastWord(idx > 0 ? sec.lines[idx - 1].text : '') || lastWord(line.text.slice(0, start));
      mode = 'caret';
    }
    const hint = mode === 'next'
      ? 'Toca una palabra y se escribe al final del verso siguiente.'
      : 'Toca una palabra y se escribe donde estaba el cursor.';

    fabs.hidden = true;
    openSheet((close) => {
      const panel = createRhymePanel({
        initial: query,
        onPick: (word) => {
          insertWord(word, { sec, line, start, end, mode }); // dentro del toque: el iPhone reabre el teclado
          close(word);
        },
      });
      return [
        h('div', { class: 'sheet-head' },
          h('h3', { class: 'sheet-title' }, 'Rimas'),
          h('button', { class: 'link', type: 'button', onclick: () => close(null) }, 'Cerrar')),
        h('p', { class: 'muted small sheet-hint' }, hint),
        panel.el,
      ];
    }, { tall: true });
  }

  function insertWord(word, { sec, line, start, end, mode }) {
    const rowOf = (l) => structureEl.querySelector(`[data-line-id="${l.id}"]`);
    let target = line;
    let pos;
    if (mode === 'next') {
      const idx = sec.lines.indexOf(line);
      target = sec.lines[idx + 1];
      if (!target) {
        target = S.newLine('');
        sec.lines.splice(idx + 1, 0, target);
        rowOf(line)?.after(lineRow(sec, target));
      }
      const base = target.text.replace(/\s+$/, '');
      target.text = base ? `${base} ${word}` : word;
      pos = target.text.length;
    } else {
      const before = line.text.slice(0, start);
      const after = line.text.slice(end);
      const sp1 = before && !/\s$/.test(before) ? ' ' : '';
      const sp2 = after && !/^[\s,.;:!?)]/.test(after) ? ' ' : '';
      line.text = before + sp1 + word + sp2 + after;
      pos = (before + sp1 + word).length;
    }
    const ta = rowOf(target)?.querySelector('.lyric');
    if (ta) {
      ta.value = target.text;
      autosize(ta);
      ta.focus();
      ta.setSelectionRange(pos, pos);
    }
    touch();
    refreshPreviews(sec);
  }

  // ---------- Acciones sobre secciones ----------
  function insertAfter(item, newItem) {
    song.structure.splice(song.structure.indexOf(item) + 1, 0, newItem);
  }

  function focusSection(itemId) {
    const card = structureEl.querySelector(`[data-item-id="${itemId}"]`);
    if (!card) return;
    const ta = card.querySelector('.lyric');
    if (ta) ta.focus();
    card.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  async function renameSection(sec) {
    const name = await promptSheet({ title: 'Nombre de la sección', value: sec.name });
    if (!name) return;
    sec.name = name;
    touch();
    renderStructure();
  }

  async function sectionMenu(item) {
    const sec = sectionById(item.sectionId);
    const idx = song.structure.indexOf(item);
    const total = countOf(sec.id);
    const isRepeat = firstItemOf(sec.id) !== item;

    const choice = await sheet({
      title: sec.name,
      items: [
        { label: 'Cambiar nombre', value: 'rename' },
        { label: 'Repetir más abajo', sub: 'Vuelve a sonar, sin copiar el texto', value: 'repeat' },
        { label: 'Duplicar como sección nueva', sub: 'Copia el texto para cambiarlo aparte', value: 'dup' },
        idx > 0 && { label: 'Subir', value: 'up' },
        idx < song.structure.length - 1 && { label: 'Bajar', value: 'down' },
        total > 1
          ? { label: 'Quitar de aquí', sub: isRepeat ? 'El texto sigue en las otras apariciones' : 'El texto pasa a la siguiente aparición', value: 'remove', danger: true }
          : { label: 'Eliminar sección', value: 'delete', danger: true },
      ].filter(Boolean),
    });

    if (choice === 'rename') return renameSection(sec);

    if (choice === 'repeat') {
      const newItem = { id: S.uid(), sectionId: sec.id };
      insertAfter(item, newItem);
      touch(); renderStructure();
      structureEl.querySelector(`[data-item-id="${newItem.id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      toast(`${sec.name} se repite`);
    }

    if (choice === 'dup') {
      const name = sec.type === 'Verso' ? S.nextSectionName(song, 'Verso') : `${sec.name} (variación)`;
      const copy = { id: S.uid(), type: sec.type, name, lines: sec.lines.map((l) => S.newLine(l.text, l.chords)) };
      song.sections.push(copy);
      const newItem = { id: S.uid(), sectionId: copy.id };
      insertAfter(item, newItem);
      touch(); renderStructure();
      structureEl.querySelector(`[data-item-id="${newItem.id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }

    if (choice === 'up' || choice === 'down') {
      const to = choice === 'up' ? idx - 1 : idx + 1;
      [song.structure[idx], song.structure[to]] = [song.structure[to], song.structure[idx]];
      touch(); renderStructure();
    }

    if (choice === 'remove') {
      song.structure.splice(idx, 1);
      touch(); renderStructure();
    }

    if (choice === 'delete') {
      if (hasText(sec) && !(await confirmSheet({
        title: `¿Eliminar «${sec.name}»?`, message: 'Se borra su texto. Si guardaste una versión antes, puedes recuperarlo desde ahí.',
        ok: 'Eliminar', danger: true,
      }))) return;
      song.structure.splice(idx, 1);
      song.sections = song.sections.filter((s) => s.id !== sec.id);
      touch(); renderStructure();
    }
  }

  function addSection(type, name) {
    const sec = S.newSection(type, name || S.nextSectionName(song, type));
    song.sections.push(sec);
    const item = { id: S.uid(), sectionId: sec.id };
    song.structure.push(item);
    touch();
    renderStructure();
    focusSection(item.id); // dentro del toque, así el iPhone abre el teclado
  }

  async function addCustom() {
    const name = await promptSheet({ title: 'Nueva sección', placeholder: 'Ej: Hook, Rap, Interludio', ok: 'Agregar' });
    if (name) addSection('Otra', name);
  }

  async function repeatExisting() {
    const unique = [];
    for (const it of song.structure) {
      const sec = sectionById(it.sectionId);
      if (!unique.includes(sec)) unique.push(sec);
    }
    if (!unique.length) return toast('Primero agrega una sección');
    const sid = await sheet({
      title: '¿Qué sección se repite?',
      message: 'Aparecerá al final, con el mismo texto. Si la cambias, cambia en todas partes.',
      items: unique.map((s) => ({ label: s.name, sub: s.lines.find((l) => l.text.trim())?.text, value: s.id })),
    });
    if (!sid) return;
    const item = { id: S.uid(), sectionId: sid };
    song.structure.push(item);
    touch(); renderStructure();
    structureEl.querySelector(`[data-item-id="${item.id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  // ---------- Arrastrar para reordenar ----------
  function startDrag(e, card) {
    if (e.button > 0) return;
    e.preventDefault();
    document.activeElement?.blur?.();
    const handle = e.currentTarget;
    handle.setPointerCapture?.(e.pointerId);

    const fromIdx = [...structureEl.children].indexOf(card);
    structureEl.classList.add('reordering'); // se pliegan las tarjetas para moverlas fácil
    const r0 = card.getBoundingClientRect();
    window.scrollBy(0, r0.top + r0.height / 2 - e.clientY);

    const cards = [...structureEl.querySelectorAll('.sec-card')];
    const centers = cards.map((c) => { const r = c.getBoundingClientRect(); return r.top + window.scrollY + r.height / 2; });
    const step = cards.length > 1
      ? Math.abs(centers[1] - centers[0])
      : card.getBoundingClientRect().height;

    card.classList.add('dragging');
    let lastY = e.clientY;
    let to = fromIdx;
    let raf = 0;
    let finished = false;

    const update = () => {
      const y = lastY + window.scrollY;
      card.style.transform = `translateY(${y - centers[fromIdx]}px)`;
      to = centers.reduce((n, c, i) => (i !== fromIdx && c < y ? n + 1 : n), 0);
      cards.forEach((c, i) => {
        if (i === fromIdx) return;
        let shift = 0;
        if (i > fromIdx && i <= to) shift = -step;
        else if (i < fromIdx && i >= to) shift = step;
        c.style.transform = shift ? `translateY(${shift}px)` : '';
      });
    };

    const tick = () => {
      const edge = 80;
      if (lastY < edge) window.scrollBy(0, -10);
      else if (lastY > window.innerHeight - edge - 70) window.scrollBy(0, 10);
      update();
      raf = requestAnimationFrame(tick);
    };

    const onMove = (ev) => { lastY = ev.clientY; };
    const onEnd = () => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(raf);
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onEnd);
      handle.removeEventListener('pointercancel', onEnd);
      structureEl.classList.remove('reordering');
      if (to !== fromIdx) {
        const [moved] = song.structure.splice(fromIdx, 1);
        song.structure.splice(to, 0, moved);
        touch();
      }
      const movedId = card.dataset.itemId;
      renderStructure();
      structureEl.querySelector(`[data-item-id="${movedId}"]`)?.scrollIntoView({ block: 'nearest' });
    };

    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onEnd);
    handle.addEventListener('pointercancel', onEnd);
    raf = requestAnimationFrame(tick);
  }

  // ---------- Versiones y menú de la canción ----------
  async function saveVersionFlow() {
    await flush();
    const versions = await S.listVersions(song.id);
    const suggested = 'v' + (versions.length + 1);
    const label = await promptSheet({ title: 'Guardar versión', value: suggested, ok: 'Guardar' });
    if (label == null) return;
    await S.saveVersion(song, label || suggested);
    toast(`Versión «${label || suggested}» guardada`);
  }

  async function versionsFlow() {
    await flush();
    const versions = await S.listVersions(song.id);
    if (!versions.length) {
      const go = await confirmSheet({ title: 'Aún no hay versiones', message: 'Una versión es una foto de la canción tal como está. Puedes volver a ella cuando quieras.', ok: 'Guardar la primera versión' });
      if (go) await saveVersionFlow();
      return;
    }
    const vid = await sheet({
      title: 'Versiones',
      items: versions.map((v) => ({ label: v.label, sub: formatDateTime(v.createdAt), value: v.id })),
    });
    const v = versions.find((x) => x.id === vid);
    if (!v) return;

    const action = await sheet({
      title: v.label, message: formatDateTime(v.createdAt),
      items: [
        { label: 'Volver a esta versión', value: 'restore' },
        { label: 'Eliminar esta versión', value: 'delete', danger: true },
      ],
    });

    if (action === 'restore') {
      const ok = await confirmSheet({
        title: `¿Volver a «${v.label}»?`,
        message: `Por si acaso, lo que tienes ahora se guarda como «antes de volver a ${v.label}».`,
        ok: 'Volver a esta versión',
      });
      if (!ok) return;
      await S.saveVersion(song, `antes de volver a ${v.label}`);
      S.applyVersion(song, v);
      touch();
      build();
      toast(`Volviste a «${v.label}»`);
    }

    if (action === 'delete') {
      if (await confirmSheet({ title: `¿Eliminar «${v.label}»?`, message: 'Tu canción actual no cambia.', ok: 'Eliminar', danger: true })) {
        await S.deleteVersion(v.id);
        toast('Versión eliminada');
      }
    }
  }

  async function exportFlow() {
    await flush();
    const chords = hasChords(song);
    const choice = await sheet({
      title: 'Exportar letra',
      message: 'Letra limpia, en el orden de la estructura.',
      items: [
        { label: 'Texto (.txt)', value: 'txt' },
        chords && { label: 'Texto con acordes (.txt)', value: 'txt+' },
        { label: 'Markdown (.md)', value: 'md' },
        chords && { label: 'Markdown con acordes (.md)', value: 'md+' },
        { label: 'Imprimir o guardar PDF', value: 'print' },
      ].filter(Boolean),
    });
    if (!choice) return;
    if (choice === 'print') { location.hash = '#/imprimir/' + song.id; return; }
    const markdown = choice.startsWith('md');
    const text = songToText(song, { markdown, chords: choice.endsWith('+') });
    const name = fileSlug(song.title) + (markdown ? '.md' : '.txt');
    const blob = new Blob([text], { type: markdown ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8' });
    const result = await saveFile(blob, name);
    if (result !== 'cancelled') toast(`Letra exportada: ${name}`);
  }

  async function songMenu() {
    const choice = await sheet({
      title: song.title.trim() || 'Sin título',
      items: [
        { label: 'Guardar versión', sub: 'Una foto de cómo está ahora', value: 'save' },
        { label: 'Ver versiones', value: 'versions' },
        { label: 'Exportar letra…', sub: '.txt, .md o PDF', value: 'export' },
        { label: song.showChords ? 'Ocultar acordes' : 'Mostrar acordes', value: 'chords' },
        { label: 'Eliminar canción', value: 'delete', danger: true },
      ],
    });
    if (choice === 'save') return saveVersionFlow();
    if (choice === 'versions') return versionsFlow();
    if (choice === 'export') return exportFlow();
    if (choice === 'chords') return toggleChords();
    if (choice === 'delete') {
      const ok = await confirmSheet({
        title: '¿Eliminar esta canción?',
        message: 'Se borran la letra y sus versiones. No se puede deshacer.',
        ok: 'Eliminar canción', danger: true,
      });
      if (!ok) return;
      deleted = true;
      clearTimeout(saveTimer);
      await S.deleteSong(song.id);
      toast('Canción eliminada');
      location.hash = '#/canciones';
    }
  }

  function toggleChords() {
    song.showChords = !song.showChords;
    chordsBtn.classList.toggle('on', song.showChords);
    touch();
    renderStructure();
  }

  const chordsBtn = h('button', { class: 'chip small', type: 'button', onclick: toggleChords }, 'Acordes');

  let showSyl = readPref('showSyllables');
  let showRhymes = readPref('showRhymes');
  const editorEl = h('div', { class: 'editor' });
  const applyToggles = () => {
    editorEl.classList.toggle('no-syl', !showSyl);
    editorEl.classList.toggle('no-rhyme', !showRhymes);
    sylBtn.classList.toggle('on', showSyl);
    rhymeBtn.classList.toggle('on', showRhymes);
  };
  const sylBtn = h('button', {
    class: 'chip small', type: 'button', 'aria-label': 'Mostrar sílabas',
    onclick: () => { showSyl = !showSyl; writePref('showSyllables', showSyl); applyToggles(); },
  }, 'Sílabas');
  const rhymeBtn = h('button', {
    class: 'chip small', type: 'button', 'aria-label': 'Mostrar colores de rima',
    onclick: () => { showRhymes = !showRhymes; writePref('showRhymes', showRhymes); applyToggles(); },
  }, 'Rimas');

  // ---------- Armar la pantalla ----------
  function build() {
    chordsBtn.classList.toggle('on', song.showChords);
    applyToggles();
    editorEl.replaceChildren(
      ...buildHeader(),
      h('div', { class: 'structure-head' }, h('h2', null, 'Letra'), h('div', { class: 'toggles' }, sylBtn, rhymeBtn, chordsBtn)),
      structureEl,
      audioEl,
      h('div', { class: 'add-bar' },
        h('p', { class: 'label' }, 'Agregar sección'),
        h('div', { class: 'chips wrap' },
          S.SECTION_TYPES.map((t) => h('button', { class: 'chip', type: 'button', onclick: () => addSection(t) }, '+ ' + t)),
          h('button', { class: 'chip', type: 'button', onclick: addCustom }, '+ Otra…'),
          h('button', { class: 'chip accent', type: 'button', onclick: repeatExisting }, icon('repeat'), 'Repetir…'),
          h('button', { class: 'chip accent', type: 'button', onclick: bringIdea }, icon('ideas'), 'Traer idea…'))),
      h('button', { class: 'btn wide', type: 'button', onclick: saveVersionFlow }, icon('versions'), 'Guardar versión'));
    view.replaceChildren(editorEl);
    renderStructure();
  }

  build();

  // Al salir de la pantalla: guardar, y si la canción quedó vacía, no dejar basura.
  return async () => {
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', flush);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('selectionchange', onSelection);
    document.removeEventListener('focusout', onFocusOut);
    window.visualViewport?.removeEventListener('resize', placeFab);
    window.visualViewport?.removeEventListener('scroll', placeFab);
    fabs.remove();
    setRecordContext(null);
    playback?.stop();
    players.forEach((p) => p.destroy());
    if (deleted) return;
    await flush();
    if (song.createdAt === song.updatedAt && S.isEmpty(song)) await S.deleteSong(song.id);
  };
}
