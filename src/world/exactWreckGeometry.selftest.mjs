import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { compactWreckGeometry, compactWreckGeometrySteps, compactWreckGeometryForPaintSteps,
  mergeWreckGeometries } from './exactWreckGeometry.ts';

const owned = new Set();
const own = geometry => { owned.add(geometry); return geometry; };
const cornerCount = geometry => geometry.index?.count ?? geometry.attributes.position.count;
const attributeArray = attribute => attribute.isInterleavedBufferAttribute ? attribute.data.array : attribute.array;

function triangleFixture(repeats = 8) {
  const geometry = own(new THREE.BufferGeometry());
  const values = {
    position: { size: 3, values: [0, 0, 0, 1, 0, 0, 0, 1, 0] },
    normal: { size: 3, values: [0, 0, 1, 0, 0, 1, 0, 0, 1] },
    color: { size: 3, values: [0.2, 0.3, 0.4, 0.2, 0.3, 0.4, 0.2, 0.3, 0.4] },
    uv: { size: 2, values: [0, 0, 1, 0, 0, 1] },
    customDetail: { size: 1, values: [0.5, 0.25, 0.75] },
  };
  for (const [name, { size, values: triangle }] of Object.entries(values)) {
    const data = new Float32Array(repeats * triangle.length);
    for (let repeat = 0; repeat < repeats; repeat++) data.set(triangle, repeat * triangle.length);
    geometry.setAttribute(name, new THREE.BufferAttribute(data, size));
  }
  return geometry;
}

// Compare the actual IEEE-754 words, not JS numbers: Number comparison would
// lose NaN payload differences and many equality checks conflate +0 with -0.
function orderedWords(geometry) {
  const streams = {};
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    assert.equal(attribute.array.constructor, Float32Array);
    const source = new Uint32Array(attribute.array.buffer, attribute.array.byteOffset, attribute.array.length);
    if (!geometry.index) { streams[name] = source.slice(); continue; }
    const output = new Uint32Array(geometry.index.count * attribute.itemSize);
    for (let corner = 0; corner < geometry.index.count; corner++) {
      const row = geometry.index.array[corner];
      assert.ok(Number.isInteger(row) && row >= 0 && row < attribute.count, 'every stored index is valid');
      if (geometry.index.array instanceof Uint16Array) {
        assert.notEqual(row, 65535, 'Uint16 index must not be the WebGL2 primitive-restart token');
      }
      for (let component = 0; component < attribute.itemSize; component++) {
        output[corner * attribute.itemSize + component] = source[row * attribute.itemSize + component];
      }
    }
    streams[name] = output;
  }
  return streams;
}

function concatenateStreams(streams) {
  const result = {};
  for (const name of Object.keys(streams[0])) {
    const output = new Uint32Array(streams.reduce((sum, stream) => sum + stream[name].length, 0));
    let offset = 0;
    for (const stream of streams) { output.set(stream[name], offset); offset += stream[name].length; }
    result[name] = output;
  }
  return result;
}

function snapshot(geometry) {
  return {
    index: geometry.index, attributes: Object.entries(geometry.attributes).map(([name, attribute]) => {
      const array = attributeArray(attribute);
      return { name, attribute, array, bytes: new Uint8Array(array.buffer, array.byteOffset, array.byteLength).slice(),
        metadata: { name: attribute.name, itemSize: attribute.itemSize, normalized: attribute.normalized,
          usage: attribute.usage, gpuType: attribute.gpuType, version: attribute.version,
          onUploadCallback: attribute.onUploadCallback, updateRanges: attribute.updateRanges?.map(range => ({ ...range })) } };
    }),
    groups: geometry.groups, groupsValue: geometry.groups.map(group => ({ ...group })),
    drawRange: geometry.drawRange, rangeValue: { ...geometry.drawRange },
    box: geometry.boundingBox, boxValue: geometry.boundingBox?.clone(),
    sphere: geometry.boundingSphere, sphereValue: geometry.boundingSphere?.clone(),
    userData: geometry.userData, id: geometry.id, uuid: geometry.uuid, name: geometry.name,
    morphAttributes: geometry.morphAttributes, morphTargetsRelative: geometry.morphTargetsRelative,
  };
}

