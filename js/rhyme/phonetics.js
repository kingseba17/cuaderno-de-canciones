// Motor fonético del español (pronunciación chilena / latinoamericana).
//
// 1. Separa la palabra en sílabas (diptongos, hiatos, grupos como "pr" o "bl").
// 2. Encuentra la sílaba y la vocal tónica según las reglas de acentuación.
// 3. Desde la vocal tónica arma dos "claves":
//    - consonante: todos los sonidos (con seseo, b=v, ll=y, h muda...)
//    - asonante: solo las vocales (sin la vocal débil de los diptongos)
// Dos palabras riman si comparten la clave.
//
// Este mismo archivo lo usan la app (en el iPhone) y los tests (en Node).

const VOWELS = 'aeiouáéíóúü';
const ACCENTED = 'áéíóú';
const PLAIN = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u' };
// Grupos de dos consonantes que no se separan: "pa-dre", "ha-blar".
const INSEPARABLE = new Set(['pr', 'br', 'tr', 'dr', 'cr', 'kr', 'gr', 'fr', 'pl', 'bl', 'cl', 'kl', 'gl', 'fl']);

/** Deja solo letras del español, en minúscula. */
export function cleanWord(word) {
  return String(word || '').toLowerCase().normalize('NFC').replace(/[^a-záéíóúüñ]/g, '');
}

/** Divide en unidades: vocales y consonantes (ch, ll, rr, qu, gu cuentan como una). */
function tokenize(w) {
  const units = [];
  for (let i = 0; i < w.length;) {
    const c = w[i];
    const two = w.slice(i, i + 2);
    const after = w[i + 2];
    if (two === 'ch' || two === 'll' || two === 'rr') {
      units.push({ t: two, i, v: false }); i += 2; continue;
    }
    if ((two === 'qu' || two === 'gu') && after && 'eéií'.includes(after)) {
      units.push({ t: two, i, v: false }); i += 2; continue; // la u no suena
    }
    if (c === 'y') {
      // "y" es vocal al final o antes de consonante (rey, hoy, muy); si no, es consonante (yo, playa).
      const next = w[i + 1];
      const isVowel = !next || !VOWELS.includes(next);
      units.push({ t: c, i, v: isVowel, strong: false, glide: isVowel });
      i += 1; continue;
    }
    if (VOWELS.includes(c)) {
      // a, e, o son fuertes; í, ú con tilde también (rompen el diptongo: dí-a, pa-ís).
      units.push({ t: c, i, v: true, strong: 'aeoáéóíú'.includes(c), acc: ACCENTED.includes(c) });
    } else {
      units.push({ t: c, i, v: false });
    }
    i += 1;
  }
  return units;
}

/** Elige la vocal que manda en un grupo vocálico (diptongo o triptongo). */
function nucleusIndex(units, group) {
  let weak = -1;
  for (let k = group.start; k <= group.end; k++) {
    if (units[k].acc) return k;
  }
  for (let k = group.start; k <= group.end; k++) {
    if (units[k].strong) return k;
    if (!units[k].glide) weak = k; // en "ui"/"iu" manda la segunda: cui-da, ciu-dad
  }
  return weak >= 0 ? weak : group.start;
}

/**
 * Separa en sílabas. Devuelve { word, units, syllables: [{ text, start, end, nucleus }] }
 * donde start/end son índices de unidades y nucleus la unidad de la vocal principal.
 */
export function syllabify(word) {
  const w = cleanWord(word);
  const units = tokenize(w);

  // Grupos vocálicos: vocales seguidas, cortando entre dos fuertes (hiato).
  const groups = [];
  for (let i = 0; i < units.length;) {
    if (!units[i].v) { i++; continue; }
    let j = i;
    while (j + 1 < units.length && units[j + 1].v && !(units[j].strong && units[j + 1].strong)) j++;
    groups.push({ start: i, end: j });
    i = j + 1;
  }
  if (!groups.length) {
    return { word: w, units, syllables: w ? [{ text: w, start: 0, end: units.length, nucleus: -1 }] : [] };
  }

  // Dónde corta cada sílaba según las consonantes entre dos grupos vocálicos.
  const cuts = [];
  for (let g = 0; g < groups.length - 1; g++) {
    const a = groups[g].end;
    const b = groups[g + 1].start;
    const n = b - a - 1;
    const pair = (x, y) => INSEPARABLE.has(units[x].t + units[y].t);
    let left; // cuántas consonantes se quedan en la sílaba de la izquierda
    if (n <= 1) left = 0;                                  // ca-sa, po-e-ta
    else if (n === 2) left = pair(a + 1, a + 2) ? 0 : 1;   // pa-dre / can-to
    else left = pair(b - 2, b - 1) ? n - 2 : n - 1;        // hom-bre, ins-tan-te, abs-trac-to
    cuts.push(a + 1 + left);
  }

  const syllables = [];
  let from = 0;
  [...cuts, units.length].forEach((to, k) => {
    syllables.push({
      text: units.slice(from, to).map((u) => u.t).join(''),
      start: from,
      end: to,
      nucleus: nucleusIndex(units, groups[k]),
    });
    from = to;
  });
  return { word: w, units, syllables };
}

