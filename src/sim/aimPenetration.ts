// The aim's penetration solver (274): the reticle (game/aimController.ts) and the scoped armour paint
// (game/armorAimOverlay.ts) both ask it what a round along a line meets and how it fares, and band the answer with
// sim/penVerdict.ts, so the paint on a panel and the reticle laid on that panel never disagree.
//
// Owner, 2026-11-18: "our hitbox shading is wrong and needs to update on enemy tanks when we're scoped on them based on
// their actual penetrability relative to when we currently look at them! same way our reticle knows whether to turn red
// or green to indicate penetration."

import { queryAimArmor, tankPoseFromState, type ArmorModel, type ArmorPoseState, type TankArmorPose } from './armor.ts';
import { estimatePenRatio, type AimArmorInfo, type DamageShellSpec } from './damage.ts';
import type { Vector3 } from 'three';

/** The aim's reach (m): the reticle and the paint judge no line longer than this. */
export const AIM_REACH_M = 800;

/**
 * The armour a round from `origin` along unit `dir` meets on a target within `maxDist` (m): the authority's closed
 * collision cells at the target's current pose, its spent ERA left out (sim/armor.ts queryAimArmor). `pose` is scratch.
 * Plates that meet at one point (a mantlet and the sight recess beside it) resolve the same way whatever length the
 * line is traced to (sim/armor.ts breakCoplanarTies, 274), so the reticle, the paint and a real shot's per-tick
 * segments read one plate there.
 */
export function aimArmorAlong(
  origin: Vector3,
  dir: Vector3,
  maxDist: number,
  state: ArmorPoseState,
  armor: ArmorModel,
  eraSpent: ReadonlySet<string> | undefined,
  pose: TankArmorPose,
): AimArmorInfo | null {
  return queryAimArmor(origin, dir, maxDist, tankPoseFromState(state, pose), armor, eraSpent);
}

/** The round's penetration ratio through that armour at its range: impact angle, normalization, ricochet and shatter,
 * spaced and composite layers, ERA and the shell's falloff (sim/damage.ts estimatePenRatio). */
export function aimPenRatio(shell: DamageShellSpec, info: AimArmorInfo): number {
  return estimatePenRatio(shell, info.distM, info);
}
