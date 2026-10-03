// src/world/landUse.ts — the ground lane (2026-10-03, Opus 5.5 redesign; the gauntlet's wave-0 verdict: "WoT's
// Prokhorovka and the Breton bocage photo show patchworks of fields in distinct crops and colours, with boundaries,
// tracks and hedgerows. Ours is one uniform plain.").
//
// THREE-free. The land use of a battlefield: a field system laid over the open ground — blocks along the map's own
// heading (each row of blocks shifted against the next, so no boundary crosses the map on a grid), each block cut into
// one to `maxSplit` fields, every field one crop of its region's rotation (pasture, ripe wheat, barley, young green
// crop, plough, stubble, sunflower), a grass margin round every field, dirt tracks along some of the long boundaries
// and hedges along some of the short ones. The terrain material draws it (LAND_USE_GLSL, packed into three vec4
// uniforms, no sampler) and the CPU twin (landUseAt) answers the same question for the tiers that grow on the ground —
// the tall grass stands as the crop. The two use the same integer hash and the same analytic warp, so a field's crop
// is the same on both sides (a float rounding can only move a boundary by a hair).
//
// Every map without a row has no fields (strength 0); a row is the map's whole land-use authoring (no map-file edit).
//
// 2026-10-03 (the coordinator: one field system on both sides of the edge): the map-borders lane lays its parcels,
// hedgerows, woods and tracks past the playable edge on this grid (landUseAt), so the module stays pure, THREE-free
// and import-free. Regions now name their own crops: a rotation is up to seven slots of any crop kind (the material
// reads the slot's shares and the slot→kind table as uniforms), and a region's fields are bounded its own way — a
// grass margin with tracks and hedges, a polder's water ditches, a paddy's earth bunds or a karst field's dry stone
// walls.

export type LandRegion = 'steppe' | 'bocage' | 'temperate' | 'polder' | 'upland' | 'strip' | 'paddy' | 'terrace' | 'karst'
  | 'brownfield' | 'coalfield';

/** How a region's fields are bounded (the material's uLandE.z). */
export type LandBoundary = 'margin' | 'ditch' | 'bund' | 'wall';
const BOUNDARY_ID: Readonly<Record<LandBoundary, number>> = Object.freeze({ margin: 0, ditch: 1, bund: 2, wall: 3 });

export interface LandUseProfile {
  /** 0 = no fields; 1 = full crop colour. */
  strength: number;
  /** The field grid's heading in world XZ (radians; 0 = blocks run along +X). */
  heading: number;
  /** Block size along the heading (m) and across it (m). */
  blockU: number;
  blockV: number;
  /** A block is cut into 1..maxSplit fields. */
  maxSplit: number;
  /** Mean grass margin round a field (m). */
  marginM: number;
  /** Share of the long (row) boundaries that carry a dirt track. */
  trackShare: number;
  /** Share of the short boundaries that carry a hedge (the vegetation tier plants it). */
  hedgeShare: number;
  /** Amplitude (m) of the slow warp that bends the boundaries. */
  warpM: number;
  /** The crop rotation's region. */
  region: LandRegion;
  /** Salt of the field hash (two maps with one layout still crop differently). */
  salt: number;
}

/** Crop kinds (the shader's ids, 0..15). */
export const LAND_CROP = Object.freeze({
  pasture: 0, wheat: 1, barley: 2, green: 3, plough: 4, stubble: 5, sunflower: 6,
  // 2026-10-03: the regions of the rebuilt maps
  rowCrop: 7,     // potato, beet, vegetables: dark green rows over the soil
  paddyWater: 8,  // a flooded paddy: muddy water, a mirror of the sky, the young rice a faint green haze
  paddyGreen: 9,  // a growing paddy: one even bright green
  paddyRipe: 10,  // a ripe paddy: gold-green
  terraRossa: 11, // the karst's red soil, turned
  vineyard: 12,   // vine rows over the soil
  hay: 13,        // a mown meadow: pale stripes and windrows
  jute: 14,       // jute (the chars): tall, dark green
  slag: 15,       // an ironworks' tipped slag: black-grey, granular
  ballast: 16,    // crushed-stone ballast and hardcore: grey
  ruderal: 17,    // brownfield grass: patchy, dry, with bare ground between
} as const);
export type LandCropId = (typeof LAND_CROP)[keyof typeof LAND_CROP];

