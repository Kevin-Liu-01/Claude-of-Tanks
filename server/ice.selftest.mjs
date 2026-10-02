import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { ICE_CREDENTIAL_MIN_TTL_SECONDS, ICE_CREDENTIAL_TTL_SECONDS, createIceConfigHandler } from '../api/ice.ts';

async function invoke(handler, { method = 'GET', origin = 'https://cot.kevinliu.studio', fetchSite = null } = {}) {
  const headers = new Map();
  let text = '';
  const response = {
    statusCode: 200,
    setHeader(name, value) { headers.set(name.toLowerCase(), value); },
    end(value = '') { text = String(value); },
  };
  const requestHeaders = { origin };
  if (fetchSite !== null) requestHeaders['sec-fetch-site'] = fetchSite;
  await handler({ method, headers: requestHeaders }, response);
  return { status: response.statusCode, headers, body: JSON.parse(text) };
}

const quiet = { warn: () => {} };
const missingWarnings = [];
const missingHandler = createIceConfigHandler({ env: {}, warn: (line) => missingWarnings.push(line) });
const missing = await invoke(missingHandler);
assert.equal(missing.status, 503);
assert.equal(missing.body.error, 'turn_service_unconfigured');
assert.equal(missing.headers.get('access-control-allow-origin'), 'https://cot.kevinliu.studio',
  'allowed cross-origin clients can read retryable/unconfigured error bodies too');
await invoke(missingHandler);
assert.deepEqual(missingWarnings.map((line) => JSON.parse(line)), [{ tag: 'cot-ice', event: 'configuration', error: 'turn_service_unconfigured' }],
  'a configuration fault is logged once per instance, not once per request');

const forbidden = await invoke(createIceConfigHandler({ env: {}, ...quiet }), {
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
  ...quiet,
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
  ...quiet,
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
  ...quiet,
}));
assert.equal(generated.status, 200);
assert.equal(generated.body.expiresInSeconds, ICE_CREDENTIAL_TTL_SECONDS);
assert.equal(generated.body.iceServers.length, 2);
assert.equal(generated.headers.get('cache-control'), 'private, no-store, max-age=0');
assert.equal(generated.headers.get('vary'), 'Origin');

const customHandler = createIceConfigHandler({ env: {
  COT_ALLOWED_ORIGINS: 'https://frontend.example.test',
  COT_TURN_ICE_SERVERS_JSON: JSON.stringify([{ urls: 'turn:turn.example.test:3478' }]),
}, ...quiet });
const custom = await invoke(customHandler, { origin: 'https://frontend.example.test' });
assert.equal(custom.status, 200);
assert.equal(custom.headers.get('access-control-allow-origin'), 'https://frontend.example.test');
assert.equal(custom.headers.get('access-control-allow-credentials'), 'true');
for (const origin of ['https://frontend.example.test.attacker.test', 'null', '*']) {
  const rejected = await invoke(customHandler, { origin });
  assert.equal(rejected.status, 403, 'cross-origin admission uses exact origin equality');
  assert.equal(rejected.headers.has('access-control-allow-origin'), false);
}
assert.equal((await invoke(customHandler, { method: 'POST' })).status, 405,
  'the credential endpoint does not broaden its read-only GET method contract');

// INFRA-P7 (2026-10-01): who may mint relay credentials. A same-origin browser GET carries no Origin but
// `Sec-Fetch-Site: same-origin`; an allow-listed frontend carries its Origin. Anything else is refused — the endpoint
// used to answer an anonymous `curl` with eight hours of TURN access.
const sameOrigin = await invoke(customHandler, { origin: '', fetchSite: 'same-origin' });
assert.equal(sameOrigin.status, 200, 'a same-origin page (Sec-Fetch-Site: same-origin, no Origin) gets its credentials');
assert.equal(sameOrigin.headers.has('access-control-allow-origin'), false, 'a same-origin answer needs no CORS grant');
let anonymousFetches = 0;
const anonymousHandler = createIceConfigHandler({
  env: { COT_CLOUDFLARE_TURN_KEY_ID: 'key-id', COT_CLOUDFLARE_TURN_API_TOKEN: 'secret' },
  fetchImpl: async () => { anonymousFetches += 1; throw new Error('a refused request reached the provider'); },
  ...quiet,
});
for (const [label, options] of [
  ['curl: no Origin, no Sec-Fetch-Site', { origin: '' }],
  ['a cross-site page', { origin: '', fetchSite: 'cross-site' }],
  ['a same-site sibling without Origin', { origin: '', fetchSite: 'same-site' }],
  ['a typed-in navigation', { origin: '', fetchSite: 'none' }],
  ['a foreign Origin claiming same-origin', { origin: 'https://attacker.example', fetchSite: 'same-origin' }],
  ['an opaque origin', { origin: 'null', fetchSite: 'same-origin' }],
]) {
  const refused = await invoke(anonymousHandler, options);
  assert.equal(refused.status, 403, `${label} is refused`);
  assert.equal(refused.body.error, 'origin_forbidden');
  assert.equal(refused.body.iceServers, undefined, `${label} receives no credentials`);
  assert.equal(refused.headers.has('access-control-allow-origin'), false);
}
assert.equal(anonymousFetches, 0, 'a refused request never mints a credential upstream');
assert.equal((await invoke(customHandler, { origin: 'https://cot.kevinliu.studio' })).status, 200,
  'the deployment origins stay admitted by Origin alone (a cross-origin VITE_ICE_CONFIG_URL frontend)');

