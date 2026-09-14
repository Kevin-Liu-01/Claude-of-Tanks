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
  // Test-only bounded reconstruction: hash original corner bits, not compact
  // storage order. The independent pre-indexing goldens below stay unchanged.
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

function assertBakeFingerprint(baked, expected) {
  assert.ok(baked, `${expected.specId}: real geometry-only bake succeeds`);
  assert.deepEqual([baked.tris, baked.hx, baked.hz, baked.h], expected.bounds);
  assert.deepEqual(Object.keys(baked.geo.attributes).sort(), ['color', 'normal', 'position']);
  assert.deepEqual(Object.keys(baked.shadowGeo.attributes), ['position']);
  assert.equal(baked.shadowGeo.index, null);
  const attributes = ['position', 'normal', 'color'].map(name => baked.geo.attributes[name]);
  attributes.push(baked.shadowGeo.attributes.position);
  const indices = [baked.geo.index, baked.geo.index, baked.geo.index, null];
  assert.deepEqual(attributes.map((attribute, i) =>
    (indices[i]?.count ?? attribute.count) * attribute.itemSize * attribute.array.BYTES_PER_ELEMENT), expected.bytes);
  assert.ok(attributes.reduce((sum, attribute) => sum + attribute.array.byteLength, 0)
    + (baked.geo.index?.array.byteLength ?? 0) <= expected.bytes.reduce((sum, bytes) => sum + bytes, 0),
  'compaction never increases retained geometry storage');
  assert.deepEqual(attributes.map(attribute => [attribute.itemSize, attribute.normalized]),
    [[3, false], [3, false], [3, false], [3, false]]);
  assert.deepEqual(attributes.map((attribute, i) => attributeHash(attribute, indices[i])), expected.hashes,
    `${expected.specId}: original bake attribute bytes`);
  assertPainterBranches(baked.geo.attributes.color.array);
}

// Immutable receipts captured from the original tuple-returning production
// painter (wrecks.ts SHA256 3c8f7b23732bbecec720728cfc7e572394c01c15f50796716c45f0021134ec4a).
// These independently cover two real vehicle families, all color branches,
// posed geometry, normals, shadow geometry and exact bounds—not a copy of the
// new arithmetic or a source-fragment mock.
const originalBakeFixtures = [
  {
    // 2026-09-13 wheel review + interior fills: m1a1 draws the hollow paired road wheel, lost
    // the gear_wheelBayVoidDress blocks and carries generated interior fills, so its wreck bake
    // gains triangles (38560 -> 44884); bounds, byte sizes and the three visible-attribute hashes
    // are repinned from the current build. The shadow geometry hash is unchanged.
    specId: 'm1a1', seed: 2002,
    bounds: [44884, 4.026729702949524, 3.9549999237060547, 2.698679208755493],
    bytes: [1615824, 1615824, 1615824, 6984],
    hashes: [
      '9e75abed40410720f1c7dfadd28f894a194a76962a2bb258ffca8c9ec7a6d76c',
      '2270b9c5c430a52c22b36f605796e9207e9fc16d58e803f7e831426899da9946',
      'f99706a61be758f3dade9c53d08d8a8b51d032d35271399ae58a311ab43b2c58',
      'c6fceff4985f5bc2f0f996528717780d69bac42d9a1c54b7621b75c2f66bcaf4',
    ],
  },
  {
    // 2026-09-13 interior fills: type10 carries generated interior fills (every hull and turret
    // does now), so its wreck bake gains triangles (31508 -> 35660); repinned from the current build.
    specId: 'type10', seed: 2133,
    bounds: [35660, 4.445803761482239, 3.807588815689087, 3.2575206756591797],
    bytes: [1283760, 1283760, 1283760, 7704],
    hashes: [
      '10f53877ffad5b5fefd7c6a486ac58b72b84a9cc00c9587bc718ac5eee48be05',
      '714ea127c67a7f6daef74469d8f269f09b28e967f9076e35324d5946ca0f69c7',
      '0fa67efc076a5981ea09fe1300d6e2c4613761b840527a2c564fac02e587a7ce',
      'ca8a28e323d0ac81a158deb7c69ad329581bbf69c80a53a79bcb53dcbb771b44',
    ],
  },
];
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
const storageControls = new Map();
for (const fixture of originalBakeFixtures) {
  await ensureTankBuilder(fixture.specId);
  const baked = bakeTankWreck(null, fixture.specId, { seed: fixture.seed, pop: true });
  try {
    assertBakeFingerprint(baked, fixture);
    storageControls.set(fixture.specId, storageFingerprint(baked));
    const color = baked.geo.attributes.color.array;
    const original = color[0];
    color[0] = original + 0.05;
    assert.throws(() => assertBakeFingerprint(baked, fixture), /original bake attribute bytes/,
      'a changed RGB value must fail even with geometry, normals and capacity unchanged');
    color[0] = original;
    assertBakeFingerprint(baked, fixture);
  } finally {
    baked?.geo.dispose();
    baked?.shadowGeo?.dispose();
  }
}

// Suspend two real production hierarchies simultaneously. Existing independent
// pre-change fingerprints certify the streams; sync/steps also retain the exact
// compact storage/index selection, not merely equivalent expanded triangles.
const pending = originalBakeFixtures.map(fixture => ({ fixture,
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
      assertBakeFingerprint(job.result, job.fixture);
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

console.log('wrecks.selftest: deterministic debris and exact original two-family wreck bytes preserved with reusable color scratch');
