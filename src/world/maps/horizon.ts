import { prepareAutumnHorizonGround } from '../horizonAutumnGround.ts';
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
//   finiteTableCaps,                — false for historical tableland authoring comparisons
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
import { registerRetainedObject3DResources } from '../../engine/resourceLifetime.ts';
import { HORIZON_MESA_SURFACE_FRAGMENT } from '../horizonMesaSurface.ts';
import { shapeRedrockOutland, seatHorizonTerrainSeam, tintRedrockOutlandFloor, type CanyonGround } from '../horizonRedrock.ts';
import { shapeVerdantOutland, mapVerdantOutlandUv, sampleVerdantWoodland, verdantGroundChannel,
  paintVerdantCanopy, createVerdantWoodland, VERDANT_OUTLAND_SIZE, VERDANT_HORIZON_FRAGMENT } from '../horizonVerdant.ts';

export type HorizonStyle = 'rolling' | 'alpine' | 'mesa' | 'escarpment';

interface HorizonSeaOpening {
  azimuthDeg: number;
  widthDeg: number;
  level: number;
  colorHex?: number;
}

export interface HorizonConfig {
  baseHex?: number;
  amp?: number;
  style?: HorizonStyle;
  snowline?: number;
  treeline?: number;
  treelineLayers?: number;
  finiteTableCaps?: boolean;
  redrockCanyon?: boolean;
  banding?: number;
  rockHex?: number;
  snowHex?: number;
  forestHex?: number;
  haze?: number;
  grain?: number;
  seaOpening?: HorizonSeaOpening;
}

