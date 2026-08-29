import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';

const TARGETS = Object.freeze({
  m1a2_sepv3: Object.freeze({ variant: 'sepv3-armored', mount: [0.20, 0.70, -1.58] }),
  m1a2_tusk: Object.freeze({ variant: 'tusk-urban', mount: [0.18, 0.69, -1.58] }),
  leo2a6m: Object.freeze({ variant: 'a6m-arctic', mount: [-0.72, 0.795, -1.52] }),
  leo2a7v: Object.freeze({ variant: 'a7v-low', mount: [0.72, 0.67, -1.48] }),
  k2b: Object.freeze({ variant: 'korean-twin', mount: [0.70, 0.70, -1.43] }),
});

const near = (actual, expected, tolerance, message) => {
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `${message}: expected ${expected}, received ${actual}`);
};

function structuralRoofTopAt(turretRig, x, z) {
  const structuralMeshes = [];
  turretRig.traverse((node) => {
    if (node.isMesh && node.name === 'turret') structuralMeshes.push(node);
  });
  const rayOrigin = turretRig.localToWorld(new THREE.Vector3(x, 5, z));
  const rayDirection = new THREE.Vector3(0, -1, 0).transformDirection(turretRig.matrixWorld);
  const hits = new THREE.Raycaster(rayOrigin, rayDirection, 0, 10)
    .intersectObjects(structuralMeshes, false)
    .map((hit) => turretRig.worldToLocal(hit.point.clone()).y);
  assert.ok(hits.length, `turret roof exists below auxiliary station at (${x}, ${z})`);
  return Math.max(...hits);
}

for (const [id, expected] of Object.entries(TARGETS)) {
  const tank = createTank(id, null, {
    proceduralOnly: true,
    quality: 'high',
    camoSeed: 4242,
    geometryReceipt: true,
  });
  tank.root.updateMatrixWorld(true);

  try {
    const turretRig = tank.root.getObjectByName('rig_turret');
    const station = tank.root.getObjectByName(`${id}AuxOpenYokeRws`);
    assert.ok(turretRig && station, `${id}: exposes turret rig and auxiliary open-yoke station`);
    assert.equal(station.parent, turretRig, `${id}: complete station is directly turret-owned`);
    assert.equal(station.userData.fitting, 'openYokeRws', `${id}: uses the new fitting family`);
    assert.equal(station.userData.designFamily, 'abramsx-open-yoke-v1',
      `${id}: records AbramsX design ancestry`);
    assert.equal(station.userData.stationVariant, expected.variant,
      `${id}: receives its host-specific treatment`);
    assert.equal(station.userData.weaponRole, 'auxiliary',
      `${id}: new station supplements the existing roof gun`);
    assert.equal(station.userData.remoteControlled, true, `${id}: station is remotely operated`);
    assert.equal(station.userData.caliberMm, 12.7, `${id}: station remains machine-gun caliber`);
    assert.equal(station.userData.hasVisibleFeedBelt, true, `${id}: ammunition path is modeled`);
    assert.equal(station.userData.firingAxis, '+Z', `${id}: weapon follows vehicle-forward convention`);

    expected.mount.forEach((value, index) => near(station.position.getComponent(index), value, 1e-6,
      `${id}: mount coordinate ${index}`));
    const roofTop = structuralRoofTopAt(turretRig, expected.mount[0], expected.mount[2]);
    assert.ok(station.position.y <= roofTop + 0.002,
      `${id}: slew foot is not floating above the roof (${station.position.y} <= ${roofTop})`);
    assert.ok(roofTop - station.position.y <= 0.12,
      `${id}: roof does not swallow the open fork (${roofTop - station.position.y} m burial)`);

    const materialSlots = new Set();
    let visibleMeshes = 0;
    station.traverse((node) => {
      if (!node.isMesh) return;
      visibleMeshes++;
      materialSlots.add(node.userData.fittingSlot);
      assert.equal(node.userData.combatHitboxRole, 'equipment',
        `${id}: every station mesh remains non-armor equipment`);
    });
    assert.ok(visibleMeshes >= 3 && materialSlots.has('dark')
      && materialSlots.has('detail') && materialSlots.has('glass'),
    `${id}: open yoke, metal accents, and EO glass survive fitting merge`);

    const otherWeaponFittings = [];
    turretRig.traverse((node) => {
      if (node !== station && node.userData?.fittingRoot
        && ['pintleMG', 'openYokeRws'].includes(node.userData.fitting)) {
        otherWeaponFittings.push(node);
      }
    });
    assert.ok(otherWeaponFittings.length >= 1,
      `${id}: original roof weapon remains alongside the auxiliary station`);

    const receipt = turretRig.userData.auxiliaryOpenYokeRwsReceipt
      || turretRig.userData.leopard2A6MERAReceipt?.auxiliaryOpenYokeRws;
    assert.ok(receipt, `${id}: publishes an auxiliary-station receipt`);
    assert.equal(receipt.designFamily, 'abramsx-open-yoke-v1',
      `${id}: receipt exposes the shared mechanical family`);
    assert.equal(receipt.variant, expected.variant, `${id}: receipt preserves variant identity`);
    assert.equal(receipt.equipmentOwned, true, `${id}: receipt excludes station from armor`);
    assert.equal(receipt.turretOwned, true, `${id}: receipt records traverse ownership`);

    const localPosition = station.position.clone();
    const before = station.getWorldPosition(new THREE.Vector3());
    turretRig.rotation.y = Math.PI / 3;
    tank.root.updateMatrixWorld(true);
    const after = station.getWorldPosition(new THREE.Vector3());
    assert.ok(before.distanceTo(after) > 0.25, `${id}: station moves with turret traverse`);
    assert.ok(station.position.distanceTo(localPosition) < 1e-9,
      `${id}: traverse does not mutate the station roof seat`);
    const stationForward = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(station.getWorldQuaternion(new THREE.Quaternion()));
    const turretForward = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(turretRig.getWorldQuaternion(new THREE.Quaternion()));
    assert.ok(stationForward.dot(turretForward) > 0.998,
      `${id}: auxiliary barrel keeps a near-forward rest orientation`);
  } finally {
    tank.dispose();
  }
}

assert.equal(new Set(Object.values(TARGETS).map(({ variant }) => variant)).size, 5,
  'all five hosts receive visibly distinct open-yoke variants');

console.log('openYokeRwsFleet.selftest: five extra AbramsX-style turret stations pass');
