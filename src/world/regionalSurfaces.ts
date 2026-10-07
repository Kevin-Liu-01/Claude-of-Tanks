// src/world/regionalSurfaces.ts — the regional architecture kits' roof and masonry surfaces (regional-buildings
// lane, 2026-10-03). First-party procedural painters, seamless (periodic lattice noise, every course and column ends
// on the tile edge), in the props surface convention: an sRGB albedo, a tangent normal map from a height field and the
// packed ORM surface (R = AO, G = roughness, B = 0). A style picks one roof and one stone painter for its map; the
// textures replace the props roof / stone canvases, so the kit adds no material and no draw call.
//
// Physical scale: the kits map these tiles at 0.5 repeats per metre (2 m per tile): a 256 px roof tile is 128 px/m,
// a 512 px stone tile 256 px/m. Roof UVs run v DOWN the slope (regional/house.ts); with the canvas flipped on upload,
// down-slope is toward canvas row 0, so a course's exposed tail points to smaller y.
import * as THREE from 'three';
import { normalTextureFromHeight as normalFromHeight, textureFromRgbaPixels as toTexture } from './proceduralTexture.ts';
import type { ConcreteSurfaceKind, RoofSurfaceKind, StoneSurfaceKind } from './maps/regional/types.ts';

export interface RegionalSurfaceTextures {
  albedo: THREE.Texture;
  normal: THREE.Texture;
  surface: THREE.Texture;
}

export interface SurfaceSlice { fine: true; stage: string }

type Tint = readonly [number, number, number];

// ------------------------------------------------------------------------------------------------ noise

function hash2(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Periodic value noise in [0, 1]: lattice `cells` per tile, so f(x + size) = f(x). */
function pnoise(x: number, y: number, size: number, cells: number, seed: number): number {
  const fx = x / size * cells, fy = y / size * cells;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = fx - x0, ty = fy - y0;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const w = (v: number) => ((v % cells) + cells) % cells;
  const a = hash2(w(x0), w(y0), seed), b = hash2(w(x0 + 1), w(y0), seed);
  const c = hash2(w(x0), w(y0 + 1), seed), d = hash2(w(x0 + 1), w(y0 + 1), seed);
  return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
}

/** Anisotropic periodic value noise in [0, 1]: `cx` lattice cells across the tile in x, `cy` in y (period the tile). */
function pnoise2(x: number, y: number, size: number, cx: number, cy: number, seed: number): number {
  const fx = x / size * cx, fy = y / size * cy;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = fx - x0, ty = fy - y0;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const wx = (v: number) => ((v % cx) + cx) % cx, wy = (v: number) => ((v % cy) + cy) % cy;
  const a = hash2(wx(x0), wy(y0), seed), b = hash2(wx(x0 + 1), wy(y0), seed);
  const c = hash2(wx(x0), wy(y0 + 1), seed), d = hash2(wx(x0 + 1), wy(y0 + 1), seed);
  return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
}

/**
 * A precomputed periodic fractal field sampled bilinearly: low-frequency noise (weathering, lichen, bedding) costs
 * a few reads per pixel instead of a dozen lattice hashes.
 */
function field(size: number, res: number, cells: number, octaves: number, seed: number): (x: number, y: number) => number {
  const g = new Float32Array(res * res);
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
    const x = i / res * size, y = j / res * size;
    let v = 0, amp = 1, c = cells, total = 0;
    for (let o = 0; o < octaves; o++) { v += pnoise(x, y, size, c, seed + o * 11) * amp; total += amp; amp *= 0.55; c *= 2; }
    g[j * res + i] = v / total;
  }
  const k = res / size;
  return (x: number, y: number) => {
    const fx = x * k, fy = y * k;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const i0 = ((x0 % res) + res) % res, j0 = ((y0 % res) + res) % res, i1 = (i0 + 1) % res, j1 = (j0 + 1) % res;
    const a = g[j0 * res + i0], b = g[j0 * res + i1], c = g[j1 * res + i0], d = g[j1 * res + i1];
    return a + (b - a) * tx + (c - a + (a - b - c + d) * tx) * ty;
  };
}

const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

function surfaceFromHeight(h: Float32Array, rough: Float32Array, s: number, anisotropy: number, aoMin: number): THREE.CanvasTexture {
  const px = new Uint8ClampedArray(s * s * 4);
  for (let i = 0; i < h.length; i++) {
    const j = i * 4;
    px[j] = (aoMin + clamp(h[i]) * (1 - aoMin)) * 255;
    px[j + 1] = clamp(rough[i]) * 255;
    px[j + 2] = 0;
    px[j + 3] = 255;
  }
  return toTexture(px, s, { anisotropy });
}

function finish(px: Uint8ClampedArray, hgt: Float32Array, rough: Float32Array, s: number, anisotropy: number,
  normalStrength: number, aoMin: number): RegionalSurfaceTextures {
  return {
    albedo: toTexture(px, s, { srgb: true, anisotropy }),
    normal: normalFromHeight(hgt, s, normalStrength, anisotropy),
    surface: surfaceFromHeight(hgt, rough, s, anisotropy, aoMin),
  };
}

/** sRGB 0..1 channel write with a multiplier tint. */
function put(px: Uint8ClampedArray, j: number, r: number, g: number, b: number): void {
  px[j] = clamp(r) * 255; px[j + 1] = clamp(g) * 255; px[j + 2] = clamp(b) * 255; px[j + 3] = 255;
}

// ------------------------------------------------------------------------------------------------ render

const _lime = new THREE.Color();

/**
 * Lime-wash over mud plaster (the facades lane, 2026-10-05; gauntlet wave 116 on Verdant: the khatas and the church
 * carried "a grey stone-chip texture instead of lime-wash"): coats of lime brushed on in long strokes and a cross coat,
 * soft and matt, thinner where the brush ran dry so the warm mud under it shows faintly; the wall beneath hand-plastered
 * and gently wavy, never chipped or pebbled. Seamless (periodic noise). In the props plaster convention (props.ts
 * makePlaster): a warm, low-saturation mid-grey that the kit's tone turns to its white or blue, and the height its
 * normal and surface maps are drawn from.
 */
