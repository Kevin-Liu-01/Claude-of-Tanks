import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { installProcessShutdown } from './processShutdown.ts';

function fakeProcess() {
  const target = new EventEmitter();
  target.exits = [];
  target.exit = (code) => { target.exits.push(code); };
  return target;
}

const target = fakeProcess();
let calls = 0;
let resolveClose;
const errors = [];
installProcessShutdown(() => {
  calls++;
  return new Promise((resolve) => { resolveClose = resolve; });
}, { target, reportError: (message) => errors.push(message) });
target.emit('SIGTERM');
target.emit('SIGINT');
await delay(0);
assert.equal(calls, 1, 'repeated signals close exactly once');
assert.deepEqual(target.exits, [], 'shutdown waits for service cleanup');
resolveClose();
await delay(0);
assert.deepEqual(target.exits, [0]);
assert.equal(target.listenerCount('SIGTERM'), 0);
assert.equal(target.listenerCount('SIGINT'), 0);
assert.deepEqual(errors, []);

const failure = fakeProcess();
installProcessShutdown(() => { throw new Error('secret-provider-token'); }, {
  target: failure, reportError: (message) => errors.push(message),
});
failure.emit('SIGINT');
await delay(0);
assert.deepEqual(failure.exits, [1]);
assert.doesNotMatch(errors.join(' '), /secret-provider-token/);

const stalled = fakeProcess();
installProcessShutdown(() => new Promise(() => {}), {
  target: stalled, timeoutMs: 5, reportError: (message) => errors.push(message),
});
stalled.emit('SIGTERM');
await delay(15);
assert.deepEqual(stalled.exits, [1], 'unresponsive sockets cannot block shutdown indefinitely');
assert.equal(stalled.listenerCount('SIGTERM'), 0);

const idle = fakeProcess();
const dispose = installProcessShutdown(async () => { calls++; }, { target: idle });
dispose();
idle.emit('SIGTERM');
assert.deepEqual(idle.exits, []);
assert.equal(calls, 1);
assert.throws(() => installProcessShutdown(async () => {}, { timeoutMs: NaN }), /positive/);
console.log('processShutdown.selftest: clean, failed, repeated, disposed and bounded shutdown passed');
