// The middleware diet (INFRA-P13 / FE-P26, 2026-10-01). The Node middleware is transpiled file by file (no bundle), and
// its static imports loaded the site-metadata, localized-HTML and locale-routing modules — with the i18n catalogs —
// on every matched request, although the plain game document and the gallery only need the deployment pin. Those
// modules now load on the first request that needs them: a `?room=` link, the studio, or a `/cn` document.
// Part 1 pins the decision; part 2 runs the real middleware in a fresh process with a resolve hook and records which
// modules a plain `/` loads (none of them) and which a studio request loads (all three).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { needsDocumentRewrite } from '../middleware.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const decide = (path) => needsDocumentRewrite(new URL(path, 'https://cot.kevinliu.studio'));
for (const path of ['/', '/index.html', '/?tank=leo1a5', '/?_bootretry=1-x', '/gallery', '/gallery/', '/gallery.html', '/gallery?room=ABC123',
  '/index.html?_cot_meta_shell=1', '/home', '/docs']) {
  assert.equal(decide(path), false, `${path} only needs the deployment pin`);
}
for (const path of ['/?room=HKP5XW', '/?room=', '/index.html?room=HKP5XW&host=x', '/studio', '/studio/', '/cn', '/cn/', '/cn/studio',
  '/cn/docs/build', '/cn/nope', '/cn/?room=HKP5XW']) {
  assert.equal(decide(path), true, `${path} may need metadata or the localized 404`);
}

// Part 2: which modules does each request load? A synchronous resolve hook records every module URL the middleware
// graph resolves; fetch is stubbed (the metadata path sub-fetches the shell).
const probe = `
import { registerHooks } from 'node:module';
const seen = new Set();
registerHooks({ resolve(specifier, context, nextResolve) { const result = nextResolve(specifier, context); seen.add(result.url); return result; } });
globalThis.fetch = async () => new Response('<!doctype html><html><head><title>Shell</title></head><body>shell</body></html>', { headers: { 'content-type': 'text/html' } });
const heavy = () => [...seen].filter((url) => /\\/(siteMetadata|localizedHtml|localeRouting|i18nCatalog)\\.ts$/.test(url)).map((url) => url.split('/').pop()).sort();
const { default: middleware } = await import(${JSON.stringify(new URL('../middleware.ts', import.meta.url).href)});
const plain = await middleware(new Request('https://cot.kevinliu.studio/', { headers: { accept: 'text/html' } }));
const afterPlain = heavy();
const gallery = await middleware(new Request('https://cot.kevinliu.studio/gallery?room=ABC123', { headers: { accept: 'text/html' } }));
const afterGallery = heavy();
const studio = await middleware(new Request('https://cot.kevinliu.studio/studio', { headers: { accept: 'text/html' } }));
const afterStudio = heavy();
console.log(JSON.stringify({ afterPlain, afterGallery, afterStudio, plain: plain.status, gallery: gallery.status, studio: studio.status,
  plainNext: plain.headers.get('x-middleware-next'), studioBody: (await studio.text()).includes('Scene Studio') }));
`;
const run = spawnSync(process.execPath, ['--input-type=module', '-e', probe], { cwd: root, encoding: 'utf8', timeout: 60_000 });
assert.equal(run.status, 0, `the probe ran: ${run.stderr.slice(-800)}`);
const result = JSON.parse(run.stdout.trim().split('\n').at(-1));
assert.deepEqual(result.afterPlain, [], 'a plain / loads none of the metadata or localization modules');
assert.deepEqual(result.afterGallery, [], 'the gallery (even with a room-like query) loads none of them');
assert.deepEqual(result.afterStudio, ['i18nCatalog.ts', 'localeRouting.ts', 'localizedHtml.ts', 'siteMetadata.ts'],
  'the studio loads them on demand');
assert.equal(result.plainNext, '1', 'a plain / passes through to the static document');
assert.equal(result.studioBody, true, 'the studio still gets its metadata');

console.log('middleware-diet.selftest: / and the gallery load only the deployment pin; ?room=, /studio and /cn load the metadata modules on demand');
