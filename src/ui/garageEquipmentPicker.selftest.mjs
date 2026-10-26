import assert from 'node:assert/strict';
import { EQUIPMENT_CATALOG, EQUIP_CATEGORIES, equipmentPicker } from '../game/equipment.ts';
import { EQUIPMENT_EMPTY_ID, equipmentPickerFilters, equipmentPickerItems } from './garageEquipmentPicker.ts';

// The Garage's equipment picker (INTERACTION-REDESIGN C): Empty first, every catalog item once in category order, each
// named by its short name with what it does, its other slot when it is fitted elsewhere, its category to filter by, and
// a shut item's reason.

const words = {
  short: (id) => `S:${id}`,
  effect: (id) => `E:${id}`,
  category: (id) => `C:${id}`,
  slot: (index) => `Slot ${index + 1}`,
  lock: (id, lock) => `L:${id}:${lock}`,
  empty: 'Empty',
};

const first = EQUIPMENT_CATALOG[0].id;
const second = EQUIPMENT_CATALOG[1].id;
// a modern-era spec takes every item; slot 1 open, the first item fitted in slot 0 and the second in slot 1
const groups = equipmentPicker({ id: 'probe', era: 'modern' }, [first, second, '']);
const items = equipmentPickerItems(groups, 1, words);

assert.equal(items[0].id, EQUIPMENT_EMPTY_ID, 'Empty leads');
assert.equal(items[0].name, 'Empty');
const ids = items.map((item) => item.id);
assert.equal(new Set(ids).size, ids.length, 'every item once');
assert.equal(items.length, EQUIPMENT_CATALOG.length + 1);
for (const item of EQUIPMENT_CATALOG) assert.ok(ids.includes(item.id), `${item.id} is offered`);

// category order: the picker's groups in EQUIP_CATEGORIES order, each item tagged with its category
const order = EQUIP_CATEGORIES.map((category) => category.id).filter((id) => id !== 'all');
const seen = items.slice(1).map((item) => order.indexOf(item.tags[0]));
assert.deepEqual(seen, [...seen].sort((a, b) => a - b), 'the items run in category order');
for (const item of items.slice(1)) {
  assert.equal(item.name, `S:${item.id}`);
  assert.equal(item.facts[0], `E:${item.id}`, `${item.id}: what it does is its first fact`);
  assert.ok(item.facts.length <= 2);
}
assert.deepEqual(items.find((item) => item.id === first).facts, [`E:${first}`, 'Slot 1'], 'fitted in another slot: that slot is its second fact');
assert.deepEqual(items.find((item) => item.id === second).facts, [`E:${second}`], "the open slot's own item carries no slot fact");

// a shut item stays in the set with its reason
const shut = equipmentPickerItems([{ category: { id: 'fire' }, items: [{ item: EQUIPMENT_CATALOG[0], lock: 'mode', fittedSlot: -1 }] }], 0, words);
assert.equal(shut[1].disabled, `L:${first}:mode`);
assert.equal(items.find((item) => item.id === first).disabled, undefined, 'an open item is not shut');

// the chips: the categories without 'all'
assert.deepEqual(equipmentPickerFilters(EQUIP_CATEGORIES.map((category) => category.id), words).map((filter) => filter.id), order);

console.log(`garageEquipmentPicker selftest: PASS (${items.length} cards, ${order.length} chips)`);
