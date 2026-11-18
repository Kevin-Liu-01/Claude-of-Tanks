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

/** The aim's reach (m): every line is traced this far, whatever the caller's own reach. */
export const AIM_REACH_M = 800;

/**
 * The armour a round from `origin` along unit `dir` meets on a target within `maxDist` (m): the authority's closed
 * collision cells at the target's current pose, its spent ERA left out (sim/armor.ts queryAimArmor). `pose` is scratch.
 * The line is always traced to AIM_REACH_M and the caller's reach applied after: plates that meet at one point (a
 * mantlet and the sight recess beside it) are told apart by the trace's parameter along the line, so two callers that
 * traced one line to different lengths could read different plates there (274: the paint and the reticle did).
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
  const info = queryAimArmor(origin, dir, AIM_REACH_M, tankPoseFromState(state, pose), armor, eraSpent);
  return info && info.distM <= maxDist ? info : null;
}

/** The round's penetration ratio through that armour at its range: impact angle, normalization, ricochet and shatter,
 * spaced and composite layers, ERA and the shell's falloff (sim/damage.ts estimatePenRatio). */
export function aimPenRatio(shell: DamageShellSpec, info: AimArmorInfo): number {
  return estimatePenRatio(shell, info.distM, info);
}
