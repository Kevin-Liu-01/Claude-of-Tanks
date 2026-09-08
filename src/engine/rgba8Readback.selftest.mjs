import assert from 'node:assert/strict';
import { beginRgba8Readback } from './rgba8Readback.ts';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function timing() {
  let clock = 0;
  const waits = [];
  return {
    waits,
    options: {
      now: () => clock,
      delay(ms) {
        const wait = deferred();
        waits.push({ ...wait, ms });
        return wait.promise;
      },
      timeoutMs: 12,
    },
    advance(ms) { clock += ms; },
    async resume(ms = 4) {
      const wait = waits.shift();
      assert(wait, 'a single poll delay is pending');
      clock += ms;
      wait.resolve();
      await Promise.resolve();
    },
  };
}

function fakeGl(onOperation = () => {}) {
  const events = [];
  const buffers = [];
  const syncs = [];
  const initialBinding = { id: 'external-initial' };
  const failures = new Map();
  let binding = initialBinding;
  const gl = {
    PIXEL_PACK_BUFFER: 35051, PIXEL_PACK_BUFFER_BINDING: 35053,
    STREAM_READ: 35041, BUFFER_SIZE: 34660, RGBA: 6408, UNSIGNED_BYTE: 5121,
    SYNC_GPU_COMMANDS_COMPLETE: 37143,
    ALREADY_SIGNALED: 37146, TIMEOUT_EXPIRED: 37147,
    CONDITION_SATISFIED: 37148, WAIT_FAILED: 37149,
    contextLost: false, nullBuffer: false, nullFence: false, emptyStorage: false,
    isContextLost() { record('isContextLost'); return gl.contextLost; },
    createBuffer() {
      record('createBuffer');
      if (gl.nullBuffer) return null;
      const buffer = { id: `pbo-${buffers.length}`, deleted: 0, data: null };
      buffers.push(buffer);
      return buffer;
    },
    getParameter(parameter) {
      record('getParameter', parameter);
      assert.equal(parameter, gl.PIXEL_PACK_BUFFER_BINDING);
      return binding;
    },
    bindBuffer(target, value) {
      record('bindBuffer', target, value);
      assert.equal(target, gl.PIXEL_PACK_BUFFER);
      binding = value;
    },
    bufferData(target, size, usage) {
      record('bufferData', target, size, usage);
      assert.equal(target, gl.PIXEL_PACK_BUFFER);
      assert.equal(usage, gl.STREAM_READ);
      binding.data = new Uint8Array(gl.emptyStorage ? 0 : size);
    },
    getBufferParameter(target, parameter) {
      record('getBufferParameter', target, parameter);
      assert.deepEqual([target, parameter], [gl.PIXEL_PACK_BUFFER, gl.BUFFER_SIZE]);
      return binding.data.byteLength;
    },
    readPixels(...args) {
      record('readPixels', ...args);
      const [x, y, width, height, format, type, offset] = args;
      assert.deepEqual([x, y, format, type, offset], [0, 0, gl.RGBA, gl.UNSIGNED_BYTE, 0]);
      binding.data.fill(buffers.indexOf(binding) + 31, 0, width * height * 4);
    },
    fenceSync(condition, flags) {
      record('fenceSync', condition, flags);
      assert.deepEqual([condition, flags], [gl.SYNC_GPU_COMMANDS_COMPLETE, 0]);
      if (gl.nullFence) return null;
      const sync = { buffer: binding, deleted: 0, status: gl.CONDITION_SATISFIED };
      syncs.push(sync);
      return sync;
    },
    flush() { record('flush'); },
    clientWaitSync(sync, flags, timeout) {
      record('clientWaitSync', sync, flags, timeout);
      assert.equal(sync.deleted, 0);
      assert.deepEqual([flags, timeout], [0, 0]);
      return sync.status;
    },
    getBufferSubData(target, offset, destination, destinationOffset, length) {
      record('getBufferSubData', target, offset, destination, destinationOffset, length);
      assert.deepEqual([target, offset, destinationOffset], [gl.PIXEL_PACK_BUFFER, 0, 0]);
      assert.equal(binding.deleted, 0);
      destination.set(binding.data.subarray(0, length), destinationOffset);
    },
    deleteSync(sync) { sync.deleted++; record('deleteSync', sync); },
    deleteBuffer(buffer) { buffer.deleted++; record('deleteBuffer', buffer); },
  };
  function record(name, ...args) {
    events.push([name, ...args]);
    onOperation(name);
    const failure = failures.get(name);
    if (failure) throw failure;
  }
  return {
    gl, events, buffers, syncs, initialBinding, failures,
    binding: () => binding,
    names: () => events.map(([name]) => name),
    assertReleased() {
      for (const buffer of buffers) assert.equal(buffer.deleted, 1, 'each owned PBO is deleted exactly once');
      for (const sync of syncs) assert.equal(sync.deleted, 1, 'each owned fence is deleted exactly once');
    },
  };
}

