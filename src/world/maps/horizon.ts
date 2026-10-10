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
//   bareRock,                        — 0..1 bare upper slopes: heath, outcrop ribs, scree above the treeline (round 49)
//   outcrops,                        — 0..1 gneiss knobs and scree through the turf on the steeper faces below the treeline (round 55)
// }

import * as THREE from 'three';
import type { SkyPreset } from '../../engine/sky.ts';
import { SimplexNoise } from '../../engine/simplexFast.ts';
// MOBILE r1: central tier texture scale (desktop returns sizes unchanged)
import { getDeviceTier, texSize } from '../../engine/quality.ts';
import { CLOUDSCAPE_REGIMES } from '../../engine/cloudscapes.ts';
import { OVERCAST_DIRECT_CUT_SHARED, resolveDeckClosure, resolveOvercast, type LightModelPreset } from '../../engine/lightModelCore.ts';
import { registerRetainedObject3DResources } from '../../engine/resourceLifetime.ts';
import { HORIZON_MESA_SURFACE_FRAGMENT } from '../horizonMesaSurface.ts';
import { shapeRedrockOutland, seatHorizonTerrainSeam, tintRedrockOutlandFloor, type CanyonGround } from '../horizonRedrock.ts';
import { buildHorizonRockfield } from '../horizonRockfield.ts';
import {
  type HorizonReliefBake, type HorizonReliefCharacter, type HorizonReliefCover, type HorizonReliefField, type HorizonReliefSettings,
  bakeHorizonRelief, bakeHorizonReliefSteps, createHorizonReliefField, resolveHorizonRelief, resolveHorizonReliefCharacter,
} from '../horizonRelief.ts';
import { buildHorizonFarRange } from '../horizonFarRange.ts';
import { type HorizonPanoramaCharacter, createHorizonPanorama, type HorizonPanoramaRegional } from '../horizonPanorama.ts';
import { type MassifSettings, carveMassifRingSteps, createMassifField, cutMassifCanyonsSteps } from '../horizonMassif.ts';
import { type EscarpmentSettings, carveEscarpmentRingSteps, createEscarpmentField } from '../horizonEscarpment.ts';
import { type HorizonCloudShadeSource, bindHorizonCloudShade, createHorizonCloudShadeUniforms } from '../horizonCloudShade.ts';
import { continuedGroundAt, continuedGroundSampler } from '../horizonSurface.ts';
import { resolveBorderLandform, type BorderLandformSettings } from '../borderLandform.ts';
import { buildBorderFarmsteads, farmsteadTreesAt, resolveBorderArchitecture, ringSurfaceSampler, selectFarmsteadSites, type BorderFarmsteadOptions } from '../borderFarmsteads.ts';
import { buildBorderHedgerows } from '../borderHedgerows.ts';
import { type HorizonDamSettings, buildHorizonDam, carveHorizonDamCanyon, floodHorizonDamReservoir } from '../horizonDam.ts';
import { type HorizonSummitCapSettings, capHorizonSummits } from '../horizonTablelands.ts';
import { installHorizonRing } from '../horizonRingHook.ts';
import { type SeaOpening, SEA_APRON_OUTER_RADIUS_M, dominantSeaOpening, resolveSeaOpenings, seaHeadlandWeight, seaOpeningWeight, seaSectorWeightAt, seaSectorBlend, seaCoastDistanceAt, mergeSeaWetness } from '../edgeWater.ts';
import {
  HORIZON_VISTA_FRAGMENT, HORIZON_VISTA_HAZE_FRAGMENT, HORIZON_VISTA_UNIFORM_DECLARATIONS, buildHorizonForest, createVistaTiles,
  horizonBroadleafPalette,
  createVistaCanopyTile,
  type VistaGround,
  type HorizonForestSpeciesPalette,
  type HorizonTreeRow,
} from '../horizonVista.ts';

type HorizonStyle = 'rolling' | 'alpine' | 'mesa' | 'escarpment';

/** Round 40: the authored aperture is one of several openings; edgeWater.ts derives the rest from the square's water. */
type HorizonSeaOpening = SeaOpening;

