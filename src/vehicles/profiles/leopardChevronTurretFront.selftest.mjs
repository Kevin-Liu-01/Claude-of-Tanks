import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';

const modernProfiles = new Map([
  ['leo2a5', 'leopard-2a5'],
  ['leo2a6', 'leopard-2a6'],
  ['leo2a6m', 'leopard-2a6m'],
  ['leo2a6_ua', 'leopard-2a6m'],
  ['leo2a7v', 'leopard-2a7v'],
]);

const findMergedMesh = (root, name) => {
  let result = null;
  root.traverse((object) => {
    if (!result && object.isMesh && object.name === name) result = object;
  });
  assert.ok(result, `${name} merged mesh exists`);
  return result;
};

const hasVertex = (position, expected, epsilon = 1e-6) => {
  for (let index = 0; index < position.count; index++) {
    if (Math.abs(position.getX(index) - expected[0]) <= epsilon
        && Math.abs(position.getY(index) - expected[1]) <= epsilon
        && Math.abs(position.getZ(index) - expected[2]) <= epsilon) return true;
  }
  return false;
};

for (const [id, expectedProfile] of modernProfiles) {
  const tank = createTank(id, null, {
    proceduralOnly: true,
    geometryReceipt: true,
    quality: 'high',
  });
  tank.root.updateMatrixWorld(true);

  const turretRig = tank.root.getObjectByName('rig_turret');
  assert.ok(turretRig, `${id} retains the canonical rotating turret rig`);
  const receipt = turretRig.userData.leopardChevronFrontReceipt;
  assert.ok(receipt, `${id} publishes a turret-front geometry receipt`);
  assert.equal(receipt.profile, expectedProfile, `${id} uses its measured family profile`);
  assert.equal(receipt.architecture, 'closed-upper-and-lower-arrowhead',
    `${id} is a closed vertical and plan-view chevron`);
  assert.equal(receipt.runtimeGeometry, 'first-party-procedural',
    `${id} does not load the comparison model at runtime`);
  assert.equal(receipt.sourceComparisonOnly, true,
    `${id} records the owner model as measurement input only`);
  assert.equal(receipt.lowerReturnSolids, (receipt.planStationCount - 1) * 2,
    `${id} has one lower-return solid per cheek contour segment`);
  assert.equal(receipt.stations.length, receipt.planStationCount,
    `${id} publishes every plan station used by the physical lower face`);

  const turret = findMergedMesh(turretRig, 'turret');
  const position = turret.geometry.getAttribute('position');
  for (const [index, station] of receipt.stations.entries()) {
    assert.ok(station.ridgeZ > station.rootZ,
      `${id} station ${index} returns behind the forward ridge`);
    assert.ok(station.ridgeY > station.rootY,
      `${id} station ${index} returns downward from the forward ridge`);
    assert.ok(station.lowerSweepDeg >= 18 && station.lowerSweepDeg <= 28,
      `${id} station ${index} lower face has a reference-plausible chevron angle (${station.lowerSweepDeg} deg)`);
    for (const side of [-1, 1]) {
      assert.ok(hasVertex(position, [side * station.x, station.ridgeY, station.ridgeZ]),
        `${id} station ${index} ${side < 0 ? 'left' : 'right'} ridge is authored in the merged armor`);
      assert.ok(hasVertex(position, [side * station.x, station.rootY, station.rootZ]),
        `${id} station ${index} ${side < 0 ? 'left' : 'right'} lower root is authored in the merged armor`);
    }
  }

  tank.dispose();
}

const otco = createTank('leo2a4_otco', null, {
  proceduralOnly: true,
  geometryReceipt: true,
  quality: 'high',
});
const otcoTurret = otco.root.getObjectByName('rig_turret');
assert.ok(otcoTurret, 'Leopard 2A4 OTCO retains the canonical rotating turret rig');
assert.equal(otcoTurret.userData.leopardChevronFrontReceipt, undefined,
  'the earlier Leopard 2A4 is not falsely converted to A5-family arrowhead armor');
const otcoReceipt = otcoTurret.userData.leopard2A4FrontReceipt;
assert.ok(otcoReceipt, 'Leopard 2A4 OTCO publishes its distinct front-architecture receipt');
assert.equal(otcoReceipt.architecture, 'welded-box-with-clipped-front-corners');
assert.equal(otcoReceipt.arrowheadApplique, false);
assert.equal(otcoReceipt.runtimeGeometry, 'first-party-procedural');
otco.dispose();

console.log('Leopard turret-front chevron geometry selftest passed');
