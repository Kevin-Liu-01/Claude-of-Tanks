import assert from 'node:assert/strict';
import config from '../../vite.config.js';
import { deploymentPinCookie } from '../../middleware.js';

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

console.log('deploymentSkew.selftest: cookie pinning preserves canonical module URLs');
