// Release 274 (the owner, 2026-11-20: "completely redesign the leopard 2 prototype"; Kevin's calls via Main the same day):
// the Leopard 2 Prototype is PT 10 / T 17 (profiles/leopard2Prototype.ts) carrying the T 11's 20 mm Rh 202.
//  1. the spec: the measured 9.71 m, 49 t, the 120 mm's DM13 designation on the kinetic round (its numbers DM33's),
//     height, width and the main gun unchanged;
//  2. the rig the authority fires from is the vehicle drawn: the turret pivot, the trunnion and the muzzle at the combat
//     barrel's length, the muzzle where the overall length puts it;
//  3. the width: nothing stands past the skirts' 3.70 m;
//  4. the roof gun: the KPz 70's Rh 202 station on the T 11's left-roof collar, a working 20 mm roof gun firing the
//     Rh 202's profile, no FLW 200 and no loader's MG3; the MBT-70 keeps its own station where it was;
//  5. the wedge mantlet pitches with the gun (it is stock of the gun's rig, not the turret's).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installCanvasFixture } from '../canvasFixture.test-support.mjs';

installCanvasFixture();
const { createTank } = await import('../tankFactory.ts');
const { getSpec } = await import('../specs.ts');
const { auxiliaryWeaponProfile } = await import('../auxiliaryWeapons.ts');
const { LEOPARD2_PROTO } = await import('../leopard2ProtoArmor.ts');

const id = 'leopard2_proto';
const spec = getSpec(id);

// 1. the spec
assert.equal(spec.weightTons, 49, 'the PTs ran about 1.5 t over their MLC 50 target');
assert.deepEqual(spec.dims, { hullLengthM: 7.72, overallLengthM: 9.71, widthM: 3.70, heightM: 2.48 });
assert.equal(spec.gun.caliberMm, 120, 'T 11 to T 17 carried the 120 mm smoothbore');
const ke = spec.gun.shells.find((round) => round.type === 'APFSDS');
assert.equal(ke.name, 'DM13 APFSDS-T', 'the 120 mm\'s first kinetic designation');
const donor = getSpec('leo2a2').gun.shells.find((round) => round.type === 'APFSDS');
assert.deepEqual({ ...ke, name: donor.name }, donor, 'the round\'s game numbers stand');

for (const quality of ['high', 'low']) {
  const tank = createTank(id, null, { proceduralOnly: true, quality, batchStatic: false });
  try {
    tank.root.updateMatrixWorld(true);
    // 2. the rig
    const turret = tank.root.getObjectByName('rig_turret'), gun = tank.root.getObjectByName('rig_gun');
    const muzzle = tank.root.getObjectByName('rig_muzzle');
    assert.deepEqual(turret.position.toArray(), spec.armor.turretPivot, `${quality}: the turret stands on the recorded pivot`);
    assert.deepEqual(gun.position.toArray(), spec.armor.gunPivot, `${quality}: the trunnion is the recorded gun pivot`);
    assert.ok(Math.abs(muzzle.position.z - spec.armor.gunBarrel.lengthM) < 1e-6, `${quality}: the muzzle ends the combat barrel`);
    const muzzleZ = muzzle.getWorldPosition(new THREE.Vector3()).z;
    assert.ok(Math.abs(muzzleZ - LEOPARD2_PROTO.rearZ - spec.dims.overallLengthM) < 0.01,
      `${quality}: the overall length is the drawn muzzle to the stern (muzzle at z ${muzzleZ.toFixed(3)})`);
    // 3. the width
    const bounds = new THREE.Box3().setFromObject(tank.root);
    assert.ok(bounds.max.x - bounds.min.x <= spec.dims.widthM + 0.01, `${quality}: nothing past the skirts (${(bounds.max.x - bounds.min.x).toFixed(3)} m)`);
    // 4. the roof gun
    const station = tank.root.getObjectByName('leo2ProtoRh202Station');
    assert.ok(station, `${quality}: the T 11's Rh 202 station is built`);
    assert.ok(turret.getObjectById(station.id), `${quality}: the station traverses with the turret`);
    const local = turret.worldToLocal(station.getWorldPosition(new THREE.Vector3()));
    assert.ok(local.x > 0.4 && local.z < -1.0, `${quality}: on the left of the roof, aft of the loader's hatch`);
    const names = [];
    tank.root.traverse((o) => names.push(o.name));
    assert.ok(!names.some((n) => /flw/i.test(n)), `${quality}: no FLW 200`);
    assert.ok(!names.includes('leo2LoaderMg3'), `${quality}: the station takes the loader's MG3's place`);
    // 5. the mantlet pitches with the gun: stock under the gun's rig reaches back to the turret's front face
    const gunBox = new THREE.Box3();
    gun.traverse((o) => { if (o.isMesh) gunBox.expandByObject(o); });
    const faceZ = turret.localToWorld(new THREE.Vector3(0, 0, LEOPARD2_PROTO.frontZ)).z;
    assert.ok(gunBox.min.z < faceZ + 0.01 && gunBox.max.x - gunBox.min.x > 1.0,
      `${quality}: the wedge mantlet (${(gunBox.max.x - gunBox.min.x).toFixed(2)} m wide) rides the gun from the turret's face`);
  } finally { tank.dispose(); }
}

const profile = auxiliaryWeaponProfile(20, id);
assert.match(profile.shell.name, /^20×139 mm/, 'the Rh 202\'s cartridge');
assert.equal(profile, auxiliaryWeaponProfile(20, 'mbt70'), 'the KPz 70\'s Rh 202 profile');

const mbt70 = createTank('mbt70', null, { proceduralOnly: true, quality: 'low', batchStatic: false });
try {
  mbt70.root.updateMatrixWorld(true);
  const station = mbt70.root.getObjectByName('mbt70Rh202Station');
  assert.ok(station, 'the MBT-70 keeps its station');
  const local = mbt70.root.getObjectByName('rig_turret').worldToLocal(station.getWorldPosition(new THREE.Vector3()));
  assert.ok(Math.abs(local.x - 0.62) < 0.05 && Math.abs(local.z + 0.66) < 0.05, 'the MBT-70\'s station where it was');
} finally { mbt70.dispose(); }

console.log('Leopard 2 Prototype (PT 10 / T 17): spec, rig, width, the T 11 Rh 202 roof gun and the pitching mantlet pass');
