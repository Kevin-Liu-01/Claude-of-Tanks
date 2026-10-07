// src/world/fieldMudSurface.ts — the adobe field walls' own mud print (the scenery lane, 2026-10-03; gauntlet wave 20
// read the mud walls as "smooth pillow- and pipe-shaped walls instead of eroded mud brick").
//
// A mud-brick wall is laid in courses of sun-dried bricks and rendered with a coat of mud and straw; the rain and the
// splash wear the render off in patches, most at the crown and the foot, and show the courses under it. One tile is
// one wall module (3 m along, 3 m round its section, inhabitKit ADOBE_UV_PER_M): the render, a warm mud, trowel-
// smoothed, flecked with straw, damp at the feet. The painter is seamless (periodic noise). Its palette is a warm mud
// under the map's plaster tone (props.ts applies it).
//
// (b14; gauntlet wave 97: "stamped rectangle decals", "rust-colored staining repeat identically roughly eight times
// across the frame") Every module of every mud wall draws this one tile, so a patch or a stain painted here repeats
// every three metres. The render is now whole and unstained along the tile: its losses (with the courses under them),
// the rain's streaks and the stains are the material's, in world space (props.ts, the mud hook). The courses are
// still painted here, for anything that asks for them by a loss (the receipt's brick checks), but no wall face reads
// a loss of this print.
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

/**
 * Paint the mud print (`size` px square; 512 on desktop, 256 on phones). Deterministic; sixteen rows a slice.
 * `withLosses` paints the old tile's patches and stains (the receipt's courses); the game's print has none.
 */
export function* paintFieldMudBuffers(size = 512, seed = 0xad0b3, withLosses = false):
  Generator<FieldMudSlice, FieldMudBuffers, void> {
  const px = new Uint8ClampedArray(size * size * 4), hgt = new Float32Array(size * size), loss = new Uint8Array(size * size);
  const k = size / 512;
  // (wave 34: the losses read as "dark-outlined exposed-brick patches stamped onto a smooth beige box" — so they are
  // broader and fewer, softly edged where the render thins out over the bricks, the bricks nearly the render's own
  // earth, their mortar the same mud a shade darker; and the render itself is weathered: a damp, splashed foot and
  // the rain's streaks down from the crown)
  const patchF = periodicField(128, 5, 3, seed + 3), edgeF = periodicField(256, 30, 1, seed + 5);
  const n1F = periodicField(128, 22, 2, seed + 7), n2F = periodicField(256, 70, 1, seed + 11);
  const stainF = periodicField(64, 4, 2, seed + 13), streakF = periodicField(256, 34, 1, seed + 17, 8);
  const brickF = periodicField(256, 60, 1, seed + 23), dampF = periodicField(128, 12, 2, seed + 19);
  const rgb = new Float32Array(3), brickRgb = new Float32Array(3);
  const courseH = size / COURSES, brickW = size / BRICKS, mortar = 1.6 * k;
  const THRESH = 0.7, SOFT = 0.07; // the render is off past THRESH, thinning over the SOFT before it
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x, j4 = i * 4;
      const u = (x + 0.5) / size, v = (y + 0.5) / size;
      const plain = v > FIELD_MUD_PLAIN_V[0] - 0.005 && v < FIELD_MUD_PLAIN_V[1] + 0.005;
      // (b14: no loss painted: the render is whole on every face; the losses are the material's, in world space)
      const patch = plain || !withLosses ? 0 : patchF(u, v) + (edgeF(u, v) - 0.5) * 0.04 + wearAt(v) * 0.26;
      const off = patch > THRESH;
      const thin = smooth(THRESH - SOFT, THRESH, patch); // 0 full render .. 1 the render gone
      const n1 = n1F(u, v), n2 = n2F(u, v), grain = hash(x, y, seed + 29);
      // the render: a warm mud, trowel-smoothed, stained, streaked down from the crown, flecked with straw
      // (b14: no stain or streak along the tile: they would repeat every module; the material lays them in world space)
      const stain = withLosses ? smooth(0.55, 0.9, stainF(u, v)) : 0;
      const below = Math.min(Math.abs(v - CROWN), 1); // the streaks run away from the crown down both faces
      const streak = withLosses ? smooth(0.62, 0.9, streakF(u, v)) * smooth(0.3, 0.02, below) : 0;
      // the foot: damp and splashed a hand or two up from the ground on both faces
      const footD = Math.min(Math.abs(v - FOOT_A), Math.abs(v - 1 - FOOT_A), Math.abs(v - FOOT_B));
      const damp = plain ? 0 : smooth(0.09, 0.02, footD + (dampF(u, v) - 0.5) * 0.04);
      const straw = grain > 0.994 ? 1 : 0;
      let l = 0.5 + n1 * 0.07 + n2 * 0.03 - stain * 0.08 - streak * 0.06 - damp * 0.09 + straw * 0.1;
      // the render's broken lip stands a little proud and catches the light just before it breaks
      const lip = plain ? 0 : smooth(THRESH - SOFT, THRESH - SOFT * 0.4, patch) * (1 - thin);
      l += lip * 0.025;
      hslToRgb(0.074 + n1 * 0.008, 0.3 - stain * 0.05 - straw * 0.1 + damp * 0.04, l, rgb);
      let h = clamp01(0.62 + n1 * 0.1 + n2 * 0.05 + lip * 0.04);
      if (thin > 0) {
        // the bricks: half bond, worn round, their mud mortar a shade darker and recessed
        const course = Math.floor(y / courseH), inY = y - course * courseH;
        const shift = (course % 2) * brickW * 0.5;
        const bx = ((x + shift) % size + size) % size, brick = Math.floor(bx / brickW), inX = bx - brick * brickW;
        // (the bricks are worn: their arrises rubbed round and ragged, the odd joint filled with the render's mud)
        const edge = Math.min(inY, courseH - inY, inX, brickW - inX) + (brickF(u, v) - 0.5) * 4.5 * k;
        const tone = hash(brick, course, seed + 31), filled = hash(brick, course, seed + 37) < 0.3 ? 1 : 0;
        const bevel = filled ? 1 : smooth(mortar * 0.3, mortar + 5 * k, edge);
        // sun-dried mud bricks: the render's own earth a shade darker and rougher, each brick its own batch; the
        // mortar the same mud, only a little darker in its recess
        hslToRgb(0.07 + tone * 0.008, 0.25 + tone * 0.04, (0.44 + tone * 0.05 + n2 * 0.04 - damp * 0.06) * (0.92 + bevel * 0.08), brickRgb);
        const bh = 0.3 + bevel * 0.21 + n2 * 0.05;
        // under a thinning render the bricks show through softly; where it is gone, the bricks alone
        const t = thin * thin * (3 - 2 * thin);
        for (let c = 0; c < 3; c++) rgb[c] += (brickRgb[c] - rgb[c]) * t;
        h += (bh - h) * t;
      }
      if (off) loss[i] = 1;
      hgt[i] = clamp01(h);
      px[j4] = clamp01(rgb[0]) * 255; px[j4 + 1] = clamp01(rgb[1]) * 255; px[j4 + 2] = clamp01(rgb[2]) * 255; px[j4 + 3] = 255;
    }
    if ((y & 15) === 15) yield { fine: true, stage: `field-mud-rows-${y + 1}` };
  }
  return { size, px, hgt, loss };
}

