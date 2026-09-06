import assert from 'node:assert/strict';
import { createNetworkRecoveryOwner } from './connectionRecovery.ts';

let nowMs = 100;
const events = [];
const listeners = new Set();
const client = {
  closed: false,
  onConnection(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
const status = { set: (update) => events.push(update) };
const recovery = createNetworkRecoveryOwner({
  graceMs: 10_000,
  attemptIntervalMs: 2_000,
  now: () => nowMs,
});

recovery.attach(client, status);
for (const listener of listeners) listener(false);
for (const listener of listeners) listener(false);
assert.deepEqual(events, [{ state: 'reconnecting', attempt: 1 }],
  'duplicate close edges share one reconnect presentation');

nowMs = 4_250;
assert.equal(recovery.update(nowMs, true, true), false);
assert.deepEqual(events.at(-1), { state: 'reconnecting', attempt: 3 });
assert.equal(recovery.snapshot(nowMs).disconnectedForMs, 4_150);

nowMs = 10_099;
assert.equal(recovery.update(nowMs, true, true), false,
  'the last valid frame remains visible for the complete grace');
nowMs = 10_100;
assert.equal(recovery.update(nowMs, true, true), true,
  'expiry is emitted exactly once at the grace boundary');
assert.deepEqual(events.at(-1), { state: 'failed' });
assert.equal(recovery.update(nowMs + 1_000, true, true), false,
  'a closed transport cannot reopen the result flow every frame');

for (const listener of listeners) listener(true);
assert.deepEqual(events.at(-1), { state: 'failed' },
  'a late connection cannot resurrect a terminal recovery owner');
assert.equal(recovery.update(nowMs + 2_000, false, true), false);
assert.equal(recovery.snapshot(nowMs).failed, true);
recovery.attach(client, status);
for (const listener of listeners) listener(false);
for (const listener of listeners) listener(true);
assert.deepEqual(events.at(-1), { state: 'reconnected' },
  'a new owner can recover before its own deadline');
assert.deepEqual(recovery.snapshot(nowMs + 1_000), {
  recovering: false,
  failed: false,
  attempt: 0,
  disconnectedForMs: 0,
});

recovery.dispose();
assert.equal(listeners.size, 0, 'presentation disposal releases the client subscription');
assert.throws(() => createNetworkRecoveryOwner({ graceMs: -1 }), /timings/);
assert.throws(() => recovery.update(Number.NaN, false, false), /finite/);

console.log('connectionRecovery.selftest: single-owner reconnect grace and expiry passed');
