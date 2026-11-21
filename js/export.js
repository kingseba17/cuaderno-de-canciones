// Exportar letras (.txt / .md) y guardar archivos en el iPhone o el computador.

/** Letra limpia en el orden de la estructura (los coros repetidos se escriben completos). */
export function songToText(song, { chords = false, markdown = false } = {}) {
  const title = song.title.trim() || 'Sin título';
  const meta = [song.key, song.bpm && `${song.bpm} BPM`].filter(Boolean).join(' · ');
  const out = markdown ? [`# ${title}`] : [title];
  if (meta) out.push(markdown ? `\n*${meta}*` : meta);

  for (const item of song.structure) {
    const sec = song.sections.find((s) => s.id === item.sectionId);
    if (!sec) continue;
    const lines = sec.lines.filter((l) => l.text.trim() || (chords && l.chords?.trim()));
    if (!lines.length) continue;
    out.push('', markdown ? `## ${sec.name}` : `[${sec.name}]`);
    if (markdown && chords) out.push('```');
    for (const l of lines) {
      if (chords && l.chords?.trim()) out.push(l.chords.trim());
      if (l.text.trim()) out.push(markdown && !chords ? l.text.trim() + '  ' : l.text.trim());
    }
    if (markdown && chords) out.push('```');
  }
  return out.join('\n') + '\n';
}

export function hasChords(song) {
  return song.sections.some((s) => s.lines.some((l) => l.chords?.trim()));
}

export function fileSlug(text, fallback = 'cancion') {
  const slug = String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ñ/g, 'n').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return slug || fallback;
}

const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent)
  || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));

/**
 * Guarda un archivo. En el iPhone abre el menú Compartir (elige "Guardar en Archivos");
 * en el computador lo descarga. Devuelve 'shared' | 'downloaded' | 'cancelled'.
 */
export async function saveFile(blob, filename) {
  const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
  if (isIOS() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
      // otro error: probamos descargando
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
  return 'downloaded';
}
