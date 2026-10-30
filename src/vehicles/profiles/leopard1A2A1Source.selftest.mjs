import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { TANK_SPECS } from '../specs.ts';

// Release 263 (owner 2026-10-28: a Leopard 1 on the old hull; then "make it based off the 1a5 more with a slightly rounded
// corners and the correct mantlet ... that ends in a line"): the 1A5's pre-262 hull under the 262 Leopard 1A5's turret
// lines cast as one with rounded corners, the chevron mask closing to a line, and the Munster 1A2A1's PERI R12;
// references in docs/references/tanks/leo1a2a1.md.
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

// The 1A5's lines cast as one: the chevron core, side plates and wedges, their ridges and roof edges rounded, no bolts.
const turretFinish = turretRig.userData.leopard1A2A1TurretFinishReceipt;
assert.equal(turretFinish?.revision, 'leo1a2a1-263-1a5-lines');
assert.ok(turretFinish.castTurret && turretFinish.leopard1A5Lines && turretFinish.roundedCorners && turretFinish.boltedPlates === false);
const turret = mesh('turret');
const tBox = bounds(turret);
near(tBox.max.y - turretRig.position.y, 0.79, 0.01, 'the casting\'s roof over the ring');
assert.ok(tBox.max.x - tBox.min.x <= 2.72, `no wider than its ridges (${tBox.max.x - tBox.min.x})`);
const sideAt = (y, z = -0.40) => new THREE.Raycaster(new THREE.Vector3(3, turretRig.position.y + y, turretRig.position.z + z),
  new THREE.Vector3(-1, 0, 0), 0, 3).intersectObject(turret, false)[0]?.point.x;
// The 1A5's chevron along the side: the plate bends outward at its ridge 0.30 m up, the faces leaning in above and below.
assert.ok(sideAt(0.30) > sideAt(0.10) + 0.05 && sideAt(0.30) > sideAt(0.60) + 0.10,
  `the side bends outward at its ridge (${sideAt(0.10)}, ${sideAt(0.30)}, ${sideAt(0.60)})`);
// Slightly rounded, not knife-edged: the ridge's very corner is cut back a little from the two faces' meeting point.
const ridgeHalf = turretFinish.ridgeHalfWidth;
assert.ok(sideAt(0.30) < ridgeHalf - 0.003 && sideAt(0.30) > ridgeHalf - 0.04,
  `the ridge is rounded a few centimetres (${sideAt(0.30)} against a ${ridgeHalf} corner)`);
// The wedges carry the ridge forward either side of the mask and close on it, so a ray from ahead meets each wedge
// furthest forward at the ridge's height.
const frontAt = (y, x = 0.80) => new THREE.Raycaster(new THREE.Vector3(x, turretRig.position.y + y, 6), new THREE.Vector3(0, 0, -1), 0, 6)
  .intersectObject(turret, false)[0]?.point.z;
const front = { ridge: frontAt(0.30), high: frontAt(0.62), low: frontAt(0.12) };
assert.ok(front.ridge > front.high + 0.10 && front.ridge > front.low + 0.03,
  `the wedge's front closes on its ridge line (${JSON.stringify(front)})`);
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
// The kit: the PERI R12 standing over the right front roof, the 1A5's rear dischargers, the loader's MG3, two racks.
assert.equal(turretFinish.rearDischargers, 8);
const [periX, periZ] = turretFinish.periR12;
assert.ok(periX < 0, `the PERI R12 and the commander stand on the hull's right, -x (${periX})`);
const periTop = down(mesh('turretEquipment'), turretRig.position.x + periX, turretRig.position.z + periZ);
assert.ok(periTop > turretRig.position.y + 0.79 + 0.40, `the PERI R12 head stands over the roof (${periTop})`);
let pintleMgs = 0;
let stowageRacks = 0;
turretRig.traverse((node) => {
  if (node.userData?.fittingRoot && node.userData.fitting === 'pintleMG') pintleMgs += 1;
  if (node.userData?.fittingRoot && node.userData.fitting === 'stowageRack') stowageRacks += 1;
});
assert.equal(pintleMgs, 1, 'the loader\'s MG3 is the turret\'s one pintle gun');
assert.equal(stowageRacks, 0, 'no flank racks: the kit rides in the closed stowage bin on the casting\'s tail (265)');

// The mantlet (owner: "the correct mantlet ... that ends in a line"): owned by the gun, the 1A5's wide chevron mask whose
// brow and chin meet in a horizontal line at the gun.
assert.ok(gunRig.position.distanceTo(new THREE.Vector3(0, 0.40, 1.15)) < 1e-8, 'the trunnion station');
const mantlet = gunRig.userData.leopard1A2A1MantletReceipt;
assert.ok(mantlet?.seated && mantlet.chevronProfile && mantlet.endsInLine, 'the gun carries the chevron mask');
assert.ok(mantlet.maskWidth >= 1.2 && mantlet.maskRidgeHalfHeight <= 0.025,
  `a wide mask closing on a line (${mantlet.maskWidth} wide, ridge ±${mantlet.maskRidgeHalfHeight})`);
const mount = mesh('gunMount');
const gunY = gunRig.getWorldPosition(new THREE.Vector3()).y;
const maskAt = (y) => new THREE.Raycaster(new THREE.Vector3(0.40, gunY + y, 6), new THREE.Vector3(0, 0, -1), 0, 6)
  .intersectObject(mount, false)[0]?.point.z;
assert.ok(maskAt(0) > maskAt(0.24) + 0.15 && maskAt(0) > maskAt(-0.22) + 0.15,
  `the brow and chin fall back from the line (${maskAt(0.24)}, ${maskAt(0)}, ${maskAt(-0.22)})`);
const receiver = new THREE.Box3(
  new THREE.Vector3(-mantlet.receiverWidth / 2, mantlet.receiverY - 0.30, mantlet.receiverZ - 0.08),
  new THREE.Vector3(mantlet.receiverWidth / 2, mantlet.receiverY + 0.30, mantlet.receiverZ + 0.08),
);
for (const pitchDeg of [-9, 0, 20]) {
  gunRig.rotation.x = -THREE.MathUtils.degToRad(pitchDeg);
  const contact = new THREE.Vector3(0, 0, mantlet.rearContactZ).applyEuler(gunRig.rotation).add(gunRig.position);
  assert.ok(receiver.containsPoint(contact), `the mask's rear pad stays inside the turret receiver at ${pitchDeg} degrees`);
}
gunRig.rotation.x = 0;
visual.root.updateMatrixWorld(true);
mesh('turretCupola');

console.log('leopard1A2A1Source.selftest: old hull datums, the 1A5 lines cast with rounded corners clear of the deck, PERI, a mask ending in a line pass');
