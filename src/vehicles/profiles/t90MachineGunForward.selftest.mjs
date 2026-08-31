import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';

const CASES = Object.freeze({
  t90: Object.freeze({
    weaponName: 't90Ru417AutomatedKord',
    stationReceipt: 't90Ru417AutomatedStationReceipt',
  }),
  t90ms: Object.freeze({
    weaponName: 't90msTagilRemoteKord',
    stationReceipt: 't90msTagilWeaponTowerReceipt',
  }),
  t90m: Object.freeze({
    weaponName: 't90mProryvRemoteKord',
    stationReceipt: 't90mProryvAutomatedStationReceipt',
  }),
  t90m_proryv: Object.freeze({
    weaponName: 't90mProryvRemoteKord',
    stationReceipt: 't90mProryvAutomatedStationReceipt',
  }),
});

for (const [id, { weaponName, stationReceipt }] of Object.entries(CASES)) {
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
    let owner = weapon.parent;
    while (owner && owner !== turret) owner = owner.parent;
    assert.equal(owner, turret, `${id}: machine gun remains turret-owned`);
    assert.ok(Math.abs(weapon.rotation.y) <= Number.EPSILON,
      `${id}: machine-gun barrel faces local +Z without sideways yaw`);
    const station = turret?.userData[stationReceipt];
    assert.ok(station, `${id}: publishes its roof weapon-station receipt`);
    assert.ok(Math.abs(station.stationYaw) <= Number.EPSILON,
      `${id}: armored weapon tower faces local +Z with its gun`);
    if ('weaponYaw' in station) {
      assert.ok(Math.abs(station.weaponYaw) <= Number.EPSILON,
        `${id}: station receipt confirms the gun faces local +Z`);
    }

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
