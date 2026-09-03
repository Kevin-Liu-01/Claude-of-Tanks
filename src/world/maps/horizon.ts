// src/world/maps/horizon.ts — per-map horizon mountain ring.
//
// Replaces the old shared low-poly backdrop (one silhouette recolored per
// biome) with map-authored skylines: each map gets its own ridge GEOMETRY
// (seed mixed with the map id + a style-specific profile shaper) and its own
// slope/altitude MATERIAL response baked into vertex colors — snow caps and
// exposed rock for the winter alpine wall, stratified sandstone tablelands
// for the desert, soft forested rolling hills for grassland, long hazy
// escarpments behind the town. A high-frequency albedo grain and a stronger
// aerial-perspective gradient stop the faces from reading as flat unlit
// low-poly sheets, and the tuck rows hug the map rim closely enough that no
// fog-washed floor strip or sky sliver ever shows between rim and mountains.
//
// Consumed by src/world/terrain.ts: buildHorizonRing(engineCtx, cfg, seed).
// Config surface (all optional, per map): cfg.horizon = {
//   baseHex, amp,                    — legacy tint + height scale
//   style,                           — 'rolling'|'alpine'|'mesa'|'escarpment'
//   snowline,                        — 0..1 fraction of peak height where snow starts (alpine)
//   treeline,                        — 0..1 fraction below which forest tint is applied
//   treelineLayers,                  — 1..3 skyline impostor depth ranks (default 1)
//   banding,                         — sandstone strata amplitude on steep faces (mesa)
//   rockHex, snowHex, forestHex,     — detail palette overrides
//   haze,                            — aerial-perspective multiplier (default 1)
//   grain,                           — per-vertex albedo grain amplitude (default 1)
// }

import * as THREE from 'three';
import type { SkyPreset } from '../../engine/sky.ts';
import { SimplexNoise } from '../../engine/simplexFast.ts';
// MOBILE r1: central tier texture scale (desktop returns sizes unchanged)
import { texSize } from '../../engine/quality.ts';

export type HorizonStyle = 'rolling' | 'alpine' | 'mesa' | 'escarpment';

export interface HorizonConfig {
  baseHex?: number;
  amp?: number;
  style?: HorizonStyle;
  snowline?: number;
  treeline?: number;
  treelineLayers?: number;
  banding?: number;
  rockHex?: number;
  snowHex?: number;
  forestHex?: number;
  haze?: number;
  grain?: number;
}

export interface MapSkyConfig extends Partial<SkyPreset> {
  sunIntensity?: number;
  sunColorHex?: number;
  hemiIntensity?: number;
}

export interface HorizonMapConfig {
  id?: string;
  horizon?: HorizonConfig;
  sky?: MapSkyConfig;
}

interface HorizonProfileRow {
  base: number;
  amp: number;
  f0: number;
  f1: number;
}

interface HorizonRingRow extends HorizonProfileRow {
  r: number;
  aer: number;
  skirt?: boolean;
  interpolated?: boolean;
}

interface HorizonSilhouetteOptions {
  style?: HorizonStyle;
  mapId?: string;
  seed?: number;
  row?: HorizonProfileRow;
  amp?: number;
  count?: number;
}

interface TreelineCrownOptions {
  seed?: number;
  variant?: number;
  samples?: number;
}

interface HorizonTextureOptions {
  banding: number;
  snowline: number;
  treeline: number;
  grainAmp: number;
  gullyAmp?: number;
  coolRock?: boolean;
}

type HorizonProfile = (
  angle: number,
  noise: SimplexNoise,
  row: HorizonProfileRow,
) => number;

function require2DContext(
  canvas: HTMLCanvasElement,
  options?: CanvasRenderingContext2DSettings,
): CanvasRenderingContext2D {
  const context = canvas.getContext('2d', options);
  if (!context) throw new Error('Horizon texture canvas requires a 2D context');
  return context;
}

function mulberry32(a: number): () => number {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function clamp(x: number, a: number, b: number): number { return x < a ? a : x > b ? b : x; }
function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
// tiny string hash so every map id lands on its own silhouette seed even
// when the config omits horizon.seed
function idHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export const HORIZON_TREELINE_ATLAS_VARIANTS = 4;
export const HORIZON_TREELINE_MAX_LAYERS = 3;

export function resolveHorizonTreelineLayers(horizon: HorizonConfig | null = null): number {
  const configuredLayers = horizon?.treelineLayers;
  const requested = typeof configuredLayers === 'number' && Number.isFinite(configuredLayers)
    ? Math.round(configuredLayers) : 1;
  return clamp(requested, 1, HORIZON_TREELINE_MAX_LAYERS);
}

/**
 * Periodic, low-frequency crown line used by the distant forest impostor.
 * The returned values are fractions of one atlas band, measured up from its
 * base. Keeping this pure lets the Node quality gate reject isolated needles
 * without needing a DOM/canvas implementation.
 */
export function sampleTreelineCrownProfile({
  seed = 0x5EED, variant = 0, samples = 192,
}: TreelineCrownOptions = {}): Float32Array {
  const count = Math.max(24, samples | 0);
  const rng = mulberry32((seed ^ Math.imul((variant | 0) + 1, 0x9E3779B1)) >>> 0);
  const phase0 = rng() * Math.PI * 2;
  const phase1 = rng() * Math.PI * 2;
  const phase2 = rng() * Math.PI * 2;
  const f0 = 2 + ((variant + (rng() * 2 | 0)) % 3);
  const f1 = 5 + ((variant * 2 + (rng() * 3 | 0)) % 4);
  const f2 = 9 + ((variant * 3 + (rng() * 4 | 0)) % 5);
  const heights = new Float32Array(count);
  const scratch = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    heights[i] = clamp(0.61
      + Math.sin(a * f0 + phase0) * 0.095
      + Math.sin(a * f1 + phase1) * 0.050
      + Math.sin(a * f2 + phase2) * 0.022, 0.44, 0.77);
  }
  // A compact circular blur keeps crown groups readable while guaranteeing
  // that no one-texel spike survives x8 scope magnification.
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < count; i++) {
      scratch[i] = heights[(i - 1 + count) % count] * 0.2
        + heights[i] * 0.6 + heights[(i + 1) % count] * 0.2;
    }
    heights.set(scratch);
  }
  return heights;
}

const STYLE_BY_MAP: Record<string, HorizonStyle> = {
  verdant: 'rolling', desert: 'mesa', winter: 'alpine', urban: 'escarpment',
};

// ---------------------------------------------------------------------------
// Ridge profile shapers — a: angle around the ring, noi: per-map noise,
// row: {f0, f1, base, amp} row tuning. Return meters (pre cfg.amp scale).
// Each style owns its silhouette language; the same style on two maps still
// differs because the noise instance is seeded from the map id.
// ---------------------------------------------------------------------------
const PROFILES: Record<HorizonStyle, HorizonProfile> = {
  // soft overlapping billows — wide wavelengths, no sharp peaks
  rolling(a, noi, row) {
    const n1 = noi.noise(Math.cos(a) * row.f0 + 11, Math.sin(a) * row.f0 - 7) * 0.5 + 0.5;
    const n2 = noi.noise(Math.cos(a) * row.f1 - 3, Math.sin(a) * row.f1 + 9) * 0.5 + 0.5;
    const billow = Math.pow(n1, 1.4);
    return row.base + (billow * 0.75 + n2 * 0.25) * row.amp;
  },
  // Broad glacial massifs. Earlier versions stacked absolute-value ridge
  // noise at four frequencies. That looked detailed in the height array but
  // projected as repeated triangular needles around the skyline. A pair of
  // low-frequency massif fields now owns the silhouette; finer noise only
  // moves shoulders and never creates an independent summit.
  alpine(a, noi, row) {
    const warp = noi.noise(Math.cos(a) * 1.15 + 55, Math.sin(a) * 1.15 - 41) * 0.13;
    const aw = a + warp;
    const broad = noi.noise(Math.cos(aw) * row.f0 * 0.52 + 21,
      Math.sin(aw) * row.f0 * 0.52 - 14) * 0.5 + 0.5;
    const shoulder = noi.noise(Math.cos(aw) * row.f0 * 1.18 - 37,
      Math.sin(aw) * row.f0 * 1.18 + 28) * 0.5 + 0.5;
    const spur = noi.noise(Math.cos(a) * row.f0 * 2.65 + 83,
      Math.sin(a) * row.f0 * 2.65 - 61) * 0.5 + 0.5;
    const envelope = 0.58 + smoothstep(0.18, 0.86,
      noi.noise(Math.cos(a) * 0.58 + 3.1, Math.sin(a) * 0.58 - 8.7) * 0.5 + 0.5) * 0.50;
    const massif = smoothstep(0.12, 0.92, broad) * 0.68
      + smoothstep(0.18, 0.88, shoulder) * 0.24
      + (spur - 0.5) * 0.08;
    return row.base + clamp(massif, 0.12, 1.0) * envelope * row.amp;
  },
  // stepped tablelands: noise pushed through plateau terraces -> long flat
  // caps with cliff edges, plus lone buttes between the tables
  mesa(a, noi, row) {
    const n0 = noi.noise(Math.cos(a) * row.f0 + 41, Math.sin(a) * row.f0 - 27) * 0.5 + 0.5;
    const n2 = noi.noise(Math.cos(a) * row.f1 * 2.3 - 13, Math.sin(a) * row.f1 * 2.3 + 33) * 0.5 + 0.5;
    // r7 terrain_environment: EDGE CRENELLATION — two finer octaves wobble
    // the terrace-threshold field so cap rims read embayed/eroded promontory
    // lines instead of vector-clean prism edges (critique: "flat-faced
    // prisms"). Small amplitude: the wobble bends the PLAN of the cliff
    // line without breaking the flat-cap read.
    const cren = noi.noise(Math.cos(a) * row.f0 * 4.6 - 71, Math.sin(a) * row.f0 * 4.6 + 15) * 0.042
      + noi.noise(Math.cos(a) * row.f0 * 9.7 + 133, Math.sin(a) * row.f0 * 9.7 - 55) * 0.018;
    const n = n0 + cren;
    // two terrace levels with tight smoothstep walls => visible flat tops,
    // over a broad pedestal so inter-table stretches never sag to bare base
    // (bare-base gaps exposed the fog-washed backslope behind as a white
    // 'lake' sheet)
    const table1 = smoothstep(0.36, 0.45, n);
    const table2 = smoothstep(0.62, 0.70, n);
    const butte = smoothstep(0.80, 0.86, n2) * (1 - table2);
    const pedestal = smoothstep(0.14, 0.52, n) * 0.17;
    // r7: second cap-relief octave — tops undulate a few meters instead of
    // extruding one dead-flat lid per table
    const capWobble = 1 + 0.05 * noi.noise(Math.cos(a) * 9 + 3, Math.sin(a) * 9 - 8)
      + 0.028 * noi.noise(Math.cos(a) * 23 - 17, Math.sin(a) * 23 + 41);
    return row.base + (pedestal + table1 * 0.45 + table2 * 0.34 + butte * 0.30) * row.amp * capWobble;
  },
  // one long low escarpment line with a couple of gentle high points —
  // reads as far uplands behind a town, distinctly lower than 'rolling'
  escarpment(a, noi, row) {
    const n1 = noi.noise(Math.cos(a) * row.f0 * 0.7 + 61, Math.sin(a) * row.f0 * 0.7 - 47) * 0.5 + 0.5;
    const n2 = noi.noise(Math.cos(a) * row.f1 - 9, Math.sin(a) * row.f1 + 19) * 0.5 + 0.5;
    const bench = smoothstep(0.30, 0.62, n1); // long connected bench
    return row.base + (bench * 0.62 + Math.pow(n2, 2.2) * 0.38) * row.amp * 0.72;
  },
};

