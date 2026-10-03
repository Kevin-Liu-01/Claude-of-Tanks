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
 * A road keeps the classic rim across the playable band (its grades were authored on that rim, and a road's grade is a
 * driving law): full within ROAD_HOLD_IN_M of its centre line, the landform from ROAD_HOLD_OUT_M, handed over to the
 * landform between the red line and the edge — so a road leaves the square over a low rise, never on an embankment.
 */
const ROAD_HOLD_IN_M = 18;
const ROAD_HOLD_OUT_M = 95;
/**
 * The field system past the edge: two families of near-straight lines (one per map, 7–21° off the square's axes so no
 * hedge runs along the red line; warped ±22 m over a kilometre) on a 46 m pitch. A share of each family's pitch lines
 * are field boundaries — fields from 46 m strips to ~600 m blocks, never a closed loop — and a share of those carry a
 * farm track. Shares per crops style: [family a, family b].
 */
const FIELD_PITCH_M = 46;
const FIELD_LINE_SHARE: Record<'temperate' | 'steppe' | 'polder', [number, number]> = {
  temperate: [0.24, 0.18], steppe: [0.09, 0.07], polder: [0.55, 0.08],
};
/** Of the field boundaries, the share that carries a farm track (in runs of ~320 m, 70 % of them laid). */
const TRACK_LINE_SHARE = 0.42;
const TRACK_RUN_LEVELS = 7;
const _field = { a: 0, b: 0 };
function fieldHash(n: number): number {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}
/** A parcel's albedo multiplier: the crop by `roll`, its season's shade by `shade`. */
function cropTint(crops: 'temperate' | 'steppe' | 'polder', roll: number, shade: number): [number, number, number] {
  const k = 0.92 + shade * 0.16;
  if (crops === 'steppe') {
    if (roll < 0.45) return [1.16 * k, 1.07 * k, 0.80 * k];      // stubble, gold
    if (roll < 0.72) return [0.80 * k, 0.70 * k, 0.58 * k];      // plough, brown
    if (roll < 0.9) return [1.06 * k, 1.02 * k, 0.86 * k];       // pale straw
    return [1, 1, 1];
  }
  if (crops === 'polder') {
    if (roll < 0.42) return [0.88 * k, 1.02 * k, 0.82 * k];      // pasture
    if (roll < 0.66) return [0.82 * k, 0.74 * k, 0.62 * k];      // plough
    if (roll < 0.8) return [1.22 * k, 1.16 * k, 0.66 * k];       // rapeseed
    return [1, 1, 1];
  }
  if (roll < 0.28) return [1.14 * k, 1.06 * k, 0.80 * k];        // stubble / hay
  if (roll < 0.48) return [0.82 * k, 0.73 * k, 0.62 * k];        // plough
  if (roll < 0.66) return [0.90 * k, 1.03 * k, 0.84 * k];        // pasture
  if (roll < 0.8) return [0.98 * k, 0.88 * k, 0.88 * k];         // fallow
  return [1, 1, 1];
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
  /**
   * The rim as it stood before the border landform (the classic S-curve and the plateau rimH over the geology past the
   * edge, the old 140–460 m ring hand-over, no woods field): the receipts that replay a pre-landform failure build
   * their predecessor and current fields with it. Not a map setting.
   */
  classic?: boolean;
}

/** Defaults by horizon style (the ring's character beyond): enclosed valleys and canyons, open rolling country. */
const STYLE_DEFAULTS: Readonly<Record<string, BorderLandformSettings>> = {
  rolling: { enclosure: 0.42, hillHeight: 1.9, reachM: 260, rimFloor: 0.22, wavelengthM: 560, ridged: 0.2, terrace: 0, forest: 0.34, hedgerows: 0.7, fields: 0.6, crops: 'temperate' },
  escarpment: { enclosure: 0.5, hillHeight: 2.0, reachM: 240, rimFloor: 0.25, wavelengthM: 540, ridged: 0.35, terrace: 0.25, forest: 0.3, hedgerows: 0.45, fields: 0.45, crops: 'temperate' },
  alpine: { enclosure: 0.7, hillHeight: 2.3, reachM: 220, rimFloor: 0.35, wavelengthM: 520, ridged: 0.6, terrace: 0, forest: 0.42, hedgerows: 0.15, fields: 0.15, crops: 'temperate' },
  mesa: { enclosure: 0.55, hillHeight: 1.9, reachM: 240, rimFloor: 0.3, wavelengthM: 560, ridged: 0.3, terrace: 0.85, forest: 0.06, hedgerows: 0, fields: 0, crops: 'temperate' },
};

