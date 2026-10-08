import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import {
  collisionFootprintContainsPoint, convexHull2, createObstacleGrid,
  pushHullFromObstacle, pushHullFromHull, rayCollisionFootprintEntry2,
  rayCollisionRecord, setCircleShape, setCompoundShape, setConvexShape, setObbShape,
  shellPassesThroughCollisionRecord, cloneCollisionRecord,
  createHullFootprint, hullFootprint, hullPassesObstacleTop, hullUndersideOver,
} from './collision.ts';

const rec = (y1 = 3) => ({ min: [0, 0, 0], max: [0, y1, 0] });
const push = () => ({ x: 0, y: 0, z: 0, set() {} });
const hullHit = (pos, ob, halfL = 0.3, halfW = 0.3) => {
  const out = push();
  return { hit: pushHullFromObstacle(pos, 0, 1, 1, 0, halfL, halfW, ob, out), out };
};

// A hull deep in a footprint leaves by the shortest way out (physics lane, 2026-10-03). The SAT took the overlap of the
// two projections as the push; for a hull lying inside the footprint on an axis that is the hull's own width, so a hull
// that fell over the back edge of a 14 m roof was pushed 2.76 m sideways a step and walked 8 m along the building at the
// 1 m step cap instead of backing out the 4.2 m it overlapped; and a thin wall across a long hull pushed it only the
// wall's 0.3 m thickness a step.
{
  const roof = setObbShape(rec(4), 0, 6, 7, 6, 0);
  const deep = hullHit({ x: 0, z: 0.37 }, roof, 3.83, 1.38);
  assert.equal(deep.hit, true, 'a hull over the roof footprint overlaps it');
  assert.ok(Math.abs(deep.out.x) < 1e-9 && Math.abs(deep.out.z + 4.2) < 1e-6,
    `a hull deep in a wide footprint backs out the 4.2 m it overlaps, not its 2.76 m width sideways: ${JSON.stringify(deep.out)}`);
  assert.equal(hullHit({ x: deep.out.x, z: 0.37 + deep.out.z - 1e-6 }, roof, 3.83, 1.38).hit, false, 'the push clears the footprint');
  const wall = setObbShape(rec(3), 0, 0, 5, 0.15, 0);
  const across = hullHit({ x: 0, z: 1 }, wall, 3.5, 1.7);
  assert.ok(Math.abs(across.out.x) < 1e-9 && Math.abs(across.out.z - 2.65) < 1e-6,
    `a thin wall across a long hull pushes it clear of the wall (2.65 m), not the wall's thickness: ${JSON.stringify(across.out)}`);
  const shallow = hullHit({ x: 0, z: -3.6 }, wall, 3.5, 1.7);
  assert.ok(Math.abs(shallow.out.z + 0.05) < 1e-6, 'a shallow contact still backs out its own overlap');
}

// Rotated structure: its enclosing AABB corner is empty and must stay empty.
const building = setObbShape(rec(8), 0, 0, 1, 4, Math.PI / 4);
assert.equal(hullHit({ x: 3.3, z: -3.3 }, building, 0.2, 0.2).hit, false,
  'rotated-building AABB corner is not solid');
const bh = hullHit({ x: 2.8, z: 2.8 }, building, 0.35, 0.35);
assert.equal(bh.hit, true, 'hull contacts the real oriented building end');
assert.ok(Math.hypot(bh.out.x, bh.out.z) > 0, 'building contact returns a push');

// Round props: square-corner force fields are gone.
const trunk = setCircleShape(rec(5), 0, 0, 0.55);
assert.equal(hullHit({ x: 0.8, z: 0.8 }, trunk, 0.1, 0.1).hit, false,
  'circle footprint rejects its old square corner');
assert.equal(hullHit({ x: 0.58, z: 0 }, trunk, 0.1, 0.1).hit, true,
  'circle footprint still contacts at the visible radius');

assert.equal(shellPassesThroughCollisionRecord({
  min: [-1, 0, -1], max: [1, 4, 1], crushable: true, kind: 'fieldhut',
}), true, 'destructible small buildings yield without consuming shells');
assert.equal(shellPassesThroughCollisionRecord({
  min: [-1, 0, -1], max: [1, 8, 1], kind: 'warehouse',
}), false, 'non-crushable structures remain hard ballistic cover');
assert.equal(shellPassesThroughCollisionRecord({
  min: [-1, 0, -0.4], max: [1, 1.2, 0.4], crushable: true, kind: 'wallstone',
}), false, 'dense crushable fortifications remain hard ballistic cover');
assert.equal(shellPassesThroughCollisionRecord({
  min: [-1, 0, -1], max: [1, 1.1, 1], crushable: true, kind: 'small-rock',
}), false, 'a crushable stone is still stone to a shell (the hitbox lane, 2026-10-07)');

