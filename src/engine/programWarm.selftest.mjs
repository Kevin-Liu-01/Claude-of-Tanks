import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  captureNewProgramUniformSteps,
  compileForRenderTarget,
  createForwardProgramWarmOwner,
  snapshotRendererPrograms,
  warmNewRendererProgramUniforms,
} from './programWarm.ts';

const calls = [];
const oldProgram = { getUniforms: () => calls.push('old') };
const firstNew = { getUniforms: () => calls.push('first') };
const brokenNew = { getUniforms: () => { calls.push('broken'); throw new Error('driver'); } };
const renderer = { info: { programs: [oldProgram] } };
const baseline = snapshotRendererPrograms(renderer);
renderer.info.programs.push(firstNew, brokenNew, {});

let ticks = 0;
let clock = 0;
const receipt = await warmNewRendererProgramUniforms(
  renderer,
  baseline,
  async () => { ticks += 1; },
  () => { clock += 3; return clock; },
);

assert.deepEqual(calls, ['first', 'broken'], 'only newly linked uniform tables are consumed');
assert.equal(ticks, 2, 'each eligible program gives the scheduler a checkpoint');
assert.equal(receipt.programs, 2);
assert.equal(receipt.failures, 1, 'a driver-specific failure keeps the real-render fallback');
assert.equal(receipt.maxMs, 3);
assert.equal(receipt.totalMs, 15);

const targetCalls = [];
const targetRenderer = {
  target: 'default',
  face: 3,
  mip: 2,
  getRenderTarget() { return this.target; },
  getActiveCubeFace() { return this.face; },
  getActiveMipmapLevel() { return this.mip; },
  setRenderTarget(target, face = 0, mip = 0) {
    this.target = target;
    this.face = face;
    this.mip = mip;
    targetCalls.push(['target', target, face, mip]);
  },
  compile(root, camera, targetScene) {
    targetCalls.push(['compile', root, camera, targetScene, this.target]);
  },
};
compileForRenderTarget({
  renderer: targetRenderer,
  root: 'vehicle',
  camera: 'deployment-camera',
  targetScene: 'battle-scene',
  target: 'composer-hdr',
});
assert.deepEqual(targetCalls, [
  ['target', 'composer-hdr', 0, 0],
  ['compile', 'vehicle', 'deployment-camera', 'battle-scene', 'composer-hdr'],
  ['target', 'default', 3, 2],
], 'compile uses the production target and restores the complete prior state');

const initialized = [];
let warmClock = 0;
const warmPrograms = [];
const pendingProgram = {
  program: {},
  getUniforms() { initialized.push('uniforms'); },
};
const forwardGl = {
  getExtension(name) {
    assert.equal(name, 'KHR_parallel_shader_compile');
    return { COMPLETION_STATUS_KHR: 0x91B1 };
  },
  getProgramParameter(program, token) {
    assert.equal(program, pendingProgram.program);
    assert.equal(token, 0x91B1);
    return false;
  },
};
const forwardRenderer = {
  ...targetRenderer,
  info: { programs: warmPrograms },
  getContext() { return forwardGl; },
  compile(root, camera, targetScene) {
    targetRenderer.compile.call(this, root, camera, targetScene);
    if (!warmPrograms.length) warmPrograms.push(pendingProgram);
  },
};
const warmObject = {
  isMesh: true,
  name: 'test-mesh',
  traverseVisible(callback) { callback(this); },
};
const forwardOwner = createForwardProgramWarmOwner({
  renderer: forwardRenderer,
  scene: warmObject,
  camera: 'deployment-camera',
  getTarget: () => 'composer-hdr',
  now: () => { warmClock += 5; return warmClock; },
});
assert.equal([...forwardOwner.initializeSteps()].length, 1,
  'newly submitted programs yield after uniform discovery');
assert.deepEqual(initialized, ['uniforms']);
assert.equal([...forwardOwner.linkerBreathingSlices(3)].length, 3,
  'pending ANGLE links receive a bounded number of scheduler slices');
forwardOwner.invalidate();

function timedForwardFixture({ compileFailure = null, clockFailure = false } = {}) {
  let clock = 0;
  const events = [];
  const program = { program: {}, getUniforms() { assert.fail('compile timing must not initialize uniforms'); } };
  const renderer = {
    target: 'prior', face: 3, mip: 2, pending: true,
    info: { programs: [program] },
    getRenderTarget() { return this.target; },
    getActiveCubeFace() { return this.face; },
    getActiveMipmapLevel() { return this.mip; },
    setRenderTarget(target, face = 0, mip = 0) {
      clock += target === 'hdr' ? 3 : 7;
      events.push(['target', target, face, mip]);
      this.target = target; this.face = face; this.mip = mip;
    },
    compile(root, camera, scene) {
      clock += 11;
      events.push(['compile', root, camera, scene]);
      this.info.programs.push({ program: {} });
      if (compileFailure) throw compileFailure;
    },
    getContext() {
      if (this.gl) return this.gl;
      clock += 2;
      this.gl = {
        getExtension() {
          events.push(['extension']);
          clock += 3;
          if (renderer.extensionFailure) throw renderer.extensionFailure;
          return { COMPLETION_STATUS_KHR: 0x91B1 };
        },
        getProgramParameter() {
          events.push(['query']);
          clock += 7;
          if (renderer.queryFailure) throw renderer.queryFailure;
          return !renderer.pending;
        },
      };
      return this.gl;
    },
  };
  const owner = createForwardProgramWarmOwner({
    renderer, scene: 'scene', camera: 'camera', getTarget: () => 'hdr',
    now() {
      if (clockFailure) throw new Error('diagnostic clock failed');
      return clock;
    },
  });
  return { owner, renderer, events, advance(ms) { clock += ms; } };
}

for (const fail of [false, true]) {
  const failure = new Error('timed compile failed');
  const fixture = timedForwardFixture({ compileFailure: fail ? failure : null });
  const timing = {};
  if (fail) assert.throws(() => fixture.owner.compile('root', timing), (error) => error === failure);
  else fixture.owner.compile('root', timing);
  assert.deepEqual(timing, {
    programsBefore: 1, targetBindMs: 3, submissionMs: 11, targetRestoreMs: 7, programsAfter: 2,
  }, 'timing distinguishes target binding, renderer compilation and complete restoration');
  assert.deepEqual(fixture.events, [
    ['target', 'hdr', 0, 0], ['compile', 'root', 'camera', 'scene'], ['target', 'prior', 3, 2],
  ]);
  assert.deepEqual([fixture.renderer.target, fixture.renderer.face, fixture.renderer.mip], ['prior', 3, 2]);
}