/**
 * Every crop's measured albedo (linear, the sward's tip where a sward grows) — the terrain draws it, the tall grass
 * and the tufts that stand as the crop take it (a sown field's own colour, not a multiplier on a biome's green), and
 * the map-borders lane colours its parcels past the edge with it. Ripe grain and straw 0.20–0.25, black earth under
 * the plough 0.03–0.06, terra rossa ~0.12, a young crop 0.10–0.13, rice green brighter than a cereal.
 */
export const LAND_CROP_ALBEDO: Readonly<Record<LandCropId, readonly [number, number, number]>> = Object.freeze({
  0: [0.085, 0.170, 0.035], // pasture: the calibrated meadow tip (groundRedux.ts MEADOW_TIP)
  1: [0.30, 0.22, 0.075],   // ripe wheat
  2: [0.33, 0.28, 0.12],    // barley
  3: [0.065, 0.13, 0.05],   // young green crop (wave 14, verdant chase: "oversaturated lime … artificial turf": a deeper, bluer green)
  4: [0.050, 0.042, 0.034], // plough (black earth; the terrain uses its own soil layer)
  5: [0.30, 0.25, 0.13],    // stubble
  6: [0.045, 0.10, 0.025],  // sunflower foliage
  7: [0.050, 0.105, 0.030], // row crop foliage
  8: [0.040, 0.046, 0.040], // flooded paddy (muddy water)
  9: [0.085, 0.17, 0.05],   // growing rice
  10: [0.26, 0.22, 0.085],  // ripe rice
  11: [0.16, 0.10, 0.075],  // terra rossa (a dull brick, not an orange floor)
  12: [0.060, 0.115, 0.035], // vine foliage
  13: [0.17, 0.20, 0.085],  // mown hay
  14: [0.045, 0.12, 0.032], // jute
  15: [0.075, 0.072, 0.070], // slag
  16: [0.16, 0.155, 0.15],  // ballast
  17: [0.20, 0.19, 0.10],   // ruderal brownfield grass (cured)
});

/**
 * How the tiers that stand on the ground grow on each crop (tallGrass.ts, the tufts in vegetation.ts): `sward` — the
 * crop is a sward that grows tufts and blades (0 = bare: plough, water, turned soil, dense row foliage), its height
 * against the biome's sward and the share of candidates kept.
 */
// `weed`: the sward on a bare field is its weeds — the grass's own cured tones, not the field's albedo (wave 8, Saltwind's
// chase: the red earth "carpeted with evenly spaced lilac-purple grass cards" — blades tinted the soil's red)
export const LAND_CROP_GROWTH: Readonly<Record<LandCropId, Readonly<{ sward: boolean; height: number; keep: number; weed?: boolean }>>> = Object.freeze({
  0: { sward: true, height: 1, keep: -1 },     // pasture: the wild sward's own law (keep -1 = unchanged)
  // (the hold-2 ABBA: +1.1–1.3 ms GPU at the chase views of Amberford and Saltmere, whose cameras stand in or beside
  // sown fields — a sown field drew every candidate blade, taller, half again the wild sward's; now about its density)
  1: { sward: true, height: 1.1, keep: 0.75 },
  2: { sward: true, height: 1.0, keep: 0.75 },
  3: { sward: true, height: 0.75, keep: 0.65 },
  4: { sward: false, height: 0, keep: 0 },
  5: { sward: true, height: 0.24, keep: 0.55 },
  6: { sward: true, height: 1.6, keep: 0.7 },
  7: { sward: true, height: 0.55, keep: 0.45 },
  8: { sward: false, height: 0, keep: 0 },
  9: { sward: true, height: 0.6, keep: 0.8 },
  10: { sward: true, height: 0.75, keep: 0.75 },
  11: { sward: true, height: 0.5, keep: 0.12, weed: true }, // turned red earth: a few weeds
  12: { sward: true, height: 0.35, keep: 0.35, weed: true },
  13: { sward: true, height: 0.30, keep: 0.8 },
  14: { sward: true, height: 1.9, keep: 0.85 },
  15: { sward: false, height: 0, keep: 0 },
  16: { sward: true, height: 0.4, keep: 0.12, weed: true },
  17: { sward: true, height: 0.85, keep: 0.6 },
});

