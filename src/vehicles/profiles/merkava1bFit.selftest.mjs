import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.js';

const visual = createTank('merkava1b', null, {
  proceduralOnly: true,
  geometryReceipt: true,
});
const turret = visual.root.getObjectByName('rig_turret');
const hull = visual.root.getObjectByName('rig_hull');

const fit = turret.userData.merkava1bSourceFitReceipt;
assert.equal(fit.roofDatumSource, 'source-oracle', 'roof equipment uses the rendered source shell');
assert.equal(fit.sidePanelSeats.length, 10, 'five conformal side panels are seated on each flank');
assert.equal(fit.eraSeats.length, 16, 'eight cheek ERA cells are seated on each cheek');
assert.equal(fit.maximumSurfaceGapM, 0, 'conformal armor has no authored stand-off gap');

for (const seat of fit.sidePanelSeats) {
  const center = new THREE.Vector3(...seat.centerLocal);
  const surface = new THREE.Vector3(...seat.surfaceLocal);
  const normal = new THREE.Vector3(...seat.normalLocal);
  assert.ok(normal.x * seat.side > 0.45, 'side-panel normal points outward');
  assert.ok(center.clone().sub(surface).dot(normal) > 0,
    'side-panel center is proud while its inner face remains embedded');
  assert.equal(seat.contactEmbedM, 0.014, 'side panel has a positive contact overlap');
}

for (const seat of fit.eraSeats) {
  const center = new THREE.Vector3(...seat.centerLocal);
  const surface = new THREE.Vector3(...seat.surfaceLocal);
  const normal = new THREE.Vector3(...seat.normalLocal);
  const proud = center.clone().sub(surface).dot(normal);
  assert.ok(normal.x * seat.side > 0.25, 'cheek ERA normal points outward');
  assert.ok(Math.abs(proud - (seat.cassetteDepthM / 2 - seat.contactEmbedM)) < 1e-6,
    'cheek ERA inner face overlaps the cast cheek by the authored embed');
}

const legacySeats = turret.userData.merkava1bLegacyEquipmentSeatReceipt;
const roofSeats = legacySeats.seats.filter((seat) => seat.kind === 'roof-equipment');
const sideSeats = legacySeats.seats.filter((seat) => seat.kind === 'side-panel');
assert.ok(roofSeats.length >= 10, 'legacy roof fittings were re-seated on the source roof');
assert.equal(sideSeats.length, 3, 'both right armor layers and the left panel use shell frames');
assert.ok(Math.max(...roofSeats.map((seat) => seat.standOffRemovedM)) >= 0.20,
  'the largest legacy roof stand-off was removed');
assert.ok(roofSeats.every((seat) => seat.seatedBaseM <= seat.authoredBaseM + 1e-8),
  'roof fittings only moved down onto the rendered roof');

const rear = turret.userData.merkava1bRearClosureReceipt;
assert.equal(rear.closedCrownAndFloor, true, 'turret-to-bustle seam is closed above and below');
assert.ok(rear.rearOverlapM >= 0.12, 'bulkhead overlaps the basket root toward the rear');

const glacis = hull.userData.merkava1bGlacisClosureReceipt;
assert.equal(glacis.buriedEdgeOverlap, true, 'upper/lower glacis closure is buried in both hull planes');
assert.ok(glacis.upperRangeM[0] > glacis.lowerRangeM[0], 'closure spans the visible bow cavity');

const gear = hull.userData.merkava1bRunningGearReceipt;
assert.equal(gear.previousSprocketZM, 1.95, 'front terminal movement records its prior station');
assert.equal(gear.sprocketZM, 2.13, 'front terminal moved 18 cm forward');
assert.equal(gear.trackCourseUsesSprocketEndpoint, true, 'live tracks use the moved front endpoint');
const pads = visual.root.getObjectByName('gearTrackPads');
assert.ok(pads?.isInstancedMesh, 'track pads remain one live instanced course');
const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
let maxPadZ = -Infinity;
for (let instance = 0; instance < pads.count; instance++) {
  pads.getMatrixAt(instance, matrix);
  position.setFromMatrixPosition(matrix);
  maxPadZ = Math.max(maxPadZ, position.z);
}
assert.ok(maxPadZ > gear.sprocketZM + 0.30,
  'track shoes wrap past the forward edge of the moved terminal wheel');

console.log('merkava1bFit.selftest: conformal turret, closed hull, and forward track endpoint passed');
