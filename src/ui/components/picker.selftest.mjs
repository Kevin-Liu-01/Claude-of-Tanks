// The kit's picker (picker.ts): the one "choose one of a set" (INTERACTION-REDESIGN.md, the picker contract). The pure
// helpers carry the behaviour (the filter, the grid step, the memory); the source checks pin the keys, the ARIA and the
// preview contract the controller wires to them. Copyright © 2026 Kevin B. Liu.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { filterItems, gridStep, readMemory, remember, toggleFavourite } from './picker.ts';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const none = { favourites: [], recent: [] };
const all = { text: '', tags: [], favourites: false, recent: false };
const items = [
  { id: 'random', name: 'Random' },
  { id: 'verdant', name: 'Verdant Fields', facts: ['Medium', 'Temperate'], tags: ['temperate', 'medium'] },
  { id: 'desert', name: 'Sirocco Wadi', facts: ['Large', 'Desert'], tags: ['desert', 'large'] },
  { id: 'winter', name: 'Frosthollow', facts: ['Medium', 'Winter'], tags: ['winter', 'medium'] },
  { id: 'reservoir', name: 'Highland Reservoir', facts: ['Large', 'Temperate'], tags: ['temperate', 'large'] },
  { id: 'quebec', name: 'Montréal Docks', facts: ['Small', 'Urban'], tags: ['urban', 'small'] },
];
const ids = (list) => list.map((item) => item.id);

// 1. The filter keeps the caller's order; Random leads and survives every chip, only a search that misses it drops it.
assert.deepEqual(ids(filterItems(items, all, none, 'random')), ['random', 'verdant', 'desert', 'winter', 'reservoir', 'quebec']);
assert.deepEqual(ids(filterItems(items, { ...all, tags: ['temperate'] }, none, 'random')), ['random', 'verdant', 'reservoir'], 'a chip keeps its tag');
assert.deepEqual(ids(filterItems(items, { ...all, tags: ['temperate', 'large'] }, none, 'random')), ['random', 'reservoir'], 'pressed chips combine');
assert.deepEqual(ids(filterItems(items, { ...all, text: 'large temp' }, none, 'random')), ['reservoir'], 'every word matches a name or a fact');
assert.deepEqual(ids(filterItems(items, { ...all, text: 'montreal' }, none)), ['quebec'], 'accents fold');
assert.deepEqual(ids(filterItems(items, { ...all, text: 'RAND' }, none, 'random')), ['random'], 'Random answers its own name');
assert.deepEqual(ids(filterItems(items, all, none)), ids(items), 'without a Random id every item is an ordinary one');

// 2. Favourites and recents: the chips keep them, recents in the order they were chosen.
const memory = { favourites: ['winter', 'desert'], recent: ['reservoir', 'verdant'] };
assert.deepEqual(ids(filterItems(items, { ...all, favourites: true }, memory, 'random')), ['random', 'desert', 'winter']);
assert.deepEqual(ids(filterItems(items, { ...all, recent: true }, memory, 'random')), ['random', 'reservoir', 'verdant'], 'recents in their order');
let m = remember(none, 'desert');
for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) m = remember(m, id);
assert.deepEqual(m.recent, ['f', 'e', 'd', 'c', 'b', 'a'], 'six recents, newest first');
assert.deepEqual(remember({ favourites: [], recent: ['a', 'b', 'c'] }, 'c').recent, ['c', 'a', 'b'], 'a repeat moves to the front');
assert.deepEqual(toggleFavourite(toggleFavourite(none, 'x'), 'x').favourites, [], 'F twice is no favourite');
assert.deepEqual(toggleFavourite(none, 'x').favourites, ['x']);

// 3. The memory survives a missing, broken or refusing storage: the picker then remembers nothing and still works.
assert.deepEqual(readMemory(undefined, { getItem: () => '{"favourites":["a"]}' }), none, 'no key, no memory');
assert.deepEqual(readMemory('maps', { getItem: () => '{"favourites":["a",3],"recent":["b"]}' }), { favourites: ['a'], recent: ['b'] }, 'only ids are kept');
assert.deepEqual(readMemory('maps', { getItem: () => '{broken' }), none);
assert.deepEqual(readMemory('maps', { getItem: () => { throw new Error('denied'); } }), none);
assert.deepEqual(readMemory('maps', null), none);

