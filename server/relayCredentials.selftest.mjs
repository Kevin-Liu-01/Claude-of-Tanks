// The relay credential issuer the room hands its seated players' grants from (2026-10-02, docs/MULTIPLAYER-V2.md §13.14;
// the cases of the retired /api/ice minting, moved with it): nothing configured is STUN only, coturn credentials are made
// here with no provider call, Cloudflare Realtime TURN is one generate-ice-servers call per grant (never cached), the
// lease is the hour that COT_TURN_TTL_SECONDS may only shorten, a configuration fault or a failed provider is the STUN
// grant with one structured warning that carries no token, key id or credential.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  RELAY_CREDENTIAL_MIN_TTL_SECONDS, RELAY_CREDENTIAL_TTL_SECONDS, RELAY_PROVIDER_TIMEOUT_MS, createRelayIssuer, pickRelayEnv, relayCredentialTtl,
} from './relayCredentials.ts';
import { ROOM_RELAY_MAX_SERVERS, ROOM_RELAY_REQUEST_TIMEOUT_MS, readRoomRelayPayload } from '../src/mp/room/protocol.ts';

const STUN = 'stun:stun.cloudflare.com:3478';
const noProvider = async () => { throw new Error('unexpected provider call'); };
const quiet = { warn: () => {}, fetchImpl: noProvider };
const cloudflareEnv = { COT_CLOUDFLARE_TURN_KEY_ID: 'key-id', COT_CLOUDFLARE_TURN_API_TOKEN: 'secret-token', COT_STUN_URLS: STUN };
const cloudflareBody = (credential = 'lived') => JSON.stringify({ iceServers: [
  { urls: [STUN, 'stun:stun.cloudflare.com:53'] },
  { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'short', credential },
] });

// ---- nothing configured: the STUN servers alone (or none), never a warning, never a provider call
{
  const warnings = [];
  const bare = createRelayIssuer({ env: {}, fetchImpl: noProvider, warn: (line) => warnings.push(line) });
  assert.equal(bare.source, 'none');
  assert.deepEqual(await bare.issue(), { iceServers: [], relay: false }, 'no STUN configured: host candidates only (a LAN helper)');
  const stunOnly = createRelayIssuer({ env: { COT_STUN_URLS: `${STUN}, stun:stun.l.example.test:19302` }, fetchImpl: noProvider, warn: (line) => warnings.push(line) });
  assert.deepEqual(await stunOnly.issue(), { iceServers: [{ urls: [STUN, 'stun:stun.l.example.test:19302'] }], relay: false });
  assert.deepEqual(await createRelayIssuer({ env: { COT_STUN_URLS: STUN }, ...quiet }).issue(), { iceServers: [{ urls: STUN }], relay: false });
  assert.deepEqual(warnings, [], 'an unconfigured relay is not a fault');
  // a STUN list with a non-STUN entry keeps the STUN entries and says so once
  const mixedWarnings = [];
  const mixed = createRelayIssuer({ env: { COT_STUN_URLS: `${STUN},turn:turn.example.test:3478,https://x.test` }, fetchImpl: noProvider, warn: (line) => mixedWarnings.push(line) });
  assert.deepEqual(await mixed.issue(), { iceServers: [{ urls: STUN }], relay: false });
  await mixed.issue();
  assert.deepEqual(mixedWarnings.map((line) => JSON.parse(line)), [{ tag: 'cot-relay', event: 'configuration', error: 'stun_configuration_invalid' }]);
}

