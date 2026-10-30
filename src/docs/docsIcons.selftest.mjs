import assert from 'node:assert/strict';
import { TOPIC_ORDER } from './topics.ts';
import { readFile } from 'node:fs/promises';
import { DOCS_ICON_SPECS, docsIconKeys } from './docsIcons.ts';
import { uiIconIds, uiIconSVG } from '../ui/uiIcons.ts';

const docs = await readFile(new URL('../../site/docs.html', import.meta.url), 'utf8');
const sharedIds = new Set(uiIconIds());

for (const key of docsIconKeys()) {
  const spec = DOCS_ICON_SPECS[key];
  assert.ok(sharedIds.has(spec.id), `${key} uses a shared custom icon`);
  assert.match(uiIconSVG(spec.id, 24), /^<svg[\s\S]*<\/svg>$/, `${key} renders valid SVG`);
}

const placeholders = [...docs.matchAll(/data-doc-icon="([^"]+)"/g)].map((match) => match[1]);
// the index is the chapter map: every chapter's card and each shelf's heading lead with an icon
const iconCards = [...docs.matchAll(/<a (?:class="[^"]*" )?href="\/docs\/[a-z]+"><span class="docs-chapter-media" data-reveal[^>]*>[^]*?data-doc-icon=/g)].length;
assert.equal(iconCards, TOPIC_ORDER.length, 'every chapter card on the index carries its icon');
assert.equal((docs.match(/<h2 id="shelf-[a-z]+"><span data-doc-icon=/g) ?? []).length, 2, 'both shelves lead with an icon');
assert.ok(placeholders.length >= TOPIC_ORDER.length + 2, 'Docs landing page uses icon wayfinding throughout the page');
for (const key of placeholders) {
  assert.ok(Object.hasOwn(DOCS_ICON_SPECS, key), `Docs placeholder ${key} has a typed icon mapping`);
}

// each chapter card on the index is a picture with its icon plate, one per chapter
const cards = [...docs.matchAll(/<a href="\/docs\/([a-z]+)"><span class="docs-chapter-media" data-reveal[^>]*>/g)].map((match) => match[1]);
assert.ok(cards.length >= 13 && new Set(cards).size === cards.length && cards.every((slug) => TOPIC_ORDER.includes(slug)),
  `all focused field manuals have a visual icon plate (${cards.join(', ')})`);
assert.equal((docs.match(/<dt><span data-doc-icon=/g) || []).length, 4,
  'all current-build facts have custom icons');

console.log('docsIcons.selftest: typed field-manual icon coverage passed');
