import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';

const EPSILON = 1e-6;
const triangleCount = (object) => {
  const geometry = object?.geometry;
  if (!geometry) return 0;
  return geometry.index
    ? geometry.index.count / 3
    : geometry.getAttribute('position')?.count / 3 || 0;
};
const build = (id) => createTank(id, null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});
const meshNames = (root) => {
  const names = [];
  root.traverse((object) => { if (object.isMesh) names.push(object.name); });
  return names;
};

// 2026-10-01: the owner's September renewal rebuilt all three vehicles on detailed source studies (4c34b3e8b,
// cdbfe54dc, fleet-renewal-publication-20260930.md): t72b3m is the obr. 2022 on t72b3m_x with the T-90SM X turret,
// t72bu the T-72BU 1989 on t72bu_x, bmpt_terminator2 the T-80U X hull with its reshaped station. The legacy builders'
// cleanup receipts (single-crown skin, raised casting, centered turntable) left with them; the cleanups themselves
// remain the law and are checked on the actual rebuilds: a seated articulated turret at the combat datum, reactive
// armour owned by the turret it protects, and no near-black synthetic panels between the road wheels.
const REBUILDS = Object.freeze({
  t72b3m: { donor: 't72b3m_x', turretEra: true },
  t72bu: { donor: 't72bu_x', turretEra: true },
  bmpt_terminator2: { donor: 't80u_x', turretEra: false },
});
for (const [id, expected] of Object.entries(REBUILDS)) {
  const tank = build(id);
  try {
    const hullRig = tank.root.getObjectByName('rig_hull');
    const turretRig = tank.root.getObjectByName('rig_turret');
    const gunRig = tank.root.getObjectByName('rig_gun');
    assert.ok(hullRig && turretRig && gunRig?.parent === turretRig, `${id} retains separate hull, turret and gun rigs`);
    assert.equal(hullRig.userData.familyRebuild?.donor, expected.donor, `${id}: the renewal rebuild on ${expected.donor}`);
    turretRig.position.toArray().forEach((value, axis) => assert.ok(Math.abs(value - getSpec(id).armor.turretPivot[axis]) < EPSILON,
      `${id}: turret seats at the combat/anatomy ring datum (${axis})`));
    assert.equal(meshNames(tank.root).some((name) => /WheelBayShadow|hullShadow/i.test(name)), false,
      `${id} has no near-black rectangles between its road wheels`);
    const turretEra = turretRig.getObjectByName('turretExternalArmor');
    if (expected.turretEra) assert.ok(turretEra?.isMesh, `${id}: turret ERA stays turret-owned`);
    else assert.equal(turretEra, undefined, `${id}: the reshaped station cannot keep ghost donor turret ERA`);
  } finally {
    tank.dispose();
  }
}

{
  const tank = build('bmpt_terminator2');
  try {
    const turntable = tank.root.getObjectByName('rig_turret')?.getObjectByName('turretTrack');
    assert.ok(turntable?.isMesh, 'BMPT Terminator 2 keeps a dedicated turntable');
    assert.ok(triangleCount(turntable) <= 200,
      'BMPT turntable stays compact instead of inheriting a donor turretTrack assembly');
  } finally {
    tank.dispose();
  }
}

console.log('t72TurretCleanup.selftest: B3M, T-72BU, and BMPT geometry cleanup contracts pass');
