import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.js';

const visual = createTank('leo1a5', null, {
  proceduralOnly: true,
  geometryReceipt: true,
});
visual.root.updateMatrixWorld(true);

const hullRig = visual.root.getObjectByName('rig_hull');
const turretRig = visual.root.getObjectByName('rig_turret');
const gunRig = visual.root.getObjectByName('rig_gun');
assert.ok(hullRig && turretRig && gunRig, 'Leopard 1A5 keeps the canonical three-part rig');

const mesh = (name) => {
  const found = visual.root.getObjectByName(name);
  assert.ok(found?.isMesh, `Leopard 1A5 has merged ${name} geometry`);
  return found;
};
const bounds = (object) => new THREE.Box3().setFromObject(object);

// Registered source envelope after normalization: 3.363 m wide, 6.887 m
// body length, with the A5 L7A3 taking overall length to 9.54 m. Keep the
// procedural result within the measured source tolerance instead of allowing
// the old generic Leopard hull or an over-long gun to return.
const hull = bounds(mesh('hull'));
assert.ok(Math.abs((hull.max.x - hull.min.x) - 3.28) <= 0.04,
  `source-width hull retained (${hull.max.x - hull.min.x} m)`);
assert.ok(Math.abs((hull.max.z - hull.min.z) - 7.085) <= 0.04,
  `source-length hull retained (${hull.max.z - hull.min.z} m)`);
const root = bounds(visual.root);
assert.ok(Math.abs((root.max.z - root.min.z) - 9.59) <= 0.08,
  `L7A3 overall envelope retained (${root.max.z - root.min.z} m)`);

// One native seven-wheel smart course per side, with no static donor course.
assert.equal(hullRig.userData.nativeRoadWheelStations, 7,
  'Leopard 1A5 retains seven native road-wheel stations');
const trackBands = [];
visual.root.traverse((node) => {
  if (node.userData?.appearanceRole === 'trackBand') trackBands.push(node);
});
assert.equal(trackBands.length, 2, 'exactly one linked track band is present per side');
for (const band of trackBands) {
  const box = bounds(band);
  assert.ok(box.max.y >= 1.10 && box.min.y <= 0.011,
    `${band.name} wraps the complete source-height course`);
  assert.ok(box.max.z - box.min.z >= 6.60 && box.max.z - box.min.z <= 6.76,
    `${band.name} follows the measured Leopard-family course`);
}

// Finish pass: the fenders form a continuous bridge over the track return,
// the shallow aprons/lockers fill the formerly empty side band, and the two
// large rear fuel cans are physically carried by the transom rack.
const finish = hullRig.userData.leopard1A5FinishReceipt;
assert.deepEqual(finish, {
  continuousFenders: true,
  segmentedSideAprons: 14,
  fenderLockers: 8,
  rearFuelCans: 2,
  roadWheelStations: 7,
  sealedHullSides: true,
  leopard2TrackCourse: true,
  frontIdlerZ: 3.17,
  frontIdlerY: 0.66,
  rearSprocketZ: -2.70,
  rearSprocketY: 0.72,
}, 'Leopard 1A5 side/fender/fuel finish receipt remains complete');
const gear = hullRig.userData.runningGearReceipts?.[0];
assert.ok(gear, 'Leopard 1A5 publishes its native running-gear receipt');
assert.ok(gear.idler.y - gear.wheelY >= 0.23 && gear.sprocket.y - gear.wheelY >= 0.29,
  'both terminal drums rise above the road-wheel axis for the Leopard 2-like trapezoid');
mesh('hullCloth');

// The source ring is 0.50 m forward of hull center. The gun saddle must root
// inside the cast turret face so the tube and mantlet remain one assembly.
assert.ok(turretRig.position.distanceTo(new THREE.Vector3(0, 1.55, 0.50)) < 1e-8,
  'turret ring retains the registered source station');
assert.ok(gunRig.position.distanceTo(new THREE.Vector3(0, 0.47, 1.15)) < 1e-8,
  'gun saddle retains its authored turret-local station');
const turret = bounds(mesh('turret'));
const mount = bounds(mesh('gunMount'));
assert.ok(mount.min.z < turret.max.z && mount.max.z > turret.max.z,
  'mantlet overlaps the turret face and projects forward without an air gap');
assert.ok(turret.min.y <= hull.max.y,
  'turret bearing penetrates the hull deck instead of floating above it');

// A5 identity package: EMES/equipment, structural cupolas, pintle MG and two
// populated stowage racks remain turret-owned and visible above the source
// shell. These are intentional A5 additions to the base Leopard 1 oracle.
mesh('turretEquipment');
mesh('turretCupola');
let pintleMgs = 0;
let stowageRacks = 0;
turretRig.traverse((node) => {
  if (node.userData?.fittingRoot && node.userData.fitting === 'pintleMG') pintleMgs += 1;
  if (node.userData?.fittingRoot && node.userData.fitting === 'stowageRack') stowageRacks += 1;
});
assert.equal(pintleMgs, 1, 'one turret-owned pintle machine gun is retained');
assert.equal(stowageRacks, 2, 'both turret-side stowage racks are retained');
assert.deepEqual(turretRig.userData.leopard1A5TurretFinishReceipt, {
  connectedBustleBasket: true,
  bustleRearZ: -2.67,
  shieldedRoofMachineGun: true,
}, 'turret finish receipt retains the attached bustle and shielded MG station');
assert.deepEqual(gunRig.userData.leopard1A5MantletReceipt, {
  seated: true,
  width: 1.16,
  height: 0.49,
}, 'the larger mantlet remains seated in the turret embrasure');

console.log('leopard1A5Source.selftest: source envelope, Leopard course, closed fenders, rear fuel cans, seated rig, and A5 kit pass');
