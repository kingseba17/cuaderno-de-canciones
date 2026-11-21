// La pantalla de grabar: un toque empieza, "Detener" termina, y luego eliges nombre y destino.

import { h, openSheet, toast } from '../ui.js';
import { uid } from '../songs.js';
import { recordingSupported, startRecording, micErrorMessage } from './recorder.js';
import { saveNote, saveToInbox, formatDuration } from './notes.js';
import { createPlayer, pauseAll } from './player.js';
import { setAudioSession, DEFAULT_BEAT_VOL } from './deck.js';

// El editor avisa qué canción/sección/verso está abierto, para ofrecerlos como destino.
let contextProvider = null;
export function setRecordContext(fn) { contextProvider = fn; }

const short = (text, n = 28) => (text.length > n ? text.slice(0, n - 1) + '…' : text);

function destinations(ctx) {
  const out = [];
  if (ctx?.song) {
    const { song, sec, line } = ctx;
    if (sec && line) {
      out.push({ label: `Este verso: «${short(line.text.trim()) || 'vacío'}»`, songId: song.id, sectionId: sec.id, lineId: line.id, base: sec.name });
    }
    const seen = new Set();
    for (const item of song.structure) {
      const s = song.sections.find((x) => x.id === item.sectionId);
      if (!s || seen.has(s.id)) continue;
      seen.add(s.id);
      out.push({ label: `Sección: ${s.name}`, songId: song.id, sectionId: s.id, base: s.name, default: s.id === sec?.id });
    }
    out.push({ label: 'Canción completa', songId: song.id, base: song.title.trim() || 'Canción', default: !sec });
  }
  out.push({ label: 'Bandeja de ideas', inbox: true, base: 'Idea', default: !ctx?.song });
  return out;
}

function defaultName(dest, ctx) {
  if (dest.inbox) {
    return 'Idea ' + new Date().toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  const n = (ctx?.countFor?.(dest) || 0) + 1;
  return `${dest.base} · toma ${n}`;
}

function readFlag(key, fallback) {
  try { const v = localStorage.getItem(key); return v == null ? fallback : v === '1'; } catch { return fallback; }
}
function writeFlag(key, on) {
  try { localStorage.setItem(key, on ? '1' : '0'); } catch { /* solo esta sesión */ }
}

/**
 * Pantalla previa para grabar sobre una instrumental: cuál, desde qué segundo, audífonos y bucle.
 * La nota se entrega al editor por ctx.onSaved.
 */
export function recordOverBeat(ctx, beats) {
  if (!beats?.length) { toast('Primero sube una instrumental'); return; }
  let beat = beats.find((b) => b.main) || beats[0];
  let start = 0;
  let headphones = readFlag('beatHeadphones', true);
  let loop = readFlag('beatLoop', false);

  openSheet((close) => {
    const startLabel = h('strong', null, '0:00');
    const range = h('input', {
      class: 'pl-bar', type: 'range', min: 0, max: Math.max(1, Math.floor(beat.duration || 1)), step: 1, value: 0,
      'aria-label': 'Empezar en',
      oninput: (e) => { start = Number(e.target.value); startLabel.textContent = formatDuration(start); },
    });
    const beatList = beats.length > 1 && h('div', { class: 'dest-list' }, beats.map((b) =>
      h('label', { class: 'dest' },
        h('input', {
          type: 'radio', name: 'beat', checked: b === beat,
          onchange: () => {
            beat = b;
            range.max = Math.max(1, Math.floor(b.duration || 1));
            range.value = 0; start = 0; startLabel.textContent = '0:00';
          },
        }),
        h('span', null, b.name))));

    const check = (label, help, value, onChange) => h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: value, onchange: (e) => onChange(e.target.checked) }),
      h('span', null, h('span', null, label), help && h('small', null, help)));

    return [
      h('h3', { class: 'sheet-title' }, 'Grabar sobre la instrumental'),
      beatList ? h('p', { class: 'fld-label' }, 'Instrumental') : h('p', { class: 'muted small center' }, `♫ ${beat.name}`),
      beatList,
      h('p', { class: 'fld-label' }, 'Empezar en ', startLabel),
      range,
      check('Uso audífonos', 'Así el micrófono graba solo tu voz. Sin audífonos se activa la cancelación de eco para que el beat no se cuele.', headphones, (v) => { headphones = v; writeFlag('beatHeadphones', v); }),
      check('Repetir la instrumental en bucle', 'Si no, la grabación termina cuando termina el beat.', loop, (v) => { loop = v; writeFlag('beatLoop', v); }),
      h('button', {
        class: 'rec-stop go', type: 'button',
        // Todo dentro del mismo toque: el iPhone solo deja empezar el beat así.
        onclick: () => { close(null); recordNow(ctx, { beat, start, loop, headphones }); },
      }, h('span', { class: 'dot' }), 'Grabar'),
      h('button', { class: 'link center', type: 'button', onclick: () => close(null) }, 'Cancelar'),
    ].filter(Boolean);
  }, { top: true });
}

