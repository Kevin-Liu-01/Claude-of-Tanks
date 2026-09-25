import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
/**
 * vercel-config.selftest — the deployment configuration's invariants.
 *
 * 2026-09-25 (owner report "A game file failed to download (tankThumbs-….js)"): a `headers` rule in
 * vercel.json applies to every response on its path, a 404 included, and the edge caches that 404 for
 * the rule's max-age. An `immutable` rule on `/assets/(.*)` therefore turned one transient miss during
 * a deploy into a permanent failure for every player on that edge node. Hashed assets keep Vercel's
 * default must-revalidate caching; mid-session deploys are covered by skew protection + the pin.
 */
const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
for (const rule of config.headers || []) {
  const value = (rule.headers || []).map((h) => `${h.key}: ${h.value}`).join(' | ');
  assert.ok(!/^\/assets/.test(rule.source),
    `vercel.json must not carry a headers rule for /assets (${rule.source}: ${value}) — the edge caches 404s under it`);
  assert.ok(!/immutable|max-age=\d{5,}/.test(value),
    `long-lived Cache-Control on ${rule.source} would cache error responses at the edge (${value})`);
}
assert.equal(config.git?.deploymentEnabled?.main, false, 'git auto-deploys stay off for main (docs/DEPLOYS.md)');
console.log('vercel-config.selftest: no immutable asset rule, git auto-deploys off');
