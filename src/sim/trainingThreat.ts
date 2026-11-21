// trainingThreat.ts — what a training battle's scripted shooter's round would do to the player's front plate, as the
// shooter's reticle would read it (273, S9). Copyright © 2026 Kevin B. Liu.
//
// Kevin, 2026-11-18 (S9 option (a)): the player's front plate goes amber square-on and red turned 35 degrees, in the
// reticle's own colours. The angling scene's arc (ui/tutorial/tutorialGuide.ts) asks, for the hull's heading now and
// turned by each offset, the verdict of the shooter's volley round on the plate it aims at: the same solver and bands the
// reticle uses (sim/aimPenetration.ts, sim/penVerdict.ts), on the player's own armour at its pose, the hull alone turned.
// Pure: the poses, the armour and the round decide it.

import { Vector3 } from 'three';
import { aimArmorAlong, aimPenRatio } from './aimPenetration.ts';
import type { ArmorModel, ArmorPoseState, TankArmorPose } from './armor.ts';
import type { DamageShellSpec } from './damage.ts';
import { penVerdict, type PenVerdict } from './penVerdict.ts';
import { trainingVolleyAim, type TrainingVolley } from './trainingGround.ts';

/** The shooter's sight over its hull origin (m): the height its line to the plate starts from. */
const SIGHT_UP_M = 2.2;
const DEG = Math.PI / 180;

const _from = new Vector3();
const _to = new Vector3();
const _dir = new Vector3();
const _aim = { x: 0, y: 0, z: 0 };
const _pose = {} as TankArmorPose;

/**
 * The verdict of `shell` fired from `shooter` at the player's plate (`volley.aim`), the player's hull turned by each of
 * `offsetsDeg` from its heading now (as yaw grows), its gun kept on its bearing; null where the line meets no armour.
 * `armor` and `eraSpent` are the player's.
 */
export function trainingThreatVerdicts(
  shooter: { readonly x: number; readonly y: number; readonly z: number },
  player: ArmorPoseState,
  armor: ArmorModel,
  eraSpent: ReadonlySet<string> | undefined,
  shell: DamageShellSpec,
  volley: TrainingVolley,
  offsetsDeg: readonly number[],
): Array<PenVerdict | null> {
  _from.set(shooter.x, shooter.y + SIGHT_UP_M, shooter.z);
  return offsetsDeg.map((offset) => {
    // the hull turned, the gun kept where it points (the scene asks the player to keep it on the shooter)
    const turned: ArmorPoseState = { ...player, yaw: player.yaw + offset * DEG, turretYaw: player.turretYaw - offset * DEG };
    trainingVolleyAim({ x: player.pos.x, y: player.pos.y, z: player.pos.z, yaw: turned.yaw, pitch: turned.visualPitch, roll: turned.visualRoll }, volley, _aim);
    _to.set(_aim.x, _aim.y, _aim.z);
    const reach = _dir.copy(_to).sub(_from).length();
    _dir.normalize();
    const info = aimArmorAlong(_from, _dir, reach + 20, turned, armor, eraSpent, _pose);
    return info ? penVerdict(aimPenRatio(shell, info)) : null;
  });
}

/** The player's hull angle to a shooter (deg, 0 to 180): 0 nose on, 90 broadside, 180 its rear to it. */
export function hullAngleToDeg(player: { readonly x: number; readonly z: number; readonly yaw: number },
  shooter: { readonly x: number; readonly z: number }): number {
  const bearing = Math.atan2(shooter.x - player.x, shooter.z - player.z);
  const diff = Math.atan2(Math.sin(bearing - player.yaw), Math.cos(bearing - player.yaw));
  return Math.abs(diff) / DEG;
}
