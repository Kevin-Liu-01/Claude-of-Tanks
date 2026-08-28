// Renderer-free authored-prop placement helpers. These run only while a map is
// assembled, so every visual instance and its collision record share the same
// terrain support and compound dimensions without adding work to the frame loop.

const TAU = Math.PI * 2;

interface HeightField {
  getHeightAt(x: number, z: number): number;
}

export interface GroundSupport {
  y: number;
  min: number;
  max: number;
  spread: number;
}

export interface UtilityPoleStationOptions {
  spacing?: number;
  radius?: number;
  sink?: number;
  maxPairRelief?: number;
  maxLocalRelief?: number;
  allowPair?: boolean;
}

export interface UtilityPolePlacement {
  x: number;
  y: number;
  z: number;
  support: GroundSupport;
}

export interface UtilityPoleStation {
  yaw: number;
  paired: boolean;
  pairRelief: number;
  primary: UtilityPolePlacement;
  partner: UtilityPolePlacement | null;
}

export interface GroundedSegmentEndpoint {
  x: number;
  z: number;
  support: GroundSupport;
}

export interface GroundedObbSample {
  ix: number;
  iz: number;
  lx: number;
  lz: number;
  x: number;
  y: number;
  z: number;
}

export interface HedgehogBeamSpec {
  x: number;
  z: number;
  yaw: number;
  tilt: number;
  halfWidth: number;
  halfLength: number;
  minY: number;
  maxY: number;
}

export const UTILITY_POLE_PAIR_SPACING = 6.5;
export const UTILITY_POLE_PAIR_MAX_RELIEF = 0.4;
export const UTILITY_POLE_LOCAL_MAX_RELIEF = 0.18;

function heightAt(heightField: HeightField, x: number, z: number): number {
  return heightField.getHeightAt(x, z);
}

/** Lowest terrain support under a circular footprint, including its center. */
export function sampleDiscGround(
  heightField: HeightField,
  x: number,
  z: number,
  radius: number,
  sink = 0,
): GroundSupport {
  let min = heightAt(heightField, x, z);
  let max = min;
  const r = Math.max(0, radius);
  for (let index = 0; index < 8; index++) {
    const angle = index * TAU / 8;
    const y = heightAt(heightField, x + Math.cos(angle) * r, z + Math.sin(angle) * r);
    if (y < min) min = y;
    if (y > max) max = y;
  }
  return { y: min - Math.max(0, sink), min, max, spread: max - min };
}

/** Lowest terrain support under a rotated box footprint, corners and edges. */
export function sampleObbGround(
  heightField: HeightField,
  x: number,
  z: number,
  halfWidth: number,
  halfLength: number,
  yaw = 0,
  sink = 0,
): GroundSupport {
  const hw = Math.max(0, halfWidth);
  const hl = Math.max(0, halfLength);
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  let min = heightAt(heightField, x, z);
  let max = min;
  for (let ix = -1; ix <= 1; ix++) {
    for (let iz = -1; iz <= 1; iz++) {
      if (ix === 0 && iz === 0) continue;
      const lx = ix * hw;
      const lz = iz * hl;
      const y = heightAt(heightField, x + lx * c + lz * s, z - lx * s + lz * c);
      if (y < min) min = y;
      if (y > max) max = y;
    }
  }
  return { y: min - Math.max(0, sink), min, max, spread: max - min };
}

/**
 * Plan one roadside utility-pole station. Flat verges receive the authored
 * two-post rhythm while a shelf, shoulder, or gorge receives one independently
 * grounded post. Pair qualification covers the entire longitudinal footprint,
 * not merely the two post centers, so a ridge between them also rejects the
 * second post.
 */
export function planUtilityPoleStation(
  heightField: HeightField,
  x: number,
  z: number,
  tangentX: number,
  tangentZ: number,
  opts: UtilityPoleStationOptions = {},
): UtilityPoleStation {
  const length = Math.hypot(tangentX, tangentZ) || 1;
  const tx = tangentX / length;
  const tz = tangentZ / length;
  const yaw = Math.atan2(tx, tz);
  const spacing = opts.spacing ?? UTILITY_POLE_PAIR_SPACING;
  const radius = opts.radius ?? 0.3;
  const sink = opts.sink ?? 0.035;
  const maxPairRelief = opts.maxPairRelief ?? UTILITY_POLE_PAIR_MAX_RELIEF;
  const maxLocalRelief = opts.maxLocalRelief ?? UTILITY_POLE_LOCAL_MAX_RELIEF;
  const primarySupport = sampleDiscGround(heightField, x, z, radius, sink);
  const partnerX = x + tx * spacing;
  const partnerZ = z + tz * spacing;
  const partnerSupport = sampleDiscGround(heightField, partnerX, partnerZ, radius, sink);
  const pairSupport = sampleObbGround(
    heightField,
    x + tx * spacing * 0.5,
    z + tz * spacing * 0.5,
    radius,
    spacing * 0.5 + radius,
    yaw,
    0,
  );
  const paired = opts.allowPair !== false
    && primarySupport.spread <= maxLocalRelief
    && partnerSupport.spread <= maxLocalRelief
    && pairSupport.spread <= maxPairRelief;
  const primary = {
    x, y: primarySupport.y, z, support: primarySupport,
  };
  return {
    yaw,
    paired,
    pairRelief: pairSupport.spread,
    primary,
    partner: paired ? {
      x: partnerX, y: partnerSupport.y, z: partnerZ, support: partnerSupport,
    } : null,
  };
}

