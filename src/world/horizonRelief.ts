// src/world/horizonRelief.ts — round 72 (2026-09-25, owner, looking at Whiteout under the round-71 clouds: "the
// mountains look so flat and untextured and boring, while the clouds look so good"): the ring's mountain relief and
// its baked surface. Pure and deterministic from the map seed, Node-runnable (no DOM), so the receipts measure it.
//
// Two things live here:
//  1. THE RELIEF FIELD — a ridged multifractal over a warped world plane (after Musgrave's ridged multifractal: each
//     octave's ridge is weighted by the one below it, so crests sharpen where the coarse ridge already stands and
//     the valleys between stay smooth), with an erosion vocabulary: gullies elongated downslope (radial on the
//     ring), a talus apron at the concave foot of a face where the fine relief damps out, rounded shoulders low on a
//     face and sharp crests high on it, each with a per-map CHARACTER (polar, alpine, rolling, mesa, volcanic,
//     coastal, martian, karst). The field is split by wavelength: the octaves the ring mesh can carry (about 15–25 m
//     of vertex spacing on the ranges) displace the authored and interpolated rows in maps/horizon.ts; the octaves it
//     cannot go into the bake below, so nothing is drawn twice.
//  2. THE SURFACE BAKE — an (angle x radius) RGBA8 atlas over the annulus, built once per map at world activation in
//     slices (a generator, like the terrain build): R/G the fine relief's world-xz gradient (the detail normal the
//     fragment adds to the geometric slope), B a horizon-based ambient occlusion of the whole height field (valleys
//     and the foot of a crest darken), A the sun's visibility across the ranges at the map's fixed sun (the ridges'
//     own cast shadows). The fragment (horizonVista.ts) reads it by the ring's own u (the angle) and its radius.
import { SimplexNoise } from '../engine/simplexFast.ts';
import { erosionOctave, type MassifSettings } from './horizonMassif.ts';

export type HorizonReliefCharacter = 'polar' | 'alpine' | 'rolling' | 'mesa' | 'volcanic' | 'coastal' | 'martian' | 'karst';

export interface HorizonFarRangeSettings {
  /** Peak height (m) over the far ring's foot at full amplitude, before the deck ceiling. */
  ampM: number;
  /** Fraction of the peak height the ranges keep as their lowest saddles. */
  floor: number;
  /** Haze toward the fog tint on the inner and the outer rows (0..1). */
  hazeIn: number;
  hazeOut: number;
  /** Snow above this fraction of the peak height (2 = none). */
  snowline: number;
  /** Ridge sharpness of the far silhouette (1 plain ridge, higher = spires). */
  sharpness: number;
}

export interface HorizonReliefSettings {
  character: HorizonReliefCharacter;
  /** Metres of coarse relief (the geometry's share) at full weight. */
  lowAmpM: number;
  /** Metres of fine relief (the bake's share) at full weight. */
  highAmpM: number;
  /** Domain warp reach (m) and wavelength (m): ridgelines bend instead of running straight. */
  warpM: number;
  warpWavelengthM: number;
  /** Wavelength (m) of the first (coarsest) octave; every octave halves it. */
  wavelengthM: number;
  /** Ridge exponent at the crests (high on a face) and at the foot (low): > 1 sharpens, < 1 rounds. */
  crestSharpness: number;
  footSharpness: number;
  /** 0..1 share of billow (rounded |n| humps) over ridge (1 - |n| crests). */
  billow: number;
  /** Gully depth (m), across-slope wavelength (m) and downslope elongation (x). */
  gullyM: number;
  gullyWavelengthM: number;
  gullyElongation: number;
  /** Downslope stretch of the fine octaves (x): spurs and chutes run down a face instead of blobs (< 1 stretches along the strike). */
  /** Round 72b: 1.3–2.0 (was 1.6–3.5 — at three the fine crests were a radial comb on every face, "corrugated cardboard"). */
  fineElongation: number;
  /** Height multiplier on the ranges behind the first ridge: the ridge stays the terrain-material foothill the seam
   * laws seat, the ranges behind it — the vista's — stand over it (1 keeps the ladder's authored proportions). */
  rangeBoost: number;
  /** Round 72b: how many ranges (each with its own axis, azimuth, depth band and height) the coarse field is built from. */
  rangeCount: number;
  /** Round 72b: the ridgeline's elongation along its axis (the across wavelength is the character's wavelengthM). */
  rangeElongation: number;
  /** How much of the fine relief survives at a concave foot (the talus apron). */
  talusFloor: number;
  /** Round 72c: wind-drift (sastrugi) height (m) on the gentle snow faces — the apron between the playable edge and the
   * first ridge read as a flat sheet; 0 on every character but the polar. */
  driftM: number;
  /** Ambient-occlusion reach (m) and strength (0..1 of the raw occlusion). */
  aoReachM: number;
  aoStrength: number;
  /** Softness of the baked sun shadow edge (slope units, ~tan of the penumbra angle). */
  shadowSoft: number;
  /** The far range behind the ring, or null for none. */
  far: HorizonFarRangeSettings | null;
  /** The mountains lane (2026-10-02): the erosion pass over the ranged relief (horizonMassif.ts), or null for none. */
  massif: MassifSettings | null;
  /** The mountains lane (2026-10-03): the bake's fine relief cut along the ring's own fall line, or null for the round-72
   * field (the tablelands keep it: their ledges run along the strike). */
  drainage: HorizonReliefDrainage | null;
  /** The mountains lane (2026-10-03): the landcover the bake lays on the faces past the ring forest, or null for none. */
  cover: HorizonReliefCover | null;
}

/**
 * The mountains lane (2026-10-03, gauntlet wave 0: "both flanks of the background mountain range show an obviously
 * repeating diagonal corduroy ridge pattern — a tiled displacement/normal-map tell"). The round-72 fine relief ran its
 * octaves and its gullies in the ring's own (arc, radius) frame, stretched along the RADIUS: on a face the viewer sees
 * obliquely — every flank of a range that runs across the view — the radius is not the fall line, so the stretched
 * crests crossed the slope as parallel diagonal combs, the same spacing over the whole flank. The drainage is cut along
 * the fall line of the ring's own (smoothed) surface instead, Clay John's erosion filter as the massifs use it
 * (horizonMassif.ts erosionOctave): couloirs whose spacing and depth follow the slope, each finer octave turned by the
 * coarser ones, so they branch, bend round the spurs and stop on the floors.
 */
export interface HorizonReliefDrainage {
  /** Couloir spacing (m) of the coarsest octave; each further octave halves it. */
  wavelengthM: number;
  octaves: number;
  /** Couloir depth (m) of the coarsest octave on a full-weight slope (the floors carry none). */
  depthM: number;
  /** Depth ratio between successive octaves. */
  gain: number;
  /** Couloirs per cell per unit of slope (a steeper face carries more). */
  slopeStrength: number;
  /** How strongly the coarser octaves' own slope turns the finer ones (the branching). */
  branch: number;
  /** Metres of isotropic grain under the couloirs (no direction, so no comb). */
  grainM: number;
}

/**
 * The mountains lane (2026-10-03, gauntlet wave 0: "smooth, evenly lit mountain blankets with no forest, rock or gully
 * structure"): the ring's faces render with the battlefield's terrain material, one ground everywhere, and its range
 * trees stop at 880 m (horizonVista.ts buildHorizonForest: past it a dark crown floated over a pale face), so the
 * ranges behind were bare turf. The bake lays the landcover a real wooded range shows at one to two kilometres — forest
 * stands (denser in the hollows and on the steeper lower faces, thinning to the map's treeline, never on the snow) and,
 * on the gentle open ground, field parcels — as the light they leave: a stand's canopy takes `canopy` of the light
 * (the occlusion and the sun terms the terrain program already reads, so no shader, sampler or draw is added) and its
 * crowns grain the fine relief.
 */
export interface HorizonReliefCover {
  /** Stands' share of the faces below the treeline (0..1). */
  forest: number;
  /** How much of the ground's light a stand's canopy takes (0..1). */
  canopy: number;
  /** Parcel tone spread on the gentle open ground (0 = no fields). */
  fields: number;
  /** The walls' rock (gauntlet wave 0, Sirocco Wadi: "untextured lavender-white clay with soft, blobby shading and no
   * rock, strata or depth layering"): how much darker a wall's rock reads than the ground (desert varnish, streaked
   * down the couloirs), and the tone spread of its beds (strata 3–14 m thick, by world height). 0 = none. */
  varnish?: number;
  beds?: number;
  /** The beds' thickness scale (1: 3–14 m, the tablelands' laminae; the mountain characters' rock bands, read at one to
   * three kilometres, are several times thicker). */
  bedScale?: number;
}

// round 72b: the far range's own haze is a fifth to a third (was half to two thirds) — the post pass's ring distance law
// (post.ts AERIAL_RING_*) hazes it again on top, and the two together left the ranges at a fifth of the near contrast at
// 2 km against the ring's 40 % law
// the mountains lane (2026-10-02): the alpine, karst and volcanic far peaks stood steeper than the far row's 48-degree bound, so
// the bound drew their flanks as straight lines — pyramids along the far skyline; 820 -> 660 m (alpine), 520 -> 460 m
// (karst), 560 -> 500 m (volcanic) with softer serrations keeps their flanks their own
const FAR_ALPINE: HorizonFarRangeSettings = { ampM: 660, floor: 0.34, hazeIn: 0.20, hazeOut: 0.34, snowline: 0.55, sharpness: 1.3 };
const FAR_POLAR: HorizonFarRangeSettings = { ampM: 640, floor: 0.30, hazeIn: 0.19, hazeOut: 0.34, snowline: 0.18, sharpness: 1.4 };
const FAR_ROLLING: HorizonFarRangeSettings = { ampM: 360, floor: 0.40, hazeIn: 0.22, hazeOut: 0.35, snowline: 2, sharpness: 0.85 };
const FAR_MESA: HorizonFarRangeSettings = { ampM: 470, floor: 0.45, hazeIn: 0.21, hazeOut: 0.35, snowline: 2, sharpness: 0.75 };
const FAR_VOLCANIC: HorizonFarRangeSettings = { ampM: 500, floor: 0.28, hazeIn: 0.21, hazeOut: 0.35, snowline: 2, sharpness: 0.95 };
const FAR_COASTAL: HorizonFarRangeSettings = { ampM: 300, floor: 0.35, hazeIn: 0.23, hazeOut: 0.36, snowline: 2, sharpness: 0.9 };
const FAR_MARTIAN: HorizonFarRangeSettings = { ampM: 1050, floor: 0.50, hazeIn: 0.17, hazeOut: 0.31, snowline: 2, sharpness: 0.6 };
const FAR_KARST: HorizonFarRangeSettings = { ampM: 460, floor: 0.30, hazeIn: 0.22, hazeOut: 0.36, snowline: 2, sharpness: 1.25 };

