// One analytic contour drives the bank mesh, wet material and gameplay
// queries. No renderer, retained contour buffers, global cache or GPU resources.
export const SHORELINE_SEGMENTS = 64;
const TAU = Math.PI * 2;

export interface ShorelineDisc {
  x: number;
  z: number;
  r: number;
}

function hash(value: number): number {
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
}

/** Center-seeded capes, coves and smaller bank cuts, inside the authored disc. */
export function shorelineRadiusAt(disc: ShorelineDisc, angle: number): number {
  const seed = hash(Math.imul(Math.round(disc.x * 16), 73856093)
    ^ Math.imul(Math.round(disc.z * 16), 19349663));
  const phaseA = (seed & 0xffff) / 65536 * TAU;
  const phaseB = (seed >>> 16) / 65536 * TAU;
  // One-sided coves cut into a broad shore instead of inflating matching
  // rounded lobes. Folded banks add corners between those larger inlets.
  // Keep three trig evaluations, 64 shared samples and the same 0.8–1.0
  // envelope: channel overlap and adaptive bank support depend on that floor.
  // Concentric beach aprons retain identical phases, independent of radius.
  const broad = Math.sin(angle * 3 + phaseA) * 0.025;
  const cove = Math.max(0, Math.sin(angle * 5 - phaseB));
  const bank = Math.abs(Math.sin(angle * 11 + phaseA + phaseB)) * 0.04;
  return disc.r * Math.min(1, Math.max(0.80, 0.99 + broad - cove * cove * 0.12 - bank));
}

/**
 * Radial distance in units of the authored radius. Callers supply their
 * outermost useful band so distant queries skip both sqrt and atan2.
 */
export function shorelineDistance(
  disc: ShorelineDisc,
  x: number,
  z: number,
  outerBand = 1.32,
): number {
  const dx = x - disc.x, dz = z - disc.z;
  const bound = disc.r * outerBand;
  if (Math.abs(dx) >= bound || Math.abs(dz) >= bound) return Infinity;
  const squared = dx * dx + dz * dz;
  if (squared >= bound * bound) return Infinity;
  if (squared < 1e-12) return 0;
  const radius = shorelineRadiusAt(disc, Math.atan2(dz, dx));
  return Math.sqrt(squared) / Math.max(0.001, radius);
}

/** Wet-mask value, consumed both by the existing splat bake and water wakes. */
export function shorelineWetness(
  disc: ShorelineDisc,
  x: number,
  z: number,
  lake: boolean,
): number {
  const distance = shorelineDistance(disc, x, z, 1);
  return shorelineWetnessFromDistance(distance, lake);
}

/** Reuse an already evaluated contour while applying terrain constraints. */
export function shorelineWetnessFromDistance(distance: number, lake: boolean): number {
  const start = lake ? 0.80 : 0.45;
  const end = lake ? 0.96 : 1;
  const t = Math.max(0, Math.min(1, (distance - start) / (end - start)));
  return 1 - t * t * (3 - 2 * t);
}

/** Union coverage is order-independent, including overlapping sea sheets. */
export function sampleShorelineMask(
  marshes: readonly ShorelineDisc[],
  lakes: readonly ShorelineDisc[],
  x: number,
  z: number,
): number {
  let wetness = 0;
  for (let i = 0; i < lakes.length; i++) {
    wetness = Math.max(wetness, shorelineWetness(lakes[i], x, z, true));
    if (wetness === 1) return 1;
  }
  for (let i = 0; i < marshes.length; i++) {
    wetness = Math.max(wetness, shorelineWetness(marshes[i], x, z, false));
    if (wetness === 1) return 1;
  }
  return wetness;
}