function softenAlpineRing(
  heights: Float32Array,
  offset: number,
  count: number,
  row: HorizonProfileRow,
  amp: number,
): void {
  const scratch = new Float32Array(count);
  for (let pass = 0; pass < 8; pass++) {
    for (let k = 0; k < count; k++) {
      const km = (k - 1 + count) % count, kp = (k + 1) % count;
      scratch[k] = heights[offset + km] * 0.24
        + heights[offset + k] * 0.52 + heights[offset + kp] * 0.24;
    }
    for (let k = 0; k < count; k++) heights[offset + k] = scratch[k];
  }
  const maxStep = 1.35 + row.amp * amp * 0.035;
  for (let pass = 0; pass < 3; pass++) {
    for (let k = 0; k < count; k++) {
      const km = (k - 1 + count) % count;
      heights[offset + k] = clamp(heights[offset + k],
        heights[offset + km] - maxStep, heights[offset + km] + maxStep);
    }
    for (let k = count - 1; k >= 0; k--) {
      const kp = (k + 1) % count;
      heights[offset + k] = clamp(heights[offset + k],
        heights[offset + kp] - maxStep, heights[offset + kp] + maxStep);
    }
  }
}

/** Node-runnable skyline sampler used by the visual-quality regression. */
export function sampleHorizonSilhouette({
  style = 'alpine', mapId = 'winter', seed = 1337,
  row = { base: 50, amp: 76, f0: 2.6, f1: 5.2 }, amp = 1, count = 520,
}: HorizonSilhouetteOptions = {}): Float32Array {
  const profile = PROFILES[style];
  const noi = new SimplexNoise({ random: mulberry32(((seed ^ 0x7A11) ^ idHash(mapId)) >>> 0) });
  const heights = new Float32Array(count);
  for (let k = 0; k < count; k++) {
    const a = (k / count) * Math.PI * 2;
    heights[k] = profile(a, noi, row) * amp;
  }
  if (style === 'alpine') softenAlpineRing(heights, 0, count, row, amp);
  return heights;
}

// ---------------------------------------------------------------------------
// Rock-detail texture — U wraps around the ring (10 repeats), V = absolute
// altitude (0..1 of the tallest peak, matching the vertex UVs). Carries the
// HIGH-FREQUENCY material response vertex colors cannot: granular grain, dark
// drainage gullies elongated downslope, scree fans, sedimentary strata
// banding (mesa), forest mottle below the treeline, and a flatten-to-white
// above the snow line so striations never cut through the caps. Luminance-
// centred on 0.62 (recentred by the material color) — hue stays in the
// vertex colors, so one texture serves rock, forest, sand and snow zones.
// ---------------------------------------------------------------------------
type HorizonNoiseSampler = (
  u: number,
  v: number,
  frequencyU: number,
  frequencyV: number,
  offset: number,
) => number;

interface HorizonTextureTerrainSample {
  luminance: number;
  belowTree: number;
  ridge: number;
  segment: number;
  gully: number;
}

interface HorizonTextureColor {
  r: number;
  g: number;
  b: number;
}

function createHorizonNoiseSampler(noise: SimplexNoise): HorizonNoiseSampler {
  const tau = Math.PI * 2;
  return (u, v, frequencyU, frequencyV, offset) => noise.noise3d(
    Math.cos(u * tau) * frequencyU * 0.5 + offset,
    Math.sin(u * tau) * frequencyU * 0.5 - offset * 0.7,
    v * frequencyV + offset * 1.31,
  );
}

function applyHorizonStrata(
  luminance: number,
  sampleNoise: HorizonNoiseSampler,
  u: number,
  v: number,
  banding: number,
): number {
  if (banding <= 0.003) return luminance;
  const warp = sampleNoise(u, v, 2.2, 0.6, 23) * 0.45;
  const band = Math.sin(v * 46 + warp) * 0.5
    + Math.sin(v * 13.5 + warp * 0.6 + 1.7) * 0.5;
  const bedWeight = 0.55
    + 0.45 * (sampleNoise(u, v, 1.5, 9, 311) * 0.5 + 0.5);
  let result = luminance * (1 + band * banding * 1.35 * bedWeight);
  const marker = smoothstep(0.75, 0.95, Math.sin(v * 6.2 + warp * 0.4 + 0.6));
  result *= 1 - marker * banding * 0.65;
  return result * (1 + smoothstep(0.72, 0.95, v) * 0.07
    - (1 - smoothstep(0.05, 0.4, v)) * 0.08);
}

function sampleHorizonTextureTerrain(
  sampleNoise: HorizonNoiseSampler,
  options: HorizonTextureOptions,
  u: number,
  v: number,
): HorizonTextureTerrainSample {
  const { banding, treeline, grainAmp, gullyAmp = 1 } = options;
  const belowTree = treeline > 0
    ? 1 - smoothstep(treeline * 0.85, treeline * 1.08, v) : 0;
  const fineDetail = treeline > 0 ? 0 : 1;
  let luminance = 1 + (sampleNoise(u, v, 90, 100, 17) * 0.05
    + sampleNoise(u, v, 34, 38, 5) * 0.06) * grainAmp * fineDetail;
  const faceVariation = smoothstep(0.25, 0.75,
    sampleNoise(u, v * 0.25, 9, 1.1, 77) * 0.5 + 0.5);
  const ridge = 1 - Math.abs(sampleNoise(u, v, 46, 2.6, 9));
  const segment = 0.45 + 0.55 * smoothstep(0.3, 0.72,
    sampleNoise(u, v, 31, 9.5, 118) * 0.5 + 0.5);
  const gully = smoothstep(0.86, 0.985, ridge) * gullyAmp
    * (0.35 + 0.65 * faceVariation) * segment;
  const scree = smoothstep(0.72, 0.92, ridge) * (1 - gully)
    * gullyAmp * faceVariation * segment;
  luminance *= 1 - gully * 0.13 + scree * 0.04;
  const talus = sampleNoise(u, v, 64, 46, 205);
  luminance *= 1 + talus * 0.045 * (0.5 + 0.5 * gullyAmp) * fineDetail;
  luminance *= treeline > 0
    ? 1 + sampleNoise(u, v, 7, 3.6, 41) * 0.05
    : 1 + sampleNoise(u, v, 7, 11, 41) * 0.06;
  luminance = applyHorizonStrata(luminance, sampleNoise, u, v, banding);
  return { luminance, belowTree, ridge, segment, gully };
}

function applyCoolRockDetail(
  color: HorizonTextureColor,
  sampleNoise: HorizonNoiseSampler,
  u: number,
  v: number,
): HorizonTextureColor {
  const warp = sampleNoise(u, v, 2.6, 0.7, 143) * 0.35;
  const ledge = Math.sin(v * 34 + warp) * 0.55
    + Math.sin(v * 11.5 + warp * 0.7 + 2.1) * 0.45;
  const ledgeWeight = 0.55
    + 0.45 * (sampleNoise(u, v, 1.7, 8, 517) * 0.5 + 0.5);
  const cragA = sampleNoise(u, v, 30, 11, 653);
  const cragB = sampleNoise(u, v, 12, 4.6, 719);
  const joint = smoothstep(0.82, 0.97,
    1 - Math.abs(sampleNoise(u, v, 40, 3.4, 787)));
  const rockMix = (1 + ledge * 0.115 * ledgeWeight)
    * (1 + cragA * 0.075 + cragB * 0.10) * (1 - joint * 0.16);
  const shelfWeight = smoothstep(0.55, 0.95, ledge) * ledgeWeight
    * 0.5 * smoothstep(0.06, 0.16, v);
  const r = color.r * rockMix;
  const g = color.g * rockMix;
  const b = color.b * rockMix * 0.995;
  return {
    r: r + (1.06 - r) * shelfWeight,
    g: g + (1.08 - g) * shelfWeight,
    b: b + (1.12 - b) * shelfWeight,
  };
}

function applyForestDetail(
  color: HorizonTextureColor,
  sample: HorizonTextureTerrainSample,
  sampleNoise: HorizonNoiseSampler,
  u: number,
  v: number,
  treeline: number,
): HorizonTextureColor {
  const below = sample.belowTree;
  const baseWeight = below * 0.40;
  let r = color.r * (1 - baseWeight * 1.05);
  let g = color.g * (1 - baseWeight * 0.42);
  let b = color.b * (1 - baseWeight * 0.95);
  const crownA = sampleNoise(u, v, 48, 40, 631);
  const crownB = sampleNoise(u, v, 20, 16, 733);
  const crownSlope = sampleNoise(u, v + 0.01, 48, 40, 631)
    - sampleNoise(u, v - 0.01, 48, 40, 631);
  const crownLight = clamp(1 + (crownA * 0.025 + crownB * 0.05
    + crownSlope * 0.05) * below, 0.6, 1.5);
  r *= crownLight; g *= crownLight; b *= crownLight;
  const standA = sampleNoise(u, v, 9, 5.5, 217) * 0.5 + 0.5;
  const standB = sampleNoise(u, v, 3.4, 2.1, 305) * 0.5 + 0.5;
  const standC = sampleNoise(u, v, 1.3, 0.9, 419) * 0.5 + 0.5;
  const warmWeight = smoothstep(0.56, 0.86, standB) * below;
  r *= 1 + warmWeight * 0.16;
  g *= 1 + warmWeight * 0.10;
  b *= 1 - warmWeight * 0.10;
  const darkWeight = smoothstep(0.60, 0.88, 1 - standA) * below;
  r *= 1 - darkWeight * 0.22;
  g *= 1 - darkWeight * 0.12;
  b *= 1 - darkWeight * 0.08;
  const lift = (standC - 0.5) * 0.14 * below;
  r *= 1 + lift; g *= 1 + lift; b *= 1 + lift;
  const clearing = smoothstep(0.62, 0.86,
    sampleNoise(u, v, 8, 4.6, 841) * 0.5 + 0.5) * below;
  r *= 1 + clearing * 0.22;
  g *= 1 + clearing * 0.20;
  b *= 1 + clearing * 0.06;
  const scar = smoothstep(0.80, 0.94,
    sampleNoise(u, v, 16, 4.5, 947) * 0.5 + 0.5)
    * below * smoothstep(treeline * 0.35, treeline * 0.75, v);
  return {
    r: r + (0.72 - r) * scar * 0.6,
    g: g + (0.72 - g) * scar * 0.6,
    b: b + (0.70 - b) * scar * 0.6,
  };
}

