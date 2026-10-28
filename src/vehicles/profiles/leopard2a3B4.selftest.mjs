// Release 262: the Leopard 2A3 of the fourth batch (profiles/leopard2a3B4.ts; Main 2026-10-27: "built on the same new
// first-party Leopard construction as the Christian II", "at tier IV with the current 2A3's combat data", the current 2A3
// shown as the "Leopard 2A2 OTCO"):
//  1. its own spec carrying leo2a3's combat data exactly (stats, gun, rounds, the 260 trims), both at IV, the old 2A3
//     shown as the 2A2 OTCO;
//  2. the shared construction: its running gear, tracks and hull shell are the Christian II's meshes (the release's
//     Leopard 2-pattern hull), its exhaust grilles the fourth batch's round rods;
//  3. the turret datums are the vehicle drawn: the ring and the trunnion where the rigs stand;
//  4. the main gun keeps 25 mm from its hull at every yaw at its published depression stop; negative control: at the
//     bare -9 degrees the gun meets the hull.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { tankTier } from '../tier.ts';
import { tankDisplayName } from '../tankLabels.ts';
import { geometryHash } from '../../../tools/receipt-kit.test-support.mjs';
import { LEO2A3B4_TURRET as T } from '../leopard2a3B4Armor.ts';
import { gunHullProbe, gunHullSweep, GUN_HULL_KEEP_M } from '../gunHullClearance.test-support.mjs';

const DEG = Math.PI / 180;
const options = { proceduralOnly: true, geometryReceipt: true, batchStatic: false, decor: false, camoSeed: 4242 };

// 1. the 2A3's combat data on its own spec
const spec = getSpec('leo2a3_b4'), old = getSpec('leo2a3');
assert.equal(spec.name, 'Leopard 2A3');
assert.equal(spec.variantOf, undefined, 'no fleet parent');
assert.equal(tankDisplayName(spec), 'Leopard 2A3');
assert.equal(tankDisplayName(old), 'Leopard 2A2 OTCO', 'the old 2A3 is shown as the 2A2 OTCO');
assert.equal(tankTier('leo2a3_b4'), 4);
assert.equal(tankTier('leo2a3'), 4, 'a 2A2 variant never above a 2A3');
for (const key of ['hp', 'enginePowerHp', 'weightTons', 'topSpeedKmh', 'reverseSpeedKmh', 'hullTraverseDegS',
  'turretTraverseDegS', 'gunPitchDegS', 'gunElevationDeg', 'gunDepressionDeg', 'role', 'era', 'nation']) {
  assert.deepEqual(spec[key], old[key], `${key} is the 2A3's`);
}
for (const key of ['caliberMm', 'reloadS', 'baseAccuracy', 'aimTimeS', 'autoloader']) {
  assert.deepEqual(spec.gun[key], old.gun[key], `gun.${key} is the 2A3's`);
}
assert.deepEqual(spec.gun.shells.map((s) => [s.name, s.type, s.pen100Mm, s.pen1000Mm, s.dmg, s.velocityMps]),
  old.gun.shells.map((s) => [s.name, s.type, s.pen100Mm, s.pen1000Mm, s.dmg, s.velocityMps]), 'the 2A3\'s rounds');

// 2. the shared construction
const stock = (id) => {
  const tank = createTank(id, null, { ...options, quality: 'high' }), out = new Map();
  tank.root.traverse((o) => {
    if (!o.isMesh || !o.geometry || /ghillie/i.test(o.name)) return;
    if (!/^(gear|track|hull$)/.test(o.name)) return;
    out.set(`${o.parent?.name}/${o.name}`, [...(out.get(`${o.parent?.name}/${o.name}`) ?? []), geometryHash(o.geometry)]);
  });
  tank.dispose();
  return out;
};
const own = stock('leo2a3_b4'), base = stock('christian2');
assert.ok(own.size >= 3, `the shared stock is found (${own.size} meshes)`);
for (const [key, hashes] of own) assert.deepEqual(base.get(key), hashes, `${key} is the release's Leopard 2-pattern hull's`);

// 3. the turret datums are the vehicle drawn
{
  const tank = createTank('leo2a3_b4', null, { ...options, quality: 'high' });
  try {
    tank.root.updateMatrixWorld(true);
    const at = (name) => new THREE.Vector3().setFromMatrixPosition(tank.root.getObjectByName(name).matrixWorld);
    assert.ok(at('rig_turret').distanceTo(new THREE.Vector3(...T.pivot)) < 1e-6, 'the ring stands at the datum');
    const trunnion = new THREE.Vector3(...T.gunLocal).add(new THREE.Vector3(...T.pivot));
    assert.ok(at('rig_gun').distanceTo(trunnion) < 1e-6, 'the trunnion stands at the datum');
  } finally {
    tank.dispose();
  }
}

// 4. the gun over its hull
{
  const probe = gunHullProbe('leo2a3_b4');
  try {
    assert.ok(probe.spec.gunPitchByYawDeg, 'publishes its measured gunPitchByYawDeg');
    const worst = gunHullSweep(probe, probe.spec);
    console.log(`leo2a3_b4: the gun's worst clearance ${(worst.d * 1000).toFixed(1)} mm at yaw ${worst.yd}, pitch ${(worst.pitch / DEG).toFixed(2)} (${worst.part})`);
    assert.ok(worst.d >= GUN_HULL_KEEP_M - 1e-4, `the main gun keeps 25 mm from its hull at every yaw (${(worst.d * 1000).toFixed(2)} mm at yaw ${worst.yd} from ${worst.part})`);
    const bare = gunHullSweep(probe, { gunDepressionDeg: probe.spec.gunDepressionDeg }, { stop: GUN_HULL_KEEP_M });
    assert.ok(bare.d < GUN_HULL_KEEP_M, `negative control: the bare -${probe.spec.gunDepressionDeg} degrees meets the hull (${(bare.d * 1000).toFixed(2)} mm)`);
  } finally {
    probe.dispose();
  }
}
console.log('leopard2a3B4.selftest: the 2A3\'s combat data on its own spec, the shared Leopard 2-pattern hull, the datums drawn, the gun clear of its hull PASS');
