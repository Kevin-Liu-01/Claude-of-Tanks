// vehicleActions.selftest.mjs — the vehicle-action table (owner 2026-10-25: "be able to see the actions u can do with
// tank (like engage dozer, lights, missiles, suspension, etc whicha ll need to be organized and set btw so its
// consistent which keys do what and their order with each other and not letting suspension keep getting cut off)").
// One order, one key per action on every vehicle, no key shared with any other default, names and tips in both
// catalogs, Settings › Controls in the table's order, and every vehicle of the fleet showing its actions in that order.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACTION_DEFS, DEFAULT_BINDINGS } from './input.ts';
import { FLIGHT_ACTIONS, VEHICLE_ACTIONS, availableVehicleActions, vehicleAction, vehicleActionDefaultKeys } from './vehicleActions.ts';
import { vehicleActionsFor } from '../ui/vehicleActionList.ts';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { ALL_TANK_IDS, getSpec } from '../vehicles/specs.ts';
import { auxiliaryCapabilities } from '../vehicles/auxiliaryInventory.ts';
import { uiIconIds } from '../ui/uiIcons.ts';
import { setLocale } from '../ui/i18n.ts';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const ALL = [...VEHICLE_ACTIONS, ...FLIGHT_ACTIONS];

// --- the table: its order, unique ids, bindings and keys, each the input layer's default ---
assert.deepEqual(VEHICLE_ACTIONS.map((def) => def.id), ['jump', 'suspension', 'atgm', 'reload', 'drone', 'smoke', 'lights', 'roofGun']);
assert.deepEqual(VEHICLE_ACTIONS.map((def) => def.key), ['KeyF', 'KeyE', 'KeyQ', 'KeyC', 'KeyV', 'KeyG', 'KeyN', 'KeyB'],
  'F jump, E suspension, Q ATGM, C reload, V drone, G smoke, N lights, B roof gun');
