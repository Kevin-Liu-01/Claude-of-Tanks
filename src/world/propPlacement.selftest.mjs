import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { pushHullFromObstacle, rayCollisionRecord, setObbShape } from './collision.js';
import { DESTRUCTIBLE_TYPES } from './maps/inhabitKit.js';
import {
  UTILITY_POLE_PAIR_MAX_RELIEF,
  hedgehogBeamSpecs,
  planGroundedObbPose,
  planGroundedSegment,
  planUtilityPoleStation,
  sampleDiscGround,
  sampleObbGround,
} from './propPlacement.js';

const heightField = {
  getHeightAt(x, z) { return x * 0.21 - z * 0.13 + 2; },
};

const disc = sampleDiscGround(heightField, 4, -3, 2.5, 0.04);
const discSamples = [[4, -3]];
for (let index = 0; index < 8; index++) {
  const angle = index * Math.PI / 4;
  discSamples.push([4 + Math.cos(angle) * 2.5, -3 + Math.sin(angle) * 2.5]);
}
const discMin = Math.min(...discSamples.map(([x, z]) => heightField.getHeightAt(x, z)));
assert.ok(Math.abs(disc.y - (discMin - 0.04)) < 1e-10,
  'round props plant below their lowest sampled terrain support');
assert.ok(disc.spread > 0.5, 'ground sampling detects a meaningful cross-footprint slope');

const yaw = 0.41;
const obb = sampleObbGround(heightField, -2, 5, 1.7, 3.2, yaw, 0.03);
const obbSamples = [];
for (let ix = -1; ix <= 1; ix++) for (let iz = -1; iz <= 1; iz++) {
  const lx = ix * 1.7, lz = iz * 3.2;
  obbSamples.push([
    -2 + lx * Math.cos(yaw) + lz * Math.sin(yaw),
    5 - lx * Math.sin(yaw) + lz * Math.cos(yaw),
  ]);
}
const obbMin = Math.min(...obbSamples.map(([x, z]) => heightField.getHeightAt(x, z)));
assert.ok(Math.abs(obb.y - (obbMin - 0.03)) < 1e-10,
  'oriented props use their real rotated footprint instead of an enclosing AABB');

const flatField = { getHeightAt() { return 3.25; } };
const flatStation = planUtilityPoleStation(flatField, 2, -4, 0.6, 0.8);
assert.equal(flatStation.paired, true, 'flat verges retain a two-post utility station');
assert.ok(flatStation.partner, 'paired utility stations expose the second physical post');
assert.ok(Math.abs(flatStation.primary.y - (3.25 - 0.035)) < 1e-10,
  'the first utility post is independently planted below terrain support');
assert.ok(Math.abs(flatStation.partner.y - (3.25 - 0.035)) < 1e-10,
  'the second utility post is independently planted below terrain support');

const shelfField = {
  getHeightAt(x) { return x < 3.2 ? 5 : 3.8; },
};
const shelfStation = planUtilityPoleStation(shelfField, 0, 0, 1, 0);
assert.equal(shelfStation.paired, false,
  'a utility station drops to one post when its pair would hang over a shelf');
assert.equal(shelfStation.partner, null, 'rejected shelf partners are not emitted');
assert.ok(shelfStation.pairRelief > UTILITY_POLE_PAIR_MAX_RELIEF,
  'pair rejection reports the terrain relief that caused it');

const mildGradeField = {
  getHeightAt(x, z) { return 1.7 + x * 0.015 - z * 0.012; },
};
const mildStation = planUtilityPoleStation(mildGradeField, -4, 7, 0.4, 0.9);
assert.equal(mildStation.paired, true,
  'a visually flat mild grade can retain the authored paired rhythm');
assert.notEqual(mildStation.primary.y, mildStation.partner.y,
  'paired posts keep separate terrain supports instead of sharing one origin height');

