import assert from 'node:assert/strict';
import config from '../../vite.config.ts';
import middleware, {
  config as middlewareConfig,
  deploymentPinCookie,
  deploymentResetCookie,
  deploymentResetLocation,
} from '../../middleware.ts';

for (const route of ['/gallery', '/gallery/', '/gallery.html']) {
  assert.ok(middlewareConfig.matcher.includes(route),
    `${route} must share the site-wide deployment pin and reset handshake`);
}

assert.equal(config.experimental, undefined,
  'build URLs must stay canonical instead of query-splitting preload and import identities');
assert.equal(
  deploymentPinCookie('', 'dpl_reentry_regression'),
  '__vdpl=dpl_reentry_regression; Path=/; HttpOnly; Secure; SameSite=Strict',
  'the playable document must pin its session before module requests begin',
);
assert.equal(
  deploymentPinCookie('__vdpl=dpl_existing; other=value', 'dpl_new'),
  null,
  'an active long-lived session must retain the deployment that received it',
);
assert.equal(deploymentPinCookie('', ''), null,
  'local and non-Vercel builds must not emit a deployment cookie');

const resetRequestUrl = 'https://game.test/?tank=leo1a5&_bootretry=1-old&_dplreset=1';
const resetLocation = 'https://game.test/?tank=leo1a5&_bootretry=1-old';
assert.equal(deploymentResetLocation(resetRequestUrl), resetLocation,
  'a recovery request must retain its bounded retry receipt while dropping the one-shot signal');
assert.equal(deploymentResetLocation('https://game.test/?tank=leo1a5'), null,
  'ordinary playable documents must not redirect');
assert.match(deploymentResetCookie(), /__vdpl=; Path=\/; Max-Age=0;/,
  'recovery must expire the host-only deployment pin');

const resetResponse = await middleware(new Request(resetRequestUrl, {
  headers: { cookie: '__vdpl=dpl_stale' },
}));
assert.equal(resetResponse.status, 307,
  'the stale deployment must redirect once after expiring its own pin');
assert.equal(resetResponse.headers.get('location'), resetLocation,
  'the redirect must return to the same playable document');
assert.match(resetResponse.headers.get('set-cookie') ?? '', /Max-Age=0/,
  'the redirect must clear the stale pin before Vercel resolves the next request');
assert.equal(resetResponse.headers.get('cache-control'), 'private, no-store',
  'the deployment-reset redirect must never enter an edge or browser cache');

const indexShell = `<!doctype html><html><head>
  <title>Original</title>
  <meta name="description" content="Original">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="https://cot.kevinliu.studio/">
  <meta property="og:title" content="Original"><meta property="og:description" content="Original">
  <meta property="og:type" content="website"><meta property="og:url" content="https://cot.kevinliu.studio/">
  <meta property="og:image" content="https://cot.kevinliu.studio/brand/og-image.png">
  <meta property="og:image:type" content="image/png"><meta property="og:image:alt" content="Original">
  <meta name="twitter:title" content="Original"><meta name="twitter:description" content="Original">
  <meta name="twitter:image" content="https://cot.kevinliu.studio/brand/og-image.png"><meta name="twitter:image:alt" content="Original">
</head><body><main id="game-shell">Playable app</main></body></html>`;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (request) => {
  assert.match(String(request), /\/index\.html\?_cot_meta_shell=1$/,
    'metadata responses must fetch a guarded copy of the real playable shell');
  return new Response(indexShell, { headers: { 'content-type': 'text/html' } });
};

const studioResponse = await middleware(new Request('https://cot.kevinliu.studio/studio'));
const studioHtml = await studioResponse.text();
assert.match(studioHtml, /<title>Scene Studio — Stage Cinematic Tank Battles \| Claude of Tanks<\/title>/);
assert.match(studioHtml, /brand\/og\/studio\.jpg/);
assert.match(studioHtml, /<main id="game-shell">Playable app<\/main>/,
  'route metadata must preserve the playable document body');

const inviteResponse = await middleware(new Request(
  'https://cot.kevinliu.studio/?room=HKP5XW&mode=lan&host=Commander%2009HY',
));
const inviteHtml = await inviteResponse.text();
assert.match(inviteHtml, /Join Commander 09HY’s LAN Battle — Claude of Tanks/);
assert.match(inviteHtml, /LAN battle room HKP5XW/);
assert.match(inviteHtml, /brand\/og\/private-room\.jpg/);
assert.match(inviteHtml, /name="robots" content="noindex, nofollow, noarchive, max-image-preview:large"/);
assert.equal(inviteResponse.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
assert.equal(inviteResponse.headers.get('cache-control'), 'private, no-store');

const escapedInvite = await middleware(new Request(
  'https://cot.kevinliu.studio/?room=ABC123&host=%22%3E%3Cscript%3Ealert(1)%3C%2Fscript%3E',
));
const escapedHtml = await escapedInvite.text();
assert.doesNotMatch(escapedHtml, /<script>alert\(1\)<\/script>/,
  'room hosts must never become executable metadata markup');
assert.match(escapedHtml, /&quot;&gt;&lt;script&gt;/,
  'room hosts should remain readable as escaped metadata text');
globalThis.fetch = originalFetch;

const galleryWithRoom = await middleware(new Request(
  'https://cot.kevinliu.studio/gallery?room=ABC123&host=Commander',
));
assert.doesNotMatch(await galleryWithRoom.text(), /Playable app/,
  'a room-like query on a non-playable page must not replace that page with the game shell');

console.log('deploymentSkew.selftest: deployment pins and crawler-visible route metadata are healthy');
