// src/world/fieldStoneSurface.ts — the dry-stone field walls' own stone print (the scenery lane, 2026-10-03).
//
// The field walls' stones are geometry: maps/inhabitKit.ts dryStoneModule lays face stones in rough courses on a
// hearting, each stone with its corners knocked back and a window of this print of its own. The wave-20 print painted
// rubble (a power diagram of stones between dark dry joints) and on those stones it read as a second wall: wave 34 saw
// "stamped flagstone with dark outlines", four or five printed stones on every stone. So the print is now two bands:
//
//   - the face band (v in FIELD_STONE_FACE_V): one stone's skin and nothing else — no joint anywhere. A fieldstone's
//     colour drifting in soft patches about a stone across (so each stone's window reads as a stone of its own: the
//     stone print's colour law per patch), its grain and mineral specks, a mottle, the rain's faint streaks down it,
//     the odd pit, crustose lichen on some patches; a low relief (the normal map's roughness, not domes);
//   - the hearting band (v in FIELD_STONE_HEARTING_V): the wall's core where it shows between the face stones — small
//     packing stones and dark voids. The core maps the band once over its whole height (maps/inhabitKit.ts), so the
//     band is painted squashed: HEARTING_SQUASH times shorter than it shows.
//
// Every piece in the field walls' bucket samples the face band in a window that fits inside it (inhabitKit roughStone,
// fieldWallDressing fieldStone and the snow load, props.ts jitterFieldStoneUV); only the core reads the hearting band.
// The face band's mean colour stays the stone print's (the receipt pins it within 4 %), so a map's stone tone and
// masonry tint keep giving its walls their colour; liftFieldStoneMean keeps a dark tone from blacking them out.
//
// Pure: no DOM and no three.js. Buffers out; props.ts makes the textures, the receipt reads the buffers.

export interface FieldStoneBuffers {
  size: number;
  /** sRGB albedo, RGBA8. */
  px: Uint8ClampedArray;
  /** Relief 0..1 for the normal map and the packed AO/roughness map. */
  hgt: Float32Array;
  /** 1 on a void of the hearting band (between its packing stones), 0 elsewhere: the receipt's evidence. */
  joint: Uint8Array;
}

export interface FieldStoneSlice { fine: true; stage: string }

/** The face band's usable windows (v): a stone's window lies inside it, clear of the hearting band and its mips. */
export const FIELD_STONE_FACE_V: readonly [number, number] = [0.03, 0.81];
/** The hearting band (v) the core maps over its height, with a margin inside the painted band [0.86, 1). */
export const FIELD_STONE_HEARTING_V: readonly [number, number] = [0.885, 0.985];
/** Where the painted hearting band starts (v); the face band's skin is painted below it. */
const HEARTING_PAINT_V0 = 0.86;
/** The core's height in tiles over the band's height (a 0.92 m hearting at 1.2 tiles a metre over 0.1 of a tile). */
const HEARTING_SQUASH = (0.92 * 1.2) / (FIELD_STONE_HEARTING_V[1] - FIELD_STONE_HEARTING_V[0]);
/** Stone lightness base (HSL): set so the face band's mean is the stone print's (the receipt pins it within 4 %). */
export const FIELD_STONE_L0 = 0.29;

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

/** HSL to sRGB 0..1 (the stone print's colour law is written in HSL). */
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

/**
 * Paint the print (`size` px square; 512 on desktop, 256 on phones: the same stones at half the texels). Deterministic
 * for a seed; sixteen rows per slice.
 */
