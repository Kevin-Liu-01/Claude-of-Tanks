import assert from 'node:assert/strict';
import { CAMO_CATALOG_PATTERN_IDS } from '../vehicles/materials.ts';
import { CAMO_KINDS, camoKindOf, camoPickerFilters, camoPickerItems } from './camoPicker.ts';

// The Garage's camo picker (INTERACTION-REDESIGN B): every paint once, Auto leading, "Make your own" last, each named
// with its nation and its kind (two facts at most) and filterable by its kind; the kinds are the picker's chips.

// the Garage's flag-tag map (garage.ts CAMO_TAG_NATION): spec nations are display-cased
const NATION_OF_TAG = { usa: 'USA', de: 'Germany', ru: 'Russia', uk: 'UK', fr: 'France', cn: 'China', it: 'Italy',
  jp: 'Japan', pl: 'Poland', kr: 'South Korea', se: 'Sweden', il: 'Israel', ua: 'Ukraine' };
const words = {
  label: (id) => `L:${id}`,
  nationOfTag: (tag) => NATION_OF_TAG[tag] ?? null,
  nationName: (nation) => `N:${nation}`,
  kindName: (kind) => `K:${kind}`,
  auto: 'Auto',
  makeOwn: 'Make your own',
};

// the kinds
assert.equal(camoKindOf('factory', ['ua', 'factory']), 'service', "a tank's own factory coat is its nation's service coat");
assert.ok(CAMO_CATALOG_PATTERN_IDS.some((id) => id.startsWith('service_')));
for (const id of CAMO_CATALOG_PATTERN_IDS) {
  if (id.startsWith('service_') || id.startsWith('national_')) assert.equal(camoKindOf(id, []), 'service', id);
  if (id.startsWith('sig_')) assert.equal(camoKindOf(id, []), 'signature', id);
}
assert.equal(camoKindOf('desert', ['desert']), 'seasonal');
assert.equal(camoKindOf('ducky', ['special']), 'special');

// the items
const items = camoPickerItems(CAMO_CATALOG_PATTERN_IDS, 'Ukraine', words, { custom: true });
assert.equal(items[0].id, 'auto', 'Auto leads');
assert.equal(items.at(-1).id, 'custom', 'Make your own is the last swatch');
assert.equal(items.at(-1).name, 'Make your own');
const ids = items.map((item) => item.id);
assert.equal(new Set(ids).size, ids.length, 'every paint once');
for (const id of CAMO_CATALOG_PATTERN_IDS) assert.ok(ids.includes(id), `${id} is offered`);
for (const item of items) {
  assert.ok(item.facts.length >= 1 && item.facts.length <= 2, `${item.id}: one or two facts`);
  assert.ok(item.facts.at(-1).startsWith('K:'), `${item.id}: its kind is its last fact`);
}
const factory = items.find((item) => item.id === 'factory');
assert.deepEqual(factory.facts, ['N:Ukraine', 'K:service'], "the factory coat names the tank's nation");
assert.equal(factory.name, 'L:factory');
for (const item of items.slice(1, -1)) {
  const kind = item.tags[0];
  assert.ok(CAMO_KINDS.includes(kind), `${item.id}: its kind leads its tags (${kind})`);
}
const counts = Object.fromEntries(CAMO_KINDS.map((kind) => [kind, items.filter((item) => item.tags[0] === kind).length]));
for (const kind of CAMO_KINDS) assert.ok(counts[kind] > 0, `the ${kind} chip keeps paints`);
assert.ok(!camoPickerItems(CAMO_CATALOG_PATTERN_IDS, 'Ukraine', words, { custom: false }).some((item) => item.id === 'custom'),
  'without the studio there is no Make your own');

// the chips
assert.deepEqual(camoPickerFilters(words).map((filter) => filter.id), [...CAMO_KINDS]);

console.log(`camoPicker selftest: PASS (${items.length} swatches: ${CAMO_KINDS.map((kind) => `${kind} ${counts[kind]}`).join(', ')})`);
