import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { deduplicateEraSurfaces } from './eraSurfaceDeduplication.ts';

// Independent immutable upstream implementation, never an expected result
// generated from the candidate. Preserve its exact arithmetic and first match.
const upstream = execFileSync('git', ['show',
  '12a5b9aec317107782b5f6505065ada7c721f290:src/vehicles/tankFactoryCore.ts'], { encoding: 'utf8' });
const source = upstream.slice(upstream.indexOf('function describeEraSurface('),
  upstream.indexOf('interface TankPresentationSetup'));
assert.equal(createHash('sha256').update(source).digest('hex'),
  'c652114d6069f49f556e598bce72de19de1176b0032c3131d0b3fe15982188b7');
const legacy = new Function('THREE', `${stripTypeScriptTypes(source)}; return deduplicateEraSurfaces;`)(THREE);
const describeLegacy = new Function('THREE', `${stripTypeScriptTypes(source)}; return describeEraSurface;`)(THREE);
const helperSource = fs.readFileSync(new URL('./eraSurfaceDeduplication.ts', import.meta.url), 'utf8');
const describeCurrent = new Function('THREE', `${stripTypeScriptTypes(helperSource
  .slice(helperSource.indexOf('type EraSurface'), helperSource.indexOf('/** Preserve')))}; return describeEraSurface;`)(THREE);
function face(x, y, z, angle = 0, size = 0.1) {
  const u = [Math.cos(angle) * size, 0, Math.sin(angle) * size];
  return [[x, y, z], [x + u[0], y, z + u[2]],
    [x + u[0], y + size, z + u[2]], [x, y + size, z]];
}
let cases = 0;
function verify(input) {
  const before = JSON.stringify(input), expected = legacy(input), actual = deduplicateEraSurfaces(input);
  assert.equal(actual.length, expected.length);
  for (let i = 0; i < actual.length; i++) assert.equal(actual[i], expected[i], 'exact selected reference/order');
  assert.equal(JSON.stringify(input), before, 'never mutate input vertices');
  cases++;
}
verify([]);
// Strict distance and normal thresholds, opposite faces, first-match chains,
// and replacement descriptors that must update before the next candidate.
for (const gap of [0, 0.049999999, 0.05, 0.050000001]) {
  verify([face(0, 0, 0), face(0, 0, gap), face(0, 0, gap * 2), face(0, 0, gap)]);
}
for (const dot of [0.994999999, 0.995, 0.995000001]) {
  verify([face(0, 0, 0), face(0, 0, 0, Math.acos(dot)), face(0, 0, 0, Math.PI)]);
}
let state = 0x7eac001;
const random = () => ((state = Math.imul(state, 1664525) + 1013904223 >>> 0) / 2 ** 32);
for (let fixture = 0; fixture < 40; fixture++) {
  const surfaces = [];
  for (let i = 0; i < 160; i++) {
    const surface = face(Math.floor(random() * 8) * 0.12, Math.floor(random() * 5) * 0.1,
      random() * 0.14, random() * 0.3, 0.08 + random() * 0.1);
    surfaces.push(surface);
    if (i % 5 === 0) surfaces.push(surface.map(p => [p[0], p[1], p[2] + 0.003]));
  }
  verify(surfaces);
  verify([...surfaces].reverse());
}
// An invocation-local summary must observe later caller edits, not retain a
// stale global descriptor or cross-build surface ownership.
const mutable = [face(0, 0, 0), face(0, 0, 0.02)];
verify(mutable); mutable[1].forEach(point => { point[2] += 1; }); verify(mutable);
const separated = Array.from({ length: 300 }, (_, i) => face(i * 0.2, 0, 0));
const originalFromArray = THREE.Vector3.prototype.fromArray;
function countReads(fn, input = separated) {
  let reads = 0;
  THREE.Vector3.prototype.fromArray = function (...args) {
    reads++; return originalFromArray.apply(this, args);
  };
  try { fn(input); return reads; }
  finally { THREE.Vector3.prototype.fromArray = originalFromArray; }
}
const oldReads = countReads(legacy), newReads = countReads(deduplicateEraSurfaces);
assert.equal(newReads, 300 * 7, 'exactly one unchanged descriptor per input surface');
assert.ok(oldReads > newReads * 100, 'no repeated candidate descriptor allocation in quadratic scan');
console.log(`ERA descriptor reuse: ${cases} fixed-legacy differential cases, exact reference/order/vertices; ${oldReads} → ${newReads} point reads PASS`);

