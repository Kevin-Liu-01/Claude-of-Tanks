import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createIceConfigHandler } from '../api/ice.ts';

async function invoke(handler, { method = 'GET', origin = 'https://cot.kevinliu.studio' } = {}) {
  const headers = new Map();
  let text = '';
  const response = {
    statusCode: 200,
    setHeader(name, value) { headers.set(name.toLowerCase(), value); },
    end(value = '') { text = String(value); },
  };
  await handler({ method, headers: { origin } }, response);
  return { status: response.statusCode, headers, body: JSON.parse(text) };
}

const missing = await invoke(createIceConfigHandler({ env: {} }));
assert.equal(missing.status, 503);
assert.equal(missing.body.error, 'turn_service_unconfigured');

const forbidden = await invoke(createIceConfigHandler({ env: {} }), {
  origin: 'https://attacker.example',
});
assert.equal(forbidden.status, 403);

let selfHostedFetches = 0;
const selfHosted = await invoke(createIceConfigHandler({
  env: {
    COT_TURN_URLS: 'turn:turn.internal.test:3478,turns:turn.internal.test:5349',
    COT_TURN_SHARED_SECRET: 'local-coturn-secret',
    COT_TURN_USERNAME: 'self-host',
    COT_TURN_TTL_SECONDS: '3600',
  },
  now: () => 100_000_000,
  fetchImpl: async () => { selfHostedFetches += 1; throw new Error('unexpected provider call'); },
}));
assert.equal(selfHosted.status, 200);
assert.equal(selfHostedFetches, 0, 'self-hosted coturn credentials never call a hosted provider');
assert.equal(selfHosted.body.expiresInSeconds, 3600);
assert.deepEqual(selfHosted.body.iceServers[0].urls, [
  'turn:turn.internal.test:3478', 'turns:turn.internal.test:5349',
]);
assert.equal(selfHosted.body.iceServers[0].username, '103600:self-host');
assert.equal(selfHosted.body.iceServers[0].credential,
  createHmac('sha1', 'local-coturn-secret').update('103600:self-host').digest('base64'));

const incompleteSelfHost = await invoke(createIceConfigHandler({
  env: { COT_TURN_URLS: 'turn:turn.internal.test:3478' },
}));
assert.equal(incompleteSelfHost.status, 503);
assert.equal(incompleteSelfHost.body.error, 'turn_configuration_invalid');

const generated = await invoke(createIceConfigHandler({
  env: {
    COT_CLOUDFLARE_TURN_KEY_ID: 'key-id',
    COT_CLOUDFLARE_TURN_API_TOKEN: 'secret',
  },
  fetchImpl: async (url, init) => {
    assert.match(url, /key-id\/credentials\/generate-ice-servers$/);
    assert.equal(init.headers.authorization, 'Bearer secret');
    return new Response(JSON.stringify({
      iceServers: [
        { urls: ['stun:stun.cloudflare.com:3478'] },
        { urls: ['turns:turn.cloudflare.com:443?transport=tcp'], username: 'short', credential: 'lived' },
      ],
    }), { status: 201 });
  },
}));
assert.equal(generated.status, 200);
assert.equal(generated.body.expiresInSeconds, 28800);
assert.equal(generated.body.iceServers.length, 2);
assert.equal(generated.headers.get('cache-control'), 'private, no-store, max-age=0');

console.log('ice endpoint selftest: self-hosted coturn and optional TURN proxy passed');