// The credential lifetime: one hour by default (a connection lives one match; each connect fetches anew),
// COT_TURN_TTL_SECONDS may shorten it to twenty minutes and can no longer lengthen it.
assert.equal(ICE_CREDENTIAL_TTL_SECONDS, 3600);
assert.equal(ICE_CREDENTIAL_MIN_TTL_SECONDS, 1200);
for (const [configured, expected] of [[undefined, 3600], ['28800', 3600], ['86400', 3600], ['1800', 1800], ['60', 1200], ['soon', 3600]]) {
  let requestedTtl = null;
  const ttlHandler = createIceConfigHandler({
    env: { COT_CLOUDFLARE_TURN_KEY_ID: 'key-id', COT_CLOUDFLARE_TURN_API_TOKEN: 'secret',
      ...(configured === undefined ? {} : { COT_TURN_TTL_SECONDS: configured }) },
    fetchImpl: async (_url, init) => {
      requestedTtl = JSON.parse(init.body).ttl;
      return new Response(JSON.stringify({ iceServers: [{ urls: 'turns:turn.cloudflare.com:443?transport=tcp', username: 'u', credential: 'c' }] }), { status: 201 });
    },
    ...quiet,
  });
  const leased = await invoke(ttlHandler, { origin: '', fetchSite: 'same-origin' });
  assert.equal(leased.body.expiresInSeconds, expected, `COT_TURN_TTL_SECONDS=${configured} → ${expected} s`);
  assert.equal(requestedTtl, expected, 'the provider is asked for the same lifetime the client is told');
}
const coturnTtl = await invoke(createIceConfigHandler({
  env: { COT_TURN_URLS: 'turn:turn.internal.test:3478', COT_TURN_SHARED_SECRET: 's', COT_TURN_TTL_SECONDS: '28800' },
  now: () => 100_000_000, ...quiet,
}));
assert.equal(coturnTtl.body.expiresInSeconds, 3600);
assert.match(coturnTtl.body.iceServers[0].username, /^103600:/, 'a coturn username expires with the same one-hour lease');

// Upstream failures leave one structured warning each (status, cause, latency) and never the token or key id.
for (const [label, fetchImpl, expected] of [
  ['an upstream 401', async () => new Response('{"error":"bad token"}', { status: 401 }),
    { error: 'turn_service_unavailable', upstreamStatus: 401, reason: 'http', status: 503 }],
  ['a body that is not JSON', async () => new Response('<html>', { status: 201 }),
    { error: 'turn_service_unavailable', upstreamStatus: 201, reason: 'invalid_json', status: 503 }],
  ['a JSON body without ICE servers', async () => new Response('{"iceServers":[]}', { status: 201 }),
    { error: 'turn_service_invalid', upstreamStatus: 201, reason: 'invalid_body', status: 503 }],
  ['a timeout', async () => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); },
    { error: 'turn_service_unavailable', upstreamStatus: null, reason: 'timeout', status: 503 }],
  ['a network failure', async () => { throw new TypeError('fetch failed'); },
    { error: 'turn_service_unavailable', upstreamStatus: null, reason: 'network', status: 503 }],
]) {
  const warnings = [];
  let clock = 5_000;
  const failing = await invoke(createIceConfigHandler({
    env: { COT_CLOUDFLARE_TURN_KEY_ID: 'key-id-sensitive', COT_CLOUDFLARE_TURN_API_TOKEN: 'token-sensitive' },
    now: () => (clock += 40), fetchImpl, warn: (line) => warnings.push(line),
  }), { origin: '', fetchSite: 'same-origin' });
  assert.equal(failing.status, expected.status, label);
  assert.equal(failing.body.error, expected.error, label);
  assert.equal(warnings.length, 1, `${label}: one warning line`);
  const row = JSON.parse(warnings[0]);
  assert.deepEqual({ tag: row.tag, event: row.event, error: row.error, upstreamStatus: row.upstreamStatus, reason: row.reason },
    { tag: 'cot-ice', event: 'upstream_failure', error: expected.error, upstreamStatus: expected.upstreamStatus, reason: expected.reason }, label);
  assert.ok(Number.isFinite(row.latencyMs) && row.latencyMs >= 0, `${label}: the latency is recorded`);
  assert.doesNotMatch(warnings[0], /sensitive|Bearer|credential/i, `${label}: the line carries no token, key id or credential`);
}

console.log('ice endpoint selftest: self-hosted coturn and optional TURN proxy passed; same-origin or allow-listed callers only, one-hour lease, upstream failures logged');