function attributeDigest(attribute) {
  if (!attribute) return null;
  const array = attribute.array ?? attribute.data.array;
  return { type: attribute.constructor.name, arrayType: array.constructor.name,
    itemSize: attribute.itemSize, count: attribute.count, normalized: attribute.normalized,
    usage: attribute.usage, gpuType: attribute.gpuType, offset: attribute.offset,
    stride: attribute.data?.stride,
    sha: createHash('sha256').update(Buffer.from(array.buffer, array.byteOffset, array.byteLength)).digest('hex') };
}

function digest(root) {
  const nodes = [], rows = [], materialIds = new Map(), materials = [], uuids = new Map();
  const semantic = value => {
    if (typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
      if (!uuids.has(value)) uuids.set(value, uuids.size);
      return `uuid:${uuids.get(value)}`;
    }
    if (Array.isArray(value)) return value.map(semantic);
    if (value && typeof value === 'object') return Object.fromEntries(
      Object.keys(value).sort().map(key => [key, semantic(value[key])]));
    return value;
  };
  root.updateMatrixWorld(true); root.traverse(node => nodes.push(node));
  const nodeIds = new Map(nodes.map((node, index) => [node, index]));
  for (const node of nodes) {
    const ids = (node.material ? (Array.isArray(node.material) ? node.material : [node.material]) : []).map(material => {
      if (!materialIds.has(material)) {
        materialIds.set(material, materials.length); materials.push(semantic(material.toJSON()));
      }
      return materialIds.get(material);
    });
    const geometry = node.geometry;
    rows.push({ name: node.name, type: node.type, parent: nodeIds.get(node.parent) ?? null,
      matrix: node.matrix.elements, world: node.matrixWorld.elements,
      visible: node.visible, layers: node.layers.mask, renderOrder: node.renderOrder,
      castShadow: node.castShadow, receiveShadow: node.receiveShadow, frustumCulled: node.frustumCulled,
      // These authored fitting metadata fields contain no timing or runtime references.
      fittingMetadata: node.userData.fittingSlot ? semantic(node.userData) : null,
      materials: ids, count: node.count, instanceMatrix: attributeDigest(node.instanceMatrix),
      instanceColor: attributeDigest(node.instanceColor),
      levels: node.levels?.map(level => [level.distance, level.hysteresis, nodeIds.get(level.object)]),
      geometry: geometry ? { type: geometry.type, groups: geometry.groups, drawRange: geometry.drawRange,
        attributes: Object.fromEntries(Object.keys(geometry.attributes).sort().map(key => [key, attributeDigest(geometry.attributes[key])])),
        morph: Object.fromEntries(Object.keys(geometry.morphAttributes).sort().map(key => [key, geometry.morphAttributes[key].map(attributeDigest)])),
        morphTargetsRelative: geometry.morphTargetsRelative, index: attributeDigest(geometry.index) } : null });
  }
  return { nodes: nodes.length, meshes: nodes.filter(node => node.isMesh).length,
    materials: materials.length, sha: createHash('sha256').update(JSON.stringify({ rows, materials })).digest('hex') };
}