interface HorizonConfig {
  baseHex?: number;
  amp?: number;
  style?: HorizonStyle;
  /** the ring's own style (its rows, profile, ledges, rock and relief character) where the real place's far hills differ
   * from the border's landform, which keeps reading `style` (the mountains lane, 2026-10-03: Eifel Reservoir's border
   * stays the alpine landform its villages and woods were authored on; its ring rolls like the Eifel) */
  ringStyle?: HorizonStyle;
  snowline?: number;
  treeline?: number;
  treelineLayers?: number;
  finiteTableCaps?: boolean;
  redrockCanyon?: boolean;
  banding?: number;
  /** Round 29: the vista's ground tile — 'sand' for arid rings (default for treeless mesa styles), else 'meadow'. */
  ground?: 'meadow' | 'sand';
  /** Round 32: outland boulder density 0..1 on the near ring faces (horizonRockfield.ts). Defaults to 1 for the
   * mesa style and sand grounds, 0.55 for other bare treelines (< 0.14), 0 for wooded rings. */
  outlandRocks?: number;
  rockHex?: number;
  snowHex?: number;
  forestHex?: number;
  haze?: number;
  grain?: number;
  /** Round 49: 0..1 — above the treeline the turf greys to heath, outcrop ribs stand on the steeper local faces with
   * scree below them and the summit rock breaks into ribs (Fjord, Whiteout). Default 0: the ring is untouched. */
  bareRock?: number;
  /** Round 55: 0..1 — below the treeline, gneiss knobs and slabs stand through the turf on the steeper faces (the
   * 25–45° ridge fronts of the softened domes) inside a halo of scree (Fjord). Default 0: the ring is untouched. */
  outcrops?: number;
  /** Round 72: the mountain character of the ring's relief and its far range (horizonRelief.ts); resolved from the
   * map identity and the style when unset. */
  relief?: HorizonReliefCharacter;
  /** Round 72: false keeps the far range (the peaks behind the ring, 1.9–3.3 km out) off this map. */
  farRange?: boolean;
  /** The mountains lane (2026-10-02): the tableland bed stair (horizonEscarpment.ts) — overrides of the mesa style's
   * default (a block on another style opts that ring in), or false for none. */
  escarpment?: Partial<EscarpmentSettings> | false;
  /** The mountains lane (2026-10-03): the far country baked into a panorama (horizonPanorama.ts) beyond the ring on the
   * desktop tier — false keeps the round-72 far range; an object overrides the character's far knobs. */
  panorama?: false | (Partial<HorizonPanoramaCharacter> & { regional?: HorizonPanoramaRegional });
  /** The mountains lane (2026-10-03): false opens no pass along this map's road exits (openRoadPasses) — where an exit
   * runs into a massif right behind the edge, the pass is a trench as deep as the massif is high, and its end a wall
   * (gauntlet wave 6, Frosthollow's edge-n: "a smooth near-vertical curtain"). */
  roadPasses?: boolean;
  /** The map-revival lane (2026-10-06): a dam across a canyon cut through the ring (horizonDam.ts) — Skybridge's Glen
   * Canyon Dam, the gorge's axis run on through the north ring to an arch under the plateau's rim. */
  dam?: HorizonDamSettings;
  /** The map-revival lane (2026-10-06): the tableland ring's outer ranges capped into flat-topped mesas past a radius
   * (horizonTablelands.ts) — the mesa stack's saddle, summits and shoulder otherwise stand as domes and spires. */
  summitCap?: HorizonSummitCapSettings;
  /** The mountains lane (2026-10-03): false marks an authored escarpment as a massif's shoulders rather than a
   * tableland (Frosthollow): its summits keep standing (no table opening on the ring) and the far range keeps its
   * peaks (no far plateaus). */
  tableland?: false;
  /** The mountains lane (2026-10-02): false keeps a ranged ring's round-72b relief (no eroded landform, no range
   * twist) — the receipts' negative control and an authoring opt-out; an object overrides the character's landform
   * knobs (horizonMassif.ts MassifSettings) for this ring and its far range. */
  massif?: false | Partial<MassifSettings>;
  /** The mountains lane (2026-10-03): the ring atlas's landcover (horizonRelief.ts HorizonReliefCover) — overrides of the
   * character's (a steppe's few stands, a forested upland's many), or false for none. */
  reliefCover?: false | Partial<HorizonReliefCover>;
  seaOpening?: HorizonSeaOpening;
  /**
   * Terrain-following canopy belts across the visible mountain faces. Off by
   * default since 2026-09-12: read from the battlefield they drew as dark
   * contour strokes across every range, which the owner rejected against the
   * 1049e4e presentation. The skyline ranks (treelineLayers) stay.
   */
  faceBelts?: boolean;
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

interface HorizonTextureOptions {
  banding: number;
  snowline: number;
  treeline: number;
  grainAmp: number;
  gullyAmp?: number;
  coolRock?: boolean;
  mesaSurface?: boolean;
  /** Vista pass: the base texture carries biome tone only; the fragment program owns every surface detail. */
  toneOnly?: boolean;
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

/**
 * The map-borders lane (wave 3, 2026-10-03, gauntlet wave 9: "no forest belts, field patchwork, villages"; "several views
 * still stop at a treeline, an earth bank, a grass crest or a road that ends at the skyline"): rows of trees that read at
 * tank eye height. A third of the hedged stretches of the field boundaries carry a shelter belt from ~150 m past the
 * edge (a tree every ~9 m, a double row on a third of them, standing over the bush line), and the roads that leave the
 * square run between avenue trees 8.5 m either side in runs from ~40 m out, so a road's line carries on over a crest.
 */
function borderTreeRows(
  seed: number, hedgeLines: readonly { xs: number[]; zs: number[]; w: number[] }[],
  exits: readonly { xs: ArrayLike<number>; zs: ArrayLike<number>; length: number }[],
  exitAt: ((x: number, z: number, out: [number, number]) => [number, number]) | null,
): HorizonTreeRow[] {
  const rows: HorizonTreeRow[] = [];
  const rng = mulberry32((seed ^ 0xB37A) >>> 0);
  const edgeOut = (x: number, z: number): number => Math.max(Math.abs(x), Math.abs(z)) - 512;
  for (const line of hedgeLines) {
    const belt = rng() < 0.34, double = rng() < 0.33;
    if (!belt) continue;
    const w = line.w.map((v, i) => v * smoothstep(120, 220, edgeOut(line.xs[i], line.zs[i])));
    if (!w.some((v) => v > 0.3)) continue;
    rows.push({ xs: line.xs, zs: line.zs, w, spacing: 9, offsets: double ? [-2.6, 2.6] : [0], scale: [1.0, 1.5], conifer: 0.2 });
  }
  if (exitAt) {
    const hit: [number, number] = [0, 0];
    for (const exit of exits) {
      const n = exit.xs.length, w: number[] = [];
      let run = rng() < 0.7;
      for (let i = 0; i < n; i++) {
        if (i % 4 === 0) run = rng() < 0.7; // runs of ~160 m, most of them planted
        const x = exit.xs[i], z = exit.zs[i];
        w.push(run ? exitAt(x, z, hit)[1] * smoothstep(30, 60, edgeOut(x, z)) : 0);
      }
      if (!w.some((v) => v > 0.3)) continue;
      rows.push({ xs: exit.xs, zs: exit.zs, w, spacing: 12, offsets: [-8.5, 8.5], scale: [0.9, 1.3], conifer: 0.1 });
    }
  }
  return rows;
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

function softenHorizonRing(
  heights: Float32Array,
  offset: number,
  count: number,
  row: HorizonProfileRow,
  amp: number,
  passes = 8,
  stepScale = 1,
  maxStepM = 0,
): void {
  const scratch = new Float32Array(count);
  for (let pass = 0; pass < passes; pass++) {
    for (let k = 0; k < count; k++) {
      const km = (k - 1 + count) % count, kp = (k + 1) % count;
      scratch[k] = heights[offset + km] * 0.24
        + heights[offset + k] * 0.52 + heights[offset + kp] * 0.24;
    }
    for (let k = 0; k < count; k++) heights[offset + k] = scratch[k];
  }
  // Round 72: the step clamp (about 18° along the row at the alpine rows' 15 m of arc) was the dome-maker — with
  // the relief field on, a character's crest sharpness opens it (polar 2.2 x, alpine 2.7 x: faces to 37–45°) and the
  // blur drops to three passes so the 75–150 m spurs survive; the silhouette sampler keeps the classic values.
  // Round 72b: a relieved row passes an explicit world-unit step (0.8 of the row's arc — the cone rule: a peak's base
  // is at least 2.5 x its height over the saddle), on every style
  const maxStep = maxStepM > 0 ? maxStepM : (1.35 + row.amp * amp * 0.035) * stepScale;
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
  if (style === 'alpine') softenHorizonRing(heights, 0, count, row, amp);
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
  const toneOptions = options.coolRock || options.toneOnly ? { ...options, coolRock: false, banding: 0, toneOnly: false } : null;
  for (let y = 0; y < sv; y++) {
    const v = 1 - y / (sv - 1);
    const tone = toneOptions ? sampleHorizonBiomeTone(sampleNoise, toneOptions, v) : null;
    for (let x = 0; x < su; x++) {
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
/** The tileable detail noise as a function of texture coordinates (wrapping), 0..1 like its texel. */
type DetailNoiseSampler = (u: number, v: number) => number;

/** One wrapped-lattice value noise (three octaves) shared by the detail texture and the JS twin the ring forest
 * uses to stand its trees exactly where the fragment program paints the forest. */
function createDetailNoise(rng: () => number): DetailNoiseSampler {
  const octaves: Array<readonly [number, number]> = [[8, 0.5], [24, 0.32], [64, 0.18]];
  const lattices = octaves.map(([cells]) => {
    const g = new Float32Array(cells * cells);
    for (let i = 0; i < g.length; i++) g[i] = rng();
    return g;
  });
  const smooth = (t: number): number => t * t * (3 - 2 * t);
  return (u, v) => {
    let value = 0;
    const uu = u - Math.floor(u), vv = v - Math.floor(v);
    for (let o = 0; o < octaves.length; o++) {
      const cells = octaves[o][0], amp = octaves[o][1], g = lattices[o];
      const fx = uu * cells, fy = vv * cells;
      const x0 = Math.floor(fx) % cells, y0 = Math.floor(fy) % cells;
      const x1 = (x0 + 1) % cells, y1 = (y0 + 1) % cells;
      const tx = smooth(fx - Math.floor(fx)), ty = smooth(fy - Math.floor(fy));
      const a = g[y0 * cells + x0], b = g[y0 * cells + x1];
      const e = g[y1 * cells + x0], f = g[y1 * cells + x1];
      value += ((a + (b - a) * tx) + ((e + (f - e) * tx) - (a + (b - a) * tx)) * ty - 0.5) * amp;
    }
    return clamp(0.5 + value, 0, 1);
  };
}

function* makeDetailNoiseTextureSteps(
  sample: DetailNoiseSampler,
): Generator<void, THREE.CanvasTexture, void> {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = require2DContext(c);
  const img = ctx.createImageData(S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // texel centres, so the JS twin and the GPU sample agree at the lattice
      const L = clamp(sample((x + 0.5) / S, (y + 0.5) / S) * 255, 0, 255);
      const j = (y * S + x) * 4;
      d[j] = L; d[j + 1] = L; d[j + 2] = L; d[j + 3] = 255;
    }
    if ((y & 31) === 31) yield;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  // ground lane (2026-10-05, the terrain noise's z-mirror, the same here): a canvas uploads flipped (its top row at
  // v = 1), so the fragment read the field at (u, 1 − v) while the JS twin — the ring forest's stands (horizonVista.ts)
  // and its rock field (horizonRockfield.ts) — read it at (u, v): the stands stood off the painted woods. Row y at
  // v = (y + 0.5) / S, as written and as the twin reads it.
  t.flipY = false;
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
    // r9 (2026-09-12): a flatter crown gradient. The old pale top band
    // (166,181,122) lit every distant grove from above and read as pale
    // cut-outs standing on the ridges; the mean tone is unchanged so belt
    // light and the flood colour below still match the face.
    const canopy = ctx.createLinearGradient(0, bandTop + 2, 0, base);
    canopy.addColorStop(0, 'rgb(148,164,110)');
    canopy.addColorStop(0.52, 'rgb(139,156,100)');
    canopy.addColorStop(1, 'rgb(112,130,84)');
    ctx.fillStyle = canopy;
    ctx.fill();
    ctx.clip();

    ctx.restore();
  }
  // flood transparent texels with the mean tone so mips never halo dark
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 40) { d[i] = 138; d[i + 1] = 152; d[i + 2] = 100; }
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

// The classic 1049e4e tableland ladder: two skirt rows, then four ranges (foothill, near table, basin, outer table).
// Round 47 (owner 2026-09-23, "the skybox and mountains are too bland"): only Redrock keeps it — its outland is the
// shared analytic canyon (horizonRedrock.ts samples every row from redrockCanyon.ts and its receipt pins the ladder).
const CLASSIC_MESA_ROWS: HorizonRingRow[] = [
  { r: 428, base: -22, amp: 0, f0: 6.0, f1: 11.0, aer: 0.10, skirt: true },
  { r: 470, base: 26, amp: 14, f0: 6.0, f1: 11.0, aer: 0.10, skirt: true },
  { r: 700, base: 50, amp: 52, f0: 3.1, f1: 6.2, aer: 0.12 },
  { r: 860, base: 62, amp: 96, f0: 2.1, f1: 4.6, aer: 0.24 },
  { r: 1000, base: 84, amp: 128, f0: 1.5, f1: 3.3, aer: 0.42 },
  { r: 1240, base: 88, amp: 96, f0: 1.1, f1: 2.4, aer: 0.60 },
];

const HORIZON_ROWS_BY_STYLE: Partial<Record<HorizonStyle, HorizonRingRow[]>> & {
  default: HorizonRingRow[];
  mesaCanyon: HorizonRingRow[];
} = {
  // Vista pass (2026-09-19): every first ridge stands about 110 m farther from the rim (585/600 -> 700/720, with
  // the corner margins moved to match) so the seated foothill climbs at a hillside grade instead of a wall.
  default: CLASSIC_MESA_ROWS,
  mesaCanyon: CLASSIC_MESA_ROWS,
  rolling: [
    { r: 428, base: -22, amp: 0, f0: 6.0, f1: 11.0, aer: 0.10, skirt: true },
    { r: 470, base: 22, amp: 12, f0: 6.0, f1: 11.0, aer: 0.10, skirt: true },
    { r: 720, base: 32, amp: 38, f0: 3.0, f1: 6.4, aer: 0.12 },
    { r: 880, base: 45, amp: 72, f0: 2.0, f1: 4.4, aer: 0.32 },
    { r: 1080, base: 60, amp: 112, f0: 1.4, f1: 3.1, aer: 0.54 },
    { r: 1330, base: 72, amp: 120, f0: 1.0, f1: 2.2, aer: 0.72 },
  ],
  escarpment: [
    { r: 428, base: -22, amp: 0, f0: 6.0, f1: 11.0, aer: 0.10, skirt: true },
    { r: 470, base: 24, amp: 12, f0: 6.0, f1: 11.0, aer: 0.10, skirt: true },
    { r: 720, base: 36, amp: 44, f0: 2.8, f1: 6.0, aer: 0.14 },
    { r: 880, base: 50, amp: 82, f0: 2.0, f1: 4.4, aer: 0.34 },
    { r: 1080, base: 66, amp: 116, f0: 1.4, f1: 3.1, aer: 0.54 },
    { r: 1330, base: 76, amp: 106, f0: 1.0, f1: 2.2, aer: 0.70 },
  ],
  // Round 47 (owner 2026-09-23, "the skybox and mountains are too bland, not good like the good maps"): the mesa
  // table used to be byte-identical to `default` — four rows climbing monotonically (50 / 62 / 84 / 88 m bases), so
  // Titan, Skybridge, Copper Mesa, Caldera, the desert and Mars read as ONE stepped wall while the alpine maps'
  // nine-row foothill / saddle / summit stack read as layered ranges. Mesa country is buttes and tables standing on
  // a valley floor in front of a far escarpment: a low foothill bench with buttes, the near tablelands (finite cap
  // range 0 on Skybridge / Copper Mesa / Titan), a REAL valley floor lower than both (36 m base, 28 m amplitude —
  // the old basin row sat at 84 + 128 m, higher than the tables in front of it), the far escarpment (cap range 1),
  // a saddle behind it, the distant summit plateau and the outer shoulder. Rows that share a table field (the same
  // f0) are one landform at two depths: the bench is the tables' own pediment (so the cap pass always finds a
  // supported approach) with its own butte field (f1), and the saddle / outer shoulder are the plateau tops behind
  // the escarpment and the summits; the valley, the escarpment and the summits are independent fields, so three
  // separate ranges share the skyline. The tables drop 100 m to the valley floor (a 3:1 back cliff carries the
  // tallest raw table at Titan's 2.15 amplitude) and the outer row moves 1240 -> 1380 m to give the stack room.
  mesa: [
    { r: 428, base: -22, amp: 0, f0: 6.0, f1: 11.0, aer: 0.10, skirt: true },
    { r: 470, base: 26, amp: 14, f0: 6.0, f1: 11.0, aer: 0.10, skirt: true },
    { r: 700, base: 50, amp: 44, f0: 2.4, f1: 6.2, aer: 0.12 },
    { r: 860, base: 58, amp: 92, f0: 2.4, f1: 5.0, aer: 0.20 },
    { r: 960, base: 36, amp: 28, f0: 2.8, f1: 5.6, aer: 0.26 },
    { r: 1200, base: 94, amp: 138, f0: 1.6, f1: 3.4, aer: 0.40 },
    { r: 1260, base: 84, amp: 100, f0: 1.6, f1: 3.4, aer: 0.48 },
    { r: 1320, base: 100, amp: 150, f0: 1.2, f1: 2.6, aer: 0.56 },
    { r: 1380, base: 88, amp: 100, f0: 1.2, f1: 2.6, aer: 0.64 },
  ],
  // The same seven non-skirt rows form foothills, a near crest, a saddle,
  // middle crest, another saddle, distant summits and their outer shoulder.
  // Raising every successive row beside the map rim formed one enormous
  // ramp; actual intervening valleys let separate ranges overlap in depth.
  alpine: [
    { r: 428, base: -22, amp: 0, f0: 6.0, f1: 11.0, aer: 0.10, skirt: true },
    { r: 470, base: 26, amp: 14, f0: 6.0, f1: 11.0, aer: 0.10, skirt: true },
    { r: 700, base: 50, amp: 52, f0: 3.1, f1: 6.2, aer: 0.10 },
    { r: 760, base: 52, amp: 64, f0: 2.8, f1: 5.7, aer: 0.14 },
    { r: 820, base: 56, amp: 76, f0: 2.6, f1: 5.2, aer: 0.18 },
    { r: 900, base: 66, amp: 102, f0: 1.9, f1: 4.0, aer: 0.30 },
    { r: 960, base: 74, amp: 114, f0: 1.7, f1: 3.6, aer: 0.36 },
    { r: 1040, base: 82, amp: 128, f0: 1.5, f1: 3.3, aer: 0.44 },
    { r: 1240, base: 88, amp: 100, f0: 1.1, f1: 2.4, aer: 0.60 },
  ],
};

function horizonRows(style: HorizonStyle, mapId: string): HorizonRingRow[] {
  // Round 47: Redrock's outland is the shared analytic canyon, sampled row by row (horizonRedrock.ts) and pinned by
  // redrockCanyonHorizon.selftest; it keeps the classic six-row ladder while the other mesa rings take the stack.
  if (style === 'mesa' && mapId === 'badlands') return HORIZON_ROWS_BY_STYLE.mesaCanyon;
  return HORIZON_ROWS_BY_STYLE[style] || HORIZON_ROWS_BY_STYLE.default;
}

// Spend the existing mesh budget on radial relief rather than hundreds of
// columns spanning six broad planar strips. One final seam column is emitted
// at upload: 288 x 10 vertices / 5,166 triangles for rolling/mesa uplands,
// below the previous 3,120 vertices / 5,200 triangles.
// Vista pass (owner 2026-09-19, "consider this a triple AAA pass"): 287 -> 431 columns (about 8.7 m of arc on the
// first ridge instead of 13 m) so the fBm relief below has vertices to live on; every style also subdivides the
// foothill span behind the rim, which used to be one 100 m quad strip.
export const HORIZON_SEGMENTS = 431;
/** vegetation.ts species that the ring forest renders as conifers (the rest are broadleaf crowns). */
const HORIZON_CONIFER_SPECIES: ReadonlySet<string> = new Set(['pine', 'spruce', 'fir', 'cedar']);
const HORIZON_RIM_HALF_WIDTH = 512;

interface HorizonRingGeometry {
  rows: HorizonRingRow[];
  positions: Float32Array;
  heights: Float32Array;
  maxHeight: number;
  /** Round 72b: the authored rows' heights before the relief field, for the interpolated rows to build on. */
  profileHeights?: Float32Array;
  /** Round 72b: the relief weight per authored row (0 skirt, 0.6 first ridge, 1 beyond) times the map's relief scale. */
  reliefWeights?: Float32Array;
  /** Round 72b: each authored row's base height (row.base x amp x boost) — the floor the relief carves above. */
  rowBases?: Float32Array;
  /** The mountains lane (2026-10-03): 1 on the vertices a road exit's pass lowered (openRoadPasses), for the receipts. */
  roadPass?: Uint8Array;
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
  seaOpenings: readonly HorizonSeaOpening[];
  /** Round 47: per-vertex marine weight/level (bay contours near the square, sector beyond). */
  sea?: HorizonSea;
  redrockCanyon?: boolean;
  /** Per-vertex forest stand cover (0..1) shared with the canopy belts. */
  forestCover?: Float32Array;
  /** Vista pass: bake tone and sea only; slope/altitude materials, sun and haze move to the fragment program. */
  vista?: boolean;
}

/** Round 47: per-vertex marine weight and water level of the ring (the bay contours near the square, the derived
 * sector under the haze), shared by the lowering, the UV mask, the colours and the canopy. */
interface HorizonSea {
  weight: Float32Array;
  level: Float32Array;
}

/** The sea past the square: the map's own bay contour nearest the edge, the derived azimuth sector farther out. */
function ringSeaWeight(
  x: number, z: number, angle: number, openings: readonly HorizonSeaOpening[], ground: CanyonGround | undefined,
): { weight: number; level: number } {
  const opening = dominantSeaOpening(angle, openings);
  if (!ground?.getOutlandWaterAt) return { weight: opening ? seaOpeningWeight(angle, opening) : 0, level: opening?.level ?? 0 };
  const sector = opening ? seaSectorWeightAt(x, z, opening) : 0;
  // Round 47 (2026-09-23, owner: "evident right angle with shore and water at the border"): a radial sector cut
  // every bay off on two straight lines at the red line. The map's own shoreline contour now rules as far as it
  // reaches past the square, the sector carries the open sea beyond that reach, and the two blend by distance.
  const edgeOut = Math.max(Math.abs(x), Math.abs(z)) - 512;
  const [from, to] = seaSectorBlend(opening?.coastReachM, opening?.bankProfile);
  const far = smoothstep(from, to, edgeOut);
  const coast = edgeOut > -64 ? ground.getOutlandWaterAt(x, z) : null;
  const coastWeight = coast?.wetness ?? 0;
  const sectorWeight = sector * far;
  return { weight: mergeSeaWetness(coastWeight, sectorWeight),
    level: coastWeight >= sectorWeight ? coast?.level ?? opening?.level ?? 0 : opening?.level ?? coast?.level ?? 0 };
}

/** Resolve near geology at 8–10 metre spacing, gradually coarsening the
 * distant rows. This keeps shore bands and canyon relief from becoming long
 * flat triangles beyond the playable terrain. No additional mesh/pass. */
function refineCoastRows(ring: HorizonRingGeometry, openings: readonly HorizonSeaOpening[], ground?: CanyonGround): void {
  if (!ground?.getOutlandHeightAt) return;
  const n = HORIZON_SEGMENTS, rows: HorizonRingRow[] = [], positions: number[] = [], heights: number[] = [];
  for (let row = 0; row < ring.rows.length; row++) {
    let divisions = 1;
    if (row > 0 && row < ring.rows.length - 1) for (let k = 0; k < n; k++) {
      const i = row * n + k, j = i + n;
      const x = ring.positions[i * 3], z = ring.positions[i * 3 + 2];
      const coast = seaHeadlandWeight(Math.atan2(z, x), openings, HEADLAND_BAND_RAD) > 0;
      const edgeOut = Math.max(Math.abs(x), Math.abs(z)) - 512;
      const spacing = coast ? 8 : edgeOut < 240 ? 10 : edgeOut < 600 ? 20 : 40;
      const gap = Math.hypot(ring.positions[j * 3] - x, ring.positions[j * 3 + 2] - z);
      divisions = Math.max(divisions, Math.ceil(gap / spacing));
    }
    for (let part = 0; part < divisions; part++) {
      const t = part / divisions;
      rows.push(part === 0 ? ring.rows[row] : interpolatedHorizonRow(ring.rows[row], ring.rows[row + 1], t));
      for (let k = 0; k < n; k++) {
        const i = row * n + k, j = Math.min(i + n, ring.heights.length - 1);
        for (let axis = 0; axis < 3; axis++) positions.push(ring.positions[i * 3 + axis] + (ring.positions[j * 3 + axis] - ring.positions[i * 3 + axis]) * t);
        heights.push(ring.heights[i] + (ring.heights[j] - ring.heights[i]) * t);
      }
    }
  }
  ring.rows = rows; ring.positions = new Float32Array(positions); ring.heights = new Float32Array(heights);
}

/** Continue the actual geology through the boundary before the distant
 * ridges take over. The edge residual carries roads and conditioned ground
 * into the exterior without a step. Redrock uses one regional canyon field. */
function continueHorizonGround(ring: HorizonRingGeometry, ground: CanyonGround | undefined, canyon: boolean): void {
  if (!ground?.getOutlandHeightAt) return;
  // (the time-to-battle lane, 2026-10-08) the continued ground with its residuals kept by point: every vertex past a
  // corner clamps to the corner (horizonSurface.ts continuedGroundSampler; the same heights)
  const continued = continuedGroundSampler(ground);
  // A closing anchor only ten metres below its own point can still bridge
  // above a deep valley between it and the square corner. Keep the entire
  // hidden row below the landscape, so its long triangles cannot protrude
  // through the playable chunks as a straight ledge.
  let buriedHeight = -64;
  for (const height of ring.heights) buriedHeight = Math.min(buriedHeight, height - 64);
  for (let i = 0; i < HORIZON_SEGMENTS; i++) {
    ring.heights[i] = buriedHeight;
    ring.positions[i * 3 + 1] = buriedHeight;
  }
  for (let i = HORIZON_SEGMENTS; i < ring.heights.length; i++) {
    const x = ring.positions[i * 3], z = ring.positions[i * 3 + 2];
    const edgeOut = Math.max(Math.abs(x), Math.abs(z)) - 512;
    // the map-borders lane (2026-10-03): the field says where its landform hands over to the authored ranges (a band
    // that wanders 150–750 m past the edge, so the hand-over draws no ring parallel to the square)
    let weight = canyon ? 1 : ground.getBorderHandOverAt ? ground.getBorderHandOverAt(x, z) : 1 - smoothstep(140, 460, edgeOut);
    // A railway's open line past the edge (railSpurs.ts RAIL_OPEN_*): the rows lie on its real bed (the round-67 tunnel
    // gallery the authored ridge closed over is retired)
    const seat = ground.getOutlandSeatWeightAt?.(x, z) ?? 0;
    if (weight <= 0) continue;
    let height = continued(x, z);
    // The square-clamped residual can sample the cutting's side bank. Its
    // supported approach follows the radial bed, including between rows.
    if (seat > 0 && edgeOut > 0) height += (ground.getOutlandHeightAt(x, z) - height) * seat;
    ring.heights[i] += (height - ring.heights[i]) * weight;
    ring.positions[i * 3 + 1] = ring.heights[i];
  }
  ring.maxHeight = 1;
  for (const height of ring.heights) ring.maxHeight = Math.max(ring.maxHeight, height);
}

/**
 * The mountains lane (2026-10-03, gauntlet wave 1: "a straight bright seam running up a mountainside", Cinder Junction's
 * edge-n): a road that leaves the square runs on ~720 m (terrain.ts roadExitAt, the map-borders lane), but the border's
 * landform hands over to the authored ranges 150-750 m out, and past the hand-over the carriageway was painted straight
 * up the ranges' faces. The ranges open a pass along each exit instead: per row, the exit's crossing (the column nearest
 * its line, found by the ring's own road attribute), a valley round it — its floor the continued ground at the
 * crossing (the road's grade where the line runs), its sides rising at about 24 degrees, 30 m of floor either side —
 * carved only where the ring stands above it, by the exit's own presence (so it closes where the road fades). Heights
 * only; a map without exits is untouched.
 */
const ROAD_PASS_HALF_M = 220;
const ROAD_PASS_FLOOR_M = 30;
const ROAD_PASS_SIDE = 0.45;
function openRoadPasses(ring: HorizonRingGeometry, ground: CanyonGround | undefined): void {
  const exitAt = ground?._roadExitAt;
  if (!ground || !exitAt || !ground.getOutlandHeightAt) return;
  const n = HORIZON_SEGMENTS, rows = ring.rows.length;
  const out: [number, number] = [0, 0];
  const presence = new Float32Array(n), offset = new Float32Array(n);
  const carved = new Uint8Array(ring.heights.length);
  for (let row = 1; row < rows; row++) {
    const off = row * n;
    const r0 = Math.hypot(ring.positions[off * 3], ring.positions[off * 3 + 2]);
    if (r0 < 560) continue;
    let any = false;
    for (let k = 0; k < n; k++) {
      const i = off + k;
      exitAt(ring.positions[i * 3], ring.positions[i * 3 + 2], out);
      presence[k] = out[1]; offset[k] = out[0];
      if (out[1] > 0.02) any = true;
    }
    if (!any) continue;
    const arc = (2 * Math.PI * r0) / n;
    const reach = Math.ceil(ROAD_PASS_HALF_M / arc);
    for (let k = 0; k < n; k++) {
      // a crossing: the column nearest the line (its offset's smallest magnitude among its present neighbours)
      if (presence[k] <= 0.02) continue;
      const a = (k + n - 1) % n, b = (k + 1) % n;
      if ((presence[a] > 0.02 && Math.abs(offset[a]) < Math.abs(offset[k])) || (presence[b] > 0.02 && Math.abs(offset[b]) <= Math.abs(offset[k]))) continue;
      const ic = off + k;
      const xc = ring.positions[ic * 3], zc = ring.positions[ic * 3 + 2];
      // a crossing inside a railway cutting's corridor is the cutting's own (its fan is the pass; railCutting.selftest)
      if ((ground.getOutlandSeatWeightAt?.(xc, zc) ?? 0) > 0) continue;
      const floor = continuedGroundAt(ground, xc, zc);
      // full while the carriageway shows (the paint is the presence itself), closing over its last faint stretch
      const p = smoothstep(0, 0.35, presence[k]);
      for (let d = -reach; d <= reach; d++) {
        const kk = (k + d + n) % n, i = off + kk;
        // (inside the hand-over band too: there the ring already leans on the continued ground, which carries the
        // road's grade along its line, so the valley only finishes what the band began)
        const across = Math.abs(d) * arc;
        const valley = floor + Math.max(0, across - ROAD_PASS_FLOOR_M) * ROAD_PASS_SIDE;
        if (ring.heights[i] <= valley) continue;
        if ((ground.getOutlandSeatWeightAt?.(ring.positions[i * 3], ring.positions[i * 3 + 2]) ?? 0) > 0) continue;
        const w = p * (1 - smoothstep(ROAD_PASS_HALF_M * 0.7, ROAD_PASS_HALF_M, across));
        if (w <= 0) continue;
        ring.heights[i] += (valley - ring.heights[i]) * w;
        ring.positions[i * 3 + 1] = ring.heights[i];
        carved[i] = 1;
      }
    }
  }
  ring.roadPass = carved;
  ring.maxHeight = 1;
  for (const height of ring.heights) ring.maxHeight = Math.max(ring.maxHeight, height);
}

/**
 * The outland boulders' stone: the palette's rock, a cool slate tint held near grey (gauntlet wave 18, Frosthollow: "a line
 * of saturated navy-blue rock blobs runs the full width of the valley floor" — the ring's blue-grey rock, read off every
 * boulder under the overcast); warm stone (sandstone, laterite) keeps its colour.
 */
function boulderStone(rock: THREE.Color): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 };
  rock.getHSL(hsl);
  return hsl.h > 0.42 && hsl.h < 0.78 && hsl.s > 0.06 ? new THREE.Color().setHSL(0.08, 0.05, hsl.l) : rock.clone();
}

/** Grade the dry side as well as the submerged floor. Cutting a high ridge
 * using only the narrow water mask made kilometre-long sawtooth cliffs. */
function coastalBankHeight(x: number, z: number, height: number, openings: readonly HorizonSeaOpening[], supportM = 0): number {
  const edgeOut = Math.max(Math.abs(x), Math.abs(z)) - 512;
  if (edgeOut <= 0) return height;
  for (const opening of openings) {
    const distance = seaCoastDistanceAt(x, z, opening);
    if (distance > 380 + supportM) continue;
    const weight = smoothstep(0, 24, edgeOut) * (1 - smoothstep(160 + supportM, 380 + supportM, distance));
    const bank = opening.level - 0.04 + Math.max(0, distance - 22 - supportM) * 0.24;
    height += Math.min(0, bank - height) * weight;
  }
  return height;
}

function openHorizonToSea(
  ring: HorizonRingGeometry, openings: readonly HorizonSeaOpening[], ground?: CanyonGround,
): HorizonSea {
  // The existing annulus becomes the distant sea floor inside each aperture,
  // keeping the square terrain edge covered without another water mesh/pass.
  // Smooth shoulders retain headlands at either side instead of an enclosing
  // green wall across the bay. The floor sits just below the water surface.
  // Round 40 (2026-09-22): every opening the square's water derives (edgeWater.ts) is applied beside the authored one.
  // Round 47 (2026-09-23): the weight is per vertex — the bay contour near the square, the sector beyond (ringSeaWeight).
  const sea: HorizonSea = { weight: new Float32Array(ring.heights.length), level: new Float32Array(ring.heights.length) };
  if (!openings.length) return sea;
  const n = HORIZON_SEGMENTS;
  const outerRadii = new Float32Array(n);
  const outerStart = ring.heights.length - n;
  for (let k = 0; k < n; k++) outerRadii[k] = Math.hypot(
    ring.positions[(outerStart + k) * 3], ring.positions[(outerStart + k) * 3 + 2]);
  for (let index = 0; index < ring.heights.length; index++) {
    const angle = ((index % n) / n) * Math.PI * 2;
    // Extend the whole headland, then evaluate the water in its final world coordinates.
    // Moving only submerged vertices after sampling stretches beaches into wedges.
    let x = ring.positions[index * 3], z = ring.positions[index * 3 + 2];
    const radius = Math.hypot(x, z), outerRadius = outerRadii[index % n];
    const rimRadius = 512 / Math.max(Math.abs(Math.cos(angle)), Math.abs(Math.sin(angle)));
    // Every coastal column reaches beyond the water apron, including diagonals.
    // A square-distance multiplier left the diagonal banks ending at 2.5 km
    // while their water carried on to 4 km, exposing the sky beneath the sheet.
    const extension = Math.max(0, (SEA_APRON_OUTER_RADIUS_M + 256) / outerRadius - 1);
    const reach = 1 + seaHeadlandWeight(angle, openings, HEADLAND_BAND_RAD)
      * smoothstep(rimRadius + 300, outerRadius, radius) * extension;
    x *= reach; z *= reach;
    ring.positions[index * 3] = x; ring.positions[index * 3 + 2] = z;
  }
  // Seat complete triangles beneath the wet mask, not just their wet vertices.
  // At the outer coast, one angular cell can span sixty metres: interpolating
  // a dry, raised corner through the sea used to expose triangular black banks.
  // The support follows actual neighbour spacing, without adding geometry.
  for (let index = 0; index < ring.heights.length; index++) {
    const angle = ((index % n) / n) * Math.PI * 2;
    const x = ring.positions[index * 3], z = ring.positions[index * 3 + 2];
    // The closing row is deliberately buried. At square corners its radial
    // inset is less than 32 m; the coastal continuation below used to lift
    // it back through the playable cliff as an exposed triangular grass flap.
    if (index < n) continue;
    let supportM = 0;
    const edgeOut = Math.max(Math.abs(x), Math.abs(z)) - 512;
    if (ground?.getOutlandHeightAt && edgeOut > 0) {
      const row = Math.floor(index / n), col = index % n;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const rr = row + dr;
        if (rr < 1 || rr >= ring.rows.length) continue;
        const j = rr * n + (col + dc + n) % n;
        supportM = Math.max(supportM, Math.hypot(ring.positions[j * 3] - x, ring.positions[j * 3 + 2] - z));
      }
      supportM *= 1.5 * smoothstep(0, 24, edgeOut);
    }
    const { weight, level } = ringSeaWeight(x, z, angle, openings, ground);
    // Keep the coast in world space. Pulling each row onto a different waterline and
    // stretching it radially left wedges at the square and moved banks off the
    // water mask. The near apron now follows the same continuous geology as the
    // playable shore. No vertex moves after the shoreline is sampled.
    if (ground?.getOutlandHeightAt && edgeOut > -32 && edgeOut < 360) {
      const coastShare = seaHeadlandWeight(angle, openings, HEADLAND_BAND_RAD)
        * (1 - smoothstep(140, 360, edgeOut));
      const edgeScale = 512 / Math.max(Math.abs(x), Math.abs(z));
      const ex = x * edgeScale, ez = z * edgeScale;
      const edgeDelta = ground.getHeightAt(ex, ez) - ground.getOutlandHeightAt(ex, ez);
      const continued = edgeOut < 0 ? ground.getHeightAt(x, z) - 0.025
        : ground.getOutlandHeightAt(x, z) + edgeDelta * (1 - smoothstep(0, 64, edgeOut));
      ring.heights[index] += (continued - ring.heights[index]) * coastShare;
    }
    ring.heights[index] = coastalBankHeight(x, z, ring.heights[index], openings, supportM);
    sea.weight[index] = weight;
    sea.level[index] = level;
    ring.positions[index * 3 + 1] = ring.heights[index];
    if (weight <= 0) continue;
    // Finish the seabed before the first visible water-mask ramp (Saltwind
    // starts at 0.16). A 0.35 shoulder left tall ridge vertices inside visible
    // shallows, clipping the sheet into repeated steps along Fjord's banks.
    const height = ring.heights[index] + Math.min(0, level - 0.04 - ring.heights[index]) * smoothstep(0, 0.12, weight);
    ring.heights[index] = height;
    ring.positions[index * 3 + 1] = height;
  }
  // A narrow native cove can cross a triangle whose dry corner still stands
  // above the sheet. Carry its bed through that complete face. This keeps
  // the authored water contour, instead of exposing a green triangular wedge.
  if (ground?.getOutlandWaterAt) {
    const p = ring.positions;
    const seatFace = (a: number, b: number, c: number): void => {
      const x = (p[a * 3] + p[b * 3] + p[c * 3]) / 3;
      const z = (p[a * 3 + 2] + p[b * 3 + 2] + p[c * 3 + 2]) / 3;
      const edgeOut = Math.max(Math.abs(x), Math.abs(z)) - 512;
      if (edgeOut < 12 || edgeOut > 400) return;
      let floor = Infinity;
      for (const [u, v, w] of [[1 / 3, 1 / 3, 1 / 3], [0.6, 0.2, 0.2], [0.2, 0.6, 0.2], [0.2, 0.2, 0.6]]) {
        const sx = p[a * 3] * u + p[b * 3] * v + p[c * 3] * w;
        const sz = p[a * 3 + 2] * u + p[b * 3 + 2] * v + p[c * 3 + 2] * w;
        const water = ringSeaWeight(sx, sz, Math.atan2(sz, sx), openings, ground);
        if (water.weight > 0.08) floor = Math.min(floor, water.level - 0.04);
      }
      if (!Number.isFinite(floor)) return;
      for (const i of [a, b, c]) {
        ring.heights[i] = Math.min(ring.heights[i], floor);
        p[i * 3 + 1] = ring.heights[i];
      }
    };
    for (let row = 1; row < ring.rows.length - 1; row++) for (let col = 0; col < n; col++) {
      const a = row * n + col, b = row * n + (col + 1) % n;
      seatFace(a, b, a + n); seatFace(b, b + n, a + n);
    }
  }
  return sea;
}

/**
 * Round 67 (2026-09-24): the first authored ridge of every style stands this far past the rim (its row margin below;
 * the row's own radius only exceeds it on the square's sides).
 */
export const HORIZON_FIRST_RIDGE_MARGIN_M = 200;

function horizonRowMargins(rowCount: number, style: HorizonStyle): readonly number[] {
  // Round 47: at the square corners (rim 724 m) the mesa stack keeps its two cap ranges 140 / 260 m deep (each cap
  // front needs 80 / 90 m plus its supported approach) and its valley floor 80 m wide; every row still steps outward
  // (the far rows by at least half their authored span, see buildInitialHorizonGeometry).
  const ridge = HORIZON_FIRST_RIDGE_MARGIN_M;
  if (rowCount === 9 && style === 'mesa') return [-34, 22, ridge, 340, 420, 680, 730, 770, 800];
  if (rowCount === 9) return [-34, 22, ridge, 250, 300, 380, 450, 560, 800];
  if (rowCount === 7) return [-34, 22, ridge, 260, 380, 560, 800];
  return [-34, 22, ridge, 340, 560, 800];
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

/**
 * Round 72b: the relief carves the profile instead of denting it. The profile's height over the row's base is the
 * ENVELOPE (which ranges stand where — the authored composition); a ranged character's field modulates that envelope
 * by up to ±90 % (its ridges are the zero-crossing lines of the noise, so the crests are long connected lines with
 * sub-peaks and saddles, and the low passes stay low), plus a small additive share so the valleys keep some texture.
 * The first cut added the field to the envelope, which left the smooth massifs of the profile as the silhouette with
 * the field as dents on them — rows of symmetric cones. A character without ranges (mesa) keeps the additive form.
 */
function relievedHeight(relief: HorizonReliefField, x: number, z: number, profileHeight: number, rowBase: number, weight: number, crestLift = 0.3): number {
  const rel = relief.low(x, z);
  if (relief.settings.rangeCount === 0) return profileHeight + rel * weight;
  const above = Math.max(0, profileHeight - rowBase);
  const carve = clamp(rel / Math.max(1, relief.settings.lowAmpM), -0.9, 0.9) * weight;
  // round 72b (crops: the first ridge read as one straight crest line across the whole view — Whiteout's ridge row
  // varied 14 m RMS over 4.9 km): on the first ridge and the band that climbs to it the additive term lifts the crests
  // more than it lowers the saddles (crestLift 0.55 up, 0.3 down), so the first ridge carries summits and cols of its
  // own instead of a level rim in front of the ranges; the ranges behind keep the 0.3 of the previous commit
  return rowBase + above * (1 + carve * 0.9) + rel * (rel > 0 ? crestLift : 0.3) * weight;
}

/** The mountains lane: each authored range's profile offset (rad, by authored rank), so successive ranges step off
 * one another instead of lining up radially (about 7 degrees: 120 m of arc on the 1 km ranges, half a massif). */
const PROFILE_TWIST_RAD: readonly number[] = [0, 0.12, -0.09, 0.14, -0.13, 0.08, -0.11];

function buildInitialHorizonGeometry(
  rows: HorizonRingRow[],
  style: HorizonStyle,
  profile: HorizonProfile,
  noise: SimplexNoise,
  amp: number,
  relief: HorizonReliefField | null = null,
  massifOn = true,
): HorizonRingGeometry {
  const positions = new Float32Array(HORIZON_SEGMENTS * rows.length * 3);
  const heights = new Float32Array(HORIZON_SEGMENTS * rows.length);
  const profileHeights = new Float32Array(HORIZON_SEGMENTS * rows.length);
  const reliefWeights = new Float32Array(rows.length);
  const rowBases = new Float32Array(rows.length);
  const margins = horizonRowMargins(rows.length, style);
  let maxHeight = 1;
  // Round 72: the map's amplitude scales the coarse relief with the ranges it stands on (Polders' 0.18 stays a low
  // ridge), and the character's range boost ramps in over the authored ranks (half on the second range, full
  // beyond) and with the amplitude, so a tight corner gap between the first two ranges never becomes a cliff
  const reliefScale = clamp(amp, 0.15, 1.6);
  const twistRanges = massifOn && !!relief?.settings.massif && relief.settings.rangeCount > 0;
  const rangeBoostAt = (rank: number): number => {
    if (!relief || rank < 1) return 1;
    const full = 1 + (relief.settings.rangeBoost - 1) * clamp(amp, 0, 1);
    return rank === 1 ? 1 + (full - 1) * 0.5 : full;
  };
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    const authoredRank = rows.slice(0, rowIndex).filter((r) => !r.skirt).length;
    for (let segment = 0; segment < HORIZON_SEGMENTS; segment++) {
      const angle = (segment / HORIZON_SEGMENTS) * Math.PI * 2;
      const rim = HORIZON_RIM_HALF_WIDTH
        / Math.max(Math.abs(Math.cos(angle)), Math.abs(Math.sin(angle)));
      const radius = Math.max(row.r, rim + (margins[rowIndex] ?? 300));
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const previous = (rowIndex - 1) * HORIZON_SEGMENTS + segment;
      const previousRadius = rowIndex > 0
        ? positions[previous * 3] * cos + positions[previous * 3 + 2] * sin : 0;
      const radialNoise = noise.noise(
        cos * 4 + rowIndex * 13,
        sin * 4 - rowIndex * 7,
      );
      // Round 72: the ranges behind the first ridge stand taller by the character's boost — the first ridge is the
      // terrain-material foothill the seam laws seat (rows to 700 m), and at the old proportions it hid the vista's
      // ranges behind it (Whiteout's grey wall was that foothill); the skirt rows and the first ridge keep their heights
      const boost = row.skirt ? 1 : rangeBoostAt(authoredRank);
      // the mountains lane (2026-10-02): on the eroded (massif) characters each authored range samples its profile at
      // its own small angular offset, so a massif no longer stands at the same azimuth on every row — a spur that ran
      // straight at the battlefield (a cone seen end-on) becomes ranges stepping off one another in depth
      const twist = twistRanges && !row.skirt ? PROFILE_TWIST_RAD[authoredRank % PROFILE_TWIST_RAD.length] : 0;
      let height = sampleRingRowHeight(row, angle + twist, noise, profile) * amp * boost;
      const profileHeight = height;
      rowBases[rowIndex] = row.base * amp * boost;
      // Round 72 (owner 2026-09-25, "the mountains look so flat"): the coarse relief field (horizonRelief.ts, a
      // ridged multifractal over a warped world plane) displaces every authored range — peaks, spurs and saddles
      // along each row that also vary with the radius, since the field is one plane — the first ridge at 60 % so the
      // seated foothill behind the rim keeps its hillside grade, the ranges beyond in full; the skirt rows are untouched
      // round 72b: the mesa stack's capped tables (authored ranks 1 and 3) keep flat tops — a quarter of the relief there,
      // so the round-47 cap law (broad attached table tops, low passes) holds with the field on
      const tableRow = style === 'mesa' && rows.length === 9 && (authoredRank === 1 || authoredRank === 3);
      // round 72b: the first ridge (rank 0) of a ranged character carries the field at full weight (the crest line was
      // straight at 0.6); the mesa stack keeps its bench at 0.6
      const rank0Weight = relief && relief.settings.rangeCount > 0 ? 1 : 0.6;
      const reliefWeight = relief && !row.skirt ? (authoredRank === 0 ? rank0Weight : tableRow ? 0.25 : 1) * reliefScale : 0;
      reliefWeights[rowIndex] = reliefWeight;
      if (reliefWeight > 0) height = relievedHeight(relief!, cos * radius, sin * radius, height, row.base * amp * boost, reliefWeight, authoredRank === 0 ? 0.55 : 0.3);
      // Retain the old 3% range meander while bounding it against folds at
      // square corners. This preserves the 1049 composition without letting
      // a newer map seed invert an annular strip.
      // Round 47: the mesa stack's far rows stand 60 m apart at 1.2-1.4 km, where the 3 % meander is ±40 m — two rows
      // could collapse onto the 12 m floor and the independent fields behind them then met as 10-25:1 sheets. Those
      // rows keep half their authored span and no authored row climbs or drops more than 2.5:1 from the row before it
      // — the subdivision's radius bend and crag relief add up to another 1.7:1 on a short span, and the ledger
      // contract is "terraces up to about 4:1" (< 4.5); the profile's tables and buttes are otherwise untouched.
      const mesaStack = style === 'mesa' && rows.length === 9;
      const minimumGap = mesaStack && rowIndex >= 2 ? Math.max(12, (row.r - rows[rowIndex - 1].r) * 0.5) : 12;
      const jitteredRadius = Math.max(previousRadius + minimumGap, radius * (1 + 0.03 * radialNoise));
      if (mesaStack && rowIndex >= 3) {
        const previousHeight = heights[previous];
        const limit = (jitteredRadius - previousRadius) * 2.5;
        height = clamp(height, previousHeight - limit, previousHeight + limit);
      }
      const index = rowIndex * HORIZON_SEGMENTS + segment;
      heights[index] = height;
      profileHeights[index] = profileHeight + (height - profileHeight) * 0; // the clamp below may move `height`; the profile stays
      positions[index * 3] = Math.cos(angle) * jitteredRadius;
      positions[index * 3 + 1] = height;
      positions[index * 3 + 2] = Math.sin(angle) * jitteredRadius;
    }
    const offset = rowIndex * HORIZON_SEGMENTS;
    if (relief && !row.skirt && relief.settings.rangeCount > 0) {
      // round 72b: the cone rule on every row of a ranged character (alpine keeps its three blur passes first); the
      // mesa tables keep their authored cliff edges (a 56 m column step at a cap rim is the crenellation, not a cone)
      softenHorizonRing(heights, offset, HORIZON_SEGMENTS, row, amp * rangeBoostAt(authoredRank),
        style === 'alpine' ? 3 : 0, 1, 0.7 * (2 * Math.PI * row.r / HORIZON_SEGMENTS)); // round 72b: 0.7 (a clamped peak's base is 2.9 x its rise; at 0.8 every clamped spire was a 2.5 x cone)
    } else if (style === 'alpine' && !row.skirt) {
      softenHorizonRing(heights, offset, HORIZON_SEGMENTS, row, amp * rangeBoostAt(authoredRank), 8, 1);
    }
    for (let segment = 0; segment < HORIZON_SEGMENTS; segment++) {
      positions[(offset + segment) * 3 + 1] = heights[offset + segment];
      if (!row.skirt && heights[offset + segment] > maxHeight) maxHeight = heights[offset + segment];
    }
  }
  return { rows, positions, heights, maxHeight, profileHeights, reliefWeights, rowBases };
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
  relief: HorizonReliefField | null = null,
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
    // Vista pass (2026-09-19): ridged fBm instead of two smooth octaves — spurs and gullies run down the faces
    // (about 260 m and 90 m apart) with 30 m knobs between them, at amplitudes the denser row ladder can carry.
    const ridged = (n: number): number => 1 - Math.abs(n);
    // Round 72: the coarse relief field (the same plane the authored rows carry, horizonRelief.ts) takes the 260 m
    // term's place, so the spurs and gullies between two rows continue the ranges' own ridgelines instead of a
    // separate field; the 90 m and 30 m knobs stay
    // Round 72b (integrator: "rows of symmetric cones"): with a relief field the interpolated row is the PROFILE
    // interpolated between the anchors plus the full field at its own point — a ridgeline running obliquely across
    // the rows is then continuous (the first cut attenuated the field between rows to a crag envelope, so every peak
    // was a radial cone standing on one row); the 90 m and 30 m knobs stay. The ledger's own laws are enforced
    // below: the row stays inside the anchors' band plus 12 % of the span, and its climb from the row before it
    // stays under the ledger's cliff bound.
    const useField = !!relief && !!source.profileHeights && !!source.reliefWeights && !!source.rowBases;
    const e1 = useField ? 0 : ridged(noise.noise(x * 0.0038 + 17.1, z * 0.0038 - 11.3)) - 0.5;
    const e2 = ridged(noise.noise(x * 0.011 - 41, z * 0.011 + 23)) - 0.5;
    const e3 = noise.noise(x * 0.031 + 7.3, z * 0.031 - 3.9);
    const crag = useField ? e2 * 0.38 + e3 * 0.22 : e1 * 0.62 + e2 * 0.38 + e3 * 0.22;
    const styleRelief = style === 'alpine' ? 11 : style === 'mesa' ? 4 : 7;
    let envelope = Math.min(radialSpan * 0.11, Math.abs(outerHeight - innerHeight) * 0.20 + styleRelief);
    // Round 72: on a span already climbing past 1.5:1 (the mesa stack's back cliffs, which the relieved authored rows
    // reach more often) the crag may not add more than a quarter-slope between consecutive rows, so the ledger's
    // "no near-vertical cliffs between authored ridges" bound (authored + 0.3) holds with the relief on
    if (Math.abs(outerHeight - innerHeight) / Math.max(1, radialSpan) > 1.5) envelope = Math.min(envelope, 0.12 * radialSpan / divisions);
    const displacement = crag * envelope * shoulder;
    const t = (radius - innerRadius) / radialSpan;
    const baseInner = useField ? source.profileHeights![inner] : innerHeight;
    const baseOuter = useField ? source.profileHeights![outer] : outerHeight;
    let height = baseInner + (baseOuter - baseInner) * t;
    if (style === 'alpine') {
      const t2 = t * t, t3 = t2 * t;
      const left = horizonAnchorSlope(source, rowIndex, segment, cos, sin);
      const right = horizonAnchorSlope(source, rowIndex + 1, segment, cos, sin);
      height = baseInner + (baseOuter - baseInner) * (3 * t2 - 2 * t3)
        + radialSpan * (left * (t3 - 2 * t2 + t) + right * (t3 - t2));
    }
    height += displacement;
    if (useField) {
      const wIn = source.reliefWeights![rowIndex], wOut = source.reliefWeights![rowIndex + 1];
      const rowBase = source.rowBases![rowIndex] + (source.rowBases![rowIndex + 1] - source.rowBases![rowIndex]) * t;
      // the band below the first ridge: its relief weight rises as t^1.6 toward the ridge row's (the seam row behind
      // the playable edge keeps round 29's radial-gradient ceilings — a linear ramp to the ridge's full weight put
      // Verdant's seam at 0.405 against its 0.4), the crests lifted like the ridge's own
      const climbsToRidge = source.rows.findIndex((r) => !r.skirt) === rowIndex + 1;
      const tw = climbsToRidge ? Math.pow(t, 1.6) : t;
      height = relievedHeight(relief!, x, z, height, rowBase, wIn + (wOut - wIn) * tw, climbsToRidge ? 0.55 : 0.3);
      // the ledger's bounds: inside the anchors' band plus 12 % of the span (the alpine law) or within 12 % of the
      // chord (the other styles), and never climbing past the cliff bound from the row before
      const lo = Math.min(innerHeight, outerHeight), hi = Math.max(innerHeight, outerHeight), slack = radialSpan * 0.115;
      if (style === 'alpine') height = clamp(height, lo - slack, hi + slack);
      else { const chord = innerHeight + (outerHeight - innerHeight) * t; height = clamp(height, chord - slack, chord + slack); }
      const prevIndex = heights.length - HORIZON_SEGMENTS;
      const authoredSlope = Math.abs(outerHeight - innerHeight) / Math.max(1, radialSpan);
      const bound = (style === 'alpine' ? Math.max(3.0, authoredSlope * 2 + 0.3) : Math.max(1.9, authoredSlope + 0.3)) - 0.05;
      if (prevIndex >= 0) {
        const prevH = heights[prevIndex], prevR = Math.hypot(positions[prevIndex * 3], positions[prevIndex * 3 + 2]);
        const gap = Math.max(1, radius - prevR);
        height = clamp(height, prevH - bound * gap, prevH + bound * gap);
      }
      // and the last row of the span against the outer anchor that follows it (its height is fixed)
      if (subdivision === divisions - 1) {
        const gapOut = Math.max(1, outerRadius - radius);
        height = clamp(height, outerHeight - bound * gapOut, outerHeight + bound * gapOut);
      }
    }
    positions.push(x, height, z);
    heights.push(height);
  }
}

function subdivideHorizonGeometry(
  source: HorizonRingGeometry,
  style: HorizonStyle,
  noise: SimplexNoise,
  relief: HorizonReliefField | null = null,
): HorizonRingGeometry {
  const rows: HorizonRingRow[] = [];
  const positions: number[] = [];
  const heights: number[] = [];
  for (let rowIndex = 0; rowIndex < source.rows.length; rowIndex++) {
    appendSourceRingRow(rows, positions, heights, source, rowIndex);
    const next = source.rows[rowIndex + 1];
    if (!next || next.skirt) continue;
    // Vista pass (2026-09-19): every span between the seated rim row and the outer shoulder is subdivided —
    // the foothill span behind the rim included (it used to be one quad strip on the vegetated styles) — so the
    // relief below has rows to shape. Rolling / escarpment upload 18 rows, alpine 40 (was 10 / 33); round 47's nine-row
    // mesa stack uploads 30 (Redrock keeps the classic 18).
    const divisions = style === 'alpine' ? (source.rows[rowIndex].skirt ? 4 : 5) : 4;
    for (let subdivision = 1; subdivision < divisions; subdivision++) {
      rows.push(interpolatedHorizonRow(source.rows[rowIndex], next, subdivision / divisions));
      appendInterpolatedRingRow(positions, heights, source, noise, rowIndex, subdivision,
        divisions, style, relief);
    }
  }
  const subdivided = new Float32Array(heights);
  let maxHeight = source.maxHeight;
  // round 72b: the field's summits between two rows may stand over the anchors (within the ledger's slack)
  for (let i = HORIZON_SEGMENTS * 2; i < subdivided.length; i++) if (subdivided[i] > maxHeight) maxHeight = subdivided[i];
  return {
    rows,
    positions: new Float32Array(positions),
    heights: subdivided,
    maxHeight,
  };
}

function reshapeFiniteTableCaps(
  ring: HorizonRingGeometry, amp: number, summitFraction = 0.64,
  capSlopeLimits: readonly [number, number] = [Infinity, Infinity],
): void {
  // Authored tablelands need a surface at the summit, not just one crest
  // row. Reuse the final approach row as the front cap edge in each range.
  // Only separated high sectors reach a shared rock stratum; low passes and
  // the existing meandering edges keep these attached landforms irregular.
  const { positions: p, heights: h } = ring;
  const n = HORIZON_SEGMENTS;
  // Vista pass (2026-09-19): the row ladder is denser, so the two ranges are found by their authored rows
  // (the four mesa crests) instead of fixed indices.
  const authored = ring.rows.map((row, i) => (!row.skirt && !row.interpolated ? i : -1)).filter((i) => i >= 0);
  for (let range = 0; range < 2; range++) {
    const lowRow = range === 0 ? authored[0] : authored[2];
    const crestRow = range === 0 ? authored[1] : authored[3];
    const frontRow = crestRow - 1;
    const crest = ring.rows[crestRow];
    const capLevel = (crest.base + crest.amp * summitFraction) * amp;
    const transition = crest.amp * amp * 0.14;
    const minimumDepth = range === 0 ? 80 : 90;
    // Round 47: the near tables keep the vista pass's 1.25:1 supported approach; the far escarpment stands over a
    // real valley floor now, so its front is a cliff-and-talus face at up to 1.8:1 (about 61°) — at 1.25:1 a 270 m
    // rise needed a 220 m approach the 260 m span could not also fit a 90 m cap into, and no cap formed at all.
    const capSlopeLimit = capSlopeLimits[range];
    const approachSlope = capSlopeLimit * 0.96;
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
        Math.max(oldFrontRadius, lowRadius + (topHeight - h[low]) / approachSlope));
      const fraction = (frontRadius - lowRadius) / (topRadius - lowRadius);
      const linearFront = h[low] + (topHeight - h[low]) * fraction;
      // Titan's tightest meander needs a shared rise through the approach
      // and final cap edge, not a compressed steeper ramp at that last edge.
      const frontHeight = Math.max(Math.min(linearFront + (topHeight - linearFront) * weight,
        h[low] + (frontRadius - lowRadius) * approachSlope),
        topHeight - (topRadius - frontRadius) * capSlopeLimit);

      // Vista pass (2026-09-19): the denser ladder puts several interpolated rows on the approach and the back
      // slope. Re-space the approach rows along the new low -> front chord (radius and height, keeping each row's
      // own small relief) and re-base the back rows onto the new cap, so no row folds behind the moved front edge.
      const radiusScale = frontRadius / oldFrontRadius;
      for (let m = lowRow + 1; m < frontRow; m++) {
        const im = m * n + column;
        const oldR = Math.hypot(p[im * 3], p[im * 3 + 2]);
        const oldLinear = h[low] + (oldTopHeight - h[low]) * (oldR - lowRadius) / (topRadius - lowRadius);
        const f = (m - lowRow) / (frontRow - lowRow);
        const newR = lowRadius + (frontRadius - lowRadius) * f;
        const scale = newR / oldR;
        p[im * 3] *= scale;
        p[im * 3 + 2] *= scale;
        // round 72: the crag kept through the re-spacing is bounded by 3 m or a tenth of the new chord, whichever is
        // smaller — a relieved low row can shorten the chord to 25 m, where 3 m is the ledger's whole relief allowance
        const keep = Math.min(3, 0.1 * (frontRadius - lowRadius));
        const hm = h[low] + (frontHeight - h[low]) * f + clamp(h[im] - oldLinear, -keep, keep);
        h[im] = clamp(hm, frontHeight - (frontRadius - newR) * capSlopeLimit, h[low] + (newR - lowRadius) * capSlopeLimit);
        p[im * 3 + 1] = h[im];
      }
      // the approach climbs at most the range's cap slope between consecutive rows as well (forward from the low
      // row, backward from the fixed cap front), so the buttress reads as a supported terrace rather than a stepped
      // cliff. The bound equals the cap slope limit: the front may sit a full limit above the low row, and a tighter
      // per-row clamp would push the whole shortfall onto the first pair (measured 1.35:1 on Titan at 1.25).
      for (let m = lowRow + 1; m < frontRow; m++) {
        const im = m * n + column, ib = (m - 1) * n + column;
        const gap = Math.hypot(p[im * 3], p[im * 3 + 2]) - Math.hypot(p[ib * 3], p[ib * 3 + 2]);
        h[im] = Math.min(h[im], h[ib] + gap * capSlopeLimit);
        p[im * 3 + 1] = h[im];
      }
      for (let m = frontRow - 1; m > lowRow; m--) {
        const im = m * n + column, ia = (m + 1) * n + column;
        const heightAfter = m + 1 === frontRow ? frontHeight : h[ia];
        const radiusAfter = m + 1 === frontRow ? frontRadius : Math.hypot(p[ia * 3], p[ia * 3 + 2]);
        const gap = radiusAfter - Math.hypot(p[im * 3], p[im * 3 + 2]);
        h[im] = Math.max(h[im], heightAfter - gap * capSlopeLimit);
        p[im * 3 + 1] = h[im];
      }
      // Round 47: the far escarpment (range 1) now has the saddle and summit rows behind it, so its back rows are
      // re-based onto the moved cap exactly like the near table's — a lowered cap must not leave a lip behind it.
      const valleyRow = authored[range === 0 ? 2 : 4];
      if (valleyRow !== undefined) {
        const valley = valleyRow * n + column;
        const valleyRadius = Math.hypot(p[valley * 3], p[valley * 3 + 2]);
        for (let m = crestRow + 1; m < valleyRow; m++) {
          const im = m * n + column;
          const rm = Math.hypot(p[im * 3], p[im * 3 + 2]);
          const bf = (rm - topRadius) / (valleyRadius - topRadius);
          const oldBack = oldTopHeight + (h[valley] - oldTopHeight) * bf;
          const keepBack = Math.min(3, 0.1 * (valleyRadius - topRadius));
          h[im] = topHeight + (h[valley] - topHeight) * bf + clamp(h[im] - oldBack, -keepBack, keepBack);
          p[im * 3 + 1] = h[im];
        }
      }
      p[front * 3] *= radiusScale;
      p[front * 3 + 2] *= radiusScale;
      h[front] = frontHeight;
      p[front * 3 + 1] = h[front];
      h[top] = topHeight;
      p[top * 3 + 1] = h[top];
    }
  }
}

