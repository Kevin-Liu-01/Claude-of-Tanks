import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.js';

const tank = createTank('t90a_burlak', null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});

try {
  const hullRig = tank.root.getObjectByName('rig_hull');
  const closure = hullRig?.userData.t90BurlakFenderClosure;
  assert.ok(hullRig && closure, 'Burlak hull exposes its fender-closure receipt');
  assert.equal(closure.registeredParts, 8,
    'four mirrored closure plates preserve the centre, forward and bow shoulders');
  assert.ok(closure.innerX < 1.50 && closure.outerX > 1.68,
    'closure overlaps both the narrowed hull shoulder and the outboard guard');
  assert.ok(closure.sternZ <= -1.30 && closure.bowZ >= 3.42,
    'closure spans the visible centre/forward fender course into the tapered bow');

  const seats = (tank.root.userData.mudguardFenderSeats || [])
    .filter(({ label }) => label.startsWith('t90a-burlak-fender-closure-'));
  assert.equal(seats.length, closure.registeredParts,
    'every closure segment participates in the mudguard/fender seating audit');
  for (const seat of seats) {
    assert.equal(seat.supported, true,
      `${seat.label}: closure must remain physically attached to fixed hull structure`);
  }

  const [gear] = hullRig.userData.runningGearReceipts || [];
  assert.ok(gear, 'Burlak retains its native running-gear receipt');
  const trackTop = Math.max(
    gear.wheelY + gear.wheelR,
    gear.idler.y + gear.idler.r,
    gear.sprocket.y + gear.sprocket.r,
  );
  assert.ok(closure.shelfUndersideY >= trackTop - 1e-6,
    `fender shelf remains on/above the track crown (${closure.shelfUndersideY} >= ${trackTop})`);
} finally {
  tank.dispose();
}

console.log('t90BurlakFenderClosure.selftest: mirrored forward fender and bow-shoulder closure passes');
