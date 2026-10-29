import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { TANK_SPECS } from '../specs.ts';

// Release 263 (owner 2026-10-28: a Leopard 1 on the old hull, then "completely redesign this current leopard. it needs to
// take a lot more inspo from that 1a2, from the chevron mantlet that joins at a line, the turret that is a lot better and
// not just a torus, the boxes, smoke canisters, tech etc"): the 1A5's pre-262 hull under the Munster Leopard 1A2A1's
// bare casting, chevron mantlet and PERI R12; references in docs/references/tanks/leo1a2a1.md.
const visual = createTank('leo1a2a1', null, {
  proceduralOnly: true,
  geometryReceipt: true,
});
visual.root.updateMatrixWorld(true);

const hullRig = visual.root.getObjectByName('rig_hull');
const turretRig = visual.root.getObjectByName('rig_turret');
const gunRig = visual.root.getObjectByName('rig_gun');
assert.ok(hullRig && turretRig && gunRig, 'Leopard 1A2A1 keeps the canonical three-part rig');
assert.equal(TANK_SPECS.leo1a2a1.name, 'Leopard 1A2A1');
assert.equal(TANK_SPECS.leo1a2a1.variantOf, 'leo1a5', 'the 1A2A1 clones the 1A5\'s gun and hull armour');