function applySnowDetail(
  color: HorizonTextureColor,
  sample: HorizonTextureTerrainSample,
  sampleNoise: HorizonNoiseSampler,
  u: number,
  v: number,
  snowline: number,
): HorizonTextureColor {
  const snowWeight = smoothstep(snowline - 0.02, snowline + 0.09,
    v + sampleNoise(u, v, 24, 24, 51) * 0.05);
  const sastrugi = sampleNoise(u, v, 30, 17, 361) * 0.5
    + sampleNoise(u, v, 14, 7, 409) * 0.5;
  const basin = sampleNoise(u, v, 5.5, 3.2, 477);
  const rib = smoothstep(0.90, 0.99, sample.ridge);
  const ribMask = smoothstep(0.50, 0.80,
    sampleNoise(u, v * 0.4, 13, 2.0, 533) * 0.5 + 0.5);
  const crag = smoothstep(0.70, 0.92,
    sampleNoise(u, v, 26, 6.5, 601) * 0.5 + 0.5)
    * smoothstep(0.30, 0.55, v) * (1 - smoothstep(0.80, 0.95, v));
  const spur = sampleNoise(u, v, 11, 4.8, 861);
  const shortSegment = smoothstep(0.30, 0.62,
    sampleNoise(u, v, 12, 26, 997) * 0.5 + 0.5);
  const snowLight = 1.03 + sastrugi * 0.26 + basin * 0.34 + spur * 0.18
    - sample.gully * 0.10 - rib * ribMask * sample.segment * shortSegment * 0.18;
  let snowR = snowLight * 0.98;
  let snowG = snowLight;
  let snowB = snowLight * 1.04;
  snowR += (0.60 - snowR) * crag * 0.85;
  snowG += (0.63 - snowG) * crag * 0.85;
  snowB += (0.70 - snowB) * crag * 0.85;
  return {
    r: color.r + (snowR - color.r) * snowWeight * 0.94,
    g: color.g + (snowG - color.g) * snowWeight * 0.94,
    b: color.b + (snowB - color.b) * snowWeight * 0.94,
  };
}

function sampleHorizonTexturePixel(
  sampleNoise: HorizonNoiseSampler,
  options: HorizonTextureOptions,
  u: number,
  v: number,
): HorizonTextureColor {
  const sample = sampleHorizonTextureTerrain(sampleNoise, options, u, v);
  let color: HorizonTextureColor = {
    r: sample.luminance * (options.coolRock ? 0.978 : 1),
    g: sample.luminance * (options.coolRock ? 0.998 : 0.995),
    b: sample.luminance * (options.coolRock ? 1.022 : 0.975),
  };
  if (options.coolRock) color = applyCoolRockDetail(color, sampleNoise, u, v);
  if (options.treeline > 0 && v < options.treeline * 1.08) {
    color = applyForestDetail(color, sample, sampleNoise, u, v, options.treeline);
  }
  if (options.snowline <= 1) {
    color = applySnowDetail(color, sample, sampleNoise, u, v, options.snowline);
  }
  return color;
}