// Tank interaction boxes are true oriented hull rectangles. The old capsule
// rounded each shoulder by half the tank width, producing contact where both
// visible corners were still clear.
const tankPush = push();
assert.equal(pushHullFromHull(
  0, 0, 0, 1, 1, 0, 3.5, 1.7,
  3.5, 4.3, 0, 1, 1, 0, 3.5, 1.7,
  tankPush,
), false, 'separated rectangular tank corners do not collide');
assert.equal(pushHullFromHull(
  0, 0, 0, 1, 1, 0, 3.5, 1.7,
  3.3, 3.3, 0, 1, 1, 0, 3.5, 1.7,
  tankPush,
), true, 'overlapping rectangular tank corners resolve with SAT');
assert.ok(Math.hypot(tankPush.x, tankPush.z) > 0,
  'tank OBB contact returns a minimum translation');

// Displaced-rock projected hull: convex silhouette, not its enclosing square.
const hull = convexHull2([[-1, 0], [0, -0.75], [1.15, 0], [0, 0.9], [0.2, 0.1]]);
assert.equal(hull.length, 8, 'convex hull drops interior rock points');
const rock = setConvexShape(rec(2), hull);
assert.equal(hullHit({ x: 0.9, z: 0.72 }, rock, 0.05, 0.05).hit, false,
  'rock AABB corner is not solid');
assert.equal(hullHit({ x: 1.12, z: 0 }, rock, 0.08, 0.08).hit, true,
  'rock convex silhouette remains solid');

const n = new Vector3();
assert.equal(rayCollisionRecord(
  new Vector3(3.3, 10, -3.3), new Vector3(0, -1, 0), building, 20, n), -1,
  'shell ray misses an empty rotated-box corner');
assert.ok(rayCollisionRecord(
  new Vector3(0, 10, 0), new Vector3(0, -1, 0), building, 20, n) >= 0,
  'shell ray hits the actual structure footprint');
assert.equal(rayCollisionRecord(
  new Vector3(0.9, 5, 0.9), new Vector3(0, -1, 0), trunk, 10, n), -1,
  'shell ray misses an empty cylinder AABB corner');

// Concave structure footprints retain their courtyards/recesses instead of
// turning the union's enclosing hull into invisible collision.
const lBuilding = setCompoundShape(rec(6), [
  { kind: 'obb', cx: -1.5, cz: 0, hw: 0.5, hl: 2, yaw: 0 },
  { kind: 'obb', cx: 0, cz: -1.5, hw: 2, hl: 0.5, yaw: 0 },
]);
assert.equal(lBuilding.shape2.kind, 'compound', 'multi-part structure keeps a compound footprint');
assert.equal(hullHit({ x: 0.8, z: 0.8 }, lBuilding, 0.1, 0.1).hit, false,
  'concave structure recess remains traversable');
assert.equal(hullHit({ x: -1.5, z: 0.8 }, lBuilding, 0.1, 0.1).hit, true,
  'compound structure arm remains solid');
assert.equal(rayCollisionRecord(
  new Vector3(0.8, 5, 0.8), new Vector3(0, -1, 0), lBuilding, 10, n), -1,
  'shell ray misses the compound structure recess');
assert.ok(rayCollisionRecord(
  new Vector3(-1.5, 5, 0.8), new Vector3(0, -1, 0), lBuilding, 10, n) >= 0,
  'shell ray hits a compound structure arm');
assert.equal(collisionFootprintContainsPoint(lBuilding, 0.8, 0.8, 0.1), false,
  'navigation point query keeps the compound recess open');
assert.equal(collisionFootprintContainsPoint(lBuilding, -1.5, 0.8, 0.1), true,
  'navigation point query detects a real compound arm');
assert.equal(rayCollisionFootprintEntry2(lBuilding, 0.8, 0.8, 1, 0, 5, 0.1), null,
  'navigation ray traverses an open compound recess');
assert.ok(rayCollisionFootprintEntry2(lBuilding, -4, 0.8, 1, 0, 5, 0.1) >= 1.8,
  'navigation ray finds the first real compound arm');

// Static-grid broad phase returns local records once, including multi-cell props.
const far = setCircleShape(rec(), 80, 80, 2);
const query = createObstacleGrid([building, trunk, rock, lBuilding, far], 8);
const out = [];
query(-5, -5, 5, 5, out);
assert.equal(out.includes(far), false, 'grid excludes distant environment props');
assert.equal(new Set(out).size, out.length, 'grid deduplicates multi-cell props');
assert.ok(out.includes(building) && out.includes(rock), 'grid keeps nearby exact shapes');
assert.equal(out.filter((record) => record === lBuilding).length, 1,
  'compound structure occupies one deduplicated broad-phase record');

