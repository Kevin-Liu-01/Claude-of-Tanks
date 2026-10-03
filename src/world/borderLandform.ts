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
}

/** Defaults by horizon style (the ring's character beyond): enclosed valleys and canyons, open rolling country. */
const STYLE_DEFAULTS: Readonly<Record<string, BorderLandformSettings>> = {
  rolling: { enclosure: 0.42, hillHeight: 1.9, reachM: 260, rimFloor: 0.22, wavelengthM: 560, ridged: 0.2, terrace: 0, forest: 0.34, hedgerows: 0.7 },
  escarpment: { enclosure: 0.5, hillHeight: 2.0, reachM: 240, rimFloor: 0.25, wavelengthM: 540, ridged: 0.35, terrace: 0.25, forest: 0.3, hedgerows: 0.45 },
  alpine: { enclosure: 0.7, hillHeight: 2.3, reachM: 220, rimFloor: 0.35, wavelengthM: 520, ridged: 0.6, terrace: 0, forest: 0.42, hedgerows: 0.15 },
  mesa: { enclosure: 0.55, hillHeight: 1.9, reachM: 240, rimFloor: 0.3, wavelengthM: 560, ridged: 0.3, terrace: 0.85, forest: 0.06, hedgerows: 0 },
};

/**
 * Each map's border character over its style's defaults, from the map's own identity (docs/MAP-BEAUTIFICATION.md,
 * "Per-map identity"): open steppe and airfield country with sparse woods, flat deltas, polders and tidal flats, wooded
 * valleys and logging country, tablelands and canyons, mountain valleys. A map config's `terrain.border` overrides it.
 */
const MAP_BORDERS: Readonly<Record<string, Partial<BorderLandformSettings>>> = {
  verdant: { forest: 0.36, hedgerows: 0.85 },
  desert: { forest: 0.03, enclosure: 0.5, hedgerows: 0 },
  winter: { forest: 0.44, hedgerows: 0.2 },
  urban: { forest: 0.28, hedgerows: 0.5 },
  coastal: { forest: 0.24, enclosure: 0.36, hedgerows: 0.55 },
  autumn: { forest: 0.42, enclosure: 0.5, hedgerows: 0.9 },
  steppe: { enclosure: 0.12, hillHeight: 1.25, reachM: 340, rimFloor: 0.18, wavelengthM: 760, forest: 0.07, hedgerows: 0.55 },
  railyard: { forest: 0.22, hedgerows: 0.3 },
  frontier: { forest: 0.36, enclosure: 0.5, hedgerows: 0.6 },
  fjord: { forest: 0.42 },
  delta: { enclosure: 0.08, hillHeight: 0.6, reachM: 360, rimFloor: 0.15, wavelengthM: 700, forest: 0.26, hedgerows: 0.35 },
  monsoon: { forest: 0.6 },
  alpine: { forest: 0.32 },
  caldera: { forest: 0.06, terrace: 0.55, ridged: 0.45, hedgerows: 0 },
  foundry: { forest: 0.2, hedgerows: 0.35 },
  ruinspires: { forest: 0.1, hedgerows: 0.2 },
  blackglass: { forest: 0.1, hedgerows: 0.2 },
  titan_gorge: { forest: 0.02, hedgerows: 0 },
  skybridge: { forest: 0.05, hedgerows: 0 },
  polders: { enclosure: 0.04, hillHeight: 0.35, reachM: 420, rimFloor: 0.12, wavelengthM: 820, forest: 0.12, hedgerows: 0.55 },
  copper_mesa: { forest: 0.03, hedgerows: 0 },
  airfield: { enclosure: 0.18, hillHeight: 1.2, reachM: 360, rimFloor: 0.18, wavelengthM: 700, forest: 0.22, hedgerows: 0.4 },
  oasis: { enclosure: 0.32, hillHeight: 1.3, forest: 0.02, hedgerows: 0 },
  whiteout: { forest: 0.08, ridged: 0.4, hedgerows: 0 },
  orchard: { forest: 0.4, hedgerows: 0.75 },
  longleaf: { forest: 0.62, hedgerows: 0.2 },
  mangrove: { enclosure: 0.04, hillHeight: 0.35, reachM: 420, rimFloor: 0.12, wavelengthM: 820, forest: 0.42, hedgerows: 0 },
  saltwind: { forest: 0.14, terrace: 0.35, hedgerows: 0.35 },
  reservoir: { forest: 0.5 },
  mars: { forest: 0, hedgerows: 0 },
  moon: { forest: 0, hillHeight: 1.6, hedgerows: 0 },
  cliffbridge: { forest: 0.36, hedgerows: 0.7 },
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
   * hills. Callers keep their water, coast and road weights on top.
   */
  liftAt(x: number, z: number, r: number): number;
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
 * A place where the border must stay enclosed and high: a railway cutting's tunnel (railSpurs.ts) runs into the hill
 * the old rim stood for, so the landform keeps the full rim and a hill over it there, wherever the map is open.
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
    return anchors.length ? Math.max(a, anchorAt(x, z)) : a;
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
    let h = anchors.length ? Math.max(hillsAt(x, z), 0.8 * anchorAt(x, z)) : hillsAt(x, z);
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

  return {
    settings,
    hedgeAt(x: number, z: number): number {
      if (settings.hedgerows <= 0) return 0;
      // two families of field boundaries (the isolines of two ~330 m fields, at different stretches so the parcels are
      // not square), a 2–3 m line each, broken by gates and gaps; parcels inside woods need no hedge
      const a = noise.noise(x * 0.0030 + 71.3, z * 0.0024 - 12.9), b = noise.noise(x * 0.0022 - 44.1, z * 0.0033 + 90.7);
      const line = Math.max(1 - smoothstep(0.008, 0.018, Math.abs(a)), 1 - smoothstep(0.008, 0.018, Math.abs(b)));
      if (line <= 0) return 0;
      const gaps = smoothstep(-0.25, 0.05, noise.noise(x * 0.017 + 3.3, z * 0.017 - 7.1));
      return line * gaps * settings.hedgerows;
    },
    woodsAt(x: number, z: number): number {
      if (!Number.isFinite(woodsCut)) return woodsCut < 0 ? 1 : 0;
      return smoothstep(woodsCut - 0.025, woodsCut + 0.025, woodsField(x, z));
    },
    liftAt(x: number, z: number, r: number): number {
      if (r <= BORDER_RIM_START_M) return 0;
      const a = enclosureAt(x, z);
      const k = nearLevelAt(x, z, a) / RIM_AT_PLAYABLE;
      const s = smoothstep(BORDER_RIM_START_M, BORDER_EDGE_M, r);
      const square = s * s * k;
      if (r <= BORDER_PLAYABLE_M) return square * rimH;
      const w = smoothstep(BORDER_PLAYABLE_M, BORDER_PLAYABLE_M + HANDOVER_M, r);
      return (square + (outlandLevel(x, z, r, a) - square) * w) * rimH;
    },
    classicLiftAt(r: number): number {
      const s = smoothstep(BORDER_RIM_START_M, BORDER_EDGE_M, r);
      return s * s * rimH;
    },
    rimFactorAt(x: number, z: number): number {
      return nearLevelAt(x, z, enclosureAt(x, z)) / RIM_AT_PLAYABLE;
    },
    handOverAt(x: number, z: number): number {
      const edgeOut = Math.max(Math.abs(x), Math.abs(z)) - BORDER_EDGE_M;
      const wander = noise.noise(x * 0.0019 - 71.7, z * 0.0019 + 14.9) * 110;
      return 1 - smoothstep(330, 820, edgeOut + wander);
    },
  };
}