function assertMetadata(geometry, before) {
  for (const key of ['id', 'uuid', 'name', 'groups', 'drawRange', 'userData', 'morphAttributes', 'morphTargetsRelative']) {
    assert.equal(geometry[key], before[key], `${key} identity`);
  }
  assert.deepEqual(geometry.groups, before.groupsValue); assert.deepEqual(geometry.drawRange, before.rangeValue);
  assert.equal(geometry.boundingBox, before.box); assert.equal(geometry.boundingSphere, before.sphere);
  assert.deepEqual(geometry.boundingBox, before.boxValue ?? null); assert.deepEqual(geometry.boundingSphere, before.sphereValue ?? null);
}

function assertUntouched(geometry, before) {
  assertMetadata(geometry, before); assert.equal(geometry.index, before.index);
  assert.deepEqual(Object.keys(geometry.attributes), before.attributes.map(row => row.name));
  for (const row of before.attributes) {
    assert.equal(geometry.attributes[row.name], row.attribute); assert.equal(attributeArray(row.attribute), row.array);
    assert.deepEqual(new Uint8Array(row.array.buffer, row.array.byteOffset, row.array.byteLength), row.bytes);
    for (const [key, value] of Object.entries(row.metadata)) assert.deepEqual(row.attribute[key], value, `unchanged ${row.name}/${key}`);
  }
}

function assertCompactsExactly(geometry, expectedUnique) {
  const before = snapshot(geometry), streams = orderedWords(geometry), corners = cornerCount(geometry);
  const beforeBytes = before.attributes.reduce((sum, row) => sum + row.array.byteLength, 0);
  assert.equal(compactWreckGeometry(geometry), geometry, 'compaction preserves geometry identity');
  assert.ok(geometry.index, 'fixture must exercise actual compaction, not silent fallback');
  assert.equal(geometry.attributes.position.count, expectedUnique);
  assert.equal(cornerCount(geometry), corners, 'triangle budgeting counts original corners, never unique vertices');
  assert.equal(cornerCount(geometry) / 3, corners / 3);
  assert.deepEqual(orderedWords(geometry), streams, 'every ordered Float32 attribute word is exact');
  assertMetadata(geometry, before);
  let afterBytes = geometry.index.array.byteLength;
  for (const row of before.attributes) {
    const attribute = geometry.attributes[row.name];
    for (const key of ['itemSize', 'normalized', 'name', 'usage', 'gpuType']) assert.equal(attribute[key], row.attribute[key]);
    assert.deepEqual(new Uint8Array(row.array.buffer, row.array.byteOffset, row.array.byteLength), row.bytes,
      'compaction never writes into the original source buffer');
    afterBytes += attribute.array.byteLength;
  }
  assert.ok(afterBytes < beforeBytes, 'index overhead is included in retained-byte savings');
  const indexed = snapshot(geometry); compactWreckGeometry(geometry); assertUntouched(geometry, indexed);
  return streams;
}

function stagedFixture() {
  const geometry = triangleFixture(2048);
  // 3,072 distinct corners repeated twice exercises multiple index, attribute
  // and Uint16 remap chunks while retaining a meaningful exact storage saving.
  for (let i = 0; i < 6144; i++) geometry.attributes.position.array[i * 3] = i % 3072;
  return geometry;
}

function checkCompactionCancellation(stages, makeGeometry = stagedFixture, prepare = compactWreckGeometrySteps) {
  for (let checkpoint = 0; checkpoint < stages.length; checkpoint++) {
    for (const method of ['return', 'throw']) {
      const geometry = makeGeometry(), original = snapshot(geometry);
      const cancelled = prepare(geometry);
      for (let i = 0; i <= checkpoint; i++) assert.equal(cancelled.next().value.stage, stages[i]);
      if (method === 'return') assert.equal(cancelled.return(geometry).done, true);
      else {
        const failure = new Error('cancel compaction');
        assert.throws(() => cancelled.throw(failure), error => error === failure);
      }
      assertUntouched(geometry, original);
      assert.equal(cancelled.next().done, true);
    }
  }
}