/**
 * Vista pass (2026-09-19, owner: "the transition between playable and non playable parts of the map"): the two
 * skirt rows used to sit at authored heights (-22 m and about +26 m) whatever the battlefield did at its edge, so
 * the ring met the rim as a step or a bump. Seat the buried anchor under the local ground and continue the rim's
 * own height and gradient onto the first exterior row; the interpolated foothill rows keep their relief and
 * re-base their linear part onto the seated row. Autumn and Redrock keep their own seams.
 */
/** Round 49: arc beyond a sea opening's outer edge over which a headland column still slopes into the sea (rad; full
 * strength over the first third — Nordhavn's peninsulas sit 4–8° outside both arms' openings). */
const HEADLAND_BAND_RAD = 0.25;

function seatHorizonSkirtOnGround(
  ring: HorizonRingGeometry, ground: CanyonGround, openings: readonly HorizonSeaOpening[] = [],
): void {
  const n = HORIZON_SEGMENTS, rows = ring.rows;
  const ridgeRow = rows.findIndex((row) => !row.skirt && !row.interpolated);
  if (ridgeRow < 2) return;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
    const rimScale = 511.5 / Math.max(Math.abs(c), Math.abs(sn));
    const edgeH = ground.getHeightAt(c * rimScale, sn * rimScale);
    const innerH = ground.getHeightAt(c * (rimScale - 36), sn * (rimScale - 36));
    const gradient = clamp((edgeH - innerH) / 36, -0.30, 0.30);
    const i0 = k;
    const anchor = ground.getHeightAt(ring.positions[i0 * 3], ring.positions[i0 * 3 + 2]) - 10;
    ring.heights[i0] = anchor;
    ring.positions[i0 * 3 + 1] = anchor;
    const i1 = n + k;
    const r1 = Math.hypot(ring.positions[i1 * 3], ring.positions[i1 * 3 + 2]);
    const old1 = ring.heights[i1];
    const seated = edgeH + gradient * (r1 - rimScale) * 0.6 + (old1 - rows[1].base) * 0.15;
    ring.heights[i1] = seated;
    ring.positions[i1 * 3 + 1] = seated;
    const iR = ridgeRow * n + k;
    const rR = Math.hypot(ring.positions[iR * 3], ring.positions[iR * 3 + 2]);
    for (let ri = 2; ri < ridgeRow; ri++) {
      const i = ri * n + k;
      const r = Math.hypot(ring.positions[i * 3], ring.positions[i * 3 + 2]);
      const t = clamp((r - r1) / Math.max(1, rR - r1), 0, 1);
      const h = ring.heights[i] + (seated - old1) * (1 - t);
      ring.heights[i] = h;
      ring.positions[i * 3 + 1] = h;
    }
    // Round 36 (owner 2026-09-21, "the textures didnt continue on once you get to the boundary of the map - it looked
    // like a completely new geography"): when the battlefield can evaluate its own macro relief past the square, the
    // foothill rows follow it — the terrain's edge height continued by its gradient hands over to the map's geology
    // within 90 m, and the authored ring relief takes over between 60 and 380 m past the edge — so a hill, dune or
    // mesa that reaches the red line carries on as the same landform instead of stopping at a seated skirt.
    const outland = ground.getOutlandHeightAt;
    // Round 63 (2026-09-24, Tarkhan's railway cutting): the rim's interior gradient is sampled 36 m inward along the
    // radial, 12 m off a notch's axis at that column, so the ring carried the cutting's south face across its mouth as
    // a 10 m hill. Where the height field says so (a cutting's outland corridor, fading out past its daylight line) the
    // near rows seat on the outland itself; every other map publishes no weight and keeps its rows to the bit.
    const seatWeight = ground.getOutlandSeatWeightAt;
    if (outland) {
      // Round 49 (2026-09-23, the Saltwind-mouth diagnosis): this hand-over reached only the rows BEFORE the first
      // authored ridge, so beside a sea opening the range profile began its rise at that row — a 25–30 m step on one
      // 50 m strip ~210 m past the edge, drawn as a single flat quad beside the water (the dark slabs at Saltwind's,
      // Saltmere's and Nordhavn's mouths). Across the opening's taper and 0.25 rad of columns beyond it the hand-over
      // runs on through the ridge rows to 470 m, so a headland slopes into the sea over 250 m; every other column, and
      // every row past 470 m, keeps its authored height to the bit (owner: never flatten the background mountains).
      const headland = openings.length ? seaHeadlandWeight(a, openings, HEADLAND_BAND_RAD) : 0;
      const lastRow = headland > 0 ? rows.length : ridgeRow;
      for (let ri = 1; ri < lastRow; ri++) {
        const i = ri * n + k;
        const x = ring.positions[i * 3], z = ring.positions[i * 3 + 2];
        const edgeOut = Math.max(Math.abs(x), Math.abs(z)) - 511.5;
        if (edgeOut < -40) continue; // buried under the battlefield's own chunks
        if (ri >= ridgeRow && edgeOut >= 470) break; // rows step outward: the authored profile owns the rest
        const continued = edgeH + gradient * clamp(edgeOut, 0, 60);
        let geology = continued + (outland.call(ground, x, z) - continued) * smoothstep(0, 90, edgeOut);
        let seat = 0;
        if (seatWeight) {
          seat = seatWeight.call(ground, x, z);
          if (seat > 0) geology += (outland.call(ground, x, z) - geology) * seat;
        }
        const handOver = ri < ridgeRow
          ? (ground.getBorderHandOverAt ? 1 - ground.getBorderHandOverAt(x, z) : smoothstep(60, 380, edgeOut)) : 1;
        // Round 67 (2026-09-24, the cutting's tunnel portal): where the weight says the row seats on the outland, the
        // authored profile's share stands down with it — the hand-over left the seated rows 0.5–3.4 m over the bed
        // 100–145 m out (a track laid on the bed there ran under the ring), and the valley now lies on the bed plane
        // to the first authored ridge row, which keeps its height to the bit. Without a weight the share is what it was.
        const share = (headland > 0 ? handOver + (smoothstep(200, 470, edgeOut) - handOver) * headland : handOver)
          * (1 - seat);
        const h = geology + (ring.heights[i] - geology) * share;
        ring.heights[i] = h;
        ring.positions[i * 3 + 1] = h;
      }
    }
  }
}