async function nativeChild(reference) {
  const coreUrl = new URL('./tankFactoryCore.ts', import.meta.url).href;
  const call = 'deduplicateEraSurfaces(surfaces)';
  let served = 0, active;
  // Observe the real native fitting input; do not replace the builders, source
  // surfaces, frames, descriptors, exact authored facets, lighting or gear.
  const hook = registerHooks({ load(url, context, next) {
    if (url !== coreUrl) return next(url, context);
    const current = fs.readFileSync(new URL(url), 'utf8');
    assert.ok(current.includes("import { deduplicateEraSurfaces } from './eraSurfaceDeduplication.ts';"));
    assert.equal(current.split(call).length, 2, 'one actual production deduplication call');
    assert.ok(!current.includes('function describeEraSurface('), 'no alternate inline implementation');
    served++;
    return { format: 'module', shortCircuit: true, source: stripTypeScriptTypes(
      current.replace(call, 'globalThis.__eraDescriptorCheckpoint(surfaces)')) };
  } });
  globalThis.__eraDescriptorCheckpoint = input => {
    assert.ok(active, 'every real fitting invocation belongs to the active build');
    const before = JSON.stringify(input); let expected, actual;
    const legacyReads = countReads(value => { expected = legacy(value); }, input);
    const currentReads = countReads(value => { actual = deduplicateEraSurfaces(value); }, input);
    assert.equal(actual.length, expected.length);
    for (let i = 0; i < actual.length; i++) assert.equal(actual[i], expected[i], 'actual native selected face reference/order');
    for (const surface of input) {
      assert.deepEqual(describeCurrent(surface), describeLegacy(surface), 'actual native descriptor center/normal remain exact');
    }
    assert.equal(JSON.stringify(input), before, 'native fitting vertices are never mutated');
    assert.equal(currentReads, input.reduce((sum, face) => sum + face.length + 3, 0), 'one descriptor per real input surface');
    assert.ok(currentReads <= legacyReads);
    active.calls++; active.inputFaces += input.length; active.outputFaces += actual.length;
    active.legacyReads += legacyReads; active.currentReads += currentReads;
    active.selections.push(createHash('sha256').update(JSON.stringify(actual)).digest('hex'));
    return reference ? expected : actual;
  };
  try {
    const { createTank } = await import('./tankFactory.ts');
    const results = [];
    for (const cycle of [0, 1]) for (const id of ['m1a2', 'challenger_3x', 'challenger2', 'leo2_revolution']) {
      for (const quality of ['high', 'low']) {
        active = { calls: 0, inputFaces: 0, outputFaces: 0, legacyReads: 0, currentReads: 0, selections: [] };
        const visual = createTank(id, null, { quality, materialMode: 'geometry-only', proceduralOnly: true,
          camoSeed: 4242, decor: true, batchStatic: true });
        const row = { id, quality, cycle, ...active, content: digest(visual.root) };
        visual.dispose(); results.push(row); active = null;
      }
    }
    assert.equal(served, 1);
    for (const id of ['m1a2', 'challenger_3x']) {
      const affected = results.filter(row => row.id === id);
      assert.ok(affected.every(row => row.inputFaces > 0 && row.currentReads < row.legacyReads), `${id} actual affected fitting path exercised`);
    }
    console.log('ERA_DESCRIPTOR_NATIVE ' + JSON.stringify(results));
  } finally {
    delete globalThis.__eraDescriptorCheckpoint; hook.deregister();
  }
}

if (process.argv.includes('--native-child')) {
  await nativeChild(process.argv.includes('--reference'));
} else {
  const run = reference => {
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--native-child', ...(reference ? ['--reference'] : [])],
      { encoding: 'utf8', timeout: 180000, maxBuffer: 8 * 1024 * 1024 });
    assert.ifError(child.error); assert.equal(child.status, 0, child.stderr || child.stdout);
    const row = child.stdout.split('\n').find(line => line.startsWith('ERA_DESCRIPTOR_NATIVE '));
    assert.ok(row, 'complete native descriptor receipt'); return JSON.parse(row.slice('ERA_DESCRIPTOR_NATIVE '.length));
  };
  const before = run(true), after = run(false);
  assert.deepEqual(after, before, 'native geometry/material/rig/instance/LOD and concrete ERA selections are exact');
  assert.equal(after.length, 16);
  console.log(JSON.stringify({ test: 'ERA descriptor reuse', pass: true, nativeNodeBuilds: before.length + after.length,
    fixedLegacyCases: cases, syntheticReads: { old: oldReads, current: newReads },
    results: after.map(({ selections, ...row }) => ({ ...row,
      selectionsSha256: createHash('sha256').update(JSON.stringify(selections)).digest('hex') })),
    scope: 'Actual Node procedural construction and descriptor point reads; not browser paint, GPU work or tank-switch latency' }));
}
