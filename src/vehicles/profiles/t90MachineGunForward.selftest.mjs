import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { ROOF_GUN_BEARING_DEG } from './t90.ts';

// 2026-10-30 (lane t90-family-266): the earlier T-90 marks build from their source-X twins, whose own receipts hold
// their roof weapons (t90XTwins.selftest.mjs holds the wiring); the Burlak prototype keeps its own turret and station.
// 2026-10-31 (the owner: "make all the variations' machine guns different or look in different directions"): each mark's
// station rests on its own bearing (t90.ts ROOF_GUN_BEARING_DEG); its gun still lies along the station's +Z.
const CASES = Object.freeze({
  t90a_burlak_proto: Object.freeze({
    weaponName: 't90aBurlakCommanderNsvt',
    stationReceipt: 't90aBurlakAutomatedStationReceipt',
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
    assert.ok(owner === turret, `${id}: machine gun remains turret-owned`);
    assert.ok(Math.abs(weapon.rotation.y - THREE.MathUtils.degToRad(ROOF_GUN_BEARING_DEG[id])) < 1e-9,
      `${id}: the station rests on its bearing (${ROOF_GUN_BEARING_DEG[id]} deg)`);
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
    assert.ok(machineGuns[0] === weapon, `${id}: named forward weapon is the live fitting root`);
  } finally {
    tank.dispose();
  }
}

// Every mark's roof gun rests on a bearing its twin's does not.
const TWINS = Object.freeze({ t90_1992: 't90', t90a_2004: 't90a', t90a_2006: 't90a_vladimir', t90ms_2011: 't90ms_tagil',
  t90sm_2013: 't90sm', t90am: 't90sm', t90m_proryv: 't90m', t90a_burlak_proto: 't90a_burlak' });
const bearing = (id) => {
  const tank = createTank(id, null, { proceduralOnly: true, quality: 'high', camoSeed: 4242, geometryReceipt: true });
  try {
    const turret = tank.root.getObjectByName('rig_turret'), q = new THREE.Quaternion(), out = [];
    tank.root.updateMatrixWorld(true);
    turret.traverse((node) => {
      if (node.userData.remoteControlled && node.userData.firingAxis === '+Z' && !node.userData.primaryWeapon) {
        const d = new THREE.Vector3(0, 0, 1).applyQuaternion(node.getWorldQuaternion(q));
        out.push(Math.round(THREE.MathUtils.radToDeg(Math.atan2(d.x, d.z))));
      }
    });
    return out;
  } finally { tank.dispose(); }
};
const twinBearings = new Map();
for (const [id, twin] of Object.entries(TWINS)) {
  if (!twinBearings.has(twin)) twinBearings.set(twin, bearing(twin));
  const mine = bearing(id), theirs = twinBearings.get(twin);
  assert.ok(mine.length > 0, `${id}: has a roof station`);
  assert.notDeepEqual(mine, theirs, `${id}: its roof gun rests on its own bearing (${mine}), not its twin ${twin}'s (${theirs})`);
}

console.log('t90MachineGunForward.selftest: the Burlak prototype roof weapon and armored station are seated on its bearing; every mark\'s roof gun rests apart from its twin\'s');
