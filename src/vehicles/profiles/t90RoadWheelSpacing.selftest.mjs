import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';

const EPSILON = 1e-6;
const burlakReference = createTank('t90a_burlak', null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});
const BURLAK_ROAD_WHEEL_RADIUS = burlakReference.root
  .getObjectByName('rig_hull')?.userData.runningGearReceipts?.at(-1)?.wheelR;
burlakReference.dispose();
assert.ok(BURLAK_ROAD_WHEEL_RADIUS > 0, 'Burlak publishes its road-wheel radius');

const CASES = Object.freeze({
  t90: Object.freeze({ radius: BURLAK_ROAD_WHEEL_RADIUS, centerY: 0.480, footY: 0.095, minGap: 0.01 }),
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
      assert.ok(Math.abs(receipt.wheelR - BURLAK_ROAD_WHEEL_RADIUS) <= EPSILON,
        't90: road wheels use the live T-90A Burlak radius');
      const attachment = hull.userData.t90AttachmentReceipt;
      assert.ok(attachment, 't90: exposes skirt and terminal-guard attachment receipt');
      assert.ok(attachment.skirt.z0 > receipt.sprocket.z + receipt.sprocket.r,
        't90: solid skirt stops ahead of the rear final-drive quarter');
      assert.ok(attachment.skirt.z1 >= receipt.idler.z + receipt.idler.r,
        't90: skirt reaches beyond the forward idler');
      assert.ok(attachment.skirt.yBot <= receipt.topY,
        't90: skirt drops into the return-track shoulder instead of becoming a thin fender strip');
      assert.ok(attachment.skirt.yTop >= 1.43,
        't90: skirt meets the upper fender course');
      assert.ok(attachment.skirt.height >= 0.60,
        't90: remaining solid skirt retains the front ERA apron depth');
      assert.equal(attachment.skirt.panels, 5,
        't90: each side keeps a five-panel straight skirt before the tapered bow closure');
      assert.equal(attachment.skirt.sides, 2,
        't90: solid skirts are authored on both sides');
      assert.equal(attachment.skirt.rearQuarterReplacedByCage, true,
        't90: rear quarter is explicitly replaced by the stand-off cage');
      assert.equal(attachment.skirt.burlakStyleTaperedFront, true,
        't90: forward skirt ends in the Burlak-style tapered bow closure');
      assert.ok(attachment.skirt.straightZ1 < attachment.skirt.z1,
        't90: tapered closure carries protection beyond the straight side curtain');
      assert.ok(attachment.skirt.frontClosureCoverageM >= 0.70,
        't90: forward closure provides deeper coverage than Burlak prototype skirts');
      assert.ok(Math.abs((receipt.wheelY - receipt.wheelR)
        - (receipt.botY + receipt.trackTh * 0.5)) <= EPSILON,
      't90: road-wheel feet meet the lower-track upper face without clipping');

      const mg = tank.root.getObjectByName('t90Ru417AutomatedKord');
      assert.ok(mg, 't90: exposes the integrated automated Kord fitting');
      assert.equal(mg.userData.barrelBridge, true,
        't90: Kord receiver and barrel are joined by a breech bridge');
      const station = tank.root.getObjectByName('rig_turret')
        ?.userData.t90Ru417AutomatedStationReceipt;
      assert.equal(station?.family, 'tagil-integrated-automated-station-r1',
        't90: commander station follows the consolidated Tagil family');
      assert.equal(station?.remoteControlled, true,
        't90: commander weapon station is remotely controlled');
      assert.equal(station?.panoramicIntegrated, true,
        't90: panoramic sight and Kord share one station');
      assert.equal(station?.separateManualWeaponStations, 0,
        't90: no second hand-served roof weapon remains');

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
      assert.equal(attachment.partsPerSide, 3,
        't90ms: each guard has two closed armor volumes and one rubber drop');
      assert.equal(attachment.labels.length,
        attachment.sides * attachment.partsPerSide,
        't90ms: every authored guard piece has a seating label');
      assert.equal(attachment.architecture,
        'continuous-sloped-shoulder-and-closed-outer-shell',
        't90ms: the bow guard uses the continuous sloped shoulder architecture');
      assert.equal(attachment.steppedShelves, false,
        't90ms: the old staircase of thin shelf plates does not return');
      assert.equal(attachment.closedSideVolume, true,
        't90ms: shoulder and outer guard are closed armor volumes');
      assert.ok(attachment.bridgeInnerX < 1.06
        && attachment.bridgeOuterX >= 1.64,
      't90ms: the shoulder overlaps the centre glacis and reaches the outer shell');
      assert.ok(attachment.shellInnerX <= attachment.bridgeOuterX
        && attachment.shellOuterX >= 1.78,
      't90ms: the outer shell overlaps the shoulder and reaches the terminal guard');
      assert.ok(attachment.bridgeUndersideY > attachment.trackTopY,
        't90ms: connected shoulder remains above the return track course');
      assert.ok(attachment.flapTopY >= attachment.shellFrontTopY - 0.03,
        't90ms: rubber drop meets the sloped outer shell at the terminal lip');

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

console.log('t90RoadWheelSpacing.selftest: RU-417 matches Burlak wheel size and keeps tapered skirts, cage, and automated station');