// Map and headless worlds share tree records between independent movement and
// shell grids. Their visitation counters must never suppress each other's hits.
const sharedTree = setCircleShape(rec(5), 0, 0, 2);
const movementOnly = setCircleShape(rec(), -6, -6, 1);
const shellOnly = setCircleShape(rec(), 6, 6, 1);
const movementGrid = createObstacleGrid([movementOnly, sharedTree], 4);
const shellGrid = createObstacleGrid([sharedTree, shellOnly], 4);
const sharedOut = [];
for (let step = 0; step < 4; step++) {
  movementGrid(-8, -8, 8, 8, sharedOut);
  assert.deepEqual(sharedOut, [movementOnly, sharedTree],
    'movement query retains the shared tree after a shell-grid query');
  shellGrid(-8, -8, 8, 8, sharedOut);
  assert.deepEqual(sharedOut, [sharedTree, shellOnly],
    'shell query retains the shared tree after a movement-grid query');
}
movementGrid(20, 20, 21, 21, sharedOut);
assert.deepEqual(sharedOut, [], 'queries clear the caller-owned output');
shellGrid(-8, -8, 8, 8, sharedOut);
movementGrid(-8, -8, 8, 8, sharedOut);
assert.deepEqual(sharedOut, [movementOnly, sharedTree],
  'unequal grid counters do not interfere when queries are interleaved');

// Deduplication is by record identity, not input slot. Cell traversal order and
// original record references stay stable even when a record is supplied twice.
const duplicateGrid = createObstacleGrid([
  shellOnly, sharedTree, movementOnly, sharedTree,
], 4);
duplicateGrid(-8, -8, 8, 8, sharedOut);
assert.deepEqual(sharedOut, [movementOnly, sharedTree, shellOnly],
  'duplicate input references retain one hit in original cell traversal order');
assert.strictEqual(sharedOut[1], sharedTree, 'grid results preserve record identity');
assert.equal(Object.hasOwn(sharedTree, '__gridStamp'), false,
  'grid visitation does not mutate shared collision records');

const immutableRecord = Object.freeze({
  min: Object.freeze([-1, 0, -1]), max: Object.freeze([1, 2, 1]), dead: true,
});
const immutableInput = [immutableRecord];
const immutableGrid = createObstacleGrid(immutableInput, 4);
immutableInput.length = 0;
immutableGrid(-2, -2, 2, 2, sharedOut);
assert.deepEqual(sharedOut, [immutableRecord],
  'grid retains immutable original records independently of the input array');
assert.strictEqual(sharedOut[0], immutableRecord,
  'broad phase neither clones records nor filters gameplay state');
immutableGrid(1.5, 1.5, 1.75, 1.75, sharedOut);
assert.deepEqual(sharedOut, [], 'cell candidates still obey exact AABB rejection');

// Per-part vertical extents (2026-09-19, owner: "building hitboxes extend into empty air … if you try to fly
// over a building you just hit an invisible wall"): a low wing beside a tower, one compound record.
{
  const wingAndTower = setCompoundShape(rec(9), [
    { kind: 'obb', cx: -2, cz: 0, hw: 1.5, hl: 1.5, yaw: 0, y0: 0, y1: 2.5 },
    { kind: 'obb', cx: 2, cz: 0, hw: 1, hl: 1, yaw: 0, y0: 0, y1: 9 },
  ]);
  const lowHull = push(), highHull = push(), towerHull = push();
  assert.equal(pushHullFromObstacle({ x: -2, z: 0 }, 0, 1, 1, 0, 0.3, 0.3, wingAndTower, lowHull, 0.0, 2.4), true,
    'a hull on the ground is blocked by the low wing');
  assert.equal(pushHullFromObstacle({ x: -2, z: 0 }, 0, 1, 1, 0, 0.3, 0.3, wingAndTower, highHull, 3.2, 5.6), false,
    'a hull whose tracks clear the wing top passes over it');
  assert.equal(pushHullFromObstacle({ x: 2, z: 0 }, 0, 1, 1, 0, 0.3, 0.3, wingAndTower, towerHull, 3.2, 5.6), true,
    'the same hull is still blocked by the tower beside the wing');
  const under = push();
  const overhang = setCompoundShape(rec(6), [
    { kind: 'obb', cx: 0, cz: 0, hw: 2, hl: 2, yaw: 0, y0: 4, y1: 6 },
    { kind: 'obb', cx: 3, cz: 0, hw: 0.4, hl: 0.4, yaw: 0, y0: 0, y1: 6 },
  ]);
  assert.equal(pushHullFromObstacle({ x: 0, z: 0 }, 0, 1, 1, 0, 0.3, 0.3, overhang, under, 0.0, 2.6), false,
    'a hull whose body top stays under a raised deck passes beneath it');
  assert.ok(rayCollisionRecord(new Vector3(-2, 20, 0), new Vector3(0, -1, 0), wingAndTower, 40, n) > 17.4,
    'a plunging shell over the wing reaches the wing roof at 2.5 m, not the tower top');
  assert.equal(rayCollisionRecord(new Vector3(-2, 5, -10), new Vector3(0, 0, 1), wingAndTower, 20, n), -1,
    'a flat shell above the wing but below the tower top passes over the wing');
  assert.ok(rayCollisionRecord(new Vector3(2, 5, -10), new Vector3(0, 0, 1), wingAndTower, 20, n) >= 0,
    'the same flat shell hits the tower');
  const cloned = cloneCollisionRecord(wingAndTower);
  assert.deepEqual(cloned.shape2.parts.map((part) => [part.y0, part.y1]), [[0, 2.5], [0, 9]],
    'cloning keeps every part extent');
}

