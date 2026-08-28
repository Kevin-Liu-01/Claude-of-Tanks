import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';

const EPSILON = 1e-9;
const near = (actual, expected, message) => {
  assert.ok(Math.abs(actual - expected) <= EPSILON,
    `${message}: expected ${expected}, received ${actual}`);
};

const inspect = (id) => {
  const tank = createTank(id, null, {
    proceduralOnly: true,
    quality: 'high',
    camoSeed: 4242,
    geometryReceipt: true,
  });
  try {
    const turret = tank.root.getObjectByName('rig_turret');
    const receipt = turret?.userData.t90BurlakBustleReceipt;
    assert.ok(receipt, `${id}: exposes its authored bustle receipt`);
    return receipt;
  } finally {
    tank.dispose();
  }
};

const production = inspect('t90');
assert.equal(production.scale, 1,
  'T-90 production bustle retains its established envelope');
near(production.rearZ, -3.30,
  'T-90 production bustle rear station remains unchanged');

const burlak = inspect('t90a_burlak');
assert.equal(burlak.scale, 1,
  'Burlak rear magazine restores its full authored scale');
near(burlak.rootZ, -1.08,
  'Burlak bustle keeps its shell attachment plane');
near(burlak.rearZ, -3.30,
  'Burlak bustle restores its full authored length');
near(burlak.frontHalfWidth, 1.10,
  'Burlak bustle restores its full authored width');
near(burlak.frontHeight, 0.64,
  'Burlak bustle restores its full authored height');
near(burlak.maxRoofY, 0.69,
  'Burlak bustle roof equipment follows the restored envelope');

console.log('t90BurlakRearScale.selftest: Burlak rear magazine restores its full envelope around the fixed turret neck');
