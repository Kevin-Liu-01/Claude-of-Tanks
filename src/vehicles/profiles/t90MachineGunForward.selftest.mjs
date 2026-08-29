import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';

const CASES = Object.freeze({
  t90: 't90Ru417AutomatedKord',
  t90ms: 't90msTagilRemoteKord',
  t90m: 't90mProryvRemoteKord',
  t90m_proryv: 't90mProryvRemoteKord',
});

for (const [id, weaponName] of Object.entries(CASES)) {
  const tank = createTank(id, null, {
    proceduralOnly: true,
    quality: 'high',
    camoSeed: 4242,
    geometryReceipt: true,
  });

  try {
    const turret = tank.root.getObjectByName('rig_turret');
    const weapon = turret?.getObjectByName(weaponName);
    assert.ok(weapon, `${id}: exposes its named roof machine gun`);
    assert.equal(weapon.parent, turret, `${id}: machine gun remains turret-owned`);
    assert.ok(Math.abs(weapon.rotation.y) <= Number.EPSILON,
      `${id}: machine-gun barrel faces local +Z without sideways yaw`);

    const machineGuns = [];
    turret.traverse((node) => {
      if (node.userData?.fittingRoot && node.userData?.fitting === 'pintleMG') {
        machineGuns.push(node);
      }
    });
    assert.equal(machineGuns.length, 1, `${id}: has exactly one roof machine-gun fitting`);
    assert.equal(machineGuns[0], weapon, `${id}: named forward weapon is the live fitting root`);
  } finally {
    tank.dispose();
  }
}

console.log('t90MachineGunForward.selftest: RU-417, Tagil, T-90M, and Proryv roof machine guns face forward');
