import assert from 'node:assert/strict';
import { trackWrapClearanceM } from '../tankFactoryCore.ts';
import { createTank } from '../tankFactory.ts';
import { tankTier } from '../tier.ts';
import { tierNumeral } from '../../techTree/tiers.ts';

const EPSILON = 1e-6;
const CONFIGS = Object.freeze({
  t90_1992: Object.freeze({
    // owner 2026-09-23 (round 46): six 750 mm wheels on the 0.80 m T-72/T-90 pitch about the same centre (2R/pitch 0.94).
    wheelZs: [-1.95, -1.15, -0.35, 0.45, 1.25, 2.05],
    sprocket: { z: -2.52, y: 0.90, r: 0.299 },
    idler: { z: 2.70, y: 0.71, r: 0.27 },
    rearContactZ: -1.95, // 2026-09-14: the flat run ends under the rear axle (tangent wrap)
  }),
  // 2026-10-30 (lane t90-family-266): the T-90MS rides the T-90 family chassis, so it runs the obr. 1992 course.
  t90ms_2011: Object.freeze({
    wheelZs: [-1.95, -1.15, -0.35, 0.45, 1.25, 2.05],
    sprocket: { z: -2.52, y: 0.90, r: 0.299 },
    idler: { z: 2.70, y: 0.71, r: 0.27 },
    rearContactZ: -1.95,
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

    if (id === 't90_1992') {
      near(receipt.sprocket.r / 0.23, 1.30,
        't90_1992: rear final-drive sprocket is exactly thirty percent larger');
      assert.ok(receipt.sprocket.y < 0.98,
        't90_1992: enlarged rear final-drive axle is lower than its former station');
      assert.ok(receipt.idler.y > 0.68,
        't90_1992: front idler axle is raised above its former station');
      const first = receipt.loopPoints[0];
      const second = receipt.loopPoints[1];
      const last = receipt.loopPoints.at(-1);
      const inZ = first[0] - last[0], inY = first[1] - last[1];
      const outZ = second[0] - first[0], outY = second[1] - first[1];
      const cosTurn = (inZ * outZ + inY * outY)
        / (Math.hypot(inZ, inY) * Math.hypot(outZ, outY));
      const turnDeg = Math.acos(Math.max(-1, Math.min(1, cosTurn))) * 180 / Math.PI;
      assert.ok(turnDeg < 8,
        `t90_1992: rear wrap closes smoothly into its return run (${turnDeg.toFixed(2)} degrees)`);
      const rearWrapSamples = receipt.loopPoints.filter(([z, y]) =>
        Math.abs(Math.hypot(z - expected.sprocket.z, y - expected.sprocket.y)
          - (expected.sprocket.r + trackWrapClearanceM(receipt.trackTh))) < 1e-5); // band hugs the rim: th/2 + 2 mm (2026-09-17)
      assert.ok(rearWrapSamples.length >= 18,
        `t90_1992: rounded rear wrap keeps at least 18 arc samples (${rearWrapSamples.length})`);
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
    `${id}: loaded track run ends under the rear road-wheel axle and wraps it`);
  } finally {
    tank.dispose();
  }
}

// The UI shows each vehicle's column in its national tree (owner 2026-10-25; re-tiered by capability for 257).
// Matchmaking reads the shown tier since 258.
for (const [id, gameplay, shown] of [['t90_1992', 7, 'VII'], ['t90a_burlak_proto', 9, 'IX'], ['t90ms_2011', 9, 'IX']]) {
  assert.equal(tankTier(id), gameplay, `${id}: gameplay tier is ${gameplay}`);
  assert.equal(tierNumeral(id), shown, `${id}: UI tier is its tree column, ${shown}`);
}

console.log('t90SprocketTier.selftest: rear sprockets, track courses and Tier X metadata pass');
