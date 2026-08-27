import assert from 'node:assert/strict';
import { createNetworkBattleBarrier } from './networkBattleBarrier.ts';

const waits = [];
const leases = [];
const cancelled = [];
let activeMatch = null;
let pendingWait = null;
const barrier = createNetworkBattleBarrier({
  getMatch: () => activeMatch,
  waitForSnapshot(predicate, timeoutMs, label) {
    waits.push({ predicate, timeoutMs, label });
    return new Promise((resolve, reject) => { pendingWait = { resolve, reject }; });
  },
  scheduleRepeating(callback, intervalMs) {
    const lease = { callback, intervalMs };
    leases.push(lease);
    return lease;
  },
  cancelRepeating(lease) { cancelled.push(lease); },
  retryMs: 250,
  timeoutMs: 4000,
});

const initialPromise = barrier.waitForInitialSnapshot({ viewerId: 'guest' });
assert.equal(waits[0].timeoutMs, 4000);
assert.match(waits[0].label, /first authoritative snapshot/i);
assert.equal(waits[0].predicate({ tick: 1, entities: [{ id: 'host' }] }), false);
assert.equal(waits[0].predicate({ tick: 2, entities: [{ id: 'guest' }] }), true);
pendingWait.resolve({ tick: 2, entities: [{ id: 'guest' }] });
assert.equal((await initialPromise).tick, 2);

const spectatorPromise = barrier.waitForInitialSnapshot({ viewerId: '', spectator: true });
assert.equal(waits[1].predicate({ tick: 3, entities: [] }), false);
assert.equal(waits[1].predicate({ tick: 4, entities: [{ id: 'host' }] }), true);
pendingWait.resolve({ tick: 4, entities: [{ id: 'host' }] });
await spectatorPromise;

let readyCalls = 0;
const firstMatch = {
  client: { closed: false },
  ready() { readyCalls += 1; },
};
activeMatch = firstMatch;
const readyPromise = barrier.waitForPeerReadiness();
assert.equal(readyCalls, 1, 'READY is announced immediately');
assert.equal(leases[0].intervalMs, 250);
assert.equal(waits[2].predicate({ tick: 5, meta: { phase: 'waiting' } }), false);
assert.equal(waits[2].predicate({ tick: 6, meta: { phase: 'countdown' } }), true);
leases[0].callback();
assert.equal(readyCalls, 2, 'the current open match receives retries');
activeMatch = { client: { closed: false }, ready() { readyCalls += 100; } };
leases[0].callback();
assert.equal(readyCalls, 2, 'a replaced match never receives a stale retry');
pendingWait.resolve({ tick: 6, meta: { phase: 'countdown' } });
await readyPromise;
assert.deepEqual(cancelled, [leases[0]], 'success releases the retry lease');

activeMatch = firstMatch;
const rejectedPromise = barrier.waitForPeerReadiness();
pendingWait.reject(new Error('closed'));
await assert.rejects(rejectedPromise, /closed/);
assert.equal(cancelled.at(-1), leases[1], 'failure releases the retry lease');

const cancelledPromise = barrier.waitForPeerReadiness();
barrier.cancel();
assert.equal(cancelled.at(-1), leases[2], 'explicit disposal releases the retry lease');
leases[2].callback();
assert.equal(readyCalls, 4, 'cancelled leases cannot send another READY');
pendingWait.resolve({ tick: 7, meta: { phase: 'playing' } });
await cancelledPromise;

assert.throws(
  () => createNetworkBattleBarrier({
    getMatch: () => null,
    waitForSnapshot: async () => ({ tick: 0 }),
    retryMs: 0,
  }),
  /positive and finite/,
);

console.log('networkBattleBarrier.selftest: identity and retry leases passed');
