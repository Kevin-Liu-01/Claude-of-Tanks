// src/world/hinterland/field.ts — the Hinterland's one source of height and cover (HL-0, the horizons stream,
// 2026-10-13; B-architecture §4.1).
//
// The old land past the edge had three height sources and a hand-over that wandered 150–750 m out: the outland
// field, the ring's authored rows and the panorama's polar grid. The Hinterland has one: this field, a pure function
// of (x, z) from the map's spec, its seed and the battlefield's own ground, Node-runnable and THREE-free like
// landUse.ts and borderLandform.ts. Its terms, in order (§4.1):
//   1. the battlefield's edge residual, continued and faded over 180 m (horizonSurface.ts continuedGroundAt's law, the
//      residual taken at the edge itself), so the height step at 512 m is zero: the field IS the ground there;
//   2. the near-outland relief: the battlefield's own outland (terrain.ts getOutlandHeightAt — borderLandform's hills,
//      the map's macro relief and its rim lift), unchanged near the edge so the first ~700 m keep what the owner
//      sees, easing past it into the region's own outland relief round the edge's datum;
//   3. land-use and settlement flattening: yards, plots and works levelled, roads and rails graded along their lines
//      (the outland planner's features; absent, nothing is flattened);
//   4. the landform primitives (landforms.ts, HL-2) and 5. the far forms by sector (far.ts, HL-2) — hooks here;
//   6. water levels: the sea past its coast, lakes, rivers, canals and floods;
//   7. the earth's curvature is applied in the vertex shader instead (project.ts), so this field stays planar.
// coverAt classifies the surface (fields and their crops from the map's own land use, pasture, woods, hedges, rock,
// scree, snow, sand, water, settlement ground, roads, rails); geologyAt gives the strata phase, the rock share and the
// snow. No Math.random, no allocation per query (callers own their outputs).
import { createLandFieldSample, landUseAt, resolveLandUseProfile, type LandFieldSample, type LandUseProfile } from '../landUse.ts';
import { arcWeight, hinterlandBearing, hinterlandPoint, type HinterlandSpec, type HinterlandWaterConfig } from './spec.ts';
import { fbm2, hash12, hashString, noise2, seedOffset, smoothstep } from './noise.ts';

/** The square's terrain edge (TERRAIN_HALF_EXTENT_M) and its playable edge. */
export const HINTERLAND_EDGE_M = 512;
/** Terms 4 and 5 rise from the edge at no more than this slope (tan 32°). */
const RELIEF_EDGE_SLOPE = 0.62;
/** Term 1: the battlefield's residual fades out over this many metres past the edge (continuedGroundAt's law). */
export const HINTERLAND_RESIDUAL_FADE_M = 180;
/** Term 2: the battlefield's own outland holds to this far past the edge, then eases into the region's relief. */
export const HINTERLAND_NEAR_HOLD_M = 700;
export const HINTERLAND_NEAR_EASE_M = 1600;

/** The ground the field continues (terrain.ts HeightField, or a receipt's stand-in). */
export interface HinterlandGround {
  getHeightAt(x: number, z: number): number;
  getOutlandHeightAt?(x: number, z: number): number;
  getBorderWoodsAt?(x: number, z: number): number;
  getBorderHedgeAt?(x: number, z: number): number;
}

/** Surface classes (the surface atlas stores these ids, §4.1). */
export const HL_COVER = Object.freeze({
  field: 0, pasture: 1, woods: 2, rock: 3, scree: 4, snow: 5, sand: 6, water: 7, settlement: 8, road: 9, rail: 10,
  marsh: 11, heath: 12, dike: 13,
} as const);
export type HinterlandCoverClass = (typeof HL_COVER)[keyof typeof HL_COVER];

export interface HinterlandCover {
  /** The dominant class (HL_COVER). */
  cls: number;
  /** The field's crop (landUse.ts LandCropId), 31 where no field. */
  crop: number;
  /** The field's id (a stable integer) for the material's per-field tone, 0 where none. */
  fieldId: number;
  woods: number;
  hedge: number;
  wet: number;
  rock: number;
  scree: number;
  snow: number;
  settle: number;
  road: number;
  /** A field's signed offsets (m, the land-use grid's u / v axes) to its nearer edge across each axis (landUse.ts
   * LandFieldSample sU / sV): the surface bake stores them so the material draws the parcels' edges straight at any
   * distance. 1e9 where no field. */
  edgeU: number;
  edgeV: number;
}

export function createHinterlandCover(): HinterlandCover {
  return { cls: 0, crop: 31, fieldId: 0, woods: 0, hedge: 0, wet: 0, rock: 0, scree: 0, snow: 0, settle: 0, road: 0, edgeU: 1e9, edgeV: 1e9 };
}

export interface HinterlandGeologySample {
  /** The strata phase (beds counted up from the datum along the dip; its fraction is the place within a bed). */
  strata: number;
  /** 0..1 bare rock by slope and the landform's own geology. */
  rock: number;
  /** 0..1 snow by altitude, slope and aspect. */
  snow: number;
  /** 0..1 sand on the low ground (deserts). */
  sand: number;
  /** The rock's colour here (the region's, or the landform's own). */
  rockHex: number;
  /** 0..1 where a landform's forest belt allows woods (-1: the region's altitude band governs). */
  forest: number;
  /** 0..1 in a gully or a couloir (the woods leave gaps down them, the snow lingers in them). */
  gully: number;
  /** 0..1 where snow can lie at all here (off the steep faces and the scoured crags): a landform's snow line is held by it. */
  snowHold: number;
}

export function createHinterlandGeology(): HinterlandGeologySample {
  return { strata: 0, rock: 0, snow: 0, sand: 0, rockHex: 0, forest: -1, gully: 0, snowHold: 1 };
}

export interface HinterlandWaterSample {
  /** 0..1 open water. */
  wet: number;
  /** The water surface (m). */
  level: number;
  /** HinterlandWaterConfig['kind'] index: 0 none, 1 sea, 2 lake, 3 river, 4 canal, 5 flood. */
  kind: number;
  /** The sea's ice cover there (HinterlandWaterConfig.ice), 0 open water. */
  ice?: number;
}

export function createHinterlandWater(): HinterlandWaterSample {
  return { wet: 0, level: 0, kind: 0 };
}

