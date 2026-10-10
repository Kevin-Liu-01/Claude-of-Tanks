// The production route table (INFRA-P20, 2026-10-01). vercel.json carried 34 literal rewrites — every docs topic and
// its /cn twin by hand — and answered the trailing-slash forms of the public pages inconsistently: /studio/ and /cn/
// were 200 (the middleware and the cn/ directory index) while /docs/, /home/, /gallery/ and /docs/build/ were 404.
// This receipt freezes the deploy-163 table, converts both tables with the conversion `vercel build` runs
// (tools/vercelRoutes.test-support.mjs) and proves that every request resolves the same way, except the deliberate
// slash change: a trailing-slash form of a slashless public page now answers 308 to its canonical path.
//
// Why not `trailingSlash: false`: the zh-CN game's canonical URL is /cn/ (pathForLocale, the sitemap, hreflang), so a
// global rule would redirect a canonical URL; `true` would redirect every other one.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ALIAS_HOSTS, CANONICAL_ORIGIN, OFFICIAL_SITE_HOST, PROTECTED_PRODUCTION_HOST } from '../api/_lib/policy.ts';
import { PUBLIC_ROUTE_RECORDS } from '../src/ui/localeRouting.ts';
import { resolveVercelRequest, vercelJsonRoutes } from './vercelRoutes.test-support.mjs';

const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const GALLERY_CACHE = 'private, no-store, max-age=0';

// INFRA-P6 (2026-10-01): security headers on every response — deploy 163 sent none beyond Vercel's HSTS. COOP
// same-origin and X-Frame-Options SAMEORIGIN were checked against the code first: no window.open or opener use (every
// external link is target=_blank rel="noopener noreferrer"), no OAuth or payment popup, no iframe, player card or
// portal that embeds the site from another origin (same-origin framing stays allowed). The Permissions-Policy denies
// devices the game never asks for (it uses pointer lock, gamepads and the clipboard, none listed). No enforced CSP yet.
const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), bluetooth=()',
  'x-frame-options': 'SAMEORIGIN',
  'cross-origin-opener-policy': 'same-origin',
};
const securityHeadersOf = (headers) => Object.fromEntries(Object.keys(SECURITY_HEADERS).map((name) => [name, headers[name]]));

// The table deploy 163 served (24c5c5b03's vercel.json), frozen: redirects, header rules and the 34 rewrites in order.
const BEFORE = {
  redirects: [
    { source: '/surface-studio', destination: '/gallery?layer=markup', permanent: true },
    { source: '/cn/surface-studio', destination: '/cn/gallery?layer=markup', permanent: true },
  ],
  headers: ['/gallery', '/gallery.html', '/cn/gallery', '/cn/gallery.html']
    .map((source) => ({ source, headers: [{ key: 'Cache-Control', value: GALLERY_CACHE }] })),
  rewrites: [
    ['/cn', '/cn/index.html'], ['/cn/home', '/cn/home.html'], ['/cn/docs', '/cn/docs.html'],
    ['/cn/docs/build', '/cn/docs-build.html'], ['/cn/docs/models', '/cn/docs-models.html'],
    ['/cn/docs/simulation', '/cn/docs-simulation.html'], ['/cn/docs/vehicles', '/cn/docs-vehicles.html'],
    ['/cn/docs/rendering', '/cn/docs-rendering.html'], ['/cn/docs/performance', '/cn/docs-performance.html'],
    ['/cn/docs/worlds', '/cn/docs-worlds.html'], ['/cn/docs/ai', '/cn/docs-ai.html'],
    ['/cn/docs/multiplayer', '/cn/docs-multiplayer.html'], ['/cn/docs/audio', '/cn/docs-audio.html'],
    ['/cn/docs/interface', '/cn/docs-interface.html'], ['/cn/docs/studio', '/cn/docs-studio.html'],
    ['/cn/gallery', '/cn/gallery.html'], ['/cn/studio', '/cn/studio.html'], ['/cn/404', '/cn/404.html'],
    ['/home', '/home.html'], ['/docs', '/docs.html'],
    ['/docs/build', '/docs-build.html'], ['/docs/models', '/docs-models.html'],
    ['/docs/simulation', '/docs-simulation.html'], ['/docs/vehicles', '/docs-vehicles.html'],
    ['/docs/rendering', '/docs-rendering.html'], ['/docs/performance', '/docs-performance.html'],
    ['/docs/worlds', '/docs-worlds.html'], ['/docs/ai', '/docs-ai.html'],
    ['/docs/multiplayer', '/docs-multiplayer.html'], ['/docs/audio', '/docs-audio.html'],
    ['/docs/interface', '/docs-interface.html'], ['/docs/studio', '/docs-studio.html'],
    ['/gallery', '/gallery.html'], ['/studio', '/index.html'],
  ].map(([source, destination]) => ({ source, destination })),
};
assert.equal(BEFORE.rewrites.length, 34);
const before = vercelJsonRoutes(BEFORE);
const after = vercelJsonRoutes(config);

