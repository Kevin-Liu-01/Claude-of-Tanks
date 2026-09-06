import assert from 'node:assert/strict';
import { createNetworkRoomFailureRuntime } from './networkRoomFailureRuntime.ts';

let hasMatch = true;
let finishReturn;
const events = [];
let runtime;
runtime = createNetworkRoomFailureRuntime({
  hasMatch: () => hasMatch,
  getMode: () => 'lan',
  shouldReturnToGarage: () => true,
  clearInput: () => events.push('input'),
  closeRoom(reason) {
    events.push(['close', reason]);
    hasMatch = false;
    void runtime.fail(reason);
  },
  returnToGarage() {
    events.push('garage');
    return new Promise((resolve) => { finishReturn = resolve; });
  },
  getMenu: async () => ({ showRoomFailure: (...args) => events.push(['error', ...args]) }),
});
const first = runtime.fail('host_left');
assert.equal(runtime.fail('rtc_recovery_exhausted'), first);
assert.deepEqual(events, ['input', ['close', 'host_left'], 'garage']);
assert.equal(runtime.pending, true);
finishReturn();
await first;
assert.deepEqual(events.at(-1), ['error', 'host_left', 'lan']);
assert.equal(runtime.pending, false);
await runtime.fail('host_left');
assert.equal(events.length, 4, 'retired room cannot repeat terminal UI');

hasMatch = true;
const second = runtime.fail('rtc_recovery_exhausted');
hasMatch = true; // A newer room acquired ownership during asynchronous return.
finishReturn();
await second;
assert.equal(events.filter((entry) => Array.isArray(entry) && entry[0] === 'error').length, 1);

let closeAttempts = 0;
const failedCleanup = createNetworkRoomFailureRuntime({
  hasMatch: () => true,
  getMode: () => 'private',
  shouldReturnToGarage: () => false,
  clearInput() {},
  closeRoom() { closeAttempts++; throw new Error('cleanup rejected'); },
  returnToGarage: async () => {},
  getMenu: () => null,
});
await assert.rejects(failedCleanup.fail('host_left'), /cleanup rejected/);
assert.equal(failedCleanup.pending, false);
assert.equal(closeAttempts, 1);
console.log('networkRoomFailureRuntime.selftest: coalesced teardown, garage-before-error, stale ownership PASS');
