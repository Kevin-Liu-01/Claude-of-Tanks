import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { INTERIOR_FILL_DEFAULTS, INTERIOR_FILL_RELEASE, interiorFillOptions, interiorFillSelection, mergeInteriorFillGroup } from './interior-fill-selection.mjs';
const registry = { first: 'shared', sibling: 'shared', missingSibling: 'shared', single: 'single' };
assert.deepEqual(interiorFillSelection(registry, ['first']), ['first']);
assert.deepEqual(interiorFillSelection(registry, ['single', 'first']), ['first', 'single']);
// 2026-10-16 (test-speed R4c): a repeated id fails instead of being silently de-duplicated
assert.throws(() => interiorFillSelection(registry, ['single', 'first', 'first']), /lists first 2 times/);
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

// 2026-10-16 (test-speed R4c): --release is the shipped records' --rounds=8 --min-fine=1 (the 226 regen ran the bare
// defaults and re-filled 37 tanks); an explicit flag that contradicts it fails, and the bare defaults stay as they were.
assert.deepEqual(INTERIOR_FILL_RELEASE, { rounds: 8, minFine: 1 });
assert.deepEqual(INTERIOR_FILL_DEFAULTS, { rounds: 4, minFine: 12 });
assert.deepEqual(interiorFillOptions(['--ids=a', '--release']), { rounds: 8, minFine: 1, release: true });
assert.deepEqual(interiorFillOptions(['--ids=a']), { rounds: 4, minFine: 12, release: false }, 'bare defaults unchanged');
assert.deepEqual(interiorFillOptions(['--rounds=8', '--min-fine=1']), { rounds: 8, minFine: 1, release: true },
  'the release flags spelled out are the release preset');
assert.deepEqual(interiorFillOptions(['--release', '--rounds=8', '--min-fine=1']), { rounds: 8, minFine: 1, release: true });
assert.deepEqual(interiorFillOptions(['--min-fine=0']), { rounds: 4, minFine: 0, release: false });
assert.throws(() => interiorFillOptions(['--release', '--rounds=4']), /--release generates with --rounds=8; drop --rounds=4 or --release/);
assert.throws(() => interiorFillOptions(['--release', '--min-fine=12']), /--release generates with --min-fine=1; drop --min-fine=12/);
assert.equal(interiorFillOptions(['--rounds=0']).rounds, 1, 'at least one round');
const generator = readFileSync('tools/gen-interior-fills.mjs', 'utf8');
assert.match(generator, /const \{ rounds: ROUNDS, minFine: MIN_FINE, release: RELEASE_PRESET \} = interiorFillOptions\(args\);/,
  'the generator reads its rounds and fine-box floor from interiorFillOptions');
assert.doesNotMatch(generator, /opt\('(rounds|min-fine)'/, 'the generator keeps no private flag parsing');
console.log('interior fill selection: --release = --rounds=8 --min-fine=1, contradictions fail, a repeated id fails PASS');
