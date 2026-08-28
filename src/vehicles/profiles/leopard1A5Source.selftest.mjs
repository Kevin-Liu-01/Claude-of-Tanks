import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';

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

// Registered source envelope after normalization: 3.363 m wide, 6.887 m
// body length, with the A5 L7A3 taking overall length to 9.54 m. Keep the
// procedural result within the measured source tolerance instead of allowing
// the old generic Leopard hull or an over-long gun to return.
const hull = bounds(mesh('hull'));
assert.ok(Math.abs((hull.max.x - hull.min.x) - 3.28) <= 0.04,
  `source-width hull retained (${hull.max.x - hull.min.x} m)`);
assert.ok(Math.abs((hull.max.z - hull.min.z) - 7.085) <= 0.04,
  `source-length hull retained (${hull.max.z - hull.min.z} m)`);
const root = bounds(visual.root);
assert.ok(Math.abs((root.max.z - root.min.z) - 9.59) <= 0.08,
  `L7A3 overall envelope retained (${root.max.z - root.min.z} m)`);

// One native seven-wheel smart course per side, with no static donor course.
assert.equal(hullRig.userData.nativeRoadWheelStations, 7,
  'Leopard 1A5 retains seven native road-wheel stations');
const trackBands = [];
visual.root.traverse((node) => {
  if (node.userData?.appearanceRole === 'trackBand') trackBands.push(node);
});
assert.equal(trackBands.length, 2, 'exactly one linked track band is present per side');
for (const band of trackBands) {
  const box = bounds(band);
  assert.ok(box.max.y >= 1.20 && box.max.y <= 1.23 && box.min.y >= 0.01,
    `${band.name} follows the deliberately lifted Leopard terminal-wheel course`);
  assert.ok(box.max.x - box.min.x >= 0.535,
    `${band.name} uses the widened Leopard tread`);
  assert.ok(box.max.z - box.min.z >= 6.60 && box.max.z - box.min.z <= 6.76,
    `${band.name} follows the measured Leopard-family course`);
}
const trackPads = visual.root.getObjectByName('gearTrackPads');
assert.ok(trackPads?.isInstancedMesh && trackPads.count >= 220,
  'the rebuilt course uses a fine-pitch linked shoe chain on both sides');
assert.equal(visual.root.getObjectByName('gearTrackInnerLinks'), undefined,
  'connector and guide detail is integrated into one physical track shoe');
trackPads.geometry.computeBoundingBox();
const trackShoeBounds = trackPads.geometry.boundingBox;
assert.ok(trackShoeBounds.max.y - trackShoeBounds.min.y <= 0.27
  && trackShoeBounds.max.z - trackShoeBounds.min.z <= 0.145
  && trackPads.userData.trackShoePadCoverageRatio >= 0.90,
  'the redesigned shoe stays shallow while closing the broad tread around end wraps');
assert.equal(trackPads.userData.trackPatternId, 'nato-double-pin',
  'Leopard course uses the centralized NATO double-pin family');
const matrix = new THREE.Matrix4();
const instancePosition = new THREE.Vector3();
const instanceRotation = new THREE.Quaternion();
const instanceScale = new THREE.Vector3();
const leftShoeCenters = [];
for (let i = 0; i < trackPads.count / 2; i++) {
  trackPads.getMatrixAt(i, matrix);
  matrix.decompose(instancePosition, instanceRotation, instanceScale);
  leftShoeCenters.push([instancePosition.y, instancePosition.z]);
}
for (const [label, end] of [
  ['idler', { y: 0.79, z: 3.17 }],
  ['sprocket', { y: 0.84, z: -2.70 }],
]) {
  const wrapRadii = [];
  for (const [y, z] of leftShoeCenters) {
    const radius = Math.hypot(y - end.y, z - end.z);
    if (radius < 0.41) wrapRadii.push(radius);
  }
  assert.ok(wrapRadii.length >= 7 && Math.max(...wrapRadii) - Math.min(...wrapRadii) <= 0.035,
    `linked shoes follow a tight concentric ${label} wrap`);
}

