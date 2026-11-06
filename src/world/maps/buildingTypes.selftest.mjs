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
assert.equal(typeFitsSetting('containerRow', S('railyard')), false, 'a container row in 1945');
assert.equal(typeFitsSetting('habmodule', S('mars')), true, 'a habitat module on Mars');
assert.equal(typeFitsSetting('nosuchtype', S('urban')), false, 'a type without a row stands nowhere');
assert.deepEqual(misplacedTypes('alpine', S('alpine'), { plannedSites: [{ structure: 'onionchurch' }] }), ['alpine: onionchurch'],
  'a map placing a wrong type is caught');

console.log(`buildingTypes selftest: ${Object.keys(BUILDING_TYPES).length} types with years and cultures, ${MAP_IDS.length} maps each placing only types of their place and era`);