export function paintLimewash(s: number, seed: number): { px: Uint8ClampedArray; hgt: Float32Array } {
  const px = new Uint8ClampedArray(s * s * 4), hgt = new Float32Array(s * s);
  const lum = new Float32Array(s * s), ridge = new Float32Array(s * s);
  // the brush: short dabs laid in two coats — a first of near-level strokes, a cross coat of near-upright ones — each
  // dab its own load of lime (a shade lighter or darker), fading where the brush lifted, striated by its bristles;
  // drawn with wrap-around so the tile stays seamless
  let n = 0;
  const rnd = () => hash2(n++, 7, seed + 31);
  const dabs = Math.round(220 * (s / 256) * (s / 256));
  for (let d = 0; d < dabs; d++) {
    const cross = d >= dabs * 0.62;
    const ang = (cross ? Math.PI / 2 : 0) + (rnd() - 0.5) * 1.1;
    const len = (36 + rnd() * 60) * s / 256, wid = (9 + rnd() * 10) * s / 256;
    const cx = rnd() * s, cy = rnd() * s, load = (rnd() - 0.5) * 0.04, phase = rnd() * 6.283, freq = 0.9 + rnd() * 0.8;
    const ca = Math.cos(ang), sa = Math.sin(ang), r = Math.ceil(len / 2 + wid);
    for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
      const a = (ox * ca + oy * sa) / (len / 2), b = (-ox * sa + oy * ca) / (wid / 2);
      if (a * a + b * b > 1) continue;
      const w = (1 - a * a) * (1 - Math.abs(b)) * (cross ? 0.7 : 1);
      const stri = Math.sin(b * wid * freq * 1.1 + phase);
      const x = ((Math.floor(cx) + ox) % s + s) % s, y = ((Math.floor(cy) + oy) % s + s) % s, i = y * s + x;
      lum[i] += w * (load + stri * 0.006);
      ridge[i] += w * (0.25 + stri * 0.07);
    }
  }
  const body = field(s, 64, 3, 3, seed + 3);
  const thinF = field(s, 128, 9, 3, seed + 7);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const i = y * s + x, j = i * 4;
    const b = body(x, y), grain = pnoise(x, y, s, 96, seed + 29);
    // thin coats where the brush ran dry, the warm mud faintly through them: small and few, and warm rather than grey
    // (wave 150: grey blotches made "whitewashed clay read as granite")
    const thin = smooth(0.72, 0.92, thinF(x, y)) * clamp(1 - ridge[i] * 0.8);
    const l = 0.5 + (b - 0.5) * 0.02 + clamp(lum[i], -0.04, 0.04) + (grain - 0.5) * 0.01 - thin * 0.035;
    _lime.setHSL(0.085 - thin * 0.01, 0.1 + thin * 0.45, l);
    px[j] = _lime.r * 255; px[j + 1] = _lime.g * 255; px[j + 2] = _lime.b * 255; px[j + 3] = 255;
    hgt[i] = clamp(0.5 + (b - 0.5) * 0.6 + clamp(ridge[i], 0, 0.6) * 0.25 - thin * 0.05);
  }
  return { px, hgt };
}

// ------------------------------------------------------------------------------------------------ roofs

/** Plain clay tiles (Biberschwanz): double-lap courses, each offset half a tile, a segmental tail on every tile. */
function* beavertail(s: number, tint: Tint, seed: number): Generator<SurfaceSlice, [Uint8ClampedArray, Float32Array, Float32Array], void> {
  const px = new Uint8ClampedArray(s * s * 4), hgt = new Float32Array(s * s), rough = new Float32Array(s * s);
  const cols = 11, rows = 14, tw = s / cols, ch = s / rows;
  const grainF = field(s, s, 32, 2, seed + 3), weatherF = field(s, 64, 6, 3, seed + 5), lichenF = field(s, 128, 12, 3, seed + 9);
  const tileAt = (x: number, row: number) => {
    const off = (row & 1) ? tw / 2 : 0;
    const col = Math.floor(((x + off) % s + s) % s / tw);
    const fx = (((x + off) % s + s) % s) / tw - col; // 0..1 across the tile
    return { col, fx };
  };
  for (let y = 0; y < s; y++) {
    const row = Math.floor(y / ch), fy = (y - row * ch) / ch; // fy 0 at the tail (eave side) of this band
    for (let x = 0; x < s; x++) {
      const i = y * s + x, j = i * 4;
      // the next course up-slope (row + 1) overlaps this band's ridge side with its segmental tails
      const up = tileAt(x, row + 1), here = tileAt(x, row);
      const tail = 0.34 * Math.sqrt(Math.max(0, 1 - Math.pow((up.fx - 0.5) * 2, 2)));
      const onUp = fy > 1 - tail;
      const t = onUp ? up : here;
      const r = onUp ? (row + 1) % rows : row;
      const k = hash2(t.col, r, seed);
      const k2 = hash2(t.col, r, seed + 7);
      const fyT = onUp ? (fy - (1 - tail)) / Math.max(1e-3, tail) * 0.25 : fy * 0.75 + 0.25;
      // joints between neighbouring tiles of a course, and the shadow the overlapping tails cast down-slope
      const joint = Math.min(t.fx, 1 - t.fx) < 0.045 ? 1 : 0;
      const edgeUp = onUp ? 0 : Math.max(0, 1 - ((1 - tail) - fy) / 0.16);
      const curve = Math.sin(t.fx * Math.PI);
      const grain = grainF(x, y);
      const weather = weatherF(x, y);
      const lichen = smooth(0.68, 0.86, lichenF(x, y)) * smooth(0.45, 0.8, k2);
      const soot = smooth(0.55, 0.85, weather) * 0.25;
      let v = 0.78 + k * 0.32 + curve * 0.08 + (grain - 0.5) * 0.12 - soot;
      v *= 1 - edgeUp * 0.38 - joint * 0.45;
      const hueShift = (k2 - 0.5) * 0.16;
      let rr = tint[0] * v * (1 + hueShift), gg = tint[1] * v * (1 - hueShift * 0.4), bb = tint[2] * v * (1 - hueShift * 0.6);
      rr = rr * (1 - lichen) + 0.52 * lichen; gg = gg * (1 - lichen) + 0.50 * lichen; bb = bb * (1 - lichen) + 0.40 * lichen;
      put(px, j, rr, gg, bb);
      hgt[i] = clamp((onUp ? 0.62 : 0.3 + 0.28 * (1 - fyT)) + curve * 0.14 - joint * 0.3 - edgeUp * 0.12);
      rough[i] = clamp(0.78 + (1 - curve) * 0.08 + lichen * 0.1 + joint * 0.1);
    }
    if ((y & 15) === 15) yield { fine: true, stage: `roof-beavertail-${y + 1}` };
  }
  return [px, hgt, rough];
}

