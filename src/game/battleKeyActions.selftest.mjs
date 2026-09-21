import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_BINDINGS } from './input.ts';
import { createBus } from './stateCore.ts';
import { createMobileAutoAimRuntime } from './mobileAutoAimRuntime.ts';
import { PerspectiveCamera, Vector3 } from 'three';

// Round 30 (owner 2026-09-20): "make auto aim a keybind in desktop mode and keybind turning on hitboxes too";
// "the gravity jump should have a little rocket icon and be a lot more powerful, and work even when you're not
// on ground. and make it easier to press in mobile."
const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

// --- bindings: T locks the sight, H flips the armour overlay; neither collides with an existing default
assert.equal(DEFAULT_BINDINGS.autoAim, 'KeyT');
assert.equal(DEFAULT_BINDINGS.hitboxOverlay, 'KeyH');
const codes = Object.values(DEFAULT_BINDINGS);
assert.equal(new Set(codes).size, codes.length, 'every default binding is unique');
const input = read('./input.ts');
assert.match(input, /\{ id: 'autoAim', label: 'action.autoAim', group: 'settings.group.combat' \}/, 'auto-aim is a rebindable combat action');
assert.match(input, /\{ id: 'hitboxOverlay', label: 'action.hitboxOverlay', group: 'settings.group.combat' \}/, 'the armour overlay is a rebindable combat action');
for (const catalog of ['../ui/i18nCatalog.en-US.json', '../ui/i18nCatalog.zh-CN.json']) {
  const text = JSON.parse(read(catalog));
  for (const key of ['action.autoAim', 'action.hitboxOverlay', 'hud.alert.armorOverlayOn', 'hud.alert.armorOverlayOff', 'touch.jump', 'touch.jumpAria']) {
    assert.ok(typeof text[key] === 'string' && text[key].length > 0, `${catalog}: ${key}`);
  }
}
const icons = read('../ui/settingsIcons.ts');
assert.match(icons, /autoAim: \{ id: 'autoAim'/, 'the settings panel has an icon for the auto-aim action');
assert.match(icons, /hitboxOverlay: \{ id: 'armorFlashlight' \}/, 'the overlay action reuses the armour flashlight icon');

// --- the key presses reach the battle: the auto-aim toggle and the overlay setting flip
const actions = read('./playerBattleActions.ts');
assert.match(actions, /onAction\('autoAim', \(\) => \{\n\s*if \(!battleInputAllowed\(\)\) return;\n\s*bus\.emit\('ui:autoAimToggle', \{\}\);/, 'T emits the same toggle the touch button does');
assert.match(actions, /onAction\('hitboxOverlay', \(\) => \{[\s\S]*?const on = !input\.getSettings\(\)\.armorAimOverlay;\n\s*input\.setSetting\('armorAimOverlay', on\);\n\s*bus\.emit\('ui:armorOverlayState', \{ on \}\);/, 'H flips the live armour overlay setting and announces it');
const hud = read('../ui/hud.ts');
assert.match(hud, /on\('ui:armorOverlayState', \(\{ on \}\) => \{\n\s*showAlert\(t\(on \? 'hud\.alert\.armorOverlayOn' : 'hud\.alert\.armorOverlayOff'\)/, 'the HUD confirms the overlay state');

// --- the auto-aim runtime no longer needs a touch layout (the runtime receipt covers acquisition)
const runtimeSource = read('./mobileAutoAimRuntime.ts');
assert.doesNotMatch(runtimeSource, /!input\.isTouchLayout\(\)/, 'the layout no longer gates the lock');
const access = read('./mobileBattleInputAccess.ts');
assert.match(access, /if \(!input\.isTouchLayout\(\)\) return autoAim \? Promise\.resolve\(null\) : ensureAutoAim\(\)\.then\(\(\) => null\);/,
  'a desktop layout loads the auto-aim runtime and no touch controls');
{
  const bus = createBus(); const enemy = { id: 'e', team: 'b', state: { pos: new Vector3(0, 0, 10) }, spec: { name: 'E', dims: { heightM: 2 } }, combat: { destroyed: false } };
  const player = { id: 'p', team: 'a', state: { pos: new Vector3() }, spec: { name: 'P', dims: { heightM: 2 } }, combat: { destroyed: false } };
  const runtime = createMobileAutoAimRuntime({ bus, input: { isTouchLayout: () => false }, camera: new PerspectiveCamera(), getPhase: () => 'battle', getTanks: () => [player, enemy], getPlayer: () => player, getTankById: (id) => (id === 'e' ? enemy : player), isVisible: () => true, pickTarget: () => enemy, targetCenter: (tank, out) => out.copy(tank.state.pos) });
  bus.emit('ui:autoAimToggle', {});
  assert.equal(runtime.targetId, 'e', 'a fine-pointer layout acquires the lock');
  runtime.dispose();
}

// --- the rocket jump: HUD keycap carries the rocket, the touch layer gets a rocket button, both driven by the ruleset
assert.match(hud, /jumpHint\.innerHTML = `<span class="si">\$\{uiIconSVG\('rocket', 18\)\}<\/span><span class="sl"><\/span><span class="sk">F<\/span>`;/, 'the jump keycap shows a rocket');
assert.match(hud, /jumpHint\.classList\.toggle\('on', ruleset\?\.jumpMps != null\);\n\s*\/\/ round 30[^\n]*\n\s*bus\.emit\('ui:jumpAvailable', \{ on: ruleset\?\.jumpMps != null \}\);/, 'the HUD tells the touch layer when a ruleset has a jump');
const touch = read('../ui/touchControls.ts');
assert.match(touch, /<button class="round jump" type="button" aria-label="\$\{t\('touch\.jumpAria'\)\}" hidden>\$\{ROCKET\}/, 'a hidden rocket button waits in the touch layer');
assert.match(touch, /bus\.on\('ui:jumpAvailable', \(payload\) => \{\n\s*const \{ on \} = payload as \{ on\?: boolean \};\n\s*jumpButton\.hidden = !on;/, 'it appears in rulesets with a jump');
assert.match(touch, /jumpButton\.addEventListener\('pointerdown', \(e\) => \{\n\s*e\.preventDefault\(\); e\.stopPropagation\(\);\n\s*bus\.emit\('ui:selfRight', \{\}\);/, 'a press is the same edge as the F key: jump upright, flip when overturned');
assert.match(touch, /\.cot-touch \.jump\{right:134px;bottom:124px;width:84px;height:84px;/, 'the rocket button is as big as the fire button family, above the scope');
const uiIcons = read('../ui/uiIcons.ts');
assert.match(uiIcons, /\n  rocket: '<path d="M12 2\.5c2\.9 1\.6/, 'the shared icon set has a rocket glyph');
console.log('battleKeyActions.selftest: T auto-aim and H armour overlay bindings, desktop auto-aim runtime, rocket jump keycap and touch button');