/** Each region's rotation: up to seven slots of [crop kind, share] (the material reads the shares and kinds, uLandC/D/E). */
const ROTATIONS: Readonly<Record<LandRegion, readonly (readonly [LandCropId, number])[]>> = Object.freeze({
  // the Kursk / Belgorod black earth: big wheat and barley strips, sunflower, plough of chernozem, little pasture
  steppe: [[0, 0.16], [1, 0.27], [2, 0.11], [3, 0.14], [4, 0.15], [5, 0.11], [6, 0.06]],
  // bocage: small fields, mostly grazing, some plough, hay and grain
  bocage: [[0, 0.50], [1, 0.12], [2, 0.06], [3, 0.12], [4, 0.12], [5, 0.08], [6, 0.0]],
  // central European mixed farming (Hesse, the Fulda gap): grain, pasture, plough and maize-dark rows
  temperate: [[0, 0.30], [1, 0.19], [2, 0.12], [3, 0.14], [4, 0.13], [5, 0.08], [6, 0.04]],
  // the Scheldt polders: long parcels between ditches — grazing, grain, potato and beet rows, a few ploughs
  polder: [[0, 0.40], [1, 0.18], [7, 0.16], [3, 0.10], [4, 0.08], [5, 0.08], [13, 0.0]],
  // an upland of hay meadows and pasture (the Eifel round the Roer dams): grass first, a little grain
  upland: [[0, 0.50], [13, 0.20], [3, 0.08], [1, 0.07], [4, 0.07], [5, 0.08], [2, 0.0]],
  // the strip fields of a Franconian / Saxon village (Gewannflur): many narrow strips, every crop of the rotation
  strip: [[0, 0.16], [1, 0.20], [2, 0.12], [3, 0.14], [4, 0.14], [7, 0.12], [5, 0.12]],
  // the chars of the Jamuna: small paddies, flooded, green and ripe, jute and a little grazing
  paddy: [[9, 0.38], [8, 0.22], [14, 0.15], [10, 0.10], [4, 0.07], [0, 0.08], [7, 0.0]],
  // a Japanese caldera floor (Aso): rectangular paddies, green and flooded, vegetable plots, meadow
  terrace: [[9, 0.44], [8, 0.20], [10, 0.10], [7, 0.10], [0, 0.16], [4, 0.0], [5, 0.0]],
  // the Dalmatian karst: small walled fields of red earth, vines, dry grazing and a little grain
  karst: [[11, 0.30], [12, 0.26], [0, 0.28], [5, 0.08], [3, 0.08], [1, 0.0], [4, 0.0]],
  // an ironworks' ground (Völklingen on the Saar): plots of brownfield grass, tipped slag, ballast and hardcore,
  // rank grass and bare earth, between the works' tracks and the birch scrub that seeds itself along them
  brownfield: [[17, 0.40], [15, 0.22], [16, 0.18], [0, 0.12], [4, 0.08], [5, 0.0], [3, 0.0]],
  // a coalfield valley's farmland (the Ruhr's, Silesia's, the Valleys'): pasture and rough grazing gone ruderal round the
  // pits, small arable fields, and here and there a plot of tipped slag
  coalfield: [[0, 0.26], [17, 0.22], [4, 0.14], [5, 0.14], [1, 0.12], [3, 0.06], [15, 0.06]],
});

/** Each region's field boundary. */
const BOUNDARIES: Readonly<Record<LandRegion, LandBoundary>> = Object.freeze({
  steppe: 'margin', bocage: 'margin', temperate: 'margin', upland: 'margin', strip: 'margin',
  polder: 'ditch', paddy: 'bund', terrace: 'bund', karst: 'wall', brownfield: 'margin', coalfield: 'margin',
});

/** The rotation's cumulative shares at slots 0..5 (slot 6 takes the rest), normalised. */
function rotationCumulative(region: LandRegion): [number, number, number, number, number, number] {
  const table = ROTATIONS[region];
  let total = 0;
  for (const [, w] of table) total += w;
  const out: number[] = [];
  let acc = 0;
  for (let i = 0; i < 6; i++) { acc += (table[i]?.[1] ?? 0) / total; out.push(acc); }
  return out as [number, number, number, number, number, number];
}
/** The rotation's slot→kind table, packed five bits a slot: slots 0..3 and 4..6 (exact in a float32: < 2^24). */
function rotationKinds(region: LandRegion): [number, number] {
  const table = ROTATIONS[region];
  const kind = (i: number): number => (table[i]?.[0] ?? table[table.length - 1][0]) & 31;
  return [kind(0) + 32 * kind(1) + 1024 * kind(2) + 32768 * kind(3), kind(4) + 32 * kind(5) + 1024 * kind(6)];
}