function makeHorizonTexture(
  noi: SimplexNoise,
  options: HorizonTextureOptions,
): THREE.CanvasTexture {
  const { banding, treeline } = options;
  // Loading-speed r1: this texture is repeated around a backdrop hundreds of
  // metres away. 1536x512 oversampled the projected ridge by ~4x and spent
  // ~0.6 s in deterministic simplex work per map; 512x192 retains more than
  // a screen pixel per visible texel even at the establishing camera.
  const su = texSize(512), sv = texSize(192);
  const c = document.createElement('canvas');
  c.width = su; c.height = sv;
  const ctx = require2DContext(c);
  const img = ctx.createImageData(su, sv);
  const d = img.data;
  const sampleNoise = createHorizonNoiseSampler(noi);
  for (let y = 0; y < sv; y++) {
    const v = 1 - y / (sv - 1);
    for (let x = 0; x < su; x++) {
      const color = sampleHorizonTexturePixel(sampleNoise, options, x / su, v);
      const offset = (y * su + x) * 4;
      d[offset] = clamp(color.r * 159, 0, 255);
      d[offset + 1] = clamp(color.g * 159, 0, 255);
      d[offset + 2] = clamp(color.b * 159, 0, 255);
      d[offset + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  // r6: anisotropy is CONTENT-DEPENDENT. Constant-altitude strata and snow/
  // rock structure (mesa/alpine) survive high aniso — it keeps the beds crisp
  // at grazing angles. Stochastic canopy noise does the opposite: at 16x the
  // sampler RESOLVES the noise along the minor footprint axis and paints
  // coherent fiber streaks down every tangentially-grazed wall (the residual
  // felt read). Low aniso lets those faces mip to a soft hazy blend instead —
  // the tree combs and stand patchwork carry the forest read.
  // r1 (content_breadth): alpine drops to 4 — unlike the mesa's constant-
  // altitude beds, the snow/rock structure is stochastic, and 16x resolved it
  // into the same down-slope fiber on tangentially-grazed winter walls.
  // Only the banded (mesa) style keeps 16.
  // r5 terrain_environment: alpine 4 -> 2 — the residual vertical streaks on
  // the winter massif walls were the stochastic snow structure resolving at
  // grazing angles; 2x mips those faces to a soft blend like the canopy path.
  t.anisotropy = treeline > 0 ? 2 : (banding > 0.003 ? 16 : 2);
  // linear (non-sRGB): authored contrast passes through 1:1 and the 0.62
  // mid-gray recentres exactly with the material color multiplier below
  return t;
}

// ---------------------------------------------------------------------------
// High-zoom detail overlay (controls_gunnery r5) — a small TILEABLE value-
// noise texture multiplied into the ring at ~6 m and ~22 m feature scales.
// The base detail texture spans one u-repeat over ~370-800 m of ridge arc, so
// an x8 scope frame (~60-100 m of arc) sees at most a few dozen texels: the
// magnified walls read as an airbrushed matte gradient ("flat green
// matte-painting backdrop", r5 critique). This overlay carries the crown
// mottle / rock granulation the base texture cannot, mips away to nothing in
// wide shots, and is built from a WRAPPED-lattice noise so
// it tiles with no seam. Isotropic features + low anisotropy keep it from
// combing into down-slope fiber at grazing angles (the r3/r6 curtain bug).
// ---------------------------------------------------------------------------
function makeDetailNoiseTexture(rng: () => number): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = require2DContext(c);
  const img = ctx.createImageData(S, S);
  const d = img.data;
  // wrapped-lattice value noise, three octaves (cells wrap → texture tiles)
  const octaves: Array<readonly [number, number]> = [[8, 0.5], [24, 0.32], [64, 0.18]];
  const lattices = octaves.map(([cells]) => {
    const g = new Float32Array(cells * cells);
    for (let i = 0; i < g.length; i++) g[i] = rng();
    return g;
  });
  const smooth = (t: number): number => t * t * (3 - 2 * t);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let v = 0;
      for (let o = 0; o < octaves.length; o++) {
        const cells = octaves[o][0], amp = octaves[o][1], g = lattices[o];
        const fx = (x / S) * cells, fy = (y / S) * cells;
        const x0 = Math.floor(fx) % cells, y0 = Math.floor(fy) % cells;
        const x1 = (x0 + 1) % cells, y1 = (y0 + 1) % cells;
        const tx = smooth(fx - Math.floor(fx)), ty = smooth(fy - Math.floor(fy));
        const a = g[y0 * cells + x0], b = g[y0 * cells + x1];
        const e = g[y1 * cells + x0], f = g[y1 * cells + x1];
        v += ((a + (b - a) * tx) + ((e + (f - e) * tx) - (a + (b - a) * tx)) * ty - 0.5) * amp;
      }
      const L = clamp(128 + v * 255, 0, 255);
      const j = (y * S + x) * 4;
      d[j] = L; d[j + 1] = L; d[j + 2] = L; d[j + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 2; // grazing walls mip to a soft blend, never fiber streaks
  return t;
}

// ---------------------------------------------------------------------------
// Ridgeline tree-line texture — a repeating alpha-tested canopy silhouette.
// It is reserved for the outer skyline: using the same ribbon on nearer ridge
// faces turns it into a contour stripe under scope magnification. Drawn in a
// neutral green-grey and multiplied by the crest colors so haze/sun grading
// stays continuous with the distant terrain proxy.
// ---------------------------------------------------------------------------
function makeTreeLineTexture(profileSeed: number): THREE.CanvasTexture {
  // Four crown variants share one atlas and one material. Earlier revisions
  // repeated one strip every 56 m on every ridge and flank; scopes exposed the
  // same conifer triangles as giant fins. A connected, low-frequency canopy
  // keeps the cheap impostor philosophy while reading as a forest mass.
  const w = texSize(768), h = texSize(128);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = require2DContext(c, { willReadFrequently: true });
  ctx.clearRect(0, 0, w, h);
  const variants = HORIZON_TREELINE_ATLAS_VARIANTS;
  const bandH = Math.floor(h / variants);
  for (let variant = 0; variant < variants; variant++) {
    // CanvasTexture flips Y at upload, so variant zero is drawn into the
    // bottom canvas band to keep its UV range at v=0..0.25.
    const bandTop = (variants - 1 - variant) * bandH;
    const base = bandTop + bandH - 2;
    const usableH = Math.max(8, bandH - 5);
    const profile = sampleTreelineCrownProfile({
      seed: profileSeed, variant, samples: 192,
    });
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, bandTop + 1, w, bandH - 2);
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(0, base - profile[0] * usableH);
    for (let i = 1; i <= profile.length; i++) {
      const index = i % profile.length;
      ctx.lineTo((i / profile.length) * w, base - profile[index] * usableH);
    }
    ctx.lineTo(w, base);
    ctx.lineTo(0, base);
    ctx.closePath();
    const canopy = ctx.createLinearGradient(0, bandTop + 2, 0, base);
    canopy.addColorStop(0, 'rgb(166,181,122)');
    canopy.addColorStop(0.52, 'rgb(143,160,103)');
    canopy.addColorStop(1, 'rgb(103,122,78)');
    ctx.fillStyle = canopy;
    ctx.fill();
    ctx.clip();

    ctx.restore();
  }
  // flood transparent texels with the mean tone so mips never halo dark
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 40) { d[i] = 138; d[i + 1] = 152; d[i + 2] = 100; } // r7: follow the lit ink base
  }
  ctx.putImageData(id, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  // r6: aniso 2 (was 8) — comb ribbons seen along-tangent (frame edges)
  // smeared their tree silhouettes into a diagonal fiber band across the
  // ring wall; low aniso mips those grazing stretches to a soft green band
  // while frontal (magnified) combs stay crisp
  t.anisotropy = 2;
return t;
}

const HORIZON_ROWS_BY_STYLE: Partial<Record<HorizonStyle, HorizonRingRow[]>> & {
  default: HorizonRingRow[];
} = {
  default: [
    { r: 428, base: -22, amp: 0, f0: 6.0, f1: 11.0, aer: 0.10, skirt: true },
    { r: 470, base: 26, amp: 14, f0: 6.0, f1: 11.0, aer: 0.10, skirt: true },
    { r: 585, base: 50, amp: 52, f0: 3.1, f1: 6.2, aer: 0.12 },
    { r: 760, base: 62, amp: 96, f0: 2.1, f1: 4.6, aer: 0.24 },
    { r: 990, base: 84, amp: 128, f0: 1.5, f1: 3.3, aer: 0.42 },
    // outermost row is a REAL fourth range, not a low taper: a low flat lip
    // here projected as a dead-straight 'shoreline' and its fog-saturated
    // backslope read as a blown-out white lake wherever the nearer rows
    // dipped (loudest on the mesa style's low inter-table stretches)
    { r: 1240, base: 88, amp: 96, f0: 1.1, f1: 2.4, aer: 0.60 },
  ],
  rolling: [
    { r: 428, base: -22, amp: 0, f0: 6.0, f1: 11.0, aer: 0.10, skirt: true },
    { r: 470, base: 22, amp: 12, f0: 6.0, f1: 11.0, aer: 0.10, skirt: true },
    { r: 600, base: 32, amp: 38, f0: 3.0, f1: 6.4, aer: 0.12 },
    { r: 800, base: 45, amp: 72, f0: 2.0, f1: 4.4, aer: 0.32 },
    { r: 1050, base: 60, amp: 112, f0: 1.4, f1: 3.1, aer: 0.54 },
    { r: 1330, base: 72, amp: 120, f0: 1.0, f1: 2.2, aer: 0.72 },
  ],
  escarpment: [
    { r: 428, base: -22, amp: 0, f0: 6.0, f1: 11.0, aer: 0.10, skirt: true },
    { r: 470, base: 24, amp: 12, f0: 6.0, f1: 11.0, aer: 0.10, skirt: true },
    { r: 600, base: 36, amp: 44, f0: 2.8, f1: 6.0, aer: 0.14 },
    { r: 800, base: 50, amp: 82, f0: 2.0, f1: 4.4, aer: 0.34 },
    { r: 1050, base: 66, amp: 116, f0: 1.4, f1: 3.1, aer: 0.54 },
    { r: 1330, base: 76, amp: 106, f0: 1.0, f1: 2.2, aer: 0.70 },
  ],
  // terrain_environment r3: alpine gets its OWN row table with two extra
  // intermediate ranges. On the shared 4-ridge table the radial span
  // between rows reached 230-250 m — each wall was a single quad strip of
  // ~12 x 150 m triangles whose baked per-vertex shading interpolated into
  // exactly the "raw planar facets / vertical brush-smear" the critique
  // called out. Tighter spacing (plus the per-fragment relight below)
  // turns the wall into overlapping layered ridge lines.
  // r4 terrain_environment: two MORE intermediate ranges (650/940). The
  // winter critique's "faceted low-poly triangle mountains" were the huge
  // radial wall quads between adjacent rows — with only ~5 visible rows a
  // single triangle spanned 130-200 m and its vertex-color/normal
  // interpolation read as flat slate facets. Tighter row spacing halves
  // the facet size and adds two extra overlapping ridge lines.
  alpine: [
    { r: 428, base: -22, amp: 0, f0: 6.0, f1: 11.0, aer: 0.10, skirt: true },
    { r: 470, base: 26, amp: 14, f0: 6.0, f1: 11.0, aer: 0.10, skirt: true },
    { r: 585, base: 50, amp: 52, f0: 3.1, f1: 6.2, aer: 0.10 },
    { r: 650, base: 52, amp: 64, f0: 2.8, f1: 5.7, aer: 0.14 },
    { r: 720, base: 56, amp: 76, f0: 2.6, f1: 5.2, aer: 0.18 },
    { r: 870, base: 66, amp: 102, f0: 1.9, f1: 4.0, aer: 0.30 },
    { r: 940, base: 74, amp: 114, f0: 1.7, f1: 3.6, aer: 0.36 },
    { r: 1040, base: 82, amp: 128, f0: 1.5, f1: 3.3, aer: 0.44 },
    { r: 1240, base: 88, amp: 100, f0: 1.1, f1: 2.4, aer: 0.60 },
  ],
};

const HORIZON_SEGMENTS = 520;
const HORIZON_RIM_HALF_WIDTH = 512;

interface HorizonRingGeometry {
  rows: HorizonRingRow[];
  positions: Float32Array;
  heights: Float32Array;
  maxHeight: number;
}

interface HorizonGradients {
  slope: Float32Array;
  tangent: Float32Array;
  radial: Float32Array;
}

interface HorizonColorContext {
  style: HorizonStyle;
  rows: readonly HorizonRingRow[];
  heights: Float32Array;
  maxHeight: number;
  base: THREE.Color;
  fog: THREE.Color;
  rock: THREE.Color;
  snow: THREE.Color;
  forest: THREE.Color;
  snowline: number;
  treeline: number;
  banding: number;
  rockAmp: number;
  haze: number;
  grainAmp: number;
  noise: SimplexNoise;
  gradients: HorizonGradients;
  sun: readonly [number, number, number];
}

function horizonRowMargins(rowCount: number): readonly number[] {
  if (rowCount === 9) return [-34, 22, 95, 150, 200, 340, 430, 540, 800];
  if (rowCount === 7) return [-34, 22, 95, 200, 340, 540, 800];
  return [-34, 22, 95, 280, 520, 800];
}

function sampleRingRowHeight(
  row: HorizonRingRow,
  angle: number,
  noise: SimplexNoise,
  profile: HorizonProfile,
): number {
  if (!row.skirt) return profile(angle, noise, row);
  return row.base
    + (noise.noise(Math.cos(angle) * row.f0, Math.sin(angle) * row.f0) * 0.5 + 0.5) * row.amp;
}

function buildInitialHorizonGeometry(
  rows: HorizonRingRow[],
  style: HorizonStyle,
  profile: HorizonProfile,
  noise: SimplexNoise,
  amp: number,
): HorizonRingGeometry {
  const positions = new Float32Array(HORIZON_SEGMENTS * rows.length * 3);
  const heights = new Float32Array(HORIZON_SEGMENTS * rows.length);
  const margins = horizonRowMargins(rows.length);
  let maxHeight = 1;
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    for (let segment = 0; segment < HORIZON_SEGMENTS; segment++) {
      const angle = (segment / HORIZON_SEGMENTS) * Math.PI * 2;
      const rim = HORIZON_RIM_HALF_WIDTH
        / Math.max(Math.abs(Math.cos(angle)), Math.abs(Math.sin(angle)));
      const radius = Math.max(row.r, rim + (margins[rowIndex] ?? 300));
      const jitteredRadius = radius * (1 + 0.03 * noise.noise(
        Math.cos(angle) * 4 + rowIndex * 13,
        Math.sin(angle) * 4 - rowIndex * 7,
      ));
      const height = sampleRingRowHeight(row, angle, noise, profile) * amp;
      const index = rowIndex * HORIZON_SEGMENTS + segment;
      heights[index] = height;
      if (!row.skirt && height > maxHeight) maxHeight = height;
      positions[index * 3] = Math.cos(angle) * jitteredRadius;
      positions[index * 3 + 1] = height;
      positions[index * 3 + 2] = Math.sin(angle) * jitteredRadius;
    }
    if (style === 'alpine' && !row.skirt) {
      const offset = rowIndex * HORIZON_SEGMENTS;
      softenAlpineRing(heights, offset, HORIZON_SEGMENTS, row, amp);
      for (let segment = 0; segment < HORIZON_SEGMENTS; segment++) {
        positions[(offset + segment) * 3 + 1] = heights[offset + segment];
      }
    }
  }
  return { rows, positions, heights, maxHeight };
}

function appendSourceRingRow(
  rows: HorizonRingRow[],
  positions: number[],
  heights: number[],
  source: HorizonRingGeometry,
  rowIndex: number,
): void {
  rows.push(source.rows[rowIndex]);
  const offset = rowIndex * HORIZON_SEGMENTS;
  for (let segment = 0; segment < HORIZON_SEGMENTS; segment++) {
    const index = offset + segment;
    positions.push(
      source.positions[index * 3],
      source.positions[index * 3 + 1],
      source.positions[index * 3 + 2],
    );
    heights.push(source.heights[index]);
  }
}

function interpolatedHorizonRow(a: HorizonRingRow, b: HorizonRingRow, fraction: number): HorizonRingRow {
  return {
    r: a.r + (b.r - a.r) * fraction,
    base: a.base + (b.base - a.base) * fraction,
    amp: a.amp + (b.amp - a.amp) * fraction,
    f0: a.f0,
    f1: a.f1,
    aer: a.aer + (b.aer - a.aer) * fraction,
    interpolated: true,
  };
}

function appendInterpolatedRingRow(
  positions: number[],
  heights: number[],
  source: HorizonRingGeometry,
  noise: SimplexNoise,
  rowIndex: number,
  subdivision: number,
): void {
  const fraction = subdivision / 3;
  const frequency = 6.5 + subdivision * 2.3;
  for (let segment = 0; segment < HORIZON_SEGMENTS; segment++) {
    const angle = (segment / HORIZON_SEGMENTS) * Math.PI * 2;
    const inner = rowIndex * HORIZON_SEGMENTS + segment;
    const outer = (rowIndex + 1) * HORIZON_SEGMENTS + segment;
    const innerHeight = source.heights[inner];
    const outerHeight = source.heights[outer];
    const crag = noise.noise(
      Math.cos(angle) * frequency + rowIndex * 23.7 + subdivision * 17.1,
      Math.sin(angle) * frequency - rowIndex * 11.3 + subdivision * 7.7,
    ) * 0.72 + noise.noise(
      Math.cos(angle) * 14.0 + subdivision * 41.0 + rowIndex * 3.0,
      Math.sin(angle) * 14.0 - subdivision * 23.0,
    ) * 0.28;
    const displacement = crag * (Math.abs(outerHeight - innerHeight) * 0.16 + 7.0);
    const radiusJitter = 1 + 0.011 * noise.noise(
      Math.cos(angle) * 9.0 - subdivision * 13.0 + rowIndex * 5.0,
      Math.sin(angle) * 9.0 + subdivision * 29.0,
    );
    const height = innerHeight + (outerHeight - innerHeight) * fraction + displacement;
    positions.push(
      (source.positions[inner * 3]
        + (source.positions[outer * 3] - source.positions[inner * 3]) * fraction) * radiusJitter,
      height,
      (source.positions[inner * 3 + 2]
        + (source.positions[outer * 3 + 2] - source.positions[inner * 3 + 2]) * fraction) * radiusJitter,
    );
    heights.push(height);
  }
}

