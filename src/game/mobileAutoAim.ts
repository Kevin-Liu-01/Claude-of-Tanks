import type { RuntimeValue } from '../runtimeTypes.ts';
import { Vector3, type Camera } from 'three';

export interface MobileAutoAimCandidate {
  team?: RuntimeValue;
  state: { pos: Vector3 } | null;
  spec: { dims: { heightM: number } };
  combat: { destroyed?: boolean } | null;
}

export interface MobileAutoAimEntity extends MobileAutoAimCandidate {
  state: { pos: Vector3 };
  combat: { destroyed?: boolean };
}

/** Narrow a garage-safe roster record to a live battle target. */
export function isMobileAutoAimEntity<T extends MobileAutoAimCandidate>(
  entity: T | null | undefined,
): entity is T & MobileAutoAimEntity {
  return !!entity?.state && !!entity.combat;
}

const _center = new Vector3();
const _ndc = new Vector3();

/** Center-mass point used by both acquisition and the live lock. */
export function mobileAutoAimCenter(
  entity: MobileAutoAimEntity,
  out: Vector3,
): Vector3 {
  out.copy(entity.state.pos);
  out.y += entity.spec.dims.heightM * 0.5;
  return out;
}

/** Pick the closest-to-reticle visible enemy inside a generous lock window. */
export function pickMobileAutoAimTarget<T extends MobileAutoAimCandidate>(
  tanks: readonly T[] | null | undefined,
  player: T | null | undefined,
  camera: Camera | null | undefined,
  isVisible: (entity: T) => boolean = () => true,
): T | null {
  if (!isMobileAutoAimEntity(player) || !camera || !Array.isArray(tanks)) return null;
  camera.updateMatrixWorld(true);
  let best: T | null = null;
  let bestScore = Infinity;
  for (const ent of tanks) {
    if (!isMobileAutoAimEntity(ent) || ent === player || ent.team === player.team ||
        !ent.spec || ent.combat.destroyed || !isVisible(ent)) continue;
    mobileAutoAimCenter(ent, _center);
    _ndc.copy(_center).project(camera);
    if (_ndc.z < -1 || _ndc.z > 1 || Math.abs(_ndc.x) > 0.72 || Math.abs(_ndc.y) > 0.66) continue;
    const rangeM = _center.distanceTo(player.state.pos);
    const score = _ndc.x * _ndc.x + _ndc.y * _ndc.y * 1.15 + rangeM * 0.00002;
    if (score < bestScore) { bestScore = score; best = ent; }
  }
  return best;
}
