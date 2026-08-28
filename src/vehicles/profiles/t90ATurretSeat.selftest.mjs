import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TANK_SPECS } from '../specs.js';
import { createTank } from '../tankFactory.ts';

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
  near(receipt.shtoraEyeZ, 1.76, 'Shtora housings move ahead of the advanced cheek ERA');
  near(receipt.shtoraLocalRearwardShiftM, 0.04, 'Shtora remains 40 mm behind its original local datum');
  near(receipt.shtoraSupportFrontZ, 1.72, 'Shtora support shoes follow the advanced emitters');
  near(receipt.shtoraHousingRearZ, 1.6148, 'Shtora housing rear stays buried in its tapered pedestal');
  near(receipt.shtoraHousingFrontZ, 1.9052, 'complete Shtora housings project beyond the chevron faces');
  near(receipt.shtoraLensFrontZ, 1.9316, 'red lenses remain the frontmost optical surface');
  assert.ok(receipt.shtoraChevronDepthClearanceM >= 0.045,
    'Shtora housing faces clear the advanced ERA by a visible margin');
  assert.ok(receipt.shtoraSupportBodyOverlapM >= 0.10,
    'advanced Shtora bodies remain physically embedded in their support shoes');
  near(receipt.gunRadiusScale, 1.08, 'cannon cross-section grows by eight percent');
  assert.equal(receipt.cupolaCount, 2, 'RU-112 carries two complete roof cupolas');
  assert.deepEqual(receipt.leftCupola, [-0.35, -0.48], 'left cupola occupies the left roof station');
  assert.deepEqual(receipt.rightCupola, [0.52, -0.42], 'right cupola occupies the right roof station');
  assert.equal(receipt.rightCupolaLightCount, 2, 'right cupola carries two forward lights');
  assert.equal(receipt.leftCupolaMannedMg, 'nsvt', 'left cupola carries the manually served NSVT');
  assert.deepEqual(gun.position.toArray(), [0, 0.165, 0.825],
    'cannon trunnion remains fixed in turret-local space');

  barrel.geometry.computeBoundingBox();
  barrelDark.geometry.computeBoundingBox();
  near(barrel.geometry.boundingBox.max.x, 0.117 * 1.08, 'visible cannon sleeve uses the enlarged radius', 2e-6);
  near(barrelDark.geometry.boundingBox.max.x, 0.120 * 1.08, 'cannon collars grow with the tube', 2e-6);
  near(barrel.geometry.boundingBox.max.z, 4.816, 'cannon length remains unchanged while its diameter grows', 2e-6);

  const parts = tank.root.userData.combatGeometryParts;
  const cupolaParts = parts.filter((part) => part.bucket === 'turretCupola');
  const hatchParts = parts.filter((part) => part.bucket === 'turretHatch');
  assert.equal(cupolaParts.length, 4,
    'each roof station has a structural cupola base and upper rim');
  assert.equal(hatchParts.length, 2,
    'each cupola is closed by its own structural hatch lid');

  const rightLampLenses = parts.filter((part) => {
    if (part.bucket !== 'turretGlass') return false;
    const width = part.max[0] - part.min[0];
    const depth = part.max[2] - part.min[2];
    const centerX = (part.min[0] + part.max[0]) * 0.5;
    return Math.abs(width - 0.084) < 2e-3
      && Math.abs(depth - 0.012) < 2e-5
      && centerX > 0.3;
  });
  assert.equal(rightLampLenses.length, 2,
    'two recessed lenses physically occupy the right cupola lamp housings');

  const leftMgBarrels = parts.filter((part) => {
    if (part.bucket !== 'turretDark') return false;
    const width = part.max[0] - part.min[0];
    const depth = part.max[2] - part.min[2];
    const centerX = (part.min[0] + part.max[0]) * 0.5;
    return Math.abs(width - 0.058) < 2e-4
      && Math.abs(depth - 0.64) < 2e-5
      && Math.abs(centerX + 0.35) < 2e-5;
  });
  assert.equal(leftMgBarrels.length, 1,
    'the left cupola carries one full-length forward NSVT barrel');

  const shtoraBodies = parts.filter((part) => {
    if (part.bucket !== 'turretDark') return false;
    const width = part.max[0] - part.min[0];
    const height = part.max[1] - part.min[1];
    const depth = part.max[2] - part.min[2];
    const centerZ = (part.min[2] + part.max[2]) * 0.5;
    return Math.abs(width - 0.24 * 1.32) < 2e-5
      && Math.abs(height - 0.27 * 1.32) < 2e-5
      && Math.abs(depth - 0.22 * 1.32) < 2e-5
      && Math.abs(centerZ - 1.76) < 2e-5;
  });
  assert.equal(shtoraBodies.length, 2,
    'both complete Shtora emitter bodies occupy the advanced seat');
  const chevron = turret.userData.t90AChevronEraReceipt;
  assert.ok(chevron, 'T-90A publishes its advanced chevron receipt');
  for (const body of shtoraBodies) {
    assert.ok(body.max[2] - chevron.frontmostTileZM >= 0.045,
      'actual Shtora housing geometry stands visibly ahead of the frontmost ERA tile');
  }

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
  assert.equal(burlak.root.userData.combatGeometryParts.some((part) =>
    part.bucket === 'turretCupola' || part.bucket === 'turretHatch'), false,
  'RU-112 structural roof buckets do not leak through Burlak rebuild');
} finally {
  burlak.dispose();
}

const terminator = createTank('bmpt_t90', null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});
try {
  assert.equal(terminator.root.userData.combatGeometryParts.some((part) =>
    part.bucket === 'turretCupola' || part.bucket === 'turretHatch'), false,
  'RU-112 structural roof buckets do not leak into the BMPT replacement station');
} finally {
  terminator.dispose();
}

console.log('t90ATurretSeat.selftest: RU-112 turret, Shtora eyes, and enlarged cannon verified');
