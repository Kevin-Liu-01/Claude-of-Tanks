import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createTank, ensureTankBuilder } from '../vehicles/fleetFactory.ts';
import { compactWreckGeometryForPaintSteps, compactWreckGeometrySteps } from './exactWreckGeometry.ts';

// Explicit 5a13dadb0 pipeline control: paint every expanded corner, then run
// the unchanged generic all-attribute compactor. The original source was
// wrecks.ts SHA256 b85d8ff80200391459bff5c7045daa305d01fd9c1919018d69922eddf5b0c9a8.
// Only sequencing differs; both paths use actual first-party constructors,
// the production painter, and exact-word compaction. Older nonstaged M1A1 and
// Type10 stream goldens remain independently asserted by wrecks.selftest.mjs.
const source = readFileSync(new URL('./wrecks.ts', import.meta.url), 'utf8');
const boundary = source.indexOf('export function wreckPool');
assert.ok(boundary > 0);
const preparation = '    const preparedForPaint = yield* compactWreckGeometryForPaintSteps(merged);';
const fallback = '    if (!preparedForPaint) yield* compactWreckGeometrySteps(merged);';
assert.equal(source.split(preparation).length, 2);
assert.equal(source.split(fallback).length, 2);

function pipeline(control, counts) {
  let body = source.slice(0, boundary).replace(/^import[\s\S]*?;\n/gm, '');
  if (control) body = body.replace(preparation, '').replace(fallback,
    '    yield* compactWreckGeometrySteps(merged);');
  const painterAnchor = '  const panel = hash3(';
  assert.equal(body.split(painterAnchor).length, 2);
  body = body.replace(painterAnchor, '  observePaint();\n' + painterAnchor);
  return new Function('THREE', 'mergeGeometries', 'compactWreckGeometryForPaintSteps',
    'compactWreckGeometrySteps', 'createTank', 'observePaint',
    stripTypeScriptTypes(body).replace(/^export /gm, '') + '\nreturn { bakeTankWreck, bakeTankWreckSteps };')(
    THREE, mergeGeometries, compactWreckGeometryForPaintSteps, compactWreckGeometrySteps,
    createTank, () => { counts.painted++; });
}

function arrayIdentity(array) {
  return [array.constructor.name, array.length, createHash('sha256')
    .update(Buffer.from(array.buffer, array.byteOffset, array.byteLength)).digest('hex')];
}

function geometryIdentity(geometry) {
  if (!geometry) return null;
  return {
    attributes: Object.entries(geometry.attributes).map(([name, attribute]) => [name,
      attribute.itemSize, attribute.normalized, attribute.name, attribute.usage, attribute.gpuType,
      arrayIdentity(attribute.array)]),
    index: geometry.index && arrayIdentity(geometry.index.array),
    groups: geometry.groups, drawRange: geometry.drawRange,
    bounds: geometry.boundingBox && [geometry.boundingBox.min.toArray(), geometry.boundingBox.max.toArray()],
    sphere: geometry.boundingSphere && [geometry.boundingSphere.center.toArray(), geometry.boundingSphere.radius],
  };
}

function outputIdentity(baked) {
  assert.ok(baked, 'real geometry-only first-party bake must succeed');
  assert.equal(baked.tris * 3, baked.geo.index?.count ?? baked.geo.attributes.position.count);
  return { bounds: [baked.hx, baked.hz, baked.h, baked.tris],
    visible: geometryIdentity(baked.geo), shadow: geometryIdentity(baked.shadowGeo) };
}

function dispose(baked) { baked?.geo.dispose(); baked?.shadowGeo?.dispose(); }

function originalControl(fixture) {
  const counts = { painted: 0 }, api = pipeline(true, counts);
  const baked = api.bakeTankWreck(null, fixture.specId, fixture);
  try {
    const output = outputIdentity(baked);
    assert.equal(counts.painted, baked.tris * 3, '5a13 control paints every original triangle corner');
    return { output, painted: counts.painted };
  } finally { dispose(baked); }
}

assert.equal(typeof globalThis.document, 'undefined', 'wreck work does not acquire Canvas or texture painters');
const fixtures = [{ specId: 't90m', seed: 2526, pop: false }, { specId: 'k2', seed: 2002, pop: true }];
for (const fixture of fixtures) await ensureTankBuilder(fixture.specId);
const controls = fixtures.map(originalControl), receipts = [];
const jobs = fixtures.map(fixture => {
  const counts = { painted: 0 }, api = pipeline(false, counts);
  return { fixture, counts, steps: api.bakeTankWreckSteps(null, fixture.specId, fixture),
    baked: null, checkpoints: 0, compactionBeforePaint: false };
});
try {
  while (jobs.some(job => job.baked === null)) for (const job of jobs) {
    if (job.baked !== null) continue;
    const next = job.steps.next();
    if (next.done) { assert.ok(next.value); job.baked = next.value; continue; }
    job.checkpoints++;
    assert.equal(next.value.progress, false);
    if (next.value.stage.includes(':compact-index-')) {
      assert.equal(job.counts.painted, 0, 'actual index construction precedes every color evaluation');
      job.compactionBeforePaint = true;
    }
  }
  jobs.forEach((job, index) => {
    assert.deepEqual(outputIdentity(job.baked), controls[index].output,
      'exact raw storage/index implies identical ordered triangles, colors, shadows and bounds');
    assert.equal(job.counts.painted, job.baked.geo.attributes.position.count);
    assert.ok(job.counts.painted < controls[index].painted, 'optimization removes actual paint calls');
    assert.ok(job.compactionBeforePaint && job.checkpoints > 20);
    receipts.push({ ...job.fixture, originalPaintCalls: controls[index].painted,
      candidatePaintCalls: job.counts.painted, removedPaintCalls: controls[index].painted - job.counts.painted,
      checkpoints: job.checkpoints, output: outputIdentity(job.baked) });
  });
} finally {
  for (const job of jobs) { job.steps.return(null); dispose(job.baked); }
}
console.log('wreckPaintDedup.selftest: exact 5a13 storage/shadows/triangles and interleaved real paint-call reduction',
  JSON.stringify(receipts));