/**
 * Round 72b (crops: every slope break of the authored profile — the foot of the first steep face, the shoulder above
 * it — sat at one radius all the way round and drew as a straight horizontal edge, a bench in front of every range):
 * on the ranged characters each column resamples its own height profile beyond the first ridge at a wandering radius
 * (a periodic field of the arc and the radius, ±38 m, two octaves), so the slope breaks move in and out along the
 * arc the way a range's spurs and cirques do. The band up to the first ridge (the terrain material's rows) and the
 * outer shoulder keep their heights; the mesa stack (level tables) and the near-flat rings (Polders) are left alone.
 * Heights only — the columns' radii stay — and the ledger's cliff law runs after it.
 */
function wanderProfileBreaks(ring: HorizonRingGeometry, relief: HorizonReliefField, style: HorizonStyle, seed: number): void {
  if (relief.settings.rangeCount === 0 || style === 'mesa' || ring.maxHeight < 60) return;
  const n = HORIZON_SEGMENTS, rows = ring.rows.length;
  const ridgeRow = ring.rows.findIndex((row) => !row.skirt && !row.interpolated);
  if (ridgeRow < 0 || ridgeRow >= rows - 3) return;
  const noise = new SimplexNoise({ random: mulberry32((seed ^ 0x2B7D) >>> 0) });
  const rOf = new Float64Array(rows), hOf = new Float64Array(rows), out = new Float64Array(rows);
  const { positions, heights } = ring;
  let maxHeight = 0;
  for (let k = 0; k < n; k++) {
    for (let row = 0; row < rows; row++) {
      const i = row * n + k;
      rOf[row] = Math.hypot(positions[i * 3], positions[i * 3 + 2]); hOf[row] = heights[i];
    }
    const iR = ridgeRow * n + k, theta = Math.atan2(positions[iR * 3 + 2], positions[iR * 3]);
    const ct = Math.cos(theta), st = Math.sin(theta);
    const rRidge = rOf[ridgeRow], rOuter = rOf[rows - 1];
    for (let row = ridgeRow + 1; row < rows; row++) {
      const r = rOf[row];
      const fade = smoothstep(0, 70, r - rRidge) * (1 - smoothstep(rOuter - 80, rOuter, r));
      const delta = (noise.noise3d(ct * 2.6 + 4.2, st * 2.6 - 1.7, r * 0.0045) + 0.5 * noise.noise3d(ct * 5.2 - 8.8, st * 5.2 + 3.1, r * 0.009)) * 38 * fade;
      const rs = clamp(r + delta, rRidge, rOuter);
      let j = ridgeRow;
      while (j < rows - 2 && rOf[j + 1] < rs) j++;
      const t = clamp((rs - rOf[j]) / Math.max(1e-3, rOf[j + 1] - rOf[j]), 0, 1);
      out[row] = hOf[j] + (hOf[j + 1] - hOf[j]) * t;
    }
    // the ledger's anchor law (horizonResources: an interpolated row stays within its span's chord ± 12 % of the
    // radial span, alpine within the anchors' band ± 12 %): the wander moves the authored anchors too, so each span's
    // interpolated rows are bounded against the anchors as they now stand
    let a = ridgeRow;
    for (let b = ridgeRow + 1; b < rows; b++) {
      if (ring.rows[b].interpolated) continue;
      const hA = a > ridgeRow ? out[a] : hOf[a], hB = out[b], span = Math.max(1, rOf[b] - rOf[a]), slack = span * 0.115;
      for (let row = a + 1; row < b; row++) {
        if (style === 'alpine') out[row] = clamp(out[row], Math.min(hA, hB) - slack, Math.max(hA, hB) + slack);
        else { const chord = hA + (hB - hA) * (rOf[row] - rOf[a]) / span; out[row] = clamp(out[row], chord - slack, chord + slack); }
      }
      a = b;
    }
    for (let row = ridgeRow + 1; row < rows; row++) {
      const i = row * n + k;
      heights[i] = out[row]; positions[i * 3 + 1] = out[row];
    }
    for (let row = 0; row < rows; row++) maxHeight = Math.max(maxHeight, heights[row * n + k]);
  }
  ring.maxHeight = maxHeight;
}

/**
 * Round 72b: the ledger's cliff law, enforced after every pass that moves rows (the cap reshape re-spaces the
 * approach and back rows over the relieved field): between two consecutive anchor rows — the authored rows, and on
 * the tableland maps the two cap fronts — no row climbs from the row before it faster than max(1.9, anchor slope + 0.3)
 * (alpine: max(3, 2 x anchor slope + 0.3)). Forward then backward per column, so both anchors hold. A no-op where the
 * rows already obey it (every ring without the relief field is byte-identical).
 */
function enforceLedgerSlopes(ring: HorizonRingGeometry, style: HorizonStyle, capFronts: readonly number[] = []): void {
  const n = HORIZON_SEGMENTS, { rows, positions: p, heights: h } = ring;
  const anchors = rows.map((row, i) => (!row.skirt && !row.interpolated ? i : -1)).filter((i) => i >= 0);
  const anchorSet = new Set([...anchors, ...capFronts].filter((i) => i >= 1));
  const sorted = [...anchorSet].sort((a, b) => a - b);
  const radiusAt = (i: number): number => Math.hypot(p[i * 3], p[i * 3 + 2]);
  for (let s = 1; s < sorted.length; s++) {
    const a = sorted[s - 1], b = sorted[s];
    if (b - a < 2) continue;
    for (let c = 0; c < n; c++) {
      const ia = a * n + c, ib = b * n + c;
      const authored = Math.abs(h[ib] - h[ia]) / Math.max(1, radiusAt(ib) - radiusAt(ia));
      const bound = (style === 'alpine' ? Math.max(3.0, authored * 2 + 0.3) : Math.max(1.9, authored + 0.3)) - 0.02;
      for (let row = a + 1; row < b; row++) {
        const i = row * n + c, j = i - n, gap = Math.max(1, radiusAt(i) - radiusAt(j));
        h[i] = clamp(h[i], h[j] - bound * gap, h[j] + bound * gap);
      }
      for (let row = b - 1; row > a; row--) {
        const i = row * n + c, j = i + n, gap = Math.max(1, radiusAt(j) - radiusAt(i));
        h[i] = clamp(h[i], h[j] - bound * gap, h[j] + bound * gap);
      }
      for (let row = a + 1; row < b; row++) p[(row * n + c) * 3 + 1] = h[row * n + c];
    }
  }
}

/**
 * The mountains lane (2026-10-02, owner: "clouds are the bar; mountains, horizons and terrain must match"): massifs, not
 * cones. On the ranged characters each row beyond the first ridge keeps its composition — its relief over its floor,
 * smoothed along the row so the profile's radial spurs (the cones seen end-on from the battlefield) become broad
 * masses — and multiplies it by the eroded landform (horizonMassif.ts: a dendritic drainage cut into a smooth base,
 * mean one), so the authored tall sectors and passes stay where they were and every mass in them is carved into
 * ridges, spurs, couloirs and cols. The tableland rings (the mesa style; Redrock's canyon outland included) take the
 * same landform as side canyons instead — cut-only, so the caps it misses keep their level — before their bed stair.
 * The first ridge keeps its own crest; the pass ramps in over the 140 m behind it. Runs after the wandering slope
 * breaks and before the ledger's slope law, which still bounds every row step. Each row's floor is its base as the
 * relief carved above it (row.base x amp x the character's range boost at its rank, interpolated between the authored
 * rows); the tablelands' floor is their plain (0.8 x the lowest row base). A generator: it yields every few rows.
 */
function* carveHorizonMassifsSteps(
  ring: HorizonRingGeometry, relief: HorizonReliefField | null, horizon: HorizonConfig, mapId: string, style: HorizonStyle, seed: number,
): Generator<void, void, void> {
  const amp = horizon.amp ?? 1;
  // (a near-flat ring — Polders' 30 m dike-country ridge — keeps its round-72 relief, as the slope-break wander does)
  const massif = relief && relief.settings.rangeCount > 0 && ring.maxHeight >= 60 ? resolveMassifSettings(horizon, relief.settings.massif) : null;
  // (Redrock's outland is the analytic canyon, which the continued ground writes over every row: no side canyons there)
  const canyons = !massif && style === 'mesa' && horizon.escarpment !== false && !(mapId === 'badlands' && horizon.redrockCanyon !== false);
  if (!massif && !canyons) return;
  const rows = ring.rows, n = HORIZON_SEGMENTS;
  const ridgeRow = rows.findIndex((row) => !row.skirt && !row.interpolated);
  if (ridgeRow < 0) return;
  const floors = new Float32Array(rows.length), weights = new Float32Array(rows.length);
  const ridgeR = rows[ridgeRow].r;
  const fieldSeed = ((seed ^ 0x7E11) ^ idHash(mapId)) >>> 0;
  if (massif && relief) {
    const full = 1 + (relief.settings.rangeBoost - 1) * clamp(amp, 0, 1);
    const boostAt = (rank: number): number => (rank < 1 ? 1 : rank === 1 ? 1 + (full - 1) * 0.5 : full);
    // the authored rows' floors, then the interpolated rows' by their radius between them
    const authored: { index: number; r: number; floor: number }[] = [];
    let rank = 0;
    rows.forEach((row, index) => {
      if (row.skirt || row.interpolated) return;
      authored.push({ index, r: row.r, floor: row.base * amp * boostAt(rank) });
      rank++;
    });
    for (let i = ridgeRow; i < rows.length; i++) {
      const row = rows[i];
      if (row.skirt) continue;
      let a = authored[0], b = authored[authored.length - 1];
      for (let k = 0; k < authored.length - 1; k++) if (authored[k].index <= i && authored[k + 1].index >= i) { a = authored[k]; b = authored[k + 1]; break; }
      const t = b.r > a.r ? clamp((row.r - a.r) / (b.r - a.r), 0, 1) : 0;
      floors[i] = a.floor + (b.floor - a.floor) * t;
      weights[i] = smoothstep(0, 140, row.r - ridgeR);
    }
    const field = createMassifField(fieldSeed, massif, [ridgeR, rows[rows.length - 1].r + 60]);
    yield;
    yield* carveMassifRingSteps({ columns: n, rowCount: rows.length, positions: ring.positions, heights: ring.heights, floors, weights }, field);
  } else {
    floors.fill(mesaPlain(rows, amp));
    for (let i = ridgeRow; i < rows.length; i++) weights[i] = rows[i].skirt ? 0 : smoothstep(0, 140, rows[i].r - ridgeR);
    const field = createMassifField(((seed ^ 0x6CA7) ^ idHash(mapId)) >>> 0, MESA_CANYONS, [ridgeR, rows[rows.length - 1].r + 60]);
    yield;
    yield* cutMassifCanyonsSteps({ columns: n, rowCount: rows.length, positions: ring.positions, heights: ring.heights, floors, weights }, field, MESA_CANYON_BIAS);
  }
  let maxHeight = 1;
  for (let i = n * 2; i < ring.heights.length; i++) if (ring.heights[i] > maxHeight) maxHeight = ring.heights[i];
  ring.maxHeight = maxHeight;
}

/** The mountains lane: the tableland rings' bed stair (horizonEscarpment.ts) — the style default, per-map overridable.
 * (gauntlet wave 18, the Dahar "smooth planar wedges with ruler-straight crest lines": thinner beds, 26-50 m, so a wall
 * carries more cliff bands and the tables more tiers; the beds dip 24 m per km and their rims meander 48 m, so the tops
 * step across the skyline instead of standing at one level) */
const MESA_ESCARPMENT: EscarpmentSettings = {
  bedM: [26, 50], cliffShare: [0.28, 0.48], talusRise: 0.32, talusCurve: 2.2, dipPerKm: 24, meanderM: 48, meanderWavelengthM: 300,
};
/** The tableland rings' side canyons: the eroded landform cutting into the tables (cut only: min(1, multiplier + bias)).
 * Its base and one octave of 380 m wadis (2026-10-03): the three drainage octaves cut the crest into a row of narrow fins
 * that the bed stair stood up as crenellations along Sirocco Wadi's and Copper Mesa's skylines; the base alone left
 * "smooth planar wedges with ruler-straight crest lines" (gauntlet wave 18) — the first octave notches the rims into
 * spurs and re-entrants as wide as a table's tier, too broad for the stair to stand up as fins. */
const MESA_CANYONS: MassifSettings = { baseWavelengthM: 1000, gullyWavelengthM: 380, gullyOctaves: 1, gullyGain: 0.5, slopeStrength: 2.5, branch: 2.5,
  erosion: 0.3, concavity: 1.0, contrast: 0.5, smoothM: 0 };
const MESA_CANYON_BIAS = 0.22;

/** The plain the tablelands stand on: 0.8 x the lowest non-skirt row base (amp included). */
function mesaPlain(rows: readonly HorizonRingRow[], amp: number): number {
  let plain = Infinity;
  for (const row of rows) if (!row.skirt) plain = Math.min(plain, row.base * amp);
  return Number.isFinite(plain) ? plain * 0.8 : 20;
}

/**
 * The mountains lane (2026-10-02): layered escarpments on the tableland rings (the mesa style, Redrock's canyon
 * outland included) — every height above the plain through the bed stair (cliff over talus slope per bed, the caprock
 * rim at each bed top, world-level beds with a slight dip, a plan meander for the buttresses and embayments), the talus
 * aprons at the cliff feet and the 3.6:1 cliff bound, after the rows are refined (so the stair has the refined rows to
 * live on) and before the near band is handed to the continued ground (which the per-vertex weight also leaves alone:
 * nil within 70 m of the playable edge, full by 230 m). A generator: it yields between its stages.
 */
function* carveHorizonEscarpmentsSteps(ring: HorizonRingGeometry, horizon: HorizonConfig, mapId: string, style: HorizonStyle, seed: number): Generator<void, void, void> {
  // the mesa style by default; any other ring that authors an escarpment block (an arid rolling ring's gour hills)
  const authored = typeof horizon.escarpment === 'object' && horizon.escarpment !== null;
  if ((style !== 'mesa' && !authored) || horizon.escarpment === false) return;
  const settings: EscarpmentSettings = { ...MESA_ESCARPMENT, ...(authored ? horizon.escarpment as Partial<EscarpmentSettings> : {}) };
  const rows = ring.rows;
  const floors = new Float32Array(rows.length).fill(mesaPlain(rows, horizon.amp ?? 1));
  const weights = new Float32Array(rows.length);
  for (let i = 0; i < rows.length; i++) weights[i] = rows[i].skirt ? 0 : 1;
  const field = createEscarpmentField(((seed ^ 0x5E5C) ^ idHash(mapId)) >>> 0, settings);
  yield* carveEscarpmentRingSteps({ columns: HORIZON_SEGMENTS, rowCount: rows.length, positions: ring.positions, heights: ring.heights, floors, weights,
    weightAt: (x, z) => smoothstep(70, 230, Math.max(Math.abs(x), Math.abs(z)) - 512) }, field, {
    talusFill: 0.34,
    // a massif's shoulders (an alpine ring) keep the ring's own ledger bound (horizonResources: 3:1 or the authored
    // slope doubled); the tablelands' cliffs take the stair's 3.6:1
    maxSlope: style === 'alpine' ? 3.0 : 3.6,
    // the tables' anti-spire opening: not on a massif (its summits stand) nor on Redrock, whose canyon is authored with
    // unequal flanks (redrockCanyonHorizon.selftest.mjs) that the opening would level to one bed top
    tables: horizon.tableland !== false && !(mapId === 'badlands' && horizon.redrockCanyon !== false),
  });
  // every row, as continueHorizonGround measures it: on Redrock this runs after the hand-over, whose seam rows can carry the
  // ring's highest point (seed 2049: the edge mesa at 94.9 m over the outland's 94.7)
  let maxHeight = 1;
  for (let i = 0; i < ring.heights.length; i++) if (ring.heights[i] > maxHeight) maxHeight = ring.heights[i];
  ring.maxHeight = maxHeight;
}

