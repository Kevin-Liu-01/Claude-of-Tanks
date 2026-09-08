import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
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
const control = transform(wreckSource, 'control');
const candidate = transform(wreckSource, 'normalize-first');
assert.deepEqual(candidate.counts, control.counts, 'candidate and control share exact observer coverage');
assert.throws(() => transform(wreckSource, 'unknown'));
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
  const outputs = [originalNormalize, controlNormalize, candidateNormalize].map((normalizer, index) => normalizer.invoke(inputs[index], keepNormal));
  try {
    assert.deepEqual(snapshot(outputs[1]), snapshot(outputs[0]), 'observation alone preserves every normalized output bit');
    assert.deepEqual(snapshot(outputs[2]), snapshot(outputs[0]), 'normalization candidate preserves indexed/non-indexed/missing-normal/morph/group output bits');
  } finally { for (const owned of new Set([...inputs, ...outputs])) owned.dispose(); }
}
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
