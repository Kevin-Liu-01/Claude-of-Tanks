import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import {
  convexHull2, createObstacleGrid, pushHullFromObstacle,
  rayCollisionRecord, setCircleShape, setConvexShape, setObbShape,
} from './collision.js';

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

// Static-grid broad phase returns local records once, including multi-cell props.
const far = setCircleShape(rec(), 80, 80, 2);
const query = createObstacleGrid([building, trunk, rock, far], 8);
const out = [];
query(-5, -5, 5, 5, out);
assert.equal(out.includes(far), false, 'grid excludes distant environment props');
assert.equal(new Set(out).size, out.length, 'grid deduplicates multi-cell props');
assert.ok(out.includes(building) && out.includes(rock), 'grid keeps nearby exact shapes');

console.log('collision.selftest: exact environment shapes and spatial broad phase passed');
