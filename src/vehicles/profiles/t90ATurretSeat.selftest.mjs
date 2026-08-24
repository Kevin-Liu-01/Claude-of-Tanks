import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TANK_SPECS } from '../specs.js';
import { createTank } from '../tankFactory.js';

const EPSILON = 1e-6;
const near = (actual, expected, message, epsilon = EPSILON) => {
  assert.ok(Math.abs(actual - expected) <= epsilon,
    `${message}: expected ${expected}, received ${actual}`);
};

const tank = createTank('t90a', null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});

try {
  assert.equal(TANK_SPECS.t90a.visual.number, '112',
    'RU-112 resolves to the base T-90A profile');

  const turret = tank.root.getObjectByName('rig_turret');
  const gun = tank.root.getObjectByName('rig_gun');
  const barrel = tank.root.getObjectByName('gun');
  const barrelDark = tank.root.getObjectByName('gunDark');
  assert.ok(turret && gun && barrel?.geometry && barrelDark?.geometry,
    'T-90A keeps its articulated turret and cannon geometry');
  assert.equal(gun.parent, turret, 'cannon remains owned by the moved turret');

  const receipt = turret.userData.t90aSeatReceipt;
  assert.ok(receipt, 'T-90A exposes its turret, Shtora, and cannon adjustment receipt');
  near(turret.position.z, 0.02, 'turret yaw seat moves rearward to the accepted station');
  near(receipt.turretRearwardShiftM, 0.10, 'turret moves rearward by 100 mm');
  near(receipt.shtoraEyeZ, 1.73, 'Shtora eyes move rearward on the turret');
  near(receipt.shtoraLocalRearwardShiftM, 0.07, 'Shtora eyes move rearward by 70 mm locally');
  near(receipt.shtoraSupportFrontZ, 1.69, 'Shtora support shoes follow the emitters');
  near(receipt.gunRadiusScale, 1.08, 'cannon cross-section grows by eight percent');
  assert.deepEqual(gun.position.toArray(), [0, 0.165, 0.825],
    'cannon trunnion remains fixed in turret-local space');

  barrel.geometry.computeBoundingBox();
  barrelDark.geometry.computeBoundingBox();
  near(barrel.geometry.boundingBox.max.x, 0.117 * 1.08, 'visible cannon sleeve uses the enlarged radius', 2e-6);
  near(barrelDark.geometry.boundingBox.max.x, 0.120 * 1.08, 'cannon collars grow with the tube', 2e-6);
  near(barrel.geometry.boundingBox.max.z, 4.816, 'cannon length remains unchanged while its diameter grows', 2e-6);

  const parts = tank.root.userData.combatGeometryParts;
  const shtoraBodies = parts.filter((part) => {
    if (part.bucket !== 'turretDark') return false;
    const width = part.max[0] - part.min[0];
    const height = part.max[1] - part.min[1];
    const depth = part.max[2] - part.min[2];
    const centerZ = (part.min[2] + part.max[2]) * 0.5;
    return Math.abs(width - 0.24 * 1.32) < 2e-5
      && Math.abs(height - 0.27 * 1.32) < 2e-5
      && Math.abs(depth - 0.22 * 1.32) < 2e-5
      && Math.abs(centerZ - 1.73) < 2e-5;
  });
  assert.equal(shtoraBodies.length, 2,
    'both Shtora emitter bodies occupy the rearward seat');

  for (const yawDeg of [0, 45, -90, 180]) {
    turret.rotation.y = THREE.MathUtils.degToRad(yawDeg);
    tank.root.updateMatrixWorld(true);
    assert.equal(gun.parent, turret,
      `cannon follows the rearward turret through yaw ${yawDeg}`);
  }
} finally {
  tank.dispose();
}

const burlak = createTank('t90a_burlak', null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});
try {
  const burlakTurret = burlak.root.getObjectByName('rig_turret');
  near(burlakTurret.position.z, 0.12,
    'Burlak preserves its independently accepted turret seat');
  assert.equal(burlakTurret.userData.t90aSeatReceipt, undefined,
    'RU-112 adjustment receipt does not leak into Burlak');
} finally {
  burlak.dispose();
}

console.log('t90ATurretSeat.selftest: RU-112 turret, Shtora eyes, and enlarged cannon verified');
