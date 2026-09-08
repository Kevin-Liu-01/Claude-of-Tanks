import assert from 'node:assert/strict';
import { waitForTopMaskPrograms } from './topMaskProgramWarm.ts';

function fixture() {
  let clock = 0;
  const waits = [];
  const context = { lost: false, current: true, isContextLost() { return this.lost; },
    isCurrent() { return this.current; }, hasProgram: () => true };
  return {
    context, waits,
    options: {
      timeoutMs: 12,
      now: () => clock,
      delay(ms) {
        let resolve;
        let reject;
        const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
        waits.push({ ms, resolve, reject });
        return promise;
      },
    },
    advance(ms) { clock += ms; },
    async resume(ms = 4) {
      const wait = waits.shift();
      assert(wait, 'exactly one owned poll delay is available');
      clock += ms;
      wait.resolve();
      await Promise.resolve();
    },
  };
}

function program(ready = false) {
  return { program: {}, ready, probes: 0, uniforms: 0, attributes: 0,
    isReady() { this.probes++; return this.ready; },
    getUniforms() { assert.equal(this.ready, true); this.uniforms++; return {}; },
    getAttributes() { assert.equal(this.ready, true); this.attributes++; return {}; },
    destroy() { assert.fail('polling must never destroy borrowed renderer programs'); },
  };
}

{
  const f = fixture();
  const original = program();
  const replacement = program(true);
  const supplied = [original, original];
  let done = false;
  const pending = waitForTopMaskPrograms(supplied, f.context, f.options).then(() => { done = true; });
  supplied.splice(0, supplied.length, replacement);
  assert.deepEqual(f.waits.map(({ ms }) => ms), [4], 'readiness waits for a task, never a busy loop');
  assert.equal(original.probes, 0);
  await f.resume();
  assert.equal(done, false, 'a later ready currentProgram cannot replace the pinned pending program');
  assert.equal(original.probes, 1, 'duplicate program references are polled once per checkpoint');
  assert.equal(original.uniforms, 0, 'readiness must precede reflection');
  assert.equal(replacement.probes, 0);
  original.ready = true;
  await f.resume();
  await pending;
  assert.equal(done, true);
  assert.equal(original.probes, 2);
  assert.deepEqual([original.uniforms, original.attributes], [1, 1], 'both tables are initialized exactly once');
  assert.equal(f.waits.length, 0);
  assert(original.program, 'successful warm does not release the renderer-owned program');
}

{
  const f = fixture();
  await waitForTopMaskPrograms([], f.context, f.options);
  assert.equal(f.waits.length, 0, 'empty scenes need no poll timer');
}

for (const destroyedBeforePoll of [true, false]) {
  const f = fixture();
  const a = program(true);
  const b = program();
  const pending = waitForTopMaskPrograms([a, b], f.context, f.options);
  const rejected = assert.rejects(pending, /program_unavailable/);
  if (!destroyedBeforePoll) {
    await f.resume();
    assert.equal(a.probes, 1, 'the first program has already reported readiness');
  }
  a.program = undefined;
  b.ready = true;
  await f.resume();
  await rejected;
  assert.equal(f.waits.length, 0, 'destroyed programs terminate the owned poll');
}

for (const failure of ['context', 'probe', 'delay-reject', 'delay-throw', 'clock']) {
  const f = fixture();
  const p = program();
  const injected = new Error(`injected ${failure}`);
  const now = f.options.now;
  let failClock = false;
  f.options.now = () => { if (failClock) throw injected; return now(); };
  if (failure === 'delay-throw') f.options.delay = () => { throw injected; };
  const pending = waitForTopMaskPrograms([p], f.context, f.options);
  const rejected = assert.rejects(pending, (error) => failure === 'context'
    ? /context_lost/.test(error.message) : error === injected);
  if (failure === 'context') f.context.lost = true;
  if (failure === 'probe') p.isReady = () => { throw injected; };
  if (failure === 'clock') failClock = true;
  if (failure === 'delay-reject') f.waits.shift().reject(injected);
  else if (failure !== 'delay-throw') await f.resume();
  await rejected;
  assert.equal(f.waits.length, 0, `${failure}: no detached poll survives failure`);
  assert(p.program, `${failure}: renderer program lifetime is not owned by the poll`);
}