// Finish pass: the fenders form a continuous bridge over the track return,
// the shallow aprons/lockers fill the formerly empty side band, and the two
// large rear fuel cans are physically carried by the transom rack.
const finish = hullRig.userData.leopard1A5FinishReceipt;
assert.deepEqual(finish, {
  continuousFenders: true,
  segmentedSideAprons: 14,
  fenderLockers: 8,
  rearFuelCans: 2,
  rearFuelCanSize: [0.56, 0.66, 0.24],
  roadWheelStations: 7,
  roadWheelR: 0.345,
  roadWheelY: 0.37,
  roadWheelPitch: 0.74,
  roadWheelSpan: 4.44,
  roadWheelZs: [2.52, 1.78, 1.04, 0.30, -0.44, -1.18, -1.92],
  roadWheelForwardShift: 0.30,
  returnRollerZs: [2.40, 1.00, -0.42, -1.77],
  returnRollerY: 1,
  bodyLiftY: 0,
  trackWidth: 0.54,
  wheelWidth: 0.225,
  trackOuterEdgeX: 1.67,
  trackTopSupportY: 1.14,
  trackThickness: 0.07,
  trackBotY: 0.05,
  trackContactZF: 2.52,
  trackContactZR: -1.92,
  sealedHullSides: true,
  closedDeckUnderstructure: true,
  deckSupportSegments: 2,
  hullOverFenders: true,
  hullSponsonBottomY: 1.29,
  fenderShelfTopY: 1.3175,
  hullFenderOverlapY: 0.0275,
  upperGlacisSurfaces: 1,
  upperGlacisAngleFromVerticalDeg: 60,
  upperGlacisFrontZ: 3.54,
  upperGlacisRearZ: 2.674,
  upperGlacisFrontY: 1.04,
  upperGlacisRearY: 1.54,
  deckEquipmentReseated: true,
  lowerGlacisJoinY: 1.04,
  redesignedLeopardTrackCourse: true,
  integratedTrackShoes: true,
  trackLinkPitch: 0.125,
  trackShoeRadialScale: 0.58,
  trackEndArcSteps: 12,
  frontIdlerZ: 3.17,
  frontIdlerY: 0.79,
  rearSprocketZ: -2.70,
  rearSprocketY: 0.84,
}, 'Leopard 1A5 side/fender/fuel finish receipt remains complete');
const gear = hullRig.userData.runningGearReceipts?.[0];
assert.ok(gear, 'Leopard 1A5 publishes its native running-gear receipt');
assert.equal(gear.wheelY, 0.37, 'the seven road-wheel centers rise into the suspension bay');
assert.deepEqual(gear.wheelZs, [2.52, 1.78, 1.04, 0.30, -0.44, -1.18, -1.92],
  'the seven road wheels advance together on the tighter Leopard 1 pitch');
for (let i = 1; i < gear.wheelZs.length; i++) {
  assert.ok(Math.abs((gear.wheelZs[i - 1] - gear.wheelZs[i]) - 0.74) < 1e-8,
    `road-wheel station ${i} remains on the compact 0.74 m pitch`);
}
assert.deepEqual(gear.idler, { z: 3.17, y: 0.79, r: 0.29 },
  'the front idler retains a compact raised station and authored radius');
assert.deepEqual(gear.sprocket, { z: -2.70, y: 0.84, r: 0.30 },
  'the rear sprocket retains a compact raised station and authored radius');
assert.ok(gear.idler.y - gear.wheelY >= 0.41 && gear.sprocket.y - gear.wheelY >= 0.46,
  'both terminal drums retain the lifted Leopard trapezoid without over-tall wraps');