/** Índice de la sílaba tónica. */
function tonicSyllable(w, syllables, units) {
  for (let k = 0; k < syllables.length; k++) {
    for (let u = syllables[k].start; u < syllables[k].end; u++) if (units[u].acc) return k;
  }
  const n = syllables.length;
  if (n === 1) return 0;
  // Terminada en diptongo sin tilde (cachai, estai, miau): en el habla chilena es aguda.
  if (/[aeo][iu]$/.test(w)) return n - 1;
  // Sin tilde: si termina en vocal, n o s es grave; si no, aguda. ("estoy", "reloj": agudas)
  return 'aeiouns'.includes(w[w.length - 1]) ? n - 2 : n - 1;
}

/** Pasa un trozo de palabra a sonidos, como se pronuncia en Chile. */
export function phonetic(text) {
  return text
    .replace(/ü/g, 'W')                       // la ü sí suena: pin-güi-no
    .replace(/[áéíóú]/g, (c) => PLAIN[c])
    .replace(/ch/g, 'C')
    .replace(/h/g, '')                        // h muda
    .replace(/ll/g, 'y')                      // ll = y
    .replace(/rr/g, 'R')
    .replace(/qu(?=[ei])/g, 'k')              // qu = k
    .replace(/gu(?=[ei])/g, 'G')              // gu(e,i) = g
    .replace(/c(?=[ei])/g, 's')               // seseo: ce, ci = se, si
    .replace(/g(?=[ei])/g, 'j')               // ge, gi = je, ji
    .replace(/G/g, 'g')
    .replace(/c/g, 'k')                       // ca, co, cu = k
    .replace(/z/g, 's')                       // seseo: z = s
    .replace(/v/g, 'b')                       // b = v
    .replace(/x/g, 'ks')
    .replace(/w/g, 'u')
    .replace(/W/g, 'u')
    .replace(/y(?![aeiou])/g, 'i');           // rey = rei
}

const TYPES = ['aguda', 'grave', 'esdrujula'];

/**
 * Analiza una palabra. Devuelve null si no tiene letras.
 * { word, syllables: ['co','ra','zón'], count, tonic, type, cons, aso }
 */
export function analyze(word) {
  const { word: w, units, syllables } = syllabify(word);
  if (!w || !syllables.length) return null;
  const count = syllables.length;
  const texts = syllables.map((s) => s.text);
  const hasVowel = syllables[0].nucleus >= 0;
  if (!hasVowel) return { word: w, syllables: texts, count, tonic: 0, type: 'aguda', cons: w, aso: '' };

  const tonic = tonicSyllable(w, syllables, units);
  const fromEnd = count - 1 - tonic;
  const type = TYPES[fromEnd] || 'sobresdrujula';
  let tonicUnit = syllables[tonic].nucleus;
  // La "y" final nunca es la tónica: en "muy" o "estoy" manda la vocal anterior.
  if (units[tonicUnit].glide) {
    for (let u = tonicUnit - 1; u >= syllables[tonic].start; u--) if (units[u].v) { tonicUnit = u; break; }
  }

  const cons = phonetic(w.slice(units[tonicUnit].i));
  const vowelOf = (u) => (u.t === 'y' ? 'i' : PLAIN[u.t] || u.t);
  const nuclei = syllables.slice(tonic).map((s, k) => vowelOf(units[k === 0 ? tonicUnit : s.nucleus]));
  // En esdrújulas no cuenta la vocal del medio: "lágrima" asuena con "casa" (a-a).
  const aso = fromEnd >= 2 ? nuclei[0] + nuclei[nuclei.length - 1] : nuclei.join('');

  return { word: w, syllables: texts, count, tonic, type, cons, aso };
}

export function countSyllables(word) {
  return analyze(word)?.count ?? 0;
}

/** 'consonante', 'asonante' o null. */
export function rhymeType(a, b) {
  const A = typeof a === 'string' ? analyze(a) : a;
  const B = typeof b === 'string' ? analyze(b) : b;
  if (!A || !B || !A.aso || !B.aso || A.word === B.word) return null;
  if (A.cons === B.cons && A.type === B.type) return 'consonante';
  if (A.aso === B.aso) return 'asonante';
  return null;
}

export const TYPE_LABELS = { aguda: 'aguda', grave: 'grave', esdrujula: 'esdrújula', sobresdrujula: 'sobresdrújula' };
