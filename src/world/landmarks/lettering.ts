// src/world/landmarks/lettering.ts — painted and cut capitals for the set pieces' signs and inscriptions (the landmarks
// lane, 2026-10-06; gauntlet wave 154: the kolkhoz arch's banner carried "garbled, mirror-reversed pseudo-Cyrillic").
//
// A sign-writer's stroke alphabet on a grid four units wide and six high (the baseline at 0, the cap line at 6): Cyrillic
// and Latin capitals, digits, guillemets and the few marks a French or German inscription needs. Curves are cut at 45
// degrees, as a sign-writer's or a stonecutter's straight-edged letters are. A line of text lies on a face
// (maps/regional/geometry.ts Face) and reads left to right along the face's u as seen from outside it, so a sign
// lettered on both of its faces reads correctly from either side. Each stroke is one quad a few millimetres proud of the
// face: decor, no collision, two triangles.
import { facePoint, type EmitOptions, type Face, type PartSink, type RegionalBucket, type Rgb } from '../maps/regional/geometry.ts';

type Stroke = ReadonlyArray<readonly [number, number]>;
interface Glyph { readonly w: number; readonly s: readonly Stroke[] }
const g = (w: number, ...s: Stroke[]): Glyph => ({ w, s });

// the shared bowls and bars
const O_RING: Stroke = [[1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0]];
const C_ARC: Stroke = [[4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0], [3, 0], [4, 1]];
const P_BOWL: Stroke = [[0, 0], [0, 6], [3, 6], [4, 5], [4, 3.8], [3, 2.8], [0, 2.8]];
const B_UPPER: Stroke = [[0, 0], [0, 6], [3, 6], [3.8, 5.2], [3.8, 4], [3, 3.2], [0, 3.2]];
const B_LOWER: Stroke = [[3, 3.2], [4, 2.4], [4, 0.8], [3.2, 0], [0, 0]];