assert.ok(Math.abs(gear.wheelZs.reduce((sum, z) => sum + z, 0) / gear.wheelZs.length - 0.30) < 1e-8,
  'the complete road-wheel row advances 30 cm without changing its cadence');
assert.equal(finish.returnRollerY, 1,
  'the lower return rollers reduce the complete track-assembly height');
assert.equal(finish.trackTopSupportY, 1.14,
  'the wider upper track course remains seated directly below the fenders');
assert.equal(finish.bodyLiftY, 0,
  'the hull returns to its source datum without moving the running gear');
const loadedRun = gear.loopPoints.filter(([, y]) => Math.abs(y - finish.trackBotY) < 1e-8);
assert.ok(loadedRun.length >= 7, 'the loaded track run retains articulated road-wheel stations');
assert.ok(Math.abs(Math.max(...loadedRun.map(([z]) => z))
  - gear.wheelZs[0]) < 1e-8,
  'the front lower bend begins directly below the first road-wheel centre');
assert.ok(Math.abs(Math.min(...loadedRun.map(([z]) => z))
  - gear.wheelZs.at(-1)) < 1e-8,
  'the rear lower bend begins directly below the last road-wheel centre');
assert.ok(Math.abs((gear.wheelY - finish.trackBotY) - gear.wheelR)
  <= finish.trackThickness / 2,
  'the loaded band physically meets the terminal road-wheel tire envelopes');

// The sponson must bear on the fender shelf, while exactly one upper-glacis
// surface holds the requested 60-degree angle from vertical. Its deck break
// is solved from the fixed source nose/deck heights rather than leaving the
// former long, shallow plate in place.
assert.ok(finish.hullSponsonBottomY < finish.fenderShelfTopY
  && finish.hullFenderOverlapY >= 0.027,
  'the armored hull shoulder physically overlaps and rests on the fender shelf');
const glacisRise = finish.upperGlacisRearY - finish.upperGlacisFrontY;
const glacisRun = finish.upperGlacisFrontZ - finish.upperGlacisRearZ;
const glacisAngleFromVerticalDeg = THREE.MathUtils.radToDeg(Math.atan2(glacisRun, glacisRise));
assert.ok(Math.abs(glacisAngleFromVerticalDeg - 60) <= 0.01,
  `upper glacis remains 60 degrees from vertical (${glacisAngleFromVerticalDeg} deg)`);
const bowHits = new THREE.Raycaster(
  new THREE.Vector3(0, 4, 3.00), new THREE.Vector3(0, -1, 0), 0, 4,
).intersectObject(mesh('hull'), false);
assert.equal(bowHits.filter((hit) => hit.point.y > 0.95 && hit.point.y < 1.20).length, 0,
  'the obsolete lower duplicate upper-glacis plane is absent');
assert.ok(bowHits.some((hit) => hit.point.y > 1.40 && hit.point.y < 1.43),
  'the single 60-degree upper glacis remains at its solved exterior station');

// The marked rear and center deck skins have structural material directly
// beneath them. Horizontal probes through the former air layer must now hit
// the filled hull before reaching the outboard deck edge.
const deckSupportProbe = (y, z) => new THREE.Raycaster(
  new THREE.Vector3(2, y, z), new THREE.Vector3(-1, 0, 0), 0, 2,
).intersectObject(mesh('hull'), false)[0];
for (const [y, z] of [[1.60, -2.50], [1.55, 0]]) {
  const hit = deckSupportProbe(y, z);
  assert.ok(hit && hit.distance <= 0.80,
    `deck support closes the former internal void at y=${y}, z=${z}`);
}
mesh('hullCloth');

// The source ring is 0.50 m forward of hull center. The gun saddle must root
// inside the cast turret face so the tube and mantlet remain one assembly.
assert.ok(turretRig.position.distanceTo(new THREE.Vector3(0, 1.55, 0.50)) < 1e-8,
  'turret ring retains the registered source station');