{
  const clock = timing();
  const fake = fakeGl(() => clock.advance(2));
  const timings = {};
  const pending = beginRgba8Readback(fake.gl, 1, 1, new Uint8Array(4), {
    ...clock.options, timeoutMs: 1000, timings,
  });
  assert.deepEqual(fake.names(), [
    'isContextLost', 'createBuffer', 'getParameter', 'bindBuffer', 'bufferData',
    'readPixels', 'fenceSync', 'flush', 'bindBuffer',
  ], 'submission queues pixels and a fence without an allocation-size roundtrip');
  assert.deepEqual(timings, {
    contextQuery: 2, createBuffer: 2, bindingQuery: 2, bindBuffer: 4, bufferData: 2,
    readPixels: 2, fence: 2, flush: 2,
  }, 'enqueue timings are available before the first awaited poll');
  assert.equal(timings.sizeQuery, undefined, 'allocation validation has not run before fence completion');
  assert.equal(timings.wait, undefined, 'a pending wait has no completed duration');
  await clock.resume();
  await pending;
  assert.deepEqual(timings, {
    contextQuery: 8, createBuffer: 2, bindingQuery: 4, bindBuffer: 8, bufferData: 2,
    sizeQuery: 2, readPixels: 2, fence: 2, flush: 2,
    wait: 8, copy: 2, release: 4,
  }, 'repeated bindings accumulate; GPU waiting, copying and cleanup remain distinct');
  assert(fake.events.every(([name]) => name !== 'getError'), 'diagnostics never consume GL errors');
  assert.equal(clock.waits.length, 0);
  fake.assertReleased();
}

for (const method of ['readPixels', 'clientWaitSync', 'getBufferParameter', 'getBufferSubData', 'deleteSync']) {
  const clock = timing();
  const fake = fakeGl(() => clock.advance(2));
  const timings = {};
  const failure = new Error(`timed ${method}`);
  fake.failures.set(method, failure);
  const pending = beginRgba8Readback(fake.gl, 1, 1, new Uint8Array(4), {
    ...clock.options, timeoutMs: 1000, timings,
  });
  const rejected = assert.rejects(pending, (error) => error === failure);
  if (clock.waits.length) await clock.resume();
  await rejected;
  const stage = { readPixels: 'readPixels', clientWaitSync: 'wait',
    getBufferParameter: 'sizeQuery', getBufferSubData: 'copy', deleteSync: 'release' }[method];
  assert(timings[stage] >= 2, `${method}: failed operations still publish their elapsed time`);
  assert(timings.release >= 2, 'cleanup is measured after failure');
  assert(Object.values(timings).every((ms) => Number.isFinite(ms) && ms >= 0));
  assert.equal(fake.binding(), fake.initialBinding);
  assert.equal(clock.waits.length, 0);
  fake.assertReleased();
}