/**
 * Each map's border character over its style's defaults, from the map's own identity (docs/MAP-BEAUTIFICATION.md,
 * "Per-map identity"): open steppe and airfield country with sparse woods, flat deltas, polders and tidal flats, wooded
 * valleys and logging country, tablelands and canyons, mountain valleys. A map config's `terrain.border` overrides it.
 */
const MAP_BORDERS: Readonly<Record<string, Partial<BorderLandformSettings>>> = {
  verdant: { forest: 0.36, hedgerows: 0.85, fields: 0.75 },
  desert: { forest: 0.03, enclosure: 0.5, hedgerows: 0, fields: 0 },
  winter: { forest: 0.44, hedgerows: 0.2, fields: 0.1 },
  urban: { forest: 0.28, hedgerows: 0.5, fields: 0.45 },
  coastal: { forest: 0.24, enclosure: 0.36, hedgerows: 0.55, fields: 0.5 },
  autumn: { forest: 0.42, enclosure: 0.5, hedgerows: 0.9, fields: 0.8 },
  steppe: { enclosure: 0.12, hillHeight: 1.25, reachM: 340, rimFloor: 0.18, wavelengthM: 760, forest: 0.07, hedgerows: 0.55, fields: 0.85, crops: 'steppe' },
  railyard: { forest: 0.22, hedgerows: 0.3, fields: 0.35 },
  frontier: { forest: 0.36, enclosure: 0.5, hedgerows: 0.6, fields: 0.6 },
  fjord: { forest: 0.42, fields: 0.1 },
  delta: { enclosure: 0.08, hillHeight: 0.6, reachM: 360, rimFloor: 0.15, wavelengthM: 700, forest: 0.26, hedgerows: 0.35, fields: 0.55, crops: 'polder' },
  monsoon: { forest: 0.6, fields: 0.25 },
  alpine: { forest: 0.32, fields: 0.05 },
  caldera: { forest: 0.06, terrace: 0.55, ridged: 0.45, hedgerows: 0, fields: 0 },
  foundry: { forest: 0.2, hedgerows: 0.35, fields: 0.3 },
  ruinspires: { forest: 0.1, hedgerows: 0.2, fields: 0.1 },
  blackglass: { forest: 0.1, hedgerows: 0.2, fields: 0.1 },
  titan_gorge: { forest: 0.02, hedgerows: 0 },
  skybridge: { forest: 0.05, hedgerows: 0 },
  polders: { enclosure: 0.04, hillHeight: 0.35, reachM: 420, rimFloor: 0.12, wavelengthM: 820, forest: 0.12, hedgerows: 0.55, fields: 0.8, crops: 'polder' },
  copper_mesa: { forest: 0.03, hedgerows: 0 },
  airfield: { enclosure: 0.18, hillHeight: 1.2, reachM: 360, rimFloor: 0.18, wavelengthM: 700, forest: 0.22, hedgerows: 0.4, fields: 0.6, crops: 'steppe' },
  oasis: { enclosure: 0.32, hillHeight: 1.3, forest: 0.02, hedgerows: 0, fields: 0 },
  whiteout: { forest: 0.08, ridged: 0.4, hedgerows: 0, fields: 0 },
  orchard: { forest: 0.4, hedgerows: 0.75, fields: 0.65 },
  longleaf: { forest: 0.62, hedgerows: 0.2, fields: 0.15 },
  mangrove: { enclosure: 0.04, hillHeight: 0.35, reachM: 420, rimFloor: 0.12, wavelengthM: 820, forest: 0.42, hedgerows: 0, fields: 0 },
  saltwind: { forest: 0.14, terrace: 0.35, hedgerows: 0.35, fields: 0.3, crops: 'steppe' },
  reservoir: { forest: 0.5, fields: 0.15 },
  mars: { forest: 0, hedgerows: 0, fields: 0 },
  moon: { forest: 0, hillHeight: 1.6, hedgerows: 0, fields: 0 },
  cliffbridge: { forest: 0.36, hedgerows: 0.7, fields: 0.65 },
};