function subdivideAlpineGeometry(
  source: HorizonRingGeometry,
  style: HorizonStyle,
  noise: SimplexNoise,
): HorizonRingGeometry {
  if (style !== 'alpine') return source;
  const rows: HorizonRingRow[] = [];
  const positions: number[] = [];
  const heights: number[] = [];
  for (let rowIndex = 0; rowIndex < source.rows.length; rowIndex++) {
    appendSourceRingRow(rows, positions, heights, source, rowIndex);
    const next = source.rows[rowIndex + 1];
    if (!next || source.rows[rowIndex].skirt || next.skirt) continue;
    for (let subdivision = 1; subdivision <= 2; subdivision++) {
      rows.push(interpolatedHorizonRow(source.rows[rowIndex], next, subdivision / 3));
      appendInterpolatedRingRow(positions, heights, source, noise, rowIndex, subdivision);
    }
  }
  return {
    rows,
    positions: new Float32Array(positions),
    heights: new Float32Array(heights),
    maxHeight: source.maxHeight,
  };
}

function buildHorizonUvs(heights: Float32Array, maxHeight: number): Float32Array {
  const uv = new Float32Array(heights.length * 2);
  for (let index = 0; index < heights.length; index++) {
    uv[index * 2] = ((index % HORIZON_SEGMENTS) / HORIZON_SEGMENTS) * 10;
    uv[index * 2 + 1] = clamp(heights[index] / maxHeight, 0, 1);
  }
  return uv;
}

function smoothHorizonHeights(
  heights: Float32Array,
  rowCount: number,
  passes: number,
): Float32Array {
  const smoothed = new Float32Array(heights);
  for (let pass = 0; pass < passes; pass++) {
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
      const offset = rowIndex * HORIZON_SEGMENTS;
      const previous = smoothed.slice(offset, offset + HORIZON_SEGMENTS);
      for (let segment = 0; segment < HORIZON_SEGMENTS; segment++) {
        const before = (segment - 1 + HORIZON_SEGMENTS) % HORIZON_SEGMENTS;
        const after = (segment + 1) % HORIZON_SEGMENTS;
        smoothed[offset + segment] = previous[before] * 0.27
          + previous[segment] * 0.46 + previous[after] * 0.27;
      }
    }
  }
  return smoothed;
}

function rawHorizonGradients(
  rows: readonly HorizonRingRow[],
  heights: Float32Array,
): HorizonGradients {
  const count = heights.length;
  const slope = new Float32Array(count);
  const tangent = new Float32Array(count);
  const radial = new Float32Array(count);
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    for (let segment = 0; segment < HORIZON_SEGMENTS; segment++) {
      const index = rowIndex * HORIZON_SEGMENTS + segment;
      const before = rowIndex * HORIZON_SEGMENTS
        + (segment - 1 + HORIZON_SEGMENTS) % HORIZON_SEGMENTS;
      const after = rowIndex * HORIZON_SEGMENTS + (segment + 1) % HORIZON_SEGMENTS;
      const tangentDelta = (heights[after] - heights[before])
        / (2 * Math.PI * row.r / HORIZON_SEGMENTS * 2);
      const innerHeight = rowIndex > 0
        ? heights[(rowIndex - 1) * HORIZON_SEGMENTS + segment] : heights[index];
      const outerHeight = rowIndex < rows.length - 1
        ? heights[(rowIndex + 1) * HORIZON_SEGMENTS + segment] : heights[index];
      const innerRadius = rowIndex > 0 ? rows[rowIndex - 1].r : row.r;
      const outerRadius = rowIndex < rows.length - 1 ? rows[rowIndex + 1].r : row.r;
      const radialDelta = (outerHeight - innerHeight) / (outerRadius - innerRadius || 1);
      slope[index] = clamp(Math.hypot(tangentDelta, radialDelta * 2.2) * 1.6, 0, 1);
      tangent[index] = tangentDelta;
      radial[index] = radialDelta * 2.2;
    }
  }
  return { slope, tangent, radial };
}

function smoothHorizonGradients(
  gradients: HorizonGradients,
  rowCount: number,
  passes: number,
): void {
  for (let pass = 0; pass < passes; pass++) {
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
      const offset = rowIndex * HORIZON_SEGMENTS;
      const sourceSlope = gradients.slope.slice(offset, offset + HORIZON_SEGMENTS);
      const sourceTangent = gradients.tangent.slice(offset, offset + HORIZON_SEGMENTS);
      const sourceRadial = gradients.radial.slice(offset, offset + HORIZON_SEGMENTS);
      for (let segment = 0; segment < HORIZON_SEGMENTS; segment++) {
        const before = (segment - 1 + HORIZON_SEGMENTS) % HORIZON_SEGMENTS;
        const after = (segment + 1) % HORIZON_SEGMENTS;
        gradients.slope[offset + segment] = sourceSlope[before] * 0.27
          + sourceSlope[segment] * 0.46 + sourceSlope[after] * 0.27;
        gradients.tangent[offset + segment] = sourceTangent[before] * 0.27
          + sourceTangent[segment] * 0.46 + sourceTangent[after] * 0.27;
        gradients.radial[offset + segment] = sourceRadial[before] * 0.27
          + sourceRadial[segment] * 0.46 + sourceRadial[after] * 0.27;
      }
    }
  }
}

function buildHorizonGradients(
  rows: readonly HorizonRingRow[],
  heights: Float32Array,
): HorizonGradients {
  const gradients = rawHorizonGradients(rows, smoothHorizonHeights(heights, rows.length, 3));
  smoothHorizonGradients(gradients, rows.length, 5);
  return gradients;
}

function applyHorizonSurfaceBands(
  color: THREE.Color,
  scratch: THREE.Color,
  context: HorizonColorContext,
  row: HorizonRingRow,
  angle: number,
  altitude: number,
  slope: number,
  rowIndex: number,
): void {
  const rockWeight = smoothstep(0.34, 0.8, slope) * (row.skirt ? 0.25 : context.rockAmp);
  color.lerp(context.rock, rockWeight);
  if (context.treeline > 0) {
    const forestNoise = context.noise.noise(
      Math.cos(angle) * 7 + 3 + altitude * 3.1,
      Math.sin(angle) * 7 + rowIndex - altitude * 2.4,
    ) * 0.5 + 0.5;
    const forestWeight = (1 - smoothstep(context.treeline * 0.55, context.treeline, altitude))
      * (1 - slope * 0.4) * (0.5 + 0.5 * forestNoise);
    color.lerp(context.forest, clamp(forestWeight, 0, 1) * 0.6);
  }
  if (context.banding > 0.001) {
    const steepWeight = smoothstep(0.3, 0.7, slope);
    scratch.setRGB(color.r * 1.08, color.g * 0.89, color.b * 0.75);
    color.lerp(scratch, steepWeight * 0.4);
  }
  if (context.snowline <= 1) {
    const band = smoothstep(
      context.snowline,
      context.snowline + 0.16,
      altitude + context.noise.noise(Math.cos(angle) * 6 - 9, Math.sin(angle) * 6 + 4) * 0.07,
    );
    const hold = 1 - smoothstep(0.38, 0.78, slope);
    const crest = smoothstep(0.52, 0.80, altitude);
    const effectiveHold = Math.min(1, hold + crest * 0.9);
    const coverage = clamp(band * 0.95 + (1 - band) * 0.38, 0, 1) * effectiveHold;
    color.lerp(context.snow, coverage);
  }
}

function horizonNormal(
  gradients: HorizonGradients,
  index: number,
  angle: number,
): readonly [number, number, number] {
  const nx = gradients.tangent[index] * Math.sin(angle) - gradients.radial[index] * Math.cos(angle);
  const nz = -gradients.tangent[index] * Math.cos(angle) - gradients.radial[index] * Math.sin(angle);
  const inverseLength = 1 / Math.hypot(nx, 1, nz);
  return [nx, nz, inverseLength];
}

function applyHorizonDirectionalLight(
  color: THREE.Color,
  scratch: THREE.Color,
  context: HorizonColorContext,
  row: HorizonRingRow,
  angle: number,
  index: number,
): void {
  const [nx, nz, inverseLength] = horizonNormal(context.gradients, index, angle);
  const [lightX, lightY, lightZ] = context.sun;
  const normalDotLight = (nx * lightX + lightY + nz * lightZ) * inverseLength;
  const relativeAmplitude = row.skirt ? 0.08
    : context.style === 'alpine' ? 0.10 : context.style === 'mesa' ? 0.34 : 0.26;
  const lit = Math.max(normalDotLight, 0);
  const shade = Math.max(-normalDotLight, 0);
  color.multiplyScalar(1 - relativeAmplitude * 0.85 + relativeAmplitude * 1.6 * lit);
  color.lerp(scratch.setRGB(color.r * 1.05, color.g, color.b * 0.92), lit * 0.30);
  color.lerp(scratch.setRGB(color.r * 0.88, color.g * 0.93, color.b * 1.08), shade * 0.35);
}

function applyHorizonToneAndHaze(
  color: THREE.Color,
  context: HorizonColorContext,
  row: HorizonRingRow,
  angle: number,
  altitude: number,
  rowIndex: number,
): void {
  const toneNoise = context.noise.noise(
    Math.cos(angle) * 5.5 + rowIndex * 0.7 + altitude * 2.6,
    Math.sin(angle) * 5.5 - rowIndex * 0.4 - altitude * 1.9,
  );
  color.multiplyScalar(1 + toneNoise * 0.045 * context.grainAmp);
  const baseHaze = row.aer * context.haze;
  const hazeWeight = row.skirt ? baseHaze : baseHaze + (1 - altitude) * 0.07;
  color.lerp(context.fog, clamp(hazeWeight, 0, 0.94));
}

function buildHorizonColors(context: HorizonColorContext): Float32Array {
  const colors = new Float32Array(context.heights.length * 3);
  const color = new THREE.Color();
  const scratch = new THREE.Color();
  for (let rowIndex = 0; rowIndex < context.rows.length; rowIndex++) {
    const row = context.rows[rowIndex];
    for (let segment = 0; segment < HORIZON_SEGMENTS; segment++) {
      const angle = (segment / HORIZON_SEGMENTS) * Math.PI * 2;
      const index = rowIndex * HORIZON_SEGMENTS + segment;
      const altitude = clamp(context.heights[index] / context.maxHeight, 0, 1);
      const slope = context.gradients.slope[index];
      color.copy(context.base).multiplyScalar(0.82 + altitude * 0.34);
      applyHorizonSurfaceBands(color, scratch, context, row, angle, altitude, slope, rowIndex);
      applyHorizonDirectionalLight(color, scratch, context, row, angle, index);
      applyHorizonToneAndHaze(color, context, row, angle, altitude, rowIndex);
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }
  }
  return colors;
}

