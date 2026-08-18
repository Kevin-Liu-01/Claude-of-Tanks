import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.js';

const tank = createTank('kf51b', null, {
  proceduralOnly: true,
  geometryReceipt: true,
});

try {
  const turret = tank.root.getObjectByName('rig_turret');
  const gun = tank.root.getObjectByName('rig_gun');

  assert.ok(turret, 'KF51B rotating turret rig exists');
  assert.equal(turret.position.z, 0.30,
    'KF51B turret ring remains centered 0.30 m forward of the hull datum');
  assert.equal(gun?.parent, turret,
    'KF51B gun remains owned by the translated turret rig');
} finally {
  tank.dispose();
}

console.log('kf51bTurretCenter.selftest: centered turret and gun ownership pass');
