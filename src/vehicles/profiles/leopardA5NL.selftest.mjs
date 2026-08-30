import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { tankTier } from '../tier.ts';

const id = 'leo2a5_a5nl';
const spec = getSpec(id);
assert.equal(spec.name, 'Leopard 2A5/A5NL');
assert.equal(tankTier(id), 10, 'A5/A5NL is the Tier X A5 progression');
assert.equal(spec.dims.widthM, 3.98, 'A5NL width includes its backed skirt protection');

const era = [...spec.armor.hullPlates, ...spec.armor.turretPlates]
  .filter((plate) => plate.kind === 'era');
assert.deepEqual(era.map(({ name }) => name).sort(), ['a5nl_skirt_era_L', 'a5nl_skirt_era_R'],
  'A5NL combat ERA matches the two visible skirt fields');

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

  const station = receipt.auxiliaryOpenYokeRws;
  assert.equal(station.variant, 'a5nl-low');
  assert.equal(station.scale, 0.86);
  assert.equal(station.towerRiseM, 0.08);
  assert.equal(station.firingAxis, '+Z');
  assert.equal(station.equipmentOwned, true);

  const finish = tank.root.userData.eraFinishReceipt;
  assert.equal(finish.layeredCassettes, 60,
    'all gameplay ERA sectors have one matching layered visual cassette');
  assert.equal(finish.authoredParts, 120,
    'each skirt cassette has a body and inset cover');
  assert.deepEqual(finish.owners, ['hull']);
  assert.equal(finish.maximumDrawBuckets, 1,
    'static skirt protection remains one merged hull draw bucket');

  const closure = hullRig.userData.leopardFenderSkirtClosure;
  assert.ok(closure && closure.courses.length === 2,
    'A5NL retains the sealed A5 fender-to-skirt carriers under its ERA package');
} finally {
  tank.dispose();
}

console.log('leopardA5NL.selftest: Tier X A5 modernization, ERA, sensors, lights and compact RWS pass');