function applyHorizonDebugColors(colors: Float32Array, rowCount: number): void {
  const debugColors = [[1, 0.4, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1]];
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
    const debugColor = debugColors[rowIndex % debugColors.length];
    for (let segment = 0; segment < HORIZON_SEGMENTS; segment++) {
      const index = rowIndex * HORIZON_SEGMENTS + segment;
      colors[index * 3] = debugColor[0];
      colors[index * 3 + 1] = debugColor[1];
      colors[index * 3 + 2] = debugColor[2];
    }
  }
}

function buildHorizonIndices(rowCount: number): number[] {
  const indices: number[] = [];
  for (let rowIndex = 0; rowIndex < rowCount - 1; rowIndex++) {
    for (let segment = 0; segment < HORIZON_SEGMENTS; segment++) {
      const next = (segment + 1) % HORIZON_SEGMENTS;
      const inner = rowIndex * HORIZON_SEGMENTS + segment;
      const innerNext = rowIndex * HORIZON_SEGMENTS + next;
      const outer = (rowIndex + 1) * HORIZON_SEGMENTS + segment;
      const outerNext = (rowIndex + 1) * HORIZON_SEGMENTS + next;
      indices.push(inner, outer, innerNext, innerNext, outer, outerNext);
    }
  }
  return indices;
}

function applyAnalyticHorizonNormals(
  geometry: THREE.BufferGeometry,
  style: HorizonStyle,
  rowCount: number,
  gradients: HorizonGradients,
): void {
  if (style !== 'alpine') return;
  const normals = geometry.attributes.normal;
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
    for (let segment = 0; segment < HORIZON_SEGMENTS; segment++) {
      const index = rowIndex * HORIZON_SEGMENTS + segment;
      const angle = (segment / HORIZON_SEGMENTS) * Math.PI * 2;
      const [nx, nz, inverseLength] = horizonNormal(gradients, index, angle);
      normals.setXYZ(index, nx * inverseLength, inverseLength, nz * inverseLength);
    }
  }
}

function buildHorizonGeometry(
  ring: HorizonRingGeometry,
  colors: Float32Array,
  uv: Float32Array,
  style: HorizonStyle,
  gradients: HorizonGradients,
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(ring.positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(buildHorizonIndices(ring.rows.length));
  geometry.computeVertexNormals();
  applyAnalyticHorizonNormals(geometry, style, ring.rows.length, gradients);
  return geometry;
}

interface HorizonMaterialContext {
  noise: SimplexNoise;
  banding: number;
  snowline: number;
  treeline: number;
  grainAmp: number;
  style: HorizonStyle;
  seed: number;
  mapId: string;
  sun: readonly [number, number, number];
  maxHeight: number;
}

function buildHorizonMaterial({
  noise: gnoi, banding, snowline, treeline, grainAmp, style, seed, mapId,
  sun, maxHeight: maxH,
}: HorizonMaterialContext): THREE.MeshBasicMaterial {
  const [lx, ly, lz] = sun;
  const gullyAmp = style === 'alpine' ? 0.06 : style === 'mesa' ? 0.14 : 0.0;
  const detailTex = makeHorizonTexture(gnoi, {
    banding, snowline, treeline, grainAmp, gullyAmp, coolRock: style === 'alpine',
  });
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.DoubleSide, map: detailTex,
  }); // unlit; scene fog still applies
  mat.color.setRGB(1.61, 1.61, 1.61);
  // r8: the alpine wall's product (0.62-gray texture x 1.61 recenter x snow
  // vertex colors x sun-side relight) landed at 0.9-1.4 LINEAR — squarely on
  // the ACES shoulder, where the (boosted) sastrugi/rib/crag texture contrast
  // compressed to a flat untextured gradient (the critique's "flat-shaded
  // low-poly" winter ring). Pull the whole alpine ring ~22% down into the
  // midtones; under the overcast sky a real range reads darker than the
  // foreground snowfield anyway, and the surface structure finally resolves.
  if (style === 'alpine') mat.color.setRGB(1.26, 1.26, 1.26);
  // controls_gunnery r5: high-zoom detail overlay (see makeDetailNoiseTexture)
  // — two extra octaves of isotropic mottle at ~6 m / ~22 m feature scales so
  // the x8 sniper frame reads textured hillsides instead of a flat gradient.
  // One u-repeat of the BASE uv covers ~370-800 m of arc and the full v range
  // ~130-200 m of altitude, so (64, 26) lands both overlay axes near 6-8 m.
  {
    const detail2 = makeDetailNoiseTexture(
      mulberry32(((seed ^ 0x0D37) ^ idHash(mapId)) >>> 0));
    // r3 terrain_environment: PER-FRAGMENT alpine material pass. The winter
    // wall used to carry all slope/sun response baked per-vertex — across
    // 12 x 150 m wall triangles that interpolates as flat planar facets and
    // vertical gradient smear ("untextured lilac cardboard"). The fragment
    // pass reads the SMOOTH interpolated vertex normal instead:
    //  - slope-keyed rock exposure with a noise-broken boundary (snow sheds
    //    off steep faces per-fragment, not per-vertex),
    //  - constant-altitude strata banding on the exposed rock,
    //  - a real N·L relight against the map sun (replaces the baked term,
    //    which is dropped to 0.10 for alpine above).
    // r4: 0.30 -> 0.40 — with the tighter row ladder the per-fragment relight
    // carries more of the directional shading (vertex bake stays at 0.10)
    const fragRel = style === 'alpine' ? 0.40 : 0.0;
    const slopeSplat = style === 'alpine' ? 1.0 : 0.0;
    // r7 terrain_environment: GRAZING-SMEAR KILL. The ring texture's u axis
    // wraps the ring, so on any wall seen along-tangent u compresses to zero
    // pixels and every fine feature renders as a 1-D function of v — the
    // "vertical texture smearing on steep faces" (winter left massif) and
    // the stretched mesa cap tops. Per-fragment fix: on steep faces (alpine,
    // uWallFix) / near-flat caps (mesa, uCapFix) the texel is rebuilt from a
    // DEEP MIP of itself (broad authored tone, smear-free) times a triplanar
    // world-anchored mottle from the tileable detail texture — true surface
    // texture at any view angle, exactly like the terrain-side triplanar.
    const wallFix = style === 'alpine' ? 1.0 : 0.0;
    const capFix = style === 'mesa' ? 1.0 : 0.0;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uDetail2 = { value: detail2 };
      shader.uniforms.uSunDirW = { value: new THREE.Vector3(lx, ly, lz) };
      shader.uniforms.uFragRel = { value: fragRel };
      shader.uniforms.uSlopeSplat = { value: slopeSplat };
      shader.uniforms.uMaxH = { value: maxH * 1.0 };
      shader.uniforms.uWallFix = { value: wallFix };
      shader.uniforms.uCapFix = { value: capFix };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>',
          '#include <common>\nvarying vec3 vHNrm;\nvarying vec3 vHPos;')
        .replace('#include <begin_vertex>',
          '#include <begin_vertex>\nvHNrm = normal;\nvHPos = position;');
      // onBeforeCompile uniforms are NOT auto-declared in the GLSL —
      // declared at global scope ahead of the injected block.
      shader.fragmentShader = 'uniform sampler2D uDetail2;\n'
        + 'uniform vec3 uSunDirW;\nuniform float uFragRel;\n'
        + 'uniform float uSlopeSplat;\nuniform float uMaxH;\n'
        + 'uniform float uWallFix;\nuniform float uCapFix;\n'
        + 'varying vec3 vHNrm;\nvarying vec3 vHPos;\n' +
        shader.fragmentShader.replace(
          '#include <map_fragment>', /* glsl */`#include <map_fragment>
        {
          vec3 hnW0 = normalize(vHNrm);
          float steepF0 = smoothstep(0.30, 0.60, 1.0 - hnW0.y) * uWallFix;
          float capF0 = smoothstep(0.84, 0.96, hnW0.y) * uCapFix;
          float fixW = max(steepF0, capF0);
          if (fixW > 0.004) {
            // broad smear-free base tone: the same texel at a deep mip
            vec3 mapSmooth = texture2D(map, vMapUv, 4.0).rgb;
            // triplanar world-anchored mottle, two feature scales
            vec3 awF = abs(hnW0);
            awF /= (awF.x + awF.y + awF.z);
            float wA = texture2D(uDetail2, vHPos.zy * 0.0052 + vec2(0.11, 0.71)).r * awF.x
                     + texture2D(uDetail2, vHPos.xy * 0.0052 + vec2(0.53, 0.29)).r * awF.z
                     + texture2D(uDetail2, vHPos.xz * 0.0052).r * awF.y;
            float wB = texture2D(uDetail2, vHPos.zy * 0.0175 + vec2(0.67, 0.13)).r * awF.x
                     + texture2D(uDetail2, vHPos.xy * 0.0175 + vec2(0.23, 0.87)).r * awF.z
                     + texture2D(uDetail2, vHPos.xz * 0.0175 + vec2(0.37, 0.61)).r * awF.y;
            vec3 fixCol = mapSmooth * (1.0 + (wA - 0.5) * 0.46 + (wB - 0.5) * 0.34);
            diffuseColor.rgb = diffuseColor.rgb / max(texture2D(map, vMapUv).rgb, vec3(1e-3))
              * mix(texture2D(map, vMapUv).rgb, fixCol, fixW * 0.85);
          }
          float dA = texture2D(uDetail2, vMapUv * vec2(64.0, 26.0)).r - 0.5;
          float dB = texture2D(uDetail2, vMapUv * vec2(17.0, 7.0) + vec2(0.37, 0.11)).r - 0.5;
          // amplitudes sized to SURVIVE the baked haze lerp + scene fog: the
          // wall multiplies this onto an already fog-flattened vertex color,
          // so ±0.1 authored contrast reads as ~±0.04 on screen (still-flat
          // first cut). ±0.29 lands at the crown-mottle read real hills give.
          // r7: the vMapUv-based overlay is itself u-degenerate on grazed
          // walls — fade it where the triplanar fix takes over.
          diffuseColor.rgb *= 1.0 + (dA * 0.28 + dB * 0.30) * (1.0 - fixW * 0.8);
          if (uSlopeSplat > 0.001) {
            vec3 hn = normalize(vHNrm);
            float slopeF = 1.0 - clamp(hn.y, 0.0, 1.0);
            // aerial attenuation: the outer ranges stay fog-flattened
            float farAtt = 1.0 - smoothstep(700.0, 1400.0, length(vHPos.xz)) * 0.62;
            // r6 (content_breadth) TRIPLANAR boundary noise. The old fields
            // sampled vHPos.xz only — constant straight DOWN a steep face, so
            // the rock/snow mix varied laterally but never vertically and the
            // whole wall broke into full-height light/dark runnels (the
            // critique's "rain streaks" on the winter massif). Blend the
            // horizontal-plane sample with the two vertical-plane projections
            // by the smooth normal, exactly like the terrain-side steep-slope
            // splat: steep faces now sample laterally-AND-vertically and the
            // boundary breaks into patches down the face. A third ~45 m field
            // (nD) adds the within-face patch scale the two broad fields lack.
            vec3 awT = abs(hn);
            awT /= (awT.x + awT.y + awT.z);
            #define HTRIP(s, o) (texture2D(uDetail2, vHPos.xz * (s) + (o)).r * awT.y \
              + texture2D(uDetail2, vHPos.zy * (s) + (o) + vec2(0.41, 0.07)).r * awT.x \
              + texture2D(uDetail2, vHPos.xy * (s) + (o) + vec2(0.13, 0.61)).r * awT.z)
            float nB = HTRIP(0.0016, vec2(0.0)) - 0.5;
            float nC = HTRIP(0.0071, vec2(0.29, 0.53)) - 0.5;
            float nD = HTRIP(0.0230, vec2(0.71, 0.19)) - 0.5;
            float hT = clamp(vHPos.y / max(uMaxH, 1.0), 0.0, 1.0);
            // rock exposure on steep faces; the highest crests hold snow
            float rockW = smoothstep(0.30, 0.58, slopeF + nB * 0.34 + nC * 0.20 + nD * 0.14)
                        * (1.0 - smoothstep(0.55, 0.85, hT) * 0.70) * uSlopeSplat * farAtt;
            vec3 rockCol = diffuseColor.rgb * vec3(0.47, 0.50, 0.58);
            // constant-altitude strata relief on the exposed rock
            float bedR = sin(vHPos.y * 0.42 + nB * 9.0) * 0.6
                       + sin(vHPos.y * 0.13 + nC * 5.0) * 0.4;
            rockCol *= 1.0 + bedR * 0.16;
            diffuseColor.rgb = mix(diffuseColor.rgb, rockCol, rockW * 0.85);
            // per-fragment N·L relight (smooth normals -> no planar facets)
            float ndl = dot(hn, uSunDirW);
            float rel = uFragRel * farAtt;
            diffuseColor.rgb *= 1.0 - rel * 0.85 + rel * 1.6 * max(ndl, 0.0);
            diffuseColor.rgb = mix(diffuseColor.rgb,
              diffuseColor.rgb * vec3(0.90, 0.94, 1.07), max(-ndl, 0.0) * 0.32 * farAtt);
          }
        }`);
    };
    mat.customProgramCacheKey = () => 'horizon-ring-r7te-' + style;
  }
  return mat;
}