/** Terrain-aligned pose for a rigid cylindrical decoration such as a log. */
export function planGroundedSegment(
  heightField: HeightField,
  x: number,
  z: number,
  directionX: number,
  directionZ: number,
  length: number,
  radius = 0,
  sink = 0,
) {
  const horizontalLength = Math.hypot(directionX, directionZ) || 1;
  const dx = directionX / horizontalLength;
  const dz = directionZ / horizontalLength;
  const half = Math.max(0, length) * 0.5;
  const start: GroundedSegmentEndpoint = {
    x: x - dx * half,
    z: z - dz * half,
    support: sampleDiscGround(heightField, x - dx * half, z - dz * half, radius, 0),
  };
  const end: GroundedSegmentEndpoint = {
    x: x + dx * half,
    z: z + dz * half,
    support: sampleDiscGround(heightField, x + dx * half, z + dz * half, radius, 0),
  };
  const rise = end.support.min - start.support.min;
  const axisLength = Math.hypot(length, rise) || 1;
  return {
    x,
    y: (start.support.min + end.support.min) * 0.5 + radius - Math.max(0, sink),
    z,
    axisX: dx * length / axisLength,
    axisY: rise / axisLength,
    axisZ: dz * length / axisLength,
    start,
    end,
    relief: Math.max(start.support.max, end.support.max)
      - Math.min(start.support.min, end.support.min),
  };
}

/**
 * Fit a rigid OBB decoration to a sampled terrain plane. The plane is lowered
 * until every sampled footprint point is at or below its support, preventing
 * floating corners; `maxEmbed` lets callers reject terrain too irregular for
 * a rigid object instead of burying it to hide the mismatch.
 */
export function planGroundedObbPose(
  heightField: HeightField,
  x: number,
  z: number,
  halfWidth: number,
  halfLength: number,
  yaw = 0,
  sink = 0,
) {
  const hw = Math.max(0.001, halfWidth);
  const hl = Math.max(0.001, halfLength);
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const samples: GroundedObbSample[] = [];
  let min = Infinity;
  let max = -Infinity;
  for (let ix = -1; ix <= 1; ix++) {
    for (let iz = -1; iz <= 1; iz++) {
      const lx = ix * hw;
      const lz = iz * hl;
      const worldX = x + lx * c + lz * s;
      const worldZ = z - lx * s + lz * c;
      const y = heightAt(heightField, worldX, worldZ);
      samples.push({ ix, iz, lx, lz, x: worldX, y, z: worldZ });
      if (y < min) min = y;
      if (y > max) max = y;
    }
  }
  const centerY = samples[4].y;
  const slopeX = (samples[7].y - samples[1].y) / (2 * hw);
  const slopeZ = (samples[5].y - samples[3].y) / (2 * hl);
  let lowerBy = 0;
  for (const sample of samples) {
    const planeY = centerY + slopeX * sample.lx + slopeZ * sample.lz;
    lowerBy = Math.max(lowerBy, planeY - sample.y);
  }
  const y = centerY - lowerBy - Math.max(0, sink);
  let maxEmbed = 0;
  let maxFloat = -Infinity;
  for (const sample of samples) {
    const planeY = y + slopeX * sample.lx + slopeZ * sample.lz;
    maxEmbed = Math.max(maxEmbed, sample.y - planeY);
    maxFloat = Math.max(maxFloat, planeY - sample.y);
  }
  const localNX = -slopeX;
  const localNY = 1;
  const localNZ = -slopeZ;
  const normalLength = Math.hypot(localNX, localNY, localNZ) || 1;
  const nx = localNX / normalLength;
  const ny = localNY / normalLength;
  const nz = localNZ / normalLength;
  return {
    x, y, z,
    normalX: nx * c + nz * s,
    normalY: ny,
    normalZ: -nx * s + nz * c,
    slopeX,
    slopeZ,
    min,
    max,
    spread: max - min,
    maxEmbed,
    maxFloat,
    samples,
  };
}

/**
 * Collision slabs matching the three visibly crossed steel beams of one
 * anti-tank hedgehog. Each pitched beam gets its own narrow OBB and vertical
 * range instead of one oversized cylinder around all of the empty space.
 */
export function hedgehogBeamSpecs(
  x: number,
  baseY: number,
  z: number,
  yaw: number,
  scale: number,
  yawOffsets: readonly number[] = [0, 0, 0],
): HedgehogBeamSpec[] {
  const halfWidth = 0.08 * scale;
  const halfLength = 1.05 * scale;
  const halfThickness = 0.08 * scale;
  const centerY = baseY + 0.62 * scale;
  const tilts = [0.62, -0.62, 0.02];
  return tilts.map((tilt, index) => {
    const sinTilt = Math.abs(Math.sin(tilt));
    const cosTilt = Math.abs(Math.cos(tilt));
    const verticalHalf = sinTilt * halfLength + cosTilt * halfThickness;
    const projectedHalfLength = cosTilt * halfLength + sinTilt * halfThickness;
    return {
      x,
      z,
      yaw: yaw + index * TAU / 3 + (yawOffsets[index] || 0),
      tilt,
      halfWidth,
      halfLength: projectedHalfLength,
      minY: centerY - verticalHalf,
      maxY: centerY + verticalHalf,
    };
  });
}
