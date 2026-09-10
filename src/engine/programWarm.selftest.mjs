import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  captureNewProgramUniformSteps,
  compileForRenderTarget,
  createForwardProgramWarmOwner,
  ProgramUniformPreparationError,
  snapshotRendererPrograms,
  warmNewRendererProgramUniforms,
} from './programWarm.ts';

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
  getUniforms() { initialized.push('uniforms'); return {}; },
  getAttributes() { return {}; },
};
const forwardGl = {
  pending: false,
  getExtension(name) {
    assert.equal(name, 'KHR_parallel_shader_compile');
    return { COMPLETION_STATUS_KHR: 0x91B1 };
  },
  getProgramParameter(program, token) {
    assert.equal(program, pendingProgram.program);
    assert.equal(token, 0x91B1);
    return !this.pending;
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
assert.equal([...forwardOwner.initializeSteps()].length, 2,
  'newly submitted programs yield before readiness and after budgeted reflection');
assert.deepEqual(initialized, ['uniforms']);
forwardOwner.invalidate(); // Remove the successful shared reflection witness for the pending-query test.
forwardGl.pending = true;
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
  return { owner, renderer, gl, scene, mesh, events, programs, unrelated, materialProperties, state, assertRestored,
    now: () => clockFrozen ? 0 : clock,
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
  assert.equal(f.events.filter(([kind]) => kind === 'uniform').length, 0,
    'the submission checkpoint precedes all native readiness/reflection work');
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

{
  const names = Array.from({ length: 158 }, (_, index) => `link-${index}`);
  const f = firstUseFixture({ names, clockFrozen: true });
  f.state.queryMs = f.state.uniformMs = 0;
  f.programs.forEach((program, id) => { program.id = id; });
  f.renderer.info.programs = [f.unrelated, ...f.programs.slice(0, 80)];
  f.state.compile = () => f.renderer.info.programs.push(...f.programs.slice(80));
  let recentReady = false;
  let blockedQueries = 0;
  f.state.query = (name) => {
    const id = Number(name.slice(5));
    // Chrome 151 retains only the newest 128 asynchronous completion queries.
    if (id < 30 && !recentReady) blockedQueries++;
    return id < 30 || recentReady;
  };
  const timing = {};
  const steps = f.prepare({ timing });
  assert.equal(steps.next().done, false);
  assert.equal(steps.next().done, false, 'newest pending link gives the browser a task opportunity');
  assert.equal(blockedQueries, 0, 'do not ask an evicted older query while a newer link is still pending');
  assert.deepEqual(f.events.filter(([kind]) => kind === 'query'), [['query', 'link-157']]);
  assert.equal(timing.uniformCount, 0);
  assert.equal(timing.uniformPending, 158, 'unvisited older programs remain honestly pending');
  recentReady = true;
  f.drain(steps);
  assert.equal(timing.uniformCount, 158);
  assert.equal(timing.uniformPending, 0);
  assert.equal(timing.existingQueryCount, 80, 'every older unwitnessed program is explicitly queried afterward');
  assert.equal(timing.newQueryCount, 79, 'the pending newest query is retried, not treated as older readiness proof');
  assert.equal(timing.uniformYields, 5, 'one pending wait plus four 32-visit checkpoints bounds the frozen-clock cohort');
  assert.deepEqual(f.events.filter(([kind]) => kind === 'uniform').map(([, name]) => name), names.toReversed());
}

for (const metadata of ['missing', 'duplicate', 'negative', 'fraction', 'infinite', 'nan', 'unsafe', 'throws']) {
  const f = firstUseFixture({ names: ['first', 'second', 'third'] });
  f.programs.forEach((program, id) => { program.id = id; });
  if (metadata === 'missing') delete f.programs[1].id;
  if (metadata === 'duplicate') f.programs[1].id = 0;
  if (metadata === 'negative') f.programs[1].id = -1;
  if (metadata === 'fraction') f.programs[1].id = 0.5;
  if (metadata === 'infinite') f.programs[1].id = Infinity;
  if (metadata === 'nan') f.programs[1].id = NaN;
  if (metadata === 'unsafe') f.programs[1].id = Number.MAX_SAFE_INTEGER + 1;
  if (metadata === 'throws') Object.defineProperty(f.programs[1], 'id', { get() { throw new Error('foreign ID'); } });
  f.drain(f.prepare());
  assert.deepEqual(f.events.filter(([kind]) => kind === 'query').map(([, name]) => name),
    ['first', 'second', 'third'], `${metadata}: unsupported ordering retains the original cohort order`);
}

{
  const f = firstUseFixture({ names: ['old', 'middle', 'newest'] });
  f.programs.forEach((program, id) => { program.id = id; });
  f.materialProperties.programs = new Map([
    ['middle', f.programs[1]], ['old', f.programs[0]], ['newest', f.programs[2]],
  ]);
  const steps = f.prepare();
  steps.next();
  f.programs[0].id = 100;
  f.renderer.info.programs = [f.programs[2], f.programs[0], f.programs[1]];
  f.drain(steps);
  assert.deepEqual(f.events.filter(([kind]) => kind === 'query').map(([, name]) => name),
    ['newest', 'middle', 'old'], 'creation IDs are frozen with program identities, not read after yields');
}

for (const terminal of ['abort', 'epoch', 'handle', 'round-limit', 'deadline']) {
  const f = firstUseFixture({ names: ['old', 'newest'] });
  f.programs.forEach((program, id) => { program.id = id; });
  f.state.queryMs = f.state.uniformMs = 0;
  f.state.query = (name) => name === 'old';
  const controller = new AbortController();
  const timing = {};
  const steps = f.prepare({ timing, signal: controller.signal });
  steps.next();
  steps.next();
  if (terminal === 'abort') controller.abort('left during newest link');
  if (terminal === 'epoch') f.owner.invalidate();
  if (terminal === 'handle') f.programs[1].program = { name: 'replacement' };
  if (terminal === 'deadline') f.advance(5001);
  if (terminal === 'abort') assert.throws(() => steps.next(), (error) => error === controller.signal.reason);
  else f.drain(steps);
  const queries = f.events.filter(([kind]) => kind === 'query');
  if (terminal === 'handle') {
    assert.deepEqual(queries, [['query', 'newest'], ['query', 'old']], 'a replaced pending handle no longer gates live work');
    assert.equal(timing.uniformPending, 0);
  } else {
    assert.equal(queries.filter(([, name]) => name === 'old').length, 0);
    assert.equal(timing.uniformCount, 0);
    assert.equal(timing.uniformPending, 2);
    assert.equal(queries.length, terminal === 'round-limit' ? 120 : 1);
  }
}

{
  const f = firstUseFixture({ names: ['old', 'newest'] });
  f.programs.forEach((program, id) => { program.id = id; });
  f.state.query = (name) => { if (name === 'newest') throw new Error('query failure'); return true; };
  const timing = {};
  f.drain(f.prepare({ timing }));
  assert.deepEqual(f.events.filter(([kind]) => kind === 'uniform'), [['uniform', 'old']],
    'a failed query cannot prove readiness but does not strand independently preparable older work');
  assert.equal(timing.uniformPending, 1);
}

{
  const f = firstUseFixture({ extension: false, names: ['old', 'newest'] });
  f.programs.forEach((program, id) => { program.id = id; });
  const timing = {};
  f.drain(f.prepare({ timing }));
  assert.deepEqual(f.events.filter(([kind]) => kind === 'uniform').map(([, name]) => name), ['old', 'newest']);
  assert.equal(timing.queryCount, undefined, 'without KHR, keep the original guarded reflection fallback');
}

{
  const f = capturedNewFixture(3);
  f.programs.forEach((program, id) => { program.id = id; });
  f.renderer.info.programs = [f.old, f.programs[1], f.programs[0], f.programs[2]];
  const steps = f.capture();
  f.programs[0].id = 100;
  let ready = false;
  f.state.query = (handle) => handle.index !== 2 || ready;
  steps.next();
  steps.next();
  assert.deepEqual(f.events.filter(([kind]) => kind === 'query').map(([, handle]) => handle.index), [2]);
  ready = true;
  [...steps];
  assert.deepEqual(f.events.filter(([kind]) => kind === 'uniform').map(([, index]) => index), [2, 1, 0],
    'scoped new-program jobs freeze creation order before their first restoration checkpoint');
}

{
  const f = firstUseFixture({ names: ['old', 'newest'] });
  f.programs.forEach((program, id) => { program.id = id; });
  [...f.owner.linkerBreathingSlices(1)];
  assert.deepEqual(f.events.filter(([kind]) => kind === 'query').map(([, name]) => name), ['garage', 'old', 'newest'],
    'the linker-only path does not participate in this first-use scheduling experiment');
}

{
  const f = firstUseFixture({ names: ['oldest', 'middle', 'newest'] });
  f.programs.forEach((program, id) => { program.id = id; });
  f.state.queryMs = f.state.uniformMs = 0;
  const ready = new Set(['newest']);
  f.state.query = (name) => ready.has(name);
  const timing = {};
  const steps = f.prepare({ timing });
  steps.next();
  steps.next();
  assert.deepEqual(f.events.filter(([kind]) => kind === 'query'), [['query', 'newest'], ['query', 'middle']]);
  assert.equal(timing.uniformCount, 1, 'newest completion proves nothing about the next older link');
  ready.add('middle');
  steps.next();
  assert.equal(timing.uniformCount, 2);
  assert.equal(timing.uniformPending, 1);
  ready.add('oldest');
  f.drain(steps);
  assert.equal(timing.uniformCount, 3);
  assert.equal(timing.uniformPending, 0);
  assert.deepEqual(f.events.filter(([kind]) => kind === 'query').map(([, name]) => name),
    ['newest', 'middle', 'middle', 'oldest', 'oldest']);
}

for (const terminal of ['return', 'throw', 'info', 'context', 'loss']) {
  const f = firstUseFixture({ names: ['old', 'newest'] });
  f.programs.forEach((program, id) => { program.id = id; });
  f.state.query = () => false;
  const steps = f.prepare();
  steps.next();
  steps.next();
  const events = f.events.length;
  if (terminal === 'return') steps.return();
  else if (terminal === 'throw') {
    const reason = new Error('abandoned newest pending checkpoint');
    assert.throws(() => steps.throw(reason), (error) => error === reason);
  } else {
    if (terminal === 'info') f.renderer.info = { programs: [...f.renderer.info.programs] };
    if (terminal === 'context') f.renderer.getContext = () => ({ ...f.gl });
    if (terminal === 'loss') f.gl.lost = true;
    assert.equal(steps.next().done, true);
  }
  assert.equal(f.events.length, events, `${terminal}: the new pending checkpoint cannot resume stale native work`);
  f.assertRestored();
}

{
  const f = firstUseFixture({ names: ['old', 'newest'], clockFrozen: true });
  f.programs.forEach((program, id) => { program.id = id; });
  f.state.query = () => false;
  const controller = new AbortController();
  const steps = f.prepare({ signal: controller.signal });
  steps.next();
  for (let round = 0; round < 120; round++) assert.equal(steps.next().done, false);
  controller.abort('aborted at the final pending wait');
  assert.throws(() => steps.next(), (error) => error === controller.signal.reason);
  assert.equal(f.events.filter(([kind]) => kind === 'query').length, 120);
}

function preparationResult(steps, onYield = () => {}) {
  for (let index = 0; index < 10000; index++) {
    const step = steps.next();
    if (step.done) return step.value;
    onYield(index);
  }
  assert.fail('strict preparation must remain finite with a frozen clock');
}

for (const extension of [true, false]) {
  for (const timing of [undefined, Object.freeze({ uniformPending: 999, uniformFailures: 999 })]) {
    const f = firstUseFixture({ extension });
    assert.deepEqual(preparationResult(f.prepare({ strict: true, timing })), { status: 'complete', pending: 0 },
      'strict success comes from actual tables, never mutable or absent diagnostics');
    assert.equal(f.events.filter(([kind]) => kind === 'uniform').length, 3);
    assert.equal(f.events.some(([kind]) => kind === 'query'), extension,
      'unsupported KHR retains deliberate actual-reflection fallback, not invented KHR evidence');
    f.assertRestored();
  }
}

for (const failure of ['query', 'uniform', 'attributes', 'missing-attributes', 'malformed-uniforms']) {
  const f = firstUseFixture({ names: ['one'] });
  if (failure === 'query') f.state.query = () => { throw new Error('query rejected'); };
  if (failure === 'uniform') f.state.reflect = () => { throw new Error('reflection rejected'); };
  if (failure === 'attributes') f.programs[0].getAttributes = () => { throw new Error('partial reflection'); };
  if (failure === 'missing-attributes') delete f.programs[0].getAttributes;
  if (failure === 'malformed-uniforms') f.programs[0].getUniforms = () => undefined;
  assert.deepEqual(preparationResult(f.prepare({ strict: true })), {
    status: 'incomplete', pending: 1, reason: failure === 'query' ? 'query' : 'reflection',
  }, `${failure}: strict first use must not bless a failed or partial reflection`);
  f.assertRestored();
}

for (const missing of ['empty-cache', 'null-handle', 'undefined-handle']) {
  for (const strict of [false, true]) {
    const f = firstUseFixture({ names: ['one'] });
    if (missing === 'empty-cache') f.materialProperties.programs.clear();
    else f.programs[0].program = missing === 'null-handle' ? null : undefined;
    const steps = f.prepare({ strict });
    if (strict) assert.throws(() => preparationResult(steps),
      /Compiled material (program cache empty|native program unavailable)/,
      `${missing}: selected material evidence cannot silently become a complete empty cohort`);
    else assert.deepEqual(preparationResult(steps), { status: 'complete', pending: 0 },
      `${missing}: legacy optional preparation retains its skip policy`);
    assert.equal(f.events.some(([kind]) => kind === 'uniform' || kind === 'query'), false);
    assert.equal(steps.next().done, true, 'failed capture closes the owned generator');
    f.assertRestored();
  }
}

{
  const f = firstUseFixture();
  f.scene.clear();
  assert.deepEqual(preparationResult(f.prepare({ strict: true })), { status: 'complete', pending: 0 },
    'a truly empty selected scene needs no material evidence');
  assert.deepEqual(f.events, []);
}

for (const count of [1, 31, 32, 64]) {
  const names = Array.from({ length: count }, (_, index) => `deadline-${index}`);
  const f = firstUseFixture({ names });
  f.state.queryMs = f.state.uniformMs = 0;
  f.state.reflect = (name) => { if (name === names.at(-1)) f.advance(8); };
  let crossed = false;
  const result = preparationResult(f.prepare({ strict: true }), () => {
    if (f.events.filter(([kind]) => kind === 'uniform').length === count) {
      crossed = true;
      f.advance(5001);
    }
  });
  assert.equal(crossed, true, 'the final successful reflection really yields across the deadline');
  assert.deepEqual(result, { status: 'complete', pending: 0 },
    `${count}: fully submitted/reflected final work remains complete on either side of the admission watermark`);
  f.assertRestored();
}

for (const remaining of ['batch', 'pass', 'empty-pass']) {
  const names = Array.from({ length: 32 }, (_, index) => `admission-${index}`);
  const f = firstUseFixture({ names });
  f.state.queryMs = f.state.uniformMs = 0;
  let submissions = 0;
  f.state.compile = () => { submissions++; };
  if (remaining === 'batch') {
    for (let index = 0; index < 16; index++) f.scene.add(new THREE.Mesh(f.mesh.geometry, f.mesh.material));
  }
  const passes = remaining === 'batch' ? undefined : [
    { layerMask: 1, target: 'hdr' }, { layerMask: remaining === 'pass' ? 1 : 2, target: 'hdr' },
  ];
  let crossed = false;
  const result = preparationResult(f.prepare({ strict: true, passes }), () => {
    if (!crossed && f.events.filter(([kind]) => kind === 'uniform').length === names.length) {
      crossed = true;
      f.advance(5001);
    }
  });
  assert.equal(crossed, true);
  assert.equal(submissions, 1, `${remaining}: an expired deadline never admits another native batch`);
  assert.deepEqual(result, remaining === 'empty-pass' ? { status: 'complete', pending: 0 }
    : { status: 'incomplete', pending: null, reason: 'budget' },
  `${remaining}: completion requires every selected pass, not merely the last captured cohort`);
  f.assertRestored();
}

{
  const f = firstUseFixture({ names: ['extension-error'] });
  f.gl.getExtension = () => { throw new Error('extension lookup rejected'); };
  assert.deepEqual(preparationResult(f.prepare({ strict: true })),
    { status: 'incomplete', pending: 1, reason: 'query' });
  assert.equal(f.events.some(([kind]) => kind === 'uniform'), false);
}

{
  const f = firstUseFixture({ names: ['old', 'newest'], clockFrozen: true });
  f.programs.forEach((program, id) => { program.id = id; });
  f.state.queryMs = f.state.uniformMs = 0;
  f.state.query = () => false;
  const result = preparationResult(f.prepare({ strict: true }));
  assert.deepEqual(result, { status: 'incomplete', pending: 2, reason: 'budget' });
  assert.equal(f.events.filter(([kind]) => kind === 'query').length, 1024,
    'one finite strict guard permits the real five-second deadline at high refresh rates');
  assert.equal(f.events.some(([kind]) => kind === 'uniform'), false,
    'negative control: generator exhaustion cannot mean the pending programs were reflected');
}

{
  const f = firstUseFixture({ names: ['pending'] });
  f.state.queryMs = 0;
  f.state.query = () => false;
  const result = preparationResult(f.prepare({ strict: true }), () => f.advance(9));
  assert.equal(result.status, 'incomplete');
  assert.equal(result.reason, 'budget');
  const queries = f.events.filter(([kind]) => kind === 'query').length;
  assert.ok(queries > 120 && queries < 1024, 'the elapsed deadline, not a one-second round cap, governs normal cadence');
}

{
  const f = firstUseFixture({ names: Array.from({ length: 158 }, (_, index) => `retained-${index}`),
    clockFrozen: true });
  f.state.queryMs = f.state.uniformMs = 0;
  f.programs.forEach((program, id) => { program.id = id; });
  const timing = {};
  assert.deepEqual(preparationResult(f.prepare({ strict: true, timing })), { status: 'complete', pending: 0 });
  assert.equal(timing.uniformCount, 158,
    'one material can exceed the soft admission watermark; retain every historical variant');
  assert.equal(timing.uniformPending, 0);
}

for (const change of ['epoch', 'info', 'context', 'loss', 'handle', 'disposed', 'removed']) {
  const f = firstUseFixture({ names: ['one'] });
  const steps = f.prepare({ strict: true });
  assert.equal(steps.next().done, false);
  if (change === 'epoch') f.owner.invalidate();
  if (change === 'info') f.renderer.info = { programs: [...f.renderer.info.programs] };
  if (change === 'context') f.renderer.getContext = () => ({ ...f.gl });
  if (change === 'loss') f.gl.lost = true;
  if (change === 'handle') f.programs[0].program = { name: 'replacement' };
  if (change === 'disposed') f.programs[0].program = undefined;
  if (change === 'removed') f.renderer.info.programs = [f.unrelated];
  assert.deepEqual(preparationResult(steps), { status: 'incomplete', pending: null, reason: 'invalidated' },
    `${change}: stale work never returns strict success`);
  assert.equal(f.events.some(([kind]) => kind === 'uniform'), false);
  f.assertRestored();
}

function asyncUniformFixture(options = {}) {
  const f = firstUseFixture(options);
  const saved = f.renderer.info.programs;
  f.renderer.info.programs = [f.unrelated];
  const baseline = snapshotRendererPrograms(f.renderer);
  f.renderer.info.programs = saved;
  return { ...f, baseline,
    warm: (yieldWork, options) => warmNewRendererProgramUniforms(f.renderer, baseline, yieldWork, f.now, options) };
}

{
  const f = asyncUniformFixture({ names: ['first', 'second'] });
  let yields = 0;
  f.state.query = () => yields >= 3;
  const receipt = await f.warm(async (force) => {
    assert.equal(force, true, 'pending shaders cannot spin through budget-only no-op promises');
    yields += 1;
    if (yields <= 3) assert.equal(f.events.some(([kind]) => kind === 'uniform'), false);
    f.advance(100);
    if (yields === 1) f.renderer.info.programs.push({ program: {},
      getUniforms() { assert.fail('later unrelated submissions are outside the captured cohort'); } });
  });
  assert.deepEqual(f.events.filter(([kind]) => kind === 'uniform'), [['uniform', 'first'], ['uniform', 'second']]);
  assert.equal(receipt.programs, 2);
  assert.equal(receipt.failures, 0);
  assert.equal(receipt.maxMs, 7, 'scheduler wait time is not attributed as native reflection cost');
  assert.ok(receipt.totalMs >= 300);
  f.renderer.info.programs.pop();
  f.events.length = 0;
  const reused = await f.warm(async () => {});
  assert.equal(reused.programs, 0, 'successful exact wrapper/handle proofs are shared with later warm owners');
  assert.deepEqual(f.events, [], 'reused native reflection witnesses need no new query or reflection');
}

for (const boundary of ['current', 'epoch', 'info', 'context', 'loss', 'handle', 'removed']) {
  const f = asyncUniformFixture({ names: ['stale'] });
  let current = true;
  await assert.rejects(f.warm(async () => {
    if (boundary === 'current') current = false;
    if (boundary === 'epoch') f.owner.invalidate();
    if (boundary === 'info') f.renderer.info = { programs: [...f.renderer.info.programs] };
    if (boundary === 'context') f.renderer.getContext = () => ({ ...f.gl });
    if (boundary === 'loss') f.gl.lost = true;
    if (boundary === 'handle') f.programs[0].program = {};
    if (boundary === 'removed') f.renderer.info.programs = [f.unrelated];
  }, { isCurrent: () => current }), (error) => error instanceof ProgramUniformPreparationError
    && error.preparation.reason === 'invalidated', boundary);
  assert.equal(f.events.some(([kind]) => kind === 'uniform'), false, `${boundary}: never reflect a stale native handle`);
}

for (const boundary of ['before', 'pending', 'after-first']) {
  const f = asyncUniformFixture({ names: ['first', 'second'] });
  const controller = new AbortController();
  const reason = new Error(`uniform cancellation ${boundary}`);
  if (boundary === 'before') controller.abort(reason);
  let yields = 0;
  await assert.rejects(f.warm(async () => {
    yields += 1;
    if (boundary === 'pending' || yields === 2) controller.abort(reason);
  }, { signal: controller.signal }), (error) => error === reason);
  assert.equal(f.events.filter(([kind]) => kind === 'uniform').length, boundary === 'after-first' ? 1 : 0);
}

for (const failure of ['extension', 'query', 'uniform', 'attributes']) {
  const f = asyncUniformFixture({ names: ['failed'] });
  const fail = () => { throw new Error(failure); };
  if (failure === 'extension') f.gl.getExtension = fail;
  if (failure === 'query') f.state.query = fail;
  if (failure === 'uniform') f.state.reflect = fail;
  if (failure === 'attributes') f.programs[0].getAttributes = fail;
  await assert.rejects(f.warm(async () => {}), (error) => error instanceof ProgramUniformPreparationError
    && error.preparation.reason === (['extension', 'query'].includes(failure) ? 'query' : 'reflection'));
  if (failure === 'extension' || failure === 'query') {
    assert.equal(f.events.some(([kind]) => kind === 'uniform'), false, 'failed readiness is not unsupported KHR');
  }
}

{
  const f = asyncUniformFixture({ names: ['fallback'], extension: false });
  f.state.uniformMs = 306;
  const receipt = await f.warm(async () => {});
  assert.equal(receipt.programs, 1, 'unsupported KHR still performs actual first-use initialization');
  assert.equal(receipt.maxMs, 306, 'indivisible compatibility-fallback stalls remain honestly measured');
  assert.equal(f.events.some(([kind]) => kind === 'query'), false);
}

for (const frozen of [false, true]) {
  const f = asyncUniformFixture({ names: ['pending'], clockFrozen: frozen });
  f.state.query = () => false;
  let yields = 0;
  await assert.rejects(f.warm(async () => { yields += 1; f.advance(1000); }),
    (error) => error instanceof ProgramUniformPreparationError && error.preparation.reason === 'budget');
  assert.ok(yields <= 1025, 'a broken clock cannot spin an unbounded preparation job');
  assert.equal(f.events.some(([kind]) => kind === 'uniform'), false, 'deadline is never permission for cold reflection');
}

{
  const f = asyncUniformFixture({ names: ['unstarted'] });
  const error = new Error('scheduler failure');
  await assert.rejects(f.warm(async () => { throw error; }), (caught) => caught === error);
  assert.deepEqual(f.events, [], 'a failed initial checkpoint performs no native work');
}

{
  const f = firstUseFixture({ names: ['garage-pending'] });
  f.renderer.info.programs = [f.unrelated];
  f.state.compile = () => f.renderer.info.programs.push(...f.programs);
  let ready = false;
  f.state.query = () => ready;
  const steps = f.owner.initializeSteps();
  assert.equal(steps.next().done, false, 'Garage submission releases before the first readiness check');
  assert.equal(steps.next().done, false, 'pending Garage program releases without reflection');
  assert.equal(f.events.some(([kind]) => kind === 'uniform'), false);
  ready = true;
  f.drain(steps);
  assert.deepEqual(f.events.filter(([kind]) => kind === 'uniform'), [['uniform', 'garage-pending']]);
}

function garageCohortFixture({ count = 65, compileMs = 0, shared = false } = {}) {
  const scene = new THREE.Scene();
  const material = new THREE.MeshStandardMaterial();
  const geometry = new THREE.BoxGeometry();
  const camera = new THREE.PerspectiveCamera();
  for (let i = 0; i < count; i += 1) {
    const object = new THREE.Mesh(geometry, material);
    object.name = `object-${i}`;
    object.userData.variant = shared ? 0 : i;
    scene.add(object);
  }
  const programs = new Map();
  const events = [];
  const state = { clock: 0, ready: true, lost: false, query: null, reflect: null, compileFailure: false };
  const gl = {
    isContextLost: () => state.lost,
    getExtension: () => ({ COMPLETION_STATUS_KHR: 0x91b1 }),
    getProgramParameter(handle) {
      events.push(['query', handle.variant]);
      return state.query ? state.query(handle) : state.ready;
    },
  };
  const renderer = {
    info: { programs: [] }, getContext: () => gl,
    getRenderTarget: () => null, setRenderTarget() {},
    compile(root, activeCamera, activeScene) {
      assert.equal(activeScene, scene);
      assert.equal(activeCamera, camera);
      events.push(['compile', root.name]);
      state.clock += compileMs;
      const materials = new Set();
      // Pinned Three's per-object compile still traverses that object's entire
      // subtree, including hidden nested variants. This contract is unchanged.
      root.traverse((object) => {
        if (!object.isMesh) return;
        materials.add(object.material);
        const variant = object.userData.variant;
        if (programs.has(variant)) return;
        const wrapper = { id: variant, program: { variant },
          getUniforms() {
            events.push(['uniform', variant]);
            state.reflect?.(variant);
            return {};
          },
          getAttributes() { events.push(['attribute', variant]); return {}; },
        };
        programs.set(variant, wrapper);
        renderer.info.programs.push(wrapper);
      });
      if (state.compileFailure) throw new Error('legacy compile failure after partial submission');
      return materials;
    },
  };
  const owner = createForwardProgramWarmOwner({ renderer, scene, camera, getTarget: () => null, now: () => state.clock });
  const stats = {};
  return { owner, scene, renderer, programs, events, state, gl, stats,
    steps: () => owner.initializeSteps(scene, stats, { requireCompletion: true }),
    dispose() { geometry.dispose(); material.dispose(); } };
}

{
  const f = garageCohortFixture();
  try {
    const steps = f.steps();
    let yields = 0;
    for (let step = steps.next(); !step.done; step = steps.next()) {
      yields += 1;
      const reflected = f.events.filter(([kind]) => kind === 'attribute').length;
      assert.ok(f.programs.size - reflected <= 32, 'no further native submissions beyond the32-program admission watermark');
      if (yields === 1) {
        assert.equal(f.events.filter(([kind]) => kind === 'compile').length, 32);
        assert.equal(f.events.some(([kind]) => kind === 'query' || kind === 'uniform'), false,
          'batched submission must still release a real checkpoint before any cold query');
      }
    }
    assert.equal(yields, 5, '65 one-program objects need three cohort waits plus two32-entry reflection budget waits, not65 serial frames');
    assert.equal(f.events.filter(([kind]) => kind === 'compile').length, 65, 'every original object is submitted');
    assert.equal(f.events.filter(([kind]) => kind === 'uniform').length, 65);
    assert.equal(f.events.filter(([kind]) => kind === 'attribute').length, 65);
    assert.deepEqual({ cohorts: f.stats.programCohorts, prepared: f.stats.programsPrepared, max: f.stats.programCohortMax },
      { cohorts: 3, prepared: 65, max: 32 }, 'the final one-program cohort is included in the completion receipt');
  } finally { f.dispose(); }
}

{
  const f = garageCohortFixture({ count: 5 });
  const hidden = new THREE.Mesh(f.scene.children[0].geometry, f.scene.children[0].material);
  hidden.userData.variant = 100;
  hidden.visible = false;
  f.scene.children[0].add(hidden);
  try {
    [...f.steps()];
    assert.equal(f.events.filter(([kind]) => kind === 'compile').length, 5);
    assert.ok(f.events.some(([kind, variant]) => kind === 'attribute' && variant === 100),
      'batching does not replace native traversal or omit nested hidden variants');
    assert.equal(f.stats.programsPrepared, 6,
      'shared material identity cannot erase distinct object/native shader variants');
  } finally { f.dispose(); }
}

{
  const f = garageCohortFixture({ count: 10, compileMs: 5, shared: true });
  try {
    let compiled = 0;
    for (const _ of f.steps()) {
      const current = f.events.filter(([kind]) => kind === 'compile').length;
      assert.ok(current - compiled <= 2, '8ms admission boundary remains even with no new shader variants');
      compiled = current;
    }
    assert.equal(compiled, 10);
    assert.equal(f.stats.programsPrepared, 1, 'the exact shared wrapper is reflected once');
    assert.equal(f.stats.programBudgetSlices, 4, 'CPU-only checkpoints remain distinguishable from the one cohort wait');
  } finally { f.dispose(); }
}

{
  const f = garageCohortFixture();
  f.state.ready = false;
  try {
    const steps = f.steps();
    steps.next(); steps.next(); steps.next();
    assert.equal(f.programs.size, 32, 'pending first cohort prevents admitting more cold programs');
    assert.equal(f.events.some(([kind]) => kind === 'uniform'), false, 'pending is never treated as ready');
    f.state.ready = true;
    [...steps];
    assert.equal(f.stats.programsPrepared, 65);
  } finally { f.dispose(); }
}

{
  const f = garageCohortFixture();
  f.state.query = (handle) => handle.variant !== 64;
  try {
    assert.throws(() => [...f.steps()], (error) => error instanceof ProgramUniformPreparationError
      && error.preparation.reason === 'budget');
    assert.equal(f.events.filter(([kind]) => kind === 'attribute').length, 64,
      'a pending final partial cohort cannot be silently omitted from success');
    assert.equal(f.stats.programsPrepared, 64);
  } finally { f.dispose(); }
}

for (const boundary of ['epoch', 'info', 'context', 'loss', 'handle', 'dispose', 'return']) {
  const f = garageCohortFixture();
  try {
    const steps = f.steps();
    steps.next();
    if (boundary === 'epoch') f.owner.invalidate();
    if (boundary === 'info') f.renderer.info = { programs: [...f.renderer.info.programs] };
    if (boundary === 'context') f.renderer.getContext = () => ({ ...f.gl });
    if (boundary === 'loss') f.state.lost = true;
    if (boundary === 'handle') f.programs.get(31).program = { variant: 'replacement' };
    if (boundary === 'dispose') f.renderer.info.programs.pop();
    if (boundary === 'return') {
      steps.return();
      assert.equal(steps.next().done, true);
      assert.equal(f.events.some(([kind]) => kind === 'uniform'), false);
    } else {
      assert.throws(() => [...steps], (error) => error instanceof ProgramUniformPreparationError
        && error.preparation.reason === 'invalidated', boundary);
      assert.equal(f.events.some(([kind, variant]) => kind === 'uniform' && variant === 31), false,
        `${boundary}: stale wrapper/native generation is not reflected`);
    }
    assert.equal(f.events.filter(([kind]) => kind === 'compile').length, 32,
      `${boundary}: aborted first cohort admits no later object`);
  } finally { f.dispose(); }
}

for (const failure of ['query', 'attribute']) {
  const f = garageCohortFixture({ count: 3 });
  try {
    const steps = f.steps();
    steps.next();
    if (failure === 'query') f.state.query = () => { throw new Error('native query failed'); };
    else f.programs.get(2).getAttributes = () => { throw new Error('attribute table unavailable'); };
    assert.throws(() => [...steps], (error) => error instanceof ProgramUniformPreparationError
      && error.preparation.reason === (failure === 'query' ? 'query' : 'reflection'));
    assert.equal(f.stats.programsPrepared, undefined, 'failed batch cannot contribute a complete-cohort receipt');
  } finally { f.dispose(); }
}

{
  const f = garageCohortFixture({ count: 3 });
  f.state.compileFailure = true;
  try {
    [...f.steps()];
    assert.equal(f.events.filter(([kind]) => kind === 'compile').length, 3,
      'batching retains the existing per-object compile-error compatibility policy');
    assert.equal(f.stats.programsPrepared, 3,
      'partially submitted variants still require complete readiness/reflection before the legacy real-render fallback');
  } finally { f.dispose(); }
}

{
  const f = garageCohortFixture({ count: 2 });
  for (let i = 0; i < 35; i += 1) {
    const child = new THREE.Mesh(f.scene.children[0].geometry, f.scene.children[0].material);
    child.userData.variant = 100 + i;
    child.visible = false;
    f.scene.children[0].add(child);
  }
  try {
    const steps = f.steps();
    steps.next();
    assert.equal(f.events.filter(([kind]) => kind === 'compile').length, 1,
      'one indivisible native compile may cross32, but no subsequent object is admitted before its drain');
    assert.equal(f.programs.size, 36);
    [...steps];
    assert.equal(f.stats.programCohortMax, 36, '32 is an admission watermark, not a lossy capture cap');
    assert.equal(f.stats.programsPrepared, 37);
  } finally { f.dispose(); }
}

{
  const f = garageCohortFixture({ count: 3 });
  f.state.reflect = () => { f.state.clock += 6; };
  try {
    let reflected = 0;
    for (const _ of f.steps()) {
      const current = f.events.filter(([kind]) => kind === 'attribute').length;
      assert.ok(current - reflected <= 1, 'native reflection cost retains its own4ms cooperative work budget');
      reflected = current;
    }
    assert.equal(reflected, 3);
  } finally { f.dispose(); }
}

console.log('programWarm.selftest: target compile, bounded cohort readiness, cancellation and complete uniform/attribute drains passed');