// The documents the build emits (root entries and their cn/ twins) plus a few static files.
const files = new Set(['/index.html', '/404.html', '/docs-topic.html', '/assets/main-hc1qihnq.js', '/maps/verdant.webp',
  '/mp-collision/index.json', '/robots.txt']);
for (const route of PUBLIC_ROUTE_RECORDS) {
  files.add(`/${route.sourceHtml}`);
  files.add(`/cn/${route.localizedHtml}`);
}

// Every path the old table names, its slash and file forms, and the edges around them.
const docsTopics = PUBLIC_ROUTE_RECORDS.filter((route) => /^\/docs\/[a-z]+$/.test(route.pathname)).map((route) => route.pathname.slice(6));
const paths = new Set(['/', '/index.html', '/404', '/cn/', '/cn/index.html', '/cn/404', '/cn/404/', '/surface-studio',
  '/cn/surface-studio', '/surface-studio/', '/docs/unknown', '/docs/unknown/', '/cn/docs/unknown', '/docs/build/extra',
  '/Docs/Build', '/DOCS', '/docs.html', '/home.html', '/gallery.html', '/cn/gallery.html', '/docs-topic.html',
  '/assets/main-hc1qihnq.js', '/assets/missing-abcdefgh.js', '/maps/verdant.webp', '/mp-collision/index.json',
  '/api/ice', '/api/ice/', '/robots.txt', '/nope', '/nope/', '/studio/x', '//', '/cn//docs']);
for (const { source } of BEFORE.rewrites) {
  for (const path of [source, `${source}/`, `${source}.html`, `${source}/index.html`]) paths.add(path);
}
const queries = ['', '?room=HKP5XW&host=Commander', '?layer=markup'];

// The deliberate change: the slash forms of the slashless public pages (en and cn) redirect to the canonical path.
const SLASH_PAGES = ['/home', '/docs', '/gallery', '/studio', ...docsTopics.map((topic) => `/docs/${topic}`)];
const slashRedirects = new Map(SLASH_PAGES.flatMap((page) => [[`${page}/`, page], [`/cn${page}/`, `/cn${page}`]]));

