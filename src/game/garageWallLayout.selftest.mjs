import assert from 'node:assert/strict';
import {
  GARAGE_WALL_BAYS, auditGarageWallBays, garageWallTransform,
} from './garageWallLayout.ts';

const audit = auditGarageWallBays();
assert.equal(audit.bays, GARAGE_WALL_BAYS.length);
assert.deepEqual(audit.overlaps, [], 'wall bays must not overlap, including clearance');
assert.equal(new Set(GARAGE_WALL_BAYS.map((bay) => bay.id)).size, GARAGE_WALL_BAYS.length);
for (const bay of GARAGE_WALL_BAYS) {
  assert.ok(bay.width > 0 && bay.height > 0);
  const transform = garageWallTransform(bay.id);
  assert.equal(transform.id, bay.id);
  assert.ok(Math.max(Math.abs(transform.x), Math.abs(transform.z)) >= 22.8,
    `${bay.id} must remain seated on a perimeter wall`);
}

console.log('garageWallLayout.selftest: ok');