/** Term 3's features: what the outland planner levels and grades (outland.ts writes them). */
export interface HinterlandFlatPad {
  x: number; z: number;
  /** The level's radius (m) and the feather beyond it. */
  r: number; featherM: number;
  /** The level (m); NaN levels at the base height under the centre. */
  y: number;
  kind: 'settlement' | 'yard' | 'works';
}
export interface HinterlandGradeLine {
  xs: ArrayLike<number>; zs: ArrayLike<number>;
  /** The graded half-width and the shoulder's feather (m). */
  halfWidthM: number; featherM: number;
  /** The crown over the smoothed grade (m; a dike road's 1 m bank). */
  crownM: number;
  kind: 'road' | 'rail' | 'track';
}
export interface HinterlandPlanFeatures {
  pads: readonly HinterlandFlatPad[];
  lines: readonly HinterlandGradeLine[];
}

/** Terms 4 and 5 (HL-2): an added height and its cover, from the landforms and the far sectors. */
export interface HinterlandReliefTerm {
  /** Metres added to the base at (x, z) (negative for valleys and notches). `texelM` (0: full detail): the size of
   * the sample the caller bakes, so a term can leave out octaves too fine to show there. */
  heightAt(x: number, z: number, base: number, texelM?: number): number;
  /** 0..1 how much of this term's own geology governs (x, z), and its cover hints, written into `out`. */
  geologyAt?(x: number, z: number, out: HinterlandGeologySample, slopeDeg?: number): number;
}

export interface HinterlandField {
  readonly spec: HinterlandSpec;
  readonly seed: number;
  /** The level the battlefield's ground holds at the edge on each bearing (m), the regional relief's datum. */
  datumAt(azDeg: number): number;
  /** Terms 1, 2, 4 and 5: the land before it is levelled and flooded. */
  baseHeightAt(x: number, z: number): number;
  /** Every term: the height the mesh draws (m, planar; curvature in the shader). `texelM`: the bake's sample size
   * (far terms leave out octaves finer than it; 0 or absent: full detail). */
  heightAt(x: number, z: number, texelM?: number): number;
  /** The height the land mesh draws: the ground, or over open water its surface (the sea, a lake, a flood stand level). */
  displayHeightAt(x: number, z: number, texelM?: number): number;
  /** The last displayHeightAt's base height (terms 1, 2, 4, 5 before the water and the levelling; NaN inside the
   * square): the pyramid bake keeps it so the surface bake need not evaluate the relief again. */
  readonly lastDisplayBase: number;
  waterAt(x: number, z: number, out: HinterlandWaterSample): HinterlandWaterSample;
  coverAt(x: number, z: number, out: HinterlandCover, slopeDeg?: number, height?: number, base?: number): HinterlandCover;
  geologyAt(x: number, z: number, out: HinterlandGeologySample, slopeDeg?: number, height?: number): HinterlandGeologySample;
  /** Term 3's features in force (empty until the planner's are given). */
  readonly features: HinterlandPlanFeatures;
  /** The map's land use as it runs on past the edge (its own profile, or the region's). */
  readonly landUse: LandUseProfile | null;
  /** 0..1 on a hedge's line past the edge (the land use's hedged boundaries, the border's hedgerows near the edge) —
   * coverAt's hedge without the rest of the cover (the near band's hedge trees ask it on a fine lattice). */
  hedgeAt(x: number, z: number): number;
  /** The same field with the planner's features levelled in (term 3). */
  withFeatures(features: HinterlandPlanFeatures): HinterlandField;
}

export interface HinterlandFieldOptions {
  /** Terms 4 and 5 (HL-2). */
  relief?: readonly HinterlandReliefTerm[];
  /** Term 3. */
  features?: HinterlandPlanFeatures;
}

const EMPTY_FEATURES: HinterlandPlanFeatures = Object.freeze({ pads: Object.freeze([]), lines: Object.freeze([]) });
const WATER_KIND: Readonly<Record<HinterlandWaterConfig['kind'], number>> = Object.freeze({ sea: 1, lake: 2, river: 3, canal: 4, flood: 5 });

/** The region's own land use where the map has no profile (a row in the region's field system, its own salt). */
function regionLandUse(spec: HinterlandSpec, seed: number): LandUseProfile | null {
  const own = resolveLandUseProfile(spec.mapId);
  if (own) return own;
  const land = spec.region.land;
  if (!land || spec.outland.fields <= 0) return null;
  const rand = hash12(seed * 0.01 + 3.1, hashString(spec.mapId) * 1e-6);
  const polder = land === 'polder' || land === 'paddy';
  return {
    strength: 1, heading: (rand - 0.5) * 1.2, blockU: polder ? 240 : 190, blockV: polder ? 70 : 120, maxSplit: 3,
    marginM: 2.2, trackShare: 0.45, hedgeShare: Math.min(0.8, spec.outland.hedges * 0.7), warpM: polder ? 0 : 24,
    region: land, salt: 211 + (hashString(spec.mapId) % 97),
  };
}

/** A sea or a flood is a coast in the world, not a sector: the water lies past a coastline at `coastM` from the
 * centre, square to the normal bearing (the arc's middle), wandering along its length, and (a channel or an estuary)
 * a far shore `widthM` beyond it. A radial sector drew right-angle shores at its ends (D9). */
interface ResolvedSea { nx: number; nz: number; coastM: number; wanderM: number; widthM: number; level: number; ice: number; salt: number }
interface ResolvedLake { x: number; z: number; r: number; level: number; salt: number }
interface ResolvedChannel { xs: Float64Array; zs: Float64Array; halfW: number; levels: Float64Array; minX: number; maxX: number; minZ: number; maxZ: number; kind: number }
interface ResolvedFlood { nx: number; nz: number; level: number; fromM: number; salt: number }

/** The unit normal (world XZ) of an arc's middle bearing. */
function arcNormal(arc: readonly [number, number]): [number, number] {
  const span = ((arc[1] - arc[0]) % 360 + 360) % 360;
  const mid = ((arc[0] + span / 2) * Math.PI) / 180;
  return [Math.sin(mid), Math.cos(mid)];
}

/** Distance from (x, z) to a polyline and the arc-length parameter's segment and t (written to `hit`). */
function polylineDistance(xs: ArrayLike<number>, zs: ArrayLike<number>, x: number, z: number, hit: { i: number; t: number }): number {
  let best = Infinity;
  for (let i = 0; i + 1 < xs.length; i++) {
    const ax = xs[i], az = zs[i], bx = xs[i + 1] - ax, bz = zs[i + 1] - az;
    const len2 = bx * bx + bz * bz;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / len2)) : 0;
    const d = Math.hypot(x - ax - bx * t, z - az - bz * t);
    if (d < best) { best = d; hit.i = i; hit.t = t; }
  }
  return best;
}