/** Mediterranean canal tiles (kupe kanalice): convex covers over concave pans in columns down the slope. */
function* canal(s: number, tint: Tint, seed: number): Generator<SurfaceSlice, [Uint8ClampedArray, Float32Array, Float32Array], void> {
  const px = new Uint8ClampedArray(s * s * 4), hgt = new Float32Array(s * s), rough = new Float32Array(s * s);
  const pairs = 5, pw = s / pairs, rowsN = 5, rl = s / rowsN;
  const lichenF = field(s, 128, 10, 3, seed + 4), fadeF = field(s, 64, 4, 3, seed + 6);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const i = y * s + x, j = i * 4;
      const pair = Math.floor(x / pw), fx = x / pw - pair; // 0..1 across a pan + cover pair
      const cover = fx >= 0.42; // the convex cover takes the right 58 %
      const lx = cover ? (fx - 0.42) / 0.58 : fx / 0.42;
      const stagger = cover ? 0.5 : 0;
      const yy = (y / rl + stagger + hash2(pair, cover ? 1 : 0, seed) * 0.3) % rowsN;
      const row = Math.floor(yy), fy = yy - row; // 0 at the tail end of the tile (down-slope)
      const k = hash2(pair * 2 + (cover ? 1 : 0), row, seed + 1);
      const k2 = hash2(pair * 2 + (cover ? 1 : 0), row, seed + 2);
      const prof = Math.sin(lx * Math.PI); // cover crown / pan trough
      // a lap seam where the tile above starts: a thin dark line and a shadow under the tail
      const lap = fy < 0.05 ? 1 : 0;
      const shadowTail = cover ? smooth(0.0, 0.12, fy) : 1;
      const grime = (1 - prof) * (cover ? 0.35 : 0.15) + (cover ? 0 : 0.18);
      // grey-ochre crust lichen, a partial veil over the clay (never a white blot)
      const lichen = smooth(0.64, 0.86, lichenF(x, y)) * (cover ? 0.55 : 0.25) * smooth(0.3, 0.7, k2);
      const fade = fadeF(x, y);
      let v = (0.74 + k * 0.38) * (0.88 + prof * 0.18) - grime * 0.35;
      v *= 0.65 + 0.35 * shadowTail;
      v *= 1 - lap * 0.35;
      const pale = smooth(0.4, 0.9, fade) * 0.35 + k2 * 0.15; // sun-bleached tiles go toward pale ochre
      let rr = tint[0] * v * (1 + pale * 0.15), gg = tint[1] * v * (1 + pale * 0.45), bb = tint[2] * v * (1 + pale * 0.55);
      rr = rr * (1 - lichen) + 0.6 * lichen; gg = gg * (1 - lichen) + 0.57 * lichen; bb = bb * (1 - lichen) + 0.47 * lichen;
      put(px, j, rr, gg, bb);
      hgt[i] = clamp((cover ? 0.45 + prof * 0.5 : 0.35 - prof * 0.25) - lap * 0.2);
      rough[i] = clamp(0.74 + (cover ? 0 : 0.08) + lichen * 0.12);
    }
    if ((y & 15) === 15) yield { fine: true, stage: `roof-canal-${y + 1}` };
  }
  return [px, hgt, rough];
}

/** Natural slate: small rectangular slates in half-offset courses, ragged tails, blue-grey with rust and lichen. */
function* slate(s: number, tint: Tint, seed: number): Generator<SurfaceSlice, [Uint8ClampedArray, Float32Array, Float32Array], void> {
  const px = new Uint8ClampedArray(s * s * 4), hgt = new Float32Array(s * s), rough = new Float32Array(s * s);
  const cols = 9, rows = 16, tw = s / cols, ch = s / rows;
  const grainF = field(s, s, 48, 1, seed + 4), lichenF = field(s, 128, 14, 3, seed + 6);
  for (let y = 0; y < s; y++) {
    const row = Math.floor(y / ch), fy = (y - row * ch) / ch;
    const off = (row & 1) ? tw / 2 : 0;
    for (let x = 0; x < s; x++) {
      const i = y * s + x, j = i * 4;
      const xx = ((x + off) % s + s) % s;
      const col = Math.floor(xx / tw), fx = xx / tw - col;
      const k = hash2(col, row, seed), k2 = hash2(col, row, seed + 3), k3 = hash2(col, row, seed + 8);
      // a ragged tail: each slate's down-slope edge sits a few pixels off the course line
      const tailJ = (k3 - 0.5) * 0.18;
      const shadow = fy + tailJ < 0.14 ? 1 - (fy + tailJ) / 0.14 : 0;
      const joint = Math.min(fx, 1 - fx) < 0.035 ? 1 : 0;
      const grain = grainF(x, (y * 3) % s);
      const rust = smooth(0.78, 0.95, k2) * 0.6;
      const lichen = smooth(0.72, 0.88, lichenF(x, y)) * smooth(0.5, 0.9, k);
      let v = 0.7 + k * 0.42 + (grain - 0.5) * 0.18;
      v *= 1 - shadow * 0.5 - joint * 0.4;
      let rr = tint[0] * v, gg = tint[1] * v, bb = tint[2] * v;
      rr = rr * (1 - rust) + 0.42 * v * rust; gg = gg * (1 - rust) + 0.30 * v * rust; bb = bb * (1 - rust) + 0.22 * v * rust;
      rr = rr * (1 - lichen) + 0.72 * lichen; gg = gg * (1 - lichen) + 0.62 * lichen; bb = bb * (1 - lichen) + 0.30 * lichen;
      put(px, j, rr, gg, bb);
      hgt[i] = clamp(0.35 + (1 - fy) * 0.35 + grain * 0.15 - joint * 0.3 - shadow * 0.15);
      rough[i] = clamp(0.62 + (grain - 0.5) * 0.12 + lichen * 0.25 + rust * 0.1);
    }
    if ((y & 15) === 15) yield { fine: true, stage: `roof-slate-${y + 1}` };
  }
  return [px, hgt, rough];
}