for (const delayedSuccess of [false, true]) {
  const f = fixture();
  const p = program(delayedSuccess);
  const pending = waitForTopMaskPrograms([p], f.context, f.options);
  const rejected = assert.rejects(pending, /timeout/);
  if (!delayedSuccess) { await f.resume(); await f.resume(); }
  const last = f.waits[0];
  await f.resume(delayedSuccess ? 100 : 4);
  await rejected;
  const probes = p.probes;
  last.resolve();
  await Promise.resolve();
  assert.equal(p.probes, probes, 'late timer resolutions cannot probe released ownership');
  assert.equal(f.waits.length, 0);
  assert(p.program);
}

{
  const f = fixture();
  const pending = waitForTopMaskPrograms([program()], f.context, { ...f.options, timeoutMs: 6 });
  const rejected = assert.rejects(pending, /timeout/);
  await f.resume();
  assert.deepEqual(f.waits.map(({ ms }) => ms), [2], 'poll delay is capped by remaining time');
  await f.resume(2);
  await rejected;
}

{
  const f = fixture();
  const pending = waitForTopMaskPrograms([program(true)], f.context, { ...f.options, timeoutMs: 60000 });
  const rejected = assert.rejects(pending, /timeout/);
  await f.resume(5000);
  await rejected;
  assert.equal(f.waits.length, 0, 'injection cannot extend the 5 second ownership deadline');
}

for (const mutation of ['destroy', 'context', 'deadline']) {
  const f = fixture();
  const p = program();
  p.isReady = () => {
    if (mutation === 'destroy') p.program = undefined;
    if (mutation === 'context') f.context.lost = true;
    if (mutation === 'deadline') f.advance(12);
    return true;
  };
  const pending = waitForTopMaskPrograms([p], f.context, f.options);
  const rejected = assert.rejects(pending, /program_unavailable|context_lost|timeout/);
  await f.resume();
  await rejected;
  assert.equal(f.waits.length, 0, 'readiness cannot override destruction, context loss or deadline');
}

for (const value of [{}, { program: {} }, { program: {}, isReady: 1 }]) {
  const f = fixture();
  await assert.rejects(waitForTopMaskPrograms([value], f.context, f.options), /program_unavailable/);
  assert.equal(f.waits.length, 0, 'invalid captured programs do not schedule work');
}

for (const options of [{ timeoutMs: 0 }, { pollIntervalMs: NaN }, { now: () => Infinity }]) {
  const f = fixture();
  await assert.rejects(waitForTopMaskPrograms([program()], f.context, { ...f.options, ...options }), /invalid/);
  assert.equal(f.waits.length, 0);
}

for (const mutation of ['replace', 'remove', 'lifetime']) {
  const f = fixture();
  const ready = program(true);
  const pending = program();
  const work = waitForTopMaskPrograms([ready, pending], f.context, f.options);
  const rejected = assert.rejects(work, /program_unavailable|context_changed/);
  await f.resume();
  assert.equal(ready.uniforms, 1);
  if (mutation === 'replace') ready.program = {};
  if (mutation === 'remove') f.context.hasProgram = (candidate) => candidate !== ready;
  if (mutation === 'lifetime') f.context.current = false;
  pending.ready = true;
  await f.resume();
  await rejected;
  assert.equal(pending.uniforms, 0, `${mutation}: completed prior entries remain required`);
  assert.equal(f.waits.length, 0);
}

