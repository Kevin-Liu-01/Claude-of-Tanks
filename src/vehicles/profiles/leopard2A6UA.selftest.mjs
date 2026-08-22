import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.js';
import { getSpec } from '../specs.js';
import { tankTier } from '../tier.js';

const id = 'leo2a6_ua';
const spec = getSpec(id);
assert.equal(spec.name, 'Leopard 2A6 UA');
assert.equal(spec.nation, 'Ukraine');
assert.equal(spec.variantOf, 'leo2a6m');
assert.equal(tankTier(id), 10, 'Leopard 2A6 UA is a Tier X playable');
assert.equal(spec.role, 'mbt');

const sectorNames = [
  'ua_turret_cheek_era_R', 'ua_turret_cheek_era_L',
  'ua_turret_side_era_R', 'ua_turret_side_era_L',
  'ua_skirt_era_R', 'ua_skirt_era_L',
];
const eraSectors = [...spec.armor.hullPlates, ...spec.armor.turretPlates]
  .filter((plate) => sectorNames.includes(plate.name));
assert.deepEqual(eraSectors.map((plate) => plate.name).sort(), [...sectorNames].sort(),
  'six named ERA sectors back the complete visual package');
for (const plate of eraSectors) {
  assert.equal(plate.kind, 'era', `${plate.name} is consumable ERA`);
  assert.ok(plate.era?.ceFlatMm >= 300, `${plate.name} has shaped-charge protection`);
  assert.ok(plate.era?.keReduction > 0 && plate.era.keReduction <= 0.22,
    `${plate.name} keeps a bounded kinetic effect`);
}

const tank = createTank(id, null, {
  proceduralOnly: true,
  geometryReceipt: true,
  quality: 'high',
});
tank.root.updateMatrixWorld(true);
const hull = tank.root.getObjectByName('rig_hull');
const turret = tank.root.getObjectByName('rig_turret');
const gun = tank.root.getObjectByName('rig_gun');
const recoil = tank.root.getObjectByName('rig_recoil');
const muzzle = tank.root.getObjectByName('rig_muzzle');
assert.ok(hull && turret && gun && recoil && muzzle,
  'UA package preserves the canonical 2A6M articulation hierarchy');

const receipt = turret.userData.leopard2A6UAProtectionReceipt;
assert.ok(receipt, 'UA model publishes a protection/equipment receipt');
assert.equal(receipt.totalTiles, 144);
assert.equal(receipt.remoteStationCount, 2, 'two distinct roof RWS towers are authored');
assert.equal(receipt.equipmentIsNonArmor, true);
assert.equal(receipt.staticMergedProtection, true,
  'protection kit is static merged geometry with no per-frame work');

const eraMeshes = [];
tank.root.traverse((object) => {
  if (object.isInstancedMesh
      && object.geometry?.type === 'BoxGeometry'
      && Math.abs(object.geometry.parameters?.width - 0.28) < 1e-6
      && Math.abs(object.geometry.parameters?.height - 0.13) < 1e-6
      && Math.abs(object.geometry.parameters?.depth - 0.07) < 1e-6) eraMeshes.push(object);
});
assert.equal(eraMeshes.reduce((total, mesh) => total + mesh.count, 0), 144,
  'all six gameplay sectors have matching instanced visual tiles');
assert.equal(eraMeshes.length, 2, 'hull and turret ERA use two shared draw buckets');

const equipment = tank.root.getObjectByName('turretEquipment');
assert.equal(equipment?.userData.combatHitboxRole, 'equipment',
  'RWS receiver bodies cannot inflate the armor hitbox');

for (const owner of ['hull', 'turret', 'gun']) {
  for (const layer of ['net', 'light', 'dark']) {
    const mesh = tank.root.getObjectByName(`${id}_ghillie_${owner}_${layer}`);
    assert.ok(mesh?.isMesh, `dense ${owner} ghillie ${layer} layer exists`);
    assert.ok(mesh.geometry.getAttribute('position').count > 120,
      `${owner} ghillie ${layer} is detailed fitted geometry`);
  }
}

const gunNet = tank.root.getObjectByName(`${id}_ghillie_gun_net`);
const gunBounds = new THREE.Box3().setFromObject(gunNet);
const muzzleWorld = muzzle.getWorldPosition(new THREE.Vector3());
assert.ok(gunBounds.max.z < muzzleWorld.z - 0.08,
  'barrel ghillie stops behind the open bore and muzzle/FX anchor');

const markings = [];
tank.root.traverse((object) => {
  if (object.userData.vehicleMarking) markings.push(object);
});
assert.ok(markings.some((object) => object.userData.markingCode?.includes(':ua-trident:')),
  'Ukrainian trident is present on a final supported surface');
assert.ok(markings.every((object) => object.userData.surfaceSupported),
  'every UA marking is physically seated');

tank.dispose();
console.log('leopard2A6UA.selftest: Tier X UA armor, cages, RWS and ghillie are playable');