assert.deepEqual(FLIGHT_ACTIONS.map((def) => [def.id, def.key]), [['vision', 'KeyI'], ['supplyAmmo', 'KeyJ'], ['supplyHeal', 'KeyK']]);
for (const field of ['id', 'binding', 'key']) assert.equal(new Set(ALL.map((def) => def[field])).size, ALL.length, `every action has its own ${field}`);
for (const def of ALL) {
  assert.equal(DEFAULT_BINDINGS[def.binding], def.key, `${def.binding}: the input layer's default is the table's ${def.key}`);
  assert.equal(vehicleAction(def.id), def);
}
assert.deepEqual(vehicleActionDefaultKeys(), Object.fromEntries(ALL.map((def) => [def.binding, def.key])));
const codes = Object.values(DEFAULT_BINDINGS);
assert.equal(new Set(codes).size, codes.length, 'no action key shares a code with any other default binding');
assert.match(read('./input.ts'), /\.\.\.vehicleActionDefaultKeys\(\),/, 'the input layer takes its vehicle keys from the table');
assert.match(read('./input.ts'), /for \(const action of \['smoke','lights','roofGun','atgm'\] as const\) \{/,
  'Q never steals a key a player had already bound to something else');

// --- glyphs in the shared set; names and tips in both catalogs, zh in Chinese ---
const icons = new Set(uiIconIds());
const en = JSON.parse(read('../ui/i18nCatalog.en-US.json')), zh = JSON.parse(read('../ui/i18nCatalog.zh-CN.json'));
for (const def of ALL) {
  assert.ok(icons.has(def.glyph), `${def.id}: ${def.glyph} is a shared glyph`);
  for (const key of [def.label, def.help]) {
    assert.ok(en[key] && zh[key], `${def.id}: ${key} in both catalogs`);
    assert.match(zh[key], /[一-鿿]/, `${def.id}: ${key} reads in Chinese`);
  }
}

// --- Settings › Controls: the vehicle's group and the flight's, in the table's order with its names ---
const group = (name) => ACTION_DEFS.filter((def) => def.group === name);
assert.deepEqual(group('settings.group.vehicle').map((def) => [def.id, def.label]),
  VEHICLE_ACTIONS.filter((def) => def.binding !== 'selfRight').map((def) => [def.binding, def.label]),
  'the vehicle group is the table (its jump is the movement group\'s self-right, F)');
assert.deepEqual(group('settings.group.flight').map((def) => [def.id, def.label]), FLIGHT_ACTIONS.map((def) => [def.binding, def.label]));
for (const name of ['settings.group.vehicle', 'settings.group.flight']) assert.ok(en[name] && zh[name], `${name} in both catalogs`);
const groupsInOrder = [...new Set(ACTION_DEFS.map((def) => def.group))];
assert.equal(new Set(groupsInOrder).size, groupsInOrder.length, 'each group is one run of rows');

// --- the fleet: every vehicle's actions, in the table's order, from the battle's kit and the Garage's summary alike ---
await ensureAuthorityFleet(ALL_TANK_IDS);
setLocale('en-US');
const order = VEHICLE_ACTIONS.map((def) => def.id);
const seen = new Set();
for (const id of ALL_TANK_IDS) {
  const spec = getSpec(id);
  if (!spec) continue;
  const inventory = auxiliaryCapabilities(spec);
  const kit = inventory ? { smoke: inventory.smoke.length, lights: !!inventory.lights, guns: inventory.guns.length } : null;
  const battle = availableVehicleActions(spec, kit);
  const garage = vehicleActionsFor(spec);
  assert.deepEqual(garage.map((entry) => entry.id), battle, `${id}: the Garage shows the battle's actions`);
  assert.deepEqual(battle, order.filter((action) => battle.includes(action)), `${id}: in the table's order`);
  assert.ok(!battle.includes('jump') && !battle.includes('drone'), `${id}: the mode's actions only with the mode`);
  for (const action of battle) seen.add(action);
}
assert.deepEqual([...seen].sort(), ['atgm', 'lights', 'reload', 'roofGun', 'smoke', 'suspension'], 'the fleet carries every vehicle action');
const ids = (id, mode) => availableVehicleActions(getSpec(id), null, mode);
assert.deepEqual(ids('mbt70'), ['suspension', 'atgm'], 'MBT-70: its suspension on E and its Shillelagh on Q');
assert.deepEqual(ids('m1a3'), ['atgm', 'reload'], 'M1A3: the ATGM on Q and the magazine reload on C, both shown');
assert.deepEqual(ids('strv103b', { jump: true, drone: true }), ['jump', 'suspension', 'drone'], 'a mode adds its jump first and its drone');
const mbt70 = vehicleActionsFor(getSpec('mbt70'));
assert.deepEqual(mbt70.map((entry) => [entry.key, entry.label]), [['E', 'Suspension'], ['Q', 'ATGM'], ...mbt70.slice(2).map((entry) => [entry.key, entry.label])]);
assert.deepEqual(vehicleActionsFor(getSpec('mbt70'), {}, (binding) => (binding === 'atgm' ? 'X' : null))[1].key, 'X', 'a player\'s own binding shows');
assert.equal(vehicleActionsFor(getSpec('mbt70'))[0].glyph, 'track');

// --- the HUD row reads the table: the ATGM on its tile everywhere, the reload its own, the suspension alone on E ---
const hud = read('../ui/hud.ts');
assert.match(hud, /setHidden\(missileButton,extraMissileSlot<0\|\|!player\?\.spec\?\.gun\?\.shells\.some\(shell=>!shell\.guided\)\);/,
  'every launcher beside a conventional round shows the ATGM tile');
assert.match(hud, /setHidden\(reloadButton,!autoloaded\);/, 'every autoloader shows the reload tile');
assert.match(hud, /specialButton\.hidden = !suspension;/, 'the special tile is the suspension alone');
assert.match(hud, /bus\.on\('ui:atgmToggle', toggleExtraMissile\);/, 'Q toggles as the tile does');
assert.match(read('./playerBattleActions.ts'), /onAction\('atgm', \(\) => \{\n\s*if \(!battleInputAllowed\(\)\) return;\n\s*bus\.emit\('ui:atgmToggle', \{\}\);/,
  'Q reaches the battle');

console.log(`vehicleActions.selftest: ${VEHICLE_ACTIONS.length} vehicle and ${FLIGHT_ACTIONS.length} flight actions, each on its own key `
  + `(${VEHICLE_ACTIONS.map((def) => def.key.slice(3)).join(' ')}), named in both catalogs, Settings in the table's order, `
  + `and ${ALL_TANK_IDS.length} vehicles showing their actions in it passed`);
