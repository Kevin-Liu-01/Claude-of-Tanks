import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';

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

const built = Object.fromEntries(
  ['t80', 't80b', 't80bv', 'ua_t80bv', 't80u', 'ua_t80u_kursk']
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

  const t80u = built.t80u;
  assert.equal(t80u.receipt.scaleY, built.t80.receipt.scaleY,
    'T-80U base shell exactly matches the accepted T-80 vertical profile');
  assert.equal(t80u.receipt.crownY, built.t80.receipt.crownY);
  assert.equal(t80u.receipt.equipmentSeatRevision, 't80u-family-reseat-r2');
  assert.ok(Math.abs(t80u.turret.position.y + t80u.receipt.ringBaseY - 1.56) < 1e-6,
    'T-80U canonical casting is lowered onto its lifted hull shoulder');
} finally {
  for (const { tank } of Object.values(built)) tank.dispose();
}

console.log('t80CastTurretFamily.selftest: canonical T-80/BV cast shells and equipment reseats verified');