/** Clay pantiles (Hollandse pannen): S-section tiles, one roll per tile, half-offset laps. */
function* pantile(s: number, tint: Tint, seed: number): Generator<SurfaceSlice, [Uint8ClampedArray, Float32Array, Float32Array], void> {
  const px = new Uint8ClampedArray(s * s * 4), hgt = new Float32Array(s * s), rough = new Float32Array(s * s);
  const cols = 7, rows = 7, tw = s / cols, ch = s / rows;
  const lichenF = field(s, 128, 12, 3, seed + 3);
  for (let y = 0; y < s; y++) {
    const row = Math.floor(y / ch), fy = (y - row * ch) / ch;
    for (let x = 0; x < s; x++) {
      const i = y * s + x, j = i * 4;
      const col = Math.floor(x / tw), fx = x / tw - col;
      const k = hash2(col, row, seed), k2 = hash2(col, row, seed + 5);
      const roll = Math.sin(Math.min(1, fx / 0.62) * Math.PI) * (fx < 0.62 ? 1 : 0) - (fx >= 0.62 ? Math.sin((fx - 0.62) / 0.38 * Math.PI) * 0.5 : 0);
      const lap = fy < 0.07 ? 1 - fy / 0.07 : 0;
      const lichen = smooth(0.7, 0.86, lichenF(x, y)) * smooth(0.4, 0.9, k2);
      let v = (0.78 + k * 0.3) * (0.82 + roll * 0.22);
      v *= 1 - lap * 0.45;
      let rr = tint[0] * v, gg = tint[1] * v, bb = tint[2] * v;
      rr = rr * (1 - lichen) + 0.5 * lichen; gg = gg * (1 - lichen) + 0.5 * lichen; bb = bb * (1 - lichen) + 0.38 * lichen;
      put(px, j, rr, gg, bb);
      hgt[i] = clamp(0.45 + roll * 0.4 - lap * 0.25);
      rough[i] = clamp(0.7 + lichen * 0.15);
    }
    if ((y & 15) === 15) yield { fine: true, stage: `roof-pantile-${y + 1}` };
  }
  return [px, hgt, rough];
}

/** Corrugated iron sheet: galvanised or painted, lapped sheets, rust runs from the laps and nail lines. */
function* sheet(s: number, tint: Tint, seed: number): Generator<SurfaceSlice, [Uint8ClampedArray, Float32Array, Float32Array], void> {
  const px = new Uint8ClampedArray(s * s * 4), hgt = new Float32Array(s * s), rough = new Float32Array(s * s);
  const pitch = s / 26, sheetW = s / 3, sheetL = s / 2;
  const runsF = field(s, 256, 24, 2, seed + 2), rustF = field(s, 128, 8, 3, seed + 4);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const i = y * s + x, j = i * 4;
      const c = Math.sin(x / pitch * Math.PI * 2) * 0.5 + 0.5;
      const sx = Math.floor(x / sheetW), sy = Math.floor(y / sheetL);
      const k = hash2(sx, sy, seed);
      const lap = (y % sheetL) < 3 ? 1 : 0;
      // rust runs hang in vertical streaks below each lap
      const runs = smooth(0.58, 0.85, runsF(x, (y * 0.12) % s)) * smooth(0.0, 0.6, 1 - (y % sheetL) / sheetL);
      const rust = clamp(runs * 0.8 + smooth(0.7, 0.9, rustF(x, y)) * 0.6 + k * 0.2);
      let v = 0.62 + c * 0.25 + k * 0.12 - lap * 0.25;
      let rr = tint[0] * v, gg = tint[1] * v, bb = tint[2] * v;
      rr = rr * (1 - rust) + 0.36 * rust * (0.8 + c * 0.3); gg = gg * (1 - rust) + 0.17 * rust; bb = bb * (1 - rust) + 0.08 * rust;
      put(px, j, rr, gg, bb);
      hgt[i] = clamp(0.3 + c * 0.6 - lap * 0.2);
      rough[i] = clamp(0.42 + rust * 0.45 + (1 - c) * 0.06);
    }
    if ((y & 15) === 15) yield { fine: true, stage: `roof-sheet-${y + 1}` };
  }
  return [px, hgt, rough];
}

/** Corrugated asbestos-cement sheet (shifer): a soft wave, grey, lapped sheets, lichen and soot, no rust. */
function* asbestos(s: number, tint: Tint, seed: number): Generator<SurfaceSlice, [Uint8ClampedArray, Float32Array, Float32Array], void> {
  const px = new Uint8ClampedArray(s * s * 4), hgt = new Float32Array(s * s), rough = new Float32Array(s * s);
  const waves = 14, sheetW = s / 2, sheetL = s / 2;
  const lichenF = field(s, 128, 10, 3, seed + 3), sootF = field(s, 64, 5, 3, seed + 6), runsF = field(s, 256, 32, 1, seed + 8);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const i = y * s + x, j = i * 4;
      const wave = Math.sin(x / s * waves * Math.PI * 2) * 0.5 + 0.5;
      const sx = Math.floor(x / sheetW), sy = Math.floor(y / sheetL);
      const k = hash2(sx, sy, seed);
      const lap = (y % sheetL) < 3 ? 1 : 0, side = (x % sheetW) < 2 ? 1 : 0;
      const lichen = smooth(0.66, 0.84, lichenF(x, y)) * (0.6 + 0.4 * wave);
      const soot = smooth(0.55, 0.9, sootF(x, y)) * 0.3 + smooth(0.62, 0.9, runsF(x, (y * 0.1) % s)) * 0.12;
      let v = (0.82 + k * 0.14) * (0.86 + wave * 0.2) - soot - lap * 0.18 - side * 0.1;
      let rr = tint[0] * v, gg = tint[1] * v, bb = tint[2] * v;
      rr = rr * (1 - lichen) + 0.42 * lichen; gg = gg * (1 - lichen) + 0.44 * lichen; bb = bb * (1 - lichen) + 0.30 * lichen;
      put(px, j, rr, gg, bb);
      hgt[i] = clamp(0.3 + wave * 0.55 - lap * 0.2);
      rough[i] = clamp(0.86 + lichen * 0.1);
    }
    if ((y & 15) === 15) yield { fine: true, stage: `roof-asbestos-${y + 1}` };
  }
  return [px, hgt, rough];
}

// ------------------------------------------------------------------------------------------------ masonry

/** Course edges summing exactly to the tile, so courses tile vertically. */
function courseEdges(size: number, min: number, max: number, seed: number): number[] {
  const out = [0];
  let k = 0;
  while (out[out.length - 1] < size) {
    let next = out[out.length - 1] + min + Math.floor(hash2(k++, 0, seed) * (max - min));
    if (size - next < min * 0.8) next = size;
    out.push(Math.min(size, next));
  }
  return out;
}

