import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { TANK_SPECS } from '../specs.ts';

// Release 263 (owner 2026-10-28: "make one that uses the old hull and has like a rounder 'unarmored' version that looks
// more like the world of tanks leopard 1 ... need it to look accurate"): the 1A5's pre-262 hull under the bare cast
// turret of the first series; references in docs/references/tanks/leo1a1.md.
const visual = createTank('leo1a1', null, {
  proceduralOnly: true,
  geometryReceipt: true,
});
visual.root.updateMatrixWorld(true);

const hullRig = visual.root.getObjectByName('rig_hull');
const turretRig = visual.root.getObjectByName('rig_turret');
const gunRig = visual.root.getObjectByName('rig_gun');
assert.ok(hullRig && turretRig && gunRig, 'Leopard 1A1 keeps the canonical three-part rig');
assert.equal(TANK_SPECS.leo1a1.name, 'Leopard 1A1');
assert.equal(TANK_SPECS.leo1a1.variantOf, 'leo1a5', 'the 1A1 clones the 1A5\'s gun and hull armour');

const mesh = (name) => {
  const found = visual.root.getObjectByName(name);
  assert.ok(found?.isMesh, `Leopard 1A1 has merged ${name} geometry`);
  return found;
};
const bounds = (object) => new THREE.Box3().setFromObject(object);
const near = (actual, expected, tolerance, label) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label} (${actual} vs ${expected} ±${tolerance})`);
const down = (object, x, z) => new THREE.Raycaster(new THREE.Vector3(x, 6, z), new THREE.Vector3(0, -1, 0), 0, 7)
  .intersectObject(object, false)[0]?.point.y;

// The old hull, as the 1A5 stood at 0a3d073341: its deck crown (1.60 at the break, 1.77 behind the ring, flat 1.75 under
// the sweep, 1.82 at the stern), its fender shelf and its lifted terminal drums.
const finish = hullRig.userData.leopard1A1FinishReceipt;
assert.equal(finish?.revision, 'leo1a1-263-old-hull');
assert.equal(finish.oldHullFrom, '0a3d073341');
const hull = mesh('hull');
near(down(hull, 0, -1.25), 1.77, 0.01, 'deck crown behind the ring');
near(down(hull, 0, -2.00), 1.75, 0.01, 'flat engine deck under the turret sweep');
near(down(hull, 0, -3.30), 1.82, 0.01, 'stern deck crown');
near(finish.fenderShelfTopY, 1.3175, 1e-9, 'the continuous fender shelf');
assert.equal(hullRig.userData.nativeRoadWheelStations, 7, 'seven native road-wheel stations');
const gear = hullRig.userData.runningGearReceipts?.[0];
assert.ok(gear, 'Leopard 1A1 publishes its native running-gear receipt');
assert.deepEqual(gear.wheelZs, [2.52, 1.78, 1.04, 0.30, -0.44, -1.18, -1.92], 'the old hull\'s seven stations');
assert.deepEqual(gear.idler, { z: 3.17, y: 0.79, r: 0.29 }, 'the old hull\'s lifted idler');
assert.deepEqual(gear.sprocket, { z: -2.70, y: 0.84, r: 0.30 }, 'the old hull\'s lifted sprocket');

// The bare cast turret: no appliqué, a casting that rounds off in every section and stands 0.81 m over its ring.
const turretFinish = turretRig.userData.leopard1A1TurretFinishReceipt;
assert.equal(turretFinish?.revision, 'leo1a1-263-cast');
assert.ok(turretFinish.castTurret && turretFinish.roundedCasting && turretFinish.blohmVossApplique === false);
const turret = mesh('turret');
const tBox = bounds(turret);
near(tBox.max.y - turretRig.position.y, 0.81, 0.01, 'the casting\'s roof over the ring');
assert.ok(tBox.max.x - tBox.min.x <= 2.70 && tBox.max.x - tBox.min.x >= 2.30,
  `the casting and its rangefinder housings span a Leopard 1 turret (${tBox.max.x - tBox.min.x})`);
const sideAt = (y, z = 0.06) => new THREE.Raycaster(new THREE.Vector3(3, turretRig.position.y + y, turretRig.position.z + z),
  new THREE.Vector3(-1, 0, 0), 0, 3).intersectObject(turret, false)[0]?.point.x;
// Rounded, not chevroned: the side's outward reach falls smoothly from its low widest point to the roof with no ridge
// (every second difference on an even height step is concave).
const heights = [0.20, 0.32, 0.44, 0.56, 0.66, 0.74];
const reach = heights.map((y) => sideAt(y));
// (the ring seat trims the turret to its combat floor, so the foot is read 2 cm over the seated underside)
const footY = tBox.min.y - turretRig.position.y + 0.02;
assert.ok(sideAt(footY) < reach[0] - 0.05, `the casting's foot tucks in under its widest point (${sideAt(footY)}, ${reach[0]})`);
assert.ok(reach.every(Number.isFinite), `the casting side is hit at every height (${reach})`);
for (let i = 1; i < reach.length; i++) assert.ok(reach[i] <= reach[i - 1] + 1e-6, `the side rolls inward above its widest point (${reach})`);
for (let i = 1; i < 4; i++) {
  assert.ok(reach[i + 1] - 2 * reach[i] + reach[i - 1] <= 1e-3, `no ridge or chevron in the casting's side (${reach})`);
}
// Outside its ring bearing the casting clears the old hull's deck crown at every bearing: the deck rises from 1.694 m at
// the ring (0.50 m ahead of the origin) to 1.77 m 1.75 m behind it, so each turret point must stand over the highest deck
// within its own radius.
const deckWithin = (r) => (r >= 1.75 ? 1.77 : 1.77 - (1.77 - 1.60) / (2.674 + 1.25) * (1.75 - r));
const pos = turret.geometry.getAttribute('position');
const v = new THREE.Vector3();
let worstMargin = Infinity;
for (let i = 0; i < pos.count; i++) {
  v.fromBufferAttribute(pos, i);
  const r = Math.hypot(v.x, v.z);
  if (r >= 1.045) worstMargin = Math.min(worstMargin, turretRig.position.y + v.y - deckWithin(r));
}
assert.ok(worstMargin > 0.004, `the casting clears the deck crown at every bearing (worst margin ${worstMargin} m)`);
// The TEM 2A rangefinder's two windows look forward from their housings on the front cheeks.
assert.equal(turretFinish.rangefinderWindows?.length, 2, 'two rangefinder windows');
for (const [x, y, z] of turretFinish.rangefinderWindows) {
  const from = new THREE.Vector3(x, y, z + 5).applyMatrix4(turretRig.matrixWorld);
  const hit = new THREE.Raycaster(from, new THREE.Vector3(0, 0, -1), 0, 6).intersectObject(turretRig, true)[0];
  assert.ok(hit && /Glass/.test(hit.object.name), `the ${x < 0 ? 'left' : 'right'} rangefinder window faces forward (${hit?.object.name})`);
}
let pintleMgs = 0;
let stowageRacks = 0;
turretRig.traverse((node) => {
  if (node.userData?.fittingRoot && node.userData.fitting === 'pintleMG') pintleMgs += 1;
  if (node.userData?.fittingRoot && node.userData.fitting === 'stowageRack') stowageRacks += 1;
});
assert.equal(pintleMgs, 1, 'the loader\'s MG3 is the turret\'s one pintle gun');
assert.equal(stowageRacks, 2, 'a stowage rack on each side of the bustle');

// The cast bell mantlet: owned by the gun, as wide as the nose at its root, the L7A3 leaving it through a collar.
assert.ok(gunRig.position.distanceTo(new THREE.Vector3(0, 0.40, 1.00)) < 1e-8, 'the trunnion station');
const mantlet = gunRig.userData.leopard1A1MantletReceipt;
assert.ok(mantlet?.seated && mantlet.castBell, 'the gun carries the cast bell mantlet');
assert.ok(mantlet.bellRootWidth >= 0.85, `the bell's root spans the casting's nose (${mantlet.bellRootWidth})`);
const mount = bounds(mesh('gunMount'));
assert.ok(mount.min.z < tBox.max.z && mount.max.z > turretRig.position.z + 1.45,
  'the bell runs from inside the nose well ahead of the casting');
mesh('turretCupola');

console.log('leopard1A1Source.selftest: old hull datums, rounded bare casting clear of the deck, rangefinder windows, bell mantlet pass');
