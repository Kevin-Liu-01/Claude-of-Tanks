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

    if (id === 't90') {
      const attachment = hull.userData.t90AttachmentReceipt;
      assert.ok(attachment, 't90: exposes skirt and terminal-guard attachment receipt');
      assert.ok(attachment.skirt.z0 <= receipt.sprocket.z - receipt.sprocket.r,
        't90: skirt reaches behind the rear final-drive sprocket');
      assert.ok(attachment.skirt.z1 >= receipt.idler.z + receipt.idler.r,
        't90: skirt reaches beyond the forward idler');

      const mg = tank.root.getObjectByName('fitting_pintleMG');
      assert.ok(mg, 't90: exposes the mounted NSVT fitting');
      assert.equal(mg.userData.barrelBridge, true,
        't90: NSVT receiver and barrel are joined by a breech bridge');

      const guardSeats = tank.root.userData.mudguardFenderSeats || [];
      const guardLabels = new Set(attachment.guardLabels);
      const registeredGuards = guardSeats.filter(({ label }) =>
        guardLabels.has(label));
      assert.equal(registeredGuards.length, attachment.guardLabels.length,
        't90: all four terminal mudguards participate in the physical seating audit');
      assert.ok(registeredGuards.every(({ supported }) => supported),
        't90: every terminal mudguard physically meets its fender structure');
    }

    if (id === 't90ms') {
      const attachment = hull.userData.t90MSFrontMudguardReceipt;
      assert.ok(attachment, 't90ms: exposes its mirrored front mudguard receipt');
      assert.equal(attachment.sides, 2,
        't90ms: authors the guard assembly on both track courses');
      assert.equal(attachment.partsPerSide, 7,
        't90ms: each guard has six metal supports and one rubber drop');
      assert.equal(attachment.labels.length,
        attachment.sides * attachment.partsPerSide,
        't90ms: every authored guard piece has a seating label');
      assert.ok(attachment.bridgeInnerX < 1.06
        && attachment.bridgeOuterX >= 1.78,
      't90ms: the bridge overlaps the centre glacis and reaches the outer step');
      assert.ok(attachment.bridgeUndersideY > attachment.trackTopY,
        't90ms: connected fender bridge remains above the return track course');
      assert.ok(attachment.flapTopY >= attachment.bridgeUndersideY,
        't90ms: rubber drop overlaps the structural terminal lip');

      const guardSeats = tank.root.userData.mudguardFenderSeats || [];
      const guardLabels = new Set(attachment.labels);
      const registeredGuards = guardSeats.filter(({ label }) =>
        guardLabels.has(label));
      assert.equal(registeredGuards.length, attachment.labels.length,
        't90ms: every metal and rubber piece participates in the physical seating audit');
      assert.ok(registeredGuards.every(({ supported }) => supported),
        't90ms: both complete front mudguards form supported hull-connected chains');
    }
  } finally {
    tank.dispose();
  }
}

console.log('t90RoadWheelSpacing.selftest: RU-417, Tagil and Proryv road wheels are distinct and loaded');
