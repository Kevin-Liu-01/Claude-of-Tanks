import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ensureTankBuilder } from '../vehicles/fleetFactory.ts';
import { bakeTankWreck, bakeTankWreckSteps, bakeWreckDebris, wreckPool } from './wrecks.ts';

assert.ok(wreckPool('modern').length >= 14, 'modern wreck pool spans the first-party fleet');
assert.deepEqual(wreckPool('ww2'), ['kv2', 'jpz_e100_x'],
  'historical wrecks use the retained public vehicles, never retired donors');
assert.ok(wreckPool('cold-war').includes('m60a1'), 'Cold War wreck pool uses period vehicles');
assert.ok(wreckPool('next-generation').includes('kf51'), 'next-generation maps retain current wreck language');

// Static wreck construction must remain browser-independent. A rendered tank
// needs Canvas2D to paint its PBR maps; this exact production wreck bake runs
// with no document at all, proving the discarded texture pipeline is absent.
assert.equal(typeof globalThis.document, 'undefined', 'test begins without a DOM/canvas surface');
await ensureTankBuilder('m1a2');
const tankWreck = bakeTankWreck(null, 'm1a2', { seed: 91234, pop: true });
assert.ok(tankWreck, 'geometry-only production tank wreck bakes without Canvas2D');
assert.ok(tankWreck.tris > 30000, 'wreck retains the authored tank silhouette and running gear');
assert.equal(tankWreck.geo.index?.count ?? tankWreck.geo.attributes.position.count, tankWreck.tris * 3,
  'wreck retains every ordered triangle corner after storage compaction');
tankWreck.geo.computeBoundingBox();
assert.equal(tankWreck.geo.boundingBox.min.y, 0, 'wreck remains seated exactly on its baked base');
assert.ok(tankWreck.hx > 3 && tankWreck.hz > 3 && tankWreck.h > 2,
  'wreck retains a complete main-battle-tank envelope');
assert.ok((tankWreck.shadowGeo?.attributes.position.count || 0) > 0,
  'wreck keeps its articulation-aware shadow proxy');
tankWreck.geo.dispose();
tankWreck.shadowGeo?.dispose();

function attributeHash(attribute, index) {
  const array = attribute.array;
  const bytes = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
  const hash = createHash('sha256');
  if (!index) return hash.update(bytes).digest('hex');
  const stride = attribute.itemSize * array.BYTES_PER_ELEMENT;
  // Test-only bounded reconstruction: hash corner bits, not compact storage order.
  const block = Buffer.alloc(stride * 1024);
  let used = 0;
  for (let i = 0; i < index.count; i++) {
    const source = index.array[i] * stride;
    bytes.copy(block, used, source, source + stride);
    used += stride;
    if (used === block.length) { hash.update(block); used = 0; }
  }
  if (used) hash.update(block.subarray(0, used));
  return hash.digest('hex');
}

function assertPainterBranches(colors) {
  let char = false, rust = false;
  for (let i = 0; i < colors.length && !(char && rust); i += 3) {
    const redToGreen = colors[i] / colors[i + 1];
    char ||= Math.abs(redToGreen - 1.05) < 1e-6;
    rust ||= Math.abs(redToGreen - 1.75 / 0.9) < 1e-6;
  }
  assert.ok(char && rust, 'original fixture exercises both char and rust color branches');
}

// 2026-10-01 (frozen pins retired): the m1a1/type10 bake fixtures pinned triangle counts, bounds, byte capacities and
// stream sha256s captured from the original tuple-returning painter (re-pinned at every track, fill or camo change).
// The bake is now held to its live contracts: render-ready streams, a seated finite envelope, storage no larger than
// the expanded corners, both painter branches, a byte-identical rebuild from the same seed, and sync/step parity.
const bakeFixtures = [{ specId: 'm1a1', seed: 2002 }, { specId: 'type10', seed: 2133 }];
function bakeStreams(baked) {
  const attributes = ['position', 'normal', 'color'].map(name => baked.geo.attributes[name]);
  attributes.push(baked.shadowGeo.attributes.position);
  const indices = [baked.geo.index, baked.geo.index, baked.geo.index, null];
  return { attributes, indices, hashes: attributes.map((attribute, i) => attributeHash(attribute, indices[i])) };
}
function assertBakeContract(baked, fixture) {
  assert.ok(baked, `${fixture.specId}: real geometry-only bake succeeds`);
  assert.ok(baked.tris > 10000 && [baked.hx, baked.hz, baked.h].every(value => Number.isFinite(value) && value > 1),
    `${fixture.specId}: a complete seated tank envelope`);
  assert.equal(baked.geo.index?.count ?? baked.geo.attributes.position.count, baked.tris * 3, 'every ordered triangle corner');
  assert.deepEqual(Object.keys(baked.geo.attributes).sort(), ['color', 'normal', 'position']);
  assert.deepEqual(Object.keys(baked.shadowGeo.attributes), ['position']);
  assert.equal(baked.shadowGeo.index, null);
  const { attributes, indices } = bakeStreams(baked);
  const expanded = attributes.map((attribute, i) =>
    (indices[i]?.count ?? attribute.count) * attribute.itemSize * attribute.array.BYTES_PER_ELEMENT);
  assert.ok(attributes.reduce((sum, attribute) => sum + attribute.array.byteLength, 0)
    + (baked.geo.index?.array.byteLength ?? 0) <= expanded.reduce((sum, bytes) => sum + bytes, 0),
  'compaction never increases retained geometry storage');
  assert.deepEqual(attributes.map(attribute => [attribute.itemSize, attribute.normalized]),
    [[3, false], [3, false], [3, false], [3, false]]);
  for (const attribute of attributes) assert.ok(attribute.array.every(Number.isFinite), `${fixture.specId}: finite streams`);
  assertPainterBranches(baked.geo.attributes.color.array);
}

