#!/usr/bin/env node
// glossary.selftest.mjs — src/ui/glossary.json is the single source of the names SPEC 11.2 fixes (BUI-F8).
//
//   - the catalogs agree with every glossary binding and print no retired name (tools/glossary-sync.mjs --check);
//   - the glossary holds every SPEC 11.2 term: the 13 modes (each `playMenu.matchMode.<id>.label` bound), the play
//     surfaces, ERA / HE / HEAT / APFSDS, the outcomes, the crew roles, and every `garage.module.*` key;
//   - the SPEC's named fixes hold: ERA is 爆炸反应装甲 (never 时代切换), HE is 高爆弹 (破甲 is HEAT), and Zone Control has
//     one Chinese name (区域控制) everywhere;
//   - the drift check fires when a bound key, the term or a retired name changes (mutation cases).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyGlossary, glossaryDrift, glossaryPins } from '../../tools/glossary-sync.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => JSON.parse(readFileSync(join(ROOT, path), 'utf8'));
const glossary = read('src/ui/glossary.json');
const catalogs = { 'en-US': read('src/ui/i18nCatalog.en-US.json'), 'zh-CN': read('src/ui/i18nCatalog.zh-CN.json') };

assert.deepEqual(glossaryDrift(glossary, catalogs), [], 'the catalogs agree with the glossary (node tools/glossary-sync.mjs writes them)');

const { groups } = glossary;
const MODES = ['standard', 'capture_the_flag', 'zone_control', 'turbo_ball', 'endless_horde', 'frontline_assault', 'mars',
  'juggernaut', 'infected', 'realistic', 'gun_game', 'drone', 'ac130'];
assert.deepEqual(Object.keys(groups.modes).sort(), [...MODES].sort(), 'every mode has one glossary name');
for (const mode of MODES) {
  assert.ok(groups.modes[mode].keys.includes(`playMenu.matchMode.${mode}.label`), `${mode}: the play-menu label is bound`);
  if (mode !== 'ac130') assert.ok(groups.modes[mode].short.keys.includes(`playMenu.matchMode.${mode}.short`), `${mode}: one short name`);
}
assert.deepEqual(Object.keys(groups.surfaces).sort(), ['campaign', 'lan', 'private', 'solo']);
assert.deepEqual(Object.keys(groups.ammunition).sort(), ['apfsds', 'era', 'he', 'heat']);
assert.deepEqual(Object.keys(groups.outcomes).sort(),
  ['ammoDetonation', 'fire', 'noPenetration', 'overmatch', 'penetration', 'ricochet', 'spall', 'track', 'uncertain']);
assert.deepEqual(Object.keys(groups.roles).sort(), ['commander', 'driver', 'gunner', 'loader', 'radioOperator']);
const moduleKeys = Object.keys(catalogs['en-US']).filter((key) => /^garage\.module\.[a-zA-Z]+$/.test(key) && key !== 'garage.module.tooltip');
const pinned = new Set(glossaryPins(glossary).pins.map((pin) => pin.key));
for (const key of moduleKeys) assert.ok(pinned.has(key), `${key} is bound to a glossary term`);
for (const role of Object.keys(groups.roles)) assert.ok(pinned.has(`garage.crew.${role}`), `garage.crew.${role} is bound`);

// The SPEC's named fixes.
assert.equal(groups.ammunition.era['zh-CN'], '爆炸反应装甲');
assert.equal(groups.ammunition.he['zh-CN'], '高爆弹');
assert.equal(groups.ammunition.heat['zh-CN'], '破甲弹');
assert.equal(catalogs['zh-CN']['studioPanel.fx.eraPop'], '爆炸反应装甲引爆', 'the Studio ERA effect no longer reads "era switch"');
assert.equal(catalogs['zh-CN']['studioPanel.fx.heSplash'], '高爆溅射', 'the Studio HE effect no longer reads HEAT');
assert.equal(catalogs['zh-CN']['garage.shellType.HE'], '高爆弹');
for (const [key, value] of Object.entries(catalogs['zh-CN'])) {
  assert.ok(!value.includes('时代切换'), `${key}: ERA is never "era switch"`);
  assert.ok(!value.includes('区域占领'), `${key}: Zone Control has one Chinese name (区域控制)`);
}
const zoneNames = new Set(groups.modes.zone_control.keys.map((key) => catalogs['zh-CN'][key]));
assert.deepEqual([...zoneNames], ['区域控制']);
for (const code of ['REG', 'BOSS', 'INFECT', 'GUNS', 'FPV', 'WAVE', 'GRAV', 'FRONT']) {
  for (const locale of ['en-US', 'zh-CN']) {
    for (const mode of MODES) {
      assert.notEqual(catalogs[locale][`playMenu.matchMode.${mode}.short`], code, `${mode} (${locale}): the ${code} code is retired`);
    }
  }
}
const garageSource = readFileSync(join(ROOT, 'src/ui/garage.ts'), 'utf8');
assert.doesNotMatch(garageSource, /short:\s*'[A-Z0-9-]{2,}'/, 'the garage button codes (REG / CODE / BOSS / 750 …) are gone from code');

// Mutations: each drift is caught.
const clone = (value) => JSON.parse(JSON.stringify(value));
const drifted = clone(catalogs);
drifted['zh-CN']['garage.battle.zoneLabel'] = '区域占领';
const driftReport = glossaryDrift(glossary, drifted).join('\n');
assert.match(driftReport, /garage\.battle\.zoneLabel \(zh-CN\) reads "区域占领", modes\.zone_control says "区域控制"/);
assert.match(driftReport, /prints the retired name "区域占领"/);
const upperDrift = clone(catalogs);
upperDrift['en-US']['hud.hitOutcome.ricochet'] = 'Ricochet';
assert.match(glossaryDrift(glossary, upperDrift).join('\n'), /hud\.hitOutcome\.ricochet \(en-US\) reads "Ricochet", outcomes\.ricochet says "RICOCHET"/,
  'an upper binding wants capitals in en-US');
const missing = clone(glossary);
missing.groups.modes.drone.keys.push('no.such.key');
assert.match(glossaryDrift(missing, catalogs).join('\n'), /no\.such\.key \(en-US\) is bound to modes\.drone but the catalog has no such key/);
const conflict = clone(glossary);
conflict.groups.modes.drone.keys.push('playMenu.matchMode.ac130.label');
assert.match(glossaryDrift(conflict, catalogs).join('\n'), /playMenu\.matchMode\.ac130\.label \(en-US\) is bound to "Drone" \(modes\.drone\) and "AC-130" \(modes\.ac130\)/,
  'one key cannot carry two terms');
const rewritten = clone(drifted);
assert.ok(applyGlossary(glossary, rewritten) >= 1);
assert.equal(rewritten['zh-CN']['garage.battle.zoneLabel'], '区域控制', 'the sync writes the glossary back');

console.log(`glossary.selftest: ${glossaryPins(glossary).pins.length} bindings agree; modes, surfaces, ammunition (ERA 爆炸反应装甲, HE 高爆弹), outcomes, roles and ${moduleKeys.length} modules single-sourced; one zh name for Zone Control; drift fires`);
