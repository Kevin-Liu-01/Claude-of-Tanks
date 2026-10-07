// src/world/fieldWallFace.ts — the karst field walls' face print (the scenery lane, b13).
//
// Gauntlet wave 87 (Saltwind, both sides) on the field works' walls (fieldWorks.ts): "a smooth grey kerb-like strip of
// even width winds across the whole frame and reads as cast concrete rather than a drystone wall", "a wall built like
// stacked cinder blocks". A Dalmatian dry-stone wall is irregular limestone laid without mortar: stones of every size,
// bigger at the foot, their edges rounded and broken, dark dry joints between them, grey-white under crustose lichen.
// The walls' bodies are swept geometry with a stepped crown of top stones (one per slot, fieldWorks.ts); their faces
// carry this print, two bands of one tile (DRY_WALL_TILE_M a side):
//
//   - the face band (v in DRY_WALL_FACE_V, v up the wall from its sunk foot): (b26; gauntlet wave 177, "a flat Voronoi
//     crazy-paving decal outlined in thick black grout") the face laid by the coursing law the stone form's stones are
//     laid by (dryStoneCourses.ts) — chunky limestone lumps of every size in wandering courses, the footing's big
//     stones at the foot, a knocked corner's void here and there — so the mid form reads, from where it takes over,
//     as the wall the stone form drew; the joints dry and dark where they open, a thin shadow where two stones all but
//     touch; the stones pale, warm grey-white, each its own tone, rain-streaked and crusted with lichen: pale blooms,
//     the odd ochre one, black dots;
//   - the crown band (v in DRY_WALL_CROWN_V): (b26) the rubble core — small stones packed with dark voids between —
//     as the mid form's crown shows it from above and its heads end-on, and the stone form's joints show it behind
//     its stones;
//   - the stone band (v in DRY_WALL_STONE_V; b17): one stone's skin, no joint at all — the stone form's stones, its
//     through-stones and its coping slabs are each a stone of their own geometry, and carry it: grey-white limestone,
//     mottled, grained, crusted with pale lichen and black dots, a little rain-streaked.
//
// Neutral in hue: the vertex colour carries the map's wall tone (scenery.fieldWorks.wallTone). Periodic along u (a
// wall runs on for kilometres), not along v (a wall stands under a metre and a tile is two).
// Pure: no DOM and no three.js. Buffers out; props.ts makes the textures; the receipt reads the buffers.
import { layDryStoneFace, type DryStoneFaceStone } from './dryStoneCourses.ts';

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

/** A laid stone and its look: its tone, its coolness, its lichen. */
interface PrintStone {
  st: DryStoneFaceStone;
  tone: number; cool: number; lichen: number; orange: boolean; seed: number;
  /** Its middle (m along, m up) and its half extents. */
  u: number; y: number; halfL: number; halfH: number;
}

/** The face band's stones: the coursing law on a wrapped tile (the footing's big stones from the sunk foot up). */
function layFaceStones(r: () => number): PrintStone[] {
  const W = DRY_WALL_TILE_M, top = DRY_WALL_FACE_V[1] * DRY_WALL_TILE_M + 0.06;
  const stones = layDryStoneFace(r, W, {
    crown: () => top, foot: 0, footH: [0.26, 0.4], footL: [0.36, 0.78], courseH: [0.13, 0.27], courseL: [0.2, 0.62], wrap: true,
    // (fewer and smaller voids than the stone form's: the print has no stone standing proud to shade its neighbour, and
    // its joints carry all the dark the stone form's relief gives)
    knocked: 0.32, inset: 0.02,
  });
  return stones.map((st, n) => ({
    st, tone: r(), cool: r(), lichen: r(), orange: r() < 0.1, seed: (n * 7919) | 0,
    u: (st.s0 + st.s1) / 2, y: (st.y0 + st.y1) / 2, halfL: (st.s1 - st.s0) / 2, halfH: (st.y1 - st.y0) / 2,
  }));
}