function checkCompactionInterleaving(control, makeGeometry = stagedFixture, prepare = compactWreckGeometrySteps) {
  const jobs = [makeGeometry(), makeGeometry()].map(geometry => ({ geometry,
    before: snapshot(geometry), steps: prepare(geometry), done: false }));
  while (jobs.some(job => !job.done)) for (const job of jobs) {
    if (job.done) continue;
    const result = job.steps.next(); job.done = result.done;
    if (!result.done) assertUntouched(job.geometry, job.before);
    else assert.deepEqual(job.geometry.index.array, control.index.array);
  }
}

function measuredCompactor() {
  const counts = { hashed: 0, copied: {}, remapped: 0 };
  const source = readFileSync(new URL('./exactWreckGeometry.ts', import.meta.url), 'utf8');
  const hooks = [
    ['  let hash = 0x811c9dc5;', '  counts.hashed++;\n  let hash = 0x811c9dc5;'],
    ['    const sourceOffset = representatives[row] * size, targetOffset = row * size;',
      '    counts.copied[stream.name] = (counts.copied[stream.name] || 0) + 1;\n'
      + '    const sourceOffset = representatives[row] * size, targetOffset = row * size;'],
    ['    values.set(index.remap.subarray(offset, end), offset);',
      '    values.set(index.remap.subarray(offset, end), offset); counts.remapped += end - offset;'],
  ];
  let instrumented = source;
  for (const [anchor, replacement] of hooks) {
    assert.ok(instrumented.includes(anchor), 'exact actual loop observation anchor');
    instrumented = instrumented.replace(anchor, replacement);
  }
  const steps = new Function('THREE', 'mergeGeometries', 'counts',
    stripTypeScriptTypes(instrumented.replace(/^import[^\n]*\n/gm, '')).replace(/^export /gm, '')
      + '\nreturn compactWreckGeometrySteps;')(THREE, mergeGeometries, counts);
  return { steps, counts };
}

function checkStagedCompaction() {
  const control = stagedFixture(); compactWreckGeometry(control);
  const input = stagedFixture(), before = snapshot(input), stages = [];
  const measured = measuredCompactor(), steps = measured.steps(input);
  let next = steps.next();
  while (!next.done) {
    assert.equal(next.value.fine, true);
    assertUntouched(input, before);
    const stage = next.value.stage;
    stages.push(stage);
    if (stage === 'compact-index-2048') assert.equal(measured.counts.hashed, 2048);
    if (stage === 'compact-position-2048') assert.equal(measured.counts.copied.position, 2048);
    if (stage === 'compact-remap-2048') assert.equal(measured.counts.remapped, 2048);
    next = steps.next();
  }
  assert.equal(next.value, input);
  assert.deepEqual(input.index.array, control.index.array);
  assert.deepEqual(orderedWords(input), orderedWords(control));
  for (const name of Object.keys(input.attributes)) {
    assert.deepEqual(input.attributes[name].array, control.attributes[name].array);
  }
  assert.ok(stages.includes('compact-index-2048') && stages.includes('compact-position-2048')
    && stages.includes('compact-remap-2048'), 'substantial loops yield before processing their remaining inputs');
  checkCompactionCancellation(stages);
  checkCompactionInterleaving(control);
}

function paintInput(unique = 3072, count = 6144) {
  const geometry = own(new THREE.BufferGeometry());
  const position = new Float32Array(count * 3), normal = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    position[i * 3] = i % unique;
    normal[i * 3 + 1] = 1;
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  return geometry;
}

function paintDerivedColor(geometry) {
  const { position, normal } = geometry.attributes, values = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    values[i * 3] = Math.sin(position.getX(i) * 0.37);
    values[i * 3 + 1] = normal.getY(i) * 0.4;
    values[i * 3 + 2] = position.getZ(i) * 0.13 + 0.2;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(values, 3));
}