const PROFILES: Readonly<Record<string, LandUseProfile>> = Object.freeze({
  // Amberford (Verdant): its establishing shot is set against WoT's Prokhorovka — long strip fields of the
  // black-earth steppe along the railway's heading, tracks between the rows, a few shelterbelt hedges
  verdant: {
    strength: 1, heading: 0.32, blockU: 230, blockV: 150, maxSplit: 3, marginM: 2.2, trackShare: 0.55, hedgeShare: 0.3,
    warpM: 26, region: 'steppe', salt: 17,
  },
  // Saltmere Coast (coastal), set against the Breton bocage (Monts d'Arrée): small irregular fields, mostly grazing,
  // hedged on most boundaries, few tracks
  coastal: {
    strength: 1, heading: -0.48, blockU: 120, blockV: 92, maxSplit: 2, marginM: 2.6, trackShare: 0.22, hedgeShare: 0.75,
    warpM: 30, region: 'bocage', salt: 29,
  },
  // Frontier (the Fulda gap): mixed central-European farming between the woods — medium fields, grain and pasture
  frontier: {
    strength: 1, heading: 0.95, blockU: 180, blockV: 120, maxSplit: 3, marginM: 2.0, trackShare: 0.45, hedgeShare: 0.4,
    warpM: 22, region: 'temperate', salt: 41,
  },
  // 2026-10-03, the rebuilt maps' regions (the maps lane through the coordinator). Each heading follows the map's own
  // roads (the length-weighted dominant road direction inside the square), so the fields line up with the lanes.
  // Polders (the Scheldt polders): long parcels at right angles to the dike roads (~76°), ditches on the long lines,
  // windbreak rows on some short ones; the land barely bends
  polders: {
    strength: 1, heading: -0.25, blockU: 260, blockV: 64, maxSplit: 2, marginM: 1.5, trackShare: 0.85, hedgeShare: 0.3,
    warpM: 8, region: 'polder', salt: 53,
  },
  // Reservoir (the Roer dams, the Eifel upland): hay meadows and pasture in small hedged fields (the Monschau hedges)
  reservoir: {
    strength: 1, heading: 0.14, blockU: 140, blockV: 95, maxSplit: 2, marginM: 2.4, trackShare: 0.3, hedgeShare: 0.65,
    warpM: 28, region: 'upland', salt: 61,
  },
  // Steinburg (a Franconian / Saxon hill town): the village's strip fields along its streets (~93°)
  urban: {
    strength: 1, heading: 1.62, blockU: 200, blockV: 84, maxSplit: 4, marginM: 1.2, trackShare: 0.5, hedgeShare: 0.15,
    warpM: 18, region: 'strip', salt: 67,
  },
  // Delta (the Jamuna chars): small paddies between earth bunds, a few raised paths, palm lines on some bunds (~60°)
  delta: {
    strength: 1, heading: 1.05, blockU: 80, blockV: 52, maxSplit: 3, marginM: 0.7, trackShare: 0.12, hedgeShare: 0.12,
    warpM: 12, region: 'paddy', salt: 71,
  },
  // Saltwind (the Dalmatian karst coast): small fields of red earth and vines inside dry stone walls (~68°)
  saltwind: {
    strength: 1, heading: 1.19, blockU: 64, blockV: 46, maxSplit: 2, marginM: 1.2, trackShare: 0.15, hedgeShare: 0.05,
    warpM: 16, region: 'karst', salt: 79,
  },
  // (Caldera: the maps lane rebuilt it as Las Cañadas — a volcanic basin of ash flats, cinder cones and lava flows with
  // no fields; its ground is the volcanic zoning of groundRedux.ts, not a land use. The 'terrace' region stays for a
  // paddy map.)
  // Ironworks (foundry: the Völklingen ironworks on the Saar, the maps lane's rebuild): brownfield plots between the
  // works' streets (an axis grid), birch scrub seeded along some of the plot lines, works tracks along others
  foundry: {
    strength: 0.75, heading: 0, blockU: 96, blockV: 64, maxSplit: 3, marginM: 1.6, trackShare: 0.45, hedgeShare: 0.35,
    warpM: 18, region: 'brownfield', salt: 89,
  },
  // Cinder Junction (railyard: a coalfield rail junction): the valley floor's fields and grazing round the yard, laid along
  // the main line (its chord rises 6.6 m per 100 m of easting); the graded yard itself is worn ground (the material's
  // village wear keeps the fields off it). (The hold-3 pairs: "a uniform, saturated green blanket".)
  railyard: {
    strength: 0.65, heading: 0.066, blockU: 84, blockV: 52, maxSplit: 3, marginM: 1.5, trackShare: 0.3, hedgeShare: 0.3,
    warpM: 14, region: 'coalfield', salt: 97,
  },
});

/** The map's land use, or null (no fields). */
export function resolveLandUseProfile(mapId: string | null | undefined): LandUseProfile | null {
  return PROFILES[mapId ?? ''] ?? null;
}