interface MasonryRecipe {
  courseMin: number; courseMax: number;
  blockMin: number; blockMax: number;
  mortar: number; // joint half-width (px)
  mortarTint: Tint;
  tint: Tint;
  /** per-block value spread, per-block hue spread */
  spread: number; hue: number;
  /** surface roughness of the stone face (normal relief of the block face) */
  relief: number;
  /** pillowed (rounded) block faces 0..1 */
  pillow: number;
  /** speckle (granite mica) amount */
  speckle: number;
  /** lichen amount */
  lichen: number;
  /** soot / weathering darkening */
  grime: number;
  /** random rubble: blocks split within a course */
  rubble: number;
  /** sedimentary bedding stripes (sandstone, limestone) */
  bedding?: number;
  /** the cloudy tone variation inside one stone (default 0.3; dressed stone is even) */
  mottle?: number;
  /** soiling: rain runs washing grime down the face from every ledge (0 none) */
  streaks?: number;
  /**
   * the share of its stone's own tone a joint takes (0: the recipe's mortarTint alone): lime mortar weathered to the
   * stone it binds, so the joints read as the gaps between stones, not as a pale or dark grid drawn over them
   */
  mortarOfStone?: number;
  /** the face's rise from its arris to its middle (the pillow's height; default 0.45): squared stone stays nearly flat */
  faceRamp?: number;
}

const MASONRY: Readonly<Record<StoneSurfaceKind, MasonryRecipe>> = Object.freeze({
  // (wave 199 on Frontier's red Buntsandstein: courses of 20-36 cm under pale mortar with pillowed faces read as "brick at
  // roughly twice real size, thick pale mortar, bevelled pillow-faced bricks") squared stone's own proportions — courses of
  // 23-44 cm, blocks of 0.4-1.0 m, some split — under tight joints in the stone's own tone, nearly flat-faced
  sandstone: { courseMin: 58, courseMax: 112, blockMin: 104, blockMax: 260, mortar: 1.3, mortarTint: [0.62, 0.57, 0.52], mortarOfStone: 0.6,
    tint: [1, 1, 1], spread: 0.2, hue: 0.1, relief: 0.4, pillow: 0.14, faceRamp: 0.16, speckle: 0.05, lichen: 0.3, grime: 0.4, rubble: 0.25,
    bedding: 0.035, mottle: 0.34 },
  // 2026-10-03 gauntlet wave 0 / kits v1 captures: the first limestone and granite read as a blue-grey checkerboard (one
  // tone a block, dark pillowed joints): the stones are smaller and more irregular, the tone moves within a stone more
  // than between stones, and the joints are pale lime mortar, not shadow
  // 2026-10-03 w2 review against Pucisca (Brac): dressed Brac stone is near-white and even, laid in long courses with tight
  // joints; the first recipe's grey-green lichen and tan-grey swing between stones read as a patchwork wallpaper
  limestone: { courseMin: 40, courseMax: 84, blockMin: 70, blockMax: 180, mortar: 2.0, mortarTint: [0.84, 0.81, 0.75],
    tint: [1, 1, 1], spread: 0.06, hue: 0.02, relief: 0.5, pillow: 0.25, speckle: 0, lichen: 0.1, grime: 0.18, rubble: 0.25, bedding: 0.03,
    mottle: 0.16 },
  granite: { courseMin: 38, courseMax: 96, blockMin: 56, blockMax: 176, mortar: 2.8, mortarTint: [0.7, 0.68, 0.63],
    tint: [1, 1, 1], spread: 0.11, hue: 0.05, relief: 0.6, pillow: 0.5, speckle: 0.7, lichen: 0.5, grime: 0.3, rubble: 0.55 },
  brick: { courseMin: 20, courseMax: 21, blockMin: 62, blockMax: 63, mortar: 1.6, mortarTint: [0.62, 0.6, 0.56],
    tint: [1, 1, 1], spread: 0.22, hue: 0.06, relief: 0.2, pillow: 0.15, speckle: 0.15, lichen: 0.08, grime: 0.3, rubble: 0 },
  greywacke: { courseMin: 34, courseMax: 80, blockMin: 60, blockMax: 170, mortar: 3.2, mortarTint: [0.5, 0.49, 0.46],
    tint: [1, 1, 1], spread: 0.2, hue: 0.04, relief: 0.7, pillow: 0.5, speckle: 0.2, lichen: 0.3, grime: 0.35, rubble: 0.5 },
  rubble: { courseMin: 36, courseMax: 90, blockMin: 50, blockMax: 160, mortar: 4.2, mortarTint: [0.66, 0.62, 0.55],
    tint: [1, 1, 1], spread: 0.22, hue: 0.06, relief: 0.75, pillow: 0.7, speckle: 0.1, lichen: 0.2, grime: 0.3, rubble: 0.7 },
  // (the map-revival lane, 2026-10-06, Titan round 3: the rubble kind's pale lime joints between brick-sized stones read
  // as "a red-brick schoolhouse") field stone laid up in mud: big irregular blocks, 0.25-0.5 m courses split within,
  // 0.4-1 m long, in a mortar of the same red earth a shade darker, so the joints carry no grid
  fieldstone: { courseMin: 64, courseMax: 128, blockMin: 96, blockMax: 250, mortar: 3.2, mortarTint: [0.52, 0.38, 0.3],
    tint: [1, 1, 1], spread: 0.22, hue: 0.07, relief: 0.8, pillow: 0.6, speckle: 0.04, lichen: 0.04, grime: 0.32, rubble: 0.6,
    bedding: 0.07, mottle: 0.4 },
  // concrete masonry units (0.4 x 0.2 m hollow blocks in running bond): plinths, godowns, desert houses
  block: { courseMin: 51, courseMax: 52, blockMin: 102, blockMax: 103, mortar: 1.5, mortarTint: [0.7, 0.69, 0.66],
    tint: [1, 1, 1], spread: 0.08, hue: 0.02, relief: 0.25, pillow: 0.05, speckle: 0.35, lichen: 0.05, grime: 0.45, rubble: 0 },
});

/**
 * A town's dressed stone over a kind's recipe (the facades lane, 2026-10-05; gauntlet wave 116 on Steinburg: "oversized
 * clean ashlar"): soiled — rain runs down the face from every course, grime in the joints. A style asks for it with
 * `stone.dressed`.
 */
// (wave 150: courses of 15-26 cm under light mortar read as "brick at two to three times real scale") ashlar's own
// proportions — courses of 22-34 cm, blocks of 45-90 cm — under tight dark joints, each block its own tone and bedding
// (wave 199 on Steinburg's shops: "a large-scale tan ashlar texture with heavy dark outlines") the joints thinner and in
// the stone's own tone, darker than its face only by the shadow they hold
// (r6 views, round 4: the shop fronts still read as a grid of orange and grey blocks) one stone's tone close to the
// next's, the broad grime clouds lighter: the soiling runs and the joints' shadow carry the wall
const DRESSED: Partial<MasonryRecipe> = Object.freeze({ courseMin: 56, courseMax: 88, blockMin: 115, blockMax: 230, mortar: 0.8,
  mortarTint: [0.42, 0.39, 0.36] as Tint, mortarOfStone: 0.7, spread: 0.1, hue: 0.04, relief: 0.35, pillow: 0.12, faceRamp: 0.16,
  speckle: 0.04, lichen: 0.22, grime: 0.55, rubble: 0.15, bedding: 0.05, mottle: 0.36, streaks: 0.55 });

