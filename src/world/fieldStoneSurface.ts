// src/world/fieldStoneSurface.ts — the dry-stone field walls' own stone print (the scenery lane, 2026-10-03).
//
// A field wall is random rubble: unshaped fieldstones of every size bedded roughly flat, touching here and gaping
// there, no mortar and no courses. The props stone print (props.ts makeStone) is coursed blocks between mortar lines,
// and the regional kits' house prints are brick, concrete block or dressed stone (regionalSurfaces.ts). On the walls'
// rubble geometry (maps/inhabitKit.ts dryStoneModule) any of them reads as ashlar (gauntlet wave 20: "block walls laid
// out like a grid"), and a kit's brick lays brick courses over a fieldstone wall. So the walls get this print instead:
// a seamless power diagram of stones bedded flat (sites jittered on a wrapped lattice wider than it is tall, weights
// mixing pins with big stones, the joints warped by periodic noise), knocked round at the corners, where the joints
// are shadowed voids, three-stone corners open into dark pockets, some stones touch and some gape. Its palette is the
// stone print's own law (hue, saturation and lightness per stone, its mean pinned to the print's by the receipt), so a
// map's stone tone and masonry tint keep giving its walls the colour they had.
//
// Pure: no DOM and no three.js. Buffers out; props.ts makes the textures, the receipt reads the buffers.

export interface FieldStoneBuffers {
  size: number;
  /** sRGB albedo, RGBA8. */
  px: Uint8ClampedArray;
  /** Relief 0..1 (stone crowns high, joints low) for the normal map and the packed AO/roughness map. */
  hgt: Float32Array;
  /** 1 on a joint pixel (a void between stones), 0 on a stone face: the receipt's evidence. */
  joint: Uint8Array;
}

export interface FieldStoneSlice { fine: true; stage: string }

/** The site lattice of one tile: a tile is 0.83 m of wall at the kit's 1.2 repeats a metre, so a lattice cell is about
 * 17 cm along and 10 cm up, and most stones span one or two cells: a hand to a forearm long, the print's old block
 * sizes. Distances count the height 1.6 times (BED): each stone's share runs along the wall, so the stones lie flat. */
const COLS = 5, ROWS = 8, BED = 1.6;
const SITES = COLS * ROWS;
/** Stone lightness base: the stone print's 0.305, set so the darker dry joints leave the print's mean where it was. */
export const FIELD_STONE_L0 = 0.28;

function hash(a: number, b: number, seed: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x2545f491);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Periodic value noise in [0, 1] over the unit tile, `cells` lattice cells a tile. */
function pnoise(u: number, v: number, cells: number, seed: number): number {
  const fx = u * cells, fy = v * cells;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = fx - x0, ty = fy - y0;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const i0 = ((x0 % cells) + cells) % cells, j0 = ((y0 % cells) + cells) % cells;
  const i1 = (i0 + 1) % cells, j1 = (j0 + 1) % cells;
  const a = hash(i0, j0, seed), b = hash(i1, j0, seed), c = hash(i0, j1, seed), d = hash(i1, j1, seed);
  const top = a + (b - a) * sx;
  return top + (c + (d - c) * sx - top) * sy;
}

