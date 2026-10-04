// src/world/fieldMudSurface.ts — the adobe field walls' own mud print (the scenery lane, 2026-10-03; gauntlet wave 20
// read the mud walls as "smooth pillow- and pipe-shaped walls instead of eroded mud brick").
//
// A mud-brick wall is laid in courses of sun-dried bricks and rendered with a coat of mud and straw; the rain and the
// splash wear the render off in patches, most at the crown and the foot, and show the courses under it. One tile is
// one wall module (3 m along, 3 m round its section, inhabitKit ADOBE_UV_PER_M): the render (a warm mud, trowel-
// smoothed, with straw flecks and the rain's streaks down from the crown) broken in irregular
// patches where the bricks show (32 courses of 9 cm, ten bricks of 30 cm a course, half-bond, worn round, their mud
// mortar recessed), the render's broken lip lit along each patch. The painter is seamless (periodic noise; every
// course and brick ends on the tile edge). Its palette is a warm mud under the map's plaster tone (props.ts applies it).
//
// Pure: no DOM and no three.js. Buffers out; props.ts makes the textures, the receipt reads the buffers.

export interface FieldMudBuffers {
  size: number;
  /** sRGB albedo, RGBA8. */
  px: Uint8ClampedArray;
  /** Relief 0..1 (render high, brick faces lower, mortar lowest). */
  hgt: Float32Array;
  /** 1 where the render is off and the bricks show, 0 on render: the receipt's evidence. */
  loss: Uint8Array;
}

export interface FieldMudSlice { fine: true; stage: string }

/** Courses and bricks a tile (one tile is 3 m: 9.4 cm courses, 30 cm bricks). */
const COURSES = 32, BRICKS = 10;
/** The section's arc in tile units where the two feet and the crown lie (a 1 m wall, 0.52 m thick, 3 m a tile). */
const FOOT_A = 0.0, CROWN = 0.42, FOOT_B = 0.84;
/**
 * The band of the tile past the section's arc that no wall face reads: plain render, no loss, for the mud washed off
 * the wall (the apron and its lumps sample it).
 */
export const FIELD_MUD_PLAIN_V: readonly [number, number] = [0.89, 0.99];

function hash(a: number, b: number, seed: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x2545f491);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Periodic value noise in [0, 1] over the unit tile, `cells` lattice cells a tile along u (`cellsV` along v). */
function pnoise(u: number, v: number, cells: number, seed: number, cellsV = cells): number {
  const fx = u * cells, fy = v * cellsV;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = fx - x0, ty = fy - y0;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const i0 = ((x0 % cells) + cells) % cells, j0 = ((y0 % cellsV) + cellsV) % cellsV;
  const i1 = (i0 + 1) % cells, j1 = (j0 + 1) % cellsV;
  const a = hash(i0, j0, seed), b = hash(i1, j0, seed), c = hash(i0, j1, seed), d = hash(i1, j1, seed);
  const top = a + (b - a) * sx;
  return top + (c + (d - c) * sx - top) * sy;
}

/** A periodic fractal field precomputed on a res x res grid and read bilinearly (wrapped); `aspect` stretches it along v. */
function periodicField(res: number, cells: number, octaves: number, seed: number, aspect = 1): (u: number, v: number) => number {
  const grid = new Float32Array(res * res);
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
    let value = 0, amp = 1, total = 0, c = cells;
    for (let o = 0; o < octaves; o++) {
      value += pnoise(i / res, j / res, c, seed + o * 31, Math.max(1, Math.round(c / aspect))) * amp;
      total += amp; amp *= 0.5; c *= 2;
    }
    grid[j * res + i] = value / total;
  }
  return (u: number, v: number) => {
    const fx = u * res, fy = v * res;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const i0 = ((x0 % res) + res) % res, j0 = ((y0 % res) + res) % res, i1 = (i0 + 1) % res, j1 = (j0 + 1) % res;
    const a = grid[j0 * res + i0], b = grid[j0 * res + i1], c = grid[j1 * res + i0], d = grid[j1 * res + i1];
    return a + (b - a) * tx + (c - a + (a - b - c + d) * tx) * ty;
  };
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, v: number) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

