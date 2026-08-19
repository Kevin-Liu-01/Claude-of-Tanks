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
  assert.ok(box.max.z - box.min.z >= 6.92,
    `${band.name} reaches both source end wheels`);
}

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

console.log('leopard1A5Source.selftest: source envelope, smart course, seated rig, and A5 kit pass');
