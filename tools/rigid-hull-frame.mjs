// The Leopard 2 Improved's owner-requested narrowing lives on the hull rig's scale, so suspension also samples the
// narrower lane. Combat coordinates have no scale: measure its children in a rigid metre frame, keeping their full
// matrices (including shear), not decomposed transforms. Shared by tools/gen-combat-anatomy.mjs (receiptFor) and
// tools/anatomy-floor-blame.mjs, which must see the hull exactly as the anatomy measured it.
import * as THREE from 'three';

// 248 (the turret-scale lane; the coordinator's CR2 combat-frame ruling): a hull rig carrying a uniform scale (the
// Challenger 2 and 3 families' 1.1, scaleChallenger2Family/scaleChallenger3Family) is measured the same way. Their turret
// pivot, gun, track contact and track hitboxes are already in the scaled vehicle frame; measured under the scaled rig, the
// hull's cells, plates, modules and crew stations were 10% small and 15.5 cm under the turret's ring.
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