/** The characters: the vocabulary of each mountain country, from the field guides rather than from one another. */
const CHARACTERS: Readonly<Record<HorizonReliefCharacter, HorizonReliefSettings>> = {
  // broad polar ranges: long warped ridgelines, wind-scoured crests over talus skirts, deep radial gullies
  polar: {
    character: 'polar', lowAmpM: 48, highAmpM: 7, warpM: 150, warpWavelengthM: 760, wavelengthM: 300,
    crestSharpness: 1.35, footSharpness: 0.85, billow: 0.15, gullyM: 6.0, gullyWavelengthM: 46, gullyElongation: 4, fineElongation: 1.9, rangeBoost: 1.35, rangeCount: 3, rangeElongation: 3.6,
    talusFloor: 0.28, driftM: 0.9, aoReachM: 170, aoStrength: 0.75, shadowSoft: 0.06, far: FAR_POLAR,
    massif: { baseWavelengthM: 900, gullyWavelengthM: 300, gullyOctaves: 3, gullyGain: 0.5, slopeStrength: 2.5, branch: 3, erosion: 0.45, concavity: 1.15, contrast: 0.42, smoothM: 140 },
    // (gauntlet wave 6, Frosthollow's faces "a smooth curtain ... a wall rather than an alpine face of ribs, couloirs":
    // the round-72 field's 48 m low ribs, radial, had carried the inward faces' ribs; the couloirs now carry them, down
    // the fall line, at their depth — 30 m over 280 m first gullies)
    drainage: { wavelengthM: 280, octaves: 3, depthM: 30, gain: 0.55, slopeStrength: 2.6, branch: 1.8, grainM: 0.5 },
    cover: { forest: 0, canopy: 0, fields: 0, varnish: 0.10, beds: 0.30, bedScale: 4 },
  },
  // spires and glaciers: sharp multifractal crests, short warps, chutes on the faces
  alpine: {
    character: 'alpine', lowAmpM: 52, highAmpM: 8, warpM: 110, warpWavelengthM: 620, wavelengthM: 260,
    crestSharpness: 1.5, footSharpness: 0.95, billow: 0.05, gullyM: 6.5, gullyWavelengthM: 40, gullyElongation: 4, fineElongation: 1.4, rangeBoost: 1.30, rangeCount: 4, rangeElongation: 3.2,
    talusFloor: 0.30, driftM: 0, aoReachM: 160, aoStrength: 0.80, shadowSoft: 0.05, far: FAR_ALPINE,
    massif: { baseWavelengthM: 850, gullyWavelengthM: 290, gullyOctaves: 3, gullyGain: 0.5, slopeStrength: 2.5, branch: 3, erosion: 0.45, concavity: 1.15, contrast: 0.42, smoothM: 140 },
    drainage: { wavelengthM: 260, octaves: 3, depthM: 26, gain: 0.55, slopeStrength: 3.0, branch: 1.6, grainM: 0.6 },
    cover: { forest: 0.62, canopy: 0.5, fields: 0, varnish: 0.06, beds: 0.24, bedScale: 3.5 },
  },
  // wooded hills: rounded billows with spurs, shallow drainage
  rolling: {
    character: 'rolling', lowAmpM: 22, highAmpM: 5, warpM: 90, warpWavelengthM: 700, wavelengthM: 320,
    crestSharpness: 0.9, footSharpness: 0.7, billow: 0.45, gullyM: 2.6, gullyWavelengthM: 60, gullyElongation: 4, fineElongation: 1.5, rangeBoost: 1.10, rangeCount: 3, rangeElongation: 2.8,
    talusFloor: 0.5, driftM: 0, aoReachM: 140, aoStrength: 0.6, shadowSoft: 0.08, far: FAR_ROLLING,
    massif: { baseWavelengthM: 1100, gullyWavelengthM: 420, gullyOctaves: 3, gullyGain: 0.5, slopeStrength: 2.5, branch: 2.5, erosion: 0.42, concavity: 1.1, contrast: 0.36, smoothM: 160 },
    drainage: { wavelengthM: 200, octaves: 3, depthM: 3.5, gain: 0.55, slopeStrength: 2.6, branch: 1.4, grainM: 0.5 }, cover: { forest: 0.42, canopy: 0.5, fields: 0.36 },
  },
  // tablelands: the caps stay flat (small coarse share), the cliffs carry ledges and talus, dry washes below
  mesa: {
    character: 'mesa', lowAmpM: 5, highAmpM: 6, warpM: 40, warpWavelengthM: 520, wavelengthM: 220,
    crestSharpness: 1.1, footSharpness: 0.8, billow: 0.30, gullyM: 3.8, gullyWavelengthM: 34, gullyElongation: 7, fineElongation: 0.5, rangeBoost: 1.0, rangeCount: 0, rangeElongation: 3.4, // tables are not ridges: the isotropic field alone
    talusFloor: 0.35, driftM: 0, aoReachM: 120, aoStrength: 0.7, shadowSoft: 0.05, far: FAR_MESA, massif: null,
    // the mountains lane (2026-10-03): the round-72 field's ledges and radial washes printed dimples on the walls once the
    // occlusion carried its share (Sirocco Wadi's "soft, blobby shading"); the walls' ledges are the escarpment's beds
    // (horizonEscarpment.ts), the drainage cuts the washes down the fall line, the cover darkens the walls' rock
    drainage: { wavelengthM: 150, octaves: 3, depthM: 5, gain: 0.55, slopeStrength: 3.0, branch: 1.4, grainM: 0.4 },
    cover: { forest: 0, canopy: 0, fields: 0, varnish: 0.46, beds: 0.38 },
  },
  // volcanic country: smooth-sided cones cut by radial barrancos, lava benches
  volcanic: {
    character: 'volcanic', lowAmpM: 18, highAmpM: 6, warpM: 60, warpWavelengthM: 560, wavelengthM: 240,
    crestSharpness: 1.0, footSharpness: 0.75, billow: 0.35, gullyM: 5.5, gullyWavelengthM: 30, gullyElongation: 6, fineElongation: 2.0, rangeBoost: 1.15, rangeCount: 3, rangeElongation: 2.6,
    talusFloor: 0.40, driftM: 0, aoReachM: 130, aoStrength: 0.7, shadowSoft: 0.06, far: FAR_VOLCANIC,
    massif: { baseWavelengthM: 950, gullyWavelengthM: 280, gullyOctaves: 3, gullyGain: 0.5, slopeStrength: 2.5, branch: 2, erosion: 0.42, concavity: 1.05, contrast: 0.32, smoothM: 160 },
    drainage: { wavelengthM: 140, octaves: 3, depthM: 9, gain: 0.55, slopeStrength: 3.0, branch: 1.4, grainM: 0.5 }, cover: { forest: 0.2, canopy: 0.42, fields: 0, varnish: 0.28, beds: 0.08 },
  },
  // headlands and cliffs into the sea: rounded uplands, cliffed fronts
  coastal: {
    character: 'coastal', lowAmpM: 20, highAmpM: 5, warpM: 80, warpWavelengthM: 640, wavelengthM: 300,
    crestSharpness: 0.95, footSharpness: 0.7, billow: 0.40, gullyM: 2.8, gullyWavelengthM: 52, gullyElongation: 4.5, fineElongation: 1.4, rangeBoost: 1.08, rangeCount: 3, rangeElongation: 3.0,
    talusFloor: 0.5, driftM: 0, aoReachM: 130, aoStrength: 0.6, shadowSoft: 0.08, far: FAR_COASTAL,
    massif: { baseWavelengthM: 1100, gullyWavelengthM: 400, gullyOctaves: 3, gullyGain: 0.5, slopeStrength: 2.5, branch: 2.5, erosion: 0.42, concavity: 1.1, contrast: 0.36, smoothM: 160 },
    drainage: { wavelengthM: 200, octaves: 3, depthM: 3.0, gain: 0.55, slopeStrength: 2.6, branch: 1.4, grainM: 0.5 }, cover: { forest: 0.32, canopy: 0.46, fields: 0.36 },
  },
  // Olympus-scale shield slopes: very long wavelengths, low relief, lobate flows
  martian: {
    character: 'martian', lowAmpM: 16, highAmpM: 4, warpM: 120, warpWavelengthM: 900, wavelengthM: 420,
    crestSharpness: 0.8, footSharpness: 0.7, billow: 0.55, gullyM: 2.0, gullyWavelengthM: 70, gullyElongation: 4.5, fineElongation: 1.3, rangeBoost: 1.15, rangeCount: 2, rangeElongation: 4.2,
    talusFloor: 0.6, driftM: 0, aoReachM: 160, aoStrength: 0.55, shadowSoft: 0.07, far: FAR_MARTIAN,
    massif: { baseWavelengthM: 1400, gullyWavelengthM: 520, gullyOctaves: 3, gullyGain: 0.5, slopeStrength: 2, branch: 2, erosion: 0.35, concavity: 1.05, contrast: 0.30, smoothM: 200 },
    drainage: { wavelengthM: 240, octaves: 3, depthM: 3.0, gain: 0.55, slopeStrength: 2.4, branch: 1.2, grainM: 0.4 }, cover: { forest: 0, canopy: 0, fields: 0, varnish: 0.34, beds: 0.3 },
  },
  // jungle karst: steep isolated towers, rounded tops, sharp bases
  karst: {
    character: 'karst', lowAmpM: 30, highAmpM: 6, warpM: 70, warpWavelengthM: 480, wavelengthM: 200,
    crestSharpness: 1.4, footSharpness: 1.2, billow: 0.25, gullyM: 3.0, gullyWavelengthM: 36, gullyElongation: 5, fineElongation: 1.6, rangeBoost: 1.25, rangeCount: 4, rangeElongation: 2.4,
    talusFloor: 0.35, driftM: 0, aoReachM: 120, aoStrength: 0.75, shadowSoft: 0.06, far: FAR_KARST,
    massif: { baseWavelengthM: 650, gullyWavelengthM: 230, gullyOctaves: 3, gullyGain: 0.5, slopeStrength: 2.5, branch: 2.5, erosion: 0.45, concavity: 0.95, contrast: 0.42, smoothM: 120 },
    drainage: { wavelengthM: 130, octaves: 3, depthM: 7, gain: 0.55, slopeStrength: 3.0, branch: 1.5, grainM: 0.5 }, cover: { forest: 0.74, canopy: 0.5, fields: 0.1 },
  },
};

