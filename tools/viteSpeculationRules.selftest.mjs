// tools/viteSpeculationRules.ts (2026-10-22, nav-perf-240): which documents carry the rules, what the rules say, and
// that the transform adds exactly one block to a public page and none to the game document.
import assert from 'node:assert/strict';
import { SPECULATION_RULES, SPECULATION_RULES_TAG, isSpeculationEntry, speculationRules } from './viteSpeculationRules.ts';

for (const file of ['/repo/site/home.html', '/repo/site/docs.html', '/repo/site/docs-build.html', '/repo/site/gallery.html', '/repo/404.html']) {
  assert.equal(isSpeculationEntry(file), true, `${file} is a public entry`);
}
for (const file of ['/repo/index.html', '/repo/site/hud-preview.html', '/repo/tools/mp-p2p-peer/index.html']) {
  assert.equal(isSpeculationEntry(file), false, `${file} carries no rules`);
}

const matches = (list) => list.flatMap((rule) => rule.where.or.map((entry) => entry.href_matches)).sort();
assert.deepEqual(matches(SPECULATION_RULES.prerender), ['/cn/docs', '/cn/docs/*', '/cn/home', '/docs', '/docs/*', '/home'],
  'the light documents prerender, in both locales');
assert.deepEqual(matches(SPECULATION_RULES.prefetch), ['/', '/cn', '/cn/gallery', '/cn/studio', '/gallery', '/studio'],
  'the WebGL documents only prefetch their HTML');
for (const rule of [...SPECULATION_RULES.prerender, ...SPECULATION_RULES.prefetch]) assert.equal(rule.eagerness, 'moderate');
assert.doesNotMatch(SPECULATION_RULES_TAG, /<\/script>.*<\/script>/s);

const plugin = speculationRules();
assert.equal(plugin.apply, 'build', 'build only: a dev server never prerenders its own pages');
const html = '<!doctype html><html><head><title>x</title></head><body></body></html>';
const once = plugin.transformIndexHtml.handler(html, { filename: '/repo/site/home.html' });
assert.equal(once.split('type="speculationrules"').length - 1, 1, 'one rules block on a public page');
assert.ok(once.indexOf('speculationrules') < once.indexOf('</head>'), 'inside the head');
assert.equal(plugin.transformIndexHtml.handler(once, { filename: '/repo/site/home.html' }), once, 'idempotent');
assert.equal(plugin.transformIndexHtml.handler(html, { filename: '/repo/index.html' }), html, 'the game document is untouched');
console.log('viteSpeculationRules.selftest: public pages prerender the manual and landing and prefetch the WebGL documents on a moderate hover; the game document carries none');
