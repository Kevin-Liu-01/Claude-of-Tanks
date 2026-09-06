import assert from 'node:assert/strict';
import { createSignalingServer } from '../server/signalingServer.ts';
import { SignalingRoomStore } from '../server/roomStore.ts';
import {
  checkProductionMultiplayer,
  validateCloudflareSignaling,
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

await assert.rejects(checkProductionMultiplayer({
  fetchImpl: async (url) => String(url).endsWith('/api/signal')
    ? { ...response(503, {
      ok: false, distributed: true,
      redis: { ok: false, command: 'unavailable', subscriber: 'polling_fallback',
        code: 'command_timeout', token: 'secret-redis-token' },
      token: 'secret-server-token',
    }), headers: new Headers({ 'x-vercel-id': 'sfo1::safe-request-id', 'x-vercel-cache': 'MISS' }) }
    : response(503, { error: 'turn_service_unconfigured', iceServers: [{
      urls: 'turn:secret.invalid', username: 'secret-user', credential: 'secret-turn-token',
    }] }),
}), (error) => {
  assert.deepEqual(error.dependencies.signal.detail, {
    ok: false, distributed: true,
    redis: { ok: false, command: 'unavailable', subscriber: 'polling_fallback', code: 'command_timeout' },
  });
  assert.equal(error.dependencies.signal.http.requestId, 'sfo1::safe-request-id');
  assert.equal(error.dependencies.signal.http.status, 503);
  assert.doesNotMatch(JSON.stringify(error.dependencies), /secret/,
    'dependency diagnostics never serialize arbitrary Redis or TURN response fields');
  return true;
});

const browserCalls = [];
const allocation = await verifyProductionTurnAllocation({
  baseUrl: 'https://game.example.test/path',
  iceUrl: 'https://credentials.example.test/api/ice',
  launchBrowser: async () => ({
    async createBrowserContext() {
      browserCalls.push('context');
      return {
        async newPage() {
          return {
            async setCacheEnabled(value) { browserCalls.push(['cache', value]); },
            async goto(url) { browserCalls.push(['goto', url]); },
            async evaluate(_probe, options) {
              browserCalls.push(['evaluate', options]);
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
  ['evaluate', { allocationTimeoutMs: 15_000, endpoint: 'https://credentials.example.test/api/ice' }],
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
            async evaluate(_probe, options) {
              assert.equal(options.endpoint, 'https://cot.kevinliu.studio/api/ice',
                'allocation keeps the frontend ICE endpoint unless explicitly overridden');
              throw new Error('TURN returned no relay candidate');
            },
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

for (const signalMode of ['standalone', 'distributed']) {
  await assert.rejects(checkProductionMultiplayer({ signalMode,
    fetchImpl: async (url) => String(url).endsWith('/api/signal')
      ? response(200, { ok: false, rooms: 0, distributed: true,
        redis: { ok: false, command: 'unavailable', subscriber: 'ready' } })
      : response(200, { iceServers: [{ urls: 'turn:relay.example.test' }] }),
  }), (error) => error.code === (signalMode === 'standalone'
    ? 'standalone_signal_not_ready' : 'signal_not_ready'));
}
for (const signal of [
  { ok: true, distributed: true, rooms: 0,
    redis: { ok: true, command: 'ready', subscriber: 'ready' } },
  { ok: true, rooms: 0, redis: null },
  { ok: true },
  { ok: true, rooms: -1 },
  { ok: true, rooms: 0.5 },
]) {
  await assert.rejects(checkProductionMultiplayer({ signalMode: 'standalone',
    fetchImpl: async (url) => String(url).endsWith('/api/signal') ? response(200, signal)
      : response(200, { iceServers: [{ urls: 'turn:relay.example.test' }] }),
  }), (error) => error.code === 'standalone_signal_not_ready',
  'standalone requires its own complete schema, not generic or distributed readiness');
}
await assert.rejects(checkProductionMultiplayer({ signalMode: 'auto' }), /signal mode/);
await assert.rejects(checkProductionMultiplayer({ backendUrl: 'https://user:secret@backend.test' }),
  /credential-free/);
await assert.rejects(checkProductionMultiplayer({ iceUrl: 'https://ice.test/api/ice?secret=bad' }),
  /credential-free/);
await assert.rejects(checkProductionMultiplayer({ backendUrl: 'http://backend.example.test' }),
  /HTTPS frontends/);
await assert.rejects(checkProductionMultiplayer({ timeoutMs: 0 }), /dependency timeout/);

const cloudflareHealth = { ok: true, service: 'cot-signaling', backend: 'durable-object' };
assert.deepEqual(validateCloudflareSignaling({ ...cloudflareHealth,
  token: 'must-not-appear', credentials: { value: 'private-token' } }), cloudflareHealth,
'Durable Object health has a positive service identity and never returns arbitrary response fields');
for (const signal of [null, [], {}, { ok: true },
  { ...cloudflareHealth, ok: false },
  { ...cloudflareHealth, service: 'cot-match' },
  { ...cloudflareHealth, backend: 'redis' },
  { ...cloudflareHealth, redis: null },
  { ...cloudflareHealth, distributed: false },
  { ...cloudflareHealth, rooms: 0 },
]) assert.throws(() => validateCloudflareSignaling(signal),
  (error) => error.code === 'cloudflare_signal_not_ready');
for (const backendUrl of ['', 'https://worker.example.test/rooms', 'https://worker.example.test/path']) {
  await assert.rejects(checkProductionMultiplayer({ signalMode: 'cloudflare', backendUrl }),
    /explicit backend origin|origin without a path/);
}
for (const options of [
  { backendUrl: 'http://worker.example.test' },
  { backendUrl: 'https://worker.example.test', iceUrl: 'http://ice.example.test/api/ice' },
  { backendUrl: 'https://worker.example.test', matchUrl: 'http://match.example.test/healthz' },
]) await assert.rejects(checkProductionMultiplayer({ signalMode: 'cloudflare', ...options }), /HTTPS frontends/);
for (const backendUrl of ['https://user:secret@worker.example.test',
  'https://worker.example.test?token=secret', 'https://worker.example.test/#secret',
  'wss://worker.example.test/rooms']) {
  await assert.rejects(checkProductionMultiplayer({ signalMode: 'cloudflare', backendUrl }), /credential-free/);
}
const cloudflareCalls = [];
await assert.rejects(checkProductionMultiplayer({ baseUrl: 'https://frontend.example.test/path',
  backendUrl: 'https://worker.example.test/', signalMode: 'cloudflare',
  fetchImpl: async (url, options) => {
    cloudflareCalls.push({ url: String(url), origin: options.headers.origin });
    return String(url).endsWith('/healthz')
      ? response(200, { ...cloudflareHealth, ok: false, token: 'must-not-appear' })
      : response(200, { iceServers: [{ urls: 'turn:relay.example.test', credential: 'private-turn' }] });
  },
}), (error) => error.code === 'cloudflare_signal_not_ready' &&
  !error.dependencies.signal.ok && error.dependencies.ice.ok &&
  !JSON.stringify(error.dependencies).includes('must-not-appear'));
assert.deepEqual(cloudflareCalls.map(call => call.url).sort(),
  ['https://frontend.example.test/api/ice', 'https://worker.example.test/healthz'],
  'Cloudflare health uses the explicit Worker origin while TURN stays on the frontend');
assert.ok(cloudflareCalls.every(call => call.origin === 'https://frontend.example.test'));
for (const signalMode of ['distributed', 'standalone']) {
  await assert.rejects(checkProductionMultiplayer({ signalMode,
    fetchImpl: async (url) => String(url).endsWith('/api/signal') ? response(200, cloudflareHealth)
      : response(200, { iceServers: [{ urls: 'turn:relay.example.test' }] }),
  }), (error) => error.code === (signalMode === 'distributed' ? 'signal_not_ready' : 'standalone_signal_not_ready'),
  'a Durable Object health response cannot silently weaken either legacy topology gate');
}

const customIce = await checkProductionMultiplayer({
  iceUrl: 'https://ice.example.test/custom',
  fetchImpl: async (url) => String(url) === 'https://ice.example.test/custom'
    ? response(200, { iceServers: [{ urls: 'turn:relay.example.test' }] })
    : response(200, { ok: true, distributed: true,
      redis: { ok: true, command: 'ready', subscriber: 'ready' } }),
});
assert.equal(customIce.relayCount, 1, 'an explicitly split ICE endpoint is used');
await assert.rejects(checkProductionMultiplayer({ matchUrl: 'https://backend.example.test/healthz/match',
  fetchImpl: async (url) => String(url).endsWith('/healthz/match') ? response(200, { ok: true })
    : String(url).endsWith('/api/signal')
      ? response(200, { ok: true, distributed: true,
        redis: { ok: true, command: 'ready', subscriber: 'ready' } })
      : response(200, { iceServers: [{ urls: 'turn:relay.example.test' }] }),
}), (error) => error.code === 'match_not_ready' && !error.dependencies.match.ok);

// Actual native WebSockets prove private-room writability and cleanup with no
// dedicated service. Only ICE is stubbed; this does not allocate TURN.
const frontend = 'http://frontend.example.test';
const store = new SignalingRoomStore();
const standalone = createSignalingServer({ host: '127.0.0.1', port: 0,
  allowedOrigins: [frontend], store,
  webSocketPaths: ['/api/signal'], healthPaths: ['/healthz/signaling'],
});
const address = await standalone.listen();
const backendUrl = `http://127.0.0.1:${address.port}`;
const splitCalls = [];
const splitFetch = async (url, options) => {
  splitCalls.push({ url: String(url), origin: options.headers.origin });
  if (String(url).startsWith(backendUrl)) return fetch(url, options);
  assert.equal(String(url), `${frontend}/api/ice`, 'TURN remains at the frontend by default');
  return response(200, { iceServers: [{ urls: 'turn:relay.example.test',
    username: 'private-user', credential: 'private-credential' }] });
};
try {
  const standaloneReceipt = await checkProductionMultiplayer({ baseUrl: frontend, backendUrl,
    signalMode: 'standalone', fetchImpl: splitFetch,
    timeoutMs: 2000,
  });
  assert.equal(standaloneReceipt.signaling, 'standalone-ready');
  assert.deepEqual(standaloneReceipt.roomLifecycle,
    { ok: true, created: true, joined: true, relayed: true, resumed: true,
      relayedAfterResume: true, guestLeft: true, hostClosed: true, roomRemoved: true });
  assert.equal('match' in standaloneReceipt, false,
    'standalone private rooms require no dedicated match or ranked service');
  assert.doesNotMatch(JSON.stringify(standaloneReceipt), /private-|must-not-appear|resumeToken|sessionId/);
  assert.equal(store.rooms.size, 0, 'successful write probe removes its exact room');
  assert.equal(store.membership.size, 0, 'successful probe removes both memberships');
  assert.ok(splitCalls.every((call) => call.origin === frontend));
  assert.ok(splitCalls.some((call) => call.url === `${backendUrl}/healthz/signaling`));
  assert.equal(splitCalls.some((call) => call.url === `${backendUrl}/healthz/match`), false,
    'a private-only backend is never probed for an implicit dedicated dependency');

  const legacyMatch = await checkProductionMultiplayer({ baseUrl: frontend, backendUrl,
    signalMode: 'standalone', matchUrl: 'http://legacy-match.example.test/healthz',
    timeoutMs: 2000,
    fetchImpl: async (url, options) => String(url) === 'http://legacy-match.example.test/healthz'
      ? response(200, { ok: true, service: 'cot-match', secret: 'must-not-appear' })
      : splitFetch(url, options),
  });
  assert.deepEqual(legacyMatch.match, { ok: true, service: 'cot-match' },
    'legacy dedicated health remains opt-in through an exact explicit URL');
  assert.doesNotMatch(JSON.stringify(legacyMatch), /must-not-appear/);
  assert.equal(store.rooms.size, 0);
  assert.equal(store.membership.size, 0);

  const originalJoin = store.join;
  store.join = (connection, payload) => {
    if (store.rooms.get(payload.roomCode)?.peers.has(payload.player.id)) {
      throw Object.assign(new Error('private-resume-token'), { code: 'resume_denied' });
    }
    return originalJoin.call(store, connection, payload);
  };
  await assert.rejects(checkProductionMultiplayer({ baseUrl: frontend, backendUrl,
    signalMode: 'standalone', fetchImpl: splitFetch, timeoutMs: 2000,
  }), (error) => error.code === 'room_resume_failed' &&
    error.detail.stage === 'guest_resume' &&
    !JSON.stringify(error.dependencies).includes('private-resume-token'));
  store.join = originalJoin;
  assert.equal(store.rooms.size, 0, 'failed guest resume retains a host able to remove the exact probe room');
  assert.equal(store.membership.size, 0);

  const originalRelay = store.relay;
  store.relay = () => { throw Object.assign(new Error('private-relay-token'), { code: 'relay_refused' }); };
  await assert.rejects(checkProductionMultiplayer({ baseUrl: frontend, backendUrl,
    signalMode: 'standalone', fetchImpl: splitFetch, timeoutMs: 2000,
  }), (error) => error.code === 'room_lifecycle_timeout' &&
    error.detail.stage === 'host_to_guest_relay' &&
    !JSON.stringify(error.dependencies).includes('private-relay-token'));
  store.relay = originalRelay;
  assert.equal(store.rooms.size, 0, 'a healthy endpoint with broken relay fails and removes its probe room');
  assert.equal(store.membership.size, 0);

  store.join = () => { throw Object.assign(new Error('private-provider-message'), { code: 'join_refused' }); };
  await assert.rejects(checkProductionMultiplayer({ baseUrl: frontend, backendUrl,
    signalMode: 'standalone', fetchImpl: splitFetch, timeoutMs: 2000,
  }), (error) => error.code === 'join_refused' &&
    !JSON.stringify(error.dependencies).includes('private-provider-message'));
  store.join = originalJoin;
  assert.equal(store.rooms.size, 0, 'failed join still removes the newly created host room');
  assert.equal(store.membership.size, 0);

  const originalCreate = store.create;
  store.create = () => { throw Object.assign(new Error('private-provider-token'), { code: 'create_refused' }); };
  await assert.rejects(checkProductionMultiplayer({ baseUrl: frontend, backendUrl,
    signalMode: 'standalone', fetchImpl: splitFetch, timeoutMs: 2000,
  }), (error) => error.code === 'create_refused' &&
    !JSON.stringify(error.dependencies).includes('private-provider-token'));
  store.create = originalCreate;
  assert.equal(store.rooms.size, 0, 'HTTP health success cannot replace real create readiness');

  await assert.rejects(checkProductionMultiplayer({ baseUrl: 'http://forbidden.example.test',
    backendUrl, signalMode: 'standalone', timeoutMs: 1000,
    fetchImpl: async (url, options) => String(url).startsWith(backendUrl) ? fetch(url, options)
        : response(200, { iceServers: [{ urls: 'turn:relay.example.test' }] }),
  }), (error) => error.dependencies.signal.ok === false && error.dependencies.ice.ok === true &&
    !('match' in error.dependencies));
  assert.equal(store.rooms.size, 0, 'the real origin gate rejects the probe before room creation');
} finally {
  await standalone.close();
}

console.log('production-multiplayer-check.selftest: signaling, TURN response, and allocation gates passed');
