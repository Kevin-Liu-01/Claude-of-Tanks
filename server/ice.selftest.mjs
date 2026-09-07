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
assert.equal(missing.headers.get('access-control-allow-origin'), 'https://cot.kevinliu.studio',
  'allowed cross-origin clients can read retryable/unconfigured error bodies too');

const forbidden = await invoke(createIceConfigHandler({ env: {} }), {
  origin: 'https://attacker.example',
});
assert.equal(forbidden.status, 403);
assert.equal(forbidden.headers.has('access-control-allow-origin'), false);
assert.equal(forbidden.headers.has('access-control-allow-credentials'), false);
assert.equal(forbidden.body.iceServers, undefined, 'forbidden origins receive no TURN credentials');

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
assert.equal(selfHosted.headers.get('access-control-allow-origin'), 'https://cot.kevinliu.studio',
  'an allowed cross-origin frontend can read its TURN credential response');
assert.equal(selfHosted.headers.get('access-control-allow-credentials'), 'true',
  'the endpoint matches loadIceConfiguration credentials: include');
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
assert.equal(generated.headers.get('vary'), 'Origin');

const customHandler = createIceConfigHandler({ env: {
  COT_ALLOWED_ORIGINS: 'https://frontend.example.test',
  COT_TURN_ICE_SERVERS_JSON: JSON.stringify([{ urls: 'turn:turn.example.test:3478' }]),
} });
const custom = await invoke(customHandler, { origin: 'https://frontend.example.test' });
assert.equal(custom.status, 200);
assert.equal(custom.headers.get('access-control-allow-origin'), 'https://frontend.example.test');
assert.equal(custom.headers.get('access-control-allow-credentials'), 'true');
for (const origin of ['https://frontend.example.test.attacker.test', 'null', '*']) {
  const rejected = await invoke(customHandler, { origin });
  assert.equal(rejected.status, 403, 'cross-origin admission uses exact origin equality');
  assert.equal(rejected.headers.has('access-control-allow-origin'), false);
}
const sameOrigin = await invoke(customHandler, { origin: '' });
assert.equal(sameOrigin.status, 200);
assert.equal(sameOrigin.headers.has('access-control-allow-origin'), false);
assert.equal((await invoke(customHandler, { method: 'POST' })).status, 405,
  'the credential endpoint does not broaden its read-only GET method contract');

console.log('ice endpoint selftest: self-hosted coturn and optional TURN proxy passed');
