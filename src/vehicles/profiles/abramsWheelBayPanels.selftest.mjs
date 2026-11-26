import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';
import { betweenBuilds } from '../../../tools/build-loop-yield.mjs';

const OPEN_WHEEL_BAY_IDS = [
  'm1a1_abrams_hc',
  'm1a1',
  'm1a1ha',
  'm1a1_abrams_sa',
  'm1a1_abrams_aim',
  'm1a1_abrams_fep',
  'ua_m1a1',
];

for (const id of OPEN_WHEEL_BAY_IDS) {
  await betweenBuilds(); // the last build is free to go (tools/build-loop-yield.mjs)
  const tank = createTank(id, null, {
    proceduralOnly: true,
    quality: 'high',
    camoSeed: 4242,
    geometryReceipt: true,
  });

  try {
    const hull = tank.root.getObjectByName('rig_hull');
    assert.ok(hull, `${id}: retains the canonical hull rig`);
    assert.ok(hull.getObjectByName('gear_wheelBayAO') === undefined,
      `${id}: leaves the wheel bays open without flat AO side panels`);
    // e5132509b1 (owner 2026-11-04: wheel dressing has to "be part of and move with the actual wheels"): the profile's
    // static gear_endWheelDress_* faces ride their wheels as gearWheelDressing_gear_endWheelDress_* spinners
    const riding = new Set();
    hull.traverse((o) => {
      const m = /^gearWheelDressing_gear_endWheelDress_(dark|detail)$/.exec(o.name);
      if (m && o.isMesh && o.userData.runningGearUnitId !== undefined) riding.add(`${m[1]}:${o.userData.wheelDressingOf}`);
    });
    assert.ok(hull.getObjectByName('gear_endWheelDress_dark') === undefined && hull.getObjectByName('gear_endWheelDress_detail') === undefined,
      `${id}: no idler or sprocket face stays static on the hull`);
    assert.deepEqual([...riding].sort(), ['dark:idler', 'dark:sprocket', 'detail:idler', 'detail:sprocket'],
      `${id}: retains the seated idler and sprocket face dressing, riding its wheels`);
    assert.ok(hull.getObjectByName('gearRoadWheelTires')
      && hull.getObjectByName('gearTrackPads'),
    `${id}: retains the animated wheels and track shoes`);
  } finally {
    tank.dispose();
  }
}

console.log('abramsWheelBayPanels.selftest: seven Abrams variants omit flat AO side panels; their idler and sprocket faces ride their wheels');