/** One course of a stone tile's layout: its rows (canvas px, from the top) and its blocks' columns. */
export interface MasonryCourse { y0: number; y1: number; blocks: ReadonlyArray<{ x0: number; x1: number; split: boolean }> }
/** A stone tile's block layout (masonryLayout). */
export interface MasonryLayout { size: number; mortar: number; wobble: number; courses: readonly MasonryCourse[] }

/**
 * The block layout masonry() paints for a kind (canvas px, rows from the top; a block the rubble rule splits flagged),
 * with the joint's half-width and its wander: a part can map one stone of the tile onto itself (the facade craft's
 * dressed quoins, maps/regional/facade.ts dressedQuoin). (facades lane, 2026-10-06)
 */
export function masonryLayout(kind: StoneSurfaceKind, dressed = false, seed = 0x51a7, s = 512): MasonryLayout {
  const R: MasonryRecipe = dressed ? { ...MASONRY[kind], ...DRESSED } : MASONRY[kind];
  const rowsE = courseEdges(s, R.courseMin, R.courseMax + 1, seed);
  const courses: MasonryCourse[] = [];
  for (let r = 0; r + 1 < rowsE.length; r++) {
    let edges: number[];
    if (kind === 'brick' || kind === 'block') {
      const n = Math.round(s / R.blockMin), w = s / n, off = (r & 1) ? w / 2 : 0;
      edges = [0];
      for (let k = 0; k <= n; k++) { const v = k * w + off; if (v > 0 && v < s) edges.push(v); }
      edges.push(s);
    } else edges = courseEdges(s, R.blockMin, R.blockMax + 1, seed + 101 + r * 7);
    const blocks = [];
    for (let c = 0; c + 1 < edges.length; c++) blocks.push({ x0: edges[c], x1: edges[c + 1], split: R.rubble > 0 && hash2(c, r, seed + 31) < R.rubble });
    courses.push({ y0: rowsE[r], y1: rowsE[r + 1], blocks });
  }
  return { size: s, mortar: R.mortar, wobble: 1.2 + R.relief * 2.4, courses };
}

function* masonry(s: number, kind: StoneSurfaceKind, tint: Tint, seed: number, dressed = false): Generator<SurfaceSlice, [Uint8ClampedArray, Float32Array, Float32Array], void> {
  const R: MasonryRecipe = dressed ? { ...MASONRY[kind], ...DRESSED } : MASONRY[kind];
  const px = new Uint8ClampedArray(s * s * 4), hgt = new Float32Array(s * s), rough = new Float32Array(s * s);
  const rowsE = courseEdges(s, R.courseMin, R.courseMax + 1, seed);
  const colsE: number[][] = [];
  for (let r = 0; r + 1 < rowsE.length; r++) {
    if (kind === 'brick' || kind === 'block') {
      // English-ish running bond: stretchers half-offset course to course, every edge on the tile grid
      const n = Math.round(s / R.blockMin), w = s / n, off = (r & 1) ? w / 2 : 0;
      const e = [0];
      for (let k = 0; k <= n; k++) { const v = k * w + off; if (v > 0 && v < s) e.push(v); }
      e.push(s);
      colsE.push(e);
    } else colsE.push(courseEdges(s, R.blockMin, R.blockMax + 1, seed + 101 + r * 7));
  }
  const find = (edges: number[], v: number) => { let i = 0; while (edges[i + 1] <= v) i++; return i; };
  const wobF = field(s, 256, 64, 1, seed + 13), texF = field(s, s, 48, 2, seed + 5), bigF = field(s, 64, 6, 3, seed + 7);
  const lichenF = field(s, 128, 16, 3, seed + 9), bedF = field(s, 128, 24, 1, seed + 41);
  // the joint's colour: the recipe's mortar, or that weathered toward its stone's own tone (a shade under the face)
  const mo = R.mortarOfStone ?? 0;
  const mortarRgb: Tint = [0, 1, 2].map((c) => R.mortarTint[c] * (1 - mo) + tint[c] * 0.78 * mo) as unknown as Tint;
  for (let y = 0; y < s; y++) {
    const r = find(rowsE, y);
    const y0 = rowsE[r], y1 = rowsE[r + 1];
    for (let x = 0; x < s; x++) {
      const i = y * s + x, j = i * 4;
      const edges = colsE[r];
      // rubble: some blocks split at a wandering height inside the course
      let c = find(edges, x);
      let bx0 = edges[c], bx1 = edges[c + 1], by0 = y0, by1 = y1;
      const kb = hash2(c, r, seed + 31);
      if (R.rubble > 0 && kb < R.rubble) {
        const split = y0 + (y1 - y0) * (0.35 + hash2(c, r, seed + 37) * 0.3);
        if (y < split) { by1 = split; c += 1000; } else { by0 = split; c += 2000; }
      }
      const wob = (wobF(x, y) - 0.5) * 2 * (1.2 + R.relief * 2.4);
      const dx = Math.min(x - bx0, bx1 - x) + wob;
      const dy = Math.min(y - by0, by1 - y) + wob * 0.8;
      const d = Math.min(dx, dy);
      const joint = d < R.mortar ? 1 : 0;
      const k = hash2(c, r, seed), k2 = hash2(c, r, seed + 1);
      const bev = clamp((d - R.mortar) / (6 + R.pillow * 14));
      const pill = R.pillow > 0 ? Math.pow(bev, 0.6) : 1;
      const tex = texF(x, y) * 0.8 + hash2(x, y, seed + 3) * 0.2;
      const big = bigF(x, y);
      const lichen = R.lichen * smooth(0.7, 0.88, lichenF(x, y)) * smooth(0.45, 0.85, k2);
      const runs = R.streaks ? R.streaks * smooth(0.55, 0.9, pnoise2(x, y, s, 22, 3, seed + 53)) * 0.36 : 0;
      const grime = R.grime * smooth(0.5, 0.95, big) * 0.5 + runs;
      const speck = R.speckle > 0 ? (hash2(x, y, seed + 17) > 0.93 ? 1 : hash2(x, y, seed + 19) > 0.95 ? -1 : 0) * R.speckle : 0;
      let rr: number, gg: number, bb: number;
      if (joint) {
        const m = 0.85 + tex * 0.2 - grime * 0.6;
        rr = mortarRgb[0] * m; gg = mortarRgb[1] * m; bb = mortarRgb[2] * m;
        hgt[i] = clamp(0.08 + tex * 0.05);
        rough[i] = clamp(0.95);
      } else {
        // bedding: sedimentary stones show faint layers along the course
        const bed = R.bedding ? Math.sin((y + k * 37) * 0.33 + bedF(x, y) * 3) * R.bedding : 0;
        const cloud = R.mottle === undefined ? 0.84 + tex * 0.3 : 0.99 - R.mottle / 2 + tex * R.mottle;
        const v = (1 + (k - 0.5) * 2 * R.spread) * (0.86 + 0.14 * pill) * cloud + bed - grime + speck * 0.12;
        const h = (k2 - 0.5) * R.hue * 2;
        rr = tint[0] * v * (1 + h); gg = tint[1] * v; bb = tint[2] * v * (1 - h);
        rr = rr * (1 - lichen) + 0.68 * lichen; gg = gg * (1 - lichen) + 0.64 * lichen; bb = bb * (1 - lichen) + 0.48 * lichen;
        hgt[i] = clamp(0.3 + pill * (R.faceRamp ?? 0.45) + (tex - 0.5) * R.relief * 0.5);
        rough[i] = clamp(0.82 + (tex - 0.5) * 0.1 + lichen * 0.1);
      }
      put(px, j, rr, gg, bb);
    }
    if ((y & 15) === 15) yield { fine: true, stage: `stone-${kind}-${y + 1}` };
  }
  return [px, hgt, rough];
}

