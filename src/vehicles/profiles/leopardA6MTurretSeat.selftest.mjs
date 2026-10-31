import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';

const eraSectorNames = [
  'a6m_turret_cheek_era_R', 'a6m_turret_cheek_era_L',
  'a6m_upper_glacis_era',
];
const retiredEraSectorNames = [
  'a6m_turret_side_era_R', 'a6m_turret_side_era_L',
  'a6m_skirt_era_R', 'a6m_skirt_era_L',
];
const spec = getSpec('leo2a4_otco');
const eraSectors = [...spec.armor.hullPlates, ...spec.armor.turretPlates]
  .filter((plate) => eraSectorNames.includes(plate.name));
assert.deepEqual(new Set(eraSectors.map((plate) => plate.name)), new Set(eraSectorNames),
  'leo2a4_otco exposes only the requested frontal ERA sectors to combat');
assert.equal(spec.dims.widthM, 3.98,
  'leo2a4_otco restores the certified ISAF cage width after removing skirt ERA');
assert.equal([...spec.armor.hullPlates, ...spec.armor.turretPlates]
  .filter((plate) => retiredEraSectorNames.includes(plate.name)).length, 0,
  'leo2a4_otco no longer carries the inherited turret-side or skirt ERA sectors');
for (const plate of eraSectors) {
  assert.equal(plate.kind, 'era', `${plate.name} is consumable rather than permanent armor`);
  assert.ok(plate.era?.ceFlatMm >= 300, `${plate.name} retains the UA chemical protection`);
}

const visual = createTank('leo2a4_otco', null, {
  proceduralOnly: true,
  geometryReceipt: true,
});
visual.root.updateMatrixWorld(true);

const turretRig = visual.root.getObjectByName('rig_turret');
const hullRig = visual.root.getObjectByName('rig_hull');
assert.ok(turretRig && hullRig, 'leo2a4_otco keeps the canonical hull/turret rig');

const findMesh = (root, name) => {
  let found = null;
  root.traverse((node) => {
    if (!found && node.isMesh && node.name === name) found = node;
  });
  assert.ok(found, `leo2a4_otco has merged ${name} geometry`);
  return found;
};

const turret = findMesh(turretRig, 'turret');
findMesh(turretRig, 'turretDetail');
const equipment = findMesh(turretRig, 'turretEquipment');
findMesh(hullRig, 'hull');

// 264 (the 2A4-family rebuild, profiles/leopard2A4Family.ts): the OTCO is the 2A4 turret on the release hull with the
// old A6M build's field kit carried over (leopard2A4OtcoKit.ts). That build's own receipts (the fitted ERA seats, the
// conformal cheek cage, the RCWS, the slat mounts, the width indicators, the mantlet-roof bridges) and the ray datums on
// its arrowhead and bearing collar left with it; what the rebuild keeps is held here on the drawn tank.
const hullEra = findMesh(hullRig, 'hullExternalArmor');
const turretEra = findMesh(turretRig, 'turretExternalArmor');
const finish = visual.root.userData.eraFinishReceipt;
assert.equal(finish.layeredCassettes, 162,
  'all gameplay ERA sectors have matching layered visual cassettes');
assert.equal(finish.authoredParts, 324,
  'each cassette contributes one body and one inset top layer');
assert.deepEqual(finish.partsBySector, {
  a6m_turret_cheek_era_L: 112, a6m_turret_cheek_era_R: 112, a6m_upper_glacis_era: 100,
}, 'seven courses of eight cassettes on each cheek and fifty on the upper glacis');
assert.deepEqual(finish.owners, ['hull', 'turret']);
assert.equal(finish.maximumDrawBuckets, 2,
  'hull and turret ERA remain two shared static draw buckets');
// the cassettes and lids (3600 and 8064 vertices) share the buckets with the kit's other add-on armour: the belly plate
// under the hull, the spaced cassettes on the turret's walls
assert.equal(hullEra.geometry.getAttribute('position').count, 4248,
  'fifty glacis cassettes and lids are merged into hull external armor');
assert.equal(turretEra.geometry.getAttribute('position').count, 8424,
  'one hundred twelve cheek cassettes and lids are merged into turret external armor');

const remoteMachineGun = turretRig.getObjectByName('leo2A6MRemoteMachineGun');
assert.ok(remoteMachineGun && remoteMachineGun.parent === turretRig,
  'compact remote machine gun is directly owned by the turret rig');
assert.equal(remoteMachineGun.userData.remoteControlled, true,
  'roof weapon group exposes its remote-control contract');
let equipmentOwner = equipment;
while (equipmentOwner && equipmentOwner !== turretRig) equipmentOwner = equipmentOwner.parent;
assert.ok(equipmentOwner === turretRig,
  'merged cage and RCWS equipment remain under the turret rig');

const gunAxisY = turretRig.position.y + 0.33;
const forwardGunCorridorHits = new THREE.Raycaster(
  new THREE.Vector3(0, gunAxisY, 4.0 + turretRig.position.z),
  new THREE.Vector3(0, 0, -1), 0, 1.8,
).intersectObject(turret, false);
assert.equal(forwardGunCorridorHits.length, 0,
  'the OTCO leaves the forward L/55 gun corridor open');

const a6 = createTank('leo2a4', null, {
  proceduralOnly: true,
  geometryReceipt: true,
});
a6.root.updateMatrixWorld(true);
const a6TurretRig = a6.root.getObjectByName('rig_turret');
const a6GunRig = a6.root.getObjectByName('rig_gun');
const a6MuzzleRig = a6.root.getObjectByName('rig_muzzle');
assert.ok(a6TurretRig && a6GunRig && a6MuzzleRig,
  'leo2a4 keeps its canonical turret, gun, and muzzle rigs');

const a6Gun = findMesh(a6GunRig, 'gun');
const a6GunDark = findMesh(a6GunRig, 'gunDark');
const physicalGunFaceZ = Math.max(
  new THREE.Box3().setFromObject(a6Gun).max.z,
  new THREE.Box3().setFromObject(a6GunDark).max.z,
);
const muzzleWorld = new THREE.Vector3();
a6MuzzleRig.getWorldPosition(muzzleWorld);
assert.ok(Math.abs(muzzleWorld.z - physicalGunFaceZ) <= 0.012,
  `A6 muzzle rig sits on the physical barrel face (${muzzleWorld.z} vs ${physicalGunFaceZ})`);

console.log('Leopard 2A6M turret-seat selftest passed');
