#!/usr/bin/env node
// localizedBody.selftest.mjs — /cn public pages ship localized body HTML at build time (BUI-F8, SPEC 15).
//
// tools/generate-localized-pages.mjs writes dist/cn/* through localizeHtmlDocument, which now runs localizeBodyHtml for
// a non-default locale. This receipt checks, on every public route's source page, that each static-i18n host carries
// exactly the Chinese text the runtime pass (staticI18n.ts) would write — text hosts escaped, attribute hosts set,
// placeholders and ICU filled from data-i18n-vars — that English documents keep their body byte-for-byte, and that
// the transform is idempotent; plus synthetic edge cases (nested same-name elements, `title` beside
// `data-i18n-title`, quoting, void elements, vetted HTML hosts).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localizeBodyHtml, localizeHtmlDocument } from './localizedHtml.ts';
import { renderProductStats } from '../productStats.ts';
import { catalogText } from '../ui/i18nCatalog.ts';
import { PUBLIC_ROUTE_RECORDS } from '../ui/localeRouting.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sourcePath = (html) => join(ROOT, html === 'index.html' || html === '404.html' ? html : `site/${html}`);
const decode = (value) => value
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const attr = (tag, name) => {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag);
  return match ? decode(match[1] ?? match[2] ?? '') : null;
};
const body = (html) => html.slice(html.search(/<body\b/i));

let textHosts = 0;
let attributeHosts = 0;
let changed = 0;
for (const route of PUBLIC_ROUTE_RECORDS) {
  const source = renderProductStats(readFileSync(sourcePath(route.sourceHtml), 'utf8'));
  const zh = localizeHtmlDocument(source, route, 'zh-CN');
  const en = localizeHtmlDocument(source, route, 'en-US');
  assert.equal(body(en), body(source), `${route.id}: an English document keeps its body byte-for-byte`);
  assert.equal(localizeBodyHtml(zh, 'zh-CN'), zh, `${route.id}: body localization is idempotent`);
  for (const match of body(zh).matchAll(/<([a-z][\w-]*)\b[^>]*\sdata-i18n[\w-]*=[^>]*>/gi)) {
    const tag = match[0];
    let vars;
    const rawVars = attr(tag, 'data-i18n-vars');
    if (rawVars) vars = JSON.parse(rawVars);
    const expected = (key) => renderProductStats(catalogText('zh-CN', key, vars));
    for (const [host, target] of [['data-i18n-placeholder', 'placeholder'], ['data-i18n-title', 'title'], ['data-i18n-alt', 'alt'],
      ['data-i18n-aria-label', 'aria-label'], ['data-i18n-aria', 'aria-label']]) {
      const key = attr(tag, host);
      if (!key) continue;
      assert.equal(attr(tag, target), expected(key), `${route.id}: ${host}=${key} sets ${target} in zh-CN`);
      attributeHosts++;
    }
    const key = attr(tag, 'data-i18n');
    if (!key) continue;
    const rest = zh.slice(zh.indexOf(tag, match.index) + tag.length);
    const content = rest.slice(0, rest.search(/<(?:\/)?[a-z]/i));
    assert.equal(decode(content), expected(key), `${route.id}: data-i18n=${key} ships its zh-CN text`);
    if (catalogText('en-US', key, vars) !== catalogText('zh-CN', key, vars)) changed++;
    textHosts++;
  }
}
assert.ok(textHosts > 650, `every public page's text hosts are checked (${textHosts})`);
assert.ok(attributeHosts > 190, `and attribute hosts (${attributeHosts})`);
assert.ok(changed > 620, `most hosts change language (${changed})`);

// Synthetic edges.
const doc = (inner) => `<!doctype html><html><head><title data-i18n="x">Head stays</title></head><body>${inner}</body></html>`;
const out = (inner) => body(localizeBodyHtml(doc(inner), 'zh-CN')).replace(/^<body>|<\/body><\/html>$/g, '');
assert.equal(out('<span data-i18n="garage.battle">BATTLE</span>'), '<span data-i18n="garage.battle">出战</span>');
assert.match(localizeBodyHtml(doc(''), 'zh-CN'), /<title data-i18n="x">Head stays<\/title>/, 'the head is left to the metadata pass');
assert.equal(out('<div data-i18n="garage.battle"><div>a</div><div>b</div></div><i>after</i>'),
  '<div data-i18n="garage.battle">出战</div><i>after</i>', 'nested same-name elements close at the right tag');
assert.equal(out('<button title="old" data-i18n-title="garage.battle">x</button>'),
  '<button title="出战" data-i18n-title="garage.battle">x</button>', '`title` is set, `data-i18n-title` kept');
assert.equal(out('<button data-i18n-title="garage.battle" title="old">x</button>'),
  '<button data-i18n-title="garage.battle" title="出战">x</button>', 'in either order');
assert.equal(out('<img src="a.png" data-i18n-alt="garage.battle" alt="old">'),
  '<img src="a.png" data-i18n-alt="garage.battle" alt="出战">', 'void elements take attributes only');
assert.equal(out('<img src="a.png" data-i18n-alt="garage.battle"/>'),
  '<img src="a.png" data-i18n-alt="garage.battle" alt="出战"/>', 'a missing attribute is added');
assert.equal(out(`<span data-i18n="docs.evidence.fleetValue" data-i18n-vars='{"count":"220"}'>vehicles</span>`),
  `<span data-i18n="docs.evidence.fleetValue" data-i18n-vars='{"count":"220"}'>辆载具</span>`, 'ICU plurals read data-i18n-vars');
assert.equal(out('<span data-i18n="endScreen.kills" data-i18n-vars="{&quot;count&quot;:&quot;2&quot;}">x</span>'),
  '<span data-i18n="endScreen.kills" data-i18n-vars="{&quot;count&quot;:&quot;2&quot;}">2 次击杀</span>',
  'entity-encoded vars decode into an ICU plural');
// The docs hero date lives in each locale's string (no date formatting code on the public pages).
assert.equal(out('<span data-i18n="docs.hero.eyebrow">x</span>'), '<span data-i18n="docs.hero.eyebrow">工程实战手册 · 更新于 2026 年 9 月 30 日</span>');
assert.equal(out('<span data-i18n="not.a.key">Keep me</span>'), '<span data-i18n="not.a.key">Keep me</span>',
  'an unknown key keeps its fallback');
assert.equal(out('<script>const t = `<b data-i18n="garage.battle">BATTLE</b>`;</script><b data-i18n="garage.battle">BATTLE</b>'),
  '<script>const t = `<b data-i18n="garage.battle">BATTLE</b>`;</script><b data-i18n="garage.battle">出战</b>', 'markup inside a script is code');
assert.match(out('<p data-i18n="playMenu.matchMode.capture_the_flag.desc" data-i18n-vars=\'{"target":"3"}\'>x</p>'), /先得 3 分者胜/);

console.log(`localizedBody.selftest: ${textHosts} text and ${attributeHosts} attribute hosts ship zh-CN at build time (${changed} change language); English bodies byte-equal; idempotent; edge cases pass`);