for (const operation of ['isReady', 'getUniforms', 'getAttributes']) {
  for (const mutation of ['handle', 'context', 'remove']) {
    const f = fixture();
    const p = program(true);
    const native = p[operation];
    p[operation] = function () {
      const result = native.call(this);
      if (mutation === 'handle') p.program = {};
      if (mutation === 'context') f.context.current = false;
      if (mutation === 'remove') f.context.hasProgram = () => false;
      return result;
    };
    const work = waitForTopMaskPrograms([p], f.context, f.options);
    const rejected = assert.rejects(work, /program_unavailable|context_changed/);
    await f.resume();
    await rejected;
    assert.equal(p.uniforms, operation === 'isReady' ? 0 : 1);
    assert.equal(p.attributes, operation === 'getAttributes' ? 1 : 0,
      `${operation}/${mutation}: invalidation stops before the next native operation`);
    assert.equal(f.waits.length, 0);
  }
}

for (const operation of ['getUniforms', 'getAttributes']) {
  for (const failure of ['throw', 'missing', 'null', 'undefined']) {
    const f = fixture();
    const p = program(true); // Also models Three's immediate-ready no-KHR fallback.
    const original = new Error(`injected ${operation}`);
    if (failure === 'missing') delete p[operation];
    else p[operation] = () => {
      if (failure === 'throw') throw original;
      return failure === 'null' ? null : undefined;
    };
    const work = waitForTopMaskPrograms([p], f.context, f.options);
    const rejected = assert.rejects(work, (error) => failure === 'throw' ? error === original
      : /program_.*unavailable/.test(error.message));
    if (failure !== 'missing') await f.resume();
    await rejected;
    assert.equal(f.waits.length, 0, `${operation}/${failure}: no readiness-only fallback or detached work`);
  }
}

{
  const f = fixture();
  const p = program(true);
  const work = waitForTopMaskPrograms([p], f.context, f.options);
  await f.resume();
  const receipt = await work;
  receipt.assertCurrent();
  f.context.current = false;
  assert.throws(() => receipt.assertCurrent(), /context_changed/,
    'the caller can validate again after its own outer await, before rendering');
}

{
  const f = fixture();
  const p = program();
  let checkpoints = 0;
  await assert.rejects(waitForTopMaskPrograms([p], f.context, {
    now: () => 0, delay: async () => { checkpoints++; },
  }), /timeout/);
  assert.equal(checkpoints, 2048, 'one finite guard covers a frozen-clock operation');
  assert.equal(p.probes, 2048);
  assert.equal(p.uniforms, 0);
}

{
  const f = fixture();
  const programs = Array.from({ length: 65 }, () => program(true));
  const sizes = [];
  await waitForTopMaskPrograms(programs, f.context, {
    now: () => 0,
    delay: async () => { sizes.push(programs.reduce((sum, p) => sum + p.uniforms, 0)); },
  });
  assert.deepEqual(sizes, [0, 32, 64], 'cheap complete cohorts use bounded chunks, not one task per program');
  assert(programs.every((p) => p.uniforms === 1 && p.attributes === 1));
}

for (const remaining of [false, true]) {
  const f = fixture();
  const first = program(true);
  const second = program(true);
  first.getAttributes = () => { f.advance(20); return {}; };
  const work = waitForTopMaskPrograms(remaining ? [first, second] : [first], f.context, f.options);
  const checked = remaining ? assert.rejects(work, /timeout/) : work;
  await f.resume();
  await checked;
  assert.equal(second.probes, 0, 'a deadline crossed by reflection never admits another program');
  assert.equal(f.waits.length, 0, 'fully reflected final work needs no extra deadline wait');
}

{
  const f = fixture();
  const old = Object.assign(program(true), { id: 1 });
  const newest = Object.assign(program(), { id: 2 });
  const work = waitForTopMaskPrograms([old, newest], f.context, f.options);
  await f.resume();
  assert.equal(old.probes, 0, 'the newest pending link gates older potentially evicted native queries');
  newest.ready = true;
  await f.resume();
  await work;
  assert.deepEqual([old.uniforms, newest.uniforms], [1, 1], 'scheduling never drops retained older variants');
}

console.log('[topMaskProgramWarm] exact program preparation, bounded reflection and safe failure passed');
