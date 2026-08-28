import assert from 'node:assert/strict';

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

const { createElement, ensureStyle } = await import('./dom.ts');

const style = ensureStyle('test-style', '.test{}');
assert.equal(style.id, 'test-style');
assert.equal(style.textContent, '.test{}');
assert.equal(ensureStyle('test-style', '.replacement{}'), style);
assert.equal(appendedStyles.length, 1, 'style injection is idempotent by id');

const parent = document.createElement('section');
const child = createElement('button', 'test-button', parent);
assert.equal(child.tagName, 'BUTTON');
assert.equal(child.className, 'test-button');
assert.deepEqual(parent.children, [child]);

console.log('dom.selftest: shared style and element gates passed');
