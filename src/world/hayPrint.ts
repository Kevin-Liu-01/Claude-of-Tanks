// src/world/hayPrint.ts — the straw print (the scenery lane, b15).
//
// Gauntlet wave 106 on the field haystack: "a bare textureless dark cone … a leftover debug marker". The straw props
// (the bale, the stook, the field stacks of every region, the Bengal pole stack) share one material; this is its print,
// four bands of one tile, each periodic along u (round a stack, along a bale), the GPU's way round (v = 1 at row 0: a
// canvas texture is flipped on upload):
//
//   - the packed band (HAY_PACKED_V): a bale's pressed straw — long stalks across u, dark seams between them;
//   - the face band (HAY_FACE_V, v up a stack's side from its foot): hay drawn down in wisps — clumps of strands running
//     down the face, each its own tone and lean, dark gaps between them and the odd loose straw across them; golden
//     where it was raked last, weathered grey-brown over most of it, darker, browner and pressed at the foot where the
//     stack has settled into the damp;
//   - the thatch band (HAY_THATCH_V, v up a crown): courses of straw bundles laid on the crown, each course's butts a
//     lip over the shade under it, the bundles their own tones, the courses wandering a little;
//   - the wood band (HAY_WOOD_V): a stack pole's or a hay barn's weathered grey timber, its grain along v.
//
// The map's straw tone (props tones.straw) colours the whole print; the grime hook varies it by world place.
// Pure: no DOM and no three.js. Buffers out; props.ts makes the textures; the receipt reads the buffers.

/** The packed band (v): a bale's pressed straw. */
export const HAY_PACKED_V: readonly [number, number] = [0.03, 0.21];
/** The face band (v, up a stack's side from its foot at the band's start). */
export const HAY_FACE_V: readonly [number, number] = [0.25, 0.61];
/** The thatch band (v, up a crown from its eaves at the band's start). */
export const HAY_THATCH_V: readonly [number, number] = [0.65, 0.85];
/** The wood band (v): a pole's or a barn's grey timber, its grain along v. */
export const HAY_WOOD_V: readonly [number, number] = [0.89, 0.97];

interface HayBuffers {
  size: number;
  /** sRGB albedo, RGBA8. */
  px: Uint8ClampedArray;
  /** Relief 0..1 for the normal map and the packed AO/roughness map. */
  hgt: Float32Array;
}

interface HaySlice { fine: true; stage: string }

function hash(a: number, b: number, seed: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x2545f491);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
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

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, v: number) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const fract = (v: number) => v - Math.floor(v);

