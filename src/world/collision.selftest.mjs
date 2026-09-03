import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import {
  convexHull2, createObstacleGrid, pushHullFromObstacle,
  pushHullFromHull, rayCollisionRecord, setCircleShape, setCompoundShape,
  setConvexShape, setObbShape,
} from './collision.ts';

const rec = (y1 = 3) => ({ min: [0, 0, 0], max: [0, y1, 0] });
const push = () => ({ x: 0, y: 0, z: 0, set() {} });
const hullHit = (pos, ob, halfL = 0.3, halfW = 0.3) => {
  const out = push();
  return { hit: pushHullFromObstacle(pos, 0, 1, 1, 0, halfL, halfW, ob, out), out };
};

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

// Static-grid broad phase returns local records once, including multi-cell props.
const far = setCircleShape(rec(), 80, 80, 2);
const query = createObstacleGrid([building, trunk, rock, lBuilding, far], 8);
const out = [];
query(-5, -5, 5, 5, out);
assert.equal(out.includes(far), false, 'grid excludes distant environment props');
assert.equal(new Set(out).size, out.length, 'grid deduplicates multi-cell props');
assert.ok(out.includes(building) && out.includes(rock), 'grid keeps nearby exact shapes');

console.log('collision.selftest: exact environment shapes and spatial broad phase passed');
