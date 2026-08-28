import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DOCS_ICON_SPECS, docsIconKeys } from './docsIcons.ts';
import { uiIconIds, uiIconSVG } from '../ui/uiIcons.ts';

const docs = await readFile(new URL('../../docs.html', import.meta.url), 'utf8');
const sharedIds = new Set(uiIconIds());

for (const key of docsIconKeys()) {
  const spec = DOCS_ICON_SPECS[key];
  assert.ok(sharedIds.has(spec.id), `${key} uses a shared custom icon`);
  assert.match(uiIconSVG(spec.id, 24), /^<svg[\s\S]*<\/svg>$/, `${key} renders valid SVG`);
}

const placeholders = [...docs.matchAll(/data-doc-icon="([^"]+)"/g)].map((match) => match[1]);
assert.ok(placeholders.length >= 55, 'Docs landing page uses icon wayfinding throughout the page');
for (const key of placeholders) {
  assert.ok(Object.hasOwn(DOCS_ICON_SPECS, key), `Docs placeholder ${key} has a typed icon mapping`);
}

assert.equal((docs.match(/class="docs-chapter-media"/g) || []).length, 12,
  'all focused field manuals have a visual icon plate');
assert.equal((docs.match(/class="doc-section-icon"/g) || []).length, 12,
  'all overview chapters have a section icon');
assert.equal((docs.match(/class="toc-icon"/g) || []).length, 12,
  'the long-form table of contents has complete icon wayfinding');
assert.equal((docs.match(/<dt><span data-doc-icon=/g) || []).length, 4,
  'all current-build facts have custom icons');

console.log('docsIcons.selftest: typed field-manual icon coverage passed');