function hslToRgb(h: number, s: number, l: number, out: Float32Array): void {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const channel = (t: number) => {
    t = ((t % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 0.5) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  out[0] = channel(h + 1 / 3); out[1] = channel(h); out[2] = channel(h - 1 / 3);
}

/** How far the render is worn where: most at the feet and the crown (the arc's v), least mid face. */
function wearAt(v: number): number {
  const d = (a: number) => { const t = Math.abs(v - a); return Math.min(t, 1 - t); };
  return Math.max(0.85 * Math.exp(-((d(FOOT_A) / 0.07) ** 2)), 0.85 * Math.exp(-((d(FOOT_B) / 0.07) ** 2)), 1.25 * Math.exp(-((d(CROWN) / 0.06) ** 2)));
}

/** Paint the mud print (`size` px square; 512 on desktop, 256 on phones). Deterministic; sixteen rows a slice. */
export function* paintFieldMudBuffers(size = 512, seed = 0xad0b3):
  Generator<FieldMudSlice, FieldMudBuffers, void> {
  const px = new Uint8ClampedArray(size * size * 4), hgt = new Float32Array(size * size), loss = new Uint8Array(size * size);
  const k = size / 512;
  const patchF = periodicField(128, 7, 3, seed + 3), edgeF = periodicField(256, 40, 1, seed + 5);
  const n1F = periodicField(128, 22, 2, seed + 7), n2F = periodicField(256, 70, 1, seed + 11);
  const stainF = periodicField(64, 4, 2, seed + 13), streakF = periodicField(256, 34, 1, seed + 17, 8);
  const brickF = periodicField(256, 60, 1, seed + 23);
  const rgb = new Float32Array(3);
  const courseH = size / COURSES, brickW = size / BRICKS, mortar = 1.6 * k;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x, j4 = i * 4;
      const u = (x + 0.5) / size, v = (y + 0.5) / size;
      // the render's loss: irregular patches, most where the wall wears most
      const patch = patchF(u, v) + (edgeF(u, v) - 0.5) * 0.08 + wearAt(v) * 0.22;
      const plain = v > FIELD_MUD_PLAIN_V[0] - 0.005 && v < FIELD_MUD_PLAIN_V[1] + 0.005;
      const off = !plain && patch > 0.66;
      const lipD = patch - 0.66; // signed distance-ish to the render's broken edge
      const n1 = n1F(u, v), n2 = n2F(u, v), grain = hash(x, y, seed + 29);
      if (off) {
        // the bricks: half bond, worn round, their mortar recessed
        const course = Math.floor(y / courseH), inY = y - course * courseH;
        const shift = (course % 2) * brickW * 0.5;
        const bx = ((x + shift) % size + size) % size, brick = Math.floor(bx / brickW), inX = bx - brick * brickW;
        const edge = Math.min(inY, courseH - inY, inX, brickW - inX) + (brickF(u, v) - 0.5) * 2.2 * k;
        const joint = edge < mortar;
        const tone = hash(brick, course, seed + 31);
        if (joint) {
          hslToRgb(0.076, 0.22, 0.33 + grain * 0.04, rgb);
          hgt[i] = 0.12 + grain * 0.04;
        } else {
          const bevel = smooth(mortar, mortar + 3.5 * k, edge);
          // sun-dried mud bricks: the render's own earth a little darker and browner, each brick its own batch
          hslToRgb(0.07 + tone * 0.01, 0.24 + tone * 0.05, (0.41 + tone * 0.08 + n2 * 0.05) * (0.88 + bevel * 0.12), rgb);
          hgt[i] = 0.32 + bevel * 0.14 + n2 * 0.06;
        }
        // just inside the lip, the render's broken edge casts a little shadow onto the bricks
        if (lipD < 0.025) { const s = 1 - lipD / 0.025; rgb[0] *= 1 - s * 0.18; rgb[1] *= 1 - s * 0.18; rgb[2] *= 1 - s * 0.18; }
        loss[i] = 1;
      } else {
        // the render: a warm mud, trowel-smoothed, stained, streaked down from the crown, flecked with straw
        const stain = smooth(0.55, 0.9, stainF(u, v));
        const below = Math.min(Math.abs(v - CROWN), 1) ; // the streaks run away from the crown down both faces
        const streak = smooth(0.62, 0.9, streakF(u, v)) * smooth(0.3, 0.02, below);
        const straw = grain > 0.994 ? 1 : 0;
        let l = 0.5 + n1 * 0.07 + n2 * 0.03 - stain * 0.09 - streak * 0.07 + straw * 0.12;
        // the render's broken lip catches the light just outside a patch (never in the plain band)
        const lip = !plain && lipD > -0.02 ? 1 + lipD / 0.02 : 0;
        l += lip * 0.04;
        hslToRgb(0.074 + n1 * 0.008, 0.3 - stain * 0.06 - straw * 0.1, l, rgb);
        hgt[i] = clamp01(0.62 + n1 * 0.1 + n2 * 0.05 + lip * 0.05);
      }
      px[j4] = clamp01(rgb[0]) * 255; px[j4 + 1] = clamp01(rgb[1]) * 255; px[j4 + 2] = clamp01(rgb[2]) * 255; px[j4 + 3] = 255;
    }
    if ((y & 15) === 15) yield { fine: true, stage: `field-mud-rows-${y + 1}` };
  }
  return { size, px, hgt, loss };
}
