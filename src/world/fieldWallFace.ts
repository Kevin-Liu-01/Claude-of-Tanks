// src/world/fieldWallFace.ts — the karst field walls' face print (the scenery lane, b13).
//
// Gauntlet wave 87 (Saltwind, both sides) on the field works' walls (fieldWorks.ts): "a smooth grey kerb-like strip of
// even width winds across the whole frame and reads as cast concrete rather than a drystone wall", "a wall built like
// stacked cinder blocks". A Dalmatian dry-stone wall is irregular limestone laid without mortar: stones of every size,
// bigger at the foot, their edges rounded and broken, dark dry joints between them, grey-white under crustose lichen.
// The walls' bodies are swept geometry with a stepped crown of top stones (one per slot, fieldWorks.ts); their faces
// carry this print, two bands of one tile (DRY_WALL_TILE_M a side):
//
//   - the face band (v in DRY_WALL_FACE_V, v up the wall from its sunk foot): rough courses of stones, each its own
//     length, height and roundness, its bed and its top wandering a little off the course line, every joint dry and
//     dark, the odd pinning stone wedged in a wide one; the stones grey-white with their own tone, darker into their
//     joints, rain-streaked, and crusted with lichen: pale grey-white blooms, the odd orange one, black dots;
//   - the crown band (v in DRY_WALL_CROWN_V): a top stone's skin and no joint (the crown's stones are the geometry's),
//     its lichen thicker, as a wall's top holds it;
//   - the stone band (v in DRY_WALL_STONE_V; b17): one stone's skin, no joint at all — the stone form's stones, its
//     through-stones and its coping slabs are each a stone of their own geometry, and carry it: grey-white limestone,
//     mottled, grained, crusted with pale lichen and black dots, a little rain-streaked.
//
// Neutral in hue: the vertex colour carries the map's wall tone (scenery.fieldWorks.wallTone). Periodic along u (a
// wall runs on for kilometres), not along v (a wall stands under a metre and a tile is two).
// Pure: no DOM and no three.js. Buffers out; props.ts makes the textures; the receipt reads the buffers.

/** One tile of the print covers this many metres along a wall and up it. */
export const DRY_WALL_TILE_M = 2;
/** The face band (v): the courses, from the wall's sunk foot (v = 0) up to 1.12 m. */
export const DRY_WALL_FACE_V: readonly [number, number] = [0, 0.56];
/** The crown band (v): a top stone's skin; the crown maps its centre line to DRY_WALL_CROWN_MID_V. */
export const DRY_WALL_CROWN_V: readonly [number, number] = [0.6, 0.78];
export const DRY_WALL_CROWN_MID_V = 0.69;
/** (b17) The stone band (v): one stone's skin without a joint (0.34 m of stone at the tile's scale); a stone maps its
 *  middle to DRY_WALL_STONE_MID_V. */
export const DRY_WALL_STONE_V: readonly [number, number] = [0.82, 0.99];
export const DRY_WALL_STONE_MID_V = 0.905;

export interface DryWallBuffers {
  size: number;
  /** sRGB albedo, RGBA8. */
  px: Uint8ClampedArray;
  /** Relief 0..1 for the normal map and the packed AO/roughness map. */
  hgt: Float32Array;
  /** 1 on a dry joint of the face band, 0 elsewhere (rows as the image's: row 0 at v = 1): the receipt's evidence. */
  joint: Uint8Array;
  /** The face band's stones as painted (metres along, metres up): the receipt's evidence. */
  stones: ReadonlyArray<{ u0: number; u1: number; y0: number; y1: number }>;
}

export interface DryWallSlice { fine: true; stage: string }

