import assert from 'node:assert/strict';
import { RtcIceLease } from './rtcIceLease.ts';

const turn = (ttl = 10) => ({
  iceServers: [{
    urls: ['stun:stun.example.test', 'turn:relay.example.test'],
    username: 'short-lived', credential: 'secret',
  }],
  relayOnly: false,
  relayAvailable: true,
  expiresInSeconds: ttl,
});
const stun = {
  iceServers: [{ urls: 'stun:stun.example.test' }],
  relayOnly: false,
  relayAvailable: false,
};

let now = 1_000;
let refreshes = 0;
const lease = new RtcIceLease(turn(), {
  now: () => now,
  refresh: async () => { refreshes += 1; return turn(20); },
  maxRefreshLeadMs: 1_000,
});
await lease.refreshIfNeeded();
assert.equal(refreshes, 0, 'fresh credentials are reused for ordinary peer joins');
now = 10_001;
const [first, second] = await Promise.all([
  lease.refreshIfNeeded(), lease.refreshIfNeeded(),
]);
assert.equal(refreshes, 1, 'one refresh owns a concurrent replacement generation');
assert.strictEqual(first, second);

let degradedRefreshes = 0;
now = 20_000;
const resilient = new RtcIceLease(turn(), {
  now: () => now,
  refresh: async () => { degradedRefreshes += 1; return stun; },
  maxRefreshLeadMs: 1_000,
  retryDelayMs: 500,
});
now = 29_001;
const retained = await resilient.refreshIfNeeded();
assert.ok(retained.iceServers[0].urls.includes('turn:relay.example.test'),
  'a transient direct-only fallback cannot discard unexpired TURN credentials');
await resilient.refreshIfNeeded();
assert.equal(degradedRefreshes, 1, 'degraded credential service obeys retry backoff');
now = 30_001;
const expired = await resilient.refreshIfNeeded();
assert.equal(expired.relayAvailable, false,
  'after credential expiry the honest direct-only fallback replaces the dead relay');

let recovered = 0;
const cold = new RtcIceLease(stun, {
  now: () => now,
  refresh: async () => { recovered += 1; return turn(); },
});
assert.equal((await cold.refreshIfNeeded()).relayAvailable, true,
  'a room opened during an outage acquires TURN before its next RTC generation');
assert.equal(recovered, 1);

console.log('rtcIceLease.selftest: expiry refresh, dedupe, and degraded retention passed');
