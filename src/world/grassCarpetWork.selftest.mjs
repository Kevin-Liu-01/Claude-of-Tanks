import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as THREE from 'three';
import { createGrassCarpetWork, advanceGrassCarpetWork } from './grassCarpetWork.ts';

function seeded(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function trace() {
  const streams = [];
  return { streams, random(seed) {
    const rng = seeded(seed), row = { seed, calls: 0, last: 0 };
    streams.push(row);
    return () => { row.calls++; return row.last = rng(); };
  } };
}
function tuftMaker(blocked = () => false) {
  const t = new Array(10).fill(0);
  return (x, z, rng) => {
    const admit = rng(), yaw = rng() * Math.PI * 2, sx = .7 + rng() * .8;
    const sy = .5 + rng(), r = rng(), g = rng(), b = rng(), variant = rng() > .7 ? 1 : 0;
    if (admit < .18 || blocked(x, z)) return null;
    t[0] = x; t[1] = Math.sin(x * .07) - Math.cos(z * .05) - .03; t[2] = z;
    t[3] = yaw; t[4] = sx; t[5] = sy; t[6] = r; t[7] = g; t[8] = b; t[9] = variant;
    return t;
  };
}
const geometry = new THREE.PlaneGeometry(1, 1), material = new THREE.MeshBasicMaterial();
function fixture({ capacity = 2048, perCell = 47, ring = 1, cacheCapacity = 420, scratchRecords = 1024, blocked } = {}) {
  const cache = new Map(), rng = trace(), makeTuft = tuftMaker(blocked), scratch = new Float32Array(scratchRecords * 10);
  const sets = [0, 1].map(() => ({ active: 0, meshes: [0, 1].map(() => {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    mesh.count = 0; mesh.visible = false;
    return mesh;
  }) }));
  const publications = [];
  function publish(counts, x, z, generation) {
    publications.push({ x, z, generation, counts: [...counts] });
    for (let vv = 0; vv < 2; vv++) {
      const set = sets[vv], fresh = set.meshes[1 - set.active];
      fresh.count = counts[vv]; fresh.visible = counts[vv] > 0;
      fresh.instanceMatrix.clearUpdateRanges(); fresh.instanceMatrix.addUpdateRange(0, counts[vv] * 16);
      fresh.instanceMatrix.needsUpdate = true;
      fresh.instanceColor.clearUpdateRanges(); fresh.instanceColor.addUpdateRange(0, counts[vv] * 3);
      fresh.instanceColor.needsUpdate = true;
      set.meshes[set.active].visible = false; set.active = 1 - set.active;
    }
  }
  const options = { seed: 2001, cellSize: 16, ring, candidatesPerCell: perCell, capacity,
    cache, cacheCapacity, scratch, random: rng.random, makeTuft,
    targets: () => sets.map(set => ({ matrices: set.meshes[1 - set.active].instanceMatrix.array,
      colors: set.meshes[1 - set.active].instanceColor.array })), publish };
  return { cache, rng, makeTuft, scratch, sets, publications, options,
    dispose() { for (const set of sets) for (const mesh of set.meshes) mesh.dispose(); } };
}

// Independent copy of the original complete cell generator and original
// dz→dx→tuft rebuild. It does not call either new controller/transform helper.
function originalCell(f, ix, iz) {
  const key = ix + ',' + iz, old = f.cache.get(key);
  if (old) return old;
  const o = f.options;
  const random = f.rng.random((o.seed ^ 0x51ab ^ (ix * 374761393) ^ (iz * 668265263)) >>> 0);
  let n = 0;
  for (let i = 0; i < o.candidatesPerCell; i++) {
    const t = f.makeTuft(ix * 16 + random() * 16, iz * 16 + random() * 16, random);
    if (t && (n + 1) * 10 <= f.scratch.length) {
      t[4] *= .96; t[5] *= 1.04; f.scratch.set(t, n * 10); n++;
    }
  }
  const cell = f.scratch.slice(0, n * 10);
  f.cache.set(key, cell);
  if (f.cache.size > o.cacheCapacity) f.cache.delete(f.cache.keys().next().value);
  return cell;
}
function originalRebuild(f, x, z, generation) {
  const counts = [0, 0], targets = f.sets.map(s => s.meshes[1 - s.active]);
  for (let dz = -f.options.ring; dz <= f.options.ring; dz++) {
    for (let dx = -f.options.ring; dx <= f.options.ring; dx++) {
      const cell = originalCell(f, x + dx, z + dz);
      for (let o = 0; o < cell.length; o += 10) {
        const vv = cell[o + 9];
        if (counts[vv] >= f.options.capacity) continue;
        const i = counts[vv]++, m = targets[vv].instanceMatrix.array, c = targets[vv].instanceColor.array;
        const yaw = cell[o + 3], sn = Math.sin(yaw), cs = Math.cos(yaw), sxz = cell[o + 4], sy = cell[o + 5], mi = i * 16;
        m[mi] = cs * sxz; m[mi + 1] = 0; m[mi + 2] = -sn * sxz; m[mi + 3] = 0;
        m[mi + 4] = 0; m[mi + 5] = sy; m[mi + 6] = 0; m[mi + 7] = 0;
        m[mi + 8] = sn * sxz; m[mi + 9] = 0; m[mi + 10] = cs * sxz; m[mi + 11] = 0;
        m[mi + 12] = cell[o]; m[mi + 13] = cell[o + 1]; m[mi + 14] = cell[o + 2]; m[mi + 15] = 1;
        c[i * 3] = cell[o + 6]; c[i * 3 + 1] = cell[o + 7]; c[i * 3 + 2] = cell[o + 8];
      }
    }
  }
  f.options.publish(counts, x, z, generation);
}
function compare(a, b, whole = true) {
  for (let v = 0; v < 2; v++) {
    assert.equal(a.sets[v].active, b.sets[v].active);
    const am = a.sets[v].meshes[a.sets[v].active], bm = b.sets[v].meshes[b.sets[v].active];
    assert.equal(am.count, bm.count);
    assert.deepEqual(whole ? am.instanceMatrix.array : am.instanceMatrix.array.slice(0, am.count * 16),
      whole ? bm.instanceMatrix.array : bm.instanceMatrix.array.slice(0, bm.count * 16));
    assert.deepEqual(whole ? am.instanceColor.array : am.instanceColor.array.slice(0, am.count * 3),
      whole ? bm.instanceColor.array : bm.instanceColor.array.slice(0, bm.count * 3));
    assert.deepEqual(am.instanceMatrix.updateRanges, bm.instanceMatrix.updateRanges);
    assert.deepEqual(am.instanceColor.updateRanges, bm.instanceColor.updateRanges);
  }
}
function drain(work, cap) {
  let frames = 0;
  while (!work.complete) {
    const steps = advanceGrassCarpetWork(work, cap, 1.5, () => 0);
    assert.ok(steps > 0 && steps <= cap);
    assert.ok(++frames < 100000);
  }
}
for (const cap of [1, 17, 250, 100000]) {
  for (const settings of [{}, { capacity: 13, cacheCapacity: 7 },
    { scratchRecords: 3, blocked: (x, z) => x > 0 }, { perCell: 0 }]) {
    const baseline = fixture(settings), candidate = fixture(settings), work = createGrassCarpetWork(candidate.options);
    assert.equal(work.complete, true);
    assert.equal(work.getState().cold, true);
    let generation = 0;
    for (const [x, z] of [[0, 0], [1, 0], [2, 1], [-2, -3], [11, -9], [0, 0]]) {
      work.request(x, z);
      const pending = work.getState();
      assert.equal(pending.pending, true, 'request exposes pending before the first step');
      assert.deepEqual(pending.requestedCell, { x, z });
      const calls = candidate.rng.streams.reduce((n, s) => n + s.calls, 0);
      work.request(x, z);
      assert.equal(candidate.rng.streams.reduce((n, s) => n + s.calls, 0), calls, 'request does no hidden work');
      drain(work, cap);
      originalRebuild(baseline, x, z, ++generation);
      compare(candidate, baseline);
      assert.deepEqual([...candidate.cache], [...baseline.cache], 'exact cells AND FIFO insertion/eviction order');
      assert.deepEqual(candidate.rng.streams, baseline.rng.streams);
      assert.equal(work.getState().pending, false);
      assert.equal(work.getState().publishedGeneration, generation);
      assert.equal(work.getState().cold, false);
    }
    candidate.dispose(); baseline.dispose();
  }
}

// Rapid requests never publish stale targets or repeatedly restart the cell
// currently owning scratch. Completed cells remain cached in completion order.
for (const stage of ['candidates', 'cache', 'write', 'publish']) {
  const baseline = fixture(), candidate = fixture(), work = createGrassCarpetWork(candidate.options);
  work.request(0, 0);
  while (work.getState().stage !== stage) work.step();
  const before = work.getState(), saved = [...candidate.cache];
  work.request(5, 5); work.request(6, 4); work.request(7, 3);
  const copied = fixture();
  for (const [key, cell] of saved) copied.cache.set(key, cell);
  if (stage === 'candidates' || stage === 'cache') {
    originalCell(copied, before.buildingCell.x, before.buildingCell.z);
  }
  while (!work.complete) {
    advanceGrassCarpetWork(work, 7, 1.5, () => 0);
    if (!work.complete) assert.equal(candidate.publications.length, 0, 'obsolete target never flips');
  }
  for (const [key, cell] of copied.cache) baseline.cache.set(key, cell);
  originalRebuild(baseline, 7, 3, 4);
  compare(candidate, baseline, false);
  assert.deepEqual([...candidate.cache], [...baseline.cache]);
  assert.deepEqual(candidate.publications, baseline.publications);
  assert.equal(work.getState().publishedGeneration, 4);
  baseline.dispose(); candidate.dispose(); copied.dispose();
}

// Previously displayed halves remain byte-identical while a replacement is
// built. Cancellation drops only incomplete work, not the completed-cell FIFO.
for (const stage of ['cell', 'candidates', 'cache', 'write', 'publish']) {
  const f = fixture(), work = createGrassCarpetWork(f.options);
  work.request(0, 0); drain(work, 250);
  const live = f.sets.map(set => ({ active: set.active,
    matrices: set.meshes[set.active].instanceMatrix.array.slice(),
    colors: set.meshes[set.active].instanceColor.array.slice() }));
  work.request(10, 10);
  while (work.getState().stage !== stage) work.step();
  const saved = [...f.cache];
  for (const [v, set] of f.sets.entries()) {
    assert.equal(set.active, live[v].active);
    assert.deepEqual(set.meshes[set.active].instanceMatrix.array, live[v].matrices);
    assert.deepEqual(set.meshes[set.active].instanceColor.array, live[v].colors);
  }
  work.cancel(); work.cancel();
  assert.deepEqual([...f.cache], saved);
  assert.equal(f.publications.length, 1);
  assert.equal(work.getState().stage, 'cancelled');
  assert.equal(work.getState().pending, false);
  assert.throws(() => work.step(), /cancelled/); assert.throws(() => work.request(0, 0), /cancelled/);
  f.dispose();
}
{
  const f = fixture(), work = createGrassCarpetWork(f.options), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (const set of f.sets) for (const mesh of set.meshes) {
    mesh.count = 1; mesh.visible = true; mesh.setMatrixAt(0, zero);
  }
  const initialSlot = f.sets[0].meshes[1].instanceMatrix.array.slice(0, 16);
  work.request(0, 0);
  while (work.getState().stage !== 'publish') {
    work.step();
    for (const set of f.sets) assert.deepEqual(set.meshes[1].instanceMatrix.array.slice(0, 16), initialSlot,
      'first GPU upload during construction must still see the single zero-scale placeholder');
  }
  work.step();
  assert.notDeepEqual(f.sets[0].meshes[1].instanceMatrix.array.slice(0, 16), initialSlot);
  f.dispose();
}
{
  const source = readFileSync(new URL('./vegetation.ts', import.meta.url), 'utf8');
  const start = source.indexOf('  function publishCarpet(');
  const end = source.indexOf("  yield { stage: 'grassCarpet' };", start);
  assert.ok(start > 0 && end > start);
  const f = fixture();
  for (const set of f.sets) for (const mesh of set.meshes) { mesh.visible = true; mesh.count = 1; }
  const publish = new Function('carpetSets', `${stripTypeScriptTypes(source.slice(start, end))}; return publishCarpet;`)(f.sets);
  publish([3, 0]);
  for (const [v, set] of f.sets.entries()) {
    assert.equal(set.active, 1);
    assert.equal(set.meshes[0].visible, true, 'never-filled boot half remains GPU-warmable');
    assert.equal(set.meshes[0].count, 1);
    const fresh = set.meshes[1], count = v === 0 ? 3 : 0;
    assert.equal(fresh.count, count); assert.equal(fresh.visible, count > 0);
    assert.deepEqual(fresh.instanceMatrix.updateRanges, [{ start: 0, count: count * 16 }]);
    assert.deepEqual(fresh.instanceColor.updateRanges, [{ start: 0, count: count * 3 }]);
    assert.equal(fresh.userData.carpetFilled, true);
  }
  publish([0, 4]);
  for (const set of f.sets) {
    assert.equal(set.active, 0);
    assert.equal(set.meshes[1].visible, false, 'previously filled stale half is hidden only on full replacement');
  }
  f.dispose();
}
{
  const f = fixture(), work = createGrassCarpetWork(f.options);
  work.request(0, 0);
  let clock = 0;
  assert.equal(advanceGrassCarpetWork(work, 250, 1.5, () => clock++), 2);
  assert.equal(advanceGrassCarpetWork(work, 250, 1.5, () => NaN), 1);
  assert.equal(advanceGrassCarpetWork(work, 3, 1.5, () => 0), 3);
  assert.equal(advanceGrassCarpetWork(work, Infinity, 1.5, () => 0), 0);
  assert.equal(advanceGrassCarpetWork(work, 250, 0, () => 0), 0);
  assert.throws(() => work.request(NaN, 0), /Invalid/);
  work.cancel(); f.dispose();
}

// A declared synthetic cost model is a scheduling/liveness check, not measured
// browser performance: cold 49-cell generation plus 20 m/s camera movement.
// The 4096 hard cap permits cheap instance writes to spend the time allowance
// instead of invalidating an 80-frame, 250-write prefix on every 48-frame move.
{
  const candidate = fixture({ capacity: 52000, perCell: 420, ring: 3 });
  const baseline = fixture({ capacity: 52000, perCell: 420, ring: 3 });
  const work = createGrassCarpetWork(candidate.options), step = work.step.bind(work);
  let simulatedMs = 0;
  work.step = () => {
    const stage = work.getState().stage;
    step();
    simulatedMs += stage === 'candidates' ? .004 : stage === 'write' ? .00035 : stage === 'publish' ? .06 : .0006;
  };
  let publications = 0, firstPublication = null, longestPending = 0, pendingSince = 0;
  for (let frame = 0; frame < 480; frame++) {
    if (frame % 48 === 0) {
      const alreadyPending = work.getState().pending;
      work.request(Math.floor(frame / 48), 0);
      if (!alreadyPending) pendingSince = frame;
    }
    const steps = advanceGrassCarpetWork(work, 4096, 1.5, () => simulatedMs);
    assert.ok(steps <= 4096);
    if (candidate.publications.length > publications) {
      publications = candidate.publications.length;
      firstPublication ??= frame;
      longestPending = Math.max(longestPending, frame - pendingSince);
      const p = candidate.publications.at(-1);
      assert.equal(p.x, Math.floor(frame / 48), 'publish current camera target while movement continues');
      originalRebuild(baseline, p.x, p.z, p.generation);
      compare(candidate, baseline, false);
      pendingSince = frame;
    }
  }
  assert.ok(firstPublication < 96, `cold build cannot starve across repeated crossings (${firstPublication})`);
  assert.ok(publications >= 8, `sustained movement publishes repeatedly (${publications})`);
  assert.ok(longestPending < 96, `camera movement cannot indefinitely invalidate output (${longestPending})`);
  candidate.dispose(); baseline.dispose();
}
geometry.dispose(); material.dispose();
console.log('grassCarpetWork: independent original RNG/admission/Float32/order/cache parity; bounded cold/rebuild; latest-target coalescing; no partial flips; cancellation and deadlines pass');
