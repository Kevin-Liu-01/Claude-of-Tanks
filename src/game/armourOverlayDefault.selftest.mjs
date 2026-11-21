#!/usr/bin/env node
// armourOverlayDefault.selftest.mjs — armour colours on for everyone, once, with a one-time tip (273). Copyright © 2026
// Kevin B. Liu.
//
// Holds:
//  1. the flip (game/armourOverlayDefault.ts armourDefaultFlip): a new profile is on by the default and gets its tip; a
//     profile saved off before the flip is turned on and saved so; one already on only gets its tip; once the marker is
//     written nothing changes again, so a later "off" sticks;
//  2. the tip (armourTipDue): due once while the marker says 'tip' and the colours are on; skipped (and done) when they
//     were turned off before the next battle; nothing once done;
//  3. the wiring: input.ts runs the flip after the stored record is applied and before any later save, with the default
//     on; main.ts shows the tip at a rollout the player drives (never a watched or couch battle), marks it done first,
//     names the player's own key on a keyboard and the Settings row on a pad or touch layout, and loads the tip's module
//     only then; the tip's strings are in en-US and zh-CN and name the feature as Settings does.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARMOUR_DEFAULT_KEY, armourDefaultFlip, armourTipDue, readArmourDefaultMarker, writeArmourDefaultMarker } from './armourOverlayDefault.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(resolve(ROOT, path), 'utf8');

// 1. The flip.
assert.deepEqual(armourDefaultFlip(null, false, true), { turnOn: false, saveSettings: false, marker: 'tip' }, 'a new profile: on by default, its tip due');
assert.deepEqual(armourDefaultFlip(null, true, false), { turnOn: true, saveSettings: true, marker: 'tip' }, 'saved off before the flip: turned on, saved, tip due');
assert.deepEqual(armourDefaultFlip(null, true, true), { turnOn: false, saveSettings: false, marker: 'tip' }, 'already on: only the tip');
for (const marker of ['tip', 'done']) {
  assert.deepEqual(armourDefaultFlip(marker, true, false), { turnOn: false, saveSettings: false, marker: null }, `marker ${marker}: off sticks`);
}
const store = new Map();
const storage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => { store.set(key, value); } };
assert.equal(readArmourDefaultMarker(storage), null);
writeArmourDefaultMarker('tip', storage);
assert.equal(store.get(ARMOUR_DEFAULT_KEY), 'tip');
assert.equal(readArmourDefaultMarker(storage), 'tip');
store.set(ARMOUR_DEFAULT_KEY, 'junk');
assert.equal(readArmourDefaultMarker(storage), null, 'an unknown value reads as not run');
assert.equal(readArmourDefaultMarker(null), null, 'no storage: not run (the flip runs, harmlessly, each load)');

// 2. The tip.
assert.equal(armourTipDue('tip', true), 'show');
assert.equal(armourTipDue('tip', false), 'skip', 'turned off before the battle: nothing to tell');
assert.equal(armourTipDue('done', true), 'none');
assert.equal(armourTipDue(null, true), 'none');

// 3. The wiring.
const input = read('src/game/input.ts');
assert.match(input, /armorAimOverlay: true,/, 'the default is on');
const applied = input.indexOf('applyStoredSettings(settings, storedSettings);');
const flip = input.indexOf('armourDefaultFlip(readArmourDefaultMarker()');
const firstLaterSave = input.indexOf('saveJson(SETTINGS_KEY', input.indexOf('// item 259'));
assert.ok(applied > 0 && flip > applied, 'the flip runs on the applied record');
assert.ok(firstLaterSave < 0 || flip < firstLaterSave, 'and before any later save of it');
const main = read('src/main.ts');
const hook = main.slice(main.indexOf('armourTipDue('), main.indexOf("import('./ui/armourOverlayTip.ts')") + 200);
assert.match(main, /if \(game\.watch \|\| game\.couch \|\| game\.phase !== 'battle'\) return;/, 'never a watched or couch battle');
// (274) a battle the tutorial teaches leaves the tip to the tutorial's armour step, which marks it done
assert.match(main, /if \(document\.body\.classList\.contains\('cot-tutorial'\)\) return;\s*const due = armourTipDue/, 'the tutorial teaches it instead');
assert.match(main, /taught: \(subject\) => \{ if \(subject === 'armourColours'\) writeArmourDefaultMarker\('done'\); \}/, 'the tutorial\'s step marks the tip done');
assert.ok(hook.indexOf("writeArmourDefaultMarker('done')") < hook.indexOf("import('./ui/armourOverlayTip.ts')"), 'marked done before it shows: once');
assert.match(hook, /input\.getBinding\('hitboxOverlay'\)/, 'a keyboard reads its own key');
assert.doesNotMatch(main.slice(0, main.indexOf('armourTipDue(')), /from '\.\/ui\/armourOverlayTip\.ts'/, 'the tip module is never on the boot path');
const tip = read('src/ui/armourOverlayTip.ts');
assert.match(tip, /t\('settings\.interface\.armorOverlay'\)/, 'the tip names the feature as Settings does');
assert.match(tip, /from '\.\.\/game\/armorShadeColors\.ts'/, 'the tip draws the overlay\'s own colours');
assert.doesNotMatch(tip, /from 'three'/, 'the tip\'s chunk never loads three.js');
const en = JSON.parse(read('src/ui/i18nCatalog.en-US.json'));
const zh = JSON.parse(read('src/ui/i18nCatalog.zh-CN.json'));
// (mobile-hud-274) the short tip: its line, the colours' meaning (with the key where there is one), and where Settings turns
// it off as its picture's label
for (const [key, holder] of [['hud.tip.armorOverlayOn.text', null], ['hud.tip.armorOverlayOn.detailKey', 'key'], ['hud.tip.armorOverlayOn.detailSettings', 'path'],
  ['hud.tip.armorOverlayOn.legend', null]]) {
  for (const catalog of [en, zh]) {
    assert.ok(catalog[key], `${key} in both locales`);
    if (holder) assert.ok(catalog[key].includes(`{${holder}}`), `${key} names {${holder}}`);
  }
}

console.log('armourOverlayDefault.selftest: PASS (the flip runs once and a later off sticks; the tip shows once, on a battle the player drives)');