function hslToRgb(h: number, s: number, l: number, out: Float32Array): void {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const channel = (t: number) => {
    t = ((t % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  out[0] = channel(h + 1 / 3); out[1] = channel(h); out[2] = channel(h - 1 / 3);
}

/** The face band's locks: so many columns round the tile, so many rows up the band. */
const WISP_COLS = 34, WISP_ROWS = 3;

/** A band's local coordinate (0 at its start, 1 at its end) or -1 off it, with a margin either side for the mips. */
function inBand(v: number, band: readonly [number, number], margin = 0.02): number {
  if (v < band[0] - margin || v > band[1] + margin) return -1;
  return clamp01((v - band[0]) / (band[1] - band[0]));
}

/**
 * Paint the print (`size` px square; 512 on desktop, 256 on phones: the same straw at half the texels). Deterministic
 * for a seed; sixteen rows per slice.
 */
/** The straw print's seed (the props build and the surface paint worker ask with it alike). */
export const HAY_PRINT_SEED = 0x4a7;

export function* paintHayBuffers(size = 512, seed = HAY_PRINT_SEED):
  Generator<HaySlice, HayBuffers, void> {
  const px = new Uint8ClampedArray(size * size * 4), hgt = new Float32Array(size * size);
  const rgb = new Float32Array(3);
  for (let y = 0; y < size; y++) {
    const v = 1 - (y + 0.5) / size;
    const packed = inBand(v, HAY_PACKED_V), face = inBand(v, HAY_FACE_V), thatch = inBand(v, HAY_THATCH_V), wood = inBand(v, HAY_WOOD_V);
    for (let x = 0; x < size; x++) {
      const i = y * size + x, j4 = i * 4;
      const u = (x + 0.5) / size;
      const fine = hash(x, y, seed + 3);
      let h = 0.11, s = 0.4, l = 0.4, relief = 0.5;
      if (face >= 0) {
        // the wisps: hanging locks of straw, each its own width, length, lean and tone, overlapping (the brightest on
        // top), the strands running along each; the dark between them where none lies
        let best = 0, bestTone = 0, bestStrand = 0.5;
        const cu = u * WISP_COLS, cvv = face * WISP_ROWS;
        const ci = Math.floor(cu), cj = Math.floor(cvv);
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          const ii = ci + di, jj = cj + dj, wi = ((ii % WISP_COLS) + WISP_COLS) % WISP_COLS;
          const r0 = hash(wi, jj & 1023, seed + 11), r1 = hash(wi, jj & 1023, seed + 13), r2 = hash(wi, jj & 1023, seed + 17);
          const r3 = hash(wi, jj & 1023, seed + 19);
          const wx = ii + 0.15 + r0 * 0.7, wy = jj + 0.3 + r1 * 0.7, width = 0.3 + r2 * 0.55, len = 1.1 + r3 * 1.3, lean = (r0 - 0.5) * 1.2;
          const dv = wy - cvv; // (a lock hangs down from its root: its strands below it, tapering to a point)
          if (dv < -0.08 || dv > len) continue;
          const t = Math.max(0, dv) / len, taper = width * (0.35 + 0.65 * Math.sqrt(Math.max(0, 1 - t)) * smooth(-0.08, 0.12, dv));
          const du = (cu - wx) - lean * dv;
          const across = Math.abs(du) / Math.max(1e-3, taper);
          if (across >= 1) continue;
          const w = (1 - across * across) * (0.55 + 0.45 * r1) * (1 - 0.35 * t);
          if (w > best) {
            best = w; bestTone = r2 - 0.5;
            bestStrand = pnoise(u - lean * face * 0.18, v, 420, seed + 23 + (wi & 7), 24);
          }
        }
        const fibre = pnoise(u, v, 512, seed + 29, 40);
        // the odd loose straw across the locks: thin bright streaks, leaning
        const loose = smooth(0.9, 0.97, pnoise(u * 3 + v * 1.7, v, 60, seed + 31, 2));
        // weathering: golden where raked last (patches), grey-brown over most, the foot pressed and damp
        const raked = smooth(0.55, 0.75, pnoise(u, v, 4, seed + 37, 2));
        const foot = 1 - smooth(0.0, 0.2, face + (pnoise(u, v, 9, seed + 41, 2) - 0.5) * 0.12);
        const under = 1 - smooth(0.05, 0.45, best); // between the locks: the stack's dark inner straw
        const grey = smooth(0.45, 0.7, pnoise(u, v, 3, seed + 43, 2)); // weathered patches, grey-brown
        h = 0.105 + bestTone * 0.02 + raked * 0.01 - foot * 0.025 - grey * 0.01;
        s = 0.3 + raked * 0.16 + bestTone * 0.05 - foot * 0.06 - under * 0.04 - grey * 0.12;
        // (soft: combed hay, the locks a low relief and the gaps between them shade, not grooves — strong dark streaks
        // read as bark at a field's distance)
        l = 0.44 + raked * 0.08 + bestTone * 0.05 + (bestStrand - 0.5) * 0.1 + (fibre - 0.5) * 0.06 - under * 0.05 - foot * 0.12 + loose * 0.08 - grey * 0.04;
        relief = 0.5 + best * 0.16 + (bestStrand - 0.5) * 0.18 + (fibre - 0.5) * 0.1 - under * 0.1 - foot * 0.08;
      } else if (thatch >= 0) {
        // the crown's courses: bundles laid in rows, each course's butts a ragged lip over the shade beneath it, the
        // straw of each bundle running down the crown
        const courses = 5, wave = (pnoise(u, v, 5, seed + 43, 2) - 0.5) * 0.45 + (pnoise(u, v, 31, seed + 47, 3) - 0.5) * 0.12;
        const cv = thatch * courses + wave, course = Math.floor(cv), inCourse = fract(cv);
        const ragged = (pnoise(u, v, 140, seed + 53, 4) - 0.5) * 0.12;
        const shade = 1 - smooth(0.0, 0.16, inCourse + ragged), lip = smooth(0.0, 0.25, inCourse + ragged) * (1 - smooth(0.25, 0.6, inCourse));
        const bundleAt = u * 24 + hash(course & 63, 3, seed + 59) * 7 + (pnoise(u, v, 8, seed + 61, 3) - 0.5) * 0.6;
        const bundle = Math.floor(bundleAt), inBundle = fract(bundleAt), tone = hash(bundle & 1023, course & 63, seed + 67) - 0.5;
        const strand = pnoise(u + inCourse * 0.004 * tone, v, 320, seed + 71, 12);
        const seam = 1 - smooth(0.0, 0.12, Math.min(inBundle, 1 - inBundle));
        h = 0.095 + tone * 0.02;
        s = 0.2 + tone * 0.06;
        l = 0.35 + tone * 0.08 + (strand - 0.5) * 0.18 + lip * 0.03 - shade * 0.13 - seam * 0.06;
        relief = 0.5 + (strand - 0.5) * 0.3 + inCourse * 0.18 - shade * 0.3 - seam * 0.1;
      } else if (wood >= 0) {
        // a pole's grey timber: grain along v, the odd dark check
        const grain = pnoise(u, v, 48, seed + 61, 2), check = smooth(0.82, 0.92, pnoise(u, v, 24, seed + 67, 3));
        h = 0.08; s = 0.1 + grain * 0.04;
        l = 0.3 + (grain - 0.5) * 0.1 - check * 0.12;
        relief = 0.5 + (grain - 0.5) * 0.3 - check * 0.4;
      } else if (packed >= 0) {
        // a bale's pressed straw: stalks across u, dark seams between them
        // (thin dark seams along u, not blotches: their noise fine across v and long along u)
        const stalk = pnoise(u, v, 8, seed + 73, 60), strand = pnoise(u, v, 30, seed + 79, 420), kink = pnoise(u, v, 160, seed + 83, 90);
        const seam = smooth(0.8, 0.95, pnoise(u, v, 24, seed + 89, 380));
        h = 0.11 + stalk * 0.015; s = 0.4 - seam * 0.1;
        l = (0.4 + stalk * 0.08 + (strand - 0.5) * 0.16 + (kink - 0.5) * 0.04) * (1 - seam * 0.35);
        relief = 0.5 + (stalk - 0.5) * 0.2 + (strand - 0.5) * 0.4 - seam * 0.35;
      } else {
        // the margins between the bands: the face's mean, so a mip blends into straw, not into a seam
        h = 0.1; s = 0.24; l = 0.36; relief = 0.5;
      }
      hslToRgb(h, clamp01(s), clamp01(l + (fine - 0.5) * 0.03), rgb);
      px[j4] = Math.round(clamp01(rgb[0]) * 255); px[j4 + 1] = Math.round(clamp01(rgb[1]) * 255); px[j4 + 2] = Math.round(clamp01(rgb[2]) * 255);
      px[j4 + 3] = 255;
      hgt[i] = clamp01(relief);
    }
    if ((y + 1) % 16 === 0) yield { fine: true, stage: 'hay-rows' };
  }
  return { size, px, hgt };
}