/** The crown band's rubble: small stones packed in rows, seen from above (a wrapped tile 0.36 m deep). */
function layRubble(r: () => number): PrintStone[] {
  const W = DRY_WALL_TILE_M, depth = (DRY_WALL_CROWN_V[1] - DRY_WALL_CROWN_V[0] + 0.04) * DRY_WALL_TILE_M + 0.04;
  const stones = layDryStoneFace(r, W, {
    crown: () => depth, foot: 0.02, footH: [0.06, 0.12], footL: [0.07, 0.17], courseH: [0.05, 0.11], courseL: [0.06, 0.16], wrap: true,
    knocked: 0.45, minH: 0.035, inset: 0.015,
  });
  return stones.map((st, n) => ({
    st, tone: r(), cool: r(), lichen: r(), orange: false, seed: (n * 104729) | 0,
    u: (st.s0 + st.s1) / 2, y: (st.y0 + st.y1) / 2, halfL: (st.s1 - st.s0) / 2, halfH: (st.y1 - st.y0) / 2,
  }));
}

/**
 * Rasterise a band's stones (their outlines, wrapped along u) into a stone index and a depth inside it (m to its
 * outline), rows `y0..y1` of the image, the band's metres up from `vm0` (v in tile units at its bottom).
 */
function rasterStones(stones: readonly PrintStone[], size: number, vBottom: number, vTop: number, yOffset: number): { id: Int32Array; inner: Float32Array } {
  const W = DRY_WALL_TILE_M, id = new Int32Array(size * size).fill(-1), inner = new Float32Array(size * size);
  const pxPerM = size / W;
  stones.forEach((ps, k) => {
    const pts = ps.st.pts, n = pts.length / 2;
    // (a wrapped face's stone may lie anywhere in [0, 2W): its copies a tile either side cover the tile)
    for (const shift of [-2 * W, -W, 0, W]) {
      const s0 = ps.st.s0 + shift, s1 = ps.st.s1 + shift;
      if (s1 < 0 || s0 > W) continue;
      const x0 = Math.max(0, Math.floor(s0 * pxPerM)), x1 = Math.min(size - 1, Math.ceil(s1 * pxPerM));
      // (rows: v up the image from its last row; the band's metres from its own bottom)
      const yTopPx = Math.max(0, Math.floor((1 - Math.min(vTop, vBottom + (ps.st.y1 + yOffset) / W)) * size));
      const yBotPx = Math.min(size - 1, Math.ceil((1 - Math.max(vBottom, vBottom + (ps.st.y0 + yOffset) / W)) * size));
      for (let y = yTopPx; y <= yBotPx; y++) {
        const v = 1 - (y + 0.5) / size;
        if (v < vBottom || v > vTop) continue;
        const ym = (v - vBottom) * W - yOffset;
        for (let x = x0; x <= x1; x++) {
          const um = (x + 0.5) / pxPerM - shift;
          // inside the outline (crossings), and the distance to its nearest edge
          let inside = false, d = Infinity;
          for (let i = 0, j = n - 1; i < n; j = i++) {
            const xi = pts[i * 2], yi = pts[i * 2 + 1], xj = pts[j * 2], yj = pts[j * 2 + 1];
            if ((yi > ym) !== (yj > ym) && um < (xj - xi) * (ym - yi) / (yj - yi) + xi) inside = !inside;
            const ex = xj - xi, ey = yj - yi, l2 = ex * ex + ey * ey || 1e-9;
            const t = Math.max(0, Math.min(1, ((um - xi) * ex + (ym - yi) * ey) / l2));
            d = Math.min(d, Math.hypot(um - xi - ex * t, ym - yi - ey * t));
          }
          if (!inside) continue;
          const i = y * size + x;
          if (id[i] < 0 || d > inner[i]) { id[i] = k; inner[i] = d; }
        }
      }
    }
  });
  return { id, inner };
}

/** The distance (m) from each pixel outside every stone to the nearest stone's pixel (a two-pass chamfer, wrapped along u). */
function jointDistance(id: Int32Array, size: number): Float32Array {
  const W = DRY_WALL_TILE_M, px = W / size, INF = 1e9, d = new Float32Array(size * size);
  for (let i = 0; i < d.length; i++) d[i] = id[i] >= 0 ? 0 : INF;
  const D1 = px, D2 = px * Math.SQRT2;
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (d[i] === 0) continue;
      const xl = (x + size - 1) % size, xr = (x + 1) % size;
      let m = d[i];
      if (y > 0) { m = Math.min(m, d[(y - 1) * size + x] + D1, d[(y - 1) * size + xl] + D2, d[(y - 1) * size + xr] + D2); }
      m = Math.min(m, d[y * size + xl] + D1);
      d[i] = m;
    }
    for (let y = size - 1; y >= 0; y--) for (let x = size - 1; x >= 0; x--) {
      const i = y * size + x;
      if (d[i] === 0) continue;
      const xl = (x + size - 1) % size, xr = (x + 1) % size;
      let m = d[i];
      if (y < size - 1) { m = Math.min(m, d[(y + 1) * size + x] + D1, d[(y + 1) * size + xl] + D2, d[(y + 1) * size + xr] + D2); }
      m = Math.min(m, d[y * size + xr] + D1);
      d[i] = m;
    }
  }
  return d;
}

