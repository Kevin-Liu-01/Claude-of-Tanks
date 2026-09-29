import assert from 'node:assert/strict';
import { loadIceConfiguration } from './iceConfig.ts';

assert.deepEqual(await loadIceConfiguration({ mode: 'lan' }), {
  iceServers: [], relayOnly: false, relayAvailable: false, source: 'lan',
});

const relayed = await loadIceConfiguration({
  mode: 'private',
  endpoint: '/api/ice',
  fetchImpl: async () => new Response(JSON.stringify({
    iceServers: [
      { urls: ['stun:stun.cloudflare.com:3478'] },
      { urls: ['turns:turn.cloudflare.com:443?transport=tcp'], username: 'u', credential: 'c' },
    ],
    expiresInSeconds: 28800,
  }), { status: 200 }),
});
assert.equal(relayed.relayAvailable, true);
assert.equal(relayed.source, 'service');
assert.equal(relayed.expiresInSeconds, 28800);

const unavailable = await loadIceConfiguration({
  mode: 'private', endpoint: '/api/ice',
  fetchImpl: async () => new Response(JSON.stringify({
    error: 'turn_service_unconfigured',
  }), { status: 503 }),
});
assert.equal(unavailable.source, 'host-fallback');
assert.equal(unavailable.relayAvailable, false);
assert.equal(unavailable.iceServers.length, 0);
assert.equal(unavailable.degradedReason, 'turn_service_unconfigured');

let transientCalls = 0;
const transient = await loadIceConfiguration({
  mode: 'private', endpoint: '/api/ice', timeoutMs: 5_000,
  retryDelaysMs: [10, 20],
  wait: async () => {},
  fetchImpl: async () => {
    transientCalls++;
    if (transientCalls < 3) {
      return new Response(JSON.stringify({ error: 'turn_service_unavailable' }), { status: 503 });
    }
    return new Response(JSON.stringify({
      iceServers: [{
        urls: ['turns:turn.cloudflare.com:443?transport=tcp'],
        username: 'fresh', credential: 'lease',
      }],
      expiresInSeconds: 28_800,
    }), { status: 200 });
  },
});
assert.equal(transientCalls, 3, 'transient credential failures retry within one acquisition budget');
assert.equal(transient.relayAvailable, true);
assert.equal(transient.source, 'service');

const malformed = await loadIceConfiguration({
  mode: 'private', endpoint: '/api/ice',
  fetchImpl: async () => new Response(JSON.stringify({
    iceServers: [{ urls: ['https://not-an-ice-server.example'] }],
  }), { status: 200 }),
});
assert.equal(malformed.degradedReason, 'turn_service_invalid');

console.log('iceConfig.selftest: LAN, retried TURN leases, and self-hosted fallback passed');