interface HorizonTreelineContext {
  mesh: THREE.Mesh;
  treeline: number;
  seed: number;
  mapId: string;
  noise: SimplexNoise;
  rows: readonly HorizonRingRow[];
  positions: Float32Array;
  maxHeight: number;
  snowline: number;
  fog: THREE.Color;
  colors: Float32Array;
  layers: number;
}

function addHorizonTreeline({
  mesh, treeline, seed, mapId, noise: gnoi, rows, positions: pos,
  maxHeight: maxH, snowline, fog: fogC, colors: col, layers: treelineLayers,
}: HorizonTreelineContext): void {
  const N = HORIZON_SEGMENTS;
  if (treeline < 0.14) return;
    const profileSeed = ((seed ^ 0xA771) ^ idHash(mapId)) >>> 0;
    const combTex = makeTreeLineTexture(profileSeed);
    // Alpine walls contain interpolated geometry rows for smooth shading.
    // Planting a ribbon on every row stacked visible contour stripes. Instead,
    // resolve the actual angular skyline once and follow that one envelope.
    const authoredRows = [];
    for (let ri = 0; ri < rows.length; ri++) {
      if (!rows[ri].skirt && !rows[ri].interpolated) authoredRows.push(ri);
    }
    const skylineRows = new Int16Array(N);
    let skylineRadius = 0;
    const observerY = 24;
    for (let k = 0; k < N; k++) {
      let bestRow = authoredRows[0] ?? 0;
      let bestRise = -Infinity;
      for (const ri of authoredRows) {
        const i = ri * N + k;
        const radius = Math.hypot(pos[i * 3], pos[i * 3 + 2]);
        const rise = (pos[i * 3 + 1] - observerY) / Math.max(1, radius);
        if (rise > bestRise) {
          bestRise = rise;
          bestRow = ri;
        }
      }
      skylineRows[k] = bestRow;
      skylineRadius += rows[bestRow].r;
    }
    skylineRadius /= N;
    const tlH = treeline * maxH;
    const cPos = [], cCol = [], cUv = [], cIdx = [];
    let vBase = 0;
    const atlasPad = 1.5 / Math.max(1, combTex.image.height);
    const atlasRange = (variant: number): readonly [number, number] => {
      const v0 = variant / HORIZON_TREELINE_ATLAS_VARIANTS + atlasPad;
      const v1 = (variant + 1) / HORIZON_TREELINE_ATLAS_VARIANTS - atlasPad;
      return [v0, Math.max(v0, v1)];
    };
    // Forest-heavy maps can carry two or three skyline-depth ranks. The rear
    // ranks are farther beyond the resolved skyline and more fog-washed. They
    // are still folded into one BufferGeometry and one draw call.
    const baseRepeats = Math.max(8, Math.round((Math.PI * 2 * skylineRadius) / 96));
    for (let layer = treelineLayers - 1; layer >= 0; layer--) {
      const variant = (profileSeed + layer * 3) % HORIZON_TREELINE_ATLAS_VARIANTS;
      const repeats = baseRepeats + layer;
      const [v0, v1] = atlasRange(variant);
      for (let k = 0; k <= N; k++) {  // N+1 columns: seam-free u wrap
        const kk = k % N;
        const ri = skylineRows[kk];
        const row = rows[ri];
        const i = ri * N + kk;
        const x = pos[i * 3], hh = pos[i * 3 + 1], z = pos[i * 3 + 2];
        // Trees thin toward the treeline and vanish above it. Rear ranks use
        // independent crown walks, not scaled duplicates of the front row.
        const height01 = hh / Math.max(1, maxH);
        const snowFade = snowline <= 1
          ? 1 - smoothstep(snowline - 0.05, snowline + 0.02, height01) : 1;
        const fade = (1 - smoothstep(tlH * 0.8, tlH * 1.12, hh)) * snowFade;
        const a = (kk / N) * Math.PI * 2;
        const hn = gnoi.noise(Math.cos(a) * 5.3 + ri * 9 + layer * 7.7,
          Math.sin(a) * 5.3 - ri * 5 - layer * 4.1) * 0.5 + 0.5;
        const hn2 = gnoi.noise(Math.cos(a) * 19.7 + ri * 3.1 - layer * 5.3,
          Math.sin(a) * 19.7 + ri * 11.9 + layer * 8.9) * 0.5 + 0.5;
        const span = (9 + hn * 7) * (0.94 + Math.min(row.r, 1400) / 7000) * fade *
          (0.88 + hn2 * 0.24) * (1 - layer * 0.045);
        // All ranks sit just behind the resolved crest. Putting the ribbon on
        // its inner slope lets the ridge's own triangles depth-occlude the
        // canopy completely; the small outward offset keeps the base hidden
        // by the crest while allowing the crowns to break the sky edge.
        const radialScale = 1.001 + layer * 0.006;
        const drop = 3.2 + layer * 0.72;
        cPos.push(x * radialScale, hh - drop, z * radialScale,
          x * radialScale, hh - drop + span, z * radialScale);
        // Additional aerial perspective is the main depth cue at these
        // distances and prevents dark, high-contrast cardboard silhouettes.
        const hz = Math.min(0.94, row.aer * 0.66 + 0.16 + layer * 0.11);
        const light = 1.7 - layer * 0.08;
        let cr = Math.min(1.9, col[i * 3] * light);
        let cg = Math.min(1.9, col[i * 3 + 1] * light);
        let cb = Math.min(1.9, col[i * 3 + 2] * light);
        cr += (fogC.r - cr) * hz;
        cg += (fogC.g - cg) * hz;
        cb += (fogC.b - cb) * hz;
        cCol.push(cr, cg, cb, cr, cg, cb);
        const u = (k / N) * repeats + variant * 0.23 + layer * 0.41;
        cUv.push(u, v0, u, v1);
      }
      for (let k = 0; k < N; k++) {
        const b0 = vBase + k * 2, t0 = b0 + 1, b1 = b0 + 2, t1 = b1 + 1;
        cIdx.push(b0, b1, t0, t0, b1, t1);
      }
      vBase += (N + 1) * 2;
    }
    // Do not plant ribbons on the ridge faces. They only read as parallel
    // contour stripes under scope magnification; the baked forest tint on the
    // horizon mesh already provides the correct distant canopy mass there.
    const cGeo = new THREE.BufferGeometry();
    cGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cPos), 3));
    cGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cCol), 3));
    cGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(cUv), 2));
    cGeo.setIndex(cIdx);
    const cMat = new THREE.MeshBasicMaterial({
      map: combTex, vertexColors: true, alphaTest: 0.38,
      alphaToCoverage: true, side: THREE.DoubleSide,
    });
    const comb = new THREE.Mesh(cGeo, cMat);
    comb.name = 'horizon-treeline';
    comb.castShadow = false;
    comb.receiveShadow = false;
    comb.matrixAutoUpdate = false;
    comb.userData.aoExclude = true;
    comb.userData.horizonTreeline = {
      layers: treelineLayers,
      role: 'outer-skyline',
      vertices: cPos.length / 3,
    };
    mesh.add(comb);
}

interface HorizonResolvedSettings {
  amp: number;
  haze: number;
  grainAmp: number;
  snowline: number;
  treeline: number;
  treelineLayers: number;
  banding: number;
  rockAmp: number;
}

interface HorizonPalette {
  base: THREE.Color;
  fog: THREE.Color;
  rock: THREE.Color;
  snow: THREE.Color;
  forest: THREE.Color;
}

function resolveHorizonStyle(horizon: HorizonConfig, mapId: string): HorizonStyle {
  return horizon.style || STYLE_BY_MAP[mapId] || 'rolling';
}

