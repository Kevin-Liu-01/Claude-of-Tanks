// rubbleCollision.selftest (the hitbox lane, round 3, 2026-10-09): a rubble pile's records come from its drawn chunks.
// A shell through the pile's empty rim flies on where the old circle prism stopped it; a shell into a chunk stops on it;
// a flat chunk under the floor carries nothing; no chunk past the floor keeps the legacy circle; the same chunks, the
// same records.
import assert from 'node:assert/strict';
import { BoxGeometry, Vector3 } from 'three';
import { rubbleCollisionRecords, RUBBLE_CHUNK_FLOOR_M, RUBBLE_SHELL_SLAB_M } from './rubbleCollision.ts';
import { rayCollisionRecord, pointInsideCollisionRecord, setCircleShape } from './collision.ts';

const ground = 10, pr = 2.4;
const chunk = (w, h, d, x, y, z, yaw = 0, tilt = 0) => new BoxGeometry(w, h, d).rotateX(tilt).rotateY(yaw).translate(x, ground + y, z);
// a cone of chunks: a big block at the crown, a leaning wall slab, two side blocks, a brick clump, and a flat shard
const chunks = [
  chunk(1.0, 0.8, 0.9, 0, 0.75, 0, 0.3),
  chunk(1.3, 0.25, 1.0, 0.9, 0.4, 0.4, 1.1, 0.35),
  chunk(0.7, 0.5, 0.6, -1.0, 0.3, 0.5, 2.0),
  chunk(0.6, 0.45, 0.7, 0.2, 0.28, -1.1, 0.7),
  chunk(0.5, 0.2, 0.25, -0.6, 0.22, -0.7, 0.2),
  chunk(0.3, 0.1, 0.2, 1.8, 0.05, -0.2),
];
const { obstacle, collider } = rubbleCollisionRecords(chunks, ground, 0, 0, pr);
assert.equal(obstacle.kind, 'rubble'); assert.equal(collider.kind, 'rubble');
assert.equal(collider.shape2?.kind, 'compound', 'the shells meet the chunks, part by part');
assert.equal(obstacle.shape2?.kind, 'compound', 'the movement record is the chunks\' outlines');
const shellParts = collider.shape2.parts, moveParts = obstacle.shape2.parts;
for (const part of shellParts) assert.ok(part.y1 - part.y0 <= RUBBLE_SHELL_SLAB_M + 0.011, `slabs no taller than ${RUBBLE_SHELL_SLAB_M} m`);
assert.ok(moveParts.length === 5, `the chunks past the floor carry movement parts, the flat shard none (${moveParts.length})`);
assert.ok(collider.max[0] < pr && collider.min[0] > -pr && collider.max[2] < pr && collider.min[2] > -pr, 'inside the old circle');
// the flat shard at (1.8, -0.2) stands under the floor: nothing there
assert.ok(!moveParts.some((part) => pointInsideCollisionRecord(obstacle, part, 1.8, -0.2)), 'a shard under the floor is rolled over');

const legacy = setCircleShape({ min: [-pr, ground, -pr], max: [pr, ground + pr * 0.7, pr], kind: 'rubble' }, 0, 0, pr);
const normal = new Vector3();
const ray = (record, ox, oy, oz, dx, dz) => rayCollisionRecord(new Vector3(ox, ground + oy, oz), new Vector3(dx, 0, dz).normalize(), record, 20, normal);
// a level shell at 1.2 m grazing the rim, 1.6 m off the centre: the old prism stopped it in the air, the chunks let it by
assert.ok(ray(legacy, -6, 1.2, 1.6, 1, 0) >= 0, 'the legacy prism stopped a shell over the rim');
assert.ok(ray(collider, -6, 1.2, 1.6, 1, 0) < 0, 'the chunks let a shell over the rim fly on');
// a level shell at 0.8 m into the crown block stops on it, within a slab's lean of its face (x = -0.5..0.5 turned 0.3)
const hit = ray(collider, -6, 0.8, 0, 1, 0);
assert.ok(hit >= 0 && Math.abs(-6 + hit - -0.55) < 0.25, `a shell into the crown block stops on it (${hit.toFixed(2)})`);
// determinism
assert.deepEqual(rubbleCollisionRecords(chunks, ground, 0, 0, pr), { obstacle, collider }, 'the same chunks, the same records');
// nothing past the floor: the legacy circle
const flat = rubbleCollisionRecords([chunk(0.4, 0.1, 0.3, 0, 0.05, 0)], ground, 0, 0, pr);
assert.equal(flat.collider.shape2?.kind, 'circle', 'no chunk past the floor keeps the circle');
assert.ok(RUBBLE_CHUNK_FLOOR_M === 0.2);
console.log(`rubbleCollision.selftest: ${shellParts.length} shell slabs and ${moveParts.length} movement outlines from ${chunks.length} chunks; a shell over the rim flies on (the prism stopped it), one into the crown stops on it; deterministic`);
