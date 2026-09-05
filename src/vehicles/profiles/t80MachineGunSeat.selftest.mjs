import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';

const EPSILON = 1e-9;

function near(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) <= EPSILON,
    `${label}: expected ${expected}, received ${actual}`);
}

for (const id of ['t80', 't80b', 't80bv']) {
  const tank = createTank(id, null, {
    proceduralOnly: true,
    quality: 'high',
    camoSeed: 4242,
    geometryReceipt: true,
  });

  try {
    const turret = tank.root.getObjectByName('rig_turret');
    const station = turret?.getObjectByName('rig_t80CommanderCupolaWeaponStation');
    const weapon = station?.getObjectByName('fitting_browningDerived_nsvt');
    const receipt = turret?.userData.t80CommanderNsvtStationReceipt;

    assert.ok(station, `${id}: exposes the commander-cupola weapon station`);
    assert.equal(station.parent, turret,
      `${id}: station is attached to the traversing turret`);
    assert.equal(station.userData.supportAssembly, 'commander-cupola');
    assert.ok(weapon, `${id}: exposes its complete NSVT fitting`);
    assert.equal(weapon.parent, station,
      `${id}: NSVT is attached to the commander-cupola station`);

    near(station.rotation.x, 0, `${id}: station pitch`);
    near(station.rotation.y, 0, `${id}: station yaw`);
    near(station.rotation.z, 0, `${id}: station roll`);
    near(weapon.rotation.x, 0, `${id}: weapon pitch`);
    near(weapon.rotation.y, 0, `${id}: weapon yaw`);
    near(weapon.rotation.z, 0, `${id}: weapon roll`);
    near(weapon.userData.commandedElevationRad, 0,
      `${id}: authored barrel elevation`);

    assert.ok(receipt, `${id}: publishes a machine-gun seating receipt`);
    assert.equal(receipt.profile, id);
    assert.equal(receipt.supportAssembly, 'commander-cupola');
    assert.equal(receipt.stationName, station.name);
    near(receipt.stationYaw, 0, `${id}: receipt station yaw`);
    near(receipt.weaponYaw, 0, `${id}: receipt weapon yaw`);
    near(receipt.weaponPitch, 0, `${id}: receipt weapon pitch`);
    near(receipt.supportTopY - receipt.fittingFootY, receipt.supportEmbedM,
      `${id}: pintle-foot support embed`);
    near(receipt.supportEmbedM, 0.005, `${id}: support embed depth`);
    near(station.position.x, receipt.cupolaCenter[0],
      `${id}: station centered on commander cupola x`);
    near(station.position.z, receipt.cupolaCenter[2],
      `${id}: station centered on commander cupola z`);
  } finally {
    tank.dispose();
  }
}

console.log('t80MachineGunSeat.selftest: T-80/B/BV NSVTs are straight and cupola-mounted');
