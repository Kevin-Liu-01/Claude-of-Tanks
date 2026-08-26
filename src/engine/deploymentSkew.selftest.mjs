import assert from 'node:assert/strict';
import config from '../../vite.config.js';
import middleware, {
  deploymentPinCookie,
  deploymentResetCookie,
  deploymentResetLocation,
} from '../../middleware.js';

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

const resetResponse = middleware(new Request(resetRequestUrl, {
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

console.log('deploymentSkew.selftest: canonical pins now self-heal onto the current deployment');
