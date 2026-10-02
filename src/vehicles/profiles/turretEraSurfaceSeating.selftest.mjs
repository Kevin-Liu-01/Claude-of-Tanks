import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';
import { FLEET_RENEWAL_DONORS } from '../fleetRenewalSpecs.ts';

// 2026-10-01: t80u (now the T-80UK on t80u_x) and t72m1_jaguar (on t72b3_x) are the owner's September rebuilds
// (4c34b3e8b, fleet-renewal-publication-20260930.md). Their turret ERA is the donor study's own construction (plus the
// Jaguar's three attached cheek receivers a side, t72JaguarRedesign), not this surface-seated cassette solver, so the
// solver's receipt left with the retired builders; they are held to their donors' reactive sectors instead.
for (const [id, donorId] of [['t80u', 't80u_x'], ['t72m1_jaguar', 't72b3_x']]) {
  assert.equal(FLEET_RENEWAL_DONORS[id], donorId, `${id}: the renewal rebuilds it on ${donorId}`);
  const sectors = (vehicle) => {
    const tank = createTank(vehicle, null, { proceduralOnly: true, quality: 'high', camoSeed: 4242, geometryReceipt: true });
    try { return [...(tank.root.userData.eraFinishReceipt?.sectors ?? [])].sort(); } finally { tank.dispose(); }
  };
  assert.deepEqual(sectors(id), sectors(donorId), `${id}: turret and hull ERA follow the donor study's sectors`);
}

const cases = Object.freeze({
  t80bv: Object.freeze({ cassetteSeats: 24, minimumSurfaceGapM: -0.06 }),
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