let compared = 0;
for (const path of paths) {
  for (const query of queries) {
    const old = resolveVercelRequest(before, { path, query }, files);
    const now = resolveVercelRequest(after, { path, query }, files);
    if (slashRedirects.has(path)) {
      assert.notEqual(old.status, 308, `${path} did not redirect before`);
      assert.deepEqual([now.status, now.location], [308, `${slashRedirects.get(path)}${query}`],
        `${path}${query} → 308 to its canonical path, query kept`);
      const target = resolveVercelRequest(after, { path: slashRedirects.get(path), query }, files);
      assert.equal(target.status, 200, `${slashRedirects.get(path)} serves a document`);
      continue;
    }
    assert.deepEqual(
      { status: now.status, location: now.location, file: now.file, cache: now.headers['cache-control'] },
      { status: old.status, location: old.location, file: old.file, cache: old.headers['cache-control'] },
      `${path}${query} resolves as it did on deploy 163`,
    );
    if (now.status !== 308) {
      assert.deepEqual(securityHeadersOf(now.headers), SECURITY_HEADERS, `${path}${query} (${now.status}) carries the security headers`);
      assert.equal(old.headers['x-frame-options'], undefined, 'deploy 163 sent none of them');
    }
    compared++;
  }
}

// Spot checks of the outcomes themselves (not only their equality).
const resolve = (path, query = '') => resolveVercelRequest(after, { path, query }, files);
assert.equal(resolve('/docs/build').file, '/docs-build.html');
assert.equal(resolve('/cn/docs/multiplayer').file, '/cn/docs-multiplayer.html');
assert.equal(resolve('/docs/filming').file, '/docs-filming.html', 'the thirteenth manual (2026-10-06) is routed');
assert.equal(resolve('/cn/docs/filming').file, '/cn/docs-filming.html');
assert.deepEqual([resolve('/docs/filming/').status, resolve('/docs/filming/').location], [308, '/docs/filming']);
assert.equal(resolve('/studio').file, '/index.html', 'the English studio is the game document (the middleware adds its metadata)');
assert.equal(resolve('/cn/studio').file, '/cn/studio.html');
assert.equal(resolve('/cn').file, '/cn/index.html');
assert.equal(resolve('/cn/').file, '/cn/index.html', 'the canonical zh-CN game URL keeps its slash and its 200');
assert.equal(resolve('/docs/unknown').status, 404, 'an unknown topic is still a 404');
assert.equal(resolve('/docs/unknown/').status, 404, 'an unknown topic with a slash is still a plain 404');
assert.deepEqual([resolve('/surface-studio', '?x=1').status, resolve('/surface-studio', '?x=1').location], [308, '/gallery?layer=markup&x=1']);
assert.equal(resolve('/gallery').headers['cache-control'], GALLERY_CACHE);
assert.equal(resolve('/cn/gallery.html').headers['cache-control'], GALLERY_CACHE);
assert.equal(resolve('/docs/build').headers['cache-control'], undefined, 'only the gallery documents are private');

// The security rule matches the root and any depth, adds no caching semantics (a header rule also answers 404s,
// tools/vercel-config.selftest.mjs) and is the only rule that sets those names.
const securityRules = config.headers.filter((rule) => rule.headers.some(({ key }) => key.toLowerCase() in SECURITY_HEADERS));
assert.equal(securityRules.length, 1, 'one rule owns the security headers');
assert.deepEqual(Object.fromEntries(securityRules[0].headers.map(({ key, value }) => [key.toLowerCase(), value])), SECURITY_HEADERS);
assert.deepEqual(securityHeadersOf(resolve('/').headers), SECURITY_HEADERS, 'the root document');
assert.deepEqual(securityHeadersOf(resolve('/assets/missing-abcdefgh.js').headers), SECURITY_HEADERS, 'a 404');
assert.deepEqual(securityHeadersOf(resolve('/api/ice').headers), SECURITY_HEADERS, 'an API path');
assert.ok(!config.headers.some((rule) => rule.headers.some(({ key }) => /^content-security-policy$/i.test(key))),
  'no enforced Content-Security-Policy in this wave (it needs build-time inline-script hashes)');

