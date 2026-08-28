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

const rateLimited = await invoke(createGitHubStarsHandler({
  fetchImpl: async () => new Response('{}', { status: 403 }),
}));
assert.equal(rateLimited.status, 503);
assert.equal(rateLimited.body.error, 'github_unavailable');
assert.equal(rateLimited.headers.get('cache-control'), 'private, no-store, max-age=0');

const invalid = await invoke(createGitHubStarsHandler({
  fetchImpl: async () => new Response(JSON.stringify({ stargazers_count: '321' }), { status: 200 }),
}));
assert.equal(invalid.status, 503);
assert.equal(invalid.body.error, 'github_response_invalid');

console.log('github stars endpoint selftest: live count, edge cache, and failure fallback passed');