for (const diagnostic of ['frozen', 'clock-failure']) {
  for (const fail of [false, true]) {
    const failure = new Error('original compilation failure');
    const fixture = timedForwardFixture({
      compileFailure: fail ? failure : null, clockFailure: diagnostic === 'clock-failure',
    });
    const timing = diagnostic === 'frozen' ? Object.freeze({}) : {};
    if (fail) assert.throws(() => fixture.owner.compile('root', timing), (error) => error === failure);
    else fixture.owner.compile('root', timing);
    assert.deepEqual([fixture.renderer.target, fixture.renderer.face, fixture.renderer.mip], ['prior', 3, 2],
      `${diagnostic}: optional diagnostics cannot break target restoration`);
  }
}

{
  const fixture = timedForwardFixture();
  const timing = {};
  const steps = fixture.owner.linkerBreathingSlices(3, timing);
  assert.equal(steps.next().done, false);
  assert.deepEqual(timing, { extensionMs: 3, queryMs: 7, maxQueryMs: 7, queryCount: 1,
    pollMs: 12, maxPollMs: 12, pollCount: 1, yields: 1 },
    'the first linker round includes context/extension setup and its completion query');
  fixture.advance(1000);
  assert.equal(steps.next().done, false);
  assert.deepEqual(timing, { extensionMs: 3, queryMs: 14, maxQueryMs: 7, queryCount: 2,
    pollMs: 19, maxPollMs: 12, pollCount: 2, yields: 2 },
    'the caller wait is excluded from synchronous polling time');
  fixture.advance(1000);
  fixture.renderer.pending = false;
  assert.equal(steps.next().done, true);
  assert.deepEqual(timing, { extensionMs: 3, queryMs: 21, maxQueryMs: 7, queryCount: 3,
    pollMs: 26, maxPollMs: 12, pollCount: 3, yields: 2 });
}

{
  const fixture = timedForwardFixture();
  const timing = {};
  const steps = fixture.owner.linkerBreathingSlices(1, timing);
  assert.equal(steps.next().done, false);
  fixture.advance(1000);
  assert.equal(steps.next().done, true);
  assert.deepEqual(timing, { extensionMs: 3, queryMs: 7, maxQueryMs: 7, queryCount: 1,
    pollMs: 12, maxPollMs: 12, pollCount: 1, yields: 1 },
    'the last resume neither extends polling time nor adds an empty polling round');
}

{
  const fixture = timedForwardFixture();
  const timing = {};
  const steps = fixture.owner.linkerBreathingSlices(3, timing);
  steps.next();
  fixture.advance(1000);
  steps.return();
  assert.deepEqual(timing, { extensionMs: 3, queryMs: 7, maxQueryMs: 7, queryCount: 1,
    pollMs: 12, maxPollMs: 12, pollCount: 1, yields: 1 },
    'closing a yielded generator does not include external waiting time');
}

{
  const fixture = timedForwardFixture({ clockFailure: true });
  assert.equal([...fixture.owner.linkerBreathingSlices(2, {})].length, 2,
    'diagnostic clock errors cannot skip the original bounded linker waits');
}

{
  const fixture = timedForwardFixture();
  fixture.renderer.pending = false;
  fixture.renderer.info.programs.push({ program: undefined }, { program: {} });
  const first = {};
  assert.equal([...fixture.owner.linkerBreathingSlices(3, first)].length, 0);
  assert.deepEqual(first, { extensionMs: 3, queryMs: 14, maxQueryMs: 7, queryCount: 2,
    pollMs: 19, maxPollMs: 19, pollCount: 1 },
  'one round can query multiple live programs, while destroyed references are skipped');
  const cached = {};
  assert.equal([...fixture.owner.linkerBreathingSlices(3, cached)].length, 0);
  assert.deepEqual(cached, { queryMs: 14, maxQueryMs: 7, queryCount: 2,
    pollMs: 14, maxPollMs: 14, pollCount: 1 }, 'cached context/extension lookup adds no native call or timing');
  assert.equal(fixture.events.filter(([name]) => name === 'extension').length, 1);
  assert.equal(fixture.events.filter(([name]) => name === 'query').length, 4,
    'timing does not introduce readiness probes');
}

for (const operation of ['extension', 'query']) {
  const fixture = timedForwardFixture();
  fixture.renderer[`${operation}Failure`] = new Error(`native ${operation} failed`);
  const timing = {};
  assert.equal([...fixture.owner.linkerBreathingSlices(3, timing)].length, 0,
    'native probe failure keeps the existing best-effort fallback');
  assert.equal(timing.extensionMs, 3);
  assert.equal(timing.queryMs, operation === 'query' ? 7 : undefined);
  assert.equal(timing.maxQueryMs, operation === 'query' ? 7 : undefined);
  assert.equal(timing.queryCount, operation === 'query' ? 1 : undefined);
  assert.equal(timing.pollMs, operation === 'query' ? 12 : 5,
    'failed existing GL calls retain their elapsed operation time');
}

{
  const fixture = timedForwardFixture();
  assert.equal([...fixture.owner.linkerBreathingSlices(2, Object.freeze({}))].length, 2,
    'frozen diagnostics do not alter query results or bounded yielding');
  assert.equal(fixture.events.filter(([name]) => name === 'extension').length, 1);
  assert.equal(fixture.events.filter(([name]) => name === 'query').length, 2);
}

for (const reason of ['aborted', 'invalidated', 'renderer-restored']) {
  const fixture = timedForwardFixture();
  const controller = new AbortController();
  const steps = fixture.owner.linkerBreathingSlices(3, {}, controller.signal);
  assert.equal(steps.next().done, false);
  const original = new Error('room gone');
  if (reason === 'aborted') controller.abort(original);
  else if (reason === 'invalidated') fixture.owner.invalidate();
  else fixture.renderer.info = { programs: [] };
  fixture.renderer.getContext = () => assert.fail('never acquire stale context');
  if (reason === 'aborted') assert.throws(() => steps.next(), (error) => error === original);
  else assert.equal(steps.next().done, true);
}
{
  const fixture = timedForwardFixture();
  const controller = new AbortController();
  controller.abort();
  fixture.renderer.getContext = () => assert.fail('no context acquisition after cancellation');
  assert.throws(() => fixture.owner.linkerBreathingSlices(3, {}, controller.signal).next(),
    (error) => error === controller.signal.reason);
}

