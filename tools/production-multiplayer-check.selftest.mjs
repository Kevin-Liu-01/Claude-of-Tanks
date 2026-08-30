import assert from 'node:assert/strict';
import {
  checkProductionMultiplayer,
  verifyProductionTurnAllocation,
} from './production-multiplayer-check.mjs';

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
  error.detail === 'turn_service_unconfigured' &&
  error.dependencies.signal.ok === true && error.dependencies.ice.ok === false);

await assert.rejects(checkProductionMultiplayer({
  fetchImpl: async (url) => String(url).endsWith('/api/signal')
    ? response(200, {
      ok: true, distributed: true,
      redis: { ok: true, command: 'ready', subscriber: 'ready' },
    })
    : response(200, { iceServers: [{ urls: 'stun:stun.example.test' }] }),
}), (error) => error.code === 'turn_relay_missing');

await assert.rejects(checkProductionMultiplayer({
  fetchImpl: async (url) => String(url).endsWith('/api/signal')
    ? response(500, { error: 'function_invocation_failed' })
    : response(503, { error: 'turn_service_unconfigured' }),
}), (error) => error.code === 'production_dependencies_failed' &&
  error.detail.signal.code === 'signal_http_500' &&
  error.detail.signal.detail === 'function_invocation_failed' &&
  error.detail.ice.code === 'ice_http_503' &&
  error.detail.ice.detail === 'turn_service_unconfigured');

const browserCalls = [];
const allocation = await verifyProductionTurnAllocation({
  baseUrl: 'https://game.example.test/path',
  launchBrowser: async () => ({
    async createBrowserContext() {
      browserCalls.push('context');
      return {
        async newPage() {
          return {
            async setCacheEnabled(value) { browserCalls.push(['cache', value]); },
            async goto(url) { browserCalls.push(['goto', url]); },
            async evaluate(_probe, timeoutMs) {
              browserCalls.push(['evaluate', timeoutMs]);
              return { relayCandidateCount: 2, protocols: ['tcp', 'udp'] };
            },
          };
        },
        async close() { browserCalls.push('context-close'); },
      };
    },
    async close() { browserCalls.push('browser-close'); },
  }),
});
assert.deepEqual(allocation, {
  ok: true,
  relayCandidateCount: 2,
  protocols: ['tcp', 'udp'],
  pristineBrowserContext: true,
});
assert.deepEqual(browserCalls, [
  'context',
  ['cache', false],
  ['goto', 'https://game.example.test/robots.txt?cot-turn-allocation-probe=1'],
  ['evaluate', 15_000],
  'context-close',
  'browser-close',
]);

const failedBrowserCalls = [];
await assert.rejects(verifyProductionTurnAllocation({
  launchBrowser: async () => ({
    async createBrowserContext() {
      return {
        async newPage() {
          return {
            async goto() {},
            async evaluate() { throw new Error('TURN returned no relay candidate'); },
          };
        },
        async close() { failedBrowserCalls.push('context-close'); },
      };
    },
    async close() { failedBrowserCalls.push('browser-close'); },
  }),
}), (error) => error.code === 'turn_allocation_failed' &&
  /no relay candidate/.test(error.message));
assert.deepEqual(failedBrowserCalls, ['context-close', 'browser-close']);

console.log('production-multiplayer-check.selftest: signaling, TURN response, and allocation gates passed');
