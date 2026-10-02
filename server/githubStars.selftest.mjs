import assert from 'node:assert/strict';
import { createGitHubStarsHandler } from '../api/github-stars.ts';

async function invoke(handler, method = 'GET') {
  const headers = new Map();
  let text = '';
  const response = {
    statusCode: 200,
    setHeader(name, value) { headers.set(name.toLowerCase(), value); },
    end(value = '') { text = String(value); },
  };
  await handler({ method, headers: {} }, response);
  return { status: response.statusCode, headers, body: JSON.parse(text) };
}

const live = await invoke(createGitHubStarsHandler({
  fetchImpl: async (url, init) => {
    assert.equal(url, 'https://api.github.com/repos/Kevin-Liu-01/claude-of-tanks');
    assert.equal(init.headers.Accept, 'application/vnd.github+json');
    return new Response(JSON.stringify({ stargazers_count: 321 }), { status: 200 });
  },
}));
assert.equal(live.status, 200);
assert.equal(live.body.stargazers_count, 321);
assert.match(live.headers.get('cache-control'), /s-maxage=900/);
assert.match(live.headers.get('cache-control'), /stale-while-revalidate=86400/);

const forbiddenMethod = await invoke(createGitHubStarsHandler(), 'POST');
assert.equal(forbiddenMethod.status, 405);
assert.equal(forbiddenMethod.headers.get('allow'), 'GET');

// INFRA-P7 (2026-10-01): every failed upstream call leaves one structured warning — GitHub's status, its rate-limit
// budget (unauthenticated calls share Vercel's egress addresses), the cause and the latency.
const warnings = [];
const warn = (line) => warnings.push(JSON.parse(line));
let clock = 1_000;
const now = () => (clock += 25);

const rateLimited = await invoke(createGitHubStarsHandler({
  fetchImpl: async () => new Response('{}', { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1790000000' } }),
  warn, now,
}));
assert.equal(rateLimited.status, 503);
assert.equal(rateLimited.body.error, 'github_unavailable');
assert.equal(rateLimited.headers.get('cache-control'), 'private, no-store, max-age=0');
assert.deepEqual(warnings.at(-1), {
  tag: 'cot-github-stars', event: 'upstream_failure', error: 'github_unavailable', upstreamStatus: 403, reason: 'http',
  rateLimitRemaining: '0', rateLimitReset: '1790000000', latencyMs: 25,
}, 'a refused budget is visible as such');

const invalid = await invoke(createGitHubStarsHandler({
  fetchImpl: async () => new Response(JSON.stringify({ stargazers_count: '321' }), { status: 200 }),
  warn, now,
}));
assert.equal(invalid.status, 503);
assert.equal(invalid.body.error, 'github_response_invalid');
assert.equal(warnings.at(-1).reason, 'invalid_body');
assert.equal(warnings.at(-1).upstreamStatus, 200);

for (const [label, fetchImpl, reason, upstreamStatus] of [
  ['a timeout', async () => { throw new DOMException('timed out', 'TimeoutError'); }, 'timeout', null],
  ['a network failure', async () => { throw new TypeError('fetch failed'); }, 'network', null],
  ['a body that is not JSON', async () => new Response('<html>', { status: 200 }), 'invalid_json', 200],
]) {
  const failed = await invoke(createGitHubStarsHandler({ fetchImpl, warn, now }));
  assert.equal(failed.status, 503, label);
  assert.equal(failed.body.error, 'github_unavailable', label);
  assert.equal(warnings.at(-1).reason, reason, label);
  assert.equal(warnings.at(-1).upstreamStatus, upstreamStatus, label);
}
const before = warnings.length;
await invoke(createGitHubStarsHandler({
  fetchImpl: async () => new Response(JSON.stringify({ stargazers_count: 7 }), { status: 200 }), warn, now,
}));
assert.equal(warnings.length, before, 'a healthy answer logs nothing');

console.log('github stars endpoint selftest: live count, edge cache, failure fallback and structured upstream warnings passed');