/** A map's character: authored (`horizon.relief`), else by map identity, else by the ring style. */
export function resolveHorizonReliefCharacter(
  horizon: { relief?: HorizonReliefCharacter; style?: string } | null | undefined, mapId: string,
): HorizonReliefCharacter {
  if (horizon?.relief && CHARACTERS[horizon.relief]) return horizon.relief;
  if (mapId === 'winter' || mapId === 'whiteout') return 'polar';
  if (mapId === 'caldera' || mapId === 'blackglass') return 'volcanic';
  if (mapId === 'mars') return 'martian';
  if (mapId === 'monsoon' || mapId === 'mangrove') return 'karst';
  if (mapId === 'coastal' || mapId === 'saltwind' || mapId === 'fjord' || mapId === 'polders') return mapId === 'fjord' ? 'alpine' : 'coastal';
  const style = horizon?.style;
  if (style === 'alpine') return 'alpine';
  if (style === 'mesa') return 'mesa';
  return 'rolling';
}

export function resolveHorizonRelief(character: HorizonReliefCharacter): HorizonReliefSettings {
  return CHARACTERS[character];
}

/** Every character, for the receipts. */
export const HORIZON_RELIEF_CHARACTERS: readonly HorizonReliefCharacter[] = Object.freeze(Object.keys(CHARACTERS) as HorizonReliefCharacter[]);

function mulberry32(a: number): () => number {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);
const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export interface HorizonReliefField {
  /** Metres of coarse relief at world (x, z): the geometry's share, centred on zero. */
  low(x: number, z: number): number;
  /**
   * Metres of fine relief at world (x, z): the bake's share. `hT` (0..1, height within the ring) picks the ridge
   * sharpness between the foot and the crest, `concavity` (-1 convex .. +1 concave) damps it on the talus apron,
   * `steep` (0..1) admits the downslope gullies.
   */
  high(x: number, z: number, hT: number, concavity: number, steep: number, r?: number, theta?: number): number;
  /**
   * The bake's two-stage form of `high`: `prepare` runs the warp and the coarse octaves at a point (their offsets and
   * the multifractal weight they leave, smooth enough to interpolate between the bake's half-resolution texels),
   * `finish` runs the fine octaves, the talus and the gullies from a prepared point. `high` = prepare + finish.
   */
  prepare(x: number, z: number, sharp: number, out: { dx: number; dz: number; weight: number }): void;
  finish(dx: number, dz: number, weight: number, sharp: number, concavity: number, steep: number, r: number, theta: number): number;
  /** The character in force. */
  settings: HorizonReliefSettings;
}

const LOW_OCTAVES = 3;
const HIGH_OCTAVES = 3;
/** The fine band starts one octave back: the row ladder (60–250 m spans) cannot carry the 75 m octave, so the bake does. */
const HIGH_FIRST = 2;
const LACUNARITY = 2.05;
const GAIN = 0.52;
/** The fine octaves fall off faster than the coarse ones, so their gradient energy sits in the spurs, not in grit. */
const HIGH_GAIN = 0.42;

/**
 * The relief field of one map. Seeded like the ring's own noise (the caller mixes the map id in), so a map's ridges
 * are the same on every load and in every receipt.
 */
