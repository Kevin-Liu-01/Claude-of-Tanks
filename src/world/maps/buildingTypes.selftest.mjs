// src/world/maps/buildingTypes.selftest.mjs — the building types' law (buildings-271, Main 11-06: a type wrong for the
// place cannot be placed):
//   1. every type a kit builds and every type a map places has a row (years, cultures);
//   2. every map's row has a setting, and every generic type its props place fits it (years overlap, cultures meet); a slot
//      the map's own kit builds is that kit's local building (the Navajo `caravanserai` is a trading post) and passes;
//   3. controls: an Orthodox onion church on Catholic Savoie, a caravanserai on the Navajo Nation, a future arcology over
//      1937 Shanghai and a shipping-container row in 1945 each fail the setting check.
import assert from 'node:assert/strict';

const { BUILDING_TYPES, typeFitsSetting, placedTypesOf, misplacedTypes } = await import('./buildingTypes.ts');
const { BUILDING_STYLES } = await import('./buildingStyleTable.ts');
const { MAP_IDS } = await import('./mapIds.ts');
const { getMapConfig } = await import('./index.ts');
const { ARCHITECTURE_STYLES } = await import('./regional/index.ts');

// 1
const kitTypes = new Set(ARCHITECTURE_STYLES.flatMap((s) => Object.keys(s.builders)));
for (const t of kitTypes) assert.ok(t in BUILDING_TYPES, `the kit type ${t} has a row`);
for (const id of MAP_IDS) for (const t of placedTypesOf(getMapConfig(id).props ?? {})) assert.ok(t in BUILDING_TYPES, `${id} places ${t}, which has a row`);

// 2
const styleOf = new Map(ARCHITECTURE_STYLES.map((s) => [s.id, s]));
const kitBuilds = (id) => {
  const style = styleOf.get(BUILDING_STYLES[id].kit);
  return (t) => !!(style?.builders[t] || style?.mapBuilders?.[id]?.[t]);
};
const wrong = MAP_IDS.flatMap((id) => misplacedTypes(id, BUILDING_STYLES[id].setting, getMapConfig(id).props ?? {}, kitBuilds(id)));
assert.deepEqual(wrong, [], `types placed outside their years or cultures:\n${wrong.join('\n')}`);

// 3
const S = (id) => BUILDING_STYLES[id].setting;
assert.equal(typeFitsSetting('onionchurch', S('alpine')), false, 'an onion church in Savoie');
assert.equal(typeFitsSetting('onionchurch', S('verdant')), true, 'an onion church in Prokhorovka');
assert.equal(typeFitsSetting('caravanserai', S('titan_gorge')), false, 'a caravanserai on the Navajo Nation');
assert.equal(typeFitsSetting('caravanserai', S('desert')), true, 'a caravanserai in the Dahar');
assert.equal(typeFitsSetting('arcology', S('blackglass')), false, 'an arcology over 1937 Shanghai');
assert.equal(typeFitsSetting('megatower', S('skybridge')), false, 'a 1970s tower in 1960s Page');
// (a freight row fits 1945: the rail kit's row draws that year's freight there, periodFreight.selftest)
assert.equal(typeFitsSetting('containerRow', S('railyard')), true, 'a freight row in 1945');
assert.equal(typeFitsSetting('habmodule', S('mars')), true, 'a habitat module on Mars');
assert.equal(typeFitsSetting('nosuchtype', S('urban')), false, 'a type without a row stands nowhere');
assert.deepEqual(misplacedTypes('alpine', S('alpine'), { plannedSites: [{ structure: 'onionchurch' }] }), ['alpine: onionchurch'],
  'a map placing a wrong type is caught');
// (typefit-272) the blind A/B's kept placements pass only on their own map, and each is still placed there
assert.equal(typeFitsSetting('saunahut', S('alpine')), false, 'the table still calls a sauna wrong for Savoie');
assert.deepEqual(misplacedTypes('alpine', S('alpine'), { destructibleBuildings: ['saunahut'] }), [], 'the A/B kept Savoie\'s sauna slot');
assert.deepEqual(misplacedTypes('autumn', S('autumn'), { destructibleBuildings: ['saunahut'] }), ['autumn: saunahut'],
  'a sauna the A/B did not keep is still caught');
assert.deepEqual(misplacedTypes('titan_gorge', S('titan_gorge'), { destructibleBuildings: ['deserttent'] }), [],
  'the A/B kept the Navajo Nation\'s wall tent');
for (const [id, t] of [['alpine', 'saunahut'], ['coastal', 'saunahut'], ['winter', 'saunahut'], ['titan_gorge', 'deserttent']]) {
  assert.ok(placedTypesOf(getMapConfig(id).props ?? {}).includes(t), `${id} still places the ${t} the A/B kept (else drop its row)`);
}

console.log(`buildingTypes selftest: ${Object.keys(BUILDING_TYPES).length} types with years and cultures, ${MAP_IDS.length} maps each placing only types of their place and era`);