{
  const fixture = timedForwardFixture();
  fixture.renderer.pending = false;
  const existing = new Set(fixture.renderer.info.programs);
  fixture.renderer.info.programs.push({ program: {} });
  const timing = {};
  assert.equal([...fixture.owner.linkerBreathingSlices(3, timing, undefined, existing)].length, 0);
  assert.equal(timing.existingQueryMs, 7);
  assert.equal(timing.maxExistingQueryMs, 7);
  assert.equal(timing.existingQueryCount, 1);
  assert.equal(timing.newQueryMs, 7);
  assert.equal(timing.maxNewQueryMs, 7);
  assert.equal(timing.newQueryCount, 1);
  assert.equal(timing.queryMs, timing.existingQueryMs + timing.newQueryMs,
    'cohort timing classifies existing native calls without introducing more queries');
  assert.equal(fixture.events.filter(([name]) => name === 'query').length, 2);
}

function firstUseFixture({ names = ['back', 'front', 'instanced'], extension = true,
  clockFailure = false, clockFrozen = false } = {}) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const material = new THREE.MeshStandardMaterial({ transparent: true, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
  scene.add(mesh);
  const events = [];
  let clock = 0;
  const state = { query: () => true, reflect: () => {}, compile: () => {}, blocked: false,
    queryMs: 2, uniformMs: 7 };
  const assertActive = () => assert.equal(state.blocked, false, 'no access after owner invalidation');
  const programs = names.map((name) => ({
    name, program: { name },
    getUniforms() {
      assertActive();
      assertRestored();
      events.push(['uniform', name]);
      clock += state.uniformMs;
      state.reflect(name);
      return {};
    },
    getAttributes() { assertActive(); assertRestored(); return {}; },
  }));
  const unrelated = { name: 'garage', program: { name: 'garage' },
    getUniforms() { assert.fail('unsubmitted Garage material is outside the first-use cohort'); } };
  const materialProperties = {
    programs: new Map(programs.map((program) => [program.name, program])),
    currentProgram: programs[1] ?? programs[0],
  };
  const gl = {
    lost: false,
    isContextLost() { assertActive(); return this.lost; },
    getExtension() { assertActive(); events.push(['extension']);
      return extension ? { COMPLETION_STATUS_KHR: 0x91b1 } : null; },
    getProgramParameter(handle, token) {
      assertActive();
      assertRestored();
      assert.equal(token, 0x91b1);
      events.push(['query', handle.name]);
      clock += state.queryMs;
      return state.query(handle.name);
    },
  };
  const renderer = {
    target: 'prior', face: 3, mip: 2,
    info: { programs: [unrelated, ...programs] },
    properties: { get(value) { assertActive(); assert.equal(value, material); return materialProperties; } },
    getContext() { assertActive(); return gl; },
    getRenderTarget() { assertActive(); return this.target; },
    getActiveCubeFace() { return this.face; },
    getActiveMipmapLevel() { return this.mip; },
    setRenderTarget(target, face = 0, mip = 0) { this.target = target; this.face = face; this.mip = mip; },
    compile(root) {
      assertActive();
      assert.equal(this.target, 'hdr');
      const materials = new Set();
      root.traverse((object) => materials.add(object.material));
      state.compile();
      return materials;
    },
  };
  function assertRestored() {
    assert.deepEqual([renderer.target, renderer.face, renderer.mip], ['prior', 3, 2]);
    assert.equal(camera.layers.mask, 1);
    assert.equal(mesh.parent, scene);
  }
  const owner = createForwardProgramWarmOwner({
    renderer, scene, camera, getTarget: () => 'hdr',
    now() { if (clockFailure) throw new Error('clock unavailable'); return clockFrozen ? 0 : clock; },
  });
  return { owner, renderer, gl, events, programs, unrelated, materialProperties, state, assertRestored,
    advance(ms) { clock += ms; },
    prepare(options = {}) { return owner.prepareSceneSteps({ initializeUniforms: true, ...options }); },
    drain(steps) {
      let yields = 0;
      while (!steps.next().done) { assertRestored(); assert.ok(++yields < 1000, 'bounded first-use job'); }
      assertRestored();
      return yields;
    },
  };
}

{
  const f = firstUseFixture();
  const timing = {};
  f.drain(f.prepare({ timing }));
  assert.deepEqual(f.events.filter(([kind]) => kind === 'uniform').map(([, name]) => name),
    ['back', 'front', 'instanced'],
    'first-use warms every retained compiled-material variant, not just currentProgram or new programs');
  assert.deepEqual(f.events.filter(([kind]) => kind === 'query').map(([, name]) => name),
    ['back', 'front', 'instanced'], 'unrelated retained Garage programs are never queried');
  assert.equal(timing.uniformCount, 3);
  assert.equal(timing.uniformMs, 21);
  assert.equal(timing.maxUniformMs, 7);
  assert.equal(timing.uniformFailures, 0);
  assert.equal(timing.uniformYields, 3, 'each native reflection releases the task before another');
  assert.equal(timing.uniformPending, 0);
  assert.equal(timing.programsBefore, 4);
  assert.equal(timing.programsAfter, 4, 'zero new wrapper count does not mean uniform tables were initialized');
}

{
  const f = firstUseFixture();
  const timing = {};
  f.drain(f.prepare({ initializeUniforms: false, timing }));
  assert.equal(f.events.filter(([kind]) => kind === 'uniform').length, 0);
  assert.deepEqual(f.events.filter(([kind]) => kind === 'query').map(([, name]) => name),
    ['garage', 'back', 'front', 'instanced'], 'default retains its original all-renderer bounded polling');
  assert.equal(timing.uniformCount, undefined, 'default diagnostics remain unchanged');
}

for (const result of [false, null, 1]) {
  const f = firstUseFixture({ names: ['pending', 'ready'] });
  const timing = {};
  f.state.query = (name) => name === 'ready' ? true : result;
  f.drain(f.prepare({ timing }));
  assert.deepEqual(f.events.filter(([kind]) => kind === 'uniform'), [['uniform', 'ready']],
    'only explicit completion permits reflection, while independent ready programs can advance');
  assert.ok(f.events.filter(([kind, name]) => kind === 'query' && name === 'pending').length <= 120);
  assert.equal(timing.uniformPending, 1, 'exhausted readiness rounds cannot claim completion');
}

{
  const f = firstUseFixture({ names: ['waiting'] });
  const timing = {};
  let ready = false;
  f.state.query = () => ready;
  const steps = f.prepare({ timing });
  assert.equal(steps.next().done, false, 'submission checkpoint precedes native queries');
  assert.equal(steps.next().done, false, 'pending link yields without reflection');
  assert.equal(timing.uniformCount, 0);
  ready = true;
  f.drain(steps);
  assert.deepEqual(f.events.filter(([kind]) => kind === 'uniform'), [['uniform', 'waiting']]);
  assert.equal(timing.uniformPending, 0);
}

{
  const f = firstUseFixture({ names: ['waiting'] });
  const timing = {};
  f.state.query = () => false;
  const steps = f.prepare({ timing });
  steps.next();
  steps.next();
  const events = f.events.length;
  f.advance(5001);
  assert.equal(steps.next().done, true, 'the wall-clock deadline includes caller wait time');
  assert.equal(f.events.length, events, 'deadline fallback performs no final blocking reflection/query');
  assert.equal(timing.uniformPending, 1);
}

for (const boundary of ['abort', 'epoch', 'info', 'context', 'return', 'throw']) {
  const f = firstUseFixture();
  const controller = new AbortController();
  const original = new Error(`first-use ${boundary}`);
  const steps = f.prepare({ signal: controller.signal });
  steps.next();
  assert.equal(steps.next().done, false, 'first reflection yields before the next program');
  assert.equal(f.events.filter(([kind]) => kind === 'uniform').length, 1);
  const events = f.events.length;
  if (boundary === 'abort') controller.abort(original);
  if (boundary === 'epoch') f.owner.invalidate();
  if (boundary === 'info') f.renderer.info = { programs: [] };
  if (boundary === 'context') f.gl.lost = true;
  if (boundary !== 'context') f.state.blocked = true;
  if (boundary === 'return') steps.return();
  else if (boundary === 'throw') assert.throws(() => steps.throw(original), (error) => error === original);
  else if (boundary === 'abort') assert.throws(() => steps.next(), (error) => error === original);
  else assert.equal(steps.next().done, true);
  assert.equal(f.events.length, events, 'no later query/reflection after abandonment');
  f.assertRestored();
}

{
  const f = firstUseFixture();
  const timing = {};
  const steps = f.prepare({ timing });
  steps.next();
  steps.next();
  const later = { program: { name: 'later' }, getUniforms() { assert.fail('live additions are not submitted'); } };
  f.renderer.info.programs = [later, f.programs[2], f.programs[1]];
  f.materialProperties.currentProgram = later;
  f.materialProperties.programs.set('later', later);
  f.drain(steps);
  assert.deepEqual(f.events.filter(([kind]) => kind === 'uniform').map(([, name]) => name),
    ['back', 'front', 'instanced'], 'array compaction and later material selection do not redirect frozen identities');
  assert.equal(timing.uniformCount, 3);
}

for (const mutation of ['remove', 'replace-handle', 'destroy']) {
  const f = firstUseFixture({ names: ['stale', 'ready'] });
  const timing = {};
  const steps = f.prepare({ timing });
  steps.next();
  if (mutation === 'remove') f.renderer.info.programs.splice(1, 1);
  if (mutation === 'replace-handle') f.programs[0].program = { name: 'replacement' };
  if (mutation === 'destroy') f.programs[0].program = undefined;
  f.drain(steps);
  assert.deepEqual(f.events.filter(([kind]) => kind === 'query'), [['query', 'ready']]);
  assert.deepEqual(f.events.filter(([kind]) => kind === 'uniform'), [['uniform', 'ready']]);
  assert.equal(timing.uniformPending, 0, 'removed/replaced captured handles are no longer live pending work');
}

{
  const f = firstUseFixture();
  const timing = {};
  f.state.reflect = (name) => { if (name === 'front') throw new Error('uniform reflection failed'); };
  f.drain(f.prepare({ timing }));
  assert.equal(timing.uniformCount, 3);
  assert.equal(timing.uniformFailures, 1);
  assert.equal(timing.uniformPending, 1, 'a failed call is left to the unchanged real-render fallback');
  assert.equal(timing.uniformMs, 21, 'failed native reflection retains its elapsed time');
}

{
  const f = firstUseFixture({ extension: false });
  const timing = {};
  f.drain(f.prepare({ timing }));
  assert.equal(timing.uniformCount, 3, 'missing KHR retains guarded per-program synchronous fallback');
  assert.equal(timing.uniformYields, 3);
  assert.equal(timing.uniformPending, 0, 'this reports reflection completion, not proven link readiness');
  assert.equal(timing.queryCount, undefined, 'fallback does not fabricate native completion queries');
}

for (const operation of ['extension', 'query']) {
  const f = firstUseFixture();
  const timing = {};
  if (operation === 'extension') f.gl.getExtension = () => { throw new Error('extension lookup failed'); };
  else f.state.query = () => { throw new Error('native query failed'); };
  f.drain(f.prepare({ timing }));
  assert.equal(f.events.filter(([kind]) => kind === 'uniform').length, 0,
    'a native failure cannot be interpreted as the unsupported-extension readiness fallback');
  assert.equal(timing.uniformPending, 3);
}

for (const boundary of ['abort', 'epoch', 'info', 'context', 'handle', 'remove', 'deadline']) {
  const f = firstUseFixture({ names: ['first', 'next'] });
  const controller = new AbortController();
  const original = new Error(`query invalidated ${boundary}`);
  const timing = {};
  f.state.query = (name) => {
    if (name !== 'first') return true;
    if (boundary === 'abort') controller.abort(original);
    if (boundary === 'epoch') f.owner.invalidate();
    if (boundary === 'info') f.renderer.info = { programs: [] };
    if (boundary === 'context') f.gl.lost = true;
    if (boundary === 'handle') f.programs[0].program = { name: 'replaced' };
    if (boundary === 'remove') f.renderer.info.programs.splice(1, 1);
    if (boundary === 'deadline') f.advance(5001);
    return true;
  };
  const steps = f.prepare({ timing, signal: controller.signal });
  if (boundary === 'abort') assert.throws(() => f.drain(steps), (error) => error === original);
  else f.drain(steps);
  const reflected = f.events.filter(([kind]) => kind === 'uniform');
  assert.deepEqual(reflected, ['handle', 'remove'].includes(boundary) ? [['uniform', 'next']] : [],
    `${boundary}: recheck lifetime and deadline between successful readiness query and reflection`);
}

{
  const f = firstUseFixture({ names: ['pending'], clockFailure: true });
  const controller = new AbortController();
  const original = new Error('aborted at final bounded wait');
  f.state.query = () => false;
  const steps = f.prepare({ signal: controller.signal });
  steps.next();
  for (let round = 0; round < 120; round++) assert.equal(steps.next().done, false);
  controller.abort(original);
  assert.throws(() => steps.next(), (error) => error === original,
    'even the last readiness wait preserves cancellation when the clock is unavailable');
}

for (const diagnostics of ['frozen', 'clock-unavailable']) {
  const f = firstUseFixture({ clockFailure: diagnostics === 'clock-unavailable' });
  const timing = diagnostics === 'frozen' ? Object.freeze({}) : {};
  f.drain(f.prepare({ timing }));
  assert.equal(f.events.filter(([kind]) => kind === 'uniform').length, 3,
    'optional diagnostics do not change actual first-use work');
}

{
  const f = firstUseFixture({ names: Array.from({ length: 136 }, (_, index) => `fast-${index}`) });
  f.state.queryMs = 0.02;
  f.state.uniformMs = 0.05;
  const timing = {};
  assert.equal(f.drain(f.prepare({ timing })), 5,
    '136 cheap programs need one submission wait plus four bounded first-use waits, not 137 waits');
  assert.equal(timing.uniformCount, 136);
  assert.equal(timing.queryCount, 136);
  assert.equal(timing.uniformYields, 4);
  assert.equal(timing.uniformPending, 0);
}

for (const [sliceMs, expectedFirstChunk] of [[undefined, 2], [0, 1], [1, 1], [8, 4], [100, 4], [NaN, 2]]) {
  const f = firstUseFixture({ names: Array.from({ length: 10 }, (_, index) => `timed-${index}`) });
  f.state.queryMs = 1;
  f.state.uniformMs = 1;
  const steps = f.prepare({ sliceMs });
  assert.equal(steps.next().done, false);
  assert.equal(steps.next().done, false);
  assert.equal(f.events.filter(([kind]) => kind === 'uniform').length, expectedFirstChunk,
    'the 4 ms default and clamped 1–8 ms override budget total native query plus reflection time');
  steps.return();
}

for (const result of ['pending', 'failure']) {
  const f = firstUseFixture();
  f.state.queryMs = 6;
  f.state.query = () => {
    if (result === 'failure') throw new Error('native query failed');
    return false;
  };
  const steps = f.prepare();
  steps.next();
  assert.equal(steps.next().done, false);
  assert.equal(f.events.filter(([kind]) => kind === 'query').length, 1,
    `${result}: expensive non-reflecting queries must release a slice before another query`);
  assert.equal(f.events.filter(([kind]) => kind === 'uniform').length, 0);
  steps.return();
}

for (const failure of [false, true]) {
  const f = firstUseFixture();
  f.state.queryMs = 0;
  f.state.uniformMs = 6;
  f.state.reflect = () => { if (failure) throw new Error('reflection failed'); };
  const steps = f.prepare();
  steps.next();
  assert.equal(steps.next().done, false);
  assert.equal(f.events.filter(([kind]) => kind === 'uniform').length, 1,
    'an expensive indivisible reflection releases the slice even when it fails');
  steps.return();
}

for (const clock of ['unavailable', 'frozen']) {
for (const work of ['ready', 'pending', 'failed', 'stale']) {
  const f = firstUseFixture({ names: Array.from({ length: 65 }, (_, index) => `bounded-${index}`),
    clockFailure: clock === 'unavailable', clockFrozen: clock === 'frozen' });
  f.state.queryMs = 0;
  f.state.uniformMs = 0;
  f.state.query = () => {
    if (work === 'failed') throw new Error('query failed');
    return work !== 'pending';
  };
  const timing = {};
  const steps = f.prepare({ timing });
  steps.next();
  if (work === 'stale') for (const program of f.programs) program.program = undefined;
  assert.equal(steps.next().done, false, `${clock}/${work}: finite entry ceiling always yields`);
  const queries = f.events.filter(([kind]) => kind === 'query').length;
  assert.equal(queries, work === 'stale' ? 0 : 32, 'at most 32 cohort entries per checkpoint');
  assert.equal(timing.uniformCount, work === 'ready' ? 32 : 0);
  if (work === 'stale') assert.equal(timing.uniformPending, 0);
  steps.return();
}
}

{
  const f = firstUseFixture({ names: ['first', 'second', 'third', 'fourth'] });
  f.state.queryMs = 1;
  f.state.uniformMs = 1;
  const steps = f.prepare();
  steps.next();
  steps.next();
  assert.equal(f.events.filter(([kind]) => kind === 'uniform').length, 2);
  f.advance(1000);
  assert.equal(steps.next().done, false);
  assert.equal(f.events.filter(([kind]) => kind === 'uniform').length, 4,
    'the next slice starts after caller paint time, not at the previous yield');
  assert.equal(steps.next().done, true);
}

{
  const f = firstUseFixture({ names: Array.from({ length: 10 }, (_, index) => `cancel-${index}`) });
  f.state.queryMs = 0;
  f.state.uniformMs = 0;
  const controller = new AbortController();
  const original = new Error('cancelled inside cheap reflection chunk');
  f.state.reflect = (name) => { if (name === 'cancel-1') controller.abort(original); };
  const steps = f.prepare({ signal: controller.signal });
  steps.next();
  assert.throws(() => steps.next(), (error) => error === original);
  assert.equal(f.events.filter(([kind]) => kind === 'uniform').length, 2,
    'chunking cannot defer cancellation until the next scheduling checkpoint');
  f.assertRestored();
}

{
  const f = firstUseFixture({ names: Array.from({ length: 33 }, (_, index) => `retained-${index}`),
    clockFrozen: true });
  f.state.queryMs = 0;
  f.state.uniformMs = 0;
  f.state.query = (name) => name !== 'retained-32';
  const steps = f.prepare();
  steps.next();
  steps.next(); // 32 ready entries exhaust the first chunk.
  steps.next(); // The last pending entry releases the round.
  const queries = f.events.filter(([kind]) => kind === 'query').length;
  assert.equal(steps.next().done, false, 'already-initialized entries also count against the ceiling');
  assert.equal(f.events.filter(([kind]) => kind === 'query').length, queries);
  steps.return();
}

{
  const f = firstUseFixture({ names: Array.from({ length: 32 }, (_, index) => `pending-${index}`),
    clockFrozen: true });
  f.state.queryMs = 0;
  f.state.query = () => false;
  const timing = {};
  assert.equal(f.drain(f.prepare({ timing })), 121,
    'a final-entry budget checkpoint also releases the pending round, without two consecutive waits');
  assert.equal(timing.uniformYields, 120);
  assert.equal(timing.queryCount, 32 * 120);
  assert.equal(timing.uniformPending, 32);
}

function capturedNewFixture(count = 1) {
  const events = [];
  const state = { clock: 0, current: true, lost: false, query: () => true, queryMs: 0, uniformMs: 0 };
  const old = { program: {}, getUniforms() { assert.fail('retained programs are outside this new cohort'); } };
  const gl = {
    isContextLost: () => state.lost,
    getExtension() { events.push(['extension']); return { COMPLETION_STATUS_KHR: 0x91B1 }; },
    getProgramParameter(handle, token) {
      assert.equal(token, 0x91B1);
      events.push(['query', handle]);
      state.clock += state.queryMs;
      return state.query(handle);
    },
  };
  const renderer = { info: { programs: [old] }, getContext: () => gl };
  const before = snapshotRendererPrograms(renderer);
  const programs = Array.from({ length: count }, (_, index) => ({
    program: { index },
    getUniforms() { events.push(['uniform', index]); state.clock += state.uniformMs; return {}; },
    getAttributes() { return {}; },
  }));
  renderer.info.programs.push(...programs);
  const capture = (options = {}) => captureNewProgramUniformSteps(renderer, before, {
    now: () => state.clock, isCurrent: () => state.current, ...options,
  });
  return { renderer, gl, state, events, old, programs, capture };
}

{
  const f = capturedNewFixture(65);
  const timing = {};
  const steps = f.capture({ timing });
  f.renderer.info.programs.push({ program: {}, getUniforms() { assert.fail('later additions are excluded'); } });
  assert.deepEqual(f.events, [], 'capture is synchronous metadata only, without native queries/reflection');
  assert.equal(steps.next().done, false, 'a restored submission gets a scheduling checkpoint');
  assert.deepEqual(f.events, []);
  assert.equal([...steps].length, 2, '65 cheap programs require only two bounded work checkpoints');
  assert.equal(timing.uniformCount, 65);
  assert.equal(timing.uniformPending, 0);
}

{
  const f = capturedNewFixture(4);
  const steps = f.capture();
  const handles = f.programs.map((program) => program.program);
  f.renderer.info.programs = [f.programs[3], f.programs[2], f.programs[1]];
  f.programs[1].program = {};
  assert.equal([...steps].length, 1);
  assert.deepEqual(f.events.filter(([kind]) => kind === 'query').map(([, handle]) => handle),
    [handles[2], handles[3]], 'compaction cannot lose surviving identities or query removed/replaced handles');
}

for (const change of ['abort', 'epoch', 'info', 'context', 'lost']) {
  const f = capturedNewFixture(33);
  const controller = new AbortController();
  const steps = f.capture({ signal: controller.signal });
  steps.next();
  steps.next(); // 32 entries, then a real work-budget checkpoint.
  if (change === 'abort') controller.abort();
  if (change === 'epoch') f.state.current = false;
  if (change === 'info') f.renderer.info = { programs: f.programs };
  if (change === 'context') f.renderer.getContext = () => ({ ...f.gl });
  if (change === 'lost') f.state.lost = true;
  if (change === 'abort') assert.throws(() => steps.next(), { name: 'AbortError' });
  else assert.equal(steps.next().done, true);
  assert.equal(f.events.filter(([kind]) => kind === 'uniform').length, 32, `${change}: stale jobs stop`);
}

for (const change of ['dispose', 'replace', 'context', 'lost', 'abort']) {
  const f = capturedNewFixture();
  const controller = new AbortController();
  f.state.query = () => {
    if (change === 'dispose') f.renderer.info.programs = [f.old];
    if (change === 'replace') f.programs[0].program = {};
    if (change === 'context') f.renderer.getContext = () => ({ ...f.gl });
    if (change === 'lost') f.state.lost = true;
    if (change === 'abort') controller.abort();
    return true;
  };
  const run = () => [...f.capture({ signal: controller.signal })];
  if (change === 'abort') assert.throws(run, { name: 'AbortError' });
  else run();
  assert.equal(f.events.filter(([kind]) => kind === 'uniform').length, 0,
    `${change}: lifetime is rechecked between readiness and reflection`);
}

{
  const f = capturedNewFixture();
  f.state.query = () => false;
  const timing = {};
  assert.equal([...f.capture({ timing })].length, 121, 'pending links retain the finite 120-round bound');
  assert.equal(timing.uniformPending, 1);
  assert.equal(timing.uniformCount, 0);
  assert.equal(timing.queryCount, 120);
}

{
  const f = capturedNewFixture();
  f.state.query = () => { throw new Error('native query failed'); };
  const timing = {};
  [...f.capture({ timing })];
  assert.equal(timing.queryCount, 1);
  assert.equal(timing.uniformCount, 0, 'an unsuccessful readiness query never permits reflection');
  assert.equal(timing.uniformPending, 1);
}

for (const operation of ['query', 'uniform']) {
  const f = capturedNewFixture(3);
  f.state[`${operation}Ms`] = 5;
  const timing = {};
  assert.equal([...f.capture({ timing })].length, 4, `${operation}: expensive calls release a checkpoint`);
  assert.equal(timing.uniformCount, 3);
}

{
  const f = capturedNewFixture(65);
  f.gl.getExtension = () => null;
  const timing = {};
  assert.equal([...f.capture({ timing, now() { throw new Error('clock'); } })].length, 3,
    'no-KHR fallback and a broken clock retain the 32-entry ceiling');
  assert.equal(timing.uniformCount, 65);
  assert.equal(timing.queryCount, undefined, 'fallback reflection is not a link-completion receipt');
}

{
  const f = capturedNewFixture(33);
  const steps = f.capture();
  steps.next();
  steps.next();
  steps.return();
  assert.equal(steps.next().done, true);
  assert.equal(f.events.filter(([kind]) => kind === 'uniform').length, 32, 'returned jobs do no later work');
}

{
  const f = capturedNewFixture(3);
  const timing = {};
  f.programs[0].getUniforms = () => { f.state.clock += 5; throw new Error('reflection'); };
  assert.equal([...f.capture({ timing })].length, 2, 'failed reflection time also exhausts the work budget');
  assert.equal(timing.uniformFailures, 1);
  assert.equal(timing.uniformCount, 3);
  assert.equal(timing.uniformPending, 1);
}

{
  const f = capturedNewFixture();
  f.gl.getExtension = () => { throw new Error('extension'); };
  const timing = {};
  assert.equal([...f.capture({ timing })].length, 1);
  assert.equal(f.events.length, 0, 'an extension-query failure is not the missing-KHR reflection fallback');
  assert.equal(timing.uniformPending, 1);
}

{
  const f = capturedNewFixture();
  f.state.query = () => false;
  const timing = {};
  const steps = f.capture({ timing });
  steps.next();
  steps.next();
  f.state.clock += 5001;
  assert.equal(steps.next().done, true, 'pending readiness respects the elapsed-time limit');
  assert.equal(timing.uniformPending, 1);
  assert.equal(timing.uniformCount, 0);
}

{
  const f = capturedNewFixture(0);
  assert.equal([...f.capture()].length, 0, 'an empty new cohort does not query or yield');
  assert.equal(f.events.length, 0);
  const controller = new AbortController();
  controller.abort();
  assert.throws(() => f.capture({ signal: controller.signal }), { name: 'AbortError' });
}

{
  const f = firstUseFixture();
  f.drain(f.prepare());
  const queries = f.events.filter(([kind]) => kind === 'query').length;
  const uniforms = f.events.filter(([kind]) => kind === 'uniform').length;
  const timing = {};
  f.drain(f.prepare({ timing }));
  assert.equal(f.events.filter(([kind]) => kind === 'query').length, queries,
    'exact successful reflection witnesses avoid repeated native readiness queries');
  assert.equal(f.events.filter(([kind]) => kind === 'uniform').length, uniforms);
  assert.equal(timing.uniformReused, 3);
  assert.equal(timing.uniformCount, 0, 'reuse is not a new reflection attempt');
  assert.equal(timing.uniformPending, 0);
  const linker = {};
  [...f.owner.linkerBreathingSlices(1, linker)];
  assert.equal(linker.uniformReused, 3);
  assert.equal(linker.queryCount, 1, 'unwitnessed retained Garage programs are still queried');
}

for (const boundary of ['epoch', 'info', 'context', 'loss', 'handle', 'wrapper']) {
  const f = firstUseFixture({ names: ['only'] });
  f.drain(f.prepare());
  if (boundary === 'epoch') f.owner.invalidate();
  if (boundary === 'info') f.renderer.info = { programs: [...f.renderer.info.programs] };
  if (boundary === 'context') {
    const replacement = { ...f.gl };
    f.renderer.getContext = () => replacement;
  }
  if (boundary === 'loss') {
    f.gl.lost = true;
    f.drain(f.prepare());
    f.gl.lost = false;
  }
  if (boundary === 'handle') f.programs[0].program = { name: 'replacement' };
  if (boundary === 'wrapper') {
    const replacement = { ...f.programs[0] };
    f.renderer.info.programs[1] = replacement;
    f.materialProperties.programs.set('only', replacement);
  }
  const timing = {};
  f.drain(f.prepare({ timing }));
  assert.equal(timing.queryCount, 1, `${boundary}: stale witnesses do not suppress native queries`);
  assert.equal(timing.uniformCount, 1);
  assert.equal(timing.uniformReused, 0);
}

{
  const f = firstUseFixture({ names: ['partial'] });
  let attempts = 0;
  f.programs[0].getAttributes = () => {
    attempts++;
    throw new Error('attribute reflection failed after uniform cache populated');
  };
  for (let run = 0; run < 2; run++) {
    const timing = {};
    f.drain(f.prepare({ timing }));
    assert.equal(timing.queryCount, 1, 'a cached getUniforms return cannot hide incomplete attributes');
    assert.equal(timing.uniformFailures, 1);
    assert.equal(timing.uniformPending, 1);
    assert.equal(timing.uniformReused, 0);
  }
  assert.equal(attempts, 2);
  f.programs[0].getAttributes = () => ({});
  f.drain(f.prepare());
  const timing = {};
  f.drain(f.prepare({ timing }));
  assert.equal(timing.uniformReused, 1, 'both tables must succeed before a durable witness exists');
}

for (const malformed of ['missing-attributes', 'undefined-uniforms', 'undefined-attributes']) {
  const f = firstUseFixture({ names: ['foreign'] });
  if (malformed === 'missing-attributes') delete f.programs[0].getAttributes;
  if (malformed === 'undefined-uniforms') f.programs[0].getUniforms = () => undefined;
  if (malformed === 'undefined-attributes') f.programs[0].getAttributes = () => undefined;
  f.drain(f.prepare());
  const timing = {};
  f.drain(f.prepare({ timing }));
  assert.equal(timing.queryCount, 1, `${malformed}: unsupported table results are never witnessed`);
  assert.equal(timing.uniformReused, 0);
}

{
  const f = firstUseFixture({ names: ['new'] });
  [...captureNewProgramUniformSteps(f.renderer, new Set([f.unrelated]))];
  const timing = {};
  f.drain(f.prepare({ timing }));
  assert.equal(timing.uniformReused, 1, 'wreck/scar scoped jobs share strict proof with the scene owner');
  assert.equal(timing.queryCount, undefined);
  f.owner.invalidate();
  const afterInvalidation = {};
  [...captureNewProgramUniformSteps(f.renderer, new Set([f.unrelated]), { timing: afterInvalidation })];
  assert.equal(afterInvalidation.queryCount, 1, 'owner invalidation also invalidates scoped-job proof');
}

{
  const f = firstUseFixture({ names: ['first', 'second'] });
  const steps = captureNewProgramUniformSteps(f.renderer, new Set([f.unrelated]));
  steps.next();
  f.owner.invalidate();
  assert.equal(steps.next().done, true, 'invalidation cannot let a suspended scoped job republish stale proof');
  assert.equal(f.events.filter(([kind]) => kind === 'uniform').length, 0);
}

for (const operation of ['uniform', 'attribute']) {
  const f = firstUseFixture({ names: ['only'] });
  const method = operation === 'uniform' ? 'getUniforms' : 'getAttributes';
  const original = f.programs[0][method];
  f.programs[0][method] = () => { f.owner.invalidate(); return {}; };
  f.drain(f.prepare());
  f.programs[0][method] = original;
  const timing = {};
  f.drain(f.prepare({ timing }));
  assert.equal(timing.queryCount, 1, `${operation}: native-call invalidation prevents publishing proof`);
}

{
  const f = firstUseFixture({ names: ['garage-forward'] });
  f.renderer.info.programs = [f.unrelated];
  f.state.compile = () => {
    if (!f.renderer.info.programs.includes(f.programs[0])) f.renderer.info.programs.push(f.programs[0]);
  };
  [...f.owner.initializeSteps()];
  const timing = {};
  f.drain(f.prepare({ timing }));
  assert.equal(timing.uniformReused, 1, 'successful Garage first-use can prove later selected-material reuse');
  assert.equal(timing.uniformCount, 0);
  assert.equal(timing.queryCount, undefined);
}

for (const boundary of ['epoch', 'context']) {
  const f = firstUseFixture({ names: ['first', 'second'] });
  f.renderer.info.programs = [f.unrelated];
  f.state.compile = () => f.renderer.info.programs.push(...f.programs);
  const steps = f.owner.initializeSteps();
  assert.equal(steps.next().done, false);
  if (boundary === 'epoch') f.owner.invalidate();
  else f.renderer.getContext = () => ({ ...f.gl });
  assert.equal(steps.next().done, true, `${boundary}: legacy initialization also owns its renderer lifetime`);
  assert.equal(f.events.filter(([kind]) => kind === 'uniform').length, 1);
}

for (const operation of ['getUniforms', 'getAttributes']) {
  const f = firstUseFixture({ names: ['aborted'] });
  const controller = new AbortController();
  const reason = new Error(`aborted during ${operation}`);
  const original = f.programs[0][operation];
  f.programs[0][operation] = () => { controller.abort(reason); return {}; };
  assert.throws(() => f.drain(f.prepare({ signal: controller.signal })), (error) => error === reason);
  f.programs[0][operation] = original;
  const timing = {};
  f.drain(f.prepare({ timing }));
  assert.equal(timing.queryCount, 1, `${operation}: aborted native work cannot publish a shared witness`);
  assert.equal(timing.uniformReused, 0);
}

{
  const f = firstUseFixture({ names: ['mutated'] });
  const original = f.programs[0].getUniforms;
  f.programs[0].getUniforms = () => { f.programs[0].program = { name: 'replacement' }; return {}; };
  f.programs[0].getAttributes = () => assert.fail('handle replacement must stop before attribute work');
  f.drain(f.prepare());
  f.programs[0].getUniforms = original;
  f.programs[0].getAttributes = () => ({});
  const timing = {};
  f.drain(f.prepare({ timing }));
  assert.equal(timing.queryCount, 1);
  assert.equal(timing.uniformReused, 0);
}

for (const initializeUniforms of [false, true]) {
  const f = firstUseFixture();
  const steps = f.prepare({ initializeUniforms });
  assert.equal(steps.next().done, false, 'submission completes before context replacement');
  const replacement = { ...f.gl };
  f.renderer.getContext = () => replacement;
  assert.equal(steps.next().done, true);
  assert.deepEqual(f.events, [], 'context identity changes prevent extension/query/reflection work');
}

{
  const f = firstUseFixture({ names: ['pending', 'live'] });
  f.renderer.info.programs = [...f.programs];
  f.state.query = (name) => name !== 'pending';
  const steps = f.owner.linkerBreathingSlices(2);
  assert.equal(steps.next().done, false);
  const replaced = f.programs[0].program;
  f.programs[0].program = { name: 'different-handle' };
  f.renderer.info.programs.reverse();
  assert.equal(steps.next().done, true);
  assert.deepEqual(f.events.filter(([kind]) => kind === 'query'), [['query', 'pending'], ['query', 'live']],
    'default linker freezes handles across compaction and never queries a replacement');
  assert.notEqual(f.programs[0].program, replaced);
}

{
  const f = firstUseFixture({ names: ['old'] });
  f.drain(f.prepare());
  const oldInfo = f.renderer.info;
  const suspended = f.prepare();
  suspended.next();
  f.renderer.info = { programs: [] };
  assert.equal(suspended.next().done, true);
  f.renderer.info = oldInfo;
  const timing = {};
  f.drain(f.prepare({ timing }));
  assert.equal(timing.queryCount, 1, 'observed lifetime invalidation cannot resurrect an old identity witness');
}

{
  const f = firstUseFixture({ extension: false, names: ['fallback'] });
  const first = {};
  f.drain(f.prepare({ timing: first }));
  assert.equal(first.queryCount, undefined, 'fallback metadata is not a KHR completion observation');
  const next = {};
  f.drain(f.prepare({ timing: next }));
  assert.equal(next.uniformReused, 1, 'both successfully initialized tables are reusable even without KHR');
  assert.equal(next.uniformCount, 0);
}

{
  const f = capturedNewFixture(2);
  for (const program of f.programs) program.getAttributes = () => { f.state.clock += 5; return {}; };
  const timing = {};
  assert.equal([...f.capture({ timing })].length, 3, 'attribute reflection time participates in the same work budget');
  assert.equal(timing.uniformMs, 10);
  assert.equal(timing.maxUniformMs, 5);
}

console.log('programWarm.selftest: target compile, forward owner, and uniform draining passed');