// ------------------------------------------------------------------------------------------------ concrete

/** Periodic value noise with its own lattice along each axis (cellsX across, cellsY down the tile): grain, streaks. */
function pnoiseXY(x: number, y: number, size: number, cellsX: number, cellsY: number, seed: number): number {
  const fx = x / size * cellsX, fy = y / size * cellsY;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = fx - x0, ty = fy - y0;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const wx = (v: number) => ((v % cellsX) + cellsX) % cellsX, wy = (v: number) => ((v % cellsY) + cellsY) % cellsY;
  const a = hash2(wx(x0), wy(y0), seed), b = hash2(wx(x0 + 1), wy(y0), seed);
  const c = hash2(wx(x0), wy(y0 + 1), seed), d = hash2(wx(x0 + 1), wy(y0 + 1), seed);
  return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
}

/**
 * Board-formed concrete (the map-revival lane, 2026-10-05, Skybridge round 2: Glen Canyon's poured concrete): the print
 * of the timber formwork. At the plaster buckets' 0.42 repeats per metre a tile is 2.38 m: sixteen boards of 15 cm laid
 * level, each its own plane, tone and grain, a thin fin where two boards met and one butt joint somewhere along each; a
 * lift line (the pour's cold joint, a fine groove with a lime bleed under it) every eight boards; form-tie holes on a
 * 60 cm grid, small dark cones, a rust tear under some; broad pour mottling and the odd blowhole. Neutral grey: the
 * style's plaster2 tone colours it. Canvas rows run DOWN the wall (the canvas is flipped on upload: a wall's v rises
 * with its height), so a bleed or a tear runs to larger y. Every feature ends on the tile edge.
 * (Skybridge round 3, gauntlet wave 133: "a bright cream plank texture with evenly spaced nail-head dots and identical
 * stacked repeats, reading as painted timber siding rather than weathered 1960s board-formed concrete": sixty years of
 * weather took the print down — the boards' fins and planes, the butt joints and the lift lines at a third to a half of
 * their contrast, the ties grouted (pale cones, not dark holes) and a rust tear under one in five, and the runoff's dark
 * streaks down the wall over the broad pour mottling.)
 */
function* boardFormed(s: number, tint: Tint, seed: number): Generator<SurfaceSlice, [Uint8ClampedArray, Float32Array, Float32Array], void> {
  const px = new Uint8ClampedArray(s * s * 4), hgt = new Float32Array(s * s), rough = new Float32Array(s * s);
  const k = s / 256;
  const boards = 16, bh = s / boards, lift = s / 2, tie = s / 4, tieR = 2.6 * k, bleed = 24 * k;
  const mottle = field(s, 32, 3, 3, seed + 1), pores = field(s, 128, 32, 2, seed + 3);
  const wrap = (v: number) => ((v % s) + s) % s;
  for (let y = 0; y < s; y++) {
    const b = Math.floor(y / bh), yb = y - b * bh;
    const plane = hash2(b, 1, seed + 5), tone = hash2(b, 2, seed + 5), butt = hash2(b, 3, seed + 5) * s;
    const below = y % lift;
    for (let x = 0; x < s; x++) {
      const i = y * s + x, j = i * 4;
      // the board: its plane and tone, the grain of its timber printed along it (long along x, fine across)
      const grain = smooth(0.6, 0.86, pnoiseXY(x, y, s, 5, 64, seed + 7 + b * 13));
      // the runoff: dark streaks down the wall from the lift lines, a few to a tile
      const runoff = smooth(0.55, 0.92, pnoiseXY(x, y, s, 9, 2, seed + 19));
      let v = 0.47 + (tone - 0.5) * 0.03 + (mottle(x, y) - 0.5) * 0.1 - grain * 0.022 - runoff * 0.06;
      let h = 0.45 + (plane - 0.5) * 0.12 - grain * 0.05;
      let r = 0.86 + (pores(x, y) - 0.5) * 0.1;
      // the fin where it met the board above, and the shadow line under the board below's fin
      if (yb < k) { v += 0.012; h += 0.08; r -= 0.03; } else if (yb >= bh - k) { v -= 0.012; h -= 0.04; }
      // the butt joint
      const db = Math.abs(wrap(x - butt + s / 2) - s / 2);
      if (db < 0.75 * k) { v -= 0.02; h -= 0.06; }
      // the lift line: the groove of the cold joint, a lime bleed in streaks below it
      if (below < 2 * k) { v -= 0.05; h = 0.2; r = 0.96; } else if (below < bleed) {
        const t = 1 - (below - 2 * k) / (bleed - 2 * k);
        const streak = smooth(0.45, 0.8, pnoiseXY(x, 0, s, 28, 1, seed + 11));
        v += 0.04 * t * t * streak; r += 0.03 * t * streak;
      }
      // the form ties: a hole on the 60 cm grid, its patched rim, a rust tear under every other one
      // (a tie's cell starts a quarter cell above it: the hole whole inside, the tear below it too)
      const m = Math.floor(x / tie), n = Math.floor(wrap(y - bh * 1.5 + tie * 0.25) / tie);
      const cx = (m + 0.5) * tie, cy = wrap(n * tie + bh * 1.5);
      const dx = x - cx, dyTie = wrap(y - cy + s / 2) - s / 2, d = Math.hypot(dx, dyTie);
      if (d < tieR) { v = v * 0.9 + 0.035; h = 0.3; r = 0.93; } else if (d < tieR + 1.2 * k) { v += 0.01; h += 0.03; }
      else if (hash2(m, n, seed + 13) > 0.8) {
        const len = (10 + hash2(m, n, seed + 15) * 22) * k, dyTear = wrap(y - cy), t = (dyTear - tieR) / len;
        if (t > 0 && t < 1 && Math.abs(dx) < 1.3 * k * (1 - t * 0.6)) v -= 0.035 * (1 - t);
      }
      // a blowhole (an air void at the form face)
      if (hash2(x, y, seed + 17) > 0.996) { v -= 0.12; h -= 0.2; r = 0.97; }
      put(px, j, tint[0] * v * 1.02, tint[1] * v, tint[2] * v * 0.97);
      hgt[i] = clamp(h);
      rough[i] = clamp(r);
    }
    if ((y & 15) === 15) yield { fine: true, stage: `concrete-${y + 1}` };
  }
  return [px, hgt, rough];
}