/** Drain a construction generator synchronously (the headless sampler). */
function drainSteps<T>(steps: Generator<void, T, void>): T {
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

/** The ring's landform: the character's, with the map's authored knobs over it (`horizon.massif`), or null when the map
 * opts out or the character carries none. */
function resolveMassifSettings(horizon: HorizonConfig, character: MassifSettings | null): MassifSettings | null {
  if (horizon.massif === false || !character) return null;
  return typeof horizon.massif === 'object' ? { ...character, ...horizon.massif } : character;
}

/** The mountains lane: the far range's landform — the ring's at 2.2 x its wavelengths (the tableland rings, which carry
 * no ranged landform, take the rolling one's), the erosion turned down a little through the extra air. */
function farMassifSettings(ring: MassifSettings | null): MassifSettings {
  const m = ring ?? resolveHorizonRelief('rolling').massif!;
  return { ...m, baseWavelengthM: m.baseWavelengthM * 2.2, gullyWavelengthM: m.gullyWavelengthM * 2.2, smoothM: 0 };
}

/** The mountains lane: a tableland ring's far plateaus — its bed stair at about 2.6 x the beds (the far rows stand a
 * few hundred metres apart, so only the big tiers read: flat tops stepping down the far skyline); null elsewhere. */
function farEscarpmentSettings(horizon: HorizonConfig, style: HorizonStyle): EscarpmentSettings | null {
  const authored = typeof horizon.escarpment === 'object' && horizon.escarpment !== null;
  if ((style !== 'mesa' && !authored) || horizon.escarpment === false || horizon.tableland === false) return null;
  const near: EscarpmentSettings = { ...MESA_ESCARPMENT, ...(authored ? horizon.escarpment as Partial<EscarpmentSettings> : {}) };
  return { ...near, bedM: [near.bedM[0] * 2.6, near.bedM[1] * 2.6], meanderM: near.meanderM * 2.6, meanderWavelengthM: near.meanderWavelengthM * 2.2 };
}

function usesFiniteTableCaps(horizon: HorizonConfig, mapId: string, style: HorizonStyle): boolean {
  return style === 'mesa' && horizon.finiteTableCaps !== false
    && (mapId === 'skybridge' || mapId === 'copper_mesa' || mapId === 'titan_gorge');
}

/**
 * Round 72: the map's relief field for the ring geometry — null on Redrock, whose outland is the analytic canyon
 * (horizonRedrock.ts overwrites every row) and stays byte-identical; the bake still reads a field there.
 */
function resolveHorizonReliefFieldFor(horizon: HorizonConfig, mapId: string, seed: number): HorizonReliefField | null {
  if (mapId === 'badlands' && horizon.redrockCanyon !== false) return null;
  return createHorizonReliefField(((seed ^ 0x7E11) ^ idHash(mapId)) >>> 0, resolveHorizonRelief(resolveHorizonReliefCharacter(horizon, mapId)));
}

/** Actual geometry without texture baking, for full-angle headless audits. */
export function sampleHorizonGeometry(
  cfg: HorizonMapConfig | null | undefined, seed: number, ground?: CanyonGround,
): HorizonRingGeometry {
  const horizon = cfg?.horizon ?? {};
  const mapId = cfg?.id ?? 'verdant';
  const style = resolveHorizonStyle(horizon, mapId);
  const noise = new SimplexNoise({ random: mulberry32(((seed ^ 0x7A11) ^ idHash(mapId)) >>> 0) });
  const relief = resolveHorizonReliefFieldFor(horizon, mapId, seed);
  const source = buildInitialHorizonGeometry(
    horizonRows(style, mapId),
    style, PROFILES[style], noise, horizon.amp ?? 1, relief, horizon.massif !== false,
  );
  const ring = subdivideHorizonGeometry(source, style, noise, relief);
  const openings = resolveSeaOpenings(horizon.seaOpening, ground, mapId);
  if (mapId === 'badlands' && horizon.redrockCanyon !== false) shapeRedrockOutland(ring, ground);
  else if (mapId === 'autumn' && ground) seatHorizonTerrainSeam(ring, ground);
  else if (ground) seatHorizonSkirtOnGround(ring, ground, openings);
  if (usesFiniteTableCaps(horizon, mapId, style)) {
    // Titan's tall ranges need a slightly lower erosion stratum to expose
    // broad summit surfaces without steepening their supported approaches.
    // Vista pass (2026-09-19): every tableland map bounds its cap rise at 1.25:1 now that the first ridge sits
    // 160 m inside the crest (700 -> 860): an unbounded cap put the final edge at 1.30:1 on Skybridge.
    reshapeFiniteTableCaps(ring, horizon.amp ?? 1, mapId === 'titan_gorge' ? 0.60 : 0.64, [1.25, 1.80]);
  }
  if (relief) wanderProfileBreaks(ring, relief, style, seed);
  drainSteps(carveHorizonMassifsSteps(ring, relief, horizon, mapId, style, seed));
  if (relief) enforceLedgerSlopes(ring, style, capFrontRows(ring, horizon, mapId, style));
  if (ground) seatHorizonTerrainSeam(ring, ground);
  refineCoastRows(ring, openings, ground);
  // Redrock's continued ground IS its whole outland (the analytic canyon), so its beds are cut after the hand-over
  const canyonOutland = mapId === 'badlands' && horizon.redrockCanyon !== false;
  if (!canyonOutland) drainSteps(carveHorizonEscarpmentsSteps(ring, horizon, mapId, style, seed));
  continueHorizonGround(ring, ground, canyonOutland);
  if (canyonOutland) drainSteps(carveHorizonEscarpmentsSteps(ring, horizon, mapId, style, seed));
  if (horizon.roadPasses !== false) openRoadPasses(ring, ground);
  if (horizon.summitCap) capHorizonSummits(ring, horizon.summitCap, ((seed ^ 0x5C4D) ^ idHash(mapId)) >>> 0, HORIZON_SEGMENTS);
  if (horizon.dam) carveHorizonDamCanyon(ring, horizon.dam, HORIZON_SEGMENTS);
  openHorizonToSea(ring, openings, ground);
  return ring;
}

/** The cap-front rows (the row before each capped crest) on the tableland maps — anchors of the cliff law there. */
function capFrontRows(ring: HorizonRingGeometry, horizon: HorizonConfig, mapId: string, style: HorizonStyle): number[] {
  if (!usesFiniteTableCaps(horizon, mapId, style)) return [];
  const authored = ring.rows.map((row, i) => (!row.skirt && !row.interpolated ? i : -1)).filter((i) => i >= 0);
  return [authored[1] - 1, authored[3] - 1].filter((i) => i > 0);
}

function buildHorizonUvs(
  heights: Float32Array,
  maxHeight: number,
  sea: HorizonSea,
): Float32Array {
  const uv = new Float32Array(heights.length * 2);
  for (let index = 0; index < heights.length; index++) {
    uv[index * 2] = ((index % HORIZON_SEGMENTS) / HORIZON_SEGMENTS) * 10;
    // round 47: the per-vertex weight (bay contour near the square, sector beyond) replaces the azimuth lookup
    const level = sea.level[index];
    const marine = sea.weight[index] > 0 ? sea.weight[index]
      * (1 - smoothstep(level + 0.04, level + 1.0, heights[index])) : 0;
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
      // Round 29 (owner 2026-09-20, Redrock Divide: "see where the texture just stops"): the first exposed row's
      // radial gradient is one-sided. Its inner neighbour is the buried closing anchor — up to 110 m under
      // Redrock's plateau — whose slope tilted every seam normal (~36° there) and made the terrain material paint
      // a band of streaked rock on flat ground beyond every playable edge.
      const inner = rowIndex > 1 ? index - HORIZON_SEGMENTS : index;
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
  index: number,
): void {
  const rockWeight = smoothstep(0.34, 0.8, slope) * (row.skirt ? 0.25 : context.rockAmp);
  if (!context.vista) color.lerp(context.rock, rockWeight);
  if (context.treeline > 0) {
    const forestNoise = context.noise.noise(
      Math.cos(angle) * 7 + 3 + altitude * 3.1,
      Math.sin(angle) * 7 + rowIndex - altitude * 2.4,
    ) * 0.5 + 0.5;
    const forestWeight = (1 - smoothstep(context.treeline * 0.55, context.treeline, altitude))
      * (1 - slope * 0.4) * (0.5 + 0.5 * forestNoise);
    if (!context.vista) color.lerp(context.forest, clamp(forestWeight, 0, 1) * (context.style === 'alpine' ? 0.32 : 0.6));
    // Forest stands: broad masses opened by clearings, denser on the lower
    // faces, thinning toward the treeline, shed from cliffs and stopped by
    // snow. The same stand field gates the canopy belts, so their crowns
    // rise from these dark masses instead of tracing bare contour lines.
    if (!row.skirt) {
      const stand = context.noise.noise(Math.cos(angle) * 3.4 + rowIndex * 1.9 + 7.3,
        Math.sin(angle) * 3.4 - rowIndex * 2.6) * 0.5 + 0.5;
      const edge = 0.12 + altitude * 0.42;
      const snowFade = context.snowline <= 1
        ? 1 - smoothstep(context.snowline - 0.06, context.snowline + 0.02, altitude) : 1;
      const cover = smoothstep(edge, edge + 0.14, stand)
        * (1 - smoothstep(context.treeline * 0.80, context.treeline * 1.02, altitude))
        * (1 - smoothstep(0.55, 0.85, slope)) * snowFade;
      if (context.forestCover) context.forestCover[index] = cover;
      // r9: alpine keeps a softened bake; the fragment treeline owns the edges.
      if (!context.vista) color.lerp(context.forest, cover * (context.style === 'alpine' ? 0.40 : 0.45));
    }
  }
  if (context.vista) return;
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
    // r9: alpine keeps a flatter bake (0.38-0.62); the fragment crest snow
    // carries the band edge so it no longer interpolates across wall triangles.
    const bandTop = context.style === 'alpine' ? 0.62 : 0.95;
    const coverage = clamp(band * bandTop + (1 - band) * 0.38, 0, 1) * effectiveHold;
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
  if (context.vista) return; // the vista fragment hazes per fragment
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
      applyHorizonSurfaceBands(color, scratch, context, row, angle, altitude, slope, rowIndex, index);
      if (context.redrockCanyon) tintRedrockOutlandFloor(color, context.heights[index], slope);
      if (!context.vista) applyHorizonDirectionalLight(color, scratch, context, row, angle, index);
      applyHorizonToneAndHaze(color, context, row, angle, altitude, rowIndex);
      const seaOpening = context.seaOpenings.length ? dominantSeaOpening(angle, context.seaOpenings) : null;
      // round 47: the vertex's own marine weight (the bay contour near the square, the sector beyond)
      const seaWeight = context.sea ? context.sea.weight[index] : (seaOpening ? seaOpeningWeight(angle, seaOpening) : 0);
      if (seaOpening || seaWeight > 0) {
        if (seaWeight > 0) {
          // Distant water reflects a mostly neutral low sky, warm toward the
          // sun and cool away. Do not compensate it for the forest texture:
          // the shader now bypasses that texture for the sea. The previous
          // channel compensation produced a saturated cyan annular stripe.
          // Round 40 (2026-09-22): the apron starts as this map's own deep water at the seam (the shallow-water
          // sheet continues over it with the same colour) and only takes on the sky with distance; the former
          // constant 0.55 reflection turned the whole aperture the fog's grey one metre past the square edge.
          const [sunX, , sunZ] = context.sun;
          const sunFacing = Math.max(0, (Math.cos(angle) * sunX + Math.sin(angle) * sunZ)
            / Math.max(0.001, Math.hypot(sunX, sunZ)));
          const warm = Math.pow(sunFacing, 5);
          const skyLuminance = context.fog.r * 0.2126 + context.fog.g * 0.7152
            + context.fog.b * 0.0722;
          const radialFraction = rowIndex / Math.max(1, context.rows.length - 1);
          const reflection = 0.16 + (0.44 + row.aer * 0.20) * radialFraction * radialFraction;
          scratch.setHex(seaOpening?.colorHex ?? context.seaOpenings[0]?.colorHex ?? 0x1d5266);
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

/**
 * The ring's cliffs (the light lane, 2026-10-04: on Redrock's sunward view its faces turned away from the sun read at 74-82 %
 * of the sunlit sand, where a face in its own shade sits near 15-30 %). The analytic normals come from heights smoothed
 * over the neighbouring columns and rows, which tipped a cliff's normal up by a median 43 degrees on Redrock's ring and
 * left half of its faces turned from the sun lit by it; within the seam band the playable ground's normals, sampled at a
 * cliff's top or foot, did the same to the coarse ring triangles spanning it. On steep ground a vertex takes the geometry's
 * own normal (its faces' area-weighted), blended in between 50 and 65 degrees of slope; gentler ground keeps its normal,
 * and the first 20-60 m past the square's edge keep the playable ground's, so the seam still meets the battlefield.
 */
function sharpenHorizonCliffNormals(geometry: THREE.BufferGeometry): void {
  const faces = new THREE.BufferGeometry();
  faces.setAttribute('position', geometry.getAttribute('position'));
  faces.setIndex(geometry.getIndex());
  faces.computeVertexNormals();
  const geometric = faces.getAttribute('normal'), normal = geometry.getAttribute('normal');
  const positions = geometry.getAttribute('position');
  const stride = HORIZON_SEGMENTS + 1;
  for (let i = 0; i < normal.count; i++) {
    // (the ring is wound facing down for computeVertexNormals: its geometric normal is the negation; the closing column
    // repeats the first, so the two are averaged and the seam does not show)
    const column = i % stride;
    const twin = column === 0 ? i + HORIZON_SEGMENTS : column === HORIZON_SEGMENTS ? i - HORIZON_SEGMENTS : -1;
    let gx = -geometric.getX(i), gy = -geometric.getY(i), gz = -geometric.getZ(i);
    if (twin >= 0) { gx -= geometric.getX(twin); gy -= geometric.getY(twin); gz -= geometric.getZ(twin); }
    const gl = Math.hypot(gx, gy, gz);
    if (gl < 1e-6) continue;
    gx /= gl; gy /= gl; gz /= gl;
    const edgeOut = Math.max(Math.abs(positions.getX(i)), Math.abs(positions.getZ(i))) - 512;
    const w = smoothstep(0.64, 0.42, gy) * smoothstep(20, 60, edgeOut);
    if (w <= 0) continue;
    const bx = normal.getX(i) * (1 - w) + gx * w, by = normal.getY(i) * (1 - w) + gy * w, bz = normal.getZ(i) * (1 - w) + gz * w;
    const bl = Math.hypot(bx, by, bz) || 1;
    normal.setXYZ(i, bx / bl, by / bl, bz / bl);
  }
  faces.dispose();
}

/** The playable mesh takes its normals from 1.33 m central differences.
 * Continue that same shading across the seam; heavily smoothed ring gradients
 * otherwise turn a single cliff into two visibly different materials. */
function matchHorizonGroundNormals(geometry: THREE.BufferGeometry, ground?: CanyonGround): void {
  if (!ground?.getOutlandHeightAt) return;
  const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
  const e = 128 / 96, stride = HORIZON_SEGMENTS + 1;
  // (the time-to-battle lane, 2026-10-08) residuals kept by point: a vertex's two samples along the edge share one
  const continued = continuedGroundSampler(ground);
  for (let i = stride; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i);
    const edgeOut = Math.max(Math.abs(x), Math.abs(z)) - 512;
    const weight = 1 - smoothstep(40, 140, edgeOut);
    if (weight <= 0) continue;
    const nx = continued(x - e, z) - continued(x + e, z);
    const nz = continued(x, z - e) - continued(x, z + e);
    const il = 1 / Math.hypot(nx, 2 * e, nz);
    const bx = normals.getX(i) * (1 - weight) + nx * il * weight;
    const by = normals.getY(i) * (1 - weight) + 2 * e * il * weight;
    const bz = normals.getZ(i) * (1 - weight) + nz * il * weight;
    const length = Math.hypot(bx, by, bz);
    normals.setXYZ(i, bx / length, by / length, bz / length);
  }
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
  // Round 40 (2026-09-22, AAA program check 13): the analytic normals describe the authored relief, but a sea aperture
  // has lowered those vertices onto a flat sea floor — the apron kept the hills' sloped normals and shaded 40 % darker
  // than the square's water right at the seam (measured straight down on Coastal). Marine vertices (UV V < 0 carries
  // the aperture weight) tilt their normal up by that weight; fully open water is exactly horizontal.
  const normal = geometry.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < normal.count; i++) {
    const marine = -closedUv[i * 2 + 1];
    if (marine <= 0) continue;
    const nx = normal.getX(i) * (1 - marine), ny = normal.getY(i) * (1 - marine) + marine, nz = normal.getZ(i) * (1 - marine);
    const inverseLength = 1 / Math.max(1e-6, Math.hypot(nx, ny, nz));
    normal.setXYZ(i, nx * inverseLength, ny * inverseLength, nz * inverseLength);
  }
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
  base: THREE.Color;
  forest: THREE.Color;
  snow: THREE.Color;
  rock: THREE.Color;
  fog: THREE.Color;
  haze: number;
  vista: boolean;
  /** Round 29: which tile the vista samples as the ground layer. */
  ground: VistaGround;
  /** Round 49: bare upper slopes (heath, outcrop ribs, scree) above the treeline, 0..1. */
  bareRock: number;
  /** Round 55: knobs and scree through the turf on the steeper faces below the treeline, 0..1. */
  outcrops: number;
  /** Round 72: the baked surface atlas (null on the mobile tier) and the map's relief character. */
  relief: { bake: HorizonReliefBake | null; settings: HorizonReliefSettings };
  /** Round 72: the map's lighting the ring's gains follow (the sky preset's sun and hemisphere, the deck's cover). */
  lighting: HorizonLighting;
  /**
   * 2026-10-02: the ring will draw every face with the battlefield's terrain material (terrain.ts binds it with
   * continuousGround), so its own material is a data carrier only: no vista program, no ground / rock / scree / snow
   * tiles; the relief atlas, the canopy tile and the haze stay for the terrain bands and the ring forest.
   */
  terrainBound: boolean;
}

/** Build-time options of the ring. */
interface HorizonRingOptions {
  /** The caller binds every ring face to the terrain material (terrain.ts): build no vista program. */
  terrainBound?: boolean;
  /** (the perf lane, 2026-10-08) the geometry pipeline's result for this config and seed, computed already (the horizon
   * ring worker, the same-map cache): the build skips the pipeline and runs its material half on it. */
  geometry?: HorizonRingPipeline | null;
}

/** Round 72: the vista's sun and sky gains, and the far range's, from the map's own lighting. */
interface HorizonLighting {
  /** The sky preset's sunIntensity (engine default 4.5) and hemiIntensity plus the engine's bounce floor (0.36 + 0.15). */
  sun: number;
  hemi: number;
  /** 0..1 cloud cover: the cloudscape's coverage, else the baked deck's opacity. */
  cover: number;
  /**
   * 2026-10-05 (the skies lane; the gauntlet's wave 93 on Titan Gorge's far rock under its closed deck: "banded, graphic
   * mountain-face shading ... inconsistent with the implied shadowless overcast light"): the share of the clear sun the
   * deck lets through as a beam (the light model's: 1 − OVERCAST_DIRECT_CUT × overcast), and the sun's elevation sine —
   * the beam the deck cuts comes down as sky light (absent: 1 and 0, an open sky).
   */
  direct?: number;
  sinEl?: number;
}

/** The references the vista's constants were tuned against: the engine's default sun and effective hemisphere. */
const HORIZON_REF_SUN = 4.5;
const HORIZON_REF_HEMI = 0.51;

/** The vista's ambient and sun gains for a map: 0.46 / 1.30 at the references, following the map's hemisphere and sun
 * (compressed, so a 3 x sun does not triple the term), the baked cast shadows fading under a closed deck. */
export function resolveHorizonLightingGains(lighting: HorizonLighting): { ambient: number; sunGain: number; shadow: number } {
  const hemiRatio = clamp(lighting.hemi / HORIZON_REF_HEMI, 0.6, 2.0);
  const sunRatio = clamp(lighting.sun / HORIZON_REF_SUN, 0.3, 1.6);
  // (2026-10-05) under a deck the sun term keeps the beam's share and the rest returns as sky light: a level face keeps
  // its light (the vista's sun term 1.05 · N·L, its sky term the ambient on a level face), the faces turned to and from
  // the sun lose the difference the beam made
  const sun = 1.30 * Math.pow(sunRatio, 0.7);
  const direct = clamp(lighting.direct ?? 1, 0, 1);
  return {
    ambient: 0.50 * Math.pow(hemiRatio, 0.8) + sun * (1 - direct) * 1.05 * Math.max(0, lighting.sinEl ?? 0),
    sunGain: sun * direct,
    shadow: 0.85 * (1 - 0.7 * clamp(lighting.cover, 0, 1)),
  };
}

/**
 * Round 72: the sky's chroma for the faces turned from the sun — the fog tint (the rendered sky's horizon average:
 * blue-grey under a clear sky, warm grey under an overcast) normalised to unit luminance and pushed a little, since
 * the tint is pale and a shaded face should still read as sky-lit. The tint is re-normalised to unit luminance after
 * the push, so a shaded face changes hue, never brightness (a saturated blue fog pushed a face's blue to 1.8 x and
 * washed the ranges pale). Shared with Scene Studio's relight (media r5).
 */
export function horizonSkyTint(fog: THREE.Color): THREE.Vector3 {
  const fogLuma = Math.max(1e-3, fog.r * 0.2126 + fog.g * 0.7152 + fog.b * 0.0722);
  const skyTint = new THREE.Vector3(
    Math.max(0.4, 1 + (fog.r / fogLuma - 1) * 1.25), Math.max(0.4, 1 + (fog.g / fogLuma - 1) * 1.25), Math.max(0.4, 1 + (fog.b / fogLuma - 1) * 1.25));
  return skyTint.divideScalar(Math.max(1e-3, skyTint.x * 0.2126 + skyTint.y * 0.7152 + skyTint.z * 0.0722));
}

/** Round 72: the surface atlas as a GPU texture — linear data, angle repeats, radius clamps, mips for the far rows. */
function makeReliefTexture(bake: HorizonReliefBake): THREE.DataTexture {
  const texture = new THREE.DataTexture(bake.data, bake.width, bake.height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.colorSpace = THREE.NoColorSpace;
  texture.name = 'horizon-relief';
  texture.needsUpdate = true;
  return texture;
}

// Round 22 near-field surface (see buildHorizonMaterialSteps): runs after the style's map fragment on
// every style, before the vertex colour multiply. `horizonMarine` (sea aperture) keeps the water smooth.
const HORIZON_NEAR_DETAIL_FRAGMENT = /* glsl */`
        if (uNearDetail > 0.001) {
          float nearW = (1.0 - smoothstep(140.0, 650.0, vHDist)) * uNearDetail * (1.0 - horizonMarine);
          if (nearW > 0.002) {
            vec3 hnN = normalize(vHNrm);
            vec3 awN = abs(hnN);
            awN /= (awN.x + awN.y + awN.z);
            #define HNEAR(s, o) (texture2D(uDetail2, vHPos.xz * (s) + (o)).r * awN.y \
              + texture2D(uDetail2, vHPos.zy * (s) + (o) + vec2(0.31, 0.17)).r * awN.x \
              + texture2D(uDetail2, vHPos.xy * (s) + (o) + vec2(0.73, 0.41)).r * awN.z)
            float nE = HNEAR(0.031, vec2(0.11, 0.83)) - 0.5;
            float nF = HNEAR(0.090, vec2(0.57, 0.23)) - 0.5;
            float nG = HNEAR(0.270, vec2(0.19, 0.67)) - 0.5;
            #undef HNEAR
            float slopeN = 1.0 - clamp(hnN.y, 0.0, 1.0);
            // grain: coarse clumps, crown/boulder-sized patches and fine stipple; steeper faces coarser
            float grain = nE * 0.22 + nF * (0.16 + slopeN * 0.10) + nG * 0.11;
            diffuseColor.rgb *= 1.0 + grain * nearW;
            // steep near faces bare a little rock through the tone, broken by the fields
            float rockN = smoothstep(0.42, 0.70, slopeN + nE * 0.30 + nF * 0.18) * nearW * uNearRock;
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.78, 0.76, 0.74), rockN * 0.6);
            // per-fragment relight against the map sun so near facets stop reading as flat sheets
            float ndlN = dot(hnN, uSunDirW);
            float relN = uNearRel * nearW;
            diffuseColor.rgb *= 1.0 - relN * 0.85 + relN * 1.6 * max(ndlN, 0.0);
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.90, 0.94, 1.07), max(-ndlN, 0.0) * 0.30 * relN);
          }
        }
`;

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
  // Per-fragment forest stands below the treeline: broad stand masses from the
  // 600 m field, opened by the 140 m field, thinning toward the treeline and
  // shed from steep rock, exactly the vertex bake's rules at fragment scale.
  // Per-fragment crest snow above the snowline: noise-broken band edge, held
  // off steep faces, always on the crests; the vertex bake keeps the flat ramp.
  float snowBand = smoothstep(uSnowline, uSnowline + 0.16, hT + nD * 0.07 + nC * 0.05);
  float snowHold = min(1.0, (1.0 - smoothstep(0.38, 0.78, slopeF)) + smoothstep(0.52, 0.80, hT) * 0.9);
  float snowW = snowBand * snowHold * (1.0 - rockW * 0.6) * uSnowFrag;
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * uSnowTint, snowW);
  float standF = smoothstep(0.12 + hT * 0.42, 0.26 + hT * 0.42, 0.5 + nB * 1.1 + nC * 0.7);
  float treeF = 1.0 - smoothstep(uTreeline * 0.80, uTreeline * 1.02, hT + nD * 0.06);
  float forestW = standF * treeF * (1.0 - smoothstep(0.55, 0.85, slopeF)) * (1.0 - rockW * 0.85) * (1.0 - snowW) * uForestFrag;
  diffuseColor.rgb *= mix(vec3(1.0), uForestTint * (0.92 + nD * 0.24), forestW);
  float ndl = dot(hn, uSunDirW);
  float rel = uFragRel * farAtt;
  diffuseColor.rgb *= 1.0 - rel * 0.85 + rel * 1.6 * max(ndl, 0.0);
  diffuseColor.rgb = mix(diffuseColor.rgb,
    diffuseColor.rgb * vec3(0.90, 0.94, 1.07), max(-ndl, 0.0) * 0.32 * farAtt);
}`;

function* buildHorizonMaterialSteps({
  noise: gnoi, banding, snowline, treeline, grainAmp, style, seed, mapId,
  sun, maxHeight: maxH, retainedTextures, base, forest, snow, rock, fog, haze, vista, ground, bareRock, outcrops, relief, lighting,
  terrainBound,
}: HorizonMaterialContext): Generator<void, THREE.MeshBasicMaterial, void> {
  const [lx, ly, lz] = sun;
  const gullyAmp = style === 'alpine' ? 0.06 : style === 'mesa' ? 0.14 : 0.0;
  const detailTex = yield* makeHorizonTextureSteps(gnoi, {
    banding, snowline, treeline, grainAmp, gullyAmp, coolRock: style === 'alpine',
    mesaSurface: style === 'mesa', toneOnly: vista,
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
    const detailNoise = createDetailNoise(mulberry32(((seed ^ 0x0D37) ^ idHash(mapId)) >>> 0));
    const detail2 = yield* makeDetailNoiseTextureSteps(detailNoise);
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
    // r9 (2026-09-12): PER-FRAGMENT TREELINE on the alpine styles. The forest
    // stands used to be baked per vertex only, so on 250 m row spacing every
    // treeline edge interpolated across whole wall triangles ("pale cardboard
    // quads" on Fjord/Glacier Pass). The vertex bake keeps a softened stand
    // field for the canopy belts and distant tone; the fragment pass carries
    // the noise-broken stand edges against the same map treeline. The tint is
    // the authored forest/base ratio, so the palette stays the map's own.
    const forestTint = new THREE.Vector3(
      THREE.MathUtils.clamp(forest.r / Math.max(base.r, 1e-3), 0.25, 1.2),
      THREE.MathUtils.clamp(forest.g / Math.max(base.g, 1e-3), 0.25, 1.2),
      THREE.MathUtils.clamp(forest.b / Math.max(base.b, 1e-3), 0.25, 1.2));
    const forestFrag = style === 'alpine' && treeline > 0 && treeline < 1.5 ? 0.62 : 0.0;
    // The snow band moves with it: the vertex bake keeps a flatter 0.38-0.62
    // coverage ramp and the fragment adds the crest snow with noise-broken
    // edges, again as the authored snow/base ratio.
    const snowTint = new THREE.Vector3(
      THREE.MathUtils.clamp(snow.r / Math.max(base.r, 1e-3), 1.0, 2.2),
      THREE.MathUtils.clamp(snow.g / Math.max(base.g, 1e-3), 1.0, 2.2),
      THREE.MathUtils.clamp(snow.b / Math.max(base.b, 1e-3), 1.0, 2.2));
    const snowFrag = style === 'alpine' && snowline <= 1 ? 0.55 : 0.0;
    // round 22 (owner 2026-09-18: "horizon stuff and map borders … not visibly decrease in quality and
    // texture from our regular maps"): the baked fields above work at 50-300 m; within a few hundred
    // metres of the camera the foothill skirt read as a blurred 5 m-per-texel wall beside a battlefield
    // textured at centimetres. Three more world-anchored triplanar fields (about 4 m, 1.4 m and 0.5 m
    // features), a slope-keyed rock bare and a per-fragment sun relight fade in with camera distance and
    // vanish by 650 m, so the far ranges keep their authored aerial flatness. Desktop only.
    // The alpine world-surface program is exempt: it already carries per-fragment surface fields and
    // its resource receipt pins it to exactly three plane fetches with no branch.
    const nearDetail = getDeviceTier() === 'mobile' || style === 'alpine' ? 0.0 : 1.0;
    const nearRel = 0.22;
    const nearRock = style === 'mesa' ? 0.0 : 1.0;
    // round 22: forest stands and meadow clearings on the visible ranges of the rolling / escarpment styles —
    // from the battlefield the first ranges (600-900 m) read as one flat green wash with a treeline stroke;
    // broad stands from the 312 m field opened by the 83 m field, held off steep faces and the crests and
    // tinted with the map's forest ratio, give them the patchwork real hills carry
    const standFrag = style === 'rolling' || style === 'escarpment' ? 0.72 : 0.0;
    // 2026-10-02 (the frame-budget lane): a terrain-bound ring never draws this material — its relief atlas, canopy
    // tile and haze are all the terrain bands and the ring forest read, so it carries those and no vista program
    if (vista && terrainBound) {
      const canopyTile = createVistaCanopyTile();
      retainedTextures.push(canopyTile.canopy);
      const reliefTexture = relief.bake ? makeReliefTexture(relief.bake) : null;
      if (reliefTexture) retainedTextures.push(reliefTexture);
      const carried: Record<string, THREE.IUniform> = {
        uVRelief: { value: reliefTexture },
        uVReliefR: { value: new THREE.Vector2(relief.bake?.r0 ?? 0, 1 / Math.max(1, (relief.bake?.r1 ?? 1) - (relief.bake?.r0 ?? 0))) },
        uVReliefGrad: { value: relief.bake?.gradScale ?? 1 },
        uVReliefAmp: { value: reliefTexture ? 1 : 0 },
        uVCanopy: { value: canopyTile.canopy },
        uVHaze: { value: haze * (style === 'alpine' ? 0.78 : 0.92) },
      };
      mat.userData.horizonDetailNoise = detailNoise;
      mat.userData.horizonDetail2 = detail2;
      mat.userData.horizonVista = { uniforms: carried, base: base.clone(), canopyMean: canopyTile.canopyMean, skyTint: horizonSkyTint };
      mat.userData.horizonTerrainBound = true;
      return mat;
    }
    // Vista pass (2026-09-19): one layered world-anchored material for every style on the desktop tier — see
    // horizonVista.ts. Tints are ratios to the base tone; amplitudes follow the style's landform language.
    const tiles = vista ? createVistaTiles() : null;
    if (tiles) retainedTextures.push(tiles.meadow, tiles.sand, tiles.canopy, tiles.rock, tiles.scree, tiles.snow);
    // Round 29: the vista tints are absolute linear colours (the fragment divides the base-hued bake back out)
    const rockTint = new THREE.Vector3(rock.r, rock.g, rock.b);
    // Round 72: the baked surface atlas and the sky's chroma for the faces turned from the sun (the fog tint is the
    // rendered sky's horizon average — blue-grey under a clear sky, warm grey under an overcast — normalised to unit
    // luminance and pushed a little, since the tint is pale and a shaded face should still read as sky-lit)
    const reliefTexture = tiles && relief.bake ? makeReliefTexture(relief.bake) : null;
    const gains = resolveHorizonLightingGains(lighting);
    if (reliefTexture) retainedTextures.push(reliefTexture);
    // (the tint is re-normalised to unit luminance after the push, so a shaded face changes hue, never brightness —
    // a saturated blue fog pushed a face's blue to 1.8 x and washed the ranges pale)
    const skyTint = horizonSkyTint(fog);
    const vistaUniforms: Record<string, THREE.IUniform> = tiles ? {
      // round 72: the surface atlas (angle x radius), its radius window and gradient scale; 0 amplitude without a bake
      uVRelief: { value: reliefTexture ?? new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1) },
      uVReliefR: { value: new THREE.Vector2(relief.bake?.r0 ?? 0, 1 / Math.max(1, (relief.bake?.r1 ?? 1) - (relief.bake?.r0 ?? 0))) },
      uVReliefGrad: { value: relief.bake?.gradScale ?? 1 },
      uVReliefAmp: { value: reliefTexture ? 1 : 0 },
      uVAoStrength: { value: relief.settings.aoStrength },
      uVShadow: { value: gains.shadow },
      uVSkyTint: { value: skyTint },
      uVSparkle: { value: snowline <= 1 ? 0.6 : 0 },
      uVDebug: { value: 0 },
      // round 72: the layer's cloud shadow fields, bound per frame by the ring's onBeforeRender (off until bound)
      ...createHorizonCloudShadeUniforms(),
      // round 29: arid rings sample the sand tile as their ground layer
      uVMeadow: { value: ground === 'sand' ? tiles.sand : tiles.meadow }, uVCanopy: { value: tiles.canopy }, uVRock: { value: tiles.rock },
      uVScree: { value: tiles.scree }, uVSnow: { value: tiles.snow },
      // the ground colour becomes the battlefield's own albedo mean once the terrain textures exist
      // (horizonAutumnGround.refreshHorizonGroundTone); the base tone stands in until then
      uVMeadowTint: { value: new THREE.Vector3(base.r, base.g, base.b) },
      uVForestColor: { value: new THREE.Vector3(forest.r, forest.g, forest.b) },
      uVSnowColor: { value: new THREE.Vector3(snow.r, snow.g, snow.b) },
      uVRockTint: { value: rockTint },
      uVScreeTint: { value: rockTint.clone().multiplyScalar(1.18) },
      // round 72: the relief character tunes the style's rock law — a polar range keeps its summits under snow with
      // the scoured ribs alone baring rock (the alpine style's 0.9 peak rock greyed Whiteout's crests), volcanic
      // country bares more of its cones, karst towers stand as limestone walls
      uVRockAmp: { value: relief.settings.character === 'volcanic' || relief.settings.character === 'karst' ? 1.0
        : style === 'alpine' ? 1.0 : style === 'mesa' ? 1.0 : style === 'escarpment' ? 0.85 : 0.55 },
      uVPeakRock: { value: relief.settings.character === 'polar' ? 0.45 : relief.settings.character === 'volcanic' ? 0.6 : relief.settings.character === 'karst' ? 0.5
        : style === 'alpine' ? 0.9 : style === 'mesa' ? 0.5 : style === 'escarpment' ? 0.35 : 0.15 },
      uVScreeAmp: { value: relief.settings.character === 'polar' ? 0.5 : style === 'alpine' ? 0.8 : style === 'mesa' ? 0.7 : style === 'escarpment' ? 0.5 : 0.3 },
      uVForestAmp: { value: treeline > 0 && treeline < 1.5 ? 1.0 : 0.0 },
      uVBump: { value: style === 'alpine' || style === 'mesa' ? 0.9 : style === 'escarpment' ? 0.7 : 0.55 },
      uVHaze: { value: haze * (style === 'alpine' ? 0.78 : 0.92) },
      // round 49: bare upper slopes on the rings that author it (Fjord's cone, Whiteout's wind-scoured crests)
      uVBareRock: { value: bareRock },
      // round 55: knobs and scree through the turf below the treeline on the rings that author it (Fjord)
      uVOutcrop: { value: outcrops },
      uVFogTint: { value: new THREE.Vector3(fog.r, fog.g, fog.b) },
      uVBanding: { value: style === 'mesa' ? Math.max(banding, 0.14) * 1.7 : Math.max(banding, 0.05) },
      // round 72: a polar range bares rock from 37° (wind-scoured faces) — under an overcast its snow reads as the sky's
      // own white, and the dark faces are what makes the range read at all
      uVRockSlope: { value: style === 'mesa' ? new THREE.Vector2(0.16, 0.42) : relief.settings.character === 'polar' ? new THREE.Vector2(0.20, 0.44) : new THREE.Vector2(0.30, 0.58) },
      // absolute colours meet the battlefield's lit ground: a sky term plus a Lambert sun term (about SUN / pi);
      // round 72: both follow the map's own hemisphere and sun (Whiteout's ring read grey beside its fields: the
      // constants were the sunny default's while its snow is lit by a 0.73 hemisphere under a 13° sun)
      uVAmbient: { value: gains.ambient },
      uVSunGain: { value: gains.sunGain },
      // round 32: the authored day colour of this material (1.61, alpine 1.26) — the fragment divides the live
      // colour by it so the night runtime's ×0.20 dim reaches the absolute vista colours
      uVDayDiffuse: { value: mat.color.r },
    } : {};
    mat.userData.horizonDetailNoise = detailNoise;
    mat.userData.horizonDetail2 = detail2; // round 72: the far range's mottle reads the same tile
    if (tiles) mat.userData.horizonVista = { uniforms: vistaUniforms, base: base.clone(), canopyMean: tiles.canopyMean, skyTint: horizonSkyTint };
    // media r5: the ring's sun uniform is one shared object (every compile reads it), so Scene Studio can relight the
    // baked ring for a moved sun and restore it; the battle value is the authored map sun, as before
    const sunDirUniform = { value: new THREE.Vector3(lx, ly, lz) };
    mat.userData.horizonSunDir = sunDirUniform;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, vistaUniforms);
      shader.uniforms.uNearDetail = { value: nearDetail };
      shader.uniforms.uNearRel = { value: nearRel };
      shader.uniforms.uNearRock = { value: nearRock };
      shader.uniforms.uStandFrag = { value: standFrag };
      shader.uniforms.uTreeline = { value: treeline };
      shader.uniforms.uForestTint = { value: forestTint };
      shader.uniforms.uForestFrag = { value: forestFrag };
      shader.uniforms.uSnowline = { value: snowline };
      shader.uniforms.uSnowTint = { value: snowTint };
      shader.uniforms.uSnowFrag = { value: snowFrag };
      shader.uniforms.uDetail2 = { value: detail2 };
      shader.uniforms.uSunDirW = sunDirUniform;
      shader.uniforms.uFragRel = { value: fragRel };
      shader.uniforms.uSlopeSplat = { value: slopeSplat };
      shader.uniforms.uMaxH = { value: maxH * 1.0 };
      shader.uniforms.uWallFix = { value: wallFix };
      shader.uniforms.uCapFix = { value: capFix };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>',
          '#include <common>\nvarying vec3 vHNrm;\nvarying vec3 vHPos;\nvarying float vHDist;')
        .replace('#include <begin_vertex>',
          '#include <begin_vertex>\nvHNrm = normal;\nvHPos = position;\nvHDist = length( ( modelViewMatrix * vec4( position, 1.0 ) ).xyz );');
      // onBeforeCompile uniforms are NOT auto-declared in the GLSL —
      // declared at global scope ahead of the injected block.
      shader.fragmentShader = (tiles ? HORIZON_VISTA_UNIFORM_DECLARATIONS : '') + 'uniform sampler2D uDetail2;\n'
        + 'uniform float uTreeline;\nuniform vec3 uForestTint;\nuniform float uForestFrag;\n'
        + 'uniform float uSnowline;\nuniform vec3 uSnowTint;\nuniform float uSnowFrag;\n'
        + 'uniform vec3 uSunDirW;\nuniform float uFragRel;\n'
        + 'uniform float uSlopeSplat;\nuniform float uMaxH;\n'
        + 'uniform float uWallFix;\nuniform float uCapFix;\n'
        + 'uniform float uNearDetail;\nuniform float uNearRel;\nuniform float uNearRock;\nuniform float uStandFrag;\n'
        + 'varying vec3 vHNrm;\nvarying vec3 vHPos;\nvarying float vHDist;\n' +
        shader.fragmentShader.replace(
          '#include <map_fragment>', tiles ? HORIZON_VISTA_FRAGMENT : style === 'alpine' ? ALPINE_HORIZON_MAP_FRAGMENT : /* glsl */`#include <map_fragment>
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
          if (uStandFrag > 0.001) {
            // round 22 stands: see standFrag above — patchwork on the visible rolling ranges
            vec3 hnS = normalize(vHNrm);
            float slopeS = 1.0 - clamp(hnS.y, 0.0, 1.0);
            float hS = clamp(vHPos.y / max(uMaxH, 1.0), 0.0, 1.0);
            float standS = smoothstep(0.02, 0.16, dB * 1.3 + dA * 0.7 + 0.04);
            float treeS = 1.0 - smoothstep(max(uTreeline, 0.55) * 0.85, max(uTreeline, 0.55) * 1.05, hS);
            float standW = standS * treeS * (1.0 - smoothstep(0.45, 0.80, slopeS)) * uStandFrag;
            diffuseColor.rgb *= mix(vec3(1.0), uForestTint * (0.90 + dA * 0.5), standW);
          }
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
        .replace('#include <color_fragment>', (tiles || style === 'alpine' ? '' : HORIZON_NEAR_DETAIL_FRAGMENT) + /* glsl */`#include <color_fragment>` + (tiles ? HORIZON_VISTA_HAZE_FRAGMENT : '') + /* glsl */`
        // Sea is a sky-reflecting continuation of the bay, not a zero-height
        // forest. Reuse the existing two detail samples as very quiet wave
        // breakup, replacing the degenerate altitude-clamped base texture.
        diffuseColor.rgb = mix(diffuseColor.rgb,
          diffuse * vColor.rgb * (1.0 + horizonWaterVariation), horizonMarine);`);
    };
    // round 55 (2026-09-24): r3 → r4, the below-treeline outcrop term joined the vista program
    mat.customProgramCacheKey = () => tiles ? 'horizon-ring-vista-r4-' + style : style === 'mesa' ? 'horizon-ring-mesa-surface-r3'
      : (style === 'alpine' ? 'horizon-ring-world-surface-r3-' : 'horizon-ring-relief-r3-') + style;
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
  style: HorizonStyle;
  sun: readonly [number, number, number];
  forestCover: Float32Array;
  seaOpenings: readonly HorizonSeaOpening[];
  sea?: HorizonSea;
  base: THREE.Color;
  forest: THREE.Color;
  /** Authored opt-in for terrain-following face belts (default off). */
  faceBelts: boolean;
  /** Round 72: the vista's haze multiplier (uVHaze), so the skyline ribbons haze like the surface under them. */
  hazeAmp?: number;
  /** Round 72: true when the ring renders the vista program (the bake is tone only). */
  vista?: boolean;
}

