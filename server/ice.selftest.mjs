// The deprecated `/api/ice` (2026-10-02, docs/MULTIPLAYER-V2.md §13.14): relay credentials are minted inside the room
// for its seated players (server/relayCredentials.selftest.mjs, the Worker's test/relay.test.ts), so the public route
// mints none. It answers the official STUN servers alone — what a tab loaded before the move needs to keep its direct
// paths — reads no environment, holds no secret, calls no provider; the new client never calls it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import handler from '../api/ice.ts';
import { OFFICIAL_STUN_URLS } from '../api/_lib/policy.ts';
import { readRoomIceServer, hasRoomRelayServer } from '../src/mp/room/protocol.ts';

function invoke(method = 'GET', headers = {}) {
  const sent = new Map();
  let text = '';
  const response = {
    statusCode: 200,
    setHeader(name, value) { sent.set(name.toLowerCase(), value); },
    end(value = '') { text = String(value); },
  };
  handler({ method, headers }, response);
  return { status: response.statusCode, headers: sent, body: JSON.parse(text) };
}

const fetches = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (...args) => { fetches.push(args); throw new Error('the deprecated route calls no provider'); };
try {
  for (const headers of [{}, { origin: 'https://cot.kevinliu.studio' }, { 'sec-fetch-site': 'same-origin' }, { origin: 'https://attacker.example' }]) {
    const answer = invoke('GET', headers);
    assert.equal(answer.status, 200, 'any GET is answered: the STUN list is public');
    assert.deepEqual(answer.body.iceServers, [{ urls: [...OFFICIAL_STUN_URLS] }]);
    assert.equal(answer.body.relayOnly, false);
    const servers = answer.body.iceServers.map(readRoomIceServer);
    assert.ok(servers.every(Boolean), 'the answer is a well-formed server list (a pre-move client validates it the same way)');
    assert.equal(hasRoomRelayServer(servers), false, 'no TURN server');
    assert.ok(answer.body.iceServers.every((server) => server.username === undefined && server.credential === undefined), 'no credential');
    assert.equal(answer.body.expiresInSeconds, undefined);
    assert.equal(answer.headers.get('cache-control'), 'private, no-store, max-age=0');
    assert.equal(answer.headers.has('access-control-allow-origin'), false, 'no cross-origin grant');
  }
  const post = invoke('POST');
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('allow'), 'GET');
  assert.equal(fetches.length, 0, 'no provider call');
} finally {
  globalThis.fetch = realFetch;
}

const source = readFileSync(new URL('../api/ice.ts', import.meta.url), 'utf8');
assert.doesNotMatch(source, /process\.env|COT_[A-Z_]+|TURN_|createHmac|rtc\.live\.cloudflare\.com|fetch\(/, 'the route reads no relay configuration and mints nothing');
assert.match(source, /DEPRECATED/, 'the route says it is deprecated');
assert.deepEqual([...OFFICIAL_STUN_URLS].every((url) => /^stun:/.test(url)), true);

console.log('ice selftest: /api/ice is deprecated — the official STUN servers alone, no environment, no credential, no provider call');
