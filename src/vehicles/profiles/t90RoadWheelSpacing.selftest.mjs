import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.js';

const EPSILON = 1e-6;
const CASES = Object.freeze({
  t90: Object.freeze({ radius: 0.34, centerY: 0.33, footY: -0.01, minGap: 0.10 }),
  t90ms: Object.freeze({ radius: 0.34, centerY: 0.35, footY: 0.01, minGap: 0.108 }),
  t90m: Object.freeze({ radius: 0.31, centerY: 0.395, footY: 0.085, minGap: 0.04 }),
});

for (const [id, expected] of Object.entries(CASES)) {
  const tank = createTank(id, null, {
    proceduralOnly: true,
    quality: 'high',
    camoSeed: 4242,
    geometryReceipt: true,
  });

  try {
    const hull = tank.root.getObjectByName('rig_hull');
    const receipt = hull?.userData.runningGearReceipts?.at(-1);
    assert.ok(receipt, `${id}: exposes its installed running-gear receipt`);
    assert.ok(Math.abs(receipt.wheelR - expected.radius) <= EPSILON,
      `${id}: road-wheel radius is ${expected.radius} m`);
    assert.ok(Math.abs(receipt.wheelY - expected.centerY) <= EPSILON,
      `${id}: road-wheel center preserves its loaded foot`);
    assert.ok(Math.abs(receipt.wheelY - receipt.wheelR - expected.footY) <= EPSILON,
      `${id}: loaded tire foot remains at ${expected.footY} m`);

    const stations = [...receipt.wheelZs].sort((a, b) => a - b);
    for (let index = 1; index < stations.length; index++) {
      const centerDistance = stations[index] - stations[index - 1];
      const gap = centerDistance - receipt.wheelR * 2;
      assert.ok(gap >= expected.minGap - EPSILON,
        `${id}: road-wheel stations ${index - 1}/${index} retain ${expected.minGap} m clearance`);
    }
  } finally {
    tank.dispose();
  }
}

console.log('t90RoadWheelSpacing.selftest: RU-417, Tagil and Proryv road wheels are distinct and loaded');
