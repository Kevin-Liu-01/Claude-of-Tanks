import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { tankTier } from '../tier.ts';

const id = 'leo2a4m';
const spec = getSpec(id);
assert.equal(spec.name, 'Leopard 2A4M'); // owner roster pass 2026-09-15 (the A5NL hull carries the 2A4M name)
assert.equal(tankTier(id), 8, 'the Leopard 2A4M matches at VIII with the 2A4 it upgrades (258: the shown tier)');
assert.equal(spec.dims.widthM, 3.98, 'A5NL width includes its backed skirt protection');

const era = [...spec.armor.hullPlates, ...spec.armor.turretPlates]
  .filter((plate) => plate.kind === 'era');
assert.deepEqual([...new Set(era.map(({ name }) => name))].sort(),
  ['a5nl_skirt_era_L', 'a5nl_skirt_era_R'],
  'A5NL combat ERA matches the two depletable visible skirt fields');
assert.equal(era.length, 60,
  'A5NL combat ERA exposes one exact collision face for every visible skirt cassette');

const tank = createTank(id, null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});
tank.root.updateMatrixWorld(true);

try {
  const visibleBounds = new THREE.Box3().setFromObject(tank.root);
  assert.ok(Math.abs(visibleBounds.min.x + 1.99) < 1e-5
    && Math.abs(visibleBounds.max.x - 1.99) < 1e-5,
  'backed ERA cassettes visibly own the declared 3.98 m overall width');
  const hullRig = tank.root.getObjectByName('rig_hull');
  const turretRig = tank.root.getObjectByName('rig_turret');
  const receipt = turretRig?.userData.leopard2A5A5NLReceipt;
  assert.ok(hullRig && turretRig && receipt, 'A5NL publishes its modernization receipt');
  assert.equal(receipt.architecture, 'a5-field-modernization');
  assert.equal(receipt.skirtEraTilesPerSide, 30);
  assert.equal(receipt.skirtEraSeats.length, 60,
    'three rows of ten ERA cassettes are physically seated on each skirt');
  assert.deepEqual(new Set(receipt.skirtEraSeats.map(({ side }) => side)), new Set([-1, 1]),
    'skirt protection is mirrored');
  assert.equal(receipt.forwardLampCount, 6);
  assert.equal(receipt.awarenessPodsPerSide, 1);
  assert.equal(receipt.smokeLaunchersPerSide, 4);
  assert.equal(receipt.panoramicSight, true);
  assert.equal(receipt.equipmentOwned, true);

  // 2026-10-08 (the owner's field standard in main 6763d7cc0 and his 2A5M precedent; the coordinator's ruling on the
  // tank-accessories lane's audit): the A5NL's working roof weapon is its loader's MAG, activated on its pintle, and the
  // open-yoke tower that stood 0.98 m from it is gone (264, the 2A4-family rebuild: the station is the 2A4 turret's
  // own loader gun, leo2a4mRemoteMag)
  assert.equal(receipt.roofWeapon, 'leo2a4mRemoteMag');
  assert.equal(receipt.auxiliaryOpenYokeRws, undefined, 'no open-yoke tower beside the loader\'s station');
  const loaderStation = tank.root.getObjectByName('leo2a4mRemoteMag');
  assert.ok(loaderStation?.userData.remoteControlled && loaderStation.userData.firingAxis === '+Z'
    && loaderStation.userData.caliberMm === 7.62, 'the loader\'s MAG is the working remote station');

  const finish = tank.root.userData.eraFinishReceipt;
  assert.equal(finish.layeredCassettes, 60,
    'all gameplay ERA sectors have one matching layered visual cassette');
  assert.equal(finish.authoredParts, 120,
    'each skirt cassette has a body and inset cover');
  assert.deepEqual(finish.owners, ['hull']);
  assert.equal(finish.maximumDrawBuckets, 1,
    'static skirt protection remains one merged hull draw bucket');

  // 264 (the 2A4-family rebuild): the release hull publishes no leopardFenderSkirtClosure; the package's own backing
  // carrier (leopard2A4A5nlKit.ts) is the seal: a side sightline between two cassette rows, at every station, lands on
  // the hull's external armour no further in than the carrier's outer face
  const hullArmor = hullRig.getObjectByName('hullExternalArmor');
  assert.ok(hullArmor?.isMesh, 'A5NL merges its skirt package into the hull external-armor bucket');
  const rowYs = [...new Set(receipt.skirtEraSeats.map(({ y }) => y))].sort((a, b) => a - b);
  for (const seat of receipt.skirtEraSeats.filter(({ row }) => row < rowYs.length - 1)) {
    const y = (rowYs[seat.row] + rowYs[seat.row + 1]) / 2;
    const origin = hullRig.localToWorld(new THREE.Vector3(seat.side * 2.4, y, seat.z));
    const direction = new THREE.Vector3(-seat.side, 0, 0).transformDirection(hullRig.matrixWorld);
    const hit = new THREE.Raycaster(origin, direction, 0, 1.2).intersectObject(hullArmor, false)[0];
    assert.ok(hit && Math.abs(hullRig.worldToLocal(hit.point.clone()).x) >= 1.88 - 1e-4,
      `A5NL's skirt carrier seals the side between its cassette rows (side ${seat.side}, z ${seat.z})`);
  }
} finally {
  tank.dispose();
}

console.log('leopardA5NL.selftest: Tier X A5 modernization, ERA, sensors, lights and the loader\'s station pass');
