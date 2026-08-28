import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';

const tank = createTank('abramsx', null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});
await Promise.resolve();

function vertices(name) {
  const mesh = tank.root.getObjectByName(name);
  assert.ok(mesh?.geometry?.attributes?.position, `missing ${name} geometry`);
  const positions = mesh.geometry.attributes.position.array;
  const result = [];
  for (let index = 0; index < positions.length; index += 3) {
    result.push([positions[index], positions[index + 1], positions[index + 2]]);
  }
  return result;
}

const near = (value, target, epsilon = 1e-3) => Math.abs(value - target) < epsilon;
const hasPoint = (points, target) => points.some((point) =>
  point.every((value, axis) => near(value, target[axis])));
const turret = vertices('turret');
const turretDark = vertices('turretDark');
const turretDetail = vertices('turretDetail');

// The two panoramic hoods now begin inside the final shell roof instead of
// on the obsolete 2.42 m bridge plane.
assert.ok(hasPoint(turret, [0.517, 0.195, 0.727]),
  'forward panoramic hood is seated on the roof');
assert.ok(hasPoint(turret, [-0.574, 0.165, 0.950]),
  'left panoramic hood is seated on the roof');

// The central cassette has a sloped underside which follows the roof, and
// the forward XM360 spine lands 55 mm lower on that same shell course.
for (const point of [
  [0.405, 0.169, 1.189],
  [0.405, 0.348, -0.161],
  [0.635, 0.034, 2.591],
]) {
  assert.ok(hasPoint(turret, point),
    `AbramsX roof structure remains seated at ${point.join(',')}`);
}

// Each mirrored edge-electronics family retains its plan station and height,
// but its lower face follows the final shell rather than hovering above it.
for (const [x, z, y] of [
  [1.1535, -1.2270, 0.138],
  [1.5295, -1.1330, 0.082],
  [1.6225, -0.9875, 0.113],
  [1.5410, -0.0240, 0.245],
  [1.6320, 0.0675, 0.210],
]) {
  assert.ok(turretDetail.some(([vx, vy, vz]) =>
    Math.abs(vx - x) < 0.15 && Math.abs(vz - z) < 0.10 && near(vy, y)),
  `roof electronics at (${x},${z}) are seated at y=${y}`);
}

// Decorative line solids formerly crossed the cheeks, flanks, and roof edge.
assert.equal(turretDark.filter(([x, y, z]) => near(Math.abs(x), 1.57)
  && y > 0.38 && y < 0.42 && z > -1.26 && z < 1.96).length, 0,
'full-length flank strip must not return');
assert.equal(turretDetail.filter(([x, y, z]) => near(Math.abs(x), 1.596)
  && y > 0.48 && y < 0.49 && z > -0.86 && z < 1.46).length, 0,
'floating roof-edge strip must not return');
assert.equal(turretDark.filter(([x, y, z]) => Math.abs(x) > 0.59
  && Math.abs(x) < 1.67 && y > 0.237 && y < 0.253
  && z > 2.24 && z < 2.75).length, 0,
'floating cheek weld bars must not return');

// These manually-parented shadow solids bypassed Gallery Studio selection and
// appeared as two detached near-black panels behind the turret.
assert.equal(tank.root.getObjectByName('abramsxAftDeckShadow_0'), undefined,
  'detached center aft-deck shadow panel must not return');
assert.equal(tank.root.getObjectByName('abramsxBustleUndercutShadow'), undefined,
  'detached bustle-undercut shadow panel must not return');

// The visible cartridge arc now continues into a feed mouth which overlaps
// the marked ammunition-box lid instead of terminating in free air above it.
const rigTurret = tank.root.getObjectByName('rig_turret');
const feed = rigTurret?.userData?.abramsxRwsFeedReceipt;
assert.ok(feed, 'AbramsX RWS feed receipt is present');
assert.equal(feed.returnLinkCount, 8, 'belt has an articulated box return');
assert.ok(hasPoint(turretDark, [0.5242, 1.110, 0.0392])
  && hasPoint(turretDark, [0.6158, 1.190, 0.1408]),
  'feed mouth is present in the merged turret mesh');
assert.ok(feed.feedMouthCenter[1] - 0.040 <= feed.ammoBoxTopY,
  'feed mouth is buried through the ammunition-box lid');
assert.ok(Math.abs(feed.beltTailEnd[0] - feed.feedMouthCenter[0]) < 1e-6
  && Math.abs(feed.beltTailEnd[2] - feed.feedMouthCenter[2]) < 1e-6
  && Math.abs(feed.beltTailEnd[1] - feed.feedMouthCenter[1]) <= 0.040,
  'belt terminal overlaps the seated feed mouth');

tank.dispose();
console.log('abramsXRoofSeating.selftest: roof seating, shadow cleanup, and RWS feed closure pass');
