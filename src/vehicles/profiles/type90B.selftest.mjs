// Release 267 (owner 2026-10-31, "add a type 90 b esp with that awesome machine gun"; Main: the roller-ready Type 90):
// the Type 90 (B), 'type90b', is the production Type 90 ('type90', profiles/type90X.ts) with the Type 92 roller's
// mounting plate, its six seats and the hitch lugs (profiles/type90B.ts), and the Type 90's own roof M2 rebuilt on its
// pintle for every Type 90. This receipt is the B's photo packet fixture (docs/references/photos/type90b-20261031.json).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { TYPE90B_ROLLER_PLATE } from '../type90bArmor.ts';

const bounds = (tank) => { tank.root.updateMatrixWorld(true); return new THREE.Box3().setFromObject(tank.root); };

// Combat: the Type 90's in every number but the roller's 10 mm spaced plate over the lower front plate
const b = getSpec('type90b'), t90 = getSpec('type90');
for (const key of ['hp', 'enginePowerHp', 'weightTons', 'topSpeedKmh', 'reverseSpeedKmh', 'hullTraverseDegS',
  'turretTraverseDegS', 'gunPitchDegS']) assert.equal(b[key], t90[key], `type90b ${key} is the Type 90's`);
assert.deepEqual(b.gun, t90.gun, 'type90b fires the Type 90 gun and clip');
assert.deepEqual(b.armor.turretPivot, t90.armor.turretPivot, 'type90b turns the Type 90 turret');
const plate = b.armor.hullPlates.find((p) => p.name === 'type90b_roller_mount_plate');
assert.ok(plate && plate.kind === 'spaced' && plate.physicalMm === 10, 'type90b: the roller plate is 10 mm of spaced steel');
assert.ok(plate.verts.every(([, y, z]) => y > TYPE90B_ROLLER_PLATE.foot[0] - 0.01 && y < TYPE90B_ROLLER_PLATE.top[0] + 0.01
  && z > TYPE90B_ROLLER_PLATE.foot[1] && z < TYPE90B_ROLLER_PLATE.top[1] + 0.02), 'type90b: the plate lies over the lower front plate');
assert.equal(b.armor.hullPlates.length, t90.armor.hullPlates.length + 1, 'type90b: one plate more than the Type 90');

for (const quality of ['high', 'low']) {
  const tank = createTank('type90b', null, { quality, proceduralOnly: true, geometryReceipt: true, camoSeed: 4242 });
  const base = createTank('type90', null, { quality, proceduralOnly: true, geometryReceipt: true, camoSeed: 4242 });
  try {
    // the kit stays inside the Type 90's envelope: the seats under the nose, the lugs on the glacis
    const kb = bounds(tank), bb = bounds(base);
    for (const k of ['x', 'y', 'z']) {
      assert.ok(Math.abs(kb.min[k] - bb.min[k]) < 0.002 && Math.abs(kb.max[k] - bb.max[k]) < 0.002,
        `${quality}: type90b keeps the Type 90's ${k} extent`);
    }
    // the roller plate's face: a ray up the nose's centreline (between the seats) from ahead and below meets the plate,
    // not the hull plate
    const out = new THREE.Vector3(0, TYPE90B_ROLLER_PLATE.out[0], TYPE90B_ROLLER_PLATE.out[1]);
    const mid = new THREE.Vector3(0, (TYPE90B_ROLLER_PLATE.foot[0] + TYPE90B_ROLLER_PLATE.top[0]) / 2,
      (TYPE90B_ROLLER_PLATE.foot[1] + TYPE90B_ROLLER_PLATE.top[1]) / 2);
    const hit = (root) => new THREE.Raycaster(mid.clone().addScaledVector(out, 1), out.clone().negate(), 0, 2)
      .intersectObject(root, true)[0];
    const onB = hit(tank.root), onBase = hit(base.root);
    assert.ok(onB && onBase && onBase.distance - onB.distance > 0.006 && onBase.distance - onB.distance < 0.014,
      `${quality}: the plate stands 8-12 mm proud of the lower front plate (${onB && onBase ? (onBase.distance - onB.distance).toFixed(4) : 'no hit'})`);
    // every Type 90 carries the M2 on its pintle as a working station: a yaw root over the post, its gun pitching
    for (const [id, root] of [['type90b', tank.root], ['type90', base.root]]) {
      const station = root.getObjectByName('type90XRoofM2');
      assert.ok(station, `${quality}: ${id} carries the roof M2 station`);
      assert.ok(station.getObjectByName('auxiliaryWeaponPitch'), `${quality}: ${id}'s M2 pitches in its cradle`);
      const muzzle = new THREE.Vector3(...station.userData.auxiliaryMuzzle).applyMatrix4(station.matrixWorld);
      assert.ok(muzzle.y > 2.80 && muzzle.y < 2.93 && muzzle.z > 1.9 && muzzle.z < 2.3,
        `${quality}: ${id}'s M2 muzzle reaches over the turret front (${muzzle.toArray().map((n) => n.toFixed(3))})`);
    }
  } finally { tank.dispose(); base.dispose(); }
}
console.log('type90B.selftest: the Type 90 (B) is the Type 90 with the roller\'s mounting plate and seats, inside its envelope; every Type 90 carries its M2 on the pintle as a working station');