/** A coarse bucket grid over features, so term 3 asks only the few near a point. */
class Buckets<T> {
  private readonly cells = new Map<number, T[]>();
  private readonly size: number;
  constructor(size: number) { this.size = size; }
  private key(cx: number, cz: number): number { return (cx + 4096) * 8192 + (cz + 4096); }
  add(item: T, minX: number, minZ: number, maxX: number, maxZ: number): void {
    const s = this.size;
    for (let cx = Math.floor(minX / s); cx <= Math.floor(maxX / s); cx++) {
      for (let cz = Math.floor(minZ / s); cz <= Math.floor(maxZ / s); cz++) {
        const k = this.key(cx, cz);
        let list = this.cells.get(k);
        if (!list) this.cells.set(k, list = []);
        list.push(item);
      }
    }
  }
  at(x: number, z: number): readonly T[] | undefined {
    return this.cells.get(this.key(Math.floor(x / this.size), Math.floor(z / this.size)));
  }
}

/**
 * The Hinterland's field for a resolved spec, its seed (the ring's 1337: the battlefield's outland keeps the terrain
 * seed and is never re-rolled; the region's new relief takes the map's place seed beside it) and the battlefield's ground.
 */
export function createHinterlandField(
  spec: HinterlandSpec, seed: number, ground: HinterlandGround, options: HinterlandFieldOptions = {},
): HinterlandField {
  const placeSeed = (seed ^ hashString(`hinterland:${spec.mapId}`)) >>> 0;
  const [rox, roz] = seedOffset(placeSeed, 11);
  const [wox, woz] = seedOffset(placeSeed, 23);
  const [cox, coz] = seedOffset(placeSeed, 37);
  const relief = options.relief ?? [];
  const features = options.features ?? EMPTY_FEATURES;
  const landUse = regionLandUse(spec, seed);
  const outlandAt = ground.getOutlandHeightAt ? ground.getOutlandHeightAt.bind(ground) : ground.getHeightAt.bind(ground);
  // (term 1's edge residual table, filled on its first use: residualTable below)
  const RES_STEP = 0.5, RES_N = Math.round((2 * HINTERLAND_EDGE_M) / RES_STEP) + 1;
  let resTable: Float32Array[] | null = null;

  // ---- term 1 and 2's datum: the level the battlefield's outland holds on each bearing at the hand-over (128 bearings,
  // a radial band 600–800 m past the edge, smoothed round the compass), so the region's relief sits on the map's own land
  const DATUM_N = 128;
  const datum = new Float64Array(DATUM_N);
  {
    const raw = new Float64Array(DATUM_N);
    for (let i = 0; i < DATUM_N; i++) {
      const az = (i / DATUM_N) * 360, a = az * Math.PI / 180;
      let sum = 0, n = 0;
      // (a place's own datum, 2026-10-17: 'edge' reads the level at the edge itself — Skybridge's slickrock runs on at the
      // rim's level where the square's old border raised the ring's plateau 560-840 m out; a number is the level outright)
      const datumMode = spec.outland.datum ?? 'handover';
      if (typeof datumMode === 'number') { raw[i] = datumMode; continue; }
      const [d0, d1, dd] = datumMode === 'edge' ? [0, 80, 20] : [560, 840, 70];
      for (let d = d0; d <= d1; d += dd) {
        const rr = HINTERLAND_EDGE_M + d;
        // (on the square's own frame: a bearing's ray meets the edge's square, then runs out d past it)
        const sx = Math.sin(a), sz = Math.cos(a), k = rr / Math.max(Math.abs(sx), Math.abs(sz));
        sum += outlandAt(sx * k, sz * k); n++;
      }
      raw[i] = sum / n;
    }
    for (let i = 0; i < DATUM_N; i++) {
      let s = 0, w = 0;
      for (let k = -6; k <= 6; k++) { const wt = 7 - Math.abs(k); s += raw[(i + k + DATUM_N) % DATUM_N] * wt; w += wt; }
      datum[i] = s / w;
    }
  }
  function datumAt(azDeg: number): number {
    const f = (((azDeg % 360) + 360) % 360) / 360 * DATUM_N, i = Math.floor(f), t = f - i;
    return datum[i % DATUM_N] * (1 - t) + datum[(i + 1) % DATUM_N] * t;
  }
  const edgeOutOf = (x: number, z: number): number => Math.max(Math.abs(x), Math.abs(z)) - HINTERLAND_EDGE_M;

  // ---- the region's outland relief past the near band: domain-warped fBm, swells at the outland's wavelength, its
  // amplitude growing from the rise's low end near the hold to its high end a kilometre farther out; flat regions
  // (polders, deltas) keep a few metres of drainage swell and leave the frame to their dikes and tree rows
  const [riseLo, riseHi] = spec.outland.riseM;
  const invL = 1 / Math.max(150, spec.outland.wavelengthM);
  const ridged = Math.max(0, Math.min(1, spec.geology.erosion));
  const reliefArcs = spec.outland.reliefArcs ?? [];
  // term 2's hold and ease for this place (default HINTERLAND_NEAR_HOLD_M / HINTERLAND_NEAR_EASE_M)
  const [nearHoldM, nearEaseM] = spec.outland.nearHold ?? [HINTERLAND_NEAR_HOLD_M, HINTERLAND_NEAR_EASE_M];
  function regionalRelief(x: number, z: number, edgeOut: number): number {
    const wx = x + 0.35 * spec.outland.wavelengthM * noise2(x * invL * 0.37 + wox, z * invL * 0.37 + woz);
    const wz = z + 0.35 * spec.outland.wavelengthM * noise2(x * invL * 0.37 - woz, z * invL * 0.37 + wox);
    const n0 = fbm2(wx * invL + rox, wz * invL + roz, 4);
    const shaped = n0 * (1 - ridged) + ((1 - Math.abs(n0)) * 2 - 1.1) * ridged;
    let amp = riseLo + (riseHi - riseLo) * smoothstep(nearHoldM, nearEaseM + 900, edgeOut);
    // (a quiet arc: the relief scaled on its bearings, eased over 12°)
    if (reliefArcs.length) {
      const b = hinterlandBearing(x, z);
      let k = 1;
      for (const arc of reliefArcs) k = Math.min(k, 1 + (arc.scale - 1) * arcWeight(b, arc.azDeg, 12));
      amp *= k;
    }
    return amp * (0.5 + 0.5 * shaped);
  }
  /**
   * A flat place's relief (polders, deltas, mangrove coasts; region.outland.flat): pancake-flat land a few decimetres
   * either way over kilometres, broken only by its creek ridges (Zeeland's kreekruggen: the old tidal creeks' sand beds
   * standing a metre or two over the clay that settled round them, sinuous, a hundred metres across). The dykes and
   * the dunes are landforms of their own; nothing else undulates.
   */
  const flat = spec.outland.flat;
  const creekL = Math.max(400, spec.outland.wavelengthM * 0.6);
  function flatRelief(x: number, z: number): number {
    const wx = x + 0.3 * creekL * noise2(x / (creekL * 1.7) + wox, z / (creekL * 1.7) + woz);
    const wz = z + 0.3 * creekL * noise2(x / (creekL * 1.7) - woz, z / (creekL * 1.7) + wox);
    const n = noise2(wx / creekL + rox, wz / creekL + roz);
    const creek = smoothstep(0.8, 0.96, 1 - Math.abs(n)) * (0.55 + 0.45 * noise2(x / 900 - roz, z / 900 + rox));
    const swell = 0.5 * fbm2(x / 3200 + roz, z / 3200 - rox, 2);
    return riseLo * swell + riseHi * Math.max(0, creek);
  }

  // ---- term 6: the water, resolved to world geometry once
  const seas: ResolvedSea[] = [], lakes: ResolvedLake[] = [], channels: ResolvedChannel[] = [], floods: ResolvedFlood[] = [];
  spec.water.forEach((w, index) => {
    const salt = 101 + index * 17;
    if (w.kind === 'sea') {
      const [nx, nz] = arcNormal(w.arc?.azDeg ?? [180, 180]);
      seas.push({ nx, nz, coastM: w.coastM ?? 2400, wanderM: w.coastWanderM ?? 450, widthM: w.widthM ?? Infinity, level: w.level ?? -1, ice: Math.max(0, Math.min(1, w.ice ?? 0)), salt });
    } else if (w.kind === 'lake' && w.at) {
      const p = hinterlandPoint(w.at);
      lakes.push({ x: p.x, z: p.z, r: w.radiusM ?? 300, level: w.level ?? baseNoWater(p.x, p.z) - 0.5, salt });
    } else if (w.kind === 'flood') {
      const [nx, nz] = arcNormal(w.arc?.azDeg ?? [270, 270]);
      floods.push({ nx, nz, level: w.level ?? 0, fromM: w.coastM ?? 700, salt });
    } else if (w.kind === 'river' || w.kind === 'canal') {
      let pts: { x: number; z: number }[];
      if (w.path && w.path.length >= 2) pts = w.path.map((at) => hinterlandPoint(at, { x: 0, z: 0 }));
      else {
        // from the edge on a bearing, meandering out to 6 km (a river) or straight (a canal)
        const az = w.toAzDeg ?? 0;
        pts = [];
        for (let d = HINTERLAND_EDGE_M; d <= 6000; d += 150) {
          const wander = w.kind === 'river' ? 9 * noise2(d / 1400 + salt, salt * 0.3) : 0;
          pts.push(hinterlandPoint({ azDeg: az + wander * Math.min(1, (d - HINTERLAND_EDGE_M) / 800), distM: d }, { x: 0, z: 0 }));
        }
      }
      const xs = Float64Array.from(pts, (p) => p.x), zs = Float64Array.from(pts, (p) => p.z);
      // the level along the line: the base land under it, run down to a monotone fall (water never climbs), 1.4 m under
      // a river's banks and 0.8 m under a canal's
      const levels = new Float64Array(pts.length);
      let run = Infinity;
      for (let i = 0; i < pts.length; i++) {
        const b = baseNoWater(xs[i], zs[i]) - (w.kind === 'river' ? 1.4 : 0.8);
        run = Math.min(run, b);
        levels[i] = w.level ?? run;
      }
      channels.push({
        xs, zs, halfW: (w.widthM ?? (w.kind === 'river' ? 24 : 10)) / 2, levels,
        minX: Math.min(...xs) - 120, maxX: Math.max(...xs) + 120, minZ: Math.min(...zs) - 120, maxZ: Math.max(...zs) + 120,
        kind: WATER_KIND[w.kind],
      });
    }
  });
  const hit = { i: 0, t: 0 };

  /** Terms 1, 2, 4 and 5 (no water carving, no levelling). */
  function baseNoWater(x: number, z: number, texelM = 0): number {
    const edgeOut = edgeOutOf(x, z);
    if (edgeOut <= 0) return ground.getHeightAt(x, z);
    let h: number;
    if (flat) {
      // a flat place does not continue the battlefield's outland: its hills are the old rim's (borderLandform's hill
      // noise and the map's macro relief evaluated past the square), not the polder's. The land past the edge is the
      // level the edge holds on its bearing (the datum: the old land in the west still a little higher than the new
      // polders in the east), with the square's own edge eased into it over the residual's 180 m
      h = datumAt(hinterlandBearing(x, z)) + flatRelief(x, z);
      if (edgeOut < HINTERLAND_RESIDUAL_FADE_M) {
        h += edgeResidual(x, z, edgeOut, (ex, ez) => datumAt(hinterlandBearing(ex, ez)) + flatRelief(ex, ez))
          * (1 - smoothstep(0, HINTERLAND_RESIDUAL_FADE_M, edgeOut));
      }
      return addRelief(x, z, h, edgeOut, texelM);
    }
    // term 2's ease: the battlefield's outland near, the region's relief round the datum far
    const ease = smoothstep(nearHoldM, nearEaseM, edgeOut);
    if (ease >= 1) h = datumAt(hinterlandBearing(x, z)) + regionalRelief(x, z, edgeOut);
    else {
      let near = outlandAt(x, z);
      // term 1: the battlefield's residual at the edge point this one clamps to, faded over 180 m
      if (edgeOut < HINTERLAND_RESIDUAL_FADE_M) {
        near += edgeResidual(x, z, edgeOut, outlandAt) * (1 - smoothstep(0, HINTERLAND_RESIDUAL_FADE_M, edgeOut));
      }
      h = ease > 0 ? near + (datumAt(hinterlandBearing(x, z)) + regionalRelief(x, z, edgeOut) - near) * ease : near;
    }
    return addRelief(x, z, h, edgeOut, texelM);
  }
  /**
   * Term 1's residual: the battlefield's edge height over the land the field continues there, at the edge point (x, z)
   * clamps to — taken at the edge itself, where the battlefield's last vertices stand, so the step at 512 m is zero (the
   * ring's continuedGroundAt clamped half a metre inside, which left the shoulder's last half metre as a step) — and
   * averaged along the edge over a window that widens with the distance out, so the square's edge relief eases out as a
   * shoulder instead of running on in straight streaks square to the edge (and fanning at the corners).
   */
  // (the residual along the four edges, tabled once at 0.5 m: a bake asks it of every sample in the 180 m band, three
  // times each — 160 thousand of the battlefield's height queries a bake before the table)
  function residualTable(landAt: (x: number, z: number) => number): Float32Array[] {
    if (resTable) return resTable;
    const E = HINTERLAND_EDGE_M;
    resTable = [0, 1, 2, 3].map((side) => {
      const t = new Float32Array(RES_N);
      for (let i = 0; i < RES_N; i++) {
        const a = -E + i * RES_STEP;
        const [px, pz] = side === 0 ? [E, a] : side === 1 ? [-E, a] : side === 2 ? [a, E] : [a, -E];
        t[i] = ground.getHeightAt(px, pz) - landAt(px, pz);
      }
      return t;
    });
    return resTable;
  }
  function edgeResidual(x: number, z: number, edgeOut: number, landAt: (x: number, z: number) => number): number {
    const E = HINTERLAND_EDGE_M;
    const ex = Math.max(-E, Math.min(E, x)), ez = Math.max(-E, Math.min(E, z));
    const table = residualTable(landAt);
    const at = (px: number, pz: number): number => {
      const side = px >= E ? 0 : px <= -E ? 1 : pz >= E ? 2 : 3;
      const f = ((side < 2 ? pz : px) + E) / RES_STEP, i = Math.max(0, Math.min(RES_N - 2, Math.floor(f))), t = f - i;
      const row = table[side];
      return row[i] + (row[i + 1] - row[i]) * t;
    };
    const r0 = at(ex, ez);
    if (edgeOut < 2) return r0;
    // the edge's tangent at the clamped point (along z on an east or west edge, along x on a north or south one)
    const alongZ = Math.abs(ex) >= E && Math.abs(ez) < E;
    const w = Math.min(60, 0.45 * edgeOut);
    const clampE = (v: number): number => Math.max(-E, Math.min(E, v));
    const a = alongZ ? at(ex, clampE(ez - w)) : at(clampE(ex - w), ez);
    const b = alongZ ? at(ex, clampE(ez + w)) : at(clampE(ex + w), ez);
    return 0.5 * r0 + 0.25 * (a + b);
  }
  /** Terms 4 and 5: the landforms and the far forms, each fading in from 20–120 m past the edge. */
  function addRelief(x: number, z: number, h: number, edgeOut: number, texelM: number): number {
    if (!relief.length) return h;
    let add = 0;
    for (let i = 0; i < relief.length; i++) add += relief[i].heightAt(x, z, h, texelM);
    // (HL-2b: a landform reaching to the edge — a spur coming down into a corner — rises from the edge at no more than a
    // mountain slope, ~32°: faded in over a fixed 100 m, the Turra spur stood 260 m within the band, a wall over the
    // corner eye with its snowy top as a white slab)
    if (add > 0) {
      const room = Math.max(0, edgeOut - 20) * RELIEF_EDGE_SLOPE;
      // (a soft minimum: the landform's own height where there is room, the ramp's where there is not)
      add = room <= 0 ? 0 : add / Math.pow(1 + (add / room) ** 4, 0.25);
    } else add *= smoothstep(20, 120, edgeOut);
    return h + add;
  }

  /** Term 6 applied to a base height: the floor under the water, and the water sample. */
  function waterInto(x: number, z: number, base: number, out: HinterlandWaterSample | null): number {
    if (out) { out.wet = 0; out.level = 0; out.kind = 0; out.ice = 0; }
    const edgeOut = edgeOutOf(x, z);
    if (edgeOut <= 0) return base;
    let h = base;
    for (const sea of seas) {
      // the distance out along the coast's normal, and along the coast (the wander's coordinate)
      const along = x * sea.nz - z * sea.nx, out_ = x * sea.nx + z * sea.nz;
      if (out_ < sea.coastM - sea.wanderM - 80) continue;
      const coast = sea.coastM + sea.wanderM * fbm2(along / 1700 + sea.salt, sea.salt * 0.7, 4);
      // the shore shelves down from 40 m inside the coast to the floor 300 m out (a beach, then the sea floor); a
      // channel's far shore rises the same way from its own wandering line
      let s = smoothstep(coast - 40, coast + 300, out_);
      if (Number.isFinite(sea.widthM)) {
        const farCoast = coast + sea.widthM + sea.wanderM * 1.4 * fbm2(along / 2300 - sea.salt, sea.salt * 1.3, 4);
        s *= 1 - smoothstep(farCoast - 300, farCoast + 40, out_);
      }
      if (s > 0) {
        const deep = Math.min(smoothstep(coast, coast + 1200, out_), Number.isFinite(sea.widthM) ? 1 - smoothstep(coast + sea.widthM - 1200, coast + sea.widthM, out_) : 1);
        const floor = sea.level - 1.5 - 4 * deep;
        h = h + (Math.min(h, floor) - h) * s;
        if (out && h < sea.level && s > out.wet) { out.wet = smoothstep(0, 0.6, sea.level - h); out.level = sea.level; out.kind = 1; out.ice = sea.ice; }
      }
    }
    for (const flood of floods) {
      // the inundation past its line: every hollow under its level holds water (the land stands where it is higher)
      const along = x * flood.nz - z * flood.nx, out_ = x * flood.nx + z * flood.nz;
      const line = flood.fromM + 260 * fbm2(along / 1300 + flood.salt, flood.salt * 0.4, 3);
      if (out_ < line) continue;
      const w = smoothstep(line, line + 220, out_);
      // the drowned polders lie a little under the water (Walcheren's fields at sea level under a metre and more of the
      // October tide); what stands higher — a dune, a terp, a dyke, a village on its rise — keeps its height over it
      const sunk = flood.level - 0.9 + Math.max(0, h - flood.level - 1.5) * 0.8;
      h = h + (Math.min(h, sunk) - h) * w;
      if (h < flood.level && out && w > out.wet) { out.wet = w * smoothstep(0, 0.25, flood.level - h); out.level = flood.level; out.kind = 5; }
    }
    for (const lake of lakes) {
      const d = Math.hypot(x - lake.x, z - lake.z);
      const rr = lake.r * (1 + 0.22 * noise2(Math.atan2(z - lake.z, x - lake.x) * 1.6 + lake.salt, lake.salt));
      if (d > rr + 80) continue;
      const level = lake.level;
      const s = 1 - smoothstep(rr - 40, rr + 60, d);
      const floor = level - 1 - 6 * (1 - smoothstep(0, rr, d));
      h = h + (Math.min(h, floor) - h) * s;
      if (out && h < level && s > out.wet) { out.wet = s; out.level = level; out.kind = 2; }
    }
    for (const ch of channels) {
      if (x < ch.minX || x > ch.maxX || z < ch.minZ || z > ch.maxZ) continue;
      const d = polylineDistance(ch.xs, ch.zs, x, z, hit);
      const bank = ch.halfW + 30;
      if (d > bank) continue;
      const level = ch.levels[hit.i] + (ch.levels[Math.min(ch.levels.length - 1, hit.i + 1)] - ch.levels[hit.i]) * hit.t;
      const floor = level - 1.2 - 1.5 * (1 - smoothstep(0, ch.halfW, d));
      // (a channel leaving the square carries the battlefield's own bed through the residual: its cut fades in past the edge)
      const s = (1 - smoothstep(ch.halfW * 0.85, bank, d)) * smoothstep(0, 80, edgeOut);
      h = h + (Math.min(h, floor) - h) * s;
      if (out && h < level && s > out.wet) { out.wet = 1 - smoothstep(ch.halfW * 0.8, ch.halfW * 1.05, d); out.level = level; out.kind = ch.kind; }
    }
    return h;
  }

  // ---- term 3: the planner's levelled pads and graded lines, bucketed
  const padBuckets = new Buckets<HinterlandFlatPad & { level: number }>(96);
  // (each entry one segment: a query measures only the segments in its cell, not the whole line)
  const lineBuckets = new Buckets<{ line: HinterlandGradeLine; grade: Float64Array; i: number }>(96);
  for (const pad of features.pads) {
    const level = Number.isNaN(pad.y) ? waterInto(pad.x, pad.z, baseNoWater(pad.x, pad.z), null) : pad.y;
    const reach = pad.r + pad.featherM;
    padBuckets.add({ ...pad, level }, pad.x - reach, pad.z - reach, pad.x + reach, pad.z + reach);
  }
  for (const line of features.lines) {
    const n = line.xs.length;
    if (n < 2) continue;
    // the grade: the land under the line smoothed along it (a ~60 m running mean), then its crown
    const raw = new Float64Array(n);
    for (let i = 0; i < n; i++) raw[i] = waterInto(line.xs[i], line.zs[i], baseNoWater(line.xs[i], line.zs[i]), null);
    const grade = new Float64Array(n);
    let segLen = 0;
    for (let i = 0; i + 1 < n; i++) segLen += Math.hypot(line.xs[i + 1] - line.xs[i], line.zs[i + 1] - line.zs[i]);
    const step = segLen / Math.max(1, n - 1), k = Math.max(1, Math.round(30 / Math.max(1, step)));
    for (let i = 0; i < n; i++) {
      let s = 0, c = 0;
      for (let j = Math.max(0, i - k); j <= Math.min(n - 1, i + k); j++) { s += raw[j]; c++; }
      grade[i] = s / c + line.crownM;
    }
    const reach = line.halfWidthM + line.featherM;
    for (let i = 0; i + 1 < n; i++) {
      const minX = Math.min(line.xs[i], line.xs[i + 1]) - reach, maxX = Math.max(line.xs[i], line.xs[i + 1]) + reach;
      const minZ = Math.min(line.zs[i], line.zs[i + 1]) - reach, maxZ = Math.max(line.zs[i], line.zs[i + 1]) + reach;
      lineBuckets.add({ line, grade, i }, minX, minZ, maxX, maxZ);
    }
  }
  /** Term 3 on a height: levelled toward each pad and line by its weight; the strongest feature's weights reported. */
  const flatWeights = { settle: 0, road: 0, rail: 0 };
  function levelInto(x: number, z: number, h: number): number {
    flatWeights.settle = 0; flatWeights.road = 0; flatWeights.rail = 0;
    // the roads and rails graded first, then the yards: a building stands on a level yard whatever runs past it, and
    // where two yards' feathers meet the nearer yard holds (never a blend of two levels under one footprint)
    const lines = lineBuckets.at(x, z);
    if (lines) {
      // (a line's segments in this cell come together: the nearest of them is the line's distance here)
      let k = 0;
      while (k < lines.length) {
        const { line, grade } = lines[k];
        let best = Infinity, bi = 0, bt = 0;
        for (; k < lines.length && lines[k].line === line; k++) {
          const i = lines[k].i;
          const ax = line.xs[i], az = line.zs[i], bx = line.xs[i + 1] - ax, bz = line.zs[i + 1] - az;
          const len2 = bx * bx + bz * bz;
          const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / len2)) : 0;
          const dd = Math.hypot(x - ax - bx * t, z - az - bz * t);
          if (dd < best) { best = dd; bi = i; bt = t; }
        }
        const w = 1 - smoothstep(line.halfWidthM, line.halfWidthM + line.featherM, best);
        if (w <= 0) continue;
        const g = grade[bi] + (grade[Math.min(grade.length - 1, bi + 1)] - grade[bi]) * bt;
        h += (g - h) * w;
        const on = 1 - smoothstep(line.halfWidthM * 0.8, line.halfWidthM + 0.5, best);
        if (line.kind === 'rail') flatWeights.rail = Math.max(flatWeights.rail, on);
        else flatWeights.road = Math.max(flatWeights.road, on * (line.kind === 'track' ? 0.6 : 1));
      }
    }
    const pads = padBuckets.at(x, z);
    if (pads) {
      let best: (HinterlandFlatPad & { level: number }) | null = null, bestW = 0;
      for (const pad of pads) {
        const d = Math.hypot(x - pad.x, z - pad.z);
        const w = 1 - smoothstep(pad.r, pad.r + pad.featherM, d);
        if (w > bestW || (w === bestW && w > 0 && best && d < Math.hypot(x - best.x, z - best.z))) { bestW = w; best = pad; }
        if (w > 0) flatWeights.settle = Math.max(flatWeights.settle, 1 - smoothstep(pad.r * 0.9, pad.r + 2, d));
      }
      if (best) h += (best.level - h) * bestW;
    }
    return h;
  }

  function baseHeightAt(x: number, z: number): number { return baseNoWater(x, z); }
  function heightAt(x: number, z: number, texelM = 0): number {
    if (edgeOutOf(x, z) <= 0) return ground.getHeightAt(x, z);
    const h = waterInto(x, z, baseNoWater(x, z, texelM), null);
    return features === EMPTY_FEATURES ? h : levelInto(x, z, h);
  }
  const displayWater = createHinterlandWater();
  let lastDisplayBase = NaN;
  function displayHeightAt(x: number, z: number, texelM = 0): number {
    if (edgeOutOf(x, z) <= 0) { lastDisplayBase = NaN; return ground.getHeightAt(x, z); }
    const b = baseNoWater(x, z, texelM);
    lastDisplayBase = b;
    let h = waterInto(x, z, b, displayWater);
    if (features !== EMPTY_FEATURES) h = levelInto(x, z, h);
    // (the water's surface where it is open: its edge follows the shore's own slope as the wet weight rises)
    return displayWater.wet > 0 && displayWater.level > h ? h + (displayWater.level - h) * Math.min(1, displayWater.wet * 1.5) : h;
  }
  function waterAt(x: number, z: number, out: HinterlandWaterSample): HinterlandWaterSample {
    waterInto(x, z, baseNoWater(x, z), out);
    return out;
  }

  // ---- geology: strata along the dip, rock by slope, snow by altitude, slope and aspect, sand on the low ground
  const geo = spec.geology;
  const dipRad = geo.strata.dipDeg * Math.PI / 180;
  const dipDir = hash12(placeSeed * 0.001, 5.5) * Math.PI * 2;
  const slopeAt = (x: number, z: number, e = 6): number => {
    const dx = heightAt(x + e, z) - heightAt(x - e, z), dz = heightAt(x, z + e) - heightAt(x, z - e);
    return Math.atan(Math.hypot(dx, dz) / (2 * e)) * 180 / Math.PI;
  };
  function geologyAt(x: number, z: number, out: HinterlandGeologySample, slopeDeg?: number, height?: number): HinterlandGeologySample {
    const h = height ?? heightAt(x, z);
    const s = slopeDeg ?? slopeAt(x, z);
    const rel = h - datumAt(hinterlandBearing(x, z));
    const dip = Math.tan(dipRad) * (x * Math.cos(dipDir) + z * Math.sin(dipDir));
    out.strata = geo.strata.bedM > 0 ? (rel + dip + 3 * noise2(x / 240 + cox, z / 240 + coz)) / geo.strata.bedM : 0;
    const crag = 0.5 + 0.5 * noise2(x / 60 + coz, z / 60 + cox);
    out.rock = smoothstep(geo.rockSlopeDeg - 8, geo.rockSlopeDeg + 6, s + 6 * (crag - 0.5));
    const line = geo.snow.lineM;
    // where snow can lie at all: off the steep (it slides), less on the wind-scoured crags
    out.snowHold = (1 - smoothstep(geo.snow.maxSlopeDeg - 6, geo.snow.maxSlopeDeg + 4, s)) * (1 - 0.6 * geo.snow.scour * smoothstep(0.2, 0.9, crag));
    if (Number.isFinite(line)) {
      const lineHere = line + 40 * noise2(x / 420 + cox, z / 420 - coz);
      out.snow = smoothstep(lineHere - 30, lineHere + 50, rel) * out.snowHold;
    } else out.snow = 0;
    out.sand = geo.sand * (1 - out.rock) * (1 - smoothstep(4, 18, s));
    out.rockHex = geo.rockHex;
    out.forest = -1;
    out.gully = 0;
    for (let i = 0; i < relief.length; i++) relief[i].geologyAt?.(x, z, out, s);
    return out;
  }

  // ---- cover
  const landSample: LandFieldSample = createLandFieldSample();
  const waterSample = createHinterlandWater();
  const geoSample = createHinterlandGeology();
  // (a flat region's woodlots are small: the patches' scale halves)
  const woodsScale = spec.outland.flat ? 0.45 : 1;
  const woodsShare = Math.max(0, Math.min(1, spec.outland.woods));
  // the woods field past the near band (the battlefield's own woods hold near): patches at ~600 m and ~200 m, leaning
  // onto the low ground for the wet regions and onto the slopes for the uplands, cut to the region's share
  const woodsCut = (() => {
    if (woodsShare <= 0) return Infinity;
    const samples: number[] = [];
    // (a lattice over 12 km: the noise is stationary, so its quantile there is the share everywhere)
    for (let j = 0; j < 64; j++) for (let i = 0; i < 64; i++) samples.push(woodsNoise(-6000 + i * 190 + 37, -6000 + j * 190 - 53));
    samples.sort((p, q) => p - q);
    return samples[Math.min(samples.length - 1, Math.floor((1 - woodsShare) * samples.length))];
  })();
  function woodsNoise(x: number, z: number): number {
    const s = woodsScale;
    return noise2(x / (620 * s) + wox, z / (620 * s) - woz) * 0.62 + noise2(x / (210 * s) - woz, z / (210 * s) + wox) * 0.3 + noise2(x / 55 + 3.3, z / 55 - 1.7) * 0.08;
  }
  // (a flat place keeps the battlefield's border woods only near the edge, where they continue its own; past that its
  // woodlots are the region's — small, so the eye runs out over the polder between them — HL-2b's long views)
  const nearWoodsHold = flat ? [220, 320] : [nearHoldM, nearEaseM];
  function woodsAt(x: number, z: number, edgeOut: number): number {
    const near = ground.getBorderWoodsAt && edgeOut < nearWoodsHold[1] ? ground.getBorderWoodsAt(x, z) : 0;
    const ease = smoothstep(nearWoodsHold[0], nearWoodsHold[1], edgeOut);
    if (ease <= 0 || !Number.isFinite(woodsCut)) return near * (1 - ease);
    const far = smoothstep(woodsCut - 0.03, woodsCut + 0.03, woodsNoise(x, z));
    return near + (far - near) * ease;
  }

  function coverAt(x: number, z: number, out: HinterlandCover, slopeDeg?: number, height?: number, baseHeight?: number): HinterlandCover {
    out.cls = HL_COVER.pasture; out.crop = 31; out.fieldId = 0;
    out.woods = 0; out.hedge = 0; out.wet = 0; out.rock = 0; out.scree = 0; out.snow = 0; out.settle = 0; out.road = 0;
    out.edgeU = 1e9; out.edgeV = 1e9;
    const edgeOut = edgeOutOf(x, z);
    // (a base the caller already has — the pyramid bake's, at the drawn level of detail — saves the relief's evaluation)
    const base = baseHeight !== undefined && Number.isFinite(baseHeight) ? baseHeight : baseNoWater(x, z);
    let h = waterInto(x, z, base, waterSample);
    if (features !== EMPTY_FEATURES) h = levelInto(x, z, h);
    else { flatWeights.settle = 0; flatWeights.road = 0; flatWeights.rail = 0; }
    const hh = height ?? h;
    out.wet = waterSample.wet;
    if (out.wet > 0.5) { out.cls = HL_COVER.water; return out; }
    out.settle = flatWeights.settle;
    out.road = Math.max(flatWeights.road, flatWeights.rail);
    if (flatWeights.rail > 0.5) { out.cls = HL_COVER.rail; return out; }
    if (flatWeights.road > 0.5) { out.cls = HL_COVER.road; return out; }
    const s = slopeDeg ?? slopeAt(x, z);
    geologyAt(x, z, geoSample, s, hh);
    out.rock = geoSample.rock; out.snow = geoSample.snow;
    out.scree = geo.scree * smoothstep(geo.rockSlopeDeg - 18, geo.rockSlopeDeg - 6, s) * (1 - geoSample.rock);
    // (rock and a settlement first; the woods before the snow — a wood stands dark over the snow on its floor, as the
    // Glacier frames' battlefield spruce do, so a snow-covered place keeps its forests: the coordinator's "continuity of
    // life")
    if (geoSample.rock > 0.55) { out.cls = HL_COVER.rock; return out; }
    if (out.settle > 0.5) { out.cls = HL_COVER.settlement; return out; }
    // the forest's altitude band (the treeline)
    const rel = hh - datumAt(hinterlandBearing(x, z));
    const band = spec.geology.forestBandM;
    // the treeline is ragged (it wanders ±45 m over a few hundred metres) and the wood thins out under it
    const ragged = 45 * noise2(x / 190 + cox, z / 190 - coz) + 20 * noise2(x / 60 - coz, z / 60 + cox);
    const inBand = band[1] > band[0] ? smoothstep(band[0] - 20, band[0] + 10, rel) * (1 - smoothstep(band[1] - 70, band[1] + 10, rel - ragged)) : 0;
    // (a landform's own forest belt governs on it: the belt between its heights, bare above)
    const allow = geoSample.forest >= 0 ? geoSample.forest : (inBand > 0 ? inBand : (band[1] > band[0] ? 0 : 1));
    let woods = woodsAt(x, z, edgeOut) * Math.min(1, allow * 1.6);
    // krummholz: where the belt thins toward its top, the wood breaks into clumps (a finer noise must clear a rising cut)
    if (allow < 0.95 && woods > 0) woods *= smoothstep(1 - allow - 0.1, 1 - allow + 0.1, 0.5 + 0.5 * noise2(x / 38 + coz, z / 38 - cox));
    // gaps down the gullies and couloirs (avalanche tracks, screes)
    woods *= 1 - smoothstep(0.35, 0.65, geoSample.gully);
    // (no wood on the steep: where rock nearly bares, the trees thin out)
    woods *= 1 - smoothstep(0.3, 0.55, geoSample.rock);
    out.woods = woods;
    if (out.woods > 0.5) { out.cls = HL_COVER.woods; return out; }
    if (geoSample.snow > 0.55) { out.cls = HL_COVER.snow; return out; }
    if (out.scree > 0.5) { out.cls = HL_COVER.scree; return out; }
    if (geoSample.sand > 0.5) { out.cls = HL_COVER.sand; return out; }
    // the map's own field system carried on past the line (its crops, boundaries and hedges)
    if (landUse && spec.outland.fields > 0) {
      landUseAt(landUse, x, z, landSample);
      if (landSample.active > 0) {
        const keep = hash12(landSample.id * 0.37 + 1.3, 7.7) < Math.min(1, spec.outland.fields * 1.25);
        out.hedge = landSample.hedge * Math.min(1, spec.outland.hedges * 1.4);
        if (keep && landSample.crop !== 0) { out.cls = HL_COVER.field; out.crop = landSample.crop; out.fieldId = landSample.id; }
        else { out.cls = HL_COVER.pasture; out.crop = 0; out.fieldId = landSample.id; }
        out.edgeU = landSample.sU; out.edgeV = landSample.sV;
        return out;
      }
    }
    if (ground.getBorderHedgeAt && edgeOut < HINTERLAND_NEAR_HOLD_M) out.hedge = ground.getBorderHedgeAt(x, z);
    out.cls = spec.region.vegetation.habit === 'none' && spec.geology.sand < 0.3 ? HL_COVER.heath : HL_COVER.pasture;
    return out;
  }

  const hedgeSample: LandFieldSample = createLandFieldSample();
  function hedgeAt(x: number, z: number): number {
    const edgeOut = edgeOutOf(x, z);
    if (edgeOut <= 0) return 0;
    if (landUse && spec.outland.fields > 0) {
      landUseAt(landUse, x, z, hedgeSample);
      if (hedgeSample.active > 0) return hedgeSample.hedge * Math.min(1, spec.outland.hedges * 1.4);
    }
    return ground.getBorderHedgeAt && edgeOut < HINTERLAND_NEAR_HOLD_M ? ground.getBorderHedgeAt(x, z) : 0;
  }

  const field: HinterlandField = {
    spec, seed, datumAt, baseHeightAt, heightAt, displayHeightAt, waterAt, coverAt, geologyAt, hedgeAt, features, landUse,
    get lastDisplayBase() { return lastDisplayBase; },
    withFeatures: (next) => createHinterlandField(spec, seed, ground, { ...options, features: next }),
  };
  return field;
}