// ---- self-hosted coturn: expiring HMAC credentials made here, no provider call
{
  const issuer = createRelayIssuer({
    env: { COT_TURN_URLS: 'turn:turn.internal.test:3478,turns:turn.internal.test:5349', COT_TURN_SHARED_SECRET: 'local-coturn-secret', COT_TURN_USERNAME: 'self host!', COT_TURN_TTL_SECONDS: '3600', COT_STUN_URLS: STUN },
    now: () => 100_000_000, ...quiet,
  });
  assert.equal(issuer.source, 'coturn');
  const grant = await issuer.issue();
  assert.deepEqual(grant.iceServers.map((server) => server.urls), [['turn:turn.internal.test:3478', 'turns:turn.internal.test:5349']]);
  assert.equal(grant.iceServers[0].username, '103600:selfhost', 'the label keeps [a-z0-9_.-] only');
  assert.equal(grant.iceServers[0].credential, createHmac('sha1', 'local-coturn-secret').update('103600:selfhost').digest('base64'), 'coturn use-auth-secret: base64(HMAC-SHA1(secret, username))');
  assert.equal(grant.relay, true);
  assert.equal(grant.expiresInSeconds, 3600);
  assert.doesNotThrow(() => readRoomRelayPayload(grant), 'the grant is what the room answers');
  // an eight-hour ask is the hour: the username expires with the same lease
  const capped = await createRelayIssuer({ env: { COT_TURN_URLS: 'turn:turn.internal.test:3478', COT_TURN_SHARED_SECRET: 's', COT_TURN_TTL_SECONDS: '28800' }, now: () => 100_000_000, ...quiet }).issue();
  assert.equal(capped.expiresInSeconds, 3600);
  assert.match(capped.iceServers[0].username, /^103600:cot$/);
  // incomplete: a fault, once per issuer, and the STUN grant
  for (const env of [{ COT_TURN_URLS: 'turn:turn.internal.test:3478' }, { COT_TURN_SHARED_SECRET: 's' }, { COT_TURN_URLS: 'stun:x.test', COT_TURN_SHARED_SECRET: 's' }]) {
    const warnings = [];
    const broken = createRelayIssuer({ env: { ...env, COT_STUN_URLS: STUN }, fetchImpl: noProvider, warn: (line) => warnings.push(line) });
    assert.equal(broken.source, 'none');
    assert.deepEqual(await broken.issue(), { iceServers: [{ urls: STUN }], relay: false }, `${JSON.stringify(env)}: the STUN grant`);
    await broken.issue();
    assert.deepEqual(warnings.map((line) => JSON.parse(line)), [{ tag: 'cot-relay', event: 'configuration', error: 'turn_configuration_invalid' }], 'one warning per issuer');
  }
}

// ---- Cloudflare Realtime TURN: one generate-ice-servers call per grant, the token as a bearer, the lease asked for
{
  const calls = [];
  const issuer = createRelayIssuer({
    env: cloudflareEnv, warn: () => { throw new Error('no warning on success'); },
    fetchImpl: async (url, init) => { calls.push({ url, init }); return new Response(cloudflareBody(`cred-${calls.length}`), { status: 201 }); },
  });
  assert.equal(issuer.source, 'cloudflare');
  const first = await issuer.issue();
  const second = await issuer.issue();
  assert.equal(calls.length, 2, 'every grant is its own provider call: nothing is cached between requests (or seats)');
  assert.equal(calls[0].url, 'https://rtc.live.cloudflare.com/v1/turn/keys/key-id/credentials/generate-ice-servers');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.authorization, 'Bearer secret-token');
  assert.equal(calls[0].init.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(calls[0].init.body), { ttl: RELAY_CREDENTIAL_TTL_SECONDS });
  assert.ok(calls[0].init.signal instanceof AbortSignal, 'the provider call is bounded');
  assert.ok(RELAY_PROVIDER_TIMEOUT_MS < ROOM_RELAY_REQUEST_TIMEOUT_MS, 'the provider budget fits inside the client\'s request budget');
  assert.deepEqual(first, {
    iceServers: [{ urls: [STUN, 'stun:stun.cloudflare.com:53'] }, { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'short', credential: 'cred-1' }],
    relay: true, expiresInSeconds: 3600,
  });
  assert.equal(second.iceServers[1].credential, 'cred-2');
  assert.doesNotThrow(() => readRoomRelayPayload(first));
  // a key id without its token (or the reverse) is a fault, not a provider call
  for (const env of [{ COT_CLOUDFLARE_TURN_KEY_ID: 'key-id' }, { COT_CLOUDFLARE_TURN_API_TOKEN: 'secret-token' }]) {
    const warnings = [];
    assert.deepEqual(await createRelayIssuer({ env, fetchImpl: noProvider, warn: (line) => warnings.push(line) }).issue(), { iceServers: [], relay: false });
    assert.deepEqual(warnings.map((line) => JSON.parse(line).error), ['turn_configuration_invalid']);
  }
}

// ---- fixed servers (another provider) win over the rest; a malformed list is a fault
{
  const fixed = createRelayIssuer({ env: { ...cloudflareEnv, COT_TURN_ICE_SERVERS_JSON: JSON.stringify([{ urls: 'turn:turn.example.test:3478', username: 'u', credential: 'c' }]) }, ...quiet });
  assert.equal(fixed.source, 'static');
  assert.deepEqual(await fixed.issue(), { iceServers: [{ urls: 'turn:turn.example.test:3478', username: 'u', credential: 'c' }], relay: true }, 'fixed credentials do not expire here');
  for (const json of ['{', '[]', '[{"urls":"https://x.test"}]', JSON.stringify(Array.from({ length: ROOM_RELAY_MAX_SERVERS + 1 }, () => ({ urls: STUN })))]) {
    const warnings = [];
    const broken = createRelayIssuer({ env: { COT_TURN_ICE_SERVERS_JSON: json, COT_STUN_URLS: STUN }, fetchImpl: noProvider, warn: (line) => warnings.push(line) });
    assert.deepEqual(await broken.issue(), { iceServers: [{ urls: STUN }], relay: false }, `${json.slice(0, 24)}: the STUN grant`);
    assert.equal(JSON.parse(warnings[0]).error, 'turn_configuration_invalid');
  }
}

