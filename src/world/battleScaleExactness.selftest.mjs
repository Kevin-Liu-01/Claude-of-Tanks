// perf-249 (the battle-scale performance item, 2026-10-24): the battle step's hot reads were made cheaper without
// changing a bit of what they answer. Each is held here to the pre-249 code, ported verbatim as the reference:
// 1. the obstacle grid's dense cell table (collision.ts createObstacleGrid) answers every box with the same records in
//    the same order as the hashed cells, and a field too wide for a table keeps the hashed cells;
// 2. the ray narrow phase's padded plan test (collision.ts nearestColliderHit) skips only records the full scan finds no
//    hit on: the same distance, record and normal, ties included, with footprints standing up to 0.5 mm past their boxes
//    (the packed records' Float32 boxes stand 0.32 mm past at most);
// 3. the contact surface's last-cell memo (terrainContactSurface.ts) answers every height, split and normal as the
//    sampler without it, over runs on one cell, steep folds and seeded grids;
// 4. the ground overlay's lattice cache (sim/terrainDeformation.ts) answers every contact offset as the direct sum, as
//    craters, rising heaps and earthworks land, the clock steps, and the overlay resets.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import {
  createObstacleGrid, nearestColliderHit, rayCollisionRecord, setCircleShape, setCompoundShape, setConvexShape, setObbShape,
} from './collision.ts';
import { createTerrainContactSampler, terrainCellFlipped, terrainCellFoldCandidate, terrainCellHeight } from './terrainContactSurface.ts';
import { createTerrainDeformation } from '../sim/terrainDeformation.ts';

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

/** Records of every footprint kind over ±half m; `shrinkM` pulls each box in by up to that much (a packed box). */
function field(seed, count, half, shrinkM = 0) {
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
      for (let k = 0; k < 4; k++) {
        parts.push({ kind: 'obb', cx: x + (rnd() - 0.5) * 12, cz: z + (rnd() - 0.5) * 12, hw: 0.4 + rnd() * 4, hl: 0.4 + rnd() * 4,
          yaw: rnd() * Math.PI, ...(rnd() < 0.5 ? { y0, y1: y0 + rnd() * (y1 - y0) } : {}) });
      }
      r = setCompoundShape(rec(y0, y1), parts);
    }
    if (shrinkM > 0) {
      r.min[0] += rnd() * shrinkM; r.max[0] -= rnd() * shrinkM; r.min[2] += rnd() * shrinkM; r.max[2] -= rnd() * shrinkM;
    }
    if (rnd() < 0.05) r.dead = true;
    records.push(r);
    if (rnd() < 0.08) records.push({ ...r, min: [...r.min], max: [...r.max] });
  }
  return records;
}

// ---- 1. the dense obstacle grid --------------------------------------------------------------------------------------
/** createObstacleGrid's query before perf-249: the hashed cells. */
function referenceGrid(records, cellSize = 24) {
  const indexedRecords = [...new Set(records)];
  const visited = new Uint32Array(indexedRecords.length);
  const cells = new Map();
  const inv = 1 / cellSize;
  const key = (x, z) => (x + 32768) * 65536 + (z + 32768);
  for (let i = 0; i < indexedRecords.length; i++) {
    const r = indexedRecords[i];
    const x0 = Math.floor(r.min[0] * inv), x1 = Math.floor(r.max[0] * inv);
    const z0 = Math.floor(r.min[2] * inv), z1 = Math.floor(r.max[2] * inv);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const k = key(x, z);
      let a = cells.get(k);
      if (!a) { a = []; cells.set(k, a); }
      a.push(i);
    }
  }
  let stamp = 0;
  return (minX, minZ, maxX, maxZ, out) => {
    out.length = 0;
    stamp++;
    const x0 = Math.floor(minX * inv), x1 = Math.floor(maxX * inv);
    const z0 = Math.floor(minZ * inv), z1 = Math.floor(maxZ * inv);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const a = cells.get(key(x, z));
      if (!a) continue;
      for (let i = 0; i < a.length; i++) {
        const index = a[i];
        if (visited[index] === stamp) continue;
        visited[index] = stamp;
        const r = indexedRecords[index];
        if (r.max[0] < minX || r.min[0] > maxX || r.max[2] < minZ || r.min[2] > maxZ) continue;
        out.push(r);
      }
    }
    return out;
  };
}
let boxes = 0, found = 0;
{
  // a battlefield, a dense small-cell field, records strewn 200 km apart (too wide for a table: the hashed cells), none
  const far = field(33, 400, 600);
  for (let i = 0; i < far.length; i += 7) { const r = far[i], dx = (i % 2 ? 1 : -1) * 2e5; r.min[0] += dx; r.max[0] += dx; }
  for (const [label, records, cell, half] of [['battlefield', field(31, 3000, 520), 24, 560], ['fine', field(32, 1200, 300), 8, 320],
    ['strewn', far, 24, 600], ['empty', [], 24, 100]]) {
    const grid = createObstacleGrid(records, cell), ref = referenceGrid(records, cell);
    const rnd = mulberry32(records.length + cell);
    const a = [], b = [];
    for (let i = 0; i < 1500; i++) {
      const x = (rnd() * 2 - 1) * half, z = (rnd() * 2 - 1) * half, w = rnd() < 0.8 ? rnd() * 30 : rnd() * 400, d = rnd() * 30;
      grid(x, z, x + w, z + d, a);
      ref(x, z, x + w, z + d, b);
      assert.equal(a.length, b.length, `${label} box ${i}: the same count`);
      for (let k = 0; k < a.length; k++) assert.strictEqual(a[k], b[k], `${label} box ${i}: the same record at ${k}`);
      boxes++; found += a.length;
    }
    // a box that is not finite finds what the hashed cells find (nothing)
    assert.equal(grid(NaN, 0, 10, 10, a).length, ref(NaN, 0, 10, 10, b).length, `${label}: a NaN box`);
  }
}
assert.ok(found > 8000, `the boxes found records to compare (${found})`);