export function createHorizonReliefField(seed: number, settings: HorizonReliefSettings): HorizonReliefField {
  const s = settings;
  const noise = new SimplexNoise({ random: mulberry32(seed >>> 0) });
  const rng = mulberry32((seed ^ 0x9E37) >>> 0);
  const octaves = HIGH_FIRST + HIGH_OCTAVES;
  const freq = new Float64Array(octaves), ox = new Float64Array(octaves), oz = new Float64Array(octaves), amp = new Float64Array(octaves);
  let f = 1 / s.wavelengthM, a = 1;
  for (let o = 0; o < octaves; o++) {
    freq[o] = f; ox[o] = rng() * 200 - 100; oz[o] = rng() * 200 - 100; amp[o] = a;
    f *= LACUNARITY; a *= GAIN;
  }
  const lowNorm = amp[0] + amp[1] + amp[2];
  // the fine band's own amplitudes and offsets (a different set from the coarse band's at the shared octave)
  const highAmp = new Float64Array(HIGH_OCTAVES), hox = new Float64Array(HIGH_OCTAVES), hoz = new Float64Array(HIGH_OCTAVES);
  let ha = 1, highNorm = 0;
  for (let o = 0; o < HIGH_OCTAVES; o++) { highAmp[o] = ha; highNorm += ha; hox[o] = rng() * 200 - 100; hoz[o] = rng() * 200 - 100; ha *= HIGH_GAIN; }
  const warpF = 1 / s.warpWavelengthM;
  const gullyF = 1 / s.gullyWavelengthM;
  const gullyFr = gullyF / s.gullyElongation;
  const gullyK = 1000 * gullyF; // the circle's radius in noise units: one wavelength per gullyWavelengthM of arc at r = 1 km
  // round 72c: the second warp octave — a third of the warp wavelength around the arc (the circle's radius in noise
  // units) and 2.5 x longer along its sheared axis
  const warp2K = 1000 * warpF * 3, warp2Fr = warpF * 3 / 2.5;
  const scratch = { wx: 0, wz: 0, weight: 1 };

  const warpTo = (x: number, z: number): void => {
    scratch.wx = x + noise.noise(x * warpF + 31.7, z * warpF - 12.9) * s.warpM;
    scratch.wz = z + noise.noise(x * warpF - 57.3, z * warpF + 44.1) * s.warpM;
  };
  // one octave of the ridged multifractal at the warped point; the running weight couples the octaves
  const octave = (o: number, sharp: number): number => {
    const n = noise.noise(scratch.wx * freq[o] + ox[o], scratch.wz * freq[o] + oz[o]);
    const an = Math.abs(n);
    let r = (1 - an) + (an - (1 - an)) * s.billow;
    r = Math.pow(clamp(r, 0, 1), sharp);
    r *= scratch.weight;
    scratch.weight = clamp(r * 2.0, 0, 1);
    return r;
  };
  const lowRaw = (x: number, z: number, sharp: number): number => {
    warpTo(x, z);
    scratch.weight = 1;
    let sum = 0;
    for (let o = 0; o < LOW_OCTAVES; o++) sum += octave(o, sharp) * amp[o];
    return sum / lowNorm;
  };
  // Round 72b (integrator: "rows of symmetric cones ... real ranges are asymmetric massifs with several summits,
  // serrated crests, shoulders and saddles, and long ridgelines running obliquely to the viewer"): the coarse field is
  // the sum of RANGES. Each range has its own azimuth window on the ring, its depth band (near / mid / far, so the
  // ranges layer front to back), an AXIS at 20–50° to the ring's tangent (the ridgeline runs obliquely to a viewer at
  // the centre) and its own height; along the axis the ridged field is stretched by the character's elongation (long
  // crest lines), across it one flank is compressed (a steep face and a gentle shoulder, never a symmetric cone), and a
  // second ridged octave at a third of the spacing, phase-jittered along the axis, hangs sub-peaks and shoulders on the
  // crest (multifractally: only where the main ridge already stands). Between the windows a weak isotropic base keeps
  // saddles and passes instead of flat gaps.
  interface ReliefRange {
    theta: number; halfSpan: number; phi: number; cx: number; cz: number; rIn: number; rOut: number;
    height: number; steepSide: number; steepness: number; sub: number; lambdaAlong: number; lambdaAcross: number;
    o1: number; o2: number; o3: number; o4: number; jitterPhase: number;
  }
  const rangeRng = mulberry32((seed ^ 0x5A17) >>> 0);
  const ranges: ReliefRange[] = [];
  const depthBands: ReadonlyArray<readonly [number, number]> = [[620, 980], [820, 1250], [1000, 1560]];
  for (let k = 0; k < s.rangeCount; k++) {
    const slot = (2 * Math.PI) / s.rangeCount;
    const theta = k * slot + (rangeRng() - 0.5) * slot * 0.5;
    const [rIn, rOut] = depthBands[(k + Math.floor(rangeRng() * 2)) % depthBands.length];
    const oblique = (rangeRng() < 0.5 ? -1 : 1) * (0.35 + rangeRng() * 0.5);
    const rMid = (rIn + rOut) * 0.5;
    ranges.push({
      theta, halfSpan: (Math.PI / s.rangeCount) * (1.05 + rangeRng() * 0.45), phi: theta + Math.PI / 2 + oblique,
      cx: Math.cos(theta) * rMid, cz: Math.sin(theta) * rMid, rIn, rOut,
      height: 0.75 + rangeRng() * 0.55, steepSide: rangeRng() < 0.5 ? -1 : 1, steepness: 1.6 + rangeRng() * 0.6,
      sub: 0.28 + rangeRng() * 0.12,
      lambdaAlong: s.wavelengthM * s.rangeElongation * (0.9 + rangeRng() * 0.3), lambdaAcross: s.wavelengthM * (0.85 + rangeRng() * 0.3),
      o1: rangeRng() * 100, o2: rangeRng() * 100, o3: rangeRng() * 100, o4: rangeRng() * 100, jitterPhase: rangeRng() * 100,
    });
  }
  const TAU = Math.PI * 2;
  const rangeField = (x: number, z: number, sharp: number): number => {
    const ang = Math.atan2(z, x), r = Math.hypot(x, z);
    let sum = 0;
    for (const g of ranges) {
      let d = ang - g.theta; d -= Math.round(d / TAU) * TAU;
      const wTheta = 1 - smoothstep(g.halfSpan * 0.55, g.halfSpan, Math.abs(d));
      if (wTheta < 1e-3) continue;
      const wR = smoothstep(g.rIn - 140, g.rIn, r) * (1 - smoothstep(g.rOut, g.rOut + 140, r));
      const w = wTheta * wR;
      if (w < 1e-3) continue;
      const cp = Math.cos(g.phi), sp = Math.sin(g.phi);
      const dx = x - g.cx, dz = z - g.cz;
      const along = dx * cp + dz * sp;
      let across = -dx * sp + dz * cp;
      if (across * g.steepSide < 0) across *= g.steepness; // the steep flank
      // round 72b (integrator, Fjord's centre-far: a row of symmetric spires): the crests lean — the along-axis
      // coordinate is warped by a field a wavelength and a half long, so one flank of every crest is the steeper and
      // the summits sit off-centre on their bases; a ridged cusp is symmetric by construction without it
      const lean = noise.noise(along / (g.lambdaAlong * 1.7) + g.o1 * 0.37 + 53.1, across / (g.lambdaAcross * 2) + g.o2 * 0.61 - 17.4) * g.lambdaAlong * 0.28;
      const alongL = along + lean;
      const n1 = noise.noise(alongL / g.lambdaAlong + g.o1, across / g.lambdaAcross + g.o2);
      const r1 = Math.pow(1 - Math.abs(n1), sharp);
      const w1 = clamp(r1 * 2, 0, 1);
      const jitter = noise.noise(alongL / (g.lambdaAlong * 0.6) + g.jitterPhase, 7.7) * g.lambdaAlong * 0.15;
      const n2 = noise.noise((alongL + jitter) / (g.lambdaAlong / 3) + g.o3, across / (g.lambdaAcross / 2) + g.o4);
      const r2 = Math.pow(1 - Math.abs(n2), sharp) * w1;
      // the range's own lift: inside its window the ground stands 0.35 higher whatever the ridges do, so the ranges
      // rise from the gaps between them and the far range shows through the passes
      sum += w * g.height * (r1 * (1 - g.sub) + r2 * g.sub + 0.35);
    }
    return ranges.length ? sum + lowRaw(x, z, sharp) * 0.35 : lowRaw(x, z, sharp);
  };
  // Centre the coarse field on zero and set its RMS to half the amplitude (peaks about ±lowAmpM) over the ring's own
  // annulus (the ranges are placed on it), so the authored rows keep their mean height and the relief spends the
  // metres the character asks for — a multifractal's raw sum has a mean near 0.4 and a spread of a few hundredths
  const midSharp = (s.crestSharpness + s.footSharpness) * 0.5;
  let lowMean = 0, lowStd = 1;
  {
    const N = 48, samples = new Float64Array(N * N);
    let sum = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const theta = (i / N) * TAU, r = 640 + (j / N) * 900;
      const v = rangeField(Math.cos(theta) * r, Math.sin(theta) * r, midSharp);
      samples[j * N + i] = v; sum += v;
    }
    lowMean = sum / (N * N);
    let sq = 0;
    for (let k = 0; k < samples.length; k++) sq += (samples[k] - lowMean) * (samples[k] - lowMean);
    lowStd = Math.max(1e-4, Math.sqrt(sq / samples.length));
  }
  const lowScale = 0.5 * s.lowAmpM / lowStd;
  const stage = { dx: 0, dz: 0, weight: 1 };
  // the fine band's own centring and scale (RMS = 0.45 of its amplitude), sampled in the ring frame at 1 km
  let fineMean = 0.42, fineScale = 1;
  const fineRaw = (aFine: number, rFine: number, weight: number, sharp: number): number => {
    let w = weight, sum = 0;
    for (let o = 0; o < HIGH_OCTAVES; o++) {
      const fq = freq[HIGH_FIRST + o], k = 1000 * fq;
      const n = noise.noise3d(Math.cos(aFine) * k + hox[o], Math.sin(aFine) * k + hoz[o], rFine * fq + hoz[o] * 0.37);
      const an = Math.abs(n);
      let rr = (1 - an) + (an - (1 - an)) * s.billow;
      rr = Math.pow(clamp(rr, 0, 1), sharp) * w;
      w = clamp(rr * 2.0, 0, 1);
      sum += rr * highAmp[o];
    }
    return sum / highNorm;
  };
  {
    const N = 64, samples = new Float64Array(N * N);
    let sum = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const theta = (i / N) * Math.PI * 2, r = 700 + (j / N) * 700;
      const x = Math.cos(theta) * r, z = Math.sin(theta) * r;
      warpTo(x, z); scratch.weight = 1;
      for (let o = 0; o < LOW_OCTAVES; o++) octave(o, midSharp);
      const v = fineRaw(theta, r / s.fineElongation, scratch.weight, midSharp);
      samples[j * N + i] = v; sum += v;
    }
    fineMean = sum / (N * N);
    let sq = 0;
    for (let k = 0; k < samples.length; k++) sq += (samples[k] - fineMean) * (samples[k] - fineMean);
    fineScale = 0.45 * s.highAmpM / Math.max(1e-4, Math.sqrt(sq / samples.length));
  }
  return {
    settings: s,
    low(x, z) {
      return (rangeField(x, z, midSharp) - lowMean) * lowScale;
    },
    prepare(x, z, sharp, out) {
      warpTo(x, z);
      scratch.weight = 1;
      for (let o = 0; o < LOW_OCTAVES; o++) octave(o, sharp);
      out.dx = scratch.wx - x; out.dz = scratch.wz - z; out.weight = scratch.weight;
    },
    finish(dx, dz, weight, sharp, concavity, steep, r, theta) {
      scratch.weight = weight;
      // the fine octaves run in the ring's own (arc, radius) frame, stretched downslope by the character's elongation
      // (a face's spurs and chutes run down it; a mesa's ledges run along it), the warp offsets carried over as arc
      // and radius shifts; the across-slope coordinate is a circle in noise space so the field closes at every angle
      const ct = Math.cos(theta), st = Math.sin(theta);
      const dArc = -st * dx + ct * dz, dR = ct * dx + st * dz;
      // round 72c (integrator: a faint radial grain on the alpine faces at elongation 1.7): a second warp octave at a
      // third of the warp wavelength whose features run 35° off the radial — the angle is sheared by the radius
      // (theta + r · tan 35° / 1 km) on the circle embedding, so the field closes around the ring and its bands lie
      // oblique to the downslope stretch; the fine crests are bent across it and the comb breaks into chevrons
      const thetaW = theta + (r * 0.001) * WARP2_TAN;
      const cw = Math.cos(thetaW), sw = Math.sin(thetaW);
      const wA = noise.noise3d(cw * warp2K + 8.3, sw * warp2K - 21.7, r * warp2Fr + 2.2) * s.warpM * 0.35;
      const wB = noise.noise3d(cw * warp2K - 44.9, sw * warp2K + 13.1, r * warp2Fr - 6.4) * s.warpM * 0.35;
      const aFine = theta + (dArc + wA) / Math.max(1, r);
      const rFine = (r + dR + wB) / s.fineElongation;
      const raw = fineRaw(aFine, rFine, weight, sharp);
      // the talus apron: at a concave foot the fine relief settles into a smooth fan
      const talus = smoothstep(0.08, 0.45, concavity);
      const fine = (raw - fineMean) * fineScale * (1 - talus * (1 - s.talusFloor));
      // gullies: ridged noise elongated downslope (radial on the ring), carved into the steeper faces only; the
      // across-slope coordinate runs around a circle in noise space so the pattern closes on itself at every angle
      // round 72b (crops: the gullies read as corrugated cardboard — one angular frequency around the whole ring): the
      // groove lookup meanders by a slow field of the arc and the radius (the chutes bend and fork down the face) and
      // their depth varies along the arc, so no two faces carry the same comb
      const mAng = noise.noise3d(ct * 2.3 + 31.7, st * 2.3 - 12.9, r * 0.0031 + 8.2)
        + 0.5 * noise.noise3d(ct * 5.7 - 14.2, st * 5.7 + 27.1, r * 0.0068 + 1.9);
      const mAmp = noise.noise3d(ct * 3.1 - 6.1, st * 3.1 + 19.3, r * 0.0022 - 2.7);
      const thetaG = theta + mAng * 0.22;
      const g = noise.noise3d(Math.cos(thetaG) * gullyK + 7.7, Math.sin(thetaG) * gullyK - 3.3, r * gullyFr + 5.1);
      const gully = -Math.pow(1 - Math.abs(g), 3) * s.gullyM * (0.25 + 0.75 * steep) * (1 - talus * 0.6) * (0.65 + 0.55 * mAmp);
      if (s.driftM <= 0) return fine + gully;
      // round 72c (integrator: the apron between the playable edge and the first ridge is a flat snow sheet): wind
      // drifts on the gentle faces — sastrugi ridges along one world wind (so they align at every azimuth), 26 m
      // apart across it and 120 m long, a sharp lee crest over a long stoss slope (ridged noise, skewed), undamped
      // by the talus fan (a drift IS what a snow apron carries), gone on the steep faces
      const flat = 1 - smoothstep(0.08, 0.30, steep);
      if (flat < 1e-3) return fine + gully;
      const x = ct * r, z = st * r;
      const along = x * DRIFT_C + z * DRIFT_S, across = -x * DRIFT_S + z * DRIFT_C;
      const skew = noise.noise(along / 120 + 3.1, across / 26 + 9.7) * 0.35;
      const d = noise.noise(along / 120 - 17.3, (across + skew * 26) / 26 + 41.9);
      const drift = Math.pow(1 - Math.abs(d), 2.5) * s.driftM * flat * (0.7 + 0.3 * noise.noise(along / 380 + 5.5, across / 380 - 2.2));
      return fine + gully + drift;
    },
    high(x, z, hT, concavity, steep, rIn, thetaIn) {
      const sharp = s.footSharpness + (s.crestSharpness - s.footSharpness) * clamp(hT, 0, 1);
      this.prepare(x, z, sharp, stage);
      return this.finish(stage.dx, stage.dz, stage.weight, sharp, concavity, steep, rIn ?? Math.hypot(x, z), thetaIn ?? Math.atan2(z, x));
    },
  };
}