function checkPrePaintCompaction(unique, count) {
  const control = paintInput(unique, count), geometry = paintInput(unique, count);
  paintDerivedColor(control); compactWreckGeometry(control);
  const before = snapshot(geometry), stages = [], steps = compactWreckGeometryForPaintSteps(geometry);
  let next = steps.next();
  while (!next.done) {
    assertUntouched(geometry, before);
    stages.push(next.value.stage); next = steps.next();
  }
  assert.equal(next.value, true, 'P/N certification includes non-saving inputs');
  paintDerivedColor(geometry);
  assert.deepEqual(geometry.index?.array ?? null, control.index?.array ?? null);
  assert.equal(geometry.index?.array.constructor, control.index?.array.constructor);
  assert.deepEqual(orderedWords(geometry), orderedWords(control));
  for (const name of Object.keys(control.attributes)) {
    assert.deepEqual(geometry.attributes[name].array, control.attributes[name].array,
      'first-occurrence representatives and exact stored colors match paint-then-compact');
  }
  return { geometry, stages };
}

function checkPrePaintCases() {
  const { geometry, stages } = checkPrePaintCompaction(3072, 6144);
  checkCompactionCancellation(stages, paintInput, compactWreckGeometryForPaintSteps);
  checkCompactionInterleaving(geometry, paintInput, compactWreckGeometryForPaintSteps);
  const narrowSaving = checkPrePaintCompaction(28, 30).geometry;
  assert.ok(narrowSaving.index, 'future RGB makes a real saving that P/N-only byte accounting would reject');
  const naive = paintInput(28, 30); compactWreckGeometry(naive);
  assert.equal(naive.index, null, 'negative control proves this threshold fixture is discriminating');
  assert.equal(checkPrePaintCompaction(34, 36).geometry.index, null,
    'equal retained/source bytes keep the original non-indexed representation');
  for (const unique of [65535, 65536]) checkPrePaintCompaction(unique, unique * 3);
  for (const modify of [
    g => g.deleteAttribute('normal'),
    g => g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(6144 * 3), 3)),
    g => g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(6144 * 2), 2)),
    g => g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(6144 * 2), 2)),
    g => g.attributes.normal.setUsage(THREE.DynamicDrawUsage),
    g => g.setIndex([0, 1, 2]),
  ]) {
    const input = paintInput(); modify(input); const before = snapshot(input);
    assert.deepEqual(compactWreckGeometryForPaintSteps(input).next(), { done: true, value: false });
    assertUntouched(input, before);
  }
}

