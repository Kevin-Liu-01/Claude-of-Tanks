// Receipt: every playable vehicle is classified exactly once per fleet facet (class, battle role, design status),
// each facet agrees with the vehicle's tuning, every label is translated, and the facet search finds what it names.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './tankFactory.ts';
import { PRODUCTION_TANK_IDS, SAVED_TANK_IDS, TANK_SPECS, VISIBLE_TANK_IDS } from './specs.ts';
import { VEHICLE_ROLE_PROFILES } from './roleProfiles.ts';
import { tankTier } from './tier.ts';
import {
  CLASS_MECHANICAL_ROLES,
  CONCEPT_PROTOTYPE_CLASS_FILTER,
  CONCEPT_PROTOTYPE_FILTER_META,
  ROLE_DOCTRINES,
  VEHICLE_BATTLE_ROLE_META,
  VEHICLE_BATTLE_ROLE_ORDER,
  VEHICLE_CLASS_META,
  VEHICLE_CLASS_ORDER,
  VEHICLE_DESIGN_STATUS_META,
  VEHICLE_DESIGN_STATUS_ORDER,
  isVehicleBattleRole,
  isVehicleClass,
  isVehicleDesignStatus,
  matchesVehicleClassFilter,
  matchesVehicleRoleFilter,
  vehicleBattleRoleForId,
  vehicleClassForId,
  vehicleDesignStatusForId,
  vehicleFacetLabel,
  vehicleFacetSearchWords,
  vehicleFacetsForId,
  vehicleIdsForFacet,
} from './vehicleFacets.ts';
import {
  isEmptyVehicleFacetQuery,
  matchesVehicleFacetQuery,
  parseVehicleFacetQuery,
} from './vehicleFacetSearch.ts';

const playable = [...new Set([...SAVED_TANK_IDS, ...VISIBLE_TANK_IDS, ...PRODUCTION_TANK_IDS])].sort();
const saved = new Set(SAVED_TANK_IDS);
assert.ok(playable.length >= 220, `the playable fleet is the full roster (${playable.length})`);

const FACETS = [
  { facet: 'class', order: VEHICLE_CLASS_ORDER, forId: vehicleClassForId, is: isVehicleClass },
  { facet: 'role', order: VEHICLE_BATTLE_ROLE_ORDER, forId: vehicleBattleRoleForId, is: isVehicleBattleRole },
  { facet: 'status', order: VEHICLE_DESIGN_STATUS_ORDER, forId: vehicleDesignStatusForId, is: isVehicleDesignStatus },
];

// 1. Exactly once per facet, no stale ids, every value populated, tables alphabetical.
for (const { facet, order, forId, is } of FACETS) {
  const appearances = new Map();
  for (const value of order) {
    assert.ok(is(value), `${facet}:${value} is a recognized value`);
    const members = vehicleIdsForFacet(facet, value);
    assert.ok(members.length > 0, `${facet}:${value} has at least one vehicle`);
    assert.deepEqual([...members], [...members].sort(), `${facet}:${value} stays alphabetical for review`);
    for (const id of members) {
      assert.ok(saved.has(id), `${facet}:${value} lists ${id}, which is not a registered vehicle`);
      appearances.set(id, (appearances.get(id) || 0) + 1);
    }
  }
  for (const id of playable) {
    assert.equal(appearances.get(id) || 0, 1, `${id} is classified exactly once in the ${facet} facet`);
    assert.ok(is(forId(id)), `${id}: ${facet} lookup returns a canonical value`);
  }
  assert.equal([...appearances.values()].reduce((a, b) => a + b, 0), playable.length,
    `${facet} facet covers the playable fleet and nothing else`);
}
assert.equal(vehicleFacetsForId('not_a_tank'), null, 'an unclassified id has no facets');
assert.equal(isVehicleClass('concept'), false, 'concept is a design status, not a class');

// 2. Facets agree with the tuning: role with the tactical doctrine, class with the mechanical role.
for (const id of playable) {
  const facets = vehicleFacetsForId(id);
  const doctrine = VEHICLE_ROLE_PROFILES[id]?.doctrine;
  assert.ok(ROLE_DOCTRINES[facets.battleRole].includes(doctrine),
    `${id}: battle role ${facets.battleRole} contradicts tactical doctrine ${doctrine}`);
  assert.ok(CLASS_MECHANICAL_ROLES[facets.vehicleClass].includes(TANK_SPECS[id].role),
    `${id}: class ${facets.vehicleClass} contradicts mechanical role ${TANK_SPECS[id].role}`);
}

