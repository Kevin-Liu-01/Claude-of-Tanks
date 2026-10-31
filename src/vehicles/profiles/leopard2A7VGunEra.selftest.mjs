import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';

const eraSectorNames = ['a7v_upper_glacis_era'];
const permanentCheekNames = [
  'a7v_turret_cheek_layer_R', 'a7v_turret_cheek_layer_L',
];
const spec = getSpec('leo2_improved');
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

const visual = createTank('leo2_improved', null, {
  proceduralOnly: true,
  geometryReceipt: true,
});
visual.root.updateMatrixWorld(true);

const turretRig = visual.root.getObjectByName('rig_turret');
const gunRig = visual.root.getObjectByName('rig_gun');
assert.ok(turretRig && gunRig, 'Leopard 2A7V keeps canonical turret and gun rigs');

// 264 (the 2A4-family rebuild, profiles/leopard2A4Family.ts): the Improved is the 2A4 turret with the 2A6-look wedge on
// the release hull, its 2A7V-pattern kit carried over (leopard2ImprovedKit.ts). The old build's protection, chevron-front
// and gun-housing receipts (its glacis seats, its four broad cheek panels a side, its faceted L/55A1 housing) left with
// it; the glacis package is read off the fleet's ERA finish receipt: forty-two cassettes in the field on the release
// hull's glacis, each a charge body and a cover, and the cheek layers are permanent add-on armour, never ERA.
const finish = visual.root.userData.eraFinishReceipt;
assert.ok(finish, 'Leopard 2A7V publishes its layered ERA finish');
assert.equal(finish.layeredCassettes, 42, 'only the upper-glacis ERA tiles remain');
assert.deepEqual(finish.partsBySector, { a7v_upper_glacis_era: 84 },
  'every glacis charge body receives one cover layer');
assert.equal(finish.camoProjection, 'vehicle-scale-box-uv',
  'ERA camouflage is projected once at vehicle scale');
assert.deepEqual(new Set(finish.sectors), new Set(eraSectorNames),
  'receipt sectors match destructible armor sectors');
assert.equal(finish.staticMergedProtection, true,
  'new protection adds no per-frame geometry work');

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
// 264: the cheek layers and the side-armour bands are permanent add-on armour in the turret's own external bucket
// (stripEra refuses them below); the glacis ERA shares the hull's with the deep skirts, the side cassette band and the
// lower-front module
assert.equal(externalArmorMeshes.length, 2,
  'the glacis ERA and the add-on armour take one external draw bucket per owner');
assert.deepEqual(new Set(externalArmorMeshes.map((mesh) => mesh.name)),
  new Set(['hullExternalArmor', 'turretExternalArmor']),
  'the hull and the turret each merge their external armour into one bucket');
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
assert.deepEqual(externalArmorMeshes.map((mesh) => [mesh.name, mesh.geometry.getAttribute('position').count]).sort(),
  [['hullExternalArmor', 10596], ['turretExternalArmor', 720]],
  'the glacis package and the add-on armour stay crisp static merged buckets');

const externalParts = visual.root.userData.combatGeometryParts
  .filter((part) => part.bucket === 'hullExternalArmor'
    || part.bucket === 'turretExternalArmor');
assert.equal(externalParts.filter((part) => part.bucket === 'turretExternalArmor').length, 18,
  'the cheek layers and side bands are the turret\'s permanent add-on armour');
assert.equal(externalParts.filter((part) => part.bucket === 'hullExternalArmor').length, 84 + 49,
  '42 glacis cassettes contribute one base and one cover each, beside the hull\'s add-on armour');

const hullEra = externalArmorMeshes.find((mesh) => mesh.name === 'hullExternalArmor');
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

let gunMount = null;
gunRig.traverse((object) => {
  if (!gunMount && object.isMesh && object.name === 'gunMount') gunMount = object;
});
assert.ok(gunMount, 'Leopard 2A7V retains a merged gunMount mesh');
gunMount.geometry.computeBoundingBox();
const bounds = gunMount.geometry.boundingBox;
assert.ok(bounds.max.x - bounds.min.x <= 0.64,
  `gun housing width remains compact (${bounds.max.x - bounds.min.x} m)`);
// (264: the faceted L/55A1 housing's 0.48 m height went with it; the 2A6-look mantlet fills the slot between the wedges)
assert.ok(bounds.min.z <= -0.23 && bounds.max.z <= 1.58,
  `gun housing stays deeply seated with a readable forward collar (${bounds.min.z}..${bounds.max.z} m)`);

visual.dispose();
console.log('leopard2A7VGunEra.selftest: ok');