// ---------------------------------------------------------------------------
// the surface bake
// ---------------------------------------------------------------------------
interface HorizonReliefBakeInput {
  columns: number;
  rowCount: number;
  positions: Float32Array;
  heights: Float32Array;
  maxHeight: number;
  /** Per-vertex marine weight (0..1), optional: the sea apron bakes flat and unshadowed. */
  marine?: Float32Array | null;
  /** The mountains lane (2026-10-03): the drainage's and the landcover's seed (the map's relief seed). */
  seed?: number;
  /** The landcover's ceilings (m): the forest thins out to the map's treeline and stops under the snow; null for none. */
  treelineM?: number | null;
  snowlineM?: number | null;
  /** A map's own landcover (maps/horizon.ts `horizon.reliefCover`) in place of its character's; null for none. */
  cover?: HorizonReliefCover | null;
  /** The map-borders lane's woods field (0 open … 1 wooded; terrain.ts getBorderWoodsAt where that lane's landform is
   * in): the baked stands follow it past the ring forest, so its trees and the stands beyond them are one woods. Absent:
   * the cover's own stand field. */
  woodsAt?: ((x: number, z: number) => number) | null;
  /** false where the border's own farmland parcels tint the ring (terrain.ts _borderParcelAt): no baked parcels. */
  fields?: boolean;
}

export interface HorizonReliefBake {
  width: number;
  height: number;
  /** RGBA8: R/G the fine gradient (world dh/dx, dh/dz over gradScale, biased), B the ambient occlusion, A the sun visibility. */
  data: Uint8Array;
  /** The radius the first texel row sits on and the radius the last one reaches. */
  r0: number;
  r1: number;
  gradScale: number;
  stats: { aoMean: number; shadowMean: number; gradP95: number; fineRangeM: number; passMs: [number, number, number] };
}

export const HORIZON_RELIEF_BAKE_R0 = 410;
export const HORIZON_RELIEF_BAKE_R1 = 1560;
/** Round 72c: the second warp octave's shear (35°) and the drifts' world wind (a fixed bearing: sastrugi align with it at every azimuth). */
const WARP2_TAN = Math.tan(35 * Math.PI / 180);
const DRIFT_C = Math.cos(1.05), DRIFT_S = Math.sin(1.05);
export const HORIZON_RELIEF_GRAD_SCALE = 4.0; // round 72b: the steep-face striations reach a gradient of 2.8 (was 1.5, which saturated them)
const AO_DIRECTIONS = 8;
const AO_STEPS_M = [5, 10, 20, 40, 80, 160];
const SUN_STEPS_M = [4, 8, 14, 22, 34, 50, 72, 100, 140, 190, 260, 340, 440, 560];

/**
 * The shading share the terrain program gives the atlas's occlusion and sun terms (horizonAutumnGround.ts
 * RING_RELIEF_SHADE reads it) and the program's own constants for them (terrain.ts, the ring branch of splatCompute:
 * `gRingAo = 1 - (1 - pow(rel.z, 1.4)) * 0.8 * ringW`, `gRingSun = 1 - (1 - rel.w) * 0.85 * ringW`, ringW at most the
 * share). The landcover is encoded against them, so a stand's factor arrives as the light it leaves.
 */
export const HORIZON_RELIEF_SHADE = 0.7;
export const HORIZON_RELIEF_AO_POWER = 1.4;
export const HORIZON_RELIEF_AO_DEPTH = 0.8;
export const HORIZON_RELIEF_SUN_DEPTH = 0.85;

/** The occlusion texel whose program factor is `ao`'s times `light` (clamped where the program's range ends). */
export function encodeCanopyAo(ao: number, light: number): number {
  const k = HORIZON_RELIEF_AO_DEPTH * HORIZON_RELIEF_SHADE;
  const factor = (1 - (1 - Math.pow(clamp(ao, 0, 1), HORIZON_RELIEF_AO_POWER)) * k) * light;
  return Math.pow(1 - clamp((1 - factor) / k, 0, 1), 1 / HORIZON_RELIEF_AO_POWER);
}

/** The sun-visibility texel whose program factor is `sun`'s times `light`. */
export function encodeCanopySun(sun: number, light: number): number {
  const k = HORIZON_RELIEF_SUN_DEPTH * HORIZON_RELIEF_SHADE;
  const factor = (1 - (1 - clamp(sun, 0, 1)) * k) * light;
  return 1 - clamp((1 - factor) / k, 0, 1);
}

/** Integer hash to 0..1 (the field parcels). */
function hashCell(ix: number, iz: number, seed: number): number {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iz, 0x165667b1) ^ seed;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Where the ring's range trees stop (horizonVista.ts buildHorizonForest: no range-class tree past 880 m); the baked
 * stands fade in under their outer edge so the two meet without a band. */
export const HORIZON_COVER_RADIUS_M: readonly [number, number] = [720, 900];
/** The radii (m) over which the stands hand over from the border's woods to the ranges' own stand field: where the ring's
 * range trees (which stand in the border's woods) thin out and stop, so no woodland parcel climbs a face past the trees. */
export const HORIZON_STAND_HANDOVER_M: readonly [number, number] = [720, 880];

interface DrainageInput {
  W: number; H: number; r0: number; dr: number;
  macro: Float32Array; marine: Float32Array;
  settings: HorizonReliefSettings; seed: number;
  treelineM: number | null; snowlineM: number | null;
  woodsAt: ((x: number, z: number) => number) | null; fields: boolean;
}

/**
 * The mountains lane (2026-10-03): the fine relief and the landcover of the atlas (see HorizonReliefDrainage and
 * HorizonReliefCover). Writes the fine relief (m) into `fine`; returns the landcover's light factor per texel, or null.
 *  - the fall line: the macro height smoothed over about 40 m (the rows' kinks would turn the couloirs at every row),
 *    its world gradient;
 *  - the couloirs: the erosion octaves on a half-resolution grid (their finest spacing is 25–35 m, three half-texels
 *    at 1.5 km), bilinear to the texels, weighted by the slope (a floor carries none);
 *  - the grain: two isotropic octaves, no direction;
 *  - the cover: stand masses (three octaves) biased toward the steeper lower faces and the hollows, off the cliffs,
 *    thinning to the treeline and stopped under the snow, beyond the ring forest; their crowns grain the relief; field
 *    parcels (a rotated grid, a tone per parcel) on the gentle open ground.
 */
