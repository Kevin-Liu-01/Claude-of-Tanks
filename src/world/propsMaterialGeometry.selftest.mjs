import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mergePropsMaterialGeometrySteps, PROPS_CONVERSION_BATCH_LIMIT,
  PROPS_CONVERSION_BUDGET_MS } from './propsMaterialGeometry.ts';

const owned = new Set();
const own = geometry => { owned.add(geometry); return geometry; };
const disposed = new Map();
const observeDisposal = geometry => {
  geometry.addEventListener('dispose', () => disposed.set(geometry, (disposed.get(geometry) || 0) + 1));
  return geometry;
};
const arrayOf = attribute => attribute.isInterleavedBufferAttribute ? attribute.data.array : attribute.array;
const bytesOf = attribute => {
  const array = arrayOf(attribute);
  return new Uint8Array(array.buffer, array.byteOffset, array.byteLength).slice();
};
function attributeReceipt(attribute) {
  return { type: arrayOf(attribute).constructor.name, itemSize: attribute.itemSize,
    normalized: attribute.normalized, count: attribute.count, name: attribute.name,
    usage: attribute.usage, gpuType: attribute.gpuType, bytes: bytesOf(attribute) };
}
function receipt(geometry) {
  return {
    index: geometry.index && attributeReceipt(geometry.index),
    attributes: Object.entries(geometry.attributes).map(([key, attr]) => [key, attributeReceipt(attr)]),
    morphs: Object.entries(geometry.morphAttributes).map(([key, attrs]) => [key, attrs.map(attributeReceipt)]),
    morphTargetsRelative: geometry.morphTargetsRelative,
    groups: geometry.groups.map(group => ({ ...group })), drawRange: { ...geometry.drawRange },
    boundingBox: geometry.boundingBox?.clone() ?? null, boundingSphere: geometry.boundingSphere?.clone() ?? null,
  };
}
function fixture(offset = 0, indexed = true) {
  const geometry = own(new THREE.BufferGeometry());
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    offset, -0, 0, offset + 1, 0, 0, offset + 1, 1, 0, offset, 1, 0,
  ], 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  const uv = new THREE.InterleavedBuffer(new Float32Array([0, 0, 77, 1, 0, 88, 1, 1, 99, 0, 1, 66]), 3);
  geometry.setAttribute('uv', new THREE.InterleavedBufferAttribute(uv, 2, 0));
  geometry.setAttribute('color', new THREE.Uint8BufferAttribute([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 3, true));
  geometry.setAttribute('nightMask', new THREE.Uint16BufferAttribute([0, 65535, 12, 91], 1));
  geometry.morphAttributes.position = [geometry.attributes.position.clone()];
  geometry.morphTargetsRelative = true;
  geometry.setIndex([0, 1, 2, 2, 3, 0]);
  geometry.addGroup(0, 3, 2); geometry.addGroup(3, 3, 5);
  geometry.setDrawRange(1, 4);
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return observeDisposal(indexed ? geometry : own(geometry.toNonIndexed()));
}
function trackedSources(count, clock = null) {
  const sources = [], converted = [], order = [];
  for (let index = 0; index < count; index++) {
    const geometry = fixture(index);
    const native = geometry.toNonIndexed.bind(geometry);
    geometry.toNonIndexed = () => {
      order.push(index);
      const result = observeDisposal(own(native()));
      converted.push(result);
      if (clock) clock.value += clock.cost;
      return result;
    };
    sources.push(geometry);
  }
  return { sources, converted, order };
}
function drain(iterator) {
  const slices = [];
  let result = iterator.next();
  while (!result.done) { slices.push(result.value); result = iterator.next(); }
  if (result.value) own(result.value);
  return { geometry: result.value, slices };
}
function originalMerge(sources) {
  const prepared = sources.map(geometry => geometry.index ? own(geometry.toNonIndexed()) : geometry);
  return own(mergeGeometries(prepared, false));
}
function assertSourcesIntact(sources, before) {
  sources.forEach((geometry, index) => {
    assert.equal(disposed.get(geometry) || 0, 0, 'borrowed source was never disposed');
    assert.deepEqual(receipt(geometry), before[index], 'source attributes/index/morphs/groups/bounds remain unchanged');
  });
}
function assertReleased(geometries) {
  assert.ok(geometries.length > 0, 'fixture exercised converted ownership');
  for (const geometry of geometries) assert.equal(disposed.get(geometry), 1, 'temporary owner released exactly once');
}
function parityCase(helper = mergePropsMaterialGeometrySteps) {
  const sources = [fixture(1), fixture(5, false), fixture(-3)];
  sources.push(sources[0]); // duplicate references are valid; preserve every occurrence.
  const before = sources.map(receipt), expected = originalMerge(sources);
  const result = drain(helper(sources, 'brick', () => 0));
  assert.deepEqual(receipt(result.geometry), receipt(expected), 'same native merge, exact ordered attribute bytes/metadata');
  assertSourcesIntact(sources, before);
  assert.deepEqual(result.slices, [{ fine: true, progress: false, stage: 'material-convert:brick' }]);
}
function boundedCase(helper = mergePropsMaterialGeometrySteps) {
  const f = trackedSources(PROPS_CONVERSION_BATCH_LIMIT * 2 + 3);
  const iterator = helper(f.sources, 'wood', () => 0);
  let previous = 0, result = iterator.next(), slices = 0;
  while (!result.done) {
    slices++;
    assert.ok(f.order.length > previous && f.order.length - previous <= PROPS_CONVERSION_BATCH_LIMIT,
      'even a frozen clock cannot exceed the hard source-count cap');
    assert.equal(result.value.progress, false); assert.equal(result.value.fine, true);
    assert.equal(f.converted.some(geometry => disposed.has(geometry)), false, 'private conversion buffers remain live until merge');
    previous = f.order.length;
    result = iterator.next();
  }
  own(result.value);
  assert.equal(slices, 3);
  assert.deepEqual(f.order, Array.from({ length: f.sources.length }, (_, index) => index));
  assertReleased(f.converted);
  assertSourcesIntact(f.sources, f.sources.map(receipt));
}
function cleanupCase(helper = mergePropsMaterialGeometrySteps) {
  const f = trackedSources(3), iterator = helper(f.sources, 'stone', () => 0);
  assert.equal(iterator.next().done, false, 'last conversion yields before final native merge');
  iterator.return(); iterator.return();
  assertReleased(f.converted);
  assertSourcesIntact(f.sources, f.sources.map(receipt));
}

