import assert from 'node:assert/strict';
import { Box3, Vector3 } from 'three';
import { createTank } from '../tankFactory.ts';

function geometrySignature(mesh) {
  const positions = mesh.geometry.attributes.position.array;
  let hash = 2166136261;
  for (let index = 0; index < positions.length; index++) {
    hash ^= Math.round(positions[index] * 10000);
    hash = Math.imul(hash, 16777619);
  }
  return `${positions.length}:${hash >>> 0}`;
}

const EXPECTED = Object.freeze({
  vt4a1: Object.freeze({
    gunWorldY: 1.94, chevronHalfWidth: 1.42,
    turretWidth: [2.90, 3.00], turretLength: [3.75, 3.95],
  }),
  type99a: Object.freeze({
    gunWorldY: 2.02, chevronHalfWidth: 1.63,
    turretWidth: [3.30, 3.42], turretLength: [4.20, 4.32],
  }),
});

function inspect(id) {
  const expected = EXPECTED[id];
  const tank = createTank(id, null, {
    proceduralOnly: true,
    geometryReceipt: true,
  });
  tank.root.updateMatrixWorld(true);
  const hullRig = tank.root.getObjectByName('rig_hull');
  const turretRig = tank.root.getObjectByName('rig_turret');
  const gunRig = tank.root.getObjectByName('rig_gun');
  const hull = tank.root.getObjectByName('hull');
  const turret = tank.root.getObjectByName('turret');
  const chevrons = tank.root.getObjectByName('turretExternalArmor');
  const gun = tank.root.getObjectByName('gun');
  assert(hullRig && turretRig && gunRig && hull && turret && chevrons && gun,
    `${id}: independent hull, turret, gun and chevron buckets exist`);

  const runningGear = hullRig.userData.runningGearReceipts;
  assert.equal(runningGear.length, 1, `${id}: owns one canonical running-gear unit`);
  assert.equal(runningGear[0].wheelZs.length, 6, `${id}: has six road-wheel stations per side`);
  assert.equal(runningGear[0].trackW, 0.6, `${id}: uses the measured 600 mm track`);
  assert.equal(runningGear[0].suspensionPlacement, 'inboard-behind-road-wheel',
    `${id}: suspension arms sit behind the wheels`);

  assert(chevrons.geometry.attributes.position.count >= 144,
    `${id}: four distinct two-course chevron solids survive mesh merging`);
  const chevronBounds = new Box3().setFromObject(chevrons);
  assert(chevronBounds.max.x >= expected.chevronHalfWidth
      && chevronBounds.min.x <= -expected.chevronHalfWidth,
    `${id}: chevrons reach both sloped turret shoulders`);
  const gunThroat = gunRig.getWorldPosition(new Vector3());
  assert(Math.abs(gunThroat.y - expected.gunWorldY) < 1e-8,
    `${id}: source-measured gun centerline remains fixed`);
  assert(chevronBounds.max.z >= gunThroat.z + 0.08,
    `${id}: chevrons frame the forward gun corridor`);
  assert(chevronBounds.min.y <= gunThroat.y - 0.25
      && chevronBounds.max.y >= gunThroat.y + 0.35,
    `${id}: lower and upper chevron courses cover the full turret brow`);

  const hullBounds = new Box3().setFromObject(hullRig);
  const turretBounds = new Box3().setFromObject(turret);
  const hullLength = hullBounds.max.z - hullBounds.min.z;
  const turretWidth = turretBounds.max.x - turretBounds.min.x;
  const turretLength = turretBounds.max.z - turretBounds.min.z;
  assert(hullLength >= 7.65 && hullLength <= 7.85,
    `${id}: complete hull/fender body retains its measured longitudinal envelope`);
  assert(turretWidth >= expected.turretWidth[0] && turretWidth <= expected.turretWidth[1],
    `${id}: welded turret width stays inside its model-specific source range`);
  assert(turretLength >= expected.turretLength[0] && turretLength <= expected.turretLength[1],
    `${id}: welded turret length stays inside its model-specific source range`);

  const fittings = [];
  turretRig.traverse((object) => {
    if (object.userData.fittingRoot) fittings.push(object.userData.fitting);
  });
  assert(fittings.includes('openYokeRws'), `${id}: roof carries a supported remote weapon station`);
  assert(fittings.includes('smokeBank'), `${id}: turret carries seated smoke banks`);
  assert(fittings.includes('antennaWhip'), `${id}: turret carries supported communications whips`);

  return {
    tank,
    hullBounds,
    turretBounds,
    hullSignature: geometrySignature(hull),
    turretSignature: geometrySignature(turret),
  };
}

const type99a = inspect('type99a');
const vt4a1 = inspect('vt4a1');

assert.equal(type99a.tank.root.getObjectByName('rig_hull').userData.type99aFrontlineReceipt
  ?.independentFromCanonicalFamily, true,
  'Type 99A: replacement hull explicitly rejects the retired canonical family base');
assert.deepEqual(type99a.tank.root.getObjectByName('rig_hull').userData.type99aFrontlineReceipt
  ?.sourceMeasuredBodyEnvelopeM, [7.145, 3.699, 3.685],
  'Type 99A: source-measured comparison envelope is retained in its receipt');
assert.equal(type99a.tank.root.getObjectByName('rig_hull').userData.type99aFrontlineReceipt
  ?.qualityGateFloor, 92,
  'Type 99A: ground-up rebuild opts into the 92-point exemplar floor');
assert.equal(type99a.tank.root.getObjectByName('rig_turret').userData.type99aFrontlineTurretReceipt
  ?.retiredBadTurretReused, false,
  'Type 99A: replacement turret explicitly rejects the retired turret');
assert.equal(vt4a1.tank.root.getObjectByName('rig_hull').userData.vt4a1GeometryReceipt
  ?.sourceGeometryImported, false,
  'VT-4A1: supplied GLB remains a comparison oracle, never runtime geometry');
assert.deepEqual(vt4a1.tank.root.getObjectByName('rig_hull').userData.vt4a1GeometryReceipt
  ?.sourceMeasuredBodyEnvelopeM, [7.464, 3.496, 3.120],
  'VT-4A1: supplied source measurements are retained without importing source geometry');
assert.equal(vt4a1.tank.root.getObjectByName('rig_hull').userData.vt4a1GeometryReceipt
  ?.qualityGateFloor, 92,
  'VT-4A1: new tank opts into the 92-point exemplar floor');
assert.equal(vt4a1.tank.root.getObjectByName('rig_turret').userData.vt4a1TurretReceipt
  ?.independentTurret, true,
  'VT-4A1: owns its welded turret shell');

assert.notEqual(type99a.hullSignature, vt4a1.hullSignature,
  'Chinese frontline hulls have distinct authored station geometry');
assert.notEqual(type99a.turretSignature, vt4a1.turretSignature,
  'Chinese frontline turrets have distinct authored geometry');
assert(type99a.turretBounds.max.x - type99a.turretBounds.min.x
    > vt4a1.turretBounds.max.x - vt4a1.turretBounds.min.x + 0.30,
  'Type 99A and VT-4A1 retain visibly distinct turret proportions');

type99a.tank.dispose();
vt4a1.tank.dispose();
console.log('type99AAngularTurret.selftest: independent Chinese hulls, distinct welded turrets, integrated two-course chevrons, running gear and roof fittings verified');