function* drainageAndCoverSteps(input: DrainageInput, fine: Float32Array): Generator<void, { canopyLight: Float32Array | null; canopyH: Float32Array | null }, void> {
  const { W, H, r0, dr, macro, marine, settings: s, seed } = input;
  const d = s.drainage as HorizonReliefDrainage;
  const TAU = Math.PI * 2;
  const arcAt = (r: number): number => r * TAU / W;
  const noise = new SimplexNoise({ random: mulberry32((seed ^ 0xD2A1) >>> 0) });
  // the fall line: two box passes over about 40 m (radius 20 m each way per pass)
  const smooth = new Float32Array(macro);
  const tmp = new Float32Array(W * H);
  const rj = Math.max(1, Math.round(20 / dr));
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 0; j < H; j++) {
      const ri = Math.max(1, Math.round(20 / arcAt(r0 + (j + 0.5) * dr)));
      let acc = 0;
      for (let k = -ri; k <= ri; k++) acc += smooth[j * W + ((k % W) + W) % W];
      for (let i = 0; i < W; i++) {
        tmp[j * W + i] = acc / (2 * ri + 1);
        acc += smooth[j * W + (i + ri + 1) % W] - smooth[j * W + ((i - ri) % W + W) % W];
      }
    }
    for (let i = 0; i < W; i++) {
      for (let j = 0; j < H; j++) {
        let acc = 0, cnt = 0;
        for (let k = Math.max(0, j - rj); k <= Math.min(H - 1, j + rj); k++) { acc += tmp[k * W + i]; cnt++; }
        smooth[j * W + i] = acc / cnt;
      }
    }
    yield;
  }
  const gradAt = (i: number, j: number, out: Float64Array): void => {
    const r = r0 + (j + 0.5) * dr, arc = arcAt(r);
    const im = (i - 1 + W) % W, ip = (i + 1) % W, jm = Math.max(0, j - 1), jp = Math.min(H - 1, j + 1);
    const gθ = (smooth[j * W + ip] - smooth[j * W + im]) / (2 * arc);
    const gr = (smooth[jp * W + i] - smooth[jm * W + i]) / ((jp - jm) * dr);
    const theta = (i / W) * TAU, ct = Math.cos(theta), st = Math.sin(theta);
    out[0] = gr * ct - gθ * st; out[1] = gr * st + gθ * ct;
  };
  // the couloirs on the half grid: sample q sits at full-resolution index 2q + 0.5 (the bake's half-grid convention)
  const Wq = W >> 1, Hq = H >> 1;
  const ero = new Float32Array(Wq * Hq);
  const g = new Float64Array(2), e = new Float64Array(3);
  const erosionSeed = (Math.imul(seed, 0x9E3779B1) ^ 0x51ED27) >>> 0;
  for (let jq = 0; jq < Hq; jq++) {
    const r = r0 + (jq * 2 + 1) * dr;
    for (let iq = 0; iq < Wq; iq++) {
      const theta = ((iq * 2 + 0.5) / W) * TAU;
      const x = Math.cos(theta) * r, z = Math.sin(theta) * r;
      gradAt(iq * 2, jq * 2, g);
      const slope = Math.hypot(g[0], g[1]);
      // a floor carries none, a face its full depth, a wall (past 0.3) up to 1.4 x: the couloirs deepen with the slope
      const weight = smoothstep(0.03, 0.30, slope) * (0.6 + 0.8 * smoothstep(0.3, 1.0, slope));
      if (weight < 1e-3) { ero[jq * Wq + iq] = 0; continue; }
      let eh = 0, ehx = 0, ehz = 0, depth = d.depthM, cell = d.wavelengthM;
      for (let o = 0; o < d.octaves; o++) {
        // the phase runs across the fall line (the slope turned 90 degrees, not normalised: a steeper face, more couloirs)
        const dirx = (g[1] + ehz * d.branch) * d.slopeStrength;
        const dirz = -(g[0] + ehx * d.branch) * d.slopeStrength;
        erosionOctave(x / cell, z / cell, dirx, dirz, (erosionSeed + Math.imul(o, 0x9E3779B9)) >>> 0, e);
        eh += e[0] * depth;
        ehx += e[1] * depth / cell; ehz += e[2] * depth / cell;
        depth *= d.gain; cell *= 0.5;
      }
      // the couloirs come and go across a face (census border views, Frosthollow: one depth over a whole face read as
      // regular fluting): a ~600 m field sets where they cut deep and where the face stays smooth between ribs
      const patch = smoothstep(-0.35, 0.55, noise.noise(x / 600 + 61.7, z / 600 - 23.9) + 0.35 * noise.noise(x / 230 - 5.3, z / 230 + 8.8));
      ero[jq * Wq + iq] = eh * weight * (0.3 + 0.7 * patch);
    }
    if ((jq & 7) === 7) yield;
  }
  const eroAt = (i: number, j: number): number => {
    const fx = (i - 0.5) * 0.5, fy = (j - 0.5) * 0.5;
    let x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    x0 = ((x0 % Wq) + Wq) % Wq; const x1 = (x0 + 1) % Wq;
    y0 = y0 < 0 ? 0 : y0 >= Hq ? Hq - 1 : y0; const y1 = y0 + 1 >= Hq ? Hq - 1 : y0 + 1;
    const top = ero[y0 * Wq + x0] + (ero[y0 * Wq + x1] - ero[y0 * Wq + x0]) * tx;
    const bottom = ero[y1 * Wq + x0] + (ero[y1 * Wq + x1] - ero[y1 * Wq + x0]) * tx;
    return top + (bottom - top) * ty;
  };
  const top = input.treelineM, snow = input.snowlineM;
  // a map without a treeline (badlands, the moon: treeline 0) bakes no stands and no fields; the walls' rock needs none
  const woods = s.cover && (s.cover.forest > 0 || s.cover.fields > 0) && (top === null || top > 1) ? s.cover : null;
  const rock = s.cover && ((s.cover.varnish ?? 0) > 0 || (s.cover.beds ?? 0) > 0) ? s.cover : null;
  const c = woods;
  const canopyLight = woods || rock ? new Float32Array(W * H).fill(1) : null;
  const canopyH = woods ? new Float32Array(W * H) : null;
  // the beds: a thickness and a tone per bed, by world height (the escarpment's own stair is 120–200 m; these are its
  // laminae), warped a few metres so a bed wanders along the wall
  const bedTone = new Float32Array(512), bedTop = new Float32Array(513);
  {
    let h = -400;
    const scale = s.cover?.bedScale ?? 1;
    for (let b = 0; b < 512; b++) { bedTop[b] = h; h += (3 + hashCell(b, 17, seed) * 11) * scale; bedTone[b] = hashCell(b, 23, seed); }
    bedTop[512] = h;
  }
  const bedAt = (h: number): number => {
    let lo = 0, hi = 512;
    if (h <= bedTop[0]) return 0;
    if (h >= bedTop[512]) return 511;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (bedTop[mid] <= h) lo = mid; else hi = mid; }
    return lo;
  };
  // the parcels' grid: a bearing per map, strips 140–200 m deep, parcels 160–320 m long, the strips offset
  const bearing = hashCell(7, 11, seed) * Math.PI, cb = Math.cos(bearing), sb = Math.sin(bearing);
  const lapM = 60;
  for (let j = 0; j < H; j++) {
    const r = r0 + (j + 0.5) * dr, arc = arcAt(r);
    const li = Math.max(1, Math.round(lapM / arc)), lj = Math.max(1, Math.round(lapM / dr));
    const nearW = c ? smoothstep(HORIZON_COVER_RADIUS_M[0], HORIZON_COVER_RADIUS_M[1], r) : 0;
    const fieldNear = smoothstep(560, 700, r);
    for (let i = 0; i < W; i++) {
      const idx = j * W + i;
      const theta = (i / W) * TAU, ct = Math.cos(theta), st = Math.sin(theta);
      const x = ct * r, z = st * r;
      // the seam (round 29 / 35 laws, as the round-72 pass): nil at the square's edge, full 60 m out; the sea flat
      const seamW = smoothstep(0, 60, Math.max(Math.abs(x), Math.abs(z)) - 511.5);
      const land = (1 - marine[idx]) * seamW;
      if (land <= 0.001) { fine[idx] = 0; continue; }
      const grain = (noise.noise(x / 26 + 17.3, z / 26 - 5.1) * 0.65 + noise.noise(x / 11 - 3.7, z / 11 + 29.9) * 0.35) * d.grainM;
      const couloir = eroAt(i, j);
      let v = couloir + grain;
      if (canopyLight && rock) {
        gradAt(i, j, g);
        const slope = Math.hypot(g[0], g[1]);
        // a wall from about 24 degrees, full by 42: varnish darker down the couloirs (where the water runs), the beds' tones
        // (from about 14 degrees, full by 35: the escarpments' talus and benches carry rock too — Sirocco Wadi's walls
        // read as pale clay with the band at 24-42 degrees)
        const wall = smoothstep(0.25, 0.70, slope + noise.noise(x / 70 - 3.1, z / 70 + 8.3) * 0.12) * land;
        if (wall > 0.001) {
          const streak = clamp(-couloir / Math.max(0.5, d.depthM), 0, 1);
          const varnish = (rock.varnish ?? 0) * (0.65 + 0.35 * streak);
          const hBed = macro[idx] + noise.noise(x / 160 + 5.7, z / 160 - 1.9) * 6;
          const beds = (rock.beds ?? 0) * (bedTone[bedAt(hBed)] - 0.35);
          canopyLight[idx] *= clamp(1 - wall * (varnish + beds), 0.3, 1);
        }
      }
      if (canopyLight && c) {
        gradAt(i, j, g);
        const slope = Math.hypot(g[0], g[1]);
        const h0 = smooth[idx];
        const lap = (smooth[j * W + (i + li) % W] + smooth[j * W + (i - li + W) % W] - 2 * h0) / ((li * arc) * (li * arc))
          + (smooth[Math.min(H - 1, j + lj) * W + i] + smooth[Math.max(0, j - lj) * W + i] - 2 * h0) / ((lj * dr) * (lj * dr));
        const hollow = clamp(lap * lapM * lapM / 12, -1, 1); // + a hollow, - a crest or a shoulder
        // the stand field, domain-warped (stands are lobed, not round): masses of about 400 m, clearings of 150 m, ragged
        // 45 m edges; crisp (a few metres of transition), as a canopy edge is at a kilometre
        const wx = x + noise.noise(x / 380 + 9.1, z / 380 - 2.3) * 120, wz = z + noise.noise(x / 380 - 6.7, z / 380 + 5.5) * 120;
        const nA = noise.noise(wx / 420 + 3.3, wz / 420 - 8.1), nB = noise.noise(wx / 160 - 11.7, wz / 160 + 4.9), nC = noise.noise(wx / 45 + 21.1, wz / 45 + 13.3);
        const field = nA * 0.55 + nB * 0.30 + nC * 0.15;
        const bias = (c.forest - 0.5) * 1.0 + 0.20 * smoothstep(0.08, 0.40, slope) + 0.25 * hollow;
        // the border's woods (its parcels between the hedgerows) carry the stands across the borders band; past it, on the
        // ranges' faces, the stands are the field's own (gauntlet wave 6, Verdant's edge-n: a woodland parcel's straight
        // edges drawn up the mountain read as "a translucent blue-grey band smeared diagonally across the mountain")
        const natural = smoothstep(-0.05, 0.05, field + bias);
        const borderW = input.woodsAt ? 1 - smoothstep(HORIZON_STAND_HANDOVER_M[0], HORIZON_STAND_HANDOVER_M[1], r) : 0;
        let stand = borderW > 0.001 ? natural + (input.woodsAt!(x, z) - natural) * borderW : natural;
        stand *= 1 - smoothstep(0.80, 1.10, slope); // no stand on a cliff
        if (top !== null) stand *= 1 - smoothstep(top * 0.86, top * 1.02, h0 + nC * 0.06 * top);
        if (snow !== null) stand *= 1 - smoothstep(snow - 60, snow - 10, h0 + nB * 20);
        const forestW = stand * nearW * land;
        // the crowns: a 9–16 m grain in the relief and a mottle in the light where the canopy stands (no finer: the atlas
        // is read at its top level, three to five metres a texel, and a finer grain would shimmer); the canopy's own
        // height (16 m, its crowns 3 m either way) stands in the occlusion and the sun searches, so a stand's edge
        // shades the clearing beside it and casts its shadow down-sun
        let mottle = 0;
        if (forestW > 0.001) {
          const crown = noise.noise(x / 16 + 41.3, z / 16 - 7.7) * 0.7 + noise.noise(x / 9 - 2.9, z / 9 + 17.1) * 0.3;
          v += forestW * crown * 1.3;
          mottle = crown;
          if (canopyH) canopyH[idx] = forestW * (16 + crown * 3);
        }
        // the canopy's own texture in the light (census border views, 2026-10-03: a smooth stand read as a blue-grey
        // sheet draped on the hill, not a wood): crowns and their shaded gaps at 9-16 m, clumps at ~40 m, so the stand
        // carries the grain a forest shows at one to two kilometres
        const clump = noise.noise(x / 38 + 13.7, z / 38 - 29.1);
        let light = 1 - forestW * c.canopy * (0.92 + mottle * 0.42 + clump * 0.16);
        if (c.fields > 0 && input.fields) {
          const open = (1 - forestW) * (1 - smoothstep(0.10, 0.22, slope)) * fieldNear * land;
          if (open > 0.001) {
            const u = x * cb + z * sb, w = -x * sb + z * cb;
            const strip = Math.floor(w / 170);
            const off = hashCell(strip, 3, seed) * 300;
            const len = 160 + hashCell(strip, 5, seed) * 160;
            const parcel = Math.floor((u + off) / len);
            const tone = hashCell(parcel, strip, seed ^ 0x2F1);
            // most parcels near the turf's own tone, a few darker (ploughed, stubble), one in eight markedly so
            const dark = tone < 0.125 ? 0.62 : 0.06 + tone * 0.30;
            light *= 1 - open * c.fields * dark;
          }
        }
        canopyLight[idx] *= light;
      }
      fine[idx] = v * land;
    }
    if ((j & 7) === 7) yield;
  }
  return { canopyLight, canopyH };
}

