import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.js';

const EPSILON = 1e-6;
const approximately = (actual, expected, message) => {
  assert.ok(Math.abs(actual - expected) <= EPSILON,
    `${message}: expected ${expected}, received ${actual}`);
};
const triangleCount = (object) => {
  const geometry = object?.geometry;
  if (!geometry) return 0;
  return geometry.index
    ? geometry.index.count / 3
    : geometry.getAttribute('position')?.count / 3 || 0;
};
const build = (id) => createTank(id, null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});
const namesBelow = (root) => {
  const names = [];
  root.traverse((object) => names.push(object.name));
  return names;
};

{
  const tank = build('t72b3m');
  try {
    const hullRig = tank.root.getObjectByName('rig_hull');
    const turretRig = tank.root.getObjectByName('rig_turret');
    assert.ok(hullRig && turretRig, 'T-72B3M retains separate hull and turret rigs');
    approximately(turretRig.position.y, 1.46, 'T-72B3M turret is lifted clear of the hull');
    assert.deepEqual(turretRig.userData.t72B3MTurretCleanupReceipt, {
      revision: 'single-crown-skin-r1',
      turretLiftM: 0.04,
      reliktStandOffM: 0.018,
      retiredCoplanarCrownLayers: 3,
    }, 'T-72B3M publishes its simplified crown and ERA seating contract');
    assert.deepEqual(hullRig.userData.t72B3MRunningGearCleanupReceipt, {
      revision: 'native-open-wheel-bays-r1',
      syntheticGapPanels: 0,
      terminalScraperShoes: 0,
    }, 'T-72B3M publishes the removal of synthetic wheel-bay shadow panels');
    assert.equal(namesBelow(tank.root).includes('t72b3mWheelBayShadow'), false,
      'T-72B3M no longer uses near-black rectangles between its road wheels');
  } finally {
    tank.dispose();
  }
}

{
  const tank = build('t72bu');
  try {
    const turretRig = tank.root.getObjectByName('rig_turret');
    assert.ok(turretRig, 'T-72BU retains its articulated turret rig');
    approximately(turretRig.position.y, 1.42, 'T-72BU casting is lifted clear of the hull');
    assert.deepEqual(turretRig.userData.t72BUTurretSeatingReceipt, {
      revision: 'raised-casting-conformal-k5-r1',
      turretLiftM: 0.06,
      k5StandOffM: 0.022,
      gunWorldAxisPreserved: true,
    }, 'T-72BU publishes its raised casting and conformal Kontakt-5 contract');
    assert.ok(turretRig.getObjectByName('turretExternalArmor'),
      'T-72BU Kontakt-5 remains turret-owned after reseating');
  } finally {
    tank.dispose();
  }
}

{
  const tank = build('bmpt_terminator2');
  try {
    const hullRig = tank.root.getObjectByName('rig_hull');
    const turretRig = tank.root.getObjectByName('rig_turret');
    const turntable = turretRig?.getObjectByName('turretTrack');
    assert.ok(hullRig && turretRig && turntable,
      'BMPT Terminator 2 retains a hull, articulated turret, and dedicated turntable');
    approximately(turretRig.position.y, 1.46, 'BMPT station remains seated on the hull roof');
    approximately(turretRig.position.z, -0.97, 'BMPT station is shifted aft toward hull center');
    assert.deepEqual(turretRig.userData.bmptTerminator2TurretSeatingReceipt, {
      revision: 'centered-dedicated-turntable-r1',
      stationShiftZM: -0.32,
      inheritedDonorTurretTrack: false,
      dedicatedTurntable: true,
    }, 'BMPT publishes the centered station and dedicated turntable contract');
    assert.equal(turretRig.userData.t72B3MTurretCleanupReceipt, undefined,
      'BMPT does not retain the donor T-72B3M turret cleanup receipt');
    assert.ok(triangleCount(turntable) <= 200,
      'BMPT turntable stays compact instead of inheriting the donor turretTrack assembly');
    assert.deepEqual(hullRig.userData.t72B3MRunningGearCleanupReceipt, {
      revision: 'native-open-wheel-bays-r1',
      syntheticGapPanels: 0,
      terminalScraperShoes: 0,
    }, 'BMPT inherits the cleaned native running gear without shadow inserts');
    assert.deepEqual(hullRig.userData.bmptTerminator2HullClosureReceipt, {
      revision: 'front-fender-notch-bridges-r1',
      bridgeCount: 2,
      syntheticWheelBayShadows: 0,
    }, 'BMPT closes the newly exposed front fender notches without fake shadows');
    assert.equal(namesBelow(tank.root).includes('t72b3mWheelBayShadow'), false,
      'BMPT no longer has near-black rectangles between its road wheels');
  } finally {
    tank.dispose();
  }
}

console.log('t72TurretCleanup.selftest: B3M, T-72BU, and BMPT geometry cleanup contracts pass');
