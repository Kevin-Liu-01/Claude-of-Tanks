// src/world/borderLandform.ts — the land around the playable square (the map-borders lane of the Opus 5.5 redesign,
// 2026-10-03).
//
// Owner (2026-09-21): "make them seamless and seem like just a map square boundary area carved into a broader map that
// actually exists and works"; (2026-10-02) "maps need to look so much better esp the horizons and transitions around
// map borders". The border census (tools/visual-census.mjs --set=border) showed why they did not: every map's square
// sat in a BOWL. The border rim lift was one Chebyshev-square S-curve (rimH over the last 82 m, flat from the edge on),
// so from inside the square every side was the same escarpment, every corner a V-shaped crease where two walls met, and
// past the edge the land was a plateau standing rimH over the battlefield with the authored ranges behind it; the rim's
// 25–45° faces took the steep-slope rock layer, which drew pale streaks along all four sides.
//
// This module replaces that lift with a landform. Inside the playable square (|x|, |z| <= 470, PLAYABLE_HALF_EXTENT_M)
// the rim keeps its own S-curve and may only be LOWERED — by the rim factor, never raised — so no cover, slope or
// obstacle is added where tanks drive. Past the playable edge the lift hands over (within 40 m) to the outland: the
// hills of an organic 2D field (domain-warped fBm, map-scaled) that rise from the square's own level over a reach that
// wanders along the border, closer where the map is enclosed and farther where the land opens out. The enclosure field
// decides which sectors are which (low frequency, so a side may be open for half its length and hilly for the rest);
// the in-square rim factor follows it, so where the outland is open the square's rim is low and the ground runs on.
// Corners lower the rim further (the creases were the strongest tell). Everything is a pure function of (x, z): no
// grid, no allocation, deterministic per seed, Node-runnable (the authority and the collision builders share it).
import { SimplexNoise } from '../engine/simplexFast.ts';
import { type BorderLandUse, type LandUseSampleLike, traceLandUseLines } from './borderLandUse.ts';
import { createMassifField } from './horizonMassif.ts';

/** The playable half extent (battlefieldBounds PLAYABLE_HALF_EXTENT_M): the rim inside it may only be lowered. */
export const BORDER_PLAYABLE_M = 470;
/** Where the classic rim lift starts (its S-curve runs 430 → 512). */
export const BORDER_RIM_START_M = 430;
/** The terrain edge (TERRAIN_HALF_EXTENT_M). */
export const BORDER_EDGE_M = 512;
/** The classic S-curve's square at the playable edge: s(470)² of smoothstep(430, 512). */
const RIM_AT_PLAYABLE = (() => { const t = (470 - 430) / 82, s = t * t * (3 - 2 * t); return s * s; })();
/** Metres past the playable edge over which the square's rim hands over to the outland. */
const HANDOVER_M = 40;
/**
 * The field system past the edge: two families of near-straight lines (one per map, 7–21° off the square's axes so no
 * hedge runs along the red line; warped ±22 m over a kilometre) on a 46 m pitch. A share of each family's pitch lines
 * are field boundaries — fields from 46 m strips to ~600 m blocks, never a closed loop — and a share of those carry a
 * farm track. Shares per crops style: [family a, family b].
 */
const FIELD_PITCH_M = 46;
const FIELD_LINE_SHARE: Record<'temperate' | 'steppe' | 'polder', [number, number]> = {
  temperate: [0.32, 0.25], steppe: [0.13, 0.10], polder: [0.55, 0.08],
};
/** Of the field boundaries, the share that carries a farm track (in runs of ~320 m, 70 % of them laid). */
const TRACK_LINE_SHARE = 0.42;
const TRACK_RUN_LEVELS = 7;
const _field = { a: 0, b: 0 };
function fieldHash(n: number): number {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}
/**
 * The crops past the edge, calibrated with the ground lane's field system (landUse.ts, the terrain material's lu_field):
 * each crop's colour as a multiple of the local sward's luminance (~0.075 linear) — ripe wheat 2.8x, barley 3.0x, a
 * young crop 1.25x greener, stubble 2.8x straw, plough of dark soil (~0.035), sunflower 0.70x — so a field reads the
 * same either side of the red line. [r, g, b, weight]: pasture keeps most of the sward's own tone.
 */
const CROPS: Readonly<Record<string, readonly [number, number, number, number]>> = Object.freeze({
  pasture: [0.86, 1.12, 0.62, 0.5],
  wheat: [3.85, 2.78, 1.12, 1],
  barley: [3.72, 3.13, 1.59, 1],
  green: [1.13, 1.77, 0.45, 1],
  plough: [0.66, 0.45, 0.28, 1],
  stubble: [3.41, 2.83, 1.76, 1],
  sunflower: [0.66, 0.93, 0.33, 1],
  rapeseed: [3.2, 2.9, 0.55, 1],
});
/** Each region's rotation (landUse.ts ROTATIONS; the polders take the bocage's grazing with rapeseed for sunflower). */
const ROTATIONS: Readonly<Record<'temperate' | 'steppe' | 'polder', readonly (readonly [string, number])[]>> = Object.freeze({
  steppe: [['pasture', 0.16], ['wheat', 0.27], ['barley', 0.11], ['green', 0.14], ['plough', 0.15], ['stubble', 0.11], ['sunflower', 0.06]],
  temperate: [['pasture', 0.22], ['wheat', 0.21], ['barley', 0.13], ['green', 0.15], ['plough', 0.15], ['stubble', 0.10], ['sunflower', 0.04]],
  polder: [['pasture', 0.46], ['wheat', 0.10], ['barley', 0.06], ['green', 0.14], ['plough', 0.12], ['stubble', 0.07], ['rapeseed', 0.05]],
});
/** A field's crop by its roll (0..1) on the region's rotation. */
function cropOf(crops: 'temperate' | 'steppe' | 'polder', roll: number): readonly [number, number, number, number] {
  const table = ROTATIONS[crops] ?? ROTATIONS.temperate;
  let acc = 0;
  for (const [name, share] of table) { acc += share; if (roll < acc) return CROPS[name]; }
  return CROPS[table[table.length - 1][0]];
}

