import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';

const tank = createTank('carro45t', null, {
  proceduralOnly: true,
  geometryReceipt: true,
  quality: 'high',
});

try {
  tank.root.updateMatrixWorld(true);
  const turretArmor = [];
  tank.root.traverse((object) => {
    if (object.name === 'turret' && object.geometry) turretArmor.push(object);
  });
  assert(turretArmor.length > 0, 'Carro 45t exposes structural turret geometry');

  const roofHeight = (x, z) => {
    const ray = new THREE.Raycaster(
      new THREE.Vector3(x, 4, z),
      new THREE.Vector3(0, -1, 0),
    );
    return ray.intersectObjects(turretArmor, false)[0]?.point.y ?? -Infinity;
  };

  for (const z of [-1.10, -0.40, 0.30]) {
    const crossRoof = [0.45, 0.60, 0.75, 0.90].map((x) => roofHeight(x, z));
    assert(Math.min(...crossRoof) > 2.20,
      `vehicle-right roof remains structurally closed at z=${z}`);
    for (let index = 1; index < crossRoof.length; index++) {
      assert(Math.abs(crossRoof[index] - crossRoof[index - 1]) < 0.06,
        `vehicle-right crown joins continuously at z=${z}`);
    }
  }

  assert(roofHeight(0.75, 0.70) > 2.19,
    'raked forward closure reaches the turret shoulder');
  for (const [x, z] of [[0.55, 1.20], [0.45, 1.40]]) {
    const left = roofHeight(-x, z);
    const right = roofHeight(x, z);
    assert(Math.min(left, right) > 2.08,
      `both cheek-aligned crown courses remain structural at z=${z}`);
    assert(Math.abs(left - right) < 0.08,
      `crown outer edges follow the paired cheek sweep at z=${z}`);
  }
  assert(roofHeight(1.35, -0.40) < 2.05,
    'retired outboard shelf no longer floats above the turret wall');

  const fitReceipt = tank.root.getObjectByName('rig_turret')?.userData.carro45tFitReceipt;
  assert.deepEqual(fitReceipt, {
    frontCrownJoiners: 2,
    crownCourseOverlapM: 0.01,
    rearPlateauSeat: true,
    rearPlateauOverlapM: 0.0075,
  }, 'Carro 45t records its paired crown joiners and seated rear plateau');
  for (const [x, z] of [[-0.95, 0.90], [0.95, 0.90]]) {
    assert(roofHeight(x, z) > 2.05,
      `crown shoulder remains covered at x=${x}, z=${z}`);
  }
  for (const [x, z] of [[-0.90, -0.80], [0, -0.80], [0.40, -0.50]]) {
    assert(roofHeight(x, z) > 2.34,
      `raised rear plateau stays continuously seated at x=${x}, z=${z}`);
  }

  const rack = tank.root.getObjectByName('fitting_stowageRack');
  assert(rack, 'Carro 45t exposes its rear stowage rack fitting');
  const rackOutward = new THREE.Vector3(0, 0, 1).applyQuaternion(rack.getWorldQuaternion(new THREE.Quaternion()));
  assert(rackOutward.dot(new THREE.Vector3(0, 0, -1)) > 0.99,
    'rear rack open face points outside the bustle');
  const rackOrigin = rack.getWorldPosition(new THREE.Vector3());
  assert(rackOrigin.z < -2.05,
    'rear rack is seated on the bustle rear instead of inside its forward face');

  const bridgeRay = new THREE.Raycaster(
    new THREE.Vector3(0, 2.05, 4),
    new THREE.Vector3(0, 0, -1),
  );
  const rearHits = bridgeRay.intersectObjects(turretArmor, false).map(({ point }) => point.z);
  assert(rearHits.some((z) => z > -1.75 && z < -1.40),
    'structural transition closes the raked turret-to-bustle seam');
} finally {
  tank.dispose();
}

console.log('carro45tRoof.selftest: joined crown, seated plateau, closed bustle seam, outward rack');