// ------------------------------------------------------------------------------------------------ public

const ROOF_PAINTERS = { beavertail, canal, slate, pantile, sheet, asbestos } as const;

/**
 * Painted buffers by style key: the painters are deterministic, so a map rebuilt in the same session (a rematch, a
 * return to the map) re-uploads the cached pixels instead of painting again. Bounded: one entry per surface kind and
 * tint a session meets (a few MB).
 */
const PAINTED = new Map<string, [Uint8ClampedArray, Float32Array, Float32Array]>();
const PAINTED_LIMIT = 12;
function* cached(key: string, paint: () => Generator<SurfaceSlice, [Uint8ClampedArray, Float32Array, Float32Array], void>):
  Generator<SurfaceSlice, [Uint8ClampedArray, Float32Array, Float32Array], void> {
  const hit = PAINTED.get(key);
  if (hit) return [new Uint8ClampedArray(hit[0]), hit[1], hit[2]];
  const out = yield* paint();
  if (PAINTED.size >= PAINTED_LIMIT) PAINTED.delete(PAINTED.keys().next().value as string);
  PAINTED.set(key, [new Uint8ClampedArray(out[0]), out[1], out[2]]);
  return out;
}

/** The roof bucket's texture set for a style (256 px). */
export function* makeRegionalRoof(kind: RoofSurfaceKind, tint: Tint, anisotropy: number, seed = 0x5eed):
  Generator<SurfaceSlice, RegionalSurfaceTextures, void> {
  const painter = kind === 'shingle' ? ROOF_PAINTERS.slate : ROOF_PAINTERS[kind];
  const s = 256;
  const [px, hgt, rough] = yield* cached(`roof:${kind}:${tint.join(',')}:${seed}`, () => painter(s, tint, seed));
  const strength = kind === 'sheet' ? 1.4 : kind === 'canal' ? 2.4 : kind === 'slate' ? 1.6 : 2.0;
  return finish(px, hgt, rough, s, anisotropy, strength, kind === 'sheet' ? 0.82 : 0.7);
}

/** The stone bucket's texture set for a style (512 px). */
export function* makeRegionalStone(kind: StoneSurfaceKind, tint: Tint, anisotropy: number, seed = 0x51a7, dressed = false):
  Generator<SurfaceSlice, RegionalSurfaceTextures, void> {
  const s = 512;
  const [px, hgt, rough] = yield* cached(`stone:${kind}${dressed ? ':dressed' : ''}:${tint.join(',')}:${seed}`, () => masonry(s, kind, tint, seed, dressed));
  // (sandstone: squared stone with tight joints, not pillowed blocks — wave 199)
  const relief = kind === 'brick' || kind === 'sandstone' ? 2.2 : kind === 'limestone' ? 2.0 : kind === 'granite' ? 2.4 : 3.0;
  return finish(px, hgt, rough, s, anisotropy, relief, kind === 'limestone' ? 0.74 : 0.66);
}

/**
 * The plaster2 bucket's texture set for a style that pours its concrete (256 px: 2.38 m at the plaster buckets' 0.42
 * repeats per metre). `tone` recolours the albedo in place before upload (props.ts: the bucket's tone, as the render's).
 */
export function* makeRegionalConcrete(kind: ConcreteSurfaceKind, tone: ((px: Uint8ClampedArray) => void) | null, anisotropy: number,
  seed = 0xb0a8): Generator<SurfaceSlice, RegionalSurfaceTextures, void> {
  const s = 256;
  const [px, hgt, rough] = yield* cached(`concrete:${kind}:${seed}`, () => boardFormed(s, [1, 1, 1], seed));
  tone?.(px);
  return finish(px, hgt, rough, s, anisotropy, 1.4, 0.72);
}

/** Paint-only access for receipts (no canvas): the raw buffers. */
export function* paintRegionalSurfaceBuffers(target: 'roof' | 'stone' | 'concrete', kind: RoofSurfaceKind | StoneSurfaceKind | ConcreteSurfaceKind,
  tint: Tint, seed: number): Generator<SurfaceSlice, { size: number; px: Uint8ClampedArray; hgt: Float32Array; rough: Float32Array }, void> {
  if (target === 'concrete') {
    const [px, hgt, rough] = yield* boardFormed(256, tint, seed);
    return { size: 256, px, hgt, rough };
  }
  if (target === 'roof') {
    const painter = kind === 'shingle' ? ROOF_PAINTERS.slate : ROOF_PAINTERS[kind as keyof typeof ROOF_PAINTERS];
    const [px, hgt, rough] = yield* painter(256, tint, seed);
    return { size: 256, px, hgt, rough };
  }
  const [px, hgt, rough] = yield* masonry(512, kind as StoneSurfaceKind, tint, seed);
  return { size: 512, px, hgt, rough };
}

/** Paint-only access for receipts (no canvas): a town's dressed stone (`stone.dressed`) over a kind's recipe. */
export function* paintDressedStoneBuffers(kind: StoneSurfaceKind, tint: Tint, seed: number):
  Generator<SurfaceSlice, { size: number; px: Uint8ClampedArray; hgt: Float32Array; rough: Float32Array }, void> {
  const [px, hgt, rough] = yield* masonry(512, kind, tint, seed, true);
  return { size: 512, px, hgt, rough };
}
