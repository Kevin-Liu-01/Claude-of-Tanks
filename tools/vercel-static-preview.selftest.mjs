// tools/vercel-static-preview.mjs (2026-10-22, nav-perf-240): a built dist answered the way production answers it,
// so a recorded navigation pays the round trips and bytes a visitor pays. A fixture dist on a free port.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createStaticPreview } from './vercel-static-preview.mjs';

const dist = mkdtempSync(join(tmpdir(), 'cot-static-preview-'));
const files = {
  'index.html': '<!doctype html><title>game</title>', 'home.html': `<!doctype html><title>home</title>${'x'.repeat(2000)}`,
  'gallery.html': '<!doctype html><title>gallery</title>', 'docs-build.html': '<!doctype html><title>build</title>',
  '404.html': '<!doctype html><title>404</title>', 'assets/main-a1b2c3d4.js': `export const x = 1;${' '.repeat(2000)}`,
  'media/site50-r14/stills/s01.webp': 'webp', 'media/site50-r14/archive.json': '{"shots":[]}',
};
for (const [path, body] of Object.entries(files)) {
  mkdirSync(dirname(join(dist, path)), { recursive: true });
  writeFileSync(join(dist, path), body);
}
const server = await createStaticPreview({ dist, apiLatencyMs: 0 });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const get = (path, headers = {}) => fetch(`${origin}${path}`, { headers: { accept: 'text/html', ...headers }, redirect: 'manual' });
try {
  const home = await get('/home', { 'accept-encoding': 'br' });
  assert.equal(home.status, 200);
  assert.equal(home.headers.get('cache-control'), 'public, max-age=0, must-revalidate', 'documents keep Vercel\'s default');
  assert.equal(home.headers.get('content-encoding'), 'br', 'text is compressed as Vercel compresses it');
  assert.match(await home.text(), /<title>home<\/title>/);
  const revalidated = await get('/home', { 'if-none-match': home.headers.get('etag') });
  assert.equal(revalidated.status, 304, 'a warm document revalidates with a 304');
  assert.equal((await get('/gallery')).headers.get('cache-control'), 'private, no-store, max-age=0', 'vercel.json\'s gallery rule');
  assert.equal((await get('/docs/build')).status, 200, 'vercel.json\'s topic rewrite');
  assert.equal((await get('/assets/main-a1b2c3d4.js')).headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.equal((await get('/media/site50-r14/stills/s01.webp')).headers.get('cache-control'), 'public, max-age=3600, stale-while-revalidate=86400');
  assert.equal((await get('/media/site50-r14/archive.json')).headers.get('cache-control'), 'public, max-age=60, stale-while-revalidate=3600');
  const miss = await get('/assets/main-zzzzzzzz.js');
  assert.equal(miss.status, 404);
  assert.equal(miss.headers.get('cache-control'), 'public, max-age=0, must-revalidate', 'a miss is never cacheable');
  const slash = await get('/home/');
  assert.deepEqual([slash.status, slash.headers.get('location')], [308, '/home'], 'vercel.json\'s trailing-slash redirect');
  const stars = await get('/api/github-stars', { accept: 'application/json' });
  assert.deepEqual(await stars.json(), { stargazers_count: 128 });
  assert.match(stars.headers.get('cache-control'), /s-maxage=900/, 'the function\'s own Cache-Control');
  assert.equal((await fetch(`${origin}/api/telemetry`, { method: 'POST', body: '{}' })).status, 204);
} finally {
  server.close();
  rmSync(dist, { recursive: true, force: true });
}
console.log('vercel-static-preview.selftest: vercel.json routes, the deploy\'s cache families, 304 revalidation, brotli and the three function stand-ins');
