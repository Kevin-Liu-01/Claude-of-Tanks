import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
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
assert.equal(protection.cassetteLayers, 2, 'every cassette has a charge body and inset cover');
assert.equal(protection.coverTiles, 128, 'every ERA charge body receives one cover layer');
assert.equal(protection.totalAuthoredParts, 256, 'the full two-layer package is authored');
assert.equal(protection.camoProjection, 'vehicle-scale-box-uv',
  'ERA camouflage is projected once at vehicle scale');
assert.equal(protection.destructibleConstruction, 'authored-layered-cluster',
  'both ERA layers participate in gameplay strip/reset behavior');
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

const obsoleteInstancedEra = [];
const externalArmorMeshes = [];
visual.root.traverse((object) => {
  if (object.isInstancedMesh
      && object.geometry?.type === 'BoxGeometry'
      && Math.abs(object.geometry.parameters?.width - 0.28) < 1e-6
      && Math.abs(object.geometry.parameters?.height - 0.13) < 1e-6
      && Math.abs(object.geometry.parameters?.depth - 0.07) < 1e-6) {
    obsoleteInstancedEra.push(object);
  }
  if (object.isMesh
      && (object.name === 'hullExternalArmor' || object.name === 'turretExternalArmor')) {
    externalArmorMeshes.push(object);
  }
});
assert.equal(obsoleteInstancedEra.length, 0,
  'ERA no longer repeats one full 0..1 camouflage island per cassette instance');
assert.equal(externalArmorMeshes.length, 2,
  'layered protection adds only the hull and turret external-armor draw buckets');
assert.deepEqual(new Set(externalArmorMeshes.map((mesh) => mesh.name)),
  new Set(['hullExternalArmor', 'turretExternalArmor']),
  'layered ERA remains merged into exactly two semantic armor draw buckets');
for (const mesh of externalArmorMeshes) {
  assert.equal(mesh.userData.combatHitboxRole, 'externalArmor',
    `${mesh.name} stays outside the primary shell envelope`);
  const uv = mesh.geometry.getAttribute('uv');
  assert.ok(uv, `${mesh.name} receives camouflage UVs after its authored parts merge`);
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (let index = 0; index < uv.count; index++) {
    minU = Math.min(minU, uv.getX(index));
    maxU = Math.max(maxU, uv.getX(index));
    minV = Math.min(minV, uv.getY(index));
    maxV = Math.max(maxV, uv.getY(index));
  }
  assert.ok(Math.max(maxU - minU, maxV - minV) > 1.1,
    `${mesh.name} UVs span the complete armor field instead of restarting on each tile`);
  assert.ok(minU < 0 || minV < 0 || maxU > 1 || maxV > 1,
    `${mesh.name} UVs are not confined to a miniature repeated 0..1 island`);
}
assert.ok(externalArmorMeshes.reduce((total, mesh) =>
  total + mesh.geometry.getAttribute('position').count, 0) <= 9216,
  'two-layer protection stays within the crisp-box static vertex budget');

const externalParts = visual.root.userData.combatGeometryParts
  .filter((part) => part.bucket === 'hullExternalArmor'
    || part.bucket === 'turretExternalArmor');
assert.equal(externalParts.filter((part) => part.bucket === 'turretExternalArmor').length, 168,
  '84 turret cassettes contribute one base and one cover each');
assert.equal(externalParts.filter((part) => part.bucket === 'hullExternalArmor').length, 88,
  '44 glacis cassettes contribute one base and one cover each');

const hullEra = externalArmorMeshes.find((mesh) => mesh.name === 'hullExternalArmor');
const turretEra = externalArmorMeshes.find((mesh) => mesh.name === 'turretExternalArmor');
const hullBeforeStrip = hullEra.geometry.getAttribute('position').array.slice();
const turretBeforeStrip = turretEra.geometry.getAttribute('position').array.slice();
assert.equal(visual.stripEra('a7v_upper_glacis_era'), true,
  'upper-glacis sector is destructible');
assert.ok(hullEra.geometry.getAttribute('position').array.some((value) => value < -999),
  'a glacis ERA hit removes both authored layers from the rendered hull bucket');
assert.deepEqual(turretEra.geometry.getAttribute('position').array, turretBeforeStrip,
  'a glacis ERA hit leaves turret ERA untouched');
visual.resetEra();
assert.deepEqual(hullEra.geometry.getAttribute('position').array, hullBeforeStrip,
  'round reset restores both glacis ERA layers exactly');
assert.deepEqual(turretEra.geometry.getAttribute('position').array, turretBeforeStrip,
  'round reset preserves the untouched turret package');

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

visual.dispose();
console.log('leopard2A7VGunEra.selftest: ok');
