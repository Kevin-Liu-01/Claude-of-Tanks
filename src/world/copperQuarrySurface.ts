/** Copper Mesa's construction/physics surface; no mesh, noise or texture owner. */
export const COPPER_QUARRY = Object.freeze({ x: -78, z: 20, rx: 178, rz: 214, depth: 11, maximumCut: 8 });

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Cheap early-out before the existing road grid needs another lookup. */
export function insideCopperQuarry(x: number, z: number): boolean {
  return x > -256 && x < 40 && z > -194 && z < 234;
}

/** Three cut levels, with finite-width treads rather than quantized cliffs. */
export function copperQuarryRise(q: number): number {
  return COPPER_QUARRY.depth * (0.34 * smoothstep(0.28, 0.39, q)
    + 0.33 * smoothstep(0.52, 0.63, q)
    + 0.33 * smoothstep(0.76, 0.89, q));
}

/**
 * Excavate the existing elliptical pit only. Preserve the full 22m road
 * earthworks plus normal-sampling margin, the eastern building envelope and
 * the existing mud pan. The footprint is >92m from every authored spawn.
 * Existing relief supplies small tread weathering; no new noise queries.
 */
export function sampleCopperQuarrySurface(
  x: number, z: number, originalY: number, floorY: number, roadDistance: number,
): number {
  if (!insideCopperQuarry(x, z) || roadDistance <= 24) return originalY;
  const q = Math.hypot((x - COPPER_QUARRY.x) / COPPER_QUARRY.rx,
    (z - COPPER_QUARRY.z) / COPPER_QUARRY.rz);
  if (q >= 1) return originalY;
  const wetDistance = Math.hypot(x + 66, z - 32);
  if (wetDistance <= 44) return originalY;
  const weight = (1 - smoothstep(0.84, 1, q)) * smoothstep(24, 44, roadDistance)
    * (1 - smoothstep(0, 40, x)) * smoothstep(44, 60, wetDistance);
  const oldBowl = 1 - smoothstep(0.12, 1, q);
  const oldRise = COPPER_QUARRY.depth * (1 - oldBowl * oldBowl * (3 - 2 * oldBowl));
  const weathering = Math.max(-0.22, Math.min(0.22, (originalY - floorY - oldRise) * 0.08));
  // A quarry removes material; it must not dam the unchanged road corridors
  // with a raised circular embankment wherever the seeded hillside is low.
  const cutY = Math.max(originalY - COPPER_QUARRY.maximumCut,
    Math.min(originalY, floorY + copperQuarryRise(q) + weathering));
  return originalY + (cutY - originalY) * weight;
}
