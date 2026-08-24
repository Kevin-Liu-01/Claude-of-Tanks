import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.js';

const EPSILON = 1e-5;
const hasVertex = (mesh, [x, y, z]) => {
  const positions = mesh?.geometry?.getAttribute('position');
  if (!positions) return false;
  for (let i = 0; i < positions.count; i++) {
    if (Math.abs(positions.getX(i) - x) <= EPSILON
      && Math.abs(positions.getY(i) - y) <= EPSILON
      && Math.abs(positions.getZ(i) - z) <= EPSILON) return true;
  }
  return false;
};
const belongsTo = (object, ancestor) => {
  for (let node = object; node; node = node.parent) {
    if (node === ancestor) return true;
  }
  return false;
};

const tank = createTank('t72b3m', null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});

try {
  const hullRig = tank.root.getObjectByName('rig_hull');
  const turretRig = tank.root.getObjectByName('rig_turret');
  const turret = turretRig?.getObjectByName('turret');
  const turretDark = turretRig?.getObjectByName('turretDark');
  const turretCloth = turretRig?.getObjectByName('turretCloth');
  const hull = hullRig?.getObjectByName('hull');
  const hullDark = hullRig?.getObjectByName('hullDark');
  const hullCloth = hullRig?.getObjectByName('hullCloth');
  assert.ok(hullRig && turretRig && turret && turretDark && turretCloth,
    'T-72B3M retains separate hull and turret rigs with the side-bin material buckets');
  assert.ok([turret, turretDark, turretCloth].every((mesh) => belongsTo(mesh, turretRig)),
    'front bin cells, lid seams, and soft cases are merged below rig_turret');

  const receipt = turretRig.userData.t72b3mForwardAttachmentReceipt;
  assert.deepEqual(receipt, {
    owner: 'rig_turret',
    binCellsPerSide: 6,
    forwardBinCellsPerSide: 3,
    softCaseCellsPerSide: 5,
    forwardSoftCaseCellsPerSide: 2,
    zeroYawSeatPreserved: true,
  }, 'the complete forward attachment course publishes turret ownership');

  for (const side of [-1, 1]) {
    // Distinctive bevel corners from the three marked forward structural bins.
    assert.ok(hasVertex(turret, [side * 1.396, 0.221, 0.8845]),
      `${side}: first forward bin is present in turret-local geometry`);
    assert.ok(hasVertex(turret, [side * 1.396, 0.168, 0.9915]),
      `${side}: second forward bin is present in turret-local geometry`);
    assert.ok(hasVertex(turret, [side * 1.39948, 0.14448, 1.077]),
      `${side}: third forward bin is present in turret-local geometry`);
    assert.ok(hasVertex(turretCloth, [side * 1.545, 0.0735, 0.905])
      && hasVertex(turretCloth, [side * 1.545, 0.0735, 1.04]),
      `${side}: both marked forward soft-case cells are turret-owned`);
    assert.ok(hasVertex(turretDark, [side * 1.4955, 0.08, 0.918]),
      `${side}: final soft-case crease is turret-owned`);

    // The corresponding authored zero-yaw vertices must no longer exist in
    // hull buckets, which is the regression that left them behind during yaw.
    assert.equal(hasVertex(hull, [side * 1.396, 1.641, 0.2345]), false,
      `${side}: marked structural bin is absent from hull geometry`);
    assert.equal(hasVertex(hullCloth, [side * 1.545, 1.4935, 0.255]), false,
      `${side}: marked soft-case cell is absent from hull geometry`);
    assert.equal(hasVertex(hullDark, [side * 1.4955, 1.50, 0.268]), false,
      `${side}: marked parting crease is absent from hull geometry`);
  }

  const localCorner = new THREE.Vector3(1.396, 0.221, 0.8845);
  turretRig.rotation.y = 0;
  tank.root.updateMatrixWorld(true);
  const worldAtZero = turret.localToWorld(localCorner.clone());
  turretRig.rotation.y = Math.PI / 2;
  tank.root.updateMatrixWorld(true);
  const worldAtQuarterTurn = turret.localToWorld(localCorner.clone());
  const pivot = turretRig.getWorldPosition(new THREE.Vector3());
  assert.ok(worldAtZero.distanceTo(worldAtQuarterTurn) > 0.5,
    'marked front attachment visibly moves when the turret yaws');
  assert.ok(Math.abs(worldAtZero.distanceTo(pivot) - worldAtQuarterTurn.distanceTo(pivot)) <= EPSILON,
    'marked front attachment keeps its rigid turret-local radius through yaw');
} finally {
  tank.dispose();
}

console.log('t72B3MFrontAttachment.selftest: forward bins, lids, and soft cases follow turret yaw');
