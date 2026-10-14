// The world raycasts' prop phase marched along the ray (collision.ts nearestColliderHitAlongRay, 2026-10-12, the perf
// stream) answers exactly what the one box around the whole ray answered (createObstacleGrid + nearestColliderHit):
// the same distance, the same record and the same normal, ties included, over randomized fields of every footprint
// kind, dead records and duplicated shapes, for long oblique aim rays, short shell steps and near-vertical rays.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import {
  COLLIDER_RAY_STEP_M, createObstacleGrid, nearestColliderHit, nearestColliderHitAlongRay,
  setCircleShape, setCompoundShape, setConvexShape, setObbShape,
} from './collision.ts';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const normal = () => ({ x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } });
const rec = (y0, y1) => ({ min: [0, y0, 0], max: [0, y1, 0] });

/** A field of `count` records over ±half m: OBBs, circles, convex hulls and compounds, some dead, some duplicated. */
function field(seed, count, half) {
  const rnd = mulberry32(seed);
  const records = [];
  for (let i = 0; i < count; i++) {
    const x = (rnd() * 2 - 1) * half, z = (rnd() * 2 - 1) * half;
    const y0 = rnd() < 0.2 ? rnd() * 2 : 0, y1 = y0 + 0.5 + rnd() * 14;
    const kind = rnd();
    let r;
    if (kind < 0.35) r = setObbShape(rec(y0, y1), x, z, 0.3 + rnd() * 9, 0.3 + rnd() * 9, rnd() * Math.PI);
    else if (kind < 0.6) r = setCircleShape(rec(y0, y1), x, z, 0.2 + rnd() * 3);
    else if (kind < 0.8) {
      const pts = [];
      for (let k = 0; k < 6; k++) { const a = rnd() * Math.PI * 2, d = 0.5 + rnd() * 6; pts.push(x + Math.cos(a) * d, z + Math.sin(a) * d); }
      r = setConvexShape(rec(y0, y1), pts);
    } else {
      const parts = [];
      for (let k = 0; k < 3; k++) {
        parts.push({ kind: 'obb', cx: x + (rnd() - 0.5) * 12, cz: z + (rnd() - 0.5) * 12, hw: 0.4 + rnd() * 4, hl: 0.4 + rnd() * 4,
          yaw: rnd() * Math.PI, ...(rnd() < 0.5 ? { y0, y1: y0 + rnd() * (y1 - y0) } : {}) });
      }
      r = setCompoundShape(rec(y0, y1), parts);
    }
    if (rnd() < 0.05) r.dead = true;
    records.push(r);
    // an identical twin (the same footprint at the same place): every ray that meets one meets the other at the same
    // distance, so the winner is decided by the broad phase's order alone
    if (rnd() < 0.08) {
      const twin = { ...r, min: [...r.min], max: [...r.max] };
      records.push(twin);
    }
  }
  return records;
}

function reference(query, origin, dir, maxDist) {
  const endX = origin.x + dir.x * maxDist, endZ = origin.z + dir.z * maxDist;
  const out = [];
  query(Math.min(origin.x, endX), Math.min(origin.z, endZ), Math.max(origin.x, endX), Math.max(origin.z, endZ), out);
  const n = normal();
  const hit = nearestColliderHit(out, origin, dir, maxDist, n, { distance: Infinity, record: null });
  return { distance: hit.distance, record: hit.record, n: [n.x, n.y, n.z], candidates: out.length };
}

let rays = 0, hits = 0, ties = 0, marched = 0;
let refMs = 0, newMs = 0;
const scratch = [];
for (const [seed, count, half, cell] of [[11, 1600, 700, 24], [12, 4000, 520, 24], [13, 600, 300, 8], [14, 2500, 800, 24]]) {
  const records = field(seed, count, half);
  const query = createObstacleGrid(records, cell);
  const rnd = mulberry32(seed * 977);
  for (let i = 0; i < 800; i++) {
    const origin = new Vector3((rnd() * 2 - 1) * half, 1 + rnd() * 12, (rnd() * 2 - 1) * half);
    const kind = rnd();
    // aim rays (long, nearly level), shell steps (short), a lob and near-vertical rays
    const dir = kind < 0.6 ? new Vector3(rnd() * 2 - 1, (rnd() - 0.6) * 0.08, rnd() * 2 - 1)
      : kind < 0.85 ? new Vector3(rnd() * 2 - 1, (rnd() - 0.5) * 0.6, rnd() * 2 - 1)
        : new Vector3((rnd() - 0.5) * 0.05, -1, (rnd() - 0.5) * 0.05);
    dir.normalize();
    const maxDist = kind < 0.6 ? 800 + rnd() * 700 : kind < 0.85 ? 2 + rnd() * 120 : 30;
    const t0 = performance.now();
    const ref = reference(query, origin, dir, maxDist);
    const t1 = performance.now();
    const n = normal();
    const got = nearestColliderHitAlongRay(query, origin, dir, maxDist, n, { distance: Infinity, record: null }, scratch);
    const t2 = performance.now();
    refMs += t1 - t0; newMs += t2 - t1;
    rays++;
    if (maxDist * (Math.abs(dir.x) + Math.abs(dir.z)) > COLLIDER_RAY_STEP_M * 1.5) marched++;
    assert.equal(got.distance, ref.distance, `seed ${seed} ray ${i}: the same distance`);
    assert.strictEqual(got.record, ref.record, `seed ${seed} ray ${i}: the same record`);
    if (ref.record) {
      hits++;
      assert.deepEqual([n.x, n.y, n.z], ref.n, `seed ${seed} ray ${i}: the same normal`);
      if (records.some((r) => r !== ref.record && r.min[0] === ref.record.min[0] && r.max[2] === ref.record.max[2] && r.shape2 === ref.record.shape2)) ties++;
    }
  }
}
assert.ok(hits > 600 && marched > 900 && ties > 8, `the fields exercised hits, marched rays and twin ties (${hits}, ${marched}, ${ties})`);

// A broad phase without the grid's order (another owner's query function) answers from its one box.
{
  const records = field(21, 300, 200);
  const grid = createObstacleGrid(records, 24);
  const plain = (minX, minZ, maxX, maxZ, out) => grid(minX, minZ, maxX, maxZ, out);
  const origin = new Vector3(-150, 2, -140), dir = new Vector3(1, 0, 0.9).normalize();
  const n = normal();
  const got = nearestColliderHitAlongRay(plain, origin, dir, 900, n, { distance: Infinity, record: null }, scratch);
  const ref = reference(grid, origin, dir, 900);
  assert.equal(got.distance, ref.distance);
  assert.strictEqual(got.record, ref.record);
}

console.log(`colliderRayMarch.selftest: ${rays} rays (${marched} marched, ${hits} hits, ${ties} on identical twins) exact; `
  + `one box ${refMs.toFixed(0)} ms, marched ${newMs.toFixed(0)} ms`);
