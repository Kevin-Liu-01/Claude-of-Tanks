// src/world/canals.ts — the map-revival lane (2026-10-07, Tidegate Polders step 5; the coordinator's ruling): a shared,
// opt-in linear water primitive. A map lists its canals (terrain.canals) as polylines, each with a width, one water
// level and a bank or ditch profile; the terrain carves straight banks to that profile under every final height query
// (the canal's bed one water depth under its level, the banks rising from the waterline at the profile's slope until
// they meet the ground) and the liquid water reads the canal as wet ground from bank to bank, so the shallow-water sheet
// lies on it at the level: a strip at one level, not a chain of lake circles. A road keeps its ground over a canal (a
// culvert: the carve fades out across the road's band, as the wetness already dries under a road). Pure functions, no
// map knowledge: a map with no canals compiles to null and every caller skips it, so its terrain is byte-identical.

/** One canal as a map authors it. */
export interface CanalConfig {
  /** The centreline, world (x, z), two points or more. */
  path: readonly (readonly [number, number])[];
  /** The water's width at its level, metres. */
  widthM: number;
  /** The water level, world y (m). A canal that meets a basin takes the basin's level. */
  level: number;
  /** 'bank' (default): a navigable vaart, its banks at 1 in 2.5; 'ditch': a drainage ditch, its banks at 1 in 1.2. */
  profile?: 'bank' | 'ditch';
  /** The banks' rise over run from the waterline (overrides the profile's). */
  bankSlope?: number;
  /** The underwater shelf from the waterline down to the bed, metres (default a quarter of the width, at most 2). */
  shelfM?: number;
  name?: string;
}

/** A canal ready for queries: its segments, its bounds and its profile. */
interface CompiledCanal {
  ax: Float64Array; az: Float64Array; dx: Float64Array; dz: Float64Array; len2: Float64Array;
  minX: number; maxX: number; minZ: number; maxZ: number;
  half: number; level: number; slope: number; shelf: number; reach: number;
}

export interface CompiledCanals {
  readonly canals: readonly CompiledCanal[];
}

const PROFILE_SLOPE = { bank: 1 / 2.5, ditch: 1 / 1.2 } as const;
/** How far past the water's edge a canal can lower the ground: the banks rise until they meet it (8 m of rise at most). */
const MAX_BANK_RISE_M = 8;

/** Compile a map's canals (null when it lists none: the terrain then never calls in). */
export function compileCanals(configs: readonly CanalConfig[] | undefined): CompiledCanals | null {
  if (!configs?.length) return null;
  const canals: CompiledCanal[] = [];
  for (const c of configs) {
    if (!c || c.path.length < 2 || !(c.widthM > 0) || !Number.isFinite(c.level)) throw new Error('canal: a path of two points or more, a width and a level');
    const n = c.path.length - 1;
    const ax = new Float64Array(n), az = new Float64Array(n), dx = new Float64Array(n), dz = new Float64Array(n), len2 = new Float64Array(n);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < n; i++) {
      const [x0, z0] = c.path[i], [x1, z1] = c.path[i + 1];
      ax[i] = x0; az[i] = z0; dx[i] = x1 - x0; dz[i] = z1 - z0; len2[i] = dx[i] * dx[i] + dz[i] * dz[i];
      minX = Math.min(minX, x0, x1); maxX = Math.max(maxX, x0, x1); minZ = Math.min(minZ, z0, z1); maxZ = Math.max(maxZ, z0, z1);
    }
    const half = c.widthM / 2, slope = c.bankSlope ?? PROFILE_SLOPE[c.profile ?? 'bank'];
    const shelf = c.shelfM ?? Math.min(2, c.widthM / 4);
    const reach = half + MAX_BANK_RISE_M / slope;
    canals.push({ ax, az, dx, dz, len2, minX: minX - reach, maxX: maxX + reach, minZ: minZ - reach, maxZ: maxZ + reach,
      half, level: c.level, slope, shelf: Math.min(shelf, half), reach });
  }
  return { canals };
}

/** The distance from (x, z) to a canal's centreline (Infinity past its reach). */
function canalDistance(c: CompiledCanal, x: number, z: number): number {
  if (x < c.minX || x > c.maxX || z < c.minZ || z > c.maxZ) return Infinity;
  let best = Infinity;
  for (let i = 0; i < c.ax.length; i++) {
    const px = x - c.ax[i], pz = z - c.az[i];
    const t = c.len2[i] > 0 ? Math.max(0, Math.min(1, (px * c.dx[i] + pz * c.dz[i]) / c.len2[i])) : 0;
    const ex = px - t * c.dx[i], ez = pz - t * c.dz[i];
    const d2 = ex * ex + ez * ez;
    if (d2 < best) best = d2;
  }
  return Math.sqrt(best);
}

/**
 * The canals' carve at (x, z): the ground lowered to each canal's profile — the bed one water depth under the level
 * across the channel (less the shelf at each side, which slopes up to the waterline), the banks rising from the waterline
 * at the profile's slope — never raised. `roadKeep` (0..1) is how much a road keeps its own ground here: 1 on a road's
 * band (a culvert), 0 off it.
 */
export function carveCanals(compiled: CompiledCanals, x: number, z: number, h: number, depthM: number, roadKeep: number): number {
  if (roadKeep >= 1) return h;
  let out = h;
  for (const c of compiled.canals) {
    const d = canalDistance(c, x, z);
    if (!(d < c.reach)) continue;
    const bed = c.level - depthM;
    let profile: number;
    if (d <= c.half - c.shelf) profile = bed;
    else if (d <= c.half) profile = bed + (c.level - bed) * ((d - (c.half - c.shelf)) / Math.max(1e-6, c.shelf));
    else profile = c.level + (d - c.half) * c.slope;
    if (profile < out) out = profile;
  }
  return out < h ? h + (out - h) * (1 - roadKeep) : h;
}

/** The canals' liquid wetness at (x, z): 1 inside the water, falling to 0 a metre past the waterline. */
export function canalWetness(compiled: CompiledCanals, x: number, z: number): number {
  let wet = 0;
  for (const c of compiled.canals) {
    const d = canalDistance(c, x, z);
    if (!(d < c.half + 1)) continue;
    const w = d <= c.half - 1 ? 1 : 1 - (d - (c.half - 1)) / 2;
    if (w > wet) wet = w;
    if (wet >= 1) break;
  }
  return wet;
}

/** Whether (x, z) lies in a canal's water or on its banks' foot (vegetation and props keep off). */
export function inCanal(compiled: CompiledCanals, x: number, z: number, marginM = 1.5): boolean {
  for (const c of compiled.canals) if (canalDistance(c, x, z) < c.half + marginM) return true;
  return false;
}
