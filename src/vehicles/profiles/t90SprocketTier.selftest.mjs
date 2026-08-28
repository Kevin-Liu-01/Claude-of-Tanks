import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.js';
import { tankTier, tierNumeral } from '../tier.ts';

const EPSILON = 1e-6;
const CONFIGS = Object.freeze({
  t90: Object.freeze({
    wheelZs: [-1.90, -1.12, -0.34, 0.44, 1.22, 2.00],
    sprocket: { z: -2.52, y: 0.90, r: 0.299 },
    idler: { z: 2.70, y: 0.71, r: 0.27 },
    rearContactZ: -2.16,
  }),
  t90ms: Object.freeze({
    wheelZs: [-1.78, -0.992, -0.204, 0.584, 1.372, 2.16],
    sprocket: { z: -2.58, y: 0.95, r: 0.20 },
    idler: { z: 2.76, y: 0.69, r: 0.25 },
    rearContactZ: -2.0325,
  }),
});

const near = (actual, expected, message, epsilon = EPSILON) => {
  assert.ok(Math.abs(actual - expected) <= epsilon,
    `${message}: expected ${expected}, received ${actual}`);
};

for (const [id, expected] of Object.entries(CONFIGS)) {
  const tank = createTank(id, null, {
    proceduralOnly: true,
    quality: 'high',
    camoSeed: 4242,
    geometryReceipt: true,
  });

  try {
    const hull = tank.root.getObjectByName('rig_hull');
    const receipt = hull?.userData.runningGearReceipts?.[0];
    assert.ok(receipt, `${id}: exposes its canonical running-gear receipt`);
    assert.deepEqual(receipt.wheelZs, expected.wheelZs,
      `${id}: road-wheel stations remain unchanged`);
    assert.deepEqual(receipt.idler, expected.idler,
      `${id}: front idler is seated at its authored station`);
    assert.deepEqual(receipt.sprocket, expected.sprocket,
      `${id}: rear final-drive sprocket is seated at its authored station`);

    if (id === 't90') {
      near(receipt.sprocket.r / 0.23, 1.30,
        't90: rear final-drive sprocket is exactly thirty percent larger');
      assert.ok(receipt.sprocket.y < 0.98,
        't90: enlarged rear final-drive axle is lower than its former station');
      assert.ok(receipt.idler.y > 0.68,
        't90: front idler axle is raised above its former station');
      const first = receipt.loopPoints[0];
      const second = receipt.loopPoints[1];
      const last = receipt.loopPoints.at(-1);
      const inZ = first[0] - last[0], inY = first[1] - last[1];
      const outZ = second[0] - first[0], outY = second[1] - first[1];
      const cosTurn = (inZ * outZ + inY * outY)
        / (Math.hypot(inZ, inY) * Math.hypot(outZ, outY));
      const turnDeg = Math.acos(Math.max(-1, Math.min(1, cosTurn))) * 180 / Math.PI;
      assert.ok(turnDeg < 8,
        `t90: rear wrap closes smoothly into its return run (${turnDeg.toFixed(2)} degrees)`);
      const rearWrapSamples = receipt.loopPoints.filter(([z, y]) =>
        Math.abs(Math.hypot(z - expected.sprocket.z, y - expected.sprocket.y)
          - (expected.sprocket.r + receipt.trackTh / 2)) < 1e-5);
      assert.ok(rearWrapSamples.length >= 18,
        `t90: rounded rear wrap keeps at least 18 arc samples (${rearWrapSamples.length})`);
    }

    const wrapTopY = expected.sprocket.y + expected.sprocket.r + receipt.trackTh / 2;
    const wrapCrownY = Math.max(...receipt.loopPoints
      .filter(([z]) => Math.abs(z - expected.sprocket.z) <= expected.sprocket.r)
      .map(([, y]) => y));
    near(wrapCrownY, wrapTopY,
      `${id}: track course is rebuilt onto the sprocket crown`, 3e-3);
    near(Math.min(...receipt.loopPoints.map(([z]) => z)),
      expected.sprocket.z - expected.sprocket.r - receipt.trackTh / 2,
      `${id}: track wraps the aft face of the moved sprocket`, 5e-3);
    assert.ok(receipt.loopPoints.some(([z, y]) =>
      Math.abs(z - expected.rearContactZ) <= EPSILON
        && Math.abs(y - receipt.botY) <= EPSILON),
    `${id}: loaded track run remains seated beneath the rear road wheel`);
  } finally {
    tank.dispose();
  }
}

for (const id of ['t90', 't90a_burlak', 't90ms']) {
  assert.equal(tankTier(id), 10, `${id}: gameplay tier is X`);
  assert.equal(tierNumeral(id), 'X', `${id}: UI tier is X`);
}

console.log('t90SprocketTier.selftest: rear sprockets, track courses and Tier X metadata pass');