export const HORIZON_TREELINE_MAX_BELTS = 20;

/**
 * Interpolated ring rows that carry a terrain-following canopy belt on the
 * visible mountain faces. Each authored span between two crests contributes
 * its lower slope, one broken mid-height stand, and, on finely subdivided
 * alpine spans, one high shelf. Pure and deterministic so the resource gate
 * can compute the exact vertex budget from the same rows.
 */
export function selectHorizonFaceBeltRows(rows: readonly HorizonRingRow[]): number[] {
  const belts: number[] = [];
  let runStart = -1;
  for (let ri = 0; ri <= rows.length; ri++) {
    const interpolated = ri < rows.length && rows[ri].interpolated === true;
    if (interpolated && runStart < 0) runStart = ri;
    if (interpolated || runStart < 0) continue;
    const divisions = ri - runStart + 1;
    // The foothill span directly behind the playable rim already meets the
    // battlefield's own trees; spend belts on the ranges behind it.
    const foothill = runStart > 0 && rows[runStart - 1].skirt === true;
    // Finely subdivided alpine spans keep the lower stand and the high shelf;
    // the face shader carries the mass between them, so parallel mid-slope
    // ribbons would only read as contour lines.
    const picks = foothill ? new Set<number>()
      : divisions >= 5 ? new Set([1, divisions - 1]) : new Set([1, Math.ceil(divisions / 2), divisions - 1]);
    for (const pick of [...picks].sort((a, b) => a - b)) {
      if (pick >= 1 && pick <= divisions - 1 && belts.length < HORIZON_TREELINE_MAX_BELTS) {
        belts.push(runStart + pick - 1);
      }
    }
    runStart = -1;
  }
  return belts;
}