// 3. The owner's concept / prototype class is exactly the non-service status cut.
const conceptPrototype = playable.filter((id) => matchesVehicleClassFilter(vehicleFacetsForId(id), CONCEPT_PROTOTYPE_CLASS_FILTER));
assert.deepEqual(conceptPrototype,
  [...vehicleIdsForFacet('status', 'prototype'), ...vehicleIdsForFacet('status', 'concept')].sort());
assert.ok(playable.every((id) => matchesVehicleClassFilter(vehicleFacetsForId(id), 'all')
  && matchesVehicleRoleFilter(vehicleFacetsForId(id), 'all')), "'all' keeps every vehicle");

// 4. Rulings that define the vocabulary.
const RULINGS = {
  kv2: ['heavy', 'breakthrough', 'service'],
  m46_patton: ['medium', 'frontline', 'service'],
  challenger2: ['mbt', 'sniper', 'service'],
  leo2a6: ['mbt', 'frontline', 'service'],
  t90m: ['mbt', 'breakthrough', 'service'],
  leclerc_xlr: ['mbt', 'flanker', 'service'],
  strv103b: ['td', 'sniper', 'service'],
  aft10: ['td', 'sniper', 'service'],
  m551_sheridan: ['light', 'scout', 'service'],
  pl01: ['light', 'scout', 'concept'],
  cv90: ['ifv', 'support', 'service'],
  m3a3_bradley: ['ifv', 'scout', 'service'],
  ares_apc: ['apc', 'scout', 'service'],
  m6_linebacker: ['spaa', 'scout', 'service'],
  tos1a_tagil: ['fire-support', 'support', 'service'],
  bmpt_terminator2: ['fire-support', 'support', 'service'],
  t14_armata: ['mbt', 'breakthrough', 'prototype'],
  kf51_panther: ['mbt', 'frontline', 'prototype'],
  t72b3m_hetman: ['mbt', 'breakthrough', 'concept'],
};
for (const [id, [vehicleClass, battleRole, designStatus]] of Object.entries(RULINGS)) {
  assert.deepEqual(vehicleFacetsForId(id), { vehicleClass, battleRole, designStatus }, `${id} facet ruling`);
}

// 5. Every label is in both locales and translated.
const en = JSON.parse(readFileSync(new URL('../ui/i18nCatalog.en-US.json', import.meta.url), 'utf8'));
const zh = JSON.parse(readFileSync(new URL('../ui/i18nCatalog.zh-CN.json', import.meta.url), 'utf8'));
const metas = [
  ...VEHICLE_CLASS_ORDER.map((value) => VEHICLE_CLASS_META[value]),
  ...VEHICLE_BATTLE_ROLE_ORDER.map((value) => VEHICLE_BATTLE_ROLE_META[value]),
  ...VEHICLE_DESIGN_STATUS_ORDER.map((value) => VEHICLE_DESIGN_STATUS_META[value]),
  CONCEPT_PROTOTYPE_FILTER_META,
];
for (const meta of metas) {
  for (const key of [meta.labelKey, meta.shortKey, meta.hintKey].filter(Boolean)) {
    assert.equal(typeof en[key], 'string', `en-US carries ${key}`);
    assert.equal(typeof zh[key], 'string', `zh-CN carries ${key}`);
    assert.notEqual(zh[key], en[key], `zh-CN translates ${key}`);
  }
  assert.equal(en[meta.labelKey], meta.label, `${meta.labelKey}: the English fallback matches the catalog`);
  assert.ok(meta.aliases.every((alias) => alias === alias.toLowerCase()), `${meta.labelKey}: aliases are lowercase`);
}
for (const key of ['fleet.filter.class', 'fleet.filter.role', 'fleet.filter.allClasses', 'fleet.filter.allRoles']) {
  assert.ok(en[key] && zh[key] && en[key] !== zh[key], `${key} is translated`);
}
const zhTranslate = (key) => zh[key] ?? key;
assert.equal(vehicleFacetLabel(VEHICLE_CLASS_META.td), 'Tank destroyer', 'English fallback without a catalog');
assert.equal(vehicleFacetLabel(VEHICLE_CLASS_META.td, zhTranslate), zh['fleet.class.td']);
assert.equal(vehicleFacetLabel(VEHICLE_CLASS_META.td, (key) => key), 'Tank destroyer', 'a missing key falls back');

