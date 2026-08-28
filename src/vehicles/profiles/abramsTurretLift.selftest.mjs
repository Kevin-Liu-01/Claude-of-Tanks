import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';

const LIFT_M = 0.012;
const CASES = [
  ['m1a2', 1.57],
  ['m1a1', 1.57],
  ['m1a1ha', 1.57],
  ['m1a2_tusk', 1.57],
  ['m1a2_sepv2', 1.57],
  ['m1a2_sepv3', 1.57],
  ['ua_m1a1', 1.57],
  ['m1a2_legacy', 1.72],
  ['abramsx', 1.95],
];

for (const [id, authoredPivotY] of CASES) {
  const tank = createTank(id, null, {
    proceduralOnly: true,
    quality: 'high',
    camoSeed: 4242,
    geometryReceipt: true,
  });
  await Promise.resolve();

  try {
    const turret = tank.root.getObjectByName('rig_turret');
    const gun = tank.root.getObjectByName('rig_gun');
    assert.ok(turret && gun, `${id}: retains canonical turret and gun rigs`);
    assert.equal(turret.userData.abramsTurretLiftM, LIFT_M,
      `${id}: publishes the shared Abrams turret-lift receipt`);
    assert.ok(Math.abs(turret.position.y - (authoredPivotY + LIFT_M)) <= 1e-9,
      `${id}: complete turret assembly is raised exactly ${LIFT_M} m`);
    assert.equal(gun.parent, turret, `${id}: gun rises and yaws with the lifted turret`);

    for (const yaw of [0, Math.PI / 2, Math.PI]) {
      turret.rotation.y = yaw;
      tank.root.updateMatrixWorld(true);
      assert.ok(Math.abs(turret.position.y - (authoredPivotY + LIFT_M)) <= 1e-9,
        `${id}: lifted seat remains stable through yaw ${yaw}`);
    }
  } finally {
    tank.dispose();
  }
}

const mbt70 = createTank('mbt70', null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});
await Promise.resolve();
try {
  const turret = mbt70.root.getObjectByName('rig_turret');
  assert.ok(Math.abs(turret.position.y - 1.49) <= 1e-9,
    'MBT-70 retains its independent 1.49 m turret pivot');
  assert.equal(turret.userData.abramsTurretLiftM, undefined,
    'MBT-70 does not inherit the Abrams turret lift');
} finally {
  mbt70.dispose();
}

console.log('abramsTurretLift.selftest: nine Abrams turrets lift together; MBT-70 remains unchanged');
