import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';

// Release 262 proportion rebuild (owner 2026-10-27: "based on proper historical referrences so they will no longer look
// so chungus"). The datums are the Panzermuseum Munster Leopard 1 A5: its data placard (9.54 m, 3.25 m over the
// tracks, 2.71 m) and its side, front and quarter photos; the gap table is in docs/references/tanks/leo1a5.md.
const visual = createTank('leo1a5', null, {
  proceduralOnly: true,
  geometryReceipt: true,
});
visual.root.updateMatrixWorld(true);

const hullRig = visual.root.getObjectByName('rig_hull');
const turretRig = visual.root.getObjectByName('rig_turret');
const gunRig = visual.root.getObjectByName('rig_gun');
assert.ok(hullRig && turretRig && gunRig, 'Leopard 1A5 keeps the canonical three-part rig');

const mesh = (name) => {
  const found = visual.root.getObjectByName(name);
  assert.ok(found?.isMesh, `Leopard 1A5 has merged ${name} geometry`);
  return found;
};
const bounds = (object) => new THREE.Box3().setFromObject(object);
const near = (actual, expected, tolerance, label) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label} (${actual} vs ${expected} ±${tolerance})`);
const down = (object, x, z) => new THREE.Raycaster(new THREE.Vector3(x, 6, z), new THREE.Vector3(0, -1, 0), 0, 7)
  .intersectObject(object, false)[0]?.point.y;

// Envelope: the source hull length and the L7A3's overall length hold; the hull and tracks narrow to the published
// widths (3.25 m over the tracks, 3.37 m over the skirts).
const hull = bounds(mesh('hull'));
near(hull.max.z - hull.min.z, 7.085, 0.04, 'source-length hull retained');
near(hull.max.x - hull.min.x, 3.32, 0.02, 'the sloped upper hull stands on the fenders at ±1.66');
near(hull.min.y, 0.44, 0.005, 'the belly keeps the published 0.44 m ground clearance');
const root = bounds(visual.root);
near(root.max.z - root.min.z, 9.59, 0.08, 'L7A3 overall envelope retained');

// Heights: the deck at 1.58 under the turret's sweep and 1.64 at the stern, a flat cast-turret roof at 2.39.
near(down(mesh('hull'), 0, 0.50), 1.58, 0.012, 'deck at the turret ring');
near(down(mesh('hull'), 0, -3.30), 1.64, 0.015, 'stern deck');
const turretRoof = down(mesh('turret'), 0, 0.10);
near(turretRoof, 2.39, 0.012, 'flat cast-turret roof at the published 2.39 m');
near(turretRoof - down(mesh('hull'), 0, 0.50), 0.81, 0.04, 'the turret stands 0.8 m over the deck');

// One native seven-wheel course per side on the published track centres.
assert.equal(hullRig.userData.nativeRoadWheelStations, 7, 'Leopard 1A5 retains seven native road-wheel stations');
const finish = hullRig.userData.leopard1A5FinishReceipt;
assert.equal(finish?.revision, 'leo1a5-262-proportions');
near(finish.trackOuterEdgeX * 2, 3.25, 0.002, 'tracks span the published 3.25 m');
near(finish.skirtOuterX * 2, 3.37, 0.003, 'skirts span the published 3.37 m');
assert.ok(finish.skirtHemY > 0.37 + 0.34 && finish.skirtHemY < finish.trackTopSupportY,
  'the skirt hem rides over the road-wheel tops and covers the return run');
assert.ok(finish.trackTopSupportY + finish.trackThickness / 2 < finish.fenderY - 0.05,
  'the return run passes under the fender shelf with clearance');
assert.ok(finish.slopedUpperSides && finish.sponsonX > finish.deckEdgeX + 0.3,
  'the upper hull sides slope from the fender in to the deck edge');
const gear = hullRig.userData.runningGearReceipts?.[0];
assert.ok(gear, 'Leopard 1A5 publishes its native running-gear receipt');
assert.ok(Math.abs(gear.wheelY - (gear.botY + gear.trackTh / 2 + gear.wheelR)) < 1e-9,
  'the seven road-wheel centers rest one radius above the band face (ground-datum seat, 2026-09-17)');
assert.deepEqual(gear.wheelZs, [2.52, 1.78, 1.04, 0.30, -0.44, -1.18, -1.92],
  'the seven road wheels keep the source stations on the 0.74 m pitch');
assert.equal(gear.wheelR, 0.34);
assert.deepEqual(gear.idler, { z: 3.17, y: 0.66, r: 0.28 }, 'the front idler sits just over the wheel line');
assert.deepEqual(gear.sprocket, { z: -2.70, y: 0.73, r: 0.29 }, 'the rear sprocket stands under the fender');
const trackBands = [];
visual.root.traverse((node) => {
  if (node.userData?.appearanceRole === 'trackBand') trackBands.push(node);
});
assert.equal(trackBands.length, 2, 'exactly one linked track band is present per side');
for (const band of trackBands) {
  const box = bounds(band);
  assert.ok(box.max.y < finish.fenderY && box.min.y >= 0.01,
    `${band.name} runs under the fender shelf (${box.max.y})`);
  assert.ok(box.max.x - box.min.x >= 0.545, `${band.name} uses the 550 mm tread`);
}

// The cast 1A1A1 turret with the Blohm & Voss appliqué (the German 1A5's; the welded turret is the A3/A4's): a
// flat-roofed casting, the wedge plates ahead of it either side of the mantlet and the side plates behind them.
const turretFinish = turretRig.userData.leopard1A5TurretFinishReceipt;
assert.equal(turretFinish?.revision, 'leo1a5-262-cast-bv');
assert.ok(turretFinish.castTurret && turretFinish.blohmVossWedge && turretFinish.blohmVossSidePlates);
const turret = bounds(mesh('turret'));
assert.ok(turret.max.x - turret.min.x <= 2.70, `the turret is no wider than its chevron ridges (${turret.max.x - turret.min.x})`);
// Owner 2026-10-27 ("much better sloping ... the chevron the wrong way ... more angular instead of boxy"): the plates and
// the casting are horizontal chevrons, the ridge 0.30 m over the turret floor with the faces leaning in above and below.
const sideAt = (y) => new THREE.Raycaster(new THREE.Vector3(3, turretRig.position.y + y, turretRig.position.z - 0.40),
  new THREE.Vector3(-1, 0, 0), 0, 3).intersectObject(mesh('turret'), false)[0]?.point.x;
assert.ok(sideAt(0.30) > sideAt(0.10) + 0.05 && sideAt(0.30) > sideAt(0.60) + 0.10,
  `the side plate bends outward at its ridge (${sideAt(0.10)}, ${sideAt(0.30)}, ${sideAt(0.60)})`);
assert.ok(turret.max.z > turretRig.position.z + 1.30,
  'the B&V wedge plates stand ahead of the casting either side of the mantlet');
for (const x of [-1.25, 1.25]) {
  assert.ok(new THREE.Raycaster(new THREE.Vector3(x * 2, turretRig.position.y + 0.40, turretRig.position.z - 0.40),
    new THREE.Vector3(-Math.sign(x), 0, 0), 0, 3).intersectObject(mesh('turret'), false)[0]?.point.x * Math.sign(x) > 1.18,
  'a spaced side plate stands outboard of the casting');
}
const emesLid = down(mesh('turretEquipment'), -0.48, turretRig.position.z + 0.32); // the hull's right (-x)
assert.ok(emesLid > turretRoof + 0.25 && emesLid <= 2.76, `the EMES 18 lid tops out at the published 2.71 m (${emesLid})`);
let pintleMgs = 0;
let stowageRacks = 0;
turretRig.traverse((node) => {
  if (node.userData?.fittingRoot && node.userData.fitting === 'pintleMG') pintleMgs += 1;
  if (node.userData?.fittingRoot && node.userData.fitting === 'stowageRack') stowageRacks += 1;
});
assert.equal(pintleMgs, 1, 'one turret-owned pintle machine gun is retained');
assert.equal(stowageRacks, 2, 'both turret-side stowage racks are retained');

// The ring holds the source station on the lowered deck; the trunnion keeps its 2.00 m height.
assert.ok(turretRig.position.distanceTo(new THREE.Vector3(0, 1.60, 0.50)) < 1e-8,
  'turret ring keeps the source station on the 1.58 deck');
assert.ok(gunRig.position.distanceTo(new THREE.Vector3(0, 0.40, 1.15)) < 1e-8,
  'gun trunnion keeps its turret-local station');
assert.ok(turret.min.y <= hull.max.y, 'turret bearing penetrates the hull deck instead of floating above it');
const mount = bounds(mesh('gunMount'));
assert.ok(mount.min.z < turret.max.z && mount.max.z > turretRig.position.z + 1.08,
  'the armoured mask overlaps the turret face and projects forward without an air gap');
const mantlet = gunRig.userData.leopard1A5MantletReceipt;
assert.ok(mantlet?.blohmVossMask && mantlet.profileChevron, 'the mantlet carries the B&V armoured mask, a chevron in profile');
assert.ok(mantlet.maskWidth >= 1.2 && mantlet.maskDepth >= 0.6, `the mask is wide and deep (${mantlet.maskWidth} x ${mantlet.maskDepth})`);
// (owner 2026-10-28: "this kind of mantlet that ends in a line") the brow and chin close to a line at the gun
assert.ok(mantlet.maskRidgeHalfHeight <= 0.025, `the mask's brow and chin meet in a line (±${mantlet.maskRidgeHalfHeight})`);
const receiver = new THREE.Box3(
  new THREE.Vector3(-mantlet.receiverWidth / 2, mantlet.receiverY - 0.30, mantlet.receiverZ - 0.08),
  new THREE.Vector3(mantlet.receiverWidth / 2, mantlet.receiverY + 0.30, mantlet.receiverZ + 0.08),
);
for (const pitchDeg of [-9, 0, 20]) {
  gunRig.rotation.x = -THREE.MathUtils.degToRad(pitchDeg);
  const contactCenter = new THREE.Vector3(0, 0, mantlet.rearContactZ).applyEuler(gunRig.rotation).add(gunRig.position);
  assert.ok(receiver.containsPoint(contactCenter), `mantlet rear pad remains inside the turret receiver at ${pitchDeg} degrees`);
}
gunRig.rotation.x = 0;
visual.root.updateMatrixWorld(true);
mesh('hullCloth');
mesh('turretCupola');

console.log('leopard1A5Source.selftest: 262 proportions (hull, deck, tracks, skirts), cast B&V turret, EMES 18, seated rig and kit pass');
