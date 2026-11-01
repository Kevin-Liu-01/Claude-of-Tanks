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

// 2026-10-30 (lane t90-family-266, Main's identity call): the production obr. 1992 carries its cast turret with no
// autoloader bustle; the Burlak module is the Burlak prototype's alone.
{
  const tank = createTank('t90_1992', null, { proceduralOnly: true, quality: 'high', camoSeed: 4242, geometryReceipt: true });
  try {
    assert.equal(tank.root.getObjectByName('rig_turret')?.userData.t90BurlakBustleReceipt, undefined,
      't90_1992: the production cast turret carries no Burlak bustle');
  } finally {
    tank.dispose();
  }
}

const burlak = inspect('t90a_burlak_proto');
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
