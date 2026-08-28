import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';

const tank = createTank('kv2', null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});

try {
  const turretRig = tank.root.getObjectByName('rig_turret');
  const gunRig = tank.root.getObjectByName('rig_gun');
  const closure = turretRig?.userData.kv2FrontChamferClosure;

  assert.ok(turretRig && gunRig && closure,
    'KV-2 chamfer backing is owned by the canonical turret beside the articulated gun');
  assert.equal(closure.turretLocal, true, 'backing follows turret yaw');
  assert.equal(closure.exteriorSlopePreserved, true,
    'the marked exterior chamfer remains unchanged');
  assert.ok(closure.backingThicknessM >= 0.18,
    'the former 6 cm floating plate gains a substantial armor backing');
  assert.ok(closure.overlapM >= 0.01,
    'backing embeds into the chamfer enough to prevent light leaks');
  assert.ok(closure.edgeInsetM > 0,
    'backing remains inset from the authored prism corner cut');
  assert.deepEqual(closure.pitchSweepDeg, [-5, 12],
    'closure records the complete authored howitzer pitch envelope');

  const offsetY = closure.backingCenterY - 1.2745;
  const offsetZ = closure.backingCenterZ - 1.21;
  const normalDistance = offsetY * closure.undersideNormalY
    + offsetZ * closure.undersideNormalZ;
  const tangentResidual = offsetY * -closure.undersideNormalZ
    + offsetZ * closure.undersideNormalY;
  const expectedDistance = 0.06 / 2 + closure.backingThicknessM / 2 - closure.overlapM;
  assert.ok(Math.abs(normalDistance - expectedDistance) < 1e-9,
    'backing is seated directly behind the marked underside');
  assert.ok(Math.abs(tangentResidual) < 1e-9,
    'backing follows the chamfer slope without drifting along it');
} finally {
  tank.dispose();
}

console.log('kv2FrontChamferClosure.selftest: turret chamfer is structurally backed and slope-preserving');