export interface MapSkyConfig extends Partial<SkyPreset> {
  sunIntensity?: number;
  sunColorHex?: number;
  hemiIntensity?: number;
  fillIntensity?: number;
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

export interface HorizonTextureOptions {
  verdantSeed?: number;
  banding: number;
  snowline: number;
  treeline: number;
  grainAmp: number;
  gullyAmp?: number;
  coolRock?: boolean;
  mesaSurface?: boolean;
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
    const broad = noi.noise(Math.cos(aw) * row.f0 * 0.95 + 21,
      Math.sin(aw) * row.f0 * 0.95 - 14) * 0.5 + 0.5;
    const shoulder = noi.noise(Math.cos(aw) * row.f0 * 1.9 - 37,
      Math.sin(aw) * row.f0 * 1.9 + 28) * 0.5 + 0.5;
    const spur = noi.noise(Math.cos(a) * row.f0 * 2.65 + 83,
      Math.sin(a) * row.f0 * 2.65 - 61) * 0.5 + 0.5;
    // Each range has its own broad low passes. Scaling the pedestal too is
    // important: a positive base under every summit still extrudes a closed
    // wall, even when the small peaks on top look individually varied.
    const envelope = 0.18 + smoothstep(0.22, 0.78,
      noi.noise(Math.cos(a) * 0.92 + 3.1 + row.f1 * 1.7,
        Math.sin(a) * 0.92 - 8.7 - row.f0 * 2.3) * 0.5 + 0.5) * 0.90;
    // Distinct broad summits and saddles, not a saturated smoothstep lid.
    // The former half-frequency outer range stayed almost level across an
    // entire camera view and made the annulus look like a continuous wall.
    const massif = Math.pow(broad, 1.45) * 0.72
      + shoulder * shoulder * 0.24
      + (spur - 0.5) * 0.08;
    return (row.base + clamp(massif, 0.02, 1.0) * row.amp) * envelope;
  },
  // stepped tablelands: noise pushed through plateau terraces -> long flat
  // caps with cliff edges, plus lone buttes between the tables
  mesa(a, noi, row) {
    const n0 = noi.noise(Math.cos(a) * row.f0 + 41 + row.f1 * 1.3,
      Math.sin(a) * row.f0 - 27 - row.f0 * 2.1) * 0.5 + 0.5;
    const n2 = noi.noise(Math.cos(a) * row.f1 * 0.7 - 13,
      Math.sin(a) * row.f1 * 0.7 + 33) * 0.5 + 0.5;
    // r7 terrain_environment: EDGE CRENELLATION — two finer octaves wobble
    // the terrace-threshold field so cap rims read embayed/eroded promontory
    // lines instead of vector-clean prism edges (critique: "flat-faced
    // prisms"). Small amplitude: the wobble bends the PLAN of the cliff
    // line without breaking the flat-cap read.
    const cren = noi.noise(Math.cos(a) * row.f0 * 2.1 - 71, Math.sin(a) * row.f0 * 2.1 + 15) * 0.042
      + noi.noise(Math.cos(a) * row.f0 * 4.8 + 133, Math.sin(a) * row.f0 * 4.8 - 55) * 0.018;
    const n = n0 + cren;
    // two terrace levels with tight smoothstep walls => visible flat tops,
    // over a broad pedestal so inter-table stretches never sag to bare base
    // (bare-base gaps exposed the fog-washed backslope behind as a white
    // 'lake' sheet)
    // Broad shoulders form substantial tablelands. The old narrow thresholds
    // and high-frequency independent buttes extruded thin pink sheets on
    // Skybridge. Buttes now rise only from an established lower table.
    const table1 = smoothstep(0.32, 0.50, n);
    const table2 = smoothstep(0.60, 0.77, n);
    const butte = smoothstep(0.70, 0.86, n2) * (1 - table2) * table1;
    const pedestal = smoothstep(0.14, 0.52, n) * 0.17;
    // r7: second cap-relief octave — tops undulate a few meters instead of
    // extruding one dead-flat lid per table
    const capWobble = 1 + 0.05 * noi.noise(Math.cos(a) * 9 + 3, Math.sin(a) * 9 - 8)
      + 0.028 * noi.noise(Math.cos(a) * 23 - 17, Math.sin(a) * 23 + 41);
    return row.base + (pedestal + table1 * 0.45 + table2 * 0.34 + butte * 0.18) * row.amp * capWobble;
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

function softenHorizonRing(
  heights: Float32Array,
  offset: number,
  count: number,
  row: HorizonProfileRow,
  amp: number,
  style: 'alpine' | 'mesa' = 'alpine',
): void {
  const scratch = new Float32Array(count);
  // Mesa keeps broader, firmer cap transitions than glacial mountains, but
  // a one-column terrace spike must not become an entire vertical sheet.
  for (let pass = 0; pass < (style === 'mesa' ? 3 : 8); pass++) {
    for (let k = 0; k < count; k++) {
      const km = (k - 1 + count) % count, kp = (k + 1) % count;
      scratch[k] = heights[offset + km] * 0.24
        + heights[offset + k] * 0.52 + heights[offset + kp] * 0.24;
    }
    for (let k = 0; k < count; k++) heights[offset + k] = scratch[k];
  }
  const maxStep = 1.35 + row.amp * amp * (style === 'mesa' ? 0.07 : 0.035);
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
  if (style === 'alpine' || style === 'mesa') softenHorizonRing(heights, 0, count, row, amp, style);
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
export type HorizonNoiseSampler = (
  u: number,
  v: number,
  frequencyU: number,
  frequencyV: number,
  offset: number,
) => number;

export interface HorizonTextureTerrainSample {
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

export function createHorizonNoiseSampler(noise: SimplexNoise): HorizonNoiseSampler {
  const tau = Math.PI * 2;
  // A pixel recipe changes frequencies and altitude while reusing its angle.
  // Keep only the last exact angular pair for this construction, not a cache
  // of texture samples or map resources. Object.is preserves signed zero.
  let previousU = NaN, cosine = NaN, sine = NaN;
  return (u, v, frequencyU, frequencyV, offset) => {
    if (!Object.is(u, previousU)) {
      previousU = u;
      cosine = Math.cos(u * tau);
      sine = Math.sin(u * tau);
    }
    return noise.noise3d(
      cosine * frequencyU * 0.5 + offset,
      sine * frequencyU * 0.5 - offset * 0.7,
      v * frequencyV + offset * 1.31,
    );
  };
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

export function sampleHorizonTextureTerrain(
  sampleNoise: HorizonNoiseSampler,
  options: HorizonTextureOptions,
  u: number,
  v: number,
): HorizonTextureTerrainSample {
  const { banding, treeline, grainAmp, gullyAmp = 1 } = options;
  const belowTree = treeline > 0
    ? 1 - smoothstep(treeline * 0.85, treeline * 1.08, v) : 0;
  // A small band of scrub at a mesa's base must not disable rock grain and
  // scree over the entire cliff. Reuse the existing local biome mask, skipping
  // pure noise only where its contribution is exactly zero.
  const fineDetail = options.mesaSurface ? 1 - belowTree : treeline > 0 ? 0 : 1;
  let luminance = 1;
  if (fineDetail !== 0 && grainAmp !== 0) {
    luminance += (sampleNoise(u, v, 90, 100, 17) * 0.05
      + sampleNoise(u, v, 34, 38, 5) * 0.06) * grainAmp * fineDetail;
  }
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
  if (fineDetail !== 0) {
    const talus = sampleNoise(u, v, 64, 46, 205);
    luminance *= 1 + talus * 0.045 * (0.5 + 0.5 * gullyAmp) * fineDetail;
  }
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
  const crownLight = clamp(1 + (crownA * 0.055 + crownB * 0.08
    + crownSlope * 0.10) * below, 0.6, 1.5);
  r *= crownLight; g *= crownLight; b *= crownLight;
  const standA = sampleNoise(u, v, 9, 5.5, 217) * 0.5 + 0.5;
  const standB = sampleNoise(u, v, 3.4, 2.1, 305) * 0.5 + 0.5;
  const standC = sampleNoise(u, v, 1.3, 0.9, 419) * 0.5 + 0.5;
  const warmWeight = smoothstep(0.48, 0.78, standB) * below;
  r *= 1 + warmWeight * 0.16;
  g *= 1 + warmWeight * 0.10;
  b *= 1 - warmWeight * 0.10;
  const darkWeight = smoothstep(0.53, 0.82, 1 - standA) * below;
  r *= 1 - darkWeight * 0.22;
  g *= 1 - darkWeight * 0.12;
  b *= 1 - darkWeight * 0.08;
  const lift = (standC - 0.5) * 0.14 * below;
  r *= 1 + lift; g *= 1 + lift; b *= 1 + lift;
  const clearing = smoothstep(0.53, 0.82,
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

function sampleHorizonBiomeTone(
  sampleNoise: HorizonNoiseSampler,
  options: HorizonTextureOptions,
  altitude: number,
): HorizonTextureColor {
  let r = 0, g = 0, b = 0;
  // Altitude is suitable for biome tint, not surface coordinates. Averaging
  // sixteen angular samples preserves the existing forest/snow hue policy
  // without stretching a detailed atlas along a flat crest or low shore.
  for (let sample = 0; sample < 16; sample++) {
    const color = sampleHorizonTexturePixel(sampleNoise, options, (sample + 0.5) / 16, altitude);
    r += color.r; g += color.g; b += color.b;
  }
  return { r: r / 16, g: g / 16, b: b / 16 };
}

function* makeHorizonTextureSteps(
  noi: SimplexNoise,
  options: HorizonTextureOptions,
): Generator<void, THREE.CanvasTexture, void> {
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
  // Alpine detail is world-projected in the shader. Its same-sized base
  // texture now holds only biome tone, with no artificial altitude ledges.
  // This takes 3,072 pixel-recipe samples instead of 98,304 on desktop.
  const toneOptions = options.coolRock ? { ...options, coolRock: false, banding: 0 } : null;
  for (let y = 0; y < sv; y++) {
    const v = 1 - y / (sv - 1);
    const tone = toneOptions ? sampleHorizonBiomeTone(sampleNoise, toneOptions, v) : null;
    for (let x = 0; x < su; x++) {
      if (options.verdantSeed !== undefined) {
        const cover = sampleVerdantWoodland((x / (su - 1) - .5) * VERDANT_OUTLAND_SIZE,
          (v - .5) * VERDANT_OUTLAND_SIZE, options.verdantSeed);
        const offset = (y * su + x) * 4;
        for (let channel = 0; channel < 3; channel++) d[offset + channel] = verdantGroundChannel(cover, channel) * 255;
        d[offset + 3] = 255;
        continue;
      }
      const color = tone ?? sampleHorizonTexturePixel(sampleNoise, options, x / su, v);
      const offset = (y * su + x) * 4;
      d[offset] = clamp(color.r * 159, 0, 255);
      d[offset + 1] = clamp(color.g * 159, 0, 255);
      d[offset + 2] = clamp(color.b * 159, 0, 255);
      d[offset + 3] = 255;
    }
    if ((y & 15) === 15) yield;
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
function* makeDetailNoiseTextureSteps(
  rng: () => number,
): Generator<void, THREE.CanvasTexture, void> {
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
    if ((y & 31) === 31) yield;
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
function makeTreeLineTexture(profileSeed: number, verdant = false): THREE.CanvasTexture {
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
  if (verdant) paintVerdantCanopy(ctx, w, h, profileSeed);
  for (let variant = 0; !verdant && variant < variants; variant++) {
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
    if (d[i + 3] < 40) { d[i] = verdant ? 194 : 138; d[i + 1] = verdant ? 194 : 152; d[i + 2] = verdant ? 194 : 100; } // neutral pilot ink; original biome unchanged
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
    { r: 675, base: 22, amp: 42, f0: 4.4, f1: 8.4, aer: 0.14 },
    { r: 865, base: 48, amp: 142, f0: 3.4, f1: 6.8, aer: 0.28 },
    { r: 1100, base: 28, amp: 72, f0: 3.8, f1: 7.6, aer: 0.42 },
    { r: 1470, base: 78, amp: 182, f0: 2.6, f1: 5.4, aer: 0.66 },
  ],
  rolling: [
    { r: 428, base: -22, amp: 0, f0: 6.0, f1: 11.0, aer: 0.10, skirt: true },
    { r: 470, base: 22, amp: 12, f0: 6.0, f1: 11.0, aer: 0.10, skirt: true },
    { r: 660, base: 20, amp: 44, f0: 4.8, f1: 9.6, aer: 0.14 },
    { r: 850, base: 48, amp: 112, f0: 3.8, f1: 7.8, aer: 0.32 },
    { r: 1080, base: 28, amp: 70, f0: 4.1, f1: 8.4, aer: 0.48 },
    // Retain the outer sea-apron radius; only the inland summit profile
    // changes. The continuous annulus still covers every square-map edge.
    { r: 1330, base: 78, amp: 160, f0: 2.8, f1: 5.8, aer: 0.72 },
  ],
  escarpment: [
    { r: 428, base: -22, amp: 0, f0: 6.0, f1: 11.0, aer: 0.10, skirt: true },
    { r: 470, base: 24, amp: 12, f0: 6.0, f1: 11.0, aer: 0.10, skirt: true },
    { r: 660, base: 18, amp: 38, f0: 4.3, f1: 8.6, aer: 0.14 },
    { r: 870, base: 38, amp: 90, f0: 3.5, f1: 7.2, aer: 0.34 },
    { r: 1110, base: 24, amp: 58, f0: 3.9, f1: 8.0, aer: 0.48 },
    { r: 1420, base: 66, amp: 136, f0: 2.6, f1: 5.4, aer: 0.70 },
  ],
  // Same six anchors/ten uploaded rows as the former default, but mesas are
  // set back beyond low talus foothills. Their attached buttes can retain a
  // stepped silhouette without towering directly over the playable rim.
  mesa: [
    { r: 428, base: -22, amp: 0, f0: 6.0, f1: 11.0, aer: 0.10, skirt: true },
    { r: 612, base: 3, amp: 8, f0: 6.0, f1: 11.0, aer: 0.10, skirt: true },
    { r: 780, base: 14, amp: 32, f0: 3.9, f1: 7.7, aer: 0.14 },
    { r: 1140, base: 45, amp: 130, f0: 2.9, f1: 5.7, aer: 0.28 },
    { r: 1430, base: 22, amp: 60, f0: 3.5, f1: 7.1, aer: 0.42 },
    { r: 1810, base: 65, amp: 180, f0: 2.4, f1: 4.9, aer: 0.66 },
  ],
  // The same seven non-skirt rows form foothills, a near crest, a saddle,
  // middle crest, another saddle, distant summits and their outer shoulder.
  // Raising every successive row beside the map rim formed one enormous
  // ramp; actual intervening valleys let separate ranges overlap in depth.
  alpine: [
    { r: 428, base: -22, amp: 0, f0: 6.0, f1: 11.0, aer: 0.10, skirt: true },
    { r: 612, base: 2, amp: 10, f0: 6.0, f1: 11.0, aer: 0.10, skirt: true },
    { r: 740, base: 12, amp: 32, f0: 4.4, f1: 8.6, aer: 0.12 },
    { r: 980, base: 30, amp: 190, f0: 3.6, f1: 7.2, aer: 0.20 },
    { r: 1160, base: 14, amp: 42, f0: 3.8, f1: 7.6, aer: 0.28 },
    { r: 1400, base: 55, amp: 260, f0: 3.0, f1: 6.2, aer: 0.40 },
    { r: 1590, base: 22, amp: 58, f0: 3.3, f1: 6.8, aer: 0.46 },
    { r: 2000, base: 55, amp: 250, f0: 2.5, f1: 5.4, aer: 0.60 },
    { r: 2290, base: 48, amp: 110, f0: 2.8, f1: 6.0, aer: 0.70 },
  ],
};

// Spend the existing mesh budget on radial relief rather than hundreds of
// columns spanning six broad planar strips. One final seam column is emitted
// at upload: 288 x 10 vertices / 5,166 triangles for rolling/mesa uplands,
// below the previous 3,120 vertices / 5,200 triangles.
const HORIZON_SEGMENTS = 287;
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
  seaOpening?: HorizonSeaOpening;
  redrockCanyon?: boolean;
}

function seaOpeningWeight(angle: number, opening: HorizonSeaOpening | undefined): number {
  if (!opening) return 0;
  const direction = Math.PI / 2 - opening.azimuthDeg * Math.PI / 180;
  const distance = Math.abs(Math.atan2(Math.sin(angle - direction), Math.cos(angle - direction)));
  const halfWidth = clamp(opening.widthDeg, 10, 175) * Math.PI / 360;
  return 1 - smoothstep(halfWidth * 0.58, halfWidth, distance);
}

function openHorizonToSea(ring: HorizonRingGeometry, opening: HorizonSeaOpening | undefined): void {
  if (!opening) return;
  // The existing annulus becomes the distant sea floor inside this aperture,
  // keeping the square terrain edge covered without another water mesh/pass.
  // Smooth shoulders retain headlands at either side instead of an enclosing
  // green wall across the bay. The floor sits just below the authored sea.
  for (let index = 0; index < ring.heights.length; index++) {
    const angle = ((index % HORIZON_SEGMENTS) / HORIZON_SEGMENTS) * Math.PI * 2;
    const weight = seaOpeningWeight(angle, opening);
    const height = ring.heights[index] + (opening.level - 0.04 - ring.heights[index]) * weight;
    ring.heights[index] = height;
    ring.positions[index * 3 + 1] = height;
    const radialFraction = Math.floor(index / HORIZON_SEGMENTS) / (ring.rows.length - 1);
    const seaReach = 1 + weight * radialFraction * radialFraction * 1.6;
    ring.positions[index * 3] *= seaReach;
    ring.positions[index * 3 + 2] *= seaReach;
  }
}

function horizonRowMargins(rowCount: number, style: HorizonStyle): readonly number[] {
  if (rowCount === 9) return [-34, 100, 190, 280, 440, 560, 720, 940, 1200];
  if (style === 'mesa') return [-34, 100, 190, 340, 600, 900];
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
  const margins = horizonRowMargins(rows.length, style);
  let maxHeight = 1;
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    for (let segment = 0; segment < HORIZON_SEGMENTS; segment++) {
      const angle = (segment / HORIZON_SEGMENTS) * Math.PI * 2;
      const rim = HORIZON_RIM_HALF_WIDTH
        / Math.max(Math.abs(Math.cos(angle)), Math.abs(Math.sin(angle)));
      const radius = Math.max(row.r, rim + (margins[rowIndex] ?? 300));
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const previous = (rowIndex - 1) * HORIZON_SEGMENTS + segment;
      const previousRadius = rowIndex > 0
        ? positions[previous * 3] * cos + positions[previous * 3 + 2] * sin : 0;
      // Authored ranges may approach at square-map corners. Preserve a
      // positive annular span before subdividing, even for a new map seed.
      // Keep the buried seam exact. Farther alpine ridges meander deeply in
      // plan, using the existing jitter sample at a broader wavelength; a
      // crest must not remain a nearly circular contour behind its neighbor.
      const setback = (style === 'alpine' || style === 'mesa') && rowIndex > 0;
      const radialNoise = noise.noise(
        cos * (setback ? 1.7 : 4) + rowIndex * (setback ? 2.31 : 13),
        sin * (setback ? 1.7 : 4) - rowIndex * (setback ? 1.47 : 7),
      );
      const radialVariation = setback ? (row.skirt ? 18 : rowIndex === 2 ? 60 : 100) : radius * 0.03;
      const height = sampleRingRowHeight(row, angle, noise, profile) * amp;
      // Independent range meanders must not squeeze a tall outer massif
      // into a near-vertical ramp. Bound this approach by its actual rise,
      // not only by a positive minimum radius gap (Fjord's EN curtain).
      const minimumSpan = style === 'alpine' && rowIndex === rows.length - 2
        ? Math.max(200, (height - heights[previous]) / 0.60)
        : style === 'mesa' && !row.skirt
          ? Math.max(96, (height - heights[previous]) / 0.80)
        : setback ? 64 : 12;
      const jitteredRadius = Math.max(previousRadius + minimumSpan,
        setback ? radius + radialVariation * radialNoise : radius * (1 + 0.03 * radialNoise));
      const index = rowIndex * HORIZON_SEGMENTS + segment;
      heights[index] = height;
      if (!row.skirt && height > maxHeight) maxHeight = height;
      positions[index * 3] = Math.cos(angle) * jitteredRadius;
      positions[index * 3 + 1] = height;
      positions[index * 3 + 2] = Math.sin(angle) * jitteredRadius;
    }
    if ((style === 'alpine' || style === 'mesa') && !row.skirt) {
      const offset = rowIndex * HORIZON_SEGMENTS;
      softenHorizonRing(heights, offset, HORIZON_SEGMENTS, row, amp, style);
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

function horizonAnchorSlope(
  source: HorizonRingGeometry, row: number, segment: number, cos: number, sin: number,
): number {
  if (row === 0 || row === source.rows.length - 1) return 0;
  const index = row * HORIZON_SEGMENTS + segment;
  const before = index - HORIZON_SEGMENTS, after = index + HORIZON_SEGMENTS;
  const radius = source.positions[index * 3] * cos + source.positions[index * 3 + 2] * sin;
  const beforeRadius = source.positions[before * 3] * cos + source.positions[before * 3 + 2] * sin;
  const afterRadius = source.positions[after * 3] * cos + source.positions[after * 3 + 2] * sin;
  const left = (source.heights[index] - source.heights[before]) / (radius - beforeRadius);
  const right = (source.heights[after] - source.heights[index]) / (afterRadius - radius);
  // A monotone cubic rounds crests/saddles without overshooting them. Unlike
  // a smoothstep on every span, matching harmonic slopes also joins ordinary
  // uphill anchors continuously instead of leaving a shelf at every row.
  return left * right > 0 ? 2 * left * right / (left + right) : 0;
}

function appendInterpolatedRingRow(
  positions: number[],
  heights: number[],
  source: HorizonRingGeometry,
  noise: SimplexNoise,
  rowIndex: number,
  subdivision: number,
  divisions: number,
  style: HorizonStyle,
): void {
  const fraction = subdivision / divisions;
  const shoulder = Math.sin(fraction * Math.PI);
  for (let segment = 0; segment < HORIZON_SEGMENTS; segment++) {
    const angle = (segment / HORIZON_SEGMENTS) * Math.PI * 2;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const inner = rowIndex * HORIZON_SEGMENTS + segment;
    const outer = (rowIndex + 1) * HORIZON_SEGMENTS + segment;
    const innerHeight = source.heights[inner];
    const outerHeight = source.heights[outer];
    const innerRadius = source.positions[inner * 3] * cos + source.positions[inner * 3 + 2] * sin;
    const outerRadius = source.positions[outer * 3] * cos + source.positions[outer * 3 + 2] * sin;
    const radialSpan = outerRadius - innerRadius;
    // One coherent bend per authored span, not independent absolute-radius
    // jitter per inserted row. Its derivative remains at least 1 - 0.08*pi
    // of the span: denser rows cannot fold back or become near-vertical ribs.
    const bend = noise.noise(cos * 9 + rowIndex * 5, sin * 9);
    const radius = innerRadius + radialSpan * fraction
      + bend * Math.min(8, radialSpan * 0.08) * shoulder;
    const x = cos * radius, z = sin * radius;
    // Fixed world-space frequencies stay continuous across subdivisions.
    // Span-bounded displacement adds shoulders without inventing tall ledges
    // in narrow gaps. The same three noise samples and mesh budget are used.
    const crag = noise.noise(x * 0.0045 + 17.1, z * 0.0045 - 11.3) * 0.72
      + noise.noise(x * 0.012 - 41, z * 0.012 + 23) * 0.28;
    const displacement = crag * Math.min(radialSpan * 0.06,
      Math.abs(outerHeight - innerHeight) * 0.14
        + (style === 'alpine' ? 7 : style === 'mesa' ? 3 : 4)) * shoulder;
    const t = (radius - innerRadius) / radialSpan;
    let height = innerHeight + (outerHeight - innerHeight) * t;
    if (style === 'alpine') {
      const t2 = t * t, t3 = t2 * t;
      const left = horizonAnchorSlope(source, rowIndex, segment, cos, sin);
      const right = horizonAnchorSlope(source, rowIndex + 1, segment, cos, sin);
      height = innerHeight + (outerHeight - innerHeight) * (3 * t2 - 2 * t3)
        + radialSpan * (left * (t3 - 2 * t2 + t) + right * (t3 - t2));
    }
    height += displacement;
    positions.push(x, height, z);
    heights.push(height);
  }
}

function subdivideHorizonGeometry(
  source: HorizonRingGeometry,
  style: HorizonStyle,
  noise: SimplexNoise,
): HorizonRingGeometry {
  const rows: HorizonRingRow[] = [];
  const positions: number[] = [];
  const heights: number[] = [];
  for (let rowIndex = 0; rowIndex < source.rows.length; rowIndex++) {
    appendSourceRingRow(rows, positions, heights, source, rowIndex);
    const next = source.rows[rowIndex + 1];
    if (!next || next.skirt || (source.rows[rowIndex].skirt && style !== 'alpine')) continue;
    // Move two subdivisions from the distant outer shoulder into the near
    // foothill transition. The alpine mesh still uploads exactly 33 rows.
    const divisions = style === 'alpine'
      ? (rowIndex === 1 || rowIndex === source.rows.length - 2 ? 3 : 5)
      : rowIndex === 2 ? 3 : 2;
    for (let subdivision = 1; subdivision < divisions; subdivision++) {
      rows.push(interpolatedHorizonRow(source.rows[rowIndex], next, subdivision / divisions));
      appendInterpolatedRingRow(positions, heights, source, noise, rowIndex, subdivision,
        divisions, style);
    }
  }
  return {
    rows,
    positions: new Float32Array(positions),
    heights: new Float32Array(heights),
    maxHeight: source.maxHeight,
  };
}

function reshapeFiniteTableCaps(
  ring: HorizonRingGeometry, amp: number, summitFraction = 0.64, capSlopeLimit = Infinity,
): void {
  // Authored tablelands need a surface at the summit, not just one crest
  // row. Reuse the final approach row as the front cap edge in each range.
  // Only separated high sectors reach a shared rock stratum; low passes and
  // the existing meandering edges keep these attached landforms irregular.
  const { positions: p, heights: h } = ring;
  const n = HORIZON_SEGMENTS;
  for (let range = 0; range < 2; range++) {
    const lowRow = range === 0 ? 2 : 7;
    const crestRow = range === 0 ? 5 : 9;
    const frontRow = crestRow - 1;
    const crest = ring.rows[crestRow];
    const capLevel = (crest.base + crest.amp * summitFraction) * amp;
    const transition = crest.amp * amp * 0.14;
    const minimumDepth = range === 0 ? 80 : 90;
    for (let column = 0; column < n; column++) {
      const low = lowRow * n + column, front = frontRow * n + column;
      const top = crestRow * n + column;
      const lowRadius = Math.hypot(p[low * 3], p[low * 3 + 2]);
      const oldFrontRadius = Math.hypot(p[front * 3], p[front * 3 + 2]);
      const topRadius = Math.hypot(p[top * 3], p[top * 3 + 2]);
      const oldTopHeight = h[top];
      const weight = smoothstep(capLevel - transition, capLevel, oldTopHeight);
      // Leave room for a real cap and a supported approach. At a tight
      // meander the cap tapers into its shoulder instead of forcing a sharp
      // notch into the otherwise coherent angular crest or adding radius.
      const lastFrontRadius = topRadius - minimumDepth;
      const topHeight = Math.min(oldTopHeight, capLevel,
        h[low] + (topRadius - lowRadius) * capSlopeLimit);
      const frontRadius = Math.min(lastFrontRadius,
        Math.max(oldFrontRadius, lowRadius + (topHeight - h[low]) / 1.20));
      const fraction = (frontRadius - lowRadius) / (topRadius - lowRadius);
      const linearFront = h[low] + (topHeight - h[low]) * fraction;
      // Titan's tightest meander needs a shared rise through the approach
      // and final cap edge, not a compressed steeper ramp at that last edge.
      const frontHeight = Math.max(Math.min(linearFront + (topHeight - linearFront) * weight,
        h[low] + (frontRadius - lowRadius) * 1.20),
        topHeight - (topRadius - frontRadius) * capSlopeLimit);

      if (range === 0) {
        // Preserve small existing weathering on the approach/back slope,
        // while distributing the rise across the whole foothill shoulder.
        const approach = 3 * n + column, back = 6 * n + column, valley = 7 * n + column;
        const approachRadius = Math.hypot(p[approach * 3], p[approach * 3 + 2]);
        const backRadius = Math.hypot(p[back * 3], p[back * 3 + 2]);
        const valleyRadius = Math.hypot(p[valley * 3], p[valley * 3 + 2]);
        const oldApproach = h[low] + (oldTopHeight - h[low])
          * (approachRadius - lowRadius) / (topRadius - lowRadius);
        const approachHeight = h[low] + (frontHeight - h[low])
          * (approachRadius - lowRadius) / (frontRadius - lowRadius)
          + clamp(h[approach] - oldApproach, -3, 3);
        h[approach] = clamp(approachHeight,
          frontHeight - (frontRadius - approachRadius) * 1.25,
          h[low] + (approachRadius - lowRadius) * 1.25);
        p[approach * 3 + 1] = h[approach];
        const backFraction = (backRadius - topRadius) / (valleyRadius - topRadius);
        const oldBack = oldTopHeight + (h[valley] - oldTopHeight) * backFraction;
        h[back] = topHeight + (h[valley] - topHeight) * backFraction
          + clamp(h[back] - oldBack, -3, 3);
        p[back * 3 + 1] = h[back];
      }
      const radiusScale = frontRadius / oldFrontRadius;
      p[front * 3] *= radiusScale;
      p[front * 3 + 2] *= radiusScale;
      h[front] = frontHeight;
      p[front * 3 + 1] = h[front];
      h[top] = topHeight;
      p[top * 3 + 1] = h[top];
    }
  }
}

function usesFiniteTableCaps(horizon: HorizonConfig, mapId: string, style: HorizonStyle): boolean {
  return style === 'mesa' && horizon.finiteTableCaps !== false
    && (mapId === 'skybridge' || mapId === 'copper_mesa' || mapId === 'titan_gorge');
}

/** Actual geometry without texture baking, for full-angle headless audits. */
export function sampleHorizonGeometry(
  cfg: HorizonMapConfig | null | undefined, seed: number, ground?: CanyonGround,
): HorizonRingGeometry {
  const horizon = cfg?.horizon ?? {};
  const mapId = cfg?.id ?? 'verdant';
  const style = resolveHorizonStyle(horizon, mapId);
  const noise = new SimplexNoise({ random: mulberry32(((seed ^ 0x7A11) ^ idHash(mapId)) >>> 0) });
  const source = buildInitialHorizonGeometry(
    HORIZON_ROWS_BY_STYLE[style] || HORIZON_ROWS_BY_STYLE.default,
    style, PROFILES[style], noise, horizon.amp ?? 1,
  );
  const ring = subdivideHorizonGeometry(source, style, noise);
  if (mapId === 'verdant') shapeVerdantOutland(ring, seed, horizon.amp ?? 1);
  if (mapId === 'badlands' && horizon.redrockCanyon !== false) shapeRedrockOutland(ring, ground);
  if (mapId === 'autumn' && ground) seatHorizonTerrainSeam(ring, ground);
  if (usesFiniteTableCaps(horizon, mapId, style)) {
    // Titan's tall ranges need a slightly lower erosion stratum to expose
    // broad summit surfaces without steepening their supported approaches.
    reshapeFiniteTableCaps(ring, horizon.amp ?? 1, mapId === 'titan_gorge' ? 0.60 : 0.64,
      mapId === 'titan_gorge' ? 1.25 : Infinity);
  }
  openHorizonToSea(ring, horizon.seaOpening);
  return ring;
}

function buildHorizonUvs(
  heights: Float32Array,
  maxHeight: number,
  seaOpening: HorizonSeaOpening | undefined,
): Float32Array {
  const uv = new Float32Array(heights.length * 2);
  for (let index = 0; index < heights.length; index++) {
    uv[index * 2] = ((index % HORIZON_SEGMENTS) / HORIZON_SEGMENTS) * 10;
    const angle = ((index % HORIZON_SEGMENTS) / HORIZON_SEGMENTS) * Math.PI * 2;
    const marine = seaOpening ? seaOpeningWeight(angle, seaOpening)
      * (1 - smoothstep(seaOpening.level + 0.04, seaOpening.level + 1.0, heights[index])) : 0;
    // The original UV attribute also carries the marine mask. Land altitude
    // stays nonnegative; negative V denotes only the near-flat sea apron.
    // No extra vertex attribute, geometry bytes, or draw call is needed.
    uv[index * 2 + 1] = marine > 0 ? -marine : clamp(heights[index] / maxHeight, 0, 1);
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
  positions: Float32Array,
): HorizonGradients {
  const count = heights.length;
  const slope = new Float32Array(count);
  const tangent = new Float32Array(count);
  const radial = new Float32Array(count);
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    for (let segment = 0; segment < HORIZON_SEGMENTS; segment++) {
      const index = rowIndex * HORIZON_SEGMENTS + segment;
      const before = rowIndex * HORIZON_SEGMENTS
        + (segment - 1 + HORIZON_SEGMENTS) % HORIZON_SEGMENTS;
      const after = rowIndex * HORIZON_SEGMENTS + (segment + 1) % HORIZON_SEGMENTS;
      const tangentDelta = (heights[after] - heights[before])
        / Math.max(1, Math.hypot(positions[after * 3] - positions[before * 3],
          positions[after * 3 + 2] - positions[before * 3 + 2]));
      const inner = rowIndex > 0 ? index - HORIZON_SEGMENTS : index;
      const outer = rowIndex < rows.length - 1 ? index + HORIZON_SEGMENTS : index;
      const innerRadius = Math.hypot(positions[inner * 3], positions[inner * 3 + 2]);
      const outerRadius = Math.hypot(positions[outer * 3], positions[outer * 3 + 2]);
      const radialDelta = (heights[outer] - heights[inner]) / (outerRadius - innerRadius || 1);
      slope[index] = clamp(Math.hypot(tangentDelta, radialDelta) * 1.6, 0, 1);
      tangent[index] = tangentDelta;
      radial[index] = radialDelta;
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
  positions: Float32Array,
): HorizonGradients {
  const gradients = rawHorizonGradients(rows, smoothHorizonHeights(heights, rows.length, 3), positions);
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
      if (context.redrockCanyon) tintRedrockOutlandFloor(color, context.heights[index], slope);
      applyHorizonDirectionalLight(color, scratch, context, row, angle, index);
      applyHorizonToneAndHaze(color, context, row, angle, altitude, rowIndex);
      if (context.seaOpening) {
        const seaWeight = seaOpeningWeight(angle, context.seaOpening);
        if (seaWeight > 0) {
          // Distant water reflects a mostly neutral low sky, warm toward the
          // sun and cool away. Do not compensate it for the forest texture:
          // the shader now bypasses that texture for the sea. The previous
          // channel compensation produced a saturated cyan annular stripe.
          const [sunX, , sunZ] = context.sun;
          const sunFacing = Math.max(0, (Math.cos(angle) * sunX + Math.sin(angle) * sunZ)
            / Math.max(0.001, Math.hypot(sunX, sunZ)));
          const warm = Math.pow(sunFacing, 5);
          const skyLuminance = context.fog.r * 0.2126 + context.fog.g * 0.7152
            + context.fog.b * 0.0722;
          const reflection = 0.55 + row.aer * 0.20;
          scratch.setHex(context.seaOpening.colorHex ?? 0x8b9795);
          scratch.r += (skyLuminance * (0.92 + warm * 0.16) - scratch.r) * reflection;
          scratch.g += (skyLuminance * (0.98 + warm * 0.04) - scratch.g) * reflection;
          scratch.b += (skyLuminance * (1.04 - warm * 0.14) - scratch.b) * reflection;
          scratch.multiplyScalar(1 / (context.style === 'alpine' ? 1.26 : 1.61));
          color.lerp(scratch, seaWeight);
        }
      }
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
  const stride = HORIZON_SEGMENTS + 1;
  for (let rowIndex = 0; rowIndex < rowCount - 1; rowIndex++) {
    for (let segment = 0; segment < HORIZON_SEGMENTS; segment++) {
      const inner = rowIndex * stride + segment;
      const innerNext = inner + 1;
      const outer = inner + stride;
      const outerNext = outer + 1;
      indices.push(inner, outer, innerNext, innerNext, outer, outerNext);
    }
  }
  return indices;
}

function applyAnalyticHorizonNormals(
  geometry: THREE.BufferGeometry,
  rowCount: number,
  gradients: HorizonGradients,
): void {
  const normals = new THREE.BufferAttribute(
    new Float32Array((HORIZON_SEGMENTS + 1) * rowCount * 3), 3);
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
    for (let segment = 0; segment <= HORIZON_SEGMENTS; segment++) {
      const wrapped = segment % HORIZON_SEGMENTS;
      const index = rowIndex * HORIZON_SEGMENTS + wrapped;
      const angle = (wrapped / HORIZON_SEGMENTS) * Math.PI * 2;
      const [nx, nz, inverseLength] = horizonNormal(gradients, index, angle);
      normals.setXYZ(rowIndex * (HORIZON_SEGMENTS + 1) + segment,
        nx * inverseLength, inverseLength, nz * inverseLength);
    }
  }
  geometry.setAttribute('normal', normals);
}

function closeHorizonAttribute(data: Float32Array, itemSize: number, rows: number): Float32Array {
  const stride = HORIZON_SEGMENTS + 1;
  const closed = new Float32Array(stride * rows * itemSize);
  for (let row = 0; row < rows; row++) {
    const source = row * HORIZON_SEGMENTS * itemSize;
    const target = row * stride * itemSize;
    closed.set(data.subarray(source, source + HORIZON_SEGMENTS * itemSize), target);
    closed.set(data.subarray(source, source + itemSize), target + HORIZON_SEGMENTS * itemSize);
  }
  return closed;
}

function buildHorizonGeometry(
  ring: HorizonRingGeometry,
  colors: Float32Array,
  uv: Float32Array,
  gradients: HorizonGradients,
): THREE.BufferGeometry {
  const rowCount = ring.rows.length;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(closeHorizonAttribute(ring.positions, 3, rowCount), 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(closeHorizonAttribute(colors, 3, rowCount), 3));
  const closedUv = closeHorizonAttribute(uv, 2, rowCount);
  for (let row = 0; row < rowCount; row++) {
    closedUv[(row * (HORIZON_SEGMENTS + 1) + HORIZON_SEGMENTS) * 2] = 10;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(closedUv, 2));
  geometry.setIndex(buildHorizonIndices(rowCount));
  applyAnalyticHorizonNormals(geometry, rowCount, gradients);
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
  retainedTextures: THREE.Texture[];
}

// One biome-tint lookup plus the same nine triplanar samples already used by
// alpine slope shading. The former oblique overlay (two fetches) and partial
// wall repair (seven more on steep faces) are unnecessary: surface detail
// never samples the rank-deficient angle/altitude coordinates in this path.
const ALPINE_HORIZON_MAP_FRAGMENT = /* glsl */`#include <map_fragment>
float horizonMarine = clamp(-vMapUv.y, 0.0, 1.0);
float horizonWaterVariation = 0.0;
{
  vec3 hn = normalize(vHNrm);
  vec3 awT = abs(hn);
  awT /= (awT.x + awT.y + awT.z);
  #define HTRIP(s, o) (texture2D(uDetail2, vHPos.xz * (s) + (o)).r * awT.y \
    + texture2D(uDetail2, vHPos.zy * (s) + (o) + vec2(0.41, 0.07)).r * awT.x \
    + texture2D(uDetail2, vHPos.xy * (s) + (o) + vec2(0.13, 0.61)).r * awT.z)
  float nB = HTRIP(0.0016, vec2(0.0)) - 0.5;
  float nC = HTRIP(0.0071, vec2(0.29, 0.53)) - 0.5;
  float nD = HTRIP(0.0230, vec2(0.71, 0.19)) - 0.5;
  #undef HTRIP
  float farAtt = 1.0 - smoothstep(700.0, 1400.0, length(vHPos.xz)) * 0.62;
  // Broad stands, crown-sized patches and fine rock share the existing
  // isotropic world fields. Even a horizontal saddle retains radial detail.
  diffuseColor.rgb *= 1.0 + (nB * 0.22 + nC * 0.40 + nD * 0.32)
    * (0.44 + farAtt * 0.56);
  horizonWaterVariation = nC * 0.008 + nB * 0.015;
  float slopeF = 1.0 - clamp(hn.y, 0.0, 1.0);
  float hT = clamp(vHPos.y / max(uMaxH, 1.0), 0.0, 1.0);
  float rockW = smoothstep(0.30, 0.58, slopeF + nB * 0.34 + nC * 0.20 + nD * 0.14)
    * (1.0 - smoothstep(0.55, 0.85, hT) * 0.70) * uSlopeSplat * farAtt;
  vec3 rockCol = diffuseColor.rgb * vec3(0.47, 0.50, 0.58);
  // Broken patches, not constant-altitude bars across successive ranges.
  rockCol *= 1.0 + nC * 0.16 + nD * 0.20;
  diffuseColor.rgb = mix(diffuseColor.rgb, rockCol, rockW * 0.85);
  float ndl = dot(hn, uSunDirW);
  float rel = uFragRel * farAtt;
  diffuseColor.rgb *= 1.0 - rel * 0.85 + rel * 1.6 * max(ndl, 0.0);
  diffuseColor.rgb = mix(diffuseColor.rgb,
    diffuseColor.rgb * vec3(0.90, 0.94, 1.07), max(-ndl, 0.0) * 0.32 * farAtt);
}`;

function* buildHorizonMaterialSteps({
  noise: gnoi, banding, snowline, treeline, grainAmp, style, seed, mapId,
  sun, maxHeight: maxH, retainedTextures,
}: HorizonMaterialContext): Generator<void, THREE.MeshBasicMaterial, void> {
  const [lx, ly, lz] = sun;
  const gullyAmp = style === 'alpine' ? 0.06 : style === 'mesa' ? 0.14 : 0.0;
  const detailTex = yield* makeHorizonTextureSteps(gnoi, {
    verdantSeed: mapId === 'verdant' ? seed : undefined,
    banding, snowline, treeline, grainAmp, gullyAmp, coolRock: style === 'alpine',
    mesaSurface: style === 'mesa',
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
    const detail2 = yield* makeDetailNoiseTextureSteps(
      mulberry32(((seed ^ 0x0D37) ^ idHash(mapId)) >>> 0));
    // onBeforeCompile closure textures are not material.uniforms. Explicit
    // ownership makes them renewable on GPU suspension and disposable on map
    // eviction, just like the material's discoverable base map.
    retainedTextures.push(detail2);
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
          '#include <map_fragment>', mapId === 'verdant' ? VERDANT_HORIZON_FRAGMENT
            : style === 'alpine' ? ALPINE_HORIZON_MAP_FRAGMENT : /* glsl */`#include <map_fragment>
        float horizonMarine = clamp(-vMapUv.y, 0.0, 1.0);
        float horizonWaterVariation = 0.0;
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
            diffuseColor.rgb = diffuseColor.rgb / max(sampledDiffuseColor.rgb, vec3(1e-3))
              * mix(sampledDiffuseColor.rgb, fixCol, fixW * 0.85);
          }
          // World-space oblique projection has vertical and both horizontal
          // components. It never collapses into the altitude-only streaks of
          // the old annular UV overlay along a grazing ridge flank.
          vec2 terrainUv = vec2(vHPos.x + vHPos.z * 0.37,
            vHPos.y + vHPos.z * 0.81 - vHPos.x * 0.23);
          terrainUv = mix(terrainUv, vHPos.zx * vec2(0.35, 3.0), horizonMarine);
          float dA = texture2D(uDetail2, terrainUv * 0.012).r - 0.5;
          float dB = texture2D(uDetail2, terrainUv * 0.0032 + vec2(0.37, 0.11)).r - 0.5;
          horizonWaterVariation = dA * 0.008 + dB * 0.015;
          // amplitudes sized to SURVIVE the baked haze lerp + scene fog: the
          // wall multiplies this onto an already fog-flattened vertex color,
          // so ±0.1 authored contrast reads as ~±0.04 on screen (still-flat
          // first cut). ±0.29 lands at the crown-mottle read real hills give.
          // r7: the vMapUv-based overlay is itself u-degenerate on grazed
          // walls — fade it where the triplanar fix takes over.
          ${style === 'mesa' ? HORIZON_MESA_SURFACE_FRAGMENT + '\n          diffuseColor.rgb *= horizonSurfaceGain;'
            : 'diffuseColor.rgb *= 1.0 + (dA * 0.28 + dB * 0.30) * (1.0 - fixW * 0.8);'}
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
        }`)
        .replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
        // Sea is a sky-reflecting continuation of the bay, not a zero-height
        // forest. Reuse the existing two detail samples as very quiet wave
        // breakup, replacing the degenerate altitude-clamped base texture.
        diffuseColor.rgb = mix(diffuseColor.rgb,
          diffuse * vColor.rgb * (1.0 + horizonWaterVariation), horizonMarine);`);
    };
    mat.customProgramCacheKey = () => mapId === 'verdant' ? 'horizon-verdant-watershed-r1' : style === 'mesa' ? 'horizon-ring-mesa-surface-r2'
      : (style === 'alpine' ? 'horizon-ring-world-surface-r3-' : 'horizon-ring-relief-r2-') + style;
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
  seaOpening?: HorizonSeaOpening;
}

function addHorizonTreeline({
  mesh, treeline, seed, mapId, noise: gnoi, rows, positions: pos,
  maxHeight: maxH, snowline, fog: fogC, colors: col, layers: treelineLayers, seaOpening,
}: HorizonTreelineContext): void {
  const N = HORIZON_SEGMENTS;
  if (treeline < 0.14) return;
    const profileSeed = ((seed ^ 0xA771) ^ idHash(mapId)) >>> 0;
    const combTex = makeTreeLineTexture(profileSeed, mapId === 'verdant');
    if (mapId === 'verdant') {
      mesh.add(createVerdantWoodland({ positions: pos, colors: col, rows, seed, layers: treelineLayers, atlas: combTex }));
      return;
    }
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
          (0.88 + hn2 * 0.24) * (1 - layer * 0.045) * (1 - seaOpeningWeight(a, seaOpening));
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
        // Adjacent sightlines can resolve to entirely different mountain
        // ranges. Connecting them suspends a forest ribbon across the valley
        // and frames a false "hole" in the skyline. End the two clusters at
        // their own crests, retaining the exact existing index allocation.
        if (skylineRows[k] !== skylineRows[(k + 1) % N]) {
          cIdx.push(b0, b0, b0, b1, b1, b1);
        } else {
          cIdx.push(b0, b1, t0, t0, b1, t1);
        }
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
export function* buildHorizonRingSteps(
  _engineCtx: object | null,
  cfg: HorizonMapConfig | null | undefined,
  seed: number,
  ground?: CanyonGround,
): Generator<void, THREE.Mesh, void> {
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

  // The buried inner anchor and continuously connected annulus close every
  // map edge. Coverage does not require a tall positive-height skirt: that
  // former safety wall was plainly visible across Fjord's water. Alpine
  // foothills now begin low and set back, with separate ranges behind them.
  // ANCHOR row: pinned 22 m underground inside the map rim, so the ring's
  // inner lip is welded to the terrain — without it, any skirt vertex that
  // rises above a rim dip opens a slot where the cream horizon sky pours
  // through as flat white 'ponds' behind the rim forest.
  // r6: rows are PER STYLE. The shared table put the first ridge at base 50 /
  // amp 52 only ~100 m past the rim — on the vegetated maps that projected as
  // a near-vertical green wall filling a third of the frame (the "curtain"
  // critique). Vegetated styles now open with a LOW first ridge and recede
  // through progressively taller, much hazier shells, so the ring reads as
  // distinct forested ridgelines instead of one continuous slope. Authored
  // mesa cliffs keep their terrace language; alpine massifs need foothills.
  const rows0 = HORIZON_ROWS_BY_STYLE[style] || HORIZON_ROWS_BY_STYLE.default;
  const initialRing = buildInitialHorizonGeometry(rows0, style, profile, noi, amp);
  yield;

  // Authored crests keep their silhouette; inserted shoulders and gullies
  // break the huge planar faces. Rebalancing angular/radial resolution makes
  // room for this relief within the previous vertex AND triangle ceilings.
  // Coastal apertures then lower the same annulus into a sea-level apron.
  const ring = subdivideHorizonGeometry(initialRing, style, noi);
  if (mapId === 'verdant') shapeVerdantOutland(ring, seed, amp);
  if (mapId === 'badlands' && H.redrockCanyon !== false) shapeRedrockOutland(ring, ground);
  if (mapId === 'autumn' && ground) seatHorizonTerrainSeam(ring, ground);
  if (usesFiniteTableCaps(H, mapId, style)) {
    reshapeFiniteTableCaps(ring, amp, mapId === 'titan_gorge' ? 0.60 : 0.64,
      mapId === 'titan_gorge' ? 1.25 : Infinity);
  }
  openHorizonToSea(ring, H.seaOpening);
  const { rows, positions: pos, heights: hs, maxHeight: maxH } = ring;
  const uvA = buildHorizonUvs(hs, maxH, H.seaOpening);
  yield;
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
  const gradients = buildHorizonGradients(rows, hs, pos);
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
    snowline, treeline: mapId === 'verdant' ? 0 : treeline, banding, rockAmp, haze, grainAmp, noise: gnoi,
    gradients, sun: [lx, ly, lz], seaOpening: H.seaOpening,
    redrockCanyon: mapId === 'badlands' && H.redrockCanyon !== false,
  });
  yield;

  // DEBUG: paint each row a flat color to identify geometry in screenshots
  const horizonDebug = (globalThis as typeof globalThis & { __HORIZON_DEBUG?: boolean })
    .__HORIZON_DEBUG;
  if (horizonDebug) applyHorizonDebugColors(col, rows.length);
  const geo = buildHorizonGeometry(ring, col, uvA, gradients);
  if (mapId === 'verdant') mapVerdantOutlandUv(geo);
  yield;
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
  const retainedTextures: THREE.Texture[] = [];
  const mat = yield* buildHorizonMaterialSteps({
    noise: gnoi, banding, snowline, treeline, grainAmp, style, seed, mapId,
    sun: [lx, ly, lz], maxHeight: maxH, retainedTextures,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'horizon-ring';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;
  // GTAO's depth-edge pass draws dark halo slashes along distant ridge
  // silhouettes — exclude the backdrop like the other flat-lit world layers
  mesh.userData.aoExclude = true;
  registerRetainedObject3DResources(mesh, { textures: retainedTextures });
  if (mapId === 'autumn') prepareAutumnHorizonGround(mesh, retainedTextures);

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
    seaOpening: H.seaOpening,
  });
  return mesh;
}

/** Synchronous authoring/capture wrapper over the frame-sliceable runtime build. */
export function buildHorizonRing(
  engineCtx: object | null,
  cfg: HorizonMapConfig | null | undefined,
  seed: number,
  ground?: CanyonGround,
): THREE.Mesh {
  const steps = buildHorizonRingSteps(engineCtx, cfg, seed, ground);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}