function resolveHorizonSettings(
  horizon: HorizonConfig,
  style: HorizonStyle,
): HorizonResolvedSettings {
  const defaultTreeline = style === 'rolling' ? 0.90 : style === 'escarpment' ? 0.88 : 0;
  const rockAmp = style === 'rolling' ? 0.22 : style === 'escarpment' ? 0.3 : 0.78;
  return {
    amp: horizon.amp ?? 1,
    haze: horizon.haze ?? 1,
    grainAmp: horizon.grain ?? 1,
    snowline: horizon.snowline ?? (style === 'alpine' ? 0.42 : 2),
    treeline: horizon.treeline ?? defaultTreeline,
    treelineLayers: resolveHorizonTreelineLayers(horizon),
    banding: horizon.banding ?? (style === 'mesa' ? 0.16 : 0),
    rockAmp,
  };
}

function resolveHorizonPalette(
  horizon: HorizonConfig,
  sky: MapSkyConfig | undefined,
  style: HorizonStyle,
): HorizonPalette {
  const defaultRock = style === 'mesa' ? 0x8a5a38 : 0x66625e;
  return {
    base: new THREE.Color(horizon.baseHex ?? 0x5b6c4c),
    fog: new THREE.Color(sky?.fogTintHex ?? 0x8fa3bd),
    rock: new THREE.Color(horizon.rockHex ?? defaultRock),
    snow: new THREE.Color(horizon.snowHex ?? 0xeef2f7),
    forest: new THREE.Color(horizon.forestHex ?? 0x435f3a),
  };
}

/**
 * Build the horizon mountain ring for a map.
 * @param {object} engineCtx EngineCtx (unused, kept for call-site parity)
 * @param {?object} cfg map config (uses cfg.horizon, cfg.sky, cfg.id)
 * @param {number} seed base seed (mixed with the map id hash)
 * @returns {THREE.Mesh} unlit vertex-colored ring mesh named 'horizon-ring'
 */
export function buildHorizonRing(
  _engineCtx: object | null,
  cfg: HorizonMapConfig | null | undefined,
  seed: number,
): THREE.Mesh {
  const H = cfg?.horizon || {};
  const mapId = cfg?.id || 'verdant';
  const style = resolveHorizonStyle(H, mapId);
  const profile = PROFILES[style];
  const {
    amp, haze, grainAmp, snowline, treeline, treelineLayers, banding, rockAmp,
  } = resolveHorizonSettings(H, style);

  // lighting_post r7: vegetated ring base lifted toward the SUNLIT hillside
  // band (0x4a5a44 -> 0x5b6c4c) — the unlit ring's baked colors must carry
  // the sun x albedo product; 2-3-stops-dark backdrop was the teal-curtain
  // critical's other half.
  const { base, fog: fogC, rock: rockC, snow: snowC, forest: forestC } =
    resolveHorizonPalette(H, cfg?.sky, style);
  // detail palette: sensible per-style defaults, overridable per map
  // r7: vegetated default treelines pushed near the crests (0.55/0.5 ->
  // 0.90/0.88). The old constant-altitude cutoff drew a horizontal band
  // across every hill where forest texture gave way to smooth bald ramp —
  // the critic's "artificial terrace band" + "bald gradient slopes". At
  // these view distances real hill country reads forested to the summit.
  // soft vegetated hills carry far less exposed rock / flank contrast than
  // cliff-forming styles — full strength there reads as curtain striping
  const noi = new SimplexNoise({ random: mulberry32(((seed ^ 0x7A11) ^ idHash(mapId)) >>> 0) });
  const gnoi = new SimplexNoise({ random: mulberry32(((seed ^ 0x33C7) ^ idHash(mapId)) >>> 0) });

  // Radial rows. The tuck + skirt rows ride just outside the playable rim and
  // stay LOW but opaque (ground-toned) so the fog-washed outer floor and the
  // pale sky band can never peek between the rim crest and the ridges — the
  // old ring showed exactly that gap as a white 'sea' sheet in wide shots.
  // Ridge bases sit well above any establishing camera (~50 m).
  // ANCHOR row: pinned 22 m underground inside the map rim, so the ring's
  // inner lip is welded to the terrain — without it, any skirt vertex that
  // rises above a rim dip opens a slot where the cream horizon sky pours
  // through as flat white 'ponds' behind the rim forest.
  // Skirt base 26-40 m + first ridge base 50 m keep the wall itself clear of
  // the rim crest at the map edge.
  // r6: rows are PER STYLE. The shared table put the first ridge at base 50 /
  // amp 52 only ~100 m past the rim — on the vegetated maps that projected as
  // a near-vertical green wall filling a third of the frame (the "curtain"
  // critique). Vegetated styles now open with a LOW first ridge and recede
  // through progressively taller, much hazier shells, so the ring reads as
  // 3-4 distinct forested ridgelines instead of one continuous slope. Cliff
  // styles (alpine/mesa) keep the imposing wall — it suits them.
  const rows0 = HORIZON_ROWS_BY_STYLE[style] || HORIZON_ROWS_BY_STYLE.default;
  const initialRing = buildInitialHorizonGeometry(rows0, style, profile, noi, amp);

  // --- alpine RADIAL SUBDIVISION (content_breadth r5) ------------------------
  // Even with the 9-row ladder + smoothed analytic normals, the wall between
  // two adjacent alpine rows is ONE quad strip spanning 65-200 m radially —
  // from the establishing camera those quads render as flat "folded paper"
  // facets with a plain vertex-color gradient (critique, minor). Insert two
  // interpolated circles per non-skirt gap and displace them with a fractal
  // crag field scaled to the local wall relief: facet size drops ~3x, and the
  // sub-row knolls/gullies feed the smoothed-normal relight + per-fragment
  // rock splat with REAL surface structure instead of an interpolation ramp.
  // Silhouette is untouched (authored crest circles keep their vertices);
  // other styles pass through unchanged. Cost: 9 -> 21 rows x 520 verts.
  const ring = subdivideAlpineGeometry(initialRing, style, noi);
  const { rows, positions: pos, heights: hs, maxHeight: maxH } = ring;
  const uvA = buildHorizonUvs(hs, maxH);
  // detail-texture UVs: u wraps the ring, v = absolute altitude fraction so
  // strata/snow features in the texture land at constant world height
  // --- vertex shading -------------------------------------------------------
  // Baked, unlit: sun-facing ridge flanks lighter (real azimuth from cfg.sky),
  // steep faces expose rock, snow above the snowline on gentler slopes, forest
  // tint below the treeline, sandstone strata on mesa cliffs, fine albedo
  // grain, then the aerial-perspective haze ramp toward the fog color.
  const sunAz = ((cfg && cfg.sky && cfg.sky.sunAzimuthDeg) ?? 115) * Math.PI / 180;
  // lighting_post r3: real per-vertex N·L against the map sun replaces the
  // tangential-only baked sun/shade term (walls read as unshaded texture at
  // sniper x8). Elevation from cfg.sky, default 32 deg.
  const sunEl = ((cfg && cfg.sky && cfg.sky.sunElevationDeg) ?? 32) * Math.PI / 180;
  const lx = Math.sin(sunAz) * Math.cos(sunEl);
  const ly = Math.sin(sunEl);
  const lz = Math.cos(sunAz) * Math.cos(sunEl);
  // SMOOTHED height series for the shading derivatives only (silhouette keeps
  // its sharp vertices): raw per-vertex differences bake into alternating
  // light/dark column striping on the ridge faces.
  const gradients = buildHorizonGradients(rows, hs);
  // Per-vertex slope/sun response, then SMOOTHED ALONG THE RING before it
  // drives any color: the wall between two radial rows is a single quad
  // strip ~7 m wide and up to 100+ m tall, so any column-to-column jitter in
  // a slope-keyed color term (rock takeover, iron-oxide flush, snow shedding)
  // bakes into exact full-height vertical stripes — the r3 critique's
  // "vertical texture smearing" on the desert canyon walls was these vertex
  // color columns, not the detail texture.
  const col = buildHorizonColors({
    style, rows, heights: hs, maxHeight: maxH,
    base, fog: fogC, rock: rockC, snow: snowC, forest: forestC,
    snowline, treeline, banding, rockAmp, haze, grainAmp, noise: gnoi,
    gradients, sun: [lx, ly, lz],
  });

  // DEBUG: paint each row a flat color to identify geometry in screenshots
  const horizonDebug = (globalThis as typeof globalThis & { __HORIZON_DEBUG?: boolean })
    .__HORIZON_DEBUG;
  if (horizonDebug) applyHorizonDebugColors(col, rows.length);
  const geo = buildHorizonGeometry(ring, col, uvA, style, gradients);
  // DoubleSide: the shallow inner skirt annulus is seen from ABOVE by raised
  // establishing cameras — with default FrontSide it backface-culls and the
  // sky shows through as a pale 'sea sheet' between rim and ridges (the old
  // ring's desert artifact).
  // Detail texture is authored around mid-gray 0.62 (linear); the material
  // color 1.61 recentres it so vertex colors keep their intended tone while
  // the map layers rock grain / gullies / strata / snow flatten on top.
  // gullies belong on cliff-forming styles; vegetated hills at 700 m don't
  // show drainage chutes, they show forest texture
  // chute strength tuned way down on the cliff styles: at far-wall
  // magnification the old 1.0/0.85 chutes dominated every face as vertical
  // streaking — strata (mesa) and snow/rock contrast (alpine) carry the
  // material read instead
  // r6: mesa 0.38 -> 0.14 — even the tuned chutes still stacked with the
  // sheared strata into vertical melt on the far walls; vegetated styles get
  // ZERO (the canopy texture owns those faces, and any downslope streak
  // reads as curtain fabric on a forested hill)
  // r7: alpine 0.24 -> 0.12 — the residual chutes still striped the big
  // near walls with vertical fiber under the winter overcast
  // r1 (content_breadth): alpine 0.12 -> 0.06 — pairs with the segmented rib
  // cut in the snow pass; kills the last of the vertical smear on the wall
  const mat = buildHorizonMaterial({
    noise: gnoi, banding, snowline, treeline, grainAmp, style, seed, mapId,
    sun: [lx, ly, lz], maxHeight: maxH,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'horizon-ring';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;
  // GTAO's depth-edge pass draws dark halo slashes along distant ridge
  // silhouettes — exclude the backdrop like the other flat-lit world layers
  mesh.userData.aoExclude = true;

  // --- distant skyline impostor (vegetated styles only) ---------------------
  // One alpha-tested canopy ribbon follows whichever authored ridge actually
  // forms the skyline at each azimuth. It adds a soft forest-scale irregularity
  // against the sky without layering cards over visible ridge faces, and
  // inherits the same baked color/haze grading.
  // Values below 0.14 fade every crown to zero; skip the texture, geometry,
  // and draw call entirely on the intentionally bare desert/canyon maps.
  addHorizonTreeline({
    mesh, treeline, seed, mapId, noise: gnoi, rows, positions: pos,
    maxHeight: maxH, snowline, fog: fogC, colors: col, layers: treelineLayers,
  });
  return mesh;
}
