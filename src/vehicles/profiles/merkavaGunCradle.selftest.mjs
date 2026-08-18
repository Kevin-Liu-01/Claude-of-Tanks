import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.js';

const MERKAVA_IDS = [
  'merkava1b', 'merkava2b', 'merkava2d',
  'merkava3c', 'merkava3d', 'merkava4b',
];

for (const id of MERKAVA_IDS) {
  const visual = createTank(id, null, {
    proceduralOnly: true,
    geometryReceipt: true,
  });
  const mount = visual.root.getObjectByName('gunMountDark');
  assert.ok(mount?.geometry, `${id}: gun-owned housing detail exists`);
  mount.geometry.computeBoundingBox();
  const { min, max } = mount.geometry.boundingBox;
  const verticalSpan = max.y - min.y;
  assert.ok(verticalSpan < 1.2,
    `${id}: gun-housing fittings stay local (vertical span ${verticalSpan.toFixed(3)} m)`);
  assert.ok(Math.max(Math.abs(min.y), Math.abs(max.y)) < 0.8,
    `${id}: no fastener becomes a vertical line outside the mantlet`);
}

console.log('merkavaGunCradle.selftest: all six gun housings keep their fasteners local');