// 6. Facet search: key:value tokens constrain, words match labels in both locales.
const entries = playable.map((id) => ({
  id,
  facets: vehicleFacetsForId(id),
  era: TANK_SPECS[id].era,
  nationTerms: [String(TANK_SPECS[id].nation).toLowerCase()],
  tier: tankTier(id),
  searchText: `${id} ${vehicleFacetSearchWords(vehicleFacetsForId(id), zhTranslate)}`,
}));
const search = (query) => entries.filter((entry) => matchesVehicleFacetQuery(entry, parseVehicleFacetQuery(query)))
  .map((entry) => entry.id);
const members = (facet, ...values) => values.flatMap((value) => vehicleIdsForFacet(facet, value)).sort();
assert.deepEqual(search('class:td'), members('class', 'td'));
assert.deepEqual(search('class:destroyer'), members('class', 'td'), 'class aliases resolve');
assert.deepEqual(search('class:"tank destroyer"'), members('class', 'td'), 'quoted facet values resolve');
assert.deepEqual(search('class:td class:spaa'), members('class', 'td', 'spaa'), 'one key ORs its values');
assert.deepEqual(search('role:recon'), members('role', 'scout'));
assert.deepEqual(search('status:proto'), members('status', 'prototype'));
assert.deepEqual(search('class:concept'), conceptPrototype, "the owner's concept / prototype class");
assert.deepEqual(search('class:ifv role:scout'), members('class', 'ifv').filter((id) => vehicleBattleRoleForId(id) === 'scout'),
  'different keys AND');
assert.deepEqual(search('era:ww2'), playable.filter((id) => TANK_SPECS[id].era === 'ww2'));
assert.deepEqual(search('tier:7'), playable.filter((id) => tankTier(id) === 7));
assert.deepEqual(search('tier:viii-ix'), playable.filter((id) => tankTier(id) >= 8 && tankTier(id) <= 9));
assert.deepEqual(search('nation:"south korea"'), playable.filter((id) => TANK_SPECS[id].nation === 'South Korea'));
assert.deepEqual(search('nation:korea'), search('nation:"south korea"'), 'a nation word matches from its start');
assert.deepEqual(search('nation:usa'), playable.filter((id) => TANK_SPECS[id].nation === 'USA'));
assert.ok(search('nation:us').every((id) => !/^(Russia|Australia)$/.test(TANK_SPECS[id].nation)),
  'nation:us never matches inside a word (Russia)');
assert.deepEqual(search('nation:russia'), playable.filter((id) => /Russia/.test(TANK_SPECS[id].nation)),
  'USSR/Russia answers nation:russia');
assert.ok(members('class', 'td').every((id) => search('tank destroyer').includes(id)), 'free text finds class labels');
assert.deepEqual(search('坦克歼击车'), members('class', 'td'), 'localized class labels are searchable');
assert.ok(search('sniper').length >= vehicleIdsForFacet('role', 'sniper').length);
assert.ok(isEmptyVehicleFacetQuery(parseVehicleFacetQuery('  class:  ')), 'a facet key still being typed narrows nothing');
assert.deepEqual(parseVehicleFacetQuery('m1a2:sep').terms, ['m1a2:sep'], 'an unknown key stays text');
assert.deepEqual(search('class:nonsense'), [], 'an unknown facet value matches nothing');

const counts = (facet, order) => order.map((value) => `${value} ${vehicleIdsForFacet(facet, value).length}`).join(', ');
console.log(`vehicleFacets.selftest: ${playable.length} vehicles classified once per facet`
  + ` | class: ${counts('class', VEHICLE_CLASS_ORDER)}`
  + ` | role: ${counts('role', VEHICLE_BATTLE_ROLE_ORDER)}`
  + ` | status: ${counts('status', VEHICLE_DESIGN_STATUS_ORDER)}`);
