import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';

const EPSILON_M = 1e-6;
const tank = createTank('m1a2_tusk', null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});
await Promise.resolve();

try {
  const hullRig = tank.root.getObjectByName('rig_hull');
  const receipt = hullRig?.userData?.abramsTuskBellyLipSeat;
  assert.ok(receipt, 'TUSK publishes a belly-lip seating receipt');
  assert.equal(receipt.parent, 'rig_hull', 'belly lip remains owned by the hull rig');
  assert.equal(receipt.bucket, 'hull', 'belly lip remains structural hull armor');
  assert.ok(Math.abs(receipt.upperFaceYAtContact - receipt.bellyFloorY) <= EPSILON_M,
    'raked belly-lip upper face contacts the belly floor at its forward edge');
  assert.ok(receipt.pitch < 0, 'belly lip retains its authored lower-bow rake');

  const parts = tank.root.userData.combatGeometryParts;
  const lipParts = parts.filter((part) => part.bucket === 'hull'
    && part.parent === 'hullG'
    && Math.abs(part.min[0] + 0.9) <= EPSILON_M
    && Math.abs(part.max[0] - 0.9) <= EPSILON_M
    && part.min[2] > 2.5 && part.max[2] < 3.0
    && part.max[1] < 0.5);
  assert.equal(lipParts.length, 1, 'TUSK retains one structural belly-armor lip');
  const lip = lipParts[0];
  assert.ok(lip.min[2] < receipt.bellyFloorFrontZ
    && lip.max[2] > receipt.bellyFloorFrontZ,
  'belly lip crosses the belly-pan endpoint instead of ending in front of it');
  assert.ok(lip.max[1] >= receipt.bellyFloorY,
    'belly lip reaches the belly floor rather than floating below it');
} finally {
  tank.dispose();
}

console.log('abramsTuskBellyLip.selftest: raked TUSK belly armor is welded to the hull floor');
