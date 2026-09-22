import assert from 'node:assert/strict';
import { interiorFillSelection, mergeInteriorFillGroup } from './interior-fill-selection.mjs';
const registry = { first: 'shared', sibling: 'shared', missingSibling: 'shared', single: 'single' };
assert.deepEqual(interiorFillSelection(registry, ['first']), ['first']);
assert.deepEqual(interiorFillSelection(registry, ['single', 'first', 'first']), ['first', 'single']);
assert.deepEqual(interiorFillSelection(registry, Object.keys(registry)), Object.keys(registry).sort());
assert.throws(() => interiorFillSelection(registry, []), /at least one/);
assert.throws(() => interiorFillSelection(registry, ['missing']), /Unknown/);
assert.throws(() => interiorFillSelection(registry, ['toString']), /Unknown/);
const old = { first: { hull: 'old' }, sibling: { hull: 'preserved' } };
const current = { first: { hull: 'new' } };
const merged = mergeInteriorFillGroup(old, current, registry, 'shared');
assert.deepEqual(merged, { first: { hull: 'new' }, sibling: { hull: 'preserved' } });
assert.equal(merged.sibling, old.sibling, 'unrequested sibling record must remain exact');
assert.equal(Object.hasOwn(merged, 'missingSibling'), false, 'scoped generation must not create unrelated runtime geometry');
assert.equal(old.first.hull, 'old', 'merge must not mutate the source module');
assert.throws(() => mergeInteriorFillGroup(old, {single:{}}, registry, 'shared'), /does not belong/);
assert.throws(() => mergeInteriorFillGroup(old, {toString:{}}, registry, 'shared'), /does not belong/);
console.log('interior fill selection: exact scoped updates, preserved siblings/absence and unknown rejection PASS');

assert.deepEqual(mergeInteriorFillGroup(old, {}, {...registry, first:'newFamily'}, 'shared'),
  {sibling:old.sibling}, 'moved tank cannot retain a competing old-family fill');
