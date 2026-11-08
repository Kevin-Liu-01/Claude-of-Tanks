/**
 * Whether a round's step may reach a hull (268, item 8; docs/ARCHITECTURE.md "One core, two drivers"): the broad phase
 * both drivers run before the exact armour trace (sim/armor.ts traceTank), so a hull is traced on either driver exactly
 * when it is on the other (src/sim/driverStepParity.selftest.mjs). It is conservative: the step's start within the step's
 * length, the hull's reach and a 2 m margin of the hull's root, whatever its pose. (The solo battle's once sphere round
 * the root's mid-height culled real hits on a steeply pitched hull, the trace meeting it where the sphere did not.) A
 * wreck whose turret came off its ring is reached where the turret lies, WRECK_TURRET_REACH_M round it.
 */
import * as detMath from './detMath.ts';

interface Point3 { readonly x: number; readonly y: number; readonly z: number }

/** How far round a detached wreck turret's body a round's step looks for it (physics lane). */
export const WRECK_TURRET_REACH_M = 6.5;

/** The hull's reach from its root: the armour's bounding radius, or 0.65 of its hull length where the armour names none. */
export function hullReachM(spec: { armor?: { boundingRadiusM?: number } | null; dims: { hullLengthM: number } }): number {
  const radius = spec.armor?.boundingRadiusM;
  return typeof radius === 'number' && Number.isFinite(radius) ? radius : spec.dims.hullLengthM * 0.65;
}

/** `turret`: a detached wreck turret's position (x, y, z), or null. */
export function shellMayReachHull(from: Point3, segmentLength: number, root: Point3, reachM: number, turret: ArrayLike<number> | null = null): boolean {
  if (detMath.hypot(root.x - from.x, root.y - from.y, root.z - from.z) <= segmentLength + reachM + 2) return true;
  return !!turret && detMath.hypot(turret[0]! - from.x, turret[1]! - from.y, turret[2]! - from.z) <= segmentLength + WRECK_TURRET_REACH_M;
}