/**
 * Paint the print (`size` px square; 512 on desktop, 256 on phones: the same stones at half the texels). Deterministic
 * for a seed; sixteen rows per slice.
 */
export function* paintDryWallBuffers(size = 512, seed = 0x5a1d):
  Generator<DryWallSlice, DryWallBuffers, void> {
  const W = DRY_WALL_TILE_M;
  const px = new Uint8ClampedArray(size * size * 4), hgt = new Float32Array(size * size), joint = new Uint8Array(size * size);
  const stones = layFaceStones(mulberry32(seed)), rubble = layRubble(mulberry32(seed + 77));
  // (the fields at 128 texels a tile or less: their precompute is a few tens of milliseconds, not a long task)
  const faceF = periodicField(64, 10, 2, seed + 5);
  const grainF = periodicField(128, 48, 1, seed + 7), mottleF = periodicField(64, 16, 2, seed + 9);
  const lichenF = periodicField(128, 22, 2, seed + 11), crustF = periodicField(128, 48, 1, seed + 13);
  const dotF = periodicField(128, 64, 1, seed + 15), streakF = periodicField(64, 20, 1, seed + 17, 1 / 8);
  const skinF = periodicField(32, 4, 2, seed + 19), patchF = periodicField(32, 5, 1, seed + 21);
  // (b26) the skin's facets: a site every 7 cm or so on a jittered grid, wrapped along the tile
  const FC = Math.round(W / 0.07), FR = Math.ceil(W / 0.07), fr = mulberry32(seed + 91);
  const fsx = new Float32Array(FC * FR), fsy = new Float32Array(FC * FR), ftx = new Float32Array(FC * FR), fty = new Float32Array(FC * FR);
  for (let k = 0; k < FC * FR; k++) {
    fsx[k] = ((k % FC) + 0.15 + fr() * 0.7) * (W / FC); fsy[k] = (Math.floor(k / FC) + 0.15 + fr() * 0.7) * (W / FR);
    const a = fr() * 6.283, m = 0.4 + fr() * 0.6; ftx[k] = Math.cos(a) * m; fty[k] = Math.sin(a) * m;
  }
  const facetOut = { height: 0, tilt: 0, crease: 0 };
  const facets = (um: number, ym: number): typeof facetOut => {
    const cx = Math.floor(um / (W / FC)), cy = Math.floor(ym / (W / FR));
    let d1 = Infinity, d2 = Infinity, k1 = 0;
    for (let dy = -1; dy <= 1; dy++) {
      const gy = ((cy + dy) % FR + FR) % FR;
      for (let dx = -1; dx <= 1; dx++) {
        const gx = ((cx + dx) % FC + FC) % FC, k = gy * FC + gx;
        let ox = um - fsx[k]; ox -= Math.round(ox / W) * W;
        let oy = ym - fsy[k]; oy -= Math.round(oy / W) * W;
        const d = ox * ox + oy * oy;
        if (d < d1) { d2 = d1; d1 = d; k1 = k; } else if (d < d2) d2 = d;
      }
    }
    let ox = um - fsx[k1]; ox -= Math.round(ox / W) * W;
    let oy = ym - fsy[k1]; oy -= Math.round(oy / W) * W;
    const plane = (ox * ftx[k1] + oy * fty[k1]) / 0.07; // (-0.7..0.7 across a facet)
    facetOut.height = 0.5 + plane * 0.5;
    facetOut.tilt = ftx[k1] * 0.6 + fty[k1] * 0.4;
    facetOut.crease = 1 - smooth(0, 0.012, Math.sqrt(d2) - Math.sqrt(d1));
    return facetOut;
  };
  yield { fine: true, stage: 'dry-wall-fields' };
  // the bands' stones rasterised (the face's from the sunk foot, the rubble's across the crown band) and every joint's
  // distance to the nearest stone
  const faceTop = DRY_WALL_FACE_V[1] + 0.02, crownBottom = DRY_WALL_CROWN_V[0] - 0.02, crownTop = DRY_WALL_CROWN_V[1] + 0.02;
  const face = rasterStones(stones, size, 0, faceTop, 0);
  yield { fine: true, stage: 'dry-wall-face-stones' };
  const crown = rasterStones(rubble, size, crownBottom, crownTop, 0.02);
  yield { fine: true, stage: 'dry-wall-rubble' };
  const ids = new Int32Array(size * size).fill(-1);
  for (let i = 0; i < ids.length; i++) ids[i] = face.id[i] >= 0 ? face.id[i] : crown.id[i] >= 0 ? 1e6 + crown.id[i] : -1;
  const gapM = jointDistance(ids, size);
  yield { fine: true, stage: 'dry-wall-joints' };
  const rgb = new Float32Array(3);
  for (let y = 0; y < size; y++) {
    // (row 0 is the image's top: a canvas texture is flipped on upload, so v runs up the image from its last row)
    const v = 1 - (y + 0.5) / size, ym = v * W;
    // (the margins between the bands are a stone's skin: a black stripe there bled into the bands' edges at distance)
    const inFace = v < faceTop, inCrown = v >= crownBottom && v <= crownTop, skin = !inFace && !inCrown;
    for (let x = 0; x < size; x++) {
      const i = y * size + x, j4 = i * 4;
      const u = (x + 0.5) / size, um = u * W;
      const grain = grainF(u, v) * 0.7 + hash(x, y, seed + 41) * 0.3;
      if (!skin) {
        const k = inFace ? face.id[i] : crown.id[i], ps = k < 0 ? null : (inFace ? stones : rubble)[k];
        if (!ps) {
          // a dry joint: where two stones all but touch, a thin shadow; where they leave a gap, a void deep into the wall
          // with the hearting's grit in it (b26: no black grout drawn round every stone — the joints are as wide as
          // the stones leave them)
          const open = smooth(0, inFace ? 0.014 : 0.01, gapM[i]);
          hslToRgb(0.075, 0.12, (inFace ? 0.25 : 0.3) - open * 0.11 + grain * 0.03, rgb);
          hgt[i] = 0.05 + (1 - open) * 0.16;
          if (inFace) joint[i] = 1;
        } else {
          const inner = inFace ? face.inner[i] : crown.inner[i];
          // a limestone's face is near flat, its arrises knocked: a narrow bevel into the joint, not a dark outline
          const edge = smooth(0, inFace ? 0.012 : 0.008, inner);
          // each stone set at its own angle in the face (its plane tipped a little its own way): in the light it reads
          // as a stone of its own, a little brighter or darker than its neighbours
          const tipA = ps.cool * 6.283, tipX = Math.cos(tipA), tipY = Math.sin(tipA);
          let du = um - ps.u; du -= Math.round(du / W) * W;
          const yl = inFace ? ym : ym - crownBottom * W - 0.02;
          const tip = (du * tipX + (yl - ps.y) * tipY) / Math.max(0.05, Math.max(ps.halfL, ps.halfH));
          const facet = faceF(u + ps.seed * 0.013, v + ps.seed * 0.007);
          const mottle = mottleF(u, v);
          // its own tone: warm grey-white limestone, now and then (one stone in twenty or so) a little cooler
          const cool = smooth(0.94, 0.99, ps.cool);
          const up = Math.max(-1, Math.min(1, (yl - ps.y) / Math.max(0.02, ps.halfH)));
          let light = ((inFace ? 0.62 : 0.6) + ps.tone * 0.3 + (mottle - 0.5) * 0.08 + (grain - 0.5) * 0.06 + (facet - 0.5) * 0.06)
            * (0.84 + 0.16 * edge) * (1 + tip * 0.06 + up * 0.02 - (1 - edge) * Math.max(0, -up) * 0.08);
          // the rain's streaks down the face
          if (inFace) light *= 1 - smooth(0.6, 0.82, streakF(u, v)) * 0.07;
          hslToRgb(0.105 - cool * 0.25, 0.06 - cool * 0.03, light, rgb);
          // crustose lichen: pale grey-white blooms (most stones; thicker on the crown's rubble), the odd ochre one,
          // black dots
          const crust = lichenF(u, v) * 0.7 + crustF(u, v) * 0.3;
          const pale = smooth(inFace ? 0.6 : 0.56, inFace ? 0.67 : 0.64, crust) * smooth(0.25, 0.6, ps.lichen) * edge;
          if (pale > 0) { rgb[0] += (0.93 - rgb[0]) * pale * 0.5; rgb[1] += (0.93 - rgb[1]) * pale * 0.5; rgb[2] += (0.89 - rgb[2]) * pale * 0.5; }
          if (ps.orange) {
            // (Xanthoria: small rosettes clustered on a lit stone, ochre more than orange at a wall's distance)
            const o = smooth(0.76, 0.82, dotF(u + 0.21, v + 0.13)) * smooth(0.45, 0.65, lichenF(u + 0.4, v)) * edge;
            rgb[0] += (0.78 - rgb[0]) * o * 0.55; rgb[1] += (0.6 - rgb[1]) * o * 0.55; rgb[2] += (0.34 - rgb[2]) * o * 0.55;
          }
          const dots = smooth(0.9, 0.94, dotF(u, v)) * smooth(0.5, 0.85, ps.lichen);
          if (dots > 0) { const kd = 1 - dots * 0.45; rgb[0] *= kd; rgb[1] *= kd; rgb[2] *= kd; }
          // the relief: rounded into its joints, a lumpy face, its lichen a little proud
          hgt[i] = clamp01(0.52 + edge * 0.22 + tip * 0.07 + (facet - 0.5) * 0.08 + (grain - 0.5) * 0.05 + pale * 0.02);
        }
      } else {
        // (b17) the stone band: one stone's skin — no joint — grey-white limestone, its tone wandering slowly across it
        // (a stone takes its own patch), grained and mottled, its lichen pale and patchy, black dots, a faint streak of
        // rain down it
        const t = smooth(0.2, 0.8, skinF(u, v)), mottle = mottleF(u, v), streak = streakF(u, v);
        // (b26: a broken limestone's face is no smooth skin — it is fractured into shallow facets a hand across, each
        // tipped its own way, with a crease where two meet: the stone form's big faces read as split rock, not sawn)
        const f = facets(um, ym);
        const light = (0.74 + (patchF(u, v) - 0.5) * 0.14 + t * 0.06 + (mottle - 0.5) * 0.1 + (grain - 0.5) * 0.08 - smooth(0.62, 0.9, streak) * 0.05)
          * (1 + f.tilt * 0.04); // (no line drawn where two facets meet: only their relief and their tilt show)
        hslToRgb(0.105, 0.055, light, rgb);
        const crust = lichenF(u, v) * 0.7 + crustF(u, v) * 0.3;
        const pale = smooth(0.54, 0.64, crust) * smooth(0.3, 0.6, patchF(u + 0.37, v));
        if (pale > 0) { rgb[0] += (0.9 - rgb[0]) * pale * 0.32; rgb[1] += (0.9 - rgb[1]) * pale * 0.32; rgb[2] += (0.86 - rgb[2]) * pale * 0.32; }
        const dots = smooth(0.93, 0.97, dotF(u, v));
        if (dots > 0) { const k = 1 - dots * 0.25; rgb[0] *= k; rgb[1] *= k; rgb[2] *= k; }
        hgt[i] = clamp01(0.55 + (mottle - 0.5) * 0.16 + (grain - 0.5) * 0.14 + pale * 0.04 + (t - 0.5) * 0.06 + f.height * 0.3 - f.crease * 0.015);
      }
      px[j4] = clamp01(rgb[0]) * 255; px[j4 + 1] = clamp01(rgb[1]) * 255; px[j4 + 2] = clamp01(rgb[2]) * 255; px[j4 + 3] = 255;
    }
    if ((y & 15) === 15) yield { fine: true, stage: `dry-wall-rows-${y + 1}` };
  }
  return { size, px, hgt, joint, stones: stones.map((ps) => ({ u0: ps.st.s0, u1: ps.st.s1, y0: ps.st.y0, y1: ps.st.y1 })) };
}
