import assert from 'node:assert/strict';
import { graphLabels } from '../../tools/receipt-kit.test-support.mjs';

const elements = new Map();
const appendedStyles = [];
globalThis.document = {
  getElementById: (id) => elements.get(id) || null,
  createElement: (tagName) => ({
    tagName: tagName.toUpperCase(),
    appendChild(child) { (this.children ||= []).push(child); },
  }),
  head: {
    appendChild(style) {
      appendedStyles.push(style);
      elements.set(style.id, style);
    },
  },
};

const { createElement } = await import('./dom.ts');
const { ensureStyle } = await import('./styleLayers.ts');

// Style injection lives in styleLayers.ts (brand-ui SPEC §5: one helper, a cascade layer per sheet).
const style = ensureStyle('test-style', '.test{}', 'components');
assert.equal(style.id, 'test-style');
assert.equal(style.textContent, '@layer reset,tokens,base,components,surfaces,utilities,overrides;@layer components{.test{}}');
assert.equal(ensureStyle('test-style', '.replacement{}', 'surfaces'), style);
assert.equal(appendedStyles.length, 1, 'style injection is idempotent by id');

const parent = document.createElement('section');
const child = createElement('button', 'test-button', parent);
assert.equal(child.tagName, 'BUTTON');
assert.equal(child.className, 'test-button');
assert.deepEqual(graphLabels(parent.children), graphLabels([child]));

console.log('dom.selftest: shared style and element gates passed');