for (const diagnostics of ['frozen', 'throwing', 'nonfinite']) {
  const clock = timing();
  const fake = fakeGl(() => clock.advance(2));
  const timings = diagnostics === 'frozen' ? Object.freeze({})
    : diagnostics === 'throwing' ? Object.defineProperty({}, 'readPixels', {
      get() { throw new Error('diagnostic getter failed'); },
      set() { throw new Error('diagnostic setter failed'); },
    }) : { createBuffer: Infinity, bindingQuery: NaN, bindBuffer: -10 };
  const pending = beginRgba8Readback(fake.gl, 1, 1, new Uint8Array(4), {
    ...clock.options, timeoutMs: 1000, timings,
  });
  await clock.resume();
  await pending;
  if (diagnostics === 'nonfinite') {
    assert.equal(timings.createBuffer, 2);
    assert.equal(timings.bindingQuery, 4);
    assert.equal(timings.bindBuffer, 8);
  }
  assert.equal(fake.binding(), fake.initialBinding, `${diagnostics}: telemetry cannot skip restoration`);
  fake.assertReleased();
}

{
  const fake = fakeGl();
  const clock = timing();
  let nowCalls = 0;
  const pending = beginRgba8Readback(fake.gl, 1, 1, new Uint8Array(4), {
    ...clock.options, now() { nowCalls += 1; return clock.options.now(); },
  });
  await clock.resume();
  await pending;
  assert.equal(nowCalls, 6, 'without an opt-in bag only deadline checks read the clock, including after validation');
  fake.assertReleased();
}

{
  const fake = fakeGl();
  const clock = timing();
  const storage = new Uint8Array(28).fill(7);
  const pixels = storage.subarray(4, 24);
  const pending = beginRgba8Readback(fake.gl, 2, 2, pixels, clock.options);
  assert(pending instanceof Promise);
  assert.deepEqual(fake.names(), [
    'isContextLost', 'createBuffer', 'getParameter', 'bindBuffer', 'bufferData',
    'readPixels', 'fenceSync', 'flush', 'bindBuffer',
  ], 'readPixels, fence, flush and restoration all happen before the first await');
  assert.equal(fake.names().indexOf('readPixels'), fake.names().indexOf('bufferData') + 1,
    'no synchronous GL query separates allocation from pixel submission');
  assert.equal(fake.binding(), fake.initialBinding, 'nonzero initial binding is restored immediately');
  assert.deepEqual(clock.waits.map(({ ms }) => ms), [4]);
  assert(storage.every((value) => value === 7), 'no destination writes before fence completion');
  const currentBinding = { id: 'external-during-wait' };
  fake.gl.bindBuffer(fake.gl.PIXEL_PACK_BUFFER, currentBinding);
  await clock.resume();
  await pending;
  assert.ok(fake.names().indexOf('getBufferParameter') > fake.names().indexOf('clientWaitSync'),
    'buffer size is validated only after the owned fence signals');
  assert.ok(fake.names().indexOf('getBufferParameter') < fake.names().indexOf('getBufferSubData'),
    'validated allocation remains a prerequisite for the destination copy');
  assert.equal(fake.binding(), currentBinding, 'copy restores the current binding, not the old submission binding');
  assert.deepEqual([...storage], [...new Uint8Array(4).fill(7), ...new Uint8Array(16).fill(31), ...new Uint8Array(8).fill(7)],
    'readback respects byteOffset and writes only the requested RGBA extent');
  assert.equal(clock.waits.length, 0);
  fake.assertReleased();
}

{
  const fake = fakeGl();
  const clock = timing();
  const pixelsA = new Uint8Array(4);
  const pixelsB = new Uint8Array(4);
  const pendingA = beginRgba8Readback(fake.gl, 1, 1, pixelsA, clock.options);
  const pendingB = beginRgba8Readback(fake.gl, 1, 1, pixelsB, clock.options);
  const [waitA, waitB] = clock.waits.splice(0);
  assert.notEqual(fake.buffers[0], fake.buffers[1]);
  assert.notEqual(fake.syncs[0], fake.syncs[1]);
  assert.equal(fake.binding(), fake.initialBinding);
  clock.advance(4);
  waitB.resolve();
  await pendingB;
  assert.deepEqual([...pixelsB], [32, 32, 32, 32]);
  assert.deepEqual([...pixelsA], [0, 0, 0, 0]);
  assert.equal(fake.buffers[0].deleted, 0, 'one completion does not delete another pending transaction');
  waitA.resolve();
  await pendingA;
  assert.deepEqual([...pixelsA], [31, 31, 31, 31]);
  assert.equal(fake.binding(), fake.initialBinding);
  fake.assertReleased();
}

