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

/**
 * Three cut levels, with finite-width treads rather than quantized cliffs. (Copper Mesa round 2, the map-revival lane:
 * the Iron Blow's benches read as cut faces — each riser over 0.06 to 0.07 of the radius, about 26 degrees at its
 * steepest and still driven, so the rock layer takes the risers and the treads widen; was 0.11 to 0.13.) (Round 3,
 * gauntlet wave 132: "no open cut with stepped benches and haul roads is visible; the only excavation is a shallow
 * brown scraped smear": each riser over 0.04 of the radius — a cut face of 33 to 38 degrees, in the band the scree
 * layer draws, its knees inside the live 1 m height cache's 0.08 m; was 26 degrees.)
 */
export function copperQuarryRise(q: number): number {
  return COPPER_QUARRY.depth * (0.34 * smoothstep(0.33, 0.37, q)
    + 0.33 * smoothstep(0.57, 0.61, q)
    + 0.33 * smoothstep(0.83, 0.87, q));
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
