import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';

const TARGETS = Object.freeze({
  m1a2_sepv3: Object.freeze({
    variant: 'sepv3-armored', mount: [-0.70, 0.8003898305084746, 0.2565],
    supportTop: 0.8103898305084746, replacesCommanderGun: true,
    loaderVariant: 'sepv3-low-loader',
    sizeStandard: 'm1a3-full-tower', scale: 1.28, minimumWidth: 0.84, minimumHeight: 0.82,
  }),
  m1a2_tusk: Object.freeze({
    variant: 'tusk-urban', mount: [-0.70, 0.8103898305084746, 0.2565],
    supportTop: 0.8203898305084746, replacesCommanderGun: true,
    loaderVariant: 'tusk-lags-loader',
    sizeStandard: 'm1a3-full-tower', scale: 1.28, minimumWidth: 0.84, minimumHeight: 0.82,
  }),
  leo2a6m: Object.freeze({
    variant: 'a6m-arctic', mount: [-0.72, 0.795, -1.52],
    sizeStandard: 'leopard-reduced-tower', scale: 1.12, towerRiseM: 0.14,
    minimumWidth: 0.88, minimumHeight: 0.72,
  }),
  leo2a7v: Object.freeze({
    variant: 'a7v-low', mount: [0.72, 0.67, -1.48],
    sizeStandard: 'leopard-reduced-tower', scale: 1.12, towerRiseM: 0.14,
    minimumWidth: 0.88, minimumHeight: 0.72,
  }),
  k2b: Object.freeze({
    variant: 'korean-twin', mount: [0.70, 0.70, -0.68],
    sizeStandard: 'm1a3-full-tower', scale: 1.28, minimumWidth: 0.84, minimumHeight: 0.82,
  }),
  kf51b: Object.freeze({
    variant: 'kf51b-panther', mount: [0.30, 0.55, -2.16],
    sizeStandard: 'leopard-reduced-tower', scale: 1.12, towerRiseM: 0.14,
    minimumWidth: 0.88, minimumHeight: 0.72, weaponRole: 'roof-primary',
  }),
  kf51: Object.freeze({
    variant: 'kf51-panther', mount: [0.42, 0.815, -1.72],
    sizeStandard: 'leopard-reduced-tower', scale: 1.12, towerRiseM: 0.14,
    minimumWidth: 0.88, minimumHeight: 0.72, weaponRole: 'roof-primary',
    workLightCount: 5,
  }),
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
    const stations = [];
    turretRig?.traverse((node) => {
      if (node.userData?.fittingRoot && node.userData.fitting === 'openYokeRws') stations.push(node);
    });
    assert.equal(stations.length, 1, `${id}: exposes exactly one open-yoke station`);
    const station = stations[0];
    assert.ok(turretRig && station, `${id}: exposes turret rig and open-yoke station`);
    assert.equal(station.parent, turretRig, `${id}: complete station is directly turret-owned`);
    assert.equal(station.userData.fitting, 'openYokeRws', `${id}: uses the new fitting family`);
    assert.equal(station.userData.designFamily, 'abramsx-open-yoke-v1',
      `${id}: records AbramsX design ancestry`);
    assert.equal(station.userData.stationVariant, expected.variant,
      `${id}: receives its host-specific treatment`);
    const expectedWeaponRole = expected.weaponRole
      || (expected.replacesCommanderGun ? 'commander-primary' : 'auxiliary');
    assert.equal(station.userData.weaponRole, expectedWeaponRole,
      `${id}: station has the intended roof-weapon role`);
    if (expected.replacesCommanderGun) {
      assert.equal(station.userData.headOnSide, 'left',
        `${id}: commander replacement occupies the left side in a head-on view`);
    }
    assert.equal(station.userData.remoteControlled, true, `${id}: station is remotely operated`);
    assert.equal(station.userData.caliberMm, 12.7, `${id}: station remains machine-gun caliber`);
    assert.equal(station.userData.hasVisibleFeedBelt, true, `${id}: ammunition path is modeled`);
    if (expected.workLightCount != null) {
      assert.equal(station.userData.hasWorkLights, true, `${id}: tower exposes its work-light package`);
      assert.equal(station.userData.lightCount, expected.workLightCount,
        `${id}: tower records every independently readable work light`);
    }
    assert.equal(station.userData.firingAxis, '+Z', `${id}: weapon follows vehicle-forward convention`);
    assert.equal(station.userData.sizeStandard, expected.sizeStandard,
      `${id}: uses the intended host tower size standard`);
    near(station.userData.scale, expected.scale, 1e-9, `${id}: matches the host weapon scale`);
    if (expected.towerRiseM != null) {
      near(station.userData.towerRise, expected.towerRiseM, 1e-9,
        `${id}: trims the auxiliary tower riser with the rest of the assembly`);
    }
    const stationBounds = station.userData.aabb;
    assert.ok(stationBounds.max[0] - stationBounds.min[0] >= expected.minimumWidth,
      `${id}: tower remains broad enough to read at battle distance`);
    assert.ok(stationBounds.max[1] - stationBounds.min[1] >= expected.minimumHeight,
      `${id}: tower retains the intended vertical presence`);

    expected.mount.forEach((value, index) => near(station.position.getComponent(index), value, 1e-6,
      `${id}: mount coordinate ${index}`));
    const roofTop = expected.replacesCommanderGun
      ? expected.supportTop
      : structuralRoofTopAt(turretRig, expected.mount[0], expected.mount[2]);
    assert.ok(Number.isFinite(roofTop), `${id}: resolves the station's supporting roof surface`);
    assert.ok(station.position.y <= roofTop + 0.002,
      `${id}: slew foot is not floating above its roof carrier (${station.position.y} <= ${roofTop})`);
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
      && materialSlots.has('detail') && materialSlots.has('glass')
      && materialSlots.has('hull'),
    `${id}: tank-painted armor, metal accents, and EO glass survive fitting merge`);

    const otherWeaponFittings = [];
    turretRig.traverse((node) => {
      if (node !== station && node.userData?.fittingRoot
        && ['pintleMG', 'openYokeRws'].includes(node.userData.fitting)) {
        otherWeaponFittings.push(node);
      }
    });
    if (!expected.replacesCommanderGun && expectedWeaponRole === 'auxiliary') {
      assert.ok(otherWeaponFittings.length >= 1,
        `${id}: auxiliary tower supplements the original roof weapon`);
    }
    const enclosedCommanderStations = [];
    turretRig.traverse((node) => {
      if (node.userData?.fittingRoot
        && node.userData.americanRwsFamily === 'm551a1-tts-derived-v1') {
        enclosedCommanderStations.push(node);
      }
    });
    if (expected.replacesCommanderGun) {
      assert.equal(enclosedCommanderStations.length, 0,
        `${id}: full-size tower replaces the compact commander station`);
      const retainedLoaderGuns = [];
      turretRig.traverse((node) => {
        if (node.userData?.fittingRoot
          && node.userData.americanWeaponStandard === 'sheridan-m2hb-v1') {
          retainedLoaderGuns.push(node);
        }
      });
      assert.equal(retainedLoaderGuns.length, 1,
        `${id}: one Browning remains on the opposite loader side`);
      assert.equal(retainedLoaderGuns[0].userData.installationVariant, expected.loaderVariant,
        `${id}: retained Browning uses the intended loader installation`);
      assert.ok(retainedLoaderGuns[0].position.x > 0,
        `${id}: retained Browning remains on the right in a head-on view`);
    }

    const receipt = turretRig.userData.openYokeRwsReceipt
      || turretRig.userData.auxiliaryOpenYokeRwsReceipt
      || turretRig.userData.leopard2A6MERAReceipt?.auxiliaryOpenYokeRws;
    assert.ok(receipt, `${id}: publishes an open-yoke station receipt`);
    assert.equal(receipt.designFamily, 'abramsx-open-yoke-v1',
      `${id}: receipt exposes the shared mechanical family`);
    assert.equal(receipt.variant, expected.variant, `${id}: receipt preserves variant identity`);
    assert.equal(receipt.sizeStandard, expected.sizeStandard,
      `${id}: receipt preserves the host tower-size invariant`);
    near(receipt.scale, expected.scale, 1e-9, `${id}: receipt records host scale`);
    if (expected.towerRiseM != null) {
      near(receipt.towerRiseM, expected.towerRiseM, 1e-9,
        `${id}: receipt records the reduced Leopard riser`);
    }
    assert.equal(receipt.equipmentOwned, true, `${id}: receipt excludes station from armor`);
    assert.equal(receipt.turretOwned, true, `${id}: receipt records traverse ownership`);
    assert.equal(receipt.weaponRole, expectedWeaponRole,
      `${id}: receipt records whether the station replaces or supplements the roof gun`);

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

assert.equal(new Set(Object.values(TARGETS).map(({ variant }) => variant)).size, 7,
  'all seven hosts receive visibly distinct open-yoke variants');

console.log('openYokeRwsFleet.selftest: seven host-sized AbramsX-style turret stations pass');
