// "Bandeja de mezcla": reproduce una toma de voz junto con la instrumental sobre la que se grabó,
// sincronizadas, con volumen para cada una.
//
// Una toma grabada sobre una instrumental guarda:
//   beatId     → la instrumental (también en el almacén "audios", con kind: 'beat')
//   beatOffset → en qué segundo de la instrumental empezó la grabación
//   beatLoop   → si la instrumental sonaba en bucle
//   syncMs     → ajuste fino: positivo = la voz suena antes (para el retraso de los AirPods)
//   voiceVol, beatVol → volúmenes de 0 a 1

let ctx = null;

/** Un solo AudioContext para toda la app (en el iPhone hay que reanudarlo dentro de un toque). */
export function audioContext() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      try { ctx = new AC(); } catch { ctx = null; }
    }
  }
  return ctx;
}

/** iOS 17+: cómo se comporta el audio (que no lo silencie el interruptor de silencio, etc.). */
export function setAudioSession(type) {
  try { if (navigator.audioSession) navigator.audioSession.type = type; } catch { /* no disponible */ }
}

export const DEFAULT_BEAT_VOL = 0.8;

/**
 * Dónde debería ir la instrumental cuando la voz va en el segundo voiceTime.
 * syncMs positivo = la voz suena antes (el beat va más adelante).
 */
export function beatTimeAt(note, voiceTime, beatDuration) {
  let t = (note.beatOffset || 0) + voiceTime + (note.syncMs || 0) / 1000;
  if (note.beatLoop && beatDuration > 0) t = ((t % beatDuration) + beatDuration) % beatDuration;
  return t;
}
const DRIFT = 0.12; // segundos de desfase tolerados antes de corregir

export class Deck {
  constructor() {
    this.voice = new Audio();
    this.beat = new Audio();
    this.voice.preload = 'auto';
    this.beat.preload = 'auto';
    this.note = null;
    this.beatRec = null;
    this.urls = [];
    this.graph = null;
    this.rate = 1;
    this.voice.addEventListener('timeupdate', () => this.resync(false));
    this.voice.addEventListener('seeked', () => this.resync(true));
    this.voice.addEventListener('pause', () => this.beat.pause());
    this.voice.addEventListener('ended', () => this.beat.pause());
  }

  /** Volumen con Web Audio: en el iPhone el volumen de un <audio> no se puede cambiar. */
  ensureGraph() {
    if (this.graph !== null) return;
    const c = audioContext();
    if (!c) { this.graph = false; return; }
    try {
      const vg = c.createGain();
      const bg = c.createGain();
      c.createMediaElementSource(this.voice).connect(vg).connect(c.destination);
      c.createMediaElementSource(this.beat).connect(bg).connect(c.destination);
      this.graph = { vg, bg };
    } catch (err) {
      console.warn('Sin control de volumen:', err);
      this.graph = false;
    }
  }

  load(note, beatRec = null) {
    this.pause();
    this.urls.forEach((u) => URL.revokeObjectURL(u));
    this.urls = [];
    this.note = note;
    this.beatRec = beatRec && beatRec.blob ? beatRec : null;
    const vu = URL.createObjectURL(note.blob);
    this.urls.push(vu);
    this.voice.src = vu;
    if (this.beatRec) {
      const bu = URL.createObjectURL(this.beatRec.blob);
      this.urls.push(bu);
      this.beat.src = bu;
      this.beat.loop = !!note.beatLoop;
    } else {
      this.beat.removeAttribute('src');
      this.beat.load();
    }
    this.applyVolumes();
  }

  applyVolumes() {
    const v = this.note?.voiceVol ?? 1;
    const b = this.note?.beatVol ?? DEFAULT_BEAT_VOL;
    if (this.graph) {
      this.graph.vg.gain.value = v;
      this.graph.bg.gain.value = b;
    } else {
      try { this.voice.volume = Math.min(1, v); this.beat.volume = Math.min(1, b); } catch { /* iPhone: fijo */ }
    }
  }

  beatTimeFor(voiceTime) {
    return beatTimeAt(this.note, voiceTime, this.beatRec?.duration);
  }

  resync(force) {
    if (!this.beatRec || this.voice.paused) return;
    const t = this.beatTimeFor(this.voice.currentTime);
    const d = this.beatRec.duration || Infinity;
    if (t < 0 || (!this.note.beatLoop && t >= d)) {
      if (!this.beat.paused) this.beat.pause();
      return;
    }
    if (force || Math.abs(this.beat.currentTime - t) > DRIFT) {
      try { this.beat.currentTime = t; } catch { /* aún sin cargar */ }
    }
    if (this.beat.paused) this.beat.play().catch(() => {});
  }

  /** Llamar dentro de un toque la primera vez (el iPhone lo exige). */
  play() {
    setAudioSession('playback');
    const c = audioContext();
    this.ensureGraph();
    this.applyVolumes();
    c?.resume?.().catch(() => {});
    this.voice.playbackRate = this.rate;
    this.beat.playbackRate = this.rate;
    const p = this.voice.play();
    if (this.beatRec) {
      const t = this.beatTimeFor(this.voice.currentTime);
      if (t >= 0) {
        try { this.beat.currentTime = t; } catch { /* se corrige en resync */ }
        this.beat.play().catch(() => {});
      }
    }
    return p;
  }

  pause() {
    this.voice.pause();
    this.beat.pause();
  }

  setRate(rate) {
    this.rate = rate;
    this.voice.playbackRate = rate;
    this.beat.playbackRate = rate;
  }

  destroy() {
    this.pause();
    this.urls.forEach((u) => URL.revokeObjectURL(u));
    this.urls = [];
  }
}

/** Lee la duración de un archivo de audio. Rechaza si el navegador no sabe reproducirlo. */
export function probeDuration(blob) {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    const url = URL.createObjectURL(blob);
    const done = (fn, value) => { clearTimeout(timer); URL.revokeObjectURL(url); fn(value); };
    const timer = setTimeout(() => done(reject, new Error('timeout')), 10000);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => done(resolve, Number.isFinite(audio.duration) ? audio.duration : 0);
    audio.onerror = () => done(reject, new Error('formato'));
    audio.src = url;
  });
}

/** Tipo de archivo según la extensión, por si el sistema no lo informa. */
export function guessMime(file) {
  if (file.type) return file.type;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  return { mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', aif: 'audio/aiff', aiff: 'audio/aiff', ogg: 'audio/ogg', mp4: 'audio/mp4' }[ext] || 'audio/mpeg';
}