/**
 * Bake the (angle x radius) surface atlas for a finished ring (after the seating, the caps and the sea). The macro
 * height at any (angle, radius) is the ring's own rows interpolated (per column the rows are monotone in radius, so
 * a binary search finds the span); the fine relief comes from the field; the occlusion and the sun visibility are
 * horizon searches over the combined height. Yields every few rows of each pass so the caller can slice it.
 */
export function* bakeHorizonReliefSteps(
  input: HorizonReliefBakeInput, field: HorizonReliefField, sun: readonly [number, number, number],
  size: { width: number; height: number } = { width: 2048, height: 256 },
): Generator<void, HorizonReliefBake, void> {
  const { columns: n, rowCount, positions, heights, maxHeight } = input;
  const W = size.width, H = size.height;
  const r0 = HORIZON_RELIEF_BAKE_R0, r1 = HORIZON_RELIEF_BAKE_R1;
  const dr = (r1 - r0) / H;
  const s = input.cover !== undefined ? { ...field.settings, cover: input.cover } : field.settings;
  // per-column monotone radius / height tables
  const colR = new Float32Array(n * rowCount), colH = new Float32Array(n * rowCount), colM = new Float32Array(n * rowCount);
  for (let row = 0; row < rowCount; row++) {
    for (let k = 0; k < n; k++) {
      const i = row * n + k;
      colR[k * rowCount + row] = Math.hypot(positions[i * 3], positions[i * 3 + 2]);
      colH[k * rowCount + row] = heights[i];
      colM[k * rowCount + row] = input.marine ? input.marine[i] : 0;
    }
  }
  const columnAt = (k: number, r: number, out: Float32Array): number => {
    // returns the height; writes the marine weight to out[0]
    const base = k * rowCount;
    let lo = 0, hi = rowCount - 1;
    if (r <= colR[base]) { out[0] = colM[base]; return colH[base]; }
    if (r >= colR[base + hi]) { out[0] = colM[base + hi]; return colH[base + hi]; }
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (colR[base + mid] <= r) lo = mid; else hi = mid;
    }
    const t = (r - colR[base + lo]) / Math.max(1e-3, colR[base + hi] - colR[base + lo]);
    out[0] = colM[base + lo] + (colM[base + hi] - colM[base + lo]) * t;
    return colH[base + lo] + (colH[base + hi] - colH[base + lo]) * t;
  };
  const mA = new Float32Array(1), mB = new Float32Array(1);
  const macro = new Float32Array(W * H), marine = new Float32Array(W * H);
  const TAU = Math.PI * 2;
  const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const t0 = now();
  // pass 1: the macro height
  for (let j = 0; j < H; j++) {
    const r = r0 + (j + 0.5) * dr;
    for (let i = 0; i < W; i++) {
      const c = (i / W) * n;
      const k0 = Math.floor(c) % n, k1 = (k0 + 1) % n, t = c - Math.floor(c);
      const hA = columnAt(k0, r, mA), hB = columnAt(k1, r, mB);
      macro[j * W + i] = hA + (hB - hA) * t;
      marine[j * W + i] = mA[0] + (mB[0] - mA[0]) * t;
    }
    if ((j & 15) === 15) yield;
  }
  const t1 = now();
  const fine = new Float32Array(W * H);
  let fineMin = Infinity, fineMax = -Infinity;
  // the mountains lane (2026-10-03): the landcover's light factor per texel (1 = open ground), or null without cover
  let canopyLight: Float32Array | null = null, canopyH: Float32Array | null = null;
  const arcAt = (r: number): number => r * TAU / W;
  if (s.drainage) {
    const surface = yield* drainageAndCoverSteps({
      W, H, r0, dr, macro, marine, settings: s, seed: (input.seed ?? 0x5eed) >>> 0,
      treelineM: input.treelineM ?? null, snowlineM: input.snowlineM ?? null,
      woodsAt: input.woodsAt ?? null, fields: input.fields !== false,
    }, fine);
    canopyLight = surface.canopyLight; canopyH = surface.canopyH;
    for (let idx = 0; idx < W * H; idx++) { const v = fine[idx]; if (v < fineMin) fineMin = v; if (v > fineMax) fineMax = v; }
  } else {
    // pass 2: the fine relief over the macro (concavity and steepness from the macro's radial second and first
    // differences). The warp and the coarse octaves — smooth terms — run on a half-resolution grid and are interpolated
    // to each texel (their offsets and the multifractal weight they leave); only the fine octaves and the gullies run
    // per texel, so the field costs four noise samples a texel instead of nine.
    const dj = Math.max(2, Math.round(40 / dr));
    const Wq = W >> 1, Hq = H >> 1;
    const stageDx = new Float32Array(Wq * Hq), stageDz = new Float32Array(Wq * Hq), stageW = new Float32Array(Wq * Hq);
    const stage = { dx: 0, dz: 0, weight: 1 };
    const sharpAt = (hT: number): number => s.footSharpness + (s.crestSharpness - s.footSharpness) * clamp(hT, 0, 1);
    for (let jq = 0; jq < Hq; jq++) {
      const r = r0 + (jq * 2 + 1) * dr;
      for (let iq = 0; iq < Wq; iq++) {
        const theta = ((iq * 2 + 0.5) / W) * TAU;
        const x = Math.cos(theta) * r, z = Math.sin(theta) * r;
        const h = macro[(jq * 2) * W + iq * 2];
        field.prepare(x, z, sharpAt(h / Math.max(1, maxHeight)), stage);
        const q = jq * Wq + iq;
        stageDx[q] = stage.dx; stageDz[q] = stage.dz; stageW[q] = stage.weight;
      }
      if ((jq & 7) === 7) yield;
    }
    const stageAt = (grid: Float32Array, i: number, j: number): number => {
      const fx = (i - 0.5) * 0.5, fy = (j - 0.5) * 0.5;
      let x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = fx - x0, ty = fy - y0;
      x0 = ((x0 % Wq) + Wq) % Wq; const x1 = (x0 + 1) % Wq;
      y0 = y0 < 0 ? 0 : y0 >= Hq ? Hq - 1 : y0; const y1 = y0 + 1 >= Hq ? Hq - 1 : y0 + 1;
      const top = grid[y0 * Wq + x0] + (grid[y0 * Wq + x1] - grid[y0 * Wq + x0]) * tx;
      const bottom = grid[y1 * Wq + x0] + (grid[y1 * Wq + x1] - grid[y1 * Wq + x0]) * tx;
      return top + (bottom - top) * ty;
    };
    for (let j = 0; j < H; j++) {
      const r = r0 + (j + 0.5) * dr;
      const jm = Math.max(0, j - dj), jp = Math.min(H - 1, j + dj);
      const arc = arcAt(r);
      for (let i = 0; i < W; i++) {
        const idx = j * W + i;
        const hm = macro[jm * W + i], hp = macro[jp * W + i], h = macro[idx];
        const concavity = clamp((hm + hp - 2 * h) / (40 * 1.0), -1, 1);
        const im = (i - 1 + W) % W, ip = (i + 1) % W;
        const gθ = (macro[j * W + ip] - macro[j * W + im]) / (2 * arc);
        const gr = (macro[Math.min(H - 1, j + 1) * W + i] - macro[Math.max(0, j - 1) * W + i]) / (2 * dr);
        const steep = smoothstep(0.22, 0.65, Math.hypot(gθ, gr));
        const theta = (i / W) * TAU;
        // the seam (round 29 / 35 laws): the fine relief is nil at the square's edge and full 90 m out, so the seam row
        // continues the terrain's own edge and the terrain-material bands read the same atlas from there (round 72b)
        const seamW = smoothstep(0, 60, Math.max(Math.abs(Math.cos(theta) * r), Math.abs(Math.sin(theta) * r)) - 511.5); // round 72b: 60 m (a 90 m fade read as a smooth belt under the first ridge)
        // round 72b (integrator: "faces read as one flat tone"): the striations and gully shading run at three times
        // their amplitude on the steep faces, so they survive the aerial pass at range
        const land = (1 - marine[idx]) * seamW * (1 + 2.2 * steep);
        const v = land > 0.001
          ? field.finish(stageAt(stageDx, i, j), stageAt(stageDz, i, j), stageAt(stageW, i, j), sharpAt(h / Math.max(1, maxHeight)), concavity, steep, r, theta) * land
          : 0;
        fine[idx] = v;
        if (v < fineMin) fineMin = v; if (v > fineMax) fineMax = v;
      }
      if ((j & 7) === 7) yield;
    }
  }
  // pass 3: the combined height, its fine gradient in world xz, the occlusion and the sun visibility. The horizon
  // searches walk the (angle x radius) grid itself at HALF resolution (occlusion and shadow are smooth terms with a
  // reach of a hundred metres; the gradient stays at full resolution): the eight occlusion directions are grid-aligned
  // (their metre lengths taken from the row's arc and the radial step), so a row's texel offsets are computed once,
  // and the sun's grid direction is fixed per column (it turns with the angle), so no trigonometry runs per sample.
  const t2 = now();
  const total = new Float32Array(W * H);
  for (let idx = 0; idx < W * H; idx++) total[idx] = macro[idx] + fine[idx] + (canopyH ? canopyH[idx] : 0);
  const data = new Uint8Array(W * H * 4);
  const sunHoriz = Math.hypot(sun[0], sun[2]);
  const tanEl = sun[1] / Math.max(1e-3, sunHoriz);
  const sx = sun[0] / Math.max(1e-6, sunHoriz), sz = sun[2] / Math.max(1e-6, sunHoriz);
  const gradScale = HORIZON_RELIEF_GRAD_SCALE;
  const grads: number[] = [];
  const Wh = W >> 1, Hh = H >> 1;
  const aoGrid = new Float32Array(Wh * Hh), sunGrid = new Float32Array(Wh * Hh);
  const cosCol = new Float32Array(Wh), sinCol = new Float32Array(Wh), sunA = new Float32Array(Wh), sunB = new Float32Array(Wh);
  for (let i = 0; i < Wh; i++) {
    const theta = ((i + 0.5) / Wh) * TAU;
    cosCol[i] = Math.cos(theta); sinCol[i] = Math.sin(theta);
    // the sun's world direction in grid units per metre: angle texels (times 1 / r) and radial texels
    sunA[i] = (-sinCol[i] * sx + cosCol[i] * sz) * W / TAU;
    sunB[i] = (cosCol[i] * sx + sinCol[i] * sz) / dr;
  }
  const aoDirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const aoSteps = AO_STEPS_M.filter((d) => d <= s.aoReachM);
  const aoDi = new Int32Array(AO_DIRECTIONS * aoSteps.length), aoDj = new Int32Array(AO_DIRECTIONS * aoSteps.length);
  const aoDist = new Float32Array(AO_DIRECTIONS * aoSteps.length);
  let aoSum = 0, shSum = 0;
  for (let jh = 0; jh < Hh; jh++) {
    const j = jh * 2;
    const r = r0 + (j + 1) * dr;
    const arc = arcAt(r);
    // this row's occlusion offsets (full-resolution texels): a grid direction scaled so the metre length matches the step
    for (let d = 0; d < AO_DIRECTIONS; d++) {
      const [ui, uj] = aoDirs[d];
      const unitM = Math.hypot(ui * arc, uj * dr);
      for (let step = 0; step < aoSteps.length; step++) {
        const k = Math.max(1, Math.round(aoSteps[step] / unitM));
        aoDi[d * aoSteps.length + step] = ui * k; aoDj[d * aoSteps.length + step] = uj * k;
        aoDist[d * aoSteps.length + step] = k * unitM;
      }
    }
    for (let ih = 0; ih < Wh; ih++) {
      const i = ih * 2;
      const idx = j * W + i;
      const h0 = total[idx];
      // ambient occlusion: the horizon in eight grid directions, up to the reach
      let occ = 0;
      for (let d = 0; d < AO_DIRECTIONS; d++) {
        let maxSlope = 0;
        for (let step = 0; step < aoSteps.length; step++) {
          const q = d * aoSteps.length + step;
          let ii = i + aoDi[q], jj = j + aoDj[q];
          if (ii < 0) ii += W; else if (ii >= W) ii -= W;
          if (jj < 0) jj = 0; else if (jj >= H) jj = H - 1;
          const slope = (total[jj * W + ii] - h0) / aoDist[q];
          if (slope > maxSlope) maxSlope = slope;
        }
        occ += maxSlope / Math.sqrt(1 + maxSlope * maxSlope);
      }
      const ao = 1 - occ / AO_DIRECTIONS;
      // sun visibility: march toward the sun; a higher ridge along the way at a slope above the sun's blocks it
      const a = sunA[ih] / r, b = sunB[ih];
      let block = -1;
      for (let step = 0; step < SUN_STEPS_M.length; step++) {
        const dist = SUN_STEPS_M[step];
        let ii = i + Math.round(a * dist), jj = j + Math.round(b * dist);
        ii = ((ii % W) + W) % W;
        if (jj < 0) jj = 0; else if (jj >= H) jj = H - 1;
        const bl = (total[jj * W + ii] - h0) / dist - tanEl;
        if (bl > block) block = bl;
      }
      const theta0 = ((i + 0.5) / W) * TAU;
      const seamW0 = smoothstep(0, 60, Math.max(Math.abs(Math.cos(theta0) * r), Math.abs(Math.sin(theta0) * r)) - 511.5);
      const land = (1 - marine[idx]) * seamW0;
      const sunVis = 1 - smoothstep(-s.shadowSoft, s.shadowSoft, block) * land;
      // round 72b: the occlusion deepened (a 1.6 power) so the folds read at 1.5 km through the haze
      const aoOut = 1 - (1 - Math.pow(ao, 1.6)) * land;
      aoGrid[jh * Wh + ih] = aoOut; sunGrid[jh * Wh + ih] = sunVis;
      aoSum += aoOut; shSum += sunVis;
    }
    if ((jh & 7) === 7) yield;
  }
  // the fine gradient at full resolution, the occlusion and the sun bilinear from the half grid
  const half = (grid: Float32Array, i: number, j: number): number => {
    const fx = (i - 0.5) * 0.5, fy = (j - 0.5) * 0.5;
    let x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    x0 = ((x0 % Wh) + Wh) % Wh; const x1 = (x0 + 1) % Wh;
    y0 = y0 < 0 ? 0 : y0 >= Hh ? Hh - 1 : y0; const y1 = y0 + 1 >= Hh ? Hh - 1 : y0 + 1;
    const top = grid[y0 * Wh + x0] + (grid[y0 * Wh + x1] - grid[y0 * Wh + x0]) * tx;
    const bottom = grid[y1 * Wh + x0] + (grid[y1 * Wh + x1] - grid[y1 * Wh + x0]) * tx;
    return top + (bottom - top) * ty;
  };
  for (let j = 0; j < H; j++) {
    const r = r0 + (j + 0.5) * dr;
    const arc = arcAt(r);
    for (let i = 0; i < W; i++) {
      const idx = j * W + i;
      const theta = (i / W) * TAU;
      const ct = Math.cos(theta), st = Math.sin(theta);
      // fine gradient (world): dh/dx = dh/dr cos - dh/dθ sin / r ; dh/dz = dh/dr sin + dh/dθ cos / r
      const im = i === 0 ? W - 1 : i - 1, ip = i === W - 1 ? 0 : i + 1;
      const fθ = (fine[j * W + ip] - fine[j * W + im]) / (2 * arc);
      const fr = (fine[Math.min(H - 1, j + 1) * W + i] - fine[Math.max(0, j - 1) * W + i]) / (2 * dr);
      const gx = fr * ct - fθ * st, gz = fr * st + fθ * ct;
      if ((idx & 1023) === 0) grads.push(Math.hypot(gx, gz));
      data[idx * 4] = clamp(Math.round((gx / gradScale * 0.5 + 0.5) * 255), 0, 255);
      data[idx * 4 + 1] = clamp(Math.round((gz / gradScale * 0.5 + 0.5) * 255), 0, 255);
      let aoOut = half(aoGrid, i, j), sunOut = half(sunGrid, i, j);
      if (canopyLight && canopyLight[idx] < 0.999) {
        aoOut = encodeCanopyAo(aoOut, canopyLight[idx]);
        sunOut = encodeCanopySun(sunOut, canopyLight[idx]);
      }
      data[idx * 4 + 2] = clamp(Math.round(aoOut * 255), 0, 255);
      data[idx * 4 + 3] = clamp(Math.round(sunOut * 255), 0, 255);
    }
    if ((j & 15) === 15) yield;
  }
  aoSum /= Wh * Hh; shSum /= Wh * Hh;
  const t3 = now();
  grads.sort((a, b) => a - b);
  return {
    width: W, height: H, data, r0, r1, gradScale,
    stats: {
      aoMean: aoSum, shadowMean: shSum,
      gradP95: grads.length ? grads[Math.min(grads.length - 1, Math.floor(grads.length * 0.95))] : 0,
      fineRangeM: fineMax - fineMin,
      passMs: [t1 - t0, t2 - t1, t3 - t2],
    },
  };
}

/** Synchronous wrapper for receipts and tools. */
export function bakeHorizonRelief(
  input: HorizonReliefBakeInput, field: HorizonReliefField, sun: readonly [number, number, number],
  size?: { width: number; height: number },
): HorizonReliefBake {
  const steps = bakeHorizonReliefSteps(input, field, sun, size);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}
