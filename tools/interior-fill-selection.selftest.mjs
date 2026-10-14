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

// 2026-10-13 (SSOT 2.19): a record under an id the tank id alias layer renamed moves to the new id unchanged; an
// update for the new id still wins, and an id nothing renames is dropped as before.
const renamed = { retired: { hull: 'shipped' }, sibling: { hull: 'preserved' }, gone: { hull: 'x' } };
const rename = (id) => (id === 'retired' ? 'first' : id);
const carried = mergeInteriorFillGroup(renamed, {}, registry, 'shared', rename);
assert.deepEqual(carried, { first: { hull: 'shipped' }, sibling: { hull: 'preserved' } });
assert.equal(carried.first, renamed.retired, 'the shipped record moves, byte for byte');
assert.deepEqual(mergeInteriorFillGroup(renamed, { first: { hull: 'measured' } }, registry, 'shared', rename).first, { hull: 'measured' });
console.log('interior fill selection: a renamed id carries its record unchanged PASS');