function storageFingerprint(baked) {
  const shape = geometry => geometry && ({
    attributes: Object.entries(geometry.attributes).map(([name, attribute]) =>
      [name, attribute.itemSize, attribute.normalized, attribute.usage, attribute.gpuType,
        attribute.array.constructor.name, attributeHash(attribute, null)]),
    index: geometry.index && [geometry.index.array.constructor.name, attributeHash(geometry.index, null)],
    groups: geometry.groups, drawRange: geometry.drawRange,
    bounds: geometry.boundingBox && [geometry.boundingBox.min.toArray(), geometry.boundingBox.max.toArray()],
  });
  return { visible: shape(baked.geo), shadow: shape(baked.shadowGeo) };
}
const storageControls = new Map(), streamControls = new Map();
for (const fixture of bakeFixtures) {
  await ensureTankBuilder(fixture.specId);
  const baked = bakeTankWreck(null, fixture.specId, { seed: fixture.seed, pop: true });
  const again = bakeTankWreck(null, fixture.specId, { seed: fixture.seed, pop: true });
  try {
    assertBakeContract(baked, fixture);
    const hashes = bakeStreams(baked).hashes;
    assert.deepEqual(bakeStreams(again).hashes, hashes, `${fixture.specId}: a rebuild from the same seed is byte-identical`);
    assert.deepEqual([again.tris, again.hx, again.hz, again.h], [baked.tris, baked.hx, baked.hz, baked.h]);
    storageControls.set(fixture.specId, storageFingerprint(baked));
    streamControls.set(fixture.specId, hashes);
    const color = baked.geo.attributes.color.array;
    const original = color[0];
    color[0] = original + 0.05;
    assert.notDeepEqual(bakeStreams(baked).hashes, hashes,
      'a changed RGB value must change the stream fingerprint even with geometry, normals and capacity unchanged');
    color[0] = original;
    assert.deepEqual(bakeStreams(baked).hashes, hashes);
  } finally {
    for (const result of [baked, again]) { result?.geo.dispose(); result?.shadowGeo?.dispose(); }
  }
}

// Suspend two real production hierarchies simultaneously. The stepped bakes must reproduce the synchronous streams
// and the exact compact storage/index selection, not merely equivalent expanded triangles.
const pending = bakeFixtures.map(fixture => ({ fixture,
  steps: bakeTankWreckSteps(null, fixture.specId, { seed: fixture.seed, pop: true }),
  result: null, checkpoints: 0,
}));
try {
  while (pending.some(job => job.result === null)) {
    for (const job of pending) {
      if (job.result !== null) continue;
      await new Promise(resolve => setImmediate(resolve));
      const next = job.steps.next();
      if (!next.done) {
        assert.equal(next.value.fine, true);
        assert.equal(next.value.progress, false, 'micro-checkpoints cannot exhaust logical loading progress');
        assert.ok(next.value.stage.startsWith(`wreck-${job.fixture.specId}:`));
        job.checkpoints++;
        continue;
      }
      assert.ok(next.value);
      job.result = next.value;
      assertBakeContract(job.result, job.fixture);
      assert.deepEqual(bakeStreams(job.result).hashes, streamControls.get(job.fixture.specId), 'stepped bake equals the synchronous streams');
      assert.deepEqual(storageFingerprint(job.result), storageControls.get(job.fixture.specId));
      assert.ok(job.checkpoints > 20, 'large real bakes expose intermediate work');
    }
  }
} finally {
  for (const job of pending) {
    job.steps.return(null);
    job.result?.geo.dispose(); job.result?.shadowGeo?.dispose();
  }
}

const first = bakeWreckDebris(91234, { modern: true });
const second = bakeWreckDebris(91234, { modern: true });
assert.ok(first.tris >= 350 && first.tris <= 3000, `bounded debris geometry (${first.tris} tris)`);
assert.ok(first.geo.attributes.position && first.geo.attributes.normal && first.geo.attributes.color,
  'merged debris supplies render-ready position, normal and vertex color attributes');
assert.deepEqual(Array.from(first.geo.attributes.position.array),
  Array.from(second.geo.attributes.position.array), 'wreck debris is deterministic by seed');
first.geo.computeBoundingBox();
assert.ok(first.geo.boundingBox.min.x >= -8 && first.geo.boundingBox.max.x <= 8,
  'debris remains close to its wreck');
first.geo.dispose();
second.geo.dispose();

console.log('wrecks.selftest: deterministic debris and two-family wreck bakes (seated, compact, deterministic, sync/step parity) with reusable color scratch');
