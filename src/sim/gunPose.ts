/**
 * The round's origin and bore at the fire instant: the one pose both drivers fire from (276, sim-det-trig; Main's ruling
 * on gap 3). The solo step took them from the visual's scene graph (three's native trig, the drawn rig, its recoil) while
 * the authority computed them here, so a page recording parted from its Node verification at the first shot. The hull's
 * attitude and the turret's yaw on detRotation, the gun's pitch on detMath; the visual keeps only what it draws at the
 * mouth (flash, smoke, the tracer's first frame).
 */
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import type { DamageShellSpec } from './damage.ts';
import * as detMath from './detMath.ts';
import { matrixRotationY, quaternionFromEuler } from './detRotation.ts';
import { cannonMouth, launcherMuzzleIndex, usesLauncherMuzzles, type CannonMouth } from './launcherPolicy.ts';

type Triple = readonly [number, number, number];
interface LauncherMuzzle { readonly x: number; readonly y: number; readonly z: number; readonly pitch?: number; readonly yaw?: number; readonly frame?: string }

/** What the pose reads of a hull: its spec's armour pivots and gun, its pose, and its launcher cursor. */
export interface GunPoseEntity {
  readonly spec: {
    readonly dims: { readonly heightM: number };
    readonly armor?: { readonly turretPivot?: Triple | readonly number[]; readonly gunPivot?: Triple | readonly number[];
      readonly gunBarrel?: { readonly lengthM?: number } | null;
      /** The drawn mouth across the bore from the trunnion at rest (the calibration's measured rig; 276). */
      readonly gunMouth?: { readonly x: number; readonly y: number } | null } | null;
    readonly gun: Parameters<typeof usesLauncherMuzzles>[0] & Parameters<typeof cannonMouth>[0] & { readonly launcherMuzzles?: readonly LauncherMuzzle[] };
  };
  readonly state: {
    readonly pos: Vector3; readonly yaw: number; readonly visualPitch: number; readonly visualRoll: number;
    readonly turretYaw: number; readonly gunPitch: number; readonly modeScale?: number;
  };
  readonly combat: { readonly launcherCursor?: number };
}

const _muzzle = new Vector3();
const _direction = new Vector3();
const _hullMatrix = new Matrix4();
const _turretMatrix = new Matrix4();
const _localMatrix = new Matrix4();
const _quat = new Quaternion();
const _euler = new Euler();
const _unit = new Vector3(1, 1, 1);
const _mouth: CannonMouth = { x: 0, y: 0 };
const finite = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

/**
 * The round's origin and bore (module scratch: copy before the next call). `cannonMuzzle` (round 8 Y1 s5-01) is the
 * gun's own mouth the round leaves (launcherPolicy.ts nextCannonMuzzle; -1 for a single bore): the origin moves to that
 * mouth in the pitching gun frame (its x and y about the bore, the barrel's length along it), the bore stays the gun's.
 * A launcher round leaves the tube the hull's launcher cursor names (read before the cursor advances).
 */
export function gunWorldPose(entity: GunPoseEntity, shellSpec?: DamageShellSpec,
  cannonMuzzle = -1): { muzzle: Vector3; direction: Vector3 } {
  const state = entity.state;
  const armor = entity.spec.armor || {};
  const turretPivot = armor.turretPivot || [0, entity.spec.dims.heightM * 0.7, 0];
  const gunPivot = armor.gunPivot || [0, entity.spec.dims.heightM * 0.15, 0];
  const barrelM = Math.max(0.5, finite(armor.gunBarrel && armor.gunBarrel.lengthM, 3));

  _euler.set(-state.visualPitch, state.yaw, state.visualRoll, 'YXZ');
  quaternionFromEuler(_quat, _euler);
  _unit.setScalar(state.modeScale ?? 1);
  _hullMatrix.compose(state.pos, _quat, _unit);
  matrixRotationY(_localMatrix, state.turretYaw);
  _localMatrix.setPosition(turretPivot[0]!, turretPivot[1]!, turretPivot[2]!);
  _turretMatrix.multiplyMatrices(_hullMatrix, _localMatrix);

  const sinPitch = detMath.sin(state.gunPitch);
  const cosPitch = detMath.cos(state.gunPitch);
  _direction.set(0, sinPitch, cosPitch).transformDirection(_turretMatrix).normalize();
  const mouth = cannonMouth(entity.spec.gun, cannonMuzzle, _mouth) ? _mouth : armor.gunMouth;
  if (mouth) {
    // the mouth carried about the trunnion as the gun pitches: a twin plant's mouth, or a single bore's drawn mouth off
    // its trunnion's line (the calibration's measured rig, 276: the fired muzzle is the drawn one at every pitch)
    _muzzle.set(gunPivot[0]! + mouth.x, gunPivot[1]! + mouth.y * cosPitch + barrelM * sinPitch,
      gunPivot[2]! - mouth.y * sinPitch + barrelM * cosPitch).applyMatrix4(_turretMatrix);
  } else {
    _muzzle.set(gunPivot[0]!, gunPivot[1]!, gunPivot[2]!)
      .applyMatrix4(_turretMatrix)
      .addScaledVector(_direction, barrelM * (state.modeScale ?? 1));
  }
  const launchers = usesLauncherMuzzles(entity.spec.gun, shellSpec) ? entity.spec.gun.launcherMuzzles : undefined;
  if (launchers?.length) {
    const index = launcherMuzzleIndex(entity.spec.gun, shellSpec, entity.combat.launcherCursor ?? 0);
    const tip = launchers[index]!;
    _muzzle.set(tip.x, tip.y, tip.z);
    const mouthPitch = tip.pitch ?? 0, mouthYaw = tip.yaw ?? 0;
    _direction.set(detMath.sin(mouthYaw) * detMath.cos(mouthPitch), detMath.sin(mouthPitch),
      detMath.cos(mouthYaw) * detMath.cos(mouthPitch));
    if (tip.frame !== 'turret') {
      _muzzle.set(gunPivot[0]! + tip.x, gunPivot[1]! + tip.y * cosPitch + tip.z * sinPitch,
        gunPivot[2]! - tip.y * sinPitch + tip.z * cosPitch);
      const dy = _direction.y, dz = _direction.z;
      _direction.y = dy * cosPitch + dz * sinPitch;
      _direction.z = -dy * sinPitch + dz * cosPitch;
    }
    _muzzle.applyMatrix4(_turretMatrix);
    _direction.transformDirection(_turretMatrix);
  }
  return { muzzle: _muzzle, direction: _direction };
}