// ---- 2. the ray narrow phase's padded plan test ----------------------------------------------------------------------
/** nearestColliderHit before perf-249 (a field without openings): every live candidate's narrow phase, in order. */
function referenceNearest(candidates, origin, dir, maxDist) {
  let best = Infinity, record = null;
  const n = normal(), out = normal();
  for (const candidate of candidates) {
    if (candidate.dead) continue;
    const distance = rayCollisionRecord(origin, dir, candidate, Math.min(maxDist, best), n);
    if (distance >= 0 && distance < best) { best = distance; record = candidate; out.set(n.x, n.y, n.z); }
  }
  return { distance: best, record, n: [out.x, out.y, out.z] };
}
let rays = 0, hits = 0;
for (const [seed, shrink] of [[41, 0], [42, 0.0005], [43, 0.0003]]) {
  const records = field(seed, 900, 260, shrink);
  const rnd = mulberry32(seed * 131);
  for (let i = 0; i < 2500; i++) {
    const origin = new Vector3((rnd() * 2 - 1) * 260, rnd() * 14, (rnd() * 2 - 1) * 260);
    const kind = rnd();
    const dir = kind < 0.55 ? new Vector3(rnd() * 2 - 1, (rnd() - 0.6) * 0.1, rnd() * 2 - 1)
      : kind < 0.8 ? new Vector3(rnd() * 2 - 1, (rnd() - 0.5) * 0.8, rnd() * 2 - 1)
        : kind < 0.9 ? new Vector3((rnd() - 0.5) * 1e-13, -1, (rnd() - 0.5) * 0.05) // a plan direction under the slab epsilon
          : new Vector3(1, 0, (rnd() - 0.5) * 1e-6); // grazing a box face
    dir.normalize();
    const maxDist = kind < 0.55 ? 50 + rnd() * 500 : kind < 0.8 ? 1 + rnd() * 80 : rnd() < 0.5 ? 30 : Infinity;
    const n = normal();
    const got = nearestColliderHit(records, origin, dir, maxDist, n, { distance: Infinity, record: null });
    const ref = referenceNearest(records, origin, dir, maxDist);
    assert.equal(got.distance, ref.distance, `seed ${seed} ray ${i}: the same distance`);
    assert.strictEqual(got.record, ref.record, `seed ${seed} ray ${i}: the same record`);
    if (ref.record) { hits++; assert.deepEqual([n.x, n.y, n.z], ref.n, `seed ${seed} ray ${i}: the same normal`); }
    rays++;
  }
}
assert.ok(hits > 2000, `the rays met records to compare (${hits} of ${rays})`);

