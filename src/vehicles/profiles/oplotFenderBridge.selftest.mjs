import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.js';

const tank = createTank('ua_t84_oplot_m', null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});

try {
  const hullRig = tank.root.getObjectByName('rig_hull');
  const receipt = hullRig?.userData.uaOplotFenderBridge;
  const seats = (tank.root.userData.mudguardFenderSeats || [])
    .filter(({ label }) => label.startsWith('ua-oplot-fender-bridge-'));

  assert.ok(hullRig && receipt, 'Oplot-M: hull fender bridge receipt exists');
  assert.equal(seats.length, receipt.registeredParts,
    'Oplot-M: every bridge segment and terminal plate is registered');
  for (const seat of seats) {
    assert.equal(seat.supported, true,
      `Oplot-M/${seat.label}: bridge must meet fixed hull or skirt structure`);
    assert.ok(seat.directGapM <= seat.toleranceM,
      `Oplot-M/${seat.label}: direct hull support gap ${seat.directGapM} m`);
  }

  assert.ok(receipt.innerX <= 1.30,
    'Oplot-M: bridge overlaps the armored hull shoulder');
  assert.ok(receipt.outerX >= receipt.skirtRootX,
    'Oplot-M: bridge reaches beyond the inner side-skirt face');
  assert.ok(receipt.undersideY <= receipt.skirtTopY
      && receipt.topY >= receipt.skirtTopY,
  'Oplot-M: side-skirt crown is captured inside the fender shelf');
  assert.ok(receipt.undersideY - receipt.trackTopY >= 0.39,
    'Oplot-M: bridge clears the animated upper track sweep');
} finally {
  tank.dispose();
}

console.log('oplotFenderBridge.selftest: hull-to-skirt fender shelves are seated and track-clear');