const mesh = (name) => {
  const found = visual.root.getObjectByName(name);
  assert.ok(found?.isMesh, `Leopard 1A2A1 has merged ${name} geometry`);
  return found;
};
const bounds = (object) => new THREE.Box3().setFromObject(object);
const near = (actual, expected, tolerance, label) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label} (${actual} vs ${expected} ±${tolerance})`);
const down = (object, x, z) => new THREE.Raycaster(new THREE.Vector3(x, 6, z), new THREE.Vector3(0, -1, 0), 0, 7)
  .intersectObject(object, false)[0]?.point.y;

// The old hull, as the 1A5 stood at 0a3d073341: its deck crown (1.60 at the break, 1.77 behind the ring, flat 1.75 under
// the sweep, 1.82 at the stern), its fender shelf and its lifted terminal drums.
const finish = hullRig.userData.leopard1A2A1FinishReceipt;
assert.equal(finish?.revision, 'leo1a2a1-263-old-hull');
assert.equal(finish.oldHullFrom, '0a3d073341');
const hull = mesh('hull');
near(down(hull, 0, -1.25), 1.77, 0.01, 'deck crown behind the ring');
near(down(hull, 0, -2.00), 1.75, 0.01, 'flat engine deck under the turret sweep');
near(down(hull, 0, -3.30), 1.82, 0.01, 'stern deck crown');
near(finish.fenderShelfTopY, 1.3175, 1e-9, 'the continuous fender shelf');
assert.equal(hullRig.userData.nativeRoadWheelStations, 7, 'seven native road-wheel stations');
const gear = hullRig.userData.runningGearReceipts?.[0];
assert.ok(gear, 'Leopard 1A2A1 publishes its native running-gear receipt');
assert.deepEqual(gear.wheelZs, [2.52, 1.78, 1.04, 0.30, -0.44, -1.18, -1.92], 'the old hull\'s seven stations');
assert.deepEqual(gear.idler, { z: 3.17, y: 0.79, r: 0.29 }, 'the old hull\'s lifted idler');
assert.deepEqual(gear.sprocket, { z: -2.70, y: 0.84, r: 0.30 }, 'the old hull\'s lifted sprocket');

// The bare 1A2 casting: no appliqué; an undercut lower face out to a hard horizontal chine and a broad upper face leaning
// in to a flat roof 0.81 m over the ring.
const turretFinish = turretRig.userData.leopard1A2A1TurretFinishReceipt;
assert.equal(turretFinish?.revision, 'leo1a2a1-263-cast-1a2');
assert.ok(turretFinish.castTurret && turretFinish.chineCasting && turretFinish.blohmVossApplique === false);
const turret = mesh('turret');
const tBox = bounds(turret);
near(tBox.max.y - turretRig.position.y, 0.81, 0.01, 'the casting\'s roof over the ring');
assert.ok(tBox.max.x - tBox.min.x <= 2.70 && tBox.max.x - tBox.min.x >= 2.30,
  `the casting and its rangefinder drums span a Leopard 1 turret (${tBox.max.x - tBox.min.x})`);
const sideAt = (y, z = 0.10) => new THREE.Raycaster(new THREE.Vector3(3, turretRig.position.y + y, turretRig.position.z + z),
  new THREE.Vector3(-1, 0, 0), 0, 3).intersectObject(turret, false)[0]?.point.x;
// The chine: the side reaches furthest out at the chine. Below it the undercut falls away steeply; above it the cast cheek
// rises nearly upright before rolling over, so the section breaks at a hard kink, not a rolled egg.
const [chineLow, chineHigh] = turretFinish.chineYRange;
const chineY = (chineLow + chineHigh) / 2;
const atChine = sideAt(0.33), below = sideAt(0.20), above = sideAt(0.46);
assert.ok([atChine, below, above].every(Number.isFinite), `the casting side is hit about the chine (${below}, ${atChine}, ${above})`);
const lowerRun = (atChine - below) / 0.13, upperRun = (atChine - above) / 0.13;
assert.ok(atChine >= above - 1e-6 && lowerRun > 0.6 && lowerRun - upperRun > 0.5,
  `the side breaks at a hard chine ${chineY.toFixed(2)} m over the ring (${below}, ${atChine}, ${above})`);
// The chevron front: either side of the mantlet the casting's upper and lower faces close on the chine's line, so a ray
// from ahead meets the casting furthest forward at the chine's height and further back above and below it.
const frontAt = (y, x = 0.62) => new THREE.Raycaster(new THREE.Vector3(x, turretRig.position.y + y, 6), new THREE.Vector3(0, 0, -1), 0, 6)
  .intersectObject(turret, false)[0]?.point.z;
const front = { chine: frontAt(0.38), high: frontAt(0.64), low: frontAt(0.16) };
assert.ok(front.chine > front.high + 0.12 && front.chine > front.low + 0.10,
  `the casting's front is a chevron in profile ending in a line at the gun's height (${JSON.stringify(front)})`);
// The casting stands over the old hull's deck crown at every bearing outside its ring bearing: the deck rises from
// 1.694 m at the ring (0.50 m ahead of the origin) to 1.77 m 1.75 m behind it, so each turret point must stand over the
// highest deck within its own radius.
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
// The TEM 2A rangefinder's two windows look forward from their drums on the upper cheeks.
assert.equal(turretFinish.rangefinderWindows?.length, 2, 'two rangefinder windows');
for (const [x, y, z] of turretFinish.rangefinderWindows) {
  const from = new THREE.Vector3(x, y, z + 5).applyMatrix4(turretRig.matrixWorld);
  const hit = new THREE.Raycaster(from, new THREE.Vector3(0, 0, -1), 0, 6).intersectObject(turretRig, true)[0];
  assert.ok(hit && /Glass/.test(hit.object.name), `the ${x < 0 ? 'left' : 'right'} rangefinder window faces forward (${hit?.object.name})`);
}
// The kit: eight dischargers at the front corners, the PERI R12 standing over the right front roof, the loader's MG3.
assert.equal(turretFinish.frontCornerDischargers, 8);
const [periX, periZ] = turretFinish.periR12;
const periTop = down(mesh('turretEquipment'), turretRig.position.x + periX, turretRig.position.z + periZ);
assert.ok(periTop > turretRig.position.y + 0.81 + 0.40, `the PERI R12 head stands over the roof (${periTop})`);
let pintleMgs = 0;
turretRig.traverse((node) => {
  if (node.userData?.fittingRoot && node.userData.fitting === 'pintleMG') pintleMgs += 1;
});
assert.equal(pintleMgs, 1, 'the loader\'s MG3 is the turret\'s one pintle gun');

// The chevron mantlet: owned by the gun, a block 1 m wide whose brow and chin meet at a horizontal line on the gun's axis.
assert.ok(gunRig.position.distanceTo(new THREE.Vector3(0, 0.40, 1.00)) < 1e-8, 'the trunnion station');
const mantlet = gunRig.userData.leopard1A2A1MantletReceipt;
assert.ok(mantlet?.seated && mantlet.chevronProfile && mantlet.ridgeOnGunAxis, 'the gun carries the chevron mantlet');
assert.ok(mantlet.mantletWidth >= 0.95 && mantlet.ridgeHalfHeight <= 0.04,
  `a broad mantlet closing on a line (${mantlet.mantletWidth} wide, ridge ±${mantlet.ridgeHalfHeight})`);
const mount = mesh('gunMount');
const mantletAt = (y) => new THREE.Raycaster(new THREE.Vector3(0.36, gunRig.getWorldPosition(new THREE.Vector3()).y + y, 6),
  new THREE.Vector3(0, 0, -1), 0, 6).intersectObject(mount, false)[0]?.point.z;
assert.ok(mantletAt(0) > mantletAt(0.22) + 0.15 && mantletAt(0) > mantletAt(-0.20) + 0.15,
  `the mantlet's brow and chin fall back from its ridge (${mantletAt(0.22)}, ${mantletAt(0)}, ${mantletAt(-0.20)})`);
mesh('turretCupola');

console.log('leopard1A2A1Source.selftest: old hull datums, the 1A2 chine casting and chevron front clear of the deck, rangefinder windows, PERI, chevron mantlet pass');