export function* paintFieldStoneBuffers(size = 512, seed = 0xf1e1d):
  Generator<FieldStoneSlice, FieldStoneBuffers, void> {
  const px = new Uint8ClampedArray(size * size * 4), hgt = new Float32Array(size * size), joint = new Uint8Array(size * size);
  // the tone fields: a stone's tone, the odd greyer stone of another kind, the odd iron-stained one, lichen's patches
  const toneF = periodicField(64, 4, 2, seed + 11), coolF = periodicField(64, 3, 2, seed + 13);
  const warmF = periodicField(64, 3, 2, seed + 14), lichenPatchF = periodicField(64, 4, 1, seed + 15);
  const grime = periodicField(64, 3, 3, seed + 17), lichenF = periodicField(128, 16, 2, seed + 19);
  const grainF = periodicField(256, 64, 2, seed + 23), mottleF = periodicField(128, 14, 2, seed + 25);
  const bedF = periodicField(256, 6, 1, seed + 27, 1 / 14), pitF = periodicField(256, 90, 1, seed + 29);
  const crustF = periodicField(256, 44, 2, seed + 31);
  // the hearting's packing stones: a wrapped lattice in the core's true (unsquashed) space, about 5 cm stones
  const HC = 16, HR = Math.round(16 * (0.92 * 1.2)); // cells along u, cells up the core's 1.1 tiles
  const rgb = new Float32Array(3);
  for (let y = 0; y < size; y++) {
    const v0 = (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const i = y * size + x, j4 = i * 4;
      const u0 = (x + 0.5) / size;
      const grain = grainF(u0, v0) * 0.7 + hash(x, y, seed + 41) * 0.3;
      if (v0 >= HEARTING_PAINT_V0) {
        // the hearting band: packing stones and voids in the core's true space (v up the core, HEARTING_SQUASH taller)
        const vt = (v0 - FIELD_STONE_HEARTING_V[0]) * HEARTING_SQUASH;
        const cu = u0 * HC, cv = vt * (HR / (0.92 * 1.2));
        const ci = Math.floor(cu), cj = Math.floor(cv);
        let d1 = Infinity, d2 = Infinity, a = 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          const ii = ci + di, jj = cj + dj, wi = ((ii % HC) + HC) % HC;
          const qx = ii + 0.5 + (hash(wi, jj, seed + 51) - 0.5) * 0.8, qy = jj + 0.5 + (hash(wi, jj, seed + 52) - 0.5) * 0.7;
          const ddx = cu - qx, ddy = (cv - qy) * 1.4;
          const d = ddx * ddx + ddy * ddy;
          if (d < d1) { d2 = d1; d1 = d; a = wi * 4096 + (jj & 4095); } else if (d < d2) d2 = d;
        }
        const gap = Math.sqrt(d2) - Math.sqrt(d1); // about twice the distance to the cell's border, in cells
        const t = hash(a, 7, seed + 53);
        if (gap < 0.16 + t * 0.12) {
          // a void between the packing stones: deep shadow, a little earth in it
          hslToRgb(0.075, 0.1, 0.11 + gap * 0.08 + grain * 0.03, rgb);
          hgt[i] = 0.02 + gap * 0.1;
          joint[i] = 1;
        } else {
          const crown = smooth(0.16, 0.8, gap);
          hslToRgb(0.08 + t * 0.015, 0.07 + t * 0.04, (0.21 + t * 0.11 + grain * 0.04) * (0.75 + crown * 0.25), rgb);
          hgt[i] = 0.2 + crown * 0.25 + grain * 0.05;
        }
      } else {
        // the face band: one stone's skin, its tone drifting smoothly about a stone across (no border anywhere: a
        // stone's window lands on a tone of its own and a gentle drift across it)
        const t = smooth(0.25, 0.75, toneF(u0, v0));
        const isCool = smooth(0.62, 0.74, coolF(u0, v0)), isWarm = smooth(0.66, 0.78, warmF(u0, v0));
        const lichenAmt = smooth(0.55, 0.7, lichenPatchF(u0, v0));
        const g = smooth(0.5, 0.95, grime(u0, v0));
        const mottle = mottleF(u0, v0);
        // the bedding of a sedimentary stone: faint laminae along its bed (along u), on the stones that have them
        const bed = smooth(0.6, 0.9, bedF(u0, v0)) * smooth(0.45, 0.7, toneF(u0 + 0.37, v0 + 0.21));
        const pit = smooth(0.84, 0.9, pitF(u0, v0));
        const speck = hash(x, y, seed + 43);
        const sat = (0.07 + t * 0.055 - g * 0.02) * (1 - isCool * 0.55) + isWarm * 0.07;
        let light = (FIELD_STONE_L0 + t * 0.2 + (grain - 0.5) * 0.11) * (0.92 + mottle * 0.16) - g * 0.06 - bed * 0.04 - pit * 0.03;
        light *= speck > 0.986 ? 0.82 : speck > 0.975 ? 1.1 : 1; // mineral grains, dark and bright
        hslToRgb(0.081 + t * 0.014 + isCool * 0.02 - isWarm * 0.015, sat, light, rgb);
        // (rosettes a few centimetres across, clustered where the stone has lichen, ragged at their edges)
        const lichen = lichenAmt * smooth(0.6, 0.7, lichenF(u0, v0) * 0.75 + crustF(u0, v0) * 0.25);
        if (lichen > 0) {
          // crustose lichen: pale grey-green blooms over the stone (the odd one orange on an iron-stained stone)
          const lr = isWarm > 0.5 ? 0.62 : 0.57, lg = isWarm > 0.5 ? 0.47 : 0.59, lb = isWarm > 0.5 ? 0.27 : 0.49;
          rgb[0] += (lr - rgb[0]) * lichen * 0.5; rgb[1] += (lg - rgb[1]) * lichen * 0.5; rgb[2] += (lb - rgb[2]) * lichen * 0.5;
        }
        // a stone's skin: a gentle relief, its pits low, its lichen a little proud
        hgt[i] = clamp01(0.55 + (mottle - 0.5) * 0.3 + (grain - 0.5) * 0.25 - pit * 0.18 + lichen * 0.04);
      }
      px[j4] = clamp01(rgb[0]) * 255; px[j4 + 1] = clamp01(rgb[1]) * 255; px[j4 + 2] = clamp01(rgb[2]) * 255; px[j4 + 3] = 255;
    }
    if ((y & 15) === 15) yield { fine: true, stage: `field-stone-rows-${y + 1}` };
  }
  return { size, px, hgt, joint };
}

/**
 * Wave 34 (Verdant's village wall: "a flat, textureless matte-black mass"): a map's stone tone can darken the print
 * past any fieldstone (Verdant's x0.76 left the face band's mean at sRGB lightness 0.27, and a face in shade at a
 * fortieth of white). Lift the toned print, every texel by one factor in linear light (its hues and its contrast kept),
 * until the face band's mean luminance is at least `floor` (sRGB); a lighter print is left as it is. Returns the factor.
 */
export function liftFieldStoneMean(px: Uint8ClampedArray, size: number, floor = 0.36): number {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const enc = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
  const rows = Math.floor(HEARTING_PAINT_V0 * size);
  let y = 0;
  for (let i = 0; i < rows * size * 4; i += 4) y += 0.2126 * lin(px[i] / 255) + 0.7152 * lin(px[i + 1] / 255) + 0.0722 * lin(px[i + 2] / 255);
  y /= rows * size;
  const want = lin(floor);
  if (!(y > 0) || y >= want) return 1;
  const k = want / y;
  for (let i = 0; i < px.length; i += 4) {
    for (let c = 0; c < 3; c++) px[i + c] = Math.min(255, enc(Math.min(1, lin(px[i + c] / 255) * k)) * 255);
  }
  return k;
}
