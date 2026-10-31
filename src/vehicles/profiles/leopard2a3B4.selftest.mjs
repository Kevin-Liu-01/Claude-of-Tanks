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
//     bare -9 degrees the gun meets the hull;
//  5. the OTCO's rim, shrouds and caps are equipment, not armour (Main 2026-10-28: "Two tier IV tanks with identical
//     combat data should be identical targets"): its turret anatomy (the box, the collision slabs, the ring's race, the
//     crew seats and every turret plate) is the 2A3's; negative control: the kit is built, standing out past the 2A3's walls;
//  6. the turret front (the owner, 2026-10-28: "the real leopards of these have cutouts in the front of turret for a window
//     thing"): a frontal round through the EMES 15's notch meets the notch's own plate first, with the sight head's and
//     the block's line-of-sight protection, not the cheek's; under the sill and at the mirror point on the left cheek it
//     meets the cheek.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { COMBAT_ANATOMY_CALIBRATIONS } from '../combatAnatomyCalibrations.ts';
import { tankTier } from '../tier.ts';
import { tankDisplayName } from '../tankLabels.ts';
import { geometryHash } from '../../../tools/receipt-kit.test-support.mjs';
import { LEO2A3B4_TURRET as T, LEO2A3B4_PROTECTION } from '../leopard2a3B4Armor.ts';
import { tankPoseFromState, traceTank } from '../../sim/armor.ts';
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
    if (!/^(gear|track|hull$|hullDetail$|turret$|turretDetail$|turretEquipment$)/.test(o.name)) return;
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
differs('leo2a3', 'leo2a3_b4', 'turretEquipment');       // the OTCO's rim, shrouds and caps
// (the authored parts: the turret seat lifts each underside by its own hull's swept tops, the OTCO's stern load among them)
const turretParts = (id) => {
  const tank = createTank(id, null, { ...options, quality: 'high' });
  const rows = (tank.root.userData.combatGeometryParts || []).filter((p) => p.bucket === 'turret')
    .map((p) => JSON.stringify([p.min, p.max])).sort();
  tank.dispose();
  return rows;
};
assert.deepEqual(turretParts('leo2a3'), turretParts('leo2a3_b4'), 'the OTCO\'s armoured turret is the 2A3\'s');
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
// 5. the OTCO's turret anatomy is the 2A3's
const anatomy = (id) => {
  const c = COMBAT_ANATOMY_CALIBRATIONS[id];
  assert.ok(c, `${id}: a committed anatomy calibration`);
  // the ring's anatomy (its race, deck, well and floor); its footR is a coverage receipt of every turret mesh over the
  // deck with no reader beyond capping the race, which the rim covers further out by design
  const { seat, deckY, rimR, skirt, floorY, wellR, skinR } = c.turretRing;
  return { box: [c.turret.min, c.turret.max, c.turret.bodyRoofY], collision: c.turretCollision,
    ring: { seat, deckY, rimR, skirt, floorY, wellR, skinR }, seats: c.crewSeats, plates: getSpec(id).armor.turretPlates };
};
const otcoAnatomy = anatomy('leo2a3'), a3Anatomy = anatomy('leo2a3_b4');
// to 2 mm: the seat lifts each turret's underside by its own hull's swept tops (the OTCO's stern load a few mm higher)
const near = (a, b) => (Array.isArray(a) ? Array.isArray(b) && a.length === b.length && a.every((v, i) => near(v, b[i]))
  : typeof a === 'number' ? typeof b === 'number' && Math.abs(a - b) <= 0.002
    : a && typeof a === 'object' ? !!b && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => near(a[k], b[k]))
      : a === b);