/** A map's border landform (all optional; resolveBorderLandform fills the style's defaults). */
export interface BorderLandformSettings {
  /** 0 open country … 1 enclosed: the share of the border where hills stand close to the edge. */
  enclosure: number;
  /** The outland hills' crest height in units of the map's rimH. */
  hillHeight: number;
  /** Metres past the playable edge over which the hills reach their crest (enclosed sectors take 0.6 of it). */
  reachM: number;
  /** The lowest rim factor of the playable band (0..1): how far the square's own rim may fall where the land opens. */
  rimFloor: number;
  /** The hills' spacing in metres. */
  wavelengthM: number;
  /** 0..1: how ridged the hills are (0 rounded downs, 1 sharp-crested ridges). */
  ridged: number;
  /** 0..1: tableland terracing — flat tops over steep risers (the mesa country's buttes and tables). */
  terrace: number;
  /** 0..1: the woodland share of the outland's near band (the ring forest's stands; 0 bare, ~0.35 farmland with woods). */
  forest: number;
  /** 0..1: hedgerows — tree lines along two families of curving field boundaries past the edge (farmland), with gates
   * and gaps; 0 none (forest, desert, snow). */
  hedgerows: number;
  /** 0..1: how strongly the land past the edge reads as fields — parcels of stubble, plough, pasture and fallow
   * between the hedgerows (the ring's borderTint attribute); 0 none (wild, desert, snow, town). */
  fields: number;
  /** The fields' crops: 'temperate' (stubble, plough, pasture, fallow), 'steppe' (stubble and plough), 'polder'
   * (pasture, plough, rapeseed). */
  crops: 'temperate' | 'steppe' | 'polder';
  /** Farmsteads round the square past the edge (borderFarmsteads.ts; a hamlet's farms counted), 0 none. */
  farms: number;
  /**
   * 0..~0.5: the foothills' erosion — the mountains lane's dendritic drainage (horizonMassif.ts) cut into the outland's
   * crests at foothill scale (couloirs ~180 m apart), the multiplier's contrast; 0 leaves the rounded hills.
   */
  erosion: number;
  /** The farmsteads' build and materials. */
  buildings: 'temperate' | 'steppe' | 'polder' | 'winter' | 'arid' | 'nordic' | 'tropical' | 'alpine';
  /**
   * The rim as it stood before the border landform (the classic S-curve and the plateau rimH over the geology past the
   * edge, the old 140–460 m ring hand-over, no woods field): the receipts that replay a pre-landform failure build
   * their predecessor and current fields with it. Not a map setting.
   */
  classic?: boolean;
}

/** Defaults by horizon style (the ring's character beyond): enclosed valleys and canyons, open rolling country. */
const STYLE_DEFAULTS: Readonly<Record<string, BorderLandformSettings>> = {
  rolling: { enclosure: 0.42, hillHeight: 1.9, reachM: 260, rimFloor: 0.22, wavelengthM: 560, ridged: 0.2, terrace: 0, forest: 0.34, hedgerows: 0.7, fields: 0.6, crops: 'temperate', farms: 10, buildings: 'temperate', erosion: 0.3 },
  escarpment: { enclosure: 0.5, hillHeight: 2.0, reachM: 240, rimFloor: 0.25, wavelengthM: 540, ridged: 0.35, terrace: 0.25, forest: 0.3, hedgerows: 0.45, fields: 0.45, crops: 'temperate', farms: 6, buildings: 'temperate', erosion: 0.34 },
  alpine: { enclosure: 0.7, hillHeight: 2.3, reachM: 220, rimFloor: 0.35, wavelengthM: 520, ridged: 0.6, terrace: 0, forest: 0.42, hedgerows: 0.15, fields: 0.15, crops: 'temperate', farms: 4, buildings: 'alpine', erosion: 0.4 },
  mesa: { enclosure: 0.55, hillHeight: 1.9, reachM: 240, rimFloor: 0.3, wavelengthM: 560, ridged: 0.3, terrace: 0.85, forest: 0.06, hedgerows: 0, fields: 0, crops: 'temperate', farms: 2, buildings: 'arid', erosion: 0.2 },
};

/**
 * Each map's border character over its style's defaults, from the map's own identity (docs/MAP-BEAUTIFICATION.md,
 * "Per-map identity"): open steppe and airfield country with sparse woods, flat deltas, polders and tidal flats, wooded
 * valleys and logging country, tablelands and canyons, mountain valleys. A map config's `terrain.border` overrides it.
 */