export function landUseProfileIds(): string[] {
  return Object.keys(PROFILES);
}

/** A region's field boundary (the map-borders lane draws the same past the edge). */
export function landUseBoundary(profile: LandUseProfile | null): LandBoundary {
  return profile ? BOUNDARIES[profile.region] : 'margin';
}

/** The material's packing: five vec4 uniforms, no sampler (the program sits at the 16-unit budget). */
export function landUseUniformValues(profile: LandUseProfile | null): {
  landA: [number, number, number, number];
  landB: [number, number, number, number];
  landC: [number, number, number, number];
  landD: [number, number, number, number];
  landE: [number, number, number, number];
} {
  if (!profile || !(profile.strength > 0)) {
    return { landA: [0, 0, 200, 150], landB: [1, 2, 0, 0], landC: [0, 0, 1, 1], landD: [1, 1, 1, 1], landE: [0, 0, 0, 0] };
  }
  const c = rotationCumulative(profile.region);
  const kinds = rotationKinds(profile.region);
  return {
    landA: [Math.min(1, profile.strength), profile.heading, Math.max(40, profile.blockU), Math.max(24, profile.blockV)],
    landB: [Math.max(1, Math.min(4, Math.round(profile.maxSplit))), Math.max(0.5, profile.marginM),
      Math.min(1, Math.max(0, profile.trackShare)), Math.min(1, Math.max(0, profile.hedgeShare))],
    // (warp m, salt, the rotation's cumulative shares at slots 4 and 5); uLandD = its shares at slots 0..3
    landC: [Math.max(0, profile.warpM), profile.salt >>> 0, c[4], c[5]],
    landD: [c[0], c[1], c[2], c[3]],
    // the slots' crop kinds (five bits a slot: 0..3, 4..6), the boundary (margin 0, ditch 1, bund 2, wall 3)
    landE: [kinds[0], kinds[1], BOUNDARY_ID[BOUNDARIES[profile.region]], 0],
  };
}

// --------------------------------------------------------------------------------------------- the hash (shared)

const U32 = (x: number): number => x >>> 0;
/** lowbias32 (Wellons): identical to the GLSL lu_hash on uint. */
function luHash(x: number): number {
  x = U32(x ^ (x >>> 16));
  x = U32(Math.imul(x, 0x7feb352d));
  x = U32(x ^ (x >>> 15));
  x = U32(Math.imul(x, 0x846ca68b));
  x = U32(x ^ (x >>> 16));
  return x;
}
/** A cell (a, b) and a salt to 0..1 (24 bits) — the GLSL lu_rand. Cell indices are offset to stay positive. */
function luRand(a: number, b: number, salt: number): number {
  const h = luHash(U32(Math.imul(U32(a + 4096), 0x9e3779b1) ^ luHash(U32(U32(b + 4096) ^ U32(Math.imul(salt >>> 0, 0x85ebca6b))))));
  return (h >>> 8) / 16777216;
}

// --------------------------------------------------------------------------------------------- the CPU twin

export interface LandFieldSample {
  /** 0 outside the field system (strength 0); else 1. */
  active: number;
  crop: LandCropId;
  /** Metres to the field's nearest boundary. */
  edgeM: number;
  /** Metres to the nearer of the field's two row ends (where the rows stop and the tractor turns: the headland). */
  endM: number;
  /** The field's grass margin (m): inside it the ground is the margin's rank grass, not the crop. */
  marginM: number;
  /** 1 on a dirt track (the track's own width), 0 off it. */
  track: number;
  /** 1 within a hedge's line (the vegetation tier's seat), 0 off it. */
  hedge: number;
  /** The field's row direction in world XZ (unit). */
  rowX: number;
  rowZ: number;
  /** A per-field 0..1 jitter (tone, density). */
  jitter: number;
  /** The field's id (stable integer). */
  id: number;
  /** The region's boundary: 0 margin (tracks are dirt), 1 ditch (tracks are water), 2 bund, 3 dry stone wall. */
  boundary: number;
  /** The crop's albedo (LAND_CROP_ALBEDO) and how a sward grows on it (LAND_CROP_GROWTH: 1/0, height, keep or -1). */
  tintR: number;
  tintG: number;
  tintB: number;
  sward: number;
  cropHeight: number;
  cropKeep: number;
  /** 1 when the field's sward is its weeds (cured grass tones, not the crop's albedo). */
  weed: number;
}

