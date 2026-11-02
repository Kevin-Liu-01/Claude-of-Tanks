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

// 267 (S5, Main's ruling 2026-11-01): the prototype's turret is built to the Burlak X source; its welded bustle is the
// source's box (t90.ts BURLAK_BUSTLE), from the neck behind the shell to the rear plate, its roof hatches on top.
const burlak = inspect('t90a_burlak_proto');
assert.equal(burlak.scale, 1,
  'Burlak rear magazine keeps its full authored scale');
near(burlak.rootZ, -1.4147,
  'Burlak bustle starts at the source neck station');
near(burlak.rearZ, -3.2988,
  'Burlak bustle runs to the source rear plate');
near(burlak.frontHalfWidth, 0.956,
  'Burlak bustle keeps the source half-width');
near(burlak.frontHeight, 0.7191,
  'Burlak bustle roof stands at the source height');
near(burlak.floorY, 0.1396,
  'Burlak bustle floor stands at the source height over the ring');
near(burlak.maxRoofY, 0.7191 + 0.0229,
  'Burlak bustle roof equipment follows the source envelope');

console.log('t90BurlakRearScale.selftest: the Burlak rear magazine is the source bustle, full size, on the fixed turret neck');
