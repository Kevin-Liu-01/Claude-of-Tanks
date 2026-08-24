import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.js';

const OPEN_WHEEL_BAY_IDS = [
  'm1a2',
  'm1a1',
  'm1a1ha',
  'm1a2_tusk',
  'm1a2_sepv2',
  'm1a2_sepv3',
  'ua_m1a1',
];

for (const id of OPEN_WHEEL_BAY_IDS) {
  const tank = createTank(id, null, {
    proceduralOnly: true,
    quality: 'high',
    camoSeed: 4242,
    geometryReceipt: true,
  });

  try {
    const hull = tank.root.getObjectByName('rig_hull');
    assert.ok(hull, `${id}: retains the canonical hull rig`);
    assert.equal(hull.getObjectByName('gear_wheelBayAO'), undefined,
      `${id}: leaves the wheel bays open without flat AO side panels`);
    assert.ok(hull.getObjectByName('gear_endWheelDress_dark')
      && hull.getObjectByName('gear_endWheelDress_detail'),
    `${id}: retains the seated idler and sprocket face dressing`);
    assert.ok(hull.getObjectByName('gearRoadWheelTires')
      && hull.getObjectByName('gearTrackPads'),
    `${id}: retains the animated wheels and track shoes`);
  } finally {
    tank.dispose();
  }
}

console.log('abramsWheelBayPanels.selftest: seven Abrams variants omit flat AO side panels');