function addHorizonTreeline({
  mesh, treeline, seed, mapId, noise: gnoi, rows, positions: pos,
  maxHeight: maxH, snowline, fog: fogC, colors: col, layers: treelineLayers, style, sun, forestCover, seaOpenings, sea,
  base, forest, faceBelts, hazeAmp = 0.9, vista = false,
}: HorizonTreelineContext): void {
  const N = HORIZON_SEGMENTS;
  // round 47: no canopy on a marine vertex whichever rule made it marine (bay contour or sector)
  const seaAt = (index: number, angle: number): number => Math.max(seaOpeningWeight(angle, seaOpenings), sea?.weight[index] ?? 0);
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
        // Round 72: no ribbon on the far crests (aer past 0.3 — the outer rows): the post pass washes those crests to
        // faint silhouettes and a canopy ribbon there stood over nothing as a floating band; the near and middle
        // crests, which still read, keep their forest edge
        const farFade = 1 - smoothstep(0.30, 0.58, row.aer);
        // Round 72: and none on a crest above half the ring's height — the boosted ranges' crests are the ring's
        // high country (the vista's own stands and the instanced ring forest dress their faces); a ribbon there read as
        // a dark band over a pale, hazed summit whatever the authored treeline said
        const crestFade = 1 - smoothstep(0.32, 0.48, height01);
        const span = (9 + hn * 7) * (0.94 + Math.min(row.r, 1400) / 7000) * fade * farFade * crestFade *
          (0.88 + hn2 * 0.24) * (1 - layer * 0.045) * (1 - seaAt(ri * N + kk, a));
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
        // Round 72: the authored ramp stands (0.24 on the first ridge, 0.63 on the outer rows): it tracks the SUM of
        // the material haze and the post pass's far ceilings, which wash the outer rows to a faint silhouette, so a
        // ribbon on a boosted outer crest fades with the crest instead of standing over it as a floating band
        const hz = Math.min(0.94, row.aer * 0.66 + 0.16 + layer * 0.11) * (0.6 + 0.4 * Math.min(1.2, hazeAmp));
        // Round 72: on a vista ring the bake is tone only (the fragment lights the surface), so the ribbon takes
        // the vista's own sky-plus-sun term (about 0.9 of the albedo) over the atlas's 0.22 mean — at the old 1.7 the
        // ribbons stood dark over the boosted, hazed crests, floating bands with nothing under them
        const light = (vista ? 3.0 : 1.7) - layer * 0.08;
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
    // --- terrain-following canopy belts across the visible mountain faces ---
    // The skyline ribbon alone reads as a peak-only fringe. Real ranges carry
    // forest from the valley floor through broken mid-height stands to sparse
    // shelves under the summits. Each belt follows one interpolated ring row
    // (so it climbs and dips with the actual face), wanders up and down the
    // slope with low-frequency noise, and opens into clearings, so no belt
    // resolves as a constant-altitude contour stripe. Belts sit just behind
    // the face: the slope itself hides their roots while their crowns rise
    // against the higher terrain behind them. Back slopes, cliff faces, snow
    // and sea apertures receive no trees. All belts share the skyline atlas,
    // material and draw call.
    const beltRows = faceBelts ? selectHorizonFaceBeltRows(rows) : [];
    const [sunX, sunY, sunZ] = sun;
    // Belt crowns take the same tone as the baked forest cover beneath them
    // (face = vertex color x material gain x 0.62 texture mean; atlas mean is
    // about 0.5). Inside a stand the belt merges with the mass; only its
    // broken top edge shows against the paler slope or sky above. A darker
    // belt read as a contour line drawn across the face.
    const beltLight = style === 'alpine' ? 1.22 : 1.84;
    // r9 (2026-09-12): the alpine face now carries its forest stands per
    // fragment, so its baked vertex colour is paler than the forest it shows.
    // Crowns are conifer mass, not face: tint the belt by the authored
    // forest/base ratio (the same tint the fragment pass applies at full
    // stand) so groves read darker than the slope instead of as pale cutouts.
    const crownTint = style === 'alpine'
      ? [forest.r / Math.max(base.r, 1e-3), forest.g / Math.max(base.g, 1e-3), forest.b / Math.max(base.b, 1e-3)]
        .map((ratio) => 1 - 0.85 + 0.85 * Math.min(1.2, Math.max(0.25, ratio)))
      : [1, 1, 1];
    // Construction-local scratch for one belt row: span, wandered position,
    // and the face's sun response. A row whose every column resolves to a
    // zero span (above the treeline, snowbound, a back slope) is skipped so
    // it costs neither vertices nor bytes.
    const beltSpan = new Float32Array(N + 1);
    const beltXYZ = new Float32Array((N + 1) * 3);
    const beltShade = new Float32Array(N + 1);
    let emittedBelts = 0;
    for (let belt = 0; belt < beltRows.length; belt++) {
      const ri = beltRows[belt];
      const row = rows[ri];
      const farAtt = 1 - smoothstep(700, 1400, row.r) * 0.62;
      const relight = 0.40 * farAtt;
      let maxSpan = 0;
      for (let k = 0; k <= N; k++) {
        const kk = k % N;
        const i = ri * N + kk;
        const iIn = (ri - 1) * N + kk, iOut = (ri + 1) * N + kk;
        const iL = ri * N + (kk - 1 + N) % N, iR = ri * N + (kk + 1) % N;
        const a = (kk / N) * Math.PI * 2;
        // Only camera-facing slopes carry visible forest; steep rock thins it.
        const rise = pos[iOut * 3 + 1] - pos[iIn * 3 + 1];
        const rx = pos[iOut * 3] - pos[iIn * 3], rz = pos[iOut * 3 + 2] - pos[iIn * 3 + 2];
        const slope = rise / Math.max(1, Math.hypot(rx, rz));
        const facing = smoothstep(0.03, 0.14, slope);
        const cliff = 1 - smoothstep(0.72, 1.35, slope);
        // Wander the belt along the face between its neighbouring rows.
        const wander = gnoi.noise(Math.cos(a) * 2.7 + ri * 3.1, Math.sin(a) * 2.7 - ri * 1.3);
        const j = wander > 0 ? iOut : iIn;
        const t = Math.min(0.5, Math.abs(wander) * 0.7);
        const hh = pos[i * 3 + 1] + (pos[j * 3 + 1] - pos[i * 3 + 1]) * t;
        beltXYZ[k * 3] = pos[i * 3] + (pos[j * 3] - pos[i * 3]) * t;
        beltXYZ[k * 3 + 1] = hh;
        beltXYZ[k * 3 + 2] = pos[i * 3 + 2] + (pos[j * 3 + 2] - pos[i * 3 + 2]) * t;
        const height01 = hh / Math.max(1, maxH);
        const stand2 = gnoi.noise(Math.cos(a) * 11.5 - ri * 4.3, Math.sin(a) * 11.5 + ri * 6.1) * 0.5 + 0.5;
        // The baked stand cover of this row's vertex already folds in the
        // clearings, treeline, snow and cliff terms, so crowns rise from the
        // same dark masses the face shows. Coverage gates the crown height
        // rather than scaling it, so clumps keep full-height crowns and
        // clearings open cleanly instead of shrinking toward a stubble line.
        const coverage = facing * cliff * forestCover[i]
          * (1 - seaAt(i, a));
        const density = smoothstep(0.12, 0.50, coverage);
        // Stands, not contour lines: a clump field breaks every belt into
        // separate 100-250 m groves with open ground between them, and each
        // grove carries its own crown height. Continuous ribbons traced the
        // row contour as a pencil line; tall sheets turned the skyline into
        // sawtooth spikes. Groves of mature-conifer height sit inside the
        // baked stand cover and only their broken tops meet the paler slope.
        const clump = gnoi.noise(Math.cos(a) * 21 + ri * 6.3 + 3.7, Math.sin(a) * 21 - ri * 2.9) * 0.5 + 0.5;
        const grove = smoothstep(0.42, 0.56, clump);
        const span = (13 + stand2 * 9 + clump * 4) * (0.94 + Math.min(row.r, 1400) / 7000)
          * density * grove * (0.75 + coverage * 0.25);
        beltSpan[k] = span;
        if (span > maxSpan) maxSpan = span;
        // The face's sun response, matching the alpine surface shader's relight.
        const tx = pos[iR * 3] - pos[iL * 3], ty = pos[iR * 3 + 1] - pos[iL * 3 + 1], tz = pos[iR * 3 + 2] - pos[iL * 3 + 2];
        let nx = ty * rz - tz * rise, ny = tz * rx - tx * rz, nz = tx * rise - ty * rx;
        if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
        const nl = Math.hypot(nx, ny, nz) || 1;
        const ndl = (nx * sunX + ny * sunY + nz * sunZ) / nl;
        beltShade[k] = beltLight * (0.94 + height01 * 0.42)
          * (1 - relight * 0.85 + relight * 1.6 * Math.max(ndl, 0));
      }
      if (maxSpan < 0.5) continue;
      const variant = (profileSeed + 1 + emittedBelts * 5) % HORIZON_TREELINE_ATLAS_VARIANTS;
      const [v0, v1] = atlasRange(variant);
      const repeats = Math.max(8, Math.round((Math.PI * 2 * row.r) / 84)) + (emittedBelts % 3);
      const radialScale = 1.0025 + (emittedBelts & 1) * 0.0012;
      // Dark forest keeps more of its own value through the same air than the
      // pale face behind it; the scene fog and aerial pass add the rest.
      const hz = Math.min(0.94, row.aer * 0.60 + 0.08);
      for (let k = 0; k <= N; k++) {
        const i = ri * N + (k % N);
        const x = beltXYZ[k * 3] * radialScale, hh = beltXYZ[k * 3 + 1], z = beltXYZ[k * 3 + 2] * radialScale;
        cPos.push(x, hh - 2.2, z, x, hh - 2.2 + beltSpan[k], z);
        // Canopy tone: the face's own baked color, darker and greener, then
        // the row's aerial perspective so successive belts separate in depth.
        const light = beltShade[k];
        let cr = Math.min(1.9, col[i * 3] * light * 0.96 * crownTint[0]);
        let cg = Math.min(1.9, col[i * 3 + 1] * light * 1.04 * crownTint[1]);
        let cb = Math.min(1.9, col[i * 3 + 2] * light * 0.90 * crownTint[2]);
        cr += (fogC.r - cr) * hz;
        cg += (fogC.g - cg) * hz;
        cb += (fogC.b - cb) * hz;
        cCol.push(cr, cg, cb, cr, cg, cb);
        const u = (k / N) * repeats + variant * 0.31 + emittedBelts * 0.57;
        cUv.push(u, v0, u, v1);
      }
      for (let k = 0; k < N; k++) {
        const b0 = vBase + k * 2, t0 = b0 + 1, b1 = b0 + 2, t1 = b1 + 1;
        cIdx.push(b0, b1, t0, t0, b1, t1);
      }
      vBase += (N + 1) * 2;
      emittedBelts++;
    }
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
      faceBeltRows: beltRows.length,
      faceBelts: emittedBelts,
      role: 'outer-skyline+face-belts',
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
  bareRock: number;
  outcrops: number;
}

interface HorizonPalette {
  base: THREE.Color;
  fog: THREE.Color;
  rock: THREE.Color;
  snow: THREE.Color;
  forest: THREE.Color;
}

function resolveHorizonStyle(horizon: HorizonConfig, mapId: string): HorizonStyle {
  return horizon.ringStyle || horizon.style || STYLE_BY_MAP[mapId] || 'rolling';
}

