// docsSearch.selftest.mjs — the Field Manual's search (08 .side .search): the index is every chapter and section, a hit
// holds every term, titles lead, accents and case fold, Chinese matches as typed, and the markup it writes is escaped.
// Copyright © 2026 Kevin B. Liu.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { entryOf, manualEntries, markedText, searchManual, snippetOf } from './docsSearch.ts';
import { TOPIC_ORDER, topics } from './topics.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// the index: one entry per chapter and one per section, each linking into its chapter
const entries = manualEntries();
const sections = TOPIC_ORDER.reduce((sum, slug) => sum + topics[slug].sections.length, 0);
assert.equal(entries.length, TOPIC_ORDER.length + sections, 'every chapter and every section is in the index');
for (const entry of entries) {
  assert.match(entry.href, /^\/docs\/[a-z]+(?:#topic-section-\d+)?$/, `${entry.href}: a chapter or one of its sections`);
  assert.ok(entry.title && entry.chapter && !entry.text.includes('`'), `${entry.href}: titled, chaptered, plain text`);
}

// matching: every term, titles first, nothing for an empty query, at most the limit
assert.deepEqual(searchManual(entries, '   '), []);
const pen = searchManual(entries, 'penetration');
assert.ok(pen.length > 0 && pen.length <= 8, 'a common word finds hits, eight at most');
for (const hit of searchManual(entries, 'armor penetration')) {
  const all = `${hit.title} ${hit.chapter} ${hit.text}`.toLowerCase();
  assert.ok(all.includes('armor') && all.includes('penetration'), `${hit.href}: holds every term`);
}
const fixture = [
  entryOf('/docs/a#topic-section-1', 'Suspension', 'Vehicles', 'The Kyū-maru rides on torsion bars.'),
  entryOf('/docs/b#topic-section-1', 'Smoke', 'Rendering', 'Suspension of particles in the air.'),
  entryOf('/docs/c#topic-section-1', '穿深与装甲', '模拟与战斗', '炮弹的穿深随距离下降。'),
];
assert.deepEqual(searchManual(fixture, 'suspension').map((e) => e.href), ['/docs/a#topic-section-1', '/docs/b#topic-section-1'], 'a title hit leads a text hit');
assert.deepEqual(searchManual(fixture, 'KYU').map((e) => e.href), ['/docs/a#topic-section-1'], 'case and accents fold');
assert.deepEqual(searchManual(fixture, '穿深').map((e) => e.href), ['/docs/c#topic-section-1'], 'Chinese matches as typed');
assert.deepEqual(searchManual(fixture, 'suspension zzz'), [], 'a hit holds every term');

// the markup it writes: escaped, the query marked, the snippet around the first word
assert.equal(markedText('<b>armor & armour</b>', 'armo'), '&lt;b&gt;<mark>armo</mark>r &amp; <mark>armo</mark>ur&lt;/b&gt;');
assert.equal(markedText('a+b (c)', 'b ('), 'a+<mark>b</mark> <mark>(</mark>c)', 'query words are literal, not patterns');
const long = `${'x'.repeat(300)} target ${'y'.repeat(300)}`;
const snip = snippetOf(long, 'target');
assert.ok(snip.startsWith('…') && snip.endsWith('…') && snip.includes('target') && snip.length <= 130, 'about two lines around the word');

// the page: the field leads the shelf in every chapter, and its matching loads only when it is used
const source = readFileSync(join(ROOT, 'src/docs/topics.ts'), 'utf8');
assert.match(source, /import\('\.\/docsSearch\.ts'\)/, 'topics.ts loads the search on demand');
assert.doesNotMatch(source, /^import [^\n]*docsSearch/m, 'never statically');
for (const slug of TOPIC_ORDER) {
  assert.match(readFileSync(join(ROOT, `site/docs-${slug}.html`), 'utf8'), /<aside class="dm-side"[^>]*><a class="dm-home"[^>]*>[\s\S]*?<\/a><div class="dm-search" role="search">/,
    `site/docs-${slug}.html: the search leads the shelf`);
}

console.log(`docsSearch.selftest: ${entries.length} entries (${TOPIC_ORDER.length} chapters, ${sections} sections); terms, folding, Chinese and escaping hold`);
