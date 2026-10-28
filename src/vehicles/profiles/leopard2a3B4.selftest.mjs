// Release 262: the early production Leopard 2s on the new construction (profiles/leopard2a3B4.ts): the Leopard 2A3 of the
// fourth batch (leo2a3_b4; Main 2026-10-27: "built on the same new first-party Leopard construction as the Christian II",
// "at tier IV with the current 2A3's combat data"), and the 2A2 (leo2a2) and the 2A3 OTCO (leo2a3) rebuilt on it in place
// (the owner, 2026-10-28: "make a nnnew 2a2 and 2 nnnew 2a3 variannts, one of which is the otco"):
//  1. the 2A3's own spec carries leo2a3's combat data exactly (stats, gun, rounds, the 260 trims); the names and tiers
//     (2A2 at III, the 2A3 and the 2A3 OTCO at IV); all three on the construction's envelope, the prototype (made from
//     leo2a2's spec before the re-envelope) still on its own;
//  2. the shared construction: the running gear and tracks are the Christian II's meshes, the hull shell one mesh for the
//     three (the deeper fore skirt blocks), the batches told apart where they were built apart;
//  3. the turret datums are the vehicle drawn: the ring and the trunnion where the rigs stand, on all three;
//  4. each main gun keeps 25 mm from its hull at every yaw at its published depression stop; negative control: at the
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
const EARLY = ['leo2a2', 'leo2a3_b4', 'leo2a3'];

// 1. the specs
const spec = getSpec('leo2a3_b4'), otco = getSpec('leo2a3'), a2 = getSpec('leo2a2');
assert.equal(spec.name, 'Leopard 2A3');
assert.equal(spec.variantOf, undefined, 'no fleet parent');
assert.equal(tankDisplayName(spec), 'Leopard 2A3');
assert.equal(tankDisplayName(otco), 'Leopard 2A3 OTCO', 'the OTCO is a 2A3 variant');
assert.equal(tankDisplayName(a2), 'Leopard 2A2');
assert.deepEqual(EARLY.map(tankTier), [3, 4, 4], 'a 2A2 never above a 2A3');
for (const key of ['hp', 'enginePowerHp', 'weightTons', 'topSpeedKmh', 'reverseSpeedKmh', 'hullTraverseDegS',
  'turretTraverseDegS', 'gunPitchDegS', 'gunElevationDeg', 'gunDepressionDeg', 'role', 'era', 'nation']) {
  assert.deepEqual(spec[key], otco[key], `${key} is the 2A3's`);
}
for (const key of ['caliberMm', 'reloadS', 'baseAccuracy', 'aimTimeS', 'autoloader']) {
  assert.deepEqual(spec.gun[key], otco.gun[key], `gun.${key} is the 2A3's`);
}
assert.deepEqual(spec.gun.shells.map((s) => [s.name, s.type, s.pen100Mm, s.pen1000Mm, s.dmg, s.velocityMps]),
  otco.gun.shells.map((s) => [s.name, s.type, s.pen100Mm, s.pen1000Mm, s.dmg, s.velocityMps]), 'the 2A3\'s rounds');
const plates = (s) => [...s.armor.hullPlates, ...s.armor.turretPlates].map((p) => p.name).sort();
for (const id of EARLY) {
  const s = getSpec(id);
  assert.deepEqual(s.armor.turretPivot, [...T.pivot], `${id} turns on the construction's ring`);
  assert.deepEqual(s.armor.gunPivot, [...T.gunLocal], `${id} lays on the construction's trunnion`);
  assert.deepEqual(plates(s), plates(spec), `${id} carries the construction's plates`);
  assert.ok(s.gunPitchByYawDeg?.length, `${id} publishes its measured gunPitchByYawDeg`);
}
assert.deepEqual(getSpec('leopard2_proto').armor.turretPivot, [0, 1.72, 0.55], 'the prototype keeps its own rig');