for (const method of ['isContextLost', 'createBuffer', 'getParameter', 'bindBuffer', 'bufferData', 'getBufferParameter', 'readPixels', 'fenceSync', 'flush', 'clientWaitSync', 'getBufferSubData']) {
  const fake = fakeGl();
  const clock = timing();
  const failure = new Error(`injected ${method}`);
  fake.failures.set(method, failure);
  const pending = beginRgba8Readback(fake.gl, 1, 1, new Uint8Array(4), clock.options);
  const rejected = assert.rejects(pending, (error) => error === failure, `${method}: preserve original failure`);
  if (clock.waits.length) await clock.resume();
  await rejected;
  assert.equal(fake.binding(), fake.initialBinding, `${method}: restore the caller binding`);
  assert.equal(clock.waits.length, 0, `${method}: no abandoned polls`);
  fake.assertReleased();
}

{
  const fake = fakeGl();
  const clock = timing();
  const pending = beginRgba8Readback(fake.gl, 1, 1, new Uint8Array(4), clock.options);
  fake.syncs[0].status = fake.gl.ALREADY_SIGNALED;
  await clock.resume();
  await pending;
  fake.assertReleased();
}

for (const event of ['getParameter', 'bindBuffer', 'clock']) {
  const fake = fakeGl();
  const clock = timing();
  const failure = new Error(`injected post-enqueue ${event}`);
  const now = clock.options.now;
  let clockFailure = false;
  clock.options.now = () => {
    if (clockFailure) throw failure;
    return now();
  };
  const pending = beginRgba8Readback(fake.gl, 1, 1, new Uint8Array(4), clock.options);
  if (event === 'clock') clockFailure = true;
  else fake.failures.set(event, failure);
  const rejected = assert.rejects(pending, (error) => error === failure);
  await clock.resume();
  await rejected;
  assert.equal(fake.names().includes('getBufferSubData'), false);
  assert.equal(fake.binding(), fake.initialBinding);
  assert.equal(clock.waits.length, 0);
  fake.assertReleased();
}

for (const primary of [false, true]) {
  const fake = fakeGl();
  const clock = timing();
  const restoreFailure = new Error('injected binding restoration failure');
  const readFailure = new Error('injected submission failure');
  const originalRead = fake.gl.readPixels;
  fake.gl.readPixels = (...args) => {
    originalRead(...args);
    fake.failures.set('bindBuffer', restoreFailure);
    if (primary) throw readFailure;
  };
  await assert.rejects(beginRgba8Readback(fake.gl, 1, 1, new Uint8Array(4), clock.options),
    (error) => error === (primary ? readFailure : restoreFailure));
  assert.equal(clock.waits.length, 0, 'failed restoration cannot start polling');
  fake.assertReleased();
}

for (const [flag, expected] of [['nullBuffer', /buffer_unavailable/], ['nullFence', /fence_unavailable/], ['contextLost', /context_lost/], ['emptyStorage', /allocation_failed/]]) {
  const fake = fakeGl();
  fake.gl[flag] = true;
  const clock = timing();
  const rejected = assert.rejects(beginRgba8Readback(fake.gl, 1, 1, new Uint8Array(4), clock.options), expected);
  if (clock.waits.length) await clock.resume();
  await rejected;
  assert.equal(fake.binding(), fake.initialBinding);
  assert.equal(clock.waits.length, 0);
  fake.assertReleased();
}

