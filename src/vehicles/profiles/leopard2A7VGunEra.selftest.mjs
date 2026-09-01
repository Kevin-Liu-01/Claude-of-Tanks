import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';

const eraSectorNames = ['a7v_upper_glacis_era'];
const permanentCheekNames = [
  'a7v_turret_cheek_layer_R', 'a7v_turret_cheek_layer_L',
];
const spec = getSpec('leo2a7v');
const eraSectors = [...spec.armor.hullPlates, ...spec.armor.turretPlates]
  .filter((plate) => eraSectorNames.includes(plate.name));
assert.deepEqual(new Set(eraSectors.map((plate) => plate.name)), new Set(eraSectorNames),
  'Leopard 2A7V keeps ERA only on the upper glacis');
for (const plate of eraSectors) {
  assert.equal(plate.kind, 'era', `${plate.name} is consumable ERA`);
  assert.ok(plate.era?.ceFlatMm >= 400, `${plate.name} has a chemical protection payload`);
}
const permanentCheeks = spec.armor.turretPlates
  .filter((plate) => permanentCheekNames.includes(plate.name));
assert.deepEqual(new Set(permanentCheeks.map((plate) => plate.name)), new Set(permanentCheekNames),
  'both turret cheeks publish permanent layered-armor sectors');
for (const plate of permanentCheeks) {
  assert.equal(plate.kind, 'spaced', `${plate.name} is permanent spaced armor`);
  assert.equal(plate.era, null, `${plate.name} carries no explosive payload`);
}
assert.equal(spec.armor.turretPlates.some((plate) => /a7v_turret_cheek_era/.test(plate.name)), false,
  'obsolete turret-cheek ERA sectors are absent');

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
assert.equal(protection.turretCheekEraTiles, 0, 'turret front carries no ERA tiles');
assert.equal(protection.permanentCheekPanelLayers, 1,
  'turret cheek protection is one permanent applique layer over the structural arrowhead');
assert.equal(protection.permanentCheekPanels, 8,
  'four broad permanent panels protect each turret cheek');
assert.equal(protection.turretFrontConstruction, 'broad-permanent-layered-chevron-armor');
assert.equal(protection.turretFrontProtectionKind, 'spaced');
assert.equal(protection.glacisSeats.length, 44, 'four courses cover the upper glacis');
assert.equal(protection.cassetteLayers, 2, 'every cassette has a charge body and inset cover');
assert.equal(protection.totalTiles, 44, 'only the upper-glacis ERA tiles remain');
assert.equal(protection.coverTiles, 44, 'every glacis charge body receives one cover layer');
assert.equal(protection.totalAuthoredParts, 88, 'the glacis two-layer package is authored');
assert.equal(protection.camoProjection, 'vehicle-scale-box-uv',
  'ERA camouflage is projected once at vehicle scale');
assert.equal(protection.destructibleConstruction, 'glacis-only-authored-layered-cluster',
  'only the glacis layers participate in gameplay strip/reset behavior');
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
assert.equal(externalArmorMeshes.length, 1,
  'layered ERA adds only the upper-glacis hull draw bucket');
assert.deepEqual(new Set(externalArmorMeshes.map((mesh) => mesh.name)),
  new Set(['hullExternalArmor']),
  'no turret external-armor draw bucket remains');
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
  total + mesh.geometry.getAttribute('position').count, 0) <= 4608,
  'glacis protection stays within the crisp-box static vertex budget');

const externalParts = visual.root.userData.combatGeometryParts
  .filter((part) => part.bucket === 'hullExternalArmor'
    || part.bucket === 'turretExternalArmor');
assert.equal(externalParts.filter((part) => part.bucket === 'turretExternalArmor').length, 0,
  'permanent cheek panels are merged into the turret rather than a destructible ERA bucket');
assert.equal(externalParts.filter((part) => part.bucket === 'hullExternalArmor').length, 88,
  '44 glacis cassettes contribute one base and one cover each');

const hullEra = externalArmorMeshes.find((mesh) => mesh.name === 'hullExternalArmor');
const chevron = turretRig.userData.leopardChevronFrontReceipt;
assert.equal(chevron.surfacePanelCount, 8,
  'the A7V turret front retains eight broad armor panels');
assert.equal(chevron.surfacePanelLayerCount, 1,
  'broad panels form one permanent layer over the structural cheek');
for (const side of chevron.sides) {
  assert.equal(side.surfacePanels.length, 4, `${side.side} cheek has four broad panels`);
  for (const panel of side.surfacePanels) {
    assert.equal(panel.thicknessM, 0.028, `${side.side} cheek panel has A7V applique depth`);
  }
}
const hullBeforeStrip = hullEra.geometry.getAttribute('position').array.slice();
assert.equal(visual.stripEra('a7v_upper_glacis_era'), true,
  'upper-glacis sector is destructible');
assert.ok(hullEra.geometry.getAttribute('position').array.some((value) => value < -999),
  'a glacis ERA hit removes both authored layers from the rendered hull bucket');
assert.equal(visual.stripEra('a7v_turret_cheek_layer_R'), false,
  'permanent turret armor cannot be stripped as ERA');
assert.equal(visual.stripEra('a7v_turret_cheek_era_R'), false,
  'obsolete turret ERA sector no longer exists');
visual.resetEra();
assert.deepEqual(hullEra.geometry.getAttribute('position').array, hullBeforeStrip,
  'round reset restores both glacis ERA layers exactly');

const housing = gunRig.userData.leopard2A7VGunHousingReceipt;
assert.ok(housing, 'Leopard 2A7V publishes its evolved L/55A1 gun-housing receipt');
assert.equal(housing.profile, 'leopard-2a7v-l55a1-r2');
assert.equal(housing.architecture, 'faceted-leopard-2a5-derived-l55a1-cradle');
assert.equal(housing.lineage, 'leopard-2a5-mantlet-grammar-evolved');
assert.ok(housing.rearWidthM <= 0.62 && housing.rearHeightM <= 0.46,
  'faceted housing stays compact enough to seat inside the arrowhead cheeks');
assert.ok(housing.frontWidthM <= 0.44 && housing.frontHeightM <= 0.34,
  'housing still tapers tightly around the L/55A1 collar');
assert.ok(housing.insertionDepthM >= 0.30,
  'housing is visibly inserted into the turret cheek opening');
assert.ok(housing.rearTurretLocalZ < housing.cheekNoseCenterLocalZ,
  'housing rear edge terminates behind the cheek nose');
assert.equal(housing.layeredCrownAndChin, true,
  'the A7V mantlet has distinct armored crown and chin courses');
assert.equal(housing.thermalSleeve, true, 'the L/55A1 carries its thermal jacket');
assert.equal(housing.boreVisible, true, 'the muzzle publishes a visible bore');
assert.equal(housing.raisedByM, 0.06, 'the complete gun rig is raised by 60 mm');
assert.ok(Math.abs(gunRig.position.y - housing.pivotLocalY) < 1e-6,
  'the receipt and actual raised gun pivot remain synchronized');
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
assert.ok(bounds.max.y - bounds.min.y <= 0.48,
  `gun housing height remains compact (${bounds.max.y - bounds.min.y} m)`);
assert.ok(bounds.min.z <= -0.23 && bounds.max.z <= 1.58,
  `gun housing stays deeply seated with a readable forward collar (${bounds.min.z}..${bounds.max.z} m)`);

visual.dispose();
console.log('leopard2A7VGunEra.selftest: ok');