for (const key of Object.keys(a3Anatomy)) {
  if (key !== 'collision') assert.ok(near(otcoAnatomy[key], a3Anatomy[key]), `the OTCO's turret ${key} is the 2A3's`);
}
// the collision cells as solids: each cell's corners stand no further outside its twin's faces than the plate-fitted
// cell's own 15 mm tolerance (the cells are cut from point clouds the seat moves by millimetres)
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const planes = (cell) => {
  const mid = cell.vertices.reduce((m, v) => m.map((x, i) => x + v[i] / cell.vertices.length), [0, 0, 0]);
  return cell.faces.map(([i, j, k]) => {
    const a = cell.vertices[i], u = sub(cell.vertices[j], a), w = sub(cell.vertices[k], a);
    let n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const l = Math.hypot(...n);
    if (l < 1e-12) return null;
    n = n.map((x) => x / l);
    if (dot(n, sub(mid, a)) > 0) n = n.map((x) => -x);
    return [n, -dot(n, a)];
  }).filter(Boolean);
};
const outside = (A, B) => Math.max(0, ...A.vertices.map((v) => Math.max(...planes(B).map(([n, k]) => dot(n, v) + k))));
assert.equal(otcoAnatomy.collision.length, a3Anatomy.collision.length, 'the OTCO\'s turret cells are the 2A3\'s');
otcoAnatomy.collision.forEach((cell, i) => {
  const twin = a3Anatomy.collision[i], d = Math.max(outside(cell, twin), outside(twin, cell));
  assert.ok(d <= 0.015, `the OTCO's turret cell ${i} is the 2A3's (${(d * 1000).toFixed(1)} mm apart)`);
});
{
  const tank = createTank('leo2a3', null, { ...options, quality: 'high' });
  try {
    const kit = tank.root.getObjectByName('turretEquipment');
    assert.ok(kit?.geometry, 'negative control: the OTCO builds its rim and shrouds');
    kit.geometry.computeBoundingBox();
    const reach = Math.max(-kit.geometry.boundingBox.min.x, kit.geometry.boundingBox.max.x);
    assert.ok(reach > a3Anatomy.box[1][0] + 0.10, `negative control: the rim stands ${(reach - a3Anatomy.box[1][0]).toFixed(2)} m past the 2A3's walls`);
  } finally {
    tank.dispose();
  }
}
// 6. the turret front's weak spot
const pose = tankPoseFromState({ pos: new THREE.Vector3(), yaw: 0, visualPitch: 0, visualRoll: 0, turretYaw: 0, gunPitch: 0 });
const firstPlate = (id, x, yLocal) => {
  const y = T.pivot[1] + yLocal;
  const hit = traceTank(new THREE.Vector3(x, y, 30), new THREE.Vector3(x, y, -30), pose, getSpec(id).armor).find((h) => h.kind === 'plate');
  return hit ?? null;
};
const notchX = -(T.sightInnerX + T.sightOuterX) / 2, notchY = (T.sightSillY + T.sightLintelY) / 2;
for (const id of EARLY) {
  const notch = firstPlate(id, notchX, notchY), plate = notch?.plate;
  assert.equal(plate?.name, 'turret_front_sight_notch', `${id}: a frontal round through the sight's notch meets the notch (${plate?.name})`);
  assert.equal(plate.moduleLink, 'optics', `${id}: and the sight behind it`);
  const cheek = getSpec(id).armor.turretPlates.find((p) => p.name === 'turret_cheek_L');
  const los = plate.keMm / Math.cos(notch.impactAngleDeg * Math.PI / 180);
  const trim = cheek.keMm / LEO2A3B4_PROTECTION.cheek.ke;
  assert.ok(Math.abs(los - LEO2A3B4_PROTECTION.sightNotch.ke * trim) < 12,
    `${id}: the notch's line of sight is the sight head's and the block's (${los.toFixed(0)} mm KE against the cheek's ${cheek.keMm})`);
  assert.equal(firstPlate(id, notchX, T.sightSillY - 0.15)?.plate.name, 'turret_cheek_L', `${id}: under the sill the cheek`);
  assert.equal(firstPlate(id, -notchX, notchY)?.plate.name, 'turret_cheek_R', `${id}: the left cheek has no notch`);
}
console.log('leopard2a3B4.selftest: the early Leopard 2s\' specs and tiers, the shared construction and its batches, the datums drawn, the guns clear of their hulls, the OTCO\'s kit outside its armour, the sight notch the turret front\'s weak spot PASS');