/**
 * Wave 34 ("clean beige boxes" standing on "a paler base strip"): a mud wall is built of the ground it stands on. On a
 * map whose ground is an earth (its light model's ground albedo an orange to yellow-brown, not a green), the map's
 * earth in sRGB 0..1; null elsewhere (the plaster tone alone colours the mud). The earth is the albedo a third more
 * saturated and a shade darker: the terrain renders its sand that much richer than a props surface of the same
 * albedo (the props' sun fade bleaches every up-facing face; the wave-34 shot measured sand 211,143,90 against the
 * apron's 200,144,102 from near-equal albedos).
 */
export function mudEarthOfGround(hex: number | null | undefined): readonly [number, number, number] | null {
  if (hex == null) return null;
  const r = ((hex >> 16) & 255) / 255, g = ((hex >> 8) & 255) / 255, b = (hex & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (d < 1e-6) return null;
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = ((h / 6) % 1 + 1) % 1;
  if (!(h >= 0.02 && h <= 0.14 && s >= 0.15)) return null;
  const s2 = Math.min(0.6, s * 1.35), l2 = l * 0.95;
  const q = l2 < 0.5 ? l2 * (1 + s2) : l2 + s2 - l2 * s2, p = 2 * l2 - q;
  const channel = (t: number) => {
    t = ((t % 1) + 1) % 1;
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
  };
  return [channel(h + 1 / 3), channel(h), channel(h - 1 / 3)];
}

/**
 * Take the toned mud print toward the map's earth (`earth`, sRGB 0..1), in linear light, its texture kept: the wall's
 * rows most of the way (EARTH_WALL), the plain band — the mud and sand fallen at its foot, the apron's — all the way.
 */
export function tintFieldMudToEarth(px: Uint8ClampedArray, size: number, earth: readonly [number, number, number]): void {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const enc = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
  const target = earth.map(lin);
  const p0 = Math.floor((FIELD_MUD_PLAIN_V[0] - 0.005) * size), p1 = Math.ceil((FIELD_MUD_PLAIN_V[1] + 0.005) * size);
  const plainRow = (y: number) => y >= p0 && y < p1;
  const mean = (plain: boolean) => {
    const m = [0, 0, 0];
    let n = 0;
    for (let y = 0; y < size; y++) {
      if (plainRow(y) !== plain) continue;
      for (let x = 0; x < size; x++) { const i = (y * size + x) * 4; for (let c = 0; c < 3; c++) m[c] += lin(px[i + c] / 255); n++; }
    }
    return m.map((v) => v / Math.max(1, n));
  };
  const wall = mean(false), band = mean(true);
  const kWall = wall.map((m, c) => 1 + (target[c] / Math.max(1e-4, m) - 1) * EARTH_WALL);
  const kBand = band.map((m, c) => target[c] / Math.max(1e-4, m));
  for (let y = 0; y < size; y++) {
    const k = plainRow(y) ? kBand : kWall;
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) px[i + c] = Math.min(255, enc(Math.min(1, lin(px[i + c] / 255) * k[c])) * 255);
    }
  }
}

/** How far a wall's render goes toward its earth (the render's straw and its drying keep it a little its own). */
export const EARTH_WALL = 0.7;
