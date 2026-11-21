// Reproductor de una nota de voz: play/pausa, posición, velocidad 0,75x/1x y bucle.
// Si la toma se grabó sobre una instrumental, suena junto con ella (ver deck.js).

import { h, icon, ICONS, toast } from '../ui.js';
import { formatDuration } from './notes.js';
import { Deck } from './deck.js';

let current = null; // solo suena una nota a la vez

export function pauseAll() {
  if (current && !current.paused) current.pause();
}

export function claimAudio(audio) {
  if (current && current !== audio && !current.paused) current.pause();
  current = audio;
}

/** Motor simple: un solo <audio>. */
function simpleEngine(note) {
  const audio = new Audio();
  audio.preload = 'none';
  let url = null;
  const ensure = () => {
    if (!url) { url = URL.createObjectURL(note.blob); audio.src = url; }
  };
  return {
    el: audio,
    play(rate) {
      ensure();
      audio.playbackRate = rate;
      return audio.play().then(() => { audio.playbackRate = rate; });
    },
    pause: () => audio.pause(),
    setRate: (r) => { audio.playbackRate = r; },
    seek(t) { ensure(); audio.currentTime = t; },
    setLoop: (v) => { audio.loop = v; },
    refresh() {},
    destroy() { audio.pause(); if (url) URL.revokeObjectURL(url); url = null; },
  };
}

/** Motor con instrumental: voz + beat sincronizados. */
function deckEngine(note, beat) {
  const deck = new Deck();
  let loaded = false;
  const ensure = () => { if (!loaded) { deck.load(note, beat); loaded = true; } };
  return {
    el: deck.voice,
    play(rate) { ensure(); deck.setRate(rate); return deck.play(); },
    pause: () => deck.pause(),
    setRate: (r) => deck.setRate(r),
    seek(t) { ensure(); deck.voice.currentTime = t; },
    setLoop: (v) => { deck.voice.loop = v; },
    refresh() { if (loaded) { deck.applyVolumes(); deck.resync(true); } },
    destroy: () => deck.destroy(),
  };
}

/**
 * createPlayer(note, { onMenu, bare, beat })
 *   bare: sin nombre (para la vista previa al grabar)
 *   beat: la instrumental sobre la que se grabó (si existe)
 * Devuelve { el, refresh(), destroy() }
 */
export function createPlayer(note, { onMenu, bare = false, beat = null } = {}) {
  const engine = beat ? deckEngine(note, beat) : simpleEngine(note);
  const audio = engine.el;
  let rate = 1;
  const duration = note.duration || 0;

  const playBtn = h('button', { class: 'pl-play', type: 'button', 'aria-label': 'Reproducir' }, icon('play'));
  const time = h('span', { class: 'pl-time' }, formatDuration(duration));
  const bar = h('input', {
    class: 'pl-bar', type: 'range', min: 0, max: Math.max(duration, 0.1), step: 0.05, value: 0, 'aria-label': 'Posición',
    oninput: (e) => engine.seek(Number(e.target.value)),
  });
  const speed = h('button', {
    class: 'pl-chip', type: 'button', 'aria-label': 'Velocidad',
    onclick: () => {
      rate = rate === 1 ? 0.75 : 1;
      engine.setRate(rate);
      speed.textContent = rate === 1 ? '1x' : '0,75x';
      speed.classList.toggle('on', rate !== 1);
    },
  }, '1x');
  const loop = h('button', {
    class: 'pl-chip', type: 'button', 'aria-label': 'Repetir en bucle',
    onclick: () => { audio.loop = !audio.loop; engine.setLoop(audio.loop); loop.classList.toggle('on', audio.loop); },
  }, icon('repeat'));

  playBtn.addEventListener('click', () => {
    if (audio.paused) {
      claimAudio(audio);
      engine.play(rate).catch(() => toast('No se pudo reproducir este audio'));
    } else {
      engine.pause();
    }
  });

  const el = h('div', { class: 'player' + (note.main ? ' main' : '') + (beat ? ' with-beat' : '') },
    playBtn,
    h('div', { class: 'pl-main' },
      !bare && h('span', { class: 'pl-name' }, note.name || 'Nota de voz'),
      beat && h('span', { class: 'pl-beat' }, '♫ sobre «' + (beat.name || 'instrumental') + '»'),
      h('div', { class: 'pl-row' }, bar, time)),
    speed,
    loop,
    onMenu && h('button', { class: 'icon-btn pl-menu', type: 'button', 'aria-label': 'Opciones de la nota', onclick: onMenu }, icon('more')));

  const setIcon = (playing) => {
    playBtn.querySelector('.ico').innerHTML = playing ? ICONS.pause : ICONS.play;
    el.classList.toggle('playing', playing);
  };
  audio.addEventListener('play', () => setIcon(true));
  audio.addEventListener('pause', () => setIcon(false));
  audio.addEventListener('ended', () => setIcon(false));
  audio.addEventListener('timeupdate', () => {
    bar.value = audio.currentTime;
    time.textContent = `${formatDuration(audio.currentTime)} / ${formatDuration(duration)}`;
  });

  return {
    el,
    refresh: () => engine.refresh(),
    destroy: () => engine.destroy(),
  };
}
