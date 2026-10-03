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

export type LandRegion = 'steppe' | 'bocage' | 'temperate';

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

/** Crops (the shader's ids). */
export const LAND_CROP = Object.freeze({
  pasture: 0, wheat: 1, barley: 2, green: 3, plough: 4, stubble: 5, sunflower: 6,
} as const);
export type LandCropId = (typeof LAND_CROP)[keyof typeof LAND_CROP];

/** Each region's rotation: the share of each crop, in crop-id order (the material reads it as uniforms, uLandC/D). */
const ROTATIONS: Readonly<Record<LandRegion, readonly (readonly [LandCropId, number])[]>> = Object.freeze({
  // the Kursk / Belgorod black earth: big wheat and barley strips, sunflower, plough of chernozem, little pasture
  steppe: [[0, 0.16], [1, 0.27], [2, 0.11], [3, 0.14], [4, 0.15], [5, 0.11], [6, 0.06]],
  // bocage: small fields, mostly grazing, some plough, hay and grain
  bocage: [[0, 0.50], [1, 0.12], [2, 0.06], [3, 0.12], [4, 0.12], [5, 0.08], [6, 0.0]],
  // central European mixed farming (Hesse, the Fulda gap): grain, pasture, plough and maize-dark rows
  temperate: [[0, 0.30], [1, 0.19], [2, 0.12], [3, 0.14], [4, 0.13], [5, 0.08], [6, 0.04]],
});

/** The rotation's cumulative shares at crops 0..5 (crop 6 takes the rest), normalised. */
function rotationCumulative(region: LandRegion): [number, number, number, number, number, number] {
  const table = ROTATIONS[region];
  let total = 0;
  for (const [, w] of table) total += w;
  const out: number[] = [];
  let acc = 0;
  for (let i = 0; i < 6; i++) { acc += (table[i]?.[1] ?? 0) / total; out.push(acc); }
  return out as [number, number, number, number, number, number];
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
});

/** The map's land use, or null (no fields). */
export function resolveLandUseProfile(mapId: string | null | undefined): LandUseProfile | null {
  return PROFILES[mapId ?? ''] ?? null;
}

export function landUseProfileIds(): string[] {
  return Object.keys(PROFILES);
}

