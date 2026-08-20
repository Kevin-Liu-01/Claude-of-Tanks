import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.js';
import { getSpec } from '../specs.js';

const tank = createTank('pt91m', null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});
tank.root.updateMatrixWorld(true);

const spec = getSpec('pt91m');
const hull = tank.root.getObjectByName('rig_hull');
const turret = tank.root.getObjectByName('rig_turret');
assert.ok(hull && turret, 'PT-91M keeps articulated hull and turret rigs');

const gear = hull.userData.runningGearReceipts?.[0];
assert.equal(hull.userData.nativeRoadWheelStations, 6,
  'Pendekar uses the native six-station T-72 suspension');
assert.deepEqual(gear?.wheelZs, [-1.68, -1, -0.32, 0.36, 1.04, 1.72],
  'six road wheels span the complete PT-91M track course');
assert.ok(gear.wheelR >= 0.39, 'road wheels retain a full-size T-72 family diameter');
assert.ok(gear.sprocket.r >= 0.29 && gear.idler.r >= 0.29,
  'visible sprocket and idler are no longer miniature endpoint placeholders');
assert.equal(hull.userData.pt91mRunningGearReceipt?.detachedTrackTrimRemoved, true,
  'detached rectangular track-ramp trim is explicitly retired');
assert.equal(hull.userData.pt91mRunningGearReceipt?.legacySkidPanelsRemoved, true,
  'mismatched dark internal skid slabs are explicitly retired');
assert.equal(tank.root.getObjectByName('hullTrackTrimL'), undefined,
  'left fake track trim does not survive bucket assembly');
assert.equal(tank.root.getObjectByName('hullTrackTrimR'), undefined,
  'right fake track trim does not survive bucket assembly');

for (const name of ['gearTrackBandL', 'gearTrackBandR']) {
  const band = tank.root.getObjectByName(name);
  assert.ok(band, `${name} exists as one coherent linked course`);
  const bounds = new THREE.Box3().setFromObject(band);
  assert.ok(bounds.min.z <= gear.sprocket.z - gear.sprocket.r + 0.05,
    `${name} wraps around the drive sprocket`);
  assert.ok(bounds.max.z >= gear.idler.z + gear.idler.r - 0.05,
    `${name} wraps around the idler`);
}

const cupola = tank.root.getObjectByName('turretCupola');
const equipment = tank.root.getObjectByName('turretEquipment');
assert.ok(cupola && equipment,
  'structural cupolas and non-armor roof equipment use separate buckets');
assert.equal(turret.userData.pt91mRoofEquipmentReceipt?.cupolas, 2,
  'Pendekar roof carries commander and loader cupolas');
assert.equal(turret.userData.pt91mRoofEquipmentReceipt?.periscopeBlocks, 12,
  'both cupolas carry a complete periscope ring');
assert.equal(turret.userData.pt91mRoofEquipmentReceipt?.allEquipmentSeated, true,
  'roof fit records all added equipment as seated');

const mg = tank.root.getObjectByName('pt91mCommandMG');
assert.equal(mg?.parent, turret, 'raised NSVT remains attached to the traversing turret');
assert.equal(mg?.userData.pt91mRaisedMount, true, 'NSVT records its raised command mount');
assert.ok(mg.position.y >= 0.43, 'NSVT is raised above the loader station');

assert.equal(spec.visual.scheme, 'stripes', 'Pendekar uses a Polish woodland stripe scheme');
assert.equal(spec.visual.patches.length, 3,
  'Polish camouflage uses three contrasting patch colors');
assert.equal(spec.visual.number, '312', 'Pendekar keeps its vehicle number');

tank.dispose();
console.log('pt91mPendekarFidelity.selftest: tracks, roof equipment and Polish camouflage passed');
