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
  fetchImpl: async () => new Response('{}', { status: 503 }),
});
assert.equal(unavailable.source, 'stun-fallback');
assert.equal(unavailable.relayAvailable, false);
assert.equal(unavailable.iceServers.length, 1);

const malformed = await loadIceConfiguration({
  mode: 'private', endpoint: '/api/ice',
  fetchImpl: async () => new Response(JSON.stringify({
    iceServers: [{ urls: ['https://not-an-ice-server.example'] }],
  }), { status: 200 }),
});
assert.equal(malformed.degradedReason, 'turn_service_invalid');

console.log('iceConfig.selftest: LAN, short-lived TURN, and bounded STUN fallback passed');