// INFRA-P5 (2026-10-01): the alias domains answer 308 to the canonical origin with path and query — 18 % of document
// loads arrived there, where multiplayer is unavailable (the rooms Worker admits cot.kevinliu.studio alone). The
// condition is host equality, so deployment URLs (the release step verifies those), the protected production
// domain and look-alike hosts are untouched and resolve exactly as the canonical host does.
const hostRules = config.redirects.filter((rule) => rule.has?.some((item) => item.type === 'host'));
assert.deepEqual(hostRules.map((rule) => rule.has[0].value.eq).sort(), [...ALIAS_HOSTS].sort(),
  'one redirect per alias host of api/_lib/policy.ts, by exact host equality');
for (const rule of hostRules) {
  assert.equal(rule.source, '/:path(.*)', 'the root and every path (strict /:path* would miss "/")');
  assert.equal(rule.destination, `${CANONICAL_ORIGIN}/:path`);
  assert.equal(rule.permanent, true, '308 keeps the method and body');
}
const hostSamples = [['/', ''], ['/', '?room=HKP5XW&host=Commander%2009HY&mode=lan'], ['/docs/build', ''], ['/cn/', '?x=1'],
  ['/studio/', ''], ['/assets/main-hc1qihnq.js', ''], ['/api/ice', ''], ['/surface-studio', '?y=2'], ['/nope', '']];
let aliasRedirects = 0;
for (const host of ALIAS_HOSTS) {
  for (const [path, query] of hostSamples) {
    const moved = resolveVercelRequest(after, { host, path, query }, files);
    assert.deepEqual([moved.status, moved.location], [308, `${CANONICAL_ORIGIN}${path}${query}`], `${host}${path}${query} → the canonical origin`);
    const old = resolveVercelRequest(before, { host, path, query }, files);
    assert.ok(!(old.location ?? '').startsWith(CANONICAL_ORIGIN), `${host}${path} was not sent to the canonical origin before`);
    aliasRedirects++;
  }
  assert.equal(resolveVercelRequest(after, { host: host.toUpperCase(), path: '/' }, files).status, 308, 'host case does not matter');
}
const untouchedHosts = [OFFICIAL_SITE_HOST, PROTECTED_PRODUCTION_HOST, 'claude-of-tanks-abc123def-kl01s-projects.vercel.app',
  'claude-of-tanks-git-main-kl01s-projects.vercel.app', 'claude-of-tanks-1a2b3c4d5.vercel.app', 'claudeoftanks.kevinliu.studio.evil.test',
  'xclaudeoftanks.kevinliu.studio', 'evil-claude-of-tanks.vercel.app', 'claude-of-tanks.vercel.app.evil.test', 'localhost'];
for (const host of untouchedHosts) {
  for (const [path, query] of hostSamples) {
    assert.deepEqual(resolveVercelRequest(after, { host, path, query }, files), resolveVercelRequest(after, { path, query }, files),
      `${host}${path}${query} resolves as the canonical host does`);
  }
}

// The pattern rules name exactly the public docs topics (src/ui/localeRouting.ts PUBLIC_ROUTE_RECORDS).
const topicAlternation = (source) => /:topic\(([^)]+)\)/.exec(source)?.[1].split('|') ?? null;
const topicRules = [...config.rewrites, ...config.redirects].filter((rule) => rule.source.includes(':topic('));
assert.equal(topicRules.length, 4, 'one docs-topic rule per locale for rewrites and for slash redirects');
for (const rule of topicRules) assert.deepEqual(topicAlternation(rule.source), docsTopics, `${rule.source} names every docs topic`);
assert.ok(config.rewrites.length <= 6 && config.rewrites.length < BEFORE.rewrites.length, 'pattern rewrites replace the literal list');

console.log(`vercel-routes.selftest: ${compared} requests resolve as on deploy 163 (${BEFORE.rewrites.length} literal rewrites → `
  + `${config.rewrites.length} patterns); ${slashRedirects.size} slash forms now 308 to their canonical page; every `
  + `non-redirect answer carries the five security headers; ${aliasRedirects} alias requests 308 to ${CANONICAL_ORIGIN}, `
  + `${untouchedHosts.length} other hosts untouched`);