// ---- 3. the contact surface's last-cell memo -------------------------------------------------------------------------
/** createTerrainContactSampler's height, split and normal before perf-249 (no memo). */
function referenceSampler(heightAt) {
  const SIZE = 1024, HALF = SIZE / 2, CHUNK = 128, SEGMENTS = 96, CELLS = SIZE / CHUNK * SEGMENTS, N = CELLS + 1, STEP = CHUNK / SEGMENTS;
  const heights = new Float32Array(N * N), ready = new Uint8Array(N * N), coordinates = new Float32Array(N), exact = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const chunk = Math.min(Math.floor(i / SEGMENTS), SIZE / CHUNK - 1);
    exact[i] = -HALF + chunk * CHUNK + (i - chunk * SEGMENTS) * STEP;
    coordinates[i] = exact[i];
  }
  const vertex = (x, z) => { const i = z * N + x; if (!ready[i]) { heights[i] = heightAt(exact[x], exact[z]); ready[i] = 1; } return heights[i]; };
  const cell = (value) => {
    let i = Math.max(0, Math.min(CELLS - 1, Math.floor((value + HALF) / STEP)));
    if (i > 0 && value < coordinates[i]) i--;
    else if (i < CELLS - 1 && value > coordinates[i + 1]) i++;
    return i;
  };
  const flipped = (ix, iz, a, b, c, d) => terrainCellFoldCandidate(a, b, c, d)
    && terrainCellFlipped(a, b, c, d, Math.fround(heightAt(exact[ix] + STEP * 0.5, exact[iz] + STEP * 0.5)));
  const sample = (x, z) => {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return 0;
    if (x < -HALF || x > HALF || z < -HALF || z > HALF) return heightAt(x, z);
    const ix = cell(x), iz = cell(z);
    const u = (x - coordinates[ix]) / (coordinates[ix + 1] - coordinates[ix]);
    const v = (z - coordinates[iz]) / (coordinates[iz + 1] - coordinates[iz]);
    const a = vertex(ix, iz), b = vertex(ix + 1, iz), c = vertex(ix, iz + 1), d = vertex(ix + 1, iz + 1);
    return terrainCellHeight(a, b, c, d, u, v, flipped(ix, iz, a, b, c, d));
  };
  sample.cellFlippedAt = (x, z) => {
    if (!Number.isFinite(x) || !Number.isFinite(z) || x < -HALF || x > HALF || z < -HALF || z > HALF) return false;
    const ix = cell(x), iz = cell(z);
    return flipped(ix, iz, vertex(ix, iz), vertex(ix + 1, iz), vertex(ix, iz + 1), vertex(ix + 1, iz + 1));
  };
  return sample;
}
// gentle swell with a wall in the west, and in the east crests running along the cells' a–d diagonals (x − z constant,
// 56-degree flanks): steep convex folds whose centres lie on the crest, the cells that take the a–d split
const STEP_M = 128 / 96;
const heightAt = (x, z) => {
  if (x < 0) return 3 * Math.sin(x * 0.07) * Math.cos(z * 0.05) + (Math.abs(x + 40) < 3 ? 4 : 0);
  const u = (x - z) / STEP_M;
  return 20 - 1.5 * STEP_M * Math.abs((((u % 6) + 6) % 6) - 3) + 0.2 * Math.sin(z * 0.03);
};
let samples = 0, flips = 0;
{
  const got = createTerrainContactSampler(heightAt), ref = referenceSampler(heightAt);
  // a seeded grid first (grass seating's path), some of it over cells the sampler then reads
  const grid = new Float32Array(10 * 10);
  for (let gz = 0; gz < 10; gz++) for (let gx = 0; gx < 10; gx++) grid[gz * 10 + gx] = heightAt(-128 + (gx - 1) * (128 / 96), -128 + (gz - 1) * (128 / 96));
  got.seedGrid(-128, -128, 128 / 96, 10, grid, heightAt);
  const rnd = mulberry32(51);
  const n = new Vector3();
  let x = 30, z = -20;
  for (let i = 0; i < 60000; i++) {
    const r = rnd();
    // runs along a track line on one cell and its neighbours, jumps, the same point twice, the edges and off the square
    if (r < 0.6) { x += (rnd() - 0.5) * 0.9; z += (rnd() - 0.5) * 0.4; }
    else if (r < 0.9) { x = (rnd() * 2 - 1) * 200; z = (rnd() * 2 - 1) * 200; }
    else if (r < 0.95) { x = rnd() < 0.5 ? -512 : 512; z = (rnd() * 2 - 1) * 512; }
    else if (r < 0.97) { x = 600; z = 0; }
    const h = got(x, z), hr = ref(x, z);
    assert.ok(Object.is(h, hr), `sample ${i} at (${x}, ${z}): ${h} vs ${hr}`);
    const f = got.cellFlippedAt(x, z);
    assert.equal(f, ref.cellFlippedAt(x, z), `split ${i} at (${x}, ${z})`);
    if (f) flips++;
    if (i % 7 === 0) {
      // another point's split and a normal between a sample and its split read (neither moves the memo)
      const ox = x + 1.7, oz = z - 0.9;
      assert.equal(got.cellFlippedAt(ox, oz), ref.cellFlippedAt(ox, oz), `split ${i} beside`);
      got.normalAt(ox, oz, n);
      assert.equal(got.cellFlippedAt(x, z), f, `split ${i} after a normal`);
    }
    samples++;
  }
}
assert.ok(flips > 500, `the samples read flipped cells (${flips})`);

