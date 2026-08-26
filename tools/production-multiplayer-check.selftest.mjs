import assert from 'node:assert/strict';
import { checkProductionMultiplayer } from './production-multiplayer-check.mjs';

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const calls = [];
const healthy = await checkProductionMultiplayer({
  baseUrl: 'https://game.example.test/path',
  fetchImpl: async (url, options) => {
    calls.push({ url: String(url), origin: options.headers.origin });
    if (String(url).endsWith('/api/signal')) return response(200, {
      ok: true, distributed: true,
      redis: { ok: true, command: 'ready', subscriber: 'ready' },
    });
    return response(200, {
      iceServers: [
        { urls: 'stun:stun.example.test' },
        { urls: ['turn:relay.example.test', 'turns:relay.example.test'] },
      ],
      expiresInSeconds: 28_800,
    });
  },
});
assert.deepEqual(healthy, {
  ok: true,
  origin: 'https://game.example.test',
  signaling: 'distributed-ready',
  relayCount: 2,
  secureRelayCount: 1,
  expiresInSeconds: 28_800,
});
assert.equal(calls.length, 2);
assert.ok(calls.every((call) => call.origin === 'https://game.example.test'));

await assert.rejects(checkProductionMultiplayer({
  fetchImpl: async (url) => String(url).endsWith('/api/signal')
    ? response(200, {
      ok: true, distributed: true,
      redis: { ok: true, command: 'ready', subscriber: 'ready' },
    })
    : response(503, { error: 'turn_service_unconfigured' }),
}), (error) => error.code === 'ice_http_503' &&
  error.detail === 'turn_service_unconfigured');

await assert.rejects(checkProductionMultiplayer({
  fetchImpl: async (url) => String(url).endsWith('/api/signal')
    ? response(200, {
      ok: true, distributed: true,
      redis: { ok: true, command: 'ready', subscriber: 'ready' },
    })
    : response(200, { iceServers: [{ urls: 'stun:stun.example.test' }] }),
}), (error) => error.code === 'turn_relay_missing');

console.log('production-multiplayer-check.selftest: signaling and mandatory TURN gates passed');
