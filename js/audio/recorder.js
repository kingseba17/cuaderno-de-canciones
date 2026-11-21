// Grabación con el micrófono (MediaRecorder).
// En el iPhone, Safari graba en audio/mp4 (AAC); en Chrome/Edge, en webm u mp4.

export function recordingSupported() {
  return !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
}

/** Primer formato que el navegador sabe grabar. mp4 primero: es el que el iPhone reproduce siempre. */
export function pickMime() {
  // AAC dentro de mp4 suena en todos los iPhone; Opus dentro de mp4 no siempre.
  const options = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  for (const type of options) {
    if (MediaRecorder.isTypeSupported?.(type)) return type;
  }
  return '';
}

export function micErrorMessage(err) {
  const name = err?.name || '';
  if (name === 'NotAllowedError') return 'No hay permiso para el micrófono. Acepta cuando el iPhone lo pregunte, o revisa Ajustes > Safari > Micrófono.';
  if (name === 'NotFoundError') return 'No encontré un micrófono.';
  if (name === 'NotReadableError') return 'El micrófono está ocupado por otra app.';
  if (!window.isSecureContext) return 'Para grabar, la app tiene que abrirse con https (queda listo en la Etapa 6) o en localhost.';
  return 'No se pudo empezar a grabar: ' + (err?.message || name);
}

/**
 * Empieza a grabar. Devuelve { elapsed(), level(), stop(), cancel() }
 *   stop() → Promise<{ blob, mime, duration }>
 */
export async function startRecording({ echoCancellation = false } = {}) {
  // Sin filtros de voz: para cantar una melodía se escucha más natural.
  // Con echoCancellation (grabar sobre una instrumental sin audífonos) el iPhone resta el beat del micrófono.
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation, noiseSuppression: false, autoGainControl: false },
  });
  const mime = pickMime();
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const started = new Promise((resolve) => {
    rec.onstart = () => resolve();
    setTimeout(resolve, 1500); // por si el evento no llega
  });

  // Medidor de volumen (opcional: si falla, se graba igual).
  let ctx = null;
  let analyser = null;
  let data = null;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    ctx.resume?.();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    data = new Uint8Array(analyser.fftSize);
  } catch { analyser = null; }

  const t0 = performance.now();
  rec.start(1000);

  const release = () => {
    stream.getTracks().forEach((t) => t.stop()); // apaga el indicador del micrófono
    ctx?.close?.().catch(() => {});
  };

  return {
    started, // se cumple cuando la grabación realmente empezó
    elapsed: () => (performance.now() - t0) / 1000,
    level() {
      if (!analyser) return 0;
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) { const x = (v - 128) / 128; sum += x * x; }
      return Math.min(1, Math.sqrt(sum / data.length) * 4);
    },
    stop() {
      const duration = (performance.now() - t0) / 1000;
      return new Promise((resolve) => {
        rec.onstop = () => {
          release();
          const type = rec.mimeType || mime || 'audio/mp4';
          resolve({ blob: new Blob(chunks, { type }), mime: type, duration });
        };
        if (rec.state !== 'inactive') rec.stop(); else rec.onstop();
      });
    },
    cancel() {
      rec.onstop = release;
      if (rec.state !== 'inactive') rec.stop(); else release();
    },
  };
}