const MAP_BORDERS: Readonly<Record<string, Partial<BorderLandformSettings>>> = {
  verdant: { forest: 0.36, hedgerows: 0.85, fields: 0.75, farms: 12 },
  desert: { forest: 0.03, enclosure: 0.5, hedgerows: 0, fields: 0, farms: 4, buildings: 'arid' },
  winter: { forest: 0.44, hedgerows: 0.2, fields: 0.1, farms: 6, buildings: 'winter' },
  urban: { forest: 0.28, hedgerows: 0.5, fields: 0.45, farms: 14 },
  coastal: { forest: 0.24, enclosure: 0.36, hedgerows: 0.55, fields: 0.5, farms: 9 },
  autumn: { forest: 0.42, enclosure: 0.5, hedgerows: 0.9, fields: 0.8, farms: 12 },
  steppe: { enclosure: 0.12, hillHeight: 1.25, reachM: 340, rimFloor: 0.18, wavelengthM: 760, forest: 0.07, hedgerows: 0.55, fields: 0.85, crops: 'steppe', farms: 10, buildings: 'steppe' },
  railyard: { forest: 0.22, hedgerows: 0.55, fields: 0.6, farms: 9 },
  frontier: { forest: 0.36, enclosure: 0.5, hedgerows: 0.6, fields: 0.6, farms: 10 },
  fjord: { forest: 0.42, fields: 0.1, farms: 5, buildings: 'nordic' },
  delta: { enclosure: 0.08, hillHeight: 0.6, reachM: 360, rimFloor: 0.15, wavelengthM: 700, forest: 0.26, hedgerows: 0.35, fields: 0.55, crops: 'polder', farms: 10, buildings: 'tropical', erosion: 0 },
  monsoon: { forest: 0.6, fields: 0.25, farms: 6, buildings: 'tropical' },
  alpine: { forest: 0.32, fields: 0.05 },
  caldera: { forest: 0.06, terrace: 0.55, ridged: 0.45, hedgerows: 0, fields: 0, farms: 1 },
  foundry: { forest: 0.2, hedgerows: 0.55, fields: 0.55, farms: 8 },
  ruinspires: { forest: 0.1, hedgerows: 0.2, fields: 0.1, farms: 3 },
  blackglass: { forest: 0.1, hedgerows: 0.2, fields: 0.1, farms: 2, buildings: 'nordic' },
  titan_gorge: { forest: 0.02, hedgerows: 0, farms: 1 },
  skybridge: { forest: 0.05, hedgerows: 0, farms: 1 },
  polders: { enclosure: 0.04, hillHeight: 0.35, reachM: 420, rimFloor: 0.12, wavelengthM: 820, forest: 0.12, hedgerows: 0.55, fields: 0.8, crops: 'polder', farms: 12, buildings: 'polder', erosion: 0 },
  copper_mesa: { forest: 0.03, hedgerows: 0, farms: 2 },
  airfield: { enclosure: 0.18, hillHeight: 1.2, reachM: 360, rimFloor: 0.18, wavelengthM: 700, forest: 0.22, hedgerows: 0.4, fields: 0.6, crops: 'steppe', farms: 9, buildings: 'steppe' },
  oasis: { enclosure: 0.32, hillHeight: 1.3, forest: 0.02, hedgerows: 0, fields: 0, farms: 4, buildings: 'arid' },
  whiteout: { forest: 0.08, ridged: 0.4, hedgerows: 0, fields: 0, farms: 0 },
  orchard: { forest: 0.4, hedgerows: 0.75, fields: 0.65, farms: 12 },
  longleaf: { forest: 0.62, hedgerows: 0.2, fields: 0.15, farms: 6 },
  mangrove: { enclosure: 0.04, hillHeight: 0.35, reachM: 420, rimFloor: 0.12, wavelengthM: 820, forest: 0.42, hedgerows: 0, fields: 0, farms: 6, buildings: 'tropical', erosion: 0 },
  saltwind: { forest: 0.14, terrace: 0.35, hedgerows: 0.35, fields: 0.3, crops: 'steppe', farms: 7, buildings: 'steppe' },
  reservoir: { forest: 0.5, fields: 0.15, farms: 6 },
  mars: { forest: 0, hedgerows: 0, fields: 0, farms: 0 },
  moon: { forest: 0, hillHeight: 1.6, hedgerows: 0, fields: 0, farms: 0 },
  cliffbridge: { forest: 0.36, hedgerows: 0.7, fields: 0.65, farms: 9 },
};

export function resolveBorderLandform(
  style: string | undefined, authored?: Partial<BorderLandformSettings> | null, mapId?: string,
): BorderLandformSettings {
  return { ...(STYLE_DEFAULTS[style ?? 'rolling'] ?? STYLE_DEFAULTS.rolling), ...(mapId ? MAP_BORDERS[mapId] ?? {} : {}), ...(authored ?? {}) };
}