export function createLandFieldSample(): LandFieldSample {
  return { active: 0, crop: 0, edgeM: 1e9, endM: 1e9, marginM: 0, track: 0, hedge: 0, rowX: 1, rowZ: 0, jitter: 0, id: 0,
    boundary: 0, tintR: 0, tintG: 0, tintB: 0, sward: 1, cropHeight: 1, cropKeep: -1, weed: 0 };
}

/** The analytic warp of the boundaries (m): two slow sines per axis, identical in GLSL. */
function warpX(x: number, z: number): number {
  return Math.sin(x * 0.00523 + z * 0.00311 + 1.3) + 0.5 * Math.sin(x * -0.00197 + z * 0.00877 + 4.1);
}
function warpZ(x: number, z: number): number {
  return Math.sin(x * 0.00409 - z * 0.00587 + 2.7) + 0.5 * Math.sin(x * 0.00913 + z * 0.00241 + 0.6);
}

/** The slot a field's roll picks — the GLSL lu_crop on the same cumulative shares (the uniforms' float32 values). */
function cropFromRoll(c: Float64Array, roll: number): number {
  for (let i = 0; i < 6; i++) if (roll < c[i]) return i;
  return 6;
}

/** A profile's layout constants, resolved once (the uniforms' own packing and float32 shares). */
interface CompiledLandUse {
  ch: number; sh: number; blockU: number; blockV: number; maxSplit: number; marginM: number;
  trackShare: number; hedgeShare: number; warpM: number; salt: number; cum: Float64Array; kinds: Uint8Array;
  boundary: number;
}
const compiled = new WeakMap<LandUseProfile, CompiledLandUse>();
function compile(profile: LandUseProfile): CompiledLandUse {
  let c = compiled.get(profile);
  if (c) return c;
  const v = landUseUniformValues(profile);
  const cum = new Float64Array(6);
  [...v.landD, v.landC[2], v.landC[3]].forEach((share, i) => { cum[i] = Math.fround(share); });
  const kinds = new Uint8Array(7);
  for (let i = 0; i < 7; i++) kinds[i] = ((i < 4 ? v.landE[0] : v.landE[1]) >> ((i < 4 ? i : i - 4) * 5)) & 31;
  c = {
    ch: Math.cos(v.landA[1]), sh: Math.sin(v.landA[1]), blockU: v.landA[2], blockV: v.landA[3],
    maxSplit: v.landB[0], marginM: v.landB[1], trackShare: v.landB[2], hedgeShare: v.landB[3],
    warpM: v.landC[0], salt: v.landC[1], cum, kinds, boundary: v.landE[2],
  };
  compiled.set(profile, c);
  return c;
}

/**
 * The field under (x, z): its crop, the distance to its boundary, whether a track or a hedge runs there and the row
 * direction — the CPU twin of LAND_USE_GLSL's lu_field (same hash, same warp, same layout). Pure and allocation-free
 * (a profile's constants are resolved once): ~0.16 µs a call (Node 24), cheap enough for a map-load sweep of the land past the
 * edge (the map-borders lane lays its parcels, hedgerows and tracks on this grid). The layout runs on unbounded past
 * the square; the cell hash keeps its period beyond ±160 km.
 */
