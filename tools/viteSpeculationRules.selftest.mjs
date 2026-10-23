// tools/viteSpeculationRules.ts (2026-10-22, nav-perf-240): which documents carry the rules, what the rules say, that a
// hovering pointer prerenders on hover and a touch screen only on the touch, and that the transform adds exactly one
// script to a public page and none to the game document.
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { SPECULATION_RULES_TAG, isSpeculationEntry, speculationRules, speculationRulesFor } from './viteSpeculationRules.ts';

for (const file of ['/repo/site/home.html', '/repo/site/docs.html', '/repo/site/docs-build.html', '/repo/site/gallery.html', '/repo/404.html']) {
  assert.equal(isSpeculationEntry(file), true, `${file} is a public entry`);
}
for (const file of ['/repo/index.html', '/repo/site/hud-preview.html', '/repo/tools/mp-p2p-peer/index.html']) {
  assert.equal(isSpeculationEntry(file), false, `${file} carries no rules`);
}

const matches = (list) => list.flatMap((rule) => rule.where.or.map((entry) => entry.href_matches)).sort();
const desktop = speculationRulesFor('moderate');
assert.deepEqual(matches(desktop.prerender), ['/cn/docs', '/cn/docs/*', '/cn/home', '/docs', '/docs/*', '/home'],
  'the light documents prerender, in both locales');
assert.deepEqual(matches(desktop.prefetch), ['/', '/cn', '/cn/gallery', '/cn/studio', '/gallery', '/studio'],
  'the WebGL documents only prefetch their HTML');

// The inline script picks the rules by the pointer.
const scriptBody = /<script id="cot-speculation">([\s\S]+)<\/script>/.exec(SPECULATION_RULES_TAG)[1];
function added(hover, supports = true) {
  const appended = [];
  const document = { createElement: () => ({}), head: { append: (node) => appended.push(node) } };
  runInNewContext(scriptBody, {
    document, JSON, HTMLScriptElement: { supports: (type) => supports && type === 'speculationrules' },
    matchMedia: (query) => ({ matches: query === '(hover: hover)' && hover }),
  });
  return appended.map((node) => ({ type: node.type, rules: JSON.parse(node.textContent) }));
}
const [mouse] = added(true);
assert.equal(mouse.type, 'speculationrules');
assert.deepEqual(mouse.rules, desktop, 'a hovering pointer prerenders on a moderate hover');
const [touch] = added(false);
assert.deepEqual(touch.rules, speculationRulesFor('conservative'), 'a touch screen speculates only on the touch');
for (const rule of [...touch.rules.prerender, ...touch.rules.prefetch]) assert.equal(rule.eagerness, 'conservative');
assert.deepEqual(added(true, false), [], 'a browser without speculation rules gets nothing');

const plugin = speculationRules();
assert.equal(plugin.apply, 'build', 'build only: a dev server never prerenders its own pages');
const html = '<!doctype html><html><head><title>x</title></head><body></body></html>';
const once = plugin.transformIndexHtml.handler(html, { filename: '/repo/site/home.html' });
assert.equal(once.split('id="cot-speculation"').length - 1, 1, 'one rules script on a public page');
assert.ok(once.indexOf('cot-speculation') < once.indexOf('</head>'), 'inside the head');
assert.equal(plugin.transformIndexHtml.handler(once, { filename: '/repo/site/home.html' }), once, 'idempotent');
assert.equal(plugin.transformIndexHtml.handler(html, { filename: '/repo/index.html' }), html, 'the game document is untouched');
console.log('viteSpeculationRules.selftest: a hovering pointer prerenders the manual and landing on hover, a touch screen only on the touch, the WebGL documents only prefetch; the game document carries none');