export interface BorderLandform {
  readonly settings: BorderLandformSettings;
  /** The field system's orientation (rad; 0 in classic mode): the farmsteads square up to it. */
  readonly fieldAngle: number;
  /**
   * The rim lift in metres at (x, z) for a square radius r (max(|x|, |z|)), replacing rimH · s(r)²: below 430 m nothing,
   * inside the playable square the classic curve times the rim factor (<= 1), past the playable edge the outland's
   * hills. Callers keep their water, coast and road weights on top; the road grades are authored on this same lift
   * (terrain.ts), so a road comes down with the land beside it.
   */
  liftAt(x: number, z: number, r: number): number;
  /** The rim factor of the playable band at (x, z): 1 keeps the classic rim, rimFloor is the most open. */
  rimFactorAt(x: number, z: number): number;
  /** The near ring's hand-over to the authored ranges: 1 = this landform (the continued ground), 0 = the ring's rows. */
  handOverAt(x: number, z: number): number;
  /**
   * The border's woods at (x, z), 0 (open country) … 1 (inside a wood), with a soft ten-metre edge: patches of a few
   * hundred metres leaning onto the hills, calibrated so `forest` of the near outland is wooded. The ring forest and
   * the square's own rim trees past the playable edge both stand by it, so the woods cross the red line as one.
   */
  woodsAt(x: number, z: number): number;
  /** The border's hedgerows at (x, z): 0 … 1 on a field boundary's tree line (farmland past the edge reads as fields). */
  hedgeAt(x: number, z: number): number;
  /**
   * The hedged stretches of the field boundaries past the edge (borderHedgerows.ts builds their bush lines): every
   * field line of both families traced across the band in 8 m steps, each point with the hedge's presence (the
   * boundary's stretch hedged, its gates and gaps, the fade from the edge, none in a wood); nothing beyond `maxOut` m
   * past the edge or where `keep(x, z)` is false (the ranges' hand-over, the sea).
   */
  traceHedgeLines(maxOut: number, keep?: (x: number, z: number) => boolean): { xs: number[]; zs: number[]; w: number[] }[];
  /**
   * The crop of the field the land past the edge belongs to, premultiplied by its weight: [colour x w, 1 - w] (the
   * weight stored as its complement, so a geometry without the attribute — WebGL's generic default (0, 0, 0, 1) — reads
   * no crop), the colour
   * as a multiple of the local sward's luminance (CROPS); faded in over the first 40 m past the edge (no plain band
   * after the square's own fields), off the woods and the crests. Zero wherever there are no fields — a geometry without
   * the attribute reads the same.
   */
  parcelTintAt(x: number, z: number, out: [number, number, number, number]): [number, number, number, number];
  /**
   * The farm tracks past the edge, as the ring's borderTrack attribute: per field family, [1000 + signed metres from the
   * nearest track's centre line divided by the tracks' presence (so a fading track narrows), that track's boundary
   * index]. Linear across the track, so a ring triangle interpolates it exactly; a triangle whose vertices name different
   * boundaries draws none, and 999 m (or a geometry without the attribute, which reads 0) draws none.
   */
  trackAt(x: number, z: number, out: [number, number, number, number]): [number, number, number, number];
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function mulberry32(a: number): () => number {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** A road or a railway leaving the square (terrain.ts buildRoadExitLines, a cutting's open line): the land opens into a
 * valley along its line. `holdM` (a railway's): the ranges stand back from the line by up to that much — the hand-over
 * to the authored ranges moves out along it (full within HOLD_FLOOR_M of the line, none by HOLD_SIDE_M), so the
 * graded line runs on into a valley instead of under the foot of a range that rises 50 m in 300 m. */
export interface BorderValley {
  xs: ArrayLike<number>; zs: ArrayLike<number>; minX: number; maxX: number; minZ: number; maxZ: number; holdM?: number;
}
const VALLEY_FLOOR_M = 70, VALLEY_SIDE_M = 190;
const HOLD_FLOOR_M = 90, HOLD_SIDE_M = 300;

/**
 * The map's border landform. `rimH` is the map's authored rim height (TerrainSettings.rimH) — the scale every height
 * here is measured in, so a 58 m canyon rim and an 18 m polder dike keep their proportions.
 */
export function createBorderLandform(
  seed: number, rimH: number, settings: BorderLandformSettings, valleys: readonly BorderValley[] = [],
  /**
   * The map's land use (the ground lane's landUse.ts grid, borderLandUse.ts) when it has a profile: the land past the
   * edge is then that same grid — its heading squares the farmsteads, its hedged boundaries carry the bush lines (on a
   * walled region every boundary carries a dry stone wall), its crops and tracks are the terrain material's own; the
   * landform's parcels and tracks stand down and the woods keep their free-form patches. Null: the landform's own fields.
   */
  landUse: BorderLandUse | null = null,
): BorderLandform {
  const noise = new SimplexNoise({ random: mulberry32((seed ^ 0xB0BDE5) >>> 0) });
  const { enclosure, hillHeight, reachM, rimFloor, wavelengthM, ridged, terrace } = settings;
  // the foothills' erosion (settings.erosion): the massif landform at foothill scale, calibrated past the edge
  const foothills = settings.erosion > 0 && !settings.classic ? createMassifField((seed ^ 0xE40D) >>> 0, {
    baseWavelengthM: 620, gullyWavelengthM: 180, gullyOctaves: 2, gullyGain: 0.5, slopeStrength: 2.5, branch: 2.5,
    erosion: 0.5, concavity: 1.1, contrast: settings.erosion, smoothM: 0,
  }, [560, 1500]) : null;
  const inv = 1 / Math.max(120, wavelengthM);
  const bias = (Math.max(0, Math.min(1, enclosure)) * 2 - 1) * 0.75;

  /** 1 on a leaving road's line, 0 by VALLEY_SIDE_M from it (bounding boxes first: most queries touch no line). */
  // (valleyAt, enclosureAt and hillsAt keep their last point: one lift asks each of them twice of the same point)
  let valleyX = Number.NaN, valleyZ = Number.NaN, valleyLast = 0;
  function valleyAt(x: number, z: number): number {
    if (x === valleyX && z === valleyZ) return valleyLast;
    valleyX = x; valleyZ = z;
    valleyLast = valleyDistanceWeight(x, z);
    return valleyLast;
  }
  /** The distance from (x, z) to a valley's line, or `reach` when it is farther. */
  function lineDistance(line: BorderValley, x: number, z: number, reach: number): number {
    let best = reach;
    if (x < line.minX - best || x > line.maxX + best || z < line.minZ - best || z > line.maxZ + best) return best;
    for (let i = 0; i + 1 < line.xs.length; i++) {
      const ax = line.xs[i], az = line.zs[i], bx = line.xs[i + 1] - ax, bz = line.zs[i + 1] - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz)));
      const d = Math.hypot(x - ax - bx * t, z - az - bz * t);
      if (d < best) best = d;
    }
    return best;
  }
  function valleyDistanceWeight(x: number, z: number): number {
    let best = VALLEY_SIDE_M;
    for (let v = 0; v < valleys.length; v++) best = lineDistance(valleys[v], x, z, best);
    return 1 - smoothstep(VALLEY_FLOOR_M, VALLEY_SIDE_M, best);
  }
  /** How far (m) the hand-over to the ranges moves out at (x, z): a railway's valley holds them back (BorderValley.holdM). */
  const holdValleys = valleys.filter((line) => (line.holdM ?? 0) > 0);
  function holdAt(x: number, z: number): number {
    let hold = 0;
    for (let v = 0; v < holdValleys.length; v++) {
      const line = holdValleys[v];
      const d = lineDistance(line, x, z, HOLD_SIDE_M);
      if (d < HOLD_SIDE_M) hold = Math.max(hold, line.holdM! * (1 - smoothstep(HOLD_FLOOR_M, HOLD_SIDE_M, d)));
    }
    return hold;
  }
  let enclosureX = Number.NaN, enclosureZ = Number.NaN, enclosureLast = 0;
  function enclosureAt(x: number, z: number): number {
    if (x === enclosureX && z === enclosureZ) return enclosureLast;
    enclosureX = x; enclosureZ = z;
    enclosureLast = enclosureField(x, z);
    return enclosureLast;
  }
  function enclosureField(x: number, z: number): number {
    const e = noise.noise(x * 0.00082 + 17.3, z * 0.00082 - 41.9) * 0.8 + noise.noise(x * 0.0019 - 5.1, z * 0.0019 + 23.7) * 0.25;
    let a = smoothstep(-0.55, 0.55, e + bias);
    if (valleys.length) a *= 1 - 0.9 * valleyAt(x, z);
    return a;
  }
  /** 0..1: the corner share — the creases of the old rim stood where both edges are near. */
  function cornerAt(x: number, z: number): number {
    const lo = Math.min(Math.abs(x), Math.abs(z));
    return smoothstep(330, 450, lo);
  }
  /** The level (units of rimH) the land holds at the playable edge: the square's rim where enclosed, lower where open. */
  function nearLevelAt(x: number, z: number, a: number): number {
    const k = rimFloor + (1 - rimFloor) * a;
    return RIM_AT_PLAYABLE * k * (1 - 0.55 * cornerAt(x, z));
  }
  /** The hills (units of rimH): domain-warped fBm with a ridged share, crests where the field is high. */
  let hillsX = Number.NaN, hillsZ = Number.NaN, hillsLast = 0;
  function hillsAt(x: number, z: number): number {
    if (x === hillsX && z === hillsZ) return hillsLast;
    hillsX = x; hillsZ = z;
    hillsLast = hillsField(x, z);
    return hillsLast;
  }
  function hillsField(x: number, z: number): number {
    const wx = x + noise.noise(x * 0.0024 + 3.7, z * 0.0024 - 8.1) * 90;
    const wz = z + noise.noise(x * 0.0024 - 12.2, z * 0.0024 + 6.4) * 90;
    const u = wx * inv, v = wz * inv;
    const n0 = noise.noise(u + 51.3, v - 7.7);
    const n1 = noise.noise(u * 2.07 - 13.1, v * 2.07 + 29.5);
    const n2 = noise.noise(u * 4.31 + 7.9, v * 4.31 - 61.2);
    // the base octave carries the character (rounded downs or a ridge's crest line), the finer octaves stay smooth
    // shoulders and knolls, so a ridged map has long crests with spurs instead of crumpled noise
    const base = n0 * (1 - ridged) + ((1 - Math.abs(n0)) * 2 - 1.15) * ridged;
    const field = base * 0.62 + n1 * 0.27 + n2 * 0.11;
    const h = smoothstep(-0.55, 0.85, field);
    if (terrace <= 0) return h;
    // tablelands: three levels of flat tops over risers a fifth of a level wide, the riser line broken by the fine octave
    const f = h * 3 + n2 * 0.18, level = Math.floor(f), t = f - level;
    const stepped = Math.max(0, Math.min(1, (level + smoothstep(0.4, 0.6, t)) / 3));
    return h + (stepped - h) * terrace;
  }
  /** The outland's lift (units of rimH) at (x, z) for a square radius r past the playable edge. */
  function outlandLevel(x: number, z: number, r: number, a: number): number {
    const near = nearLevelAt(x, z, a);
    let h = hillsAt(x, z);
    if (valleys.length) h *= 1 - 0.65 * valleyAt(x, z);
    // the reach wanders along the border (spurs and re-entrants) and is shorter where the land is enclosed
    const wander = noise.noise(x * 0.0031 + 91.1, z * 0.0031 - 33.3) * 55;
    const d = r - BORDER_PLAYABLE_M + wander;
    const reach = reachM * (1.3 - 0.7 * a);
    // the hills grow with distance into the foothills of the ranges behind (which the ring's rows carry from ~350 m on)
    const grow = 1 + 1.1 * smoothstep(reach, reach + 520, d);
    let crest = hillHeight * (0.12 + 0.88 * h) * (0.5 + 0.5 * a) * grow;
    // the crests carved into spurs, couloirs and cols (the multiplier averages one over the band), from 20 m past the
    // edge on: the square's own mesh (and every collision record on it) keeps its ground
    if (foothills) {
      const carve = smoothstep(20, 120, r - BORDER_EDGE_M);
      if (carve > 0) crest *= 1 + (foothills.multiplier(x, z) - 1) * carve;
    }
    const ramp = smoothstep(-25, reach, d);
    return near + (crest - near) * ramp;
  }

  const landUseSample: LandUseSampleLike = landUse ? landUse.sample() : { active: 0, hedge: 0, edgeM: 1e9, boundary: 0 };
  // the field system (FIELD_PITCH_M): this map's orientation, and its share of boundaries per family
  const fieldRand = mulberry32((seed ^ 0xF1E1D5) >>> 0);
  const ownAngle = (fieldRand() < 0.5 ? -1 : 1) * (0.12 + 0.24 * fieldRand());
  // (a land-use map's grid has its own heading: the farmsteads square up to it)
  const fieldAngle = landUse ? landUse.heading : ownAngle;
  const fieldCos = Math.cos(fieldAngle), fieldSin = Math.sin(fieldAngle);
  const fieldShare = FIELD_LINE_SHARE[settings.crops] ?? FIELD_LINE_SHARE.temperate;
  /** The two families' pitch levels at (x, z): continuous, a pitch line on every whole level. */
  let fieldX = Number.NaN, fieldZ = Number.NaN, fieldA = 0, fieldB = 0;
  function fieldCoords(x: number, z: number): { a: number; b: number } {
    if (x !== fieldX || z !== fieldZ) {
      // (the ring's attribute passes ask parcel, track and woods of one vertex in turn: the last point is kept)
      const u = x * fieldCos + z * fieldSin, v = z * fieldCos - x * fieldSin;
      fieldA = (u + 22 * noise.noise(x * 0.0011 + 5.1, z * 0.0011 - 3.7)) / FIELD_PITCH_M;
      fieldB = (v + 22 * noise.noise(x * 0.0011 - 8.2, z * 0.0011 + 6.6)) / FIELD_PITCH_M;
      fieldX = x; fieldZ = z;
    }
    _field.a = fieldA; _field.b = fieldB;
    return _field;
  }
  const lineHash = (k: number, family: number): number => fieldHash(k * 1.618 + family * 311.7 + 0.5);
  // the lines as tables over +-FIELD_K pitches (four times the ring's reach): bit 1 a field boundary, bit 2 a track
  const FIELD_K = 1024, FIELD_SPAN = 2 * FIELD_K + 1;
  const lineFlags = [new Uint8Array(FIELD_SPAN), new Uint8Array(FIELD_SPAN)];
  for (let family = 0; family < 2; family++) {
    for (let i = 0; i < FIELD_SPAN; i++) {
      const hash = lineHash(i - FIELD_K, family);
      lineFlags[family][i] = (hash < fieldShare[family] ? 1 : 0) | (hash < fieldShare[family] * TRACK_LINE_SHARE ? 2 : 0);
    }
  }
  const lineIs = (k: number, family: number, bit: number): boolean => {
    const i = k + FIELD_K;
    return i >= 0 && i < FIELD_SPAN ? (lineFlags[family][i] & bit) !== 0
      : lineHash(k, family) < fieldShare[family] * (bit === 2 ? TRACK_LINE_SHARE : 1);
  };
  const isFieldLine = (k: number, family: number): boolean => lineIs(k, family, 1);
  const isTrackLine = (k: number, family: number): boolean => lineIs(k, family, 2);
  /** The field (between two boundaries) a level lies in: the nearest boundary at or below it. */
  function fieldCell(level: number, family: number): number {
    let k = Math.floor(level);
    for (let i = 0; i < 64 && !isFieldLine(k, family); i++) k--;
    return k;
  }
  /** 1 on a field boundary (a 4–10 m band either side of its line), 0 inside a field; segments of a boundary drop out. */
  function fieldBoundaryAt(x: number, z: number): number {
    const { a, b } = fieldCoords(x, z);
    let line = 0;
    for (let family = 0; family < 2; family++) {
      const level = family ? b : a, k = Math.round(level);
      if (!isFieldLine(k, family)) continue;
      const metres = Math.abs(level - k) * FIELD_PITCH_M;
      if (metres >= 5) continue;
      // a boundary stretch between two of the other family's boundaries is hedged or open as a whole
      const other = fieldCell(family ? a : b, 1 - family);
      if (fieldHash(k * 3.7 + other * 11.3 + family * 5.9) > 0.8) continue;
      line = Math.max(line, 1 - smoothstep(2, 5, metres));
    }
    return line;
  }
  /** The woods field before its cut: patches at ~420 m and ~160 m, a fine ragged edge, leaning onto the hills. */
  function woodsField(x: number, z: number): number {
    return noise.noise(x * 0.0024 - 33.1, z * 0.0024 + 57.9) * 0.62 + noise.noise(x * 0.0062 + 12.4, z * 0.0062 - 8.8) * 0.3
      + noise.noise(x * 0.019 - 2.2, z * 0.019 + 4.6) * 0.08 + (hillsAt(x, z) - 0.5) * 0.35;
  }
  // the cut that leaves `forest` of the near outland wooded: the field's quantile over a fixed lattice of the band
  // 0–400 m past the edge (deterministic per seed, ~2.3k samples)
  const woodsCut = (() => {
    const share = Math.max(0, Math.min(1, settings.forest));
    if (share <= 0) return Infinity;
    if (share >= 1) return -Infinity;
    const samples: number[] = [];
    for (let d = 20; d <= 400; d += 40) {
      for (let k = 0; k < 236; k++) {
        const t = (k / 236) * 4, side = Math.floor(t), f = t - side, along = -512 - d + f * (1024 + 2 * d);
        const out = 512 + d;
        const x = side === 0 ? along : side === 1 ? out : side === 2 ? -along : -out;
        const z = side === 0 ? out : side === 1 ? -along : side === 2 ? -out : along;
        samples.push(woodsField(x, z));
      }
    }
    samples.sort((a, b) => a - b);
    return samples[Math.min(samples.length - 1, Math.floor((1 - share) * samples.length))];
  })();

  let woodsX = Number.NaN, woodsZ = Number.NaN, woodsLast = 0;
  function woodsAt(x: number, z: number): number {
    if (x === woodsX && z === woodsZ) return woodsLast;
    woodsLast = woodsAtField(x, z);
    woodsX = x; woodsZ = z;
    return woodsLast;
  }
  /** A whole field's woods (0/1) by its corner boundaries (field cells repeat across thousands of ring queries). */
  const fieldWoods = new Map<number, number>();
  function woodsAtField(x: number, z: number): number {
    if (!Number.isFinite(woodsCut)) return woodsCut < 0 ? 1 : 0;
    if (settings.fields <= 0 || landUse) {
      // the wild woods (forest, scrub, mangrove) keep clearings along the edge too, lighter than farmland's (and on a
      // land-use map the woods are free-form: the whole-field cells would be the landform's grid, not the map's)
      const edgeOut = Math.max(Math.abs(x), Math.abs(z)) - BORDER_EDGE_M;
      const cut = woodsCut + 0.18 * (1 - smoothstep(30, 160, edgeOut)) + 0.08 * (1 - smoothstep(160, 320, edgeOut));
      return smoothstep(cut - 0.025, cut + 0.025, woodsField(x, z));
    }
    // In farmland most woods are whole fields, so their edges run straight along the boundaries: a field is wooded
    // where the woods field at its middle passes the cut. The free-form woods keep only their cores (on the hills).
    const { a, b } = fieldCoords(x, z);
    const ca = fieldCell(a, 0), cb = fieldCell(b, 1);
    const cellKey = (ca + 4096) * 8192 + (cb + 4096);
    let field = fieldWoods.get(cellKey);
    if (field === undefined) { field = fieldCellWoods(ca, cb); fieldWoods.set(cellKey, field); }
    const edgeOut = Math.max(Math.abs(x), Math.abs(z)) - BORDER_EDGE_M;
    const core = woodsCut + 0.06 + 0.3 * (1 - smoothstep(40, 190, edgeOut)) + 0.12 * (1 - smoothstep(190, 380, edgeOut));
    return Math.max(field, smoothstep(core, core + 0.05, woodsField(x, z)));
  }
  function fieldCellWoods(ca: number, cb: number): number {
    let na = ca + 1, nb = cb + 1;
    for (let i = 0; i < 64 && !isFieldLine(na, 0); i++) na++;
    for (let i = 0; i < 64 && !isFieldLine(nb, 1); i++) nb++;
    const mu = (ca + na) * 0.5 * FIELD_PITCH_M, mv = (cb + nb) * 0.5 * FIELD_PITCH_M;
    const mx = mu * fieldCos - mv * fieldSin, mz = mu * fieldSin + mv * fieldCos;
    // the first ~250 m past the edge stay mostly open, so from the square the eye runs over fields to the woods rising
    // behind them (a wood on the red line is the hedge the owner saw, "a treeline and then nothing")
    const open = (ex: number, ez: number) => {
      const out = Math.max(Math.abs(ex), Math.abs(ez)) - BORDER_EDGE_M;
      return 0.3 * (1 - smoothstep(40, 190, out)) + 0.12 * (1 - smoothstep(190, 380, out));
    };
    // ... and a whole field near the edge is never a wood: every corner of it stands 70 m or more past the edge
    let nearest = Infinity;
    for (const [cu, cv] of [[ca, cb], [na, cb], [na, nb], [ca, nb]]) {
      const u = cu * FIELD_PITCH_M, v = cv * FIELD_PITCH_M;
      nearest = Math.min(nearest, Math.max(Math.abs(u * fieldCos - v * fieldSin), Math.abs(u * fieldSin + v * fieldCos)) - BORDER_EDGE_M);
    }
    return nearest > 70 && woodsField(mx, mz) > woodsCut + open(mx, mz) ? 1 : 0;
  }

  if (settings.classic) {
    const classicLiftAt = (r: number): number => { const s = smoothstep(BORDER_RIM_START_M, BORDER_EDGE_M, r); return s * s * rimH; };
    return {
      settings,
      fieldAngle: 0,
      liftAt: (_x, _z, r) => classicLiftAt(r),
      rimFactorAt: () => 1,
      handOverAt: (x, z) => 1 - smoothstep(140, 460, Math.max(Math.abs(x), Math.abs(z)) - BORDER_EDGE_M),
      woodsAt: () => 0,
      hedgeAt: () => 0,
      traceHedgeLines: () => [],
      parcelTintAt: (_x, _z, out) => { out[0] = 0; out[1] = 0; out[2] = 0; out[3] = 1; return out; },
      trackAt: (_x, _z, out) => { out[0] = 0; out[1] = 0; out[2] = 0; out[3] = 0; return out; },
    };
  }

  return {
    settings,
    fieldAngle,
    hedgeAt(x: number, z: number): number {
      if (landUse) {
        // the map's own hedged boundaries (landUse.ts), from ~40 m past the edge, none in a wood
        const fade = smoothstep(25, 110, Math.max(Math.abs(x), Math.abs(z)) - BORDER_EDGE_M);
        if (fade <= 0) return 0;
        landUse.at(x, z, landUseSample);
        return landUseSample.active > 0 ? landUseSample.hedge * fade * (1 - woodsAt(x, z)) : 0;
      }
      if (settings.hedgerows <= 0) return 0;
      // no hedge along the edge itself: the field boundaries are hedged from ~40 m past it
      const fade = smoothstep(25, 110, Math.max(Math.abs(x), Math.abs(z)) - BORDER_EDGE_M);
      if (fade <= 0) return 0;
      const line = fieldBoundaryAt(x, z);
      if (line <= 0) return 0;
      // gates and gaps break every boundary; a boundary inside a wood needs no hedge
      const gaps = smoothstep(-0.3, 0.0, noise.noise(x * 0.017 + 3.3, z * 0.017 - 7.1));
      return line * gaps * fade * settings.hedgerows;
    },
    traceHedgeLines(maxOut: number, keep?: (x: number, z: number) => boolean): { xs: number[]; zs: number[]; w: number[] }[] {
      if (landUse) {
        // the map's grid: its hedged short boundaries (a walled region: every boundary, near the edge only — farther out
        // the material's own wall band carries them)
        const reach = landUse.boundary > 2.5 ? Math.min(maxOut, 260) : maxOut;
        return traceLandUseLines(landUse, BORDER_EDGE_M, reach, keep ?? (() => true),
          (x, z) => smoothstep(25, 110, Math.max(Math.abs(x), Math.abs(z)) - BORDER_EDGE_M) * (1 - woodsAt(x, z)));
      }
      const lines: { xs: number[]; zs: number[]; w: number[] }[] = [];
      if (settings.hedgerows <= 0) return lines;
      const STEP = 8, span = (BORDER_EDGE_M + maxOut) * Math.SQRT2 + 40, kMax = Math.ceil(span / FIELD_PITCH_M) + 2;
      for (let family = 0; family < 2; family++) {
        for (let k = -kMax; k <= kMax; k++) {
          if (!isFieldLine(k, family)) continue;
          let cur: { xs: number[]; zs: number[]; w: number[] } | null = null;
          const close = (): void => { if (cur && cur.xs.length >= 2) lines.push(cur); cur = null; };
          for (let s = -span; s <= span; s += STEP) {
            // the point of level k at along-coordinate s: the unwarped line, then Newton on the level (the warp is slow)
            let across = k * FIELD_PITCH_M, x = 0, z = 0;
            const at = (): void => {
              if (family === 0) { x = across * fieldCos - s * fieldSin; z = across * fieldSin + s * fieldCos; }
              else { x = s * fieldCos - across * fieldSin; z = s * fieldSin + across * fieldCos; }
            };
            at();
            const out0 = Math.max(Math.abs(x), Math.abs(z)) - BORDER_EDGE_M;
            if (out0 < -10 || out0 > maxOut + 40) { close(); continue; }
            for (let it = 0; it < 3; it++) {
              const c = fieldCoords(x, z);
              across -= ((family ? c.b : c.a) - k) * FIELD_PITCH_M;
              at();
            }
            const edgeOut = Math.max(Math.abs(x), Math.abs(z)) - BORDER_EDGE_M;
            if (edgeOut < 20 || edgeOut > maxOut || (keep && !keep(x, z))) { close(); continue; }
            const c = fieldCoords(x, z), other = fieldCell(family ? c.a : c.b, 1 - family);
            let w = 0;
            if (fieldHash(k * 3.7 + other * 11.3 + family * 5.9) <= 0.8) {
              const gaps = smoothstep(-0.3, 0.0, noise.noise(x * 0.017 + 3.3, z * 0.017 - 7.1));
              w = gaps * smoothstep(25, 110, edgeOut) * Math.min(1, settings.hedgerows * 1.25);
              if (w > 0) w *= 1 - woodsAt(x, z);
            }
            if (!cur) cur = { xs: [], zs: [], w: [] };
            cur.xs.push(x); cur.zs.push(z); cur.w.push(w);
          }
          close();
        }
      }
      return lines;
    },
    trackAt(x: number, z: number, out: [number, number, number, number]): [number, number, number, number] {
      out[0] = 0; out[1] = 0; out[2] = 0; out[3] = 0;
      if (settings.fields <= 0 || landUse) return out; // (a land-use map's tracks are the material's own lu_field)
      const edgeOut = Math.max(Math.abs(x), Math.abs(z)) - BORDER_EDGE_M;
      // the tracks come in from 20 m past the edge, narrower onto the woods (a forest ride, not a farm track)
      const presence = smoothstep(20, 80, edgeOut) * (1 - 0.6 * woodsAt(x, z)) * Math.min(1, settings.fields * 1.5);
      if (presence <= 0.02) return out;
      const { a, b } = fieldCoords(x, z);
      const a0 = a, b0 = b, e = 3;
      const ax = fieldCoords(x + e, z).a, bx = _field.b, az = fieldCoords(x, z + e).a, bz = _field.b;
      const metresPer = [e / Math.max(1e-6, Math.hypot(ax - a0, az - a0)), e / Math.max(1e-6, Math.hypot(bx - b0, bz - b0))];
      for (let family = 0; family < 2; family++) {
        const level = family ? b0 : a0, other = family ? a0 : b0;
        // the nearest track line of this family (scanning out from the nearest pitch line)
        const k0 = Math.round(level);
        let k = Number.NaN;
        for (let i = 0; i < 48 && Number.isNaN(k); i++) {
          if (isTrackLine(k0 + i, family)) k = k0 + i;
          else if (i > 0 && isTrackLine(k0 - i, family)) k = k0 - i;
        }
        let centre = 999;
        if (!Number.isNaN(k) && fieldHash(k * 2.3 + Math.floor(other / TRACK_RUN_LEVELS) * 17.9 + family * 3.3) < 0.7) {
          // the track runs 4 m off its boundary (beside the hedge), on the boundary's +level side
          centre = Math.max(-999, Math.min(999, ((level - k) * metresPer[family] - 4) / presence));
        }
        out[family * 2] = centre + 1000;
        out[family * 2 + 1] = Number.isNaN(k) ? 0 : k;
      }
      return out;
    },
    parcelTintAt(x: number, z: number, out: [number, number, number, number]): [number, number, number, number] {
      out[0] = 0; out[1] = 0; out[2] = 0; out[3] = 1;
      if (landUse) {
        // a land-use map: the material draws the map's own fields past the edge; the attribute carries only where they
        // may lie — off the woods, thinning onto the crests (no fade: the fields run straight across the edge)
        out[3] = 1 - (1 - woodsAt(x, z)) * (1 - 0.7 * smoothstep(0.62, 0.92, hillsAt(x, z)));
        return out;
      }
      if (settings.fields <= 0) return out;
      const edgeOut = Math.max(Math.abs(x), Math.abs(z)) - BORDER_EDGE_M;
      const fade = smoothstep(0, 40, edgeOut);
      if (fade <= 0) return out;
      // farmland keeps to the gentler ground: off the woods, thinning onto the crests of the hills
      const w0 = Math.min(1, settings.fields * 1.25) * fade * (1 - woodsAt(x, z)) * (1 - 0.7 * smoothstep(0.62, 0.92, hillsAt(x, z)));
      if (w0 <= 0.002) return out;
      const { a, b } = fieldCoords(x, z);
      const id = fieldCell(a, 0) * 7919 + fieldCell(b, 1) * 104729;
      // (a pasture's sward varies more from field to field than a crop's colour: lush, grazed, cut for hay)
      const crop = cropOf(settings.crops, fieldHash(id)), pasture = crop[3] < 1;
      const bright = (pasture ? 0.78 : 0.9) + (pasture ? 0.44 : 0.2) * fieldHash(id + 31), w = w0 * crop[3];
      out[0] = crop[0] * bright * w; out[1] = crop[1] * bright * w; out[2] = crop[2] * bright * w; out[3] = 1 - w;
      return out;
    },
    woodsAt,
    liftAt(x: number, z: number, r: number): number {
      if (r <= BORDER_RIM_START_M) return 0;
      const a = enclosureAt(x, z);
      const k = nearLevelAt(x, z, a) / RIM_AT_PLAYABLE;
      const s = smoothstep(BORDER_RIM_START_M, BORDER_EDGE_M, r);
      const square = s * s * k;
      let lift = square;
      if (r > BORDER_PLAYABLE_M) {
        const w = smoothstep(BORDER_PLAYABLE_M, BORDER_PLAYABLE_M + HANDOVER_M, r);
        lift = square + (outlandLevel(x, z, r, a) - square) * w;
      }
      return lift * rimH;
    },
    rimFactorAt(x: number, z: number): number {
      return nearLevelAt(x, z, enclosureAt(x, z)) / RIM_AT_PLAYABLE;
    },
    handOverAt(x: number, z: number): number {
      const edgeOut = Math.max(Math.abs(x), Math.abs(z)) - BORDER_EDGE_M;
      const wander = noise.noise(x * 0.0019 - 71.7, z * 0.0019 + 14.9) * 110;
      return 1 - smoothstep(330, 820, edgeOut + wander - (holdValleys.length ? holdAt(x, z) : 0));
    },
  };
}