// ---- the lease: one hour by default; COT_TURN_TTL_SECONDS may shorten it to twenty minutes and never lengthen it
assert.equal(RELAY_CREDENTIAL_TTL_SECONDS, 3600);
assert.equal(RELAY_CREDENTIAL_MIN_TTL_SECONDS, 1200);
for (const [configured, expected] of [[undefined, 3600], ['28800', 3600], ['86400', 3600], ['1800', 1800], ['60', 1200], ['soon', 3600], ['', 3600]]) {
  const env = { ...cloudflareEnv, ...(configured === undefined ? {} : { COT_TURN_TTL_SECONDS: configured }) };
  assert.equal(relayCredentialTtl(env), expected, `COT_TURN_TTL_SECONDS=${configured} → ${expected} s`);
  let asked = null;
  const grant = await createRelayIssuer({ env, ...quiet, fetchImpl: async (_url, init) => { asked = JSON.parse(init.body).ttl; return new Response(cloudflareBody(), { status: 201 }); } }).issue();
  assert.equal(asked, expected, 'the provider is asked for the lease the grant names');
  assert.equal(grant.expiresInSeconds, expected);
}

// ---- a failing provider: the STUN grant and one structured line (status, cause, latency), never a token or key id
for (const [label, fetchImpl, expected] of [
  ['an upstream 401', async () => new Response('{"error":"bad token"}', { status: 401 }), { error: 'turn_service_unavailable', upstreamStatus: 401, reason: 'http' }],
  ['a body that is not JSON', async () => new Response('<html>', { status: 201 }), { error: 'turn_service_unavailable', upstreamStatus: 201, reason: 'invalid_json' }],
  ['a JSON body without ICE servers', async () => new Response('{"iceServers":[]}', { status: 201 }), { error: 'turn_service_invalid', upstreamStatus: 201, reason: 'invalid_body' }],
  ['a server list past the bound', async () => new Response(JSON.stringify({ iceServers: Array.from({ length: ROOM_RELAY_MAX_SERVERS + 1 }, () => ({ urls: STUN })) }), { status: 201 }), { error: 'turn_service_invalid', upstreamStatus: 201, reason: 'invalid_body' }],
  ['a timeout', async () => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); }, { error: 'turn_service_unavailable', upstreamStatus: null, reason: 'timeout' }],
  ['a network failure', async () => { throw new TypeError('fetch failed'); }, { error: 'turn_service_unavailable', upstreamStatus: null, reason: 'network' }],
]) {
  const warnings = [];
  let clock = 5_000;
  const grant = await createRelayIssuer({
    env: { COT_CLOUDFLARE_TURN_KEY_ID: 'key-id-sensitive', COT_CLOUDFLARE_TURN_API_TOKEN: 'token-sensitive', COT_STUN_URLS: STUN },
    now: () => (clock += 40), fetchImpl, warn: (line) => warnings.push(line),
  }).issue();
  assert.deepEqual(grant, { iceServers: [{ urls: STUN }], relay: false }, `${label}: the joiner gets the STUN grant, never an error`);
  assert.equal(warnings.length, 1, `${label}: one warning line`);
  const row = JSON.parse(warnings[0]);
  assert.deepEqual({ tag: row.tag, event: row.event, error: row.error, upstreamStatus: row.upstreamStatus, reason: row.reason },
    { tag: 'cot-relay', event: 'upstream_failure', ...expected }, label);
  assert.ok(Number.isFinite(row.latencyMs) && row.latencyMs >= 0, `${label}: the latency is recorded`);
  assert.doesNotMatch(warnings[0], /sensitive|Bearer|credential/i, `${label}: the line carries no token, key id or credential`);
}

// ---- the names the issuer reads, from a wider environment (the Worker's bindings, process.env): strings only
assert.deepEqual(pickRelayEnv({ COT_CLOUDFLARE_TURN_KEY_ID: 'k', COT_CLOUDFLARE_TURN_API_TOKEN: 't', COT_STUN_URLS: STUN, MATCH_SEAT_SECRET: 'not mine', ROOMS: {}, COT_TURN_TTL_SECONDS: 1200 }),
  { COT_CLOUDFLARE_TURN_KEY_ID: 'k', COT_CLOUDFLARE_TURN_API_TOKEN: 't', COT_STUN_URLS: STUN });

console.log('relayCredentials.selftest: STUN-only when unconfigured, coturn made locally, one Cloudflare call per grant (never cached), the one-hour lease, failures degrade to STUN with one secret-free line');
