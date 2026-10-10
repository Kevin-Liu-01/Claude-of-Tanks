import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';

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
// owner 2026-09-22 ("pt 91 m … wheels too big … overlap each other"): 750 mm wheels on a 0.80 m pitch.
assert.deepEqual(gear?.wheelZs, [-1.98, -1.18, -0.38, 0.42, 1.22, 2.02],
  'six road wheels span the complete PT-91M track course on the T-72 pitch');
assert.equal(gear.wheelR, 0.375, 'road wheels are the T-72 family 750 mm diameter');
assert.ok(2 * gear.wheelR <= 0.80 - 0.04, 'road wheels keep a visible gap on the 0.80 m pitch');
{
  const clear = (end, z) => Math.hypot(end.z - z, end.y - gear.wheelY) - (end.r + gear.wheelR);
  assert.ok(clear(gear.sprocket, -1.98) > 0.02, 'raised sprocket clears the first road wheel');
  assert.ok(clear(gear.idler, 2.02) > 0.02, 'raised idler clears the last road wheel');
}
// FSP-03 2026-09-25 (owner: rollers wherever the real vehicle has them): the T-72 family carries three return
// rollers per side (FAS T-72 entry; the T-90A X source `support wheels` node); the 2026-09-23 rollerless assertion
// is reversed — the Pendekar's upper run rides three fitted rollers.
const pendekarRollers = hull.getObjectByName('gearReturnRollerTires');
assert.ok(pendekarRollers && pendekarRollers.count === 6,
  'three return rollers per side: the T-72 family carries its upper run on rollers, not the road-wheel tops');
assert.ok(gear.sprocket.r >= 0.29 && gear.idler.r >= 0.29,
  'visible sprocket and idler are no longer miniature endpoint placeholders');
assert.equal(gear.sprocket.y, 0.72,
  'drive sprocket is raised above the road-wheel axle line');
assert.equal(gear.idler.y, 0.72,
  'idler is raised above the road-wheel axle line');
assert.ok(gear.sprocket.y - gear.wheelY >= 0.20
  && gear.idler.y - gear.wheelY >= 0.20,
  'both terminal wheels create visibly climbing track shoulders');
assert.equal(hull.userData.pt91mRunningGearReceipt?.revision,
  'pendekar-linked-course-r3-road-wheel-size',
  'PT-91M records the raised-terminal linked-course revision with the 750 mm road wheels');
assert.ok(Math.abs(hull.userData.pt91mRunningGearReceipt?.terminalLiftM - 0.17) < 1e-9,
  'PT-91M records the 17 cm terminal-wheel lift');
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
