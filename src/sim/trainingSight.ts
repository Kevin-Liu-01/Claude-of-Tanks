// trainingSight.ts — what a training battle's actor sees of the player's tank over the ground (273, S10 and S11).
// Copyright © 2026 Kevin B. Liu.
//
// One test for the hull-down scene's advance and its exposure shape (ui/tutorial), and for a scripted shooter that fires
// only while it sees the player (S11's Sentry 3, game/state.ts): a point of the loaner is seen where the line from the
// shooter's sight to it stays over the ground, its earthworks included. Pure: the poses and the ground decide it.

import * as detMath from './detMath.ts';

interface Point3 { readonly x: number; readonly y: number; readonly z: number }
/**
 * The loaner's hull and turret as a shooter sees them (S10, hull down): points along its hull from its centre and up from
 * its origin (m): the lower and upper front plates and the hull's top edge, then the turret's front and roof.
 */
export const EXPOSURE_POINTS = Object.freeze({
  hull: Object.freeze([{ along: 3.6, up: 0.7 }, { along: 3.0, up: 1.1 }, { along: 2.2, up: 1.55 }]),
  turret: Object.freeze([{ along: 1.4, up: 2.0 }, { along: 0.6, up: 2.35 }]),
});
/** The hull's half length the pitch is read over (m): the loaner's (7.92 m hull). */
const EXPOSURE_HALF_LENGTH_M = 3.96;
/** A shooter's sight over its origin (m), as sim/trainingThreat.ts has it. */
const EXPOSURE_SIGHT_UP_M = 2.2;

/**
 * Which of the player's hull and turret a shooter can see over the ground (S10): a point is seen where the line from the
 * shooter's sight to it stays over the ground along its length (its last 1.5 m, the player's own ground, left out). The
 * hull's pitch follows the ground under its nose and tail. `groundY` is the battle's ground (its earthworks included).
 */
export function trainingExposure(shooter: Point3, player: Point3 & { readonly yaw: number },
  groundY: (x: number, z: number) => number): { readonly hull: boolean; readonly turret: boolean } {
  const fx = detMath.sin(player.yaw), fz = detMath.cos(player.yaw);
  const nose = groundY(player.x + fx * EXPOSURE_HALF_LENGTH_M, player.z + fz * EXPOSURE_HALF_LENGTH_M);
  const tail = groundY(player.x - fx * EXPOSURE_HALF_LENGTH_M, player.z - fz * EXPOSURE_HALF_LENGTH_M);
  const rise = (nose - tail) / (2 * EXPOSURE_HALF_LENGTH_M);
  const eye = { x: shooter.x, y: shooter.y + EXPOSURE_SIGHT_UP_M, z: shooter.z };
  const seen = (point: { readonly along: number; readonly up: number }): boolean => {
    const to = { x: player.x + fx * point.along, y: player.y + point.up + rise * point.along, z: player.z + fz * point.along };
    const length = detMath.hypot(to.x - eye.x, to.y - eye.y, to.z - eye.z);
    for (let s = 2; s < length - 1.5; s += 0.5) {
      const k = s / length;
      if (eye.y + (to.y - eye.y) * k < groundY(eye.x + (to.x - eye.x) * k, eye.z + (to.z - eye.z) * k)) return false;
    }
    return true;
  };
  return { hull: EXPOSURE_POINTS.hull.some(seen), turret: EXPOSURE_POINTS.turret.some(seen) };
}