// Footprints in either winding (2026-10-03; railyard battlePacing seed 28003 ran to the 900 s cap). Captured convex
// parts arrive clockwise as well as counter-clockwise (935 parts in 503 records over the 33 maps' shards: structure roof
// strips, cable spools, stooks, wire), and the route probe, the shell ray and the clearance test read every footprint
// as counter-clockwise, so a clockwise part's inside was its outside: a shell through it passed, its centre was not in
// it, and a route probe "hit" it from far off — railyard's 4 m hut at x 194-198 pulled a T-90A searching west of it
// 90 m east to its corners, again and again, until the time limit.
{
  const area2 = (points) => points.reduce((sum, _, index) => (index % 2 ? sum : sum
    + points[index] * points[(index + 3) % points.length] - points[(index + 2) % points.length] * points[index + 1]), 0);
  // the railyard hut's clockwise wall sliver, as captured, and the route probe the T-90A cast from (102.3, 9.3)
  const sliverPoints = [195.158, -21.968, 196.545, -22.006, 195.174, -22.006];
  assert.ok(area2(sliverPoints) < 0, 'the captured sliver winds clockwise');
  const sliver = setConvexShape(rec(0.9), sliverPoints);
  const probeX = 75 - 102.3, probeZ = -25 - 9.3, probeLength = Math.hypot(probeX, probeZ);
  assert.equal(rayCollisionFootprintEntry2(sliver, 102.3, 9.3, probeX / probeLength, probeZ / probeLength, 85, 3.2), null,
    'a route probe passing 95 m clear of a clockwise sliver misses it (it read a hit at 35.9 m)');
  const n = new Vector3();
  for (const [winding, points] of [
    ['clockwise', [-2, -1, -2, 1, 2, 1, 2, -1]],
    ['counter-clockwise', [2, -1, 2, 1, -2, 1, -2, -1]],
  ]) {
    assert.equal(Math.sign(area2(points)), winding === 'clockwise' ? -1 : 1, `the ${winding} block winds ${winding}`);
    const block = setConvexShape(rec(3), points);
    const hit = rayCollisionRecord(new Vector3(-10, 1, 0.3), new Vector3(1, 0, 0), block, 20, n);
    assert.ok(Math.abs(hit - 8) < 1e-9 && Math.abs(n.x + 1) < 1e-9 && Math.abs(n.z) < 1e-9,
      `a shell through the ${winding} block hits its near face at 8 m, normal outward (${hit}, ${n.x}, ${n.z})`);
    assert.equal(rayCollisionRecord(new Vector3(-10, 1, 4), new Vector3(1, 0, 0), block, 20, n), -1,
      `a shell passing 3 m clear of the ${winding} block misses it`);
    assert.ok(Math.abs(rayCollisionRecord(new Vector3(0, 10, 0), new Vector3(0, -1, 0), block, 20, n) - 7) < 1e-9,
      `a plunging shell meets the ${winding} block's roof`);
    assert.equal(collisionFootprintContainsPoint(block, 0, 0, 0), true, `the ${winding} block holds its centre`);
    assert.equal(collisionFootprintContainsPoint(block, 0, 1.4, 0), false, `a point 0.4 m off the ${winding} block's side is outside it`);
    assert.equal(collisionFootprintContainsPoint(block, 0, 1.4, 0.5), true, `a 0.5 m clearance reaches past the ${winding} block's side`);
    assert.ok(Math.abs(rayCollisionFootprintEntry2(block, -10, 0, 1, 0, 20, 1) - 7) < 1e-9,
      `a route probe through the ${winding} block meets its 1 m clearance at 7 m`);
    assert.equal(rayCollisionFootprintEntry2(block, -10, 3, 1, 0, 20, 1), null,
      `a route probe 2 m clear of the ${winding} block passes its 1 m clearance`);
  }
}

