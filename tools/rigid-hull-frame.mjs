// The Leopard 2 Improved's owner-requested narrowing lives on the hull rig's scale, so suspension also samples the
// narrower lane. Combat coordinates have no scale: measure its children in a rigid metre frame, keeping their full
// matrices (including shear), not decomposed transforms. Shared by tools/gen-combat-anatomy.mjs (receiptFor) and
// tools/anatomy-floor-blame.mjs, which must see the hull exactly as the anatomy measured it.
import * as THREE from 'three';

// 248 (the turret-scale lane; the coordinator's CR2 combat-frame ruling): a hull rig carrying a uniform scale is measured
// the same way. Every such tank is a whole vehicle scaled at its owners (the Challenger 2 and 3 families' 1.1, the Type
// 59's 0.855, the KF51 U's 1.05, the M60s' 0.9): its turret pivot, gun, track contact and track hitboxes are already in the
// scaled vehicle frame. Measured under the scaled rig, the hull's cells, plates, modules and crew stations were off by
// the scale (the CR2's 10% small and 15.5 cm under its turret's ring, the Type 59's a metre long with its roof 68 cm over
// its own turret pivot).
export function rigidHullFrame(tank, id) {
  const hullRig = tank.root.getObjectByName('rig_hull');
  const scale = hullRig?.scale;
  const uniform = scale && Math.abs(scale.x - 1) > 1e-6 && Math.abs(scale.y - scale.x) < 1e-9 && Math.abs(scale.z - scale.x) < 1e-9;
  if (id !== 'leo2_improved' && !uniform) return;
  const transform = id === 'leo2_improved' ? new THREE.Matrix4().makeScale(scale.x, 1, 1)
    : new THREE.Matrix4().makeScale(scale.x, scale.y, scale.z);
  for (const child of hullRig.children) {
    if (child.matrixAutoUpdate) child.updateMatrix();
    child.matrix.premultiply(transform);
    child.matrixAutoUpdate = false;
  }
  if (id === 'leo2_improved') hullRig.scale.x = 1;
  else hullRig.scale.set(1, 1, 1);
  tank.root.updateMatrixWorld(true);
}

// 249: the turret rig likewise (rigidTurretFrame). The combat turret frame is hull * T(turretPivot) * Ry(yaw), with no
// scale (sim/armor.ts); a turret rig keeping a uniform scale (turretRigScale.ts bakes only a squash) had its cells,
// plates, modules and crew measured off by it: the Challenger 3 pair's 10% small, the Type 59's 17% large.
export function rigidTurretFrame(tank) {
  const turretRig = tank.root.getObjectByName('rig_turret');
  const scale = turretRig?.scale;
  const uniform = scale && Math.abs(scale.x - 1) > 1e-6 && Math.abs(scale.y - scale.x) < 1e-9 && Math.abs(scale.z - scale.x) < 1e-9;
  if (!uniform) return;
  const transform = new THREE.Matrix4().makeScale(scale.x, scale.y, scale.z);
  for (const child of turretRig.children) {
    if (child.matrixAutoUpdate) child.updateMatrix();
    child.matrix.premultiply(transform);
    child.matrixAutoUpdate = false;
  }
  turretRig.scale.set(1, 1, 1);
  tank.root.updateMatrixWorld(true);
}
