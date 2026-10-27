// consumableLoadout.selftest — the Garage's half of the consumables (2026-10-26, the catalog): the loadout saved per
// tank (`cot.cons.<specId>`), its sanitizing against the vehicle, a fit that swaps, each slot's view (the settings rows'
// and the tray's API) and the picker's groups. Copyright © 2026 Kevin B. Liu.
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};
const {
  CONSUMABLE_ICONS, CONSUMABLE_SLOT_ACTIONS, DEFAULT_CONSUMABLE_LOADOUT, consumableNameKey, consumablePickerGroups,
  consumableSlotsFor, consumableSlotsView, fitConsumable, loadConsumables, saveConsumables,
} = await import('./consumableLoadout.ts');
const { CONSUMABLE_CATALOG } = await import('../sim/consumableRules.ts');

const modern = { era: 'modern', smoke: true }, ww2 = { era: 'ww2', smoke: false };
assert.deepEqual(loadConsumables('t1', modern), [...DEFAULT_CONSUMABLE_LOADOUT], 'nothing saved: the default trio');
assert.deepEqual(saveConsumables('t1', ['aps_charge', 'rations', 'repair'], modern), ['aps_charge', 'rations', 'repair']);
assert.equal(store.get('cot.cons.t1'), '["aps_charge","rations","repair"]');
assert.deepEqual(loadConsumables('t1', modern), ['aps_charge', 'rations', 'repair']);
assert.deepEqual(loadConsumables('t1', ww2), ['first_aid', 'rations', 'repair'],
  'a vehicle that cannot carry an item drops it; the slot takes the first default not fitted');
saveConsumables('t1', DEFAULT_CONSUMABLE_LOADOUT, modern);
assert.equal(store.has('cot.cons.t1'), false, 'the default trio clears the key');
store.set('cot.cons.t2', 'not json');
assert.deepEqual(loadConsumables('t2', modern), [...DEFAULT_CONSUMABLE_LOADOUT], 'a broken save reads as the default');

assert.deepEqual(fitConsumable(['repair', 'first_aid', 'extinguisher'], 0, 'extinguisher'), ['extinguisher', 'first_aid', 'repair'],
  'an item already fitted swaps slots');
assert.deepEqual(fitConsumable(['repair', 'first_aid', 'extinguisher'], 1, 'foliage'), ['repair', 'foliage', 'extinguisher']);

const view = consumableSlotsView(['repair', 'aps_charge', 'governor_override']);
assert.deepEqual(view.map((slot) => slot.action), [...CONSUMABLE_SLOT_ACTIONS], 'the slots answer the existing actions');
assert.deepEqual(view.map((slot) => slot.iconId), ['repair', 'csAps', 'csGovernor']);
assert.equal(view[1].nameKey, 'consumable.apsCharge.name');
assert.deepEqual(view.map((slot) => [slot.cooldownS, slot.charges]), [[35, null], [45, 2], [45, 2]]);
saveConsumables('t3', ['foliage', 'rations', 'track_links'], modern);
assert.deepEqual(consumableSlotsFor('t3').map((slot) => slot.itemId), ['foliage', 'rations', 'track_links']);
assert.ok(CONSUMABLE_CATALOG.every((item) => CONSUMABLE_ICONS[item.id]), 'every item has a glyph');
assert.ok(CONSUMABLE_CATALOG.every((item) => consumableNameKey(item.id).startsWith('consumable.')));

const groups = consumablePickerGroups(['repair', 'first_aid', 'extinguisher'], ww2);
assert.equal(groups.flatMap((group) => group.items).length, CONSUMABLE_CATALOG.length, 'the picker holds the whole catalog');
const entry = (id) => groups.flatMap((group) => group.items).find((item) => item.item.id === id);
assert.equal(entry('aps_charge').lock, 'era', 'a shut item stays in the set with its reason');
assert.equal(entry('smoke_reload').lock, 'smoke');
assert.equal(entry('first_aid').fittedSlot, 1);
assert.equal(entry('foliage').lock, null);

// the i18n catalogs name every item in both locales, short names inside the tile's ten characters
const { readFileSync } = await import('node:fs');
for (const locale of ['en-US', 'zh-CN']) {
  const catalog = JSON.parse(readFileSync(new URL(`../ui/i18nCatalog.${locale}.json`, import.meta.url), 'utf8'));
  for (const item of CONSUMABLE_CATALOG) {
    const stem = consumableNameKey(item.id).slice('consumable.'.length, -'.name'.length);
    for (const field of ['name', 'short', 'effect']) assert.ok(catalog[`consumable.${stem}.${field}`], `${locale}: ${item.id} ${field}`);
    assert.ok([...catalog[`consumable.${stem}.short`]].length <= 10, `${locale}: ${item.id} short name fits the tile`);
    assert.ok(!catalog[`consumable.${stem}.effect`].includes('—'), `${locale}: ${item.id} effect has no em dash`);
  }
  assert.ok(catalog['settings.consumableSlot'].includes('{n}'), `${locale}: the settings row label`);
}
console.log(`consumableLoadout.selftest: saves, gates, fits, ${view.length} slot views, picker groups and both catalogs passed`);
