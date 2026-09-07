import assert from 'node:assert/strict';
import { resolveSignalUrl, resolveMatchServiceUrl, resolveIceConfigUrl } from './signalEndpoint.ts';
import { createRankedServiceClient, rankedMatchWebSocketUrl } from './rankedServiceClient.ts';

const page = { protocol: 'https:', hostname: 'claude-of-tanks.vercel.app' };
const signalUrl = resolveSignalUrl({ ...page, configured: 'wss://backend.example.test/api/signal' });
const rankedUrl = resolveMatchServiceUrl({ ...page, configured: 'https://backend.example.test' });
assert.equal(signalUrl, 'wss://backend.example.test/api/signal');
assert.equal(rankedUrl, 'https://backend.example.test');
assert.equal(rankedMatchWebSocketUrl(rankedUrl), 'wss://backend.example.test/match');
assert.equal(rankedMatchWebSocketUrl('https://backend.example.test/game/'),
  'wss://backend.example.test/game/match', 'an explicitly configured proxy prefix is preserved');

const calls = [];
const ranked = createRankedServiceClient({ url: rankedUrl, storage: undefined,
  fetchImpl: async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ playerId: 'external', token: 'external-identity' }));
  } });
await ranked.ensureIdentity('External');
assert.equal(calls[0].url, 'https://backend.example.test/ranked/identity');
assert.equal(calls[0].init.method, 'POST');
assert.equal(ranked.webSocketUrl, 'wss://backend.example.test/match');
assert.equal(resolveIceConfigUrl(page), '/api/ice',
  'external signaling/ranked configuration does not move frontend-owned TURN credentials');
assert.equal(resolveIceConfigUrl({ protocol: 'http:' }), '',
  'local development does not contact a credential provider implicitly');
for (const configured of ['/api/ice', './ice', 'https://ice.example.test/api/ice', '//ice.example.test/api/ice']) {
  assert.equal(resolveIceConfigUrl({ ...page, configured }), configured);
}
assert.throws(() => resolveIceConfigUrl({ ...page, configured: 'http://ice.example.test/api/ice' }),
  /mixed content/);
assert.throws(() => resolveIceConfigUrl({ ...page, configured: 'wss://ice.example.test/api/ice' }),
  /must use http/);
assert.throws(() => resolveIceConfigUrl({ ...page, configured: 'https://user:secret@ice.example.test/api/ice' }),
  /credentials/);
assert.throws(() => resolveIceConfigUrl({ ...page, configured: '/api/ice#secret' }), /fragment/);
assert.throws(() => resolveIceConfigUrl({ ...page, configured: '/api/ice#' }), /fragment/);

for (const [resolve, insecure, wrongScheme] of [
  [resolveSignalUrl, 'ws://backend.example.test/api/signal', 'https://backend.example.test/api/signal'],
  [resolveMatchServiceUrl, 'http://backend.example.test', 'wss://backend.example.test'],
]) {
  assert.throws(() => resolve({ ...page, configured: insecure }), /secure|https|mixed/i,
    'an HTTPS frontend rejects a backend endpoint browsers would block as mixed content');
  assert.throws(() => resolve({ ...page, configured: wrongScheme }), /scheme|protocol|must use/i);
  assert.throws(() => resolve({ ...page, configured: 'not a URL' }), /URL/i);
  assert.throws(() => resolve({ ...page, configured:
    `${resolve === resolveSignalUrl ? 'wss' : 'https'}://user:secret@backend.example.test` }),
  /credential|username|password/i, 'frontend endpoint configuration must not embed credentials');
  assert.throws(() => resolve({ ...page, configured:
    `${resolve === resolveSignalUrl ? 'wss' : 'https'}://backend.example.test/#fragment` }),
  /fragment|hash/i);
  assert.equal(resolve({ protocol: 'http:', configured: insecure }), insecure,
    'explicit unencrypted endpoints remain available to local HTTP development');
}

console.log('signalEndpoint.selftest: external signaling and ranked routes, TLS and credentials passed');
