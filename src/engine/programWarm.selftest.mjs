import assert from 'node:assert/strict';
import {
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
const forwardRenderer = {
  ...targetRenderer,
  info: { programs: warmPrograms },
  getContext() {
    return {
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
  },
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
      clock += 2;
      return {
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
    pollMs: 16, maxPollMs: 16, pollCount: 1 }, 'cached extension lookup adds no native call or timing');
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

console.log('programWarm.selftest: target compile, forward owner, and uniform draining passed');