const segment = planGroundedSegment(heightField, 1, -2, 0.8, -0.6, 5.5, 0.2, 0.03);
assert.ok(Math.abs(Math.hypot(segment.axisX, segment.axisY, segment.axisZ) - 1) < 1e-10,
  'wide decoration grounding returns a normalized terrain-aligned axis');
assert.notEqual(segment.start.support.min, segment.end.support.min,
  'wide decorations sample both physical ends instead of only their center');
assert.ok(Math.abs(segment.y - ((segment.start.support.min + segment.end.support.min) * 0.5 + 0.17)) < 1e-10,
  'wide cylindrical decorations rest on their two terrain supports');

const rigidPose = planGroundedObbPose(heightField, 3, -6, 2.2, 4.5, 0.37, 0.08);
assert.ok(rigidPose.maxFloat <= -0.079999999,
  'terrain-fitted rigid decorations have no floating footprint sample');
assert.ok(rigidPose.maxEmbed < 0.09,
  'a planar grade does not bury a terrain-fitted rigid decoration');
assert.ok(Math.abs(Math.hypot(rigidPose.normalX, rigidPose.normalY, rigidPose.normalZ) - 1) < 1e-10,
  'terrain-fitted rigid decorations return a normalized support-plane normal');

const specs = hedgehogBeamSpecs(0, 0, 0, 0.23, 1, [0.04, -0.03, 0.02]);
assert.equal(specs.length, 3, 'hedgehog exposes one collision slab per visible beam');
const records = specs.map((spec) => setObbShape({
  min: [0, spec.minY, 0], max: [0, spec.maxY, 0], kind: 'hedgehog',
}, 0, 0, spec.halfWidth + 0.025, spec.halfLength + 0.025, spec.yaw));

const first = specs[0];
const beamPoint = {
  x: Math.sin(first.yaw) * first.halfLength * 0.72,
  z: Math.cos(first.yaw) * first.halfLength * 0.72,
};
const push = { x: 0, y: 0, z: 0 };
assert.equal(pushHullFromObstacle(beamPoint, 0, 1, 1, 0, 0.04, 0.04, records[0], push), true,
  'tank movement contacts the narrow visible steel beam');

const normal = new Vector3();
assert.ok(rayCollisionRecord(
  new Vector3(beamPoint.x, 2, beamPoint.z), new Vector3(0, -1, 0), records[0], 4, normal,
) >= 0, 'shell ray contacts the same visible beam volume');

let emptyPoint = null;
for (let x = -1.05; x <= 1.05 && !emptyPoint; x += 0.05) {
  for (let z = -1.05; z <= 1.05; z += 0.05) {
    if (Math.hypot(x, z) > 1.05) continue;
    const hits = records.some((record) => rayCollisionRecord(
      new Vector3(x, 2, z), new Vector3(0, -1, 0), record, 4, normal,
    ) >= 0);
    if (!hits) emptyPoint = { x, z };
  }
}
assert.ok(emptyPoint, 'compound beams leave real open space inside the old circular force field');
assert.equal(records.some((record) => pushHullFromObstacle(
  emptyPoint, 0, 1, 1, 0, 0.02, 0.02, record, { x: 0, y: 0, z: 0 },
)), false, 'tank movement can pass through empty space between the steel beams');

assert.ok(DESTRUCTIBLE_TYPES.barrier.hw < DESTRUCTIBLE_TYPES.barrier.r * 0.35,
  'road barriers use their narrow concrete profile, not a radius-sized square');
assert.ok(DESTRUCTIBLE_TYPES.truck.hl > DESTRUCTIBLE_TYPES.truck.hw * 2.5,
  'trucks use their long vehicle footprint');
assert.equal(DESTRUCTIBLE_TYPES.roadsign.shape, 'circle',
  'thin roadside posts use round movement collision');
assert.ok(DESTRUCTIBLE_TYPES.roadsign.collisionR < DESTRUCTIBLE_TYPES.roadsign.r * 0.5,
  'roadside-post collision follows the post rather than the elevated sign face');

console.log('propPlacement.selftest: footprint grounding and compound hedgehog collision passed');
