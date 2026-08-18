import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.js';

const tank = createTank('leo2_revolution', null, {
  proceduralOnly: true,
  geometryReceipt: true,
});

try {
  const turret = tank.root.getObjectByName('rig_turret');
  const gun = tank.root.getObjectByName('rig_gun');

  assert.ok(turret, 'Leopard 2 Revolution rotating turret rig exists');
  assert.equal(turret.position.x, 0,
    'Leopard 2 Revolution turret remains centered laterally');
  assert.equal(turret.position.z, -0.50,
    'Leopard 2 Revolution complete turret sits 0.50 m aft of hull datum');
  assert.equal(gun?.parent, turret,
    'Leopard 2 Revolution gun remains owned by the translated turret rig');
} finally {
  tank.dispose();
}

console.log('leopardRevolutionTurretCenter.selftest: centered turret and gun ownership pass');