for (const reportedSize of [0, 2, 8, NaN]) {
  const fake = fakeGl();
  const clock = timing();
  const originalSize = fake.gl.getBufferParameter;
  fake.gl.getBufferParameter = (...args) => {
    originalSize(...args);
    return reportedSize;
  };
  const pixels = new Uint8Array(4).fill(9);
  const pending = beginRgba8Readback(fake.gl, 1, 1, pixels, clock.options);
  const rejected = assert.rejects(pending, /allocation_failed/);
  assert.equal(fake.names().includes('getBufferParameter'), false);
  fake.syncs[0].status = fake.gl.TIMEOUT_EXPIRED;
  await clock.resume();
  assert.equal(fake.names().includes('getBufferParameter'), false,
    'a pending fence cannot trigger allocation validation');
  const currentBinding = { id: 'external-before-allocation-validation' };
  fake.gl.bindBuffer(fake.gl.PIXEL_PACK_BUFFER, currentBinding);
  fake.syncs[0].status = fake.gl.CONDITION_SATISFIED;
  await clock.resume();
  await rejected;
  assert.equal(fake.names().filter((name) => name === 'getBufferParameter').length, 1);
  assert.equal(fake.names().includes('getBufferSubData'), false, 'malformed or OOM storage cannot copy');
  assert.deepEqual([...pixels], [9, 9, 9, 9], 'rejected allocation leaves destination bytes untouched');
  assert.equal(fake.binding(), currentBinding, 'failed validation restores the binding owned by the current caller');
  assert.equal(clock.waits.length, 0);
  fake.assertReleased();
}

for (const lost of [false, true]) {
  const fake = fakeGl();
  const clock = timing();
  const originalSize = fake.gl.getBufferParameter;
  fake.gl.getBufferParameter = (...args) => {
    const size = originalSize(...args);
    if (lost) fake.gl.contextLost = true;
    else clock.advance(12);
    return size;
  };
  const pixels = new Uint8Array(4).fill(9);
  const pending = beginRgba8Readback(fake.gl, 1, 1, pixels, clock.options);
  const rejected = assert.rejects(pending, lost ? /context_lost/ : /timeout/);
  await clock.resume();
  await rejected;
  assert.equal(fake.names().includes('getBufferSubData'), false,
    'post-fence validation cannot permit a copy after context loss or the ownership deadline');
  assert.deepEqual([...pixels], [9, 9, 9, 9]);
  assert.equal(fake.binding(), fake.initialBinding);
  assert.equal(clock.waits.length, 0);
  fake.assertReleased();
}

{
  const fake = fakeGl();
  const clock = timing();
  const pending = beginRgba8Readback(fake.gl, 1, 1, new Uint8Array(4), { ...clock.options, timeoutMs: 60000 });
  const rejected = assert.rejects(pending, /timeout/);
  await clock.resume(5000);
  await rejected;
  assert.equal(fake.names().includes('getBufferSubData'), false, 'timing injection cannot extend the 5 second ownership bound');
  fake.assertReleased();
}

for (const status of ['WAIT_FAILED', 'unexpected']) {
  const fake = fakeGl();
  const clock = timing();
  const pending = beginRgba8Readback(fake.gl, 1, 1, new Uint8Array(4), clock.options);
  fake.syncs[0].status = status === 'unexpected' ? -1 : fake.gl[status];
  const rejected = assert.rejects(pending, /wait_failed/);
  await clock.resume();
  await rejected;
  assert.equal(fake.names().includes('getBufferSubData'), false);
  assert.equal(clock.waits.length, 0);
  fake.assertReleased();
}

{
  const fake = fakeGl();
  const clock = timing();
  const pending = beginRgba8Readback(fake.gl, 1, 1, new Uint8Array(4), clock.options);
  fake.gl.contextLost = true;
  const rejected = assert.rejects(pending, /context_lost/);
  await clock.resume();
  await rejected;
  assert.equal(fake.names().includes('getBufferSubData'), false);
  fake.assertReleased();
}

for (const rejectedDelay of [false, true]) {
  const fake = fakeGl();
  const clock = timing();
  const failure = new Error('injected delay rejection');
  if (!rejectedDelay) clock.options.delay = () => { throw failure; };
  const pending = beginRgba8Readback(fake.gl, 1, 1, new Uint8Array(4), clock.options);
  const rejected = assert.rejects(pending, (error) => error === failure);
  if (rejectedDelay) clock.waits.shift().reject(failure);
  await rejected;
  assert.equal(fake.binding(), fake.initialBinding);
  assert.equal(clock.waits.length, 0);
  fake.assertReleased();
}