const GLYPHS: Readonly<Record<string, Glyph>> = Object.freeze({
  ' ': g(2.4),
  // ------------------------------------------------------------------------------------------------ Latin
  A: g(4, [[0, 0], [2, 6], [4, 0]], [[0.7, 2], [3.3, 2]]),
  B: g(4, B_UPPER, B_LOWER),
  C: g(4, C_ARC),
  D: g(4, [[0, 0], [0, 6], [2.6, 6], [4, 4.6], [4, 1.4], [2.6, 0], [0, 0]]),
  E: g(4, [[4, 6], [0, 6], [0, 0], [4, 0]], [[0, 3], [3, 3]]),
  F: g(4, [[4, 6], [0, 6], [0, 0]], [[0, 3], [3, 3]]),
  G: g(4, [[4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0], [3, 0], [4, 1], [4, 2.8], [2.2, 2.8]]),
  H: g(4, [[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]),
  I: g(1, [[0.5, 0], [0.5, 6]]),
  J: g(4, [[4, 6], [4, 1], [3, 0], [1, 0], [0, 1]]),
  K: g(4, [[0, 0], [0, 6]], [[4, 6], [0, 2.6]], [[1.4, 3.8], [4, 0]]),
  L: g(4, [[0, 6], [0, 0], [4, 0]]),
  M: g(4.4, [[0, 0], [0, 6], [2.2, 2.4], [4.4, 6], [4.4, 0]]),
  N: g(4, [[0, 0], [0, 6], [4, 0], [4, 6]]),
  O: g(4, O_RING),
  P: g(4, P_BOWL),
  Q: g(4, O_RING, [[2.6, 1.4], [4.2, -0.2]]),
  R: g(4, P_BOWL, [[1.8, 2.8], [4, 0]]),
  S: g(4, [[4, 5], [3, 6], [1, 6], [0, 5], [0, 4], [1, 3], [3, 3], [4, 2], [4, 1], [3, 0], [1, 0], [0, 1]]),
  T: g(4, [[0, 6], [4, 6]], [[2, 6], [2, 0]]),
  U: g(4, [[0, 6], [0, 1], [1, 0], [3, 0], [4, 1], [4, 6]]),
  V: g(4, [[0, 6], [2, 0], [4, 6]]),
  W: g(5, [[0, 6], [1.2, 0], [2.5, 4], [3.8, 0], [5, 6]]),
  X: g(4, [[0, 0], [4, 6]], [[0, 6], [4, 0]]),
  Y: g(4, [[0, 6], [2, 3], [4, 6]], [[2, 3], [2, 0]]),
  Z: g(4, [[0, 6], [4, 6], [0, 0], [4, 0]]),
  // ------------------------------------------------------------------------------------------------ Cyrillic
  'А': g(4, [[0, 0], [2, 6], [4, 0]], [[0.7, 2], [3.3, 2]]),
  'Б': g(4, [[4, 6], [0, 6], [0, 0], [3, 0], [4, 1], [4, 2.5], [3, 3.5], [0, 3.5]]),
  'В': g(4, B_UPPER, B_LOWER),
  'Г': g(4, [[0, 0], [0, 6], [4, 6]]),
  'Д': g(4.6, [[0, -0.9], [0, 0], [4.6, 0], [4.6, -0.9]], [[0.6, 0], [1.4, 6], [3.8, 6], [3.8, 0]]),
  'Е': g(4, [[4, 6], [0, 6], [0, 0], [4, 0]], [[0, 3], [3, 3]]),
  'Ж': g(5, [[0, 0], [2.5, 3], [0, 6]], [[5, 0], [2.5, 3], [5, 6]], [[2.5, 0], [2.5, 6]]),
  'З': g(4, [[0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3], [1.5, 3]], [[3, 3], [4, 2], [4, 1], [3, 0], [1, 0], [0, 1]]),
  'И': g(4, [[0, 6], [0, 0], [4, 6], [4, 0]]),
  'К': g(4, [[0, 0], [0, 6]], [[4, 6], [0, 2.6]], [[1.4, 3.8], [4, 0]]),
  'Л': g(4, [[0, 0], [0.8, 0.8], [1.4, 6], [4, 6], [4, 0]]),
  'М': g(4.4, [[0, 0], [0, 6], [2.2, 2.4], [4.4, 6], [4.4, 0]]),
  'Н': g(4, [[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]),
  'О': g(4, O_RING),
  'П': g(4, [[0, 0], [0, 6], [4, 6], [4, 0]]),
  'Р': g(4, P_BOWL),
  'С': g(4, C_ARC),
  'Т': g(4, [[0, 6], [4, 6]], [[2, 6], [2, 0]]),
  'У': g(4, [[0, 6], [2, 2.6]], [[4, 6], [1, 0]]),
  'Ф': g(4.4, [[2.2, 0], [2.2, 6]], [[1, 1.5], [3.4, 1.5], [4.4, 2.5], [4.4, 3.5], [3.4, 4.5], [1, 4.5], [0, 3.5], [0, 2.5], [1, 1.5]]),
  'Х': g(4, [[0, 0], [4, 6]], [[0, 6], [4, 0]]),
  'Ц': g(4.6, [[0, 6], [0, 0], [4.6, 0], [4.6, -0.9]], [[4, 0], [4, 6]]),
  'Ч': g(4, [[0, 6], [0, 3.6], [1, 2.6], [4, 2.6]], [[4, 6], [4, 0]]),
  'Ш': g(4.6, [[0, 6], [0, 0], [4.6, 0], [4.6, 6]], [[2.3, 0], [2.3, 6]]),
  'Щ': g(5.2, [[0, 6], [0, 0], [5.2, 0], [5.2, -0.9]], [[4.6, 0], [4.6, 6]], [[2.3, 0], [2.3, 6]]),
  'Ъ': g(4.4, [[0, 6], [1.2, 6], [1.2, 0], [3.6, 0], [4.4, 0.8], [4.4, 2.4], [3.6, 3.2], [1.2, 3.2]]),
  'Ы': g(4.8, [[0, 6], [0, 0], [1.8, 0], [2.6, 0.8], [2.6, 2.4], [1.8, 3.2], [0, 3.2]], [[4.8, 0], [4.8, 6]]),
  'Ь': g(4, [[0, 6], [0, 0], [3, 0], [4, 1], [4, 2.4], [3, 3.4], [0, 3.4]]),
  'Э': g(4, [[0, 5], [1, 6], [3, 6], [4, 5], [4, 1], [3, 0], [1, 0], [0, 1]], [[1.5, 3], [4, 3]]),
  'Ю': g(5, [[0, 0], [0, 6]], [[0, 3], [1.4, 3]], [[2.2, 0], [4.2, 0], [5, 0.8], [5, 5.2], [4.2, 6], [2.2, 6], [1.4, 5.2], [1.4, 0.8], [2.2, 0]]),
  'Я': g(4, [[4, 0], [4, 6], [1, 6], [0, 5], [0, 3.8], [1, 2.8], [4, 2.8]], [[1.8, 2.8], [0, 0]]),
  // ------------------------------------------------------------------------------------------------ digits
  '0': g(3.4, [[1, 0], [2.4, 0], [3.4, 1], [3.4, 5], [2.4, 6], [1, 6], [0, 5], [0, 1], [1, 0]]),
  '1': g(3, [[0.4, 4.8], [1.8, 6], [1.8, 0]], [[0.4, 0], [3, 0]]),
  '2': g(3.4, [[0, 5], [1, 6], [2.4, 6], [3.4, 5], [3.4, 3.8], [0, 0], [3.4, 0]]),
  '3': g(3.4, [[0, 5], [1, 6], [2.4, 6], [3.4, 5], [3.4, 4], [2.4, 3], [1.2, 3]], [[2.4, 3], [3.4, 2], [3.4, 1], [2.4, 0], [1, 0], [0, 1]]),
  '4': g(3.4, [[2.6, 0], [2.6, 6], [0, 1.8], [3.4, 1.8]]),
  '5': g(3.4, [[3.4, 6], [0, 6], [0, 3.4], [2.4, 3.4], [3.4, 2.4], [3.4, 1], [2.4, 0], [1, 0], [0, 1]]),
  '6': g(3.4, [[3.2, 5.4], [2.4, 6], [1, 6], [0, 5], [0, 1], [1, 0], [2.4, 0], [3.4, 1], [3.4, 2.4], [2.4, 3.4], [0, 3.4]]),
  '7': g(3.4, [[0, 6], [3.4, 6], [1.2, 0]]),
  '8': g(3.4, [[1, 3], [0, 4], [0, 5], [1, 6], [2.4, 6], [3.4, 5], [3.4, 4], [2.4, 3], [1, 3], [0, 2], [0, 1], [1, 0], [2.4, 0], [3.4, 1], [3.4, 2], [2.4, 3]]),
  '9': g(3.4, [[0.2, 0.6], [1, 0], [2.4, 0], [3.4, 1], [3.4, 5], [2.4, 6], [1, 6], [0, 5], [0, 3.6], [1, 2.6], [3.4, 2.6]]),
  // ------------------------------------------------------------------------------------------------ marks
  '«': g(3, [[1.4, 4.4], [0.2, 3], [1.4, 1.6]], [[2.8, 4.4], [1.6, 3], [2.8, 1.6]]),
  '»': g(3, [[0.2, 4.4], [1.4, 3], [0.2, 1.6]], [[1.6, 4.4], [2.8, 3], [1.6, 1.6]]),
  '.': g(1, [[0.5, 0], [0.5, 0.55]]),
  ',': g(1, [[0.6, 0.55], [0.2, -0.8]]),
  ':': g(1, [[0.5, 1], [0.5, 1.55]], [[0.5, 4], [0.5, 4.55]]),
  '-': g(2.6, [[0.3, 3], [2.3, 3]]),
  '–': g(3.6, [[0.3, 3], [3.3, 3]]),
  '!': g(1, [[0.5, 6], [0.5, 1.8]], [[0.5, 0], [0.5, 0.55]]),
  '\'': g(1, [[0.5, 6], [0.5, 4.8]]),
  '"': g(1.8, [[0.4, 6], [0.4, 4.8]], [[1.4, 6], [1.4, 4.8]]),
  '/': g(3, [[0, 0], [3, 6]]),
  '(': g(1.6, [[1.4, 6.6], [0.4, 5], [0.4, 1], [1.4, -0.6]]),
  ')': g(1.6, [[0.2, 6.6], [1.2, 5], [1.2, 1], [0.2, -0.6]]),
  '№': g(6, [[0, 0], [0, 6], [3.4, 0], [3.4, 6]], [[4.2, 3.4], [4.2, 5.2], [5.8, 5.2], [5.8, 3.4], [4.2, 3.4]], [[4.2, 2.4], [5.8, 2.4]]),
  '+': g(3.4, [[0.2, 3], [3.2, 3]], [[1.7, 1.5], [1.7, 4.5]]),
  '*': g(3.4, [[1.7, 6], [1.7, 3]], [[0.4, 5.3], [3, 3.7]], [[0.4, 3.7], [3, 5.3]]),
});

/** The marks a letter carries over (or under) its base glyph, centred on it: Й, Ё and a French or German inscription's. */
const MARKS: Readonly<Record<string, readonly Stroke[]>> = Object.freeze({
  breve: [[[-0.8, 7.2], [0, 6.8], [0.8, 7.2]]],
  diaeresis: [[[-0.8, 6.9], [-0.8, 7.4]], [[0.8, 6.9], [0.8, 7.4]]],
  acute: [[[-0.4, 6.7], [0.4, 7.4]]],
  grave: [[[-0.4, 7.4], [0.4, 6.7]]],
  circumflex: [[[-0.8, 6.8], [0, 7.4], [0.8, 6.8]]],
  cedilla: [[[0, 0], [0, -0.8]]],
});
const COMPOSED: Readonly<Record<string, readonly [string, keyof typeof MARKS]>> = Object.freeze({
  'Й': ['И', 'breve'], 'Ё': ['Е', 'diaeresis'],
  'À': ['A', 'grave'], 'Â': ['A', 'circumflex'], 'Ä': ['A', 'diaeresis'], 'Ç': ['C', 'cedilla'],
  'É': ['E', 'acute'], 'È': ['E', 'grave'], 'Ê': ['E', 'circumflex'], 'Ë': ['E', 'diaeresis'],
  'Î': ['I', 'circumflex'], 'Ï': ['I', 'diaeresis'], 'Ô': ['O', 'circumflex'], 'Ö': ['O', 'diaeresis'],
  'Ù': ['U', 'grave'], 'Û': ['U', 'circumflex'], 'Ü': ['U', 'diaeresis'],
});

function glyphFor(ch: string): Glyph {
  const up = ch.toUpperCase();
  const direct = GLYPHS[up];
  if (direct) return direct;
  const composed = COMPOSED[up];
  if (composed) {
    const base = GLYPHS[composed[0]];
    const mid = base.w / 2;
    return { w: base.w, s: [...base.s, ...MARKS[composed[1]].map((stroke) => stroke.map(([u, v]) => [u + mid, v] as const))] };
  }
  return GLYPHS[' '];
}

/** How a line of text is cut or painted. */
export interface TextStyle {
  /** the capitals' height (m) */
  capHeight: number;
  /** the widest the line may run (m): a longer line is set smaller */
  maxWidth?: number;
  /** the gap between letters, in grid units (default 1.4; a word space is 2.4 more) */
  tracking?: number;
  /** the stroke's width, in grid units (default 0.62) */
  weight?: number;
  /** how far proud of the face the strokes lie (m; default 4 mm) */
  proud?: number;
  /** vertex colour in a coloured bucket (paint), else the bucket's own surface (a cut inscription's dark fill) */
  colour?: Rgb;
  fine?: boolean;
}

/** The set width (m) of a line at a cap height, and the grid unit (m) it was set at, after `maxWidth`. */
export function measureText(text: string, style: TextStyle): { width: number; unit: number } {
  const tracking = style.tracking ?? 1.4;
  let units = 0;
  const chars = [...text];
  chars.forEach((ch, i) => { units += glyphFor(ch).w + (i < chars.length - 1 ? tracking : 0); });
  let unit = style.capHeight / 6;
  if (style.maxWidth && units * unit > style.maxWidth) unit = style.maxWidth / units;
  return { width: units * unit, unit };
}

/**
 * Letter one line of text on a face, centred on `u` with its baseline at `y`, reading left to right along the face's u
 * as seen from outside it. Returns the set width and cap height.
 */
export function letterText(sink: PartSink, bucket: RegionalBucket, face: Face, text: string, u: number, y: number, style: TextStyle): { width: number; capHeight: number } {
  const { width, unit } = measureText(text, style);
  const tracking = style.tracking ?? 1.4, half = (style.weight ?? 0.62) * unit / 2, proud = style.proud ?? 0.004;
  const opts: EmitOptions = { decor: true, ...(style.colour ? { colour: style.colour } : {}), ...(style.fine ? { fine: true } : {}) };
  let pen = u - width / 2;
  for (const ch of text) {
    const glyph = glyphFor(ch);
    for (const stroke of glyph.s) {
      for (let i = 0; i + 1 < stroke.length; i++) {
        const [a0, a1] = stroke[i], [b0, b1] = stroke[i + 1];
        const au = pen + a0 * unit, av = y + a1 * unit, bu = pen + b0 * unit, bv = y + b1 * unit;
        const len = Math.hypot(bu - au, bv - av);
        if (len < 1e-6) continue;
        // a square-capped bar: each end runs on by the half width, so the strokes of a letter meet without notches
        const du = (bu - au) / len, dv = (bv - av) / len, nu = -dv * half, nv = du * half;
        const su = au - du * half, sv = av - dv * half, eu = bu + du * half, ev = bv + dv * half;
        // counter-clockwise seen from outside (u to the right, y up): n is d turned a quarter counter-clockwise
        const corners: Array<[number, number]> = [[su - nu, sv - nv], [eu - nu, ev - nv], [eu + nu, ev + nv], [su + nu, sv + nv]];
        sink.polygon(bucket, corners.map(([cu, cv]) => facePoint(face, cu, cv, proud)), opts);
      }
    }
    pen += (glyph.w + tracking) * unit;
  }
  return { width, capHeight: unit * 6 };
}