export function resolveBorderLandform(
  style: string | undefined, authored?: Partial<BorderLandformSettings> | null, mapId?: string,
): BorderLandformSettings {
  return { ...(STYLE_DEFAULTS[style ?? 'rolling'] ?? STYLE_DEFAULTS.rolling), ...(mapId ? MAP_BORDERS[mapId] ?? {} : {}), ...(authored ?? {}) };
}

export interface BorderLandform {
  readonly settings: BorderLandformSettings;
  /**
   * The rim lift in metres at (x, z) for a square radius r (max(|x|, |z|)), replacing rimH · s(r)²: below 430 m nothing,
   * inside the playable square the classic curve times the rim factor (<= 1), past the playable edge the outland's
   * hills. Callers keep their water, coast and road weights on top. Given the distance to the nearest road, the band
   * keeps the classic rim along it (ROAD_HOLD_IN_M … ROAD_HOLD_OUT_M), handed over to the landform by the edge.
   */
  liftAt(x: number, z: number, r: number, roadDistance?: number): number;
  /** The classic rim lift rimH · s(r)² (s = smoothstep(430, 512, r)): what authoring queries (road grades, pads) keep. */
  classicLiftAt(r: number): number;
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
   * The parcel the land past the edge belongs to, as an albedo offset (multiplier − 1, already weighted): stubble, plough,
   * pasture or fallow between the hedgerows, faded in from 30 to 150 m past the edge, off the woods and the crests.
   * Zero wherever there are no fields — a geometry without the attribute reads the same.
   */
  parcelTintAt(x: number, z: number, out: [number, number, number]): [number, number, number];
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

/**
 * A place where the border keeps the classic rim: a railway that leaves the square runs through a cutting into a tunnel
 * in the hill the old rim stood for (railSpurs.ts, rounds 63 and 67 — the bed, the batter faces, the portal and its
 * gallery are measured against that rim and its plateau), so within the anchor's radius the lift is the classic rim and
 * plateau, fading back to the landform over its outer half.
 */
export interface BorderAnchor { x: number; z: number; radius: number }
/** A road leaving the square (terrain.ts buildRoadExitLines): the land opens into a valley along its line. */
export interface BorderValley { xs: ArrayLike<number>; zs: ArrayLike<number>; minX: number; maxX: number; minZ: number; maxZ: number }
const VALLEY_FLOOR_M = 70, VALLEY_SIDE_M = 190;

/**
 * The map's border landform. `rimH` is the map's authored rim height (TerrainSettings.rimH) — the scale every height
 * here is measured in, so a 58 m canyon rim and an 18 m polder dike keep their proportions.
 */
export function createBorderLandform(
  seed: number, rimH: number, settings: BorderLandformSettings, anchors: readonly BorderAnchor[] = [],
  valleys: readonly BorderValley[] = [],
): BorderLandform {
  const noise = new SimplexNoise({ random: mulberry32((seed ^ 0xB0BDE5) >>> 0) });
  const { enclosure, hillHeight, reachM, rimFloor, wavelengthM, ridged, terrace } = settings;
  const inv = 1 / Math.max(120, wavelengthM);
  const bias = (Math.max(0, Math.min(1, enclosure)) * 2 - 1) * 0.75;

  /** 0..1: enclosed (hills close to the edge) vs open, a ~1.2 km field so a side changes character once or twice. */
  function anchorAt(x: number, z: number): number {
    let w = 0;
    for (let i = 0; i < anchors.length; i++) {
      const anchor = anchors[i];
      w = Math.max(w, 1 - smoothstep(anchor.radius * 0.55, anchor.radius, Math.hypot(x - anchor.x, z - anchor.z)));
    }
    return w;
  }
  /** 1 on a leaving road's line, 0 by VALLEY_SIDE_M from it (bounding boxes first: most queries touch no line). */
  function valleyAt(x: number, z: number): number {
    let best = VALLEY_SIDE_M;
    for (let v = 0; v < valleys.length; v++) {
      const line = valleys[v];
      if (x < line.minX - best || x > line.maxX + best || z < line.minZ - best || z > line.maxZ + best) continue;
      for (let i = 0; i + 1 < line.xs.length; i++) {
        const ax = line.xs[i], az = line.zs[i], bx = line.xs[i + 1] - ax, bz = line.zs[i + 1] - az;
        const t = Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz)));
        const d = Math.hypot(x - ax - bx * t, z - az - bz * t);
        if (d < best) best = d;
      }
    }
    return 1 - smoothstep(VALLEY_FLOOR_M, VALLEY_SIDE_M, best);
  }
  function enclosureAt(x: number, z: number): number {
    const e = noise.noise(x * 0.00082 + 17.3, z * 0.00082 - 41.9) * 0.8 + noise.noise(x * 0.0019 - 5.1, z * 0.0019 + 23.7) * 0.25;
    let a = smoothstep(-0.55, 0.55, e + bias);
    if (valleys.length) a *= 1 - 0.9 * valleyAt(x, z);
    return anchors.length ? Math.max(a, anchorAt(x, z)) : a;  // (an anchored sector reads as enclosed for the woods and rim)
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
  function hillsAt(x: number, z: number): number {
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
    const crest = hillHeight * (0.12 + 0.88 * h) * (0.5 + 0.5 * a) * grow;
    const ramp = smoothstep(-25, reach, d);
    return near + (crest - near) * ramp;
  }

  // the field system (FIELD_PITCH_M): this map's orientation, and its share of boundaries per family
  const fieldRand = mulberry32((seed ^ 0xF1E1D5) >>> 0);
  const fieldAngle = (fieldRand() < 0.5 ? -1 : 1) * (0.12 + 0.24 * fieldRand());
  const fieldCos = Math.cos(fieldAngle), fieldSin = Math.sin(fieldAngle);
  const fieldShare = FIELD_LINE_SHARE[settings.crops] ?? FIELD_LINE_SHARE.temperate;
  /** The two families' pitch levels at (x, z): continuous, a pitch line on every whole level. */
  function fieldCoords(x: number, z: number): { a: number; b: number } {
    const u = x * fieldCos + z * fieldSin, v = z * fieldCos - x * fieldSin;
    _field.a = (u + 22 * noise.noise(x * 0.0011 + 5.1, z * 0.0011 - 3.7)) / FIELD_PITCH_M;
    _field.b = (v + 22 * noise.noise(x * 0.0011 - 8.2, z * 0.0011 + 6.6)) / FIELD_PITCH_M;
    return _field;
  }
  const lineHash = (k: number, family: number): number => fieldHash(k * 1.618 + family * 311.7 + 0.5);
  const isFieldLine = (k: number, family: number): boolean => lineHash(k, family) < fieldShare[family];
  const isTrackLine = (k: number, family: number): boolean => lineHash(k, family) < fieldShare[family] * TRACK_LINE_SHARE;
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

  function woodsAt(x: number, z: number): number {
    if (!Number.isFinite(woodsCut)) return woodsCut < 0 ? 1 : 0;
    if (settings.fields <= 0) return smoothstep(woodsCut - 0.025, woodsCut + 0.025, woodsField(x, z));
    // In farmland most woods are whole fields, so their edges run straight along the boundaries: a field is wooded
    // where the woods field at its middle passes the cut. The free-form woods keep only their cores (on the hills).
    const { a, b } = fieldCoords(x, z);
    const ca = fieldCell(a, 0), cb = fieldCell(b, 1);
    let na = ca + 1, nb = cb + 1;
    for (let i = 0; i < 64 && !isFieldLine(na, 0); i++) na++;
    for (let i = 0; i < 64 && !isFieldLine(nb, 1); i++) nb++;
    const mu = (ca + na) * 0.5 * FIELD_PITCH_M, mv = (cb + nb) * 0.5 * FIELD_PITCH_M;
    const mx = mu * fieldCos - mv * fieldSin, mz = mu * fieldSin + mv * fieldCos;
    // the first ~250 m past the edge stay mostly open, so from the square the eye runs over fields to the woods rising
    // behind them (a wood on the red line is the hedge the owner saw, "a treeline and then nothing")
    const open = (ex: number, ez: number) => 0.14 * (1 - smoothstep(110, 360, Math.max(Math.abs(ex), Math.abs(ez)) - BORDER_EDGE_M));
    const field = woodsField(mx, mz) > woodsCut + open(mx, mz) ? 1 : 0;
    const core = woodsCut + 0.06 + open(x, z);
    return Math.max(field, smoothstep(core, core + 0.05, woodsField(x, z)));
  }

  if (settings.classic) {
    const classicLiftAt = (r: number): number => { const s = smoothstep(BORDER_RIM_START_M, BORDER_EDGE_M, r); return s * s * rimH; };
    return {
      settings,
      liftAt: (_x, _z, r) => classicLiftAt(r),
      classicLiftAt,
      rimFactorAt: () => 1,
      handOverAt: (x, z) => 1 - smoothstep(140, 460, Math.max(Math.abs(x), Math.abs(z)) - BORDER_EDGE_M),
      woodsAt: () => 0,
      hedgeAt: () => 0,
      parcelTintAt: (_x, _z, out) => { out[0] = 0; out[1] = 0; out[2] = 0; return out; },
      trackAt: (_x, _z, out) => { out[0] = 0; out[1] = 0; out[2] = 0; out[3] = 0; return out; },
    };
  }

  return {
    settings,
    hedgeAt(x: number, z: number): number {
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
    trackAt(x: number, z: number, out: [number, number, number, number]): [number, number, number, number] {
      out[0] = 0; out[1] = 0; out[2] = 0; out[3] = 0;
      if (settings.fields <= 0) return out;
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
    parcelTintAt(x: number, z: number, out: [number, number, number]): [number, number, number] {
      out[0] = 0; out[1] = 0; out[2] = 0;
      if (settings.fields <= 0) return out;
      const edgeOut = Math.max(Math.abs(x), Math.abs(z)) - BORDER_EDGE_M;
      const fade = smoothstep(30, 150, edgeOut);
      if (fade <= 0) return out;
      // farmland keeps to the gentler ground: off the woods, thinning onto the crests of the hills
      const w = settings.fields * fade * (1 - woodsAt(x, z)) * (1 - 0.7 * smoothstep(0.62, 0.92, hillsAt(x, z)));
      if (w <= 0.002) return out;
      const { a, b } = fieldCoords(x, z);
      const id = fieldCell(a, 0) * 7919 + fieldCell(b, 1) * 104729;
      const roll = fieldHash(id), shade = fieldHash(id + 31);
      const crop = cropTint(settings.crops, roll, shade);
      out[0] = (crop[0] - 1) * w; out[1] = (crop[1] - 1) * w; out[2] = (crop[2] - 1) * w;
      return out;
    },
    woodsAt,
    liftAt(x: number, z: number, r: number, roadDistance = Infinity): number {
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
      if (anchors.length) {
        const c = anchorAt(x, z);
        if (c > 0) lift += (s * s - lift) * c; // the classic rim and its plateau (s = 1 past the edge)
      }
      if (roadDistance < ROAD_HOLD_OUT_M && r < BORDER_EDGE_M) {
        const hold = (1 - smoothstep(ROAD_HOLD_IN_M, ROAD_HOLD_OUT_M, roadDistance))
          * (1 - smoothstep(BORDER_PLAYABLE_M - 2, BORDER_EDGE_M, r));
        lift += (s * s - lift) * hold;
      }
      return lift * rimH;
    },
    classicLiftAt(r: number): number {
      const s = smoothstep(BORDER_RIM_START_M, BORDER_EDGE_M, r);
      return s * s * rimH;
    },
    rimFactorAt(x: number, z: number): number {
      const k = nearLevelAt(x, z, enclosureAt(x, z)) / RIM_AT_PLAYABLE;
      return anchors.length ? k + (1 - k) * anchorAt(x, z) : k;
    },
    handOverAt(x: number, z: number): number {
      const edgeOut = Math.max(Math.abs(x), Math.abs(z)) - BORDER_EDGE_M;
      const wander = noise.noise(x * 0.0019 - 71.7, z * 0.0019 + 14.9) * 110;
      const landform = 1 - smoothstep(330, 820, edgeOut + wander);
      if (!anchors.length) return landform;
      // an anchored sector hands over by the classic law (the tunnel's gallery meets the ring's first ridge at 200 m)
      const classic = 1 - smoothstep(140, 460, edgeOut);
      return landform + (classic - landform) * anchorAt(x, z);
    },
  };
}
