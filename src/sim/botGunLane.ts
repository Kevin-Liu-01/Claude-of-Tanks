import { Euler, Quaternion, Vector3 } from 'three';
import { shellGravityMps2, solveBallisticGunLay } from './ballistics.ts';
import type { BallisticShellSpec } from './ballistics.ts';

interface GunLaneEntity {
  state: {
    pos: { x: number; y: number; z: number };
    yaw: number;
    turretYaw: number;
    gunPitch: number;
    visualPitch?: number;
    visualRoll?: number;
  };
  spec: {
    dims: { heightM: number };
    armor?: {
      turretPivot?: readonly number[];
      gunPivot?: readonly number[];
      gunBarrel?: { lengthM?: number };
    };
  };
}

type LaneRaycast = (
  origin: Vector3, direction: Vector3, maxDistance: number,
) => { dist: number } | null | undefined;

// Sequential simulation scratch: no allocation or random sampling per probe.
const hullEuler = new Euler(0, 0, 0, 'YXZ');
const hullRotation = new Quaternion();
const muzzle = new Vector3();
const barrel = new Vector3();
const destination = new Vector3();
const launch = new Vector3();
const from = new Vector3();
const to = new Vector3();
const direction = new Vector3();

/** Seeing over a crest does not imply that the lower muzzle clears it.
 * Trace a nominal lane to the visible turret top, NOT the sampled aim point
 * or scattered projectile. Intentional misses retain their ordinary cost.
 * Muzzle transforms match authoritativeMatch's hull/turret/barrel ordering.
 */
export function botNominalGunLaneClear(
  shooter: GunLaneEntity,
  target: Pick<GunLaneEntity, 'state' | 'spec'>,
  shell: BallisticShellSpec,
  raycast: LaneRaycast,
): boolean {
  const state = shooter.state;
  const armor = shooter.spec.armor;
  const turret = armor?.turretPivot;
  const gun = armor?.gunPivot;
  const sy = Math.sin(state.turretYaw), cy = Math.cos(state.turretYaw);
  const gx = gun?.[0] ?? 0, gz = gun?.[2] ?? 0;
  hullEuler.set(-(state.visualPitch || 0), state.yaw, state.visualRoll || 0, 'YXZ');
  hullRotation.setFromEuler(hullEuler);
  muzzle.set(
    (turret?.[0] ?? 0) + gx * cy + gz * sy,
    (turret?.[1] ?? shooter.spec.dims.heightM * 0.7)
      + (gun?.[1] ?? shooter.spec.dims.heightM * 0.15),
    (turret?.[2] ?? 0) - gx * sy + gz * cy,
  ).applyQuaternion(hullRotation).add(state.pos);
  barrel.set(
    sy * Math.cos(state.gunPitch), Math.sin(state.gunPitch),
    cy * Math.cos(state.gunPitch),
  ).applyQuaternion(hullRotation);
  muzzle.addScaledVector(barrel, Math.max(0.5, armor?.gunBarrel?.lengthM ?? 3));
  destination.set(target.state.pos.x,
    target.state.pos.y + target.spec.dims.heightM * 0.85, target.state.pos.z);
  if (!solveBallisticGunLay(launch, muzzle, destination, shell)) return true;
  const horizontal = Math.hypot(destination.x - muzzle.x, destination.z - muzzle.z);
  const velocity = Math.max(1, shell.velocityMps || 1);
  const flightS = horizontal / Math.max(1e-6, Math.hypot(launch.x, launch.z) * velocity);
  const gravity = shellGravityMps2(shell);
  // Curved nominal flight, at most eight existing world queries. Direct
  // guided lanes need only one. The usual high-velocity round needs 1–3.
  const segments = Math.min(8, Math.max(1,
    Math.ceil(flightS * Math.sqrt(gravity / (8 * 0.025)))));
  from.copy(muzzle);
  for (let i = 1; i <= segments; i++) {
    const time = flightS * i / segments;
    to.copy(muzzle).addScaledVector(launch, velocity * time);
    to.y -= 0.5 * gravity * time * time;
    direction.copy(to).sub(from);
    const distance = direction.length();
    if (distance > 1e-6) {
      direction.multiplyScalar(1 / distance);
      const hit = raycast(from, direction, distance);
      // Preserve the eye-LOS convention at the target itself, including
      // target-adjacent cover. Intermediate crests never get that allowance.
      const allowance = i === segments ? 2 : 0;
      if (hit && hit.dist < distance - allowance) return false;
    }
    from.copy(to);
  }
  return true;
}