/** The material's packing: three vec4 uniforms, no sampler (the program sits at the 16-unit budget). */
export function landUseUniformValues(profile: LandUseProfile | null): {
  landA: [number, number, number, number];
  landB: [number, number, number, number];
  landC: [number, number, number, number];
  landD: [number, number, number, number];
} {
  if (!profile || !(profile.strength > 0)) return { landA: [0, 0, 200, 150], landB: [1, 2, 0, 0], landC: [0, 0, 1, 1], landD: [1, 1, 1, 1] };
  const c = rotationCumulative(profile.region);
  return {
    landA: [Math.min(1, profile.strength), profile.heading, Math.max(40, profile.blockU), Math.max(40, profile.blockV)],
    landB: [Math.max(1, Math.min(4, Math.round(profile.maxSplit))), Math.max(0.5, profile.marginM),
      Math.min(1, Math.max(0, profile.trackShare)), Math.min(1, Math.max(0, profile.hedgeShare))],
    // (warp m, salt, the rotation's cumulative shares at crops 4 and 5); uLandD = its shares at crops 0..3
    landC: [Math.max(0, profile.warpM), profile.salt >>> 0, c[4], c[5]],
    landD: [c[0], c[1], c[2], c[3]],
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
}

export function createLandFieldSample(): LandFieldSample {
  return { active: 0, crop: 0, edgeM: 1e9, marginM: 0, track: 0, hedge: 0, rowX: 1, rowZ: 0, jitter: 0, id: 0 };
}

/** The analytic warp of the boundaries (m): two slow sines per axis, identical in GLSL. */
function warpX(x: number, z: number): number {
  return Math.sin(x * 0.00523 + z * 0.00311 + 1.3) + 0.5 * Math.sin(x * -0.00197 + z * 0.00877 + 4.1);
}
function warpZ(x: number, z: number): number {
  return Math.sin(x * 0.00409 - z * 0.00587 + 2.7) + 0.5 * Math.sin(x * 0.00913 + z * 0.00241 + 0.6);
}

/** The crop a field's roll picks — the GLSL lu_crop on the same cumulative shares (the uniforms' float32 values). */
function cropFromRoll(c: Float64Array, roll: number): LandCropId {
  for (let i = 0; i < 6; i++) if (roll < c[i]) return i as LandCropId;
  return 6;
}

/** A profile's layout constants, resolved once (the uniforms' own packing and float32 shares). */
interface CompiledLandUse {
  ch: number; sh: number; blockU: number; blockV: number; maxSplit: number; marginM: number;
  trackShare: number; hedgeShare: number; warpM: number; salt: number; cum: Float64Array;
}
const compiled = new WeakMap<LandUseProfile, CompiledLandUse>();
function compile(profile: LandUseProfile): CompiledLandUse {
  let c = compiled.get(profile);
  if (c) return c;
  const v = landUseUniformValues(profile);
  const cum = new Float64Array(6);
  [...v.landD, v.landC[2], v.landC[3]].forEach((share, i) => { cum[i] = Math.fround(share); });
  c = {
    ch: Math.cos(v.landA[1]), sh: Math.sin(v.landA[1]), blockU: v.landA[2], blockV: v.landA[3],
    maxSplit: v.landB[0], marginM: v.landB[1], trackShare: v.landB[2], hedgeShare: v.landB[3],
    warpM: v.landC[0], salt: v.landC[1], cum,
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
  out.active = 0; out.crop = 0; out.edgeM = 1e9; out.marginM = 0; out.track = 0; out.hedge = 0; out.rowX = 1; out.rowZ = 0;
  out.jitter = 0; out.id = 0;
  if (!profile || !(profile.strength > 0)) return out;
  const { ch, sh, blockU, blockV, maxSplit, marginM, trackShare, hedgeShare, warpM, salt, cum } = compile(profile);
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
  const crop = cropFromRoll(cum, luRand(fieldA, fieldB, salt + 23));
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
  const rx = rowAlongU ? ch : -sh, rz = rowAlongU ? sh : ch;
  out.rowX = rx; out.rowZ = rz;
  out.jitter = luRand(fieldA, fieldB, salt + 29);
  out.marginM = marginM * (0.7 + 0.6 * out.jitter);
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
uint lu_hash(uint x) { x ^= x >> 16u; x *= 0x7feb352du; x ^= x >> 15u; x *= 0x846ca68bu; x ^= x >> 16u; return x; }
float lu_rand(float a, float b, float salt) {
  uint h = lu_hash((uint(int(a) + 4096) * 0x9e3779b1u) ^ lu_hash(uint(int(b) + 4096) ^ (uint(salt) * 0x85ebca6bu)));
  return float(h >> 8u) * (1.0 / 16777216.0);
}
float lu_crop(float roll) {
  // the map's rotation: its cumulative shares at crops 0..5 (landUse.ts rotationCumulative), crop 6 the rest
  return roll < uLandD.x ? 0.0 : roll < uLandD.y ? 1.0 : roll < uLandD.z ? 2.0 : roll < uLandD.w ? 3.0
    : roll < uLandC.z ? 4.0 : roll < uLandC.w ? 5.0 : 6.0;
}
void lu_field(vec2 p, out float crop, out float edgeM, out float track, out vec2 rowDir, out float jitter) {
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
  crop = lu_crop(lu_rand(row, fieldB, salt + 23.0));
  float lineIdx = lv < blockV * 0.5 ? row : row + 1.0;
  bool trackOn = lu_rand(lineIdx, floor(qu / 120.0), salt + 31.0) < uLandB.z;
  float dLine = min(lv, blockV - lv);
  track = trackOn ? 1.0 - smoothstep(1.6, 2.6, dLine) : 0.0;
  edgeM = min(edgeU, edgeV);
  rowDir = rowAlongU ? vec2(ch, sh) : vec2(-sh, ch);
  jitter = lu_rand(row, fieldB, salt + 29.0);
}
`;
