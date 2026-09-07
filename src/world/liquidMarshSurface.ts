import { minimumShorelineRadius, shorelineRadiusAt, type ShorelineDisc } from './shoreline.ts';

interface LiquidMarsh extends ShorelineDisc { dip?: number; level?: number }
interface LiquidLake extends ShorelineDisc { level: number }
type HeightSampler = (x: number, z: number) => number;

export const LIQUID_MARSH_STRIDE = 4;
export const LIQUID_MARSH_CORE = 0.94;
export const MAX_LIQUID_RIVER_SLOPE = 0.01;
const BANK_DESIGN_SLOPE = 0.45;

function connected(a: ShorelineDisc, b: ShorelineDisc, band = LIQUID_MARSH_CORE): boolean {
  const dx = b.x - a.x, dz = b.z - a.z;
  const distance = Math.hypot(dx, dz);
  if (distance > (a.r + b.r) * band) return false;
  const angle = Math.atan2(dz, dx);
  return distance <= (shorelineRadiusAt(a, angle)
    + shorelineRadiusAt(b, angle + Math.PI)) * band;
}

function componentGroups(marshes: readonly ShorelineDisc[], band = 1.5): number[][] {
  const groups: number[][] = [];
  const visited = new Uint8Array(marshes.length);
  for (let start = 0; start < marshes.length; start++) {
    if (visited[start]) continue;
    const group = [start];
    visited[start] = 1;
    for (let cursor = 0; cursor < group.length; cursor++) {
      for (let next = 0; next < marshes.length; next++) {
        // A narrow dry ford still belongs to the same hydraulic reach.
        // Group overlapping bank envelopes, without changing its wet mask.
        if (visited[next] || !connected(marshes[group[cursor]], marshes[next], band)) continue;
        visited[next] = 1;
        group.push(next);
      }
    }
    groups.push(group);
  }
  return groups;
}

/** Resolve liquid sheets once in the existing level buffer. Independent pump
 * reaches keep their authored elevations; connected auto sheets share their
 * lowest outlet (or an explicit anchor), never a terrain-draped join. */
export function alignLiquidLakeLevels(lakes: readonly LiquidMarsh[], levels: Float64Array): void {
  for (const group of componentGroups(lakes, 1)) {
    let lowest = Infinity;
    let pinned: number | undefined;
    for (const index of group) {
      const level = lakes[index].level;
      if (!Number.isFinite(levels[index])) throw new RangeError('Liquid lake levels must be finite');
      lowest = Math.min(lowest, levels[index]);
      if (level === undefined) continue;
      if (!Number.isFinite(level)) throw new RangeError('Authored liquid lake levels must be finite');
      if (pinned !== undefined && Math.abs(pinned - level) > 1e-9) {
        throw new RangeError('Overlapping liquid lakes require one authored waterline');
      }
      pinned = level;
    }
    const level = pinned ?? lowest;
    for (const index of group) levels[index] = level;
  }
}

function median(values: number[]): number {
  values.sort((a, b) => a - b);
  const middle = values.length >> 1;
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) * 0.5;
}