export function landUseAt(profile: LandUseProfile | null, x: number, z: number, out: LandFieldSample): LandFieldSample {
  out.active = 0; out.crop = 0; out.edgeM = 1e9; out.endM = 1e9; out.marginM = 0; out.track = 0; out.hedge = 0; out.rowX = 1; out.rowZ = 0;
  out.jitter = 0; out.id = 0; out.boundary = 0; out.tintR = 0; out.tintG = 0; out.tintB = 0; out.sward = 1;
  out.cropHeight = 1; out.cropKeep = -1; out.weed = 0;
  if (!profile || !(profile.strength > 0)) return out;
  const { ch, sh, blockU, blockV, maxSplit, marginM, trackShare, hedgeShare, warpM, salt, cum, kinds, boundary } = compile(profile);
  const px = x + warpX(x, z) * warpM, pz = z + warpZ(x, z) * warpM;
  const qu = ch * px + sh * pz, qv = -sh * px + ch * pz;
  const row = Math.floor(qv / blockV);
  const shift = luRand(row, 7, salt) * blockU;
  const uq = qu + shift;
  const col = Math.floor(uq / blockU);
  const lu = uq - col * blockU, lv = qv - row * blockV;
  const split = 1 + Math.min(maxSplit - 1, Math.floor(luRand(row, col, salt + 13) * maxSplit));
  const alongU = luRand(row, col, salt + 17) < 0.5;
  let k: number, s0: number, s1: number, rowAlongU: boolean;
  let edgeU: number, edgeV: number;
  if (alongU) {
    const w = blockU / split;
    k = Math.min(split - 1, Math.floor(lu / w));
    s0 = lu - k * w; s1 = w - s0;
    edgeU = Math.min(s0, s1);
    edgeV = Math.min(lv, blockV - lv);
    rowAlongU = w > blockV; // rows run along the field's long side
  } else {
    const w = blockV / split;
    k = Math.min(split - 1, Math.floor(lv / w));
    s0 = lv - k * w; s1 = w - s0;
    edgeV = Math.min(s0, s1);
    edgeU = Math.min(lu, blockU - lu);
    rowAlongU = blockU > w;
  }
  const fieldA = row, fieldB = col * 8 + k;
  const crop = kinds[cropFromRoll(cum, luRand(fieldA, fieldB, salt + 23))] as LandCropId;
  // a long boundary (the row line) carries a track by its own line index and 120 m segment along it, so both blocks
  // either side agree; the short boundaries (block ends and the cuts) carry hedges by the block and cut index
  const lineIdx = lv < blockV * 0.5 ? row : row + 1;
  const segment = Math.floor(qu / 120);
  const trackOn = luRand(lineIdx, segment, salt + 31) < trackShare;
  const dLine = Math.min(lv, blockV - lv);
  out.track = trackOn ? 1 - smooth(1.6, 2.6, dLine) : 0;
  const hedgeOn = luRand(row, col * 8 + (alongU ? k : 7), salt + 37) < hedgeShare;
  const dShort = alongU ? Math.min(edgeU, Math.min(lu, blockU - lu)) : Math.min(lu, blockU - lu);
  out.hedge = hedgeOn ? 1 - smooth(1.2, 2.4, dShort) : 0;
  out.active = 1;
  out.crop = crop;
  out.edgeM = Math.min(edgeU, edgeV);
  out.endM = rowAlongU ? edgeU : edgeV;
  // each field's own row direction: the long side's axis turned up to ±20° by the field's hash (wave 14: one direction
  // per parcel, varied between parcels — never the block grid's two axes alternating as a woven crosshatch)
  const r0x = rowAlongU ? ch : -sh, r0z = rowAlongU ? sh : ch;
  const ra = (luRand(fieldA, fieldB, salt + 41) - 0.5) * 0.7, rc = Math.cos(ra), rs = Math.sin(ra);
  out.rowX = r0x * rc - r0z * rs; out.rowZ = r0x * rs + r0z * rc;
  out.jitter = luRand(fieldA, fieldB, salt + 29);
  // the margin the material draws: a grass margin's own width; a bund's and a wall's fixed footing (LAND_USE_GLSL's
  // users in terrain.ts: the field starts at 0.85 m past a bund, 1.45 m past a wall)
  out.marginM = boundary > 2.5 ? 1.2 : boundary > 1.5 ? 0.7 : marginM * (0.7 + 0.6 * out.jitter);
  out.boundary = boundary;
  const albedo = LAND_CROP_ALBEDO[crop], growth = LAND_CROP_GROWTH[crop];
  out.tintR = albedo[0]; out.tintG = albedo[1]; out.tintB = albedo[2];
  out.sward = growth.sward ? 1 : 0; out.cropHeight = growth.height; out.cropKeep = growth.keep; out.weed = growth.weed ? 1 : 0;
  out.id = (U32(Math.imul(fieldA + 4096, 65537) ^ (fieldB + 4096)) % 1000003);
  return out;
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// --------------------------------------------------------------------------------------------- the GLSL

/**
 * The terrain material's field layout (declared in the splat fragment's globals). uLandA = (strength, heading,
 * blockU, blockV), uLandB = (maxSplit, margin m, track share, hedge share), uLandC = (warp m, salt, the rotation's
 * cumulative shares at crops 4 and 5), uLandD = its cumulative shares at crops 0..3. lu_field returns the crop id, the boundary distance (m), the track weight, the row direction and a
 * per-field jitter — the same numbers landUseAt computes.
 */
export const LAND_USE_GLSL = /* glsl */`
uniform vec4 uLandA;
uniform vec4 uLandB;
uniform vec4 uLandC;
uniform vec4 uLandD;
uniform vec4 uLandE;
uint lu_hash(uint x) { x ^= x >> 16u; x *= 0x7feb352du; x ^= x >> 15u; x *= 0x846ca68bu; x ^= x >> 16u; return x; }
float lu_rand(float a, float b, float salt) {
  uint h = lu_hash((uint(int(a) + 4096) * 0x9e3779b1u) ^ lu_hash(uint(int(b) + 4096) ^ (uint(salt) * 0x85ebca6bu)));
  return float(h >> 8u) * (1.0 / 16777216.0);
}
float lu_crop(float roll) {
  // the map's rotation: its cumulative shares at slots 0..5 (landUse.ts rotationCumulative), slot 6 the rest
  return roll < uLandD.x ? 0.0 : roll < uLandD.y ? 1.0 : roll < uLandD.z ? 2.0 : roll < uLandD.w ? 3.0
    : roll < uLandC.z ? 4.0 : roll < uLandC.w ? 5.0 : 6.0;
}
float lu_kind(float slot) {
  // the slot's crop kind: five bits a slot, slots 0..3 in uLandE.x and 4..6 in uLandE.y (landUse.ts rotationKinds)
  int s = int(slot + 0.5);
  int packed = s < 4 ? int(uLandE.x + 0.5) : int(uLandE.y + 0.5);
  return float((packed >> ((s < 4 ? s : s - 4) * 5)) & 31);
}
void lu_field(vec2 p, out float crop, out float edgeM, out float track, out vec2 rowDir, out float jitter, out float endM, out float hedge) {
  float warpM = uLandC.x, salt = uLandC.y;
  vec2 w = vec2(sin(p.x * 0.00523 + p.y * 0.00311 + 1.3) + 0.5 * sin(p.x * -0.00197 + p.y * 0.00877 + 4.1),
                sin(p.x * 0.00409 - p.y * 0.00587 + 2.7) + 0.5 * sin(p.x * 0.00913 + p.y * 0.00241 + 0.6));
  vec2 pw = p + w * warpM;
  float ch = cos(uLandA.y), sh = sin(uLandA.y);
  float qu = ch * pw.x + sh * pw.y, qv = -sh * pw.x + ch * pw.y;
  float blockU = uLandA.z, blockV = uLandA.w, maxSplit = uLandB.x;
  float row = floor(qv / blockV);
  float uq = qu + lu_rand(row, 7.0, salt) * blockU;
  float col = floor(uq / blockU);
  float lu = uq - col * blockU, lv = qv - row * blockV;
  float split = 1.0 + min(maxSplit - 1.0, floor(lu_rand(row, col, salt + 13.0) * maxSplit));
  bool alongU = lu_rand(row, col, salt + 17.0) < 0.5;
  float k, edgeU, edgeV;
  bool rowAlongU;
  if (alongU) {
    float fw = blockU / split;
    k = min(split - 1.0, floor(lu / fw));
    float s0 = lu - k * fw;
    edgeU = min(s0, fw - s0);
    edgeV = min(lv, blockV - lv);
    rowAlongU = fw > blockV;
  } else {
    float fw = blockV / split;
    k = min(split - 1.0, floor(lv / fw));
    float s0 = lv - k * fw;
    edgeV = min(s0, fw - s0);
    edgeU = min(lu, blockU - lu);
    rowAlongU = blockU > fw;
  }
  float fieldB = col * 8.0 + k;
  crop = lu_kind(lu_crop(lu_rand(row, fieldB, salt + 23.0)));
  float lineIdx = lv < blockV * 0.5 ? row : row + 1.0;
  bool trackOn = lu_rand(lineIdx, floor(qu / 120.0), salt + 31.0) < uLandB.z;
  float dLine = min(lv, blockV - lv);
  track = trackOn ? 1.0 - smoothstep(1.6, 2.6, dLine) : 0.0;
  edgeM = min(edgeU, edgeV);
  endM = rowAlongU ? edgeU : edgeV;
  rowDir = rowAlongU ? vec2(ch, sh) : vec2(-sh, ch);
  float ra = (lu_rand(row, fieldB, salt + 41.0) - 0.5) * 0.7, rc = cos(ra), rs = sin(ra);
  rowDir = vec2(rowDir.x * rc - rowDir.y * rs, rowDir.x * rs + rowDir.y * rc);
  jitter = lu_rand(row, fieldB, salt + 29.0);
  // the boundary's hedge (the twin's out.hedge): a hedged short boundary, 1.2 m full and gone by 2.4 m into the field
  bool hedgeOn = lu_rand(row, col * 8.0 + (alongU ? k : 7.0), salt + 37.0) < uLandB.w;
  float dShort = alongU ? min(edgeU, min(lu, blockU - lu)) : min(lu, blockU - lu);
  hedge = hedgeOn ? 1.0 - smoothstep(1.2, 2.4, dShort) : 0.0;
}
`;