assert.ok(gunRig.position.distanceTo(new THREE.Vector3(0, 0.47, 1.15)) < 1e-8,
  'gun saddle retains its authored turret-local station');
const turret = bounds(mesh('turret'));
const mount = bounds(mesh('gunMount'));
assert.ok(mount.min.z < turret.max.z && mount.max.z > turret.max.z,
  'mantlet overlaps the turret face and projects forward without an air gap');
assert.ok(turret.min.y <= hull.max.y,
  'turret bearing penetrates the hull deck instead of floating above it');

// A5 identity package: EMES/equipment, structural cupolas, pintle MG and two
// populated stowage racks remain turret-owned and visible above the source
// shell. These are intentional A5 additions to the base Leopard 1 oracle.
mesh('turretEquipment');
mesh('turretCupola');
let pintleMgs = 0;
let stowageRacks = 0;
const stowageRackZs = [];
turretRig.traverse((node) => {
  if (node.userData?.fittingRoot && node.userData.fitting === 'pintleMG') pintleMgs += 1;
  if (node.userData?.fittingRoot && node.userData.fitting === 'stowageRack') {
    stowageRacks += 1;
    stowageRackZs.push(node.position.z);
  }
});
assert.equal(pintleMgs, 1, 'one turret-owned pintle machine gun is retained');
assert.equal(stowageRacks, 2, 'both turret-side stowage racks are retained');
assert.deepEqual(stowageRackZs.sort((a, b) => a - b), [-1.68, -1.68],
  'both side racks sit aft against the compact rear bustle');
assert.deepEqual(turretRig.userData.leopard1A5TurretFinishReceipt, {
  connectedBustleBasket: true,
  compactBustleBasket: true,
  bustleRearZ: -2.84,
  bustleWidth: 1.88,
  bustleDepth: 0.60,
  bustleFloorY: 0.31,
  sideRackZ: -1.68,
  shieldedRoofMachineGun: true,
  frontCheekPanelsSeated: true,
  frontCheekMirrorSymmetric: true,
  frontCheekRootInsetM: 0.08,
}, 'turret finish receipt retains the compact tail-aligned bustle and shielded MG station');
assert.deepEqual(gunRig.userData.leopard1A5MantletReceipt, {
  seated: true,
  shapedButterflyCasting: true,
  flatFacetedFace: true,
  flatRearContactFace: true,
  sideChevron: true,
  straightRidge: true,
  integratedFrontWedge: true,
  integratedFrontWedgeOwner: 'gun',
  ridgeWidth: 1.00,
  ridgeZ: 0.38,
  turretReceiver: true,
  width: 1.32,
  height: 0.55,
  faceDepth: 0.31,
  rearContactWidth: 1.22,
  rearContactHeight: 0.46,
  rearContactDepth: 0.16,
  rearContactZ: -0.34,
  receiverWidth: 1.16,
  receiverHeight: 0.50,
  receiverDepth: 0.18,
  receiverY: 0.47,
  receiverZ: 0.79,
  barrelRadius: 0.064,
}, 'the flatter faceted mantlet and thicker L7 remain seated in the turret embrasure');

// The side facing the turret is a literal planar pad, not a rounded cap. The
// center of that pad remains buried in the fixed receiver at both legal pitch
// limits, proving the visible attachment does not open when the gun moves.
const mountPosition = mesh('gunMount').geometry.attributes.position;
let rearZ = Infinity;
for (let i = 0; i < mountPosition.count; i++) rearZ = Math.min(rearZ, mountPosition.getZ(i));
const rearVertices = [];
for (let i = 0; i < mountPosition.count; i++) {
  if (Math.abs(mountPosition.getZ(i) - rearZ) <= 1e-6) {
    rearVertices.push([mountPosition.getX(i), mountPosition.getY(i)]);
  }
}
assert.ok(rearVertices.length >= 6, 'mantlet exposes a triangulated flat rear contact face');
const rearXs = rearVertices.map(([x]) => x);
const rearYs = rearVertices.map(([, y]) => y);
assert.ok(Math.abs((Math.max(...rearXs) - Math.min(...rearXs)) - 1.22) <= 1e-6,
  'flat rear contact face keeps the authored 1.22 m width');
