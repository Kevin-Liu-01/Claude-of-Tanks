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
  assert.ok(box.max.y >= 1.10 && box.min.y <= -0.034,
    `${band.name} uses the deepened Leopard course`);
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
  roadWheelY: 0.30,
  roadWheelPitch: 0.74,
  roadWheelSpan: 4.44,
  roadWheelZs: [2.22, 1.48, 0.74, 0, -0.74, -1.48, -2.22],
  trackBotY: 0.005,
  sealedHullSides: true,
  closedDeckUnderstructure: true,
  deckSupportSegments: 2,
  hullOverFenders: true,
  hullSponsonBottomY: 1.20,
  fenderShelfTopY: 1.2275,
  hullFenderOverlapY: 0.0275,
  upperGlacisSurfaces: 1,
  upperGlacisFrontY: 1.04,
  upperGlacisRearY: 1.54,
  lowerGlacisJoinY: 1.04,
  leopard2TrackCourse: true,
  frontIdlerZ: 3.17,
  frontIdlerY: 0.66,
  rearSprocketZ: -2.70,
  rearSprocketY: 0.72,
}, 'Leopard 1A5 side/fender/fuel finish receipt remains complete');
const gear = hullRig.userData.runningGearReceipts?.[0];
assert.ok(gear, 'Leopard 1A5 publishes its native running-gear receipt');
assert.equal(gear.wheelY, 0.30, 'the seven road-wheel centers move lower into the taller track course');
assert.deepEqual(gear.wheelZs, [2.22, 1.48, 0.74, 0, -0.74, -1.48, -2.22],
  'the seven road wheels use the tighter Leopard 1 pitch');
for (let i = 1; i < gear.wheelZs.length; i++) {
  assert.ok(Math.abs((gear.wheelZs[i - 1] - gear.wheelZs[i]) - 0.74) < 1e-8,
    `road-wheel station ${i} remains on the compact 0.74 m pitch`);
}
assert.deepEqual(gear.idler, { z: 3.17, y: 0.66, r: 0.29 },
  'the front idler retains its authored position and radius');
assert.deepEqual(gear.sprocket, { z: -2.70, y: 0.72, r: 0.30 },
  'the rear sprocket retains its authored position and radius');
assert.ok(gear.idler.y - gear.wheelY >= 0.31 && gear.sprocket.y - gear.wheelY >= 0.37,
  'the fixed terminal drums now rise strongly above the lowered road-wheel axis');

// The sponson must bear on the fender shelf, while exactly one long shallow
// upper-glacis surface remains between the deck break and nose. A vertical
// probe at z=2.50 used to hit the obsolete second plane at y≈1.06 before
// reaching the correct y≈1.30 surface.
assert.ok(finish.hullSponsonBottomY < finish.fenderShelfTopY
  && finish.hullFenderOverlapY >= 0.027,
  'the armored hull shoulder physically overlaps and rests on the fender shelf');
const bowHits = new THREE.Raycaster(
  new THREE.Vector3(0, -1, 2.50), new THREE.Vector3(0, 1, 0), 0, 4,
).intersectObject(mesh('hull'), false);
assert.equal(bowHits.filter((hit) => hit.point.y > 0.95 && hit.point.y < 1.20).length, 0,
  'the obsolete lower duplicate upper-glacis plane is absent');
assert.ok(bowHits.some((hit) => hit.point.y > 1.28 && hit.point.y < 1.33),
  'the single shallow upper glacis remains at the authored exterior station');

// The marked rear and center deck skins have structural material directly
// beneath them. Horizontal probes through the former air layer must now hit
// the filled hull before reaching the outboard deck edge.
const deckSupportProbe = (y, z) => new THREE.Raycaster(
  new THREE.Vector3(2, y, z), new THREE.Vector3(-1, 0, 0), 0, 2,
).intersectObject(mesh('hull'), false)[0];
for (const [y, z] of [[1.60, -2.50], [1.55, 0]]) {
  const hit = deckSupportProbe(y, z);
  assert.ok(hit && hit.distance <= 0.80,
    `deck support closes the former internal void at y=${y}, z=${z}`);
}
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