try {
  checkStagedCompaction();
  checkPrePaintCases();
  const geometry = triangleFixture();
  geometry.name = 'test-wreck'; geometry.userData.owner = { name: 'static-wreck-owner' };
  geometry.addGroup(0, 9, 2); geometry.addGroup(9, 15, 4); geometry.setDrawRange(3, 12);
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  geometry.attributes.color.name = 'original-color-stream'; geometry.attributes.color.normalized = true;
  const material = new THREE.MeshStandardMaterial({ vertexColors: true }), parent = new THREE.Group();
  const mesh = new THREE.Mesh(geometry, material); parent.add(mesh);
  mesh.layers.set(2); mesh.position.set(3, 4, 5); mesh.updateMatrix();
  const matrix = mesh.matrix.clone(), layerMask = mesh.layers.mask;
  assertCompactsExactly(geometry, 3);
  assert.equal(mesh.geometry, geometry); assert.equal(mesh.material, material); assert.equal(mesh.parent, parent);
  assert.deepEqual(mesh.matrix, matrix); assert.equal(mesh.layers.mask, layerMask); material.dispose();

  for (const [name, component, replacement] of [
    ['normal', 2, -1], ['color', 0, 0.9], ['uv', 0, 0.625], ['customDetail', 0, 0.125],
  ]) {
    const seam = triangleFixture();
    seam.attributes[name].array[3 * seam.attributes[name].itemSize + component] = replacement;
    assertCompactsExactly(seam, 4); // same position, deliberately different attribute
  }
  const special = triangleFixture();
  const bits = new Uint32Array(special.attributes.customDetail.array.buffer);
  bits[0] = 0; bits[3] = 0x80000000;
  bits[1] = 0x7fc00001; bits[4] = 0x7fc00002;
  assertCompactsExactly(special, 7);
  assert.notEqual(special.index.array[0], special.index.array[3], '+0 and -0 cannot share an index');
  assert.notEqual(special.index.array[1], special.index.array[4], 'distinct NaN payloads cannot share an index');

  const noSaving = triangleFixture(1), noSavingBefore = snapshot(noSaving);
  compactWreckGeometry(noSaving); assertUntouched(noSaving, noSavingBefore);
  assert.equal(noSaving.index, null, 'an identity index with no saving is not installed');

  const unsupported = [
    ['existing index', g => g.setIndex([0, 1, 2])],
    ['morph data', g => { g.morphAttributes.position = [g.attributes.position.clone()]; }],
    ['dynamic usage', g => g.attributes.position.setUsage(THREE.DynamicDrawUsage)],
    ['updated buffer', g => { g.attributes.position.needsUpdate = true; }],
    ['pending update range', g => g.attributes.position.addUpdateRange(0, 3)],
    ['upload callback', g => g.attributes.position.onUpload(() => {})],
    ['non-Float32 attribute', g => g.setAttribute('color', new THREE.Uint8BufferAttribute(new Uint8Array(72), 3))],
    ['Float16 attribute', g => g.setAttribute('color', new THREE.Float16BufferAttribute(new Uint16Array(72), 3))],
    ['mismatched attribute count', g => g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1], 3))],
    ['instanced attribute', g => g.setAttribute('customDetail', new THREE.InstancedBufferAttribute(new Float32Array(24), 1))],
    ['interleaved attribute', g => g.setAttribute('normal', new THREE.InterleavedBufferAttribute(
      new THREE.InterleavedBuffer(new Float32Array(144), 6), 3, 3))],
  ];
  for (const [label, change] of unsupported) {
    const g = triangleFixture(); change(g); const before = snapshot(g);
    assert.equal(compactWreckGeometry(g), g, label); assertUntouched(g, before);
  }
  const instanced = own(new THREE.InstancedBufferGeometry().copy(triangleFixture()));
  const instancedBefore = snapshot(instanced); compactWreckGeometry(instanced); assertUntouched(instanced, instancedBefore);

  // WebGL2 reserves 65,535 for PRIMITIVE_RESTART_FIXED_INDEX. Match Three's
  // index selection: 65,535 vertices fit Uint16, but 65,536 require Uint32.
  for (const [unique, IndexType] of [[65535, Uint16Array], [65536, Uint32Array], [65537, Uint32Array]]) {
    const count = Math.ceil(unique * 2 / 3) * 3, positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) positions[i * 3] = i % unique;
    const large = own(new THREE.BufferGeometry()); large.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    assertCompactsExactly(large, unique); assert.equal(large.index.array.constructor, IndexType);
    assert.equal(large.index.array[unique - 1], unique - 1);
  }

  const first = triangleFixture(), debris = triangleFixture(2), last = triangleFixture(4);
  compactWreckGeometry(first); compactWreckGeometry(last);
  first.translate(2, 0, -3); debris.rotateY(0.3); last.translate(-4, 1, 7);
  const inputs = [first, debris, last], beforeInputs = inputs.map(snapshot), expected = concatenateStreams(inputs.map(orderedWords));
  const expanded = inputs.map(g => g.index ? own(g.toNonIndexed()) : g);
  const canonical = own(mergeGeometries(expanded, false));
  const merged = own(mergeWreckGeometries(inputs));
  assert.deepEqual(orderedWords(merged), expected, 'mixed indexed/non-indexed pieces retain exact ordered world triangles');
  assert.deepEqual(orderedWords(merged), orderedWords(canonical), 'same stream as the original expanded merge');
  assert.equal(cornerCount(merged), inputs.reduce((sum, g) => sum + cornerCount(g), 0));
  assert.deepEqual(merged.groups, canonical.groups); assert.deepEqual(merged.drawRange, canonical.drawRange);
  assert.deepEqual(merged.boundingBox, canonical.boundingBox); assert.deepEqual(merged.boundingSphere, canonical.boundingSphere);
  inputs.forEach((g, i) => assertUntouched(g, beforeInputs[i]));

  // Attribute names define the streams; object insertion order is not part
  // of their compatibility contract (and the original Three merge accepts it).
  const reordered = triangleFixture(2), reversedAttributes = Object.entries(reordered.attributes).reverse();
  for (const [name] of reversedAttributes) reordered.deleteAttribute(name);
  for (const [name, attribute] of reversedAttributes) reordered.setAttribute(name, attribute);
  assert.notDeepEqual(Object.keys(first.attributes), Object.keys(reordered.attributes));
  const beforeReordered = snapshot(reordered);
  const reorderedCanonical = own(mergeGeometries([own(first.toNonIndexed()), reordered], false));
  const reorderedMerged = own(mergeWreckGeometries([first, reordered]));
  assert.deepEqual(Object.keys(reorderedMerged.attributes), Object.keys(first.attributes));
  assert.deepEqual(orderedWords(reorderedMerged), orderedWords(reorderedCanonical), 'attribute insertion order cannot alter the merged stream');
  assertUntouched(reordered, beforeReordered);
  assertUntouched(first, beforeInputs[0]);

  // Independently exercise the final mixed-merge threshold. Its aggregate
  // vertex offset can cross the restart boundary even when each input is small.
  for (const [total, IndexType] of [[65535, Uint16Array], [65536, Uint32Array]]) {
    const indexedCount = total - 65532;
    const indexed = own(new THREE.BufferGeometry());
    indexed.setAttribute('position', new THREE.BufferAttribute(new Float32Array(indexedCount * 3), 3));
    indexed.setIndex(indexedCount === 3 ? [0, 1, 2] : [0, 1, 2, 0, 2, 3]);
    const plain = own(new THREE.BufferGeometry()), positions = new Float32Array(65532 * 3);
    for (let i = 0; i < 65532; i++) positions[i * 3] = i + indexedCount;
    plain.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const combined = own(mergeWreckGeometries([indexed, plain]));
    assert.equal(combined.attributes.position.count, total);
    assert.equal(combined.index.array.constructor, IndexType, 'mixed merge uses render-safe index width');
    assert.equal(combined.index.array[combined.index.count - 1], total - 1);
    assert.equal(cornerCount(combined), cornerCount(indexed) + cornerCount(plain));
    assert.deepEqual(orderedWords(combined), concatenateStreams([orderedWords(indexed), orderedWords(plain)]));
  }

  const unindexedInputs = [triangleFixture(1), triangleFixture(1)], allPlain = own(mergeWreckGeometries(unindexedInputs));
  assert.equal(allPlain.index, null, 'all-unsupported/no-savings inputs retain the ordinary non-indexed merge');
  assert.deepEqual(orderedWords(allPlain), concatenateStreams(unindexedInputs.map(orderedWords)));
  const bad = triangleFixture(); bad.deleteAttribute('color');
  const badBefore = snapshot(bad), firstBefore = snapshot(first);
  assert.throws(() => mergeWreckGeometries([first, bad]), /unsupported mixed wreck geometry/);
  assertUntouched(first, firstBefore); assertUntouched(bad, badBefore);
  assert.throws(() => mergeWreckGeometries([]), /empty mixed wreck merge/);
} finally {
  for (const geometry of owned) geometry.dispose();
}

console.log('exactWreckGeometry.selftest: exact Float32 corner streams, seams, metadata, safe fallbacks and mixed index/triangle contracts passed');