const propsSource = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
const mergeStart = propsSource.indexOf('  function* mergeMaterialBuckets(');
const mergeEnd = propsSource.indexOf('\n  yield* mergeMaterialBuckets();', mergeStart);
assert.ok(mergeStart > 0 && mergeEnd > mergeStart, 'execute the actual material publication boundary');
const mergeCode = stripTypeScriptTypes(propsSource.slice(mergeStart, mergeEnd));
function materialFixture(buckets, events = []) {
  const group = new THREE.Group(), material = new THREE.MeshBasicMaterial();
  const mats = Object.fromEntries(Object.keys(buckets).map(key => [key, material]));
  const prepare = new Function('buckets', 'mats', 'group', 'THREE', 'ensureWorldNightEmissionMask',
    'prepareWorldStaticNightFixture', 'mergePropsMaterialGeometrySteps', `${mergeCode}\nreturn mergeMaterialBuckets;`)(
    buckets, mats, group, THREE,
    geometry => { events.push(['curtain', geometry]); },
    geometries => { events.push(['glass', geometries]); },
    (sources, key) => mergePropsMaterialGeometrySteps(sources, key, () => 0));
  return { group, material, prepare };
}
const wrapperStart = propsSource.indexOf('export async function createPropsAsync(');
const wrapperEnd = propsSource.indexOf('\nfunction* propsBuildSteps(', wrapperStart);
assert.ok(wrapperStart > 0 && wrapperEnd > wrapperStart);
const wrapperCode = stripTypeScriptTypes(propsSource.slice(wrapperStart, wrapperEnd)).replace('export ', '');
function composeAsync(materials) {
  function* build() { yield* materials.prepare(); return { group: materials.group }; }
  return new Function('propsBuildSteps', 'ensureTankBuilder', 'Worker', 'createWreckBakeClient',
    `${wrapperCode}\nreturn createPropsAsync;`)(build, () => assert.fail('no tank builder'), undefined,
    () => assert.fail('no worker in the Node fixture'));
}