function resolveHorizonSettings(
  horizon: HorizonConfig,
  style: HorizonStyle,
): HorizonResolvedSettings {
  const defaultTreeline = style === 'rolling' ? 0.90 : style === 'escarpment' ? 0.88 : 0;
  // r9 (2026-09-12): the alpine styles bake rock at 0.30 instead of 0.78 —
  // their per-fragment rock pass (uSlopeSplat) owns the slope-keyed exposure,
  // so the pale steep-vertex triangles stop interpolating across whole walls.
  const rockAmp = style === 'rolling' ? 0.22 : style === 'escarpment' ? 0.3 : style === 'alpine' ? 0.30 : 0.78;
  return {
    amp: horizon.amp ?? 1,
    haze: horizon.haze ?? 1,
    grainAmp: horizon.grain ?? 1,
    snowline: horizon.snowline ?? (style === 'alpine' ? 0.42 : 2),
    treeline: horizon.treeline ?? defaultTreeline,
    treelineLayers: resolveHorizonTreelineLayers(horizon),
    banding: horizon.banding ?? (style === 'mesa' ? 0.16 : 0),
    rockAmp,
    bareRock: clamp(horizon.bareRock ?? 0, 0, 1),
    outcrops: clamp(horizon.outcrops ?? 0, 0, 1),
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
 * The ring's context (the perf lane, 2026-10-08): its style, settings, palette, noises, relief character and sun — pure
 * functions of the map config and seed, cheap, and rebuilt the same in the horizon ring worker.
 */
function resolveHorizonRingContext(cfg: HorizonMapConfig | null | undefined, seed: number) {
  const H = cfg?.horizon || {};
  const mapId = cfg?.id || 'verdant';
  const style = resolveHorizonStyle(H, mapId);
  const profile = PROFILES[style];
  const {
    amp, haze, grainAmp, snowline, treeline, treelineLayers, banding, rockAmp, bareRock, outcrops,
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

  // Round 72: the map's mountain character — its coarse relief displaces the rows here, its fine relief, occlusion
  // and sun shadows are baked into the surface atlas below, and its far range stands behind the ring
  const reliefCharacter = resolveHorizonReliefCharacter(H, mapId);
  const reliefSettings = resolveHorizonRelief(reliefCharacter);
  const reliefField = resolveHorizonReliefFieldFor(H, mapId, seed);
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
  return { H, mapId, style, profile, amp, haze, grainAmp, snowline, treeline, treelineLayers, banding, rockAmp, bareRock, outcrops, base, fogC, rockC, snowC, forestC, noi, gnoi, reliefCharacter, reliefSettings, reliefField, sunAz, sunEl, lx, ly, lz };
}

type HorizonRingContext = ReturnType<typeof resolveHorizonRingContext>;

/** What the ring's geometry pipeline leaves for the rest of the build: the finished ring and its baked data. */
export interface HorizonRingPipeline {
  ring: HorizonRingGeometry;
  seaOpenings: SeaOpening[];
  sea: HorizonSea;
  reliefBake: HorizonReliefBake | null;
  forestCover: Float32Array;
  colors: Float32Array;
  geometry: THREE.BufferGeometry;
}

/**
 * The ring's geometry pipeline (the perf lane, 2026-10-08): everything from the authored rows to the finished,
 * normal-matched geometry — the seating, the massifs, the escarpments, the continued ground, the passes, the caps, the
 * sea, the relief bake and the baked colours. Pure (no DOM, no renderer, no device tier: `vista` comes in), shared by
 * the inline build (buildHorizonRingSteps) and the horizon ring worker (horizonRingWorker.ts), so EVERY pass that
 * changes the ring's geometry — post-passes included — belongs here and lands in both paths. Material, texture and mesh
 * work belongs to buildHorizonRingSteps.
 */
export function* horizonRingGeometrySteps(
  cfg: HorizonMapConfig | null | undefined,
  seed: number,
  ground?: CanyonGround,
  { vista = getDeviceTier() !== 'mobile', debugColors = false }: { vista?: boolean; debugColors?: boolean } = {},
  context: HorizonRingContext = resolveHorizonRingContext(cfg, seed),
): Generator<void, HorizonRingPipeline, void> {
  const { H, mapId, style, profile, amp, haze, grainAmp, snowline, treeline, banding, rockAmp, base, fogC, rockC, snowC, forestC, noi, gnoi, reliefSettings, reliefField, lx, ly, lz } = context;
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
  const rows0 = horizonRows(style, mapId);
  const initialRing = buildInitialHorizonGeometry(rows0, style, profile, noi, amp, reliefField, H.massif !== false);
  yield;

  // Authored crests keep their silhouette; inserted shoulders and gullies
  // break the huge planar faces. Rebalancing angular/radial resolution makes
  // room for this relief within the previous vertex AND triangle ceilings.
  // Coastal apertures then lower the same annulus into a sea-level apron.
  const ring = subdivideHorizonGeometry(initialRing, style, noi, reliefField);
  // Round 40: the authored aperture plus every opening the square's flattened water derives at its edge
  // (round 49: resolved before the seating, whose headland hand-over reads the openings)
  const seaOpenings = resolveSeaOpenings(H.seaOpening, ground, mapId);
  if (mapId === 'badlands' && H.redrockCanyon !== false) shapeRedrockOutland(ring, ground);
  else if (mapId === 'autumn' && ground) seatHorizonTerrainSeam(ring, ground);
  else if (ground) seatHorizonSkirtOnGround(ring, ground, seaOpenings);
  if (usesFiniteTableCaps(H, mapId, style)) {
    reshapeFiniteTableCaps(ring, amp, mapId === 'titan_gorge' ? 0.60 : 0.64, [1.25, 1.80]);
  }
  if (reliefField) wanderProfileBreaks(ring, reliefField, style, seed);
  yield* carveHorizonMassifsSteps(ring, reliefField, H, mapId, style, seed);
  if (reliefField) enforceLedgerSlopes(ring, style, capFrontRows(ring, H, mapId, style));
  if (ground) seatHorizonTerrainSeam(ring, ground);
  refineCoastRows(ring, seaOpenings, ground);
  // Redrock's continued ground IS its whole outland (the analytic canyon), so its beds are cut after the hand-over
  const canyonOutland = mapId === 'badlands' && H.redrockCanyon !== false;
  if (!canyonOutland) yield* carveHorizonEscarpmentsSteps(ring, H, mapId, style, seed);
  continueHorizonGround(ring, ground, canyonOutland);
  if (canyonOutland) yield* carveHorizonEscarpmentsSteps(ring, H, mapId, style, seed);
  if (H.roadPasses !== false) openRoadPasses(ring, ground);
  // the map-revival lane (2026-10-06): the outer ranges capped into mesas (horizonTablelands.ts), then the dam's canyon
  // and its reservoir as the ring's water (horizonDam.ts)
  if (H.summitCap) capHorizonSummits(ring, H.summitCap, ((seed ^ 0x5C4D) ^ idHash(mapId)) >>> 0, HORIZON_SEGMENTS);
  if (H.dam) carveHorizonDamCanyon(ring, H.dam, HORIZON_SEGMENTS);
  const sea = openHorizonToSea(ring, seaOpenings, ground);
  if (H.dam) floodHorizonDamReservoir(ring, sea, H.dam);
  const { rows, positions: pos, heights: hs, maxHeight: maxH } = ring;
  const uvA = buildHorizonUvs(hs, maxH, sea);
  yield;
  const bakeField = reliefField ?? createHorizonReliefField(((seed ^ 0x7E11) ^ idHash(mapId)) >>> 0, reliefSettings);
  // the mountains lane (2026-10-03): the bake's drainage and landcover take the map's relief seed, its treeline and its
  // snow line (horizonRelief.ts HorizonReliefCover)
  const borderLand = ground as (CanyonGround & {
    getBorderWoodsAt?: (x: number, z: number) => number; _borderParcelAt?: unknown;
  }) | undefined;
  const reliefBake: HorizonReliefBake | null = vista ? yield* bakeHorizonReliefSteps({
    columns: HORIZON_SEGMENTS, rowCount: rows.length, positions: pos, heights: hs, maxHeight: maxH, marine: sea.weight,
    seed: ((seed ^ 0x7E11) ^ idHash(mapId)) >>> 0,
    treelineM: treeline > 0 ? Math.min(treeline, 1.2) * maxH : 0,
    snowlineM: snowline <= 1 ? snowline * maxH : null,
    cover: H.reliefCover === false ? null
      : H.reliefCover ? { forest: 0, canopy: 0.5, fields: 0, ...reliefSettings.cover, ...H.reliefCover } : undefined,
    // the map-borders lane's land use where it is in (feature-detected on the ground): its woods are the stands' field and
    // its parcels the ring's farmland, so the bake adds no second pattern
    woodsAt: borderLand?.getBorderWoodsAt ? (x: number, z: number) => (borderLand.getBorderWoodsAt as (x: number, z: number) => number)(x, z) : null,
    fields: !borderLand?._borderParcelAt,
  }, bakeField, [lx, ly, lz]) : null;
  // detail-texture UVs: u wraps the ring, v = absolute altitude fraction so
  // strata/snow features in the texture land at constant world height
  // --- vertex shading -------------------------------------------------------
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
  const forestCover = new Float32Array(hs.length);
  const col = buildHorizonColors({
    style, rows, heights: hs, maxHeight: maxH, forestCover, vista,
    base, fog: fogC, rock: rockC, snow: snowC, forest: forestC,
    snowline, treeline, banding, rockAmp, haze, grainAmp, noise: gnoi,
    gradients, sun: [lx, ly, lz], seaOpenings, sea,
    redrockCanyon: mapId === 'badlands' && H.redrockCanyon !== false,
  });
  yield;

  // DEBUG: paint each row a flat color to identify geometry in screenshots
  if (debugColors) applyHorizonDebugColors(col, rows.length);
  const geo = buildHorizonGeometry(ring, col, uvA, gradients);
  matchHorizonGroundNormals(geo, ground);
  sharpenHorizonCliffNormals(geo);
  return { ring, seaOpenings, sea, reliefBake, forestCover, colors: col, geometry: geo };
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
  { terrainBound = false, geometry: precomputed = null }: HorizonRingOptions = {},
): Generator<void, THREE.Mesh, void> {
  const context = resolveHorizonRingContext(cfg, seed);
  const { H, mapId, style, haze, grainAmp, snowline, treeline, treelineLayers, banding, bareRock, outcrops, base, fogC, rockC, snowC, forestC, gnoi, reliefCharacter, reliefSettings, reliefField, lx, ly, lz } = context;
  // Round 72: the surface atlas over the finished ring (desktop tier, where the vista program reads it) — the fine
  // relief's gradient, the occlusion and the sun's visibility across the ranges, in slices like the terrain build
  const vista = getDeviceTier() !== 'mobile';
  // (the perf lane, 2026-10-08) the geometry pipeline here or from the horizon ring worker (the same function, the same
  // arrays), then the material half as before
  const { ring, seaOpenings, sea, reliefBake, forestCover, colors: col, geometry: geo } = precomputed
    ?? (yield* horizonRingGeometrySteps(cfg, seed, ground, {
      vista, debugColors: !!(globalThis as typeof globalThis & { __HORIZON_DEBUG?: boolean }).__HORIZON_DEBUG,
    }, context));
  const { rows, positions: pos, heights: hs, maxHeight: maxH } = ring;
  // the map-borders lane: the road exits as they lie on the finished ring (terrain.ts roadExitOnRing) — each runs out at
  // the foot of the ranges unless they opened a pass for it; the farms, villages, avenues and the carriageway attribute
  // (terrain.ts) all read these
  const ringExits = ground?._roadExitOnRing ? ground._roadExitOnRing({ positions: pos, heights: hs }) : null;
  // ... and their right of way: no ring tree or hedge bush stands on a carriageway (the woods open a ride for the road,
  // a hedge a gap where it crosses), ~6.5 m either side of the line wherever the road shows
  const exitClear: [number, number] = [0, 0];
  const roadClearAt = ringExits
    ? (x: number, z: number): number => (ringExits.at(x, z, exitClear)[1] > 0.1 && Math.abs(exitClear[0]) < 6.5 ? 1 : 0) : null;
  // Round 72: the map's lighting for the ring's gains (the sky preset's sun and hemisphere plus the engine's bounce
  // floor, the deck's cover from the cloudscape or the baked deck's opacity)
  const skyCfg = cfg?.sky;
  const cloudsCfg = (cfg as { clouds?: { coverage?: number } } | null | undefined)?.clouds;
  // (2026-10-05: the beam the deck lets through — the light model's overcast cut; the ring, which samples the cloud shade
  // map where the layer draws, takes the cut a deck with gaps leaves to the map's pattern (resolveDeckClosure); the far
  // range and the panorama, beyond any pattern, take the whole average cut)
  // (coupled: OVERCAST_DIRECT_CUT_SHARED is lightModel.ts OVERCAST_DIRECT_CUT, pinned equal by lightModel.selftest — a change
  // to the near beam moves the far land's sun term with it; 0.96 → 0.98 on 2026-10-05 took a closed deck's from 4 % to 2 %)
  const deckPreset = { ...((skyCfg ?? {}) as LightModelPreset), cloudscape: (cfg as { clouds?: LightModelPreset['cloudscape'] } | null | undefined)?.clouds ?? null };
  const deckOvercast = resolveOvercast(deckPreset);
  const lighting: HorizonLighting = {
    sun: skyCfg?.sunIntensity ?? HORIZON_REF_SUN,
    hemi: (skyCfg?.hemiIntensity ?? 0.36) + 0.15,
    cover: clamp(cloudsCfg?.coverage ?? skyCfg?.cloudOpacity ?? 0.3, 0, 1),
    direct: 1 - OVERCAST_DIRECT_CUT_SHARED * deckOvercast * resolveDeckClosure(deckPreset, getDeviceTier() !== 'mobile'),
    sinEl: Math.max(0, ly),
  };
  const farLighting: HorizonLighting = { ...lighting, direct: 1 - OVERCAST_DIRECT_CUT_SHARED * deckOvercast };
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
  const retainedRockGeometries: THREE.BufferGeometry[] = []; // round 32: the outland boulder primitives
  // Round 29: treeless mesa rings (Redrock, Copper Mesa, the desert, Mars, Titan, Skybridge) stand on sand /
  // alluvium; a map can say so explicitly (Sunscar Oasis is a rolling dune field).
  const vistaGround: VistaGround = H.ground ?? (style === 'mesa' && treeline < 0.25 ? 'sand' : 'meadow');
  const mat = yield* buildHorizonMaterialSteps({
    noise: gnoi, banding, snowline, treeline, grainAmp, style, seed,
    mapId,
    sun: [lx, ly, lz], maxHeight: maxH, retainedTextures,
    base, forest: forestC, snow: snowC, rock: rockC, fog: fogC, haze, vista, ground: vistaGround, bareRock, outcrops,
    relief: { bake: reliefBake, settings: reliefSettings }, lighting, terrainBound,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'horizon-ring';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;
  // Round 72: the volumetric layer's cloud shadows reach the ranges — each frame the ring points its cloud-shade
  // uniforms at the layer's live weather fields (by reference: no per-frame copies beyond four numbers; off when the
  // layer is off, has no shadow regime or is not the scene's). The battlefield takes the same clouds' shadows
  // through the cascades' gobos; the ring stands beyond the cascades and reads the fields the gobos read.
  {
    const cloudUniforms = (mat.userData.horizonVista as { uniforms?: Record<string, THREE.IUniform> } | undefined)?.uniforms;
    if (cloudUniforms && cloudUniforms.uVCShade) {
      mesh.onBeforeRender = (_renderer, scene) => {
        bindHorizonCloudShade(cloudUniforms, scene.userData.volumetricClouds as HorizonCloudShadeSource | undefined);
      };
    }
  }
  // GTAO's depth-edge pass draws dark halo slashes along distant ridge
  // silhouettes — exclude the backdrop like the other flat-lit world layers
  mesh.userData.aoExclude = true;
  registerRetainedObject3DResources(mesh, { textures: retainedTextures, geometries: retainedRockGeometries });
  // Vista pass: real trees on the near ring faces where the baked stands are dense (desktop tier)
  const ridgeRow = rows.findIndex((row) => !row.skirt && !row.interpolated);
  mesh.userData.horizonRing = {
    columns: HORIZON_SEGMENTS, ridgeRow,
    // round 72: the character and the bake's measurements, for the probes and the receipts
    relief: reliefCharacter, reliefBake: reliefBake ? { width: reliefBake.width, height: reliefBake.height, ...reliefBake.stats } : null,
    // the map-borders lane: the road exits on this ring, for the carriageway attribute (terrain.ts)
    roadExits: ringExits,
  };
  // media r5: the bake's relief field (a small noise object, non-enumerable so userData dumps stay JSON) with the bake
  // itself and the ring's column count — Scene Studio re-bakes the atlas's sun visibility from the ring geometry for a
  // moved or lower sun, then restores the original. The Studio reaches the bake through the ring, never by import: a
  // Studio import would split this chunk's horizon modules into chunks of their own.
  if (reliefBake) {
    // (the ring worker builds the geometry, and its bake's field, off this thread: the field is the same seeded noise
    // horizonRingGeometrySteps baked with, rebuilt here from the ring's context)
    const bakeField = reliefField ?? createHorizonReliefField(((seed ^ 0x7E11) ^ idHash(mapId)) >>> 0, reliefSettings);
    Object.defineProperty(mesh.userData, 'horizonReliefSource', {
      value: { field: bakeField, maxHeight: maxH, columns: HORIZON_SEGMENTS, bake: bakeHorizonRelief }, enumerable: false,
    });
  }
  // Round 72: the far range — the peaks behind the ring (1.9–3.3 km, inside the cloud dome and the camera's far
  // plane), one unlit vertex-shaded draw with its own aerial perspective; capped under a map's low cloud deck
  if (vista && H.farRange !== false && reliefSettings.far) {
    // the lower of the baked deck's altitude and the volumetric cloudscape's authored base (whichever layer is on, the
    // peaks stay under it); a map that authors neither takes the default deck
    const deckBaseM = Math.min(
      (cfg as { clouds?: { baseM?: number } } | null | undefined)?.clouds?.baseM ?? Infinity, cfg?.sky?.cloudAltM ?? Infinity,
      ...((cfg as { clouds?: { baseM?: number } } | null | undefined)?.clouds?.baseM === undefined && cfg?.sky?.cloudAltM === undefined ? [1400] : []));
    const farRange = buildHorizonFarRange({
      seed: ((seed ^ 0x4A72) ^ idHash(mapId)) >>> 0, settings: reliefSettings.far, character: reliefCharacter,
      deckBaseM, sun: [lx, ly, lz], base, rock: rockC, snow: snowC, forest: forestC, fog: fogC, gains: resolveHorizonLightingGains(farLighting),
      treeline: treeline > 0 && treeline < 1.5 ? treeline : 0, seaOpenings, nearMaxHeight: maxH,
      nearEdge: { columns: HORIZON_SEGMENTS, positions: pos, heights: hs },
      detailTexture: mat.userData.horizonDetail2 as THREE.Texture | undefined,
      massif: H.massif === false ? null : farMassifSettings(resolveMassifSettings(H, reliefSettings.massif)),
      escarpment: farEscarpmentSettings(H, style),
    });
    if (farRange) mesh.add(farRange);
    // the mountains lane (2026-10-03, the owner: "i literally just see a treeline and then nothing transitioning and
    // going into mountains"): the far country 1.5-9 km baked into a cylindrical panorama where a renderer is (the
    // world's warm-up, horizonPanorama.ts) and shown on one shell beyond the ring; the round-72 far range above stays
    // the fallback until the bake has run (the receipts, a renderer without float targets)
    if (H.panorama !== false) {
      const panorama = createHorizonPanorama({
        seed: ((seed ^ 0x9A70) ^ idHash(mapId)) >>> 0, character: reliefCharacter,
        // (Part 1, 2026-10-05: the far country takes the clouds' shadows where the tier has a shade map)
        cloudShade: getDeviceTier() !== 'mobile',
        overrides: typeof H.panorama === 'object' ? H.panorama : undefined,
        palette: { base, rock: rockC, snow: snowC, forest: forestC, fog: fogC },
        sun: [lx, ly, lz], gains: resolveHorizonLightingGains(farLighting), deckBaseM: horizonPanoramaDeckM(cfg, deckBaseM), seaOpenings,
        seaWeightAt: (angle) => {
          const opening = dominantSeaOpening(angle, seaOpenings);
          return { weight: opening ? seaOpeningWeight(angle, opening) : 0, level: opening?.level ?? 0 };
        },
        ringEdge: { columns: HORIZON_SEGMENTS, positions: pos, heights: hs },
        // the ring's snow and (on a mountain ring) forest altitudes — its fractions of its own crest height — so the far
        // country's meet them; the hill countries keep their character's forest cover
        snowlineM: snowline <= 1 ? snowline * maxH : null,
        treelineM: style === 'alpine' && treeline > 0 && treeline < 1.5 ? Math.max(120, treeline * maxH * 1.4) : null,
        // the shared haze law's σ past the shell (hazeLaw.ts): the map's own air
        fogDensity: (cfg?.sky as { fogDensity?: number } | undefined)?.fogDensity ?? null,
        // and its deck's overcast, as the light model will resolve it for this map (the pair ticket of 5ea057f45: the bake
        // read the light model the battlefield still published from the last map, overcast 0 under Whiteout's closed
        // deck, and hazed its far ice sheet toward the clear sky's warm horizon — a beige band)
        overcast: resolveOvercast({ ...((cfg?.sky ?? {}) as LightModelPreset), cloudscape: (cfg as { clouds?: LightModelPreset['cloudscape'] } | null | undefined)?.clouds ?? null }),
        // the aerial pass's haze datum, the ground under the camera (post.ts setGroundHeightSource takes the same field)
        groundAt: ground ? (x: number, z: number) => ground.getHeightAt(x, z) : null,
        // (the nightsky lane, 2026-10-08) the map's sky block with its cloudscape: the day light its gains follow, which
        // relight() measures a battle's sunset or night against
        lightPreset: deckPreset,
      }, farRange);
      mesh.add(panorama.mesh);
      mesh.userData.horizonPanorama = panorama;
    }
  }
  // The species mix and crown palettes follow the map's own rim forest (vegetation.ts rimMix / palettes), so the
  // trees over the edge are the same trees as the ones inside it.
  const vegetation = (cfg as {
    vegetation?: {
      rimMix?: ReadonlyArray<readonly [string, number]>;
      palettes?: Partial<Record<string, { canopy?: Partial<HorizonForestSpeciesPalette> }>>;
    };
  } | null | undefined)?.vegetation;
  const rimMix = vegetation?.rimMix ?? [];
  const rimTotal = rimMix.reduce((sum, [, weight]) => sum + weight, 0);
  const isConifer = (species: string): boolean => HORIZON_CONIFER_SPECIES.has(species);
  const rimConifers = rimMix.filter(([species]) => isConifer(species)).reduce((sum, [, weight]) => sum + weight, 0);
  const leadOf = (conifer: boolean): string | undefined =>
    rimMix.filter(([species]) => isConifer(species) === conifer).slice().sort((a, b) => b[1] - a[1])[0]?.[0];
  const rimConiferLead = leadOf(true), rimBroadleaf = leadOf(false);
  const horizonVista = mat.userData.horizonVista as { uniforms: Record<string, THREE.IUniform>; canopyMean?: THREE.Vector3 } | undefined;
  const vistaUniforms = horizonVista?.uniforms;
  // The map-borders lane (2026-10-03): the farmsteads' yards are chosen before the forest, which stands their shelter
  // trees (borderFarmsteads.ts farmsteadTreesAt); the buildings follow below
  const farmSpec = ground?._borderFarmsteads;
  const farmOptions: BorderFarmsteadOptions | null = vista && ground && farmSpec && farmSpec.count > 0 ? (() => {
    const exit: [number, number] = [0, 0];
    const roadExitAt = ringExits ? ringExits.at : ground._roadExitAt;
    return {
      seed: ((seed ^ 0xFA4D) ^ idHash(mapId)) >>> 0, style: farmSpec.style, count: farmSpec.count, fieldAngle: farmSpec.fieldAngle,
      groundAt: ringSurfaceSampler(HORIZON_SEGMENTS, pos, hs),
      woodsAt: (x: number, z: number) => ground.getBorderWoodsAt?.(x, z) ?? 0,
      blockedAt: (x: number, z: number) => Math.max(ground.getOutlandSeatWeightAt?.(x, z) ?? 0, ground.getOutlandWaterAt?.(x, z)?.wetness ?? 0,
        seaOpenings.length && ringSeaWeight(x, z, Math.atan2(z, x), seaOpenings, ground).weight > 0.01 ? 1 : 0),
      ...(roadExitAt ? { roadDistanceAt: (x: number, z: number) => (roadExitAt(x, z, exit)[1] > 0.05 ? Math.abs(exit[0]) : Infinity) } : {}),
      ...(ringExits ? { roadLines: ringExits.lines } : ground._roadExitLines ? { roadLines: ground._roadExitLines() } : {}),
      // the region's buildings (the square's kit, or its region's): gauntlet wave 30's "American red barns" at Ironworks
      architecture: resolveBorderArchitecture(mapId, (cfg as { props?: { architecture?: string } } | null | undefined)?.props?.architecture,
        mapId === 'winter' || !!(cfg as { props?: { snowCap?: boolean } } | null | undefined)?.props?.snowCap),
    };
  })() : null;
  const farmSites = farmOptions ? selectFarmsteadSites(farmOptions) : [];
  const borderWoodsAt = ground?.getBorderWoodsAt;
  // the hedged stretches of the field boundaries past the edge, on the ring's continued ground (not on the ranges, the sea,
  // the water or a railway's right of way)
  const hedgeLines = vista && ground?._borderHedgeLines ? ground._borderHedgeLines(900, (x, z) =>
    (ground.getBorderHandOverAt?.(x, z) ?? 1) > 0.5 && !(seaOpenings.length && ringSeaWeight(x, z, Math.atan2(z, x), seaOpenings, ground).weight > 0.01)
    && (ground.getOutlandWaterAt?.(x, z)?.wetness ?? 0) < 0.05 && (ground.getOutlandSeatWeightAt?.(x, z) ?? 0) < 0.05
    && !(roadClearAt && roadClearAt(x, z) > 0.5)) : [];
  const treeRows = vista && ground ? borderTreeRows(((seed ^ 0x7E55) ^ idHash(mapId)) >>> 0, hedgeLines,
    ringExits?.lines ?? ground._roadExitLines?.() ?? [], ringExits?.at ?? ground._roadExitAt ?? null) : [];
  const rowSurface = treeRows.length ? ringSurfaceSampler(HORIZON_SEGMENTS, pos, hs) : null;
  const rowGroundAt = rowSurface ? (x: number, z: number): number => {
    for (const site of farmSites) {
      if (Math.abs(x - site.x) < 20 && Math.abs(z - site.z) < 20) return Number.NaN; // the yards
      if (site.church && Math.abs(x - site.church.x) < 22 && Math.abs(z - site.church.z) < 22) return Number.NaN; // a village's church
    }
    return rowSurface(x, z);
  } : undefined;
  const forestGroup = buildHorizonForest({
    columns: HORIZON_SEGMENTS, rows, positions: pos, heights: hs, forestCover, maxHeight: maxH, treeline, snowline,
    forest: forestC, fog: fogC, seed: ((seed ^ 0x51F0) ^ idHash(mapId)) >>> 0,
    coniferShare: rimTotal > 0 ? rimConifers / rimTotal : style === 'alpine' ? 0.95 : style === 'mesa' ? 0.8 : 0.62,
    // round 72c (perf, the clone bench with the forest hidden: Whiteout's ring is 0.27 ms without its trees and 1.5 ms
    // with them — the round-72 polar forest of 6000 band spruces was the whole +0.9 ms over the treeless rolling ring
    // it replaced; 3000 still measured +0.65-0.85): the polar character keeps 1600 instances, clumped by the relief
    // (horizonVista.ts)
    maxInstances: vista ? (reliefCharacter === 'polar' ? 1600 : 8000) : 0, maxRadius: 1050, nearDepth: 300, ridgeRow,
    // the map-borders lane (2026-10-03): the band's woods take the border landform's share (no hedge round the square)
    bandShare: resolveBorderLandform(style, (cfg as { terrain?: { border?: Partial<BorderLandformSettings> } } | null | undefined)?.terrain?.border, mapId).forest,
    ...(borderWoodsAt ? { woodsAt: farmSites.length
      ? (x: number, z: number) => Math.max(borderWoodsAt(x, z), farmsteadTreesAt(farmSites, x, z)) : borderWoodsAt } : {}),
    ...(ground?.getBorderHedgeAt ? { hedgeAt: ground.getBorderHedgeAt } : {}),
    detailNoise: mat.userData.horizonDetailNoise as DetailNoiseSampler,
    // round 72c: the stands follow the coarse relief (clumps in the hollows, gaps on the crests, a wandering treeline)
    ...(reliefField ? { reliefAt: (x: number, z: number) => reliefField.low(x, z) / Math.max(1, reliefField.settings.lowAmpM) } : {}),
    forestAmp: treeline > 0 && treeline < 1.5 ? 1 : 0,
    bareRock, // round 49: the JS twin of the fragment's outcrop ribs keeps crowns off them
    outcrops, // round 55: and off the knobs below the treeline
    canopyMean: horizonVista?.canopyMean, // round 55: the crown mottle centred on the canopy tile's mean
    canopyDetail: vistaUniforms?.uVCanopy?.value as THREE.Texture | undefined,
    // round 63: no ring trees on a railway cutting's outland corridor (the line's right-of-way through the mouth); the
    // map-borders lane: nor on an exit road's carriageway
    ...(ground?.getOutlandSeatWeightAt || seaOpenings.length || roadClearAt ? { clearAt: (x: number, z: number): number =>
      Math.max(ground?.getOutlandSeatWeightAt?.(x, z) ?? 0,
        seaOpenings.length && ringSeaWeight(x, z, Math.atan2(z, x), seaOpenings, ground).weight > 0.03 ? 1 : 0,
        roadClearAt ? roadClearAt(x, z) : 0) } : {}),
    ...(treeRows.length && rowGroundAt ? { treeRows, rowGroundAt } : {}),
    haze: (vistaUniforms?.uVHaze?.value as number | undefined) ?? haze,
    palettes: {
      conifer: rimConiferLead ? vegetation?.palettes?.[rimConiferLead]?.canopy : undefined,
      broadleaf: rimBroadleaf ? vegetation?.palettes?.[rimBroadleaf]?.canopy : undefined,
    },
    retainedTextures,
  });
  if (forestGroup) {
    // lit materials join the cascade through the engine; the forest's own hook chains after the cascade's
    const setup = (_engineCtx as {
      setupShadowMaterial?: (material: THREE.Material, extraHook?: ((shader: unknown, renderer: unknown) => void) | null) => THREE.Material;
    } | null)?.setupShadowMaterial;
    const hook = forestGroup.userData.horizonForestHook as ((shader: unknown) => void) | undefined;
    forestGroup.traverse((object) => {
      const material = (object as THREE.Mesh).material;
      if (setup && material && !Array.isArray(material)) setup.call(_engineCtx, material, hook ? (shader: unknown) => hook(shader) : null);
    });
    mesh.add(forestGroup);
  }
  // The map-borders lane (2026-10-03, gauntlet wave 0: "the border reads as an enclosing clay wall"; the bar is World of
  // Tanks' red-line shots, villages carrying on past the boundary): farmsteads and hamlets on the ring's seated surface
  // past the edge (borderFarmsteads.ts) — off the woods, the sea, a railway's right of way and the exit roads'
  // carriageways, gathered along those roads. One merged mesh, one draw, its shadow in the far cascade only.
  // The map-borders lane (2026-10-03, gauntlet wave 1: "the empty middle distance"): the hedges as bush lines along the
  // hedged stretches of the field boundaries past the edge (hedgeLines, traced before the forest, which stands their
  // belts and the roads' avenues)
  if (hedgeLines.length) {
    const hedges = buildBorderHedgerows({
      seed: ((seed ^ 0x4ED9) ^ idHash(mapId)) >>> 0, lines: hedgeLines, groundAt: ringSurfaceSampler(HORIZON_SEGMENTS, pos, hs),
      palette: horizonBroadleafPalette(rimBroadleaf ? vegetation?.palettes?.[rimBroadleaf]?.canopy : undefined),
    });
    if (hedges) {
      const setup = (_engineCtx as { setupShadowMaterial?: (material: THREE.Material, extraHook?: null) => THREE.Material } | null)?.setupShadowMaterial;
      if (setup) setup.call(_engineCtx, hedges.material as THREE.Material, null);
      mesh.add(hedges);
    }
  }
  // (a ruined city or a country without farmland raises no farm building: its sites stay the copses round them)
  if (farmOptions && farmSites.length && farmSpec?.buildings !== false) {
    const farms = buildBorderFarmsteads({ ...farmOptions, sites: farmSites });
    if (farms) {
      const setup = (_engineCtx as { setupShadowMaterial?: (material: THREE.Material, extraHook?: null) => THREE.Material } | null)?.setupShadowMaterial;
      if (setup) setup.call(_engineCtx, farms.material as THREE.Material, null);
      mesh.add(farms);
    }
  }
  // The map-revival lane (2026-10-06, Skybridge's Glen Canyon Dam): the arch across the canyon cut above, seated on the
  // finished ring (horizonDam.ts) — lit and joined to the cascades like the farmsteads, its shadow in the far cascade.
  // It stands on the seated ring's fine rows: the receipts' bare backdrop (no ground) keeps the canyon and no dam
  if (H.dam && ground) {
    const dam = buildHorizonDam(H.dam, ringSurfaceSampler(HORIZON_SEGMENTS, pos, hs));
    if (dam) {
      const setup = (_engineCtx as { setupShadowMaterial?: (material: THREE.Material, extraHook?: null) => THREE.Material } | null)?.setupShadowMaterial;
      if (setup) setup.call(_engineCtx, dam.material as THREE.Material, null);
      mesh.add(dam);
    }
  }
  // Round 32 (owner 2026-09-21, "redrock still has the noticeable texture/shadow/quality loss beyond the map
  // borders"): the rock and sand outlands carry instanced boulders on the near ring faces — the battlefield's own
  // rock decor stops at the playable edge and the ring forest only serves the wooded maps, so Redrock's outland read
  // as a bare, shadowless sheet. The near class casts real shadows like the battlefield's boulders.
  const rockDensity = H.outlandRocks ?? (style === 'mesa' || H.ground === 'sand' ? 1 : treeline < 0.14 ? 0.55 : 0);
  const rockGroup = vista && rockDensity > 0 ? buildHorizonRockfield({
    columns: HORIZON_SEGMENTS, rows, positions: pos, heights: hs, seed: ((seed ^ 0x2C0C) ^ idHash(mapId)) >>> 0,
    rock: boulderStone(rockC), fog: fogC, haze: (vistaUniforms?.uVHaze?.value as number | undefined) ?? haze,
    density: rockDensity, maxInstances: 3000, maxRadius: 900, nearDepth: 300, ridgeRow,
    // round 72: range boulders only on the near ranges under half the ring, none on a snow map (the trees' rule)
    rangeRadius: snowline <= 1 ? 0 : 880, rangeHeightShare: 0.5, maxHeight: maxH,
    detailNoise: mat.userData.horizonDetailNoise as DetailNoiseSampler,
    retainedGeometries: retainedRockGeometries,
  }) : null;
  if (rockGroup) {
    const setup = (_engineCtx as {
      setupShadowMaterial?: (material: THREE.Material, extraHook?: ((shader: unknown, renderer: unknown) => void) | null) => THREE.Material;
    } | null)?.setupShadowMaterial;
    const hook = rockGroup.userData.horizonRockfieldHook as ((shader: unknown) => void) | undefined;
    rockGroup.traverse((object) => {
      const material = (object as THREE.Mesh).material;
      if (setup && material && !Array.isArray(material)) setup.call(_engineCtx, material, hook ? (shader: unknown) => hook(shader) : null);
    });
    mesh.add(rockGroup);
  }
  // Vista pass: every map renders its near rim bands with the terrain material (terrain.ts bindHorizonGroundBands).
  prepareAutumnHorizonGround(mesh, retainedTextures);

  // --- distant skyline impostor (vegetated styles only) ---------------------
  // One alpha-tested canopy ribbon follows whichever authored ridge actually
  // forms the skyline at each azimuth. It adds a soft forest-scale irregularity
  // against the sky without layering cards over visible ridge faces, and
  // inherits the same baked color/haze grading.
  // Values below 0.14 fade every crown to zero; skip the texture, geometry,
  // and draw call entirely on the intentionally bare desert/canyon maps.
  // The old baked-colour canopy ribbon draws a pale strip over live-lit
  // hills. Continued landscapes already carry the real forest impostors.
  if (!ground?.getOutlandHeightAt) addHorizonTreeline({
    mesh, treeline, seed, mapId, noise: gnoi, rows, positions: pos,
    maxHeight: maxH, snowline, fog: fogC, colors: col, layers: treelineLayers,
    style, sun: [lx, ly, lz], forestCover, seaOpenings, sea,
    base, forest: forestC,
    faceBelts: H.faceBelts === true,
    hazeAmp: (vistaUniforms?.uVHaze?.value as number | undefined) ?? haze,
    vista,
  });
  return mesh;
}

/** Synchronous authoring/capture wrapper over the frame-sliceable runtime build. */
/**
 * The mountains lane (2026-10-03, gauntlet wave 6: the far layers' crests flattened and faded at Verdant's and Frontier
 * Basin's default 1400 m deck): the far panorama's deck — the round-72 deck where the map's cloudscape closes the sky
 * (cover 0.6 or more, or no cloudscape authored), but over scattered clouds (fair-weather cumulus, streets, humilis)
 * the far summits stand among the clouds: the deck rises to 2.6 km, so no crest is capped or faded under it.
 */
export function horizonPanoramaDeckM(cfg: object | null | undefined, deckBaseM: number): number {
  const clouds = ((cfg as { clouds?: unknown } | null | undefined)?.clouds ?? null) as { regime?: string; coverage?: number } | null;
  if (!clouds) return deckBaseM;
  const regime = clouds.regime && Object.prototype.hasOwnProperty.call(CLOUDSCAPE_REGIMES, clouds.regime)
    ? CLOUDSCAPE_REGIMES[clouds.regime as keyof typeof CLOUDSCAPE_REGIMES] : null;
  const cover = clouds.coverage ?? regime?.coverage ?? null;
  return cover !== null && cover < 0.6 ? Math.max(deckBaseM, 2600) : deckBaseM;
}

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

// terrain.ts builds its meshes with this ring without importing it (horizonRingHook.ts).
installHorizonRing({ HORIZON_SEGMENTS, buildHorizonRingSteps, horizonRingGeometrySteps });