// ---- 4. the ground overlay's lattice cache ---------------------------------------------------------------------------
const LATTICE_STEP = 128 / 96, LATTICE_CELLS = 768, HALF_M = 512;
/** contactOffsetAt before perf-249: the lattice corners' offsets read through offsetAt every time. */
function referenceContactOffset(overlay, x, z, flipped = false) {
  // (an empty bucket reads 0; a NaN coordinate names no bucket and reads through, as it always did)
  if (!overlay.near(x, z) && !Number.isNaN(x) && !Number.isNaN(z)) return 0;
  const lattice = (ix, iz) => overlay.offsetAt(-HALF_M + ix * LATTICE_STEP, -HALF_M + iz * LATTICE_STEP);
  const gx = Math.max(0, Math.min(LATTICE_CELLS - 1e-6, (x + HALF_M) / LATTICE_STEP));
  const gz = Math.max(0, Math.min(LATTICE_CELLS - 1e-6, (z + HALF_M) / LATTICE_STEP));
  const ix = Math.floor(gx), iz = Math.floor(gz);
  const u = gx - ix, v = gz - iz;
  const b = lattice(ix + 1, iz), c = lattice(ix, iz + 1);
  if (flipped) {
    const a = lattice(ix, iz), d = lattice(ix + 1, iz + 1);
    return u >= v ? a + (b - a) * u + (d - b) * v : a + (c - a) * v + (d - c) * u;
  }
  if (u + v <= 1) {
    const a = lattice(ix, iz);
    return a + (b - a) * u + (c - a) * v;
  }
  const d = lattice(ix + 1, iz + 1);
  return d + (c - d) * (1 - u) + (b - d) * (1 - v);
}
let offsets = 0, raised = 0;
{
  const overlay = createTerrainDeformation();
  const rnd = mulberry32(61);
  const centres = [[0, 0], [120, -40], [-300, 250], [505, 505], [-511, -509]];
  const check = (label) => {
    for (let i = 0; i < 400; i++) {
      const [cx, cz] = centres[Math.floor(rnd() * centres.length)];
      const x = cx + (rnd() - 0.5) * 30, z = cz + (rnd() - 0.5) * 30, flipped = rnd() < 0.3;
      const got = overlay.contactOffsetAt(x, z, flipped), ref = referenceContactOffset(overlay, x, z, flipped);
      assert.ok(Object.is(got, ref), `${label} offset ${i} at (${x}, ${z}): ${got} vs ${ref}`);
      if (got !== 0) raised++;
      offsets++;
    }
    for (const [x, z] of [[NaN, 0], [0, NaN], [-HALF_M, -HALF_M], [HALF_M, HALF_M], [700, 0]]) {
      assert.ok(Object.is(overlay.contactOffsetAt(x, z), referenceContactOffset(overlay, x, z)), `${label} at (${x}, ${z})`);
    }
  };
  overlay.setTime(0);
  check('bare');
  for (let k = 0; k < 6; k++) {
    const [cx, cz] = centres[k % centres.length];
    overlay.addCrater(cx + (rnd() - 0.5) * 8, cz + (rnd() - 0.5) * 8, 1.5 + rnd() * 3, 0.6 + rnd(), 0.3 + rnd() * 0.4, Math.floor(rnd() * 1e9));
  }
  check('craters');
  // a heap rising on the clock, one risen at once, an earthwork
  overlay.addRubble(120, -40, 6, 9, 0.4, 2.2);
  overlay.addRubble(-300, 250, 5, 5, 1.1, 1.6, -100);
  const s = Math.sin(0.3), c = Math.cos(0.3);
  overlay.addCourse({ kind: 'course', cx: 0, cz: 0, yaw: 0.3, c, s, hw: 3, skirtM: 2, profile: new Float64Array([-12, 0, -4, 1.2, 4, 1.4, 12, 0]) });
  check('heaps');
  for (let step = 1; step <= 12; step++) {
    overlay.setTime(step * 0.5);
    check(`clock ${step}`);
    if (step === 4) overlay.addCrater(121, -41, 2.5, 1, 0.4, 77);
  }
  // the same clock again, then backwards (a replay's rewind)
  overlay.setTime(6);
  check('same clock');
  overlay.setTime(1);
  check('rewound clock');
  overlay.reset();
  check('reset');
  overlay.addCrater(0, 0, 3, 1, 0.5, 9);
  check('after reset');
}
assert.ok(raised > 1500, `the overlay raised and dug the points compared (${raised} of ${offsets})`);

console.log(`battleScaleExactness.selftest: ${boxes} grid boxes (${found} records) in the same order; ${rays} rays (${hits} hits) `
  + `the same hit, record and normal; ${samples} contact samples (${flips} on flipped cells) to the bit; ${offsets} overlay offsets `
  + `(${raised} raised or dug) to the bit through craters, heaps, earthworks, clock steps and a reset`);
