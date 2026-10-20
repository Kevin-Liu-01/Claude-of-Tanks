// The Leopard 2 Improved's owner-requested narrowing lives on the hull rig's scale, so suspension also samples the
// narrower lane. Combat coordinates have no scale: measure its children in a rigid metre frame, keeping their full
// matrices (including shear), not decomposed transforms. Shared by tools/gen-combat-anatomy.mjs (receiptFor) and
// tools/anatomy-floor-blame.mjs, which must see the hull exactly as the anatomy measured it.
import * as THREE from 'three';

export function rigidHullFrame(tank, id) {
  if (id !== 'leo2_improved') return;
  const hullRig = tank.root.getObjectByName('rig_hull');
  const widthTransform = new THREE.Matrix4().makeScale(hullRig.scale.x, 1, 1);
  for (const child of hullRig.children) {
    if (child.matrixAutoUpdate) child.updateMatrix();
    child.matrix.premultiply(widthTransform);
    child.matrixAutoUpdate = false;
  }
  hullRig.scale.x = 1;
  tank.root.updateMatrixWorld(true);
}
