import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.js';
import { getSpec } from '../specs.js';

const eraSectorNames = [
  'a7v_turret_cheek_era_R', 'a7v_turret_cheek_era_L',
  'a7v_upper_glacis_era',
];
const spec = getSpec('leo2a7v');
const eraSectors = [...spec.armor.hullPlates, ...spec.armor.turretPlates]
  .filter((plate) => eraSectorNames.includes(plate.name));
assert.deepEqual(new Set(eraSectors.map((plate) => plate.name)), new Set(eraSectorNames),
  'Leopard 2A7V visual ERA maps one-to-one to combat sectors');
for (const plate of eraSectors) {
  assert.equal(plate.kind, 'era', `${plate.name} is consumable ERA`);
  assert.ok(plate.era?.ceFlatMm >= 400, `${plate.name} has a chemical protection payload`);
}

const visual = createTank('leo2a7v', null, {
  proceduralOnly: true,
  geometryReceipt: true,
});
visual.root.updateMatrixWorld(true);

const turretRig = visual.root.getObjectByName('rig_turret');
const gunRig = visual.root.getObjectByName('rig_gun');
assert.ok(turretRig && gunRig, 'Leopard 2A7V keeps canonical turret and gun rigs');

const protection = turretRig.userData.leopard2A7VProtectionReceipt;
assert.ok(protection, 'Leopard 2A7V publishes its fitted protection receipt');
assert.equal(protection.totalTiles, 128, 'complete cheek and glacis package is authored');
assert.equal(protection.cheekSeats.length, 84, 'six courses cover both turret cheeks');
assert.equal(protection.glacisSeats.length, 44, 'four courses cover the upper glacis');
assert.deepEqual(new Set(protection.sectors), new Set(eraSectorNames),
  'receipt sectors match destructible armor sectors');
assert.equal(protection.staticMergedProtection, true,
  'new protection adds no per-frame geometry work');

const assertSurfaceSeat = (seat, halfDepth, expectedOverlap, label) => {
  const surface = new THREE.Vector3(...seat.surfaceLocal);
  const center = new THREE.Vector3(...seat.centerLocal);
  const normal = new THREE.Vector3(...seat.normalLocal);
  const offset = center.sub(surface);
  assert.ok(Math.abs(normal.length() - 1) < 2e-5, `${label} has a unit surface normal`);
  assert.ok(offset.clone().cross(normal).length() < 2e-5,
    `${label} center advances only along the sampled surface normal`);
  assert.ok(Math.abs(offset.dot(normal) - (halfDepth - expectedOverlap)) < 2e-5,
    `${label} inner face overlaps its armor seat by ${expectedOverlap} m`);
  assert.equal(seat.innerFaceOverlapM, expectedOverlap, `${label} records its overlap`);
};
for (const seat of protection.cheekSeats) {
  assertSurfaceSeat(seat, 0.07 * 0.86 * 0.5, 0.022, 'cheek ERA');
}
for (const seat of protection.glacisSeats) {
  assertSurfaceSeat(seat, 0.07 * 0.5, 0.018, 'glacis ERA');
}

const eraMeshes = [];
visual.root.traverse((object) => {
  if (object.isInstancedMesh
      && object.geometry?.type === 'BoxGeometry'
      && Math.abs(object.geometry.parameters?.width - 0.28) < 1e-6
      && Math.abs(object.geometry.parameters?.height - 0.13) < 1e-6
      && Math.abs(object.geometry.parameters?.depth - 0.07) < 1e-6) eraMeshes.push(object);
});
assert.equal(eraMeshes.reduce((total, mesh) => total + mesh.count, 0), 128,
  'every protection seat has one visual ERA cassette');
assert.equal(eraMeshes.length, 2, 'hull and turret ERA use two shared draw buckets');

const housing = gunRig.userData.leopard2A7VGunHousingReceipt;
assert.ok(housing, 'Leopard 2A7V publishes its compact gun-housing receipt');
assert.ok(housing.rearWidthM <= 0.56 && housing.rearHeightM <= 0.42,
  'housing throat is materially smaller than the old 0.68 by 0.54 m block');
assert.ok(housing.frontWidthM <= 0.38 && housing.frontHeightM <= 0.26,
  'housing tapers tightly around the gun at its forward edge');
assert.ok(housing.insertionDepthM >= 0.20,
  'housing is visibly inserted into the turret cheek opening');
assert.ok(housing.rearTurretLocalZ < housing.cheekNoseCenterLocalZ,
  'housing rear edge terminates behind the cheek nose');
assert.equal(housing.gunOwned, true, 'housing follows gun pitch under the gun rig');

let gunMount = null;
gunRig.traverse((object) => {
  if (!gunMount && object.isMesh && object.name === 'gunMount') gunMount = object;
});
assert.ok(gunMount, 'Leopard 2A7V retains a merged gunMount mesh');
gunMount.geometry.computeBoundingBox();
const bounds = gunMount.geometry.boundingBox;
assert.ok(bounds.max.x - bounds.min.x <= 0.64,
  `gun housing width remains compact (${bounds.max.x - bounds.min.x} m)`);
assert.ok(bounds.max.y - bounds.min.y <= 0.46,
  `gun housing height remains compact (${bounds.max.y - bounds.min.y} m)`);
assert.ok(bounds.min.z <= 0.49 && bounds.max.z <= 1.405,
  `gun housing stays deeply seated and short (${bounds.min.z}..${bounds.max.z} m)`);

console.log('leopard2A7VGunEra.selftest: ok');
