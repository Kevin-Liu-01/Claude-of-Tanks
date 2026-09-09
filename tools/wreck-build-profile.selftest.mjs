import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import ts from 'typescript-compiler-api';
import { createPropsProfiler, registerProfileCancellation } from './props-build-profile.mjs';
import { transform, transformConstructor } from './wreck-build-profile.mjs';

// Repeated OS-signal semantics are exercised with an emitter, no real process,
// lease or child. The diagnostic must keep using the persistent shared owner.
const toolSource = readFileSync(new URL('./wreck-build-profile.mjs', import.meta.url), 'utf8');
assert.match(toolSource, /const cancellation = registerProfileCancellation\(\(\) => child\)/);
assert.doesNotMatch(toolSource, /process\.once\(['"]SIG(?:INT|TERM)['"]/);
assert.ok(toolSource.indexOf('lock.release();') < toolSource.indexOf('cancellation.dispose();'),
  'signal handlers remain installed through lease release after awaited worker completion');
const emitter = new EventEmitter(), kills = [];
let child = null;
const cancellation = registerProfileCancellation(() => child, emitter);
for (const signal of ['SIGINT', 'SIGINT', 'SIGTERM', 'SIGTERM']) emitter.emit(signal);
assert.equal(cancellation.isInterrupted(), true);
assert.deepEqual(kills, [], 'queue cancellation cannot invent a child owner');
child = { kill: signal => kills.push(signal) };
emitter.emit('SIGINT'); emitter.emit('SIGINT');
assert.deepEqual(kills, ['SIGTERM', 'SIGTERM']);
child = null; emitter.emit('SIGTERM');
assert.equal(emitter.listenerCount('SIGINT'), 1);
assert.equal(emitter.listenerCount('SIGTERM'), 1, 'handlers survive until owned child drain');
cancellation.dispose(); cancellation.dispose();
assert.equal(emitter.listenerCount('SIGINT'), 0);
assert.equal(emitter.listenerCount('SIGTERM'), 0);
assert.equal(cancellation.isInterrupted(), true, 'cleanup retains interruption evidence');

const wreckSource = readFileSync(new URL('../src/world/wrecks.ts', import.meta.url), 'utf8');
const geometrySource = readFileSync(new URL('../src/world/exactWreckGeometry.ts', import.meta.url), 'utf8');
const control = transform(wreckSource, 'control');
const candidate = transform(wreckSource, 'normalize-first');
const geometryControl = transform(geometrySource, 'control', 'geometry');
const geometryCandidate = transform(geometrySource, 'normalize-first', 'geometry');
assert.deepEqual(candidate.counts, control.counts, 'candidate and control share exact observer coverage');
assert.deepEqual(geometryCandidate, geometryControl, 'normalization experiment cannot change compaction');
assert.deepEqual({ ...control.counts, ...geometryControl.counts }, {
  'visual.dispose': 1, collectWreckGeometry: 1, normalizeGeometry: 1, normalizeGeometrySet: 1,
  mergeRequired: 1, paintWreckGeometry: 1, mergeShadowGeometry: 1, wreckBakeResult: 1,
  createTank: 1, 'visual.setDestroyed': 1, compactWreckGeometry: 1,
}, 'both modules retain every original observer stage exactly once');
for (const name of ['collectWreckGeometrySteps', 'normalizeGeometrySetSteps', 'paintWreckGeometrySteps',
  'mergeShadowGeometrySteps', 'normalizeGeometry', 'mergeRequired', 'wreckBakeResult']) {
  assert.throws(() => transform(wreckSource.replace(` ${name}(`, ` missing_${name}(`), 'control'), /Exact .* hook/);
  assert.throws(() => transform(`${wreckSource}\nfunction ${name}() { return; }`, 'control'), /Exact .* hook/);
}
assert.throws(() => transform(wreckSource.replace('owner.visual.dispose()', 'owner.visual.close()'), 'control'), /Exact visual.dispose hook/);
assert.throws(() => transform(geometrySource.replace('function* compactWreckGeometrySteps(', 'function* missingCompaction('), 'control', 'geometry'), /Exact compactWreckGeometry hook/);
assert.throws(() => transform(`${geometrySource}\nfunction* compactWreckGeometrySteps() { return; }`, 'control', 'geometry'), /Exact compactWreckGeometry hook/);
assert.throws(() => transform(wreckSource, 'unknown'));
assert.throws(() => transform(wreckSource, 'control', 'unknown'), /Known wreck source kind/);
assert.throws(() => transform('function {', 'control'));
assert.throws(() => transformConstructor('', 'unknown'), /Known constructor source kind/);

// Execute just the actual normalization function from each in-memory variant
// on tiny buffers. No vehicle/world modules, Canvas, browser or GPU are loaded.
function normalization(source) {
  const file = ts.createSourceFile('wrecks.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const declaration = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'normalizeGeometry');
  assert.ok(declaration);
  const javascript = ts.transpileModule(declaration.getText(file), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  let time = 0;
  const profiler = createPropsProfiler(() => ++time);
  profiler.observeNormalization = () => {};
  const invoke = new Function('THREE', 'globalThis', `${javascript}; return normalizeGeometry;`)(THREE, { __WRECK_PROFILE: profiler });
  return { invoke, profiler };
}
function snapshot(geometry) {
  return { attributes: Object.entries(geometry.attributes).map(([name, attr]) => [name, {
    bytes: Buffer.from(attr.array.buffer, attr.array.byteOffset, attr.array.byteLength).toString('hex'),
    count: attr.count, itemSize: attr.itemSize, normalized: attr.normalized,
  }]), index: geometry.index, morphAttributes: geometry.morphAttributes, groups: geometry.groups };
}
const originalNormalize = normalization(wreckSource), controlNormalize = normalization(control.source),
  candidateNormalize = normalization(candidate.source);
for (const indexed of [false, true]) for (const keepNormal of [false, true]) for (const missingNormal of [false, true]) {
  let geometry = new THREE.BoxGeometry(1, 2, 3);
  if (!indexed) { const expanded = geometry.toNonIndexed(); geometry.dispose(); geometry = expanded; }
  if (missingNormal) geometry.deleteAttribute('normal');
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count * 3).fill(0.7), 3));
  geometry.morphAttributes.position = [geometry.attributes.position.clone()];
  const inputs = [geometry, geometry.clone(), geometry.clone()];
  const owners = inputs.map(() => ({ geometries: new Set() }));
  const outputs = [originalNormalize, controlNormalize, candidateNormalize].map((normalizer, index) => normalizer.invoke(inputs[index], keepNormal, owners[index]));
  try {
    assert.deepEqual(snapshot(outputs[1]), snapshot(outputs[0]), 'observation alone preserves every normalized output bit');
    assert.deepEqual(snapshot(outputs[2]), snapshot(outputs[0]), 'normalization candidate preserves indexed/non-indexed/missing-normal/morph/group output bits');
    owners.forEach((owner, index) => assert.deepEqual([...owner.geometries], [outputs[index]],
      'all normalization variants register the exact owned output'));
  } finally { for (const owned of new Set([...inputs, ...outputs])) owned.dispose(); }
}
for (const normalizer of [originalNormalize, controlNormalize, candidateNormalize]) {
  const input = new THREE.BoxGeometry(1, 2, 3), owner = { geometries: new Set() };
  input.deleteAttribute('normal');
  const expand = input.toNonIndexed.bind(input), failure = new Error('normal generation failed');
  let allocated;
  input.toNonIndexed = () => {
    allocated = expand();
    allocated.computeVertexNormals = () => { throw failure; };
    return allocated;
  };
  try {
    assert.throws(() => normalizer.invoke(input, true, owner), error => error === failure);
    assert.deepEqual([...owner.geometries], [allocated], 'failed normalization registers the allocated clone before throwing');
    normalizer.profiler.measure('after-allocation-error', () => {});
  } finally { input.dispose(); allocated?.dispose(); }
}

// Execute the whole tiny compactor module in memory: observing a generator
// call alone would report a span before any work. Its body must instead stay
// balanced through the existing synchronous drain, early return and failure.
function compaction(source) {
  const javascript = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  } }).outputText;
  const exports = {}, profiler = createPropsProfiler();
  const require = id => {
    if (id === 'three') return THREE;
    assert.equal(id, 'three/examples/jsm/utils/BufferGeometryUtils.js');
    return { mergeGeometries };
  };
  new Function('require', 'exports', 'globalThis', javascript)(require, exports, { __WRECK_PROFILE: profiler });
  return { invoke: exports.compactWreckGeometrySteps, profiler };
}
const originalCompact = compaction(geometrySource), observedCompact = compaction(geometryControl.source);
for (const closeEarly of [false, true]) {
  const input = new THREE.BoxGeometry(1, 2, 3), raw = input.toNonIndexed(), observed = raw.clone();
  const before = observedCompact.profiler.operations.compactWreckGeometry?.calls ?? 0;
  const a = originalCompact.invoke(raw), b = observedCompact.invoke(observed);
  assert.equal(observedCompact.profiler.operations.compactWreckGeometry?.calls ?? 0, before,
    'iterator creation cannot record compaction work');
  try {
    let step;
    do {
      step = a.next();
      const observedStep = b.next();
      assert.equal(observedStep.done, step.done);
      if (step.done) {
        assert.equal(step.value, raw);
        assert.equal(observedStep.value, observed, 'observer preserves returned geometry ownership');
      } else assert.deepEqual(observedStep, step, 'observer preserves every yielded checkpoint');
      if (closeEarly && !step.done) { assert.deepEqual(b.return(), a.return()); break; }
    } while (!step.done);
    assert.deepEqual(snapshot(observed), snapshot(raw), 'observed compaction preserves exact output');
    assert.equal(observedCompact.profiler.operations.compactWreckGeometry.calls, before + 1);
    observedCompact.profiler.measure('after-compaction', () => {});
  } finally { a.return(); b.return(); input.dispose(); raw.dispose(); observed.dispose(); }
}
assert.throws(() => observedCompact.invoke(null).next());
observedCompact.profiler.measure('after-compaction-error', () => {});
for (const normalizer of [controlNormalize, candidateNormalize]) {
  const before = normalizer.profiler.operations.normalizeGeometry.calls;
  assert.throws(() => normalizer.invoke(null, true));
  assert.equal(normalizer.profiler.operations.normalizeGeometry.calls, before + 1, 'failed operation still closes its timing span');
  normalizer.profiler.measure('after-error', () => {});
  assert.equal(normalizer.profiler.operations['after-error'].calls, 1);
}
for (const [path, kind] of [['../src/vehicles/tankFactoryCore.ts', 'factory'], ['../src/vehicles/profiles/t90.ts', 'profile']]) {
  const observed = transformConstructor(readFileSync(new URL(path, import.meta.url), 'utf8'), kind);
  assert.ok(Object.values(observed.stages).every(stage => Number.isInteger(stage.line) && stage.line > 0));
}
console.log('wreck-build-profile.selftest: repeated cancellation ownership, source hooks and tiny exact normalization variants pass; no tank/world/browser built');