// 4. The grid step: one item left and right, a row up and down, clamped at the ends; Home and End; nothing else moves.
assert.equal(gridStep(0, 'ArrowRight', 4, 10), 1);
assert.equal(gridStep(5, 'ArrowDown', 4, 10), 9);
assert.equal(gridStep(9, 'ArrowDown', 4, 10), 9, 'the last row stays');
assert.equal(gridStep(1, 'ArrowUp', 4, 10), 0, 'the first row clamps to the start');
assert.equal(gridStep(0, 'ArrowLeft', 4, 10), 0, 'no wrap past the start');
assert.equal(gridStep(3, 'ArrowDown', 1, 10), 4, 'a list moves one row');
assert.equal(gridStep(4, 'Home', 4, 10), 0);
assert.equal(gridStep(4, 'End', 4, 10), 9);
assert.equal(gridStep(4, 'a', 4, 10), null);
assert.equal(gridStep(0, 'ArrowRight', 4, 0), null);

// 5. The controller's contract (source): the registry stamp, the listbox, the keys, one preview a frame, no dialog.
const source = read('./picker.ts');
assert.match(source, /host\.dataset\.picker = options\.id;/, 'the picker stamps its registry id');
assert.match(source, /role="listbox" aria-label="/, 'a named listbox');
assert.match(source, /role="option" [^`]*aria-selected="\$\{chosen\}"/, 'options carry their chosen state');
for (const key of ["event.key === 'Escape'", "event.key === '/'", "event.key === 'Enter' || event.key === ' '", "event.key === 'f' || event.key === 'F'",
  "event.key === 'r' || event.key === 'R'"]) assert.ok(source.includes(key), `the picker answers ${key}`);
assert.match(source, /frame = requestAnimationFrame\(\(\) => \{/, 'previews coalesce to one a frame');
assert.match(source, /if \(id === previewed\) return;/, 'a repeat preview is dropped');
assert.match(source, /onFocusOut[^\n]*preview\(null\)/, 'leaving the picker restores');
assert.match(source, /if \(!fine \|\| event\.pointerType === 'touch'\) return;/, 'touch never previews on hover: a tap chooses');
assert.doesNotMatch(source, /createModal|<dialog|showModal/, 'choosing never opens a dialog');
assert.match(source, /try \{ storage\.setItem/, 'storage writes are guarded');
// (261) a list row's portrait loads ahead of its row: an observer rooted on the list watches the thumbnail's box (an image
// with no source has no height, and a box of none never intersects)
assert.match(source, /new IntersectionObserver\([\s\S]*?\{ root: grid, rootMargin: THUMB_AHEAD \}\)/, 'the portraits load from an observer rooted on the list');
assert.match(source, /thumbs\.observe\(img\.parentElement!\)/, "it watches the thumbnail's box, never the empty image");

// 6. The sheet: the kit's tokens, the chosen tile's accent wash and edge, 44 px touch targets.
const sheet = read('./pickers.css');
assert.match(sheet, /\.cot-c-picker__opt\[aria-selected=true\]\{background:var\(--chip-fill-on\);box-shadow:var\(--ring-accent\)\}/);
assert.match(sheet, /@media \(pointer:coarse\)\{\n  \.cot-c-picker__fav\{width:44px;height:44px\}/, 'the star is a 44 px target on touch');
assert.match(sheet, /\.cot-c-picker__fav\{[^}]*border-radius:var\(--control-radius\)/, 'the star is the kit\'s square icon button, not a media disc');
assert.match(sheet, /\.cot-c-picker--list \.cot-c-picker__opt\{[^}]*min-height:44px/, 'list rows are touch targets');
// (262, the loading census) a card's picture fades in once decoded over its box's tone, never popping in or, offline,
// drawing a broken frame; one already decoded stands at once on a re-render
assert.match(sheet, /:is\(\.cot-c-picker__media,\.cot-bf__hero\) img\{opacity:0;transition:opacity/, "a card's picture waits on its tone");
assert.match(sheet, /:is\(\.cot-c-picker__media,\.cot-bf__hero\) img\[data-ready\]\{opacity:1\}/, 'and shows once decoded');
assert.match(source, /closest\('\.cot-c-picker__thumb,\.cot-c-picker__media'\)\) \(event\.target as Element\)\.setAttribute\('data-ready', ''\)/,
  "a card picture's load marks it ready");
assert.match(source, /\.cot-c-picker__media img'\)\) \{\n\s+if \(img\.complete && img\.naturalWidth > 0\) img\.setAttribute\('data-ready', ''\);/,
  'a decoded one stands at once in render');
assert.match(source, /globalThis\.addEventListener\?\.\('online', onOnline\)/, 'a picture the network dropped asks again once it is back');
assert.match(source, /globalThis\.removeEventListener\?\.\('online', onOnline\)/, 'and the picker lets go of the page on dispose');

console.log('picker.selftest: the filter (Random first, chips, search, favourites, recents), the memory, the grid step and the controller contract pass');