/**
 * Empieza a grabar de inmediato. Devuelve la nota guardada, o null.
 * over: { beat, start, loop, headphones } para grabar sobre una instrumental.
 */
export async function recordNow(ctx = contextProvider?.(), over = null) {
  if (!recordingSupported()) {
    toast('Este navegador no puede grabar audio.');
    return null;
  }
  pauseAll();

  // La instrumental empieza a sonar YA, dentro del toque (el iPhone no deja empezar audio después).
  let beatEl = null;
  let beatUrl = null;
  if (over?.beat) {
    setAudioSession('play-and-record');
    beatUrl = URL.createObjectURL(over.beat.blob);
    beatEl = new Audio(beatUrl);
    beatEl.loop = !!over.loop;
    beatEl.play().catch(() => {});
    if (over.start > 0) {
      const seek = () => { try { beatEl.currentTime = over.start; } catch { /* sigue desde 0 */ } };
      if (beatEl.readyState >= 1) seek(); else beatEl.addEventListener('loadedmetadata', seek, { once: true });
    }
  }
  const stopBeat = () => {
    if (!beatEl) return;
    beatEl.pause();
    URL.revokeObjectURL(beatUrl);
    beatEl = null;
  };

  let session;
  let beatOffset = 0;
  try {
    session = await startRecording({ echoCancellation: !!over && !over.headphones });
    await session.started;
    if (beatEl) beatOffset = beatEl.currentTime; // en qué segundo del beat empezó tu voz
  } catch (err) {
    stopBeat();
    toast(micErrorMessage(err), 5000);
    return null;
  }
  let wake = null;
  try { wake = await navigator.wakeLock?.request('screen'); } catch { /* sin bloqueo de pantalla */ }
  const releaseWake = () => { try { wake?.release?.(); } catch { /* ya liberado */ } };

  return openSheet((close) => {
    const body = h('div', { class: 'rec-body' });
    const timer = h('div', { class: 'rec-time' }, '0:00');
    const ring = h('div', { class: 'rec-ring' }, h('div', { class: 'rec-dot' }));
    let raf = 0;
    const tick = () => {
      timer.textContent = formatDuration(session.elapsed());
      ring.style.setProperty('--lvl', session.level().toFixed(3));
      raf = requestAnimationFrame(tick);
    };
    tick();

    const where = ctx?.song ? `para «${ctx.song.title.trim() || 'Sin título'}»` : 'a la bandeja de ideas';
    const beatLabel = over?.beat && h('p', { class: 'rec-beat' }, `♫ Sonando: ${over.beat.name}`);
    let stopping = false;
    const stop = async () => {
      if (stopping) return;
      stopping = true;
      stopBtn.disabled = true;
      cancelAnimationFrame(raf);
      stopBeat();
      const result = await session.stop();
      releaseWake();
      setAudioSession('auto');
      showSave(result);
    };
    const stopBtn = h('button', { class: 'rec-stop', type: 'button', onclick: stop }, h('span', { class: 'sq' }), 'Detener');
    // Si la instrumental se termina (sin bucle), la grabación termina con ella.
    beatEl?.addEventListener('ended', () => { if (!beatEl?.loop) stop(); });
    body.append(...[
      h('p', { class: 'rec-label' }, h('span', { class: 'rec-live' }), `Grabando ${where}`),
      beatLabel,
      ring,
      timer,
      stopBtn,
      h('button', {
        class: 'link', type: 'button',
        onclick: () => { cancelAnimationFrame(raf); stopBeat(); session.cancel(); releaseWake(); setAudioSession('auto'); close(null); },
      }, 'Cancelar'),
    ].filter(Boolean));

    function showSave(result) {
      if (!result.blob.size) {
        toast('La grabación quedó vacía');
        close(null);
        return;
      }
      const dests = destinations(ctx);
      let chosen = dests.find((d) => d.default) || dests[0];
      let nameTouched = false;
      const nameInput = h('input', {
        class: 'field', value: defaultName(chosen, ctx), enterkeyhint: 'done', autocomplete: 'off',
        oninput: () => { nameTouched = true; },
        onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); },
      });
      const beatInfo = over?.beat
        ? { beatId: over.beat.id, beatOffset, beatLoop: !!over.loop, syncMs: 0, voiceVol: 1, beatVol: DEFAULT_BEAT_VOL }
        : {};
      const preview = createPlayer({ blob: result.blob, duration: result.duration, ...beatInfo }, { bare: true, beat: over?.beat || null });

      const list = h('div', { class: 'dest-list', role: 'radiogroup' }, dests.map((d) =>
        h('label', { class: 'dest' },
          h('input', {
            type: 'radio', name: 'dest', checked: d === chosen,
            onchange: () => { chosen = d; if (!nameTouched) nameInput.value = defaultName(d, ctx); },
          }),
          h('span', null, d.label))));

      let discardArmed = false;
      const discard = h('button', {
        class: 'btn ghost', type: 'button',
        onclick: () => {
          if (!discardArmed) { discardArmed = true; discard.textContent = '¿Seguro? Toca otra vez'; return; }
          preview.destroy();
          close(null);
        },
      }, 'Descartar');

      const save = h('button', {
        class: 'btn primary', type: 'button',
        onclick: async () => {
          save.disabled = true;
          const note = {
            id: uid(), blob: result.blob, mime: result.mime, duration: result.duration,
            name: nameInput.value.trim() || defaultName(chosen, ctx),
            songId: chosen.songId || null, sectionId: chosen.sectionId || null, lineId: chosen.lineId || null,
            ideaId: null, main: false, createdAt: Date.now(),
            ...beatInfo,
          };
          try {
            if (chosen.inbox) await saveToInbox(note); else await saveNote(note);
          } catch (err) {
            console.error(err);
            save.disabled = false;
            toast('No se pudo guardar el audio. Revisa el espacio del iPhone.');
            return;
          }
          preview.destroy();
          toast(chosen.inbox ? 'Guardada en la bandeja de ideas' : `Guardada en ${chosen.label.replace(/^Sección: /, '')}`);
          ctx?.onSaved?.(note);
          close(note);
        },
      }, 'Guardar');

      body.replaceChildren(
        h('h3', { class: 'sheet-title' }, `Nota de voz · ${formatDuration(result.duration)}`),
        preview.el,
        h('label', { class: 'fld rec-name' }, h('span', null, 'Nombre'), nameInput),
        h('p', { class: 'fld-label' }, '¿Dónde la guardo?'),
        list,
        h('div', { class: 'sheet-actions' }, discard, save));
    }

    return [body];
  }, { modal: true, top: true });
}