assert.ok(Math.abs((Math.max(...rearYs) - Math.min(...rearYs)) - 0.46) <= 1e-6,
  'flat rear contact face keeps the authored 0.46 m height');

const hasMountVertex = (x, y, z, tolerance = 1e-5) => {
  for (let index = 0; index < mountPosition.count; index++) {
    if (Math.abs(mountPosition.getX(index) - x) <= tolerance
      && Math.abs(mountPosition.getY(index) - y) <= tolerance
      && Math.abs(mountPosition.getZ(index) - z) <= tolerance) return true;
  }
  return false;
};
assert.ok(hasMountVertex(-0.50, 0, 0.38) && hasMountVertex(0.50, 0, 0.38),
  'Leopard 1A5 upper and lower skins meet across one straight forward ridge');
assert.equal(hasMountVertex(0, 0.24, 0.38), false,
  'Leopard 1A5 ridge has no separated upper ledge or intervening front band');
assert.ok(hasMountVertex(0.64, 0.29, -0.30)
  && hasMountVertex(-0.64, -0.29, -0.30),
  'Leopard 1A5 chevron casting tapers back into its broad planar seat');
assert.ok(hasMountVertex(-0.55, -0.35, 0.19)
  && hasMountVertex(0.55, -0.35, 0.19)
  && hasMountVertex(-0.43, 0.15, 0.15)
  && hasMountVertex(0.43, 0.15, 0.15),
  'the former fixed center wedge is merged into the moving mantlet mesh');

const turretPosition = mesh('turret').geometry.attributes.position;
const hasTurretVertex = (x, y, z, tolerance = 1e-5) => {
  for (let index = 0; index < turretPosition.count; index++) {
    if (Math.abs(turretPosition.getX(index) - x) <= tolerance
      && Math.abs(turretPosition.getY(index) - y) <= tolerance
      && Math.abs(turretPosition.getZ(index) - z) <= tolerance) return true;
  }
  return false;
};
assert.equal(hasTurretVertex(-0.55, 0.12, 1.34), false,
  'the incorporated wedge no longer leaves a fixed duplicate on the turret');
for (const xSign of [-1, 1]) {
  assert.ok(hasTurretVertex(xSign * 0.98, 0.44, 0.68)
    && hasTurretVertex(xSign * 0.90, 0.62, 0.44),
  `the ${xSign < 0 ? 'left' : 'right'} cheek shoulder is tucked into the cast shell`);
}

const receiver = new THREE.Box3(
  new THREE.Vector3(-0.58, 0.22, 0.70),
  new THREE.Vector3(0.58, 0.72, 0.88),
);
for (const pitchDeg of [-9, 0, 20]) {
  gunRig.rotation.x = -THREE.MathUtils.degToRad(pitchDeg);
  const contactCenter = new THREE.Vector3(0, 0, -0.42).applyEuler(gunRig.rotation).add(gunRig.position);
  assert.ok(receiver.containsPoint(contactCenter),
    `mantlet rear pad remains inside the turret receiver at ${pitchDeg} degrees`);
  const integratedWedgePoint = new THREE.Vector3(0.55, -0.35, 0.19)
    .applyEuler(gunRig.rotation).add(gunRig.position);
  assert.ok(Number.isFinite(integratedWedgePoint.y) && integratedWedgePoint.z > 1,
    `incorporated center wedge follows the gun assembly at ${pitchDeg} degrees`);
}
gunRig.rotation.x = 0;
visual.root.updateMatrixWorld(true);

console.log('leopard1A5Source.selftest: source envelope, Leopard course, closed fenders, rear fuel cans, seated rig, and A5 kit pass');
