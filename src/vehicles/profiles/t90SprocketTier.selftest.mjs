import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.js';
import { tankTier, tierNumeral } from '../tier.js';

const EPSILON = 1e-6;
const CONFIGS = Object.freeze({
  t90: Object.freeze({
    wheelZs: [-1.90, -1.12, -0.34, 0.44, 1.22, 2.00],
    sprocket: { z: -2.52, y: 0.93, r: 0.276 },
    idler: { z: 2.70, y: 0.68, r: 0.27 },
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
      `${id}: front idler remains unchanged`);
    assert.deepEqual(receipt.sprocket, expected.sprocket,
      `${id}: rear final-drive sprocket is seated at its authored station`);

    if (id === 't90') {
      near(receipt.sprocket.r / 0.23, 1.20,
        't90: rear final-drive sprocket is exactly twenty percent larger');
      assert.ok(receipt.sprocket.y < 0.98,
        't90: enlarged rear final-drive axle is lower than its former station');
    }

    const wrapTopY = expected.sprocket.y + expected.sprocket.r + receipt.trackTh / 2;
    assert.ok(receipt.loopPoints.some(([z, y]) =>
      Math.abs(z - expected.sprocket.z) <= EPSILON
        && Math.abs(y - wrapTopY) <= EPSILON),
    `${id}: track course is rebuilt onto the sprocket crown`);
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
