import { Vector3 } from 'three';

const _center = new Vector3();
const _ndc = new Vector3();

/** Center-mass point used by both acquisition and the live lock. */
export function mobileAutoAimCenter(entity, out) {
  out.copy(entity.state.pos);
  out.y += entity.spec.dims.heightM * 0.5;
  return out;
}

/** Pick the closest-to-reticle visible enemy inside a generous lock window. */
export function pickMobileAutoAimTarget(tanks, player, camera, isVisible = () => true) {
  if (!player || !camera || !Array.isArray(tanks)) return null;
  camera.updateMatrixWorld(true);
  let best = null;
  let bestScore = Infinity;
  for (const ent of tanks) {
    if (!ent || ent === player || ent.team === player.team || !ent.state || !ent.spec ||
        !ent.combat || ent.combat.destroyed || !isVisible(ent)) continue;
    mobileAutoAimCenter(ent, _center);
    _ndc.copy(_center).project(camera);
    if (_ndc.z < -1 || _ndc.z > 1 || Math.abs(_ndc.x) > 0.72 || Math.abs(_ndc.y) > 0.66) continue;
    const rangeM = _center.distanceTo(player.state.pos);
    const score = _ndc.x * _ndc.x + _ndc.y * _ndc.y * 1.15 + rangeM * 0.00002;
    if (score < bestScore) { bestScore = score; best = ent; }
  }
  return best;
}