function fitComponent(
  group: readonly number[],
  marshes: readonly LiquidMarsh[],
  lakes: readonly LiquidLake[],
  sample: HeightSampler,
): readonly [number, number, number] {
  let cx = 0, cz = 0, maxRadius = 0;
  const heights: number[] = [];
  const pinned: number[] = [];
  for (const index of group) {
    const marsh = marshes[index];
    cx += marsh.x; cz += marsh.z;
    maxRadius = Math.max(maxRadius, marsh.r);
    heights.push(sample(marsh.x, marsh.z));
    if (marsh.level !== undefined) pinned.push(marsh.level);
    for (const lake of lakes) if (connected(marsh, lake)) pinned.push(lake.level);
  }
  cx /= group.length; cz /= group.length;
  // Lake-connected arms inherit the actual lake surface. Explicit water
  // levels are authoring anchors, never resampled from the carved ground.
  if (pinned.length) return [median(pinned), 0, 0];
  let xx = 0, xz = 0, zz = 0;
  for (const index of group) {
    const x = marshes[index].x - cx, z = marshes[index].z - cz;
    xx += x * x; xz += x * z; zz += z * z;
  }
  const angle = 0.5 * Math.atan2(2 * xz, xx - zz);
  const axisX = Math.cos(angle), axisZ = Math.sin(angle);
  let minT = Infinity, maxT = -Infinity, th = 0, tt = 0;
  const level = median(heights.slice());
  for (let at = 0; at < group.length; at++) {
    const marsh = marshes[group[at]];
    const t = (marsh.x - cx) * axisX + (marsh.z - cz) * axisZ;
    minT = Math.min(minT, t); maxT = Math.max(maxT, t);
    th += t * (heights[at] - level); tt += t * t;
  }
  // Compact basins are horizontal. Only an elongated connected channel
  // gets a steady hydraulic grade; fine relief can never enter this plane.
  const river = group.length >= 3 && maxT - minT > maxRadius * 3;
  const slope = river ? Math.max(-MAX_LIQUID_RIVER_SLOPE,
    Math.min(MAX_LIQUID_RIVER_SLOPE, th / Math.max(1, tt))) : 0;
  const gx = axisX * slope, gz = axisZ * slope;
  if (group.length > 1) return [level - gx * cx - gz * cz, gx, gz];
  const marsh = marshes[group[0]];
  let low = level;
  for (let at = 0; at < 12; at++) {
    const a = at * Math.PI / 6;
    const radius = shorelineRadiusAt(marsh, a) * LIQUID_MARSH_CORE;
    low = Math.min(low, sample(marsh.x + Math.cos(a) * radius, marsh.z + Math.sin(a) * radius));
  }
  return [low - Math.min(0.25, Math.max(0.08, (marsh.dip ?? 2.6) * 0.1)), 0, 0];
}

function outerBankBand(disc: ShorelineDisc, level: number, gx: number, gz: number, sample: HeightSampler): number {
  let bankGap = 0;
  for (let at = 0; at < 12; at++) {
    const angle = at * Math.PI / 6;
    const radius = shorelineRadiusAt(disc, angle);
    for (const band of [LIQUID_MARSH_CORE, 1.32, 1.8]) {
      const x = disc.x + Math.cos(angle) * radius * band;
      const z = disc.z + Math.sin(angle) * radius * band;
      bankGap = Math.max(bankGap, Math.abs(sample(x, z) - (level + gx * x + gz * z)));
    }
  }
  // Smoothstep's peak derivative is 1.5. Extra margin allows native bank
  // relief, and the radius floor covers even the 80% contracted coves.
  const gradeWidth = bankGap * 2 / BANK_DESIGN_SLOPE;
  return Math.max(1.32, LIQUID_MARSH_CORE + gradeWidth / Math.max(1, minimumShorelineRadius(disc)));
}

/** One scalar per liquid lake; frozen/non-liquid sheets never use this policy. */
export function buildLiquidLakeBanks(lakes: readonly LiquidLake[], sample: HeightSampler): Float64Array {
  const result = new Float64Array(lakes.length);
  for (let index = 0; index < lakes.length; index++) {
    result[index] = outerBankBand(lakes[index], lakes[index].level, 0, 0, sample);
  }
  return result;
}

/** Four doubles per authored marsh; no raster, retained graph or query loop. */
export function buildLiquidMarshSurfaces(
  marshes: readonly LiquidMarsh[],
  sample: HeightSampler,
  lakes: readonly LiquidLake[] = [],
): Float64Array {
  const result = new Float64Array(marshes.length * LIQUID_MARSH_STRIDE);
  for (const group of componentGroups(marshes)) {
    const [level, gx, gz] = fitComponent(group, marshes, lakes, sample);
    for (const index of group) {
      const marsh = marshes[index];
      const offset = index * LIQUID_MARSH_STRIDE;
      result[offset] = level; result[offset + 1] = gx; result[offset + 2] = gz;
      result[offset + 3] = outerBankBand(marsh, level, gx, gz, sample);
    }
  }
  return result;
}