function hash(a: number, b: number, seed: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x2545f491);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function mulberry32(a: number): () => number {
  return () => {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** Periodic value noise in [0, 1] over the unit tile, `cells` lattice cells along u (`cellsV` along v). */
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

/** The stones' bed: the vertical is stretched this much, so a stone is laid longer than it stands. */
const FACE_BED = 1.4;

interface CourseStone {
  u: number; y: number; // the stone's site (metres along, metres up from the foot)
  halfL: number; halfH: number; // its half extents as laid
  weight: number; // its claim (an additively weighted cell: a bigger stone takes more of the face)
  bed: number; // its own anisotropy (b14: a slab long on its bed, a block nearly round)
  tone: number; cool: number; lichen: number; orange: boolean; seed: number;
}


/**
 * The courses (metres up from the foot): a waller lays the biggest stones at the foot and smaller ones above; each
 * course its own height, each stone its own length and its site wandering off the course line, the odd pinning stone
 * between two; the run wraps at the tile's end. Each stone is a site of a weighted cell partition of the face, so its
 * outline is the irregular polygon its neighbours leave it, not a rounded block.
 */
function layCourses(r: () => number): CourseStone[] {
  const W = DRY_WALL_TILE_M, top = DRY_WALL_FACE_V[1] * DRY_WALL_TILE_M + 0.06;
  const stones: CourseStone[] = [];
  let y = -0.05, n = 0;
  while (y < top) {
    const ch = y < 0.22 ? 0.2 + r() * 0.12 : y < 0.58 ? 0.14 + r() * 0.1 : 0.1 + r() * 0.08;
    const start = r() * 0.4;
    let u = start;
    while (u < start + W - 0.001) {
      // (b14, wave 97: "uniform polygon cells": lengths from a hand to most of a metre, skewed small — a big stone
      // among a run of small ones — each stone its own height in the course, its own bed and weight)
      const big = r() < (y < 0.22 ? 0.3 : y < 0.58 ? 0.15 : 0.05); // (the waller's big stones at the foot)
      let len = big ? (y < 0.58 ? 0.5 + r() * 0.4 : 0.36 + r() * 0.24)
        : (y < 0.22 ? 0.12 : 0.08) + Math.pow(r(), 1.7) * (y < 0.22 ? 0.5 : y < 0.58 ? 0.4 : 0.3);
      const left = start + W - u;
      if (left - len < 0.1) len = left; // the last stone closes the run on the first (the wrap)
      // a stone a little high or low, a little long, tipped on its bed by its neighbours (the site wanders); a big one
      // stands into the course above
      const halfL = len / 2, halfH = ch / 2 * (big ? 1.25 + r() * 0.35 : 0.62 + r() * 0.55);
      const bed = 1.05 + r() * 1.1;
      stones.push({
        u: u + halfL + (r() - 0.5) * len * 0.22, y: y + ch / 2 + (big ? ch * 0.18 : (r() - 0.5) * ch * 0.4), halfL, halfH,
        weight: Math.min(halfL, halfH * FACE_BED) * (0.5 + r() * 0.4) * (0.9 + bed * 0.1), bed,
        tone: r(), cool: r(), lichen: r(), orange: r() < 0.1, seed: (n++ * 7919) | 0,
      });
      // now and then a pinning stone wedged into the joint after it, low in the course
      if (r() < 0.16 && u + len < start + W - 0.12) {
        stones.push({
          u: u + len + 0.005, y: y + ch * (0.25 + r() * 0.5), halfL: 0.04, halfH: 0.03, weight: 0, bed: 1.3,
          tone: r(), cool: r(), lichen: r() * 0.5, orange: false, seed: (n++ * 7919) | 0,
        });
      }
      u += len;
    }
    y += ch;
  }
  return stones;
}

/**
 * Paint the print (`size` px square; 512 on desktop, 256 on phones: the same stones at half the texels). Deterministic
 * for a seed; sixteen rows per slice.
 */
export function* paintDryWallBuffers(size = 512, seed = 0x5a1d):
  Generator<DryWallSlice, DryWallBuffers, void> {
  const W = DRY_WALL_TILE_M;
  const px = new Uint8ClampedArray(size * size * 4), hgt = new Float32Array(size * size), joint = new Uint8Array(size * size);
  const stones = layCourses(mulberry32(seed));
  const copes: number[] = [];
  { const cr = mulberry32(seed + 77); let cu = 0; while (cu < W - 0.03) { copes.push(cu); cu += 0.05 + Math.pow(cr(), 1.4) * 0.11; } }
  // (the fields at 128 texels a tile or less: their precompute is a few tens of milliseconds, not a long task)
  const wobbleF = periodicField(96, 24, 2, seed + 3), faceF = periodicField(64, 10, 2, seed + 5);
  const grainF = periodicField(128, 48, 1, seed + 7), mottleF = periodicField(64, 16, 2, seed + 9);
  const lichenF = periodicField(128, 22, 2, seed + 11), crustF = periodicField(128, 48, 1, seed + 13);
  const dotF = periodicField(128, 64, 1, seed + 15), streakF = periodicField(64, 20, 1, seed + 17, 1 / 8);
  const skinF = periodicField(32, 4, 2, seed + 19), patchF = periodicField(32, 5, 1, seed + 21);
  const jointF = periodicField(64, 14, 2, seed + 23);
  yield { fine: true, stage: 'dry-wall-fields' };
  const rgb = new Float32Array(3);
  // the sites on a grid along the face (wrapped along u), for the nearest-cell lookup
  const CELL = 0.2, CU = Math.round(W / CELL), CV = Math.ceil((DRY_WALL_FACE_V[1] * W + 0.2) / CELL) + 1;
  const grid: number[][] = Array.from({ length: CU * CV }, () => []);
  stones.forEach((s, k) => {
    const cu = ((Math.floor(s.u / CELL) % CU) + CU) % CU, cv = Math.max(0, Math.min(CV - 1, Math.floor((s.y + 0.1) / CELL)));
    grid[cv * CU + cu].push(k);
  });
  for (let y = 0; y < size; y++) {
    // (row 0 is the image's top: a canvas texture is flipped on upload, so v runs up the image from its last row)
    const v = 1 - (y + 0.5) / size, ym = v * W;
    const face = v < DRY_WALL_FACE_V[1] + 0.02, skin = v > DRY_WALL_STONE_V[0] - 0.02;
    for (let x = 0; x < size; x++) {
      const i = y * size + x, j4 = i * 4;
      const u = (x + 0.5) / size, um = u * W;
      const grain = grainF(u, v) * 0.7 + hash(x, y, seed + 41) * 0.3;
      if (face) {
        // the two nearest cells (weighted, the bed's anisotropy, the outline a little broken): the border between them
        // is the joint; inside the nearest, its stone
        const wobble = (wobbleF(u, v) - 0.5) * 0.012;
        const cu = Math.floor(um / CELL), cv = Math.floor((ym + 0.1) / CELL);
        // (b14, wave 97: "uniform polygon cells": a power diagram — each stone's claim is its weight squared off its
        // squared distance, so the cells are polygons with straight joints, the big stones' large and the small ones'
        // small; one bed for all, so no joint curves)
        let d1 = Infinity, d2 = Infinity, k1 = -1, k2 = -1;
        for (let dv = -1; dv <= 1; dv++) {
          const gv = cv + dv;
          if (gv < 0 || gv >= CV) continue;
          for (let du = -2; du <= 2; du++) {
            const list = grid[gv * CU + ((((cu + du) % CU) + CU) % CU)];
            for (let n = 0; n < list.length; n++) {
              const k = list[n], s = stones[k];
              let dx = um - s.u;
              if (dx > W / 2) dx -= W; else if (dx < -W / 2) dx += W;
              const dy = (ym - s.y) * FACE_BED;
              const d = dx * dx + dy * dy - s.weight * s.weight;
              if (d < d1) { d2 = d1; k2 = k1; d1 = d; k1 = k; } else if (d < d2) { d2 = d; k2 = k; }
            }
          }
        }
        // the distance to the joint (the two sites' power bisector): the difference over twice the sites' spacing
        let gap = 1;
        if (k1 >= 0 && k2 >= 0) {
          let sx = stones[k2].u - stones[k1].u;
          if (sx > W / 2) sx -= W; else if (sx < -W / 2) sx += W;
          gap = Math.max(1e-3, 2 * Math.hypot(sx, (stones[k2].y - stones[k1].y) * FACE_BED));
        }
        const border = (d2 - d1) / gap + wobble; // about the distance to the stone's outline
        const stone = k1 >= 0 ? stones[k1] : null;
        // a joint's width wanders along it: here two stones all but touch, there a gap opens deep into the wall
        const open = jointF(u, v);
        const jointW = 0.0016 + 0.0105 * open * open + (stone ? (stone.seed % 5) * 0.0004 : 0);
        if (!stone || border < jointW) {
          // a dry joint: a tight one a dark line, a wide one shadow deep into the wall with the hearting's grit in it
          const depth = smooth(0, jointW, Math.max(0, border));
          hslToRgb(0.075, 0.1, 0.06 + (1 - smooth(0.002, 0.008, jointW)) * 0.12 + depth * 0.06 + grain * 0.03, rgb);
          hgt[i] = 0.03 + depth * 0.12 + (1 - smooth(0.002, 0.008, jointW)) * 0.15;
          joint[i] = 1;
        } else {
          const inner = border - jointW;
          // a limestone's face is near flat, its arrises knocked: a narrow bevel into the joint, not a pillow
          const edge = smooth(0, 0.016, inner);
          // each stone set at its own angle in the face (its plane tipped a little its own way): in the light it reads
          // as a stone of its own, a little brighter or darker than its neighbours
          const tipA = stone.cool * 6.283, tipX = Math.cos(tipA), tipY = Math.sin(tipA);
          let du = um - stone.u; if (du > W / 2) du -= W; else if (du < -W / 2) du += W;
          const tip = (du * tipX + (ym - stone.y) * tipY) / Math.max(0.08, Math.max(stone.halfL, stone.halfH));
          const facet = faceF(u + stone.seed * 0.013, v + stone.seed * 0.007);
          const mottle = mottleF(u, v);
          // its own tone: grey-white limestone, the odd cooler blue-grey stone, darker into its joints
          const cool = smooth(0.72, 0.88, stone.cool);
          const up = Math.max(-1, Math.min(1, (ym - stone.y) / Math.max(0.03, stone.halfH)));
          let light = (0.6 + stone.tone * 0.32 + (mottle - 0.5) * 0.08 + (grain - 0.5) * 0.06 + (facet - 0.5) * 0.06)
            * (0.7 + 0.3 * edge) * (1 + tip * 0.06 + up * 0.02 - (1 - edge) * Math.max(0, -up) * 0.1);
          // the rain's streaks down the face
          light *= 1 - smooth(0.6, 0.82, streakF(u, v)) * 0.07;
          hslToRgb(0.1 - cool * 0.48, 0.045 - cool * 0.02, light, rgb);
          // crustose lichen: pale grey-white blooms (most stones), the odd orange one, black dots
          const crust = lichenF(u, v) * 0.7 + crustF(u, v) * 0.3;
          const pale = smooth(0.6, 0.67, crust) * smooth(0.25, 0.6, stone.lichen) * edge;
          if (pale > 0) { rgb[0] += (0.93 - rgb[0]) * pale * 0.5; rgb[1] += (0.93 - rgb[1]) * pale * 0.5; rgb[2] += (0.89 - rgb[2]) * pale * 0.5; }
          if (stone.orange) {
            // (Xanthoria: small rosettes clustered on a lit stone, ochre more than orange at a wall's distance)
            const o = smooth(0.76, 0.82, dotF(u + 0.21, v + 0.13)) * smooth(0.45, 0.65, lichenF(u + 0.4, v)) * edge;
            rgb[0] += (0.78 - rgb[0]) * o * 0.55; rgb[1] += (0.6 - rgb[1]) * o * 0.55; rgb[2] += (0.34 - rgb[2]) * o * 0.55;
          }
          const dots = smooth(0.9, 0.94, dotF(u, v)) * smooth(0.5, 0.85, stone.lichen);
          if (dots > 0) { const k = 1 - dots * 0.45; rgb[0] *= k; rgb[1] *= k; rgb[2] *= k; }
          // the relief: rounded into its joints, a lumpy face, its lichen a little proud
          hgt[i] = clamp01(0.52 + edge * 0.22 + tip * 0.07 + (facet - 0.5) * 0.08 + (grain - 0.5) * 0.05 + pale * 0.02);
        }
      } else if (skin) {
        // (b17) the stone band: one stone's skin — no joint — grey-white limestone, its tone wandering slowly across it
        // (a stone takes its own patch), grained and mottled, its lichen pale and patchy, black dots, a faint streak of
        // rain down it
        const t = smooth(0.2, 0.8, skinF(u, v)), mottle = mottleF(u, v), streak = streakF(u, v);
        const light = 0.74 + (patchF(u, v) - 0.5) * 0.14 + t * 0.06 + (mottle - 0.5) * 0.1 + (grain - 0.5) * 0.08 - smooth(0.62, 0.9, streak) * 0.05;
        hslToRgb(0.1, 0.04, light, rgb);
        const crust = lichenF(u, v) * 0.7 + crustF(u, v) * 0.3;
        const pale = smooth(0.54, 0.64, crust) * smooth(0.3, 0.6, patchF(u + 0.37, v));
        if (pale > 0) { rgb[0] += (0.9 - rgb[0]) * pale * 0.32; rgb[1] += (0.9 - rgb[1]) * pale * 0.32; rgb[2] += (0.86 - rgb[2]) * pale * 0.32; }
        const dots = smooth(0.9, 0.95, dotF(u, v));
        if (dots > 0) { const k = 1 - dots * 0.4; rgb[0] *= k; rgb[1] *= k; rgb[2] *= k; }
        hgt[i] = clamp01(0.55 + (mottle - 0.5) * 0.22 + (grain - 0.5) * 0.18 + pale * 0.04 + (t - 0.5) * 0.06);
      } else {
        // the crown band (and the margins round it): (b14, wave 97: "a dead-level top") the coping seen from above — stones
        // on edge across the wall, 5-16 cm thick along it, each its own tone, dark joints between them, their lichen thick
        let ci = 0;
        while (ci + 1 < copes.length && copes[ci + 1] <= um) ci++;
        const c0 = copes[ci], c1 = ci + 1 < copes.length ? copes[ci + 1] : W + copes[0];
        const cEdge = Math.min(um - c0, c1 - um);
        const cTone = hash(ci, 17, seed + 61);
        const cJoint = 1 - smooth(0.004, 0.011, cEdge);
        const t = smooth(0.25, 0.75, skinF(u, v)), mottle = mottleF(u, v);
        const light = (0.72 + cTone * 0.18 + t * 0.06 + (mottle - 0.5) * 0.1 + (grain - 0.5) * 0.07) * (1 - cJoint * 0.62);
        hslToRgb(0.1, 0.045, light, rgb);
        const crust = lichenF(u, v) * 0.7 + crustF(u, v) * 0.3;
        const pale = smooth(0.52, 0.62, crust) * smooth(0.35, 0.6, patchF(u, v));
        if (pale > 0) { rgb[0] += (0.9 - rgb[0]) * pale * 0.35; rgb[1] += (0.9 - rgb[1]) * pale * 0.35; rgb[2] += (0.86 - rgb[2]) * pale * 0.35; }
        const dots = smooth(0.9, 0.95, dotF(u, v));
        if (dots > 0) { const k = 1 - dots * 0.4; rgb[0] *= k; rgb[1] *= k; rgb[2] *= k; }
        hgt[i] = clamp01(0.55 + (mottle - 0.5) * 0.2 + (grain - 0.5) * 0.16 + pale * 0.04 - cJoint * 0.4 + (cTone - 0.5) * 0.1);
      }
      px[j4] = clamp01(rgb[0]) * 255; px[j4 + 1] = clamp01(rgb[1]) * 255; px[j4 + 2] = clamp01(rgb[2]) * 255; px[j4 + 3] = 255;
    }
    if ((y & 15) === 15) yield { fine: true, stage: `dry-wall-rows-${y + 1}` };
  }
  return { size, px, hgt, joint, stones: stones.map((s) => ({ u0: s.u - s.halfL, u1: s.u + s.halfL, y0: s.y - s.halfH, y1: s.y + s.halfH })) };
}