// 2. the shared construction
const stock = (id) => {
  const tank = createTank(id, null, { ...options, quality: 'high' }), out = new Map();
  tank.root.traverse((o) => {
    if (!o.isMesh || !o.geometry || /ghillie/i.test(o.name)) return;
    if (!/^(gear|track|hull$|hullDetail$|turret$|turretDetail$)/.test(o.name)) return;
    out.set(`${o.parent?.name}/${o.name}`, [...(out.get(`${o.parent?.name}/${o.name}`) ?? []), geometryHash(o.geometry)]);
  });
  tank.dispose();
  return out;
};
const built = Object.fromEntries(EARLY.map((id) => [id, stock(id)])), base = stock('christian2');
const pick = (meshes, test) => new Map([...meshes].filter(([key]) => test(key.split('/').pop())));
const running = (name) => /^(gear|track)/.test(name);
for (const id of EARLY) {
  const own = pick(built[id], running);
  assert.ok(own.size >= 2, `${id}: the shared running gear is found (${own.size} meshes)`);
  for (const [key, hashes] of own) assert.deepEqual(base.get(key), hashes, `${id}: ${key} is the release's Leopard 2-pattern gear`);
  assert.deepEqual(pick(built[id], (n) => n === 'hull'), pick(built.leo2a3_b4, (n) => n === 'hull'), `${id}: one hull shell`);
}
assert.notDeepEqual(pick(built.leo2a3_b4, (n) => n === 'hull'), pick(base, (n) => n === 'hull'),
  'the early Leopards hang their fore skirt blocks deeper than the Christian II');
const differs = (a, b, name) => assert.notDeepEqual(pick(built[a], (n) => n === name), pick(built[b], (n) => n === name),
  `${a} and ${b} differ in ${name}`);
differs('leo2a2', 'leo2a3_b4', 'hullDetail');            // pressed louvres against the fourth batch's round rods
differs('leo2a2', 'leo2a3_b4', 'turretDetail');          // the crosswind plate, the tall radio bases, the working hatch
differs('leo2a3', 'leo2a3_b4', 'turret');                // the OTCO's side shrouds
assert.deepEqual(pick(built.leo2a3, (n) => n === 'hullDetail'), pick(built.leo2a3_b4, (n) => n === 'hullDetail'),
  'the OTCO is a fourth-batch hull');

// 3. the turret datums are the vehicle drawn
for (const id of EARLY) {
  const tank = createTank(id, null, { ...options, quality: 'high' });
  try {
    tank.root.updateMatrixWorld(true);
    const at = (name) => new THREE.Vector3().setFromMatrixPosition(tank.root.getObjectByName(name).matrixWorld);
    assert.ok(at('rig_turret').distanceTo(new THREE.Vector3(...T.pivot)) < 1e-6, `${id}: the ring stands at the datum`);
    const trunnion = new THREE.Vector3(...T.gunLocal).add(new THREE.Vector3(...T.pivot));
    assert.ok(at('rig_gun').distanceTo(trunnion) < 1e-6, `${id}: the trunnion stands at the datum`);
  } finally {
    tank.dispose();
  }
}

// 4. the guns over their hulls
for (const id of EARLY) {
  const probe = gunHullProbe(id);
  try {
    const worst = gunHullSweep(probe, probe.spec);
    console.log(`${id}: the gun's worst clearance ${(worst.d * 1000).toFixed(1)} mm at yaw ${worst.yd}, pitch ${(worst.pitch / DEG).toFixed(2)} (${worst.part})`);
    assert.ok(worst.d >= GUN_HULL_KEEP_M - 1e-4, `${id}: the main gun keeps 25 mm from its hull at every yaw (${(worst.d * 1000).toFixed(2)} mm at yaw ${worst.yd} from ${worst.part})`);
    const bare = gunHullSweep(probe, { gunDepressionDeg: probe.spec.gunDepressionDeg }, { stop: GUN_HULL_KEEP_M });
    assert.ok(bare.d < GUN_HULL_KEEP_M, `${id}: negative control: the bare -${probe.spec.gunDepressionDeg} degrees meets the hull (${(bare.d * 1000).toFixed(2)} mm)`);
  } finally {
    probe.dispose();
  }
}
console.log('leopard2a3B4.selftest: the early Leopard 2s\' specs and tiers, the shared construction and its batches, the datums drawn, the guns clear of their hulls PASS');
