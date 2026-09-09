import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { compactWreckGeometryForPaintSteps, compactWreckGeometrySteps } from './exactWreckGeometry.ts';

// Execute the actual world-owned pipeline with a small deterministic Three
// hierarchy. Only the synchronous vehicle constructor is replaced here;
// wrecks.selftest exercises interleaved real first-party builders against its
// independent pre-change fingerprints. No Canvas, browser or timing gate.
const source = readFileSync(new URL('./wrecks.ts', import.meta.url), 'utf8');
const boundary = source.indexOf('export function wreckPool');
assert.ok(boundary > 0);
const body = source.slice(0, boundary).replace(/^import[\s\S]*?;\n/gm, '')
  .replace('  const panel = hash3(', '  observePaint();\n  const panel = hash3(');
assert.ok(body.includes('observePaint();'), 'actual production vertex painter is observed');
let active = null;
const fixtures = [];
const originalClone = THREE.BufferGeometry.prototype.clone;
const originalExpand = THREE.BufferGeometry.prototype.toNonIndexed;
function track(geometry, sourceGeometry = false) {
  assert.ok(active, 'every test allocation has an explicit invocation owner');
  const fixture = active;
  if (!fixture.geometries.has(geometry)) {
    fixture.geometries.set(geometry, 0);
    geometry.addEventListener('dispose', () => fixture.geometries.set(geometry,
      fixture.geometries.get(geometry) + 1));
  }
  if (sourceGeometry) fixture.sources.add(geometry);
  return geometry;
}
function cloneObserved(...args) {
  const geometry = track(originalClone.apply(this, args));
  active.clones++;
  if (active.failure === 'transform' && active.clones === 2) {
    geometry.applyMatrix4 = () => { throw new Error('transform failure'); };
  }
  if (active.failure === 'dispose' && active.clones === 1) {
    geometry.addEventListener('dispose', () => { throw new Error('dispose failure'); });
  }
  return geometry;
}
function expandObserved(...args) { return track(originalExpand.apply(this, args)); }
function inFixture(fixture, work) {
  const previous = active; active = fixture;
  try { return work(); } finally { active = previous; }
}
function fixture(options = {}) {
  const result = { seed: 2002, pop: true, failure: null, offset: 0,
    geometries: new Map(), sources: new Set(), materials: new Set(),
    clones: 0, painted: 0, poses: 0, disposals: 0, warnings: [], ...options };
  fixtures.push(result);
  return result;
}
function makeVisual(specId, context, options) {
  assert.equal(active, context);
  context.options = options;
  assert.equal(options.quality, 'low'); assert.equal(options.geometryQuality, 'low');
  assert.equal(options.materialMode, 'geometry-only');
  assert.equal(options.eraVisualBindingReceipt, false); assert.equal(options.proceduralOnly, true);
  assert.equal(options.camoSeed, 4000 + context.seed % 997);
  const root = new THREE.Group(); root.position.set(4, 2, -7); root.rotation.y = 0.31;
  const hull = new THREE.Group(); hull.position.set(context.offset, 1, 0); root.add(hull);
  const material = new THREE.MeshStandardMaterial(); context.materials.add(material);
  const shadowMaterial = new THREE.MeshBasicMaterial({ colorWrite: false }); context.materials.add(shadowMaterial);
  // Keep more than 2,048 unique rows after pre-paint deduplication so this
  // fixture still verifies an actual intermediate painter checkpoint.
  const bodyGeometry = track(new THREE.BoxGeometry(3, 2, 6, 16, 16, 16), true);
  hull.add(new THREE.Mesh(bodyGeometry, material));
  const instanceGeometry = track(new THREE.BoxGeometry(0.6, 0.7, 0.8), true);
  const instances = new THREE.InstancedMesh(instanceGeometry, material, 33);
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < instances.count; i++) {
    matrix.makeTranslation((i % 3) * 0.6, 0.1, (i % 11) * 0.5);
    instances.setMatrixAt(i, matrix);
  }
  hull.add(instances);
  const plainSource = track(new THREE.BoxGeometry(1, 1, 1), true);
  const plain = track(plainSource.toNonIndexed(), true);
  const missingNormal = new THREE.Mesh(plain, material);
  plain.deleteAttribute('normal'); missingNormal.position.x = -2; hull.add(missingNormal);
  const shadow = track(new THREE.BoxGeometry(3, 2, 5), true);
  root.add(new THREE.Mesh(shadow, shadowMaterial));
  return {
    root,
    setDestroyed(pose) {
      context.poses++; assert.deepEqual(pose, { pop: context.pop, ageS: 1000 });
      if (context.failure === 'pose') throw new Error('pose failure');
      hull.rotation.z = context.pop ? 0.09 : -0.04;
    },
    dispose() {
      context.disposals++;
      for (const geometry of context.sources) geometry.dispose();
      for (const material of context.materials) material.dispose();
      if (context.failure === 'dispose') throw new Error('visual dispose failure');
    },
  };
}
function mergeObserved(...args) {
  if (active.failure === 'merge') throw new Error('merge failure');
  const result = mergeGeometries(...args);
  return result && track(result);
}
function* compactObserved(geometry) {
  const steps = compactWreckGeometryForPaintSteps(geometry);
  try {
    let result = steps.next();
    while (!result.done) {
      yield result.value;
      if (active.failure === 'compact') throw new Error('compact failure');
      result = steps.next();
    }
    return result.value;
  } finally { steps.return(false); }
}
const api = new Function('THREE', 'mergeGeometries', 'compactWreckGeometryForPaintSteps',
  'compactWreckGeometrySteps', 'createTank', 'console', 'observePaint',
  stripTypeScriptTypes(body).replace(/^export /gm, '') + '\nreturn { bakeTankWreck, bakeTankWreckSteps };')(
  THREE, mergeObserved, compactObserved, compactWreckGeometrySteps, makeVisual,
  { warn(...args) { active.warnings.push(args); } },
  () => { active.painted++; });