for (const delayedSuccess of [false, true]) {
  const fake = fakeGl();
  const clock = timing();
  const pixels = new Uint8Array(4).fill(9);
  const pending = beginRgba8Readback(fake.gl, 1, 1, pixels, clock.options);
  const rejected = assert.rejects(pending, /timeout/);
  if (!delayedSuccess) {
    fake.syncs[0].status = fake.gl.TIMEOUT_EXPIRED;
    await clock.resume();
    await clock.resume();
    assert.equal(fake.events.filter(([name]) => name === 'clientWaitSync').length, 2);
  }
  const lastWait = clock.waits[0];
  await clock.resume(delayedSuccess ? 100 : 4);
  await rejected;
  lastWait.resolve();
  await Promise.resolve();
  assert.equal(clock.waits.length, 0, 'deadline failure cannot schedule a late poll');
  assert.equal(fake.names().includes('getBufferSubData'), false, 'even a signaled fence cannot copy at or after the deadline');
  assert.deepEqual([...pixels], [9, 9, 9, 9], 'timeout leaves destination untouched');
  fake.assertReleased();
}

for (const lost of [false, true]) {
  const fake = fakeGl();
  const clock = timing();
  const originalWait = fake.gl.clientWaitSync;
  fake.gl.clientWaitSync = (...args) => {
    const status = originalWait(...args);
    if (lost) fake.gl.contextLost = true;
    else clock.advance(12);
    return status;
  };
  const pixels = new Uint8Array(4).fill(9);
  const pending = beginRgba8Readback(fake.gl, 1, 1, pixels, clock.options);
  const rejected = assert.rejects(pending, lost ? /context_lost/ : /timeout/);
  await clock.resume();
  await rejected;
  assert.equal(fake.names().includes('getBufferSubData'), false, 'copy rechecks context and deadline after fence readiness');
  assert.deepEqual([...pixels], [9, 9, 9, 9]);
  fake.assertReleased();
}

{
  const fake = fakeGl();
  const clock = timing();
  const pending = beginRgba8Readback(fake.gl, 1, 1, new Uint8Array(4), { ...clock.options, timeoutMs: 6 });
  fake.syncs[0].status = fake.gl.TIMEOUT_EXPIRED;
  const rejected = assert.rejects(pending, /timeout/);
  await clock.resume();
  assert.deepEqual(clock.waits.map(({ ms }) => ms), [2], 'final delay cannot exceed the remaining deadline');
  await clock.resume(2);
  await rejected;
  fake.assertReleased();
}

for (const originalFailure of [false, true]) {
  const fake = fakeGl();
  const clock = timing();
  const failure = new Error('injected primary failure');
  const cleanupFailure = new Error('injected cleanup failure');
  fake.failures.set('deleteSync', cleanupFailure);
  fake.failures.set('deleteBuffer', new Error('injected second cleanup failure'));
  if (originalFailure) fake.failures.set('getBufferSubData', failure);
  const pending = beginRgba8Readback(fake.gl, 1, 1, new Uint8Array(4), clock.options);
  const rejected = assert.rejects(pending, (error) => error === (originalFailure ? failure : cleanupFailure));
  await clock.resume();
  await rejected;
  fake.assertReleased();
  assert.equal(fake.binding(), fake.initialBinding, 'cleanup exceptions cannot skip binding restoration');
}

for (const [width, height, size, options] of [
  [0, 1, 4, {}], [1.5, 1, 8, {}], [1, -1, 4, {}], [Infinity, 1, 4, {}],
  [2, 2, 15, {}], [1, 1, 4, { timeoutMs: 0 }], [1, 1, 4, { pollIntervalMs: NaN }],
  [1, 1, 4, { now: () => NaN }],
]) {
  const fake = fakeGl();
  await assert.rejects(beginRgba8Readback(fake.gl, width, height, new Uint8Array(size), options), /invalid/);
  assert.equal(fake.events.length, 0, 'invalid extents/timings fail before touching GL');
}

console.log('[rgba8Readback] bounded readback, binding ownership and failure cleanup passed');
