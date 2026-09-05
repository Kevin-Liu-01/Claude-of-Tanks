import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';

const near = (actual, expected, tolerance = 1e-5) => Math.abs(actual - expected) <= tolerance;
const sizeOf = (part) => part.max.map((value, axis) => value - part.min[axis]);
const centerOf = (part) => part.max.map((value, axis) => (value + part.min[axis]) / 2);

const cases = Object.freeze([
  Object.freeze({
    id: 'amx56', owner: 'gunG', bodyBucket: 'gunMount', faceBucket: 'gunMountDark',
    bodySize: [0.18, 0.15, 0.36], faceSize: [0.11, 0.08, 0.025],
    bodyZ: 5.02, faceZ: 5.21, supportRadiusM: 0.112,
  }),
  Object.freeze({
    id: 'm60a3', owner: 'recoilG', bodyBucket: 'gunDark', faceBucket: 'gunDark',
    bodySize: [0.16, 0.12, 0.26], faceSize: [0.10, 0.07, 0.018],
    bodyZ: 3.56, faceZ: 3.70, supportRadiusM: 0.096,
  }),
  Object.freeze({
    id: 'mbt70', owner: 'gunG', bodyBucket: 'gunMount', faceBucket: 'gunMountDark',
    bodySize: [0.18, 0.14, 0.28], faceSize: [0.10, 0.065, 0.025],
    bodyZ: 3.38, faceZ: 3.525, supportRadiusM: 0.128,
  }),
  Object.freeze({
    id: 'type90', owner: 'gunG', bodyBucket: 'gunMount', faceBucket: null,
    bodySize: [0.335, 0.05, 0.24], bodyZ: 4.3994, supportRadiusM: 0.08125,
  }),
  Object.freeze({
    id: 'type90a', owner: 'gunG', bodyBucket: 'gunMount', faceBucket: null,
    bodySize: [0.335, 0.05, 0.24], bodyZ: 4.3994, supportRadiusM: 0.08125,
  }),
  Object.freeze({
    id: 'kf51b', owner: 'recoilG', bodyBucket: 'gun', faceBucket: 'gunDark',
    bodySize: [0.17046, 0.10, 0.31716], faceSize: [0.12065, 0.036, 0.20775],
    bodyZ: 4.60, faceZ: 4.60, supportRadiusM: 0.080, facePlacement: 'top-inset',
  }),
]);

function findPart(parts, bucket, size, centerZ) {
  return parts.find((part) => {
    if (part.bucket !== bucket) return false;
    const actualSize = sizeOf(part);
    const actualCenter = centerOf(part);
    return size.every((value, axis) => near(actualSize[axis], value))
      && near(actualCenter[2], centerZ);
  });
}

// A fleet-wide unmerged-primitive scan found fifteen compact, forward,
// laterally displaced gun parts. Source-documented muzzle rings, mirrors and
// parallel cannon/coax parts remain asymmetric; every user-reviewed square
// reference housing is instead governed by this centered top-seat contract.
for (const fixture of cases) {
  const tank = createTank(fixture.id, null, {
    proceduralOnly: true,
    geometryReceipt: true,
    materialMode: 'geometry-only',
    quality: 'low',
  });
  const gun = tank.root.getObjectByName('rig_gun');
  const receipt = gun?.userData.muzzleReferenceSeatReceipt;
  const parts = tank.root.userData.combatGeometryParts || [];
  const body = findPart(parts, fixture.bodyBucket, fixture.bodySize, fixture.bodyZ);
  const face = fixture.faceBucket
    ? findPart(parts, fixture.faceBucket, fixture.faceSize, fixture.faceZ)
    : null;

  assert.ok(receipt, `${fixture.id}: top-mounted muzzle fixture publishes a seating receipt`);
  assert.equal(receipt.designFamily, 'cot-top-mounted-gun-fixture-v1');
  assert.equal(receipt.alignment, 'barrel-top-centerline');
  assert.equal(receipt.owner, `rig_${fixture.owner.replace('G', '')}`,
    `${fixture.id}: fixture retains its articulated gun/recoil owner`);
  assert.equal(receipt.bodyBucket, fixture.bodyBucket);
  assert.equal(receipt.faceBucket, fixture.faceBucket);
  assert.ok(body, `${fixture.id}: audited muzzle-reference body exists as authored`);
  assert.equal(body.parent, fixture.owner, `${fixture.id}: body remains in the expected articulated bucket`);

  const bodyCenter = centerOf(body);
  assert.ok(near(bodyCenter[0], 0),
    `${fixture.id}: body is centered over the bore instead of hanging beside it`);
  assert.ok(body.min[1] <= fixture.supportRadiusM
    && body.min[1] >= fixture.supportRadiusM - 0.015,
  `${fixture.id}: housing underside embeds into the tube/clamp without floating or being swallowed`);
  assert.ok(bodyCenter[1] > fixture.supportRadiusM,
    `${fixture.id}: housing mass sits above the gun axis`);
  if (face) {
    assert.equal(face.parent, fixture.owner, `${fixture.id}: face remains in the expected articulated bucket`);
    const faceCenter = centerOf(face);
    assert.ok(near(faceCenter[0], 0),
      `${fixture.id}: reference face is centered with its housing`);
    if (fixture.facePlacement === 'top-inset') {
      assert.ok(face.min[1] <= body.max[1] && face.min[1] >= body.max[1] - 0.020,
        `${fixture.id}: top window overlaps the housing crown instead of floating`);
      assert.ok(face.max[1] > body.max[1],
        `${fixture.id}: top window remains visibly proud of the housing`);
      assert.ok(face.min[2] >= body.min[2] && face.max[2] <= body.max[2],
        `${fixture.id}: top window stays within the housing footprint`);
    } else {
      assert.ok(face.min[1] >= body.min[1] && face.max[1] <= body.max[1],
        `${fixture.id}: reference face stays vertically inside its armored housing`);
      assert.ok(face.min[2] <= body.max[2] + 0.015 && face.max[2] > body.max[2],
        `${fixture.id}: reference face is seated on the forward wall of its housing`);
    }
  }
  assert.ok(near(receipt.centerX, bodyCenter[0]) && near(receipt.centerY, bodyCenter[1]));
  assert.ok(near(receipt.undersideY, body.min[1]));
  assert.ok(near(receipt.supportRadiusM, fixture.supportRadiusM));
  assert.ok(receipt.supportEmbedM >= 0.008 && receipt.supportEmbedM <= 0.012,
    `${fixture.id}: clamp overlap is deliberate and tightly bounded`);

  tank.dispose();
}

console.log('gunTopFixturePlacement.selftest: fleet-audited muzzle-reference boxes are centered, supported, and articulated');
