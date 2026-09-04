import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';

const cases = Object.freeze({
  t80bv: Object.freeze({ cassetteSeats: 24, minimumSurfaceGapM: -0.06 }),
  t80u: Object.freeze({ cassetteSeats: 20, minimumSurfaceGapM: -0.05 }),
  t72m1_jaguar: Object.freeze({ cassetteSeats: 34, minimumSurfaceGapM: -0.02 }),
  ua_t80bv: Object.freeze({ cassetteSeats: 33, minimumSurfaceGapM: -0.05 }),
  ua_t80u_kursk: Object.freeze({ cassetteSeats: 36, minimumSurfaceGapM: -0.05 }),
});

for (const [id, expected] of Object.entries(cases)) {
  const tank = createTank(id, null, {
    proceduralOnly: true,
    quality: 'high',
    camoSeed: 4242,
    geometryReceipt: true,
  });

  try {
    const turretRig = tank.root.getObjectByName('rig_turret');
    const receipt = turretRig?.userData.turretEraSurfaceSeatReceipt;
    assert.ok(receipt, `${id} exposes its curved-turret ERA seating receipt`);
    assert.equal(receipt.profile, id);
    assert.equal(receipt.cassetteSeats, expected.cassetteSeats,
      `${id} surface-seats every targeted cassette and carrier`);
    assert.ok(receipt.maximumSurfaceGapM <= -0.007,
      `${id} ERA remains embedded by at least 7 mm instead of floating`);
    assert.ok(receipt.minimumSurfaceGapM >= expected.minimumSurfaceGapM,
      `${id} ERA carriers do not sink excessively into the cast turret shell`);
    if (id === 't80bv') {
      assert.ok(receipt.supportEmbedM >= 0.055 && receipt.cassetteEmbedM >= 0.025,
        'T-80BV flank shoes and cassettes remain positively embedded in the cast side');
      assert.equal(receipt.maximumCarrierJointM, 0,
        'T-80BV side ERA has a continuous attached carrier course');
    }
  } finally {
    tank.dispose();
  }
}

console.log('turretEraSurfaceSeating.selftest: Russian, Polish, and Ukrainian T-80/T-72 ERA follows its turret support surface');