/** A periodic fractal field precomputed on a res x res grid and read bilinearly (wrapped). */
function periodicField(res: number, cells: number, octaves: number, seed: number): (u: number, v: number) => number {
  const grid = new Float32Array(res * res);
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
    let value = 0, amp = 1, total = 0, c = cells;
    for (let o = 0; o < octaves; o++) {
      value += pnoise(i / res, j / res, c, seed + o * 31) * amp;
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
 * Paint the rubble print (`size` px square; 512 on desktop, 256 on phones: the same stones at half the texels).
 * Deterministic for a seed; sixteen rows per slice.
 */
export function* paintFieldStoneBuffers(size = 512, seed = 0xf1e1d):
  Generator<FieldStoneSlice, FieldStoneBuffers, void> {
  const px = new Uint8ClampedArray(size * size * 4), hgt = new Float32Array(size * size), joint = new Uint8Array(size * size);
  const k = size / 512; // the joint, chip and bevel widths below are 512-px texels
  // the sites: one a lattice cell, jittered; a weight for its share (one in five big, one in six a pin)
  const sx = new Float32Array(SITES), sy = new Float32Array(SITES), sw = new Float32Array(SITES);
  const tone = new Float32Array(SITES), cool = new Float32Array(SITES), lichenOf = new Float32Array(SITES);
  const cellW = 1 / COLS, cellH = 1 / ROWS, share = cellW * cellH * BED;
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
    const s = j * COLS + i;
    sx[s] = (i + 0.5 + (hash(i, j, seed) - 0.5) * 0.9) * cellW;
    sy[s] = (j + 0.5 + (hash(i, j, seed + 1) - 0.5) * 0.7) * cellH;
    const r = hash(i, j, seed + 2), r2 = hash(i, j, seed + 3);
    sw[s] = r < 0.2 ? share * (0.55 + r2 * 0.6) : r < 0.36 ? -share * (0.25 + r2 * 0.3) : share * r2 * 0.25;
    tone[s] = hash(i, j, seed + 4);
    cool[s] = hash(i, j, seed + 5) < 0.18 ? 1 : 0; // the odd stone of another kind: greyer
    lichenOf[s] = hash(i, j, seed + 6) < 0.22 ? 0.5 + hash(i, j, seed + 7) * 0.5 : 0;
  }
  const warpX = periodicField(128, 7, 2, seed + 11), warpY = periodicField(128, 7, 2, seed + 13);
  const chipF = periodicField(256, 72, 1, seed + 15);
  const grime = periodicField(64, 3, 3, seed + 17), lichenF = periodicField(128, 14, 2, seed + 19);
  const grainF = periodicField(256, 48, 2, seed + 23), mottleF = periodicField(128, 18, 2, seed + 25);
  const rgb = new Float32Array(3);
  const WARP = 0.2 * cellH; // the joints wander about a fifth of a course
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x, j4 = i * 4;
      const u0 = (x + 0.5) / size, v0 = (y + 0.5) / size;
      const u = u0 + (warpX(u0, v0) - 0.5) * 2 * WARP, v = v0 + (warpY(u0, v0) - 0.5) * 2 * WARP;
      // the three nearest sites by power distance on the wrapped tile (the height counted BED times)
      const ci = Math.floor(u * COLS), cj = Math.floor(v * ROWS);
      let d1 = Infinity, d2 = Infinity, d3 = Infinity, a = 0, b = 0, c = 0;
      let ax = 0, ay = 0, bx = 0, by = 0, cx = 0, cy = 0;
      for (let dj = -2; dj <= 2; dj++) {
        const jj = cj + dj, wj = ((jj % ROWS) + ROWS) % ROWS, oy = Math.floor(jj / ROWS);
        for (let di = -2; di <= 2; di++) {
          const ii = ci + di, wi = ((ii % COLS) + COLS) % COLS, ox = Math.floor(ii / COLS);
          const s = wj * COLS + wi;
          const qx = sx[s] + ox, qy = sy[s] + oy;
          const ddx = u - qx, ddy = (v - qy) * BED;
          const d = ddx * ddx + ddy * ddy - sw[s];
          if (d < d1) { d3 = d2; c = b; cx = bx; cy = by; d2 = d1; b = a; bx = ax; by = ay; d1 = d; a = s; ax = qx; ay = qy; }
          else if (d < d2) { d3 = d2; c = b; cx = bx; cy = by; d2 = d; b = s; bx = qx; by = qy; }
          else if (d < d3) { d3 = d; c = s; cx = qx; cy = qy; }
        }
      }
      // texel distance to the a|b and a|c boundaries: the metric distance over the boundary normal's stretch
      const eb = boundaryTexels(d2 - d1, ax - bx, ay - by, size);
      const ec = boundaryTexels(d3 - d1, ax - cx, ay - cy, size);
      // each pair of stones its own joint: a third of them touching, half a tight line, the rest gaping; the stones'
      // arrises chipped
      const lo = Math.min(a, b), hi = Math.max(a, b), pr = hash(lo, hi, seed + 29), pw = hash(lo, hi, seed + 31);
      const jw = (pr < 0.35 ? 0.6 : pr > 0.85 ? 3 + pw * 2.8 : 1.1 + pw * 1.3) * k;
      const e = eb + (chipF(u0, v0) - 0.5) * 3.2 * k;
      // three-stone corners knocked round into a dark pocket
      const pocket = eb + ec < (2 * jw + 3 * k) * (0.6 + hash(Math.min(a, c), Math.max(a, c), seed + 37) * 0.6);
      const grain = grainF(u0, v0) * 0.75 + hash(x, y, seed + 41) * 0.25;
      const g = smooth(0.5, 0.95, grime(u0, v0));
      if (e < jw || pocket) {
        // a dry joint is a void: shadow, a little earth toward its lips
        const lip = pocket ? 0.15 : clamp01(e / Math.max(0.5, jw));
        hslToRgb(0.075, 0.08, 0.14 + lip * 0.09 + grain * 0.04, rgb);
        joint[i] = 1;
        hgt[i] = 0.02 + lip * 0.06 + grain * 0.03;
      } else {
        const t = tone[a];
        const edge = Math.min(e - jw, (eb + ec) * 0.5 - jw - 1.5 * k);
        const bevel = smooth(0, 9 * k, edge);
        const lichen = lichenOf[a] * smooth(0.6, 0.78, lichenF(u0, v0));
        const mottle = mottleF(u0, v0);
        const speck = hash(x, y, seed + 43);
        const sat = (0.06 + t * 0.055 - g * 0.02) * (cool[a] ? 0.45 : 1);
        let light = (FIELD_STONE_L0 + t * 0.14 + grain * 0.05) * (0.8 + bevel * 0.2) * (0.93 + mottle * 0.14) - g * 0.07;
        light *= speck > 0.985 ? 0.8 : speck > 0.978 ? 1.08 : 1; // pits and the odd bright grain
        hslToRgb(0.081 + t * 0.014 + (cool[a] ? 0.02 : 0), sat, light, rgb);
        if (lichen > 0) {
          // crustose lichen: a pale grey-green bloom over the stone, never on a joint
          rgb[0] += (0.56 - rgb[0]) * lichen * 0.55; rgb[1] += (0.58 - rgb[1]) * lichen * 0.55; rgb[2] += (0.48 - rgb[2]) * lichen * 0.55;
        }
        hgt[i] = clamp01((0.5 + t * 0.2 + grain * 0.12 + mottle * 0.06) * (0.4 + 0.6 * Math.pow(bevel, 0.7)));
      }
      px[j4] = clamp01(rgb[0]) * 255; px[j4 + 1] = clamp01(rgb[1]) * 255; px[j4 + 2] = clamp01(rgb[2]) * 255; px[j4 + 3] = 255;
    }
    if ((y & 15) === 15) yield { fine: true, stage: `field-stone-rows-${y + 1}` };
  }
  return { size, px, hgt, joint };
}

/**
 * Texel distance from a point to the boundary between its stone and a neighbour's, from the power-distance gap: the
 * gap over twice the sites' metric separation is the metric distance; a boundary whose normal leans toward the bed
 * (vertical in the tile) is stretched BED times in the metric, so it comes back divided by that stretch.
 */
function boundaryTexels(gap: number, dx: number, dy: number, size: number): number {
  const mx = dx, my = dy * BED, m = Math.max(1e-6, Math.hypot(mx, my));
  const nx = mx / m, ny = my / m;
  return gap / (2 * m) / Math.hypot(nx, ny * BED) * size;
}
