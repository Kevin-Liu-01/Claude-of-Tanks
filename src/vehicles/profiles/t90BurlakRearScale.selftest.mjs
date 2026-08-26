import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.js';

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
assert.equal(burlak.scale, 0.90,
  'Burlak rear magazine is scaled to ninety percent');
near(burlak.rootZ, -1.08,
  'Burlak bustle keeps its shell attachment plane');
near(burlak.rearZ, -3.078,
  'Burlak bustle length is reduced ten percent about its attachment plane');
near(burlak.frontHalfWidth, 0.99,
  'Burlak bustle width is reduced ten percent');
near(burlak.frontHeight, 0.576,
  'Burlak bustle height is reduced ten percent');
near(burlak.maxRoofY, 0.621,
  'Burlak bustle roof equipment follows the reduced envelope');

console.log('t90BurlakRearScale.selftest: Burlak rear magazine shrinks around its fixed turret neck');