try {
  parityCase(); boundedCase(); cleanupCase();
  for (const values of [[], [fixture(2, false)], [fixture(2), fixture(4)]]) {
    const before = values.map(receipt);
    if (!values.length) {
      assert.throws(() => drain(mergePropsMaterialGeometrySteps(values, 'empty', () => 0)), TypeError,
        'unsupported empty direct call retains the native merge failure; props skips empty buckets');
    } else drain(mergePropsMaterialGeometrySteps(values, 'simple', () => 0));
    assertSourcesIntact(values, before);
  }
  {
    const clock = { value: 0, cost: PROPS_CONVERSION_BUDGET_MS + 0.5 }, f = trackedSources(3, clock);
    const iterator = mergePropsMaterialGeometrySteps(f.sources, 'timed', () => clock.value);
    assert.equal(iterator.next().done, false);
    assert.equal(f.order.length, 1, 'deadline is checked after each indivisible native conversion');
    assert.equal(iterator.next().done, false);
    assert.equal(f.order.length, 2, 'next batch receives a fresh clock origin');
    drain(iterator); assertReleased(f.converted);
  }
  for (const invalidClock of [() => NaN, () => Infinity, (() => { let time = 0; return () => --time; })()]) {
    const f = trackedSources(3), iterator = mergePropsMaterialGeometrySteps(f.sources, 'clock', invalidClock);
    assert.equal(iterator.next().done, false); assert.equal(f.order.length, 1);
    iterator.return(); assertReleased(f.converted);
  }
  {
    const f = trackedSources(2), failure = new Error('diagnostic clock failed');
    let reads = 0;
    assert.throws(() => drain(mergePropsMaterialGeometrySteps(f.sources, 'clock-throw', () => {
      if (++reads > 1) throw failure;
      return 0;
    })), error => error === failure);
    assertReleased(f.converted); assertSourcesIntact(f.sources, f.sources.map(receipt));
  }
  {
    const source = fixture(3, false), before = receipt(source);
    source.toNonIndexed = () => assert.fail('borrowed non-indexed input must not be copied');
    drain(mergePropsMaterialGeometrySteps([source, source], 'borrowed', () => 0));
    assertSourcesIntact([source], [before]);
  }
  for (const method of ['return', 'throw']) {
    for (const checkpoint of [1, 2, 3]) {
      const f = trackedSources(PROPS_CONVERSION_BATCH_LIMIT * 2 + 3);
      const iterator = mergePropsMaterialGeometrySteps(f.sources, 'cancel', () => 0);
      for (let index = 0; index < checkpoint; index++) assert.equal(iterator.next().done, false);
      const failure = new Error('cancel material construction');
      if (method === 'throw') assert.throws(() => iterator.throw(failure), error => error === failure);
      else iterator.return();
      assert.equal(iterator.next().done, true);
      assertReleased(f.converted); assertSourcesIntact(f.sources, f.sources.map(receipt));
    }
  }
  {
    const f = trackedSources(3), failure = new Error('conversion failed');
    f.sources[2].toNonIndexed = () => { throw failure; };
    assert.throws(() => drain(mergePropsMaterialGeometrySteps(f.sources, 'throw', () => 0)), error => error === failure);
    assertReleased(f.converted); assertSourcesIntact(f.sources, f.sources.map(receipt));
  }
  {
    const f = trackedSources(2), failure = new Error('native merge getter failed');
    const iterator = mergePropsMaterialGeometrySteps(f.sources, 'merge-throw', () => 0);
    assert.equal(iterator.next().done, false);
    Object.defineProperty(f.converted[0], 'attributes', { get() { throw failure; } });
    f.converted[0].addEventListener('dispose', () => { throw new Error('disposer failed'); });
    assert.throws(() => iterator.next(), error => error === failure, 'cleanup must preserve the merge failure');
    assertReleased(f.converted); assertSourcesIntact(f.sources, f.sources.map(receipt));
  }
  {
    const f = trackedSources(2);
    f.sources[1].deleteAttribute('nightMask');
    const error = console.error;
    try {
      console.error = () => {};
      assert.equal(drain(mergePropsMaterialGeometrySteps(f.sources, 'invalid', () => 0)).geometry, null,
        'native incompatible-attribute result is unchanged');
    } finally { console.error = error; }
    assertReleased(f.converted); assertSourcesIntact(f.sources, f.sources.map(receipt));
  }
  {
    const f = trackedSources(2), g = trackedSources(1), events = [];
    const originalF = f.sources.map(receipt), originalG = g.sources.map(receipt);
    for (const geometry of [...f.sources, ...g.sources]) {
      const convert = geometry.toNonIndexed;
      geometry.toNonIndexed = () => { events.push(['convert', geometry]); return convert(); };
    }
    const m = materialFixture({ empty: [], curtain: f.sources, glass: g.sources }, events);
    try {
      const iterator = m.prepare();
      assert.equal(iterator.next().value.progress, false);
      assert.deepEqual(events, [...f.sources.map(geometry => ['curtain', geometry]),
        ...f.sources.map(geometry => ['convert', geometry])], 'all curtain preparation precedes conversion');
      assert.equal(m.group.children.length, 0, 'conversion never publishes a partial material mesh');
      assert.deepEqual(iterator.next().value, { fine: true });
      assert.equal(m.group.children.length, 1, 'one fully merged mesh published at the original boundary');
      assert.equal(iterator.next().value.progress, false);
      assert.deepEqual(events.slice(-2), [['glass', g.sources], ['convert', g.sources[0]]],
        'glass preparation precedes conversion');
      assert.equal(m.group.children.length, 1);
      assert.deepEqual(iterator.next().value, { fine: true });
      assert.equal(iterator.next().done, true);
      assert.equal(m.group.children.length, 2);
      for (const mesh of m.group.children) {
        own(mesh.geometry); assert.equal(mesh.material, m.material);
        assert.equal(mesh.castShadow, true); assert.equal(mesh.receiveShadow, true);
        assert.equal(mesh.matrixAutoUpdate, false);
      }
      assertReleased(f.converted); assertReleased(g.converted);
      assertSourcesIntact(f.sources, originalF); assertSourcesIntact(g.sources, originalG);
    } finally { m.material.dispose(); }
  }
  for (const fineSlices of [true, false]) {
    const f = trackedSources(65), m = materialFixture({ brick: f.sources }), ticks = [];
    try {
      await composeAsync(m)({}, {}, 2002, null, done => ticks.push(done), fineSlices);
      assert.deepEqual(ticks, fineSlices ? [0, 0, 1] : [], 'internal conversion batches do not advance placement progress');
      assert.equal(m.group.children.length, 1); own(m.group.children[0].geometry);
      assertReleased(f.converted);
    } finally { m.material.dispose(); }
  }
  {
    const f = trackedSources(65), m = materialFixture({ brick: f.sources });
    const failure = new Error('loading generation became stale');
    try {
      await assert.rejects(composeAsync(m)({}, {}, 2002, null, async () => { throw failure; }, true),
        error => error === failure);
      assert.equal(f.order.length, 64); assert.equal(m.group.children.length, 0);
      assertReleased(f.converted); assertSourcesIntact(f.sources, f.sources.map(receipt));
    } finally { m.material.dispose(); }
  }

  // Negative source mutants exercise the same invariants against regressions,
  // not a second implementation accepted because it agrees with itself.
  const helperSource = readFileSync(new URL('./propsMaterialGeometry.ts', import.meta.url), 'utf8');
  function mutant(before, after) {
    assert.equal(helperSource.split(before).length, 2, 'mutation boundary must be unique');
    const code = stripTypeScriptTypes(helperSource.replace(before, after))
      .replace(/^import .*?;\n/gm, '').replace(/^export /gm, '');
    return new Function('mergeGeometries', `${code}\nreturn mergePropsMaterialGeometrySteps;`)(mergeGeometries);
  }
  assert.throws(() => boundedCase(mutant('batchCount >= PROPS_CONVERSION_BATCH_LIMIT', 'false')),
    /hard source-count cap/);
  assert.throws(() => cleanupCase(mutant('disposeConvertedGeometries(owned);', 'owned.clear();')),
    /temporary owner released exactly once/);
  assert.throws(() => parityCase(mutant('for (const geometry of sources)', 'for (const geometry of [...sources].reverse())')),
    /exact ordered attribute bytes/);
  assert.throws(() => cleanupCase(mutant('if (!borrowed.has(prepared)) owned.add(prepared);',
    'owned.add(prepared); owned.add(geometry);')), /borrowed source was never disposed/);
  console.log('propsMaterialGeometry.selftest: PASS (native parity, bounded scheduling, ownership, cancellation, publication, mutants)');
} finally {
  for (const geometry of owned) {
    try { geometry.dispose(); } catch (_) { /* malformed/failing fixtures still release the rest */ }
  }
}
