import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';
import { FLEET_RENEWAL_DONORS } from '../fleetRenewalSpecs.ts';

function receiptFor(id) {
  const tank = createTank(id, null, {
    proceduralOnly: true,
    quality: 'high',
    camoSeed: 4242,
    geometryReceipt: true,
  });
  const turret = tank.root.getObjectByName('rig_turret');
  const receipt = turret?.userData.t80CastTurretReceipt;
  assert.ok(receipt, `${id}: exposes its canonical T-80 cast-turret receipt`);
  return { tank, turret, receipt };
}

// 2026-10-01: the owner's September renewal (4c34b3e8b, fleet-renewal-publication-20260930.md: "T-80UK uses
// t80u_x") rebuilt the t80u slot as the T-80UK command tank on the complete t80u_x source study, whose casting is
// that study's own; the shared dome receipt and the T-80U reseat below left with the retired builder.
{
  assert.equal(FLEET_RENEWAL_DONORS.t80u, 't80u_x', 't80u: the renewal builds the T-80UK on the T-80U study');
  const tank = createTank('t80u', null, { proceduralOnly: true, quality: 'high', camoSeed: 4242, geometryReceipt: true });
  try {
    assert.deepEqual(tank.root.getObjectByName('rig_hull').userData.familyRebuild,
      { donor: 't80u_x', revision: 1, variant: 'command' }, 't80u: the T-80UK command rebuild');
    assert.equal(tank.root.getObjectByName('rig_turret').userData.t80CastTurretReceipt, undefined,
      't80u: no half-retired shared dome under the study casting');
  } finally { tank.dispose(); }
}

const built = Object.fromEntries(
  ['t80', 't80b', 't80bv', 'ua_t80bv', 'ua_t80u_kursk']
    .map((id) => [id, receiptFor(id)]),
);

try {
  for (const id of Object.keys(built)) {
    const { receipt } = built[id];
    assert.equal(receipt.architecture, 'shared-t80-cast-dome-r1');
    assert.equal(receipt.maximumRadiusM, 1.465,
      `${id}: preserves the accepted broad T-80 casting shoulder`);
    assert.equal(receipt.planScaleZ, 0.88,
      `${id}: cannot regress to a narrow, long bespoke turret ellipse`);
  }

  for (const id of Object.keys(built)) {
    assert.equal(built[id].receipt.profile, 'standard',
      `${id}: uses the accepted T-80/T-80B/T-80U Kursk nine-ring shell`);
    assert.equal(built[id].receipt.ringCount, 9);
    assert.equal(built[id].receipt.planCenterZ, 0.22);
  }

  const russianBV = built.t80bv.receipt;
  const ukrainianBV = built.ua_t80bv.receipt;
  assert.equal(russianBV.scaleY, built.t80.receipt.scaleY,
    'Russian T-80BV base shell exactly matches the accepted T-80 profile');
  assert.equal(russianBV.crownY, built.t80.receipt.crownY);
  assert.equal(russianBV.equipmentSeatRevision, 't80bv-family-reseat-r2',
    'Russian T-80BV records the completed family-shell equipment reseat');
  assert.equal(ukrainianBV.scaleY, 0.94,
    'Ukrainian T-80BV preserves its installed height while sharing the canonical rings');
  assert.equal(ukrainianBV.equipmentSeatRevision, 'ua-t80bv-family-reseat-r2');
  assert.equal(russianBV.curvedNormals, true);
  assert.equal(ukrainianBV.curvedNormals, true);

} finally {
  for (const { tank } of Object.values(built)) tank.dispose();
}

console.log('t80CastTurretFamily.selftest: canonical T-80/BV cast shells and equipment reseats verified');
