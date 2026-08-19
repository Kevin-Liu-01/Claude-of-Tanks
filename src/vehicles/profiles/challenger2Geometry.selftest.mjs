import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.js';

const tank = createTank('challenger2', null, {
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
const hull = vertices('hull');
const hullDetail = vertices('hullDetail');
const turret = vertices('turret');

assert.equal(tank.root.getObjectByName('hullRubber'), undefined,
  'former vertical fender bars must not remain as rubber track intrusions');

for (const [label, minX, maxX] of [
  ['left', -1.72, -1.55],
  ['right', 1.55, 1.75],
]) {
  assert.ok(hullDetail.some(([x, y, z]) => x > minX && x < maxX
    && y > 1.34 && y < 1.47 && Math.abs(z) < 0.85),
  `${label} metal rail must lie longitudinally on the fender`);
}

assert.equal(hull.filter(([x, y, z]) => near(Math.abs(x), 1.06)
  && y < 0.85 && z > -2.6 && z < 2.6).length, 0,
'side carrier must remain above the moving track course');

assert.equal(turret.filter(([x, y, z]) => x < -1.47
  && y < 0.40 && z > 1.36 && z < 1.44).length, 0,
'stray loader-side front block must not return');

for (const point of [
  [-0.84, 0.43, -0.64],
  [0.90, 0.38, -0.02],
  [1.34, 0.28, -1.18],
  [-1.34, 0.28, -1.18],
]) {
  assert.ok(turret.some(vertex => vertex.every((value, axis) => near(value, point[axis]))),
    `roof module must remain seated at ${point.join(',')}`);
}

console.log('challenger2Geometry.selftest: fenders, cheeks, roof seating, and track clearance pass');
