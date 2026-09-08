import assert from 'node:assert/strict';
import { waitForTopMaskPrograms } from './topMaskProgramWarm.ts';

function fixture() {
  let clock = 0;
  const waits = [];
  const context = { lost: false, isContextLost() { return this.lost; } };
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
  return { program: {}, ready, probes: 0,
    isReady() { this.probes++; return this.ready; },
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
  assert.equal(replacement.probes, 0);
  original.ready = true;
  await f.resume();
  await pending;
  assert.equal(done, true);
  assert.equal(original.probes, 2);
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

console.log('[topMaskProgramWarm] pinned program identity, bounded polling and safe failure passed');