function start(f) { return api.bakeTankWreckSteps(f, 'fixture', { seed: f.seed, pop: f.pop }); }
function advance(f, steps) { return inFixture(f, () => steps.next()); }
function collect(f) {
  const steps = start(f), stages = [];
  let next = advance(f, steps);
  while (!next.done) {
    assert.deepEqual(next.value, { fine: true, progress: false, stage: next.value.stage });
    assert.equal(f.disposals, 0, 'private visual stays live while its bake is suspended');
    if (next.value.stage === 'wreck-fixture:collect-instances-16') {
      assert.equal(f.clones, 17, 'first sixteen instances are cloned; later instances are still untouched');
    }
    if (next.value.stage === 'wreck-fixture:paint-vertices-2048') {
      assert.equal(f.painted, 2048, 'first vertex chunk yields before painting the remaining corners');
    }
    stages.push(next.value.stage);
    next = advance(f, steps);
  }
  return { result: next.value, stages };
}
function assertDisposed(f, result = null) {
  assert.equal(f.disposals, 1, 'each invocation disposes its visual exactly once');
  const retained = new Set(result ? [result.geo, result.shadowGeo] : []);
  for (const [geometry, count] of f.geometries) {
    assert.equal(count, retained.has(geometry) ? 0 : 1,
      'only transferred final geometries escape; indexed clones and expanded copies both drain');
  }
}
function geometrySnapshot(geometry) {
  if (!geometry) return null;
  return { attributes: Object.entries(geometry.attributes).map(([name, attribute]) => [name,
    attribute.itemSize, attribute.normalized, attribute.usage, attribute.gpuType, attribute.array.slice()]),
  index: geometry.index?.array.slice() ?? null, groups: geometry.groups, drawRange: geometry.drawRange,
  bounds: geometry.boundingBox && [geometry.boundingBox.min.toArray(), geometry.boundingBox.max.toArray()] };
}
function outputSnapshot(result) {
  return { bounds: [result.hx, result.hz, result.h, result.tris],
    geometry: geometrySnapshot(result.geo), shadow: geometrySnapshot(result.shadowGeo) };
}
function disposeOutput(result) { result?.geo.dispose(); result?.shadowGeo?.dispose(); }
function cancelAt(stages, checkpoint, method) {
  const f = fixture(), steps = start(f);
  for (let index = 0; index <= checkpoint; index++) {
    assert.equal(advance(f, steps).value.stage, stages[index]);
  }
  const beforeClones = f.clones;
  inFixture(f, () => {
    if (method === 'return') assert.equal(steps.return(null).done, true);
    else {
      const failure = new Error('original cancellation');
      assert.throws(() => steps.throw(failure), error => error === failure);
    }
  });
  assert.equal(advance(f, steps).done, true); assert.equal(f.clones, beforeClones);
  assert.equal(f.warnings.length, 0, 'caller cancellation is not swallowed as a failed optional wreck');
  assertDisposed(f);
}
try {
  THREE.BufferGeometry.prototype.clone = cloneObserved;
  THREE.BufferGeometry.prototype.toNonIndexed = expandObserved;
  const successful = fixture(), complete = collect(successful);
  assert.ok(complete.result); assertDisposed(successful, complete.result);
  assert.ok(complete.stages.includes('wreck-fixture:collect-instances-16'));
  assert.ok(complete.stages.includes('wreck-fixture:paint-vertices-2048'));
  assert.ok(complete.stages.includes('wreck-fixture:compact-index-2048'));
  assert.equal(complete.stages[0], 'wreck-fixture:construct');
  assert.equal(complete.stages.at(-1), 'wreck-fixture:finalize');
  disposeOutput(complete.result);
  for (let checkpoint = 0; checkpoint < complete.stages.length; checkpoint++) {
    for (const method of ['return', 'throw']) cancelAt(complete.stages, checkpoint, method);
  }
  for (const failure of ['pose', 'transform', 'merge', 'compact', 'dispose']) {
    const f = fixture({ failure }), baked = collect(f).result;
    if (failure === 'dispose') {
      assert.ok(baked, 'cleanup errors cannot replace successful output'); assertDisposed(f, baked); disposeOutput(baked);
    } else {
      assert.equal(baked, null); assert.equal(f.warnings.length, 1); assertDisposed(f);
    }
  }
  const options = [{ seed: 2002, offset: 0, pop: true }, { seed: 2526, offset: 3, pop: false }];
  const controls = options.map(option => {
    const f = fixture(option), baked = inFixture(f, () => api.bakeTankWreck(f, 'fixture', option));
    assertDisposed(f, baked); const snapshot = outputSnapshot(baked); disposeOutput(baked); return snapshot;
  });
  const jobs = options.map(option => { const f = fixture(option); return { f, steps: start(f), result: null }; });
  while (jobs.some(job => job.result === null)) for (const job of jobs) {
    if (job.result !== null) continue;
    const next = advance(job.f, job.steps);
    if (next.done) { assert.ok(next.value); job.result = next.value; }
  }
  jobs.forEach((job, index) => {
    assert.deepEqual(outputSnapshot(job.result), controls[index]);
    assertDisposed(job.f, job.result); disposeOutput(job.result);
  });
} finally {
  THREE.BufferGeometry.prototype.clone = originalClone;
  THREE.BufferGeometry.prototype.toNonIndexed = originalExpand;
  for (const f of fixtures) {
    for (const [geometry, count] of f.geometries) if (count === 0) {
      try { geometry.dispose(); } catch (_) { /* test failure cleanup */ }
    }
    for (const material of f.materials) material.dispose();
  }
}
console.log('wrecksSteps.selftest: real bounded work, interleaving and complete ownership drain at every return/throw checkpoint passed');