// A nose or tail row alone over a record clears its parts as the track plane under it does, the tracks that meet them
// next; only standing on a top counts the step-up against it (round 3, Aegis Crossing: a viaduct span's 15 cm sub-deck
// slab a metre under the deck stopped a hull with no nose lift dead at every span joint, its nose read 0.55 m under its
// tracks). The boulder rule stands: a nose at 0.7 m does not step a level hull onto a 1.2 m rock; and a high glacis
// does not carry the hull over a low wall its tracks then meet.
{
  const rect = { centerX: 0, centerZ: 0, halfLength: 3.2, halfWidth: 1.6, frontLiftM: 0, rearLiftM: 0 };
  const foot = hullFootprint(rect, 0, 0, 0, 0, 0, createHullFootprint());
  // the next span: its slab 1 m under the deck the hull drives on (root at the deck top, y 2), its parapets over it
  const span = setCompoundShape({ min: [0, -38, 0], max: [0, 3.1, 0], kind: 'bridge' }, [
    { kind: 'obb', cx: 0, cz: 3 + 7.5, hw: 9, hl: 7.5, yaw: 0, y0: 0.83, y1: 0.98 },
    { kind: 'obb', cx: 8.8, cz: 3 + 7.5, hw: 0.2, hl: 7.5, yaw: 0, y0: 2, y1: 3.1 },
  ]);
  const stand = hullUndersideOver(span, foot, 2);
  assert.ok(Math.abs(stand - 1.45) < 1e-9 && Math.abs(foot.clearBottom - 2) < 1e-9,
    `only the nose is over the next span: it stands as 1.45, clears as 2 (${stand}, ${foot.clearBottom})`);
  const out = { x: 0, z: 0 };
  assert.equal(pushHullFromObstacle({ x: 0, z: 0 }, 0, 1, 1, 0, 3.2, 1.6, span, out, stand, 4.5, foot.clearBottom), false,
    'a nose a metre over the span\'s sub-deck slab passes over it (it was pushed back 0.31 m a step)');
  assert.equal(hullPassesObstacleTop(stand, 0.98, 0.83, true, foot.clearBottom), true, 'the slab is cleared');
  assert.equal(hullPassesObstacleTop(stand, 0.98, 0.83, true), false, 'read by the standing underside, it was not');
  // a level hull nosing into a 1.2 m rock, its nose 0.7 m up: the rock is a wall, not a step
  const lifted = hullFootprint({ ...rect, frontLiftM: 0.7 }, 0, 0, 0, 0, 0, createHullFootprint());
  const rock = setObbShape({ min: [0, 0, 0], max: [0, 1.2, 0] }, 0, 3.4, 1.5, 0.3, 0);
  const rockStand = hullUndersideOver(rock, lifted, 0);
  assert.equal(hullPassesObstacleTop(rockStand, 1.2, 0, true, lifted.clearBottom), false, 'the nose does not step onto the rock');
  // a glacis 1.2 m up over a 0.5 m wall clears it by its own height, never by its tracks: the wall stays a wall
  const glacis = hullFootprint({ ...rect, frontLiftM: 1.2 }, 0, 0, 0, 0, 0, createHullFootprint());
  const wall = setCompoundShape({ min: [0, 0, 0], max: [0, 0.5, 0] }, [
    { kind: 'obb', cx: 0, cz: 3.4, hw: 2, hl: 0.2, yaw: 0, y0: 0, y1: 0.5 },
  ]);
  const wallStand = hullUndersideOver(wall, glacis, 0);
  assert.ok(Math.abs(wallStand - 0.65) < 1e-9 && Math.abs(glacis.clearBottom) < 1e-9,
    `the glacis stands as 0.65, clears as its tracks, 0 (${wallStand}, ${glacis.clearBottom})`);
  assert.equal(pushHullFromObstacle({ x: 0, z: 0 }, 0, 1, 1, 0, 3.2, 1.6, wall, { x: 0, z: 0 }, wallStand, 4.5,
    glacis.clearBottom), true, 'the low wall pushes the hull whose glacis is over it');
}

console.log('collision.selftest: exact environment shapes and spatial broad phase passed');
